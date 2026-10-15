// Settings Step S3 (Settings_Integrations_Plan.md 6.1 to 6.3): the site's half of a second
// storage provider and the move engine. The database half, with the access rules, is
// supabase/tests/storage_move_rules.sql. Here a fake S3 service (which checks every request's
// Signature Version 4), a fake Drive and an in-memory model of the move functions stand in for
// the real ones, so the copy, verify, switch, resume and failure paths run without a network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Md5, md5Hex, md5OfDigests } from '../src/lib/storage/md5.ts';
import { createS3, joinCredentials, parseCredentials, s3Probe, s3Storage, signRequest } from '../src/lib/storage/s3.ts';
import { runBatch } from '../src/lib/storage/move.ts';
import { StorageError } from '../src/lib/storage/provider.ts';
import {
  COMING_PROVIDERS,
  EVENT_AR,
  FAIL_REASON_AR,
  MOVE_ITEM_AR,
  MOVE_STATE_AR,
  SKIP_REASON_AR,
  durationAr,
  eventLine,
  estimateSeconds,
  moveError,
  moveProgress,
  moveScopeAr,
} from '../src/lib/integrations/rules.ts';

const migration = readFileSync(new URL('../supabase/migrations/20261015140000_storage_move_engine.sql', import.meta.url), 'utf8');
const release = readFileSync(new URL('../supabase/migrations/20261015140100_storage_move_release.sql', import.meta.url), 'utf8');
const nodeMd5 = (b) => createHash('md5').update(b).digest('hex');

// ---------------------------------------------------------------------------
// md5 and Signature Version 4
// ---------------------------------------------------------------------------
test('md5 agrees with the platform for every length around the block edges, and its state survives a round trip', () => {
  for (const n of [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000, 65537]) {
    const b = randomBytes(n);
    assert.equal(md5Hex(b), nodeMd5(b), `whole ${n}`);
    let m = new Md5();
    for (let at = 0; at < n; ) {
      const k = Math.min(n - at, 1 + Math.floor(Math.random() * 100));
      m.update(b.subarray(at, at + k));
      at += k;
      m = Md5.from(JSON.parse(JSON.stringify(m.state())));
    }
    assert.equal(m.digest(), nodeMd5(b), `split ${n}`);
  }
  assert.throws(() => Md5.from({ h: [0, 0, 0, 0], len: 10, tail: '00' }), /MD5_STATE_INVALID/);
  const a = randomBytes(300);
  const b = randomBytes(300);
  assert.equal(md5OfDigests([nodeMd5(a), nodeMd5(b)]), nodeMd5(Buffer.concat([createHash('md5').update(a).digest(), createHash('md5').update(b).digest()])));
});

test('the signature is the one AWS publishes for its GET Object example', () => {
  const h = signRequest({
    method: 'GET',
    url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
    headers: { range: 'bytes=0-9' },
    payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    region: 'us-east-1',
    credentials: { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' },
    amzDate: '20130524T000000Z',
  });
  assert.equal(
    h.Authorization,
    'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
  );
});

test('a key pair is kept as one secret and split on the first colon', () => {
  const pair = { accessKeyId: 'AKIA12345', secretAccessKey: 'ab/c+d:e=f' };
  assert.deepEqual(parseCredentials(joinCredentials(pair)), pair);
  assert.equal(parseCredentials(''), null);
  assert.equal(parseCredentials('nocolon'), null);
  assert.equal(parseCredentials(':x'), null);
});

// ---------------------------------------------------------------------------
// A fake S3 that verifies signatures
// ---------------------------------------------------------------------------
const CFG = { endpoint: 'https://s3.test.example/storage/v1/s3', bucket: 'hub-files', region: 'eu-test-1', prefix: 'hub', pathStyle: true };
const CREDS = { accessKeyId: 'AKIATESTKEY', secretAccessKey: 'secret/for+tests' };

function fakeS3(opts = {}) {
  const objects = new Map(); // key -> { bytes, mime, etag }
  const uploads = new Map(); // id -> { key, mime, parts: Map(n -> {bytes, md5}) }
  const log = [];
  let counter = 0;
  const base = new URL(CFG.endpoint);

  const verify = (req, url, body) => {
    const auth = req.headers.get('authorization') ?? '';
    const m = /SignedHeaders=([^,]+), Signature=([0-9a-f]+)/.exec(auth);
    if (!m) return false;
    const headers = {};
    for (const name of m[1].split(';')) if (!['host', 'x-amz-date', 'x-amz-content-sha256'].includes(name)) headers[name] = req.headers.get(name) ?? '';
    const again = signRequest({
      method: req.method,
      url,
      headers,
      payloadHash: createHash('sha256').update(body).digest('hex'),
      region: CFG.region,
      credentials: CREDS,
      amzDate: req.headers.get('x-amz-date'),
    });
    return again.Authorization === auth && req.headers.get('x-amz-content-sha256') === createHash('sha256').update(body).digest('hex');
  };
  const xmlHeaders = { 'content-type': 'application/xml' };

  const fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.href);
    const req = new Request(url, { method: init.method, headers: init.headers, body: init.body });
    const body = new Uint8Array(await req.arrayBuffer());
    log.push(`${req.method} ${url.pathname}${url.search}`);
    if (url.host !== base.host) return new Response('wrong host', { status: 400 });
    if (!verify(req, url, body)) return new Response('<Error><Code>SignatureDoesNotMatch</Code></Error>', { status: 403 });
    if (opts.refuse) return new Response('<Error><Code>AccessDenied</Code></Error>', { status: 403 });
    const root = `${base.pathname}/${CFG.bucket}`;
    if (!url.pathname.startsWith(root)) return new Response('', { status: 404 });
    const key = decodeURIComponent(url.pathname.slice(root.length + 1));
    const q = url.searchParams;
    if (req.method === 'HEAD' && key === '') return new Response(null, { status: 200 });
    if (req.method === 'HEAD') {
      const o = objects.get(key);
      if (!o) return new Response(null, { status: 404 });
      return new Response(null, { status: 200, headers: { 'content-length': String(o.bytes.length), etag: `"${o.etag}"`, 'content-type': o.mime } });
    }
    if (req.method === 'GET') {
      const o = objects.get(key);
      if (!o) return new Response('<Error><Code>NoSuchKey</Code></Error>', { status: 404 });
      const r = /bytes=(\d+)-(\d+)/.exec(req.headers.get('range') ?? '');
      if (r) {
        const part = o.bytes.subarray(Number(r[1]), Number(r[2]) + 1);
        return new Response(part, { status: 206, headers: { 'content-length': String(part.length), etag: `"${o.etag}"` } });
      }
      return new Response(o.bytes, { status: 200, headers: { 'content-length': String(o.bytes.length), etag: `"${o.etag}"` } });
    }
    if (req.method === 'DELETE') {
      if (q.has('uploadId')) uploads.delete(q.get('uploadId'));
      else objects.delete(key);
      return new Response(null, { status: 204 });
    }
    if (req.method === 'POST' && q.has('uploads')) {
      const id = `up-${++counter}`;
      uploads.set(id, { key, mime: req.headers.get('content-type') ?? '', parts: new Map() });
      return new Response(`<InitiateMultipartUploadResult><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`, { status: 200, headers: xmlHeaders });
    }
    if (req.method === 'POST' && q.has('uploadId')) {
      const up = uploads.get(q.get('uploadId'));
      if (!up) return new Response('<Error><Code>NoSuchUpload</Code></Error>', { status: 404 });
      const listed = [...new TextDecoder().decode(body).matchAll(/<PartNumber>(\d+)<\/PartNumber><ETag>"([0-9a-f]+)"<\/ETag>/g)].map((x) => ({ n: Number(x[1]), etag: x[2] }));
      const chunks = [];
      for (const p of listed) {
        const got = up.parts.get(p.n);
        if (!got || got.md5 !== p.etag) return new Response('<Error><Code>InvalidPart</Code></Error>', { status: 400 });
        chunks.push(got.bytes);
      }
      const all = Buffer.concat(chunks);
      const etag = `${md5OfDigests(listed.map((p) => p.etag))}-${listed.length}`;
      objects.set(up.key, { bytes: new Uint8Array(all), mime: up.mime, etag });
      uploads.delete(q.get('uploadId'));
      return new Response(`<CompleteMultipartUploadResult><ETag>&quot;${etag}&quot;</ETag></CompleteMultipartUploadResult>`, { status: 200, headers: xmlHeaders });
    }
    if (req.method === 'PUT') {
      const copy = req.headers.get('x-amz-copy-source');
      let bytes = body;
      let mime = req.headers.get('content-type') ?? 'application/octet-stream';
      if (copy) {
        const from = decodeURIComponent(copy).replace(`/${CFG.bucket}/`, '');
        const src = objects.get(from);
        if (!src) return new Response('<Error><Code>NoSuchKey</Code></Error>', { status: 404 });
        const r = /bytes=(\d+)-(\d+)/.exec(req.headers.get('x-amz-copy-source-range') ?? '');
        bytes = r ? src.bytes.subarray(Number(r[1]), Number(r[2]) + 1) : src.bytes;
        mime = src.mime;
      }
      if (q.has('uploadId')) {
        const up = uploads.get(q.get('uploadId'));
        if (!up) return new Response('<Error><Code>NoSuchUpload</Code></Error>', { status: 404 });
        const md5 = nodeMd5(bytes);
        up.parts.set(Number(q.get('partNumber')), { bytes: new Uint8Array(bytes), md5 });
        if (copy) return new Response(`<CopyPartResult><ETag>&quot;${md5}&quot;</ETag></CopyPartResult>`, { status: 200, headers: xmlHeaders });
        return new Response(null, { status: 200, headers: { etag: `"${opts.badEtag ? 'f'.repeat(32) : md5}"` } });
      }
      const etag = nodeMd5(bytes);
      objects.set(key, { bytes: new Uint8Array(bytes), mime, etag });
      if (copy) return new Response(`<CopyObjectResult><ETag>&quot;${etag}&quot;</ETag></CopyObjectResult>`, { status: 200, headers: xmlHeaders });
      return new Response(null, { status: 200, headers: { etag: `"${etag}"` } });
    }
    return new Response('', { status: 405 });
  };
  return { fetch, objects, uploads, log };
}

test('the S3 client signs every request, writes small and large objects, and reads ranges', async () => {
  const s3 = fakeS3();
  const p = s3Storage(CFG, CREDS, { fetch: s3.fetch });
  assert.equal(p.type, 's3_compatible');
  assert.equal(await p.account(), 'hub-files@s3.test.example');

  const sink = p.sink();
  const small = randomBytes(3000);
  let st = await sink.begin({ key: 'library/a', name: 'a', mimeType: 'image/png', size: small.length });
  st = await sink.put(st, 0, small, true);
  const done = await sink.finish(st);
  assert.deepEqual({ ref: done.ref, size: done.size, remote: done.remoteChecksum }, { ref: 'hub/library/a', size: 3000, remote: nodeMd5(small) });
  assert.equal(sink.expectedRemote(st, nodeMd5(small)), nodeMd5(small));

  const big = randomBytes(sink.partSize * 2 + 4321);
  let b = await sink.begin({ key: 'library/b', name: 'b', mimeType: 'video/mp4', size: big.length });
  for (let at = 0; at < big.length; at += sink.partSize) b = await sink.put(b, at, big.subarray(at, at + sink.partSize), at + sink.partSize >= big.length);
  const fin = await sink.finish(b);
  const expected = sink.expectedRemote(b, nodeMd5(big));
  assert.match(expected, /^[0-9a-f]{32}-3$/);
  assert.equal(fin.remoteChecksum, expected, 'the composite ETag the store made is the one computed from the parts');
  assert.equal(await p.checksum(fin.ref), expected);
  assert.deepEqual(await p.check(fin.ref, big.length), { state: 'ok', size: big.length });
  assert.deepEqual(await p.check(fin.ref, big.length + 1), { state: 'failed', size: big.length });
  assert.deepEqual(await p.check('hub/library/none', 1), { state: 'missing', size: null });

  const res = await p.open(fin.ref, 'bytes=10-19');
  assert.equal(res.status, 206);
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), Buffer.from(big.subarray(10, 20)));

  // Trash is a copy under _trash and a delete of the original: nothing is removed for good.
  await p.trash('hub/library/a');
  assert.equal(s3.objects.has('hub/library/a'), false);
  assert.deepEqual(Buffer.from(s3.objects.get('_trash/hub/library/a').bytes), small);
  await p.trash('hub/library/a'); // already gone: not an error
});

test('a store that refuses the key is reported as forbidden, and the batch is told to stop, not to fail files', async () => {
  const p = s3Storage(CFG, CREDS, { fetch: fakeS3({ refuse: true }).fetch });
  await assert.rejects(p.check('x', 1), (e) => e instanceof StorageError && e.status === 503);
  assert.deepEqual(await s3Probe(CFG, CREDS, { fetch: fakeS3({ refuse: true }).fetch }), { ok: false, error: 'S3_FORBIDDEN' });
  const ok = await s3Probe(CFG, CREDS, { fetch: fakeS3().fetch });
  assert.deepEqual(ok, { ok: true, account: 'hub-files@s3.test.example' });
  const wrong = await s3Probe(CFG, { ...CREDS, secretAccessKey: 'other' }, { fetch: fakeS3().fetch });
  assert.equal(wrong.ok, false, 'a wrong secret is refused by the signature');
});

test('virtual-hosted addressing puts the bucket in the host', () => {
  const c = createS3({ ...CFG, pathStyle: false, endpoint: 'https://s3.example.org' }, CREDS);
  assert.equal(c.urlFor('a b/c.txt').href, 'https://hub-files.s3.example.org/a%20b/c.txt');
  assert.equal(createS3(CFG, CREDS).urlFor('a b/c').href, 'https://s3.test.example/storage/v1/s3/hub-files/a%20b/c');
});

// ---------------------------------------------------------------------------
// A fake Drive provider with a resumable sink
// ---------------------------------------------------------------------------
function fakeDrive(opts = {}) {
  const files = new Map(); // id -> { bytes, name, parent, trashed, mime }
  let n = 0;
  const parts = opts.partSize ?? 4096;
  const calls = { put: 0, begin: 0 };
  const range = (b, h) => {
    const r = /bytes=(\d+)-(\d+)/.exec(h ?? '');
    return r ? b.subarray(Number(r[1]), Number(r[2]) + 1) : b;
  };
  const p = {
    type: 'google_drive',
    files,
    calls,
    add(bytes, name = 'f', mime = 'image/png') {
      const id = `drv-${++n}`;
      files.set(id, { bytes: new Uint8Array(bytes), name, parent: null, trashed: false, mime });
      return id;
    },
    rootFolder: async () => 'root',
    startUpload: async () => 'x',
    createFolder: async () => 'f',
    rename: async () => {},
    move: async () => {},
    async trash(ref) {
      const f = files.get(ref);
      if (!f) throw new StorageError(404, 'DRIVE_404');
      f.trashed = true;
    },
    async info(ref) {
      const f = files.get(ref);
      if (!f) throw new StorageError(404, 'DRIVE_404');
      return { id: ref, name: f.name, mimeType: f.mime, size: String(f.bytes.length), trashed: f.trashed };
    },
    async open(ref, h) {
      if (opts.down) throw new StorageError(503, 'DRIVE_NOT_CONFIGURED');
      const f = files.get(ref);
      if (!f) return new Response('', { status: 404 });
      const part = range(f.bytes, h);
      return new Response(part, { status: h ? 206 : 200, headers: { 'content-length': String(part.length) } });
    },
    async checksum(ref) {
      const f = files.get(ref);
      if (!f) throw new StorageError(404, 'DRIVE_404');
      return opts.lie && opts.lie.has(ref) ? 'a'.repeat(32) : nodeMd5(f.bytes);
    },
    async check(ref, size) {
      const f = files.get(ref);
      if (!f || f.trashed) return { state: 'missing', size: null };
      if (size != null && f.bytes.length !== size) return { state: 'failed', size: f.bytes.length };
      return { state: 'ok', size: f.bytes.length };
    },
    account: async () => 'hub@example.com',
    quota: async () => ({ used: 1, total: null }),
    sink() {
      return {
        partSize: parts,
        async begin(t) {
          calls.begin++;
          const id = `drv-${++n}`;
          files.set(id, { bytes: new Uint8Array(0), name: t.name, parent: t.parentId ?? 'root', trashed: false, mime: t.mimeType, expected: t.size, building: true });
          return { kind: 'drive', id, size: t.size, offset: 0 };
        },
        async resume(state) {
          const f = files.get(state.id);
          if (!f) throw new StorageError(410, 'SESSION_EXPIRED');
          return { state, offset: f.bytes.length };
        },
        async put(state, offset, bytes) {
          calls.put++;
          const f = files.get(state.id);
          if (f.bytes.length !== offset) throw new StorageError(416, 'DRIVE_416');
          f.bytes = Buffer.concat([f.bytes, bytes]);
          return state;
        },
        async finish(state) {
          const f = files.get(state.id);
          return { ref: state.id, size: f.bytes.length, remoteChecksum: nodeMd5(f.bytes) };
        },
        async abort(state) {
          files.delete(state.id);
        },
        expectedRemote: (_s, whole) => whole,
      };
    },
  };
  return p;
}

// ---------------------------------------------------------------------------
// An in-memory model of the move functions (the real ones are SQL: storage_move_rules.sql)
// ---------------------------------------------------------------------------
const KEY = 'k-test';
function fakeDb({ providers, mode = 'move', items }) {
  const locs = new Map();
  let seq = 0;
  const loc = (o) => {
    const l = { id: `loc-${++seq}`, state: 'ok', role: 'primary', checksum: null, remote_checksum: null, verified: null, ...o };
    locs.set(l.id, l);
    return l;
  };
  const move = { id: 'mv-1', state: 'running', mode, source: providers.source, dest: providers.dest };
  const its = items.map((it, i) => {
    const sl = loc({ integration_id: move.source.id, subject_kind: 'media_version', subject_id: it.subject, ref: it.ref, size: it.size, checksum: it.checksum ?? null, remote_checksum: it.remote ?? null });
    return { id: `it-${i + 1}`, state: 'pending', kind: 'media_version', subject: it.subject, approved: Boolean(it.approved), size: it.size, attempts: 0, progress: null, source_loc: sl.id, dest_loc: null, leased: false, reason: null, name: it.name ?? `n${i}`, mime: it.mime ?? 'image/png', parent: it.parent ?? null };
  });
  const rpcLog = [];
  const err = (m) => ({ data: null, error: { message: m } });
  const itemOf = (id) => its.find((x) => x.id === id);
  const settle = () => {
    const open = its.some((i) => ['pending', 'copying', 'copied'].includes(i.state) || (i.state === 'verified' && move.mode === 'move'));
    if (!open && move.state === 'running') move.state = 'completed';
  };
  const handlers = {
    storage_move_claim(a) {
      for (const i of its) if (['pending', 'copying'].includes(i.state) && !(locs.get(i.source_loc)?.role === 'primary')) i.state = 'skipped';
      settle();
      if (move.state !== 'running') return { data: { state: move.state, items: [] }, error: null };
      const pick = its.filter((i) => (['pending', 'copying', 'copied'].includes(i.state) || (i.state === 'verified' && move.mode === 'move')) && !i.leased).slice(0, a.p_limit);
      for (const i of pick) i.leased = true;
      const out = pick.map((i) => {
        const sl = locs.get(i.source_loc);
        const dl = [...locs.values()].find((l) => l.integration_id === move.dest.id && l.subject_id === i.subject && l.state !== 'retired');
        return {
          id: i.id, state: i.state, kind: i.kind, subject: i.subject, approved: i.approved, size: i.size, attempts: i.attempts, progress: i.progress,
          source_ref: sl.ref, source_checksum: sl.checksum, source_remote: sl.remote_checksum, name: i.name, mime: i.mime, parent: i.parent,
          dest_location: dl ? { id: dl.id, ref: dl.ref, state: dl.state, size: dl.size, checksum: dl.checksum, remote_checksum: dl.remote_checksum } : null,
        };
      });
      return { data: { state: move.state, mode: move.mode, source: move.source, dest: move.dest, items: out }, error: null };
    },
    storage_move_progress(a) {
      const i = itemOf(a.p_item);
      if (!['pending', 'copying'].includes(i.state)) return { data: null, error: null };
      i.progress = a.p_progress;
      i.bytes_done = a.p_bytes;
      i.state = 'copying';
      i.leased = true;
      return { data: null, error: null };
    },
    storage_move_release(a) {
      itemOf(a.p_item).leased = false;
      return { data: null, error: null };
    },
    storage_move_copied(a) {
      const i = itemOf(a.p_item);
      if (!['pending', 'copying'].includes(i.state)) return err('MOVE_BAD_STATE');
      if (!/^[0-9a-f]{32}$/.test(a.p_checksum)) return err('MOVE_BAD_RECORD');
      const sl = locs.get(i.source_loc);
      if (sl.checksum && sl.checksum !== a.p_checksum) return err('CHECKSUM_CONFLICT');
      sl.checksum ??= a.p_checksum;
      const dl = loc({ integration_id: move.dest.id, subject_kind: i.kind, subject_id: i.subject, ref: a.p_ref, role: 'replica', state: 'pending', size: a.p_size, checksum: a.p_checksum, remote_checksum: a.p_remote });
      i.dest_loc = dl.id;
      i.state = 'copied';
      i.progress = null;
      i.leased = false;
      return { data: null, error: null };
    },
    storage_move_attach(a) {
      const i = itemOf(a.p_item);
      const dl = locs.get(a.p_location);
      if (i.state !== 'pending' || !dl || dl.state !== 'ok' || dl.role === 'primary' || !dl.checksum) return err('MOVE_BAD_RECORD');
      i.dest_loc = dl.id;
      i.state = 'copied';
      i.leased = false;
      return { data: null, error: null };
    },
    storage_move_verified(a) {
      const i = itemOf(a.p_item);
      if (i.state !== 'copied') return err('MOVE_BAD_STATE');
      let ok = a.p_ok;
      let reason = a.p_error;
      if (ok && i.approved && a.p_level !== 'checksum') {
        ok = false;
        reason = 'APPROVED_NEEDS_CHECKSUM';
      }
      const dl = locs.get(i.dest_loc);
      if (ok) {
        dl.state = 'ok';
        dl.verified = true;
        i.state = 'verified';
        i.level = a.p_level;
      } else {
        dl.state = 'failed';
        i.state = 'failed';
        i.reason = reason;
      }
      i.leased = false;
      settle();
      return { data: null, error: null };
    },
    storage_move_switch(a) {
      const i = itemOf(a.p_item);
      if (i.state !== 'verified' || move.mode !== 'move') return err('MOVE_BAD_STATE');
      const dl = locs.get(i.dest_loc);
      if (dl.state !== 'ok' || !dl.verified || !dl.checksum) return err('MOVE_NOT_VERIFIED');
      locs.get(i.source_loc).role = 'replica';
      dl.role = 'primary';
      i.state = 'switched';
      i.leased = false;
      settle();
      return { data: null, error: null };
    },
    storage_move_fail(a) {
      const i = itemOf(a.p_item);
      i.attempts++;
      i.leased = false;
      i.reason = a.p_error;
      if (a.p_final || i.attempts >= 3) {
        i.state = 'failed';
        i.progress = null;
        const dl = i.dest_loc && locs.get(i.dest_loc);
        if (dl && dl.state === 'pending') dl.state = 'failed';
        settle();
      }
      return { data: null, error: null };
    },
  };
  const db = {
    locs,
    its,
    move,
    rpcLog,
    rpc(name, args) {
      rpcLog.push(name);
      if (args.p_key !== undefined && args.p_key !== KEY) return Promise.resolve(err('FORBIDDEN'));
      const h = handlers[name];
      if (!h) return Promise.resolve(err(`unknown ${name}`));
      return Promise.resolve(h(args));
    },
    addReplica(o) {
      return loc({ role: 'replica', ...o });
    },
    primaryOf: (subject) => [...locs.values()].find((l) => l.subject_id === subject && l.role === 'primary' && l.state !== 'retired'),
    replicasOf: (subject) => [...locs.values()].filter((l) => l.subject_id === subject && l.role === 'replica' && l.state !== 'retired'),
  };
  return db;
}

const INFO = { drive: { id: 'int-drive', type: 'google_drive', config: {} }, s3: { id: 'int-s3', type: 's3_compatible', config: { bucket: CFG.bucket } } };
const runAll = async (db, providerOf, o = {}) => {
  const results = [];
  for (let i = 0; i < 60; i++) {
    const r = await runBatch({ db, key: KEY, provider: async (p) => providerOf(p), ...o }, db.move.id);
    results.push(r);
    if (r.state !== 'running' || r.stopped || (r.claimed === 0 && !r.more)) break;
  }
  return results;
};

test('Drive to the second provider and back: copied in resumable parts, verified by checksum, switched, the source kept', async () => {
  const drive = fakeDrive({ partSize: 2048 });
  const s3 = fakeS3();
  const s3p = s3Storage(CFG, CREDS, { fetch: s3.fetch });
  const small = randomBytes(1500);
  const big = randomBytes(8 * 1024 * 1024 + 70001); // two S3 parts: the second is short
  const approved = randomBytes(5000);
  const a = drive.add(small, 'small.png');
  const b = drive.add(big, 'big.mp4', 'video/mp4');
  const c = drive.add(approved, 'approved.png');
  const db = fakeDb({
    providers: { source: INFO.drive, dest: INFO.s3 },
    items: [
      { subject: 'v-small', ref: a, size: small.length },
      { subject: 'v-big', ref: b, size: big.length },
      { subject: 'v-appr', ref: c, size: approved.length, approved: true },
    ],
  });
  const pick = (p) => (p.type === 'google_drive' ? drive : s3p);

  // A byte budget smaller than the big file: it needs several batches and resumes from saved state.
  const results = await runAll(db, pick, { maxBytes: 4 * 1024 * 1024 });
  assert.ok(results.length >= 2, `needed ${results.length} batches`);
  assert.equal(db.move.state, 'completed');
  assert.deepEqual(db.its.map((i) => i.state), ['switched', 'switched', 'switched']);
  assert.equal(db.its[2].level, 'checksum', 'the approved version was proven by checksum');

  for (const [subject, bytes] of [['v-small', small], ['v-big', big], ['v-appr', approved]]) {
    const primary = db.primaryOf(subject);
    assert.equal(primary.integration_id, 'int-s3');
    assert.equal(primary.state, 'ok');
    assert.equal(primary.checksum, nodeMd5(bytes), 'the recorded checksum is the content md5');
    assert.deepEqual(Buffer.from(s3.objects.get(primary.ref).bytes), Buffer.from(bytes));
    const [replica] = db.replicasOf(subject);
    assert.equal(replica.integration_id, 'int-drive', 'the source stays as a replica');
  }
  assert.match(db.primaryOf('v-big').remote_checksum, /^[0-9a-f]{32}-2$/);
  assert.ok(s3.uploads.size === 0, 'no upload is left open at the store');
  assert.ok(![...drive.files.values()].some((f) => f.trashed), 'nothing at Drive was trashed');
  assert.ok(db.rpcLog.includes('storage_move_release'), 'an item that ran out of budget was given back');

  // Back, while Drive still holds the replica: verified and switched without copying anything.
  const before = drive.calls.put;
  const s3loc = db.primaryOf('v-small');
  const second = fakeDb({
    providers: { source: INFO.s3, dest: INFO.drive },
    items: [{ subject: 'v-small', ref: s3loc.ref, size: small.length, checksum: s3loc.checksum, remote: s3loc.remote_checksum }],
  });
  second.addReplica({ integration_id: 'int-drive', subject_kind: 'media_version', subject_id: 'v-small', ref: a, size: small.length, checksum: nodeMd5(small) });
  await runAll(second, pick);
  assert.equal(second.its[0].state, 'switched');
  assert.equal(second.primaryOf('v-small').ref, a, 'the held Drive copy is the primary again');
  assert.equal(drive.calls.put, before, 'nothing was written to Drive');
  assert.ok(second.rpcLog.includes('storage_move_attach'));
});

test('back to Drive after the source was retired: a real copy into Drive, verified by Drive\'s own md5', async () => {
  const drive = fakeDrive({ partSize: 1024 });
  const s3 = fakeS3();
  const s3p = s3Storage(CFG, CREDS, { fetch: s3.fetch });
  const bytes = randomBytes(5000);
  // The file lives only at the second provider (its Drive copy was retired).
  const sink = s3p.sink();
  let st = await sink.begin({ key: 'library/v-x', name: 'x', mimeType: 'image/png', size: bytes.length });
  st = await sink.put(st, 0, bytes, true);
  const fin = await sink.finish(st);
  const db = fakeDb({
    providers: { source: INFO.s3, dest: INFO.drive },
    items: [{ subject: 'v-x', ref: fin.ref, size: bytes.length, checksum: nodeMd5(bytes), remote: fin.remoteChecksum, name: 'photo.png', parent: 'folder-9' }],
  });
  const pick = (p) => (p.type === 'google_drive' ? drive : s3p);
  await runAll(db, pick);
  assert.equal(db.its[0].state, 'switched');
  const primary = db.primaryOf('v-x');
  assert.equal(primary.integration_id, 'int-drive');
  const file = drive.files.get(primary.ref);
  assert.deepEqual(Buffer.from(file.bytes), Buffer.from(bytes));
  assert.equal(file.name, 'photo.png');
  assert.equal(file.parent, 'folder-9', 'it goes back into the library folder\'s Drive folder');
  assert.ok(drive.calls.put >= 5, 'written in several parts');
});

test('a source that changed while it was copied is not switched, and nothing is marked verified', async () => {
  const drive = fakeDrive({ partSize: 2048 });
  const s3 = fakeS3();
  const bytes = randomBytes(3000);
  const ref = drive.add(bytes);
  const liar = fakeDrive({ partSize: 2048, lie: new Set([ref]) });
  liar.files.set(ref, drive.files.get(ref));
  const db = fakeDb({ providers: { source: INFO.drive, dest: INFO.s3 }, items: [{ subject: 'v1', ref, size: bytes.length }] });
  await runAll(db, (p) => (p.type === 'google_drive' ? liar : s3Storage(CFG, CREDS, { fetch: s3.fetch })));
  assert.equal(db.its[0].state, 'failed');
  assert.equal(db.its[0].reason, 'SOURCE_CHANGED');
  assert.equal(db.primaryOf('v1').integration_id, 'int-drive', 'the primary never moved');
  assert.equal(db.replicasOf('v1').length, 0);
});

test('a destination that answers with the wrong ETag fails the file after three tries, and leaves the source primary', async () => {
  const drive = fakeDrive();
  const s3 = fakeS3({ badEtag: true });
  const bytes = randomBytes(20 * 1024 * 1024);
  const ref = drive.add(bytes);
  const db = fakeDb({ providers: { source: INFO.drive, dest: INFO.s3 }, items: [{ subject: 'v1', ref, size: bytes.length }] });
  await runAll(db, (p) => (p.type === 'google_drive' ? drive : s3Storage(CFG, CREDS, { fetch: s3.fetch })));
  assert.equal(db.its[0].state, 'failed');
  assert.match(db.its[0].reason, /S3_ETAG_MISMATCH/);
  assert.equal(db.its[0].attempts, 3);
  assert.equal(db.primaryOf('v1').integration_id, 'int-drive');
});

test('a provider that is down stops the batch without failing a single file', async () => {
  const drive = fakeDrive({ down: true });
  const s3 = fakeS3();
  const bytes = randomBytes(2000);
  const ref = drive.add(bytes);
  const db = fakeDb({ providers: { source: INFO.drive, dest: INFO.s3 }, items: [{ subject: 'v1', ref, size: bytes.length }] });
  const [r] = await runAll(db, (p) => (p.type === 'google_drive' ? drive : s3s(s3)));
  assert.equal(r.stopped, 'provider');
  assert.ok(['pending', 'copying'].includes(db.its[0].state), 'still to do, not failed');
  assert.equal(db.its[0].attempts, 0);
  assert.equal(db.its[0].leased, false, 'the lease is given back');
});
const s3s = (s3) => s3Storage(CFG, CREDS, { fetch: s3.fetch });

test('copy mode leaves the primary where it was and ends with verified replicas', async () => {
  const drive = fakeDrive();
  const s3 = fakeS3();
  const bytes = randomBytes(4000);
  const ref = drive.add(bytes);
  const db = fakeDb({ mode: 'copy', providers: { source: INFO.drive, dest: INFO.s3 }, items: [{ subject: 'v1', ref, size: bytes.length }] });
  await runAll(db, (p) => (p.type === 'google_drive' ? drive : s3s(s3)));
  assert.equal(db.its[0].state, 'verified');
  assert.equal(db.move.state, 'completed');
  assert.equal(db.primaryOf('v1').integration_id, 'int-drive');
  assert.equal(db.replicasOf('v1')[0].integration_id, 'int-s3');
});

test('a wrong server key is refused by every record function', async () => {
  const db = fakeDb({ providers: { source: INFO.drive, dest: INFO.s3 }, items: [] });
  await assert.rejects(runBatch({ db, key: 'wrong', provider: async () => fakeDrive() }, 'mv-1'), /FORBIDDEN/);
});

// ---------------------------------------------------------------------------
// What the database, the routes and the words must hold
// ---------------------------------------------------------------------------
const list = (src, re) => src.match(re)[1].match(/'([a-z_]+)'/g).map((x) => x.slice(1, -1));

test('every state the migration allows has an Arabic word, and every event kind has a line', () => {
  assert.deepEqual(list(migration, /state text not null default 'planned'\s+check \(state in \(([^)]+)\)/).sort(), Object.keys(MOVE_STATE_AR).sort());
  assert.deepEqual(
    list(migration, /state text not null default 'pending'\s+check \(state in \(([^)]+)\)/).sort(),
    Object.keys(MOVE_ITEM_AR).sort(),
  );
  for (const k of ['storage_move_planned', 'storage_move_started', 'storage_move_paused', 'storage_move_completed', 'storage_move_cancelled', 'storage_retired']) {
    assert.ok(EVENT_AR[k], k);
    assert.match(migration, new RegExp(`'${k}'`));
  }
  for (const reason of ['source_unhealthy', 'too_large', 'source_changed']) assert.ok(SKIP_REASON_AR[reason], reason);
  for (const code of migration.match(/raise exception '([A-Z_]+)'/g).map((x) => x.match(/'([A-Z_]+)'/)[1])) {
    if (code === 'FORBIDDEN' || code === 'INT_NOT_FOUND') continue;
    // Internal-only codes need no word; every user-reachable refusal does.
    if (['MOVE_BAD_RECORD', 'MOVE_NOT_VERIFIED', 'CHECKSUM_CONFLICT'].includes(code)) continue;
    assert.notEqual(moveError(code), moveError('unknown'), code);
  }
  assert.match(eventLine({ kind: 'storage_move_completed', integration: 'S3', data: { switched: 5, copied: 0, failed: 1, skipped: 2 } }), /5 حُوّل، 0 نُسخ فقط، 1 تعذّر، 2 تُخطّي/);
  assert.ok(FAIL_REASON_AR.SOURCE_CHANGED && FAIL_REASON_AR.APPROVED_NEEDS_CHECKSUM);
});

test('the new tables have no policy; every session function checks the right; the server-key ones check the key', () => {
  for (const t of ['storage_moves', 'storage_move_items']) assert.match(migration, new RegExp(`alter table public\\.${t} enable row level security;`));
  assert.doesNotMatch(migration, /create policy[^;]+storage_move/);
  const fns = [...migration.matchAll(/create (?:or replace )?function public\.(\w+)\([^)]*\)[\s\S]*?\n\$\$;/g)];
  const bodies = Object.fromEntries(fns.map((m) => [m[1], m[0]]));
  for (const name of ['storage_move_plan', 'storage_move_start', 'storage_move_pause', 'storage_move_cancel', 'storage_move_retry', 'storage_move_claim', 'storage_move_progress', 'storage_move_copied', 'storage_move_attach', 'storage_move_verified', 'storage_move_switch', 'storage_move_fail', 'storage_retire_claim', 'storage_retire_mark', 'storage_move_note'])
    assert.match(bodies[name], /has_capability\('storage\.migrate', null\)/, name);
  for (const name of ['storage_provider_save', 'storage_provider_remove']) assert.match(bodies[name], /has_capability\('storage\.manage', null\)/, name);
  for (const name of ['storage_move_claim', 'storage_move_progress', 'storage_move_copied', 'storage_move_attach', 'storage_move_verified', 'storage_move_switch', 'storage_move_fail', 'storage_retire_claim', 'storage_retire_mark', 'storage_move_note', 'storage_serving', 'int_secret_use_id', 'storage_provider_health'])
    assert.match(bodies[name], /mail_key_ok\(p_key\)/, name);
  assert.match(release, /mail_key_ok\(p_key\)/);
  // A switch needs a verified, checksummed copy; a retire needs the hold to be over and a verified primary elsewhere.
  assert.match(bodies.storage_move_switch, /dl\.state <> 'ok' or dl\.verified_at is null or dl\.checksum is null/);
  assert.match(bodies.storage_retire_mark, /m\.hold_until > now\(\)/);
  assert.match(bodies.storage_retire_mark, /p\.role = 'primary'\s+and p\.state = 'ok' and p\.verified_at is not null/);
  assert.match(bodies.storage_move_verified, /i\.approved and p_level <> 'checksum'/);
  // The engine never deletes a stored file: no delete from file_locations, no hard delete anywhere.
  assert.doesNotMatch(migration, /delete from public\.file_locations/);
  // The endpoint of a provider is https only and not a private address.
  assert.match(bodies.storage_provider_save, /\^https:\/\//);
  assert.match(bodies.storage_provider_save, /localhost\|\\\.local/);
});

test('the routes need the right, never return a secret, and the move route uses the engine', () => {
  const move = readFileSync('src/app/api/storage/move/route.ts', 'utf8');
  assert.match(move, /capGuard\(request, 'storage\.migrate', true\)/);
  assert.match(move, /runBatch\(\{ db, key, provider: providerFor \}, id\)/);
  assert.match(move, /storage_retire_claim/);
  assert.match(move, /export const maxDuration/);
  const prov = readFileSync('src/app/api/storage/provider/route.ts', 'utf8');
  assert.match(prov, /capGuard\(request, 'storage\.manage', true\)/);
  assert.match(prov, /storeChecked\(g\.db, id, \{ id \}/);
  assert.doesNotMatch(prov, /secretAccessKey[^;\n]*Response\.json|Response\.json\([^)]*secretAccessKey/);
  for (const f of ['src/app/api/storage/move/route.ts', 'src/app/api/storage/provider/route.ts', 'src/components/settings/storage.tsx', 'src/components/settings/storage-provider.tsx', 'src/components/settings/storage-move.tsx'])
    assert.doesNotMatch(readFileSync(f, 'utf8'), /secret_id|decrypted|int_secret_use|vaultSecret\(/, f);
  // The browser never gets a provider reference or a session address: the report has counts only.
  assert.doesNotMatch(migration.match(/create function public\.storage_move_report[\s\S]*?\n\$\$;/)[0], /\bref\b|progress/);
});

test('files are served through the file\'s own reference from wherever the live copy is', () => {
  for (const f of ['src/app/api/media/[id]/content/route.ts', 'src/app/api/chat/file/[id]/route.ts', 'src/app/api/mail/file/[id]/route.ts', 'src/app/r/[token]/route.ts', 'src/lib/mail/sync.ts'])
    assert.match(readFileSync(f, 'utf8'), /openStored\(/, f);
  const idx = readFileSync('src/lib/storage/index.ts', 'utf8');
  assert.match(idx, /storageServing\(ref\)/);
  assert.match(idx, /if \(!copies\.length\) return storageFor\(role\)\.open\(ref, range\)/, 'unknown to the database: the old behaviour');
  const del = readFileSync('src/app/api/media/[id]/route.ts', 'utf8');
  assert.match(del, /trashEverywhere\('library'/);
  assert.doesNotMatch(del, /drive\.trash\(/);
});

test('the words: scope, progress, time, and nothing offers what is not built', () => {
  assert.equal(moveScopeAr({ kind: 'mail' }), 'مرفقات البريد والمراسلة كلها');
  assert.equal(moveScopeAr({ kind: 'library' }), 'مكتبة الوسائط كلها');
  assert.equal(moveScopeAr({ kind: 'library', folder_id: 'f' }, 'حملة الصيف'), 'مجلد «حملة الصيف» وما تحته من المكتبة');
  assert.equal(durationAr(30), 'أقل من دقيقتين');
  assert.match(durationAr(estimateSeconds(40 * 1024 ** 3, 100)), /ساعة/);
  const r = { move: { state: 'running' }, bytes: { planned: 1000, done: 400, partial: 100 } };
  assert.equal(moveProgress(r), 0.5);
  assert.equal(moveProgress({ move: { state: 'completed' }, bytes: { planned: 0, done: 0, partial: 0 } }), 1);
  assert.deepEqual(COMING_PROVIDERS.map((c) => c.id).sort(), ['nas', 'onedrive']);
  const text = [...Object.values(MOVE_STATE_AR), ...Object.values(MOVE_ITEM_AR), ...Object.values(SKIP_REASON_AR), ...Object.values(FAIL_REASON_AR)].join(' ');
  assert.doesNotMatch(text, /\p{Extended_Pictographic}/u);
});

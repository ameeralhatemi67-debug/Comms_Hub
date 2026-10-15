// Action_Plan.md B10: OneDrive as a storage provider, against a fake Microsoft Graph that answers
// as the documentation says (read 2026-10-15). NOT a test against a real Microsoft account.
// The database half is supabase/tests/onedrive_rules.sql.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { QuickXor } from '../src/lib/storage/quickxor.ts';
import {
  GRAPH_URL,
  MS_TOKEN,
  ONEDRIVE_SCOPES,
  PART_SIZE,
  RANGE_UNIT,
  microsoftAppCheck,
  onedriveAuthUrl,
  onedriveExchangeCode,
  onedriveProbe,
  onedriveStorage,
  safeName,
} from '../src/lib/storage/onedrive.ts';
import { StorageError } from '../src/lib/storage/provider.ts';
import { Md5 } from '../src/lib/storage/md5.ts';
import { runBatch } from '../src/lib/storage/move.ts';
import { GUIDES } from '../src/lib/setup-guides.ts';

// ---- QuickXorHash: held to an independent port of Microsoft's reference code ------------------------
/** Microsoft's published reference implementation, ported literally (64-bit cells, the last one 32). */
function referenceQuickXor(data) {
  const WIDTH = 160, SHIFT = 11, BITS_LAST = 32;
  const cells = [0n, 0n, 0n];
  const M64 = (1n << 64n) - 1n;
  let shiftSoFar = 0, length = 0;
  const size = data.length;
  let vectorArrayIndex = Math.floor(shiftSoFar / 64);
  let vectorOffset = shiftSoFar % 64;
  const iterations = Math.min(size, WIDTH);
  for (let i = 0; i < iterations; i++) {
    const isLastCell = vectorArrayIndex === cells.length - 1;
    const bitsInVectorCell = isLastCell ? BITS_LAST : 64;
    if (vectorOffset <= bitsInVectorCell - 8) {
      for (let j = i; j < size; j += WIDTH) cells[vectorArrayIndex] ^= BigInt(data[j]) << BigInt(vectorOffset);
    } else {
      const index1 = vectorArrayIndex;
      const index2 = isLastCell ? 0 : vectorArrayIndex + 1;
      const low = bitsInVectorCell - vectorOffset;
      let xored = 0;
      for (let j = i; j < size; j += WIDTH) xored ^= data[j];
      cells[index1] ^= (BigInt(xored) << BigInt(vectorOffset)) & M64;
      cells[index2] ^= BigInt(xored) >> BigInt(low);
    }
    vectorOffset += SHIFT;
    while (vectorOffset >= bitsInVectorCell) {
      vectorArrayIndex = isLastCell ? 0 : vectorArrayIndex + 1;
      vectorOffset -= bitsInVectorCell;
    }
  }
  shiftSoFar = (shiftSoFar + SHIFT * (size % WIDTH)) % WIDTH;
  length += size;
  const rgb = new Uint8Array(WIDTH / 8);
  for (let c = 0; c < cells.length; c++) {
    const bytes = c < cells.length - 1 ? 8 : 4;
    for (let b = 0; b < bytes; b++) rgb[c * 8 + b] = Number((cells[c] >> BigInt(8 * b)) & 0xffn);
  }
  let len = BigInt(length);
  for (let i = 0; i < 8; i++) {
    rgb[WIDTH / 8 - 8 + i] ^= Number(len & 0xffn);
    len >>= 8n;
  }
  return Buffer.from(rgb).toString('base64');
}

const bytesOf = (n, seed = 7) => Uint8Array.from({ length: n }, (_, i) => (i * 131 + seed + (i >> 5) * 17) & 0xff);

test('quickXorHash equals the reference implementation for empty, short, 160-multiple and long inputs', () => {
  assert.equal(new QuickXor().digest(), 'AAAAAAAAAAAAAAAAAAAAAAAAAAA=', 'the empty file');
  for (const n of [1, 2, 7, 8, 20, 159, 160, 161, 320, 1000, 4097, 100_000]) {
    const d = bytesOf(n);
    assert.equal(new QuickXor().update(d).digest(), referenceQuickXor(d), `${n} bytes`);
  }
});

test('quickXorHash is the same fed in parts, and from a saved state', () => {
  const d = bytesOf(1_234_567);
  const whole = new QuickXor().update(d).digest();
  const q = new QuickXor();
  for (let at = 0; at < d.length; at += PART_SIZE / 3) {
    q.update(d.subarray(at, at + PART_SIZE / 3));
    const saved = JSON.parse(JSON.stringify(q.state()));
    assert.equal(QuickXor.from(saved).bytes, Math.min(at + PART_SIZE / 3, d.length));
  }
  assert.equal(q.digest(), whole);
  const half = new QuickXor().update(d.subarray(0, 600_000));
  const resumed = QuickXor.from(JSON.parse(JSON.stringify(half.state()))).update(d.subarray(600_000));
  assert.equal(resumed.digest(), whole);
  assert.throws(() => QuickXor.from({ a: [1, 2], n: 0 }), /QUICKXOR_STATE/);
});

// ---- the sign-in --------------------------------------------------------------------------------------
test('the sign-in asks for the files and a refresh token, on the common endpoint, with a state', () => {
  const u = new URL(onedriveAuthUrl({ clientId: 'cid', redirectUri: 'https://hub.test/api/onedrive/callback', state: 's1' }));
  assert.equal(u.origin + u.pathname, 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('state'), 's1');
  assert.deepEqual(u.searchParams.get('scope').split(' '), [...ONEDRIVE_SCOPES]);
  assert.ok(ONEDRIVE_SCOPES.includes('offline_access') && ONEDRIVE_SCOPES.includes('Files.ReadWrite'));
});

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

test('the code becomes a refresh token and an account; no refresh token is a named failure; the app pair is checked by a refused code', async () => {
  const f = async (url, init) => {
    if (String(url) === MS_TOKEN) {
      assert.match(init.body, /grant_type=authorization_code/);
      assert.match(init.body, /client_secret=sekrit/);
      return json({ access_token: 'AT', refresh_token: 'RT-1', expires_in: 3600 });
    }
    assert.match(String(url), /^https:\/\/graph\.microsoft\.com\/v1\.0\/me\?/);
    assert.equal(init.headers.Authorization, 'Bearer AT');
    return json({ mail: 'dept@example.com', userPrincipalName: 'dept_example#EXT#' });
  };
  assert.deepEqual(await onedriveExchangeCode({ clientId: 'cid', secret: 'sekrit-value', redirectUri: 'https://hub.test/cb', code: 'c' }, f), { refresh: 'RT-1', account: 'dept@example.com' });
  const noRefresh = async (url) => (String(url) === MS_TOKEN ? json({ access_token: 'AT', expires_in: 3600 }) : json({ userPrincipalName: 'a@b' }));
  await assert.rejects(onedriveExchangeCode({ clientId: 'c', secret: 's', redirectUri: 'r', code: 'c' }, noRefresh), (e) => e instanceof StorageError && e.message === 'REFRESH_MISSING');
  await assert.rejects(onedriveExchangeCode({ clientId: 'c', secret: 's', redirectUri: 'r', code: 'c' }, async () => json({ error: 'invalid_grant' }, 400)), (e) => e.message === 'CODE_REFUSED');
  assert.deepEqual(await microsoftAppCheck(async () => json({ error: 'invalid_grant' }, 400), 'cid', 'sekrit-value'), { ok: true });
  assert.deepEqual(await microsoftAppCheck(async () => json({ error: 'invalid_client' }, 401), 'cid', 'bad'), { ok: false, error: 'APP_REFUSED' });
  assert.deepEqual(await microsoftAppCheck(async () => json({ error: 'unauthorized_client' }, 400), 'nope', 'x'), { ok: false, error: 'APP_REFUSED' });
  assert.deepEqual(await microsoftAppCheck(async () => { throw new Error('offline'); }, 'cid', 's'), { ok: false, error: 'UNREACHABLE' });
});

// ---- a fake Microsoft Graph ------------------------------------------------------------------------------
/** A OneDrive: items by id, upload sessions with the 320 KiB rule, recycle bin, refresh with rotation. */
function fakeGraph({ hashes = true } = {}) {
  const items = new Map();
  const sessions = new Map();
  const calls = [];
  let seq = 0;
  let refresh = 'RT-0';
  let accessN = 0;
  const log = [];
  const hashOf = (bytes) => new QuickXor().update(bytes).digest();
  items.set('ROOT', { id: 'ROOT', name: 'Comms Hub', folder: {} });
  const publish = (id, name, bytes) => {
    const it = { id, name, size: bytes.length, file: { mimeType: 'application/octet-stream', hashes: hashes ? { quickXorHash: hashOf(bytes) } : {} }, parentReference: { id: 'ROOT' }, bytes };
    items.set(id, it);
    return { id, name, size: it.size, file: { hashes: { ...(hashes ? { quickXorHash: it.file.hashes.quickXorHash } : {}) } } };
  };
  const f = async (input, init = {}) => {
    const url = String(input);
    const method = init.method ?? 'GET';
    calls.push({ url, method, init });
    if (url === MS_TOKEN) {
      const b = new URLSearchParams(init.body);
      if (b.get('refresh_token') !== refresh) return json({ error: 'invalid_grant' }, 400);
      accessN++;
      refresh = `RT-${accessN}`;
      return json({ access_token: `AT-${accessN}`, refresh_token: refresh, expires_in: 3600 });
    }
    if (url.startsWith('https://up.1drv.test/')) {
      assert.ok(!init.headers?.Authorization, 'the session address is pre-authorised: no bearer token is sent to it');
      const s = sessions.get(url);
      if (!s) return json({ error: 'gone' }, 404);
      if (method === 'GET') return json({ nextExpectedRanges: [`${s.received}-`] });
      if (method === 'DELETE') {
        sessions.delete(url);
        return new Response(null, { status: 204 });
      }
      const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(init.headers['Content-Range']);
      assert.ok(m, 'Content-Range');
      const [from, to, total] = [Number(m[1]), Number(m[2]), Number(m[3])];
      const body = new Uint8Array(init.body);
      assert.equal(body.length, to - from + 1);
      assert.equal(from, s.received, 'ranges arrive in order');
      assert.equal(total, s.size);
      const last = to + 1 === total;
      if (!last) assert.equal(body.length % RANGE_UNIT, 0, 'every range but the last is a multiple of 320 KiB');
      s.chunks.push(body);
      s.received += body.length;
      if (!last) return json({ nextExpectedRanges: [`${s.received}-`] }, 202);
      const all = Buffer.concat(s.chunks);
      sessions.delete(url);
      return json(publish(`ITEM-${++seq}`, s.name, new Uint8Array(all)), 201);
    }
    assert.ok(url.startsWith(GRAPH_URL), url);
    assert.match(init.headers?.Authorization ?? '', /^Bearer AT-\d+$/, 'every Graph call carries the bearer token');
    const path = url.slice(GRAPH_URL.length);
    if (method === 'GET' && path.startsWith('/me/drive/root:/')) return json(items.get('ROOT'));
    if (method === 'GET' && path.startsWith('/me?')) return json({ mail: 'dept@example.com' });
    if (method === 'GET' && path.startsWith('/me/drive?')) return json({ quota: { used: 1_000, total: 1_000_000 } });
    let m = /^\/me\/drive\/items\/([^:/]+):\/([^:]+):\/createUploadSession$/.exec(path);
    if (m && method === 'POST') {
      const upload = `https://up.1drv.test/s/${++seq}`;
      sessions.set(upload, { name: decodeURIComponent(m[2]), size: null, received: 0, chunks: [] });
      // The size is known from the first range's Content-Range.
      return json({ uploadUrl: upload, expirationDateTime: '2026-10-16T00:00:00Z' });
    }
    m = /^\/me\/drive\/items\/([^/?]+)\/content$/.exec(path);
    if (m && method === 'GET') {
      const it = items.get(decodeURIComponent(m[1]));
      if (!it || it.deleted) return json({}, 404);
      const r = /^bytes=(\d+)-(\d+)$/.exec(init.headers?.Range ?? '');
      if (!r) return new Response(it.bytes, { status: 200 });
      return new Response(it.bytes.subarray(Number(r[1]), Number(r[2]) + 1), { status: 206 });
    }
    m = /^\/me\/drive\/items\/([^/?]+)(\?.*)?$/.exec(path);
    if (m) {
      const id = decodeURIComponent(m[1]);
      const it = items.get(id);
      if (method === 'DELETE') {
        if (!it) return json({}, 404);
        it.deleted = {};
        return new Response(null, { status: 204 });
      }
      if (method === 'GET') {
        if (!it) return json({ error: { code: 'itemNotFound' } }, 404);
        const { bytes, ...rest } = it;
        return json(rest);
      }
    }
    return json({ error: 'unexpected ' + method + ' ' + path }, 500);
  };
  f.items = items;
  f.sessions = sessions;
  f.calls = calls;
  f.refresh = () => refresh;
  f.log = log;
  // The upload size comes with the first range; make the session know it from the request that creates it.
  const sizing = f;
  return sizing;
}

/** The fake needs the size of a session before the first range: tests tell it. */
const session = (g, size) => {
  for (const s of g.sessions.values()) if (s.size === null) s.size = size;
};

const provider = (g, over = {}) => {
  const rotated = [];
  const p = onedriveStorage({
    auth: async () => ({ clientId: 'cid', secret: 'sekrit-value', refresh: g.refresh() }),
    rotate: async (t) => void rotated.push(t),
    fetch: g,
    ...over,
  });
  p.rotated = rotated;
  return p;
};

test('the provider finds or makes its own folder, and trashes to the recycle bin', async () => {
  const g = fakeGraph();
  const p = provider(g);
  assert.equal(p.type, 'onedrive');
  assert.equal(await p.rootFolder(), 'ROOT');
  assert.equal(await p.account(), 'dept@example.com');
  assert.deepEqual(await p.quota(), { used: 1000, total: 1_000_000 });
  g.items.set('X', { id: 'X', name: 'a.bin', size: 3, bytes: new Uint8Array([1, 2, 3]), file: { hashes: {} } });
  assert.deepEqual(await p.check('X', 3), { state: 'ok', size: 3 });
  assert.deepEqual(await p.check('X', 4), { state: 'failed', size: 3 });
  await p.trash('X');
  assert.deepEqual(await p.check('X', 3), { state: 'missing', size: 3 });
  assert.deepEqual(await p.check('NOPE', 1), { state: 'missing', size: null });
  await assert.rejects(p.startUpload({ name: 'a', mimeType: 'x', size: 1, origin: 'o', uploadedBy: 'u' }), (e) => e.status === 501);
});

test('an access token is asked for once, and the refresh token Microsoft hands back is kept', async () => {
  const g = fakeGraph();
  const p = provider(g);
  await p.account();
  await p.quota();
  await p.account();
  assert.equal(g.calls.filter((c) => c.url === MS_TOKEN).length, 1);
  assert.deepEqual(p.rotated, ['RT-1']);
  // A revoked refresh token is not a finding about a file: it stops the batch.
  const dead = onedriveStorage({ auth: async () => ({ clientId: 'c', secret: 's', refresh: 'revoked' }), fetch: fakeGraph() });
  await assert.rejects(dead.account(), (e) => e instanceof StorageError && e.status === 503 && e.message === 'TOKEN_REFUSED');
  const none = onedriveStorage({ auth: async () => null, fetch: fakeGraph() });
  await assert.rejects(none.account(), (e) => e.status === 503 && e.message === 'NO_SECRET');
  assert.deepEqual(await onedriveProbe(p), { ok: true, account: 'dept@example.com', used: 1000, total: 1_000_000 });
  assert.deepEqual(await onedriveProbe(none), { ok: false, error: 'NO_SECRET' });
});

test('a name OneDrive refuses is made safe', () => {
  assert.equal(safeName('تقرير: الحملة?.pdf'), 'تقرير_ الحملة_.pdf');
  assert.equal(safeName('a/b\\c|d*e"f<g>h'), 'a_b_c_d_e_f_g_h');
  assert.equal(safeName('...'), 'file');
  assert.equal(safeName('x'.repeat(300)).length, 200);
});

// ---- the sink: ranges, resume, proof -------------------------------------------------------------------------
async function send(p, g, bytes, name = 'big.bin') {
  const sink = p.sink();
  let st = await sink.begin({ key: `library/${name}`, name, mimeType: 'application/octet-stream', size: bytes.length });
  session(g, bytes.length);
  return { sink, st };
}

test('a file goes up in ranges of 320 KiB multiples, in order, without the token, and is proven by quickXorHash', async () => {
  const g = fakeGraph();
  const p = provider(g);
  const bytes = bytesOf(PART_SIZE * 2 + 12_345);
  const { sink, st: begun } = await send(p, g, bytes);
  assert.equal(sink.partSize, PART_SIZE);
  assert.equal(PART_SIZE % RANGE_UNIT, 0);
  let st = begun;
  for (let at = 0; at < bytes.length; at += sink.partSize) {
    const part = bytes.subarray(at, at + sink.partSize);
    st = await sink.put(st, at, part, at + part.length >= bytes.length);
  }
  const expected = sink.expectedRemote(st, 'whatever');
  const fin = await sink.finish(st);
  assert.equal(fin.size, bytes.length);
  assert.match(fin.remoteChecksum, /^qxh:[A-Za-z0-9+/]{27}=$/);
  assert.equal(fin.remoteChecksum, expected, 'what OneDrive says is what the sink hashed while sending');
  assert.equal(fin.remoteChecksum, `qxh:${referenceQuickXor(bytes)}`);
  assert.equal(await p.checksum(fin.ref), fin.remoteChecksum);
  const back = new Uint8Array(await (await p.open(fin.ref, `bytes=0-99`)).arrayBuffer());
  assert.deepEqual([...back], [...bytes.subarray(0, 100)]);
});

test('a session that lost its connection resumes from what OneDrive says it has, and a gap filled by the engine is not called proven', async () => {
  const g = fakeGraph();
  const p = provider(g);
  const bytes = bytesOf(PART_SIZE * 2 + 5);
  const { sink, st } = await send(p, g, bytes);
  const one = await sink.put(st, 0, bytes.subarray(0, PART_SIZE), false);
  const r = await sink.resume(JSON.parse(JSON.stringify(one)));
  assert.equal(r.offset, PART_SIZE);
  assert.equal(sink.expectedRemote(r.state, ''), null, 'not complete yet');
  // The engine found the session further along than it had recorded and hashed the gap itself.
  const s2 = await send(p, g, bytes);
  const sent = await s2.sink.put(s2.st, 0, bytes.subarray(0, PART_SIZE), false);
  const stale = { ...JSON.parse(JSON.stringify(sent)), qxAt: 0 };
  const ahead = await s2.sink.resume(stale);
  assert.equal(ahead.offset, PART_SIZE);
  let cur = ahead.state;
  for (let at = PART_SIZE; at < bytes.length; at += PART_SIZE) cur = await s2.sink.put(cur, at, bytes.subarray(at, at + PART_SIZE), at + PART_SIZE >= bytes.length);
  assert.equal(s2.sink.expectedRemote(cur, ''), null, 'the proof is withheld: the size is checked, not the content');
  const fin = await s2.sink.finish(cur);
  assert.equal(fin.size, bytes.length);
});

test('an expired session is a named condition, abort cancels it, and an empty file is written plainly', async () => {
  const g = fakeGraph();
  const p = provider(g);
  const { sink, st } = await send(p, g, bytesOf(1000));
  g.sessions.clear();
  await assert.rejects(sink.resume(JSON.parse(JSON.stringify(st))), (e) => e.status === 410 && e.message === 'SESSION_EXPIRED');
  const again = await send(p, g, bytesOf(1000));
  assert.equal(g.sessions.size, 1);
  await again.sink.abort(again.st);
  assert.equal(g.sessions.size, 0);
  // Zero bytes: Graph has no upload session for an empty file, so a plain PUT of the content.
  const emptyCalls = [];
  const fe = async (url, init) => {
    emptyCalls.push([init?.method, String(url)]);
    if (String(url) === MS_TOKEN) return json({ access_token: 'AT-1', expires_in: 3600 });
    if (String(url).includes('/me/drive/root:/')) return json({ id: 'ROOT' });
    return json({ id: 'EMPTY-1', name: 'e.txt', size: 0, file: { hashes: { quickXorHash: 'AAAAAAAAAAAAAAAAAAAAAAAAAAA=' } } }, 201);
  };
  const pe = onedriveStorage({ auth: async () => ({ clientId: 'c', secret: 's', refresh: 'r' }), fetch: fe });
  const s = pe.sink();
  const stE = await s.begin({ key: 'k', name: 'e.txt', mimeType: 'text/plain', size: 0 });
  const finE = await s.finish(stE);
  assert.deepEqual([finE.ref, finE.size, finE.remoteChecksum], ['EMPTY-1', 0, 'qxh:AAAAAAAAAAAAAAAAAAAAAAAAAAA=']);
  assert.equal(s.expectedRemote(stE, ''), finE.remoteChecksum);
  assert.ok(emptyCalls.some(([m, u]) => m === 'PUT' && u.includes('/content')));
});

// ---- the move engine, end to end: Google Drive-like source, OneDrive destination -------------------------
test('the move engine copies a file into OneDrive and calls it proven at the checksum level', async () => {
  const g = fakeGraph();
  const dest = provider(g);
  const bytes = bytesOf(PART_SIZE + 4321);
  const md5 = createHash('md5').update(bytes).digest('hex');
  const source = {
    type: 'google_drive',
    check: async () => ({ state: 'ok', size: bytes.length }),
    checksum: async () => md5,
    open: async (ref, range) => {
      const m = /^bytes=(\d+)-(\d+)$/.exec(range ?? '');
      return new Response(bytes.subarray(Number(m[1]), Number(m[2]) + 1), { status: 206 });
    },
  };
  const rpcLog = [];
  const item = {
    id: 'it1', state: 'pending', kind: 'media_version', subject: 'v1', approved: true, size: bytes.length, attempts: 0, progress: null,
    source_ref: 'drive-1', source_checksum: md5, source_remote: md5, name: 'poster.png', mime: 'image/png', parent: null, dest_location: null,
  };
  let claimed = false;
  const db = {
    rpc: async (name, args) => {
      rpcLog.push([name, args]);
      if (name === 'storage_move_claim') {
        const first = !claimed;
        claimed = true;
        return { data: { state: 'running', mode: 'copy', source: { id: 's', type: 'google_drive', config: {} }, dest: { id: 'd', type: 'onedrive', config: {} }, items: first ? [item] : [] }, error: null };
      }
      return { data: null, error: null };
    },
  };
  // The fake needs the session size at creation: the engine's begin passes it, Graph learns it at the first range.
  const realFetch = g;
  const wrapped = async (url, init) => {
    const res = await realFetch(url, init);
    if (String(url).includes('createUploadSession')) session(g, bytes.length);
    return res;
  };
  const d = onedriveStorage({ auth: async () => ({ clientId: 'cid', secret: 'sekrit-value', refresh: g.refresh() }), fetch: wrapped });
  const out = await runBatch({ db, key: 'k', provider: async (p) => (p.type === 'onedrive' ? d : source), budgetMs: 60_000 }, 'move-1');
  assert.equal(out.failed, 0, JSON.stringify(rpcLog.filter(([n]) => n === 'storage_move_fail')));
  assert.equal(out.copied, 1);
  const verified = rpcLog.find(([n]) => n === 'storage_move_verified');
  assert.deepEqual([verified[1].p_ok, verified[1].p_level], [true, 'checksum'], 'the destination hash matched what was sent, and the source md5 matched');
  const copied = rpcLog.find(([n]) => n === 'storage_move_copied');
  assert.equal(copied[1].p_checksum, md5);
  assert.equal(copied[1].p_remote, `qxh:${referenceQuickXor(bytes)}`);
  void dest;
});

// ---- the rest of the wiring, as source ------------------------------------------------------------------------
test('the provider is built from the app and the refresh token in the vault, and the site never shows either', () => {
  const idx = readFileSync('src/lib/storage/index.ts', 'utf8');
  assert.match(idx, /p\.type === 'onedrive'/);
  assert.match(idx, /integrationCreds\('microsoft_app'/);
  assert.match(idx, /rotateOneDriveToken\(p\.id, token\)/);
  const cb = readFileSync('src/app/api/onedrive/callback/route.ts', 'utf8');
  assert.match(cb, /capGuard\(request, 'storage\.manage'/);
  assert.match(cb, /onedrive_provider_set/);
  assert.match(cb, /onedrive_oauth_state/);
  assert.doesNotMatch(cb, /searchParams\.set\(['"](token|refresh|secret)/);
  assert.doesNotMatch(readFileSync('src/lib/storage/onedrive.ts', 'utf8'), /console\./);
  const sql = readFileSync('supabase/migrations/20261015210000_onedrive.sql', 'utf8');
  assert.match(sql, /microsoft_app/);
  assert.match(sql, /onedrive_provider_set/);
  assert.match(sql, /when ''onedrive'' then 250000000000/);
});

test('the engine accepts a quickXorHash as a destination proof, and only of the right shape', () => {
  const eng = readFileSync('src/lib/storage/move.ts', 'utf8');
  assert.match(eng, /\^qxh:\[A-Za-z0-9\+\/\]\{27\}=\$/);
});

test('the OneDrive guides are complete, with links, the return address to copy, and the honest note', () => {
  for (const k of ['microsoft', 'onedrive']) {
    const g = GUIDES[k];
    assert.ok(g && g.steps.length >= 6, k);
    assert.match(g.link.href, /^https:\/\//);
    assert.match(JSON.stringify(g.notes), /DEV|2026-10-15|لم يُجرَّب|المنصة|Microsoft|سلة/);
  }
  assert.ok(GUIDES.microsoft.steps.some((s) => s.copy === '{origin}/api/onedrive/callback'));
  assert.ok(GUIDES.microsoft.steps.some((s) => s.link?.href.startsWith('https://entra.microsoft.com/')));
  assert.match(JSON.stringify(GUIDES.onedrive.notes), /لم يُجرَّب مع حساب Microsoft حقيقي/);
});

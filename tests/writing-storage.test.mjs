// The server half of the writing documents (Writing_Build_Plan.md): Drive's new calls with a scripted fetch, the save
// flow with fakes, the writer rules, and the migration's own promises. The database half is supabase/tests/writing_rules.sql.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DOCX_MIME, DriveError, createDrive } from '../src/lib/drive/google.ts';
import { StorageError } from '../src/lib/storage/provider.ts';
import { driveStorage } from '../src/lib/storage/drive.ts';
import { s3Storage } from '../src/lib/storage/s3.ts';
import { onedriveStorage } from '../src/lib/storage/onedrive.ts';
import {
  IMAGE_ID, MAX_IMAGE_BYTES, Refused, WORD_MIME, WORK_ID, draftName, ensureFolders, fileHeaders, isDocx, masterName, readCapped, refusal, saveVersion, sha256,
  sniffImage, workFileName, writeOver,
} from '../src/lib/storage/writing.ts';
import { WORK_RPC, WRITING_RPC, canSendWork, canWriteText, isTextWriter, workErrorText } from '../src/lib/work/rules.ts';
import { fileAt, filePath } from '../src/lib/native/files.ts';

const env = { clientId: 'cid', clientSecret: 'secret', refreshToken: 'refresh', folderId: 'root-1' };
function scripted(...handlers) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const next = handlers.shift();
    assert.ok(next, `unexpected request to ${url}`);
    return next(String(url), init);
  };
  fn.calls = calls;
  return fn;
}
const json = (body, init = {}) => new Response(JSON.stringify(body), { status: 200, ...init });
const token = () => json({ access_token: 'at-1', expires_in: 3600 });
const text = (b) => Buffer.from(b).toString('utf8');

// --- Drive -------------------------------------------------------------------------------------------------------

test('putSmall sends the description and the bytes in one multipart request', async () => {
  const fetch = scripted(token, (url, init) => {
    assert.match(url, /^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files\?uploadType=multipart&fields=id$/);
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.Authorization, 'Bearer at-1');
    const boundary = /^multipart\/related; boundary=(.+)$/.exec(init.headers['Content-Type'])[1];
    const body = text(init.body);
    assert.ok(body.startsWith(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`));
    assert.ok(body.endsWith(`\r\n--${boundary}--`));
    const meta = JSON.parse(body.split('\r\n\r\n')[1].split('\r\n')[0]);
    assert.deepEqual(meta, { name: 'v001 2026-11-02.json', mimeType: 'application/json', parents: ['folder-v'], appProperties: { commsHub: '1', commsHubWork: 'CH-1' } });
    assert.match(body, /\r\nContent-Type: application\/json\r\n\r\n\{"type":"doc"\}\r\n/);
    return json({ id: 'file-1' });
  });
  const id = await createDrive({ env, fetch }).putSmall({
    name: 'v001 2026-11-02.json',
    mimeType: 'application/json',
    bytes: new TextEncoder().encode('{"type":"doc"}'),
    parentId: 'folder-v',
    appProperties: { commsHubWork: 'CH-1' },
  });
  assert.equal(id, 'file-1');
});

test('putSmall keeps bytes as bytes, and goes to the Hub folder when no folder is named', async () => {
  const bytes = new Uint8Array([0, 255, 13, 10, 200]);
  const fetch = scripted(token, (url, init) => {
    const body = init.body;
    const at = Buffer.from(body).indexOf(Buffer.from(bytes));
    assert.ok(at > 0, 'the bytes are in the body unchanged');
    assert.deepEqual(JSON.parse(text(body).split('\r\n\r\n')[1].split('\r\n')[0]).parents, ['root-1']);
    return json({ id: 'file-2' });
  });
  assert.equal(await createDrive({ env, fetch }).putSmall({ name: 'a.png', mimeType: 'image/png', bytes }), 'file-2');
});

test('a write that Drive refuses, or answers without an id, is a failure', async () => {
  await assert.rejects(
    createDrive({ env, fetch: scripted(token, () => new Response('{}', { status: 403 })) }).putSmall({ name: 'a', mimeType: 'a/b', bytes: new Uint8Array(1) }),
    (e) => e instanceof DriveError && e.status === 403 && e.message === 'DRIVE_403',
  );
  await assert.rejects(
    createDrive({ env, fetch: scripted(token, () => json({})) }).putSmall({ name: 'a', mimeType: 'a/b', bytes: new Uint8Array(1) }),
    (e) => e instanceof DriveError && e.message === 'NO_FILE_ID',
  );
});

test('update replaces the content of a file, which keeps its id, and renames it when asked', async () => {
  const fetch = scripted(token, (url, init) => {
    assert.match(url, /\/upload\/drive\/v3\/files\/f%201\?uploadType=multipart&fields=id$/);
    assert.equal(init.method, 'PATCH');
    assert.deepEqual(JSON.parse(text(init.body).split('\r\n\r\n')[1].split('\r\n')[0]), { name: 'جديد.txt' });
    return json({ id: 'f 1' });
  }, (url, init) => {
    assert.deepEqual(JSON.parse(text(init.body).split('\r\n\r\n')[1].split('\r\n')[0]), {});
    return json({ id: 'f 1' });
  });
  const drive = createDrive({ env, fetch });
  await drive.update('f 1', { bytes: new Uint8Array(3), mimeType: 'text/plain', name: 'جديد.txt' });
  await drive.update('f 1', { bytes: new Uint8Array(3), mimeType: 'text/plain' });
});

test('read gives the whole file as bytes, and a missing file is a 404', async () => {
  const fetch = scripted(token, (url) => {
    assert.match(url, /\/files\/abc\?alt=media$/);
    return new Response(new Uint8Array([1, 2, 3]));
  }, () => new Response('', { status: 404 }));
  const drive = createDrive({ env, fetch });
  assert.deepEqual([...(await drive.read('abc'))], [1, 2, 3]);
  await assert.rejects(drive.read('gone'), (e) => e instanceof DriveError && e.status === 404);
});

test('a marked folder is found by its marker, and made once', async () => {
  const fetch = scripted(
    token,
    (url) => {
      assert.match(decodeURIComponent(url), /appProperties has \{ key='commsHubWriting' and value='1' \}/);
      return json({ files: [] });
    },
    (url, init) => {
      const sent = JSON.parse(init.body);
      assert.deepEqual(sent.parents, ['root-1']);
      assert.equal(sent.name, 'مستندات الكتابة');
      assert.deepEqual(sent.appProperties, { commsHub: '1', commsHubWriting: '1' });
      return json({ id: 'writing-root' });
    },
  );
  const drive = createDrive({ env, fetch });
  assert.equal(await drive.markedFolder('commsHubWriting', 'مستندات الكتابة'), 'writing-root');
  assert.equal(await drive.markedFolder('commsHubWriting', 'مستندات الكتابة'), 'writing-root', 'remembered');
  const found = scripted(token, () => json({ files: [{ id: 'old-root' }] }));
  assert.equal(await createDrive({ env, fetch: found }).markedFolder('commsHubWriting', 'مستندات الكتابة'), 'old-root');
});

test('a PDF comes from a temporary Google Doc, which is deleted afterwards', async () => {
  const fetch = scripted(
    token,
    (url, init) => {
      assert.match(url, /uploadType=multipart/);
      const body = text(init.body);
      assert.equal(JSON.parse(body.split('\r\n\r\n')[1].split('\r\n')[0]).mimeType, 'application/vnd.google-apps.document', 'Drive converts on upload');
      assert.ok(body.includes(`Content-Type: ${DOCX_MIME}`), 'the bytes are a Word file');
      return json({ id: 'temp-1' });
    },
    (url, init) => {
      assert.match(url, /\/drive\/v3\/files\/temp-1\/export\?mimeType=application%2Fpdf$/);
      assert.equal(init.method, undefined);
      return new Response(new Uint8Array([37, 80, 68, 70]));
    },
    (url, init) => {
      assert.match(url, /\/drive\/v3\/files\/temp-1$/);
      assert.equal(init.method, 'DELETE');
      return new Response(null, { status: 204 });
    },
  );
  assert.deepEqual([...(await createDrive({ env, fetch }).convertToPdf(new Uint8Array([80, 75, 3, 4])))], [37, 80, 68, 70]);
  assert.equal(fetch.calls.length, 4);
});

test('the temporary file is deleted when the export fails too, and Drive\'s size limit has its own word', async () => {
  const fetch = scripted(
    token,
    () => json({ id: 'temp-2' }),
    () => new Response('{"error":{"errors":[{"reason":"exportSizeLimitExceeded"}]}}', { status: 403 }),
    (url, init) => (assert.equal(init.method, 'DELETE'), new Response(null, { status: 204 })),
  );
  await assert.rejects(createDrive({ env, fetch }).convertToPdf(new Uint8Array(4)), (e) => e instanceof DriveError && e.message === 'PDF_TOO_LARGE');
  assert.equal(fetch.calls.length, 4);
});

test('a failed clean-up does not lose the PDF', async () => {
  const fetch = scripted(token, () => json({ id: 'temp-3' }), () => new Response(new Uint8Array([1])), () => Promise.reject(new Error('network')));
  assert.deepEqual([...(await createDrive({ env, fetch }).convertToPdf(new Uint8Array(4)))], [1]);
});

test('the scope stays drive.file', () => {
  assert.match(readFileSync('src/lib/drive/google.ts', 'utf8'), /DRIVE_SCOPE = 'https:\/\/www\.googleapis\.com\/auth\/drive\.file'/);
});

test('the Drive provider answers the new calls, and a second provider says it cannot', async () => {
  const fetch = scripted(token, () => json({ id: 'x' }));
  const p = driveStorage(createDrive({ env, fetch }));
  assert.equal(await p.putSmall({ name: 'a', mimeType: 'a/b', bytes: new Uint8Array(1) }), 'x');
  for (const m of ['markedFolder', 'putSmall', 'update', 'convertToPdf', 'read']) assert.equal(typeof p[m], 'function', m);

  const s3 = s3Storage({ endpoint: 'https://s3.example.org', bucket: 'b', region: 'auto', prefix: '', pathStyle: true }, { accessKeyId: 'a', secretAccessKey: 'b' });
  const one = onedriveStorage({ auth: async () => null, rotate: async () => undefined });
  for (const provider of [s3, one]) {
    for (const call of [() => provider.markedFolder('m', 'n'), () => provider.putSmall({}), () => provider.update('r', {}), () => provider.convertToPdf(new Uint8Array(1))]) {
      await assert.rejects(call(), (e) => e instanceof StorageError && e.status === 501);
    }
  }
});

// --- Bytes and names -----------------------------------------------------------------------------------------------

test('a picture is what its bytes say, and an SVG is nothing', () => {
  assert.equal(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png');
  assert.equal(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(sniffImage(new TextEncoder().encode('GIF89a...')), 'image/gif');
  assert.equal(sniffImage(new TextEncoder().encode('GIF87a...')), 'image/gif');
  assert.equal(sniffImage(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ')), 'image/webp');
  for (const no of ['<svg xmlns="http://www.w3.org/2000/svg"/>', '<?xml version="1.0"?><svg/>', '<script>alert(1)</script>', 'RIFF\0\0\0\0WAVEfmt ', '']) {
    assert.equal(sniffImage(new TextEncoder().encode(no)), null, no);
  }
  assert.equal(MAX_IMAGE_BYTES, 5 * 1024 * 1024);
});

test('a Word file is a zip, and the file names are safe', () => {
  assert.equal(isDocx(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0])), true);
  assert.equal(isDocx(new TextEncoder().encode('<html>')), false);
  assert.equal(WORD_MIME, DOCX_MIME);
  assert.equal(masterName(3, new Date('2026-11-01T22:00:00Z')), 'v003 2026-11-02.json', 'the date is Riyadh\'s');
  assert.equal(masterName(1234, new Date('2026-11-02T08:00:00Z')), 'v1234 2026-11-02.json');
  assert.equal(workFileName('CH-10', 'بيان/صحفي', 'docx'), 'CH-10 بيان صحفي.docx');
  assert.match(workFileName('CH-10', 'x'.repeat(400), 'pdf'), /^CH-10 x+\.pdf$/);
  assert.equal(draftName('a@x.sa').includes('a@x.sa'), false, 'a draft\'s name says nothing about whose it is');
  assert.equal(WORK_ID.test('CH-10'), true);
  for (const no of ['CH-', 'ch-1', 'CH-1234567', 'CH-1/../x', '../CH-1']) assert.equal(WORK_ID.test(no), false, no);
  assert.equal(IMAGE_ID.test('3f2b8c1e-0a4d-4c6b-9e7f-1a2b3c4d5e6f'), true);
  assert.match(sha256('a'), /^[0-9a-f]{64}$/, 'what work_texts.checksum accepts');
});

test('a body above the cap is refused, whether the length says so or only the bytes do', async () => {
  const req = (body, headers = {}) => new Request('https://hub.example/x', { method: 'POST', body, headers, duplex: 'half' });
  assert.deepEqual([...(await readCapped(req(new Uint8Array([1, 2, 3])), 3))], [1, 2, 3]);
  assert.equal(await readCapped(req(new Uint8Array(4)), 3), null);
  assert.equal(await readCapped(req(new Uint8Array(1), { 'content-length': '999' }), 3), null);
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(2));
      c.enqueue(new Uint8Array(2));
      c.close();
    },
  });
  assert.equal(await readCapped(req(stream), 3), null, 'a stream that never said its length');
});

test('a stored file never runs from the Hub\'s own address', () => {
  const h = fileHeaders('application/pdf', 'CH-1 عنوان.pdf', 'attachment');
  assert.equal(h.get('X-Content-Type-Options'), 'nosniff');
  assert.match(h.get('Content-Security-Policy'), /^sandbox;/);
  assert.match(h.get('Content-Disposition'), /^attachment; filename\*=UTF-8''CH-1%20/);
  assert.equal(h.get('Cache-Control'), 'private, no-store');
});

test('a refusal is in Arabic, with its code and a fitting status', async () => {
  const cases = [['FORBIDDEN', 403], ['NO_CHANGE', 409], ['STATUS_DENIED', 409], ['WRITER_LOCKED', 409], ['EXPORT_STALE', 409], ['TEXT_REQUIRED', 400], ['DOC_INVALID', 400]];
  for (const [c, status] of cases) {
    const res = refusal(c);
    assert.equal(res.status, status, c);
    const body = await res.json();
    assert.equal(body.code, c);
    assert.match(body.error, /[؀-ۿ]/, c);
  }
  assert.equal(workErrorText('WRITER_LOCKED'), 'بعد الإرسال يبقى التعديل لمسؤول العمل ومدير الاتصال ومساعده.');
});

// --- The save flow ---------------------------------------------------------------------------------------------------

const DOCS = { work_id: 'CH-1', folder_ref: 'f', current_ref: 'cur', versions_ref: 'ver', drafts_ref: 'dra', images_ref: 'img', word_ref: null, word_n: null, pdf_ref: null, pdf_n: null, text_ref: null };

function fakes({ commit, failText = false, updateGone = false } = {}) {
  const log = [];
  const storage = {
    markedFolder: async (m) => (log.push(['marked', m]), 'writing-root'),
    createFolder: async (name, parent) => (log.push(['folder', name, parent]), `id:${name}`),
    putSmall: async (f) => {
      if (failText && f.mimeType === 'text/plain') throw new StorageError(502, 'DRIVE_502');
      log.push(['put', f.name, f.parentId]);
      return `ref:${f.name}`;
    },
    update: async (ref, c) => {
      log.push(['update', ref, c.name]);
      if (updateGone) throw new StorageError(404, 'DRIVE_404');
    },
    trash: async (ref) => void log.push(['trash', ref]),
  };
  const db = {
    rpc: async (name, args) => {
      log.push(['rpc', name, args]);
      if (name === 'work_doc_folders') return { data: { ...DOCS, folder_ref: args.p_folder, current_ref: args.p_current, versions_ref: args.p_versions, drafts_ref: args.p_drafts, images_ref: args.p_images }, error: null };
      if (name === 'work_doc_commit') return commit ?? { data: { n: 4, reopened: false, prune: [], copies: [], draft: null }, error: null };
      return { data: null, error: null };
    },
  };
  const trashAll = async (copies, refs) => void log.push(['trashAll', copies, refs]);
  return { log, deps: { db, storage, key: 'k', trashAll, now: () => new Date('2026-11-02T08:00:00Z') } };
}
const input = (over = {}) => ({ id: 'CH-1', prepared: { title: 'عنوان', latest: 3, next: 4, checksum: null, docs: DOCS }, json: '{"type":"doc","content":[]}', text: 'نص', note: 'ملاحظة', checksum: 'c'.repeat(64), ...over });

test('a save uploads the master, commits, writes the text file, and answers', async () => {
  const { log, deps } = fakes();
  assert.deepEqual(await saveVersion(deps, input()), { n: 4, reopened: false, pruned: 0 });
  const steps = log.map((l) => l.slice(0, 2).join(':'));
  assert.deepEqual(steps, ['put:v004 2026-11-02.json', 'rpc:work_doc_commit', 'put:CH-1 عنوان.txt', 'rpc:work_doc_export', 'trashAll:']);
  assert.equal(log[0][2], 'ver', 'the master goes to «الإصدارات»');
  assert.equal(log[2][2], 'cur', 'the text goes to «الحالي»');
  const commit = log[1][2];
  assert.equal(commit.p_key, 'k');
  assert.equal(commit.p_body, 'نص');
  assert.equal(commit.p_note, 'ملاحظة');
  assert.equal(commit.p_master_ref, 'ref:v004 2026-11-02.json');
  assert.equal(commit.p_size, Buffer.byteLength(input().json));
  assert.deepEqual({ kind: log[3][2].p_kind, n: log[3][2].p_n }, { kind: 'text', n: 4 });
});

test('a refused commit puts the master in the trash and leaves «الحالي» alone', async () => {
  const { log, deps } = fakes({ commit: { data: null, error: { message: 'WRITER_LOCKED' } } });
  await assert.rejects(saveVersion(deps, input()), (e) => e instanceof Refused && e.message === 'WRITER_LOCKED');
  assert.deepEqual(log.filter((l) => l[0] === 'trash'), [['trash', 'ref:v004 2026-11-02.json']]);
  assert.equal(log.some((l) => l[0] === 'put' && String(l[1]).endsWith('.txt')), false);
  assert.equal(log.some((l) => l[0] === 'trashAll'), false, 'nothing was pruned');
});

test('what was pruned and the finished draft go to the trash, and a failed text file does not fail the save', async () => {
  const copies = [{ integration_id: 'i', type: 'google_drive', config: {}, ref: 'old-1' }];
  const { log, deps } = fakes({ failText: true, commit: { data: { n: 12, reopened: true, prune: ['old-1'], copies, draft: 'dr-1' }, error: null } });
  assert.deepEqual(await saveVersion(deps, input()), { n: 12, reopened: true, pruned: 1 });
  assert.deepEqual(log.filter((l) => l[0] === 'trashAll'), [['trashAll', copies, ['old-1', 'dr-1']]]);
  assert.equal(log.some((l) => l[0] === 'rpc' && l[1] === 'work_doc_export'), false);
});

test('a text file already there is replaced, not added to, and is not recorded again', async () => {
  const { log, deps } = fakes();
  await saveVersion(deps, input({ prepared: { title: 'عنوان', latest: 3, next: 4, checksum: null, docs: { ...DOCS, text_ref: 'txt-1' } } }));
  assert.deepEqual(log.filter((l) => l[0] === 'update'), [['update', 'txt-1', 'CH-1 عنوان.txt']]);
  assert.equal(log.some((l) => l[0] === 'rpc' && l[1] === 'work_doc_export'), false);
});

test('a current file that vanished at Drive is written anew', async () => {
  const { log, deps } = fakes({ updateGone: true });
  const ref = await writeOver(deps.storage, 'cur', 'gone', { name: 'a.docx', mimeType: 'x/y', bytes: new Uint8Array(1) });
  assert.equal(ref, 'ref:a.docx');
  assert.deepEqual(log.map((l) => l[0]), ['update', 'put']);
  const other = fakes();
  other.deps.storage.update = async () => {
    throw new StorageError(503, 'DRIVE_NOT_CONFIGURED');
  };
  await assert.rejects(writeOver(other.deps.storage, 'cur', 'x', { name: 'a', mimeType: 'x/y', bytes: new Uint8Array(1) }), (e) => e.status === 503);
});

test('the folders are made once, under «مستندات الكتابة», with their four names', async () => {
  const { log, deps } = fakes();
  const made = await ensureFolders(deps, 'CH-10', 'بيان/الحملة', null);
  assert.equal(made.versions_ref, 'id:الإصدارات');
  assert.deepEqual(log[0], ['marked', 'commsHubWriting']);
  assert.deepEqual(log[1], ['folder', 'CH-10 بيان الحملة', 'writing-root']);
  assert.deepEqual(log.slice(2, 6).map((l) => l[1]).sort(), ['الإصدارات', 'الحالي', 'صور', 'مسودات'].sort());
  assert.ok(log.slice(2, 6).every((l) => l[2] === 'id:CH-10 بيان الحملة'));
  assert.equal(await ensureFolders(deps, 'CH-10', 'x', DOCS), DOCS, 'nothing is made when they exist');
});

test('a save that lost the race to make the folders takes the first and drops its own', async () => {
  const { log, deps } = fakes();
  deps.db.rpc = async () => ({ data: { ...DOCS, folder_ref: 'first' }, error: null });
  assert.equal((await ensureFolders(deps, 'CH-1', 't', null)).folder_ref, 'first');
  assert.deepEqual(log.filter((l) => l[0] === 'trash'), [['trash', 'id:CH-1 t']]);
});

test('folders the database refuses are not left behind', async () => {
  const { log, deps } = fakes();
  deps.db.rpc = async () => ({ data: null, error: { message: 'FORBIDDEN' } });
  await assert.rejects(ensureFolders(deps, 'CH-1', 't', null), (e) => e instanceof Refused);
  assert.deepEqual(log.filter((l) => l[0] === 'trash'), [['trash', 'id:CH-1 t']]);
});

// --- The writer rule, as the database has it ----------------------------------------------------------------------------

const stageW = [{ who: 'ws', role: 'writer' }, { who: 'des', role: 'designer' }];
const work = (status, over = {}) => ({ assignee: 'wri', status, closed_at: null, ...over });

test('who writes: a leader, «المسؤول», a writer stage; nobody else', () => {
  for (const [r, me] of [['director', 'x'], ['assistant', 'x'], ['admin', 'x'], ['writer', 'wri'], ['writer', 'ws']]) assert.equal(isTextWriter(r, me, work('DRAFT'), stageW), true, me);
  for (const [r, me] of [['designer', 'des'], ['publisher', 'p'], ['writer', 'oth'], ['member', 'm']]) assert.equal(isTextWriter(r, me, work('DRAFT'), stageW), false, me);
});

test('a stage writer writes in four statuses, «المسؤول» and the leaders also after approval, and nobody in review', () => {
  const by = (r, me, s) => canWriteText(r, me, work(s), stageW);
  for (const s of ['DRAFT', 'IN_PRODUCTION', 'CHANGES_REQUESTED', 'REJECTED']) {
    assert.equal(by('writer', 'ws', s), true, s);
    assert.equal(by('writer', 'wri', s), true, s);
    assert.equal(by('director', 'x', s), true, s);
  }
  for (const s of ['APPROVED', 'SCHEDULED']) {
    assert.equal(by('writer', 'ws', s), false, s);
    assert.equal(by('writer', 'wri', s), true, s);
    assert.equal(by('assistant', 'x', s), true, s);
  }
  for (const s of ['IN_REVIEW', 'PUBLISHING', 'PUBLISHED', 'PARTIAL', 'FAILED']) {
    for (const [r, me] of [['writer', 'ws'], ['writer', 'wri'], ['director', 'x']]) assert.equal(by(r, me, s), false, `${me} ${s}`);
  }
  assert.equal(canWriteText('director', 'x', work('DRAFT', { closed_at: '2026-11-02' }), stageW), false, 'a closed work is nobody\'s');
  assert.equal(canWriteText('designer', 'des', work('DRAFT'), stageW), false);
});

test('sending stays with «المسؤول» and the leaders', () => {
  assert.equal(canSendWork('writer', 'wri', work('IN_PRODUCTION')), true);
  assert.equal(canSendWork('writer', 'wri', work('CHANGES_REQUESTED')), true);
  assert.equal(canSendWork('director', 'x', work('IN_PRODUCTION')), true);
  assert.equal(canSendWork('writer', 'ws', work('IN_PRODUCTION')), false, 'a stage writer delivers the stage');
  for (const s of ['DRAFT', 'REJECTED', 'IN_REVIEW', 'APPROVED']) assert.equal(canSendWork('writer', 'wri', work(s)), false, s);
  assert.equal(canSendWork('director', 'x', work('IN_PRODUCTION', { assignee: null })), false);
  assert.equal(canSendWork('director', 'x', work('IN_PRODUCTION', { closed_at: 'x' })), false);
});

// --- The phone -----------------------------------------------------------------------------------------------------------

test('the phone may name a current file and a picture of a document, and nothing beside them', () => {
  const id = '3f2b8c1e-0a4d-4c6b-9e7f-1a2b3c4d5e6f';
  for (const ok of [fileAt.writing('CH-10', 'docx'), fileAt.writing('CH-10', 'pdf'), fileAt.writing('CH-10', 'txt'), fileAt.writingImage('CH-10', id)]) assert.equal(filePath(ok), ok, ok);
  for (const no of ['/api/writing/CH-10/file', '/api/writing/CH-10/file?kind=html', '/api/writing/CH-10/file?kind=pdf&x=1', '/api/writing/../file?kind=pdf', '/api/writing/CH-10/doc', '/api/writing/CH-10/draft', `/api/writing/CH-10/image/${id}/x`]) {
    assert.equal(filePath(no), null, no);
  }
});

// --- The migration's promises ---------------------------------------------------------------------------------------------

const sql = readFileSync('supabase/migrations/20261102120000_writing_documents.sql', 'utf8');

test('every function runs with an empty search path, and every definer function is closed to signed-out callers', () => {
  const made = [...sql.matchAll(/create function public\.([a-z_]+)\(([^)]*)\)[\s\S]*?\nas \$\$/g)];
  assert.ok(made.length > 25);
  for (const m of made) {
    assert.match(m[0], /set search_path = ''/, m[1]);
    assert.ok(new RegExp(`revoke all on function public\\.${m[1]}\\(`).test(sql), `${m[1]} revoked`);
  }
});

test('one grant per statement, and every function the pages call is granted to signed-in people', () => {
  for (const line of sql.split('\n').filter((l) => l.startsWith('grant execute'))) assert.match(line, /^grant execute on function public\.[a-z_]+\([^)]*\) to authenticated;$/, line);
  for (const fn of WRITING_RPC) {
    assert.match(sql, new RegExp(`create function public\\.${fn}\\(`), fn);
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}\\(`), `${fn} granted`);
    assert.equal(WORK_RPC.includes(fn), false, `${fn} is listed once`);
  }
  for (const fn of ['work_doc_commit', 'work_doc_folders', 'work_doc_export', 'work_draft_set', 'work_image_add']) {
    const body = new RegExp(`create function public\\.${fn}\\([\\s\\S]*?\\n\\$\\$;`).exec(sql)[0];
    assert.match(body, /if not public\.mail_key_ok\(p_key\) then raise exception 'FORBIDDEN'/, `${fn} proves the server`);
  }
  for (const fn of ['work_text_writer', 'work_writers', 'work_writer_locked', 'work_doc_file', 'work_snippet']) {
    assert.doesNotMatch(sql, new RegExp(`grant execute on function public\\.${fn}\\(`), `${fn} stays internal`);
  }
});

test('the tables are select-only, and existing functions are patched from their live definitions', () => {
  for (const t of ['work_docs', 'work_drafts', 'work_notes', 'work_images', 'ideas', 'writing_phrases']) {
    assert.match(sql, new RegExp(`revoke all on public\\.${t} from public, anon, authenticated;`), t);
    assert.match(sql, new RegExp(`grant select on public\\.${t} to authenticated;`), t);
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security;`), t);
  }
  assert.doesNotMatch(sql, /create or replace function/, 'no existing function is retyped');
  for (const m of sql.matchAll(/d := pg_get_functiondef\('public\.([a-z_]+)\(/g)) assert.match(sql, new RegExp(`PATCH_${m[1]}_`), m[1]);
});

test('every code the migration raises has Arabic words', () => {
  const generic = workErrorText('NOTHING_LIKE_THIS');
  for (const m of sql.matchAll(/raise exception '([A-Z_]+)' using errcode/g)) assert.notEqual(workErrorText(m[1]), generic, m[1]);
});

// --- The routes ----------------------------------------------------------------------------------------------------------

const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const routes = walk('src/app/api/writing');

test('every route guards the work page, and writes come from the site', () => {
  assert.equal(routes.length, 8);
  for (const f of routes) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/export async function (GET|POST|PUT)\([\s\S]*?guard\(request, \{([^}]*)\}\)/g)) {
      assert.match(m[2], /page: 'work'/, `${f} ${m[1]}`);
      if (m[1] !== 'GET') assert.match(m[2], /mutating: true/, `${f} ${m[1]}`);
    }
    assert.ok(src.includes('guard(request'), f);
    assert.match(src, /params: Promise</, `${f}: route params are a Promise`);
  }
});

test('nothing about a text, a token or a reference goes in a log', () => {
  for (const f of [...routes, 'src/lib/storage/writing.ts']) assert.doesNotMatch(readFileSync(f, 'utf8'), /console\.(log|info|warn|error|debug)/, f);
});

test('no emoji in what was added', () => {
  for (const f of [...routes, 'src/lib/storage/writing.ts', 'supabase/migrations/20261102120000_writing_documents.sql', 'supabase/tests/writing_rules.sql']) {
    assert.equal(/\p{Extended_Pictographic}/u.test(readFileSync(f, 'utf8')), false, f);
  }
});

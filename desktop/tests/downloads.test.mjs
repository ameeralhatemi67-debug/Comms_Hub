// «فتح بالبرنامج الافتراضي» (src/downloads.ts, src/download-store.ts; Desktop_Power_Ideas.md P-28): which saved files
// may be opened in their program, which downloads are offered it, the mark of the web, and the ids. Real files in a
// scratch folder, with their Zone.Identifier streams.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DOWNLOAD_ROUTES, downloadFrom, isMarked, OPEN_KINDS, openKind, viewOf, zoneText } from '../src/downloads.ts';
import { DownloadStore, ensureMark, markOf, MAX_DOWNLOADS } from '../src/download-store.ts';
import { TOKEN } from '../src/files.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comms-hub-downloads-'));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
const put = (name, text = 'x') => {
  const f = path.join(dir, name);
  fs.writeFileSync(f, text);
  return f;
};
const SITE = 'https://comms-hub-three.vercel.app';
const ALLOWED = [SITE, 'http://127.0.0.1:3000'];
const UUID = '0b0e8c8e-6a1f-4d2a-9f7e-1c2d3e4f5a6b';

test('documents, pictures, sound and video open; programs, shortcuts, scripts, pages, macros and archives never do', () => {
  for (const [name, kind] of [
    ['تقرير الحملة.pdf', 'document'], ['خطة.DOCX', 'document'], ['أرقام.xlsx', 'document'], ['عرض.pptx', 'document'], ['ملاحظات.txt', 'document'],
    ['صورة.JPG', 'picture'], ['شعار.png', 'picture'], ['لقطة.heic', 'picture'],
    ['تسجيل.m4a', 'sound'], ['مقطع.mp3', 'sound'],
    ['مشهد.mp4', 'video'], ['مشهد.MOV', 'video'], ['report.exe.pdf', 'document'],
  ]) assert.equal(openKind(name), kind, name);
  const never = [
    'setup.exe', 'SETUP.EXE', 'run.bat', 'run.cmd', 'shortcut.lnk', 'site.url', 'script.ps1', 'script.psm1', 'script.js', 'script.jse', 'script.vbs',
    'script.vbe', 'script.wsf', 'script.wsh', 'app.hta', 'page.html', 'page.htm', 'page.mht', 'page.xhtml', 'drawing.svg', 'pkg.msi', 'pkg.msix',
    'pkg.appx', 'pkg.appinstaller', 'screen.scr', 'old.com', 'old.pif', 'reg.reg', 'tool.jar', 'tool.py', 'help.chm', 'panel.cpl', 'setup.inf',
    'explorer.scf', 'lib.library-ms', 'set.settingcontent-ms', 'app.application', 'disk.iso', 'disk.img', 'disk.vhd', 'disk.vhdx', 'pack.zip',
    'pack.7z', 'pack.rar', 'macro.docm', 'macro.xlsm', 'macro.pptm', 'macro.dotm', 'macro.xlam', 'macro.ppsm', 'addin.xll', 'feed.xml',
    'report.pdf.exe', 'report.pdf.', 'report.pdf ', 'report.exe:x.pdf', '.pdf', 'pdf', '', 'folder\\setup.exe',
  ];
  for (const name of never) assert.equal(openKind(name), null, name);
  for (const ext of ['exe', 'lnk', 'bat', 'cmd', 'ps1', 'js', 'vbs', 'msi', 'scr', 'hta', 'html', 'svg', 'docm', 'xlsm', 'zip']) assert.equal(Object.hasOwn(OPEN_KINDS, ext), false, ext);
  assert.ok(Object.values(OPEN_KINDS).every((k) => ['document', 'picture', 'sound', 'video'].includes(k)));
  assert.ok(Object.isFrozen(OPEN_KINDS));
  // an inherited name is no kind
  assert.equal(openKind('a.constructor'), null);
  assert.equal(openKind('a.__proto__'), null);
});

test('a download is offered only from the site\'s library, mail and messaging routes, on a compiled address', () => {
  assert.equal(downloadFrom(`${SITE}/api/media/${UUID}/content?download=1`, ALLOWED), 'library');
  assert.equal(downloadFrom(`${SITE}/api/media/${UUID}/content?v=3&download=1`, ALLOWED), 'library');
  assert.equal(downloadFrom(`${SITE}/api/media/${UUID}/content`, ALLOWED), 'library');
  assert.equal(downloadFrom(`${SITE}/api/mail/file/${UUID}`, ALLOWED), 'mail');
  assert.equal(downloadFrom(`${SITE}/api/mail/inbound/${UUID}/2`, ALLOWED), 'mail');
  assert.equal(downloadFrom(`http://127.0.0.1:3000/api/chat/file/${UUID}`, ALLOWED), 'messaging');
  for (const address of [
    `https://example.com/api/media/${UUID}/content?download=1`,
    `https://comms-hub-three.vercel.app.example.com/api/chat/file/${UUID}`,
    `http://localhost:3000/api/chat/file/${UUID}`,
    `${SITE}/api/chat/file/${UUID}#x`,
    `${SITE}/api/chat/file/${UUID}/x`,
    `${SITE}/api/media/${UUID}/content?download=1&x=1`,
    `${SITE}/api/writing/CH-12/file?kind=docx`,
    `${SITE}/downloads/setup.exe`,
    `blob:${SITE}/${UUID}`,
    'data:application/pdf;base64,AA==',
    'not an address',
  ]) assert.equal(downloadFrom(address, ALLOWED), null, address);
  assert.equal(downloadFrom(`${SITE}/api/chat/file/${UUID}`, [SITE].slice(1)), null, 'nothing without the list');
});

test('the routes are the same strings as the site\'s file routes', () => {
  const site = fs.readFileSync(new URL('../../src/lib/native/files.ts', import.meta.url), 'utf8');
  const id = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
  assert.ok(site.includes(`const ID = '${id}';`), 'the same id');
  for (const route of Object.values(DOWNLOAD_ROUTES).flat()) {
    const written = route.replace(id, '${ID}').replace(/\\/g, '\\\\');
    assert.ok(site.includes(`\`${written}\``), route);
  }
});

test('the mark of the web: the internet zone or a stricter one, read loosely, written with the site\'s address only', () => {
  assert.equal(isMarked('[ZoneTransfer]\r\nZoneId=3\r\nReferrerUrl=https://a/\r\nHostUrl=https://a/b\r\n'), true);
  assert.equal(isMarked('[ZoneTransfer]\nZoneId=4\n'), true);
  assert.equal(isMarked('﻿[ZoneTransfer]\r\nZoneId = 3\r\n'.replace('﻿', '')), true);
  assert.equal(isMarked('[\u0000Z\u0000o\u0000n\u0000e\u0000T\u0000r\u0000a\u0000n\u0000s\u0000f\u0000e\u0000r\u0000]\u0000\nZ\u0000o\u0000n\u0000e\u0000I\u0000d\u0000=\u00003\u0000\n'), true);
  for (const text of [null, '', '[ZoneTransfer]\r\nZoneId=2\r\n', '[ZoneTransfer]\r\nZoneId=0\r\n', 'ZoneId=3\r\n', '[ZoneTransfer]\r\n', '[Other]\r\nZoneId=3\r\n']) assert.equal(isMarked(text), false, String(text));
  assert.equal(zoneText(SITE), `[ZoneTransfer]\r\nZoneId=3\r\nHostUrl=${SITE}/\r\n`);
  assert.equal(isMarked(zoneText(SITE)), true);
});

test('a saved file keeps the mark it has, or is given the application\'s own; a file without one is never opened', { skip: process.platform !== 'win32' && 'streams are NTFS' }, () => {
  const kept = put('مرفق.pdf');
  fs.writeFileSync(`${kept}:Zone.Identifier`, '[ZoneTransfer]\r\nZoneId=3\r\nHostUrl=https://elsewhere/\r\n');
  assert.equal(ensureMark(kept, SITE), 'found');
  assert.match(markOf(kept), /elsewhere/, 'Chromium\'s mark is left as it was');
  const bare = put('صورة.png');
  assert.equal(markOf(bare), null);
  assert.equal(ensureMark(bare, SITE), 'written');
  assert.equal(markOf(bare), zoneText(SITE));
  const weak = put('ملاحظات.txt');
  fs.writeFileSync(`${weak}:Zone.Identifier`, '[ZoneTransfer]\r\nZoneId=1\r\n');
  assert.equal(ensureMark(weak, SITE), 'written', 'a local-intranet mark is raised to the internet zone');
  assert.equal(isMarked(markOf(weak)), true);
});

test('ids: 32 random bytes, the newest few, open only a plain marked file of a listed kind, show any', { skip: process.platform !== 'win32' && 'streams are NTFS' }, () => {
  const store = new DownloadStore();
  const id = store.start(SITE, 'library');
  assert.match(id, TOKEN);
  assert.notEqual(store.start(SITE, 'mail'), id);
  assert.deepEqual(store.openable(id), { ok: false, why: 'gone' }, 'not saved yet');

  const pdf = put('تقرير.pdf');
  const r = store.finish(id, pdf);
  assert.equal(r.kind, 'document');
  assert.equal(r.mark, 'written');
  assert.deepEqual(store.openable(id), { ok: true, file: pdf });
  assert.deepEqual(store.showable(id), { ok: true, file: pdf });
  assert.deepEqual(viewOf(r), { id, name: 'تقرير.pdf', kind: 'document' }, 'the page hears the name, never the folder');

  const exe = put('tool.exe', 'not a program');
  const e = store.start(SITE, 'messaging');
  assert.equal(store.finish(e, exe).kind, null);
  assert.deepEqual(store.openable(e), { ok: false, why: 'kind' });
  assert.deepEqual(store.showable(e), { ok: true, file: exe }, 'showing a file in its folder runs nothing');

  fs.rmSync(`${pdf}:Zone.Identifier`);
  assert.deepEqual(store.openable(id), { ok: false, why: 'unmarked' }, 'the mark taken off: not opened');
  fs.rmSync(pdf);
  assert.deepEqual(store.openable(id), { ok: false, why: 'gone' });
  assert.deepEqual(store.showable(id), { ok: false, why: 'gone' });

  const linked = path.join(dir, 'link.pdf');
  let canLink = true;
  try {
    fs.symlinkSync(exe, linked, 'file');
  } catch {
    canLink = false;
  }
  if (canLink) {
    const l = store.start(SITE, 'library');
    store.finish(l, linked);
    assert.deepEqual(store.openable(l), { ok: false, why: 'gone' }, 'a link is not followed');
  }

  assert.deepEqual(store.openable('not-an-id'), { ok: false, why: 'gone' });
  const dropped = store.start(SITE, 'library');
  store.drop(dropped);
  assert.equal(store.finish(dropped, put('x.pdf')), null, 'a cancelled download is forgotten');

  const first = store.start(SITE, 'library');
  for (let i = 0; i < MAX_DOWNLOADS; i++) store.start(SITE, 'library');
  assert.equal(store.finish(first, put('old.pdf')), null, 'only the newest are kept');
  assert.ok(store.clear() <= MAX_DOWNLOADS);
  assert.deepEqual(store.showable(e), { ok: false, why: 'gone' }, '«مسح بيانات هذا الجهاز» forgets every id');
});

// The application's two Arabic pages: the connection screen and the note before an outside connection.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CONNECT_NOTE } from '../src/navigation.ts';

const read = (name) => fs.readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
const offline = read('offline.html');
const note = read('connect-note.html');

test('both pages are Arabic, right to left, and lock themselves down', () => {
  for (const html of [offline, note]) {
    assert.match(html, /<html lang="ar" dir="rtl">/);
    assert.match(html, /<meta http-equiv="Content-Security-Policy" content="default-src 'none';/);
    assert.equal(/https?:\/\/(?!\/)/.test(html.replace(/http-equiv/g, '')), false, 'no outside address is loaded');
  }
});

test('the connection screen offers «إعادة المحاولة» and says why for a certificate', () => {
  assert.match(offline, /إعادة المحاولة/);
  assert.match(offline, /تعذّر الوصول إلى المركز/);
  assert.match(offline, /تعذّر التحقق من أمان الاتصال/);
  assert.match(offline, /<!-- logo -->/, 'the brand mark is filled in by the build');
});

test('the note carries the plan\'s sentence verbatim, a way on and a way back', () => {
  assert.ok(note.includes(CONNECT_NOTE));
  assert.match(note, /متابعة في المتصفح/);
  assert.match(note, /إلغاء/);
});

test('no emoji in the application\'s pages or sources', () => {
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{FE0F}]/u;
  const dir = new URL('../src/', import.meta.url);
  for (const name of fs.readdirSync(dir)) {
    assert.equal(emoji.test(fs.readFileSync(new URL(name, dir), 'utf8')), false, name);
  }
});

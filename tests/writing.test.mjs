// «ورقة الكتابة» (MVP_draft.md section 68): the check every document passes on the server, its plain text, the table designs, the
// Word file read back, the keys and the style rules. The sheet itself is clicked through by qa/writing-flow.cjs, and the
// database's rules run in supabase/tests/writing_rules.sql.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import mammoth from 'mammoth';
import JSZip from 'jszip';
import { TABLE_DESIGNS, cellStyle, checkDoc, designVars, docIsEmpty, docStats, docText, flatten, imageSrc, isDark, rgba, safeHref, textToDoc } from '../src/lib/writing/doc.ts';
import { SHORTCUTS, keyCode, shortcutOf } from '../src/lib/writing/shortcuts.ts';
import { styleNotes } from '../src/lib/writing/style.ts';
import { docToDocx } from '../src/lib/writing/docx.ts';
import { resumeRow, reviewBase, staleCopies, writingQueue } from '../src/lib/writing/flow.ts';

const p = (text, attrs) => ({ type: 'paragraph', ...(attrs ? { attrs } : {}), content: [{ type: 'text', text }] });
const doc = (...content) => ({ type: 'doc', content });
const UUID = '11111111-2222-4333-8444-555555555555';

test('a document with anything unknown is refused', () => {
  assert.equal(checkDoc(doc({ type: 'script', content: [] })).ok, false);
  assert.equal(checkDoc(doc({ type: 'paragraph', content: [{ type: 'iframe' }] })).ok, false);
  assert.equal(checkDoc({ type: 'nope', content: [] }).ok, false);
  assert.equal(checkDoc(null).ok, false);
  assert.equal(checkDoc(doc('text')).ok, false);
});

test('unknown attributes and marks are dropped, and a bad value never survives', () => {
  const c = checkDoc(doc({ type: 'paragraph', attrs: { onclick: 'x()', textAlign: 'center', dir: 'sideways' }, content: [{ type: 'text', text: 'نص', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }, { type: 'bold' }, { type: 'evil' }, { type: 'textStyle', attrs: { color: 'url(x)', fontFamily: 'Comic Sans', fontSize: '18px', backgroundColor: '#F8E4A8' } }] }] }));
  assert.ok(c.ok);
  const para = c.doc.content[0];
  assert.deepEqual(para.attrs, { textAlign: 'center' });
  assert.deepEqual(para.content[0].marks, [{ type: 'bold' }, { type: 'textStyle', attrs: { backgroundColor: '#f8e4a8', fontSize: '18px' } }]);
});

test('only the web and mail are linkable', () => {
  assert.equal(safeHref('https://example.test/a'), 'https://example.test/a');
  assert.equal(safeHref('mailto:a@b.test'), 'mailto:a@b.test');
  assert.equal(safeHref('javascript:alert(1)'), undefined);
  assert.equal(safeHref('data:text/html,x'), undefined);
});

test('a font outside the site\'s list is dropped', () => {
  const c = checkDoc(doc({ type: 'paragraph', content: [{ type: 'text', text: 'ن', marks: [{ type: 'textStyle', attrs: { fontFamily: '"Amiri"' } }] }] }));
  assert.equal(c.doc.content[0].content[0].marks[0].attrs.fontFamily, 'Amiri');
});

test('a table keeps its design and each cell its own fill and lines', () => {
  const cell = (attrs) => ({ type: 'tableCell', attrs, content: [p('خلية')] });
  const c = checkDoc(doc({ type: 'table', attrs: { design: 'gold' }, content: [{ type: 'tableRow', content: [cell({ fill: '#14684F', fillAlpha: 40, line: '#a23a2e', lineAlpha: 50, onload: 'x' }), cell({ fill: 'red', fillAlpha: 400 })] }] }));
  assert.ok(c.ok);
  const [a, b] = c.doc.content[0].content[0].content;
  assert.equal(c.doc.content[0].attrs.design, 'gold');
  assert.deepEqual(a.attrs, { fill: '#14684f', fillAlpha: 40, line: '#a23a2e', lineAlpha: 50 });
  assert.equal(b.attrs, undefined);
  assert.equal(checkDoc(doc({ type: 'table', attrs: { design: 'nope' } })).doc.content[0].attrs, undefined);
});

test('a picture is an id, never an address', () => {
  const c = checkDoc(doc({ type: 'image', attrs: { src: 'https://evil.test/x.png', asset: UUID, v: 3, alt: 'وصف', width: 50 } }, { type: 'image', attrs: { asset: 'not-a-uuid' } }));
  assert.deepEqual(c.doc.content[0].attrs, { asset: UUID, v: 3, alt: 'وصف', width: 50 });
  assert.equal(c.doc.content[1].attrs.asset, undefined);
  assert.equal(imageSrc('CH-1', { asset: UUID, v: 3 }), `/api/media/${UUID}/content?v=3`);
  assert.equal(imageSrc('CH-1', { imageId: UUID }), `/api/writing/CH-1/image/${UUID}`);
});

test('the size of a document is bounded', () => {
  assert.deepEqual(checkDoc(doc(p('س'.repeat(200001)))), { ok: false, error: 'DOC_TOO_BIG' });
  let deep = p('ن');
  for (let i = 0; i < 20; i++) deep = { type: 'blockquote', content: [deep] };
  assert.deepEqual(checkDoc(doc(deep)), { ok: false, error: 'DOC_TOO_BIG' });
});

test('plain text keeps the reading order of a document', () => {
  const d = doc(
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'العنوان' }] },
    p('فقرة'),
    { type: 'bulletList', content: [{ type: 'listItem', content: [p('أول')] }, { type: 'listItem', content: [p('ثان')] }] },
    { type: 'orderedList', content: [{ type: 'listItem', content: [p('واحد')] }] },
    { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', content: [p('أ')] }, { type: 'tableHeader', content: [p('ب')] }] }] },
    { type: 'image', attrs: { alt: 'ملصق' } },
    { type: 'paragraph', content: [{ type: 'text', text: 'رابط ' }, { type: 'mediaLink', attrs: { name: 'ملف' } }] },
  );
  assert.equal(docText(d), 'العنوان\nفقرة\n• أول\n• ثان\n1. واحد\nأ | ب\n[صورة: ملصق]\nرابط ملف');
  assert.equal(docText(d, { images: false }).includes('صورة'), false);
  assert.equal(docIsEmpty(doc({ type: 'paragraph' })), true);
  assert.deepEqual(docText(textToDoc('سطر\n\nآخر')), 'سطر\n\nآخر');
});

test('words and reading time', () => {
  assert.deepEqual({ ...docStats('كلمة كلمة\nكلمة'), minutes: 0 }, { words: 3, chars: 13, minutes: 0 });
});

test('seven table designs, each complete', () => {
  assert.equal(Object.keys(TABLE_DESIGNS).length, 7);
  for (const d of Object.values(TABLE_DESIGNS)) assert.match(d.line, /^#[0-9a-f]{6}$/);
  assert.equal(designVars('dark')['--t-head'], '#14684f');
  assert.equal(designVars('rule')['--t-head'], 'transparent');
  assert.equal(designVars('nothing')['--t-head'], TABLE_DESIGNS.grid.head);
});

test('transparency: live on the page, flattened for Word', () => {
  assert.equal(rgba('#a23a2e', 50), 'rgba(162,58,46,0.5)');
  assert.equal(rgba('#a23a2e', 0), 'rgba(162,58,46,1)');
  assert.equal(flatten('#000000', 50), '#808080');
  assert.equal(flatten('#14684f', 0), '#14684f');
  assert.equal(flatten('#14684f', 100), '#ffffff');
  assert.deepEqual(cellStyle({ fill: '#f9e5e1', fillAlpha: 25 }), { backgroundColor: 'rgba(249,229,225,0.75)' });
  assert.equal(cellStyle({ fill: '#0b3a2d' }).color, '#ffffff');
  assert.equal(cellStyle({ line: '#a23a2e', lineAlpha: 50 }).borderColor, 'rgba(162,58,46,0.5)');
  assert.equal(isDark('#ffffff'), false);
});

test('a key is read by its place, so an Arabic keyboard works the same', () => {
  const e = (code, o = {}) => ({ code, ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, ...o });
  assert.equal(shortcutOf(e('KeyB')).id, 'bold');
  assert.equal(shortcutOf(e('Digit2', { altKey: true })).id, 'h2');
  assert.equal(shortcutOf(e('Period', { shiftKey: true })).id, 'bigger');
  assert.equal(shortcutOf(e('KeyS', { ctrlKey: false, metaKey: true })).id, 'save');
  assert.equal(shortcutOf({ code: 'KeyB', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }), null);
  assert.equal(shortcutOf(e('KeyQ')), null);
});

test('no two commands share a key, and the sheet handles every one', () => {
  const codes = SHORTCUTS.map((s) => keyCode(s.keys));
  assert.equal(new Set(codes).size, codes.length);
  const sheet = readFileSync(new URL('../src/components/writing/sheet.tsx', import.meta.url), 'utf8');
  for (const s of SHORTCUTS) assert.ok(sheet.includes(`case '${s.id}'`), s.id);
});

test('the style check says what it found', () => {
  const notes = styleNotes('وقد تم توقيع الاتفاقية بشكل كبير  اليوم');
  assert.ok(notes.some((n) => n.text.includes('«تم»')));
  assert.ok(notes.some((n) => n.text.includes('بشكل كبير')));
  assert.ok(notes.some((n) => n.text.includes('مسافتان')));
  assert.ok(styleNotes('نص نص').some((n) => n.text.includes('مكررة')));
  assert.ok(styleNotes(Array(35).fill('كلمة').join(' ').replace(/كلمة كلمة/g, 'كلمة أخرى')).some((n) => n.text.includes('طويلة')));
  assert.deepEqual(styleNotes('نص سليم.'), []);
});

test('the Word file is right to left, with its table and colours', async () => {
  const d = doc(
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'بيان الشراكة' }] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'التفاصيل' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'نص غامق', marks: [{ type: 'bold' }, { type: 'textStyle', attrs: { color: '#a23a2e', fontFamily: 'Amiri', fontSize: '20px' } }] }] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [p('بند')] }] },
    {
      type: 'table',
      attrs: { design: 'dark' },
      content: [
        { type: 'tableRow', content: [{ type: 'tableHeader', content: [p('العمود')] }, { type: 'tableHeader', content: [p('الثاني')] }] },
        { type: 'tableRow', content: [{ type: 'tableCell', attrs: { fill: '#000000', fillAlpha: 50 }, content: [p('خلية')] }, { type: 'tableCell', attrs: { line: '#a23a2e' }, content: [p('أخرى')] }] },
      ],
    },
    { type: 'paragraph', content: [{ type: 'text', text: 'موقع', marks: [{ type: 'link', attrs: { href: 'https://example.test' } }] }] },
    { type: 'paragraph', content: [{ type: 'mediaLink', attrs: { asset: UUID, v: 2, name: 'ملصق' } }] },
    { type: 'image', attrs: { alt: 'لا يصل' } },
  );
  const blob = await docToDocx(d, { title: 'بيان', headerText: 'CH-1 · مسودة', origin: 'https://site.test' });
  const bytes = Buffer.from(await blob.arrayBuffer());
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('word/document.xml').async('string');
  assert.match(xml, /<w:bidi/);
  assert.match(xml, /<w:rtl/);
  assert.match(xml, /<w:bidiVisual/);
  assert.match(xml, /w:fill="14684F"/, 'the design fills the header');
  assert.match(xml, /w:fill="808080"/, 'a transparent fill is flattened');
  assert.match(xml, /w:color="A23A2E"/);
  assert.match(xml, /w:cs="Amiri"/);
  assert.match(xml, /\[صورة: لا يصل\]/, 'a picture that cannot be read is named');
  const header = await zip.file(/word\/header\d*\.xml/)[0].async('string');
  assert.ok(header.includes('CH-1 · مسودة'));
  const rels = await zip.file('word/_rels/document.xml.rels').async('string');
  assert.ok(rels.includes(`https://site.test/api/media/${UUID}/content`));
  const back = await mammoth.convertToHtml({ buffer: bytes });
  assert.ok(back.value.includes('بيان الشراكة'));
  assert.match(back.value, /<table>/);
  assert.match(back.value, /<h1>/);
});

// What waits for a writer, and what a review compares (MVP_draft.md 68.1, 68.6).
const stage = (extra) => ({ id: 's', pos: 0, name: 'النص', role: 'writer', who: 'k@x.sa', due_on: '2026-10-20', after_pos: [], gate: false, gate_by: null, started_at: null, done_at: null, ...extra });
const work = (extra) => ({ id: 'CH-1', title: 'عمل', status: 'IN_PRODUCTION', closed_at: null, assignee: 'l@x.sa', created_by: 'l@x.sa', people: [], due: '2026-10-30', ...extra });
const queue = (items, rest = {}) => writingQueue({ items, tasks: [], latest: {}, copies: [], me: 'k@x.sa', today: '2026-10-12', nameOf: (e) => e, ...rest });

test('a stage writer sees their stage, and only while it can be written', () => {
  const [r] = queue([{ w: work(), stages: [stage()], flags: 0 }]);
  assert.equal(r.group, 'ready');
  assert.equal(r.href, '/work/CH-1?write=1');
  assert.match(r.line, /المسؤول/);
  assert.equal(queue([{ w: work(), stages: [stage({ who: 'o@x.sa' })], flags: 0 }]).length, 0, 'held by someone else');
  assert.equal(queue([{ w: work(), stages: [stage({ role: 'designer' })], flags: 0 }]).length, 0, 'not a writing stage');
  assert.equal(queue([{ w: work(), stages: [stage({ done_at: 'x' })], flags: 0 }]).length, 0, 'finished');
  assert.equal(queue([{ w: work({ status: 'IN_REVIEW' }), stages: [stage()], flags: 0 }]).length, 0, 'in review');
  assert.equal(queue([{ w: work({ closed_at: 'x' }), stages: [stage()], flags: 0 }]).length, 0, 'closed');
  const waits = [stage({ id: 'a', pos: 0, who: 'o@x.sa' }), stage({ id: 'b', pos: 1, after_pos: [0] })];
  assert.equal(queue([{ w: work(), stages: waits, flags: 0 }]).length, 0, 'a stage still waiting is not work yet');
});

test('what came back comes first, then the late, the ready, the old copies and the library', () => {
  const rows = queue(
    [
      { w: work({ id: 'CH-1', assignee: 'k@x.sa' }), stages: [], flags: 0 },
      { w: work({ id: 'CH-2' }), stages: [stage({ due_on: '2026-10-01' })], flags: 0 },
      { w: work({ id: 'CH-3', status: 'CHANGES_REQUESTED', assignee: 'k@x.sa' }), stages: [], flags: 2 },
      { w: work({ id: 'CH-4', assignee: 'k@x.sa' }), stages: [], flags: 0 },
    ],
    {
      latest: { 'CH-4': 3 },
      copies: [{ work_id: 'CH-4', platform: 'x', n: 1, base: 2 }, { work_id: 'CH-4', platform: 'x', n: 2, base: 3 }, { work_id: 'CH-4', platform: 'linkedin', n: 1, base: 1 }],
      tasks: [
        { id: 't', what: 'عنوان', kind: 'copy', assignee: 'k@x.sa', status: 'open', due: '2026-10-11T10:00:00Z', asset_id: 'a1' },
        { id: 'u', what: 'غيرها', kind: 'design', assignee: 'k@x.sa', status: 'open', due: '2026-10-11T10:00:00Z', asset_id: 'a2' },
      ],
    },
  );
  assert.deepEqual(rows.map((r) => r.group), ['back', 'late', 'ready', 'copies', 'library']);
  assert.match(rows[0].line, /2/);
  assert.equal(rows[3].href, '/work/CH-4?write=linkedin', 'an old copy opens on that copy');
  assert.equal(rows[4].href, '/media/a1?copy=1', 'a request from the library opens on the file');
  assert.equal(rows[4].tone, 'late');
  assert.deepEqual(staleCopies('CH-4', 3, [{ work_id: 'CH-4', platform: 'x', n: 1, base: 2 }, { work_id: 'CH-4', platform: 'x', n: 2, base: 3 }]), [], 'only the newest copy of a platform counts');
});

test('«تابع الكتابة» prefers a draft, and an old copy alone is no place to resume', () => {
  const rows = [{ group: 'back', work: 'CH-1' }, { group: 'ready', work: 'CH-2' }];
  assert.equal(resumeRow(rows, (id) => id === 'CH-2').work, 'CH-2');
  assert.equal(resumeRow(rows, () => false).work, 'CH-1');
  assert.equal(resumeRow([{ group: 'copies', work: 'CH-3' }], () => false), null);
  assert.equal(resumeRow([{ group: 'library', work: null }], () => true), null);
});

test('a review compares with the approved wording, else what came back, else the round before', () => {
  const texts = [{ n: 1, body: 'قديم' }, { n: 2, body: 'وسط' }, { n: 3, body: 'جديد' }];
  const part = { key: 'text', kind: 'text', ver: 't3', snap: 'جديد' };
  const base = (extra) => reviewBase({ part, approvals: [], flags: [], texts, variants: [], cycles: [], cycle: 3, ...extra });
  assert.equal(base({ approvals: [{ part: 'text', snap: 'قديم' }] }).body, 'قديم');
  assert.equal(base({ flags: [{ part: 'text', ver: 't2' }] }).body, 'وسط');
  assert.match(base({ flags: [{ part: 'text', ver: 't2' }] }).label, /طلب التعديل/);
  assert.equal(base({ cycles: [{ n: 1, text_n: 1 }, { n: 2, text_n: 2 }, { n: 3, text_n: 3 }] }).body, 'وسط');
  assert.equal(base({ cycles: [{ n: 3, text_n: 3 }] }), null, 'the first round has nothing to compare');
  assert.equal(base({ approvals: [{ part: 'text', snap: 'جديد' }] }), null, 'nothing changed since approval');
  const copy = reviewBase({ part: { key: 'v:x', kind: 'copy', ver: 'c2', snap: 'ب' }, approvals: [], flags: [{ part: 'v:x', ver: 'c1' }], texts, variants: [{ platform: 'x', n: 1, body: 'أ' }, { platform: 'linkedin', n: 1, body: 'ج' }], cycles: [], cycle: 2 });
  assert.equal(copy.body, 'أ');
});

// Action_Plan.md section 5: the tester feedback channel and error monitoring. The database half is
// supabase/tests/feedback_errors_rules.sql (qa/feedback-errors-rules.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_SEVERITY,
  KIND_AR,
  MAX_REPORTS_PER_VISIT,
  NOTES_PER_DAY,
  NOTE_KINDS,
  SEVERITIES,
  describeError,
  feedbackErrorAr,
  reportGate,
  worthReporting,
} from '../src/lib/feedback/rules.ts';
import {
  CLICK_SLOP,
  KIND,
  MAX_MARKS,
  MAX_NOTE_ERRORS,
  MAX_OUTLINE,
  PRIVATE_PATHS,
  contextLines,
  devBrief,
  elementName,
  groupInbox,
  isPrivatePage,
  markBox,
  markFrom,
  markLine,
  markName,
  packOutline,
  pickTarget,
} from '../src/lib/feedback/marks.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const MARKS_SQL = 'supabase/migrations/20261102180000_feedback_marks.sql';

test('kinds and words', () => {
  assert.deepEqual(NOTE_KINDS.map((k) => k[0]), ['problem', 'idea', 'question']);
  assert.deepEqual(SEVERITIES.map((k) => k[0]), ['blocking', 'annoying', 'cosmetic']);
  assert.equal(DEFAULT_SEVERITY, 'annoying');
  assert.equal(KIND_AR.error, 'خطأ في الصفحة');
  assert.match(feedbackErrorAr('FEEDBACK_LIMIT'), /50/);
  assert.match(feedbackErrorAr('TEXT_TOO_LONG'), /2000/);
  assert.match(feedbackErrorAr('something else'), /أعد المحاولة/);
});

test('browser noise and cancelled requests are not reported', () => {
  for (const m of ['ResizeObserver loop completed with undelivered notifications.', 'Script error.', 'AbortError: The user aborted a request.', 'TypeError: Failed to fetch', 'NetworkError when attempting to fetch resource.', '', 'ab'])
    assert.equal(worthReporting(m), false, m);
  assert.equal(worthReporting("TypeError: Cannot read properties of undefined (reading 'title')"), true);
});

test('a visit sends each message once and at most five', () => {
  const g = reportGate();
  assert.equal(g('Error one'), true);
  assert.equal(g('Error one'), false);
  for (let i = 2; i <= MAX_REPORTS_PER_VISIT; i += 1) assert.equal(g(`Error ${i} here`), true);
  assert.equal(g('One more error'), false);
});

test('the place of an error has no address, line or column', () => {
  const e = new Error('boom here');
  e.stack = 'Error: boom here\n    at WorkItem (https://comms-hub-three.vercel.app/_next/static/chunks/item-abc123.js:10:20)\n    at x (y.js:1:2)';
  const d = describeError(e);
  assert.equal(d.message, 'boom here');
  assert.match(d.where, /WorkItem/);
  assert.doesNotMatch(d.where, /https?:|:\d+/);
  assert.equal(describeError('a string error').message, 'a string error');
  assert.equal(describeError(undefined).message, '');
  assert.equal(describeError(new Error('x'.repeat(500))).message.length, 300);
});

test('wiring: the shell reports and offers the note, the error page reports, the inbox is a settings tab', () => {
  const shell = read('src/components/shell.tsx');
  assert.match(shell, /<FeedbackButton \/>/);
  assert.match(shell, /useErrorReporter\(\)/);
  assert.match(read('src/app/error.tsx'), /reportError\(error\)/);
  const sup = read('src/components/supporting.tsx');
  assert.match(sup, /id: 'feedback'/);
  assert.match(sup, /<FeedbackTab \/>/);
  const comp = read('src/components/feedback.tsx');
  for (const rpc of ['feedback_submit', 'error_report', 'feedback_list']) assert.ok(comp.includes("rpc('" + rpc + "'"), rpc);
  // The reporter never sends the page's query, a person's text or any address.
  assert.match(comp, /window\.location\.pathname/);
  assert.doesNotMatch(comp, /location\.href|location\.search|document\.cookie|localStorage/);
});

const VIEW = { w: 1000, h: 500 };

test('a click is a pointer, a drag is a box, in thousandths of the screen', () => {
  assert.deepEqual(markFrom({ x: 500, y: 250 }, { x: 500 + CLICK_SLOP - 1, y: 250 }, VIEW), { t: 'p', x: 500, y: 500, w: 0, h: 0 });
  assert.deepEqual(markFrom({ x: 100, y: 50 }, { x: 300, y: 150 }, VIEW), { t: 'b', x: 100, y: 100, w: 200, h: 200 });
  // Dragged the other way, the box is the same.
  assert.deepEqual(markFrom({ x: 300, y: 150 }, { x: 100, y: 50 }, VIEW), { t: 'b', x: 100, y: 100, w: 200, h: 200 });
  // Past the edge of the screen it stops at the edge.
  assert.deepEqual(markFrom({ x: 900, y: 450 }, { x: 1400, y: 900 }, VIEW), { t: 'b', x: 900, y: 900, w: 100, h: 100 });
  assert.deepEqual(markBox({ x: 100, y: 100, w: 200, h: 200 }, VIEW), { x: 100, y: 50, w: 200, h: 100 });
});

test('a mark finds what it sits on, by geometry alone', () => {
  const page = { x: 0, y: 0, w: 1000, h: 500 };
  const card = { x: 100, y: 100, w: 400, h: 200 };
  const button = { x: 120, y: 120, w: 80, h: 30 };
  const items = [page, card, button];
  assert.equal(pickTarget(items, markFrom({ x: 150, y: 130 }, { x: 150, y: 130 }, VIEW), VIEW), 2, 'a pointer takes the smallest thing under it');
  assert.equal(pickTarget(items, markFrom({ x: 400, y: 250 }, { x: 400, y: 250 }, VIEW), VIEW), 1);
  assert.equal(pickTarget(items, markFrom({ x: 110, y: 110 }, { x: 210, y: 160 }, VIEW), VIEW), 2, 'a box around the button finds the button');
  assert.equal(pickTarget(items, markFrom({ x: 90, y: 90 }, { x: 510, y: 310 }, VIEW), VIEW), 1, 'a box around the card finds the card');
  assert.equal(pickTarget([card], markFrom({ x: 900, y: 450 }, { x: 900, y: 450 }, VIEW), VIEW), -1, 'nothing under it');
});

test('the outline is rectangles and whole numbers, clipped to the screen', () => {
  const o = packOutline(
    [
      { x: -50, y: 10.4, w: 150, h: 40.2, kind: KIND.control },
      { x: 0, y: 0, w: 2000, h: 2000, kind: KIND.area },
      { x: 10, y: 10, w: 3, h: 3, kind: KIND.control },
      { x: 2000, y: 10, w: 100, h: 100, kind: KIND.text },
      { x: 0, y: 10, w: 100, h: 40, kind: KIND.control },
    ],
    VIEW,
  );
  // The first and last lines land on the same rectangle once clipped, so it is kept once; the tiny one and the one off screen go.
  assert.deepEqual(o, { w: 1000, h: 500, r: [[0, 0, 1000, 500, KIND.area], [0, 10, 100, 40, KIND.control]] });
  assert.ok(o.r.flat().every(Number.isInteger));
  assert.equal(JSON.stringify(o).match(/[^\d[\],:{}"whr-]/), null, 'no words');
});

test('when there are too many rectangles, controls stay and areas go', () => {
  const many = [];
  for (let i = 0; i < 300; i += 1) many.push({ x: i, y: 0, w: 50, h: 50, kind: KIND.area });
  for (let i = 0; i < 20; i += 1) many.push({ x: i, y: 100, w: 50, h: 20, kind: KIND.control });
  const o = packOutline(many, VIEW);
  assert.equal(o.r.length, MAX_OUTLINE);
  assert.equal(o.r.filter((r) => r[4] === KIND.control).length, 20);
  assert.ok(JSON.stringify(o).length < 6000, 'fits the column');
});

test('private pages and names', () => {
  assert.ok(isPrivatePage('/mail'));
  assert.ok(isPrivatePage('/mail/chat'));
  assert.equal(isPrivatePage('/mailbox'), false);
  assert.equal(isPrivatePage('/work'), false);
  assert.equal(elementName('زر', '  إرسال \n الآن ', false), 'زر «إرسال الآن»');
  assert.equal(elementName('زر', 'رسالة من سارة', true), 'زر', 'a private spot keeps only the word');
  assert.equal(elementName('منطقة', '', false), 'منطقة');
  assert.equal(elementName('زر', 'ن'.repeat(90), false).length, 'زر «»'.length + 40);
});

const row = (over) => ({ id: 'x', kind: 'problem', author: 'a@t.test', author_name: 'أ', page: '/work', body: 'نص', place: null, count: 1, state: 'new', created_at: '2026-11-02T10:00:00Z', last_at: '2026-11-02T10:00:00Z', handled_by: null, handled_at: null, ...over });

test('the inbox: new first, then what stops work, merged notes under the one they joined', () => {
  const list = groupInbox([
    row({ id: 'seen', state: 'seen', severity: 'blocking', last_at: '2026-11-02T12:00:00Z' }),
    row({ id: 'late', severity: 'cosmetic', last_at: '2026-11-02T13:00:00Z' }),
    row({ id: 'stop', severity: 'blocking' }),
    row({ id: 'kid', duplicate_of: 'stop' }),
    row({ id: 'orphan', duplicate_of: 'beyond-the-limit', severity: 'annoying' }),
  ]);
  assert.deepEqual(list.map((e) => e.row.id), ['stop', 'orphan', 'late', 'seen']);
  assert.deepEqual(list[0].merged.map((r) => r.id), ['kid']);
});

test('the context reads in Arabic and never shows a role key', () => {
  const name = (k) => ({ writer: 'كاتب المحتوى', designer: 'المصمم' })[k] ?? 'غير معروف';
  const lines = contextLines({ role: 'writer', viewAs: 'designer', app: 'desktop', appVersion: '0.6.0', w: 1280, h: 900, dpr: 1.25, theme: 'dark', build: 'abc1234', dialog: 'الجدولة' }, name);
  assert.deepEqual(Object.fromEntries(lines), { الدور: 'كاتب المحتوى', 'عرض بصفة': 'المصمم', الجهاز: 'تطبيق الحاسوب 0.6.0', الشاشة: '1280×900 بكثافة 1.25', المظهر: 'مسائي', 'إصدار الموقع': 'abc1234', 'النافذة المفتوحة': 'الجدولة' });
  assert.deepEqual(contextLines(null, name), []);
});

test('the brief carries everything a fixer needs and the page\'s files', () => {
  const marks = [{ t: 'b', x: 120, y: 300, w: 200, h: 100, el: 'زر «إرسال»', sel: 'div.actions > button.primary' }];
  assert.equal(markName(marks[0], 0), '1. زر «إرسال»');
  assert.match(markLine(marks[0], 0), /^1\. زر «إرسال»، مربع عند 12% و30% بحجم 20% في 10%$/);
  const text = devBrief(row({ severity: 'blocking', marks, context: { role: 'writer', errors: ['boom'] } }), { roleName: () => 'كاتب المحتوى', sources: ['src/components/work/list.tsx'] });
  for (const part of ['[مشكلة · توقف عملي · جديد] /work', 'نص', 'الدور: كاتب المحتوى', 'div.actions > button.primary', '- boom', '- src/components/work/list.tsx']) assert.ok(text.includes(part), part);
  assert.doesNotMatch(text, /writer/);
  assert.equal(markLine({ t: 'p', x: 500, y: 500, w: 0, h: 0, el: '', sel: '' }, 1), '2. مكان في الصفحة، عند 50% من العرض و50% من الارتفاع');
});

test('the interface and the database hold the same limits', () => {
  const sql = read(MARKS_SQL);
  assert.equal(NOTES_PER_DAY, 50);
  assert.match(sql, /interval '1 day'\) >= 50/);
  assert.equal(MAX_MARKS, 3);
  assert.match(sql, /jsonb_array_length\(v_out\) >= 3/);
  assert.equal(MAX_OUTLINE, 140);
  assert.match(sql, /jsonb_array_length\(p_outline -> 'r'\) > 140/);
  assert.equal(MAX_NOTE_ERRORS, 3);
  assert.match(sql, /order by o limit 3/);
  assert.deepEqual(PRIVATE_PATHS, ['/mail']);
  assert.match(sql, /p_page ~ '\^\/mail\(\/\|\$\)'/);
  for (const [k] of SEVERITIES) assert.ok(sql.includes(`'${k}'`), k);
});

test('nothing here takes a picture or reads what a person typed', () => {
  const capture = read('src/lib/feedback/capture.ts');
  const layer = read('src/components/feedback-mark.tsx');
  for (const text of [capture, layer, read('src/lib/feedback/marks.ts'), read('src/components/feedback.tsx')]) {
    assert.doesNotMatch(text, /html2canvas|html-to-image|toDataURL|drawImage|getDisplayMedia|outerHTML|innerHTML/);
  }
  // A field's name comes from its label, never from its value, and an editor's text is never read.
  assert.doesNotMatch(capture, /\.value\b|innerText/);
  assert.match(capture, /nodeType === 3/);
  // The private parts are marked where they are drawn.
  assert.match(read('src/components/writing/sheet.tsx'), /wr-sheet[^\n]*data-fb-private/);
  assert.match(read('src/components/native/phone-lock.tsx'), /data-no-note/);
});

test('wiring of the note: every window, the key, the version and the account page', () => {
  const comp = read('src/components/feedback.tsx');
  assert.match(comp, /createPortal\(\s*<button type="button" className="fb-float"/);
  assert.match(comp, /e\.code !== 'KeyN'/);
  assert.match(comp, /document\.body,\n\s*\)\}/);
  for (const rpc of ['feedback_merge', 'feedback_mark']) assert.ok(comp.includes(`'${rpc}'`), rpc);
  assert.ok(comp.includes("rpc('feedback_mine'"));
  assert.match(read('src/app/layout.tsx'), /name="hub-build"/);
  assert.match(read('src/components/supporting.tsx'), /<MyNotes \/>/);
  // The note's window and the two public pages say what is sent.
  assert.match(comp, /لا تُرسل صورة للشاشة/);
  assert.doesNotMatch(comp, /ولا يُرسل غير ذلك/);
  const privacy = read('public/privacy.html');
  assert.match(privacy, /no picture of your screen/);
  assert.match(privacy, /لا تُلتقط صورة للشاشة/);
});

test('the migration keeps the table closed and every helper private', () => {
  const sql = read(MARKS_SQL);
  assert.doesNotMatch(sql, /create policy/);
  assert.match(sql, /revoke all on function public\.feedback_private_page\(text\), public\.feedback_clean_marks\(jsonb, boolean\), public\.feedback_clean_outline\(jsonb\),\n\s+public\.feedback_clean_context\(jsonb, text, boolean\), public\.feedback_tell\(text, text\) from public, anon, authenticated/);
  assert.match(sql, /has_capability\('settings\.view', null\)/);
  assert.match(sql, /has_capability\('settings\.manage', null\)/);
  // «للعلم», the tier that is never pushed.
  assert.match(sql, /work_notify\(p_author, 'info'/);
});

test('the migration closes the table and scrubs', () => {
  const sql = read('supabase/migrations/20261015240000_feedback_errors.sql');
  assert.match(sql, /alter table public\.feedback_reports enable row level security/);
  assert.doesNotMatch(sql, /create policy/);
  assert.match(sql, /revoke all on function public\.feedback_clean_page\(text\), public\.feedback_scrub\(text, int\) from public, anon, authenticated/);
  assert.match(sql, /has_capability\('settings\.view', null\)/);
  assert.match(sql, /has_capability\('settings\.manage', null\)/);
});

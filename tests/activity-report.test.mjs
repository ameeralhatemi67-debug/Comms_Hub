// «سجل النشاط» and «تقرير الشهر» (MVP_draft.md 66): the numbers every report reads, the way one list is made of three
// logs, right-to-left text for the PDF, and the Excel file's own zip. qa/activity-exports.mjs renders the files and opens
// them in Excel; qa/activity-flow.cjs clicks through the page; supabase/tests/activity_report_rules.sql holds the database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SAMPLE_REPORT } from '../qa/fixtures/report-sample.mjs';
import { CATEGORIES, buildReport, defaultMonth, methodLines, monthAdd, monthOf, monthTitle, recentMonths, topNames } from '../src/lib/activity/report.ts';
import { ENTRY_KINDS, WORK_LABELS, libraryEntry, mergePage, periodRange, permissionEntry, workEntry } from '../src/lib/activity/feed.ts';
import { runsOf, visualPieces } from '../src/lib/activity/bidi.ts';
import { crc32, reportXlsx, zip } from '../src/lib/activity/report-xlsx.ts';
import { CAPABILITIES, capability, installedDefault } from '../src/lib/permissions.ts';

const NOW = new Date('2026-11-01T09:00:00Z');
const report = buildReport(SAMPLE_REPORT, NOW);
const of = (email) => report.people.find((p) => p.email === email);
const raw = (over) => ({ ...SAMPLE_REPORT, actions: [], days: {}, approved: {}, stages: [], tasks: [], late: {}, ...over });

test('the points of one person, by hand', () => {
  const p = of('one@example.test');
  // Five stages, four in time; 20 pieces of text; three works approved.
  assert.equal(p.counts.stages, 5);
  assert.equal(p.counts.content, 20);
  assert.equal(p.counts.works, 3);
  assert.equal(p.points, 5 * 3 + 4 * 1 + 20 * 1 + 3 * 4);
  assert.equal(p.onTime, 80);
});

test('nothing is counted twice: a finished stage or task is counted from its own record, not again from its log line', () => {
  assert.equal(of('one@example.test').counts.other, 6, 'six submissions; the five stage_done lines are not here');
  assert.equal(of('design@example.test').counts.tasks, 4);
  assert.equal(of('design@example.test').counts.other, 6, 'the renames; the four done lines are not here');
});

test('a stage with no due date counts as done and does not touch the on-time share', () => {
  const p = of('design@example.test');
  assert.equal(p.counts.stages, 4);
  assert.equal(p.onTime, Math.round((5 / 7) * 100));
  const hidden = p.items.find((i) => i.work === null && i.kind === 'stage');
  assert.equal(hidden.name, 'مرحلة في عمل مقيّد', 'a restricted work is counted, and its name stays hidden');
  assert.equal(hidden.onTime, null);
});

test('the ranking: most points first, the leaders outside it, the system never in it', () => {
  assert.deepEqual(report.ranked.filter((p) => p.points).map((p) => p.email), ['design@example.test', 'one@example.test', 'pub@example.test', 'video@example.test', 'assistant@example.test', 'two@example.test']);
  assert.deepEqual(report.ranked.slice(0, 3).map((p) => p.rank), [1, 2, 3]);
  assert.equal(of('director@example.test').ranked, false);
  assert.equal(of('director@example.test').rank, null);
  assert.equal(of('director@example.test').points, 42, 'still shown, with what they did');
  assert.equal(of('admin@example.test').ranked, false);
  assert.equal(report.people.some((p) => p.email === 'system'), false);
  assert.deepEqual(report.top.map((p) => p.email), ['design@example.test']);
});

test('nobody is placed for nothing: an empty month has no first place and no ranks', () => {
  const empty = buildReport(raw({}), NOW);
  assert.deepEqual(empty.top, []);
  assert.ok(empty.ranked.every((p) => p.rank === null));
  assert.equal(empty.totals.onTime, null);
  assert.equal(empty.totals.points, 0);
  assert.equal(of('quiet@example.test').rank, null, 'nor one quiet person in a busy month');
});

test('a tie shares the place, and both are named first', () => {
  const tied = buildReport(raw({ actions: [{ who: 'one@example.test', src: 'log', type: 'upload', n: 4 }, { who: 'two@example.test', src: 'log', type: 'upload', n: 4 }, { who: 'design@example.test', src: 'log', type: 'upload', n: 1 }] }), NOW);
  assert.deepEqual(tied.ranked.slice(0, 3).map((p) => p.rank), [1, 1, 3]);
  assert.equal(tied.top.length, 2);
  assert.equal(topNames(tied).includes(' و'), true);
});

test('someone who left keeps their month, under what is left of their name, outside the ranking', () => {
  const p = of('gone@example.test');
  assert.equal(p.removed, true);
  assert.equal(p.name, 'gone');
  assert.equal(p.roleName, 'حساب أُزيل');
  assert.equal(p.ranked, false);
  assert.equal(p.counts.content, 3);
  assert.equal(report.totals.members, 9, 'and is not counted as a member');
});

test('a month that has not ended says so', () => {
  assert.equal(report.partial, false);
  assert.equal(buildReport(SAMPLE_REPORT, new Date('2026-10-20T09:00:00Z')).partial, true);
});

test('every category is named in the method, with what it is worth, and everything added up', () => {
  const lines = methodLines();
  for (const c of CATEGORIES) assert.ok(lines.some((l) => l.startsWith(c.label)), c.label);
  assert.equal(report.totals.points, report.people.reduce((n, p) => n + p.points, 0));
  assert.equal(report.totals.counts.stages, SAMPLE_REPORT.stages.length);
});

test('months, by Riyadh\'s calendar', () => {
  assert.equal(monthTitle('2026-10'), 'أكتوبر 2026');
  assert.equal(monthAdd('2026-01', -1), '2025-12');
  assert.equal(monthOf(new Date('2026-10-31T22:00:00Z')), '2026-11', 'already November in Riyadh');
  assert.equal(defaultMonth(new Date('2026-11-05T09:00:00Z')), '2026-10', 'early in a month: the last whole one');
  assert.equal(defaultMonth(new Date('2026-11-29T09:00:00Z')), '2026-11', 'in its last days: this one');
  const r = recentMonths(NOW);
  assert.equal(r.length, 12);
  assert.equal(r[0], '2026-11');
});

test('two new permissions: the whole log for anyone it is given to, the report for leaders', () => {
  assert.equal(capability('activity.full').grantable, true);
  assert.equal(capability('activity.full').minRank, 1);
  assert.equal(capability('activity.report').minRank, 2);
  for (const k of ['activity.full', 'activity.report']) {
    assert.equal(installedDefault('admin', k), true);
    assert.equal(installedDefault('director', k), true);
    assert.equal(installedDefault('assistant', k), false, 'the assistant only if given it');
    assert.equal(installedDefault('writer', k), false);
  }
  assert.ok(CAPABILITIES.some((c) => c.key === 'activity.full'));
});

const name = (e) => ({ 'a@x.sa': 'أمل' })[e] ?? e;

test('three logs become one kind of line, each pointing where it should', () => {
  const w = workEntry({ id: 7, work_id: 'CH-12', at: '2026-10-05T09:00:00Z', actor: 'a@x.sa', type: 'text', text: 'كتابة نص', works: { title: 'حملة' } }, name);
  assert.equal(w.kind, 'files');
  assert.equal(w.work.href, '/work/CH-12');
  assert.equal(w.work.label, 'CH-12 · حملة');
  assert.ok(w.text.startsWith('أمل'));
  const l = libraryEntry({ id: 1, at: '2026-10-05T09:00:00Z', actor_email: 'a@x.sa', type: 'upload', asset_id: 'f1', folder_id: null, task_id: null, data: {} }, name);
  assert.equal(l.kind, 'files');
  assert.equal(l.asset, 'f1');
  const p = permissionEntry({ id: 3, at: '2026-10-05T09:00:00Z', actor: 'a@x.sa', subject: 'a@x.sa', role: null, capability: 'activity.full', kind: 'grant', data: {} }, name);
  assert.equal(p.kind, 'access');
  assert.equal(new Set([w.key, l.key, p.key]).size, 3, 'keys never collide across logs');
  assert.deepEqual([...new Set(ENTRY_KINDS.map((k) => k.id))].length, ENTRY_KINDS.length);
  for (const v of Object.values(WORK_LABELS)) assert.doesNotMatch(v, /[a-z_]/, 'never a raw key');
});

test('a work log type nobody named reads in words, never as a key', () => {
  assert.equal(workEntry({ id: 9, work_id: 'CH-1', at: '2026-10-05T09:00:00Z', actor: 'a@x.sa', type: 'brand_new', text: 'شيء', works: null }, name).label, 'حدث في عمل');
});

test('paging across logs never skips a row', () => {
  const e = (key, at) => ({ key, at, actor: 'a', source: 'library', type: 'x', kind: 'tidy', label: '', text: '' });
  const busy = [e('a1', '2026-10-30'), e('a2', '2026-10-29'), e('a3', '2026-10-28')];
  const slow = [e('b1', '2026-10-27'), e('b2', '2026-10-01')];
  // The busy log filled its limit: nothing older than its last row can be trusted yet.
  const first = mergePage([busy, slow], 3);
  assert.equal(first.cursor, '2026-10-28');
  assert.deepEqual(first.entries.map((x) => x.key), ['a1', 'a2']);
  const rest = mergePage([[e('a3', '2026-10-28')], slow], 3);
  assert.equal(rest.cursor, null);
  assert.deepEqual(rest.entries.map((x) => x.key), ['a3', 'b1', 'b2']);
  assert.deepEqual(mergePage([[], []], 3), { entries: [], cursor: null });
});

test('periods, by Riyadh\'s calendar', () => {
  const now = new Date('2026-11-01T22:30:00Z'); // the 2nd in Riyadh
  assert.deepEqual(periodRange('all', now), { from: null, to: null });
  assert.equal(periodRange('today', now).from, '2026-11-01T21:00:00.000Z');
  assert.equal(periodRange('month', now).from, '2026-10-31T21:00:00.000Z');
  assert.deepEqual(periodRange('last', now), { from: '2026-09-30T21:00:00.000Z', to: '2026-10-31T21:00:00.000Z' });
  assert.deepEqual(periodRange('last', new Date('2026-01-15T09:00:00Z')), { from: '2025-11-30T21:00:00.000Z', to: '2025-12-31T21:00:00.000Z' });
});

// The Arabic file holds Arabic letters, the space and the Arabic comma, as the site's font does.
const inArabicFont = (c) => /[؀-ۿ ]/.test(c);
const texts = (s) => visualPieces(s, inArabicFont).map((p) => `${p.font}:${p.text}`);

test('a line of Arabic is one piece, in reading order, for the font engine to turn', () => {
  assert.deepEqual(texts('مدير الاتصال'), ['ar:مدير الاتصال']);
});

test('numbers and Latin words sit inside Arabic in the right order', () => {
  assert.deepEqual(texts('3 من 12'), ['la:12', 'ar: من ', 'la:3']);
  assert.deepEqual(texts('صفحة 2 من 4'), ['la:4', 'ar: من ', 'la:2', 'ar:صفحة ']);
  assert.deepEqual(texts('الملف report.pdf جاهز'), ['ar: جاهز', 'la:report.pdf', 'ar:الملف ']);
});

test('dates, addresses and percentages stay whole', () => {
  assert.deepEqual(runsOf('2026-10-14').map((r) => r.text), ['2026-10-14']);
  assert.deepEqual(texts('صدر في 2026-10-14'), ['la:2026-10-14', 'ar:صدر في ']);
  assert.deepEqual(texts('في الموعد 85%'), ['la:85%', 'ar:في الموعد ']);
  assert.deepEqual(texts('writer@example.test'), ['la:writer@example.test']);
});

test('brackets and quotation marks take their mirror inside Arabic, and come from the Latin font', () => {
  assert.deepEqual(texts('رسائل (جيد)'), ['la:(', 'ar:جيد', 'la:)', 'ar:رسائل ']);
  assert.deepEqual(texts('«في الموعد»'), ['la:«', 'ar:في الموعد', 'la:»']);
});

test('a Latin line stays as it is, and nothing is drawn for nothing', () => {
  assert.deepEqual(texts('Lina Producer'), ['la:Lina Producer']);
  assert.deepEqual(texts(''), []);
});

test('the zip is sound: a known checksum, and entries a reader can walk', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const z = zip([{ name: 'a.txt', data: new TextEncoder().encode('hello') }]);
  const v = new DataView(z.buffer);
  assert.equal(v.getUint32(0, true), 0x04034b50);
  assert.equal(v.getUint32(z.length - 22, true), 0x06054b50, 'the end record closes the file');
  assert.equal(v.getUint16(z.length - 22 + 10, true), 1, 'one entry');
});

test('the Excel file carries the sheets, right to left, and escapes what could break it', () => {
  const nasty = buildReport({ ...SAMPLE_REPORT, people: [{ email: 'x@example.test', name: 'A & B <c> "d"', role: 'writer' }], actions: [{ who: 'x@example.test', src: 'log', type: 'upload', n: 1 }], stages: [], tasks: [] }, NOW);
  const text = new TextDecoder().decode(reportXlsx(nasty));
  assert.match(text, /rightToLeft="1"/);
  assert.match(text, /A &amp; B &lt;c&gt; &quot;d&quot;/);
  assert.doesNotMatch(text, /A & B <c>/);
  for (const part of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet3.xml']) assert.ok(text.includes(part), part);
});

test('the same report makes the same Excel file', () => {
  assert.deepEqual(reportXlsx(report), reportXlsx(report));
});

test('the migration holds the promises the page makes', () => {
  const sql = readFileSync('supabase/migrations/20261101120000_activity_report.sql', 'utf8');
  assert.match(sql, /has_capability\('activity\.report'\)/);
  assert.match(sql, /drop policy log_read/);
  assert.doesNotMatch(sql.slice(sql.indexOf('create policy log_read')), /media_acts/, 'the old list of roles is gone from the read rule');
  assert.match(sql, /revoke all on function public\.activity_report\(text\) from public, anon/);
  assert.match(sql, /not \(l\.type in \('approve','changes'\) and l\.data \? 'asset'\)/, 'a file approved in a work is one review');
  assert.match(sql, /public\.work_can_see\(w\.id\) then s\.name/, 'a restricted work keeps its name');
  assert.match(sql, /at time zone 'Asia\/Riyadh'/);
});

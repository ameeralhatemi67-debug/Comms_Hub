// The studio, third round, Phase 1 (MVP_draft.md 62.6): «النسخ». The list of numbered versions is a
// read-only function that checks the studio first; «مقارنة بالحالية» says what differs in words;
// documents compare equal whatever the order of their keys (the database gives them back in its own).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diffDocs, sameDoc, canonical } from '../src/lib/studio/diff.ts';
import { newPhotoDoc, newVideoDoc } from '../src/lib/studio/schema.ts';
import { addClip, addSource, moveClip, trimEnd, removeClip, setFormat } from '../src/lib/studio/timeline.ts';

const sql = readFileSync('supabase/migrations/20261020120000_studio_versions.sql', 'utf8');

test('the version list checks the studio first, writes nothing and is callable by signed-in accounts only', () => {
  const body = sql.match(/create function public\.studio_revisions_list\([\s\S]*?\n\$\$;/)?.[0] ?? '';
  assert.ok(body);
  assert.match(body, /stable security definer set search_path = ''/);
  const begin = body.indexOf('begin');
  assert.match(body.slice(begin, begin + 120), /if not public\.studio_can\(\) then raise exception 'FORBIDDEN'/);
  assert.doesNotMatch(body, /\b(insert|update|delete)\b/i, 'reads only');
  assert.match(body, /r\.revision >= 1/, 'numbered versions only, never the autosave slot');
  assert.match(body, /media_asset_level\(e\.asset_id\), 0\) >= 1/, 'a file name only for those who may see the file');
  assert.match(sql, /revoke all on function public\.studio_revisions_list\(uuid\) from public, anon;/);
  assert.match(sql, /grant execute on function public\.studio_revisions_list\(uuid\) to authenticated;/);
});

const FILE = '11111111-1111-4111-8111-111111111111';
function base() {
  let doc = newVideoDoc('9:16', 30);
  const s = addSource(doc, { kind: 'library', asset: FILE, version: 1, name: 'لقطة', media: 'video', duration: 10_000_000 });
  doc = s.doc;
  const a = addClip(doc, { source: s.id, start: 0, length: 4_000_000 });
  return { doc: a.doc, clip: a.clipId };
}

test('the same state compares as the same, whatever the order of its keys', () => {
  const { doc } = base();
  // the same document with every object's keys in reverse order
  const reverse = (v) => (Array.isArray(v) ? v.map(reverse) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reverse(x)])) : v);
  const shuffled = reverse(doc);
  assert.notEqual(JSON.stringify(shuffled), JSON.stringify(doc));
  assert.ok(sameDoc(doc, shuffled));
  assert.equal(canonical({ b: 1, a: [2, { d: 3, c: 4 }] }), canonical({ a: [2, { c: 4, d: 3 }], b: 1 }));
  assert.ok(diffDocs(doc, structuredClone(doc)).same);
});

test('moves, length changes, removals, new files and a new shape are said in words', () => {
  const { doc, clip } = base();
  let now = moveClip(doc, clip, 1_000_000);
  now = trimEnd(now, clip, 3_000_000);
  now = setFormat(now, { ratio: '16:9' });
  const d = diffDocs(doc, now);
  assert.equal(d.same, false);
  assert.ok(d.lines.some((l) => l.startsWith('نُقل «لقطة»')), d.lines.join('\n'));
  assert.ok(d.lines.some((l) => l.startsWith('تغير طول «لقطة»')));
  assert.ok(d.lines.some((l) => l.startsWith('تغير شكل الإطار')));
  const gone = removeClip(doc, clip);
  assert.ok(diffDocs(doc, gone).lines.some((l) => l.startsWith('حُذف «لقطة»')));
  const s2 = addSource(doc, { kind: 'library', asset: FILE, version: 2, name: 'لقطة', media: 'video', duration: 10_000_000 });
  const swapped = { ...s2.doc, sources: s2.doc.sources.filter((s) => s.version !== 1) };
  assert.ok(diffDocs(doc, swapped).lines.some((l) => l.includes('بالإصدار 2 بدل 1')));
  // a label given by the interface is used
  assert.ok(diffDocs(doc, gone, () => 'المقطع الأول').lines[0].includes('المقطع الأول'));
});

test('photo layers: added, reordered, changed', () => {
  const a = newPhotoDoc(1080, 1080);
  const l1 = { id: 'l1', name: 'العنوان', transform: { x: 1, y: 1, scale: 1, rotation: 0, opacity: 1 }, text: { content: 'العنوان', font: 'Cairo', weight: 700, size: 60, color: '#fff', align: 'center', width: 0.8, lineHeight: 1.3 } };
  const l2 = { id: 'l2', name: 'الشعار', transform: { x: 2, y: 2, scale: 1, rotation: 0, opacity: 1 }, sticker: { key: 'emblem', color: '#fff' } };
  const from = { ...a, photo: { ...a.photo, layers: [l1] } };
  const to = { ...a, photo: { ...a.photo, w: 1080, h: 1350, layers: [l2, { ...l1, transform: { ...l1.transform, scale: 2 } }] } };
  const lines = diffDocs(from, to, (_d, item) => item.name).lines;
  assert.ok(lines.some((l) => l.startsWith('أُضيفت الطبقة «الشعار»')), lines.join('\n'));
  assert.ok(lines.some((l) => l.startsWith('تغير ترتيب الطبقة «العنوان»')));
  assert.ok(lines.some((l) => l.startsWith('تغيرت إعدادات الطبقة «العنوان»')));
  assert.ok(lines.some((l) => l.startsWith('تغير مقاس الصورة')));
});

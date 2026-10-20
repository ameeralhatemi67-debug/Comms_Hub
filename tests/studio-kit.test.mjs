// The studio, third round, Phase 6 (MVP_draft.md 62.11): templates and «هوية الاستوديو». The brand's rules
// equal the database's; a stored brand is read safely; a new text takes the brand's fonts; a clip or layer
// pinned in a template is not moved, trimmed, cut or removed until released; the migration's shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { brandIssue, readBrand, brandText, BRAND_MAX, NO_BRAND } from '../src/lib/studio/brand.ts';
import { newVideoDoc, newPhotoDoc, US } from '../src/lib/studio/schema.ts';
import { addClip, moveClip, trimStart, trimEnd, splitClip, removeClip, locate } from '../src/lib/studio/timeline.ts';
import { addLayer, removeLayer } from '../src/lib/studio/photo.ts';
import { defaultText } from '../src/lib/studio/text.ts';

test('the brand: up to twelve named #rrggbb colours, as the database checks', () => {
  assert.equal(BRAND_MAX, 12);
  assert.equal(brandIssue({ colors: [{ name: 'أخضر', hex: '#17634b' }], title_font: 'Cairo', body_font: null }), null);
  assert.match(brandIssue({ colors: [{ name: 'أخضر', hex: 'green' }], title_font: null, body_font: null }), /ليس لوناً صالحاً/);
  assert.match(brandIssue({ colors: [{ name: ' ', hex: '#000000' }], title_font: null, body_font: null }), /لكل لون اسم/);
  assert.match(brandIssue({ colors: Array.from({ length: 13 }, (_, i) => ({ name: `لون ${i}`, hex: '#000000' })), title_font: null, body_font: null }), /12/);
});

test('a stored brand is read safely: bad colours dropped, unknown fonts ignored', () => {
  const b = readBrand({ colors: [{ name: 'أخضر', hex: '#17634B' }, { name: 'خطأ', hex: 'red' }, null], title_font: 'Cairo', body_font: 'خط غير موجود' });
  assert.deepEqual(b.colors, [{ name: 'أخضر', hex: '#17634b' }]);
  assert.equal(b.title_font, 'Cairo');
  assert.equal(b.body_font, null);
  assert.deepEqual(readBrand(null), NO_BRAND);
});

test('a new text takes the brand\'s font for its kind, at a weight the font has', () => {
  const brand = { colors: [], title_font: 'Bebas Neue', body_font: 'Tajawal' };
  assert.equal(brandText({ ...defaultText('عنوان'), weight: 700 }, brand, 'title').font, 'Bebas Neue');
  assert.equal(brandText({ ...defaultText('عنوان'), weight: 700 }, brand, 'title').weight, 400, 'Bebas Neue has one weight');
  assert.equal(brandText(defaultText('نص'), brand, 'body').font, 'Tajawal');
  assert.equal(brandText(defaultText('نص'), { ...brand, body_font: null }, 'body').font, 'Bebas Neue', 'the other font when one is missing');
  assert.equal(brandText(defaultText('نص'), NO_BRAND, 'body').font, defaultText('نص').font);
});

test('a clip pinned in a template is not moved, trimmed, cut or removed', () => {
  const r = addClip(newVideoDoc('9:16', 30), { start: 0, length: 4 * US, text: defaultText('شعار البرنامج'), pinned: true });
  const doc = r.doc;
  assert.equal(moveClip(doc, r.clipId, 2 * US), doc);
  assert.equal(trimStart(doc, r.clipId, 1 * US), doc);
  assert.equal(trimEnd(doc, r.clipId, 2 * US), doc);
  assert.equal(splitClip(doc, r.clipId, 2 * US).secondId, null);
  assert.equal(removeClip(doc, r.clipId), doc);
  assert.ok(locate(doc, r.clipId).clip.pinned);
  const photo = addLayer(newPhotoDoc(1080, 1080), { text: defaultText('شعار'), pinned: true });
  assert.equal(removeLayer(photo.doc, photo.id), photo.doc);
});

test('the migration: definer functions that check the studio first, a read-only brand, signed-in callers only', () => {
  const sql = readFileSync('supabase/migrations/20261020140000_studio_kit.sql', 'utf8');
  for (const n of ['studio_project_set_template', 'studio_project_copy', 'studio_brand_save']) {
    const body = sql.match(new RegExp(`create function public\\.${n}\\([\\s\\S]*?\\n\\$\\$;`))?.[0] ?? '';
    assert.match(body, /security definer set search_path = ''/, n);
    const begin = body.indexOf('begin');
    assert.match(body.slice(begin, begin + 120), /if not public\.studio_can\(\) then raise exception 'FORBIDDEN'/, n);
    assert.match(sql, new RegExp(`revoke all on function public\\.${n}\\([^)]*\\) from public, anon;`), n);
    assert.match(sql, new RegExp(`grant execute on function public\\.${n}\\([^)]*\\) to authenticated;`), n);
  }
  assert.match(sql, /alter table public\.studio_brand enable row level security;/);
  assert.match(sql, /create policy studio_brand_read on public\.studio_brand for select to authenticated using \(\(select public\.studio_can\(\)\)\);/);
  assert.doesNotMatch(sql, /create policy [^;]* for (insert|update|delete|all)/, 'no write policy');
  assert.match(sql, /x\.project_id = p_from and x\.asset_id = a and x\.version = v/, 'a copy carries the files the source project recorded');
  assert.match(sql, /'template', p\.template/);
});

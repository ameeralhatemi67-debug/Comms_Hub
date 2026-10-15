// The circled "!" setup guides: written in the site, one place, and every place that opens one
// names a guide that exists. The screens that draw them are checked in qa/permissions-pages.cjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { GUIDES, resolveGuide, storageGuideKey } from '../src/lib/setup-guides.ts';
import { FLAVORS } from '../src/lib/integrations/rules.ts';

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

test('every guide has a title, who it is for, and numbered steps with something to do in each', () => {
  for (const [key, g] of Object.entries(GUIDES)) {
    assert.ok(g.title.length > 5 && g.intro.length > 20, key);
    assert.ok(g.steps.length >= 2 && g.steps.length <= 10, `${key}: ${g.steps.length} steps`);
    for (const s of g.steps) assert.ok(s.t.length > 3, `${key}: a step has a title`);
    if (g.link) assert.match(g.link.href, /^https:\/\//, key);
    for (const s of g.steps) if (s.link) assert.match(s.link.href, /^https:\/\//, `${key}: ${s.t}`);
  }
});

test('a guide exists for every platform app, every way of connecting, the manual path, the move and every storage kind', () => {
  for (const k of ['meta', 'tiktok', 'connect_meta', 'connect_tiktok', 'manual', 'move']) assert.ok(GUIDES[k], k);
  for (const f of FLAVORS) assert.ok(GUIDES[storageGuideKey(f.id)], f.id);
  assert.equal(storageGuideKey('nonsense'), 'storage_other');
});

test('the return address is filled in from the site and the platform, and shown to copy exactly', () => {
  const g = resolveGuide(GUIDES.meta, 'https://hub.example.org', 'meta');
  const copy = g.steps.find((s) => s.copy);
  assert.equal(copy.copy, 'https://hub.example.org/api/platforms/callback/meta');
  assert.equal(resolveGuide(GUIDES.tiktok, 'https://hub.example.org', 'tiktok').steps.find((s) => s.copy).copy, 'https://hub.example.org/api/platforms/callback/tiktok');
  assert.doesNotMatch(JSON.stringify(g), /\{redirect\}|\{origin\}/);
});

test('the platform guides say plainly that publishing is still a simulation, and where the facts came from', () => {
  for (const k of ['meta', 'tiktok', 'connect_meta', 'connect_tiktok']) assert.match(JSON.stringify(GUIDES[k].notes), /محاكاة/, k);
  for (const k of ['meta', 'tiktok']) assert.match(JSON.stringify(GUIDES[k].notes), /2026-10-15/, k);
});

test('no guide asks for a secret to be sent anywhere but its own form, and none carries a value', () => {
  const all = JSON.stringify(GUIDES);
  assert.doesNotMatch(all, /AKIA[A-Z0-9]{8}|sk_live|secret=/);
  assert.match(JSON.stringify(GUIDES.meta), /ولا ترسلهما إلى أحد/);
});

test('every place that draws a guide names one that exists, and the icon is the icon set\'s, not an emoji', () => {
  const used = new Set();
  for (const f of walk('src').filter((p) => /\.tsx$/.test(p))) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/<SetupGuide[\s\S]*?guide=\{?(?:"([a-z_]+)"|`connect_\$\{[^`]*\}`|storageGuideKey\([^)]*\)|providerOf\(pl\) \? `connect_\$\{providerOf\(pl\)\}` : 'manual'|provider)\}?/g)) if (m[1]) used.add(m[1]);
  }
  for (const k of used) assert.ok(GUIDES[k], k);
  assert.ok(used.has('move') && used.has('manual'), [...used].join(','));
  const comp = readFileSync('src/components/setup-guide.tsx', 'utf8');
  assert.match(comp, /CircleAlert/);
  assert.doesNotMatch(JSON.stringify(GUIDES) + comp, /\p{Extended_Pictographic}/u);
});

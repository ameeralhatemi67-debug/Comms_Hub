// A setup guide shown as one page (MVP_draft.md section 67.10, src/lib/guide-layout.ts): every action and picture once and in
// order, each picture under the actions its rings point at, each value to copy and each key field under the action that asks for
// it, and the parts of the long guides covering every step. The page itself is clicked through by qa/platforms-flow.cjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GUIDES } from '../src/lib/setup-guides.ts';
import { SHOT_MAX, WHOLE_GUIDES, isWholeGuide, layoutStep, phaseOf, phasesOf, ringNumbers, shotCount } from '../src/lib/guide-layout.ts';

const KEYS = ['id', 'secret', 'more'];
const where = (laid) => {
  const at = {};
  for (const part of laid.parts) for (const a of part.acts) for (const c of a.copies) at[c.label] = a.n;
  for (const c of laid.copies) at[c.label] = 'after';
  return at;
};
const fieldsAt = (laid) => {
  const at = {};
  for (const part of laid.parts) for (const a of part.acts) for (const f of a.fields) at[f] = a.n;
  for (const f of laid.fields) at[f] = 'after';
  return at;
};

test('the guides drawn as one page are YouTube\'s and TikTok\'s, and only they', () => {
  assert.deepEqual([...WHOLE_GUIDES].sort(), ['google', 'tiktok']);
  for (const k of WHOLE_GUIDES) assert.ok(GUIDES[k], k);
  assert.ok(isWholeGuide('google') && isWholeGuide('tiktok') && !isWholeGuide('meta') && !isWholeGuide('x') && !isWholeGuide(null));
});

test('the parts of a guide shown as one page hold every step once, in the guide\'s own order, under a name', () => {
  for (const k of WHOLE_GUIDES) {
    const g = GUIDES[k];
    const ids = phasesOf(g).flatMap((p) => p.steps.map((s) => s.id));
    assert.deepEqual(ids, g.steps.map((s) => s.id), k);
    for (const p of phasesOf(g)) assert.ok(p.t && p.t.length > 3 && p.steps.length > 0, `${k}: ${p.t}`);
    for (const s of g.steps) assert.ok(phaseOf(g, s.id), `${k}/${s.id} has a part`);
  }
  assert.deepEqual(phasesOf(GUIDES.meta).map((p) => p.t), [null], 'a guide without parts is one part with no name');
  assert.deepEqual(phasesOf(GUIDES.google).map((p) => p.t), ['المشروع والواجهات', 'شاشة الموافقة', 'معرّف العميل', 'النشر']);
  assert.deepEqual(phasesOf(GUIDES.tiktok).map((p) => p.t), ['المؤسسة والتطبيق', 'بيئة التجربة', 'المفتاح والسر', 'المراجعة']);
});

test('every action and every picture is drawn once and in order, and each picture comes after every action its rings point at', () => {
  for (const k of WHOLE_GUIDES) {
    for (const s of GUIDES[k].steps) {
      const laid = layoutStep(s, s.kind === 'keys' ? { keys: KEYS } : {});
      const acts = laid.parts.flatMap((p) => p.acts.map((a) => a.n));
      assert.deepEqual(acts, (s.todo ?? []).map((_, i) => i + 1), `${k}/${s.id}: actions`);
      const shots = laid.parts.flatMap((p) => p.shots.map((x) => x.src));
      assert.deepEqual(shots, (s.shots ?? []).map((x) => x.src), `${k}/${s.id}: pictures`);
      for (const part of laid.parts) {
        const here = new Set(part.acts.map((a) => a.n));
        for (const x of part.shots) for (const r of ringNumbers(x)) assert.ok(here.has(r), `${k}/${s.id}: ${x.src} rings ${r}, drawn with ${[...here]}`);
      }
      for (const x of s.shots ?? []) if (x.at !== undefined) assert.ok(Number.isInteger(x.at) && x.at >= 1 && x.at <= (s.todo ?? []).length, `${k}/${s.id}: ${x.src} at ${x.at}`);
      const ringed = new Set((s.shots ?? []).flatMap(ringNumbers));
      for (const part of laid.parts) for (const a of part.acts) assert.equal(a.ringed, ringed.has(a.n), `${k}/${s.id}: action ${a.n} ringed`);
    }
  }
});

test('the pictures fall where a reader needs them', () => {
  const parts = (k, id) => layoutStep(GUIDES[k].steps.find((s) => s.id === id)).parts.map((p) => [p.acts.map((a) => a.n), p.shots.map((x) => x.src.split('/').pop())]);
  assert.deepEqual(parts('tiktok', 'verify'), [
    [[1], ['verify-open.png']],
    [[2], ['verify-type.png']],
    [[3], ['verify-prefix.png']],
    [[4, 5], ['verify-file.png', 'verify-error.png', 'verify-done.png']],
  ], 'a picture with no ring follows the one before it');
  assert.deepEqual(parts('tiktok', 'app'), [
    [[1], ['app-create.png']],
    [[2, 3, 4], ['app-name.png']],
    [[5], ['app-page.png']],
  ]);
  assert.deepEqual(parts('tiktok', 'org').at(-1), [[5], ['org-page.png']], 'the organization\'s page is what action 5 opens');
  assert.deepEqual(parts('tiktok', 'details'), [
    [[1, 2, 3], ['details-category.png']],
    [[4, 5], ['details-web.png']],
  ], 'the address without its slash is the fifth action\'s');
  assert.deepEqual(parts('google', 'consent'), [[[1], ['menu.png']], [[2, 3], []]]);
  assert.deepEqual(parts('google', 'contact'), [[[1, 2, 3, 4], ['contact.png']]]);
  assert.deepEqual(parts('google', 'testusers'), [[[1, 2], ['test-users.png']], [[3, 4], ['add-users.png']], [[5], []]]);
  assert.deepEqual(parts('google', 'project'), [[[1, 2, 3], []]], 'a step without pictures is its actions');
});

test('a value to copy sits under the action that asks for it', () => {
  const at = (k, id) => where(layoutStep(GUIDES[k].steps.find((s) => s.id === id)));
  assert.deepEqual(at('tiktok', 'details'), { 'عنوان الموقع': 5, 'أيقونة الموقع': 2, 'الوصف': 3, 'رابط الشروط': 4, 'رابط الخصوصية': 4 });
  assert.deepEqual(at('tiktok', 'verify'), { 'عنوان الموقع': 3 });
  assert.deepEqual(at('tiktok', 'redirect'), { 'عنوان العودة': 2 });
  assert.deepEqual(at('tiktok', 'review'), { 'شرح المراجعة': 2 });
  assert.deepEqual(at('google', 'redirect'), { 'عنوان العودة ليوتيوب': 3 });
  assert.deepEqual(at('google', 'redirect_drive'), { 'عنوان العودة لـ Drive': 2 });
  // Every action a value is drawn under says where it is.
  for (const k of WHOLE_GUIDES)
    for (const s of GUIDES[k].steps) {
      const laid = layoutStep(s);
      const n = (s.copy ? 1 : 0) + (s.more?.length ?? 0);
      assert.equal(laid.parts.flatMap((p) => p.acts.flatMap((a) => a.copies)).length + laid.copies.length, n, `${k}/${s.id}: every value once`);
    }
  // A guide not yet drawn as one page keeps its values after the actions when nothing says where.
  assert.deepEqual(where(layoutStep({ t: 'خطوة', todo: ['افتح الصفحة.'], copy: 'https://x.test/' })), { 'العنوان': 'after' });
});

test('the fields of the keys sit under the actions that name them', () => {
  const keys = (k) => fieldsAt(layoutStep(GUIDES[k].steps.find((s) => s.kind === 'keys'), { keys: KEYS }));
  assert.deepEqual(keys('google'), { id: 2, secret: 3, more: 'after' });
  assert.deepEqual(keys('tiktok'), { id: 2, secret: 3, more: 4 });
  assert.match(GUIDES.google.steps.find((s) => s.id === 'keys').todo[1], /الحقل الأول/);
  assert.match(GUIDES.tiktok.steps.find((s) => s.id === 'keys').todo[2], /الحقل الثاني/);
  assert.match(GUIDES.tiktok.steps.find((s) => s.id === 'keys').todo[3], /خيارات أخرى/);
  assert.deepEqual(fieldsAt(layoutStep(GUIDES.facebook.steps.find((s) => s.kind === 'keys'), { keys: ['id', 'secret', 'config', 'more'] })), { id: 'after', secret: 'after', config: 'after', more: 'after' }, 'with no places, the fields follow');
});

test('a step with pictures and no actions is one part of pictures; a picture is drawn smaller than the platform\'s page', () => {
  const laid = layoutStep({ t: 'خطوة', shots: [{ src: '/guides/x/a.png', w: 900, h: 200, alt: 'a', rings: ['1'] }] });
  assert.equal(laid.parts.length, 1);
  assert.deepEqual(laid.parts[0].acts, []);
  assert.equal(laid.parts[0].shots.length, 1);
  assert.ok(SHOT_MAX >= 320 && SHOT_MAX <= 480, `${SHOT_MAX}`);
  const widest = Math.max(...WHOLE_GUIDES.flatMap((k) => GUIDES[k].steps.flatMap((s) => (s.shots ?? []).map((x) => x.w))));
  assert.ok(widest > SHOT_MAX, 'the pictures are drawn below their own size, so a zoom shows more');
  assert.equal(shotCount(GUIDES.google), 9);
  assert.equal(shotCount(GUIDES.tiktok), 29);
});

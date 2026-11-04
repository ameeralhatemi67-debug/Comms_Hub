// The circled "!" setup guides: written in the site, one place, and every place that opens one
// names a guide that exists. The screens that draw them are checked in qa/permissions-pages.cjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { GUIDES, resolveGuide, storageGuideKey } from '../src/lib/setup-guides.ts';
import { plainText, segments } from '../src/lib/guide-text.ts';
import { FLAVORS } from '../src/lib/integrations/rules.ts';

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

test('every guide has a title, who it is for, and numbered steps with something to do in each', () => {
  for (const [key, g] of Object.entries(GUIDES)) {
    assert.ok(g.title.length > 5 && g.intro.length > 20, key);
    // The Google guide is longer on purpose (MVP_draft.md section 67.5): one action to a step is what a first-time reader can follow.
    assert.ok(g.steps.length >= 2 && g.steps.length <= (key === 'google' ? 14 : 10), `${key}: ${g.steps.length} steps`);
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
  const copy = g.steps.find((s) => s.id === 'redirect');
  assert.equal(copy.copy, 'https://hub.example.org/api/platforms/callback/meta');
  assert.equal(resolveGuide(GUIDES.tiktok, 'https://hub.example.org', 'tiktok').steps.find((s) => s.id === 'redirect').copy, 'https://hub.example.org/api/platforms/callback/tiktok');
  assert.equal(resolveGuide(GUIDES.facebook, 'https://hub.example.org', 'meta').steps.find((s) => s.id === 'publish').more[0].copy, 'https://hub.example.org/account-deletion.html');
  assert.doesNotMatch(JSON.stringify(g), /\{redirect\}|\{origin\}/);
});

test('the platform guides say plainly that publishing is still a simulation, and where the facts came from', () => {
  for (const k of ['meta', 'facebook', 'tiktok', 'google', 'linkedin', 'x', 'connect_meta', 'connect_tiktok', 'connect_google', 'connect_linkedin', 'connect_x']) assert.match(JSON.stringify(GUIDES[k].notes), /محاكاة/, k);
  for (const k of ['meta', 'facebook', 'tiktok', 'google', 'linkedin', 'x']) assert.match(JSON.stringify(GUIDES[k].notes), /2026-11-01/, k);
});

test('no guide asks for a secret to be sent anywhere but its own form, and none carries a value', () => {
  const all = JSON.stringify(GUIDES);
  assert.doesNotMatch(all, /AKIA[A-Z0-9]{8}|sk_live|secret=/);
  assert.match(JSON.stringify(GUIDES.meta), /ولا ترسل(?:ها|هما|ه) إلى أحد/);
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

const png = (file) => {
  const b = readFileSync(file);
  assert.equal(b.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${file} is a PNG`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length };
};

test('English inside an Arabic sentence is set apart: labels as chips, values as chips, the rest isolated', () => {
  const kinds = (t) => segments(t).map((g) => `${g.k}:${g.s}`);
  assert.deepEqual(kinds('اضغط «Create client» ثم اختر «Web application».'), ['text:اضغط ', 'ui:Create client', 'text: ثم اختر ', 'ui:Web application', 'text:.']);
  assert.deepEqual(kinds('في «App name» اكتب `Comms Hub`.'), ['text:في ', 'ui:App name', 'text: اكتب ', 'val:Comms Hub', 'text:.']);
  assert.deepEqual(kinds('تنتقل إلى Google Cloud، ثم Drive.'), ['text:تنتقل إلى ', 'latin:Google Cloud', 'text:، ثم ', 'latin:Drive', 'text:.']);
  // A guillemet around Arabic, or Arabic with English, is the site's own wording: it stays, and only its English is isolated.
  assert.deepEqual(kinds('«حسابات المنصات»'), ['text:«', 'text:حسابات المنصات', 'text:»']);
  assert.deepEqual(kinds('«ربط عبر Google (يوتيوب)»'), ['text:«', 'text:ربط عبر ', 'latin:Google', 'text: (يوتيوب)', 'text:»']);
  // A number beside Arabic is not English, and a run keeps its own punctuation.
  assert.deepEqual(kinds('بعد 7 أيام و100 مقطع'), ['text:بعد 7 أيام و100 مقطع']);
  assert.deepEqual(kinds('أضف https://www.example.com/a-b هنا'), ['text:أضف ', 'latin:https://www.example.com/a-b', 'text: هنا']);
  assert.equal(plainText('اضغط «Enable» ثم `Comms Hub`'), 'اضغط Enable ثم Comms Hub');
});

test('every text of every guide is balanced, and the marks lose none of its words', () => {
  for (const [key, g] of Object.entries(GUIDES)) {
    const texts = [g.title, g.intro, ...(g.notes ?? []), ...g.steps.flatMap((x) => [x.t, x.b ?? '', ...(x.todo ?? []), ...(x.shots?.map((h) => h.caption ?? '') ?? [])])];
    for (const t of texts) {
      assert.equal((t.match(/`/g) ?? []).length % 2, 0, `${key}: an open backtick in ${t.slice(0, 40)}`);
      assert.doesNotMatch(t, /«\s|\s»/, `${key}: a space inside a guillemet in ${t.slice(0, 40)}`);
      const bare = (x) => x.replace(/[«»`]/g, '').replace(/\s+/g, '');
      assert.equal(bare(segments(t).map((x) => x.s).join('')), bare(t), `${key}: ${t.slice(0, 40)}`);
    }
  }
});

test('the Google guide: one action to a line, the old crowded step is gone, and the saved progress still means the same', () => {
  const g = GUIDES.google;
  const ids = g.steps.map((s) => s.id);
  assert.deepEqual(ids, ['project', 'youtube', 'drive', 'consent', 'branding', 'audience', 'contact', 'testusers', 'client', 'redirect', 'redirect_drive', 'keys', 'publish']);
  // Only these three were ever saved as done by a person; every step added since is proved by the stored secret.
  assert.deepEqual(g.steps.filter((s) => !s.implied && s.kind !== 'keys').map((s) => s.id), ['youtube', 'redirect', 'publish']);
  for (const s of g.steps) {
    assert.ok(s.todo && s.todo.length >= 1, `${s.id}: what to do`);
    assert.ok((s.b ?? '').length > 10 && s.b.length <= 110, `${s.id}: one short sentence, not the whole step (${s.b?.length})`);
    for (const t of s.todo) assert.ok(t.length <= 260, `${s.id}: a line is one action (${t.length}): ${t.slice(0, 30)}`);
    assert.ok(s.t.length <= 48, `${s.id}: a short name`);
  }
  // The sentence a first reader could not follow (Branding, Audience, External, Internal, Workspace, Test users in one breath).
  assert.ok(!g.steps.some((s) => /Branding[^]*Audience[^]*Test users/.test(s.b ?? '')));
  assert.ok(g.steps.find((s) => s.id === 'testusers').todo.some((t) => /Add users/.test(t)));
  assert.match(JSON.stringify(g.steps.find((s) => s.id === 'branding')), /App logo/, 'the logo warning is there');
  // A value to type is marked as a value, and an address to copy is the field below, not text in the line.
  assert.ok(g.steps.find((s) => s.id === 'project').todo.some((t) => t.includes('`Comms Hub`')));
  for (const s of g.steps.filter((x) => x.kind === 'copy')) assert.ok(s.copy && s.todo.some((t) => /الحقل أدناه/.test(t)), s.id);
});

test('the pictures of the Google guide are the files in public/guides/google, whole, small, and never an original', () => {
  const dir = 'public/guides/google';
  const used = new Set();
  for (const s of GUIDES.google.steps) {
    for (const h of s.shots ?? []) {
      assert.match(h.src, /^\/guides\/google\/[a-z-]+\.png$/, h.src);
      used.add(h.src.split('/').pop());
      const file = `public${h.src}`;
      assert.ok(existsSync(file), file);
      const d = png(file);
      assert.deepEqual([d.w, d.h], [h.w, h.h], `${file} is ${d.w} x ${d.h}`);
      assert.ok(d.bytes < 120_000, `${file}: ${d.bytes} bytes`);
      assert.ok(h.alt.length > 15, `${file}: alt`);
      assert.ok(h.w <= 1000, `${file}: wider than a screen shows`);
    }
  }
  assert.equal(used.size, 9);
  assert.deepEqual(readdirSync(dir).sort(), [...used].sort(), 'no file in the folder is left unused, and no original screenshot is kept');
  // What was private in the originals is nowhere in the words either.
  assert.doesNotMatch(JSON.stringify(GUIDES), /@gmail\.com|990812869923|zkkmfjsjouqzibvnzkau/);
});

test('the sheet and the circled "!" draw a guide with the same parts, and a picture is a button only when it can be enlarged', () => {
  for (const f of ['src/components/settings/platform-sheet.tsx', 'src/components/setup-guide.tsx']) {
    const src = readFileSync(f, 'utf8');
    assert.match(src, /GuideTodo/, f);
    assert.match(src, /GuideShots/, f);
    assert.match(src, /Rich/, f);
  }
  const comp = readFileSync('src/components/guide-text.tsx', 'utf8');
  assert.match(comp, /zoomable \? \(\s*<button/, 'a wide picture is a button');
  assert.doesNotMatch(comp, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(comp, /\p{Extended_Pictographic}/u);
  assert.match(readFileSync('src/app/work.css', 'utf8'), /\.gd-zoom\{[^}]*border-radius:12px/, 'the corners are rounded by the page');
});

test('a ring in a picture points at an action that exists in its step, and a step tag is a short condition', () => {
  for (const [key, g] of Object.entries(GUIDES)) {
    for (const s of g.steps) {
      for (const shot of s.shots ?? []) {
        for (const r of shot.rings ?? []) {
          if (r === 'x') continue;
          assert.ok(/^[1-9]$/.test(r) && Number(r) <= (s.todo?.length ?? 0), `${key}/${s.id ?? s.t}: ring ${r}`);
        }
      }
      if (s.tag) assert.ok(plainText(s.tag).length <= 30, `${key}/${s.id}: tag too long`);
    }
  }
  const rings = GUIDES.google.steps.flatMap((s) => (s.shots ?? []).map((x) => (x.rings ?? []).join('')));
  assert.deepEqual(rings, ['', '12x', '', '2', '34', '1', '2', '23', '13'], 'the rings match the ones drawn in the pictures (scripts/guide-shots.mjs)');
});

test('the pictures of the Instagram guide are the files in public/guides/meta, whole, small, never an original, and hold nothing private', () => {
  const dir = 'public/guides/meta';
  const used = new Set();
  const g = GUIDES.meta;
  assert.deepEqual(g.steps.map((s) => s.id), ['accounts', 'ig_add', 'app', 'usecase', 'config', 'redirect', 'skip', 'roles', 'keys']);
  // Steps that existed keep their names; the one added is proved by the stored secret, so a connected app reads as connected.
  assert.ok(g.steps.filter((s) => s.id !== 'keys').every((s) => s.implied), 'every step before the keys is implied');
  for (const s of g.steps) {
    for (const h of s.shots ?? []) {
      assert.match(h.src, /^\/guides\/meta\/[a-z-]+\.png$/, h.src);
      used.add(h.src.split('/').pop());
      const d = png(`public${h.src}`);
      assert.deepEqual([d.w, d.h], [h.w, h.h], `${h.src} is ${d.w} x ${d.h}`);
      assert.ok(d.bytes < 120_000, `${h.src}: ${d.bytes} bytes`);
      assert.ok(h.alt.length > 15 && h.w <= 1000, h.src);
    }
  }
  assert.equal(used.size, 22);
  assert.deepEqual(readdirSync(dir).sort(), [...used].sort(), 'no file in the folder is left unused, and no original screenshot is kept');
  // The handle and the portfolio's name in the originals are nowhere in the words, and the script that makes the pictures names no original but its inputs.
  assert.doesNotMatch(JSON.stringify(GUIDES), /polkeruoo|17951132926087090|2617091465408415/);
  assert.doesNotMatch(readFileSync('scripts/guide-shots.mjs', 'utf8'), /polkeruoo|17951132926087090/);
});

test('a step can carry notes with the circled "!" and tables of figures, drawn by both places that draw a guide', () => {
  for (const f of ['src/components/settings/platform-sheet.tsx', 'src/components/setup-guide.tsx']) {
    const src = readFileSync(f, 'utf8');
    assert.match(src, /GuideInfo/, f);
    assert.match(src, /GuideTables/, f);
  }
  const comp = readFileSync('src/components/guide-text.tsx', 'utf8');
  assert.match(comp, /<bdi dir="ltr">\{a\}<\/bdi>/, 'every cell is isolated');
  assert.doesNotMatch(comp, /dangerouslySetInnerHTML/);
});

test('the X guide shows the prices of the developer console as read on 2026-11-03, as tables, and says the date', () => {
  const g = GUIDES.x;
  assert.deepEqual(g.steps.map((s) => s.id), ['console', 'credits', 'app', 'auth', 'redirect', 'website', 'keys']);
  assert.ok(g.steps.filter((s) => s.id !== 'keys').every((s) => s.implied), 'every step before the keys is implied');
  const credits = g.steps.find((s) => s.id === 'credits');
  assert.equal(credits.tables.length, 4);
  const cell = (t, name) => t.rows.find((r) => r[0] === name)?.[1];
  const [pick, reads, actions, events] = credits.tables;
  assert.equal(cell(actions, 'Post: Create'), '$0.015 per request');
  assert.equal(cell(actions, 'Post: Create (with URL)'), '$0.200 per request');
  assert.equal(cell(reads, 'User: Read'), '$0.010 per resource');
  assert.equal(cell(events, 'post.delete'), 'Not billed');
  assert.deepEqual([reads.rows.length, actions.rows.length, events.rows.length], [12, 16, 19]);
  // The short table repeats rows of the long ones and never a different price.
  for (const [name, price] of pick.rows) assert.equal(cell(actions, name) ?? cell(reads, name), price, name);
  assert.ok(pick.fold !== true && credits.tables.slice(1).every((t) => t.fold), 'the short table is open, the long ones folded');
  assert.match(JSON.stringify(credits.info), /2026-11-03/);
  assert.match(JSON.stringify(g.notes), /2026-11-03/);
  for (const t of credits.tables) for (const r of t.rows) assert.ok(r[0].length > 3 && /\$|Not billed/.test(r[1]), r.join());
  // The picture: a file of public/guides/x, whole, small, and holding no name.
  const shots = g.steps.flatMap((s) => s.shots ?? []);
  assert.equal(shots.length, 1);
  const d = png(`public${shots[0].src}`);
  assert.deepEqual([d.w, d.h], [shots[0].w, shots[0].h]);
  assert.ok(d.bytes < 120_000);
  assert.deepEqual(readdirSync('public/guides/x'), ['x-dashboard.png']);
  assert.doesNotMatch(JSON.stringify(GUIDES) + readFileSync('scripts/guide-shots.mjs', 'utf8'), /Alhatime/i);
});

test('a date in a sentence is isolated, so an Arabic line does not reverse its hyphens', () => {
  const dates = segments('كما قُرئت في 2026-11-03، وتتغير').filter((g) => g.k === 'latin');
  assert.deepEqual(dates.map((g) => g.s), ['2026-11-03']);
  assert.equal(segments('بعد 3 أيام و12 ساعة').filter((g) => g.k !== 'text').length, 0, 'plain numbers stay in the line');
});

// «المنصات» (MVP_draft.md section 67): one state per platform worked out from what is stored, the sentence and the button
// that go with it, the menu, and the steps themselves. The page is clicked through by qa/platforms-flow.cjs, and the rules
// of saving run against the database in supabase/tests/platform_setup_rules.sql.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GUIDES, resolveGuide } from '../src/lib/setup-guides.ts';
import { actionOf, addOptions, chipOf, countAccounts, doneSteps, firstOpen, lineOf, listed, needsYou, platformName, platformState, setupGuideOf, splitOffer, stateRank, stepId } from '../src/lib/platforms/setup.ts';
import { PROVIDER_COPY, CONN_PROVIDERS } from '../src/lib/platforms/provider.ts';
import { PLATFORM_TEMPLATES } from '../src/lib/platforms/info.ts';

const TODAY = '2026-11-01';

test('a sign-in offers only what the site can link, and names the rest without a raw key', () => {
  const reg = { instagram: { kind: 'social', enabled: true, label_ar: 'إنستغرام' }, tiktok: { kind: 'social', enabled: false, label_ar: 'تيك توك' }, mail: { kind: 'mail', enabled: true, label_ar: 'البريد' } };
  const info = (k) => reg[k];
  const list = [{ platform: 'instagram', id: '1' }, { platform: 'facebook', id: '2' }, { platform: 'facebook', id: '3' }, { platform: 'tiktok', id: '4' }, { platform: 'mail', id: '5' }];
  const { can, away } = splitOffer(list, info);
  assert.deepEqual(can.map((c) => c.id), ['1']);
  assert.deepEqual(away, ['facebook', 'tiktok', 'mail']);
  assert.equal(platformName('facebook', info), 'فيسبوك');
  assert.equal(platformName('tiktok', info), 'تيك توك');
  assert.equal(platformName('nothing_known', info), 'منصة أخرى');
});
const p = (key, over = {}) => ({ key, kind: 'social', enabled: true, readiness: 'not_started', ...over });
const app = (over = {}) => ({ has_secret: true, state: 'connected', config: {}, ...over });
const ids = (g) => GUIDES[g].steps.map(stepId);
const state = (key, o = {}) => platformState({ p: p(key, o.p), app: o.app, setup: o.setup, today: TODAY });
const SETUPS = ['meta', 'facebook', 'tiktok', 'google', 'linkedin', 'x'];

test('each state, from what is stored', () => {
  assert.equal(state('linkedin'), 'none');
  assert.equal(state('tiktok', { setup: { done: ['app'] } }), 'steps');
  assert.equal(state('tiktok', { setup: { done: [] } }), 'steps', 'opened and left: the row says it was started');
  assert.equal(state('x', { app: app() }), 'ok');
  assert.equal(state('x', { app: app({ state: 'error' }) }), 'issue');
  assert.equal(state('x', { app: app({ state: 'needs_reconnect' }) }), 'issue');
  assert.equal(state('x', { app: app({ config: { secret_expires_on: '2026-11-10' } }) }), 'soon');
  assert.equal(state('x', { app: app({ config: { secret_expires_on: '2026-10-01' } }) }), 'issue');
  assert.equal(state('x', { app: app(), p: { enabled: false } }), 'off');
  assert.equal(state('linkedin', { app: app(), p: { readiness: 'submitted' } }), 'wait');
  assert.equal(state('snapchat'), 'manual');
  assert.equal(state('snapchat', { p: { enabled: false } }), 'off');
  assert.equal(platformState({ p: p('mail', { kind: 'mail' }), today: TODAY }), 'mail');
});

test('a stored secret proves the steps before it, except those another connection cannot have done', () => {
  // Drive stored the Google app: YouTube's own API and address are still to do.
  assert.equal(state('youtube', { app: app() }), 'steps');
  const s = GUIDES.google.steps;
  const done = doneSteps(s, null, true);
  assert.deepEqual(ids('google').filter((i) => !done.has(i)), ['youtube', 'redirect', 'publish']);
  assert.equal(state('youtube', { app: app(), setup: { done: ['youtube', 'redirect', 'publish'] } }), 'ok');
  // Instagram's app stored: Facebook still has its own use case, permissions and publishing.
  assert.equal(state('facebook', { app: app() }), 'steps');
  assert.equal(state('facebook', { app: app(), setup: { done: ['usecase', 'permissions', 'redirect', 'config', 'tasks'] } }), 'ok', 'a review never holds a connection back');
  // For the others the secret is the end of the work.
  for (const k of ['x', 'linkedin', 'instagram']) assert.equal(state(k, { app: app() }), 'ok', k);
  assert.equal(state('tiktok', { app: app() }), 'steps', 'TikTok still has its app review');
  assert.equal(state('tiktok', { app: app(), setup: { done: ['review'] } }), 'ok');
});

test('the words of a chip, the sentence under a name and the one button', () => {
  assert.equal(chipOf('steps', 4, 9), 'خطوات ناقصة · 4 من 9');
  for (const [s, w] of [['none', 'غير متصلة'], ['wait', 'بانتظار موافقة المنصة'], ['ok', 'متصلة'], ['issue', 'يوجد خلل'], ['off', 'موقوفة'], ['manual', 'نشر يدوي']]) assert.equal(chipOf(s), w);
  assert.equal(lineOf('steps', { accounts: 0, next: 'انسخ المعرّف', today: TODAY }), 'التالي: انسخ المعرّف');
  assert.equal(lineOf('ok', { accounts: 3, today: TODAY }), '3 حسابات');
  assert.match(lineOf('ok', { accounts: 1, today: TODAY, provider: 'google' }), /مشترك مع Drive/);
  assert.equal(countAccounts(0), 'لا حسابات بعد');
  assert.equal(countAccounts(2), 'حسابان');
  assert.deepEqual(actionOf('none'), { label: 'بدء الإعداد', tone: 'pri', to: 'first' });
  assert.deepEqual(actionOf('issue'), { label: 'إصلاح', tone: 'fix', to: 'keys' });
  assert.equal(actionOf('wait').to, 'review');
  assert.equal(actionOf('ok'), null);
  assert.equal(actionOf('manual'), null);
});

test('what needs the reader comes first, and what waits on a platform does not ask for them', () => {
  assert.ok(needsYou('issue') && needsYou('steps') && needsYou('none') && needsYou('soon'));
  assert.ok(!needsYou('wait') && !needsYou('ok') && !needsYou('manual'));
  assert.ok(stateRank('issue') < stateRank('steps') && stateRank('steps') < stateRank('none') && stateRank('none') < stateRank('ok'));
});

test('a platform switched off and never touched waits in the menu, and everything else is listed', () => {
  assert.equal(listed(p('tiktok', { enabled: false }), { accounts: 0 }), false);
  assert.equal(listed(p('tiktok', { enabled: false }), { accounts: 0, setup: { done: [] } }), true);
  assert.equal(listed(p('tiktok', { enabled: false }), { accounts: 0, app: app() }), true);
  assert.equal(listed(p('tiktok', { enabled: false }), { accounts: 2 }), true);
  assert.equal(listed(p('tiktok', { enabled: false, readiness: 'submitted' }), { accounts: 0 }), true, 'a review under way stays in sight');
  assert.equal(listed(p('custom_one', { enabled: false }), { accounts: 0 }), true);
  assert.equal(listed(p('mail', { kind: 'mail', enabled: false }), { accounts: 0 }), true);
});

test('«إضافة منصة» offers everything not yet on its way, those with steps first, and other platforms last', () => {
  const list = [{ key: 'instagram', label_ar: 'إنستغرام', kind: 'social' }, { key: 'x', label_ar: 'X', kind: 'social' }, { key: 'tiktok', label_ar: 'تيك توك', kind: 'social' }, { key: 'mail', label_ar: 'البريد', kind: 'mail' }];
  const o = addOptions(list, (k) => ({ instagram: 'none', x: 'ok' })[k] ?? null);
  const keys = o.map((x) => x.key);
  assert.deepEqual(keys.slice(0, 3), ['instagram', 'tiktok', 'facebook']);
  assert.equal(o[0].kind, 'open');
  assert.equal(o[0].hint, '9 خطوات');
  assert.ok(!keys.includes('x'), 'a connected platform is not offered');
  assert.ok(!keys.includes('mail'));
  assert.deepEqual(o.find((x) => x.key === 'facebook').kind, 'template');
  assert.equal(o.find((x) => x.key === 'snapchat').manual, true);
  assert.equal(o.at(-1).kind, 'custom');
  for (const t of PLATFORM_TEMPLATES) if (t.key !== 'tiktok') assert.ok(keys.includes(t.key), t.key);
});

test('every platform with a sign-in has a setup, and every step can be followed from the sheet', () => {
  for (const k of ['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin', 'x']) assert.ok(GUIDES[setupGuideOf(k)], k);
  assert.equal(setupGuideOf('snapchat'), null);
  for (const g of SETUPS) {
    const s = GUIDES[g].steps;
    assert.equal(new Set(s.map((x) => x.id)).size, s.length, `${g}: step ids are unique`);
    for (const x of s) {
      assert.match(x.id ?? '', /^[a-z0-9_]{1,30}$/, `${g}: ${x.t}`);
      assert.ok(x.b && x.b.length > 8, `${g}: ${x.t} says what to do`);
      if (!x.kind || x.kind === 'copy') assert.ok(x.ok, `${g}: ${x.id} has a button that says it is done`);
      if (x.kind === 'copy') assert.ok(x.copy && x.copyLabel, `${g}: ${x.id}`);
    }
    assert.equal(s.filter((x) => x.kind === 'keys').length, 1, `${g}: one step takes the keys`);
    assert.ok(s.some((x) => x.link), `${g}: at least one step links to the platform`);
    assert.ok(s.filter((x) => !x.kind).every((x) => x.link || x.b.length > 8), g);
  }
});

test('the facts of 2026-11-01 are the ones in the steps', () => {
  const all = (g) => JSON.stringify(GUIDES[g]);
  assert.match(all('meta'), /Manage messaging & content on Instagram/);
  assert.match(all('meta'), /API setup with Unified login/);
  assert.match(all('meta'), /instagram_content_publish/);
  assert.match(all('meta'), /حافظة/);
  assert.doesNotMatch(all('meta'), /Add products/);
  assert.match(all('facebook'), /Manage everything on your Page/);
  assert.match(all('facebook'), /publish_video/);
  assert.match(all('facebook'), /Facebook Login for Business/);
  assert.match(all('tiktok'), /Connect an app/);
  assert.match(all('tiktok'), /Direct Post/);
  assert.match(all('tiktok'), /App review/);
  assert.match(all('tiktok'), /URL prefix/);
  assert.match(all('tiktok'), /5 مستخدمين/);
  assert.match(all('google'), /مرة واحدة عند إنشائه/);
  assert.match(all('google'), /Publish app/);
  assert.match(all('google'), /7 أيام/);
  assert.match(all('google'), /100 مقطع/);
  assert.doesNotMatch(all('google'), /«خاصاً» حتى تجتاز/);
  assert.match(all('linkedin'), /Share on LinkedIn/);
  assert.match(all('linkedin'), /Community Management API/);
  assert.match(all('linkedin'), /لا Gmail/);
  assert.match(all('x'), /console\.x\.com/);
  assert.match(all('x'), /0\.015/);
  assert.match(all('x'), /0\.20/);
  assert.doesNotMatch(all('x'), /developer\.x\.com\/en\/portal/);
  assert.match(all('connect_meta'), /حافظة/);
  assert.match(all('connect_google'), /دخول مستقل/);
});

test('the addresses are filled in, and a second value to copy too', () => {
  const g = resolveGuide(GUIDES.tiktok, 'https://hub.example.org', 'tiktok');
  const d = g.steps.find((s) => s.id === 'details');
  assert.equal(d.copy, 'https://hub.example.org');
  assert.deepEqual(d.more.map((m) => m.copy), ['https://hub.example.org/terms.html', 'https://hub.example.org/privacy.html']);
  assert.doesNotMatch(JSON.stringify(g), /\{origin\}|\{redirect\}/);
});

test('every app has its labels, and the two pages the steps send people to exist', () => {
  for (const k of CONN_PROVIDERS) assert.ok(PROVIDER_COPY[k].idLabel && PROVIDER_COPY[k].secretLabel, k);
  for (const f of ['privacy.html', 'terms.html', 'account-deletion.html']) assert.ok(readFileSync(`public/${f}`, 'utf8').length > 100, f);
});

test('the sheet saves no secret: the progress call carries the two plain fields, and the page never asks for a password to add an account', () => {
  const sheet = readFileSync('src/components/settings/platform-sheet.tsx', 'utf8');
  assert.match(sheet, /rpc\('platform_setup_save', \{ p_key: p\.key, p_done: nextDone, p_step: nextAt, p_fields: nextFields \}\)/);
  assert.match(sheet, /onSaved\(\{ app_id: id\.trim\(\), \.\.\.\(config\.trim\(\) \? \{ config_id: config\.trim\(\) \} : \{\}\) \}\)/);
  const accounts = readFileSync('src/components/work/channels.tsx', 'utf8') + readFileSync('src/components/work/connect.tsx', 'utf8');
  assert.doesNotMatch(accounts, /type="password"/);
  assert.match(accounts, /لا يطلب الموقع كلمة مرورك أبداً/);
});

test('the steps sit first in the document in both sheets, so they follow the page\'s direction and no side is named', () => {
  const sheet = readFileSync('src/components/settings/platform-sheet.tsx', 'utf8');
  assert.ok(sheet.indexOf('<SheetSteps') < sheet.indexOf('className="pf-input"'));
  const channels = readFileSync('src/components/work/channels.tsx', 'utf8');
  const add = channels.slice(channels.indexOf('function AddAccountSheet'));
  assert.ok(add.indexOf('<SheetSteps') < add.indexOf('className="pf-input"'));
  const css = readFileSync('src/app/work.css', 'utf8');
  const rules = css.slice(css.indexOf('.pf-body{'), css.indexOf('.pf-steps{'));
  assert.doesNotMatch(rules, /row-reverse|\bleft\b|\bright\b/);
});

test('no emoji in anything these pages say', () => {
  const all = ['src/lib/platforms/setup.ts', 'src/components/settings/platform-sheet.tsx', 'src/components/sheet.tsx', 'src/components/settings/platforms.tsx', 'src/components/work/channels.tsx'].map((f) => readFileSync(f, 'utf8')).join('');
  assert.doesNotMatch(all, /\p{Extended_Pictographic}/u);
});

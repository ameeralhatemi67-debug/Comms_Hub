// Browser check of the per-platform post preview, the send step's checks, the publishing pack
// and the connection lines of «الحسابات المرتبطة» (readiness audit, steps 5 and 6), without
// signing in: the pages are behind sign-in and no bypass is allowed, so this compiles the site's
// own components (src/components/work/post-preview.tsx, connect.tsx, channels.tsx and the
// platform rules in src/lib/platforms) with the database layer replaced by fixture data, renders
// them with React, and checks the result in headless Edge: no page errors, the expected words,
// no sideways scroll at phone width, in Direction A and the new identity. What this cannot
// check: the calls to the platforms and the database (qa/platform-limits-rules.json,
// qa/platform-connections-rules.json and tests/connections.test.mjs cover those) and the
// real sign-in at Meta and TikTok (the owner walkthrough in progress.md).
// Usage: node qa/post-preview.cjs   (writes qa/post-preview.json, screenshots in qa/artifacts/post-preview/)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ts = require('typescript');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');

const root = path.resolve(__dirname, '..');
const out = path.join(__dirname, 'artifacts', 'post-preview');
const build = path.join(out, 'build');
const result = { run: new Date().toISOString(), checks: [], errors: [] };
const check = (name, pass, detail = '') => result.checks.push({ name, pass: Boolean(pass), detail: String(detail) });

fs.rmSync(build, { recursive: true, force: true });
const sources = [
  'components/work/post-preview.tsx', 'components/work/connect.tsx', 'components/work/channels.tsx', 'components/work/parts.tsx', 'components/work/plan.tsx',
  'lib/work/rules.ts', 'lib/work/planning.ts', 'lib/work/drag.ts', 'lib/media/rules.ts', 'lib/domain.ts', 'lib/kit/hold-reasons.ts',
  'lib/platforms/info.ts', 'lib/platforms/limits.ts', 'lib/platforms/copies.ts', 'lib/platforms/provider.ts',
];
for (const m of sources) {
  const src = fs.readFileSync(path.join(root, 'src', m), 'utf8');
  const depth = m.split('/').length - 1;
  const up = '../'.repeat(depth);
  let js = ts.transpileModule(src, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, verbatimModuleSyntax: false },
  }).outputText;
  js = js
    .replace(/from '@\/lib\/supabase\/client'/g, `from '${up}mocks/supabase.js'`)
    .replace(/from 'next\/link'/g, `from '${up}mocks/link.js'`)
    .replace(/from 'next\/navigation'/g, `from '${up}mocks/navigation.js'`)
    .replace(/from '\.\/data'/g, `from '${up}mocks/data.js'`)
    .replace(/from '\.\.\/perm-requests'/g, `from '${up}mocks/perm-requests.js'`)
    .replace(/from '@\/lib\/([^']+)'/g, `from '${up}lib/$1.js'`)
    .replace(/from '(\.[^']+)\.ts'/g, "from '$1.js'")
    .replace(/from '(\.\/(?:plan|parts|post-preview|connect))'/g, "from '$1.js'");
  const dest = path.join(build, m.replace(/\.tsx?$/, '.js'));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, js);
}
fs.mkdirSync(path.join(build, 'mocks'), { recursive: true });
fs.writeFileSync(path.join(build, 'package.json'), '{"type":"module"}');
fs.writeFileSync(path.join(build, 'mocks', 'link.js'), `import { createElement } from 'react';
export default function Link({ href, children, ...rest }) { return createElement('a', { href, ...rest }, children); }`);
fs.writeFileSync(path.join(build, 'mocks', 'navigation.js'), `export const useRouter = () => ({ push() {}, replace() {}, refresh() {} });
export const usePathname = () => '/channels';
export const useSearchParams = () => new URLSearchParams(globalThis.__WK.search || '');`);
fs.writeFileSync(path.join(build, 'mocks', 'supabase.js'), `const chain = new Proxy(function () {}, { get: () => chain, apply: () => chain });
export const supabase = () => chain;`);
fs.writeFileSync(path.join(build, 'mocks', 'perm-requests.js'), 'export const usePermRequests = () => ({ list: [], status: "ready", reload: async () => {} });');
fs.writeFileSync(path.join(build, 'mocks', 'data.js'), `export const useWork = () => globalThis.__WK.ctx;
export const useWorkList = () => ({ items: globalThis.__WK.items, status: 'ready', reload: async () => {} });
export const libraryFiles = async () => [];`);
for (const f of ['globals.css', 'identity.css', 'work.css']) fs.copyFileSync(path.join(root, 'src/app', f), path.join(out, f));

const TODAY = '2026-10-15';
const people = [
  ['dir@x.sa', 'محمد', 'director'], ['asst@x.sa', 'ريم', 'assistant'], ['noura@x.sa', 'نورة', 'publisher'], ['khalid@x.sa', 'خالد', 'writer'],
].map(([email, display_name, role]) => ({ email, display_name, role }));
const acc = (id, platform, label, handle, over = {}) => ({
  id, platform, label, handle, purpose: null, authorized_until: '2026-12-01T00:00:00Z', publishers: ['noura@x.sa'], mode: 'auto', active: true, fixed: false,
  conn_kind: 'simulated', conn_state: 'simulated', conn_checked_at: null, conn_error: null, external_id: null, external_name: null, scopes: [], ...over,
});
const accounts = [
  acc('a-ig', 'instagram', 'الرسمي', '@company.sa', { conn_kind: 'oauth', conn_state: 'connected', conn_checked_at: '2026-10-15T08:00:00Z', external_id: 'IG1', external_name: 'company.sa' }),
  acc('a-fb', 'facebook', 'الصفحة', '@company', { conn_kind: 'oauth', conn_state: 'needs_reconnect', conn_error: 'TOKEN_REFUSED', external_id: 'P1', external_name: 'شركة', authorized_until: '2026-10-15T07:00:00Z' }),
  acc('a-tt', 'tiktok', 'الرسمي', '@company_tt', { conn_kind: 'oauth', conn_state: 'error', conn_error: 'UNREACHABLE', external_id: 'OID', external_name: 'الشركة' }),
  acc('a-x', 'x', 'الرسمي', '@company_sa'),
  acc('a-sn', 'snapchat', 'الرسمي', '@company_sn'),
  acc('a-yt', 'youtube', 'الرسمي', '@CompanySA'),
  acc('a-mail', 'mail', 'صندوق القسم', null, { fixed: true, authorized_until: null, publishers: [] }),
];

(async () => {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const url = (f) => 'file:///' + path.join(build, f).replace(/\\/g, '/');
  const pv = await import(url('components/work/post-preview.js'));
  const chan = await import(url('components/work/channels.js'));
  const conn = await import(url('components/work/connect.js'));
  const lim = await import(url('lib/platforms/limits.js'));
  const rules = await import(url('lib/work/rules.js'));
  const h = React.createElement;

  const registry = ['instagram', 'facebook', 'tiktok', 'x', 'snapchat', 'youtube', 'mail'].map((key, i) => {
    const b = rules.BUILTIN_PLATFORMS.find((p) => p.key === key);
    const label = { instagram: 'إنستغرام', facebook: 'فيسبوك', tiktok: 'تيك توك', x: 'X', snapchat: 'سناب شات', youtube: 'يوتيوب', mail: 'البريد' }[key];
    const base = b ?? { key, label_ar: label, kind: 'social', sort: i + 1, accepts: {}, publish_mode: 'assisted', scheduling: true, requires_review: false, token_life_days: null, enabled: true, builtin: false, docs_url: null, readiness: 'not_started', readiness_note: null, readiness_at: null, readiness_by: null };
    const extra = key === 'tiktok' ? { accepts: { video_only: true, ...lim.limitsToAccepts(lim.TEMPLATE_LIMITS.tiktok) }, publish_mode: 'assisted' } : key === 'snapchat' ? { publish_mode: 'manual' } : key === 'facebook' ? { accepts: lim.limitsToAccepts(lim.TEMPLATE_LIMITS.facebook), publish_mode: 'assisted' } : {};
    return { ...base, ...extra, sort: i + 1 };
  });
  rules.setPlatformRegistry(registry);
  const ctx = (role, email) => ({
    status: 'ready', me: email, role, isAdmin: false, today: TODAY, people, load: [], projects: [], accounts, platforms: registry, templates: [],
    nameOf: (e) => people.find((p) => p.email === e)?.display_name ?? e, personOf: (e) => people.find((p) => p.email === e), reloadBase: async () => {}, call: async () => ({ ok: true, data: null }), say: () => {},
  });
  const pages = {};
  const render = (name, role, email, el, extra = {}) => {
    globalThis.__WK = { ctx: ctx(role, email), items: [], search: '', ...extra };
    try {
      pages[name] = renderToStaticMarkup(h('div', { className: 'wk' }, el)).replace(/<dialog /g, '<dialog open ');
      check(`${name}: renders`, true);
    } catch (e) {
      check(`${name}: renders`, false, e.stack);
      pages[name] = '';
    }
  };

  // ---- the work: a long post with hashtags, one of 300 characters for X, a video work ----
  const ar = (n) => 'كلمة '.repeat(n).trim();
  const src = {
    type: 'post',
    texts: [{ n: 1, body: `${ar(40)} #اليوم_الوطني #السعودية` }],
    variants: [{ platform: 'x', n: 1, body: 'ا'.repeat(300) }],
    assets: [{ file: { id: 'f1', kind: 'image', name: 'ملصق اليوم الوطني' } }, { file: null }],
  };
  render('preview-instagram', 'writer', 'khalid@x.sa', h(pv.PreviewOfWork, { platform: 'instagram', src, account: accounts[0] }));
  render('preview-x-over', 'writer', 'khalid@x.sa', h(pv.PreviewOfWork, { platform: 'x', src, account: accounts[3] }));
  render('preview-youtube', 'writer', 'khalid@x.sa', h(pv.PreviewOfWork, {
    platform: 'youtube', src: { ...src, variants: [{ platform: 'youtube', n: 1, body: `${'ع'.repeat(101)}\nوصف الفيديو` }] }, account: accounts[5],
  }));
  render('strip', 'writer', 'khalid@x.sa', h(pv.CopyStrip, { src, platforms: ['instagram', 'x', 'linkedin', 'youtube'], onOpen() {} }));

  const Wrap = (props) => {
    const rows = pv.useSendChecks(props.src, props.accounts);
    return h('div', null, h(pv.SendChecks, { rows }), pv.blocked(rows) ? h('p', { id: 'blocked' }, 'محجوب') : null);
  };
  render('send-checks', 'publisher', 'noura@x.sa', h(Wrap, { src, accounts: [accounts[0], accounts[3], accounts[2], accounts[4]] }));
  render('send-checks-clean', 'publisher', 'noura@x.sa', h(Wrap, { src: { ...src, variants: [] }, accounts: [accounts[0], accounts[4]] }));
  render('send-checks-loading', 'publisher', 'noura@x.sa', h(Wrap, { src: null, accounts }));

  // ---- the channels page with real, broken and simulated connections ----
  render('channels-director', 'director', 'dir@x.sa', h(chan.ChannelsPage));
  render('channels-publisher', 'publisher', 'noura@x.sa', h(chan.ChannelsPage));
  render('chooser-shell', 'director', 'dir@x.sa', h(conn.ConnectChooser, { provider: 'meta', offer: '00000000-0000-4000-8000-000000000001', onClose() {}, onDone() {} }));
  render('conn-lines', 'director', 'dir@x.sa', h('div', null, accounts.filter((a) => a.platform !== 'mail').map((a) => h('p', { key: a.id }, conn.connLine(a).text))));

  const page = (body, attrs = '') => `<!doctype html><html lang="ar" dir="rtl" ${attrs}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="data:,"><link rel="stylesheet" href="globals.css"><link rel="stylesheet" href="identity.css"><link rel="stylesheet" href="work.css">
<style>body{font-family:"Segoe UI",Tahoma,sans-serif}main{max-width:1400px}</style></head><body><main id="main">${body}</main></body></html>`;
  for (const [name, html] of Object.entries(pages)) fs.writeFileSync(path.join(out, `${name}.html`), page(html));

  const server = http.createServer((req, res) => {
    const f = path.join(out, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
    if (!f.startsWith(out) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch(launchOptions);
  try {
    const expect = {
      'preview-instagram': ['معاينة تقريبية', 'إنستغرام', '… المزيد', '/ 2200', '/ 30', 'ضمن حدود المنصة', 'للعلم', 'النص الأساسي كما هو', 'مصدر الحدود', 'في مجلد لا تصل إليه'],
      'preview-x-over': ['يمنع النشر', '300 حرفاً والحد 280', 'اختصره بـ 20', 'النسخة الخاصة بـ X', '/ 280'],
      'preview-youtube': ['العنوان', 'العنوان (السطر الأول) 101 حرفاً والحد 100', 'يمنع النشر', 'تقبل الفيديو فقط', 'بايت'],
      strip: ['إنستغرام', 'ضمن الحدود', 'يتجاوز الحد', 'نسخة خاصة', 'النص الأساسي'],
      'send-checks': ['يمنع النشر', 'ضمن الحدود', 'حزمة النشر', 'مهمة يدوية', 'نسخ النص', 'محجوب'],
      'send-checks-clean': ['ضمن الحدود', 'حزمة النشر'],
      'send-checks-loading': ['جارٍ فحص النسخ'],
      'channels-director': ['ربط حقيقي · سليم', 'ربط حقيقي · يحتاج ربطاً من جديد', 'رفضت المنصة الرمز', 'تعذّر الفحص', 'ربط محاكى', 'فحص الاتصال', 'إعادة الربط عبر المنصة', 'ربط عبر Meta', 'ربط عبر TikTok', 'مسار يدوي', 'يحتاج ربطاً من جديد', 'النشر نفسه ما زال محاكاة'],
      'channels-publisher': ['فحص الاتصال', 'ربط محاكى'],
      'chooser-shell': ['ربط حسابات عبر Meta', 'جارٍ قراءة ما يمكن ربطه'],
      'conn-lines': ['ربط حقيقي', 'ربط محاكى'],
    };
    const notExpect = {
      'channels-director': ['ربط حقيقي · سليم · آخر فحص لم يُفحص'],
      'channels-publisher': ['ربط عبر Meta', 'ربط عبر TikTok', 'إعادة الربط عبر المنصة'],
      'send-checks-clean': ['يمنع النشر'],
    };
    for (const [name, words] of Object.entries(expect)) {
      const html = pages[name] ?? '';
      const text = html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');
      for (const w of words) check(`${name}: shows «${w}»`, text.includes(w), text.slice(0, 80));
      for (const w of notExpect[name] ?? []) check(`${name}: does not show «${w}»`, !text.includes(w));
    }
    // The real connection offers no simulated reconnect, the simulated one does.
    const chText = (pages['channels-director'] ?? '');
    check('channels: a real connection has the platform reconnect and a hold-to-confirm disconnect', chText.includes('data-hold="الفصل يدمّر رمز الحساب') && />فصل<\/button>/.test(chText));
    check('send step: the over-limit account blocks', (pages['send-checks'] ?? '').includes('id="blocked"'));
    check('send step: a clean work does not block', !(pages['send-checks-clean'] ?? '').includes('id="blocked"'));
    check('the pack carries the exact text to copy and no token', !/ptok|access_token|secret/i.test(pages['send-checks'] ?? ''));

    for (const look of ['a', 'e']) {
      for (const vw of [1280, 390]) {
        for (const name of Object.keys(pages)) {
          const ctxB = await browser.newContext({ viewport: { width: vw, height: 900 } });
          const p = await ctxB.newPage();
          const errs = [];
          p.on('pageerror', (e) => errs.push(e.message));
          await p.goto(base + `${name}.html`, { waitUntil: 'load' });
          if (look === 'e') await p.evaluate(() => document.documentElement.setAttribute('data-identity', 'emerald'));
          const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
          check(`${name} ${look}/${vw}: no sideways scroll`, m.sw <= m.cw + 1, `${m.sw} > ${m.cw}`);
          check(`${name} ${look}/${vw}: no page errors`, !errs.length, errs.join(' | '));
          if (look === 'a' && vw === 1280 && ['preview-instagram', 'preview-x-over', 'send-checks', 'channels-director'].includes(name)) {
            await p.screenshot({ path: path.join(out, `${name}.${look}.${vw}.png`), fullPage: true });
          }
          if (look === 'e' && vw === 390 && ['preview-instagram', 'send-checks', 'channels-director'].includes(name)) {
            await p.screenshot({ path: path.join(out, `${name}.${look}.${vw}.png`), fullPage: true });
          }
          await ctxB.close();
        }
      }
    }
  } catch (e) {
    result.errors.push(e.stack);
  } finally {
    await browser.close();
    server.close();
  }
  const failed = result.checks.filter((c) => !c.pass);
  result.summary = { total: result.checks.length, passed: result.checks.length - failed.length, failed: failed.length };
  fs.writeFileSync(path.join(__dirname, 'post-preview.json'), JSON.stringify(result, null, 2));
  console.log(`${result.summary.passed} of ${result.summary.total} passed`);
  for (const f of failed) console.log('FAIL', f.name, f.detail.slice(0, 300));
  for (const e of result.errors) console.log('ERROR', e);
  process.exit(failed.length || result.errors.length ? 1 : 0);
})();

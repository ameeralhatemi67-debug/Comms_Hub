// Browser check of the permissions screens (Permissions_Plan.md): «الحسابات» with its four
// tabs, the person's card, the grant dialog, presets, the role matrix and the log (Step P2),
// and «صلاحياتي» on the account page; later steps add their screens here.
// The pages are behind sign-in and no bypass is allowed, so, as qa/work-pages.cjs does, this
// compiles the pages' own components with the data layer (./data, ../caps) replaced by
// fixtures, renders them with React, and checks the result in headless Edge: no page errors,
// the expected content, nothing a role must not see, no sideways scroll at phone width, in
// Direction A, the new identity and its evening mode.
// What this cannot check: clicks that call the database. Those are in the owner walkthrough.
// Usage: node qa/permissions-pages.cjs   (writes qa/permissions-pages.json, screenshots in qa/artifacts/permissions/)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ts = require('typescript');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');

const root = path.resolve(__dirname, '..');
const out = path.join(__dirname, 'artifacts', 'permissions');
const build = path.join(out, 'build');
const result = { run: new Date().toISOString(), checks: [], errors: [] };
const check = (name, pass, detail = '') => result.checks.push({ name, pass: Boolean(pass), detail: String(detail) });

// ---------- compile the real modules, with the data layer swapped for fixtures ----------
fs.rmSync(build, { recursive: true, force: true });
const sources = [
  'components/accounts/page.tsx', 'components/accounts/members.tsx', 'components/accounts/card.tsx', 'components/accounts/roles.tsx',
  'components/accounts/log.tsx', 'components/my-permissions.tsx', 'components/ui.tsx', 'components/logo-loader.tsx',
  'lib/domain.ts', 'lib/permissions.ts', 'lib/access.ts', 'lib/kit/hold-reasons.ts',
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
    .replace(/from '(\.\.\/|\.\/)caps'/g, `from '${up}mocks/caps.js'`)
    .replace(/from '@\/lib\/([^']+)'/g, `from '${up}lib/$1.js'`)
    .replace(/from '(\.[^']+)\.ts'/g, "from '$1.js'")
    .replace(/from '(\.\.?\/[^'.]+)'/g, "from '$1.js'");
  const dest = path.join(build, m.replace(/\.tsx?$/, '.js'));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, js);
}
fs.mkdirSync(path.join(build, 'mocks'), { recursive: true });
fs.writeFileSync(path.join(build, 'package.json'), '{"type":"module"}');
fs.writeFileSync(path.join(build, 'mocks', 'link.js'), `import { createElement } from 'react';
export default function Link({ href, children, ...rest }) { return createElement('a', { href, ...rest }, children); }`);
fs.writeFileSync(path.join(build, 'mocks', 'navigation.js'), `export const useRouter = () => ({ push() {}, replace() {}, refresh() {} });
export const usePathname = () => '/accounts';
export const useSearchParams = () => new URLSearchParams(globalThis.__PM.search || '');`);
fs.writeFileSync(path.join(build, 'mocks', 'supabase.js'), `const chain = new Proxy(function () {}, { get: () => chain, apply: () => chain });
export const supabase = () => chain;`);
fs.writeFileSync(path.join(build, 'mocks', 'data.js'), `export const useAccounts = () => globalThis.__PM.ctx;
export const AccountsProvider = ({ children }) => children;
export const usePersonCard = (email) => ({ card: globalThis.__PM.cards[email] ?? null, error: globalThis.__PM.cards[email] ? '' : 'لا تملك صلاحية هذا الإجراء.' });
export const useRooms = () => globalThis.__PM.rooms;`);
fs.writeFileSync(path.join(build, 'mocks', 'caps.js'), `export const useCaps = () => globalThis.__PM.caps;`);
for (const f of ['globals.css', 'identity.css', 'work.css', 'chat.css', 'permissions.css']) fs.copyFileSync(path.join(root, 'src/app', f), path.join(out, f));

// ---------- fixture: a department on 13 October 2026 ----------
const NOW = '2026-10-13T09:00:00Z';
const in1d = '2026-10-14T09:00:00Z';
const members = [
  ['amir@x.sa', 'أمير', 'admin', true], ['dir@x.sa', 'محمد', 'director'], ['asst@x.sa', 'ريم', 'assistant'], ['khalid@x.sa', 'خالد', 'writer'],
  ['sara@x.sa', 'سارة', 'designer'], ['ahmed@x.sa', 'أحمد', 'producer'], ['noura@x.sa', 'نورة', 'publisher'], ['abd@x.sa', 'عبدالله', 'member'],
].map(([email, display_name, role, prot]) => ({ email, display_name, role, pages: ['work', 'mail', 'media'], protected: !!prot, added_by: 'seed', created_at: '2026-10-11T00:00:00Z', last_seen_at: email === 'abd@x.sa' ? null : '2026-10-13T07:30:00Z' }));
const G = (over) => ({ id: 'g', email: 'khalid@x.sa', k: 'urgency.2', mode: 'timed', effect: 'allow', until: in1d, uses: null, total: null, scope: null, by: 'dir@x.sa', at: '2026-10-13T08:00:00Z', reason: 'تغطية', ...over });
const grants = [
  G({ id: 'g1' }),
  G({ id: 'g2', k: 'whatsapp.push', mode: 'once', until: null, uses: 1, total: 1, scope: { room: 'r1' } }),
  G({ id: 'g3', k: 'room.create', mode: 'standing', effect: 'deny', until: null }),
  G({ id: 'g4', email: 'sara@x.sa', k: 'mail.outside.send', mode: 'timed', until: in1d }),
];
const ROLE_ON = { director: ['urgency.2', 'mail.outside.send', 'room.create', 'accounts.view', 'permissions.grant', 'roles.assign', 'members.invite', 'members.remove', 'roles.templates.edit'], assistant: ['urgency.2', 'mail.outside.send', 'room.create', 'accounts.view', 'permissions.grant'] };
const grantable = ['urgency.2', 'whatsapp.push', 'mail.outside.send', 'room.create', 'accounts.view', 'permissions.grant', 'roles.assign', 'members.invite', 'members.remove', 'roles.templates.edit', 'whatsapp.system.manage'];
const defaults = ['admin', 'director', 'assistant', 'writer', 'designer', 'producer', 'publisher', 'member'].flatMap((role) =>
  grantable.map((capability) => ({ role, capability, allowed: role === 'admin' ? capability !== 'whatsapp.push' : (ROLE_ON[role] ?? []).includes(capability) })));
const ev = (id, kind, over) => ({ id, at: '2026-10-13T08:00:00Z', actor: 'dir@x.sa', subject: 'khalid@x.sa', role: null, capability: 'urgency.2', kind, data: {}, ...over });
const events = [
  ev(1, 'grant', { data: { mode: 'timed', until: in1d } }),
  ev(2, 'override', { capability: 'room.create', data: { effect: 'deny' } }),
  ev(3, 'role_default', { actor: null, subject: null, role: 'director', capability: 'accounts.view', data: { allowed: true, people: 1 } }),
  ev(4, 'role_assign', { subject: 'sara@x.sa', capability: null, role: 'designer', data: { from: 'producer', to: 'designer' } }),
  ev(5, 'use', { actor: 'khalid@x.sa', capability: 'whatsapp.push', data: { left: 0 } }),
  ev(6, 'expired', { actor: null, capability: 'page.calendar' }),
];
const presets = [{ id: 'p1', name: 'تغطية النشر لأسبوع', items: [{ k: 'mail.outside.send', mode: 'timed', hours: 168 }], note: null, created_by: 'dir@x.sa' }];
const requests = [{ id: 'ar1', email: 'new@x.sa', full_name: 'لمى', note: 'منضمة إلى فريق التصميم', created_at: '2026-10-12T10:00:00Z' }];
const capEval = (k, ok, src, over = {}) => ({ k, ok, src, until: null, uses: null, id: null, ...over });
const KEYS = ['page.work', 'page.create', 'page.approvals', 'page.calendar', 'page.media', 'page.tasks', 'page.activity', 'page.motion', 'page.mail', 'page.ideas', 'page.analytics', 'page.monitoring', 'page.settings',
  'urgency.2', 'urgency.3', 'whatsapp.push', 'mail.outside.send', 'room.create', 'accounts.view', 'permissions.grant', 'roles.assign', 'members.invite', 'members.remove', 'roles.templates.edit', 'whatsapp.system.manage',
  'work.approve', 'work.publish', 'media.approve', 'approve.own', 'role.switch', 'account.protected'];
const writerCaps = KEYS.map((k) => {
  if (['page.work', 'page.mail', 'page.media'].includes(k)) return capEval(k, true, 'page');
  if (k === 'urgency.2') return capEval(k, true, 'timed', { until: in1d, id: 'g1' });
  if (k === 'whatsapp.push') return capEval(k, false, 'none');
  if (k === 'room.create') return capEval(k, false, 'removed', { id: 'g3' });
  if (k === 'permissions.grant') return capEval(k, false, 'none');
  if (['urgency.3', 'work.approve', 'work.publish', 'media.approve', 'approve.own', 'role.switch', 'account.protected'].includes(k)) return capEval(k, false, 'fixed');
  return capEval(k, false, 'none');
});
const khalidCard = { email: 'khalid@x.sa', name: 'خالد', role: 'writer', pages: ['work', 'mail', 'media'], protected: false, last_seen: '2026-10-13T07:30:00Z',
  caps: writerCaps.map((c) => (c.k === 'whatsapp.push' ? capEval(c.k, true, 'once', { uses: 1, id: 'g2' }) : c.k === 'mail.outside.send' ? capEval(c.k, false, 'none') : c.k === 'accounts.view' ? capEval(c.k, false, 'none') : c.k === 'urgency.2' ? c : c.k === 'page.calendar' ? capEval(c.k, false, 'none') : c)).concat([]),
  grants: grants.filter((g) => g.email === 'khalid@x.sa'), folders: [{ folder: 'f1', name: 'العقود', level: 1 }] };
// the writer also holds «إرسال للمراجعة»-like role rights; give one role-sourced row for the «إيقاف له» control
khalidCard.caps = khalidCard.caps.map((c) => (c.k === 'urgency.2' ? c : c));
const directorCaps = KEYS.map((k) => (k.startsWith('page.') ? capEval(k, ['page.work', 'page.mail', 'page.media', 'page.calendar'].includes(k), 'page') : ROLE_ON.director.includes(k) ? capEval(k, true, 'role') : ['urgency.3', 'work.approve', 'media.approve'].includes(k) ? capEval(k, true, 'fixed') : ['work.publish', 'approve.own', 'role.switch', 'account.protected'].includes(k) ? capEval(k, false, 'fixed') : capEval(k, false, 'none')));
const capsOf = (evals) => ({ ready: true, evals, grants: [], has: (k) => !!evals.find((e) => e.k === k)?.ok, evalOf: (k) => evals.find((e) => e.k === k), reload: async () => {} });
const assistantCaps = KEYS.map((k) => (k.startsWith('page.') ? capEval(k, ['page.work', 'page.mail'].includes(k), 'page') : ROLE_ON.assistant.includes(k) ? capEval(k, true, 'role') : ['urgency.3', 'work.approve', 'media.approve'].includes(k) ? capEval(k, true, 'fixed') : capEval(k, false, k.startsWith('work.') || k.includes('.own') || k.startsWith('role.') || k.startsWith('account.') ? 'fixed' : 'none')));
const ctx = (email, role, evals) => ({
  status: 'ready', me: { email, name: members.find((m) => m.email === email)?.display_name ?? '', role, pages: ['work', 'mail', 'media', 'calendar'], protected: false, caps: evals.filter((e) => e.ok && !e.k.startsWith('page.')).map((e) => e.k) },
  can: (k) => !!evals.find((e) => e.k === k)?.ok, members, requests, grants, defaults, events, presets,
  nameOf: (e) => members.find((m) => m.email === e)?.display_name ?? (e ? e.split('@')[0] : ''), reload: async () => {}, call: async () => ({ ok: true, data: null }), say: () => {},
});

// ---------- render each scenario with React ----------
async function renderAll() {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const url = (f) => 'file:///' + path.join(build, f).replace(/\\/g, '/');
  const page = await import(url('components/accounts/page.js'));
  const card = await import(url('components/accounts/card.js'));
  const mem = await import(url('components/accounts/members.js'));
  const mine = await import(url('components/my-permissions.js'));
  const h = React.createElement;
  const pages = {};
  const render = (name, as, role, evals, el, extra = {}) => {
    globalThis.__PM = { ctx: ctx(as, role, evals), caps: capsOf(evals), cards: { 'khalid@x.sa': khalidCard }, rooms: [{ id: 'r1', name: 'فريق الحملة', type: 'group' }], search: '', ...extra };
    try {
      pages[name] = renderToStaticMarkup(el).replace(/<dialog /g, '<dialog open ');
      check(`${name}: renders`, true);
    } catch (e) {
      check(`${name}: renders`, false, e.stack);
      pages[name] = '';
    }
  };
  render('accounts-members', 'dir@x.sa', 'director', directorCaps, h(page.AccountsPage));
  render('accounts-card', 'dir@x.sa', 'director', directorCaps, h(page.AccountsPage), { search: 'person=khalid%40x.sa' });
  render('accounts-card-above', 'asst@x.sa', 'assistant', assistantCaps, h(page.AccountsPage), { search: 'person=dir%40x.sa' });
  render('accounts-roles', 'dir@x.sa', 'director', directorCaps, h(page.AccountsPage), { search: 'tab=roles' });
  render('accounts-roles-assistant', 'asst@x.sa', 'assistant', assistantCaps, h(page.AccountsPage), { search: 'tab=roles' });
  render('accounts-requests', 'dir@x.sa', 'director', directorCaps, h(page.AccountsPage), { search: 'tab=requests' });
  render('accounts-log', 'dir@x.sa', 'director', directorCaps, h(page.AccountsPage), { search: 'tab=log' });
  render('accounts-writer', 'khalid@x.sa', 'writer', writerCaps, h(page.AccountsPage));
  const wk = (el) => h('div', { className: 'pm' }, el);
  render('dialog-grant', 'dir@x.sa', 'director', directorCaps, wk(h(card.GrantDialog, { emails: ['khalid@x.sa'], initial: 'urgency.2', onClose() {} })));
  render('dialog-grant-pick', 'dir@x.sa', 'director', directorCaps, wk(h(card.GrantDialog, { emails: ['khalid@x.sa', 'sara@x.sa'], onClose() {} })));
  render('dialog-grant-once', 'amir@x.sa', 'admin', directorCaps, wk(h(card.GrantDialog, { emails: ['khalid@x.sa'], initial: 'whatsapp.push', defaults: { mode: 'once', uses: 1, scope: { room: 'r1' } }, onClose() {} })));
  render('dialog-member-add', 'dir@x.sa', 'director', directorCaps, wk(h(mem.MemberDialog, { mode: 'add', onClose() {} })));
  render('dialog-member-add-assistant', 'asst@x.sa', 'assistant', assistantCaps, wk(h(mem.MemberDialog, { mode: 'add', onClose() {} })));
  render('dialog-remove', 'dir@x.sa', 'director', directorCaps, wk(h(mem.RemoveDialog, { emails: ['abd@x.sa'], onClose() {}, onDone() {} })));
  render('dialog-preset', 'dir@x.sa', 'director', directorCaps, wk(h(card.PresetDialog, { onClose() {} })));
  render('my-permissions', 'khalid@x.sa', 'writer', writerCaps, h('section', { className: 'panel' }, h('h2', null, 'صلاحياتي'), h(mine.MyPermissions)));
  return pages;
}

const page = (body, attrs = '') => `<!doctype html><html lang="ar" dir="rtl" ${attrs}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="data:,"><link rel="stylesheet" href="globals.css"><link rel="stylesheet" href="identity.css"><link rel="stylesheet" href="work.css"><link rel="stylesheet" href="chat.css"><link rel="stylesheet" href="permissions.css">
<style>body{font-family:"Segoe UI",Tahoma,sans-serif}main{max-width:1400px}</style></head><body><main id="main">${body}</main></body></html>`;

(async () => {
  const pages = await renderAll();
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
      'accounts-members': ['الحسابات', 'الأعضاء (8)', 'الأدوار', 'الطلبات (1)', 'السجل', 'إضافة عضو', 'حزمة جديدة', 'أمير', 'مؤسس', 'مدير الاتصال المؤسسي', '1 مؤقتة', '1 لمرة واحدة', '1 مسحوبة', 'لم يسجل الدخول بعد', 'البطاقة', 'تغطية النشر لأسبوع'],
      'accounts-card': ['بطاقة', 'منح', 'حزمة جاهزة', 'تطبيق', 'الاسم والصفحات والدور', 'إنهاء كل الإضافات', 'إزالة العضو', 'الصفحات', 'المراسلة والبريد', 'الحسابات والصلاحيات', 'مقفلة بقواعد المركز',
        'من صفحات الحساب', 'إغلاق الصفحة', 'مؤقتة حتى 2026-10-14 12:00', 'تمديد', 'إنهاء الآن', 'مرة واحدة · 1 استخدام باقٍ', 'لمحادثة واحدة', 'مسحوبة', 'إعادة', 'لا يملكها (', 'الاعتماد لمدير الاتصال ومساعده', 'مجلدات المكتبة', 'العقود', 'عرض', 'مستويات المجلدات تُدار من المكتبة'],
      'accounts-card-above': ['في رتبتك أو فوقها، فلا تدير صلاحياته'],
      'accounts-roles': ['ما يملكه كل دور', 'الصلاحية', 'مدير الاتصال المؤسسي', 'مساعد مدير الاتصال المؤسسي', 'كاتب المحتوى', 'مسؤول النشر وإدارة الحسابات', 'رسائل «مهم» (المستوى 2)', 'إرسال رسالة إلى واتساب زميل', 'مقفلة بقواعد المركز', 'يملكها', 'لا يعتمد أحد ما أرسله أو رفعه'],
      'accounts-roles-assistant': ['ما يملكه كل دور'],
      'accounts-requests': ['طلبات الوصول إلى المركز (1)', 'لمى', 'منضمة إلى فريق التصميم', 'قبول', 'رفض'],
      'accounts-log': ['كل الأشخاص', 'كل الصلاحيات', 'كل الأحداث', 'محمد منح خالد «رسائل «مهم» (المستوى 2)» حتى 2026-10-14 12:00.', 'محمد سحب «إنشاء قناة إعلانات في المراسلة» من خالد.',
        'النظام فعّل «فتح صفحة «الحسابات»» لدور «مدير الاتصال المؤسسي» (1 شخص).', 'محمد غيّر دور سارة من «المنتج الإعلامي» إلى «المصمم».', 'استخدم خالد «إرسال رسالة إلى واتساب زميل» مرة، وبقي 0.', 'السجل يُكتب ولا يُعدَّل'],
      'accounts-writer': ['لمن يملك «فتح صفحة الحسابات»', 'صلاحياتك أنت في صفحة «الحساب»'],
      'dialog-grant': ['منح خالد', 'رسائل «مهم» (المستوى 2)', 'دائمة', 'مؤقتة', 'مرة واحدة', 'ساعة', 'يوم', 'أسبوع', 'تاريخ محدد', 'السبب (اختياري)', 'سيملك خالد «رسائل «مهم» (المستوى 2)» حتى', 'ثم تنتهي وحدها'],
      'dialog-grant-pick': ['منح 2 أشخاص', 'الصلاحية', 'لا تملكها أنت', 'مقفل بقواعد المركز', 'اختر صلاحية.'],
      'dialog-grant-once': ['عدد المرات', 'لمحادثة واحدة (اختياري)', 'فريق الحملة', 'بلا نهاية', 'سيستطيع خالد «إرسال رسالة إلى واتساب زميل» في «فريق الحملة» مرة واحدة، ثم تنتهي.'],
      'dialog-member-add': ['إضافة عضو', 'الاسم', 'البريد الإلكتروني', 'الدور', 'الصفحات المفتوحة', 'لا تمنح دوراً في رتبتك أو فوقها'],
      'dialog-member-add-assistant': ['والمساعد يمنح أدوار الفريق فقط'],
      'dialog-remove': ['إزالة عبدالله', 'تبقى كما هي', 'حسابات المؤسسين لا تُزال'],
      'dialog-preset': ['حزمة جديدة', 'بند آخر', 'حفظ الحزمة'],
      'my-permissions': ['صلاحياتي', 'لديك صلاحية مؤقتة أو لمرة واحدة', 'الصفحات', 'من صفحات الحساب', 'مؤقتة حتى 2026-10-14 12:00', 'يمنح الصلاحيات ويسحبها من يدير رتبتك'],
    };
    const absent = {
      'accounts-members': ['undefined', 'urgency.2', 'permissions.grant'],
      'accounts-card': ['undefined', 'whatsapp.push', 'urgency.3'],
      'accounts-card-above': ['إنهاء كل الإضافات', 'إزالة العضو'],
      'accounts-writer': ['إضافة عضو', 'الأعضاء ('],
      'dialog-grant-pick': ['اعتماد جزء من عمل أو رفضه', 'النشر والجدولة'],
      'dialog-member-add': ['>Admin<'],
      'my-permissions': ['urgency.2', 'undefined'],
    };
    // roles the assistant must not be offered when adding a member
    const assistantOptions = (pages['dialog-member-add-assistant'].match(/<option value="([a-z]+)"(?![^>]*disabled)/g) ?? []).map((x) => x.split('"')[1]);
    check('dialog-member-add-assistant: offers rank 1 roles only (D-11)', assistantOptions.length > 0 && !assistantOptions.some((r) => ['director', 'assistant', 'admin'].includes(r)), assistantOptions.join(','));
    const dirOptions = (pages['dialog-member-add'].match(/<option value="([a-z]+)"(?![^>]*disabled)/g) ?? []).map((x) => x.split('"')[1]);
    check('dialog-member-add: a director offers the assistant and rank 1, never director or Admin', dirOptions.includes('assistant') && !dirOptions.includes('director') && !dirOptions.includes('admin'), dirOptions.join(','));
    // switches the assistant may not touch are disabled with a reason
    const asstSwitches = (pages['accounts-roles-assistant'].match(/class="pm-switch[^"]*"[^>]*>/g) ?? []);
    check('accounts-roles-assistant: without «تعديل صلاحيات الأدوار» every switch is disabled with its reason', asstSwitches.length > 0 && asstSwitches.every((x) => /disabled/.test(x) && /title="[^"]+"/.test(x)), `${asstSwitches.length} switches`);
    const dirSwitches = (pages['accounts-roles'].match(/class="pm-switch[^"]*"[^>]*>/g) ?? []);
    check('accounts-roles: the director edits roles below his rank only (Admin, director columns locked)', dirSwitches.some((x) => !/disabled/.test(x)) && dirSwitches.filter((x) => /disabled/.test(x)).length >= 22, `${dirSwitches.filter((x) => /disabled/.test(x)).length} locked of ${dirSwitches.length}`);
    check('accounts-card: the two large effects need a long press', (pages['accounts-card'].match(/data-hold=/g) ?? []).length >= 1);
    check('dialog-remove: removing needs a long press with the plan\'s reason', pages['dialog-remove'].includes('data-hold="إزالة العضو تفصله عن المركز وتبقي أعماله لدى من يُسند إليه."'));
    check('accounts-card: what the person does not hold is folded away, each with its reason or «منح»', /<details class="pm-more">[\s\S]*غير ممنوحة/.test(pages['accounts-card']) && pages['accounts-card'].includes('لا تناسب دور'));
    check('dialog-grant-pick: the capability search box is there', pages['dialog-grant-pick'].includes('placeholder="ابحث في الصلاحيات"'));

    const looks = [['a', ''], ['emerald', 'data-identity="emerald"'], ['evening', 'data-identity="emerald" data-theme="dark"']];
    const wide = ['accounts-members', 'accounts-card', 'accounts-roles', 'dialog-grant', 'my-permissions'];
    for (const name of Object.keys(pages)) {
      for (const [look, attrs] of looks) {
        for (const [vw, vh] of [[1280, 900], [390, 844]]) {
          if (look !== 'a' && !wide.includes(name)) continue;
          const html = page(pages[name], attrs);
          const file = `${name}.${look}.html`;
          fs.writeFileSync(path.join(out, file), html);
          const context = await browser.newContext({ viewport: { width: vw, height: vh } });
          const p = await context.newPage();
          const errs = [];
          p.on('pageerror', (e) => errs.push(e.message));
          p.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && errs.push(m.text()));
          await p.goto(base + file);
          const tag = `${name} · ${look} · ${vw}`;
          check(`${tag}: no page errors`, !errs.length, errs.join(' | '));
          const sw = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          check(`${tag}: no sideways scroll`, sw <= 1, `overflow ${sw}px`);
          if (look === 'a' && vw === 1280) {
            const text = await p.evaluate(() => document.body.innerText);
            for (const t of expect[name] ?? []) check(`${name}: shows «${t}»`, text.includes(t));
            for (const t of absent[name] ?? []) check(`${name}: does not show «${t}»`, !text.includes(t) && !pages[name].includes(t.startsWith('>') ? t : '\u0000'));
            check(`${name}: no emoji`, !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text));
          }
          if (wide.includes(name) || look === 'a') await p.screenshot({ path: path.join(out, `${name}.${look}.${vw}.png`), fullPage: true });
          await context.close();
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
  fs.writeFileSync(path.join(__dirname, 'permissions-pages.json'), JSON.stringify(result, null, 2));
  console.log(`${result.summary.passed} of ${result.summary.total} passed`);
  for (const f of failed) console.log('FAIL', f.name, f.detail.slice(0, 300));
  for (const e of result.errors) console.log('ERROR', e);
  process.exit(failed.length || result.errors.length ? 1 : 0);
})();

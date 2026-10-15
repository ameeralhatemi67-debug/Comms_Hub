// Browser check of the permissions screens (Permissions_Plan.md): «الحسابات» with its four
// tabs, the person's card, the grant dialog, presets, the role matrix and the log (Step P2),
// and «صلاحياتي» on the account page; Step P3 the requests; Step P4 the urgency picker and
// level marks of messaging (src/components/chat/urgency.tsx); later steps add their screens here.
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
  // Step P3
  'components/perm-requests.tsx', 'components/home-perms.tsx', 'lib/kit/need.ts', 'lib/kit/layer.ts',
  // Step P4: the urgency picker and the level marks of messaging
  'components/chat/urgency.tsx', 'lib/chat/rules.ts',
  // Step P5a: WhatsApp (the member's section, the system panel, the push list and delivery line)
  'components/whatsapp/member.tsx', 'components/whatsapp/system-panel.tsx', 'components/chat/whatsapp.tsx', 'lib/whatsapp/rules.ts',
  // Settings Step S1: «عام وصحة النظام» and «السجل»
  'components/settings/general.tsx', 'components/settings/audit.tsx', 'lib/integrations/rules.ts',
  // Settings Step S2: «التخزين» and the storage line of a library file
  'components/settings/storage.tsx', 'components/media/storage-state.tsx',
  // Settings Step S3: a second provider and the move engine
  'components/settings/storage-provider.tsx', 'components/settings/storage-move.tsx',
  // The circled "!" setup guides
  'components/setup-guide.tsx', 'lib/setup-guides.ts',
  // Entry flow: the state of a person's entry, the invitation and the log words
  'lib/entry.ts', 'components/accounts/entry-help.tsx',
  // Settings Step S5: «المنصات»
  'components/settings/platforms.tsx', 'lib/platforms/info.ts', 'lib/platforms/limits.ts', 'lib/platforms/provider.ts',
];
for (const m of sources) {
  const src = fs.readFileSync(path.join(root, 'src', m), 'utf8');
  const depth = m.split('/').length - 1;
  const up = '../'.repeat(depth);
  // Messaging and people data are fixtures here (Step P5a).
  const src2 = src
    .replace(/from '\.\.\/people'/g, `from '${up}mocks/people.js'`)
    .replace(/from '\.\/provider'/g, m === 'components/chat/whatsapp.tsx' ? `from '${up}mocks/chatprov.js'` : `from './provider'`);
  let js = ts.transpileModule(src2, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, verbatimModuleSyntax: false },
  }).outputText;
  js = js
    .replace(/from '@\/lib\/supabase\/client'/g, `from '${up}mocks/supabase.js'`)
    .replace(/from '@\/lib\/store'/g, `from '${up}mocks/store.js'`)
    .replace(/from '@\/lib\/account-context'/g, `from '${up}mocks/account.js'`)
    .replace(/from 'next\/link'/g, `from '${up}mocks/link.js'`)
    .replace(/from 'next\/navigation'/g, `from '${up}mocks/navigation.js'`)
    .replace(/from '\.\/data'/g, `from '${up}mocks/data.js'`)
    .replace(/from '(\.\.\/|\.\/)caps'/g, `from '${up}mocks/caps.js'`)
    .replace(/from '@\/lib\/([^']+)'/g, `from '${up}lib/$1.js'`)
    .replace(/from '(\.[^']+)\.ts'/g, "from '$1.js'")
    .replace(/from '(\.\.?\/[^'.]+)'/g, "from '$1.js'");
  // Home's line reads the requests through its own hook: fixtures here.
  if (m === 'components/home-perms.tsx') js = js.replace(/from '\.\/perm-requests\.js'/, `from '${up}mocks/permreq.js'`);
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
fs.writeFileSync(path.join(build, 'mocks', 'store.js'), `export const useHub = () => ({ state: { role: globalThis.__PM.ctx.me.role, message: '' }, dispatch() {} });`);
fs.writeFileSync(path.join(build, 'mocks', 'account.js'), `export const useAccount = () => globalThis.__PM.ctx.me;`);
fs.writeFileSync(path.join(build, 'mocks', 'people.js'), `const P = () => globalThis.__PM.people;
export const PeopleProvider = ({ children }) => children;
export const usePeople = () => ({ people: P(), me: P().find((p) => p.email === globalThis.__PM.ctx.me.email), personOf: (e) => P().find((p) => p.email === e), nameOf: (e) => P().find((p) => p.email === e)?.display_name ?? e, reload: async () => {}, update: async () => ({ ok: true }) });`);
fs.writeFileSync(path.join(build, 'mocks', 'chatprov.js'), `export const useChat = () => globalThis.__PM.chat;`);
fs.writeFileSync(path.join(build, 'mocks', 'permreq.js'), `export const usePermRequests = () => ({ list: globalThis.__PM.perm ?? [], status: 'ready', reload: async () => {} });`);
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
  entry: { 'khalid@x.sa': 'not_started' },
  nameOf: (e) => members.find((m) => m.email === e)?.display_name ?? (e ? e.split('@')[0] : ''), reload: async () => {}, call: async () => ({ ok: true, data: null }), say: () => {},
});

const PQ = (over) => ({ id: 'q1', requester: 'khalid@x.sa', requester_name: 'خالد', requester_role: 'writer', capability: 'urgency.2', label: 'رسائل «مهم» (المستوى 2)', mode: 'timed', hours: 168, uses: null, scope: null,
  reason: 'تغطية حملة الأسبوع', source: 'chat', source_ref: null, status: 'pending', created_at: '2026-10-13T08:00:00Z', decided_by: null, decided_at: null, decision_note: null, can_decide: true, ...over });
const permList = [PQ({}), PQ({ id: 'q2', requester: 'asst@x.sa', requester_name: 'ريم', requester_role: 'assistant', capability: 'whatsapp.push', label: 'إرسال رسالة إلى واتساب زميل', mode: 'once', hours: null, uses: 1, can_decide: false, source: 'button' })];

// ---------- render each scenario with React ----------
async function renderAll() {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const url = (f) => 'file:///' + path.join(build, f).replace(/\\/g, '/');
  const page = await import(url('components/accounts/page.js'));
  const card = await import(url('components/accounts/card.js'));
  const mem = await import(url('components/accounts/members.js'));
  const mine = await import(url('components/my-permissions.js'));
  const preq = await import(url('components/perm-requests.js'));
  const hperm = await import(url('components/home-perms.js'));
  const urg = await import(url('components/chat/urgency.js'));
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
  // Step P3: asking for a permission, and its decision.
  const cards = (as, list) => h('div', { className: 'pq-list' }, ...list.map((q) => h(preq.PermRequestCard, { key: q.id, q, me: as, onDecide() {} })));
  render('requests-perm-granter', 'dir@x.sa', 'director', directorCaps, cards('dir@x.sa', permList));
  render('requests-perm-requester', 'khalid@x.sa', 'writer', writerCaps, cards('khalid@x.sa', [PQ({ can_decide: false }), PQ({ id: 'q3', status: 'declined', can_decide: false, decided_at: '2026-10-13T09:00:00Z', decision_note: 'ليس هذا الأسبوع' })]));
  render('dialog-decide-approve', 'dir@x.sa', 'director', directorCaps, wk(h(preq.DecideDialog, { q: permList[0], approve: true, onClose() {} })));
  render('dialog-decide-decline', 'dir@x.sa', 'director', directorCaps, wk(h(preq.DecideDialog, { q: permList[0], approve: false, onClose() {} })));
  render('dialog-ask-button', 'khalid@x.sa', 'writer', writerCaps, wk(h(preq.RequestPermissionDialog, { cap: 'room.create', source: 'button', onClose() {} })));
  render('dialog-ask-page', 'khalid@x.sa', 'writer', writerCaps, wk(h(preq.RequestPermissionDialog, { source: 'page', onClose() {} })));
  render('dialog-ask-chat', 'khalid@x.sa', 'writer', writerCaps, wk(h(preq.RequestPermissionDialog, { cap: 'urgency.2', source: 'chat', onClose() {} })));
  render('dialog-ask-fixed', 'khalid@x.sa', 'writer', writerCaps, wk(h(preq.RequestPermissionDialog, { cap: 'urgency.3', source: 'button', onClose() {} })));
  const soon = new Date(Date.now() + 5 * 3600e3).toISOString();
  render('home-perms', 'dir@x.sa', 'director', directorCaps, h('div', { className: 'wk' }, h(hperm.HomePermissions)), {
    perm: permList,
    caps: { ...capsOf(directorCaps), grants: [G({ id: 'h1', email: 'dir@x.sa', until: soon }), G({ id: 'h2', email: 'dir@x.sa', k: 'whatsapp.push', mode: 'once', until: null, uses: 1 })] },
  });
  // Step P4: the four steps for a writer without «مهم», with it given, and for the director.
  const plainCaps = writerCaps.map((c) => (c.k === 'urgency.2' ? capEval(c.k, false, 'none') : c));
  const picker = (v) => h('div', { className: 'ml' }, h('div', { className: 'mx-menu-static cx-menu' }, h(urg.UrgencyOptions, { value: v, onPick() {} })));
  render('urgency-picker-writer', 'khalid@x.sa', 'writer', plainCaps, picker(0));
  render('urgency-picker-granted', 'khalid@x.sa', 'writer', writerCaps, picker(2));
  render('urgency-picker-director', 'dir@x.sa', 'director', directorCaps, picker(3));
  // Step P5a: WhatsApp.
  const wam = await import(url('components/whatsapp/member.js'));
  const was = await import(url('components/whatsapp/system-panel.js'));
  const wac = await import(url('components/chat/whatsapp.js'));
  const peopleList = members.map((m) => ({ email: m.email, display_name: m.display_name, role: m.role, profile: null }));
  const sys = (over) => ({ enabled: true, online: true, heartbeat_at: new Date().toISOString(), name: 'مركز الاتصال المؤسسي', ...over });
  const waMe = (over) => ({ on: true, phone: null, verified_at: null, from_level: 3, pushed: true, pending: null, mutes: [], system: sys(), ...over });
  const pnl = (el) => h('section', { className: 'panel' }, h('h2', null, 'واتساب'), el);
  const wx = { people: peopleList };
  render('wa-member-off', 'khalid@x.sa', 'writer', writerCaps, pnl(h(wam.WhatsAppSettings, { initial: waMe({ on: false }) })), wx);
  render('wa-member-pending', 'khalid@x.sa', 'writer', writerCaps, pnl(h(wam.WhatsAppSettings, { initial: waMe({ pending: { phone: '+99900000001', expires_at: new Date(Date.now() + 6e5).toISOString(), left: 4 } }) })), wx);
  render('wa-member-linked', 'khalid@x.sa', 'writer', writerCaps, pnl(h(wam.WhatsAppSettings, { initial: waMe({ phone: '+99900000001', verified_at: NOW, from_level: 2, mutes: ['dir@x.sa'], system: sys({ online: false, heartbeat_at: new Date(Date.now() - 30 * 60e3).toISOString() }) }) })), wx);
  const adminCaps = KEYS.map((k) => capEval(k, !['whatsapp.push', 'approve.own', 'account.protected'].includes(k), k.startsWith('page.') ? 'page' : 'role'));
  const view = { enabled: true, display_name: 'مركز الاتصال المؤسسي', about: null, daily_cap: 10, max_chars: 1000, heartbeat_at: new Date(Date.now() - 3 * 3600e3).toISOString(), bridge_note: 'جاهز', online: false, linked: 4, queued: 2, sent_day: 17, failed_day: 1,
    failures: [{ kind: 'push', error: 'تغيّر الرقم أو أُلغي الربط.', at: NOW, who: 'سارة' }] };
  render('wa-system', 'amir@x.sa', 'admin', adminCaps, pnl(h(was.WhatsAppSystemPanel, { initial: view })), wx);
  render('wa-system-locked', 'dir@x.sa', 'director', directorCaps, pnl(h(was.WhatsAppSystemPanel, {})), wx);
  const room = { id: 'r1', type: 'group', name: 'فريق الحملة' };
  const msg = { id: 'm1', room_id: 'r1', author: 'dir@x.sa', kind: 'text', body: 'الاجتماع الآن', urgency: 3, created_at: NOW, deleted: false };
  const chat = (me, on = true) => ({
    me, waOn: on, say() {}, reload: async () => {},
    membersOf: () => ['dir@x.sa', 'khalid@x.sa', 'sara@x.sa', 'abd@x.sa', 'noura@x.sa'].map((email) => ({ room_id: 'r1', email })),
    waOf: () => [
      { id: 'o1', kind: 'urgent', message_id: 'm1', recipient: 'khalid@x.sa', state: 'sent', error: null },
      { id: 'o2', kind: 'urgent', message_id: 'm1', recipient: 'sara@x.sa', state: 'queued', error: null },
      { id: 'o3', kind: 'push', message_id: 'm1', recipient: 'noura@x.sa', state: 'failed', error: 'تعذّر الإرسال.' },
    ],
    waPeople: [
      { email: 'khalid@x.sa', linked: true, push: true }, { email: 'sara@x.sa', linked: true, push: false },
      { email: 'abd@x.sa', linked: false, push: false }, { email: 'noura@x.sa', linked: true, push: true },
    ],
  });
  const dlg = (el) => h('div', { className: 'ml cx-d' }, el);
  render('wa-push-granted', 'dir@x.sa', 'director', directorCaps.map((c) => (c.k === 'whatsapp.push' ? capEval(c.k, true, 'added') : c)), dlg(h(wac.WaPushList, { room, msg, onDone() {} })), { ...wx, chat: chat('dir@x.sa') });
  render('wa-push-locked', 'dir@x.sa', 'director', directorCaps, dlg(h(wac.WaPushList, { room, msg, onDone() {} })), { ...wx, chat: chat('dir@x.sa') });
  render('wa-delivery', 'dir@x.sa', 'director', directorCaps, h('div', { className: 'ml' }, h(wac.WaDelivery, { m: msg })), { ...wx, chat: chat('dir@x.sa', false) });
  // Settings Step S1.
  const stg = await import(url('components/settings/general.js'));
  const sta = await import(url('components/settings/audit.js'));
  const drive = (over) => ({ id: 'i1', kind: 'storage', type: 'google_drive', label: 'Google Drive', state: 'connected', config: { account: 'hub@example.com' }, has_secret: true, secret_tail: '••••a1b2', secret_set_at: NOW, pending: false,
    last_check_at: NOW, last_ok_at: NOW, last_error: null, created_at: NOW, disabled_at: null, ...over });
  const present = { NEXT_PUBLIC_SUPABASE_URL: true, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: true, MAIL_SERVER_KEY: true, GOOGLE_CLIENT_ID: true, GOOGLE_CLIENT_SECRET: true, GOOGLE_DRIVE_REFRESH_TOKEN: true, GMAIL_ADDRESS: true, GMAIL_APP_PASSWORD: true, MAIL_SITE_URL: false, WHATSAPP_SERVER_KEY: false, WHATSAPP_LINK_SECRET: false };
  const overview = { library_files: 5, library_bytes: 1610612736, mail_files: 0, mail_bytes: 0, integrations: { connected: 1 }, whatsapp: { enabled: false, heartbeat_at: null }, events_day: 3 };
  const siteSet = { maintenance_on: false, maintenance_text: '', upload_max_mb: 5120 };
  // The fixture's KEYS predate the settings capabilities: add what is missing.
  const capsWith = (base, keys) => [...base.filter((c) => !keys.includes(c.k)), ...keys.map((k) => capEval(k, true, 'role'))];
  const allSettings = ['settings.view', 'settings.manage', 'storage.manage', 'storage.migrate', 'backups.run', 'backups.restore', 'platforms.manage', 'integrations.secrets'];
  const adminSet = capsWith(KEYS.map((k) => capEval(k, false, 'none')), allSettings);
  render('settings-general', 'amir@x.sa', 'admin', adminSet, pnl(h(stg.GeneralTab, { initial: { list: [drive({})], overview, config: { present, vault: true, driveToken: 'vault' }, settings: siteSet } })), wx);
  render('settings-general-env', 'amir@x.sa', 'admin', adminSet, pnl(h(stg.GeneralTab, { initial: { list: [drive({ state: 'needs_reconnect', has_secret: false, secret_tail: null, last_error: 'TOKEN_REFUSED', config: {} })], overview, config: { present, vault: true, driveToken: 'env' }, settings: { ...siteSet, maintenance_on: true, maintenance_text: 'صيانة الليلة', upload_max_mb: 100 } } })), wx);
  render('settings-general-viewer', 'dir@x.sa', 'director', capsWith(directorCaps, ['settings.view']), pnl(h(stg.GeneralTab, { initial: { list: [drive({})], overview, config: { present, vault: true, driveToken: 'env' }, settings: siteSet } })), wx);
  render('settings-general-locked', 'khalid@x.sa', 'writer', writerCaps, pnl(h(stg.GeneralTab, {})), wx);
  const ievents = [
    { id: 3, at: NOW, kind: 'secret_committed', actor: 'amir@x.sa', actor_name: 'أمير', integration: 'Google Drive', data: { replaced: false } },
    { id: 2, at: NOW, kind: 'secret_used', actor: null, actor_name: null, integration: 'Google Drive', data: { purpose: 'drive access', pending: false } },
    { id: 1, at: NOW, kind: 'settings', actor: 'amir@x.sa', actor_name: 'أمير', integration: null, data: { maintenance_on: true, upload_max_mb: 100 } },
  ];
  render('settings-audit', 'amir@x.sa', 'admin', adminSet, pnl(h(sta.AuditTab, { initial: ievents })), wx);
  render('settings-audit-locked', 'khalid@x.sa', 'writer', writerCaps, pnl(h(sta.AuditTab, {})), wx);
  // Settings Step S2.
  const sts = await import(url('components/settings/storage.js'));
  const sst = await import(url('components/media/storage-state.js'));
  const prov = (over) => ({ id: 'i1', type: 'google_drive', label: 'Google Drive', state: 'connected', last_check_at: NOW, last_ok_at: NOW, last_error: null, account: 'hub@example.com',
    files: 5, bytes: 1610612736, library_files: 5, mail_files: 0, ok: 4, pending: 0, failed: 0, missing: 0, unverified: 1, last_verified_at: NOW, ...over });
  const roles4 = [{ role: 'library', integration_id: 'i1', label: 'Google Drive' }, { role: 'mail', integration_id: 'i1', label: 'Google Drive' }, { role: 'chat', integration_id: 'i1', label: 'Google Drive' }, { role: 'backup', integration_id: null, label: null }];
  render('settings-storage', 'amir@x.sa', 'admin', adminSet, pnl(h(sts.StorageTab, { initial: { providers: [prov({})], roles: roles4, unrecorded: 0, can_manage: true } })), wx);
  render('settings-storage-bad', 'amir@x.sa', 'admin', adminSet, pnl(h(sts.StorageTab, { initial: { providers: [prov({ missing: 1, failed: 2, ok: 2, last_verified_at: null })], roles: roles4, unrecorded: 3, can_manage: true } })), wx);
  render('settings-storage-viewer', 'dir@x.sa', 'director', capsWith(directorCaps, ['settings.view']), pnl(h(sts.StorageTab, { initial: { providers: [prov({})], roles: roles4, unrecorded: 0, can_manage: false } })), wx);
  render('settings-storage-locked', 'khalid@x.sa', 'writer', writerCaps, pnl(h(sts.StorageTab, {})), wx);
  const copies = [
    { version: 2, provider: 'Google Drive', type: 'google_drive', role: 'primary', state: 'ok', size_bytes: 1500, verified_at: NOW },
    { version: 1, provider: 'Google Drive', type: 'google_drive', role: 'primary', state: 'missing', size_bytes: 1000, verified_at: null },
  ];
  render('library-storage-state', 'dir@x.sa', 'director', directorCaps, h('dl', { className: 'mx-kv' }, h('dt', null, 'التخزين'), h('dd', { className: 'mx-storage-line' }, h(sst.StorageState, { assetId: 'a1', initial: copies }))), wx);
  render('library-storage-empty', 'dir@x.sa', 'director', directorCaps, h('dl', { className: 'mx-kv' }, h('dt', null, 'التخزين'), h('dd', { className: 'mx-storage-line' }, h(sst.StorageState, { assetId: 'a1', initial: [] }))), wx);
  // Settings Step S3: the second provider and the move engine, in the states a person meets.
  const s3 = prov({ id: 'i2', type: 's3_compatible', label: 'تخزين Supabase', account: 'hub-files@s3.example.org', files: 2, bytes: 3000, library_files: 2, ok: 2, unverified: 0, replicas: 0,
    config: { endpoint: 'https://abc.storage.supabase.co/storage/v1/s3', bucket: 'hub-files', region: 'eu-central-1', prefix: 'hub', path_style: true, flavor: 'supabase' }, has_secret: true, secret_tail: '••••3456' });
  const s3held = prov({ replicas: 3 });
  const two = { providers: [s3held, s3], roles: roles4, unrecorded: 0, can_manage: true, can_migrate: true, can_secrets: true };
  const folders = [{ id: 'fo1', name: 'الحملات', parent_id: null }, { id: 'fo2', name: 'رمضان', parent_id: 'fo1' }];
  const GB = 1073741824;
  const mrep = (move, extra = {}) => ({
    move: { id: 'm1', label: 'أرشيف الحملات', mode: 'move', scope: { kind: 'library', folder_id: 'fo1' }, state: 'planned', hold_days: 14, hold_until: null, files: 12, bytes: 3 * GB,
      dest_free: 100 * GB, dest_account: 'hub-files@s3.example.org', dest_checked_at: NOW, created_by: 'amir@x.sa', created_by_name: 'أمير', created_at: NOW, started_at: null, finished_at: null,
      source: { id: 'i1', label: 'Google Drive', type: 'google_drive' }, dest: { id: 'i2', label: 'تخزين Supabase', type: 's3_compatible' }, ...move },
    counts: { pending: 12 }, bytes: { planned: 3 * GB, done: 0, partial: 0 }, skipped: { source_unhealthy: 1 }, failed: {}, already_there: 2, approved: 3, verify: {},
    retirable: 0, retired: 0, hold_over: false, can_migrate: true, ...extra });
  const mrow = (over) => ({ id: 'm1', label: 'أرشيف الحملات', mode: 'move', state: 'planned', scope: { kind: 'library', folder_id: 'fo1' }, files: 12, bytes: 3 * GB, hold_until: null, created_at: NOW, finished_at: null,
    source: 'Google Drive', dest: 'تخزين Supabase', switched: 0, copied: 0, failed: 0, skipped: 1, open: 12, retirable: 0, ...over });
  const storageWith = ({ name, p, role = 'admin', caps = adminSet, email = 'amir@x.sa' }) => render(name, email, role, caps, pnl(h(sts.StorageTab, p)), wx);
  storageWith({ name: 'settings-storage-move-plan', p: { initial: two, initialMoves: [mrow({})], initialReport: mrep({}), initialFolders: folders } });
  storageWith({ name: 'settings-storage-move-run', p: { initial: two, initialMoves: [mrow({ state: 'running', switched: 5, open: 7 })], initialFolders: folders,
    initialReport: mrep({ state: 'running', started_at: NOW }, { counts: { switched: 5, copying: 1, pending: 6 }, bytes: { planned: 3 * GB, done: GB, partial: GB / 2 }, verify: { checksum: 5 } }) } });
  storageWith({ name: 'settings-storage-move-done', p: { initial: two, initialMoves: [mrow({ state: 'completed', switched: 11, failed: 1, open: 0, retirable: 11, hold_until: '2026-10-29T09:00:00Z', finished_at: NOW })], initialFolders: folders,
    initialReport: mrep({ state: 'completed', hold_until: '2026-10-29T09:00:00Z', finished_at: NOW }, { counts: { switched: 11, failed: 1, skipped: 1 }, bytes: { planned: 3 * GB, done: 3 * GB, partial: 0 },
      failed: { SOURCE_CHANGED: 1 }, retirable: 11, hold_over: false, verify: { checksum: 11 } }) } });
  storageWith({ name: 'settings-storage-move-over', p: { initial: two, initialMoves: [mrow({ state: 'completed', switched: 12, open: 0, retirable: 12, hold_until: '2026-10-20T09:00:00Z' })], initialFolders: folders,
    initialReport: mrep({ state: 'completed', hold_until: '2026-10-20T09:00:00Z' }, { counts: { switched: 12 }, bytes: { planned: 3 * GB, done: 3 * GB, partial: 0 }, skipped: {}, retirable: 12, hold_over: true, verify: { checksum: 12 } }) } });
  storageWith({ name: 'settings-storage-move-viewer', role: 'director', email: 'dir@x.sa', caps: capsWith(directorCaps, ['settings.view']),
    p: { initial: { ...two, can_manage: false, can_migrate: false, can_secrets: false }, initialMoves: [mrow({})], initialFolders: folders, initialReport: mrep({}, { can_migrate: false }) } });
  storageWith({ name: 'settings-storage-one', p: { initial: { providers: [prov({})], roles: roles4, unrecorded: 0, can_manage: true, can_migrate: true, can_secrets: true }, initialMoves: [], initialFolders: [] } });
  // The circled "!" guides, open: the steps as a person reads them.
  const sg = await import(url('components/setup-guide.js'));
  const guide = (name, props) => render(name, 'amir@x.sa', 'admin', adminSet, h('div', { className: 'ml' }, h(sg.SetupGuide, { ...props, initialOpen: true })), wx);
  guide('guide-meta', { guide: 'meta', provider: 'meta' });
  guide('guide-tiktok', { guide: 'tiktok', provider: 'tiktok' });
  guide('guide-connect-meta', { guide: 'connect_meta' });
  guide('guide-manual', { guide: 'manual' });
  guide('guide-storage-supabase', { guide: 'storage_supabase' });
  guide('guide-move', { guide: 'move' });
  // Settings Step S5.
  const stp = await import(url('components/settings/platforms.js'));
  const pinfo = (key, label_ar, kind, sort, over = {}) => ({ key, label_ar, kind, sort, accepts: { video_only: key === 'youtube' }, publish_mode: 'auto', scheduling: true, requires_review: key !== 'x' && kind === 'social',
    token_life_days: 60, enabled: true, builtin: true, docs_url: null, readiness: 'not_started', readiness_note: null, readiness_at: null, readiness_by: null, ...over });
  const plist = [pinfo('instagram', 'إنستغرام', 'social', 1), pinfo('x', 'X', 'social', 2), pinfo('linkedin', 'لينكدإن', 'social', 3),
    pinfo('youtube', 'يوتيوب', 'social', 4, { readiness: 'preparing', readiness_note: 'قناة القسم جاهزة، وشاشة الموافقة قيد الإعداد', readiness_at: NOW, readiness_by: 'amir@x.sa' }),
    pinfo('facebook', 'فيسبوك', 'social', 5, { enabled: false, builtin: false, publish_mode: 'assisted', readiness: 'submitted', readiness_note: 'قُدّم التطبيق للمراجعة', readiness_at: NOW, docs_url: 'https://developers.facebook.com/docs/pages-api/' }),
    pinfo('tiktok', 'تيك توك', 'social', 6, { builtin: false, publish_mode: 'assisted', accepts: { video_only: true } }),
    pinfo('mail', 'البريد', 'mail', 0, { readiness: 'live', token_life_days: null })];
  const pimpact = { instagram: { accounts: 2, active_accounts: 2, open_works: 3, copies: 4 }, x: { accounts: 1, active_accounts: 0, open_works: 0, copies: 1 }, linkedin: { accounts: 0, active_accounts: 0, open_works: 0, copies: 0 },
    youtube: { accounts: 1, active_accounts: 1, open_works: 1, copies: 1 }, facebook: { accounts: 0, active_accounts: 0, open_works: 0, copies: 0 }, tiktok: { accounts: 1, active_accounts: 0, open_works: 0, copies: 2 }, mail: { accounts: 1, active_accounts: 1, open_works: 0, copies: 0 } };
  render('settings-platforms', 'amir@x.sa', 'admin', adminSet, pnl(h(stp.PlatformsTab, { initial: { list: plist, impact: pimpact } })), wx);
  render('settings-platforms-viewer', 'dir@x.sa', 'director', capsWith(directorCaps, ['settings.view']), pnl(h(stp.PlatformsTab, { initial: { list: plist, impact: pimpact } })), wx);
  render('urgency-badges', 'khalid@x.sa', 'writer', writerCaps, h('div', { className: 'ml' }, ...[0, 1, 2, 3].map((l) => h('div', { key: l, className: 'cx-badge-row' }, `الدرجة ${l}: `, h(urg.UrgencyBadge, { level: l })))));
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
      'accounts-members': ['الحسابات', 'الأعضاء (8)', 'الأدوار', 'الطلبات (1)', 'السجل', 'إضافة عضو', 'حزمة جديدة', 'أمير', 'مؤسس', 'مدير الاتصال المؤسسي', '1 مؤقتة', '1 لمرة واحدة', '1 مسحوبة', 'لم يسجل الدخول بعد', 'البطاقة', 'تغطية النشر لأسبوع', 'لم يعيّن كلمة مرور بعد'],
      'accounts-card': ['بطاقة', 'لم يعيّن كلمة مرور بعد', 'إرسال دعوة', 'يفتح الموقع ويختار «أول دخول»', 'منح', 'حزمة جاهزة', 'تطبيق', 'الاسم والصفحات والدور', 'إنهاء كل الإضافات', 'إزالة العضو', 'الصفحات', 'المراسلة والبريد', 'الحسابات والصلاحيات', 'مقفلة بقواعد المركز',
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
      'requests-perm-granter': ['طلب خالد «رسائل «مهم» (المستوى 2)» لمدة 1 أسبوع', '«تغطية حملة الأسبوع»', 'كاتب المحتوى', 'من المراسلة', 'بانتظار القرار', 'موافقة', 'رفض',
        'طلب ريم «إرسال رسالة إلى واتساب زميل» لمرة واحدة', 'من زر مقفل', 'يقرر فيه من يملك'],
      'requests-perm-requester': ['طلبتَ «رسائل «مهم» (المستوى 2)» لمدة 1 أسبوع', 'سحب الطلب', 'لم تُمنح', '«ليس هذا الأسبوع»'],
      'dialog-decide-approve': ['موافقة على طلب خالد', 'دائمة', 'مؤقتة', 'مرة واحدة', 'ساعة', 'يوم', 'أسبوع', 'شهر', 'سيملك خالد', 'ملاحظة (اختياري)', 'موافقة ومنح'],
      'dialog-decide-decline': ['رفض طلب خالد', 'سبب الرفض', 'رفض الطلب'],
      'dialog-ask-button': ['طلب صلاحية', 'إنشاء قناة إعلانات في المراسلة', 'لماذا تحتاجها', 'إرسال الطلب', 'القرار لمن يدير رتبتك'],
      'dialog-ask-page': ['اختر ما تحتاجه', 'رسائل «مهم» (المستوى 2)'],
      'dialog-ask-chat': ['إلى', 'إرسال البطاقة'],
      'dialog-ask-fixed': ['مقفلة بقواعد المركز ولا تُطلب', 'حتى يبقى العاجل نادراً'],
      'home-perms': ['طلب صلاحية من خالد ينتظر قرارك', '«رسائل «مهم» (المستوى 2)»', 'تنتهي صلاحيتك «رسائل «مهم» (المستوى 2)» في', 'لديك «إرسال رسالة إلى واتساب زميل» لمرة واحدة لم تُستخدم بعد'],
      'urgency-picker-writer': ['بلا درجة', 'رسالة عادية بلا تنبيه.', 'للانتباه', 'ينبّه أعضاء المحادثة في «انتباه»، إلا من كتمها.', 'مهم', 'رسائل «مهم» لمن يملك صلاحيتها', 'عاجل', 'حتى يبقى العاجل نادراً'],
      'urgency-picker-granted': ['ينبّه أعضاء المحادثة بعلامة «مهم»، إلا من كتمها.', 'حتى يبقى العاجل نادراً'],
      'urgency-picker-director': ['يصل الجميع ولو كتموا المحادثة، ويطلب من كل عضو الإقرار بالاستلام.'],
      'wa-member-off': ['واتساب النظام', 'متصل', 'استلام رسائل واتساب', 'في حالتين فقط', 'لا يقرأ المركز الردود', 'إيقاف هذا الخيار يحذف رقمك'],
      'wa-member-pending': ['رقم واتساب بالصيغة الدولية', 'يرى رقمك أنت ومسؤول النظام فقط', 'إرسال الرمز', 'الرمز المرسل إلى', 'بقي 4 من المحاولات', 'تحقق', 'أرسل لي من درجة', '«عاجل» فقط', 'الرسائل التي يدفعها إليّ زميل'],
      'wa-member-linked': ['رقمك المتحقق منه', '+99900000001', 'تغيير الرقم', 'غير متصل منذ 30 دقيقة', 'ينتظر ولا يضيع', 'محمد', 'إلغاء الكتم', 'كتم'],
      'wa-system': ['تشغيل واتساب النظام', 'آخر ما قاله الجسر: جاهز', 'غير متصل منذ 3 ساعة', 'مسح رمز QR', 'الاسم الذي تُوقَّع به الرسائل', 'حد الرسائل المدفوعة لكل مرسل في اليوم', 'أقصى طول للرسالة بالأحرف', 'رسالة تجربة إلى رقمي',
        'أعضاء ربطوا أرقامهم', '17', 'آخر ما تعذّر', 'مدفوعة منك إلى سارة', 'لا تظهر هنا نصوص الرسائل ولا الأرقام'],
      'wa-system-locked': ['إدارة رقم واتساب النظام لمن يملك', 'اطلب هذه الصلاحية'],
      'wa-push-granted': ['تصل الرسالة كاملة', 'لا يظهر رقم أحد هنا', 'خالد', 'واتساب مرتبط', 'إرسال', 'سارة', 'لا يستقبل هذا الزميل رسائل واتساب منك الآن.', 'عبدالله', 'واتساب غير مرتبط', 'تعذّرت من قبل.'],
      'wa-push-locked': ['مقفلة حتى تُمنح', 'اطلب هذه الصلاحية'],
      'wa-delivery': ['واتساب: أُرسلت إلى 1 · لم تُسلَّم بعد 1 · تعذّرت 1', 'واتساب النظام متوقف، وتصل حين يعود', 'إعادة المحاولة'],
      'settings-general': ['ما يتصل به المركز', 'Google Drive', 'تخزين', 'متصل', 'hub@example.com', 'الرمز الدائم: في خزنة الأسرار', '••••a1b2', 'فحص الآن', 'ربط حساب آخر', 'إيقاف',
        'إعدادات الخادم', 'موجودة أو غير موجودة فقط', 'مفتاح الخادم (يفتح خزنة الأسرار والبريد)', 'موجود', 'غير موجود', 'خزنة الأسرار', 'يصل إليها الخادم',
        'إصدارات ملفات المكتبة', '5 · 1.50 غيغابايت', 'آخر نسخة احتياطية', 'لا توجد نسخة بعد', 'شريط صيانة أعلى كل الصفحات', 'أقصى حجم لملف في المكتبة بالميغابايت', 'حفظ', 'واتساب النظام', 'لم يتصل الجسر بعد'],
      'settings-general-env': ['يحتاج ربطاً من جديد', 'في متغيرات الخادم فقط (احتياطي)', 'رفضت Google الرمز. اربط الحساب من جديد.', 'نقل الرمز إلى خزنة الأسرار', 'ربط Google Drive'],
      'settings-general-viewer': ['للقراءة: تعديلها لمن يملك «تعديل الإعدادات العامة للنظام».', 'نقل الرمز إلى خزنة الأسرار'],
      'settings-general-locked': ['صحة النظام وإعداداته العامة لمن يملك', 'اطلب هذه الصلاحية'],
      'settings-audit': ['كل الأحداث', 'اعتُمد السر الجديد بعد فحصه · Google Drive', 'استعمل الخادم السر · Google Drive لـ «drive access»', 'تغيّرت الإعدادات العامة: شُغّل شريط الصيانة، حد الرفع 100 ميغابايت', 'أمير', 'الخادم', 'ولا يحمل قيمة سرّ أبداً'],
      'settings-audit-locked': ['السجل لمن يملك', 'اطلب هذه الصلاحية'],
      'settings-platforms': ['النشر على كل المنصات محاكاة', 'إضافة منصة', 'إنستغرام', 'يوتيوب', 'فيسبوك', 'البريد', 'منصة اجتماعية', 'قناة بريد', 'النشر الآن', 'محاكاة', 'المسار المخطط', 'نشر تلقائي', 'نشر مساعد',
        'الفيديو فقط', 'نصاً وصورة وفيديو', 'التجهيز', 'لم يبدأ', 'قيد التجهيز', 'قُدّم للمراجعة', 'يعمل', 'حفظ التجهيز', 'قناة القسم جاهزة، وشاشة الموافقة قيد الإعداد', 'ما تقدمه وما تطلبه',
        'تيك توك', 'مفعّلة', 'موقوفة', 'قائمة', 'سجل المنصة', 'لا تُوقف منصة عليها حسابات فعّالة', 'لا تُحذف منصة عليها حسابات أو نسخ نصوص'],
      'settings-platforms-viewer': ['إنستغرام', 'فيسبوك', 'حفظ التجهيز'],
      'settings-storage': ['مزودو التخزين', 'Google Drive', 'متصل', 'hub@example.com', 'نسخ محفوظة هنا', '5 · 1.50 غيغابايت', 'منها إصدارات مكتبة الوسائط', 'آخر تحقق', 'لم تُفحص بعد', 'تحقق من عينة',
        'ما يخدمه كل مزود', 'مكتبة الوسائط', 'مرفقات البريد', 'ملفات المراسلة', 'النسخ الاحتياطي', 'لا مزود بعد', 'غير متاح بعد', 'OneDrive', 'جهاز تخزين شبكي', 'الوكيل', 'لم يُبنَ بعد', 'إضافة مزود تخزين', 'النقل يحتاج مزودين متصلين'],
      'settings-storage-bad': ['مفقودة أو تحتاج انتباهاً', '3 ملفات بلا موضع مسجّل', 'لم يُتحقق من شيء بعد'],
      'settings-storage-viewer': ['مزودو التخزين', 'تحقق من عينة'],
      'settings-storage-locked': ['أين تُحفظ الملفات لمن يملك', 'اطلب هذه الصلاحية'],
      'library-storage-state': ['الإصدار 2', 'Google Drive', 'سليم', 'تُحقق منه', 'الإصدار 1', 'مفقود', 'لم يُتحقق منه بعد'],
      'library-storage-empty': ['لا موضع مسجّل'],
      'settings-storage-move-plan': ['مزودو التخزين', 'تخزين Supabase', 'تخزين متوافق مع S3', 'hub-files', 'hub-files@s3.example.org', 'مفتاح الوصول', '••••3456', 'منها نسخ محفوظة بعد نقل', 'فحص الاتصال', 'تعديل', 'إيقاف', 'إضافة مزود تخزين',
        'نقل الملفات بين المزودين', 'ما يُنقل', 'مكتبة الوسائط', 'الاحتفاظ بالمصدر (أيام)', 'احسب الخطة (تجربة بلا نسخ)', 'خطة بانتظار البدء', 'أرشيف الحملات', 'مجلد «الحملات» وما تحته من المكتبة',
        'ملفات جاهزة للنسخ', '12 · 3.00 غيغابايت', 'الوقت المقدّر (تقريبي)', 'المساحة الحرة عند الهدف', '100.00 غيغابايت', 'لها نسخة جاهزة عند الهدف', 'إصدارات معتمدة', 'لا يمكن نقلها', 'نسخته الحالية مفقودة',
        'ابدأ النقل', 'إلغاء الخطة', 'آخر عمليات النقل', 'عرض التقرير', 'لا شيء يُحذف'],
      'settings-storage-move-run': ['يعمل', 'التقدم', '50% · 1.50 غيغابايت من 3.00 غيغابايت', 'نُقل', 'يُنسخ', 'ينتظر', 'تحقق ببصمة المحتوى', 'تابع التنفيذ من هذه الصفحة', 'لا عامل في الخلفية', 'إلغاء النقل'],
      'settings-storage-move-done': ['اكتمل', 'تعذّر نقلها', 'تغيّر محتوى الملف عند المصدر أثناء النسخ فلم يُعتمد', 'أعد محاولة ما تعذّر', 'نسخ المصدر المحفوظة', '11 نسخة بقيت عند Google Drive نسخةً احتياطية', 'أحل نسخ المصدر إلى التقاعد', 'يُفتح هذا الإجراء بعد', 'التقرير: 11 ملفات نُقلت'],
      'settings-storage-move-over': ['اكتمل', 'نسخ المصدر المحفوظة', 'أحل نسخ المصدر إلى التقاعد', 'التقرير: 12 ملفات نُقلت'],
      'settings-storage-move-viewer': ['نقل الملفات بين المزودين', 'احسب الخطة (تجربة بلا نسخ)', 'ابدأ النقل'],
      'settings-storage-one': ['النقل يحتاج مزودين متصلين', 'إضافة مزود تخزين', 'لا شيء يُحذف'],
      'guide-meta': ['تجهيز تطبيق Meta', 'أنشئ التطبيق', 'Facebook Login', 'Valid OAuth Redirect URIs', '/api/platforms/callback/meta', 'App ID و App Secret', 'ولا ترسلهما إلى أحد', 'النشر نفسه ما زال محاكاة', 'فهمت'],
      'guide-tiktok': ['تجهيز تطبيق TikTok', 'Login Kit', '/api/platforms/callback/tiktok', 'user.info.basic', 'التدقيق'],
      'guide-connect-meta': ['ربط حسابك عبر Meta', 'اضغط «ربط عبر Meta»', 'لا يطلب الموقع كلمة مرورك أبداً', 'تطبيق المطوّر غير مضبوط'],
      'guide-manual': ['النشر اليدوي على هذه المنصة', 'حزمة النشر', 'أكّد النشر'],
      'guide-storage-supabase': ['إضافة تخزين Supabase', 'S3 connection', 'New access key', 'حفظ وفحص الاتصال'],
      'guide-move': ['نقل الملفات بين مزودي التخزين', 'احسب الخطة', 'أبقِ الصفحة مفتوحة', 'أحل المصدر للتقاعد'],
      // The mark and the word are flex items, so the page's text puts a line between them.
      'urgency-badges': ['!\nللانتباه', '!!\nمهم', '!!!\nعاجل'],
      'my-permissions': ['اطلب صلاحية', 'صلاحياتي', 'لديك صلاحية مؤقتة أو لمرة واحدة', 'الصفحات', 'من صفحات الحساب', 'مؤقتة حتى 2026-10-14 12:00', 'يمنح الصلاحيات ويسحبها من يدير رتبتك'],
    };
    const absent = {
      'accounts-members': ['undefined', 'urgency.2', 'permissions.grant'],
      'accounts-card': ['undefined', 'whatsapp.push', 'urgency.3', 'إرسال رابط كلمة مرور جديدة', 'إعادة إرسال رابط التأكيد'],
      'accounts-card-above': ['إنهاء كل الإضافات', 'إزالة العضو', 'إرسال دعوة'],
      'accounts-writer': ['إضافة عضو', 'الأعضاء ('],
      'dialog-grant-pick': ['اعتماد جزء من عمل أو رفضه', 'النشر والجدولة'],
      'dialog-member-add': ['>Admin<'],
      'my-permissions': ['urgency.2', 'undefined'],
      'requests-perm-requester': ['موافقة'],
      'dialog-ask-page': ['منح الصلاحيات وسحبها', 'اعتماد جزء من عمل أو رفضه', 'رسائل «عاجل»'],
      'dialog-ask-fixed': ['إرسال الطلب'],
      'urgency-picker-writer': ['urgency.', 'undefined'],
      'wa-member-off': ['رقمك المتحقق منه', 'الرمز المرسل إلى', 'undefined'],
      'wa-member-pending': ['+99900000001', 'undefined'],
      'wa-push-granted': ['+999', 'undefined', 'whatsapp.push'],
      'wa-system-locked': ['تشغيل واتساب النظام', 'undefined'],
      'wa-system': ['undefined', 'WHATSAPP'],
      'settings-general': ['undefined', 'GOOGLE_', 'MAIL_SERVER_KEY', 'secret_id', 'نقل الرمز إلى خزنة الأسرار'],
      'settings-general-locked': ['ما يتصل به المركز'],
      'settings-audit': ['undefined', 'replaced'],
      'settings-platforms': ['undefined', 'NaN', 'null'],
      'settings-storage': ['undefined', 'مفقودة أو تحتاج انتباهاً', 'بلا موضع مسجّل', 'ربط OneDrive', 'drv-', 'ref'],
      'settings-storage-locked': ['مزودو التخزين', 'Google Drive'],
      'library-storage-state': ['drv-', 'undefined'],
      'settings-storage-move-plan': ['undefined', 'NaN', 'null', 'secret', 'AKIA', 'mv-', 'hub/library', 'ref'],
      'settings-storage-move-run': ['undefined', 'NaN', 'null', 'secret', 'AKIA'],
      'settings-storage-move-done': ['undefined', 'NaN', 'null', 'secret', 'AKIA', 'SOURCE_CHANGED'],
      'settings-storage-move-over': ['undefined', 'NaN', 'null', 'secret', 'تعذّر نقلها', 'أعد محاولة ما تعذّر'],
      'settings-storage-one': ['undefined', 'NaN', 'احسب الخطة'],
      'guide-meta': ['undefined', 'NaN', '{redirect}', '{origin}', 'AKIA'],
      'guide-tiktok': ['undefined', '{redirect}'],
      'guide-storage-supabase': ['undefined', 'AKIA'],
      'urgency-picker-granted': ['رسائل «مهم» لمن يملك صلاحيتها'],
      'urgency-picker-director': ['رسائل «مهم» لمن يملك صلاحيتها', 'حتى يبقى العاجل نادراً'],
      'urgency-badges': ['بلا درجة'],
    };
    // Settings Step S1: who may do what on «عام».
    check('settings-general-viewer: a viewer cannot save or move the token (locked control for «integrations.secrets»)', !/>حفظ</.test(pages['settings-general-viewer']) && /data-need="integrations.secrets"/.test(pages['settings-general-viewer']));
    check('settings-general: disabling a provider is a long press', /data-hold="إيقاف المزوّد يوقف الرفع إليه والقراءة منه حتى يُشغّل من جديد."/.test(pages['settings-general']));
    check('settings-general-viewer: the settings inputs are read only', (pages['settings-general-viewer'].match(/id="st-(maint-text|upload)"[^>]*disabled/g) ?? []).length === 2);
    check('settings-general-locked: the request is for «settings.view»', /data-need="settings.view"/.test(pages['settings-general-locked']));
    // Settings Step S2: checking is a right; reading is not.
    check('settings-storage: the check is a button for a manager', /class="primary st-verify"/.test(pages['settings-storage']) && !/data-need="storage.manage"/.test(pages['settings-storage']));
    check('settings-storage-viewer: a viewer sees a locked control for «storage.manage», not a working button', /data-need="storage.manage"/.test(pages['settings-storage-viewer']));
    check('settings-storage-locked: the request is for «storage.manage»', /data-need="storage.manage"/.test(pages['settings-storage-locked']));
    check('settings-storage: nothing in «غير متاح بعد» is a button', !/<button[^>]*>[^<]*(OneDrive|NAS|S3)/.test(pages['settings-storage']));
    check('settings-storage-bad: the missing copies are flagged and counted', />1 · 2</.test(pages['settings-storage-bad'].replace(/<!-- -->/g, '')) || /1 · 2/.test(pages['settings-storage-bad'].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')));
    check('library-storage-state: a missing copy is marked for the colour rule', /data-state="missing"/.test(pages['library-storage-state']));
    // Settings Step S3: the second provider and the move engine.
    const nospace = (h) => h.replace(/<!-- -->/g, '');
    check('settings-storage-move-plan: the plan is a dry run: «ابدأ النقل» is a working button, cancelling the plan is a long press', /class="primary st-move-start"/.test(pages['settings-storage-move-plan']) && /class="secondary danger st-move-cancel"[^>]*data-hold="الإلغاء يوقف النقل/.test(pages['settings-storage-move-plan']));
    check('settings-storage-move-plan: the second provider has check, edit, a long-press switch-off, and no delete while it holds files', /st-provider-check/.test(pages['settings-storage-move-plan']) && /st-provider-edit/.test(pages['settings-storage-move-plan']) && /st-disable/.test(pages['settings-storage-move-plan']) && !/st-provider-remove/.test(pages['settings-storage-move-plan']));
    check('settings-storage-move-plan: the key pair is never drawn, only its tail', !/AKIA|secretAccessKey|type="password"/.test(pages['settings-storage-move-plan']));
    check('settings-storage-move-plan: Drive says how many held copies it keeps', /3<\/b>/.test(nospace(pages['settings-storage-move-plan'])));
    check('settings-storage-move-run: the progress bar carries its value', /role="progressbar"[^>]*aria-valuenow="50"/.test(pages['settings-storage-move-run']));
    check('settings-storage-move-run: the page says plainly that nothing runs in the background', /لا عامل في الخلفية/.test(pages['settings-storage-move-run']));
    check('settings-storage-move-run: cancelling is a long press', /st-move-cancel"[^>]*data-hold=/.test(pages['settings-storage-move-run']));
    check('settings-storage-move-done: retiring the sources is disabled until the hold is over, and is a long press', /st-move-retire"[^>]*disabled=""[^>]*data-hold="تنتقل نسخ المصدر|st-move-retire"[^>]*data-hold="تنتقل نسخ المصدر[^>]*disabled=""/.test(pages['settings-storage-move-done']) || /disabled=""[^>]*st-move-retire|st-move-retire[^>]*disabled/.test(pages['settings-storage-move-done']));
    check('settings-storage-move-over: after the hold the retire button is enabled and a long press', /class="secondary danger st-move-retire"(?![^>]*disabled)[^>]*data-hold="تنتقل نسخ المصدر/.test(pages['settings-storage-move-over']));
    check('settings-storage-move-viewer: starting, planning and adding are locked controls for «storage.migrate» and «storage.manage»', /data-need="storage.migrate"/.test(pages['settings-storage-move-viewer']) && /data-need="storage.manage"/.test(pages['settings-storage-move-viewer']));
    // The circled "!" guides.
    check('guide-meta: the return address is on its own line to copy, with the platform in its path', /class="su-copy"[^>]*>https:\/\/[^<]*\/api\/platforms\/callback\/meta</.test(pages['guide-meta']));
    check('guide-meta: the steps are numbered in a list', (pages['guide-meta'].match(/<li>/g) ?? []).length >= 7 && /<ol class="su-steps">/.test(pages['guide-meta']));
    check('guide-meta: the button is the icon set\'s circle with an exclamation mark, labelled', /class="su-hint"[^>]*aria-label="[^"]+"/.test(pages['guide-meta']) && /lucide-circle-alert|circle-alert/.test(pages['guide-meta']));
    check('settings-platforms: every platform app block and manual platform carries the circled guide', (pages['settings-platforms'].match(/class="su-hint"/g) ?? []).length >= 2, (pages['settings-platforms'].match(/class="su-hint"/g) ?? []).length);
    check('settings-storage-move-plan: the move panel carries its guide', /data-guide="move"/.test(pages['settings-storage-move-plan']));
    check('settings-storage-one: with one provider there is no plan button, only the way to add a second', !/st-move-plan-btn/.test(pages['settings-storage-one']) && /st-provider-add/.test(pages['settings-storage-one']));
    // Settings Step S5: reading is open, writing needs «platforms.manage».
    check('settings-platforms: an administrator has working controls, none locked', !/data-need="platforms.manage"/.test(pages['settings-platforms']));
    check('settings-platforms: a viewer sees every control locked for «platforms.manage»', (pages['settings-platforms-viewer'].match(/data-need="platforms.manage"/g) ?? []).length >= 8, (pages['settings-platforms-viewer'].match(/data-need="platforms.manage"/g) ?? []).length);
    check('settings-platforms: the built-in platforms cannot be deleted, the added one can', (pages['settings-platforms'].match(/st-delete/g) ?? []).length === 2, (pages['settings-platforms'].match(/st-delete/g) ?? []).length);
    check('settings-platforms: the info card is there (closed), says it was not read from the official documents, and links the platform own page', /لم تُراجع هذه المعلومات من وثائق المنصة الرسمية بعد/.test(pages['settings-platforms']) && /href="https:\/\/developers\.facebook\.com\/docs\/pages-api\/"/.test(pages['settings-platforms']) && /rel="noopener noreferrer"/.test(pages['settings-platforms']));
    check('settings-platforms: the platform with an account is not offered a working delete', !/data-platform="instagram"[\s\S]*?st-delete[\s\S]*?data-platform="x"/.test(pages['settings-platforms']));
    check('settings-platforms: the mail channel has no readiness tracker or switch', !/data-platform="mail"[\s\S]*?st-ready[\s\S]*?<\/article>/.test(pages['settings-platforms'].replace(/<article class="st-plat[^>]*data-platform="(?!mail)[\s\S]*?<\/article>/g, '')));
    check('settings-platforms: the added platform is stopped and its toggle says «تفعيل»', /data-platform="facebook"[\s\S]*?تفعيل/.test(pages['settings-platforms']));
    // Step P5a: the push is a locked control until granted (D-13); nobody's number appears in messaging.
    check('wa-push-locked: the request is a locked control for «whatsapp.push»', /data-need="whatsapp.push"[^>]*aria-disabled="true"|aria-disabled="true"[^>]*data-need="whatsapp.push"/.test(pages['wa-push-locked']));
    check('wa-push-locked: no member can be sent to', !/class="ml-btn sm primary"/.test(pages['wa-push-locked']));
    check('wa-push-granted: only the one who accepts a push and has none yet gets «إرسال»', (pages['wa-push-granted'].match(/class="ml-btn sm primary"/g) ?? []).length === 1, (pages['wa-push-granted'].match(/class="ml-btn sm primary"/g) ?? []).length);
    check('wa-member-pending: the pending number is masked', pages['wa-member-pending'].includes('+999•••••001'));
    check('wa-member-off: nothing but the switch while it is off', !/wa-level|wa-pushed|wa-mutes/.test(pages['wa-member-off']));
    // Step P4: which steps are locked, and how (data-need on a locked control, never `disabled`).
    const lockOf = (html) => [0, 1, 2, 3].map((l) => {
      const tag = (html.match(new RegExp(`<button[^>]*data-level="${l}"[^>]*>`)) ?? [''])[0];
      return /aria-disabled="true"/.test(tag) ? (tag.match(/data-need="([^"]+)"/) ?? ['', '?'])[1] : /disabled/.test(tag) ? 'disabled' : 'open';
    }).join(',');
    check('urgency-picker-writer: levels 0 and 1 open, 2 and 3 locked controls with their capability', lockOf(pages['urgency-picker-writer']) === 'open,open,urgency.2,urgency.3', lockOf(pages['urgency-picker-writer']));
    check('urgency-picker-granted: given «مهم», only level 3 stays locked', lockOf(pages['urgency-picker-granted']) === 'open,open,open,urgency.3', lockOf(pages['urgency-picker-granted']));
    check('urgency-picker-director: the director uses all four', lockOf(pages['urgency-picker-director']) === 'open,open,open,open', lockOf(pages['urgency-picker-director']));
    check('urgency-picker-granted: the chosen step is marked', /aria-checked="true"[^>]*data-level="2"|data-level="2"[^>]*aria-checked="true"/.test(pages['urgency-picker-granted'].replace(/class="[^"]*"/g, '')));
    check('urgency-badges: level 0 draws no mark', (pages['urgency-badges'].match(/class="cx-lvl l/g) ?? []).length === 3);
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
    const wide = ['settings-general', 'settings-audit', 'wa-member-linked', 'wa-system', 'wa-push-granted', 'urgency-picker-writer', 'urgency-badges', 'accounts-members', 'accounts-card', 'accounts-roles', 'dialog-grant', 'my-permissions', 'requests-perm-granter', 'dialog-decide-approve', 'dialog-ask-button', 'home-perms'];
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
    // ---------- the locked-control helper, live (src/lib/kit/need.ts) ----------
    fs.writeFileSync(path.join(out, 'need.html'), page(`<div class="pm"><button id="lock" class="primary" data-need="room.create" data-why="قنوات الإعلانات لمدير الاتصال ومساعده افتراضياً." aria-disabled="true" onclick="window.__clicked=true">قناة جديدة</button>
<button id="fixed" class="secondary" data-need="urgency.3" data-why="المستوى الأعلى لمدير الاتصال ومساعده." aria-disabled="true" onclick="window.__clicked=true">عاجل</button>
<button id="free" class="secondary" onclick="window.__free=true">عادي</button></div>`).replace('</body>', `<script type="module">
import { installNeed, NEED_EVENT } from './build/lib/kit/need.js';
window.__asked = [];
window.addEventListener(NEED_EVENT, (e) => window.__asked.push(e.detail.cap));
installNeed({ guideOn: () => false });
window.__ready = true;
</script></body>`));
    const ctxN = await browser.newContext({ viewport: { width: 1000, height: 700 } });
    const pn = await ctxN.newPage();
    const nerr = [];
    pn.on('pageerror', (e) => nerr.push(e.message));
    await pn.goto(base + 'need.html');
    await pn.waitForFunction(() => window.__ready === true);
    await pn.click('#lock', { force: true });
    const tip1 = await pn.evaluate(() => ({ text: document.querySelector('.gd-need')?.textContent ?? '', ask: !!document.querySelector('[data-need-ask="room.create"]'), clicked: !!window.__clicked }));
    check('locked control: a click explains why, in the control\'s own words', tip1.text.includes('قنوات الإعلانات لمدير الاتصال ومساعده افتراضياً.') && tip1.text.includes('غير متاح لك الآن'), tip1.text);
    check('locked control: it offers «اطلب هذه الصلاحية»', tip1.ask);
    check('locked control: the control itself does not act', !tip1.clicked);
    await pn.click('[data-need-ask="room.create"]');
    const asked = await pn.evaluate(() => ({ asked: window.__asked, tip: !!document.querySelector('.gd-need') }));
    check('locked control: «اطلب هذه الصلاحية» opens the request for that capability, and the tip closes', JSON.stringify(asked.asked) === '["room.create"]' && !asked.tip, JSON.stringify(asked));
    await pn.click('#fixed', { force: true });
    const tip2 = await pn.evaluate(() => ({ text: document.querySelector('.gd-need')?.textContent ?? '', ask: !!document.querySelector('[data-need-ask]') }));
    check('locked control: a rule fixed by the reference explains itself and offers nothing', tip2.text.includes('المستوى الأعلى') && !tip2.ask, tip2.text);
    await pn.click('#free');
    const free = await pn.evaluate(() => ({ free: !!window.__free, tip: !!document.querySelector('.gd-need') }));
    check('locked control: an ordinary button acts, and the tip goes away', free.free && !free.tip, JSON.stringify(free));
    await pn.focus('#lock');
    await pn.keyboard.press('Enter');
    check('locked control: Enter on it explains too', await pn.evaluate(() => !!document.querySelector('.gd-need') && !window.__clicked));
    check('locked control: no page errors', !nerr.length, nerr.join(' | '));
    await ctxN.close();
    // ---------- Step P4: the picker's locked steps, live ----------
    fs.writeFileSync(path.join(out, 'urgency-need.html'), page(pages['urgency-picker-writer']).replace('</body>', `<script type="module">
import { installNeed, NEED_EVENT } from './build/lib/kit/need.js';
window.__asked = [];
window.addEventListener(NEED_EVENT, (e) => window.__asked.push(e.detail.cap));
installNeed({ guideOn: () => false });
window.__ready = true;
</script></body>`));
    const ctxU = await browser.newContext({ viewport: { width: 1000, height: 700 } });
    const pu = await ctxU.newPage();
    const uerr = [];
    pu.on('pageerror', (e) => uerr.push(e.message));
    await pu.goto(base + 'urgency-need.html');
    await pu.waitForFunction(() => window.__ready === true);
    await pu.click('[data-level="2"]', { force: true });
    const u2 = await pu.evaluate(() => ({ text: document.querySelector('.gd-need')?.textContent ?? '', ask: !!document.querySelector('[data-need-ask="urgency.2"]') }));
    check('urgency picker: «مهم» without the permission explains why and offers the request', u2.text.includes('رسائل «مهم» لمن يملك صلاحيتها') && u2.ask, u2.text);
    await pu.click('[data-need-ask="urgency.2"]');
    check('urgency picker: the request opens for «مهم»', JSON.stringify(await pu.evaluate(() => window.__asked)) === '["urgency.2"]');
    await pu.click('[data-level="3"]', { force: true });
    const u3 = await pu.evaluate(() => ({ text: document.querySelector('.gd-need')?.textContent ?? '', ask: !!document.querySelector('[data-need-ask]') }));
    check('urgency picker: «عاجل» is fixed: explained, nothing offered', u3.text.includes('حتى يبقى العاجل نادراً') && !u3.ask, u3.text);
    check('urgency picker: no page errors', !uerr.length, uerr.join(' | '));
    await pu.screenshot({ path: path.join(out, 'urgency-need.png') });
    await ctxU.close();
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

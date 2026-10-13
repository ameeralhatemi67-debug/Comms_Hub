// Browser check of «العمل», the work page, «إنشاء» and the plan editor (Reference_Build_Plan.md,
// Step 3), and of «الموافقات والنشر», the review screen, «الحسابات المرتبطة» and the
// notifications drawer (Step 4), and of «التقويم», «المشاريع» and the project page, «الطلبات»
// and Home (Step 5), without signing in.
// The pages are behind sign-in and no bypass is allowed, so this compiles the pages' own
// components (src/components/work, src/lib/work: the code the site runs) with the database
// layer (./data) replaced by fixture data, renders them with React, and checks the result in
// headless Edge: no page errors, the expected content, no sideways scroll at phone width, in
// Direction A, the new identity and its evening mode. The drag engine is then driven for
// real on the rendered plan rows: a mouse drag down, a mouse drag up, and a touch drag; and the
// calendar's drag engine on the rendered week: a mouse drag, a click that only opens, a touch drag.
// What this cannot check: clicks that call the database. Those are in the owner walkthrough.
// Usage: node qa/work-pages.cjs   (writes qa/work-pages.json, screenshots in qa/artifacts/work/)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ts = require('typescript');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');

const root = path.resolve(__dirname, '..');
const out = path.join(__dirname, 'artifacts', 'work');
const build = path.join(out, 'build');
const result = { run: new Date().toISOString(), checks: [], errors: [] };
const check = (name, pass, detail = '') => result.checks.push({ name, pass: Boolean(pass), detail: String(detail) });

// ---------- compile the real modules, with the database layer swapped for fixtures ----------
fs.rmSync(build, { recursive: true, force: true });
const sources = [
  'components/work/list.tsx', 'components/work/item.tsx', 'components/work/create.tsx', 'components/work/plan.tsx', 'components/work/parts.tsx',
  'components/work/approvals.tsx', 'components/work/review.tsx', 'components/work/channels.tsx', 'components/work/publish.tsx', 'components/notices.tsx',
  'components/work/calendar.tsx', 'components/work/projects.tsx', 'components/work/requests.tsx', 'components/work/day-dialogs.tsx', 'components/home.tsx',
  'lib/work/rules.ts', 'lib/work/planning.ts', 'lib/work/drag.ts', 'lib/media/rules.ts', 'lib/domain.ts', 'lib/kit/hold-reasons.ts',
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
    .replace(/from '\.\/work\/data'/g, `from '${up}mocks/data.js'`)
    .replace(/from '\.\/home-perms'/g, `from '${up}mocks/home-perms.js'`)
    .replace(/from '\.\.\/perm-requests'/g, `from '${up}mocks/perm-requests.js'`)
    .replace(/from '@\/lib\/([^']+)'/g, `from '${up}lib/$1.js'`)
    .replace(/from '(\.[^']+)\.ts'/g, "from '$1.js'")
    .replace(/from '(\.\/(?:work\/)?(?:plan|parts|list|item|create|publish|approvals|review|channels|calendar|projects|requests|day-dialogs))'/g, "from '$1.js'");
  const dest = path.join(build, m.replace(/\.tsx?$/, '.js'));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, js);
}
fs.mkdirSync(path.join(build, 'mocks'), { recursive: true });
fs.writeFileSync(path.join(build, 'package.json'), '{"type":"module"}');
fs.writeFileSync(path.join(build, 'mocks', 'link.js'), `import { createElement } from 'react';
export default function Link({ href, children, ...rest }) { return createElement('a', { href, ...rest }, children); }`);
fs.writeFileSync(path.join(build, 'mocks', 'navigation.js'), `export const useRouter = () => ({ push() {}, replace() {}, refresh() {} });
export const usePathname = () => '/approvals';
export const useSearchParams = () => new URLSearchParams(globalThis.__WK.search || '');`);
// Home's permissions part has its own check (qa/permissions-pages.cjs).
fs.writeFileSync(path.join(build, 'mocks', 'home-perms.js'), 'export const HomePermissions = () => null;');
// The permissions tab of «الطلبات» has its own check (qa/permissions-pages.cjs).
fs.writeFileSync(path.join(build, 'mocks', 'perm-requests.js'), `export const usePermRequests = () => ({ list: [], status: 'ready', reload: async () => {} });
export const PermRequestList = () => null;
export const RequestPermissionDialog = () => null;`);
fs.writeFileSync(path.join(build, 'mocks', 'supabase.js'), `const chain = new Proxy(function () {}, { get: () => chain, apply: () => chain });
export const supabase = () => chain;`);
fs.writeFileSync(path.join(build, 'mocks', 'data.js'), `export const useWork = () => globalThis.__WK.ctx;
export const useWorkList = () => ({ items: globalThis.__WK.items, status: 'ready', reload: async () => {} });
export const useWorkDetail = () => ({ detail: globalThis.__WK.detail, status: globalThis.__WK.detail ? 'ready' : 'missing', reload: async () => {} });
export const libraryFiles = async () => [];
export const useDecisions = () => ({ ...globalThis.__WK.dec, reload: async () => {} });
export const fileNotes = async () => [];
export const addFileNote = async () => null;
export const WorkProvider = ({ children }) => children;
export const usePlanData = () => ({ ...globalThis.__WK.plan, status: 'ready', reload: async () => {} });
export const useRequestData = () => ({ ...globalThis.__WK.rq, status: 'ready', reload: async () => {} });`);
for (const f of ['globals.css', 'identity.css', 'work.css']) fs.copyFileSync(path.join(root, 'src/app', f), path.join(out, f));

// ---------- fixture: a department on 12 October 2026 ----------
const TODAY = '2026-10-12';
const people = [
  ['dir@x.sa', 'محمد', 'director'], ['asst@x.sa', 'ريم', 'assistant'], ['khalid@x.sa', 'خالد', 'writer'], ['lama@x.sa', 'لمى', 'writer'],
  ['sara@x.sa', 'سارة', 'designer'], ['ahmed@x.sa', 'أحمد', 'producer'], ['noura@x.sa', 'نورة', 'publisher'], ['abd@x.sa', 'عبدالله', 'member'],
].map(([email, display_name, role]) => ({ email, display_name, role }));
const load = people.map((p, i) => ({ ...p, active_works: i % 3, late_works: i === 2 ? 1 : 0, open_stages: i % 4, late_stages: 0, open_tasks: i % 2, late_tasks: 0 }));
const projects = [
  { id: 'p1', name: 'اليوم الوطني 2026', type: 'campaign', start_on: '2026-09-28', end_on: '2026-10-16', owner: 'asst@x.sa', description: null },
  { id: 'p2', name: 'ملتقى الشركاء 2026', type: 'event', start_on: '2026-10-04', end_on: '2026-10-18', owner: 'asst@x.sa', description: null },
];
const accounts = [
  { id: 'a-ig', platform: 'instagram', label: 'الرسمي', handle: '@company.sa', purpose: null, authorized_until: '2026-11-02T00:00:00Z', publishers: ['noura@x.sa'], mode: 'auto', active: true, fixed: false },
  { id: 'a-x', platform: 'x', label: 'الرسمي', handle: '@company_sa', purpose: null, authorized_until: '2026-10-12T09:00:00Z', publishers: ['noura@x.sa'], mode: 'auto', active: true, fixed: false },
  { id: 'a-li', platform: 'linkedin', label: 'صفحة الشركة', handle: 'Company SA', purpose: null, authorized_until: '2026-12-01T00:00:00Z', publishers: ['noura@x.sa'], mode: 'auto', active: true, fixed: false },
  { id: 'a-yt', platform: 'youtube', label: 'الرسمي', handle: '@CompanySA', purpose: null, authorized_until: '2026-12-15T00:00:00Z', publishers: ['noura@x.sa'], mode: 'ask', active: true, fixed: false },
  { id: 'a-mail', platform: 'mail', label: 'صندوق القسم', handle: null, purpose: null, authorized_until: null, publishers: [], mode: 'ask', active: true, fixed: true },
];
const templates = [{ id: 't1', name: 'فيديو قصير بمراجعة قانونية', type: 'video', rows: [{ n: 'النص', role: 'writer', days: 1, after: [], gate: true, note: '' }, { n: 'التصوير', role: 'producer', days: 2, after: [0], gate: false, note: '' }], created_by: 'dir@x.sa' }];
const W = (over) => ({
  no: 1, type: 'post', status: 'IN_PRODUCTION', priority: 'normal', restricted: false, source: 'plan', requester: null, brief: null,
  created_by: 'asst@x.sa', assignee: 'khalid@x.sa', people: [], due: '2026-10-16', event_at: null, place: null, channels: [],
  proposed_at: null, sched_at: null, pub_at: null, pub_mode: null, pending_sched: false, confirm_pending: false, move_from: null, move_by: null,
  review_cycle: null, results: {}, closed_at: null, closed_by: null, close_reason: null, created_at: '2026-10-10T06:00:00Z', updated_at: '2026-10-11T06:00:00Z', ...over,
});
const S = (work, pos, over) => ({
  id: `${work}-s${pos}`, work_id: work, pos, name: 'مرحلة', role: '', who: null, start_on: null, due_on: null, after_pos: pos ? [pos - 1] : [], days: 1,
  note: null, gate: false, gate_by: null, gate_at: null, started_at: null, done_at: null, done_by: null, ...over,
});
const works = [
  { w: W({ id: 'CH-1', title: 'منشور اليوم الوطني: شكراً لفريقنا', priority: 'urgent', channels: ['a-ig', 'a-x', 'a-li'], people: ['sara@x.sa'], brief: 'منشور شكر للفريق بمناسبة اليوم الوطني.' }),
    stages: [S('CH-1', 0, { name: 'كتابة النص', role: 'writer', who: 'khalid@x.sa', start_on: '2026-10-09', due_on: '2026-10-10', done_at: '2026-10-10T08:00:00Z', done_by: 'khalid@x.sa' }),
      S('CH-1', 1, { name: 'نسخ المنصات', role: 'writer', who: 'khalid@x.sa', start_on: '2026-10-11', due_on: '2026-10-11', started_at: '2026-10-11T07:00:00Z' }),
      S('CH-1', 2, { name: 'المرئيات', role: 'designer', who: 'sara@x.sa', start_on: '2026-10-11', due_on: '2026-10-13', after_pos: [0], gate: true, note: 'بهوية الحملة' }),
      S('CH-1', 3, { name: 'التدقيق', role: 'assistant', who: 'asst@x.sa', start_on: '2026-10-14', due_on: '2026-10-15', after_pos: [1, 2] })], projects: ['p1'], flags: 0 },
  { w: W({ id: 'CH-2', title: 'فيديو قصص الملتقى', type: 'video', status: 'IN_REVIEW', assignee: 'ahmed@x.sa', review_cycle: 1, due: '2026-10-18', channels: ['a-yt', 'a-ig'] }),
    stages: [S('CH-2', 0, { name: 'النص', who: 'khalid@x.sa', done_at: '2026-10-09T08:00:00Z', done_by: 'khalid@x.sa', due_on: '2026-10-09' }), S('CH-2', 1, { name: 'التصوير', who: 'ahmed@x.sa', done_at: '2026-10-11T08:00:00Z', done_by: 'ahmed@x.sa', due_on: '2026-10-11' })], projects: ['p2'], flags: 0, pending: 3 },
  { w: W({ id: 'CH-3', title: 'طلب تغطية يوم التطوع', type: 'event', status: 'DRAFT', assignee: null, created_by: 'abd@x.sa', source: 'member', due: '2026-10-20' }),
    stages: [S('CH-3', 0, { name: 'التخطيط' }), S('CH-3', 1, { name: 'التصوير يوم الحدث' })], projects: [], flags: 0 },
  { w: W({ id: 'CH-4', title: 'بيان الشراكة الجديدة', type: 'press', status: 'APPROVED', assignee: 'lama@x.sa', due: '2026-10-11', channels: ['a-mail'], restricted: true }),
    stages: [S('CH-4', 0, { name: 'كتابة البيان', who: 'lama@x.sa', done_at: '2026-10-10T08:00:00Z', done_by: 'lama@x.sa' })], projects: [], flags: 0 },
  { w: W({ id: 'CH-5', title: 'تصميم ملصق الشتاء', type: 'design', status: 'CHANGES_REQUESTED', assignee: 'sara@x.sa', due: '2026-10-10' }),
    stages: [S('CH-5', 0, { name: 'الفكرة', who: 'sara@x.sa', done_at: '2026-10-08T08:00:00Z', done_by: 'sara@x.sa', due_on: '2026-10-08' })], projects: ['p1'], flags: 1 },
  { w: W({ id: 'CH-6', title: 'إعلان أُلغي', type: 'announce', status: 'DRAFT', closed_at: '2026-10-11T09:00:00Z', closed_by: 'dir@x.sa', close_reason: 'أُلغي الحدث' }),
    stages: [S('CH-6', 0, { name: 'كتابة النص' })], projects: [], flags: 0 },
  { w: W({ id: 'CH-7', title: 'منشور الملتقى المجدول', status: 'SCHEDULED', channels: ['a-ig', 'a-x'], sched_at: '2026-10-14T15:00:00Z', proposed_at: '2026-10-14T15:00:00Z', pub_mode: 'ask' }),
    stages: [], projects: ['p2'], flags: 0 },
  { w: W({ id: 'CH-8', title: 'منشور نُشر جزئياً', status: 'PARTIAL', channels: ['a-ig', 'a-x'], pub_at: '2026-10-11T09:00:00Z',
    results: { 'a-ig': { ok: true, at: '2026-10-11T09:00:00Z', why: null }, 'a-x': { ok: false, at: '2026-10-11T09:00:00Z', why: 'التفويض منتهٍ' } } }),
    stages: [], projects: [], flags: 0 },
  { w: W({ id: 'CH-9', title: 'فيديو منشور', type: 'video', status: 'PUBLISHED', channels: ['a-yt'], pub_at: '2026-10-10T09:00:00Z',
    results: { 'a-yt': { ok: true, at: '2026-10-10T09:00:00Z', why: null } } }),
    stages: [], projects: [], flags: 0 },
  { w: W({ id: 'CH-10', title: 'بيان الشراكة للمراجعة', type: 'press', status: 'IN_REVIEW', review_cycle: 1, channels: ['a-mail'], assignee: 'lama@x.sa' }),
    stages: [], projects: [], flags: 0 },
];
const dec = {
  cycles: [
    { work_id: 'CH-2', n: 1, sent_by: 'ahmed@x.sa', sent_at: '2026-10-11T10:00:00Z', note: 'جاهز' },
    { work_id: 'CH-10', n: 1, sent_by: 'dir@x.sa', sent_at: '2026-10-11T11:00:00Z', note: null },
    { work_id: 'CH-4', n: 1, sent_by: 'khalid@x.sa', sent_at: '2026-10-10T10:00:00Z', note: null },
  ],
  decisions: [
    { id: 2, work_id: 'CH-4', cycle: 1, op: 'approve', parts: ['text', 'dest'], labels: ['الحزمة كاملة'], decided_by: 'dir@x.sa', decided_at: '2026-10-11T08:00:00Z', note: null },
    { id: 1, work_id: 'CH-5', cycle: 1, op: 'changes', parts: ['a:f1'], labels: ['ملصق الشتاء'], decided_by: 'asst@x.sa', decided_at: '2026-10-10T08:00:00Z', note: 'كبّر الشعار' },
  ],
};
// Step 5: the planning pages see two more works (a publish date being moved, and an approved
// post close to another on the same account), tasks, events, a private reminder and requests.
const works5 = [
  ...works,
  { w: W({ id: 'CH-11', title: 'منشور نقل موعده', status: 'IN_REVIEW', channels: ['a-ig'], review_cycle: 2, move_from: '2026-10-15T09:00:00Z', proposed_at: '2026-10-16T09:00:00Z', move_by: 'khalid@x.sa' }),
    stages: [], projects: ['p2'], flags: 0, pending: 1, pendingKeys: ['date'] },
  { w: W({ id: 'CH-12', title: 'منشور معتمد قريب', status: 'APPROVED', channels: ['a-ig'], proposed_at: '2026-10-14T16:00:00Z' }), stages: [], projects: ['p2'], flags: 0 },
];
const T = (id, over) => ({ id, what: 'مهمة', kind: 'other', assignee: 'khalid@x.sa', assigned_by: 'asst@x.sa', due: '2026-10-13T14:00:00Z', start_on: null, after_ids: [], status: 'open', note: null, project_id: null, work_id: null, group_key: null, priority: 'normal', ...over });
const plan5 = {
  tasks: [
    T('t1', { what: 'تغطية يومية للمعرض', assignee: 'ahmed@x.sa', start_on: '2026-10-12', due: '2026-10-15T14:00:00Z', project_id: 'p2' }),
    T('t2', { what: 'كتابة التعليقات', after_ids: ['t1'], due: '2026-10-16T14:00:00Z', project_id: 'p2' }),
    T('t3', { what: 'فرز الصور', assignee: 'sara@x.sa', due: '2026-10-11T14:00:00Z', project_id: 'p1' }),
  ],
  events: [{ id: 'e1', title: 'ملتقى الشركاء', start_at: '2026-10-14T06:00:00Z', end_at: '2026-10-16T14:00:00Z', place: 'مركز المعارض', project_id: 'p2', created_by: 'asst@x.sa' }],
  reminders: [{ id: 'r1', at: '2026-10-13T07:00:00Z', body: 'اتصال بإدارة الفعاليات' }],
};
const RQ = (over) => ({ id: 'q1', kind: 'extension', status: 'pending', requested_by: 'sara@x.sa', requested_at: '2026-10-12T05:00:00Z', from_at: '2026-10-13T00:00:00Z', to_at: '2026-10-15T09:00:00Z',
  reason: 'تأخر وصول الصور', decided_by: null, decided_at: null, decision_note: null, extend_work: false, stage_id: 'CH-1-s2', stage_name: 'المرئيات', work_id: 'CH-1', work_title: 'منشور اليوم الوطني: شكراً لفريقنا',
  work_due: '2026-10-16', task_id: null, task_what: null, task_assigned_by: null, folder_id: null, folder_name: null, can_decide: true, ...over });
const rq5 = {
  requests: [
    RQ({}),
    RQ({ id: 'q2', kind: 'access', stage_id: null, stage_name: null, work_id: null, work_title: null, work_due: null, folder_id: 'f9', folder_name: 'العقود', requested_by: 'abd@x.sa', reason: 'أحتاج نسخة العقد' }),
    RQ({ id: 'q3', status: 'approved', decided_by: 'dir@x.sa', decided_at: '2026-10-11T09:00:00Z', requested_by: 'khalid@x.sa', can_decide: false, stage_name: 'نسخ المنصات', extend_work: true }),
    RQ({ id: 'q4', kind: 'extension', stage_id: null, stage_name: null, work_id: null, work_title: null, work_due: null, task_id: 't2', task_what: 'كتابة التعليقات', task_assigned_by: 'asst@x.sa', requested_by: 'khalid@x.sa', can_decide: false }),
  ],
  held: [{ id: 'h1', thread_id: 'm1', author: 'khalid@x.sa', created_at: '2026-10-12T04:00:00Z', subject: 'رد على طلب الشراكة' }],
  locked: [{ id: 'f9', name: 'العقود' }],
};

const detailOf = (i, over = {}) => {
  const x = works[i];
  return {
    w: x.w, stages: x.stages,
    texts: [{ n: 1, body: 'نص أول', note: 'الصياغة الأولى', author: 'khalid@x.sa', created_at: '2026-10-10T07:00:00Z' }, { n: 2, body: 'شكراً لكل من صنع هذا اليوم معنا.\nفخورون بكم.', note: null, author: 'asst@x.sa', created_at: '2026-10-11T07:00:00Z' }],
    variants: [{ platform: 'x', n: 1, body: 'شكراً لفريقنا #اليوم_الوطني', base: 1, author: 'khalid@x.sa', created_at: '2026-10-10T09:00:00Z' }],
    approvals: [{ part: 'dest', ver: 'x', approved_by: 'dir@x.sa' }], flags: [], cycles: [], decisions: [],
    comments: [{ id: 'c1', author: 'asst@x.sa', body: 'الصورة الثانية أفضل للإنستغرام.', created_at: '2026-10-11T08:00:00Z' }],
    log: [{ id: 1, at: '2026-10-09T06:00:00Z', actor: 'asst@x.sa', type: 'create', text: 'إنشاء العمل وإسناده إلى خالد' }, { id: 2, at: '2026-10-10T08:00:00Z', actor: 'khalid@x.sa', type: 'stage_done', text: 'إنهاء مرحلة «كتابة النص»' }],
    projects: x.projects,
    assets: [{ asset_id: 'f1', file: { id: 'f1', name: 'ملصق اليوم الوطني', kind: 'image', current_version: 3, approved_version: null, stage: 'production' } }, { asset_id: 'f2', file: null }],
    parts: [{ key: 'text', label: 'النص الأساسي', ver: 't2', kind: 'text' }, { key: 'v:x', label: 'نسخة X', ver: 'c1', kind: 'copy' }, { key: 'a:f1', label: 'ملصق اليوم الوطني', ver: 'v3', kind: 'asset' }, { key: 'dest', label: 'المنصات والحسابات', ver: 'd', kind: 'dest' }],
    pending: [], decideBlock: '', mail: [{ id: 'm1', subject: 'طلب منشور شكر', kind: 'external', req_no: 7 }], chats: [], extensions: [],
    ...over,
  };
};
const reviewDetail = (i, over = {}) => detailOf(i, {
  cycles: [{ n: 1, sent_by: 'ahmed@x.sa', sent_at: '2026-10-11T10:00:00Z', note: 'جاهز للمراجعة' }],
  approvals: [{ part: 'text', ver: 't1', approved_by: 'dir@x.sa', approved_at: '2026-10-09T08:00:00Z', snap: 'شكراً لفريقنا على العمل' }],
  assets: [{ asset_id: 'f9', file: { id: 'f9', name: 'فيديو الملتقى', kind: 'video', current_version: 2, approved_version: 1, stage: 'review' } }],
  parts: [
    { key: 'text', label: 'نص الفيديو', ver: 't2', kind: 'text', snap: 'شكراً لكل فريقنا على الجهد' },
    { key: 'v:instagram', label: 'نسخة إنستغرام', ver: 'c1', kind: 'copy', snap: 'نسخة إنستغرام' },
    { key: 'a:f9', label: 'فيديو الملتقى', ver: 'v2', kind: 'asset', snap: null },
    { key: 'dest', label: 'المنصات والحسابات', ver: 'd', kind: 'dest', snap: null },
    { key: 'date', label: 'موعد النشر', ver: 's:2026-10-14T15:00', kind: 'date', snap: null },
  ],
  pending: [{ key: 'text' }, { key: 'v:instagram' }, { key: 'a:f9' }, { key: 'date' }],
  ...over,
});
const ctx = (email, role) => ({
  status: 'ready', me: email, role, isAdmin: false, today: TODAY, people, load, projects, accounts, templates,
  nameOf: (e) => (e ? (people.find((p) => p.email === e)?.display_name ?? e.split('@')[0]) : ''),
  personOf: (e) => people.find((p) => p.email === e), reloadBase: async () => {}, call: async () => ({ ok: true, data: null }), say: () => {},
});

// ---------- render each scenario with React ----------
async function renderAll() {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const url = (f) => 'file:///' + path.join(build, f).replace(/\\/g, '/');
  const list = await import(url('components/work/list.js'));
  const item = await import(url('components/work/item.js'));
  const create = await import(url('components/work/create.js'));
  const plan = await import(url('components/work/plan.js'));
  const appr = await import(url('components/work/approvals.js'));
  const review = await import(url('components/work/review.js'));
  const chan = await import(url('components/work/channels.js'));
  const publish = await import(url('components/work/publish.js'));
  const notices = await import(url('components/notices.js'));
  const cal = await import(url('components/work/calendar.js'));
  const proj = await import(url('components/work/projects.js'));
  const reqs = await import(url('components/work/requests.js'));
  const dayd = await import(url('components/work/day-dialogs.js'));
  const home = await import(url('components/home.js'));
  const planning = await import(url('lib/work/planning.js'));
  const h = React.createElement;
  const pages = {};
  const render = (name, as, role, el, extra = {}) => {
    globalThis.__WK = { ctx: { ...ctx(as, role), ...(extra.ctxOver ?? {}) }, items: works, detail: null, search: '', dec, ...extra };
    try {
      pages[name] = renderToStaticMarkup(el).replace(/<dialog /g, '<dialog open ');
      check(`${name}: renders`, true);
    } catch (e) {
      check(`${name}: renders`, false, e.stack);
      pages[name] = '';
    }
  };
  render('list-director', 'dir@x.sa', 'director', h(list.WorkListPage));
  render('list-all', 'dir@x.sa', 'director', h(list.WorkListPage), { search: 'tab=all' });
  render('list-writer', 'khalid@x.sa', 'writer', h(list.WorkListPage));
  render('list-member', 'abd@x.sa', 'member', h(list.WorkListPage), { search: 'tab=mine' });
  render('list-empty', 'dir@x.sa', 'director', h(list.WorkListPage), { items: [], search: 'tab=all' });
  render('item-writer', 'khalid@x.sa', 'writer', h(item.WorkItemPage, { id: 'CH-1' }), { detail: detailOf(0) });
  render('item-designer', 'sara@x.sa', 'designer', h(item.WorkItemPage, { id: 'CH-1' }), { detail: detailOf(0) });
  render('item-director-review', 'dir@x.sa', 'director', h(item.WorkItemPage, { id: 'CH-2' }), {
    detail: detailOf(1, { cycles: [{ n: 1, sent_by: 'ahmed@x.sa', sent_at: '2026-10-11T10:00:00Z', note: 'جاهز' }], pending: [{ key: 'text', label: 'نص الفيديو', ver: 't2', kind: 'text' }] }),
  });
  render('item-closed', 'khalid@x.sa', 'writer', h(item.WorkItemPage, { id: 'CH-6' }), { detail: detailOf(5) });
  render('item-missing', 'khalid@x.sa', 'writer', h(item.WorkItemPage, { id: 'CH-99' }));
  render('create-types', 'dir@x.sa', 'director', h(create.CreatePage));
  render('create-post', 'dir@x.sa', 'director', h(create.CreatePage), { search: 'type=post' });
  render('create-writer-video', 'khalid@x.sa', 'writer', h(create.CreatePage), { search: 'type=video' });
  render('create-member', 'abd@x.sa', 'member', h(create.CreatePage), { search: 'type=event' });
  render('create-publisher', 'noura@x.sa', 'publisher', h(create.CreatePage));
  const rows = works[0].stages.map((s) => ({ id: s.id, n: s.name, role: s.role, who: s.who ?? '', start: s.start_on ?? '', due: s.due_on ?? '', after: s.after_pos, days: 1, gate: s.gate, note: s.note ?? '', done: !!s.done_at }));
  // The editor and the dialogs open inside a work page, so they render inside its .wk frame.
  const wk = (el) => h('div', { className: 'wk' }, el);
  render('plan-simple', 'dir@x.sa', 'director', wk(h(plan.PlanEditor, { title: 'منشور اليوم الوطني', type: 'post', due: '2026-10-16', initial: rows, onSave: async () => null, onClose: () => {} })));
  render('plan-free', 'dir@x.sa', 'director', wk(h(plan.PlanEditor, { title: 'منشور اليوم الوطني', type: 'post', due: '2026-10-16', initial: rows, advanced: true, onSave: async () => null, onClose: () => {} })));
  // Step 4
  render('approvals-director', 'dir@x.sa', 'director', h(appr.ApprovalsPage));
  render('approvals-writer', 'khalid@x.sa', 'writer', h(appr.ApprovalsPage));
  render('approvals-publish', 'noura@x.sa', 'publisher', h(appr.ApprovalsPage));
  render('approvals-publish-lead', 'dir@x.sa', 'director', h(appr.ApprovalsPage), { search: 'tab=publish' });
  const ch2 = { ...works[1].w, proposed_at: '2026-10-14T15:00:00Z', channels: ['a-ig', 'a-x'] };
  render('review-director', 'dir@x.sa', 'director', h(review.ReviewPage, { id: 'CH-2' }), { detail: reviewDetail(1, { w: ch2 }) });
  render('review-writer', 'khalid@x.sa', 'writer', h(review.ReviewPage, { id: 'CH-2' }), { detail: reviewDetail(1, { w: ch2 }) });
  render('review-self', 'ahmed@x.sa', 'director', h(review.ReviewPage, { id: 'CH-2' }), {
    detail: reviewDetail(1, { w: ch2, decideBlock: 'لا تعتمد ما أرسلته أو رفعته بنفسك.' }),
  });
  render('review-package', 'asst@x.sa', 'assistant', h(review.ReviewPage, { id: 'CH-10' }), {
    detail: reviewDetail(9, { w: works[9].w, parts: [{ key: 'text', label: 'نص البيان', ver: 't2', kind: 'text', snap: 'نص البيان' }, { key: 'dest', label: 'جهة الإرسال', ver: 'd', kind: 'dest', snap: null }], pending: [{ key: 'text' }, { key: 'dest' }], assets: [] }),
  });
  render('channels-director', 'dir@x.sa', 'director', h(chan.ChannelsPage));
  render('channels-publisher', 'noura@x.sa', 'publisher', h(chan.ChannelsPage));
  render('channels-writer', 'khalid@x.sa', 'writer', h(chan.ChannelsPage));
  render('item-publisher', 'noura@x.sa', 'publisher', h(item.WorkItemPage, { id: 'CH-4' }), { detail: detailOf(3) });
  const nlist = [
    { id: 'n1', tier: 'decide', body: 'أعاد أحمد «فيديو قصص الملتقى» للمراجعة.', go: { page: 'review', id: 'CH-2' }, created_at: '2026-10-11T09:00:00Z', read_at: null },
    { id: 'n2', tier: 'attention', body: 'طلبت ريم تعديل «ملصق الشتاء».', go: { page: 'item', id: 'CH-5' }, created_at: '2026-10-11T08:00:00Z', read_at: null },
    { id: 'n3', tier: 'info', body: 'صار دورك: «المرئيات».', go: { page: 'item', id: 'CH-1' }, created_at: '2026-10-10T08:00:00Z', read_at: '2026-10-10T09:00:00Z' },
  ];
  render('notices', 'dir@x.sa', 'director', h(notices.NoticeDrawer, { notices: { list: nlist, unread: 2, read: async () => {}, reload: async () => {} }, onClose: () => {} }));

  const d0 = detailOf(0);
  globalThis.__WK = { ctx: ctx('khalid@x.sa', 'writer'), items: works, detail: d0, search: '', dec };
  const dialogs = [
    ['submit', h(item.SubmitDialog, { d: d0, onClose() {}, act: async () => true })],
    ['close', h(item.CloseDialog, { d: d0, onClose() {}, act: async () => true })],
    ['text', h(item.TextDialog, { d: d0, target: 'x', onClose() {}, act: async () => true })],
    ['details', h(item.DetailsDialog, { d: d0, onClose() {}, act: async () => true })],
    ['assign', h(item.AssignDialog, { d: d0, onClose() {}, act: async () => true })],
    ['extension', h(item.ExtensionDialog, { d: d0, stage: d0.stages[1], onClose() {}, act: async () => true })],
  ];
  for (const [n, el] of dialogs) render(`dialog-${n}`, 'dir@x.sa', 'director', wk(el), { detail: d0 });
  const rd = reviewDetail(1, { w: ch2 });
  const pubDialogs = [
    ['schedule', 'noura@x.sa', 'publisher', h(publish.ScheduleDialog, { w: works[6].w, approvedParts: ['النص الأساسي الإصدار 2'], onClose() {}, act: async () => true })],
    ['pubnow', 'noura@x.sa', 'publisher', h(publish.PublishNowDialog, { w: { ...works[7].w, status: 'APPROVED' }, onClose() {}, act: async () => true })],
    ['changes', 'dir@x.sa', 'director', h(review.ChangesDialog, { d: rd, pend: rd.parts.slice(0, 3), first: 'text', notes: [{ id: 'vn1', asset_id: 'f9', author: 'dir@x.sa', body: 'قدّم الشعار', timecode: '00:32', created_at: '2026-10-11T08:00:00Z' }], onClose() {}, act: async () => true })],
    ['reject', 'dir@x.sa', 'director', h(review.RejectDialog, { d: rd, onClose() {}, act: async () => true })],
    ['account-add', 'dir@x.sa', 'director', h(chan.AccountDialog, { a: null, use: [], onClose() {}, act: async () => true })],
    ['account-busy', 'dir@x.sa', 'director', h(chan.DeleteDialog, { a: accounts[1], use: [works[6]], onClose() {}, act: async () => true })],
  ];
  for (const [n, as, role, el] of pubDialogs) render(`dialog-${n}`, as, role, wk(el));

  // Step 5: «التقويم», «المشاريع» and the project page, «الطلبات», Home.
  const s5 = { items: works5, plan: plan5, rq: rq5 };
  render('calendar-week', 'dir@x.sa', 'director', h(cal.CalendarPage), { ...s5, search: 'date=2026-10-12&view=week' });
  render('calendar-month', 'dir@x.sa', 'director', h(cal.CalendarPage), { ...s5, search: 'date=2026-10-12&view=month' });
  render('calendar-day', 'dir@x.sa', 'director', h(cal.CalendarPage), { ...s5, search: 'date=2026-10-14&view=day' });
  render('calendar-agenda', 'khalid@x.sa', 'writer', h(cal.CalendarPage), { ...s5, search: 'date=2026-10-12&view=agenda' });
  render('calendar-member', 'abd@x.sa', 'member', h(cal.CalendarPage), { ...s5, search: 'date=2026-10-12&view=week' });
  render('calendar-project', 'dir@x.sa', 'director', h(cal.CalendarPage), { ...s5, search: 'date=2026-10-12&view=week&project=p1' });
  const entries = planning.calEntries({ works: works5, tasks: plan5.tasks, events: plan5.events, reminders: plan5.reminders, accounts, me: 'dir@x.sa', today: TODAY, nowIso: '2026-10-12T06:00:00Z' });
  const entry = (k, id) => entries.find((e) => e.k === k && (!id || e.w?.id === id || e.t?.id === id || e.ev?.id === id));
  const drawer = (name, as, role, e, extra = {}) =>
    render(name, as, role, wk(h(cal.EntryDrawer, { e, pendingKeys: works5.find((x) => x.w.id === e.w?.id)?.pendingKeys, stages: works5.find((x) => x.w.id === e.w?.id)?.stages ?? [], onClose() {}, open() {}, act: async () => true })), { ...s5, ...extra });
  drawer('drawer-pub-writer', 'khalid@x.sa', 'writer', entries.find((e) => e.k === 'pub' && e.w.id === 'CH-7' && e.ch === 'a-x'));
  drawer('drawer-move-director', 'dir@x.sa', 'director', entry('move', 'CH-11'));
  drawer('drawer-move-self', 'khalid@x.sa', 'director', entry('move', 'CH-11'));
  drawer('drawer-pubok-publisher', 'noura@x.sa', 'publisher', entry('pubok', 'CH-12'));
  drawer('drawer-stage-designer', 'sara@x.sa', 'designer', entries.find((e) => e.k === 'stage' && e.w.id === 'CH-1' && e.si === 2));
  drawer('drawer-due-director', 'dir@x.sa', 'director', entry('due', 'CH-1'));
  drawer('drawer-task', 'khalid@x.sa', 'writer', entry('task', 't2'));
  drawer('drawer-rem', 'dir@x.sa', 'director', entry('rem'));
  render('projects-director', 'dir@x.sa', 'director', h(proj.ProjectsPage), s5);
  render('projects-writer', 'khalid@x.sa', 'writer', h(proj.ProjectsPage), s5);
  render('projects-empty', 'dir@x.sa', 'director', h(proj.ProjectsPage), { ...s5, ctxOver: { projects: [] } });
  render('project-timeline', 'dir@x.sa', 'director', h(proj.ProjectPage, { id: 'p2' }), s5);
  render('project-people', 'dir@x.sa', 'director', h(proj.ProjectPage, { id: 'p1' }), { ...s5, search: 'tab=people' });
  render('project-works', 'khalid@x.sa', 'writer', h(proj.ProjectPage, { id: 'p1' }), { ...s5, search: 'tab=works' });
  render('project-tasks', 'khalid@x.sa', 'writer', h(proj.ProjectPage, { id: 'p2' }), { ...s5, search: 'tab=tasks' });
  render('project-missing', 'dir@x.sa', 'director', h(proj.ProjectPage, { id: 'nope' }), s5);
  render('requests-director', 'dir@x.sa', 'director', h(reqs.RequestsPage), s5);
  render('requests-writer-sent', 'khalid@x.sa', 'writer', h(reqs.RequestsPage), { ...s5, search: 'tab=sent', rq: { ...rq5, requests: rq5.requests.map((q) => ({ ...q, can_decide: false })) } });
  render('requests-done', 'dir@x.sa', 'director', h(reqs.RequestsPage), { ...s5, search: 'tab=done' });
  render('requests-deleg', 'dir@x.sa', 'director', h(reqs.RequestsPage), { ...s5, search: 'tab=deleg' });
  render('requests-publisher', 'noura@x.sa', 'publisher', h(reqs.RequestsPage), { ...s5, rq: { ...rq5, requests: rq5.requests.map((q) => ({ ...q, can_decide: false })) },
    items: works5.map((x) => (x.w.id === 'CH-7' ? { ...x, w: { ...x.w, confirm_pending: true } } : x)) });
  render('home-director', 'dir@x.sa', 'director', h(home.HomePage), s5);
  render('home-writer', 'khalid@x.sa', 'writer', h(home.HomePage), s5);
  render('home-publisher', 'noura@x.sa', 'publisher', h(home.HomePage), s5);
  render('home-member', 'abd@x.sa', 'member', h(home.HomePage), s5);
  globalThis.__WK = { ctx: ctx('dir@x.sa', 'director'), ...s5, detail: null, search: '', dec };
  const w11 = works5.find((x) => x.w.id === 'CH-12').w;
  const step5Dialogs = [
    ['move', 'khalid@x.sa', 'writer', h(dayd.MoveDialog, { w: works5[6].w, at: '2026-10-14T19:00', entries, onClose() {}, act: async () => true })],
    ['due-stage', 'dir@x.sa', 'director', h(dayd.DueDialog, { w: works5[0].w, stages: works5[0].stages, si: 3, date: '2026-10-12', onClose() {}, act: async () => true })],
    ['due-delivery', 'dir@x.sa', 'director', h(dayd.DueDialog, { w: works5[0].w, stages: works5[0].stages, si: null, date: '2026-10-14', onClose() {}, act: async () => true })],
    ['task', 'dir@x.sa', 'director', h(dayd.TaskDialog, { date: '2026-10-14', tasks: plan5.tasks, onClose() {}, done: async () => {} })],
    ['task-writer', 'khalid@x.sa', 'writer', h(dayd.TaskDialog, { date: '2026-10-14', tasks: plan5.tasks, onClose() {}, done: async () => {} })],
    ['event', 'dir@x.sa', 'director', h(dayd.EventDialog, { date: '2026-10-14', project: 'p2', onClose() {}, act: async () => true })],
    ['reminder', 'abd@x.sa', 'member', h(dayd.ReminderDialog, { date: '2026-10-14', onClose() {}, act: async () => true })],
    ['task-extension', 'khalid@x.sa', 'writer', h(dayd.TaskExtensionDialog, { t: plan5.tasks[1], onClose() {}, act: async () => true })],
    ['add-director', 'dir@x.sa', 'director', h(dayd.AddDayDialog, { date: '2026-10-14', ready: [w11], onPick() {}, onClose() {} })],
    ['add-publisher', 'noura@x.sa', 'publisher', h(dayd.AddDayDialog, { date: '2026-10-14', ready: [w11], onPick() {}, onClose() {} })],
    ['add-member-past', 'abd@x.sa', 'member', h(dayd.AddDayDialog, { date: '2026-10-10', ready: [], onPick() {}, onClose() {} })],
    ['project-new', 'dir@x.sa', 'director', h(proj.ProjectDialog, { onClose() {}, onSaved: async () => {} })],
    ['project-edit', 'dir@x.sa', 'director', h(proj.ProjectDialog, { project: projects[1], onClose() {}, onSaved: async () => {} })],
  ];
  for (const [n, as, role, el] of step5Dialogs) render(`dialog-${n}`, as, role, wk(el), s5);
  return pages;
}

const page = (body, attrs = '') => `<!doctype html><html lang="ar" dir="rtl" ${attrs}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="data:,"><link rel="stylesheet" href="globals.css"><link rel="stylesheet" href="identity.css"><link rel="stylesheet" href="work.css">
<style>body{font-family:"Segoe UI",Tahoma,sans-serif}main{max-width:1400px}</style></head><body><main id="main">${body}</main></body></html>`;

(async () => {
  const pages = await renderAll();
  for (const [name, html] of Object.entries(pages)) fs.writeFileSync(path.join(out, `${name}.html`), page(html));
  fs.writeFileSync(path.join(out, 'drag.html'), page(pages['plan-simple'], 'data-identity="emerald"').replace('</body>', `<script type="module">
import { installRowDrag } from './build/lib/work/drag.js';
window.__moves = [];
installRowDrag(document.querySelector('[data-plist]'), { onMove: (f, t) => window.__moves.push([f, t]) });
window.__ready = true;
</script></body>`));
  fs.writeFileSync(path.join(out, 'drag-cal.html'), page(pages['calendar-week'], 'data-identity="emerald"').replace('</body>', `<script type="module">
import { installCellDrag } from './build/lib/work/drag.js';
window.__drops = [];
window.__clicks = 0;
document.addEventListener('click', (e) => { if (e.target.closest('[data-cdrag]')) window.__clicks++; });
installCellDrag(document.querySelector('.wk-calwrap'), { onDrop: (k, d) => window.__drops.push([k, d]) });
window.__ready = true;
</script></body>`));

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
      'list-director': ['يحتاج انتباهك', 'الفريق', 'خالد', 'طلب بانتظار الإسناد'],
      'list-all': ['منشور اليوم الوطني: شكراً لفريقنا', 'CH-1', 'نسخ المنصات (خالد) · المرئيات (سارة) · متأخرة', 'بانتظار اعتماد 3 أجزاء', 'لوحة الحالات', 'مقيّد'],
      'list-writer': ['مهامي', 'إنشاء عمل'],
      'list-member': ['طلباتي', 'طلب تغطية يوم التطوع', 'طلب جديد'],
      'list-empty': ['لا أعمال بعد', 'CH-1'],
      'item-writer': ['إنهاء مرحلة «نسخ المنصات»', 'إرسال للمراجعة', 'نقطة اعتماد', 'الإصدار 2', 'عدّله', 'ملف في مجلد لا تصل إليه', 'طلب منشور شكر', 'سجل العمل', 'طلب تمديد'],
      'item-designer': ['إنهاء مرحلة «المرئيات»', 'الإنتاج والإرسال للمراجعة: خالد'],
      'item-director-review': ['مراجعة واعتماد', 'افتح شاشة المراجعة', 'دورات المراجعة'],
      'item-closed': ['أغلقه', 'أُلغي الحدث'],
      'item-missing': ['العمل غير موجود'],
      'create-types': ['منشور اجتماعي', 'تغطية حدث', 'مشروع', 'تحويل إلى عمل'],
      'create-post': ['خطة المراحل', 'كتابة النص', 'تلقائي', 'بلا مسؤول الآن (يبقى طلباً)', 'إرسال الطلب', 'إنستغرام · الرسمي', 'حمل الفريق الآن'],
      'create-writer-video': ['أنا المسؤول', 'اتركه للقادة', 'المدة التقريبية', 'حفظ مسودة', 'إنشاء وبدء الإنتاج', 'يوتيوب · الرسمي'],
      'create-member': ['طلب جديد', 'إرسال الطلب', 'يوم الحدث ووقته'],
      'create-publisher': ['إنشاء العمل غير متاح لدورك'],
      'plan-simple': ['المحرر البسيط', 'المعاينة الزمنية', 'حفظ الخطة'],
      'plan-free': ['اجعلها متتابعة', 'رجوعاً من التسليم', 'تدقيق لغوي', 'حفظ الخطة قالباً', 'فيديو قصير بمراجعة قانونية', 'نقطة اعتماد'],
      'dialog-submit': ['ما سيُراجع', 'يوتيوب', 'موعد النشر المقترح'],
      'dialog-close': ['السبب', 'إغلاق العمل'],
      'dialog-text': ['نسخة X', 'الحد المقترح 240 حرفاً'],
      'dialog-details': ['مواعيد المراحل', 'الأولوية'],
      'dialog-assign': ['ريم', 'نشطة'],
      'dialog-extension': ['الموعد الجديد', 'السبب'],
      'approvals-director': ['الموافقات والنشر', 'بانتظار قراري', 'فيديو قصص الملتقى', 'أرسلها أحمد', 'مراجعة', 'في المراجعة ولا تقرر فيها', 'بيان الشراكة للمراجعة'],
      'approvals-writer': ['بانتظار القرار', 'أرسلتها أنا'],
      'approvals-publish': ['النشر في هذه المرحلة محاكاة', 'جاهز للنشر', 'مجدول', 'نشر جزئي أو فشل', 'منشور', 'مواعيد معرضة للخطر', 'جدولة', 'إعادة المحاولة للفاشلة', 'تغيير الموعد', 'بتأكيد قبل النشر', 'اعتمده محمد', 'إعادة الربط'],
      'approvals-publish-lead': ['الجدولة والنشر لمسؤول النشر', 'إدارة الحسابات المرتبطة'],
      'review-director': ['أنت تراجع', 'الدورة 1', 'جاهز للمراجعة', 'ما تغيّر منذ الإصدار المعتمد', 'تغيّر بعد اعتماده', 'اعتماد هذا الجزء', 'طلب تعديل عليه', 'فيديو الملتقى', 'v2', 'موعد النشر', 'المنصات والحسابات', 'اعتماد الأجزاء المعلّقة (4)', 'رفض العمل', 'لا يُنشر تلقائياً', 'معتمد ولم يتغيّر'],
      'review-writer': ['عرض للمراجعة', 'القرار لمدير الاتصال ومساعده'],
      'review-self': ['لا تعتمد ما أرسلته أو رفعته بنفسك'],
      'review-package': ['الحزمة كاملة', 'اعتماد الحزمة كاملة', 'يُعتمد حزمة كاملة'],
      'channels-director': ['الحسابات المرتبطة', 'إضافة حساب', 'يوتيوب', 'يقبل الفيديو فقط', 'صندوق القسم', 'تعديل', 'إيقاف', 'حذف', 'التفويض منتهٍ'],
      'channels-publisher': ['إعادة الربط', 'لك إعادة ربط الحسابات'],
      'channels-writer': ['الحسابات المرتبطة لمن يديرها وينشر عليها'],
      'item-publisher': ['جدولة الإرسال', 'إرسال الآن من البريد'],
      'notices': ['الإشعارات', 'يحتاج قرارك', 'يحتاج انتباهك', 'للعلم', 'تعليم الكل كمقروء', 'لا تُنجز العمل'],
      'dialog-schedule': ['تغيير الموعد', 'الموعد المعتمد', 'التفويض ينتهي قبل الموعد', 'اسألني قبل النشر'],
      'dialog-pubnow': ['محاكاة', 'التفويض منتهٍ: سيفشل', 'نشر الآن'],
      'dialog-changes': ['على أي جزء؟', 'ملاحظات زمنية تُرفق بالطلب', '00:32'],
      'dialog-reject': ['السبب', 'أغلق العمل أيضاً', 'تأكيد الرفض'],
      'dialog-account-add': ['المنصة', 'إضافة وربط الحساب', '60 يوماً'],
      'dialog-account-busy': ['لا يُحذف', 'CH-7'],
      // Step 5
      'calendar-week': ['التقويم', '11 أكتوبر إلى 17 أكتوبر 2026', 'مراحل ومهام ممتدة', 'إنستغرام · الرسمي', 'X · الرسمي', 'التفويض منتهٍ', 'التسليم والمهام', 'حمل الفريق', 'منشور الملتقى المجدول', 'ملتقى الشركاء', 'اليوم الوطني 2026', 'التفويض لا يغطي الموعد', 'النشر في هذه المرحلة محاكاة', 'اسحب موعد نشر إلى يوم آخر لطلب نقله، واسحب التسليم أو المرحلة', 'سارة · المرئيات', 'أحمد · تغطية يومية للمعرض'],
      'calendar-month': ['أكتوبر 2026', 'الأحد', 'السبت', 'منشور الملتقى المجدول'],
      'calendar-day': ['الأربعاء 14 أكتوبر 2026', 'منشور الملتقى المجدول', 'قريب من «منشور معتمد قريب»', 'معتمد · لم يُجدول', 'إضافة في هذا اليوم', 'ملتقى الشركاء'],
      'calendar-agenda': ['من 12 أكتوبر لمدة أسبوعين', 'اليوم', 'افتح أي موعد لترى تفاصيله', 'طوال اليوم'],
      'calendar-member': ['التقويم', 'إضافة'],
      'calendar-project': ['اليوم الوطني 2026', 'فرز الصور'],
      'drawer-pub-writer': ['مجدول', 'طلب نقل الموعد', 'التفويض لا يغطي الموعد', 'فتح العمل', 'بتوقيت الرياض'],
      'drawer-move-director': ['موعد مطلوب', 'اعتماد الموعد الجديد', 'سحب طلب النقل', 'طلب خالد نقل الموعد'],
      'drawer-move-self': ['أرسلتَ هذا العمل للمراجعة بنفسك', 'سحب طلب النقل'],
      'drawer-pubok-publisher': ['معتمد · لم يُجدول', 'جدولة في الموعد المعتمد', 'طلب نقل الموعد'],
      'drawer-stage-designer': ['المرئيات', 'طلب تمديد'],
      'drawer-due-director': ['تغيير موعد التسليم', 'تسليم خالد'],
      'drawer-task': ['طلب تمديد', 'صفحة المهام', 'من ريم إلى خالد'],
      'drawer-rem': ['تذكير خاص بك، لا يراه غيرك', 'حذف التذكير'],
      'projects-director': ['المشاريع', 'مشروع جديد', 'اليوم الوطني 2026', 'ملتقى الشركاء 2026', 'فتح المشروع', 'من المراحل والمهام منجزة', 'جارٍ'],
      'projects-writer': ['المشاريع', 'فتح المشروع'],
      'projects-empty': ['لا مشاريع بعد'],
      'project-timeline': ['العودة إلى المشاريع', 'الجدول الزمني', 'من يعمل على ماذا', 'فيديو قصص الملتقى', 'مهام المشروع', 'تغطية يومية للمعرض', 'الأحداث', 'ملتقى الشركاء', 'عمل في المشروع', 'تعديل المشروع', 'في التقويم', 'تنتظر غيرها'],
      'project-people': ['مسؤول المشروع', 'ريم', 'ثم إلى', 'بعد'],
      'project-works': ['منشور اليوم الوطني: شكراً لفريقنا', 'تصميم ملصق الشتاء', 'المهام التي تظهر لك'],
      'project-tasks': ['كتابة التعليقات', 'طلب تمديد', 'تنتظر', 'مهمة في المشروع'],
      'project-missing': ['المشروع غير موجود'],
      'requests-director': ['الطلبات', 'بانتظار قراري', 'طلب تمديد «المرئيات»', 'منح «عرض فقط»', 'اعتماد', 'رفض', 'طلب عمل: «طلب تغطية يوم التطوع»', 'إسناد', 'نقل موعد «منشور نقل موعده»', 'اعتماد الموعد الجديد', 'بريد خارجي: «رد على طلب الشراكة»', 'افتح في البريد', 'طلب جديد'],
      'requests-writer-sent': ['طلباتي', 'طلب تمديد مهمة «كتابة التعليقات»', 'سحب الطلب', 'نقل موعد «منشور نقل موعده»', 'أرسلته أنت'],
      'requests-done': ['المنتهية', 'اعتُمد', 'ومُدّ التسليم النهائي'],
      'requests-deleg': ['تفويض الاعتماد أثناء الغياب', 'يأتي لاحقاً'],
      'requests-publisher': ['تأكيد نشر «منشور الملتقى المجدول»', 'التأكيد في «النشر»'],
      'home-director': ['صباح الخير، محمد', 'بانتظار المراجعة', 'طلبات بلا مسؤول', 'حمل الفريق', 'الأيام السبعة القادمة', 'فيديو قصص الملتقى'],
      'home-writer': ['أعمالي النشطة', 'مراحلي الجاهزة', 'أولويات عملك'],
      'home-publisher': ['جاهز للنشر', 'بانتظار تأكيدك', 'جاهزيتك للنشر', 'تحتاج انتباهك'],
      'home-member': ['طلباتي المفتوحة', 'طلب جديد'],
      'dialog-move': ['طلب نقل موعد النشر', 'الموعد الجديد', 'التفويض لا يغطي الموعد', 'خلال ساعتين من الموعد الجديد', 'إرسال طلب النقل'],
      'dialog-due-stage': ['موعد مرحلة «التدقيق»', 'تنتظر', 'موعد داخلي لا يحتاج اعتماداً'],
      'dialog-due-delivery': ['موعد التسليم', 'بعد التسليم الجديد'],
      'dialog-task': ['مهمة جديدة', 'أيام متصلة', 'أيام محددة', 'إلى من', 'تبدأ بعد إنجاز', 'إسناد المهمة'],
      'dialog-task-writer': ['المهمة لك'],
      'dialog-event': ['حدث جديد', 'يمكن أن يمتد أياماً', 'إضافة الحدث'],
      'dialog-reminder': ['تذكير لي', 'لا يراه غيرك'],
      'dialog-task-extension': ['طلب تمديد مهمة', 'كتابة التعليقات'],
      'dialog-add-director': ['إضافة في الأربعاء 14 أكتوبر', 'عمل يُسلَّم في هذا اليوم', 'تغطية حدث في هذا اليوم', 'مهمة', 'اجتماع أو معرض', 'تذكير لي'],
      'dialog-add-publisher': ['جدولة عمل جاهز للنشر', '1 أعمال معتمدة'],
      'dialog-add-member-past': ['طلب يُسلَّم في هذا اليوم', 'يوم مضى'],
      'dialog-project-new': ['مشروع جديد', 'خطة الأعمال', 'عمل في الخطة', 'إنشاء المشروع'],
      'dialog-project-edit': ['تعديل المشروع', 'حفظ'],
    };
    const absent = {
      'list-writer': ['الطلبات', 'كل الأشخاص'],
      'list-member': ['كل الأشخاص', 'لوحة الفريق'],
      'item-designer': ['إغلاق العمل', 'تقييد الرؤية'],
      'item-writer': ['اعتماد المرحلة'],
      'create-member': ['خطة المراحل', 'المشاركون'],
      'approvals-writer': ['في المراجعة ولا تقرر فيها'],
      'approvals-publish-lead': ['إعادة المحاولة للفاشلة', 'انشر الآن'],
      'review-writer': ['اعتماد هذا الجزء', 'رفض العمل'],
      'review-self': ['اعتماد هذا الجزء', 'رفض العمل'],
      'review-package': ['اعتماد هذا الجزء'],
      'channels-publisher': ['إضافة حساب', 'إيقاف'],
      'channels-writer': ['إعادة الربط'],
      // Step 5: what a role must not see
      'calendar-agenda': ['واسحب التسليم أو المرحلة'],
      'calendar-member': ['اسحب موعد نشر'],
      'calendar-project': ['تغطية يومية للمعرض'],
      'drawer-pub-writer': ['جدولة في الموعد المعتمد', 'تغيير موعد التسليم'],
      'drawer-move-self': ['اعتماد الموعد الجديد'],
      'drawer-stage-designer': ['تغيير موعد المرحلة'],
      'projects-writer': ['مشروع جديد'],
      'project-works': ['تعديل المشروع', 'حدث'],
      'requests-writer-sent': ['منح «عرض فقط»', 'إسناد'],
      'requests-publisher': ['منح «عرض فقط»'],
      'home-director': ['الحملة النشطة', 'أعمال في النموذج'],
      'home-writer': ['حمل الفريق', 'الحملة النشطة'],
      'home-member': ['حمل الفريق'],
      'dialog-task-writer': ['إلى من'],
      'dialog-add-director': ['جدولة عمل جاهز للنشر'],
      'dialog-add-publisher': ['عمل يُسلَّم في هذا اليوم'],
      'dialog-add-member-past': ['اجتماع أو معرض', 'جدولة عمل جاهز للنشر'],
      'dialog-project-edit': ['خطة الأعمال'],
    };
    const looks = [['a', ''], ['emerald', 'data-identity="emerald"'], ['evening', 'data-identity="emerald" data-theme="dark"']];
    for (const name of Object.keys(pages)) {
      for (const [look, attrs] of looks) {
        for (const [vw, vh] of [[1280, 900], [390, 844]]) {
          if (look !== 'a' && vw === 390 && !['list-all', 'item-writer', 'create-post', 'plan-free', 'approvals-publish', 'review-director', 'calendar-agenda', 'calendar-week', 'project-timeline', 'requests-director', 'home-director'].includes(name)) continue;
          if (look !== 'a' && vw === 1280 && !['list-director', 'item-writer', 'create-post', 'plan-free', 'approvals-publish', 'review-director', 'channels-director', 'notices', 'calendar-week', 'calendar-month', 'projects-director', 'project-timeline', 'requests-director', 'home-director', 'drawer-move-director'].includes(name)) continue;
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
            for (const t of absent[name] ?? []) check(`${name}: does not show «${t}»`, !text.includes(t));
            const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text);
            check(`${name}: no emoji`, !emoji);
          }
          if (['list-director', 'list-all', 'item-writer', 'create-post', 'plan-free', 'dialog-submit', 'approvals-director', 'approvals-publish', 'review-director', 'channels-director', 'notices', 'dialog-schedule',
            'calendar-week', 'calendar-month', 'calendar-day', 'calendar-agenda', 'drawer-move-director', 'projects-director', 'project-timeline', 'project-people', 'requests-director', 'home-director', 'dialog-task', 'dialog-project-new', 'dialog-move'].includes(name) && (look === 'a' || vw === 1280))
            await p.screenshot({ path: path.join(out, `${name}.${look}.${vw}.png`), fullPage: true });
          await context.close();
        }
      }
    }

    // ---------- the drag engine on the rendered plan rows ----------
    const ctxD = await browser.newContext({ viewport: { width: 1280, height: 1100 }, hasTouch: true });
    const pd = await ctxD.newPage();
    const derr = [];
    pd.on('pageerror', (e) => derr.push(e.message));
    await pd.goto(base + 'drag.html');
    await pd.waitForFunction(() => window.__ready === true);
    const grips = await pd.$$('[data-plist] [data-pdrag]');
    const rowsBox = await pd.$$eval('[data-plist] > [data-prow]', (rs) => rs.map((r) => { const b = r.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, mid: b.top + b.height / 2 }; }));
    check('drag: the finished stage has no grip', grips.length === rowsBox.length - 1, `${grips.length} grips for ${rowsBox.length} rows`);
    const gripOf = async (i) => pd.$eval(`[data-plist] > [data-prow="${i}"] [data-pdrag]`, (g) => { const b = g.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
    // Mouse: «نسخ المنصات» (row 1) below «التدقيق» (row 3).
    let g = await gripOf(1);
    await pd.mouse.move(g.x, g.y);
    await pd.mouse.down();
    await pd.mouse.move(g.x, rowsBox[3].mid + 6, { steps: 8 });
    const mid = await pd.evaluate(() => ({
      dragging: !!document.querySelector('[data-prow="1"].dragging'),
      mark: !!document.querySelector('[data-prow="3"].drop-after'),
    }));
    check('drag: while dragging, the row fades and the target shows where it lands', mid.dragging && mid.mark, JSON.stringify(mid));
    await pd.mouse.up();
    check('drag: a mouse drag down moves the stage to the end', JSON.stringify(await pd.evaluate(() => window.__moves)) === '[[1,3]]', JSON.stringify(await pd.evaluate(() => window.__moves)));
    check('drag: the marks are cleared on release', await pd.evaluate(() => !document.querySelector('.drop-before,.drop-after,.dragging')));
    // Mouse: «التدقيق» (row 3) above «المرئيات» (row 2).
    g = await gripOf(3);
    await pd.mouse.move(g.x, g.y);
    await pd.mouse.down();
    await pd.mouse.move(g.x, rowsBox[2].top + 3, { steps: 6 });
    await pd.mouse.up();
    check('drag: a mouse drag up moves the stage above the row it is dropped on', JSON.stringify(await pd.evaluate(() => window.__moves[1])) === '[3,2]', JSON.stringify(await pd.evaluate(() => window.__moves)));
    // Touch: «المرئيات» (row 2) to the top, by finger.
    g = await gripOf(2);
    const cdp = await ctxD.newCDPSession(pd);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: g.x, y: g.y }] });
    for (let k = 1; k <= 8; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: g.x, y: g.y + ((rowsBox[0].top + 4 - g.y) * k) / 8 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await pd.waitForTimeout(100);
    check('drag: a touch drag moves the stage too (the grip does not scroll the page)', JSON.stringify(await pd.evaluate(() => window.__moves[2])) === '[2,0]', JSON.stringify(await pd.evaluate(() => window.__moves)));
    // A quick tap on a grip moves nothing.
    g = await gripOf(1);
    await pd.mouse.click(g.x, g.y);
    check('drag: a click on the grip alone moves nothing', (await pd.evaluate(() => window.__moves.length)) === 3);
    check('drag: no page errors', !derr.length, derr.join(' | '));
    await ctxD.close();

    // ---------- the calendar drag engine on the rendered week (Step 5) ----------
    const ctxC = await browser.newContext({ viewport: { width: 1400, height: 1100 }, hasTouch: true });
    const pc = await ctxC.newPage();
    const cerr = [];
    pc.on('pageerror', (e) => cerr.push(e.message));
    await pc.goto(base + 'drag-cal.html');
    await pc.waitForFunction(() => window.__ready === true);
    const chipInfo = await pc.evaluate(() => {
      const c = [...document.querySelectorAll('[data-cdrag]')].find((x) => x.dataset.cdrag.startsWith('pub|'));
      const cell = c.closest('[data-drop]');
      const b = c.getBoundingClientRect();
      const target = [...document.querySelectorAll('.cw-cell[data-drop]')].find((x) => x.dataset.drop !== cell.dataset.drop && x.dataset.drop > cell.dataset.drop);
      const tb = target.getBoundingClientRect();
      return { key: c.dataset.cdrag, from: cell.dataset.drop, x: b.left + b.width / 2, y: b.top + b.height / 2, to: target.dataset.drop, tx: tb.left + tb.width / 2, ty: tb.top + tb.height / 2,
        draggable: document.querySelectorAll('[data-cdrag]').length, chips: document.querySelectorAll('.wk-cchip').length };
    });
    check('calendar drag: a leader can drag publishing and delivery entries, not every entry', chipInfo.draggable > 0 && chipInfo.draggable < chipInfo.chips, `${chipInfo.draggable} of ${chipInfo.chips}`);
    await pc.mouse.move(chipInfo.x, chipInfo.y);
    await pc.mouse.down();
    await pc.mouse.move(chipInfo.tx, chipInfo.ty, { steps: 10 });
    const cmid = await pc.evaluate((to) => ({ dragging: !!document.querySelector('.wk-cchip.dragging'), over: document.querySelector('.dropok')?.dataset.drop === to }), chipInfo.to);
    check('calendar drag: while dragging, the entry fades and the target day is marked', cmid.dragging && cmid.over, JSON.stringify(cmid));
    await pc.mouse.up();
    await pc.waitForTimeout(50);
    const after1 = await pc.evaluate(() => ({ drops: window.__drops, clicks: window.__clicks, marks: !!document.querySelector('.dropok,.dragging') }));
    check('calendar drag: a mouse drag drops the publishing entry on the new day', JSON.stringify(after1.drops) === JSON.stringify([[chipInfo.key, chipInfo.to]]), JSON.stringify(after1.drops));
    check('calendar drag: the drag does not also open the entry', after1.clicks === 0, `clicks ${after1.clicks}`);
    check('calendar drag: the marks are cleared on release', !after1.marks);
    await pc.mouse.click(chipInfo.x, chipInfo.y);
    const after2 = await pc.evaluate(() => ({ drops: window.__drops.length, clicks: window.__clicks }));
    check('calendar drag: a click without moving opens the entry and moves nothing', after2.drops === 1 && after2.clicks === 1, JSON.stringify(after2));
    const cdpC = await ctxC.newCDPSession(pc);
    await cdpC.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: chipInfo.x, y: chipInfo.y }] });
    for (let k = 1; k <= 10; k++) await cdpC.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: chipInfo.x + ((chipInfo.tx - chipInfo.x) * k) / 10, y: chipInfo.y + ((chipInfo.ty - chipInfo.y) * k) / 10 }] });
    await cdpC.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await pc.waitForTimeout(100);
    const after3 = await pc.evaluate(() => window.__drops);
    check('calendar drag: a touch drag drops it too', after3.length === 2 && after3[1][1] === chipInfo.to, JSON.stringify(after3));
    check('calendar drag: no page errors', !cerr.length, cerr.join(' | '));
    await ctxC.close();
  } catch (e) {
    result.errors.push(e.stack);
  } finally {
    await browser.close();
    server.close();
  }
  const failed = result.checks.filter((c) => !c.pass);
  result.summary = { total: result.checks.length, passed: result.checks.length - failed.length, failed: failed.length };
  fs.writeFileSync(path.join(__dirname, 'work-pages.json'), JSON.stringify(result, null, 2));
  console.log(`${result.summary.passed} of ${result.summary.total} passed`);
  for (const f of failed) console.log('FAIL', f.name, f.detail.slice(0, 300));
  for (const e of result.errors) console.log('ERROR', e);
  process.exit(failed.length || result.errors.length ? 1 : 0);
})();

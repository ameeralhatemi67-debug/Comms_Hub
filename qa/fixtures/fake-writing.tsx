// Stand-ins for qa/writing-flow.cjs: the database, the work provider and the routes under /api/writing, so the real sheet runs on a
// fixture page. A signed-in page cannot be driven by a check and no bypass is allowed. The save route's stand-in runs the same
// `checkDoc` as the real one, so a document the editor makes and the server would refuse fails here.
import { useSyncExternalStore } from 'react';
import { checkDoc, docText } from '../../src/lib/writing/doc';
import { setPlatformRegistry } from '../../src/lib/work/rules';

const q = new URLSearchParams(location.search);
export const ME = q.get('me') ?? 'wri@example.test';
export const ROLE = q.get('role') ?? 'writer';

const people = [
  { email: 'dir@example.test', display_name: 'محمد', role: 'director', avatar: null },
  { email: 'ast@example.test', display_name: 'ريم', role: 'assistant', avatar: null },
  { email: 'wri@example.test', display_name: 'خالد', role: 'writer', avatar: null },
  { email: 'pro@example.test', display_name: 'لمى', role: 'producer', avatar: null },
  { email: 'pub@example.test', display_name: 'نورة', role: 'publisher', avatar: null },
];
const nameOf = (e: string | null | undefined) => people.find((p) => p.email === e)?.display_name ?? e ?? '';
const platform = (key: string, label_ar: string, sort: number, accepts: Record<string, unknown> = {}) => ({ key, label_ar, kind: 'social', sort, accepts, publish_mode: 'assisted', scheduling: true, requires_review: false, token_life_days: 60, enabled: true, builtin: true, docs_url: null, readiness: 'not_started', readiness_note: null, readiness_at: null, readiness_by: null });
const platforms = [platform('instagram', 'إنستغرام', 1, { max_chars: 2200, fold_chars: 125 }), platform('x', 'X', 2, { max_chars: 280 }), platform('linkedin', 'لينكدإن', 3, { max_chars: 3000 }), platform('youtube', 'يوتيوب', 4, { video_only: true, max_chars: 5000 })];
const account = (id: string, p: string) => ({ id, platform: p, label: 'الرسمي', handle: '@org', purpose: '', authorized_until: null, publishers: [], mode: 'ask', active: true, fixed: false, conn_kind: 'simulated', conn_state: 'ok', conn_checked_at: null, conn_error: null, external_id: null, external_name: null, scopes: [] });
const accounts = [account('a-ig', 'instagram'), account('a-x', 'x'), account('a-yt', 'youtube'), account('a-li', 'linkedin')];

const para = (t: string) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] });
const v1 = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'المؤسسة توقّع اتفاقية شراكة' }] }, para('تشمل الاتفاقية ثلاثة برامج تدريبية.')] };
const v2 = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'المؤسسة توقّع اتفاقية شراكة' }] }, para('تشمل الاتفاقية ثلاثة برامج تدريبية، ويبدأ البرنامج الأول في يناير.'), { type: 'blockquote', content: [para('نؤمن بالشباب، قال الرئيس التنفيذي.')] }] };
const script = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'قصص الملتقى' }] }, para('لقطة واسعة للقاعة قبل بدء الجلسة.'), para('فقرة ثانية من النص.')] };

type Row = Record<string, unknown>;
const stage = (id: string, pos: number, name: string, role: string, who: string, extra: Row = {}) => ({ id, work_id: 'x', pos, name, role, who, start_on: '2026-10-13', due_on: '2026-10-14', after_pos: [], days: 1, note: null, gate: false, gate_by: null, gate_at: null, started_at: null, done_at: null, done_by: null, ...extra });
const version = (n: number, doc: unknown, note: string) => ({ n, body: docText(doc as never), note, author: 'wri@example.test', created_at: `2026-10-1${n}T09:00:00Z`, master_ref: `drive-${n}`, pruned_at: null, keep: n === 1 });

export const db = {
  ideas: [{ id: 'i1', body: 'سلسلة قصص قصيرة\nثلاث قصص من الموظفين', tag: 'اليوم الوطني', author: 'wri@example.test', work_id: null, created_at: '2026-10-10T08:00:00Z' }, { id: 'i2', body: 'فكرة صارت عملاً', tag: null, author: 'wri@example.test', work_id: 'CH-10', created_at: '2026-10-09T08:00:00Z' }] as Row[],
  calls: [] as { name: string; args: Row }[],
  says: [] as string[],
  masters: { 'CH-10:1': v1, 'CH-10:2': v2 } as Record<string, unknown>,
  remote: {} as Record<string, unknown>,
  saved: [] as { doc: unknown; note: string }[],
  exports: [] as { kind: string; size: number; head: string }[],
  refused: [] as string[],
  images: [] as { size: number; type: string }[],
  works: {
    'CH-2': {
      w: { id: 'CH-2', title: 'فيديو قصص الملتقى', type: 'video', status: 'IN_PRODUCTION', assignee: 'pro@example.test', requester: 'ast@example.test', brief: 'فيديو من دقيقتين يروي ثلاث قصص من الملتقى.', channels: ['a-yt', 'a-ig'], people: [], closed_at: null, review_cycle: null, research: '', due: '2026-10-22' },
      stages: [stage('s1', 0, 'النص', 'writer', 'wri@example.test', { due_on: '2026-10-11' }), stage('s2', 1, 'التصوير', 'producer', 'pro@example.test')],
      texts: [], variants: [], approvals: [], flags: [], cycles: [], decisions: [], comments: [], log: [], projects: [], assets: [], parts: [], pending: [], decideBlock: '', mail: [], chats: [{ id: 'room-1', name: 'مجموعة' }], extensions: [], notes: [],
    },
    'CH-10': {
      w: { id: 'CH-10', title: 'بيان الشراكة', type: 'press', status: 'CHANGES_REQUESTED', assignee: 'wri@example.test', requester: 'dir@example.test', brief: 'بيان عن توقيع اتفاقية الشراكة.', channels: ['a-x', 'a-li'], people: [], closed_at: null, review_cycle: null, research: 'الأرقام من الإدارة التنفيذية.', due: '2026-10-16' },
      stages: [stage('s3', 0, 'كتابة البيان', 'writer', 'wri@example.test')],
      texts: [version(1, v1, 'الصياغة الأولى'), version(2, v2, 'أضفت الاقتباس')],
      variants: [{ platform: 'x', n: 1, body: 'وقّعت المؤسسة اتفاقية شراكة.', base: 1, author: 'wri@example.test', created_at: '2026-10-11T10:00:00Z' }],
      approvals: [],
      flags: [],
      cycles: [{ n: 1, sent_by: 'wri@example.test', sent_at: '2026-10-11T10:05:00Z', note: null }],
      decisions: [],
      comments: [], log: [], projects: [], assets: [], parts: [], pending: [], decideBlock: '', mail: [], chats: [], extensions: [],
      notes: [
        { id: 'n1', cycle: 1, part: 'text', quote: 'ثلاثة برامج تدريبية', body: 'أصبحت أربعة برامج.', author: 'ast@example.test', created_at: '2026-10-11T15:10:00Z', resolved_at: null },
        { id: 'n2', cycle: 1, part: 'v:x', quote: null, body: 'أضف رابط البيان.', author: 'ast@example.test', created_at: '2026-10-11T15:11:00Z', resolved_at: null },
      ],
    },
    'CH-20': {
      w: { id: 'CH-20', title: 'عمل قيد المراجعة', type: 'press', status: 'IN_REVIEW', assignee: 'wri@example.test', requester: null, brief: '', channels: [], people: [], closed_at: null, review_cycle: 1, research: '', due: '2026-10-16' },
      stages: [], texts: [version(1, v1, 'الصياغة الأولى')], variants: [], approvals: [], flags: [], cycles: [{ n: 1, sent_by: 'wri@example.test', sent_at: '2026-10-11T10:05:00Z', note: null }], decisions: [], comments: [], log: [], projects: [], assets: [], parts: [], pending: [], decideBlock: '', mail: [], chats: [], extensions: [], notes: [],
    },
  } as Record<string, Record<string, unknown> & { w: Row; texts: ReturnType<typeof version>[]; variants: Row[]; notes: Row[] }>,
};
db.masters['CH-2:0'] = script;
db.works['CH-21'] = {
  ...db.works['CH-20'],
  w: { ...db.works['CH-20'].w, id: 'CH-21', title: 'بيان للمراجعة', review_cycle: 2 },
  texts: [version(1, v1, 'الصياغة الأولى'), version(2, v2, 'أضفت الاقتباس')],
  cycles: [{ n: 1, sent_by: 'wri@example.test', sent_at: '2026-10-10T10:05:00Z', note: null, text_n: 1 }, { n: 2, sent_by: 'wri@example.test', sent_at: '2026-10-11T10:05:00Z', note: null, text_n: 2 }],
  parts: [{ key: 'text', label: 'نص البيان', ver: 't2', kind: 'text', snap: docText(v2 as never) }],
  pending: [{ key: 'text', label: 'نص البيان', ver: 't2', kind: 'text', snap: docText(v2 as never) }],
  notes: [],
};
db.masters['CH-21:1'] = v1;
db.masters['CH-21:2'] = v2;
for (const x of Object.values(db.works)) Object.assign(x.w, { priority: 'normal', restricted: false, created_by: x.w.requester ?? 'dir@example.test', no: Number(String(x.w.id).slice(3)), move_from: null, proposed_at: null, sched_at: null, confirm_pending: false, type: x.w.type });
(window as unknown as { __db: typeof db }).__db = db;

let version0 = 0;
const listeners = new Set<() => void>();
export const changed = () => {
  version0++;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export const useTick = () => useSyncExternalStore(subscribe, () => version0);

async function rpc(name: string, args: Row) {
  db.calls.push({ name, args });
  const work = db.works[String(args.p_work)];
  if (name === 'work_note_resolve') {
    const n = Object.values(db.works).flatMap((x) => x.notes).find((y) => y.id === args.p_id);
    if (n) n.resolved_at = '2026-11-02T10:00:00Z';
  }
  if (name === 'work_text_save' && work) work.variants.push({ platform: args.p_target, n: work.variants.length + 1, body: args.p_body, base: work.texts.length, author: ME, created_at: '2026-11-02T10:00:00Z' });
  if (name === 'work_withdraw' && work) work.w.status = 'CHANGES_REQUESTED';
  if (name === 'chat_open_dm') return { data: 'room-dm', error: null };
  if (name === 'work_note_add' && work) work.notes.push({ id: `n${db.calls.length}`, cycle: work.w.review_cycle, part: args.p_part, quote: args.p_quote, body: args.p_body, author: ME, created_at: '2026-11-02T10:00:00Z', resolved_at: null });
  if (name === 'idea_add') db.ideas.unshift({ id: `i${db.calls.length}`, body: args.p_body, tag: args.p_tag, author: ME, work_id: null, created_at: '2026-11-02T10:00:00Z' });
  if (name === 'idea_remove') db.ideas = db.ideas.filter((i) => i.id !== args.p_id);
  if (name === 'work_text_search') return { data: [{ work_id: 'CH-10', title: 'بيان الشراكة', part: 'text', platform: null, n: 2, snippet: `…${String(args.p_q)} تدريبية…` }], error: null };
  changed();
  return { data: null, error: null };
}

export const supabase = () => ({
  rpc,
  from: (table: string) => ({
    select: () => ({
      order: () => {
        const rows = table === 'ideas' ? db.ideas : [{ id: 'p1', title: 'نبذة عن المؤسسة', doc: { type: 'doc', content: [para('مؤسسة وطنية تعمل على تمكين الشباب.')] } }];
        const answer = Promise.resolve({ data: rows, error: null });
        return Object.assign(answer, { limit: () => answer });
      },
    }),
  }),
});

const say = (text: string) => {
  db.says.push(text);
  changed();
};
const call = async (fn: string, args: Row) => {
  const r = await rpc(fn, args);
  return r.error ? { ok: false as const, error: 'تعذّر التنفيذ.' } : { ok: true as const, data: r.data };
};
setPlatformRegistry(platforms as never);
export function useWork() {
  return { status: 'ready' as const, me: ME, role: ROLE, isAdmin: false, today: '2026-10-12', people, nameOf, personOf: (e: string) => people.find((p) => p.email === e), load: [], projects: [], accounts, platforms, templates: [], reloadBase: async () => undefined, call, say };
}

const PX = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
export const libraryFiles = async (q = '') =>
  [
    { id: '11111111-2222-4333-8444-555555555551', name: 'ملصق الملتقى', kind: 'image', current_version: 3, stage: 'review' },
    { id: '11111111-2222-4333-8444-555555555552', name: 'لقطات القاعة', kind: 'video', current_version: 2, stage: 'review' },
    { id: '11111111-2222-4333-8444-555555555553', name: 'دليل الهوية', kind: 'document', current_version: 4, stage: 'ready' },
  ].filter((f) => !q || f.name.includes(q));

// What the pages read, for the page fixture.
const ask = async () => undefined;
const listItems = () => Object.values(db.works).map((x) => ({ w: x.w, stages: (x.stages as Row[]).map((s) => ({ ...s, work_id: x.w.id })), projects: [], flags: x.notes.length, pending: 0, pendingKeys: [] }));
export function useWorkList() {
  useTick();
  return { items: listItems(), status: 'ready', reload: ask };
}
const copyTask = { id: 't1', what: 'كتابة عنوان ووصف «ملصق الملتقى»', kind: 'copy', assignee: 'wri@example.test', assigned_by: 'pub@example.test', due: '2026-10-11T10:00:00Z', start_on: null, after_ids: [], status: 'open', note: null, project_id: null, work_id: null, group_key: null, priority: 'normal', asset_id: '11111111-2222-4333-8444-555555555551' };
export const usePlanData = () => ({ tasks: [copyTask], events: [], reminders: [], status: 'ready', reload: ask });
export const useWritingMarks = () => ({ latest: { 'CH-10': 2, 'CH-20': 1, 'CH-21': 2 }, copies: [{ work_id: 'CH-10', platform: 'x', n: 1, base: 1 }], tasks: [copyTask] });
export const useWorkDocs = () => [{ work_id: 'CH-10', word_n: 2, pdf_n: 1, text_ref: 'r', updated_at: '2026-10-12T09:00:00Z' }];
export function useWorkDetail(id: string) {
  useTick();
  return { detail: db.works[id], status: db.works[id] ? 'ready' : 'missing', reload: async () => changed() };
}
export const useDecisions = () => ({ cycles: [], decisions: [], reload: ask });
export const fileNotes = async () => [];
export const addFileNote = async () => null;
export const useAccount = () => ({ email: ME, role: ROLE, pages: ['create', 'work'], caps: [] });
export const HomePermissions = () => null;

// The routes.
const realFetch = window.fetch.bind(window);
const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
window.fetch = async (input, init) => {
  const url = new URL(String(input), location.href);
  const m = url.pathname.match(/^\/api\/writing\/([^/]+)\/([a-z]+)/);
  if (url.pathname.startsWith('/api/media/')) return new Response(Uint8Array.from(atob(PX.split(',')[1]), (c) => c.charCodeAt(0)), { headers: { 'Content-Type': 'image/gif' } });
  if (!m) return realFetch(input, init);
  const id = decodeURIComponent(m[1]);
  const work = db.works[id];
  db.calls.push({ name: `route:${m[2]}`, args: { method: init?.method ?? 'GET' } });
  if (m[2] === 'doc') {
    const doc = db.masters[`${id}:${url.searchParams.get('n')}`];
    return doc ? answer({ doc }) : answer({ error: 'x' }, 404);
  }
  if (m[2] === 'draft') {
    if (init?.method === 'PUT') {
      db.remote[id] = (JSON.parse(String(init.body)) as { doc: unknown }).doc;
      return answer({ ok: true });
    }
    return answer({ doc: db.remote[id] ?? null, updated_at: db.remote[id] ? new Date().toISOString() : null });
  }
  if (m[2] === 'save') {
    const body = JSON.parse(String(init?.body)) as { doc: unknown; note: string };
    const c = checkDoc(body.doc);
    if (!c.ok) {
      db.refused.push(c.error);
      return answer({ error: c.error }, 422);
    }
    const n = work.texts.length + 1;
    db.saved.push({ doc: c.doc, note: body.note });
    db.masters[`${id}:${n}`] = c.doc;
    work.texts.push({ ...version(n, c.doc, body.note), author: ME, created_at: new Date().toISOString() });
    delete db.remote[id];
    changed();
    return answer({ n, reopened: false });
  }
  if (m[2] === 'export' || m[2] === 'pdf') {
    const blob = init?.body as Blob | undefined;
    const head = blob ? String.fromCharCode(...new Uint8Array(await blob.slice(0, 2).arrayBuffer())) : '';
    db.exports.push({ kind: m[2], size: blob?.size ?? 0, head });
    return answer({});
  }
  if (m[2] === 'image') {
    const f = (init?.body as FormData).get('file') as File;
    db.images.push({ size: f.size, type: f.type });
    return answer({ id: '11111111-2222-4333-8444-555555555559' });
  }
  return answer({ error: 'x' }, 404);
};

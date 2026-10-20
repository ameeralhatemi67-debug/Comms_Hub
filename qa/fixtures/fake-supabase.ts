// A stand-in for the Supabase browser client in the studio's UI fixture (qa/studio-ui.cjs). It keeps
// the studio's records in sessionStorage (so a reload keeps them) and answers the studio functions by
// the same rules as supabase/migrations/20261019130000_studio_projects.sql: the editing lease, the
// latest numbered revision as the base of a save, the autosave slot replaced, numbered revisions kept.
// Those rules themselves are run against the real database in supabase/tests/studio_rules.sql; this
// only lets the real interface be driven without signing in. For the studio and the work (MVP_draft.md
// 62.12) it also keeps two works with their stages, decisions, texts and copies, and answers work_submit,
// work_text_save, media_note_add, media_note_done and studio_project_for_work by the rules of their
// migrations (the statuses a work may be sent from, a copy only for the work's platforms).
import { checkDoc } from '../../src/lib/studio/schema.ts';

type Rev = { revision: number; base: number; doc: unknown; saved_by: string; saved_at: string; note: string | null };
type Project = { id: string; title: string; kind: string; owner: string; created_at: string; updated_at: string; updated_by: string; revision: number; autosaved_at: string | null; work_ref: string | null; archived_at: string | null; lease_holder: string | null; lease_until: number; revs: Rev[]; exports: { asset: string; version: number; revision: number; shape?: string | null }[]; template?: boolean };
type Brand = { colors: { name: string; hex: string }[]; title_font: string | null; body_font: string | null };
type Work = { id: string; title: string; type: string; status: string; due: string | null; proposed_at: string | null; sched_at: string | null; channels: string[]; assignee: string | null; closed_at: string | null; updated_at: string };
type Row = Record<string, unknown>;
type Db = {
  projects: Project[]; files: Record<string, unknown>[]; uploads: number; notes?: Record<string, unknown>[]; workLinks?: { work: string; asset: string }[]; brand?: Brand;
  works?: Work[]; stages?: Row[]; decisions?: Row[]; texts?: Row[]; variants?: Row[]; submits?: Row[];
};

export const ME = 'dir@t.test';
const NAMES: Record<string, string> = { 'dir@t.test': 'مدير الاختبار', 'other@t.test': 'زميل آخر' };
const KEY = 'studio-fixture-db';

const seedFiles = () => [
  { id: '00000000-0000-4000-8000-0000000000a1', name: 'ألوان الحملة.mp4', kind: 'video', current_version: 1, mime_type: 'video/mp4', dims: '640 × 360', duration: '0:06', stage: 'draft', approved_version: null, folder_id: 'f1' },
  { id: '00000000-0000-4000-8000-0000000000b1', name: 'بطاقة.png', kind: 'image', current_version: 1, mime_type: 'image/png', dims: '400 × 400 px', duration: null, stage: 'draft', approved_version: null, folder_id: 'f1' },
];

/** A day from today in Riyadh (UTC+3), as «YYYY-MM-DD». */
const day = (n: number) => new Date(Date.now() + 3 * 3600_000 + n * 86_400_000).toISOString().slice(0, 10);
const seedWork = () => ({
  works: [
    { id: 'CH-101', title: 'حملة اليوم الوطني', type: 'video', status: 'IN_PRODUCTION', due: day(5), proposed_at: null, sched_at: null, channels: ['acc-ig', 'acc-yt'], assignee: ME, closed_at: null, updated_at: '2026-10-19' },
    { id: 'CH-102', title: 'بطاقة التهنئة', type: 'post', status: 'IN_PRODUCTION', due: day(-1), proposed_at: null, sched_at: null, channels: ['acc-ig'], assignee: ME, closed_at: null, updated_at: '2026-10-18' },
  ] as Work[],
  stages: [
    { id: 's1', work_id: 'CH-101', pos: 1, name: 'الكتابة', who: ME, due_on: day(-3), started_at: day(-4), done_at: day(-3), gate: false, gate_at: null },
    { id: 's2', work_id: 'CH-101', pos: 2, name: 'المونتاج', who: ME, due_on: day(2), started_at: day(-3), done_at: null, gate: true, gate_at: null },
  ] as Row[],
  decisions: [] as Row[],
  texts: [{ work_id: 'CH-101', n: 1, body: 'اليوم الوطني: معاً نبني', note: null, author: ME, created_at: new Date().toISOString() }] as Row[],
  variants: [{ work_id: 'CH-101', platform: 'youtube', n: 1, body: 'وصف الحلقة على القناة', base: 1, author: ME, created_at: new Date().toISOString() }] as Row[],
  submits: [] as Row[],
});
const ACCOUNTS = [{ id: 'acc-ig', platform: 'instagram', label: 'إنستغرام القسم' }, { id: 'acc-yt', platform: 'youtube', label: 'قناة القسم' }];

function load(): Db {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Db;
  } catch {
    // fresh
  }
  return { projects: [], files: seedFiles(), uploads: 0, ...seedWork() };
}
let db = load();
if (!db.works) Object.assign(db, seedWork());
const save = () => sessionStorage.setItem(KEY, JSON.stringify(db));
const now = () => new Date().toISOString();
const err = (message: string) => ({ data: null, error: { message } });
const ok = (data: unknown) => ({ data, error: null });
let me = ME;

function project(id: string) {
  return db.projects.find((p) => p.id === id);
}
const work = (id: unknown) => db.works!.find((w) => w.id === id);

const rpcs: Record<string, (a: Record<string, unknown>) => { data: unknown; error: { message: string } | null }> = {
  studio_list: (a) =>
    ok(
      db.projects
        .filter((p) => !!p.archived_at === !!a.p_archived)
        .sort((x, y) => y.updated_at.localeCompare(x.updated_at))
        .map((p) => ({
          id: p.id, title: p.title, kind: p.kind, owner: p.owner, owner_name: NAMES[p.owner], created_at: p.created_at, updated_at: p.updated_at, updated_by: p.updated_by,
          updated_by_name: NAMES[p.updated_by], revision: p.revision, autosaved_at: p.autosaved_at, work_ref: p.work_ref, archived_at: p.archived_at,
          editing: p.lease_until > Date.now() ? p.lease_holder : null, editing_name: p.lease_until > Date.now() && p.lease_holder ? NAMES[p.lease_holder] : null,
          exports: p.exports.length, thumb: null, template: !!p.template,
        })),
    ),
  studio_project_create: (a) => {
    const title = String(a.p_title ?? '').trim();
    if (!title || title.length > 120) return err('TITLE_INVALID');
    if (checkDoc(a.p_doc, a.p_kind as 'video')) return err('DOC_INVALID');
    const id = crypto.randomUUID();
    db.projects.push({ id, title, kind: String(a.p_kind), owner: me, created_at: now(), updated_at: now(), updated_by: me, revision: 1, autosaved_at: null, work_ref: null, archived_at: null, lease_holder: me, lease_until: Date.now() + 90_000, revs: [{ revision: 1, base: 0, doc: a.p_doc, saved_by: me, saved_at: now(), note: null }], exports: [] });
    save();
    return ok(id);
  },
  studio_project_doc: (a) => {
    const p = project(String(a.p_project));
    if (!p) return err('NOT_FOUND');
    const r = a.p_revision == null ? (p.revs.find((x) => x.revision === 0) ?? p.revs.find((x) => x.revision === p.revision)) : p.revs.find((x) => x.revision === a.p_revision);
    if (!r) return err('NOT_FOUND');
    return ok({ project: p.id, kind: p.kind, title: p.title, revision: p.revision, autosave: r.revision === 0, base: r.base, doc: r.doc, saved_at: r.saved_at, saved_by: r.saved_by, saved_by_name: NAMES[r.saved_by] });
  },
  studio_lease: (a) => {
    const p = project(String(a.p_project));
    if (!p) return err('NOT_FOUND');
    if (p.archived_at) return err('ARCHIVED');
    const other = !!p.lease_holder && p.lease_holder !== me && p.lease_until > Date.now();
    if (!other || a.p_take) {
      const from = other ? p.lease_holder : null;
      p.lease_holder = me;
      p.lease_until = Date.now() + 90_000;
      save();
      return ok({ mine: true, holder: me, until: new Date(p.lease_until).toISOString(), taken_from: from });
    }
    return ok({ mine: false, holder: p.lease_holder, holder_name: NAMES[p.lease_holder!], until: new Date(p.lease_until).toISOString() });
  },
  studio_release: (a) => {
    const p = project(String(a.p_project));
    if (p && p.lease_holder === me) {
      p.lease_holder = null;
      p.lease_until = 0;
      save();
    }
    return ok(null);
  },
  studio_save: (a) => {
    const p = project(String(a.p_project));
    if (!p) return err('NOT_FOUND');
    if (p.archived_at) return err('ARCHIVED');
    if (p.lease_holder !== me || p.lease_until < Date.now()) return err('NO_LEASE');
    if (p.revision !== a.p_base) return err('STALE_REVISION');
    const bad = checkDoc(a.p_doc, p.kind as 'video');
    if (bad) return err(bad);
    p.lease_until = Date.now() + 90_000;
    p.updated_at = now();
    p.updated_by = me;
    if (a.p_explicit) {
      p.revision += 1;
      p.revs = p.revs.filter((r) => r.revision !== 0);
      p.revs.push({ revision: p.revision, base: p.revision - 1, doc: a.p_doc, saved_by: me, saved_at: now(), note: (a.p_note as string) ?? null });
      p.autosaved_at = null;
      save();
      return ok({ revision: p.revision, explicit: true, saved_at: now() });
    }
    p.revs = p.revs.filter((r) => r.revision !== 0);
    p.revs.push({ revision: 0, base: p.revision, doc: a.p_doc, saved_by: me, saved_at: now(), note: null });
    p.autosaved_at = now();
    save();
    return ok({ revision: p.revision, explicit: false, saved_at: now() });
  },
  studio_project_rename: (a) => {
    const p = project(String(a.p_project));
    const t = String(a.p_title ?? '').trim();
    if (!p) return err('NOT_FOUND');
    if (!t || t.length > 120) return err('TITLE_INVALID');
    p.title = t;
    save();
    return ok(null);
  },
  studio_project_archive: (a) => {
    const p = project(String(a.p_project));
    if (!p) return err('NOT_FOUND');
    if (a.p_archive && p.lease_holder && p.lease_holder !== me && p.lease_until > Date.now()) return err('IN_USE');
    p.archived_at = a.p_archive ? now() : null;
    if (a.p_archive) {
      p.lease_holder = null;
      p.lease_until = 0;
    }
    save();
    return ok(null);
  },
  studio_export_record: (a) => {
    const p = project(String(a.p_project));
    if (!p) return err('NOT_FOUND');
    p.exports.push({ asset: String(a.p_asset), version: Number(a.p_version), revision: Number(a.p_revision), shape: (a.p_shape as string) ?? null });
    save();
    return ok(crypto.randomUUID());
  },
  studio_project_link_work: (a) => {
    const p = project(String(a.p_project));
    if (!p) return err('NOT_FOUND');
    p.work_ref = (a.p_work as string) ?? null;
    save();
    return ok(null);
  },
  // templates and «هوية الاستوديو» (supabase/migrations/20261020140000_studio_kit.sql)
  studio_project_set_template: (a) => {
    const p = project(String(a.p_project));
    if (!p) return err('NOT_FOUND');
    p.template = !!a.p_on;
    save();
    return ok(null);
  },
  studio_project_copy: (a) => {
    const src = project(String(a.p_from));
    const title = String(a.p_title ?? '').trim();
    if (!src) return err('NOT_FOUND');
    if (!title || title.length > 120) return err('TITLE_INVALID');
    const rev = src.revs.find((r) => r.revision === (a.p_revision ?? src.revision));
    if (!rev) return err('NOT_FOUND');
    const id = crypto.randomUUID();
    db.projects.push({ id, title, kind: src.kind, owner: me, created_at: now(), updated_at: now(), updated_by: me, revision: 1, autosaved_at: null, work_ref: null, archived_at: null, lease_holder: me, lease_until: Date.now() + 90_000, revs: [{ revision: 1, base: 0, doc: structuredClone(rev.doc), saved_by: me, saved_at: now(), note: `من «${src.title}»` }], exports: [] });
    save();
    return ok(id);
  },
  studio_brand_save: (a) => {
    const colors = a.p_colors as { name: string; hex: string }[];
    if (!Array.isArray(colors) || colors.length > 12 || colors.some((c) => !/^#[0-9a-fA-F]{6}$/.test(c.hex) || !c.name?.trim())) return err('BRAND_INVALID');
    db.brand = { colors, title_font: (a.p_title_font as string) ?? null, body_font: (a.p_body_font as string) ?? null };
    save();
    return ok(null);
  },
  // «النسخ» (supabase/migrations/20261020120000_studio_versions.sql): numbered versions, newest first
  studio_revisions_list: (a) => {
    const p = project(String(a.p_project));
    if (!p) return err('NOT_FOUND');
    return ok(
      p.revs
        .filter((r) => r.revision >= 1)
        .sort((x, y) => y.revision - x.revision)
        .map((r) => ({
          revision: r.revision, saved_at: r.saved_at, saved_by: r.saved_by, saved_by_name: NAMES[r.saved_by], note: r.note, bytes: JSON.stringify(r.doc).length,
          exports: p.exports.filter((e) => e.revision === r.revision).map((e) => ({ asset: e.asset, version: e.version, kind: 'video', name: (db.files.find((f) => f.id === e.asset)?.name as string) ?? null })),
        })),
    );
  },
  // the studio and the work (supabase/migrations/20261020150000_studio_connections.sql and the work cycle)
  studio_project_for_work: (a) => {
    const w = work(a.p_work);
    if (!w) return err('WORK_DENIED');
    const title = String(a.p_title ?? '').trim();
    if (!title || title.length > 120) return err('TITLE_INVALID');
    if (checkDoc(a.p_doc, a.p_kind as 'video')) return err('DOC_INVALID');
    const id = crypto.randomUUID();
    db.projects.push({ id, title, kind: String(a.p_kind), owner: me, created_at: now(), updated_at: now(), updated_by: me, revision: 1, autosaved_at: null, work_ref: w.id, archived_at: null, lease_holder: me, lease_until: Date.now() + 90_000, revs: [{ revision: 1, base: 0, doc: a.p_doc, saved_by: me, saved_at: now(), note: `للعمل ${w.id}` }], exports: [] });
    save();
    return ok(id);
  },
  work_submit: (a) => {
    const w = work(a.p_work);
    if (!w) return err('NOT_FOUND');
    if (!['IN_PRODUCTION', 'CHANGES_REQUESTED'].includes(w.status)) return err('STATUS_DENIED');
    w.status = 'IN_REVIEW';
    w.updated_at = now();
    db.submits!.push({ ...a, by: me });
    save();
    return ok(null);
  },
  work_text_save: (a) => {
    const w = work(a.p_work);
    if (!w || w.closed_at) return err('FORBIDDEN');
    if (!['DRAFT', 'IN_PRODUCTION', 'CHANGES_REQUESTED', 'REJECTED', 'APPROVED', 'SCHEDULED'].includes(w.status)) return err('STATUS_DENIED');
    const body = String(a.p_body ?? '').trim();
    if (a.p_target === 'main') {
      const n = Math.max(0, ...db.texts!.filter((t) => t.work_id === w.id).map((t) => Number(t.n))) + 1;
      db.texts!.push({ work_id: w.id, n, body, note: a.p_note ?? null, author: me, created_at: now() });
      save();
      return ok({ n, reopened: false });
    }
    if (!w.channels.some((c) => ACCOUNTS.find((x) => x.id === c)?.platform === a.p_target)) return err('PLATFORM_NOT_CHOSEN');
    const mine = db.variants!.filter((t) => t.work_id === w.id && t.platform === a.p_target);
    const last = mine.sort((x, y) => Number(y.n) - Number(x.n))[0];
    if (last && last.body === body) return err('NO_CHANGE');
    const n = (last ? Number(last.n) : 0) + 1;
    db.variants!.push({ work_id: w.id, platform: a.p_target, n, body, base: 1, author: me, created_at: now() });
    const reopened = ['APPROVED', 'SCHEDULED'].includes(w.status);
    if (reopened) w.status = 'IN_REVIEW';
    save();
    return ok({ n, reopened });
  },
  media_note_add: (a) => {
    const body = String(a.p_body ?? '').trim();
    if (!body || body.length > 500) return err('NOTE_INVALID');
    const parent = a.p_parent ? (db.notes ?? []).find((n) => n.id === a.p_parent) : null;
    if (a.p_parent && (!parent || parent.parent_id)) return err('NOTE_INVALID');
    const id = crypto.randomUUID();
    db.notes = [...(db.notes ?? []), { id, asset_id: a.p_asset, author: me, body, timecode: null, created_at: now(), version: parent ? parent.version : (a.p_version ?? null), at_ms: parent ? null : (a.p_at_ms ?? null), area: a.p_area ?? null, parent_id: a.p_parent ?? null, done_at: null, done_by: null }];
    save();
    return ok(id);
  },
  media_note_done: (a) => {
    const n = (db.notes ?? []).find((x) => x.id === a.p_note);
    if (!n) return err('NOT_FOUND');
    n.done_at = a.p_done ? now() : null;
    n.done_by = a.p_done ? me : null;
    save();
    return ok(null);
  },
  my_capabilities: () => ok({ caps: [{ k: 'motion.studio', ok: true, src: 'role', until: null, uses: null, id: null }, { k: 'page.motion', ok: true, src: 'role', until: null, uses: null, id: null }], grants: [] }),
  work_asset_link: (a) => {
    db.workLinks = [...(db.workLinks ?? []), { work: String(a.p_work), asset: String(a.p_asset) }];
    save();
    return ok(null);
  },
  media_tree: () => ok([{ id: 'f1', parent_id: null, name: 'مواد الحملة', restricted: false, locked: false, lock_reason: null, level: 3, ghost: false, locked_by: null, created_at: now() }]),
};

/** The query builder for `from('media_files')`: select, in, order, limit, ilike, eq, maybeSingle. */
function query(table: string) {
  let rows: Record<string, unknown>[] =
    table === 'media_files' ? [...db.files]
    : table === 'works' ? db.works!.map((w) => ({ ...w }))
    : table === 'work_stages' ? [...db.stages!]
    : table === 'work_decisions' ? [...db.decisions!]
    : table === 'work_texts' ? [...db.texts!].sort((x, y) => Number(y.n) - Number(x.n))
    : table === 'work_variants' ? [...db.variants!]
    : table === 'work_assets' ? (db.workLinks ?? []).map((l) => ({ work_id: l.work, asset_id: l.asset }))
    : table === 'platform_accounts' ? ACCOUNTS.map((x) => ({ ...x }))
    : table === 'accounts' ? Object.entries(NAMES).map(([email, display_name]) => ({ email, display_name }))
    : table === 'studio_projects' ? db.projects.map((p) => ({ id: p.id, work_ref: p.work_ref, template: !!p.template, archived_at: p.archived_at, updated_at: p.updated_at }))
    : table === 'studio_brand' ? [db.brand ?? { colors: [], title_font: null, body_font: null }]
    : table === 'media_notes' ? [...(db.notes ?? [])]
    : table === 'studio_exports' ? db.projects.flatMap((p) => p.exports.map((e, i) => ({ project_id: p.id, asset_id: e.asset, version: e.version, revision: e.revision, created_at: String(i).padStart(4, '0') }))).reverse()
    : [];
  let single = false;
  let byId: string | null = null;
  const q = {
    select: () => q,
    in: (col: string, vals: unknown[]) => ((rows = rows.filter((r) => vals.includes(r[col]))), q),
    eq: (col: string, v: unknown) => {
      if (col === 'id') byId = String(v);
      rows = rows.filter((r) => r[col] === v);
      return q;
    },
    ilike: (col: string, pat: string) => {
      const needle = pat.replace(/%/g, '').toLowerCase();
      rows = rows.filter((r) => String(r[col]).toLowerCase().includes(needle));
      return q;
    },
    order: () => q,
    is: (col: string, v: unknown) => ((rows = rows.filter((r) => (r[col] ?? null) === v)), q),
    limit: (n: number) => ((rows = rows.slice(0, n)), q),
    maybeSingle: () => ((single = true), q),
    then: (resolve: (v: unknown) => void) => {
      // a file uploaded during the run lives in the fixture server's library
      if (table === 'media_files' && single && !rows.length && byId)
        return void fetch(`/__asset/${byId}`).then((r) => (r.ok ? r.json() : null)).then((row) => resolve({ data: row, error: null }));
      resolve({ data: single ? (rows[0] ?? null) : rows, error: null });
    },
  };
  return q;
}

const client = {
  rpc: async (fn: string, args: Record<string, unknown>) => (rpcs[fn] ? rpcs[fn](args ?? {}) : err(`fixture: no ${fn}`)),
  from: (table: string) => query(table),
  channel: () => {
    const ch = { on: () => ch, subscribe: () => ch };
    return ch;
  },
  removeChannel: () => undefined,
};

export function supabase() {
  return client;
}

/** What the test sees and moves: the records, and another person taking the lease. */
(window as unknown as { __db: unknown }).__db = {
  get projects() {
    return db.projects;
  },
  get brand() {
    return db.brand;
  },
  takeLease(id: string, who = 'other@t.test') {
    const p = project(id)!;
    p.lease_holder = who;
    p.lease_until = Date.now() + 90_000;
    save();
  },
  as(email: string) {
    me = email;
  },
  addNote(asset: string, timecode: string, body: string) {
    db.notes = [...(db.notes ?? []), { id: crypto.randomUUID(), asset_id: asset, author: 'asst@t.test', body, timecode, created_at: now() }];
    save();
  },
  get workLinks() {
    return db.workLinks ?? [];
  },
  get works() {
    return db.works;
  },
  get submits() {
    return db.submits;
  },
  get variants() {
    return db.variants;
  },
  get notes() {
    return db.notes ?? [];
  },
  /** A review note as the review screen writes it (media_note_add), from the assistant. */
  note(asset: string, body: string, atMs: number | null, version: number | null, done = false) {
    db.notes = [...(db.notes ?? []), { id: crypto.randomUUID(), asset_id: asset, author: 'other@t.test', body, timecode: null, created_at: now(), version, at_ms: atMs, area: null, parent_id: null, done_at: done ? now() : null, done_by: done ? 'other@t.test' : null }];
    save();
  },
  /** A decision on a work: «طلب تعديل» with its note, or another status. */
  decide(id: string, status: string, note: string | null) {
    const w = work(id)!;
    w.status = status;
    if (status === 'CHANGES_REQUESTED') db.decisions!.push({ work_id: id, op: 'changes', note, decided_at: now() });
    save();
  },
  /** The work's text written again on its page: a new version. */
  newText(id: string, body: string) {
    const n = Math.max(0, ...db.texts!.filter((t) => t.work_id === id).map((t) => Number(t.n))) + 1;
    db.texts!.push({ work_id: id, n, body, note: null, author: 'other@t.test', created_at: now() });
    save();
  },
  addFile(row: Record<string, unknown>) {
    db.files.unshift(row);
    save();
  },
  reset() {
    db = { projects: [], files: seedFiles(), uploads: 0, ...seedWork() };
    save();
  },
};

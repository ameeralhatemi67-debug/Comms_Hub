// A stand-in for the Supabase browser client in the studio's UI fixture (qa/studio-ui.cjs). It keeps
// the studio's records in sessionStorage (so a reload keeps them) and answers the studio functions by
// the same rules as supabase/migrations/20261019130000_studio_projects.sql: the editing lease, the
// latest numbered revision as the base of a save, the autosave slot replaced, numbered revisions kept.
// Those rules themselves are run against the real database in supabase/tests/studio_rules.sql; this
// only lets the real interface be driven without signing in.
import { checkDoc } from '../../src/lib/studio/schema.ts';

type Rev = { revision: number; base: number; doc: unknown; saved_by: string; saved_at: string; note: string | null };
type Project = { id: string; title: string; kind: string; owner: string; created_at: string; updated_at: string; updated_by: string; revision: number; autosaved_at: string | null; work_ref: string | null; archived_at: string | null; lease_holder: string | null; lease_until: number; revs: Rev[]; exports: { asset: string; version: number; revision: number }[] };
type Db = { projects: Project[]; files: Record<string, unknown>[]; uploads: number; notes?: Record<string, unknown>[]; workLinks?: { work: string; asset: string }[] };

export const ME = 'dir@t.test';
const NAMES: Record<string, string> = { 'dir@t.test': 'مدير الاختبار', 'other@t.test': 'زميل آخر' };
const KEY = 'studio-fixture-db';

const seedFiles = () => [
  { id: '00000000-0000-4000-8000-0000000000a1', name: 'ألوان الحملة.mp4', kind: 'video', current_version: 1, mime_type: 'video/mp4', dims: '640 × 360', duration: '0:06', stage: 'draft', approved_version: null, folder_id: 'f1' },
  { id: '00000000-0000-4000-8000-0000000000b1', name: 'بطاقة.png', kind: 'image', current_version: 1, mime_type: 'image/png', dims: '400 × 400 px', duration: null, stage: 'draft', approved_version: null, folder_id: 'f1' },
];

function load(): Db {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Db;
  } catch {
    // fresh
  }
  return { projects: [], files: seedFiles(), uploads: 0 };
}
let db = load();
const save = () => sessionStorage.setItem(KEY, JSON.stringify(db));
const now = () => new Date().toISOString();
const err = (message: string) => ({ data: null, error: { message } });
const ok = (data: unknown) => ({ data, error: null });
let me = ME;

function project(id: string) {
  return db.projects.find((p) => p.id === id);
}

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
          exports: p.exports.length, thumb: null,
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
    p.exports.push({ asset: String(a.p_asset), version: Number(a.p_version), revision: Number(a.p_revision) });
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
    : table === 'works' ? [{ id: 'CH-101', title: 'حملة اليوم الوطني', status: 'IN_PRODUCTION', closed_at: null, updated_at: '2026-10-19' }]
    : table === 'studio_projects' ? db.projects.map((p) => ({ id: p.id, work_ref: p.work_ref }))
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
  channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
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
  addFile(row: Record<string, unknown>) {
    db.files.unshift(row);
    save();
  },
  reset() {
    db = { projects: [], files: seedFiles(), uploads: 0 };
    save();
  },
};

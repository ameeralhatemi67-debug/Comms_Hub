// Saving studio projects (Studio_Build_Plan.md section 5): the database calls, their Arabic errors, the
// autosaver, and a crash draft on this device. Pure apart from the IndexedDB draft store: the database
// caller and the timer are injected, so tests run it without a browser or a server.
//
//   - Autosave goes to the project's autosave slot (revision 0) 15 seconds after a change, while this
//     person holds the editing lease. «حفظ نسخة» makes a numbered revision, which is never changed.
//   - Every change is also written to this device's draft store within a second, so a crash, a lost
//     connection or a lost lease never loses work: the next open offers the draft back.
//   - A refused save (NO_LEASE, STALE_REVISION) turns the editor to reading; the draft stays.
import { checkDoc, type ProjectDoc } from './schema.ts';

export type RpcResult<T> = { data: T | null; error: { message: string } | null };
export type Caller = (fn: string, args: Record<string, unknown>) => Promise<RpcResult<unknown>>;
export type Result<T> = { ok: true; data: T } | { ok: false; code: string; error: string };

export type ProjectRow = {
  id: string;
  title: string;
  kind: 'video' | 'photo';
  owner: string;
  owner_name: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string;
  updated_by_name: string | null;
  revision: number;
  autosaved_at: string | null;
  work_ref: string | null;
  archived_at: string | null;
  editing: string | null;
  editing_name: string | null;
  exports: number;
  thumb: string | null;
};

export type OpenedDoc = {
  project: string;
  kind: 'video' | 'photo';
  title: string;
  /** The latest numbered revision of the project: the base of the next save. */
  revision: number;
  /** The document came from the autosave slot (newer than the latest numbered revision). */
  autosave: boolean;
  doc: ProjectDoc;
  saved_at: string;
  saved_by: string;
  saved_by_name: string | null;
};

export type Lease = { mine: boolean; holder: string; holder_name?: string | null; until: string; taken_from?: string | null };
export type Saved = { revision: number; explicit: boolean; saved_at: string };

/** The Arabic sentence for each refusal the studio's database functions give. */
export const STUDIO_ERRORS: Record<string, string> = {
  FORBIDDEN: 'الاستوديو لمسؤول النظام ومدير الاتصال المؤسسي فقط.',
  NOT_FOUND: 'لم يُعثر على المشروع أو النسخة المطلوبة.',
  ARCHIVED: 'هذا المشروع في الأرشيف. أعِده من الأرشيف قبل تحريره.',
  NO_LEASE: 'لم يعد التحرير لك: فتح شخص آخر المشروع للتحرير، أو انقطع الاتصال طويلاً. تغييراتك محفوظة على هذا الجهاز.',
  STALE_REVISION: 'حُفظت نسخة أحدث من هذا المشروع بعد أن فتحته. افتحه من جديد، وتبقى تغييراتك محفوظة على هذا الجهاز.',
  DOC_INVALID: 'تعذّر حفظ المشروع لأن بياناته غير سليمة. تغييراتك محفوظة على هذا الجهاز.',
  DOC_TOO_LARGE: 'المشروع أكبر من الحد المسموح للحفظ. قسّمه إلى مشروعين أو احذف ما لا يلزم منه.',
  SOURCE_DENIED: 'في المشروع ملف من المكتبة غير متاح لك، أو لم يعد إصداره موجوداً.',
  TITLE_INVALID: 'اكتب اسماً للمشروع، حتى 120 حرفاً.',
  IN_USE: 'يحرر شخص آخر هذا المشروع الآن، فلا يمكن أرشفته.',
  EXPORT_NOT_YOURS: 'لا يُسجَّل التصدير إلا لإصدار رفعته أنت.',
  WORK_DENIED: 'هذا العمل غير متاح لك.',
  NETWORK: 'تعذّر الاتصال بالخادم. تغييراتك محفوظة على هذا الجهاز، وسيُعاد الحفظ.',
};

/** The error code inside a database message ('STALE_REVISION', ...), or NETWORK when there is none. */
export function studioErrorCode(message: string | null | undefined): string {
  for (const m of (message ?? '').matchAll(/\b([A-Z][A-Z_]{3,})\b/g)) if (STUDIO_ERRORS[m[1]]) return m[1];
  return 'NETWORK';
}
export const studioErrorText = (message: string | null | undefined) => STUDIO_ERRORS[studioErrorCode(message)];

export function studioApi(call: Caller) {
  async function run<T>(fn: string, args: Record<string, unknown>): Promise<Result<T>> {
    try {
      const { data, error } = await call(fn, args);
      if (error) {
        const code = studioErrorCode(error.message);
        return { ok: false, code, error: STUDIO_ERRORS[code] };
      }
      return { ok: true, data: data as T };
    } catch {
      return { ok: false, code: 'NETWORK', error: STUDIO_ERRORS.NETWORK };
    }
  }
  return {
    list: (archived = false) => run<ProjectRow[]>('studio_list', { p_archived: archived }),
    create: (title: string, doc: ProjectDoc) => {
      const bad = checkDoc(doc);
      if (bad) return Promise.resolve<Result<string>>({ ok: false, code: bad, error: STUDIO_ERRORS[bad] });
      return run<string>('studio_project_create', { p_title: title, p_kind: doc.kind, p_doc: doc });
    },
    open: (id: string, revision: number | null = null) => run<OpenedDoc>('studio_project_doc', { p_project: id, p_revision: revision }),
    lease: (id: string, take = false) => run<Lease>('studio_lease', { p_project: id, p_take: take }),
    release: (id: string) => run<null>('studio_release', { p_project: id }),
    save: (id: string, base: number, doc: ProjectDoc, explicit: boolean, note: string | null = null) => {
      const bad = checkDoc(doc);
      if (bad) return Promise.resolve<Result<Saved>>({ ok: false, code: bad, error: STUDIO_ERRORS[bad] });
      return run<Saved>('studio_save', { p_project: id, p_base: base, p_doc: doc, p_explicit: explicit, p_note: note });
    },
    rename: (id: string, title: string) => run<null>('studio_project_rename', { p_project: id, p_title: title }),
    archive: (id: string, archive: boolean) => run<null>('studio_project_archive', { p_project: id, p_archive: archive }),
    exportRecord: (id: string, revision: number, asset: string, version: number, kind: 'video' | 'image') =>
      run<string>('studio_export_record', { p_project: id, p_revision: revision, p_asset: asset, p_version: version, p_kind: kind }),
    linkWork: (id: string, work: string | null) => run<null>('studio_project_link_work', { p_project: id, p_work: work }),
  };
}
export type StudioApi = ReturnType<typeof studioApi>;

// ---------------------------------------------------------------------------
// The draft on this device
// ---------------------------------------------------------------------------

export type Draft = { doc: ProjectDoc; base: number; at: number };
export type DraftStore = {
  get(id: string): Promise<Draft | null>;
  put(id: string, draft: Draft): Promise<void>;
  delete(id: string): Promise<void>;
};

/** A draft store in memory: tests, and browsers that refuse IndexedDB (some private windows). */
export function memoryDrafts(): DraftStore {
  const m = new Map<string, Draft>();
  return {
    get: async (id) => (m.has(id) ? structuredClone(m.get(id)!) : null),
    put: async (id, d) => void m.set(id, structuredClone(d)),
    delete: async (id) => void m.delete(id),
  };
}

/** The browser's IndexedDB (database «comms-hub-studio», store «drafts»), or memory when refused. */
export function browserDrafts(): DraftStore {
  const fallback = memoryDrafts();
  let opened: Promise<IDBDatabase | null> | null = null;
  const db = () =>
    (opened ??= new Promise<IDBDatabase | null>((resolve) => {
      try {
        const req = indexedDB.open('comms-hub-studio', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('drafts');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    }));
  const tx = async <T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> => {
    const d = await db();
    if (!d) return undefined;
    return new Promise<T | undefined>((resolve) => {
      try {
        const req = op(d.transaction('drafts', mode).objectStore('drafts'));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    });
  };
  return {
    async get(id) {
      if (!(await db())) return fallback.get(id);
      return ((await tx<Draft>('readonly', (s) => s.get(id))) ?? null) as Draft | null;
    },
    async put(id, d) {
      if (!(await db())) return fallback.put(id, d);
      await tx('readwrite', (s) => s.put(d, id));
    },
    async delete(id) {
      if (!(await db())) return fallback.delete(id);
      await tx('readwrite', (s) => s.delete(id));
    },
  };
}

// ---------------------------------------------------------------------------
// The autosaver
// ---------------------------------------------------------------------------

export type SaveState =
  | { kind: 'saved'; at: number; revision: number }
  | { kind: 'dirty' }
  | { kind: 'saving' }
  | { kind: 'error'; code: string; error: string }
  | { kind: 'readonly'; code: string; error: string };

export type Timer = (fn: () => void, ms: number) => () => void;
const realTimer: Timer = (fn, ms) => {
  const t = setTimeout(fn, ms);
  return () => clearTimeout(t);
};

export const AUTOSAVE_MS = 15_000;
export const DRAFT_MS = 800;
/** After a network failure, try again after this long. */
export const RETRY_MS = 20_000;

export type SaverOptions = {
  api: Pick<StudioApi, 'save'>;
  project: string;
  doc: ProjectDoc;
  base: number;
  leased: boolean;
  drafts: DraftStore;
  onState?: (s: SaveState) => void;
  timer?: Timer;
  now?: () => number;
  autosaveMs?: number;
};

export class Saver {
  private doc: ProjectDoc;
  private base: number;
  private dirty = false;
  private leased: boolean;
  private inFlight: Promise<unknown> | null = null;
  private cancelSave: (() => void) | null = null;
  private cancelDraft: (() => void) | null = null;
  private disposed = false;
  state: SaveState;

  private readonly opts: SaverOptions;

  constructor(opts: SaverOptions) {
    this.opts = opts;
    this.doc = opts.doc;
    this.base = opts.base;
    this.leased = opts.leased;
    this.state = opts.leased ? { kind: 'saved', at: this.now(), revision: opts.base } : { kind: 'readonly', code: 'NO_LEASE', error: STUDIO_ERRORS.NO_LEASE };
  }

  private now() {
    return (this.opts.now ?? Date.now)();
  }
  private timer(fn: () => void, ms: number) {
    return (this.opts.timer ?? realTimer)(fn, ms);
  }
  private set(s: SaveState) {
    this.state = s;
    this.opts.onState?.(s);
  }

  /** The numbered revision the next save builds on. */
  get revision() {
    return this.base;
  }
  get current() {
    return this.doc;
  }
  get hasChanges() {
    return this.dirty;
  }

  /** A new document state from the editor. */
  change(doc: ProjectDoc) {
    if (this.disposed) return;
    this.doc = doc;
    this.dirty = true;
    this.cancelDraft?.();
    this.cancelDraft = this.timer(() => void this.writeDraft(), DRAFT_MS);
    if (this.state.kind === 'readonly') return;
    this.set({ kind: 'dirty' });
    this.cancelSave?.();
    if (this.leased) this.cancelSave = this.timer(() => void this.save(false), this.opts.autosaveMs ?? AUTOSAVE_MS);
  }

  private async writeDraft() {
    this.cancelDraft = null;
    await this.opts.drafts.put(this.opts.project, { doc: this.doc, base: this.base, at: this.now() });
  }

  /** Whether this person may save (the lease was taken or lost). */
  setLeased(leased: boolean) {
    this.leased = leased;
    if (!leased) {
      this.cancelSave?.();
      this.set({ kind: 'readonly', code: 'NO_LEASE', error: STUDIO_ERRORS.NO_LEASE });
    } else if (this.state.kind === 'readonly') {
      this.set(this.dirty ? { kind: 'dirty' } : { kind: 'saved', at: this.now(), revision: this.base });
      if (this.dirty) this.cancelSave = this.timer(() => void this.save(false), this.opts.autosaveMs ?? AUTOSAVE_MS);
    }
  }

  /**
   * Save now: to the autosave slot, or (explicit) as a new numbered revision. Returns the result;
   * a refusal by the lease or a newer revision turns the editor to reading, and the draft stays.
   */
  async save(explicit: boolean, note: string | null = null): Promise<Result<Saved>> {
    this.cancelSave?.();
    this.cancelSave = null;
    if (!this.leased || this.state.kind === 'readonly') return { ok: false, code: 'NO_LEASE', error: STUDIO_ERRORS.NO_LEASE };
    if (!explicit && !this.dirty) return { ok: true, data: { revision: this.base, explicit: false, saved_at: new Date(this.now()).toISOString() } };
    while (this.inFlight) await this.inFlight;
    const doc = this.doc;
    this.set({ kind: 'saving' });
    const p = this.opts.api.save(this.opts.project, this.base, doc, explicit, note);
    this.inFlight = p;
    const r = await p;
    this.inFlight = null;
    if (this.disposed) return r;
    if (r.ok) {
      if (r.data.explicit) this.base = r.data.revision;
      // Changes made while this save was on its way are still unsaved.
      this.dirty = this.doc !== doc;
      if (this.dirty) {
        this.set({ kind: 'dirty' });
        this.cancelSave = this.timer(() => void this.save(false), this.opts.autosaveMs ?? AUTOSAVE_MS);
      } else {
        this.set({ kind: 'saved', at: this.now(), revision: this.base });
        await this.opts.drafts.delete(this.opts.project);
      }
      return r;
    }
    if (r.code === 'NO_LEASE' || r.code === 'STALE_REVISION' || r.code === 'ARCHIVED' || r.code === 'FORBIDDEN') {
      this.leased = false;
      this.set({ kind: 'readonly', code: r.code, error: r.error });
      await this.writeDraft();
    } else {
      this.set({ kind: 'error', code: r.code, error: r.error });
      await this.writeDraft();
      if (r.code === 'NETWORK') this.cancelSave = this.timer(() => void this.save(explicit, note), RETRY_MS);
    }
    return r;
  }

  dispose() {
    this.disposed = true;
    this.cancelSave?.();
    this.cancelDraft?.();
  }
}

/** Whether a device draft is worth offering back: newer than what the server gave, on the same base. */
export function draftIsNewer(draft: Draft | null, opened: Pick<OpenedDoc, 'revision' | 'saved_at'>): boolean {
  if (!draft) return false;
  return draft.base === opened.revision && draft.at > Date.parse(opened.saved_at);
}

/** The words for the save state in the editor's bar. */
export function saveStateText(s: SaveState, now = Date.now()): string {
  switch (s.kind) {
    case 'saved': {
      const sec = Math.max(0, Math.round((now - s.at) / 1000));
      return sec < 10 ? 'محفوظ' : sec < 60 ? `محفوظ قبل ${sec} ثانية` : `محفوظ قبل ${Math.round(sec / 60)} دقيقة`;
    }
    case 'dirty':
      return 'تغييرات لم تُحفظ بعد';
    case 'saving':
      return 'جارٍ الحفظ…';
    case 'error':
      return s.error;
    case 'readonly':
      return 'للقراءة فقط';
  }
}

'use client';
// What the work pages share: who is signed in and the role they act as, the people and
// their load, projects, accounts and plan templates, and the one way to write: a
// database function (supabase/migrations/*work_cycle*). The database decides every rule;
// this layer loads, calls and words the answer (src/lib/work/rules.ts).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Role } from '@/lib/domain';
import { useAccount } from '@/lib/account-context';
import { useHub } from '@/lib/store';
import { supabase } from '@/lib/supabase/client';
import {
  riyadhToday,
  setPlatformRegistry,
  workErrorText,
  type AccountRow,
  type PlatformInfo,
  type StageRow,
  type TemplateRow,
  type WorkRow,
  type WorkType,
} from '@/lib/work/rules';
import type { EventItem, HeldMail, ReminderItem, RequestRow, TaskItem } from '@/lib/work/planning';
import { addNote, msOfTimecode } from '@/lib/media/notes';

export type Person = { email: string; display_name: string; role: Role };
export type Load = {
  email: string;
  display_name: string;
  role: Role;
  active_works: number;
  late_works: number;
  open_stages: number;
  late_stages: number;
  open_tasks: number;
  late_tasks: number;
};
export type Project = { id: string; name: string; type: string; start_on: string; end_on: string; owner: string; description: string | null };
export type Template = { id: string; name: string; type: WorkType; rows: TemplateRow[]; created_by: string };
export type ListItem = { w: WorkRow; stages: StageRow[]; projects: string[]; flags: number; pending?: number; pendingKeys?: string[] };
export type Result<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

type Ctx = {
  status: 'loading' | 'ready' | 'error';
  me: string;
  /** The role the interface behaves as: the viewed role for an administrator, who acts as any role. */
  role: Role;
  isAdmin: boolean;
  today: string;
  people: Person[];
  nameOf: (email: string | null | undefined) => string;
  personOf: (email: string | null | undefined) => Person | undefined;
  load: Load[];
  projects: Project[];
  accounts: AccountRow[];
  /** The platform registry, in order; also handed to the shared words and rules (setPlatformRegistry). */
  platforms: PlatformInfo[];
  templates: Template[];
  reloadBase: () => Promise<void>;
  /** Calls a database function; on refusal returns the reason in Arabic. */
  call: <T = unknown>(fn: string, args: Record<string, unknown>) => Promise<Result<T>>;
  say: (text: string) => void;
};

const WorkContext = createContext<Ctx | null>(null);
export function useWork(): Ctx {
  const v = useContext(WorkContext);
  if (!v) throw Error('Work provider missing');
  return v;
}

export function WorkProvider({ children }: { children: ReactNode }) {
  const account = useAccount();
  const { state, dispatch } = useHub();
  const isAdmin = account.role === 'admin';
  const role: Role = isAdmin ? state.role : account.role;
  const [status, setStatus] = useState<Ctx['status']>('loading');
  const [people, setPeople] = useState<Person[]>([]);
  const [load, setLoad] = useState<Load[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [platforms, setPlatforms] = useState<PlatformInfo[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const ran = useRef(false);

  const reloadBase = useCallback(async () => {
    const db = supabase();
    // No background worker: whoever has a work page open runs what has come due (simulation).
    if (!ran.current) {
      ran.current = true;
      await db.rpc('work_due_run');
      // Also once per visit: tells the holders of the secrets right that an app's secret is near its end.
      await db.rpc('integration_expiry_notes');
    }
    const [p, l, j, a, t, pl] = await Promise.all([
      db.rpc('media_people'),
      db.rpc('work_people_load'),
      db.from('projects').select('id,name,type,start_on,end_on,owner,description').order('start_on', { ascending: false }),
      db.from('platform_accounts').select('id,platform,label,handle,purpose,authorized_until,publishers,mode,active,fixed,conn_kind,conn_state,conn_checked_at,conn_error,external_id,external_name,scopes').order('created_at'),
      db.from('plan_templates').select('id,name,type,rows,created_by').order('created_at', { ascending: false }),
      db.from('platforms').select('key,label_ar,kind,sort,accepts,publish_mode,scheduling,requires_review,token_life_days,enabled,builtin,docs_url,readiness,readiness_note,readiness_at,readiness_by').order('sort'),
    ]);
    if (p.error || l.error || j.error || a.error || t.error || pl.error) return setStatus('error');
    setPlatformRegistry(pl.data as PlatformInfo[]);
    setPlatforms(pl.data as PlatformInfo[]);
    setPeople(p.data as Person[]);
    setLoad(l.data as Load[]);
    setProjects(j.data as Project[]);
    setAccounts(a.data as AccountRow[]);
    setTemplates(t.data as Template[]);
    setStatus('ready');
  }, []);
  useEffect(() => {
    void reloadBase();
  }, [reloadBase]);

  const say = useCallback((text: string) => dispatch({ type: 'notify', text }), [dispatch]);
  const personOf = useCallback((email: string | null | undefined) => people.find((x) => x.email === email), [people]);
  const nameOf = useCallback(
    (email: string | null | undefined) => (email ? (personOf(email)?.display_name ?? email.split('@')[0]) : ''),
    [personOf],
  );
  const call = useCallback(async <T,>(fn: string, args: Record<string, unknown>): Promise<Result<T>> => {
    const { data, error } = await supabase().rpc(fn, args);
    if (error) return { ok: false, error: workErrorText(error.message) };
    return { ok: true, data: data as T };
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      status,
      me: account.email,
      role,
      isAdmin,
      today: riyadhToday(),
      people,
      nameOf,
      personOf,
      load,
      projects,
      accounts,
      platforms,
      templates,
      reloadBase,
      call,
      say,
    }),
    [status, account.email, role, isAdmin, people, nameOf, personOf, load, projects, accounts, platforms, templates, reloadBase, call, say],
  );
  return <WorkContext.Provider value={value}>{children}</WorkContext.Provider>;
}

/** Every work this person can see (row level security decides), with its stages, projects and review counts. */
export function useWorkList() {
  const [items, setItems] = useState<ListItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const reload = useCallback(async () => {
    const db = supabase();
    const [w, s, p, f] = await Promise.all([
      db.from('works').select('*').order('due'),
      db.from('work_stages').select('*').order('pos'),
      db.from('work_projects').select('work_id,project_id'),
      db.from('work_flags').select('work_id,part'),
    ]);
    if (w.error || s.error || p.error || f.error) return setStatus('error');
    const works = w.data as WorkRow[];
    const stages = s.data as StageRow[];
    const inReview = works.filter((x) => x.status === 'IN_REVIEW');
    const pending = await Promise.all(inReview.map((x) => db.rpc('work_view_pending', { p_work: x.id })));
    const pend: Record<string, string[]> = {};
    inReview.forEach((x, i) => (pend[x.id] = ((pending[i].data as { key: string }[]) ?? []).map((p) => p.key)));
    setItems(
      works.map((x) => ({
        w: x,
        stages: stages.filter((st) => st.work_id === x.id),
        projects: (p.data as { work_id: string; project_id: string }[]).filter((r) => r.work_id === x.id).map((r) => r.project_id),
        flags: (f.data as { work_id: string }[]).filter((r) => r.work_id === x.id).length,
        pending: pend[x.id]?.length,
        pendingKeys: pend[x.id],
      })),
    );
    setStatus('ready');
  }, []);
  useEffect(() => {
    void reload();
    const again = () => document.visibilityState === 'visible' && void reload();
    document.addEventListener('visibilitychange', again);
    return () => document.removeEventListener('visibilitychange', again);
  }, [reload]);
  return { items, status, reload };
}

// ---------------------------------------------------------------------------
// One work, in full
// ---------------------------------------------------------------------------
export type TextVersion = { n: number; body: string; note: string | null; author: string; created_at: string };
export type Variant = { platform: string; n: number; body: string; base: number; author: string; created_at: string };
export type PartRow = { key: string; label: string; ver: string; kind: string; snap?: string | null };
export type Cycle = { n: number; sent_by: string; sent_at: string; note: string | null };
export type Decision = { id: number; cycle: number; op: string; labels: string[]; decided_by: string; decided_at: string; note: string | null };
export type Comment = { id: string; author: string; body: string; created_at: string };
export type LogRow = { id: number; at: string; actor: string; type: string; text: string };
export type WorkAsset = { asset_id: string; file: { id: string; name: string; kind: string; current_version: number; approved_version: number | null; stage: string } | null };
export type MailLink = { id: string; subject: string; kind: string; req_no: number | null };
export type ChatLink = { id: string; name: string | null };
export type Extension = { id: string; stage_id: string | null; status: string; to_at: string; requested_by: string };

export type WorkDetail = {
  w: WorkRow;
  stages: StageRow[];
  texts: TextVersion[];
  variants: Variant[];
  approvals: { part: string; ver: string; approved_by: string; approved_at: string; snap: string | null }[];
  flags: { part: string; ver: string; note: string | null }[];
  cycles: Cycle[];
  decisions: Decision[];
  comments: Comment[];
  log: LogRow[];
  projects: string[];
  assets: WorkAsset[];
  parts: PartRow[];
  pending: PartRow[];
  decideBlock: string;
  mail: MailLink[];
  chats: ChatLink[];
  extensions: Extension[];
};

export function useWorkDetail(id: string) {
  const [detail, setDetail] = useState<WorkDetail | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const reload = useCallback(async () => {
    const db = supabase();
    const w = await db.from('works').select('*').eq('id', id).maybeSingle();
    if (w.error) return setStatus('error');
    // Not found and not visible read the same: a restricted work does not exist for those outside it.
    if (!w.data) return setStatus('missing');
    const [st, tx, va, ap, fl, cy, de, co, lg, pj, as, parts, pend, blk, ml, ch] = await Promise.all([
      db.from('work_stages').select('*').eq('work_id', id).order('pos'),
      db.from('work_texts').select('n,body,note,author,created_at').eq('work_id', id).order('n'),
      db.from('work_variants').select('platform,n,body,base,author,created_at').eq('work_id', id).order('n'),
      db.from('work_approvals').select('part,ver,approved_by,approved_at,snap').eq('work_id', id),
      db.from('work_flags').select('part,ver,note').eq('work_id', id),
      db.from('work_cycles').select('n,sent_by,sent_at,note').eq('work_id', id).order('n'),
      db.from('work_decisions').select('id,cycle,op,labels,decided_by,decided_at,note').eq('work_id', id).order('decided_at'),
      db.from('work_comments').select('id,author,body,created_at').eq('work_id', id).order('created_at'),
      db.from('work_log').select('id,at,actor,type,text').eq('work_id', id).order('at'),
      db.from('work_projects').select('project_id').eq('work_id', id),
      db.from('work_assets').select('asset_id, file:media_files(id,name,kind,current_version,approved_version,stage)').eq('work_id', id).order('added_at'),
      db.rpc('work_view_parts', { p_work: id }),
      db.rpc('work_view_pending', { p_work: id }),
      db.rpc('work_decide_block', { p_work: id }),
      db.from('mail_threads').select('id,subject,kind,req_no').contains('links', [{ type: 'work', id }]),
      db.from('chat_rooms').select('id,name').eq('link->>id', id),
    ]);
    const stages = (st.data ?? []) as StageRow[];
    const ex = stages.length
      ? await db.from('work_requests').select('id,stage_id,status,to_at,requested_by').in('stage_id', stages.map((s) => s.id)).eq('status', 'pending')
      : { data: [] };
    setDetail({
      w: w.data as WorkRow,
      stages,
      texts: (tx.data ?? []) as TextVersion[],
      variants: (va.data ?? []) as Variant[],
      approvals: (ap.data ?? []) as WorkDetail['approvals'],
      flags: (fl.data ?? []) as WorkDetail['flags'],
      cycles: (cy.data ?? []) as Cycle[],
      decisions: (de.data ?? []) as Decision[],
      comments: (co.data ?? []) as Comment[],
      log: (lg.data ?? []) as LogRow[],
      projects: ((pj.data ?? []) as { project_id: string }[]).map((r) => r.project_id),
      assets: (as.data ?? []) as unknown as WorkAsset[],
      parts: (parts.data ?? []) as PartRow[],
      pending: (pend.data ?? []) as PartRow[],
      decideBlock: blk.data ? workErrorText(blk.data as string) : '',
      mail: (ml.data ?? []) as MailLink[],
      chats: (ch.data ?? []) as ChatLink[],
      extensions: (ex.data ?? []) as Extension[],
    });
    setStatus('ready');
  }, [id]);
  useEffect(() => {
    void reload();
    const again = () => document.visibilityState === 'visible' && void reload();
    document.addEventListener('visibilitychange', again);
    return () => document.removeEventListener('visibilitychange', again);
  }, [reload]);
  return { detail, status, reload };
}

/** Files this person can reach in the library, newest first, for the pickers. */
export type LibraryFile = { id: string; name: string; kind: string; current_version: number; stage: string };
export async function libraryFiles(q: string): Promise<LibraryFile[]> {
  let query = supabase().from('media_files').select('id,name,kind,current_version,stage').order('created_at', { ascending: false }).limit(60);
  if (q.trim()) query = query.ilike('name', `%${q.trim()}%`);
  const { data } = await query;
  return (data ?? []) as LibraryFile[];
}

/** Every review cycle and decision this person can see (row level security), newest decisions first. */
export function useDecisions() {
  const [cycles, setCycles] = useState<(Cycle & { work_id: string })[]>([]);
  const [decisions, setDecisions] = useState<(Decision & { work_id: string; parts: string[] })[]>([]);
  const reload = useCallback(async () => {
    const db = supabase();
    const [c, d] = await Promise.all([
      db.from('work_cycles').select('work_id,n,sent_by,sent_at,note'),
      db.from('work_decisions').select('id,work_id,cycle,op,parts,labels,decided_by,decided_at,note').order('decided_at', { ascending: false }).limit(300),
    ]);
    setCycles((c.data ?? []) as (Cycle & { work_id: string })[]);
    setDecisions((d.data ?? []) as (Decision & { work_id: string; parts: string[] })[]);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { cycles, decisions, reload };
}

/** The library's notes on these files, oldest first; a timecode marks a moment of a video. */
export type FileNote = { id: string; asset_id: string; author: string; body: string; timecode: string | null; created_at: string };
export async function fileNotes(ids: string[]): Promise<FileNote[]> {
  if (!ids.length) return [];
  const { data } = await supabase().from('media_notes').select('id,asset_id,author,body,timecode,created_at').in('asset_id', ids).order('created_at');
  return (data ?? []) as FileNote[];
}
export async function addFileNote(assetId: string, author: string, body: string, timecode: string): Promise<string | null> {
  // through media_note_add (supabase/migrations/20261020150000_studio_connections.sql); `author` is the caller
  void author;
  if (timecode && msOfTimecode(timecode) === null) return 'الوقت بصيغة دقيقة:ثانية، مثل 00:32.';
  const r = await addNote((fn, args) => supabase().rpc(fn, args), { asset: assetId, body, atMs: msOfTimecode(timecode) });
  return 'error' in r ? r.error : null;
}

// ---------------------------------------------------------------------------
// The planning pages: tasks, events and private reminders, and «الطلبات»
// ---------------------------------------------------------------------------
export type { TaskItem, EventItem, ReminderItem, RequestRow, HeldMail } from '@/lib/work/planning';

/** Tasks this person can read (row level security), the department's events, and their own reminders. */
export function usePlanData() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const reload = useCallback(async () => {
    const db = supabase();
    const [t, e, r] = await Promise.all([
      db.from('media_tasks').select('id,what,kind,assignee,assigned_by,due,start_on,after_ids,status,note,project_id,work_id,group_key,priority').order('due').limit(1000),
      db.from('events').select('id,title,start_at,end_at,place,project_id,created_by').order('start_at').limit(1000),
      db.from('reminders').select('id,at,body').order('at').limit(500),
    ]);
    if (t.error || e.error || r.error) return setStatus('error');
    setTasks(t.data as TaskItem[]);
    setEvents(e.data as EventItem[]);
    setReminders(r.data as ReminderItem[]);
    setStatus('ready');
  }, []);
  useEffect(() => {
    void reload();
    const again = () => document.visibilityState === 'visible' && void reload();
    document.addEventListener('visibilitychange', again);
    return () => document.removeEventListener('visibilitychange', again);
  }, [reload]);
  return { tasks, events, reminders, status, reload };
}

/** The requests this person may see (work_request_list), outside mail held for approval, and folders they cannot open. */
export function useRequestData() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [held, setHeld] = useState<HeldMail[]>([]);
  const [locked, setLocked] = useState<{ id: string; name: string }[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const reload = useCallback(async () => {
    const db = supabase();
    const [q, m, f] = await Promise.all([
      db.rpc('work_request_list'),
      db.from('mail_messages').select('id,thread_id,author,created_at').eq('state', 'held').order('created_at', { ascending: false }).limit(100),
      db.rpc('media_tree'),
    ]);
    if (q.error) return setStatus('error');
    const msgs = (m.data ?? []) as { id: string; thread_id: string; author: string | null; created_at: string }[];
    const ids = [...new Set(msgs.map((x) => x.thread_id))];
    const th = ids.length ? await db.from('mail_threads').select('id,subject').in('id', ids) : { data: [] };
    const subj = new Map(((th.data ?? []) as { id: string; subject: string }[]).map((x) => [x.id, x.subject]));
    setRequests(q.data as RequestRow[]);
    setHeld(msgs.map((x) => ({ ...x, author: x.author ?? '', subject: subj.get(x.thread_id) ?? 'رسالة خارجية' })));
    setLocked(((f.data ?? []) as { id: string; name: string; ghost: boolean }[]).filter((x) => x.ghost).map((x) => ({ id: x.id, name: x.name })));
    setStatus('ready');
  }, []);
  useEffect(() => {
    void reload();
    const again = () => document.visibilityState === 'visible' && void reload();
    document.addEventListener('visibilitychange', again);
    return () => document.removeEventListener('visibilitychange', again);
  }, [reload]);
  return { requests, held, locked, status, reload };
}

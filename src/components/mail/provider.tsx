'use client';
// Everything the mail page shares: what this person can see (threads, messages, their
// own view of each thread, people, assets), and the actions. The database decides
// every rule (supabase/migrations/*mail*); this layer loads, calls and explains.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Role } from '@/lib/domain';
import { useAccount } from '@/lib/account-context';
import { useHub } from '@/lib/store';
import { supabase } from '@/lib/supabase/client';
import { sendToDrive } from '@/lib/media/upload';
import {
  MAIL_ATTACH_BYTES,
  mailErrorText,
  type MemberRow,
  type MessageRow,
  type ThreadRow,
  type View,
} from '@/lib/mail/rules';

export type PersonRow = { email: string; display_name: string; role: Role };
export type AssetLite = {
  id: string;
  name: string;
  kind: string;
  stage: string;
  current_version: number;
  approved_version: number | null;
  size_bytes: number;
  folder_id: string;
};
export type FileLite = { id: string; name: string; mime_type: string; size_bytes: number };
export type RuleRow = { id: string; field: 'from' | 'subject'; pattern: string; label: string | null; assignee: string | null; enabled: boolean };
export type Settings = { paused: boolean; sla_hours: number; sync_at: string | null };
export type Result = { ok: true } | { ok: false; error: string };

export type Outgoing = {
  thread: string | null;
  forward: boolean;
  subject: string;
  to: string[];
  cc: string[];
  bcc: string[];
  body: string;
  refs: string[];
  files: string[];
  card: Record<string, unknown> | null;
  sendAt: string | null;
  links: { type: 'work'; id: string }[];
};

type Pending = { id: number; out: Outgoing; label: string; left: number; restore: () => void };

type Ctx = {
  status: 'loading' | 'ready' | 'error';
  me: string;
  /** The role the interface behaves as: the viewed role for an administrator. */
  role: Role;
  isAdmin: boolean;
  people: PersonRow[];
  nameOf: (email: string) => string;
  personOf: (email: string) => PersonRow | undefined;
  views: View[];
  viewOf: (id: string) => View | undefined;
  assets: AssetLite[];
  files: FileLite[];
  rules: RuleRow[];
  settings: Settings;
  mailbox: 'unknown' | 'connected' | 'off' | 'error';
  now: number;
  reload: () => Promise<void>;
  say: (text: string) => void;
  pending: Pending | null;
  undo: () => void;
  // actions
  send: (out: Outgoing, label: string, restore: () => void) => void;
  call: (fn: string, args: Record<string, unknown>, ok?: string) => Promise<Result>;
  sync: (force?: boolean) => Promise<void>;
  upload: (file: File, onProgress: (f: number) => void) => Promise<FileLite>;
};

const MailContext = createContext<Ctx | null>(null);

export function useMail(): Ctx {
  const v = useContext(MailContext);
  if (!v) throw Error('Mail provider missing');
  return v;
}

const UNDO_SECONDS = 10;

export function MailProvider({ children }: { children: ReactNode }) {
  const account = useAccount();
  const { state, dispatch } = useHub();
  const isAdmin = account.role === 'admin';
  const role: Role = isAdmin ? state.role : account.role;

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [assets, setAssets] = useState<AssetLite[]>([]);
  const [files, setFiles] = useState<FileLite[]>([]);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [settings, setSettings] = useState<Settings>({ paused: false, sla_hours: 8, sync_at: null });
  const [mailbox, setMailbox] = useState<Ctx['mailbox']>('unknown');
  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  const say = useCallback((text: string) => dispatch({ type: 'notify', text }), [dispatch]);

  const load = useCallback(async () => {
    const db = supabase();
    const t = await db.from('mail_threads').select('*').order('last_at', { ascending: false }).limit(300);
    if (t.error) return setStatus('error');
    const ids = (t.data as ThreadRow[]).map((x) => x.id);
    const [m, mem, p, s, a, f, r] = await Promise.all([
      ids.length
        ? db.from('mail_messages').select('*').in('thread_id', ids).order('created_at', { ascending: true }).limit(5000)
        : Promise.resolve({ data: [], error: null }),
      db.from('mail_members').select('*'),
      db.rpc('media_people'),
      db.from('mail_settings').select('paused, sla_hours, sync_at').maybeSingle(),
      db.from('media_files').select('id, name, kind, stage, current_version, approved_version, size_bytes, folder_id'),
      db.rpc('mail_visible_files'),
      db.from('mail_rules').select('*').order('created_at'),
    ]);
    if (m.error || mem.error || p.error) return setStatus('error');
    setThreads(t.data as ThreadRow[]);
    setMessages(m.data as MessageRow[]);
    setMembers(mem.data as MemberRow[]);
    setPeople(p.data as PersonRow[]);
    if (s.data) setSettings(s.data as Settings);
    setAssets((a.data ?? []) as AssetLite[]);
    setFiles((f.data ?? []) as FileLite[]);
    setRules((r.data ?? []) as RuleRow[]);
    setNow(Date.now());
    setStatus('ready');
  }, []);

  const sync = useCallback(
    async (force = false) => {
      try {
        const res = await fetch('/api/mail/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force }),
        });
        if (!res.ok) return setMailbox('error');
        const j = (await res.json()) as { configured: boolean; skipped?: boolean; received?: number; sent?: number };
        setMailbox(j.configured ? 'connected' : 'off');
        if (j.configured && !j.skipped && ((j.received ?? 0) > 0 || (j.sent ?? 0) > 0)) await load();
      } catch {
        setMailbox('error');
      }
    },
    [load],
  );

  useEffect(() => {
    void load().then(() => sync());
    const reload = setInterval(() => void load(), 30_000);
    const mailbox = setInterval(() => void sync(), 60_000);
    const clock = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      clearInterval(reload);
      clearInterval(mailbox);
      clearInterval(clock);
    };
  }, [load, sync]);

  const call = useCallback(
    async (fn: string, args: Record<string, unknown>, ok?: string): Promise<Result> => {
      const { error } = await supabase().rpc(fn, args);
      if (error) return { ok: false, error: mailErrorText(error.message) };
      await load();
      if (ok) say(ok);
      return { ok: true };
    },
    [load, say],
  );

  // A send waits ten seconds in this page so it can be taken back. Leaving the page in
  // that window sends it at once.
  const commit = useCallback(
    async (p: Pending) => {
      pendingRef.current = null;
      setPending(null);
      const o = p.out;
      const { data, error } = await supabase().rpc('mail_send', {
        p_thread: o.thread,
        p_subject: o.subject,
        p_to: o.to,
        p_cc: o.cc,
        p_bcc: o.bcc,
        p_body: o.body,
        p_refs: o.refs,
        p_files: o.files,
        p_card: o.card,
        p_send_at: o.sendAt,
        p_links: o.links,
        p_forward: o.forward,
      });
      if (error) {
        say(mailErrorText(error.message));
        p.restore();
        return;
      }
      const st = (data as { state: string }).state;
      await load();
      if (st === 'held') say('أُرسلت للاعتماد. أُبلغ مدير الاتصال ومساعده.');
      else if (st === 'queued') say('البريد الصادر متوقف. الرسالة في الطابور وتخرج عند الاستئناف.');
      else if (st === 'outbox' && !o.sendAt) {
        await sync(true);
        await load();
      }
    },
    [load, say, sync],
  );

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => {
      const p = pendingRef.current;
      if (!p) return;
      if (p.left <= 1) void commit(p);
      else {
        const next = { ...p, left: p.left - 1 };
        pendingRef.current = next;
        setPending(next);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [pending, commit]);

  useEffect(() => {
    const flush = () => {
      const p = pendingRef.current;
      if (p) void commit(p);
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [commit]);

  const value = useMemo<Ctx>(() => {
    const byThread = new Map<string, MessageRow[]>();
    for (const m of messages) {
      const list = byThread.get(m.thread_id);
      if (list) list.push(m);
      else byThread.set(m.thread_id, [m]);
    }
    const mine = new Map(members.filter((x) => x.email === account.email).map((x) => [x.thread_id, x]));
    const views: View[] = threads.map((t) => ({ thread: t, messages: byThread.get(t.id) ?? [], member: mine.get(t.id) ?? null }));
    const personOf = (email: string) => people.find((p) => p.email === email);
    return {
      status,
      me: account.email,
      role,
      isAdmin,
      people,
      nameOf: (email: string) => personOf(email)?.display_name ?? email.split('@')[0],
      personOf,
      views,
      viewOf: (id: string) => views.find((v) => v.thread.id === id),
      assets,
      files,
      rules,
      settings,
      mailbox,
      now,
      reload: load,
      say,
      pending,
      undo() {
        const p = pendingRef.current;
        if (!p) return;
        pendingRef.current = null;
        setPending(null);
        p.restore();
        say('تراجعت عن الإرسال. الرسالة في نافذة الكتابة.');
      },
      send(out, label, restore) {
        const prev = pendingRef.current;
        if (prev) void commit(prev);
        const p: Pending = { id: Date.now(), out, label, left: UNDO_SECONDS, restore };
        pendingRef.current = p;
        setPending(p);
      },
      call,
      sync,
      async upload(file, onProgress) {
        if (file.size > MAIL_ATTACH_BYTES) throw new Error('مرفقات البريد حتى 25 MB. للملفات الأكبر أضفها إلى مكتبة الوسائط وأرسلها مرجعاً.');
        const session = await fetch('/api/mail/upload-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size }),
        });
        if (!session.ok) throw new Error(((await session.json().catch(() => null)) as { error?: string } | null)?.error ?? 'تعذّر بدء الرفع.');
        const { sessionUrl } = (await session.json()) as { sessionUrl: string };
        const fileId = await sendToDrive(sessionUrl, file, onProgress);
        const done = await fetch('/api/mail/upload-complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId }),
        });
        if (!done.ok) throw new Error(((await done.json().catch(() => null)) as { error?: string } | null)?.error ?? 'تعذّر تسجيل المرفق.');
        const j = (await done.json()) as { id: string; name: string; size: number; mime: string };
        const f = { id: j.id, name: j.name, size_bytes: j.size, mime_type: j.mime };
        setFiles((all) => [...all.filter((x) => x.id !== f.id), f]);
        return f;
      },
    };
  }, [status, account.email, role, isAdmin, people, threads, messages, members, assets, files, rules, settings, mailbox, now, load, say, pending, call, sync, commit]);

  return <MailContext.Provider value={value}>{children}</MailContext.Provider>;
}

'use client';
// Everything the messaging tab shares: the rooms this person is in, their messages,
// reactions, votes and acknowledgements, live through Supabase Realtime, and the
// actions. The database decides every rule (supabase/migrations/*chat*).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Role } from '@/lib/domain';
import { useAccount } from '@/lib/account-context';
import { useHub } from '@/lib/store';
import { supabase } from '@/lib/supabase/client';
import { uploadAttachment, type UploadedFile } from '@/lib/mail/upload';
import { chatErrorText, type ChatMessage, type MemberRow, type RoomRow, type Urgency } from '@/lib/chat/rules';

export type AssetLite = { id: string; name: string; kind: string; stage: string; current_version: number; approved_version: number | null; size_bytes: number };
type Result = { ok: true; id?: string } | { ok: false; error: string };
export type SendOpts = { reply?: string | null; urgency?: Urgency; forward?: boolean };

type Ctx = {
  status: 'loading' | 'ready' | 'error';
  me: string;
  role: Role;
  rooms: RoomRow[];
  membersOf: (room: string) => MemberRow[];
  myMember: (room: string) => MemberRow | undefined;
  messagesOf: (room: string) => ChatMessage[];
  reactionsOf: (msg: string) => { email: string; kind: string }[];
  votesOf: (msg: string) => { email: string; option: number }[];
  acksOf: (msg: string) => string[];
  starred: Set<string>;
  assets: AssetLite[];
  typing: Record<string, string[]>;
  now: number;
  reload: () => Promise<void>;
  say: (t: string) => void;
  open: (room: string | null) => void;
  typingPing: () => void;
  send: (room: string, kind: ChatMessage['kind'], body: string, data?: Record<string, unknown> | null, opts?: SendOpts) => Promise<Result>;
  rpc: (fn: string, args: Record<string, unknown>, ok?: string) => Promise<Result>;
  upload: (file: File, onProgress: (f: number) => void) => Promise<UploadedFile>;
};

const ChatContext = createContext<Ctx | null>(null);
export function useChat(): Ctx {
  const v = useContext(ChatContext);
  if (!v) throw Error('Chat provider missing');
  return v;
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const account = useAccount();
  const { state, dispatch } = useHub();
  const role: Role = account.role === 'admin' ? state.role : account.role;
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<{ message_id: string; email: string; kind: string }[]>([]);
  const [votes, setVotes] = useState<{ message_id: string; email: string; option: number }[]>([]);
  const [acks, setAcks] = useState<{ message_id: string; email: string }[]>([]);
  const [stars, setStars] = useState<Set<string>>(new Set());
  const [assets, setAssets] = useState<AssetLite[]>([]);
  const [typing, setTyping] = useState<Record<string, string[]>>({});
  const [now, setNow] = useState(() => Date.now());
  const openRoom = useRef<string | null>(null);
  const typingChannel = useRef<RealtimeChannel | null>(null);
  const lastPing = useRef(0);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((text: string) => dispatch({ type: 'notify', text }), [dispatch]);

  const load = useCallback(async () => {
    const db = supabase();
    const r = await db.from('chat_rooms').select('*').order('last_at', { ascending: false });
    if (r.error) return setStatus('error');
    const ids = (r.data as RoomRow[]).map((x) => x.id);
    const none = Promise.resolve({ data: [], error: null });
    const [mem, msg, a] = await Promise.all([
      ids.length ? db.from('chat_members').select('*').in('room_id', ids) : none,
      ids.length ? db.from('chat_messages').select('*').in('room_id', ids).order('created_at', { ascending: true }).limit(5000) : none,
      db.from('media_files').select('id, name, kind, stage, current_version, approved_version, size_bytes'),
    ]);
    if (mem.error || msg.error) return setStatus('error');
    const mids = (msg.data as ChatMessage[]).map((x) => x.id);
    const chunk = mids.slice(-2000);
    const [re, vo, ac, st] = await Promise.all([
      chunk.length ? db.from('chat_reactions').select('*').in('message_id', chunk) : none,
      chunk.length ? db.from('chat_votes').select('*').in('message_id', chunk) : none,
      chunk.length ? db.from('chat_acks').select('message_id, email').in('message_id', chunk) : none,
      db.from('chat_stars').select('message_id'),
    ]);
    setRooms(r.data as RoomRow[]);
    setMembers(mem.data as MemberRow[]);
    setMessages(msg.data as ChatMessage[]);
    setPending([]);
    setReactions((re.data ?? []) as typeof reactions);
    setVotes((vo.data ?? []) as typeof votes);
    setAcks((ac.data ?? []) as typeof acks);
    setStars(new Set(((st.data ?? []) as { message_id: string }[]).map((x) => x.message_id)));
    setAssets((a.data ?? []) as AssetLite[]);
    setNow(Date.now());
    setStatus('ready');
  }, []);

  const soon = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(async () => {
      await load();
      // The open room counts as read as soon as new messages arrive in it.
      const room = openRoom.current;
      if (room && document.visibilityState === 'visible') await supabase().rpc('chat_state', { p_room: room, p_patch: { read: true } });
    }, 250);
  }, [load]);

  // Live: any change in a room this person can see reloads (row level security filters the stream).
  useEffect(() => {
    void load();
    const db = supabase();
    const ch = db.channel('chat-live');
    for (const table of ['chat_messages', 'chat_members', 'chat_reactions', 'chat_votes', 'chat_acks', 'chat_rooms'])
      ch.on('postgres_changes', { event: '*', schema: 'public', table }, soon);
    ch.subscribe();
    const poll = setInterval(() => void load(), 30_000);
    const clock = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      void db.removeChannel(ch);
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [load, soon]);

  // Typing: a broadcast on the open room's own channel; nothing is stored.
  const open = useCallback(
    (room: string | null) => {
      openRoom.current = room;
      const db = supabase();
      if (typingChannel.current) void db.removeChannel(typingChannel.current);
      typingChannel.current = null;
      if (!room) return;
      const ch = db.channel(`room:${room}`, { config: { broadcast: { self: false } } });
      ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
        const who = (payload as { email?: string }).email;
        if (!who) return;
        setTyping((t) => ({ ...t, [room]: [...new Set([...(t[room] ?? []), who])] }));
        setTimeout(() => setTyping((t) => ({ ...t, [room]: (t[room] ?? []).filter((x) => x !== who) })), 4000);
      });
      ch.subscribe();
      typingChannel.current = ch;
      void db.rpc('chat_state', { p_room: room, p_patch: { read: true } }).then(() =>
        setMembers((all) => all.map((m) => (m.room_id === room && m.email === account.email ? { ...m, last_read_at: new Date().toISOString() } : m))),
      );
    },
    [account.email],
  );

  const value = useMemo<Ctx>(() => {
    const all = [...messages, ...pending];
    return {
      status,
      me: account.email,
      role,
      rooms,
      membersOf: (room) => members.filter((m) => m.room_id === room),
      myMember: (room) => members.find((m) => m.room_id === room && m.email === account.email),
      messagesOf: (room) => all.filter((m) => m.room_id === room),
      reactionsOf: (msg) => reactions.filter((r) => r.message_id === msg),
      votesOf: (msg) => votes.filter((v) => v.message_id === msg),
      acksOf: (msg) => acks.filter((a) => a.message_id === msg).map((a) => a.email),
      starred: stars,
      assets,
      typing,
      now,
      reload: load,
      say,
      open,
      typingPing() {
        const ch = typingChannel.current;
        if (!ch || Date.now() - lastPing.current < 2500) return;
        lastPing.current = Date.now();
        void ch.send({ type: 'broadcast', event: 'typing', payload: { email: account.email } });
      },
      async send(room, kind, body, data = null, opts = {}) {
        // Text appears at once; the database confirms it a moment later.
        const tmp: ChatMessage | null =
          kind === 'text'
            ? {
                id: `tmp-${Date.now()}`, room_id: room, author: account.email, kind, body, reply_to: opts.reply ?? null,
                forwarded: !!opts.forward, urgency: opts.urgency ?? 0, data: null, deleted: false, edited_at: null,
                created_at: new Date().toISOString(),
              }
            : null;
        if (tmp) setPending((p) => [...p, tmp]);
        const { data: id, error } = await supabase().rpc('chat_send', {
          p_room: room, p_kind: kind, p_body: body, p_reply: opts.reply ?? null, p_data: data,
          p_urgency: opts.urgency ?? 0, p_forward: !!opts.forward,
        });
        if (error) {
          if (tmp) setPending((p) => p.filter((x) => x.id !== tmp.id));
          return { ok: false, error: chatErrorText(error.message) };
        }
        await load();
        return { ok: true, id: id as string };
      },
      async rpc(fn, args, ok) {
        const { data, error } = await supabase().rpc(fn, args);
        if (error) return { ok: false, error: chatErrorText(error.message) };
        await load();
        if (ok) say(ok);
        return { ok: true, id: typeof data === 'string' ? data : undefined };
      },
      upload: uploadAttachment,
    };
  }, [status, account.email, role, rooms, members, messages, pending, reactions, votes, acks, stars, assets, typing, now, load, say, open]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

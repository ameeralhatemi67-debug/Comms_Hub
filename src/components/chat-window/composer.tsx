'use client';
// The window's one message box (MVP_draft.md 74.3). Where it sends is always shown above it.
// @ as the first word picks the destination, @ later in the text mentions a member of it, / is
// a quick action, and + above the send button holds the same actions. Messages go through the
// messaging provider (chat_send, chat_open_dm, chat_global_room, chat_work_room) and mail through
// the mail provider (mail_send, with its ten seconds to take it back), as on the mail page.
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  AtSign,
  BadgeCheck,
  Briefcase,
  BriefcaseBusiness,
  ChevronDown,
  FileText,
  Forward as ForwardIcon,
  Globe,
  Images,
  KeyRound,
  ListChecks,
  Mail,
  Maximize2,
  Mic,
  NotebookPen,
  Paperclip,
  Plus,
  Reply,
  ReplyAll,
  SendHorizontal,
  Siren,
  Trash2,
  Users,
  Vote,
  X,
} from 'lucide-react';
import { COMMANDS, canAssign, hhmm, snippet, urgencySteps, waveform, type RoomRow, type Urgency } from '@/lib/chat/rules';
import { isEmail, needsApproval, type View } from '@/lib/mail/rules';
import {
  boxTrigger,
  defaultDest,
  dropAddress,
  dropCommand,
  matches,
  membersAr,
  needsGlobalConfirm,
  recipientsAr,
  sameDest,
  type Dest,
} from '@/lib/chat-window/rules';
import { useChat } from '../chat/provider';
import { useMail } from '../mail/provider';
import { usePeople } from '../people';
import { useCaps } from '../caps';
import { Composer, blankDraft, type Draft } from '../mail/composer';
import { composeDraft, quickOutgoing, signatureOf, useDrafts } from '../mail/compose';
import type { ComposerSlot, DialogState } from '../chat/chat-tab';
import { useWin } from './state';
import { isGlobal, isWorkRoom, useRoomName } from './chat-pane';
import { useMyWorks } from './works';

type Item = { key: string; label: string; meta: string; icon: ReactNode; pick: () => void };
type Group = { title: string; items: Item[] };
type Pop = { kind: 'addr' | 'cmd' | 'men' | 'to'; q: string; i: number };
type ReplyMode = 'reply' | 'replyall' | 'note';
type Upload = { key: string; name: string; progress: number; error?: string };

const CMD_ICON: Record<(typeof COMMANDS)[number]['id'], ReactNode> = {
  task: <ListChecks aria-hidden />,
  poll: <Vote aria-hidden />,
  approval: <BadgeCheck aria-hidden />,
  asset: <Images aria-hidden />,
  work: <BriefcaseBusiness aria-hidden />,
  urgent: <Siren aria-hidden />,
  mail: <Mail aria-hidden />,
  perm: <KeyRound aria-hidden />,
};

const ACT_AR: Record<(typeof COMMANDS)[number]['id'], string> = {
  task: 'مهمة',
  poll: 'تصويت',
  approval: 'طلب اعتماد',
  asset: 'أصل من المكتبة',
  work: 'مشاركة عمل',
  urgent: 'درجة الأهمية',
  mail: 'نقل إلى البريد',
  perm: 'طلب صلاحية',
};

const stubRoom = (id: string, type: RoomRow['type']): RoomRow => ({
  id, type, name: null, description: null, link: null, dm_key: null, pinned_message: null, created_by: '', created_at: '', last_at: '',
});

export function Box({ slot, onDialog }: { slot?: ComposerSlot; onDialog: (d: DialogState, room: RoomRow | null) => void }) {
  const w = useWin();
  const c = useChat();
  const m = useMail();
  const people = usePeople();
  const caps = useCaps();
  const works = useMyWorks();
  const roomName = useRoomName();
  const [drafts, setDrafts] = useDrafts(m.me);
  const ta = useRef<HTMLTextAreaElement>(null);
  const toInput = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [pop, setPop] = useState<Pop | null>(null);
  const [menu, setMenu] = useState<null | 'main' | 'urgency'>(null);
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState<{ text: string; open?: () => void } | null>(null);
  const [error, setError] = useState('');
  const [toQ, setToQ] = useState('');
  const [ccOn, setCcOn] = useState(false);
  const [replyMode, setReplyMode] = useState<ReplyMode>('reply');
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [full, setFull] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [rec, setRec] = useState<null | { t: number; levels: number[] }>(null);
  const recRef = useRef<{ mr: MediaRecorder; stream: MediaStream; ctx: AudioContext; timer: ReturnType<typeof setInterval>; chunks: Blob[]; levels: number[]; start: number } | null>(null);
  const [more, setMore] = useState(false);

  const box = w.box;
  const globalRoom = c.rooms.find(isGlobal);
  const pendingDest: Dest | null = w.pending ? (w.pending.k === 'all' ? { k: 'all' } : { k: 'work', id: w.pending.id, title: w.pending.title }) : null;
  const base: Dest = slot ? { k: 'room', id: slot.room.id } : (pendingDest ?? defaultDest(w.mode, w.room, w.thread, globalRoom?.id ?? null));
  const dest: Dest = box.dest ?? base;
  const isMail = dest.k === 'mail' || dest.k === 'reply';
  const destRoom = dest.k === 'room' ? c.rooms.find((r) => r.id === dest.id) : undefined;
  const view: View | undefined = dest.k === 'reply' ? m.viewOf(dest.thread) : undefined;
  const urgency: Urgency = slot && !box.dest ? slot.urgency : box.urgency;
  const setUrgency = (u: Urgency) => (slot && !box.dest ? slot.setUrgency(u) : w.setBox({ urgency: u }));
  const enterSends = people.me?.profile?.enter_sends ?? true;
  const canPost = !destRoom || destRoom.type !== 'channel' || !!c.myMember(destRoom.id)?.admin || c.role === 'admin';

  useEffect(() => {
    w.focusBox.current = () => (isMail && dest.k === 'mail' && !box.to.length ? toInput.current : ta.current)?.focus();
  });
  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + 2, 180)}px`;
  }, [box.text, w.tier]);
  useEffect(() => {
    setConfirm(false);
    setError('');
  }, [dest.k, dest.k === 'room' ? dest.id : '']);
  useEffect(() => {
    if (slot?.edit) w.setBox({ text: slot.edit.body });
  }, [slot?.edit?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!menu) return;
    const out = (e: MouseEvent) => !rootRef.current?.contains(e.target as Node) && setMenu(null);
    document.addEventListener('mousedown', out);
    return () => document.removeEventListener('mousedown', out);
  }, [menu]);
  useEffect(() => {
    // Escape closes an open menu or list even when the focus left the box (a button that hid itself).
    if (!menu && !pop) return;
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setMenu(null);
      setPop(null);
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [menu, pop]);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 7000);
    return () => clearTimeout(t);
  }, [note]);
  useEffect(() => () => stopRec(false), []); // eslint-disable-line react-hooks/exhaustive-deps

  const focus = () => requestAnimationFrame(() => ta.current?.focus());
  const choose = (d: Dest) => {
    w.setBox((b) => ({ dest: sameDest(d, base) ? null : d, text: dropAddress(b.text) }));
    slot?.clearReply();
    setPop(null);
    focus();
  };
  const nameOfDest = (d: Dest) =>
    d.k === 'room' ? roomName(c.rooms.find((r) => r.id === d.id) ?? stubRoom(d.id, 'group')) || 'محادثة'
    : d.k === 'person' ? people.nameOf(d.email)
    : d.k === 'all' ? 'العام'
    : d.k === 'work' ? d.title
    : d.k === 'reply' ? 'الرد'
    : 'بريد جديد';

  // Pickers
  const workDest = (id: string, title: string): Dest => {
    const r = c.rooms.find((x) => isWorkRoom(x, id));
    return r ? { k: 'room', id: r.id } : { k: 'work', id, title };
  };
  const personDest = (email: string): Dest => {
    const r = c.rooms.find((x) => x.type === 'dm' && c.membersOf(x.id).some((mm) => mm.email === email));
    return r ? { k: 'room', id: r.id } : { k: 'person', email };
  };
  const face = (cls: string, icon: ReactNode) => <span className={`cw-face sm ${cls}`}>{icon}</span>;
  const others = people.people.filter((p) => p.email !== c.me);

  const groups: Group[] = (() => {
    if (!pop) return [];
    const q = pop.q;
    if (pop.kind === 'cmd')
      return [
        {
          title: 'إجراءات سريعة',
          items: COMMANDS.filter((x) => x.word.startsWith(q))
            .map((x) => ({ key: x.id, label: `/${x.word}`, meta: x.hint, icon: face('t-act', CMD_ICON[x.id]), pick: () => (w.setBox((b) => ({ text: dropCommand(b.text) })), setPop(null), void act(x.id)) })),
        },
      ];
    if (pop.kind === 'men') {
      const pool = destRoom ? c.membersOf(destRoom.id).map((x) => x.email) : others.map((p) => p.email);
      return [
        {
          title: `إشارة إلى عضو في «${nameOfDest(dest)}»`,
          items: pool
            .filter((e) => e !== c.me && people.nameOf(e).startsWith(q))
            .slice(0, 8)
            .map((e) => ({ key: e, label: people.nameOf(e), meta: people.personOf(e) ? '' : '', icon: face('t-dm', <AtSign aria-hidden />), pick: () => mention(e) })),
        },
      ];
    }
    if (pop.kind === 'to') {
      const items: Item[] = others
        .filter((p) => !box.to.includes(`p:${p.email}`) && matches(q, p.display_name))
        .slice(0, 8)
        .map((p) => ({ key: p.email, label: p.display_name, meta: 'داخلي', icon: face('t-dm', <Users aria-hidden />), pick: () => addTo(`p:${p.email}`) }));
      if (isEmail(q) && !box.to.includes(`e:${q.trim()}`))
        items.unshift({ key: `e:${q}`, label: q.trim(), meta: 'عنوان خارجي، من صندوق القسم المشترك', icon: face('t-ext', <Mail aria-hidden />), pick: () => addTo(`e:${q.trim()}`) });
      return [{ title: 'أضف مستلماً', items }];
    }
    const out: Group[] = [];
    out.push({
      title: 'العام',
      items: matches(q, 'العام') ? [{ key: 'all', label: 'العام', meta: `كل أعضاء المركز${globalRoom ? ` · ${membersAr(c.membersOf(globalRoom.id).length)}` : ''}`, icon: face('t-all', <Globe aria-hidden />), pick: () => choose(globalRoom ? { k: 'room', id: globalRoom.id } : { k: 'all' }) }] : [],
    });
    out.push({
      title: 'أعمالك',
      items: works
        .filter((x) => matches(q, x.title, x.id))
        .slice(0, 8)
        .map((x) => ({ key: x.id, label: x.title, meta: x.id, icon: face('t-work', <Briefcase aria-hidden />), pick: () => choose(workDest(x.id, x.title)) })),
    });
    out.push({
      title: 'المجموعات والقنوات',
      items: c.rooms
        .filter((r) => r.type !== 'dm' && !isGlobal(r) && !isWorkRoom(r) && matches(q, r.name))
        .slice(0, 8)
        .map((r) => ({ key: r.id, label: r.name ?? '', meta: r.type === 'channel' ? 'قناة' : membersAr(c.membersOf(r.id).length), icon: face('t-group', <Users aria-hidden />), pick: () => choose({ k: 'room', id: r.id }) })),
    });
    out.push({
      title: 'الأشخاص',
      items: others
        .filter((p) => matches(q, p.display_name))
        .slice(0, 8)
        .map((p) => ({ key: p.email, label: p.display_name, meta: 'رسالة خاصة', icon: face('t-dm', <AtSign aria-hidden />), pick: () => choose(personDest(p.email)) })),
    });
    const mailItems: Item[] = [];
    if (isEmail(q)) mailItems.push({ key: 'ext', label: `بريد خارجي إلى ${q.trim()}`, meta: 'من صندوق القسم المشترك', icon: face('t-ext', <Mail aria-hidden />), pick: () => toMail([`e:${q.trim()}`]) });
    if (!q || matches(q, 'بريد')) mailItems.push({ key: 'new', label: 'بريد جديد', meta: 'تختار المستلمين والموضوع بعدها', icon: face('t-mail', <Mail aria-hidden />), pick: () => toMail([]) });
    if (q && !isEmail(q))
      others
        .filter((p) => matches(q, p.display_name))
        .slice(0, 3)
        .forEach((p) => mailItems.push({ key: `m-${p.email}`, label: `بريد إلى ${p.display_name}`, meta: 'رسالة بريد داخلية', icon: face('t-mail', <Mail aria-hidden />), pick: () => toMail([`p:${p.email}`]) }));
    out.push({ title: 'بريد', items: mailItems });
    return out.filter((g) => g.items.length);
  })();
  const flat = groups.flatMap((g) => g.items);

  function mention(email: string) {
    const el = ta.current;
    const at = el?.selectionStart ?? box.text.length;
    const before = box.text.slice(0, at).replace(/@[^\s@]*$/, `@${people.nameOf(email)} `);
    w.setBox({ text: before + box.text.slice(at) });
    setPop(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  }
  function addTo(tok: string) {
    w.setBox((b) => ({ to: [...b.to, tok] }));
    setToQ('');
    setPop(null);
    setError('');
    toInput.current?.focus();
  }
  function toMail(to: string[]) {
    w.setBox((b) => ({ dest: { k: 'mail' }, to: [...new Set([...b.to, ...to])], text: dropAddress(b.text) }));
    setPop(null);
    requestAnimationFrame(() => (to.length ? ta.current : toInput.current)?.focus());
  }

  // Where a chat message lands: the room, or the room that the first message starts.
  async function roomFor(d: Dest): Promise<string | null> {
    if (d.k === 'room') return d.id;
    const r =
      d.k === 'person' ? await c.rpc('chat_open_dm', { p_email: d.email })
      : d.k === 'all' ? await c.rpc('chat_global_room', {})
      : d.k === 'work' ? await c.rpc('chat_work_room', { p_work: d.id })
      : null;
    if (!r) return null;
    if (!r.ok) {
      setError(r.error);
      return null;
    }
    return r.id ?? null;
  }
  const isGlobalDest = (d: Dest) => d.k === 'all' || (d.k === 'room' && !!globalRoom && d.id === globalRoom.id);
  const landed = (rid: string, d: Dest) => {
    if (w.pending) return w.openRoom(rid);
    if (!slot || rid !== slot.room.id) setNote({ text: `أُرسلت إلى «${nameOfDest(d)}».`, open: () => w.openRoom(rid) });
  };

  async function sendChat(force = false) {
    const text = box.text.trim();
    if (!text) return;
    if (!canPost) return setError('الكتابة في هذه القناة لمشرفيها.');
    if (slot?.edit && !box.dest) {
      const r = await c.rpc('chat_edit', { p_msg: slot.edit.id, p_body: text }, 'عُدّلت الرسالة.');
      if (!r.ok) return setError(r.error);
      slot.clearEdit();
      w.setBox({ text: '' });
      return;
    }
    if (needsGlobalConfirm(isGlobalDest(dest), w.globalOk) && !force) return setConfirm(true);
    setBusy(true);
    const d = dest;
    const rid = await roomFor(d);
    if (!rid) return setBusy(false);
    const r = await c.send(rid, 'text', text, null, { reply: slot && !box.dest ? slot.reply?.id : undefined, urgency });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    if (isGlobalDest(d)) w.setGlobalOk(true);
    setConfirm(false);
    slot?.clearReply();
    setUrgency(0);
    w.setBox({ text: '', dest: null, urgency: 0 });
    landed(rid, d);
  }

  function sendMail() {
    const text = box.text.trim();
    const sig = signatureOf(m, people.me?.profile?.signature);
    if (dest.k === 'reply') {
      if (!text) return setError('اكتب نص الرد أولاً.');
      if (replyMode === 'note') {
        void m.call('mail_note', { p_thread: dest.thread, p_body: text }, 'أُضيفت الملاحظة الداخلية.').then((r) => (r.ok ? w.setBox({ text: '' }) : setError(r.error)));
        return;
      }
      const d = { ...composeDraft(m, { mode: replyMode, thread: dest.thread, body: text }), files: box.files };
      const keep = box;
      m.send(quickOutgoing(d, sig), 'يُرسل الرد', () => w.setBox(keep));
      w.setBox({ text: '', files: [] });
      return;
    }
    if (!box.to.length) {
      setError('أضف مستلماً واحداً على الأقل.');
      toInput.current?.focus();
      return;
    }
    if (!box.subject.trim()) return setError('اكتب موضوع الرسالة.');
    if (!text && !box.files.length) return setError('اكتب نص الرسالة.');
    const d = blankDraft({ to: box.to, cc: box.cc, subject: box.subject.trim(), body: text, files: box.files });
    const keep = box;
    m.send(quickOutgoing(d, sig), 'يُرسل البريد', () => w.setBox(keep));
    w.setBox({ text: '', dest: null, to: [], cc: [], subject: '', files: [] });
    setCcOn(false);
  }

  const send = (force = false) => (isMail ? sendMail() : void sendChat(force));

  // Quick actions: the messaging tab's own dialogs, opened on the destination's room.
  async function act(id: (typeof COMMANDS)[number]['id']) {
    setMenu(null);
    if (slot && !box.dest) return slot.onCommand(id);
    if (id === 'mail') return toMail(destRoom && destRoom.type !== 'dm' ? c.membersOf(destRoom.id).filter((x) => x.email !== c.me).map((x) => `p:${x.email}`) : dest.k === 'person' ? [`p:${dest.email}`] : []);
    if (id === 'urgent') return setMenu('urgency');
    if (id === 'perm') return onDialog({ kind: 'perm' }, null);
    if (id === 'task' && !canAssign(c.role)) return setError('إسناد المهام لمدير الاتصال ومساعده والمنتج الإعلامي.');
    const rid = await roomFor(dest);
    if (!rid) return;
    const room = c.rooms.find((r) => r.id === rid) ?? stubRoom(rid, dest.k === 'person' ? 'dm' : 'group');
    if (w.pending) w.openRoom(rid);
    onDialog({ kind: id } as DialogState, room);
  }

  async function attach(files: FileList | File[], kind?: 'voice', extra?: Record<string, unknown>) {
    for (const f of Array.from(files)) {
      const key = `${f.name}-${Date.now()}`;
      setUploads((u) => [...u, { key, name: f.name, progress: 0 }]);
      try {
        if (isMail) {
          const up = await m.upload(f, (progress) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, progress } : x))));
          w.setBox((b) => ({ files: [...b.files, up] }));
        } else {
          const rid = await roomFor(dest);
          if (!rid) throw new Error('تعذّر تحديد المحادثة.');
          const up = await c.upload(f, (progress) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, progress } : x))));
          const k = kind ?? (f.type.startsWith('image/') ? 'image' : 'file');
          const r = await c.send(rid, k, '', { file: up.id, ...(extra ?? {}) }, { reply: slot && !box.dest ? slot.reply?.id : undefined });
          if (!r.ok) throw new Error(r.error);
          landed(rid, dest);
        }
        setUploads((u) => u.filter((x) => x.key !== key));
      } catch (e) {
        setUploads((u) => u.map((x) => (x.key === key ? { ...x, error: e instanceof Error ? e.message : 'تعذّر الرفع.' } : x)));
      }
    }
  }

  // Voice notes, recorded in the browser as on the messaging tab.
  async function startRec() {
    setMenu(null);
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) return setError('هذا المتصفح لا يدعم التسجيل الصوتي.');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return setError('لم يُسمح بالوصول إلى الميكروفون. اسمح به من إعدادات المتصفح ثم أعد المحاولة.');
    }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) => MediaRecorder.isTypeSupported(t));
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const ctx = new AudioContext();
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    const levels: number[] = [];
    const start = Date.now();
    const timer = setInterval(() => {
      an.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128) / 128);
      levels.push(peak);
      setRec({ t: Math.floor((Date.now() - start) / 1000), levels: levels.slice(-28) });
      if (Date.now() - start > 5 * 60000) stopRec(true);
    }, 100);
    recRef.current = { mr, stream, ctx, timer, chunks, levels, start };
    mr.start(250);
    setRec({ t: 0, levels: [] });
  }
  function stopRec(sendIt: boolean) {
    const r = recRef.current;
    if (!r) return;
    recRef.current = null;
    clearInterval(r.timer);
    setRec(null);
    r.mr.onstop = () => {
      r.stream.getTracks().forEach((t) => t.stop());
      void r.ctx.close();
      if (!sendIt) return;
      const type = r.mr.mimeType || 'audio/webm';
      const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
      const blob = new Blob(r.chunks, { type });
      const secs = Math.max(1, Math.round((Date.now() - r.start) / 1000));
      if (blob.size < 200) return setError('التسجيل قصير جداً.');
      const f = new File([blob], `رسالة-صوتية-${hhmm(new Date().toISOString()).replace(':', '')}.${ext}`, { type });
      void attach([f], 'voice', { dur: secs, wave: waveform(r.levels) });
    };
    r.mr.stop();
  }

  function openFull() {
    setMenu(null);
    const d =
      dest.k === 'reply'
        ? { ...composeDraft(m, { mode: replyMode === 'note' ? 'reply' : replyMode, thread: dest.thread, body: box.text }), files: box.files }
        : blankDraft({ to: box.to, cc: box.cc, showCc: box.cc.length > 0, subject: box.subject, body: box.text, files: box.files });
    setFull(d);
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (pop && flat.length) {
      if (e.key === 'ArrowDown') return e.preventDefault(), setPop({ ...pop, i: (pop.i + 1) % flat.length });
      if (e.key === 'ArrowUp') return e.preventDefault(), setPop({ ...pop, i: (pop.i - 1 + flat.length) % flat.length });
      if (e.key === 'Enter' || e.key === 'Tab') return e.preventDefault(), flat[Math.min(pop.i, flat.length - 1)].pick();
    }
    if (e.key === 'Escape' && (pop || menu || confirm || slot?.reply || slot?.edit)) {
      e.preventDefault();
      if (pop) setPop(null);
      else if (menu) setMenu(null);
      else if (confirm) setConfirm(false);
      else if (slot?.reply) slot.clearReply();
      else if (slot?.edit) (slot.clearEdit(), w.setBox({ text: '' }));
      return;
    }
    if (e.currentTarget === toInput.current) {
      if (e.key === 'Backspace' && !toQ && box.to.length) w.setBox((b) => ({ to: b.to.slice(0, -1) }));
      if (e.key === 'Enter' && isEmail(toQ)) (e.preventDefault(), addTo(`e:${toQ.trim()}`));
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      if (isMail ? e.ctrlKey || e.metaKey : enterSends || e.ctrlKey || e.metaKey) {
        e.preventDefault();
        send();
      }
    }
    if (e.key === 'ArrowUp' && !box.text && slot && !isMail) {
      e.preventDefault();
      slot.editLast();
    }
  };

  // The destination's label.
  const chip = (() => {
    if (dest.k === 'room') {
      const r = destRoom;
      const glob = r && isGlobal(r);
      const meta = !r ? '' : glob ? membersAr(c.membersOf(r.id).length) : r.type === 'dm' ? 'رسالة خاصة' : r.link?.type === 'work' ? r.link.id : r.type === 'channel' ? 'قناة' : membersAr(c.membersOf(r.id).length);
      return { cls: glob ? 'k-all' : r?.link?.type === 'work' ? 'k-work' : r?.type === 'dm' ? 'k-dm' : 'k-group', icon: glob ? <Globe aria-hidden /> : r?.type === 'dm' ? <AtSign aria-hidden /> : r?.link?.type === 'work' ? <Briefcase aria-hidden /> : <Users aria-hidden />, name: r ? roomName(r) : 'محادثة', meta };
    }
    if (dest.k === 'person') return { cls: 'k-dm', icon: <AtSign aria-hidden />, name: people.nameOf(dest.email), meta: 'رسالة خاصة جديدة' };
    if (dest.k === 'all') return { cls: 'k-all', icon: <Globe aria-hidden />, name: 'العام', meta: 'كل أعضاء المركز' };
    if (dest.k === 'work') return { cls: 'k-work', icon: <Briefcase aria-hidden />, name: dest.title, meta: `${dest.id} · محادثة جديدة` };
    if (dest.k === 'reply') return { cls: 'k-mail', icon: replyMode === 'note' ? <NotebookPen aria-hidden /> : replyMode === 'replyall' ? <ReplyAll aria-hidden /> : <Reply aria-hidden />, name: `${replyMode === 'note' ? 'ملاحظة داخلية على' : replyMode === 'replyall' ? 'رد على الكل:' : 'رد على:'} ${view?.thread.subject ?? ''}`, meta: view?.thread.kind === 'external' ? 'خارجي' : 'داخلي' };
    return { cls: 'k-mail', icon: <Mail aria-hidden />, name: 'بريد جديد', meta: recipientsAr(box.to.length) };
  })();

  const external = dest.k === 'mail' ? box.to.some((t) => t.startsWith('e:')) : view?.thread.kind === 'external';
  const gated =
    isMail && external && replyMode !== 'note' &&
    needsApproval({ role: m.role, me: m.me, external: true, newThread: dest.k === 'mail', assignee: view?.thread.assignee ?? null, canOutside: caps.has('mail.outside.send') });
  const dnd = (() => {
    const r = destRoom;
    const email = dest.k === 'person' ? dest.email : r?.type === 'dm' ? c.membersOf(r.id).find((x) => x.email !== c.me)?.email : undefined;
    const p = email ? people.personOf(email) : undefined;
    return p?.profile?.presence === 'dnd' && !isMail ? p.display_name : '';
  })();
  const placeholder = isMail
    ? dest.k === 'reply' ? (replyMode === 'note' ? 'ملاحظة يراها الفريق فقط…' : 'اكتب ردك… Ctrl+Enter للإرسال') : 'نص الرسالة… Ctrl+Enter للإرسال'
    : w.tier === 'side' ? 'اكتب رسالة… ابدأ بـ @ لتغيير الوجهة' : 'اكتب رسالة… ابدأ بـ @ لتختار من تُرسل إليه، و / للإجراءات';
  const wide = w.tier !== 'side';

  return (
    <div
      className="cw-box"
      ref={rootRef}
      onKeyDown={(e) => {
        // Escape closes the menu or the list first; only then does it reach the window and minimise it.
        if (e.key !== 'Escape' || (!menu && !pop)) return;
        e.preventDefault();
        setMenu(null);
        setPop(null);
      }}
    >
      {pop && flat.length > 0 && (
        <div className="cw-pop" role="listbox" aria-label={pop.kind === 'addr' ? 'إلى من تُرسل؟' : 'اختيار'}>
          <div className="cw-pt">
            <span>{pop.kind === 'addr' ? 'إلى من تُرسل؟' : pop.kind === 'men' ? 'إشارة' : pop.kind === 'cmd' ? 'إجراء سريع' : 'المستلمون'}</span>
            <span>الأسهم ثم Enter</span>
          </div>
          {groups.map((g) => (
            <div key={g.title}>
              <h4>{g.title}</h4>
              {g.items.map((it) => {
                const i = flat.indexOf(it);
                return (
                  <button
                    type="button"
                    key={it.key}
                    role="option"
                    aria-selected={i === pop.i}
                    className={`cw-opt ${i === pop.i ? 'on' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setPop({ ...pop, i })}
                    onClick={it.pick}
                  >
                    {it.icon}
                    <span className="tx">
                      <b>{it.label}</b>
                      {it.meta && <small>{it.meta}</small>}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {menu && (
        <div className={`cw-menu ${wide ? 'wide' : ''}`} role="menu">
          {menu === 'urgency' ? (
            <div className="cw-ag">
              {urgencySteps(caps.has)
                .filter((s) => s.level > 0)
                .map((s) => (
                  <button key={s.level} type="button" role="menuitem" className="cw-act" disabled={!s.ok} title={s.why || s.hint} onClick={() => (setUrgency(s.level), setMenu(null), focus())}>
                    <span className={`cw-urg u${s.level}`}>{s.label}</span>
                    <span>
                      <small>{s.ok ? s.hint : s.why}</small>
                    </span>
                  </button>
                ))}
            </div>
          ) : isMail ? (
            <div className="cw-ag">
              {dest.k === 'reply' && (
                <>
                  <MenuItem icon={<Reply aria-hidden />} title="رد" hint="على آخر رسالة" on={replyMode === 'reply'} onClick={() => (setReplyMode('reply'), setMenu(null))} />
                  {view?.thread.kind === 'internal' && <MenuItem icon={<ReplyAll aria-hidden />} title="رد على الكل" hint="كل من في المحادثة" on={replyMode === 'replyall'} onClick={() => (setReplyMode('replyall'), setMenu(null))} />}
                  <MenuItem
                    icon={<ForwardIcon aria-hidden />}
                    title="إعادة توجيه"
                    hint="بريد جديد بنص الرسالة"
                    onClick={() => {
                      const d = composeDraft(m, { mode: 'forward', thread: dest.thread, body: box.text });
                      w.setBox({ dest: { k: 'mail' }, to: [], subject: d.subject, text: d.body, files: d.files });
                      setMenu(null);
                      requestAnimationFrame(() => toInput.current?.focus());
                    }}
                  />
                  {view?.thread.kind === 'external' && <MenuItem icon={<NotebookPen aria-hidden />} title="ملاحظة داخلية" hint="يراها الفريق فقط" on={replyMode === 'note'} onClick={() => (setReplyMode('note'), setMenu(null))} />}
                </>
              )}
              <MenuItem icon={<Paperclip aria-hidden />} title="إرفاق ملف" hint="من هذا الجهاز، حتى 25 م.ب" onClick={() => (setMenu(null), fileRef.current?.click())} />
              {dest.k === 'mail' && <MenuItem icon={<Users aria-hidden />} title="نسخة إلى" hint="مستلمون للعلم" onClick={() => (setCcOn(true), setMenu(null))} />}
              <MenuItem icon={<Maximize2 aria-hidden />} title="المحرر الكامل" hint="بطاقات، جدولة، نسخة مخفية، قوالب" onClick={openFull} />
            </div>
          ) : (
            <div className="cw-ag">
              <MenuItem icon={<Paperclip aria-hidden />} title="إرفاق ملف أو صورة" hint="من هذا الجهاز" onClick={() => (setMenu(null), fileRef.current?.click())} />
              <MenuItem icon={<Mic aria-hidden />} title="رسالة صوتية" hint="سجّل ثم أرسل" onClick={() => void startRec()} />
              {COMMANDS.filter((x) => wide || more || x.id === 'task' || x.id === 'poll').map((x) => (
                <MenuItem key={x.id} icon={CMD_ICON[x.id]} title={ACT_AR[x.id]} hint={x.hint} onClick={() => void act(x.id)} />
              ))}
              {!wide && !more && (
                <button type="button" className="cw-more" onClick={() => setMore(true)}>
                  <ChevronDown aria-hidden />
                  المزيد
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="cw-dest">
        {dest.k !== 'reply' && <span>إلى</span>}
        <button
          type="button"
          className={`cw-to ${chip.cls}`}
          disabled={dest.k === 'reply'}
          title={dest.k === 'reply' ? chip.name : 'تغيير الوجهة'}
          onClick={() => {
            if (isMail) return toInput.current?.focus();
            setMenu(null);
            setPop({ kind: 'addr', q: '', i: 0 });
            focus();
          }}
        >
          <span className="fc">{chip.icon}</span>
          <b>{chip.name}</b>
          {chip.meta && <small>{chip.meta}</small>}
          {dest.k !== 'reply' && <ChevronDown aria-hidden />}
        </button>
        {box.dest && (
          <button type="button" className="cw-ib sm" aria-label={`العودة إلى «${nameOfDest(base)}»`} title={`العودة إلى «${nameOfDest(base)}»`} onClick={() => w.setBox({ dest: null })}>
            <X aria-hidden />
          </button>
        )}
        {box.dest && wide && <span className="cw-was">بدلاً من «{nameOfDest(base)}»</span>}
        {urgency > 0 && !isMail && (
          <span className={`cw-urg u${urgency}`}>
            {['', 'للانتباه', 'مهم', 'عاجل'][urgency]}
            <button type="button" aria-label="إلغاء درجة الأهمية" onClick={() => setUrgency(0)}>
              <X aria-hidden />
            </button>
          </span>
        )}
      </div>

      {dest.k === 'mail' && (
        <div className="cw-mailf">
          <div className="cw-fr">
            <span>إلى</span>
            {box.to.map((t) => (
              <span key={t} className={`cw-rc ${t.startsWith('e:') ? 'ext' : ''}`}>
                <bdi>{t.startsWith('e:') ? t.slice(2) : people.nameOf(t.slice(2))}</bdi>
                <button type="button" aria-label="إزالة" onClick={() => w.setBox((b) => ({ to: b.to.filter((x) => x !== t) }))}>
                  <X aria-hidden />
                </button>
              </span>
            ))}
            <input
              ref={toInput}
              aria-label="المستلمون"
              placeholder={box.to.length ? '' : 'اسم أو عنوان بريد'}
              value={toQ}
              autoComplete="off"
              onChange={(e) => (setToQ(e.target.value), setPop({ kind: 'to', q: e.target.value.replace(/^@/, ''), i: 0 }))}
              onFocus={() => setPop({ kind: 'to', q: toQ, i: 0 })}
              onBlur={() => setTimeout(() => setPop((p) => (p?.kind === 'to' ? null : p)), 150)}
              onKeyDown={onKey}
            />
            {!ccOn && (
              <button type="button" className="ml-btn sm quiet" onClick={() => setCcOn(true)}>
                نسخة
              </button>
            )}
          </div>
          {ccOn && (
            <div className="cw-fr">
              <span>نسخة</span>
              {box.cc.map((t) => (
                <span key={t} className="cw-rc">
                  {people.nameOf(t.slice(2))}
                  <button type="button" aria-label="إزالة" onClick={() => w.setBox((b) => ({ cc: b.cc.filter((x) => x !== t) }))}>
                    <X aria-hidden />
                  </button>
                </span>
              ))}
              <select aria-label="أضف نسخة" value="" onChange={(e) => e.target.value && w.setBox((b) => ({ cc: [...b.cc, e.target.value] }))}>
                <option value="">أضف…</option>
                {others
                  .filter((p) => !box.cc.includes(`p:${p.email}`) && !box.to.includes(`p:${p.email}`))
                  .map((p) => (
                    <option key={p.email} value={`p:${p.email}`}>
                      {p.display_name}
                    </option>
                  ))}
              </select>
            </div>
          )}
          <div className="cw-fr">
            <span>الموضوع</span>
            <input aria-label="الموضوع" placeholder="موضوع الرسالة" value={box.subject} onChange={(e) => w.setBox({ subject: e.target.value })} />
          </div>
        </div>
      )}

      {slot?.reply && !box.dest && (
        <div className="cw-bar">
          <Reply aria-hidden />
          <span>
            رد على {people.nameOf(slot.reply.author)}: {snippet(slot.reply)}
          </span>
          <button type="button" className="cw-ib sm" aria-label="إلغاء الرد" onClick={slot.clearReply}>
            <X aria-hidden />
          </button>
        </div>
      )}
      {slot?.edit && !box.dest && (
        <div className="cw-bar">
          <NotebookPen aria-hidden />
          <span>تعديل رسالتك</span>
          <button type="button" className="cw-ib sm" aria-label="إلغاء التعديل" onClick={() => (slot.clearEdit(), w.setBox({ text: '' }))}>
            <X aria-hidden />
          </button>
        </div>
      )}
      {(uploads.length > 0 || box.files.length > 0) && (
        <div className="cw-ups">
          {box.files.map((f) => (
            <span key={f.id} className="cw-up">
              <FileText aria-hidden />
              <span>{f.name}</span>
              <button type="button" className="cw-ib sm" aria-label={`إزالة ${f.name}`} onClick={() => w.setBox((b) => ({ files: b.files.filter((x) => x.id !== f.id) }))}>
                <X aria-hidden />
              </button>
            </span>
          ))}
          {uploads.map((u) => (
            <span key={u.key} className={`cw-up ${u.error ? 'bad' : ''}`}>
              <FileText aria-hidden />
              <span>{u.error ? `${u.name}: ${u.error}` : `${u.name} · ${Math.round(u.progress * 100)}%`}</span>
              {u.error && (
                <button type="button" className="cw-ib sm" aria-label="إغلاق" onClick={() => setUploads((x) => x.filter((y) => y.key !== u.key))}>
                  <X aria-hidden />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {dnd && <p className="cw-warn">{dnd} في وضع «لا تزعج». تصل الرسالة دون تنبيه، إلا إذا كانت عاجلة.</p>}
      {gated && <p className="cw-warn info">بريد خارجي: يُرسل إلى مدير الاتصال ومساعده للاعتماد قبل أن يخرج.</p>}
      {!canPost && !isMail && <p className="cw-warn">الكتابة في هذه القناة لمشرفيها. اختر وجهة أخرى بـ @.</p>}
      {confirm && (
        <div className="cw-confirm" role="alert">
          <p>
            <Globe aria-hidden />
            ستصل هذه الرسالة إلى {globalRoom ? membersAr(c.membersOf(globalRoom.id).length) : 'كل أعضاء المركز'} في «العام». يظهر هذا التنبيه مرة واحدة في الجلسة.
          </p>
          <span>
            <button type="button" className="ml-btn sm primary" onClick={() => void sendChat(true)}>
              إرسال إلى الجميع
            </button>
            <button type="button" className="ml-btn sm" onClick={() => (setConfirm(false), setPop({ kind: 'addr', q: '', i: 0 }), focus())}>
              تغيير الوجهة
            </button>
          </span>
        </div>
      )}
      {error && (
        <p className="cw-warn bad" role="alert">
          {error}
        </p>
      )}
      {note && (
        <p className="cw-note" role="status">
          {note.text}
          {note.open && (
            <button type="button" onClick={() => (note.open?.(), setNote(null))}>
              فتح
            </button>
          )}
        </p>
      )}

      <div className="cw-in">
        <div className="cw-acts">
          <button type="button" className="cw-plus" aria-label="إجراءات سريعة" title="إجراءات سريعة" aria-expanded={!!menu} onClick={() => (setMenu(menu ? null : 'main'), setMore(false), setPop(null))}>
            <Plus aria-hidden />
          </button>
          <button type="button" className="cw-send" aria-label={isMail ? (dest.k === 'reply' ? 'إرسال الرد' : 'إرسال البريد') : 'إرسال'} title="إرسال" disabled={busy || !!rec} onClick={() => send()}>
            <SendHorizontal aria-hidden />
          </button>
        </div>
        {rec ? (
          <div className="cw-rec" role="status">
            <i />
            <span>
              جارٍ التسجيل · <bdi dir="ltr">{`${Math.floor(rec.t / 60)}:${String(rec.t % 60).padStart(2, '0')}`}</bdi>
            </span>
            <button type="button" className="cw-ib" aria-label="حذف التسجيل" onClick={() => stopRec(false)}>
              <Trash2 aria-hidden />
            </button>
            <button type="button" className="ml-btn sm primary" onClick={() => stopRec(true)}>
              إرسال
            </button>
          </div>
        ) : (
          <textarea
            ref={ta}
            className="cw-ta"
            rows={1}
            aria-label="نص الرسالة"
            placeholder={placeholder}
            value={box.text}
            onChange={(e) => {
              const v = e.target.value;
              w.setBox({ text: v });
              setError('');
              if (!isMail) {
                if (slot) c.typingPing();
                const canMention = (!!destRoom && destRoom.type !== 'dm') || dest.k === 'all' || dest.k === 'work';
                const t = boxTrigger(v.slice(0, e.target.selectionStart), canMention);
                setPop(t ? { kind: t.kind, q: t.q, i: 0 } : null);
              }
            }}
            onKeyDown={onKey}
          />
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        className="cw-file"
        hidden
        multiple
        onChange={(e) => {
          if (e.target.files?.length) void attach(e.target.files);
          e.target.value = '';
        }}
      />
      {full && (
        <Composer
          key={full.key}
          draft={full}
          onClose={() => {
            setFull(null);
            w.setBox({ text: '', dest: null, to: [], cc: [], subject: '', files: [] });
          }}
          onSaveDraft={(d) => {
            setDrafts([{ ...d, savedAt: new Date().toISOString() }, ...drafts.filter((x) => x.key !== d.key)]);
            m.say('حُفظت المسودة في هذا المتصفح. تجدها في «المسودات» في صفحة البريد.');
          }}
          onRestore={(d) => setFull({ ...d, key: `${d.key}r` })}
        />
      )}
    </div>
  );
}

function MenuItem({ icon, title, hint, on, onClick }: { icon: ReactNode; title: string; hint: string; on?: boolean; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" className={`cw-act ${on ? 'on' : ''}`} onClick={onClick}>
      <span className="ic">{icon}</span>
      <span>
        <b>{title}</b>
        <small>{hint}</small>
      </span>
    </button>
  );
}

'use client';
// المراسلة: everyday conversation beside the formal mail. Direct chats, groups tied to a
// campaign or a work item, announcement channels, and cards that act on the same records
// as the rest of the Hub. Approved design: artifact «البريد الجديد», messaging tab.
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { campaign, statusLabels } from '@/lib/domain';
import { useHub } from '@/lib/store';
import { supabase } from '@/lib/supabase/client';
import { HOLD } from '@/lib/kit/hold-reasons';
import {
  COMMANDS,
  PRESENCE_AR,
  REACTIONS,
  canAssign,
  canChannel,
  canEdit,
  canUrgent,
  chatSysText,
  composerPopup,
  dayLabel,
  duration,
  grouping,
  hhmm,
  mentionsMe,
  readers,
  snippet,
  unreadCount,
  waveform,
  type ChatMessage,
  type Presence,
  type RoomRow,
} from '@/lib/chat/rules';
import { stageAr } from '@/lib/mail/rules';
import { pipeline, stagePosition, type Stage } from '@/lib/media/rules';
import { Thumb } from '../media/parts';
import { Face, presenceOf, presenceText, roleTitle, usePeople } from '../people';
import { I, fileSize, localInput, type IconName } from '../mail/parts';
import { useChat, type AssetLite } from './provider';

export type MailPrefill = { to: string[]; subject: string; body: string; refs: string[] };

type DialogState =
  | null
  | { kind: 'new' }
  | { kind: 'fwd'; msg: ChatMessage }
  | { kind: 'poll' }
  | { kind: 'task'; what?: string }
  | { kind: 'asset' }
  | { kind: 'approval' }
  | { kind: 'work' }
  | { kind: 'img'; msg: ChatMessage };

const STAGE_TONE: Record<string, string> = { draft: '', production: 'info', review: 'review', changes: 'warn', rejected: 'danger', ready: 'success', scheduled: 'schedule', published: 'done' };
const REACT_ICON: Record<string, IconName> = { check: 'check', eye: 'eye', heart: 'star', flag: 'flag', clock: 'clock' };

export function ChatTab({ onToMail }: { onToMail: (p: MailPrefill) => void }) {
  const c = useChat();
  const people = usePeople();
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread' | 'groups' | 'starred'>('all');
  const [q, setQ] = useState('');
  const [info, setInfo] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);

  const roomName = (r: RoomRow) => (r.type === 'dm' ? people.nameOf(dmOther(r, c.me, c.membersOf(r.id))) : r.name ?? '');
  const open = (id: string | null) => {
    setOpenId(id);
    c.open(id);
  };
  useEffect(() => () => c.open(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => {
    const s = q.trim();
    return c.rooms
      .filter((r) => {
        const ms = c.messagesOf(r.id);
        if (filter === 'unread' && !unreadCount(ms, c.myMember(r.id), c.me)) return false;
        if (filter === 'groups' && r.type === 'dm') return false;
        if (s) return roomName(r).includes(s) || ms.some((m) => !m.deleted && m.body.includes(s));
        return true;
      })
      .sort((a, b) => {
        const pa = c.myMember(a.id)?.pinned ? 1 : 0;
        const pb = c.myMember(b.id)?.pinned ? 1 : 0;
        if (pa !== pb) return pb - pa;
        const la = c.messagesOf(a.id).at(-1)?.created_at ?? a.last_at;
        const lb = c.messagesOf(b.id).at(-1)?.created_at ?? b.last_at;
        return la < lb ? 1 : -1;
      });
  }, [c, filter, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const room = openId ? c.rooms.find((r) => r.id === openId) : undefined;

  if (c.status === 'loading') return <div className="panel" role="status">جارٍ تحميل المراسلة…</div>;
  if (c.status === 'error')
    return (
      <div className="panel" role="alert">
        تعذّر تحميل المراسلة.{' '}
        <button type="button" onClick={() => void c.reload()}>
          أعد المحاولة
        </button>
      </div>
    );

  return (
    <div className="cx-wrap">
      <div className={`cx ${room ? 'open' : ''} ${room && info ? 'with-info' : ''}`}>
        <aside className="cx-side" aria-label="المحادثات">
          <div className="cx-side-h">
            <MeLine />
            <label className="mx-field" htmlFor="cx-q">
              <I n="search" />
              <input id="cx-q" type="search" placeholder="ابحث في المحادثات والرسائل" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
            </label>
            <div className="cx-filters" role="group" aria-label="تصفية">
              {(
                [
                  ['all', 'الكل'],
                  ['unread', 'غير مقروءة'],
                  ['groups', 'المجموعات'],
                  ['starred', 'المميّزة'],
                ] as const
              ).map(([id, label]) => (
                <button type="button" key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>
                  {label}
                </button>
              ))}
              <button type="button" className="ml-btn icon quiet cx-new" aria-label="محادثة جديدة" title="محادثة جديدة" onClick={() => setDialog({ kind: 'new' })}>
                <I n="plus" />
              </button>
            </div>
          </div>
          <div className="cx-list">
            {filter === 'starred' ? (
              <Starred onJump={(room) => (setFilter('all'), open(room))} />
            ) : list.length ? (
              list.map((r) => <RoomRowView key={r.id} r={r} name={roomName(r)} on={r.id === openId} onOpen={() => open(r.id)} />)
            ) : (
              <div className="ml-empty">
                <I n="mail" />
                <span>{q ? 'لا نتائج.' : 'لا محادثات بعد. ابدأ واحدة من زر «+».'}</span>
              </div>
            )}
          </div>
          <p className="cx-hint">للحديث اليومي. القرارات الرسمية والجهات الخارجية في البريد.</p>
        </aside>

        {room ? (
          <Conversation
            key={room.id}
            room={room}
            name={roomName(room)}
            info={info}
            onInfo={() => setInfo(!info)}
            onBack={() => open(null)}
            onDialog={setDialog}
            onToMail={onToMail}
          />
        ) : (
          <section className="cx-main">
            <div className="cx-empty">
              <span className="cx-wall" />
              <span className="e-i">
                <I n="mail" />
              </span>
              <b>اختر محادثة أو ابدأ واحدة</b>
              <p>المراسلة للحديث اليومي بين الفريق. ما يميزها عن أي تطبيق محادثة:</p>
              <ul>
                <li><I n="image" />شارك أصلاً أو عملاً فيظهر معاينة حية تتبع مرحلته</li>
                <li><I n="check" />اطلب اعتماداً أو أسند مهمة من داخل المحادثة، بقواعد المكتبة نفسها</li>
                <li><I n="flag" />مجموعات مربوطة بحملة أو عمل، يظهر وضعه أعلى المحادثة</li>
                <li><I n="alert" />تنبيه عاجل يطلب إقراراً بالاستلام من كل عضو</li>
                <li><I n="mail" />حوّل أي رسالة إلى بريد رسمي حين تحتاج سجلاً</li>
              </ul>
              <button type="button" className="ml-btn primary" onClick={() => setDialog({ kind: 'new' })}>
                <I n="plus" />
                محادثة جديدة
              </button>
            </div>
          </section>
        )}
        {room && info && <Info room={room} name={roomName(room)} onClose={() => setInfo(false)} onLeft={() => (setInfo(false), open(null))} onImg={(msg) => setDialog({ kind: 'img', msg })} />}
      </div>

      {dialog?.kind === 'new' && <NewChat onClose={() => setDialog(null)} onOpen={(id) => (setDialog(null), open(id))} />}
      {dialog?.kind === 'fwd' && <Forward msg={dialog.msg} names={roomName} onClose={() => setDialog(null)} />}
      {room && dialog?.kind === 'poll' && <PollDialog room={room} onClose={() => setDialog(null)} />}
      {room && dialog?.kind === 'task' && <TaskDialog room={room} what={dialog.what} onClose={() => setDialog(null)} />}
      {room && (dialog?.kind === 'asset' || dialog?.kind === 'approval') && <AssetDialog room={room} approval={dialog.kind === 'approval'} onClose={() => setDialog(null)} />}
      {room && dialog?.kind === 'work' && <WorkDialog room={room} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'img' && (
        <Dlg title={dialog.msg.body || 'صورة'} onClose={() => setDialog(null)} wide>
          <div className="cx-lightbox">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/chat/file/${String(dialog.msg.data?.file)}`} alt={dialog.msg.body || 'صورة'} />
            <small>
              {people.nameOf(dialog.msg.author)} · <bdi dir="ltr">{hhmm(dialog.msg.created_at)}</bdi>
            </small>
          </div>
        </Dlg>
      )}
    </div>
  );
}

const dmOther = (r: RoomRow, me: string, members: { email: string }[]) =>
  members.find((m) => m.email !== me)?.email ?? (r.dm_key ?? '').split('|').find((e) => e !== me) ?? me;

function MeLine() {
  const people = usePeople();
  const c = useChat();
  const me = people.me;
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const set = async (p: Presence) => {
    setMenu(null);
    const r = await people.update({ presence: p, presence_note: null });
    if (!r.ok) c.say(r.error);
    else c.say(`حالتك الآن: ${PRESENCE_AR[p]}`);
  };
  return (
    <div className="cx-me">
      <Face email={c.me} label={me?.display_name ?? ''} dot />
      <span className="who">
        <b>{me?.display_name}</b>
        <button type="button" className="cx-pres" onClick={(e) => setMenu({ x: e.clientX, y: e.clientY })} aria-haspopup="menu">
          <i className={`pdot ${presenceOf(me)}`} />
          {presenceText(me)}
        </button>
      </span>
      <Link className="ml-btn sm quiet" href="/account" title="ملفك الشخصي">
        <I n="user" />
      </Link>
      {menu && (
        <Pop x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          {(Object.keys(PRESENCE_AR) as Presence[]).map((p) => (
            <button type="button" role="menuitem" key={p} onClick={() => void set(p)}>
              <i className={`pdot ${p}`} />
              {PRESENCE_AR[p]}
              {presenceOf(me) === p && <I n="check" />}
            </button>
          ))}
        </Pop>
      )}
    </div>
  );
}

function RoomFace({ r, name, size = 'md' }: { r: RoomRow; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const c = useChat();
  if (r.type === 'dm') return <Face email={dmOther(r, c.me, c.membersOf(r.id))} label={name} size={size} dot />;
  if (r.type === 'channel')
    return (
      <span className={`face ${size} chan`} aria-hidden="true">
        <I n="alert" />
      </span>
    );
  return (
    <span className={`face ${size} grp`} aria-hidden="true">
      {name.trim().charAt(0)}
    </span>
  );
}

function RoomRowView({ r, name, on, onOpen }: { r: RoomRow; name: string; on: boolean; onOpen: () => void }) {
  const c = useChat();
  const people = usePeople();
  const ms = c.messagesOf(r.id);
  const last = ms.at(-1);
  const me = c.myMember(r.id);
  const u = unreadCount(ms, me, c.me);
  const typing = (c.typing[r.id] ?? []).filter((x) => x !== c.me);
  const who = last && last.kind !== 'sys' ? (last.author === c.me ? 'أنت: ' : r.type !== 'dm' ? `${people.nameOf(last.author)}: ` : '') : '';
  const lastText = last ? (last.kind === 'sys' ? chatSysText(last.data, people.nameOf) : snippet(last)) : r.type === 'dm' ? 'ابدأ المحادثة' : '';
  const when = last ? (dayLabel(last.created_at, c.now) === 'اليوم' ? hhmm(last.created_at) : dayLabel(last.created_at, c.now)) : '';
  return (
    <button type="button" className={`cx-row ${u ? 'unread' : ''} ${on ? 'on' : ''}`} onClick={onOpen}>
      <RoomFace r={r} name={name} />
      <span className="mid">
        <span className="nm">
          <span>{name}</span>
          {r.link && <I n={r.link.type === 'campaign' ? 'flag' : 'work'} />}
        </span>
        {typing.length ? (
          <span className="sn typing">{r.type === 'dm' ? 'يكتب…' : `${people.nameOf(typing[0])} يكتب…`}</span>
        ) : (
          <span className="sn">{who + lastText}</span>
        )}
      </span>
      <span className="meta">
        <time>{when}</time>
        <span className="badges">
          {me?.pinned && <I n="tag" />}
          {me?.muted && <I n="mute" />}
          {u > 0 && mentionsMe(ms, me, c.me, people.nameOf(c.me)) && <span className="badge at">@</span>}
          {u > 0 && <span className={`badge ${me?.muted ? 'mute' : ''}`}>{u}</span>}
        </span>
      </span>
    </button>
  );
}

function Starred({ onJump }: { onJump: (room: string) => void }) {
  const c = useChat();
  const people = usePeople();
  const list = c.rooms.flatMap((r) => c.messagesOf(r.id).filter((m) => c.starred.has(m.id) && !m.deleted).map((m) => ({ r, m })));
  if (!list.length)
    return (
      <div className="ml-empty">
        <I n="star" />
        <span>لا رسائل مميّزة. ميّز رسالة من قائمتها لتجدها هنا.</span>
      </div>
    );
  return (
    <div className="cx-starred">
      {list.map(({ r, m }) => (
        <button type="button" key={m.id} onClick={() => onJump(r.id)}>
          <small>
            {r.name ?? people.nameOf(dmOther(r, c.me, c.membersOf(r.id)))} · {people.nameOf(m.author)} · <bdi dir="ltr">{hhmm(m.created_at)}</bdi>
          </small>
          {snippet(m)}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ conversation */

type DialogSetter = (d: DialogState) => void;

function Conversation({
  room,
  name,
  info,
  onInfo,
  onBack,
  onDialog,
  onToMail,
}: {
  room: RoomRow;
  name: string;
  info: boolean;
  onInfo: () => void;
  onBack: () => void;
  onDialog: DialogSetter;
  onToMail: (p: MailPrefill) => void;
}) {
  const c = useChat();
  const people = usePeople();
  const { state } = useHub();
  const msgs = c.messagesOf(room.id);
  const members = c.membersOf(room.id);
  const me = c.myMember(room.id);
  const [find, setFind] = useState<string | null>(null);
  const [reply, setReply] = useState<ChatMessage | null>(null);
  const [edit, setEdit] = useState<ChatMessage | null>(null);
  const [urgent, setUrgent] = useState(false);
  const [menu, setMenu] = useState<{ msg: ChatMessage; x: number; y: number } | null>(null);
  const [roomMenu, setRoomMenu] = useState<{ x: number; y: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  // Where unread messages began when the room was opened.
  const [mark] = useState(() => {
    const seen = me ? Date.parse(me.last_read_at) : Infinity;
    return msgs.find((m) => m.author !== c.me && m.kind !== 'sys' && Date.parse(m.created_at) > seen)?.id ?? null;
  });
  const typing = (c.typing[room.id] ?? []).filter((x) => x !== c.me);
  const isAdmin = !!me?.admin || c.role === 'admin';
  const canPost = room.type !== 'channel' || isAdmin;

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (stick.current || msgs.at(-1)?.author === c.me) el.scrollTop = el.scrollHeight;
  }, [msgs.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const jump = (id: string) => {
    const el = document.getElementById(`cm-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1500);
  };

  const toMail = async (m: ChatMessage | null) => {
    const to = members.filter((x) => x.email !== c.me).map((x) => `p:${x.email}`);
    const text = m ? (m.body || snippet(m)) : '';
    const refs = m && (m.kind === 'asset' || m.kind === 'approval') ? [String(m.data?.asset_id)] : [];
    await c.rpc('chat_moved_to_mail', { p_room: room.id });
    onToMail({
      to,
      subject: room.type === 'dm' ? text.slice(0, 60) || 'متابعة' : `${name}${text ? `: ${text.slice(0, 40)}` : ''}`,
      body: `${text ? `${text}\n\n` : ''}(من محادثة «${name}» في المراسلة)`,
      refs,
    });
  };

  const sub =
    typing.length > 0 ? (
      <small className="typing">{room.type === 'dm' ? 'يكتب…' : `${people.nameOf(typing[0])} يكتب…`}</small>
    ) : room.type === 'dm' ? (
      (() => {
        const p = people.personOf(dmOther(room, c.me, members));
        return <small>{[roleTitle(p), presenceText(p)].filter(Boolean).join(' · ')}</small>;
      })()
    ) : (
      <small>{members.map((m) => (m.email === c.me ? 'أنت' : people.nameOf(m.email))).join('، ')}</small>
    );

  const pinned = room.pinned_message ? msgs.find((m) => m.id === room.pinned_message && !m.deleted) : undefined;
  const findQ = find?.trim() ?? '';
  const hits = findQ ? msgs.filter((m) => !m.deleted && m.body.includes(findQ)).length : 0;

  let lastDay = '';
  return (
    <section className="cx-main" aria-label={name}>
      <span className="cx-wall" />
      <header className="cx-top">
        <button type="button" className="ml-btn sm quiet cx-back" onClick={onBack} aria-label="العودة إلى القائمة">
          <I n="back" />
        </button>
        <RoomFace r={room} name={name} size="sm" />
        <button type="button" className="who" onClick={onInfo} aria-label="معلومات المحادثة">
          <b>{name}</b>
          {sub}
        </button>
        <button type="button" className="ml-btn icon quiet" aria-label="بحث في المحادثة" title="بحث في المحادثة" onClick={() => setFind(find === null ? '' : null)}>
          <I n="search" />
        </button>
        <button type="button" className={`ml-btn icon quiet ${info ? 'on' : ''}`} aria-label="معلومات المحادثة" title="معلومات المحادثة" onClick={onInfo}>
          <I n="user" />
        </button>
        <button type="button" className="ml-btn icon quiet" aria-label="خيارات المحادثة" title="خيارات" onClick={(e) => setRoomMenu({ x: e.clientX, y: e.clientY })}>
          <I n="down" />
        </button>
      </header>

      {room.link && <ContextStrip room={room} work={state.work} />}
      {pinned && (
        <button type="button" className="cx-pin" onClick={() => jump(pinned.id)}>
          <I n="tag" />
          <span>
            <b>مثبّتة · </b>
            {snippet(pinned)}
          </span>
        </button>
      )}
      {find !== null && (
        <div className="cx-find">
          <label className="mx-field" htmlFor="cx-find">
            <I n="search" />
            <input id="cx-find" type="search" autoFocus placeholder="ابحث في هذه المحادثة" value={find} onChange={(e) => setFind(e.target.value)} />
          </label>
          <small>{findQ ? `${hits} نتيجة` : ''}</small>
          <button type="button" className="ml-btn icon quiet" aria-label="إغلاق البحث" onClick={() => setFind(null)}>
            <I n="x" />
          </button>
        </div>
      )}

      <div
        className="cx-msgs"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {msgs.map((m, i) => {
          const day = dayLabel(m.created_at, c.now);
          const sep = day !== lastDay ? <div className="cx-day">{day}</div> : null;
          lastDay = day;
          const unr = m.id === mark ? <div className="cx-unr">رسائل غير مقروءة</div> : null;
          if (m.kind === 'sys')
            return (
              <Frag key={m.id}>
                {sep}
                {unr}
                <div className="cx-sys">
                  {chatSysText(m.data, people.nameOf)}
                  {m.author && m.author !== 'system' ? ` · ${people.nameOf(m.author)}` : ''} · <bdi dir="ltr">{hhmm(m.created_at)}</bdi>
                </div>
              </Frag>
            );
          const g = grouping(msgs[i - 1], m, msgs[i + 1]);
          return (
            <Frag key={m.id}>
              {sep}
              {unr}
              <Bubble
                room={room}
                m={m}
                first={g.first || !!sep}
                last={g.last}
                find={findQ}
                onMenu={(x, y) => setMenu({ msg: m, x, y })}
                onJump={jump}
                onImg={(msg) => onDialog({ kind: 'img', msg })}
              />
            </Frag>
          );
        })}
        {!msgs.length && <div className="cx-sys">بداية المحادثة</div>}
      </div>

      {canPost ? (
        <Composer
          room={room}
          reply={reply}
          edit={edit}
          urgent={urgent}
          onClearReply={() => setReply(null)}
          onClearEdit={() => setEdit(null)}
          onClearUrgent={() => setUrgent(false)}
          onEditLast={() => {
            const mine = [...msgs].reverse().find((m) => canEdit(m, c.me, Date.now()));
            if (mine) setEdit(mine);
          }}
          onCommand={(id) => {
            if (id === 'task') return canAssign(c.role) ? onDialog({ kind: 'task' }) : c.say('إسناد المهام لمدير الاتصال ومساعده والمنتج الإعلامي.');
            if (id === 'poll') return onDialog({ kind: 'poll' });
            if (id === 'approval') return onDialog({ kind: 'approval' });
            if (id === 'asset') return onDialog({ kind: 'asset' });
            if (id === 'work') return onDialog({ kind: 'work' });
            if (id === 'urgent') return canUrgent(c.role) && room.type !== 'dm' ? setUrgent(true) : c.say('الرسائل العاجلة لمدير الاتصال ومساعده في المجموعات.');
            if (id === 'mail') return void toMail(null);
          }}
        />
      ) : (
        <div className="cx-ro">الكتابة في هذه القناة لمشرفيها. يمكنك التفاعل مع الإعلانات والإقرار بالاستلام.</div>
      )}

      {menu && (
        <MessageMenu
          room={room}
          m={menu.msg}
          x={menu.x}
          y={menu.y}
          isAdmin={isAdmin}
          onClose={() => setMenu(null)}
          onReply={() => (setReply(menu.msg), setEdit(null))}
          onEdit={() => (setEdit(menu.msg), setReply(null))}
          onForward={() => onDialog({ kind: 'fwd', msg: menu.msg })}
          onTask={() => onDialog({ kind: 'task', what: menu.msg.body })}
          onMail={() => void toMail(menu.msg)}
        />
      )}
      {roomMenu && (
        <Pop x={roomMenu.x} y={roomMenu.y} onClose={() => setRoomMenu(null)}>
          <button type="button" role="menuitem" onClick={() => (setRoomMenu(null), void c.rpc('chat_state', { p_room: room.id, p_patch: { muted: !me?.muted } }, me?.muted ? 'أُلغي الكتم.' : 'كُتمت الإشعارات. تصلك الرسائل العاجلة فقط.'))}>
            <I n="mute" />
            {me?.muted ? 'إلغاء الكتم' : 'كتم الإشعارات'}
          </button>
          <button type="button" role="menuitem" onClick={() => (setRoomMenu(null), void c.rpc('chat_state', { p_room: room.id, p_patch: { pinned: !me?.pinned } }))}>
            <I n="tag" />
            {me?.pinned ? 'إلغاء التثبيت في القائمة' : 'تثبيت في أعلى القائمة'}
          </button>
          <button type="button" role="menuitem" onClick={() => (setRoomMenu(null), setFind(''))}>
            <I n="search" />
            بحث في المحادثة
          </button>
          <button type="button" role="menuitem" onClick={() => (setRoomMenu(null), void toMail(null))}>
            <I n="mail" />
            بدء بريد رسمي مع الأعضاء
          </button>
        </Pop>
      )}
    </section>
  );
}

function Frag({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function ContextStrip({ room, work }: { room: RoomRow; work: { id: string; title: string; status: string }[] }) {
  const c = useChat();
  if (!room.link) return null;
  if (room.link.type === 'campaign') {
    const inReview = c.assets.filter((a) => a.stage === 'review').length;
    return (
      <div className="cx-ctx">
        <span className="k">
          <I n="flag" />
          <b>{campaign.title}</b>
        </span>
        <span className="mx-chip review">{inReview} أصول قيد المراجعة</span>
        <span className="k">
          <I n="cal" />
          موعد الحملة <bdi dir="ltr">{campaign.date}</bdi>
        </span>
        <span className="grow" />
        <Link className="ml-btn sm" href="/media">
          مكتبة الوسائط
        </Link>
      </div>
    );
  }
  const id = room.link.id;
  const w = work.find((x) => x.id === id);
  return (
    <div className="cx-ctx">
      <span className="k">
        <I n="work" />
        <b>
          <bdi dir="ltr">{id}</bdi> {w?.title ?? room.link.title}
        </b>
      </span>
      {w && <span className="mx-chip review">{statusLabels[w.status as keyof typeof statusLabels] ?? ''}</span>}
      <span className="grow" />
      <Link className="ml-btn sm" href={`/work/${id}`}>
        افتح العمل
      </Link>
    </div>
  );
}

function Bubble({
  room,
  m,
  first,
  last,
  find,
  onMenu,
  onJump,
  onImg,
}: {
  room: RoomRow;
  m: ChatMessage;
  first: boolean;
  last: boolean;
  find: string;
  onMenu: (x: number, y: number) => void;
  onJump: (id: string) => void;
  onImg: (m: ChatMessage) => void;
}) {
  const c = useChat();
  const people = usePeople();
  const mine = m.author === c.me;
  const grp = room.type !== 'dm';
  const author = people.personOf(m.author);
  const members = c.membersOf(room.id);
  const reacts = c.reactionsOf(m.id);
  const reactKinds = REACTIONS.filter(([k]) => reacts.some((r) => r.kind === k));
  const quoted = m.reply_to ? c.messagesOf(room.id).find((x) => x.id === m.reply_to) : undefined;
  const acks = c.acksOf(m.id);
  const others = members.filter((x) => x.email !== m.author);
  const read = readers(m, members);
  return (
    <>
      <div id={`cm-${m.id}`} className={`cx-m ${mine ? 'mine' : ''} ${first ? 'first' : ''} ${last ? 'last' : ''} ${m.urgent ? 'urgent' : ''}`}>
        {grp && !mine && (last ? <Face email={m.author} label={author?.display_name ?? ''} size="sm" /> : <span className="face-sp" />)}
        <div className="bub">
          {!m.id.startsWith('tmp-') && (
            <button type="button" className="mbtn" aria-label="خيارات الرسالة" onClick={(e) => onMenu(e.clientX, e.clientY)}>
              <I n="down" />
            </button>
          )}
          {grp && !mine && first && (
            <span className={`au ${author?.profile?.color ?? 'n2'}`}>
              {author?.display_name ?? m.author}
              <small>{author?.profile?.headline || roleTitle(author)}</small>
            </span>
          )}
          {m.deleted ? (
            <span className="del">حُذفت هذه الرسالة</span>
          ) : (
            <>
              {m.forwarded && (
                <span className="fwd">
                  <I n="forward" />
                  مُعاد توجيهها
                </span>
              )}
              {quoted && (
                <button type="button" className="quote" onClick={() => onJump(quoted.id)}>
                  <b>{quoted.author === c.me ? 'أنت' : people.nameOf(quoted.author)}</b>
                  <span>{snippet(quoted)}</span>
                </button>
              )}
              <Content room={room} m={m} onImg={onImg} />
              {m.body && m.kind !== 'poll' && <Text text={m.body} find={find} />}
              {m.urgent && (
                <div className="ack">
                  <I n="alert" />
                  <span>
                    عاجل · أقرّ {acks.filter((e) => e !== m.author).length} من {others.length}
                  </span>
                  {!mine &&
                    (acks.includes(c.me) ? (
                      <span>أقررت</span>
                    ) : (
                      <button type="button" className="ml-btn sm" onClick={() => void c.rpc('chat_toggle', { p_msg: m.id, p_what: 'ack', p_value: null }, 'سُجّل إقرارك بالاستلام.')}>
                        أقرّ بالاستلام
                      </button>
                    ))}
                </div>
              )}
            </>
          )}
          <span className="ft">
            {c.starred.has(m.id) && <I n="star" />}
            {m.edited_at && 'عُدّلت · '}
            <bdi dir="ltr">{hhmm(m.created_at)}</bdi>
            {mine &&
              !m.deleted &&
              (m.id.startsWith('tmp-') ? (
                <I n="clock" />
              ) : (
                <span className={read.length >= others.length && others.length > 0 ? 'rd' : ''} title={read.length ? `قرأها: ${read.map(people.nameOf).join('، ')}` : 'وصلت'}>
                  <I n="check" />
                  <I n="check" className="second" />
                </span>
              ))}
          </span>
        </div>
      </div>
      {reactKinds.length > 0 && (
        <div className={`cx-reacts ${mine ? 'mine' : ''}`}>
          {reactKinds.map(([k, label]) => {
            const who = reacts.filter((r) => r.kind === k).map((r) => r.email);
            return (
              <button
                type="button"
                key={k}
                className={who.includes(c.me) ? 'me' : ''}
                title={`${label}: ${who.map(people.nameOf).join('، ')}`}
                onClick={() => void c.rpc('chat_toggle', { p_msg: m.id, p_what: 'react', p_value: k })}
              >
                <I n={REACT_ICON[k]} />
                {label} {who.length}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function Text({ text, find }: { text: string; find: string }) {
  const parts = text.split(/(@[؀-ۿA-Za-z]+)/g);
  return (
    <div className="tx">
      {parts.map((p, i) =>
        p.startsWith('@') ? (
          <span key={i} className="men">
            {p}
          </span>
        ) : find && p.includes(find) ? (
          p.split(find).flatMap((s, j, arr) => (j < arr.length - 1 ? [s, <mark key={`${i}-${j}`}>{find}</mark>] : [s]))
        ) : (
          p
        ),
      )}
    </div>
  );
}

function Content({ room, m, onImg }: { room: RoomRow; m: ChatMessage; onImg: (m: ChatMessage) => void }) {
  const d = (m.data ?? {}) as Record<string, unknown>;
  if (m.kind === 'voice') return <Voice m={m} />;
  if (m.kind === 'image')
    return (
      <button type="button" className="b-img" onClick={() => onImg(m)} aria-label="عرض الصورة">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/chat/file/${String(d.file)}`} alt={m.body || 'صورة'} loading="lazy" />
      </button>
    );
  if (m.kind === 'file')
    return (
      <a className="b-file" href={`/api/chat/file/${String(d.file)}`}>
        <span className="fi">
          <I n="file" />
        </span>
        <span>
          <b>{String(d.name ?? 'ملف')}</b>
          <small>{fileSize(Number(d.size ?? 0))} · Drive</small>
        </span>
      </a>
    );
  if (m.kind === 'asset') return <AssetCard id={String(d.asset_id)} />;
  if (m.kind === 'work') return <WorkCard id={String(d.id)} title={String(d.title ?? '')} />;
  if (m.kind === 'poll') return <PollCard room={room} m={m} />;
  if (m.kind === 'task') return <TaskCard m={m} />;
  if (m.kind === 'approval') return <ApprovalCard m={m} />;
  return null;
}

function Voice({ m }: { m: ChatMessage }) {
  const d = (m.data ?? {}) as { file?: string; dur?: number; wave?: number[] };
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [speed, setSpeed] = useState(1);
  const wave = d.wave?.length ? d.wave : Array.from({ length: 38 }, () => 30);
  const dur = Number(d.dur ?? 0);
  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => setPlaying(false));
    else a.pause();
  };
  return (
    <div className="voice">
      <audio
        ref={audio}
        src={`/api/chat/file/${d.file}`}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => (setPlaying(false), setPos(0))}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime / (e.currentTarget.duration || dur || 1))}
      />
      <button type="button" className="pl" onClick={toggle} aria-label={playing ? 'إيقاف' : 'تشغيل'}>
        <I n={playing ? 'pause' : 'play'} />
      </button>
      <span
        className="wave"
        role="slider"
        aria-label="موضع التشغيل"
        aria-valuenow={Math.round(pos * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
        onClick={(e) => {
          const b = e.currentTarget.getBoundingClientRect();
          const frac = (b.right - e.clientX) / b.width;
          const a = audio.current;
          if (a && (a.duration || dur)) a.currentTime = frac * (a.duration || dur);
          setPos(frac);
        }}
      >
        {wave.map((v, i) => (
          <i key={i} style={{ height: `${v}%` }} className={i / wave.length < pos ? 'on' : ''} />
        ))}
      </span>
      <span className="vt">
        <span>{duration(pos > 0 ? pos * dur : dur)}</span>
        <button
          type="button"
          className="sp"
          onClick={() => {
            const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
            setSpeed(next);
            if (audio.current) audio.current.playbackRate = next;
          }}
        >
          {speed}×
        </button>
      </span>
    </div>
  );
}

function AssetCard({ id }: { id: string }) {
  const c = useChat();
  const a = c.assets.find((x) => x.id === id);
  if (!a)
    return (
      <div className="ccard">
        <div className="hd">
          <I n="lock" />
          أصل من المكتبة
        </div>
        <div className="sub">لا تملك وصولاً إلى المجلد الذي فيه هذا الأصل، فلا تظهر المعاينة. اطلب الوصول ممن يدير المجلد.</div>
      </div>
    );
  const pos = stagePosition(a.stage as Stage);
  const approve = async () => {
    const { error } = await supabase().from('media_files').update({ stage: 'ready' }).eq('id', a.id);
    if (error) c.say('لا يسمح دورك أو صلاحيتك على المجلد بالاعتماد.');
    else {
      c.say(`اعتُمد الإصدار ${a.current_version} وسُجّل في سجل النشاط.`);
      await c.reload();
    }
  };
  return (
    <div className="ccard">
      <div className="hd">
        <I n={a.kind === 'video' ? 'film' : a.kind === 'image' ? 'image' : 'file'} />
        معاينة من المكتبة
        <span className={`mx-chip ${STAGE_TONE[a.stage] ?? ''}`}>{stageAr(a.stage)}</span>
      </div>
      <div className="art">
        <Thumb asset={{ id: a.id, kind: a.kind as 'image', name: a.name, current_version: a.current_version }} />
      </div>
      <div>
        <div className="ti">{a.name}</div>
        <div className="sub">
          الإصدار {a.current_version}
          {a.approved_version ? ` · المعتمد ${a.approved_version}` : ''} · {fileSize(a.size_bytes)}
        </div>
      </div>
      <div className="steps" aria-hidden="true">
        {pipeline.map((s, i) => (
          <i key={s} className={i < pos ? 'd' : i === pos ? 'c' : ''} />
        ))}
      </div>
      <div className="acts">
        <Link className="ml-btn sm" href={`/media/${a.id}`}>
          فتح في المكتبة
        </Link>
        {a.stage === 'review' && canUrgent(c.role) && (
          <button type="button" className="ml-btn sm primary" data-hold={HOLD.chatApprove} onClick={() => void approve()}>
            <I n="check" />
            اعتماد الإصدار {a.current_version}
          </button>
        )}
      </div>
    </div>
  );
}

function WorkCard({ id, title }: { id: string; title: string }) {
  const { state } = useHub();
  const w = state.work.find((x) => x.id === id);
  return (
    <div className="ccard">
      <div className="hd">
        <I n="work" />
        عمل <bdi dir="ltr">{id}</bdi>
        {w && <span className="mx-chip review">{statusLabels[w.status]}</span>}
      </div>
      <div className="ti">{w?.title ?? title}</div>
      <div className="acts">
        <Link className="ml-btn sm" href={`/work/${id}`}>
          افتح العمل
        </Link>
      </div>
    </div>
  );
}

function PollCard({ room, m }: { room: RoomRow; m: ChatMessage }) {
  const c = useChat();
  const people = usePeople();
  const d = (m.data ?? {}) as { q?: string; options?: string[]; multi?: boolean; closed?: boolean };
  const votes = c.votesOf(m.id);
  const voters = [...new Set(votes.map((v) => v.email))];
  const voted = voters.includes(c.me);
  const show = voted || d.closed;
  const total = votes.length;
  return (
    <div className="ccard">
      <div className="hd">
        <I n="tasks" />
        تصويت
        <span className={`mx-chip ${d.closed ? '' : 'info'}`}>{d.closed ? 'مغلق' : d.multi ? 'أكثر من خيار' : 'خيار واحد'}</span>
      </div>
      <div className="ti">{d.q}</div>
      {(d.options ?? []).map((o, i) => {
        const n = votes.filter((v) => v.option === i).length;
        const pc = total ? Math.round((n * 100) / total) : 0;
        const mineV = votes.some((v) => v.option === i && v.email === c.me);
        return (
          <button
            type="button"
            key={i}
            className={`opt ${mineV ? 'mine' : ''}`}
            disabled={d.closed}
            onClick={() => void c.rpc('chat_toggle', { p_msg: m.id, p_what: 'vote', p_value: String(i) })}
          >
            <span className="fill" style={{ width: `${show ? pc : 0}%` }} />
            <span className="bx">{mineV && <I n="check" />}</span>
            <span>{o}</span>
            <span className="pc">{show ? `${pc}٪ · ${n}` : ''}</span>
          </button>
        );
      })}
      <div className="sub">
        {voters.length} من {c.membersOf(room.id).length} صوّتوا
        {show ? ` · ${voters.map(people.nameOf).join('، ')}` : ' · صوّت لترى النتائج'}
      </div>
      {!d.closed && m.author === c.me && (
        <div className="acts">
          <button type="button" className="ml-btn sm" onClick={() => void c.rpc('chat_toggle', { p_msg: m.id, p_what: 'close', p_value: null })}>
            إغلاق التصويت
          </button>
        </div>
      )}
    </div>
  );
}

function TaskCard({ m }: { m: ChatMessage }) {
  const c = useChat();
  const people = usePeople();
  const d = (m.data ?? {}) as { what?: string; assignee?: string; due?: string; state?: string; priority?: string; dat?: string | null };
  const late = d.state === 'open' && d.due && Date.parse(d.due) < c.now;
  return (
    <div className="ccard">
      <div className="hd">
        <I n="tasks" />
        مهمة
        <span className={`mx-chip ${d.state === 'done' ? 'done' : late ? 'danger' : 'info'}`}>{d.state === 'done' ? 'منجزة' : late ? 'متأخرة' : 'مفتوحة'}</span>
      </div>
      <div className="ti">{d.what}</div>
      <div className="sub">
        {people.nameOf(d.assignee ?? '')} · التسليم {d.due ? `${dayLabel(d.due, c.now)} ${hhmm(d.due)}` : ''} · أسندها {people.nameOf(m.author)}
        {d.priority === 'urgent' ? ' · عاجلة' : ''}
      </div>
      {d.state === 'open' && d.assignee === c.me && (
        <div className="acts">
          <button type="button" className="ml-btn sm primary" onClick={() => void c.rpc('chat_card', { p_msg: m.id, p_op: 'done', p_value: null }, 'أُنجزت المهمة.')}>
            <I n="check" />
            تم الإنجاز
          </button>
        </div>
      )}
      {d.state === 'open' && d.assignee !== c.me && (m.author === c.me || canUrgent(c.role)) && (
        <div className="acts">
          <button type="button" className="ml-btn sm" onClick={() => void c.rpc('chat_card', { p_msg: m.id, p_op: 'remind', p_value: null }, 'أُرسل التذكير.')}>
            تذكير {people.nameOf(d.assignee ?? '')}
          </button>
        </div>
      )}
      <div className="sub">تظهر أيضاً في صفحة المهام.</div>
    </div>
  );
}

function ApprovalCard({ m }: { m: ChatMessage }) {
  const c = useChat();
  const people = usePeople();
  const [note, setNote] = useState<string | null>(null);
  const d = (m.data ?? {}) as { asset_id?: string; name?: string; version?: number; state?: string; dby?: string; dat?: string; note?: string | null };
  const a = c.assets.find((x) => x.id === d.asset_id);
  let st = d.state ?? 'pending';
  if (st === 'pending' && a && (a.current_version !== d.version || a.stage !== 'review')) st = 'moved';
  const tone = { pending: 'review', approved: 'success', changes: 'warn', moved: '' }[st] ?? '';
  const label = { pending: 'بانتظار القرار', approved: 'معتمد', changes: 'بحاجة إلى تعديل', moved: 'حُسم في مكان آخر' }[st] ?? '';
  const act = (op: 'approve' | 'changes', v: string | null) =>
    c.rpc('chat_card', { p_msg: m.id, p_op: op, p_value: v }, op === 'approve' ? `اعتُمد الإصدار ${d.version}.` : 'أُرسل طلب التعديل.').then((r) => {
      if (!r.ok) c.say(r.error);
      setNote(null);
    });
  return (
    <div className="ccard">
      <div className="hd">
        <I n="check" />
        طلب اعتماد
        <span className={`mx-chip ${tone}`}>{label}</span>
      </div>
      {a && (
        <div className="art">
          <Thumb asset={{ id: a.id, kind: a.kind as 'image', name: a.name, current_version: a.current_version }} />
        </div>
      )}
      <div className="ti">{d.name}</div>
      <div className="sub">الإصدار {d.version} · القرار بقاعدة المكتبة نفسها ويُسجّل في سجل النشاط</div>
      {st === 'pending' &&
        (canUrgent(c.role) ? (
          note === null ? (
            <div className="acts">
              <button type="button" className="ml-btn sm primary" data-hold={HOLD.chatApprove} onClick={() => void act('approve', null)}>
                <I n="check" />
                اعتماد الإصدار {d.version}
              </button>
              <button type="button" className="ml-btn sm" onClick={() => setNote('')}>
                طلب تعديل
              </button>
            </div>
          ) : (
            <>
              <textarea aria-label="المطلوب تعديله" placeholder="ما المطلوب تعديله؟" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="acts">
                <button type="button" className="ml-btn sm primary" disabled={!note.trim()} onClick={() => void act('changes', note)}>
                  إرسال طلب التعديل
                </button>
                <button type="button" className="ml-btn sm quiet" onClick={() => setNote(null)}>
                  إلغاء
                </button>
              </div>
            </>
          )
        ) : (
          <div className="sub">ينتظر قرار مدير الاتصال أو مساعده.</div>
        ))}
      {st === 'moved' && a && (
        <div className="res">
          المرحلة الآن «{stageAr(a.stage)}» والإصدار {a.current_version}. حُسم الطلب من البريد أو المكتبة.
        </div>
      )}
      {(st === 'approved' || st === 'changes') && (
        <div className="res">
          {st === 'approved' ? 'اعتماد' : 'طلب تعديل'} · {people.nameOf(d.dby ?? '')} · <bdi dir="ltr">{d.dat ? hhmm(d.dat) : ''}</bdi>
          {d.note ? <><br />«{d.note}»</> : null}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ composer */

function Composer({
  room,
  reply,
  edit,
  urgent,
  onClearReply,
  onClearEdit,
  onClearUrgent,
  onEditLast,
  onCommand,
}: {
  room: RoomRow;
  reply: ChatMessage | null;
  edit: ChatMessage | null;
  urgent: boolean;
  onClearReply: () => void;
  onClearEdit: () => void;
  onClearUrgent: () => void;
  onEditLast: () => void;
  onCommand: (id: (typeof COMMANDS)[number]['id']) => void;
}) {
  const c = useChat();
  const people = usePeople();
  const [text, setText] = useState('');
  const [popup, setPopup] = useState<{ kind: 'cmd' | 'men'; q: string } | null>(null);
  const [attach, setAttach] = useState<{ x: number; y: number } | null>(null);
  const [uploads, setUploads] = useState<{ key: string; name: string; progress: number; error?: string }[]>([]);
  const [rec, setRec] = useState<null | { t: number; levels: number[] }>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const recRef = useRef<{ mr: MediaRecorder; stream: MediaStream; ctx: AudioContext; timer: ReturnType<typeof setInterval>; chunks: Blob[]; levels: number[]; start: number } | null>(null);
  const enterSends = people.me?.profile?.enter_sends ?? true;

  useEffect(() => {
    if (edit) {
      setText(edit.body);
      input.current?.focus();
    }
  }, [edit]);
  useEffect(() => () => stopRec(false), []); // eslint-disable-line react-hooks/exhaustive-deps

  const members = c.membersOf(room.id).filter((m) => m.email !== c.me);
  const popList =
    popup?.kind === 'cmd'
      ? COMMANDS.filter((x) => x.word.startsWith(popup.q))
      : popup?.kind === 'men'
        ? members.filter((m) => people.nameOf(m.email).startsWith(popup.q)).slice(0, 6)
        : [];

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    if (edit) {
      const r = await c.rpc('chat_edit', { p_msg: edit.id, p_body: t }, 'عُدّلت الرسالة.');
      if (!r.ok) c.say(r.error);
      onClearEdit();
      setText('');
      return;
    }
    setText('');
    setPopup(null);
    const r = await c.send(room.id, 'text', t, null, { reply: reply?.id, urgent });
    if (!r.ok) {
      c.say(r.error);
      setText(t);
    }
    onClearReply();
    onClearUrgent();
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && (enterSends || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (popup && popList.length) return pick(0);
      void send();
    }
    if (e.key === 'Escape') {
      if (popup) setPopup(null);
      else if (reply) onClearReply();
      else if (edit) (onClearEdit(), setText(''));
    }
    if (e.key === 'ArrowUp' && !text) {
      e.preventDefault();
      onEditLast();
    }
  };

  const pick = (i: number) => {
    if (!popup) return;
    if (popup.kind === 'cmd') {
      const cmd = (popList as typeof COMMANDS)[i];
      setText('');
      setPopup(null);
      if (cmd) onCommand(cmd.id);
      return;
    }
    const m = (popList as { email: string }[])[i];
    const el = input.current;
    if (!m || !el) return;
    const before = el.value.slice(0, el.selectionStart).replace(/@[^\s@]*$/, '');
    const next = `${before}@${people.nameOf(m.email)} ${el.value.slice(el.selectionStart)}`;
    setText(next);
    setPopup(null);
    requestAnimationFrame(() => {
      el.focus();
      const at = before.length + people.nameOf(m.email).length + 2;
      el.setSelectionRange(at, at);
    });
  };

  const upload = async (files: FileList | File[], kindOf: (f: File) => 'image' | 'file' | 'voice', extra?: Record<string, unknown>) => {
    for (const f of Array.from(files)) {
      const key = `${f.name}-${Date.now()}`;
      setUploads((u) => [...u, { key, name: f.name, progress: 0 }]);
      try {
        const up = await c.upload(f, (progress) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, progress } : x))));
        const r = await c.send(room.id, kindOf(f), '', { file: up.id, ...(extra ?? {}) }, { reply: reply?.id });
        if (!r.ok) throw new Error(r.error);
        setUploads((u) => u.filter((x) => x.key !== key));
        onClearReply();
      } catch (e) {
        setUploads((u) => u.map((x) => (x.key === key ? { ...x, error: e instanceof Error ? e.message : 'تعذّر الرفع.' } : x)));
      }
    }
  };

  // Voice notes: the browser records; the waveform comes from the microphone levels.
  const startRec = async () => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) return c.say('هذا المتصفح لا يدعم التسجيل الصوتي.');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return c.say('لم يُسمح بالوصول إلى الميكروفون. اسمح به من إعدادات المتصفح ثم أعد المحاولة.');
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
  };
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
      if (blob.size < 200) return c.say('التسجيل قصير جداً.');
      const f = new File([blob], `رسالة-صوتية-${hhmm(new Date().toISOString()).replace(':', '')}.${ext}`, { type });
      void upload([f], () => 'voice', { dur: secs, wave: waveform(r.levels) });
    };
    r.mr.stop();
  }

  return (
    <div className="cx-cmp">
      {popup && popList.length > 0 && (
        <div className="cx-pop" role="listbox">
          {popup.kind === 'cmd'
            ? (popList as typeof COMMANDS).map((x, i) => (
                <button type="button" key={x.id} className={i === 0 ? 'hl' : ''} onClick={() => pick(i)}>
                  <kbd>/{x.word}</kbd>
                  <span>{x.hint}</span>
                </button>
              ))
            : (popList as { email: string }[]).map((m, i) => (
                <button type="button" key={m.email} className={i === 0 ? 'hl' : ''} onClick={() => pick(i)}>
                  <Face email={m.email} label={people.nameOf(m.email)} size="sm" />
                  <span>
                    {people.nameOf(m.email)}
                    <small>{roleTitle(people.personOf(m.email))}</small>
                  </span>
                </button>
              ))}
        </div>
      )}
      {edit && (
        <div className="cx-bar edit">
          <I n="pencil" />
          <span>
            <b>تعديل الرسالة</b> · {edit.body}
          </span>
          <button type="button" className="ml-btn icon quiet" aria-label="إلغاء التعديل" onClick={() => (onClearEdit(), setText(''))}>
            <I n="x" />
          </button>
        </div>
      )}
      {reply && (
        <div className="cx-bar">
          <I n="reply" />
          <span>
            <b>{reply.author === c.me ? 'أنت' : people.nameOf(reply.author)}</b> · {snippet(reply)}
          </span>
          <button type="button" className="ml-btn icon quiet" aria-label="إلغاء الرد" onClick={onClearReply}>
            <I n="x" />
          </button>
        </div>
      )}
      {urgent && (
        <div className="cx-bar urg">
          <I n="alert" />
          <span>
            <b>عاجل</b> · يطلب إقراراً بالاستلام من كل عضو
          </span>
          <button type="button" className="ml-btn icon quiet" aria-label="إلغاء" onClick={onClearUrgent}>
            <I n="x" />
          </button>
        </div>
      )}
      {uploads.map((u) => (
        <div key={u.key} className={`cx-bar ${u.error ? 'urg' : ''}`}>
          <I n={u.error ? 'alert' : 'sync'} />
          <span>
            {u.name} · {u.error ?? `يُرفع… ${Math.round(u.progress * 100)}٪`}
          </span>
          {u.error && (
            <button type="button" className="ml-btn icon quiet" aria-label="إغلاق" onClick={() => setUploads((x) => x.filter((y) => y.key !== u.key))}>
              <I n="x" />
            </button>
          )}
        </div>
      ))}
      {rec ? (
        <div className="cx-rec">
          <button type="button" className="ml-btn icon quiet danger" aria-label="حذف التسجيل" onClick={() => stopRec(false)}>
            <I n="trash" />
          </button>
          <span className="rd" />
          <b>{duration(rec.t)}</b>
          <span className="lv" aria-hidden="true">
            {Array.from({ length: 28 }, (_, i) => (
              <i key={i} style={{ height: `${Math.max(12, Math.min(100, Math.round((rec.levels[i] ?? 0) * 160)))}%` }} />
            ))}
          </span>
          <button type="button" className="rbtn go" aria-label="إرسال الرسالة الصوتية" onClick={() => stopRec(true)}>
            <I n="send" />
          </button>
        </div>
      ) : (
        <div className="cx-row2">
          <button type="button" className="rbtn att" aria-label="إرفاق وبطاقات" title="إرفاق وبطاقات" onClick={(e) => setAttach({ x: e.clientX, y: e.clientY })}>
            <I n="plus" />
          </button>
          <textarea
            ref={input}
            className="cx-input"
            rows={1}
            aria-label="اكتب رسالة"
            placeholder={room.type === 'dm' ? 'اكتب رسالة' : 'اكتب رسالة · @ لذكر عضو · / للأوامر'}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(140, e.target.scrollHeight)}px`;
              setPopup(composerPopup(e.target.value.slice(0, e.target.selectionStart), room.type === 'dm'));
              c.typingPing();
            }}
            onKeyDown={onKey}
            onPaste={(e) => {
              const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
              if (imgs.length) {
                e.preventDefault();
                void upload(imgs, () => 'image');
              }
            }}
          />
          {text.trim() ? (
            <button type="button" className="rbtn go" aria-label="إرسال" onClick={() => void send()}>
              <I n="send" />
            </button>
          ) : (
            <button type="button" className="rbtn go" aria-label="تسجيل رسالة صوتية" title="تسجيل رسالة صوتية" onClick={() => void startRec()}>
              <I n="voice" />
            </button>
          )}
        </div>
      )}
      <input
        ref={file}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const fs = e.target.files;
          if (fs) void upload(fs, (f) => (/^image\/(png|jpeg|webp|gif)$/.test(f.type) ? 'image' : 'file'));
          e.target.value = '';
        }}
      />
      {attach && (
        <Pop x={attach.x} y={attach.y} onClose={() => setAttach(null)}>
          <button type="button" role="menuitem" onClick={() => (setAttach(null), file.current?.click())}>
            <I n="image" />
            صورة أو ملف من الجهاز
          </button>
          <button type="button" role="menuitem" onClick={() => (setAttach(null), onCommand('asset'))}>
            <I n="film" />
            أصل من مكتبة الوسائط
          </button>
          <button type="button" role="menuitem" onClick={() => (setAttach(null), onCommand('work'))}>
            <I n="work" />
            عمل من صفحة العمل
          </button>
          <hr />
          <button type="button" role="menuitem" onClick={() => (setAttach(null), onCommand('poll'))}>
            <I n="tasks" />
            تصويت
          </button>
          {canAssign(c.role) && (
            <button type="button" role="menuitem" onClick={() => (setAttach(null), onCommand('task'))}>
              <I n="tasks" />
              مهمة
            </button>
          )}
          <button type="button" role="menuitem" onClick={() => (setAttach(null), onCommand('approval'))}>
            <I n="check" />
            طلب اعتماد
          </button>
          {canUrgent(c.role) && room.type !== 'dm' && (
            <button type="button" role="menuitem" onClick={() => (setAttach(null), onCommand('urgent'))}>
              <I n="alert" />
              رسالة عاجلة بإقرار
            </button>
          )}
        </Pop>
      )}
    </div>
  );
}

function MessageMenu({
  room,
  m,
  x,
  y,
  isAdmin,
  onClose,
  onReply,
  onEdit,
  onForward,
  onTask,
  onMail,
}: {
  room: RoomRow;
  m: ChatMessage;
  x: number;
  y: number;
  isAdmin: boolean;
  onClose: () => void;
  onReply: () => void;
  onEdit: () => void;
  onForward: () => void;
  onTask: () => void;
  onMail: () => void;
}) {
  const c = useChat();
  const mine = m.author === c.me;
  const run = (f: () => void) => () => (onClose(), f());
  const reacts = c.reactionsOf(m.id);
  if (m.deleted) return null;
  return (
    <Pop x={x} y={y} onClose={onClose}>
      <div className="cx-react-row">
        {REACTIONS.map(([k, label]) => (
          <button
            type="button"
            key={k}
            className={reacts.some((r) => r.kind === k && r.email === c.me) ? 'on' : ''}
            title={label}
            onClick={run(() => void c.rpc('chat_toggle', { p_msg: m.id, p_what: 'react', p_value: k }))}
          >
            <I n={REACT_ICON[k]} />
            {label}
          </button>
        ))}
      </div>
      <hr />
      <button type="button" role="menuitem" onClick={run(onReply)}>
        <I n="reply" />
        رد
      </button>
      <button type="button" role="menuitem" onClick={run(onForward)}>
        <I n="forward" />
        إعادة توجيه
      </button>
      {m.body && (
        <button
          type="button"
          role="menuitem"
          onClick={run(() =>
            navigator.clipboard.writeText(m.body).then(
              () => c.say('نُسخ النص.'),
              () => c.say('تعذّر النسخ في هذا المتصفح.'),
            ),
          )}
        >
          <I n="file" />
          نسخ النص
        </button>
      )}
      <button type="button" role="menuitem" onClick={run(() => void c.rpc('chat_toggle', { p_msg: m.id, p_what: 'star', p_value: null }, c.starred.has(m.id) ? 'أُلغي التمييز.' : 'مُيّزت الرسالة.'))}>
        <I n="star" />
        {c.starred.has(m.id) ? 'إلغاء التمييز' : 'تمييز بنجمة'}
      </button>
      {(room.type === 'dm' || isAdmin) && (
        <button type="button" role="menuitem" onClick={run(() => void c.rpc('chat_pin', { p_room: room.id, p_msg: room.pinned_message === m.id ? null : m.id }))}>
          <I n="tag" />
          {room.pinned_message === m.id ? 'إلغاء التثبيت' : 'تثبيت في المحادثة'}
        </button>
      )}
      <hr />
      {canAssign(c.role) && m.body && (
        <button type="button" role="menuitem" onClick={run(onTask)}>
          <I n="tasks" />
          تحويل إلى مهمة
        </button>
      )}
      <button type="button" role="menuitem" onClick={run(onMail)}>
        <I n="mail" />
        تحويل إلى بريد رسمي
      </button>
      {canEdit(m, c.me, Date.now()) && (
        <button type="button" role="menuitem" onClick={run(onEdit)}>
          <I n="pencil" />
          تعديل
        </button>
      )}
      {(mine || isAdmin) && m.kind !== 'sys' && (
        <button type="button" role="menuitem" className="danger" data-hold={HOLD.chatDelete} onClick={run(() => void c.rpc('chat_delete', { p_msg: m.id }, 'حُذفت الرسالة للجميع.'))}>
          <I n="trash" />
          حذف للجميع
        </button>
      )}
    </Pop>
  );
}

/* ------------------------------------------------------------------ info panel */

function Info({ room, name, onClose, onLeft, onImg }: { room: RoomRow; name: string; onClose: () => void; onLeft: () => void; onImg: (m: ChatMessage) => void }) {
  const c = useChat();
  const people = usePeople();
  const members = c.membersOf(room.id);
  const me = c.myMember(room.id);
  const isAdmin = !!me?.admin || c.role === 'admin';
  const [adding, setAdding] = useState(false);
  const msgs = c.messagesOf(room.id);
  const media = msgs.filter((m) => !m.deleted && (m.kind === 'image' || m.kind === 'asset'));
  const stars = msgs.filter((m) => c.starred.has(m.id) && !m.deleted);
  const other = room.type === 'dm' ? people.personOf(members.find((m) => m.email !== c.me)?.email ?? '') : undefined;
  return (
    <aside className="cx-info" aria-label="معلومات المحادثة">
      <div className="cx-info-x">
        <button type="button" className="ml-btn icon quiet" aria-label="إغلاق" onClick={onClose}>
          <I n="x" />
        </button>
      </div>
      <div className="hero2">
        {other ? <Face email={other.email} label={other.display_name} size="lg" dot /> : <RoomFace r={room} name={name} size="lg" />}
        <b>{name}</b>
        {other ? (
          <>
            <small>{other.profile?.headline || roleTitle(other)}</small>
            <span className="cx-pres">
              <i className={`pdot ${presenceOf(other)}`} />
              {presenceText(other)}
            </span>
          </>
        ) : (
          <>
            {room.description && <small>{room.description}</small>}
            <small>
              {room.type === 'channel' ? 'قناة إعلانات' : 'مجموعة'} · {members.length} أعضاء
            </small>
          </>
        )}
      </div>
      {room.type !== 'dm' && (
        <section>
          <h5>
            الأعضاء
            {isAdmin && (
              <button type="button" className="ml-btn sm quiet" onClick={() => setAdding(!adding)}>
                <I n="plus" />
                إضافة
              </button>
            )}
          </h5>
          {adding && (
            <select
              className="ml-sel"
              aria-label="إضافة عضو"
              value=""
              onChange={(e) => e.target.value && void c.rpc('chat_member', { p_room: room.id, p_email: e.target.value, p_op: 'add' }).then(() => setAdding(false))}
            >
              <option value="">اختر زميلاً</option>
              {people.people
                .filter((p) => !members.some((m) => m.email === p.email))
                .map((p) => (
                  <option key={p.email} value={p.email}>
                    {p.display_name} · {roleTitle(p)}
                  </option>
                ))}
            </select>
          )}
          {members.map((m) => {
            const p = people.personOf(m.email);
            return (
              <div key={m.email} className="mem2">
                <Face email={m.email} label={p?.display_name ?? m.email} size="sm" dot />
                <span className="t">
                  {m.email === c.me ? 'أنت' : p?.display_name}
                  <small>
                    {p?.profile?.headline || roleTitle(p)} · {presenceText(p)}
                  </small>
                </span>
                {m.admin && <span className="adm">مشرف</span>}
                {isAdmin && m.email !== c.me && (
                  <button type="button" className="ml-btn icon quiet" aria-label={`إزالة ${p?.display_name ?? ''}`} onClick={() => void c.rpc('chat_member', { p_room: room.id, p_email: m.email, p_op: 'remove' })}>
                    <I n="x" />
                  </button>
                )}
              </div>
            );
          })}
        </section>
      )}
      <section>
        <h5>
          الوسائط والأصول <small>{media.length}</small>
        </h5>
        {media.length ? (
          <div className="gal">
            {media.map((m) =>
              m.kind === 'image' ? (
                <button type="button" key={m.id} onClick={() => onImg(m)} aria-label="صورة">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/chat/file/${String(m.data?.file)}`} alt="" loading="lazy" />
                </button>
              ) : (
                <Link key={m.id} href={`/media/${String(m.data?.asset_id)}`} aria-label={String(m.data?.name ?? '')} className="galt">
                  <I n="film" />
                </Link>
              ),
            )}
          </div>
        ) : (
          <small className="ml-who">لا وسائط بعد.</small>
        )}
      </section>
      {stars.length > 0 && (
        <section>
          <h5>المميّزة</h5>
          {stars.map((m) => (
            <div key={m.id} className="cx-starline">
              <small>
                {people.nameOf(m.author)} · <bdi dir="ltr">{hhmm(m.created_at)}</bdi>
              </small>
              {snippet(m)}
            </div>
          ))}
        </section>
      )}
      <section>
        <label className="ml-check">
          <input type="checkbox" checked={!!me?.muted} onChange={(e) => void c.rpc('chat_state', { p_room: room.id, p_patch: { muted: e.target.checked } })} />
          كتم الإشعارات
        </label>
      </section>
      {room.type !== 'dm' && (
        <button type="button" className="ml-btn danger" onClick={() => void c.rpc('chat_member', { p_room: room.id, p_email: null, p_op: 'leave' }, 'غادرت المجموعة.').then(onLeft)}>
          مغادرة {room.type === 'channel' ? 'القناة' : 'المجموعة'}
        </button>
      )}
    </aside>
  );
}

/* ------------------------------------------------------------------ dialogs */

function Dlg({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog ref={ref} className={`ml-dlg ${wide ? 'wide' : ''}`} aria-label={title} onCancel={(e) => (e.preventDefault(), onClose())}>
      <div className="ml cx-d">
        <div className="ml-dlg-head">
          <h2>{title}</h2>
          <button type="button" className="ml-btn icon quiet" aria-label="إغلاق" onClick={onClose}>
            <I n="x" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

function Pop({ x, y, onClose, children }: { x: number; y: number; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.mx-menu')) onClose();
    };
    const esc = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose();
    const t = setTimeout(() => document.addEventListener('click', close), 0);
    document.addEventListener('keydown', esc);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', esc);
    };
  }, [onClose]);
  const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const h = typeof window !== 'undefined' ? window.innerHeight : 900;
  return (
    <div className="mx-menu cx-menu" role="menu" style={{ left: Math.max(8, Math.min(x - 130, w - 270)), top: y > h - 380 ? Math.max(8, y - 370) : y + 8 }}>
      {children}
    </div>
  );
}

function NewChat({ onClose, onOpen }: { onClose: () => void; onOpen: (id: string) => void }) {
  const c = useChat();
  const people = usePeople();
  const { state } = useHub();
  const [tab, setTab] = useState<'dm' | 'group'>('dm');
  const [name, setName] = useState('');
  const [pick, setPick] = useState<string[]>([]);
  const [link, setLink] = useState('');
  const [channel, setChannel] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const others = people.people.filter((p) => p.email !== c.me);

  const dm = async (email: string) => {
    const r = await c.rpc('chat_open_dm', { p_email: email });
    if (r.ok && r.id) onOpen(r.id);
    else if (!r.ok) setError(r.error);
  };
  const create = async () => {
    if (!name.trim() || !pick.length) return setError('اكتب اسم المجموعة واختر عضواً واحداً على الأقل.');
    setBusy(true);
    const w = state.work.find((x) => x.id === link);
    const r = await c.rpc('chat_create_room', {
      p_type: channel ? 'channel' : 'group',
      p_name: name.trim(),
      p_desc: null,
      p_members: pick,
      p_link: link === 'campaign' ? { type: 'campaign' } : w ? { type: 'work', id: w.id, title: w.title } : null,
    });
    setBusy(false);
    if (r.ok && r.id) onOpen(r.id);
    else if (!r.ok) setError(r.error);
  };

  return (
    <Dlg title="محادثة جديدة" onClose={onClose}>
      <div className="mx-seg" role="tablist">
        <button type="button" aria-pressed={tab === 'dm'} onClick={() => setTab('dm')}>
          محادثة مباشرة
        </button>
        <button type="button" aria-pressed={tab === 'group'} onClick={() => setTab('group')}>
          مجموعة جديدة
        </button>
      </div>
      {tab === 'dm' ? (
        <div className="cx-pick">
          {others.map((p) => (
            <button type="button" key={p.email} onClick={() => void dm(p.email)}>
              <Face email={p.email} label={p.display_name} size="sm" dot />
              <span>
                <b>{p.display_name}</b>
                <small>
                  {p.profile?.headline || roleTitle(p)} · {presenceText(p)}
                </small>
              </span>
            </button>
          ))}
          {!others.length && <p className="ml-mtext">لا زملاء في المركز بعد. يضيفهم مسؤول النظام من صفحة الحسابات.</p>}
        </div>
      ) : (
        <>
          <label className="ml-l" htmlFor="cx-gname">
            اسم المجموعة
            <input id="cx-gname" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: تصوير الملتقى" />
          </label>
          <div className="ml-l">
            الأعضاء
            <div className="cx-checks">
              {others.map((p) => (
                <label key={p.email}>
                  <input type="checkbox" checked={pick.includes(p.email)} onChange={(e) => setPick(e.target.checked ? [...pick, p.email] : pick.filter((x) => x !== p.email))} />
                  <Face email={p.email} label={p.display_name} size="sm" />
                  <span>
                    {p.display_name}
                    <small>{roleTitle(p)}</small>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <label className="ml-l" htmlFor="cx-glink">
            ربطها بـ
            <select id="cx-glink" value={link} onChange={(e) => setLink(e.target.value)}>
              <option value="">بلا ربط</option>
              <option value="campaign">{campaign.title}</option>
              {state.work.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.id} · {w.title}
                </option>
              ))}
            </select>
          </label>
          {canChannel(c.role) && (
            <label className="ml-check">
              <input type="checkbox" checked={channel} onChange={(e) => setChannel(e.target.checked)} />
              قناة إعلانات: الكتابة للمشرفين فقط
            </label>
          )}
          {error && <p className="ml-err">{error}</p>}
          <div className="ml-row-end">
            <button type="button" className="ml-btn" onClick={onClose}>
              إلغاء
            </button>
            <button type="button" className="ml-btn primary" disabled={busy} onClick={() => void create()}>
              إنشاء المجموعة
            </button>
          </div>
        </>
      )}
      {tab === 'dm' && error && <p className="ml-err">{error}</p>}
    </Dlg>
  );
}

function Forward({ msg, names, onClose }: { msg: ChatMessage; names: (r: RoomRow) => string; onClose: () => void }) {
  const c = useChat();
  const [pick, setPick] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const rooms = c.rooms.filter((r) => r.type !== 'channel' || c.myMember(r.id)?.admin || c.role === 'admin');
  const go = async () => {
    setBusy(true);
    const d = (msg.data ?? {}) as Record<string, unknown>;
    for (const room of pick) {
      if (msg.kind === 'poll') await c.send(room, 'poll', '', { q: d.q, options: d.options, multi: d.multi }, { forward: true });
      else if (msg.kind === 'approval' || msg.kind === 'asset') await c.send(room, 'asset', msg.body, { asset_id: d.asset_id }, { forward: true });
      else if (msg.kind === 'work') await c.send(room, 'work', msg.body, { id: d.id, title: d.title }, { forward: true });
      else if (['voice', 'image', 'file'].includes(msg.kind)) await c.send(room, msg.kind, msg.body, { file: d.file, dur: d.dur, wave: d.wave }, { forward: true });
      else await c.send(room, 'text', msg.body || snippet(msg), null, { forward: true });
    }
    setBusy(false);
    c.say(`أُعيد توجيهها إلى ${pick.length} ${pick.length > 1 ? 'محادثات' : 'محادثة'}.`);
    onClose();
  };
  return (
    <Dlg title="إعادة توجيه" onClose={onClose}>
      <p className="ml-hint">
        <I n="forward" />
        <span>{snippet(msg)}</span>
      </p>
      <div className="cx-checks">
        {rooms.map((r) => (
          <label key={r.id}>
            <input type="checkbox" checked={pick.includes(r.id)} onChange={(e) => setPick(e.target.checked ? [...pick, r.id] : pick.filter((x) => x !== r.id))} />
            <RoomFace r={r} name={names(r)} size="sm" />
            <span>
              {names(r)}
              <small>{r.type === 'dm' ? 'محادثة مباشرة' : `${c.membersOf(r.id).length} أعضاء`}</small>
            </span>
          </label>
        ))}
      </div>
      <p className="ml-hint">
        <I n="mail" />
        <span>للجهات الخارجية أو للسجل الرسمي استخدم «تحويل إلى بريد رسمي» من قائمة الرسالة.</span>
      </p>
      <div className="ml-row-end">
        <button type="button" className="ml-btn" onClick={onClose}>
          إلغاء
        </button>
        <button type="button" className="ml-btn primary" disabled={!pick.length || busy} onClick={() => void go()}>
          <I n="send" />
          إرسال
        </button>
      </div>
    </Dlg>
  );
}

function PollDialog({ room, onClose }: { room: RoomRow; onClose: () => void }) {
  const c = useChat();
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState(['', '']);
  const [multi, setMulti] = useState(false);
  const [error, setError] = useState('');
  const post = async () => {
    const list = opts.map((o) => o.trim()).filter(Boolean);
    if (!q.trim() || list.length < 2) return setError('اكتب السؤال وخيارين على الأقل.');
    const r = await c.send(room.id, 'poll', '', { q: q.trim(), options: list, multi });
    if (!r.ok) return setError(r.error);
    onClose();
  };
  return (
    <Dlg title="تصويت جديد" onClose={onClose}>
      <label className="ml-l" htmlFor="cx-pq">
        السؤال
        <input id="cx-pq" maxLength={120} value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="ml-l">
        الخيارات
        {opts.map((o, i) => (
          <div key={i} className="cx-optrow">
            <input aria-label={`الخيار ${i + 1}`} maxLength={60} value={o} onChange={(e) => setOpts(opts.map((x, k) => (k === i ? e.target.value : x)))} />
            {opts.length > 2 && (
              <button type="button" className="ml-btn icon quiet" aria-label="حذف الخيار" onClick={() => setOpts(opts.filter((_, k) => k !== i))}>
                <I n="x" />
              </button>
            )}
          </div>
        ))}
        {opts.length < 6 && (
          <button type="button" className="ml-btn sm" onClick={() => setOpts([...opts, ''])}>
            <I n="plus" />
            خيار
          </button>
        )}
      </div>
      <label className="ml-check">
        <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} />
        السماح بأكثر من خيار
      </label>
      {error && <p className="ml-err">{error}</p>}
      <div className="ml-row-end">
        <button type="button" className="ml-btn" onClick={onClose}>
          إلغاء
        </button>
        <button type="button" className="ml-btn primary" onClick={() => void post()}>
          نشر التصويت
        </button>
      </div>
    </Dlg>
  );
}

function TaskDialog({ room, what: initial, onClose }: { room: RoomRow; what?: string; onClose: () => void }) {
  const c = useChat();
  const people = usePeople();
  const members = c.membersOf(room.id).filter((m) => m.email !== c.me);
  const [what, setWhat] = useState((initial ?? '').slice(0, 140));
  const [who, setWho] = useState(members[0]?.email ?? '');
  const [due, setDue] = useState(localInput(24, 12));
  const [urgent, setUrgent] = useState(false);
  const [error, setError] = useState('');
  const go = async () => {
    if (!what.trim() || !who) return setError('اكتب المطلوب واختر المسؤول.');
    const r = await c.send(room.id, 'task', '', { what: what.trim(), assignee: who, due: new Date(due).toISOString(), priority: urgent ? 'urgent' : 'normal' });
    if (!r.ok) return setError(r.error);
    c.say(`أُسندت المهمة إلى ${people.nameOf(who)} وأُضيفت إلى صفحة المهام.`);
    onClose();
  };
  return (
    <Dlg title="مهمة جديدة" onClose={onClose}>
      <label className="ml-l" htmlFor="cx-tw">
        المطلوب
        <input id="cx-tw" maxLength={140} value={what} onChange={(e) => setWhat(e.target.value)} />
      </label>
      <div className="ml-two">
        <label className="ml-l" htmlFor="cx-ta">
          المسؤول
          <select id="cx-ta" value={who} onChange={(e) => setWho(e.target.value)}>
            {members.map((m) => (
              <option key={m.email} value={m.email}>
                {people.nameOf(m.email)}
              </option>
            ))}
          </select>
        </label>
        <label className="ml-l" htmlFor="cx-td">
          التسليم
          <input id="cx-td" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
      </div>
      <label className="ml-check">
        <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
        عاجلة
      </label>
      <p className="ml-hint">
        <I n="tasks" />
        <span>تُنشأ المهمة في صفحة المهام، ويُنجزها المسؤول من البطاقة.</span>
      </p>
      {error && <p className="ml-err">{error}</p>}
      <div className="ml-row-end">
        <button type="button" className="ml-btn" onClick={onClose}>
          إلغاء
        </button>
        <button type="button" className="ml-btn primary" onClick={() => void go()}>
          إسناد المهمة
        </button>
      </div>
    </Dlg>
  );
}

function AssetDialog({ room, approval, onClose }: { room: RoomRow; approval: boolean; onClose: () => void }) {
  const c = useChat();
  const list: AssetLite[] = c.assets.filter((a) => !approval || a.stage === 'review');
  const [caption, setCaption] = useState('');
  const go = async (a: AssetLite) => {
    const r = await c.send(room.id, approval ? 'approval' : 'asset', caption.trim(), { asset_id: a.id });
    if (!r.ok) return c.say(r.error);
    if (approval) c.say('أُرسل طلب الاعتماد.');
    onClose();
  };
  return (
    <Dlg title={approval ? 'طلب اعتماد' : 'أصل من مكتبة الوسائط'} onClose={onClose}>
      {approval && (
        <p className="ml-hint">
          <I n="check" />
          <span>البطاقة مربوطة بالإصدار الحالي، ويقرر مدير الاتصال أو مساعده من المحادثة أو من البريد أو المكتبة.</span>
        </p>
      )}
      <label className="ml-l" htmlFor="cx-cap">
        تعليق (اختياري)
        <input id="cx-cap" maxLength={300} value={caption} onChange={(e) => setCaption(e.target.value)} />
      </label>
      <div className="cx-pick">
        {list.map((a) => (
          <button type="button" key={a.id} onClick={() => void go(a)}>
            <span className="th">
              <Thumb asset={{ id: a.id, kind: a.kind as 'image', name: a.name, current_version: a.current_version }} />
            </span>
            <span>
              <b>{a.name}</b>
              <small>
                الإصدار {a.current_version} · {fileSize(a.size_bytes)}
              </small>
            </span>
            <span className={`mx-chip ${STAGE_TONE[a.stage] ?? ''}`}>{stageAr(a.stage)}</span>
          </button>
        ))}
        {!list.length && <p className="ml-mtext">{approval ? 'لا أصول «قيد المراجعة» تملك الوصول إليها.' : 'لا أصول تملك الوصول إليها في المكتبة.'}</p>}
      </div>
    </Dlg>
  );
}

function WorkDialog({ room, onClose }: { room: RoomRow; onClose: () => void }) {
  const c = useChat();
  const { state } = useHub();
  const go = async (id: string, title: string, status: string) => {
    const r = await c.send(room.id, 'work', '', { id, title, status });
    if (!r.ok) return c.say(r.error);
    onClose();
  };
  return (
    <Dlg title="عمل من صفحة العمل" onClose={onClose}>
      <div className="cx-pick">
        {state.work.map((w) => (
          <button type="button" key={w.id} onClick={() => void go(w.id, w.title, w.status)}>
            <I n="work" />
            <span>
              <b>
                <bdi dir="ltr">{w.id}</bdi> {w.title}
              </b>
            </span>
            <span className="mx-chip review">{statusLabels[w.status]}</span>
          </button>
        ))}
      </div>
    </Dlg>
  );
}

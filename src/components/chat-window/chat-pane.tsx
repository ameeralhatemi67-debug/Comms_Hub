'use client';
// «المراسلة» in the window. The conversation, its info panel and its dialogs are the messaging
// tab's own (src/components/chat/chat-tab.tsx); only the list and the message box are the
// window's. «العام» and a work's conversation appear before their first message and start with it.
import { useEffect, useMemo, useState } from 'react';
import { AtSign, BellOff, BriefcaseBusiness, Globe, MessagesSquare, MoveHorizontal, Search, SquarePen } from 'lucide-react';
import { dayLabel, hhmm, mentionsMe, snippet, unreadCount, type ChatMessage, type RoomRow } from '@/lib/chat/rules';
import { NEXT_AR, atLeast, matches, membersAr } from '@/lib/chat-window/rules';
import { useChat } from '../chat/provider';
import { usePeople } from '../people';
import {
  AssetDialog,
  Conversation,
  Dlg,
  Forward,
  Info,
  NewChat,
  PollDialog,
  RoomFace,
  TaskDialog,
  WorkDialog,
  dmOther,
  type DialogState,
} from '../chat/chat-tab';
import { RequestPermissionDialog } from '../perm-requests';
import { WaPushList } from '../chat/whatsapp';
import { useWin } from './state';
import { Box } from './composer';
import { useMyWorks } from './works';

export const isGlobal = (r: RoomRow) => r.link?.type === 'all';
export const isWorkRoom = (r: RoomRow, id?: string) => r.link?.type === 'work' && !!r.link.auto && (!id || r.link.id === id);

export function useRoomName() {
  const c = useChat();
  const people = usePeople();
  return (r: RoomRow) => (r.type === 'dm' ? people.nameOf(dmOther(r, c.me, c.membersOf(r.id))) : r.name ?? '');
}

export function ChatPane() {
  const w = useWin();
  const c = useChat();
  const roomName = useRoomName();
  const [dialog, setDialog] = useState<{ d: DialogState; room: RoomRow | null }>({ d: null, room: null });
  const [info, setInfo] = useState(false);
  const room = w.room ? c.rooms.find((r) => r.id === w.room) : undefined;

  // The open room counts as read and receives its typing signals.
  useEffect(() => {
    c.open(room?.id ?? null);
  }, [room?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => c.open(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (c.status === 'loading') return <div className="cw-wait" role="status">جارٍ تحميل المراسلة…</div>;
  if (c.status === 'error')
    return (
      <div className="cw-wait" role="alert">
        تعذّر تحميل المراسلة.{' '}
        <button type="button" className="ml-btn sm" onClick={() => void c.reload()}>
          أعد المحاولة
        </button>
      </div>
    );

  const openDialog = (d: DialogState, r: RoomRow | null = room ?? null) => setDialog({ d, room: r });
  const box = <Box onDialog={openDialog} />;
  const main = room ? (
    <Conversation
      key={room.id}
      room={room}
      name={roomName(room)}
      info={info}
      onInfo={() => setInfo(!info)}
      onBack={() => w.openRoom(null)}
      onDialog={(d) => openDialog(d)}
      onToMail={(p) => {
        w.setBox({ dest: { k: 'mail' }, to: p.to, subject: p.subject, text: p.body });
        setTimeout(() => w.focusBox.current?.(), 0);
      }}
      composer={(slot) => <Box slot={slot} onDialog={openDialog} />}
    />
  ) : w.pending ? (
    <>
      <Pending />
      {box}
    </>
  ) : null;

  const infoPanel = room && info && (
    <Info room={room} name={roomName(room)} onClose={() => setInfo(false)} onLeft={() => (setInfo(false), w.openRoom(null))} onImg={(msg) => openDialog({ kind: 'img', msg })} />
  );

  const dialogs = <Dialogs state={dialog} onClose={() => setDialog({ d: null, room: null })} names={roomName} />;

  if (w.tier === 'side')
    return (
      <div className={`cw-col cx-wrap ${infoPanel ? 'with-info' : ''}`}>
        {main ?? (
          <>
            <RoomList onNew={() => openDialog({ kind: 'new' })} />
            {box}
          </>
        )}
        {infoPanel && <div className="cw-over">{infoPanel}</div>}
        {dialogs}
      </div>
    );

  const full = atLeast(w.tier, 'full');
  return (
    <div className={`cw-grid c-${full ? 'full' : 'middle'} ${full && infoPanel ? 'with-info' : ''}`}>
      <RoomList onNew={() => openDialog({ kind: 'new' })} />
      <div className="cw-col cx-wrap">
        {main ?? (
          <>
            <Empty />
            {box}
          </>
        )}
        {!full && infoPanel && <div className="cw-over">{infoPanel}</div>}
      </div>
      {full && infoPanel}
      {dialogs}
    </div>
  );
}

function Dialogs({ state, onClose, names }: { state: { d: DialogState; room: RoomRow | null }; onClose: () => void; names: (r: RoomRow) => string }) {
  const w = useWin();
  const people = usePeople();
  const { d, room } = state;
  if (!d) return null;
  if (d.kind === 'new') return <NewChat onClose={onClose} onOpen={(id) => (onClose(), w.openRoom(id))} />;
  if (d.kind === 'fwd') return <Forward msg={d.msg} names={names} onClose={onClose} />;
  if (d.kind === 'perm') return <RequestPermissionDialog source="chat" onClose={onClose} />;
  if (d.kind === 'img')
    return (
      <Dlg title={d.msg.body || 'صورة'} onClose={onClose} wide>
        <div className="cx-lightbox">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/chat/file/${String(d.msg.data?.file)}`} alt={d.msg.body || 'صورة'} />
          <small>
            {people.nameOf(d.msg.author)} · <bdi dir="ltr">{hhmm(d.msg.created_at)}</bdi>
          </small>
        </div>
      </Dlg>
    );
  if (!room) return null;
  if (d.kind === 'poll') return <PollDialog room={room} onClose={onClose} />;
  if (d.kind === 'task') return <TaskDialog room={room} what={d.what} onClose={onClose} />;
  if (d.kind === 'asset' || d.kind === 'approval') return <AssetDialog room={room} approval={d.kind === 'approval'} onClose={onClose} />;
  if (d.kind === 'work') return <WorkDialog room={room} onClose={onClose} />;
  if (d.kind === 'wa')
    return (
      <Dlg title="إرسال إلى واتساب" onClose={onClose}>
        <WaPushList room={room} msg={d.msg} onDone={onClose} />
      </Dlg>
    );
  return null;
}

function lastAt(c: ReturnType<typeof useChat>, r: RoomRow) {
  return c.messagesOf(r.id).at(-1)?.created_at ?? r.last_at;
}

function RoomList({ onNew }: { onNew: () => void }) {
  const w = useWin();
  const c = useChat();
  const people = usePeople();
  const roomName = useRoomName();
  const works = useMyWorks();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'mentions'>('all');
  const myName = people.me?.display_name ?? '';
  const globalRoom = c.rooms.find(isGlobal);

  const list = useMemo(() => {
    return c.rooms
      .filter((r) => {
        const ms = c.messagesOf(r.id);
        if (filter === 'unread' && !unreadCount(ms, c.myMember(r.id), c.me)) return false;
        if (filter === 'mentions' && !mentionsMe(ms, c.myMember(r.id), c.me, myName)) return false;
        return matches(q, roomName(r), r.link?.type === 'work' ? r.link.id : '');
      })
      .sort((a, b) => {
        const ga = isGlobal(a) ? 1 : 0;
        const gb = isGlobal(b) ? 1 : 0;
        if (ga !== gb) return gb - ga;
        const pa = c.myMember(a.id)?.pinned ? 1 : 0;
        const pb = c.myMember(b.id)?.pinned ? 1 : 0;
        if (pa !== pb) return pb - pa;
        return lastAt(c, a) < lastAt(c, b) ? 1 : -1;
      });
  }, [c, filter, q, myName]); // eslint-disable-line react-hooks/exhaustive-deps

  // The work this page is about: its conversation, or the offer to start it.
  const pageWork = w.pageWork ? works.find((x) => x.id === w.pageWork) : undefined;
  const pageRoom = w.pageWork ? c.rooms.find((r) => isWorkRoom(r, w.pageWork!)) : undefined;
  const sections: [string, RoomRow[]][] = atLeast(w.tier, 'middle') && !q && filter === 'all'
    ? [
        ['', list.filter((r) => isGlobal(r))],
        ['الأعمال', list.filter((r) => r.link?.type === 'work')],
        ['المجموعات والقنوات', list.filter((r) => r.type !== 'dm' && !isGlobal(r) && r.link?.type !== 'work')],
        ['الأشخاص', list.filter((r) => r.type === 'dm')],
      ]
    : [['', list]];

  return (
    <section className="cw-list" aria-label="المحادثات">
      <div className="cw-lhead">
        <label className="cw-search">
          <Search aria-hidden />
          <input type="search" placeholder="ابحث في المحادثات" value={q} onChange={(e) => setQ(e.target.value)} aria-label="ابحث في المحادثات" autoComplete="off" />
        </label>
        {atLeast(w.tier, 'full') && (
          <button type="button" className="cw-ib" aria-label="محادثة جديدة" title="محادثة جديدة" onClick={onNew}>
            <SquarePen aria-hidden />
          </button>
        )}
      </div>
      <div className="cw-chips" role="group" aria-label="تصفية">
        {(
          [
            ['all', 'الكل'],
            ['unread', 'غير مقروء'],
            ['mentions', 'الإشارات'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>
            {l}
          </button>
        ))}
      </div>
      {w.pageWork && !q && (pageRoom || pageWork) && (
        <button
          type="button"
          className="cw-ctx"
          onClick={() => (pageRoom ? w.openRoom(pageRoom.id) : w.openPending({ k: 'work', id: pageWork!.id, title: pageWork!.title }))}
        >
          <span className="cw-face t-work">
            <BriefcaseBusiness aria-hidden />
          </span>
          <span>
            <small>
              أنت في صفحة <bdi dir="ltr">{w.pageWork}</bdi>
            </small>
            <b>{pageRoom ? 'محادثة هذا العمل' : 'ابدأ محادثة هذا العمل'}</b>
          </span>
        </button>
      )}
      <div className="cw-rows">
        {!globalRoom && !q && filter === 'all' && (
          <button type="button" className={`cw-row ${w.pending?.k === 'all' ? 'on' : ''}`} onClick={() => w.openPending({ k: 'all' })}>
            <span className="cw-face t-all">
              <Globe aria-hidden />
            </span>
            <span className="tx">
              <span className="l1">
                <b>العام</b>
              </span>
              <span className="l2">
                <span>لكل أعضاء المركز. تبدأ مع أول رسالة.</span>
              </span>
            </span>
          </button>
        )}
        {sections
          .filter(([, l]) => l.length)
          .map(([title, l]) => (
            <div key={title || 'x'}>
              {title && <div className="cw-sec">{title}</div>}
              {l.map((r) => (
                <Row key={r.id} r={r} name={roomName(r)} myName={myName} />
              ))}
            </div>
          ))}
        {!list.length && (q || filter !== 'all') && <p className="cw-none">{q ? 'لا نتائج. جرّب اسماً آخر أو رقم العمل.' : 'لا شيء هنا الآن.'}</p>}
        {w.tier !== 'page' && (
          <p className="cw-next">
            <MoveHorizontal aria-hidden />
            {NEXT_AR.chat[w.tier]}
          </p>
        )}
      </div>
    </section>
  );
}

function Row({ r, name, myName }: { r: RoomRow; name: string; myName: string }) {
  const w = useWin();
  const c = useChat();
  const people = usePeople();
  const ms = c.messagesOf(r.id);
  const me = c.myMember(r.id);
  const unread = unreadCount(ms, me, c.me);
  const mention = mentionsMe(ms, me, c.me, myName);
  const last = [...ms].reverse().find((m) => m.kind !== 'sys') as ChatMessage | undefined;
  const at = last?.created_at ?? r.last_at;
  const today = dayLabel(at, c.now) === 'اليوم';
  const who = last ? (last.author === c.me ? 'أنت: ' : r.type === 'dm' ? '' : `${people.nameOf(last.author).split(' ')[0]}: `) : '';
  const sub = isGlobal(r) ? membersAr(c.membersOf(r.id).length) : r.link?.type === 'work' ? r.link.id : '';
  return (
    <button type="button" className={`cw-row ${unread ? 'unread' : ''} ${w.room === r.id ? 'on' : ''}`} onClick={() => w.openRoom(r.id)}>
      {isGlobal(r) ? (
        <span className="cw-face t-all">
          <Globe aria-hidden />
        </span>
      ) : (
        <RoomFace r={r} name={name} size="sm" />
      )}
      <span className="tx">
        <span className="l1">
          <b>{name}</b>
          <time dir="ltr">{today ? hhmm(at) : dayLabel(at, c.now)}</time>
        </span>
        <span className="l2">
          <span>
            {sub && <bdi dir="ltr">{sub} · </bdi>}
            {last ? who + snippet(last) : 'لا رسائل بعد'}
          </span>
          {me?.muted && <BellOff aria-label="مكتومة" />}
          {mention && (
            <span className="cw-at" title="إشارة إليك">
              <AtSign aria-hidden />
            </span>
          )}
          {unread > 0 && <span className="cw-n">{unread}</span>}
        </span>
      </span>
    </button>
  );
}

function Pending() {
  const w = useWin();
  const p = w.pending!;
  return (
    <section className="cx-main cw-pending" aria-label={p.k === 'all' ? 'العام' : p.title}>
      <header className="cx-top">
        {w.tier === 'side' && (
          <button type="button" className="ml-btn sm quiet cx-back" onClick={() => w.openPending(null)} aria-label="العودة إلى القائمة">
            <span aria-hidden>‹</span>
          </button>
        )}
        <span className={`cw-face ${p.k === 'all' ? 't-all' : 't-work'}`}>{p.k === 'all' ? <Globe aria-hidden /> : <BriefcaseBusiness aria-hidden />}</span>
        <b className="who">{p.k === 'all' ? 'العام' : p.title}</b>
      </header>
      <div className="cw-start">
        {p.k === 'all' ? (
          <p>«العام» محادثة لكل أعضاء المركز. لم تبدأ بعد: أول رسالة تكتبها هنا تبدؤها، ويُضم إليها كل عضو تلقائياً. يمكن لكل عضو كتمها.</p>
        ) : (
          <p>
            محادثة العمل <bdi dir="ltr">{p.id}</bdi> لم تبدأ بعد. أول رسالة تبدؤها، وتضم أصحاب مراحله ومسؤوله ومدير الاتصال ومساعده.
          </p>
        )}
      </div>
    </section>
  );
}

function Empty() {
  return (
    <div className="cw-empty">
      <MessagesSquare aria-hidden />
      <b>اختر محادثة من القائمة</b>
      <p>أو اكتب في الصندوق أدناه، فتصل رسالتك إلى «العام». اكتب @ في بدايتها لتختار وجهة أخرى، و / للإجراءات السريعة.</p>
    </div>
  );
}

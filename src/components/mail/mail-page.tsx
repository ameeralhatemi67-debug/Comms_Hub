'use client';
// البريد: internal mail between the department's accounts, the shared outside mailbox
// (Gmail), and action cards bound to real records. Specification: MVP_draft.md
// section 31, extended by the owner's brief of 2026-10-11 (progress.md).
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { roles } from '@/lib/domain';
import { useHub } from '@/lib/store';
import { Title } from '../ui';
import {
  FOLDERS,
  SHARED_FOLDERS,
  awaiting,
  extStatusLabels,
  extStatusTone,
  fullWhen,
  hoursMinutes,
  inFolder,
  isApprover,
  isLead,
  isUnread,
  mails,
  matches,
  parseQuery,
  replyMinutes,
  shortWhen,
  type FolderId,
  type View,
} from '@/lib/mail/rules';
import { Composer, blankDraft, cardTitle, type Draft } from './composer';
import { Av, I, localInput, tokenName, type IconName } from './parts';
import { MailProvider, useMail, type Outgoing } from './provider';
import { ThreadView } from './thread';
import { ChatProvider, useChat } from '../chat/provider';
import { ChatTab, type MailPrefill } from '../chat/chat-tab';
import { PeopleProvider, usePeopleOptional } from '../people';
import { unreadCount } from '@/lib/chat/rules';

const FOLDER_ICONS: Record<string, IconName> = {
  inbox: 'inbox', action: 'flag', mine: 'user', waiting: 'clock', starred: 'star', snoozed: 'alarm', sent: 'send',
  scheduled: 'cal', drafts: 'pencil', gate: 'shield', archive: 'archive', trash: 'trash',
  'shared:all': 'inbox', 'shared:unassigned': 'user', 'shared:closed': 'archive',
};
const LABEL_SET = ['طلبات تغطية', 'شركاء', 'صحافة', 'اليوم الوطني', 'عاجل'];

const memory = { folder: 'inbox' as FolderId };

/** A draft waiting for the mail tab, when a chat message is moved to formal mail. */
let queuedDraft: MailPrefill | null = null;

export function MailPage({ tab = 'mail' }: { tab?: 'mail' | 'chat' }) {
  return (
    <PeopleProvider>
      <MailProvider>
        <ChatProvider>{tab === 'chat' ? <ChatView /> : <Mail />}</ChatProvider>
      </MailProvider>
    </PeopleProvider>
  );
}

/** البريد and المراسلة, each with its unread count. */
function MailTabs({ active }: { active: 'mail' | 'chat' }) {
  const m = useMail();
  const c = useChat();
  const mailUnread = m.views.filter((v) => inFolder(v, 'inbox', { me: m.me, role: m.role, now: m.now }) && isUnread(v, m.me, m.now)).length;
  const chatUnread = c.rooms.reduce((n, r) => (c.myMember(r.id)?.muted ? n : n + unreadCount(c.messagesOf(r.id), c.myMember(r.id), c.me)), 0);
  return (
    <nav className="ml-tabs" aria-label="البريد والمراسلة">
      <Link href="/mail" aria-current={active === 'mail' ? 'page' : undefined}>
        <I n="mail" />
        البريد
        {mailUnread > 0 && <span className="n">{mailUnread}</span>}
      </Link>
      <Link href="/mail/chat" aria-current={active === 'chat' ? 'page' : undefined}>
        <I n="reply" />
        المراسلة
        {chatUnread > 0 && <span className="n">{chatUnread}</span>}
      </Link>
    </nav>
  );
}

function ChatView() {
  const router = useRouter();
  return (
    <div className="mx ml" dir="rtl">
      <Title title="" accent="المراسلة" sub="حديث الفريق اليومي، مع معاينات العمل والبطاقات. ما يحتاج سجلاً رسمياً أو جهة خارجية يذهب إلى البريد.">
        <MailTabs active="chat" />
      </Title>
      <ChatTab
        onToMail={(p) => {
          queuedDraft = p;
          router.push('/mail');
        }}
      />
    </div>
  );
}

type Extra = Partial<Draft> & { replyTo?: string; quick?: boolean };

function Mail() {
  const m = useMail();
  const router = useRouter();
  const { state, dispatch } = useHub();
  const [folder, setFolderState] = useState<FolderId>(memory.folder);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'internal' | 'external' | 'cards'>('all');
  // A work page links its mail as /mail?thread=<id>.
  const [openId, setOpenId] = useState<string | null>(() => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('thread')));
  const [sel, setSel] = useState<string[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dialog, setDialog] = useState<null | 'settings' | 'keys' | 'work'>(null);
  const [menu, setMenu] = useState<null | { kind: 'snooze' | 'label'; x: number; y: number }>(null);
  const [drafts, setDrafts] = useDrafts(m.me);
  const people = usePeopleOptional();

  // A chat message moved here becomes a draft addressed to the chat's members.
  useEffect(() => {
    if (!queuedDraft) return;
    const p = queuedDraft;
    queuedDraft = null;
    setDraft(blankDraft({ to: p.to, subject: p.subject, body: p.body, refs: p.refs }));
  }, []);
  const search = useRef<HTMLInputElement>(null);

  const setFolder = (f: FolderId) => {
    memory.folder = f;
    setFolderState(f);
    setQ('');
    setSel([]);
    setOpenId(null);
    setFilter('all');
  };
  const ctx = useMemo(() => ({ me: m.me, role: m.role, now: m.now }), [m.me, m.role, m.now]);

  const list = useMemo(() => {
    let l: View[];
    if (q.trim()) {
      const pq = parseQuery(q);
      l = m.views.filter(
        (v) => mails(v).length > 0 && !v.member?.trashed && mails(v).some((x) => x.state !== 'held' && x.state !== 'returned') && matches(v, pq, m.nameOf, m.me, m.now),
      );
    } else l = m.views.filter((v) => inFolder(v, folder, ctx));
    if (filter === 'unread') l = l.filter((v) => isUnread(v, m.me, m.now));
    if (filter === 'internal') l = l.filter((v) => v.thread.kind === 'internal');
    if (filter === 'external') l = l.filter((v) => v.thread.kind === 'external');
    if (filter === 'cards') l = l.filter((v) => mails(v).some((x) => x.card));
    return l;
  }, [m.views, folder, q, filter, ctx, m.nameOf, m.me, m.now]);

  const count = useCallback(
    (f: FolderId) => {
      if (f === 'drafts') return drafts.length;
      const l = m.views.filter((v) => inFolder(v, f, ctx));
      return f === 'inbox' ? l.filter((v) => isUnread(v, m.me, m.now)).length : l.length;
    },
    [m.views, ctx, drafts.length, m.me, m.now],
  );

  const open = openId ? m.viewOf(openId) : undefined;

  const openThread = (id: string) => {
    setOpenId(id);
    setMenu(null);
    const v = m.viewOf(id);
    if (v && isUnread(v, m.me, m.now)) void m.call('mail_state', { p_threads: [id], p_patch: { read: true } });
  };
  const patch = (ids: string[], p: Record<string, unknown>, ok?: string) => m.call('mail_state', { p_threads: ids, p_patch: p }, ok);

  // Builds a reply, reply-all or forward from the thread, then opens it or sends it.
  const compose = (extra: Extra = {}) => {
    const base = blankDraft();
    let d: Draft = { ...base, ...extra };
    const v = extra.thread ? m.viewOf(extra.thread) : undefined;
    if (v && extra.mode && extra.mode !== 'new') {
      const ms = mails(v);
      const src = ms.find((x) => x.id === extra.replyTo) ?? ms[ms.length - 1];
      const t = v.thread;
      if (extra.mode === 'forward') {
        const who = src.author ? m.nameOf(src.author) : src.from_name || src.from_email || '';
        d = {
          ...d,
          subject: `إعادة توجيه: ${t.subject}`,
          body: `${extra.body ?? ''}\n\n---------- رسالة محوّلة ----------\nمن: ${who}\nالتاريخ: ${fullWhen(src.created_at)}\nالموضوع: ${t.subject}\n\n${src.body}`,
          refs: src.refs,
          files: m.files.filter((f) => src.files.includes(f.id)),
        };
      } else {
        const sender = src.author ? `p:${src.author}` : null;
        const others = [...src.to_list, ...src.cc_list].filter((x) => x !== `p:${m.me}` && !x.startsWith('e:'));
        const to: string[] = t.kind === 'external' ? [] : src.author === m.me ? src.to_list : sender ? [sender] : [];
        d = {
          ...d,
          subject: t.subject.startsWith('رد: ') ? t.subject : `رد: ${t.subject}`,
          to: extra.mode === 'replyall' && t.kind === 'internal' ? [...new Set([...to, ...others])] : to,
        };
      }
    }
    if (extra.quick) return sendNow(d);
    setDraft(d);
  };

  const sendNow = (d: Draft) => {
    const me = m.personOf(m.me);
    const out: Outgoing = {
      thread: d.thread,
      forward: d.mode === 'forward',
      subject: d.subject,
      to: d.to,
      cc: d.cc,
      bcc: d.bcc,
      body: `${d.body.trim()}\n\n${people?.me?.profile?.signature || `${me?.display_name ?? ''}\n${roles[m.role]?.name ?? ''}، إدارة الاتصال المؤسسي`}`,
      refs: d.refs,
      files: d.files.map((f) => f.id),
      card: null,
      sendAt: null,
      links: [],
    };
    m.send(out, 'يُرسل الرد', () => setDraft({ ...d, sig: true }));
  };

  const saveDraft = (d: Draft) => {
    setDrafts([{ ...d, savedAt: new Date().toISOString() }, ...drafts.filter((x) => x.key !== d.key)]);
    m.say('حُفظت المسودة في هذا المتصفح.');
  };

  const step = (dir: 1 | -1) => {
    if (!list.length) return;
    const i = list.findIndex((v) => v.thread.id === openId);
    const n = i < 0 ? 0 : Math.max(0, Math.min(list.length - 1, i + dir));
    openThread(list[n].thread.id);
  };

  // Keyboard shortcuts, as in Gmail. Off while typing or while a dialog is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName ?? '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag) || e.ctrlKey || e.metaKey || e.altKey || draft || dialog) return;
      const v = openId ? m.viewOf(openId) : undefined;
      if (e.key === 'c') (e.preventDefault(), compose());
      else if (e.key === '/') (e.preventDefault(), search.current?.focus());
      else if (e.key === '?') setDialog('keys');
      else if (e.key === 'j') step(1);
      else if (e.key === 'k') step(-1);
      else if (e.key === 'u' || e.key === 'Escape') setOpenId(null);
      else if (v && (e.key === 'r' || e.key === 'a' || e.key === 'f'))
        (e.preventDefault(), compose({ mode: e.key === 'r' ? 'reply' : e.key === 'a' ? 'replyall' : 'forward', thread: v.thread.id }));
      else if (v && e.key === 'e') void patch([v.thread.id], { archived: !v.member?.archived }, v.member?.archived ? 'أُعيدت إلى الوارد.' : 'أُرشفت المحادثة.').then(() => setOpenId(null));
      else if (v && e.key === 's') void patch([v.thread.id], { starred: !v.member?.starred });
      else if (v && e.key === '#') void patch([v.thread.id], { trashed: true }, 'نُقلت إلى المهملات.').then(() => setOpenId(null));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const title = q.trim() ? 'نتائج البحث في كل البريد' : [...FOLDERS, ...SHARED_FOLDERS].find((f) => f.id === folder)?.label ?? folder.slice(6);
  const actionCount = count('action');
  const showFolder = (id: FolderId) => {
    if (id === 'gate') return isApprover(m.role) || count('gate') > 0;
    if (id === 'mine') return isLead(m.role) || count('mine') > 0;
    return true;
  };

  if (m.status === 'loading') return <div className="panel" role="status">جارٍ تحميل البريد…</div>;
  if (m.status === 'error')
    return (
      <div className="panel" role="alert">
        تعذّر تحميل البريد. تحقق من الاتصال ثم{' '}
        <button type="button" onClick={() => void m.reload()}>
          أعد المحاولة
        </button>
      </div>
    );

  return (
    <div className="mx ml" dir="rtl">
      <Title title="" accent="البريد" sub="رسائل الفريق الداخلية وصندوق القسم المشترك، مع بطاقات الاعتماد والمواعيد والمهام.">
        <MailTabs active="mail" />
        <span className={`ml-pill ${m.settings.paused ? 'off' : m.mailbox === 'connected' ? '' : 'idle'}`}>
          <i />
          {m.settings.paused
            ? 'البريد الصادر متوقف'
            : m.mailbox === 'connected'
              ? 'صندوق القسم متصل'
              : m.mailbox === 'off'
                ? 'صندوق القسم غير مربوط'
                : m.mailbox === 'error'
                  ? 'تعذّر الوصول إلى Gmail'
                  : 'جارٍ الاتصال…'}
        </span>
        <button type="button" className="ml-btn quiet" onClick={() => setDialog('keys')}>
          <I n="keys" />
          الاختصارات
        </button>
        {m.isAdmin && (
          <button type="button" className="ml-btn" onClick={() => setDialog('settings')}>
            <I n="settings" />
            إعدادات البريد
          </button>
        )}
        <button type="button" className="ml-btn gold" onClick={() => compose()}>
          <I n="pencil" />
          رسالة جديدة
        </button>
      </Title>

      {m.settings.paused && (
        <div className="ml-paused" role="status">
          <I n="pause" />
          <span>أوقف مسؤول النظام البريد الصادر. الرسائل الخارجية تدخل الطابور ولا تخرج. البريد الداخلي يعمل كالمعتاد.</span>
          {m.isAdmin && (
            <button type="button" className="ml-btn sm" onClick={() => void m.call('mail_admin', { p_paused: false, p_sla: null }, 'استؤنف البريد الصادر.').then(() => m.sync(true))}>
              استئناف الإرسال
            </button>
          )}
        </div>
      )}

      <div className="ml-wrap">
        <div className={`ml-mail ${open ? 'reading' : ''}`}>
          <nav className="ml-rail" aria-label="مجلدات البريد">
            <div className="ml-dept">
              <b>
                <I n="cloud" />
                صندوق القسم
              </b>
              <span className={m.settings.paused || m.mailbox === 'error' ? 'off' : m.mailbox === 'connected' ? 'ok' : ''}>
                {m.settings.paused ? 'البريد الصادر متوقف' : m.mailbox === 'connected' ? 'متصل بـ Gmail' : m.mailbox === 'off' ? 'لم يُربط بعد' : m.mailbox === 'error' ? 'تعذّر الاتصال' : '…'}
              </span>
            </div>
            {FOLDERS.filter((f) => showFolder(f.id)).map((f) => {
              const c = count(f.id);
              const hot = (f.id === 'action' || f.id === 'gate') && c > 0;
              return (
                <button type="button" key={f.id} className={`ml-ri ${folder === f.id && !q ? 'on' : ''}`} onClick={() => setFolder(f.id)}>
                  <I n={FOLDER_ICONS[f.id]} />
                  <span>{f.label}</span>
                  {c > 0 && <span className={`ct ${hot ? 'hot' : ''}`}>{c}</span>}
                </button>
              );
            })}
            {isLead(m.role) && (
              <>
                <h4>البريد المشترك</h4>
                {SHARED_FOLDERS.map((f) => {
                  const c = count(f.id);
                  return (
                    <button type="button" key={f.id} className={`ml-ri ${folder === f.id && !q ? 'on' : ''}`} onClick={() => setFolder(f.id)}>
                      <I n={FOLDER_ICONS[f.id]} />
                      <span>{f.label}</span>
                      {c > 0 && <span className={`ct ${f.id === 'shared:unassigned' ? 'hot' : ''}`}>{c}</span>}
                    </button>
                  );
                })}
              </>
            )}
            <h4>الوسوم</h4>
            {LABEL_SET.map((l) => {
              const c = count(`label:${l}`);
              return (
                <button type="button" key={l} className={`ml-ri ${folder === `label:${l}` && !q ? 'on' : ''}`} onClick={() => setFolder(`label:${l}`)}>
                  <I n="tag" />
                  <span>{l}</span>
                  {c > 0 && <span className="ct">{c}</span>}
                </button>
              );
            })}
          </nav>

          <section className="ml-lcol" aria-label="المحادثات">
            <div className="ml-lhead">
              <select className="ml-sel ml-folder-pick" aria-label="المجلد" value={folder} onChange={(e) => setFolder(e.target.value as FolderId)}>
                {[...FOLDERS.filter((f) => showFolder(f.id)), ...(isLead(m.role) ? SHARED_FOLDERS : [])].map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
                {LABEL_SET.map((l) => (
                  <option key={l} value={`label:${l}`}>
                    وسم: {l}
                  </option>
                ))}
              </select>
              <label className="mx-field" htmlFor="ml-q">
                <I n="search" />
                <input
                  id="ml-q"
                  ref={search}
                  type="search"
                  placeholder="ابحث، أو from: has:attachment is:unread"
                  value={q}
                  onChange={(e) => (setQ(e.target.value), setOpenId(null))}
                  autoComplete="off"
                />
              </label>
              <div className="ml-ltitle">
                <b>{title}</b>
                <span>{folder === 'drafts' && !q ? drafts.length : list.length} محادثة</span>
              </div>
              {folder !== 'drafts' && (
                <div className="mx-seg" role="group" aria-label="تصفية">
                  {(
                    [
                      ['all', 'الكل'],
                      ['unread', 'غير مقروء'],
                      ['internal', 'داخلي'],
                      ['external', 'خارجي'],
                      ['cards', 'بطاقات'],
                    ] as const
                  ).map(([id, label]) => (
                    <button type="button" key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {sel.length > 0 && (
              <div className="ml-bulk">
                <b>{sel.length} محددة</b>
                <button type="button" className="ml-btn sm quiet" onClick={() => void patch(sel, { read: true }).then(() => setSel([]))}>
                  مقروءة
                </button>
                <button type="button" className="ml-btn sm quiet" onClick={() => void patch(sel, { read: false }).then(() => setSel([]))}>
                  غير مقروءة
                </button>
                <button type="button" className="ml-btn sm quiet" onClick={() => void patch(sel, { archived: true }, 'أُرشفت.').then(() => setSel([]))}>
                  أرشفة
                </button>
                <button type="button" className="ml-btn sm quiet" onClick={() => void patch(sel, { trashed: true }, 'نُقلت إلى المهملات.').then(() => setSel([]))}>
                  حذف
                </button>
                <button type="button" className="ml-btn sm quiet" onClick={() => setSel([])}>
                  إلغاء
                </button>
              </div>
            )}
            <div className="ml-list">
              {folder === 'drafts' && !q ? (
                drafts.length ? (
                  drafts.map((d) => (
                    <button
                      type="button"
                      key={d.key}
                      className="ml-row"
                      onClick={() => {
                        setDrafts(drafts.filter((x) => x.key !== d.key));
                        setDraft(d);
                      }}
                    >
                      <span />
                      <Av label={d.to[0] ? tokenName(d.to[0], m.nameOf) : 'م'} />
                      <span className="main">
                        <span className="top">
                          <span className="from danger">مسودة</span>
                          <span className="time">{d.savedAt ? shortWhen(d.savedAt, m.now) : ''}</span>
                        </span>
                        <span className="subj">{d.subject || '(بلا موضوع)'}</span>
                        <span className="snip">{d.body.replace(/\s+/g, ' ')}</span>
                      </span>
                    </button>
                  ))
                ) : (
                  <Empty text="لا مسودات. تُحفظ المسودة في هذا المتصفح حين تغلق نافذة الكتابة." />
                )
              ) : list.length ? (
                list.map((v) => (
                  <Row
                    key={v.thread.id}
                    v={v}
                    on={openId === v.thread.id}
                    selected={sel.includes(v.thread.id)}
                    onSelect={(on) => setSel(on ? [...sel, v.thread.id] : sel.filter((x) => x !== v.thread.id))}
                    onOpen={() => openThread(v.thread.id)}
                    onStar={() => void patch([v.thread.id], { starred: !v.member?.starred })}
                  />
                ))
              ) : (
                <Empty text={q.trim() ? 'لا نتائج. جرّب كلمة أخرى أو معاملاً مثل from: أو label:' : 'لا شيء هنا الآن.'} />
              )}
            </div>
          </section>

          <section className="ml-reader" aria-label="القراءة">
            {open ? (
              <>
                <div className="ml-rbar">
                  <button type="button" className="ml-btn sm quiet ml-back" onClick={() => setOpenId(null)}>
                    <I n="back" />
                    العودة
                  </button>
                  <Tool n="archive" label={open.member?.archived ? 'إعادة إلى الوارد' : 'أرشفة (e)'} on={open.member?.archived} onClick={() => void patch([open.thread.id], { archived: !open.member?.archived }, open.member?.archived ? 'أُعيدت إلى الوارد.' : 'أُرشفت المحادثة.').then(() => !open.member?.archived && setOpenId(null))} />
                  <Tool n="alarm" label="تأجيل" onClick={(e) => setMenu({ kind: 'snooze', x: e.clientX, y: e.clientY })} />
                  <Tool n="star" label="تمييز بنجمة (s)" on={open.member?.starred} onClick={() => void patch([open.thread.id], { starred: !open.member?.starred })} />
                  <Tool n="unread" label="تمييز كغير مقروء" onClick={() => void patch([open.thread.id], { read: false }).then(() => setOpenId(null))} />
                  <Tool n="tag" label="الوسوم" onClick={(e) => setMenu({ kind: 'label', x: e.clientX, y: e.clientY })} />
                  <Tool n="mute" label={open.member?.muted ? 'إلغاء الكتم' : 'كتم المحادثة'} on={open.member?.muted} onClick={() => void patch([open.thread.id], open.member?.muted ? { muted: false } : { muted: true, archived: true }, open.member?.muted ? 'أُلغي الكتم.' : 'كُتمت: الرسائل الجديدة فيها لا تعيدها إلى الوارد.')} />
                  <Tool n="trash" label="حذف (#)" onClick={() => void patch([open.thread.id], { trashed: !open.member?.trashed }, open.member?.trashed ? 'أُعيدت من المهملات.' : 'نُقلت إلى المهملات.').then(() => setOpenId(null))} />
                  <span className="sep" />
                  <Tool n="reply" label="رد (r)" onClick={() => compose({ mode: 'reply', thread: open.thread.id })} />
                  <Tool n="forward" label="إعادة توجيه (f)" onClick={() => compose({ mode: 'forward', thread: open.thread.id })} />
                  <span className="grow" />
                  <Tool n="up" label="السابقة (k)" onClick={() => step(-1)} />
                  <Tool n="down" label="التالية (j)" onClick={() => step(1)} />
                </div>
                <ThreadView view={open} onCompose={compose} onToWork={() => setDialog('work')} onBack={() => setOpenId(null)} />
              </>
            ) : (
              <ReaderEmpty
                action={actionCount}
                unassigned={isLead(m.role) ? count('shared:unassigned') : 0}
                late={m.views.filter((v) => {
                  const r = replyMinutes(v.thread, m.now);
                  return r !== null && r < 0;
                }).length}
                onFolder={setFolder}
                onCompose={() => compose()}
              />
            )}
          </section>
        </div>
      </div>

      {menu && open && (
        <Menu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          {menu.kind === 'snooze'
            ? (
                [
                  ['لاحقاً اليوم · 17:00', localInput(0, 17)],
                  ['غداً · 08:00', localInput(24, 8)],
                  ['بعد يومين · 08:00', localInput(48, 8)],
                  ['بعد أسبوع · 08:00', localInput(168, 8)],
                ] as const
              ).map(([label, v]) => (
                <button
                  type="button"
                  key={label}
                  role="menuitem"
                  onClick={() => {
                    setMenu(null);
                    void patch([open.thread.id], { snooze_until: new Date(v).toISOString() }, `أُجّلت حتى ${fullWhen(new Date(v).toISOString())}.`).then(() => setOpenId(null));
                  }}
                >
                  <I n="alarm" />
                  {label}
                </button>
              ))
            : LABEL_SET.map((l) => {
                const on = open.thread.labels.includes(l);
                return (
                  <button
                    type="button"
                    key={l}
                    role="menuitemcheckbox"
                    aria-checked={on}
                    onClick={() =>
                      void m.call('mail_set_labels', { p_thread: open.thread.id, p_labels: on ? open.thread.labels.filter((x) => x !== l) : [...open.thread.labels, l] })
                    }
                  >
                    <I n={on ? 'check' : 'tag'} />
                    {l}
                  </button>
                );
              })}
        </Menu>
      )}

      {draft && (
        <Composer
          key={draft.key}
          draft={draft}
          onClose={() => setDraft(null)}
          onSaveDraft={saveDraft}
          onRestore={(d) => setDraft({ ...d, key: `${d.key}r` })}
        />
      )}
      {dialog === 'keys' && <KeysDialog onClose={() => setDialog(null)} />}
      {dialog === 'settings' && <SettingsDialog onClose={() => setDialog(null)} />}
      {dialog === 'work' && open && (
        <WorkDialog
          view={open}
          onClose={() => setDialog(null)}
          canCreate={roles[state.role].create}
          onCreate={() => router.push(`/create?mail=${open.thread.id}`)}
          onLink={async (id, title, assignee) => {
            const r = await m.call('mail_link_work', { p_thread: open.thread.id, p_work: id, p_title: title, p_assignee: assignee || null }, `رُبطت المحادثة بالعمل ${id}.`);
            if (!r.ok) return m.say(r.error);
            setDialog(null);
          }}
          onOpenWork={(id) => router.push(`/work/${id}`)}
        />
      )}
      {m.pending && (
        <div className="ml-undo" role="status">
          <I n="send" />
          <span>
            {m.pending.label} خلال <b>{m.pending.left}</b> ث
          </span>
          <button type="button" onClick={m.undo}>
            تراجع
          </button>
        </div>
      )}
    </div>
  );
}

function Tool({ n, label, on, onClick }: { n: IconName; label: string; on?: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button type="button" className={`ml-btn icon quiet ${on ? 'on' : ''}`} aria-label={label} title={label} aria-pressed={on === undefined ? undefined : on} onClick={onClick}>
      <I n={n} />
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="ml-empty">
      <I n="inbox" />
      <span>{text}</span>
    </div>
  );
}

function Row({
  v,
  on,
  selected,
  onSelect,
  onOpen,
  onStar,
}: {
  v: View;
  on: boolean;
  selected: boolean;
  onSelect: (on: boolean) => void;
  onOpen: () => void;
  onStar: () => void;
}) {
  const m = useMail();
  const t = v.thread;
  const ms = mails(v);
  const last = ms[ms.length - 1];
  const unread = isUnread(v, m.me, m.now);
  const senders = [...new Set(ms.map((x) => (x.author === m.me ? 'أنا' : x.author ? m.nameOf(x.author) : x.from_name || x.from_email || t.contact_name || '')))];
  const held = ms.some((x) => x.state === 'held' || x.state === 'returned');
  const mins = replyMinutes(t, m.now);
  const lastCard = [...ms].reverse().find((x) => x.card)?.card;
  const avatar = t.kind === 'external' ? t.contact_name || t.contact_email || '·' : senders.find((s) => s !== 'أنا') ?? 'أنا';
  const avatarEmail = t.kind === 'external' ? null : ([...ms].reverse().find((x) => x.author && x.author !== m.me)?.author ?? null);
  return (
    <div className={`ml-row ${unread ? 'unread' : ''} ${on ? 'on' : ''}`} role="button" tabIndex={0} aria-label={t.subject} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <span className="pick" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" aria-label="تحديد" checked={selected} onChange={(e) => onSelect(e.target.checked)} />
        <button type="button" className={`star ${v.member?.starred ? 'on' : ''}`} aria-label="تمييز بنجمة" aria-pressed={Boolean(v.member?.starred)} onClick={onStar}>
          <I n="star" />
        </button>
      </span>
      <Av label={avatar} tone={t.kind === 'external' ? 'ext' : ''} email={avatarEmail} />
      <span className="main">
        <span className="top">
          <span className="from">
            {held && ms.every((x) => x.state === 'held' || x.state === 'returned') ? `مسودة خارجية · ${senders[0]}` : senders.slice(-3).join('، ')}
            {ms.length > 1 ? ` (${ms.length})` : ''}
          </span>
          <span className="time">{shortWhen(t.last_at, m.now)}</span>
        </span>
        <span className="subj">{t.subject}</span>
        <span className="snip">{last.body.replace(/\s+/g, ' ')}</span>
        <span className="tags">
          <span className={`ml-kind ${t.kind === 'external' ? 'ext' : 'int'}`}>{t.kind === 'external' ? 'خارجي' : 'داخلي'}</span>
          {awaiting(v, m.me, m.role) ? (
            <span className="mx-chip warn">بانتظار قرارك</span>
          ) : lastCard && 'type' in lastCard ? (
            <span className="ml-kind act">{cardTitle(lastCard as { type: string })}</span>
          ) : null}
          {held && <span className="mx-chip warn">بانتظار الاعتماد</span>}
          {t.kind === 'external' && t.ext_status && !held && (
            <span className={`mx-chip ${extStatusTone[t.ext_status]}`}>{extStatusLabels[t.ext_status]}</span>
          )}
          {t.kind === 'external' && t.assignee && <span className="mx-chip plain">{m.nameOf(t.assignee)}</span>}
          {mins !== null &&
            (mins < 0 ? <span className="mx-chip danger">متأخر {hoursMinutes(mins)}</span> : mins < 180 ? <span className="mx-chip warn">يُرد خلال {hoursMinutes(mins)}</span> : null)}
          {t.labels.slice(0, 2).map((l) => (
            <span key={l} className="mx-tag mini">
              {l}
            </span>
          ))}
          {ms.some((x) => x.files.length || x.refs.length || x.inbound_files.length) && <I n="clip" />}
          {v.member?.muted && <I n="mute" />}
        </span>
      </span>
    </div>
  );
}

function ReaderEmpty({
  action,
  unassigned,
  late,
  onFolder,
  onCompose,
}: {
  action: number;
  unassigned: number;
  late: number;
  onFolder: (f: FolderId) => void;
  onCompose: () => void;
}) {
  return (
    <div className="ml-rempty">
      <span className="e-i">
        <I n="mail" />
      </span>
      <b>اختر محادثة</b>
      <p>البريد الداخلي بين أعضاء القسم، وصندوق القسم المشترك للجهات الخارجية، وبطاقات الاعتماد والمواعيد والمهام في مكان واحد.</p>
      <div className="mx-attn">
        {action > 0 && (
          <button type="button" onClick={() => onFolder('action')}>
            <b>{action}</b>تحتاج إجراءك
          </button>
        )}
        {unassigned > 0 && (
          <button type="button" onClick={() => onFolder('shared:unassigned')}>
            <b>{unassigned}</b>خارجية غير مُسندة
          </button>
        )}
        {late > 0 && (
          <button type="button" onClick={() => onFolder('shared:all')}>
            <b>{late}</b>تجاوزت وقت الرد
          </button>
        )}
        <button type="button" onClick={onCompose}>
          <b>
            <I n="plus" />
          </b>
          رسالة جديدة
        </button>
      </div>
      <p>
        اضغط <kbd>?</kbd> لاختصارات لوحة المفاتيح.
      </p>
    </div>
  );
}

function Menu({ x, y, onClose, children }: { x: number; y: number; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.mx-menu')) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    setTimeout(() => document.addEventListener('click', close), 0);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', esc);
    };
  }, [onClose]);
  const left = Math.max(8, Math.min(x - 125, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 260));
  return (
    <div className="mx-menu" role="menu" style={{ top: y + 8, left }}>
      {children}
    </div>
  );
}

function Dlg({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog ref={ref} className={`ml-dlg ${wide ? 'wide' : ''}`} aria-label={title} onCancel={(e) => (e.preventDefault(), onClose())}>
      <div className="ml">
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

function KeysDialog({ onClose }: { onClose: () => void }) {
  const keys: [string, string][] = [
    ['c', 'رسالة جديدة'], ['/', 'البحث'], ['j', 'المحادثة التالية'], ['k', 'المحادثة السابقة'], ['r', 'رد'], ['a', 'رد على الكل'],
    ['f', 'إعادة توجيه'], ['e', 'أرشفة'], ['s', 'تمييز بنجمة'], ['#', 'حذف'], ['u', 'العودة إلى القائمة'], ['?', 'هذه النافذة'],
  ];
  return (
    <Dlg title="اختصارات لوحة المفاتيح" onClose={onClose}>
      <div className="ml-keys">
        {keys.map(([k, label]) => (
          <span key={k}>
            <kbd>{k}</kbd>
            {label}
          </span>
        ))}
      </div>
      <p className="ml-mtext">تعمل الاختصارات حين لا يكون المؤشر داخل حقل كتابة. Esc يغلق النوافذ.</p>
    </Dlg>
  );
}

function WorkDialog({
  view,
  onClose,
  onCreate,
  onLink,
  onOpenWork,
  canCreate,
}: {
  view: View;
  onClose: () => void;
  onCreate: () => void;
  onLink: (id: string, title: string, assignee: string) => Promise<void>;
  onOpenWork: (id: string) => void;
  canCreate: boolean;
}) {
  const m = useMail();
  const [works, setWorks] = useState<{ id: string; title: string }[] | null>(null);
  const [pick, setPick] = useState('');
  const [who, setWho] = useState(view.thread.assignee ?? '');
  const [busy, setBusy] = useState(false);
  const linked = (view.thread.links ?? []).filter((l: { type: string }) => l.type === 'work') as { id: string; title: string }[];
  useEffect(() => {
    void (async () => {
      const { supabase } = await import('@/lib/supabase/client');
      const { data } = await supabase().from('works').select('id,title').is('closed_at', null).order('created_at', { ascending: false }).limit(80);
      setWorks((data ?? []) as { id: string; title: string }[]);
    })();
  }, []);
  return (
    <Dlg title="تحويل إلى عمل" onClose={onClose}>
      <p className="ml-mtext">
        يُفتح «إنشاء» بعنوان الرسالة ومرسلها وأول سطورها، فتختار النوع وتكمل. عند الحفظ يصدر المركز رقم العمل، ويرتبط العمل بهذه المحادثة، ويحصل الطلب الخارجي على رقم.
      </p>
      {linked.length > 0 && (
        <p className="ml-mtext">
          مرتبطة الآن بـ:{' '}
          {linked.map((l, i) => (
            <button key={l.id} type="button" className="ml-btn sm quiet" onClick={() => onOpenWork(l.id)}>
              {i ? '، ' : ''}
              {l.id} {l.title}
            </button>
          ))}
        </p>
      )}
      {!canCreate && <p className="ml-err">دورك الحالي لا ينشئ الأعمال. يمكنك ربط المحادثة بعمل قائم.</p>}
      <div className="ml-row-end">
        <button type="button" className="ml-btn" onClick={onClose}>
          إلغاء
        </button>
        <button type="button" className="ml-btn primary" disabled={!canCreate} onClick={onCreate}>
          <I n="work" />
          إنشاء عمل من الرسالة
        </button>
      </div>
      <label className="ml-l" htmlFor="ml-w-link">
        أو اربطها بعمل قائم
        <select id="ml-w-link" value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">{works === null ? 'جارٍ التحميل…' : works.length ? 'اختر عملاً' : 'لا أعمال مفتوحة تراها'}</option>
          {(works ?? []).map((w) => (
            <option key={w.id} value={w.id}>
              {w.id} · {w.title}
            </option>
          ))}
        </select>
      </label>
      {view.thread.kind === 'external' && !view.thread.assignee && (
        <label className="ml-l" htmlFor="ml-w-who">
          مسؤول المحادثة
          <select id="ml-w-who" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">يبقى غير مُسند</option>
            {m.people
              .filter((p) => p.role !== 'admin')
              .map((p) => (
                <option key={p.email} value={p.email}>
                  {p.display_name} · {roles[p.role]?.name}
                </option>
              ))}
          </select>
        </label>
      )}
      <div className="ml-row-end">
        <button
          type="button"
          className="ml-btn"
          disabled={busy || !pick}
          onClick={async () => {
            setBusy(true);
            await onLink(pick, works?.find((w) => w.id === pick)?.title ?? '', who);
            setBusy(false);
          }}
        >
          <I n="link" />
          ربط بالعمل
        </button>
      </div>
    </Dlg>
  );
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const m = useMail();
  const [field, setField] = useState<'from' | 'subject'>('from');
  const [pattern, setPattern] = useState('');
  const [label, setLabel] = useState('');
  const [assignee, setAssignee] = useState('');
  const [busy, setBusy] = useState(false);
  const queued = m.views.reduce((n, v) => n + v.messages.filter((x) => x.state === 'queued').length, 0);

  const addRule = async () => {
    setBusy(true);
    const { supabase } = await import('@/lib/supabase/client');
    const { error } = await supabase()
      .from('mail_rules')
      .insert({ field, pattern: pattern.trim(), label: label || null, assignee: assignee || null, created_by: m.me });
    setBusy(false);
    if (error) return m.say('تعذّرت إضافة القاعدة. تحقق من الحقول.');
    setPattern('');
    setLabel('');
    setAssignee('');
    await m.reload();
    m.say('أُضيفت القاعدة، وتُطبّق على البريد الوارد الجديد.');
  };
  const toggleRule = async (id: string, enabled: boolean) => {
    const { supabase } = await import('@/lib/supabase/client');
    await supabase().from('mail_rules').update({ enabled }).eq('id', id);
    await m.reload();
  };
  const removeRule = async (id: string) => {
    const { supabase } = await import('@/lib/supabase/client');
    await supabase().from('mail_rules').delete().eq('id', id);
    await m.reload();
  };

  return (
    <Dlg title="إعدادات البريد" onClose={onClose} wide>
      <section className="ml-set">
        <h4>
          <I n="cloud" />
          صندوق القسم
          <span className={`mx-chip ${m.mailbox === 'connected' ? 'success' : m.mailbox === 'error' ? 'danger' : ''}`}>
            {m.mailbox === 'connected' ? 'متصل' : m.mailbox === 'off' ? 'غير مربوط' : m.mailbox === 'error' ? 'تعذّر الاتصال' : '…'}
          </span>
        </h4>
        <p>
          حساب Gmail واحد للقسم، بالدخول بكلمة مرور تطبيق من Google. العنوان وكلمة المرور ومفتاح الخادم في متغيرات الخادم فقط
          (GMAIL_ADDRESS وGMAIL_APP_PASSWORD وMAIL_SERVER_KEY) ولا تظهر في المتصفح. المزامنة عند فتح البريد وكل دقيقة أثناء فتحه
          {m.settings.sync_at ? `، وآخرها ${fullWhen(m.settings.sync_at)}` : ''}.
        </p>
        <div className="ml-row-start">
          <button type="button" className="ml-btn sm" onClick={() => void m.sync(true).then(() => m.say('اكتملت المزامنة.'))}>
            <I n="sync" />
            مزامنة الآن
          </button>
        </div>
      </section>
      <section className="ml-set">
        <h4>
          <I n="pause" />
          البريد الصادر
          <span className={`mx-chip ${m.settings.paused ? 'danger' : 'success'}`}>{m.settings.paused ? 'متوقف' : 'يعمل'}</span>
        </h4>
        <p>مفتاح طوارئ: يوقف خروج أي بريد خارجي فوراً، وتدخل الرسائل الطابور. يُسجّل كل إيقاف واستئناف في سجل النشاط. البريد الداخلي لا يتأثر.</p>
        <label className="ml-check strong">
          <input
            type="checkbox"
            checked={m.settings.paused}
            onChange={(e) => {
              const pause = e.target.checked;
              void m.call('mail_admin', { p_paused: pause, p_sla: null }, pause ? 'أُوقف البريد الصادر.' : 'استؤنف البريد الصادر.').then(() => {
                if (!pause) void m.sync(true);
              });
            }}
          />
          إيقاف البريد الصادر مؤقتاً{queued ? ` (${queued} في الطابور)` : ''}
        </label>
      </section>
      <section className="ml-set">
        <h4>
          <I n="clock" />
          وقت الرد على الجهات الخارجية
        </h4>
        <label className="ml-l" htmlFor="ml-sla">
          المهلة من وصول الرسالة
          <select id="ml-sla" value={m.settings.sla_hours} onChange={(e) => void m.call('mail_admin', { p_paused: null, p_sla: Number(e.target.value) }, 'حُفظت المهلة.')}>
            {[4, 8, 24, 48].map((h) => (
              <option key={h} value={h}>
                {h} ساعات
              </option>
            ))}
          </select>
        </label>
      </section>
      <section className="ml-set">
        <h4>
          <I n="shield" />
          اعتماد البريد الخارجي
        </h4>
        <p>
          محادثة خارجية جديدة من غير مدير الاتصال ومساعده تحتاج اعتماد أحدهما. الرد على محادثة مُسندة إليك يخرج مباشرة. صندوق القسم كاملاً
          يراه مدير الاتصال ومساعده ومسؤول النشر، وغيرهم يرى ما أُسند إليه أو نُسخ عليه.
        </p>
      </section>
      <section className="ml-set">
        <h4>
          <I n="tag" />
          قواعد الفرز للبريد الوارد
        </h4>
        {m.rules.length === 0 && <p>لا قواعد بعد.</p>}
        {m.rules.map((r) => (
          <div key={r.id} className="ml-rule">
            <span>
              {r.field === 'from' ? 'من' : 'الموضوع يحتوي'} «{r.pattern}»
              <small>
                {[r.label ? `وسم «${r.label}»` : '', r.assignee ? `إسناد إلى ${m.nameOf(r.assignee)}` : ''].filter(Boolean).join(' و')}
              </small>
            </span>
            <span className="ml-row-start">
              <label className="ml-check">
                <input type="checkbox" checked={r.enabled} onChange={(e) => void toggleRule(r.id, e.target.checked)} aria-label="تفعيل القاعدة" />
                مفعّلة
              </label>
              <button type="button" className="ml-btn sm quiet danger" onClick={() => void removeRule(r.id)}>
                حذف
              </button>
            </span>
          </div>
        ))}
        <div className="ml-two">
          <label className="ml-l" htmlFor="ml-r-field">
            الشرط
            <select id="ml-r-field" value={field} onChange={(e) => setField(e.target.value as 'from' | 'subject')}>
              <option value="from">المرسل يحتوي</option>
              <option value="subject">الموضوع يحتوي</option>
            </select>
          </label>
          <label className="ml-l" htmlFor="ml-r-pattern">
            النص
            <input id="ml-r-pattern" value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="partner-org.sa أو تغطية" />
          </label>
          <label className="ml-l" htmlFor="ml-r-label">
            وسم
            <select id="ml-r-label" value={label} onChange={(e) => setLabel(e.target.value)}>
              <option value="">بلا وسم</option>
              {LABEL_SET.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <label className="ml-l" htmlFor="ml-r-who">
            إسناد إلى
            <select id="ml-r-who" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">بلا إسناد</option>
              {m.people
                .filter((p) => p.role !== 'admin')
                .map((p) => (
                  <option key={p.email} value={p.email}>
                    {p.display_name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <div className="ml-row-start">
          <button type="button" className="ml-btn sm" disabled={busy || pattern.trim().length < 2 || (!label && !assignee)} onClick={() => void addRule()}>
            <I n="plus" />
            إضافة القاعدة
          </button>
        </div>
      </section>
    </Dlg>
  );
}

/** Drafts live in this browser for now. */
function useDrafts(me: string): [Draft[], (d: Draft[]) => void] {
  const key = `comms-hub-mail-drafts:${me}`;
  const [drafts, setState] = useState<Draft[]>([]);
  useEffect(() => {
    try {
      setState(JSON.parse(localStorage.getItem(key) ?? '[]') as Draft[]);
    } catch {
      setState([]);
    }
  }, [key]);
  const set = (d: Draft[]) => {
    setState(d);
    try {
      localStorage.setItem(key, JSON.stringify(d.slice(0, 30)));
    } catch {
      /* storage unavailable: drafts stay for this visit only */
    }
  };
  return [drafts, set];
}


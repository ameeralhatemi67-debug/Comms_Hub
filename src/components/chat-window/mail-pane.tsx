'use client';
// «البريد» in the window. The reader is the mail page's own (ThreadView), with its cards, holds
// and handling; its quick reply is the window's message box. The list and the folders are the
// window's, on the mail page's own rules (inFolder, isUnread, matches).
import { useMemo, useState } from 'react';
import { Archive, Clock, Flag, Inbox, Mail, MoveHorizontal, Search, Send, Shield, Star, Tag, Trash2, User, CalendarDays, Pencil, AlarmClock, Building2 } from 'lucide-react';
import {
  FOLDERS,
  SHARED_FOLDERS,
  inFolder,
  isApprover,
  isLead,
  isUnread,
  mails,
  matches as mailMatches,
  parseQuery,
  shortWhen,
  type FolderId,
  type View,
} from '@/lib/mail/rules';
import { NEXT_AR, atLeast } from '@/lib/chat-window/rules';
import { useMail } from '../mail/provider';
import { usePeople } from '../people';
import { ThreadView } from '../mail/thread';
import { Composer, type Draft } from '../mail/composer';
import { composeDraft, quickOutgoing, signatureOf, useDrafts, type Extra } from '../mail/compose';
import { useWin } from './state';
import { Box } from './composer';

const ICON: Record<string, typeof Inbox> = {
  inbox: Inbox, action: Flag, mine: User, waiting: Clock, starred: Star, snoozed: AlarmClock, sent: Send, scheduled: CalendarDays,
  drafts: Pencil, gate: Shield, archive: Archive, trash: Trash2, 'shared:all': Inbox, 'shared:unassigned': User, 'shared:closed': Archive,
};
const LABELS = ['طلبات تغطية', 'شركاء', 'صحافة', 'اليوم الوطني', 'عاجل'];

export function MailPane() {
  const w = useWin();
  const m = useMail();
  const people = usePeople();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [drafts, setDrafts] = useDrafts(m.me);
  const view = w.thread ? m.viewOf(w.thread) : undefined;

  if (m.status === 'loading') return <div className="cw-wait" role="status">جارٍ تحميل البريد…</div>;
  if (m.status === 'error')
    return (
      <div className="cw-wait" role="alert">
        تعذّر تحميل البريد.{' '}
        <button type="button" className="ml-btn sm" onClick={() => void m.reload()}>
          أعد المحاولة
        </button>
      </div>
    );

  // The reader's own actions (a card's reply, a held mail's edit) open the full composer or send at once.
  const compose = (extra: Extra) => {
    const d = composeDraft(m, extra);
    if (extra.quick) return m.send(quickOutgoing(d, signatureOf(m, people.me?.profile?.signature)), 'يُرسل الرد', () => setDraft({ ...d, sig: true }));
    setDraft(d);
  };
  const reader = view && (
    <div className="ml ml-wrap cw-reader">
      <ThreadView view={view} onCompose={compose} onToWork={w.toMailPage} onBack={() => w.openThread(null)} />
    </div>
  );
  const box = <Box onDialog={() => undefined} />;
  const composer = draft && (
    <Composer
      key={draft.key}
      draft={draft}
      onClose={() => setDraft(null)}
      onSaveDraft={(d) => {
        setDrafts([{ ...d, savedAt: new Date().toISOString() }, ...drafts.filter((x) => x.key !== d.key)]);
        m.say('حُفظت المسودة في هذا المتصفح. تجدها في «المسودات» في صفحة البريد.');
      }}
      onRestore={(d) => setDraft({ ...d, key: `${d.key}r` })}
    />
  );

  if (w.tier === 'side')
    return (
      <div className="cw-col">
        {reader ?? <List combined />}
        {box}
        {composer}
      </div>
    );
  const full = atLeast(w.tier, 'full');
  return (
    <div className={`cw-grid m-${full ? 'full' : 'middle'}`}>
      {full && <Rail />}
      <List />
      <div className="cw-col">
        {reader ?? (
          <div className="cw-empty">
            <Mail aria-hidden />
            <b>اختر رسالة لقراءتها</b>
            <p>أو ابدأ بريداً جديداً من الصندوق أدناه: اكتب اسماً أو عنواناً في «إلى».</p>
          </div>
        )}
        {box}
      </div>
      {composer}
    </div>
  );
}

function Rail() {
  const w = useWin();
  const m = useMail();
  const ctx = { me: m.me, role: m.role, now: m.now };
  const count = (f: FolderId) => {
    const l = m.views.filter((v) => inFolder(v, f, ctx));
    return f === 'inbox' ? l.filter((v) => isUnread(v, m.me, m.now)).length : l.length;
  };
  const item = (id: FolderId, label: string) => {
    const Icon = ICON[id] ?? Tag;
    const n = count(id);
    const hot = (id === 'action' || id === 'gate' || id === 'shared:unassigned') && n > 0;
    return (
      <button key={id} type="button" className={`cw-ri ${w.folder === id ? 'on' : ''}`} onClick={() => w.setFolder(id)}>
        <Icon aria-hidden />
        <span>{label}</span>
        {n > 0 && <span className={`ct ${hot ? 'hot' : ''}`}>{n}</span>}
      </button>
    );
  };
  return (
    <nav className="cw-rail" aria-label="مجلدات البريد">
      {FOLDERS.filter((f) => f.id !== 'drafts' && (f.id !== 'gate' || isApprover(m.role) || count('gate') > 0) && (f.id !== 'mine' || isLead(m.role) || count('mine') > 0)).map((f) => item(f.id, f.label))}
      {isLead(m.role) && (
        <>
          <h5>صندوق القسم المشترك</h5>
          {SHARED_FOLDERS.map((f) => item(f.id, f.label))}
        </>
      )}
      <h5>الوسوم</h5>
      {LABELS.map((l) => item(`label:${l}` as FolderId, l))}
      <p className="cw-gm">
        <i className={m.settings.paused || m.mailbox === 'error' ? 'off' : ''} />
        {m.settings.paused ? 'البريد الصادر متوقف' : m.mailbox === 'connected' ? 'متصل بـ Gmail' : m.mailbox === 'off' ? 'لم يُربط بعد' : m.mailbox === 'error' ? 'تعذّر الاتصال' : '…'}
      </p>
    </nav>
  );
}

function List({ combined = false }: { combined?: boolean }) {
  const w = useWin();
  const m = useMail();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'internal' | 'external'>('all');
  const ctx = useMemo(() => ({ me: m.me, role: m.role, now: m.now }), [m.me, m.role, m.now]);
  const decide = isApprover(m.role) ? m.views.filter((v) => inFolder(v, 'gate', ctx)) : [];

  const list = useMemo(() => {
    const pq = parseQuery(q);
    let l: View[];
    if (q.trim()) l = m.views.filter((v) => mails(v).length > 0 && !v.member?.trashed && mailMatches(v, pq, m.nameOf, m.me, m.now));
    else if (combined) l = m.views.filter((v) => inFolder(v, 'inbox', ctx) || inFolder(v, 'action', ctx));
    else l = m.views.filter((v) => inFolder(v, w.folder, ctx));
    if (filter === 'unread') l = l.filter((v) => isUnread(v, m.me, m.now));
    if (filter === 'internal') l = l.filter((v) => v.thread.kind === 'internal');
    if (filter === 'external') l = l.filter((v) => v.thread.kind === 'external');
    if (combined) l = [...l].sort((a, b) => Number(isUnread(b, m.me, m.now)) - Number(isUnread(a, m.me, m.now)));
    return l;
  }, [m.views, m.nameOf, m.me, m.now, q, combined, w.folder, ctx, filter]);

  const open = (v: View) => {
    w.openThread(v.thread.id);
    if (isUnread(v, m.me, m.now)) void m.call('mail_state', { p_threads: [v.thread.id], p_patch: { read: true } });
  };
  const folderLabel = [...FOLDERS, ...SHARED_FOLDERS].find((f) => f.id === w.folder)?.label ?? w.folder.replace('label:', '');

  return (
    <section className="cw-list" aria-label="الرسائل">
      <div className="cw-lhead">
        <label className="cw-search">
          <Search aria-hidden />
          <input type="search" placeholder="ابحث في البريد، أو from: أو label:" value={q} onChange={(e) => setQ(e.target.value)} aria-label="ابحث في البريد" autoComplete="off" />
        </label>
        {w.tier === 'middle' && (
          <select className="cw-folder" aria-label="المجلد" value={w.folder} onChange={(e) => w.setFolder(e.target.value as FolderId)}>
            {FOLDERS.filter((f) => f.id !== 'drafts').map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
            {isLead(m.role) &&
              SHARED_FOLDERS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
          </select>
        )}
      </div>
      {atLeast(w.tier, 'middle') && (
        <div className="cw-chips" role="group" aria-label="تصفية">
          {(
            [
              ['all', 'الكل'],
              ['unread', 'غير مقروء'],
              ['internal', 'داخلي'],
              ['external', 'خارجي'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
        </div>
      )}
      <div className="cw-rows">
        {combined && !q && decide.length > 0 && (
          <div className="cw-dec">
            <div className="cw-sec">بانتظار قرارك</div>
            {decide.map((v) => (
              <Row key={v.thread.id} v={v} onOpen={() => open(v)} held />
            ))}
          </div>
        )}
        {!combined && !q && <div className="cw-sec">{folderLabel}</div>}
        {combined && !q && <div className="cw-sec">الوارد وما يحتاج إجراءك</div>}
        {list.map((v) => (
          <Row key={v.thread.id} v={v} onOpen={() => open(v)} />
        ))}
        {!list.length && <p className="cw-none">{q ? 'لا نتائج. جرّب كلمة أخرى أو معاملاً مثل from: أو label:' : 'لا شيء هنا الآن.'}</p>}
        {w.tier !== 'page' && (
          <p className="cw-next">
            <MoveHorizontal aria-hidden />
            {NEXT_AR.mail[w.tier]}
          </p>
        )}
      </div>
    </section>
  );
}

function Row({ v, onOpen, held = false }: { v: View; onOpen: () => void; held?: boolean }) {
  const w = useWin();
  const m = useMail();
  const t = v.thread;
  const ms = mails(v);
  const last = ms[ms.length - 1];
  const unread = isUnread(v, m.me, m.now);
  const from = last ? (last.author ? (last.author === m.me ? 'أنا' : m.nameOf(last.author)) : last.from_name || last.from_email || t.contact_name || '') : '';
  return (
    <button type="button" className={`cw-mrow ${unread ? 'unread' : ''} ${w.thread === t.id ? 'on' : ''} ${held ? 'held' : ''}`} onClick={onOpen}>
      <span className={`cw-face ${t.kind === 'external' ? 't-ext' : 't-mail'}`}>{t.kind === 'external' ? <Building2 aria-hidden /> : <Mail aria-hidden />}</span>
      <span className="tx">
        <span className="l1">
          <b>{from}</b>
          <time>{last ? shortWhen(last.created_at, m.now) : ''}</time>
        </span>
        <span className="sub">{t.subject}</span>
        <span className="sn">{(last?.body ?? '').replace(/\s+/g, ' ').slice(0, 140)}</span>
        <span className="tags">
          <span className={`cw-kind ${t.kind === 'external' ? 'ext' : ''}`}>{t.kind === 'external' ? 'خارجي' : 'داخلي'}</span>
          {held && <span className="cw-kind held">بانتظار الاعتماد</span>}
          {t.labels.slice(0, 2).map((l) => (
            <span key={l} className="cw-kind lab">
              {l}
            </span>
          ))}
          {v.member?.starred && <Star aria-label="مميّزة" className="star" />}
        </span>
      </span>
    </button>
  );
}

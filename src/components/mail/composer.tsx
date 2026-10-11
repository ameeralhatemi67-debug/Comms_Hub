'use client';
// Writing a message: recipients (people, groups, outside addresses), attachments from
// the computer or references from the media library, an action card, a template,
// a signature, and sending now or later. The database has the last word on send.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { roles } from '@/lib/domain';
import {
  GROUPS,
  TASK_ROLES,
  actsAs,
  fullWhen,
  isEmail,
  isExternalToken,
  needsApproval,
  stageAr,
  tokenOf,
  type GroupId,
} from '@/lib/mail/rules';
import { CHANNEL_AR, I, fileSize, localInput, tokenName, tokenTone, Av } from './parts';
import { useMail, type FileLite, type Outgoing } from './provider';
import { usePeopleOptional } from '../people';

export type CardDraft =
  | { type: 'task'; what: string; assignee: string; due: string; priority: 'normal' | 'urgent' }
  | { type: 'approval'; asset_id: string }
  | { type: 'date'; asset_id: string; proposed: string; channels: string[]; askee: string }
  | { type: 'progress'; asset_id: string; to: 'production' | 'review' };

export type Draft = {
  key: string;
  mode: 'new' | 'reply' | 'replyall' | 'forward';
  thread: string | null;
  to: string[];
  cc: string[];
  bcc: string[];
  showCc: boolean;
  subject: string;
  body: string;
  refs: string[];
  files: FileLite[];
  card: CardDraft | null;
  sendAt: string | null;
  sig: boolean;
  links: { type: 'work'; id: string }[];
  savedAt?: string;
};

export const blankDraft = (over: Partial<Draft> = {}): Draft => ({
  key: `d${Date.now()}${Math.round(Math.random() * 1e4)}`,
  mode: 'new',
  thread: null,
  to: [],
  cc: [],
  bcc: [],
  showCc: false,
  subject: '',
  body: '',
  refs: [],
  files: [],
  card: null,
  sendAt: null,
  sig: true,
  links: [],
  ...over,
});

const TEMPLATES = [
  { id: 'ack', name: 'شكر واستلام', body: 'شكراً لتواصلكم. وصل طلبكم وأسندناه إلى أحد أعضاء الفريق، وسنعود إليكم بالتفاصيل قبل نهاية يوم العمل.' },
  { id: 'more', name: 'طلب معلومات إضافية', body: 'شكراً لتواصلكم. حتى نخطط للتغطية جيداً نحتاج: موعد الفعالية ومكانها، واسم المسؤول عنها، والمواد المطلوبة ومواعيد تسليمها.' },
  { id: 'no', name: 'اعتذار عن التغطية', body: 'شكراً لدعوتكم. نعتذر عن التغطية في هذا الموعد لارتباط الفريق بفعاليات أخرى، ويسعدنا التنسيق لفرص قادمة.' },
];

type Field = 'to' | 'cc' | 'bcc';
type Upload = { key: string; name: string; progress: number; error?: string };

export function Composer({
  draft: initial,
  onClose,
  onSaveDraft,
  onRestore,
}: {
  draft: Draft;
  onClose: () => void;
  onSaveDraft: (d: Draft) => void;
  onRestore: (d: Draft) => void;
}) {
  const m = useMail();
  const [d, setD] = useState<Draft>(initial);
  const [panel, setPanel] = useState<null | 'lib' | 'task' | 'approval' | 'date' | 'progress' | 'later'>(null);
  const [typing, setTyping] = useState<{ field: Field; q: string }>({ field: 'to', q: '' });
  const [mention, setMention] = useState('');
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);

  const view = d.thread ? m.viewOf(d.thread) : undefined;
  const replyOnExternal = Boolean(view && view.thread.kind === 'external' && d.mode !== 'forward');
  const external = replyOnExternal || [...d.to, ...d.cc, ...d.bcc].some(isExternalToken);
  const newThread = !d.thread || d.mode === 'forward';
  const gated = needsApproval({ role: m.role, me: m.me, external, newThread, assignee: view?.thread.assignee ?? null });
  const me = m.personOf(m.me);
  const ownSignature = usePeopleOptional()?.me?.profile?.signature;
  const signature = ownSignature || `${me?.display_name ?? ''}\n${roles[m.role]?.name ?? ''}، إدارة الاتصال المؤسسي`;

  // People, groups and outside contacts already known to the Hub.
  const contacts = useMemo(() => {
    const seen = new Map<string, string>();
    for (const v of m.views)
      if (v.thread.contact_email) seen.set(v.thread.contact_email, v.thread.contact_name ?? v.thread.contact_email);
    return [...seen].map(([email, name]) => ({ email, name }));
  }, [m.views]);

  const internalPeople = useMemo(() => {
    const set = new Set<string>();
    for (const t of [...d.to, ...d.cc]) {
      if (t.startsWith('p:')) set.add(t.slice(2));
      if (t.startsWith('g:')) {
        const g = GROUPS[t.slice(2) as GroupId];
        m.people.filter((p) => p.role !== 'admin' && (!g.roles || (g.roles as readonly string[]).includes(p.role))).forEach((p) => set.add(p.email));
      }
    }
    if (view && view.thread.kind === 'internal' && d.mode !== 'forward')
      view.messages.forEach((x) => [x.author ?? '', ...x.to_list.filter((t) => t.startsWith('p:')).map((t) => t.slice(2))].forEach((e) => e && set.add(e)));
    set.delete(m.me);
    return [...set];
  }, [d.to, d.cc, d.mode, view, m.people, m.me]);

  const used = new Set([...d.to, ...d.cc, ...d.bcc]);
  const suggestions = (field: Field, q: string) => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const out: { tok: string; label: string; sub: string }[] = [];
    if (field !== 'bcc') {
      for (const p of m.people)
        if (p.email !== m.me && !used.has(tokenOf.person(p.email)) && `${p.display_name} ${p.email} ${roles[p.role]?.name}`.toLowerCase().includes(s))
          out.push({ tok: tokenOf.person(p.email), label: p.display_name, sub: roles[p.role]?.name ?? '' });
      for (const g of Object.keys(GROUPS) as GroupId[])
        if (!used.has(tokenOf.group(g)) && GROUPS[g].name.includes(q.trim())) out.push({ tok: tokenOf.group(g), label: GROUPS[g].name, sub: 'مجموعة حسب الدور' });
    }
    for (const c of contacts)
      if (!used.has(tokenOf.external(c.email)) && `${c.name} ${c.email}`.toLowerCase().includes(s))
        out.push({ tok: tokenOf.external(c.email), label: c.name, sub: `${c.email} · خارجي` });
    if (isEmail(s) && !out.some((o) => o.tok === tokenOf.external(s))) out.push({ tok: tokenOf.external(s), label: s, sub: 'عنوان خارجي' });
    return out.slice(0, 7);
  };

  const addToken = (field: Field, tok: string) => {
    set({ [field]: [...d[field], tok] } as Partial<Draft>);
    setTyping({ field, q: '' });
  };
  const keyOnRecipients = (field: Field) => (e: KeyboardEvent<HTMLInputElement>) => {
    const v = e.currentTarget.value;
    if ((e.key === 'Enter' || e.key === ',' || e.key === '،') && v.trim()) {
      e.preventDefault();
      const first = suggestions(field, v)[0];
      if (first) addToken(field, first.tok);
    }
    if (e.key === 'Backspace' && !v && d[field].length) set({ [field]: d[field].slice(0, -1) } as Partial<Draft>);
  };

  // @ for a colleague (added to CC if not already there), # for a work item or asset.
  const mentionOptions = useMemo(() => {
    if (!mention) return [];
    const q = mention.slice(1).toLowerCase();
    if (mention[0] === '@')
      return m.people
        .filter((p) => p.email !== m.me && p.display_name.toLowerCase().startsWith(q))
        .slice(0, 6)
        .map((p) => ({ key: p.email, label: p.display_name, sub: roles[p.role]?.name ?? '', insert: `@${p.display_name}`, person: p.email }));
    return m.assets
      .filter((a) => a.name.toLowerCase().includes(q))
      .slice(0, 6)
      .map((a) => ({ key: a.id, label: a.name, sub: `مرجع من المكتبة · ${stageAr(a.stage)}`, insert: `«${a.name}»`, asset: a.id }));
  }, [mention, m.people, m.assets, m.me]);

  const pickMention = (o: { insert: string; person?: string; asset?: string }) => {
    const el = body.current;
    if (!el) return;
    const pos = el.selectionStart;
    const before = el.value.slice(0, pos).replace(/[@#][^\s@#]*$/, '');
    const next = `${before}${o.insert} ${el.value.slice(pos)}`;
    const patch: Partial<Draft> = { body: next };
    if (o.person && !external && !internalPeople.includes(o.person)) {
      patch.cc = [...d.cc, tokenOf.person(o.person)];
      patch.showCc = true;
      m.say(`أُضيف ${m.nameOf(o.person)} إلى النسخة لأنك ذكرته في الرسالة.`);
    }
    if (o.asset && !d.refs.includes(o.asset)) patch.refs = [...d.refs, o.asset];
    set(patch);
    setMention('');
    requestAnimationFrame(() => {
      el.focus();
      const at = before.length + o.insert.length + 1;
      el.setSelectionRange(at, at);
    });
  };

  const attach = async (list: FileList | null) => {
    for (const file of Array.from(list ?? [])) {
      const key = `${file.name}-${Date.now()}`;
      setUploads((u) => [...u, { key, name: file.name, progress: 0 }]);
      try {
        const f = await m.upload(file, (progress) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, progress } : x))));
        setD((x) => ({ ...x, files: [...x.files, f] }));
        setUploads((u) => u.filter((x) => x.key !== key));
      } catch (e) {
        setUploads((u) => u.map((x) => (x.key === key ? { ...x, error: e instanceof Error ? e.message : 'تعذّر الرفع.' } : x)));
      }
    }
  };

  const assetOf = (id: string) => m.assets.find((a) => a.id === id);
  const refNotes = d.refs.map((id) => {
    const a = assetOf(id);
    if (!a) return null;
    if (!external) return null;
    if (!a.approved_version) return { id, bad: true, text: `«${a.name}» لم يُعتمد بعد، فلا يُرسل خارجياً. أزله أو انتظر الاعتماد.` };
    if (a.size_bytes > 25 * 1024 * 1024) return { id, bad: false, text: `الإصدار المعتمد ${a.approved_version} من «${a.name}» أكبر من حد Gmail (25 MB)، فيُرسل رابط مراجعة ينتهي بعد 7 أيام.` };
    return { id, bad: false, ok: true, text: `يُرفق الإصدار المعتمد ${a.approved_version} من «${a.name}» تلقائياً عند الإرسال.` };
  });

  const canTask = actsAs(m.role, TASK_ROLES);

  const submit = () => {
    setError('');
    if (!newThread && !d.to.length && !replyOnExternal && !view) return setError('أضف مستلماً واحداً على الأقل.');
    if (newThread && !d.to.length && !d.cc.length) return setError('أضف مستلماً واحداً على الأقل.');
    if (newThread && !d.subject.trim()) return setError('اكتب موضوعاً للرسالة.');
    if (!d.body.trim() && !d.card && !d.refs.length && !d.files.length) return setError('الرسالة فارغة.');
    if (refNotes.some((n) => n?.bad)) return setError('في الرسالة أصل لم يُعتمد بعد، والبريد الخارجي يحمل الإصدارات المعتمدة فقط.');
    if (uploads.some((u) => !u.error)) return setError('انتظر انتهاء رفع المرفقات.');
    if (d.bcc.some((t) => !isExternalToken(t))) return setError('النسخة المخفية للعناوين الخارجية فقط.');
    if (d.sendAt && d.card && d.card.type !== 'date') return setError('لا تُجدول رسالة فيها مهمة أو طلب اعتماد أو تحديث تقدّم. أرسلها الآن.');

    const card = d.card;
    const payload: Record<string, unknown> | null = !card
      ? null
      : card.type === 'task'
        ? { type: 'task', what: card.what, assignee: card.assignee, due: new Date(card.due).toISOString(), priority: card.priority }
        : card.type === 'date'
          ? { type: 'date', asset_id: card.asset_id, proposed: new Date(card.proposed).toISOString(), channels: card.channels, askee: card.askee }
          : { ...card };
    const out: Outgoing = {
      thread: d.thread,
      forward: d.mode === 'forward',
      subject: d.subject.trim(),
      to: d.to,
      cc: d.cc,
      bcc: d.bcc,
      body: d.body.trim() + (d.sig ? `\n\n${signature}` : ''),
      refs: d.refs,
      files: d.files.map((f) => f.id),
      card: payload,
      sendAt: d.sendAt ? new Date(d.sendAt).toISOString() : null,
      links: d.links,
    };
    const label = gated
      ? 'تُرسل للاعتماد'
      : d.sendAt
        ? `تُجدول للإرسال ${fullWhen(new Date(d.sendAt).toISOString())}`
        : external
          ? 'تُرسل من صندوق القسم'
          : 'تُرسل';
    m.send(out, label, () => onRestore(d));
    onClose();
  };

  const close = () => {
    const empty = !d.body.trim() && !d.subject.trim() && !d.to.length && !d.files.length && !d.refs.length;
    if (!empty) onSaveDraft(d);
    onClose();
  };

  const title = { new: 'رسالة جديدة', reply: 'رد', replyall: 'رد على الكل', forward: 'إعادة توجيه' }[d.mode];
  const rcRow = (field: Field, label: string) => {
    const list = suggestions(field, typing.field === field ? typing.q : '');
    return (
      <div className="ml-rc-row">
        <span>{label}</span>
        <div className="ml-rcpt">
          {d[field].map((tok, i) => (
            <span key={tok} className={`ml-rc ${tokenTone(tok)}`}>
              <span>{tokenName(tok, m.nameOf)}</span>
              <button type="button" aria-label="إزالة" onClick={() => set({ [field]: d[field].filter((_, k) => k !== i) } as Partial<Draft>)}>
                ×
              </button>
            </span>
          ))}
          <input
            id={`ml-rc-${field}`}
            aria-label={label}
            autoComplete="off"
            value={typing.field === field ? typing.q : ''}
            placeholder={d[field].length ? '' : field === 'bcc' ? 'عناوين خارجية فقط' : 'اسم زميل، أو فريق، أو بريد خارجي'}
            onChange={(e) => setTyping({ field, q: e.target.value })}
            onKeyDown={keyOnRecipients(field)}
          />
          {list.length > 0 && (
            <div className="ml-sugg" role="listbox">
              {list.map((o) => (
                <button type="button" key={o.tok} onClick={() => addToken(field, o.tok)}>
                  <Av label={o.label} tone={tokenTone(o.tok)} small />
                  <span>
                    {o.label}
                    <small>{o.sub}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        {field === 'to' && !d.showCc ? (
          <button type="button" className="ml-btn sm quiet" onClick={() => set({ showCc: true })}>
            نسخة ومخفية
          </button>
        ) : (
          <span />
        )}
      </div>
    );
  };

  return (
    <dialog ref={dialog} className="ml-dlg wide" aria-label={title} onCancel={(e) => (e.preventDefault(), close())}>
      <div className="ml ml-compose">
        <div className="ml-dlg-head">
          <h2>{title}</h2>
          <button type="button" className="ml-btn icon quiet" aria-label="إغلاق" onClick={close}>
            <I n="x" />
          </button>
        </div>
        <p className="ml-from">
          <I n={external ? 'cloud' : 'mail'} />
          {external
            ? 'من صندوق القسم باسمك. الردود تصل إلى صندوق القسم.'
            : 'من حسابك داخل المركز. لا يغادر شيء النظام.'}
        </p>
        {rcRow('to', 'إلى')}
        {d.showCc && rcRow('cc', 'نسخة')}
        {d.showCc && rcRow('bcc', 'مخفية')}
        <label className="ml-l" htmlFor="ml-subj">
          الموضوع
          <input id="ml-subj" value={d.subject} onChange={(e) => set({ subject: e.target.value })} maxLength={200} />
        </label>
        <div className="ml-body-wrap">
          <textarea
            id="ml-body"
            ref={body}
            aria-label="نص الرسالة"
            placeholder="اكتب رسالتك. @ لذكر زميل، و # لربط أصل من المكتبة."
            value={d.body}
            onChange={(e) => {
              set({ body: e.target.value });
              setMention((e.target.value.slice(0, e.target.selectionStart).match(/[@#][^\s@#]*$/) ?? [''])[0]);
            }}
          />
          {mentionOptions.length > 0 && (
            <div className="ml-sugg" role="listbox">
              {mentionOptions.map((o) => (
                <button type="button" key={o.key} onClick={() => pickMention(o)}>
                  {'person' in o ? <Av label={o.label} small /> : <I n="image" />}
                  <span>
                    {o.label}
                    <small>{o.sub}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        {d.sig && <p className="ml-sig">{signature}</p>}

        {(d.files.length > 0 || uploads.length > 0) && (
          <div className="ml-atts">
            {d.files.map((f) => (
              <span key={f.id} className="ml-att">
                <I n="file" />
                <span>{f.name}</span>
                <small>{fileSize(f.size_bytes)} · Drive</small>
                <button type="button" aria-label="إزالة" onClick={() => set({ files: d.files.filter((x) => x.id !== f.id) })}>
                  ×
                </button>
              </span>
            ))}
            {uploads.map((u) => (
              <span key={u.key} className={`ml-att ${u.error ? 'bad' : ''}`}>
                <I n={u.error ? 'alert' : 'sync'} />
                <span>{u.name}</span>
                <small>{u.error ?? `يُرفع إلى Drive… ${Math.round(u.progress * 100)}٪`}</small>
                {u.error && (
                  <button type="button" aria-label="إزالة" onClick={() => setUploads((x) => x.filter((y) => y.key !== u.key))}>
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        {d.refs.map((id) => {
          const a = assetOf(id);
          const note = refNotes.find((n) => n?.id === id);
          return (
            <div key={id} className="ml-refwrap">
              <div className="ml-ref">
                <span className="th">
                  <I n={a?.kind === 'video' ? 'film' : a?.kind === 'image' ? 'image' : 'file'} />
                </span>
                <span>
                  <b>{a?.name ?? 'أصل'}</b>
                  <small>
                    مرجع من المكتبة · الإصدار {a?.current_version}
                    {a?.approved_version ? ` · المعتمد ${a.approved_version}` : ''}
                  </small>
                </span>
                <span className="rr">
                  {a && <span className="mx-chip plain">{stageAr(a.stage)}</span>}
                  <button type="button" className="ml-btn sm quiet" onClick={() => set({ refs: d.refs.filter((x) => x !== id) })}>
                    إزالة
                  </button>
                </span>
              </div>
              {note && (
                <p className={`ml-refnote ${note.bad ? 'bad' : note.ok ? 'ok' : ''}`}>
                  <I n={note.bad ? 'alert' : note.ok ? 'clip' : 'link'} />
                  {note.text}
                </p>
              )}
            </div>
          );
        })}
        {d.card && (
          <div className="ml-sub">
            <h4>
              {cardTitle(d.card)} مرفقة بالرسالة
              <button type="button" className="ml-btn sm quiet" onClick={() => set({ card: null })}>
                إزالة
              </button>
            </h4>
            <span>{cardSummary(d.card, m.nameOf, (id) => assetOf(id)?.name ?? '')}</span>
          </div>
        )}

        <div className="ml-tools">
          <button type="button" className="ml-btn" onClick={() => fileInput.current?.click()}>
            <I n="clip" />
            من جهازك
          </button>
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => void attach(e.target.files).then(() => (e.target.value = ''))} />
          <button type="button" className="ml-btn" aria-pressed={panel === 'lib'} onClick={() => setPanel(panel === 'lib' ? null : 'lib')}>
            <I n="image" />
            من مكتبة الوسائط
          </button>
          <button type="button" className="ml-btn" aria-pressed={panel === 'approval'} disabled={external} title={external ? 'بطاقات الاعتماد داخلية فقط' : ''} onClick={() => setPanel(panel === 'approval' ? null : 'approval')}>
            <I n="check" />
            طلب اعتماد
          </button>
          <button type="button" className="ml-btn" aria-pressed={panel === 'date'} onClick={() => setPanel(panel === 'date' ? null : 'date')}>
            <I n="cal" />
            تأكيد موعد
          </button>
          <button
            type="button"
            className="ml-btn"
            aria-pressed={panel === 'task'}
            disabled={external || !canTask}
            title={external ? 'المهام داخلية فقط' : !canTask ? 'إسناد المهام لمدير الاتصال ومساعده والمنتج الإعلامي' : ''}
            onClick={() => setPanel(panel === 'task' ? null : 'task')}
          >
            <I n="tasks" />
            مهمة
          </button>
          <button type="button" className="ml-btn" aria-pressed={panel === 'progress'} disabled={external} onClick={() => setPanel(panel === 'progress' ? null : 'progress')}>
            <I n="chart" />
            تحديث تقدّم
          </button>
          <select
            className="ml-sel"
            aria-label="قالب رد"
            value=""
            onChange={(e) => {
              const t = TEMPLATES.find((x) => x.id === e.target.value);
              if (t) set({ body: (d.body.trim() ? `${d.body.trim()}\n\n` : '') + t.body });
            }}
          >
            <option value="">قالب رد…</option>
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <label className="ml-check">
            <input type="checkbox" checked={d.sig} onChange={(e) => set({ sig: e.target.checked })} />
            التوقيع
          </label>
        </div>

        {panel && (
          <Panel
            kind={panel}
            external={external}
            recipients={internalPeople}
            onClose={() => setPanel(null)}
            onRef={(id) => !d.refs.includes(id) && set({ refs: [...d.refs, id] })}
            refs={d.refs}
            onCard={(card) => {
              const patch: Partial<Draft> = { card };
              if ((card.type === 'approval' || card.type === 'progress') && !d.refs.includes(card.asset_id)) patch.refs = [...d.refs, card.asset_id];
              if (!d.subject && card.type === 'approval') {
                const a = assetOf(card.asset_id);
                if (a) patch.subject = `اعتماد الإصدار ${a.current_version} من ${a.name}`;
              }
              set(patch);
              setPanel(null);
            }}
            onLater={(at) => {
              set({ sendAt: at });
              setPanel(null);
            }}
          />
        )}

        {d.sendAt && (
          <p className="ml-hint">
            <I n="cal" />
            <span>
              تُرسل {fullWhen(new Date(d.sendAt).toISOString())}. يراها المستلمون عندها
              {external ? '، وتخرج من صندوق القسم عند أول مزامنة بعد موعدها' : ''}.{' '}
              <button type="button" className="ml-link" onClick={() => set({ sendAt: null })}>
                إلغاء الجدولة
              </button>
            </span>
          </p>
        )}
        {gated && (
          <p className="ml-hint warn">
            <I n="shield" />
            <span>
              {newThread ? 'رسالة خارجية جديدة' : 'رد على محادثة ليست مُسندة إليك'}، فتذهب أولاً إلى مدير الاتصال أو مساعده للاعتماد، ثم تخرج
              من صندوق القسم.
            </span>
          </p>
        )}
        {external && m.settings.paused && (
          <p className="ml-hint warn">
            <I n="pause" />
            <span>البريد الصادر متوقف الآن. تدخل الرسالة الطابور وتخرج عند الاستئناف.</span>
          </p>
        )}
        {external && m.mailbox === 'off' && (
          <p className="ml-hint warn">
            <I n="cloud" />
            <span>صندوق القسم في Gmail لم يُربط بعد. تُحفظ الرسالة في الصادر وتخرج حين يُربط.</span>
          </p>
        )}
        {error && (
          <p className="ml-err" role="alert">
            {error}
          </p>
        )}

        <div className="ml-foot">
          <div>
            <button type="button" className="ml-btn quiet danger" onClick={onClose}>
              <I n="trash" />
              تجاهل
            </button>
            <button type="button" className="ml-btn quiet" onClick={() => (onSaveDraft(d), onClose())}>
              حفظ مسودة
            </button>
          </div>
          <div>
            {!gated && (
              <button type="button" className="ml-btn" aria-pressed={panel === 'later'} onClick={() => setPanel(panel === 'later' ? null : 'later')}>
                <I n="cal" />
                إرسال لاحقاً
              </button>
            )}
            <button type="button" className="ml-btn primary" onClick={submit}>
              <I n="send" />
              {gated ? 'إرسال للاعتماد' : d.sendAt ? 'جدولة' : 'إرسال'}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}

export function cardTitle(c: { type: string }) {
  return ({ task: 'مهمة', approval: 'طلب اعتماد', date: 'تأكيد موعد', progress: 'تحديث تقدّم' } as Record<string, string>)[c.type] ?? '';
}

function cardSummary(c: CardDraft, nameOf: (e: string) => string, assetName: (id: string) => string) {
  if (c.type === 'task') return `${c.what} · ${nameOf(c.assignee)} · التسليم ${fullWhen(new Date(c.due).toISOString())}${c.priority === 'urgent' ? ' · عاجلة' : ''}`;
  if (c.type === 'approval') return assetName(c.asset_id);
  if (c.type === 'date') return `${assetName(c.asset_id)} · ${fullWhen(new Date(c.proposed).toISOString())} · ${c.channels.map((x) => CHANNEL_AR[x]).join('، ')}`;
  return `${assetName(c.asset_id)} ← ${stageAr(c.to)}`;
}

function Panel({
  kind,
  external,
  recipients,
  refs,
  onClose,
  onRef,
  onCard,
  onLater,
}: {
  kind: 'lib' | 'task' | 'approval' | 'date' | 'progress' | 'later';
  external: boolean;
  recipients: string[];
  refs: string[];
  onClose: () => void;
  onRef: (id: string) => void;
  onCard: (c: CardDraft) => void;
  onLater: (at: string) => void;
}) {
  const m = useMail();
  const [what, setWhat] = useState('');
  const [who, setWho] = useState(recipients[0] ?? '');
  const [due, setDue] = useState(localInput(24, 14));
  const [urgent, setUrgent] = useState(false);
  const review = m.assets.filter((a) => a.stage === 'review');
  const [asset, setAsset] = useState(kind === 'approval' ? (review[0]?.id ?? '') : (m.assets[0]?.id ?? ''));
  const [when, setWhen] = useState(localInput(72, 18));
  const [channels, setChannels] = useState(['Instagram', 'X', 'LinkedIn']);
  const [later, setLater] = useState(localInput(18, 8));
  const movable = m.assets.filter((a) => ['draft', 'production', 'changes', 'rejected'].includes(a.stage));
  const [move, setMove] = useState(movable[0]?.id ?? '');
  const moveTo = (id: string) => (m.assets.find((a) => a.id === id)?.stage === 'draft' ? 'production' : 'review');

  if (kind === 'lib')
    return (
      <div className="ml-sub">
        <h4>
          اختر من مكتبة الوسائط
          <button type="button" className="ml-btn sm quiet" onClick={onClose}>
            إغلاق
          </button>
        </h4>
        {m.assets.length === 0 ? (
          <p className="ml-mtext">لا أصول تملك الوصول إليها في المكتبة.</p>
        ) : (
          <div className="ml-pick">
            {m.assets.map((a) => (
              <button type="button" key={a.id} disabled={refs.includes(a.id)} onClick={() => onRef(a.id)}>
                <span className="th">
                  <I n={a.kind === 'video' ? 'film' : a.kind === 'image' ? 'image' : 'file'} />
                </span>
                <span>
                  <b>{a.name}</b>
                  <small>
                    الإصدار {a.current_version} · {fileSize(a.size_bytes)}
                    {a.approved_version ? ` · المعتمد ${a.approved_version}` : ''}
                  </small>
                </span>
                <span className="mx-chip plain">{refs.includes(a.id) ? 'مضاف' : stageAr(a.stage)}</span>
              </button>
            ))}
          </div>
        )}
        <p className="ml-mtext">
          {external
            ? 'للجهات الخارجية يُرفق الإصدار المعتمد فقط.'
            : 'داخل المركز يصل المرجع كبطاقة حية تتبع صلاحيات المجلد، لا كنسخة من الملف. من لا يملك الوصول يراها مقفلة.'}
        </p>
      </div>
    );
  if (kind === 'task')
    return (
      <div className="ml-sub">
        <h4>مهمة مع الرسالة</h4>
        {!recipients.length && <p className="ml-err">أضف مستلماً من القسم أولاً.</p>}
        <label className="ml-l" htmlFor="ml-t-what">
          المطلوب
          <input id="ml-t-what" maxLength={140} value={what} onChange={(e) => setWhat(e.target.value)} />
        </label>
        <div className="ml-two">
          <label className="ml-l" htmlFor="ml-t-who">
            المسؤول
            <select id="ml-t-who" value={who} onChange={(e) => setWho(e.target.value)}>
              {recipients.map((p) => (
                <option key={p} value={p}>
                  {m.nameOf(p)}
                </option>
              ))}
            </select>
          </label>
          <label className="ml-l" htmlFor="ml-t-due">
            التسليم
            <input id="ml-t-due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
        </div>
        <label className="ml-check">
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
          عاجلة
        </label>
        <p className="ml-mtext">تُنشأ المهمة في صفحة المهام أيضاً، ويحدّث المسؤول تقدّمها من البطاقة.</p>
        <div className="ml-row-end">
          <button
            type="button"
            className="ml-btn sm primary"
            disabled={!recipients.length || !what.trim() || !who}
            onClick={() => onCard({ type: 'task', what: what.trim(), assignee: who || recipients[0], due, priority: urgent ? 'urgent' : 'normal' })}
          >
            إضافة المهمة
          </button>
        </div>
      </div>
    );
  if (kind === 'approval')
    return (
      <div className="ml-sub">
        <h4>طلب اعتماد</h4>
        {review.length === 0 ? (
          <p className="ml-mtext">لا أصول «قيد المراجعة» تملك الوصول إليها الآن.</p>
        ) : (
          <label className="ml-l" htmlFor="ml-a-asset">
            الأصل
            <select id="ml-a-asset" value={asset} onChange={(e) => setAsset(e.target.value)}>
              {review.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · الإصدار {a.current_version}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="ml-mtext">البطاقة مربوطة بالإصدار الحالي. يقرر مدير الاتصال أو مساعده من الرسالة، بالقاعدة نفسها في مكتبة الوسائط.</p>
        <div className="ml-row-end">
          <button type="button" className="ml-btn sm primary" disabled={!review.length} onClick={() => onCard({ type: 'approval', asset_id: asset || review[0].id })}>
            إضافة الطلب
          </button>
        </div>
      </div>
    );
  if (kind === 'date')
    return (
      <div className="ml-sub">
        <h4>تأكيد موعد نشر</h4>
        <div className="ml-two">
          <label className="ml-l" htmlFor="ml-d-asset">
            الأصل
            <select id="ml-d-asset" value={asset} onChange={(e) => setAsset(e.target.value)}>
              {m.assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ml-l" htmlFor="ml-d-when">
            الموعد المقترح
            <input id="ml-d-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </label>
        </div>
        <div className="ml-chks">
          {['Instagram', 'X', 'LinkedIn'].map((c) => (
            <label key={c} className="ml-check">
              <input
                type="checkbox"
                checked={channels.includes(c)}
                onChange={(e) => setChannels(e.target.checked ? [...channels, c] : channels.filter((x) => x !== c))}
              />
              {CHANNEL_AR[c]}
            </label>
          ))}
        </div>
        {external ? (
          <p className="ml-mtext">يصل للجهة الخارجية زران: «تأكيد الموعد» و«اقتراح موعد آخر»، صالحان 72 ساعة، ويظهر ردها هنا.</p>
        ) : (
          <label className="ml-l" htmlFor="ml-d-who">
            من يؤكد؟
            <select id="ml-d-who" value={who} onChange={(e) => setWho(e.target.value)}>
              {recipients.map((p) => (
                <option key={p} value={p}>
                  {m.nameOf(p)}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="ml-row-end">
          <button
            type="button"
            className="ml-btn sm primary"
            disabled={!m.assets.length || (!external && !recipients.length) || !channels.length}
            onClick={() => onCard({ type: 'date', asset_id: asset || m.assets[0].id, proposed: when, channels, askee: external ? 'ext' : who || recipients[0] })}
          >
            إضافة البطاقة
          </button>
        </div>
      </div>
    );
  if (kind === 'progress')
    return (
      <div className="ml-sub">
        <h4>تحديث تقدّم</h4>
        {movable.length === 0 ? (
          <p className="ml-mtext">لا أصول في «مسودة» أو «قيد الإنتاج» أو «بحاجة إلى تعديل» تملك الوصول إليها.</p>
        ) : (
          <label className="ml-l" htmlFor="ml-p-asset">
            الأصل
            <select id="ml-p-asset" value={move} onChange={(e) => setMove(e.target.value)}>
              {movable.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}: {stageAr(a.stage)} ← {stageAr(moveTo(a.id))}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="ml-mtext">ينقل الأصل إلى مرحلته التالية عند الإرسال، بقاعدة مكتبة الوسائط نفسها، ويرى المستلمون التحديث في البطاقة.</p>
        <div className="ml-row-end">
          <button type="button" className="ml-btn sm primary" disabled={!movable.length} onClick={() => onCard({ type: 'progress', asset_id: move || movable[0].id, to: moveTo(move || movable[0].id) })}>
            إضافة التحديث
          </button>
        </div>
      </div>
    );
  return (
    <div className="ml-sub">
      <h4>إرسال لاحقاً</h4>
      <div className="ml-chks">
        {[
          ['غداً · 08:00', localInput(24, 8)],
          ['غداً · 13:00', localInput(24, 13)],
          ['بعد يومين · 08:00', localInput(48, 8)],
        ].map(([label, v]) => (
          <button type="button" key={label} className="ml-btn sm" onClick={() => onLater(v)}>
            {label}
          </button>
        ))}
      </div>
      <label className="ml-l" htmlFor="ml-later">
        أو موعد محدد
        <input id="ml-later" type="datetime-local" value={later} onChange={(e) => setLater(e.target.value)} />
      </label>
      <div className="ml-row-end">
        <button type="button" className="ml-btn sm primary" onClick={() => onLater(later)}>
          اعتماد الموعد
        </button>
      </div>
    </div>
  );
}

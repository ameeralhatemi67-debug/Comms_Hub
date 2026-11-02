'use client';
// The tester feedback channel and the browser's own error reports (Action_Plan.md section 5). A person writes a note from
// the top bar, or from inside any open window, and can mark the place on the page (MVP_draft.md section 69); an uncaught
// error or a failed render is sent by the page itself, scrubbed again by the database. The inbox is «ملاحظات وأخطاء» in
// «الإعدادات», and a person follows their own notes in «ملاحظاتي» on «الحساب».
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { Crosshair, MessageSquarePlus } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAccount } from '@/lib/account-context';
import { roles, type Role } from '@/lib/domain';
import { PAGE_SOURCES, pageKeyOf } from '@/lib/help/registry';
import { native } from '@/lib/native';
import { useHub } from '@/lib/store';
import { useCaps } from './caps';
import { MarkLayer, OutlineView } from './feedback-mark';
import { Modal } from './ui';
import { needProps } from '@/lib/kit/need';
import { dialogTitle, topDialog } from '@/lib/feedback/capture';
import { MAX_NOTE_ERRORS, contextLines, devBrief, groupInbox, markName, type InboxEntry, type Mark, type NoteContext, type Outline } from '@/lib/feedback/marks';
import {
  DEFAULT_SEVERITY,
  KIND_AR,
  NOTE_KINDS,
  NOTE_MAX,
  SEVERITIES,
  SEVERITY_AR,
  STATE_AR,
  describeError,
  feedbackErrorAr,
  reportGate,
  type FeedbackRow,
  type MyNote,
  type NoteKind,
  type Severity,
} from '@/lib/feedback/rules';

const gate = reportGate();
/** What this visit caught, sent with a note written now. */
const visitErrors: string[] = [];

/** Sends one caught error. Silent on every failure: reporting must never become the next error. */
export function reportError(e: unknown, componentStack?: string | null): void {
  try {
    const { message, where } = describeError(e, componentStack);
    if (!gate(message)) return;
    visitErrors.push(message);
    visitErrors.splice(0, Math.max(0, visitErrors.length - MAX_NOTE_ERRORS));
    void supabase()
      .rpc('error_report', { p_page: window.location.pathname, p_message: message, p_where: where })
      .then(() => undefined, () => undefined);
  } catch {
    /* nothing */
  }
}

/** Listens for what React's boundary does not see: uncaught errors and unhandled rejections. */
export function useErrorReporter(): void {
  useEffect(() => {
    const onError = (ev: ErrorEvent) => reportError(ev.error ?? ev.message);
    const onRejection = (ev: PromiseRejectionEvent) => reportError(ev.reason);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
}

type Draft = { page: string; kind: NoteKind; severity: Severity; body: string; marks: Mark[]; outline: Outline | null };
const emptyDraft = (page: string): Draft => ({ page, kind: 'problem', severity: DEFAULT_SEVERITY, body: '', marks: [], outline: null });

const KEY_HINT = 'Alt+Shift+N';

/** The window on top, which blocks everything outside it, including the top bar. */
function useTopDialog(): HTMLDialogElement | null {
  const [top, setTop] = useState<HTMLDialogElement | null>(null);
  useEffect(() => {
    const read = () => setTop(topDialog(document));
    const watch = new MutationObserver(read);
    watch.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
    read();
    return () => watch.disconnect();
  }, []);
  return top;
}

/**
 * The button in the top bar, the same button inside whatever window is open, since an open window blocks the top bar, and
 * a key that works everywhere. A note left unsent waits here, so a person can close it, scroll to the place and come back.
 */
export function FeedbackButton() {
  const { state } = useHub();
  const account = useAccount();
  const top = useTopDialog();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => emptyDraft(''));
  const [over, setOver] = useState('');
  const show = useCallback(() => {
    const page = window.location.pathname;
    setOver(dialogTitle(document, page));
    setDraft((d) => (d.page === page ? d : { ...d, page, marks: [], outline: null }));
    setOpen(true);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey || e.code !== 'KeyN') return;
      e.preventDefault();
      e.stopPropagation();
      show();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [show]);
  const title = `أرسل ملاحظة عن هذه الصفحة (${KEY_HINT})`;
  return (
    <>
      <button type="button" className="fb-open" aria-label="أرسل ملاحظة" title={title} onClick={show}>
        <MessageSquarePlus />
      </button>
      {top &&
        !open &&
        createPortal(
          <button type="button" className="fb-float" data-fb-own aria-label="أرسل ملاحظة" title={title} onClick={show}>
            <MessageSquarePlus />
          </button>,
          top,
        )}
      {open &&
        createPortal(
          <FeedbackDialog
            draft={draft}
            setDraft={setDraft}
            context={() => noteContext(state.role === account.role ? undefined : state.role, over)}
            onClose={() => setOpen(false)}
            onForget={() => {
              setDraft(emptyDraft(draft.page));
              setOpen(false);
            }}
          />,
          // Last in the document, so whatever asks which window is on top by document order gets this one.
          document.body,
        )}
    </>
  );
}

function noteContext(viewAs: string | undefined, dialog: string): NoteContext {
  const app = native();
  return {
    viewAs,
    build: document.querySelector('meta[name="hub-build"]')?.getAttribute('content') ?? undefined,
    app: app.platform,
    appVersion: app.version ?? undefined,
    w: window.innerWidth,
    h: window.innerHeight,
    dpr: Math.round(window.devicePixelRatio * 100) / 100,
    theme: document.documentElement.getAttribute('data-theme') ?? 'light',
    dialog: dialog || undefined,
    errors: visitErrors.length ? [...visitErrors] : undefined,
  };
}

function FeedbackDialog({
  draft,
  setDraft,
  context,
  onClose,
  onForget,
}: {
  draft: Draft;
  setDraft: Dispatch<SetStateAction<Draft>>;
  context: () => NoteContext;
  onClose: () => void;
  onForget: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [marking, setMarking] = useState(false);
  const [err, setErr] = useState('');
  const page = useRef(draft.page);
  const { kind, severity, body, marks, outline } = draft;
  const edit = (change: Partial<Draft>) => setDraft((d) => ({ ...d, ...change }));
  const send = async () => {
    setBusy(true);
    setErr('');
    const { error } = await supabase().rpc('feedback_submit', {
      p_kind: kind,
      p_page: page.current,
      p_body: body,
      p_severity: kind === 'problem' ? severity : null,
      p_marks: marks.length ? marks : null,
      p_outline: marks.length ? outline : null,
      p_context: context(),
    });
    setBusy(false);
    if (error) return setErr(feedbackErrorAr(error.message));
    setDone(true);
  };
  if (marking)
    return (
      <MarkLayer
        page={page.current}
        marks={marks}
        onCancel={() => setMarking(false)}
        onDone={(next, shape) => {
          edit({ marks: next, outline: shape });
          setMarking(false);
        }}
      />
    );
  return (
    <Modal title="أرسل ملاحظة" onClose={done ? onForget : onClose}>
      {done ? (
        <div className="fb-done">
          <p>وصلت ملاحظتك. شكراً لك. تتابعها من «ملاحظاتي» في صفحة «الحساب».</p>
          <div className="actions">
            <button type="button" className="primary" onClick={onForget}>
              إغلاق
            </button>
          </div>
        </div>
      ) : (
        <div className="fb-form">
          <p className="muted">
            يقرؤها مسؤولو النظام، ويصلك إشعار حين تُعالج. تُرسل معها الصفحة (<bdi dir="ltr">{page.current || '/'}</bdi>) واسمك ودورك، ونوع جهازك وحجم شاشتك، وإصدار الموقع، وأخطاء هذه الزيارة، وما تحدده
            على الصفحة. لا تُرسل صورة للشاشة.
          </p>
          <div className="fb-kinds" role="radiogroup" aria-label="نوع الملاحظة">
            {NOTE_KINDS.map(([k, label]) => (
              <label key={k} className={kind === k ? 'on' : ''}>
                <input type="radio" name="fb-kind" value={k} checked={kind === k} onChange={() => edit({ kind: k })} />
                {label}
              </label>
            ))}
          </div>
          {kind === 'problem' && (
            <div className="fb-kinds fb-severity" role="radiogroup" aria-label="شدة المشكلة">
              {SEVERITIES.map(([k, label]) => (
                <label key={k} className={severity === k ? 'on' : ''}>
                  <input type="radio" name="fb-severity" value={k} checked={severity === k} onChange={() => edit({ severity: k })} />
                  {label}
                </label>
              ))}
            </div>
          )}
          {marks.length ? (
            <div className="fb-marked">
              <OutlineView outline={outline} marks={marks} />
              <div className="fb-marked-side">
                <ul className="fb-marklist">
                  {marks.map((m, i) => (
                    <li key={i}>{markName(m, i)}</li>
                  ))}
                </ul>
                <div className="actions">
                  <button type="button" className="secondary fb-point" disabled={busy} onClick={() => setMarking(true)}>
                    عدّل التحديد
                  </button>
                  <button type="button" className="secondary" disabled={busy} onClick={() => edit({ marks: [], outline: null })}>
                    احذف التحديد
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="fb-pointer">
              <button type="button" className="secondary fb-point" disabled={busy} onClick={() => setMarking(true)}>
                <Crosshair />
                حدد المكان على الصفحة
              </button>
              <small className="muted">إن لم يكن المكان ظاهراً، أغلق هذه النافذة وحرّك الصفحة إليه، وستجد ما كتبته كما تركته.</small>
            </div>
          )}
          <label className="l">
            ملاحظتك
            <textarea className="fb-text" rows={5} maxLength={NOTE_MAX} value={body} disabled={busy} onChange={(e) => edit({ body: e.target.value })} placeholder="ما الذي جرى أو ما الذي تقترحه؟" />
          </label>
          <small className="muted">
            {body.length} من {NOTE_MAX}
          </small>
          {err && (
            <p className="ml-err" role="alert">
              {err}
            </p>
          )}
          <div className="actions">
            <button type="button" className="primary fb-send" disabled={busy || !body.trim()} onClick={() => void send()}>
              إرسال
            </button>
            <button type="button" className="secondary" onClick={onForget}>
              إلغاء
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

const when = (iso: string) => new Date(iso).toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'short', timeStyle: 'short' });
const roleName = (key: string) => roles[key as Role]?.name ?? 'غير معروف';
const sourcesOf = (page: string | null) => {
  const key = page ? pageKeyOf(page) : null;
  return key ? (PAGE_SOURCES[key] ?? []) : [];
};

/** The inbox in «الإعدادات»: notes and errors together, what is new and stops work first. */
export function FeedbackTab({ initial }: { initial?: FeedbackRow[] }) {
  const caps = useCaps();
  const [rows, setRows] = useState<FeedbackRow[] | null>(initial ?? null);
  const [refused, setRefused] = useState(false);
  const [kind, setKind] = useState('');
  const [state, setState] = useState('');
  const [severity, setSeverity] = useState('');
  const [page, setPage] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const load = async () => {
    const { data, error } = await supabase().rpc('feedback_list', { p_limit: 300 });
    if (error) return setRefused(true);
    setRows(data as FeedbackRow[]);
  };
  useEffect(() => {
    if (!initial) void load();
  }, [initial]);
  const entries = useMemo(() => groupInbox(rows ?? []), [rows]);
  const shown = useMemo(
    () => entries.filter(({ row: r }) => (!kind || r.kind === kind) && (!state || r.state === state) && (!severity || r.severity === severity) && (!page || r.page === page)),
    [entries, kind, state, severity, page],
  );
  const pages = useMemo(() => [...new Set((rows ?? []).map((r) => r.page).filter((p): p is string => Boolean(p)))].sort(), [rows]);
  const act = async (id: string, rpc: string, args: Record<string, unknown>) => {
    setBusy(id);
    setErr('');
    const { error } = await supabase().rpc(rpc, args);
    setBusy('');
    if (error) return setErr(feedbackErrorAr(error.message));
    await load();
  };
  const mark = (id: string, next: string) => void act(id, 'feedback_mark', { p_id: id, p_state: next });
  const merge = (id: string, into: string | null) => void act(id, 'feedback_merge', { p_id: id, p_into: into });
  const canMark = caps.has('settings.manage');

  if (refused || (caps.ready && !caps.has('settings.view')))
    return (
      <div className="st-feedback">
        <p className="muted">الملاحظات لمن يملك «عرض صحة النظام وسجل الإعدادات».</p>
        <button type="button" className="secondary" {...needProps('settings.view', 'الملاحظات والأخطاء لمسؤول النظام افتراضياً.')}>
          اطلب هذه الصلاحية
        </button>
      </div>
    );
  if (!rows) return <p className="muted">جارٍ التحميل…</p>;
  const fresh = rows.filter((r) => r.state === 'new' && !r.duplicate_of).length;
  return (
    <div className="st-feedback">
      <p className="muted">
        ملاحظات الأعضاء من زر الملاحظة في الشريط العلوي، والأخطاء التي التقطتها الصفحات نفسها (يُجمع المتشابه منها في سطر واحد بعدّاد). {fresh ? `${fresh} جديد.` : 'لا جديد.'}
      </p>
      <div className="fb-filters">
        <label>
          النوع
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">الكل</option>
            {Object.entries(KIND_AR).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          الحالة
          <select value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">الكل</option>
            {Object.entries(STATE_AR).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          الشدة
          <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="">الكل</option>
            {SEVERITIES.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          الصفحة
          <select value={page} onChange={(e) => setPage(e.target.value)}>
            <option value="">الكل</option>
            {pages.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>
      {err && (
        <p className="ml-err" role="alert">
          {err}
        </p>
      )}
      {shown.length === 0 ? (
        <p className="muted">لا شيء هنا.</p>
      ) : (
        <ul className="fb-list">
          {shown.map((entry) => (
            <InboxItem key={entry.row.id} entry={entry} others={entries} busy={busy === entry.row.id} canMark={canMark} onMark={mark} onMerge={merge} />
          ))}
        </ul>
      )}
    </div>
  );
}

function InboxItem({
  entry: { row: r, merged },
  others,
  busy,
  canMark,
  onMark,
  onMerge,
}: {
  entry: InboxEntry;
  others: InboxEntry[];
  busy: boolean;
  canMark: boolean;
  onMark: (id: string, next: string) => void;
  onMerge: (id: string, into: string | null) => void;
}) {
  const details = contextLines(r.context, roleName);
  const errors = r.context?.errors ?? [];
  // The same page first: that is where the same problem usually is.
  const targets = others.filter((o) => o.row.id !== r.id && o.row.kind !== 'error').sort((a, b) => Number(b.row.page === r.page) - Number(a.row.page === r.page));
  const [copied, setCopied] = useState(false);
  const [brief, setBrief] = useState('');
  const copy = async () => {
    const text = devBrief(r, { roleName, sources: sourcesOf(r.page) });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // A page without clipboard access: show the text to copy by hand.
      setBrief(text);
    }
  };
  return (
    <li className={`fb-item ${r.kind} ${r.state}`}>
      <div className="between">
        <b>
          {KIND_AR[r.kind]}
          {r.severity ? ` · ${SEVERITY_AR[r.severity]}` : ''}
          {r.count > 1 ? ` · تكرر ${r.count} مرة` : ''}
        </b>
        <span className={`mx-chip ${r.state === 'new' ? 'warn' : r.state === 'done' ? 'success' : ''}`}>{STATE_AR[r.state]}</span>
      </div>
      <p className="fb-body">{r.body}</p>
      {r.marks?.length ? (
        <div className="fb-marked">
          <OutlineView outline={r.outline} marks={r.marks} screen={r.context ?? undefined} />
          <ul className="fb-marklist fb-marked-side">
            {r.marks.map((m, i) => (
              <li key={i}>{markName(m, i)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <small className="muted">
        {r.author_name ?? r.author ?? 'غير معروف'}
        {r.page ? <> · <bdi dir="ltr">{r.page}</bdi></> : null}
        {r.place ? <> · <bdi dir="ltr">{r.place}</bdi></> : null} · <bdi dir="ltr">{when(r.last_at)}</bdi>
      </small>
      {details.length + errors.length > 0 && (
        <details className="fb-fold">
          <summary>التفاصيل</summary>
          <dl className="fb-details">
            {details.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
            {errors.length > 0 && (
              <div>
                <dt>أخطاء الزيارة</dt>
                <dd>
                  {errors.map((e, i) => (
                    <bdi key={i} dir="ltr">
                      {e}
                    </bdi>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        </details>
      )}
      {merged.length > 0 && (
        <details className="fb-fold">
          <summary>ملاحظات مدموجة ({merged.length})</summary>
          <ul className="fb-merged">
            {merged.map((m) => (
              <li key={m.id}>
                <p className="fb-body">{m.body}</p>
                <small className="muted">{m.author_name ?? m.author ?? 'غير معروف'}</small>
                {canMark && (
                  <button type="button" className="secondary" disabled={busy} onClick={() => onMerge(m.id, null)}>
                    افصلها
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      {brief && <textarea className="fb-text fb-brief" readOnly rows={8} value={brief} aria-label="نص الملاحظة للنسخ" onFocus={(e) => e.target.select()} />}
      <div className="actions">
        {r.state !== 'seen' && (
          <button type="button" className="secondary" disabled={busy || !canMark} onClick={() => onMark(r.id, 'seen')}>
            اطّلعت
          </button>
        )}
        {r.state !== 'done' && (
          <button type="button" className="secondary" disabled={busy || !canMark} onClick={() => onMark(r.id, 'done')}>
            عولج
          </button>
        )}
        {r.state !== 'new' && (
          <button type="button" className="secondary" disabled={busy || !canMark} onClick={() => onMark(r.id, 'new')}>
            أعد فتحه
          </button>
        )}
        <button type="button" className="secondary fb-copy" onClick={() => void copy()}>
          {copied ? 'نُسخت' : 'انسخ للمطور'}
        </button>
        {canMark && r.kind !== 'error' && targets.length > 0 && (
          <label className="fb-merge">
            ادمجها في
            <select value="" disabled={busy} onChange={(e) => e.target.value && onMerge(r.id, e.target.value)}>
              <option value="">اختر ملاحظة</option>
              {targets.map(({ row: o }) => (
                <option key={o.id} value={o.id}>
                  {(o.page ?? '') + ' · ' + o.body.slice(0, 50)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </li>
  );
}

/** «ملاحظاتي» on «الحساب»: what this person sent and how far each has gone. */
export function MyNotes({ initial }: { initial?: MyNote[] }) {
  const [rows, setRows] = useState<MyNote[] | null>(initial ?? null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (initial) return;
    let live = true;
    void Promise.resolve(supabase().rpc('feedback_mine', { p_limit: 50 })).then(({ data, error }) => {
      if (!live) return;
      if (error) setFailed(true);
      else setRows(data as MyNote[]);
    });
    return () => {
      live = false;
    };
  }, [initial]);
  if (failed) return <p className="muted">تعذّر تحميل ملاحظاتك. أعد فتح الصفحة.</p>;
  if (!rows) return <p className="muted">جارٍ التحميل…</p>;
  if (!rows.length) return <p className="muted">لم ترسل ملاحظة بعد. زر الملاحظة في الشريط العلوي، وفي كل نافذة مفتوحة.</p>;
  return (
    <ul className="fb-list fb-mine">
      {rows.map((r) => (
        <li key={r.id} className={`fb-item ${r.kind} ${r.state}`}>
          <div className="between">
            <b>
              {KIND_AR[r.kind]}
              {r.severity ? ` · ${SEVERITY_AR[r.severity]}` : ''}
            </b>
            <span className={`mx-chip ${r.state === 'new' ? 'warn' : r.state === 'done' ? 'success' : ''}`}>{STATE_AR[r.state]}</span>
          </div>
          <p className="fb-body">{r.body}</p>
          <small className="muted">
            {r.page ? <><bdi dir="ltr">{r.page}</bdi> · </> : null}
            <bdi dir="ltr">{when(r.created_at)}</bdi>
          </small>
        </li>
      ))}
    </ul>
  );
}

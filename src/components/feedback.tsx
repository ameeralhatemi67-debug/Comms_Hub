'use client';
// The tester feedback channel and the browser's own error reports (Action_Plan.md section 5).
// A person writes a note from the top bar; an uncaught error or a failed render is sent by the page
// itself, scrubbed again by the database. The inbox is «ملاحظات وأخطاء» in «الإعدادات».
import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useCaps } from './caps';
import { Modal } from './ui';
import { needProps } from '@/lib/kit/need';
import {
  KIND_AR,
  NOTE_KINDS,
  NOTE_MAX,
  STATE_AR,
  describeError,
  feedbackErrorAr,
  reportGate,
  type FeedbackRow,
  type NoteKind,
} from '@/lib/feedback/rules';

const gate = reportGate();

/** Sends one caught error. Silent on every failure: reporting must never become the next error. */
export function reportError(e: unknown, componentStack?: string | null): void {
  try {
    const { message, where } = describeError(e, componentStack);
    if (!gate(message)) return;
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

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="fb-open" aria-label="أرسل ملاحظة" title="أرسل ملاحظة عن هذه الصفحة" onClick={() => setOpen(true)}>
        <MessageSquarePlus />
      </button>
      {open && <FeedbackDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<NoteKind>('idea');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const page = useRef(typeof window === 'undefined' ? '' : window.location.pathname);
  const send = async () => {
    setBusy(true);
    setErr('');
    const { error } = await supabase().rpc('feedback_submit', { p_kind: kind, p_page: page.current, p_body: body });
    setBusy(false);
    if (error) return setErr(feedbackErrorAr(error.message));
    setDone(true);
  };
  return (
    <Modal title="أرسل ملاحظة" onClose={onClose}>
      {done ? (
        <div className="fb-done">
          <p>وصلت ملاحظتك. شكراً لك.</p>
          <div className="actions">
            <button type="button" className="primary" onClick={onClose}>
              إغلاق
            </button>
          </div>
        </div>
      ) : (
        <div className="fb-form">
          <p className="muted">
            يقرؤها مسؤولو النظام. تُرسل معها الصفحة التي أنت فيها (<bdi dir="ltr">{page.current || '/'}</bdi>) واسمك، ولا يُرسل غير ذلك.
          </p>
          <div className="fb-kinds" role="radiogroup" aria-label="نوع الملاحظة">
            {NOTE_KINDS.map(([k, label]) => (
              <label key={k} className={kind === k ? 'on' : ''}>
                <input type="radio" name="fb-kind" value={k} checked={kind === k} onChange={() => setKind(k)} />
                {label}
              </label>
            ))}
          </div>
          <label className="l">
            ملاحظتك
            <textarea className="fb-text" rows={5} maxLength={NOTE_MAX} value={body} disabled={busy} onChange={(e) => setBody(e.target.value)} placeholder="ما الذي جرى أو ما الذي تقترحه؟" />
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
            <button type="button" className="secondary" onClick={onClose}>
              إلغاء
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

const when = (iso: string) => new Date(iso).toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'short', timeStyle: 'short' });

/** The inbox in «الإعدادات»: notes and errors together, new first. */
export function FeedbackTab({ initial }: { initial?: FeedbackRow[] }) {
  const caps = useCaps();
  const [rows, setRows] = useState<FeedbackRow[] | null>(initial ?? null);
  const [refused, setRefused] = useState(false);
  const [kind, setKind] = useState('');
  const [state, setState] = useState('');
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
  const shown = useMemo(() => (rows ?? []).filter((r) => (!kind || r.kind === kind) && (!state || r.state === state)), [rows, kind, state]);
  const mark = async (id: string, next: string) => {
    setBusy(id);
    setErr('');
    const { error } = await supabase().rpc('feedback_mark', { p_id: id, p_state: next });
    setBusy('');
    if (error) return setErr(feedbackErrorAr(error.message));
    await load();
  };
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
  const fresh = rows.filter((r) => r.state === 'new').length;
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
          {shown.map((r) => (
            <li key={r.id} className={`fb-item ${r.kind} ${r.state}`}>
              <div className="between">
                <b>
                  {KIND_AR[r.kind]}
                  {r.count > 1 ? ` · تكرر ${r.count} مرة` : ''}
                </b>
                <span className={`mx-chip ${r.state === 'new' ? 'warn' : r.state === 'done' ? 'success' : ''}`}>{STATE_AR[r.state]}</span>
              </div>
              <p className="fb-body">{r.body}</p>
              <small className="muted">
                {r.author_name ?? r.author ?? 'غير معروف'}
                {r.page ? <> · <bdi dir="ltr">{r.page}</bdi></> : null}
                {r.place ? <> · <bdi dir="ltr">{r.place}</bdi></> : null} · <bdi dir="ltr">{when(r.last_at)}</bdi>
              </small>
              <div className="actions">
                {r.state !== 'seen' && (
                  <button type="button" className="secondary" disabled={busy === r.id || !canMark} onClick={() => void mark(r.id, 'seen')}>
                    اطّلعت
                  </button>
                )}
                {r.state !== 'done' && (
                  <button type="button" className="secondary" disabled={busy === r.id || !canMark} onClick={() => void mark(r.id, 'done')}>
                    عولج
                  </button>
                )}
                {r.state !== 'new' && (
                  <button type="button" className="secondary" disabled={busy === r.id || !canMark} onClick={() => void mark(r.id, 'new')}>
                    أعد فتحه
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

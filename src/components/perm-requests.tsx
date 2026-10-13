'use client';
// Asking for a permission (Permissions_Plan.md 6): one request object, four doors in. A
// locked control, messaging, mail and «الطلبات» all create the same row through the
// database (request_capability, chat_request_permission, mail_send with a request card); a
// granter decides it here, in «الحسابات», in the conversation or in the mail card
// (decide_permission_request). Approving defaults to what was asked and may be changed
// before confirming; declining asks for a short reason.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, KeyRound, Undo2, X } from 'lucide-react';
import { useHub } from '@/lib/store';
import { useAccount } from '@/lib/account-context';
import { supabase } from '@/lib/supabase/client';
import {
  MODE_AR,
  REQUEST_HOURS,
  REQUEST_STATUS,
  SOURCE_DOOR,
  askable,
  capLabel,
  capability,
  grantPreview,
  howAr,
  permError,
  roleAr,
  stamp,
  type Mode,
} from '@/lib/permissions';
import { Modal } from './ui';
import { useCaps } from './caps';

export type PermRequest = {
  id: string;
  requester: string;
  requester_name: string;
  requester_role: string;
  capability: string;
  label: string;
  mode: Mode;
  hours: number | null;
  uses: number | null;
  scope: Record<string, string> | null;
  reason: string;
  source: string;
  source_ref: string | null;
  status: 'pending' | 'approved' | 'declined' | 'withdrawn';
  created_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  can_decide: boolean;
};

export const PERM_CHANGED = 'hub:perm-requests';
const changed = () => window.dispatchEvent(new Event(PERM_CHANGED));

/** The requests the signed-in person may see (perm_requests: row level security decides). */
export function usePermRequests() {
  const [list, setList] = useState<PermRequest[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const reload = useCallback(async () => {
    const { data, error } = await supabase().rpc('perm_requests');
    if (error) return setStatus('error');
    setList((data ?? []) as PermRequest[]);
    setStatus('ready');
  }, []);
  useEffect(() => {
    void reload();
    const again = () => void reload();
    window.addEventListener(PERM_CHANGED, again);
    window.addEventListener('focus', again);
    return () => {
      window.removeEventListener(PERM_CHANGED, again);
      window.removeEventListener('focus', again);
    };
  }, [reload]);
  return { list, status, reload };
}

async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const { data, error } = await supabase().rpc(fn, args);
  return error ? { ok: false, error: permError(error.message) } : { ok: true, data: data as T };
}

/** One request, with the decision or the withdrawal that fits the reader. */
export function PermRequestCard({ q, me, onDecide }: { q: PermRequest; me: string; onDecide: (q: PermRequest, approve: boolean) => void }) {
  const { dispatch } = useHub();
  const mine = q.requester === me;
  return (
    <div className={`pq-card ${q.status}`}>
      <div className="pq-h">
        <KeyRound />
        <b>
          {mine ? 'طلبتَ' : `طلب ${q.requester_name}`} «{q.label}»{howAr(q.mode, q.hours, q.uses)}
        </b>
        <span className={`pq-st ${q.status}`}>{REQUEST_STATUS[q.status]}</span>
      </div>
      <p className="pq-why">«{q.reason}»</p>
      <small className="muted">
        {mine ? '' : `${roleAr(q.requester_role)} · `}
        {SOURCE_DOOR[q.source] ?? ''} · <bdi dir="ltr">{stamp(q.created_at)}</bdi>
        {q.decided_at && q.status !== 'pending' ? (
          <>
            {' '}
            · {q.status === 'withdrawn' ? 'سُحب' : 'قُرّر'} <bdi dir="ltr">{stamp(q.decided_at)}</bdi>
            {q.decision_note ? ` · «${q.decision_note}»` : ''}
          </>
        ) : null}
      </small>
      {q.status === 'pending' && (
        <div className="actions pq-acts">
          {q.can_decide && (
            <>
              <button type="button" className="primary" onClick={() => onDecide(q, true)}>
                <Check />
                موافقة
              </button>
              <button type="button" className="secondary" onClick={() => onDecide(q, false)}>
                <X />
                رفض
              </button>
            </>
          )}
          {!q.can_decide && !mine && <small className="muted">يقرر فيه من يملك «{q.label}» ويدير رتبة صاحبه.</small>}
          {mine && (
            <button
              type="button"
              className="secondary"
              onClick={async () => {
                const r = await rpc('withdraw_permission_request', { p_id: q.id });
                dispatch({ type: 'notify', text: r.ok ? 'سُحب الطلب.' : r.error });
                changed();
              }}
            >
              <Undo2 />
              سحب الطلب
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** A list of requests with its decision dialog. `filter` keeps what a tab shows. */
export function PermRequestList({ filter, empty }: { filter?: (q: PermRequest) => boolean; empty: string }) {
  const me = useAccount().email;
  const r = usePermRequests();
  const [deciding, setDeciding] = useState<{ q: PermRequest; approve: boolean } | null>(null);
  const list = r.list.filter(filter ?? (() => true));
  return (
    <div className="pq-list">
      {r.status === 'loading' && <p className="muted">جارٍ التحميل…</p>}
      {r.status === 'error' && <p className="warning">تعذّر تحميل الطلبات.</p>}
      {r.status === 'ready' && !list.length && <p className="muted">{empty}</p>}
      {list.map((q) => (
        <PermRequestCard key={q.id} q={q} me={me} onDecide={(x, approve) => setDeciding({ q: x, approve })} />
      ))}
      {deciding && <DecideDialog q={deciding.q} approve={deciding.approve} onClose={() => setDeciding(null)} onDone={() => void r.reload()} />}
    </div>
  );
}

/** Approve (as asked, or changed) or decline with a reason. */
export function DecideDialog({ q, approve, onClose, onDone }: { q: Pick<PermRequest, 'id' | 'capability' | 'label' | 'mode' | 'hours' | 'uses' | 'requester_name' | 'reason'>; approve: boolean; onClose: () => void; onDone?: () => void }) {
  const { dispatch } = useHub();
  const [mode, setMode] = useState<Mode>(q.mode);
  const [hours, setHours] = useState(q.hours ?? 24);
  const [uses, setUses] = useState(q.uses ?? 1);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const page = capability(q.capability)?.scope === 'page';
  const until = mode === 'timed' ? new Date(Date.now() + hours * 3600e3).toISOString() : null;
  const go = async () => {
    setBusy(true);
    const changedMode = mode !== q.mode || (mode === 'timed' && hours !== q.hours) || (mode === 'once' && uses !== q.uses);
    const r = approve
      ? await rpc('decide_permission_request', {
          p_id: q.id, p_approve: true, p_mode: changedMode ? mode : null, p_until: changedMode ? until : null,
          p_uses: mode === 'once' ? uses : null, p_scope: null, p_note: note || null,
        })
      : await rpc('decide_permission_request', { p_id: q.id, p_approve: false, p_mode: null, p_until: null, p_uses: null, p_scope: null, p_note: note });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    dispatch({ type: 'notify', text: approve ? 'مُنحت الصلاحية، ووصل صاحبها إشعار بها.' : 'رُفض الطلب، ووصل صاحبه السبب.' });
    changed();
    onDone?.();
    onClose();
  };
  return (
    <Modal title={approve ? `موافقة على طلب ${q.requester_name}` : `رفض طلب ${q.requester_name}`} onClose={onClose}>
      <div className="pm-dialog pq-decide">
        <p>
          طلب «{q.label}»{howAr(q.mode, q.hours, q.uses)}: «{q.reason}»
        </p>
        {approve && (
          <>
            <div className="pm-modes" role="group" aria-label="ما يُعطى">
              {(['standing', 'timed', 'once'] as Mode[]).map((m) => (
                <button type="button" key={m} aria-pressed={mode === m} className={mode === m ? 'on' : ''} disabled={m === 'once' && page} onClick={() => setMode(m)}>
                  {MODE_AR[m]}
                </button>
              ))}
            </div>
            {mode === 'timed' && (
              <div className="pm-durs" role="group" aria-label="المدة">
                {REQUEST_HOURS.map((d) => (
                  <button type="button" key={d.h} aria-pressed={hours === d.h} className={hours === d.h ? 'on' : ''} onClick={() => setHours(d.h)}>
                    {d.label}
                  </button>
                ))}
              </div>
            )}
            {mode === 'once' && (
              <label>
                عدد المرات
                <input type="number" min={1} max={20} value={uses} onChange={(e) => setUses(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} />
              </label>
            )}
            <p className="pm-preview">{grantPreview(q.requester_name, q.capability, mode, until, uses, null)}</p>
          </>
        )}
        <label>
          {approve ? 'ملاحظة (اختياري)' : 'سبب الرفض'}
          <input maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} required={!approve} />
        </label>
        {error && (
          <p className="warning" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="button" className="primary" disabled={busy || (!approve && !note.trim())} onClick={() => void go()}>
            {approve ? 'موافقة ومنح' : 'رفض الطلب'}
          </button>
          <button type="button" className="secondary" onClick={onClose}>
            إلغاء
          </button>
        </div>
      </div>
    </Modal>
  );
}

type Granter = { email: string; display_name: string; role: string };

/**
 * «اطلب صلاحية»: what is wanted, for how long, and why. From a locked control the capability
 * is given; from messaging the request goes as a card to the chosen granter's conversation.
 */
export function RequestPermissionDialog({ cap, source, sourceRef, onClose }: { cap?: string; source: 'button' | 'page' | 'chat'; sourceRef?: string; onClose: () => void }) {
  const { dispatch } = useHub();
  const account = useAccount();
  const caps = useCaps();
  const [k, setK] = useState(cap ?? '');
  const [mode, setMode] = useState<Mode>('timed');
  const [hours, setHours] = useState(24);
  const [uses, setUses] = useState(1);
  const [reason, setReason] = useState('');
  const [granters, setGranters] = useState<Granter[]>([]);
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const options = useMemo(() => askable(account.role, caps.evals), [account.role, caps.evals]);
  const c = capability(k);
  const fixed = !!c && !c.grantable;

  useEffect(() => {
    if (source !== 'chat' || !k) return;
    void supabase()
      .rpc('perm_granters', { p_cap: k })
      .then(({ data }) => {
        const g = (data ?? []) as Granter[];
        setGranters(g);
        setTo((t) => (g.some((x) => x.email === t) ? t : g[0]?.email ?? ''));
      });
  }, [source, k]);

  const send = async () => {
    if (!c) return;
    setBusy(true);
    setError('');
    const args = { p_cap: k, p_mode: mode, p_hours: mode === 'timed' ? hours : null, p_uses: mode === 'once' ? uses : null, p_scope: null, p_reason: reason };
    const r = source === 'chat' ? await rpc('chat_request_permission', { p_to: to, ...args }) : await rpc('request_capability', { ...args, p_source: source, p_source_ref: sourceRef ?? null });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    dispatch({ type: 'notify', text: source === 'chat' ? 'أُرسل الطلب بطاقةً في محادثتك معه.' : 'أُرسل الطلب. يصلك إشعار بالقرار.' });
    changed();
    onClose();
  };

  return (
    <Modal title="طلب صلاحية" onClose={onClose}>
      <div className="pm-dialog pq-ask">
        {fixed ? (
          <p className="pm-why">
            «{c!.label}» مقفلة بقواعد المركز ولا تُطلب: {c!.why}
          </p>
        ) : (
          <>
            <label>
              الصلاحية
              <select value={k} disabled={!!cap} onChange={(e) => setK(e.target.value)}>
                <option value="">اختر ما تحتاجه</option>
                {(cap && !options.some((o) => o.key === cap) ? [capability(cap)!, ...options] : options).filter(Boolean).map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="pm-modes" role="group" aria-label="لكم من الوقت">
              {(['timed', 'once', 'standing'] as Mode[]).map((m) => (
                <button type="button" key={m} aria-pressed={mode === m} className={mode === m ? 'on' : ''} disabled={m === 'once' && c?.scope === 'page'} onClick={() => setMode(m)}>
                  {MODE_AR[m]}
                </button>
              ))}
            </div>
            {mode === 'timed' && (
              <div className="pm-durs" role="group" aria-label="المدة">
                {REQUEST_HOURS.map((d) => (
                  <button type="button" key={d.h} aria-pressed={hours === d.h} className={hours === d.h ? 'on' : ''} onClick={() => setHours(d.h)}>
                    {d.label}
                  </button>
                ))}
              </div>
            )}
            {mode === 'once' && (
              <label>
                عدد المرات
                <input type="number" min={1} max={20} value={uses} onChange={(e) => setUses(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} />
              </label>
            )}
            {source === 'chat' && (
              <label>
                إلى
                <select value={to} onChange={(e) => setTo(e.target.value)}>
                  {!granters.length && <option value="">لا أحد يقرر فيها لك</option>}
                  {granters.map((g) => (
                    <option key={g.email} value={g.email}>
                      {g.display_name} · {roleAr(g.role)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              لماذا تحتاجها
              <textarea rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: أغطي النشر يومين أثناء إجازة الزميلة" />
            </label>
            {c && <p className="pm-preview">تطلب «{capLabel(k)}»{howAr(mode, hours, uses)}. القرار لمن يدير رتبتك ويملكها، وقد يعطيك أقل أو أكثر مما طلبت.</p>}
            {error && (
              <p className="warning" role="alert">
                {error}
              </p>
            )}
            <div className="actions">
              <button type="button" className="primary" disabled={busy || !c || !reason.trim() || (source === 'chat' && !to)} onClick={() => void send()}>
                <KeyRound />
                {source === 'chat' ? 'إرسال البطاقة' : 'إرسال الطلب'}
              </button>
              <button type="button" className="secondary" onClick={onClose}>
                إلغاء
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

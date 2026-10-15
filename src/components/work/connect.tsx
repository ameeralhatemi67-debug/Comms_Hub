'use client';
// Connecting an account through the platform's own sign-in (Readiness audit step 6): the person
// has signed in at Meta or TikTok and come back; this dialog shows what that sign-in can connect
// (names and ids only, never a token), takes who publishes on it, and links. The token stays on
// the server and goes into the vault. A simulated account on the same handle is upgraded in place.
import { useEffect, useState } from 'react';
import { Check, TriangleAlert } from 'lucide-react';
import { roles } from '@/lib/domain';
import { connErrorAr } from '@/lib/platforms/info';
import { platformLabels } from '@/lib/work/rules';
import { useWork } from './data';
import { Hint, Ic, Modal } from './parts';
import { staffOf } from './plan';

type Candidate = { platform: 'facebook' | 'instagram' | 'tiktok'; id: string; name: string; handle: string | null; parent: string | null; canPost?: boolean };
type Result = { platform: string; id: string; ok: boolean; account?: string; error?: string; missing?: string[] };
export const RECONNECT_KEY = 'hub_platform_reconnect';

const PROVIDER_AR = { meta: 'Meta (فيسبوك وإنستغرام)', tiktok: 'TikTok' } as const;

export function ConnectChooser({ provider, offer, onClose, onDone }: { provider: 'meta' | 'tiktok'; offer: string; onClose: () => void; onDone: () => void }) {
  const w = useWork();
  const [cands, setCands] = useState<Candidate[] | null>(null);
  const [err, setErr] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [purpose, setPurpose] = useState('');
  const [mode, setMode] = useState<'auto' | 'ask'>('auto');
  const [publishers, setPublishers] = useState<string[]>(() => w.people.filter((p) => p.role === 'publisher').map((p) => p.email));
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [reconnect, setReconnect] = useState<{ account: string; external_id: string } | null>(null);
  const staff = staffOf(w.people);
  const key = (c: Candidate) => `${c.platform}:${c.id}`;

  useEffect(() => {
    let live = true;
    let re: { account: string; external_id: string } | null = null;
    try {
      const raw = sessionStorage.getItem(RECONNECT_KEY);
      if (raw) re = JSON.parse(raw) as { account: string; external_id: string };
    } catch {
      // A private window: the dialog works without it.
    }
    void fetch(`/api/platforms/offer?id=${encodeURIComponent(offer)}`, { cache: 'no-store' })
      .then(async (r) => {
        const body = (await r.json()) as { candidates?: Candidate[]; error?: string };
        if (!live) return;
        if (!r.ok || !body.candidates) return setErr(body.error ?? 'تعذّر قراءة ما يمكن ربطه.');
        setCands(body.candidates);
        if (re) {
          const hit = body.candidates.find((c) => c.id === re!.external_id);
          if (hit) {
            setPicked([key(hit)]);
            setReconnect(re);
          }
        } else if (body.candidates.length === 1) setPicked([key(body.candidates[0])]);
      })
      .catch(() => live && setErr('تعذّر الوصول إلى الخادم.'));
    return () => {
      live = false;
    };
  }, [offer]);

  const send = async () => {
    if (!cands) return;
    setBusy(true);
    setErr('');
    try {
      const r = await fetch('/api/platforms/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offer,
          picks: cands.filter((c) => picked.includes(key(c))).map((c) => ({ platform: c.platform, id: c.id })),
          purpose,
          publishers,
          mode,
          account_id: reconnect?.account ?? null,
        }),
      });
      const body = (await r.json()) as { results?: Result[]; error?: string };
      if (!r.ok || !body.results) return setErr(body.error ?? 'تعذّر الربط.');
      setResults(body.results);
      try {
        sessionStorage.removeItem(RECONNECT_KEY);
      } catch {
        // Nothing to clear.
      }
      await w.reloadBase();
      if (body.results.every((x) => x.ok)) onDone();
    } catch {
      setErr('تعذّر الوصول إلى الخادم.');
    } finally {
      setBusy(false);
    }
  };

  const done = results && results.every((x) => x.ok);
  return (
    <Modal title={`ربط حسابات عبر ${PROVIDER_AR[provider]}`} onClose={onClose}>
      {err && (
        <Hint warn>
          {err}
        </Hint>
      )}
      {!cands && !err && <p className="wk-col-hint">جارٍ قراءة ما يمكن ربطه…</p>}
      {cands && !results && (
        <>
          <Hint>
            سجّلت الدخول عند المنصة نفسها. اختر ما يُربط: يُحفظ رمز كل حساب في خزنة الأسرار على الخادم وحده، ولا يظهر هنا ولا في أي صفحة. صلاحية الربط تأتي من المنصة وتنتهي بانتهاء رمزها.
          </Hint>
          {cands.length === 0 && (
            <Hint warn>لا صفحة ولا حساب يمكن ربطه بهذا الدخول. يلزم أن تدير صفحة فيسبوك، وأن يكون حساب إنستغرام احترافياً ومرتبطاً بها.</Hint>
          )}
          <div className="wk-pick" role="group" aria-label="ما يُربط">
            {cands.map((c) => (
              <label key={key(c)}>
                <input
                  type="checkbox"
                  checked={picked.includes(key(c))}
                  disabled={!!reconnect && reconnect.external_id !== c.id}
                  onChange={(e) => setPicked(e.target.checked ? [...picked, key(c)] : picked.filter((x) => x !== key(c)))}
                />
                {platformLabels[c.platform] ?? c.platform} · {c.name}
                {c.handle && <small className="ltr"> {c.handle}</small>}
                {c.parent && <small> · مرتبط بصفحة «{c.parent}»</small>}
              </label>
            ))}
          </div>
          {reconnect && <Hint>إعادة ربط حساب قائم: يبقى بأعماله واعتماداته، ويُستبدل رمزه.</Hint>}
          <label className="l">
            الغرض
            <input className="wk-inp" value={purpose} maxLength={200} onChange={(e) => setPurpose(e.target.value)} />
          </label>
          <div className="l">
            من ينشر عليها
            <div className="wk-pick">
              {staff.map((p) => (
                <label key={p.email}>
                  <input type="checkbox" checked={publishers.includes(p.email)} onChange={(e) => setPublishers(e.target.checked ? [...publishers, p.email] : publishers.filter((x) => x !== p.email))} />
                  {p.display_name} <small>{roles[p.role].name}</small>
                </label>
              ))}
            </div>
          </div>
          <div className="l">
            عند حلول موعد النشر
            <div className="wk-pick">
              <label>
                <input type="radio" name="cn-mode" checked={mode === 'auto'} onChange={() => setMode('auto')} />
                نشر تلقائي
              </label>
              <label>
                <input type="radio" name="cn-mode" checked={mode === 'ask'} onChange={() => setMode('ask')} />
                اسأل قبل النشر
              </label>
            </div>
          </div>
          <p className="wk-simnote">
            <Ic i={TriangleAlert} />
            <span>الربط حقيقي، أما النشر نفسه فما زال محاكاة: لا يصل شيء إلى المنصة بعد.</span>
          </p>
        </>
      )}
      {results && (
        <ul className="wk-pv-issues" aria-label="نتيجة الربط">
          {results.map((r) => (
            <li key={`${r.platform}:${r.id}`} className={r.ok ? '' : 'error'}>
              <Ic i={r.ok ? Check : TriangleAlert} />
              <span>
                <b>{platformLabels[r.platform] ?? r.platform}</b> {r.ok ? 'رُبط.' : (r.error ?? 'تعذّر الربط.')}
                {r.ok && r.missing?.length ? ` ينقصه ما يلزم للنشر (${r.missing.join('، ')}): يحتاج مراجعة التطبيق عند المنصة.` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="wk-row-acts">
        <button type="button" className="wk-btn quiet" onClick={onClose}>
          {results ? 'إغلاق' : 'تراجع'}
        </button>
        {!results && (
          <button type="button" className="wk-btn primary" disabled={busy || picked.length === 0 || (!reconnect && publishers.length === 0)} onClick={() => void send()}>
            {busy ? 'جارٍ الربط…' : `ربط ${picked.length || ''}`.trim()}
          </button>
        )}
        {results && !done && (
          <button type="button" className="wk-btn" onClick={() => setResults(null)}>
            عودة
          </button>
        )}
      </div>
    </Modal>
  );
}

/** The connection line of one account: real or simulated, its state, and when it was last asked. */
export function connLine(a: { conn_kind?: string; conn_state?: string; conn_checked_at?: string | null; conn_error?: string | null; external_name?: string | null }): { real: boolean; text: string; tone: '' | 'warn' | 'danger' | 'approved' } {
  if (a.conn_kind !== 'oauth') return { real: false, text: 'ربط محاكى', tone: '' };
  const when = a.conn_checked_at ? new Date(a.conn_checked_at).toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }) : 'لم يُفحص بعد';
  if (a.conn_state === 'needs_reconnect') return { real: true, text: `ربط حقيقي · يحتاج ربطاً من جديد${a.conn_error ? `: ${connErrorAr(a.conn_error)}` : ''}`, tone: 'danger' };
  if (a.conn_state === 'error') return { real: true, text: `ربط حقيقي · تعذّر الفحص${a.conn_error ? `: ${connErrorAr(a.conn_error)}` : ''} · ${when}`, tone: 'warn' };
  return { real: true, text: `ربط حقيقي · سليم · آخر فحص ${when}`, tone: 'approved' };
}

'use client';
// Connecting an account through the platform's own sign-in (Readiness audit step 6): the person
// has signed in at the platform and come back; this sheet, the last step of «إضافة حساب», shows what
// that sign-in can connect (names and ids only, never a token), starts from who usually publishes,
// and links. The token stays on the server and goes into the vault. A simulated account on the same
// handle is upgraded in place.
import { useEffect, useState } from 'react';
import { Check, TriangleAlert } from 'lucide-react';
import { roles } from '@/lib/domain';
import { connErrorAr } from '@/lib/platforms/info';
import { PROVIDER_NAME, type ConnProvider } from '@/lib/platforms/provider';
import { platformName, splitOffer } from '@/lib/platforms/setup';
import { platformInfo, platformLabels } from '@/lib/work/rules';
import { useWork } from './data';
import { PlatformTile } from '../platform-icon';
import { Sheet, SheetHead, SheetProgress, SheetSteps } from '../sheet';
import { Hint, Ic } from './parts';
import { staffOf } from './plan';

type Candidate = { platform: 'facebook' | 'instagram' | 'tiktok' | 'youtube' | 'linkedin' | 'x'; id: string; name: string; handle: string | null; parent: string | null; canPost?: boolean };
type Result = { platform: string; id: string; ok: boolean; account?: string; error?: string; missing?: string[] };
export const RECONNECT_KEY = 'hub_platform_reconnect';

const PROVIDER_AR: Record<ConnProvider, string> = {
  meta: 'Meta (فيسبوك وإنستغرام)',
  tiktok: PROVIDER_NAME.tiktok,
  google: 'Google (قنوات يوتيوب)',
  linkedin: PROVIDER_NAME.linkedin,
  x: PROVIDER_NAME.x,
  microsoft: PROVIDER_NAME.microsoft,
};
/** What to check when a sign-in offers nothing to connect, per provider. */
const EMPTY_AR: Record<ConnProvider, string> = {
  meta: 'لا صفحة ولا حساب يمكن ربطه بهذا الدخول. يلزم أن تدير صفحة فيسبوك، وأن يكون حساب إنستغرام احترافياً ومربوطاً بصفحة.',
  tiktok: 'لا حساب يمكن ربطه بهذا الدخول.',
  google: 'لا قناة يوتيوب لهذا الحساب. أنشئ قناة على يوتيوب بهذا الحساب أولاً ثم أعد الربط.',
  linkedin: 'لا ملف يمكن ربطه بهذا الدخول.',
  x: 'لا حساب يمكن ربطه بهذا الدخول.',
  microsoft: 'لا شيء يُربط من هنا: يُربط OneDrive من «الإعدادات» ثم «الاتصالات».',
};

/** Who publishes on a new account unless changed: the publishers, or the person connecting it if there are none. */
export const defaultPublishers = (people: { email: string; role: string }[], me: string) => {
  const list = people.filter((p) => p.role === 'publisher').map((p) => p.email);
  return list.length ? list : [me];
};

export function ConnectChooser({ provider, offer, onClose, onDone }: { provider: ConnProvider; offer: string; onClose: () => void; onDone: () => void }) {
  const w = useWork();
  const [cands, setCands] = useState<Candidate[] | null>(null);
  const [away, setAway] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [purpose, setPurpose] = useState('');
  const [mode, setMode] = useState<'auto' | 'ask'>('auto');
  const [publishers, setPublishers] = useState<string[]>(() => defaultPublishers(w.people, w.me));
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
        const offered = splitOffer(body.candidates, platformInfo);
        setCands(offered.can);
        setAway(offered.away);
        if (re) {
          const hit = offered.can.find((c) => c.id === re!.external_id);
          if (hit) {
            setPicked([key(hit)]);
            setReconnect(re);
          }
        } else if (offered.can.length === 1) setPicked([key(offered.can[0])]);
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
          // A reconnection keeps the account as it is.
          publishers: reconnect ? [] : publishers,
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
  const names = publishers.map(w.nameOf).join('، ') || 'لا أحد';
  return (
    <Sheet label={`ربط حسابات عبر ${PROVIDER_AR[provider]}`} onClose={onClose}>
      <SheetHead tile={<PlatformTile k={provider === 'google' ? 'youtube' : provider === 'meta' ? 'instagram' : provider} />} title={`ربط حسابات عبر ${PROVIDER_AR[provider]}`} sub="سجّلت الدخول عند المنصة نفسها. بقي أن تختار." onClose={onClose} />
      <SheetProgress at="الخطوة 3 من 3" pct={results ? 100 : 80} />
      <div className="pf-body">
        <SheetSteps
          steps={[
            { id: 'platform', t: 'اختر المنصة', done: true },
            { id: 'signin', t: 'سجّل الدخول عند المنصة', done: true },
            { id: 'choose', t: 'اختر الحسابات', b: 'يُحفظ رمز كل حساب في خزنة الأسرار على الخادم وحده، ولا يظهر هنا ولا في أي صفحة. صلاحية الربط تأتي من المنصة وتنتهي بانتهاء رمزها.', done: Boolean(done) },
          ]}
          at="choose"
        />
        <div className="pf-input">
          {err && (
            <Hint warn>
              {err}
            </Hint>
          )}
          {!cands && !err && <p className="wk-col-hint">جارٍ قراءة ما يمكن ربطه…</p>}
          {cands && !results && (
            <>
              <span className="pf-eyebrow">الخطوة الأخيرة</span>
              <h3>اختر ما يُربط</h3>
              {cands.length === 0 && away.length === 0 && (
                <Hint warn>{EMPTY_AR[provider]}</Hint>
              )}
              {away.length > 0 && <Hint>لم تظهر هنا {away.map((k) => platformName(k, platformInfo)).join('، ')}: لا تُربط قبل أن تُضاف وتُفعّل من «المنصات».</Hint>}
              <div className="wk-pick" role="group" aria-label="ما يُربط">
                {cands.map((c) => (
                  <label key={key(c)}>
                    <input
                      type="checkbox"
                      checked={picked.includes(key(c))}
                      disabled={!!reconnect && reconnect.external_id !== c.id}
                      onChange={(e) => setPicked(e.target.checked ? [...picked, key(c)] : picked.filter((x) => x !== key(c)))}
                    />
                    {platformLabels[c.platform] ?? c.platform} · <bdi>{c.name}</bdi>
                    {c.handle && c.handle !== c.name && <small className="ltr"> {c.handle}</small>}
                    {c.parent && <small> · مرتبط بصفحة «{c.parent}»</small>}
                  </label>
                ))}
              </div>
              {reconnect ? (
                <Hint>إعادة ربط حساب قائم: يبقى بأعماله واعتماداته، ويُستبدل رمزه.</Hint>
              ) : (
                <>
                  <dl className="pf-facts">
                    <div>
                      <dt>من ينشر عليها</dt>
                      <dd>{names}</dd>
                    </div>
                    <div>
                      <dt>عند الموعد</dt>
                      <dd>{mode === 'ask' ? 'اسأل قبل النشر' : 'نشر تلقائي'}</dd>
                    </div>
                  </dl>
                  <details className="pf-more">
                    <summary>تغيير هذه الخيارات</summary>
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
                    <label className="l">
                      الغرض
                      <input className="wk-inp" value={purpose} maxLength={200} onChange={(e) => setPurpose(e.target.value)} />
                    </label>
                  </details>
                </>
              )}
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
        </div>
      </div>
    </Sheet>
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

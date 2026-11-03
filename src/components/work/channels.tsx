'use client';
// «حسابات المنصات» (MVP_draft.md section 67), after «النموذج المرجعي للمركز» version 5: the department's accounts on each
// platform (several per platform, YouTube for video only), who publishes on each, and whether it publishes by itself or
// asks first. What needs someone comes first; each account is one line, and everything else about it opens in a sheet.
// The director, the assistant and the administrator add, edit, stop and delete accounts; the publisher reconnects them.
// An account is added through the platform's own sign-in, and the site never asks for a password. A simulated account
// connects to nothing, for trying a platform that is not set up, and an authorisation runs 60 days. Approval binds to
// the account and its handle, so renaming a handle re-opens «المنصات والحسابات» (account_save), and an account in use by
// approved, scheduled or in-review work cannot be stopped or deleted. Publishing works is a simulation; a YouTube or an
// Instagram account's sheet alone publishes a real test (youtube-test.tsx and instagram-test.tsx, MVP_draft.md 71 and 72).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SetupGuide } from '../setup-guide';
import { ChevronLeft, Film, Link2, Lock, Pencil, Plus, RefreshCw, Trash2, TriangleAlert, Unplug, Users } from 'lucide-react';
import { roles } from '@/lib/domain';
import { HOLD } from '@/lib/kit/hold-reasons';
import { supabase } from '@/lib/supabase/client';
import { GUIDES } from '@/lib/setup-guides';
import { accountName, accountState, countOf, isLead, canPublish, platformLabels, statusLabels, VIDEO_ONLY, WORKS, type AccountRow, type Platform, type PlatformInfo } from '@/lib/work/rules';
import { connErrorAr } from '@/lib/platforms/info';
import { APP_INTEGRATION_TYPE, CONN_PROVIDERS, PROVIDER_NAME, providerOf, type ConnProvider } from '@/lib/platforms/provider';
import { PlatformTile } from '../platform-icon';
import { Sheet, SheetHead, SheetProgress, SheetSteps } from '../sheet';
import { useWork, useWorkList, type ListItem } from './data';
import { ConnectChooser, RECONNECT_KEY, connLine, defaultPublishers } from './connect';
import { Empty, Hint, Ic, Modal } from './parts';
import { staffOf } from './plan';
import { InstagramTest } from './instagram-test';
import { YouTubeTest } from './youtube-test';

const LOCKING = ['APPROVED', 'SCHEDULED', 'IN_REVIEW'];
/** A platform's own state, beside its name, when it is not simply working. */
const groupNote = (info: PlatformInfo): [string, string] | null => {
  if (!info.enabled) return ['موقوفة', 'off'];
  if (info.publish_mode === 'manual' && !providerOf(info.key)) return ['نشر يدوي', 'man'];
  return null;
};

export function ChannelsPage({ initialOpen }: { /** Draws an account's sheet without a click (qa). */ initialOpen?: string } = {}) {
  const w = useWork();
  const { items, reload } = useWorkList();
  const mgr = isLead(w.role);
  const pub = canPublish(w.role);
  const [dlg, setDlg] = useState<{ t: 'edit'; a: AccountRow | null } | { t: 'delete'; a: AccountRow } | null>(null);
  const [viewing, setViewing] = useState<string | null>(initialOpen ?? null);
  const [adding, setAdding] = useState<{ platform?: Platform } | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [ready, setReady] = useState<Record<string, string> | null>(null);
  const [choose, setChoose] = useState<{ provider: ConnProvider; offer: string } | null>(null);
  const [connNote, setConnNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const router = useRouter();
  const params = useSearchParams();
  const checked = useRef(false);
  const nowIso = useMemo(() => new Date().toISOString(), []);

  // Back from the platform's sign-in: open the chooser, or say why it did not complete.
  useEffect(() => {
    const provider = params.get('connect');
    const offer = params.get('offer');
    const error = params.get('connect_error');
    if (provider && offer && (CONN_PROVIDERS as readonly string[]).includes(provider)) {
      setChoose({ provider: provider as ConnProvider, offer });
      router.replace('/channels');
    } else if (error) {
      setConnNote({ ok: false, text: connErrorAr(error) || 'لم يكتمل الربط.' });
      router.replace('/channels');
    }
  }, [params, router]);

  // No background worker: whoever opens this page asks the platforms about the accounts that were
  // not asked in the last half hour. The answer is recorded by the server and read back.
  useEffect(() => {
    if (checked.current || w.status !== 'ready' || !(mgr || pub)) return;
    if (!w.accounts.some((a) => a.conn_kind === 'oauth')) return;
    checked.current = true;
    void fetch('/api/platforms/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then((r) => r.json() as Promise<{ checked?: number }>)
      .then((b) => (b.checked ? w.reloadBase() : undefined))
      .catch(() => undefined);
  }, [w, mgr, pub]);

  // Which apps are ready, so nobody is sent to a sign-in that cannot work. Before its migration nothing is known,
  // and the sign-in itself says so.
  useEffect(() => {
    if (!mgr) return;
    void supabase()
      .rpc('platform_ready')
      .then(({ data, error }) => {
        if (!error) setReady((data ?? {}) as Record<string, string>);
      });
  }, [mgr]);

  const checkNow = async (a: AccountRow) => {
    setChecking(true);
    try {
      const r = await fetch('/api/platforms/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: a.id }) });
      const b = (await r.json()) as { results?: { state: string | null; error: string | null }[]; error?: string };
      const one = b.results?.[0];
      setConnNote(one?.state === 'connected' ? { ok: true, text: `${accountName(a)}: الاتصال سليم.` } : { ok: false, text: `${accountName(a)}: ${connErrorAr(one?.error) || b.error || 'تعذّر الفحص.'}` });
      await w.reloadBase();
    } catch {
      setConnNote({ ok: false, text: 'تعذّر الوصول إلى الخادم.' });
    } finally {
      setChecking(false);
    }
  };
  const startConnect = (provider: ConnProvider, a?: AccountRow) => {
    try {
      if (a?.external_id) sessionStorage.setItem(RECONNECT_KEY, JSON.stringify({ account: a.id, external_id: a.external_id }));
      else sessionStorage.removeItem(RECONNECT_KEY);
    } catch {
      // Without session storage a reconnect still links by handle.
    }
    window.location.href = `/api/platforms/connect/${provider}`;
  };
  const disconnect = async (a: AccountRow) => {
    const r = await fetch('/api/platforms/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: a.id }) });
    if (!r.ok) return w.say('تعذّر فصل الحساب.');
    w.say(`فُصل ${accountName(a)}: دُمّر رمزه وانتهى تفويضه. أعد الربط ليعود.`);
    await Promise.all([w.reloadBase(), reload()]);
  };
  // Every platform of the registry that is on or has accounts: social ones in registry order, the shared mailbox last.
  const sections = useMemo(() => {
    const has = new Set(w.accounts.map((a) => a.platform));
    const live = w.platforms.filter((p) => has.has(p.key));
    return [...live.filter((p) => p.kind === 'social').sort((a, b) => a.sort - b.sort), ...live.filter((p) => p.kind === 'mail')];
  }, [w.platforms, w.accounts]);
  const useOf = (id: string) => items.filter((x) => !x.w.closed_at && x.w.channels.includes(id) && !['PUBLISHED', 'PARTIAL', 'FAILED', 'PUBLISHING'].includes(x.w.status));
  const act = async (fn: string, args: Record<string, unknown>, ok: string) => {
    const r = await w.call(fn, args);
    if (!r.ok) {
      w.say(r.error);
      return false;
    }
    w.say(ok);
    await Promise.all([w.reloadBase(), reload()]);
    return true;
  };
  const reconnect = (a: AccountRow) => {
    const provider = providerOf(a.platform);
    if (a.conn_kind === 'oauth' && provider) return startConnect(provider, a);
    void act('account_reconnect', { p_id: a.id }, `أُعيد ربط ${accountName(a)} 60 يوماً (محاكاة).`);
  };
  if (!mgr && !pub)
    return (
      <div className="wk">
        <Empty i={Lock} title="حسابات المنصات لمن يديرها وينشر عليها">
          يديرها مدير الاتصال ومساعده والمسؤول عن النظام، ويعيد ربطها مسؤول النشر.
        </Empty>
      </div>
    );

  const attention = w.accounts
    .filter((a) => a.active && a.platform !== 'mail')
    .map((a) => {
      const [label, cls] = accountState(a, nowIso);
      const scheduled = items.filter((x) => !x.w.closed_at && x.w.status === 'SCHEDULED' && x.w.channels.includes(a.id)).length;
      const reason = a.conn_state === 'needs_reconnect' ? connErrorAr(a.conn_error) || label : a.conn_state === 'error' ? connErrorAr(a.conn_error) || label : label;
      return { a, cls, why: `${reason}${scheduled ? ` يعتمد عليه ${countOf(scheduled, WORKS)} مجدول.` : ''}` };
    })
    .filter((x) => x.cls === 'danger' || x.cls === 'warn');
  const social = w.accounts.filter((a) => a.platform !== 'mail');
  const shownSections = sections.filter((s) => filter === 'all' || s.key === filter);
  const current = viewing ? w.accounts.find((a) => a.id === viewing) : undefined;

  return (
    <div className="wk">
      <div className="wk-head">
        <div>
          <h1>حسابات المنصات</h1>
          <p>الحسابات التي ننشر عليها، ومن ينشر على كل حساب.</p>
        </div>
        {mgr && (
          <div className="wk-acts">
            <button type="button" className="wk-btn gold" onClick={() => setAdding({})}>
              <Ic i={Plus} />
              إضافة حساب
            </button>
          </div>
        )}
      </div>
      <p className="wk-simnote">
        <Ic i={TriangleAlert} />
        <span>الربط حقيقي، أما نشر الأعمال فما زال محاكاة: لا يصل منها شيء إلى المنصة بعد. وحدها «تجربة النشر» في حسابات يوتيوب وإنستغرام تنشر شيئاً حقيقياً.</span>
      </p>
      {connNote && (
        <p className={connNote.ok ? 'wk-simnote' : 'wk-err'} role="status">
          {connNote.text}
        </p>
      )}
      {!mgr && <Hint i={Users}>إضافة الحسابات وتعديلها وحذفها لمدير الاتصال ومساعده والمسؤول عن النظام. لك إعادة ربط الحسابات.</Hint>}
      {w.status === 'loading' ? (
        <div className="wk-loading" role="status">
          جارٍ التحميل…
        </div>
      ) : (
        <>
          {attention.length > 0 && (
            <section className="ac-attn" aria-label="يحتاج انتباهك">
              <h2>يحتاج انتباهك</h2>
              {attention.map(({ a, why }) => (
                <div className="ac-attn-row" key={a.id}>
                  <PlatformTile k={a.platform} />
                  <div className="ac-attn-text">
                    <b>{accountName(a)}</b>
                    <small>{why}</small>
                  </div>
                  <button type="button" className="wk-btn sm" onClick={() => reconnect(a)}>
                    <Ic i={RefreshCw} />
                    إعادة الربط
                  </button>
                </div>
              ))}
            </section>
          )}
          {sections.length > 1 && (
            <div className="ac-filters" role="group" aria-label="تصفية حسب المنصة">
              <button type="button" className={filter === 'all' ? 'on' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
                الكل {w.accounts.length}
              </button>
              {sections.map((s) => (
                <button type="button" key={s.key} className={filter === s.key ? 'on' : ''} aria-pressed={filter === s.key} onClick={() => setFilter(s.key)}>
                  {platformLabels[s.key]} {w.accounts.filter((a) => a.platform === s.key).length}
                </button>
              ))}
            </div>
          )}
          {social.length === 0 && mgr && (
            <Empty i={Link2} title="لا حسابات بعد">
              أضف أول حساب بتسجيل الدخول عند المنصة نفسها.
            </Empty>
          )}
          {shownSections.map((info) => {
            const pl = info.key;
            const list = w.accounts.filter((a) => a.platform === pl);
            const note = groupNote(info);
            return (
              <section className="ac-group" data-gd={`plat-${pl}`} key={pl} aria-label={platformLabels[pl]}>
                <div className="ac-group-head">
                  <PlatformTile k={pl} />
                  <h3>
                    {platformLabels[pl]} <span className="n">{list.length}</span>
                  </h3>
                  {note && <span className={`pf-chip ${note[1]}`}>{note[0]}</span>}
                  {info.kind === 'social' && (providerOf(pl) || info.publish_mode === 'manual') && (
                    <SetupGuide guide={providerOf(pl) ? `connect_${providerOf(pl)}` : 'manual'} label={providerOf(pl) ? 'كيف تربط حسابك' : 'كيف يُنشر على هذه المنصة'} />
                  )}
                  {mgr && info.enabled && info.kind === 'social' && (
                    <button type="button" className="wk-btn sm quiet ac-more" onClick={() => setAdding({ platform: pl })}>
                      <Ic i={Plus} />
                      حساب آخر
                    </button>
                  )}
                </div>
                {info.kind === 'social' && info.publish_mode === 'manual' && (
                  <p className="ac-manual">مسار يدوي: يُنشر من تطبيقها بحزمة جاهزة، ثم يؤكد مسؤول النشر أنه نُشر.</p>
                )}
                <div className="ac-cols" aria-hidden="true">
                  <span>الحساب</span>
                  <span>الحالة</span>
                  <span>من ينشر عليه</span>
                  <span>عند الموعد</span>
                  <span>يستخدمه</span>
                  <span />
                </div>
                {list.map((a) => {
                  const [label, cls] = accountState(a, nowIso);
                  const use = useOf(a.id);
                  const c = a.platform !== 'mail' ? connLine(a) : null;
                  // Green says connected: an account that reaches nothing says what it is unless it needs someone.
                  const reachesNothing = c !== null && !c.real && cls === 'approved';
                  const manual = c !== null && !providerOf(a.platform);
                  const who = a.platform === 'mail' ? 'مسؤول النشر عند الإرسال' : a.publishers.map(w.nameOf).join('، ') || 'لا أحد';
                  const mode = a.mode === 'ask' ? 'اسأل قبل النشر' : 'نشر تلقائي';
                  const works = use.length ? countOf(use.length, WORKS) : 'لا أعمال حالية';
                  return (
                    <button type="button" className={`ac-row ${a.active ? '' : 'off'}`} key={a.id} data-account={a.id} data-conn={c ? (c.real ? 'oauth' : 'simulated') : undefined} onClick={() => setViewing(a.id)}>
                      <span className="ac-name">
                        <b>{a.label}</b>
                        <small className="handle">{a.platform === 'mail' ? 'صندوق القسم المشترك' : <bdi>{a.handle}</bdi>}</small>
                      </span>
                      <span className="ac-state">{reachesNothing ? <span className={`pf-chip ${manual ? 'man' : 'none'}`}>{manual ? 'نشر يدوي' : 'ربط محاكى'}</span> : <span className={`wk-chip ${cls}`}>{label}</span>}</span>
                      <span className="ac-col">{who}</span>
                      <span className="ac-col">{mode}</span>
                      <span className="ac-col">{works}</span>
                      <span className="ac-meta">
                        {who} · {mode} · {works}
                      </span>
                      <ChevronLeft className="ac-chev" aria-hidden="true" />
                    </button>
                  );
                })}
              </section>
            );
          })}
        </>
      )}
      {current && (
        <AccountSheet
          a={current}
          use={useOf(current.id)}
          nowIso={nowIso}
          mgr={mgr}
          pub={pub}
          checking={checking}
          onClose={() => setViewing(null)}
          onCheck={() => void checkNow(current)}
          onReconnect={() => reconnect(current)}
          onDisconnect={() => void disconnect(current)}
          onEdit={() => setDlg({ t: 'edit', a: current })}
          onDelete={() => setDlg({ t: 'delete', a: current })}
          act={act}
        />
      )}
      {adding && (
        <AddAccountSheet
          first={adding.platform}
          ready={ready}
          onClose={() => setAdding(null)}
          onConnect={startConnect}
          onSimulated={() => {
            setAdding(null);
            setDlg({ t: 'edit', a: null });
          }}
          act={act}
        />
      )}
      {choose && (
        <ConnectChooser
          provider={choose.provider}
          offer={choose.offer}
          onClose={() => setChoose(null)}
          onDone={() => {
            setChoose(null);
            void Promise.all([w.reloadBase(), reload()]);
          }}
        />
      )}
      {dlg?.t === 'edit' && <AccountDialog a={dlg.a} use={dlg.a ? useOf(dlg.a.id).filter((x) => LOCKING.includes(x.w.status)) : []} onClose={() => setDlg(null)} act={act} />}
      {dlg?.t === 'delete' && (
        <DeleteDialog
          a={dlg.a}
          use={useOf(dlg.a.id)}
          onClose={() => {
            setDlg(null);
            if (!w.accounts.some((x) => x.id === dlg.a.id)) setViewing(null);
          }}
          act={act}
        />
      )}
    </div>
  );
}

type Act = (fn: string, args: Record<string, unknown>, ok: string) => Promise<boolean>;

/** One account: what it is on the right, its connection beside it, and what is rarely needed folded. */
function AccountSheet({
  a,
  use,
  nowIso,
  mgr,
  pub,
  checking,
  onClose,
  onCheck,
  onReconnect,
  onDisconnect,
  onEdit,
  onDelete,
  act,
}: {
  a: AccountRow;
  use: ListItem[];
  nowIso: string;
  mgr: boolean;
  pub: boolean;
  checking: boolean;
  onClose: () => void;
  onCheck: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  act: Act;
}) {
  const w = useWork();
  const [label, cls] = accountState(a, nowIso);
  const c = a.platform !== 'mail' ? connLine(a) : null;
  const oauth = a.conn_kind === 'oauth';
  const locked = use.filter((x) => LOCKING.includes(x.w.status));
  return (
    <Sheet label={accountName(a)} onClose={onClose}>
      <SheetHead tile={<PlatformTile k={a.platform} />} title={accountName(a)} sub={a.platform === 'mail' ? 'صندوق القسم المشترك' : <bdi>{a.handle}</bdi>} chip={<span className={`wk-chip ${cls}`}>{label}</span>} onClose={onClose} />
      <div className="pf-body">
        <div className="pf-input">
          <span className="pf-eyebrow">الحساب</span>
          <h3>{a.label}</h3>
          <dl className="pf-facts">
            <div>
              <dt>ينشر عليه</dt>
              <dd>{a.platform === 'mail' ? 'مسؤول النشر عند الإرسال' : a.publishers.map(w.nameOf).join('، ') || 'لا أحد'}</dd>
            </div>
            <div>
              <dt>عند الموعد</dt>
              <dd>{a.mode === 'ask' ? 'اسأل قبل النشر' : 'نشر تلقائي'}</dd>
            </div>
            {a.purpose && (
              <div>
                <dt>الغرض</dt>
                <dd>{a.purpose}</dd>
              </div>
            )}
            <div>
              <dt>يستخدمه</dt>
              <dd>{use.length ? `${countOf(use.length, WORKS)}: ${use.slice(0, 3).map((x) => x.w.id).join('، ')}${use.length > 3 ? '…' : ''}` : 'لا أعمال حالية'}</dd>
            </div>
          </dl>
          {VIDEO_ONLY.includes(a.platform) && (
            <p className="ytn">
              <Ic i={Film} />{' '}
              {a.platform === 'youtube' ? 'يقبل الفيديو فقط: الطويل وShorts. لكل منشور عنوان ووصف وصورة مصغّرة وخصوصية (عام، غير مدرج، خاص).' : 'يقبل الفيديو فقط: لا يُرسل إليه عمل بلا فيديو.'}
            </p>
          )}
          {mgr && (
            <div className="pf-acts">
              <button type="button" className="wk-btn" onClick={onEdit}>
                <Ic i={Pencil} />
                تعديل
              </button>
            </div>
          )}
        </div>
        <div className="pf-side pf-info">
          <h3>الربط</h3>
          {c ? (
            <p className={`wk-conn ${c.tone}`} data-conn={c.real ? 'oauth' : 'simulated'}>
              {c.text}
              {c.real && a.external_name ? ` · ${a.external_name}` : ''}
            </p>
          ) : (
            <p className="muted">البريد لا يحتاج ربطاً: يُضبط صندوق القسم من «الإعدادات».</p>
          )}
          {(mgr || pub) && a.platform !== 'mail' && (
            <div className="pf-acts">
              {oauth && (
                <button type="button" className="wk-btn sm" disabled={checking} onClick={onCheck}>
                  <Ic i={RefreshCw} />
                  فحص الاتصال
                </button>
              )}
              <button type="button" className="wk-btn sm" onClick={onReconnect}>
                <Ic i={oauth ? Link2 : RefreshCw} />
                {oauth ? 'إعادة الربط عبر المنصة' : 'إعادة الربط'}
              </button>
            </div>
          )}
          {a.platform === 'youtube' && oauth && (mgr || (pub && a.publishers.includes(w.me))) && <YouTubeTest a={a} onReconnect={onReconnect} />}
          {a.platform === 'instagram' && oauth && (mgr || (pub && a.publishers.includes(w.me))) && <InstagramTest a={a} onReconnect={onReconnect} />}
          {mgr && !a.fixed && (
            <details className="pf-more">
              <summary>خيارات أخرى</summary>
              {locked.length > 0 && <Hint i={Lock}>يستخدمه عمل قائم، فلا يُوقف ولا يُحذف. انقل الأعمال إلى حساب آخر أولاً.</Hint>}
              <div className="pf-acts">
                {oauth && a.conn_state !== 'needs_reconnect' && (
                  <button type="button" className="wk-btn sm quiet" data-hold={HOLD.accountDisconnect} onClick={onDisconnect}>
                    <Ic i={Unplug} />
                    فصل
                  </button>
                )}
                <button
                  type="button"
                  className="wk-btn sm quiet"
                  onClick={() => void act('account_set_active', { p_id: a.id, p_active: !a.active }, a.active ? `أُوقف ${accountName(a)}.` : `فُعّل ${accountName(a)}.`)}
                >
                  {a.active ? 'إيقاف' : 'تفعيل'}
                </button>
                <button type="button" className="wk-btn sm quiet danger" onClick={onDelete}>
                  <Ic i={Trash2} />
                  حذف
                </button>
              </div>
            </details>
          )}
        </div>
      </div>
    </Sheet>
  );
}

const CONNECT_STEPS = [
  { id: 'platform', t: 'اختر المنصة', b: 'تظهر هنا المنصات المفعّلة. ما لم يكتمل إعداده يُكمل من «المنصات».' },
  { id: 'signin', t: 'سجّل الدخول عند المنصة', b: 'هناك فقط تُكتب كلمة المرور، عند المنصة نفسها. يعود الموقع برمز يُحفظ في الخزنة.' },
  { id: 'choose', t: 'اختر الحسابات', b: 'تظهر الحسابات التي يديرها من سجّل الدخول، فتختار ما يُربط.' },
];
const MANUAL_STEPS = [CONNECT_STEPS[0], { id: 'signin', t: 'سمِّ الحساب', b: 'لا تسجيل دخول هنا: يُنشر على هذه المنصة من تطبيقها بحزمة جاهزة.' }];
/** How many accounts one sign-in can bring: Meta several, the others one (MVP_draft.md 67.3). */
const ONE_AT_A_TIME: Partial<Record<ConnProvider, string>> = {
  google: 'لكل قناة دخول مستقل: اختر القناة عند Google، ولربط أخرى أعد هذه الخطوة.',
  tiktok: 'كل دخول يربط حساباً واحداً: لربط آخر سجّل خروجك من TikTok ثم أعد هذه الخطوة.',
  x: 'كل دخول يربط حساباً واحداً: لربط آخر سجّل خروجك من X ثم أعد هذه الخطوة.',
  linkedin: 'يربط الموقع شخصاً لا صفحة شركة: كل دخول يربط ملفاً واحداً.',
};

/** «إضافة حساب»: the hard work was done in «المنصات»; here it is one sign-in and a choice. */
function AddAccountSheet({ first, ready, onClose, onConnect, onSimulated, act }: { first?: Platform; ready: Record<string, string> | null; onClose: () => void; onConnect: (p: ConnProvider) => void; onSimulated: () => void; act: Act }) {
  const w = useWork();
  const offered = w.platforms.filter((p) => p.kind === 'social' && p.enabled).sort((x, y) => x.sort - y.sort);
  const [platform, setPlatform] = useState<Platform | null>(first ?? null);
  const [label, setLabel] = useState('');
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const provider = platform ? providerOf(platform) : null;
  const manual = Boolean(platform) && !provider;
  const appReady = (p: ConnProvider) => (ready ? Boolean(ready[APP_INTEGRATION_TYPE[p]]) : true);
  const at = platform ? 'signin' : 'platform';
  const steps = (manual ? MANUAL_STEPS : CONNECT_STEPS).map((s) => ({ ...s, done: s.id === 'platform' && Boolean(platform) }));
  const addManual = async () => {
    setBusy(true);
    const publishers = defaultPublishers(w.people, w.me);
    const ok = await act('account_save', { p_id: null, p: { platform, label: label.trim(), handle: handle.trim(), purpose: '', publishers, mode: 'ask' } }, `أُضيف حساب ${platformLabels[platform as Platform] ?? ''}.`);
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Sheet label="إضافة حساب" onClose={onClose}>
      <SheetHead title="إضافة حساب" sub="الإعداد الصعب تم في «المنصات». هنا تسجيل دخول واحد واختيار." onClose={onClose} />
      <SheetProgress at={`الخطوة ${steps.findIndex((s) => s.id === at) + 1} من ${steps.length}`} pct={platform ? 40 : 10} />
      <div className="pf-body">
        <SheetSteps steps={steps} at={at} />
        <div className="pf-input">
          {at === 'platform' && (
            <>
              <span className="pf-eyebrow">الخطوة الأولى</span>
              <h3>على أي منصة الحساب؟</h3>
              {offered.map((p: PlatformInfo) => {
                const prov = providerOf(p.key);
                const blocked = prov ? !appReady(prov) : false;
                return blocked ? (
                  <div className="ac-pick off" key={p.key}>
                    <PlatformTile k={p.key} />
                    <span className="ac-pick-text">
                      <b>{p.label_ar}</b>
                      <small>الإعداد لم يكتمل</small>
                    </span>
                    <a className="pf-btn" href="/settings?tab=platforms">
                      إكمال الإعداد
                    </a>
                  </div>
                ) : (
                  <button type="button" className="ac-pick" key={p.key} data-platform={p.key} onClick={() => setPlatform(p.key)}>
                    <PlatformTile k={p.key} />
                    <span className="ac-pick-text">
                      <b>{p.label_ar}</b>
                      <small>{prov ? `تسجيل دخول عبر ${PROVIDER_NAME[prov]}` : 'نشر يدوي: بلا تسجيل دخول'}</small>
                    </span>
                    <ChevronLeft className="ac-chev" aria-hidden="true" />
                  </button>
                );
              })}
              <a className="pf-link" href="/settings?tab=platforms">
                منصة غير موجودة هنا؟ تُضاف من «المنصات»
              </a>
              <details className="pf-more">
                <summary>حساب تجريبي بلا ربط</summary>
                <p className="muted">لتجربة منصة لم تُجهَّز بعد: يظهر في الأعمال بعلامة «ربط محاكى» ولا يتصل بشيء.</p>
                <div className="pf-acts">
                  <button type="button" className="pf-btn" onClick={onSimulated}>
                    إضافة حساب تجريبي
                  </button>
                </div>
              </details>
            </>
          )}
          {at === 'signin' && provider && (
            <>
              <span className="pf-eyebrow">{platformLabels[platform as Platform]}</span>
              <h3>سجّل الدخول عند {PROVIDER_NAME[provider]}</h3>
              <p>تنتقل إلى صفحة المنصة وتسجّل دخولك هناك، ثم تعود إلى هنا لتختار. لا يطلب الموقع كلمة مرورك أبداً.</p>
              <div className="pf-acts">
                <button type="button" className="pf-btn pri" onClick={() => onConnect(provider)}>
                  <Link2 aria-hidden="true" />
                  ربط عبر {PROVIDER_NAME[provider]}
                </button>
                {!first && (
                  <button type="button" className="pf-btn ghost" onClick={() => setPlatform(null)}>
                    السابق
                  </button>
                )}
              </div>
              {ONE_AT_A_TIME[provider] && <p className="pf-note info">{ONE_AT_A_TIME[provider]}</p>}
              {provider === 'meta' && <p className="pf-note info">دخول واحد يعطي كل الحسابات التي تختارها من حافظة أعمال واحدة. والحساب في حافظة أخرى يحتاج دخولاً مستقلاً.</p>}
              {GUIDES[`connect_${provider}`] && (
                <details className="pf-more">
                  <summary>إن لم يكتمل الدخول</summary>
                  <ul className="pf-list">
                    {GUIDES[`connect_${provider}`].notes?.filter((n) => !n.includes('محاكاة')).map((n) => <li key={n}>{n}</li>)}
                  </ul>
                </details>
              )}
            </>
          )}
          {at === 'signin' && manual && (
            <>
              <span className="pf-eyebrow">{platformLabels[platform as Platform]}</span>
              <h3>سمِّ الحساب</h3>
              <label className="pf-f">
                الاسم في المركز <small>مثلاً: الرسمي، الفعاليات</small>
                <input value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
              </label>
              <label className="pf-f">
                اسم الحساب على المنصة
                <input className="ltr" value={handle} maxLength={120} onChange={(e) => setHandle(e.target.value)} />
              </label>
              <div className="pf-acts">
                <button type="button" className="pf-btn pri" disabled={busy || !label.trim() || !handle.trim()} onClick={() => void addManual()}>
                  إضافة
                </button>
                {!first && (
                  <button type="button" className="pf-btn ghost" onClick={() => setPlatform(null)}>
                    السابق
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Sheet>
  );
}

export function AccountDialog({ a, use, onClose, act }: { a: AccountRow | null; use: ListItem[]; onClose: () => void; act: Act }) {
  const w = useWork();
  const edit = !!a;
  const offered = w.platforms.filter((p) => p.kind === 'social' && p.enabled).sort((x, y) => x.sort - y.sort);
  const [platform, setPlatform] = useState<Platform>(a?.platform ?? offered[0]?.key ?? 'instagram');
  const [label, setLabel] = useState(a?.label ?? '');
  const [handle, setHandle] = useState(a?.handle ?? '');
  const [purpose, setPurpose] = useState(a?.purpose ?? '');
  const [publishers, setPublishers] = useState<string[]>(a?.publishers ?? w.people.filter((p) => p.role === 'publisher').map((p) => p.email));
  const [mode, setMode] = useState<'auto' | 'ask'>(a?.mode ?? 'auto');
  const staff = staffOf(w.people);
  const renamed = edit && handle.trim() !== (a?.handle ?? '');
  return (
    <Modal title={edit ? 'تعديل الحساب' : 'إضافة حساب تجريبي'} onClose={onClose}>
      {!edit && (
        <label className="l">
          المنصة
          <select className="wk-inp" value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
            {offered.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label_ar}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="wk-two">
        <label className="l">
          الاسم في المركز <small>مثلاً: الرسمي، الفعاليات</small>
          <input className="wk-inp" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label className="l">
          اسم الحساب على المنصة
          <input className="wk-inp ltr" value={handle} maxLength={120} disabled={!!a?.fixed} onChange={(e) => setHandle(e.target.value)} />
        </label>
      </div>
      {renamed && use.length > 0 && (
        <Hint warn>
          تغيير اسم الحساب يعيد «المنصات والحسابات» للاعتماد في: {use.map((x) => `${x.w.id} «${x.w.title}» (${statusLabels[x.w.status]})`).join('، ')}.
        </Hint>
      )}
      <label className="l">
        الغرض
        <input className="wk-inp" value={purpose} maxLength={200} onChange={(e) => setPurpose(e.target.value)} />
      </label>
      {(a?.platform ?? platform) !== 'mail' && (
        <div className="l">
          من ينشر عليه
          <div className="wk-pick">
            {staff.map((p) => (
              <label key={p.email}>
                <input type="checkbox" checked={publishers.includes(p.email)} onChange={(e) => setPublishers(e.target.checked ? [...publishers, p.email] : publishers.filter((x) => x !== p.email))} />
                {p.display_name} <small>{roles[p.role].name}</small>
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="l">
        عند حلول موعد النشر <small>الاختيار المبدئي، ويُغيَّر لكل منشور عند جدولته</small>
        <div className="wk-pick">
          <label>
            <input type="radio" name="ac-mode" checked={mode === 'auto'} onChange={() => setMode('auto')} />
            نشر تلقائي
          </label>
          <label>
            <input type="radio" name="ac-mode" checked={mode === 'ask'} onChange={() => setMode('ask')} />
            اسأل قبل النشر
          </label>
        </div>
      </div>
      {!edit && <Hint>حساب تجريبي: لا يتصل بشيء، ويبقى تفويضه المحاكى 60 يوماً. الربط الحقيقي من «إضافة حساب» بتسجيل الدخول عند المنصة.</Hint>}
      <div className="wk-row-acts">
        <button type="button" className="wk-btn quiet" onClick={onClose}>
          تراجع
        </button>
        <button
          type="button"
          className="wk-btn primary"
          onClick={() =>
            void act(
              'account_save',
              { p_id: a?.id ?? null, p: { platform, label, handle, purpose, publishers, mode } },
              edit ? (renamed && use.length ? 'حُفظ الحساب، وعادت «المنصات والحسابات» للاعتماد في الأعمال التي تستخدمه.' : 'حُفظ الحساب.') : 'أُضيف الحساب وربطه (محاكاة) 60 يوماً.',
            ).then((ok) => ok && onClose())
          }
        >
          {edit ? 'حفظ' : 'إضافة حساب تجريبي'}
        </button>
      </div>
    </Modal>
  );
}

export function DeleteDialog({ a, use, onClose, act }: { a: AccountRow; use: ListItem[]; onClose: () => void; act: Act }) {
  const busy = use.filter((x) => LOCKING.includes(x.w.status));
  return (
    <Modal title={`حذف «${accountName(a)}»`} onClose={onClose}>
      {busy.length ? (
        <>
          <Hint i={Lock} warn>
            لا يُحذف: يستخدمه {busy.map((x) => `${x.w.id} «${x.w.title}» (${statusLabels[x.w.status]})`).join('، ')}. انقل هذه الأعمال إلى حساب آخر، أو أوقف الحساب بدل حذفه.
          </Hint>
          <div className="wk-row-acts">
            <button type="button" className="wk-btn primary" onClick={onClose}>
              حسناً
            </button>
          </div>
        </>
      ) : (
        <>
          <Hint i={Trash2}>يُفصل الحساب عن المركز وتُحذف مفاتيحه من الخادم. {use.length ? `يُزال من الأعمال التي لم تُرسل للمراجعة بعد (${use.length}).` : 'لا يستخدمه أي عمل.'}</Hint>
          <div className="wk-row-acts">
            <button type="button" className="wk-btn quiet" onClick={onClose}>
              تراجع
            </button>
            <button type="button" className="wk-btn danger" data-hold={HOLD.accountDelete} onClick={() => void act('account_delete', { p_id: a.id }, `حُذف ${accountName(a)}.`).then((ok) => ok && onClose())}>
              <Ic i={Trash2} />
              حذف الحساب
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

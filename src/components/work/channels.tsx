'use client';
// «حسابات المنصات», after «النموذج المرجعي للمركز» version 5: the department's accounts on
// each platform (several per platform, YouTube for video only), who publishes on each, and
// whether it publishes by itself or asks first. The director, the assistant and the
// administrator add, edit, stop and delete them; the publisher reconnects them. Linking is a
// simulation: no platform is contacted, and an authorisation runs 60 days. Approval binds to
// the account and its handle, so renaming a handle re-opens «المنصات والحسابات» (account_save),
// and an account in use by approved, scheduled or in-review work cannot be stopped or deleted.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SetupGuide } from '../setup-guide';
import { Film, Link2, Lock, Mail, Pencil, Plus, RefreshCw, Send, Trash2, TriangleAlert, Unplug, Users } from 'lucide-react';
import { roles } from '@/lib/domain';
import { HOLD } from '@/lib/kit/hold-reasons';
import { accountName, accountState, countOf, isLead, canPublish, platformLabels, statusLabels, VIDEO_ONLY, WORKS, type AccountRow, type Platform } from '@/lib/work/rules';
import { MODE_AR, READINESS_AR, connErrorAr } from '@/lib/platforms/info';
import { CONN_PROVIDERS, PROVIDER_NAME, providerOf, type ConnProvider } from '@/lib/platforms/provider';
import { useWork, useWorkList, type ListItem } from './data';
import { ConnectChooser, RECONNECT_KEY, connLine } from './connect';
import { Empty, Hint, Ic, Modal } from './parts';
import { staffOf } from './plan';

const LOCKING = ['APPROVED', 'SCHEDULED', 'IN_REVIEW'];

export function ChannelsPage() {
  const w = useWork();
  const { items, reload } = useWorkList();
  const mgr = isLead(w.role);
  const pub = canPublish(w.role);
  const [dlg, setDlg] = useState<{ t: 'edit'; a: AccountRow | null } | { t: 'delete'; a: AccountRow } | null>(null);
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
    const live = w.platforms.filter((p) => p.enabled || has.has(p.key));
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
  if (!mgr && !pub)
    return (
      <div className="wk">
        <Empty i={Lock} title="حسابات المنصات لمن يديرها وينشر عليها">
          يديرها مدير الاتصال ومساعده والمسؤول عن النظام، ويعيد ربطها مسؤول النشر.
        </Empty>
      </div>
    );
  return (
    <div className="wk">
      <div className="wk-head">
        <div>
          <h1>حسابات المنصات</h1>
          <p>حسابات النشر على كل منصة، ومن ينشر عليها، وطريقة النشر المبدئية. الاعتماد يرتبط بالحساب بعينه، فتغيير اسمه يعيد «المنصات والحسابات» للاعتماد.</p>
        </div>
        {mgr && (
          <div className="wk-acts">
            <button type="button" className="wk-btn gold" onClick={() => setDlg({ t: 'edit', a: null })}>
              <Ic i={Plus} />
              إضافة حساب
            </button>
          </div>
        )}
      </div>
      <p className="wk-simnote">
        <Ic i={TriangleAlert} />
        <span>
          حساب «ربط حقيقي» مربوط بتسجيل دخول المنصة الرسمي، ويُفحص اتصاله فعلاً وتُحفظ مفاتيحه في خزنة الخادم وحده. حساب «ربط محاكى» لا يتصل بشيء. النشر نفسه ما زال محاكاة في الحالتين. المنصات وحالة تجهيز كل منها في «الإعدادات» ثم «المنصات».
        </span>
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
        sections.map((info) => {
          const pl = info.key;
          const list = w.accounts.filter((a) => a.platform === pl);
          return (
            <section className="wk-psec" data-gd={`plat-${pl}`} key={pl}>
              <h3>
                <Ic i={pl === 'mail' ? Mail : VIDEO_ONLY.includes(pl) ? Film : Send} />
                {platformLabels[pl]} <span className="n">{list.length}</span>
                {info.kind === 'social' && (
                  <small className="wk-plat-meta">
                    النشر محاكاة · المسار المخطط: {MODE_AR[info.publish_mode]} · التجهيز: {READINESS_AR[info.readiness]}
                    {!info.enabled ? ' · موقوفة لإضافة حسابات جديدة' : ''}
                  </small>
                )}
                {info.kind === 'social' && (providerOf(pl) || info.publish_mode === 'manual') && (
                  <SetupGuide
                    guide={providerOf(pl) ? `connect_${providerOf(pl)}` : 'manual'}
                    label={providerOf(pl) ? 'كيف تربط حسابك' : 'كيف يُنشر على هذه المنصة'}
                  />
                )}
                {mgr && info.enabled && providerOf(pl) && (
                  <button type="button" className="wk-btn sm" onClick={() => startConnect(providerOf(pl)!)}>
                    <Ic i={Link2} />
                    ربط عبر {PROVIDER_NAME[providerOf(pl)!]}
                  </button>
                )}
              </h3>
              {info.kind === 'social' && info.publish_mode === 'manual' && (
                <Hint>
                  مسار يدوي: لا ربط تلقائي بهذه المنصة. يُنشر من تطبيقها بحزمة جاهزة (النص والملفات) تظهر في نافذة النشر، ثم يؤكد مسؤول النشر أنه نُشر.
                </Hint>
              )}
              {list.length ? (
                <div className="wk-accgrid">
                  {list.map((a) => {
                    const [label, cls] = accountState(a, nowIso);
                    const use = useOf(a.id);
                    return (
                      <article className={`wk-acccard ${a.active ? '' : 'off'}`} key={a.id}>
                        <div className="ac-top">
                          <b>{accountName(a)}</b>
                          <span className={`wk-chip ${cls}`}>{label}</span>
                        </div>
                        {a.handle && <span className="handle">{a.handle}</span>}
                        {a.platform === 'mail' && <span className="handle">صندوق القسم المشترك</span>}
                        {a.platform !== 'mail' && (() => {
                          const c = connLine(a);
                          return (
                            <small className={`wk-conn ${c.tone}`} data-conn={c.real ? 'oauth' : 'simulated'}>
                              {c.text}
                              {c.real && a.external_name ? ` · ${a.external_name}` : ''}
                            </small>
                          );
                        })()}
                        {a.purpose && <small>{a.purpose}</small>}
                        {VIDEO_ONLY.includes(a.platform) && (
                          <p className="ytn">
                            <Ic i={Film} />{' '}
                            {a.platform === 'youtube'
                              ? 'يقبل الفيديو فقط: الطويل وShorts. لكل منشور عنوان ووصف وصورة مصغّرة وخصوصية (عام، غير مدرج، خاص).'
                              : 'يقبل الفيديو فقط: لا يُرسل إليه عمل بلا فيديو.'}
                          </p>
                        )}
                        <dl className="wk-kv">
                          <dt>ينشر عليه</dt>
                          <dd>{a.platform === 'mail' ? 'مسؤول النشر عند الإرسال' : a.publishers.map(w.nameOf).join('، ') || 'لا أحد'}</dd>
                          <dt>عند الموعد</dt>
                          <dd>{a.mode === 'ask' ? 'اسأل قبل النشر' : 'نشر تلقائي'}</dd>
                          <dt>يستخدمه</dt>
                          <dd>{use.length ? `${countOf(use.length, WORKS)}: ${use.slice(0, 3).map((x) => x.w.id).join('، ')}${use.length > 3 ? '…' : ''}` : 'لا أعمال حالية'}</dd>
                        </dl>
                        <div className="acts">
                          {(mgr || pub) && a.platform !== 'mail' && a.conn_kind !== 'oauth' && (
                            <button type="button" className="wk-btn sm" onClick={() => void act('account_reconnect', { p_id: a.id }, `أُعيد ربط ${accountName(a)} 60 يوماً (محاكاة).`)}>
                              <Ic i={RefreshCw} />
                              إعادة الربط
                            </button>
                          )}
                          {(mgr || pub) && a.conn_kind === 'oauth' && (
                            <button type="button" className="wk-btn sm" disabled={checking} onClick={() => void checkNow(a)}>
                              <Ic i={RefreshCw} />
                              فحص الاتصال
                            </button>
                          )}
                          {mgr && a.conn_kind === 'oauth' && providerOf(a.platform) && (
                            <button type="button" className="wk-btn sm" onClick={() => startConnect(providerOf(a.platform)!, a)}>
                              <Ic i={Link2} />
                              إعادة الربط عبر المنصة
                            </button>
                          )}
                          {mgr && a.conn_kind === 'oauth' && a.conn_state !== 'needs_reconnect' && (
                            <button type="button" className="wk-btn sm quiet" data-hold={HOLD.accountDisconnect} onClick={() => void disconnect(a)}>
                              <Ic i={Unplug} />
                              فصل
                            </button>
                          )}
                          {mgr && (
                            <button type="button" className="wk-btn sm" onClick={() => setDlg({ t: 'edit', a })}>
                              <Ic i={Pencil} />
                              تعديل
                            </button>
                          )}
                          {mgr && !a.fixed && (
                            <>
                              <button
                                type="button"
                                className="wk-btn sm quiet"
                                onClick={() => void act('account_set_active', { p_id: a.id, p_active: !a.active }, a.active ? `أُوقف ${accountName(a)}.` : `فُعّل ${accountName(a)}.`)}
                              >
                                {a.active ? 'إيقاف' : 'تفعيل'}
                              </button>
                              <button type="button" className="wk-btn sm quiet danger" onClick={() => setDlg({ t: 'delete', a })}>
                                <Ic i={Trash2} />
                                حذف
                              </button>
                            </>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="wk-col-hint">لا حسابات.</p>
              )}
            </section>
          );
        })
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
      {dlg?.t === 'delete' && <DeleteDialog a={dlg.a} use={useOf(dlg.a.id)} onClose={() => setDlg(null)} act={act} />}
    </div>
  );
}

type Act = (fn: string, args: Record<string, unknown>, ok: string) => Promise<boolean>;
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
    <Modal title={edit ? 'تعديل الحساب' : 'إضافة حساب'} onClose={onClose}>
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
      {!edit && <Hint>يُربط الحساب بعد الإضافة بتسجيل الدخول الرسمي للمنصة (محاكاة هنا)، ويصبح تفويضه سارياً 60 يوماً.</Hint>}
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
          {edit ? 'حفظ' : 'إضافة وربط الحساب'}
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

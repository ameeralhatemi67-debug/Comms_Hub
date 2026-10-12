'use client';
// «الحسابات المرتبطة», after «النموذج المرجعي للمركز» version 5: the department's accounts on
// each platform (several per platform, YouTube for video only), who publishes on each, and
// whether it publishes by itself or asks first. The director, the assistant and the
// administrator add, edit, stop and delete them; the publisher reconnects them. Linking is a
// simulation: no platform is contacted, and an authorisation runs 60 days. Approval binds to
// the account and its handle, so renaming a handle re-opens «المنصات والحسابات» (account_save),
// and an account in use by approved, scheduled or in-review work cannot be stopped or deleted.
import { useMemo, useState } from 'react';
import { Film, Lock, Mail, Pencil, Plus, RefreshCw, Send, Trash2, TriangleAlert, Users } from 'lucide-react';
import { roles } from '@/lib/domain';
import { HOLD } from '@/lib/kit/hold-reasons';
import { accountName, accountState, isLead, canPublish, platformLabels, statusLabels, type AccountRow, type Platform } from '@/lib/work/rules';
import { useWork, useWorkList, type ListItem } from './data';
import { Empty, Hint, Ic, Modal } from './parts';
import { staffOf } from './plan';

const PLATFORMS: Platform[] = ['instagram', 'x', 'linkedin', 'youtube', 'mail'];
const LOCKING = ['APPROVED', 'SCHEDULED', 'IN_REVIEW'];

export function ChannelsPage() {
  const w = useWork();
  const { items, reload } = useWorkList();
  const mgr = isLead(w.role);
  const pub = canPublish(w.role);
  const [dlg, setDlg] = useState<{ t: 'edit'; a: AccountRow | null } | { t: 'delete'; a: AccountRow } | null>(null);
  const nowIso = useMemo(() => new Date().toISOString(), []);
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
        <Empty i={Lock} title="الحسابات المرتبطة لمن يديرها وينشر عليها">
          يديرها مدير الاتصال ومساعده والمسؤول عن النظام، ويعيد ربطها مسؤول النشر.
        </Empty>
      </div>
    );
  return (
    <div className="wk">
      <div className="wk-head">
        <div>
          <h1>الحسابات المرتبطة</h1>
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
        <span>الربط في هذه المرحلة محاكاة: لا يتصل شيء بإنستغرام أو X أو لينكدإن أو يوتيوب. في التنفيذ يُربط كل حساب بتسجيل دخول المنصة الرسمي، وتُحفظ مفاتيحه في الخادم وحده.</span>
      </p>
      {!mgr && <Hint i={Users}>إضافة الحسابات وتعديلها وحذفها لمدير الاتصال ومساعده والمسؤول عن النظام. لك إعادة ربط الحسابات.</Hint>}
      {w.status === 'loading' ? (
        <div className="wk-loading" role="status">
          جارٍ التحميل…
        </div>
      ) : (
        PLATFORMS.map((pl) => {
          const list = w.accounts.filter((a) => a.platform === pl);
          return (
            <section className="wk-psec" data-gd={`plat-${pl}`} key={pl}>
              <h3>
                <Ic i={pl === 'mail' ? Mail : pl === 'youtube' ? Film : Send} />
                {platformLabels[pl]} <span className="n">{list.length}</span>
              </h3>
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
                        {a.purpose && <small>{a.purpose}</small>}
                        {a.platform === 'youtube' && (
                          <p className="ytn">
                            <Ic i={Film} /> يقبل الفيديو فقط: الطويل وShorts. لكل منشور عنوان ووصف وصورة مصغّرة وخصوصية (عام، غير مدرج، خاص).
                          </p>
                        )}
                        <dl className="wk-kv">
                          <dt>ينشر عليه</dt>
                          <dd>{a.platform === 'mail' ? 'مسؤول النشر عند الإرسال' : a.publishers.map(w.nameOf).join('، ') || 'لا أحد'}</dd>
                          <dt>عند الموعد</dt>
                          <dd>{a.mode === 'ask' ? 'اسأل قبل النشر' : 'نشر تلقائي'}</dd>
                          <dt>يستخدمه</dt>
                          <dd>{use.length ? `${use.length} أعمال: ${use.slice(0, 3).map((x) => x.w.id).join('، ')}${use.length > 3 ? '…' : ''}` : 'لا أعمال حالية'}</dd>
                        </dl>
                        <div className="acts">
                          {(mgr || pub) && a.platform !== 'mail' && (
                            <button type="button" className="wk-btn sm" onClick={() => void act('account_reconnect', { p_id: a.id }, `أُعيد ربط ${accountName(a)} 60 يوماً (محاكاة).`)}>
                              <Ic i={RefreshCw} />
                              إعادة الربط
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
      {dlg?.t === 'edit' && <AccountDialog a={dlg.a} use={dlg.a ? useOf(dlg.a.id).filter((x) => LOCKING.includes(x.w.status)) : []} onClose={() => setDlg(null)} act={act} />}
      {dlg?.t === 'delete' && <DeleteDialog a={dlg.a} use={useOf(dlg.a.id)} onClose={() => setDlg(null)} act={act} />}
    </div>
  );
}

type Act = (fn: string, args: Record<string, unknown>, ok: string) => Promise<boolean>;
export function AccountDialog({ a, use, onClose, act }: { a: AccountRow | null; use: ListItem[]; onClose: () => void; act: Act }) {
  const w = useWork();
  const edit = !!a;
  const [platform, setPlatform] = useState<Platform>(a?.platform ?? 'instagram');
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
            {(['instagram', 'x', 'linkedin', 'youtube'] as Platform[]).map((p) => (
              <option key={p} value={p}>
                {platformLabels[p]}
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
          <Hint i={Trash2}>يُفصل الحساب عن المركز وتُحذف مفاتيحه من الخادم. {use.length ? `يُزال من ${use.length} أعمال لم تُرسل للمراجعة بعد.` : 'لا يستخدمه أي عمل.'}</Hint>
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

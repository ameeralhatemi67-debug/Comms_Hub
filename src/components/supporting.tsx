'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BarChart3, Bell, Check, ShieldAlert, SlidersHorizontal, UserRound } from 'lucide-react';
import {
  campaign,
  channelAccounts,
  integrationStatusLabels,
  integrations,
  noticesFor,
  permissionMatrix,
  roles,
  personOf,
  teamLoad,
  securityEvents,
  statusLabels,
  storageUsage,
  systemHealth,
} from '@/lib/domain';
import { useHub } from '@/lib/store';
import { useAccount } from '@/lib/account-context';
import { supabase } from '@/lib/supabase/client';
import { setTheme, toggleIdentity } from '@/lib/identity';
import { useIdentity, useTheme } from '@/lib/use-identity';
import { Empty, Modal, Panel, Tabs, Title } from './ui';
import { ProfileEditor } from './profile-editor';
import { DriveIntegration } from './drive-files';

const pageNames: Record<string, string> = {
  mail: 'البريد',
  ideas: 'الأفكار',
  analytics: 'التحليلات',
  monitoring: 'المراقبة',
  admin: 'الإدارة',
  settings: 'الإعدادات',
  account: 'الحساب',
};

function pageTitle(page: string) {
  return pageNames[page] || 'مركز الاتصال';
}

const yesNo = (value: boolean) => (value ? 'متاح' : 'غير متاح');

/** Admin sections, MVP_draft.md section 35. Visual shells only, no enforcement. */
const adminSections = [
  { id: 'users', label: 'المستخدمون' },
  { id: 'permissions', label: 'الأدوار والصلاحيات' },
  { id: 'integrations', label: 'التكاملات' },
  { id: 'health', label: 'حالة النظام' },
  { id: 'storage', label: 'التخزين' },
  { id: 'security', label: 'الأمن' },
  { id: 'automation', label: 'الأتمتة' },
  { id: 'notifications', label: 'سياسة الإشعارات' },
];

/** Settings sections, MVP_draft.md section 38. Visual configuration only. */
const settingsSections = [
  { id: 'organization', label: 'المؤسسة' },
  { id: 'appearance', label: 'المظهر' },
  { id: 'language', label: 'اللغة' },
  { id: 'notifications', label: 'الإشعارات' },
  { id: 'publishing', label: 'افتراضات النشر' },
  { id: 'approvals', label: 'افتراضات الاعتماد' },
  { id: 'ai', label: 'الذكاء والأتمتة' },
  { id: 'storage', label: 'التخزين' },
];

export function Supporting({ page }: { page: string }) {
  const { state, dispatch } = useHub();
  const router = useRouter();
  const actor = roles[state.role];
  const second = useIdentity();
  const theme = useTheme();
  const account = useAccount();
  const [idea, setIdea] = useState('');
  const [compact, setCompact] = useState(true);
  const [alerts, setAlerts] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);
  const [adminTab, setAdminTab] = useState('users');
  const [settingsTab, setSettingsTab] = useState('organization');

  const createWork = (title: string, body: string, submit = false) => {
    dispatch({
      type: 'create',
      submit,
      content: {
        title,
        body,
        type: 'منشور اجتماعي',
        owner: state.role,
        assignee: personOf(state.role)?.id ?? 'abdullah',
        due: campaign.date,
        channels: ['Instagram', 'X', 'LinkedIn'],
        assetId: 'poster',
        assetVersion: 5,
        variants: { Instagram: body, X: body, LinkedIn: body },
        campaignId: campaign.id,
      },
    });
    router.push('/work');
  };

  if (page === 'ideas')
    return (
      <div dir="rtl">
        <Title title="الأفكار" sub="حوّل الملاحظات السريعة إلى أعمال قابلة للتنفيذ">
          <span className="chip">مسودة محلية</span>
        </Title>
        <Panel title="فكرة جديدة">
          <label className="field">
            اكتب الفكرة
            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="مثال: سلسلة قصيرة عن قصص الزملاء في خدمة الوطن"
              rows={5}
            />
          </label>
          <div className="actions">
            <button
              className="primary"
              disabled={!idea.trim() || !actor.create}
              title={!actor.create ? 'هذا الدور لا ينشئ الأعمال' : ''}
              onClick={() => {
                createWork(idea.trim().slice(0, 70), idea.trim());
                setIdea('');
              }}
            >
              تحويل الفكرة إلى عمل
            </button>
            <button className="secondary" onClick={() => setIdea('')}>
              مسح
            </button>
          </div>
          {!actor.create && <p className="muted">هذا الدور لا يملك صلاحية إنشاء الأعمال.</p>}
        </Panel>
        <Panel title="أفكار مرتبطة بالحملة">
          <div className="stack">
            {['قصة زميل ساهم في خدمة المجتمع', 'خريطة إنجازات الفريق خلال العام', 'رسالة شكر للمتطوعين'].map(
              (item) => (
                <button className="notice" key={item} onClick={() => setIdea(item)}>
                  <b>{item}</b>
                  <small>اضغط لاستخدامها كمسودة</small>
                </button>
              ),
            )}
          </div>
        </Panel>
      </div>
    );

  if (page === 'analytics') {
    const done = state.work.filter((w) => ['APPROVED', 'SCHEDULED', 'PUBLISHED'].includes(w.status)).length;
    const review = state.work.filter((w) => w.status === 'IN_REVIEW').length;
    const published = state.work.reduce(
      (sum, w) => sum + Object.values(w.results).filter((x) => x === 'SUCCESS').length,
      0,
    );
    const failed = state.work.reduce(
      (sum, w) => sum + Object.values(w.results).filter((x) => x === 'FAILED').length,
      0,
    );
    const workload = teamLoad(state.work).map((x) => ({ id: x.person.id, name: x.person.name, count: x.items.length }));

    return (
      <div dir="rtl">
        <Title title="التحليلات" sub="قراءة سريعة لحالة العمل في الحملة">
          <span className="chip">بيانات محلية محاكاة</span>
        </Title>
        <div className="stats">
          <div className="stat">
            <BarChart3 />
            <b>{state.work.length}</b>
            <span>إجمالي الأعمال</span>
          </div>
          <div className="stat">
            <Check />
            <b>{done}</b>
            <span>جاهزة أو منشورة</span>
          </div>
          <div className="stat">
            <Bell />
            <b>{review}</b>
            <span>بانتظار المراجعة</span>
          </div>
          <div className="stat">
            <b>{published}</b>
            <span>قنوات منشورة</span>
          </div>
          <div className="stat">
            <b>{failed}</b>
            <span>قنوات فاشلة</span>
          </div>
        </div>
        <Panel title="توزيع الحمل">
          <div className="table">
            {workload.map((x) => (
              <div className="between" key={x.id}>
                <span>{x.name}</span>
                <b>{x.count} أعمال</b>
              </div>
            ))}
          </div>
          <p className="muted">المؤشر يعتمد على الأعمال الموجودة في هذا النموذج المحلي.</p>
        </Panel>
      </div>
    );
  }

  if (page === 'monitoring') {
    const workload = teamLoad(state.work).map((x) => ({ id: x.person.id, name: x.person.name, count: x.items.length }));
    const unread = noticesFor(state.role, state.notices).filter((n) => !n.read);

    return (
      <div dir="rtl">
        <Title title="المراقبة" sub="آخر التغييرات والتنبيهات التي تحتاج انتباهاً">
          <span className="chip">تحديث مباشر محلي</span>
        </Title>
        <div className="columns">
          <Panel title="التنبيهات الموجهة لدورك">
            <div className="stack">
              {unread.map((n) => (
                <Link className="notice" href={`/work/${n.workId}`} key={n.id}>
                  <b>{n.title}</b>
                  <small>{n.kind === 'action' ? 'إجراء مطلوب' : 'تنبيه للفريق'}</small>
                </Link>
              ))}
              {!unread.length && <Empty>لا توجد تنبيهات غير مقروءة لهذا الدور.</Empty>}
            </div>
          </Panel>
          <Panel title="حالة الفريق">
            <div className="stack">
              {workload.map((x) => (
                <div className="between" key={x.id}>
                  <span>{x.name}</span>
                  <b>{x.count} أعمال</b>
                </div>
              ))}
            </div>
            <p className="muted">يعرض هذا التوزيع عدد الأعمال الحالية لكل عضو.</p>
          </Panel>
          <Panel title="نشاط الأعمال">
            <div className="stack">
              {state.work.slice(0, 5).map((w) => (
                <Link className="notice" href={`/work/${w.id}`} key={w.id}>
                  <span className="between">
                    <b>{w.title}</b>
                    <span className="chip">{statusLabels[w.status]}</span>
                  </span>
                  <small>{w.activity[0]}</small>
                </Link>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    );
  }

  if (page === 'admin')
    return (
      <div dir="rtl">
        <Title title="الإدارة" sub="إدارة حالة النظام والمستخدمين والتكاملات">
          <span className="chip">صلاحيات النظام</span>
        </Title>
        {!actor.admin ? (
          <Panel>
            <Empty>هذه الصفحة متاحة لمسؤول النظام فقط.</Empty>
          </Panel>
        ) : (
          <>
            <Tabs items={adminSections} value={adminTab} onChange={setAdminTab} />
            <p className="muted">
              الحسابات وطلبات الوصول والصلاحيات حقيقية وتُدار من صفحة الحسابات. بقية أقسام الإدارة واجهات عرض
              فقط في النموذج: لا أسرار ولا اتصال خارجي.
            </p>

            {adminTab === 'users' && (
              <Panel title="المستخدمون">
                <p>
                  الدخول بالبريد وكلمة المرور، ولا يدخل إلا بريد أضافه مسؤول النظام أو قبل طلبه. من الحسابات
                  تُضاف الحسابات وتُحذف، وتُمنح الأدوار والصفحات.
                </p>
                <div className="actions">
                  <Link className="button primary" href="/accounts">
                    فتح الحسابات
                  </Link>
                </div>
              </Panel>
            )}

            {adminTab === 'permissions' && (
              <Panel title="الأدوار والصلاحيات">
                <div className="table-head">
                  <span>الدور</span>
                  <span>الإنشاء</span>
                  <span>المراجعة</span>
                  <span>النشر</span>
                </div>
                {permissionMatrix.map((row) => (
                  <div className="work-row" key={row.id}>
                    <span className="work-name">
                      <b>{row.name}</b>
                      <small>{row.admin ? 'سلطة النظام، بلا اعتماد للمحتوى' : 'دور تشغيلي'}</small>
                    </span>
                    <span className="owner">{yesNo(row.create)}</span>
                    <span className="owner">{yesNo(row.review)}</span>
                    <span className="owner">{yesNo(row.publish)}</span>
                  </div>
                ))}
                <p className="muted">
                  فصل السلطة مقصود: مسؤول النظام لا يعتمد المحتوى، ومسؤول النشر لا يعتمد ما ينشره.
                </p>
              </Panel>
            )}

            {adminTab === 'integrations' && (
              <Panel title="التكاملات">
                <div className="stack">
                  {integrations.map((item) =>
                    item.id === 'drive' ? (
                      <DriveIntegration key={item.id} />
                    ) : (
                    <div className="notice" key={item.id}>
                      <span className="between">
                        <b>{item.name}</b>
                        <span className={`chip ${item.status === 'CONNECTED' ? 'success' : 'danger'}`}>
                          {integrationStatusLabels[item.status]}
                        </span>
                      </span>
                      <small>{item.detail}</small>
                      <div className="actions">
                        <button className="secondary" disabled>
                          {item.status === 'NOT_CONFIGURED' ? 'ربط' : 'إعادة الربط'}
                        </button>
                      </div>
                    </div>
                    ),
                  )}
                </div>
                <p className="muted">
                  Google Drive حقيقي. بقية التكاملات واجهات عرض، وتدفق ربطها ومعالجة رموزها مؤجلان إلى مرحلة
                  التكاملات الحقيقية.
                </p>
              </Panel>
            )}

            {adminTab === 'health' && (
              <Panel title="حالة النظام">
                <div className="table">
                  {systemHealth.map((item) => (
                    <div className="between" key={item.id}>
                      <span>{item.label}</span>
                      <b className={item.ok ? 'success' : 'danger'}>{item.value}</b>
                    </div>
                  ))}
                </div>
                <div className="notice">
                  <ShieldAlert />
                  <b>النموذج المحلي يعمل</b>
                  <p className="muted">لا توجد اتصالات خارجية أو مهام خلفية.</p>
                </div>
              </Panel>
            )}

            {adminTab === 'storage' && (
              <Panel title="التخزين">
                <p>
                  <b>{storageUsage.percent}%</b> مستخدم · {storageUsage.usedGb} من {storageUsage.totalGb} غيغابايت
                </p>
                <div className="table">
                  {storageUsage.buckets.map((bucket) => (
                    <div className="between" key={bucket.id}>
                      <span>{bucket.label}</span>
                      <b>{bucket.gb} غيغابايت</b>
                    </div>
                  ))}
                </div>
                <p className="muted">
                  أرقام توضيحية. دورة حياة التخزين ونسخ 3-2-1 موصوفة في وثائق البنية، وغير منفذة هنا.
                </p>
              </Panel>
            )}

            {adminTab === 'security' && (
              <Panel title="الأمن">
                <div className="stack">
                  {securityEvents.map((event) => (
                    <div className="notice" key={event.id}>
                      <b>{event.text}</b>
                      <small>
                        {event.at} · {event.actor}
                      </small>
                    </div>
                  ))}
                </div>
                <div className="table">
                  <div className="between">
                    <span>سجل التدقيق غير القابل للتعديل</span>
                    <b>مؤجل إلى مرحلة الإنتاج</b>
                  </div>
                  <div className="between">
                    <span>مفتاح الإيقاف الطارئ</span>
                    <b>غير مفعل في النموذج</b>
                  </div>
                </div>
              </Panel>
            )}

            {adminTab === 'automation' && (
              <Panel title="الأتمتة">
                <div className="table">
                  <div className="between">
                    <span>التوجيه التلقائي للمهام</span>
                    <b>غير مفعل</b>
                  </div>
                  <div className="between">
                    <span>النشر التلقائي بعد الاعتماد</span>
                    <b>غير مفعل</b>
                  </div>
                  <div className="between">
                    <span>المساعدة اللغوية بالذكاء الاصطناعي</span>
                    <b>خارج نطاق النموذج</b>
                  </div>
                </div>
                <p className="muted">الأتمتة مؤجلة إلى ما بعد التحقق من سير العمل الفعلي للقسم.</p>
              </Panel>
            )}

            {adminTab === 'notifications' && (
              <Panel title="سياسة الإشعارات">
                <div className="table">
                  <div className="between">
                    <span>إجراء مطلوب</span>
                    <b>يصل إلى صاحب القرار فقط</b>
                  </div>
                  <div className="between">
                    <span>يحتاج انتباه</span>
                    <b>مسؤول النشر ومسؤول النظام</b>
                  </div>
                  <div className="between">
                    <span>معلومة</span>
                    <b>أصحاب العمل والمراجعون</b>
                  </div>
                </div>
                <p className="muted">
                  النموذج الثلاثي للانتباه موصوف في وثيقة نموذج الإشعارات، والتوجيه هنا محاكاة محلية.
                </p>
              </Panel>
            )}
          </>
        )}
      </div>
    );

  if (page === 'settings')
    return (
      <div dir="rtl">
        <Title title="الإعدادات" sub="تفضيلات العرض والتشغيل لهذا المتصفح">
          <SlidersHorizontal />
        </Title>
        <Tabs items={settingsSections} value={settingsTab} onChange={setSettingsTab} />
        <p className="muted">
          التصميم والوضع يُحفظان في هذا المتصفح. بقية الإعدادات مرئية فقط، لا تُحفظ خارج هذه الجلسة ولا تغيّر سلوك
          النظام.
        </p>

        {settingsTab === 'organization' && (
          <Panel title="المؤسسة">
            <label>
              اسم الجهة
              <input readOnly value="الاتصال المؤسسي" />
            </label>
            <label>
              القسم
              <input readOnly value="إدارة الاتصال المؤسسي" />
            </label>
            <label>
              المنطقة الزمنية
              <input readOnly value="آسيا / الرياض (+03:00)" />
            </label>
          </Panel>
        )}

        {settingsTab === 'appearance' && (
          <Panel title="المظهر">
            <div className="notice">
              <b>التصميم</b>
              <small>الهوية الجديدة لمركز الاتصال أو التصميم الحالي</small>
              <div className="seg" role="group" aria-label="التصميم">
                <button type="button" aria-pressed={!second} onClick={() => second && toggleIdentity()}>
                  التصميم الحالي
                </button>
                <button type="button" aria-pressed={second} onClick={() => !second && toggleIdentity()}>
                  الهوية الجديدة
                </button>
              </div>
            </div>
            <div className="notice">
              <b>الوضع</b>
              <small>
                {second
                  ? 'الوضع الفاتح هو الافتراضي. الوضع الداكن اختيار شخصي يُحفظ في هذا المتصفح.'
                  : 'الوضع الداكن متاح في الهوية الجديدة فقط. فعّلها من الخيار أعلاه.'}
              </small>
              <div className="seg" role="group" aria-label="الوضع">
                <button type="button" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>
                  فاتح
                </button>
                <button
                  type="button"
                  aria-pressed={theme === 'dark'}
                  disabled={!second}
                  title={!second ? 'متاح في الهوية الجديدة فقط' : ''}
                  onClick={() => setTheme('dark')}
                >
                  داكن
                </button>
              </div>
            </div>
            <label className="between notice">
              <span>
                <b>عرض مختصر</b>
                <small>تقليل التفاصيل في القوائم</small>
              </span>
              <input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} />
            </label>
            <div className="notice">
              <b>معاينة الإعدادات</b>
              <p>
                {compact
                  ? 'المعاينة المختصرة تعرض العناوين والحالة فقط.'
                  : 'المعاينة الكاملة تعرض العناوين والتفاصيل.'}
              </p>
            </div>
          </Panel>
        )}

        {settingsTab === 'language' && (
          <Panel title="اللغة">
            <label>
              لغة الواجهة
              <select defaultValue="ar">
                <option value="ar">العربية · اتجاه من اليمين إلى اليسار</option>
              </select>
            </label>
            <p className="muted">الواجهة عربية بالكامل في هذا النموذج. لغات أخرى خارج النطاق الحالي.</p>
          </Panel>
        )}

        {settingsTab === 'notifications' && (
          <Panel title="الإشعارات">
            <label className="between notice">
              <span>
                <b>تنبيهات العمل</b>
                <small>إظهار تنبيه عند وجود إجراء جديد</small>
              </span>
              <input type="checkbox" checked={alerts} onChange={(e) => setAlerts(e.target.checked)} />
            </label>
            <div className="notice">
              <p>
                {alerts ? 'ستظهر تنبيهات الإجراء في هذه الصفحة.' : 'لن يظهر شريط تنبيه في هذه المعاينة.'}
              </p>
            </div>
          </Panel>
        )}

        {settingsTab === 'publishing' && (
          <Panel title="افتراضات النشر">
            <label>
              القنوات الافتراضية
              <input readOnly value={channelAccounts.map((c) => c.name).join('، ')} />
            </label>
            <label>
              موعد النشر الافتراضي
              <input readOnly value="18:00 بتوقيت الرياض" />
            </label>
            <p className="muted">لا يُرسل شيء خارج المتصفح في النموذج.</p>
          </Panel>
        )}

        {settingsTab === 'approvals' && (
          <Panel title="افتراضات الاعتماد">
            <div className="table">
              <div className="between">
                <span>مستويات الاعتماد</span>
                <b>مراجعة واحدة قبل النشر</b>
              </div>
              <div className="between">
                <span>التعديل بعد الاعتماد</span>
                <b>يلغي الاعتماد ويستلزم مراجعة جديدة</b>
              </div>
              <div className="between">
                <span>التفويض المؤقت</span>
                <b>مؤجل إلى مرحلة الإنتاج</b>
              </div>
            </div>
          </Panel>
        )}

        {settingsTab === 'ai' && (
          <Panel title="الذكاء والأتمتة">
            <div className="table">
              <div className="between">
                <span>المساعدة في الصياغة</span>
                <b>غير مفعلة</b>
              </div>
              <div className="between">
                <span>الوسم التلقائي</span>
                <b>غير مفعل</b>
              </div>
            </div>
            <p className="muted">الذكاء الاصطناعي خارج نطاق النموذج الأولي بالكامل.</p>
          </Panel>
        )}

        {settingsTab === 'storage' && (
          <Panel title="التخزين">
            <p>
              <b>{storageUsage.percent}%</b> مستخدم من {storageUsage.totalGb} غيغابايت
            </p>
            <p className="muted">لا يوجد رفع أو تخزين حقيقي في النموذج. الوسائط رسوم توضيحية محلية.</p>
          </Panel>
        )}
      </div>
    );

  if (page === 'account')
    return (
      <div dir="rtl">
        <Title title="الحساب" sub="بيانات المستخدم والدور الحالي">
          <UserRound />
        </Title>
        <Panel title="مظهرك في البريد والمراسلة">
          <ProfileEditor />
        </Panel>
        <div className="columns">
          <Panel title="الملف الشخصي">
            <div className="notice">
              <b>{account.name}</b>
              <p>{roles[account.role].name}</p>
              <small>
                البريد: <bdi dir="ltr">{account.email}</bdi>
              </small>
            </div>
            <div className="table">
              <div className="between">
                <span>دورك في النظام</span>
                <b>{roles[account.role].name}</b>
              </div>
              {state.role !== account.role && (
                <div className="between">
                  <span>العرض الحالي بصفة</span>
                  <b>{actor.name}</b>
                </div>
              )}
              <div className="between">
                <span>اللغة</span>
                <b>العربية</b>
              </div>
              <div className="between">
                <span>الصلاحيات</span>
                <b>
                  الإنشاء {yesNo(actor.create)} · المراجعة {yesNo(actor.review)} · النشر {yesNo(actor.publish)}
                </b>
              </div>
            </div>
            <div className="actions">
              <button className="secondary" onClick={() => setConfirmReset(true)}>
                إعادة النموذج إلى حالته الأولى
              </button>
            </div>
          </Panel>
          <Panel title="الجلسة">
            <div className="notice">
              <b>مسجّل الدخول</b>
              <small>
                <bdi dir="ltr">{account.email}</bdi>
              </small>
            </div>
            <div className="actions">
              <button
                className="primary"
                onClick={async () => {
                  await supabase().auth.signOut();
                  router.refresh();
                }}
              >
                تسجيل الخروج
              </button>
              <button
                className="secondary"
                onClick={async () => {
                  await supabase().auth.signOut({ scope: 'global' });
                  router.refresh();
                }}
              >
                الخروج من كل الأجهزة
              </button>
            </div>
            <p className="muted">
              {account.role === 'admin'
                ? 'أنت مسؤول نظام: تفتح كل الصفحات، وتبدّل الدور من أعلى الصفحة لتختبر كل دور.'
                : 'دورك وصفحاتك يحددها مسؤول النظام. لا يمكنك تبديل الدور.'}
            </p>
          </Panel>
        </div>
        {confirmReset && (
          <Modal title="إعادة النموذج" onClose={() => setConfirmReset(false)}>
            <p>سيُعاد العمل والتنبيهات إلى البيانات التجريبية الأولى.</p>
            <div className="actions">
              <button
                className="primary"
                onClick={() => {
                  dispatch({ type: 'reset' });
                  setConfirmReset(false);
                }}
              >
                تأكيد الإعادة
              </button>
              <button className="secondary" onClick={() => setConfirmReset(false)}>
                إلغاء
              </button>
            </div>
          </Modal>
        )}
      </div>
    );

  return (
    <div dir="rtl">
      <Title title={pageTitle(page)} sub="صفحة غير معروفة" />
      <Panel>
        <Empty>لا توجد صفحة بهذا الاسم.</Empty>
      </Panel>
    </div>
  );
}

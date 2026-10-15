'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { BarChart3, Bell, Check, SlidersHorizontal, UserRound } from 'lucide-react';
import {
  channelAccounts,
  noticesFor,
  roles,
  teamLoad,
  statusLabels,
} from '@/lib/domain';
import { useHub } from '@/lib/store';
import { useAccount } from '@/lib/account-context';
import { supabase } from '@/lib/supabase/client';
import { setTheme, toggleIdentity } from '@/lib/identity';
import { useIdentity, useTheme } from '@/lib/use-identity';
import { Empty, Modal, Panel, Tabs, Title } from './ui';
import { ProfileEditor } from './profile-editor';
import { MyPermissions } from './my-permissions';
import { WhatsAppSettings } from './whatsapp/member';
import { WhatsAppSystemPanel } from './whatsapp/system-panel';
import { GeneralTab } from './settings/general';
import { AuditTab } from './settings/audit';
import { StorageTab } from './settings/storage';
import { BackupsTab } from './settings/backups';
import { PlatformsTab } from './settings/platforms';

const pageNames: Record<string, string> = {
  mail: 'البريد',
  ideas: 'الأفكار',
  analytics: 'التحليلات',
  monitoring: 'المراقبة',
  settings: 'الإعدادات',
  account: 'الحساب',
};

function pageTitle(page: string) {
  return pageNames[page] || 'مركز الاتصال';
}

const yesNo = (value: boolean) => (value ? 'متاح' : 'غير متاح');

/** Said plainly at the top of every part that still runs on sample data. */
function SampleNotice({ children }: { children: ReactNode }) {
  return (
    <div className="sample-notice" role="note">
      <b>لم يُبنَ بعد</b>
      <span>{children}</span>
    </div>
  );
}

/** Settings sections, MVP_draft.md section 38. Visual configuration only. */
const settingsSections = [
  { id: 'general', label: 'عام وصحة النظام' },
  { id: 'organization', label: 'المؤسسة' },
  { id: 'appearance', label: 'المظهر' },
  { id: 'language', label: 'اللغة' },
  { id: 'notifications', label: 'الإشعارات' },
  { id: 'publishing', label: 'افتراضات النشر' },
  { id: 'approvals', label: 'افتراضات الاعتماد' },
  { id: 'ai', label: 'الذكاء والأتمتة' },
  { id: 'storage', label: 'التخزين' },
  { id: 'backups', label: 'النسخ الاحتياطي' },
  { id: 'platforms', label: 'المنصات' },
  { id: 'whatsapp', label: 'واتساب النظام' },
  { id: 'audit', label: 'السجل' },
];
/** The settings tabs that are real (in the database); the others are visual in the prototype. */
const REAL_SETTINGS = ['general', 'storage', 'backups', 'platforms', 'whatsapp', 'audit'];

export function Supporting({ page }: { page: string }) {
  const { state, dispatch } = useHub();
  const router = useRouter();
  const actor = roles[state.role];
  const second = useIdentity();
  const theme = useTheme();
  const account = useAccount();
  const [compact, setCompact] = useState(true);
  const [alerts, setAlerts] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);
  // «/settings?tab=general» opens a tab directly (the Drive connection returns there).
  const [settingsTab, setSettingsTab] = useState(() => {
    const t = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('tab');
    return t && settingsSections.some((s) => s.id === t) ? t : 'general';
  });

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
          <span className="chip">تجريبية، لم تُبنَ بعد</span>
        </Title>
        <SampleNotice>
          هذه الأرقام تُحسب من أعمال تجريبية محفوظة في هذا المتصفح، لا من أعمالك في «العمل». لن تطابق ما تراه هناك، ولا تعتمد عليها.
        </SampleNotice>
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
          <span className="chip">تجريبية، لم تُبنَ بعد</span>
        </Title>
        <SampleNotice>
          التنبيهات والأعمال هنا من بيانات تجريبية في هذا المتصفح، وليست إشعاراتك الحقيقية. إشعاراتك في الجرس أعلى الصفحة، وأعمالك في «العمل».
        </SampleNotice>
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

  if (page === 'settings')
    return (
      <div dir="rtl">
        <Title title="الإعدادات" sub="تفضيلات العرض والتشغيل لهذا المتصفح">
          <SlidersHorizontal />
        </Title>
        <Tabs items={settingsSections} value={settingsTab} onChange={setSettingsTab} />
        {REAL_SETTINGS.includes(settingsTab) ? (
          <p className="muted">هذا القسم حقيقي: بياناته في قاعدة البيانات، ويقرر فيه من يملك صلاحيته.</p>
        ) : (
          <SampleNotice>
            {settingsTab === 'appearance'
              ? 'التصميم والوضع يُحفظان في هذا المتصفح وحده وهما حقيقيان. «العرض المختصر» والمعاينة تحتها لا تفعل شيئاً بعد.'
              : 'هذا التبويب عرض فقط: لا يُحفظ شيء منه ولا يغيّر سلوك النظام.'}
          </SampleNotice>
        )}

        {settingsTab === 'general' && (
          <Panel title="عام وصحة النظام" className="st-panel">
            <GeneralTab />
          </Panel>
        )}
        {settingsTab === 'storage' && (
          <Panel title="التخزين" className="st-panel">
            <StorageTab />
          </Panel>
        )}
        {settingsTab === 'backups' && (
          <Panel title="النسخ الاحتياطي" className="st-panel">
            <BackupsTab />
          </Panel>
        )}
        {settingsTab === 'platforms' && (
          <Panel title="المنصات" className="st-panel">
            <PlatformsTab />
          </Panel>
        )}
        {settingsTab === 'audit' && (
          <Panel title="سجل التكاملات والإعدادات" className="st-panel">
            <AuditTab />
          </Panel>
        )}
        {settingsTab === 'whatsapp' && (
          <Panel title="واتساب النظام" className="wa-syspanel">
            <WhatsAppSystemPanel />
          </Panel>
        )}

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
        <Panel title="صلاحياتي" className="pm-minepanel">
          <MyPermissions />
        </Panel>
        <Panel title="واتساب" className="wa-panel">
          <WhatsAppSettings />
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
                إعادة البيانات التجريبية في هذا المتصفح
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
                : 'دورك وصفحاتك وصلاحياتك يحددها من يدير رتبتك في «الحسابات». لا يمكنك تبديل الدور.'}
            </p>
          </Panel>
        </div>
        {confirmReset && (
          <Modal title="إعادة النموذج" onClose={() => setConfirmReset(false)}>
            <p>يعيد هذا بيانات العرض التجريبية في هذا المتصفح فقط (صفحات «التحليلات» و«المراقبة»). لا يمسّ أعمالك ولا بريدك ولا حسابك.</p>
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

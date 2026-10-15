'use client';

import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { BarChart3, Bell, Check, SlidersHorizontal, UserRound } from 'lucide-react';
import {
  roles,
  teamLoad,
} from '@/lib/domain';
import { useHub } from '@/lib/store';
import { useAccount } from '@/lib/account-context';
import { supabase } from '@/lib/supabase/client';
import { Empty, Modal, Panel, Tabs, Title } from './ui';
import { ProfileEditor } from './profile-editor';
import { MyPermissions } from './my-permissions';
import { AppearancePanel } from './appearance-panel';
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

/**
 * Settings sections: the system's own, all real (Action_Plan.md B3). The personal ones (appearance)
 * moved to «الحساب»; the display-only ones (organisation, language, notifications, publishing and
 * approval defaults, AI) were removed because they saved nothing and changed nothing.
 */
const settingsSections = [
  { id: 'general', label: 'عام وصحة النظام' },
  { id: 'storage', label: 'التخزين' },
  { id: 'backups', label: 'النسخ الاحتياطي' },
  { id: 'platforms', label: 'المنصات' },
  { id: 'whatsapp', label: 'واتساب النظام' },
  { id: 'audit', label: 'السجل' },
];

export function Supporting({ page }: { page: string }) {
  const { state, dispatch } = useHub();
  const router = useRouter();
  const actor = roles[state.role];
  const account = useAccount();
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

  if (page === 'settings')
    return (
      <div dir="rtl">
        <Title title="الإعدادات" sub="إعدادات النظام: ما يتصل به المركز، والتخزين والنسخ، والمنصات، وواتساب النظام، والسجل">
          <SlidersHorizontal />
        </Title>
        <Tabs items={settingsSections} value={settingsTab} onChange={setSettingsTab} />

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
        <Panel title="المظهر">
          <AppearancePanel />
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
            <p>يعيد هذا بيانات العرض التجريبية في هذا المتصفح فقط (صفحة «التحليلات»). لا يمسّ أعمالك ولا بريدك ولا حسابك.</p>
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

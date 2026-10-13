'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import {
  House,
  BriefcaseBusiness,
  Plus,
  CheckCheck,
  CalendarDays,
  FolderKanban,
  Inbox,
  Mail,
  Images,
  Clapperboard,
  Lightbulb,
  ChartNoAxesCombined,
  Users,
  Settings,
  User,
  Shield,
  UserCog,
  ListChecks,
  History,
  LogOut,
  Bell,
  Search,
  PanelRightClose,
  Menu,
  Link2,
} from 'lucide-react';
import { roles, type Role } from '@/lib/domain';
import { useHub } from '@/lib/store';
import { useAccount } from '@/lib/account-context';
import { canOpen, canSwitchRole } from '@/lib/access';
import { supabase } from '@/lib/supabase/client';
import { toggleIdentity } from '@/lib/identity';
import { Modal, Empty, LogoLoader } from './ui';
import { HelpButton, ToastUndo, UndoButton, useKit } from './kit';
import { NoticeDrawer, useNotices } from './notices';

const nav = [
  ['/', 'الرئيسية', House],
  ['/work', 'العمل', BriefcaseBusiness],
  ['/create', 'إنشاء', Plus],
  ['/approvals', 'الموافقات والنشر', CheckCheck],
  ['/calendar', 'التقويم', CalendarDays],
  ['/projects', 'المشاريع', FolderKanban],
  ['/requests', 'الطلبات', Inbox],
  ['/media', 'مكتبة الوسائط', Images],
  ['/tasks', 'المهام', ListChecks],
  ['/activity', 'سجل النشاط', History],
  ['/motion', 'استوديو الحركة', Clapperboard],
  ['/mail', 'البريد', Mail],
  ['/channels', 'الحسابات المرتبطة', Link2],
  ['/ideas', 'الأفكار', Lightbulb],
  ['/analytics', 'التحليلات', ChartNoAxesCombined],
  ['/monitoring', 'المراقبة', Users],
  ['/admin', 'الإدارة', Shield],
  ['/accounts', 'الحسابات', UserCog],
  ['/settings', 'الإعدادات', Settings],
  ['/account', 'الحساب', User],
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const { state, dispatch } = useHub();
  const account = useAccount();
  const router = useRouter();
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [overlay, setOverlay] = useState('');
  const [query, setQuery] = useState('');
  const actor = roles[state.role];
  const kit = useKit();
  const notices = useNotices();

  const normalized = (s: string) =>
    s
      .normalize('NFKD')
      .replace(/[ً-ٟ]/g, '')
      .replace(/[أإآ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .toLowerCase();

  const results = state.work.filter((w) =>
    normalized(w.title + ' اليوم الوطني national day').includes(normalized(query)),
  );

  // A double-click on the logo switches between the current design and the second
  // design (Roadmap Checkpoint 0.3). mousedown is cancelled on the second click so
  // the double-click does not select text. The same logo sits in the phone top bar.
  const designSwitch = {
    onMouseDown: (e: React.MouseEvent) => {
      if (e.detail > 1) e.preventDefault();
    },
    onDoubleClick: () =>
      dispatch({
        type: 'notify',
        text: toggleIdentity() ? 'التصميم: الهوية الجديدة لمركز الاتصال' : 'التصميم: التصميم الحالي',
      }),
  };

  // What the sidebar offers: pages this account was granted (access.ts), and, as
  // before, only what the role being viewed can use. Administrators see every page.
  const adminPage = (href: string) => href === '/admin' || href === '/accounts';
  const visible = nav.filter(
    ([href]) =>
      canOpen(account, href.slice(1)) &&
      (!adminPage(href) || actor.admin) &&
      (href !== '/create' || actor.create),
  );
  const allowed = (href: string) => visible.some((n) => n[0] === href);

  const signOut = async () => {
    await supabase().auth.signOut();
    router.refresh();
  };

  return (
    <div className={`app-shell ${collapsed ? 'collapsed' : ''}`}>
      <a className="skip" href="#main">
        انتقل إلى المحتوى
      </a>
      <aside className="sidebar">
        <Link href="/" className="brand" {...designSwitch}>
          <span className="brandmark">
            <LogoLoader size={26} mode="static" color="currentColor" ariaLabel="شعار مركز الاتصال" />
          </span>
          <span>
            <b>مركز الاتصال</b>
            <small>COMMUNICATION HUB</small>
          </span>
        </Link>
        <button
          className="collapse-control"
          onClick={() => {
            setCollapsed(!collapsed);
            setMobile(false);
          }}
          aria-label="طي أو توسيع القائمة"
        >
          <PanelRightClose />
        </button>
        <nav>
          {visible.map(([href, label, Icon]) => (
            <Link
              title={label}
              key={href}
              href={href}
              onClick={() => setMobile(false)}
              className={`nav-item ${path === href || (href === '/work' && path.startsWith('/work/')) ? 'active' : ''}`}
            >
              <Icon />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="avatar">{account.name[0]}</span>
          <span>
            <b>{account.name}</b>
            <small>{state.role === account.role ? actor.name : `عرض بصفة ${actor.name}`}</small>
          </span>
          <button className="sign-out" onClick={signOut} aria-label="تسجيل الخروج" title="تسجيل الخروج">
            <LogOut />
          </button>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <Link href="/" className="mobile-brand" aria-label="مركز الاتصال، الرئيسية" {...designSwitch}>
            <span className="brandmark">
              <LogoLoader size={22} mode="static" color="currentColor" ariaLabel="شعار مركز الاتصال" />
            </span>
          </Link>
          <button
            aria-label="البحث الشامل"
            className="global-search"
            onClick={() => {
              setOverlay('search');
              setQuery('');
            }}
          >
            <Search />
            <span>ابحث في مركز الاتصال…</span>
          </button>
          <div className="top-actions">
            <span className="prototype">نموذج محلي · 0.1</span>
            {canSwitchRole(account) ? (
              <label className="role-select">
                عرض بصفة
                <select
                  aria-label="عرض بصفة"
                  value={state.role}
                  onChange={(e) => dispatch({ type: 'role', role: e.target.value as Role })}
                >
                  {Object.entries(roles).map(([id, r]) => (
                    <option key={id} value={id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="role-fixed" title="دورك في النظام">
                {actor.name}
              </span>
            )}
            <UndoButton />
            <HelpButton />
            <button
              aria-label={notices.unread ? `الإشعارات (${notices.unread} غير مقروءة)` : 'الإشعارات'}
              onClick={() => setOverlay('notifications')}
              className="notification-button"
            >
              <Bell />
              {notices.unread > 0 && <i />}
            </button>
          </div>
        </header>
        <main id="main">
          {/* The page guide opens here, in place of the page (src/lib/kit/guide.ts). */}
          <div id="guide-view" hidden />
          {children}
        </main>
        <footer className="app-footer">
          نموذج تجربة المستخدم · بيانات تجريبية · جميع إجراءات النشر محاكاة محلية
        </footer>
      </div>

      <nav className="mobile-nav">
        <Link href="/">
          <House />
          الرئيسية
        </Link>
        {allowed('/work') && (
          <Link href="/work">
            <BriefcaseBusiness />
            العمل
          </Link>
        )}
        {allowed('/create') && (
          <Link href="/create">
            <Plus />
            إنشاء
          </Link>
        )}
        {allowed('/calendar') && (
          <Link href="/calendar">
            <CalendarDays />
            التقويم
          </Link>
        )}
        <button onClick={() => setMobile(!mobile)} aria-expanded={mobile}>
          <Menu />
          المزيد
        </button>
      </nav>

      {mobile && (
        <Modal title="التنقل" onClose={() => setMobile(false)}>
          <nav className="mobile-menu">
            {visible.map(([href, label, Icon]) => (
              <Link className="nav-item" href={href} key={href} onClick={() => setMobile(false)}>
                <Icon />
                <span>{label}</span>
              </Link>
            ))}
          </nav>
          <button className="secondary" onClick={signOut}>
            <LogOut />
            تسجيل الخروج
          </button>
        </Modal>
      )}

      {(state.message || kit.offer) && (
        <div className="toast" role="status">
          <span>{state.message || `تم: ${kit.offer?.label}`}</span>
          <ToastUndo />
          <button
            aria-label="إغلاق الرسالة"
            onClick={() => {
              dispatch({ type: 'clear' });
              kit.dropOffer();
            }}
          >
            ×
          </button>
        </div>
      )}

      {overlay === 'notifications' && <NoticeDrawer notices={notices} onClose={() => setOverlay('')} />}
      {overlay === 'search' && (
        <Modal title="البحث الشامل" onClose={() => setOverlay('')}>
          <label>
            ابحث عن عمل أو حملة
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="اليوم الوطني" />
          </label>
          {results.map((w) => (
            <Link className="notice" href={`/work/${w.id}`} key={w.id} onClick={() => setOverlay('')}>
              <b>{w.title}</b>
              <small>{w.id} · اليوم الوطني السعودي 2026</small>
            </Link>
          ))}
          {!results.length && <Empty>جرّب عنواناً أو كلمة أخرى.</Empty>}
        </Modal>
      )}
    </div>
  );
}

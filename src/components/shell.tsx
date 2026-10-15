'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
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
  Settings,
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
import { roles, statusLabels, type Role } from '@/lib/domain';
import { useHub } from '@/lib/store';
import { useAccount } from '@/lib/account-context';
import { canSwitchRole, menuFor } from '@/lib/access';
import { supabase } from '@/lib/supabase/client';
import { toggleIdentity } from '@/lib/identity';
import { Modal, Empty, LogoLoader } from './ui';
import { HelpButton, ToastUndo, UndoButton, useKit } from './kit';
import { NoticeDrawer, useNotices } from './notices';
import { useCaps } from './caps';
import { MaintenanceBanner } from './settings/maintenance-banner';

/** The icon of each menu entry; the entries themselves (and who sees them) are in src/lib/access.ts. */
const menuIcons = {
  '/': House,
  '/work': BriefcaseBusiness,
  '/create': Plus,
  '/approvals': CheckCheck,
  '/calendar': CalendarDays,
  '/projects': FolderKanban,
  '/requests': Inbox,
  '/media': Images,
  '/tasks': ListChecks,
  '/activity': History,
  '/analytics': ChartNoAxesCombined,
  '/motion': Clapperboard,
  '/mail': Mail,
  '/channels': Link2,
  '/ideas': Lightbulb,
  '/accounts': UserCog,
  '/settings': Settings,
} as const;

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

  // The global search asks the database for works whose title or number matches; row level security
  // decides which this person may see (Action_Plan.md B8: it used to search sample works).
  const [found, setFound] = useState<{ id: string; title: string; status: string }[]>([]);
  useEffect(() => {
    if (overlay !== 'search') return;
    const q = query.replace(/[,()%_*\\]/g, ' ').trim();
    if (!q) {
      setFound([]);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      void Promise.resolve(
        supabase().from('works').select('id,title,status').or(`title.ilike.%${q}%,id.ilike.%${q}%`).order('updated_at', { ascending: false }).limit(8),
      ).then((r) => live && setFound((r.data as { id: string; title: string; status: string }[] | null) ?? []));
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [overlay, query]);

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
  // «الحسابات» follows «فتح صفحة الحسابات» (Permissions_Plan.md 5), read live from the
  // database; an administrator viewing as another role sees it as that role's leaders do.
  const caps = useCaps();
  const visible = menuFor(account, { viewAs: state.role, hasCap: caps.has }).map((e) => [e.href, e.label, menuIcons[e.href]] as const);
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
          {/* «الحساب» is reached from the person's own badge, not from the page list (Action_Plan.md B1). */}
          <Link
            href="/account"
            className={`account-link ${path === '/account' ? 'active' : ''}`}
            title="حسابك: الملف الشخصي وصلاحياتك"
            aria-label={`حسابك، ${account.name}`}
            aria-current={path === '/account' ? 'page' : undefined}
            onClick={() => setMobile(false)}
          >
            <span className="avatar">{account.name[0]}</span>
            <span className="who">
              <b>{account.name}</b>
              <small>{state.role === account.role ? actor.name : `عرض بصفة ${actor.name}`}</small>
            </span>
          </Link>
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
          <MaintenanceBanner />
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
          <Link className="nav-item account-menu-link" href="/account" onClick={() => setMobile(false)}>
            <span className="avatar">{account.name[0]}</span>
            <span>
              <b>الحساب</b>
              <small>{account.name}</small>
            </span>
          </Link>
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
            ابحث عن عمل بعنوانه أو رقمه
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="مثال: CH-241" />
          </label>
          {found.map((w) => (
            <Link className="notice" href={`/work/${w.id}`} key={w.id} onClick={() => setOverlay('')}>
              <b>{w.title}</b>
              <small>
                <bdi dir="ltr">{w.id}</bdi> · {statusLabels[w.status as keyof typeof statusLabels] ?? w.status}
              </small>
            </Link>
          ))}
          {query.trim() && !found.length && <Empty>جرّب عنواناً أو رقم عمل آخر.</Empty>}
        </Modal>
      )}
    </div>
  );
}

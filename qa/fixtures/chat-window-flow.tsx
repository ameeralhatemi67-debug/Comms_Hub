// The real mail and messaging window (src/components/chat-window) and its account switch, inside a frame with the shell's
// own classes (sidebar, top bar, phone bottom bar, toast), for qa/chat-window-flow.cjs. The database is stood in by
// fake-chat-window.ts. Routes: / , /work/CH-241, /account, /mail, /mail/chat. `?collapsed` starts the sidebar narrow.
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatWindow } from '../../src/components/chat-window';
import { ChatWindowPanel } from '../../src/components/chat-window/account-panel';

function App() {
  const [path, setPath] = useState(location.pathname);
  const [collapsed, setCollapsed] = useState(new URLSearchParams(location.search).has('collapsed'));
  useEffect(() => {
    (window as unknown as { __nav: (h: string) => void }).__nav = (href: string) => {
      history.pushState(null, '', href);
      setPath(location.pathname);
    };
    (window as unknown as { __collapse: (v: boolean) => void }).__collapse = setCollapsed;
    const back = () => setPath(location.pathname);
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);
  const go = (href: string) => (window as unknown as { __nav: (h: string) => void }).__nav(href);
  return (
    <div className={`app-shell ${collapsed ? 'collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brandmark">م</span>
          <span>
            <b>مركز الاتصال</b>
          </span>
        </div>
        <nav>
          <a className="nav-item" href="/" onClick={(e) => (e.preventDefault(), go('/'))}>
            <span>الرئيسية</span>
          </a>
          <a className="nav-item" href="/work/CH-241" onClick={(e) => (e.preventDefault(), go('/work/CH-241'))}>
            <span>العمل</span>
          </a>
          <a className="nav-item" href="/mail" onClick={(e) => (e.preventDefault(), go('/mail'))}>
            <span>البريد</span>
          </a>
          <a className="nav-item" href="/account" onClick={(e) => (e.preventDefault(), go('/account'))}>
            <span>الحساب</span>
          </a>
        </nav>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="global-search">ابحث في مركز الاتصال…</span>
          <div className="top-actions">
            <button className="notification-button" aria-label="الإشعارات">
              ب
            </button>
          </div>
        </header>
        <main id="main">
          <h1 className="fx-path">{path}</h1>
          {path === '/account' && (
            <section className="panel">
              <h2>التجارب</h2>
              <ChatWindowPanel />
            </section>
          )}
          {path.startsWith('/mail') && <p className="fx-mail">صفحة البريد كما هي، بكل أدواتها.</p>}
          {path.startsWith('/work/') && <p className="fx-work">صفحة العمل CH-241.</p>}
          <div style={{ height: 1400 }} />
        </main>
      </div>
      <nav className="mobile-nav">
        <a href="/">الرئيسية</a>
      </nav>
      <ChatWindow />
      <div className="toast" role="status">
        <span>رسالة اختبار من الموقع</span>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

// The notifications hook of the site (src/components/notices.tsx, useNotices) on a fixture page, for the
// desktop application's check of notices while hidden (qa/desktop-native.cjs, DT-07). The list comes from
// fake-notices.ts and the router from fake-next.tsx, which records where a clicked notice went.
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useNotices } from '../../src/components/notices';

type W = { __navs: string[]; __nav: (href: string) => void; noticesReload: () => Promise<void>; noticesRead: (ids: string[] | null) => Promise<void> };
const w = window as unknown as W;
w.__navs = [];
w.__nav = (href) => void w.__navs.push(href);

function App() {
  const notices = useNotices();
  useEffect(() => {
    w.noticesReload = notices.reload;
    w.noticesRead = notices.read;
  });
  return (
    <p id="count">
      {notices.list.length}:{notices.unread}
    </p>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

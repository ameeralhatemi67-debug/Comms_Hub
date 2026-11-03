// «حسابات المنصات» with a really-connected Instagram account's sheet open, for qa/instagram-test-flow.cjs: the real page,
// sheet and «تجربة النشر» panel, with the database, the work provider, the Drive upload and the site's routes replaced by
// the stand-ins of fake-instagram-test.tsx.
import { createRoot } from 'react-dom/client';
import { ChannelsPage } from '../../src/components/work/channels';

const w = window as unknown as { __nav: (href: string) => void; __went: string[] };
w.__went = [];
w.__nav = (href) => void w.__went.push(href);

createRoot(document.getElementById('root')!).render(
  <main id="main">
    <ChannelsPage initialOpen="a-ig" />
  </main>,
);

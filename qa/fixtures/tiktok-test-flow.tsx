// «حسابات المنصات» with a really-connected TikTok account's sheet open, for qa/tiktok-test-flow.cjs: the real page, sheet and
// «تجربة النشر» panel, with the database, the work provider, the Drive upload and the site's routes replaced by the stand-ins of
// fake-tiktok-test.tsx. With ?direct=1 the panel is drawn alone in its «نشر مباشر» mode, as the direct-publish sheet draws it.
import { createRoot } from 'react-dom/client';
import { ChannelsPage } from '../../src/components/work/channels';
import { TikTokTest } from '../../src/components/work/tiktok-test';
import { tt } from './fake-tiktok-test';

const w = window as unknown as { __nav: (href: string) => void; __went: string[] };
w.__went = [];
w.__nav = (href) => void w.__went.push(href);
const direct = new URLSearchParams(location.search).has('direct');

createRoot(document.getElementById('root')!).render(
  <main id="main">
    {direct ? (
      <dialog open className="pf-sheet">
        <TikTokTest a={tt} mode="direct" onReconnect={() => w.__nav('/channels')} />
      </dialog>
    ) : (
      <ChannelsPage initialOpen="a-tt" />
    )}
  </main>,
);

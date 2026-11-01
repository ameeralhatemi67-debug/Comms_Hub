// «المنصات» and «حسابات المنصات» on a fixture page for qa/platforms-flow.cjs: the real tab and the real page, with the
// database, the capabilities and the work provider replaced by the stand-ins of fake-platforms-flow.tsx.
import { createRoot } from 'react-dom/client';
import { PlatformsTab } from '../../src/components/settings/platforms';
import { ChannelsPage } from '../../src/components/work/channels';

const q = new URLSearchParams(location.search);
const w = window as unknown as { __nav: (href: string) => void; __went: string[] };
w.__went = [];
w.__nav = (href) => {
  w.__went.push(href);
  history.replaceState(null, '', `/?page=accounts${q.get('role') ? `&role=${q.get('role')}` : ''}`);
};

createRoot(document.getElementById('root')!).render(<main id="main">{q.get('page') === 'accounts' ? <ChannelsPage /> : <PlatformsTab />}</main>);

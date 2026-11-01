// «الحسابات» on a fixture page for qa/accounts-flow.cjs: the real page and all its tabs, with the provider, the database
// client and the shell's store replaced by stand-ins that record what the components ask. The signed-in page cannot be
// driven by a check (no sign-in bypass, ever), so this drives the components, and the rules stay with the database.
import { createRoot } from 'react-dom/client';
import { AccountsPage } from '../../src/components/accounts/page';

const w = window as unknown as { __nav: (href: string) => void; __went: string[] };
w.__went = [];
w.__nav = (href) => void w.__went.push(href);

createRoot(document.getElementById('root')!).render(
  <main id="main">
    <AccountsPage />
  </main>,
);

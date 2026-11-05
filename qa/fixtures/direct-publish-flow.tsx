// Home's «إجراءات سريعة» on its own, for qa/direct-publish-flow.cjs: the real menu, sheet, panels and dialogs, with the database,
// the capabilities, the work provider and the site's routes replaced by the stand-ins of fake-direct.tsx.
import { createRoot } from 'react-dom/client';
import { QuickActions } from '../../src/components/quick-actions';
import { DirectPosts } from '../../src/components/work/direct-posts';
import { accounts } from './fake-direct';

const w = window as unknown as { __nav: (href: string) => void; __went: string[] };
w.__went = [];
w.__nav = (href) => void w.__went.push(href);

const list = new URLSearchParams(location.search).get('view') === 'list';

createRoot(document.getElementById('root')!).render(
  list ? (
    // The account sheet's list of direct posts (MVP_draft.md 76.6), as «حسابات المنصات» draws it for the Instagram account.
    <main id="main" className="wk">
      <h1>حسابات المنصات</h1>
      <div className="pf-sheet-body" data-qa="open">
        <DirectPosts a={accounts[1]} />
      </div>
    </main>
  ) : (
  <main id="main" className="wk">
    <div className="wk-head">
      <div>
        <h1>الرئيسية</h1>
      </div>
      <div className="wk-acts">
        <QuickActions />
      </div>
    </div>
  </main>
  ),
);

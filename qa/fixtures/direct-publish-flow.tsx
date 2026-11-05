// Home's «إجراءات سريعة» on its own, for qa/direct-publish-flow.cjs: the real menu, sheet, panels and dialogs, with the database,
// the capabilities, the work provider and the site's routes replaced by the stand-ins of fake-direct.tsx.
import { createRoot } from 'react-dom/client';
import { QuickActions } from '../../src/components/quick-actions';

const w = window as unknown as { __nav: (href: string) => void; __went: string[] };
w.__went = [];
w.__nav = (href) => void w.__went.push(href);

createRoot(document.getElementById('root')!).render(
  <main id="main" className="wk">
    <div className="wk-head">
      <div>
        <h1>الرئيسية</h1>
      </div>
      <div className="wk-acts">
        <QuickActions />
      </div>
    </div>
  </main>,
);

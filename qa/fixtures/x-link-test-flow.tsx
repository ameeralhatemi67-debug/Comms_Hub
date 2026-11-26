// «تجربة النشر بالرابط» on a fixture page for qa/x-link-test-flow.cjs: the real panel over an X account on the link route, with the work
// provider and the database replaced by the stand-ins of fake-x-link-test.tsx.
import { createRoot } from 'react-dom/client';
import { XLinkTest } from '../../src/components/work/x-link-test';
import type { AccountRow } from '../../src/lib/work/rules';

const q = new URLSearchParams(location.search);
const account = {
  id: '00000000-0000-4000-8000-0000000000a1', platform: 'x', label: 'الرسمي', handle: '@T_X', purpose: null, authorized_until: null, publishers: ['pub@example.test'], mode: 'ask',
  active: q.get('stopped') !== '1', fixed: false, route: 'link',
} as unknown as AccountRow;

createRoot(document.getElementById('root')!).render(
  <main id="main" className="wk">
    <h1>حسابات المنصات</h1>
    <XLinkTest a={account} />
  </main>,
);

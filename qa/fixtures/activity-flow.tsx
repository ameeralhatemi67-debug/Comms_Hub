// «سجل النشاط» on a fixture page for qa/activity-flow.cjs: the real page and report, with the database client, the
// provider and the capabilities replaced by stand-ins. The signed-in page cannot be driven by a check, so this drives
// the components. Who is looking comes from the address, so a check can be each kind of person.
import { createRoot } from 'react-dom/client';
import { ActivityPage } from '../../src/components/media/activity-page';

const WHO: Record<string, { email: string; role: string; isAdmin: boolean; caps: string[]; known: boolean }> = {
  director: { email: 'director@example.test', role: 'director', isAdmin: false, caps: ['activity.full', 'activity.report'], known: true },
  writer: { email: 'one@example.test', role: 'writer', isAdmin: false, caps: [], known: true },
  granted: { email: 'two@example.test', role: 'writer', isAdmin: false, caps: ['activity.full'], known: true },
  // The database before the migration: it does not know the permission yet.
  before: { email: 'director@example.test', role: 'director', isAdmin: false, caps: [], known: false },
};
const w = window as unknown as { __who: (typeof WHO)[string] };
w.__who = WHO[new URLSearchParams(location.search).get('who') ?? 'director'];

// Loaded after the page's person is set, so the stand-ins read it.
createRoot(document.getElementById('root')!).render(
  <main id="main">
    <ActivityPage />
  </main>,
);

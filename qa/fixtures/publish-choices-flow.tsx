// YouTube's choices in the work cycle on their own, for qa/publish-choices-flow.cjs (MVP_draft.md section 78): the real «نشر الآن» and
// «جدولة» dialogs over a video work on two YouTube channels and an Instagram account, with the stand-ins of fake-publish.tsx. What the
// dialog asks the database to do is recorded in window.__acts.
//   ?view=now     «نشر الآن» on the three accounts
//   ?view=ig      «نشر الآن» on Instagram alone
//   ?view=sched   «جدولة»
import { createRoot } from 'react-dom/client';
import { PublishNowDialog, ScheduleDialog } from '../../src/components/work/publish';
import type { WorkRow } from '../../src/lib/work/rules';

const w = window as unknown as { __acts: { fn: string; args: Record<string, unknown> }[]; __closed: number };
w.__acts = [];
w.__closed = 0;
const act = async (fn: string, args: Record<string, unknown>) => {
  w.__acts.push({ fn, args });
  return true;
};
const view = new URLSearchParams(location.search).get('view') ?? 'now';
const work = {
  id: 'CH-501', no: 501, title: 'مقطع الافتتاح', type: 'video', status: 'APPROVED', priority: 'normal', restricted: false, source: 'internal',
  requester: null, brief: null, created_by: 'dir@example.test', assignee: 'dir@example.test', people: [], due: '2026-11-10', event_at: null,
  place: null, channels: view === 'ig' ? ['ig-main'] : ['yt-main', 'yt-review', 'ig-main'], proposed_at: null, sched_at: null, pub_at: null,
  pub_mode: 'auto', pending_sched: false, confirm_pending: false, move_from: null, move_by: null, review_cycle: 1, results: {}, closed_at: null,
  closed_by: null, close_reason: null, created_at: '2026-11-01T08:00:00Z', updated_at: '2026-11-04T08:00:00Z',
} as unknown as WorkRow;
const close = () => void w.__closed++;

createRoot(document.getElementById('root')!).render(
  <main id="main" className="wk">
    <h1>الموافقات والنشر</h1>
    {view === 'sched' ? <ScheduleDialog w={work} approvedParts={['النص الأساسي الإصدار 1']} onClose={close} act={act} /> : <PublishNowDialog w={work} onClose={close} act={act} />}
  </main>,
);

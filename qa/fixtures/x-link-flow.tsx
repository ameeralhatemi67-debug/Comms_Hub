// X's link route on its own, for qa/x-link-flow.cjs (MVP_draft.md section 81): the real send dialog and the real hand-off over works on an
// X account on the link route, with the stand-ins of fake-x-link.tsx. What the dialogs ask the database to do is recorded in window.__acts.
//   ?view=now       «نشر الآن» on the link account, a simulated X account and Instagram
//   ?view=handoff   the hand-off of a work «جارٍ النشر» that waits on the link account
import { createRoot } from 'react-dom/client';
import { HandoffDialog, PublishNowDialog } from '../../src/components/work/publish';
import type { WorkRow } from '../../src/lib/work/rules';

const w = window as unknown as { __acts: { fn: string; args: Record<string, unknown>; ok: string }[]; __calls: unknown[]; __closed: number };
w.__acts = [];
w.__calls = [];
w.__closed = 0;
const act = async (fn: string, args: Record<string, unknown>, ok: string) => {
  w.__acts.push({ fn, args, ok });
  return true;
};
const view = new URLSearchParams(location.search).get('view') ?? 'now';
const base = {
  id: 'CH-601', no: 601, title: 'افتتاح المعرض', type: 'post', priority: 'normal', restricted: false, source: 'internal', requester: null, brief: null,
  created_by: 'dir@example.test', assignee: 'dir@example.test', people: [], due: '2026-12-01', event_at: null, place: null, proposed_at: null, sched_at: null,
  pub_at: null, pub_mode: 'auto', pending_sched: false, confirm_pending: false, move_from: null, move_by: null, review_cycle: 1, closed_at: null,
  closed_by: null, close_reason: null, created_at: '2026-11-20T08:00:00Z', updated_at: '2026-11-24T08:00:00Z',
};
const now = {
  ...base, status: 'APPROVED', channels: ['x-link', 'x-sim', 'ig-main'], results: {},
} as unknown as WorkRow;
const waiting = {
  ...base, status: 'PUBLISHING', channels: ['x-link', 'x-sim'], pub_at: '2026-11-25T09:00:00Z',
  results: { 'x-link': { ok: false, pending: true, route: 'link', at: '2026-11-25T09:00:00Z', why: 'بانتظار نشرك على X' }, 'x-sim': { ok: true, at: '2026-11-25T09:00:00Z', why: null } },
} as unknown as WorkRow;
const close = () => void w.__closed++;

createRoot(document.getElementById('root')!).render(
  <main id="main" className="wk">
    <h1>الموافقات والنشر</h1>
    {view === 'handoff' ? <HandoffDialog w={waiting} onClose={close} act={act} /> : <PublishNowDialog w={now} onClose={close} act={act} />}
  </main>,
);

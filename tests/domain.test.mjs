import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState,
  reducer,
  pickContent,
  ready,
  noticesFor,
  homeTiles,
  roleIds,
} from '../src/lib/domain.ts';

test('version-bound review, revision, scheduling, partial result and safe retry', () => {
  let s = initialState();
  const send = (a) => {
    s = reducer(s, a);
  };
  const work = () => s.work.find((w) => w.id === 'CH-243');

  send({ type: 'role', role: 'writer' });
  send({ type: 'edit', id: 'CH-243', content: { ...pickContent(work()), body: 'نص جديد لليوم الوطني' } });
  send({ type: 'submit', id: 'CH-243' });
  assert.equal(work().release.body, 'نص جديد لليوم الوطني');
  assert.equal(work().release.revision, 2);

  send({ type: 'role', role: 'assistant' });
  send({ type: 'changes', id: 'CH-243', text: 'أضف رسالة شكر' });
  assert.equal(work().status, 'CHANGES_REQUESTED');

  send({ type: 'role', role: 'writer' });
  send({ type: 'edit', id: 'CH-243', content: { ...pickContent(work()), body: 'شكراً لفريقنا' } });
  send({ type: 'submit', id: 'CH-243' });

  send({ type: 'role', role: 'director' });
  send({ type: 'approve', id: 'CH-243' });
  assert.equal(work().release.revision, 3);
  assert(ready(work()));

  send({ type: 'schedule', id: 'CH-243', date: '2026-09-23T18:00' });
  assert.equal(work().status, 'APPROVED', 'the director cannot schedule; only the publishing officer can');

  send({ type: 'role', role: 'publisher' });
  send({ type: 'schedule', id: 'CH-243', date: '2026-09-23T18:00' });
  assert.equal(work().scheduled, '2026-09-23T18:00');

  send({ type: 'publish', id: 'CH-243' });
  assert.equal(work().status, 'PUBLISHING');
  send({ type: 'result', id: 'CH-243', mode: 'partial' });
  assert.equal(work().status, 'PARTIAL');
  assert.equal(work().results.Instagram, 'SUCCESS');
  assert.equal(work().results.LinkedIn, 'FAILED');

  send({ type: 'retry', id: 'CH-243' });
  send({ type: 'result', id: 'CH-243', mode: 'success' });
  assert.equal(work().status, 'PUBLISHED');
  assert.equal(work().results.Instagram, 'SUCCESS');
  assert(s.notices.some((n) => n.kind === 'attention'));
});

test('editing a published item invalidates the approval but preserves the publication record', () => {
  // Deliberate policy, not a side effect. Two separate rules are being asserted:
  //  1. Approval invalidation, required by approval_policy_design.md section 3:
  //     any post-approval mutation drops the bound release and returns the item
  //     to DRAFT for fresh review, so nothing ships on an unapproved revision.
  //  2. Publication preservation: a dispatch that already reached the channels
  //     is an external fact, so the edit moves the channel outcome into the
  //     publication record instead of erasing it.
  let s = initialState();
  const send = (a) => {
    s = reducer(s, a);
  };
  const work = () => s.work.find((w) => w.id === 'CH-242');

  send({ type: 'role', role: 'publisher' });
  send({ type: 'schedule', id: 'CH-242', date: '2026-09-23T18:00' });
  send({ type: 'publish', id: 'CH-242' });
  send({ type: 'result', id: 'CH-242', mode: 'partial' });
  assert.equal(work().status, 'PARTIAL');
  const publishedRevision = work().revision;
  const dispatched = { ...work().results };

  send({ type: 'role', role: 'designer' });
  send({ type: 'edit', id: 'CH-242', content: { ...pickContent(work()), body: 'تعديل بعد النشر' } });

  // Rule 1: the new revision is unapproved and unscheduled.
  assert.equal(work().status, 'DRAFT');
  assert.equal(work().release, undefined);
  assert.equal(work().scheduled, undefined);
  assert.equal(work().revision, publishedRevision + 1);
  assert(!ready(work()));

  // Rule 2: what was actually published is still on the record.
  assert.equal(work().publications.length, 1);
  assert.equal(work().publications[0].revision, publishedRevision);
  assert.equal(work().publications[0].outcome, 'PARTIAL');
  assert.deepEqual(work().publications[0].results, dispatched);
  assert.equal(work().publications[0].scheduled, '2026-09-23T18:00');
  // The live result slate belongs to the new, unpublished revision.
  assert.deepEqual(work().results, {});
});

test('Admin cannot approve or publish, and reading notification does not approve', () => {
  let s = initialState();
  s = reducer(s, { type: 'role', role: 'admin' });
  s = reducer(s, { type: 'approve', id: 'CH-241' });
  assert.equal(s.work[0].status, 'IN_REVIEW');
  s = reducer(s, { type: 'read', id: 'n1' });
  assert(s.notices[0].read);
  assert.equal(s.work[0].status, 'IN_REVIEW');
  s = reducer(s, { type: 'publish', id: 'CH-242' });
  assert.equal(s.work[1].status, 'APPROVED');
});

test('failed publication and invalid input stay coherent', () => {
  const seeded = initialState().work.length;
  let s = initialState();
  s = reducer(s, { type: 'role', role: 'publisher' });
  s = reducer(s, { type: 'schedule', id: 'CH-242', date: 'bad-date' });
  assert.equal(s.work[1].status, 'APPROVED');
  s = reducer(s, { type: 'publish', id: 'CH-242' });
  s = reducer(s, { type: 'result', id: 'CH-242', mode: 'failure' });
  assert.equal(s.work[1].status, 'FAILED');
  s = reducer(s, { type: 'create', content: pickContent(s.work[0]), submit: true });
  assert.equal(s.work.length, seeded, 'the publishing officer cannot author content');
});

test('submitted and approved snapshots survive later edits with exact copy, variants and assets', () => {
  let s = initialState();
  const send = (a) => {
    s = reducer(s, a);
  };
  const work = () => s.work[0];

  const submitted = structuredClone(work().history[0]);
  send({ type: 'approve', id: 'CH-241' });
  const approved = structuredClone(work().history.at(-1));

  send({ type: 'role', role: 'producer' });
  send({
    type: 'edit',
    id: 'CH-241',
    content: {
      ...pickContent(work()),
      body: 'المحتوى الجديد',
      assetId: 'poster',
      assetVersion: 3,
      channels: ['X'],
      variants: { Instagram: '', X: 'صياغة جديدة', LinkedIn: '' },
    },
  });

  assert.deepEqual(work().history[0], submitted);
  assert.deepEqual(work().history.at(-1), approved);
  assert.equal(work().history.at(-1).release.assetVersion, 4);
  assert.equal(work().history.at(-1).release.assetId, 'reel');
  assert.equal(work().release, undefined);

  send({ type: 'submit', id: 'CH-241' });
  assert.equal(work().history.length, 3);
  assert.equal(work().history.at(-1).release.revision, 5);
  assert.equal(work().history.at(-1).release.variants.X, 'صياغة جديدة');
});

test('retry cannot replace a successful channel even if retry result fails', () => {
  let s = initialState();
  const send = (a) => {
    s = reducer(s, a);
  };
  send({ type: 'role', role: 'publisher' });
  send({ type: 'publish', id: 'CH-242' });
  send({ type: 'result', id: 'CH-242', mode: 'partial' });
  const successful = s.work[1].results.Instagram;

  send({ type: 'retry', id: 'CH-242' });
  send({ type: 'result', id: 'CH-242', mode: 'failure' });
  assert.equal(s.work[1].results.Instagram, successful);
  assert.equal(s.work[1].results.X, 'SUCCESS');
  assert.equal(s.work[1].results.LinkedIn, 'FAILED');
  assert.equal(s.work[1].status, 'PARTIAL');
});

test('notices are scoped to the roles they address', () => {
  const s = initialState();

  // The publishing officer is not shown the director's review queue.
  const publisher = noticesFor('publisher', s.notices).map((n) => n.id);
  assert(!publisher.includes('n1'));
  assert(publisher.includes('n3'));

  // Admin sees system notices only, never content review or authoring queues.
  const admin = noticesFor('admin', s.notices).map((n) => n.id);
  assert.deepEqual(admin.sort(), ['n4', 'n5']);

  // A submission for review reaches the reviewers and the owner, not the writer
  // of an unrelated item and not Admin.
  let next = reducer(s, { type: 'role', role: 'member' });
  next = reducer(next, { type: 'submit', id: 'CH-245' });
  const created = next.notices[0];
  assert.equal(created.kind, 'action');
  assert(created.for.includes('director'));
  assert(created.for.includes('assistant'));
  assert(created.for.includes('member'));
  assert(!created.for.includes('admin'));
  assert(!created.for.includes('writer'));
});

test('every role gets its own home tiles and no two roles share the same set', () => {
  const s = initialState();
  const signatures = new Set();

  for (const role of roleIds) {
    const tiles = homeTiles({ ...s, role });
    assert(tiles.length >= 4, `${role} should have at least four home tiles`);
    for (const tile of tiles) {
      assert(tile.label.trim().length > 0, `${role} tile needs a label`);
      assert(tile.hint.trim().length > 0, `${role} tile needs a hint`);
    }
    signatures.add(tiles.map((t) => t.key).join('|'));
  }

  assert.equal(signatures.size, roleIds.length, 'each role must present a distinct tile set');
});

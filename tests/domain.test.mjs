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
  scenario,
  isOverdue,
  isOpen,
  dueSoon,
  dueNote,
  matchesDue,
  personById,
  teamLoad,
  stageOf,
  isMine,
  canEdit,
  staleVariants,
  diffWords,
  releaseChanges,
  previousRelease,
  channelRisks,
  riskText,
  atRiskSchedules,
  parseTime,
  notesFor,
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

test('a design switch notice shows as a message and changes nothing else', () => {
  const s = initialState();
  const n = reducer(s, { type: 'notify', text: 'التصميم: الهوية الجديدة لمركز الاتصال' });
  assert.equal(n.message, 'التصميم: الهوية الجديدة لمركز الاتصال');
  assert.deepEqual({ ...n, message: s.message }, s);
  assert.equal(reducer(n, { type: 'clear' }).message, '');
});

test('overdue and due-soon are measured against the scenario date (F-R01-02)', () => {
  const s = initialState();
  assert.equal(scenario.today, '2026-09-21');
  const overdue = s.work.filter((w) => isOverdue(w)).map((w) => w.id).sort();
  const soon = s.work.filter((w) => dueSoon(w)).map((w) => w.id).sort();
  assert.deepEqual(overdue, ['CH-243', 'CH-247', 'CH-248']);
  assert.deepEqual(soon, ['CH-241', 'CH-245', 'CH-246']);
  // The seed holds on-time work too, and nothing is both late and due soon.
  assert(s.work.some((w) => isOpen(w) && !isOverdue(w) && !dueSoon(w)));
  assert(!overdue.some((id) => soon.includes(id)));

  // Approved, scheduled and published work is delivered: never overdue, whatever its date.
  const approved = { ...s.work.find((w) => w.id === 'CH-242'), due: '2026-09-01' };
  assert.equal(isOverdue(approved), false);
  // The rule follows the date it is given, not the viewer's clock.
  const late = s.work.find((w) => w.id === 'CH-241');
  assert.equal(isOverdue(late, '2026-09-23'), true);
  assert.equal(dueSoon(late, '2026-09-23'), false);

  assert.equal(dueNote(s.work.find((w) => w.id === 'CH-243')), 'متأخر يومين');
  assert.equal(dueNote(s.work.find((w) => w.id === 'CH-247')), 'متأخر 3 أيام');
  assert.equal(dueNote(s.work.find((w) => w.id === 'CH-248')), 'متأخر يوماً واحداً');
  assert.equal(dueNote(s.work.find((w) => w.id === 'CH-246')), 'يستحق اليوم');
  assert.equal(dueNote(s.work.find((w) => w.id === 'CH-241')), 'يستحق غداً');

  // Leadership homes show both counts, each linked to exactly that filter.
  for (const role of ['director', 'assistant']) {
    const tiles = homeTiles({ ...s, role });
    const o = tiles.find((t) => t.key === 'overdue');
    const d = tiles.find((t) => t.key === 'soon');
    assert.equal(o.value, 3);
    assert.equal(o.href, '/work?due=overdue');
    assert.equal(d.value, 3);
    assert.equal(d.href, '/work?due=soon');
    assert.equal(s.work.filter((w) => matchesDue(w, 'overdue')).length, o.value);
  }
});

test('work is assigned to named people and leadership sees load per person (F-R01-01, F-R01-17)', () => {
  const s = initialState();
  // Every item names a person whose role matches the item's role.
  for (const w of s.work) assert.equal(personById(w.assignee).role, w.owner, w.id);
  // Two people share a specialism, so assignment is to a person, not a role.
  const writers = new Set(s.work.filter((w) => w.owner === 'writer').map((w) => w.assignee));
  assert.deepEqual([...writers].sort(), ['khalid', 'lama']);

  const load = teamLoad(s.work);
  const lama = load.find((x) => x.person.id === 'lama');
  assert.equal(lama.overdue, 1);
  assert.equal(load.reduce((n, x) => n + x.items.length, 0), s.work.length);
  assert.equal(load.find((x) => x.person.id === 'khalid').awaitingReview, 1);

  // Stage says where the work stands, beyond its status.
  assert.equal(stageOf(s.work.find((w) => w.id === 'CH-247')), 'الإنتاج · كتابة النص');
  assert.equal(stageOf(s.work.find((w) => w.id === 'CH-241')), 'بانتظار المراجعة والاعتماد');

  // The writer simulates Khalid: Lama's work is not "mine" and not editable by him.
  const lamas = s.work.find((w) => w.id === 'CH-247');
  assert.equal(isMine('writer', lamas), false);
  assert.equal(canEdit('writer', lamas), false);
  assert.equal(canEdit('director', lamas), true);
  let next = reducer({ ...s, role: 'writer' }, { type: 'submit', id: 'CH-247' });
  assert.equal(next.work.find((w) => w.id === 'CH-247').status, 'DRAFT');
  next = reducer({ ...s, role: 'writer' }, { type: 'submit', id: 'CH-243' });
  assert.equal(next.work.find((w) => w.id === 'CH-243').status, 'IN_REVIEW');
});

test('a variant written before the master text changed is flagged until edited or confirmed (F-R01-05)', () => {
  let s = reducer(initialState(), { type: 'role', role: 'writer' });
  const x = () => s.work.find((w) => w.id === 'CH-243');
  // The seed's X variant was written for an earlier master text.
  assert.deepEqual(staleVariants(x()), ['X']);

  // Confirming records the current master text as its base; the flag clears.
  let content = pickContent(x());
  content = { ...content, variantBase: { ...content.variantBase, X: content.body } };
  s = reducer(s, { type: 'edit', id: 'CH-243', content });
  assert.deepEqual(staleVariants(x()), []);

  // Editing the master text again flags every variant written before it.
  s = reducer(s, { type: 'edit', id: 'CH-243', content: { ...pickContent(x()), body: 'نص أساسي جديد' } });
  assert.deepEqual(staleVariants(x()), ['X']);
  // The submitted release carries the flag to the reviewer.
  s = reducer(s, { type: 'submit', id: 'CH-243' });
  assert.deepEqual(staleVariants(x().release), ['X']);

  // Rewriting the variant against the new text clears it.
  const fresh = pickContent(x());
  s = reducer(s, { type: 'role', role: 'director' });
  s = reducer(s, { type: 'changes', id: 'CH-243', text: 'حدّث صياغة X' });
  s = reducer(s, { type: 'role', role: 'writer' });
  s = reducer(s, {
    type: 'edit',
    id: 'CH-243',
    content: { ...fresh, variants: { ...fresh.variants, X: 'صياغة X جديدة' }, variantBase: { ...fresh.variantBase, X: fresh.body } },
  });
  assert.deepEqual(staleVariants(x()), []);
  // An empty variant falls back to the master text and is never stale.
  assert.deepEqual(staleVariants({ ...pickContent(x()), body: 'آخر', variants: { Instagram: '', X: '', LinkedIn: '' } }), []);
});

test('the difference between two revisions highlights changed Arabic text and lists changed fields (F-R01-06)', () => {
  const before = 'شكراً لكل من شارك معنا في التحضير لليوم الوطني.';
  const after = 'شكراً لكل المتطوعين والزملاء الذين شاركوا معنا في التحضير لليوم الوطني السعودي.';
  const parts = diffWords(before, after);
  const rebuild = (kinds) => parts.filter((p) => kinds.includes(p.kind)).map((p) => p.text).join('');
  assert.equal(rebuild(['same', 'add']), after);
  assert.equal(rebuild(['same', 'del']), before);
  assert(parts.some((p) => p.kind === 'add' && p.text.includes('المتطوعين')));
  assert(parts.some((p) => p.kind === 'del' && p.text.includes('شارك')));
  assert(parts[0].kind === 'same' && parts[0].text.startsWith('شكراً لكل'));
  assert.deepEqual(diffWords('نص', 'نص'), [{ kind: 'same', text: 'نص' }]);

  // The seeded item has revisions 1 and 2: different text and a newer poster.
  const w = initialState().work.find((x) => x.id === 'CH-250');
  const prev = previousRelease(w, w.release.revision);
  assert.equal(prev.revision, 1);
  assert.equal(w.release.revision, 2);
  const fields = releaseChanges(prev, w.release);
  assert.deepEqual(fields.map((f) => f.label), ['الوسيط']);
  assert.equal(fields[0].before, 'الملصق النهائي · v4');
  assert.equal(fields[0].after, 'الملصق النهائي · v5');
  // A first revision has nothing to compare with.
  assert.equal(previousRelease(w, 1), undefined);
});

test('scheduling warns when a channel authorization will not cover the publication time (F-R01-07)', () => {
  // X runs out at noon on the campaign day; LinkedIn has already expired.
  const evening = channelRisks(['Instagram', 'X', 'LinkedIn'], '2026-09-23T18:00');
  assert.deepEqual(evening.map((r) => [r.channel, r.expired]), [['X', false], ['LinkedIn', true]]);
  const morning = channelRisks(['Instagram', 'X'], '2026-09-23T09:00');
  assert.deepEqual(morning, []);
  assert(riskText(evening[0]).includes('قبل موعد النشر'));
  assert(riskText(evening[1]).includes('منتهٍ'));

  // The seeded evening publication is at risk and listed for the publishing officer.
  const s = initialState();
  assert.deepEqual(atRiskSchedules(s.work).map((x) => x.work.id), ['CH-244']);

  // Scheduling onto a risky channel is allowed but says so at once.
  let next = reducer({ ...s, role: 'publisher' }, { type: 'schedule', id: 'CH-242', date: '2026-09-23T18:00' });
  assert.equal(next.work.find((w) => w.id === 'CH-242').status, 'SCHEDULED');
  assert(next.message.includes('تنبيه') && next.message.includes('X'));
  assert.equal(next.notices[0].kind, 'attention');
  next = reducer({ ...s, role: 'publisher' }, { type: 'schedule', id: 'CH-242', date: '2026-09-22T09:00' });
  assert(next.message.includes('LinkedIn'));
});

test('video review notes are bound to a typed time, kept in time order, and travel with a change request (F-R01-03)', () => {
  assert.equal(parseTime('01:30'), 90);
  assert.equal(parseTime('1:05'), 65);
  assert.equal(parseTime('01:75'), null);
  assert.equal(parseTime('ninety'), null);

  let s = reducer(initialState(), { type: 'role', role: 'director' });
  const reel = () => s.work.find((w) => w.id === 'CH-241');
  s = reducer(s, { type: 'video-note', id: 'CH-241', at: '1:30', text: 'قصّ اللقطة قبل ظهور الشعار' });
  s = reducer(s, { type: 'video-note', id: 'CH-241', at: '00:10', text: 'العنوان يظهر متأخراً' });
  const notes = notesFor(reel(), 4);
  assert.deepEqual(notes.map((n) => n.at), ['00:10', '00:45', '01:30']);
  assert.equal(notes[2].by, 'محمد');

  // Invalid time, a non-video work, or a role without standing are refused.
  const before = reel().videoNotes.length;
  s = reducer(s, { type: 'video-note', id: 'CH-241', at: '90', text: 'خطأ' });
  assert.equal(reel().videoNotes.length, before);
  assert(s.message.includes('01:30'));
  s = reducer(s, { type: 'video-note', id: 'CH-242', at: '00:20', text: 'ليست فيديو' });
  assert.equal(s.work.find((w) => w.id === 'CH-242').videoNotes.length, 0);
  let pub = reducer({ ...s, role: 'publisher' }, { type: 'video-note', id: 'CH-241', at: '00:20', text: 'لا' });
  assert.equal(pub.work.find((w) => w.id === 'CH-241').videoNotes.length, before);

  // A change request carries the chosen notes, in time order, to the producer.
  s = reducer(s, { type: 'changes', id: 'CH-241', text: 'عدّل المونتاج', notes: [notes[2].id, notes[0].id] });
  const comment = reel().comments.at(-1).text;
  assert(comment.startsWith('عدّل المونتاج'));
  assert(comment.indexOf('00:10') < comment.indexOf('01:30'));
  assert(!comment.includes('00:45'));
  assert.equal(reel().history.at(-1).note, comment);
});

test('a calendar move is only a request until the publishing officer confirms it (task 0.3.4.1, A12)', () => {
  let s = initialState();
  const item = () => s.work.find((w) => w.id === 'CH-244');
  const before = item().scheduled;

  // A writer cannot request; the director can, and the schedule does not change.
  s = reducer({ ...s, role: 'writer' }, { type: 'move-request', id: 'CH-244', date: '2026-09-24T18:00' });
  assert.equal(s.moveRequests.length, 0);
  s = reducer({ ...s, role: 'director' }, { type: 'move-request', id: 'CH-244', date: '2026-09-24T18:00' });
  assert.deepEqual(s.moveRequests, [{ workId: 'CH-244', date: '2026-09-24T18:00', by: 'director' }]);
  assert.equal(item().scheduled, before);
  assert(s.notices[0].for.includes('publisher'));
  assert.equal(s.notices[0].kind, 'action');

  // Unscheduled work cannot be moved, and the same time is not a move.
  s = reducer(s, { type: 'move-request', id: 'CH-242', date: '2026-09-24T18:00' });
  s = reducer(s, { type: 'move-request', id: 'CH-244', date: before });
  assert.equal(s.moveRequests.length, 1);

  // A new request for the same work replaces the old one.
  s = reducer(s, { type: 'move-request', id: 'CH-244', date: '2026-09-25T10:00' });
  assert.deepEqual(s.moveRequests.map((r) => r.date), ['2026-09-25T10:00']);

  // The publishing officer confirms by scheduling, which clears the request.
  s = reducer({ ...s, role: 'publisher' }, { type: 'schedule', id: 'CH-244', date: '2026-09-25T10:00' });
  assert.equal(item().scheduled, '2026-09-25T10:00');
  assert.equal(s.moveRequests.length, 0);

  // Only the publishing officer or the requester cancels.
  s = reducer({ ...s, role: 'director' }, { type: 'move-request', id: 'CH-244', date: '2026-09-26T10:00' });
  s = reducer({ ...s, role: 'assistant' }, { type: 'move-cancel', id: 'CH-244' });
  assert.equal(s.moveRequests.length, 1);
  s = reducer({ ...s, role: 'publisher' }, { type: 'move-cancel', id: 'CH-244' });
  assert.equal(s.moveRequests.length, 0);
});

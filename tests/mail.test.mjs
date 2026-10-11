import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  needsApproval,
  isLead,
  isApprover,
  inFolder,
  isUnread,
  awaiting,
  cardWaits,
  parseQuery,
  matches,
  mailErrorText,
  sysText,
  replyMinutes,
  hoursMinutes,
  fullWhen,
  groupMembers,
  isEmail,
  tokenOf,
  MAIL_ATTACH_BYTES,
} from '../src/lib/mail/rules.ts';
import { composeOutgoing } from '../src/lib/mail/gmail.ts';

const NOW = Date.parse('2026-10-11T08:40:00Z');
const thread = (over = {}) => ({
  id: 't1', kind: 'internal', subject: 'موضوع', created_by: 'a@x.sa', created_at: '2026-10-11T05:00:00Z',
  last_at: '2026-10-11T06:00:00Z', labels: [], links: [], contact_email: null, contact_name: null,
  ext_status: null, assignee: null, reply_by: null, req_no: null, ...over,
});
const msg = (over = {}) => ({
  id: `m${Math.random()}`, thread_id: 't1', kind: 'mail', author: 'b@x.sa', from_name: null, from_email: null,
  to_list: ['p:a@x.sa'], cc_list: [], bcc_list: [], body: 'نص', created_at: '2026-10-11T06:00:00Z', send_at: null,
  state: 'sent', hold_by: null, hold_note: null, ext_sent_at: null, error: null, refs: [], files: [], inbound_files: [], card: null, ...over,
});
const view = (t = {}, ms = [msg()], member = null) => ({ thread: thread(t), messages: ms, member });
const ctx = (role = 'writer', me = 'a@x.sa') => ({ me, role, now: NOW });

test('outside mail waits for approval unless the director, the assistant, or the assignee replying', () => {
  const p = { me: 'w@x.sa', external: true, newThread: true, assignee: null };
  assert.equal(needsApproval({ ...p, role: 'writer' }), true);
  assert.equal(needsApproval({ ...p, role: 'publisher' }), true);
  assert.equal(needsApproval({ ...p, role: 'director' }), false);
  assert.equal(needsApproval({ ...p, role: 'assistant' }), false);
  assert.equal(needsApproval({ ...p, role: 'admin' }), false);
  assert.equal(needsApproval({ ...p, role: 'writer', newThread: false, assignee: 'w@x.sa' }), false);
  assert.equal(needsApproval({ ...p, role: 'writer', newThread: false, assignee: 'r@x.sa' }), true);
  assert.equal(needsApproval({ ...p, role: 'writer', external: false }), false);
});

test('the shared mailbox is for the director, the assistant and the publisher', () => {
  assert.deepEqual(['director', 'assistant', 'publisher', 'admin', 'writer', 'designer', 'producer', 'member'].map(isLead),
    [true, true, true, true, false, false, false, false]);
  assert.deepEqual(['director', 'assistant', 'publisher', 'writer'].map(isApprover), [true, true, false, false]);
});

test('inbox shows threads with mail from others; sent shows mine', () => {
  const incoming = view();
  assert.equal(inFolder(incoming, 'inbox', ctx()), true);
  const mine = view({}, [msg({ author: 'a@x.sa' })]);
  assert.equal(inFolder(mine, 'inbox', ctx()), false);
  assert.equal(inFolder(mine, 'sent', ctx()), true);
});

test('archived, trashed and snoozed threads leave the inbox', () => {
  assert.equal(inFolder(view({}, [msg()], { archived: true }), 'inbox', ctx()), false);
  assert.equal(inFolder(view({}, [msg()], { archived: true }), 'archive', ctx()), true);
  assert.equal(inFolder(view({}, [msg()], { trashed: true }), 'inbox', ctx()), false);
  assert.equal(inFolder(view({}, [msg()], { trashed: true }), 'trash', ctx()), true);
  const snoozed = view({}, [msg()], { snooze_until: '2026-10-12T05:00:00Z' });
  assert.equal(inFolder(snoozed, 'inbox', ctx()), false);
  assert.equal(inFolder(snoozed, 'snoozed', ctx()), true);
});

test('held outside mail is only in «بانتظار الاعتماد», for its author and approvers', () => {
  const held = view({ kind: 'external', ext_status: 'waiting' }, [msg({ author: 'w@x.sa', state: 'held', to_list: ['e:o@out.sa'] })]);
  assert.equal(inFolder(held, 'gate', ctx('director', 'd@x.sa')), true);
  assert.equal(inFolder(held, 'gate', ctx('writer', 'w@x.sa')), true);
  assert.equal(inFolder(held, 'inbox', ctx('director', 'd@x.sa')), false);
  assert.equal(inFolder(held, 'action', ctx('director', 'd@x.sa')), true);
  assert.equal(inFolder(held, 'action', ctx('writer', 'w@x.sa')), false);
});

test('scheduled mail shows in «المجدولة» for its author until its time', () => {
  const sched = view({}, [msg({ author: 'a@x.sa', send_at: '2026-10-12T05:00:00Z' })]);
  assert.equal(inFolder(sched, 'scheduled', ctx()), true);
  assert.equal(inFolder(sched, 'sent', ctx()), false);
});

test('shared folders for leads: open, unassigned, closed', () => {
  const v = view({ kind: 'external', ext_status: 'new', contact_email: 'o@out.sa' }, [msg({ author: null, from_email: 'o@out.sa' })]);
  assert.equal(inFolder(v, 'shared:unassigned', ctx('director', 'd@x.sa')), true);
  assert.equal(inFolder(v, 'shared:unassigned', ctx('writer')), false);
  const closed = view({ kind: 'external', ext_status: 'closed', assignee: 'r@x.sa' }, [msg({ author: null })]);
  assert.equal(inFolder(closed, 'shared:closed', ctx('publisher', 'p@x.sa')), true);
  assert.equal(inFolder(closed, 'shared:all', ctx('publisher', 'p@x.sa')), false);
});

test('unread compares the latest message from someone else with my read time', () => {
  assert.equal(isUnread(view(), 'a@x.sa', NOW), true);
  assert.equal(isUnread(view({}, [msg()], { read_at: '2026-10-11T07:00:00Z' }), 'a@x.sa', NOW), false);
  assert.equal(isUnread(view({}, [msg({ author: 'a@x.sa' })]), 'a@x.sa', NOW), false);
});

test('cards wait for the right person', () => {
  const approval = { type: 'approval', state: 'pending', asset_id: 'x', name: 'ن', version: 2, by: 'p@x.sa' };
  assert.equal(cardWaits(approval, 'd@x.sa', 'director'), true);
  assert.equal(cardWaits(approval, 'w@x.sa', 'writer'), false);
  const date = { type: 'date', state: 'pending', askee: 'd@x.sa', by: 'n@x.sa', asset_id: 'x', name: 'ن', proposed: '', channels: [] };
  assert.equal(cardWaits(date, 'd@x.sa', 'director'), true);
  assert.equal(cardWaits({ ...date, state: 'counter' }, 'n@x.sa', 'publisher'), true);
  const task = { type: 'task', state: 'open', assignee: 'w@x.sa', by: 'r@x.sa', what: '', due: '', priority: 'normal', progress: 0, task_id: 'k' };
  assert.equal(cardWaits(task, 'w@x.sa', 'writer'), true);
  assert.equal(cardWaits({ ...task, state: 'done' }, 'w@x.sa', 'writer'), false);
  assert.equal(awaiting(view({}, [msg({ card: task })]), 'w@x.sa', 'writer'), true);
});

test('search understands words and operators', () => {
  const q = parseQuery('تغطية from:events has:attachment is:unread label:شركاء');
  assert.deepEqual(q.words, ['تغطية']);
  assert.deepEqual(q.from, ['events']);
  assert.deepEqual(q.has, ['attachment']);
  const v = view({ kind: 'external', subject: 'طلب تغطية', labels: ['شركاء'] }, [
    msg({ author: null, from_email: 'events@partner-org.sa', inbound_files: [{ name: 'a.pdf', size: 1, mime: 'application/pdf' }] }),
  ]);
  const nameOf = (e) => e;
  assert.equal(matches(v, q, nameOf, 'a@x.sa', NOW), true);
  assert.equal(matches(v, parseQuery('from:press'), nameOf, 'a@x.sa', NOW), false);
  assert.equal(matches(v, parseQuery('in:internal'), nameOf, 'a@x.sa', NOW), false);
});

test('reply time counts only while the ball is with the department', () => {
  const t = thread({ kind: 'external', ext_status: 'assigned', reply_by: '2026-10-11T09:40:00Z' });
  assert.equal(replyMinutes(t, NOW), 60);
  assert.equal(replyMinutes({ ...t, ext_status: 'waiting' }, NOW), null);
  assert.equal(hoursMinutes(-100), '1 س 40 د');
  assert.equal(hoursMinutes(45), '45 د');
});

test('database refusals become Arabic sentences, never raw codes', () => {
  for (const code of ['REF_NOT_APPROVED', 'TASK_ROLE', 'BAD_RECIPIENT', 'CARD_INTERNAL_ONLY', 'TASK_TERMS_LOCKED', 'something else']) {
    const t = mailErrorText(`ERROR: ${code}`);
    assert.match(t, /[؀-ۿ]/);
    assert.doesNotMatch(t, /[A-Z]{3,}_/);
  }
});

test('timeline lines read without gendered verbs and name the record', () => {
  const nameOf = (e) => ({ 'r@x.sa': 'ريم' })[e] ?? e;
  assert.equal(sysText({ e: 'assign', to: 'r@x.sa', req: 185 }, nameOf), 'إسناد المحادثة إلى ريم، رقم الطلب الخارجي #185');
  assert.equal(sysText({ e: 'approval', op: 'approve', name: 'فيديو', version: 2 }, nameOf), 'اعتماد الإصدار 2 من «فيديو»');
  assert.equal(sysText({ e: 'progress', what: 'العنوان', pct: 50 }, nameOf), 'تحديث تقدّم المهمة «العنوان» إلى 50٪');
  assert.equal(sysText({ e: 'unknown' }, nameOf), '');
});

test('dates on the public page are in Riyadh time', () => {
  assert.equal(fullWhen('2026-10-15T16:00:00Z', true), 'الخميس 15 أكتوبر · 19:00');
});

test('groups follow roles and never include administrators', () => {
  const people = [
    { email: 'a', role: 'admin' }, { email: 'd', role: 'director' }, { email: 'w', role: 'writer' },
    { email: 's', role: 'designer' }, { email: 'p', role: 'producer' }, { email: 'm', role: 'member' },
  ];
  assert.deepEqual(groupMembers('production', people), ['w', 's', 'p']);
  assert.deepEqual(groupMembers('leaders', people), ['d']);
  assert.equal(groupMembers('all', people).includes('a'), false);
});

test('recipient tokens and addresses', () => {
  assert.equal(tokenOf.external(' Hind@AlYaum.sa '), 'e:hind@alyaum.sa');
  assert.equal(isEmail('a@b.sa'), true);
  assert.equal(isEmail('a@b'), false);
  assert.equal(MAIL_ATTACH_BYTES, 25 * 1024 * 1024);
});

test('outgoing mail carries review links and the two date buttons, escaped', () => {
  const out = composeOutgoing({
    id: 'x', subject: 's', body: 'مرحباً <script>x</script>', to: [], cc: [], bcc: [], author_name: 'ريم', in_reply_to: null, references: [],
    date_token: 'a'.repeat(64), card: { type: 'date', name: 'إعلان', proposed: '2026-10-15T16:00:00Z' },
    refs: [{ name: 'فيديو', drive: 'd', size: 1, mime: 'video/mp4', version: 2, link: 'b'.repeat(64) }], files: [],
  }, 'https://hub.example');
  assert.match(out.text, /https:\/\/hub\.example\/r\/b{64}/);
  assert.match(out.text, /https:\/\/hub\.example\/m\/a{64}\?a=confirm/);
  assert.match(out.html, /dir="rtl"/);
  assert.match(out.html, /&lt;script&gt;/);
  assert.doesNotMatch(out.html, /<script>/);
  assert.match(out.text, /الخميس 15 أكتوبر · 19:00 \(بتوقيت الرياض\)/);
});

test('the mail page never shows a raw status or role key, and has no emoji', () => {
  const files = ['src/components/mail/mail-page.tsx', 'src/components/mail/thread.tsx', 'src/components/mail/composer.tsx', 'src/lib/mail/rules.ts'];
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    assert.doesNotMatch(s, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, f);
  }
  const page = readFileSync('src/components/mail/thread.tsx', 'utf8');
  assert.doesNotMatch(page, />\s*(IN_REVIEW|CHANGES_REQUESTED|director|publisher)\s*</);
});

test('every mail function the page calls exists in a migration', () => {
  const sql = ['20261011220000_mail.sql', '20261011230000_mail_file_names.sql'].map((f) => readFileSync(`supabase/migrations/${f}`, 'utf8')).join('\n');
  const used = new Set();
  for (const f of ['src/components/mail/mail-page.tsx', 'src/components/mail/thread.tsx', 'src/components/mail/provider.tsx', 'src/lib/mail/sync.ts'])
    for (const m of readFileSync(f, 'utf8').matchAll(/['"](mail_[a-z_]+)['"]/g)) used.add(m[1]);
  for (const fn of used) if (!['mail_threads', 'mail_messages', 'mail_members', 'mail_settings', 'mail_rules'].includes(fn))
    assert.match(sql, new RegExp(`create function public\\.${fn}\\(`), fn);
});

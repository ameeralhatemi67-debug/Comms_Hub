import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  unreadCount,
  mentionsMe,
  readers,
  composerPopup,
  canEdit,
  canUrgent,
  canAssign,
  canChannel,
  snippet,
  duration,
  chatSysText,
  chatErrorText,
  grouping,
  waveform,
  REACTIONS,
  COMMANDS,
  URGENCY_AR,
  urgencySteps,
  cardUrgency,
  urgencyTier,
} from '../src/lib/chat/rules.ts';
import { capability } from '../src/lib/permissions.ts';

const msg = (over = {}) => ({
  id: `m${Math.random()}`, room_id: 'r', author: 'b@x.sa', kind: 'text', body: 'نص', reply_to: null, forwarded: false,
  urgency: 0, data: null, deleted: false, edited_at: null, created_at: '2026-10-12T08:00:00Z', ...over,
});
const member = (over = {}) => ({ room_id: 'r', email: 'a@x.sa', admin: false, joined_at: '', last_read_at: '2026-10-12T07:00:00Z', muted: false, pinned: false, ...over });

test('unread counts messages from others after my read time, never timeline lines', () => {
  const ms = [msg(), msg({ author: 'a@x.sa' }), msg({ kind: 'sys' }), msg({ created_at: '2026-10-12T06:00:00Z' })];
  assert.equal(unreadCount(ms, member(), 'a@x.sa'), 1);
  assert.equal(unreadCount(ms, undefined, 'a@x.sa'), 0);
});

test('mentions are found by display name after the read time', () => {
  assert.equal(mentionsMe([msg({ body: 'مرحبا @ريم' })], member(), 'a@x.sa', 'ريم'), true);
  assert.equal(mentionsMe([msg({ body: 'مرحبا @خالد' })], member(), 'a@x.sa', 'ريم'), false);
});

test('read receipts come from members whose read time passed the message', () => {
  const m = msg({ author: 'a@x.sa' });
  const ms = [member({ email: 'a@x.sa' }), member({ email: 'b@x.sa', last_read_at: '2026-10-12T09:00:00Z' }), member({ email: 'c@x.sa' })];
  assert.deepEqual(readers(m, ms), ['b@x.sa']);
});

test('slash commands at the start, mentions only in groups', () => {
  assert.deepEqual(composerPopup('/مه', false), { kind: 'cmd', q: 'مه' });
  assert.deepEqual(composerPopup('مرحبا @ر', false), { kind: 'men', q: 'ر' });
  assert.equal(composerPopup('مرحبا @ر', true), null);
  assert.equal(composerPopup('نص عادي', false), null);
  // Seven since the messaging tab; «صلاحية» (ask for a permission) added by Permissions_Plan.md, Step P3.
  assert.equal(COMMANDS.length, 8);
  assert.ok(COMMANDS.some((c) => c.word === 'صلاحية' && c.id === 'perm'));
});

test('edits are the author\'s, text only, within fifteen minutes', () => {
  const now = Date.parse('2026-10-12T08:10:00Z');
  assert.equal(canEdit(msg({ author: 'a@x.sa' }), 'a@x.sa', now), true);
  assert.equal(canEdit(msg({ author: 'a@x.sa' }), 'a@x.sa', now + 10 * 60000), false);
  assert.equal(canEdit(msg(), 'a@x.sa', now), false);
  assert.equal(canEdit(msg({ author: 'a@x.sa', kind: 'voice' }), 'a@x.sa', now), false);
});

test('role rules match the database functions', () => {
  assert.deepEqual(['director', 'assistant', 'admin', 'publisher', 'writer'].map(canUrgent), [true, true, true, false, false]);
  assert.deepEqual(['director', 'assistant', 'producer', 'admin', 'writer', 'designer'].map(canAssign), [true, true, true, true, false, false]);
  assert.equal(canChannel('publisher'), false);
  const sql = readFileSync('supabase/migrations/20261012000000_chat_profiles.sql', 'utf8');
  assert.match(sql, /media_acts\(array\['director','assistant'\]\) then\s+raise exception 'URGENT_ROLE'/);
  assert.match(sql, /media_acts\(array\['director','assistant','producer'\]\) then raise exception 'TASK_ROLE'/);
  assert.match(sql, /p_type = 'channel' and not public\.media_acts\(array\['director','assistant'\]\)/);
});

test('snippets describe every kind in Arabic', () => {
  assert.equal(snippet(msg({ kind: 'voice', data: { dur: 65 } })), 'رسالة صوتية 1:05');
  assert.equal(snippet(msg({ kind: 'poll', data: { q: 'أي يوم؟' } })), 'تصويت: أي يوم؟');
  assert.equal(snippet(msg({ deleted: true })), 'حُذفت هذه الرسالة');
  assert.equal(duration(9), '0:09');
});

test('timeline lines are noun-phrased and name people', () => {
  const nameOf = (e) => ({ 'r@x.sa': 'ريم' })[e] ?? e;
  assert.equal(chatSysText({ e: 'added', who: 'r@x.sa' }, nameOf), 'انضمام ريم');
  assert.equal(chatSysText({ e: 'approval', op: 'approve', version: 2, name: 'فيديو' }, nameOf), 'اعتماد الإصدار 2 من «فيديو»');
  assert.equal(chatSysText({ e: 'to_mail' }, nameOf), 'نقل النقاش إلى البريد الرسمي');
  assert.equal(chatSysText(null, nameOf), '');
});

test('database refusals become Arabic sentences', () => {
  for (const code of ['CHANNEL_POST', 'URGENT_ROLE', 'TASK_ASSIGNEE', 'EDIT_WINDOW', 'nonsense']) {
    const t = chatErrorText(`ERROR: ${code}`);
    assert.match(t, /[؀-ۿ]/);
    assert.doesNotMatch(t, /[A-Z]{3,}_/);
  }
});

test('messages within five minutes from one author group together', () => {
  const a = msg({ created_at: '2026-10-12T08:00:00Z' });
  const b = msg({ created_at: '2026-10-12T08:02:00Z' });
  const c = msg({ created_at: '2026-10-12T08:09:00Z' });
  assert.deepEqual(grouping(undefined, a, b), { first: true, last: false });
  assert.deepEqual(grouping(a, b, c), { first: false, last: true });
});

test('waveform has fixed bars within bounds', () => {
  const w = waveform(Array.from({ length: 200 }, (_, i) => (i % 10) / 10));
  assert.equal(w.length, 38);
  assert.ok(w.every((v) => v >= 8 && v <= 100));
  assert.equal(waveform([]).length, 38);
});

test('reactions are words with icons, never emoji, and match the database', () => {
  const sql = readFileSync('supabase/migrations/20261012000000_chat_profiles.sql', 'utf8');
  assert.match(sql, /kind in \('check','eye','heart','flag','clock'\)/);
  assert.deepEqual(REACTIONS.map((r) => r[0]), ['check', 'eye', 'heart', 'flag', 'clock']);
  for (const f of ['src/components/chat/chat-tab.tsx', 'src/components/chat/urgency.tsx', 'src/components/profile-editor.tsx', 'src/components/people.tsx', 'src/lib/chat/rules.ts'])
    assert.doesNotMatch(readFileSync(f, 'utf8'), /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, f);
});

test('every chat function the page calls exists in the migration', () => {
  const sql = readFileSync('supabase/migrations/20261012000000_chat_profiles.sql', 'utf8');
  const used = new Set();
  for (const f of ['src/components/chat/chat-tab.tsx', 'src/components/chat/provider.tsx', 'src/components/people.tsx'])
    for (const m of readFileSync(f, 'utf8').matchAll(/['"]((?:chat|profile)_[a-z_]+)['"]/g)) used.add(m[1]);
  for (const fn of used)
    if (!['chat_messages', 'chat_members', 'chat_reactions', 'chat_votes', 'chat_acks', 'chat_rooms', 'chat_stars', 'chat-live'].includes(fn))
      assert.match(sql, new RegExp(`create function public\\.${fn}\\(`), fn);
});

test('urgency: four steps named as the owner accepted (D-10), locked by what the person holds', () => {
  assert.deepEqual([1, 2, 3].map((l) => URGENCY_AR[l]), ['للانتباه', 'مهم', 'عاجل']);
  const none = urgencySteps(() => false);
  assert.deepEqual(none.map((s) => s.ok), [true, true, false, false]);
  assert.deepEqual(none.map((s) => s.cap), [null, null, 'urgency.2', 'urgency.3']);
  assert.ok(none[2].why && none[3].why && !none[0].why && !none[1].why);
  // Level 2 may be asked for; level 3 is fixed by the reference and offers nothing.
  assert.equal(capability('urgency.2').grantable, true);
  assert.equal(capability('urgency.3').grantable, false);
  const two = urgencySteps((k) => k === 'urgency.2');
  assert.deepEqual(two.map((s) => s.ok), [true, true, true, false]);
  const lead = urgencySteps((k) => k === 'urgency.2' || k === 'urgency.3');
  assert.ok(lead.every((s) => s.ok && !s.why));
});

test('urgency: notice tiers and a task card priority as chat_send and the mail cards word them', () => {
  assert.deepEqual([0, 1, 2, 3].map(urgencyTier), [null, 'attention', 'attention', 'decide']);
  assert.equal(cardUrgency('urgent'), 3);
  assert.equal(cardUrgency('normal'), 0);
  assert.equal(cardUrgency(undefined), 0);
  assert.equal(chatErrorText('URGENCY_2'), 'رسائل «مهم» لمن يملك صلاحيتها. اطلبها ممن يدير رتبتك.');
  assert.equal(chatErrorText('URGENT_ROLE'), 'الرسائل العاجلة لمدير الاتصال ومساعده.');
  const sql = readFileSync('supabase/migrations/20261013190000_urgency.sql', 'utf8');
  assert.match(sql, /when 1 then 'للانتباه' when 2 then 'مهم' when 3 then 'عاجل'/);
  assert.match(sql, /v_u = 3 and not public\.has_capability\('urgency\.3'\)/);
  assert.match(sql, /v_u = 2 and not public\.use_capability\('urgency\.2'\)/);
  assert.match(sql, /case when v_u = 3 then 'decide' else 'attention' end/);
});

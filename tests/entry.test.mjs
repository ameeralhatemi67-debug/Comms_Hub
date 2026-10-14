import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ENTRY_STATE_AR, ENTRY_NEXT_AR, inviteMessage, isEntryState, linkProblem, rejectedMessage, requestNoticeMessage } from '../src/lib/entry.ts';
import { EVENT_KINDS, eventText, permError } from '../src/lib/permissions.ts';
import { noticeHref } from '../src/lib/work/rules.ts';

const sql = readFileSync(new URL('../supabase/migrations/20261014130000_entry_flow.sql', import.meta.url), 'utf8');

test('a failed mailed link is read from the hash or the query string', () => {
  const hash = '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';
  assert.deepEqual(linkProblem(hash, ''), { kind: 'expired', code: 'otp_expired' });
  assert.deepEqual(linkProblem('', '?error=access_denied&error_code=otp_expired'), { kind: 'expired', code: 'otp_expired' });
  assert.equal(linkProblem('#error=server_error&error_code=unexpected_failure', '')?.kind, 'denied');
  assert.equal(linkProblem('', ''), null);
  assert.equal(linkProblem('#access_token=abc&type=recovery', '?tab=members'), null);
});

test('the four entry states are worded, and only the last needs no next step', () => {
  for (const s of ['not_started', 'unconfirmed', 'confirmed', 'active']) {
    assert.ok(isEntryState(s));
    assert.ok(ENTRY_STATE_AR[s].length > 0, s);
  }
  assert.equal(isEntryState('other'), false);
  assert.equal(ENTRY_NEXT_AR.active, '');
  for (const s of ['not_started', 'unconfirmed', 'confirmed']) assert.ok(ENTRY_NEXT_AR[s].length > 0, s);
});

test('the invitation names the person, the role in Arabic, the address, the site and the steps', () => {
  const m = inviteMessage({ name: 'سارة <b>', role: 'writer', email: 'sara@example.com', site: 'https://hub.example', by: 'أمير' });
  assert.ok(m.text.includes('كاتب المحتوى'));
  assert.ok(m.text.includes('sara@example.com'));
  assert.ok(m.text.includes('https://hub.example'));
  assert.ok(m.text.includes('أول دخول'));
  assert.ok(!m.text.includes('writer'), 'no raw role key');
  assert.ok(m.html.includes('&lt;b&gt;'), 'the name is escaped in HTML');
  assert.ok(!m.html.includes('<b>سارة'), 'no injected markup');
  assert.ok(m.subject.length > 0);
});

test('the notice to the leaders carries the link to the requests tab and escapes the note', () => {
  const m = requestNoticeMessage({ name: 'خالد', email: 'k@example.com', note: '<script>x</script>', site: 'https://hub.example' });
  assert.ok(m.text.includes('https://hub.example/accounts?tab=requests'));
  assert.ok(!m.html.includes('<script>'));
});

test('the refusal notice promises no reason and sends the person to a human', () => {
  const m = rejectedMessage({ name: 'خالد' });
  assert.ok(m.text.includes('لم يُقبل'));
  assert.ok(m.text.includes('مسؤول النظام'));
});

test('no emoji in anything the site sends', () => {
  const all = [
    inviteMessage({ name: 'a', role: 'member', email: 'a@b.co', site: 'https://x.y', by: 'b' }),
    requestNoticeMessage({ name: 'a', email: 'a@b.co', note: null, site: 'https://x.y' }),
    rejectedMessage({ name: 'a' }),
  ];
  for (const m of all) assert.doesNotMatch(m.subject + m.text + m.html, /\p{Extended_Pictographic}/u);
});

test('the new log kinds are in the database constraint and worded in the interface', () => {
  const kinds = sql.match(/check \(kind in \(([^)]+)\)/)[1].match(/'([a-z_]+)'/g).map((k) => k.slice(1, -1));
  for (const k of kinds) assert.ok(EVENT_KINDS[k], k);
  const nameOf = (e) => (e === 'a@x' ? 'أمير' : 'سارة');
  assert.match(eventText({ id: 1, at: '2026-10-14T10:00:00Z', actor: 'a@x', subject: 's@x', role: null, capability: null, kind: 'invite', data: { count: 2 } }, nameOf), /دعوة/);
  assert.match(eventText({ id: 2, at: '2026-10-14T10:00:00Z', actor: 'a@x', subject: 's@x', role: null, capability: null, kind: 'entry_help', data: { what: 'reset' } }, nameOf), /كلمة مرور/);
});

test('refusals of the new functions are worded', () => {
  assert.match(permError('INVITE_TOO_SOON'), /دقيقة/);
  assert.match(permError('ALREADY_ACTIVE'), /دخل/);
});

test('a notice about a request opens the requests tab of the people page', () => {
  assert.equal(noticeHref({ page: 'members', tab: 'requests' }), '/accounts?tab=requests');
});

test('the migration answers a request the same way for known and unknown addresses', () => {
  const fn = sql.slice(sql.indexOf('create or replace function public.request_access'), sql.indexOf('create function public.entry_notice_targets'));
  assert.ok(!fn.includes('has_account') && !fn.includes('already_pending'));
  assert.match(sql, /revoke execute on function public\.email_status\(text\) from anon/);
  // Every function that reads who has an account or an invitation is closed to visitors.
  for (const f of ['entry_states()', 'invite_prepare(text)', 'invite_mark(text)', 'entry_help_log(text, text)', 'request_reject_notice(text)'])
    assert.ok(sql.includes(`revoke all on function public.${f} from public, anon`), f);
});

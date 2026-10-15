// Action_Plan.md section 5: the tester feedback channel and error monitoring. The database half is
// supabase/tests/feedback_errors_rules.sql (qa/feedback-errors-rules.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  KIND_AR,
  MAX_REPORTS_PER_VISIT,
  NOTE_KINDS,
  describeError,
  feedbackErrorAr,
  reportGate,
  worthReporting,
} from '../src/lib/feedback/rules.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('kinds and words', () => {
  assert.deepEqual(NOTE_KINDS.map((k) => k[0]), ['idea', 'problem', 'question']);
  assert.equal(KIND_AR.error, 'خطأ في الصفحة');
  assert.match(feedbackErrorAr('FEEDBACK_LIMIT'), /20/);
  assert.match(feedbackErrorAr('TEXT_TOO_LONG'), /2000/);
  assert.match(feedbackErrorAr('something else'), /أعد المحاولة/);
});

test('browser noise and cancelled requests are not reported', () => {
  for (const m of ['ResizeObserver loop completed with undelivered notifications.', 'Script error.', 'AbortError: The user aborted a request.', 'TypeError: Failed to fetch', 'NetworkError when attempting to fetch resource.', '', 'ab'])
    assert.equal(worthReporting(m), false, m);
  assert.equal(worthReporting("TypeError: Cannot read properties of undefined (reading 'title')"), true);
});

test('a visit sends each message once and at most five', () => {
  const g = reportGate();
  assert.equal(g('Error one'), true);
  assert.equal(g('Error one'), false);
  for (let i = 2; i <= MAX_REPORTS_PER_VISIT; i += 1) assert.equal(g(`Error ${i} here`), true);
  assert.equal(g('One more error'), false);
});

test('the place of an error has no address, line or column', () => {
  const e = new Error('boom here');
  e.stack = 'Error: boom here\n    at WorkItem (https://comms-hub-three.vercel.app/_next/static/chunks/item-abc123.js:10:20)\n    at x (y.js:1:2)';
  const d = describeError(e);
  assert.equal(d.message, 'boom here');
  assert.match(d.where, /WorkItem/);
  assert.doesNotMatch(d.where, /https?:|:\d+/);
  assert.equal(describeError('a string error').message, 'a string error');
  assert.equal(describeError(undefined).message, '');
  assert.equal(describeError(new Error('x'.repeat(500))).message.length, 300);
});

test('wiring: the shell reports and offers the note, the error page reports, the inbox is a settings tab', () => {
  const shell = read('src/components/shell.tsx');
  assert.match(shell, /<FeedbackButton \/>/);
  assert.match(shell, /useErrorReporter\(\)/);
  assert.match(read('src/app/error.tsx'), /reportError\(error\)/);
  const sup = read('src/components/supporting.tsx');
  assert.match(sup, /id: 'feedback'/);
  assert.match(sup, /<FeedbackTab \/>/);
  const comp = read('src/components/feedback.tsx');
  for (const rpc of ['feedback_submit', 'error_report', 'feedback_list', 'feedback_mark']) assert.ok(comp.includes("rpc('" + rpc + "'"), rpc);
  // The reporter never sends the page's query, a person's text or any address.
  assert.match(comp, /window\.location\.pathname/);
  assert.doesNotMatch(comp, /location\.href|location\.search|document\.cookie|localStorage/);
});

test('the migration closes the table and scrubs', () => {
  const sql = read('supabase/migrations/20261015240000_feedback_errors.sql');
  assert.match(sql, /alter table public\.feedback_reports enable row level security/);
  assert.doesNotMatch(sql, /create policy/);
  assert.match(sql, /revoke all on function public\.feedback_clean_page\(text\), public\.feedback_scrub\(text, int\) from public, anon, authenticated/);
  assert.match(sql, /has_capability\('settings\.view', null\)/);
  assert.match(sql, /has_capability\('settings\.manage', null\)/);
});

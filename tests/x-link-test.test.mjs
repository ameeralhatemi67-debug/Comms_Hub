// «تجربة النشر بالرابط» (MVP_draft.md section 83, src/lib/work/x-link-test.ts): the words and the rules the page shares with the database
// (supabase/migrations/20261126120000_x_link_tests.sql), and where the panel is drawn. The database's half is held by
// supabase/tests/x_link_test_rules.sql; the page is clicked through by qa/x-link-test-flow.cjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  X_TEST_DAILY_LIMIT,
  X_TEST_ERROR_AR,
  X_TEST_MODE_AR,
  X_TEST_MODE_HELP_AR,
  X_TEST_NOT_READY,
  X_TEST_TEXT,
  profileLink,
  shownLink,
  testLineAr,
  testTextProblem,
  xTestErrorAr,
  xTestNotReady,
} from '../src/lib/work/x-link-test.ts';
import { X_LIMIT, checkNote, xLength } from '../src/lib/work/x-link.ts';

const migration = readFileSync('supabase/migrations/20261126120000_x_link_tests.sql', 'utf8');
const channels = readFileSync('src/components/work/channels.tsx', 'utf8');

test('the daily limit is the database\'s, and the two kinds of test are the ones it accepts', () => {
  const sql = /from public\.x_link_tests where account_id = p_account and created_at > now\(\) - interval '1 day'\) >= (\d+)/.exec(migration);
  assert.ok(sql, 'the limit is in the function');
  assert.equal(Number(sql[1]), X_TEST_DAILY_LIMIT);
  const kinds = /mode in \('([a-z]+)','([a-z]+)'\)/.exec(migration);
  assert.deepEqual([kinds[1], kinds[2]].sort(), Object.keys(X_TEST_MODE_AR).sort());
  assert.deepEqual(Object.keys(X_TEST_MODE_HELP_AR).sort(), Object.keys(X_TEST_MODE_AR).sort());
});

test('every refusal the database can give has its words, and the words name no refusal the database does not give', () => {
  const raised = new Set([...migration.matchAll(/raise exception '([A-Z_]+)'/g)].map((m) => m[1]));
  assert.deepEqual([...raised].sort(), Object.keys(X_TEST_ERROR_AR).sort());
  for (const code of raised) assert.equal(xTestErrorAr(`ERROR: ${code}`), X_TEST_ERROR_AR[code], code);
  assert.match(xTestErrorAr('something else'), /تعذّر تسجيل التجربة/);
  assert.match(xTestErrorAr(null), /تعذّر تسجيل التجربة/);
  assert.match(X_TEST_ERROR_AR.TEST_LIMIT, new RegExp(String(X_TEST_DAILY_LIMIT)));
});

test('the database reuses the one pattern of a post\'s link, and refuses a test on anything but an X account on the link route', () => {
  assert.match(migration, /m := public\.x_post_parse\(p_url\)/);
  assert.match(migration, /a\.platform = 'x' and a\.route = 'link'/);
  assert.match(migration, /public\.platform_conn_manage\(\) or \(public\.work_publisher\(\) and public\.current_email\(\) = any \(a\.publishers\)\)/, 'the same who as the other tests');
  assert.match(migration, /revoke all on public\.x_link_tests from public, anon, authenticated;/);
  assert.doesNotMatch(migration, /grant (insert|update|delete)/i, 'a page writes nothing itself');
});

test('a migration that has not been run is told apart from a refusal', () => {
  assert.ok(xTestNotReady({ code: 'PGRST202', message: 'Could not find the function public.x_link_test_record' }));
  assert.ok(xTestNotReady({ code: 'PGRST205', message: 'Could not find the table' }));
  assert.ok(xTestNotReady({ code: '42883', message: 'function does not exist' }));
  assert.ok(xTestNotReady({ code: '42P01', message: 'relation does not exist' }));
  assert.ok(!xTestNotReady({ code: 'P0001', message: 'FORBIDDEN' }));
  assert.ok(!xTestNotReady({ code: 'P0001', message: 'POST_LINK_OTHER_ACCOUNT' }));
  assert.ok(!xTestNotReady(null));
  assert.match(X_TEST_NOT_READY, /الرابط سليم/);
});

test('the account\'s page on X is offered only for a handle X could have', () => {
  assert.equal(profileLink('@T_X'), 'https://x.com/T_X');
  assert.equal(profileLink(' hedayah_ar '), 'https://x.com/hedayah_ar');
  for (const bad of ['', null, undefined, 'two words', 'abcdefghijklmnop', 'a/b', 'a?b', '@'] ) assert.equal(profileLink(bad), null, String(bad));
});

test('the test text starts plain: no link, no emoji, within X\'s limit, and an empty one is refused', () => {
  assert.ok(xLength(X_TEST_TEXT) > 10 && xLength(X_TEST_TEXT) <= X_LIMIT);
  assert.doesNotMatch(X_TEST_TEXT, /https?:|www\./i);
  assert.doesNotMatch(X_TEST_TEXT, /\p{Extended_Pictographic}/u);
  assert.equal(testTextProblem(X_TEST_TEXT), null);
  assert.match(testTextProblem('   '), /اكتب نص/);
});

test('a test is told in a line: the kind, when, who; and its link without the scheme', () => {
  assert.equal(testLineAr({ mode: 'existing', created_at: '2026-11-26T10:00:00Z' }, 'مدير', () => 'اليوم'), 'فحص بلا نشر · اليوم · مدير');
  assert.equal(testLineAr({ mode: 'new', created_at: '2026-11-26T10:00:00Z' }, 'ناشر', () => 'أمس'), 'نشر تجريبي · أمس · ناشر');
  assert.equal(shownLink('https://x.com/t_x/status/123456789'), 'x.com/t_x/status/123456789');
});

test('X\'s lookup is advice for the test as for the hand-off: it stops a post of another account, and nothing else', () => {
  assert.equal(checkNote({ found: true, author: 'T_X' }, '@t_x').level, 'ok');
  assert.equal(checkNote({ found: true, author: 'someone' }, '@t_x').level, 'bad');
  assert.equal(checkNote({ found: false, author: null }, '@t_x').level, 'warn');
  assert.equal(checkNote({ found: null, author: null }, '@t_x').level, 'warn');
});

test('the panel is drawn in the account\'s sheet for an X account on the link route, to the people the database allows', () => {
  assert.match(channels, /import \{ XLinkTest \} from '\.\/x-link-test';/);
  assert.match(channels, /a\.platform === 'x' && a\.route === 'link' && \(mgr \|\| \(pub && a\.publishers\.includes\(w\.me\)\)\) && <XLinkTest a=\{a\} \/>/);
});

test('the panel says nothing is sent to X and nothing deleted from it, and offers the test that publishes nothing first', () => {
  const panel = readFileSync('src/components/work/x-link-test.tsx', 'utf8');
  assert.match(panel, /لا يرسل الموقع شيئاً إلى X ولا يحذف منها شيئاً/);
  assert.match(panel, /useState<XTestMode>\('existing'\)/, 'the default is the one that posts nothing');
  assert.match(panel, /احذفه أنت من X بعد التجربة/);
  assert.match(panel, /data-gd="xl-test"/);
  assert.doesNotMatch(panel, /\p{Extended_Pictographic}/u);
});

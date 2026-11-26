// X's link route (MVP_draft.md section 81, src/lib/work/x-link.ts): the link that opens X's composer, the length as X counts it, a post's
// link as the pages and the database read it, and what the pages say when it is wrong. The database's half is held by
// supabase/tests/x_link_route_rules.sql; the page is clicked through by qa/x-link-flow.cjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { POST_URL, X_COMPOSER, X_LIMIT, composerLink, handleOf, isWaiting, oembedLink, parsePostLink, postLinkProblem, xLength } from '../src/lib/work/x-link.ts';
import { workErrorText, accountState, WORK_RPC } from '../src/lib/work/rules.ts';

const migration = readFileSync('supabase/migrations/20261125120000_work_cycle_x_link_route.sql', 'utf8');

test('the composer link is X\'s documented web intent, with the text encoded and nothing else', () => {
  assert.equal(X_COMPOSER, 'https://x.com/intent/tweet');
  const link = composerLink('مرحباً & أهلاً؟ #هداية');
  const url = new URL(link);
  assert.equal(url.origin + url.pathname, X_COMPOSER);
  assert.deepEqual([...url.searchParams.keys()], ['text'], 'no media, no account, no other parameter: the composer takes none of them');
  assert.equal(url.searchParams.get('text'), 'مرحباً & أهلاً؟ #هداية');
  assert.equal(new URL(composerLink('')).searchParams.get('text'), '');
});

test('a post is counted as X counts it: a link is 23, Arabic and Latin letters are 1, Chinese and the like are 2', () => {
  assert.equal(X_LIMIT, 280);
  assert.equal(xLength('abc'), 3);
  assert.equal(xLength('مرحباً بكم'), 10);
  assert.equal(xLength('https://example.org/a/very/long/path?with=query'), 23);
  assert.equal(xLength('رابط https://example.org/x'), 5 + 23);
  assert.equal(xLength('漢字'), 4);
  assert.equal(xLength('a\nb'), 3);
  assert.equal(xLength('x'.repeat(280)), 280);
});

test('a post\'s link: x.com or twitter.com, the account, status, a number; tracking and a photo\'s tail are dropped', () => {
  const ok = (s) => parsePostLink(s);
  assert.deepEqual(ok('https://x.com/Hedayah_ar/status/1234567890123456789'), { handle: 'Hedayah_ar', id: '1234567890123456789', url: 'https://x.com/Hedayah_ar/status/1234567890123456789' });
  assert.equal(ok(' https://twitter.com/a/status/12345?s=20 ')?.url, 'https://x.com/a/status/12345');
  assert.equal(ok('http://www.x.com/a/status/12345/photo/1')?.url, 'https://x.com/a/status/12345');
  assert.equal(ok('https://mobile.twitter.com/A_1/status/99999#top')?.handle, 'A_1');
  for (const bad of ['', 'x.com/a/status/12345', 'https://example.com/a/status/12345', 'https://x.com/a', 'https://x.com/a/status/abc', 'https://x.com/a/status/12', 'https://x.com/i/web/status/12345', 'https://x.com/abcdefghijklmnop/status/12345', 'https://x.com.evil.test/a/status/12345', 'https://evil.test/?u=https://x.com/a/status/12345'])
    assert.equal(ok(bad), null, bad);
});

test('the pattern of a post\'s link is the database\'s, character for character', () => {
  const sql = /regexp_match\(btrim\(coalesce\(p_url, ''\)\),\s*'([^']+)'/.exec(migration);
  assert.ok(sql, 'x_post_parse is in the migration');
  assert.equal(sql[1], POST_URL);
});

test('what a person is told when the link is wrong: empty, not a post, another account\'s post', () => {
  assert.match(postLinkProblem('', '@t_x'), /الصق رابط المنشور/);
  assert.match(postLinkProblem('https://example.com/t_x/status/12345', '@t_x'), /ليس رابط منشور/);
  assert.match(postLinkProblem('https://x.com/someone/status/12345', '@t_x'), /لحساب آخر \(@someone\).*@t_x/);
  assert.equal(postLinkProblem('https://x.com/T_X/status/12345', '@t_x'), null, 'letters do not matter');
  assert.equal(postLinkProblem('https://x.com/t_x/status/12345', 't_x'), null, 'nor does the @');
  assert.equal(handleOf(' @abc '), 'abc');
});

test('X\'s public lookup is asked only about a post\'s own link, with its address encoded', () => {
  const p = parsePostLink('https://twitter.com/a/status/12345?s=1');
  const u = new URL(oembedLink(p));
  assert.equal(u.origin + u.pathname, 'https://publish.x.com/oembed');
  assert.equal(u.searchParams.get('url'), 'https://x.com/a/status/12345');
  const route = readFileSync('src/app/api/platforms/x-post/route.ts', 'utf8');
  assert.match(route, /guard\(request, \{ mutating: true \}\)/, 'only a signed-in page of this site');
  assert.match(route, /parsePostLink/, 'and only a post\'s link');
  assert.doesNotMatch(route, /Authorization|Bearer|service_role|MAIL_SERVER_KEY/, 'no key of any kind');
});

test('a waiting account is not a failed one, and the words of the new refusals are Arabic', () => {
  assert.equal(isWaiting({ pending: true }), true);
  assert.equal(isWaiting({ ok: false }), false);
  assert.equal(isWaiting(undefined), false);
  for (const code of ['POST_LINK_INVALID', 'POST_LINK_OTHER_ACCOUNT', 'POST_LINK_USED', 'HANDLE_INVALID']) assert.match(workErrorText(`ERROR: ${code}`), /[؀-ۿ]/, code);
  assert.match(workErrorText('Could not find the function public.account_add_link(p_label) in the schema cache'), /قاعدة البيانات لم يُطبَّق/);
  assert.deepEqual(accountState({ active: true, authorized_until: null, route: 'link' }, new Date().toISOString()), ['نشر بالرابط', 'approved']);
  assert.deepEqual(accountState({ active: false, authorized_until: null, route: 'link' }, new Date().toISOString()), ['موقوف', '']);
  assert.ok(WORK_RPC.includes('account_add_link') && WORK_RPC.includes('work_link_confirm'));
});

test('the migration gives a page only what it needs: two functions, nothing for the inner one', () => {
  assert.match(migration, /grant execute on function public\.account_add_link\(text, text, text\[\]\) to authenticated/);
  assert.match(migration, /grant execute on function public\.work_link_confirm\(text, uuid, text, boolean\) to authenticated/);
  assert.match(migration, /revoke all on function public\.x_post_parse\(text\)/);
  assert.doesNotMatch(migration.replace(/^--.*$/gm, ''), /service_role|vault|secret|token/i, 'no key or token in this route (its comments say so)');
});

import { withRef } from '../src/lib/work/x-link.ts';
test('a reply goes through in_reply_to, a quote is the post\'s link in the text, and a bad link falls back to a new post', () => {
  const ref = 'https://twitter.com/a/status/1234567890?s=20';
  assert.equal(new URL(composerLink('نص', { replyTo: '1234567890' })).searchParams.get('in_reply_to'), '1234567890');
  assert.deepEqual([...new URL(composerLink('نص', { replyTo: 'abc' })).searchParams.keys()], ['text'], 'only a post number is accepted');
  assert.deepEqual(withRef('نص', 'reply', ref), { text: 'نص', replyTo: '1234567890' });
  assert.deepEqual(withRef('نص', 'quote', ref), { text: 'نص\nhttps://x.com/a/status/1234567890' });
  assert.deepEqual(withRef('نص', 'quote', 'nonsense'), { text: 'نص' });
  assert.deepEqual(withRef('نص', 'none', ref), { text: 'نص' });
});

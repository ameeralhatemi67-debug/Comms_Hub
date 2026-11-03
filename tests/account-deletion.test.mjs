// «طلب حذف حسابي» and the pages Google Play reads (Android_Build_Plan.md A8; MVP_draft.md 64.6): the words are one
// list in the panel, the public page and the specification; the migration's rules are the remove rule of
// account_remove; the privacy policy says what the code asks. The database's own rules are held by
// supabase/tests/account_deletion_rules.sql.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DELETED, KEPT, DELETION_PAGE, deletionError, NOTE_MAX } from '../src/lib/account-deletion.ts';
import { HOLD } from '../src/lib/kit/hold-reasons.ts';

const read = (f) => fs.readFileSync(f, 'utf8');
const sql = read('supabase/migrations/20261028120000_account_deletion.sql');
const page = read('public/account-deletion.html');
const privacy = read('public/privacy.html');

test('what is deleted and what stays is one list: the panel\'s words are the public page\'s', () => {
  assert.equal(DELETION_PAGE, '/account-deletion.html');
  assert.ok(fs.existsSync(`public${DELETION_PAGE}`));
  const ar = page.slice(page.indexOf('<div class="ar"'));
  for (const x of [...DELETED, ...KEPT]) assert.ok(ar.includes(`<li>${x}.</li>`), x);
  assert.equal(DELETED.length + KEPT.length, (ar.match(/<li>/g) ?? []).length - 3, 'the three steps besides');
});

test('the database deletes what the lists say, and keeps the rest', () => {
  // What removing any account already takes (foreign keys and accounts_revoke_sign_in), and what a request adds.
  for (const t of ['notifications where recipient', 'reminders where owner', 'guide_progress where email', 'chat_stars where email']) assert.match(sql, new RegExp(`delete from public\\.${t} = old\\.email;`), t);
  assert.match(read('supabase/migrations/20261011000000_accounts.sql'), /delete from auth\.users where lower\(email\) = old\.email;/);
  assert.doesNotMatch(sql, /delete from public\.(works|media_|mail_|chat_messages|work_|activity_log|permission_events)/, 'the record stays');
});

test('who is told and who may see is the remove rule of account_remove, never for a founder', () => {
  assert.match(sql, /perm_eval\(a\.email, 'members\.remove', null\)/);
  assert.match(sql, /a\.role = 'admin' or public\.perm_rank\(a\.role\) > public\.perm_rank\(t\.role\)/);
  assert.match(sql, /not t\.protected and a\.email <> t\.email/);
  assert.match(read('supabase/migrations/20261013150000_permissions.sql'), /tr := public\.perm_require\(p_email, 'members\.remove'\);/, 'account_remove asks the same capability');
  assert.match(sql, /'decide', 'طلب ' \|\| acc\.display_name/);
  assert.match(sql, /'info', 'سحب ' \|\| v_name/);
  assert.match(sql, /jsonb_build_object\('page', 'members', 'tab', 'requests'\)/);
  assert.match(sql, /create policy account_deletions_read on public\.account_deletions\s+for select to authenticated using \(public\.deletion_visible\(email\)\);/);
  assert.doesNotMatch(sql, /for (insert|update|delete|all)/i, 'nobody writes the table but the functions');
  assert.match(sql, /revoke all on function public\.deletion_carriers\(text\) from public, anon, authenticated;/);
  assert.match(sql, /check \(note is null or char_length\(note\) <= 500\)/);
  assert.equal(NOTE_MAX, 500);
  assert.ok(fs.existsSync('supabase/tests/account_deletion_rules.sql'));
});

test('every refusal of the database has its Arabic sentence', () => {
  const raised = [...sql.matchAll(/raise exception '([A-Z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(raised)].sort(), ['FORBIDDEN', 'PROTECTED_ACCOUNT', 'TOO_MANY']);
  const fallback = deletionError('anything');
  for (const r of raised) {
    assert.match(deletionError(`${r}`), /[؀-ۿ]/, r);
    assert.notEqual(deletionError(r), fallback, `${r} has its own sentence`);
  }
});

test('the panel asks with a long press, tells the phones, and points to the public page', () => {
  const panel = read('src/components/account-deletion.tsx');
  assert.match(panel, /data-hold=\{HOLD\.deletionRequest\}/);
  assert.ok(HOLD.deletionRequest.length > 20);
  assert.match(panel, /rpc\('account_deletion_request', \{ p_note: note\.trim\(\) \|\| null \}\)/);
  assert.match(panel, /else \{\s*kickPush\(\);/, 'the people told are pushed at once');
  assert.match(panel, /rpc\('account_deletion_withdraw'\)/);
  assert.match(panel, /href=\{DELETION_PAGE\}/);
  assert.match(read('src/components/supporting.tsx'), /<AccountDeletionPanel \/>\s*<\/div>\s*\);/);
  const data = read('src/components/accounts/data.tsx');
  assert.match(data, /from\('account_deletions'\)\.select\('id, email, name, note, status, created_at'\)\.eq\('status', 'open'\)/);
  assert.match(data, /\.filter\(\(x\) => x\.email !== me\.email\)/, 'one\'s own request is on «الحساب»');
  assert.match(read('src/components/accounts/page.tsx'), /<DeletionRequests onRemove=\{setRemoving\} \/>/);
  assert.match(read('src/components/accounts/members.tsx'), /const asked = people\.filter\(\(m\) => a\.deletions\.some\(\(d\) => d\.email === m\.email\)\);/);
});

test('the privacy policy and the deletion page: public, without scripts, dated, and saying what the code asks', async () => {
  // Each page carries the date it last changed: the deletion page 28 October, the policy 3 November (the YouTube test).
  for (const [html, en, ar] of [[page, '28 October 2026', '28 أكتوبر 2026'], [privacy, '3 November 2026', '3 نوفمبر 2026']]) {
    assert.doesNotMatch(html, /<script/i);
    assert.match(html, new RegExp(`Last updated: ${en}`));
    assert.match(html, new RegExp(`آخر تحديث: ${ar}`));
    assert.match(html, /<div class="ar" lang="ar" dir="rtl">/);
  }
  assert.match(privacy, /href="\/account-deletion\.html"/);
  assert.match(page, /href="\/privacy\.html"/);
  // The Google permissions the code asks of a person, each named in the policy (Firebase's is the server's own).
  const { GOOGLE_SCOPES } = await import('../src/lib/platforms/oauth2.ts');
  const drive = /export const DRIVE_SCOPE = '([^']+)';/.exec(read('src/lib/drive/google.ts'))[1];
  const asked = new Set([...GOOGLE_SCOPES, drive]);
  assert.equal(asked.size, 4);
  for (const s of asked) assert.ok(privacy.includes(s.replace('https://www.googleapis.com/auth/', '')), s);
  assert.match(privacy, /Google API Services User Data Policy/);
  assert.match(privacy, /Limited Use/);
  for (const w of ['Firebase Cloud Messaging', 'WhatsApp', 'Supabase', 'Vercel', 'OneDrive']) assert.ok(privacy.includes(w), w);
  // Nothing the Android application does not ask.
  const manifest = read('mobile/android/app/src/main/AndroidManifest.xml');
  for (const no of ['CAMERA', 'ACCESS_FINE_LOCATION', 'READ_CONTACTS', 'READ_MEDIA_IMAGES', 'AD_ID']) assert.doesNotMatch(manifest, new RegExp(no), no);
  assert.match(privacy, /The Hub has no camera permission\./);
});

test('no emoji in the new files', () => {
  for (const f of ['src/lib/account-deletion.ts', 'src/components/account-deletion.tsx', 'src/components/accounts/deletions.tsx', 'public/account-deletion.html', 'public/privacy.html', 'supabase/migrations/20261028120000_account_deletion.sql', 'supabase/tests/account_deletion_rules.sql', 'Play_Console_Drafts.md']) {
    assert.equal(/\p{Extended_Pictographic}/u.test(read(f)), false, f);
  }
});

// Settings and integrations, Step S1 (Settings_Integrations_Plan.md 4, 5): the site's half.
// The database half, with the security review, is supabase/tests/integrations_rules.sql.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { limitBytes, overLimitText, MB } from '../src/lib/integrations/limits.ts';
import { eventLine, errorAr, intError, sizeAr, STATE_AR, CONFIG_AR } from '../src/lib/integrations/rules.ts';
import { storeChecked, tailOf } from '../src/lib/integrations/vault.ts';
import { createDrive, DriveError } from '../src/lib/drive/google.ts';
import { HOLD } from '../src/lib/kit/hold-reasons.ts';
import { CAPABILITIES } from '../src/lib/permissions.ts';

const sql = readFileSync('supabase/migrations/20261014120000_integrations.sql', 'utf8');

test('the upload limit: the setting, never above the 5 GB ceiling', () => {
  assert.equal(limitBytes(100), 100 * MB);
  assert.equal(limitBytes(9999), 5 * 1024 ** 3);
  assert.equal(limitBytes(null), 5 * 1024 ** 3);
  assert.equal(limitBytes(0), 5 * 1024 ** 3);
  assert.equal(overLimitText(100 * MB), 'الملف أكبر من الحد الذي ضبطه مسؤول النظام (100 ميغابايت).');
  assert.equal(overLimitText(5 * 1024 ** 3), 'الملف أكبر من الحد المسموح (5 غيغابايت).');
  for (const f of ['src/app/api/media/upload-session/route.ts', 'src/app/api/media/[id]/version/route.ts'])
    assert.match(readFileSync(f, 'utf8'), /const limit = await uploadLimit\(supabase\);\s+if \(body\.size > limit\) return fail\(413, overLimitText\(limit\)\);/, f);
  assert.match(sql, /upload_max_mb int not null default 5120 check \(upload_max_mb between 1 and 5120\)/);
});

test('eight settings capabilities, the administrator\'s by default, in the catalog', () => {
  const s = CAPABILITIES.filter((c) => c.grp === 'settings').map((c) => c.key);
  assert.deepEqual(s, ['settings.view', 'settings.manage', 'storage.manage', 'storage.migrate', 'backups.run', 'backups.restore', 'platforms.manage', 'integrations.secrets']);
  assert.match(sql, /select r, c\.key, r = 'admin', 'installation'/);
});

test('the Drive token comes from its source: the vault (or the environment), checked before use', async () => {
  const calls = [];
  const http = async (url, init) => {
    calls.push(String(init?.body ?? ''));
    return { ok: true, json: async () => ({ access_token: 'a', expires_in: 3600, user: { emailAddress: 'x@y.z' } }) };
  };
  const env = { clientId: 'cid', clientSecret: 'cs' };
  await createDrive({ env, fetch: http, tokenSource: async () => 'from-vault' }).account();
  assert.match(calls[0], /refresh_token=from-vault/);
  const none = createDrive({ env, fetch: http, tokenSource: async () => null });
  await assert.rejects(none.account(), (e) => e instanceof DriveError && e.status === 503 && e.message === 'DRIVE_NOT_CONFIGURED');
  // Without a source, the environment, as before.
  calls.length = 0;
  await createDrive({ env: { ...env, refreshToken: 'from-env' }, fetch: http }).account();
  assert.match(calls[0], /refresh_token=from-env/);
});

/** A fake Supabase client: records rpc calls and answers from a table. */
const fake = (answers) => {
  const calls = [];
  return { calls, rpc: async (fn, args) => (calls.push({ fn, args }), answers[fn] ? answers[fn](args) : { data: null, error: null }) };
};

test('a new secret is stored pending, checked, and only then committed; a failed check discards it', async () => {
  process.env.MAIL_SERVER_KEY = 'k-test';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.example';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'pk';
  try {
    const session = fake({ int_secret_set: () => ({ data: '••••5678', error: null }) });
    const server = fake({ int_secret_use: (a) => ({ data: a.p_pending ? 'tok-12345678' : null, error: null }) });
    const ok = await storeChecked(session, 'int-1', 'google_drive', 'tok-12345678', async (t) => (t === 'tok-12345678' ? { ok: true, config: { account: 'a@b.c' } } : { ok: false, error: 'X' }), server);
    assert.deepEqual(ok, { ok: true, tail: '••••5678' });
    assert.deepEqual(session.calls.map((c) => c.fn), ['int_secret_set', 'int_secret_commit']);
    assert.equal(session.calls[1].args.p_key, 'k-test', 'commit carries the server key');
    assert.deepEqual(server.calls[0].args, { p_key: 'k-test', p_type: 'google_drive', p_purpose: 'check before commit', p_pending: true });

    const refused = fake({ int_secret_set: () => ({ data: '••••5678', error: null }) });
    const bad = await storeChecked(refused, 'int-1', 'google_drive', 'tok-12345678', async () => ({ ok: false, error: 'TOKEN_REFUSED' }), server);
    assert.deepEqual(bad, { ok: false, error: 'TOKEN_REFUSED' });
    assert.deepEqual(refused.calls.map((c) => c.fn), ['int_secret_set', 'int_secret_discard'], 'nothing committed; the old secret stays');

    const forbidden = fake({ int_secret_set: () => ({ data: null, error: { message: 'FORBIDDEN' } }) });
    assert.deepEqual(await storeChecked(forbidden, 'int-1', 'google_drive', 'tok-12345678', async () => ({ ok: true }), server), { ok: false, error: 'FORBIDDEN' });
    assert.equal(tailOf('abcdefgh'), '••••efgh');
  } finally {
    delete process.env.MAIL_SERVER_KEY;
  }
  // Without the server key the vault is not used at all.
  assert.deepEqual(await storeChecked(fake({}), 'int-1', 'google_drive', 'tok-12345678', async () => ({ ok: true })), { ok: false, error: 'VAULT_UNREACHABLE' });
});

test('no route returns a secret: the config route answers yes or no; the callback stores, not shows, when it can', () => {
  const config = readFileSync('src/app/api/integrations/config/route.ts', 'utf8');
  assert.match(config, /Boolean\(process\.env\[n\]\)/);
  assert.equal((config.match(/process\.env/g) ?? []).length, 1, 'the environment is read only inside Boolean()');
  const cb = readFileSync('src/app/api/drive/callback/route.ts', 'utf8');
  assert.ok(cb.indexOf('storeChecked(') > 0 && cb.indexOf('storeChecked(') < cb.indexOf('<textarea'), 'the token is shown only when the vault could not take it');
  const adopt = readFileSync('src/app/api/integrations/drive-adopt/route.ts', 'utf8');
  assert.doesNotMatch(adopt, /Response\.json\(\{[^}]*refresh/i);
  for (const f of ['src/components/settings/general.tsx', 'src/components/settings/audit.tsx'])
    assert.doesNotMatch(readFileSync(f, 'utf8'), /secret_id|decrypted|int_secret_use/, f);
});

test('words: states, events, errors and every refusal the migration raises', () => {
  assert.deepEqual(Object.keys(STATE_AR), ['pending', 'connected', 'needs_reconnect', 'error', 'disabled']);
  assert.equal(eventLine({ kind: 'health', integration: 'Google Drive', data: { from: 'connected', to: 'needs_reconnect', error: 'TOKEN_REFUSED' } }), 'تغيّرت حالته · Google Drive: متصل إلى يحتاج ربطاً من جديد (رفضت Google الرمز. اربط الحساب من جديد.)');
  assert.equal(eventLine({ kind: 'secret_used', integration: 'Google Drive', data: { purpose: 'drive access' } }), 'استعمل الخادم السر · Google Drive لـ «drive access»');
  assert.equal(eventLine({ kind: 'settings', integration: null, data: { maintenance_on: true, upload_max_mb: 100 } }), 'تغيّرت الإعدادات العامة: شُغّل شريط الصيانة، حد الرفع 100 ميغابايت');
  assert.equal(errorAr('DRIVE_404'), 'ردّت Google Drive بخطأ.');
  const raised = new Set([...sql.matchAll(/raise exception '([A-Z_]+)'/g)].map((m) => m[1]));
  for (const code of raised) assert.notEqual(intError(code), 'تعذّر تنفيذ الطلب. أعد المحاولة.', code);
  assert.equal(sizeAr(1536 * 1024 ** 2), '1.50 غيغابايت');
  assert.equal(sizeAr(0), 'لا شيء');
  for (const n of readFileSync('src/app/api/integrations/config/route.ts', 'utf8').match(/'([A-Z_]{6,})'/g).map((x) => x.slice(1, -1))) assert.ok(CONFIG_AR[n], n);
});

test('the disable hold reason, and no emoji in the new files', () => {
  assert.equal(HOLD.intDisable, 'إيقاف المزوّد يوقف الرفع إليه والقراءة منه حتى يُشغّل من جديد.');
  for (const f of ['src/lib/integrations/rules.ts', 'src/lib/integrations/vault.ts', 'src/components/settings/general.tsx', 'src/components/settings/audit.tsx', 'supabase/migrations/20261014120000_integrations.sql', 'supabase/tests/integrations_rules.sql'])
    assert.doesNotMatch(readFileSync(f, 'utf8'), /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, f);
});

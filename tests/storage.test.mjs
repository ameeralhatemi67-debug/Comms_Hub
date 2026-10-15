// Settings Step S2 (Settings_Integrations_Plan.md 6.1, 6.2): the site's half. The database
// half, with the access rules, is supabase/tests/storage_rules.sql.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { driveStorage } from '../src/lib/storage/drive.ts';
import { SERVED_ROLES, StorageError, storageConfigured, storageFor } from '../src/lib/storage/index.ts';
import { DriveError } from '../src/lib/drive/google.ts';
import {
  COMING_PROVIDERS,
  COPY_ROLE_AR,
  COPY_STATE_AR,
  EVENT_AR,
  STORAGE_ROLE_AR,
  checkedAr,
  eventLine,
} from '../src/lib/integrations/rules.ts';

const sql = readFileSync(new URL('../supabase/migrations/20261014140000_storage_locations.sql', import.meta.url), 'utf8');

/** A Drive client that answers from a script, for the adapter. */
const fakeDrive = (answer) => ({
  rootFolder: async () => 'root',
  startUpload: async () => 'https://upload.example/session',
  createFolder: async () => 'folder',
  rename: async () => {},
  move: async () => {},
  trash: async () => {},
  fileInfo: async (id) => answer(id),
  open: async () => new Response('x'),
  checksum: async () => 'md5',
  account: async () => 'a@b.co',
  quota: async () => ({ used: 1, total: null }),
});

test('a check says ok, missing or failed, and stops the batch when the provider is not connected', async () => {
  const drive = fakeDrive((id) => {
    if (id === 'good') return { id, name: 'a', mimeType: 'image/png', size: '1000' };
    if (id === 'big') return { id, name: 'a', mimeType: 'image/png', size: '1200' };
    if (id === 'bin') return { id, name: 'a', mimeType: 'image/png', size: '1000', trashed: true };
    if (id === 'gone') throw new DriveError(404, 'DRIVE_404');
    if (id === 'off') throw new DriveError(503, 'DRIVE_NOT_CONFIGURED');
    throw new DriveError(500, 'DRIVE_500');
  });
  const p = driveStorage(drive);
  assert.deepEqual(await p.check('good', 1000), { state: 'ok', size: 1000 });
  assert.deepEqual(await p.check('good', null), { state: 'ok', size: 1000 });
  assert.deepEqual(await p.check('big', 1000), { state: 'failed', size: 1200 });
  assert.deepEqual(await p.check('bin', 1000), { state: 'missing', size: 1000 });
  assert.deepEqual(await p.check('gone', 1000), { state: 'missing', size: null });
  assert.deepEqual(await p.check('odd', 1000), { state: 'failed', size: null });
  await assert.rejects(p.check('off', 1000), (e) => e instanceof StorageError && e.status === 503);
});

test('the adapter passes everything else straight to the Drive client', async () => {
  const p = driveStorage(fakeDrive(() => ({ id: 'x', name: 'n', mimeType: 'm' })));
  assert.equal(p.type, 'google_drive');
  assert.equal(await p.rootFolder(), 'root');
  assert.equal(await p.account(), 'a@b.co');
  assert.equal((await p.info('x')).name, 'n');
  assert.equal(await p.checksum('x'), 'md5');
  assert.deepEqual(await p.quota(), { used: 1, total: null });
});

test('a Drive error is a storage error, so any provider can be caught the same way', () => {
  const e = new DriveError(404, 'DRIVE_404');
  assert.ok(e instanceof StorageError);
  assert.equal(e.status, 404);
  assert.equal(e.message, 'DRIVE_404');
});

test('the library, mail and chat roles have a provider; backup has none yet', async () => {
  assert.deepEqual([...SERVED_ROLES], ['library', 'mail', 'chat']);
  for (const r of SERVED_ROLES) assert.equal(storageFor(r).type, 'google_drive');
  assert.throws(() => storageFor('backup'), (e) => e instanceof StorageError && e.status === 503);
  assert.equal(await storageConfigured('backup'), false);
});

test('the routes that serve and change files go through the role map, not Drive by name', () => {
  const walk = (dir) =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  // The Drive connection itself (OAuth, health, adopting the token) is the provider's own code.
  const own = [/api[\\/]drive[\\/]/, /api[\\/]integrations[\\/]/];
  const files = [...walk('src/app'), ...walk('src/lib/mail'), ...walk('src/lib/media')].filter((f) => /\.tsx?$/.test(f) && !own.some((r) => r.test(f)));
  const offenders = files.filter((f) => /getDrive\(\)|drive\/google/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(offenders, []);
});

test('the check route needs the storage right, asks the provider, and records with the server key', () => {
  const src = readFileSync('src/app/api/storage/verify/route.ts', 'utf8');
  assert.match(src, /capGuard\(request, 'storage\.manage', true\)/);
  assert.match(src, /storage_verify_batch/);
  assert.match(src, /markVerified\(g\.account\.email, out\)/);
  assert.doesNotMatch(src, /\.update\(|\.from\('file_locations'\)/, 'never writes the table itself');
});

test('every state and role the database allows has an Arabic word', () => {
  const states = sql.match(/state text not null default 'ok' check \(state in \(([^)]+)\)/)[1].match(/'([a-z]+)'/g).map((x) => x.slice(1, -1));
  for (const s of states) assert.ok(COPY_STATE_AR[s], s);
  const roles = sql.match(/role text not null default 'primary' check \(role in \(([^)]+)\)/)[1].match(/'([a-z]+)'/g).map((x) => x.slice(1, -1));
  for (const r of roles) assert.ok(COPY_ROLE_AR[r], r);
  const storageRoles = sql.match(/create table public\.storage_roles \(\s+role text primary key check \(role in \(([^)]+)\)/)[1].match(/'([a-z]+)'/g).map((x) => x.slice(1, -1));
  assert.deepEqual(storageRoles.sort(), Object.keys(STORAGE_ROLE_AR).sort());
  assert.ok(EVENT_AR.storage_verified);
});

test('the log line for a check says the counts and never a reference', () => {
  const line = eventLine({ kind: 'storage_verified', integration: 'Google Drive', data: { checked: 20, ok: 18, missing: 1, failed: 1 } });
  assert.equal(line, 'فُحصت ملفات التخزين · Google Drive: فُحص 20، سليم 18، مفقود 1، يحتاج انتباهاً 1');
  assert.equal(checkedAr(null), 'لم يُتحقق منه بعد');
  assert.match(checkedAr('2026-10-14T10:00:00Z'), /^تُحقق منه /);
});

test('what is not built is listed as not available, with a reason, and nothing offers to connect it (S3 and Supabase Storage came with Step S3)', () => {
  const ids = COMING_PROVIDERS.map((c) => c.id).sort();
  assert.deepEqual(ids, ['nas', 'onedrive']);
  for (const c of COMING_PROVIDERS) assert.ok(c.why.length > 10, c.id);
  const tab = readFileSync('src/components/settings/storage.tsx', 'utf8');
  assert.doesNotMatch(tab, /ربط OneDrive|ربط NAS/);
});

test('no file location carries a policy: it is read only through functions', () => {
  assert.match(sql, /alter table public\.file_locations enable row level security;/);
  assert.match(sql, /alter table public\.storage_roles enable row level security;/);
  assert.doesNotMatch(sql, /create policy[^;]+file_locations/);
  assert.doesNotMatch(sql, /create policy[^;]+storage_roles/);
  assert.match(sql, /revoke all on function public\.storage_asset_state\(uuid\), public\.storage_overview\(\), public\.storage_verify_batch\(int\),\s+public\.storage_verify_mark\(text, text, jsonb\) from public, anon;/);
  assert.match(sql, /where role = 'primary' and state <> 'retired'/);
});

test('no emoji in the storage words', () => {
  const text = [...Object.values(COPY_STATE_AR), ...Object.values(STORAGE_ROLE_AR), ...COMING_PROVIDERS.map((c) => c.label + c.why)].join(' ');
  assert.doesNotMatch(text, /\p{Extended_Pictographic}/u);
});

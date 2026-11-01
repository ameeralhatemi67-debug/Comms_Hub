// Runs supabase/tests/activity_report_rules.sql on a private database in Docker: a throwaway container of the same
// Supabase image, every migration replayed in order, then the rule file, then the container removed. Nothing here can
// reach comms-hub, and the container publishes no port. Use it to test a migration that is not applied yet.
// Usage: node qa/activity-rules-local.cjs   (writes qa/activity-report-rules.json)
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const NAME = 'comms-hub-rules-check';
const IMAGE = 'public.ecr.aws/supabase/postgres:17.11.0.004';
const SCRIPT = path.join(root, 'supabase', 'tests', 'activity_report_rules.sql');
const MIGRATION = path.join(root, 'supabase', 'migrations', '20261101120000_activity_report.sql');

const run = (args, input) => spawnSync('docker', args, { input, encoding: 'utf8', windowsHide: true, maxBuffer: 1 << 28 });
const psql = (sql, user = 'supabase_admin') => run(['exec', '-i', '-e', 'PGPASSWORD=local-only', NAME, 'psql', '-h', '127.0.0.1', '-U', user, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt', '-f', '-'], sql);
const md5 = (t) => crypto.createHash('md5').update(t).digest('hex');
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
// These files patch functions by matching their text, so they must arrive with the line endings the database got.
const plain = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

function start() {
  run(['rm', '-f', NAME]);
  const up = run(['run', '-d', '--name', NAME, '-e', 'POSTGRES_PASSWORD=local-only', IMAGE]);
  if (up.status !== 0) throw Error(up.stderr);
  for (let i = 0; i < 90; i++) {
    const ready = psql('select 1');
    if (ready.status === 0 && ready.stdout.trim() === '1') return;
    sleep(1000);
  }
  throw Error('the database did not start');
}

const result = { script: 'supabase/tests/activity_report_rules.sql', script_md5: md5(fs.readFileSync(SCRIPT, 'utf8')), migration: { file: 'supabase/migrations/20261101120000_activity_report.sql', file_md5: md5(fs.readFileSync(MIGRATION, 'utf8')), applied: 'not applied to comms-hub' }, how: `A private Docker container of ${IMAGE}, no published port, removed after the run; every migration replayed in order.`, run: new Date().toISOString() };

try {
  start();
  // The image's own sign-in table is a minimal one; the Auth service adds the rest on a real project.
  const platform = psql(`
    alter table auth.users add column if not exists email_confirmed_at timestamptz;
    alter table auth.users add column if not exists phone text;
    alter table auth.users add column if not exists raw_user_meta_data jsonb;
    alter table auth.users add column if not exists raw_app_meta_data jsonb;
    alter table auth.users add column if not exists last_sign_in_at timestamptz;
    alter table auth.users add column if not exists created_at timestamptz default now();
    alter table auth.users add column if not exists updated_at timestamptz default now();
    create or replace function auth.uid() returns uuid language sql stable as $f$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $f$;
    create extension if not exists supabase_vault cascade;
    create schema if not exists storage;
    create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[], owner uuid, created_at timestamptz default now(), updated_at timestamptz default now());
    create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb, created_at timestamptz default now());
  `);
  if (platform.status !== 0) throw Error(`platform: ${platform.stderr.slice(0, 500)}`);
  const files = fs.readdirSync(path.join(root, 'supabase', 'migrations')).filter((f) => f.endsWith('.sql')).sort();
  let applied = 0;
  for (const f of files) {
    const r = psql(plain(path.join(root, 'supabase', 'migrations', f)));
    if (r.status !== 0) throw Error(`${f}: ${r.stderr.slice(0, 800)}`);
    applied++;
  }
  result.migrations_replayed = applied;
  const rules = psql(plain(SCRIPT));
  if (rules.status !== 0) throw Error(`rules: ${rules.stderr.slice(0, 1200)}`);
  const lines = rules.stdout.trim().split('\n').filter((l) => /\|/.test(l));
  result.differ = lines.filter((l) => !l.startsWith('0|TOTAL'));
  const total = lines.find((l) => l.startsWith('0|TOTAL')) ?? '';
  const [, , count, passed] = total.split('|');
  result.total = Number(count);
  result.passed = Number((passed ?? '').split(' ')[0]);
  console.log(result.differ.join('\n'));
  console.log(`${result.passed} of ${result.total} passed`);
  process.exitCode = result.passed === result.total && result.total > 0 ? 0 : 1;
} catch (e) {
  result.error = String(e.message ?? e).slice(0, 1500);
  console.log('stopped:', result.error);
  process.exitCode = 1;
} finally {
  run(['rm', '-f', NAME]);
}
fs.writeFileSync(path.join(root, 'qa', 'activity-report-rules.json'), `${JSON.stringify(result, null, 2)}\n`);

// Settings Step S5 (Settings_Integrations_Plan.md 8): the site's half of the platform registry.
// The database half, with the access and in-use rules, is supabase/tests/platform_rules.sql.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BUILTIN_PLATFORMS,
  PLATFORM_ORDER,
  VIDEO_ONLY,
  platformLabels,
  platformList,
  setPlatformRegistry,
  videoOnlyMessage,
  workErrorText,
  youtubeOk,
} from '../src/lib/work/rules.ts';
import {
  KNOWLEDGE,
  MODE_AR,
  MODE_HELP_AR,
  PLATFORM_TEMPLATES,
  READINESS_AR,
  READINESS_HELP_AR,
  READINESS_ORDER,
  platformError,
  platformEventLine,
} from '../src/lib/platforms/info.ts';
import { HOLD } from '../src/lib/kit/hold-reasons.ts';

const sql = readFileSync(new URL('../supabase/migrations/20261014150000_platform_registry.sql', import.meta.url), 'utf8');
const fix = readFileSync(new URL('../supabase/migrations/20261014150100_platform_registry_url_fix.sql', import.meta.url), 'utf8');

test('the built-in rows the pure rules fall back on equal the rows the migration seeds', () => {
  const block = sql.slice(sql.indexOf('insert into public.platforms'), sql.indexOf('alter table public.platforms enable'));
  const rows = [...block.matchAll(/\('(\w+)',\s+'([^']+)',\s+'(\w+)',\s+(\d+),\s+'\{"video_only": (true|false)\}',\s+'(\w+)',\s+(true|false),\s+(\d+|null),\s+true,\s+'(\w+)'/g)];
  assert.equal(rows.length, 5);
  for (const m of rows) {
    const b = BUILTIN_PLATFORMS.find((p) => p.key === m[1]);
    assert.ok(b, m[1]);
    assert.equal(b.label_ar, m[2], `${m[1]} label`);
    assert.equal(b.kind, m[3], `${m[1]} kind`);
    assert.equal(b.sort, Number(m[4]), `${m[1]} sort`);
    assert.equal(b.accepts.video_only, m[5] === 'true', `${m[1]} video only`);
    assert.equal(b.requires_review, m[7] === 'true', `${m[1]} review`);
    assert.equal(b.readiness, m[9], `${m[1]} readiness`);
  }
});

test('before the registry loads, the words and rules are the ones the interface always had', () => {
  setPlatformRegistry([]);
  assert.equal(platformLabels.instagram, 'إنستغرام');
  assert.equal(platformLabels.youtube, 'يوتيوب');
  assert.equal(platformLabels.mail, 'البريد');
  assert.equal(platformLabels.unknown_one, 'unknown_one');
  assert.deepEqual([...PLATFORM_ORDER], ['instagram', 'x', 'linkedin', 'youtube']);
  assert.deepEqual([...VIDEO_ONLY], ['youtube']);
  assert.equal(youtubeOk('post', ['instagram', 'youtube'], ['image']), false);
});

test('a registry row changes the words, the order and the video-only rule everywhere they are read', () => {
  const row = (key, label_ar, sort, video_only, enabled = true) => ({
    ...BUILTIN_PLATFORMS[0], key, label_ar, kind: 'social', sort, accepts: { video_only }, enabled, builtin: false,
  });
  setPlatformRegistry([row('facebook', 'فيسبوك', 5, false), row('tiktok', 'تيك توك', 6, true)]);
  try {
    assert.equal(platformLabels.facebook, 'فيسبوك');
    assert.deepEqual([...PLATFORM_ORDER], ['instagram', 'x', 'linkedin', 'youtube', 'facebook', 'tiktok']);
    assert.deepEqual([...VIDEO_ONLY].sort(), ['tiktok', 'youtube']);
    assert.equal(youtubeOk('post', ['tiktok'], ['image']), false);
    assert.equal(youtubeOk('post', ['tiktok'], ['video']), true);
    assert.equal(youtubeOk('video', ['tiktok'], []), true);
    assert.equal(youtubeOk('post', ['facebook'], []), true);
    // The five built-in rows stay even when the table sent only the new ones.
    assert.equal(platformList().length, 7);
  } finally {
    setPlatformRegistry([]);
  }
  assert.deepEqual([...VIDEO_ONLY], ['youtube']);
});

test('the video-only message names the platforms in the choice', () => {
  setPlatformRegistry([]);
  assert.equal(videoOnlyMessage(['instagram', 'youtube']), 'يوتيوب يقبل الفيديو فقط: أضف فيديو من المكتبة أو أزل حساب يوتيوب.');
  setPlatformRegistry([{ ...BUILTIN_PLATFORMS[0], key: 'tiktok', label_ar: 'تيك توك', sort: 6, accepts: { video_only: true }, builtin: false }]);
  try {
    assert.equal(videoOnlyMessage(['youtube', 'tiktok', 'x']), 'يوتيوب، تيك توك تقبل الفيديو فقط: أضف فيديو من المكتبة أو أزل هذه الحسابات.');
  } finally {
    setPlatformRegistry([]);
  }
  assert.match(workErrorText('YOUTUBE_VIDEO_ONLY'), /يقبل الفيديو فقط/);
  assert.match(workErrorText('PLATFORM_INVALID'), /منصة مفعّلة/);
});

test('every platform the registry may hold has a card of knowledge, and says it was not read from official documents', () => {
  for (const p of BUILTIN_PLATFORMS) assert.ok(KNOWLEDGE[p.key], p.key);
  for (const t of PLATFORM_TEMPLATES) assert.ok(KNOWLEDGE[t.key], t.key);
  for (const [k, v] of Object.entries(KNOWLEDGE)) {
    assert.ok(v.can && v.cannot && v.lead && v.connect, k);
    assert.ok(v.requires.length >= 1, k);
    assert.equal(v.checked, null, `${k}: nothing here was re-read from the platform's own documents`);
    if (v.docs) assert.match(v.docs, /^https:\/\//, k);
  }
});

test('the templates are not already in the registry, and only video-only where the platform is', () => {
  const keys = PLATFORM_TEMPLATES.map((t) => t.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const k of keys) assert.ok(!BUILTIN_PLATFORMS.some((p) => p.key === k), k);
  assert.equal(PLATFORM_TEMPLATES.find((t) => t.key === 'tiktok').video_only, true);
  assert.equal(PLATFORM_TEMPLATES.find((t) => t.key === 'snapchat').publish_mode, 'manual');
  for (const t of PLATFORM_TEMPLATES) assert.match(t.key, /^[a-z][a-z0-9_]{0,29}$/);
});

test('every mode, readiness state and error the database can say has an Arabic word', () => {
  const modes = sql.match(/publish_mode text not null default 'assisted' check \(publish_mode in \(([^)]+)\)/)[1].match(/'([a-z]+)'/g).map((x) => x.slice(1, -1));
  for (const m of modes) assert.ok(MODE_AR[m] && MODE_HELP_AR[m], m);
  const states = sql.match(/readiness text not null default 'not_started' check \(readiness in \(([^)]+)\)/)[1].match(/'([a-z_]+)'/g).map((x) => x.slice(1, -1));
  assert.deepEqual(states, READINESS_ORDER);
  for (const s of states) assert.ok(READINESS_AR[s] && READINESS_HELP_AR[s], s);
  const codes = [...new Set([...sql.matchAll(/raise exception '([A-Z_]+)'/g)].map((m) => m[1]))].filter((c) => c !== 'APPEND_ONLY' && !c.startsWith('PATCH_'));
  for (const c of codes) assert.notEqual(platformError(c), 'تعذّر تنفيذ الطلب. أعد المحاولة.', c);
});

test('the log lines read in Arabic and never show a raw key', () => {
  const l = (kind, data) => platformEventLine({ kind, actor_name: 'أمير', data });
  assert.equal(l('readiness', { from: 'preparing', to: 'submitted', note: 'قُدّم' }), 'أمير نقل التجهيز من «قيد التجهيز» إلى «قُدّم للمراجعة»: قُدّم.');
  assert.equal(l('created', { label: 'فيسبوك' }), 'أمير أضاف المنصة «فيسبوك».');
  assert.match(l('updated', { mode: 'manual', video_only: true }), /مهمة يدوية/);
  for (const k of ['created', 'enabled', 'disabled', 'readiness', 'updated', 'deleted'])
    assert.doesNotMatch(l(k, { mode: 'manual', to: 'live', from: 'approved' }), /manual|assisted|not_started|\blive\b|\bapproved\b/);
});

test('the registry migration keeps the old rules as data, and its guards are in place', () => {
  assert.match(sql, /foreign key \(platform\) references public\.platforms\(key\)/);
  assert.doesNotMatch(sql, /check \(platform in \('instagram'/);
  for (const name of ['work_parts', 'work_text_save', 'account_save']) assert.match(sql, new RegExp(`PATCH_${name}_NOT_APPLIED`), name);
  assert.match(sql, /adapter in \('simulated'\)/);
  assert.match(sql, /has_capability\('platforms\.manage', null\)/);
  assert.match(sql, /raise exception 'PLATFORM_IN_USE'/);
  assert.match(sql, /create trigger platform_events_frozen before update or delete/);
  // The pattern fixed after the first rule run: Postgres allows a repetition count of 255 at most.
  assert.doesNotMatch(fix, /\{3,300\}\$'\)/);
  assert.match(fix, /char_length\(docs_url\) <= 300/);
  assert.equal(HOLD.platformDelete.length > 10, true);
});

test('no emoji in what the registry says', () => {
  const all = [
    ...Object.values(MODE_AR), ...Object.values(MODE_HELP_AR), ...Object.values(READINESS_AR), ...Object.values(READINESS_HELP_AR),
    ...Object.values(KNOWLEDGE).flatMap((k) => [k.can, k.cannot, k.lead, k.connect, ...k.requires]),
    ...PLATFORM_TEMPLATES.map((t) => t.label_ar),
  ].join(' ');
  assert.doesNotMatch(all, /\p{Extended_Pictographic}/u);
});

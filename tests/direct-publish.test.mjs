// «نشر مباشر» and «إجراءات سريعة» (MVP_draft.md section 76, Director_Notes_Plan.md N-2): the fixed capability held equal in the
// catalog and the database, the limits a direct post has beside a test's, YouTube told to notify only for a direct post that asks,
// the routes passing the purpose through, the panels' direct mode, the menu's gate, and the log's words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CAPABILITIES } from '../src/lib/permissions.ts';
import {
  DIRECT_PER_DAY,
  TESTS_PER_DAY,
  TEST_ERROR_AR,
  YT_DIRECT_SCHEDULE_MAX_DAYS,
  YT_SCHEDULE_MAX_DAYS,
  directNotify,
  scheduleProblem,
} from '../src/lib/platforms/test-rules.ts';
import { youtubeOpenUpload } from '../src/lib/platforms/youtube.ts';
import { describe as describeLog, logTypeLabels } from '../src/lib/media/log-text.ts';
import { libraryEntry } from '../src/lib/activity/feed.ts';
import { HOLD } from '../src/lib/kit/hold-reasons.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const SQL = read('supabase/migrations/20261105160000_direct_publish.sql');
const ROUTE = read('src/app/api/platforms/test/route.ts');
const IG = read('src/lib/platforms/test-instagram.ts');
const YT_PANEL = read('src/components/work/youtube-test.tsx');
const IG_PANEL = read('src/components/work/instagram-test.tsx');
const SHEET = read('src/components/work/direct-publish.tsx');
const MENU = read('src/components/quick-actions.tsx');
const HOME = read('src/components/home.tsx');

test('publish.direct is fixed to the Admin and the director, the same in the catalog and the database', () => {
  const c = CAPABILITIES.find((x) => x.key === 'publish.direct');
  assert.ok(c);
  assert.equal(c.grp, 'fixed');
  assert.equal(c.grantable, false);
  assert.deepEqual(c.fixedRoles, ['admin', 'director']);
  assert.ok(SQL.includes(`('publish.direct', 'fixed', '${c.label}', false, 'none', ${c.minRank}, '{admin,director}',`), 'the seeded row');
  assert.ok(SQL.includes(c.why), 'the same reason');
  assert.ok(SQL.includes(`'${c.why}', ${c.sort});`), 'the same order');
});

test('a direct post has its own count and a longer schedule; a test keeps its own', () => {
  assert.equal(DIRECT_PER_DAY, 20);
  assert.equal(TESTS_PER_DAY, 10);
  assert.ok(SQL.includes(`v_cap := case when v_purpose = 'direct' then ${DIRECT_PER_DAY} else ${TESTS_PER_DAY} end;`));
  assert.ok(SQL.includes(`case when v_purpose = 'direct' then interval '${YT_DIRECT_SCHEDULE_MAX_DAYS} days' else interval '${YT_SCHEDULE_MAX_DAYS} days' end`));
  assert.ok(SQL.includes("v_purpose = 'direct' and not public.has_capability('publish.direct')"), 'only the capability starts one');
  assert.ok(SQL.includes("and (purpose = 'test' or public.has_capability('publish.direct'))"), 'only the capability deletes one');
  const now = Date.parse('2026-11-05T09:00:00Z');
  const in100 = new Date(now + 100 * 864e5).toISOString();
  assert.match(scheduleProblem(in100, now), /30 يوماً/, 'too far for a test');
  assert.equal(scheduleProblem(in100, now, YT_DIRECT_SCHEDULE_MAX_DAYS), null, 'fine for a direct post');
  assert.match(scheduleProblem(new Date(now + 181 * 864e5).toISOString(), now, YT_DIRECT_SCHEDULE_MAX_DAYS), /180 يوماً/);
  assert.ok(TEST_ERROR_AR.DIRECT_LIMIT.includes(String(DIRECT_PER_DAY)));
  assert.ok(TEST_ERROR_AR.SCHEDULE_INVALID.includes(String(YT_DIRECT_SCHEDULE_MAX_DAYS)));
});

test('subscribers: told of a direct post that is or becomes public unless turned off, never of a test', async () => {
  assert.equal(directNotify('public', false, null), true);
  assert.equal(directNotify('private', true, null), true, 'scheduled: told when it becomes public');
  assert.equal(directNotify('unlisted', false, null), false);
  assert.equal(directNotify('public', false, false), false, 'the person turned it off');
  // The database works out the same default.
  assert.ok(SQL.includes("coalesce(v_notify, v_privacy = 'public' or v_when is not null)"));
  const seen = [];
  const f = async (url) => {
    seen.push(new URL(String(url)).searchParams.get('notifySubscribers'));
    return new Response('{}', { status: 200, headers: { Location: 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=x' } });
  };
  const v = { title: 'a', description: '', privacy: 'public', size: 1, mime: 'video/mp4' };
  await youtubeOpenUpload(f, { access: 't', video: v });
  await youtubeOpenUpload(f, { access: 't', video: { ...v, notify: true } });
  await youtubeOpenUpload(f, { access: 't', video: { ...v, notify: false } });
  assert.deepEqual(seen, ['false', 'true', 'false']);
  assert.match(ROUTE, /const notify = direct \? directNotify\(/, 'a test never notifies');
  assert.match(ROUTE, /b\.notify != null && \(typeof b\.notify !== 'boolean' \|\| b\.purpose !== 'direct'\)/, 'only a direct post may ask');
});

test('the routes pass the purpose through, and say a direct post\'s own limit', () => {
  assert.match(ROUTE, /\.\.\.\(direct \? \{ purpose: 'direct', notify \} : \{\}\)/);
  assert.match(ROUTE, /direct && code === 'TEST_LIMIT' \? 'DIRECT_LIMIT'/);
  assert.match(IG, /\.\.\.\(b\.purpose === 'direct' \? \{ purpose: 'direct' \} : \{\}\)/);
  assert.match(IG, /b\.purpose === 'direct' && code === 'TEST_LIMIT' \? 'DIRECT_LIMIT'/);
});

test('the panels\' direct mode: open at once, its own list, a long press for anything public', () => {
  for (const src of [YT_PANEL, IG_PANEL]) {
    assert.match(src, /mode = 'test'/);
    assert.match(src, /useState\(direct\)/, 'open at once');
    assert.match(src, /useTests\(a\.id, mode\)/, 'its own list');
    assert.match(src, /'آخر المنشورات المباشرة'/);
    assert.match(src, /purpose: 'direct'/);
  }
  assert.match(YT_PANEL, /data-hold=\{HOLD\.directPublic\}/);
  assert.match(YT_PANEL, /data-hold=\{HOLD\.directScheduled\}/);
  assert.match(IG_PANEL, /data-hold=\{HOLD\.directInstagram\}/);
  assert.ok(HOLD.directPublic && HOLD.directScheduled && HOLD.directInstagram);
  assert.match(YT_PANEL, /data-yt="notify"/, 'the subscribers\' choice');
  assert.match(YT_PANEL, /direct \? YT_DIRECT_SCHEDULE_MAX_DAYS : YT_SCHEDULE_MAX_DAYS/);
});

test('the menu: «نشر مباشر» only for the capability, the sheet offers YouTube and Instagram and the rest as «قريباً»', () => {
  assert.match(HOME, /<QuickActions \/>/);
  assert.match(MENU, /const direct = caps\.has\('publish\.direct'\)/);
  assert.match(MENU, /\{direct && \(\s*<button type="button" role="menuitem" data-qa="direct"/);
  for (const [k, page] of [['event', 'calendar'], ['upload', 'media'], ['mail', 'mail']]) {
    assert.ok(MENU.includes(`caps.has('page.${page}')`), page);
    assert.ok(MENU.includes(`data-qa="${k}"`), k);
  }
  assert.match(SHEET, /DIRECT_PLATFORMS: readonly string\[\] = \['youtube', 'instagram'\]/);
  assert.match(SHEET, /<small>قريباً<\/small>/);
  assert.match(SHEET, /a\.conn_kind === 'oauth' && a\.active/, 'only accounts connected for real');
  assert.match(SHEET, /mode="direct"/);
});

test('«سجل النشاط» says a direct post and its delete in words, under «النشر والجدولة»', () => {
  const nameOf = (e) => ({ 'dir@t.test': 'المدير' })[e] ?? e;
  const row = (type, data) => ({ id: 1, at: '2026-11-05T09:00:00Z', actor_email: 'dir@t.test', type, asset_id: null, folder_id: null, task_id: null, data });
  assert.equal(describeLog(row('direct', { name: 'إعلان', platform: 'يوتيوب', account: 'القناة', shown: 'غير مدرج' }), nameOf).text, 'نشر المدير مباشرة «إعلان» على يوتيوب · القناة');
  assert.equal(describeLog(row('direct', { name: 'إعلان', platform: 'يوتيوب', account: 'القناة', shown: 'مجدول' }), nameOf).text, 'جدول المدير نشراً مباشراً «إعلان» على يوتيوب · القناة، ويصبح عاماً في موعده');
  assert.equal(describeLog(row('direct_off', { name: 'إعلان', platform: 'إنستغرام', account: 'الحساب' }), nameOf).text, 'حذف المدير المنشور المباشر «إعلان» من إنستغرام · الحساب');
  assert.equal(libraryEntry(row('direct', { name: 'x' }), nameOf).kind, 'publish');
  assert.equal(libraryEntry(row('direct_off', { name: 'x' }), nameOf).kind, 'publish');
  assert.equal(logTypeLabels.direct, 'نشر مباشر');
  // The database writes the same words the page reads.
  for (const k of ['name', 'platform', 'account', 'shown']) assert.ok(SQL.includes(`'${k}', `), k);
  assert.ok(SQL.includes("perform public.direct_announce(t, 'direct')") && SQL.includes("perform public.direct_announce(t, 'direct_off')"));
});

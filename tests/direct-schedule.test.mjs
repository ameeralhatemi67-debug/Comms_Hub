// «مجدول» for an Instagram direct post (MVP_draft.md 76.5, Director_Notes_Plan.md answer Q3) and direct posts outside «نشر مباشر»
// (76.6): the window and the late and overdue times held equal to the database; the due run against a fake database and a fake
// Meta (sending, asking, publishing, giving up, waiting, never a word in a log); the door the bridge and Home use; the bridge's half;
// the panel's choice; and direct posts on the calendar and in the account's sheet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  DIRECT_LATE_MINUTES,
  DIRECT_OVERDUE_HOURS,
  IG_DIRECT_SCHEDULE_MAX_DAYS,
  TEST_ERROR_AR,
  YT_SCHEDULE_MIN_MINUTES,
  directLine,
  lateMinutes,
  scheduleProblem,
} from '../src/lib/platforms/test-rules.ts';
import { DUE_BUDGET_MS, DUE_POLL_MS, DUE_RECORD_TRIES, DUE_WAIT_MAX_MS, dueItem, runDue } from '../src/lib/platforms/direct-due.ts';
import { DUE_KICK_GAP_MS, DUE_PATH, kickDue } from '../src/lib/platforms/due-kick.ts';
import { calEntries, directPlace, entryTitle, grouped } from '../src/lib/work/planning.ts';
import { HOLD } from '../src/lib/kit/hold-reasons.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const SQL = read('supabase/migrations/20261105210000_direct_schedule.sql');
const RULES = read('supabase/tests/direct_schedule_rules.sql');
const ROUTE = read('src/app/api/platforms/due/route.ts');
const IG = read('src/lib/platforms/test-instagram.ts');
const PANEL = read('src/components/work/instagram-test.tsx');
const HOME = read('src/components/home.tsx');
const CHANNELS = read('src/components/work/channels.tsx');
const CALENDAR = read('src/components/work/calendar.tsx');
const DUE = read('src/lib/platforms/direct-due.ts');
const LOOP = read('bridge/whatsapp/loop.cjs');
const BRIDGE = read('bridge/whatsapp/bridge.cjs');

test('the window, late and overdue times are the same in the page, the server and the database', () => {
  assert.equal(IG_DIRECT_SCHEDULE_MAX_DAYS, 30);
  assert.ok(SQL.includes(`if a.platform = 'instagram' and v_when is not null and (v_when < now() + interval '${YT_SCHEDULE_MIN_MINUTES} minutes' or v_when > now() + interval '${IG_DIRECT_SCHEDULE_MAX_DAYS} days') then`));
  assert.ok(SQL.includes(`t.done_at > t.scheduled_for + interval '${DIRECT_LATE_MINUTES} minutes'`), 'late');
  assert.equal(DIRECT_OVERDUE_HOURS, 24);
  assert.ok(SQL.includes("scheduled_for < now() - interval '1 day'"), 'overdue');
  // Only a direct post may carry a time on Instagram, and only there does the database let one wait.
  assert.ok(SQL.includes("not (v_purpose = 'direct' and a.platform = 'instagram')"));
  assert.ok(SQL.includes("(purpose = 'direct' and scheduled_for is not null and kind in ('story_image','story_video','image','reel'))"));
  const now = Date.parse('2026-11-05T09:00:00Z');
  assert.match(scheduleProblem(new Date(now + 5 * 60e3).toISOString(), now, IG_DIRECT_SCHEDULE_MAX_DAYS, 'direct'), /10 دقائق/);
  assert.match(scheduleProblem(new Date(now + 31 * 864e5).toISOString(), now, IG_DIRECT_SCHEDULE_MAX_DAYS, 'direct'), /^يُجدول النشر حتى 30 يوماً/, 'said as a post, not a test');
  assert.equal(scheduleProblem(new Date(now + 29 * 864e5).toISOString(), now, IG_DIRECT_SCHEDULE_MAX_DAYS, 'direct'), null);
  assert.match(scheduleProblem(new Date(now + 31 * 864e5).toISOString(), now), /^تُجدول التجربة/, 'a test keeps its words');
  assert.ok(TEST_ERROR_AR.OVERDUE && TEST_ERROR_AR.FIRING, 'the new codes have words');
});

test('a post that went out more than five minutes after its time is late, in whole minutes', () => {
  const t = { state: 'published', kind: 'image', scheduled_for: '2026-11-05T09:00:00Z' };
  assert.equal(lateMinutes({ ...t, done_at: '2026-11-05T09:04:00Z' }), null, 'on time');
  assert.equal(lateMinutes({ ...t, done_at: '2026-11-05T09:40:10Z' }), 41);
  assert.equal(lateMinutes({ ...t, kind: 'video', done_at: '2026-11-05T10:00:00Z' }), null, 'YouTube keeps its own time');
  assert.equal(lateMinutes({ ...t, state: 'waiting', done_at: null }), null);
});

// ---------------------------------------------------------------------------
// The due run
// ---------------------------------------------------------------------------
const TOKEN = 'tok-due-test-only';
const item = (extra = {}) => ({
  id: '00000000-0000-4000-8000-0000000000e1', step: 'send', kind: 'image', mime: 'image/jpeg', size: 1000, source: 'device',
  temp_ref: 'driveTemp_e1_000001', external_id: '17841400000000001', caption: 'نص', alt: 'وصف', share_to_feed: false,
  container: null, fired_at: '2026-11-05T09:00:00Z', token: TOKEN, ...extra,
});
/** A fake database: what was called, in order, and the answers given. */
function fakeDb(claim, answers = {}) {
  const calls = [];
  return {
    calls,
    rpc: async (fn, args) => {
      calls.push([fn, args]);
      if (fn === 'direct_fire_claim') return claim instanceof Error ? { data: null, error: { message: claim.message } } : { data: claim, error: null };
      if (answers[fn]) return answers[fn](args);
      if (fn === 'direct_fire_done') return { data: 'published', error: null };
      return { data: null, error: null };
    },
  };
}
/** A fake Meta: `status` answers the container's state, one per question. */
function fakeMeta({ status = ['FINISHED'], create = { id: '17900000000000001' }, used = 3 } = {}) {
  const seen = [];
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s });
  const f = async (url, init = {}) => {
    const u = String(url);
    seen.push({ url: u, method: init.method ?? 'GET', body: init.body ? String(init.body) : '', auth: init.headers?.Authorization });
    if (u.includes('/content_publishing_limit')) return json({ data: [{ quota_usage: used, config: { quota_total: 100 } }] });
    if (u.endsWith('/media') && init.method === 'POST') return create instanceof Error ? Promise.reject(create) : json(create, create.error ? 400 : 200);
    if (u.includes('fields=status_code')) return json({ status_code: status.length > 1 ? status.shift() : status[0] });
    if (u.endsWith('/media_publish')) return json({ id: '17900000000000099' });
    if (u.includes('fields=id,permalink')) return json({ id: '17900000000000099', permalink: 'https://www.instagram.com/p/abc/', owner: { id: '17841400000000001' } });
    return json({}, 404);
  };
  return { f, seen };
}
const deps = (db, meta, extra = {}) => {
  const trashed = [];
  let clock = Date.parse('2026-11-05T09:01:00Z');
  return {
    trashed,
    d: {
      rpc: db.rpc, key: 'k-test', origin: 'https://hub.example', fetch: meta.f, trash: async (r) => void trashed.push(r),
      now: () => clock, sleep: async (ms) => void (clock += ms), ...extra,
    },
  };
};

test('a due post is sent, asked about and published in one call, its address ended before publishing', async () => {
  const db = fakeDb([item()]);
  const meta = fakeMeta({ status: ['IN_PROGRESS', 'FINISHED'] });
  const { d, trashed } = deps(db, meta);
  const r = await runDue(d);
  assert.deepEqual(r, { state: 'ran', claimed: 1, published: 1, waiting: 0, failed: 0 });
  const fns = db.calls.map(([fn]) => fn);
  assert.deepEqual(fns, ['direct_fire_claim', 'direct_fire_link', 'direct_fire_container', 'direct_fire_link', 'direct_fire_done']);
  // The address is the site's own, and the database keeps only the hash of its token.
  const [, set] = db.calls[1];
  const create = meta.seen.find((s) => s.url.endsWith('/media'));
  const url = new URLSearchParams(create.body).get('image_url');
  assert.match(url, /^https:\/\/hub\.example\/api\/platforms\/test\/file\/[0-9a-f]{64}$/);
  assert.equal(set.p_hash, createHash('sha256').update(url.split('/').pop()).digest('hex'));
  assert.equal(new URLSearchParams(create.body).get('caption'), 'نص');
  assert.equal(new URLSearchParams(create.body).get('alt_text'), 'وصف');
  assert.equal(db.calls[3][1].p_hash, null, 'the address ends');
  assert.ok(fns.indexOf('direct_fire_link', 2) < fns.indexOf('direct_fire_done'));
  assert.deepEqual(db.calls[4][1], { p_key: 'k-test', p_test: item().id, p_post: '17900000000000099', p_owner: '17841400000000001', p_url: 'https://www.instagram.com/p/abc/' });
  assert.deepEqual(trashed, ['driveTemp_e1_000001'], 'the temporary copy goes to the trash');
  assert.ok(meta.seen.every((s) => s.auth === `OAuth ${TOKEN}`), 'the token goes to Meta in the header only');
  assert.ok(meta.seen.every((s) => !s.url.includes(TOKEN)), 'never in an address');
});

test('a Story carries no caption; Meta still preparing at the end of the call: the lease ends for the next call', async () => {
  const db = fakeDb([item({ kind: 'story_image' })]);
  const meta = fakeMeta({ status: ['IN_PROGRESS'] });
  const { d } = deps(db, meta);
  const r = await runDue(d);
  assert.equal(r.waiting, 1);
  assert.equal(new URLSearchParams(meta.seen.find((s) => s.url.endsWith('/media')).body).get('caption'), null);
  assert.equal(db.calls.at(-1)[0], 'direct_fire_release');
  const asks = meta.seen.filter((s) => s.url.includes('fields=status_code')).length;
  assert.ok(asks >= 2 && asks <= Math.ceil(DUE_BUDGET_MS / DUE_POLL_MS) + 1, 'asked a few times within the call');
});

test('an advance step publishes a ready container; one preparing for half an hour is given up', async () => {
  const db = fakeDb([item({ step: 'advance', container: '17900000000000001' })]);
  const { d } = deps(db, fakeMeta());
  assert.equal((await runDue(d)).published, 1);
  assert.deepEqual(db.calls.map(([fn]) => fn), ['direct_fire_claim', 'direct_fire_link', 'direct_fire_done']);
  const old = fakeDb([item({ step: 'advance', container: '17900000000000001', fired_at: new Date(Date.parse('2026-11-05T09:01:00Z') - DUE_WAIT_MAX_MS - 1).toISOString() })]);
  const { d: d2, trashed } = deps(old, fakeMeta());
  assert.equal((await runDue(d2)).failed, 1);
  assert.deepEqual(old.calls.at(-1), ['direct_fire_failed', { p_key: 'k-test', p_test: item().id, p_error: 'WAIT_TOO_LONG' }]);
  assert.deepEqual(trashed, ['driveTemp_e1_000001']);
});

test("a published post whose result cannot be recorded is never called a failure of Meta's, and is never sent twice", async () => {
  const published = (seen) => seen.filter((x) => x.url.endsWith('/media_publish')).length;
  // The database answers badly twice, then well: the post is recorded as published, after exactly the tries it needed.
  let n = 0;
  const flaky = fakeDb([item()], { direct_fire_done: () => (++n < DUE_RECORD_TRIES ? { data: null, error: { message: 'canceling statement' } } : { data: 'published', error: null }) });
  const m1 = fakeMeta();
  const { d: d1, trashed: t1 } = deps(flaky, m1);
  assert.deepEqual(await runDue(d1), { state: 'ran', claimed: 1, published: 1, waiting: 0, failed: 0 });
  assert.equal(flaky.calls.filter(([fn]) => fn === 'direct_fire_done').length, DUE_RECORD_TRIES);
  assert.equal(published(m1.seen), 1);
  assert.deepEqual(t1, ['driveTemp_e1_000001']);
  // The database never answers (an error each time, or an exception): the row says the post is live and unrecorded, once, with no second send.
  for (const answer of [() => ({ data: null, error: { message: 'down' } }), () => { throw new Error('network'); }]) {
    const dead = fakeDb([item()], { direct_fire_done: answer });
    const m2 = fakeMeta();
    const { d: d2, trashed: t2 } = deps(dead, m2);
    assert.deepEqual(await runDue(d2), { state: 'ran', claimed: 1, published: 0, waiting: 0, failed: 1 });
    assert.equal(dead.calls.filter(([fn]) => fn === 'direct_fire_done').length, DUE_RECORD_TRIES, 'tried a few times, not for ever');
    assert.deepEqual(dead.calls.find(([fn]) => fn === 'direct_fire_failed')[1], { p_key: 'k-test', p_test: item().id, p_error: 'PUBLISHED_UNRECORDED' });
    assert.equal(published(m2.seen), 1, 'Meta was asked to publish once');
    assert.deepEqual(t2, ['driveTemp_e1_000001']);
  }
  // A later call that takes the post and finds Meta's container already published (the earlier call died before it could say so) says the same
  // and publishes nothing.
  const later = fakeDb([item({ step: 'advance', container: '17900000000000001' })]);
  const m3 = fakeMeta({ status: ['PUBLISHED'] });
  const { d: d3 } = deps(later, m3);
  assert.deepEqual(await runDue(d3), { state: 'ran', claimed: 1, published: 0, waiting: 0, failed: 1 });
  assert.equal(published(m3.seen), 0, 'a published container is never published again');
  assert.deepEqual(later.calls.find(([fn]) => fn === 'direct_fire_failed')[1].p_error, 'PUBLISHED_UNRECORDED');
  assert.ok(!later.calls.some(([fn]) => fn === 'direct_fire_done'));
  // It has words, and they say the post exists: look at the account and do not post it again.
  assert.match(TEST_ERROR_AR.PUBLISHED_UNRECORDED, /نُشر المنشور/);
  assert.match(TEST_ERROR_AR.PUBLISHED_UNRECORDED, /لا تُعد النشر/);
});

test('Meta refusing fails the post with its reason; Meta unreachable waits for the next call; the daily limit stops it', async () => {
  const refused = fakeDb([item()]);
  const { d } = deps(refused, fakeMeta({ create: { error: { code: 9004, error_subcode: 2207004 } } }));
  assert.equal((await runDue(d)).failed, 1);
  const failed = refused.calls.find(([fn]) => fn === 'direct_fire_failed');
  assert.match(failed[1].p_error, /^[A-Z_]{2,40}$/);
  const down = fakeDb([item()]);
  const { d: d2, trashed } = deps(down, fakeMeta({ create: new Error('down') }));
  assert.equal((await runDue(d2)).waiting, 1);
  assert.equal(down.calls.at(-1)[0], 'direct_fire_release');
  assert.deepEqual(trashed, [], 'nothing trashed: the next call sends again');
  const full = fakeDb([item()]);
  const { d: d3 } = deps(full, fakeMeta({ used: 100 }));
  assert.equal((await runDue(d3)).failed, 1);
  assert.equal(full.calls.find(([fn]) => fn === 'direct_fire_failed')[1].p_error, 'QUOTA_REACHED');
});

test('a refused claim is said; a malformed item is left for its lease; the run logs nothing at all', async () => {
  const logged = [];
  const keep = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const k of Object.keys(keep)) console[k] = (...a) => logged.push(a);
  try {
    const { d } = deps(fakeDb(new Error('FORBIDDEN')), fakeMeta());
    assert.equal((await runDue(d)).state, 'refused');
    const odd = fakeDb([{ id: 'x', step: 'send' }, item({ token: '' }), item({ kind: 'video' })]);
    const { d: d2 } = deps(odd, fakeMeta());
    assert.deepEqual(await runDue(d2), { state: 'ran', claimed: 0, published: 0, waiting: 0, failed: 0 });
    assert.equal(odd.calls.length, 1, 'nothing but the claim');
    const ok = fakeDb([item()]);
    const { d: d3 } = deps(ok, fakeMeta());
    const r = await runDue(d3);
    assert.ok(!JSON.stringify(r).includes(TOKEN), 'the answer carries no token');
  } finally {
    Object.assign(console, keep);
  }
  assert.deepEqual(logged, []);
  assert.ok(!/console\./.test(DUE), 'the engine has no log line');
  assert.equal(dueItem(item()), true);
  assert.equal(dueItem(item({ step: 'advance', container: null })), false);
});

// ---------------------------------------------------------------------------
// The door, the bridge and Home
// ---------------------------------------------------------------------------
test('the door: the bridge with its key, or a signed-in page of this site; the answer is counts only', () => {
  assert.match(ROUTE, /const given = \(request\.headers\.get\('authorization'\) \?\? ''\)\.replace\(\/\^Bearer\\s\+\/i, ''\);/);
  assert.match(ROUTE, /if \(!env\.key \|\| !sameKey\(given, env\.key\)\) return no\(401, 'forbidden'\);/);
  assert.match(ROUTE, /guard\(request, \{ mutating: true \}\)/);
  assert.match(ROUTE, /dueNow\(new URL\(request\.url\)\.origin\)/);
  assert.match(ROUTE, /export const maxDuration = 60;/);
  assert.ok(DUE_BUDGET_MS < 60_000 - 10_000, 'the run ends well inside the route limit');
  assert.ok(SQL.includes("fire_lease = now() + interval '2 minutes'"), 'a lease outlasts one call');
  assert.ok(DUE_BUDGET_MS < 120_000);
  // The fire functions take the server key and no session, and touch only a due scheduled Instagram direct post.
  for (const fn of ['direct_fire_claim(text)', 'direct_fire_link(text, uuid, text, timestamptz)', 'direct_fire_container(text, uuid, text)', 'direct_fire_done(text, uuid, text, text, text)', 'direct_fire_release(text, uuid)', 'direct_fire_failed(text, uuid, text)'])
    assert.ok(SQL.includes(`public.${fn}`), fn);
  assert.ok(SQL.includes("if not public.mail_key_ok(p_key) or not public.direct_fire_held(p_test) then raise exception 'FORBIDDEN'"));
  assert.ok(RULES.includes("'69 the server''s view says what a post is for and when it is due'"), 'the rules file is the one in this change');
});

test('the bridge asks about once a minute with the same key; Home asks once when opened, never waiting', async () => {
  assert.match(LOOP, /const DUE_GAP_MS=60000;/);
  assert.match(LOOP, /kickPush\(\);\n\s+kickDue\(\);/);
  assert.match(BRIDGE, /const due=dueClient\(fetcher,env\.COMMS_SITE_URL,env\.WHATSAPP_SERVER_KEY\);/);
  assert.match(HOME, /useEffect\(\(\) => \{\n\s+kickDue\(\);\n\s+\}, \[\]\);/);
  const sent = [];
  const send = async (url, init) => {
    sent.push([url, init.method, init.credentials, init.body]);
    return new Response('{}');
  };
  assert.equal(kickDue(1_000_000, send), true);
  assert.equal(kickDue(1_000_000 + DUE_KICK_GAP_MS - 1, send), false, 'once a minute at most');
  assert.equal(kickDue(1_000_000 + DUE_KICK_GAP_MS, send), true);
  assert.deepEqual(sent, [[DUE_PATH, 'POST', 'same-origin', undefined], [DUE_PATH, 'POST', 'same-origin', undefined]]);
  assert.equal(DUE_PATH, '/api/platforms/due');
});

test('the panel: «الآن» or «مجدول» for a direct post only, its own long press, and a waiting post may be cancelled', () => {
  assert.match(PANEL, /const later = direct && timing === 'scheduled';/);
  assert.match(PANEL, /\.\.\.\(direct && at \? \{ scheduled_for: at \} : \{\}\),/);
  assert.match(PANEL, /data-hold=\{later \? HOLD\.directInstagramScheduled : HOLD\.directInstagram\}/);
  assert.ok(HOLD.directInstagramScheduled.includes('في موعده'));
  assert.match(PANEL, /data-ig="unschedule"/);
  // The server keeps the time only for a direct post, makes it wait once the file is ready, and cancels it through the database.
  assert.match(IG, /const at = b\.purpose === 'direct' && typeof b\.scheduled_for === 'string'/);
  assert.match(IG, /db\.rpc\('direct_wait'/);
  assert.match(IG, /db\.rpc\('direct_cancel'/);
  assert.match(IG, /if \(t\.state === 'uploading' && t\.fired\) return refuse\('FIRING'\);/);
  assert.match(IG, /!t\.container \|\| t\.fired\) return refuse\('TEST_INVALID'\);/, 'the page never publishes a post the due run took');
});

// ---------------------------------------------------------------------------
// Direct posts on the calendar and in the account's sheet
// ---------------------------------------------------------------------------
const NOW = '2026-11-05T09:00:00.000Z';
const dp = (extra = {}) => ({
  id: 'd1', account_id: 'acc-ig', kind: 'image', title: 'منشور الافتتاح', state: 'waiting', scheduled_for: '2026-11-06T15:00:00.000Z',
  shown_publish_at: null, done_at: null, post_url: null, video_id: null, privacy: null, shown_privacy: null, created_by: 'dir@x.sa', ...extra,
});
const accounts = [{ id: 'acc-ig', platform: 'instagram', label: 'الحساب', active: true, publishers: [], authorized_until: '2027-01-01T00:00:00Z' }];
const base = { works: [], tasks: [], events: [], reminders: [], accounts, me: 'dir@x.sa', today: '2026-11-05', nowIso: NOW };

test('a direct post sits on its account: waiting or scheduled at YouTube as «مجدول», published as «نُشر»', () => {
  assert.deepEqual(directPlace(dp(), NOW)?.k, 'pub');
  assert.equal(directPlace(dp(), NOW)?.dp.what, 'إنستغرام · منشور صورة · مجدول');
  const yt = dp({ kind: 'video', state: 'published', privacy: 'private', scheduled_for: '2026-11-10T08:00:00Z', shown_publish_at: '2026-11-10T08:00:00Z', video_id: 'abcdefghijk', done_at: '2026-11-05T08:00:00Z' });
  assert.equal(directPlace(yt, NOW)?.k, 'pub', 'YouTube makes it public at its time');
  assert.equal(directPlace(yt, '2026-11-11T00:00:00Z')?.k, 'done');
  assert.equal(directPlace(yt, NOW)?.dp.url, 'https://www.youtube.com/watch?v=abcdefghijk');
  const out = dp({ state: 'published', done_at: '2026-11-05T08:30:00Z', post_url: 'https://www.instagram.com/p/x/' });
  assert.equal(directPlace(out, NOW)?.k, 'done');
  for (const state of ['failed', 'deleted', 'uploading']) assert.equal(directPlace(dp({ state }), NOW), null, state);
  const all = calEntries({ ...base, direct: [dp(), out] });
  assert.deepEqual(all.map((e) => [e.k, e.lane, e.ch, e.date, e.time]), [['done', 'acc-ig', 'acc-ig', '2026-11-05', '11:30'], ['pub', 'acc-ig', 'acc-ig', '2026-11-06', '18:00']]);
  assert.equal(entryTitle(all[1]), 'منشور الافتتاح');
});

test('direct posts belong to no project, follow «لي وحدي», keep apart at the same time, and warn near a work', () => {
  assert.equal(calEntries({ ...base, direct: [dp()], project: 'p1' }).length, 0, 'not inside a project');
  assert.equal(calEntries({ ...base, direct: [dp({ created_by: 'other@x.sa' })], mine: true }).length, 0, 'not mine');
  assert.equal(calEntries({ ...base, direct: [dp()], filter: { pub: false, due: true, stages: true, tasks: true, events: true, camps: true, rem: true } }).length, 0, 'publishing filtered out');
  const two = calEntries({ ...base, direct: [dp(), dp({ id: 'd2', title: 'الثاني' })] });
  assert.equal(grouped(two).length, 2, 'two direct posts at the same time are two rows');
  assert.deepEqual(two.map((e) => e.near?.title), ['الثاني', 'منشور الافتتاح'], 'two posts within two hours on one account warn of each other');
  // Directions of the page: never dragged, and the drawer says where it is managed.
  assert.match(CALENDAR, /const direct = useDirectPosts\(\);/);
  assert.match(CALENDAR, /data-cal="direct"/);
  assert.match(CALENDAR, /const canDrag = \(e: CalEntry\) =>\n\s+!!e\.w &&/, 'only a work is dragged');
  assert.match(CHANNELS, /\(a\.platform === 'youtube' \|\| a\.platform === 'instagram' \|\| a\.platform === 'tiktok'\) && oauth && \(mgr \|\| \(pub && a\.publishers\.includes\(w\.me\)\)\) && <DirectPosts a=\{a\} \/>/);
});

test('the sheet\'s line says where a direct post stands', () => {
  const at = (iso) => `@${iso.slice(0, 16)}`;
  const now = Date.parse(NOW);
  const row = (extra) => ({ id: 'x', privacy: null, title: 't', kind: 'image', state: 'published', video_id: null, shown_privacy: null, error: null, created_by: 'd', created_at: NOW, deleted_at: null, ...extra });
  assert.equal(directLine(row({ state: 'waiting', scheduled_for: '2026-11-06T15:00:00Z' }), now, at), 'مجدول · يُنشر @2026-11-06T15:00');
  assert.equal(directLine(row({ state: 'uploading', scheduled_for: '2026-11-06T15:00:00Z' }), now, at), 'يُرفع الملف');
  assert.equal(directLine(row({ state: 'uploading', scheduled_for: '2026-11-05T08:00:00Z' }), now, at), 'يُنشر الآن');
  assert.equal(directLine(row({ state: 'failed', error: 'CANCELLED', scheduled_for: '2026-11-06T15:00:00Z' }), now, at), 'أُلغي قبل موعده');
  assert.equal(directLine(row({ state: 'failed', error: 'OVERDUE', scheduled_for: '2026-11-03T15:00:00Z' }), now, at), `لم يكتمل: ${TEST_ERROR_AR.OVERDUE}`);
  assert.equal(directLine(row({ scheduled_for: '2026-11-05T08:00:00Z', done_at: '2026-11-05T08:41:00Z' }), now, at), 'نُشر · منشور صورة · متأخراً 41 دقيقة عن موعده');
  assert.equal(directLine(row({ kind: 'video', privacy: 'unlisted' }), now, at), 'غير مدرج');
  assert.equal(directLine(row({ kind: 'video', privacy: 'private', scheduled_for: '2026-11-10T08:00:00Z', shown_publish_at: '2026-11-10T08:00:00Z' }), now, at), 'مجدول · يصبح عاماً @2026-11-10T08:00');
});

// YouTube's four choices in the work cycle (MVP_draft.md section 78, Director_Notes_Plan.md N-3 step 5): what «نشر الآن» sends, the
// word a narrower choice leaves on the calendar and in the analytics, the words of the publishing package, and the page and the
// database holding the same rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NOW_CHOICES, SCHEDULED_LINE, defaultChoice, isNowChoice, narrowWord, nowOptions, studioStep, youtubeOf } from '../src/lib/work/youtube-choices.ts';
import { YT_CHOICE_AR } from '../src/lib/platforms/test-rules.ts';
import { calEntries } from '../src/lib/work/planning.ts';
import { analyse } from '../src/lib/work/analytics.ts';
import { PAGES } from '../src/lib/help/pages.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const SQL = read('supabase/migrations/20261105230000_work_youtube_choices.sql');
const PUBLISH = read('src/components/work/publish.tsx');
const CHANNELS = read('src/components/work/channels.tsx');
const DATA = read('src/components/work/data.tsx');

const acc = (id, platform, extra = {}) => ({ id, platform, label: id, handle: null, purpose: null, authorized_until: '2027-01-01T00:00:00Z', publishers: [], mode: 'auto', active: true, fixed: false, ...extra });
const accounts = [acc('yt1', 'youtube'), acc('yt2', 'youtube', { default_privacy: 'unlisted' }), acc('ig', 'instagram')];

test('«نشر الآن» sends every YouTube account of the work, picked or default, and nothing else', () => {
  assert.deepEqual(NOW_CHOICES, ['public', 'unlisted', 'private']);
  assert.equal(defaultChoice(accounts[0]), 'public');
  assert.equal(defaultChoice(accounts[1]), 'unlisted');
  assert.equal(defaultChoice({ default_privacy: 'scheduled' }), 'public', 'a word that is not a choice falls back');
  const w = { channels: ['ig', 'yt2', 'yt1'] };
  assert.deepEqual(youtubeOf(w, accounts).map((a) => a.id), ['yt2', 'yt1'], 'in the work\'s order');
  assert.deepEqual(nowOptions(w, accounts, {}), { yt2: 'unlisted', yt1: 'public' });
  assert.deepEqual(nowOptions(w, accounts, { yt1: 'private' }), { yt2: 'unlisted', yt1: 'private' });
  assert.deepEqual(nowOptions({ channels: ['ig'] }, accounts, {}), {}, 'no YouTube account, no choice');
  assert.deepEqual(nowOptions(w, accounts, { ig: 'private' }), { yt2: 'unlisted', yt1: 'public' }, 'Instagram is never sent');
  assert.equal(isNowChoice('scheduled'), false, '«مجدول» comes from «جدولة», not from «نشر الآن»');
  // The dialog sends the choices only when the work has a YouTube account, so every other call is as it was.
  assert.match(PUBLISH, /tubes\.length \? \{ p_work: w\.id, p_op: 'now', p_options: options \} : \{ p_work: w\.id, p_op: 'now' \}/);
});

test('the database holds the same choices, defaults and fallbacks', () => {
  assert.ok(SQL.includes("v := coalesce(p_options->>a.id::text, a.default_privacy, 'public');"), 'asked, else default, else public');
  assert.ok(SQL.includes("if v not in ('public','unlisted','private') then raise exception 'OPTIONS_INVALID'"));
  assert.ok(SQL.includes("check (default_privacy is null or default_privacy in ('unlisted','private'))"), '«عام» is kept as no default');
  assert.ok(SQL.includes("update public.platform_accounts set default_privacy = nullif(p_privacy, 'public')"));
  // A scheduled YouTube video goes out public at its time; a work from before the choice counts as public.
  assert.ok(SQL.includes("case coalesce(w.pub_options->>c::text, 'public') when 'scheduled' then 'public'"));
  assert.ok(SQL.includes("if p_options is not null and p_op <> 'now' then raise exception 'OPTIONS_INVALID'"), 'choices go with «نشر الآن» only');
  assert.ok(SQL.includes('create or replace function public.work_publish(p_work text, p_op text) returns text'), 'the two-argument form stays');
  assert.ok(!/create (or replace )?function public\.work_schedule\(/.test(SQL), 'work_schedule is unchanged');
  for (const [k, ar] of Object.entries({ public: 'عام', unlisted: 'غير مدرج', private: 'خاص', scheduled: 'مجدول' })) {
    assert.equal(YT_CHOICE_AR[k], ar);
    assert.ok(SQL.includes(`when '${k}' then '${ar}'`), `the database says ${k} as ${ar}`);
  }
  // Only those who manage accounts set a default (account_manager), on YouTube only.
  assert.ok(SQL.includes("a.platform <> 'youtube' or not public.account_manager()"));
});

test('a narrower choice leaves its word: the calendar, the work page, and the analytics', () => {
  assert.equal(narrowWord({ privacy: 'unlisted' }), 'غير مدرج');
  assert.equal(narrowWord({ privacy: 'private' }), 'خاص');
  assert.equal(narrowWord({ privacy: 'public' }), null);
  assert.equal(narrowWord({}), null);
  const W = (id, over) => ({
    id, no: 1, title: id, type: 'video', status: 'PUBLISHED', priority: 'normal', restricted: false, source: 'internal', requester: null, brief: null,
    created_by: 'd', assignee: 'd', people: [], due: '2026-11-10', event_at: null, place: null, channels: ['yt1', 'ig'], proposed_at: null,
    sched_at: null, pub_at: '2026-11-05T09:00:00Z', pub_mode: 'auto', pending_sched: false, confirm_pending: false, move_from: null, move_by: null,
    review_cycle: 1, results: {}, closed_at: null, closed_by: null, close_reason: null, created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-05T00:00:00Z', ...over,
  });
  const done = W('CH-1', { results: { yt1: { ok: true, at: '2026-11-05T09:00:00Z', why: null, privacy: 'unlisted' }, ig: { ok: true, at: '2026-11-05T09:00:00Z', why: null } } });
  const all = calEntries({ works: [{ w: done, stages: [], projects: [] }], tasks: [], events: [], reminders: [], accounts, me: 'd', today: '2026-11-05', nowIso: '2026-11-05T12:00:00Z' });
  assert.deepEqual(all.filter((e) => e.k === 'done').map((e) => [e.ch, e.vis ?? null]), [['yt1', 'غير مدرج'], ['ig', null]]);
  const pub = W('CH-2', { status: 'SCHEDULED', sched_at: '2026-11-07T09:00:00Z', pub_at: null });
  const sched = calEntries({ works: [{ w: pub, stages: [], projects: [] }], tasks: [], events: [], reminders: [], accounts, me: 'd', today: '2026-11-05', nowIso: '2026-11-05T12:00:00Z' });
  assert.ok(sched.filter((e) => e.k === 'pub').every((e) => !e.vis), 'a scheduled one becomes public: no word');
  const platforms = [{ key: 'youtube', label_ar: 'يوتيوب', kind: 'social', sort: 1 }, { key: 'instagram', label_ar: 'إنستغرام', kind: 'social', sort: 2 }];
  const works = [
    done,
    W('CH-3', { results: { yt1: { ok: true, at: '2026-11-05T09:00:00Z', why: null, privacy: 'private' } } }),
    W('CH-4', { results: { yt1: { ok: true, at: '2026-11-05T09:00:00Z', why: null } } }),
    W('CH-5', { results: { yt1: { ok: false, at: '2026-11-05T09:00:00Z', why: 'التفويض منتهٍ', privacy: 'unlisted' } } }),
  ];
  const a = analyse(works, accounts, platforms, '2026-11-05');
  const yt = a.platforms.find((p) => p.key === 'youtube');
  assert.deepEqual(yt.visibility, { public: 1, unlisted: 1, private: 1 }, 'successes only; one from before the choice counts as public');
  assert.equal(a.platforms.find((p) => p.key === 'instagram').visibility, undefined);
});

test('the dialogs, the account\'s default, the package and the guides say the same', () => {
  assert.match(SCHEDULED_LINE, /مجدول/);
  assert.match(SCHEDULED_LINE, /يجعله يوتيوب عاماً/);
  assert.match(SCHEDULED_LINE, /اختر «نشر الآن»/);
  assert.match(PUBLISH, /\{SCHEDULED_LINE\}/);
  assert.equal(studioStep('unlisted'), 'في YouTube Studio اختر في «الظهور»: «غير مدرج».');
  assert.match(studioStep('scheduled'), /«جدولة» بالموعد نفسه/);
  assert.match(CHANNELS, /act\('account_set_privacy', \{ p_id: a\.id, p_privacy: c \}/);
  assert.match(CHANNELS, /mgr && a\.platform === 'youtube' &&/, 'only those who manage accounts, on YouTube only');
  // A column added later never breaks the accounts' list.
  assert.match(DATA, /from\('platform_accounts'\)\.select\('\*'\)/);
  assert.ok(PAGES.approvals.news.some((n) => n.b.includes('غير مدرج')) && PAGES.approvals.v >= 2);
  assert.ok(PAGES.channels.parts.some((p) => p.sel === '[data-yt="default"]') && PAGES.channels.v >= 3);
});

// Action_Plan.md B5: what «التحليلات» counts, from rows alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyse, percent, STATUS_ORDER } from '../src/lib/work/analytics.ts';

const TODAY = '2026-10-15';
const NOW = Date.parse('2026-10-15T09:00:00Z');
const work = (o) => ({
  id: 'CH-1', no: 1, title: 't', type: 'post', status: 'DRAFT', priority: 'normal', restricted: false, source: 'internal',
  requester: null, brief: null, created_by: 'a@x', assignee: null, people: [], due: '2026-10-20', event_at: null, place: null,
  channels: [], proposed_at: null, sched_at: null, pub_at: null, pub_mode: null, pending_sched: false, confirm_pending: false,
  move_from: null, move_by: null, review_cycle: null, results: {}, closed_at: null, closed_by: null, close_reason: null,
  created_at: '2026-10-14T08:00:00Z', updated_at: '2026-10-14T08:00:00Z', ...o,
});
const account = (o) => ({ id: 'a1', platform: 'instagram', label: 'ig', handle: null, purpose: null, authorized_until: null, publishers: [], mode: 'auto', active: true, fixed: false, ...o });
const platform = (key, label_ar) => ({ key, label_ar, kind: 'social', sort: 1, accepts: {}, publish_mode: 'auto', scheduling: true, requires_review: false, token_life_days: 60, enabled: true, builtin: true, docs_url: null, readiness: 'live', readiness_note: null, readiness_at: null, readiness_by: null });

test('every status has a count, in the order of the eleven', () => {
  const a = analyse([work({ status: 'IN_REVIEW' }), work({ id: 'CH-2', status: 'PUBLISHED' })], [], [], TODAY, NOW);
  assert.equal(STATUS_ORDER.length, 11);
  assert.deepEqual(Object.keys(a.byStatus), STATUS_ORDER);
  assert.equal(a.byStatus.IN_REVIEW, 1);
  assert.equal(a.byStatus.PUBLISHED, 1);
  assert.equal(a.total, 2);
});

test('open, late and due soon leave out works that ended or were closed', () => {
  const ws = [
    work({ id: 'A', due: '2026-10-10' }), // late
    work({ id: 'B', due: '2026-10-18' }), // soon
    work({ id: 'C', due: '2026-10-30' }), // open, not soon
    work({ id: 'D', due: '2026-10-01', status: 'PUBLISHED' }), // ended, not late
    work({ id: 'E', due: '2026-10-01', closed_at: '2026-10-02T00:00:00Z' }), // closed
    work({ id: 'F', due: '2026-10-15' }), // due today is soon, not late
  ];
  const a = analyse(ws, [], [], TODAY, NOW);
  assert.equal(a.open, 4);
  assert.equal(a.late, 1);
  assert.equal(a.dueSoon, 2);
});

test('weekly buckets end today, count creation by created_at and publishing by pub_at', () => {
  const ws = [
    work({ id: 'A', created_at: '2026-10-15T01:00:00Z' }), // last bucket
    work({ id: 'B', created_at: '2026-10-09T01:00:00Z' }), // last bucket (seven days ending today start on the 9th)
    work({ id: 'C', created_at: '2026-10-08T01:00:00Z' }), // the one before
    work({ id: 'D', created_at: '2026-01-01T00:00:00Z', status: 'PUBLISHED', pub_at: '2026-10-14T10:00:00Z' }),
    work({ id: 'E', created_at: '2026-01-01T00:00:00Z', status: 'DRAFT', pub_at: '2026-10-14T10:00:00Z' }), // not published: not counted
  ];
  const a = analyse(ws, [], [], TODAY, NOW, 8);
  assert.equal(a.weeks.length, 8);
  assert.equal(a.weeks[7].from, '2026-10-09');
  assert.equal(a.weeks[7].made, 2);
  assert.equal(a.weeks[6].made, 1);
  assert.equal(a.weeks[7].published, 1);
  assert.equal(a.weeks.reduce((n, x) => n + x.published, 0), 1);
});

test('review: waiting, changes, rounds and the share approved in the first round', () => {
  const ws = [
    work({ id: 'A', status: 'IN_REVIEW', review_cycle: 1 }),
    work({ id: 'B', status: 'CHANGES_REQUESTED', review_cycle: 2 }),
    work({ id: 'C', status: 'APPROVED', review_cycle: 1 }),
    work({ id: 'D', status: 'PUBLISHED', review_cycle: 3 }),
    work({ id: 'E', status: 'DRAFT' }),
  ];
  const r = analyse(ws, [], [], TODAY, NOW).review;
  assert.equal(r.waiting, 1);
  assert.equal(r.changes, 1);
  assert.equal(r.reviewed, 4);
  assert.equal(r.meanRounds, 7 / 4);
  assert.equal(r.firstRound, 1 / 2);
  const none = analyse([work({})], [], [], TODAY, NOW).review;
  assert.equal(none.meanRounds, null);
  assert.equal(none.firstRound, null);
});

test('platforms: accounts and their health, what was addressed, what the simulation published', () => {
  const accounts = [
    account({ id: 'i1', platform: 'instagram', conn_kind: 'oauth', conn_state: 'connected', authorized_until: '2026-10-20T00:00:00Z' }), // connected, expiring in 5 days
    account({ id: 'i2', platform: 'instagram', conn_kind: 'oauth', conn_state: 'needs_reconnect', authorized_until: '2027-01-01T00:00:00Z' }), // attention
    account({ id: 'i3', platform: 'instagram', active: false, conn_state: 'error' }), // switched off: not attention
    account({ id: 'y1', platform: 'youtube', authorized_until: '2026-10-10T00:00:00Z' }), // authorisation ended: attention
  ];
  const ws = [
    work({ id: 'A', channels: ['i1', 'i2', 'y1'], results: { i1: { ok: true, at: 'x', why: null }, i2: { ok: false, at: 'x', why: 'e' }, y1: { ok: true, at: 'x', why: null } } }),
    work({ id: 'B', channels: ['i1'], results: { i1: { ok: true, at: 'x', why: null } } }),
  ];
  const a = analyse(ws, accounts, [platform('instagram', 'إنستغرام'), platform('youtube', 'يوتيوب')], TODAY, NOW);
  const ig = a.platforms.find((p) => p.key === 'instagram');
  const yt = a.platforms.find((p) => p.key === 'youtube');
  assert.deepEqual([ig.accounts, ig.active, ig.connected, ig.attention, ig.expiring], [3, 2, 1, 1, 1]);
  assert.deepEqual([ig.addressed, ig.ok, ig.failed], [2, 2, 1], 'a work counts once per platform, results once per account');
  assert.deepEqual([yt.accounts, yt.attention, yt.addressed, yt.ok, yt.failed], [1, 1, 1, 1, 0]);
  assert.deepEqual(a.published, { ok: 3, failed: 1 });
  assert.equal(percent(2, 3), 67);
  assert.equal(percent(0, 0), null);
});

test('the page reads the database through the work provider and is honest that publishing is a simulation', () => {
  const page = readFileSync('src/components/work/analytics.tsx', 'utf8');
  assert.match(page, /useWorkList\(\)/);
  assert.match(page, /النشر محاكاة/);
  assert.doesNotMatch(page, /domain'|useHub/, 'no sample state');
  const hub = readFileSync('src/components/hub-page.tsx', 'utf8');
  assert.match(hub, /page === 'analytics'[\s\S]{0,120}<AnalyticsPage \/>/);
});

// Action_Plan.md section 5: the reminder before an app's secret expires. The database half is
// supabase/tests/secret_expiry_rules.sql (qa/secret-expiry-rules.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXPIRY_WINDOW_DAYS, daysUntil, expiryInputOk, expiryLineAr, expiryOf, parseExpiry, riyadhToday } from '../src/lib/integrations/expiry.ts';
import { noticeHref } from '../src/lib/work/rules.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('a date is a real calendar date or nothing', () => {
  assert.equal(parseExpiry('2027-02-28'), '2027-02-28');
  assert.equal(parseExpiry('2027-02-30'), null);
  assert.equal(parseExpiry('2027-2-3'), null);
  assert.equal(parseExpiry('soon'), null);
  assert.equal(parseExpiry(20270101), null);
  assert.equal(daysUntil('2026-11-14', '2026-10-15'), 30);
  assert.equal(daysUntil('2026-10-12', '2026-10-15'), -3);
});

test('Riyadh decides the day', () => {
  // 22:00 UTC is already the next day in Riyadh (UTC+3).
  assert.equal(riyadhToday(new Date('2026-10-15T22:00:00Z')), '2026-10-16');
  assert.equal(riyadhToday(new Date('2026-10-15T20:59:00Z')), '2026-10-15');
});

test('the states: none, ok, soon, expired, with the window of 30 days', () => {
  const today = '2026-10-15';
  assert.equal(EXPIRY_WINDOW_DAYS, 30);
  assert.deepEqual(expiryOf({}, today), { state: 'none', days: null, on: null });
  assert.deepEqual(expiryOf({ secret_expires_on: 'x' }, today), { state: 'none', days: null, on: null });
  assert.equal(expiryOf({ secret_expires_on: '2027-10-15' }, today).state, 'ok');
  assert.equal(expiryOf({ secret_expires_on: '2026-11-14' }, today).state, 'soon');
  assert.equal(expiryOf({ secret_expires_on: '2026-11-15' }, today).state, 'ok');
  assert.equal(expiryOf({ secret_expires_on: '2026-10-15' }, today).state, 'soon');
  assert.equal(expiryOf({ secret_expires_on: '2026-10-14' }, today).state, 'expired');
});

test('the lines say what to do', () => {
  const today = '2026-10-15';
  assert.equal(expiryLineAr(expiryOf({}, today)), '');
  assert.match(expiryLineAr(expiryOf({ secret_expires_on: '2026-10-25' }, today)), /بعد 10 يوماً/);
  assert.match(expiryLineAr(expiryOf({ secret_expires_on: '2026-10-15' }, today)), /اليوم/);
  assert.match(expiryLineAr(expiryOf({ secret_expires_on: '2026-10-01' }, today)), /انتهى السر/);
  assert.match(expiryLineAr(expiryOf({ secret_expires_on: '2027-03-01' }, today)), /بعد \d+ يوماً/);
});

test('what the form may send: real, at most a year back and ten ahead', () => {
  const today = '2026-10-15';
  assert.equal(expiryInputOk('2028-10-15', today), true);
  assert.equal(expiryInputOk('2026-01-01', today), true);
  assert.equal(expiryInputOk('2020-01-01', today), false);
  assert.equal(expiryInputOk('2040-01-01', today), false);
  assert.equal(expiryInputOk('2026-13-01', today), false);
  assert.equal(expiryInputOk(undefined, today), false);
});

test('the notice leads to the connections tab', () => {
  assert.equal(noticeHref({ page: 'settings', tab: 'connections' }), '/settings?tab=connections');
  assert.equal(noticeHref({ page: 'settings' }), '/settings');
});

test('wiring: the date is validated by the route, kept in the app config, drawn on the card and checked once per visit', () => {
  const route = read('src/app/api/platforms/app/route.ts');
  assert.match(route, /expiryInputOk\(rawExpiry, riyadhToday\(\)\)/);
  assert.match(route, /secret_expires_on: rawExpiry/);
  const card = read('src/components/settings/platforms.tsx');
  assert.match(card, /st-app-expires/);
  assert.match(card, /expiryLineAr\(expiry\)/);
  assert.match(read('src/components/work/data.tsx'), /rpc\('integration_expiry_notes'\)/);
  const sql = read('supabase/migrations/20261015230000_secret_expiry.sql');
  assert.match(sql, /revoke all on function public\.integration_expiry_notes\(\) from public, anon/);
  assert.match(sql, /interval '7 days'/);
});

test('the Microsoft guide tells the Director to write the date down', () => {
  assert.match(read('src/lib/setup-guides.ts'), /ينتهي السر في/);
});

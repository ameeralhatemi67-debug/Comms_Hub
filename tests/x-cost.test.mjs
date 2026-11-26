// X's API cost calculator (MVP_draft.md section 82, src/lib/platforms/x-cost.ts): the prices are the ones the X setup guide prints, the
// sums are exact, an odd input cannot break a figure, and what X leaves unsaid is said. The page is clicked through by qa/x-cost-flow.cjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GUIDES } from '../src/lib/setup-guides.ts';
import {
  BASIS_AR,
  DEFAULT_INPUT,
  LINE_AR,
  PERIODS,
  PRICE,
  RANGE,
  SCENARIOS,
  X_CAN,
  X_FREE_CREDITS,
  X_PRICES_READ,
  X_UNKNOWN,
  clampInput,
  compare,
  coverDays,
  daysOf,
  estimate,
  periodAr,
  postsIn,
  usd,
} from '../src/lib/platforms/x-cost.ts';

/** Every price line of the X guide (the console's tables of 2026-11-03), as mills. */
function guidePrices() {
  const step = GUIDES.x.steps.find((s) => s.id === 'credits');
  const out = new Map();
  for (const t of step.tables) for (const [name, price] of t.rows) out.set(name, /^\$([\d.]+)/.exec(price) ? Math.round(Number(/^\$([\d.]+)/.exec(price)[1]) * 1000) : null);
  return out;
}

test('the prices are the ones the X setup guide prints, to the mill', () => {
  const g = guidePrices();
  assert.equal(PRICE.post, g.get('Post: Create'));
  assert.equal(PRICE.postWithUrl, g.get('Post: Create (with URL)'));
  assert.equal(PRICE.userRead, g.get('User: Read'));
  assert.equal(PRICE.postRead, g.get('Posts: Read'));
  assert.equal(PRICE.mediaMetadata, g.get('Media Metadata'));
  assert.equal(PRICE.postDelete, Math.max(g.get('Interaction: Delete'), g.get('Content: Manage')), 'a delete is counted at the higher of the two lines it could fall under');
  assert.match(X_PRICES_READ, /^\d{4}-\d{2}-\d{2}$/);
});

test('a link makes a post thirteen times dearer, and the figures say so', () => {
  assert.equal(PRICE.postWithUrl / PRICE.post, 200 / 15);
  assert.ok(PRICE.postWithUrl > 13 * PRICE.post && PRICE.postWithUrl < 14 * PRICE.post);
});

test('a period holds its days: a year is 365, a month 30, and posts follow the unit they were given in', () => {
  assert.deepEqual([1, 2, 3, 6, 12, 24].map(daysOf), [30, 61, 91, 183, 365, 731], 'a month is 30.4375 days, rounded; two years are 730.5, which rounds up');
  const base = { ...DEFAULT_INPUT, months: 1 };
  assert.equal(postsIn(clampInput({ ...base, posts: 2, per: 'day' })), 60);
  assert.equal(postsIn(clampInput({ ...base, posts: 7, per: 'week' })), 30, 'seven a week is one a day');
  assert.equal(postsIn(clampInput({ ...base, months: 12, posts: 30, per: 'month' })), 360);
  assert.equal(postsIn(clampInput({ ...base, posts: 0.5, per: 'day' })), 15, 'half a post a day');
});

test('a plain bill: only posts, no links, nothing else, to the mill', () => {
  const r = estimate({ months: 1, posts: 1, per: 'day', linkShare: 0, mediaShare: 0, deletes: 0, checksPerDay: 0, reads: 0 });
  assert.equal(r.posts, 30);
  assert.equal(r.total, 30 * PRICE.post);
  assert.equal(usd(r.total), '$0.450');
  assert.equal(r.perMonth, 450);
  assert.equal(r.perDay, 15);
  assert.equal(r.perPost, 15);
  assert.equal(r.linkExtra, 0);
  assert.equal(r.linkShareOfCost, 0);
  assert.equal(r.withoutLinks, r.total);
});

test('links: twenty percent of ten posts is two links, which cost most of the bill', () => {
  const r = estimate({ months: 1, posts: 10, per: 'month', linkShare: 20, mediaShare: 0, deletes: 0, checksPerDay: 0, reads: 0 });
  assert.equal(r.posts, 10);
  assert.equal(r.linkPosts, 2);
  assert.equal(r.total, 8 * 15 + 2 * 200);
  assert.equal(r.linkExtra, 2 * (200 - 15));
  assert.equal(r.withoutLinks, 10 * 15);
  assert.equal(r.linkShareOfCost, Math.round((400 * 100) / 520));
  assert.equal(r.perPost, 52);
});

test('the lines add up to the total, and each line is its count times its unit', () => {
  for (const months of [1, 3, 12]) {
    for (const s of SCENARIOS) {
      const r = estimate({ ...DEFAULT_INPUT, ...s.input, months });
      assert.equal(r.lines.reduce((t, l) => t + l.total, 0), r.total, `${s.id} ${months}`);
      for (const l of r.lines) assert.equal(l.total, l.count * l.unit);
      assert.deepEqual(r.lines.map((l) => l.id), ['plain', 'link', 'media', 'delete', 'check', 'read']);
      assert.equal(r.lines[0].count + r.lines[1].count, r.posts, 'every post is plain or with a link');
    }
  }
});

test('pictures: not counted unless the cautious figure is asked for, and then one Media Metadata for each', () => {
  const base = { months: 1, posts: 10, per: 'month', linkShare: 0, mediaShare: 50, mediaPerPost: 2, deletes: 0, checksPerDay: 0, reads: 0 };
  const quiet = estimate(base);
  const media = quiet.lines.find((l) => l.id === 'media');
  assert.equal(quiet.mediaPosts, 5);
  assert.equal(quiet.mediaItems, 10);
  assert.deepEqual([media.count, media.total, media.basis], [10, 0, 'unlisted']);
  const cautious = estimate({ ...base, mediaBilled: true });
  const m2 = cautious.lines.find((l) => l.id === 'media');
  assert.deepEqual([m2.count, m2.total, m2.basis], [10, 10 * PRICE.mediaMetadata, 'assumed']);
  assert.equal(cautious.total - quiet.total, 50);
});

test('the other lines: deletes per month, checks per day, post reads per month', () => {
  const r = estimate({ months: 3, posts: 0, per: 'day', linkShare: 0, mediaShare: 0, deletes: 4, checksPerDay: 2, reads: 100 });
  const by = Object.fromEntries(r.lines.map((l) => [l.id, l]));
  assert.equal(by.delete.count, 12);
  assert.equal(by.delete.total, 12 * PRICE.postDelete);
  assert.equal(by.check.count, 2 * 91);
  assert.equal(by.check.total, 2 * 91 * PRICE.userRead);
  assert.equal(by.read.count, 300);
  assert.equal(by.read.total, 300 * PRICE.postRead);
  assert.equal(r.perPost, null, 'no posts, no average post');
  assert.deepEqual([by.delete.basis, by.check.basis, by.read.basis], ['assumed', 'listed', 'listed']);
});

test('the same activity over a longer time costs in proportion, and the comparison says it', () => {
  const input = { posts: 3, per: 'day', linkShare: 10, mediaShare: 0, deletes: 0, checksPerDay: 0, reads: 0 };
  const c = Object.fromEntries(compare(input, [1, 12]).map((x) => [x.months, x.total]));
  assert.ok(c[12] > 11 * c[1] && c[12] < 13 * c[1]);
  assert.deepEqual(compare(input).map((x) => x.months), [1, 3, 6, 12]);
  assert.ok(PERIODS.every((p) => estimate({ months: p }).input.months === p));
});

test('nothing a person types can break a figure: out of range, empty, text and fractions are brought in or defaulted', () => {
  const bad = clampInput({ months: -4, posts: 99999, per: 'hour', linkShare: 250, mediaShare: -3, mediaPerPost: 9, deletes: Infinity, checksPerDay: NaN, reads: '12' });
  assert.deepEqual([bad.months, bad.posts, bad.per, bad.linkShare, bad.mediaShare, bad.mediaPerPost], [RANGE.months[0], RANGE.posts[1], 'day', 100, 0, RANGE.mediaPerPost[1]]);
  assert.equal(bad.deletes, DEFAULT_INPUT.deletes, 'infinity is not a number');
  assert.equal(bad.checksPerDay, DEFAULT_INPUT.checksPerDay);
  assert.equal(bad.reads, DEFAULT_INPUT.reads, 'text is not a number');
  assert.equal(clampInput({ months: 2.6 }).months, 3);
  assert.equal(clampInput({ posts: 1.26 }).posts, 1.3);
  assert.deepEqual(clampInput({}), DEFAULT_INPUT);
  for (const i of [{}, { months: 36, posts: 1000, per: 'day', linkShare: 100, mediaShare: 100, mediaPerPost: 4, mediaBilled: true, deletes: 10000, checksPerDay: 48, reads: 100000 }]) {
    const r = estimate(i);
    assert.ok(Number.isSafeInteger(r.total) && r.total >= 0, 'a whole, safe number of mills');
  }
});

test('the spending limit is the month\'s cost and a fifth more, in whole dollars, never below the cost', () => {
  const r = estimate({ months: 1, posts: 1, per: 'day', linkShare: 0, mediaShare: 0, deletes: 0, checksPerDay: 0, reads: 0 });
  assert.equal(r.limitDollars, 1, '0.45 dollars and a fifth is under a dollar: one dollar');
  const big = estimate({ months: 3, posts: 8, per: 'day', linkShare: 35, mediaShare: 0, deletes: 0, checksPerDay: 0, reads: 0 });
  assert.ok(big.limitDollars * 1000 >= (big.total / 3) * 1.2, 'at least the month and a fifth');
  assert.ok((big.limitDollars - 1) * 1000 < (big.total / 3) * 1.2, 'and no more than one dollar over it');
  assert.equal(estimate({ posts: 0, checksPerDay: 0, deletes: 0, reads: 0 }).limitDollars, 0, 'nothing spent, no limit to set');
});

test('how long a balance lasts', () => {
  const r = estimate({ months: 1, posts: 1, per: 'day', linkShare: 0, mediaShare: 0, deletes: 0, checksPerDay: 0, reads: 0 });
  assert.equal(coverDays(0.45, r), 30);
  assert.equal(coverDays(4.5, r), 300);
  assert.equal(coverDays(0, r), 0);
  assert.equal(coverDays(-5, r), 0);
  assert.equal(coverDays(NaN, r), 0);
  assert.equal(coverDays(10, estimate({ posts: 0, checksPerDay: 0, deletes: 0, reads: 0 })), null, 'nothing is spent: it never runs out');
});

test('money is shown as cents from a dollar up and thousandths below it', () => {
  assert.equal(usd(0), '$0.000');
  assert.equal(usd(15), '$0.015');
  assert.equal(usd(200), '$0.200');
  assert.equal(usd(999), '$0.999');
  assert.equal(usd(1000), '$1.00');
  assert.equal(usd(12345), '$12.35');
  assert.equal(usd(1234567), '$1,234.57');
  assert.equal(usd(52705), '$52.71', 'half a cent rounds up, in whole numbers: 52.705 is not left to a float');
  assert.equal(usd(1005), '$1.01');
  assert.equal(usd(999.6), '$1.00', 'a figure that is not whole is rounded to a mill first');
  assert.equal(usd(-450), '-$0.450');
});

test('the words of a period', () => {
  assert.deepEqual([1, 2, 3, 6, 12, 24, 15].map(periodAr), ['شهر', 'شهرين', '3 أشهر', '6 أشهر', 'سنة', 'سنتين', '15 شهراً']);
});

test('the scenarios are inside the ranges, and every line, basis and capability has its words', () => {
  for (const s of SCENARIOS) {
    const c = clampInput({ ...DEFAULT_INPUT, ...s.input });
    for (const k of Object.keys(s.input)) assert.equal(c[k], s.input[k], `${s.id}.${k} is not changed by the ranges`);
    assert.ok(s.label.length > 1 && s.note.length > 5);
  }
  for (const id of ['plain', 'link', 'media', 'delete', 'check', 'read']) assert.ok(LINE_AR[id].length > 3, id);
  for (const b of ['listed', 'assumed', 'unlisted']) assert.ok(BASIS_AR[b].length > 2, b);
  assert.ok(X_CAN.length >= 10);
  for (const r of X_CAN) assert.ok(r.what.length > 2 && r.cost.length > 1 && r.note.length > 10 && ['listed', 'assumed', 'unlisted', 'none'].includes(r.basis), r.what);
});

test('what X does not say is said, and so are the incentives, and nothing here is an emoji or a promise', () => {
  assert.ok(X_UNKNOWN.length >= 4);
  assert.match(X_UNKNOWN.join(' '), /with URL/);
  assert.match(X_UNKNOWN.join(' '), /Usage/);
  assert.match(X_FREE_CREDITS, /\$20/);
  assert.match(X_FREE_CREDITS, /\$50/);
  assert.match(X_FREE_CREDITS, /3 أشهر/);
  assert.match(X_CAN.find((r) => r.what.includes('اقتباس')).note, /Enterprise/);
  const all = JSON.stringify([X_CAN, X_UNKNOWN, X_FREE_CREDITS, SCENARIOS, LINE_AR, BASIS_AR]);
  assert.doesNotMatch(all, /\p{Extended_Pictographic}/u);
});

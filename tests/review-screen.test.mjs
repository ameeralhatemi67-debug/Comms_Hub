// The review screen, third round of the studio, Phase 9 (MVP_draft.md 62.13): the order of the works waiting
// for a decision (shared by «الموافقات والنشر» and ] and [), the review keys, the player's arithmetic, the
// address of a moment, and that the approval keys are held like the buttons they stand for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { around, queueOrder, reviewQueue, sentCycle } from '../src/lib/work/queue.ts';
import { REVIEW_KEYS, contentBox, frameLength, isReels, markAt, matchReviewKey, pictureFraction, playerTime, reviewHref, reviewKeyLabel, reviewStart } from '../src/lib/work/review-keys.ts';
import { HOLD } from '../src/lib/kit/hold-reasons.ts';

const read = (f) => readFileSync(f, 'utf8');
const W = (id, extra = {}) => ({ id, status: 'IN_REVIEW', review_cycle: 1, closed_at: null, priority: 'normal', ...extra });
const C = (work_id, sent_by, sent_at, n = 1) => ({ work_id, n, sent_by, sent_at });

test('the queue: urgent first, then the oldest sent; a leader sees only what they may decide', () => {
  const works = [W('A'), W('B', { priority: 'urgent' }), W('C'), W('D', { status: 'APPROVED' }), W('E', { closed_at: 'x' }), W('F')];
  const cycles = [C('A', 'w@t', '2026-10-20T08:00:00Z'), C('B', 'w@t', '2026-10-20T10:00:00Z'), C('C', 'w@t', '2026-10-19T08:00:00Z'), C('F', 'dir@t', '2026-10-18T08:00:00Z')];
  assert.deepEqual(reviewQueue(works, cycles, 'dir@t', 'director').map((x) => x.id), ['B', 'C', 'A']);
  // the assistant may decide what the director sent
  assert.deepEqual(reviewQueue(works, cycles, 'ast@t', 'assistant').map((x) => x.id), ['B', 'F', 'C', 'A']);
  // someone who does not decide sees everything in review, in the same order
  assert.deepEqual(reviewQueue(works, cycles, 'wr@t', 'writer').map((x) => x.id), ['B', 'F', 'C', 'A']);
  assert.equal(sentCycle(cycles, W('C'))?.sent_by, 'w@t');
  assert.equal([W('X'), W('Y')].sort(queueOrder([])).map((x) => x.id).join(''), 'XY');
});

test('next and previous: from the work shown; a work no longer waiting has the first as its next', () => {
  assert.deepEqual(around(['B', 'C', 'A'], 'C'), { next: 'A', prev: 'B' });
  assert.deepEqual(around(['B', 'C', 'A'], 'B'), { next: 'C', prev: null });
  assert.deepEqual(around(['B', 'C', 'A'], 'A'), { next: null, prev: 'C' });
  assert.deepEqual(around(['B', 'C'], 'Z'), { next: 'B', prev: null });
  assert.deepEqual(around([], 'Z'), { next: null, prev: null });
});

test('«الموافقات والنشر» and the review screen use the one order', () => {
  const ap = read('src/components/work/approvals.tsx');
  assert.match(ap, /reviewQueue\(vis\.map\(\(x\) => x\.w\), dec\.cycles, w\.me, w\.role\)/);
  assert.match(ap, /\.sort\(\(a, b\) => order\(a\.w, b\.w\)\)/);
  const rv = read('src/components/work/review.tsx');
  assert.match(rv, /reviewQueue\(list\.items\.map\(\(x\) => x\.w\), dec\.cycles, w\.me, w\.role\)/);
});

test('the keys: by the physical key, none twice, as the specification lists them', () => {
  const k = (code, shift = false) => ({ code, shiftKey: shift });
  assert.equal(matchReviewKey(k('Space')), 'play');
  assert.equal(matchReviewKey(k('KeyK')), 'play');
  assert.equal(matchReviewKey(k('KeyJ')), 'back');
  assert.equal(matchReviewKey(k('KeyL')), 'forward');
  assert.equal(matchReviewKey(k('ArrowLeft')), 'frame-back');
  assert.equal(matchReviewKey(k('ArrowRight')), 'frame-forward');
  assert.equal(matchReviewKey(k('KeyG', true)), 'safe');
  assert.equal(matchReviewKey(k('KeyG')), null);
  assert.equal(matchReviewKey(k('KeyN')), 'note');
  assert.equal(matchReviewKey(k('KeyR')), 'changes');
  assert.equal(matchReviewKey(k('KeyA')), 'approve');
  assert.equal(matchReviewKey(k('KeyA', true)), 'approve-all');
  assert.equal(matchReviewKey(k('BracketRight')), 'next');
  assert.equal(matchReviewKey(k('BracketLeft')), 'prev');
  assert.equal(matchReviewKey(k('Slash', true)), 'keys');
  assert.equal(matchReviewKey({ code: 'KeyA', ctrlKey: true }), null);
  const seen = new Set();
  for (const r of REVIEW_KEYS) for (const c of r.combos) {
    assert.ok(!seen.has(c), c);
    seen.add(c);
  }
  assert.equal(reviewKeyLabel('keys'), '?');
  assert.equal(reviewKeyLabel('approve-all'), 'Shift+A');
  for (const r of REVIEW_KEYS.filter((x) => x.id.startsWith('approve'))) assert.match(r.label, /مطولاً/);
});

test('the player: times, a frame, the picture inside its box, the safe zones, the marks', () => {
  assert.equal(playerTime(0), '00:00.0');
  assert.equal(playerTime(65.27), '01:05.2');
  assert.equal(playerTime(1.5), '00:01.5');
  assert.equal(playerTime(-3), '00:00.0');
  assert.equal(frameLength(null), 1 / 30);
  assert.equal(frameLength(0.04), 0.04);
  assert.equal(frameLength(0.5), 1 / 30);
  assert.deepEqual(contentBox(800, 450, 1080, 1920), { x: (800 - 253.125) / 2, y: 0, w: 253.125, h: 450 });
  assert.deepEqual(contentBox(800, 450, 1920, 1080), { x: 0, y: 0, w: 800, h: 450 });
  assert.deepEqual(contentBox(800, 450, 0, 0), { x: 0, y: 0, w: 800, h: 450 });
  assert.deepEqual(pictureFraction(150, 45, { x: 100, y: 0, w: 200, h: 450 }), { x: 0.25, y: 0.1 });
  assert.ok(isReels(1080, 1920));
  assert.ok(!isReels(1920, 1080));
  assert.ok(!isReels(1080, 1350));
  assert.equal(markAt(3000, 12), 25);
  assert.equal(markAt(30000, 12), 100);
  assert.equal(markAt(1000, 0), 0);
});

test('the address of a moment: written by the shares, read by the screen', () => {
  const href = reviewHref('CH-7', 'f1', 12.44, 2);
  assert.equal(href, '/approvals/CH-7?a=f1&t=12.4&v=2');
  const q = new URLSearchParams(href.split('?')[1]);
  assert.deepEqual(reviewStart(q), { t: 12.4, v: 2, a: 'f1' });
  assert.deepEqual(reviewStart(new URLSearchParams('t=5')), { t: 5, v: null, a: null });
  assert.equal(reviewStart(new URLSearchParams('v=2')), null);
  assert.equal(reviewStart(new URLSearchParams('t=-1')), null);
  assert.equal(reviewStart(new URLSearchParams('t=x')), null);
  assert.deepEqual(reviewStart(new URLSearchParams('t=3&v=0')), { t: 3, v: null, a: null });
});

test('the approval keys are held like their buttons, and stand only where the buttons stand', () => {
  const rv = read('src/components/work/review.tsx');
  const pl = read('src/components/work/review-player.tsx');
  const hold = read('src/lib/kit/hold.ts');
  assert.match(HOLD.approvePart, /هذا الإصدار بعينه/);
  assert.match(rv, /data-keyhold=\{HOLD\.approvePart\}\s*data-approve-part=\{p\.key\}/);
  assert.match(rv, /data-hold=\{HOLD\.approveAll\}\s*data-approve-all/);
  assert.match(rv, /keyHoldStart\(document\.querySelector<HTMLButtonElement>\('\[data-approve-all\]'\)\)/);
  assert.match(pl, /keyHoldStart\(b\)/);
  // a key hold presses the button through its own click (work_decide decides again) and refuses a disabled one
  assert.match(hold, /export function keyHoldStart\(el: HTMLButtonElement \| null\): boolean \{\n\s*if \(!el \|\| el\.disabled \|\| S\.t\) return false;/);
  assert.match(hold, /start\(el, true, false\)/);
  // the player writes notes through the database functions only
  assert.match(pl, /addNote\(rpc, \{ asset: assetId, body: body\.trim\(\), atMs: composing\.ms, version, area: picture \? area : null \}\)/);
  assert.doesNotMatch(pl, /from\('media_notes'\)/);
  assert.doesNotMatch(pl, /work_decide/);
  // «طلب تعديل» carries this version's open notes with a time
  assert.match(rv, /!n\.parent_id && !n\.done_at && noteMs\(n\) !== null && \(\(n\.version \?\? null\) === null \|\| n\.version === verOfAsset\(n\.asset_id\)\)/);
});

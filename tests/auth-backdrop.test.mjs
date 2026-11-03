// The sign-in screen's moving background (src/lib/auth-backdrop.ts): the pattern, the pointer's light, the colours.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GOLD, MUTED_FALLBACK, MAX_SCALE, REACH, REST_SCALE, SPACING, SPIN_SPEED, springStep, hash01, influence, layout, look, mix, parseHex, rgba } from '../src/lib/auth-backdrop.ts';

test('the pattern covers the page with room between the rosettes, and is the same every time', () => {
  const a = layout(1920, 1080);
  const b = layout(1920, 1080);
  assert.deepEqual(a.map((c) => [c.x, c.y, c.phase, c.dir]), b.map((c) => [c.x, c.y, c.phase, c.dir]));
  assert.ok(a.length > 150 && a.length < 400, `${a.length} rosettes`);
  assert.ok(a.some((c) => c.x < 0) && a.some((c) => c.x > 1920 - SPACING), 'runs past both edges');
  // no two rosettes closer than the spacing allows (a rosette is about 19 px across at rest)
  let nearest = Infinity;
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) nearest = Math.min(nearest, Math.hypot(a[i].x - a[j].x, a[i].y - a[j].y));
  assert.ok(nearest >= SPACING * 0.86 - 0.001, `nearest ${nearest}`);
  assert.ok(new Set(a.map((c) => c.dir)).size === 2, 'some turn each way');
  assert.deepEqual(layout(0, 100), []);
  assert.deepEqual(layout(100, NaN), []);
});

test('the light is strongest at the pointer, gone at the reach, and smooth between', () => {
  assert.equal(influence(0, 0), 1);
  assert.equal(influence(REACH, 0), 0);
  assert.equal(influence(REACH * 2, 0), 0);
  let before = 1;
  for (let d = 10; d < REACH; d += 10) {
    const f = influence(d, 0);
    assert.ok(f <= before + 1e-9 && f >= 0, `falls at ${d}`);
    before = f;
  }
  assert.equal(influence(3, 4, 5), 0, 'a distance equal to the reach is outside');
});

test('colours: a rosette goes from the muted tone to the logo gold, and never leaves the range', () => {
  assert.deepEqual(mix(MUTED_FALLBACK, GOLD, 0), MUTED_FALLBACK);
  assert.deepEqual(mix(MUTED_FALLBACK, GOLD, 1), GOLD);
  assert.deepEqual(mix(MUTED_FALLBACK, GOLD, 5), GOLD, 'held outside the range');
  const cell = { phase: 1.3, dir: 1 };
  const quiet = look(0, 0, cell, MUTED_FALLBACK);
  const lit = look(1, 0, cell, MUTED_FALLBACK);
  assert.ok(quiet.alpha < 0.1, 'quiet enough to blend in');
  assert.ok(lit.alpha > 0.9 && lit.scale > quiet.scale);
  assert.deepEqual(lit.color, GOLD);
  for (let t = 0; t < 60; t += 0.7) assert.ok(look(0, t, cell, MUTED_FALLBACK).alpha > 0.015, 'never disappears');
  assert.notEqual(look(0, 0, cell, MUTED_FALLBACK).angle, look(0, 5, cell, MUTED_FALLBACK).angle, 'always turning');
  assert.notEqual(look(0, 0, cell, MUTED_FALLBACK).scale, look(0, 3, cell, MUTED_FALLBACK).scale, 'always breathing');
  assert.equal('floatY' in look(0, 0, cell, MUTED_FALLBACK), false, 'no bobbing up and down');
});

test('a lit rosette turns very calmly: slower than one turn every eight seconds', () => {
  assert.ok(SPIN_SPEED > 0 && SPIN_SPEED <= (Math.PI * 2) / 8 + 1e-9, `${SPIN_SPEED} rad/s`);
});

test('a rosette rests small, reaches the old maximum size, and overshoots it on the way', () => {
  const cell = { phase: Math.PI / 2 * 0, dir: 1 }; // at t = 0 with phase 0 the breath is neutral
  const rest = look(0, 0, cell, MUTED_FALLBACK, 0).scale;
  const full = look(1, 0, cell, MUTED_FALLBACK, 1).scale;
  assert.equal(rest, REST_SCALE);
  assert.ok(Math.abs(full - MAX_SCALE) < 1e-9, 'the lit size is the one it always had');
  assert.ok(rest < 0.16, 'smaller than the resting size before');
  // the spring toward fully lit: passes the maximum, then settles on it
  let s = { grow: 0, vel: 0 };
  let peak = 0;
  for (let i = 0; i < 600; i++) {
    s = springStep(s.grow, s.vel, 1, 1 / 60);
    peak = Math.max(peak, s.grow);
  }
  assert.ok(peak > 1.05 && peak < 1.3, `overshoots by ${(peak - 1).toFixed(3)}`);
  assert.ok(Math.abs(s.grow - 1) < 0.005, 'settles on the maximum');
  assert.ok(look(1, 0, cell, MUTED_FALLBACK, peak).scale > MAX_SCALE, 'the overshoot is drawn');
  // and back down without going below nothing
  for (let i = 0; i < 600; i++) {
    s = springStep(s.grow, s.vel, 0, 1 / 60);
    assert.ok(look(0, 0, cell, MUTED_FALLBACK, s.grow).scale > 0);
  }
  assert.ok(Math.abs(s.grow) < 0.005);
  // stable even with the longest step the drawing allows
  let big = { grow: 0, vel: 0 };
  for (let i = 0; i < 200; i++) big = springStep(big.grow, big.vel, 1, 0.05);
  assert.ok(Number.isFinite(big.grow) && Math.abs(big.grow - 1) < 0.01);
});

test('the tone is read from the page, and a bad value falls back', () => {
  assert.deepEqual(parseHex(' #c8d8bf '), [200, 216, 191]);
  assert.deepEqual(parseHex('#fff'), [255, 255, 255]);
  for (const bad of ['', null, undefined, 'red', '#12345', 'rgb(1,2,3)']) assert.deepEqual(parseHex(bad), MUTED_FALLBACK);
  assert.equal(rgba([10.4, 20.6, 30], 0.5), 'rgba(10,21,30,0.500)');
  assert.equal(rgba([0, 0, 0], 2), 'rgba(0,0,0,1.000)');
  assert.ok(hash01(1) >= 0 && hash01(1) < 1);
});

test('the component sits behind the card, takes no pointer, honours reduced motion and is on every sign-in state', () => {
  const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
  const css = read('../src/app/auth.css');
  assert.match(css, /\.auth-backdrop\{[^}]*pointer-events:none/);
  assert.match(css, /\.auth-backdrop\{[^}]*z-index:-1/);
  assert.match(css, /\.auth-screen\{isolation:isolate\}/);
  const comp = read('../src/components/auth-backdrop.tsx');
  assert.ok(comp.includes('prefers-reduced-motion: reduce'));
  assert.ok(comp.includes('aria-hidden="true"'));
  assert.equal(/localStorage|sessionStorage|fetch\(|\.value\b/.test(comp), false, 'reads nothing of the page but two colours');
  assert.equal(/\p{Extended_Pictographic}/u.test(comp), false);
  const gate = read('../src/components/auth-gate.tsx');
  assert.match(gate, /<main className="auth-screen">\s*<AuthBackdrop \/>/, 'inside the one Screen every state uses');
});

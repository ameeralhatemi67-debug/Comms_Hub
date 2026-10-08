/* Extra number designs. They follow the source number designs: logical 1280 x 720, phases come from the shared timeline. */
import { kit } from './renderers.js';

const { E, S, TAU, clamp, lerp, rgba, mix, onColor, rr, drawText, measure, numberRow, glow, fmt, arrowUp } = kit;

/* =========================================================
   Impact gauge: a graduated half-dial. Ticks light up as the arc passes, a needle overshoots and settles,
   the number lands in the centre with a pulse.
   ========================================================= */
function drawGauge(ctx, P, ph) {
  const A = P.color, cx = 640, cy = 396, R = 236, lw = 30, TXT = P.text;
  const pct = clamp(P.value / 100), e = E.outCubic(ph.fill), frac = pct * e, needle = clamp(pct * E.outBack(ph.fill, 1.5), 0, 1.04);
  const iA = E.outCubic(S(ph.t, 0, .7)), pop = 1 + .03 * Math.sin(Math.PI * ph.done);
  if (ph.done > 0 && ph.done < 1) {
    ctx.save(); ctx.strokeStyle = rgba(A, (1 - ph.done) * .5); ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cx, cy, lerp(R + 30, R + 150, E.outCubic(ph.done)), Math.PI, TAU); ctx.stroke(); ctx.restore();
  }
  ctx.save(); ctx.globalAlpha *= iA; ctx.translate(cx, cy); ctx.scale(pop, pop); ctx.translate(-cx, -cy);
  /* graduation */
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const f = i / n, a = Math.PI + f * Math.PI, long = i % 10 === 0, mid = i % 5 === 0, r1 = R + lw / 2 + 14, r2 = r1 + (long ? 26 : mid ? 18 : 10);
    const show = E.outCubic(S(ph.t, .08 + f * .3, .5 + f * .3)); if (show <= 0) continue;
    const lit = f <= frac && frac > 0;
    ctx.strokeStyle = lit ? rgba(A, long ? 1 : .85) : rgba(TXT, long ? .3 : .16); ctx.lineWidth = long ? 4 : 2.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.lineTo(cx + Math.cos(a) * (r1 + (r2 - r1) * show), cy + Math.sin(a) * (r1 + (r2 - r1) * show)); ctx.stroke();
  }
  for (let i = 0; i <= 4; i++) {                                           // scale numbers
    const a = Math.PI + i / 4 * Math.PI, r = R + lw / 2 + 62, lit = i / 4 <= frac + .001 && frac > 0;
    drawText(ctx, String(i * 25), cx + Math.cos(a) * r, cy + Math.sin(a) * r + 8, 22, 700, lit ? rgba(TXT, .92) : rgba(TXT, .4), 'center');
  }
  /* track + arc */
  ctx.lineCap = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = rgba(TXT, .1); ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, TAU); ctx.stroke();
  const sweep = frac * Math.PI;
  if (sweep > .004) {
    ctx.save(); let stroke = A;
    if (ctx.createConicGradient) { const g = ctx.createConicGradient(Math.PI, cx, cy); g.addColorStop(0, mix(A, 0, .4)); g.addColorStop(Math.max(.01, frac / 2), mix(A, 255, .25)); g.addColorStop(.5, mix(A, 255, .25)); g.addColorStop(1, mix(A, 255, .25)); stroke = g; }
    glow(ctx, P, rgba(A, .65), 34); ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, Math.PI + sweep); ctx.stroke(); ctx.restore();
    const ex = cx + Math.cos(Math.PI + sweep) * R, ey = cy + Math.sin(Math.PI + sweep) * R;
    ctx.save(); glow(ctx, P, rgba(A, .9), 20); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, lw * .24, 0, TAU); ctx.fill(); ctx.restore();
  }
  /* needle */
  const na = Math.PI + clamp(needle, 0, 1.04) * Math.PI;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(na); glow(ctx, P, rgba(A, .5), 14);
  ctx.fillStyle = TXT; ctx.beginPath(); ctx.moveTo(R - lw / 2 - 6, 0); ctx.lineTo(18, -6); ctx.lineTo(18, 6); ctx.closePath(); ctx.fill(); ctx.restore();
  ctx.save(); glow(ctx, P, rgba(A, .6), 18); ctx.fillStyle = '#10151a'; ctx.beginPath(); ctx.arc(cx, cy, 24, 0, TAU); ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = A; ctx.stroke(); ctx.fillStyle = A; ctx.beginPath(); ctx.arc(cx, cy, 8, 0, TAU); ctx.fill(); ctx.restore();
  /* readout */
  ctx.save(); glow(ctx, P, rgba(A, .4), 30);
  numberRow(ctx, { prefix: P.prefix, suffix: P.suffix, x: cx, y: cy + 168, size: 124, color: TXT, accent: A, decimals: P.decimals, value: P.value * e, finalValue: P.value }); ctx.restore();
  drawText(ctx, P.label.toUpperCase(), cx, cy + 218, 26, 800, rgba(TXT, .72), 'center', 'alphabetic', 4);
  ctx.restore();
}

/* =========================================================
   Milestones: a big counting number above a track with five stations. Each station lights, rings and ticks as the fill passes it.
   ========================================================= */
function drawMilestones(ctx, P, ph) {
  const A = P.color, TXT = P.text, left = 200, right = 1080, y = 520, e = E.outCubic(ph.fill), val = P.value * e, iA = E.outCubic(S(ph.t, 0, .7));
  const sc = lerp(.9, 1, E.outBack(ph.intro, 1.3)) * (1 + .05 * Math.sin(Math.PI * ph.done));
  ctx.save(); ctx.globalAlpha *= iA;
  /* label pill */
  ctx.save(); ctx.translate(0, (1 - iA) * -20);
  const lab = P.label.toUpperCase(), tw = measure(ctx, lab, 26, 800, 5), pw = 14 + 40 + 16 + tw + 26, ph2 = 58, px = 640 - pw / 2, py = 138;
  rr(ctx, px, py, pw, ph2, ph2 / 2); ctx.fillStyle = rgba(A, .16); ctx.fill(); ctx.strokeStyle = rgba(A, .6); ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.arc(px + 34, py + ph2 / 2, 20, 0, TAU); ctx.fillStyle = A; ctx.fill(); arrowUp(ctx, px + 34, py + ph2 / 2, 8, onColor(A), 3.5);
  drawText(ctx, lab, px + 70, py + ph2 / 2 + 9, 26, 800, A, 'left', 'alphabetic', 5); ctx.restore();
  /* number */
  ctx.save(); ctx.translate(640, 330); ctx.scale(sc, sc); ctx.translate(-640, -330); glow(ctx, P, rgba(A, .5), 42);
  numberRow(ctx, { prefix: P.prefix, suffix: P.suffix, x: 640, y: 392, size: 190, color: TXT, accent: A, decimals: P.decimals, value: val, finalValue: P.value }); ctx.restore();
  /* track */
  const len = right - left;
  rr(ctx, left, y - 7, len, 14, 7); ctx.fillStyle = rgba(TXT, .13); ctx.fill();
  if (e > .002) {
    const g = ctx.createLinearGradient(left, 0, right, 0); g.addColorStop(0, mix(A, 0, .3)); g.addColorStop(1, mix(A, 255, .22));
    ctx.save(); glow(ctx, P, rgba(A, .7), 22); rr(ctx, left, y - 7, Math.max(14, len * e), 14, 7); ctx.fillStyle = g; ctx.fill(); ctx.restore();
    ctx.save(); glow(ctx, P, rgba(A, .9), 22); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(left + len * e, y, 11, 0, TAU); ctx.fill(); ctx.restore();
  }
  /* stations */
  for (let i = 0; i < 5; i++) {
    const f = i / 4, x = left + len * f, hit = e >= f - .0001 && (i === 0 ? ph.t > .5 : e > .001), pop = E.outBack(S(e, f - .01, f + .05), 2);
    const r = 18 + 6 * (hit ? Math.max(0, pop - 1) + 1 : 0) - (hit ? 0 : 0);
    ctx.save(); ctx.translate(x, y); ctx.scale(hit ? Math.max(.5, pop) : 1, hit ? Math.max(.5, pop) : 1);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = hit ? A : '#142029'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = hit ? '#fff' : rgba(TXT, .3); ctx.stroke();
    if (hit) { ctx.strokeStyle = onColor(A); ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(-7, 1); ctx.lineTo(-2, 7); ctx.lineTo(8, -6); ctx.stroke(); }
    ctx.restore();
    const ring = S(e, f, f + .12);
    if (hit && ring > 0 && ring < 1) { ctx.save(); ctx.strokeStyle = rgba(A, (1 - ring) * .6); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 22 + 40 * E.outCubic(ring), 0, TAU); ctx.stroke(); ctx.restore(); }
    const text = `${P.prefix}${fmt(Math.round(P.value * f), 0)}${i === 4 ? P.suffix : ''}`;
    drawText(ctx, text, x, y + 62, 26, hit ? 800 : 600, hit ? rgba(TXT, .96) : rgba(TXT, .45), 'center');
  }
  ctx.restore();
}

const base = { speed: 1, hold: 1.5, glow: true, text: '#ffffff', suffix: '%', prefix: '' };
const percent = { label: 'القيمة', min: 0, max: 100, step: 1, boxMin: 0, boxMax: 100, boxStep: 1 };
export const EXTRA_NUMBERS = [
  { id: 'arc-gauge', name: 'Impact Gauge', draw: drawGauge, defaults: { ...base, color: '#80c6a3', value: 82, decimals: 0, label: 'نسبة الإنجاز' }, value: percent },
  { id: 'milestone-count', name: 'Milestones', draw: drawMilestones, defaults: { ...base, color: '#e3b95b', value: 12500, suffix: '', prefix: '', decimals: 0, label: 'مستفيد من الحملة' }, value: { label: 'القيمة', min: 0, max: 100000, step: 50, boxMin: 0, boxMax: 999999999, boxStep: 1 } },
];

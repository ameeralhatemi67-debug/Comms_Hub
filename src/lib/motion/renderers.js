// Adapted from motion_design; drawing code only. UI and lifecycle belong to React.
const LOGO_SRC = {"emblem": "/motion/logo_src-emblem.png","wordmark": "/motion/logo_src-wordmark.png","tagline": "/motion/logo_src-tagline.png"};
const LOGO_DIM = {"emblem": {"w": 768, "h": 769}, "wordmark": {"w": 900, "h": 249}, "tagline": {"w": 900, "h": 165}};

const VERSE_SRC = {"verse1": "/motion/verse_src-verse1.png","verse2": "/motion/verse_src-verse2.png"};
const VERSE_DIM = {"verse1": {"w": 1800, "h": 258}, "verse2": {"w": 1800, "h": 186}, "gap": 42};

const W = 1280, H = 720;                       // logical canvas; everything is drawn in this space
const FONT = '"Segoe UI Variable Display","Segoe UI",Inter,system-ui,-apple-system,Roboto,Helvetica,Arial,sans-serif';
let gScale = 1;                                // current render scale (needed because shadowBlur ignores transforms)

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp  = (a, b, t) => a + (b - a) * t;
const seg   = (t, a, b) => clamp((t - a) / (b - a));
const E = {
  outCubic: t => 1 - Math.pow(1 - t, 3),
  outQuart: t => 1 - Math.pow(1 - t, 4),
  inOutCubic: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  outBack: (t, s = 1.70158) => { const c = s + 1; return 1 + c * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); }
};

function hexToRgb(h) {
  h = String(h).replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
const rgba = (h, a = 1) => { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; };
const mix  = (h, target, k) => { const [r, g, b] = hexToRgb(h); const m = c => Math.round(lerp(c, target, k)); return `rgb(${m(r)},${m(g)},${m(b)})`; };
const onColor = h => { const [r, g, b] = hexToRgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) > 165 ? '#0b0d12' : '#ffffff'; };

function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function rrTop(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h));
  ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r); ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h); ctx.closePath();
}
function glow(ctx, P, color, blur) { if (!P.glow) return; ctx.shadowColor = color; ctx.shadowBlur = blur * gScale; }

/* ---- text ---- */
function setFont(ctx, size, weight) { ctx.font = `${weight} ${size}px ${FONT}`; }
function measure(ctx, str, size, weight, track = 0) {
  setFont(ctx, size, weight);
  if ('letterSpacing' in ctx) ctx.letterSpacing = track + 'px';
  return ctx.measureText(str).width;
}
function drawText(ctx, str, x, y, size, weight, color, align = 'left', base = 'alphabetic', track = 0) {
  setFont(ctx, size, weight);
  if ('letterSpacing' in ctx) ctx.letterSpacing = track + 'px';
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base;
  ctx.fillText(str, x, y);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}
function digitW(ctx, size, weight) {                       // widest digit => tabular numbers, no jitter while counting
  setFont(ctx, size, weight);
  let m = 0; for (const c of '0123456789') m = Math.max(m, ctx.measureText(c).width); return m;
}
function tabWidth(ctx, str, size, weight) {
  const dw = digitW(ctx, size, weight); let w = 0;
  for (const c of str) w += /\d/.test(c) ? dw : ctx.measureText(c).width; return w;
}
function drawTab(ctx, str, x, y, size, weight, color) {
  const dw = digitW(ctx, size, weight);
  ctx.fillStyle = color; ctx.textBaseline = 'alphabetic';
  for (const c of str) {
    if (/\d/.test(c)) { ctx.textAlign = 'center'; ctx.fillText(c, x + dw / 2, y); x += dw; }
    else { ctx.textAlign = 'left'; ctx.fillText(c, x, y); x += ctx.measureText(c).width; }
  }
}
const fmt = (v, d) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

/* Prefix + number + suffix on one baseline. The number is laid out for its FINAL width, so it never shifts while counting. */
function numberRow(ctx, o) {
  const { prefix = '', suffix = '', x, y, size, color, accent, align = 'center', weight = 900, sub = .58, decimals = 0, value, finalValue } = o;
  const num = fmt(value, decimals), fin = fmt(finalValue, decimals);
  const ss = size * sub, gap = size * .05;
  const wp = prefix ? measure(ctx, prefix, ss, weight) : 0;
  const ws = suffix ? measure(ctx, suffix, ss, weight) : 0;
  setFont(ctx, size, weight);
  const slot = tabWidth(ctx, fin, size, weight);
  const total = wp + (prefix ? gap : 0) + slot + (suffix ? gap : 0) + ws;
  let sx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const x0 = sx;
  if (prefix) { drawText(ctx, prefix, sx, y, ss, weight, accent); sx += wp + gap; }
  setFont(ctx, size, weight);
  const nw = tabWidth(ctx, num, size, weight);
  drawTab(ctx, num, sx + slot - nw, y, size, weight, color);
  sx += slot;
  if (suffix) { sx += gap; drawText(ctx, suffix, sx, y, ss, weight, accent); }
  return { x0, total };
}

function arrowUp(ctx, cx, cy, s, color, lw) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, cy + s); ctx.lineTo(cx, cy - s);
  ctx.moveTo(cx - s * .72, cy - s * .28); ctx.lineTo(cx, cy - s); ctx.lineTo(cx + s * .72, cy - s * .28);
  ctx.stroke(); ctx.restore();
}

/* =========================================================
   Timeline: every graphic shares the same phases
   intro -> fill (the count / draw) -> hold -> outro
   ========================================================= */
function timing(P) {
  const fillStart = .5, fillEnd = fillStart + 2.6, holdEnd = fillEnd + P.hold;
  return { fillStart, fillEnd, holdEnd, total: holdEnd + .7 };
}
function phases(t, P) {
  const T = timing(P);
  return { t, T, intro: seg(t, 0, .8), fill: seg(t, T.fillStart, T.fillEnd), done: seg(t, T.fillEnd, T.fillEnd + .6), outro: seg(t, T.holdEnd, T.total) };
}
const timingOf = (g, P) => g.timing ? g.timing(P) : timing(P);
function renderFrame(g, P, t, ctx, scale, bg) {
  gScale = scale;
  const cw = ctx.canvas.width, ch = ctx.canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  drawGraphic(g, P, t, ctx);
  if (bg) {                                    // key color goes BEHIND the drawing, so holes a design cuts (video windows) stay keyable
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = bg; ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = 'source-over';
  }
}
function drawGraphic(g, P, t, ctx) {
  if (g.raw) { ctx.save(); g.draw(ctx, P, t); ctx.restore(); return; }
  const ph = phases(t, P), o = E.inOutCubic(ph.outro);
  if (o >= 1) return;
  ctx.save();
  ctx.globalAlpha = 1 - o;
  const s = 1 - .03 * o;
  ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2);
  g.draw(ctx, P, ph);
  ctx.restore();
}

/* =========================================================
   Shared header for the two chart graphics
   ========================================================= */
function chartHeader(ctx, P, ph, val) {
  const A = P.color, a = E.outCubic(seg(ph.t, 0, .7));
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - a) * -16);
  ctx.beginPath(); safeArc(ctx, 192, 108, 22, 0, Math.PI * 2);
  ctx.fillStyle = rgba(A, .18); ctx.fill(); ctx.strokeStyle = rgba(A, .75); ctx.lineWidth = 2; ctx.stroke();
  arrowUp(ctx, 192, 108, 9, A, 3.5);
  drawText(ctx, P.label.toUpperCase(), 232, 118, 28, 800, A, 'left', 'alphabetic', 5);
  glow(ctx, P, rgba(A, .5), 40);
  numberRow(ctx, { prefix: P.prefix, suffix: P.suffix, x: 170, y: 252, size: 140, color: P.text, accent: A, align: 'left', decimals: P.decimals, value: val, finalValue: P.value });
  ctx.restore();
}

/* =========================================================
   01  COUNT UP
   ========================================================= */
function drawCounter(ctx, P, ph) {
  const A = P.color, cx = W / 2, size = 240, y = 470;
  const iA = E.outCubic(seg(ph.t, 0, .7));
  const e = E.outQuart(ph.fill), val = P.value * e;
  const midY = y - size * .36;

  // pulse ring when the count lands
  if (ph.done > 0 && ph.done < 1) {
    ctx.save(); ctx.strokeStyle = rgba(A, (1 - ph.done) * .55); ctx.lineWidth = 5;
    ctx.beginPath(); safeArc(ctx, cx, midY, lerp(150, 430, E.outCubic(ph.done)), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }

  // label pill
  ctx.save(); ctx.globalAlpha *= iA; ctx.translate(0, (1 - iA) * -22);
  const lab = P.label.toUpperCase(), tw = measure(ctx, lab, 26, 800, 5);
  const pw = 14 + 40 + 16 + tw + 26, ph2 = 58, px = cx - pw / 2, py = 214;
  rr(ctx, px, py, pw, ph2, ph2 / 2); ctx.fillStyle = rgba(A, .16); ctx.fill(); ctx.strokeStyle = rgba(A, .6); ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); safeArc(ctx, px + 14 + 20, py + ph2 / 2, 20, 0, Math.PI * 2); ctx.fillStyle = A; ctx.fill();
  arrowUp(ctx, px + 34, py + ph2 / 2, 8, onColor(A), 3.5);
  drawText(ctx, lab, px + 14 + 40 + 16, py + ph2 / 2 + 9, 26, 800, A, 'left', 'alphabetic', 5);
  ctx.restore();

  // number
  const pop = 1 + .06 * Math.sin(Math.PI * ph.done);
  const sc = lerp(.86, 1, E.outBack(ph.intro, 1.4)) * pop;
  let r;
  ctx.save(); ctx.globalAlpha *= iA;
  ctx.translate(cx, midY); ctx.scale(sc, sc); ctx.translate(-cx, -midY);
  glow(ctx, P, rgba(A, .55), 46);
  r = numberRow(ctx, { prefix: P.prefix, suffix: P.suffix, x: cx, y, size, color: P.text, accent: A, decimals: P.decimals, value: val, finalValue: P.value });
  ctx.restore();

  // underline that fills with the count
  ctx.save(); ctx.globalAlpha *= iA;
  const bx = r.x0, bw = r.total, by = y + 34;
  rr(ctx, bx, by, bw, 10, 5); ctx.fillStyle = rgba(P.text, .14); ctx.fill();
  if (e > .002) {
    const g = ctx.createLinearGradient(bx, 0, bx + bw, 0); g.addColorStop(0, mix(A, 0, .3)); g.addColorStop(1, mix(A, 255, .2));
    glow(ctx, P, rgba(A, .7), 24);
    rr(ctx, bx, by, bw * e, 10, 5); ctx.fillStyle = g; ctx.fill();
  }
  ctx.restore();
}

/* =========================================================
   02  ODOMETER
   ========================================================= */
function drawOdometer(ctx, P, ph) {
  const A = P.color;
  const v = Math.max(0, Math.round(P.value)), s = String(v), n = s.length;
  const items = [];
  for (let i = 0; i < n; i++) { items.push({ t: 'd', ch: +s[i], idx: i }); const rem = n - 1 - i; if (rem > 0 && rem % 3 === 0) items.push({ t: 's' }); }
  const cw = 118, ch = 196, sw = 34, gap = 10, fs = ch * .74, lh = ch * .86, pfs = ch * .5;
  let total = 0; items.forEach(it => total += (it.t === 'd' ? cw : sw)); total += gap * (items.length - 1);
  const pw = P.prefix ? measure(ctx, P.prefix, pfs, 900) + 22 : 0;
  const sfw = P.suffix ? measure(ctx, P.suffix, pfs, 900) + 22 : 0;
  const full = pw + total + sfw, k = Math.min(1, 1140 / full);
  const labelA = E.outCubic(seg(ph.t, 0, .6));

  ctx.save(); ctx.translate(W / 2, 372); ctx.scale(k, k);
  let x = -full / 2;

  // label with side rules
  ctx.save(); ctx.globalAlpha *= labelA;
  const lab = P.label.toUpperCase(), lw = measure(ctx, lab, 28, 800, 6), ly = -ch / 2 - 40;
  drawText(ctx, lab, 0, ly + 10, 28, 800, A, 'center', 'alphabetic', 6);
  ctx.fillStyle = rgba(A, .55);
  const rule = Math.min(260, (full - lw) / 2 - 24);
  if (rule > 20) { ctx.fillRect(-lw / 2 - 24 - rule, ly, rule, 3); ctx.fillRect(lw / 2 + 24, ly, rule, 3); }
  ctx.restore();

  if (P.prefix) { ctx.save(); ctx.globalAlpha *= labelA; drawText(ctx, P.prefix, x, 0, pfs, 900, A, 'left', 'middle'); ctx.restore(); x += pw; }

  const done = ph.done, flash = Math.sin(Math.PI * done);
  for (const it of items) {
    if (it.t === 's') { drawText(ctx, ',', x + sw / 2, ch * .26, ch * .6, 900, A, 'center', 'middle'); x += sw + gap; continue; }
    const di = it.idx, dl = (di / Math.max(1, n - 1)) * .3;
    const e = E.outQuart(seg(ph.fill, dl, dl + .7));
    const turns = 1 + Math.round(di * .8), travel = it.ch + 10 * turns, pos = travel * e;
    const base = Math.floor(pos), fr = pos - base;
    const ia = E.outCubic(seg(ph.t, .06 * di, .06 * di + .6));
    ctx.save(); ctx.globalAlpha *= ia; ctx.translate(0, (1 - ia) * 44);

    const pg = ctx.createLinearGradient(0, -ch / 2, 0, ch / 2); pg.addColorStop(0, '#1a1f2a'); pg.addColorStop(1, '#0d1016');
    if (done > 0) glow(ctx, P, rgba(A, .5 * flash), 36);
    rr(ctx, x, -ch / 2, cw, ch, 22); ctx.fillStyle = pg; ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    ctx.save(); rr(ctx, x, -ch / 2, cw, ch, 22); ctx.clip();
    for (let j = -1; j <= 2; j++) {
      const d = (((base + j) % 10) + 10) % 10;
      drawText(ctx, String(d), x + cw / 2, (j - fr) * lh + fs * .04, fs, 900, P.text, 'center', 'middle');
    }
    const ft = ctx.createLinearGradient(0, -ch / 2, 0, -ch / 2 + ch * .3); ft.addColorStop(0, 'rgb(26,31,42)'); ft.addColorStop(1, 'rgba(26,31,42,0)');
    ctx.fillStyle = ft; ctx.fillRect(x, -ch / 2, cw, ch * .3);
    const fb = ctx.createLinearGradient(0, ch / 2 - ch * .3, 0, ch / 2); fb.addColorStop(0, 'rgba(13,16,22,0)'); fb.addColorStop(1, 'rgb(13,16,22)');
    ctx.fillStyle = fb; ctx.fillRect(x, ch / 2 - ch * .3, cw, ch * .3);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x, -1, cw, 2);
    ctx.restore();
    rr(ctx, x, -ch / 2, cw, ch, 22);
    ctx.strokeStyle = done > 0 ? rgba(A, .25 + .6 * flash) : 'rgba(255,255,255,.1)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    x += cw + gap;
  }
  if (P.suffix) { x += 22 - gap; ctx.save(); ctx.globalAlpha *= labelA; drawText(ctx, P.suffix, x, 0, pfs, 900, A, 'left', 'middle'); ctx.restore(); }

  // progress line under the plates
  const lx = -total / 2 + (pw - sfw) / 2, ey = ch / 2 + 38;
  ctx.save(); ctx.globalAlpha *= labelA;
  rr(ctx, lx, ey, total, 8, 4); ctx.fillStyle = rgba(P.text, .12); ctx.fill();
  const fe = E.outCubic(ph.fill);
  if (fe > .002) { glow(ctx, P, rgba(A, .7), 22); rr(ctx, lx, ey, total * fe, 8, 4); ctx.fillStyle = A; ctx.fill(); }
  ctx.restore();
  ctx.restore();
}

/* =========================================================
   03  RING
   ========================================================= */
function drawRing(ctx, P, ph) {
  const A = P.color, cx = W / 2, cy = 350, R = 205, lw = 38;
  const pct = clamp(P.value / 100), e = E.outCubic(ph.fill), frac = pct * e, sweep = frac * Math.PI * 2;
  const iA = E.outCubic(seg(ph.t, 0, .7));
  const sc = lerp(.88, 1, E.outBack(ph.intro, 1.2)) * (1 + .025 * Math.sin(Math.PI * ph.done));

  if (ph.done > 0 && ph.done < 1) {
    ctx.save(); ctx.strokeStyle = rgba(A, (1 - ph.done) * .5); ctx.lineWidth = 4;
    ctx.beginPath(); safeArc(ctx, cx, cy, lerp(R + 30, R + 130, E.outCubic(ph.done)), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  ctx.save(); ctx.globalAlpha *= iA; ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-cx, -cy);

  // tick marks – light up as the arc passes
  const ticks = 72;
  for (let i = 0; i < ticks; i++) {
    const f = i / ticks, a = -Math.PI / 2 + f * Math.PI * 2, long = i % 6 === 0;
    const r1 = R + lw / 2 + 18, r2 = r1 + (long ? 26 : 14), lit = f <= frac && frac > 0;
    ctx.strokeStyle = lit ? rgba(A, long ? 1 : .8) : rgba(P.text, .16); ctx.lineWidth = long ? 4 : 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); ctx.stroke();
  }
  // track
  ctx.beginPath(); safeArc(ctx, cx, cy, R, 0, Math.PI * 2); ctx.strokeStyle = rgba(P.text, .1); ctx.lineWidth = lw; ctx.stroke();
  // arc
  if (sweep > .003) {
    ctx.save();
    let stroke = A;
    if (ctx.createConicGradient) {
      const g = ctx.createConicGradient(-Math.PI / 2, cx, cy);
      g.addColorStop(0, mix(A, 0, .38)); g.addColorStop(Math.max(frac, .002), mix(A, 255, .22)); g.addColorStop(1, mix(A, 255, .22));
      stroke = g;
    }
    glow(ctx, P, rgba(A, .65), 38);
    ctx.lineCap = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = stroke;
    ctx.beginPath(); safeArc(ctx, cx, cy, R, -Math.PI / 2, -Math.PI / 2 + sweep); ctx.stroke();
    ctx.restore();
    const ex = cx + Math.cos(-Math.PI / 2 + sweep) * R, ey = cy + Math.sin(-Math.PI / 2 + sweep) * R;
    ctx.save(); glow(ctx, P, rgba(A, .9), 22); ctx.beginPath(); safeArc(ctx, ex, ey, lw * .27, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
  }
  // center text
  ctx.save(); glow(ctx, P, rgba(A, .4), 34);
  numberRow(ctx, { prefix: P.prefix, suffix: P.suffix, x: cx, y: cy + 62, size: 168, color: P.text, accent: A, decimals: P.decimals, value: P.value * e, finalValue: P.value });
  ctx.restore();
  drawText(ctx, P.label.toUpperCase(), cx, cy + 118, 26, 800, rgba(P.text, .72), 'center', 'alphabetic', 5);
  ctx.restore();
}

/* =========================================================
   04  PROGRESS BAR
   ========================================================= */
function drawBar(ctx, P, ph) {
  const A = P.color, barX = 190, barW = 900, barY = 395, barH = 64;
  const frac = clamp(P.value / 100) * E.inOutCubic(ph.fill), val = P.value * E.inOutCubic(ph.fill);
  const iA = E.outCubic(seg(ph.t, 0, .7)), fillW = barW * frac, hx = barX + fillW;

  ctx.save(); ctx.globalAlpha *= iA; ctx.translate(0, (1 - iA) * 22);
  // label
  ctx.beginPath(); safeArc(ctx, barX + 22, barY - 175 - 10, 22, 0, Math.PI * 2); ctx.fillStyle = rgba(A, .18); ctx.fill(); ctx.strokeStyle = rgba(A, .75); ctx.lineWidth = 2; ctx.stroke();
  arrowUp(ctx, barX + 22, barY - 185, 9, A, 3.5);
  drawText(ctx, P.label.toUpperCase(), barX + 62, barY - 175, 30, 800, P.text, 'left', 'alphabetic', 5);

  // track
  rr(ctx, barX, barY, barW, barH, barH / 2); ctx.fillStyle = rgba(P.text, .1); ctx.fill();
  ctx.strokeStyle = rgba(P.text, .08); ctx.lineWidth = 2; ctx.stroke();

  // fill
  if (fillW > 1) {
    ctx.save(); glow(ctx, P, rgba(A, .6), 34);
    rr(ctx, barX, barY, fillW, barH, barH / 2);
    const g = ctx.createLinearGradient(barX, 0, barX + barW * clamp(P.value / 100), 0);
    g.addColorStop(0, mix(A, 0, .3)); g.addColorStop(.7, A); g.addColorStop(1, mix(A, 255, .25));
    ctx.fillStyle = g; ctx.fill(); ctx.restore();
    ctx.save(); rr(ctx, barX, barY, fillW, barH, barH / 2); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,.13)';                       // moving stripes
    const off = (ph.t * 70) % 60;
    for (let sx = barX - 80 + off; sx < hx + 40; sx += 60) { ctx.beginPath(); ctx.moveTo(sx, barY + barH); ctx.lineTo(sx + 30, barY + barH); ctx.lineTo(sx + 60, barY); ctx.lineTo(sx + 30, barY); ctx.closePath(); ctx.fill(); }
    const gl = ctx.createLinearGradient(0, barY, 0, barY + barH); gl.addColorStop(0, 'rgba(255,255,255,.28)'); gl.addColorStop(.5, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl; ctx.fillRect(barX, barY, fillW, barH);
    if (ph.done > 0 && ph.done < 1) {                               // landing sweep
      const sx = lerp(barX - 120, hx + 40, E.outCubic(ph.done)), sg = ctx.createLinearGradient(sx - 90, 0, sx + 90, 0);
      sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(.5, 'rgba(255,255,255,.6)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg; ctx.fillRect(sx - 90, barY, 180, barH);
    }
    ctx.restore();
  }

  // percent bubble riding the head
  const bw = 144, bh = 60, by = barY - 90, bcx = clamp(hx, barX + bw / 2, barX + barW - bw / 2);
  const px = clamp(hx, bcx - bw / 2 + 24, bcx + bw / 2 - 24), bc = onColor(A);
  ctx.save(); glow(ctx, P, rgba(A, .5), 26);
  rr(ctx, bcx - bw / 2, by, bw, bh, 18); ctx.fillStyle = A; ctx.fill();
  ctx.beginPath(); ctx.moveTo(px - 11, by + bh - 2); ctx.lineTo(px, by + bh + 13); ctx.lineTo(px + 11, by + bh - 2); ctx.closePath(); ctx.fill();
  ctx.restore();
  numberRow(ctx, { prefix: P.prefix, suffix: P.suffix, x: bcx, y: by + bh * .72, size: 36, color: bc, accent: bc, sub: .7, decimals: P.decimals, value: val, finalValue: P.value });

  // ticks
  for (let i = 0; i <= 4; i++) {
    const tx = barX + barW * i / 4;
    ctx.fillStyle = rgba(P.text, .28); ctx.fillRect(tx - 1, barY + barH + 14, 2, 9);
    drawText(ctx, String(i * 25), tx, barY + barH + 52, 22, 600, rgba(P.text, .5), 'center');
  }
  ctx.restore();
}

/* =========================================================
   05  GROWTH BARS
   ========================================================= */
const BAR_FACTORS = [.28, .4, .36, .55, .62, .8, 1];
function drawBars(ctx, P, ph) {
  const A = P.color, left = 170, right = 1110, base = 630, chartH = 320, n = BAR_FACTORS.length;
  const bw = 84, gap = (right - left - n * bw) / (n - 1);
  const e = E.outCubic(ph.fill), val = P.value * e, pct = clamp(P.value / 100);
  chartHeader(ctx, P, ph, val);

  const ga = E.outCubic(seg(ph.t, .1, .8));
  ctx.save(); ctx.globalAlpha *= ga;
  for (let i = 0; i <= 4; i++) {
    const y = base - chartH * i / 4;
    ctx.strokeStyle = rgba(P.text, i === 0 ? .35 : .12); ctx.lineWidth = 2; ctx.setLineDash(i === 0 ? [] : [8, 10]);
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke(); ctx.setLineDash([]);
    drawText(ctx, i * 25 + '%', left - 18, y + 7, 20, 600, rgba(P.text, .45), 'right');
  }
  ctx.restore();

  for (let i = 0; i < n; i++) {
    const last = i === n - 1;
    const g = E.outBack(seg(ph.fill, i * .075, i * .075 + .55), 1.1);
    const full = Math.max(10, BAR_FACTORS[i] * pct * chartH), h = Math.max(0, full * g);
    if (h < 1) continue;
    const x = left + i * (bw + gap), y = base - h;
    ctx.save();
    const grad = ctx.createLinearGradient(0, base - full, 0, base);
    if (last) { grad.addColorStop(0, mix(A, 255, .3)); grad.addColorStop(1, mix(A, 0, .2)); glow(ctx, P, rgba(A, .65), 38); }
    else { const a = .3 + .3 * i / (n - 1); grad.addColorStop(0, rgba(A, a + .1)); grad.addColorStop(1, rgba(A, a * .45)); }
    rrTop(ctx, x, y, bw, h, 16); ctx.fillStyle = grad; ctx.fill();
    ctx.restore();
    if (last && ph.fill > .6) {                                    // bobbing arrow above the winner
      const a = seg(ph.fill, .6, 1), bob = Math.sin(ph.t * 4) * 5;
      ctx.save(); ctx.globalAlpha *= a; glow(ctx, P, rgba(A, .7), 18);
      arrowUp(ctx, x + bw / 2, y - 38 + bob, 14, A, 6); ctx.restore();
    }
  }
}

/* =========================================================
   06  LINE CHART
   ========================================================= */
const SERIES = [.08, .16, .13, .27, .24, .41, .37, .55, .52, .74, .70, 1];
const CURVE = (() => {
  const pts = [], n = SERIES.length, steps = 18;
  for (let i = 0; i < n - 1; i++) {
    const p0 = SERIES[Math.max(0, i - 1)], p1 = SERIES[i], p2 = SERIES[i + 1], p3 = SERIES[Math.min(n - 1, i + 2)];
    for (let k = 0; k < steps; k++) {
      const t = k / steps, t2 = t * t, t3 = t2 * t;
      pts.push({ x: (i + t) / (n - 1), s: .5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3) });
    }
  }
  pts.push({ x: 1, s: SERIES[n - 1] }); return pts;
})();
function drawLine(ctx, P, ph) {
  const A = P.color, left = 170, right = 1110, base = 630, chartH = 320, pct = clamp(P.value / 100);
  const pos = E.inOutCubic(ph.fill) * (CURVE.length - 1), i0 = Math.min(CURVE.length - 2, Math.floor(pos)), fr = pos - i0;
  const pt = j => ({ x: left + CURVE[j].x * (right - left), y: base - CURVE[j].s * pct * chartH, v: CURVE[j].s * P.value });
  const a = pt(i0), b = pt(i0 + 1);
  const tip = { x: lerp(a.x, b.x, fr), y: lerp(a.y, b.y, fr), v: lerp(a.v, b.v, fr) };
  chartHeader(ctx, P, ph, ph.fill >= 1 ? P.value : tip.v);

  const ga = E.outCubic(seg(ph.t, .1, .8));
  ctx.save(); ctx.globalAlpha *= ga;
  for (let i = 0; i <= 4; i++) {
    const y = base - chartH * i / 4;
    ctx.strokeStyle = rgba(P.text, i === 0 ? .35 : .12); ctx.lineWidth = 2; ctx.setLineDash(i === 0 ? [] : [8, 10]);
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke(); ctx.setLineDash([]);
    drawText(ctx, i * 25 + '%', left - 18, y + 7, 20, 600, rgba(P.text, .45), 'right');
  }
  ctx.restore();
  if (ph.fill <= 0) return;

  // area
  ctx.beginPath(); ctx.moveTo(pt(0).x, base);
  for (let j = 0; j <= i0; j++) { const p = pt(j); ctx.lineTo(p.x, p.y); }
  ctx.lineTo(tip.x, tip.y); ctx.lineTo(tip.x, base); ctx.closePath();
  const ag = ctx.createLinearGradient(0, base - chartH, 0, base); ag.addColorStop(0, rgba(A, .42)); ag.addColorStop(1, rgba(A, 0));
  ctx.fillStyle = ag; ctx.fill();

  // guide to the baseline
  ctx.save(); ctx.strokeStyle = rgba(A, .4); ctx.lineWidth = 2; ctx.setLineDash([6, 8]);
  ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(tip.x, base); ctx.stroke(); ctx.restore();

  // line
  ctx.save(); glow(ctx, P, rgba(A, .75), 30);
  ctx.beginPath(); ctx.moveTo(pt(0).x, pt(0).y);
  for (let j = 1; j <= i0; j++) { const p = pt(j); ctx.lineTo(p.x, p.y); }
  ctx.lineTo(tip.x, tip.y);
  ctx.strokeStyle = A; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore();

  // data points already passed
  for (let k = 0; k < SERIES.length; k++) {
    const idx = k * 18; if (idx > pos) break;
    const p = pt(Math.min(idx, CURVE.length - 1)); if (k === SERIES.length - 1) break;
    ctx.beginPath(); safeArc(ctx, p.x, p.y, 7, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = A; ctx.lineWidth = 3; ctx.stroke();
  }
  // pulsing tip
  const pulse = (ph.t * 1.1) % 1;
  ctx.save(); ctx.strokeStyle = rgba(A, (1 - pulse) * .6); ctx.lineWidth = 4;
  ctx.beginPath(); safeArc(ctx, tip.x, tip.y, 16 + 30 * pulse, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  ctx.save(); glow(ctx, P, rgba(A, .9), 24);
  ctx.beginPath(); safeArc(ctx, tip.x, tip.y, 16, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = A; ctx.lineWidth = 7; ctx.stroke(); ctx.restore();
}

/* =========================================================
   Library definition
   ========================================================= */
const base = { speed: 1, hold: 1.5, glow: true, text: '#ffffff', suffix: '%', prefix: '' };
const GRAPHICS = [
  { id: 'count-up', name: 'Count Up', blurb: 'A big number that counts up, pops when it lands, and sends out a pulse ring.',
    defaults: { ...base, color: '#FFC233', value: 12500, label: 'Subscribers gained', prefix: '+', suffix: '' },
    value: { label: 'Number', min: 0, max: 100000, step: 50, boxMin: 0, boxMax: 999999999, boxStep: 1 }, draw: drawCounter },
  { id: 'odometer', name: 'Odometer Roll', blurb: 'Digit reels spin like a mechanical counter and settle one after another.',
    defaults: { ...base, color: '#3DA9FF', value: 128430, label: 'Total views', suffix: '' },
    value: { label: 'Number', min: 0, max: 1000000, step: 10, boxMin: 0, boxMax: 99999999, boxStep: 1 }, draw: drawOdometer },
  { id: 'ring', name: 'Ring Progress', blurb: 'A glowing ring fills to your percentage with live ticks and a center readout.',
    defaults: { ...base, color: '#B26BFF', value: 82, label: 'Goal reached' },
    value: { label: 'Percentage', min: 0, max: 100, step: 1, boxMin: 0, boxMax: 100, boxStep: 1 }, draw: drawRing },
  { id: 'progress-bar', name: 'Progress Bar', blurb: 'A striped bar fills up while a percent bubble rides the leading edge.',
    defaults: { ...base, color: '#FF5C7A', value: 68, label: 'Funding reached' },
    value: { label: 'Percentage', min: 0, max: 100, step: 1, boxMin: 0, boxMax: 100, boxStep: 1 }, draw: drawBar },
  { id: 'growth-bars', name: 'Growth Bars', blurb: 'Seven bars rise in sequence and the last one lands on your gain.',
    defaults: { ...base, color: '#2DE2E6', value: 74, label: 'Revenue growth', prefix: '+' },
    value: { label: 'Percentage', min: 0, max: 100, step: 1, boxMin: 0, boxMax: 100, boxStep: 1 }, draw: drawBars },
  { id: 'line-rise', name: 'Line Rise', blurb: 'A line chart draws itself upward and the big number follows the tip.',
    defaults: { ...base, color: '#FF8A3D', value: 86, label: 'Audience growth', prefix: '+' },
    value: { label: 'Percentage', min: 0, max: 100, step: 1, boxMin: 0, boxMax: 100, boxStep: 1 }, draw: drawLine }
];

/* =========================================================
   Exporting
   ========================================================= */
/* exporting lives in export.js (frame-exact rendering) */

/* =========================================================
   UI
   ========================================================= */
const AR_FONT = '"Segoe UI","Tahoma",system-ui,sans-serif';
const IS_AR = s => /[؀-ۿ]/.test(s || '');

/* ---------- logo layers (white masks with alpha, tinted on demand) ---------- */
const LOGO = {};

const tintCache = new Map();
function tintLevels(key, color) {                 // tinted mip chain so small sizes stay crisp
  const id = key + color; let lv = tintCache.get(id);
  if (lv) return lv;
  const im = LOGO[key]; if (!im) return null;
  let c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const x = c.getContext('2d'); x.drawImage(im, 0, 0);
  x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  lv = [c];
  while (c.width > 120) {
    const n = document.createElement('canvas'); n.width = Math.round(c.width / 2); n.height = Math.round(c.height / 2);
    const nx = n.getContext('2d'); nx.imageSmoothingQuality = 'high'; nx.drawImage(c, 0, 0, n.width, n.height);
    lv.push(n); c = n;
  }
  tintCache.set(id, lv); return lv;
}
function drawLogo(ctx, key, color, cx, cy, w, alpha = 1, rot = 0) {
  const lv = tintLevels(key, color); if (!lv || w <= .5 || alpha <= .003) return;
  const px = w * gScale; let src = lv[0];
  for (const l of lv) if (l.width >= px) src = l;
  const h = w * src.height / src.width;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(cx, cy); if (rot) ctx.rotate(rot);
  ctx.imageSmoothingQuality = 'high'; ctx.drawImage(src, -w / 2, -h / 2, w, h); ctx.restore();
}

/* ---------- small helpers ---------- */
const sm = t => t * t * (3 - 2 * t);
const S = (b, a, c) => clamp((b - a) / (c - a));            // sub-phase of the build (0..1)
const frac = x => x - Math.floor(x);
const rnd = i => frac(Math.sin(i * 127.1 + 311.7) * 43758.5453);
const EZ = {
  out: E.outCubic, outQ: E.outQuart, inOut: E.inOutCubic,
  outX: t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t),
  back: (t, m, cap = 1) => m < .03 ? E.outCubic(t) : E.outBack(t, (.35 + 2.1 * m) * cap)    // overshoot grows with the motion level
};
function hx(r, g, b) { return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
const shade = (h, target, k) => { const [r, g, b] = hexToRgb(h); return hx(lerp(r, target, k), lerp(g, target, k), lerp(b, target, k)); };
function shadow(c, color, blur, oy = 0, ox = 0) { c.shadowColor = color; c.shadowBlur = blur * gScale; c.shadowOffsetY = oy * gScale; c.shadowOffsetX = ox * gScale; }
function noShadow(c) { c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetX = c.shadowOffsetY = 0; }
function metalV(c, y0, y1, base) {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, shade(base, 255, .5)); g.addColorStop(.2, shade(base, 255, .2)); g.addColorStop(.5, base);
  g.addColorStop(.82, shade(base, 0, .2)); g.addColorStop(1, shade(base, 0, .4)); return g;
}
function sparkle(c, x, y, r, color, alpha) {
  if (r <= .3 || alpha <= .01) return;
  c.save(); c.globalAlpha *= alpha; c.translate(x, y); c.fillStyle = color; c.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, q = i % 2 ? r * .2 : r; c.lineTo(Math.cos(a) * q, Math.sin(a) * q); }
  c.closePath(); c.fill(); c.restore();
}

/* ---------- text ---------- */
function txt(c, str, x, y, size, weight, color, align = 'left') {
  c.font = `${weight} ${size}px ${AR_FONT}`; c.fillStyle = color; c.textAlign = align; c.textBaseline = 'alphabetic';
  c.direction = IS_AR(str) ? 'rtl' : 'ltr'; c.fillText(str, x, y);
}
function textW(c, str, size, weight) { c.font = `${weight} ${size}px ${AR_FONT}`; c.direction = IS_AR(str) ? 'rtl' : 'ltr'; return c.measureText(str).width; }
function fitSize(c, str, size, weight, maxW, minK = .55) { const w = textW(c, str, size, weight); return w > maxW ? Math.max(size * minK, size * maxW / w) : size; }

let scratch = null;
function scratchCtx(w, h) {
  if (!scratch) scratch = document.createElement('canvas');
  if (scratch.width !== w || scratch.height !== h) { scratch.width = w; scratch.height = h; }
  const x = scratch.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, w, h);
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; noShadow(x); return x;
}
/* Soft wipe reveal of anything drawn by drawFn inside `box`. p: 0..1. rtl wipes from the right. */
function revealBox(ctx, box, p, rtl, drawFn, soft = 70) {
  if (p <= 0) return;
  if (p >= 1) { drawFn(ctx); return; }
  const s = gScale, w = Math.max(1, Math.ceil(box.w * s)), h = Math.max(1, Math.ceil(box.h * s)), sp = soft * s;
  const x = scratchCtx(w, h); x.setTransform(s, 0, 0, s, -box.x * s, -box.y * s); drawFn(x);
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'destination-in';
  const f = p * (w + sp);
  const g = rtl ? x.createLinearGradient(w - (f - sp), 0, w - f, 0) : x.createLinearGradient(f - sp, 0, f, 0);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  ctx.drawImage(scratch, 0, 0, w, h, box.x, box.y, box.w, box.h);
}

/* ---------- timeline ---------- */
function rtotal(P) { return Math.max(.2, P.tIn) + Math.max(0, P.tHold) + Math.max(.2, P.tOut); }
function rstate(P, t) {
  const tin = Math.max(.2, P.tIn), th = Math.max(0, P.tHold), tout = Math.max(.2, P.tOut);
  let b, m, dir;
  if (t < tin) { b = t / tin; m = P.mIn / 100; dir = 'in'; }
  else if (t < tin + th) { b = 1; m = P.mIn / 100; dir = 'hold'; }
  else { b = 1 - clamp((t - tin - th) / tout); m = P.mOut / 100; dir = 'out'; }
  return { b, m, dir, id: P.mIdle / 100 * sm(S(b, .88, 1)) };
}

/* =========================================================
   01  GOLD MEDALLION RIBBON   (recreated from video 1)
   gold ball pops -> flips into the logo medallion -> ribbon unrolls -> subtitle band slides out
   ========================================================= */
function bandPoly(c, L, R, top, h, slant) { c.beginPath(); c.moveTo(L, top); c.lineTo(R + slant, top); c.lineTo(R, top + h); c.lineTo(L, top + h); c.closePath(); }

function medallion(c, cx, cy, r, theta, main, acc, glint, pulse) {
  const sx = Math.cos(theta), a = Math.abs(sx);
  c.save(); c.translate(cx, cy); c.scale(Math.max(a, .03), 1);
  shadow(c, 'rgba(0,0,0,.38)', 18, 9);
  if (sx >= 0) {                                              // the gold ball
    const g = c.createRadialGradient(-r * .32, -r * .38, r * .08, 0, 0, r);
    g.addColorStop(0, shade(main, 255, .85)); g.addColorStop(.3, shade(main, 255, .3)); g.addColorStop(.7, main); g.addColorStop(1, shade(main, 0, .6));
    c.fillStyle = g; c.beginPath(); safeArc(c, 0, 0, r, 0, 7); c.fill();
  } else {                                                    // the logo face
    const rg = c.createLinearGradient(-r, -r, r, r);
    rg.addColorStop(0, shade(main, 255, .55)); rg.addColorStop(.35, main); rg.addColorStop(.7, shade(main, 0, .3)); rg.addColorStop(1, shade(main, 255, .25));
    c.fillStyle = rg; c.beginPath(); safeArc(c, 0, 0, r, 0, 7); c.fill();
    noShadow(c);
    const fg = c.createRadialGradient(-r * .2, -r * .25, r * .1, 0, 0, r);
    fg.addColorStop(0, '#FFFFFF'); fg.addColorStop(.8, '#F4F1E9'); fg.addColorStop(1, '#DAD5C6');
    c.fillStyle = fg; c.beginPath(); safeArc(c, 0, 0, r - 7, 0, 7); c.fill();
    drawLogo(c, 'emblem', acc, 0, 0, (r - 11) * 1.92 * (1 + pulse), 1);
    c.strokeStyle = 'rgba(80,60,20,.28)'; c.lineWidth = 2; c.beginPath(); safeArc(c, 0, 0, r - 7, 0, 7); c.stroke();
    if (glint > 0) {                                          // rotating glint on the rim
      c.strokeStyle = `rgba(255,255,255,${.7 * glint})`; c.lineWidth = 3.4; c.lineCap = 'round';
      c.beginPath(); safeArc(c, 0, 0, r - 3.5, -2.4, -1.7); c.stroke();
    }
  }
  c.restore();
}

function drawGold(ctx, P, t) {
  const s = rstate(P, t); if (s.b < .0006) return;
  const { b, m, id } = s, main = P.main, acc = P.accent;
  const O = { x: 225, y: 556 }, R = 80;
  const bandL = O.x, bandR = 1040, bandH = 58, bandY = O.y - 46, subY = bandY + bandH, subH = 44, subL = O.x + 142, subR = 935;
  ctx.save(); ctx.translate(0, Math.sin(t * 1.3) * 2.4 * id);

  const popBall = EZ.back(S(b, 0, .16), m);
  const rad = popBall * lerp(24, R, EZ.inOut(S(b, .14, .46)));
  const theta = Math.PI * (m > .8 ? 3 : 1) * EZ.inOut(S(b, .16, .50));
  const ribP = EZ.outQ(S(b, .42, .80)), thick = lerp(.06, 1, EZ.out(S(b, .44, .62)));
  const foldP = EZ.back(S(b, .58, .78), m * .8), subP = EZ.out(S(b, .68, .92));
  const titleP = S(b, .74, .96), subtP = S(b, .84, 1);

  /* ribbon */
  if (ribP > .002) {
    const rx = bandL + (bandR - bandL) * ribP, cy = bandY + bandH / 2, hh = bandH * thick, top = cy - hh / 2, slant = 18 * thick;
    ctx.save();
    // fold tail behind the medallion
    if (foldP > .01) {
      const fy = bandY + bandH - 2, fh = 58 * foldP;
      ctx.save(); shadow(ctx, 'rgba(0,0,0,.3)', 10, 4);
      const fg = ctx.createLinearGradient(0, fy, 0, fy + fh); fg.addColorStop(0, shade(main, 255, .55)); fg.addColorStop(1, shade(main, 0, .05));
      ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(O.x + 40, fy); ctx.lineTo(O.x + 168, fy); ctx.lineTo(O.x + 126, fy + fh); ctx.lineTo(O.x + 4, fy + fh); ctx.closePath(); ctx.fill();
      noShadow(ctx);
      ctx.fillStyle = shade(main, 0, .5); ctx.beginPath(); ctx.moveTo(O.x + 168, fy); ctx.lineTo(O.x + 126, fy + fh); ctx.lineTo(O.x + 168, fy + fh * .46); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,240,200,.75)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(O.x + 168, fy); ctx.lineTo(O.x + 126, fy + fh); ctx.stroke();
      const ds = ctx.createLinearGradient(0, fy, 0, fy + 18); ds.addColorStop(0, 'rgba(60,35,0,.5)'); ds.addColorStop(1, 'rgba(60,35,0,0)'); ctx.fillStyle = ds; ctx.fillRect(O.x + 40, fy, 128, 18);
      ctx.restore();
    }
    shadow(ctx, 'rgba(0,0,0,.35)', 20, 9);
    bandPoly(ctx, bandL, rx, top, hh, slant);
    ctx.fillStyle = metalV(ctx, bandY, bandY + bandH, main); ctx.fill();
    noShadow(ctx);
    ctx.save(); bandPoly(ctx, bandL, rx, top, hh, slant); ctx.clip();
    const sg = ctx.createLinearGradient(bandL, 0, bandR, 0);
    sg.addColorStop(0, 'rgba(0,0,0,.22)'); sg.addColorStop(.25, 'rgba(255,255,255,.05)'); sg.addColorStop(.6, 'rgba(255,255,255,.14)'); sg.addColorStop(1, 'rgba(0,0,0,.12)');
    ctx.fillStyle = sg; ctx.fillRect(bandL, top, rx - bandL + 40, hh);
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(bandL, top, rx - bandL + 40, 1.6);
    ctx.fillStyle = 'rgba(70,45,5,.35)'; ctx.fillRect(bandL, top + hh - 1.8, rx - bandL + 40, 1.8);
    // idle sheen
    if (id > .01) {
      const u = clamp((t % 3.2) / 1.4), sx2 = lerp(bandL - 160, bandR + 80, EZ.inOut(u));
      const hg = ctx.createLinearGradient(sx2 - 70, 0, sx2 + 70, 0); hg.addColorStop(0, 'rgba(255,255,255,0)'); hg.addColorStop(.5, `rgba(255,255,255,${.85 * id})`); hg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save(); ctx.translate(sx2, top + hh / 2); ctx.transform(1, 0, -.35, 1, 0, 0); ctx.translate(-sx2, -(top + hh / 2));
      ctx.fillStyle = hg; ctx.fillRect(sx2 - 70, top - 4, 140, hh + 8); ctx.restore();
    }
    ctx.restore();

    /* subtitle band slides out from under the ribbon */
    if (subP > .002) {
      ctx.save(); ctx.beginPath(); ctx.rect(subL - 30, subY - 1, subR - subL + 80, subH + 30); ctx.clip();
      ctx.translate(0, -(1 - subP) * (subH + 4));
      const sr = subL + (subR - subL) * subP;
      shadow(ctx, 'rgba(0,0,0,.25)', 12, 5);
      bandPoly(ctx, subL, sr, subY, subH, 12);
      const pg = ctx.createLinearGradient(0, subY, 0, subY + subH); pg.addColorStop(0, '#FBF8F0'); pg.addColorStop(1, '#E4D9BD');
      ctx.fillStyle = pg; ctx.globalAlpha *= .97; ctx.fill(); ctx.globalAlpha /= .97; noShadow(ctx);
      ctx.fillStyle = shade(main, 0, .1); ctx.fillRect(subL, subY + subH - 2.5, sr - subL, 2.5);
      ctx.restore();
    }
    ctx.restore();
  }

  /* texts */
  const rtl = IS_AR(P.title);
  const tR = bandR - 40, tL = O.x + R + 28, tSize = fitSize(ctx, P.title, 32, 800, tR - tL);
  revealBox(ctx, { x: tL - 20, y: bandY - 8, w: tR - tL + 60, h: bandH + 16 }, titleP, rtl, c => {
    c.save(); c.translate((rtl ? 1 : -1) * 26 * (1 - EZ.out(titleP)), 0);
    shadow(c, 'rgba(70,42,0,.7)', 4, 2);
    txt(c, P.title, rtl ? tR : tL, bandY + bandH / 2 + tSize * .34, tSize, 800, '#FFF9E8', rtl ? 'right' : 'left'); c.restore();
  });
  const sR = subR - 30, sL = subL + 20, sSize = fitSize(ctx, P.subtitle, 26, 600, sR - sL);
  revealBox(ctx, { x: sL - 20, y: subY, w: sR - sL + 60, h: subH }, subtP, IS_AR(P.subtitle), c => {
    c.save(); c.translate((IS_AR(P.subtitle) ? 1 : -1) * 20 * (1 - EZ.out(subtP)), 0);
    txt(c, P.subtitle, IS_AR(P.subtitle) ? sR : sL, subY + subH / 2 + sSize * .33, sSize, 600, shade(main, 0, .5), IS_AR(P.subtitle) ? 'right' : 'left'); c.restore();
  });

  /* shock ring + sparks when the ball lands as a medallion */
  const bs = S(b, .44, .72);
  if (bs > 0 && bs < 1 && s.dir === 'in') {
    ctx.save(); ctx.strokeStyle = shade(main, 255, .5); ctx.globalAlpha *= (1 - bs) * (.35 + .5 * m); ctx.lineWidth = 4 * (1 - bs) + 1;
    ctx.beginPath(); safeArc(ctx, O.x, O.y, Math.max(rad, R * .6) * (1 + 1.1 * EZ.out(bs)), 0, 7); ctx.stroke(); ctx.restore();
    const n = 14;
    for (let i = 0; i < n; i++) {
      const ang = i / n * Math.PI * 2 + rnd(i) * .5, dist = R * (.9 + EZ.out(bs) * (1 + 1.4 * m) * (.7 + .6 * rnd(i + 9)));
      sparkle(ctx, O.x + Math.cos(ang) * dist, O.y + Math.sin(ang) * dist, (3 + 5 * rnd(i + 3)) * (1 - bs) * (.6 + m), shade(main, 255, .6), 1 - bs);
    }
  }
  /* medallion on top */
  if (rad > .8) {
    const glint = id; medallion(ctx, O.x, O.y, rad, theta, main, acc, 0, .012 * Math.sin(t * 2) * id);
    if (id > .02 && rad > R * .9) {                          // specular sweep across the face
      const u = clamp(((t + .8) % 3.4) / 1.1), sx2 = lerp(O.x - rad * 1.5, O.x + rad * 1.5, EZ.inOut(u));
      ctx.save(); ctx.beginPath(); safeArc(ctx, O.x, O.y, rad - 8, 0, 7); ctx.clip();
      ctx.translate(sx2, O.y); ctx.transform(1, 0, -.4, 1, 0, 0); ctx.translate(-sx2, -O.y);
      const sg2 = ctx.createLinearGradient(sx2 - 46, 0, sx2 + 46, 0); sg2.addColorStop(0, 'rgba(255,255,255,0)'); sg2.addColorStop(.5, 'rgba(255,255,255,' + (.92 * id) + ')'); sg2.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg2; ctx.fillRect(sx2 - 46, O.y - rad, 92, rad * 2); ctx.restore();
    }
    if (glint > .01) {                                       // rim glint orbit (drawn in screen space)
      const ga = t * 1.3; ctx.save(); ctx.strokeStyle = `rgba(255,255,255,${.75 * id})`; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
      ctx.beginPath(); safeArc(ctx, O.x, O.y, rad - 3.5, ga, ga + .6); ctx.stroke(); ctx.restore();
    }
  }
  /* idle twinkles */
  if (id > .02) {
    const spots = [[O.x + R * .72, O.y - R * .8, 0], [bandR - 70, bandY + 12, 1.7], [O.x + R * 1.9, O.y + 62, 3.1], [subR - 40, subY + subH + 8, 4.4]];
    spots.forEach(([x, y, ph]) => { const k = Math.pow(Math.max(0, Math.sin(t * 2.1 + ph)), 4); sparkle(ctx, x, y, 13 * k, '#FFF3C4', id * k); });
  }
  ctx.restore();
}

/* =========================================================
   02  TEAL TILE -> BAR   (recreated from video 2)
   dot -> diamond tile -> upright tile with emblem -> thin line -> long bar, logo plate rises above
   ========================================================= */
function drawTeal(ctx, P, t) {
  const s = rstate(P, t); if (s.b < .0006) return;
  const { b, m, id } = s, main = P.main, acc = P.accent;
  const x0 = 150, barH = 114, barY = 524, barR = 1040, plateW = 340, plateH = 66;
  const O = { x: x0 + barH / 2, y: barY + barH / 2 };

  const dot = EZ.back(S(b, 0, .15), m);
  const rotP = EZ.back(S(b, .18, .40), m * .9);
  const size = lerp(3, 84, dot) + (barH - 84) * EZ.inOut(S(b, .14, .40));
  const spin = (Math.PI / 4 + (m > .5 ? Math.PI / 2 : 0)) * (1 - rotP);
  const emA = S(b, .10, .24) * (1 - S(b, .44, .54)), emPop = EZ.back(S(b, .10, .26), m);
  const pM = EZ.inOut(S(b, .46, .60));
  const wB = m < .03 ? EZ.out(S(b, .56, .84)) : E.outBack(S(b, .56, .84), .25 + .9 * m);
  const tileW = lerp(size, 8, pM), barW = lerp(8, barR - x0, wB);
  const w = Math.max(tileW, barW * (b > .5 ? 1 : 0));
  const left = O.x - size / 2;                                        // left edge is x0 once the tile is full size
  const cx = left + w / 2;
  const plH = EZ.back(S(b, .44, .64), m * .6), plW = EZ.outQ(S(b, .52, .82)), txP = S(b, .74, .94), sbP = S(b, .82, 1), wmP = S(b, .80, .98);
  ctx.save();

  /* logo plate: rises out of the line, then widens */
  if (plH > .01) {
    const hh = plateH * Math.min(1.08, plH), ww = Math.max(10, plateW * plW), fl = Math.sin(t * 1.2) * 1.6 * id;
    ctx.save(); ctx.translate(0, fl);
    shadow(ctx, 'rgba(0,0,0,.28)', 18, 6);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x0, barY - hh, ww, hh + 4); noShadow(ctx);
    ctx.save(); ctx.beginPath(); ctx.rect(x0, barY - plateH - 4, ww, plateH + 4); ctx.clip();
    drawLogo(ctx, 'wordmark', acc, x0 + plateW / 2 + (1 - EZ.out(wmP)) * 24, barY - plateH / 2 - 2, 182, EZ.out(wmP));
    if (id > .02) {                                                   // glint across the plate
      const u = clamp(((t + 1.3) % 4.4) / 1.3), gx = lerp(x0 - 80, x0 + plateW + 80, EZ.inOut(u));
      const gg = ctx.createLinearGradient(gx - 40, 0, gx + 40, 0); gg.addColorStop(0, 'rgba(255,255,255,0)'); gg.addColorStop(.5, 'rgba(255,255,255,' + (.8 * id) + ')'); gg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = gg; ctx.fillRect(gx - 40, barY - plateH, 80, plateH);
    }
    ctx.restore(); ctx.restore();
  }

  /* dot -> tile -> line -> bar */
  if (size > 1.5) {
    ctx.save(); ctx.translate(cx, O.y);
    const rot = w === tileW && pM < 1 ? spin : 0; if (rot) ctx.rotate(rot);
    shadow(ctx, 'rgba(0,0,0,.28)', 22, 10);
    const gx = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    gx.addColorStop(0, shade(main, 0, .12)); gx.addColorStop(.55, main); gx.addColorStop(1, shade(main, 255, .1));
    ctx.fillStyle = gx; ctx.fillRect(-w / 2, -size / 2, w, size); noShadow(ctx);
    ctx.save(); ctx.beginPath(); ctx.rect(-w / 2, -size / 2, w, size); ctx.clip();
    const tg = ctx.createLinearGradient(0, -size / 2, 0, size / 2); tg.addColorStop(0, 'rgba(255,255,255,.2)'); tg.addColorStop(.45, 'rgba(255,255,255,0)'); tg.addColorStop(1, 'rgba(0,0,0,.14)');
    ctx.fillStyle = tg; ctx.fillRect(-w / 2, -size / 2, w, size); ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(-w / 2, -size / 2, w, 1.6);
    // lighter translucent end cap
    const capA = S(b, .70, .86) * Math.min(1, (w - 8) / 100);
    if (capA > .01) { ctx.fillStyle = 'rgba(255,255,255,' + (.16 * capA) + ')'; ctx.fillRect(w / 2 - 64, -size / 2, 64, size); }
    const wk = S(b, .72, .92) * Math.min(1, (w - 8) / 300);
    if (wk > .01) drawLogo(ctx, 'emblem', '#FFFFFF', -w / 2 + 125, 0, 96 * (1 + .05 * Math.sin(t * 1.4) * id), .17 * wk, .6 * Math.sin(t * .5) * id);
    // idle sheen + progress line
    if (id > .02 && w > 200) {
      const u = clamp((t % 3.6) / 1.4), sx = lerp(-w / 2 - 120, w / 2 + 60, EZ.inOut(u));
      const hg = ctx.createLinearGradient(sx - 70, 0, sx + 70, 0); hg.addColorStop(0, 'rgba(255,255,255,0)'); hg.addColorStop(.5, `rgba(255,255,255,${.5 * id})`); hg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save(); ctx.transform(1, 0, -.4, 1, 0, 0); ctx.fillStyle = hg; ctx.fillRect(sx - 70, -size / 2, 140, size); ctx.restore();
    }
    ctx.restore();
    // emblem
    if (emA > .01) drawLogo(ctx, 'emblem', '#FFFFFF', 0, 0, (w > size - 1 ? size : w) * .7 * emPop, emA);
    ctx.restore();
    // pulse ring when the tile lands
    const rs = S(b, .36, .56);
    if (rs > 0 && rs < 1 && s.dir === 'in') { ctx.save(); ctx.translate(O.x, O.y); ctx.strokeStyle = shade(main, 255, .6); ctx.globalAlpha *= (1 - rs) * (.4 + .5 * m); ctx.lineWidth = 3;
      const q = size / 2 + 8 + 46 * EZ.out(rs); ctx.strokeRect(-q, -q, q * 2, q * 2); ctx.restore(); }
  }

  /* text */
  const rtl = IS_AR(P.title), tR = barR - 46, tL = x0 + barH * .7;
  const t1 = fitSize(ctx, P.title, 32, 800, tR - tL), t2 = fitSize(ctx, P.subtitle, 28, 600, tR - tL);
  revealBox(ctx, { x: x0 + 20, y: barY + 8, w: barR - x0, h: 48 }, txP, rtl, c => {
    c.save(); c.translate((rtl ? 1 : -1) * 30 * (1 - EZ.out(txP)), 12 * (1 - EZ.out(txP))); txt(c, P.title, rtl ? tR : tL, barY + 42, t1, 800, '#FFFFFF', rtl ? 'right' : 'left'); c.restore();
  });
  const rtl2 = IS_AR(P.subtitle);
  revealBox(ctx, { x: x0 + 20, y: barY + 56, w: barR - x0, h: 52 }, sbP, rtl2, c => {
    c.save(); c.translate((rtl2 ? 1 : -1) * 30 * (1 - EZ.out(sbP)), 12 * (1 - EZ.out(sbP))); txt(c, P.subtitle, rtl2 ? tR : tL, barY + 90, t2, 600, 'rgba(255,255,255,.93)', rtl2 ? 'right' : 'left'); c.restore();
  });
  ctx.restore();
}

/* =========================================================
   03  ROSETTE BLOOM  (glass panel)
   a spark -> the logo blooms open petal by petal -> a light-line shoots out -> a glass panel opens along it
   ========================================================= */
function bloomLogo(ctx, key, color, cx, cy, size, ps, m, rot) {
  if (ps.every(p => p >= .999)) { drawLogo(ctx, key, color, cx, cy, size, 1, rot); return; }
  for (let i = 0; i < 8; i++) {
    const p = ps[i]; if (p <= .002) continue;
    const a = i * Math.PI / 4;
    ctx.save(); ctx.translate(cx, cy);
    const dist = (1 - p) * size * (.08 + .24 * m);
    ctx.translate(Math.sin(a) * dist, -Math.cos(a) * dist);
    ctx.rotate(-(1 - p) * (.05 + .3 * m)); const sc = lerp(.8, 1, Math.min(1, p)); ctx.scale(sc, sc);
    ctx.beginPath(); ctx.moveTo(0, 0); safeArc(ctx, 0, 0, size, -Math.PI / 2 + a - Math.PI / 8 - .004, -Math.PI / 2 + a + Math.PI / 8 + .004); ctx.closePath(); ctx.clip();
    ctx.rotate(rot); drawLogo(ctx, key, color, 0, 0, size, Math.min(1, p * 1.7)); ctx.restore();
  }
}
function drawGlass(ctx, P, t) {
  const s = rstate(P, t); if (s.b < .0006) return;
  const { b, m, id } = s, main = P.main, gold = P.accent, goldL = shade(gold, 255, .45);
  const O = { x: 215, y: 562 }, Rr = 68, pR = 1040, pH = 104, pw = pR - O.x;
  ctx.save(); ctx.translate(0, Math.sin(t * 1.2) * 2 * id);

  const dotP = EZ.back(S(b, 0, .10), m) * (1 - S(b, .26, .36));
  const bl = [...Array(8)].map((_, i) => EZ.back(S(b, .05 + i * .028, .27 + i * .028), m));
  const discP = EZ.out(S(b, .18, .34)), ringP = EZ.inOut(S(b, .24, .44));
  const lineP = EZ.outQ(S(b, .34, .64)), panelP = EZ.out(S(b, .46, .76)), borderP = EZ.inOut(S(b, .52, .86));

  /* ripples */
  for (let k = 0; k < 2; k++) {
    const rp = S(b, .22 + k * .06, .50 + k * .06);
    if (rp > 0 && rp < 1) { ctx.save(); ctx.strokeStyle = gold; ctx.globalAlpha *= (1 - rp) * (.25 + .5 * m); ctx.lineWidth = 2.5; ctx.beginPath(); safeArc(ctx, O.x, O.y, Rr + 6 + 80 * EZ.out(rp), 0, 7); ctx.stroke(); ctx.restore(); }
  }
  /* light line shooting right */
  if (lineP > .003 && panelP < 1) {
    const hx0 = O.x + Rr * .6, hx1 = hx0 + (pR - hx0) * lineP;
    ctx.save(); ctx.globalAlpha *= 1 - panelP * .9;
    const lg = ctx.createLinearGradient(hx0, 0, hx1, 0); lg.addColorStop(0, rgbaOf(goldL, .35)); lg.addColorStop(1, rgbaOf(goldL, 1));
    shadow(ctx, gold, 12); ctx.fillStyle = lg; ctx.fillRect(hx0, O.y - 1.2, hx1 - hx0, 2.4);
    ctx.beginPath(); ctx.fillStyle = '#FFFFFF'; safeArc(ctx, hx1, O.y, 4.6, 0, 7); ctx.fill(); ctx.restore();
  }
  /* glass panel */
  if (panelP > .004) {
    const h = pH * panelP, y = O.y - h / 2;
    ctx.save(); shadow(ctx, 'rgba(0,0,0,.4)', 28, 12);
    const pg = ctx.createLinearGradient(0, y, 0, y + h); pg.addColorStop(0, shade(main, 255, .26)); pg.addColorStop(1, shade(main, 255, .04));
    rr(ctx, O.x, y, pw, h, 20); ctx.globalAlpha *= .95; ctx.fillStyle = pg; ctx.fill(); ctx.globalAlpha /= .95; noShadow(ctx);
    ctx.save(); rr(ctx, O.x, y, pw, h, 20); ctx.clip();
    const hl = ctx.createLinearGradient(0, y, 0, y + h * .5); hl.addColorStop(0, 'rgba(255,255,255,.2)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl; ctx.fillRect(O.x, y, pw, h * .5); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(O.x, y, pw, 1.6);
    const ig = ctx.createLinearGradient(0, y + h, 0, y + h * .4); ig.addColorStop(0, rgbaOf(gold, .2)); ig.addColorStop(1, rgbaOf(gold, 0)); ctx.fillStyle = ig; ctx.fillRect(O.x, y + h * .4, pw, h * .6);
    drawLogo(ctx, 'emblem', '#FFFFFF', pR - 170, O.y, 280, .05 * panelP, .35 * Math.sin(t * .3) * id);
    // faint octagon lattice
    ctx.strokeStyle = 'rgba(255,255,255,.035)'; ctx.lineWidth = 1.2;
    for (let gx = O.x + 120; gx < pR + 60; gx += 64) { ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx + h, y + h); ctx.moveTo(gx + h, y); ctx.lineTo(gx, y + h); ctx.stroke(); }
    if (id > .02) {                                                  // sheen
      const u = clamp((t % 3.4) / 1.6), sx = lerp(O.x - 140, pR + 100, EZ.inOut(u));
      const sg = ctx.createLinearGradient(sx - 90, 0, sx + 90, 0); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(.5, `rgba(255,255,255,${.3 * id})`); sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save(); ctx.transform(1, 0, -.4, 1, 0, 0); ctx.translate(sx * .4, 0); ctx.fillStyle = sg; ctx.fillRect(sx - 90, y, 180, h); ctx.restore();
    }
    ctx.restore();
    // gold border drawing itself, then a comet circling it
    const per = 2 * (pw + h);
    rr(ctx, O.x, y, pw, h, 20); ctx.strokeStyle = rgbaOf(gold, .85); ctx.lineWidth = 2; ctx.setLineDash([per * borderP, per]); ctx.stroke();
    if (id > .02) { rr(ctx, O.x, y, pw, h, 20); ctx.strokeStyle = rgbaOf(goldL, .95 * id); ctx.lineWidth = 3.6; shadow(ctx, gold, 12); ctx.setLineDash([260, per - 260]); ctx.lineDashOffset = -((t * 260) % per); ctx.stroke(); }
    ctx.restore();
  }
  /* text: title word by word, subtitle fades in with a short divider */
  const rtl = IS_AR(P.title), tR = rtl ? pR - 44 : pR - 44 - 190, tL = rtl ? O.x + Rr + 40 + 190 : O.x + Rr + 40, aw = tR - tL;
  const words = (P.title || '').split(/\s+/).filter(Boolean), size = fitSize(ctx, P.title, 36, 800, aw);
  const spaceW = textW(ctx, ' ', size, 800) || size * .28, ws = words.map(w => textW(ctx, w, size, 800));
  const total = ws.reduce((a, b2) => a + b2, 0) + spaceW * Math.max(0, words.length - 1);
  let cur = rtl ? tR : tL; const baseY = O.y - 6;
  ctx.save(); ctx.beginPath(); ctx.rect(tL - 10, O.y - pH / 2 + 6, aw + 40, pH - 12); ctx.clip();
  words.forEach((w, i) => {
    const p = EZ.out(S(b, .62 + i * .045, .84 + i * .045)), x = rtl ? cur : cur;
    if (p > .003) { ctx.save(); ctx.globalAlpha *= p; txt(ctx, w, x, baseY + (1 - p) * 38, size, 800, '#FFFFFF', rtl ? 'right' : 'left'); ctx.restore(); }
    cur += (rtl ? -1 : 1) * (ws[i] + spaceW);
  });
  const sP = EZ.out(S(b, .80, .98)), sSize = fitSize(ctx, P.subtitle, 22, 600, aw - 70);
  if (sP > .003) {
    const dv = EZ.out(S(b, .76, .92)), sx = rtl ? tR : tL;
    ctx.globalAlpha *= 1; ctx.fillStyle = gold; ctx.fillRect(rtl ? sx - 34 * dv : sx, O.y + 18, 34 * dv, 2.5);
    ctx.save(); ctx.globalAlpha *= sP; txt(ctx, P.subtitle, rtl ? sx - 48 : sx + 48, O.y + 32 + (1 - sP) * 20, sSize, 600, goldL, rtl ? 'right' : 'left'); ctx.restore();
  }
  ctx.restore();
  const wmP2 = EZ.out(S(b, .84, 1));
  if (wmP2 > .01) {
    const blockW = Math.min(aw, Math.max(total, textW(ctx, P.subtitle, sSize, 600) + 48));
    const dvx = rtl ? tR - blockW - 30 : tR + 30, wmx = rtl ? Math.max(O.x + Rr + 40 + 78, dvx - 30 - 74) : dvx + 30 + 74;
    ctx.save(); shadow(ctx, 'rgba(0,0,0,.45)', 6, 2);
    drawLogo(ctx, 'wordmark', shade(gold, 255, .6), wmx - (1 - wmP2) * 20, O.y, 148, wmP2); ctx.restore();
    ctx.save(); ctx.globalAlpha *= wmP2 * .6; ctx.fillStyle = gold; ctx.fillRect(dvx, O.y - 28, 1.6, 56); ctx.restore();
  }
  /* soft light behind the disc */
  const gl = S(b, .16, .5);
  if (gl > .01) { const rg = ctx.createRadialGradient(O.x, O.y, Rr * .4, O.x, O.y, Rr * 2.6); rg.addColorStop(0, rgbaOf(gold, .28 * gl)); rg.addColorStop(1, rgbaOf(gold, 0)); ctx.fillStyle = rg; ctx.fillRect(O.x - Rr * 2.6, O.y - Rr * 2.6, Rr * 5.2, Rr * 5.2); }
  /* drifting gold dust (showcase) */
  if (id > .02) for (let i = 0; i < 12; i++) {
    const u = frac(t * (.1 + .05 * rnd(i)) + rnd(i + 5)), x = O.x + (rnd(i + 1) - .5) * 150 + Math.sin(t * .9 + i) * 8, y = O.y + 40 - u * 120;
    ctx.save(); ctx.globalAlpha *= Math.sin(Math.PI * u) * .9 * id; ctx.fillStyle = goldL; ctx.beginPath(); safeArc(ctx, x, y, 1.6 + 1.8 * rnd(i + 2), 0, 7); ctx.fill(); ctx.restore();
  }
  /* disc + ring + emblem */
  if (dotP > .01) { ctx.save(); shadow(ctx, gold, 22); ctx.fillStyle = goldL; ctx.beginPath(); safeArc(ctx, O.x, O.y, 7 * dotP, 0, 7); ctx.fill(); ctx.restore(); }
  if (discP > .01) {
    ctx.save(); shadow(ctx, 'rgba(0,0,0,.45)', 24, 10);
    const dg = ctx.createRadialGradient(O.x - 18, O.y - 22, 6, O.x, O.y, Rr); dg.addColorStop(0, shade(main, 255, .16)); dg.addColorStop(1, shade(main, 0, .3));
    ctx.fillStyle = dg; ctx.beginPath(); safeArc(ctx, O.x, O.y, Rr * discP, 0, 7); ctx.fill(); ctx.restore();
  }
  if (ringP > .003) { ctx.save(); ctx.strokeStyle = gold; ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.beginPath(); safeArc(ctx, O.x, O.y, Rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ringP); ctx.stroke(); ctx.restore(); }
  if (id > .02) {                                                  // orbiting dotted ring
    ctx.save(); ctx.translate(O.x, O.y); ctx.rotate(t * .5); ctx.fillStyle = goldL;
    for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2; ctx.globalAlpha = id * (.2 + .8 * frac(i / 36 + t * .25)); ctx.beginPath(); safeArc(ctx, Math.cos(a) * (Rr + 15), Math.sin(a) * (Rr + 15), 2.4, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  bloomLogo(ctx, 'emblem', goldL, O.x, O.y, Rr * 1.5, bl, m, .22 * id * Math.sin(t * .6));
  ctx.restore();
}
function rgbaOf(h, a) { return rgba(h, a); }

/* =========================================================
   04  GEOMETRIC SLATS  (ivory + gold)
   a medallion pops -> a gold line runs out -> slats flip open in a ripple that travels away from the point
   ========================================================= */
function drawSlats(ctx, P, t) {
  const s = rstate(P, t); if (s.b < .0006) return;
  const { b, m, id } = s, main = P.main, gold = P.accent, goldL = shade(gold, 255, .45), ink = onColor(main) === '#ffffff' ? '#FFFFFF' : '#14233A';
  const O = { x: 215, y: 562 }, Rm = 62, pL = O.x + 34, pR = 1040, pY = O.y - 52, pH = 104, sw = 22, n = Math.ceil((pR - pL) / sw);
  ctx.save(); ctx.translate(0, Math.sin(t * 1.25) * 2 * id);

  const medP = EZ.inOut(S(b, 0, .24)) * (1 + .1 * m * Math.sin(Math.PI * S(b, .2, .36))), em = EZ.out(S(b, .14, .32)), ringP = EZ.inOut(S(b, .2, .42));
  const lineP = EZ.outQ(S(b, .22, .50)), topP = EZ.out(S(b, .80, 1));
  const baseY = pY + pH;

  /* slats */
  const settled = b > .83;                              // every slat is open: draw one panel instead of 38 clipped slats
  if (settled) {
    ctx.save(); ctx.beginPath(); ctx.rect(pL, pY, pR - pL, pH); ctx.clip();
    const vg0 = ctx.createLinearGradient(0, pY, 0, pY + pH); vg0.addColorStop(0, shade(main, 255, .5)); vg0.addColorStop(.12, shade(main, 255, .2)); vg0.addColorStop(.55, main); vg0.addColorStop(1, shade(main, 0, .1));
    ctx.fillStyle = vg0; ctx.fillRect(pL, pY, pR - pL, pH);
    if (id > .02) for (let i = 0; i < n; i++) {
      const d = i / (n - 1), pos = frac(t / 4.8) * 1.7 - .35, wv = Math.exp(-Math.pow(d - pos, 2) / (2 * .05 * .05));
      if (wv > .02) { ctx.fillStyle = 'rgba(255,248,225,' + (.55 * wv * id) + ')'; ctx.fillRect(pL + i * sw, pY, sw + 1, pH); }
    }
    ctx.restore();
  }
  for (let i = 0; i < (settled ? 0 : n); i++) {
    const x = pL + i * sw, d = i / (n - 1), st = .30 + d * .26, p = EZ.back(S(b, st, st + .26), m * .35);
    if (p < .003) continue;
    const scx = Math.min(1.06, p), wd = (sw + 3) * scx, cxs = x + sw / 2;
    ctx.save(); ctx.beginPath(); ctx.rect(cxs - wd / 2, pY, wd, pH); ctx.clip();
    ctx.translate(0, (1 - Math.min(1, p)) * (10 + 26 * m));
    const vg = ctx.createLinearGradient(0, pY, 0, pY + pH); vg.addColorStop(0, shade(main, 255, .5)); vg.addColorStop(.12, shade(main, 255, .2)); vg.addColorStop(.55, main); vg.addColorStop(1, shade(main, 0, .1));
    ctx.fillStyle = vg; ctx.fillRect(cxs - wd / 2, pY, wd, pH);
    const dark = (1 - Math.min(1, p)) * .5; if (dark > .005) { ctx.fillStyle = 'rgba(20,30,50,' + dark + ')'; ctx.fillRect(cxs - wd / 2, pY, wd, pH); }
    const fp = 1 - Math.min(1, p);
    if (fp > .01) { const hg = ctx.createLinearGradient(cxs - wd / 2, 0, cxs + wd / 2, 0); hg.addColorStop(0, 'rgba(255,255,255,' + (.4 * fp) + ')'); hg.addColorStop(1, 'rgba(10,20,40,' + (.5 * fp) + ')'); ctx.fillStyle = hg; ctx.fillRect(cxs - wd / 2, pY, wd, pH); }
    if (id > .02) {                                                    // travelling shimmer, quantised by slat
      const pos = frac(t / 4.8) * 1.7 - .35, wv = Math.exp(-Math.pow(d - pos, 2) / (2 * .05 * .05));
      if (wv > .02) { ctx.fillStyle = `rgba(255,248,225,${.55 * wv * id})`; ctx.fillRect(cxs - wd / 2, pY, wd, pH); }
    }
    ctx.restore();
  }
  /* diagonal sheen across the whole plate (showcase) */
  if (id > .02 && b > .9) {
    const u = clamp(((t + 1) % 4.2) / 1.5), sx = lerp(pL - 120, pR + 120, EZ.inOut(u));
    ctx.save(); ctx.beginPath(); ctx.rect(pL, pY, pR - pL, pH); ctx.clip(); ctx.translate(sx, O.y); ctx.transform(1, 0, -.4, 1, 0, 0); ctx.translate(-sx, -O.y);
    const sg = ctx.createLinearGradient(sx - 80, 0, sx + 80, 0); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(.5, 'rgba(255,255,255,' + (.55 * id) + ')'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg; ctx.fillRect(sx - 80, pY - 10, 160, pH + 20); ctx.restore();
  }
  /* watermark emblem + end bar */
  const wmA = S(b, .66, .94);
  if (wmA > .01) {
    ctx.save(); ctx.beginPath(); ctx.rect(pL, pY, pR - pL, pH); ctx.clip();
    drawLogo(ctx, 'emblem', gold, pL + 380, O.y, 250, .07 * wmA, .3 * Math.sin(t * .35) * id); ctx.restore();
    drawLogo(ctx, 'wordmark', gold, pL + 124 + (1 - wmA) * 16, O.y, 158, wmA);
    const eg = ctx.createLinearGradient(0, pY, 0, pY + pH); eg.addColorStop(0, shade(gold, 255, .3)); eg.addColorStop(1, shade(gold, 0, .2));
    ctx.fillStyle = eg; ctx.globalAlpha *= wmA; ctx.fillRect(pR - 8, pY, 8, pH); ctx.globalAlpha /= Math.max(.001, wmA);
  }
  /* gold base line with a bright head */
  if (lineP > .003) {
    const x1 = pL - 20 + (pR - pL + 20) * lineP;
    ctx.save(); shadow(ctx, 'rgba(0,0,0,.25)', 10, 4);
    const gg = ctx.createLinearGradient(pL, 0, pR, 0); gg.addColorStop(0, shade(gold, 0, .25)); gg.addColorStop(.5, gold); gg.addColorStop(1, shade(gold, 255, .2));
    ctx.fillStyle = gg; ctx.fillRect(O.x, baseY, x1 - O.x, 5); noShadow(ctx);
    if (lineP < .999) { shadow(ctx, gold, 16); ctx.fillStyle = '#FFF6D6'; ctx.beginPath(); safeArc(ctx, x1, baseY + 2.5, 5, 0, 7); ctx.fill(); }
    else { ctx.fillStyle = goldL; ctx.save(); ctx.translate(pR, baseY + 2.5); ctx.rotate(Math.PI / 4); ctx.fillRect(-6, -6, 12, 12); ctx.restore(); }
    if (id > .02) { const u = frac(t / 3.2), px = lerp(O.x, pR + 380, u), lg = ctx.createLinearGradient(px - 380, 0, px, 0); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(1, `rgba(255,250,230,${id})`); ctx.save(); ctx.beginPath(); ctx.rect(O.x, baseY - 1, pR - O.x, 8); ctx.clip(); ctx.fillStyle = lg; ctx.fillRect(px - 380, baseY, 380, 5); ctx.restore(); }
    ctx.restore();
  }
  if (topP > .003) { ctx.save(); ctx.fillStyle = gold; const tw = (pR - pL) * topP; ctx.fillRect(pR - tw, pY - 3, tw, 2.5); ctx.restore(); }

  /* text */
  const rtl = IS_AR(P.title), tR = pR - 44, tL = pL + 230, aw = tR - tL;
  const txP = S(b, .68, .92), sbP = S(b, .76, .98);
  const t1 = fitSize(ctx, P.title, 36, 800, aw), t2 = fitSize(ctx, P.subtitle, 23, 600, aw);
  revealBox(ctx, { x: tL - 20, y: pY + 4, w: aw + 60, h: 56 }, txP, rtl, c => {
    c.save(); c.translate(0, (1 - EZ.out(txP)) * 18); txt(c, P.title, rtl ? tR : tL, pY + 48, t1, 800, ink, rtl ? 'right' : 'left'); c.restore();
  });
  const rtl2 = IS_AR(P.subtitle);
  revealBox(ctx, { x: tL - 20, y: pY + 58, w: aw + 60, h: 40 }, sbP, rtl2, c => {
    c.save(); c.translate(0, (1 - EZ.out(sbP)) * 14); txt(c, P.subtitle, rtl2 ? tR : tL, pY + 86, t2, 600, shade(gold, 0, .22), rtl2 ? 'right' : 'left'); c.restore();
  });

  /* ring burst */
  const rb = S(b, .16, .44);
  if (rb > 0 && rb < 1 && s.dir === 'in') { ctx.save(); ctx.strokeStyle = goldL; ctx.globalAlpha *= (1 - rb) * (.35 + .5 * m); ctx.lineWidth = 3 * (1 - rb) + 1; ctx.beginPath(); safeArc(ctx, O.x, O.y, Rm + 10 + 90 * EZ.out(rb), 0, 7); ctx.stroke(); ctx.restore(); }
  /* medallion */
  const r = Rm * medP;
  if (r > .8) {
    ctx.save(); shadow(ctx, 'rgba(0,0,0,.4)', 22, 9);
    const dg = ctx.createRadialGradient(O.x - 16, O.y - 20, 4, O.x, O.y, r); dg.addColorStop(0, '#223A5C'); dg.addColorStop(1, '#0F1C30');
    ctx.fillStyle = dg; ctx.beginPath(); safeArc(ctx, O.x, O.y, r, 0, 7); ctx.fill(); noShadow(ctx);
    const gd = 1 - S(medP, .25, .6); if (gd > .01) { ctx.save(); ctx.globalAlpha *= gd; shadow(ctx, gold, 16); ctx.fillStyle = goldL; ctx.beginPath(); safeArc(ctx, O.x, O.y, r, 0, 7); ctx.fill(); ctx.restore(); }
    ctx.strokeStyle = metalV(ctx, O.y - r, O.y + r, gold); ctx.lineWidth = 5; ctx.beginPath(); safeArc(ctx, O.x, O.y, r - 2.5, 0, 7); ctx.stroke();
    ctx.strokeStyle = goldL; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.beginPath(); safeArc(ctx, O.x, O.y, r + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ringP); ctx.stroke();
    const sc = 1 + .025 * Math.sin(t * 1.8) * id;
    drawLogo(ctx, 'emblem', goldL, O.x, O.y, (r - 12) * 1.9 * sc, em, .18 * id * Math.sin(t * .7));
    ctx.restore();
    if (id > .02) { const pu = frac(t / 2.6); ctx.save(); ctx.strokeStyle = gold; ctx.globalAlpha = (1 - pu) * .5 * id; ctx.lineWidth = 2; ctx.beginPath(); safeArc(ctx, O.x, O.y, Rm + 12 + 22 * pu, 0, 7); ctx.stroke(); ctx.restore(); }
  }
  ctx.restore();
}

/* =========================================================
   Registry + card UI
   ========================================================= */
const RP_BASE = { speed: 1, glow: true, tHold: 4, tOut: 1.6, mIn: 60, mOut: 50, mIdle: 60 };
const REPINE = [
  { id: 'rp-gold', name: 'Gold Medallion Ribbon', raw: true, draw: drawGold, timing: P => ({ total: rtotal(P) }), colors: ['Ribbon gold', 'Emblem color'],
    blurb: 'Recreated from video 1. A gold ball pops, flips into the logo medallion, and unrolls a ribbon with a subtitle band.',
    defaults: { ...RP_BASE, tIn: 2.2, title: 'أجود ما يكون في رمضان', subtitle: 'اللغة الملبارية', main: '#C99A2E', accent: '#6C7881' } },
  { id: 'rp-teal', name: 'Teal Tile to Bar', raw: true, draw: drawTeal, timing: P => ({ total: rtotal(P) }), colors: ['Bar color', 'Logo plate color'],
    blurb: 'Recreated from video 2. A dot grows into a spinning tile, collapses to a line and stretches into a bar while the logo plate rises.',
    defaults: { ...RP_BASE, tIn: 3.2, title: 'اللغة التاميلية', subtitle: 'التحذيرات من منكرات الأخلاق في أيام العيد', main: '#16A3C0', accent: '#C4953B' } },
  { id: 'rp-glass', name: 'Rosette Bloom', raw: true, draw: drawGlass, timing: P => ({ total: rtotal(P) }), colors: ['Glass panel', 'Gold accent'],
    blurb: 'New. The logo blooms open petal by petal, a light line shoots out and a glass panel opens along it.',
    defaults: { ...RP_BASE, tIn: 2.8, title: 'رمضان شهر الخير', subtitle: 'جمعية هداية للدعوة والإرشاد', main: '#14263D', accent: '#D6A64B' } },
  { id: 'rp-slats', name: 'Geometric Slats', raw: true, draw: drawSlats, timing: P => ({ total: rtotal(P) }), colors: ['Panel color', 'Gold accent'],
    blurb: 'New. A medallion pops, a gold line runs out, and ivory slats flip open in a ripple that travels away from the point.',
    defaults: { ...RP_BASE, tIn: 2.6, title: 'هداية تجمعنا', subtitle: 'جمعية هداية للدعوة والإرشاد وتوعية الجاليات', main: '#F3ECDB', accent: '#B8862B' } }
];

const RATIOS = { '9:16': { w: 1080, h: 1920 }, '4:5': { w: 1080, h: 1350 }, '1:1': { w: 1080, h: 1080 }, '16:9': { w: 1920, h: 1080 } };
const dimsOf = P => RATIOS[P.ratio] || RATIOS['9:16'];
const orient = D => D.w > D.h ? 'l' : D.h / D.w >= 1.5 ? 'p' : 'f';
const TAU = Math.PI * 2;
const BRAND = { gray: '#6C7881', gold: '#C4953B' };

/* the two verse lines join the logo masks, so drawLogo / tintLevels work on them too */


/* ---------- timeline: intro -> showcase (the video plays) -> exit.  Exit 0 = end on the finished frame ---------- */
const ftotal = P => Math.max(.3, P.tIn) + Math.max(0, P.tHold) + Math.max(0, P.tOut);
function fstate(P, t) {
  const tin = Math.max(.3, P.tIn), th = Math.max(0, P.tHold), tout = Math.max(0, P.tOut);
  let b, m, dir;
  if (t < tin) { b = t / tin; m = P.mIn / 100; dir = 'in'; }
  else if (t < tin + th || tout === 0) { b = 1; m = P.mIn / 100; dir = 'hold'; }
  else { b = 1 - clamp((t - tin - th) / tout); m = P.mOut / 100; dir = 'out'; }
  return { b, m, dir, t, id: P.mIdle / 100 * sm(S(b, .85, 1)), play: th > 0 ? clamp((t - tin) / th) : 1 };
}

/* ---------- masks tinted with a flat color or a vertical gradient ---------- */
const maskCache = new Map();
function maskLevels(key, spec) {
  const id = key + '|' + (typeof spec === 'string' ? spec : spec.join(','));
  let lv = maskCache.get(id); if (lv) return lv;
  const im = LOGO[key]; if (!im) return null;
  let c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const x = c.getContext('2d'); x.drawImage(im, 0, 0); x.globalCompositeOperation = 'source-in';
  if (typeof spec === 'string') x.fillStyle = spec;
  else { const g = x.createLinearGradient(0, 0, 0, c.height); spec.forEach((col, i) => g.addColorStop(i / (spec.length - 1), col)); x.fillStyle = g; }
  x.fillRect(0, 0, c.width, c.height);
  lv = [c];
  while (c.width > 120) {
    const n = document.createElement('canvas'); n.width = Math.round(c.width / 2); n.height = Math.round(c.height / 2);
    const nx = n.getContext('2d'); nx.imageSmoothingQuality = 'high'; nx.drawImage(c, 0, 0, n.width, n.height); lv.push(n); c = n;
  }
  if (maskCache.size > 60) maskCache.clear();
  maskCache.set(id, lv); return lv;
}
function drawMask(ctx, key, spec, cx, cy, w, alpha = 1) {
  const lv = maskLevels(key, spec); if (!lv || w <= .5 || alpha <= .003) return;
  const px = w * gScale; let src = lv[0];
  for (const l of lv) if (l.width >= px) src = l;
  const h = w * src.height / src.width;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(src, cx - w / 2, cy - h / 2, w, h); ctx.restore();
}
const metal = c => [shade(c, 255, .55), shade(c, 255, .15), c, shade(c, 0, .28), shade(c, 255, .3)];

/* ---------- cached static layers (paper, patterns): rendered once per size + colors ---------- */
const layerCache = new Map();
function layer(key, D, fn) {
  const s = gScale, id = key + '|' + D.w + 'x' + D.h + '|' + s.toFixed(4);
  let cv = layerCache.get(id);
  if (!cv) {
    cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(D.w * s)); cv.height = Math.max(1, Math.round(D.h * s));
    const x = cv.getContext('2d'); x.setTransform(s, 0, 0, s, 0, 0); fn(x, cv);
    if (layerCache.size > 18) layerCache.delete(layerCache.keys().next().value);
    layerCache.set(id, cv);
  }
  return cv;
}
const blit = (ctx, cv, D, a = 1) => { if (a <= .003) return; ctx.save(); ctx.globalAlpha *= a; ctx.drawImage(cv, 0, 0, D.w, D.h); ctx.restore(); };
function cut(ctx, pathFn, a = 1) {                       // punches the window: real transparency
  if (a <= .002) return;
  ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = Math.min(1, a); pathFn(); ctx.fillStyle = '#000'; ctx.fill(); ctx.restore();
}
function grain(x, cv, amt) {                             // paper speckle, pixel space
  const id = x.getImageData(0, 0, cv.width, cv.height), d = id.data; let r = 1234567;
  for (let i = 0; i < d.length; i += 4) { r ^= r << 13; r ^= r >>> 17; r ^= r << 5; const v = ((r >>> 0) % 1000 / 1000 - .5) * amt; d[i] += v; d[i + 1] += v; d[i + 2] += v; }
  x.putImageData(id, 0, 0);
}

/* =========================================================
   Shared pieces
   ========================================================= */
const VR = { h1: VERSE_DIM.verse1.h / VERSE_DIM.verse1.w, h2: VERSE_DIM.verse2.h / VERSE_DIM.verse1.w, gap: VERSE_DIM.gap / VERSE_DIM.verse1.w };
const verseH = w => w * (VR.h1 + VR.gap + VR.h2);
/* the two calligraphy lines, each wiped in from the right */
function verse(ctx, spec, cx, y, w, p1, p2, glowCol, glowBlur = 0) {
  const h1 = w * VR.h1, h2 = w * VR.h2, y2 = y + h1 + w * VR.gap, pad = 12 + glowBlur * 1.6;
  const line = (key, yy, hh, p) => {
    if (p <= 0) return;
    revealBox(ctx, { x: cx - w / 2 - pad, y: yy - pad, w: w + pad * 2, h: hh + pad * 2 }, EZ.inOut(p), true, c => {
      if (glowCol) shadow(c, glowCol, glowBlur);
      drawMask(c, key, spec, cx, yy + hh / 2, w); noShadow(c);
    }, w * .14);
  };
  line('verse1', y, h1, p1); line('verse2', y2, h2, p2);
  return h1 + w * VR.gap + h2;
}
/* full logo lockup: emblem / wordmark / tagline, proportions taken from the original artwork */
function lockup(ctx, cx, top, ww, col, pr, t, id, m, mode = 'bloom') {
  const ew = .7 * ww, ecy = top + .35 * ww;
  if (pr.em > 0) {
    if (mode === 'bloom') {
      const ps = [...Array(8)].map((_, i) => EZ.back(S(pr.em, i * .055, .6 + i * .055), m));
      bloomLogo(ctx, 'emblem', col.em, cx, ecy, ew, ps, m, .12 * id * Math.sin(t * .6));
    } else {
      const sc = EZ.back(pr.em, m), r = (1 - EZ.out(pr.em)) * -1.4 + .12 * id * Math.sin(t * .6);
      drawLogo(ctx, 'emblem', col.em, cx, ecy, ew * sc, Math.min(1, pr.em * 2.2), r);
    }
  }
  const wy = top + .8805 * ww;
  if (pr.word > 0) revealBox(ctx, { x: cx - ww / 2 - 8, y: wy - .17 * ww, w: ww + 16, h: .34 * ww }, EZ.inOut(pr.word), true, c => drawLogo(c, 'wordmark', col.word, cx, wy, ww), ww * .25);
  const ty = top + 1.1395 * ww;
  if (pr.tag > 0 && col.tag) { const a = EZ.out(pr.tag); drawLogo(ctx, 'tagline', col.tag, cx, ty + (1 - a) * 14, .954 * ww, a); }
  return 1.227 * ww;
}
const lockupH = ww => 1.227 * ww;

function icon(ctx, kind, cx, cy, r, chip, glyph) {
  ctx.save(); ctx.translate(cx, cy);
  if (kind === 'wa') {
    ctx.fillStyle = '#25D366'; ctx.beginPath(); safeArc(ctx, 0, 0, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = r * .1; ctx.lineJoin = 'round';
    ctx.beginPath(); safeArc(ctx, 0, 0, r * .56, 2.62, 2.08 + TAU); ctx.lineTo(-r * .62, r * .62); ctx.closePath(); ctx.stroke();
    ctx.lineCap = 'round'; ctx.lineWidth = r * .17;
    ctx.beginPath(); safeArc(ctx, r * .02, -r * .02, r * .24, 2.05, 4.25); ctx.stroke();
    ctx.lineWidth = r * .13; ctx.beginPath(); ctx.moveTo(-r * .27, -r * .17); ctx.lineTo(-r * .18, -r * .07); ctx.moveTo(r * .1, r * .23); ctx.lineTo(r * .2, r * .3); ctx.stroke();
    ctx.restore(); return;
  }
  ctx.fillStyle = chip; ctx.beginPath(); safeArc(ctx, 0, 0, r, 0, TAU); ctx.fill();
  ctx.fillStyle = glyph; ctx.strokeStyle = glyph; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const q = r;
  switch (kind) {
    case 'fb':
      ctx.lineWidth = q * .2; ctx.beginPath(); ctx.moveTo(q * .1, q * .6); ctx.lineTo(q * .1, -q * .14); ctx.quadraticCurveTo(q * .1, -q * .5, q * .44, -q * .5);
      ctx.moveTo(-q * .2, -q * .03); ctx.lineTo(q * .38, -q * .03); ctx.stroke(); break;
    case 'ig':
      ctx.lineWidth = q * .13; rr(ctx, -q * .5, -q * .5, q, q, q * .28); ctx.stroke();
      ctx.beginPath(); safeArc(ctx, 0, 0, q * .22, 0, TAU); ctx.stroke(); ctx.beginPath(); safeArc(ctx, q * .27, -q * .27, q * .07, 0, TAU); ctx.fill(); break;
    case 'x':
      ctx.lineWidth = q * .1; ctx.beginPath(); ctx.moveTo(q * .4, -q * .44); ctx.lineTo(-q * .4, q * .44); ctx.stroke();
      ctx.lineWidth = q * .2; ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(-q * .4, -q * .44); ctx.lineTo(q * .4, q * .44); ctx.stroke(); break;
    case 'snap':
      ctx.beginPath(); ctx.moveTo(-q * .3, q * .18); ctx.lineTo(-q * .3, -q * .08); safeArc(ctx, 0, -q * .08, q * .3, Math.PI, 0); ctx.lineTo(q * .3, q * .18);
      ctx.lineTo(q * .5, q * .3); ctx.lineTo(q * .22, q * .4); ctx.lineTo(q * .1, q * .52); ctx.lineTo(0, q * .46); ctx.lineTo(-q * .1, q * .52); ctx.lineTo(-q * .22, q * .4); ctx.lineTo(-q * .5, q * .3); ctx.closePath(); ctx.fill(); break;
    case 'yt':
      rr(ctx, -q * .56, -q * .38, q * 1.12, q * .76, q * .2); ctx.fill(); ctx.fillStyle = chip;
      ctx.beginPath(); ctx.moveTo(-q * .15, -q * .2); ctx.lineTo(q * .24, 0); ctx.lineTo(-q * .15, q * .2); ctx.closePath(); ctx.fill(); break;
    case 'web':
      ctx.lineWidth = q * .1; ctx.beginPath(); safeArc(ctx, 0, 0, q * .56, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 0, q * .24, q * .56, 0, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-q * .56, 0); ctx.lineTo(q * .56, 0); ctx.moveTo(-q * .46, -q * .3); ctx.lineTo(q * .46, -q * .3); ctx.moveTo(-q * .46, q * .3); ctx.lineTo(q * .46, q * .3); ctx.stroke(); break;
  }
  ctx.restore();
}

/* support line + WhatsApp + phone, centred on cx. Returns the height used */
function contact(ctx, P, cx, y, k, pal, p) {
  if (p <= 0 || !P.showContact || !(P.phone || P.support)) return 0;
  const a = EZ.out(p), fs = 72, r = 31, gap = 16;
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(cx, y + (1 - a) * 22 * k); ctx.scale(k, k);
  let yy = 0;
  if (P.support) { txt(ctx, P.support, 0, 36, fitSize(ctx, P.support, 36, 600, 560), 600, pal.support, 'center'); yy = 58; }
  if (!P.phone) { ctx.restore(); return yy ? (yy + 20) * k : 0; }
  ctx.font = `800 ${fs}px ${AR_FONT}`; ctx.direction = 'ltr'; if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
  const pw = ctx.measureText(P.phone).width, tot = 2 * r + gap + pw, x0 = -tot / 2, cy = yy + 46;
  icon(ctx, 'wa', x0 + r, cy, r);
  ctx.fillStyle = pal.phone; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(P.phone, x0 + 2 * r + gap, cy + fs * .04);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.restore();
  return (yy + 96) * k;
}
/* phone in an outlined pill (watercolor design) */
function phonePill(ctx, P, x, y, k, pal, p, align = 'left') {
  if (p <= 0 || !P.showContact) return;
  const a = EZ.out(p), fs = 56, r = 27, pad = 16, h = 80;
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y); ctx.scale(k, k); ctx.translate(0, (1 - a) * 16);
  ctx.font = `800 ${fs}px ${AR_FONT}`; ctx.direction = 'ltr'; if ('letterSpacing' in ctx) ctx.letterSpacing = '5px';
  const pw = ctx.measureText(P.phone).width, w = pad + 2 * r + 18 + pw + pad * 1.6, x0 = align === 'left' ? 0 : align === 'right' ? -w : -w / 2;
  rr(ctx, x0, 0, w, h, h / 2); ctx.fillStyle = pal.pillFill; ctx.fill(); ctx.strokeStyle = pal.pillLine; ctx.lineWidth = 2.5; ctx.stroke();
  icon(ctx, 'wa', x0 + pad + r, h / 2, r);
  ctx.fillStyle = pal.phone; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(P.phone, x0 + pad + 2 * r + 18, h / 2 + fs * .04);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.restore();
}
/* icons + handle (+ globe + website), one or two rows. opts.phone puts WhatsApp + number at the start */
const SOC = ['fb', 'ig', 'x', 'snap', 'yt'];
function socials(ctx, P, x, y, k, pal, p, align = 'center', lines = 1, maxW = 0, withPhone = false) {
  if (p <= 0) return;
  const r = 22, gap = 12, fs = 31;
  const tw = (s, wt) => textW(ctx, s, fs, wt);
  let row1 = [];
  if (withPhone && P.showContact) row1.push({ kd: 'wa', w: 2 * r }, { s: P.phone, w: tw(P.phone, 800), bold: true }, { sp: 1, w: 18 });
  if (P.showSocial) { row1 = row1.concat(SOC.map(kd => ({ kd, w: 2 * r }))); if (P.handle) row1.push({ s: P.handle, w: tw(P.handle, 600) }); }
  const row2 = P.showSocial && P.web ? [{ kd: 'web', w: 2 * r }, { s: P.web, w: tw(P.web, 600) }] : [];
  const rows = (lines === 1 ? [row1.concat(row2.length && row1.length ? [{ sp: 1, w: 22 }] : [], row2)] : [row1, row2]).filter(rw => rw.length);
  if (!rows.length) return;
  const widthOf = row => row.reduce((a, it) => a + it.w, 0) + gap * (row.length - 1);
  let kk = k; const mw = Math.max(...rows.map(widthOf)); if (maxW && mw * kk > maxW) kk = maxW / mw;
  ctx.save(); ctx.translate(x, y); ctx.scale(kk, kk);
  let idx = 0;
  rows.forEach((row, ri) => {
    const rw = widthOf(row); let x0 = align === 'center' ? -rw / 2 : align === 'right' ? -rw : 0;
    const cy = ri * 62;
    row.forEach(it => {
      const q = S(p, idx * .045, idx * .045 + .42); idx++;
      if (q > 0 && it.kd) { const sc = EZ.back(q, .9); ctx.save(); ctx.translate(x0 + r, cy); ctx.scale(sc, sc); icon(ctx, it.kd, 0, 0, it.kd === 'wa' ? r * 1.05 : r, pal.chip, pal.glyph); ctx.restore(); }
      else if (q > 0 && it.s) {
        ctx.save(); ctx.globalAlpha *= EZ.out(q); ctx.font = `${it.bold ? 800 : 600} ${fs}px ${AR_FONT}`; ctx.direction = 'ltr';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = it.bold ? (pal.phone || pal.text) : pal.text; ctx.fillText(it.s, x0 + (1 - EZ.out(q)) * 12, cy + 2); ctx.restore();
      }
      x0 += it.w + gap;
    });
  });
  ctx.restore();
}
/* audio waveform: bars for what has played, dots for what is left. Progress follows the showcase */
function waveform(ctx, x, y, w, h, col, pIn, play, t, id) {
  if (pIn <= 0) return;
  const step = h * .44, n = Math.max(6, Math.floor(w / step)), nb = Math.round(n * (.1 + .9 * play)), ga = ctx.globalAlpha;
  ctx.save(); ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a = EZ.out(S(pIn, i / n * .7, i / n * .7 + .3)); if (a <= 0) continue;
    const xx = x + (i + .5) * step, cy = y + h / 2;
    if (i < nb) {
      const live = .22 + .78 * Math.abs(Math.sin(i * 1.7 + t * 6.1 + 2 * Math.sin(i * .37 + t * 2.3))) * (.45 + .55 * rnd(i + 3));
      const hh = Math.max(step * .4, h * lerp(.3 + .6 * rnd(i + 11), live, clamp(id * 1.4)) * a);
      ctx.globalAlpha = ga; ctx.lineWidth = step * .42; ctx.beginPath(); ctx.moveTo(xx, cy - hh / 2); ctx.lineTo(xx, cy + hh / 2); ctx.stroke();
    } else { ctx.globalAlpha = ga * .85 * a; ctx.beginPath(); safeArc(ctx, xx, cy, step * .16, 0, TAU); ctx.fill(); }
  }
  ctx.restore();
}
/* floating light: soft bokeh discs or fine dust, drifting upward. Deterministic in t */
function bokeh(ctx, area, t, n, col, alpha, seed, r0, r1, vy, disc) {
  if (alpha <= .005) return;
  for (let i = 0; i < n; i++) {
    const r = lerp(r0, r1, Math.pow(rnd(seed + i * 3.1), 2.2)), sp = vy * (.5 + rnd(seed + i + .7));
    const span = area.h + 2 * r, yy = area.y + area.h + r - frac(rnd(seed + i * 1.3) + t * sp / span) * span;
    const xx = area.x + rnd(seed + i * 2.7) * area.w + Math.sin(t * .4 + i) * 14;
    const a = alpha * (.3 + .7 * rnd(seed + i * 5.3)) * (.6 + .4 * Math.sin(t * (1 + rnd(i + seed)) + i));
    if (a <= .004) continue;
    const g = ctx.createRadialGradient(xx, yy, 0, xx, yy, r);
    if (disc) { g.addColorStop(0, rgba(col, a * .75)); g.addColorStop(.78, rgba(col, a * .6)); g.addColorStop(.92, rgba(col, a * .9)); g.addColorStop(1, rgba(col, 0)); }
    else { g.addColorStop(0, rgba(col, a)); g.addColorStop(.45, rgba(col, a * .5)); g.addColorStop(1, rgba(col, 0)); }
    ctx.fillStyle = g; ctx.fillRect(xx - r, yy - r, 2 * r, 2 * r);
  }
}
function nameText(ctx, str, x, y, size, col, p, align = 'center') {
  if (!str || p <= 0) return;
  const a = EZ.out(p); ctx.save(); ctx.globalAlpha *= a; txt(ctx, str, x, y + (1 - a) * 14, size, 800, col, align); ctx.restore();
}
/* a small plaque with the reciter's name (sits on a window edge) */
function plaque(ctx, str, cx, cy, k, pal, p) {
  if (!str || p <= 0) return;
  const fs = 38, w = textW(ctx, str, fs, 800) + 90, h = 70, a = EZ.out(p), sx = EZ.back(p, .6);
  ctx.save(); ctx.translate(cx, cy); ctx.scale(k * Math.max(.05, sx), k); ctx.globalAlpha *= a;
  shadow(ctx, 'rgba(0,0,0,.4)', 18, 6); rr(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fillStyle = pal.fill; ctx.fill(); noShadow(ctx);
  ctx.strokeStyle = pal.line; ctx.lineWidth = 2.5; ctx.stroke(); rr(ctx, -w / 2 + 6, -h / 2 + 6, w - 12, h - 12, h / 2 - 6); ctx.lineWidth = 1; ctx.stroke();
  txt(ctx, str, 0, fs * .36, fs, 800, pal.text, 'center');
  ctx.restore();
}

/* content blocks reused by several designs. Natural size, origin = top centre */
function rowBlock(ctx, P, s, pal, pr) {                  // verse / [name, wave, contact | logo] / socials        ~ 1000 x 690
  const { m, id, t } = s;
  const side = P.showLogo && (P.showWave || P.showContact || P.reciter);
  let y = 0;
  if (P.showVerse) { verse(ctx, pal.verse, 0, 0, 920, pr.v1, pr.v2, pal.verseGlow, pal.verseBlur); y = 300; } else y = 90;
  const lx = side ? -215 : 0; let ly = y + 4;
  if (P.reciter) { nameText(ctx, P.reciter, lx, ly + 38, 40, pal.name, pr.name); ly += 62; }
  if (P.showWave) { waveform(ctx, lx - 220, ly, 440, 46, pal.wave, pr.wave, s.play, t, id); ly += 72; }
  contact(ctx, P, lx, ly, 1, pal, pr.contact);
  if (P.showLogo) lockup(ctx, side ? 285 : 0, side ? y - 6 : y, 236, pal.logo, pr.logo, t, id, m);
  if (P.showSocial) socials(ctx, P, 0, y + 362, 1, pal, pr.soc, 'center', 1, 1010);
}
function stackBlock(ctx, P, s, pal, pr, colW) {          // logo / verse / name / wave / contact / socials, single column
  const { m, id, t } = s; let y = 0;
  if (P.showLogo) { lockup(ctx, 0, 0, 205, pal.logo, pr.logo, t, id, m); y = lockupH(205) + 40; }
  if (P.showVerse) { const vw = colW - 70; verse(ctx, pal.verse, 0, y, vw, pr.v1, pr.v2, pal.verseGlow, pal.verseBlur); y += verseH(vw) + 44; }
  if (P.reciter) { nameText(ctx, P.reciter, 0, y + 30, 38, pal.name, pr.name); y += 62; }
  if (P.showWave) { waveform(ctx, -210, y, 420, 40, pal.wave, pr.wave, s.play, t, id); y += 70; }
  const ch = contact(ctx, P, 0, y, 1, pal, pr.contact); if (ch) y += ch + 34;
  if (P.showSocial) socials(ctx, P, 0, y + 22, 1, pal, pr.soc, 'center', 2, colW - 40);
}
const stdProgress = b => ({
  v1: S(b, .34, .62), v2: S(b, .44, .72), wave: S(b, .5, .78), contact: S(b, .56, .86), soc: S(b, .66, .98), name: S(b, .48, .74),
  logo: { em: S(b, .38, .74), word: S(b, .58, .86), tag: S(b, .68, .94) }
});

/* rough helpers */
function tornPts(a0, a1, base, amp, seed) {
  const pts = [];
  for (let v = a0, i = 0; v <= a1 + 7; v += 7, i++) pts.push([v, base + amp * (Math.sin(v * .021 + seed) * .45 + Math.sin(v * .067 + seed * 3) * .3 + (rnd(i + seed * 13) - .5) * .55)]);
  return pts;
}
function roughLine(ctx, x0, y0, x1, y1, jit, seed, p, steps = 14) {
  if (p <= 0) return;
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  ctx.beginPath();
  for (let k = 0; k <= steps; k++) {
    const u = p * k / steps, w = Math.sin(u * 7 + seed) * jit + (rnd(seed * 3 + k) - .5) * jit * .8;
    const px = x0 + dx * u + nx * w, py = y0 + dy * u + ny * w;
    k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.stroke();
}
function brushLine(ctx, x0, y0, x1, y1, width, col, alpha, seed, p) {     // bristle stroke
  if (p <= 0) return;
  const n = 9, dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, ga = ctx.globalAlpha;
  ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = col;
  for (let i = 0; i < n; i++) {
    const o = (i / (n - 1) - .5) * width, s0 = rnd(seed + i * 3.1) * .05, e0 = 1 - rnd(seed + i * 5.7) * .07, e = lerp(s0, e0, p);
    if (e <= s0) continue;
    ctx.globalAlpha = ga * alpha * (.35 + .65 * rnd(seed + i * 7.3)); ctx.lineWidth = width / n * 1.8;
    ctx.beginPath();
    for (let k = 0; k <= 12; k++) {
      const u = lerp(s0, e, k / 12), w = Math.sin(u * 9 + seed + i) * width * .07 + (rnd(seed + i * 11 + k) - .5) * 2.4;
      const px = x0 + dx * u + nx * (o + w), py = y0 + dy * u + ny * (o + w);
      k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}
/* 8-point star lattice; p reveals it as a ripple out of (ox, oy) */
function starLattice(ctx, x0, y0, x1, y1, s, ox, oy, p, spread, lw) {
  const R = s * .4, per = 4 * R * Math.SQRT2;
  const i0 = Math.floor((x0 - ox) / s) - 1, i1 = Math.ceil((x1 - ox) / s) + 1, j0 = Math.floor((y0 - oy) / s) - 1, j1 = Math.ceil((y1 - oy) / s) + 1;
  ctx.lineWidth = lw; ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
  const star = (x, y) => { for (const rot of [0, Math.PI / 4]) { for (let k = 0; k < 4; k++) { const a = rot + k * Math.PI / 2, px = x + Math.cos(a) * R, py = y + Math.sin(a) * R; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); } };
  const full = [], part = [];
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = ox + i * s, y = oy + j * s, d = Math.hypot(x - ox, y - oy) / spread, q = clamp((p - d * .6) / .4);
    if (q <= 0) continue; (q >= 1 ? full : part).push([x, y, q]);
  }
  ctx.setLineDash([]); ctx.beginPath();
  for (const [x, y] of full) { star(x, y); ctx.moveTo(x + R, y); ctx.lineTo(x + s - R, y); ctx.moveTo(x, y + R); ctx.lineTo(x, y + s - R); }
  ctx.stroke();
  for (const [x, y, q] of part) {
    ctx.setLineDash([per * q, per]); ctx.beginPath(); star(x, y); ctx.stroke();
    if (q > .5) { const r2 = (q - .5) * 2; ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(x + R, y); ctx.lineTo(x + R + (s - 2 * R) * r2, y); ctx.moveTo(x, y + R); ctx.lineTo(x, y + R + (s - 2 * R) * r2); ctx.stroke(); }
  }
  ctx.setLineDash([]);
}

/* =========================================================
   01  LATTICE ARCH   (remake of reference 1)
   a lattice lambrequin drops from the top, a torn panel rises from the bottom; the video fills everything in between
   ========================================================= */
function lambrequin(ctx, cx, top, hw, depth, g) {
  const L = hw + g, Dp = depth + g;
  const half = [[-L, .3], [-.74 * L, .5], [-.47 * L, .69], [-.22 * L, .86], [0, 1]].map(([x, y]) => [x, y * Dp]);
  const bulge = (a, b2) => {
    const mx = (a[0] + b2[0]) / 2, my = (a[1] + b2[1]) / 2, dx = b2[0] - a[0], dy = b2[1] - a[1], len = Math.hypot(dx, dy);
    let nx = -dy / len, ny = dx / len; if (ny < 0) { nx = -nx; ny = -ny; }
    ctx.quadraticCurveTo(cx + mx + nx * len * .3, top + my + ny * len * .3, cx + b2[0], top + b2[1]);
  };
  ctx.beginPath(); ctx.moveTo(cx - L, top - 40); ctx.lineTo(cx + half[0][0], top + half[0][1]);
  for (let i = 0; i < half.length - 1; i++) bulge(half[i], half[i + 1]);
  const right = half.map(([x, y]) => [-x, y]).reverse();
  for (let i = 0; i < right.length - 1; i++) bulge(right[i], right[i + 1]);
  ctx.lineTo(cx + L, top - 40); ctx.closePath();
}
const LATTICE = {
  lay(D) {
    const o = orient(D);
    if (o === 'l') return { o, orn: { cx: 600, hw: 480, d: 330 }, px: 1215, win: { x: 0, y: 0, w: D.w, h: D.h }, dust: { x: 0, y: 0, w: 1240, h: D.h } };
    if (o === 'p') return { o, orn: { cx: D.w / 2, hw: D.w / 2, d: 470 }, py: 1125, k: 1, win: { x: 0, y: 0, w: D.w, h: D.h }, dust: { x: 0, y: 0, w: D.w, h: 1150 } };
    const sq = D.h === D.w;
    return { o, orn: { cx: D.w / 2, hw: D.w / 2, d: sq ? 250 : 320 }, py: sq ? 590 : 770, k: sq ? .615 : .74, win: { x: 0, y: 0, w: D.w, h: D.h }, dust: { x: 0, y: 0, w: D.w, h: sq ? 615 : 795 } };
  },
  draw(ctx, P, t) {
    const D = dimsOf(P), L = this.lay(D), s = fstate(P, t);
    if (s.b <= .0005) return;
    if (P.particles) { const a = EZ.out(S(s.b, .3, .8)); bokeh(ctx, L.dust, t, 30, shade(P.c3, 255, .55), .9 * a, 11, 2, 6, 26, false); }
    this.panel(ctx, P, D, L, s);
    this.ornament(ctx, P, D, L, s);
  },
  panel(ctx, P, D, L, s) {
    const { b, m } = s, land = L.o === 'l', pin = EZ.back(S(b, .04, .42), m * .45);
    if (pin <= .001) return;
    ctx.save();
    if (land) ctx.translate((1 - pin) * (D.w - L.px + 90), 0); else ctx.translate(0, (1 - pin) * (D.h - L.py + 90));
    const edge = land ? tornPts(-20, D.h + 20, L.px, 16, 3) : tornPts(-20, D.w + 20, L.py, 16, 3);
    const xy = ([v, u], off = 0) => land ? [u + off, v] : [v, u + off];
    ctx.beginPath(); ctx.moveTo(D.w + 30, D.h + 30);
    if (land) ctx.lineTo(D.w + 30, -30); else ctx.lineTo(-30, D.h + 30);
    edge.forEach(p => ctx.lineTo(...xy(p)));
    ctx.closePath();
    shadow(ctx, 'rgba(0,0,0,.5)', 46, land ? 0 : -10, land ? -10 : 0);
    const g = land ? ctx.createLinearGradient(L.px, 0, D.w, 0) : ctx.createLinearGradient(0, L.py, 0, D.h);
    g.addColorStop(0, shade(P.c2, 0, .3)); g.addColorStop(.45, P.c2); g.addColorStop(1, shade(P.c2, 255, .16));
    ctx.fillStyle = g; ctx.fill(); noShadow(ctx);
    ctx.beginPath(); edge.forEach((p, i) => i ? ctx.lineTo(...xy(p, 4)) : ctx.moveTo(...xy(p, 4)));
    ctx.strokeStyle = rgba(P.c3, .4); ctx.lineWidth = 2; ctx.stroke();
    const pal = { verse: P.c4, support: P.c3, phone: P.c4, chip: P.c4, glyph: shade(P.c2, 0, .35), text: P.c4, wave: P.c4, name: P.c3, logo: { em: P.c4, word: P.c4, tag: P.c4 } };
    const pr = stdProgress(b);
    ctx.save();
    if (land) { ctx.translate((L.px + D.w) / 2 + 8, 62); stackBlock(ctx, P, s, pal, pr, D.w - L.px - 40); }
    else { ctx.translate(D.w / 2, L.py + 52 * L.k + (P.showVerse ? 0 : 60 * L.k)); ctx.scale(L.k, L.k); rowBlock(ctx, P, s, pal, pr); }
    ctx.restore();
    ctx.restore();
  },
  ornament(ctx, P, D, L, s) {
    const { b, m, id, t } = s, O = L.orn, drop = EZ.back(S(b, 0, .34), m * .7);
    if (drop <= .001) return;
    const teal = P.c1, gold = P.c3;
    ctx.save(); ctx.translate(0, -(1 - drop) * (O.d + 90));
    shadow(ctx, 'rgba(0,0,0,.45)', 34, 12);
    lambrequin(ctx, O.cx, 0, O.hw, O.d, 30); ctx.fillStyle = shade(teal, 0, .45); ctx.fill(); noShadow(ctx);
    lambrequin(ctx, O.cx, 0, O.hw, O.d, 21); ctx.strokeStyle = rgba(gold, .9); ctx.lineWidth = 3; ctx.stroke();
    lambrequin(ctx, O.cx, 0, O.hw, O.d, 12); ctx.fillStyle = shade(teal, 0, .18); ctx.fill();
    lambrequin(ctx, O.cx, 0, O.hw, O.d, 0);
    const ig = ctx.createLinearGradient(0, 0, 0, O.d); ig.addColorStop(0, shade(teal, 0, .35)); ig.addColorStop(1, teal);
    ctx.fillStyle = ig; ctx.fill(); ctx.strokeStyle = rgba(gold, .8); ctx.lineWidth = 2; ctx.stroke();
    const pp = S(b, .16, .72), spread = Math.hypot(O.hw, O.d);
    ctx.save(); lambrequin(ctx, O.cx, 0, O.hw, O.d, -7); ctx.clip();
    ctx.strokeStyle = rgba(shade(gold, 255, .35), .88);
    starLattice(ctx, O.cx - O.hw - 40, -60, O.cx + O.hw + 40, O.d + 40, 66, O.cx, O.d - 26, pp, spread, 2.3);
    if (id > .02) {                                               // light sweeping across the lattice
      const u = clamp(frac(t / 4.6) * 1.7), gx = lerp(O.cx - O.hw - 260, O.cx + O.hw + 260, EZ.inOut(u));
      if (u < 1) {
        ctx.save(); ctx.beginPath(); ctx.moveTo(gx - 70, -40); ctx.lineTo(gx + 70, -40); ctx.lineTo(gx - 90, O.d + 40); ctx.lineTo(gx - 230, O.d + 40); ctx.closePath(); ctx.clip();
        ctx.strokeStyle = `rgba(255,255,255,${.65 * id})`; starLattice(ctx, gx - 330, -60, gx + 120, O.d + 40, 66, O.cx, O.d - 26, 1, spread, 2.8); ctx.restore();
      }
      for (let i = 0; i < 6; i++) {                               // twinkles on star centres
        const gx2 = O.cx + (Math.round((rnd(i + 4) - .5) * O.hw * 1.5 / 66)) * 66, gy = O.d - 26 - Math.round(1 + rnd(i + 9) * (O.d / 66 - 2)) * 66;
        const k2 = Math.pow(Math.max(0, Math.sin(t * 1.9 + i * 1.7)), 6); sparkle(ctx, gx2, gy, 14 * k2, '#FFF6D8', id * k2);
      }
    }
    ctx.restore();
    ctx.restore();
  }
};

/* =========================================================
   02  WATERCOLOR PAPER   (remake of reference 2)
   textured paper, painted brush frame, cross stitches, sprigs, a Quran on its stand and a brushed name label
   ========================================================= */
function sprig(ctx, x, y, len, ang, col, p, sway) {
  if (p <= 0) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang + sway);
  const sp = EZ.out(S(p, 0, .5));
  ctx.strokeStyle = col; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * .5 * sp, -len * .12 * sp, len * sp, 0); ctx.stroke();
  for (let i = 0; i < 7; i++) {
    const u = .18 + i * .12, q = EZ.back(S(p, .2 + i * .08, .5 + i * .08), .9); if (q <= 0 || u > sp) continue;
    const side = i % 2 ? 1 : -1, lx = len * u, ly = -len * .12 * 4 * u * (1 - u) * .5, ll = len * .24 * q, lw = len * .085 * q;
    ctx.save(); ctx.translate(lx, ly); ctx.rotate(side * .75 - .2);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(ll * .5, -lw, ll, 0); ctx.quadraticCurveTo(ll * .5, lw, 0, 0);
    ctx.fillStyle = col; ctx.globalAlpha *= .85; ctx.fill(); ctx.restore();
  }
  ctx.restore();
}
function blossom(ctx, x, y, r, col, center, p, rot) {
  const q = EZ.back(p, .9); if (q <= .01) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(q, q); ctx.fillStyle = col;
  for (let i = 0; i < 6; i++) { ctx.save(); ctx.rotate(i * TAU / 6); ctx.beginPath(); ctx.ellipse(r * .55, 0, r * .5, r * .3, 0, 0, TAU); ctx.globalAlpha *= .9; ctx.fill(); ctx.restore(); }
  ctx.fillStyle = center; ctx.beginPath(); safeArc(ctx, 0, 0, r * .28, 0, TAU); ctx.fill(); ctx.restore();
}
function quranStand(ctx, x, y, s, p, bob) {           // a Quran resting on a rehal (wooden folding stand)
  if (p <= 0) return;
  const a = EZ.out(p);
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(x - (1 - a) * 160, y + bob); ctx.rotate((1 - a) * -.25); ctx.scale(s, s);
  shadow(ctx, 'rgba(60,40,20,.35)', 16, 8);
  const board = (x0, y0, x1, y1, c0, c1) => { const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, c0); g.addColorStop(1, c1); ctx.strokeStyle = g; ctx.lineWidth = 15; ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
  board(-96, 0, 82, -108, '#4A2D18', '#7A4E2C');
  noShadow(ctx);
  // the book: cover + page blocks on both halves of the V
  const dirL = [-.855, -.519], nL = [.519, -.855];
  const half = sg => {
    const A = [-3 * sg, -64], len = 104, th = 15, d = [dirL[0] * sg, dirL[1]], n = [nL[0] * sg, nL[1]];
    const B = [A[0] + d[0] * len, A[1] + d[1] * len];
    const q = (o, ext = 0) => [[A[0] + n[0] * o - d[0] * ext, A[1] + n[1] * o - d[1] * ext], [B[0] + n[0] * o + d[0] * ext, B[1] + n[1] * o + d[1] * ext]];
    const [c0, c1] = q(-5, 4), [c2, c3] = q(th + 4, 4);
    ctx.fillStyle = '#7B1E22'; ctx.beginPath(); ctx.moveTo(...c0); ctx.lineTo(...c1); ctx.lineTo(...c3); ctx.lineTo(...c2); ctx.closePath(); ctx.fill();
    const [p0, p1] = q(0), [p2, p3] = q(th);
    const pg = ctx.createLinearGradient(...p0, ...p2); pg.addColorStop(0, '#E9DDBF'); pg.addColorStop(1, '#FBF5E4');
    ctx.fillStyle = pg; ctx.beginPath(); ctx.moveTo(...p0); ctx.lineTo(...p1); ctx.lineTo(...p3); ctx.lineTo(...p2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(150,120,70,.45)'; ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) { const [l0, l1] = q(th * i / 4); ctx.beginPath(); ctx.moveTo(...l0); ctx.lineTo(...l1); ctx.stroke(); }
    ctx.strokeStyle = '#D9B160'; ctx.lineWidth = 2.2; const [g0, g1] = q(th + 2, 0); ctx.beginPath(); ctx.moveTo(...g0); ctx.lineTo(...g1); ctx.stroke();
  };
  half(1); half(-1);
  shadow(ctx, 'rgba(60,40,20,.3)', 10, 4);
  board(96, 0, -82, -108, '#6B4226', '#9A6A3E');
  noShadow(ctx);
  ctx.fillStyle = '#D9B160'; ctx.beginPath(); safeArc(ctx, 0, -58, 4, 0, TAU); ctx.fill();
  ctx.restore();
}
function brushPill(ctx, str, cx, cy, k, pal, p) {
  if (!str || p <= 0) return;
  const fs = 46, tw = textW(ctx, str, fs, 800), w = tw + 120, h = 78;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(k, k);
  revealBox(ctx, { x: -w / 2 - 50, y: -h / 2 - 30, w: w + 100, h: h + 60 }, EZ.inOut(p), true, c => {
    c.save(); c.fillStyle = rgba(pal.band, .55); c.beginPath();
    for (let i = 0; i <= 40; i++) { const u = i / 40, x = -w / 2 + u * w, yy = -h / 2 + Math.sin(u * 11) * 3 + (rnd(i + 3) - .5) * 4; i ? c.lineTo(x, yy) : c.moveTo(x, yy); }
    for (let i = 40; i >= 0; i--) { const u = i / 40, x = -w / 2 + u * w + (i === 0 ? -14 : 0), yy = h / 2 + Math.sin(u * 9 + 2) * 3 + (rnd(i + 51) - .5) * 4; c.lineTo(x, yy); }
    c.closePath(); c.fill();
    c.strokeStyle = rgba(pal.line, .8); c.lineWidth = 3; c.lineCap = 'round';
    roughLine(c, -w / 2 - 30, -h / 2 - 10, w / 2 + 20, -h / 2 - 14, 2, 4, 1);
    roughLine(c, -w / 2 - 10, h / 2 + 12, w / 2 + 40, h / 2 + 9, 2, 8, 1);
    txt(c, str, 0, fs * .36, fs, 800, pal.text, 'center'); c.restore();
  }, 60);
  ctx.restore();
}
const WATER = {
  lay(D) {
    const o = orient(D);
    if (o === 'p') return { o, logo: { cx: 905, top: 38, ww: 190 }, verse: { cx: 540, y: 292, w: 900 }, win: { x: 205, y: 640, w: 670, h: 760 },
      name: { cx: 660, y: 1520, k: 1 }, wave: { x: 440, y: 1588, w: 460, h: 34 }, phone: { x: 58, y: 1668, k: 1, al: 'left' }, soc: { x: 64, y: 1800, k: 1, al: 'left' }, qs: 1.2 };
    if (o === 'l') return { o, logo: { cx: 1730, top: 40, ww: 170 }, verse: { cx: 1420, y: 262, w: 800 }, win: { x: 150, y: 140, w: 760, h: 790 },
      name: { cx: 1420, y: 572, k: .9 }, wave: { x: 1200, y: 640, w: 440, h: 32 }, phone: { x: 1420, y: 730, k: .95, al: 'center' }, soc: { x: 1100, y: 880, k: .95, al: 'left' }, qs: .9 };
    if (D.h === D.w) return { o, logo: { cx: 975, top: 20, ww: 110 }, verse: { cx: 470, y: 30, w: 640 }, win: { x: 300, y: 250, w: 480, h: 540 },
      name: { cx: 640, y: 855, k: .72 }, wave: { x: 470, y: 900, w: 330, h: 26 }, phone: { x: 40, y: 975, k: .7, al: 'left' }, soc: { x: 1040, y: 985, k: .68, al: 'right' }, qs: .62 };
    return { o, logo: { cx: 965, top: 24, ww: 130 }, verse: { cx: 470, y: 40, w: 780 }, win: { x: 250, y: 310, w: 580, h: 690 },
      name: { cx: 640, y: 1072, k: .82 }, wave: { x: 450, y: 1124, w: 380, h: 30 }, phone: { x: 40, y: 1210, k: .82, al: 'left' }, soc: { x: 1040, y: 1222, k: .8, al: 'right' }, qs: .74 };
  },
  paper(x, P, D, L, cv) {
    x.fillStyle = P.c1; x.fillRect(0, 0, D.w, D.h);
    const blot = (bx, by, r, col, a) => { const g = x.createRadialGradient(bx, by, 0, bx, by, r); g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0)); x.fillStyle = g; x.fillRect(bx - r, by - r, 2 * r, 2 * r); };
    const W2 = L.win;
    blot(D.w * .1, D.h * .08, D.w * .5, P.c3, .12); blot(D.w * .95, D.h * .5, D.w * .45, P.c2, .1); blot(D.w * .15, D.h * .92, D.w * .5, P.c2, .1);
    blot(W2.x + W2.w / 2, W2.y + W2.h / 2, Math.max(W2.w, W2.h) * .75, P.c2, .12);
    x.strokeStyle = 'rgba(120,100,70,.05)'; x.lineWidth = 1;                // paper fibres
    for (let i = 0; i < 260; i++) { const fx = rnd(i * 1.7) * D.w, fy = rnd(i * 2.9) * D.h, a = rnd(i * 4.1) * TAU, l = 6 + rnd(i * 3.3) * 18; x.beginPath(); x.moveTo(fx, fy); x.lineTo(fx + Math.cos(a) * l, fy + Math.sin(a) * l); x.stroke(); }
    grain(x, cv, 14);
  },
  draw(ctx, P, t) {
    const D = dimsOf(P), L = this.lay(D), s = fstate(P, t), { b, m, id } = s, W2 = L.win;
    const bgA = P.bgIn ? EZ.out(S(b, 0, .2)) : 1;
    if (bgA <= .002) return;
    ctx.save(); ctx.globalAlpha *= bgA;
    blit(ctx, layer('water|' + P.c1 + P.c2 + P.c3, D, (x, cv) => this.paper(x, P, D, L, cv)), D);
    const wo = EZ.inOut(S(b, .06, .38));
    cut(ctx, () => { ctx.beginPath(); const w = W2.w * wo; ctx.rect(W2.x + (W2.w - w) / 2, W2.y, w, W2.h); }, 1);

    // thin painted lines around the page
    const lp = S(b, .02, .5), teal = P.c2, peach = P.c3, ink = P.c4;
    ctx.save(); ctx.lineCap = 'round';
    const curve = (pts, col, a, lw, p) => { if (p <= 0) return; ctx.strokeStyle = rgba(col, a); ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(...pts[0]); ctx.bezierCurveTo(...pts[1], ...pts[2], ...pts[3]); const len = 3000; ctx.setLineDash([len * p, len]); ctx.stroke(); ctx.setLineDash([]); };
    curve([[-20, D.h * .17], [D.w * .08, D.h * .05], [D.w * .2, D.h * .02], [D.w * .34, -20]], peach, .75, 3.5, EZ.out(lp));
    curve([[-20, D.h * .11], [D.w * .06, D.h * .03], [D.w * .14, D.h * .01], [D.w * .22, -20]], peach, .55, 2.5, EZ.out(S(b, .06, .52)));
    curve([[D.w - 44, D.h * .1], [D.w - 30, D.h * .4], [D.w - 60, D.h * .7], [D.w - 40, D.h + 20]], teal, .5, 3, EZ.out(S(b, .04, .56)));
    curve([[D.w - 22, D.h * .05], [D.w - 14, D.h * .35], [D.w - 34, D.h * .7], [D.w - 18, D.h + 20]], peach, .55, 2.5, EZ.out(S(b, .1, .6)));
    curve([[34, D.h * .38], [24, D.h * .55], [44, D.h * .75], [28, D.h + 20]], peach, .45, 2.5, EZ.out(S(b, .12, .62)));
    ctx.restore();

    // painted frame
    const fp = S(b, .12, .62), sides = (off, ext) => [[W2.x - off - ext, W2.y - off, W2.x + W2.w + off + ext, W2.y - off], [W2.x + W2.w + off, W2.y - off - ext, W2.x + W2.w + off, W2.y + W2.h + off + ext],
      [W2.x + W2.w + off + ext, W2.y + W2.h + off, W2.x - off - ext, W2.y + W2.h + off], [W2.x - off, W2.y + W2.h + off + ext, W2.x - off, W2.y - off - ext]];
    sides(30, 26).forEach((sd, i) => brushLine(ctx, ...sd, 40, teal, .62, 3 + i * 17, EZ.out(S(fp, i * .14, i * .14 + .5))));
    sides(17, 14).forEach((sd, i) => brushLine(ctx, ...sd, 20, shade(teal, 255, .3), .55, 41 + i * 13, EZ.out(S(fp, .1 + i * .14, .6 + i * .14))));
    ctx.save(); ctx.strokeStyle = rgba(shade(teal, 0, .35), .85); ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    sides(6, 34).forEach((sd, i) => roughLine(ctx, ...sd, 1.6, 7 + i, EZ.out(S(fp, .3 + i * .1, .7 + i * .1))));
    ctx.lineWidth = 1.6; sides(48, 10).forEach((sd, i) => { if (i % 2 === 0) roughLine(ctx, ...sd, 2.4, 19 + i, EZ.out(S(fp, .4 + i * .1, .8 + i * .1))); });
    ctx.restore();
    // cross stitches
    ctx.save(); ctx.strokeStyle = rgba(shade(teal, 0, .25), .9); ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    const xs = [];
    for (let yy = W2.y + W2.h * .32; yy < W2.y + W2.h * .95; yy += 32) xs.push([W2.x - 66, yy]);
    for (let xx = W2.x + W2.w * .25; xx < W2.x + W2.w + 10; xx += 32) xs.push([xx, W2.y + W2.h + 58]);
    xs.forEach(([xx, yy], i) => { const q = EZ.back(S(b, .4 + i / xs.length * .3, .48 + i / xs.length * .3), .8); if (q <= 0) return; const r = 7 * q; ctx.beginPath(); ctx.moveTo(xx - r, yy - r); ctx.lineTo(xx + r, yy + r); ctx.moveTo(xx + r, yy - r); ctx.lineTo(xx - r, yy + r); ctx.stroke(); });
    ctx.restore();
    // sprigs + blossoms
    const sw = i => Math.sin(t * 1.1 + i * 1.7) * .06 * id;
    const leaf = shade(teal, 0, .05), sp = S(b, .3, .8);
    sprig(ctx, W2.x - 40, W2.y + W2.h * .62, 150, Math.PI * 1.1, leaf, sp, sw(0));
    sprig(ctx, W2.x + W2.w + 26, W2.y + 30, 120, -.55, leaf, S(b, .36, .86), sw(1));
    sprig(ctx, D.w - 60, D.h - 40, 150, -Math.PI * .62, shade(peach, 0, .1), S(b, .44, .92), sw(2));
    blossom(ctx, W2.x + W2.w + 52, W2.y + 118, 16, peach, shade(peach, 0, .35), S(b, .45, .7), t * .2 * id);
    blossom(ctx, W2.x - 58, W2.y + W2.h * .78, 13, peach, shade(peach, 0, .35), S(b, .5, .75), -t * .2 * id);
    blossom(ctx, W2.x + W2.w + 64, W2.y + W2.h * .55, 10, shade(teal, 255, .2), shade(teal, 0, .3), S(b, .55, .8), t * .25 * id);
    // waveform + name + quran
    const pr = stdProgress(b);
    if (P.showWave) waveform(ctx, L.wave.x, L.wave.y, L.wave.w, L.wave.h, rgba(shade(peach, 0, .25), .9), pr.wave, s.play, t, id);
    brushPill(ctx, P.reciter, L.name.cx, L.name.y, L.name.k, { band: peach, line: shade(peach, 0, .25), text: ink }, pr.name);
    quranStand(ctx, W2.x + 30 * L.qs, W2.y + W2.h + 95 * L.qs, 1.05 * L.qs, S(b, .3, .62), Math.sin(t * 1.4) * 3 * id);
    // top: logo + verse
    if (P.showLogo) lockup(ctx, L.logo.cx, L.logo.top, L.logo.ww, { em: BRAND.gray, word: BRAND.gold, tag: BRAND.gold }, pr.logo, t, id, m);
    if (P.showVerse) verse(ctx, ink, L.verse.cx, L.verse.y, L.verse.w, pr.v1, pr.v2);
    // contact
    phonePill(ctx, P, L.phone.x, L.phone.y, L.phone.k, { pillFill: 'rgba(255,255,255,.55)', pillLine: shade(ink, 0, .2), phone: '#2A3735' }, pr.contact, L.phone.al);
    if (P.showSocial) socials(ctx, P, L.soc.x + (L.soc.al === 'left' ? 4 : 0), L.soc.y, L.soc.k, { chip: shade(ink, 0, .3), glyph: P.c1, text: '#33403E' }, pr.soc, L.soc.al, 2);
    // drifting petals
    if (P.particles) {
      for (let i = 0; i < 9; i++) {
        const u = frac(t * (.035 + .02 * rnd(i)) + rnd(i + 3)), px = rnd(i + 8) * D.w + Math.sin(t * .7 + i) * 30, py = -30 + u * (D.h + 60);
        blossom(ctx, px, py, 6 + 5 * rnd(i + 2), i % 2 ? rgba(peach, .7) : rgba(shade(teal, 255, .3), .7), 'rgba(255,255,255,.6)', EZ.out(S(b, .5, .9)) * Math.sin(Math.PI * u), t * .5 + i);
      }
    }
    ctx.restore();
  }
};

/* =========================================================
   03  GOLDEN MIHRAB   (remake of reference 3)
   curtains part, an ivory arch draws itself, the gold mihrab window opens, gold bokeh drifts over everything
   ========================================================= */
function mihrabPath(ctx, x, y, w, h, off) {
  const X = x - off, Y = y - off, Wd = w + 2 * off, Hd = h + 2 * off, cx = X + Wd / 2;
  const A = w * .44 + off * .2, B = w * .09 + off * .2, n = w * .05;
  ctx.beginPath(); ctx.moveTo(X, Y + Hd - B);
  ctx.lineTo(X, Y + A + n); safeArc(ctx, X, Y + A, n, Math.PI / 2, 0, true);
  ctx.bezierCurveTo(X + n, Y + A * .42, cx - Wd * .14, Y + A * .4, cx, Y);
  ctx.bezierCurveTo(cx + Wd * .14, Y + A * .4, X + Wd - n, Y + A * .42, X + Wd - n, Y + A);
  safeArc(ctx, X + Wd, Y + A, n, Math.PI, Math.PI / 2, true);
  ctx.lineTo(X + Wd, Y + Hd - B);
  ctx.bezierCurveTo(X + Wd * .8, Y + Hd - B, cx + Wd * .14, Y + Hd - B * .3, cx, Y + Hd);
  ctx.bezierCurveTo(cx - Wd * .14, Y + Hd - B * .3, X + Wd * .2, Y + Hd - B, X, Y + Hd - B);
  ctx.closePath();
}
function curtain(ctx, D, side, C, open, sway, base) {
  ctx.save(); if (side > 0) { ctx.translate(D.w, 0); ctx.scale(-1, 1); }
  const xIn = lerp(D.w / 2 + 8, C.reach, open), tx = lerp(D.w * .3, C.tieX, open), ty = C.tieY;
  const path = () => {
    ctx.beginPath(); ctx.moveTo(-40, -40); ctx.lineTo(xIn, -40);
    ctx.bezierCurveTo(xIn - 10 + sway, ty * .38, tx + (xIn - tx) * .4 + sway * .6, ty * .82, tx, ty);
    ctx.quadraticCurveTo(tx - 8, ty * 1.16, tx - 22, ty * 1.34); ctx.lineTo(-40, ty * 1.38); ctx.closePath();
  };
  shadow(ctx, 'rgba(0,0,0,.55)', 34, 10, 8); path();
  const g = ctx.createLinearGradient(0, 0, xIn, 0); g.addColorStop(0, shade(base, 0, .5)); g.addColorStop(.6, base); g.addColorStop(1, shade(base, 255, .3));
  ctx.fillStyle = g; ctx.fill(); noShadow(ctx);
  ctx.save(); path(); ctx.clip();
  for (let i = 0; i < 11; i++) {                                // folds gathering into the tie
    const u = (i + .5) / 11, xt = xIn * u, light = i % 2 === 0;
    ctx.strokeStyle = light ? rgba(shade(base, 255, .55), .32) : 'rgba(30,18,0,.34)'; ctx.lineWidth = (light ? 10 : 16) + 10 * rnd(i + 2);
    ctx.beginPath(); ctx.moveTo(xt, -30); ctx.quadraticCurveTo(xt * .75 + tx * .25 + sway * u, ty * .55, tx - 14 + 26 * u, ty + 6); ctx.lineTo(tx - 30 + 20 * u, ty * 1.36); ctx.stroke();
  }
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) drawLogo(ctx, 'emblem', shade(base, 255, .6), 60 + i * 120 + (j % 2) * 60, 40 + j * 110, 70, .08);
  ctx.restore();
  ctx.save(); ctx.translate(tx, ty); ctx.rotate(-.5);                // tie band + tassel
  const tg = ctx.createLinearGradient(0, -12, 0, 12); tg.addColorStop(0, shade(base, 255, .7)); tg.addColorStop(1, shade(base, 0, .2));
  ctx.fillStyle = tg; rr(ctx, -34, -9, 68, 18, 9); ctx.fill(); ctx.restore();
  ctx.strokeStyle = shade(base, 255, .5); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tx - 6, ty + 6); ctx.lineTo(tx - 10 + sway * .2, ty + 60); ctx.stroke();
  ctx.fillStyle = shade(base, 255, .55); ctx.beginPath(); ctx.ellipse(tx - 10 + sway * .2, ty + 72, 7, 14, 0, 0, TAU); ctx.fill();
  ctx.restore();
}
function ogeeBand(ctx, D, y0, peak, col, p) {
  if (p <= 0) return;
  const cx = D.w / 2, span = D.w / 2 - D.w * .035;
  const half = sg => { ctx.beginPath(); ctx.moveTo(cx, peak); ctx.bezierCurveTo(cx + sg * D.w * .05, peak + (y0 - peak) * .6, cx + sg * span * .55, y0 - (y0 - peak) * .12, cx + sg * span, y0); };
  const len = 1500, e = EZ.inOut(p);
  ctx.save(); ctx.lineCap = 'round';
  for (const sg of [-1, 1]) {
    ctx.setLineDash([len * e, len]);
    shadow(ctx, 'rgba(0,0,0,.45)', 14, 6); half(sg); ctx.strokeStyle = shade(col, 0, .3); ctx.lineWidth = 20; ctx.stroke(); noShadow(ctx);
    half(sg); ctx.strokeStyle = col; ctx.lineWidth = 13; ctx.stroke();
    half(sg); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.setLineDash([]);
    if (e > .97) {                                            // curls at both ends
      const ex = cx + sg * span, a = S(e, .97, 1);
      ctx.globalAlpha *= a; ctx.strokeStyle = col; ctx.lineWidth = 9;
      ctx.beginPath(); for (let k = 0; k <= 24; k++) { const th = k / 24 * 4.6, r = 26 * (1 - k / 30), px = ex - sg * (r * Math.cos(th) - 26), py = y0 + r * Math.sin(th) - 2; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.stroke();
      ctx.globalAlpha /= Math.max(.001, a);
    }
  }
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(cx, peak - 34 * e); ctx.lineTo(cx + 9, peak - 6); ctx.lineTo(cx - 9, peak - 6); ctx.closePath(); ctx.fill();
  ctx.restore();
}
const MIHRAB = {
  lay(D) {
    const o = orient(D);
    if (o === 'p') return { o, curt: { reach: 420, tieX: 26, tieY: 430 }, arch: { y0: 352, peak: 34 }, logo: { cx: 540, top: 118, ww: 160 }, verse: { cx: 540, y: 380, w: 870 }, win: { x: 150, y: 700, w: 780, h: 1075 }, soc: { y: 1872, k: .82 } };
    if (o === 'l') return { o, curt: { reach: 360, tieX: 22, tieY: 330 }, arch: null, logo: { cx: 560, top: 250, ww: 190 }, verse: { cx: 560, y: 560, w: 780 }, win: { x: 1170, y: 140, w: 540, h: 830 }, soc: { x: 560, y: 990, k: .82 } };
    if (D.h === D.w) return { o, curt: { reach: 360, tieX: 18, tieY: 250 }, arch: { y0: 206, peak: 18 }, logo: { cx: 540, top: 44, ww: 98 }, verse: { cx: 540, y: 200, w: 600 }, win: { x: 345, y: 420, w: 390, h: 545 }, soc: { y: 1050, k: .62 } };
    return { o, curt: { reach: 380, tieX: 20, tieY: 300 }, arch: { y0: 250, peak: 22 }, logo: { cx: 540, top: 62, ww: 120 }, verse: { cx: 540, y: 255, w: 720 }, win: { x: 280, y: 515, w: 520, h: 735 }, soc: { y: 1316, k: .7 } };
  },
  bg(x, P, D) {
    const g = x.createLinearGradient(0, 0, 0, D.h); g.addColorStop(0, shade(P.c1, 255, .08)); g.addColorStop(1, shade(P.c1, 0, .35)); x.fillStyle = g; x.fillRect(0, 0, D.w, D.h);
    const sz = 230, cols = Math.ceil(D.w / sz) + 1, rows = Math.ceil(D.h / sz) + 1;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) drawLogo(x, 'emblem', shade(P.c1, 255, .3), i * sz + (j % 2) * sz / 2, j * sz, sz * .72, .07);
    const v = x.createRadialGradient(D.w / 2, D.h * .55, Math.min(D.w, D.h) * .2, D.w / 2, D.h * .55, Math.max(D.w, D.h) * .75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.45)'); x.fillStyle = v; x.fillRect(0, 0, D.w, D.h);
  },
  draw(ctx, P, t) {
    const D = dimsOf(P), L = this.lay(D), s = fstate(P, t), { b, m, id } = s, W2 = L.win;
    const bgA = P.bgIn ? EZ.out(S(b, 0, .2)) : 1;
    if (bgA <= .002) return;
    ctx.save(); ctx.globalAlpha *= bgA;
    const gold = P.c2, ivory = P.c3;
    blit(ctx, layer('mih|' + P.c1, D, x => this.bg(x, P, D)), D);
    // window frame layers, then the hole
    const fp = EZ.out(S(b, .14, .5)), wcx = W2.x + W2.w / 2, wcy = W2.y + W2.h / 2;
    if (fp > .002) {
      ctx.save(); ctx.globalAlpha *= fp; ctx.translate(wcx, wcy); const sc = lerp(.94, 1, fp); ctx.scale(sc, sc); ctx.translate(-wcx, -wcy);
      shadow(ctx, 'rgba(0,0,0,.55)', 40, 14);
      mihrabPath(ctx, W2.x, W2.y, W2.w, W2.h, 50); ctx.fillStyle = metalV(ctx, W2.y - 50, W2.y + W2.h + 50, shade(gold, 255, .2)); ctx.fill(); noShadow(ctx);
      mihrabPath(ctx, W2.x, W2.y, W2.w, W2.h, 38); ctx.fillStyle = shade(gold, 0, .72); ctx.fill();
      mihrabPath(ctx, W2.x, W2.y, W2.w, W2.h, 30); ctx.fillStyle = metalV(ctx, W2.y - 30, W2.y + W2.h + 30, gold); ctx.fill();
      mihrabPath(ctx, W2.x, W2.y, W2.w, W2.h, 16); ctx.fillStyle = shade(gold, 0, .8); ctx.fill();
      mihrabPath(ctx, W2.x, W2.y, W2.w, W2.h, 7); ctx.strokeStyle = shade(gold, 255, .45); ctx.lineWidth = 3; ctx.stroke();
      ctx.restore();
    }
    const wo = EZ.inOut(S(b, .22, .52));
    cut(ctx, () => mihrabPath(ctx, W2.x, W2.y, W2.w, W2.h, 0), wo);
    const tr = S(b, .06, .46);                                       // bright line tracing the outline
    if (tr > 0 && tr < 1) { ctx.save(); mihrabPath(ctx, W2.x, W2.y, W2.w, W2.h, 52); const per = 2 * (W2.w + W2.h) * 1.35; ctx.setLineDash([per * EZ.inOut(tr), per]); ctx.strokeStyle = shade(gold, 255, .6); ctx.lineWidth = 3; shadow(ctx, gold, 14); ctx.stroke(); ctx.restore(); }
    if (id > .02) {                                                  // a glint running round the frame
      ctx.save(); mihrabPath(ctx, W2.x, W2.y, W2.w, W2.h, 30); const per = 2 * (W2.w + W2.h) * 1.35;
      ctx.setLineDash([180, per]); ctx.lineDashOffset = -((t * 240) % per); ctx.strokeStyle = `rgba(255,248,220,${.85 * id})`; ctx.lineWidth = 4; shadow(ctx, '#fff2c0', 12); ctx.stroke(); ctx.restore();
    }
    // reciter plaque on the window's bottom edge
    const pr = stdProgress(b);
    plaque(ctx, P.reciter, wcx, W2.y + W2.h + 6, Math.min(1, W2.w / 700), { fill: shade(P.c1, 0, .35), line: gold, text: shade(gold, 255, .35) }, pr.name);
    // curtains, arch, logo, verse
    const op = EZ.inOut(S(b, 0, .42)), sway = Math.sin(t * .8) * 14 * id;
    curtain(ctx, D, -1, L.curt, op, sway, P.c4); curtain(ctx, D, 1, L.curt, op, -sway, P.c4);
    if (L.arch) ogeeBand(ctx, D, L.arch.y0, L.arch.peak, ivory, S(b, .14, .5));
    if (P.showLogo) { ctx.save(); shadow(ctx, 'rgba(0,0,0,.4)', 10, 3); lockup(ctx, L.logo.cx, L.logo.top, L.logo.ww, { em: ivory, word: ivory, tag: ivory }, pr.logo, t, id, m); ctx.restore(); }
    if (P.showVerse) verse(ctx, metal(gold), L.verse.cx, L.verse.y, L.verse.w, pr.v1, pr.v2, 'rgba(0,0,0,.55)', 8);
    if (P.showSocial || P.showContact) socials(ctx, P, L.soc.x || D.w / 2, L.soc.y, L.soc.k, { chip: ivory, glyph: shade(P.c1, 0, .3), text: ivory, phone: ivory }, pr.soc, 'center', 1, D.w * .9, true);
    // gold bokeh over everything
    if (P.particles) {
      const a = EZ.out(S(b, .2, .7));
      bokeh(ctx, { x: 0, y: 0, w: D.w, h: D.h }, t, 22, shade(gold, 255, .35), .55 * a, 3, 8, 34, 22, true);
      bokeh(ctx, { x: 0, y: 0, w: D.w, h: D.h }, t, 26, '#FFF1C8', .9 * a, 21, 2, 5, 34, false);
      bokeh(ctx, { x: 0, y: D.h * .7, w: D.w * .35, h: D.h * .3 }, t, 5, '#FFF6E0', .4 * a, 41, 50, 90, 8, true);
    }
    ctx.restore();
  }
};

/* =========================================================
   04  STAR GIRIH   (new)
   an 8-point star lattice ripples out over navy, the window irises open, gold medallions spin into its corners
   ========================================================= */
function notchRect(ctx, x, y, w, h, rc, off) {
  const X0 = x - off, Y0 = y - off, X1 = x + w + off, Y1 = y + h + off, r = Math.max(2, rc - off);
  ctx.beginPath(); ctx.moveTo(X0 + r, Y0); ctx.lineTo(X1 - r, Y0); safeArc(ctx, X1, Y0, r, Math.PI, Math.PI / 2, true);
  ctx.lineTo(X1, Y1 - r); safeArc(ctx, X1, Y1, r, 1.5 * Math.PI, Math.PI, true);
  ctx.lineTo(X0 + r, Y1); safeArc(ctx, X0, Y1, r, 0, -Math.PI / 2, true);
  ctx.lineTo(X0, Y0 + r); safeArc(ctx, X0, Y0, r, Math.PI / 2, 0, true); ctx.closePath();
}
const GIRIH = {
  lay(D) {
    const o = orient(D);
    if (o === 'p') return { o, verse: { cx: 540, y: 104, w: 900 }, win: { x: 120, y: 430, w: 840, h: 1000 }, block: { cx: 540, y: 1548, k: .9 } };
    if (o === 'l') return { o, win: { x: 110, y: 110, w: 990, h: 860 }, col: { cx: 1510, y: 70, w: 700 } };
    if (D.h === D.w) return { o, verse: { cx: 540, y: 30, w: 600 }, win: { x: 300, y: 250, w: 480, h: 535 }, block: { cx: 540, y: 852, k: .52 } };
    return { o, verse: { cx: 540, y: 38, w: 760 }, win: { x: 230, y: 300, w: 620, h: 715 }, block: { cx: 540, y: 1106, k: .58 } };
  },
  draw(ctx, P, t) {
    const D = dimsOf(P), L = this.lay(D), s = fstate(P, t), { b, m, id } = s, W2 = L.win;
    const bgA = P.bgIn ? EZ.out(S(b, 0, .2)) : 1;
    if (bgA <= .002) return;
    ctx.save(); ctx.globalAlpha *= bgA;
    const navy = P.c1, gold = P.c2, ivory = P.c3, wcx = W2.x + W2.w / 2, wcy = W2.y + W2.h / 2, spread = Math.hypot(D.w, D.h) * .62;
    blit(ctx, layer('gir-bg|' + navy + gold, D, x => {
      const g = x.createRadialGradient(wcx, wcy, 0, wcx, wcy, Math.max(D.w, D.h) * .8); g.addColorStop(0, shade(navy, 255, .14)); g.addColorStop(1, shade(navy, 0, .4));
      x.fillStyle = g; x.fillRect(0, 0, D.w, D.h);
      const gl = x.createRadialGradient(wcx, wcy, Math.min(W2.w, W2.h) * .3, wcx, wcy, Math.max(W2.w, W2.h) * .9); gl.addColorStop(0, rgba(gold, .22)); gl.addColorStop(1, rgba(gold, 0));
      x.fillStyle = gl; x.fillRect(0, 0, D.w, D.h);
    }), D);
    const pp = S(b, 0, .55);
    if (pp >= 1) blit(ctx, layer('gir-pat|' + gold, D, x => { x.strokeStyle = rgba(gold, .17); starLattice(x, 0, 0, D.w, D.h, 96, wcx, wcy, 1, spread, 1.6); }), D);
    else if (pp > 0) { ctx.save(); ctx.strokeStyle = rgba(gold, .17); starLattice(ctx, 0, 0, D.w, D.h, 96, wcx, wcy, pp, spread, 1.6); ctx.restore(); }
    if (id > .02) {                                                   // light ring radiating from the window
      const u = frac(t / 5), R = lerp(Math.min(W2.w, W2.h) * .4, spread * 1.3, u), wd = 140;
      ctx.save(); ctx.beginPath(); safeArc(ctx, wcx, wcy, R + wd, 0, TAU); safeArc(ctx, wcx, wcy, Math.max(1, R - wd), 0, TAU, true); ctx.clip();
      ctx.globalAlpha *= id * (1 - u); blit(ctx, layer('gir-pat2|' + gold, D, x => { x.strokeStyle = rgba(shade(gold, 255, .5), .7); starLattice(x, 0, 0, D.w, D.h, 96, wcx, wcy, 1, spread, 2); }), D); ctx.restore();
    }
    // frame band
    const rc = Math.min(58, Math.min(W2.w, W2.h) * .075), bp = EZ.inOut(S(b, .2, .6)), per = 2 * (W2.w + W2.h) + 400;
    ctx.save(); shadow(ctx, 'rgba(0,0,0,.5)', 30, 10); notchRect(ctx, W2.x, W2.y, W2.w, W2.h, rc + 40, 36); ctx.fillStyle = rgba(shade(navy, 0, .5), .85 * EZ.out(S(b, .15, .5))); ctx.fill(); noShadow(ctx);
    ctx.lineJoin = 'round';
    for (const [off, lw, a] of [[34, 2.6, 1], [22, 1.4, .8], [8, 3, 1]]) { notchRect(ctx, W2.x, W2.y, W2.w, W2.h, rc + 40, off); ctx.setLineDash([per * bp, per]); ctx.strokeStyle = rgba(gold, a); ctx.lineWidth = lw; ctx.stroke(); }
    ctx.setLineDash([]);
    const dp = S(b, .4, .75);                                        // small diamonds between the band lines
    if (dp > 0) {
      ctx.fillStyle = gold; const step = 30, segs = [[W2.x + rc + 30, W2.y - 28, W2.x + W2.w - rc - 30, W2.y - 28], [W2.x + rc + 30, W2.y + W2.h + 28, W2.x + W2.w - rc - 30, W2.y + W2.h + 28], [W2.x - 28, W2.y + rc + 30, W2.x - 28, W2.y + W2.h - rc - 30], [W2.x + W2.w + 28, W2.y + rc + 30, W2.x + W2.w + 28, W2.y + W2.h - rc - 30]];
      segs.forEach(([x0, y0, x1, y1]) => { const len = Math.hypot(x1 - x0, y1 - y0), n = Math.floor(len / step); for (let i = 0; i <= n; i++) { const u = i / n, q = EZ.back(S(dp, Math.abs(u - .5) * .6, Math.abs(u - .5) * .6 + .4), .8); if (q <= 0) continue; const px = lerp(x0, x1, u), py = lerp(y0, y1, u), r = 4.5 * q; ctx.beginPath(); ctx.moveTo(px, py - r); ctx.lineTo(px + r, py); ctx.lineTo(px, py + r); ctx.lineTo(px - r, py); ctx.closePath(); ctx.fill(); } });
    }
    if (id > .02) { notchRect(ctx, W2.x, W2.y, W2.w, W2.h, rc + 40, 34); ctx.setLineDash([220, per]); ctx.lineDashOffset = -((t * 300) % per); ctx.strokeStyle = `rgba(255,246,214,${id})`; ctx.lineWidth = 4; shadow(ctx, gold, 14); ctx.stroke(); }
    ctx.restore();
    // window iris
    const wo = Math.min(1, EZ.back(S(b, .16, .5), m * .5));
    cut(ctx, () => { ctx.save(); ctx.translate(wcx, wcy); ctx.scale(Math.max(.001, wo), Math.max(.001, wo)); ctx.translate(-wcx, -wcy); notchRect(ctx, W2.x, W2.y, W2.w, W2.h, rc, 0); ctx.restore(); }, Math.min(1, wo * 3));
    // corner medallions
    const mr = rc + 16;
    [[W2.x, W2.y], [W2.x + W2.w, W2.y], [W2.x + W2.w, W2.y + W2.h], [W2.x, W2.y + W2.h]].forEach(([mx, my], i) => {
      const q = EZ.back(S(b, .34 + i * .05, .64 + i * .05), m); if (q <= .01) return;
      ctx.save(); ctx.translate(mx, my); ctx.scale(q, q); ctx.rotate((1 - q) * 2.4);
      shadow(ctx, 'rgba(0,0,0,.5)', 18, 6); const g = ctx.createRadialGradient(-mr * .3, -mr * .3, 2, 0, 0, mr); g.addColorStop(0, shade(navy, 255, .2)); g.addColorStop(1, shade(navy, 0, .3));
      ctx.fillStyle = g; ctx.beginPath(); safeArc(ctx, 0, 0, mr, 0, TAU); ctx.fill(); noShadow(ctx);
      ctx.strokeStyle = metalV(ctx, -mr, mr, gold); ctx.lineWidth = 4; ctx.beginPath(); safeArc(ctx, 0, 0, mr - 3, 0, TAU); ctx.stroke();
      ctx.strokeStyle = rgba(gold, .6); ctx.lineWidth = 1.2; ctx.beginPath(); safeArc(ctx, 0, 0, mr - 10, 0, TAU); ctx.stroke();
      drawLogo(ctx, 'emblem', shade(gold, 255, .2), 0, 0, (mr - 12) * 1.9, 1, t * .25 * id * (i % 2 ? -1 : 1));
      ctx.restore();
    });
    // text + info
    const pr = stdProgress(b), pal = { verse: ivory, support: gold, phone: ivory, chip: gold, glyph: shade(navy, 0, .3), text: ivory, wave: gold, name: gold, logo: { em: gold, word: ivory, tag: ivory } };
    if (L.o === 'l') { ctx.save(); ctx.translate(L.col.cx, L.col.y); stackBlock(ctx, P, s, pal, pr, L.col.w); ctx.restore(); }
    else {
      if (P.showVerse) verse(ctx, ivory, L.verse.cx, L.verse.y, L.verse.w, pr.v1, pr.v2, rgba(gold, .35), 14);
      const P2 = { ...P, showVerse: false };                          // verse sits above the window, the rest of the row block below it
      ctx.save(); ctx.translate(L.block.cx, L.block.y); ctx.scale(L.block.k, L.block.k); ctx.translate(0, -90); rowBlock(ctx, P2, s, pal, pr); ctx.restore();
    }
    if (P.particles) bokeh(ctx, { x: 0, y: 0, w: D.w, h: D.h }, t, 30, shade(gold, 255, .4), .85 * EZ.out(S(b, .3, .8)), 61, 2, 5, 18, false);
    ctx.restore();
  }
};

/* =========================================================
   05  SAND ARCH   (new, minimal)
   a modern arch window rises out of sand, a gold outline traces it, a terracotta sun slides in behind
   ========================================================= */
function archPath(ctx, x, y, w, h, off, grow = 1) {        // grow < 1: only the bottom part, revealed by a clip rising from the base
  const X = x - off, Wd = w + 2 * off, r = Wd / 2, bottom = y + h + off, top = y - off;
  if (grow < 1) { ctx.beginPath(); ctx.rect(X - 2, bottom - (bottom - top) * grow, Wd + 4, (bottom - top) * grow + 2); ctx.clip(); }
  ctx.beginPath(); ctx.moveTo(X, bottom); ctx.lineTo(X, top + r); safeArc(ctx, X + r, top + r, r, Math.PI, 0);
  ctx.lineTo(X + Wd, bottom); ctx.closePath();
}
const ARCH = {
  lay(D) {
    const o = orient(D);
    if (o === 'p') return { o, logo: { cx: 540, top: 64, ww: 150 }, verse: { cx: 540, y: 290, w: 860 }, win: { x: 160, y: 590, w: 760, h: 970 }, sun: { x: 860, y: 690, r: 150 }, ring: { x: 190, y: 1500, r: 105 }, wave: { cx: 540, y: 1604, w: 420, h: 32 }, contact: { y: 1650, k: .9 }, soc: { y: 1862, k: .82 } };
    if (o === 'l') return { o, logo: { cx: 1360, top: 60, ww: 160 }, verse: { cx: 1360, y: 316, w: 820 }, win: { x: 200, y: 110, w: 620, h: 880 }, sun: { x: 780, y: 230, r: 130 }, ring: { x: 230, y: 930, r: 90 }, wave: { cx: 1360, y: 584, w: 420, h: 30 }, contact: { y: 640, k: .9 }, soc: { y: 900, k: .82, cx: 1360 }, cx: 1360 };
    if (D.h === D.w) return { o, logo: { cx: 540, top: 22, ww: 86 }, verse: { cx: 540, y: 136, w: 560 }, win: { x: 370, y: 318, w: 340, h: 520 }, sun: { x: 690, y: 370, r: 80 }, ring: { x: 380, y: 800, r: 60 }, wave: { cx: 540, y: 866, w: 300, h: 24 }, contact: { y: 900, k: .62 }, soc: { y: 1046, k: .6 } };
    return { o, logo: { cx: 540, top: 30, ww: 110 }, verse: { cx: 540, y: 178, w: 700 }, win: { x: 300, y: 405, w: 480, h: 690 }, sun: { x: 770, y: 470, r: 110 }, ring: { x: 310, y: 1050, r: 75 }, wave: { cx: 540, y: 1128, w: 340, h: 26 }, contact: { y: 1166, k: .72 }, soc: { y: 1316, k: .66 } };
  },
  draw(ctx, P, t) {
    const D = dimsOf(P), L = this.lay(D), s = fstate(P, t), { b, m, id } = s, W2 = L.win, cx = L.cx || D.w / 2;
    const bgA = P.bgIn ? EZ.out(S(b, 0, .2)) : 1;
    if (bgA <= .002) return;
    ctx.save(); ctx.globalAlpha *= bgA;
    const sand = P.c1, sage = P.c2, sun = P.c3, gold = P.c4;
    blit(ctx, layer('arch|' + sand, D, (x, cv) => {
      const g = x.createLinearGradient(0, 0, 0, D.h); g.addColorStop(0, shade(sand, 255, .25)); g.addColorStop(1, shade(sand, 0, .06)); x.fillStyle = g; x.fillRect(0, 0, D.w, D.h); grain(x, cv, 7);
    }), D);
    // watermark emblem, slowly turning
    drawLogo(ctx, 'emblem', sage, W2.x + W2.w / 2, W2.y + W2.h * .55, Math.max(W2.w, W2.h) * 1.15, .07 * EZ.out(S(b, 0, .4)), t * .03 * (.3 + id));
    // sun disc + ring
    const sp = EZ.back(S(b, .1, .45), m * .6), fl = Math.sin(t * .7) * 8 * id;
    if (sp > .002) { ctx.save(); ctx.globalAlpha *= Math.min(1, sp); const g = ctx.createLinearGradient(0, L.sun.y - L.sun.r, 0, L.sun.y + L.sun.r); g.addColorStop(0, shade(sun, 255, .18)); g.addColorStop(1, shade(sun, 0, .1)); ctx.fillStyle = g; ctx.beginPath(); safeArc(ctx, L.sun.x, L.sun.y + (1 - sp) * 160 + fl, L.sun.r, 0, TAU); ctx.fill(); ctx.restore(); }
    const rp = EZ.inOut(S(b, .3, .7));
    if (rp > 0) { ctx.save(); ctx.strokeStyle = rgba(sage, .5); ctx.lineWidth = 2.5; ctx.beginPath(); safeArc(ctx, L.ring.x, L.ring.y - fl * .6, L.ring.r, -Math.PI / 2, -Math.PI / 2 + TAU * rp); ctx.stroke(); ctx.restore(); }
    // soft shadow under the arch, then the hole growing upward
    const grow = EZ.inOut(S(b, .08, .46));
    if (grow > .002) { ctx.save(); shadow(ctx, rgba(shade(sand, 0, .55), .55), 50, 22); archPath(ctx, W2.x, W2.y, W2.w, W2.h, 0, grow); ctx.fillStyle = shade(sand, 0, .05); ctx.fill(); ctx.restore(); }
    cut(ctx, () => archPath(ctx, W2.x, W2.y, W2.w, W2.h, 0, grow), grow > .002 ? 1 : 0);
    // gold outline traced from both bottom corners up to the top
    const op = EZ.inOut(S(b, .22, .66)), off = 20 * (W2.w / 760 + .4);
    if (op > 0) {
      ctx.save(); ctx.strokeStyle = gold; ctx.lineWidth = 3; ctx.lineCap = 'round';
      const r = W2.w / 2 + off, cy = W2.y + r - off, X = W2.x - off, B = W2.y + W2.h + off, side = B - cy, len = side + Math.PI * r / 2, e = len * op;
      for (const sg of [-1, 1]) {
        const x0 = sg < 0 ? X : X + 2 * r; ctx.beginPath(); ctx.moveTo(x0, B); ctx.lineTo(x0, B - Math.min(e, side));
        if (e > side) { const a = (e - side) / r; if (sg < 0) safeArc(ctx, X + r, cy, r, Math.PI, Math.PI + a); else safeArc(ctx, X + r, cy, r, 0, -a, true); }
        ctx.stroke();
      }
      if (id > .02) {                                              // a bead of light travelling over the outline
        const a2 = frac(t / 4.5) * 2 * len, left = a2 < len, d = left ? a2 : 2 * len - a2;     // up the left side, over the top, down the right
        let px, py;
        if (d < side) { px = left ? X : X + 2 * r; py = B - d; }
        else { const th = (d - side) / r; px = left ? X + r - r * Math.cos(th) : X + r + r * Math.cos(th); py = cy - r * Math.sin(th); }
        shadow(ctx, '#fff', 14); ctx.fillStyle = `rgba(255,255,255,${id})`; ctx.beginPath(); safeArc(ctx, px, py, 5, 0, TAU); ctx.fill(); noShadow(ctx);
      }
      ctx.restore();
    }
    // name pill on the arch's base
    const pr = stdProgress(b);
    if (P.reciter && pr.name > 0) {
      const k = Math.min(1, W2.w / 700), fs = 36, w = textW(ctx, P.reciter, fs, 800) + 70, h = 62, a = EZ.out(pr.name);
      ctx.save(); ctx.translate(W2.x + W2.w / 2, W2.y + W2.h); ctx.scale(k, k); ctx.globalAlpha *= a; ctx.translate(0, (1 - a) * 20);
      rr(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fillStyle = sage; ctx.fill(); txt(ctx, P.reciter, 0, fs * .36, fs, 800, sand, 'center'); ctx.restore();
    }
    // logo, verse, info
    if (P.showLogo) lockup(ctx, L.logo.cx, L.logo.top, L.logo.ww, { em: sage, word: gold, tag: shade(sage, 0, .1) }, pr.logo, t, id, m);
    if (P.showVerse) verse(ctx, shade(sage, 0, .15), L.verse.cx, L.verse.y, L.verse.w, pr.v1, pr.v2);
    if (P.showWave) waveform(ctx, L.wave.cx - L.wave.w / 2, L.wave.y, L.wave.w, L.wave.h, sun, pr.wave, s.play, t, id);
    contact(ctx, P, cx, L.contact.y, L.contact.k, { support: shade(sun, 0, .1), phone: shade(sage, 0, .3) }, pr.contact);
    if (P.showSocial) socials(ctx, P, L.soc.cx || cx, L.soc.y, L.soc.k, { chip: sage, glyph: sand, text: shade(sage, 0, .3) }, pr.soc, 'center', 1, D.w * .92);
    if (P.particles) bokeh(ctx, { x: 0, y: 0, w: D.w, h: D.h }, t, 16, shade(sun, 255, .35), .5 * EZ.out(S(b, .3, .8)), 77, 3, 9, 14, true);
    ctx.restore();
  }
};

/* =========================================================
   06  NIGHT LANTERNS   (new)
   a starry night: lanterns drop in on chains and swing, the dome window glows open over a mosque skyline
   ========================================================= */
function domePath(ctx, x, y, w, h, off) {
  const X = x - off, Y = y - off, Wd = w + 2 * off, Hd = h + 2 * off, cx = X + Wd / 2, A = w * .5 + off * .3;
  ctx.beginPath(); ctx.moveTo(X, Y + Hd); ctx.lineTo(X, Y + A);
  ctx.bezierCurveTo(X - Wd * .07, Y + A * .5, cx - Wd * .04, Y + A * .36, cx, Y);
  ctx.bezierCurveTo(cx + Wd * .04, Y + A * .36, X + Wd + Wd * .07, Y + A * .5, X + Wd, Y + A);
  ctx.lineTo(X + Wd, Y + Hd); ctx.closePath();
}
function lantern(ctx, px, len, s, ang, glowA, flick, gold) {
  ctx.save(); ctx.translate(px, -10); ctx.rotate(ang);
  ctx.strokeStyle = shade(gold, 0, .35); ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, len); ctx.stroke();
  ctx.translate(0, len); ctx.scale(s, s);
  const body = shade(gold, 0, .25), dark = shade(gold, 0, .6);
  if (glowA > .01) {                                              // light spilling out
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(0, 105, 10, 0, 105, 210);
    g.addColorStop(0, `rgba(255,190,90,${.42 * glowA * flick})`); g.addColorStop(1, 'rgba(255,170,60,0)'); ctx.fillStyle = g; ctx.fillRect(-210, -105, 420, 420); ctx.restore();
  }
  ctx.strokeStyle = body; ctx.lineWidth = 3; ctx.beginPath(); safeArc(ctx, 0, 8, 8, 0, TAU); ctx.stroke();
  ctx.fillStyle = metalV(ctx, 14, 50, gold); ctx.beginPath(); ctx.moveTo(-8, 16); ctx.quadraticCurveTo(-38, 34, -40, 50); ctx.lineTo(40, 50); ctx.quadraticCurveTo(38, 34, 8, 16); ctx.closePath(); ctx.fill();
  ctx.fillStyle = body; ctx.fillRect(-44, 50, 88, 9);
  const gg = ctx.createRadialGradient(0, 104, 4, 0, 104, 58); gg.addColorStop(0, `rgba(255,248,215,${.95 * flick})`); gg.addColorStop(.5, `rgba(255,196,96,${.9 * flick})`); gg.addColorStop(1, 'rgba(190,100,30,.9)');
  ctx.fillStyle = gg; ctx.beginPath(); ctx.moveTo(-42, 59); ctx.lineTo(42, 59); ctx.lineTo(50, 104); ctx.lineTo(42, 150); ctx.lineTo(-42, 150); ctx.lineTo(-50, 104); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = dark; ctx.lineWidth = 3; ctx.stroke();
  ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(-17, 59); ctx.lineTo(-19, 150); ctx.moveTo(17, 59); ctx.lineTo(19, 150); ctx.moveTo(-50, 104); ctx.lineTo(50, 104); ctx.stroke();
  ctx.beginPath(); for (const xx of [-30, 0, 30]) { ctx.moveTo(xx - 9, 100); ctx.lineTo(xx - 9, 80); ctx.quadraticCurveTo(xx, 66, xx + 9, 80); ctx.lineTo(xx + 9, 100); } ctx.stroke();
  ctx.fillStyle = body; ctx.fillRect(-44, 150, 88, 9);
  ctx.fillStyle = metalV(ctx, 159, 196, gold); ctx.beginPath(); ctx.moveTo(-40, 159); ctx.lineTo(40, 159); ctx.lineTo(10, 194); ctx.lineTo(-10, 194); ctx.closePath(); ctx.fill();
  ctx.beginPath(); safeArc(ctx, 0, 202, 7, 0, TAU); ctx.fill();
  ctx.restore();
}
function skyline(ctx, x0, w, base, k, col) {
  const u = v => x0 + v * w;
  ctx.fillStyle = col; ctx.beginPath(); ctx.rect(x0 - 20, base, w + 40, 900);
  ctx.rect(x0 - 20, base - 46 * k, w + 40, 50 * k);
  const minaret = (cxm, hgt) => {
    const sw = 30 * k; ctx.rect(cxm - sw / 2, base - hgt, sw, hgt); ctx.rect(cxm - sw * .9, base - hgt * .72, sw * 1.8, 12 * k);
    ctx.rect(cxm - sw * .38, base - hgt - 46 * k, sw * .76, 48 * k); ctx.moveTo(cxm - sw * .5, base - hgt - 44 * k); ctx.lineTo(cxm, base - hgt - 100 * k); ctx.lineTo(cxm + sw * .5, base - hgt - 44 * k); ctx.closePath();
  };
  const dome = (cxd, r, drum) => {
    ctx.rect(cxd - r, base - drum, 2 * r, drum + 2);
    ctx.moveTo(cxd - r, base - drum); ctx.bezierCurveTo(cxd - r * 1.15, base - drum - r * .9, cxd - r * .2, base - drum - r * 1.05, cxd, base - drum - r * 1.55);
    ctx.bezierCurveTo(cxd + r * .2, base - drum - r * 1.05, cxd + r * 1.15, base - drum - r * .9, cxd + r, base - drum); ctx.closePath();
    ctx.rect(cxd - 2 * k, base - drum - r * 1.55 - 26 * k, 4 * k, 28 * k);
  };
  minaret(u(.12), 330 * k); minaret(u(.88), 330 * k); dome(u(.5), 125 * k, 80 * k); dome(u(.28), 58 * k, 70 * k); dome(u(.72), 58 * k, 70 * k);
  ctx.rect(u(.18), base - 110 * k, w * .64, 112 * k);
  ctx.fill();
}
const NIGHT = {
  lay(D) {
    const o = orient(D);
    if (o === 'p') return { o, moon: { x: 150, y: 170, r: 64 }, logo: { cx: 540, top: 56, ww: 150 }, verse: { cx: 540, y: 282, w: 840 }, win: { x: 190, y: 625, w: 700, h: 900 },
      lanterns: [{ x: 92, len: 640, s: 1 }, { x: 990, len: 560, s: .9 }, { x: 896, len: 40, s: .55 }], sky: { base: 1560, k: 1 }, contact: { y: 1640, k: .95 }, soc: { y: 1866, k: .82 } };
    if (o === 'l') return { o, moon: { x: 1810, y: 120, r: 54 }, win: { x: 170, y: 110, w: 600, h: 840 }, lanterns: [{ x: 80, len: 520, s: .85 }, { x: 860, len: 470, s: .8 }],
      sky: { base: 990, k: .62, w: 1000 }, col: { cx: 1390, y: 60, w: 760 } };
    if (D.h === D.w) return { o, moon: { x: 110, y: 100, r: 42 }, logo: { cx: 540, top: 22, ww: 84 }, verse: { cx: 540, y: 132, w: 560 }, win: { x: 355, y: 370, w: 370, h: 490 },
      lanterns: [{ x: 180, len: 420, s: .68 }, { x: 900, len: 380, s: .64 }], sky: { base: 900, k: .55 }, contact: { y: 905, k: .58 }, soc: { y: 1048, k: .58 } };
    return { o, moon: { x: 120, y: 120, r: 50 }, logo: { cx: 540, top: 28, ww: 110 }, verse: { cx: 540, y: 174, w: 700 }, win: { x: 295, y: 455, w: 490, h: 670 },
      lanterns: [{ x: 140, len: 520, s: .8 }, { x: 940, len: 470, s: .75 }], sky: { base: 1150, k: .7 }, contact: { y: 1150, k: .7 }, soc: { y: 1316, k: .64 } };
  },
  draw(ctx, P, t) {
    const D = dimsOf(P), L = this.lay(D), s = fstate(P, t), { b, m, id } = s, W2 = L.win;
    const bgA = P.bgIn ? EZ.out(S(b, 0, .2)) : 1;
    if (bgA <= .002) return;
    ctx.save(); ctx.globalAlpha *= bgA;
    const night = P.c1, gold = P.c2, white = P.c3, ground = P.c4;
    blit(ctx, layer('night|' + night, D, x => {
      const g = x.createLinearGradient(0, 0, 0, D.h); g.addColorStop(0, shade(night, 0, .35)); g.addColorStop(.6, night); g.addColorStop(1, shade(night, 255, .12)); x.fillStyle = g; x.fillRect(0, 0, D.w, D.h);
      const h = x.createRadialGradient(D.w / 2, D.h, 0, D.w / 2, D.h, D.h * .7); h.addColorStop(0, 'rgba(120,80,180,.35)'); h.addColorStop(1, 'rgba(120,80,180,0)'); x.fillStyle = h; x.fillRect(0, 0, D.w, D.h);
    }), D);
    // stars
    const sa = EZ.out(S(b, 0, .4));
    for (let i = 0; i < 110; i++) {
      const sx = rnd(i * 1.37) * D.w, sy = rnd(i * 2.11) * D.h * .82, tw = .5 + .5 * Math.sin(t * (1.2 + rnd(i) * 2) + i * 3), a = sa * (.25 + .75 * rnd(i + 7)) * lerp(1, tw, .3 + .7 * id);
      if (rnd(i + 13) > .9) sparkle(ctx, sx, sy, 6 + 5 * rnd(i), '#FFFFFF', a);
      else { ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.beginPath(); safeArc(ctx, sx, sy, .8 + 1.6 * rnd(i + 3), 0, TAU); ctx.fill(); }
    }
    if (id > .02) {                                               // shooting star every 7 s
      const u = (t % 7) / 1.1; if (u < 1) { const x0 = D.w * .2 + (Math.floor(t / 7) * 211) % (D.w * .5), y0 = D.h * .06, px = x0 + u * 380, py = y0 + u * 150, g = ctx.createLinearGradient(px - 180, py - 70, px, py); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, `rgba(255,255,255,${.9 * id * Math.sin(Math.PI * u)})`); ctx.strokeStyle = g; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(px - 180, py - 70); ctx.lineTo(px, py); ctx.stroke(); }
    }
    // moon
    const mp = EZ.out(S(b, .05, .45));
    if (mp > 0) {
      const M = L.moon, my = M.y + (1 - mp) * 80;
      ctx.save(); ctx.globalAlpha *= mp; const g = ctx.createRadialGradient(M.x, my, M.r * .5, M.x, my, M.r * 3); g.addColorStop(0, rgba(gold, .28)); g.addColorStop(1, rgba(gold, 0)); ctx.fillStyle = g; ctx.fillRect(M.x - M.r * 3, my - M.r * 3, M.r * 6, M.r * 6);
      ctx.beginPath(); safeArc(ctx, M.x, my, M.r, 0, TAU); ctx.clip(); ctx.beginPath(); ctx.rect(M.x - M.r * 2, my - M.r * 2, M.r * 4, M.r * 4); safeArc(ctx, M.x + M.r * .45, my - M.r * .2, M.r * .88, 0, TAU, true);
      ctx.fillStyle = shade(gold, 255, .55); ctx.fill('evenodd'); ctx.restore();
    }
    // window: glow, frame lines, hole
    const wp = EZ.inOut(S(b, .15, .55)), wcx = W2.x + W2.w / 2;
    if (wp > 0) {
      ctx.save(); ctx.globalAlpha *= wp; shadow(ctx, rgba(gold, .9), 50); domePath(ctx, W2.x, W2.y, W2.w, W2.h, 16); ctx.fillStyle = shade(night, 0, .5); ctx.fill(); noShadow(ctx); ctx.restore();
      const per = 2 * W2.h + W2.w * 2.4;
      ctx.save(); ctx.lineJoin = 'round';
      for (const [off, lw, a] of [[26, 2, .7], [14, 4, 1]]) { domePath(ctx, W2.x, W2.y, W2.w, W2.h, off); ctx.setLineDash([per * wp, per]); ctx.strokeStyle = rgba(shade(gold, 255, .2), a); ctx.lineWidth = lw; shadow(ctx, gold, 16); ctx.stroke(); }
      ctx.setLineDash([]); noShadow(ctx);
      ctx.fillStyle = gold; ctx.globalAlpha *= S(b, .4, .6); ctx.beginPath(); ctx.moveTo(wcx, W2.y - 80); ctx.lineTo(wcx + 7, W2.y - 26); ctx.lineTo(wcx - 7, W2.y - 26); ctx.closePath(); ctx.fill();
      ctx.beginPath(); safeArc(ctx, wcx, W2.y - 40, 8, 0, TAU); ctx.fill();
      ctx.restore();
    }
    cut(ctx, () => domePath(ctx, W2.x, W2.y, W2.w, W2.h, 0), EZ.inOut(S(b, .28, .58)));
    if (id > .02) { ctx.save(); domePath(ctx, W2.x, W2.y, W2.w, W2.h, 14); const per = 2 * W2.h + W2.w * 2.4; ctx.setLineDash([160, per]); ctx.lineDashOffset = -((t * 260) % per); ctx.strokeStyle = `rgba(255,250,230,${id})`; ctx.lineWidth = 5; shadow(ctx, '#fff', 16); ctx.stroke(); ctx.restore(); }
    // skyline
    const kp = EZ.out(S(b, .1, .45));
    if (kp > 0) { ctx.save(); ctx.translate(0, (1 - kp) * 300 * L.sky.k); skyline(ctx, 0, L.sky.w || D.w, L.sky.base, L.sky.k, ground); if (L.sky.w) { ctx.fillStyle = ground; ctx.fillRect(0, L.sky.base, D.w, D.h); }
      const g = ctx.createLinearGradient(0, L.sky.base - 60, 0, L.sky.base + 300); g.addColorStop(0, rgba(gold, 0)); g.addColorStop(.3, rgba(gold, .09)); g.addColorStop(1, rgba(gold, 0)); ctx.fillStyle = g; ctx.fillRect(0, L.sky.base - 60, D.w, 360); ctx.restore(); }
    // lanterns
    L.lanterns.forEach((ln, i) => {
      const dp = EZ.back(S(b, .18 + i * .06, .55 + i * .06), m * .8); if (dp <= .002) return;
      const amp = (.05 + .07 * (P.mIdle / 100)) * id, ang = Math.sin(t * (1.3 + i * .21) + i) * amp + (1 - dp) * .2 * (i % 2 ? 1 : -1) * m;
      const flick = .85 + .15 * Math.sin(t * 13 + i * 5) * Math.sin(t * 7.3 + i);
      lantern(ctx, ln.x, ln.len * dp, ln.s, ang, EZ.out(S(b, .4, .8)), flick, gold);
    });
    // text + info
    const pr = stdProgress(b), pal = { verse: white, support: gold, phone: white, chip: white, glyph: shade(night, 0, .3), text: white, wave: gold, name: gold, logo: { em: white, word: white, tag: white }, verseGlow: rgba(gold, .55), verseBlur: 16 };
    if (L.o === 'l') { ctx.save(); ctx.translate(L.col.cx, L.col.y); stackBlock(ctx, P, s, pal, pr, L.col.w); ctx.restore(); }
    else {
      if (P.showLogo) lockup(ctx, L.logo.cx, L.logo.top, L.logo.ww, pal.logo, pr.logo, t, id, m);
      if (P.showVerse) verse(ctx, white, L.verse.cx, L.verse.y, L.verse.w, pr.v1, pr.v2, rgba(gold, .55), 16);
      plaque(ctx, P.reciter, wcx, W2.y + W2.h - 70 * (W2.w / 700), Math.min(1, W2.w / 700), { fill: rgba(shade(night, 0, .4), .92), line: gold, text: shade(gold, 255, .4) }, pr.name);
      let y = L.contact.y;
      if (P.showWave) { const ww = 420 * L.contact.k; waveform(ctx, D.w / 2 - ww / 2, y, ww, 34 * L.contact.k, gold, pr.wave, s.play, t, id); y += 62 * L.contact.k; }
      contact(ctx, P, D.w / 2, y, L.contact.k, pal, pr.contact);
      if (P.showSocial) socials(ctx, P, D.w / 2, L.soc.y, L.soc.k, pal, pr.soc, 'center', 1, D.w * .92);
    }
    if (P.particles) bokeh(ctx, { x: 0, y: D.h * .3, w: D.w, h: D.h * .7 }, t, 20, '#FFD58A', .7 * EZ.out(S(b, .4, .9)), 91, 2, 4, 16, false);
    ctx.restore();
  }
};

/* =========================================================
   Registry
   ========================================================= */
const TXT = { support: 'لدعم برامج وأنشطة الجمعية', phone: '0546090555', handle: 'hedayh_ar', web: 'www.hedayh.org.sa' };
const FR_BASE = { ratio: '9:16', speed: 1, tIn: 2.6, tHold: 12, tOut: 1.2, mIn: 60, mOut: 50, mIdle: 60, ...TXT, reciter: '',
  showVerse: true, showLogo: true, showContact: true, showSocial: true, showWave: true, particles: true, bgIn: false };
const ALL = ['showVerse', 'showLogo', 'showContact', 'showSocial', 'showWave', 'particles', 'bgIn'];
const FRAMES = [
  { id: 'fr-lattice', name: 'Lattice Arch', impl: LATTICE, ref: 'Remake of reference 1',
    blurb: 'A lattice lambrequin drops in from the top and a torn panel rises from the bottom. The video fills everything in between.',
    colors: [['c1', 'Ornament'], ['c2', 'Panel'], ['c3', 'Gold'], ['c4', 'Text']], toggles: ALL.filter(k => k !== 'bgIn'),
    defaults: { ...FR_BASE, c1: '#123F4A', c2: '#363D2B', c3: '#E6B54C', c4: '#FFFFFF' } },
  { id: 'fr-watercolor', name: 'Watercolor Paper', impl: WATER, ref: 'Remake of reference 2',
    blurb: 'Textured paper, a painted brush frame with cross stitches and sprigs, a Quran on its stand and a brushed name label.',
    colors: [['c1', 'Paper'], ['c2', 'Frame'], ['c3', 'Accent'], ['c4', 'Ink']], toggles: ALL,
    defaults: { ...FR_BASE, c1: '#F7F2E8', c2: '#78AEA3', c3: '#F0A375', c4: '#2E6B63', reciter: 'الشيخ/ سعود الشريم' } },
  { id: 'fr-mihrab', name: 'Golden Mihrab', impl: MIHRAB, ref: 'Remake of reference 3',
    blurb: 'Gold curtains part, an ivory arch draws itself, the mihrab window opens and gold bokeh drifts over everything.',
    colors: [['c1', 'Background'], ['c2', 'Gold'], ['c3', 'Ivory'], ['c4', 'Curtains']], toggles: ALL.filter(k => k !== 'showWave'),
    defaults: { ...FR_BASE, c1: '#2D3B2C', c2: '#D6B25C', c3: '#F4EEDF', c4: '#8E6B22', showContact: false, showWave: false } },
  { id: 'fr-girih', name: 'Star Girih', impl: GIRIH, ref: 'New',
    blurb: 'An 8-point star lattice ripples out over navy, the window irises open and gold medallions spin into its corners.',
    colors: [['c1', 'Navy'], ['c2', 'Gold'], ['c3', 'Ivory']], toggles: ALL,
    defaults: { ...FR_BASE, c1: '#0F1F3B', c2: '#D7AF5E', c3: '#F6EFDD' } },
  { id: 'fr-arch', name: 'Sand Arch', impl: ARCH, ref: 'New',
    blurb: 'Minimal and modern. An arch window rises out of warm sand, a gold line traces it and a terracotta sun slides in behind.',
    colors: [['c1', 'Sand'], ['c2', 'Sage'], ['c3', 'Sun'], ['c4', 'Gold line']], toggles: ALL,
    defaults: { ...FR_BASE, c1: '#EFE5D3', c2: '#56786A', c3: '#C8714A', c4: '#B38B45', reciter: 'الشيخ/ سعود الشريم', particles: false } },
  { id: 'fr-night', name: 'Night Lanterns', impl: NIGHT, ref: 'New',
    blurb: 'A starry night. Lanterns drop in on their chains and keep swinging, and the dome window glows open over a mosque skyline.',
    colors: [['c1', 'Night sky'], ['c2', 'Lantern gold'], ['c3', 'Text'], ['c4', 'Skyline']], toggles: ALL,
    defaults: { ...FR_BASE, c1: '#1C1745', c2: '#F2C46D', c3: '#FFFFFF', c4: '#0C0A24' } }
];
FRAMES.forEach(g => { g.raw = true; g.draw = (ctx, P, t) => g.impl.draw(ctx, P, t); g.timing = P => ({ total: ftotal(P) }); g.dims = dimsOf; g.winBox = P => g.impl.lay(dimsOf(P)).win; });

/* =========================================================
   Preview: what the window shows (never exported)
   ========================================================= */

function safeArc(ctx, x, y, radius, start, end, counterclockwise) {
  ctx.arc(x, y, Math.max(0, radius), start, end, counterclockwise);
}
export async function loadAssets() {
  await Promise.all(Object.entries({...LOGO_SRC, ...VERSE_SRC}).map(([key, src]) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { LOGO[key] = image; resolve(); };
    image.onerror = () => reject(new Error('تعذر تحميل عناصر التصميم. أعد المحاولة.'));
    image.src = src;
  })));
}
/* Shared drawing kit for the extra designs in designs.js (same helpers the source designs use). */
export const kit = {
  E, EZ, S, TAU, clamp, lerp, sm, frac, rnd, rgba, shade, mix: mix, onColor, hexToRgb,
  rr, safeArc, shadow, noShadow, metalV, sparkle, txt, textW, fitSize, revealBox,
  drawLogo, drawMask, bloomLogo, layer, blit, cut, grain, verse, verseH, lockup, lockupH, waveform, contact, socials,
  bokeh, plaque, rowBlock, stackBlock, stdProgress, fstate, rstate, rtotal, ftotal, dimsOf, orient, RATIOS, nameText, icon, starLattice, notchRect,
  numberRow, drawText, measure, glow, fmt, arrowUp, setFont,
  get scale() { return gScale; },
};
export { GRAPHICS, REPINE, FRAMES, renderFrame, timingOf, drawLogo };

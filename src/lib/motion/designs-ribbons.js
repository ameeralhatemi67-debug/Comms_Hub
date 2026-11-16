/* Two lower thirds of «تصاميم ريبين» built around the Hedayah emblem drawn as true vector strokes (emblem.js), and the
   design options they share: the metal (gold, silver, rose, bronze or any colour), a quiet light that runs along the
   emblem, a pattern, the title's font, the band's length, where the design sits, its size, its height above the bottom
   edge, a drop shadow, a glow and glints. Drawn into the 1280 x 720 logical canvas like every lower third.

   - Liquid Gold (rp-liquid): a drop of molten metal falls and splashes into a disc, the emblem writes itself inside it,
     metal flows out into a band, the band cools into a dark glass panel and the subtitle comes out of its underside.
     It is liquid only while it arrives: shown, it is still and clean; it leaves by retracting into the disc.
   - Ivory Identity Card (rp-identity) and Night Identity (rp-night), which replace the Ivory Plaque by the owner's word of
     2026-11-16: both carry the whole Hedayah logo (flower, «هداية», the association's name), a title, a subtitle and a
     side text («هداية 2026» by default). The first keeps the ivory, navy and gold of the plaque; the second is a dark panel
     with the logo on a white tile.

   Mirroring («يسار») flips the shapes only: text, the wordmark and anything with a direction are drawn upright. Every
   length that the canvas reads in device pixels (blur, shadow offset, pattern tiles) is scaled by the render scale,
   the design's own size and its drawing unit, so the preview, the thumbnails and every export size look the same. */
import { kit } from './renderers.js';
import { emblemStroke, emblemShine } from './emblem.js';

const { EZ, S, TAU, clamp, lerp, frac, rnd, shade, hexToRgb, sparkle, drawLogo, rstate, rtotal } = kit;
const W = 1280, H = 720;
const sm = t => t * t * (3 - 2 * t);
const isAr = s => /[؀-ۿ]/.test(s || '');

/* ---------- metal ---------- */
const hex2 = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
const mixHex = (a, b, k) => { const A = hexToRgb(a), B = hexToRgb(b); return '#' + hex2(lerp(A[0], B[0], k)) + hex2(lerp(A[1], B[1], k)) + hex2(lerp(A[2], B[2], k)); };
const alphaOf = (h, a) => { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; };

/* Five tones of each metal, darkest first. Silver is cooler and harder than gold; rose and bronze are warmer. */
export const METALS = {
  gold: ['#3f2a07', '#8a611f', '#c9993f', '#ebc873', '#fff3cc'],
  silver: ['#262c33', '#646d78', '#a7b0bb', '#dee3e9', '#ffffff'],
  rose: ['#43231c', '#93584a', '#cf917e', '#f0c6b6', '#fff3ee'],
  bronze: ['#331d09', '#7a4a1e', '#b2763b', '#dea76d', '#ffe8c9'],
};
export function metalOf(P) {
  const m = METALS[P.metal]; if (m) return m;
  const b = /^#[0-9a-f]{6}$/i.test(P.accent || '') ? P.accent : '#c9993f';
  return [shade(b, 0, .72), shade(b, 0, .38), b, shade(b, 255, .38), shade(b, 255, .84)];
}
/** A CSS picture of a metal, for the choice buttons. */
export const metalCss = M => `linear-gradient(135deg, ${M[4]} 0%, ${M[3]} 22%, ${M[2]} 48%, ${M[1]} 68%, ${M[3]} 88%, ${M[4]} 100%)`;
const tone = (M, v) => { v = clamp(v) * 4; const i = Math.min(3, Math.floor(v)); return mixHex(M[i], M[i + 1], v - i); };

/* Polished metal across a band: light above, a dark core, a reflected light below. */
function metalBevel(c, x0, y0, x1, y1, M) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, M[4]); g.addColorStop(.16, M[3]); g.addColorStop(.42, M[2]); g.addColorStop(.62, M[1]); g.addColorStop(.84, M[2]); g.addColorStop(1, M[3]);
  return g;
}
/* Molten metal: bright and dark bands that travel along the line by `phase`, so the metal seems to flow. */
function metalFlow(c, x0, y0, x1, y1, M, phase, cycles = 2.6) {
  const g = c.createLinearGradient(x0, y0, x1, y1), n = 28;
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = TAU * (u * cycles - phase);
    let v = .5 + .3 * Math.sin(a) + .17 * Math.sin(a * 2.3 + 1.7 + phase * 2.1);
    v = sm(clamp(v));
    g.addColorStop(u, tone(M, .14 + .86 * v));
  }
  return g;
}

/* ---------- device lengths ---------- */
let zoom = 1;                                          // the design's own size during a draw
let unit = 1;                                          // the design's drawing unit (the ivory plaque draws in its sheet's units)
const dev = () => kit.scale * zoom * unit;             // device pixels per design unit
const px = v => v * dev();                             // a design length in device pixels (blur and offsets ignore transforms)
function shadowOn(c, color, blur, oy = 0) { c.shadowColor = color; c.shadowBlur = px(blur); c.shadowOffsetX = 0; c.shadowOffsetY = px(oy); }
function shadowOff(c) { c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetX = 0; c.shadowOffsetY = 0; }

/* ---------- polygons ---------- */
const signed = pts => { let s = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += (pts[j][0] - pts[i][0]) * (pts[j][1] + pts[i][1]); return s; };
/* Adds a closed polygon, always turning the same way, so overlapping pieces of one path fill as their union. */
function addPoly(path, pts) {
  if (!pts || pts.length < 3) return;
  const p = signed(pts) < 0 ? pts.slice().reverse() : pts;
  path.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) path.lineTo(p[i][0], p[i][1]); path.closePath();
}
function linePath(c, pts, close = false) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); if (close) c.closePath(); }
const lengthOf = pts => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; };
function circlePts(cx, cy, r, n = 72, wob = null) {
  const out = []; for (let i = 0; i < n; i++) { const a = i / n * TAU, q = wob ? r * (1 + wob(a)) : r; out.push([cx + Math.cos(a) * q, cy + Math.sin(a) * q]); }
  return out;
}
function arcPts(cx, cy, r, a0, a1, n) { const out = []; for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return out; }
/* A polygon with rounded corners, as points. `rad` is each corner's radius; a radius too large for its sides shrinks. */
function roundPoly(pts, rad, seg = 10) {
  const out = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const P = pts[i], A = pts[(i + n - 1) % n], B = pts[(i + 1) % n];
    let ux = A[0] - P[0], uy = A[1] - P[1], vx = B[0] - P[0], vy = B[1] - P[1];
    const la = Math.hypot(ux, uy), lb = Math.hypot(vx, vy); ux /= la; uy /= la; vx /= lb; vy /= lb;
    const th = Math.acos(clamp(ux * vx + uy * vy, -1, 1)), tn = Math.tan(th / 2);
    let d = rad[i] / tn; d = Math.min(d, la * .5, lb * .5); const r = d * tn;
    if (r < .5) { out.push([P[0], P[1]]); continue; }
    const t1 = [P[0] + ux * d, P[1] + uy * d], t2 = [P[0] + vx * d, P[1] + vy * d];
    let bx = ux + vx, by = uy + vy; const bl = Math.hypot(bx, by); bx /= bl; by /= bl;
    const k = r / Math.sin(th / 2), cx = P[0] + bx * k, cy = P[1] + by * k;
    const a0 = Math.atan2(t1[1] - cy, t1[0] - cx); let a1 = Math.atan2(t2[1] - cy, t2[0] - cx), da = a1 - a0;
    while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU; a1 = a0 + da;
    for (const q of arcPts(cx, cy, r, a0, a1, seg)) out.push(q);
  }
  return out;
}
/* The concave corner where a straight edge (y = line) meets a circle: liquid never makes a sharp corner. `up` puts the
   fillet above the line, `dir` (-1 or 1) on the circle's left or right. Returns a polygon that also overlaps both. */
function fillet(cx, cy, R, line, rf, up, dir = -1) {
  const fy = up ? line - rf : line + rf, dy = cy - fy, reach = (R + rf) ** 2 - dy * dy;
  if (rf < .5 || reach <= 0) return null;
  const fx = cx + dir * Math.sqrt(reach), tx = cx + (fx - cx) * R / (R + rf), ty = cy + (fy - cy) * R / (R + rf);
  const a0 = up ? Math.PI / 2 : -Math.PI / 2;
  let a1 = Math.atan2(ty - fy, tx - fx), da = a1 - a0;
  while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
  return [...arcPts(fx, fy, rf, a0, a0 + da, 10), [cx, cy], [fx - dir * 2, up ? line + 14 : line - 14]];
}

/* ---------- layers: soft reveals and masked patterns under any transform ---------- */
const pool = {};
function scratch(name, w, h) {
  let cv = pool[name];
  if (!cv) cv = pool[name] = document.createElement('canvas');
  if (cv.width < w || cv.height < h) { cv.width = Math.max(cv.width, w); cv.height = Math.max(cv.height, h); }
  const x = cv.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; shadowOff(x); x.clearRect(0, 0, w, h);
  return x;
}
function deviceBox(c, box) {
  const M = c.getTransform(), xs = [], ys = [];
  for (const [x, y] of [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h]]) { xs.push(M.a * x + M.c * y + M.e); ys.push(M.b * x + M.d * y + M.f); }
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const x1 = Math.min(c.canvas.width, Math.ceil(Math.max(...xs))), y1 = Math.min(c.canvas.height, Math.ceil(Math.max(...ys)));
  return { M, x0, y0, w: x1 - x0, h: y1 - y0 };
}
/* Draws `paint` into a layer covering `box`, keeps it where `mask(x)` (a fill style in design units) is opaque, lays it down. */
function masked(c, name, box, paint, mask) {
  const d = deviceBox(c, box); if (d.w < 1 || d.h < 1) return;
  const x = scratch(name, d.w, d.h), M = d.M;
  x.setTransform(M.a, M.b, M.c, M.d, M.e - d.x0, M.f - d.y0);
  paint(x);
  x.globalCompositeOperation = 'destination-in'; x.globalAlpha = 1; shadowOff(x); x.fillStyle = mask(x);
  x.fillRect(box.x - 4000, box.y - 4000, box.w + 8000, box.h + 8000);
  c.save(); shadowOff(c); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(x.canvas, 0, 0, d.w, d.h, d.x0, d.y0, d.w, d.h); c.restore();
}
/* A soft wipe: `p` (0 to 1) uncovers what `paint` draws inside `box`, from the emblem's side. */
function reveal(c, box, p, paint, soft = 90) {
  if (p <= 0) return;
  if (p >= 1) { paint(c); return; }
  const f = p * (box.w + soft), edge = box.x + box.w - f;
  masked(c, 'reveal', { x: box.x, y: box.y - 20, w: box.w, h: box.h + 40 }, paint, x => {
    const g = x.createLinearGradient(edge, 0, edge + soft, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)'); return g;
  });
}

/* ---------- text ---------- */
const FAMILY = {
  plex: '"IBM Plex Sans Arabic","Segoe UI",Tahoma,sans-serif',
  kufi: '"Reem Kufi","IBM Plex Sans Arabic","Segoe UI",Tahoma,sans-serif',
  ruqaa: '"Aref Ruqaa","IBM Plex Sans Arabic","Segoe UI",Tahoma,sans-serif',
  system: '"Segoe UI",Tahoma,system-ui,sans-serif',
};
const WEIGHT = { plex: 700, kufi: 600, ruqaa: 700, system: 800 };
const titleFont = P => ({ family: FAMILY[P.font] || FAMILY.plex, weight: WEIGHT[P.font] || 700 });
const subFont = P => P.font === 'system' ? { family: FAMILY.system, weight: 700 } : { family: FAMILY.plex, weight: 600 };
function widthOf(c, str, size, f) { c.font = `${f.weight} ${size}px ${f.family}`; c.direction = isAr(str) ? 'rtl' : 'ltr'; return c.measureText(str || '').width; }
function fit(c, str, size, f, maxW, minK = .5) { const w = widthOf(c, str, size, f); return w > maxW ? Math.max(size * minK, size * maxW / w) : size; }
/* Text anchored at its emblem-side end (`x` in design units). Under the mirror it is drawn upright and grows the other way. */
function say(c, str, x, y, size, f, color, mir, align = 'right') {
  if (!str) return;
  c.save(); c.translate(x, y); if (mir) c.scale(-1, 1);
  c.font = `${f.weight} ${size}px ${f.family}`; c.fillStyle = color; c.textBaseline = 'alphabetic'; c.direction = isAr(str) ? 'rtl' : 'ltr';
  c.textAlign = align === 'center' ? 'center' : (align === 'right') !== mir ? 'right' : 'left';
  c.fillText(str, 0, 0); c.restore();
}

/* ---------- patterns ---------- */
const TILE = { emblem: 72, girih: 64, rings: 48, waves: 64, dots: 16, hatch: 12, grain: 40 };
function star8(x, cx, cy, r, rot = Math.PI / 8) {
  x.beginPath();
  for (let k = 0; k < 16; k++) { const a = rot + k * Math.PI / 8, q = k % 2 ? r * .56 : r; k ? x.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q) : x.moveTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); }
  x.closePath(); x.stroke();
}
const WRAP = [[0, 0], [1, 0], [0, 1], [1, 1]];
const DRAW_TILE = {
  emblem(x, T) {
    for (const [i, j] of [[.5, .5], ...WRAP]) emblemStroke(x, i * T, j * T, T * .3, { style: x.strokeStyle, weight: 1.2 });
    for (const [i, j] of [[.5, 0], [0, .5], [.5, 1], [1, .5]]) { x.save(); x.translate(i * T, j * T); x.rotate(Math.PI / 4); x.strokeRect(-2.2, -2.2, 4.4, 4.4); x.restore(); }
  },
  girih(x, T) {
    for (const [i, j] of [[.5, .5], ...WRAP]) star8(x, i * T, j * T, T * .25);
    x.beginPath();
    for (const [i, j] of WRAP) { const sx = Math.sign(.5 - i), sy = Math.sign(.5 - j); x.moveTo(i * T + sx * T * .18, j * T + sy * T * .18); x.lineTo(T / 2 - sx * T * .18, T / 2 - sy * T * .18); }
    x.stroke();
  },
  rings(x, T) { for (const [i, j] of [[.5, .5], ...WRAP]) { x.beginPath(); x.arc(i * T, j * T, T / 2, 0, TAU); x.stroke(); } },
  waves(x, T) {
    for (let j = -1; j < 9; j++) { x.beginPath(); for (let i = 0; i <= 32; i++) { const u = i / 32 * T; const y = j * T / 8 + 2.4 * Math.sin(u / T * TAU); i ? x.lineTo(u, y) : x.moveTo(u, y); } x.stroke(); }
  },
  dots(x, T) { for (const [i, j] of [[.25, .25], [.75, .75]]) { x.beginPath(); x.arc(i * T, j * T, 1.4, 0, TAU); x.fill(); } },
  hatch(x, T) { x.beginPath(); for (const o of [-T, 0, T]) { x.moveTo(o, T); x.lineTo(o + T, 0); } x.stroke(); },
  grain(x, T) {
    for (let i = 0; i < 260; i++) { x.globalAlpha = .25 + .75 * rnd(i * 1.37 + 2); x.beginPath(); x.arc(rnd(i + .11) * T, rnd(i * 2.3 + .7) * T, .25 + .55 * rnd(i * .7 + 5), 0, TAU); x.fill(); }
    x.globalAlpha = 1;
  },
};
export const PATTERNS = Object.keys(TILE);
const tiles = new Map();
function tileCanvas(kind, ink, k) {
  const T = TILE[kind], n = Math.max(4, Math.round(T * k)), id = `${kind}|${ink}|${n}`;
  let cv = tiles.get(id);
  if (!cv) {
    cv = document.createElement('canvas'); cv.width = cv.height = n;
    const x = cv.getContext('2d'); x.scale(n / T, n / T); x.strokeStyle = ink; x.fillStyle = ink; x.lineWidth = 1; x.lineCap = 'round'; x.lineJoin = 'round';
    DRAW_TILE[kind](x, T);
    if (tiles.size > 48) tiles.clear();
    tiles.set(id, cv);
  }
  return { cv, T, n };
}
function fillPattern(c, kind, ink, box, drift = 0) {
  if (!TILE[kind] || typeof DOMMatrix === 'undefined') return;
  const { cv, T, n } = tileCanvas(kind, ink, dev()), pat = c.createPattern(cv, 'repeat'); if (!pat) return;
  pat.setTransform(new DOMMatrix([T / n, 0, 0, T / n, ((drift % T) + T) % T, 0]));
  c.fillStyle = pat; c.fillRect(box.x, box.y, box.w, box.h);
}
/** Paints a pattern's swatch for the choice buttons. */
export function patternSwatch(canvas, kind, ink, paper) {
  const x = canvas.getContext('2d'); if (!x) return;
  x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = paper; x.fillRect(0, 0, canvas.width, canvas.height);
  if (!TILE[kind] || typeof DOMMatrix === 'undefined') return;
  const k = canvas.width / 64, { cv, T, n } = tileCanvas(kind, ink, k), pat = x.createPattern(cv, 'repeat'); if (!pat) return;
  pat.setTransform(new DOMMatrix([T / n * k, 0, 0, T / n * k, 0, 0])); x.fillStyle = pat; x.fillRect(0, 0, canvas.width, canvas.height);
}

/* ---------- placing the design: side, size and height ---------- */
/* Applies the design's place to the context and returns whether it is mirrored. The layout is drawn for the emblem on the
   right; `box` is its extent there, and the anchor is the emblem's outer edge, so the emblem stays put as the size changes. */
function place(c, P, box, ax, ay) {
  zoom = clamp((Number(P.size) || 100) / 100, .5, 1.4);
  const side = P.side === 'left' || P.side === 'center' ? P.side : 'right', mir = side === 'left';
  const L = ax + (box.x0 - ax) * zoom, R = ax + (box.x1 - ax) * zoom, T = ay + (box.y0 - ay) * zoom;
  let dx = 0;
  if (side === 'center') dx = W / 2 - (L + R) / 2;
  else { if (L < 16) dx = 16 - L; if (R + dx > W - 16) dx = W - 16 - R; }
  let dy = -clamp(Number(P.lift) || 0, 0, 80) / 100 * H; if (T + dy < 10) dy = 10 - T;
  c.translate(0, dy);
  if (mir) { c.translate(W, 0); c.scale(-1, 1); }
  c.translate(ax + dx, ay); c.scale(zoom, zoom); c.translate(-ax, -ay);
  return mir;
}
const shinePhase = (P, t, period) => frac(t * clamp(Number(P.shineSpeed) || 1, .1, 4) / period);
const idleK = P => clamp((Number(P.mIdle) || 0) / 100);

/* =========================================================
   LIQUID GOLD
   The metal is liquid only while it arrives. Once settled the band is a still, clean piece of metal and glass: no
   ripple, no drops, no drifting highlights, one quiet light on the emblem if wanted. It leaves by its own movement,
   not the entry played backwards: the text fades, the subtitle withdraws, the band retracts into the disc, the disc
   closes and fades.
   ========================================================= */
const LQ = { ox: 1094, oy: 548, mr: 82, left: 150, h: 112, rim: 8 };
const LQ_BOX = { x0: 110, x1: 1190, y0: 420, y1: 668 };

/* A band of liquid from x = xr leftwards to a round front centred at xf. top(x) and bot(x) give its edges. */
function bandPts(xr, xf, rc, yc, top, bot, capWob) {
  const pts = [];
  for (let x = xr; x > xf; x -= 8) pts.push([x, top(x)]);
  const et = top(xf) - (yc - rc), eb = bot(xf) - (yc + rc);
  for (let i = 0; i <= 20; i++) {
    const a = -Math.PI / 2 - i / 20 * Math.PI, sn = Math.sin(a), q = rc * (1 + capWob(a));
    pts.push([xf + Math.cos(a) * q, yc + sn * q + (sn < 0 ? et * -sn : eb * sn)]);
  }
  for (let x = xf + 8; x < xr; x += 8) pts.push([x, bot(x)]);
  pts.push([xr, bot(xr)]);
  return pts;
}
function stadiumPts(x0, x1, yc, h) {
  const r = h / 2; if (x1 - x0 < h) { const m = (x0 + x1) / 2; x0 = m - r; x1 = m + r; }
  return [...arcPts(x1 - r, yc, r, -Math.PI / 2, Math.PI / 2, 14), ...arcPts(x0 + r, yc, r, Math.PI / 2, Math.PI * 1.5, 14)];
}

/* Every moment of the design as one set of values: the entry by the build, the exit by its own steps. */
function liquidPhases(s) {
  const { b, m } = s;
  if (s.dir === 'out') {
    const e = 1 - b;
    return { dropP: 1, splash: 0, discP: 1 - .22 * EZ.inOut(S(e, .62, 1)), embP: 1, ext: 1 - EZ.inOut(S(e, .2, .72)), thick: 1, cool: 1,
      textA: 1 - S(e, 0, .2), txP: 1, subP: 1 - EZ.inOut(S(e, .06, .34)), subDrop: 1 - EZ.inOut(S(e, .06, .3)), subTx: 1,
      kickP: 1 - EZ.inOut(S(e, .06, .3)), settle: 1, built: 1 - S(e, 0, .15), fade: 1 - EZ.inOut(S(e, .7, 1)), out: true };
  }
  return { dropP: S(b, 0, .13), splash: S(b, .12, .38), discP: EZ.back(S(b, .11, .3), Math.min(1, m * 1.25)), embP: EZ.inOut(S(b, .17, .46)),
    ext: EZ.outQ(S(b, .27, .66)), thick: EZ.out(S(b, .27, .5)), cool: EZ.inOut(S(b, .42, .78)), textA: 1, txP: S(b, .58, .86),
    subP: EZ.outQ(S(b, .6, .86)), subDrop: EZ.back(S(b, .6, .76), m), subTx: S(b, .7, .96), kickP: EZ.back(S(b, .68, .9), m),
    settle: S(b, .62, 1), built: S(b, .85, 1), fade: 1, out: false };
}

function drawLiquid(ctx, P, t) {
  const s = rstate(P, t); if (s.b < .0006) return;
  const { m } = s, M = metalOf(P), c = ctx;
  const { dropP, splash, discP, embP, ext, thick, cool, textA, txP, subP, subDrop, subTx, kickP, settle, built, fade, out } = liquidPhases(s);
  unit = 1;
  c.save(); c.globalAlpha *= fade;
  const { ox, oy, mr, rim } = LQ, flow = clamp((Number(P.flow) || 0) / 100);
  const tf = titleFont(P), sf = subFont(P), hasSub = Boolean(P.subtitle && P.subtitle.trim()), hasKick = Boolean(P.kicker && P.kicker.trim());

  /* how far the band reaches: the title's length with room around it, or the whole width */
  const tSize0 = 50, titleW = widthOf(c, P.title, tSize0, tf), ssize = 24, subW = hasSub ? widthOf(c, P.subtitle, ssize, sf) + 84 : 0;
  const tR = ox - mr - 40, minLeft = LQ.left;
  const left = P.span === 'full' ? minLeft : clamp(tR - Math.max(titleW + 150, subW + 70, 480), minLeft, tR - 480);
  const mir = place(c, P, { ...LQ_BOX, x0: left - 50 }, 1190, 640);
  const h = LQ.h * (.3 + .7 * thick), yc = oy, rc = h / 2;

  /* the edge is liquid only while the metal arrives and settles */
  const live = out ? 0 : 1 - settle, amp = 10 * flow * live;
  const env = x => sm(clamp((ox - mr - 4 - x) / 120));
  const wave = (x, seed) => env(x) * amp * (.5 * Math.sin(x * .019 + t * 2.2 + seed) + .3 * Math.sin(x * .043 - t * 3.4 + seed * 1.7) + .2 * Math.sin(x * .008 + t * 1.25 + seed * 2.9));
  const xf = lerp(ox - mr * .3, left + rc, ext);
  const bulge = out ? 0 : .26 * (1 - ext) * (.4 + m) * (.3 + .7 * flow);
  const bump = x => rc * bulge * Math.exp(-(((x - xf) / (rc * 1.8)) ** 2));
  const top = x => yc - rc - wave(x, 0) - bump(x), bot = x => yc + rc + wave(x, 4.1) + bump(x);
  const capWob = a => flow * live * .063 * Math.sin(3 * a + t * 4.6);

  /* the metal body: one path, so it fills, shades and casts one shadow as a single piece */
  const gold = new Path2D();
  const discR = mr * Math.max(0, discP), wobD = .036 * flow * live;
  if (discR > .5) addPoly(gold, circlePts(ox, oy, discR, 96, a => wobD * (Math.sin(6 * a + t * 2.6) + .6 * Math.sin(3 * a - t * 3.7))));
  if (dropP < 1) {                                            // the falling drop
    const y = lerp(oy - 250, oy - 8, dropP * dropP), r = 15, sy = 1 + .8 * dropP, sx = 1 - .22 * dropP;
    const tear = []; for (let i = 0; i < 40; i++) { const a = i / 40 * TAU, sn = Math.sin(a), tail = sn < 0 ? 1 + .9 * (-sn) ** 3 : 1; tear.push([ox + Math.cos(a) * r * sx * (sn < 0 ? 1 - .45 * (-sn) : 1), y + sn * r * sy * tail]); }
    addPoly(gold, tear);
  }
  if (splash > 0 && splash < 1) {                             // the splash as it lands
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (i - 4) * .34 + (rnd(i + 1) - .5) * .25, v = 130 + 110 * rnd(i + 3), u = splash;
      const r = (3 + 3.4 * rnd(i + 5)) * (1 - u) * (.4 + .6 * flow);
      if (r > .6) addPoly(gold, circlePts(ox + Math.cos(a) * v * u, oy - 20 + Math.sin(a) * v * u + 300 * u * u, r, 12));
    }
  }
  const band = ext > .002 ? bandPts(ox, xf, rc * (1 + bulge), yc, top, bot, capWob) : null;
  if (band) {
    addPoly(gold, band);
    const rf = 26 * clamp(ext * 5) * clamp(discP);
    addPoly(gold, fillet(ox, oy, discR, top(ox - mr), rf, true));
    addPoly(gold, fillet(ox, oy, discR, bot(ox - mr), rf, false));
  }
  /* the subtitle: a pill that comes out of the band's underside, from the disc outward */
  let pill = null;
  if (hasSub && subP > .002 && band) {
    const ph = 44, prx = ox - mr + 10, pw = Math.min(subW, prx - left - 10), plx = prx - Math.max(ph, pw * subP);
    const pyc = bot(prx - 60) - 8 + ph / 2 - (1 - subDrop) * (ph - 6);
    pill = { prx, plx, pyc, ph };
    addPoly(gold, stadiumPts(plx, prx, pyc, ph));
    addPoly(gold, [[plx + ph / 2, yc], [prx, yc], [prx, pyc], [plx + ph / 2, pyc]]);    // joined to the band whatever its edge
    addPoly(gold, fillet(plx + ph / 2, pyc, ph / 2, bot(plx + ph / 2), 14 * clamp(subP * 4), false, -1));
  }
  /* an optional tab above the band */
  let tab = null;
  if (hasKick && kickP > .01 && band) {
    const kf = { family: FAMILY.plex, weight: 700 }, ks = 18, kw = widthOf(c, P.kicker, ks, kf) + 48, kh = 32, krx = ox - mr - 24;
    const kyc = yc - rc - kh / 2 + 3 - (1 - kickP) * (kh - 4);
    tab = { kf, ks, kw, kh, krx, kyc };
    addPoly(gold, stadiumPts(krx - kw, krx, kyc, kh));
    addPoly(gold, [[krx - kw + kh / 2, kyc], [krx, kyc], [krx, yc], [krx - kw + kh / 2, yc]]);
    addPoly(gold, fillet(krx - kw + kh / 2, kyc, kh / 2, top(krx - kw + kh / 2), 12 * clamp(kickP * 3), true, -1));
  }

  /* the metal's bright and dark bands move only while it flows in or out */
  const goldFill = metalFlow(c, ox + 80, 0, left - 80, 0, M, (1 - ext) * .9, 2.2);
  if (P.glow && discR > 1) {                                 // a soft light behind the disc
    const g = c.createRadialGradient(ox, oy, discR * .9, ox, oy, discR * 1.7);
    g.addColorStop(0, alphaOf(M[3], .22 * clamp(discP))); g.addColorStop(1, alphaOf(M[3], 0));
    c.fillStyle = g; c.fillRect(ox - discR * 2, oy - discR * 2, discR * 4, discR * 4);
  }
  if (P.dropShadow !== false) { c.save(); shadowOn(c, 'rgba(0,0,0,.38)', 22, 8); c.fillStyle = M[1]; c.fill(gold); c.restore(); }
  c.fillStyle = goldFill; c.fill(gold);
  c.save(); c.clip(gold);
  {                                                          // depth: light from above, shade below
    const g = c.createLinearGradient(0, oy - mr, 0, oy + mr + 40);
    g.addColorStop(0, 'rgba(255,255,255,.34)'); g.addColorStop(.3, 'rgba(255,255,255,.05)'); g.addColorStop(.55, 'rgba(0,0,0,0)'); g.addColorStop(.85, 'rgba(0,0,0,.18)'); g.addColorStop(1, 'rgba(0,0,0,.3)');
    c.fillStyle = g; c.fillRect(left - 80, oy - 300, ox + mr - left + 200, 600);
    const rg = c.createRadialGradient(ox - mr * .35, oy - mr * .45, 2, ox - mr * .2, oy - mr * .3, mr * .9);
    rg.addColorStop(0, 'rgba(255,255,255,.38)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = rg; c.fillRect(ox - mr, oy - mr, mr * 2, mr * 2);
  }
  c.restore();

  /* the glass panel: the band cools from the disc outward into the panel colour */
  if (band) {
    const inner = bandPts(ox, xf, Math.max(1, rc * (1 + bulge) - rim), yc, x => top(x) + rim, x => bot(x) - rim, capWob);
    const panel = new Path2D(); addPoly(panel, inner);
    const xc = lerp(ox - mr * .3, xf - rc - 40, cool), still = out || cool >= 1;
    const coolPts = []; for (let y = yc - rc - 30; y <= yc + rc + 30; y += 6) coolPts.push([xc + (still ? 0 : (11 * Math.sin(y * .05 + t * 2.4) + 4 * Math.sin(y * .11 - t * 3.3)) * (1 - cool * .6)), y]);
    const coolEdge = coolPts.slice();
    coolPts.push([ox + 400, yc + rc + 30], [ox + 400, yc - rc - 30]);
    const region = new Path2D(); addPoly(region, coolPts);
    if (cool > .001) {
      c.save(); c.clip(panel); c.clip(region);
      const g = c.createLinearGradient(0, yc - rc, 0, yc + rc);
      g.addColorStop(0, shade(P.main, 255, .12)); g.addColorStop(.45, P.main); g.addColorStop(1, shade(P.main, 0, .4));
      c.fillStyle = g; c.fillRect(left - 60, yc - rc - 40, ox - left + 120, h + 80);
      const amt = clamp((Number(P.patternAmt) || 0) / 100);
      if (P.pattern && P.pattern !== 'none' && amt > 0) {
        const pbox = { x: left - 40, y: yc - rc - 20, w: ox - left + 60, h: h + 40 };
        masked(c, 'pattern', pbox, x => { x.save(); x.globalAlpha = .6 * amt; fillPattern(x, P.pattern, M[3], pbox); x.restore(); }, x => {
          const g2 = x.createLinearGradient(tR - 40, 0, left, 0); g2.addColorStop(0, 'rgba(0,0,0,.18)'); g2.addColorStop(.5, 'rgba(0,0,0,.6)'); g2.addColorStop(1, 'rgba(0,0,0,1)'); return g2;
        });
      }
      const gl = c.createLinearGradient(0, yc - rc, 0, yc + rc * .1);
      gl.addColorStop(0, 'rgba(255,255,255,.14)'); gl.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gl; c.fillRect(left - 60, yc - rc, ox - left + 120, rc * 1.1);
      c.restore();
      c.save(); c.clip(panel); c.clip(region); linePath(c, inner, true); c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 5; shadowOn(c, 'rgba(0,0,0,.6)', 7, 2); c.stroke(); c.restore();
    }
    if (!out && cool > .001 && cool < .999) {               // the hot edge where metal turns to glass, while it arrives
      c.save(); c.clip(panel); c.globalCompositeOperation = 'lighter'; linePath(c, coolEdge); c.strokeStyle = alphaOf(M[4], .8 * Math.sin(Math.PI * cool)); c.lineWidth = 4; shadowOn(c, M[3], 16); c.stroke(); c.restore();
    }
    /* the title */
    const maxW = tR - (xf - rc) - 40, size = fit(c, P.title, tSize0, tf, maxW);
    c.save(); c.globalAlpha *= textA;
    reveal(c, { x: xf - rc, y: yc - rc, w: tR - (xf - rc) + 12, h }, txP, x => {
      x.save(); shadowOn(x, 'rgba(0,0,0,.4)', 5, 2); say(x, P.title, tR, yc + size * .36, size, tf, P.text, mir); x.restore();
    });
    c.restore();
  }

  /* the disc's glass and the emblem */
  if (discR > rim + 2) {
    const gr = discR - rim - 1;
    c.save();
    const g = c.createRadialGradient(ox - gr * .3, oy - gr * .4, 2, ox, oy, gr);
    g.addColorStop(0, shade(P.main, 255, .18)); g.addColorStop(.6, P.main); g.addColorStop(1, shade(P.main, 0, .45));
    c.fillStyle = g; c.beginPath(); c.arc(ox, oy, gr, 0, TAU); c.fill();
    c.beginPath(); c.arc(ox, oy, gr, 0, TAU); c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 3; shadowOn(c, 'rgba(0,0,0,.5)', 6, 1); c.stroke(); shadowOff(c);
    const R = gr - 10 * (gr / (mr - rim - 1));
    emblemStroke(c, ox, oy, R, { draw: embP, style: metalBevel(c, ox - R, oy - R, ox + R * .4, oy + R, M) });
    if (P.shine && built > 0) emblemShine(c, ox, oy, R, { phase: shinePhase(P, t, 8), len: .1, color: M[4], glow: 4, blur: dev(), alpha: .7 * built });
    const gl = c.createLinearGradient(0, oy - gr, 0, oy); gl.addColorStop(0, 'rgba(255,255,255,.1)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    c.beginPath(); c.ellipse(ox, oy - gr * .38, gr * .82, gr * .5, 0, 0, TAU); c.fillStyle = gl; c.fill();
    c.restore();
  }

  /* the subtitle and the tab's text */
  c.save(); c.globalAlpha *= textA;
  if (pill) {
    const size = fit(c, P.subtitle, ssize, sf, pill.prx - pill.plx - 64);
    reveal(c, { x: pill.plx, y: pill.pyc - pill.ph / 2, w: pill.prx - pill.plx - 30, h: pill.ph }, subTx, x => say(x, P.subtitle, pill.prx - 40, pill.pyc + size * .36, size, sf, P.c1, mir));
  }
  if (tab) say(c, P.kicker, tab.krx - 24, tab.kyc + 6.5, tab.ks, tab.kf, shade(P.main, 0, .2), mir);
  c.restore();

  /* a few glints over the metal, if asked for */
  if (P.particles && band) {
    const a0 = S(s.b, .7, 1) * (out ? textA : 1);
    for (let i = 0; i < 10; i++) {
      const u = frac(t * (.05 + .04 * rnd(i + 11)) + rnd(i + 3)), x = lerp(xf - rc, ox + mr * .6, rnd(i + 1)), y = yc - rc - 6 - u * (70 + 50 * rnd(i + 7));
      sparkle(c, x, y, 1.4 + 2.2 * rnd(i + 2), M[4], Math.sin(Math.PI * u) * .7 * a0);
    }
  }
  c.restore();
}

/* =========================================================
   THE FULL LOGO
   The whole Hedayah logo as the association draws it: the flower (vector, emblem.js, so it can write itself), «هداية»
   and the association's name (the site's own masks), stacked and centred. `w` is the logo's width; it is 1.16 w tall.
   ========================================================= */
const LOGO_H = 1.16;
function fullLogo(c, cx, top, w, { flower = '#6c7881', gold = '#c4953b', draw = 1, words = 1, mir = false } = {}) {
  const R = w * .32;
  emblemStroke(c, cx, top + R, R, { draw, style: flower });
  if (words <= 0) return;
  c.save(); c.globalAlpha *= words;
  const ww = w * .98, wh = ww * 249 / 900, tw = w * .94, th = tw * 165 / 900;
  upright(c, cx, top + 2 * R + w * .04 + wh / 2, mir, u => drawLogo(u, 'wordmark', gold, 0, 0, ww));
  upright(c, cx, top + 2 * R + w * .04 + wh + w * .035 + th / 2, mir, u => drawLogo(u, 'tagline', gold, 0, 0, tw));
  c.restore();
}
/* Upright text or signs at (x, y), under the mirror too. */
function upright(c, x, y, mir, fn) { c.save(); c.translate(x, y); if (mir) c.scale(-1, 1); fn(c); c.restore(); }
/* A line of words and numbers anchored at its right end, the numbers in their own colour (as «هداية 2026»). */
function sayRuns(c, str, size, f, color, numColor, align = 'right') {
  const words = String(str || '').trim().split(/\s+/).filter(Boolean); if (!words.length) return;
  c.font = `${f.weight} ${size}px ${f.family}`; c.textBaseline = 'alphabetic'; c.textAlign = 'right';
  const gap = c.measureText(' ').width, widths = words.map(w => { c.direction = isAr(w) ? 'rtl' : 'ltr'; return c.measureText(w).width; });
  const total = widths.reduce((a, v) => a + v, 0) + gap * (words.length - 1);
  let x = align === 'center' ? total / 2 : align === 'left' ? total : 0;
  words.forEach((w, i) => { c.direction = isAr(w) ? 'rtl' : 'ltr'; c.fillStyle = /\d|[٠-٩]/.test(w) ? numColor : color; c.fillText(w, x, 0); x -= widths[i] + gap; });
}
const KICK_FONT = { family: FAMILY.plex, weight: 700 };
const rrPts = (x0, y0, x1, y1, r) => roundPoly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], [r, r, r, r], 10);

/* =========================================================
   IVORY IDENTITY CARD (rp-identity): the colours of the ivory design, a calmer form
   An ivory card holds the whole logo with a gold rim; a navy bar for the title and an ivory strip for the subtitle run out
   of it, cut on a slant at their far end; «هداية 2026» sits on a gold tab above the bar. Still while shown.
   ========================================================= */
const IC = { x: 1012, top: 430, bot: 652, w: 178, rad: 18, barTop: 466, barBot: 552, stripBot: 600, slant: 26 };

function identityPhases(s) {
  const { b, m } = s;
  if (s.dir === 'out') {
    const e = 1 - b;
    return { cardA: 1 - EZ.inOut(S(e, .62, 1)), cardS: 1 - .04 * S(e, .62, 1), draw: 1, words: 1, bar: 1 - EZ.inOut(S(e, .2, .6)),
      strip: 1 - EZ.inOut(S(e, .12, .5)), kick: 1 - EZ.inOut(S(e, 0, .25)), textA: 1 - S(e, 0, .2), txP: 1, subP: 1, built: 1 - S(e, 0, .15) };
  }
  return { cardA: S(b, 0, .14), cardS: .92 + .08 * EZ.back(S(b, 0, .24), m * .4), draw: EZ.inOut(S(b, .08, .4)), words: S(b, .22, .44),
    bar: EZ.inOut(S(b, .28, .6)), strip: EZ.inOut(S(b, .36, .68)), kick: EZ.out(S(b, .62, .82)), textA: 1, txP: S(b, .5, .78), subP: S(b, .6, .88),
    built: S(b, .85, 1) };
}

function drawIdentity(ctx, P, t) {
  const s = rstate(P, t); if (s.b < .0006) return;
  const M = metalOf(P), c = ctx, ph = identityPhases(s);
  unit = 1;
  const tf = titleFont(P), sf = subFont(P), hasSub = Boolean(P.subtitle && P.subtitle.trim()), hasKick = Boolean(P.kicker && P.kicker.trim());
  const tSize0 = 44, ssize = 23, ks = 19;
  const tR = IC.x - 30, titleW = widthOf(c, P.title, tSize0, tf), subW = hasSub ? widthOf(c, P.subtitle, ssize, sf) : 0;
  const L = P.span === 'full' ? 230 : clamp(tR - Math.max(titleW, subW, 300) - 60, 230, tR - 340);
  c.save();
  const mir = place(c, P, { x0: L - 10, x1: IC.x + IC.w + 10, y0: IC.top - 6, y1: IC.bot + 14 }, IC.x + IC.w, 646);
  const shadowsOn = P.dropShadow !== false, plate = metalBevel(c, 0, IC.top, 0, IC.bot, M);
  const ivory = (y0, y1) => { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, shade(P.c3, 255, .6)); g.addColorStop(1, shade(P.c3, 0, .05)); return g; };

  /* the navy bar and the ivory strip, running out of the card toward the left */
  const slantPts = (x0, y0, y1) => [[x0 + IC.slant, y0], [IC.x + 30, y0], [IC.x + 30, y1], [x0, y1]];
  const reachBar = lerp(IC.x, L, ph.bar), reachStrip = lerp(IC.x, L + 14, ph.strip);
  c.save(); c.globalAlpha *= ph.cardA;
  if (ph.strip > .001) {
    const strip = new Path2D(); addPoly(strip, slantPts(L + 14, IC.barBot - 2, IC.stripBot));
    c.save(); if (ph.strip < 1) { c.beginPath(); c.rect(reachStrip - 2, 0, 1400, 720); c.clip(); }
    if (shadowsOn) { c.save(); shadowOn(c, 'rgba(0,0,0,.25)', 18, 7); c.fillStyle = P.c3; c.fill(strip); c.restore(); }
    c.fillStyle = ivory(IC.barBot, IC.stripBot); c.fill(strip);
    linePath(c, [[L + 14, IC.stripBot], [IC.x + 10, IC.stripBot]]); c.strokeStyle = plate; c.lineWidth = 2.5; c.stroke();
    c.restore();
  }
  if (ph.bar > .001) {
    const bar = new Path2D(); addPoly(bar, slantPts(L, IC.barTop, IC.barBot));
    c.save(); if (ph.bar < 1) { c.beginPath(); c.rect(reachBar - 2, 0, 1400, 720); c.clip(); }
    if (shadowsOn) { c.save(); shadowOn(c, 'rgba(0,0,0,.3)', 20, 8); c.fillStyle = P.main; c.fill(bar); c.restore(); }
    const g = c.createLinearGradient(0, IC.barTop, 0, IC.barBot); g.addColorStop(0, shade(P.main, 255, .1)); g.addColorStop(1, shade(P.main, 0, .25)); c.fillStyle = g; c.fill(bar);
    const amt = clamp((Number(P.patternAmt) || 0) / 100);
    if (P.pattern && P.pattern !== 'none' && amt > 0) {
      const box = { x: L, y: IC.barTop, w: IC.x - L + 30, h: IC.barBot - IC.barTop };
      masked(c, 'pattern', box, x => { x.save(); x.clip(bar); x.globalAlpha = .5 * amt; fillPattern(x, P.pattern, M[3], box); x.restore(); }, x => {
        const g2 = x.createLinearGradient(IC.x, 0, L, 0); g2.addColorStop(0, 'rgba(0,0,0,.15)'); g2.addColorStop(1, 'rgba(0,0,0,1)'); return g2; });
    }
    linePath(c, [[IC.x + 10, IC.barTop], [L + IC.slant, IC.barTop], [L, IC.barBot]]); c.strokeStyle = plate; c.lineWidth = 3; c.lineJoin = 'round'; c.stroke();
    c.restore();
  }
  /* the gold tab with «هداية 2026» above the bar's far end */
  if (hasKick && ph.kick > .01) {
    const kw = widthOf(c, P.kicker, ks, KICK_FONT) + 40, kh = 32, kx = L + IC.slant + 6, ky = IC.barTop - kh + 2 + (1 - ph.kick) * 14;
    c.save(); c.globalAlpha *= ph.kick;
    const tab = new Path2D(); addPoly(tab, roundPoly([[kx, ky], [kx + kw, ky], [kx + kw, ky + kh], [kx, ky + kh]], [10, 10, 0, 0], 8));
    if (shadowsOn) { c.save(); shadowOn(c, 'rgba(0,0,0,.25)', 10, 3); c.fillStyle = M[2]; c.fill(tab); c.restore(); }
    c.fillStyle = metalBevel(c, 0, ky, 0, ky + kh, M); c.fill(tab);
    upright(c, kx + kw / 2, ky + kh / 2 + ks * .36, mir, u => sayRuns(u, P.kicker, ks, KICK_FONT, shade(P.main, 0, .2), shade(P.main, 0, .45), 'center'));
    c.restore();
  }
  /* the card with the whole logo */
  const cx = IC.x + IC.w / 2, cy = (IC.top + IC.bot) / 2;
  c.save(); c.translate(cx, cy); c.scale(ph.cardS, ph.cardS); c.translate(-cx, -cy);
  const card = new Path2D(); addPoly(card, rrPts(IC.x, IC.top, IC.x + IC.w, IC.bot, IC.rad));
  if (shadowsOn) { c.save(); shadowOn(c, 'rgba(0,0,0,.32)', 24, 10); c.fillStyle = P.c3; c.fill(card); c.restore(); }
  c.fillStyle = ivory(IC.top, IC.bot); c.fill(card);
  linePath(c, rrPts(IC.x, IC.top, IC.x + IC.w, IC.bot, IC.rad), true); c.strokeStyle = plate; c.lineWidth = 4; c.stroke();
  linePath(c, rrPts(IC.x + 8, IC.top + 8, IC.x + IC.w - 8, IC.bot - 8, IC.rad - 7), true); c.strokeStyle = alphaOf(M[2], .45); c.lineWidth = 1.2; c.stroke();
  const lw = 132, ltop = cy - lw * LOGO_H / 2;
  fullLogo(c, cx, ltop, lw, { flower: P.c2 || '#6c7881', gold: mixHex(M[1], M[2], .55), draw: ph.draw, words: ph.words, mir });
  if (P.shine && ph.built > 0) emblemShine(c, cx, ltop + lw * .32, lw * .32, { phase: shinePhase(P, t, 8), len: .1, color: '#ffffff', glow: 3, blur: dev(), alpha: .45 * ph.built });
  c.restore();
  c.restore();

  /* the title on the bar, the subtitle on the strip */
  c.save(); c.globalAlpha *= ph.textA * ph.cardA;
  { const size = fit(c, P.title, tSize0, tf, tR - L - 50);
    reveal(c, { x: L, y: IC.barTop, w: tR - L + 12, h: IC.barBot - IC.barTop }, ph.txP, x => say(x, P.title, tR, (IC.barTop + IC.barBot) / 2 + size * .36, size, tf, P.text, mir)); }
  if (hasSub) { const size = fit(c, P.subtitle, ssize, sf, tR - L - 60);
    reveal(c, { x: L + 14, y: IC.barBot, w: tR - L, h: IC.stripBot - IC.barBot }, ph.subP, x => say(x, P.subtitle, tR, (IC.barBot + IC.stripBot) / 2 + size * .36, size, sf, P.c1, mir)); }
  c.restore();
  if (P.particles && ph.built > 0) [[IC.x + 10, IC.top + 12], [IC.x + IC.w - 12, IC.bot - 14], [L + IC.slant, IC.barTop]].forEach(([x, y], i) => {
    const k = Math.max(0, Math.sin(t * (1 + .2 * i) + i * 2.3)) ** 12; sparkle(c, x, y, 4 + 6 * k, '#ffffff', k * ph.built); });
  c.restore();
  unit = 1;
}

/* =========================================================
   NIGHT IDENTITY (rp-night): a new design
   A deep navy panel, quiet and modern, with the whole logo on a white tile set into its right end. A fine gold rule
   stands between the logo and the words: «هداية 2026» in gold above the title, the title in white, the subtitle muted,
   and a gold line under them that draws itself. The panel opens out of the tile and closes back into it.
   ========================================================= */
const NI = { right: 1192, top: 448, bot: 648, rad: 24, tile: { x: 1036, top: 460, bot: 636, w: 144, rad: 16 }, rule: 1012 };

function nightPhases(s) {
  const { b, m } = s;
  if (s.dir === 'out') {
    const e = 1 - b;
    return { tileA: 1 - EZ.inOut(S(e, .64, 1)), tileS: 1 - .05 * S(e, .64, 1), draw: 1, words: 1, open: 1 - EZ.inOut(S(e, .22, .66)), rule: 1 - S(e, 0, .2),
      kick: 1 - S(e, 0, .2), textA: 1 - S(e, 0, .2), txP: 1, subP: 1, line: 1 - EZ.inOut(S(e, 0, .25)), built: 1 - S(e, 0, .15) };
  }
  return { tileA: S(b, 0, .14), tileS: .86 + .14 * EZ.back(S(b, 0, .24), m * .4), draw: EZ.inOut(S(b, .08, .4)), words: S(b, .22, .44),
    open: EZ.inOut(S(b, .26, .6)), rule: EZ.out(S(b, .46, .62)), kick: EZ.out(S(b, .52, .72)), textA: 1, txP: S(b, .56, .8), subP: S(b, .64, .88),
    line: EZ.inOut(S(b, .7, .96)), built: S(b, .85, 1) };
}

function drawNight(ctx, P, t) {
  const s = rstate(P, t); if (s.b < .0006) return;
  const M = metalOf(P), c = ctx, ph = nightPhases(s), T = NI.tile;
  unit = 1;
  const tf = titleFont(P), sf = subFont(P), hasSub = Boolean(P.subtitle && P.subtitle.trim()), hasKick = Boolean(P.kicker && P.kicker.trim());
  const tSize0 = 46, ssize = 22, ks = 20, tR = NI.rule - 24;
  const textW = Math.max(widthOf(c, P.title, tSize0, tf), hasSub ? widthOf(c, P.subtitle, ssize, sf) : 0, hasKick ? widthOf(c, P.kicker, ks, KICK_FONT) : 0, 280);
  const L = P.span === 'full' ? 220 : clamp(tR - textW - 56, 220, tR - 330);
  c.save();
  const mir = place(c, P, { x0: L - 10, x1: NI.right + 10, y0: NI.top - 6, y1: NI.bot + 14 }, NI.right, 646);
  const shadowsOn = P.dropShadow !== false, gold = metalBevel(c, 0, NI.top, 0, NI.bot, M);
  const panelPts = rrPts(L, NI.top, NI.right, NI.bot, NI.rad), panel = new Path2D(); addPoly(panel, panelPts);
  const reach = lerp(T.x + 20, L - 4, ph.open);

  c.save(); c.globalAlpha *= ph.tileA;
  /* the panel, opening out of the tile */
  if (ph.open > .001) {
    c.save(); if (ph.open < 1) { c.beginPath(); c.rect(reach, 0, 1400, 720); c.clip(); }
    if (shadowsOn) { c.save(); shadowOn(c, 'rgba(0,0,0,.4)', 26, 10); c.fillStyle = P.main; c.fill(panel); c.restore(); }
    const g = c.createLinearGradient(0, NI.top, 0, NI.bot); g.addColorStop(0, shade(P.main, 255, .1)); g.addColorStop(1, shade(P.main, 0, .3)); c.fillStyle = g; c.fill(panel);
    c.save(); c.clip(panel);
    const amt = clamp((Number(P.patternAmt) || 0) / 100);
    if (P.pattern && P.pattern !== 'none' && amt > 0) {
      const box = { x: L, y: NI.top, w: NI.right - L, h: NI.bot - NI.top };
      masked(c, 'pattern', box, x => { x.save(); x.globalAlpha = .45 * amt; fillPattern(x, P.pattern, M[3], box); x.restore(); }, x => {
        const g2 = x.createLinearGradient(T.x, 0, L, 0); g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(.4, 'rgba(0,0,0,.2)'); g2.addColorStop(1, 'rgba(0,0,0,1)'); return g2; });
    }
    const gl = c.createLinearGradient(0, NI.top, 0, NI.top + 60); gl.addColorStop(0, 'rgba(255,255,255,.08)'); gl.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gl; c.fillRect(L, NI.top, NI.right - L, 60);
    c.restore();
    linePath(c, panelPts, true); c.strokeStyle = alphaOf(M[3], .55); c.lineWidth = 1.5; c.stroke();
    c.restore();
  }
  /* the gold rule between the logo and the words */
  if (ph.rule > .01) {
    const my = (NI.top + NI.bot) / 2, hh = 64 * ph.rule;
    c.save(); c.globalAlpha *= ph.textA; c.strokeStyle = gold; c.lineWidth = 2.5; c.lineCap = 'round'; c.beginPath(); c.moveTo(NI.rule, my - hh); c.lineTo(NI.rule, my + hh); c.stroke(); c.restore();
  }
  /* the white tile with the whole logo */
  const cx = T.x + T.w / 2, cy = (T.top + T.bot) / 2;
  c.save(); c.translate(cx, cy); c.scale(ph.tileS, ph.tileS); c.translate(-cx, -cy);
  const tile = new Path2D(); addPoly(tile, rrPts(T.x, T.top, T.x + T.w, T.bot, T.rad));
  if (shadowsOn) { c.save(); shadowOn(c, 'rgba(0,0,0,.35)', 16, 5); c.fillStyle = P.c3; c.fill(tile); c.restore(); }
  const tg = c.createLinearGradient(0, T.top, 0, T.bot); tg.addColorStop(0, shade(P.c3, 255, .7)); tg.addColorStop(1, shade(P.c3, 0, .04)); c.fillStyle = tg; c.fill(tile);
  linePath(c, rrPts(T.x, T.top, T.x + T.w, T.bot, T.rad), true); c.strokeStyle = gold; c.lineWidth = 2.5; c.stroke();
  const lw = 112, ltop = cy - lw * LOGO_H / 2;
  fullLogo(c, cx, ltop, lw, { flower: P.c2 || '#6c7881', gold: mixHex(M[1], M[2], .55), draw: ph.draw, words: ph.words, mir });
  if (P.shine && ph.built > 0) emblemShine(c, cx, ltop + lw * .32, lw * .32, { phase: shinePhase(P, t, 8), len: .1, color: '#ffffff', glow: 3, blur: dev(), alpha: .45 * ph.built });
  c.restore();
  c.restore();

  /* «هداية 2026», the title, the subtitle and the gold line under them */
  const kY = NI.top + 48, tY = NI.top + 106, sY = NI.top + 146, lineY = NI.top + 166;
  c.save(); c.globalAlpha *= ph.textA * ph.tileA;
  if (hasKick && ph.kick > .01) {
    c.save(); c.globalAlpha *= ph.kick;                       // anchored at the rule, growing away from the logo on either side
    upright(c, tR + (1 - ph.kick) * 18, kY, mir, u => sayRuns(u, P.kicker, ks, KICK_FONT, M[3], M[4], mir ? 'left' : 'right'));
    c.restore();
  }
  { const size = fit(c, P.title, tSize0, tf, tR - L - 40);
    reveal(c, { x: L, y: tY - size, w: tR - L + 12, h: size * 1.4 }, ph.txP, x => say(x, P.title, tR, tY, size, tf, P.text, mir)); }
  if (hasSub) { const size = fit(c, P.subtitle, ssize, sf, tR - L - 40);
    reveal(c, { x: L, y: sY - size, w: tR - L + 12, h: size * 1.5 }, ph.subP, x => say(x, P.subtitle, tR, sY, size, sf, P.c1, mir)); }
  if (ph.line > .001) {
    const len = Math.min(tR - L - 30, textW) * ph.line;
    c.save(); c.strokeStyle = metalBevel(c, 0, lineY - 2, 0, lineY + 2, M); c.lineWidth = 2.5; c.lineCap = 'round'; c.beginPath(); c.moveTo(tR, lineY); c.lineTo(tR - len, lineY); c.stroke();
    c.fillStyle = M[3]; c.beginPath(); c.arc(tR - len, lineY, 3.2, 0, TAU); c.fill(); c.restore();
  }
  c.restore();
  if (P.particles && ph.built > 0) [[T.x - 6, T.top + 10], [T.x + T.w, T.bot - 12], [tR, lineY]].forEach(([x, y], i) => {
    const k = Math.max(0, Math.sin(t * (1 + .2 * i) + i * 2.3)) ** 12; sparkle(c, x, y, 4 + 6 * k, '#ffffff', k * ph.built); });
  c.restore();
  unit = 1;
}

const BASE = { speed: 1, glow: false, particles: false, dropShadow: true, shine: true, shineSpeed: 1, side: 'right', size: 100, lift: 0, mIn: 60, mOut: 50, mIdle: 60, tHold: 4, tOut: 1.4 };
export const RIBBONS = [
  { id: 'rp-liquid', name: 'Liquid Gold', raw: true, draw: drawLiquid, timing: P => ({ total: rtotal(P) }),
    defaults: { ...BASE, tIn: 3.2, title: 'أثر يمتد', subtitle: 'مركز الاتصال المؤسسي', kicker: '', main: '#11233a', text: '#fbf3df', c1: '#22180a', accent: '#c9993f',
      metal: 'gold', pattern: 'emblem', patternAmt: 18, font: 'plex', span: 'auto', flow: 60 } },
  { id: 'rp-identity', name: 'Ivory Identity Card', raw: true, draw: drawIdentity, timing: P => ({ total: rtotal(P) }),
    defaults: { ...BASE, tIn: 2.8, title: 'أثر يمتد', subtitle: 'مركز الاتصال المؤسسي', kicker: 'هداية 2026', main: '#3b4b59', text: '#f7f2e7', c1: '#34424e', c2: '#6c7881', c3: '#f8f4eb', accent: '#c9993f',
      metal: 'gold', pattern: 'emblem', patternAmt: 20, font: 'plex', span: 'auto' } },
  { id: 'rp-night', name: 'Night Identity', raw: true, draw: drawNight, timing: P => ({ total: rtotal(P) }),
    defaults: { ...BASE, tIn: 2.8, title: 'أثر يمتد', subtitle: 'مركز الاتصال المؤسسي', kicker: 'هداية 2026', main: '#10202f', text: '#ffffff', c1: '#aebdcb', c2: '#6c7881', c3: '#ffffff', accent: '#c9993f',
      metal: 'gold', pattern: 'girih', patternAmt: 18, font: 'plex', span: 'auto' } },
];

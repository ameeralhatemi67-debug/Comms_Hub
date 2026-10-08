/* Extra video-frame designs (full-frame overlays with a window for the user's clip). Same kit as renderers.js. */
import { kit } from './renderers.js';

const { E, EZ, S, TAU, clamp, lerp, frac, rnd, rgba, shade, rr, safeArc, shadow, noShadow, metalV, txt, textW, fitSize, revealBox,
  drawLogo, layer, blit, cut, grain, verse, lockup, waveform, contact, socials, bokeh, plaque, stdProgress, fstate, ftotal,
  dimsOf, orient, starLattice, stackBlock } = kit;
const isAr = s => /[؀-ۿ]/.test(s || '');
const star8 = (c, x, y, r, rot = 0) => {              // eight-pointed khatam: two squares
  c.save(); c.translate(x, y); c.rotate(rot); c.beginPath();
  for (let k = 0; k < 2; k++) { for (let i = 0; i < 4; i++) { const a = k * Math.PI / 4 + i * Math.PI / 2 + Math.PI / 4, px = Math.cos(a) * r, py = Math.sin(a) * r; i ? c.lineTo(px, py) : c.moveTo(px, py); } c.closePath(); }
  c.restore();
};

/* =========================================================
   Shared layout slots and the standard info block (logo, verse, wave, contact, socials)
   ========================================================= */
function slots(D) {
  const o = orient(D);
  if (o === 'p') return { o, cx: 540, logo: { cx: 540, top: 56, ww: 150 }, verse: { cx: 540, y: 268, w: 860 }, area: { x: 120, y: 590, w: 840, h: 950 }, wave: { cx: 540, y: 1596, w: 420, h: 34 }, contact: { y: 1650, k: .95 }, soc: { y: 1866, k: .82 } };
  if (o === 'l') return { o, cx: 1510, col: { cx: 1510, y: 70, w: 700 }, area: { x: 110, y: 110, w: 990, h: 860 } };
  if (D.h === D.w) return { o, cx: 540, logo: { cx: 540, top: 22, ww: 86 }, verse: { cx: 540, y: 136, w: 560 }, area: { x: 200, y: 318, w: 680, h: 520 }, wave: { cx: 540, y: 866, w: 300, h: 24 }, contact: { y: 900, k: .62 }, soc: { y: 1046, k: .6 } };
  return { o, cx: 540, logo: { cx: 540, top: 30, ww: 110 }, verse: { cx: 540, y: 178, w: 700 }, area: { x: 150, y: 405, w: 780, h: 690 }, wave: { cx: 540, y: 1128, w: 340, h: 26 }, contact: { y: 1166, k: .72 }, soc: { y: 1316, k: .66 } };
}
const inset = (a, x, y = x) => ({ x: a.x + x, y: a.y + y, w: a.w - 2 * x, h: a.h - 2 * y });
function info(ctx, P, s, D, L, pal, pr, skip = {}) {
  const { m, id, t } = s;
  if (L.o === 'l') { ctx.save(); ctx.translate(L.col.cx, L.col.y); stackBlock(ctx, P, s, pal, pr, L.col.w); ctx.restore(); return; }
  if (P.showLogo && !skip.logo) lockup(ctx, L.logo.cx, L.logo.top, L.logo.ww, pal.logo, pr.logo, t, id, m);
  if (P.showVerse && !skip.verse) verse(ctx, pal.verse, L.verse.cx, L.verse.y, L.verse.w, pr.v1, pr.v2, pal.verseGlow, pal.verseBlur);
  if (P.showWave && !skip.wave) waveform(ctx, L.wave.cx - L.wave.w / 2, L.wave.y, L.wave.w, L.wave.h, pal.wave, pr.wave, s.play, t, id);
  if (!skip.contact) contact(ctx, P, L.cx, L.contact.y, L.contact.k, pal, pr.contact);
  if (P.showSocial && !skip.soc) socials(ctx, P, L.cx, L.soc.y, L.soc.k, pal, pr.soc, 'center', 1, D.w * .92);
}
const dashPer = (w, h, off) => 2 * (w + h) + 8 * off;
const mmss = v => { const n = Math.max(0, Math.floor(v)); return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0'); };

/* =========================================================
   Frame 1: IMPACT PORTAL
   ripples spread from the window, three gold outlines draw themselves around it, light rays turn behind
   ========================================================= */
const PORTAL = {
  lay(D) { const L = slots(D), a = L.area; L.win = L.o === 'l' ? inset(a, 30, 50) : inset(a, 36, 56); return L; },
  draw(ctx, P, t) {
    const D = dimsOf(P), L = this.lay(D), s = fstate(P, t), { b, m, id } = s, W2 = L.win;
    const bgA = P.bgIn ? EZ.out(S(b, 0, .2)) : 1; if (bgA <= .002) return;
    ctx.save(); ctx.globalAlpha *= bgA;
    const deep = P.c1, gold = P.c2, ivory = P.c3, aqua = P.c4, goldL = shade(gold, 255, .45), wcx = W2.x + W2.w / 2, wcy = W2.y + W2.h / 2, kk = Math.min(D.w, D.h) / 1080, rc = Math.min(W2.w, W2.h) * .12, big = Math.hypot(D.w, D.h);
    blit(ctx, layer('portal|' + deep + aqua, D, x => {
      const g = x.createRadialGradient(wcx, wcy, 0, wcx, wcy, big * .62); g.addColorStop(0, shade(deep, 255, .22)); g.addColorStop(.55, deep); g.addColorStop(1, shade(deep, 0, .55)); x.fillStyle = g; x.fillRect(0, 0, D.w, D.h);
      const gl = x.createRadialGradient(wcx, wcy, Math.min(W2.w, W2.h) * .35, wcx, wcy, Math.max(W2.w, W2.h) * .95); gl.addColorStop(0, rgba(aqua, .3)); gl.addColorStop(1, rgba(aqua, 0)); x.fillStyle = gl; x.fillRect(0, 0, D.w, D.h);
    }), D);
    const rayA = EZ.out(S(b, .04, .5));                                      // rays turning behind the window
    if (rayA > .01) {
      ctx.save(); ctx.translate(wcx, wcy); ctx.rotate(t * .035 * (.4 + id)); const n = 18;
      for (let i = 0; i < n; i++) { const a = i / n * TAU, hw = .05 + .018 * Math.sin(i * 2.1); ctx.fillStyle = rgba(goldL, .07 * rayA * (.55 + .45 * Math.sin(t * .6 + i * 1.7))); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a - hw) * big, Math.sin(a - hw) * big); ctx.lineTo(Math.cos(a + hw) * big, Math.sin(a + hw) * big); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    }
    for (let k = 0; k < 3; k++) {                                            // ripples: the "impact"
      const intro = S(b, .16 + k * .07, .62 + k * .07), u = id > .02 ? frac(t / 4.4 + k / 3) : 0, introOn = s.dir === 'in' && b < 1;
      const a = (introOn ? Math.sin(Math.PI * intro) * (.2 + .4 * m) : 0) + (u > 0 ? (1 - u) * .3 * id : 0);
      if (a <= .004) continue; const off = 70 + (introOn ? intro : u) * Math.min(D.w, D.h) * .32;
      ctx.save(); ctx.strokeStyle = goldL; ctx.globalAlpha *= a; ctx.lineWidth = 2.2 * kk + 1; rr(ctx, W2.x - off, W2.y - off, W2.w + 2 * off, W2.h + 2 * off, rc + off); ctx.stroke(); ctx.restore();
    }
    const plateP = EZ.out(S(b, .12, .5));                                    // dark plate under the outlines
    ctx.save(); shadow(ctx, 'rgba(0,0,0,.55)', 34, 12); rr(ctx, W2.x - 30, W2.y - 30, W2.w + 60, W2.h + 60, rc + 30); ctx.fillStyle = rgba(shade(deep, 0, .55), .88 * plateP); ctx.fill(); noShadow(ctx); ctx.restore();
    ctx.save(); ctx.lineJoin = 'round';
    [[18, 3.4, gold, 1], [40, 1.8, goldL, .75], [64, 1.2, gold, .42]].forEach(([off, lw, col, a], i) => {
      const p = EZ.inOut(S(b, .14 + i * .1, .58 + i * .1)); if (p <= 0) return; const per = dashPer(W2.w, W2.h, off) + 200;
      rr(ctx, W2.x - off, W2.y - off, W2.w + 2 * off, W2.h + 2 * off, rc + off); ctx.setLineDash([per * p, per]); ctx.strokeStyle = col; ctx.globalAlpha = a; ctx.lineWidth = lw * (.6 + .4 * kk + .4); ctx.stroke();
    });
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    if (id > .02) { const off = 40, per = dashPer(W2.w, W2.h, off) + 200; rr(ctx, W2.x - off, W2.y - off, W2.w + 2 * off, W2.h + 2 * off, rc + off); ctx.setLineDash([210, per]); ctx.lineDashOffset = -((t * 320) % per); ctx.strokeStyle = `rgba(255,246,214,${id})`; ctx.lineWidth = 4.4; shadow(ctx, gold, 16); ctx.stroke(); }
    ctx.restore();
    const wo = Math.min(1, EZ.back(S(b, .2, .56), m * .5));                    // window opens like an iris
    cut(ctx, () => { ctx.save(); ctx.translate(wcx, wcy); ctx.scale(Math.max(.001, wo), Math.max(.001, wo)); ctx.translate(-wcx, -wcy); rr(ctx, W2.x, W2.y, W2.w, W2.h, rc); ctx.restore(); }, Math.min(1, wo * 3));
    [[W2.x - 40, W2.y - 40], [W2.x + W2.w + 40, W2.y - 40], [W2.x + W2.w + 40, W2.y + W2.h + 40], [W2.x - 40, W2.y + W2.h + 40]].forEach(([mx, my], i) => {
      const q = EZ.back(S(b, .38 + i * .05, .66 + i * .05), m); if (q <= .01) return; const r = 15 * (.7 + .5 * kk) * q;
      ctx.save(); ctx.translate(mx, my); ctx.rotate((1 - q) * 2 + t * .3 * id * (i % 2 ? -1 : 1)); shadow(ctx, 'rgba(0,0,0,.5)', 10, 3); ctx.fillStyle = metalV(ctx, -r, r, gold); star8(ctx, 0, 0, r * 1.3); ctx.fill(); noShadow(ctx); ctx.fillStyle = shade(deep, 0, .4); star8(ctx, 0, 0, r * .5, Math.PI / 8); ctx.fill(); ctx.restore();
    });
    const pr = stdProgress(b), pal = { verse: ivory, verseGlow: rgba(gold, .4), verseBlur: 12, support: gold, phone: ivory, chip: gold, glyph: shade(deep, 0, .45), text: ivory, wave: gold, name: gold, logo: { em: gold, word: ivory, tag: ivory } };
    info(ctx, P, s, D, L, pal, pr);
    plaque(ctx, P.reciter, wcx, W2.y + W2.h + (L.o === 'l' ? 12 : 40), L.o === 'l' ? .9 : Math.min(1, W2.w / 700), { fill: rgba(shade(deep, 0, .5), .96), line: gold, text: shade(gold, 255, .55) }, pr.name);
    if (P.particles) bokeh(ctx, { x: 0, y: 0, w: D.w, h: D.h }, t, 28, goldL, .8 * EZ.out(S(b, .3, .8)), 33, 2, 5, 18, false);
    ctx.restore();
  }
};

/* =========================================================
   Frame 2: COVERAGE FRAME
   a clean broadcast frame: corner brackets draw, the live tag and a running timecode appear, a lower-third bar carries
   the headline, and a thin timeline follows the clip
   ========================================================= */
const BROADCAST = {
  lay(D) {
    const L = slots(D);
    if (L.o === 'p') { L.logo = { cx: 214, top: 54, ww: 128 }; L.verse = { cx: 540, y: 262, w: 800 }; L.win = { x: 90, y: 566, w: 900, h: 960 }; L.bar = { x: 120, y: 1450, w: 860, h: 170 }; L.tl = 1650; L.kick = { x: 1000, y: 96 }; L.contact = { y: 1706, k: .8 }; L.soc = { y: 1868, k: .78 }; }
    else if (L.o === 'l') { L.win = { x: 110, y: 120, w: 990, h: 700 }; L.bar = { x: 150, y: 740, w: 930, h: 150 }; L.tl = 930; L.kick = { x: 1100, y: 70 }; }
    else if (D.h === D.w) { L.logo = { cx: 150, top: 20, ww: 80 }; L.verse = { cx: 540, y: 130, w: 540 }; L.win = { x: 140, y: 296, w: 800, h: 470 }; L.bar = { x: 160, y: 690, w: 760, h: 130 }; L.tl = 846; L.kick = { x: 960, y: 56 }; }
    else { L.logo = { cx: 170, top: 28, ww: 100 }; L.verse = { cx: 540, y: 172, w: 680 }; L.win = { x: 100, y: 380, w: 880, h: 700 }; L.bar = { x: 120, y: 1000, w: 840, h: 140 }; L.tl = 1172; L.kick = { x: 980, y: 82 }; L.contact = { y: 1196, k: .62 }; L.soc = { y: 1322, k: .64 }; }
    return L;
  },
  draw(ctx, P, t) {
    const D = dimsOf(P), L = this.lay(D), s = fstate(P, t), { b, m, id, play } = s, W2 = L.win;
    const bgA = P.bgIn ? EZ.out(S(b, 0, .2)) : 1; if (bgA <= .002) return;
    ctx.save(); ctx.globalAlpha *= bgA;
    const paper = P.c1, em = P.c2, ink = P.c3, gold = P.c4, kk = Math.min(D.w, D.h) / 1080;
    blit(ctx, layer('bc|' + paper + em + gold, D, x => {
      const g = x.createLinearGradient(0, 0, 0, D.h); g.addColorStop(0, shade(paper, 255, .5)); g.addColorStop(1, shade(paper, 0, .06)); x.fillStyle = g; x.fillRect(0, 0, D.w, D.h);
      x.fillStyle = rgba(em, .08); for (let yy = 24; yy < D.h; yy += 36) for (let xx = (yy / 36 % 2) * 18 + 12; xx < D.w; xx += 36) { x.beginPath(); x.arc(xx, yy, 1.5, 0, TAU); x.fill(); }
      const th = 12 * Math.max(.7, D.h / 1080); x.fillStyle = em; x.fillRect(0, 0, D.w, th); x.fillStyle = gold; x.fillRect(D.w * .62, 0, D.w * .09, th);
    }), D);
    const wp = EZ.out(S(b, .12, .46)), rcw = 16 * kk + 4;
    ctx.save(); ctx.globalAlpha *= wp; shadow(ctx, rgba(em, .35), 26, 10); rr(ctx, W2.x - 6, W2.y - 6, W2.w + 12, W2.h + 12, rcw + 6); ctx.fillStyle = '#FFFFFF'; ctx.fill(); noShadow(ctx); ctx.restore();
    const wo = Math.min(1, EZ.back(S(b, .14, .5), m * .4)), wcx = W2.x + W2.w / 2, wcy = W2.y + W2.h / 2;
    cut(ctx, () => { ctx.save(); ctx.translate(wcx, wcy); ctx.scale(Math.max(.001, wo), Math.max(.001, wo)); ctx.translate(-wcx, -wcy); rr(ctx, W2.x, W2.y, W2.w, W2.h, rcw); ctx.restore(); }, Math.min(1, wo * 3));
    /* corner brackets */
    const span = 96 * kk + 30, off = 22 * kk + 6;
    [[W2.x - off, W2.y - off, 1, 1], [W2.x + W2.w + off, W2.y - off, -1, 1], [W2.x + W2.w + off, W2.y + W2.h + off, -1, -1], [W2.x - off, W2.y + W2.h + off, 1, -1]].forEach(([x, y, dx, dy], i) => {
      const q = EZ.outQ(S(b, .24 + i * .06, .6 + i * .06)); if (q <= 0) return;
      ctx.save(); ctx.lineCap = 'square'; ctx.lineJoin = 'miter'; ctx.strokeStyle = em; ctx.lineWidth = 7 * kk + 2; ctx.beginPath(); ctx.moveTo(x, y + dy * span * q); ctx.lineTo(x, y); ctx.lineTo(x + dx * span * q, y); ctx.stroke();
      ctx.strokeStyle = gold; ctx.lineWidth = 3 * kk + 1; ctx.beginPath(); ctx.moveTo(x + dx * 12 * kk, y + dy * span * .55 * q); ctx.lineTo(x + dx * 12 * kk, y + dy * 12 * kk); ctx.lineTo(x + dx * span * .55 * q, y + dy * 12 * kk); ctx.stroke(); ctx.restore();
    });
    /* live tag + timecode, straddling the window's top edge */
    const kp = EZ.back(S(b, .5, .76), m * .7);
    if (kp > .01) {
      const fs = 30 * kk + 6, tag = P.kicker || 'مباشر', th = fs * 1.9, tw = textW(ctx, tag, fs, 800) + th + 20 * kk, kx = Math.min(L.kick.x, W2.x + W2.w - 10), ky = W2.y - 10;
      ctx.save(); ctx.translate(kx, ky); ctx.scale(Math.max(.02, kp), Math.max(.02, kp)); ctx.globalAlpha *= Math.min(1, kp);
      shadow(ctx, 'rgba(0,0,0,.3)', 14, 5); rr(ctx, -tw, -th / 2, tw, th, th / 2); ctx.fillStyle = em; ctx.fill(); noShadow(ctx);
      const pulse = id > .02 ? .5 + .5 * Math.sin(t * 5) : 1; ctx.fillStyle = '#FF5A4D'; ctx.save(); ctx.globalAlpha *= .55 + .45 * pulse; ctx.beginPath(); safeArc(ctx, -tw + th * .5, 0, th * .15, 0, TAU); ctx.fill(); ctx.restore();
      txt(ctx, tag, -th * .5, fs * .36, fs, 800, '#FFFFFF', 'right');
      const cw = textW(ctx, '00:00', fs * .78, 700) + 30 * kk + 10, cx0 = -tw - 12 - cw; rr(ctx, cx0, -th * .38, cw, th * .76, th * .38); ctx.fillStyle = '#FFFFFF'; ctx.fill(); ctx.strokeStyle = rgba(em, .4); ctx.lineWidth = 1.4; ctx.stroke();
      ctx.font = `700 ${fs * .78}px "Segoe UI",Tahoma,sans-serif`; ctx.direction = 'ltr'; ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(mmss(Math.max(0, t - Math.max(.3, P.tIn))), cx0 + cw / 2, fs * .28); ctx.restore();
    }
    /* lower-third bar */
    const B = L.bar, bp = EZ.outQ(S(b, .46, .82)), bx1 = B.x + B.w, bx0 = bx1 - B.w * bp;
    if (bp > .004) {
      ctx.save(); shadow(ctx, 'rgba(0,0,0,.35)', 26, 10); ctx.beginPath(); ctx.moveTo(bx1, B.y); ctx.lineTo(bx0 + 34 * kk, B.y); ctx.lineTo(bx0, B.y + B.h); ctx.lineTo(bx1, B.y + B.h); ctx.closePath();
      const g = ctx.createLinearGradient(bx0, 0, bx1, 0); g.addColorStop(0, shade(em, 0, .25)); g.addColorStop(1, em); ctx.fillStyle = g; ctx.fill(); noShadow(ctx);
      ctx.save(); ctx.clip(); const hl = ctx.createLinearGradient(0, B.y, 0, B.y + B.h); hl.addColorStop(0, 'rgba(255,255,255,.16)'); hl.addColorStop(.5, 'rgba(255,255,255,0)'); ctx.fillStyle = hl; ctx.fillRect(bx0, B.y, bx1 - bx0, B.h);
      drawLogo(ctx, 'emblem', '#FFFFFF', B.x + 150 * kk + 60, B.y + B.h / 2, B.h * 1.5, .06 * bp, .2 * Math.sin(t * .4) * id);
      if (id > .02) { const u = clamp(((t + .7) % 5) / 1.6), sx = lerp(bx1 + 80, bx0 - 100, EZ.inOut(u)), sg = ctx.createLinearGradient(sx - 70, 0, sx + 70, 0); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(.5, `rgba(255,255,255,${.2 * id})`); sg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.transform(1, 0, -.35, 1, 0, 0); ctx.translate(sx * .35, 0); ctx.fillStyle = sg; ctx.fillRect(sx - 70, B.y, 140, B.h); }
      ctx.restore();
      ctx.fillStyle = gold; ctx.fillRect(bx1 - 10 * kk - 4, B.y, 10 * kk + 4, B.h); ctx.restore();
      const tR = bx1 - 34 * kk - 18, tL = B.x + 70 * kk, aw = tR - tL, rtl = isAr(P.title), tp = S(b, .6, .88), sp = S(b, .72, .96);
      const f1 = fitSize(ctx, P.title, 62 * kk + 8, 800, aw), f2 = fitSize(ctx, P.subtitle, 34 * kk + 6, 600, aw);
      revealBox(ctx, { x: B.x, y: B.y, w: B.w, h: B.h * .6 }, tp, rtl, c => txt(c, P.title, rtl ? tR : tL, B.y + B.h * .5, f1, 800, '#FFFFFF', rtl ? 'right' : 'left'), 90);
      const rtl2 = isAr(P.subtitle);
      revealBox(ctx, { x: B.x, y: B.y + B.h * .55, w: B.w, h: B.h * .42 }, sp, rtl2, c => txt(c, P.subtitle, rtl2 ? tR : tL, B.y + B.h * .82, f2, 600, shade(em, 255, .78), rtl2 ? 'right' : 'left'), 70);
      if (P.reciter) {                                                     // name chip on the bar's top-left corner
        const np = EZ.back(S(b, .76, .98), m * .6), fs = 30 * kk + 6, w = textW(ctx, P.reciter, fs, 800) + 54, h = fs * 1.9;
        if (np > .01) { ctx.save(); ctx.translate(B.x + 24, B.y - h * .32); ctx.scale(Math.max(.02, np), Math.max(.02, np)); ctx.globalAlpha *= Math.min(1, np); shadow(ctx, 'rgba(0,0,0,.3)', 12, 4); rr(ctx, 0, -h / 2, w, h, h / 2); ctx.fillStyle = metalV(ctx, -h / 2, h / 2, gold); ctx.fill(); noShadow(ctx); txt(ctx, P.reciter, w / 2, fs * .36, fs, 800, shade(ink, 0, .3), 'center'); ctx.restore(); }
      }
    }
    /* timeline following the clip */
    const tp2 = EZ.out(S(b, .6, .9));
    if (tp2 > .01) {
      const x0 = W2.x, x1 = W2.x + W2.w, y = L.tl, h = 8 * kk + 3; ctx.save(); ctx.globalAlpha *= tp2;
      rr(ctx, x0, y, x1 - x0, h, h / 2); ctx.fillStyle = rgba(em, .16); ctx.fill();
      const fw = Math.max(h, (x1 - x0) * play); rr(ctx, x1 - fw, y, fw, h, h / 2); ctx.fillStyle = em; ctx.fill();
      ctx.fillStyle = gold; ctx.beginPath(); safeArc(ctx, x1 - fw + h / 2, y + h / 2, h * .95, 0, TAU); ctx.fill(); ctx.restore();
    }
    const pr = stdProgress(b), pal = { verse: shade(em, 0, .25), support: em, phone: ink, chip: em, glyph: paper, text: ink, wave: em, name: em, logo: { em: em, word: ink, tag: ink } };
    info(ctx, P, s, D, L, pal, pr, { wave: true });
    if (P.particles) bokeh(ctx, { x: 0, y: 0, w: D.w, h: D.h }, t, 14, gold, .35 * EZ.out(S(b, .3, .8)), 19, 3, 8, 12, true);
    ctx.restore();
  }
};

/* =========================================================
   Frame 3: MASHRABIYA DOORS
   a carved wooden wall with two lattice door leaves that swing open to reveal the window
   ========================================================= */
function leafStrips(ctx, cv, D, src, side, theta, W2) {
  const sc = cv.width / D.w, hinge = side === 'L' ? W2.x : W2.x + W2.w, dir = side === 'L' ? 1 : -1, N = 26, cosT = Math.cos(theta), sinT = Math.sin(theta), cy = src.y + src.h / 2, dw = src.w / N;
  for (let i = 0; i < N; i++) {
    const d0 = i * dw, d1 = (i + 1) * dw, u0 = d0 / src.w, u1 = d1 / src.w, h0 = src.h * (1 - .2 * sinT * u0), h1 = src.h * (1 - .2 * sinT * u1);
    const sx = side === 'L' ? src.x + d0 : src.x + src.w - d1, x0 = hinge + dir * d0 * cosT, x1 = hinge + dir * d1 * cosT, hh = (h0 + h1) / 2;
    ctx.drawImage(cv, sx * sc, src.y * sc, dw * sc, src.h * sc, Math.min(x0, x1) - .4, cy - hh / 2, Math.abs(x1 - x0) + .8, hh);
  }
  if (sinT > .02) {
    const xe = hinge + dir * src.w * cosT, he = src.h * (1 - .2 * sinT);
    ctx.save(); ctx.beginPath(); ctx.moveTo(hinge, cy - src.h / 2); ctx.lineTo(xe, cy - he / 2); ctx.lineTo(xe, cy + he / 2); ctx.lineTo(hinge, cy + src.h / 2); ctx.closePath(); ctx.fillStyle = `rgba(0,0,0,${.55 * sinT})`; ctx.fill(); ctx.restore();
  }
}
const DOORS = {
  lay(D) { const L = slots(D), a = L.area; L.win = inset(a, 40, 60); return L; },
  draw(ctx, P, t) {
    const D = dimsOf(P), L = this.lay(D), s = fstate(P, t), { b, m, id } = s, W2 = L.win;
    const bgA = P.bgIn ? EZ.out(S(b, 0, .2)) : 1; if (bgA <= .002) return;
    ctx.save(); ctx.globalAlpha *= bgA;
    const wood = P.c1, gold = P.c2, ivory = P.c3, carve = P.c4, goldL = shade(gold, 255, .45), kk = Math.min(D.w, D.h) / 1080, wcx = W2.x + W2.w / 2, wcy = W2.y + W2.h / 2, rc = 10 * kk + 4;
    blit(ctx, layer('doors-wall|' + wood + carve, D, (x, cv) => {
      const g = x.createLinearGradient(0, 0, 0, D.h); g.addColorStop(0, shade(wood, 255, .1)); g.addColorStop(1, shade(wood, 0, .3)); x.fillStyle = g; x.fillRect(0, 0, D.w, D.h);
      const pw = 104 * Math.max(.6, kk);
      for (let xx = 0, i = 0; xx < D.w; xx += pw, i++) { x.fillStyle = `rgba(255,255,255,${(rnd(i + 3) - .5) * .07})`; x.fillRect(xx, 0, pw, D.h); x.fillStyle = 'rgba(0,0,0,.4)'; x.fillRect(xx - 1.5, 0, 3, D.h); x.fillStyle = 'rgba(255,255,255,.06)'; x.fillRect(xx + 2, 0, 1.5, D.h); }
      for (let i = 0; i < 320; i++) { const gx = rnd(i * 1.7) * D.w, gy = rnd(i * 2.3) * D.h, len = 90 + rnd(i + 5) * 320; x.strokeStyle = rnd(i + 9) > .5 ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.04)'; x.lineWidth = 1 + rnd(i) * 1.2; x.beginPath(); x.moveTo(gx, gy); x.bezierCurveTo(gx + 8, gy + len * .3, gx - 8, gy + len * .6, gx + 3, gy + len); x.stroke(); }
      const vg = x.createRadialGradient(D.w / 2, D.h / 2, Math.min(D.w, D.h) * .3, D.w / 2, D.h / 2, Math.max(D.w, D.h) * .75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.4)'); x.fillStyle = vg; x.fillRect(0, 0, D.w, D.h); grain(x, cv, 6);
    }), D);
    /* carved frame around the window */
    const fp = EZ.inOut(S(b, .04, .42)), bandA = EZ.out(S(b, .02, .3));
    ctx.save(); ctx.globalAlpha *= bandA; shadow(ctx, 'rgba(0,0,0,.6)', 26, 10); rr(ctx, W2.x - 36, W2.y - 36, W2.w + 72, W2.h + 72, rc + 30); ctx.fillStyle = shade(wood, 0, .5); ctx.fill(); noShadow(ctx);
    rr(ctx, W2.x - 36, W2.y - 36, W2.w + 72, W2.h + 72, rc + 30); const bg = ctx.createLinearGradient(0, W2.y - 36, 0, W2.y + W2.h + 36); bg.addColorStop(0, rgba(carve, .35)); bg.addColorStop(1, rgba(carve, .05)); ctx.fillStyle = bg; ctx.fill(); ctx.restore();
    ctx.save(); ctx.lineJoin = 'round';
    [[34, 2.4, gold, 1, null], [20, 3.6, gold, 1, null], [27, 7, goldL, .55, [2, 11]]].forEach(([off, lw, col, a, dash]) => {
      const per = dashPer(W2.w, W2.h, off) + 200; rr(ctx, W2.x - off, W2.y - off, W2.w + 2 * off, W2.h + 2 * off, rc + off);
      ctx.setLineDash(dash ? [dash[0], dash[1]] : [per * fp, per]); ctx.globalAlpha = a * (dash ? fp : 1); ctx.strokeStyle = col; ctx.lineWidth = lw * (.5 + .5 * kk + .3); ctx.lineCap = dash ? 'round' : 'butt'; ctx.stroke();
    });
    ctx.restore();
    const sp = 40 * kk + 14;                                                  // row of khatam stars on the top and bottom rails
    for (const yy of [W2.y - 52 * kk - 12, W2.y + W2.h + 52 * kk + 12]) {
      const n = Math.floor((W2.w - 80) / sp);
      for (let i = 0; i <= n; i++) { const u = i / n, q = EZ.back(S(b, .22 + Math.abs(u - .5) * .3, .52 + Math.abs(u - .5) * .3), m); if (q <= .01) continue; ctx.fillStyle = gold; star8(ctx, W2.x + 40 + u * (W2.w - 80), yy, 7 * kk * q + 2 * q, Math.PI / 8); ctx.fill(); }
    }
    cut(ctx, () => rr(ctx, W2.x, W2.y, W2.w, W2.h, rc), 1);
    /* the door leaves */
    const openP = EZ.inOut(S(b, .32, .8)), theta = openP * 1.5;
    const leaf = layer('doors-leaf|' + wood + gold + carve + '|' + W2.x + ',' + W2.y + ',' + W2.w + ',' + W2.h, D, x => {
      const lw = W2.w / 2;
      [[W2.x, 0], [wcx, 1]].forEach(([lx, k]) => {
        const g = x.createLinearGradient(lx, 0, lx + lw, 0); g.addColorStop(0, shade(wood, 255, .2)); g.addColorStop(1, shade(wood, 255, .1)); x.fillStyle = g; x.fillRect(lx, W2.y, lw, W2.h);
        x.save(); x.beginPath(); x.rect(lx + 14, W2.y + 14, lw - 28, W2.h - 28); x.clip(); x.fillStyle = shade(wood, 0, .28); x.fillRect(lx, W2.y, lw, W2.h);
        x.strokeStyle = rgba(gold, .62); starLattice(x, W2.x, W2.y, W2.x + W2.w, W2.y + W2.h, Math.max(70, W2.w / 6.4), wcx, wcy, 1, 1e6, 2.2); x.restore();
        x.strokeStyle = gold; x.lineWidth = 3.2; x.strokeRect(lx + 14, W2.y + 14, lw - 28, W2.h - 28); x.strokeStyle = rgba(goldL, .5); x.lineWidth = 1.2; x.strokeRect(lx + 22, W2.y + 22, lw - 44, W2.h - 44);
        x.fillStyle = metalV(x, W2.y, W2.y + W2.h, gold);
        for (const [sx, sy] of [[lx + 14, W2.y + 14], [lx + lw - 14, W2.y + 14], [lx + 14, W2.y + W2.h - 14], [lx + lw - 14, W2.y + W2.h - 14]]) { x.beginPath(); x.arc(sx, sy, 7 * Math.max(.7, kk), 0, TAU); x.fill(); }
        x.fillStyle = 'rgba(0,0,0,.5)'; x.fillRect(k ? lx - 1 : lx + lw - 1.5, W2.y, 2.5, W2.h);
      });
      x.save(); const mr = Math.min(W2.w, W2.h) * .13; x.fillStyle = shade(wood, 0, .55); x.beginPath(); x.arc(wcx, wcy, mr, 0, TAU); x.fill(); x.strokeStyle = metalV(x, wcy - mr, wcy + mr, gold); x.lineWidth = 5; x.stroke();
      x.fillStyle = rgba(gold, .9); star8(x, wcx, wcy, mr * .86); x.fill(); x.fillStyle = shade(wood, 0, .5); star8(x, wcx, wcy, mr * .62, Math.PI / 8); x.fill(); x.restore();
      drawLogo(x, 'emblem', goldL, wcx, wcy, mr * 1.05, 1);
    });
    if (openP < .999) {
      ctx.save(); ctx.beginPath(); ctx.rect(W2.x - 2, W2.y - 2, W2.w + 4, W2.h + 4); ctx.clip();
      const lw = W2.w / 2; leafStrips(ctx, leaf, D, { x: W2.x, y: W2.y, w: lw, h: W2.h }, 'L', theta, W2); leafStrips(ctx, leaf, D, { x: wcx, y: W2.y, w: lw, h: W2.h }, 'R', theta, W2);
      if (openP > 0) {                                                       // light spilling through the gap
        ctx.globalCompositeOperation = 'lighter'; const a = (1 - openP) * Math.min(1, openP * 4) * .7;
        for (const sg of [-1, 1]) { const ex = wcx + sg * lw * Math.cos(theta), g2 = ctx.createLinearGradient(ex - sg * 70, 0, ex, 0); g2.addColorStop(0, 'rgba(255,214,130,0)'); g2.addColorStop(1, `rgba(255,214,130,${a})`); ctx.fillStyle = g2; ctx.fillRect(Math.min(ex, ex - sg * 70), W2.y, 70, W2.h); }
      }
      ctx.restore();
    }
    if (id > .02) { const off = 27, per = dashPer(W2.w, W2.h, off) + 200; ctx.save(); rr(ctx, W2.x - off, W2.y - off, W2.w + 2 * off, W2.h + 2 * off, rc + off); ctx.setLineDash([190, per]); ctx.lineDashOffset = -((t * 280) % per); ctx.strokeStyle = `rgba(255,244,205,${id})`; ctx.lineWidth = 4.6; shadow(ctx, gold, 14); ctx.stroke(); ctx.restore(); }
    const pr = stdProgress(b), pal = { verse: ivory, verseGlow: rgba(gold, .5), verseBlur: 14, support: gold, phone: ivory, chip: gold, glyph: shade(wood, 0, .5), text: ivory, wave: gold, name: gold, logo: { em: gold, word: ivory, tag: ivory } };
    info(ctx, P, s, D, L, pal, pr);
    plaque(ctx, P.reciter, wcx, W2.y + W2.h + (L.o === 'l' ? 14 : 52 * kk + 22), L.o === 'l' ? .9 : Math.min(1, W2.w / 700), { fill: rgba(shade(wood, 0, .45), .96), line: gold, text: shade(gold, 255, .55) }, pr.name);
    if (P.particles) bokeh(ctx, { x: 0, y: 0, w: D.w, h: D.h }, t, 22, '#FFD58A', .6 * EZ.out(S(b, .4, .9)), 47, 2, 4, 16, false);
    ctx.restore();
  }
};

/* =========================================================
   Frame 4: RECITATION SPECTRUM
   a deep teal stage: the window glows with the voice, a mirrored spectrum rises under it, the reciter's name leads
   ========================================================= */
const SPECTRUM = {
  lay(D) {
    const L = slots(D);
    if (L.o === 'p') { L.win = { x: 120, y: 590, w: 840, h: 700 }; L.name = { y: 1372, fs: 64 }; L.spec = { x: 100, w: 880, cy: 1512, amp: 104 }; L.contact = { y: 1612, k: .9 }; }
    else if (L.o === 'l') { L.win = { x: 110, y: 100, w: 990, h: 600 }; L.name = { y: 774, fs: 50 }; L.spec = { x: 110, w: 990, cy: 884, amp: 100 }; }
    else if (D.h === D.w) { L.win = { x: 200, y: 318, w: 680, h: 360 }; L.name = { y: 742, fs: 38 }; L.spec = { x: 170, w: 740, cy: 802, amp: 46 }; L.contact = { y: 884, k: .62 }; }
    else { L.win = { x: 150, y: 405, w: 780, h: 520 }; L.name = { y: 994, fs: 48 }; L.spec = { x: 120, w: 840, cy: 1072, amp: 68 }; L.contact = { y: 1150, k: .72 }; }
    return L;
  },
  draw(ctx, P, t) {
    const D = dimsOf(P), L = this.lay(D), s = fstate(P, t), { b, m, id, play } = s, W2 = L.win;
    const bgA = P.bgIn ? EZ.out(S(b, 0, .2)) : 1; if (bgA <= .002) return;
    ctx.save(); ctx.globalAlpha *= bgA;
    const deep = P.c1, gold = P.c2, ivory = P.c3, aqua = P.c4, goldL = shade(gold, 255, .4), kk = Math.min(D.w, D.h) / 1080, wcx = W2.x + W2.w / 2, wcy = W2.y + W2.h / 2, rc = 24 * kk + 8;
    blit(ctx, layer('spec|' + deep + aqua + '|' + W2.y + ',' + W2.h, D, x => {
      const g = x.createLinearGradient(0, 0, 0, D.h); g.addColorStop(0, shade(deep, 255, .06)); g.addColorStop(1, shade(deep, 0, .2)); x.fillStyle = g; x.fillRect(0, 0, D.w, D.h);
      const gl = x.createRadialGradient(wcx, L.spec.cy, 0, wcx, L.spec.cy, Math.max(D.w, D.h) * .6); gl.addColorStop(0, rgba(aqua, .22)); gl.addColorStop(1, rgba(aqua, 0)); x.fillStyle = gl; x.fillRect(0, 0, D.w, D.h);
      x.strokeStyle = rgba(aqua, .07); x.lineWidth = 1.5; for (let r = 90; r < Math.max(D.w, D.h); r += 90) { x.beginPath(); x.arc(wcx, wcy, r, 0, TAU); x.stroke(); }
    }), D);
    const env = clamp(.5 + .32 * Math.sin(t * 1.9 + Math.sin(t * .6) * 2) + .22 * Math.sin(t * .7), .12, 1), live = clamp(EZ.out(S(b, .3, .7)));
    /* window frame glowing with the voice */
    const fp = EZ.inOut(S(b, .08, .5)), glow = (.25 + .45 * env) * live;
    ctx.save(); ctx.globalAlpha *= EZ.out(S(b, .04, .3)); shadow(ctx, rgba(aqua, .5 + .4 * glow), 30 + 30 * glow); rr(ctx, W2.x - 14, W2.y - 14, W2.w + 28, W2.h + 28, rc + 14); ctx.fillStyle = shade(deep, 0, .55); ctx.fill(); noShadow(ctx); ctx.restore();
    ctx.save(); const per = dashPer(W2.w, W2.h, 14) + 200; rr(ctx, W2.x - 14, W2.y - 14, W2.w + 28, W2.h + 28, rc + 14); ctx.setLineDash([per * fp, per]); ctx.strokeStyle = gold; ctx.lineWidth = 3.2 * kk + 1.4; ctx.stroke(); ctx.restore();
    ctx.save(); ctx.globalAlpha *= fp; rr(ctx, W2.x - 28, W2.y - 28, W2.w + 56, W2.h + 56, rc + 28); ctx.strokeStyle = rgba(aqua, .25 + .35 * glow); ctx.lineWidth = 1.6; ctx.stroke(); ctx.restore();
    const wo = Math.min(1, EZ.back(S(b, .14, .52), m * .5));
    cut(ctx, () => { ctx.save(); ctx.translate(wcx, wcy); ctx.scale(Math.max(.001, wo), Math.max(.001, wo)); ctx.translate(-wcx, -wcy); rr(ctx, W2.x, W2.y, W2.w, W2.h, rc); ctx.restore(); }, Math.min(1, wo * 3));
    /* name */
    const np = EZ.out(S(b, .46, .76));
    if (P.reciter && np > .005) {
      const fs = fitSize(ctx, P.reciter, L.o === 'l' ? L.name.fs : L.name.fs, 800, W2.w * .9); ctx.save(); ctx.globalAlpha *= np; shadow(ctx, rgba(aqua, .5), 16);
      txt(ctx, P.reciter, wcx, L.name.y + (1 - np) * 18, fs, 800, ivory, 'center'); noShadow(ctx);
      const lw = Math.min(W2.w * .5, textW(ctx, P.reciter, fs, 800) * .6) * np; ctx.fillStyle = metalV(ctx, L.name.y + 12, L.name.y + 16, gold); ctx.fillRect(wcx - lw / 2, L.name.y + fs * .28, lw, 3 * kk + 1.4); ctx.restore();
    }
    /* mirrored spectrum */
    if (P.showWave) {
      const n = Math.max(24, Math.round(L.spec.w / (17 * kk + 5))), step = L.spec.w / n, bw = step * .56, ga = ctx.globalAlpha;
      ctx.save(); ctx.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1), dist = Math.abs(u - .5) * 2, q = EZ.out(S(b, .42 + dist * .18, .72 + dist * .18)); if (q <= .005) continue;
        const nz = clamp(Math.abs(Math.sin(i * .83 + t * 5.1) * Math.cos(i * .37 - t * 3.3) + .5 * Math.sin(i * 1.9 + t * 7.7)) / 1.5), shape = .42 + .58 * (1 - Math.pow(dist, 1.6));
        const hgt = Math.max(bw * .6, L.spec.amp * (.1 + .9 * Math.pow(nz, .75) * (.45 + .55 * env) * shape) * q), x = L.spec.x + (i + .5) * step, cy = L.spec.cy;
        const g = ctx.createLinearGradient(0, cy - hgt, 0, cy); g.addColorStop(0, goldL); g.addColorStop(1, aqua);
        ctx.globalAlpha = ga; ctx.strokeStyle = g; ctx.lineWidth = bw; ctx.beginPath(); ctx.moveTo(x, cy - 1); ctx.lineTo(x, cy - hgt); ctx.stroke();
        ctx.globalAlpha = ga * .3; ctx.strokeStyle = aqua; ctx.beginPath(); ctx.moveTo(x, cy + 3); ctx.lineTo(x, cy + hgt * .55); ctx.stroke();
      }
      ctx.globalAlpha = ga * EZ.out(S(b, .5, .8)); ctx.fillStyle = rgba(gold, .6); ctx.fillRect(L.spec.x, L.spec.cy - 1, L.spec.w, 2);
      const px = L.spec.x + L.spec.w * (1 - play); shadow(ctx, gold, 12); ctx.fillStyle = '#FFF4D2'; ctx.beginPath(); safeArc(ctx, px, L.spec.cy, 5 * kk + 2, 0, TAU); ctx.fill(); ctx.restore();
    }
    const pr = stdProgress(b), pal = { verse: ivory, verseGlow: rgba(aqua, .5), verseBlur: 14, support: goldL, phone: ivory, chip: gold, glyph: shade(deep, 0, .4), text: ivory, wave: gold, name: gold, logo: { em: gold, word: ivory, tag: ivory } };
    info(ctx, L.o === 'l' ? { ...P, showWave: false } : P, s, D, L, pal, pr, { wave: true });
    if (P.particles) bokeh(ctx, { x: 0, y: 0, w: D.w, h: D.h }, t, 24, aqua, .5 * EZ.out(S(b, .3, .8)), 71, 2, 6, 16, true);
    ctx.restore();
  }
};

export const FRAME_IMPLS = { portal: PORTAL, broadcast: BROADCAST, doors: DOORS, spectrum: SPECTRUM };
export { slots, inset, info, star8, isAr, dashPer, mmss };

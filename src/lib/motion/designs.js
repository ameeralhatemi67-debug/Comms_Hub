/* Extra Motion Studio designs, built on the same drawing kit as the source designs in renderers.js.
   Lower-thirds (repine) draw into the 1280 x 720 logical canvas; video frames pick their size from the chosen ratio. */
import { kit } from './renderers.js';
import { FRAME_IMPLS } from './designs-frames.js';
import { EXTRA_NUMBERS as NUMBERS } from './designs-numbers.js';

const { E, EZ, S, TAU, clamp, lerp, frac, rnd, rgba, shade, rr, safeArc, shadow, noShadow, metalV, sparkle, txt, textW, fitSize, revealBox,
  drawLogo, layer, blit, cut, grain, verse, lockup, waveform, contact, socials, bokeh, plaque, stdProgress, fstate, rstate, rtotal, ftotal,
  dimsOf, orient, nameText, starLattice } = kit;
const isAr = s => /[؀-ۿ]/.test(s || '');
const gs = () => kit.scale;
const star8 = (c, x, y, r, rot = 0) => {              // eight-pointed khatam: two squares
  c.save(); c.translate(x, y); c.rotate(rot); c.beginPath();
  for (let k = 0; k < 2; k++) { for (let i = 0; i < 4; i++) { const a = k * Math.PI / 4 + i * Math.PI / 2 + Math.PI / 4, px = Math.cos(a) * r, py = Math.sin(a) * r; i ? c.lineTo(px, py) : c.moveTo(px, py); } c.closePath(); }
  c.restore();
};
const glowLine = (c, x0, y0, x1, y1, col, w, blur) => { c.save(); shadow(c, col, blur); c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.restore(); };
const slant = (c, x0, x1, y, h, sl) => { c.beginPath(); c.moveTo(x1, y); c.lineTo(x0 + sl, y); c.lineTo(x0, y + h); c.lineTo(x1, y + h); c.closePath(); };
const showcase = (P, t) => { const tin = Math.max(.2, P.tIn), th = Math.max(0, P.tHold); return th > 0 ? clamp((t - tin) / th) : 1; };
const R_BASE = { speed: 1, glow: true, tHold: 4, tOut: 1.6, mIn: 60, mOut: 50, mIdle: 60 };

/* =========================================================
   Lower-third 1: EDITORIAL BAND
   a gold rule runs in, the emblem block pops, a slanted band wipes out of it, a subtitle strip slides from under it,
   and the rule becomes a progress line that follows the showcase
   ========================================================= */
function drawEditorial(ctx, P, t) {
  const s = rstate(P, t); if (s.b < .0006) return;
  const { b, m, id } = s, main = P.main, gold = P.accent, goldL = shade(gold, 255, .45), ink = shade(main, 0, .62);
  const R = 1150, blk = 124, top = 498, bandH = 82, subH = 42, x1 = R - blk, Lx = 150, sl = 28, bottom = top + bandH + subH;
  const ruleP = EZ.outQ(S(b, 0, .2)), blkP = EZ.back(S(b, .08, .32), m), bandP = EZ.outQ(S(b, .26, .62)), subP = EZ.outQ(S(b, .5, .82));
  const tabP = EZ.back(S(b, .6, .84), m), txP = S(b, .44, .74), stP = S(b, .66, .94), play = showcase(P, t);
  ctx.save(); ctx.translate(0, Math.sin(t * 1.1) * 1.8 * id);

  /* rule: dim full length, then a bright head that tracks the showcase */
  const ry = bottom + 16, rEnd = R - (R - Lx) * ruleP;
  if (ruleP > .004) {
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(gold, .4); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(R, ry); ctx.lineTo(rEnd, ry); ctx.stroke();
    const fillTo = lerp(R, Lx, ruleP >= 1 ? Math.max(.02, play) * EZ.out(S(b, .8, 1)) : 0);
    if (ruleP >= 1 && fillTo < R) glowLine(ctx, R, ry, fillTo, ry, goldL, 3, 10);
    if (ruleP < 1) { shadow(ctx, goldL, 14); ctx.fillStyle = '#fff'; ctx.beginPath(); safeArc(ctx, rEnd, ry, 3.6, 0, TAU); ctx.fill(); }
    ctx.restore();
  }

  /* main band, slanted leading edge */
  const xl = x1 - (x1 - Lx) * bandP;
  if (bandP > .004) {
    ctx.save(); shadow(ctx, 'rgba(0,0,0,.4)', 24, 10); slant(ctx, xl, x1 + 4, top, bandH, sl);
    const bg = ctx.createLinearGradient(xl, 0, x1, 0); bg.addColorStop(0, shade(main, 0, .25)); bg.addColorStop(.6, main); bg.addColorStop(1, shade(main, 255, .12));
    ctx.fillStyle = bg; ctx.fill(); noShadow(ctx);
    ctx.save(); slant(ctx, xl, x1 + 4, top, bandH, sl); ctx.clip();
    const hl = ctx.createLinearGradient(0, top, 0, top + bandH); hl.addColorStop(0, 'rgba(255,255,255,.16)'); hl.addColorStop(.5, 'rgba(255,255,255,0)'); hl.addColorStop(1, 'rgba(0,0,0,.18)');
    ctx.fillStyle = hl; ctx.fillRect(xl, top, x1 - xl + 8, bandH);
    drawLogo(ctx, 'emblem', '#FFFFFF', Lx + 250, top + bandH / 2, 250, .05 * bandP, .3 * Math.sin(t * .35) * id);
    if (id > .02) {                                                  // slow sheen across the band
      const u = clamp(((t + .8) % 5) / 1.6), sx = lerp(x1 + 80, xl - 120, EZ.inOut(u));
      const sg = ctx.createLinearGradient(sx - 70, 0, sx + 70, 0); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(.5, `rgba(255,255,255,${.22 * id})`); sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.transform(1, 0, -.35, 1, 0, 0); ctx.translate(sx * .35, 0); ctx.fillStyle = sg; ctx.fillRect(sx - 70, top, 140, bandH);
    }
    ctx.restore();
    ctx.strokeStyle = metalV(ctx, top, top + bandH, gold); ctx.lineWidth = 3; ctx.lineJoin = 'miter'; ctx.beginPath(); ctx.moveTo(x1 + 4, top + 1.5); ctx.lineTo(xl + sl, top + 1.5); ctx.lineTo(xl, top + bandH); ctx.stroke();
    ctx.restore();
  }

  /* subtitle strip */
  const sx0 = x1 - 26, sxl = sx0 - (sx0 - (Lx + 120)) * subP;
  if (subP > .004) {
    ctx.save(); shadow(ctx, 'rgba(0,0,0,.28)', 16, 6); slant(ctx, sxl, sx0 + 2, top + bandH, subH, 20);
    const sg = ctx.createLinearGradient(0, top + bandH, 0, bottom); sg.addColorStop(0, '#FFFFFF'); sg.addColorStop(1, shade('#F1EBDD', 0, .03));
    ctx.fillStyle = sg; ctx.fill(); noShadow(ctx); ctx.restore();
  }

  /* text */
  const rtl = isAr(P.title), tR = x1 - 38, tL = Lx + 64, aw = tR - tL - sl;
  const t1 = fitSize(ctx, P.title, 40, 800, aw), t2 = fitSize(ctx, P.subtitle, 22, 700, sx0 - (Lx + 120) - 70);
  revealBox(ctx, { x: Lx, y: top, w: x1 - Lx, h: bandH }, txP, rtl, c => {
    c.save(); c.translate((rtl ? 1 : -1) * 36 * (1 - EZ.out(txP)), 0); txt(c, P.title, rtl ? tR : tL, top + 54, t1, 800, '#FFFFFF', rtl ? 'right' : 'left'); c.restore();
  }, 90);
  const rtl2 = isAr(P.subtitle);
  revealBox(ctx, { x: Lx, y: top + bandH, w: x1 - Lx, h: subH }, stP, rtl2, c => {
    c.save(); c.translate((rtl2 ? 1 : -1) * 30 * (1 - EZ.out(stP)), 0); txt(c, P.subtitle, rtl2 ? sx0 - 28 : Lx + 150, top + bandH + 28, t2, 700, ink, rtl2 ? 'right' : 'left'); c.restore();
  }, 70);

  /* emblem block */
  if (blkP > .01) {
    ctx.save(); ctx.translate(x1 + blk / 2, top + (bandH + subH) / 2); const sc = Math.max(.02, blkP); ctx.scale(sc, sc); ctx.globalAlpha *= Math.min(1, blkP * 2);
    shadow(ctx, 'rgba(0,0,0,.45)', 26, 10); const hw = blk / 2, hh = (bandH + subH) / 2;
    ctx.beginPath(); ctx.moveTo(-hw, -hh); ctx.lineTo(hw, -hh); ctx.lineTo(hw, hh); ctx.lineTo(-hw + 30, hh); ctx.lineTo(-hw, hh - 30); ctx.closePath();
    ctx.fillStyle = metalV(ctx, -hh, hh, gold); ctx.fill(); noShadow(ctx);
    ctx.save(); ctx.clip();
    const bg = ctx.createRadialGradient(-hw * .3, -hh * .5, 4, 0, 0, hw * 1.5); bg.addColorStop(0, 'rgba(255,255,255,.35)'); bg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = bg; ctx.fillRect(-hw, -hh, blk, hh * 2);
    ctx.restore();
    ctx.strokeStyle = rgba(ink, .35); ctx.lineWidth = 1.6; ctx.strokeRect(-hw + 8, -hh + 8, blk - 16, hh * 2 - 16);
    drawLogo(ctx, 'emblem', ink, 0, 0, 82 * (1 + .04 * Math.sin(t * 1.6) * id), 1, .22 * Math.sin(t * .5) * id + (1 - EZ.out(blkP)) * -1.6);
    ctx.restore();
    const rp = S(b, .14, .46);
    if (rp > 0 && rp < 1 && s.dir === 'in') { ctx.save(); ctx.strokeStyle = goldL; ctx.globalAlpha *= (1 - rp) * (.3 + .6 * m); ctx.lineWidth = 3; const q = 8 + 40 * EZ.out(rp); ctx.strokeRect(x1 - q, top - q, blk + 2 * q, bandH + subH + 2 * q); ctx.restore(); }
  }

  /* kicker tab above the band */
  if (tabP > .01 && P.kicker) {
    const fs = 17, w = textW(ctx, P.kicker, fs, 800) + 62, h = 32, a = Math.min(1, tabP);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, -(1 - tabP) * 16); const tx = x1 - 22 - w, ty = top - h + 1;
    shadow(ctx, 'rgba(0,0,0,.3)', 12, 4); ctx.fillStyle = metalV(ctx, ty, ty + h, goldL); ctx.beginPath(); ctx.moveTo(tx + w, ty); ctx.lineTo(tx + 12, ty); ctx.lineTo(tx, ty + h); ctx.lineTo(tx + w, ty + h); ctx.closePath(); ctx.fill(); noShadow(ctx);
    txt(ctx, P.kicker, tx + w - 40, ty + 22, fs, 800, ink, 'right');
    const pulse = .55 + .45 * Math.sin(t * 5) * id; ctx.fillStyle = ink; ctx.globalAlpha *= .5 + .5 * pulse; ctx.beginPath(); safeArc(ctx, tx + w - 20, ty + h / 2, 4.2, 0, TAU); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/* =========================================================
   Lower-third 2: IDENTITY ORBIT
   a medallion pops, two orbits spin up around it, the orbit stretches into a capsule, a gold chip hangs off the capsule
   ========================================================= */
function drawOrbit(ctx, P, t) {
  const s = rstate(P, t); if (s.b < .0006) return;
  const { b, m, id } = s, main = P.main, gold = P.accent, goldL = shade(gold, 255, .45), ink = shade(main, 0, .6);
  const O = { x: 236, y: 560 }, Rm = 62, pR = 1064, pH = 90;
  const popP = EZ.back(S(b, 0, .2), m), r1 = EZ.inOut(S(b, .1, .38)), r2 = EZ.inOut(S(b, .18, .46)), ext = EZ.outQ(S(b, .3, .66)), fillP = EZ.out(S(b, .44, .74));
  const txP = S(b, .56, .84), chipP = EZ.outQ(S(b, .72, .96)), wmP = EZ.out(S(b, .62, .9));
  const xr = O.x + (pR - O.x) * ext;
  ctx.save(); ctx.translate(0, Math.sin(t * 1.15) * 2 * id);

  /* capsule */
  if (ext > .004) {
    ctx.save(); shadow(ctx, 'rgba(0,0,0,.4)', 26, 10); rr(ctx, O.x - 8, O.y - pH / 2, xr - O.x + 8, pH, pH / 2);
    const cg = ctx.createLinearGradient(0, O.y - pH / 2, 0, O.y + pH / 2); cg.addColorStop(0, shade(main, 255, .14)); cg.addColorStop(1, shade(main, 0, .32));
    ctx.globalAlpha *= .3 + .7 * fillP; ctx.fillStyle = cg; ctx.fill(); ctx.globalAlpha /= .3 + .7 * fillP; noShadow(ctx);
    ctx.save(); rr(ctx, O.x - 8, O.y - pH / 2, xr - O.x + 8, pH, pH / 2); ctx.clip();
    const hl = ctx.createLinearGradient(0, O.y - pH / 2, 0, O.y); hl.addColorStop(0, 'rgba(255,255,255,.2)'); hl.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = hl; ctx.fillRect(O.x, O.y - pH / 2, xr - O.x, pH / 2);
    ctx.strokeStyle = 'rgba(255,255,255,.04)'; ctx.lineWidth = 1.2;                    // faint diagonal weave
    for (let gx = O.x + 60; gx < xr + pH; gx += 44) { ctx.beginPath(); ctx.moveTo(gx, O.y - pH / 2); ctx.lineTo(gx + pH, O.y + pH / 2); ctx.moveTo(gx + pH, O.y - pH / 2); ctx.lineTo(gx, O.y + pH / 2); ctx.stroke(); }
    if (id > .02) {
      const u = clamp(((t + 1.1) % 4.6) / 1.5), sx = lerp(O.x, pR + 100, EZ.inOut(u)), sg = ctx.createLinearGradient(sx - 90, 0, sx + 90, 0);
      sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(.5, `rgba(255,255,255,${.22 * id})`); sg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.transform(1, 0, -.4, 1, 0, 0); ctx.translate(sx * .4, 0); ctx.fillStyle = sg; ctx.fillRect(sx - 90, O.y - pH / 2, 180, pH);
    }
    ctx.restore();
    rr(ctx, O.x - 8, O.y - pH / 2, xr - O.x + 8, pH, pH / 2); ctx.strokeStyle = rgba(goldL, .85); ctx.lineWidth = 2.2; ctx.stroke();
    rr(ctx, O.x - 8, O.y - pH / 2 + 6, xr - O.x + 8, pH - 12, (pH - 12) / 2); ctx.strokeStyle = rgba(gold, .3); ctx.lineWidth = 1; ctx.stroke();
    if (id > .02) {                                                  // a comet circling the capsule edge
      const per = 2 * (xr - O.x) + Math.PI * pH, d = frac(t / 5.5) * per;
      ctx.save(); rr(ctx, O.x - 8, O.y - pH / 2, xr - O.x + 8, pH, pH / 2); ctx.setLineDash([180, per]); ctx.lineDashOffset = -d; ctx.strokeStyle = `rgba(255,246,214,${id})`; ctx.lineWidth = 3.4; shadow(ctx, gold, 12); ctx.stroke(); ctx.restore();
    }
    ctx.restore();
  }

  /* gold chip with the subtitle, hanging off the capsule */
  if (chipP > .004 && P.subtitle) {
    const fs = 21, maxW = (pR - O.x) * .72, size = fitSize(ctx, P.subtitle, fs, 700, maxW - 56), w = Math.min(maxW, textW(ctx, P.subtitle, size, 700) + 56), h = 36, rtl = isAr(P.subtitle);
    const cx1 = pR - 60, cx0 = cx1 - w, cy0 = O.y + pH / 2 - 8;
    ctx.save(); ctx.beginPath(); ctx.rect(cx0 - 10, cy0 - 4, w + 20, (h + 22) * chipP + 4); ctx.clip(); ctx.translate(0, -(1 - chipP) * (h + 8));
    shadow(ctx, 'rgba(0,0,0,.35)', 14, 5); rr(ctx, cx0, cy0, w, h + 8, 16); ctx.fillStyle = metalV(ctx, cy0, cy0 + h + 8, goldL); ctx.fill(); noShadow(ctx);
    txt(ctx, P.subtitle, rtl ? cx1 - 26 : cx0 + 26, cy0 + 8 + 25, size, 700, ink, rtl ? 'right' : 'left'); ctx.restore();
  }

  /* title and wordmark */
  const rtl = isAr(P.title), wmW = 150, tR = pR - 34 - wmW - 36, tL = O.x + Rm + 34, size = fitSize(ctx, P.title, 38, 800, tR - tL);
  revealBox(ctx, { x: O.x + Rm, y: O.y - pH / 2, w: pR - O.x - Rm, h: pH }, txP, rtl, c => {
    c.save(); c.translate((rtl ? 1 : -1) * 32 * (1 - EZ.out(txP)), 0); txt(c, P.title, rtl ? tR : tL, O.y + 13, size, 800, '#FFFFFF', rtl ? 'right' : 'left'); c.restore();
  }, 90);
  if (wmP > .01) {
    ctx.save(); ctx.globalAlpha *= wmP; ctx.fillStyle = rgba(goldL, .5); ctx.fillRect(pR - 34 - wmW - 18, O.y - 22, 1.6, 44);
    shadow(ctx, 'rgba(0,0,0,.4)', 6, 2); drawLogo(ctx, 'wordmark', shade(gold, 255, .6), pR - 34 - wmW / 2 - (1 - wmP) * 18, O.y, wmW); ctx.restore();
  }

  /* orbits around the medallion */
  const spin = t * .9;
  if (r2 > .004) {
    ctx.save(); ctx.translate(O.x, O.y); ctx.rotate(-spin * .6 - (1 - r2) * 3);
    const n = 40, rad = Rm + 36 + 8 * (1 - r2);
    for (let i = 0; i < n; i++) { const a = i / n * TAU, q = clamp(r2 * 1.4 - i / n * .4); if (q <= 0) continue; ctx.fillStyle = rgba(goldL, q * (.28 + .5 * frac(i / n + t * .12 * (id > .02 ? 1 : 0)))); ctx.beginPath(); safeArc(ctx, Math.cos(a) * rad, Math.sin(a) * rad, 2.2, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  if (r1 > .004) {
    ctx.save(); ctx.translate(O.x, O.y); ctx.rotate(spin + (1 - r1) * 2.4); ctx.lineCap = 'round'; ctx.strokeStyle = gold; ctx.lineWidth = 3.4; shadow(ctx, gold, 10);
    for (let k = 0; k < 3; k++) { const a0 = k * TAU / 3; ctx.beginPath(); safeArc(ctx, 0, 0, Rm + 17, a0, a0 + TAU / 3 * .62 * r1); ctx.stroke(); }
    ctx.restore();
  }
  if (id > .02) {                                                    // satellites
    for (const [rad, sp, rr0, ph] of [[Rm + 17, spin, 6.2, 0], [Rm + 36, -spin * .6, 4.2, 2.4]]) {
      const a = sp + ph; ctx.save(); shadow(ctx, goldL, 16); ctx.globalAlpha *= id; ctx.fillStyle = '#FFF6D6'; ctx.beginPath(); safeArc(ctx, O.x + Math.cos(a) * rad, O.y + Math.sin(a) * rad, rr0, 0, TAU); ctx.fill(); ctx.restore();
    }
  }
  for (let k = 0; k < 2; k++) {                                      // ripples when the medallion lands
    const rp = S(b, .06 + k * .06, .34 + k * .06);
    if (rp > 0 && rp < 1 && s.dir === 'in') { ctx.save(); ctx.strokeStyle = goldL; ctx.globalAlpha *= (1 - rp) * (.25 + .5 * m); ctx.lineWidth = 2.4; ctx.beginPath(); safeArc(ctx, O.x, O.y, Rm + 8 + 86 * EZ.out(rp), 0, TAU); ctx.stroke(); ctx.restore(); }
  }

  /* medallion */
  if (popP > .01) {
    ctx.save(); ctx.translate(O.x, O.y); const sc = Math.max(.02, popP); ctx.scale(sc, sc);
    shadow(ctx, 'rgba(0,0,0,.5)', 26, 10); const dg = ctx.createRadialGradient(-Rm * .3, -Rm * .4, 4, 0, 0, Rm); dg.addColorStop(0, shade(main, 255, .22)); dg.addColorStop(1, shade(main, 0, .38));
    ctx.fillStyle = dg; ctx.beginPath(); safeArc(ctx, 0, 0, Rm, 0, TAU); ctx.fill(); noShadow(ctx);
    ctx.strokeStyle = metalV(ctx, -Rm, Rm, gold); ctx.lineWidth = 4.5; ctx.beginPath(); safeArc(ctx, 0, 0, Rm - 2.2, 0, TAU); ctx.stroke();
    ctx.strokeStyle = rgba(goldL, .5); ctx.lineWidth = 1.2; ctx.beginPath(); safeArc(ctx, 0, 0, Rm - 9, 0, TAU); ctx.stroke();
    drawLogo(ctx, 'emblem', goldL, 0, 0, (Rm - 8) * 1.62 * (1 + .03 * Math.sin(t * 1.5) * id), Math.min(1, popP), .22 * Math.sin(t * .6) * id + (1 - EZ.out(popP)) * 1.4);
    ctx.restore();
  }
  ctx.restore();
}

/* =========================================================
   Lower-third 3: MANUSCRIPT SCROLL
   a scroll rolls open from its right roller, text is inked in as it passes, a wax seal drops on the corner
   ========================================================= */
function drawScroll(ctx, P, t) {
  const s = rstate(P, t); if (s.b < .0006) return;
  const { b, m, id } = s, paper = P.main, goldInk = P.accent, ink = shade(goldInk, 0, .55), goldL = shade(goldInk, 255, .35), wood = shade(goldInk, 0, .32);
  const RX = 1096, top = 500, H = 112, bot = top + H, LX = 190;
  const up = EZ.outQ(S(b, .16, .66)), rollA = EZ.out(S(b, 0, .16)), sealP = EZ.back(S(b, .64, .88), m), txP = S(b, .42, .78), stP = S(b, .62, .92);
  const lx = RX - (RX - LX) * up, sway = Math.sin(t * 1.3) * 1.6 * id;
  ctx.save(); ctx.translate(0, sway * .5); ctx.globalAlpha *= Math.min(1, rollA * 1.4);
  const roller = (cx, tilt) => {
    ctx.save(); ctx.translate(cx, (top + bot) / 2); ctx.rotate(tilt); const hh = H / 2 + 20;
    shadow(ctx, 'rgba(0,0,0,.45)', 14, 6, cx < RX ? -3 : 3);
    const g = ctx.createLinearGradient(-12, 0, 12, 0); g.addColorStop(0, shade(wood, 0, .45)); g.addColorStop(.28, shade(wood, 255, .35)); g.addColorStop(.55, wood); g.addColorStop(1, shade(wood, 0, .5));
    ctx.fillStyle = g; rr(ctx, -12, -hh, 24, hh * 2, 8); ctx.fill(); noShadow(ctx);
    for (const sg of [-1, 1]) { ctx.fillStyle = metalV(ctx, sg * hh - 12, sg * hh + 12, goldInk); ctx.beginPath(); safeArc(ctx, 0, sg * (hh + 4), 13, 0, TAU); ctx.fill(); ctx.strokeStyle = rgba(ink, .5); ctx.lineWidth = 1.2; ctx.stroke(); }
    ctx.restore();
  };

  /* parchment between the rollers */
  const px0 = lx + 4, px1 = RX - 4;
  if (px1 - px0 > 2) {
    ctx.save(); shadow(ctx, 'rgba(0,0,0,.4)', 22, 9);
    ctx.beginPath(); ctx.moveTo(px0, top);
    for (let x = px0; x <= px1; x += 8) ctx.lineTo(x, top + Math.sin(x * .09) * 1.3);
    ctx.lineTo(px1, bot); for (let x = px1; x >= px0; x -= 8) ctx.lineTo(x, bot + Math.sin(x * .07 + 2) * 1.3); ctx.closePath();
    const pg = ctx.createLinearGradient(px0, 0, px1, 0); pg.addColorStop(0, shade(paper, 0, .1)); pg.addColorStop(.12, paper); pg.addColorStop(.7, shade(paper, 255, .18)); pg.addColorStop(1, shade(paper, 0, .1));
    ctx.fillStyle = pg; ctx.fill(); noShadow(ctx); ctx.clip();
    const vg = ctx.createLinearGradient(0, top, 0, bot); vg.addColorStop(0, 'rgba(120,80,20,.16)'); vg.addColorStop(.18, 'rgba(120,80,20,0)'); vg.addColorStop(.82, 'rgba(120,80,20,0)'); vg.addColorStop(1, 'rgba(120,80,20,.2)');
    ctx.fillStyle = vg; ctx.fillRect(px0, top - 4, px1 - px0, H + 8);
    for (let i = 0; i < 36; i++) { const fx = px0 + rnd(i * 2.3) * (px1 - px0), fy = top + rnd(i * 3.1 + 1) * H; ctx.fillStyle = `rgba(120,85,30,${.04 + .07 * rnd(i + 9)})`; ctx.beginPath(); safeArc(ctx, fx, fy, .8 + 2 * rnd(i + 4), 0, TAU); ctx.fill(); }
    const curl = ctx.createLinearGradient(px0, 0, px0 + 56, 0); curl.addColorStop(0, 'rgba(60,35,5,.38)'); curl.addColorStop(1, 'rgba(60,35,5,0)'); ctx.fillStyle = curl; ctx.fillRect(px0, top - 4, 56, H + 8);
    const cur2 = ctx.createLinearGradient(px1 - 40, 0, px1, 0); cur2.addColorStop(0, 'rgba(60,35,5,0)'); cur2.addColorStop(1, 'rgba(60,35,5,.3)'); ctx.fillStyle = cur2; ctx.fillRect(px1 - 40, top - 4, 40, H + 8);
    drawLogo(ctx, 'emblem', goldInk, (px0 + px1) / 2 - 40, (top + bot) / 2, 190, .06, .15 * Math.sin(t * .3) * id);
    ctx.strokeStyle = rgba(goldInk, .75); ctx.lineWidth = 1.8; ctx.strokeRect(px0 + 16, top + 9, px1 - px0 - 32, H - 18);
    ctx.strokeStyle = rgba(goldInk, .4); ctx.lineWidth = 1; ctx.strokeRect(px0 + 21, top + 14, px1 - px0 - 42, H - 28);
    for (const [cx0, cy0] of [[px0 + 16, top + 9], [px1 - 16, top + 9], [px0 + 16, bot - 9], [px1 - 16, bot - 9]]) { ctx.fillStyle = goldInk; star8(ctx, cx0, cy0, 6, Math.PI / 8); ctx.fill(); }
    if (id > .02) {
      const u = clamp(((t + .6) % 5.2) / 1.7), sx = lerp(px1 + 60, px0 - 60, EZ.inOut(u)), sg = ctx.createLinearGradient(sx - 80, 0, sx + 80, 0);
      sg.addColorStop(0, 'rgba(255,248,225,0)'); sg.addColorStop(.5, `rgba(255,248,225,${.4 * id})`); sg.addColorStop(1, 'rgba(255,248,225,0)'); ctx.fillStyle = sg; ctx.fillRect(sx - 80, top, 160, H);
    }
    /* ink */
    const rtl = isAr(P.title), tR = RX - 78, tL = LX + 80, aw = tR - tL;
    const t1 = fitSize(ctx, P.title, 40, 800, aw), t2 = fitSize(ctx, P.subtitle, 22, 600, aw - 40);
    revealBox(ctx, { x: LX, y: top + 14, w: RX - LX, h: 58 }, txP, rtl, c => txt(c, P.title, rtl ? tR : tL, top + 56, t1, 800, ink, rtl ? 'right' : 'left'), 100);
    const dv = EZ.out(S(b, .56, .8)), mid = (tR + tL) / 2; ctx.strokeStyle = rgba(goldInk, .8); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(mid - 130 * dv, top + 70); ctx.lineTo(mid + 130 * dv, top + 70); ctx.stroke();
    if (dv > .1) { ctx.fillStyle = goldInk; star8(ctx, mid, top + 70, 5.5 * dv, Math.PI / 8); ctx.fill(); }
    const rtl2 = isAr(P.subtitle);
    revealBox(ctx, { x: LX, y: top + 74, w: RX - LX, h: 32 }, stP, rtl2, c => txt(c, P.subtitle, rtl2 ? tR : tL, top + 98, t2, 600, shade(ink, 255, .12), rtl2 ? 'right' : 'left'), 80);
    ctx.restore();
  }
  roller(RX, Math.sin(t * .9) * .012 * id);
  if (up > .02) roller(lx, Math.sin(t * .8 + 1) * .012 * id + (1 - up) * -.02);

  /* wax seal on the corner */
  if (sealP > .01) {
    const cx = RX - 38, cy = bot + 4, r = 31 * (1 + .03 * Math.sin(t * 1.7) * id);
    ctx.save(); ctx.translate(cx, cy); const sc = Math.max(.02, sealP); ctx.scale(sc, sc); ctx.rotate((1 - sc) * -1.2);
    ctx.fillStyle = shade(goldInk, 0, .45); ctx.beginPath(); ctx.moveTo(-8, 10); ctx.lineTo(-20, 52); ctx.lineTo(-10, 46); ctx.lineTo(-3, 56); ctx.lineTo(3, 14); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(8, 10); ctx.lineTo(22, 50); ctx.lineTo(12, 45); ctx.lineTo(6, 55); ctx.lineTo(-1, 14); ctx.closePath(); ctx.fillStyle = shade(goldInk, 0, .3); ctx.fill();
    shadow(ctx, 'rgba(0,0,0,.5)', 14, 5); ctx.beginPath(); for (let i = 0; i < 18; i++) { const a = i / 18 * TAU, q = r * (i % 2 ? .93 : 1); i ? ctx.lineTo(Math.cos(a) * q, Math.sin(a) * q) : ctx.moveTo(q, 0); } ctx.closePath();
    ctx.fillStyle = metalV(ctx, -r, r, goldInk); ctx.fill(); noShadow(ctx);
    ctx.strokeStyle = rgba(ink, .4); ctx.lineWidth = 1.4; ctx.beginPath(); safeArc(ctx, 0, 0, r - 6, 0, TAU); ctx.stroke();
    drawLogo(ctx, 'emblem', ink, 0, 0, r * 1.2, .95, .1 * Math.sin(t * .7) * id);
    ctx.restore();
  }
  ctx.restore();
}

/* =========================================================
   Lower-third 4: LUMINOUS CRESCENT
   a crescent outlines itself and fills with gold, a star ignites in its cup, a night banner opens from it
   ========================================================= */
function crescentGeo(Rc) { const r2 = Rc * .8, d = Rc * .42, x = (d * d + Rc * Rc - r2 * r2) / (2 * d), y = Math.sqrt(Math.max(0, Rc * Rc - x * x)); return { Rc, r2, d, x, y, th: Math.atan2(y, x), at: Math.atan2(-y, x - d), ab: Math.atan2(y, x - d) }; }
function crescentOutline(c, G) { c.beginPath(); c.arc(0, 0, G.Rc, G.th, TAU - G.th); c.arc(G.d, 0, G.r2, G.at, G.ab, true); c.closePath(); }
function drawCrescent(ctx, P, t) {
  const s = rstate(P, t); if (s.b < .0006) return;
  const { b, m, id } = s, night = P.main, gold = P.accent, goldL = shade(gold, 255, .5), ink = '#FFFFFF';
  const O = { x: 240, y: 560 }, Rc = 70, G = crescentGeo(Rc), bx0 = O.x + 20, bx1 = 1070, bh = 86;
  const drawP = EZ.inOut(S(b, 0, .3)), fillP = EZ.out(S(b, .22, .44)), starP = EZ.back(S(b, .34, .58), m), ban = EZ.outQ(S(b, .36, .72)), txP = S(b, .56, .84), stP = S(b, .7, .94);
  const rot = -.5 + .06 * Math.sin(t * .8) * id - (1 - EZ.out(drawP)) * .6;
  ctx.save(); ctx.translate(0, Math.sin(t * 1.1) * 1.8 * id);

  /* banner opens from the crescent */
  const xr = bx0 + (bx1 - bx0) * ban;
  if (ban > .004) {
    ctx.save(); shadow(ctx, 'rgba(0,0,0,.45)', 26, 10); rr(ctx, bx0, O.y - bh / 2, xr - bx0, bh, 18);
    const g = ctx.createLinearGradient(0, O.y - bh / 2, 0, O.y + bh / 2); g.addColorStop(0, rgba(shade(night, 255, .2), .94)); g.addColorStop(1, rgba(shade(night, 0, .3), .96)); ctx.fillStyle = g; ctx.fill(); noShadow(ctx);
    ctx.save(); rr(ctx, bx0, O.y - bh / 2, xr - bx0, bh, 18); ctx.clip();
    for (let i = 0; i < 26; i++) { const sx = bx0 + 130 + rnd(i * 1.7) * (bx1 - bx0 - 160), sy = O.y - bh / 2 + 8 + rnd(i * 2.9) * (bh - 16), tw = .3 + .7 * Math.abs(Math.sin(t * (1 + rnd(i) * 2) + i)); ctx.fillStyle = `rgba(255,255,255,${(.12 + .35 * rnd(i + 3)) * lerp(1, tw, id)})`; ctx.beginPath(); safeArc(ctx, sx, sy, .8 + 1.2 * rnd(i + 5), 0, TAU); ctx.fill(); }
    const hl = ctx.createLinearGradient(0, O.y - bh / 2, 0, O.y); hl.addColorStop(0, 'rgba(255,255,255,.14)'); hl.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = hl; ctx.fillRect(bx0, O.y - bh / 2, xr - bx0, bh / 2);
    drawLogo(ctx, 'emblem', '#FFFFFF', bx1 - 140, O.y, 190, .05, .2 * Math.sin(t * .3) * id);
    if (id > .02) { const u = clamp(((t + .5) % 4.8) / 1.5), sx = lerp(bx0 - 40, bx1 + 90, EZ.inOut(u)), sg = ctx.createLinearGradient(sx - 80, 0, sx + 80, 0); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(.5, `rgba(255,255,255,${.16 * id})`); sg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.transform(1, 0, -.4, 1, 0, 0); ctx.translate(sx * .4, 0); ctx.fillStyle = sg; ctx.fillRect(sx - 80, O.y - bh / 2, 160, bh); }
    ctx.restore();
    rr(ctx, bx0, O.y - bh / 2, xr - bx0, bh, 18); ctx.strokeStyle = rgba(gold, .75); ctx.lineWidth = 1.8; ctx.stroke();
    ctx.restore();
    const rtl = isAr(P.title), tR = bx1 - 40, tL = bx0 + Rc + 56, size = fitSize(ctx, P.title, 36, 800, tR - tL);
    revealBox(ctx, { x: bx0 + Rc, y: O.y - bh / 2, w: bx1 - bx0 - Rc, h: bh }, txP, rtl, c => { c.save(); shadow(c, rgba(gold, .55), 10); c.translate((rtl ? 1 : -1) * 30 * (1 - EZ.out(txP)), 0); txt(c, P.title, rtl ? tR : tL, O.y + 2, size, 800, ink, rtl ? 'right' : 'left'); c.restore(); }, 90);
    const rtl2 = isAr(P.subtitle), sz2 = fitSize(ctx, P.subtitle, 21, 600, tR - tL - 30);
    revealBox(ctx, { x: bx0 + Rc, y: O.y + 2, w: bx1 - bx0 - Rc, h: bh / 2 }, stP, rtl2, c => txt(c, P.subtitle, rtl2 ? tR : tL, O.y + 31, sz2, 600, goldL, rtl2 ? 'right' : 'left'), 80);
  }

  /* crescent + star */
  ctx.save(); ctx.translate(O.x, O.y); ctx.rotate(rot);
  const glowA = S(b, .2, .5), gl = ctx.createRadialGradient(0, 0, Rc * .4, 0, 0, Rc * 2.3); gl.addColorStop(0, rgba(gold, .3 * glowA)); gl.addColorStop(1, rgba(gold, 0)); ctx.fillStyle = gl; ctx.fillRect(-Rc * 2.3, -Rc * 2.3, Rc * 4.6, Rc * 4.6);
  if (fillP > .004) { ctx.save(); shadow(ctx, rgba(gold, .7), 20); crescentOutline(ctx, G); ctx.globalAlpha *= fillP; ctx.fillStyle = metalV(ctx, -Rc, Rc, gold); ctx.fill(); ctx.restore(); }
  if (drawP > .004 && fillP < 1) {
    const per = TAU * Rc * 1.7; ctx.save(); crescentOutline(ctx, G); ctx.setLineDash([per * drawP, per * 2]); ctx.strokeStyle = goldL; ctx.lineWidth = 3; ctx.lineCap = 'round'; shadow(ctx, gold, 12); ctx.stroke(); ctx.restore();
  }
  if (fillP > .3) { ctx.save(); crescentOutline(ctx, G); ctx.clip(); const sh = ctx.createLinearGradient(-Rc, -Rc, Rc, Rc); sh.addColorStop(0, 'rgba(255,255,255,.45)'); sh.addColorStop(.4, 'rgba(255,255,255,0)'); ctx.globalAlpha *= fillP; ctx.fillStyle = sh; ctx.fillRect(-Rc, -Rc, Rc * 2, Rc * 2); ctx.restore(); }
  ctx.restore();
  if (starP > .01) {
    const sx = O.x + Rc * .5, sy = O.y - Rc * .06, tw = 1 + .1 * Math.sin(t * 2.4) * id;
    ctx.save(); ctx.translate(sx, sy); const sc = Math.max(.02, starP) * tw; ctx.scale(sc, sc); ctx.rotate((1 - starP) * 2 + t * .12 * id);
    shadow(ctx, '#FFF2C4', 18); ctx.fillStyle = '#FFF4D2'; star8(ctx, 0, 0, 17); ctx.fill(); noShadow(ctx); ctx.fillStyle = '#FFFFFF'; star8(ctx, 0, 0, 7.5, Math.PI / 8); ctx.fill(); ctx.restore();
    const rp = S(b, .38, .62); if (rp > 0 && rp < 1 && s.dir === 'in') { ctx.save(); ctx.translate(sx, sy); ctx.strokeStyle = goldL; ctx.globalAlpha *= (1 - rp) * .8; ctx.lineWidth = 2; ctx.beginPath(); safeArc(ctx, 0, 0, 16 + 70 * EZ.out(rp), 0, TAU); ctx.stroke(); ctx.restore(); }
  }
  if (id > .02) for (let i = 0; i < 10; i++) { const u = frac(t * (.09 + .04 * rnd(i)) + rnd(i + 4)), x = O.x - 40 + rnd(i + 2) * 140, y = O.y + 50 - u * 150; ctx.save(); ctx.globalAlpha *= Math.sin(Math.PI * u) * .8 * id; sparkle(ctx, x, y, 2.6 + 2.8 * rnd(i + 7), goldL, 1); ctx.restore(); }
  ctx.restore();
}

export const EXTRA_REPINE = [
  { id: 'rp-editorial', name: 'Editorial Band', raw: true, draw: drawEditorial, timing: P => ({ total: rtotal(P) }), colors: ['Band', 'Gold trim'],
    defaults: { ...R_BASE, tIn: 2.6, title: 'أثر يمتد', subtitle: 'مركز الاتصال المؤسسي', kicker: 'تغطية خاصة', main: '#17634b', accent: '#c9ac70' } },
  { id: 'rp-orbit', name: 'Identity Orbit', raw: true, draw: drawOrbit, timing: P => ({ total: rtotal(P) }), colors: ['Capsule', 'Gold orbit'],
    defaults: { ...R_BASE, tIn: 2.8, title: 'أثر يمتد', subtitle: 'مركز الاتصال المؤسسي', main: '#124a39', accent: '#d4af61' } },
  { id: 'rp-scroll', name: 'Manuscript Scroll', raw: true, draw: drawScroll, timing: P => ({ total: rtotal(P) }), colors: ['Parchment', 'Gold ink'],
    defaults: { ...R_BASE, tIn: 3.0, title: 'أثر يمتد', subtitle: 'مركز الاتصال المؤسسي', main: '#efe2c4', accent: '#a8782a' } },
  { id: 'rp-crescent', name: 'Luminous Crescent', raw: true, draw: drawCrescent, timing: P => ({ total: rtotal(P) }), colors: ['Night banner', 'Crescent gold'],
    defaults: { ...R_BASE, tIn: 2.8, title: 'أثر يمتد', subtitle: 'مركز الاتصال المؤسسي', main: '#16254a', accent: '#e3b95b' } },
];
const FR_BASE = { ratio: '9:16', speed: 1, tIn: 2.6, tHold: 12, tOut: 1.2, mIn: 60, mOut: 50, mIdle: 60,
  support: 'لدعم برامج وأنشطة الجمعية', phone: '0546090555', handle: 'hedayh_ar', web: 'www.hedayh.org.sa', reciter: '', kicker: '',
  showVerse: true, showLogo: true, showContact: true, showSocial: true, showWave: true, particles: true, bgIn: false };
const ALL = ['showVerse', 'showLogo', 'showContact', 'showSocial', 'showWave', 'particles', 'bgIn'];
const frame = (id, name, impl, colors, defaults, toggles = ALL) => {
  const g = { id, name, impl, colors, toggles, defaults: { ...FR_BASE, ...defaults }, raw: true };
  g.draw = (ctx, P, t) => impl.draw(ctx, P, t); g.timing = P => ({ total: ftotal(P) }); g.dims = dimsOf; g.winBox = P => impl.lay(dimsOf(P)).win; return g;
};
export const EXTRA_FRAMES = [
  frame('fr-portal', 'Impact Portal', FRAME_IMPLS.portal, [['c1', 'Deep'], ['c2', 'Gold'], ['c3', 'Text'], ['c4', 'Glow']],
    { c1: '#0f3d2e', c2: '#d9b568', c3: '#f5f0e0', c4: '#2fa07a', reciter: 'رسالة اليوم' }),
  frame('fr-broadcast', 'Coverage Frame', FRAME_IMPLS.broadcast, [['c1', 'Paper'], ['c2', 'Emerald'], ['c3', 'Ink'], ['c4', 'Gold']],
    { c1: '#eef3ee', c2: '#17634b', c3: '#203e35', c4: '#d1a94d', title: 'تغطية فعاليات المؤسسة', subtitle: 'مركز الاتصال المؤسسي', reciter: 'فريق الاتصال', kicker: 'تغطية مباشرة', showWave: false }),
  frame('fr-doors', 'Mashrabiya Doors', FRAME_IMPLS.doors, [['c1', 'Wood'], ['c2', 'Gold'], ['c3', 'Text'], ['c4', 'Carving']],
    { c1: '#4a2c17', c2: '#d9b062', c3: '#f6efdc', c4: '#8a5a2e', reciter: 'رسالة اليوم' }),
  frame('fr-spectrum', 'Recitation Spectrum', FRAME_IMPLS.spectrum, [['c1', 'Stage'], ['c2', 'Gold'], ['c3', 'Text'], ['c4', 'Voice glow']],
    { c1: '#0a2421', c2: '#e0b85f', c3: '#f7f3e6', c4: '#3ec7a4', reciter: 'الشيخ/ سعود الشريم' }),
];
export const EXTRA_NUMBERS = NUMBERS;

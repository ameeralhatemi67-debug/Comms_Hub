/* Preview-only drawing: what shows behind or inside a design while previewing.
   Nothing here is ever part of an export, except the key color the export asks for explicitly. */
const TAU = Math.PI * 2;
const frac = x => x - Math.floor(x);
const rnd = i => frac(Math.sin(i * 127.1 + 311.7) * 43758.5453);
function rgba(h, a) {
  let s = String(h).replace('#', ''); if (s.length === 3) s = s.split('').map(c => c + c).join('');
  const n = parseInt(s, 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
}
const SAMPLE_COLORS = ['#b582ff', '#ff8fc8', '#7fd3aa', '#ffd27f', '#6f8dff', '#ff9d7a'];
const FONT = '"Segoe UI",Tahoma,system-ui,sans-serif';

let scratch = null;
function scratchCanvas(w, h) {
  if (!scratch) scratch = document.createElement('canvas');
  if (scratch.width !== w || scratch.height !== h) { scratch.width = w; scratch.height = h; }
  return scratch;
}

/* A soft, moving stand-in for the user's clip. Painted into the rectangle bx, by, bw, bh. */
export function paintSample(x, bx, by, bw, bh, t, label = true) {
  x.save(); x.beginPath(); x.rect(bx, by, bw, bh); x.clip();
  const g = x.createLinearGradient(bx, by, bx + bw * .3, by + bh); g.addColorStop(0, '#3a2a5a'); g.addColorStop(1, '#1c2c3b');
  x.fillStyle = g; x.fillRect(bx, by, bw, bh);
  const mn = Math.min(bw, bh);
  for (let i = 0; i < 7; i++) {
    const cx = bx + bw * (.5 + .4 * Math.sin(t * .23 + i * 1.9)), cy = by + bh * (.5 + .4 * Math.cos(t * .19 + i * 2.7)), r = mn * (.3 + .16 * rnd(i + 1));
    const rg = x.createRadialGradient(cx, cy, 0, cx, cy, r); rg.addColorStop(0, rgba(SAMPLE_COLORS[i % 6], .6)); rg.addColorStop(1, rgba(SAMPLE_COLORS[i % 6], 0));
    x.fillStyle = rg; x.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  }
  if (label) {
    const pr = mn * .07, pcx = bx + bw / 2, pcy = by + bh / 2;
    x.fillStyle = 'rgba(255,255,255,.18)'; x.beginPath(); x.arc(pcx, pcy, pr * 1.5, 0, TAU); x.fill();
    x.fillStyle = 'rgba(255,255,255,.9)'; x.beginPath(); x.moveTo(pcx - pr * .45, pcy - pr * .65); x.lineTo(pcx + pr * .75, pcy); x.lineTo(pcx - pr * .45, pcy + pr * .65); x.closePath(); x.fill();
    x.font = `600 ${Math.round(pr * .7)}px ${FONT}`; x.direction = 'rtl'; x.textAlign = 'center'; x.textBaseline = 'top'; x.fillStyle = 'rgba(255,255,255,.82)';
    x.fillText('مقطعك هنا', pcx, pcy + pr * 1.9);
  }
  x.restore();
}

/* Behind the design: window content for frames (sample / video / green / transparent). */
export function drawFootage(ctx, o) {
  const { width, height, scale, win, mode, video, key, time } = o;
  const bx = win.x * scale, by = win.y * scale, bw = win.w * scale, bh = win.h * scale;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'destination-over';
  if (mode === 'alpha') { ctx.restore(); return; }
  if (mode === 'green') { ctx.fillStyle = key; ctx.fillRect(0, 0, width, height); ctx.restore(); return; }
  if (mode === 'video' && video && video.readyState >= 2 && video.videoWidth) {
    const k = Math.max(bw / video.videoWidth, bh / video.videoHeight), w = video.videoWidth * k, h = video.videoHeight * k;
    ctx.save(); ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip(); ctx.drawImage(video, bx + (bw - w) / 2, by + (bh - h) / 2, w, h); ctx.restore();
  } else {
    const cv = scratchCanvas(Math.max(1, Math.round(bw)), Math.max(1, Math.round(bh))), y = cv.getContext('2d');
    y.setTransform(1, 0, 0, 1, -bx, -by); y.clearRect(bx, by, bw, bh); paintSample(y, bx, by, bw, bh, time); y.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(cv, bx, by);
  }
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/* Behind lower-thirds and numbers: a believable scene so the design reads against real footage. */
export function drawBackdrop(ctx, o) {
  const { width, height, mode, time } = o;
  if (mode === 'alpha') return;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'destination-over';
  if (mode === 'light') { const g = ctx.createLinearGradient(0, 0, width, height); g.addColorStop(0, '#eef1ec'); g.addColorStop(1, '#c9d0c8'); ctx.fillStyle = g; ctx.fillRect(0, 0, width, height); }
  else if (mode === 'dark') { ctx.fillStyle = '#0b1210'; ctx.fillRect(0, 0, width, height); }
  else {
    const cv = scratchCanvas(width, height), y = cv.getContext('2d');
    y.setTransform(1, 0, 0, 1, 0, 0); y.clearRect(0, 0, width, height); paintSample(y, 0, 0, width, height, time, false);
    const v = y.createLinearGradient(0, height * .35, 0, height); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)'); y.fillStyle = v; y.fillRect(0, 0, width, height);
    ctx.drawImage(cv, 0, 0);
  }
  ctx.restore();
}

/* Instagram Reels: the areas the app interface covers, 9:16 only. */
export function drawSafeZones(ctx, o) {
  const { width, ratio } = o;
  if (ratio !== '9:16') return;
  const sc = width / 1080;
  ctx.save(); ctx.setTransform(sc, 0, 0, sc, 0, 0);
  ctx.fillStyle = 'rgba(255,60,90,.16)'; ctx.fillRect(0, 0, 1080, 250); ctx.fillRect(0, 1920 - 400, 1080, 400); ctx.fillRect(1080 - 140, 1050, 140, 470);
  ctx.strokeStyle = 'rgba(255,90,110,.9)'; ctx.setLineDash([14, 10]); ctx.lineWidth = 3; ctx.strokeRect(0, 250, 940, 1270);
  ctx.setLineDash([]); ctx.font = `600 30px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.fillText('قد تغطي واجهة إنستغرام المناطق المظللة', 1056, 200);
  ctx.restore();
}

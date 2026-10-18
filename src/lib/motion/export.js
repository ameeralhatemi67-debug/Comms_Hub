/* Frame-exact export. Every frame is drawn at its own timestamp, so the result never depends on how fast the computer is.
   PNG frames are encoded by a small built-in encoder on top of CompressionStream, which is far faster than canvas.toBlob.
   Transparent video is ProRes 4444 (prores.js), written into a QuickTime MOV.
   MP4 uses WebCodecs, and falls back to a real-time recording when the browser does not offer it (for example over plain http on a LAN). */
import { renderFrame, timingOf } from './renderers.js';
import { makeZip, muxVideo, crc32 } from './containers.js';
import { createProresEncoder, proresSampleEntry } from './prores.js';

export const MAX_BYTES = 1.6e9;                         // in-memory ceiling for ZIP / MOV
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const aborted = () => new DOMException('Aborted', 'AbortError');
const even = v => Math.max(2, Math.round(v / 2) * 2);

export const hasWebCodecs = () => typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
export const hasRecorder = () => typeof MediaRecorder !== 'undefined';

/* What an export would produce. Used by the interface before anything is rendered. */
export function planExport(g, params, { shortSide, fps }) {
  const dims = g.dims?.(params) || { w: 1280, h: 720 }, scale = shortSide / Math.min(dims.w, dims.h);
  const w = even(dims.w * scale), h = even(dims.h * scale), duration = timingOf(g, params).total / params.speed, frames = Math.max(2, Math.round(duration * fps));
  return { dims, scale, w, h, fps, duration, frames, pixels: w * h * frames };
}

export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
  document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 0);
  return url;
}

/* ---------- PNG encoder: raw RGBA -> zlib (CompressionStream) -> chunks ---------- */
const u32 = n => new Uint8Array([n >>> 24, n >>> 16 & 255, n >>> 8 & 255, n & 255]);
const ascii = s => Uint8Array.from(s, c => c.charCodeAt(0));
function chunk(type, data) {
  const t = ascii(type), body = new Uint8Array(4 + data.length); body.set(t, 0); body.set(data, 4);
  return [u32(data.length), body, u32(crc32(body))];
}
async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function encodePng(data, w, h) {
  const stride = w * 4, raw = new Uint8Array((stride + 1) * h);
  for (let y = 0; y < h; y++) raw.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const ihdr = new Uint8Array(13); ihdr.set(u32(w), 0); ihdr.set(u32(h), 4); ihdr[8] = 8; ihdr[9] = 6;
  const idat = await deflate(raw);
  return new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), ...chunk('IHDR', ihdr), ...chunk('IDAT', idat), ...chunk('IEND', new Uint8Array(0))], { type: 'image/png' });
}
const toBlobPng = canvas => new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('تعذر إنشاء الصورة.')), 'image/png'));
const canFastPng = () => typeof CompressionStream !== 'undefined';

function progressTracker(total, onProgress, label) {
  const start = performance.now();
  return (done, bytes = 0) => {
    const elapsed = (performance.now() - start) / 1000, rate = done / Math.max(.001, elapsed);
    onProgress({ phase: label, done, total, fraction: done / total, eta: done > 2 ? Math.max(0, (total - done) / rate) : null, bytes });
  };
}
const avcLevel = (w, h, fps) => { const px = w * h * fps; return px <= 62.9e6 ? '28' : px <= 133e6 ? '2A' : px <= 251e6 ? '33' : '34'; };
const baseName = (g, plan, tail) => `${g.id}_${plan.w}x${plan.h}_${plan.fps}fps_${tail}`;

/* Renders every frame to PNG bytes. Up to four encodes run while the next frame is being drawn. */
async function renderPngFrames(g, p, plan, ctx, canvas, signal, report, bgKey) {
  const out = new Array(plan.frames), pending = new Set(); let bytes = 0, done = 0, failure = null;
  const fast = canFastPng();
  for (let i = 0; i < plan.frames; i++) {
    if (signal.aborted) throw aborted(); if (failure) throw failure;
    renderFrame(g, p, i / plan.fps * p.speed, ctx, plan.w / plan.dims.w, bgKey || null);
    let job;
    if (fast) { const data = ctx.getImageData(0, 0, plan.w, plan.h).data; job = encodePng(data, plan.w, plan.h); }
    else job = toBlobPng(canvas);
    const index = i;
    const tracked = job.then(async blob => { const buf = new Uint8Array(await blob.arrayBuffer()); out[index] = buf; bytes += buf.length; done++; })
      .catch(error => { failure = error; }).finally(() => pending.delete(tracked));
    pending.add(tracked);
    if (bytes / Math.max(1, done) * plan.frames > MAX_BYTES && done > 2) throw new Error('الملف سيكون كبيراً جداً على ذاكرة المتصفح. اختر MP4، أو دقة أقل، أو قلّل مدة العرض.');
    while (pending.size >= 4) await Promise.race(pending);
    report(done, bytes);
    if (i % 2 === 0) await tick();
  }
  await Promise.all(pending); if (failure) throw failure;
  report(plan.frames, bytes);
  return { frames: out, bytes };
}

async function exportMp4(g, p, plan, ctx, canvas, options, signal, onProgress) {
  const report = progressTracker(plan.frames, onProgress, 'encode');
  const config = { codec: 'avc1.6400' + avcLevel(plan.w, plan.h, plan.fps), width: plan.w, height: plan.h, bitrate: Math.round(plan.w * plan.h * plan.fps * .3), framerate: plan.fps, avc: { format: 'avc' }, latencyMode: 'quality' };
  let supported = null; try { supported = await VideoEncoder.isConfigSupported(config); } catch { /* fall through */ }
  if (!supported?.supported) return null;
  const chunks = []; let avcC = null, failure = null;
  const encoder = new VideoEncoder({
    output(chunkData, meta) {
      const data = new Uint8Array(chunkData.byteLength); chunkData.copyTo(data); chunks.push({ data, key: chunkData.type === 'key', timestamp: chunkData.timestamp });
      const description = meta?.decoderConfig?.description;
      if (description && !avcC) avcC = ArrayBuffer.isView(description) ? new Uint8Array(description.buffer.slice(description.byteOffset, description.byteOffset + description.byteLength)) : new Uint8Array(description.slice(0));
    },
    error(error) { failure = error; },
  });
  try {
    encoder.configure(config);
    for (let i = 0; i < plan.frames; i++) {
      if (signal.aborted) throw aborted(); if (failure) break;
      renderFrame(g, p, i / plan.fps * p.speed, ctx, plan.w / plan.dims.w, options.keyColor);
      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / plan.fps), duration: Math.round(1e6 / plan.fps) });
      try { encoder.encode(frame, { keyFrame: i % plan.fps === 0 }); } finally { frame.close(); }
      while (encoder.encodeQueueSize > 8 && !failure) { await new Promise(resolve => setTimeout(resolve, 2)); if (signal.aborted) throw aborted(); }
      report(i + 1);
      if (i % 3 === 0) await tick();
    }
    if (!failure) await encoder.flush();
  } finally { if (encoder.state !== 'closed') { try { encoder.close(); } catch { /* ignore */ } } }
  const ordered = chunks.every((c, i) => !i || c.timestamp > chunks[i - 1].timestamp);
  if (failure || !avcC || chunks.length !== plan.frames || !ordered) return null;
  return { blob: muxVideo({ kind: 'mp4', fourcc: 'avc1', w: plan.w, h: plan.h, fps: plan.fps, depth: 24, name: 'AVC', avcC, samples: chunks }), method: 'webcodecs' };
}

/* Fallback: records the canvas in real time. Slower, and the frame rate is only approximate. */
async function exportRecorded(g, p, plan, ctx, canvas, options, signal, onProgress) {
  const mimes = ['video/mp4;codecs=avc1.640028', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const mime = hasRecorder() && mimes.find(m => MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error('هذا المتصفح لا يستطيع ترميز الفيديو. استخدم فيديو شفاف MOV أو تسلسل الصور.');
  canvas.style.cssText = 'position:fixed;left:-99999px;top:0;width:320px;height:180px'; document.body.appendChild(canvas);
  const scale = plan.w / plan.dims.w; renderFrame(g, p, 0, ctx, scale, options.keyColor);
  const stream = canvas.captureStream(plan.fps), parts = [], recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.round(plan.w * plan.h * plan.fps * .3) });
  recorder.ondataavailable = e => { if (e.data?.size) parts.push(e.data); };
  const stopped = new Promise(resolve => { recorder.onstop = resolve; }); recorder.start(250);
  const t0 = performance.now(), total = timingOf(g, p).total, report = progressTracker(100, onProgress, 'record');
  try {
    await new Promise((resolve, reject) => {
      const step = now => {
        if (signal.aborted) { reject(aborted()); return; }
        const real = (now - t0) / 1000;
        renderFrame(g, p, Math.min(real * p.speed, total), ctx, scale, options.keyColor);
        report(Math.min(100, Math.round(real / (plan.duration + .25) * 100)));
        if (real < plan.duration + .25) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
  } finally { if (recorder.state !== 'inactive') recorder.stop(); await stopped; canvas.remove(); }
  const ext = mime.includes('mp4') ? 'mp4' : 'webm';
  return { blob: new Blob(parts, { type: mime.split(';')[0] }), method: 'recorder', ext };
}

/* Entry point. Returns { blob, name, w, h, fps, seconds, frames, method } and leaves saving to the caller. */
export async function exportDesign(g, params, options, signal, onProgress) {
  const p = { ...params }, plan = planExport(g, p, options);
  const canvas = document.createElement('canvas'); canvas.width = plan.w; canvas.height = plan.h;
  const ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: options.format === 'mov' || options.format === 'zip' });
  const base = { w: plan.w, h: plan.h, fps: plan.fps, seconds: plan.duration, frames: plan.frames };
  if (options.format === 'png') {
    renderFrame(g, p, options.time, ctx, plan.w / plan.dims.w, null);
    const blob = await toBlobPng(canvas); if (signal.aborted) throw aborted();
    return { ...base, blob, name: `${g.id}_${plan.w}x${plan.h}_still.png`, frames: 1, fps: 0, seconds: 0, method: 'still' };
  }
  if (options.format === 'mp4') {
    let result = null;
    if (hasWebCodecs()) result = await exportMp4(g, p, plan, ctx, canvas, options, signal, onProgress);
    if (!result) result = await exportRecorded(g, p, plan, ctx, canvas, options, signal, onProgress);
    return { ...base, blob: result.blob, method: result.method, name: baseName(g, plan, `greenscreen.${result.ext || 'mp4'}`) };
  }
  if (options.format === 'mov') return { ...base, ...await exportProres(g, p, plan, ctx, signal, onProgress) };
  const report = progressTracker(plan.frames, onProgress, 'render');
  const { frames, bytes } = await renderPngFrames(g, p, plan, ctx, canvas, signal, report, null);
  if (signal.aborted) throw aborted();
  onProgress({ phase: 'pack', done: plan.frames, total: plan.frames, fraction: 1, eta: 0, bytes }); await tick();
  const blob = makeZip(frames.map((data, i) => ({ name: `${g.id}_${String(i + 1).padStart(5, '0')}.png`, data })));
  return { ...base, blob, method: 'png', name: baseName(g, plan, 'png-sequence.zip') };
}

/* Transparent video: every frame becomes one ProRes 4444 picture with a real alpha channel. PNG inside a MOV is not used because
   Windows players and most editors cannot open it. */
async function exportProres(g, p, plan, ctx, signal, onProgress) {
  const report = progressTracker(plan.frames, onProgress, 'encode'), encode = createProresEncoder(plan.w, plan.h), samples = []; let bytes = 0;
  for (let i = 0; i < plan.frames; i++) {
    if (signal.aborted) throw aborted();
    renderFrame(g, p, i / plan.fps * p.speed, ctx, plan.w / plan.dims.w, null);
    const data = encode(ctx.getImageData(0, 0, plan.w, plan.h).data);
    samples.push({ data, key: true }); bytes += data.length;
    if (bytes / (i + 1) * plan.frames > MAX_BYTES && i > 2) throw new Error('الملف سيكون كبيراً جداً على ذاكرة المتصفح. اختر MP4، أو دقة أقل، أو قلّل مدة العرض.');
    report(i + 1, bytes);
    await tick();
  }
  onProgress({ phase: 'pack', done: plan.frames, total: plan.frames, fraction: 1, eta: 0, bytes }); await tick();
  const blob = muxVideo({ kind: 'mov', fourcc: 'ap4h', w: plan.w, h: plan.h, fps: plan.fps, depth: 32, name: 'Apple ProRes 4444', ...proresSampleEntry(), samples });
  return { blob, method: 'prores', name: baseName(g, plan, 'transparent.mov') };
}

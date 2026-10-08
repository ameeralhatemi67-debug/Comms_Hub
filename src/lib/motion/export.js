import { renderFrame, timingOf } from './renderers.js';
import { makeZip, muxVideo } from './containers.js';

export function download(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const png = canvas => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('تعذر إنشاء الصورة.')), 'image/png'));
export async function exportDesign(g, params, options, signal, onProgress) {
  const p = { ...params }, dims = g.dims?.(p) || { w: 1280, h: 720 };
  const scale = options.shortSide / Math.min(dims.w, dims.h);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(dims.w * scale / 2) * 2; canvas.height = Math.round(dims.h * scale / 2) * 2;
  const ctx = canvas.getContext('2d'), fps = 24, duration = timingOf(g, p).total / p.speed;
  const count = Math.ceil(duration * fps), samples = [];
  const frame = (time, bg = null) => renderFrame(g, p, time, ctx, canvas.width / dims.w, bg);
  if (options.format === 'png') {
    frame(options.time); const blob = await png(canvas); signal.throwIfAborted();
    download(blob, `${g.id}.png`); return;
  }
  // Bound in-memory exports. Raise this only when export work can stream to disk.
  if (count > 1200) throw new Error('مدة التصدير طويلة. قلّل المدة إلى ٥٠ ثانية أو أقل.');
  if (options.format === 'mp4') {
    if (!globalThis.VideoEncoder) throw new Error('هذا المتصفح لا يدعم تصدير MP4. استخدم MOV أو تسلسل PNG.');
    const config = { codec: 'avc1.640028', width: canvas.width, height: canvas.height, bitrate: 6000000, framerate: fps, avc: { format: 'avc' } };
    const supported = await VideoEncoder.isConfigSupported(config);
    if (!supported.supported) throw new Error('ترميز MP4 غير متاح. استخدم MOV أو تسلسل PNG.');
    let avcC, failure;
    const encoder = new VideoEncoder({
      output(chunk, meta) {
        const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
        samples.push({ data, key: chunk.type === 'key', timestamp: chunk.timestamp });
        const description = meta?.decoderConfig?.description;
        if (description && !avcC) avcC = new Uint8Array(description instanceof ArrayBuffer ? description : description.buffer.slice(description.byteOffset, description.byteOffset + description.byteLength));
      }, error(error) { failure = error; },
    });
    try {
      encoder.configure(config);
      for (let i = 0; i < count; i++) {
        signal.throwIfAborted(); if (failure) throw failure;
        frame(i / fps * p.speed, options.keyColor);
        const videoFrame = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
        try { encoder.encode(videoFrame, { keyFrame: i % fps === 0 }); } finally { videoFrame.close(); }
        while (encoder.encodeQueueSize > 6) {
          await new Promise(resolve => setTimeout(resolve, 10)); signal.throwIfAborted(); if (failure) throw failure;
        }
        onProgress(Math.round((i + 1) / count * 100));
      }
      await encoder.flush(); signal.throwIfAborted(); if (failure) throw failure;
      if (!avcC || samples.length !== count || !samples.every((s, i) => !i || s.timestamp > samples[i - 1].timestamp)) throw new Error('تعذر ترتيب إطارات MP4. استخدم MOV أو PNG.');
      download(muxVideo({ kind: 'mp4', fourcc: 'avc1', w: canvas.width, h: canvas.height, fps, depth: 24, name: 'AVC', avcC, samples }), `${g.id}.mp4`);
    } finally { if (encoder.state !== 'closed') encoder.close(); }
    return;
  }
  for (let i = 0; i < count; i++) {
    signal.throwIfAborted(); frame(i / fps * p.speed);
    const blob = await png(canvas);
    samples.push({ data: new Uint8Array(await blob.arrayBuffer()), key: true });
    onProgress(Math.round((i + 1) / count * 100));
    if (i % 4 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  signal.throwIfAborted();
  const blob = options.format === 'zip'
    ? makeZip(samples.map((s, i) => ({ name: `${g.id}_${String(i + 1).padStart(5, '0')}.png`, data: s.data })))
    : muxVideo({ kind: 'mov', fourcc: 'png ', w: canvas.width, h: canvas.height, fps, depth: 32, name: 'PNG', samples });
  download(blob, `${g.id}.${options.format}`);
}

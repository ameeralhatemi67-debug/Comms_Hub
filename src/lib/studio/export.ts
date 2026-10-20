// The studio's export (MVP_draft.md 62): every frame composed by the same compositor as the preview,
// video sources decoded in one forward pass per clip, the sound mixed ten seconds at a time and kept
// ahead of the pictures, encoded by Mediabunny (H.264 and AAC in MP4; VP9 and Opus in WebM where MP4
// cannot be made) and written as a stream to the browser's private storage (target.ts). It runs in
// this page: the person keeps the page visible until it ends. A still frame is a PNG. Browser only.
import type { WrappedCanvas } from 'mediabunny';
import { US, canvasOf, durationOf, type Clip, type Micros, type ProjectDoc } from './schema.ts';
import { visibleAt, sourceOf } from './timeline.ts';
import { composeFrame, composePhoto, type Resolver } from './compose.ts';
import { MotionRenderer } from './motion-adapter.ts';
import { frameCount, frameStart, frameUs } from './time.ts';
import { hasSound, mixWindow, windows, type AudioSourceReader } from './audio.ts';
import { ensureAac } from './support.ts';
import { openTarget, type Target } from './target.ts';
import type { MediaPool } from './media.ts';
import { loadFonts, usedFonts } from './text.ts';
import { isHold, sourceTime } from './speed.ts';

export type Short = 720 | 1080 | 2160;
export type VideoFormat = 'mp4' | 'webm';
export const SHORT_LABELS: Record<Short, string> = { 720: '720p', 1080: '1080p', 2160: '4K' };

/** The output size: the project's shape with its short side at `short`, in even pixels. */
export function outputSize(doc: ProjectDoc, short: number): { w: number; h: number } {
  const { w, h } = canvasOf(doc);
  const k = short / Math.min(w, h);
  return { w: Math.round((w * k) / 2) * 2, h: Math.round((h * k) / 2) * 2 };
}

/** Megabits a second the encoder aims at (Mediabunny's high quality), by short side, at 30 frames. */
const MBPS: Record<number, number> = { 720: 5, 1080: 10, 2160: 35 };

/** An estimate of the file's size, said before exporting. */
export function estimateBytes(doc: ProjectDoc, short: Short): number {
  const fps = doc.video?.fps ?? 30;
  const video = (MBPS[short] ?? 10) * (fps > 30 ? 1.5 : 1);
  const audio = hasSound(doc) ? 0.192 : 0;
  return Math.round((((video + audio) * 1e6) / 8) * (durationOf(doc) / US));
}

export type ExportProgress = { phase: 'prepare' | 'encode' | 'finish'; done: number; total: number };
export type ExportResult = { file: File; bytes: number; frames: number; duration: Micros; target: Target['kind']; audio: boolean };

export class ExportError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export const EXPORT_ERRORS: Record<string, string> = {
  VIDEO_CODEC: 'هذا المتصفح لا يرمّز الفيديو بهذا المقاس. جرّب مقاساً أصغر أو متصفح Chrome أو Edge على حاسوب.',
  MEMORY_CEILING: 'لا يحفظ هذا المتصفح الملفات على الجهاز، والتصدير في الذاكرة يقف عند 1.6 ج.ب. اختر مقاساً أصغر أو مدة أقصر.',
  EMPTY: 'المشروع فارغ: أضف مقطعاً قبل التصدير.',
  ABORTED: 'أُلغي التصدير.',
};

type Frames = { gen: AsyncGenerator<WrappedCanvas, void, unknown>; cur: WrappedCanvas | null; next: WrappedCanvas | null };

/** Reads one source's decoded sound for a span of source time. */
function audioReader(pool: MediaPool, mb: typeof import('mediabunny')): AudioSourceReader {
  return (sourceId, from, to) => {
    const input = pool.input(sourceId);
    if (!input) return null;
    return (async function* () {
      const track = await input.getPrimaryAudioTrack();
      if (!track || !(await track.canDecode())) return;
      const sink = new mb.AudioBufferSink(track);
      for await (const b of sink.buffers(from, to)) yield b;
    })();
  };
}

export async function exportVideo(
  doc: ProjectDoc,
  pool: MediaPool,
  opts: { short: Short; format: VideoFormat; name: string; onProgress?: (p: ExportProgress) => void; signal?: AbortSignal },
): Promise<ExportResult> {
  const mb = await import('mediabunny');
  // every font a text uses is ready before the first frame is drawn (fonts.ts: loaded only when used)
  await loadFonts(usedFonts(doc));
  const fps = doc.video?.fps ?? 30;
  const duration = durationOf(doc);
  if (duration <= 0) throw new ExportError('EMPTY');
  const total = frameCount(duration, fps);
  const { w, h } = outputSize(doc, opts.short);
  const vcodec = opts.format === 'mp4' ? 'avc' : 'vp9';
  const acodec = opts.format === 'mp4' ? 'aac' : 'opus';
  if (!(await mb.canEncodeVideo(vcodec, { width: w, height: h }))) throw new ExportError('VIDEO_CODEC');
  let sound = hasSound(doc);
  if (sound && acodec === 'aac' && !(await mb.canEncodeAudio('aac'))) sound = await ensureAac(typeof WebAssembly !== 'undefined' ? 'extension' : 'none');
  if (sound && acodec === 'opus') sound = await mb.canEncodeAudio('opus');
  const mime = opts.format === 'mp4' ? 'video/mp4' : 'video/webm';
  opts.onProgress?.({ phase: 'prepare', done: 0, total });
  const target = await openTarget(opts.name, mime, estimateBytes(doc, opts.short));
  const output = new mb.Output({ format: opts.format === 'mp4' ? new mb.Mp4OutputFormat({ fastStart: false }) : new mb.WebMOutputFormat(), target: target.target });
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const video = new mb.CanvasSource(canvas, { codec: vcodec, quality: mb.QUALITY_HIGH, keyFrameInterval: 2 });
  output.addVideoTrack(video, { frameRate: fps });
  const audio = sound ? new mb.AudioBufferSource({ codec: acodec, quality: mb.QUALITY_HIGH }) : null;
  if (audio) output.addAudioTrack(audio);
  const motion = new MotionRenderer();
  const iters = new Map<string, Frames>();
  const read = audioReader(pool, mb);
  const wins = audio ? windows(duration) : [];
  let wi = 0;
  const scale = w / canvasOf(doc).w;

  // stills read their one frame once; reversed clips read each frame where it is (the decoder seeks);
  // every other clip, at any speed or ramp, is decoded in one forward pass over the stretch it shows
  const stills = new Map<string, CanvasImageSource | null>();
  const frameFor = async (clip: Clip, t: Micros): Promise<CanvasImageSource | null> => {
    if (isHold(clip)) {
      if (!stills.has(clip.id)) {
        const f = await pool.frameAt(clip.source!, sourceTime(clip, t));
        stills.set(clip.id, f ? copyFrame(f) : null);
      }
      return stills.get(clip.id) ?? null;
    }
    if (clip.reverse) return pool.frameAt(clip.source!, sourceTime(clip, t));
    const at = sourceTime(clip, t) / US;
    let f = iters.get(clip.id);
    if (!f) {
      const from = sourceTime(clip, clip.start) / US;
      const to = sourceTime(clip, clip.start + clip.length) / US;
      const gen = pool.frames(clip.source!, from, to + 0.5);
      if (!gen) return null;
      const first = await gen.next();
      const second = first.done ? { done: true, value: undefined } : await gen.next();
      f = { gen, cur: first.done ? null : first.value, next: second.done ? null : (second.value as WrappedCanvas) };
      iters.set(clip.id, f);
    }
    while (f.next && f.next.timestamp <= at + 1e-6) {
      f.cur = f.next;
      const r = await f.gen.next();
      f.next = r.done ? null : r.value;
    }
    return (f.cur?.canvas as CanvasImageSource) ?? null;
  };

  try {
    await output.start();
    for (let n = 0; n < total; n++) {
      if (opts.signal?.aborted) throw new ExportError('ABORTED');
      const t = frameStart(n, fps);
      // the sound stays one window ahead of the pictures
      while (audio && wi < wins.length && wins[wi].from <= t) await audio.add(await mixWindow(doc, wins[wi++], read));
      const frames = new Map<string, CanvasImageSource | null>();
      for (const { clip } of visibleAt(doc, t)) if (sourceOf(doc, clip.source)?.media === 'video') frames.set(clip.id, await frameFor(clip, t));
      const res: Resolver = { motion, image: (id) => pool.image(id), videoFrame: (_s, _a, cid) => (cid ? (frames.get(cid) ?? null) : null) };
      composeFrame(ctx, doc, t, res, { scale });
      await video.add(t / US, frameUs(fps) / US);
      if (n % 5 === 0 || n === total - 1) opts.onProgress?.({ phase: 'encode', done: n + 1, total });
    }
    while (audio && wi < wins.length) await audio.add(await mixWindow(doc, wins[wi++], read));
    opts.onProgress?.({ phase: 'finish', done: total, total });
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => undefined);
    await target.discard();
    throw e;
  } finally {
    for (const f of iters.values()) await f.gen.return(undefined).catch(() => undefined);
  }
  const file = await target.result();
  return { file, bytes: file.size, frames: total, duration, target: target.kind, audio: !!audio };
}

/** One frame (a video project at time t, or a photo) as a PNG, JPEG or WebP file at `short` (or full size). */
export async function exportStill(doc: ProjectDoc, pool: MediaPool, opts: { t?: Micros; short?: number; type?: 'image/png' | 'image/jpeg' | 'image/webp'; name: string; quality?: number; adjusted?: Resolver['adjusted'] }): Promise<File> {
  await loadFonts(usedFonts(doc));
  const { w: W, h: H } = canvasOf(doc);
  const size = opts.short ? outputSize(doc, opts.short) : { w: W, h: H };
  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext('2d')!;
  const motion = new MotionRenderer();
  const type = opts.type ?? 'image/png';
  if (doc.kind === 'photo') {
    composePhoto(ctx, doc, { motion, image: (id) => pool.image(id), videoFrame: () => null, adjusted: opts.adjusted }, { scale: size.w / W, transparent: type === 'image/png' && doc.photo?.background === null });
  } else {
    const t = opts.t ?? 0;
    const frames = new Map<string, CanvasImageSource | null>();
    for (const { clip } of visibleAt(doc, t)) {
      if (sourceOf(doc, clip.source)?.media !== 'video') continue;
      const f = await pool.frameAt(clip.source!, sourceTime(clip, t));
      frames.set(clip.id, f ? copyFrame(f) : null);
    }
    composeFrame(ctx, doc, t, { motion, image: (id) => pool.image(id), videoFrame: (_s, _a, cid) => (cid ? (frames.get(cid) ?? null) : null) }, { scale: size.w / W });
  }
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, opts.quality ?? 0.92));
  if (!blob) throw new Error('تعذّر إنشاء الصورة.');
  return new File([blob], opts.name, { type });
}

/** A decoded frame copied to a canvas of its own (the decoder may reuse the one it gave). */
function copyFrame(src: CanvasImageSource): CanvasImageSource {
  const s = src as { width?: number; height?: number };
  const w = typeof s.width === 'number' ? s.width : 0;
  const h = typeof s.height === 'number' ? s.height : 0;
  if (!w || !h || typeof document === 'undefined') return src;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.drawImage(src, 0, 0);
  return c;
}

/** A file name from a project title: Arabic kept, characters files cannot hold removed. */
export function fileName(title: string, ext: string): string {
  const base = title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'studio';
  return `${base}.${ext}`;
}

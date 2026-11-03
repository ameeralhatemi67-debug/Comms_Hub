// The studio's export (MVP_draft.md 62): every frame composed by the same compositor as the preview,
// video sources decoded in one forward pass per clip, the sound mixed ten seconds at a time and kept
// ahead of the pictures, encoded by Mediabunny (H.264 and AAC in MP4; VP9 and Opus in WebM where MP4
// cannot be made) and written as a stream to the browser's private storage (target.ts). The picture is
// BT.709 on every computer: where the encoder runs on the processor, the frames go to it as BT.709 YUV
// made by workers (yuv.ts, yuv-pipe.ts), not as the canvas, and the file says BT.709 whichever way it was
// made (exportVideo). It runs in
// this page: the person keeps the page visible until it ends. A still frame is a PNG. Browser only.
import type { VideoEncodingConfig, WrappedCanvas } from 'mediabunny';
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
import { LoudnessMeter, type LoudnessResult } from './loudness.ts';
import { BT709_SPACE, rgbaToI420 } from './yuv.ts';
import { YUV_WORKERS, YuvPipe } from './yuv-pipe.ts';
import { Drawers } from './drawers.ts';

export type Short = 720 | 1080 | 2160;
export type VideoFormat = 'mp4' | 'webm';
export const SHORT_LABELS: Record<Short, string> = { 720: '720p', 1080: '1080p', 2160: '4K' };

/** The output size: the project's shape with its short side at `short`, in even pixels. */
export function outputSize(doc: ProjectDoc, short: number): { w: number; h: number } {
  const { w, h } = canvasOf(doc);
  const k = short / Math.min(w, h);
  return { w: Math.round((w * k) / 2) * 2, h: Math.round((h * k) / 2) * 2 };
}

/** Megabits a second the export aims at, by short side, at 30 frames (half as much again above 30). */
const MBPS: Record<number, number> = { 720: 5, 1080: 10, 2160: 35 };
export const aimMbps = (short: number, fps: number) => (MBPS[short] ?? 10) * (fps > 30 ? 1.5 : 1);

/**
 * The quantizer of Mediabunny's high quality for H.264 (its level 0.75 between 41 and 16), which every encoder that
 * takes a quantizer is given, as the graphics chips' are.
 */
export const HIGH_QP = 22;

/**
 * What an H.264 export asks of its encoder (MVP_draft.md 62.10): the high quantizer, and where the encoder takes no
 * quantizer, as the processor's does not, the rate the export aims at. Measured on 2026-11-03: left to Mediabunny,
 * that fallback was 6.1 Mbit/s at 1080p, and the proof's file 39.3 dB from its source; at 10 Mbit/s, 41.2 dB. The
 * chips' files are the same packets either way (qa/studio-export-yuv.cjs). WebM keeps Mediabunny's high quality.
 */
export function videoQuality(mb: typeof import('mediabunny'), codec: 'avc' | 'vp9', short: number, fps: number) {
  return codec === 'avc' ? new mb.Quality({ quantizer: HIGH_QP, bitrate: Math.round(aimMbps(short, fps) * 1e6) }) : mb.QUALITY_HIGH;
}

/** An estimate of the file's size, said before exporting. */
export function estimateBytes(doc: ProjectDoc, short: Short): number {
  const fps = doc.video?.fps ?? 30;
  const video = aimMbps(short, fps);
  const audio = hasSound(doc) ? 0.192 : 0;
  return Math.round((((video + audio) * 1e6) / 8) * (durationOf(doc) / US));
}

/**
 * The colour a canvas path's file says (MVP_draft.md 62.10). A graphics chip's encoder converts the canvas with the
 * BT.709 matrix; Edge 156 then names the transfer iec61966-2-1, the canvas's own, where the application's Chromium 152
 * and the processor path name bt709. The name goes into the file's colr box from the encoder's description (Edge's
 * H.264 headers leave it unspecified), so the export names it bt709 there, and changes nothing else.
 */
export function asBt709(space: VideoColorSpaceInit | null | undefined): boolean {
  if (!space || space.matrix !== 'bt709' || space.primaries !== 'bt709' || space.fullRange !== false || space.transfer !== 'iec61966-2-1') return false;
  space.transfer = 'bt709';
  return true;
}

export type ExportProgress = { phase: 'prepare' | 'encode' | 'finish'; done: number; total: number };
/**
 * `via`: the frames went to the encoder from the canvas (a graphics chip encoding) or as BT.709 YUV made here (yuv.ts),
 * by `yuvWorkers` workers (0: on the page), with WebAssembly where `yuvSimd`; drawn by `drawers` workers (0: on the
 * page). `steps`: the workers that failed, each followed by the same export with fewer.
 */
export type ExportResult = { file: File; bytes: number; frames: number; duration: Micros; target: Target['kind']; audio: boolean; via: 'canvas' | 'yuv'; yuvWorkers: number; yuvSimd: boolean; drawers: number; steps: string[] };

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

/**
 * The loudness of the project's sound (MVP_draft.md 62.9): the same windows the export mixes, measured by
 * BS.1770 (loudness.ts). «قياس المستوى», and the first pass of «توحيد مستوى الصوت», unless it was worked out ahead
 * (loudness-ahead.ts, which waits for the browser's idle time between windows: `between`).
 */
export async function measureLoudness(doc: ProjectDoc, pool: MediaPool, opts: { onProgress?: (f: number) => void; signal?: AbortSignal; between?: () => Promise<void> } = {}): Promise<LoudnessResult> {
  const mb = await import('mediabunny');
  const read = audioReader(pool, mb);
  const meter = new LoudnessMeter();
  const wins = windows(durationOf(doc));
  for (let i = 0; i < wins.length; i++) {
    if (opts.between) await opts.between();
    if (opts.signal?.aborted) throw new ExportError('ABORTED');
    const b = await mixWindow(doc, wins[i], read);
    meter.push([b.getChannelData(0), b.getChannelData(1)]);
    opts.onProgress?.((i + 1) / wins.length);
  }
  return meter.result();
}

/** Every sample of a mixed window times one gain (the export's «توحيد مستوى الصوت»). */
function applyGain(b: AudioBuffer, gain: number): AudioBuffer {
  if (gain === 1) return b;
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= gain;
  }
  return b;
}

export async function exportVideo(
  doc: ProjectDoc,
  pool: MediaPool,
  opts: {
    short: Short;
    format: VideoFormat;
    name: string;
    onProgress?: (p: ExportProgress) => void;
    signal?: AbortSignal;
    /** One gain for the whole sound (loudness.ts normalizeGain). */
    gain?: number;
    /** «مسودة» across the picture (downloads only). */
    watermark?: string | null;
    /** A file the person chose (desktop application): written there directly. */
    saveTo?: FileSystemFileHandle;
    /** Workers converting to BT.709 where the encoder is on the processor (yuv-pipe.ts); 0 is on the page. Speed only. */
    yuvWorkers?: number;
    /** Workers drawing the frames (drawers.ts, export-draw.ts); 0, the default, is on the page. Speed only. */
    drawers?: number;
    /** How a drawing worker is started (the proofs, where the worker's file is served apart). */
    makeDrawer?: () => Worker;
  },
): Promise<ExportResult> {
  const mb = await import('mediabunny');
  // every font a text uses is ready before the first frame is drawn (fonts.ts: loaded only when used)
  await loadFonts(usedFonts(doc));
  if (opts.watermark) await loadFonts([{ font: 'IBM Plex Sans Arabic', weight: 700 }]);
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
  // How the frames reach the encoder (MVP_draft.md 62.10, 2026-11-03): from the canvas where the graphics chip encodes,
  // which writes BT.709; as BT.709 YUV made here (yuv.ts) where the encoder runs on the processor, which given the
  // canvas writes BT.601. An encoder that falls back to the processor after all says so in its first packet's colour,
  // and the export then starts again the second way, so a file is never BT.601.
  const onChip = await mb.canEncodeVideo(vcodec, { width: w, height: h, hardwareAcceleration: 'prefer-hardware' });
  if (!onChip) return attempt('yuv');
  try {
    return await attempt('canvas');
  } catch (e) {
    if (e instanceof ExportError && e.code === 'COLOUR') return attempt('yuv');
    throw e;
  }

  // The workers asked for, and on a worker's failure the same export again with fewer: drawing on the page, converting
  // on the page. Every rung makes the same file (qa/studio-export-yuv.cjs, qa/studio-export-draw.cjs); only time differs.
  async function attempt(via: 'canvas' | 'yuv'): Promise<ExportResult> {
    let workers = via === 'yuv' ? Math.max(0, opts.yuvWorkers ?? YUV_WORKERS) : 0;
    let drawers = Math.max(0, opts.drawers ?? 0);
    const steps: string[] = [];
    for (;;) {
      try {
        const r = await run(via, workers, drawers);
        return { ...r, steps };
      } catch (e) {
        const code = e instanceof ExportError ? e.code : '';
        if (code === 'DRAW_WORKER' && drawers > 0) drawers = 0;
        else if (code === 'YUV_WORKER' && workers > 0) workers = 0;
        else throw e;
        steps.push(code);
      }
    }
  }

  async function run(via: 'canvas' | 'yuv', workers: number, drawCount: number): Promise<ExportResult> {
    opts.onProgress?.({ phase: 'prepare', done: 0, total });
    const pipe = workers > 0 ? YuvPipe.open(w, h, workers) : null;
    if (workers > 0 && !pipe) throw new ExportError('YUV_WORKER');
    const drawers = drawCount > 0 ? await Drawers.open(doc, pool, { w, h, watermark: opts.watermark ?? null, count: drawCount, make: opts.makeDrawer }) : null;
    if (drawCount > 0 && !drawers) {
      pipe?.close();
      throw new ExportError('DRAW_WORKER');
    }
    const target = await openTarget(opts.name, mime, estimateBytes(doc, opts.short), opts.saveTo).catch((e) => {
      pipe?.close();
      drawers?.close();
      throw e;
    });
    const output = new mb.Output({ format: opts.format === 'mp4' ? new mb.Mp4OutputFormat({ fastStart: false }) : new mb.WebMOutputFormat(), target: target.target });
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    let matrix: string | null = null;
    const encoding: VideoEncodingConfig = {
      codec: vcodec,
      quality: videoQuality(mb, vcodec, opts.short, fps),
      keyFrameInterval: 2,
      // called with the description Mediabunny writes into the file next (asBt709)
      onEncodedPacket: (_packet: unknown, meta: EncodedVideoChunkMetadata | undefined) => {
        matrix ??= meta?.decoderConfig?.colorSpace?.matrix ?? null;
        if (via === 'canvas') asBt709(meta?.decoderConfig?.colorSpace);
      },
    };
    // the canvas way takes the page's canvas, or the frames the drawers made of theirs; the BT.709 way takes I420
    const fromCanvas = via === 'canvas' && !drawers ? new mb.CanvasSource(canvas, encoding) : null;
    const fromFrames = via === 'canvas' && drawers ? new mb.VideoSampleSource(encoding) : null;
    const fromYuv = via === 'yuv' ? new mb.VideoSampleSource(encoding) : null;
    type Sample = InstanceType<typeof mb.VideoSample>;
    const i420 = (yuv: Uint8Array<ArrayBuffer>, t: Micros) => new mb.VideoSample(yuv, { format: 'I420', codedWidth: w, codedHeight: h, timestamp: t / US, duration: frameUs(fps) / US, colorSpace: { ...BT709_SPACE } });
    const ofFrame = (frame: VideoFrame, t: Micros) => new mb.VideoSample(frame, { timestamp: t / US, duration: frameUs(fps) / US });
    const add = async (source: InstanceType<typeof mb.VideoSampleSource>, s: Sample) => {
      try {
        await source.add(s);
      } finally {
        s.close();
      }
    };
    // frames with the workers, oldest first: each goes on when its turn comes
    const drawn: { t: Micros; frame: Promise<VideoFrame> }[] = [];
    const inflight: { t: Micros; frame: Promise<VideoFrame> }[] = [];
    const waitFor = async (job: { frame: Promise<VideoFrame> }, code: string) => {
      try {
        return await job.frame;
      } catch {
        throw new ExportError(code);
      }
    };
    const oldest = async () => {
      const job = inflight.shift()!;
      await add(fromYuv!, ofFrame(await waitFor(job, 'YUV_WORKER'), job.t));
    };
    /** A composed frame, the page's canvas or a drawer's, on its way to the encoder. */
    const encode = async (t: Micros, frame: VideoFrame) => {
      if (fromFrames) {
        await add(fromFrames, ofFrame(frame, t));
        if (matrix && matrix !== 'bt709') throw new ExportError('COLOUR');
      } else if (pipe) {
        inflight.push({ t, frame: pipe.convert(frame) });
        while (inflight.length >= pipe.depth) await oldest();
      } else {
        const rgba = new Uint8ClampedArray(w * h * 4);
        try {
          await frame.copyTo(rgba, { rect: { x: 0, y: 0, width: w, height: h }, format: 'RGBA', colorSpace: 'srgb' });
        } finally {
          frame.close();
        }
        await add(fromYuv!, i420(rgbaToI420(rgba, w, h), t));
      }
    };
    const nextDrawn = async () => {
      const job = drawn.shift()!;
      await encode(job.t, await waitFor(job, 'DRAW_WORKER'));
    };
    output.addVideoTrack((fromCanvas ?? fromFrames ?? fromYuv)!, { frameRate: fps });
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
        while (audio && wi < wins.length && wins[wi].from <= t) await audio.add(applyGain(await mixWindow(doc, wins[wi++], read), opts.gain ?? 1));
        const frames = new Map<string, CanvasImageSource | null>();
        for (const { clip } of visibleAt(doc, t)) if (sourceOf(doc, clip.source)?.media === 'video') frames.set(clip.id, await frameFor(clip, t));
        if (drawers) {
          // the decoded frames copied for a drawer (the decoder reuses its canvases)
          const sent: [string, ImageBitmap | null][] = [];
          for (const [cid, src] of frames) sent.push([cid, src ? await createImageBitmap(src as ImageBitmapSource) : null]);
          drawn.push({ t, frame: drawers.draw(t, frameUs(fps), sent) });
          while (drawn.length >= drawers.depth) await nextDrawn();
        } else {
          const res: Resolver = { motion, image: (id) => pool.image(id), videoFrame: (_s, _a, cid) => (cid ? (frames.get(cid) ?? null) : null) };
          composeFrame(ctx, doc, t, res, { scale, watermark: opts.watermark });
          if (fromCanvas) {
            await fromCanvas.add(t / US, frameUs(fps) / US);
            if (matrix && matrix !== 'bt709') throw new ExportError('COLOUR');
          } else if (pipe) await encode(t, new VideoFrame(canvas, { timestamp: t, duration: frameUs(fps) }));
          else await add(fromYuv!, i420(rgbaToI420(ctx.getImageData(0, 0, w, h).data, w, h), t));
        }
        if (n % 5 === 0 || n === total - 1) opts.onProgress?.({ phase: 'encode', done: n + 1, total });
      }
      while (drawn.length) await nextDrawn();
      while (inflight.length) await oldest();
      while (audio && wi < wins.length) await audio.add(applyGain(await mixWindow(doc, wins[wi++], read), opts.gain ?? 1));
      opts.onProgress?.({ phase: 'finish', done: total, total });
      await output.finalize();
      if ((fromCanvas || fromFrames) && matrix && matrix !== 'bt709') throw new ExportError('COLOUR');
    } catch (e) {
      await output.cancel().catch(() => undefined);
      await target.discard();
      throw e;
    } finally {
      pipe?.close();
      drawers?.close();
      for (const job of [...drawn, ...inflight]) void job.frame.then((f) => f.close(), () => undefined);
      for (const f of iters.values()) await f.gen.return(undefined).catch(() => undefined);
    }
    const file = await target.result();
    return { file, bytes: file.size, frames: total, duration, target: target.kind, audio: !!audio, via, yuvWorkers: workers, yuvSimd: pipe?.simd === true, drawers: drawCount, steps: [] };
  }
}

/** One frame (a video project at time t, or a photo) as a PNG, JPEG or WebP file at `short` (or full size). */
export async function exportStill(doc: ProjectDoc, pool: MediaPool, opts: { t?: Micros; short?: number; type?: 'image/png' | 'image/jpeg' | 'image/webp'; name: string; quality?: number; adjusted?: Resolver['adjusted']; watermark?: string | null }): Promise<File> {
  await loadFonts(usedFonts(doc));
  if (opts.watermark) await loadFonts([{ font: 'IBM Plex Sans Arabic', weight: 700 }]);
  const { w: W, h: H } = canvasOf(doc);
  const size = opts.short ? outputSize(doc, opts.short) : { w: W, h: H };
  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext('2d')!;
  const motion = new MotionRenderer();
  const type = opts.type ?? 'image/png';
  if (doc.kind === 'photo') {
    // a layer that is a frame of a video is read from the decoder first (copied: its canvas is reused)
    const frames = new Map<string, CanvasImageSource | null>();
    for (const l of doc.photo?.layers ?? []) {
      if (l.hidden || sourceOf(doc, l.source)?.media !== 'video') continue;
      const f = await pool.frameAt(l.source!, l.at ?? 0);
      frames.set(l.id, f ? copyFrame(f) : null);
    }
    composePhoto(ctx, doc, { motion, image: (id) => pool.image(id), videoFrame: (_s, _a, id) => (id ? (frames.get(id) ?? null) : null), adjusted: opts.adjusted }, { scale: size.w / W, transparent: type === 'image/png' && doc.photo?.background === null, watermark: opts.watermark });
  } else {
    const t = opts.t ?? 0;
    const frames = new Map<string, CanvasImageSource | null>();
    for (const { clip } of visibleAt(doc, t)) {
      if (sourceOf(doc, clip.source)?.media !== 'video') continue;
      const f = await pool.frameAt(clip.source!, sourceTime(clip, t));
      frames.set(clip.id, f ? copyFrame(f) : null);
    }
    composeFrame(ctx, doc, t, { motion, image: (id) => pool.image(id), videoFrame: (_s, _a, cid) => (cid ? (frames.get(cid) ?? null) : null) }, { scale: size.w / W, watermark: opts.watermark });
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

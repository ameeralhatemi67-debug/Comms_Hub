// One pass, several shapes (Desktop_Power_Ideas.md P-05; MVP_draft.md 62.10). When an export makes the project in two
// to four shapes, each source is decoded once, and every shape is composed for the same moment on its own canvas and
// encoded by its own encoder into its own file; the sound is mixed once and given to each. Each shape's composed
// frames, encoder settings and colour are those of its own export (export.ts), and so is the BT.709 way on a computer
// that encodes on its processor (a worker pipe per shape). As many shapes go together as the computer has lanes
// (export-plan.ts); with one lane, or where anything fails, the shapes are exported one after another as before, so a
// failure costs time and never a file. qa/studio-shapes-onepass.cjs holds the shapes' frames and files to their own
// exports'. Browser only.
import type { VideoEncodingConfig } from 'mediabunny';
import { US, canvasOf, durationOf, type ProjectDoc } from './schema.ts';
import { sourceOf, visibleAt } from './timeline.ts';
import { composeFrame, type Resolver } from './compose.ts';
import { MotionRenderer } from './motion-adapter.ts';
import { frameCount, frameStart, frameUs } from './time.ts';
import { hasSound, mixWindow, windows } from './audio.ts';
import { ensureAac } from './support.ts';
import { openTarget, type Target } from './target.ts';
import type { MediaPool } from './media.ts';
import { loadFonts, usedFonts } from './text.ts';
import { YUV_WORKERS, YuvPipe } from './yuv-pipe.ts';
import { ExportError, applyGain, asBt709, audioReader, estimateBytes, exportFrames, exportVideo, outputSize, videoQuality, type ExportProgress, type ExportResult, type Short, type VideoFormat } from './export.ts';

export type ShapeJob = { doc: ProjectDoc; name: string; saveTo?: FileSystemFileHandle };
type Opts = {
  short: Short;
  format: VideoFormat;
  gain?: number;
  watermark?: string | null;
  signal?: AbortSignal;
  onProgress?: (p: ExportProgress) => void;
  yuvWorkers?: number;
  /** For the proofs only: each shape's composed frame n, before it is encoded, as a VideoFrame the proof closes. */
  inspect?: (shape: number, n: number, frame: VideoFrame) => Promise<void>;
};

/**
 * The shapes' files, in order: in one pass where there are two or more, otherwise (and after any failure but a cancel)
 * one export after another. `steps` says 'ONE_PASS' on the files that had to be made again one by one.
 */
export async function exportShapes(jobs: ShapeJob[], pool: MediaPool, opts: Opts): Promise<ExportResult[]> {
  if (jobs.length > 1) {
    try {
      return await onePass(jobs, pool, opts);
    } catch (e) {
      if (e instanceof ExportError && (e.code === 'ABORTED' || e.code === 'EMPTY' || e.code === 'VIDEO_CODEC' || e.code === 'MEMORY_CEILING')) throw e;
    }
  }
  const out: ExportResult[] = [];
  for (const j of jobs) {
    const r = await exportVideo(j.doc, pool, { short: opts.short, format: opts.format, name: j.name, gain: opts.gain, watermark: opts.watermark, saveTo: j.saveTo, signal: opts.signal, onProgress: opts.onProgress, yuvWorkers: opts.yuvWorkers, inspect: opts.inspect ? (n, f) => opts.inspect!(out.length, n, f) : undefined });
    out.push(jobs.length > 1 ? { ...r, steps: [...r.steps, 'ONE_PASS'] } : r);
  }
  return out;
}

type Shape = {
  job: ShapeJob;
  w: number;
  h: number;
  scale: number;
  via: 'canvas' | 'yuv';
  target: Target;
  output: InstanceType<typeof import('mediabunny').Output>;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  matrix: string | null;
  fromCanvas: InstanceType<typeof import('mediabunny').CanvasSource> | null;
  fromYuv: InstanceType<typeof import('mediabunny').VideoSampleSource> | null;
  pipe: YuvPipe | null;
  inflight: { t: number; frame: Promise<VideoFrame> }[];
  audio: InstanceType<typeof import('mediabunny').AudioBufferSource> | null;
};

async function onePass(jobs: ShapeJob[], pool: MediaPool, opts: Opts): Promise<ExportResult[]> {
  const mb = await import('mediabunny');
  const base = jobs[0].doc;
  await loadFonts(usedFonts(base));
  if (opts.watermark) await loadFonts([{ font: 'IBM Plex Sans Arabic', weight: 700 }]);
  const fps = base.video?.fps ?? 30;
  const duration = durationOf(base);
  if (duration <= 0) throw new ExportError('EMPTY');
  const total = frameCount(duration, fps);
  const vcodec = opts.format === 'mp4' ? 'avc' : 'vp9';
  const acodec = opts.format === 'mp4' ? 'aac' : 'opus';
  let sound = hasSound(base);
  if (sound && acodec === 'aac' && !(await mb.canEncodeAudio('aac'))) sound = await ensureAac(typeof WebAssembly !== 'undefined' ? 'extension' : 'none');
  if (sound && acodec === 'opus') sound = await mb.canEncodeAudio('opus');
  const mime = opts.format === 'mp4' ? 'video/mp4' : 'video/webm';
  const workers = Math.max(1, opts.yuvWorkers ?? YUV_WORKERS);
  const shapes: Shape[] = [];
  try {
    for (const [i, job] of jobs.entries()) {
      const { w, h } = outputSize(job.doc, opts.short);
      if (!(await mb.canEncodeVideo(vcodec, { width: w, height: h }))) throw new ExportError('VIDEO_CODEC');
      const onChip = await mb.canEncodeVideo(vcodec, { width: w, height: h, hardwareAcceleration: 'prefer-hardware' });
      const via: Shape['via'] = onChip ? 'canvas' : 'yuv';
      const pipe = via === 'yuv' ? YuvPipe.open(w, h, workers) : null;
      if (via === 'yuv' && !pipe) throw new ExportError('YUV_WORKER');
      const target = await openTarget(job.name, mime, estimateBytes(job.doc, opts.short), job.saveTo, i > 0);
      const output = new mb.Output({ format: opts.format === 'mp4' ? new mb.Mp4OutputFormat({ fastStart: false }) : new mb.WebMOutputFormat(), target: target.target });
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const s: Shape = { job, w, h, scale: w / canvasOf(job.doc).w, via, target, output, canvas, ctx: canvas.getContext('2d')!, matrix: null, fromCanvas: null, fromYuv: null, pipe, inflight: [], audio: null };
      const encoding: VideoEncodingConfig = {
        codec: vcodec,
        quality: videoQuality(mb, vcodec, opts.short, fps),
        keyFrameInterval: 2,
        onEncodedPacket: (_p, meta) => {
          s.matrix ??= meta?.decoderConfig?.colorSpace?.matrix ?? null;
          if (via === 'canvas') asBt709(meta?.decoderConfig?.colorSpace);
        },
      };
      s.fromCanvas = via === 'canvas' ? new mb.CanvasSource(canvas, encoding) : null;
      s.fromYuv = via === 'yuv' ? new mb.VideoSampleSource(encoding) : null;
      output.addVideoTrack((s.fromCanvas ?? s.fromYuv)!, { frameRate: fps });
      s.audio = sound ? new mb.AudioBufferSource({ codec: acodec, quality: mb.QUALITY_HIGH }) : null;
      if (s.audio) output.addAudioTrack(s.audio);
      shapes.push(s);
    }
    const source = exportFrames(pool);
    const motion = new MotionRenderer();
    const read = audioReader(pool, mb);
    const wins = sound ? windows(duration) : [];
    let wi = 0;
    const toYuv = async (s: Shape, t: number, frame: VideoFrame) => {
      s.inflight.push({ t, frame: s.pipe!.convert(frame) });
      while (s.inflight.length >= s.pipe!.depth) await nextYuv(s);
    };
    const nextYuv = async (s: Shape) => {
      const job = s.inflight.shift()!;
      let frame: VideoFrame;
      try {
        frame = await job.frame;
      } catch {
        throw new ExportError('YUV_WORKER');
      }
      const sample = new mb.VideoSample(frame, { timestamp: job.t / US, duration: frameUs(fps) / US });
      try {
        await s.fromYuv!.add(sample);
      } finally {
        sample.close();
      }
    };
    try {
      for (const s of shapes) await s.output.start();
      for (let n = 0; n < total; n++) {
        if (opts.signal?.aborted) throw new ExportError('ABORTED');
        const t = frameStart(n, fps);
        // the sound, mixed once, one window ahead of the pictures, in every file
        while (wi < wins.length && wins[wi].from <= t) {
          const b = applyGain(await mixWindow(base, wins[wi++], read), opts.gain ?? 1);
          for (const s of shapes) await s.audio!.add(b);
        }
        // decoded once for every shape (a shape changes where a clip sits, never which frame it shows)
        const frames = new Map<string, CanvasImageSource | null>();
        for (const { clip } of visibleAt(base, t)) if (sourceOf(base, clip.source)?.media === 'video') frames.set(clip.id, await source.frame(clip, t));
        const res: Resolver = { motion, image: (id) => pool.image(id), videoFrame: (_s, _a, cid) => (cid ? (frames.get(cid) ?? null) : null) };
        for (const [i, s] of shapes.entries()) {
          composeFrame(s.ctx, s.job.doc, t, res, { scale: s.scale, watermark: opts.watermark });
          if (opts.inspect) await opts.inspect(i, n, new VideoFrame(s.canvas, { timestamp: t }));
          if (s.fromCanvas) {
            await s.fromCanvas.add(t / US, frameUs(fps) / US);
            if (s.matrix && s.matrix !== 'bt709') throw new ExportError('COLOUR');
          } else await toYuv(s, t, new VideoFrame(s.canvas, { timestamp: t, duration: frameUs(fps) }));
        }
        if (n % 5 === 0 || n === total - 1) opts.onProgress?.({ phase: 'encode', done: n + 1, total });
      }
      for (const s of shapes) while (s.inflight.length) await nextYuv(s);
      while (wi < wins.length) {
        const b = applyGain(await mixWindow(base, wins[wi++], read), opts.gain ?? 1);
        for (const s of shapes) await s.audio!.add(b);
      }
      opts.onProgress?.({ phase: 'finish', done: total, total });
      for (const s of shapes) await s.output.finalize();
      if (shapes.some((s) => s.fromCanvas && s.matrix && s.matrix !== 'bt709')) throw new ExportError('COLOUR');
    } finally {
      await source.close();
    }
  } catch (e) {
    for (const s of shapes) {
      await s.output.cancel().catch(() => undefined);
      await s.target.discard();
    }
    throw e;
  } finally {
    for (const s of shapes) {
      s.pipe?.close();
      for (const j of s.inflight) void j.frame.then((f) => f.close(), () => undefined);
    }
  }
  const out: ExportResult[] = [];
  for (const s of shapes) {
    const file = await s.target.result();
    out.push({ file, bytes: file.size, frames: total, duration, target: s.target.kind, audio: !!s.audio, via: s.via, yuvWorkers: s.pipe ? workers : 0, yuvSimd: s.pipe?.simd === true, drawers: 0, lanes: 1, steps: [] });
  }
  return out;
}

/** Shapes in groups of at most `lanes`, in order: each group one pass. */
export const shapeGroups = <T>(list: T[], lanes: number): T[][] => {
  const k = Math.max(1, Math.floor(lanes));
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += k) out.push(list.slice(i, i + k));
  return out;
};

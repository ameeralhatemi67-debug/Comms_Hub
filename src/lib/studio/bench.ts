// «قياس قدرة الجهاز» (Desktop_Power_Ideas.md P-33, phase D9): about half a minute of this computer measuring what it
// can do for the studio, by the studio's own means. WebCodecs encodes and decodes at the sizes the export makes,
// the real compositor (compose.ts) draws the three reference documents of bench-docs.ts, and one to three export
// lanes run at once, each drawing the effects document at 1080p and encoding it the way export.ts does (a canvas,
// a VideoFrame, the encoder at its default preference); one lane is the reference export. Each figure is timed `runs` times; the
// median is kept, with the largest spread. The synthetic sources are painted from their time alone, so the
// frames are the same on every machine (the cross-device proof, P-37, draws them too). Nothing is kept here and
// nothing leaves the page: in the desktop application the numbers go to the application, which keeps them on
// this computer. Browser only.
import { canvasOf, US, type ProjectDoc } from './schema.ts';
import { composeFrame, type Resolver } from './compose.ts';
import { MotionRenderer } from './motion-adapter.ts';
import { BENCH_DOCS, IMAGE_SIZE, SYNTHETIC_IMAGE, SYNTHETIC_VIDEO, VIDEO_SIZE } from './bench-docs.ts';
import { loadFonts, usedFonts } from './text.ts';
import { frameStart } from './time.ts';
import type { ProfileNumbers, ProfileRate } from '../native/index.ts';

export const CODECS = Object.freeze({
  h264: 'avc1.640034',
  hevc: 'hvc1.1.6.L153.B0',
  hevc10: 'hvc1.2.4.L153.B0',
  av1: 'av01.0.08M.08',
  av1_10: 'av01.0.08M.10',
});

const FPS = 30;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const bitrate = (w: number, h: number) => (w * h >= 8e6 ? 35e6 : 10e6);
type Hw = 'prefer-hardware' | 'prefer-software' | 'no-preference';

// --- synthetic sources: exact pixels from integer arithmetic, no filter, no decoder --------------------

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

/** A picture with gradients, squares and grain, the same bytes on every machine. */
export function basePixels(w: number, h: number, seed: number): ImageData {
  const img = new ImageData(w, h);
  const d = img.data;
  let s = seed >>> 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      const grain = ((s >>> 24) - 128) >> 3;
      const check = ((x >> 7) + (y >> 7)) & 1 ? 36 : 0;
      const wave = Math.abs(((x + y) % 512) - 256) >> 1;
      const i = (y * w + x) * 4;
      d[i] = clamp(((x * 220) / w + grain + check) | 0);
      d[i + 1] = clamp(((y * 220) / h + grain + wave / 3) | 0);
      d[i + 2] = clamp(64 + wave + grain - check);
      d[i + 3] = 255;
    }
  }
  return img;
}

const MARGIN = { x: 256, y: 128 };
type Canvas = OffscreenCanvas | HTMLCanvasElement;
const makeCanvas = (w: number, h: number): Canvas => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

/**
 * The synthetic sources of bench-docs.ts. A video frame is the base picture moved by whole pixels per frame,
 * written with putImageData (exact everywhere). `cycle` keeps that many frames and reuses them, so the
 * measurement times the compositor and not this painting; the proof asks for the exact frame (cycle 0).
 */
export class SyntheticSources {
  private video: ImageData | null = null;
  private image: Canvas | null = null;
  private frames = new Map<number, Canvas>();
  private readonly cycle: number;

  constructor(cycle = 0) {
    this.cycle = cycle;
  }

  private base(): ImageData {
    return (this.video ??= basePixels(VIDEO_SIZE.w + MARGIN.x, VIDEO_SIZE.h + MARGIN.y, 2026));
  }

  videoAt(t: number): Canvas {
    const n = Math.max(0, Math.round((t * FPS) / US));
    const key = this.cycle ? n % this.cycle : n;
    let c = this.frames.get(key);
    if (!c) {
      c = makeCanvas(VIDEO_SIZE.w, VIDEO_SIZE.h);
      (c.getContext('2d') as CanvasRenderingContext2D).putImageData(this.base(), -((key * 7) % MARGIN.x), -((key * 3) % MARGIN.y));
      this.frames.set(key, c);
      // the proof walks a few times only; the measurement keeps `cycle` frames
      if (!this.cycle && this.frames.size > 8) this.frames.delete(this.frames.keys().next().value as number);
    }
    return c;
  }

  picture(): Canvas {
    if (!this.image) {
      this.image = makeCanvas(IMAGE_SIZE.w, IMAGE_SIZE.h);
      (this.image.getContext('2d') as CanvasRenderingContext2D).putImageData(basePixels(IMAGE_SIZE.w, IMAGE_SIZE.h, 7), 0, 0);
    }
    return this.image;
  }

  /** The compositor's resolver for a bench document. */
  resolver(doc: ProjectDoc, motion = new MotionRenderer()): Resolver {
    const kinds = new Map(doc.sources.map((s) => [s.id, s.kind === 'library' ? s.asset : '']));
    return {
      motion,
      image: (id) => (kinds.get(id) === SYNTHETIC_IMAGE ? (this.picture() as CanvasImageSource) : null),
      videoFrame: (id, at) => (kinds.get(id) === SYNTHETIC_VIDEO ? (this.videoAt(at) as CanvasImageSource) : null),
    };
  }
}

/** A project's canvas size with its short side at `short`, in even pixels (export.ts outputSize). */
export function sizeAt(doc: ProjectDoc, short: number): { w: number; h: number; scale: number } {
  const { w, h } = canvasOf(doc);
  const k = short / Math.min(w, h);
  const W = Math.round((w * k) / 2) * 2;
  return { w: W, h: Math.round((h * k) / 2) * 2, scale: W / w };
}

// --- what the coders offer ----------------------------------------------------------------------------

async function encodes(codec: string, w: number, h: number, hw: Hw): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined') return false;
  try {
    return (await VideoEncoder.isConfigSupported({ codec, width: w, height: h, bitrate: bitrate(w, h), framerate: FPS, hardwareAcceleration: hw })).supported === true;
  } catch {
    return false;
  }
}

async function decodes(codec: string, w: number, h: number, hw: Hw): Promise<boolean> {
  if (typeof VideoDecoder === 'undefined') return false;
  try {
    return (await VideoDecoder.isConfigSupported({ codec, codedWidth: w, codedHeight: h, hardwareAcceleration: hw })).supported === true;
  } catch {
    return false;
  }
}

export async function supportFacts(): Promise<ProfileNumbers['support']> {
  const any = async (codec: string, w: number, h: number, check: typeof encodes) => (await check(codec, w, h, 'prefer-hardware')) || (await check(codec, w, h, 'prefer-software'));
  return {
    hevcEncode: await any(CODECS.hevc, 1920, 1080, encodes),
    av1Encode: await any(CODECS.av1, 1920, 1080, encodes),
    tenBitEncode: (await any(CODECS.hevc10, 1920, 1080, encodes)) || (await any(CODECS.av1_10, 1920, 1080, encodes)),
    hevcDecode: await any(CODECS.hevc, 3840, 2160, decodes),
    av1Decode: await any(CODECS.av1, 3840, 2160, decodes),
  };
}

// --- timed work -------------------------------------------------------------------------------------

type Chunk = { type: EncodedVideoChunkType; timestamp: number; data: Uint8Array };

/**
 * Frames a second of `frames` frames drawn from the 4K source into a w x h canvas and encoded; null when that
 * encoder is not offered or fails. With `keep`, the encoded stream is returned too (for decoding).
 */
async function encodeRate(o: { w: number; h: number; frames: number; hw: Hw; src: SyntheticSources; keep?: boolean }): Promise<{ fps: number; chunks: Chunk[]; config: VideoDecoderConfig | null } | null> {
  if (!(await encodes(CODECS.h264, o.w, o.h, o.hw))) return null;
  const c = makeCanvas(o.w, o.h);
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const chunks: Chunk[] = [];
  let config: VideoDecoderConfig | null = null;
  let failed = false;
  const enc = new VideoEncoder({
    output: (chunk, meta) => {
      if (meta?.decoderConfig) config = meta.decoderConfig;
      if (o.keep) {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        chunks.push({ type: chunk.type, timestamp: chunk.timestamp, data });
      }
    },
    error: () => {
      failed = true;
    },
  });
  try {
    enc.configure({ codec: CODECS.h264, width: o.w, height: o.h, bitrate: bitrate(o.w, o.h), framerate: FPS, hardwareAcceleration: o.hw });
    const t0 = performance.now();
    for (let n = 0; n < o.frames && !failed; n++) {
      ctx.drawImage(o.src.videoAt(frameStart(n, FPS)) as CanvasImageSource, 0, 0, o.w, o.h);
      const f = new VideoFrame(c, { timestamp: frameStart(n, FPS), duration: Math.round(US / FPS) });
      while (enc.encodeQueueSize > 6) await sleep(0);
      enc.encode(f, { keyFrame: n % 60 === 0 });
      f.close();
    }
    await enc.flush();
    const ms = performance.now() - t0;
    return failed ? null : { fps: (o.frames / ms) * 1000, chunks, config };
  } catch {
    return null;
  } finally {
    if (enc.state !== 'closed') enc.close();
  }
}

async function decodeRate(chunks: Chunk[], config: VideoDecoderConfig, hw: Hw): Promise<number | null> {
  if (!(await decodes(config.codec, config.codedWidth ?? VIDEO_SIZE.w, config.codedHeight ?? VIDEO_SIZE.h, hw))) return null;
  let n = 0;
  let failed = false;
  const dec = new VideoDecoder({
    output: (f) => {
      n++;
      f.close();
    },
    error: () => {
      failed = true;
    },
  });
  try {
    dec.configure({ ...config, hardwareAcceleration: hw });
    const t0 = performance.now();
    // the stream six times over, so a fast decoder is timed long enough to be steady; it starts on a key frame
    for (let pass = 0; pass < 6; pass++) {
      for (const c of chunks) {
        while (dec.decodeQueueSize > 8) await sleep(0);
        dec.decode(new EncodedVideoChunk(c));
      }
    }
    await dec.flush();
    const ms = performance.now() - t0;
    return failed || !n ? null : (n / ms) * 1000;
  } catch {
    return null;
  } finally {
    if (dec.state !== 'closed') dec.close();
  }
}

/**
 * Frames a second of k export lanes at once, added up: each lane draws its own stretch of the effects document
 * at 1080p on its own canvas and encodes it with its own encoder, as P-06's lanes would. Drawing is part of a
 * lane, so a machine that draws on its processor gains less from more lanes.
 */
async function laneRate(k: number, frames: number, doc: ProjectDoc, src: SyntheticSources): Promise<number | null> {
  const { w, h, scale } = sizeAt(doc, 1080);
  if (!(await encodes(CODECS.h264, w, h, 'no-preference'))) return null;
  let failed = false;
  const lanes: { ctx: CanvasRenderingContext2D; canvas: Canvas; enc: VideoEncoder; res: Resolver }[] = [];
  try {
    for (let j = 0; j < k; j++) {
      const canvas = makeCanvas(w, h);
      const enc = new VideoEncoder({ output: () => undefined, error: () => (failed = true) });
      enc.configure({ codec: CODECS.h264, width: w, height: h, bitrate: 10e6, framerate: FPS });
      lanes.push({ ctx: canvas.getContext('2d') as CanvasRenderingContext2D, canvas, enc, res: src.resolver(doc) });
    }
    const t0 = performance.now();
    for (let n = 0; n < frames && !failed; n++) {
      for (let j = 0; j < k; j++) {
        const lane = lanes[j];
        // each lane at its own place in the document
        const t = (frameStart(n, FPS) + j * Math.round(US / k)) % (4 * US);
        composeFrame(lane.ctx, doc, t, lane.res, { scale });
        const f = new VideoFrame(lane.canvas, { timestamp: frameStart(n, FPS), duration: Math.round(US / FPS) });
        while (lane.enc.encodeQueueSize > 6) await sleep(0);
        lane.enc.encode(f, { keyFrame: n % 60 === 0 });
        f.close();
      }
    }
    await Promise.all(lanes.map((l) => l.enc.flush()));
    const ms = performance.now() - t0;
    return failed ? null : ((frames * k) / ms) * 1000;
  } catch {
    return null;
  } finally {
    for (const l of lanes) if (l.enc.state !== 'closed') l.enc.close();
  }
}

/** Milliseconds per 1080p frame of a document, the chip's work included (a one-pixel read waits for it). */
async function composeMs(doc: ProjectDoc, frames: number, src: SyntheticSources): Promise<number> {
  const { w, h, scale } = sizeAt(doc, 1080);
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: false }) as CanvasRenderingContext2D;
  const res = src.resolver(doc);
  const end = frames;
  const t0 = performance.now();
  for (let n = 0; n < end; n++) {
    composeFrame(ctx, doc, frameStart(n, FPS) % (4 * US), res, { scale });
    ctx.getImageData(0, 0, 1, 1);
  }
  return (performance.now() - t0) / end;
}

// --- the measurement --------------------------------------------------------------------------------

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
/** Coefficient of variation, percent. */
const spreadOf = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1));
  return mean > 0 ? (sd / mean) * 100 : 0;
};
const round = (v: number) => Math.round(v * 100) / 100;

/**
 * The figures something decides on (scale.ts and «تلقائي»): export lanes, 4K decoding and drawing the effects
 * document. The profile's spread is theirs. The others are shown, not used: encoding on the processor slows as a
 * laptop warms (measured on 2026-11-03: 64.7, 43.0 and 28.8 frames a second in three runs), and a two-millisecond
 * drawing is too short to time steadily.
 */
export const DECIDING = Object.freeze(['lane1', 'lane2', 'lane3', 'd2160hw', 'd2160sw', 'effects']);

function webglRenderer(): string {
  try {
    const gl = (typeof document === 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas')).getContext('webgl') as WebGLRenderingContext | null;
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)).slice(0, 160) : '';
  } catch {
    return '';
  }
}

export type MeasureOptions = {
  runs?: number;
  onProgress?: (f: number) => void;
  signal?: AbortSignal;
  /** Multiplies every frame count (a check may ask for less, for speed). */
  scale?: number;
  /** Every timed value of every figure, for a check that wants to see the spread; never kept. */
  onSeries?: (series: Record<string, number[]>) => void;
};

/**
 * Measures this computer. An untimed warm-up first starts each coder and draws each document once, so the
 * first timed run does not pay for starting them. Rejects with an AbortError when the signal aborts.
 */
export async function measureDevice(o: MeasureOptions = {}): Promise<ProfileNumbers> {
  const runs = Math.max(1, Math.min(5, Math.round(o.runs ?? 3)));
  const k = o.scale ?? 1;
  const frames = (n: number) => Math.max(6, Math.round(n * k));
  const started = performance.now();
  const docs = { plain: BENCH_DOCS.plain(), text: BENCH_DOCS.text(), effects: BENCH_DOCS.effects() };
  await loadFonts([...usedFonts(docs.text), ...usedFonts(docs.effects)]);
  const src = new SyntheticSources(8);
  for (let n = 0; n < 8; n++) src.videoAt(frameStart(n, FPS));
  const steps = runs * 10 + 2;
  let step = 0;
  const tick = () => {
    if (o.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    o.onProgress?.(Math.min(1, ++step / steps));
  };
  const support = await supportFacts();
  tick();
  // warm-up, untimed
  await encodeRate({ w: 1920, h: 1080, frames: 10, hw: 'prefer-hardware', src });
  await encodeRate({ w: 1920, h: 1080, frames: 6, hw: 'prefer-software', src });
  await encodeRate({ w: 3840, h: 2160, frames: 6, hw: 'prefer-hardware', src });
  for (const d of Object.values(docs)) await composeMs(d, 6, src);
  await laneRate(2, 6, docs.effects, src);
  tick();

  const series: Record<string, number[]> = {};
  const add = (name: string, v: number | null) => {
    if (v !== null && Number.isFinite(v)) (series[name] ??= []).push(v);
  };
  let stream: { chunks: Chunk[]; config: VideoDecoderConfig } | null = null;
  for (let r = 0; r < runs; r++) {
    add('e1080hw', (await encodeRate({ w: 1920, h: 1080, frames: frames(90), hw: 'prefer-hardware', src }))?.fps ?? null);
    tick();
    add('e1080sw', (await encodeRate({ w: 1920, h: 1080, frames: frames(45), hw: 'prefer-software', src }))?.fps ?? null);
    tick();
    const k4 = await encodeRate({ w: 3840, h: 2160, frames: frames(30), hw: 'prefer-hardware', src, keep: !stream });
    add('e2160hw', k4?.fps ?? null);
    if (k4?.config && k4.chunks.length && !stream) stream = { chunks: k4.chunks, config: k4.config };
    tick();
    const k4s = await encodeRate({ w: 3840, h: 2160, frames: frames(12), hw: 'prefer-software', src, keep: !stream });
    add('e2160sw', k4s?.fps ?? null);
    if (k4s?.config && k4s.chunks.length && !stream) stream = { chunks: k4s.chunks, config: k4s.config };
    tick();
    if (stream) {
      add('d2160hw', await decodeRate(stream.chunks, stream.config, 'prefer-hardware'));
      add('d2160sw', await decodeRate(stream.chunks, stream.config, 'prefer-software'));
    }
    tick();
    // one lane is the reference export: the effects document drawn and encoded as export.ts does
    for (const lanes of [1, 2, 3]) {
      add(`lane${lanes}`, await laneRate(lanes, frames(lanes === 1 ? 90 : 60), docs.effects, src));
      tick();
    }
    add('plain', await composeMs(docs.plain, frames(120), src));
    add('text', await composeMs(docs.text, frames(120), src));
    add('effects', await composeMs(docs.effects, frames(120), src));
    tick();
  }
  o.onSeries?.(structuredClone(series));
  const m = (name: string): number | null => (series[name]?.length ? round(median(series[name])) : null);
  const spread = Math.max(0, ...DECIDING.map((name) => series[name]).filter((xs): xs is number[] => !!xs && xs.length > 1).map(spreadOf));
  const lanes = [m('lane1'), m('lane2'), m('lane3')].filter((x): x is number => x !== null);
  const rate = (hw: string, sw: string): ProfileRate => ({ hw: m(hw), sw: m(sw) });
  tick();
  return {
    v: 1,
    encode: { h264_1080: rate('e1080hw', 'e1080sw'), h264_2160: rate('e2160hw', 'e2160sw') },
    decode: { h264_2160: rate('d2160hw', 'd2160sw') },
    lanes: lanes.length ? lanes : [0],
    compose: { plain: m('plain') ?? 0, text: m('text') ?? 0, effects: m('effects') ?? 0 },
    exportFps: m('lane1') ?? 0,
    support,
    runs,
    spread: round(spread),
    seconds: round((performance.now() - started) / 1000),
    renderer: webglRenderer(),
  };
}

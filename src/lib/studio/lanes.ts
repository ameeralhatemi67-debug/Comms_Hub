// Export lanes (Desktop_Power_Ideas.md P-06, with the first rungs of P-35; MVP_draft.md 62.10). The project's frames are
// cut into contiguous segments on the single-lane export's key frames (segmentsOf), and each lane decodes, draws and
// encodes its own segment at once with the others: its own decoders (a CanvasSink per source, as the media pool's),
// its own drawing workers or canvas, its own encoder, made by Mediabunny from the same settings as one lane's
// (VideoSampleSource into an output that keeps nothing), so every lane's frames and settings are the single lane's.
// The packets join into the file's one video track in order: the first segment's as they come, the others kept in the
// browser's private storage until their turn (a long 4K export would not fit in memory). The join is guarded: every
// lane's decoder description (codec string and parameter sets) must be the first lane's, or every lane stops, the
// file of this attempt is thrown away with nothing of the other lanes in it, and the export runs again with one lane. A segment after the first whose lane fails is run again by the lanes left;
// a failure of the first segment, or of the last lane, ends this way and the export runs again with fewer lanes.
// A lane after the first starts encoding one key-frame group (two seconds) before its segment and drops those packets:
// a processor's encoder controls its rate from what it has seen, and started cold at the segment it made the
// segment's first frame about 1.5 dB worse than one lane did (measured 2026-11-04, Edge with no graphics chip).
// The sound is mixed once, on the page, and kept one window ahead of the pictures, as with one lane. Browser only.
import type { EncodedPacket, EncodedVideoPacketSource, Input, VideoEncodingConfig, WrappedCanvas } from 'mediabunny';
import { US, canvasOf, type Clip, type Micros, type ProjectDoc } from './schema.ts';
import { sourceOf, visibleAt } from './timeline.ts';
import { composeFrame, type Resolver } from './compose.ts';
import { MotionRenderer } from './motion-adapter.ts';
import { frameStart, frameUs } from './time.ts';
import { isHold, sourceTime } from './speed.ts';
import { YuvPipe } from './yuv-pipe.ts';
import { Drawers } from './drawers.ts';
import type { MediaPool } from './media.ts';
import type { Segment } from './segments.ts';

type Mb = typeof import('mediabunny');
type Meta = EncodedVideoChunkMetadata | undefined;

export class LaneError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export type LaneContext = {
  mb: Mb;
  doc: ProjectDoc;
  pool: MediaPool;
  w: number;
  h: number;
  fps: number;
  via: 'canvas' | 'yuv';
  /** One lane's encoder settings, fresh for each lane (onEncodedPacket is the lane's). */
  encoding: () => VideoEncodingConfig;
  /** Names the transfer BT.709 in a canvas way's description (export.ts asBt709). */
  colour: (meta: Meta) => void;
  watermark: string | null;
  drawers: number;
  yuvWorkers: number;
  makeDrawer?: () => Worker;
  signal?: AbortSignal;
  /** The file's video track. */
  video: EncodedVideoPacketSource;
  /** Called before each video packet goes into the file, with its time: the sound is added up to there. */
  before: (seconds: number) => Promise<void>;
  /** Frames done, of every lane together. */
  progress: (done: number) => void;
  /**
   * For the proofs only (qa/studio-lanes.cjs): the lane of one segment given another H.264 profile (its decoder
   * description differs), or a lane failing once at a frame.
   */
  faults?: { configOf?: number; failAt?: number; fired?: boolean };
  /** For the proofs only: each composed frame n, before it is encoded (export.ts `inspect`). */
  inspect?: (n: number, frame: VideoFrame) => Promise<void>;
};

/** A segment's packets kept in the browser's private storage until their turn. */
class Spill {
  private chain: Promise<unknown> = Promise.resolve();
  private index: { at: number; size: number; type: 'key' | 'delta'; timestamp: number; duration: number }[] = [];
  private size = 0;
  private readonly dir: FileSystemDirectoryHandle;
  private readonly name: string;
  private readonly handle: FileSystemFileHandle;
  private readonly out: FileSystemWritableFileStream;

  private constructor(dir: FileSystemDirectoryHandle, name: string, handle: FileSystemFileHandle, out: FileSystemWritableFileStream) {
    this.dir = dir;
    this.name = name;
    this.handle = handle;
    this.out = out;
  }

  static async open(name: string): Promise<Spill> {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('studio-lanes', { create: true });
    const handle = await dir.getFileHandle(name, { create: true });
    return new Spill(dir, name, handle, await handle.createWritable());
  }

  push(p: EncodedPacket) {
    this.index.push({ at: this.size, size: p.data.byteLength, type: p.type, timestamp: p.timestamp, duration: p.duration });
    this.size += p.data.byteLength;
    const data = p.data;
    this.chain = this.chain.then(() => this.out.write(data as Uint8Array<ArrayBuffer>));
  }

  async close() {
    await this.chain;
    await this.out.close();
  }

  /** The packets back, in order, read a few megabytes at a time. */
  async *replay(mb: Mb): AsyncGenerator<EncodedPacket> {
    const file = await this.handle.getFile();
    let from = 0;
    let buf = new Uint8Array(0);
    for (const e of this.index) {
      if (e.at + e.size > from + buf.length) {
        from = e.at;
        buf = new Uint8Array(await file.slice(from, Math.min(file.size, from + Math.max(e.size, 8 << 20))).arrayBuffer());
      }
      yield new mb.EncodedPacket(buf.slice(e.at - from, e.at - from + e.size), e.type, e.timestamp, e.duration);
    }
  }

  async discard() {
    await this.chain.catch(() => undefined);
    await this.out.abort?.().catch(() => undefined);
    await this.dir.removeEntry(this.name).catch(() => undefined);
  }
}

const same = (a: Meta, b: Meta) => {
  const x = a?.decoderConfig;
  const y = b?.decoderConfig;
  if (!x || !y || x.codec !== y.codec || JSON.stringify(x.colorSpace ?? null) !== JSON.stringify(y.colorSpace ?? null)) return false;
  const bytes = (d: AllowSharedBufferSource | undefined) => (d ? new Uint8Array(ArrayBuffer.isView(d) ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : d) : new Uint8Array(0));
  const p = bytes(x.description);
  const q = bytes(y.description);
  return p.length === q.length && p.every((v, i) => v === q[i]);
};

/**
 * The frames of a project for one lane, decoded by the lane's own sinks (the media pool's settings), one forward
 * pass per clip, stills read once, reversed clips frame by frame, as export.ts does for one lane.
 */
function laneFrames(mb: Mb, pool: MediaPool) {
  type Pass = { gen: AsyncGenerator<WrappedCanvas, void, unknown>; cur: WrappedCanvas | null; next: WrappedCanvas | null };
  const passes = new Map<string, Pass>();
  const stills = new Map<string, ImageBitmap | null>();
  const tracks = new Map<string, Promise<Awaited<ReturnType<Input['getPrimaryVideoTrack']>>>>();
  const track = (id: string) => {
    let p = tracks.get(id);
    if (!p) tracks.set(id, (p = pool.input(id)?.getPrimaryVideoTrack() ?? Promise.resolve(null)));
    return p;
  };
  return {
    async frame(clip: Clip, t: Micros): Promise<CanvasImageSource | null> {
      if (isHold(clip)) {
        if (!stills.has(clip.id)) {
          const f = await pool.frameAt(clip.source!, sourceTime(clip, t));
          stills.set(clip.id, f ? await createImageBitmap(f as ImageBitmapSource) : null);
        }
        return stills.get(clip.id) ?? null;
      }
      if (clip.reverse) return pool.frameAt(clip.source!, sourceTime(clip, t));
      const at = sourceTime(clip, t) / US;
      let f = passes.get(clip.id);
      if (!f) {
        const v = await track(clip.source!);
        if (!v) return null;
        // from where this lane first shows the clip; the pool's pass sink also keeps three canvases
        const sink = new mb.CanvasSink(v, { poolSize: 3 });
        const from = Math.max(sourceTime(clip, clip.start), sourceTime(clip, t)) / US;
        const to = sourceTime(clip, clip.start + clip.length) / US;
        const gen = sink.canvases(from, to + 0.5);
        const first = await gen.next();
        const second = first.done ? { done: true as const, value: undefined } : await gen.next();
        f = { gen, cur: first.done ? null : first.value, next: second.done ? null : second.value };
        passes.set(clip.id, f);
      }
      while (f.next && f.next.timestamp <= at + 1e-6) {
        f.cur = f.next;
        const r = await f.gen.next();
        f.next = r.done ? null : r.value;
      }
      return (f.cur?.canvas as CanvasImageSource) ?? null;
    },
    async close() {
      for (const f of passes.values()) await f.gen.return(undefined).catch(() => undefined);
      for (const s of stills.values()) s?.close();
    },
  };
}

/** One segment through one lane: its packets to `emit`, in order. Throws LaneError on a lane's failure. */
/** Times a later segment is run again after its lane failed, before the attempt ends and the export takes fewer lanes. */
const RETRIES = 2;

/** Frames a lane encodes before its segment and drops, to warm its encoder's rate control: one key-frame group. */
export const warmFrames = (fps: number) => Math.round(fps * 2);

async function runSegment(c: LaneContext, seg: Segment, lane: number, emit: (p: EncodedPacket, meta: Meta) => void, done: () => void) {
  const { mb, doc, pool, w, h, fps } = c;
  let failure: string | null = null;
  const settings = c.encoding();
  if (c.faults?.configOf === lane) settings.fullCodecString = 'avc1.4d0028';
  const out = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: false }), target: new mb.NullTarget() });
  let matrix: string | null = null;
  // the segment's own frames; before them, the warm-up, whose packets are dropped (its description is kept for the join)
  const first = seg.from > 0 ? Math.max(0, seg.from - warmFrames(fps)) : 0;
  const start = frameStart(seg.from, fps);
  let described: Meta;
  const source = new mb.VideoSampleSource({
    ...settings,
    onEncodedPacket: (p, meta) => {
      matrix ??= meta?.decoderConfig?.colorSpace?.matrix ?? null;
      if (c.via === 'canvas') c.colour(meta);
      if (meta?.decoderConfig && !described) described = meta;
      if (p.timestamp < start / US - 0.5 / fps) return;
      emit(p, meta?.decoderConfig ? meta : described);
      described = undefined;
    },
  });
  out.addVideoTrack(source, { frameRate: fps });
  const pipe = c.via === 'yuv' ? YuvPipe.open(w, h, Math.max(1, c.yuvWorkers)) : null;
  if (c.via === 'yuv' && !pipe) throw new LaneError('YUV_WORKER');
  const drawers = c.drawers > 0 ? await Drawers.open(doc, pool, { w, h, watermark: c.watermark, count: c.drawers, make: c.makeDrawer }) : null;
  if (c.drawers > 0 && !drawers) {
    pipe?.close();
    throw new LaneError('DRAW_WORKER');
  }
  const frames = laneFrames(mb, pool);
  const canvas = drawers ? null : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas?.getContext('2d') ?? null;
  const motion = new MotionRenderer();
  const scale = w / canvasOf(doc).w;
  const drawn: { n: number; t: Micros; frame: Promise<VideoFrame> }[] = [];
  const converted: { t: Micros; frame: Promise<VideoFrame> }[] = [];
  const take = async (job: { frame: Promise<VideoFrame> }, code: string) => {
    try {
      return await job.frame;
    } catch {
      throw new LaneError(code);
    }
  };
  const add = async (frame: VideoFrame, t: Micros) => {
    const s = new mb.VideoSample(frame, { timestamp: t / US, duration: frameUs(fps) / US });
    try {
      await source.add(s);
    } finally {
      s.close();
    }
    if (c.via === 'canvas' && matrix && matrix !== 'bt709') throw new LaneError('COLOUR');
    if (t >= start) done();
  };
  const nextDrawn = async () => {
    const j = drawn.shift()!;
    const frame = await take(j, 'DRAW_WORKER');
    if (c.inspect && j.n >= seg.from) await c.inspect(j.n, frame.clone());
    await encode(j.t, frame);
  };
  const encode = async (t: Micros, frame: VideoFrame) => {
    if (!pipe) return add(frame, t);
    converted.push({ t, frame: pipe.convert(frame) });
    while (converted.length >= pipe.depth) {
      const j = converted.shift()!;
      await add(await take(j, 'YUV_WORKER'), j.t);
    }
  };
  try {
    await out.start();
    for (let n = first; n < seg.to; n++) {
      if (c.signal?.aborted) throw new LaneError('ABORTED');
      if (c.faults && c.faults.failAt === n && !c.faults.fired) {
        c.faults.fired = true;
        throw new LaneError('ENCODER');
      }
      const t = frameStart(n, fps);
      const got = new Map<string, CanvasImageSource | null>();
      for (const { clip } of visibleAt(doc, t)) if (sourceOf(doc, clip.source)?.media === 'video') got.set(clip.id, await frames.frame(clip, t));
      if (drawers) {
        const sent: [string, ImageBitmap | null][] = [];
        for (const [cid, src] of got) sent.push([cid, src ? await createImageBitmap(src as ImageBitmapSource) : null]);
        drawn.push({ n, t, frame: drawers.draw(t, frameUs(fps), sent) });
        while (drawn.length >= drawers.depth) await nextDrawn();
      } else {
        const res: Resolver = { motion, image: (id) => pool.image(id), videoFrame: (_s, _a, cid) => (cid ? (got.get(cid) ?? null) : null) };
        composeFrame(ctx as unknown as CanvasRenderingContext2D, doc, t, res, { scale, watermark: c.watermark });
        const frame = new VideoFrame(canvas!, { timestamp: t, duration: frameUs(fps) });
        if (c.inspect && n >= seg.from) await c.inspect(n, frame.clone());
        await encode(t, frame);
      }
    }
    while (drawn.length) await nextDrawn();
    while (converted.length) {
      const j = converted.shift()!;
      await add(await take(j, 'YUV_WORKER'), j.t);
    }
    await out.finalize();
  } catch (e) {
    failure = e instanceof LaneError ? e.code : 'ENCODER';
    await out.cancel().catch(() => undefined);
    throw e instanceof LaneError ? e : new LaneError('ENCODER');
  } finally {
    pipe?.close();
    drawers?.close();
    for (const j of [...drawn, ...converted]) void j.frame.then((f) => f.close(), () => undefined);
    await frames.close();
    void failure;
  }
}

/**
 * The project's video through `segments.length` lanes into `c.video`. Returns the lane failures met on the way (each a
 * segment run again by the lanes left). Throws LaneError where the export must run again with fewer lanes: a lane whose
 * decoder description is not the first segment's ('LANES'; every lane stops at once, and the export's file is thrown
 * away before anything of that lane reaches it), the first segment's lane failing, or no lane left. Every lane has
 * stopped before this returns or throws.
 */
export async function encodeLanes(c: LaneContext, segments: Segment[]): Promise<string[]> {
  const steps: string[] = [];
  const k = segments.length;
  const first = new Array<Meta>(k).fill(undefined);
  let mismatch = false;
  let live = Promise.resolve();
  let done = 0;
  const spills = new Map<number, Spill>();
  const tick = () => c.progress(++done);
  // stops every lane: the person cancelled, a description differs, or a lane failed in a way that ends this attempt
  const stop = new AbortController();
  const onCancel = () => stop.abort();
  c.signal?.addEventListener('abort', onCancel);
  const lane: LaneContext = { ...c, signal: stop.signal };

  // the first segment goes into the file as it comes; the others wait in their spills, checked against it
  const emitter = (seg: number) => (p: EncodedPacket, meta: Meta) => {
    if (!first[seg] && meta?.decoderConfig) {
      first[seg] = meta;
      const ref = first[0];
      if ((seg === 0 && first.some((m) => m && !same(m, meta))) || (seg !== 0 && ref && !same(meta, ref))) {
        mismatch = true;
        stop.abort();
      }
    }
    if (seg === 0) {
      live = live.then(async () => {
        await c.before(p.timestamp);
        await c.video.add(p, meta);
      });
    } else spills.get(seg)!.push(p);
  };

  const queue = segments.map((_, i) => i);
  const tries = new Map<number, number>();
  let active = 0;
  let fatal: unknown = null;
  const runner = async () => {
    active++;
    try {
      while (queue.length && !stop.signal.aborted) {
        const seg = queue.shift()!;
        if (seg !== 0) spills.set(seg, await Spill.open(`lane-${seg}`));
        try {
          await runSegment(lane, segments[seg], seg, emitter(seg), tick);
          if (seg !== 0) await spills.get(seg)!.close();
        } catch (e) {
          const code = e instanceof LaneError ? e.code : 'ENCODER';
          if (stop.signal.aborted) return;
          if (seg === 0 || code === 'COLOUR' || (tries.get(seg) ?? 0) >= RETRIES) {
            fatal ??= e instanceof LaneError ? e : new LaneError(code);
            stop.abort();
            return;
          }
          // a later segment's lane failed: its packets are dropped and the segment waits for a lane; this lane stops,
          // one lane fewer, unless it is the last one running, which then takes it itself
          tries.set(seg, (tries.get(seg) ?? 0) + 1);
          await spills.get(seg)?.discard();
          spills.delete(seg);
          first[seg] = undefined;
          steps.push(code);
          queue.push(seg);
          if (active > 1) return;
        }
      }
    } finally {
      active--;
    }
  };
  try {
    await Promise.allSettled(Array.from({ length: k }, () => runner()));
    if (c.signal?.aborted) throw new LaneError('ABORTED');
    if (mismatch || first.some((m, i) => i > 0 && !same(m, first[0]))) throw new LaneError('LANES');
    if (fatal) throw fatal instanceof LaneError ? fatal : new LaneError('ENCODER');
    if (queue.length) throw new LaneError('ENCODER');
    await live;
    for (let seg = 1; seg < k; seg++) {
      for await (const p of spills.get(seg)!.replay(c.mb)) {
        await c.before(p.timestamp);
        await c.video.add(p);
      }
    }
  } finally {
    c.signal?.removeEventListener('abort', onCancel);
    await live.catch(() => undefined);
    for (const s of spills.values()) await s.discard();
  }
  return steps;
}

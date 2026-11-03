// A project's media in the browser (MVP_draft.md 62): every source made ready from the device cache
// (library versions are copied once; device files are read from private storage), then:
//   - pictures as ImageBitmaps;
//   - video frames decoded by Mediabunny (the same decoder the export uses), exact when paused;
//   - one media element per playing clip for smooth playback with its sound.
// The state of each source (copying with progress, ready, missing on this device, refused, failed) is
// kept for the interface.
// Inside the desktop application (D5, MVP_draft.md 63.4) a video source may also have a light copy, which
// the preview reads in its place (paused frames and playback), while the export and stills read the
// original; and a source the browser cannot decode may be converted into an editable copy, which is then
// read for everything. A light copy's frames are matched to the original's by their first timestamps, so a
// cut lands on the same frame in both.
// When the plan gives the paused preview memory (D10, «ذاكرة الإطارات للتنقل», scrub.ts), the paused frames come from a
// decoder of their own that keeps the frames it passes, at the size the preview draws them; the export's decoders
// (sink for frameAt, passSink for frames) are never that one. With no memory given, paused frames are decoded as
// they always were. Browser only.
import type { CanvasSink, EncodedPacketSink, Input, VideoSample, VideoSampleSink, WrappedCanvas } from 'mediabunny';
import { US, type Micros, type ProjectDoc, type Source } from './schema.ts';
import { DeviceCache } from './cache.ts';
import { divisorFor, EPS, FrameStore, THUMB_PART, thumbShare, type Kept } from './scrub.ts';
import { PEAKS_PER_SECOND, peaksKey, reduceInto } from './peaks.ts';
import type { NativeCopies, NativeMediaRef } from '../native/index.ts';

export type SourceState =
  | { kind: 'loading'; done: number; total: number }
  | { kind: 'ready' }
  | { kind: 'missing'; why: 'device' | 'denied' | 'gone' }
  | { kind: 'error'; message: string; convertible?: boolean };

/** A light or converted copy of one source, as the interface shows it (desktop application only). */
export type CopyState = { kind: 'none' } | { kind: 'making'; done: number; total: number } | { kind: 'ready'; height?: number } | { kind: 'failed'; why: string };
export type MediaTools = { heavy: boolean; audioUnsupported: boolean; convertible: boolean; converted: boolean; proxy: CopyState; convert: CopyState };

const UNDECODABLE = 'هذا المتصفح لا يفك ترميز هذا الفيديو.';

export const contentUrl = (asset: string, version: number) => `/api/media/${asset}/content?v=${version}`;

type Canvas = HTMLCanvasElement | OffscreenCanvas;
/** Seconds of frames kept behind a moment that had to be decoded (a step back is then drawn at once). */
export const SCRUB_BEHIND = 0.5;
/** Seconds read ahead of where the person is, while nothing plays, at most a quarter of the frames the memory holds. */
export const SCRUB_AHEAD = 2;

/** The paused preview's own decoder (D10): the light copy's when there is one, its key frames, and the stretch it is reading. */
type Scrub = {
  sink: VideoSampleSink;
  keys: EncodedPacketSink;
  /** How far the frame source's times are from the original's (a light copy, media.ts elementOffset). */
  off: number;
  w: number;
  h: number;
  run: Run | null;
  /** The pass filling the small frames, and what it has filled (their share and the stretch), once filled. */
  fill: Run | null;
  filled: string | null;
};
/** One forward pass of the decoder: where it is (the last frame read, in its own times) and the frame before. */
type Run = { it: AsyncGenerator<VideoSample, void, unknown>; d: number; pos: number; prev: Kept<Canvas> | null; done: boolean; frame: number; kept: number };

type Loaded = {
  source: Source;
  file: File | null;
  url: string;
  image?: ImageBitmap;
  input?: Input;
  /** The paused preview's decoder: no pooled canvases, one request at a time. */
  sink?: CanvasSink;
  /** The export's decoder: one forward pass with a small pool of canvases. */
  passSink?: CanvasSink;
  /** Paused preview: the frame last decoded, and the newest time asked for. */
  last?: { at: Micros; canvas: HTMLCanvasElement | OffscreenCanvas; from: number; to: number };
  pending?: Micros | null;
  decoding?: boolean;
  w?: number;
  h?: number;
  duration?: Micros;
  hasVideo?: boolean;
  hasAudio?: boolean;
  /** The light copy the preview reads instead (D5): its decoder, its address, and how far its times are from the original's. */
  preview?: { input: Input; sink: CanvasSink; url: string; name: string; height: number; offset: number };
  /** The editable copy read for everything, when the browser cannot decode the original (D5). */
  converted?: string;
  audioUnsupported?: boolean;
  /** D10: the paused preview's own decoder, the frame on screen, the newest time asked (seconds) and where the person is. */
  scrub?: Promise<Scrub>;
  shown?: Kept<Canvas> | null;
  /** The frame on screen is a small one, shown while the sharp one is read. */
  shownSmall?: boolean;
  want?: number | null;
  anchor?: number;
  scrubbing?: boolean;
  /** The kept frames failed for this source once: it is decoded as it always was from then on. */
  scrubFailed?: boolean;
  scrubReady?: Scrub;
};

/** What the application's tools know of a source: how it is named, its copies, and the work on them. */
type Tooling = { ref: NativeMediaRef; copies: NativeCopies | null; heavy: boolean; proxy: CopyState; convert: CopyState };

type Mb = typeof import('mediabunny');
let mbP: Promise<Mb> | null = null;
export const mediabunny = () => (mbP ??= import('mediabunny'));

/** What a picked file is: its kind, size and length (for a new source). */
export async function probeFile(file: Blob): Promise<{ media: 'video' | 'image' | 'audio'; w?: number; h?: number; duration?: Micros } | null> {
  const type = file.type;
  if (type.startsWith('image/')) {
    const bmp = await createImageBitmap(file);
    const r = { media: 'image' as const, w: bmp.width, h: bmp.height };
    bmp.close();
    return r;
  }
  if (type.startsWith('video/') || type.startsWith('audio/')) {
    const mb = await mediabunny();
    const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
    const v = await input.getPrimaryVideoTrack();
    const a = await input.getPrimaryAudioTrack();
    const duration = Math.round((await input.computeDuration()) * US);
    if (v) return { media: 'video', w: await v.getDisplayWidth(), h: await v.getDisplayHeight(), duration };
    if (a) return { media: 'audio', duration };
  }
  return null;
}

export class MediaPool {
  private loaded = new Map<string, Loaded>();
  private states = new Map<string, SourceState>();
  private elements = new Map<string, HTMLMediaElement>();
  private blobUrls = new Map<string, string>();
  private disposed = false;

  private readonly opts: { cache: DeviceCache | null; onChange: () => void; url?: (asset: string, version: number) => string };

  constructor(opts: { cache: DeviceCache | null; onChange: () => void; url?: (asset: string, version: number) => string }) {
    this.opts = opts;
  }

  state(id: string): SourceState | undefined {
    return this.states.get(id);
  }

  private set(id: string, s: SourceState) {
    this.states.set(id, s);
    if (!this.disposed) this.opts.onChange();
  }

  /** Makes every source of the document ready (once each). */
  ensure(doc: ProjectDoc) {
    for (const s of doc.sources) if (!this.states.has(s.id)) void this.load(s);
  }

  /** Keys of the library copies this project uses, and of its light and converted copies, so the sweep and «حذف» leave them. */
  inUse(doc: ProjectDoc): Set<string> {
    const keys = new Set(doc.sources.filter((s) => s.kind === 'library').map((s) => `asset-${(s as { asset: string }).asset}-v${(s as { version: number }).version}`));
    for (const s of doc.sources) {
      const l = this.loaded.get(s.id);
      if (l?.preview) keys.add(l.preview.name);
      if (l?.converted) keys.add(l.converted);
    }
    return keys;
  }

  private tooling = new Map<string, Tooling>();

  /** What the desktop application can do for a video source now, or null (a browser, a picture, a sound, a source not loaded). */
  tools(id: string): MediaTools | null {
    const t = this.tooling.get(id);
    if (!t) return null;
    const l = this.loaded.get(id);
    const st = this.states.get(id);
    return {
      heavy: t.heavy,
      audioUnsupported: !!l?.audioUnsupported,
      convertible: !l?.converted && (!!l?.audioUnsupported || (st?.kind === 'error' && !!st.convertible)),
      converted: !!l?.converted,
      proxy: l?.preview ? { kind: 'ready', height: l.preview.height } : t.proxy,
      convert: t.convert,
    };
  }

  private setTool(id: string, kind: 'proxy' | 'convert', s: CopyState) {
    const t = this.tooling.get(id);
    if (!t) return;
    t[kind] = s;
    if (!this.disposed) this.opts.onChange();
  }

  /** «إنشاء نسخة خفيفة للمعاينة»: the application makes it once, and the preview reads it from then on. */
  async makeProxy(id: string, height = 720): Promise<void> {
    const t = this.tooling.get(id);
    const cache = this.opts.cache;
    const l = this.loaded.get(id);
    if (!t || !cache || !l || l.preview || t.proxy.kind === 'making') return;
    const name = t.copies?.names.proxy[String(height)];
    if (!name) return;
    this.setTool(id, 'proxy', { kind: 'making', done: 0, total: 0 });
    try {
      const doc = { sources: [...this.loaded.values()].map((x) => x.source) } as ProjectDoc;
      const c = await cache.makeCopy(t.ref, name, { height, inUse: this.inUse(doc), onProgress: (done, total) => this.setTool(id, 'proxy', { kind: 'making', done, total }) });
      if (this.disposed) return;
      await this.openPreview(l, c.url, c.name, height);
      this.setTool(id, 'proxy', { kind: 'ready', height });
    } catch (e) {
      this.setTool(id, 'proxy', { kind: 'failed', why: (e as Error).message || 'failed' });
    }
  }

  /** An editable copy of a source the browser cannot decode; the source is then made ready again from it. */
  async convert(id: string): Promise<void> {
    const t = this.tooling.get(id);
    const cache = this.opts.cache;
    const s = this.loaded.get(id)?.source ?? this.sources.get(id);
    if (!t || !cache || !s || t.convert.kind === 'making' || !t.copies?.names.convert) return;
    this.setTool(id, 'convert', { kind: 'making', done: 0, total: 0 });
    try {
      const doc = { sources: [...this.sources.values()] } as ProjectDoc;
      await cache.makeCopy(t.ref, t.copies.names.convert, { inUse: this.inUse(doc), onProgress: (done, total) => this.setTool(id, 'convert', { kind: 'making', done, total }) });
      if (this.disposed) return;
      this.setTool(id, 'convert', { kind: 'ready' });
      this.forget(id);
      await this.load(s);
    } catch (e) {
      this.setTool(id, 'convert', { kind: 'failed', why: (e as Error).message || 'failed' });
    }
  }

  /** Stops a light or converted copy being made; nothing of it is kept. */
  async cancelCopy(id: string, kind: 'proxy' | 'convert'): Promise<void> {
    const t = this.tooling.get(id);
    const name = kind === 'proxy' ? t?.copies?.names.proxy['720'] : t?.copies?.names.convert;
    if (name && this.opts.cache) await this.opts.cache.cancelCopy(name);
  }

  /** How far a playing element's time is from the source's (a light copy that starts elsewhere than its original). */
  elementOffset(id: string, clipId?: string): number {
    const el = clipId ? this.elements.get(clipId) : null;
    if (el && el.dataset.copy === '0') return 0;
    return this.loaded.get(id)?.preview?.offset ?? 0;
  }

  /** Whether a source has a light copy the preview can play (D5). */
  hasCopy(id: string): boolean {
    return !!this.loaded.get(id)?.preview;
  }

  private sources = new Map<string, Source>();

  private forget(id: string) {
    const l = this.loaded.get(id);
    for (const [clipId, el] of this.elements) {
      if (el.dataset.source !== id) continue;
      el.pause();
      el.removeAttribute('src');
      el.load();
      this.elements.delete(clipId);
    }
    l?.image?.close();
    if (l) void this.resetScrub(l);
    this.loaded.delete(id);
  }

  private async openPreview(l: Loaded, url: string, name: string, height: number) {
    const mb = await mediabunny();
    const input = new mb.Input({ source: new mb.UrlSource(url), formats: mb.ALL_FORMATS });
    const v = await input.getPrimaryVideoTrack();
    if (!v || !(await v.canDecode())) throw new Error('decode');
    const original = await l.input?.getPrimaryVideoTrack();
    const offset = original ? (await original.getFirstTimestamp()) - (await v.getFirstTimestamp()) : 0;
    l.preview = { input, sink: new mb.CanvasSink(v), url, name, height, offset };
    l.last = undefined;
    // the kept frames were the original's; the light copy's are read from now on
    await this.resetScrub(l);
    // elements playing the original now play the light copy
    for (const [clipId, el] of this.elements) if (el.dataset.source === l.source.id) {
      el.pause();
      this.elements.delete(clipId);
    }
  }

  private async load(s: Source) {
    this.sources.set(s.id, s);
    this.set(s.id, { kind: 'loading', done: 0, total: 0 });
    try {
      let file: File | null = null;
      let url = '';
      const cache = this.opts.cache;
      if (s.kind === 'library') {
        const u = (this.opts.url ?? contentUrl)(s.asset, s.version);
        if (cache) {
          const place = await cache.libraryPlace(s.asset, s.version, u, {
            label: s.name,
            onProgress: (done, total) => this.set(s.id, { kind: 'loading', done, total }),
            fetcher: async (x, init) => {
              const r = await fetch(x, init);
              if (r.status === 403 || r.status === 401) throw Object.assign(new Error('DENIED'), { denied: true });
              if (r.status === 404) throw Object.assign(new Error('GONE'), { gone: true });
              return r;
            },
          });
          file = place.file ?? null;
          url = place.url ?? '';
        } else url = u;
      } else {
        // a File from the browser's storage, or, in the desktop application, the file where it is
        const place = cache ? await cache.localPlace(s.key) : null;
        if (!place) return this.set(s.id, { kind: 'missing', why: 'device' });
        file = place.file ?? null;
        url = place.url ?? '';
      }
      if (this.disposed) return;
      // In the desktop application: the source's light and converted copies, if it has any (D5).
      let tool: Tooling | null = null;
      const ref = s.media === 'video' && cache?.hasMedia ? cache.mediaRef(s) : null;
      if (ref && cache) {
        const copies = await cache.copies(ref);
        const before = this.tooling.get(s.id);
        tool = { ref, copies, heavy: before?.heavy ?? false, proxy: before?.proxy ?? { kind: 'none' }, convert: before?.convert ?? { kind: 'none' } };
        this.tooling.set(s.id, tool);
        if (copies?.convert) {
          url = copies.convert.url;
          file = null;
        }
      }
      if (file) {
        url = URL.createObjectURL(file);
        this.blobUrls.set(s.id, url);
      }
      const l: Loaded = { source: s, file, url, converted: tool?.copies?.convert?.name };
      if (s.media === 'image') {
        const blob = file ?? (await (await fetch(url, { credentials: 'same-origin' })).blob());
        l.image = await createImageBitmap(blob);
        l.w = l.image.width;
        l.h = l.image.height;
      } else {
        const mb = await mediabunny();
        l.input = new mb.Input({ source: file ? new mb.BlobSource(file) : new mb.UrlSource(url, { requestInit: { credentials: 'same-origin' } }), formats: mb.ALL_FORMATS });
        // the application can convert what the browser cannot decode, but never a copy it already converted
        const convertible = !!tool && !l.converted;
        let v: Awaited<ReturnType<Input['getPrimaryVideoTrack']>>;
        let a: Awaited<ReturnType<Input['getPrimaryAudioTrack']>>;
        try {
          v = await l.input.getPrimaryVideoTrack();
          a = await l.input.getPrimaryAudioTrack();
          l.duration = Math.round((await l.input.computeDuration()) * US);
        } catch (e) {
          // a container the browser cannot read at all (MXF, for one)
          if (convertible) throw Object.assign(new Error(UNDECODABLE), { convertible: true });
          throw e;
        }
        l.hasVideo = !!v;
        l.hasAudio = !!a;
        if (v && s.media === 'video') {
          if (!(await v.canDecode())) throw Object.assign(new Error(UNDECODABLE), { convertible });
          l.sink = new mb.CanvasSink(v);
          l.passSink = new mb.CanvasSink(v, { poolSize: 3 });
          l.w = await v.getDisplayWidth();
          l.h = await v.getDisplayHeight();
        }
        // a picture the browser decodes with a sound it does not (AC-3 in a camera's MTS): offered for conversion
        if (a && convertible && !(await a.canDecode())) l.audioUnsupported = true;
      }
      this.loaded.set(s.id, l);
      this.set(s.id, { kind: 'ready' });
      if (tool) void this.prepareTools(l, tool);
    } catch (e) {
      const err = e as { denied?: boolean; gone?: boolean; message?: string; convertible?: boolean };
      if (err.denied) return this.set(s.id, { kind: 'missing', why: 'denied' });
      if (err.gone) return this.set(s.id, { kind: 'missing', why: 'gone' });
      this.set(s.id, { kind: 'error', message: err.message || 'تعذّر تجهيز الملف.', ...(err.convertible ? { convertible: true } : {}) });
    }
  }

  /** A ready video source in the application: its light copy if it has one, otherwise whether one is worth offering. */
  private async prepareTools(l: Loaded, t: Tooling) {
    try {
      if (t.copies?.proxy) {
        await this.openPreview(l, t.copies.proxy.url, t.copies.proxy.name, t.copies.proxy.height);
        t.proxy = { kind: 'ready', height: t.copies.proxy.height };
      } else {
        const p = await this.opts.cache?.probe(t.ref);
        t.heavy = p ? p.heavy : (l.h ?? 0) > 1080;
      }
    } catch {
      // the preview reads the original, as it always could
    }
    if (!this.disposed) this.opts.onChange();
  }

  /** The file behind a ready source (for upload to the library, or export). */
  file(id: string): File | null {
    return this.loaded.get(id)?.file ?? null;
  }
  info(id: string): { w?: number; h?: number; duration?: Micros; hasAudio?: boolean } | null {
    const l = this.loaded.get(id);
    return l ? { w: l.w, h: l.h, duration: l.duration, hasAudio: l.hasAudio } : null;
  }

  image(id: string): ImageBitmap | null {
    return this.loaded.get(id)?.image ?? null;
  }

  /**
   * The paused preview's frame of a video source at `at`: the decoded frame when it covers `at`;
   * otherwise the last one while the right one is decoded (onChange is called when it is ready).
   * Requests are decoded one at a time, always ending on the newest one, so a slower, older decode can
   * never be the frame left on screen.
   */
  frameNear(id: string, at: Micros): CanvasImageSource | null {
    const l = this.loaded.get(id);
    if (!l?.sink && !l?.preview) return null;
    if (this.store && !l.scrubFailed && this.fits(l)) return this.keptNear(l, at / US);
    const s = at / US;
    if (l.last && s >= l.last.from - 1e-4 && s < l.last.to - 1e-4) return l.last.canvas as CanvasImageSource;
    if (l.pending !== at) {
      l.pending = at;
      if (!l.decoding) void this.decodeLoop(l);
    }
    return (l.last?.canvas as CanvasImageSource) ?? null;
  }

  private async decodeLoop(l: Loaded) {
    l.decoding = true;
    try {
      while (l.pending != null && !this.disposed) {
        const at = l.pending;
        // the light copy when there is one (its own times, moved to the original's), else the original
        const p = l.preview;
        const off = p?.offset ?? 0;
        const w: WrappedCanvas | null = await (p?.sink ?? l.sink!).getCanvas(at / US - off);
        if (w) l.last = { at, canvas: w.canvas, from: w.timestamp + off, to: w.timestamp + off + (w.duration || 1 / 30) };
        if (l.pending === at) l.pending = null;
        if (!this.disposed) this.opts.onChange();
      }
    } catch {
      l.pending = null;
    } finally {
      l.decoding = false;
    }
  }

  // ------------------------------------------------------------ D10: the frames kept for the paused preview

  /** The frames near the playhead, at the size the preview draws them. */
  private store: FrameStore<Canvas> | null = null;
  /** Every frame of the stretch the timeline uses, small (scrub.ts THUMB_WIDTH), filled while nothing else is read. */
  private thumbs: FrameStore<Canvas> | null = null;
  /** Canvases of frames let go, ready for the next frames of the same size. */
  private spare: Canvas[] = [];
  private scratch = new Map<string, Canvas>();
  /** Preview pixels each source is drawn at, at most, and the stretch of it the timeline uses (preview.ts, scrub.ts). */
  private needs = new Map<string, { w: number; h: number; range: [number, number] | null }>();
  private playing = false;
  /** The source asked last: the only one whose decoder stays open between asks. */
  private latest: Loaded | null = null;

  /**
   * «ذاكرة الإطارات للتنقل» (scale.ts frameCacheMB): megabytes of decoded frames the paused preview may keep.
   * 0 is the floor: paused frames are decoded one at a time, as they always were.
   */
  setFrameCache(mb: number) {
    const bytes = Math.max(0, Math.floor(mb || 0)) * 1024 * 1024;
    if (!bytes) {
      if (!this.store) return;
      this.store = null;
      this.thumbs = null;
      for (const l of this.loaded.values()) void this.resetScrub(l);
      this.spare = [];
      this.scratch.clear();
      if (!this.disposed) this.opts.onChange();
      return;
    }
    const small = Math.floor(bytes * THUMB_PART);
    this.store ??= new FrameStore<Canvas>(bytes - small, (c) => this.letGo(c));
    this.thumbs ??= new FrameStore<Canvas>(small, (c) => this.letGo(c));
    this.store.budget = bytes - small;
    this.thumbs.budget = small;
    this.store.evict(this.onScreen());
    this.thumbs.evict(this.onScreen());
  }

  /**
   * Where the frame frameNear gives for a source now starts and ends (seconds), whether a newer ask is still read, and
   * whether it is at the preview's size or one of the small frames shown meanwhile (for the checks).
   */
  shownSpan(id: string): { from: number; to: number; busy: boolean; sharp: boolean } | null {
    const l = this.loaded.get(id);
    if (!l) return null;
    if (this.store && !l.scrubFailed && this.fits(l)) return l.shown ? { from: l.shown.from, to: l.shown.to, busy: l.want != null, sharp: !l.shownSmall } : null;
    return l.last ? { from: l.last.from, to: l.last.to, busy: l.pending != null, sharp: true } : null;
  }

  /** The kept frames that answer `s` (seconds) now, sharp and small, without asking for any (for the checks). */
  keptAt(id: string, s: number): { sharp: CanvasImageSource | null; small: CanvasImageSource | null } {
    const l = this.loaded.get(id);
    const sc = l?.scrubReady;
    const d = l && sc ? this.shareOf(l, sc) : 0;
    const td = sc && d ? this.smallOf(sc, d) : 0;
    const peek = (store: FrameStore<Canvas> | null, share: number) => {
      const f = store && share ? store.find(id, s, share) : null;
      return (f?.canvas as CanvasImageSource) ?? null;
    };
    return { sharp: peek(this.store, d), small: peek(this.thumbs, td) };
  }

  /** What the frame memory holds now (for the checks). */
  frameCache(): { budget: number; bytes: number; frames: number; small: { budget: number; bytes: number; frames: number } } {
    return {
      budget: this.store?.budget ?? 0,
      bytes: this.store?.bytes ?? 0,
      frames: this.store?.count() ?? 0,
      small: { budget: this.thumbs?.budget ?? 0, bytes: this.thumbs?.bytes ?? 0, frames: this.thumbs?.count() ?? 0 },
    };
  }

  /** The largest size, in preview pixels, a source is drawn at now, and the stretch of it used (preview.ts). */
  setNeed(id: string, w: number, h: number, range: [number, number] | null = null) {
    const was = this.needs.get(id);
    this.needs.set(id, { w, h, range });
    // a longer stretch is filled again where it was not
    if (was && (was.range?.[0] !== range?.[0] || was.range?.[1] !== range?.[1])) {
      const l = this.loaded.get(id);
      if (l?.scrubReady) l.scrubReady.filled = null;
    }
  }

  /** While playing nothing is read ahead, and no decoder is kept open for it. */
  setPlaying(p: boolean) {
    this.playing = p;
    if (p) for (const l of this.loaded.values()) if (!l.scrubbing) void this.endRun(l);
  }

  private onScreen(): Set<Canvas> {
    const s = new Set<Canvas>();
    for (const l of this.loaded.values()) if (l.shown) s.add(l.shown.canvas);
    return s;
  }

  /** A kept frame let go: its canvas serves the next frame of its size, unless it is still on screen. */
  private letGo(c: Canvas) {
    if (this.onScreen().has(c)) return;
    if (this.spare.length < 12) this.spare.push(c);
    else c.width = 0;
  }

  private canvas(w: number, h: number): Canvas {
    const i = this.spare.findIndex((c) => c.width === w && c.height === h);
    if (i >= 0) return this.spare.splice(i, 1)[0];
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  /** The share of its size a source's frames are kept at; 0 when fewer than eight of them would fit (then the floor). */
  private shareOf(l: Loaded, sc: Scrub): number {
    const need = this.needs.get(l.source.id);
    const d = need ? divisorFor(sc.w, sc.h, need.w, need.h) : 1;
    const bytes = (sc.w / d) * (sc.h / d) * 4;
    return this.store && bytes * 8 <= this.store.budget ? d : 0;
  }

  /** The share of the small frames, when they are smaller than the frames at the preview's size; else 0 (none kept). */
  private smallOf(sc: Scrub, d: number): number {
    const td = thumbShare(sc.w, sc.h);
    return this.thumbs && td > d ? td : 0;
  }

  /** Whether a source's frames are kept: its decoder is not open yet, or its frames fit the memory given. */
  private fits(l: Loaded): boolean {
    return !l.scrubReady || this.shareOf(l, l.scrubReady) > 0;
  }

  private scrubOf(l: Loaded): Promise<Scrub> {
    return (l.scrub ??= (async () => {
      const mb = await mediabunny();
      const p = l.preview;
      const track = (await (p?.input ?? l.input!).getPrimaryVideoTrack())!;
      return { sink: new mb.VideoSampleSink(track), keys: new mb.EncodedPacketSink(track), off: p?.offset ?? 0, w: await track.getDisplayWidth(), h: await track.getDisplayHeight(), run: null, fill: null, filled: null };
    })());
  }

  private async endRun(l: Loaded) {
    const sc = l.scrubReady;
    if (!sc) return;
    const runs = [sc.run, sc.fill];
    sc.run = null;
    sc.fill = null;
    for (const r of runs) if (r) await r.it.return(undefined).catch(() => undefined);
  }

  /** The kept frames of a source are let go and its decoder closed (a light copy opened, the source forgotten). */
  private async resetScrub(l: Loaded) {
    const sc = l.scrubReady;
    l.scrub = undefined;
    l.scrubReady = undefined;
    l.want = null;
    l.shown = null;
    this.store?.drop(l.source.id);
    this.thumbs?.drop(l.source.id);
    if (!sc) return;
    const runs = [sc.run, sc.fill];
    sc.run = null;
    sc.fill = null;
    for (const r of runs) if (r) await r.it.return(undefined).catch(() => undefined);
  }

  /**
   * frameNear with kept frames: the kept frame for `s` (seconds) when there is one; else its small frame while the
   * sharp one is read, or the frame on screen when there is no small one yet.
   */
  private keptNear(l: Loaded, s: number): CanvasImageSource | null {
    const id = l.source.id;
    const sc = l.scrubReady;
    const d = sc ? this.shareOf(l, sc) : 0;
    const f = d ? this.store!.find(id, s, d) : null;
    if (f) {
      l.shown = f;
      l.shownSmall = false;
      l.want = null;
      l.anchor = s;
      // nothing to decode: read on ahead while nothing plays
      if (!l.scrubbing && !this.playing) void this.scrubLoop(l);
      return f.canvas as CanvasImageSource;
    }
    const td = sc && d ? this.smallOf(sc, d) : 0;
    const small = td ? this.thumbs!.find(id, s, td) : null;
    if (small) {
      l.shown = small;
      l.shownSmall = true;
    }
    if (l.want !== s) {
      l.want = s;
      if (!l.scrubbing) void this.scrubLoop(l);
    }
    return (l.shown?.canvas as CanvasImageSource) ?? null;
  }

  private async scrubLoop(l: Loaded) {
    l.scrubbing = true;
    const id = l.source.id;
    try {
      const sc = await this.scrubOf(l);
      if (!l.scrub) return;
      l.scrubReady = sc;
      while (!this.disposed && this.store && !l.scrubFailed && this.loaded.get(id) === l && l.scrubReady === sc) {
        const d = this.shareOf(l, sc);
        if (!d) {
          // its frames are too large for the memory given: decoded as they always were, from the next ask
          await this.endRun(l);
          l.want = null;
          if (!this.disposed) this.opts.onChange();
          break;
        }
        if (sc.run && sc.run.d !== d) {
          const r = sc.run;
          sc.run = null;
          await r.it.return(undefined).catch(() => undefined);
          this.store.drop(id, d);
        }
        const want = l.want;
        if (want != null) {
          this.latest = l;
          for (const o of this.loaded.values()) if (o !== l && !o.scrubbing) void this.endRun(o);
          await this.readTo(l, sc, want, d);
          continue;
        }
        if (this.playing) break;
        if (await this.readAhead(l, sc, d)) continue;
        if (await this.fillStep(l, sc, d)) continue;
        break;
      }
      if (this.latest !== l || this.playing) await this.endRun(l);
    } catch {
      // a decoder that fails here leaves this source to the decoder of old
      l.scrubFailed = true;
      l.want = null;
      l.shown = null;
      await this.endRun(l).catch(() => undefined);
      if (!this.disposed) this.opts.onChange();
    } finally {
      l.scrubbing = false;
    }
  }

  /** Reads until the frame for `want` (seconds, the original's time) is kept and known, or something newer is asked. */
  private async readTo(l: Loaded, sc: Scrub, want: number, d: number) {
    const id = l.source.id;
    const store = this.store!;
    const done = (f: Kept<Canvas> | null) => {
      if (f) {
        l.shown = f;
        l.shownSmall = false;
      }
      if (l.want === want) l.want = null;
      l.anchor = want;
      if (!this.disposed) this.opts.onChange();
    };
    const kept = store.find(id, want, d);
    if (kept) return done(kept);
    const ts = Math.max(0, want - sc.off);
    const keyAt = async () => (await sc.keys.getKeyPacket(ts + EPS, { metadataOnly: true }))?.timestamp ?? 0;
    // the frame that answers `want` is known before it is decoded (the packets' own times): shown as soon as it comes
    const target = (await sc.keys.getPacket(ts + EPS, { metadataOnly: true }))?.timestamp;
    const targetFrom = target === undefined ? null : target + sc.off;
    let run = sc.run;
    // the pass under way goes on when it has already passed the key frame `want` needs; otherwise a new one starts there
    if (run && (run.done || ts + EPS < run.pos || (await keyAt()) > run.pos + EPS)) {
      sc.run = null;
      await run.it.return(undefined).catch(() => undefined);
      run = null;
    }
    if (!run) run = sc.run = { it: sc.sink.samples(Math.max(await keyAt(), ts - SCRUB_BEHIND)), d, pos: -Infinity, prev: null, done: false, frame: 1 / 30, kept: 0 };
    while (l.want === want && !this.disposed && this.store === store && sc.run === run) {
      // frames well before `want` are passed without being painted
      const f = await this.pull(l, sc, run, d, store, want - SCRUB_BEHIND);
      if (f === null) return done(store.find(id, want, d));
      if (f !== 'passed' && targetFrom !== null && Math.abs(f.from - targetFrom) < 1e-6) return done(f);
      const hit = store.find(id, want, d);
      if (hit && !hit.open) return done(hit);
    }
  }

  /** One more frame ahead of where the person is, while nothing plays; false when far enough or nothing to read. */
  private async readAhead(l: Loaded, sc: Scrub, d: number): Promise<boolean> {
    const run = sc.run;
    const store = this.store;
    if (!run || run.done || run.d !== d || !store) return false;
    const frames = Math.max(8, Math.floor(store.budget / ((sc.w / d) * (sc.h / d) * 4) / 4));
    const ahead = Math.min(SCRUB_AHEAD, frames * run.frame);
    if (run.pos >= (l.anchor ?? 0) - sc.off + ahead) return false;
    return (await this.pull(l, sc, run, d, store, -Infinity)) !== null;
  }

  /**
   * One more small frame of the stretch the timeline uses, from where the person is to its end and then from its start,
   * while nothing else is read; false once the stretch is kept or the small frames' memory is full.
   */
  private async fillStep(l: Loaded, sc: Scrub, d: number): Promise<boolean> {
    const id = l.source.id;
    const thumbs = this.thumbs;
    const td = this.smallOf(sc, d);
    if (!thumbs || !td) return false;
    const range = this.needs.get(id)?.range ?? [0, (l.duration ?? 0) / US];
    const key = `${td}:${range[0]}:${range[1]}`;
    if (sc.filled === key) return false;
    const full = () => thumbs.bytes + (sc.w / td) * (sc.h / td) * 4 > thumbs.budget;
    let run = sc.fill;
    if (run && (run.done || run.d !== td || run.pos + sc.off > range[1] + EPS)) {
      sc.fill = null;
      await run.it.return(undefined).catch(() => undefined);
      // a pass that kept nothing new would only start again where it did
      if (!run.kept) {
        sc.filled = key;
        return false;
      }
      run = null;
    }
    if (!run) {
      const at = Math.min(range[1], Math.max(range[0], l.anchor ?? range[0]));
      let from = thumbs.coveredUntil(id, at, td);
      if (from >= range[1] - EPS) from = thumbs.coveredUntil(id, range[0], td);
      if (from >= range[1] - EPS || full()) {
        sc.filled = key;
        return false;
      }
      run = sc.fill = { it: sc.sink.samples(Math.max(0, from - sc.off)), d: td, pos: -Infinity, prev: null, done: false, frame: 1 / 30, kept: 0 };
    }
    if (full()) {
      sc.filled = key;
      return false;
    }
    await this.pull(l, sc, run, td, thumbs, range[0] - 1, false);
    return true;
  }

  /**
   * The next frame of a pass. It is kept (painted once at its share of the size) unless it ends before `keepFrom`, when it
   * is only passed ('passed'); null at the end of the source or when the pass was ended from elsewhere.
   */
  private async pull(l: Loaded, sc: Scrub, run: Run, d: number, store: FrameStore<Canvas>, keepFrom: number, evict = true): Promise<Kept<Canvas> | 'passed' | null> {
    const r = await run.it.next();
    if (sc.run !== run && sc.fill !== run) {
      // ended from elsewhere: what it read last is not the source's end
      if (!r.done) r.value.close();
      return null;
    }
    if (r.done) {
      run.done = true;
      if (run.prev) store.close(run.prev, Infinity);
      return null;
    }
    const sample = r.value;
    try {
      const id = l.source.id;
      const from = sample.timestamp + sc.off;
      if (run.prev) store.close(run.prev, from);
      run.pos = sample.timestamp;
      if (sample.duration > 0) run.frame = sample.duration;
      let f = store.get(id, from, d);
      if (!f && from + (sample.duration || run.frame) <= keepFrom + EPS) {
        run.prev = null;
        return 'passed';
      }
      if (!f) {
        const c = this.paint(sample, sc.w / d, sc.h / d, d);
        f = store.put(id, { from, to: from + (sample.duration || run.frame), canvas: c, bytes: c.width * c.height * 4, d });
        run.kept++;
        if (evict) {
          const keep = this.onScreen();
          keep.add(c);
          store.evict(keep);
        }
      }
      run.prev = f;
      return f;
    } finally {
      sample.close();
    }
  }

  /** A decoded frame on a canvas of w x h: drawn at half the source's size first, then halved, so no pixel is skipped. */
  private paint(sample: VideoSample, w: number, h: number, d: number): Canvas {
    const c = this.canvas(w, h);
    const g = c.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
    if (d <= 2) {
      sample.drawWithFit(g, { fit: 'fill' });
      return c;
    }
    let src: Canvas | null = null;
    for (let k = 2; k < d; k *= 2) {
      const step = this.scratchOf(w * (d / k), h * (d / k));
      const sg = step.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
      if (!src) sample.drawWithFit(sg, { fit: 'fill' });
      else sg.drawImage(src, 0, 0, step.width, step.height);
      src = step;
    }
    g.drawImage(src!, 0, 0, w, h);
    return c;
  }

  private scratchOf(w: number, h: number): Canvas {
    const key = `${w}x${h}`;
    let c = this.scratch.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      this.scratch.set(key, c);
    }
    return c;
  }

  /** The exact frame at `at`, waited for (the export, and a still). The canvas may be reused by the next call. */
  async frameAt(id: string, at: Micros): Promise<CanvasImageSource | null> {
    const l = this.loaded.get(id);
    if (!l?.sink) return null;
    const w = await l.sink.getCanvas(at / US);
    return (w?.canvas as CanvasImageSource) ?? null;
  }

  /** Frames of a source in order from `from` to `to` (seconds), for the export: one decoder pass. */
  frames(id: string, from: number, to: number): AsyncGenerator<WrappedCanvas, void, unknown> | null {
    const l = this.loaded.get(id);
    return l?.passSink ? l.passSink.canvases(from, to) : null;
  }

  input(id: string): Input | null {
    return this.loaded.get(id)?.input ?? null;
  }

  private peaksMap = new Map<string, Float32Array | 'working' | 'none'>();
  /**
   * The waveform of a source with sound (peaks.ts), or null while it is being worked out (onChange is
   * called when it is ready). Worked out once per file and kept on this device in IndexedDB.
   */
  peaks(id: string): Float32Array | null {
    const got = this.peaksMap.get(id);
    if (got instanceof Float32Array) return got;
    if (got) return null;
    const l = this.loaded.get(id);
    if (!l || !l.hasAudio || !l.input) return null;
    this.peaksMap.set(id, 'working');
    void (async () => {
      try {
        const key = peaksKey(l.source as { kind: string; asset?: string; version?: number; key?: string });
        let p = await peakStore.get(key);
        if (!p) {
          const mb = await mediabunny();
          const track = await l.input!.getPrimaryAudioTrack();
          if (!track || !(await track.canDecode())) throw new Error('none');
          const duration = (l.duration ?? 0) / US;
          p = new Float32Array(Math.max(1, Math.ceil(duration * PEAKS_PER_SECOND)));
          const sink = new mb.AudioBufferSink(track);
          for await (const { buffer, timestamp } of sink.buffers(0, duration)) {
            if (this.disposed) return;
            const channels: Float32Array[] = [];
            for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
            reduceInto(p, { timestamp, channels, sampleRate: buffer.sampleRate });
          }
          await peakStore.put(key, p);
        }
        this.peaksMap.set(id, p);
        if (!this.disposed) this.opts.onChange();
      } catch {
        this.peaksMap.set(id, 'none');
      }
    })();
    return null;
  }

  /**
   * A media element for one playing clip, playing its source from its own place, or its light copy (elementOffset).
   * `copy` false plays the source even when a light copy exists (the stream budget, playback.ts streamPlan).
   */
  element(clipId: string, sourceId: string, copy = true): HTMLMediaElement | null {
    const l = this.loaded.get(sourceId);
    if (!l || l.source.media === 'image') return null;
    const fromCopy = copy && !!l.preview;
    let el = this.elements.get(clipId);
    if (!el || el.dataset.source !== sourceId || (el.dataset.copy === '1') !== fromCopy) {
      if (el) {
        el.pause();
        // another copy of the same source: the old element's decoder is let go at once
        if (el.dataset.source === sourceId) {
          el.removeAttribute('src');
          el.load();
        }
      }
      el = document.createElement(l.source.media === 'audio' ? 'audio' : 'video');
      el.preload = 'auto';
      (el as HTMLVideoElement).playsInline = true;
      el.dataset.source = sourceId;
      el.dataset.copy = fromCopy ? '1' : '0';
      const src = fromCopy ? l.preview!.url : l.url;
      // the application's own addresses are another origin: asked with CORS, which the application answers
      // for the site, so a canvas that draws the playing video can still be read (a frame, the other window)
      if (src.startsWith('commshub-file:')) el.crossOrigin = 'anonymous';
      el.src = src;
      this.elements.set(clipId, el);
    }
    return el;
  }

  /** The element a clip plays from now, if it has one (the drawing reads it; only element() makes one). */
  elementOf(clipId: string): HTMLMediaElement | null {
    return this.elements.get(clipId) ?? null;
  }

  /** Stops every element whose clip is not in `keep`. */
  pauseExcept(keep: Set<string>) {
    for (const [id, el] of this.elements) if (!keep.has(id) && !el.paused) el.pause();
  }

  dispose() {
    this.disposed = true;
    for (const el of this.elements.values()) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    this.elements.clear();
    // revoked a moment later: an element that was just emptied may still be aborting a read of it
    const urls = [...this.blobUrls.values()];
    this.blobUrls.clear();
    setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 3000);
    for (const l of this.loaded.values()) {
      l.image?.close();
      void this.resetScrub(l);
    }
    this.store = null;
    this.loaded.clear();
  }
}

/** Waveforms kept on this device («comms-hub-studio-peaks»), by file and version or device fingerprint. */
const peakStore = (() => {
  let db: Promise<IDBDatabase | null> | null = null;
  const open = () =>
    (db ??= new Promise<IDBDatabase | null>((resolve) => {
      try {
        const req = indexedDB.open('comms-hub-studio-peaks', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('peaks');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    }));
  return {
    async get(key: string): Promise<Float32Array | null> {
      const d = await open();
      if (!d) return null;
      return new Promise((resolve) => {
        try {
          const r = d.transaction('peaks', 'readonly').objectStore('peaks').get(key);
          r.onsuccess = () => resolve(r.result instanceof ArrayBuffer ? new Float32Array(r.result) : null);
          r.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    },
    async put(key: string, p: Float32Array): Promise<void> {
      const d = await open();
      if (!d) return;
      await new Promise<void>((resolve) => {
        try {
          const r = d.transaction('peaks', 'readwrite').objectStore('peaks').put(p.buffer.slice(0), key);
          r.onsuccess = () => resolve();
          r.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    },
  };
})();

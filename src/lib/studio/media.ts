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
// cut lands on the same frame in both. Browser only.
import type { CanvasSink, Input, WrappedCanvas } from 'mediabunny';
import { US, type Micros, type ProjectDoc, type Source } from './schema.ts';
import { DeviceCache } from './cache.ts';
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
  elementOffset(id: string): number {
    return this.loaded.get(id)?.preview?.offset ?? 0;
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

  /** A media element for one playing clip, playing its source from its own place, or its light copy (elementOffset). */
  element(clipId: string, sourceId: string): HTMLMediaElement | null {
    const l = this.loaded.get(sourceId);
    if (!l || l.source.media === 'image') return null;
    let el = this.elements.get(clipId);
    if (!el || el.dataset.source !== sourceId) {
      el?.pause();
      el = document.createElement(l.source.media === 'audio' ? 'audio' : 'video');
      el.preload = 'auto';
      (el as HTMLVideoElement).playsInline = true;
      el.dataset.source = sourceId;
      el.src = l.preview?.url ?? l.url;
      this.elements.set(clipId, el);
    }
    return el;
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
    for (const l of this.loaded.values()) l.image?.close();
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

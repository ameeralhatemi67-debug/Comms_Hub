// A project's media in the browser (MVP_draft.md 62): every source made ready from the device cache
// (library versions are copied once; device files are read from private storage), then:
//   - pictures as ImageBitmaps;
//   - video frames decoded by Mediabunny (the same decoder the export uses), exact when paused;
//   - one media element per playing clip for smooth playback with its sound.
// The state of each source (copying with progress, ready, missing on this device, refused, failed) is
// kept for the interface. Browser only.
import type { CanvasSink, Input, WrappedCanvas } from 'mediabunny';
import { US, type Micros, type ProjectDoc, type Source } from './schema.ts';
import { DeviceCache } from './cache.ts';
import { PEAKS_PER_SECOND, peaksKey, reduceInto } from './peaks.ts';

export type SourceState =
  | { kind: 'loading'; done: number; total: number }
  | { kind: 'ready' }
  | { kind: 'missing'; why: 'device' | 'denied' | 'gone' }
  | { kind: 'error'; message: string };

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
};

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

  /** Keys of the library copies this project uses, so the sweep and «حذف» leave them. */
  inUse(doc: ProjectDoc): Set<string> {
    return new Set(doc.sources.filter((s) => s.kind === 'library').map((s) => `asset-${(s as { asset: string }).asset}-v${(s as { version: number }).version}`));
  }

  private async load(s: Source) {
    this.set(s.id, { kind: 'loading', done: 0, total: 0 });
    try {
      let file: File | null = null;
      let url = '';
      const cache = this.opts.cache;
      if (s.kind === 'library') {
        const u = (this.opts.url ?? contentUrl)(s.asset, s.version);
        if (cache) {
          file = await cache.libraryFile(s.asset, s.version, u, {
            label: s.name,
            onProgress: (done, total) => this.set(s.id, { kind: 'loading', done, total }),
            fetcher: async (x, init) => {
              const r = await fetch(x, init);
              if (r.status === 403 || r.status === 401) throw Object.assign(new Error('DENIED'), { denied: true });
              if (r.status === 404) throw Object.assign(new Error('GONE'), { gone: true });
              return r;
            },
          });
        } else url = u;
      } else {
        file = cache ? await cache.localFile(s.key) : null;
        if (!file) return this.set(s.id, { kind: 'missing', why: 'device' });
      }
      if (this.disposed) return;
      if (file) {
        url = URL.createObjectURL(file);
        this.blobUrls.set(s.id, url);
      }
      const l: Loaded = { source: s, file, url };
      if (s.media === 'image') {
        const blob = file ?? (await (await fetch(url, { credentials: 'same-origin' })).blob());
        l.image = await createImageBitmap(blob);
        l.w = l.image.width;
        l.h = l.image.height;
      } else {
        const mb = await mediabunny();
        l.input = new mb.Input({ source: file ? new mb.BlobSource(file) : new mb.UrlSource(url, { requestInit: { credentials: 'same-origin' } }), formats: mb.ALL_FORMATS });
        const v = await l.input.getPrimaryVideoTrack();
        const a = await l.input.getPrimaryAudioTrack();
        l.hasVideo = !!v;
        l.hasAudio = !!a;
        l.duration = Math.round((await l.input.computeDuration()) * US);
        if (v && s.media === 'video') {
          if (!(await v.canDecode())) throw new Error('هذا المتصفح لا يفك ترميز هذا الفيديو.');
          l.sink = new mb.CanvasSink(v);
          l.passSink = new mb.CanvasSink(v, { poolSize: 3 });
          l.w = await v.getDisplayWidth();
          l.h = await v.getDisplayHeight();
        }
      }
      this.loaded.set(s.id, l);
      this.set(s.id, { kind: 'ready' });
    } catch (e) {
      const err = e as { denied?: boolean; gone?: boolean; message?: string };
      if (err.denied) return this.set(s.id, { kind: 'missing', why: 'denied' });
      if (err.gone) return this.set(s.id, { kind: 'missing', why: 'gone' });
      this.set(s.id, { kind: 'error', message: err.message || 'تعذّر تجهيز الملف.' });
    }
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
    if (!l?.sink) return null;
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
        const w: WrappedCanvas | null = await l.sink!.getCanvas(at / US);
        if (w) l.last = { at, canvas: w.canvas, from: w.timestamp, to: w.timestamp + (w.duration || 1 / 30) };
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

  /** A media element for one playing clip, playing its source from its own place. */
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
      el.src = l.url;
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

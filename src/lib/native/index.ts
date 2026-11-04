// The native contract shared by every shell around the site (Mobile_Apps_Plan.md 5.2; Desktop_App_Plan.md
// 5.2; Android_Build_Plan.md). The site asks here what the shell it runs in can do, and never talks to a
// shell any other way. The desktop and Android applications expose window.commsHubNative on the site's
// own address only; in a browser there is none, and every answer is the browser's. Each feature is
// detected before use, so an older application keeps working against a newer site, and a browser does
// exactly what it did before. Plain TypeScript; the detection is tested in tests/native.test.mjs.

export type Platform = 'web' | 'desktop' | 'android' | 'ios';

/**
 * What a shell may offer. The desktop bridge offers the first five from version 1 (D2), update from 2 (D3),
 * files, cache and clearData from 3 (D4), media from 4 (D5), windows from 5 (D6), gpu and profile from 6 (D9,
 * Desktop_Power_Ideas.md P-01 and P-33), activity and copyQueue from 7 (D12, P-30 and P-08), taskbar and dragOut from 8
 * (D12, P-26 and P-22), cardImport from 9 (D12, P-20).
 * The Android application
 * offers its own: appUpdate (A3), download and share (A4), push (A5), links and lock (A6), capture,
 * incoming and upload (A7), and in Google Play's copy playUpdate instead of appUpdate (A8).
 */
export type Feature =
  | 'info'
  | 'keepAwake'
  | 'busy'
  | 'notify'
  | 'badge'
  | 'update'
  | 'files'
  | 'cache'
  | 'clearData'
  | 'media'
  | 'windows'
  | 'gpu'
  | 'profile'
  | 'activity'
  | 'copyQueue'
  | 'taskbar'
  | 'dragOut'
  | 'cardImport'
  | 'appUpdate'
  | 'download'
  | 'share'
  | 'push'
  | 'links'
  | 'lock'
  | 'capture'
  | 'incoming'
  | 'upload'
  | 'playUpdate';

/** A release of the Android application as its update asks for it: the shell builds the address itself, from its compiled feed. */
export type NativeApkRelease = { version: string; file: string; size: number; sha256: string };
/** A file of the site the Android application saves, opens or shares: a path on the page's own address, never a full address. */
export type NativeSiteFile = { path: string; name: string };
/** A file the Android application holds for the page (from the camera or shared in): a token, never a path. */
export type NativeHeldFile = { token: string; name: string; size: number; type: string };

/** A file from «هذا الجهاز» as the desktop application names it: never its path. */
export type NativeFile = { token: string; name: string; size: number; type: string; media: 'video' | 'audio' | 'image'; modified: number };
export type NativeCacheEntry = { name: string; kind: 'library' | 'proxy' | 'convert'; bytes: number; complete: boolean; lastUsed: number; label: string | null };
/** `folder` is the folder's label (D12): «المجلد الافتراضي» or the chosen folder's last name. An application before 0.8.1 sent its path. */
export type NativeCacheUsage = { library: number; proxy: number; files: number; limit: number; limits: number[]; free: number | null; folder: string; isDefault: boolean; entries: NativeCacheEntry[] };
/** How the desktop application's media tools name a source: a device file's token, or a library version already in its folder. Never a path. */
export type NativeMediaRef = { token: string } | { asset: string; version: number };
export type NativeCopy = { name: string; url: string; bytes: number };
/** The light and converted copies a source has on this device, and the names they would be made under. */
export type NativeCopies = { proxy: (NativeCopy & { height: number }) | null; convert: NativeCopy | null; names: { proxy: Record<string, string>; convert: string } };
/** A screen as the desktop application describes it (D6): the system's own name for it, never what is on it. */
export type NativeScreen = { id: number; label: string; primary: boolean; current: boolean; bounds: { x: number; y: number; width: number; height: number }; scaleFactor: number };
export type NativeProbe = {
  duration: number | null;
  bitRate: number | null;
  container: string;
  video: { codec: string; profile: string | null; width: number; height: number; fps: number | null; bitDepth: number } | null;
  audio: { codec: string; rate: number; channels: number } | null;
  heavy: boolean;
};

/** «بطاقة الرسوميات للاستوديو» (D9): the person's choice, and the switch Chromium started with and will start with next. */
export type GpuChoice = 'auto' | 'strong' | 'saving';
export type GpuSwitch = 'high' | 'low' | 'none';
export type NativeGpuState = { choice: GpuChoice; active: GpuSwitch; given: boolean; pick: 'high' | 'low' | null; power: 'ac' | 'battery'; next: GpuSwitch; restart: boolean };
/** A device profile's numbers (src/lib/studio/bench.ts measures them; desktop/src/profile.ts keeps them). */
export type ProfileRate = { hw: number | null; sw: number | null };
export type ProfileNumbers = {
  v: 1;
  encode: { h264_1080: ProfileRate; h264_2160: ProfileRate };
  decode: { h264_2160: ProfileRate };
  lanes: number[];
  compose: { plain: number; text: number; effects: number };
  exportFps: number;
  support: { hevcEncode: boolean; av1Encode: boolean; tenBitEncode: boolean; hevcDecode: boolean; av1Decode: boolean };
  runs: number;
  spread: number;
  seconds: number;
  renderer: string;
};
/** What a measurement is true for, as the desktop application itself records it: never what a page says. */
export type ProfileKey = { app: string; chrome: string; chip: { vendorId: number; deviceId: number; vendor: string; name: string; driver: string }; switch: GpuSwitch; power: 'ac' | 'battery' };
export type ProfileEntry = { at: number; key: ProfileKey; numbers: ProfileNumbers };

/** What a page tells the desktop application it is doing, so the laptop's background work waits (D12, P-30). */
export type Activity = 'none' | 'playing' | 'scrubbing' | 'measuring';
/** Why the light copies made in idle time wait (desktop/src/idle.ts HOLDS). */
export type CopyHold = 'battery' | 'throttled' | 'export' | 'upload' | 'measuring' | 'playing' | 'scrubbing' | 'asked' | 'input';
/** One source of a window's project in the application's queue of light copies: its copy's name and how far it is. */
export type NativeQueueItem = { name: string; state: 'probing' | 'waiting' | 'running' | 'paused' | 'ready' | 'light' | 'failed' | 'missing'; done: number; total: number; why: string | null };
export type NativeQueueState = { hold: CopyHold | null; width: number; items: NativeQueueItem[] };

/** A recording on a camera's card as the desktop application lists it (D12, P-20): a key of this listing, never a path. */
export type NativeCardItem = { key: string; name: string; size: number; media: 'video' | 'audio' | 'image'; modified: number; parts: number };
export type NativeCard = { id: string; label: string; items: NativeCardItem[] };
/** Why a recording was not copied: changed or pulled out mid-copy, a copy that did not read back the same, a full disk, cancelled, onto the card itself. */
export type CardWhy = 'changed' | 'mismatch' | 'gone' | 'space' | 'cancelled' | 'inside' | 'failed';
export type NativeCardCopy = { folder: string; results: ({ key: string; ok: true; file: NativeFile } | { key: string; ok: false; why: CardWhy })[] };

export type Reason = 'export' | 'upload';
export type NativeNotice = { title: string; body?: string; go?: string | null };

type Bridge = {
  platform: Exclude<Platform, 'web'>;
  shell: string;
  version: string;
  bridge: number;
  info?: () => Promise<unknown>;
  power?: { keepAwake?: (reason: Reason) => Promise<number>; release?: (id: number) => Promise<boolean> };
  life?: { busy?: (reason: Reason) => Promise<boolean>; idle?: () => Promise<boolean>; activity?: (kind: Activity) => Promise<boolean>; progress?: (state: number | 'done' | 'failed') => Promise<boolean> };
  notify?: { show?: (n: NativeNotice) => Promise<boolean>; badge?: (n: number) => Promise<boolean>; onOpen?: (fn: ((go: string) => void) | null) => void };
  update?: { status?: () => Promise<unknown>; restart?: () => Promise<'restart' | 'busy' | 'nothing'> };
  files?: {
    pick?: (kinds: string[]) => Promise<NativeFile[]>;
    fromDropped?: (file: File) => Promise<NativeFile | null>;
    check?: (token: string) => Promise<{ ok: boolean; url?: string; why?: string }>;
    forget?: (token: string) => Promise<boolean>;
    dragOut?: (token: string) => Promise<boolean>;
    importCard?: () => Promise<NativeCard | null>;
    copyCard?: (ask: { id: string; keys: string[] }) => Promise<NativeCardCopy | null>;
    cancelCard?: (id: string) => Promise<boolean>;
    onCard?: (fn: ((p: { id: string; done: number; total: number }) => void) | null) => void;
  };
  cache?: {
    library?: (ask: { asset: string; version: number; label?: string; inUse?: string[] }) => Promise<{ name: string; url: string; bytes: number }>;
    cancel?: (name: string) => Promise<boolean>;
    has?: (ask: { asset: string; version: number }) => Promise<string | null>;
    usage?: () => Promise<NativeCacheUsage>;
    choose?: () => Promise<NativeCacheUsage>;
    useDefault?: () => Promise<NativeCacheUsage>;
    limit?: (bytes: number, inUse: string[]) => Promise<NativeCacheUsage>;
    sweep?: (inUse: string[]) => Promise<{ removed: number; bytes: number }>;
    clear?: (inUse: string[]) => Promise<{ removed: number; bytes: number }>;
    onProgress?: (fn: ((p: { name: string; done: number; total: number }) => void) | null) => void;
  };
  data?: { clear?: () => Promise<{ files: number; cache: number }> };
  windows?: {
    screens?: () => Promise<NativeScreen[]>;
    popOut?: (ask: { panel: 'preview'; project: string; screen?: number; full?: boolean }) => Promise<{ screen: number; full: boolean }>;
    close?: (panel: 'preview') => Promise<boolean>;
  };
  gpu?: {
    state?: () => Promise<NativeGpuState>;
    choose?: (choice: GpuChoice) => Promise<NativeGpuState>;
    restart?: () => Promise<'restart' | 'busy' | 'nothing'>;
  };
  profile?: {
    read?: () => Promise<{ current: ProfileKey; entries: ProfileEntry[] }>;
    save?: (numbers: ProfileNumbers) => Promise<ProfileEntry>;
  };
  media?: {
    probe?: (source: NativeMediaRef) => Promise<NativeProbe>;
    copies?: (source: NativeMediaRef) => Promise<NativeCopies>;
    proxy?: (source: NativeMediaRef, height: number, inUse: string[]) => Promise<NativeCopy>;
    convert?: (source: NativeMediaRef, inUse: string[]) => Promise<NativeCopy>;
    cancel?: (name: string) => Promise<boolean>;
    onProgress?: (fn: ((p: { name: string; done: number; total: number }) => void) | null) => void;
    queue?: (ask: { items: NativeMediaRef[]; width: number; inUse?: string[] }) => Promise<NativeQueueState>;
    queued?: () => Promise<NativeQueueState>;
    onQueue?: (fn: ((s: NativeQueueState) => void) | null) => void;
  };
  // --- the Android application (Android_Build_Plan.md) ---
  appUpdate?: { status?: () => Promise<unknown>; start?: (release: NativeApkRelease) => Promise<'started' | 'busy' | 'permission' | 'refused'> };
  download?: { save?: (file: NativeSiteFile) => Promise<boolean>; open?: (file: NativeSiteFile) => Promise<boolean> };
  share?: { file?: (file: NativeSiteFile) => Promise<boolean> };
  push?: {
    state?: () => Promise<'granted' | 'denied' | 'prompt'>;
    request?: () => Promise<'granted' | 'denied' | 'prompt'>;
    token?: () => Promise<string | null>;
    onOpen?: (fn: ((go: string) => void) | null) => void;
    onReceive?: (fn: (() => void) | null) => void;
  };
  links?: { verified?: () => Promise<boolean> };
  lock?: { state?: () => Promise<{ available: boolean; on: boolean }>; set?: (on: boolean) => Promise<boolean> };
  capture?: { take?: (kind: 'photo' | 'video') => Promise<NativeHeldFile | null> };
  incoming?: { take?: () => Promise<NativeHeldFile[]> };
  upload?: { start?: (ask: { token: string; session: string }) => Promise<string>; status?: () => Promise<unknown>; cancel?: (id: string) => Promise<boolean> };
  playUpdate?: {
    status?: () => Promise<unknown>;
    start?: (mode: 'flexible' | 'immediate') => Promise<'started' | 'busy' | 'uploading' | 'unavailable' | 'refused'>;
    complete?: () => Promise<'started' | 'uploading' | 'nothing' | 'refused'>;
  };
};

export type Native = {
  platform: Platform;
  shell: string | null;
  version: string | null;
  bridge: number;
  has(feature: Feature): boolean;
  /** The shell's own object, for the helpers below; null in a browser. */
  raw: Bridge | null;
};

/** Each feature and the methods that must all be present for it. */
export const FEATURES: Readonly<Record<Feature, readonly string[]>> = Object.freeze({
  info: ['info'],
  keepAwake: ['power.keepAwake', 'power.release'],
  busy: ['life.busy', 'life.idle'],
  notify: ['notify.show'],
  badge: ['notify.badge'],
  update: ['update.status', 'update.restart'],
  files: ['files.fromDropped', 'files.check', 'files.forget'],
  cache: ['cache.library', 'cache.usage', 'cache.sweep', 'cache.clear', 'cache.onProgress'],
  clearData: ['data.clear'],
  media: ['media.probe', 'media.copies', 'media.proxy', 'media.convert', 'media.cancel', 'media.onProgress'],
  windows: ['windows.screens', 'windows.popOut', 'windows.close'],
  gpu: ['gpu.state', 'gpu.choose', 'gpu.restart'],
  profile: ['profile.read', 'profile.save'],
  activity: ['life.activity'],
  copyQueue: ['media.queue', 'media.queued', 'media.onQueue'],
  taskbar: ['life.progress'],
  dragOut: ['files.fromDropped', 'files.dragOut'],
  cardImport: ['files.importCard', 'files.copyCard', 'files.cancelCard', 'files.onCard'],
  appUpdate: ['appUpdate.status', 'appUpdate.start'],
  download: ['download.save', 'download.open'],
  share: ['share.file'],
  push: ['push.state', 'push.request', 'push.token', 'push.onOpen', 'push.onReceive'],
  links: ['links.verified'],
  lock: ['lock.state', 'lock.set'],
  capture: ['capture.take'],
  incoming: ['incoming.take'],
  upload: ['upload.start', 'upload.status', 'upload.cancel'],
  playUpdate: ['playUpdate.status', 'playUpdate.start', 'playUpdate.complete'],
});

const SHELLS = ['desktop', 'android', 'ios'];

const pick = (value: unknown, dotted: string): unknown =>
  dotted.split('.').reduce<unknown>((at, key) => (at && (typeof at === 'object' || typeof at === 'function') ? (at as Record<string, unknown>)[key] : undefined), value);

/** A shell's object as the site may trust its shape, or null for anything else. */
export function readBridge(value: unknown): Bridge | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<Bridge>;
  if (typeof v.platform !== 'string' || !SHELLS.includes(v.platform)) return null;
  if (typeof v.shell !== 'string' || typeof v.version !== 'string' || !/^\d+\.\d+\.\d+/.test(v.version)) return null;
  if (typeof v.bridge !== 'number' || !Number.isInteger(v.bridge) || v.bridge < 1) return null;
  return v as Bridge;
}

/** The answer for a given window object; native() asks for this window. */
export function nativeOf(value: unknown): Native {
  const raw = readBridge(value);
  if (!raw) return { platform: 'web', shell: null, version: null, bridge: 0, has: () => false, raw: null };
  return {
    platform: raw.platform,
    shell: raw.shell,
    version: raw.version,
    bridge: raw.bridge,
    has: (feature) => (FEATURES[feature] ?? []).every((path) => typeof pick(raw, path) === 'function'),
    raw,
  };
}

export function native(): Native {
  return nativeOf(typeof window === 'undefined' ? undefined : (window as Window & { commsHubNative?: unknown }).commsHubNative);
}

/** -1, 0 or 1, comparing two versions number by number ("0.10.0" is after "0.9.3"). */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const parts = (v: string) => (/^(\d+)\.(\d+)\.(\d+)/.exec(v) ?? [0, 0, 0, 0]).slice(1).map(Number);
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

// --- what the site does through it ---------------------------------------------------------------

type Release = () => Promise<void>;
const nothing: Release = async () => undefined;
type WakeLock = { release(): Promise<void> };

/**
 * Keeps the work going: in the desktop application the laptop does not sleep; in a browser the screen
 * stays on, as the studio always asked. Returns the function that lets go.
 */
export async function keepAwake(reason: Reason): Promise<Release> {
  const n = native();
  if (n.has('keepAwake')) {
    try {
      const id = await n.raw!.power!.keepAwake!(reason);
      return async () => {
        await n.raw!.power!.release!(id).catch(() => undefined);
      };
    } catch {
      // an older or refusing application: the browser's own way below
    }
  }
  const lock = await (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLock> } }).wakeLock?.request('screen').catch(() => null);
  return lock ? async () => void (await lock.release().catch(() => undefined)) : nothing;
}

/**
 * Tells the desktop application this window is working: it is not slowed while minimised, closing it
 * hides it to the tray, and quitting asks first. Nothing in a browser. Returns the function that ends it.
 */
export async function markBusy(reason: Reason): Promise<Release> {
  const n = native();
  if (!n.has('busy')) return nothing;
  try {
    await n.raw!.life!.busy!(reason);
  } catch {
    return nothing;
  }
  return async () => {
    await n.raw!.life!.idle!().catch(() => undefined);
  };
}

/** A native notice; the application shows it only when its window is not in front. False elsewhere. */
export async function notifyNative(notice: NativeNotice): Promise<boolean> {
  const n = native();
  if (!n.has('notify')) return false;
  try {
    return (await n.raw!.notify!.show!(notice)) === true;
  } catch {
    return false;
  }
}

/** The count of notices waiting for a decision, on the taskbar and the tray. */
export async function setBadge(count: number): Promise<void> {
  const n = native();
  if (!n.has('badge')) return;
  await n.raw!.notify!.badge!(Math.max(0, Math.min(9999, Math.floor(count)))).catch(() => undefined);
}

/** How the page moves when a native notice is clicked; returns the function that stops listening. */
export function onNoticeOpen(fn: (go: string) => void): () => void {
  const open = native().raw?.notify?.onOpen;
  if (typeof open !== 'function') return () => undefined;
  open(fn);
  return () => open(null);
}

/**
 * Tells the desktop application what this page is doing (D12, P-30): «playing», «scrubbing» or «measuring» hold the
 * laptop's background work (light copies made in idle time) until `none`. Nothing in a browser or an older application.
 */
export async function setActivity(kind: Activity): Promise<void> {
  const n = native();
  if (!n.has('activity')) return;
  await n.raw!.life!.activity!(kind).catch(() => undefined);
}

let lastProgress: number | null = null;

/**
 * How far this page's work is, on the desktop application's taskbar button (D12, P-26): a fraction from 0 to 1, «done»
 * when it ended (the bar goes) or «failed» (the bar turns red until the window is looked at). A fraction is sent only when
 * it moved by a hundredth, so an export may call this for every frame. Nothing in a browser or an older application.
 */
export async function setTaskbarProgress(state: number | 'done' | 'failed'): Promise<void> {
  const n = native();
  if (!n.has('taskbar')) return;
  let send: number | 'done' | 'failed' = state;
  if (typeof state === 'number') {
    if (!Number.isFinite(state)) return;
    const v = Math.round(Math.max(0, Math.min(1, state)) * 100) / 100;
    if (v === lastProgress) return;
    lastProgress = v;
    send = v;
  } else lastProgress = null;
  await n.raw!.life!.progress!(send).catch(() => undefined);
}

/**
 * A token for a file on this laptop, so it can be dragged out (D12, P-22): a File the person chose, or the handle an
 * export was saved to (its own File, not a copy of its bytes). Null in a browser, an older application, or for bytes
 * that are not a file on the disk.
 */
export async function fileToken(file: File | FileSystemFileHandle): Promise<string | null> {
  const n = native();
  if (!n.has('dragOut')) return null;
  try {
    const f = file instanceof File ? file : await file.getFile();
    return (await n.raw!.files!.fromDropped!(f))?.token ?? null;
  } catch {
    return null;
  }
}

/**
 * Drags a file the application gave a token for into another program (Explorer, a messenger). Call it from the
 * element's dragstart, after event.preventDefault(): Windows carries the drag from there. False when nothing is dragged.
 */
export async function dragOutFile(token: string): Promise<boolean> {
  const n = native();
  if (!n.has('dragOut')) return false;
  return (await n.raw!.files!.dragOut!(token).catch(() => false)) === true;
}

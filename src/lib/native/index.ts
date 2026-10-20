// The native contract shared by every shell around the site (Mobile_Apps_Plan.md 5.2; Desktop_App_Plan.md
// 5.2). The site asks here what the shell it runs in can do, and never talks to a shell any other way.
// The desktop application exposes window.commsHubNative on the site's own address only; in a browser
// there is none, and every answer is the browser's. Each feature is detected before use, so an older
// application keeps working against a newer site, and a browser does exactly what it did before.
// Plain TypeScript; the detection is tested in tests/native.test.mjs.

export type Platform = 'web' | 'desktop' | 'android' | 'ios';

/** What a shell may offer. The desktop bridge offers the first five from version 1 (D2), update from 2 (D3). */
export type Feature = 'info' | 'keepAwake' | 'busy' | 'notify' | 'badge' | 'update';

export type Reason = 'export' | 'upload';
export type NativeNotice = { title: string; body?: string; go?: string | null };

type Bridge = {
  platform: Exclude<Platform, 'web'>;
  shell: string;
  version: string;
  bridge: number;
  info?: () => Promise<unknown>;
  power?: { keepAwake?: (reason: Reason) => Promise<number>; release?: (id: number) => Promise<boolean> };
  life?: { busy?: (reason: Reason) => Promise<boolean>; idle?: () => Promise<boolean> };
  notify?: { show?: (n: NativeNotice) => Promise<boolean>; badge?: (n: number) => Promise<boolean>; onOpen?: (fn: ((go: string) => void) | null) => void };
  update?: { status?: () => Promise<unknown>; restart?: () => Promise<'restart' | 'busy' | 'nothing'> };
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

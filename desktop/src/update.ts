// How the application keeps itself up to date (Desktop_App_Plan.md 7.4, phase D3; decision D-6). It reads
// `latest.yml` from the public bucket of the comms-hub project, downloads a newer installer in the
// background and checks its SHA-512 against that file, then installs it when the application quits, or at
// once on «إعادة التشغيل للتحديث». Never during an export: restarting is refused while a window is busy.
// It looks when the application starts and every four hours while it is open; nothing is scheduled in the
// site. The feed is compiled in like the address list. Pure; updater.ts wires it to electron-updater.

/** The release feed: windows-x64/ in the public bucket desktop-releases of the comms-hub project. */
export const PRODUCTION_FEED = 'https://hrghmioxvgkjpnydrxrk.supabase.co/storage/v1/object/public/desktop-releases/windows-x64';

export const FIRST_CHECK_MS = 10_000;
export const CHECK_EVERY_MS = 4 * 3600_000;

export type UpdateState = 'idle' | 'checking' | 'none' | 'downloading' | 'ready' | 'error';
export type UpdateStatus = { state: UpdateState; version: string | null; percent: number | null };
export type UpdateEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string }
  | { type: 'none' }
  | { type: 'progress'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error' };

export const START: UpdateStatus = Object.freeze({ state: 'idle', version: null, percent: null });

/** The status after an updater event. A downloaded update is never forgotten by a later check or error. */
export function nextStatus(s: UpdateStatus, e: UpdateEvent): UpdateStatus {
  if (s.state === 'ready' && e.type !== 'downloaded') return s;
  switch (e.type) {
    case 'checking':
      return { state: 'checking', version: null, percent: null };
    case 'available':
      return { state: 'downloading', version: e.version, percent: 0 };
    case 'none':
      return { state: 'none', version: null, percent: null };
    case 'progress':
      return { state: 'downloading', version: s.version, percent: Math.max(0, Math.min(100, Math.round(e.percent))) };
    case 'downloaded':
      return { state: 'ready', version: e.version, percent: 100 };
    case 'error':
      return { state: 'error', version: s.version, percent: null };
  }
}

/** «إعادة التشغيل للتحديث»: only with an update ready, and never while a window is busy. */
export function restartAction(s: UpdateStatus, busy: boolean): 'restart' | 'busy' | 'nothing' {
  if (s.state !== 'ready') return 'nothing';
  return busy ? 'busy' : 'restart';
}

/**
 * A feed a build may carry: the production bucket over https, or, for the update check's own package
 * only, a server on this laptop (qa/desktop-update.cjs). Nothing else.
 */
export function feedAllowed(url: string, qa: boolean): boolean {
  if (url === PRODUCTION_FEED) return true;
  if (!qa) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' && u.hostname === '127.0.0.1' && !u.username && !u.password;
  } catch {
    return false;
  }
}

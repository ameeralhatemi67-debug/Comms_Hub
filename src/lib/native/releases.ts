// The applications' releases, as the site sees them. The desktop application (Desktop_App_Plan.md 6 and
// 7.4, phase D3; decision D-6) updates itself from its public bucket; the site reads its latest.yml only to
// offer the download on «الحساب» and to say when a newer version exists. The Android application
// (Android_Build_Plan.md A3) reads latest.json from its own public bucket, and the site shows the update
// window from the same file. The oldest application of each kind the site still works with is fixed here,
// with the site: when a change of the site needs a newer bridge, it is raised and an older application is
// asked to update. Pure.
import { compareVersions, type Platform } from './index.ts';

/** The same address as PRODUCTION_FEED in desktop/src/update.ts (tests/native.test.mjs holds them equal). */
export const DESKTOP_FEED = 'https://hrghmioxvgkjpnydrxrk.supabase.co/storage/v1/object/public/desktop-releases/windows-x64';

/** The oldest application the site works with fully: 0.2.0 brought the notices and the export's keep-awake. */
export const MINIMUM_DESKTOP = '0.2.0';

export type Release = { version: string; file: string; size: number | null; date: string | null };

const field = (text: string, name: string) => new RegExp(`^\\s*-?\\s*${name}:\\s*['"]?([^'"\\r\\n]+?)['"]?\\s*$`, 'm').exec(text)?.[1] ?? null;

/** latest.yml as electron-builder writes it, the fields the page needs; null for anything else. */
export function parseLatest(text: string): Release | null {
  if (typeof text !== 'string' || text.length > 20_000) return null;
  const version = field(text, 'version');
  const file = field(text, 'url') ?? field(text, 'path');
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) return null;
  if (!file || !/^[\w.-]+\.exe$/.test(file)) return null;
  const size = Number(field(text, 'size'));
  const date = field(text, 'releaseDate');
  return { version, file, size: Number.isSafeInteger(size) && size > 0 ? size : null, date: date && !Number.isNaN(Date.parse(date)) ? date : null };
}

export const downloadUrl = (r: Release) => `${DESKTOP_FEED}/${encodeURIComponent(r.file)}`;

/** An application older than the site needs: the desktop's unless another platform is named. */
export const tooOld = (version: string | null, platform: Platform = 'desktop') => {
  const minimum = platform === 'desktop' ? MINIMUM_DESKTOP : platform === 'android' ? MINIMUM_ANDROID : null;
  return !!version && !!minimum && compareVersions(version, minimum) < 0;
};

// --- the Android application (Android_Build_Plan.md A3) ---------------------------------------------

/** The same address as the feed compiled into mobile/ (tests/native.test.mjs holds them equal). */
export const ANDROID_FEED = 'https://hrghmioxvgkjpnydrxrk.supabase.co/storage/v1/object/public/android-releases/android';

/** The oldest Android application the site works with fully. */
export const MINIMUM_ANDROID = '0.1.0';

export type AndroidRelease = {
  version: string;
  /** Android's own whole number for the version, which only grows. */
  code: number;
  file: string;
  size: number;
  sha256: string;
  /** The oldest version this release still lets run without updating, or null for no such floor. */
  minimum: string | null;
  /** Short lines of «ما الجديد», in Arabic, as the owner wrote them. */
  notes: string[];
  date: string | null;
};

const SEMVER = /^\d+\.\d+\.\d+$/;

/** latest.json as mobile/README.md tells the owner to write it, the fields the page needs; null for anything else. */
export function parseAndroidLatest(text: string): AndroidRelease | null {
  if (typeof text !== 'string' || text.length > 20_000) return null;
  let v: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    v = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  const { version, code, file, size, sha256, minimum, notes, date } = v;
  if (typeof version !== 'string' || !SEMVER.test(version)) return null;
  if (typeof code !== 'number' || !Number.isSafeInteger(code) || code < 1) return null;
  if (typeof file !== 'string' || !/^[\w.-]+\.apk$/.test(file) || file.startsWith('.')) return null;
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 1 || size > 300_000_000) return null;
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) return null;
  if (minimum !== undefined && minimum !== null && (typeof minimum !== 'string' || !SEMVER.test(minimum))) return null;
  const lines = Array.isArray(notes) ? notes.filter((n): n is string => typeof n === 'string').map((n) => n.trim().slice(0, 200)).filter(Boolean).slice(0, 8) : [];
  return {
    version,
    code,
    file,
    size,
    sha256,
    minimum: typeof minimum === 'string' ? minimum : null,
    notes: lines,
    date: typeof date === 'string' && !Number.isNaN(Date.parse(date)) ? date : null,
  };
}

export const apkDownloadUrl = (r: AndroidRelease) => `${ANDROID_FEED}/${encodeURIComponent(r.file)}`;

/**
 * Whether an Android application must update before going on: older than the site needs, or older than
 * the floor the newest release sets. Optional otherwise.
 */
export function apkMustUpdate(version: string | null, latest: AndroidRelease | null): boolean {
  if (!version) return false;
  if (tooOld(version, 'android')) return true;
  return !!latest?.minimum && compareVersions(version, latest.minimum) < 0;
}

/** What the person's own device can run: the application is built for Windows (x64) only, for now. */
export type DesktopFit = 'windows' | 'mac' | 'linux' | 'phone' | 'unknown';

/** Reads a browser's user agent, nothing else; an empty or odd one is 'unknown', which still offers the download. */
export function desktopFit(userAgent: string | null | undefined): DesktopFit {
  const ua = typeof userAgent === 'string' ? userAgent.slice(0, 500) : '';
  if (/android|iphone|ipad|ipod/i.test(ua)) return 'phone';
  if (/windows nt/i.test(ua)) return 'windows';
  if (/macintosh|mac os x/i.test(ua)) return 'mac';
  if (/linux|x11|cros/i.test(ua)) return 'linux';
  return 'unknown';
}

/** The line shown beside the download for a device the application does not run on yet; null where it does. */
export function desktopFitNote(fit: DesktopFit): string | null {
  switch (fit) {
    case 'mac':
    case 'linux':
      return 'هذا الحاسوب لا يعمل بنظام Windows، ولذلك لا يعمل عليه التطبيق الآن. ما زال المركز يعمل كاملًا في المتصفح.';
    case 'phone':
      return 'هذا جهاز هاتف. تطبيق سطح المكتب للحاسوب فقط، وتطبيق الهاتف في البطاقة الخاصة به.';
    default:
      return null;
  }
}

/** A newer release than the one running. */
export const newer =(r: Release | null, version: string | null) => !!r && !!version && compareVersions(r.version, version) > 0;

export type UpdateView = { state: 'idle' | 'checking' | 'none' | 'downloading' | 'ready' | 'error'; version: string | null; percent: number | null };

/** The application's own update state, said in Arabic. */
export function updateLine(u: UpdateView): string {
  switch (u.state) {
    case 'checking':
      return 'جارٍ البحث عن تحديث…';
    case 'none':
      return 'هذا أحدث إصدار.';
    case 'downloading':
      return `جارٍ تنزيل الإصدار ${u.version ?? ''}${u.percent !== null ? ` (${u.percent}٪)` : ''}…`;
    case 'ready':
      return `الإصدار ${u.version ?? ''} جاهز، ويُثبَّت عند إنهاء التطبيق.`;
    case 'error':
      return 'تعذّر البحث عن تحديث الآن، ويُعاد البحث لاحقاً.';
    default:
      return 'يبحث التطبيق عن تحديث عند بدئه وكل أربع ساعات.';
  }
}

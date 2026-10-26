// The desktop application's releases, as the site sees them (Desktop_App_Plan.md 6 and 7.4, phase D3;
// decision D-6). The application updates itself from the same public bucket; the site reads its
// latest.yml only to offer the download on «الحساب» and to say when a newer version exists. The oldest
// application the site still works with is fixed here, with the site: when a change of the site needs a
// newer bridge, this is raised and an older application is asked to update. Pure.
import { compareVersions } from './index.ts';

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

/** An application older than the site needs. */
export const tooOld = (version: string | null) => !!version && compareVersions(version, MINIMUM_DESKTOP) < 0;

/** A newer release than the one running. */
export const newer = (r: Release | null, version: string | null) => !!r && !!version && compareVersions(r.version, version) > 0;

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

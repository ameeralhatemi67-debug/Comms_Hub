// The Android application's update as the site shows it (MVP_draft.md 64.1; Android_Build_Plan.md A3). The
// application reads latest.json from its own feed and reports it with where its update stands
// (`appUpdate.status`); the site reads the release with parseAndroidLatest and decides which window, if any,
// to show: an update that must be installed before going on, a newer release the person may take now or
// later, or what changed after an update. Remembering «لاحقاً» and the version already seen is the page's,
// on this phone only. Pure.
import { compareVersions } from './index.ts';
import { apkMustUpdate, parseAndroidLatest, type AndroidRelease } from './releases.ts';

export type ApkState = 'idle' | 'downloading' | 'verifying' | 'installing' | 'failed';

/** What the application reports through appUpdate.status(). */
export type ApkStatus = {
  state: ApkState;
  percent: number | null;
  version: string | null;
  why: string | null;
  current: string;
  /** latest.json as the application last read it, or null before it could. */
  feed: string | null;
  /** Whether Android already lets this application install its updates. */
  installAllowed: boolean;
};

const STATES: readonly ApkState[] = ['idle', 'downloading', 'verifying', 'installing', 'failed'];
const SEMVER = /^\d+\.\d+\.\d+$/;

/** The application's report, if it is that shape; null for anything else. */
export function readApkStatus(value: unknown): ApkStatus | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.state !== 'string' || !STATES.includes(v.state as ApkState)) return null;
  if (typeof v.current !== 'string' || !SEMVER.test(v.current)) return null;
  const percent = typeof v.percent === 'number' && Number.isFinite(v.percent) ? Math.max(0, Math.min(100, Math.round(v.percent))) : null;
  return {
    state: v.state as ApkState,
    percent,
    version: typeof v.version === 'string' && SEMVER.test(v.version) ? v.version : null,
    why: typeof v.why === 'string' && /^[a-z]{1,20}$/.test(v.why) ? v.why : null,
    current: v.current,
    feed: typeof v.feed === 'string' && v.feed.length <= 20_000 ? v.feed : null,
    installAllowed: v.installAllowed === true,
  };
}

/** The newest release the application read, if it is newer than the one running. */
export function newerRelease(status: ApkStatus | null): AndroidRelease | null {
  const latest = status?.feed ? parseAndroidLatest(status.feed) : null;
  return latest && compareVersions(latest.version, status!.current) > 0 ? latest : null;
}

/** «لاحقاً» hides a release's window for a day. */
export const LATER_MS = 24 * 60 * 60 * 1000;

export type Later = { version: string; until: number };

export type ApkWindow =
  | { kind: 'none' }
  | { kind: 'required'; release: AndroidRelease | null }
  | { kind: 'optional'; release: AndroidRelease }
  | { kind: 'whatsNew'; version: string; notes: string[] };

/**
 * Which window, if any. An application the site or the newest release no longer works with must update
 * first. After an update, what changed is said once (never at the first opening after installing). A newer
 * release is offered once per version, and again a day after «لاحقاً».
 */
export function apkWindow(input: { status: ApkStatus | null; now: number; later: Later | null; seen: string | null }): ApkWindow {
  const { status, now, later, seen } = input;
  if (!status) return { kind: 'none' };
  const latest = status.feed ? parseAndroidLatest(status.feed) : null;
  const newer = newerRelease(status);
  if (apkMustUpdate(status.current, latest)) return { kind: 'required', release: newer };
  if (seen && SEMVER.test(seen) && compareVersions(status.current, seen) > 0) {
    return { kind: 'whatsNew', version: status.current, notes: latest && latest.version === status.current ? latest.notes : [] };
  }
  if (newer && !(later && later.version === newer.version && now < later.until)) return { kind: 'optional', release: newer };
  return { kind: 'none' };
}

/** Why an update stopped, in Arabic. */
export function apkWhy(why: string | null): string {
  switch (why) {
    case 'network':
      return 'تعذّر تنزيل التحديث. تحقّق من اتصالك ثم أعد المحاولة.';
    case 'mismatch':
      return 'الملف الذي نُزِّل لا يطابق الإصدار المعلن، فلم يُثبَّت.';
    case 'signature':
    case 'package':
      return 'الملف ليس من هذا التطبيق أو ليس موقّعاً بمفتاحه، فلم يُثبَّت.';
    case 'version':
      return 'الملف ليس أحدث من الإصدار المثبّت، فلم يُثبَّت.';
    case 'space':
      return 'لا توجد مساحة كافية في الهاتف لتنزيل التحديث.';
    case 'cancelled':
      return 'أُلغي التثبيت. يمكنك المحاولة من جديد.';
    default:
      return 'تعذّر تثبيت التحديث. حاول مرة أخرى.';
  }
}

/** Where the application's update stands, in Arabic; null when there is nothing to say. */
export function apkLine(status: ApkStatus | null): string | null {
  if (!status) return null;
  switch (status.state) {
    case 'downloading':
      return `جارٍ تنزيل الإصدار ${status.version ?? ''}${status.percent !== null ? ` (${status.percent}٪)` : ''}…`;
    case 'verifying':
      return 'جارٍ التحقق من الملف…';
    case 'installing':
      return 'يطلب Android تأكيد التثبيت: اختر «تحديث» أو «تثبيت». وقد يقترح Google Play Protect فحص التطبيق لأنه لم يره من قبل، فاختر الفحص ثم أكمل التثبيت.';
    case 'failed':
      return apkWhy(status.why);
    default:
      return null;
  }
}

/** What the application answered to «تحديث الآن», in Arabic; null when the progress line says it. */
export function apkStartAnswer(result: string): string | null {
  switch (result) {
    case 'started':
      return null;
    case 'permission':
      return 'فُتحت إعدادات Android: فعّل «السماح من هذا المصدر» لهذا التطبيق، ثم ارجع واضغط «تحديث الآن» مرة أخرى.';
    case 'busy':
      return 'يجري تحديث الآن.';
    default:
      return 'تعذّر بدء التحديث. حاول مرة أخرى.';
  }
}

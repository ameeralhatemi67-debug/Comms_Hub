// Google Play's own updates as the site shows them (MVP_draft.md 64.6; Android_Build_Plan.md A8). Google Play's
// copy of the application asks Play whether there is an update and reports what Play says (`playUpdate.status`);
// the site decides which window, if any, to show, in the same update window as the APK channel's (app-update.ts):
// an update that must be installed before going on, a downloaded update waiting for a restart, a newer release the
// person may take now or later, or what changed after an update. Play's own window then asks the person; the site
// never installs anything. Play names a release by Android's whole number only, and the version is read back from it
// by the rule every build follows (mobile/android/app/build.gradle: x.y.z gives x*10000 + y*100 + z). Pure.
import { compareVersions } from './index.ts';
import { tooOld } from './releases.ts';

export type PlayState = 'checking' | 'unavailable' | 'none' | 'available' | 'pending' | 'downloading' | 'downloaded' | 'installing';

/** What Google Play's copy reports through playUpdate.status() (PlayUpdate.java). */
export type PlayStatus = {
  state: PlayState;
  /** Why the last update stopped: Play's window closed without consent, the download was cancelled, or it failed. */
  why: 'declined' | 'cancelled' | 'failed' | null;
  current: string;
  /** Android's whole number of the release Play offers, or null when it offers none. */
  code: number | null;
  percent: number | null;
  /** Play's priority of the release, 0 to 5, set by the owner through Play's Developer API. */
  priority: number;
  staleDays: number | null;
  flexible: boolean;
  immediate: boolean;
};

const STATES: readonly PlayState[] = ['checking', 'unavailable', 'none', 'available', 'pending', 'downloading', 'downloaded', 'installing'];
const WHYS = ['declined', 'cancelled', 'failed'] as const;
const SEMVER = /^\d+\.\d+\.\d+$/;

/** The application's report, if it is that shape; null for anything else. */
export function readPlayStatus(value: unknown): PlayStatus | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.state !== 'string' || !STATES.includes(v.state as PlayState)) return null;
  if (typeof v.current !== 'string' || !SEMVER.test(v.current)) return null;
  const whole = (x: unknown, max: number) => (typeof x === 'number' && Number.isSafeInteger(x) && x >= 0 && x <= max ? x : null);
  return {
    state: v.state as PlayState,
    why: WHYS.includes(v.why as (typeof WHYS)[number]) ? (v.why as PlayStatus['why']) : null,
    current: v.current,
    code: whole(v.code, 2_100_000_000) || null,
    percent: whole(v.percent, 100),
    priority: whole(v.priority, 5) ?? 0,
    staleDays: whole(v.staleDays, 100_000),
    flexible: v.flexible === true,
    immediate: v.immediate === true,
  };
}

/** The version a whole number stands for, by the builds' rule; null for a number no build makes. */
export function versionOfCode(code: number | null): string | null {
  if (!code || !Number.isSafeInteger(code) || code < 1 || code > 99_999_999) return null;
  return `${Math.floor(code / 10000)}.${Math.floor(code / 100) % 100}.${code % 100}`;
}

/** A release Play marks with this priority or higher must be installed before going on (Play's own guidance). */
export const PLAY_REQUIRED_PRIORITY = 4;

/** Whether the application must update first: older than the site needs, or a release Play marks as required. */
export function playMustUpdate(status: PlayStatus | null): boolean {
  if (!status) return false;
  if (tooOld(status.current, 'android')) return true;
  return status.code !== null && status.priority >= PLAY_REQUIRED_PRIORITY;
}

/**
 * «لاحقاً» hides a release's window for a day, as in the APK channel: the offer and the restart each their own,
 * so taking the offer (Play's window then asks) never hides the restart once Play has downloaded it.
 */
export type PlayLater = { code: number; until: number; kind: 'offer' | 'restart' };

export type PlayWindow =
  | { kind: 'none' }
  /** `can`: what «تحديث الآن» does, or null when Play offers no way now. */
  | { kind: 'required'; version: string | null; can: 'restart' | 'immediate' | null }
  | { kind: 'whatsNew'; version: string }
  | { kind: 'restart'; version: string | null; code: number | null }
  | { kind: 'optional'; version: string | null; code: number };

/**
 * Which window, if any. An application that must update shows a window that cannot be closed: Play's own full
 * screen through «تحديث الآن», or the restart into an update already downloaded. After an update, what changed is
 * said once (never at the first opening after installing). A downloaded update asks for the restart, and a newer
 * release is offered once per release, each again a day after «لاحقاً». While Play downloads, no window: the
 * download goes on as the person works.
 */
export function playWindow(input: { status: PlayStatus | null; now: number; later: PlayLater | null; seen: string | null }): PlayWindow {
  const { status, now, later, seen } = input;
  if (!status) return { kind: 'none' };
  const version = versionOfCode(status.code);
  if (playMustUpdate(status)) {
    return { kind: 'required', version, can: status.state === 'downloaded' ? 'restart' : status.immediate && status.state === 'available' ? 'immediate' : null };
  }
  if (seen && SEMVER.test(seen) && compareVersions(status.current, seen) > 0) return { kind: 'whatsNew', version: status.current };
  const putOff = (code: number | null, kind: PlayLater['kind']) => !!later && later.kind === kind && later.code === code && now < later.until;
  if (status.state === 'downloaded' && !putOff(status.code, 'restart')) return { kind: 'restart', version, code: status.code };
  if (status.state === 'available' && status.flexible && status.code !== null && !putOff(status.code, 'offer')) return { kind: 'optional', version, code: status.code };
  return { kind: 'none' };
}

/** Why an update stopped, in Arabic. */
export function playWhy(why: PlayStatus['why']): string | null {
  switch (why) {
    case 'declined':
      return 'لم يُثبَّت التحديث: أُغلقت نافذة Google Play دون موافقة.';
    case 'cancelled':
      return 'أُلغي تنزيل التحديث. يمكنك المحاولة من جديد.';
    case 'failed':
      return 'تعذّر التحديث من Google Play. حاول مرة أخرى.';
    default:
      return null;
  }
}

/** Where the update stands, in Arabic; null when there is nothing to say. */
export function playLine(status: PlayStatus | null): string | null {
  if (!status) return null;
  switch (status.state) {
    case 'pending':
      return 'ينتظر تنزيل التحديث من Google Play…';
    case 'downloading':
      return `جارٍ تنزيل التحديث من Google Play${status.percent !== null ? ` (${status.percent}٪)` : ''}…`;
    case 'downloaded':
      return 'نُزِّل التحديث، ويكتمل حين تعيد تشغيل التطبيق.';
    case 'installing':
      return 'جارٍ تثبيت التحديث من Google Play، ثم يُفتح التطبيق من جديد.';
    default:
      return playWhy(status.why);
  }
}

/** What «تطبيق الهاتف» says when there is no update to take. */
export function playIdleLine(status: PlayStatus | null): string {
  switch (status?.state) {
    case 'none':
      return 'هذا أحدث إصدار في Google Play.';
    case 'unavailable':
      return 'يحدّث Google Play هذا التطبيق، وتعذّر سؤاله عن تحديث الآن.';
    default:
      return 'يسأل التطبيق Google Play عن تحديث عند فتحه، وعند عودتك إليه بعد أربع ساعات أو أكثر.';
  }
}

/** What the application answered to «تحديث الآن» or «إعادة التشغيل الآن», in Arabic; null when the line says it. */
export function playStartAnswer(result: string): string | null {
  switch (result) {
    case 'started':
      return null;
    case 'busy':
      return 'يجري تحديث الآن.';
    case 'uploading':
      return 'يُرفع ملف في الخلفية الآن، فيكتمل التحديث بعد انتهاء الرفع.';
    case 'unavailable':
      return 'لا يتوفر تحديث من Google Play الآن.';
    case 'nothing':
      return 'لا يوجد تحديث جاهز للتثبيت.';
    default:
      return 'تعذّر بدء التحديث. حاول مرة أخرى.';
  }
}

/** Play is at work: the buttons wait. */
export const playWorking = (s: PlayStatus | null) => !!s && (s.state === 'pending' || s.state === 'downloading' || s.state === 'installing');

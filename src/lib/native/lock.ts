// The application lock inside the Android application (MVP_draft.md 64.4; Android_Build_Plan.md A6, decision
// M-12): off by default, offered once after signing in, turned on or off on «الحساب». The application asks for the
// fingerprint or the phone's screen lock when it opens and after five minutes away; Android asks again to turn it on
// or off. In a browser and in the desktop application nothing of this exists. Plain TypeScript, tested in
// tests/native.test.mjs.
import { native } from './index.ts';
import type { PushState } from './push.ts';

export type LockState = { available: boolean; on: boolean };

/** Whether the phone can lock the application, and whether it does; null outside the application. */
export async function lockState(): Promise<LockState | null> {
  const n = native();
  if (!n.has('lock')) return null;
  try {
    const s = (await n.raw!.lock!.state!()) as Partial<LockState> | null;
    return s && typeof s.available === 'boolean' && typeof s.on === 'boolean' ? { available: s.available, on: s.on } : null;
  } catch {
    return null;
  }
}

/** Turns the lock on or off after Android has asked the person; true when it changed. */
export async function setLock(on: boolean): Promise<boolean> {
  const n = native();
  if (!n.has('lock')) return false;
  try {
    return (await n.raw!.lock!.set!(on)) === true;
  } catch {
    return false;
  }
}

/**
 * The offer once after signing in: the phone can lock, the lock is off, it was not offered before, and the
 * question about notices is settled first (one question at a time).
 */
export function shouldOfferLock(state: LockState | null, offered: boolean, push: PushState | null): boolean {
  return !!state && state.available && !state.on && !offered && push !== 'prompt';
}

export const LOCK = Object.freeze({
  title: 'قفل التطبيق',
  offer: 'احمِ المركز على هذا الهاتف: يطلب التطبيق بصمتك أو قفل الشاشة عند فتحه، وبعد خمس دقائق من تركه. يمكنك تغيير ذلك من «الحساب».',
  turnOn: 'تشغيل القفل',
  turnOff: 'إيقاف القفل',
  later: 'ليس الآن',
  on: 'القفل يعمل: يطلب التطبيق بصمتك أو قفل الشاشة عند فتحه، وبعد خمس دقائق من تركه.',
  off: 'القفل متوقف. شغّله ليطلب التطبيق بصمتك أو قفل الشاشة عند فتحه، وبعد خمس دقائق من تركه.',
  unavailable: 'لا يوجد قفل شاشة ولا بصمة على هذا الهاتف. اضبط أحدهما في إعدادات Android ثم ارجع إلى هنا.',
  unchanged: 'لم يتغير القفل: لم يُؤكَّد ببصمتك أو بقفل الشاشة.',
  turnedOn: 'شُغّل قفل التطبيق.',
  turnedOff: 'أُوقف قفل التطبيق.',
});

// What «التخزين على هذا الجهاز» says of the light copies the desktop application makes while the laptop is free (D12,
// MVP_draft.md 63.9, Desktop_Power_Ideas.md P-08 and P-30): how many are ready, and why the rest wait. Nothing in a
// browser or an older application, where there is no such queue. Pure; tested in tests/native-power.test.mjs.
import type { CopyHold, NativeQueueState } from './index.ts';

/** Why the copies wait, said after «والباقي». */
export const COPY_WAITS: Readonly<Record<CopyHold, string>> = Object.freeze({
  battery: 'ينتظر التوصيل بالكهرباء',
  throttled: 'ينتظر حتى يعود المعالج إلى سرعته',
  export: 'ينتظر انتهاء التصدير',
  upload: 'ينتظر انتهاء الرفع',
  measuring: 'ينتظر انتهاء القياس',
  playing: 'ينتظر انتهاء التشغيل',
  scrubbing: 'ينتظر انتهاء التمرير',
  asked: 'ينتظر النسخة التي طلبتها',
  input: 'ينتظر لحظات من التوقف عن العمل',
});

export function copyQueueLine(s: NativeQueueState | null): string | null {
  if (!s) return null;
  const count = (...states: string[]) => s.items.filter((i) => states.includes(i.state)).length;
  const ready = count('ready');
  const left = count('probing', 'waiting', 'running', 'paused');
  if (!ready && !left) return null;
  if (!left) return `النسخ الخفيفة للمعاينة جاهزة على هذا الجهاز: ${ready}.`;
  const head = `يُنشئ التطبيق نسخاً خفيفة للمعاينة حين يكون الجهاز متفرغاً: ${ready} جاهزة من ${ready + left}`;
  if (s.hold) return `${head}، والباقي ${COPY_WAITS[s.hold]}.`;
  const making = count('running');
  return making ? `${head}، وتُنشأ ${making} الآن.` : `${head}.`;
}

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

/** «استيراد من بطاقة الكاميرا» (D12, MVP_draft.md 63.9): what is said of a card's recordings and their copy. */
export const CARD_WORDS = Object.freeze({
  action: 'استيراد من بطاقة الكاميرا',
  hint: 'تُنسخ الملفات ويُتحقَّق منها قبل استعمالها.',
  copy: 'نسخ الملفات والتحقق منها',
  cancel: 'إلغاء',
  none: 'لا توجد في هذا المجلد ملفات فيديو أو صوت أو صور يأخذها الاستوديو.',
  joined: 'تسجيل واحد من أجزاء',
});

const CARD_WHY: Readonly<Record<string, string>> = Object.freeze({
  changed: 'تغيّر الملف أثناء نسخه',
  mismatch: 'لم تطابق النسخة الأصل عند التحقق',
  gone: 'لم يعد الملف في البطاقة (أُخرجت البطاقة؟)',
  space: 'لا تتسع مساحة القرص',
  cancelled: 'أُلغي',
  inside: 'لا تُنسخ الملفات إلى البطاقة نفسها',
  failed: 'تعذّر نسخه',
});
export const cardWhy = (why: string) => CARD_WHY[why] ?? CARD_WHY.failed;

/** What a card holds, in one line. */
export function cardLine(label: string, n: number, bytes: string): string {
  return `في «${label}»: ${n} ${n === 1 ? 'ملف' : n === 2 ? 'ملفان' : n <= 10 ? 'ملفات' : 'ملفاً'} (${bytes}).`;
}

/** After the copy: how many are copied and verified, where, and what to do next. */
export function cardDone(copied: number, folder: string): string {
  if (!copied) return 'لم يُنسخ أي ملف.';
  return `نُسخ ${copied} ${copied === 1 ? 'ملف' : copied === 2 ? 'ملفان' : copied <= 10 ? 'ملفات' : 'ملفاً'} إلى «${folder}» وتُحقِّق منها. أضفها إلى المشروع من «هذا الجهاز»، وتُنشأ نسخها الخفيفة حين يكون الجهاز متفرغاً.`;
}

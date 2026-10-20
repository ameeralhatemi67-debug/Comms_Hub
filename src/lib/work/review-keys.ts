// The review screen's keys and the player's arithmetic (MVP_draft.md 62.13). The keys are matched by the
// physical key, as in the studio (`comboOf`), so an Arabic keyboard works the same. Approval keys are held as
// long as a long press (hold.ts `keyHoldStart`); the others act at once. Pure.
import { comboLabel, comboOf, type KeyLike } from '../studio/shortcuts.ts';

export type ReviewKey = { id: string; combos: string[]; label: string; group: 'player' | 'decide' | 'page' };

export const REVIEW_KEYS: ReviewKey[] = [
  { id: 'play', combos: ['Space', 'KeyK'], label: 'تشغيل وإيقاف', group: 'player' },
  { id: 'back', combos: ['KeyJ'], label: 'رجوع ثانية', group: 'player' },
  { id: 'forward', combos: ['KeyL'], label: 'تقدم ثانية', group: 'player' },
  { id: 'frame-back', combos: ['ArrowLeft'], label: 'إطار للخلف', group: 'player' },
  { id: 'frame-forward', combos: ['ArrowRight'], label: 'إطار للأمام', group: 'player' },
  { id: 'safe', combos: ['Shift+KeyG'], label: 'مناطق Reels الآمنة', group: 'player' },
  { id: 'note', combos: ['KeyN'], label: 'ملاحظة عند هذا الإطار', group: 'player' },
  { id: 'changes', combos: ['KeyR'], label: 'طلب تعديل بملاحظات هذا الإصدار', group: 'decide' },
  { id: 'approve', combos: ['KeyA'], label: 'اعتماد الملف المعروض بإصداره (اضغط مطولاً)', group: 'decide' },
  { id: 'approve-all', combos: ['Shift+KeyA'], label: 'اعتماد الكل (اضغط مطولاً)', group: 'decide' },
  { id: 'next', combos: ['BracketRight'], label: 'العمل التالي في الانتظار', group: 'page' },
  { id: 'prev', combos: ['BracketLeft'], label: 'العمل السابق في الانتظار', group: 'page' },
  { id: 'keys', combos: ['Shift+Slash'], label: 'قائمة المفاتيح', group: 'page' },
];

export const REVIEW_GROUPS: Record<ReviewKey['group'], string> = { player: 'المشغّل', decide: 'القرار', page: 'الصفحة' };

/** The review key a press means, or null. */
export function matchReviewKey(e: KeyLike): string | null {
  const c = comboOf(e);
  return REVIEW_KEYS.find((k) => k.combos.includes(c))?.id ?? null;
}

/** How a key is written for people: «Shift+A», «?», «]». */
export const reviewKeyLabel = (id: string) => {
  const k = REVIEW_KEYS.find((x) => x.id === id);
  return k ? k.combos.map(comboLabel).join(' أو ') : '';
};

/** A frame's length in seconds: measured from two shown frames when known, else 1/30. */
export const frameLength = (measured: number | null) => (measured && measured > 0.004 && measured < 0.2 ? measured : 1 / 30);

/** A time on the player, «دقيقة:ثانية.عُشر»: 01:05.2. */
export function playerTime(sec: number): string {
  const s = Math.max(0, sec);
  // a seek lands a hair before the frame asked for; a thousandth of a tenth keeps 2.0 from showing as 1.9
  const tenths = Math.floor(s * 10 + 1e-3);
  const m = Math.floor(tenths / 600);
  const rest = tenths - m * 600;
  return `${String(m).padStart(2, '0')}:${String(Math.floor(rest / 10)).padStart(2, '0')}.${rest % 10}`;
}

/** Where the picture sits inside a video element that keeps its proportions (object-fit: contain). */
export function contentBox(boxW: number, boxH: number, vidW: number, vidH: number): { x: number; y: number; w: number; h: number } {
  if (!vidW || !vidH || !boxW || !boxH) return { x: 0, y: 0, w: boxW, h: boxH };
  const k = Math.min(boxW / vidW, boxH / vidH);
  const w = vidW * k;
  const h = vidH * k;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}

/** A point on the element as a fraction of the picture, or null outside it. */
export function pictureFraction(px: number, py: number, box: { x: number; y: number; w: number; h: number }): { x: number; y: number } {
  return { x: (px - box.x) / box.w, y: (py - box.y) / box.h };
}

/** A picture in the shape of Reels (9:16), where the safe zones mean something. */
export const isReels = (w: number, h: number) => !!w && !!h && Math.abs(w / h - 9 / 16) < 0.02;

/** Where a note sits on the strip under the player, as a percentage of the length. */
export const markAt = (ms: number, durationSec: number) => (durationSec > 0 ? Math.max(0, Math.min(100, (ms / 1000 / durationSec) * 100)) : 0);

/** The address of the review screen at a moment of a version of a file (Phase 12 shares it). */
export function reviewHref(work: string, asset: string | null, sec: number, version: number | null): string {
  const q = new URLSearchParams();
  if (asset) q.set('a', asset);
  q.set('t', String(Math.round(sec * 10) / 10));
  if (version) q.set('v', String(version));
  return `/approvals/${work}?${q.toString()}`;
}

/** The moment and version an address asks for (`?t=12.4&v=2&a=<asset>`), or null. */
export function reviewStart(params: { get: (k: string) => string | null }): { t: number; v: number | null; a: string | null } | null {
  const t = Number(params.get('t'));
  if (!params.get('t') || !Number.isFinite(t) || t < 0) return null;
  const v = Number(params.get('v'));
  return { t, v: Number.isInteger(v) && v >= 1 ? v : null, a: params.get('a') || null };
}

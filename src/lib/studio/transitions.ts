// Transitions between clips and entry and exit movements of a clip (MVP_draft.md 62.3). Pure maths:
// what a clip looks like at a moment (its opacity, offset, size, turn, blur and the part of it shown),
// used alike by the preview, the export and the small moving pictures of the effects window, so all
// three show the same thing. Distances are canvas pixels; time is microseconds.
//
//   - A transition belongs to the later of two clips that meet on a track (the clips overlap by its
//     length, timeline.ts). The incoming clip is drawn over the outgoing one; both may move.
//   - An entry or exit movement belongs to one clip, at its start or its end. A cross-fade and the plain
//     fades of a clip are older (fadeIn, fadeOut, transition kind «fade») and stay as they were.
import { US, type Clip, type Micros, type Track } from './schema.ts';

export const TRANSITION_KINDS = [
  'fade', 'dip-black', 'dip-white', 'wipe-left', 'wipe-right', 'wipe-up', 'wipe-down', 'slide-left', 'slide-right',
  'push-left', 'push-right', 'push-up', 'push-down', 'zoom', 'iris', 'blur',
] as const;
export type TransitionKind = (typeof TRANSITION_KINDS)[number];

export const TRANSITIONS: { kind: TransitionKind; label: string; hint: string }[] = [
  { kind: 'fade', label: 'مزج متداخل', hint: 'يظهر المقطع الثاني فوق الأول تدريجياً.' },
  { kind: 'dip-black', label: 'عبور بالأسود', hint: 'يختفي الأول إلى الأسود ثم يظهر الثاني منه.' },
  { kind: 'dip-white', label: 'عبور بالأبيض', hint: 'يختفي الأول إلى الأبيض ثم يظهر الثاني منه.' },
  { kind: 'wipe-left', label: 'مسح من اليمين', hint: 'يكشف الثاني من الحافة اليمنى.' },
  { kind: 'wipe-right', label: 'مسح من اليسار', hint: 'يكشف الثاني من الحافة اليسرى.' },
  { kind: 'wipe-up', label: 'مسح من الأسفل', hint: 'يكشف الثاني من الحافة السفلى.' },
  { kind: 'wipe-down', label: 'مسح من الأعلى', hint: 'يكشف الثاني من الحافة العليا.' },
  { kind: 'slide-left', label: 'انزلاق من اليمين', hint: 'ينزلق الثاني فوق الأول من اليمين.' },
  { kind: 'slide-right', label: 'انزلاق من اليسار', hint: 'ينزلق الثاني فوق الأول من اليسار.' },
  { kind: 'push-left', label: 'دفع من اليمين', hint: 'يدفع الثاني الأول نحو اليسار.' },
  { kind: 'push-right', label: 'دفع من اليسار', hint: 'يدفع الثاني الأول نحو اليمين.' },
  { kind: 'push-up', label: 'دفع من الأسفل', hint: 'يدفع الثاني الأول إلى الأعلى، كما في القصص.' },
  { kind: 'push-down', label: 'دفع من الأعلى', hint: 'يدفع الثاني الأول إلى الأسفل.' },
  { kind: 'zoom', label: 'تكبير متداخل', hint: 'يكبر الأول ويظهر الثاني منه.' },
  { kind: 'iris', label: 'دائرة', hint: 'يتسع الثاني في دائرة من الوسط.' },
  { kind: 'blur', label: 'تمويه', hint: 'يتموه الأول ويتضح الثاني.' },
];

export const ANIM_KINDS = [
  'fade', 'rise', 'drop', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'zoom-in', 'zoom-out', 'pop', 'spin', 'blur',
  'wipe-left', 'wipe-right', 'wipe-up', 'typewriter', 'words',
] as const;
export type AnimKind = (typeof ANIM_KINDS)[number];
export type Anim = { kind: AnimKind; length: Micros };

export const ANIMATIONS: { kind: AnimKind; label: string; textOnly?: boolean }[] = [
  { kind: 'fade', label: 'تلاشٍ' },
  { kind: 'rise', label: 'صعود خفيف' },
  { kind: 'drop', label: 'هبوط خفيف' },
  { kind: 'slide-left', label: 'انزلاق من اليمين' },
  { kind: 'slide-right', label: 'انزلاق من اليسار' },
  { kind: 'slide-up', label: 'انزلاق من الأسفل' },
  { kind: 'slide-down', label: 'انزلاق من الأعلى' },
  { kind: 'zoom-in', label: 'تكبير' },
  { kind: 'zoom-out', label: 'تصغير' },
  { kind: 'pop', label: 'قفزة' },
  { kind: 'spin', label: 'دوران' },
  { kind: 'blur', label: 'تمويه' },
  { kind: 'wipe-left', label: 'مسح من اليمين' },
  { kind: 'wipe-right', label: 'مسح من اليسار' },
  { kind: 'wipe-up', label: 'مسح من الأسفل' },
  { kind: 'typewriter', label: 'كتابة حرفاً حرفاً', textOnly: true },
  { kind: 'words', label: 'كلمة كلمة', textOnly: true },
];

export const DEFAULT_TRANSITION: { kind: TransitionKind; length: Micros } = { kind: 'fade', length: Math.round(0.5 * US) };
export const DEFAULT_ANIM_LENGTH = Math.round(0.5 * US);
export const transitionLabel = (k: string | undefined) => TRANSITIONS.find((x) => x.kind === (k ?? 'fade'))?.label ?? 'انتقال';
export const animLabel = (k: string | undefined) => ANIMATIONS.find((x) => x.kind === k)?.label ?? 'حركة';
export const isTransitionKind = (k: unknown): k is TransitionKind => typeof k === 'string' && (TRANSITION_KINDS as readonly string[]).includes(k);
export const isAnimKind = (k: unknown): k is AnimKind => typeof k === 'string' && (ANIM_KINDS as readonly string[]).includes(k);

/** A part of the canvas the item is drawn into (canvas pixels). */
export type ClipShape = { kind: 'rect'; x: number; y: number; w: number; h: number } | { kind: 'circle'; cx: number; cy: number; r: number };
/** A part of the item's own box shown, measured from one side (a wipe of the item itself). */
export type LocalClip = { from: 'left' | 'right' | 'top' | 'bottom'; f: number };

export type Fx = {
  alpha: number;
  dx: number;
  dy: number;
  scale: number;
  /** Degrees, added to the item's own turn. */
  rotate: number;
  /** Canvas pixels of blur. */
  blur: number;
  clip: ClipShape | null;
  local: LocalClip | null;
  /** Text drawn up to this share of its letters or words. */
  reveal: { f: number; by: 'chars' | 'words' } | null;
};
export type Overlay = { color: string; alpha: number };

export const NO_FX: Fx = { alpha: 1, dx: 0, dy: 0, scale: 1, rotate: 0, blur: 0, clip: null, local: null, reveal: null };

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const easeOut = (p: number) => 1 - Math.pow(1 - clamp01(p), 3);
export const easeInOut = (p: number) => {
  const x = clamp01(p);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
const backOut = (p: number) => {
  const x = clamp01(p);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

/** Two effects on one item together. */
export function combine(a: Fx, b: Fx): Fx {
  if (a === NO_FX) return b;
  if (b === NO_FX) return a;
  return {
    alpha: a.alpha * b.alpha,
    dx: a.dx + b.dx,
    dy: a.dy + b.dy,
    scale: a.scale * b.scale,
    rotate: a.rotate + b.rotate,
    blur: Math.max(a.blur, b.blur),
    clip: a.clip ?? b.clip,
    local: a.local && b.local ? (a.local.f <= b.local.f ? a.local : b.local) : (a.local ?? b.local),
    reveal: a.reveal && b.reveal ? (a.reveal.f <= b.reveal.f ? a.reveal : b.reveal) : (a.reveal ?? b.reveal),
  };
}

const fx = (p: Partial<Fx>): Fx => ({ ...NO_FX, ...p });

/**
 * A transition at progress p (0 to 1) for the incoming clip (`in`) or the outgoing one (`out`), in a
 * canvas of W by H. A dip also returns the colour drawn over both clips.
 */
export function transitionFx(kind: string | undefined, p: number, role: 'in' | 'out', W: number, H: number): { fx: Fx; overlay: Overlay | null } {
  const x = clamp01(p);
  const e = easeInOut(x);
  const k = isTransitionKind(kind) ? kind : 'fade';
  const none = { fx: NO_FX, overlay: null };
  switch (k) {
    case 'fade':
      return role === 'in' ? { fx: fx({ alpha: x }), overlay: null } : none;
    case 'dip-black':
    case 'dip-white':
      return {
        fx: fx({ alpha: role === 'out' ? clamp01(1 - 2 * x) : clamp01(2 * x - 1) }),
        overlay: role === 'in' ? { color: k === 'dip-black' ? '#000000' : '#ffffff', alpha: 1 - Math.abs(2 * x - 1) } : null,
      };
    case 'wipe-left':
      return role === 'in' ? { fx: fx({ clip: { kind: 'rect', x: W * (1 - e), y: 0, w: W * e, h: H } }), overlay: null } : none;
    case 'wipe-right':
      return role === 'in' ? { fx: fx({ clip: { kind: 'rect', x: 0, y: 0, w: W * e, h: H } }), overlay: null } : none;
    case 'wipe-up':
      return role === 'in' ? { fx: fx({ clip: { kind: 'rect', x: 0, y: H * (1 - e), w: W, h: H * e } }), overlay: null } : none;
    case 'wipe-down':
      return role === 'in' ? { fx: fx({ clip: { kind: 'rect', x: 0, y: 0, w: W, h: H * e } }), overlay: null } : none;
    case 'slide-left':
      return role === 'in' ? { fx: fx({ dx: W * (1 - e) }), overlay: null } : none;
    case 'slide-right':
      return role === 'in' ? { fx: fx({ dx: -W * (1 - e) }), overlay: null } : none;
    case 'push-left':
      return { fx: fx(role === 'in' ? { dx: W * (1 - e) } : { dx: -W * e }), overlay: null };
    case 'push-right':
      return { fx: fx(role === 'in' ? { dx: -W * (1 - e) } : { dx: W * e }), overlay: null };
    case 'push-up':
      return { fx: fx(role === 'in' ? { dy: H * (1 - e) } : { dy: -H * e }), overlay: null };
    case 'push-down':
      return { fx: fx(role === 'in' ? { dy: -H * (1 - e) } : { dy: H * e }), overlay: null };
    case 'zoom':
      return { fx: fx(role === 'in' ? { alpha: x, scale: 0.8 + 0.2 * e } : { scale: 1 + 0.25 * e }), overlay: null };
    case 'iris':
      return role === 'in' ? { fx: fx({ clip: { kind: 'circle', cx: W / 2, cy: H / 2, r: (e * Math.hypot(W, H)) / 2 } }), overlay: null } : none;
    case 'blur':
      return { fx: fx(role === 'in' ? { alpha: x, blur: 30 * (1 - x) } : { blur: 30 * x }), overlay: null };
  }
}

/**
 * An entry movement at k (0: not yet shown, 1: fully shown), or an exit with k the share still shown
 * and sign -1, so an exit leaves the way its entry would have continued.
 */
export function animFx(kind: string | undefined, k: number, sign: 1 | -1, W: number, H: number): Fx {
  const x = clamp01(k);
  const e = easeOut(x);
  const seen = Math.min(1, x * 2);
  switch (kind) {
    case 'fade':
      return fx({ alpha: e });
    case 'rise':
      return fx({ alpha: e, dy: (1 - e) * H * 0.06 * sign });
    case 'drop':
      return fx({ alpha: e, dy: -(1 - e) * H * 0.06 * sign });
    case 'slide-left':
      return fx({ alpha: seen, dx: (1 - e) * W * 0.5 * sign });
    case 'slide-right':
      return fx({ alpha: seen, dx: -(1 - e) * W * 0.5 * sign });
    case 'slide-up':
      return fx({ alpha: seen, dy: (1 - e) * H * 0.5 * sign });
    case 'slide-down':
      return fx({ alpha: seen, dy: -(1 - e) * H * 0.5 * sign });
    case 'zoom-in':
      return fx({ alpha: e, scale: 0.4 + 0.6 * e });
    case 'zoom-out':
      return fx({ alpha: e, scale: 1.6 - 0.6 * e });
    case 'pop':
      return fx({ alpha: Math.min(1, x * 3), scale: Math.max(0.001, backOut(x)) });
    case 'spin':
      return fx({ alpha: e, scale: 0.5 + 0.5 * e, rotate: -(1 - e) * 180 * sign });
    case 'blur':
      return fx({ alpha: e, blur: (1 - e) * 24 });
    case 'wipe-left':
      return fx({ local: { from: 'right', f: e } });
    case 'wipe-right':
      return fx({ local: { from: 'left', f: e } });
    case 'wipe-up':
      return fx({ local: { from: 'bottom', f: e } });
    case 'typewriter':
      return fx({ reveal: { f: x, by: 'chars' } });
    case 'words':
      return fx({ reveal: { f: x, by: 'words' } });
    default:
      return NO_FX;
  }
}

const endOf = (c: Pick<Clip, 'start' | 'length'>) => c.start + c.length;

/** A clip's entry and exit lengths, shortened together when they would not both fit in the clip. */
export function animLengths(c: Pick<Clip, 'length'> & { animIn?: Anim | null; animOut?: Anim | null }): { inLen: Micros; outLen: Micros } {
  const a = c.animIn?.length ?? 0;
  const b = c.animOut?.length ?? 0;
  if (a + b <= c.length || a + b <= 0) return { inLen: a, outLen: b };
  const k = c.length / (a + b);
  return { inLen: a * k, outLen: b * k };
}

/** The entry and exit movements of a clip at time t (whole clip time, not source time). */
export function clipAnimFx(c: Clip, t: Micros, W: number, H: number): Fx {
  const animIn = isAnim(c.animIn) ? c.animIn : null;
  const animOut = isAnim(c.animOut) ? c.animOut : null;
  if (!animIn && !animOut) return NO_FX;
  const { inLen, outLen } = animLengths({ length: c.length, animIn, animOut });
  const into = t - c.start;
  const left = endOf(c) - t;
  let out = NO_FX;
  if (animIn && inLen > 0 && into < inLen) out = combine(out, animFx(animIn.kind, into / inLen, 1, W, H));
  if (animOut && outLen > 0 && left < outLen) out = combine(out, animFx(animOut.kind, left / outLen, -1, W, H));
  return out;
}

export const isAnim = (a: unknown): a is Anim => !!a && typeof a === 'object' && isAnimKind((a as Anim).kind) && typeof (a as Anim).length === 'number' && (a as Anim).length > 0;

/**
 * The transitions acting on a clip at time t: its own (as the incoming clip) and the next clip's on the
 * track (as the outgoing one). The kind «fade» is drawn by the clip's opacity (timeline.ts clipAlpha), as
 * before, so it adds nothing here.
 */
export function clipTransitionFx(track: Track, c: Clip, t: Micros, W: number, H: number): { fx: Fx; overlay: Overlay | null } {
  let out = NO_FX;
  let overlay: Overlay | null = null;
  const tr = c.transition;
  if (tr && tr.kind && tr.kind !== 'fade' && tr.length > 0) {
    const into = t - c.start;
    if (into >= 0 && into < tr.length) {
      const r = transitionFx(tr.kind, into / tr.length, 'in', W, H);
      out = combine(out, r.fx);
      overlay = r.overlay;
    }
  }
  const next = track.clips.find((o) => o.id !== c.id && o.transition && o.start < endOf(c) && o.start > c.start);
  if (next?.transition && next.transition.kind && next.transition.kind !== 'fade' && t >= next.start) {
    const r = transitionFx(next.transition.kind, (t - next.start) / next.transition.length, 'out', W, H);
    out = combine(out, r.fx);
  }
  return { fx: out, overlay };
}

// ---------------------------------------------------------------------------
// The entry and exit a person picks for a clip (the inspector and the effects window).
// ---------------------------------------------------------------------------

export const ENTER_NONE = 'none';
export type EnterValue = { kind: AnimKind | typeof ENTER_NONE; length: number };

/** What a clip shows on entry or exit: a movement, its plain fade, or a text's own older setting. */
export function entryOf(clip: Clip, side: 'in' | 'out'): EnterValue {
  const anim = side === 'in' ? clip.animIn : clip.animOut;
  if (isAnim(anim)) return { kind: anim.kind, length: anim.length };
  const fade = side === 'in' ? clip.fadeIn : clip.fadeOut;
  if ((fade ?? 0) > 0) return { kind: 'fade', length: fade! };
  const legacy = side === 'in' ? clip.text?.enter : clip.text?.exit;
  if (clip.animIn === undefined && clip.animOut === undefined && legacy && legacy !== 'none') return { kind: legacy === 'slide' ? 'slide-left' : legacy, length: 0.4 * US };
  return { kind: ENTER_NONE, length: DEFAULT_ANIM_LENGTH };
}

/** The clip fields for an entry or exit: a fade is the clip's own fade (it fades the sound too), the rest a movement. */
export function entryPatch(clip: Clip, side: 'in' | 'out', v: EnterValue): Partial<Clip> {
  const fadeKey = side === 'in' ? 'fadeIn' : 'fadeOut';
  const animKey = side === 'in' ? 'animIn' : 'animOut';
  const other = side === 'in' ? 'animOut' : 'animIn';
  const patch: Partial<Clip> = {};
  if (v.kind === ENTER_NONE) Object.assign(patch, { [fadeKey]: 0, [animKey]: null });
  else if (v.kind === 'fade') Object.assign(patch, { [fadeKey]: v.length, [animKey]: null });
  else Object.assign(patch, { [fadeKey]: 0, [animKey]: { kind: v.kind, length: v.length } });
  // the other side keeps what it showed: a text's older setting becomes explicit
  if (clip[other] === undefined) {
    const o = entryOf(clip, side === 'in' ? 'out' : 'in');
    const oFade = side === 'in' ? 'fadeOut' : 'fadeIn';
    if (o.kind === ENTER_NONE) Object.assign(patch, { [other]: null });
    else if (o.kind === 'fade') Object.assign(patch, { [other]: null, [oFade]: o.length });
    else Object.assign(patch, { [other]: { kind: o.kind, length: o.length } });
  }
  return patch;
}

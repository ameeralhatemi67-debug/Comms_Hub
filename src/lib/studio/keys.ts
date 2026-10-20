// Keyframes of the studio (MVP_draft.md 62.7): a clip's position, size, turn and opacity, and its speed,
// may change over time. Each keyed setting is a list of keys, sorted by time; a key's time is counted from
// the clip's start, so moving a clip moves its keys with it. Between two keys the value follows the curve
// of the first key (straight, ease in, ease out, ease both, or hold until the next key); before the first
// key and after the last the value stays as theirs. A setting with no keys keeps its plain value. Pure.
import type { Micros, Transform } from './schema.ts';

export type Ease = 'linear' | 'in' | 'out' | 'inOut' | 'hold';
export type Key = { t: Micros; v: number; ease?: Ease };
export const MOTION_PROPS = ['x', 'y', 'scale', 'rotation', 'opacity'] as const;
export type MotionProp = (typeof MOTION_PROPS)[number];
export type KeyProp = MotionProp | 'speed';
export type Keys = Partial<Record<KeyProp, Key[]>>;

/** Keys closer than this are the same key (a millisecond). */
export const KEY_TOLERANCE = 1000;

export const EASES: { value: Ease; label: string }[] = [
  { value: 'linear', label: 'مستقيم' },
  { value: 'in', label: 'تسارع' },
  { value: 'out', label: 'تباطؤ' },
  { value: 'inOut', label: 'ناعم' },
  { value: 'hold', label: 'ثابت حتى المفتاح التالي' },
];
export const PROP_LABELS: Record<KeyProp, string> = { x: 'الموضع أفقياً', y: 'الموضع عمودياً', scale: 'الحجم', rotation: 'الدوران', opacity: 'الشفافية', speed: 'السرعة' };

const isEase = (e: unknown): e is Ease => e === 'linear' || e === 'in' || e === 'out' || e === 'inOut' || e === 'hold';

/** The share of the way from one key to the next at p (0 to 1), by the first key's curve. */
export function eased(ease: Ease | undefined, p: number): number {
  const x = Math.max(0, Math.min(1, p));
  switch (isEase(ease) ? ease : 'linear') {
    case 'in':
      return x * x * x;
    case 'out':
      return 1 - Math.pow(1 - x, 3);
    case 'inOut':
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    case 'hold':
      return x >= 1 ? 1 : 0;
    default:
      return x;
  }
}

/** Valid keys only, sorted by time (a list from a newer or broken client is read safely). */
export function cleanKeys(list: unknown): Key[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((k): k is Key => !!k && typeof k === 'object' && Number.isFinite((k as Key).t) && Number.isFinite((k as Key).v))
    .slice()
    .sort((a, b) => a.t - b.t);
}

/** A setting's value at clip time t: its keys, or `base` when it has none. */
export function valueAt(list: Key[] | undefined, t: Micros, base: number): number {
  const ks = cleanKeys(list);
  if (!ks.length) return base;
  if (t <= ks[0].t) return ks[0].v;
  const last = ks[ks.length - 1];
  if (t >= last.t) return last.v;
  let i = 0;
  while (i < ks.length - 2 && ks[i + 1].t <= t) i++;
  const a = ks[i];
  const b = ks[i + 1];
  const span = b.t - a.t;
  if (span <= 0) return b.v;
  return a.v + (b.v - a.v) * eased(a.ease, (t - a.t) / span);
}

/** The key at time t (within the tolerance), if any. */
export const keyAt = (list: Key[] | undefined, t: Micros, tol = KEY_TOLERANCE) => cleanKeys(list).find((k) => Math.abs(k.t - t) <= tol);

/** A key set at t: replaces the key there (keeping its curve unless one is given), else is added. */
export function setKey(list: Key[] | undefined, t: Micros, v: number, ease?: Ease, tol = KEY_TOLERANCE): Key[] {
  const ks = cleanKeys(list);
  const at = Math.round(t);
  const i = ks.findIndex((k) => Math.abs(k.t - at) <= tol);
  if (i >= 0) {
    const next = ks.slice();
    next[i] = { ...ks[i], v, ...(ease ? { ease } : {}) };
    return next;
  }
  return [...ks, { t: at, v, ...(ease ? { ease } : {}) }].sort((a, b) => a.t - b.t);
}

export function removeKey(list: Key[] | undefined, t: Micros, tol = KEY_TOLERANCE): Key[] {
  return cleanKeys(list).filter((k) => Math.abs(k.t - t) > tol);
}

/** The keys of every setting, with an empty list dropped (an empty `keys` becomes undefined). */
export function tidyKeys(keys: Keys | undefined): Keys | undefined {
  if (!keys) return undefined;
  const out: Keys = {};
  for (const [p, list] of Object.entries(keys) as [KeyProp, Key[] | undefined][]) {
    const ks = cleanKeys(list);
    if (ks.length) out[p] = ks;
  }
  return Object.keys(out).length ? out : undefined;
}

export const hasKeys = (keys: Keys | undefined, prop?: KeyProp) =>
  prop ? cleanKeys(keys?.[prop]).length > 0 : !!keys && Object.values(keys).some((l) => cleanKeys(l).length > 0);

/** Every time that has a key of any setting, once each, sorted (the diamonds on the timeline). */
export function keyTimes(keys: Keys | undefined, props: readonly KeyProp[] = [...MOTION_PROPS, 'speed']): Micros[] {
  const ts: Micros[] = [];
  for (const p of props) for (const k of cleanKeys(keys?.[p])) if (!ts.some((x) => Math.abs(x - k.t) <= KEY_TOLERANCE)) ts.push(k.t);
  return ts.sort((a, b) => a - b);
}

/** Every key moved by d (a clip whose start moved, so its keys stay where they were in time). */
export function shiftKeys(keys: Keys | undefined, d: Micros): Keys | undefined {
  if (!keys || !d) return keys;
  const out: Keys = {};
  for (const [p, list] of Object.entries(keys) as [KeyProp, Key[] | undefined][]) out[p] = cleanKeys(list).map((k) => ({ ...k, t: k.t + d }));
  return tidyKeys(out);
}

/** The keys at one time moved to another, for every setting (a diamond dragged on the timeline). */
export function moveKeyTime(keys: Keys | undefined, from: Micros, to: Micros, tol = KEY_TOLERANCE): Keys | undefined {
  if (!keys) return keys;
  const out: Keys = {};
  for (const [p, list] of Object.entries(keys) as [KeyProp, Key[] | undefined][]) {
    const ks = cleanKeys(list);
    const moving = ks.find((k) => Math.abs(k.t - from) <= tol);
    if (!moving) {
      out[p] = ks;
      continue;
    }
    const rest = ks.filter((k) => k !== moving && Math.abs(k.t - to) > tol);
    out[p] = [...rest, { ...moving, t: Math.round(to) }].sort((a, b) => a.t - b.t);
  }
  return tidyKeys(out);
}

/** The keys at one time removed from every setting. */
export function removeKeyTime(keys: Keys | undefined, t: Micros, tol = KEY_TOLERANCE): Keys | undefined {
  if (!keys) return keys;
  const out: Keys = {};
  for (const [p, list] of Object.entries(keys) as [KeyProp, Key[] | undefined][]) out[p] = removeKey(list, t, tol);
  return tidyKeys(out);
}

/** The curve of the keys at time t, for every setting that has one there. */
export function setEaseAt(keys: Keys | undefined, t: Micros, ease: Ease, tol = KEY_TOLERANCE): Keys | undefined {
  if (!keys) return keys;
  const out: Keys = {};
  for (const [p, list] of Object.entries(keys) as [KeyProp, Key[] | undefined][]) out[p] = cleanKeys(list).map((k) => (Math.abs(k.t - t) <= tol ? { ...k, ease } : k));
  return tidyKeys(out);
}

/**
 * Keys cut at clip time `cut` into the part before and the part after (whose times then count from the
 * cut). Each keyed setting gets a key at the cut on both sides with its value there, so the movement
 * looks the same across the cut.
 */
export function splitKeys(keys: Keys | undefined, cut: Micros, base: Partial<Record<KeyProp, number>>): [Keys | undefined, Keys | undefined] {
  if (!hasKeys(keys)) return [keys, keys];
  const a: Keys = {};
  const b: Keys = {};
  for (const [p, list] of Object.entries(keys!) as [KeyProp, Key[] | undefined][]) {
    const ks = cleanKeys(list);
    if (!ks.length) continue;
    const v = valueAt(ks, cut, base[p] ?? 0);
    const at = ks.find((k) => Math.abs(k.t - cut) <= KEY_TOLERANCE);
    a[p] = [...ks.filter((k) => k.t < cut - KEY_TOLERANCE), { t: cut, v, ...(at?.ease ? { ease: at.ease } : {}) }];
    const before = [...ks].reverse().find((k) => k.t <= cut);
    b[p] = [{ t: 0, v, ...(before?.ease ? { ease: before.ease } : {}) }, ...ks.filter((k) => k.t > cut + KEY_TOLERANCE).map((k) => ({ ...k, t: k.t - cut }))];
  }
  return [tidyKeys(a), tidyKeys(b)];
}

/** A transform with its keyed settings taken at clip time t. */
export function transformWithKeys(base: Transform, keys: Keys | undefined, t: Micros): Transform {
  if (!hasKeys(keys)) return base;
  return {
    x: valueAt(keys!.x, t, base.x),
    y: valueAt(keys!.y, t, base.y),
    scale: valueAt(keys!.scale, t, base.scale),
    rotation: valueAt(keys!.rotation, t, base.rotation),
    opacity: valueAt(keys!.opacity, t, base.opacity),
  };
}

/**
 * A change of place, size, turn or opacity made at clip time t: a keyed setting gets (or moves) its key at
 * t, any other setting changes its plain value. Returns the new transform and keys.
 */
export function writeTransform(base: Transform, keys: Keys | undefined, t: Micros, next: Partial<Transform>): { transform: Transform; keys: Keys | undefined } {
  const transform = { ...base };
  const out: Keys = { ...(keys ?? {}) };
  for (const p of MOTION_PROPS) {
    const v = next[p];
    if (v === undefined) continue;
    if (cleanKeys(out[p]).length) out[p] = setKey(out[p], t, v);
    else transform[p] = v;
  }
  return { transform, keys: tidyKeys(out) };
}

/** Keys for every motion setting at t, at their values there (P: «مفاتيح الحركة عند رأس التشغيل»). */
export function keyAllMotion(base: Transform, keys: Keys | undefined, t: Micros): Keys | undefined {
  const now = transformWithKeys(base, keys, t);
  const out: Keys = { ...(keys ?? {}) };
  for (const p of MOTION_PROPS) out[p] = setKey(out[p], t, now[p]);
  return tidyKeys(out);
}

/** A setting's key at t switched: added at its value there, or removed when one is there. */
export function toggleKey(keys: Keys | undefined, prop: KeyProp, t: Micros, valueNow: number): Keys | undefined {
  const list = keys?.[prop];
  const out: Keys = { ...(keys ?? {}) };
  out[prop] = keyAt(list, t) ? removeKey(list, t) : setKey(list, t, valueNow);
  return tidyKeys(out);
}

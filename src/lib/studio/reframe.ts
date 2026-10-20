// Other shapes of one video project (MVP_draft.md 62.10). A project may add up to three shapes beside its
// own (`video.shapes`). In another shape every clip keeps its place in proportion to the frame (as when the
// project's own shape changes), and a clip can be placed again for that shape alone: an offset and a size
// factor (`video.reframe[shape][clipId]`), applied on top of its own place and of its keyframes, so a
// moving clip moves the same way in every shape. Pure.
import { RATIOS, type Clip, type Micros, type ProjectDoc, type Ratio, type Transform, type VideoBody } from './schema.ts';
import { cleanKeys, type Keys } from './keys.ts';
import { transformAt } from './compose.ts';

export const EXTRA_SHAPES_MAX = 3;
export type Reframe = { dx: number; dy: number; k: number };
export const NO_REFRAME: Reframe = { dx: 0, dy: 0, k: 1 };

const body = (doc: ProjectDoc): VideoBody => {
  if (doc.kind !== 'video' || !doc.video) throw new Error('NOT_VIDEO');
  return doc.video;
};
const isRatio = (r: unknown): r is Ratio => typeof r === 'string' && r in RATIOS;

/** The project's other shapes: valid, distinct, not its own, at most three. */
export function shapesOf(doc: ProjectDoc): Ratio[] {
  const v = doc.video;
  if (!v || !Array.isArray(v.shapes)) return [];
  const out: Ratio[] = [];
  for (const r of v.shapes as unknown[]) if (isRatio(r) && r !== v.ratio && !out.includes(r) && out.length < EXTRA_SHAPES_MAX) out.push(r);
  return out;
}

/** Every shape the project exports in: its own first. */
export const allShapes = (doc: ProjectDoc): Ratio[] => [body(doc).ratio, ...shapesOf(doc)];

export function setShapes(doc: ProjectDoc, shapes: Ratio[]): ProjectDoc {
  const v = body(doc);
  const list = shapes.filter((r, i) => isRatio(r) && r !== v.ratio && shapes.indexOf(r) === i).slice(0, EXTRA_SHAPES_MAX);
  const next: VideoBody = { ...v, shapes: list };
  if (!list.length) delete next.shapes;
  return { ...doc, video: next };
}

type ReframeMap = Partial<Record<Ratio, Record<string, Reframe>>>;
const mapOf = (doc: ProjectDoc): ReframeMap => (doc.video?.reframe && typeof doc.video.reframe === 'object' ? (doc.video.reframe as ReframeMap) : {});

/** A clip's own placing in another shape, or none. */
export function reframeOf(doc: ProjectDoc, shape: Ratio, clipId: string): Reframe {
  const r = mapOf(doc)[shape]?.[clipId];
  return r && Number.isFinite(r.dx) && Number.isFinite(r.dy) && Number.isFinite(r.k) && r.k > 0 ? r : NO_REFRAME;
}

/** Sets (or, with null, removes) a clip's own placing in a shape. */
export function setReframe(doc: ProjectDoc, shape: Ratio, clipId: string, r: Reframe | null): ProjectDoc {
  const v = body(doc);
  const all: ReframeMap = { ...mapOf(doc) };
  const forShape = { ...(all[shape] ?? {}) };
  if (r && (r.dx || r.dy || r.k !== 1)) forShape[clipId] = { dx: Math.round(r.dx), dy: Math.round(r.dy), k: Math.round(r.k * 1000) / 1000 };
  else delete forShape[clipId];
  if (Object.keys(forShape).length) all[shape] = forShape;
  else delete all[shape];
  const next: VideoBody = { ...v, reframe: all };
  if (!Object.keys(all).length) delete next.reframe;
  return { ...doc, video: next };
}

/** How a shape's frame relates to the project's own: x and y factors. */
export function shapeFactors(doc: ProjectDoc, shape: Ratio): { kx: number; ky: number } {
  const from = RATIOS[body(doc).ratio];
  const to = RATIOS[shape];
  return { kx: to.w / from.w, ky: to.h / from.h };
}

function scaleKeys(keys: Keys | undefined, kx: number, ky: number, r: Reframe): Keys | undefined {
  if (!keys) return keys;
  const out: Keys = { ...keys };
  if (keys.x) out.x = cleanKeys(keys.x).map((k) => ({ ...k, v: k.v * kx + r.dx }));
  if (keys.y) out.y = cleanKeys(keys.y).map((k) => ({ ...k, v: k.v * ky + r.dy }));
  if (keys.scale) out.scale = cleanKeys(keys.scale).map((k) => ({ ...k, v: k.v * r.k }));
  return out;
}

/** The project as it is exported in another shape (its own shape gives it back unchanged). */
export function docForShape(doc: ProjectDoc, shape: Ratio): ProjectDoc {
  const v = body(doc);
  if (shape === v.ratio) return doc;
  const { kx, ky } = shapeFactors(doc, shape);
  const from = RATIOS[v.ratio];
  const tracks = v.tracks.map((t) => ({
    ...t,
    clips: t.clips.map((c): Clip => {
      if (t.kind === 'audio') return c;
      const r = reframeOf(doc, shape, c.id);
      const base: Transform = { x: c.transform?.x ?? from.w / 2, y: c.transform?.y ?? from.h / 2, scale: c.transform?.scale ?? 1, rotation: c.transform?.rotation ?? 0, opacity: c.transform?.opacity ?? 1 };
      const next: Clip = { ...c, transform: { ...base, x: base.x * kx + r.dx, y: base.y * ky + r.dy, scale: base.scale * r.k } };
      if (c.keys) next.keys = scaleKeys(c.keys, kx, ky, r);
      return next;
    }),
  }));
  const out: VideoBody = { ...v, ratio: shape, tracks };
  delete out.shapes;
  delete out.reframe;
  return { ...doc, video: out };
}

/**
 * A clip's own placing in a shape after it was moved or sized there on the preview at time t: what was
 * asked (centre and size in that shape's frame) less where it would be from the project's own frame.
 */
export function reframeFromPlace(doc: ProjectDoc, shape: Ratio, clip: Clip, t: Micros, want: { x?: number; y?: number; scale?: number }): Reframe {
  const { kx, ky } = shapeFactors(doc, shape);
  const own = RATIOS[body(doc).ratio];
  const at = transformAt(clip, t, own.w, own.h);
  const was = reframeOf(doc, shape, clip.id);
  return {
    dx: want.x !== undefined ? want.x - at.x * kx : was.dx,
    dy: want.y !== undefined ? want.y - at.y * ky : was.dy,
    k: want.scale !== undefined && at.scale > 0 ? want.scale / at.scale : was.k,
  };
}

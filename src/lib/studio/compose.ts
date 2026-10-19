// The studio's compositor (MVP_draft.md 62): one Canvas 2D drawing of a video frame at time t, or of a
// photo, used alike by the preview, the export and the photo editor, so what is seen is what is
// exported. Media come through a Resolver (decoded video frames, pictures); motion templates through
// MotionRenderer; brand marks through sticker(). Pure apart from the canvas it is given.
import { canvasOf, type Adjust, type Clip, type Fit, type Layer, type Micros, type ProjectDoc, type Transform } from './schema.ts';
import { clipAlpha, sourceOf, visibleAt } from './timeline.ts';
import { MotionRenderer, fitToLength, graphicById, motionDims, motionParams, settledSec, sticker, templateTime } from './motion-adapter.ts';
import { drawText, layoutText, textMotion } from './text.ts';

export type Resolver = {
  /** The frame of a video source shown at `at` (source time) for a clip, or null while it is not ready. */
  videoFrame(sourceId: string, at: Micros, clipId?: string): CanvasImageSource | null;
  /** A picture source, or null while it is not ready. */
  image(sourceId: string): CanvasImageSource | null;
  motion: MotionRenderer;
  /** A picture already adjusted for this item (photos: the pixel functions of photo.ts), or null. */
  adjusted?: (item: Clip | Layer) => CanvasImageSource | null;
};

export type Box = { cx: number; cy: number; w: number; h: number; rotation: number };

export const IDENTITY: Transform = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };

/** A clip's or layer's transform with the canvas centre as its default place. */
export function transformOf(item: { transform?: Transform }, W: number, H: number): Transform {
  const t = item.transform;
  return { x: t?.x ?? W / 2, y: t?.y ?? H / 2, scale: t?.scale ?? 1, rotation: t?.rotation ?? 0, opacity: t?.opacity ?? 1 };
}

/** The size a content of natural size (w, h) takes in a W x H canvas before its own scale. */
export function fitSize(w: number, h: number, W: number, H: number, fit: Fit = 'contain'): { w: number; h: number } {
  if (!w || !h) return { w: W, h: H };
  const k = fit === 'cover' ? Math.max(W / w, H / h) : Math.min(W / w, H / h);
  return { w: w * k, h: h * k };
}

const sizeOf = (img: CanvasImageSource | null): { w: number; h: number } | null => {
  if (!img) return null;
  const any = img as { naturalWidth?: number; videoWidth?: number; displayWidth?: number; width?: number | SVGAnimatedLength; naturalHeight?: number; videoHeight?: number; displayHeight?: number; height?: number | SVGAnimatedLength };
  const w = any.naturalWidth || any.videoWidth || any.displayWidth || (typeof any.width === 'number' ? any.width : 0);
  const h = any.naturalHeight || any.videoHeight || any.displayHeight || (typeof any.height === 'number' ? any.height : 0);
  return w && h ? { w, h } : null;
};

let filterOk: boolean | null = null;
/** Whether the browser applies ctx.filter (Safari did not for long). */
export function supportsFilter(): boolean {
  if (filterOk !== null) return filterOk;
  try {
    const c = document.createElement('canvas').getContext('2d')!;
    c.filter = 'brightness(1.5)';
    filterOk = c.filter === 'brightness(1.5)';
  } catch {
    filterOk = false;
  }
  return filterOk;
}

/** The CSS filter of an adjustment (brightness, contrast, saturation; -100 to 100 each). */
export function filterOf(a: Adjust | undefined): string {
  if (!a) return 'none';
  const parts: string[] = [];
  if (a.brightness) parts.push(`brightness(${(1 + a.brightness / 100).toFixed(3)})`);
  if (a.contrast) parts.push(`contrast(${(1 + a.contrast / 100).toFixed(3)})`);
  if (a.saturation) parts.push(`saturate(${(1 + a.saturation / 100).toFixed(3)})`);
  if (a.blur) parts.push(`blur(${Math.max(0, a.blur / 10).toFixed(2)}px)`);
  return parts.length ? parts.join(' ') : 'none';
}

type Drawn = { img: CanvasImageSource | null; natural: { w: number; h: number }; fitInCanvas: boolean; preAdjusted?: boolean; draw?: (ctx: CanvasRenderingContext2D, w: number, h: number, scale: number) => void };

/**
 * What an item shows at time t, and its natural size. With `measure`, only the size is wanted: no video
 * frame is asked for (asking would make the decoder seek away from the frame on screen).
 */
function contentOf(doc: ProjectDoc, item: Clip | Layer, t: Micros | null, res: Resolver, scale: number, W: number, H: number, measure = false): Drawn | null {
  if (item.source) {
    const s = sourceOf(doc, item.source);
    if (!s) return null;
    if (measure && s.media === 'video') return s.w && s.h ? { img: null, natural: { w: s.w, h: s.h }, fitInCanvas: true } : null;
    const pre = s.media === 'image' && item.adjust ? (res.adjusted?.(item) ?? null) : null;
    if (pre) {
      const natural = sizeOf(pre) ?? (s.w && s.h ? { w: s.w, h: s.h } : null);
      return natural ? { img: pre, natural, fitInCanvas: true, preAdjusted: true } : null;
    }
    const img = s.media === 'video' ? res.videoFrame(s.id, Math.max(0, ((item as Clip).in ?? 0) + (t === null ? 0 : t - ((item as Clip).start ?? 0))), item.id) : s.media === 'image' ? res.image(s.id) : null;
    const natural = sizeOf(img) ?? (s.w && s.h ? { w: s.w, h: s.h } : null);
    if (!natural) return null;
    return { img, natural, fitInCanvas: true };
  }
  if (item.motion) {
    const g = graphicById(item.motion.template);
    if (!g) return null;
    if (measure) return { img: null, natural: motionDims(g, motionParams(g, item.motion.params, doc.video?.ratio ?? '9:16')), fitInCanvas: true };
    const ratio = doc.video?.ratio ?? '9:16';
    let p = motionParams(g, item.motion.params, ratio);
    const clip = item as Clip;
    if (t !== null && clip.length) p = fitToLength(g, p, (clip.in ?? 0) + clip.length);
    const natural = motionDims(g, p);
    const sec = t === null ? settledSec(g, p) : templateTime(clip, t, p);
    return {
      img: null,
      natural,
      fitInCanvas: true,
      draw: (ctx, w, h, s) => {
        const c = res.motion.render(item.id, g, p, sec, (w * s) / natural.w);
        ctx.drawImage(c, -w / 2, -h / 2, w, h);
      },
    };
  }
  if (item.sticker) {
    const img = sticker(item.sticker.key, item.sticker.color);
    if (!img) return null;
    // a mark is placed at a third of the canvas width, its own proportions kept
    const k = (W * 0.34) / img.width;
    return { img, natural: { w: img.width * k, h: img.height * k }, fitInCanvas: false };
  }
  if (item.shape) {
    const sh = item.shape;
    return {
      img: null,
      natural: { w: sh.w, h: sh.h },
      fitInCanvas: false,
      draw: (ctx, w, h, s) => {
        ctx.beginPath();
        if (sh.type === 'ellipse') ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
        else if (sh.type === 'line') {
          ctx.moveTo(-w / 2, 0);
          ctx.lineTo(w / 2, 0);
        } else {
          const r = Math.min(sh.radius * s, w / 2, h / 2);
          ctx.roundRect(-w / 2, -h / 2, w, h, r);
        }
        if (sh.fill && sh.type !== 'line') {
          ctx.fillStyle = sh.fill;
          ctx.fill();
        }
        if (sh.stroke && sh.strokeWidth > 0) {
          ctx.strokeStyle = sh.stroke;
          ctx.lineWidth = sh.strokeWidth * s;
          ctx.stroke();
        }
      },
    };
  }
  if (item.text) {
    // drawn by drawItem with drawText; the size here is for the outline before layout
    return { img: null, natural: { w: item.text.width * W, h: item.text.size * item.text.lineHeight }, fitInCanvas: false };
  }
  return null;
}

/** Where an item sits on the canvas (canvas pixels), for drawing, picking and the selection outline. */
export function boxOf(doc: ProjectDoc, item: Clip | Layer, res: Resolver, ctx: CanvasRenderingContext2D | null = null): Box | null {
  const { w: W, h: H } = canvasOf(doc);
  const tr = transformOf(item, W, H);
  if (item.text) {
    if (!ctx) return { cx: tr.x, cy: tr.y, w: item.text.width * W * tr.scale, h: item.text.size * item.text.lineHeight * tr.scale, rotation: tr.rotation };
    const L = layoutText(ctx, item.text, W, 1);
    return { cx: tr.x, cy: tr.y, w: L.boxW * tr.scale, h: L.height * tr.scale, rotation: tr.rotation };
  }
  const c = contentOf(doc, item, null, res, 1, W, H, true);
  if (!c) return null;
  const crop = (item as Clip).crop;
  const nw = c.natural.w * (crop ? 1 - crop.l - crop.r : 1);
  const nh = c.natural.h * (crop ? 1 - crop.t - crop.b : 1);
  const base = c.fitInCanvas ? fitSize(nw, nh, W, H, item.fit) : { w: nw, h: nh };
  return { cx: tr.x, cy: tr.y, w: base.w * tr.scale, h: base.h * tr.scale, rotation: tr.rotation };
}

/**
 * Draws one clip or layer. `scale` turns canvas pixels into the target's pixels; `alpha` is its fade.
 * The context's transform is left as it was.
 */
export function drawItem(ctx: CanvasRenderingContext2D, doc: ProjectDoc, item: Clip | Layer, t: Micros | null, res: Resolver, scale: number, alpha = 1) {
  const { w: W, h: H } = canvasOf(doc);
  const tr = transformOf(item, W, H);
  let a = alpha * tr.opacity;
  let dx = 0;
  let dy = 0;
  if (item.text && t !== null && (item as Clip).length) {
    const m = textMotion(item.text, item as Clip, t);
    a *= m.alpha;
    dx = m.dx;
    dy = m.dy;
  }
  if (a <= 0.001) return;
  const c = contentOf(doc, item, t, res, scale, W, H);
  if (!c) return;
  const crop = (item as Clip).crop;
  const nw = c.natural.w * (crop ? 1 - crop.l - crop.r : 1);
  const nh = c.natural.h * (crop ? 1 - crop.t - crop.b : 1);
  const base = item.text ? { w: 0, h: 0 } : c.fitInCanvas ? fitSize(nw, nh, W, H, item.fit) : { w: nw, h: nh };
  ctx.save();
  ctx.globalAlpha *= Math.min(1, a);
  const blend = (item as Layer).blend;
  if (blend && blend !== 'normal') ctx.globalCompositeOperation = blend;
  ctx.translate((tr.x + dx) * scale, (tr.y + dy) * scale);
  if (tr.rotation) ctx.rotate((tr.rotation * Math.PI) / 180);
  const flip = (item as Layer).flip;
  if (flip?.h || flip?.v) ctx.scale(flip.h ? -1 : 1, flip.v ? -1 : 1);
  const f = filterOf((item as Clip).adjust);
  // photos are adjusted by the pixel functions (resolver.adjusted); video uses the canvas filter
  if (f !== 'none' && !c.preAdjusted && doc.kind !== 'photo' && supportsFilter()) ctx.filter = f;
  if (item.text) {
    ctx.scale(tr.scale, tr.scale);
    drawText(ctx, item.text, 0, 0, W, scale);
  } else {
    const w = base.w * tr.scale * scale;
    const h = base.h * tr.scale * scale;
    if (c.draw) c.draw(ctx, w, h, scale * tr.scale);
    else if (c.img) {
      const full = sizeOf(c.img) ?? c.natural;
      if (crop) ctx.drawImage(c.img, full.w * crop.l, full.h * crop.t, full.w * (1 - crop.l - crop.r), full.h * (1 - crop.t - crop.b), -w / 2, -h / 2, w, h);
      else ctx.drawImage(c.img, -w / 2, -h / 2, w, h);
    }
  }
  ctx.restore();
}

export type FrameOptions = {
  /** Target pixels per canvas pixel (the preview is smaller than the project; the export is 1 or more). */
  scale: number;
  /** Leave the background transparent (a still of graphics only). */
  transparent?: boolean;
};

/** A video project's frame at time t, onto a context whose canvas is the project's size times `scale`. */
export function composeFrame(ctx: CanvasRenderingContext2D, doc: ProjectDoc, t: Micros, res: Resolver, opts: FrameOptions) {
  const { w: W, h: H } = canvasOf(doc);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, W * opts.scale, H * opts.scale);
  if (!opts.transparent) {
    ctx.fillStyle = doc.video?.background ?? '#000000';
    ctx.fillRect(0, 0, W * opts.scale, H * opts.scale);
  }
  const keep = new Set<string>();
  for (const { clip } of visibleAt(doc, t)) {
    if (clip.motion) keep.add(clip.id);
    drawItem(ctx, doc, clip, t, res, opts.scale, clipAlpha(clip, t));
  }
  ctx.restore();
  return keep;
}

/** A photo project, onto a context whose canvas is the photo's size times `scale`. */
export function composePhoto(ctx: CanvasRenderingContext2D, doc: ProjectDoc, res: Resolver, opts: FrameOptions & { skip?: string | null }) {
  const { w: W, h: H } = canvasOf(doc);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, W * opts.scale, H * opts.scale);
  const bg = doc.photo?.background;
  if (bg && !opts.transparent) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W * opts.scale, H * opts.scale);
  }
  for (const layer of doc.photo?.layers ?? []) if (!layer.hidden && layer.id !== opts.skip) drawItem(ctx, doc, layer, null, res, opts.scale);
  ctx.restore();
}

/** The topmost item under a canvas point (canvas pixels): clips visible at t, or photo layers. */
export function pick(doc: ProjectDoc, x: number, y: number, t: Micros | null, res: Resolver, ctx: CanvasRenderingContext2D | null): string | null {
  const items: (Clip | Layer)[] = doc.kind === 'photo' ? (doc.photo?.layers ?? []).filter((l) => !l.hidden && !l.locked) : visibleAt(doc, t ?? 0).filter((v) => !v.track.locked).map((v) => v.clip);
  for (let i = items.length - 1; i >= 0; i--) {
    const b = boxOf(doc, items[i], res, ctx);
    if (!b) continue;
    const r = (-b.rotation * Math.PI) / 180;
    const px = (x - b.cx) * Math.cos(r) - (y - b.cy) * Math.sin(r);
    const py = (x - b.cx) * Math.sin(r) + (y - b.cy) * Math.cos(r);
    if (Math.abs(px) <= b.w / 2 && Math.abs(py) <= b.h / 2) return items[i].id;
  }
  return null;
}

/**
 * The transform that makes a video clip fill a frame template's window (the transparent opening the
 * footage shows through), for «ضع الفيديو داخل الإطار».
 */
export function fillWindow(doc: ProjectDoc, video: Clip, frameClip: Clip, res: Resolver): Transform | null {
  if (!frameClip.motion) return null;
  const g = graphicById(frameClip.motion.template);
  if (!g?.winBox) return null;
  const { w: W, h: H } = canvasOf(doc);
  const p = motionParams(g, frameClip.motion.params, doc.video?.ratio ?? '9:16');
  const d = motionDims(g, p);
  const frame = fitSize(d.w, d.h, W, H, frameClip.fit);
  const k = (frame.w / d.w) * (frameClip.transform?.scale ?? 1);
  const win = g.winBox(p);
  const ft = transformOf(frameClip, W, H);
  const winW = win.w * k;
  const winH = win.h * k;
  const cx = ft.x + (win.x + win.w / 2 - d.w / 2) * k;
  const cy = ft.y + (win.y + win.h / 2 - d.h / 2) * k;
  const b = boxOf(doc, { ...video, transform: { ...IDENTITY, x: cx, y: cy } }, res);
  if (!b) return null;
  const s = Math.max(winW / b.w, winH / b.h);
  return { x: cx, y: cy, scale: s, rotation: 0, opacity: video.transform?.opacity ?? 1 };
}

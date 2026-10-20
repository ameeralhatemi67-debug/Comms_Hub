// Reserved places (MVP_draft.md 62.12): «مكان محجوز» is a clip of a set length standing for a picture or a
// video still to come, drawn striped with what it waits for, in the preview and in an export alike, so an
// early export shows it plainly. It is full frame on a video track, or a box on a graphics track over the
// rest. «إسناد مهمة» makes a work task for it (task_create); when the file comes, «وضعه مكان المحجوز» turns
// the place into a clip of that file at its exact version. Pure apart from the canvas drawing.
import { canvasOf, type Clip, type Micros, type NewSource, type ProjectDoc, type Slot } from './schema.ts';
import { addSource, locate, updateClip } from './timeline.ts';
import { shortTime } from './time.ts';

export const SLOT_WHAT_MAX = 140;
export const SLOT_MEDIA_LABELS: Record<Slot['media'], string> = { video: 'لقطة فيديو', image: 'صورة' };

/** A new place: full frame for main footage, or a box over it. */
export function newSlot(media: Slot['media'], over: boolean, W: number, H: number): Slot {
  return { what: media === 'video' ? 'لقطة مطلوبة' : 'صورة مطلوبة', media, over, w: over ? Math.round(W * 0.6) : W, h: over ? Math.round(H * 0.34) : H };
}

/** How the place is called on the timeline and in the lists. */
export const slotLabel = (s: Slot) => `مكان محجوز: ${s.what.trim() || SLOT_MEDIA_LABELS[s.media]}`;

/** The places still waiting in a project. */
export function openSlots(doc: ProjectDoc): Clip[] {
  return (doc.video?.tracks ?? []).flatMap((t) => t.clips.filter((c) => !!c.slot));
}

/** The note a task carries: where the place is, how long, and the size wanted. */
export function slotNote(doc: ProjectDoc, clip: Clip, title: string, extra = ''): string {
  const s = clip.slot!;
  const { w: W, h: H } = canvasOf(doc);
  const px = s.over ? `${Math.round(s.w)}×${Math.round(s.h)}` : `${W}×${H}`;
  const secs = Math.round((clip.length / 1_000_000) * 10) / 10;
  const base = `للمشروع «${title}» في الاستوديو: ${SLOT_MEDIA_LABELS[s.media]} عند ${shortTime(clip.start)} لمدة ${secs} ث، بمقاس ${px}${s.over ? ' فوق اللقطة' : ' ملء الإطار'}.`;
  return `${base}${extra.trim() ? ` ${extra.trim()}` : ''}`.slice(0, 500);
}

/**
 * The place filled with a library file at its version: the clip keeps its start, its track and its length
 * (shortened to a video's own length), a full-frame place takes the file fitted in the frame, and a box takes
 * the file fitted in the box. The source is added once.
 */
export function fillSlot(doc: ProjectDoc, clipId: string, src: NewSource): ProjectDoc {
  const at = locate(doc, clipId);
  if (!at?.clip.slot) return doc;
  const slot = at.clip.slot;
  const { w: W, h: H } = canvasOf(doc);
  const r = addSource(doc, src);
  const length = src.media === 'video' && src.duration ? Math.min(at.clip.length, src.duration) : at.clip.length;
  let scale = at.clip.transform?.scale ?? 1;
  if (slot.over && src.w && src.h) {
    const k = Math.min(W / src.w, H / src.h);
    scale = scale * Math.min(slot.w / (src.w * k), slot.h / (src.h * k));
  }
  return updateClip(r.doc, clipId, () => {
    const next: Clip = { ...at.clip, source: r.id, in: 0, length, fit: 'contain', transform: { x: at.clip.transform?.x ?? W / 2, y: at.clip.transform?.y ?? H / 2, scale, rotation: at.clip.transform?.rotation ?? 0, opacity: at.clip.transform?.opacity ?? 1 } };
    delete next.slot;
    return next;
  });
}

/** Draws the place: stripes, a dashed edge and what it waits for, centred on the origin. */
export function drawSlot(ctx: CanvasRenderingContext2D, s: Slot, w: number, h: number, scale: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(-w / 2, -h / 2, w, h);
  ctx.clip();
  ctx.fillStyle = '#2b3a34';
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.strokeStyle = '#3d5249';
  const step = 26 * scale;
  ctx.lineWidth = step / 2.4;
  ctx.beginPath();
  for (let x = -w / 2 - h; x < w / 2 + h; x += step) {
    ctx.moveTo(x, -h / 2);
    ctx.lineTo(x + h, h / 2);
  }
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.setLineDash([14 * scale, 10 * scale]);
  ctx.lineWidth = Math.max(2, 4 * scale);
  ctx.strokeStyle = '#e8c46c';
  ctx.strokeRect(-w / 2 + ctx.lineWidth / 2, -h / 2 + ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
  const size = Math.max(12, Math.min(w / 12, h / 6, 64 * scale));
  ctx.font = `700 ${size}px "IBM Plex Sans Arabic", system-ui, sans-serif`;
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f4ead2';
  const line = s.what.trim() || SLOT_MEDIA_LABELS[s.media];
  ctx.fillText('مكان محجوز', 0, -size * 0.7, w * 0.9);
  ctx.font = `500 ${size * 0.8}px "IBM Plex Sans Arabic", system-ui, sans-serif`;
  ctx.fillText(line, 0, size * 0.55, w * 0.9);
  ctx.restore();
}

/** A place's length in plain seconds, for the dialogs. */
export const slotSeconds = (length: Micros) => Math.round((length / 1_000_000) * 10) / 10;

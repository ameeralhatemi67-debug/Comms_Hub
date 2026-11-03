// The reference documents of «قياس قدرة الجهاز» and of the cross-device proof (Desktop_Power_Ideas.md P-33 and
// P-37, phase D9): small studio projects made with the studio's own timeline functions, so the measurement and
// the proof draw what the studio draws. Their video and picture sources are synthetic (SYNTHETIC_VIDEO and
// SYNTHETIC_IMAGE): the page drawing them paints each frame from its time alone (bench.ts paintVideo and
// paintImage), so no decoder is involved and every machine starts from the same pixels. The first three are
// the measurement's; `corpus()` adds the rest for the proof. Pure.
import { newVideoDoc, STICKERS, US, type Clip, type ProjectDoc, type Ratio } from './schema.ts';
import { addClip, addSource, setTransition, updateClip } from './timeline.ts';
import { defaultText } from './text.ts';
import { motionCatalog, motionClip } from './motion-adapter.ts';
import { TRANSITIONS } from './transitions.ts';

export const SYNTHETIC_VIDEO = '00000000-0000-4000-8000-0000000000e1';
export const SYNTHETIC_IMAGE = '00000000-0000-4000-8000-0000000000e2';
/** The synthetic video is 4K, as the footage that weighs most on the compositor. */
export const VIDEO_SIZE = Object.freeze({ w: 3840, h: 2160 });
export const IMAGE_SIZE = Object.freeze({ w: 1600, h: 1600 });
export const BENCH_LENGTH = 4 * US;

const sec = (s: number) => Math.round(s * US);

function withVideo(doc: ProjectDoc): { doc: ProjectDoc; video: string } {
  const r = addSource(doc, { kind: 'library', asset: SYNTHETIC_VIDEO, version: 1, name: 'مرجع.mp4', media: 'video', duration: 60 * US, w: VIDEO_SIZE.w, h: VIDEO_SIZE.h });
  return { doc: r.doc, video: r.id };
}

function withImage(doc: ProjectDoc): { doc: ProjectDoc; image: string } {
  const r = addSource(doc, { kind: 'library', asset: SYNTHETIC_IMAGE, version: 1, name: 'مرجع.png', media: 'image', w: IMAGE_SIZE.w, h: IMAGE_SIZE.h });
  return { doc: r.doc, image: r.id };
}

const put = (doc: ProjectDoc, clip: Parameters<typeof addClip>[1]) => addClip(doc, clip);

// Graphics and text each have two tracks (schema.ts TRACK_LIMITS), and a clip that fits on none is moved to the end of
// the timeline; so at most two graphics and two texts are on screen at once, and the documents below take turns.
const HALF = BENCH_LENGTH / 2;

/** Four shapes moving and turning on keys, two at a time, over a coloured background: the lightest work there is. */
export function plainDoc(): ProjectDoc {
  let doc = newVideoDoc('9:16', 30);
  doc = { ...doc, video: { ...doc.video!, background: '#0d3b2e' } };
  const shapes: { type: 'rect' | 'ellipse' | 'line'; fill: string | null; stroke: string | null }[] = [
    { type: 'rect', fill: '#c9a227', stroke: null },
    { type: 'ellipse', fill: '#ffffff', stroke: '#c9a227' },
    { type: 'rect', fill: null, stroke: '#ffffff' },
    { type: 'line', fill: null, stroke: '#c9a227' },
  ];
  shapes.forEach((s, i) => {
    const r = put(doc, { start: i < 2 ? 0 : HALF, length: HALF, shape: { type: s.type, w: 360, h: 220, fill: s.fill, stroke: s.stroke, strokeWidth: 10, radius: 28 }, transform: { x: 540, y: 500 + (i % 2) * 900, scale: 1, rotation: 0, opacity: 0.9 } });
    doc = updateClip(r.doc, r.clipId, {
      keys: {
        x: [{ t: 0, v: 200 }, { t: HALF, v: 880, ease: 'inOut' }],
        rotation: [{ t: 0, v: 0 }, { t: HALF, v: 90 * (i + 1) }],
        scale: [{ t: 0, v: 0.8 }, { t: HALF / 2, v: 1.2, ease: 'out' }, { t: HALF, v: 0.9 }],
      },
    } as Partial<Clip>);
  });
  return doc;
}

/** Three Arabic texts with a box, a stroke and a shadow, revealed letter by letter and word by word; two at a time. */
export function textDoc(): ProjectDoc {
  let doc = newVideoDoc('9:16', 30);
  const lines = [
    { content: 'مركز الاتصال المؤسسي يرحّب بكم', font: 'IBM Plex Sans Arabic', anim: 'typewriter' as const, y: 420, start: 0, length: BENCH_LENGTH },
    { content: 'لا إله إلا الله، والله أكبر: «الإعلان» عن الفعالية ٢٠٢٦', font: 'Reem Kufi', anim: 'words' as const, y: 1100, start: 0, length: HALF },
    { content: 'Comms Hub 2026 مع نصّ عربي طويل يلتفّ على أكثر من سطر واحد', font: 'Aref Ruqaa', anim: 'fade' as const, y: 1100, start: HALF, length: HALF },
  ];
  for (const l of lines) {
    const r = put(doc, {
      start: l.start,
      length: l.length,
      text: { ...defaultText(l.content), font: l.font, size: 84, box: { color: '#0d3b2e', opacity: 0.7, padding: 24, radius: 16 }, stroke: { color: '#000000', width: 3 }, shadow: { color: 'rgba(0,0,0,0.6)', blur: 14 } },
      transform: { x: 540, y: l.y, scale: 1, rotation: 0, opacity: 1 },
    });
    doc = updateClip(r.doc, r.clipId, { animIn: { kind: l.anim, length: Math.min(sec(2.5), Math.round(l.length * 0.75)) }, animOut: null } as Partial<Clip>);
  }
  return doc;
}

/** 4K footage adjusted, a blurred cross into a second shot, a blurred face and squared papers, and a caption. */
export function effectsDoc(): ProjectDoc {
  let { doc, video } = withVideo(newVideoDoc('16:9', 30));
  const a = put(doc, { source: video, start: 0, length: sec(2.2), in: 0, adjust: { brightness: 12, contrast: 18, saturation: 25 } });
  const b = put(a.doc, { source: video, start: sec(2.2), length: sec(2.4), in: sec(10), adjust: { brightness: -8, contrast: 10, saturation: -30 } });
  doc = setTransition(b.doc, b.clipId, sec(0.6), 'blur');
  doc = put(doc, { start: 0, length: BENCH_LENGTH, cover: { mode: 'blur', amount: 70, shape: 'ellipse', w: 420, h: 520 }, transform: { x: 640, y: 420, scale: 1, rotation: 0, opacity: 1 } }).doc;
  doc = put(doc, { start: 0, length: BENCH_LENGTH, cover: { mode: 'blocks', amount: 45, shape: 'rect', w: 520, h: 300 }, transform: { x: 1380, y: 700, scale: 1, rotation: 8, opacity: 1 } }).doc;
  doc = put(doc, { start: 0, length: BENCH_LENGTH, text: { ...defaultText('تمويه منطقة وإخفاء بالمربعات فوق لقطة 4K'), size: 56, box: { color: '#000000', opacity: 0.6, padding: 18, radius: 12 } }, transform: { x: 960, y: 960, scale: 1, rotation: 0, opacity: 1 } }).doc;
  return doc;
}

/** Every transition once, between alternating stretches of the synthetic video. */
export function transitionsDoc(): ProjectDoc {
  let { doc, video } = withVideo(newVideoDoc('16:9', 30));
  const ids: string[] = [];
  for (let i = 0; i <= TRANSITIONS.length; i++) {
    const r = put(doc, { source: video, start: sec(i * 1.2), length: sec(1.2), in: sec((i % 2) * 20 + i), adjust: i % 2 ? { brightness: 0, contrast: 0, saturation: -100 } : undefined });
    doc = r.doc;
    ids.push(r.clipId);
  }
  TRANSITIONS.forEach((t, i) => {
    doc = setTransition(doc, ids[i + 1], sec(0.5), t.kind);
  });
  return doc;
}

/** Covers in both modes and both shapes, turning and fading, over the synthetic video: blur first, then squares. */
export function coversDoc(): ProjectDoc {
  let { doc, video } = withVideo(newVideoDoc('9:16', 30));
  doc = put(doc, { source: video, start: 0, length: BENCH_LENGTH, in: sec(5), fit: 'cover' }).doc;
  const covers = [
    { mode: 'blur' as const, shape: 'ellipse' as const, amount: 100, x: 300, y: 600, start: 0 },
    { mode: 'blur' as const, shape: 'rect' as const, amount: 20, x: 780, y: 1300, start: 0 },
    { mode: 'blocks' as const, shape: 'ellipse' as const, amount: 80, x: 300, y: 600, start: HALF },
    { mode: 'blocks' as const, shape: 'rect' as const, amount: 10, x: 780, y: 1300, start: HALF },
  ];
  for (const c of covers) {
    const r = put(doc, { start: c.start, length: HALF, cover: { mode: c.mode, amount: c.amount, shape: c.shape, w: 380, h: 300 }, transform: { x: c.x, y: c.y, scale: 1, rotation: 0, opacity: 1 } });
    doc = updateClip(r.doc, r.clipId, { keys: { rotation: [{ t: 0, v: -20 }, { t: HALF, v: 30 }], opacity: [{ t: 0, v: 1 }, { t: HALF, v: 0.4 }] } } as Partial<Clip>);
  }
  return doc;
}

/** A picture moved, scaled, turned and faded on keys of every curve, cropped, with entry and exit movements. */
export function keysDoc(ratio: Ratio = '4:5'): ProjectDoc {
  let { doc, image } = withImage(newVideoDoc(ratio, 30));
  const curves = ['linear', 'in', 'out', 'inOut', 'hold'] as const;
  const r = put(doc, { source: image, start: 0, length: BENCH_LENGTH, crop: { l: 0.05, t: 0.1, r: 0.15, b: 0 }, transform: { x: 540, y: 675, scale: 0.6, rotation: 0, opacity: 1 } });
  doc = updateClip(r.doc, r.clipId, {
    keys: {
      x: curves.map((ease, i) => ({ t: sec(i * 0.8), v: 300 + i * 120, ease })),
      scale: [{ t: 0, v: 0.4 }, { t: BENCH_LENGTH, v: 0.9, ease: 'in' }],
      rotation: [{ t: 0, v: -15 }, { t: BENCH_LENGTH, v: 25, ease: 'out' }],
      opacity: [{ t: 0, v: 0.3 }, { t: sec(1), v: 1, ease: 'inOut' }],
    },
    animIn: { kind: 'pop', length: sec(0.6) },
    animOut: { kind: 'spin', length: sec(0.8) },
  } as Partial<Clip>);
  return doc;
}

/** The first motion template and the brand marks over a background (needs the template assets and marks loaded). */
export function brandDoc(): ProjectDoc {
  let doc = newVideoDoc('1:1', 30);
  doc = { ...doc, video: { ...doc.video!, background: '#f4f6f2' } };
  const g = motionCatalog[0];
  if (g) doc = put(doc, { ...motionClip(g, '1:1', 0), length: BENCH_LENGTH }).doc;
  // the marks take turns on the second graphics track
  const marks = STICKERS.slice(0, 3);
  marks.forEach((key, i) => {
    const start = Math.round((i * BENCH_LENGTH) / marks.length);
    const end = Math.round(((i + 1) * BENCH_LENGTH) / marks.length);
    doc = put(doc, { start, length: end - start, sticker: { key, color: i % 2 ? '#c9a227' : '#0d3b2e' }, transform: { x: 300 + i * 240, y: 860, scale: 0.6, rotation: 0, opacity: 1 } }).doc;
  });
  return doc;
}

/** The three documents the measurement times, by name. */
export const BENCH_DOCS = Object.freeze({ plain: plainDoc, text: textDoc, effects: effectsDoc });

/** The proof's corpus: every reference document, and the times at which each is drawn and compared. */
export function corpus(): { name: string; doc: ProjectDoc; times: number[] }[] {
  const four = [0.1, 1.1, 2.05, 2.5, 3.3, 3.9].map(sec);
  // each transition pulls its clip and the rest back by its half second: clip k starts at k * 0.7 s
  const transitionTimes = TRANSITIONS.map((_, i) => sec((i + 1) * 0.7 + 0.25));
  return [
    { name: 'plain', doc: plainDoc(), times: four },
    { name: 'text', doc: textDoc(), times: four },
    { name: 'effects', doc: effectsDoc(), times: four },
    { name: 'transitions', doc: transitionsDoc(), times: transitionTimes },
    { name: 'covers', doc: coversDoc(), times: four },
    { name: 'keys', doc: keysDoc(), times: four },
    { name: 'brand', doc: brandDoc(), times: [0.2, 0.8, 1.6, 2.4, 3.2].map(sec) },
    { name: 'landscape-keys', doc: keysDoc('16:9'), times: [0.3, 1.9, 3.5].map(sec) },
  ];
}

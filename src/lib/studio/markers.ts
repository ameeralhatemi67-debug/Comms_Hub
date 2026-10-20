// Markers on the time ruler and YouTube chapters (MVP_draft.md 62.8). A marker is a named, coloured point
// in time; in order of time the markers are the chapters of a YouTube video. `chapters` writes them as
// YouTube reads them in a description, and `chapterIssues` checks YouTube's own rules first. Pure.
import { uid, type Marker, type Micros, type ProjectDoc, type VideoBody } from './schema.ts';

export const MARKER_COLORS: { id: string; hex: string; label: string }[] = [
  { id: 'gold', hex: '#d9ad4f', label: 'ذهبي' },
  { id: 'green', hex: '#3fae7a', label: 'أخضر' },
  { id: 'blue', hex: '#4a90d9', label: 'أزرق' },
  { id: 'red', hex: '#e0565b', label: 'أحمر' },
  { id: 'purple', hex: '#9b6fd3', label: 'بنفسجي' },
];
export const markerHex = (color: string) => MARKER_COLORS.find((c) => c.id === color)?.hex ?? MARKER_COLORS[0].hex;
export const MARKER_LABEL_MAX = 80;

/**
 * YouTube's rules for chapters written in a description, from YouTube Help «Video chapters»
 * (https://support.google.com/youtube/answer/9884579), read on 2026-10-20: the first timestamp is 00:00,
 * there are at least three, they are in ascending order, and each chapter is at least 10 seconds long.
 */
export const YOUTUBE_CHAPTERS = { minCount: 3, minLength: 10_000_000, source: 'https://support.google.com/youtube/answer/9884579', checked: '2026-10-20' } as const;

const body = (doc: ProjectDoc): VideoBody => {
  if (doc.kind !== 'video' || !doc.video) throw new Error('NOT_VIDEO');
  return doc.video;
};

/** The markers, valid ones only, in order of time. */
export function markersOf(doc: ProjectDoc): Marker[] {
  const list = doc.video?.markers;
  if (!Array.isArray(list)) return [];
  return list
    .filter((m): m is Marker => !!m && typeof m === 'object' && typeof m.id === 'string' && Number.isFinite(m.t))
    .map((m) => ({ ...m, label: typeof m.label === 'string' ? m.label : '', color: typeof m.color === 'string' ? m.color : 'gold' }))
    .sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
}

const withMarkers = (doc: ProjectDoc, markers: Marker[]): ProjectDoc => ({ ...doc, video: { ...body(doc), markers: markers.sort((a, b) => a.t - b.t) } });

/** A marker at t (a second one at the same moment is not made: that one is returned). */
export function addMarker(doc: ProjectDoc, t: Micros, label?: string, color = 'gold'): { doc: ProjectDoc; id: string } {
  const list = markersOf(doc);
  const at = Math.max(0, Math.round(t));
  const same = list.find((m) => Math.abs(m.t - at) < 1000);
  if (same) return { doc, id: same.id };
  const id = uid('m');
  const name = (label ?? `علامة ${list.length + 1}`).slice(0, MARKER_LABEL_MAX);
  return { doc: withMarkers(doc, [...list, { id, t: at, label: name, color }]), id };
}

export function updateMarker(doc: ProjectDoc, id: string, patch: Partial<Pick<Marker, 't' | 'label' | 'color'>>): ProjectDoc {
  const list = markersOf(doc);
  if (!list.some((m) => m.id === id)) return doc;
  return withMarkers(
    doc,
    list.map((m) => (m.id === id ? { ...m, ...patch, ...(patch.t !== undefined ? { t: Math.max(0, Math.round(patch.t)) } : {}), ...(patch.label !== undefined ? { label: patch.label.slice(0, MARKER_LABEL_MAX) } : {}) } : m)),
  );
}

export function removeMarker(doc: ProjectDoc, id: string): ProjectDoc {
  const list = markersOf(doc);
  return list.some((m) => m.id === id) ? withMarkers(doc, list.filter((m) => m.id !== id)) : doc;
}

/** A time as YouTube writes it in a description: m:ss, or h:mm:ss from an hour (whole seconds, rounded down). */
export function youtubeTime(t: Micros): string {
  const s = Math.max(0, Math.floor(t / 1_000_000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${String(m).padStart(2, '0')}:${sec}`;
}

/** The chapter lines for the description: «00:00 المقدمة», one per marker in order. */
export function chapters(doc: ProjectDoc): string {
  return markersOf(doc)
    .map((m) => `${youtubeTime(m.t)} ${m.label.trim()}`)
    .join('\n');
}

/** What keeps the markers from being YouTube chapters, in Arabic; empty when they may be used. */
export function chapterIssues(doc: ProjectDoc, duration: Micros): string[] {
  const list = markersOf(doc);
  const out: string[] = [];
  if (list.length < YOUTUBE_CHAPTERS.minCount) out.push(`يحتاج يوتيوب ${YOUTUBE_CHAPTERS.minCount} علامات على الأقل؛ في المشروع ${list.length}.`);
  if (list.length && Math.floor(list[0].t / 1_000_000) !== 0) out.push('أول فصل يبدأ عند 00:00: ضع علامة في أول المقطع.');
  list.forEach((m, i) => {
    const end = i + 1 < list.length ? list[i + 1].t : duration;
    if (end - m.t < YOUTUBE_CHAPTERS.minLength) out.push(`الفصل «${m.label.trim() || youtubeTime(m.t)}» أقصر من عشر ثوانٍ.`);
    if (!m.label.trim()) out.push(`العلامة عند ${youtubeTime(m.t)} بلا اسم.`);
  });
  return out;
}

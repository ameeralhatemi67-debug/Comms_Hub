// The studio's project document (MVP_draft.md 62, Studio_Build_Plan.md section 5). One versioned JSON
// object per saved revision, kept in studio_revisions.doc. The database checks the same shape
// (studio_doc_check) and reads the library sources from `sources`, so a client cannot leave a file out
// of the record. Pure: no React, no Next, no DOM, so tests and a future desktop or phone shell can use it.
//
// Rules every client keeps:
//   - Times are whole microseconds (Micros). Frames are only computed at export.
//   - Unknown fields are kept: a client that does not know a field passes it through untouched, so a
//     simpler client (a phone) never strips what a fuller one wrote (Studio_Build_Plan.md section 4).
//   - A source is a library file at an exact version, or a file on one device. Never a download URL.

import type { FontFamily } from './fonts.ts';
import type { Anim, TransitionKind } from './transitions.ts';
import type { Keys } from './keys.ts';

export const DOC_SCHEMA = 1;
/** The database refuses a document above 1 MiB as Postgres prints it; the client keeps a margin. */
export const DOC_MAX_BYTES = 1_000_000;
export const US = 1_000_000;

export type Micros = number;
export type Ratio = '9:16' | '16:9' | '1:1' | '4:5';
export type Fps = 24 | 25 | 30 | 60;

export const RATIOS: Record<Ratio, { w: number; h: number; label: string }> = {
  '9:16': { w: 1080, h: 1920, label: 'طولي 9:16' },
  '16:9': { w: 1920, h: 1080, label: 'عرضي 16:9' },
  '1:1': { w: 1080, h: 1080, label: 'مربع 1:1' },
  '4:5': { w: 1080, h: 1350, label: 'طولي 4:5' },
};
export const FPS_CHOICES: Fps[] = [24, 25, 30, 60];

/** Width by height, kept left to right inside Arabic text (Unicode isolates). */
export const dims = (w: number, h: number) => `⁦${w}×${h}⁩`;

export const PHOTO_PRESETS = [
  { w: 1080, h: 1080, label: 'مربع 1080' },
  { w: 1080, h: 1350, label: `طولي ${dims(1080, 1350)}` },
  { w: 1080, h: 1920, label: `قصة ${dims(1080, 1920)}` },
  { w: 1920, h: 1080, label: `عرضي ${dims(1920, 1080)}` },
] as const;
export const PHOTO_MAX_SIDE = 8000;

export type MediaKind = 'video' | 'image' | 'audio';

type LibraryFields = {
  kind: 'library';
  asset: string;
  version: number;
  name: string;
  media: MediaKind;
  mime?: string;
  w?: number;
  h?: number;
  duration?: Micros;
};
type LocalFields = {
  kind: 'local';
  /** The file's key in this browser's private storage: a fingerprint of its size, name, date and first and last 4 MB. */
  key: string;
  name: string;
  media: MediaKind;
  mime?: string;
  size: number;
  w?: number;
  h?: number;
  duration?: Micros;
};
export type LibrarySource = LibraryFields & { id: string; [extra: string]: unknown };
export type LocalSource = LocalFields & { id: string; [extra: string]: unknown };
/** A source about to be added: its id is made if missing. */
export type NewSource = (LibraryFields | LocalFields) & { id?: string };
export type Source = LibrarySource | LocalSource;

/** Where and how a visual item sits on the canvas. x and y are the centre, in canvas pixels. */
export type Transform = { x: number; y: number; scale: number; rotation: number; opacity: number };
/** Fractions of the source cut from each side, 0 to 0.95. */
export type Crop = { l: number; t: number; r: number; b: number };
/** -100 to 100 each; warmth and blur only on photos. */
export type Adjust = { brightness: number; contrast: number; saturation: number; warmth?: number; blur?: number };
export type Blend = 'normal' | 'multiply' | 'screen';
export type Fit = 'contain' | 'cover';

export const STICKERS = ['emblem', 'wordmark', 'tagline', 'verse1', 'verse2'] as const;
export type StickerKey = (typeof STICKERS)[number];
export const STICKER_LABELS: Record<StickerKey, string> = {
  emblem: 'الشعار',
  wordmark: 'اسم الجهة',
  tagline: 'العبارة',
  verse1: 'آية (1)',
  verse2: 'آية (2)',
};

// The fonts live in fonts.ts (three the site ships, twelve Arabic and ten English, MVP_draft.md 62.4).
export { FONTS, type FontFamily } from './fonts.ts';

export type TextStyle = {
  content: string;
  font: FontFamily;
  weight: number;
  /** Size in canvas pixels. */
  size: number;
  color: string;
  align: 'start' | 'center' | 'end';
  /** Width of the text box as a fraction of the canvas width. */
  width: number;
  lineHeight: number;
  box?: { color: string; opacity: number; padding: number; radius: number } | null;
  stroke?: { color: string; width: number } | null;
  shadow?: { color: string; blur: number } | null;
  /** Entry and exit animation of a timed text. */
  enter?: 'none' | 'fade' | 'rise' | 'slide';
  exit?: 'none' | 'fade' | 'rise' | 'slide';
};

export type Shape = { type: 'rect' | 'ellipse' | 'line'; w: number; h: number; fill: string | null; stroke: string | null; strokeWidth: number; radius: number };

/** A covered area (MVP_draft.md 62.8): what is under it is blurred or turned into large squares. Sizes in canvas pixels; amount 1 to 100. */
export type Cover = { mode: 'blur' | 'blocks'; amount: number; shape: 'rect' | 'ellipse'; w: number; h: number };

/** A marker on the time ruler (MVP_draft.md 62.8); in order of time, they are YouTube's chapters. */
export type Marker = { id: string; t: Micros; label: string; color: string };

/** What a visual item shows. Exactly one of these is set. */
export type Content = {
  source?: string;
  motion?: { template: string; params: Record<string, unknown> };
  text?: TextStyle;
  sticker?: { key: StickerKey; color: string };
  shape?: Shape;
  cover?: Cover;
};

/** A clip's named fields; a stored clip also has its id and may carry fields from newer clients. */
export type ClipFields = Content & {
  start: Micros;
  length: Micros;
  /** Where the clip starts inside its source (video and sound). */
  in?: Micros;
  transform?: Transform;
  fit?: Fit;
  crop?: Crop;
  adjust?: Adjust;
  fadeIn?: Micros;
  fadeOut?: Micros;
  volume?: number;
  mute?: boolean;
  /** A transition from the clip that ends where this one starts, on the same track (kinds in transitions.ts). */
  transition?: { kind: TransitionKind; length: Micros } | null;
  /** Entry and exit movements (transitions.ts). Absent: a text's own older enter and exit apply. */
  animIn?: Anim | null;
  animOut?: Anim | null;
  /** Keyframes of place, size, turn, opacity and speed (keys.ts, MVP_draft.md 62.7). */
  keys?: Keys;
  /** Rate of a video clip, 0.1 to 8 (speed.ts); a ramp is `keys.speed`. */
  speed?: number;
  /** Plays its stretch of the source backwards. */
  reverse?: boolean;
  /** A still: the source frame at this source time for the whole clip. */
  hold?: Micros;
};
export type Clip = ClipFields & { id: string; [extra: string]: unknown };
/** A clip about to be added: its id is made if missing. */
export type NewClip = ClipFields & { id?: string };

export type TrackKind = 'video' | 'graphics' | 'text' | 'audio';
/** Two graphics and two text tracks, so a template or a title can sit over another (a counter and a lower third). */
export const TRACK_LIMITS: Record<TrackKind, number> = { video: 3, graphics: 2, text: 2, audio: 3 };
export const TRACK_LABELS: Record<TrackKind, string> = { video: 'فيديو وصور', graphics: 'رسوم الحركة', text: 'نص', audio: 'صوت' };

export type Track = { id: string; kind: TrackKind; muted?: boolean; hidden?: boolean; locked?: boolean; clips: Clip[]; [extra: string]: unknown };

export type VideoBody = { ratio: Ratio; fps: Fps; background: string; tracks: Track[]; markers?: Marker[]; [extra: string]: unknown };

export type Layer = Content & {
  id: string;
  name?: string;
  hidden?: boolean;
  locked?: boolean;
  transform: Transform;
  fit?: Fit;
  crop?: Crop;
  flip?: { h: boolean; v: boolean };
  blend?: Blend;
  adjust?: Adjust;
  [extra: string]: unknown;
};

export type PhotoBody = { w: number; h: number; background: string | null; layers: Layer[]; [extra: string]: unknown };

export type ProjectDoc = {
  schema: number;
  kind: 'video' | 'photo';
  sources: Source[];
  video?: VideoBody;
  photo?: PhotoBody;
  [extra: string]: unknown;
};

/** A short id, unique inside one project. */
export function uid(prefix = ''): string {
  const c = globalThis.crypto;
  const s = c && 'randomUUID' in c ? c.randomUUID().replace(/-/g, '').slice(0, 10) : Math.random().toString(36).slice(2, 12);
  return prefix + s;
}

export function newVideoDoc(ratio: Ratio = '9:16', fps: Fps = 30): ProjectDoc {
  return {
    schema: DOC_SCHEMA,
    kind: 'video',
    sources: [],
    video: {
      ratio,
      fps,
      background: '#000000',
      tracks: [
        { id: uid('t'), kind: 'video', clips: [] },
        { id: uid('t'), kind: 'graphics', clips: [] },
        { id: uid('t'), kind: 'text', clips: [] },
        { id: uid('t'), kind: 'audio', clips: [] },
      ],
    },
  };
}

export function newPhotoDoc(w = 1080, h = 1080): ProjectDoc {
  return { schema: DOC_SCHEMA, kind: 'photo', sources: [], photo: { w: clampSide(w), h: clampSide(h), background: '#ffffff', layers: [] } };
}

const clampSide = (n: number) => Math.min(PHOTO_MAX_SIDE, Math.max(16, Math.round(n || 0)));

/** The canvas size of a project. */
export function canvasOf(doc: ProjectDoc): { w: number; h: number } {
  if (doc.kind === 'photo' && doc.photo) return { w: doc.photo.w, h: doc.photo.h };
  return RATIOS[doc.video?.ratio ?? '9:16'] ?? RATIOS['9:16'];
}

/** The end of the last clip, or zero. */
export function durationOf(doc: ProjectDoc): Micros {
  if (doc.kind !== 'video' || !doc.video) return 0;
  let end = 0;
  for (const t of doc.video.tracks) for (const c of t.clips) end = Math.max(end, c.start + c.length);
  return end;
}

/** The library files a document uses, once each: what the database records in studio_sources. */
export function librarySources(doc: ProjectDoc): { asset: string; version: number }[] {
  const seen = new Set<string>();
  const out: { asset: string; version: number }[] = [];
  for (const s of doc.sources) {
    if (s.kind !== 'library') continue;
    const k = `${s.asset}:${s.version}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ asset: s.asset, version: s.version });
  }
  return out;
}

/** Sources that exist only on one device: a saved project with these does not open complete elsewhere. */
export const localSources = (doc: ProjectDoc) => doc.sources.filter((s): s is LocalSource => s.kind === 'local');

/** Size of the document as stored, in bytes of UTF-8. */
export const docBytes = (doc: ProjectDoc) => new TextEncoder().encode(JSON.stringify(doc)).length;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * The checks the database makes before it keeps a document (studio_doc_check), as error codes:
 * null when the document may be saved.
 */
export function checkDoc(doc: unknown, kind?: 'video' | 'photo'): null | 'DOC_INVALID' | 'DOC_TOO_LARGE' {
  if (!isObj(doc)) return 'DOC_INVALID';
  if (typeof doc.schema !== 'number' || !Number.isInteger(doc.schema) || doc.schema < 1 || doc.schema > DOC_SCHEMA) return 'DOC_INVALID';
  if (doc.kind !== 'video' && doc.kind !== 'photo') return 'DOC_INVALID';
  if (kind && doc.kind !== kind) return 'DOC_INVALID';
  if (!Array.isArray(doc.sources)) return 'DOC_INVALID';
  const ids = new Set<string>();
  for (const s of doc.sources) {
    if (!isObj(s) || typeof s.id !== 'string' || !s.id || ids.has(s.id)) return 'DOC_INVALID';
    ids.add(s.id);
    if (s.kind === 'library') {
      if (typeof s.asset !== 'string' || !UUID.test(s.asset)) return 'DOC_INVALID';
      if (typeof s.version !== 'number' || !Number.isInteger(s.version) || s.version < 1) return 'DOC_INVALID';
    } else if (s.kind !== 'local') return 'DOC_INVALID';
  }
  if (doc.kind === 'video' && (!isObj(doc.video) || !Array.isArray(doc.video.tracks))) return 'DOC_INVALID';
  if (doc.kind === 'photo' && (!isObj(doc.photo) || !Array.isArray(doc.photo.layers))) return 'DOC_INVALID';
  if (docBytes(doc as ProjectDoc) > DOC_MAX_BYTES) return 'DOC_TOO_LARGE';
  return null;
}

/**
 * A document read from the database, made ready for this client: older schemas migrated, missing
 * defaults filled. Fields this client does not know are left exactly as they are.
 */
export function openDoc(raw: unknown): ProjectDoc {
  if (checkDoc(raw) === 'DOC_INVALID') throw new Error('DOC_INVALID');
  const doc = structuredClone(raw) as ProjectDoc;
  if (doc.kind === 'video' && doc.video) {
    const v = doc.video;
    if (!RATIOS[v.ratio]) v.ratio = '9:16';
    if (!FPS_CHOICES.includes(v.fps)) v.fps = 30;
    if (typeof v.background !== 'string') v.background = '#000000';
    for (const t of v.tracks) if (!Array.isArray(t.clips)) t.clips = [];
  }
  if (doc.kind === 'photo' && doc.photo) {
    const p = doc.photo;
    p.w = clampSide(p.w);
    p.h = clampSide(p.h);
    if (p.background !== null && typeof p.background !== 'string') p.background = '#ffffff';
  }
  return doc;
}

/** Every source id a clip or layer points at that is missing from `sources` (a broken document). */
export function danglingSources(doc: ProjectDoc): string[] {
  const ids = new Set(doc.sources.map((s) => s.id));
  const used = new Set<string>();
  if (doc.video) for (const t of doc.video.tracks) for (const c of t.clips) if (c.source) used.add(c.source);
  if (doc.photo) for (const l of doc.photo.layers) if (l.source) used.add(l.source);
  return [...used].filter((id) => !ids.has(id));
}

/** Sources no clip or layer uses any more, which a save may drop from the record. */
export function unusedSources(doc: ProjectDoc): string[] {
  const used = new Set<string>();
  if (doc.video) for (const t of doc.video.tracks) for (const c of t.clips) if (c.source) used.add(c.source);
  if (doc.photo) for (const l of doc.photo.layers) if (l.source) used.add(l.source);
  return doc.sources.filter((s) => !used.has(s.id)).map((s) => s.id);
}

export const KIND_LABELS = { video: 'فيديو', photo: 'صورة' } as const;

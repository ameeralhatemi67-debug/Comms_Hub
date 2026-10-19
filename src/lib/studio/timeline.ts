// Timeline operations of a video project (MVP_draft.md 62): add, move, trim, split, delete with or
// without closing the gap, duplicate, cross-fade, tracks, snapping. Every operation returns a new
// document and leaves the old one untouched (so history keeps old ones as they were). Pure.
//
// Rules:
//   - Clips on one track do not overlap, except that a clip with a cross-fade overlaps the end of the
//     clip before it by the cross-fade's length.
//   - A video or sound clip never runs past its source (in + length <= the source's duration).
//   - Tracks are kept in drawing order, bottom first: video tracks, then graphics, then text; sound
//     tracks are not drawn. A clip is at least one frame long.
import {
  RATIOS as RATIO_SIZES, TRACK_LIMITS, uid, type Clip, type Fps, type Micros, type NewClip, type NewSource, type ProjectDoc, type Ratio, type Source, type Track, type TrackKind, type VideoBody,
} from './schema.ts';
import { frameUs } from './time.ts';

export type Located = { track: Track; clip: Clip; ti: number; ci: number };

const body = (doc: ProjectDoc): VideoBody => {
  if (doc.kind !== 'video' || !doc.video) throw new Error('NOT_VIDEO');
  return doc.video;
};
const withTracks = (doc: ProjectDoc, tracks: Track[]): ProjectDoc => ({ ...doc, video: { ...body(doc), tracks } });
const end = (c: Clip) => c.start + c.length;
const byStart = (a: Clip, b: Clip) => a.start - b.start || a.id.localeCompare(b.id);

/** The shortest clip: one frame. */
export const minLength = (doc: ProjectDoc): Micros => frameUs(body(doc).fps);

export function locate(doc: ProjectDoc, id: string): Located | null {
  const tracks = body(doc).tracks;
  for (let ti = 0; ti < tracks.length; ti++) {
    const ci = tracks[ti].clips.findIndex((c) => c.id === id);
    if (ci >= 0) return { track: tracks[ti], clip: tracks[ti].clips[ci], ti, ci };
  }
  return null;
}

export const sourceOf = (doc: ProjectDoc, id: string | undefined): Source | undefined => (id ? doc.sources.find((s) => s.id === id) : undefined);

/** How long a clip may be cut from its source: the source's duration less where it starts. */
export function maxLengthOf(doc: ProjectDoc, c: Clip): Micros {
  const s = sourceOf(doc, c.source);
  if (!s || s.media === 'image' || !s.duration) return Number.POSITIVE_INFINITY;
  return Math.max(0, s.duration - (c.in ?? 0));
}

/** The track kind a clip belongs on. */
export function kindFor(doc: ProjectDoc, c: Pick<Clip, 'source' | 'motion' | 'text' | 'sticker' | 'shape'>): TrackKind {
  if (c.text) return 'text';
  if (c.motion || c.sticker || c.shape) return 'graphics';
  const s = sourceOf(doc, c.source);
  return s?.media === 'audio' ? 'audio' : 'video';
}

/** How much a later clip may overlap the one before it: its cross-fade. */
export const overlapAllowed = (before: Clip, after: Clip) => (after.transition ? Math.min(after.transition.length, before.length, after.length) : 0);

/** Does `clip` fit on `track` (other clips than `ignore` only)? */
export function fits(track: Track, clip: Clip, ignore: string | null = clip.id): boolean {
  if (clip.start < 0 || clip.length <= 0) return false;
  for (const o of track.clips) {
    if (o.id === ignore || o.id === clip.id) continue;
    if (end(o) <= clip.start || end(clip) <= o.start) continue;
    // they overlap: allowed only by a cross-fade, the later over the earlier one's end
    const [a, b] = o.start <= clip.start ? [o, clip] : [clip, o];
    if (end(a) - b.start > overlapAllowed(a, b) || end(b) < end(a)) return false;
  }
  return true;
}

/** The nearest start to `desired` (not before 0) where the clip fits on the track, or null. */
export function legalStart(track: Track, clip: Clip, desired: Micros): Micros | null {
  const want = Math.max(0, Math.round(desired));
  const at = (s: number) => fits(track, { ...clip, start: s });
  if (at(want)) return want;
  const others = track.clips.filter((o) => o.id !== clip.id);
  const candidates = new Set<number>([0]);
  for (const o of others) {
    candidates.add(end(o));
    candidates.add(Math.max(0, o.start - clip.length));
  }
  let best: number | null = null;
  for (const s of candidates) if (at(s) && (best === null || Math.abs(s - want) < Math.abs(best - want))) best = s;
  return best;
}

/** Where the last clip of a track ends. */
export const trackEnd = (t: Track) => t.clips.reduce((m, c) => Math.max(m, end(c)), 0);

function insertTrack(tracks: Track[], kind: TrackKind): { tracks: Track[]; track: Track } {
  const track: Track = { id: uid('t'), kind, clips: [] };
  const order: TrackKind[] = ['video', 'graphics', 'text', 'audio'];
  const rank = order.indexOf(kind);
  let at = tracks.length;
  for (let i = 0; i < tracks.length; i++) {
    if (order.indexOf(tracks[i].kind) > rank) {
      at = i;
      break;
    }
  }
  const next = [...tracks];
  next.splice(at, 0, track);
  return { tracks: next, track };
}

export function addTrack(doc: ProjectDoc, kind: TrackKind): ProjectDoc {
  const tracks = body(doc).tracks;
  if (tracks.filter((t) => t.kind === kind).length >= TRACK_LIMITS[kind]) return doc;
  return withTracks(doc, insertTrack(tracks, kind).tracks);
}

export function removeTrack(doc: ProjectDoc, id: string): ProjectDoc {
  const tracks = body(doc).tracks;
  const t = tracks.find((x) => x.id === id);
  if (!t || t.clips.length || tracks.filter((x) => x.kind === t.kind).length <= 1) return doc;
  return withTracks(doc, tracks.filter((x) => x.id !== id));
}

export function setTrack(doc: ProjectDoc, id: string, patch: Partial<Pick<Track, 'muted' | 'hidden' | 'locked'>>): ProjectDoc {
  return withTracks(doc, body(doc).tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)));
}

/**
 * Put a clip on the timeline: on the given track if it fits there, else on another track of its kind
 * where it fits, else on a new track of that kind (within the limits), else at the end of the first
 * track of its kind. Returns the document and where the clip went.
 */
export function addClip(doc: ProjectDoc, clip: NewClip, opts: { trackId?: string; at?: Micros } = {}): { doc: ProjectDoc; clipId: string; trackId: string } {
  const kind = kindFor(doc, clip);
  const c: Clip = { ...clip, id: clip.id ?? uid('c'), start: Math.max(0, Math.round(opts.at ?? clip.start ?? 0)), length: Math.max(minLength(doc), Math.round(clip.length)) };
  let tracks = body(doc).tracks;
  const same = tracks.filter((t) => t.kind === kind);
  const preferred = opts.trackId ? same.find((t) => t.id === opts.trackId) : undefined;
  const order = preferred ? [preferred, ...same.filter((t) => t !== preferred)] : same;
  let target = order.find((t) => fits(t, c));
  if (!target) {
    if (same.length < TRACK_LIMITS[kind]) {
      const made = insertTrack(tracks, kind);
      tracks = made.tracks;
      target = made.track;
    } else {
      target = order[0];
      c.start = trackEnd(target);
    }
  }
  const tid = target.id;
  const next = tracks.map((t) => (t.id === tid ? { ...t, clips: [...t.clips, c].sort(byStart) } : t));
  return { doc: withTracks(doc, next), clipId: c.id, trackId: tid };
}

export function updateClip(doc: ProjectDoc, id: string, patch: Partial<Clip> | ((c: Clip) => Clip)): ProjectDoc {
  const at = locate(doc, id);
  if (!at) return doc;
  const next = typeof patch === 'function' ? patch(at.clip) : { ...at.clip, ...patch };
  return withTracks(doc, body(doc).tracks.map((t, i) => (i === at.ti ? { ...t, clips: t.clips.map((c) => (c.id === id ? next : c)).sort(byStart) } : t)));
}

/** Move a clip to a start time (and another track of its kind). Unchanged when it does not fit there. */
export function moveClip(doc: ProjectDoc, id: string, start: Micros, trackId?: string): ProjectDoc {
  const at = locate(doc, id);
  if (!at || at.track.locked) return doc;
  const dest = trackId ? body(doc).tracks.find((t) => t.id === trackId) : at.track;
  if (!dest || dest.kind !== at.track.kind || dest.locked) return doc;
  const moved = { ...at.clip, start: Math.max(0, Math.round(start)) };
  if (!fits(dest, moved)) return doc;
  return withTracks(
    doc,
    body(doc).tracks.map((t) => {
      if (t.id === dest.id && t.id === at.track.id) return { ...t, clips: t.clips.map((c) => (c.id === id ? moved : c)).sort(byStart) };
      if (t.id === at.track.id) return { ...t, clips: t.clips.filter((c) => c.id !== id) };
      if (t.id === dest.id) return { ...t, clips: [...t.clips, moved].sort(byStart) };
      return t;
    }),
  );
}

/** Move a clip's start edge (its end stays). Video and sound cannot reach before their source's start. */
export function trimStart(doc: ProjectDoc, id: string, newStart: Micros): ProjectDoc {
  const at = locate(doc, id);
  if (!at || at.track.locked) return doc;
  const c = at.clip;
  const min = minLength(doc);
  const s = sourceOf(doc, c.source);
  const timed = !!s && s.media !== 'image';
  let start = Math.round(newStart);
  start = Math.min(start, end(c) - min);
  start = Math.max(start, 0);
  if (timed || c.motion) start = Math.max(start, c.start - (c.in ?? 0));
  const delta = start - c.start;
  const next: Clip = { ...c, start, length: c.length - delta, ...(timed || c.motion ? { in: (c.in ?? 0) + delta } : {}) };
  if (!fits(at.track, next)) return doc;
  return updateClip(doc, id, next);
}

/** Move a clip's end edge. A motion clip's showcase follows its length (see motion-adapter). */
export function trimEnd(doc: ProjectDoc, id: string, newEnd: Micros): ProjectDoc {
  const at = locate(doc, id);
  if (!at || at.track.locked) return doc;
  const c = at.clip;
  const length = Math.min(Math.max(minLength(doc), Math.round(newEnd) - c.start), maxLengthOf(doc, c));
  const next = { ...c, length };
  if (!fits(at.track, next)) return doc;
  return updateClip(doc, id, next);
}

/** Cut a clip in two at a time inside it; the second part continues where the first stopped. */
export function splitClip(doc: ProjectDoc, id: string, t: Micros): { doc: ProjectDoc; secondId: string | null } {
  const at = locate(doc, id);
  if (!at || at.track.locked) return { doc, secondId: null };
  const c = at.clip;
  const min = minLength(doc);
  const cut = Math.round(t);
  if (cut < c.start + min || cut > end(c) - min) return { doc, secondId: null };
  const first: Clip = { ...c, length: cut - c.start, fadeOut: 0 };
  const second: Clip = { ...structuredClone(c), id: uid('c'), start: cut, length: end(c) - cut, in: (c.in ?? 0) + (cut - c.start), fadeIn: 0, transition: null };
  const tracks = body(doc).tracks.map((tr, i) => (i === at.ti ? { ...tr, clips: [...tr.clips.filter((x) => x.id !== id), first, second].sort(byStart) } : tr));
  return { doc: withTracks(doc, tracks), secondId: second.id };
}

/** Delete a clip; with `ripple`, the clips after it on its track move back to close the gap. */
export function removeClip(doc: ProjectDoc, id: string, ripple = false): ProjectDoc {
  const at = locate(doc, id);
  if (!at || at.track.locked) return doc;
  const gone = at.clip;
  const tracks = body(doc).tracks.map((t, i) => {
    if (i !== at.ti) return t;
    let clips = t.clips.filter((c) => c.id !== id);
    if (ripple) {
      const shift = gone.length - (gone.transition ? overlapAllowedBefore(t, gone) : 0);
      clips = clips.map((c) => (c.start >= end(gone) - 1 ? { ...c, start: Math.max(0, c.start - shift) } : c));
      // a clip that followed with a cross-fade into the deleted one has nothing to fade from any more
      clips = clips.map((c) => (c.transition && !clips.some((o) => o !== c && end(o) > c.start && o.start < c.start) ? { ...c, transition: null } : c));
    }
    return { ...t, clips: clips.sort(byStart) };
  });
  return withTracks(doc, tracks);
}

function overlapAllowedBefore(t: Track, c: Clip): number {
  const before = t.clips.filter((o) => o.id !== c.id && o.start < c.start).sort(byStart).pop();
  return before ? Math.max(0, Math.min(end(before) - c.start, overlapAllowed(before, c))) : 0;
}

/** A copy right after the clip on its track, or wherever it fits. */
export function duplicateClip(doc: ProjectDoc, id: string): { doc: ProjectDoc; clipId: string | null } {
  const at = locate(doc, id);
  if (!at) return { doc, clipId: null };
  const copy = { ...structuredClone(at.clip), id: uid('c'), transition: null };
  const start = legalStart(at.track, { ...copy, start: end(at.clip) }, end(at.clip));
  const r = addClip(doc, { ...copy, start: start ?? end(at.clip) }, { trackId: start !== null ? at.track.id : undefined, at: start ?? undefined });
  return { doc: r.doc, clipId: r.clipId };
}

/**
 * A cross-fade into this clip from the clip that ends where it starts. Setting it moves this clip and
 * the ones after it on the track back by the fade's length, so the two overlap; removing it moves them
 * forward again. The fade is at most half of the shorter clip.
 */
export function setTransition(doc: ProjectDoc, id: string, length: Micros | null): ProjectDoc {
  const at = locate(doc, id);
  if (!at || at.track.locked) return doc;
  const b = at.clip;
  const sorted = [...at.track.clips].sort(byStart);
  const prev = sorted[sorted.indexOf(b) - 1];
  const current = b.transition ? Math.max(0, prev ? end(prev) - b.start : 0) : 0;
  if (!prev && length) return doc;
  if (prev && end(prev) - current !== b.start && Math.abs(end(prev) - current - b.start) > 1) {
    if (length) return doc; // there is a gap: nothing to fade from
  }
  const want = length ? Math.min(Math.round(length), Math.floor(Math.min(prev!.length, b.length) / 2)) : 0;
  if (length && want < minLength(doc)) return doc;
  const shift = current - want; // positive: move forward (shorter or no fade); negative: move back
  const tracks = body(doc).tracks.map((t, i) => {
    if (i !== at.ti) return t;
    const clips = t.clips.map((c) => {
      if (c.id === id) return { ...c, start: c.start + shift, transition: want ? { kind: 'fade' as const, length: want } : null };
      if (c.start > b.start) return { ...c, start: c.start + shift };
      return c;
    });
    return { ...t, clips: clips.sort(byStart) };
  });
  return withTracks(doc, tracks);
}

/** Times a moving edge snaps to: 0, every clip edge (but the moving clip's), and extra points (the playhead). */
export function snapPoints(doc: ProjectDoc, exclude: string | null, extra: Micros[] = []): Micros[] {
  const pts = new Set<number>([0, ...extra]);
  for (const t of body(doc).tracks) for (const c of t.clips) if (c.id !== exclude) pts.add(c.start).add(end(c));
  return [...pts].sort((a, b) => a - b);
}

/** `t` moved onto the nearest point within `tolerance`, or left as it is. */
export function snapTo(t: Micros, points: Micros[], tolerance: Micros): Micros {
  let best = t;
  let gap = tolerance + 1;
  for (const p of points) {
    const d = Math.abs(p - t);
    if (d < gap) {
      gap = d;
      best = p;
    }
  }
  return gap <= tolerance ? best : t;
}

/** The clips seen at time t, in drawing order (bottom first). Hidden tracks are left out. */
export function visibleAt(doc: ProjectDoc, t: Micros): { track: Track; clip: Clip }[] {
  const out: { track: Track; clip: Clip }[] = [];
  for (const track of body(doc).tracks) {
    if (track.kind === 'audio' || track.hidden) continue;
    const clips = [...track.clips].sort(byStart);
    for (const clip of clips) if (clip.start <= t && t < end(clip)) out.push({ track, clip });
  }
  return out;
}

/** The clips heard at time t: sound tracks and the sound of video clips, unless muted. */
export function audibleAt(doc: ProjectDoc, t: Micros): { track: Track; clip: Clip }[] {
  const out: { track: Track; clip: Clip }[] = [];
  for (const track of body(doc).tracks) {
    if (track.muted || (track.kind !== 'audio' && track.kind !== 'video')) continue;
    for (const clip of track.clips) {
      if (clip.mute || !(clip.start <= t && t < end(clip))) continue;
      const s = sourceOf(doc, clip.source);
      if (s && s.media !== 'image') out.push({ track, clip });
    }
  }
  return out;
}

/**
 * How much of a clip shows at time t (0 to 1) from its own fades and its cross-fade: a clip fades in
 * over `fadeIn` or over its cross-fade, and out over `fadeOut`.
 */
export function clipAlpha(c: Clip, t: Micros): number {
  const into = t - c.start;
  const left = end(c) - t;
  let a = 1;
  const fin = c.transition ? c.transition.length : (c.fadeIn ?? 0);
  if (fin > 0 && into < fin) a = Math.min(a, Math.max(0, into / fin));
  const fout = c.fadeOut ?? 0;
  if (fout > 0 && left < fout) a = Math.min(a, Math.max(0, left / fout));
  return a;
}

/**
 * The gain of a clip's sound at time t (0 to 2): its volume, its fades, and the cross-fades on either
 * side (equal power, so the level does not dip in the middle).
 */
export function clipGain(track: Track, c: Clip, t: Micros): number {
  const v = c.mute ? 0 : (c.volume ?? 1);
  const into = t - c.start;
  const left = end(c) - t;
  let g = 1;
  if (c.transition && into < c.transition.length) g *= Math.sin((Math.PI / 2) * Math.max(0, into / c.transition.length));
  else if ((c.fadeIn ?? 0) > 0 && into < c.fadeIn!) g *= Math.max(0, into / c.fadeIn!);
  const next = track.clips.find((o) => o.transition && o.start < end(c) && o.start > c.start);
  if (next && t >= next.start) g *= Math.cos((Math.PI / 2) * Math.min(1, (t - next.start) / next.transition!.length));
  else if ((c.fadeOut ?? 0) > 0 && left < c.fadeOut!) g *= Math.max(0, left / c.fadeOut!);
  return v * g;
}

/** A source added once: a library file at a version, or a device file by its key. Returns its id. */
export function addSource(doc: ProjectDoc, src: NewSource): { doc: ProjectDoc; id: string } {
  const same = doc.sources.find((s) =>
    s.kind === 'library' && src.kind === 'library'
      ? s.asset === src.asset && s.version === src.version
      : s.kind === 'local' && src.kind === 'local' && s.key === src.key,
  );
  if (same) return { doc, id: same.id };
  const id = src.id ?? uid('s');
  return { doc: { ...doc, sources: [...doc.sources, { ...src, id } as Source] }, id };
}

/** Drops sources nothing uses any more (a save keeps the record to what the project needs). */
export function pruneSources(doc: ProjectDoc): ProjectDoc {
  const used = new Set<string>();
  if (doc.video) for (const t of doc.video.tracks) for (const c of t.clips) if (c.source) used.add(c.source);
  if (doc.photo) for (const l of doc.photo.layers) if (l.source) used.add(l.source);
  const kept = doc.sources.filter((s) => used.has(s.id));
  return kept.length === doc.sources.length ? doc : { ...doc, sources: kept };
}

/**
 * A new shape or frame rate for a video project. Placed items keep their place relative to the frame
 * (their centres are moved in proportion), and clip edges stay where they were in time.
 */
export function setFormat(doc: ProjectDoc, patch: { ratio?: Ratio; fps?: Fps; background?: string }): ProjectDoc {
  const v = body(doc);
  const from = RATIO_SIZES[v.ratio];
  const to = RATIO_SIZES[patch.ratio ?? v.ratio];
  const kx = to.w / from.w;
  const ky = to.h / from.h;
  const tracks = patch.ratio && patch.ratio !== v.ratio
    ? v.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.transform ? { ...c, transform: { ...c.transform, x: c.transform.x * kx, y: c.transform.y * ky } } : c)) }))
    : v.tracks;
  return { ...doc, video: { ...v, ...patch, tracks } };
}

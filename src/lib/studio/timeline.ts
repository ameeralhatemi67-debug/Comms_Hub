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
import type { TransitionKind } from './transitions.ts';
import { MOTION_PROPS, shiftKeys, splitKeys, tidyKeys, valueAt as valueAtKeys, type KeyProp } from './keys.ts';
import { area, clampSpeed, isHold, lengthForSpan, maxLengthFor, retimed, sourceSpan, sourceTime, speedAt } from './speed.ts';

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

/** How long a clip may be cut from its source: until its source runs out, at its speed (speed.ts). */
export function maxLengthOf(doc: ProjectDoc, c: Clip): Micros {
  const s = sourceOf(doc, c.source);
  if (!s || s.media === 'image' || !s.duration) return Number.POSITIVE_INFINITY;
  return maxLengthFor(c, s.duration);
}

/** The plain values of a clip's keyed settings (what a key added at a cut starts from). */
const baseValues = (c: Clip): Partial<Record<KeyProp, number>> => ({
  x: c.transform?.x ?? 0, y: c.transform?.y ?? 0, scale: c.transform?.scale ?? 1, rotation: c.transform?.rotation ?? 0, opacity: c.transform?.opacity ?? 1, speed: c.speed ?? 1,
});

/** The track kind a clip belongs on. */
export function kindFor(doc: ProjectDoc, c: Pick<Clip, 'source' | 'motion' | 'text' | 'sticker' | 'shape' | 'cover'>): TrackKind {
  if (c.text) return 'text';
  if (c.motion || c.sticker || c.shape || c.cover) return 'graphics';
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

/**
 * Move a clip's start edge (its end stays). Video and sound cannot reach before their source's start (or,
 * reversed, past its end); keys stay where they were in time; a re-timed clip moves through its source at
 * its own speed (speed.ts).
 */
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
  let next: Clip;
  if (timed && !isHold(c) && retimed(c)) {
    const from = c.in ?? 0;
    if (c.reverse) {
      // the stretch's start (in) stays; its end may not pass the source's end
      const room = (s.duration ?? Number.POSITIVE_INFINITY) - (from + sourceSpan(c));
      const earliest = room === Number.POSITIVE_INFINITY ? -Infinity : c.start - (lengthAtBack(c, room));
      start = Math.max(start, earliest);
      const delta = start - c.start;
      next = { ...c, start, length: c.length - delta, keys: shiftKeys(c.keys, -delta) };
    } else {
      const earliest = c.start - lengthAtBack(c, from);
      start = Math.max(start, earliest);
      const delta = start - c.start;
      next = { ...c, start, length: c.length - delta, in: Math.max(0, Math.round(from + area(c, 0, delta))), keys: shiftKeys(c.keys, -delta) };
    }
  } else {
    if ((timed && !isHold(c)) || c.motion) start = Math.max(start, c.start - (c.in ?? 0));
    const delta = start - c.start;
    next = { ...c, start, length: c.length - delta, ...((timed && !isHold(c)) || c.motion ? { in: (c.in ?? 0) + delta } : {}), keys: shiftKeys(c.keys, -delta) };
  }
  if (!next.keys) delete next.keys;
  if (!fits(at.track, next)) return doc;
  // replaced whole: a field removed here stays removed
  return updateClip(doc, id, () => next);
}

/** How far before its start a re-timed clip may reach to cover `amount` of source. */
function lengthAtBack(c: Clip, amount: number): Micros {
  if (amount <= 0) return 0;
  // the speed before the clip's start is that of its first moment
  return Math.round(amount / clampSpeed(speedAt(c, 0)));
}

/** Move a clip's end edge. A motion clip's showcase follows its length (see motion-adapter). */
export function trimEnd(doc: ProjectDoc, id: string, newEnd: Micros): ProjectDoc {
  const at = locate(doc, id);
  if (!at || at.track.locked) return doc;
  const c = at.clip;
  const length = Math.min(Math.max(minLength(doc), Math.round(newEnd) - c.start), maxLengthOf(doc, c));
  let next: Clip = { ...c, length };
  // reversed, the end shows the stretch's start: it moves through the source while the start stays
  if (c.reverse && !isHold(c) && sourceOf(doc, c.source)?.media === 'video') {
    const hi = (c.in ?? 0) + sourceSpan(c);
    next = { ...next, in: Math.max(0, Math.round(hi - area(c, 0, length))) };
  }
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
  const d = cut - c.start;
  const [ka, kb] = splitKeys(c.keys, d, baseValues(c));
  const first: Clip = { ...c, length: d, fadeOut: 0, keys: ka };
  const second: Clip = { ...structuredClone(c), id: uid('c'), start: cut, length: end(c) - cut, in: (c.in ?? 0) + d, fadeIn: 0, transition: null, keys: kb };
  if (isHold(c)) second.in = c.in;
  else if (retimed(c) && c.source) {
    // forwards the second part starts where the source reached; reversed the first part ends there
    const from = c.in ?? 0;
    if (c.reverse) {
      first.in = Math.round(from + area(c, d, c.length));
      second.in = from;
    } else second.in = Math.round(from + area(c, 0, d));
  }
  for (const x of [first, second]) if (!x.keys) delete x.keys;
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
export function setTransition(doc: ProjectDoc, id: string, length: Micros | null, kind?: TransitionKind): ProjectDoc {
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
      if (c.id === id) return { ...c, start: c.start + shift, transition: want ? { kind: kind ?? b.transition?.kind ?? 'fade', length: want } : null };
      if (c.start > b.start) return { ...c, start: c.start + shift };
      return c;
    });
    return { ...t, clips: clips.sort(byStart) };
  });
  return withTracks(doc, tracks);
}

/** The clip on the same track that ends where this one starts (within a microsecond, or overlapping by its transition). */
export function prevAdjacent(doc: ProjectDoc, id: string): Clip | null {
  const at = locate(doc, id);
  if (!at) return null;
  const sorted = [...at.track.clips].sort(byStart);
  const prev = sorted[sorted.indexOf(at.clip) - 1];
  if (!prev) return null;
  const overlap = at.clip.transition ? end(prev) - at.clip.start : 0;
  return Math.abs(end(prev) - overlap - at.clip.start) <= 1 ? prev : null;
}

/** The clip on the same track that starts where this one ends. */
export function nextAdjacent(doc: ProjectDoc, id: string): Clip | null {
  const at = locate(doc, id);
  if (!at) return null;
  const sorted = [...at.track.clips].sort(byStart);
  const next = sorted[sorted.indexOf(at.clip) + 1];
  return next && prevAdjacent(doc, next.id)?.id === id ? next : null;
}

/** Times a moving edge snaps to: 0, every clip edge (but the moving clip's), the markers, and extra points (the playhead). */
export function snapPoints(doc: ProjectDoc, exclude: string | null, extra: Micros[] = []): Micros[] {
  const pts = new Set<number>([0, ...extra]);
  for (const t of body(doc).tracks) for (const c of t.clips) if (c.id !== exclude) pts.add(c.start).add(end(c));
  for (const m of body(doc).markers ?? []) if (m && Number.isFinite(m.t)) pts.add(m.t);
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
      if (clip.mute || retimed(clip) || !(clip.start <= t && t < end(clip))) continue;
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
  // a cross-fade («fade», the older kind) is the clip's opacity; other transitions are drawn by compose.ts
  const fin = c.transition ? (!c.transition.kind || c.transition.kind === 'fade' ? c.transition.length : 0) : (c.fadeIn ?? 0);
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

// ---------------------------------------------------------------------------
// Speed, reverse and stills (MVP_draft.md 62.7, speed.ts)
// ---------------------------------------------------------------------------

/** Where the next clip on the clip's track starts (the room a longer clip has), or Infinity. */
function roomAfter(track: Track, c: Clip): Micros {
  const later = track.clips.filter((o) => o.id !== c.id && o.start >= end(c) - (o.transition?.length ?? 0) - 1);
  return later.length ? Math.min(...later.map((o) => o.start + (o.transition?.length ?? 0))) - c.start : Number.POSITIVE_INFINITY;
}

/**
 * A new constant speed for a video clip. It keeps showing the same stretch of its source, so its length
 * changes (twice as fast, half as long), within the room before the next clip on its track and the end of
 * its source. A clip with a ramp keeps its ramp: the ramp's points are its speed.
 */
export function setSpeed(doc: ProjectDoc, id: string, speed: number): ProjectDoc {
  const at = locate(doc, id);
  if (!at || at.track.locked || isHold(at.clip)) return doc;
  const c = at.clip;
  const v = clampSpeed(speed);
  const span = sourceSpan(c);
  const next: Clip = { ...c, speed: v === 1 ? undefined : v };
  if (next.speed === undefined) delete next.speed;
  if (!c.keys?.speed?.length) next.length = lengthForSpan(next, span);
  next.length = Math.max(minLength(doc), Math.min(next.length, roomAfter(at.track, c), maxLengthOf(doc, next)));
  return fits(at.track, next) ? updateClip(doc, id, () => next) : doc;
}

/** New speed keys (a ramp) for a clip; its length is cut back if the ramp now runs past its source. */
export function setSpeedKeys(doc: ProjectDoc, id: string, keys: Clip['keys']): ProjectDoc {
  const at = locate(doc, id);
  if (!at || at.track.locked || isHold(at.clip)) return doc;
  const next: Clip = { ...at.clip, keys: tidyKeys(keys) };
  if (!next.keys) delete next.keys;
  next.length = Math.max(minLength(doc), Math.min(next.length, maxLengthOf(doc, next)));
  return updateClip(doc, id, () => next);
}

/** Plays the clip's stretch of its source backwards, or forwards again. */
export function setReverse(doc: ProjectDoc, id: string, reverse: boolean): ProjectDoc {
  const at = locate(doc, id);
  if (!at || at.track.locked || isHold(at.clip) || sourceOf(doc, at.clip.source)?.media !== 'video') return doc;
  const next: Clip = { ...at.clip, reverse: reverse || undefined };
  if (!next.reverse) delete next.reverse;
  return updateClip(doc, id, () => next);
}

export const HOLD_LENGTH = 2 * 1_000_000;

/**
 * «تجميد الإطار»: the clip is cut at t and a still of the frame shown at t is put in between, `length`
 * long; the rest of the track moves forward by that length. The still keeps the clip's place, size,
 * crop and colours as they are at t, and is silent. Returns the still's id, or null when t is not inside
 * a video clip.
 */
export function insertHold(doc: ProjectDoc, id: string, t: Micros, length: Micros = HOLD_LENGTH): { doc: ProjectDoc; holdId: string | null } {
  const at = locate(doc, id);
  if (!at || at.track.locked || sourceOf(doc, at.clip.source)?.media !== 'video') return { doc, holdId: null };
  const c = at.clip;
  const cut = Math.round(t);
  if (cut < c.start || cut >= end(c)) return { doc, holdId: null };
  const shown = sourceTime(c, cut);
  const tau = cut - c.start;
  const base = { x: c.transform?.x, y: c.transform?.y, scale: c.transform?.scale ?? 1, rotation: c.transform?.rotation ?? 0, opacity: c.transform?.opacity ?? 1 };
  const frozen: Record<string, number | undefined> = { ...base };
  if (c.keys) for (const p of MOTION_PROPS) if (c.keys[p]?.length) frozen[p] = valueOfKeys(c, p, tau, base[p] ?? 0);
  let d = doc;
  const min = minLength(doc);
  // too near an edge to cut: the still goes after the clip (or before it, at its very start)
  let ins = cut;
  if (cut > c.start + min && cut < end(c) - min) d = splitClip(d, id, cut).doc;
  else if (cut > c.start) ins = end(c);
  const len = Math.max(min, Math.round(length));
  // the rest of the track moves forward to make room; a clip that faded in from here now meets the still
  const moves = (x: Clip) => x.start >= ins || (x.id !== c.id && !!x.transition && x.start > c.start && x.start < ins && x.start + x.transition.length >= ins);
  d = withTracks(d, body(d).tracks.map((tr) => (tr.id !== at.track.id ? tr : { ...tr, clips: tr.clips.map((x) => (moves(x) ? { ...x, start: (x.start < ins ? ins : x.start) + len, ...(x.start < ins ? { transition: null } : {}) } : x)).sort(byStart) })));
  const holdId = uid('c');
  const still: Clip = {
    id: holdId,
    source: c.source,
    start: ins,
    length: len,
    hold: shown,
    mute: true,
    ...(c.transform ? { transform: { x: frozen.x ?? c.transform.x, y: frozen.y ?? c.transform.y, scale: frozen.scale ?? 1, rotation: frozen.rotation ?? 0, opacity: frozen.opacity ?? 1 } } : {}),
    ...(c.fit ? { fit: c.fit } : {}),
    ...(c.crop ? { crop: { ...c.crop } } : {}),
    ...(c.adjust ? { adjust: { ...c.adjust } } : {}),
  };
  d = withTracks(d, body(d).tracks.map((tr) => (tr.id === at.track.id ? { ...tr, clips: [...tr.clips, still].sort(byStart) } : tr)));
  return { doc: d, holdId };
}

function valueOfKeys(c: Clip, p: KeyProp, tau: Micros, base: number): number {
  const ks = c.keys?.[p] ?? [];
  if (!ks.length) return base;
  // the same straight-or-eased reading the compositor uses
  return valueAtKeys(ks, tau, base);
}

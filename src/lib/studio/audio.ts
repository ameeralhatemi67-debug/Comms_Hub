// The export's sound (MVP_draft.md 62): every audible clip (sound tracks and the sound of video clips)
// mixed in windows of ten seconds, never the whole project at once (a ten-minute stereo mix at 48 kHz
// would hold about 230 MB). Each window is rendered by an OfflineAudioContext from the sources' decoded
// buffers (Mediabunny's AudioBufferSink) at each clip's gain over time: its volume, fades and
// cross-fades (clipGain, equal power), so the exported level is the previewed one. Windows are
// contiguous and silent where nothing plays, as the encoder places each buffer after the last.
import { US, durationOf, type Clip, type Micros, type ProjectDoc, type Track } from './schema.ts';
import { clipGain, sourceOf } from './timeline.ts';

export const SAMPLE_RATE = 48_000;
export const WINDOW = 10 * US;
/** Gain is sampled every 10 ms; fades are smooth at that rate. */
export const GAIN_STEP = 10_000;

/** The windows of a project's length: [from, to) in microseconds, contiguous, the last one shorter. */
export function windows(duration: Micros, size: Micros = WINDOW): { from: Micros; to: Micros }[] {
  const out: { from: Micros; to: Micros }[] = [];
  for (let from = 0; from < duration; from += size) out.push({ from, to: Math.min(duration, from + size) });
  return out;
}

/** The clips heard at some moment of [from, to), with their tracks. */
export function audibleIn(doc: ProjectDoc, from: Micros, to: Micros): { track: Track; clip: Clip }[] {
  const out: { track: Track; clip: Clip }[] = [];
  for (const track of doc.video?.tracks ?? []) {
    if (track.muted || (track.kind !== 'audio' && track.kind !== 'video')) continue;
    for (const clip of track.clips) {
      if (clip.mute || clip.start >= to || clip.start + clip.length <= from) continue;
      const s = sourceOf(doc, clip.source);
      if (s && s.media !== 'image') out.push({ track, clip });
    }
  }
  return out;
}

/** A clip's gain sampled every GAIN_STEP over [from, to) of timeline time (for setValueCurveAtTime). */
export function gainCurve(track: Track, clip: Clip, from: Micros, to: Micros, step: Micros = GAIN_STEP): Float32Array {
  const n = Math.max(2, Math.ceil((to - from) / step) + 1);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = Math.min(to, from + i * step);
    out[i] = t >= clip.start && t < clip.start + clip.length ? clipGain(track, clip, t) : 0;
  }
  return out;
}

export type AudioSourceReader = (sourceId: string, fromSec: number, toSec: number) => AsyncIterable<{ buffer: AudioBuffer; timestamp: number }> | null;

/**
 * One window of the mix, rendered: `read` gives a source's decoded buffers for a span of source time.
 * Returns a stereo AudioBuffer of exactly the window's length.
 */
export async function mixWindow(doc: ProjectDoc, win: { from: Micros; to: Micros }, read: AudioSourceReader): Promise<AudioBuffer> {
  const frames = Math.max(1, Math.round(((win.to - win.from) / US) * SAMPLE_RATE));
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: frames, sampleRate: SAMPLE_RATE });
  for (const { track, clip } of audibleIn(doc, win.from, win.to)) {
    const s = sourceOf(doc, clip.source)!;
    const from = Math.max(win.from, clip.start);
    const to = Math.min(win.to, clip.start + clip.length);
    const srcFrom = ((clip.in ?? 0) + (from - clip.start)) / US;
    const srcTo = ((clip.in ?? 0) + (to - clip.start)) / US;
    const it = read(s.id, srcFrom, srcTo);
    if (!it) continue;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    // silent until the clip starts, then its gain over time (no other event may fall inside the curve)
    gain.gain.value = 0;
    const at = (from - win.from) / US;
    const end = (to - win.from) / US;
    gain.gain.setValueCurveAtTime(gainCurve(track, clip, from, to), at, Math.max(1e-3, end - at));
    for await (const b of it) {
      // where this buffer falls on the window's clock; only the part inside the clip is played
      const bStart = b.timestamp - srcFrom + at;
      const bEnd = bStart + b.buffer.duration;
      if (bEnd <= at || bStart >= end) continue;
      const when = Math.max(at, bStart);
      const node = ctx.createBufferSource();
      node.buffer = b.buffer;
      node.connect(gain);
      node.start(when, when - bStart, Math.min(bEnd, end) - when);
    }
  }
  return ctx.startRendering();
}

/** Whether a project has any sound to export. */
export const hasSound = (doc: ProjectDoc) => audibleIn(doc, 0, durationOf(doc)).length > 0;

// Waveforms (MVP_draft.md 62.9): the loudest sample of each short slice of a file's sound, worked out once
// per file and kept on this device, then drawn inside the clips that play it. The reduction is pure; the
// browser reads the sound with Mediabunny and keeps the result in IndexedDB («comms-hub-studio-peaks»).

/** Slices per second of source. */
export const PEAKS_PER_SECOND = 50;

/**
 * Reduces decoded sound to peaks: for each slice, the largest absolute sample over every channel, 0 to 1.
 * `buffers` are in order with their start time in seconds; the result covers `duration` seconds.
 */
export function reducePeaks(buffers: { timestamp: number; channels: Float32Array[]; sampleRate: number }[], duration: number, perSecond = PEAKS_PER_SECOND): Float32Array {
  const out = new Float32Array(Math.max(1, Math.ceil(duration * perSecond)));
  for (const b of buffers) reduceInto(out, b, perSecond);
  return out;
}

/** One decoded buffer added to peaks already started (a file is read buffer by buffer). */
export function reduceInto(out: Float32Array, b: { timestamp: number; channels: Float32Array[]; sampleRate: number }, perSecond = PEAKS_PER_SECOND) {
  const len = b.channels[0]?.length ?? 0;
  for (let i = 0; i < len; i++) {
    const slot = Math.floor((b.timestamp + i / b.sampleRate) * perSecond);
    if (slot < 0 || slot >= out.length) continue;
    let m = 0;
    for (const ch of b.channels) {
      const v = Math.abs(ch[i]);
      if (v > m) m = v;
    }
    if (m > out[slot]) out[slot] = Math.min(1, m);
  }
}

/** The peak over a stretch of source [from, to) seconds (the loudest slice in it). */
export function peakIn(peaks: Float32Array, from: number, to: number, perSecond = PEAKS_PER_SECOND): number {
  let a = Math.max(0, Math.floor(from * perSecond));
  const b = Math.min(peaks.length, Math.max(a + 1, Math.ceil(to * perSecond)));
  let m = 0;
  for (; a < b; a++) if (peaks[a] > m) m = peaks[a];
  return m;
}

/** The key a file's peaks are kept under: its library file and version, or its fingerprint on this device. */
export const peaksKey = (s: { kind: string; asset?: string; version?: number; key?: string }) => (s.kind === 'library' ? `asset-${s.asset}-v${s.version}` : `local-${s.key}`);

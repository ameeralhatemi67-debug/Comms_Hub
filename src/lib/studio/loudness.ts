// Loudness of the export's sound (MVP_draft.md 62.9), by ITU-R BS.1770-4: each channel K-weighted (a high
// shelf, then a high pass), mean square over 400 ms blocks overlapping by 75 percent, an absolute gate at
// -70 LUFS and a relative gate 10 LU below the gated mean; the integrated loudness of the blocks that
// pass both. The filters' coefficients are those the recommendation gives for 48 kHz, the export's rate.
// Fed window by window (the export mixes ten seconds at a time), with the filters' state carried across.
// Pure.

/** BS.1770-4 table 1 and 2, at 48 kHz: [b0, b1, b2, a1, a2] (a0 = 1). */
const SHELF = [1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585] as const;
const HIGHPASS = [1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621] as const;
export const LOUDNESS_RATE = 48_000;
const SEGMENT = LOUDNESS_RATE / 10; // 100 ms: a block is four segments

/**
 * The default target and peak ceiling. -14 LUFS integrated is the level commonly aimed at for sharing
 * platforms, and -1 dB keeps peaks clear of the platforms' own encoders; they are defaults the person may
 * change, not a platform's stated rule.
 */
export const LOUDNESS_TARGET = -14;
export const PEAK_CEILING_DB = -1;

type Biquad = { x1: number; x2: number; y1: number; y2: number };
const fresh = (): Biquad => ({ x1: 0, x2: 0, y1: 0, y2: 0 });

function run(c: readonly number[], s: Biquad, x: number): number {
  const y = c[0] * x + c[1] * s.x1 + c[2] * s.x2 - c[3] * s.y1 - c[4] * s.y2;
  s.x2 = s.x1;
  s.x1 = x;
  s.y2 = s.y1;
  s.y1 = y;
  return y;
}

export type LoudnessResult = { integrated: number; peakDb: number; blocks: number };

export class LoudnessMeter {
  private shelf: Biquad[] = [];
  private high: Biquad[] = [];
  /** Sum of squares (all channels added, weights 1) of each finished 100 ms segment. */
  private segments: number[] = [];
  private acc = 0;
  private n = 0;
  private peak = 0;

  /** More sound: one Float32Array per channel, equal lengths, at 48 kHz. */
  push(channels: Float32Array[]) {
    const len = channels[0]?.length ?? 0;
    while (this.shelf.length < channels.length) {
      this.shelf.push(fresh());
      this.high.push(fresh());
    }
    for (let i = 0; i < len; i++) {
      let sq = 0;
      for (let ch = 0; ch < channels.length; ch++) {
        const x = channels[ch][i];
        const ax = Math.abs(x);
        if (ax > this.peak) this.peak = ax;
        const y = run(HIGHPASS, this.high[ch], run(SHELF, this.shelf[ch], x));
        sq += y * y;
      }
      this.acc += sq;
      if (++this.n === SEGMENT) {
        this.segments.push(this.acc);
        this.acc = 0;
        this.n = 0;
      }
    }
  }

  result(): LoudnessResult {
    // blocks of four segments (400 ms), one every segment (75 percent overlap)
    const z: number[] = [];
    for (let i = 0; i + 4 <= this.segments.length; i++) z.push((this.segments[i] + this.segments[i + 1] + this.segments[i + 2] + this.segments[i + 3]) / (4 * SEGMENT));
    const lk = (m: number) => -0.691 + 10 * Math.log10(m);
    const abs = z.filter((m) => m > 0 && lk(m) > -70);
    const peakDb = this.peak > 0 ? 20 * Math.log10(this.peak) : -Infinity;
    if (!abs.length) return { integrated: -Infinity, peakDb, blocks: 0 };
    const rel = lk(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
    const gated = abs.filter((m) => lk(m) > rel);
    return { integrated: lk(gated.reduce((a, b) => a + b, 0) / gated.length), peakDb, blocks: gated.length };
  }
}

/** The one gain (as a factor) that brings a measured sound to the target without its peak passing the ceiling. */
export function normalizeGain(m: LoudnessResult, target = LOUDNESS_TARGET, ceilingDb = PEAK_CEILING_DB): number {
  if (!Number.isFinite(m.integrated)) return 1;
  let db = target - m.integrated;
  if (Number.isFinite(m.peakDb)) db = Math.min(db, ceilingDb - m.peakDb);
  return Math.pow(10, db / 20);
}

/** A loudness figure as people read it: «-14.0 LUFS». */
export const lufsText = (v: number) => (Number.isFinite(v) ? `${v.toFixed(1)} LUFS` : 'صامت');

// From a device profile to the studio's speed knobs (Desktop_Power_Ideas.md P-34 and P-36, phase D9): the one
// place that says why a computer does what it does. Only speed knobs live here (section 5.1 of that document):
// nothing here may change what is exported. Every knob has a floor, today's behaviour, which is the answer
// with no profile, in a browser, and the last rung of every step down. A machine faster in every figure, with
// as much memory and as many cores, never gets a lower knob (tested). Lanes follow the gain of adding one
// encoder, not its speed, so one faster encoder alone may mean fewer lanes. In D9 the plan is only shown, in
// «معلومات الجهاز»; the phases after it use it. Pure.
import type { ProfileNumbers } from '../native/index.ts';

/** «الأداء»: «تلقائي», «أخف على الجهاز», «أقصى ما يقدر عليه الجهاز». */
export const PERFORMANCE = Object.freeze(['auto', 'light', 'max'] as const);
export type Performance = (typeof PERFORMANCE)[number];
export const isPerformance = (v: unknown): v is Performance => typeof v === 'string' && (PERFORMANCE as readonly string[]).includes(v);

export type Knobs = {
  /** The preview's resolution when an editor opens, as a share of «كاملة» (handles.ts RESOLUTIONS). */
  previewStart: number;
  /** Megabytes of decoded frames kept for scrubbing (P-02). */
  frameCacheMB: number;
  /** Export lanes run at once (P-05, P-06). */
  exportLanes: number;
  /** Light copies made at once (P-08). */
  copiesAtOnce: number;
  /** Workers for photo adjustments (P-17). */
  photoWorkers: number;
};

/** Today's behaviour: the preview at «كاملة», no frame cache, one lane, one copy at a time, one photo worker. */
export const FLOOR: Readonly<Knobs> = Object.freeze({ previewStart: 1, frameCacheMB: 0, exportLanes: 1, copiesAtOnce: 1, photoWorkers: 1 });

/** A lane is worth adding when the encoders together are at least this much faster («أقصى…»: MAX_GAIN). */
export const LANE_GAIN = 1.3;
export const MAX_GAIN = 1.05;
export const MAX_LANES = 4;
/** Preview steps from «كاملة» down. */
export const PREVIEW_STEPS = Object.freeze([1, 1 / 2, 1 / 4]);

/** What the profile does not say: logical cores and memory in bytes, from «معلومات الجهاز». */
export type Machine = { cores?: number | null; memory?: number | null };

/** How many lanes the measured curve carries: lanes[i] is i + 1 encoders together. */
export function lanesFrom(lanes: readonly number[], gain = LANE_GAIN): number {
  let k = 1;
  for (let i = 1; i < lanes.length && k < MAX_LANES; i++) {
    if (lanes[i] >= lanes[i - 1] * gain) k = i + 1;
    else break;
  }
  return k;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The preview step a profile starts at: full when the chip decodes 4K and draws the effects document with room. */
function previewStep(p: ProfileNumbers): number {
  const decode = Math.max(p.decode.h264_2160.hw ?? 0, p.decode.h264_2160.sw ?? 0);
  if (decode >= 90 && p.compose.effects <= 12) return 0;
  if (decode >= 45 && p.compose.effects <= 25) return 1;
  return 2;
}

export function plan(p: ProfileNumbers | null, m: Machine = {}, performance: Performance = 'auto'): Knobs {
  if (!p) return { ...FLOOR };
  const gb = m.memory && m.memory > 0 ? m.memory / 1e9 : 0;
  const cores = m.cores && m.cores > 0 ? Math.floor(m.cores) : 1;
  const step = previewStep(p);
  const lanes = lanesFrom(p.lanes, performance === 'max' ? MAX_GAIN : LANE_GAIN);
  const copies = lanesFrom(p.lanes, LANE_GAIN) > 1 ? 2 : 1;
  const cache = (perGb: number, cap: number) => Math.floor(clamp(gb * perGb, 0, cap) / 64) * 64;
  if (performance === 'light') {
    return {
      previewStart: PREVIEW_STEPS[Math.min(PREVIEW_STEPS.length - 1, step + 1)],
      frameCacheMB: cache(32, 1536),
      exportLanes: Math.max(1, lanes - 1),
      copiesAtOnce: 1,
      photoWorkers: clamp(Math.floor(cores / 4), 1, 8),
    };
  }
  if (performance === 'max') {
    return {
      previewStart: PREVIEW_STEPS[Math.max(0, step - 1)],
      frameCacheMB: cache(128, 6144),
      exportLanes: lanes,
      copiesAtOnce: clamp(lanes, 1, 3),
      photoWorkers: clamp(cores - 1, 1, 15),
    };
  }
  return { previewStart: PREVIEW_STEPS[step], frameCacheMB: cache(64, 3072), exportLanes: lanes, copiesAtOnce: copies, photoWorkers: clamp(cores - 2, 1, 14) };
}

// Fixture of «قياس قدرة الجهاز» (Desktop_Power_Ideas.md P-33, phase D9), bundled by qa/desktop-profile.cjs from the
// real modules: the measurement (src/lib/studio/bench.ts) and the plan (scale.ts). In Edge it only measures; inside
// the development package the page also reaches the application through its bridge, as the studio's panel does.
import { measureDevice } from '../../src/lib/studio/bench.ts';
import { plan } from '../../src/lib/studio/scale.ts';

/** The measurement, with every timed value of every figure beside it (the check reports the spread figure by figure). */
async function measure(o: { runs?: number }) {
  let series: Record<string, number[]> = {};
  const numbers = await measureDevice({ ...o, onSeries: (s) => (series = s) });
  return { numbers, series };
}

Object.assign(window as unknown as Record<string, unknown>, { measure, plan });

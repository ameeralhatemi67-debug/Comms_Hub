// The graphics chip the site draws on (Desktop_Power_Ideas.md P-01, phase D9). On a laptop with two chips
// Chromium starts on the one Windows ranks first, which on the pilot laptop was the weaker one for exports
// (measured on 2026-11-03). The person chooses «تلقائي», «الأقوى» or «الموفّرة للطاقة»; the choice becomes
// one of Chromium's two switches, which it reads only before it is ready, so a change takes effect at the
// next start. «تلقائي» follows the device profile (profile.ts): on mains power, the chip whose reference
// export was clearly faster once both chips were measured; otherwise Chromium's own choice, as before D9.
// A switch given on the command line (a check of a weaker machine, P-38) is kept as it is. Pure; main.ts
// applies the switch and native.ts answers the bridge.

export const GPU_CHOICES = Object.freeze(['auto', 'strong', 'saving'] as const);
export type GpuChoice = (typeof GPU_CHOICES)[number];

/** The switch in effect: Chromium's discrete chip, its integrated chip, or neither (its own choice). */
export type GpuSwitch = 'high' | 'low' | 'none';
export const SWITCH_NAMES = Object.freeze({ high: 'force_high_performance_gpu', low: 'force_low_power_gpu' } as const);

export type Power = 'ac' | 'battery';

/** How much faster the other chip's reference export must be before «تلقائي» leaves Chromium's own choice. */
export const AUTO_MARGIN = 1.1;

export function gpuChoiceOf(value: unknown): GpuChoice | null {
  return typeof value === 'string' && (GPU_CHOICES as readonly string[]).includes(value) ? (value as GpuChoice) : null;
}

/** The switch already on the command line, or null. `has` is app.commandLine.hasSwitch. */
export function givenSwitch(has: (name: string) => boolean): GpuSwitch | null {
  if (has(SWITCH_NAMES.high)) return 'high';
  if (has(SWITCH_NAMES.low)) return 'low';
  return null;
}

/** The switch a choice asks for: «تلقائي» takes the measured pick on mains power only. */
export function switchFor(o: { choice: GpuChoice; pick: Exclude<GpuSwitch, 'none'> | null; power: Power | null }): GpuSwitch {
  if (o.choice === 'strong') return 'high';
  if (o.choice === 'saving') return 'low';
  return o.power === 'ac' && o.pick ? o.pick : 'none';
}

/** What measuredPick needs of a stored measurement. */
export type PickEntry = { at: number; key: { chrome: string; switch: GpuSwitch; power: Power; chip: { vendorId: number; deviceId: number } }; numbers: { exportFps: number } };

const chipOf = (e: PickEntry) => `${e.key.chip.vendorId}:${e.key.chip.deviceId}`;

/**
 * The switch «تلقائي» should use, from the measurements on mains power for this Chromium: the newest one under
 * each switch, compared by their reference export. Null unless two different chips were measured and the
 * faster was measured under a switch and is at least AUTO_MARGIN times the other chip's best.
 */
export function measuredPick(entries: readonly PickEntry[], chrome: string): Exclude<GpuSwitch, 'none'> | null {
  const latest = new Map<GpuSwitch, PickEntry>();
  for (const e of entries) {
    if (e.key.chrome !== chrome || e.key.power !== 'ac' || !(e.numbers.exportFps > 0)) continue;
    const was = latest.get(e.key.switch);
    if (!was || e.at > was.at) latest.set(e.key.switch, e);
  }
  const list = [...latest.values()];
  if (new Set(list.map(chipOf)).size < 2) return null;
  const best = list.reduce((a, b) => (b.numbers.exportFps > a.numbers.exportFps ? b : a));
  if (best.key.switch === 'none') return null;
  const rival = Math.max(...list.filter((e) => chipOf(e) !== chipOf(best)).map((e) => e.numbers.exportFps));
  return best.numbers.exportFps >= rival * AUTO_MARGIN ? best.key.switch : null;
}

// How the export spreads its work on this computer (Desktop_Power_Ideas.md P-34 and P-35; MVP_draft.md 62.10). The
// lanes come from the device's plan (scale.ts), worked out from the measurement the desktop application keeps for this
// chip and switch; with no measurement, in a browser, or on a phone, the plan is the floor: one lane. Then the ladder's
// memory: when lanes failed in an export, the export finished with fewer, and the next REMEMBER exports on this device
// start at most at the number that finished; each export counts one off. Kept in this browser's storage beside the
// studio's preferences. Speed only: nothing here can change a file. Browser only.
import { native, type ProfileEntry, type ProfileKey } from '../native/index.ts';
import { factsFromApp } from '../native/device.ts';
import { isPerformance, plan, type Performance } from './scale.ts';

/** Exports that start at most at the rung that worked, after a step down. */
export const REMEMBER = 5;
const KEY = 'studio.export.ladder';

export type LadderMemory = { lanes: { cap: number; left: number } | null; events: { at: number; code: string; lanes: number }[] };
type Store = Pick<Storage, 'getItem' | 'setItem'>;

const store = (): Store | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

export function readLadder(s: Store | null = store()): LadderMemory {
  try {
    const v = JSON.parse(s?.getItem(KEY) ?? 'null') as LadderMemory | null;
    if (v && Array.isArray(v.events)) return { lanes: v.lanes && v.lanes.cap >= 1 && v.lanes.left > 0 ? v.lanes : null, events: v.events.slice(-10) };
  } catch {
    // unreadable: as if nothing was kept
  }
  return { lanes: null, events: [] };
}

/** The lanes an export starts with: the plan's, at most the remembered rung. */
export const ladderLanes = (planned: number, m: LadderMemory = readLadder()) => Math.max(1, m.lanes ? Math.min(planned, m.lanes.cap) : planned);

/** After an export: a lane failure is remembered at the rung that finished; otherwise one remembered export is used up. */
export function rememberExport(r: { lanes: number; steps: string[] }, s: Store | null = store(), now = Date.now()): LadderMemory {
  const m = readLadder(s);
  const failed = r.steps.filter((x) => x.startsWith('LANE') || x === 'ENCODER');
  let next: LadderMemory;
  if (failed.length) next = { lanes: { cap: Math.max(1, r.lanes), left: REMEMBER }, events: [...m.events, ...failed.map((code) => ({ at: now, code, lanes: r.lanes }))].slice(-10) };
  else next = { lanes: m.lanes && m.lanes.left > 1 ? { cap: m.lanes.cap, left: m.lanes.left - 1 } : null, events: m.events };
  try {
    s?.setItem(KEY, JSON.stringify(next));
  } catch {
    // not kept: the next export starts from the plan again
  }
  return next;
}

/** The measurement made under this application, Chromium, chip, driver and switch; the newest (device-info.tsx). */
function currentEntry(p: { current: ProfileKey; entries: ProfileEntry[] } | null): ProfileEntry | null {
  if (!p) return null;
  const k = p.current;
  const same = p.entries.filter((e) => e.key.app === k.app && e.key.chrome === k.chrome && e.key.switch === k.switch && e.key.chip.vendorId === k.chip.vendorId && e.key.chip.deviceId === k.chip.deviceId && e.key.chip.driver === k.chip.driver);
  return same.sort((a, b) => b.at - a.at)[0] ?? null;
}

/** The lanes for an export on this computer now: the plan's (one without a measurement), after the ladder's memory. */
export async function exportLanes(): Promise<{ lanes: number; planned: number }> {
  const n = native();
  if (!n.has('profile')) return { lanes: 1, planned: 1 };
  const [profile, info] = await Promise.all([n.raw?.profile?.read?.().catch(() => null) ?? null, n.has('info') ? (n.raw?.info?.().catch(() => null) ?? null) : null]);
  const facts = factsFromApp(info);
  let performance: Performance = 'auto';
  try {
    const v = JSON.parse(localStorage.getItem('studio.pref.performance') ?? 'null') as unknown;
    if (isPerformance(v)) performance = v;
  } catch {
    // the default
  }
  const planned = plan(currentEntry(profile as { current: ProfileKey; entries: ProfileEntry[] } | null)?.numbers ?? null, { cores: facts?.cores, memory: facts?.memory }, performance).exportLanes;
  return { lanes: ladderLanes(planned), planned };
}

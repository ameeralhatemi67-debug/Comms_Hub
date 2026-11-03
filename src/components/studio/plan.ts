'use client';

// The studio's plan on this computer (D10; src/lib/studio/scale.ts, MVP_draft.md 63.6): inside the desktop application,
// the newest measurement made for this application, Chromium, chip and driver (D9's profile, read through the bridge)
// with «الأداء»; null in a browser, before a measurement, or when the bridge does not answer, and then the editor keeps
// today's behaviour (the floor). It reads nothing about any person, and nothing of it leaves the device.
import { useEffect, useState } from 'react';
import { native, type ProfileEntry, type ProfileKey, type ProfileNumbers } from '@/lib/native';
import { factsFromApp } from '@/lib/native/device';
import { isPerformance, plan, type Knobs, type Performance } from '@/lib/studio/scale';
import { usePref } from './prefs';

/** The measurement this page's own key matches: same application, Chromium, chip, driver and switch; the newest. */
export function currentEntry(p: { current: ProfileKey; entries: ProfileEntry[] } | null): ProfileEntry | null {
  if (!p) return null;
  const k = p.current;
  const same = p.entries.filter((e) => e.key.app === k.app && e.key.chrome === k.chrome && e.key.switch === k.switch && e.key.chip.vendorId === k.chip.vendorId && e.key.chip.deviceId === k.chip.deviceId && e.key.chip.driver === k.chip.driver);
  return [...same].sort((a, b) => b.at - a.at)[0] ?? null;
}

export type StudioPlan = { knobs: Knobs; numbers: ProfileNumbers };

export function useStudioPlan(): StudioPlan | null {
  const [performance] = usePref<Performance>('performance', 'auto', isPerformance);
  const [read, setRead] = useState<{ numbers: ProfileNumbers; cores: number | null; memory: number | null } | null>(null);
  useEffect(() => {
    const n = native();
    if (!n.has('profile') || !n.raw?.profile?.read) return;
    let live = true;
    void Promise.all([n.raw.profile.read().catch(() => null), n.has('info') ? n.raw.info!().catch(() => null) : Promise.resolve(null)]).then(([p, info]) => {
      const entry = currentEntry(p);
      const facts = factsFromApp(info);
      if (live && entry) setRead({ numbers: entry.numbers, cores: facts?.cores ?? null, memory: facts?.memory ?? null });
    });
    return () => {
      live = false;
    };
  }, []);
  if (!read) return null;
  return { knobs: plan(read.numbers, { cores: read.cores, memory: read.memory }, performance), numbers: read.numbers };
}

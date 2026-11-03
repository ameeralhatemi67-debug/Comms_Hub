// The application's own settings on this laptop, kept in the profile as settings.json. They are never
// project data and never reach the site. Pure; native.ts reads and writes the file, and main.ts reads it
// once before Chromium is ready.
//   - keepInTray: «إبقاء التطبيق في شريط المهام» (decision D-10, D2), off unless the person turns it on from the tray.
//   - gpu: «بطاقة الرسوميات للاستوديو» (Desktop_Power_Ideas.md P-01, D9), «تلقائي» unless the person chooses.
//   - lastPower: mains or battery when the application last looked, because Chromium's switch is chosen
//     before the system's power state can be read (null until it has looked once).
import { gpuChoiceOf, type GpuChoice, type Power } from './gpu.ts';

export type Settings = { keepInTray: boolean; gpu: GpuChoice; lastPower: Power | null };

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({ keepInTray: false, gpu: 'auto', lastPower: null });

/** The settings read back; anything missing, damaged or unknown is the default. */
export function parseSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };
  const { keepInTray, gpu, lastPower } = raw as { keepInTray?: unknown; gpu?: unknown; lastPower?: unknown };
  return { keepInTray: keepInTray === true, gpu: gpuChoiceOf(gpu) ?? 'auto', lastPower: lastPower === 'ac' || lastPower === 'battery' ? lastPower : null };
}

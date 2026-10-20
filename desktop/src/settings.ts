// The application's own settings on this laptop, kept in the profile as settings.json. In D2 there is one:
// «إبقاء التطبيق في شريط المهام» (decision D-10), off unless the person turns it on from the tray. They
// are never project data and never reach the site. Pure; native.ts reads and writes the file.

export type Settings = { keepInTray: boolean };

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({ keepInTray: false });

/** The settings read back; anything missing, damaged or unknown is the default. */
export function parseSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };
  const { keepInTray } = raw as { keepInTray?: unknown };
  return { keepInTray: keepInTray === true };
}

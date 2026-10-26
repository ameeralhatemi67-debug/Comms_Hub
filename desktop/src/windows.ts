// The studio's windows on more than one screen (Desktop_App_Plan.md D6, MVP_draft.md 63.5): which screens
// there are, which one a window goes to, where on it, and the one address a window of the studio may open.
// The page names a panel and its project; the main process builds the address on the page's own origin,
// so nothing the page sends becomes an address. Pure; native-windows.ts opens and places the window.

/** The panels that may open in a window of their own: the preview now, later any studio window. */
export const PANELS = Object.freeze(['preview'] as const);
export type Panel = (typeof PANELS)[number];

const PROJECT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type Rect = { x: number; y: number; width: number; height: number };
export type Screen = { id: number; label: string; primary: boolean; current: boolean; bounds: Rect; workArea: Rect; scaleFactor: number };

/** The address of a panel's window: the studio project's own address with the panel after it, or null. */
export function panelAddress(origin: string, panel: unknown, project: unknown): string | null {
  if (typeof panel !== 'string' || !(PANELS as readonly string[]).includes(panel)) return null;
  if (typeof project !== 'string' || !PROJECT.test(project)) return null;
  let o: URL;
  try {
    o = new URL(origin);
  } catch {
    return null;
  }
  if (o.origin !== origin) return null;
  return `${origin}/motion/studio/${project}/${panel}`;
}

/** The screens as the page is told them: the system's own description of each, nothing of what is on it. */
export function screensOf(displays: readonly { id: number; label?: string; bounds: Rect; workArea: Rect; scaleFactor: number }[], primaryId: number, currentId: number | null): Screen[] {
  return displays.map((d) => ({
    id: d.id,
    label: (d.label ?? '').slice(0, 80),
    primary: d.id === primaryId,
    current: d.id === currentId,
    bounds: { ...d.bounds },
    workArea: { ...d.workArea },
    scaleFactor: d.scaleFactor,
  }));
}

/** The screen a window goes to: the one asked for, else the first that is not the asking window's, else that one. */
export function pickScreen(screens: readonly Screen[], asked: unknown): Screen | null {
  if (!screens.length) return null;
  if (typeof asked === 'number') {
    const s = screens.find((x) => x.id === asked);
    if (s) return s;
  }
  return screens.find((x) => !x.current) ?? screens.find((x) => x.current) ?? screens[0];
}

/** A window of `size` in the middle of a screen's work area, never larger than it. */
export function centreOn(screen: Screen, size = { width: 1280, height: 720 }): Rect {
  const a = screen.workArea;
  const width = Math.min(size.width, a.width);
  const height = Math.min(size.height, a.height);
  return { x: Math.round(a.x + (a.width - width) / 2), y: Math.round(a.y + (a.height - height) / 2), width, height };
}

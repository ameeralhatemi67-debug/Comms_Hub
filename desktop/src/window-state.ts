// Where the window opens (Desktop_App_Plan.md 5.1): the size, position, screen and maximised state
// of the last session, kept in the profile as window-state.json. A place no screen shows any more
// (a screen taken away, a resolution changed) falls back to the default size, centred. Pure; main.ts
// reads and writes the file.

export type Rect = { x: number; y: number; width: number; height: number };
export type WindowState = { bounds: Rect; maximized: boolean };

export const DEFAULT_SIZE = Object.freeze({ width: 1440, height: 900 });
export const MIN_SIZE = Object.freeze({ width: 360, height: 480 });

// The strip along the window's top that must stay on a screen, so the window can still be moved.
const GRIP = { width: 120, height: 40 };

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** A saved state read back, or null when the file is missing, damaged or from elsewhere. */
export function parseState(raw: unknown): WindowState | null {
  if (!raw || typeof raw !== 'object') return null;
  const { bounds, maximized } = raw as { bounds?: Partial<Rect>; maximized?: unknown };
  if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(isNumber)) return null;
  if ((bounds.width as number) < 1 || (bounds.height as number) < 1) return null;
  return {
    bounds: { x: Math.round(bounds.x as number), y: Math.round(bounds.y as number), width: Math.round(bounds.width as number), height: Math.round(bounds.height as number) },
    maximized: maximized === true,
  };
}

const overlap = (a: Rect, b: Rect) => ({
  width: Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
  height: Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
});

export type Placement = { x?: number; y?: number; width: number; height: number; maximized: boolean };

/**
 * The window's first place. `screens` are the work areas of every screen, `primary` the main one.
 * Without x and y, Electron centres the window on the main screen.
 */
export function placeWindow(saved: WindowState | null, screens: readonly Rect[], primary: Rect): Placement {
  const fallback: Placement = {
    width: Math.max(MIN_SIZE.width, Math.min(DEFAULT_SIZE.width, primary.width)),
    height: Math.max(MIN_SIZE.height, Math.min(DEFAULT_SIZE.height, primary.height)),
    maximized: saved?.maximized ?? false,
  };
  if (!saved) return fallback;
  const grip: Rect = { x: saved.bounds.x, y: saved.bounds.y, width: saved.bounds.width, height: GRIP.height };
  const home = screens.find((area) => {
    const o = overlap(grip, area);
    return o.width >= Math.min(GRIP.width, saved.bounds.width) && o.height >= GRIP.height;
  });
  if (!home) return fallback;
  const width = Math.max(MIN_SIZE.width, Math.min(saved.bounds.width, home.width));
  const height = Math.max(MIN_SIZE.height, Math.min(saved.bounds.height, home.height));
  return { x: saved.bounds.x, y: Math.max(home.y, saved.bounds.y), width, height, maximized: saved.maximized };
}

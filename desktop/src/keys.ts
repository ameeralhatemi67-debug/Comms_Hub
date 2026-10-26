// The application's own keys (Desktop_App_Plan.md 11.1, "Menu"): zoom with Ctrl and plus, minus or
// zero, full screen with F11, reload with F5 (Ctrl or Shift with F5 reloads without the cache), and in
// a development build the developer tools with F12. Every other key reaches the page untouched, so
// Ctrl+Z and the studio's shortcuts stay the site's (tests/keys.test.mjs holds them apart). Keys are
// matched by their physical position, as the studio does, so an Arabic layout works the same. Pure.

/** The fields of Electron's before-input-event that decide. */
export type KeyInput = { type: string; code: string; key: string; control: boolean; shift: boolean; alt: boolean; meta: boolean };

export type KeyAction = 'zoom-in' | 'zoom-out' | 'zoom-reset' | 'full-screen' | 'reload' | 'reload-fresh' | 'devtools';

// When a key arrives without its position, the key itself stands in.
const CODE_OF_KEY: Record<string, string> = { '=': 'Equal', '+': 'Equal', '-': 'Minus', '0': 'Digit0', F5: 'F5', F11: 'F11', F12: 'F12' };

export function keyAction(input: KeyInput, dev: boolean): KeyAction | null {
  if (input.type !== 'keyDown' && input.type !== 'rawKeyDown') return null;
  if (input.alt || input.meta) return null;
  const code = input.code || CODE_OF_KEY[input.key] || '';
  if (input.control) {
    if (code === 'Equal' || code === 'NumpadAdd') return 'zoom-in';
    if (code === 'Minus' || code === 'NumpadSubtract') return 'zoom-out';
    if ((code === 'Digit0' || code === 'Numpad0') && !input.shift) return 'zoom-reset';
    if (code === 'F5' && !input.shift) return 'reload-fresh';
    return null;
  }
  if (input.shift) return code === 'F5' ? 'reload-fresh' : null;
  if (code === 'F11') return 'full-screen';
  if (code === 'F5') return 'reload';
  if (code === 'F12' && dev) return 'devtools';
  return null;
}

/** Chromium's own zoom steps, from 25% to 500%. */
export const ZOOM_STEPS = Object.freeze([0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5]);

export function nextZoom(current: number, direction: 1 | -1): number {
  if (direction > 0) return ZOOM_STEPS.find((step) => step > current + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
  return [...ZOOM_STEPS].reverse().find((step) => step < current - 0.001) ?? ZOOM_STEPS[0];
}

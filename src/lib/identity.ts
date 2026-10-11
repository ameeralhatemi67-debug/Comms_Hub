// Switch between Direction A (DESIGN.md, the default) and the second design,
// «الهوية الجديدة لمركز الاتصال» (Roadmap Checkpoint 0.3). The choice is a
// per-browser preference held in localStorage; nothing leaves the machine.

export const IDENTITY_KEY = 'comms-hub-identity';
export const IDENTITY_NEW = 'emerald';

/**
 * Light or evening (dark) mode of the second design. Light is the default and the
 * device's own colour preference is ignored: dark applies only when a person
 * chooses it in Settings, Appearance. Direction A has no evening mode.
 */
export const THEME_KEY = 'comms-hub-theme';
export type Theme = 'light' | 'dark';

/** Flips the design on <html> and remembers it. Returns true when the second design is now on. */
export function toggleIdentity(): boolean {
  const root = document.documentElement;
  const on = root.getAttribute('data-identity') !== IDENTITY_NEW;
  if (on) root.setAttribute('data-identity', IDENTITY_NEW);
  else root.removeAttribute('data-identity');
  try {
    if (on) localStorage.setItem(IDENTITY_KEY, IDENTITY_NEW);
    else localStorage.removeItem(IDENTITY_KEY);
  } catch {
    // Storage can be unavailable (private window, blocked site data); the switch
    // still applies for this page view.
  }
  return on;
}

/** Applies a theme to <html> and remembers it. Light is stored as the absence of a value. */
export function setTheme(theme: Theme) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  try {
    if (theme === 'dark') localStorage.setItem(THEME_KEY, 'dark');
    else localStorage.removeItem(THEME_KEY);
  } catch {
    // See toggleIdentity: the theme still applies for this page view.
  }
}

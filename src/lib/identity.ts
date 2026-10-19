// «الهوية الجديدة لمركز الاتصال» (Roadmap Checkpoint 0.3) is the only design: the
// Director approved it, so the old design and its switch are gone. <html> carries
// data-identity="emerald" from the server (src/app/layout.tsx).

export const IDENTITY_NEW = 'emerald';

/**
 * Light or evening (dark) mode. Light is the default and the device's own colour
 * preference is ignored: dark applies only when a person chooses it in the account
 * page, Appearance. The choice is held in localStorage; nothing leaves the machine.
 */
export const THEME_KEY = 'comms-hub-theme';
export type Theme = 'light' | 'dark';

/** Applies a theme to <html> and remembers it. Light is stored as the absence of a value. */
export function setTheme(theme: Theme) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  try {
    if (theme === 'dark') localStorage.setItem(THEME_KEY, 'dark');
    else localStorage.removeItem(THEME_KEY);
  } catch {
    // Storage can be unavailable (private window, blocked site data); the theme
    // still applies for this page view.
  }
}

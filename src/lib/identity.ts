// Switch between Direction A (DESIGN.md, the default) and the second design,
// «الهوية الجديدة لمركز الاتصال» (Roadmap Checkpoint 0.3). The choice is a
// per-browser preference held in localStorage; nothing leaves the machine.

export const IDENTITY_KEY = 'comms-hub-identity';
export const IDENTITY_NEW = 'emerald';

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

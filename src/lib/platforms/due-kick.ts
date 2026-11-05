// Home's half of «مجدول» on Instagram (MVP_draft.md 76.5, Director_Notes_Plan.md answer Q3). When the bridge computer is off, a
// scheduled post goes out, late, the next time anyone signed in opens Home: the page asks the site once and never waits for the
// answer, which says nothing about any post. Once a minute at most, however often Home is opened in this tab.
export const DUE_KICK_GAP_MS = 60_000;
export const DUE_PATH = '/api/platforms/due';

let last = -Infinity;

/** Asks the site to fire what is due. `send` is the page's fetch. */
export function kickDue(now: number = Date.now(), send: typeof fetch = fetch): boolean {
  if (now - last < DUE_KICK_GAP_MS) return false;
  last = now;
  void send(DUE_PATH, { method: 'POST', credentials: 'same-origin', cache: 'no-store' }).catch(() => undefined);
  return true;
}

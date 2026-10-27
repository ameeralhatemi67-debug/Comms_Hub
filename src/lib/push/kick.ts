// Starter S-1 of the push outbox (Mobile_Apps_Plan.md 5.5, M-3): after a page's own write succeeds,
// it asks the site to flush what that write queued. One request for a burst of writes (debounced),
// one at a time, and one more try a few seconds later if another flush held the turn. It never
// waits for the answer and never fails a write; the WhatsApp bridge computer (S-2) catches anything
// a closed page left behind. The route answers at once when nothing waits.
export const KICK_DELAY_MS = 1200;
export const BUSY_RETRY_MS = 3000;
const BUSY_RETRIES = 2;

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let again = false;
let retries = 0;

async function run() {
  timer = null;
  if (running) {
    again = true;
    return;
  }
  running = true;
  let state = '';
  try {
    const r = await fetch('/api/push/flush', { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
    if (r.ok) state = String(((await r.json().catch(() => null)) as { state?: unknown } | null)?.state ?? '');
  } catch {
    // Nothing to tell the person: their write is already done.
  } finally {
    running = false;
  }
  if (again) {
    again = false;
    retries = 0;
    kickPush();
  } else if (state === 'busy' && retries < BUSY_RETRIES) {
    retries++;
    timer = setTimeout(() => void run(), BUSY_RETRY_MS);
  } else {
    retries = 0;
  }
}

/** Ask for a flush soon. Safe to call after every successful write; does nothing on the server. */
export function kickPush(): void {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void run(), KICK_DELAY_MS);
}

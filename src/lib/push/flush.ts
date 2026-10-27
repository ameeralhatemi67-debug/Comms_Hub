// One flush of the push outbox (Mobile_Apps_Plan.md 5.5, M-3): take the turn, claim a batch, send
// each item through FCM, report, and again while rows wait, then give the turn back. It is started
// only by /api/push/flush, which a signed-in page that just wrote (S-1) or the WhatsApp bridge
// computer (S-2) calls; nothing here runs on a timer. Every database call carries the site's server
// key; the key, the tokens and the credential are never logged or returned.
import { buildMessage, type Claimed, type Report } from './payload.ts';
import { GOOGLE, sendOne, tokenCache, type Endpoints } from './fcm.ts';

export type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
export type FlushState = 'empty' | 'busy' | 'refused' | 'not-configured' | 'credential' | 'done';
export type FlushResult = { state: FlushState; sent: number; failed: number; retry: number; gone: number; rounds: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const shared = tokenCache();
/** Forget the cached access token (a new credential was kept, or Google refused the old one). */
export const forgetPushToken = () => shared.forget();

async function pool<T, R>(items: T[], n: number, run: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await run(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

export async function flushPush(o: {
  rpc: Rpc;
  key: string;
  /** The stored service account, read from the vault only when a new access token is needed. */
  credential: () => Promise<string | null>;
  fetch?: typeof fetch;
  endpoints?: Endpoints;
  cache?: ReturnType<typeof tokenCache>;
  /** Records the credential's health; a failure to record never breaks the flush. */
  health?: (ok: boolean, error: string | null) => Promise<void>;
  rounds?: number;
  batch?: number;
  concurrency?: number;
}): Promise<FlushResult> {
  const res: FlushResult = { state: 'done', sent: 0, failed: 0, retry: 0, gone: 0, rounds: 0 };
  const begin = await o.rpc('push_flush_begin', { p_key: o.key });
  if (begin.error) return { ...res, state: 'refused' };
  const b = begin.data as { go?: boolean; why?: string } | null;
  if (!b?.go) return { ...res, state: b?.why === 'busy' ? 'busy' : 'empty' };
  const cache = o.cache ?? shared;
  const endpoints = o.endpoints ?? GOOGLE;
  const tokenOpts = { fetch: o.fetch, endpoints };
  try {
    // The credential is checked before anything is claimed, so rows wait instead of failing.
    let token = await cache.get(o.credential, tokenOpts);
    if (!token.ok) {
      if (token.error === 'NOT_CONFIGURED') return { ...res, state: 'not-configured' };
      await o.health?.(false, 'TOKEN_REFUSED').catch(() => undefined);
      return { ...res, state: 'credential' };
    }
    for (let round = 0; round < (o.rounds ?? 5); round++) {
      const claim = await o.rpc('push_claim', { p_key: o.key, p_limit: o.batch ?? 50 });
      if (claim.error || !Array.isArray(claim.data) || !claim.data.length) break;
      res.rounds++;
      const items = (claim.data as Claimed[]).filter((c) => c && typeof c.id === 'string' && UUID.test(c.id));
      const access = token;
      const reports = await pool(items, o.concurrency ?? 6, async (c): Promise<Report> => {
        const message = buildMessage(c);
        if (!message) return { id: c.id, ok: false, error: 'BAD_PAYLOAD' };
        const r = await sendOne(message, { accessToken: access.token, projectId: access.projectId, fetch: o.fetch, endpoints });
        if (r.ok) return { id: c.id, ok: true };
        // Google refused the access token: a new one is asked for next time, and the row waits.
        if (r.error === 'AUTH') {
          cache.forget();
          return { id: c.id, ok: false, error: 'RETRY' };
        }
        return { id: c.id, ok: false, error: r.error };
      });
      for (const r of reports) {
        if (r.ok) res.sent++;
        else if (r.error === 'RETRY') res.retry++;
        else if (r.error === 'TOKEN_GONE') res.gone++;
        else res.failed++;
      }
      await o.rpc('push_report', { p_key: o.key, p: reports });
      // Rows sent back to wait are not tried again in the same flush.
      if (reports.some((r) => !r.ok && r.error === 'RETRY')) break;
      token = await cache.get(o.credential, tokenOpts);
      if (!token.ok) break;
    }
    if (res.sent) await o.health?.(true, null).catch(() => undefined);
    return res;
  } finally {
    await o.rpc('push_flush_end', { p_key: o.key });
  }
}

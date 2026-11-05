// The due run of «مجدول» on Instagram (MVP_draft.md 76.5, Director_Notes_Plan.md answer Q3). Meta publishes at the moment it is
// asked and keeps no time of its own, and the site has no timer, so this runs when /api/platforms/due is called: by the WhatsApp
// bridge computer's loop about once a minute, or, when that computer is off, by Home opened by anyone signed in. Who called it
// changes nothing: the run has no person's session, proves itself with the site's server key, and acts only on what the database
// hands it (direct_fire_claim), for each post's own author.
//
// Server only. The token comes from the claim for this run alone and is never returned, logged or stored. Nothing is logged at
// all: what happened is in the post's row, «سجل النشاط» and the notices the database writes. This file is the engine, with its
// database, Meta and Drive passed in (direct-due-server.ts gives the real ones), so it is tested without them.
//
// One post, in as few calls as it needs:
//   send     Instagram's own daily limit, the temporary address (only its hash kept), Meta's container made from it;
//   advance  Meta's status, asked a few times within this call; once ready the address ends, the post is published, its link
//            read and the result recorded, and the temporary copy goes to Drive's trash. Still preparing: the lease ends and the
//            next call asks again. A container still preparing after half an hour is given up.
import { igContainerStatus, igCreateContainer, igMedia, igPublish, igPublishingLimit, type IgPost } from './instagram.ts';
import type { Fetch } from './oauth.ts';
import { IG_LINK_MINUTES, igProblem, type TestKind } from './test-rules.ts';
import { newLink } from './temp-link.ts';

/** What direct_fire_claim hands the server for one post. */
export type DueItem = {
  id: string;
  step: 'send' | 'advance';
  kind: TestKind;
  mime: string;
  size: number;
  source: 'device' | 'library';
  temp_ref: string | null;
  external_id: string;
  caption: string;
  alt: string;
  share_to_feed: boolean;
  container: string | null;
  fired_at: string;
  token: string;
};
export type DueOutcome = 'published' | 'waiting' | 'failed' | 'skipped';
export type DueResult = { state: 'ran' | 'refused'; claimed: number; published: number; waiting: number; failed: number };

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
export type DueDeps = { rpc: Rpc; key: string; origin: string; fetch: Fetch; trash: (ref: string | null) => Promise<void>; now?: () => number; sleep?: (ms: number) => Promise<void> };

const IG_KINDS: readonly TestKind[] = ['story_image', 'story_video', 'image', 'reel'];
/** Meta's answers worth asking again on the next call, as the test's own advance treats them. */
const PASSING = new Set(['UNREACHABLE', 'PLATFORM_DOWN', 'RATE_LIMIT']);
/** How long one call spends on its posts, under the route's limit of a minute. */
export const DUE_BUDGET_MS = 40_000;
/** Between two questions to Meta about one container. */
export const DUE_POLL_MS = 3_000;
/** A container Meta is still preparing this long after the post was first taken is given up. */
export const DUE_WAIT_MAX_MS = 30 * 60_000;

const quiet = <T>(p: PromiseLike<T>) => Promise.resolve(p).then(() => undefined, () => undefined);

/** Whether a claimed item has the shape the run needs; anything else is left for its lease to end. */
export function dueItem(x: unknown): x is DueItem {
  const o = x as Partial<DueItem> | null;
  return !!o && typeof o.id === 'string' && (o.step === 'send' || o.step === 'advance') && IG_KINDS.includes(o.kind as TestKind)
    && typeof o.token === 'string' && o.token.length > 0 && typeof o.external_id === 'string' && typeof o.mime === 'string'
    && typeof o.size === 'number' && (o.step === 'send' || typeof o.container === 'string');
}

/** One post: sent, or asked about, or published, or stopped with Meta's reason. */
export async function fireOne(d: DueDeps, it: DueItem, until: number): Promise<DueOutcome> {
  const now = d.now ?? Date.now;
  const sleep = d.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const call = (fn: string, args: Record<string, unknown>) => d.rpc(fn, { p_key: d.key, p_test: it.id, ...args });
  const fail = async (code: string): Promise<DueOutcome> => {
    await quiet(call('direct_fire_failed', { p_error: code }));
    await d.trash(it.temp_ref);
    return 'failed';
  };
  const later = async (): Promise<DueOutcome> => {
    await quiet(call('direct_fire_release', {}));
    return 'waiting';
  };
  const kind = it.kind as IgPost['kind'];
  const user = it.external_id;
  let container = it.container;

  if (it.step === 'send') {
    const caption = kind === 'story_image' || kind === 'story_video' ? '' : it.caption;
    const alt = kind === 'image' ? it.alt : '';
    if (igProblem({ kind, size: it.size, mime: it.mime, caption, alt })) return fail('TEST_INVALID');
    const quota = await igPublishingLimit(d.fetch, { token: it.token, user });
    if (quota && quota.used >= quota.total) return fail('QUOTA_REACHED');
    const link = newLink();
    const { error: linked } = await call('direct_fire_link', { p_hash: link.hash, p_until: new Date(now() + IG_LINK_MINUTES * 60_000).toISOString() });
    if (linked) return 'skipped';
    const url = `${d.origin}/api/platforms/test/file/${link.token}`;
    const c = await igCreateContainer(d.fetch, { token: it.token, user, post: { kind, url, caption, alt, shareToFeed: it.share_to_feed === true } });
    if ('error' in c) return PASSING.has(c.error) ? later() : fail(c.error);
    const { error: kept } = await call('direct_fire_container', { p_container: c.id });
    if (kept) return fail('PLATFORM_ERROR');
    container = c.id;
  } else if (now() - Date.parse(it.fired_at) > DUE_WAIT_MAX_MS) {
    return fail('WAIT_TOO_LONG');
  }
  if (!container) return later();

  for (;;) {
    const s = await igContainerStatus(d.fetch, { token: it.token, id: container });
    if ('error' in s) return PASSING.has(s.error) ? later() : fail(s.error);
    if (s.state === 'published') return fail('PLATFORM_ERROR');
    if (s.state === 'ready') break;
    if (now() + DUE_POLL_MS >= until) return later();
    await sleep(DUE_POLL_MS);
  }
  // Meta has the file: the address ends before anything else.
  await quiet(call('direct_fire_link', { p_hash: null, p_until: null }));
  const p = await igPublish(d.fetch, { token: it.token, user, container });
  if ('error' in p) return fail(p.error);
  const m = await igMedia(d.fetch, { token: it.token, id: p.id });
  const permalink = 'error' in m ? null : m.permalink;
  // Made through this account's own publishing address; its owner is checked when Meta names it.
  const owner = 'error' in m ? user : (m.owner ?? user);
  const { data: state } = await call('direct_fire_done', { p_post: p.id, p_owner: owner, p_url: permalink });
  await d.trash(it.temp_ref);
  return state === 'published' ? 'published' : 'failed';
}

/** One run: claim what is due and fire each in turn while the call's budget lasts. */
export async function runDue(d: DueDeps): Promise<DueResult> {
  const now = d.now ?? Date.now;
  const until = now() + DUE_BUDGET_MS;
  const out: DueResult = { state: 'ran', claimed: 0, published: 0, waiting: 0, failed: 0 };
  const { data, error } = await d.rpc('direct_fire_claim', { p_key: d.key });
  if (error) return { ...out, state: 'refused' };
  const items = (Array.isArray(data) ? data : []).filter(dueItem);
  out.claimed = items.length;
  for (const it of items) {
    // Out of time: the rest wait for their lease to end and the next call.
    if (now() >= until) break;
    try {
      const r = await fireOne(d, it, until);
      if (r !== 'skipped') out[r]++;
    } catch {
      // A failure of the network or the database: the lease ends by itself and the next call takes the post again.
    }
  }
  return out;
}

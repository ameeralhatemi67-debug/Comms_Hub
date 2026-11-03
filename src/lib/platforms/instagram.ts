// Instagram's own publishing and delete, for «تجربة النشر» (MVP_draft.md section 72). Server only, like ./youtube.ts: it
// handles the account's token, never logs a response body, and returns errors as short codes. Every call takes the `fetch`
// it should use, so tests run it against a fake Graph API (tests/instagram-test.test.mjs). The token travels in the
// Authorization header, never in an address.
//
// From Meta's documentation as read on 2026-11-03 (content publishing, IG User /media, /media_publish,
// /content_publishing_limit, IG Media, the publishing error codes; Graph API v26.0): a container is made from an address
// Meta fetches (`image_url`, `video_url`); its `status_code` goes IN_PROGRESS, then FINISHED, ERROR or EXPIRED (24 hours);
// `media_publish` makes the post; `DELETE /{ig-media-id}` removes a post, a Reel or a Story with instagram_manage_contents.
// `content_publishing_limit` says 50 posts a day; the overview page says 100, so the figure is read, never assumed.
import { GRAPH_VERSION, type Fetch } from './oauth.ts';
import type { TestKind } from './test-rules.ts';

const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

type Answer = { status: number; body: Record<string, unknown> };
async function ask(f: Fetch, url: string, token: string, init: RequestInit = {}, timeout = 20_000): Promise<Answer | null> {
  let res: Response;
  try {
    res = await f(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `OAuth ${token}` }, signal: AbortSignal.timeout(timeout), cache: 'no-store' });
  } catch {
    return null;
  }
  let body: Record<string, unknown> = {};
  try {
    const text = await res.text();
    if (text) body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Not JSON: the status says enough.
  }
  return { status: res.status, body };
}
const form = (o: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') p.set(k, v);
  return { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: p.toString() } satisfies RequestInit;
};

/** Meta's publishing error subcodes (the content publishing error table) as the site's short codes. */
const SUBCODE: Record<number, string> = {
  2207003: 'MEDIA_FETCH_FAILED',
  2207052: 'MEDIA_FETCH_FAILED',
  2207004: 'MEDIA_REFUSED',
  2207005: 'MEDIA_REFUSED',
  2207023: 'MEDIA_REFUSED',
  2207026: 'MEDIA_REFUSED',
  2207009: 'RATIO_REFUSED',
  2207010: 'CAPTION_REFUSED',
  2207040: 'CAPTION_REFUSED',
  2207042: 'QUOTA_REACHED',
  2207050: 'ACCOUNT_RESTRICTED',
  2207051: 'SPAM_SUSPECTED',
  2207020: 'CONTAINER_EXPIRED',
  2207008: 'CONTAINER_EXPIRED',
  2207006: 'CONTAINER_EXPIRED',
  2207001: 'PLATFORM_DOWN',
  2207032: 'PROCESSING_FAILED',
  2207053: 'PROCESSING_FAILED',
};

/** Why Meta refused, from the status, the error's code and its subcode. */
export function igReason(status: number, body: Record<string, unknown>): string {
  const e = (body.error ?? {}) as { code?: unknown; error_subcode?: unknown };
  const code = Number(e.code);
  const sub = Number(e.error_subcode);
  if (SUBCODE[sub]) return SUBCODE[sub];
  if (code === 190 || status === 401) return 'TOKEN_REFUSED';
  if (code === 10 || (code >= 200 && code < 300)) return 'SCOPE_MISSING';
  if ([4, 17, 32, 613].includes(code) || status === 429) return 'RATE_LIMIT';
  if (code === 9) return 'QUOTA_REACHED';
  if (status >= 500) return 'PLATFORM_DOWN';
  if (code === 100 || code === 36000 || code === 36001 || code === 352) return 'MEDIA_REFUSED';
  return 'PLATFORM_ERROR';
}
const igId = (v: unknown) => (typeof v === 'string' && /^[0-9]{6,30}$/.test(v) ? v : null);

export type IgPost = { kind: Exclude<TestKind, 'video'>; url: string; caption: string; alt: string; shareToFeed: boolean };

/** A container for the post, made from the address Meta fetches the file from. */
export async function igCreateContainer(f: Fetch, a: { token: string; user: string; post: IgPost }): Promise<{ id: string } | { error: string }> {
  const p = a.post;
  const fields: Record<string, string | undefined> =
    p.kind === 'image' ? { image_url: p.url, caption: p.caption, alt_text: p.alt }
    : p.kind === 'story_image' ? { image_url: p.url, media_type: 'STORIES' }
    : p.kind === 'story_video' ? { video_url: p.url, media_type: 'STORIES' }
    : { video_url: p.url, media_type: 'REELS', caption: p.caption, share_to_feed: p.shareToFeed ? 'true' : 'false' };
  const r = await ask(f, `${GRAPH}/${encodeURIComponent(a.user)}/media`, a.token, form(fields), 30_000);
  if (!r) return { error: 'UNREACHABLE' };
  const id = igId(r.body.id);
  return r.status === 200 && id ? { id } : { error: igReason(r.status, r.body) };
}

export type IgStatus = { state: 'wait' } | { state: 'ready' } | { state: 'published' } | { error: string };

/** Where Meta is with the container: still fetching or preparing, ready to publish, or stopped with a reason. */
export async function igContainerStatus(f: Fetch, a: { token: string; id: string }): Promise<IgStatus> {
  const r = await ask(f, `${GRAPH}/${encodeURIComponent(a.id)}?fields=status_code,status`, a.token);
  if (!r) return { error: 'UNREACHABLE' };
  if (r.status !== 200) return { error: igReason(r.status, r.body) };
  const code = String(r.body.status_code ?? '');
  if (code === 'IN_PROGRESS') return { state: 'wait' };
  if (code === 'FINISHED') return { state: 'ready' };
  if (code === 'PUBLISHED') return { state: 'published' };
  if (code === 'EXPIRED') return { error: 'CONTAINER_EXPIRED' };
  // ERROR: Meta's words may carry a subcode ("... 2207052"); only the code is kept, never the words.
  const sub = /\b(2207\d{3})\b/.exec(String(r.body.status ?? ''));
  return { error: (sub && SUBCODE[Number(sub[1])]) || 'PROCESSING_FAILED' };
}

/** Publishes a ready container. */
export async function igPublish(f: Fetch, a: { token: string; user: string; container: string }): Promise<{ id: string } | { error: string }> {
  const r = await ask(f, `${GRAPH}/${encodeURIComponent(a.user)}/media_publish`, a.token, form({ creation_id: a.container }), 30_000);
  if (!r) return { error: 'UNREACHABLE' };
  const id = igId(r.body.id);
  return r.status === 200 && id ? { id } : { error: igReason(r.status, r.body) };
}

export type IgMedia = { id: string; permalink: string | null; owner: string | null; productType: string | null };

/** The published post: its address, its owner and where it appears. */
export async function igMedia(f: Fetch, a: { token: string; id: string }): Promise<IgMedia | { error: string }> {
  const r = await ask(f, `${GRAPH}/${encodeURIComponent(a.id)}?fields=id,permalink,owner,media_product_type`, a.token);
  if (!r) return { error: 'UNREACHABLE' };
  if (r.status !== 200) return { error: igReason(r.status, r.body) };
  const link = typeof r.body.permalink === 'string' && r.body.permalink.startsWith('https://www.instagram.com/') ? r.body.permalink : null;
  const owner = igId((r.body.owner as { id?: unknown } | undefined)?.id);
  return { id: a.id, permalink: link, owner, productType: typeof r.body.media_product_type === 'string' ? r.body.media_product_type : null };
}

/** Deletes a post. One that is already gone counts as deleted. */
export async function igDelete(f: Fetch, a: { token: string; id: string }): Promise<{ gone: boolean } | { error: string }> {
  const r = await ask(f, `${GRAPH}/${encodeURIComponent(a.id)}`, a.token, { method: 'DELETE' });
  if (!r) return { error: 'UNREACHABLE' };
  if (r.status === 200 && r.body.success !== false) return { gone: false };
  const e = (r.body.error ?? {}) as { code?: unknown; error_subcode?: unknown };
  // "Unsupported delete request" with subcode 33: the object does not exist (any more).
  if (r.status === 404 || (Number(e.code) === 100 && Number(e.error_subcode) === 33)) return { gone: true };
  return { error: igReason(r.status, r.body) };
}

/** How many posts the account has published through applications in the last 24 hours, out of how many. */
export async function igPublishingLimit(f: Fetch, a: { token: string; user: string }): Promise<{ used: number; total: number } | null> {
  const r = await ask(f, `${GRAPH}/${encodeURIComponent(a.user)}/content_publishing_limit?fields=quota_usage,config`, a.token);
  if (!r || r.status !== 200) return null;
  const row = (Array.isArray(r.body.data) ? r.body.data[0] : null) as { quota_usage?: unknown; config?: { quota_total?: unknown } } | null;
  const used = Number(row?.quota_usage);
  const total = Number(row?.config?.quota_total);
  return Number.isFinite(used) && Number.isFinite(total) && total > 0 ? { used, total } : null;
}

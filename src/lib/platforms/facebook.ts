// A Facebook Page's own posting and delete, for «تجربة النشر» (MVP_draft.md section 73). Server only, like ./instagram.ts: it
// handles the Page's token, never logs a response body, and returns errors as short codes. Every call takes the `fetch` it
// should use, so tests run it against a fake Graph API (tests/facebook-test.test.mjs). The token travels in the
// Authorization header, never in an address.
//
// From Meta's documentation as read on 2026-11-03 (Pages API posts, Page Post, Page feed, Page photos, Reels publishing; Graph
// API v26.0): `POST /{page}/feed` takes `message` and `link`, and `published=false` with `scheduled_publish_time` (10 minutes
// to 30 days ahead) keeps the post from showing; `DELETE /{post}` removes it; `POST /{page}/photos` takes a file of at most
// 4 MB; a Reel is `video_reels` started, uploaded at the address Meta gives (a `file_url` header for a hosted file), then
// finished with `video_state`. A Page publishes at most 30 Reels a day through applications.
import { GRAPH_VERSION, type Fetch } from './oauth.ts';

const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
/** Every Reel upload address Meta gives starts so; the server sends a request nowhere else. */
export const FB_UPLOAD_PREFIX = 'https://rupload.facebook.com/video-upload/';

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
const postId = (v: unknown) => (typeof v === 'string' && /^[0-9]{5,30}(_[0-9]{5,30})?$/.test(v) ? v : null);
const fbLink = (v: unknown) => (typeof v === 'string' && v.startsWith('https://www.facebook.com/') && v.length <= 300 ? v : null);

/** Why Meta refused a Page request, from the status, the error's code and its subcode. */
export function fbReason(status: number, body: Record<string, unknown>): string {
  const e = (body.error ?? {}) as { code?: unknown; error_subcode?: unknown };
  const code = Number(e.code);
  if (code === 190 || status === 401) return 'TOKEN_REFUSED';
  if (code === 10) return 'SCOPE_MISSING';
  // A permissions error: the person lacks the Page's task, or the Page waits for Page Publishing Authorization.
  if (code >= 200 && code < 300) return 'PAGE_REFUSED';
  if (code === 368) return 'SPAM_SUSPECTED';
  if ([4, 17, 32, 613].includes(code) || status === 429) return 'RATE_LIMIT';
  if (code === 1609005 || code === 1609010) return 'LINK_REFUSED';
  if (status >= 500) return 'PLATFORM_DOWN';
  if (code === 100) return 'MEDIA_REFUSED';
  return 'PLATFORM_ERROR';
}

/** A post on the Page's feed: words, an optional link, and for the silent check a date that keeps it from showing. */
export async function fbFeedPost(f: Fetch, a: { token: string; page: string; message: string; link?: string; scheduledAt?: number }): Promise<{ id: string } | { error: string }> {
  const fields: Record<string, string | undefined> = { message: a.message, link: a.link };
  if (a.scheduledAt) Object.assign(fields, { published: 'false', scheduled_publish_time: String(a.scheduledAt) });
  const r = await ask(f, `${GRAPH}/${encodeURIComponent(a.page)}/feed`, a.token, form(fields), 30_000);
  if (!r) return { error: 'UNREACHABLE' };
  const id = postId(r.body.id);
  return r.status === 200 && id ? { id } : { error: fbReason(r.status, r.body) };
}

export type FbPost = { id: string; page: string | null; published: boolean | null; scheduledAt: number | null; link: string | null };

/** A post as the Page shows it: on which Page, whether it is published yet, when it would be, and its address. */
export async function fbPostInfo(f: Fetch, a: { token: string; id: string }): Promise<FbPost | { error: string }> {
  const r = await ask(f, `${GRAPH}/${encodeURIComponent(a.id)}?fields=id,from,is_published,scheduled_publish_time,permalink_url`, a.token);
  if (!r) return { error: 'UNREACHABLE' };
  if (r.status !== 200) return { error: fbReason(r.status, r.body) };
  const from = (r.body.from as { id?: unknown } | undefined)?.id;
  const when = Number(r.body.scheduled_publish_time);
  return {
    id: a.id,
    page: typeof from === 'string' ? from : null,
    published: typeof r.body.is_published === 'boolean' ? r.body.is_published : null,
    scheduledAt: Number.isFinite(when) && when > 0 ? when : null,
    link: fbLink(r.body.permalink_url),
  };
}

/** A photo post, sent as a file. Meta answers the photo's id and the post's. */
export async function fbPhoto(f: Fetch, a: { token: string; page: string; jpeg: Uint8Array; caption: string; alt: string }): Promise<{ photo: string; post: string } | { error: string }> {
  const body = new FormData();
  body.set('source', new Blob([a.jpeg as BlobPart], { type: 'image/jpeg' }), 'photo.jpg');
  if (a.caption) body.set('caption', a.caption);
  if (a.alt) body.set('alt_text_custom', a.alt);
  body.set('published', 'true');
  const r = await ask(f, `${GRAPH}/${encodeURIComponent(a.page)}/photos`, a.token, { method: 'POST', body }, 50_000);
  if (!r) return { error: 'UNREACHABLE' };
  const photo = postId(r.body.id);
  const post = postId(r.body.post_id);
  if (r.status === 200 && photo && post) return { photo, post };
  const why = fbReason(r.status, r.body);
  return { error: why === 'MEDIA_REFUSED' ? 'PHOTO_REFUSED' : why };
}

/** Step 1 of a Reel: Meta gives the video's id and the address to upload it to. */
export async function fbReelStart(f: Fetch, a: { token: string; page: string }): Promise<{ video: string; upload: string } | { error: string }> {
  const r = await ask(f, `${GRAPH}/${encodeURIComponent(a.page)}/video_reels`, a.token, form({ upload_phase: 'start' }));
  if (!r) return { error: 'UNREACHABLE' };
  const video = postId(r.body.video_id);
  const upload = typeof r.body.upload_url === 'string' && r.body.upload_url.startsWith(FB_UPLOAD_PREFIX) ? r.body.upload_url : null;
  return r.status === 200 && video && upload ? { video, upload } : { error: r.status === 200 ? 'PLATFORM_ERROR' : fbReason(r.status, r.body) };
}

/** Step 2: Meta fetches the file from the site's temporary address. */
export async function fbReelUpload(f: Fetch, a: { token: string; upload: string; fileUrl: string }): Promise<{ ok: true } | { error: string }> {
  if (!a.upload.startsWith(FB_UPLOAD_PREFIX)) return { error: 'PLATFORM_ERROR' };
  const r = await ask(f, a.upload, a.token, { method: 'POST', headers: { file_url: a.fileUrl } }, 30_000);
  if (!r) return { error: 'UNREACHABLE' };
  return r.status === 200 && r.body.success !== false ? { ok: true } : { error: fbReason(r.status, r.body) };
}

export type FbReelState = { state: 'uploading' } | { state: 'uploaded' } | { state: 'publishing' } | { state: 'published' } | { error: string };

/** Where Meta is with the Reel: still fetching, ready to publish, publishing, published, or stopped. */
export async function fbReelStatus(f: Fetch, a: { token: string; video: string }): Promise<FbReelState> {
  const r = await ask(f, `${GRAPH}/${encodeURIComponent(a.video)}?fields=status`, a.token);
  if (!r) return { error: 'UNREACHABLE' };
  if (r.status !== 200) return { error: fbReason(r.status, r.body) };
  const s = (r.body.status ?? {}) as Record<string, { status?: unknown } | unknown>;
  const phase = (k: string) => String(((s[k] ?? {}) as { status?: unknown }).status ?? '');
  const video = String(s.video_status ?? '');
  if (phase('uploading_phase') === 'error') return { error: 'MEDIA_FETCH_FAILED' };
  if (['error', 'expired', 'upload_failed'].includes(video) || phase('processing_phase') === 'error' || phase('publishing_phase') === 'error') return { error: 'PROCESSING_FAILED' };
  if (phase('uploading_phase') !== 'complete') return { state: 'uploading' };
  if (phase('publishing_phase') === 'complete') return { state: 'published' };
  if (phase('publishing_phase') === 'in_progress') return { state: 'publishing' };
  return { state: 'uploaded' };
}

/** Step 3: publish the Reel with its words. */
export async function fbReelFinish(f: Fetch, a: { token: string; page: string; video: string; description: string }): Promise<{ ok: true } | { error: string }> {
  const r = await ask(f, `${GRAPH}/${encodeURIComponent(a.page)}/video_reels`, a.token, form({ upload_phase: 'finish', video_id: a.video, video_state: 'PUBLISHED', description: a.description }), 30_000);
  if (!r) return { error: 'UNREACHABLE' };
  if (r.status === 200 && r.body.success !== false) return { ok: true };
  const why = fbReason(r.status, r.body);
  return { error: why === 'RATE_LIMIT' ? 'REEL_LIMIT' : why };
}

/** A published Reel: its Page and its address. */
export async function fbVideoInfo(f: Fetch, a: { token: string; video: string }): Promise<{ page: string | null; link: string | null } | { error: string }> {
  const r = await ask(f, `${GRAPH}/${encodeURIComponent(a.video)}?fields=from,permalink_url`, a.token);
  if (!r) return { error: 'UNREACHABLE' };
  if (r.status !== 200) return { error: fbReason(r.status, r.body) };
  const from = (r.body.from as { id?: unknown } | undefined)?.id;
  const raw = typeof r.body.permalink_url === 'string' ? r.body.permalink_url : '';
  // A video's permalink may come as a path on facebook.com.
  return { page: typeof from === 'string' ? from : null, link: fbLink(raw.startsWith('/') ? `https://www.facebook.com${raw}` : raw) };
}

/** Deletes a post, a photo's post or a Reel. One that is already gone counts as deleted. */
export async function fbDelete(f: Fetch, a: { token: string; id: string }): Promise<{ gone: boolean } | { error: string }> {
  const r = await ask(f, `${GRAPH}/${encodeURIComponent(a.id)}`, a.token, { method: 'DELETE' });
  if (!r) return { error: 'UNREACHABLE' };
  if (r.status === 200 && r.body.success !== false) return { gone: false };
  const e = (r.body.error ?? {}) as { code?: unknown; error_subcode?: unknown };
  if (r.status === 404 || (Number(e.code) === 100 && Number(e.error_subcode) === 33)) return { gone: true };
  return { error: fbReason(r.status, r.body) };
}

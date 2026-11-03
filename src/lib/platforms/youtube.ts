// YouTube's own upload and delete, for «تجربة النشر» (MVP_draft.md section 71). Server only, like ./oauth2.ts: it handles
// tokens and the upload's address, never logs a response body, and returns errors as short codes. Every call takes the
// `fetch` it should use, so tests run it against a fake YouTube (tests/youtube-test.test.mjs).
//
// From Google's documentation as read on 2026-11-03 (videos.insert, "Resumable Uploads", videos.delete, the revision
// history): an upload is opened with a POST that carries the video's details and answers 200 with the upload's address
// in `Location`; the file follows in PUTs of 256 KiB multiples, each answered 308 with the `Range` received, the last
// 200 or 201 with the video. An upload is one call of the "Video Uploads" quota (100 a day); a delete is 50 units of
// the 10,000 a day and needs youtube.force-ssl or youtube. The API has no method that creates a community post.
import type { Fetch } from './oauth.ts';
import { isUploadUrl } from './test-rules.ts';

const UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/videos';
const YT = 'https://www.googleapis.com/youtube/v3';

type Answer = { status: number; headers: Headers; body: Record<string, unknown> };
async function ask(f: Fetch, url: string, init: RequestInit, timeout: number): Promise<Answer | null> {
  let res: Response;
  try {
    res = await f(url, { ...init, signal: AbortSignal.timeout(timeout), cache: 'no-store' });
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
  return { status: res.status, headers: res.headers, body };
}

/** Why YouTube refused, from the status and the first error's reason. */
export function ytReason(status: number, body: Record<string, unknown>): string {
  const e = (body.error ?? {}) as { errors?: { reason?: string }[]; details?: { reason?: string }[] };
  const reasons = [...(e.errors ?? []).map((x) => x.reason), ...(e.details ?? []).map((x) => x.reason)].filter(Boolean);
  if (status === 401) return 'TOKEN_REFUSED';
  if (reasons.some((r) => r === 'insufficientPermissions' || r === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT')) return 'SCOPE_MISSING';
  if (status === 429 || reasons.some((r) => r === 'quotaExceeded' || r === 'uploadLimitExceeded' || r === 'rateLimitExceeded' || r === 'dailyLimitExceeded')) return 'UPLOAD_LIMIT';
  if (reasons.includes('youtubeSignupRequired')) return 'NO_CHANNEL';
  if (status >= 500) return 'PLATFORM_DOWN';
  if (status === 404 || status === 410) return 'UPLOAD_EXPIRED';
  if (status === 400) return 'VIDEO_REFUSED';
  if (status === 403) return 'FORBIDDEN_BY_PLATFORM';
  return 'PLATFORM_ERROR';
}

export type TestVideo = { title: string; description: string; privacy: 'private' | 'public'; size: number; mime: string };

/**
 * Opens a resumable upload at YouTube with the video's details. Subscribers are not told of a test, whatever its privacy.
 * Returns the upload's address, which the server keeps and never gives to a page.
 */
export async function youtubeOpenUpload(f: Fetch, a: { access: string; video: TestVideo }): Promise<{ url: string } | { error: string }> {
  const params = new URLSearchParams({ uploadType: 'resumable', part: 'snippet,status', notifySubscribers: 'false' });
  const r = await ask(
    f,
    `${UPLOAD}?${params.toString()}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${a.access}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(a.video.size),
        'X-Upload-Content-Type': a.video.mime,
      },
      body: JSON.stringify({
        snippet: { title: a.video.title.trim(), description: a.video.description, categoryId: '22' },
        status: { privacyStatus: a.video.privacy },
      }),
    },
    20_000,
  );
  if (!r) return { error: 'UNREACHABLE' };
  if (r.status !== 200 && r.status !== 201) return { error: ytReason(r.status, r.body) };
  const url = r.headers.get('location');
  return isUploadUrl(url) ? { url } : { error: 'PLATFORM_ERROR' };
}

export type Uploaded = { id: string; channelId: string | null; privacy: string | null };

/** Where an upload stands after a 308: the next byte YouTube needs. No `Range` means it has nothing yet. */
export function nextByte(range: string | null): number {
  const m = /bytes=(\d+)-(\d+)/.exec(range ?? '');
  return m ? Number(m[2]) + 1 : 0;
}

/**
 * Sends one piece of the file, or, with an empty piece, asks how much YouTube has. The answer is the next byte to send,
 * or the video once the last byte arrived.
 */
export async function youtubeSendPiece(
  f: Fetch,
  a: { url: string; access: string; bytes: Uint8Array; from: number; total: number },
): Promise<{ next: number } | { video: Uploaded } | { error: string }> {
  if (!isUploadUrl(a.url)) return { error: 'UPLOAD_EXPIRED' };
  const len = a.bytes.byteLength;
  const range = len === 0 ? `bytes */${a.total}` : `bytes ${a.from}-${a.from + len - 1}/${a.total}`;
  const r = await ask(f, a.url, { method: 'PUT', headers: { Authorization: `Bearer ${a.access}`, 'Content-Range': range }, body: len === 0 ? null : (a.bytes as BodyInit) }, 55_000);
  if (!r) return { error: 'UNREACHABLE' };
  if (r.status === 308) return { next: nextByte(r.headers.get('range')) };
  if (r.status === 200 || r.status === 201) {
    const id = typeof r.body.id === 'string' ? r.body.id : '';
    if (!id) return { error: 'PLATFORM_ERROR' };
    const snippet = (r.body.snippet ?? {}) as { channelId?: unknown };
    const status = (r.body.status ?? {}) as { privacyStatus?: unknown };
    return { video: { id, channelId: typeof snippet.channelId === 'string' ? snippet.channelId : null, privacy: typeof status.privacyStatus === 'string' ? status.privacyStatus : null } };
  }
  return { error: ytReason(r.status, r.body) };
}

/** Deletes a video. A video that is already gone counts as deleted. */
export async function youtubeDelete(f: Fetch, a: { access: string; id: string }): Promise<{ gone: boolean } | { error: string }> {
  const r = await ask(f, `${YT}/videos?${new URLSearchParams({ id: a.id }).toString()}`, { method: 'DELETE', headers: { Authorization: `Bearer ${a.access}` } }, 20_000);
  if (!r) return { error: 'UNREACHABLE' };
  if (r.status === 204 || r.status === 200) return { gone: false };
  if (r.status === 404) return { gone: true };
  return { error: ytReason(r.status, r.body) };
}

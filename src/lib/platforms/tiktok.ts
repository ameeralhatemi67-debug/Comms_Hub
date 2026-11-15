// A TikTok account's own posting, for «تجربة النشر» and «نشر مباشر» (MVP_draft.md section 79). Server only, like ./facebook.ts:
// it handles the account's token, never logs a response body, and returns errors as short codes. Every call takes the `fetch`
// it should use, so tests run it against a fake API (tests/tiktok-test.test.mjs). The token travels in the Authorization header.
//
// From TikTok's Content Posting API as read on 2026-11-15:
//   * `POST /v2/post/publish/creator_info/query/` (video.publish, 20 a minute): the creator's nickname, the privacy levels the
//     account may use, whether comments, Duets and Stitches are off, and the longest video the creator may post.
//   * `POST /v2/post/publish/video/init/` (video.publish, 6 a minute): a direct post with `post_info` (title at most 2200 UTF-16
//     units, privacy_level from the creator's list, the three interaction switches, the two commercial switches) and
//     `source_info` {source: PULL_FROM_URL, video_url}, a public https address under a verified URL prefix that does not redirect.
//   * `POST /v2/post/publish/inbox/video/init/` (video.upload, 6 a minute): the same `source_info` only; the video waits in the
//     creator's TikTok inbox, at most 5 pending in 24 hours.
//   * `POST /v2/post/publish/status/fetch/` (30 a minute): PROCESSING_DOWNLOAD, SEND_TO_USER_INBOX, PUBLISH_COMPLETE or FAILED
//     with a fail_reason; `publicaly_available_post_id` (sic) only once the post is public and passed moderation.
//   * Every answer has `error.code`, 'ok' when it worked. An unaudited app posts only SELF_ONLY, only to a private account
//     (unaudited_client_can_only_post_to_private_accounts). There is no API to delete or schedule a post.
import type { Fetch } from './oauth.ts';

const API = 'https://open.tiktokapis.com/v2/post/publish';

/** TikTok's privacy levels, and the site's short names for them (the database keeps the short ones). */
export const TT_LEVEL = { public: 'PUBLIC_TO_EVERYONE', friends: 'MUTUAL_FOLLOW_FRIENDS', followers: 'FOLLOWER_OF_CREATOR', private: 'SELF_ONLY' } as const;
export type TtPrivacy = keyof typeof TT_LEVEL;
const SHORT: Record<string, TtPrivacy> = Object.fromEntries(Object.entries(TT_LEVEL).map(([k, v]) => [v, k as TtPrivacy]));

export type Creator = {
  nickname: string;
  privacy: TtPrivacy[];
  commentOff: boolean;
  duetOff: boolean;
  stitchOff: boolean;
  maxSeconds: number | null;
};
export type TtPostOptions = {
  title: string;
  privacy: TtPrivacy;
  comments: boolean;
  duet: boolean;
  stitch: boolean;
  /** «Your brand»: the creator's own business. */
  ownBrand: boolean;
  /** «Branded content»: a paid partnership with a third party. */
  branded: boolean;
};
export type TtStatus = { state: 'processing' } | { state: 'inbox' } | { state: 'published'; post: string | null } | { state: 'failed'; reason: string };

/** `text` is the answer as sent: a post id is a 64-bit number, which JSON.parse would round. */
type Answer = { status: number; body: Record<string, unknown>; text: string };
async function ask(f: Fetch, url: string, token: string, body: unknown, timeout = 20_000): Promise<Answer | null> {
  let res: Response;
  try {
    res = await f(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
      cache: 'no-store',
    });
  } catch {
    return null;
  }
  let parsed: Record<string, unknown> = {};
  let text = '';
  try {
    text = await res.text();
    if (text) parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Not JSON: the status says enough.
  }
  return { status: res.status, body: parsed, text: text.slice(0, 20_000) };
}

const codeOf = (a: Answer) => String(((a.body.error ?? {}) as { code?: unknown }).code ?? '');
const dataOf = (a: Answer) => (a.body.data ?? {}) as Record<string, unknown>;
const worked = (a: Answer) => a.status === 200 && (codeOf(a) === 'ok' || codeOf(a) === '');

/** TikTok's error codes as the site's. Never a message or a body. */
export function ttError(a: Answer | null): string {
  if (!a) return 'UNREACHABLE';
  const c = codeOf(a);
  switch (c) {
    case 'access_token_invalid':
      return 'TOKEN_REFUSED';
    case 'scope_not_authorized':
    case 'scope_permission_missed':
      return 'SCOPE_MISSING';
    case 'rate_limit_exceeded':
      return 'RATE_LIMIT';
    case 'spam_risk_too_many_posts':
    case 'reached_active_user_cap':
      return 'TT_DAILY_CAP';
    case 'spam_risk_too_many_pending_share':
      return 'TT_PENDING_CAP';
    case 'spam_risk_user_banned_from_posting':
      return 'TT_BANNED';
    case 'unaudited_client_can_only_post_to_private_accounts':
      return 'TT_UNAUDITED';
    case 'url_ownership_unverified':
      return 'TT_URL_UNVERIFIED';
    case 'privacy_level_option_mismatch':
      return 'TT_PRIVACY_MISMATCH';
    case 'invalid_param':
      return 'TEST_INVALID';
  }
  if (a.status === 401) return 'TOKEN_REFUSED';
  if (a.status === 429) return 'RATE_LIMIT';
  return a.status >= 500 ? 'PLATFORM_DOWN' : 'PLATFORM_ERROR';
}

/** The creator's settings, read each time the form opens, as TikTok asks. */
export async function ttCreator(f: Fetch, a: { token: string }): Promise<Creator | { error: string }> {
  const r = await ask(f, `${API}/creator_info/query/`, a.token, undefined);
  if (!r || !worked(r)) return { error: ttError(r) };
  const d = dataOf(r);
  const levels = Array.isArray(d.privacy_level_options) ? d.privacy_level_options : [];
  const privacy = (['public', 'friends', 'followers', 'private'] as TtPrivacy[]).filter((p) => levels.includes(TT_LEVEL[p]));
  const max = Number(d.max_video_post_duration_sec);
  return {
    nickname: typeof d.creator_nickname === 'string' ? d.creator_nickname.slice(0, 100) : '',
    privacy,
    commentOff: d.comment_disabled === true,
    duetOff: d.duet_disabled === true,
    stitchOff: d.stitch_disabled === true,
    maxSeconds: Number.isFinite(max) && max > 0 ? max : null,
  };
}

const publishId = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9_.~-]{6,64}$/.test(v) ? v : null);

/** A draft in the creator's TikTok inbox, fetched by TikTok from `videoUrl`. */
export async function ttDraft(f: Fetch, a: { token: string; videoUrl: string }): Promise<{ publish: string } | { error: string }> {
  const r = await ask(f, `${API}/inbox/video/init/`, a.token, { source_info: { source: 'PULL_FROM_URL', video_url: a.videoUrl } });
  const id = r && worked(r) ? publishId(dataOf(r).publish_id) : null;
  return id ? { publish: id } : { error: r && worked(r) ? 'PLATFORM_ERROR' : ttError(r) };
}

/** A direct post, fetched by TikTok from `videoUrl`, with the choices the person made. */
export async function ttPost(f: Fetch, a: { token: string; videoUrl: string; options: TtPostOptions }): Promise<{ publish: string } | { error: string }> {
  const o = a.options;
  const r = await ask(f, `${API}/video/init/`, a.token, {
    post_info: {
      title: o.title,
      privacy_level: TT_LEVEL[o.privacy],
      disable_comment: !o.comments,
      disable_duet: !o.duet,
      disable_stitch: !o.stitch,
      brand_content_toggle: o.branded,
      brand_organic_toggle: o.ownBrand,
    },
    source_info: { source: 'PULL_FROM_URL', video_url: a.videoUrl },
  });
  const id = r && worked(r) ? publishId(dataOf(r).publish_id) : null;
  return id ? { publish: id } : { error: r && worked(r) ? 'PLATFORM_ERROR' : ttError(r) };
}

const FAIL: Record<string, string> = {
  file_format_check_failed: 'TT_FORMAT',
  duration_check_failed: 'TT_DURATION',
  frame_rate_check_failed: 'TT_FRAME_RATE',
  picture_size_check_failed: 'TT_PICTURE_SIZE',
  video_pull_failed: 'TT_PULL_FAILED',
  publish_cancelled: 'CANCELLED',
  auth_removed: 'PERMISSION_REVOKED',
  spam_risk_too_many_posts: 'TT_DAILY_CAP',
  spam_risk_user_banned_from_posting: 'TT_BANNED',
  spam_risk_text: 'TT_TEXT_REFUSED',
  spam_risk: 'TT_SPAM',
  internal: 'PLATFORM_DOWN',
};

/** Where an upload stands at TikTok. */
export async function ttStatus(f: Fetch, a: { token: string; publish: string }): Promise<TtStatus | { error: string }> {
  const r = await ask(f, `${API}/status/fetch/`, a.token, { publish_id: a.publish });
  if (!r || !worked(r)) return { error: ttError(r) };
  const d = dataOf(r);
  switch (d.status) {
    case 'PROCESSING_DOWNLOAD':
    case 'PROCESSING_UPLOAD':
      return { state: 'processing' };
    case 'SEND_TO_USER_INBOX':
      return { state: 'inbox' };
    case 'PUBLISH_COMPLETE': {
      // Read from the text, digit for digit: as a JSON number the id would lose its last digits.
      const list = /"publicaly_available_post_id"\s*:\s*\[([^\]]*)\]/.exec(r.text)?.[1] ?? '';
      const post = /([0-9]{6,30})/.exec(list)?.[1] ?? null;
      return { state: 'published', post };
    }
    case 'FAILED':
      return { state: 'failed', reason: FAIL[String(d.fail_reason ?? '')] ?? 'PLATFORM_ERROR' };
  }
  return { state: 'processing' };
}

export const ttShort = (level: string): TtPrivacy | null => SHORT[level] ?? null;

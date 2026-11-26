// A Snapchat Public Profile's own publishing and reading, for «تجربة النشر» (MVP_draft.md section 85, Snapchat_Test_Plan.md). Server only, like
// ./tiktok.ts: it handles the account's token, never logs a response body, and returns errors as short codes. Every call takes the `fetch` it should
// use, so tests run it against a fake Snap (tests/snapchat-test.test.mjs). The token travels in the Authorization header.
//
// From Snap's Public Profile API as read on 2026-11-26 (developers.snap.com/marketing-api/Public-Profile-API, pages undated). The whole API is
// allowlist only, so NOTHING here has met a real Snap answer: the shapes below are the documentation's examples, read defensively.
//   * Media: the file is encrypted with AES-256-CBC (a 32-byte key and a 16-byte iv, PKCS7 padding), `POST /v1/public_profiles/{id}/media` {type,
//     name, key, iv} gives `media_id`, `add_path` and `finalize_path`; each part (at most 32 MB, parts 1 to 35) goes to `add_path` as a multipart
//     form {action: ADD, file, part_number}, then `finalize_path` takes {action: FINALIZE}. A media object lives 24 hours.
//   * `POST .../stories` {media_id} posts a Story (24 hours by default). Its answer carries no story id, and Snap has no delete for a Story.
//   * `POST .../spotlights` {media_id, locale, description, go_live_timestamp?} answers `spotlight_id`; `GET .../spotlights/{id}` reads it back
//     (status SUBMITTED, LIVE or REJECTED); `DELETE .../spotlights/{id}` deletes it for good.
//   * `GET .../stats` (the profile's, lifetime) and `GET .../spotlights/{id}/stats` answer `timeseries[].fields[]` of {field.field_name, stats[].value}.
//     They "usually synchronize after 24 hours", reach back 90 days, and have no reach or completion-rate metric.
import { createCipheriv, createHmac } from 'node:crypto';
import type { Fetch } from './oauth.ts';
import { snapProfileOf } from './oauth2.ts';

const API = 'https://businessapi.snapchat.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POST_ID = /^[A-Za-z0-9_-]{6,80}$/;
/** Where Snap says an upload goes: under the fixed API address only, never an address the answer names. */
const UPLOAD_PATH = /^\/[a-z0-9/_-]{1,200}\/multipart-upload$/;
/** The locale of a Spotlight's description: the one Snap's own example uses. */
export const SN_LOCALE = 'en_US';

export type SnAnswer = { status: number; body: Record<string, unknown> };

/** The key and iv of one test's media, worked out from the server key and the test's id: nothing is stored, and the page never holds them. */
export function snKeys(serverKey: string, testId: string): { key: Buffer; iv: Buffer } {
  const mac = (label: string) => createHmac('sha256', serverKey).update(`comms-hub/snapchat-media/${label}/${testId}`).digest();
  return { key: mac('key'), iv: mac('iv').subarray(0, 16) };
}

/** AES-256-CBC with PKCS7 padding, as `openssl enc -aes-256-cbc -nosalt -K key -iv iv` writes it. */
export function snEncrypt(bytes: Uint8Array, key: Buffer, iv: Buffer): Buffer {
  const c = createCipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([c.update(bytes), c.final()]);
}

async function ask(f: Fetch, method: 'GET' | 'POST' | 'DELETE', url: string, token: string, body?: { json?: unknown; form?: FormData }, timeout = 30_000): Promise<SnAnswer | null> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  if (body?.json !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await f(url, { method, headers, body: body?.form ?? (body?.json !== undefined ? JSON.stringify(body.json) : undefined), signal: AbortSignal.timeout(timeout), cache: 'no-store' });
  } catch {
    return null;
  }
  let parsed: Record<string, unknown> = {};
  try {
    const text = await res.text();
    if (text) parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Not JSON: the status says enough.
  }
  return { status: res.status, body: parsed };
}

const codeOf = (a: SnAnswer) => (typeof a.body.error_code === 'string' ? a.body.error_code : '');
/** Worked: HTTP 200 and no `request_status` of ERROR. */
const worked = (a: SnAnswer | null): a is SnAnswer => !!a && a.status === 200 && a.body.request_status !== 'ERROR';

/**
 * What Snap said, for whoever traces a failure: its error code, its request id (which Snap's support asks for) and the HTTP status, as one short
 * line. Never a message or a body; anything not shaped like a code is left out.
 */
export function snDetail(a: SnAnswer | null): string | undefined {
  if (!a) return 'snap unreachable';
  const code = /^[A-Z0-9_]{3,80}$/.test(codeOf(a)) ? codeOf(a) : '';
  const req = typeof a.body.request_id === 'string' && UUID.test(a.body.request_id) ? a.body.request_id : '';
  const parts = ['snap', code, req ? `req ${req}` : '', a.status !== 200 ? `http ${a.status}` : ''].filter(Boolean);
  return parts.length > 1 ? parts.join(' ') : undefined;
}

/** Snap's answers as the site's short codes. Never a message or a body. */
export function snError(a: SnAnswer | null): string {
  if (!a) return 'UNREACHABLE';
  if (codeOf(a) === 'MEDIA_EXPIRED') return 'SN_MEDIA_EXPIRED';
  if (a.status === 401) return 'TOKEN_REFUSED';
  if (a.status === 403) return 'ACCESS_NOT_GRANTED';
  if (a.status === 429) return 'RATE_LIMIT';
  if (a.status >= 500) return 'PLATFORM_DOWN';
  if (a.status === 400 || a.status === 422 || /^VALIDATION_ERROR/.test(codeOf(a))) return 'SN_POST_REFUSED';
  return 'PLATFORM_ERROR';
}
export type SnFail = { error: string; detail?: string };
const fail = (a: SnAnswer | null): SnFail => ({ error: snError(a), detail: snDetail(a) });
/** A step of the file's upload: a refusal of the content is the file's, not the post's. */
const failUp = (a: SnAnswer | null): SnFail => {
  const e = a && a.status === 200 ? 'SN_MEDIA_REFUSED' : snError(a);
  return { error: e === 'SN_POST_REFUSED' ? 'SN_MEDIA_REFUSED' : e, detail: snDetail(a) };
};
const base = (profile: string) => `${API}/v1/public_profiles/${profile}`;
const okProfile = (p: string) => UUID.test(p);

/** A media object for one encrypted file. `add` and `finalize` are paths under Snap's own address. */
export async function snCreateMedia(f: Fetch, a: { token: string; profile: string; type: 'VIDEO' | 'IMAGE'; name: string; key: Buffer; iv: Buffer }): Promise<{ media: string; add: string; finalize: string } | SnFail> {
  if (!okProfile(a.profile)) return { error: 'NOT_CONNECTED' };
  const r = await ask(f, 'POST', `${base(a.profile)}/media`, a.token, { json: { type: a.type, name: a.name, key: a.key.toString('base64'), iv: a.iv.toString('base64') } });
  if (!worked(r)) return failUp(r);
  const media = typeof r.body.media_id === 'string' && UUID.test(r.body.media_id) ? r.body.media_id : null;
  const add = typeof r.body.add_path === 'string' ? r.body.add_path : '';
  const finalize = typeof r.body.finalize_path === 'string' ? r.body.finalize_path : add;
  if (!media || !UPLOAD_PATH.test(add) || !UPLOAD_PATH.test(finalize) || add.includes('..') || finalize.includes('..')) return { error: 'PLATFORM_ERROR', detail: snDetail(r) };
  return { media, add, finalize };
}

/** One part of the encrypted file (parts count from 1). */
export async function snUploadPart(f: Fetch, a: { token: string; path: string; part: number; bytes: Uint8Array }): Promise<{ ok: true } | SnFail> {
  if (!UPLOAD_PATH.test(a.path) || !Number.isInteger(a.part) || a.part < 1 || a.part > 35) return { error: 'SN_UPLOAD_FAILED' };
  const form = new FormData();
  form.set('action', 'ADD');
  form.set('file', new Blob([a.bytes as BlobPart], { type: 'application/octet-stream' }), `part-${a.part}`);
  form.set('part_number', String(a.part));
  const r = await ask(f, 'POST', `${API}${a.path}`, a.token, { form }, 55_000);
  return worked(r) ? { ok: true } : failUp(r);
}

/** Tells Snap the file is whole. */
export async function snFinalize(f: Fetch, a: { token: string; path: string }): Promise<{ ok: true } | SnFail> {
  if (!UPLOAD_PATH.test(a.path)) return { error: 'SN_UPLOAD_FAILED' };
  const form = new FormData();
  form.set('action', 'FINALIZE');
  const r = await ask(f, 'POST', `${API}${a.path}`, a.token, { form });
  return worked(r) ? { ok: true } : failUp(r);
}

/** A Story with the default 24 hours. Snap's answer holds no story id. */
export async function snPostStory(f: Fetch, a: { token: string; profile: string; media: string }): Promise<{ ok: true } | SnFail> {
  if (!okProfile(a.profile)) return { error: 'NOT_CONNECTED' };
  const r = await ask(f, 'POST', `${base(a.profile)}/stories`, a.token, { json: { media_id: a.media } });
  return worked(r) ? { ok: true } : fail(r);
}

/** A Spotlight, now or (with `goLive`, an RFC 3339 time within 30 days) later. */
export async function snPostSpotlight(f: Fetch, a: { token: string; profile: string; media: string; description: string; goLive?: string }): Promise<{ spotlight: string } | SnFail> {
  if (!okProfile(a.profile)) return { error: 'NOT_CONNECTED' };
  const r = await ask(f, 'POST', `${base(a.profile)}/spotlights`, a.token, {
    json: { media_id: a.media, locale: SN_LOCALE, ...(a.description ? { description: a.description } : {}), ...(a.goLive ? { go_live_timestamp: a.goLive } : {}) },
  });
  if (!worked(r)) return fail(r);
  const id = typeof r.body.spotlight_id === 'string' && POST_ID.test(r.body.spotlight_id) ? r.body.spotlight_id : null;
  return id ? { spotlight: id } : { error: 'PLATFORM_ERROR', detail: snDetail(r) };
}

export type SnSpotlight = { id: string; status: string | null };
const statusOf = (v: unknown) => (typeof v === 'string' && /^[A-Z_]{2,30}$/.test(v) ? v : null);

/** The Spotlights in an answer, wherever the envelope puts them: `spotlights[].spotlight`, or `spotlight`. */
function spotlightsOf(body: Record<string, unknown>): SnSpotlight[] {
  const list = Array.isArray(body.spotlights) ? body.spotlights : body.spotlight ? [{ spotlight: body.spotlight }] : [];
  const out: SnSpotlight[] = [];
  for (const x of list) {
    const s = (x && typeof x === 'object' ? ((x as Record<string, unknown>).spotlight ?? x) : null) as Record<string, unknown> | null;
    if (s && typeof s.id === 'string' && POST_ID.test(s.id)) out.push({ id: s.id, status: statusOf(s.status) });
  }
  return out;
}

/** One Spotlight read back. `gone` when Snap says it does not exist. */
export async function snSpotlight(f: Fetch, a: { token: string; profile: string; id: string }): Promise<SnSpotlight | { gone: true } | SnFail> {
  if (!okProfile(a.profile) || !POST_ID.test(a.id)) return { error: 'TEST_INVALID' };
  const r = await ask(f, 'GET', `${base(a.profile)}/spotlights/${a.id}`, a.token);
  if (r && r.status === 404) return { gone: true };
  if (!worked(r)) return fail(r);
  const s = spotlightsOf(r.body).find((x) => x.id === a.id) ?? spotlightsOf(r.body)[0];
  return s ?? { error: 'PLATFORM_ERROR', detail: snDetail(r) };
}

/** The profile's latest Spotlights. */
export async function snSpotlights(f: Fetch, a: { token: string; profile: string; limit?: number }): Promise<SnSpotlight[] | SnFail> {
  if (!okProfile(a.profile)) return { error: 'NOT_CONNECTED' };
  const r = await ask(f, 'GET', `${base(a.profile)}/spotlights?limit=${a.limit ?? 10}`, a.token);
  return worked(r) ? spotlightsOf(r.body) : fail(r);
}

/** How many Stories the profile has now (Snap's list; the count only). */
export async function snStories(f: Fetch, a: { token: string; profile: string; limit?: number }): Promise<{ count: number } | SnFail> {
  if (!okProfile(a.profile)) return { error: 'NOT_CONNECTED' };
  const r = await ask(f, 'GET', `${base(a.profile)}/stories?limit=${a.limit ?? 10}`, a.token);
  if (!worked(r)) return fail(r);
  return { count: Array.isArray(r.body.stories) ? r.body.stories.length : 0 };
}

/** Deletes a Spotlight for good. `gone`: it was already not there. */
export async function snSpotlightDelete(f: Fetch, a: { token: string; profile: string; id: string }): Promise<{ gone: boolean } | SnFail> {
  if (!okProfile(a.profile) || !POST_ID.test(a.id)) return { error: 'TEST_INVALID' };
  const r = await ask(f, 'DELETE', `${base(a.profile)}/spotlights/${a.id}`, a.token);
  if (r && r.status === 404) return { gone: true };
  return worked(r) ? { gone: false } : fail(r);
}

export type SnProfileInfo = { id: string; name: string; username: string | null; subscribers: number | null };
const countOf = (v: unknown) => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
};
/** The first `subscriber_count` in an answer, a few levels down. */
function subscribersOf(body: unknown, depth = 0): number | null {
  if (!body || typeof body !== 'object' || depth > 5) return null;
  if (Array.isArray(body)) {
    for (const x of body) {
      const n = subscribersOf(x, depth + 1);
      if (n !== null) return n;
    }
    return null;
  }
  const o = body as Record<string, unknown>;
  if ('subscriber_count' in o) return countOf(o.subscriber_count);
  for (const v of Object.values(o)) {
    const n = subscribersOf(v, depth + 1);
    if (n !== null) return n;
  }
  return null;
}

/** The Public Profile of the person who signed in, with its subscriber count when Snap gives one. */
export async function snProfile(f: Fetch, a: { token: string }): Promise<SnProfileInfo | SnFail> {
  const r = await ask(f, 'GET', `${API}/v1/public_profiles/my_profile`, a.token);
  if (r && r.status === 404) return { error: 'NO_PROFILE', detail: snDetail(r) };
  if (!worked(r)) return fail(r);
  const p = snapProfileOf(r.body);
  return p ? { ...p, subscribers: subscribersOf(r.body) } : { error: 'NO_PROFILE', detail: snDetail(r) };
}

export type SnStats = { subscribers: number | null; views: number | null; viewers: number | null; shares: number | null; screenshots: number | null };
const FIELDS = ['SUBSCRIBERS', 'VIEWS', 'VIEWERS', 'SHARES', 'SCREENSHOTS', 'SPOTLIGHT_VIEWS', 'SPOTLIGHT_SHARES', 'SPOTLIGHT_SCREENSHOTS'] as const;

/** Every `{field.field_name, stats[].value}` in an answer, summed by name (a day-by-day answer has one entry per day). */
function fieldsOf(body: unknown, into: Map<string, number>, depth = 0): void {
  if (!body || typeof body !== 'object' || depth > 8) return;
  if (Array.isArray(body)) {
    for (const x of body) fieldsOf(x, into, depth + 1);
    return;
  }
  const o = body as Record<string, unknown>;
  const name = o.field && typeof o.field === 'object' ? (o.field as Record<string, unknown>).field_name : undefined;
  if (typeof name === 'string' && Array.isArray(o.stats)) {
    let sum: number | null = null;
    for (const s of o.stats) {
      const n = countOf(s && typeof s === 'object' ? (s as Record<string, unknown>).value : null);
      if (n !== null) sum = (sum ?? 0) + n;
    }
    if (sum !== null) into.set(name, (into.get(name) ?? 0) + sum);
    return;
  }
  for (const v of Object.values(o)) fieldsOf(v, into, depth + 1);
}
const pick = (m: Map<string, number>, ...names: string[]) => {
  for (const n of names) if (m.has(n)) return m.get(n)!;
  return null;
};
/** Snap's own metric names, as the five numbers the page shows. Nothing is guessed: a name Snap did not give is null. */
export function snStatsOf(body: unknown): SnStats | null {
  const m = new Map<string, number>();
  fieldsOf(body, m);
  if (!FIELDS.some((n) => m.has(n))) return null;
  return {
    subscribers: pick(m, 'SUBSCRIBERS'),
    views: pick(m, 'VIEWS', 'SPOTLIGHT_VIEWS'),
    viewers: pick(m, 'VIEWERS'),
    shares: pick(m, 'SHARES', 'SPOTLIGHT_SHARES'),
    screenshots: pick(m, 'SCREENSHOTS', 'SPOTLIGHT_SCREENSHOTS'),
  };
}

/** The profile's lifetime numbers, or one Spotlight's. */
export async function snStats(f: Fetch, a: { token: string; profile: string; spotlight?: string }): Promise<SnStats | SnFail> {
  if (!okProfile(a.profile) || (a.spotlight !== undefined && !POST_ID.test(a.spotlight))) return { error: 'TEST_INVALID' };
  const url = a.spotlight ? `${base(a.profile)}/spotlights/${a.spotlight}/stats` : `${base(a.profile)}/stats`;
  const r = await ask(f, 'GET', url, a.token);
  if (!worked(r)) return fail(r);
  return snStatsOf(r.body) ?? { error: 'SN_STATS_UNAVAILABLE', detail: snDetail(r) };
}

// The platforms' own sign-in and health for YouTube (Google), LinkedIn and X, on the same model as
// Meta and TikTok in ./oauth.ts (Action_Plan.md B9). Server only: it handles tokens, so it is never
// imported by a client component, never logs a response body, and returns errors as short codes.
// Every call takes the `fetch` it should use, so tests run it against a fake platform.
//
// The addresses, the parameters and the scopes were read from each platform's own documentation
// on 2026-10-15 (Google OAuth 2.0 for web server apps and the YouTube Data API channels.list;
// LinkedIn's 3-legged OAuth flow; X's OAuth 2.0 Authorization Code flow with PKCE). They change:
// the constants are in one place here, and each platform's guide in setup-guides.ts says the
// documentation is the authority.
//
// What "connected" means here, honestly: the person signed in on the platform's own page, the
// token is in the vault, and a check asks the platform who the token belongs to. Publishing is
// still a simulation until an adapter posts for real and the platform approves the app.
import { PlatformCallError, getJson, qs, type Fetch, type Health } from './oauth.ts';

/** An account with no end date of its own is shown as authorised for this long after its last good check. */
export const ROLLING_DAYS = 90;
const DAY = 24 * 60 * 60 * 1000;
const rolling = (now: number) => new Date(now + ROLLING_DAYS * DAY).toISOString();

export type OAuthTokens = {
  access: string;
  /** Empty when the platform gave none (LinkedIn, except to its partners). */
  refresh: string;
  subject: string;
  scope: string[];
  accessExpiresAt: string;
  refreshExpiresAt: string;
};

/** The stored secret of an account: the tokens as one value (same shape as TikTok's). */
export const packTokens = (t: Pick<OAuthTokens, 'access' | 'refresh' | 'subject' | 'accessExpiresAt' | 'refreshExpiresAt'>) =>
  JSON.stringify({ a: t.access, r: t.refresh, o: t.subject, ae: t.accessExpiresAt, re: t.refreshExpiresAt });
export function unpackTokens(s: string): Pick<OAuthTokens, 'access' | 'refresh' | 'subject' | 'accessExpiresAt' | 'refreshExpiresAt'> | null {
  try {
    const v = JSON.parse(s) as Record<string, string>;
    if (typeof v.a !== 'string' || !v.a || typeof v.r !== 'string') return null;
    return { access: v.a, refresh: v.r, subject: v.o ?? '', accessExpiresAt: v.ae ?? '', refreshExpiresAt: v.re ?? '' };
  } catch {
    return null;
  }
}

const bad: Health = { ok: false, error: 'NOT_CONNECTED', expiresAt: null, scopes: [], newSecret: null };
const fail = (error: string): Health => ({ ok: false, error, expiresAt: null, scopes: [], newSecret: null });
const secs = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const stat = (status: number) => (status >= 500 ? 'PLATFORM_DOWN' : status === 429 ? 'RATE_LIMIT' : 'PLATFORM_ERROR');

async function postForm(f: Fetch, url: string, form: Record<string, string>, headers: Record<string, string> = {}) {
  return getJson(f, url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', ...headers },
    body: new URLSearchParams(form).toString(),
  });
}

/**
 * Asks a platform's token endpoint to exchange a code that cannot be valid. A platform answers a
 * wrong client id or secret with 401 or `invalid_client`, and a right pair with some other refusal
 * of the code; that difference is the check. Only an explicit refusal of the client is a refusal:
 * anything else is taken as the pair being known to the platform.
 */
export async function appCheck(f: Fetch, url: string, form: Record<string, string>, headers: Record<string, string> = {}): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await postForm(f, url, form, headers);
  const err = String(r.body.error ?? '');
  if (r.status === 401 || err === 'invalid_client' || err === 'unauthorized_client') return { ok: false, error: 'APP_REFUSED' };
  if (r.status >= 500) return { ok: false, error: 'PLATFORM_DOWN' };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Google: YouTube
// ---------------------------------------------------------------------------
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const YT = 'https://www.googleapis.com/youtube/v3';
/** Upload videos, and read which channels the person owns (to list them and to check the token). */
export const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'] as const;

export function googleAuthUrl(a: { clientId: string; redirectUri: string; state: string; scopes?: readonly string[] }): string {
  // access_type=offline asks for a refresh token; prompt=consent makes Google return one again on a re-connection.
  return `${GOOGLE_AUTH}?${qs({
    response_type: 'code',
    client_id: a.clientId,
    redirect_uri: a.redirectUri,
    scope: (a.scopes ?? GOOGLE_SCOPES).join(' '),
    state: a.state,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'false',
  })}`;
}

export const googleAppCheck = (f: Fetch, clientId: string, secret: string) =>
  appCheck(f, GOOGLE_TOKEN, { grant_type: 'authorization_code', code: 'not-a-real-code', redirect_uri: 'https://localhost/', client_id: clientId, client_secret: secret });

export async function googleExchangeCode(f: Fetch, a: { clientId: string; secret: string; redirectUri: string; code: string; now?: number }): Promise<OAuthTokens> {
  const now = a.now ?? Date.now();
  const r = await postForm(f, GOOGLE_TOKEN, { grant_type: 'authorization_code', code: a.code, redirect_uri: a.redirectUri, client_id: a.clientId, client_secret: a.secret });
  if (r.status !== 200 || typeof r.body.access_token !== 'string') throw new PlatformCallError('CODE_REFUSED', 400);
  // Google returns a refresh token only on the first consent for an account and app; prompt=consent asks again.
  if (typeof r.body.refresh_token !== 'string' || !r.body.refresh_token) throw new PlatformCallError('REFRESH_MISSING', 400);
  return {
    access: r.body.access_token,
    refresh: r.body.refresh_token,
    subject: '',
    scope: typeof r.body.scope === 'string' ? r.body.scope.split(' ').filter(Boolean) : [],
    accessExpiresAt: new Date(now + secs(r.body.expires_in, 3600) * 1000).toISOString(),
    refreshExpiresAt: rolling(now),
  };
}

export async function googleRefresh(f: Fetch, a: { clientId: string; secret: string; refresh: string; now?: number }): Promise<{ access: string; accessExpiresAt: string } | { error: string }> {
  const now = a.now ?? Date.now();
  const r = await postForm(f, GOOGLE_TOKEN, { grant_type: 'refresh_token', refresh_token: a.refresh, client_id: a.clientId, client_secret: a.secret });
  if (r.status === 200 && typeof r.body.access_token === 'string') {
    return { access: r.body.access_token, accessExpiresAt: new Date(now + secs(r.body.expires_in, 3600) * 1000).toISOString() };
  }
  const err = String(r.body.error ?? '');
  // invalid_grant: revoked, or the app is still in testing and the refresh token lived its seven days.
  return { error: err === 'invalid_grant' || err === 'invalid_client' || r.status === 400 || r.status === 401 ? 'TOKEN_REFUSED' : stat(r.status) };
}

export type YouTubeChannel = { id: string; title: string; handle: string | null };

export async function googleChannels(f: Fetch, access: string): Promise<YouTubeChannel[] | { error: string }> {
  const r = await getJson(f, `${YT}/channels?${qs({ part: 'snippet', mine: 'true', maxResults: '50' })}`, { headers: { Authorization: `Bearer ${access}` } });
  if (r.status === 401) return { error: 'TOKEN_REFUSED' };
  if (r.status === 403) return { error: 'PERMISSION_REVOKED' };
  if (r.status !== 200) return { error: stat(r.status) };
  const items = Array.isArray(r.body.items) ? (r.body.items as Record<string, unknown>[]) : [];
  return items
    .filter((x) => typeof x.id === 'string')
    .map((x) => {
      const sn = (x.snippet ?? {}) as { title?: string; customUrl?: string };
      return { id: x.id as string, title: String(sn.title ?? x.id), handle: typeof sn.customUrl === 'string' && sn.customUrl ? sn.customUrl : null };
    });
}

/** One check of a YouTube account: refresh when the access token has ended, then ask which channels it owns. */
export async function googleAccountHealth(f: Fetch, a: { clientId: string; secret: string; packed: string; externalId: string | null; now?: number }): Promise<Health> {
  const now = a.now ?? Date.now();
  const t = unpackTokens(a.packed);
  if (!t || !t.refresh) return bad;
  let access = t.access;
  let newSecret: string | null = null;
  if (!t.accessExpiresAt || Date.parse(t.accessExpiresAt) - 60_000 <= now) {
    const r = await googleRefresh(f, { clientId: a.clientId, secret: a.secret, refresh: t.refresh, now });
    if ('error' in r) return fail(r.error === 'TOKEN_REFUSED' ? 'TOKEN_EXPIRED' : r.error);
    access = r.access;
    newSecret = packTokens({ ...t, access: r.access, accessExpiresAt: r.accessExpiresAt, refreshExpiresAt: rolling(now) });
  }
  const ch = await googleChannels(f, access);
  if ('error' in ch) return fail(ch.error);
  if (a.externalId && !ch.some((c) => c.id === a.externalId)) return fail('PERMISSION_REVOKED');
  return { ok: true, error: null, expiresAt: rolling(now), scopes: [], newSecret };
}

// ---------------------------------------------------------------------------
// LinkedIn
// ---------------------------------------------------------------------------
const LI_AUTH = 'https://www.linkedin.com/oauth/v2/authorization';
const LI_TOKEN = 'https://www.linkedin.com/oauth/v2/accessToken';
const LI_USERINFO = 'https://api.linkedin.com/v2/userinfo';
/** OpenID profile (to know whose token it is) and posting on the member's own behalf. */
export const LINKEDIN_SCOPES = ['openid', 'profile', 'w_member_social'] as const;

export function linkedinAuthUrl(a: { clientId: string; redirectUri: string; state: string; scopes?: readonly string[] }): string {
  const scope = encodeURIComponent((a.scopes ?? LINKEDIN_SCOPES).join(' '));
  return `${LI_AUTH}?${qs({ response_type: 'code', client_id: a.clientId, redirect_uri: a.redirectUri, state: a.state })}&scope=${scope}`;
}

export const linkedinAppCheck = (f: Fetch, clientId: string, secret: string) =>
  appCheck(f, LI_TOKEN, { grant_type: 'authorization_code', code: 'not-a-real-code', redirect_uri: 'https://localhost/', client_id: clientId, client_secret: secret });

export async function linkedinExchangeCode(f: Fetch, a: { clientId: string; secret: string; redirectUri: string; code: string; now?: number }): Promise<OAuthTokens> {
  const now = a.now ?? Date.now();
  const r = await postForm(f, LI_TOKEN, { grant_type: 'authorization_code', code: a.code, redirect_uri: a.redirectUri, client_id: a.clientId, client_secret: a.secret });
  if (r.status !== 200 || typeof r.body.access_token !== 'string') throw new PlatformCallError('CODE_REFUSED', 400);
  // Access tokens last 60 days (the platform says "currently"); programmatic refresh is for approved partners only.
  const accessEnds = new Date(now + secs(r.body.expires_in, 60 * 86400) * 1000).toISOString();
  return {
    access: r.body.access_token,
    refresh: typeof r.body.refresh_token === 'string' ? r.body.refresh_token : '',
    subject: '',
    scope: typeof r.body.scope === 'string' ? r.body.scope.split(/[ ,]+/).filter(Boolean) : [],
    accessExpiresAt: accessEnds,
    refreshExpiresAt: typeof r.body.refresh_token === 'string' ? new Date(now + secs(r.body.refresh_token_expires_in, 365 * 86400) * 1000).toISOString() : accessEnds,
  };
}

export type LinkedInMember = { sub: string; name: string; picture: string | null };

export async function linkedinUserInfo(f: Fetch, access: string): Promise<LinkedInMember | { error: string }> {
  const r = await getJson(f, LI_USERINFO, { headers: { Authorization: `Bearer ${access}` } });
  if (r.status === 401) return { error: 'TOKEN_REFUSED' };
  if (r.status === 403) return { error: 'PERMISSION_REVOKED' };
  if (r.status !== 200 || typeof r.body.sub !== 'string') return { error: stat(r.status) };
  const name = String(r.body.name ?? `${String(r.body.given_name ?? '')} ${String(r.body.family_name ?? '')}`.trim() ?? r.body.sub);
  return { sub: r.body.sub, name: name || r.body.sub, picture: typeof r.body.picture === 'string' ? r.body.picture : null };
}

/** One check of a LinkedIn account: its own end date, then who the token belongs to. */
export async function linkedinAccountHealth(f: Fetch, a: { packed: string; externalId: string | null; now?: number }): Promise<Health> {
  const now = a.now ?? Date.now();
  const t = unpackTokens(a.packed);
  if (!t) return bad;
  if (t.accessExpiresAt && Date.parse(t.accessExpiresAt) <= now) return fail('TOKEN_EXPIRED');
  const me = await linkedinUserInfo(f, t.access);
  if ('error' in me) return fail(me.error);
  if (a.externalId && me.sub !== a.externalId) return fail('TOKEN_REFUSED');
  return { ok: true, error: null, expiresAt: t.accessExpiresAt || null, scopes: [], newSecret: null };
}

// ---------------------------------------------------------------------------
// X
// ---------------------------------------------------------------------------
const X_AUTH = 'https://x.com/i/oauth2/authorize';
const X_TOKEN = 'https://api.x.com/2/oauth2/token';
const X_API = 'https://api.x.com/2';
/** Read the person, post for them, and stay connected (a refresh token); the access token lasts two hours. */
export const X_SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'] as const;

const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** A PKCE pair: a random verifier and its S256 challenge. The verifier stays on the server side. */
export async function pkcePair(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): Promise<{ verifier: string; challenge: string }> {
  const verifier = b64url(random(48));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  return { verifier, challenge: b64url(digest) };
}

export function xAuthUrl(a: { clientId: string; redirectUri: string; state: string; challenge: string; scopes?: readonly string[] }): string {
  return `${X_AUTH}?${qs({
    response_type: 'code',
    client_id: a.clientId,
    redirect_uri: a.redirectUri,
    scope: (a.scopes ?? X_SCOPES).join(' '),
    state: a.state,
    code_challenge: a.challenge,
    code_challenge_method: 'S256',
  })}`;
}

const xBasic = (id: string, secret: string) => ({ Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}` });

export const xAppCheck = (f: Fetch, clientId: string, secret: string) =>
  appCheck(f, X_TOKEN, { grant_type: 'authorization_code', code: 'not-a-real-code', redirect_uri: 'https://localhost/', code_verifier: 'x'.repeat(43), client_id: clientId }, xBasic(clientId, secret));

const xTokens = (b: Record<string, unknown>, now: number, refreshFallback = ''): OAuthTokens | null => {
  if (typeof b.access_token !== 'string') return null;
  return {
    access: b.access_token,
    refresh: typeof b.refresh_token === 'string' ? b.refresh_token : refreshFallback,
    subject: '',
    scope: typeof b.scope === 'string' ? b.scope.split(' ').filter(Boolean) : [],
    accessExpiresAt: new Date(now + secs(b.expires_in, 7200) * 1000).toISOString(),
    refreshExpiresAt: rolling(now),
  };
};

export async function xExchangeCode(f: Fetch, a: { clientId: string; secret: string; redirectUri: string; code: string; verifier: string; now?: number }): Promise<OAuthTokens> {
  const now = a.now ?? Date.now();
  const r = await postForm(f, X_TOKEN, { grant_type: 'authorization_code', code: a.code, redirect_uri: a.redirectUri, code_verifier: a.verifier, client_id: a.clientId }, xBasic(a.clientId, a.secret));
  const t = r.status === 200 ? xTokens(r.body, now) : null;
  if (!t) throw new PlatformCallError('CODE_REFUSED', 400);
  if (!t.refresh) throw new PlatformCallError('REFRESH_MISSING', 400);
  return t;
}

export async function xRefresh(f: Fetch, a: { clientId: string; secret: string; refresh: string; now?: number }): Promise<OAuthTokens | { error: string }> {
  const now = a.now ?? Date.now();
  const r = await postForm(f, X_TOKEN, { grant_type: 'refresh_token', refresh_token: a.refresh, client_id: a.clientId }, xBasic(a.clientId, a.secret));
  if (r.status === 200) {
    const t = xTokens(r.body, now, a.refresh);
    if (t) return t;
  }
  const err = String(r.body.error ?? '');
  return { error: err === 'invalid_grant' || err === 'invalid_request' || r.status === 400 || r.status === 401 ? 'TOKEN_REFUSED' : stat(r.status) };
}

export type XUser = { id: string; name: string; username: string };

export async function xMe(f: Fetch, access: string): Promise<XUser | { error: string }> {
  const r = await getJson(f, `${X_API}/users/me`, { headers: { Authorization: `Bearer ${access}` } });
  const d = (r.body.data ?? {}) as { id?: string; name?: string; username?: string };
  if (r.status === 200 && typeof d.id === 'string') return { id: d.id, name: String(d.name ?? d.username ?? d.id), username: String(d.username ?? '') };
  if (r.status === 401) return { error: 'TOKEN_REFUSED' };
  if (r.status === 403) return { error: 'PERMISSION_REVOKED' };
  return { error: stat(r.status) };
}

/** One check of an X account: refresh when the two-hour token has ended (the refresh token rotates), then ask who it is. */
export async function xAccountHealth(f: Fetch, a: { clientId: string; secret: string; packed: string; externalId: string | null; now?: number }): Promise<Health> {
  const now = a.now ?? Date.now();
  const t = unpackTokens(a.packed);
  if (!t || !t.refresh) return bad;
  let access = t.access;
  let newSecret: string | null = null;
  if (!t.accessExpiresAt || Date.parse(t.accessExpiresAt) - 60_000 <= now) {
    const r = await xRefresh(f, { clientId: a.clientId, secret: a.secret, refresh: t.refresh, now });
    if ('error' in r) return fail(r.error === 'TOKEN_REFUSED' ? 'TOKEN_EXPIRED' : r.error);
    access = r.access;
    newSecret = packTokens({ ...t, access: r.access, refresh: r.refresh || t.refresh, accessExpiresAt: r.accessExpiresAt, refreshExpiresAt: rolling(now) });
  }
  const me = await xMe(f, access);
  if ('error' in me) return fail(me.error);
  if (a.externalId && me.id !== a.externalId) return fail('TOKEN_REFUSED');
  return { ok: true, error: null, expiresAt: rolling(now), scopes: [], newSecret };
}

// The platforms' own sign-in and health, for Facebook and Instagram (one Meta app) and TikTok
// (Readiness audit step 6). Server only: it handles tokens, so it is never imported by a client
// component, never logs a response body, and returns errors as short codes. Every call takes the
// `fetch` it should use, so tests run it against a fake platform.
//
// The facts below were read from the platforms' own developer documentation on 2026-10-15 (Graph
// API v26.0 pages and Facebook Login; TikTok Login Kit and the v2 token endpoint). They change
// often: the version and the scopes are constants here, in one place, and the info card says the
// documentation is the authority.

export type Fetch = typeof fetch;

export const GRAPH_VERSION = 'v26.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const FB_DIALOG = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;

/** What the Meta sign-in asks for: the pages, their posts, and the linked Instagram accounts. */
export const META_SCOPES = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'instagram_basic', 'instagram_content_publish'] as const;

const TIKTOK_AUTH = 'https://www.tiktok.com/v2/auth/authorize/';
const TIKTOK_API = 'https://open.tiktokapis.com/v2';
/** user.info.basic reads the profile (health); video.publish posts directly; video.upload sends a draft. */
export const TIKTOK_SCOPES = ['user.info.basic', 'video.publish', 'video.upload'] as const;

export type Provider = 'meta' | 'tiktok';
export const APP_TYPE: Record<Provider, 'meta_app' | 'tiktok_app'> = { meta: 'meta_app', tiktok: 'tiktok_app' };
export const OFFER_TYPE: Record<Provider, 'meta_user' | 'tiktok_user_offer'> = { meta: 'meta_user', tiktok: 'tiktok_user_offer' };
/** The account type each registry platform connects as. */
export const ACCOUNT_TYPE: Record<string, { provider: Provider; type: 'meta_page' | 'meta_instagram' | 'tiktok_user' }> = {
  facebook: { provider: 'meta', type: 'meta_page' },
  instagram: { provider: 'meta', type: 'meta_instagram' },
  tiktok: { provider: 'tiktok', type: 'tiktok_user' },
};
export const providerOf = (platform: string): Provider | null => ACCOUNT_TYPE[platform]?.provider ?? null;

/** A failed call, as a short code the database and the interface know. Never a body. */
export class PlatformCallError extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 502) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

const TIMEOUT = 12_000;

async function getJson(f: Fetch, url: string, init?: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> {
  let res: Response;
  try {
    res = await f(url, { ...init, signal: AbortSignal.timeout(TIMEOUT), cache: 'no-store' });
  } catch {
    throw new PlatformCallError('UNREACHABLE', 504);
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    // Not JSON: leave it empty, the status says enough.
  }
  return { status: res.status, body };
}

/** The Graph API's error object, as one of our codes. */
export function metaErrorCode(body: Record<string, unknown>, status = 400): string {
  const e = (body.error ?? {}) as { code?: number; error_subcode?: number; type?: string };
  const code = e.code;
  if (code === 190 || e.type === 'OAuthException' && (e.error_subcode === 463 || e.error_subcode === 467 || e.error_subcode === 460)) {
    return e.error_subcode === 463 ? 'TOKEN_EXPIRED' : 'TOKEN_REFUSED';
  }
  if (code === 10 || (typeof code === 'number' && code >= 200 && code < 300)) return 'PERMISSION_REVOKED';
  if (code === 4 || code === 17 || code === 32 || code === 613 || (typeof code === 'number' && code >= 80000 && code < 90000)) return 'RATE_LIMIT';
  if (code === 102 || code === 458 || code === 459 || code === 460 || code === 467) return 'TOKEN_REFUSED';
  if (code === 1 || code === 2 || status >= 500) return 'PLATFORM_DOWN';
  return 'PLATFORM_ERROR';
}

const qs = (o: Record<string, string>) => new URLSearchParams(o).toString();
const toIso = (unixSeconds: unknown): string | null => {
  const n = Number(unixSeconds);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
};

// ---------------------------------------------------------------------------
// Meta (Facebook Pages and Instagram professional accounts)
// ---------------------------------------------------------------------------
export function metaAuthUrl(a: { appId: string; redirectUri: string; state: string; scopes?: readonly string[] }): string {
  return `${FB_DIALOG}?${qs({ client_id: a.appId, redirect_uri: a.redirectUri, state: a.state, response_type: 'code', scope: (a.scopes ?? META_SCOPES).join(',') })}`;
}

/** The app id and secret answer: the platform issues an app token only for a pair that matches. */
export async function metaAppCheck(f: Fetch, appId: string, secret: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await getJson(f, `${GRAPH}/oauth/access_token?${qs({ client_id: appId, client_secret: secret, grant_type: 'client_credentials' })}`);
  if (r.status === 200 && typeof r.body.access_token === 'string') return { ok: true };
  return { ok: false, error: 'APP_REFUSED' };
}

/** The sign-in code for a short-lived user token, then that for a long-lived one (about 60 days). */
export async function metaLongLivedUserToken(f: Fetch, a: { appId: string; secret: string; redirectUri: string; code: string }): Promise<{ token: string; expiresAt: string | null }> {
  const short = await getJson(f, `${GRAPH}/oauth/access_token?${qs({ client_id: a.appId, client_secret: a.secret, redirect_uri: a.redirectUri, code: a.code })}`);
  if (short.status !== 200 || typeof short.body.access_token !== 'string') throw new PlatformCallError('CODE_REFUSED', 400);
  const long = await getJson(f, `${GRAPH}/oauth/access_token?${qs({ grant_type: 'fb_exchange_token', client_id: a.appId, client_secret: a.secret, fb_exchange_token: short.body.access_token })}`);
  if (long.status !== 200 || typeof long.body.access_token !== 'string') throw new PlatformCallError(metaErrorCode(long.body, long.status), 502);
  const secs = Number(long.body.expires_in);
  return { token: long.body.access_token, expiresAt: Number.isFinite(secs) && secs > 0 ? new Date(Date.now() + secs * 1000).toISOString() : null };
}

export type MetaPage = {
  id: string;
  name: string;
  username: string | null;
  /** Server side only: never sent to a browser. */
  token: string;
  tasks: string[];
  instagram: { id: string; username: string | null } | null;
};

/** The pages the person manages, each with its own token and the Instagram account linked to it. */
export async function metaPages(f: Fetch, userToken: string): Promise<MetaPage[]> {
  const fields = 'id,name,username,access_token,tasks,instagram_business_account{id,username}';
  const out: MetaPage[] = [];
  let url: string | null = `${GRAPH}/me/accounts?${qs({ fields, limit: '100', access_token: userToken })}`;
  for (let guard = 0; url && guard < 5; guard++) {
    const r = await getJson(f, url);
    if (r.status !== 200) throw new PlatformCallError(metaErrorCode(r.body, r.status), 502);
    for (const p of (r.body.data ?? []) as Record<string, unknown>[]) {
      if (typeof p.id !== 'string' || typeof p.access_token !== 'string') continue;
      const ig = p.instagram_business_account as { id?: string; username?: string } | undefined;
      out.push({
        id: p.id,
        name: String(p.name ?? p.id),
        username: typeof p.username === 'string' ? p.username : null,
        token: p.access_token,
        tasks: Array.isArray(p.tasks) ? (p.tasks as string[]) : [],
        instagram: ig?.id ? { id: ig.id, username: ig.username ?? null } : null,
      });
    }
    const next = ((r.body.paging ?? {}) as { next?: string }).next;
    url = typeof next === 'string' && next.startsWith('https://graph.facebook.com/') ? next : null;
  }
  return out;
}

export type TokenInfo = { valid: boolean; expiresAt: string | null; scopes: string[]; userId: string | null; error: string | null };

/** What the platform says about a token: valid, until when, which permissions. Needs the app token. */
export async function metaDebugToken(f: Fetch, appId: string, secret: string, input: string): Promise<TokenInfo> {
  const r = await getJson(f, `${GRAPH}/debug_token?${qs({ input_token: input, access_token: `${appId}|${secret}` })}`);
  if (r.status !== 200) return { valid: false, expiresAt: null, scopes: [], userId: null, error: metaErrorCode(r.body, r.status) };
  const d = (r.body.data ?? {}) as Record<string, unknown>;
  const exp = toIso(d.expires_at);
  const data = toIso(d.data_access_expires_at);
  // The nearer of the two: the token's own end, or the end of the app's access to the person's data.
  const expiresAt = exp && data ? (exp < data ? exp : data) : (exp ?? data);
  const valid = d.is_valid === true;
  return {
    valid,
    expiresAt,
    scopes: Array.isArray(d.scopes) ? (d.scopes as string[]) : [],
    userId: typeof d.user_id === 'string' ? d.user_id : null,
    error: valid ? null : d.error ? 'TOKEN_REFUSED' : 'TOKEN_EXPIRED',
  };
}

export type Health = { ok: boolean; error: string | null; expiresAt: string | null; scopes: string[]; newSecret: string | null };

/** One check of a Facebook page or Instagram account token: the object answers, the token is valid. */
export async function metaAccountHealth(f: Fetch, a: { appId: string; secret: string; objectId: string; token: string; instagram: boolean }): Promise<Health> {
  const probe = await getJson(f, `${GRAPH}/${encodeURIComponent(a.objectId)}?${qs({ fields: a.instagram ? 'id,username' : 'id,name', access_token: a.token })}`);
  if (probe.status !== 200) return { ok: false, error: metaErrorCode(probe.body, probe.status), expiresAt: null, scopes: [], newSecret: null };
  const info = await metaDebugToken(f, a.appId, a.secret, a.token);
  if (!info.valid) return { ok: false, error: info.error ?? 'TOKEN_REFUSED', expiresAt: null, scopes: info.scopes, newSecret: null };
  return { ok: true, error: null, expiresAt: info.expiresAt, scopes: info.scopes, newSecret: null };
}

// ---------------------------------------------------------------------------
// TikTok
// ---------------------------------------------------------------------------
export function tiktokAuthUrl(a: { clientKey: string; redirectUri: string; state: string; scopes?: readonly string[] }): string {
  return `${TIKTOK_AUTH}?${qs({ client_key: a.clientKey, response_type: 'code', scope: (a.scopes ?? TIKTOK_SCOPES).join(','), redirect_uri: a.redirectUri, state: a.state })}`;
}

async function tiktokToken(f: Fetch, form: Record<string, string>) {
  const r = await getJson(f, `${TIKTOK_API}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
    body: new URLSearchParams(form).toString(),
  });
  return r;
}

/** The key and secret answer: TikTok issues a client token only for a pair that matches. */
export async function tiktokAppCheck(f: Fetch, key: string, secret: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await tiktokToken(f, { client_key: key, client_secret: secret, grant_type: 'client_credentials' });
  return r.status === 200 && typeof r.body.access_token === 'string' ? { ok: true } : { ok: false, error: 'APP_REFUSED' };
}

export type TikTokTokens = { access: string; refresh: string; openId: string; scope: string[]; accessExpiresAt: string; refreshExpiresAt: string };

const tokensOf = (b: Record<string, unknown>): TikTokTokens | null => {
  if (typeof b.access_token !== 'string' || typeof b.refresh_token !== 'string') return null;
  const now = Date.now();
  return {
    access: b.access_token,
    refresh: b.refresh_token,
    openId: String(b.open_id ?? ''),
    scope: typeof b.scope === 'string' ? b.scope.split(',').filter(Boolean) : [],
    accessExpiresAt: new Date(now + Number(b.expires_in ?? 86400) * 1000).toISOString(),
    refreshExpiresAt: new Date(now + Number(b.refresh_expires_in ?? 31536000) * 1000).toISOString(),
  };
};

export async function tiktokExchangeCode(f: Fetch, a: { clientKey: string; secret: string; redirectUri: string; code: string }): Promise<TikTokTokens> {
  const r = await tiktokToken(f, { client_key: a.clientKey, client_secret: a.secret, code: a.code, grant_type: 'authorization_code', redirect_uri: a.redirectUri });
  const t = r.status === 200 ? tokensOf(r.body) : null;
  if (!t) throw new PlatformCallError('CODE_REFUSED', 400);
  return t;
}

export async function tiktokRefresh(f: Fetch, a: { clientKey: string; secret: string; refresh: string }): Promise<TikTokTokens | { error: string }> {
  const r = await tiktokToken(f, { client_key: a.clientKey, client_secret: a.secret, grant_type: 'refresh_token', refresh_token: a.refresh });
  if (r.status === 200) {
    const t = tokensOf({ ...r.body, refresh_token: r.body.refresh_token ?? a.refresh });
    if (t) return t;
  }
  const code = String(r.body.error ?? '');
  return { error: code === 'invalid_grant' || r.status === 400 || r.status === 401 ? 'TOKEN_REFUSED' : r.status >= 500 ? 'PLATFORM_DOWN' : 'PLATFORM_ERROR' };
}

export type TikTokUser = { openId: string; displayName: string; username: string | null };

export async function tiktokUserInfo(f: Fetch, access: string): Promise<TikTokUser | { error: string }> {
  const r = await getJson(f, `${TIKTOK_API}/user/info/?fields=open_id,display_name,username`, { headers: { Authorization: `Bearer ${access}` } });
  const data = (((r.body.data ?? {}) as { user?: Record<string, unknown> }).user ?? {}) as Record<string, unknown>;
  const err = ((r.body.error ?? {}) as { code?: string }).code;
  if (r.status === 200 && (!err || err === 'ok') && typeof data.open_id === 'string') {
    return { openId: data.open_id, displayName: String(data.display_name ?? ''), username: typeof data.username === 'string' ? data.username : null };
  }
  if (r.status === 401 || err === 'access_token_invalid') return { error: 'TOKEN_REFUSED' };
  if (err === 'scope_not_authorized') return { error: 'PERMISSION_REVOKED' };
  return { error: r.status >= 500 ? 'PLATFORM_DOWN' : 'PLATFORM_ERROR' };
}

/** The stored secret of a TikTok account: both tokens, as one value. */
export const packTikTok = (t: TikTokTokens) => JSON.stringify({ a: t.access, r: t.refresh, o: t.openId, ae: t.accessExpiresAt, re: t.refreshExpiresAt });
export function unpackTikTok(s: string): { access: string; refresh: string; openId: string; accessExpiresAt: string; refreshExpiresAt: string } | null {
  try {
    const v = JSON.parse(s) as Record<string, string>;
    if (typeof v.a !== 'string' || typeof v.r !== 'string') return null;
    return { access: v.a, refresh: v.r, openId: v.o ?? '', accessExpiresAt: v.ae ?? '', refreshExpiresAt: v.re ?? '' };
  } catch {
    return null;
  }
}

/** One check of a TikTok account: refresh when the access token has ended, then ask who it is. */
export async function tiktokAccountHealth(f: Fetch, a: { clientKey: string; secret: string; packed: string; now?: number }): Promise<Health> {
  const now = a.now ?? Date.now();
  const t = unpackTikTok(a.packed);
  if (!t) return { ok: false, error: 'NOT_CONNECTED', expiresAt: null, scopes: [], newSecret: null };
  let access = t.access;
  let newSecret: string | null = null;
  let refreshExpiresAt = t.refreshExpiresAt;
  const ended = !t.accessExpiresAt || Date.parse(t.accessExpiresAt) - 60_000 <= now;
  if (ended) {
    const r = await tiktokRefresh(f, { clientKey: a.clientKey, secret: a.secret, refresh: t.refresh });
    if ('error' in r) return { ok: false, error: r.error === 'TOKEN_REFUSED' ? 'TOKEN_EXPIRED' : r.error, expiresAt: null, scopes: [], newSecret: null };
    access = r.access;
    refreshExpiresAt = r.refreshExpiresAt;
    newSecret = packTikTok({ ...r, openId: t.openId || r.openId });
  }
  const me = await tiktokUserInfo(f, access);
  if ('error' in me) return { ok: false, error: me.error, expiresAt: null, scopes: [], newSecret: null };
  return { ok: true, error: null, expiresAt: refreshExpiresAt || null, scopes: [], newSecret };
}

// The words for these codes are in info.ts (client components import them from there).
export { CONN_ERROR_AR, connErrorAr } from './info.ts';

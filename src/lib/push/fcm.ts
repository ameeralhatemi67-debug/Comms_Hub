// Firebase Cloud Messaging, HTTP v1, on the server only (Android_Build_Plan.md A5). The service
// account entered in «الإعدادات» signs a short JWT with node:crypto (RS256); Google exchanges it for
// an access token, kept in this process for 55 minutes; each message is one POST. Nothing here logs:
// a provider's answer is read only to pick a code, and is never stored, returned or printed.
import { createPrivateKey, createSign } from 'node:crypto';
import type { FcmMessage, ReportCode } from './payload.ts';

export const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
/** Google's addresses. A check passes its own stub; the site never takes another from anywhere. */
export type Endpoints = { token: string; base: string };
export const GOOGLE: Endpoints = { token: 'https://oauth2.googleapis.com/token', base: 'https://fcm.googleapis.com' };
export const TOKEN_TTL_MS = 55 * 60 * 1000;
const TIMEOUT_MS = 15_000;

export type ServiceAccount = { project_id: string; client_email: string; private_key: string; private_key_id?: string };
type Fetch = typeof fetch;

/** The service-account JSON from Firebase («حسابات الخدمة», «إنشاء مفتاح خاص جديد»), or null. */
export function parseServiceAccount(text: string | null | undefined): ServiceAccount | null {
  if (typeof text !== 'string' || text.length > 8192) return null;
  let v: Record<string, unknown>;
  try {
    v = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!v || typeof v !== 'object' || v.type !== 'service_account') return null;
  const project = v.project_id;
  const email = v.client_email;
  const key = v.private_key;
  if (typeof project !== 'string' || !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project)) return null;
  if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) return null;
  if (typeof key !== 'string' || !key.includes('PRIVATE KEY-----')) return null;
  try {
    if (createPrivateKey(key).asymmetricKeyType !== 'rsa') return null;
  } catch {
    return null;
  }
  const kid = typeof v.private_key_id === 'string' && /^[0-9a-f]{20,64}$/.test(v.private_key_id) ? v.private_key_id : undefined;
  return { project_id: project, client_email: email, private_key: key, ...(kid ? { private_key_id: kid } : {}) };
}

/** What is kept in the vault: the four fields the sender needs, nothing else of the file. */
export const compactServiceAccount = (sa: ServiceAccount) =>
  JSON.stringify({ type: 'service_account', project_id: sa.project_id, client_email: sa.client_email, private_key_id: sa.private_key_id, private_key: sa.private_key });

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/** The signed assertion Google exchanges for an access token (one hour at most). */
export function signJwt(sa: ServiceAccount, nowSec: number, aud = GOOGLE.token): string {
  const header = { alg: 'RS256', typ: 'JWT', ...(sa.private_key_id ? { kid: sa.private_key_id } : {}) };
  const claims = { iss: sa.client_email, scope: FCM_SCOPE, aud, iat: nowSec, exp: nowSec + 3600 };
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const sig = createSign('RSA-SHA256').update(input).sign(sa.private_key);
  return `${input}.${b64url(sig)}`;
}

export type TokenResult = { ok: true; token: string; until: number } | { ok: false; error: 'TOKEN_REFUSED' | 'TOKEN_UNREACHABLE' };

export async function fetchAccessToken(sa: ServiceAccount, o: { fetch?: Fetch; endpoints?: Endpoints; nowMs?: number } = {}): Promise<TokenResult> {
  const f = o.fetch ?? fetch;
  const ep = o.endpoints ?? GOOGLE;
  const now = o.nowMs ?? Date.now();
  let r: Response;
  try {
    r = await f(ep.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signJwt(sa, Math.floor(now / 1000), ep.token) }).toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: 'TOKEN_UNREACHABLE' };
  }
  const body = (await r.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null;
  if (!r.ok || typeof body?.access_token !== 'string' || !body.access_token) return { ok: false, error: r.status >= 500 ? 'TOKEN_UNREACHABLE' : 'TOKEN_REFUSED' };
  const life = typeof body.expires_in === 'number' && body.expires_in > 120 ? body.expires_in * 1000 - 60_000 : TOKEN_TTL_MS;
  return { ok: true, token: body.access_token, until: now + Math.min(TOKEN_TTL_MS, life) };
}

export type CachedToken = { ok: true; token: string; until: number; projectId: string } | { ok: false; error: 'NOT_CONFIGURED' | 'TOKEN_REFUSED' | 'TOKEN_UNREACHABLE' };

/**
 * The access token, reused for 55 minutes. The service account is read (from the vault, through
 * `load`) only when a new token is needed, so a flush does not touch the secret each time.
 */
export function tokenCache() {
  let hit: { token: string; until: number; projectId: string } | null = null;
  return {
    async get(load: () => Promise<string | null>, o: { fetch?: Fetch; endpoints?: Endpoints; nowMs?: number } = {}): Promise<CachedToken> {
      const now = o.nowMs ?? Date.now();
      if (hit && now < hit.until) return { ok: true, ...hit };
      hit = null;
      const sa = parseServiceAccount(await load().catch(() => null));
      if (!sa) return { ok: false, error: 'NOT_CONFIGURED' };
      const r = await fetchAccessToken(sa, { ...o, nowMs: now });
      if (!r.ok) return r;
      hit = { token: r.token, until: r.until, projectId: sa.project_id };
      return { ok: true, ...hit };
    },
    forget() {
      hit = null;
    },
  };
}

type FcmErrorBody = { error?: { status?: string; details?: { '@type'?: string; errorCode?: string; fieldViolations?: { field?: string }[] }[] } };

/** A provider's refusal as one code (FCM v1 error codes, read 2026-10-27). */
export function classify(status: number, body: unknown): ReportCode {
  const e = (body as FcmErrorBody | null)?.error;
  const codes = new Set([e?.status, ...(e?.details ?? []).map((d) => d.errorCode)].filter(Boolean) as string[]);
  const tokenField = (e?.details ?? []).some((d) => (d.fieldViolations ?? []).some((v) => v.field === 'message.token'));
  if (status === 404 || codes.has('UNREGISTERED')) return 'TOKEN_GONE';
  if (codes.has('SENDER_ID_MISMATCH')) return 'TOKEN_GONE';
  if (status === 400) return tokenField ? 'TOKEN_GONE' : 'REFUSED';
  if (status === 401 || status === 403) return 'AUTH';
  if (status === 429 || status >= 500) return 'RETRY';
  return 'FAILED';
}

export const sendUrl = (projectId: string, ep: Endpoints = GOOGLE) => `${ep.base}/v1/projects/${encodeURIComponent(projectId)}/messages:send`;

export async function sendOne(
  message: FcmMessage,
  o: { accessToken: string; projectId: string; fetch?: Fetch; endpoints?: Endpoints },
): Promise<{ ok: true } | { ok: false; error: ReportCode }> {
  const f = o.fetch ?? fetch;
  let r: Response;
  try {
    r = await f(sendUrl(o.projectId, o.endpoints), {
      method: 'POST',
      headers: { Authorization: `Bearer ${o.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: 'RETRY' };
  }
  if (r.ok) {
    await r.body?.cancel().catch(() => undefined);
    return { ok: true };
  }
  return { ok: false, error: classify(r.status, await r.json().catch(() => null)) };
}

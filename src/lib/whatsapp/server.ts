// WhatsApp on the server only: the six-digit code, the signed link and the packages the
// bridge receives. Never imported by a client component: it reads WHATSAPP_SERVER_KEY and
// WHATSAPP_LINK_SECRET, which exist only in the server's environment.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { integrationCreds } from '../integrations/vault.ts';
import { LINK_DAYS, packageText, type Claimed, type WaItem } from './rules.ts';

export type WaEnv = { key?: string; secret?: string; site?: string };
export const readWaEnv = (): WaEnv => ({
  key: process.env.WHATSAPP_SERVER_KEY,
  secret: process.env.WHATSAPP_LINK_SECRET,
  site: process.env.MAIL_SITE_URL,
});

/**
 * The bridge key and the link secret the Director made in the site win over the environment, which
 * stays as the fallback (the older way). Both live in the vault as one value; the database keeps
 * only the key's fingerprint.
 */
export async function resolveWaEnv(): Promise<WaEnv> {
  const base = readWaEnv();
  const c = await integrationCreds('whatsapp_bridge', 'whatsapp bridge');
  if (c) {
    try {
      const v = JSON.parse(c.secret) as { key?: unknown; secret?: unknown };
      if (typeof v.key === 'string' && v.key && typeof v.secret === 'string' && v.secret) return { ...base, key: v.key, secret: v.secret };
    } catch {
      // A value that is not the pair is ignored: the environment answers.
    }
  }
  return base;
}

export const newNonce = () => randomBytes(16).toString('hex');

/** The code for a nonce: derived from the secret, so it is never stored and never reaches the browser. */
export function codeFor(secret: string, nonce: string): string {
  const n = createHmac('sha256', secret).update(`code:${nonce}`).digest().readUInt32BE(0) % 1_000_000;
  return String(n).padStart(6, '0');
}

/** What the database keeps and compares: sha256 of "<code>:<nonce>" (wa_code_verify). */
export const codeHash = (code: string, nonce: string) => createHash('sha256').update(`${code}:${nonce}`, 'utf8').digest('hex');

export const sha256Hex = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

/** Constant-time comparison of the bridge's key with the server's. */
export function sameKey(given: string, expected: string): boolean {
  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export type LinkPayload = { o: string; r: string; m: string; g: string; e: number };

/** The link in a message: a signed token of (outbox row, recipient, message, room, expiry). */
export function signLink(secret: string, p: LinkPayload): string {
  const body = b64u(JSON.stringify(p));
  return `${body}.${b64u(createHmac('sha256', secret).update(body).digest())}`;
}

/** The payload, when the signature is right and the link has not expired; null otherwise. */
export function verifyLink(secret: string, token: string, nowMs: number): LinkPayload | null {
  const [body, sig] = (token ?? '').split('.');
  if (!body || !sig || !/^[A-Za-z0-9_-]+$/.test(body) || !/^[A-Za-z0-9_-]+$/.test(sig)) return null;
  const want = createHmac('sha256', secret).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as LinkPayload;
    if (typeof p.e !== 'number' || p.e * 1000 < nowMs) return null;
    if (![p.o, p.m, p.g].every((x) => /^[0-9a-f-]{36}$/.test(String(x)))) return null;
    return p;
  } catch {
    return null;
  }
}

/** Claimed rows into what the bridge sends. The destination is always the claimed row's own. */
export function buildItems(rows: Claimed[], o: { site: string; secret: string; maxChars: number; nowMs: number }): WaItem[] {
  return rows.map((c) => {
    if (c.kind === 'code') return { id: c.id, kind: c.kind, to: c.to, text: packageText(c, { link: null, code: codeFor(o.secret, String(c.nonce ?? '')) }) };
    const link =
      c.message_id && c.room_id
        ? `${o.site}/w/${signLink(o.secret, { o: c.id, r: c.recipient, m: c.message_id, g: c.room_id, e: Math.floor(o.nowMs / 1000) + LINK_DAYS * 86400 })}`
        : null;
    return { id: c.id, kind: c.kind, to: c.to, text: packageText(c, { link, maxChars: o.maxChars }) };
  });
}

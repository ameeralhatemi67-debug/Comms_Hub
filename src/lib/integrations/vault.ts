// The site's server and the integrations core (Settings_Integrations_Plan.md 4.2). Server
// only: it proves itself with MAIL_SERVER_KEY, whose sha256 alone is in the database, and is
// never imported by a client component. A secret read here lives for one request (or a few
// minutes in this process's memory for the Drive refresh token) and is never logged.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const DRIVE_INTEGRATION_ID = '00000000-0000-4000-8000-0000000000d1';

const serverKey = () => process.env.MAIL_SERVER_KEY;
/** The server key, for a route that calls a key-gated database function with the person's session. */
export const serverKeyOrNull = serverKey;

/** The vault can be asked: the database address and the server key are configured. */
export const vaultReachable = () => Boolean(serverKey() && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

let anon: SupabaseClient | undefined;
/** A client without a sign-in: the server key, not a session, decides. */
function db(): SupabaseClient {
  return (anon ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
}

/** A secret of an integration type, for a stated purpose (recorded, never the value). Null when none or unreachable. */
export async function vaultSecret(type: string, purpose: string, pending = false, client?: SupabaseClient): Promise<string | null> {
  if (!vaultReachable()) return null;
  const { data, error } = await (client ?? db()).rpc('int_secret_use', { p_key: serverKey(), p_type: type, p_purpose: purpose, p_pending: pending });
  if (error || typeof data !== 'string' || !data) return null;
  return data;
}

/** Keeps the refresh token Microsoft handed back (server key only; share links have no session). Never throws. */
export async function rotateOneDriveToken(id: string, secret: string): Promise<void> {
  if (!vaultReachable()) return;
  await db()
    .rpc('onedrive_token_rotate', { p_key: serverKey(), p_id: id, p_secret: secret })
    .then(
      () => undefined,
      () => undefined,
    );
}

export type StoredCreds = { id: string; config: Record<string, unknown>; secret: string };
const credsCache = new Map<string, { at: number; value: StoredCreds | null }>();
const CREDS_TTL = 60_000;

/**
 * A credential entered in the site: the Google app (client id in config, secret in the vault) or the
 * shared mailbox (address in config, app password in the vault). The server key decides, not a
 * session, because share links and the mail sync have none; each read is logged with its purpose.
 * Kept in this process for a minute so a burst of requests asks once.
 */
export async function integrationCreds(type: 'google_app' | 'gmail_account' | 'whatsapp_bridge' | 'microsoft_app', purpose: string): Promise<StoredCreds | null> {
  if (!vaultReachable()) return null;
  const hit = credsCache.get(type);
  if (hit && Date.now() - hit.at < CREDS_TTL) return hit.value;
  const { data, error } = await db().rpc('integration_creds', { p_key: serverKey(), p_type: type, p_purpose: purpose });
  const d = data as { id?: string; config?: Record<string, unknown>; secret?: string } | null;
  const value = !error && d && typeof d.secret === 'string' && d.secret ? { id: String(d.id ?? ''), config: d.config ?? {}, secret: d.secret } : null;
  credsCache.set(type, { at: Date.now(), value });
  return value;
}

/** Forget what was read (after a new value was entered). */
export function forgetCreds(type?: 'google_app' | 'gmail_account' | 'whatsapp_bridge' | 'microsoft_app') {
  if (type) credsCache.delete(type);
  else credsCache.clear();
}

/** As vaultSecret, for one integration by its id (a second provider of the same type exists). */
export async function vaultSecretById(id: string, purpose: string, pending = false, client?: SupabaseClient): Promise<string | null> {
  if (!vaultReachable()) return null;
  const { data, error } = await (client ?? db()).rpc('int_secret_use_id', { p_key: serverKey(), p_id: id, p_purpose: purpose, p_pending: pending });
  if (error || typeof data !== 'string' || !data) return null;
  return data;
}

/** Records the result of a check for one provider by id. Failure to record never breaks the caller. */
export async function recordHealthById(id: string, ok: boolean, error: string | null, config?: Record<string, unknown>) {
  if (!vaultReachable()) return;
  await db()
    .rpc('storage_provider_health', { p_key: serverKey(), p_id: id, p_ok: ok, p_error: error, p_config: config ?? null })
    .then(
      () => undefined,
      () => undefined,
    );
}

/** One live copy of a stored file, as storage_serving describes it. */
export type ServedCopy = { integration_id: string; type: string; config: Record<string, unknown>; ref: string; role: string; state: string };

/**
 * Where the live copies of the file this reference belongs to are, primary first. Null when the
 * database cannot be asked (the caller then does what it always did: read it from Drive).
 */
export async function storageServing(ref: string): Promise<ServedCopy[] | null> {
  if (!vaultReachable()) return null;
  const { data, error } = await db().rpc('storage_serving', { p_key: serverKey(), p_ref: ref });
  if (error || !Array.isArray(data)) return null;
  return data as ServedCopy[];
}

/** Records the result of a check. Failure to record never breaks the caller. */
export async function recordHealth(type: string, ok: boolean, error: string | null, config?: Record<string, unknown>) {
  if (!vaultReachable()) return;
  await db()
    .rpc('int_health', { p_key: serverKey(), p_type: type, p_ok: ok, p_error: error, p_config: config ?? null })
    .then(
      () => undefined,
      () => undefined,
    );
}

/** Masked tail of a secret, as the database keeps it. */
export const tailOf = (secret: string) => `••••${secret.slice(-4)}`;

/**
 * A new secret, checked before it replaces the old one (plan 4.2, rotation): stored pending
 * through the signed-in holder's session, read back pending by the server, checked by
 * `check`, then committed (holder and server key together) or discarded.
 */
export async function storeChecked(
  session: SupabaseClient,
  integration: string,
  type: string | { id: string },
  secret: string,
  check: (secret: string) => Promise<{ ok: true; config?: Record<string, unknown> } | { ok: false; error: string }>,
  /** The client without a sign-in that reads the pending secret back (tests pass a fake). */
  server?: SupabaseClient,
): Promise<{ ok: true; tail: string } | { ok: false; error: string }> {
  if (!vaultReachable()) return { ok: false, error: 'VAULT_UNREACHABLE' };
  const set = await session.rpc('int_secret_set', { p_id: integration, p_secret: secret });
  if (set.error) return { ok: false, error: set.error.message.includes('FORBIDDEN') ? 'FORBIDDEN' : 'VAULT_REFUSED' };
  const pending = typeof type === 'string' ? await vaultSecret(type, 'check before commit', true, server) : await vaultSecretById(type.id, 'check before commit', true, server);
  const result = pending === secret ? await check(pending) : { ok: false as const, error: 'VAULT_MISMATCH' };
  if (!result.ok) {
    await session.rpc('int_secret_discard', { p_id: integration, p_reason: result.error });
    return { ok: false, error: result.error };
  }
  const tail = String(set.data ?? tailOf(secret));
  const commit = await session.rpc('int_secret_commit', { p_key: serverKey(), p_id: integration, p_tail: tail, p_config: result.config ?? null });
  if (commit.error) return { ok: false, error: 'VAULT_REFUSED' };
  return { ok: true, tail };
}

/**
 * Records what the provider said about stored copies. The server key, not a session, decides
 * (storage_verify_mark), so a signed-in person cannot write a copy's state by hand. Returns
 * how many rows were marked, or null when the database could not be asked.
 */
export async function markVerified(actor: string, results: { id: string; state: 'ok' | 'missing' | 'failed' }[]): Promise<number | null> {
  if (!vaultReachable()) return null;
  const { data, error } = await db().rpc('storage_verify_mark', { p_key: serverKey(), p_actor: actor, p_results: results });
  return error || typeof data !== 'number' ? null : data;
}

// The site's server and the integrations core (Settings_Integrations_Plan.md 4.2). Server
// only: it proves itself with MAIL_SERVER_KEY, whose sha256 alone is in the database, and is
// never imported by a client component. A secret read here lives for one request (or a few
// minutes in this process's memory for the Drive refresh token) and is never logged.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const DRIVE_INTEGRATION_ID = '00000000-0000-4000-8000-0000000000d1';

const serverKey = () => process.env.MAIL_SERVER_KEY;

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
  type: string,
  secret: string,
  check: (secret: string) => Promise<{ ok: true; config?: Record<string, unknown> } | { ok: false; error: string }>,
  /** The client without a sign-in that reads the pending secret back (tests pass a fake). */
  server?: SupabaseClient,
): Promise<{ ok: true; tail: string } | { ok: false; error: string }> {
  if (!vaultReachable()) return { ok: false, error: 'VAULT_UNREACHABLE' };
  const set = await session.rpc('int_secret_set', { p_id: integration, p_secret: secret });
  if (set.error) return { ok: false, error: set.error.message.includes('FORBIDDEN') ? 'FORBIDDEN' : 'VAULT_REFUSED' };
  const pending = await vaultSecret(type, 'check before commit', true, server);
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

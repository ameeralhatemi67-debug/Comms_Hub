// The site's server and the push outbox (MVP_draft.md 64.3). Server only: it proves itself with
// MAIL_SERVER_KEY, as the integrations core does, and is never imported by a client component.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { recordHealth, serverKeyOrNull, vaultReachable, vaultSecret } from '../integrations/vault.ts';
import { flushPush, type FlushResult } from './flush.ts';

export const FCM_TYPE = 'fcm_service_account';

let anon: SupabaseClient | undefined;
/** A client without a sign-in: the server key, not a session, decides (the bridge has none). */
function db(): SupabaseClient {
  return (anon ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
}

/** One flush against the real outbox and Google. Null when the site is not configured for it. */
export async function flushNow(): Promise<FlushResult | null> {
  const key = serverKeyOrNull();
  if (!key || !vaultReachable()) return null;
  return flushPush({
    rpc: (fn, args) => db().rpc(fn, args),
    key,
    credential: () => vaultSecret(FCM_TYPE, 'push send'),
    health: (ok, error) => recordHealth(FCM_TYPE, ok, error),
  });
}

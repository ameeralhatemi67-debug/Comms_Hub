// The real due run of «مجدول» on Instagram (MVP_draft.md 76.5): direct-due.ts against the database with the server key and no
// session, Meta, and Drive's trash for the temporary copies. Server only; /api/platforms/due is its only caller.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { serverKeyOrNull } from '../integrations/vault.ts';
import { runDue, type DueResult } from './direct-due.ts';
import { trashTemp } from './test-instagram.ts';

let anon: SupabaseClient | undefined;
/** A client without a sign-in: the server key, not a session, decides (the bridge has none). */
function db(): SupabaseClient {
  return (anon ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
}

/** One run. Null when the site has no server key or no database address. */
export async function dueNow(origin: string): Promise<DueResult | null> {
  const key = serverKeyOrNull();
  if (!key || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return null;
  return runDue({
    rpc: (fn, args) => db().rpc(fn, args),
    key,
    origin,
    fetch,
    trash: (ref) => trashTemp({ temp_ref: ref }),
  });
}

import { cache } from 'react';
import { roleIds, type Role } from '../domain';
import { sanitizePages, type Account } from '../access';
import { serverClient, supabaseConfigured } from './server';

export type Session =
  | { status: 'unconfigured' }
  /** No sign-in at all. */
  | { status: 'anonymous' }
  /** Signed in with Supabase, but the email is not on the approved list (never added, or removed). */
  | { status: 'no-account'; email: string }
  | { status: 'ready'; account: Account };

/**
 * The current visitor, read once per request. Fails closed: with no configuration,
 * no sign-in, or no approved account, nothing of the product is rendered.
 *
 * The email comes from the verified token; the account row is then read through row
 * level security, which itself requires a confirmed email and returns only the
 * caller's own row for a non-administrator.
 */
export const getSession = cache(async (): Promise<Session> => {
  if (!supabaseConfigured) return { status: 'unconfigured' };
  const supabase = await serverClient();

  const { data } = await supabase.auth.getClaims();
  const email = typeof data?.claims?.email === 'string' ? data.claims.email.toLowerCase() : '';
  if (!email) return { status: 'anonymous' };

  const { data: row } = await supabase
    .from('accounts')
    .select('email, display_name, role, pages, protected')
    .eq('email', email)
    .maybeSingle();

  if (!row || !roleIds.includes(row.role as Role)) return { status: 'no-account', email };

  // What the person holds now, resolved by the database: standing pages plus temporary
  // page grants, and every other capability (Permissions_Plan.md 4). Time is checked
  // when this is read, so a temporary page closes on the first request after it ends.
  const { data: mine } = await supabase.rpc('my_capabilities');
  const evals = ((mine as { caps?: { k: string; ok: boolean }[] } | null)?.caps ?? []).filter((c) => c.ok);
  const caps = evals.filter((c) => !c.k.startsWith('page.')).map((c) => c.k);
  const pages = sanitizePages([...(row.pages ?? []), ...evals.filter((c) => c.k.startsWith('page.')).map((c) => c.k.slice(5))]);

  return {
    status: 'ready',
    account: {
      email: row.email,
      name: row.display_name,
      role: row.role as Role,
      pages,
      protected: row.protected,
      caps,
    },
  };
});

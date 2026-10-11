import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/** Server-side client for Server Components and route handlers. Reads the sign-in from cookies. */
export async function serverClient() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll(list) {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // Called from a Server Component, which cannot write cookies. The proxy
            // refreshes the session on every request, so this is safe to ignore.
          }
        },
      },
    },
  );
}

export const supabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

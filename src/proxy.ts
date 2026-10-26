import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp, newNonce, RESTORE_THEME, scriptHash, wantsPolicy } from '@/lib/csp';

// Two jobs on every page request.
// 1. The pages' Content-Security-Policy (src/lib/csp.ts; Desktop_App_Plan.md 9, before phase D4): a fresh
//    nonce per request, passed to Next.js in the request headers so it puts it on its own scripts, and the
//    policy on the response. See node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
// 2. Keeps the Supabase sign-in fresh. Server Components cannot write cookies, so the session is refreshed
//    here and the new cookies are passed on. This is not the access check: who may open what is decided in
//    the layout and the page (src/lib/supabase/session.ts), and by row level security in the database.
export async function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  let policy: string | null = null;
  if (wantsPolicy(request.nextUrl.pathname)) {
    const nonce = newNonce();
    policy = buildCsp({ nonce, hashes: [await scriptHash(RESTORE_THEME)], dev: process.env.NODE_ENV === 'development' });
    headers.set('x-nonce', nonce);
    headers.set('content-security-policy', policy);
  }
  const next = () => {
    // a refreshed session's cookies are written to the request first; they travel on with it
    headers.set('cookie', request.headers.get('cookie') ?? '');
    const response = NextResponse.next({ request: { headers } });
    if (policy) response.headers.set('Content-Security-Policy', policy);
    return response;
  };
  let response = next();
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(list) {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = next();
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // Validates the token and refreshes it when it is close to expiry.
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|health|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)'],
};

// The return address of a link mailed from the sign-in screen inside the Android application (MVP_draft.md
// 64; Android_Build_Plan.md A1 and A6; src/lib/native/entry.ts). The application claims this address as one
// of its own links, so the code in the link is exchanged in the application's cookie store, where it was
// asked for (PKCE). It forwards to the site's root with the same query, which the sign-in screen reads as
// before; a reason in the fragment travels with the redirect. Opening it changes nothing.
export function GET(request: Request) {
  const { search } = new URL(request.url);
  // A fixed, relative location: only the query is carried over, never an address.
  return new Response(null, { status: 303, headers: { Location: `/${search}`, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}

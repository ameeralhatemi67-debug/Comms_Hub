import { serverClient } from '@/lib/supabase/server';
import { noticeHref } from '@/lib/work/rules';
import { pushTarget } from '@/lib/push/target';

// Where a tapped push notice leads (MVP_draft.md 64.3). A payload names only /n/<kind>/<id>, an
// address with no query string, so nothing of a page's own address travels through Google. Here
// the site turns it into the page: a notice through the person's own session (row level security
// shows only their notices, as the drawer does), a conversation or a thread by its id, whose page
// applies its own rules as always. Opening it changes nothing; anything else goes to the home page.
const go = (to: string) => new Response(null, { status: 303, headers: { Location: to, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  const t = pushTarget(kind, id);
  if (!t) return go('/');
  if (t.kind !== 'notice') return go(t.to);
  const { data } = await (await serverClient()).from('notifications').select('go').eq('id', t.id).maybeSingle();
  return go(data ? noticeHref((data as { go: { page?: string; id?: string; tab?: string } | null }).go) : '/');
}

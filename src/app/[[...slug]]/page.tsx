import { HubPage } from '@/components/hub-page';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/access';
import { getSession } from '@/lib/supabase/session';

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await params;
  // The layout already refuses visitors without an approved account. This is the
  // per-page check, run again on every navigation (a layout is not re-run on a
  // client-side navigation, a page is).
  const session = await getSession();
  if (session.status !== 'ready') return null;
  if (!canOpen(session.account, slug[0] ?? '')) return <NoAccess />;
  return <HubPage route={slug} />;
}

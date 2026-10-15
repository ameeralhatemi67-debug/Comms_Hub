import { redirect } from 'next/navigation';
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
  // «الإدارة» was dissolved (Action_Plan.md B1): its real parts are in «الحسابات» and «الإعدادات».
  if (slug[0] === 'admin') redirect('/accounts');
  // «المراقبة» joined «سجل النشاط» (Action_Plan.md B2).
  if (slug[0] === 'monitoring') redirect('/activity');
  if (!canOpen(session.account, slug[0] ?? '')) return <NoAccess />;
  return <HubPage route={slug} />;
}

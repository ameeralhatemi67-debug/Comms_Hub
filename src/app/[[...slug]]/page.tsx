import { redirect } from 'next/navigation';
import { HubPage } from '@/components/hub-page';
import { NoAccess } from '@/components/no-access';
import { canOpenRoute } from '@/lib/access';
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
  // The page of the first segment, and the studio's own rule for /motion/studio (MVP_draft.md 62).
  if (!canOpenRoute(session.account, slug)) return <NoAccess />;
  return <HubPage route={slug} />;
}

'use client';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useHub } from '@/lib/store';
import { Empty } from './ui';
import { WorkProvider } from './work/data';
import { HomePage } from './home';
import { WorkListPage } from './work/list';
import { WorkItemPage } from './work/item';
import { CreatePage } from './work/create';
import { CalendarPage } from './work/calendar';
import { ProjectPage, ProjectsPage } from './work/projects';
import { RequestsPage } from './work/requests';
import { ApprovalsPage } from './work/approvals';
import { ReviewPage } from './work/review';
import { ChannelsPage } from './work/channels';
import { Supporting } from './supporting';
import { IdeasPage } from './ideas';
import { ComponentGallery } from './gallery';
import { AccountsPage } from './accounts';
import { MediaProvider } from './media/provider';
import { MediaLibrary } from './media/library';
import { AssetPage } from './media/asset-page';
import { TasksPage } from './media/tasks-page';
import { ActivityPage } from './media/activity-page';
import { MailPage } from './mail/mail-page';

const MotionStudio = dynamic(() => import('./motion-studio'), {
  ssr: false,
  loading: () => <div className="panel" role="status">جارٍ تحميل استوديو الحركة…</div>,
});

export function HubPage({ route }: { route: string[] }) {
  const { state } = useHub();
  const [page, id] = route;

  // Home and the work pages read and write the database (supabase/migrations/*work_cycle*).
  if (!page)
    return (
      <WorkProvider key={state.role}>
        <HomePage />
      </WorkProvider>
    );
  if (page === 'work')
    return <WorkProvider key={state.role}>{id ? <WorkItemPage key={id} id={decodeURIComponent(id)} /> : <WorkListPage />}</WorkProvider>;
  if (page === 'create')
    return (
      <WorkProvider key={state.role}>
        <CreatePage />
      </WorkProvider>
    );
  if (page === 'approvals')
    return <WorkProvider key={state.role}>{id ? <ReviewPage key={id} id={decodeURIComponent(id)} /> : <ApprovalsPage />}</WorkProvider>;
  if (page === 'channels')
    return (
      <WorkProvider key={state.role}>
        <ChannelsPage />
      </WorkProvider>
    );
  if (page === 'calendar')
    return (
      <WorkProvider key={state.role}>
        <CalendarPage />
      </WorkProvider>
    );
  if (page === 'projects')
    return <WorkProvider key={state.role}>{id ? <ProjectPage key={id} id={decodeURIComponent(id)} /> : <ProjectsPage />}</WorkProvider>;
  if (page === 'requests')
    return (
      <WorkProvider key={state.role}>
        <RequestsPage />
      </WorkProvider>
    );
  if (page === 'media') return <MediaProvider>{id ? <AssetPage key={id} id={id} /> : <MediaLibrary />}</MediaProvider>;
  if (page === 'tasks')
    return (
      <MediaProvider>
        <TasksPage />
      </MediaProvider>
    );
  if (page === 'activity')
    return (
      <MediaProvider>
        <ActivityPage />
      </MediaProvider>
    );
  if (page === 'mail') return <MailPage key={id === 'chat' ? 'chat' : 'mail'} tab={id === 'chat' ? 'chat' : 'mail'} />;
  if (page === 'motion') return <MotionStudio />;
  if (page === 'components') return <ComponentGallery />;
  if (page === 'accounts') return <AccountsPage />;
  if (page === 'ideas') return <IdeasPage />;
  if (['analytics', 'monitoring', 'settings', 'account'].includes(page))
    return <Supporting page={page} />;

  return (
    <Empty>
      هذه الصفحة غير موجودة. <Link href="/">العودة للرئيسية</Link>
    </Empty>
  );
}

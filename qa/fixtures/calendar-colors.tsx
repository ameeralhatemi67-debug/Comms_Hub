// «التقويم», «المشاريع», a project page and Home on a fixture, for qa/calendar-colors.cjs: the real pages and the real
// sheet «ألوان التقويم», with the database, the work provider and the dialogs replaced by the stand-ins of
// fake-calendar-colors.tsx and fake-calendar-stubs.tsx. `?page=` picks the page; the calendar is the default.
import { createRoot } from 'react-dom/client';
import { CalendarPage } from '../../src/components/work/calendar';
import { ProjectPage, ProjectsPage } from '../../src/components/work/projects';
import { HomePage } from '../../src/components/home';

const w = window as unknown as { __nav: (href: string) => void; __went: string[] };
w.__went = [];
w.__nav = (href) => void w.__went.push(href);

const page = new URLSearchParams(location.search).get('page');
createRoot(document.getElementById('root')!).render(
  <main id="main">
    {page === 'projects' ? <ProjectsPage /> : page === 'project' ? <ProjectPage id="0b6f7c1e-1d2a-4c3b-9e8f-1234567890ab" /> : page === 'home' ? <HomePage /> : <CalendarPage />}
  </main>,
);

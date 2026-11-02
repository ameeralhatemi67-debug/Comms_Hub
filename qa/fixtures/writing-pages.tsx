// The pages around «ورقة الكتابة» on a fixture for qa/writing-flow.cjs: Home, the «الكتابة» and «المستندات» tabs, review and «الأفكار»,
// with the database replaced by the stand-ins of fake-writing.tsx.
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HomePage } from '../../src/components/home';
import { IdeasPage } from '../../src/components/ideas';
import { WorkListPage } from '../../src/components/work/list';
import { ReviewPage } from '../../src/components/work/review';
import './fake-writing';

const q = new URLSearchParams(location.search);
(window as unknown as { __nav: (href: string) => void }).__nav = () => undefined;

function App() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const page = q.get('page');
  return (
    <div {...(ready ? { 'data-ready': '' } : {})}>
      {page === 'home' && <HomePage />}
      {page === 'work' && <WorkListPage />}
      {page === 'review' && <ReviewPage id={q.get('work') ?? 'CH-21'} />}
      {page === 'ideas' && <IdeasPage />}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

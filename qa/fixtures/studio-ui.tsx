// Fixture of the studio's interface (qa/studio-ui.cjs): the real ProjectList, ProjectShell, VideoEditor
// and PhotoEditor, with their real stylesheets, bundled by esbuild. Only next/navigation, next/link and
// the Supabase client are stand-ins (qa/fixtures/fake-next.tsx, fake-supabase.ts); the page routes by
// itself between /motion/studio and /motion/studio/<id>.
import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { AccountProvider } from '../../src/lib/account-context';
import type { Account } from '../../src/lib/access';
import { ProjectList } from '../../src/components/studio/project-list';
import { ProjectShell } from '../../src/components/studio/project-shell';
import { VideoEditor } from '../../src/components/studio/editor';
import { PhotoEditor } from '../../src/components/studio/photo-editor';
import { WorkStudioButton } from '../../src/components/studio/work-links';
import { CapsProvider } from '../../src/components/caps';
import '../../src/components/studio/studio.css';

const account: Account = { email: 'dir@t.test', name: 'مدير الاختبار', role: 'director', pages: ['work', 'motion', 'media'], protected: false, caps: ['motion.studio'] };

function App() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    (window as unknown as { __nav: (h: string) => void }).__nav = (h) => {
      history.pushState(null, '', h);
      setPath(h);
    };
    window.onpopstate = () => setPath(location.pathname);
  }, []);
  const m = /^\/motion\/studio\/([^/?]+)/.exec(path);
  // a work's page stand-in: only its «فتح في الاستوديو» (the work page itself needs the work provider)
  const wk = /^\/work\/([^/?]+)/.exec(path);
  const works: Record<string, { title: string; type: string; platforms: string[] }> = {
    'CH-101': { title: 'حملة اليوم الوطني', type: 'video', platforms: ['instagram', 'youtube'] },
    'CH-102': { title: 'بطاقة التهنئة', type: 'post', platforms: ['instagram'] },
  };
  return (
    <AccountProvider account={account}>
      <main>
        {wk ? (
          <CapsProvider>
            <section className="wk-ihead" data-work={wk[1]}>
              <h2>{works[wk[1]]?.title}</h2>
              <WorkStudioButton work={wk[1]} {...works[wk[1]]} />
            </section>
          </CapsProvider>
        ) : m ? (
          <div className="st st-open">
            <ProjectShell key={path} id={m[1]} editor={(p) => (p.doc.kind === 'video' ? <VideoEditor {...p} /> : <PhotoEditor {...p} />)} />
          </div>
        ) : (
          <div className="st">
            <ProjectList />
          </div>
        )}
      </main>
    </AccountProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

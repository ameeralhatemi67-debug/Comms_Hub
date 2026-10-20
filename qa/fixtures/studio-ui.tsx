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
  return (
    <AccountProvider account={account}>
      <main>
        {m ? (
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

// «فتح بالبرنامج الافتراضي» (src/components/native/desktop-downloads.tsx, MVP_draft.md 63.10) on a fixture page for
// qa/desktop-downloads.cjs: the notice the shell carries, with links to the fixture site's own file routes. The pages that
// offer these files in the site need a signed-in person, which no check has; the notice is the same component.
import { createRoot } from 'react-dom/client';
import { DesktopDownloads } from '../../src/components/native/desktop-downloads';
import LINKS from './desktop-downloads-links.json';

createRoot(document.getElementById('root')!).render(
  <main style={{ maxWidth: 900, margin: '24px auto', padding: '0 16px', minHeight: 420 }}>
    <h1 id="ready">التنزيلات</h1>
    <ul>
      {LINKS.map((l) => (
        <li key={l.id}>
          <a id={l.id} href={l.href}>
            {l.label}
          </a>
        </li>
      ))}
    </ul>
    <DesktopDownloads />
  </main>,
);

// «تطبيق سطح المكتب» on «الحساب» and the banner for an old application (src/components/native/desktop-app.tsx,
// MVP_draft.md 63.2), on a fixture page for qa/desktop-account.cjs: in Edge, as a browser sees them, and
// inside the desktop application. The release feed is answered by the check.
import { createRoot } from 'react-dom/client';
import { DesktopAppPanel, DesktopUpdateBanner } from '../../src/components/native/desktop-app';

(window as unknown as { __nav: (href: string) => void }).__nav = () => undefined;

createRoot(document.getElementById('root')!).render(
  <>
    <DesktopUpdateBanner />
    <section id="panel">
      <DesktopAppPanel />
    </section>
  </>,
);

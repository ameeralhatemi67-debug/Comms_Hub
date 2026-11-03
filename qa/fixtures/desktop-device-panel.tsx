// «معلومات الجهاز» with D9's part (src/components/native/device-info.tsx, MVP_draft.md 63.6) on a fixture page for
// qa/desktop-device-panel.cjs: in Edge, as a browser sees it, and inside the development package, where the chip's
// choice, «قياس قدرة الجهاز» and «التفاصيل» reach the application through its real bridge. The studio's home needs a
// signed-in person, which no check has; the panel is the same component.
import { createRoot } from 'react-dom/client';
import { DeviceInfo } from '../../src/components/native/device-info';

createRoot(document.getElementById('root')!).render(
  <main className="st" style={{ maxWidth: 760, margin: '24px auto', padding: '0 16px' }}>
    <section className="panel st-support" id="panel">
      <h2>معلومات الجهاز</h2>
      <DeviceInfo />
    </section>
  </main>,
);

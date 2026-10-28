// Google Play's updates on the phone (src/components/native/phone-app.tsx, src/lib/native/play-update.ts;
// MVP_draft.md 64.6), on a fixture page for qa/android-play.cjs: the update window, as the shell and the sign-in
// screen mount it, and «تطبيق الهاتف» as «الحساب» shows it, which needs a signed-in person on the real site.
import { createRoot } from 'react-dom/client';
import { AppUpdateWindow, PhoneAppPanel } from '../../src/components/native/phone-app';

createRoot(document.getElementById('root')!).render(
  <main dir="rtl" style={{ padding: 16 }}>
    <h1 id="where">تطبيق الهاتف</h1>
    <AppUpdateWindow />
    <section id="panel" className="panel">
      <PhoneAppPanel />
    </section>
  </main>,
);

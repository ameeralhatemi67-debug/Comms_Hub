// The application lock on the phone (src/components/native/phone-lock.tsx; MVP_draft.md 64.4), on a fixture page for
// qa/android-links.cjs: «قفل التطبيق» as «الحساب» shows it, and the offer the shell makes once after signing in.
import { createRoot } from 'react-dom/client';
import { PhoneLockOffer, PhoneLockPanel } from '../../src/components/native/phone-lock';

createRoot(document.getElementById('root')!).render(
  <main dir="rtl" style={{ padding: 16 }}>
    <h1 id="where">{location.pathname + location.search}</h1>
    <PhoneLockOffer />
    <PhoneLockPanel />
  </main>,
);

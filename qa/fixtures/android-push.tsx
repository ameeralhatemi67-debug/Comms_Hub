// Push notices on the phone (src/components/native/phone-push.tsx, src/lib/native/push.ts; MVP_draft.md 64.3), on a
// fixture page for qa/android-push.cjs: the explanation before Android asks, the phone's registration, a removed
// phone signing out, and what a tapped or arriving push tells the page, as src/components/notices.tsx listens.
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { PhonePush } from '../../src/components/native/phone-push';
import { onPushOpen, onPushReceive } from '../../src/lib/native/push';

type Events = { __events: unknown[][] };
const w = window as unknown as Events;
w.__events = [];
(window as unknown as { __nav: (href: string) => void }).__nav = (href) => w.__events.push(['nav', href]);

function Listen() {
  useEffect(() => onPushOpen((go) => w.__events.push(['open', go])), []);
  useEffect(() => onPushReceive(() => w.__events.push(['receive'])), []);
  return null;
}

createRoot(document.getElementById('root')!).render(
  <main dir="rtl" style={{ padding: 16 }}>
    <h1 id="where">{location.pathname + location.search}</h1>
    <Listen />
    <PhonePush />
  </main>,
);

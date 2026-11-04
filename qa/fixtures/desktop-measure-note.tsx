// The studio's note when the device is not measured or its measurement is stale (src/components/native/measure-note.tsx,
// MVP_draft.md 63.6.1) on a fixture page for qa/desktop-measure-note.cjs: in Edge, where there is none, and inside the
// development package, where it reads the real profile through the bridge. The studio's home and the editors need a
// signed-in person, which no check has; the note is the same component they show.
import { createRoot } from 'react-dom/client';
import { MeasureNote } from '../../src/components/native/measure-note';
import { markBusy } from '../../src/lib/native/index';

Object.assign(window, { __markBusy: markBusy });

createRoot(document.getElementById('root')!).render(
  <main className="st" style={{ maxWidth: 900, margin: '24px auto', padding: '0 16px' }}>
    <h1 id="ready">الاستوديو</h1>
    <MeasureNote />
  </main>,
);

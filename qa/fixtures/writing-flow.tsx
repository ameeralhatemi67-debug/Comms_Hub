// «ورقة الكتابة» on a fixture page for qa/writing-flow.cjs: the real sheet, editor, ribbon and table handles, with the database and
// routes replaced by the stand-ins of fake-writing.tsx.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { WritingSheet } from '../../src/components/writing/sheet';
import { DocView } from '../../src/components/writing/doc-view';
import { checkDoc } from '../../src/lib/writing/doc';
import { changed, db, useTick } from './fake-writing';

const q = new URLSearchParams(location.search);
const id = q.get('work') ?? 'CH-2';
const w = window as unknown as { __events: string[] };
w.__events = [];

function App() {
  useTick();
  const [open, setOpen] = useState(true);
  const d = db.works[id] as never;
  const last = db.masters[`${id}:${db.works[id].texts.length}`];
  const shown = last ? checkDoc(last) : null;
  return (
    <main id="main" className="wk">
      <button type="button" id="reopen" onClick={() => setOpen(true)}>
        فتح
      </button>
      {shown?.ok && (
        <section id="view">
          <DocView doc={shown.doc} work={id} />
        </section>
      )}
      {open && (
        <WritingSheet
          d={d}
          target={(q.get('tab') as 'main') ?? 'main'}
          reload={async () => changed()}
          onClose={() => setOpen(false)}
          onSend={() => w.__events.push('send')}
          onExt={(s) => w.__events.push(`ext:${s.name}`)}
          onFinish={async (s) => {
            w.__events.push(`finish:${s.name}`);
            return true;
          }}
        />
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

// Fixture of the review screen's player (qa/review-player.cjs): the real ReviewPlayer, the real long press
// (installHold) and the site's own styles, bundled by esbuild. Only next/link and the Supabase client are
// stand-ins (fake-next.tsx, fake-supabase.ts, whose media_note_add and media_note_done follow their
// migration). Two files: a wide video at version 2 whose «اعتماد هذا الجزء» counts presses, and a 9:16 video
// at version 1 whose button is off (as for a file the reviewer uploaded). The keys act on the player last used.
import { createRoot } from 'react-dom/client';
import { useCallback, useEffect, useState } from 'react';
import { ReviewPlayer } from '../../src/components/work/review-player';
import { installHold } from '../../src/lib/kit/hold';
import { HOLD } from '../../src/lib/kit/hold-reasons';
import { NOTE_COLUMNS, type Note } from '../../src/lib/media/notes';
import { reviewStart } from '../../src/lib/work/review-keys';
import { supabase } from '@/lib/supabase/client';

const WIDE = '00000000-0000-4000-8000-0000000000a1';
const TALL = '00000000-0000-4000-8000-0000000000c1';
const NAMES: Record<string, string> = { 'dir@t.test': 'مدير الاختبار', 'other@t.test': 'مساعد المدير' };

function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [active, setActive] = useState(WIDE);
  const start = reviewStart(new URLSearchParams(location.search));
  const reload = useCallback(async () => {
    const { data } = await supabase().from('media_notes').select(NOTE_COLUMNS).in('asset_id', [WIDE, TALL]).order('created_at');
    setNotes(((data ?? []) as Partial<Note>[]).map((n) => ({ version: null, at_ms: null, area: null, parent_id: null, done_at: null, done_by: null, ...n }) as Note));
  }, []);
  useEffect(() => {
    void reload();
    (window as unknown as { __reload: () => Promise<void> }).__reload = reload;
    (window as unknown as { __approved: string[] }).__approved = [];
    return installHold({ guideOn: () => false, passing: () => true });
  }, [reload]);
  const approved = (k: string) => (window as unknown as { __approved: string[] }).__approved.push(k);
  return (
    <main className="wk">
      <article className="wk-rrow" data-file="wide">
        <ReviewPlayer
          assetId={WIDE}
          version={2}
          name="ألوان الحملة.mp4"
          kind="video"
          notes={notes.filter((n) => n.asset_id === WIDE)}
          canNote
          nameOf={(e) => (e ? NAMES[e] ?? e : '')}
          onNotesChanged={reload}
          active={active === WIDE}
          onActivate={() => setActive(WIDE)}
          start={start && (!start.a || start.a === WIDE) ? start : null}
          partKey={`a:${WIDE}`}
        />
        <div className="ra">
          <button type="button" className="wk-btn sm primary" data-keyhold={HOLD.approvePart} data-approve-part={`a:${WIDE}`} onClick={() => approved('wide')}>
            اعتماد هذا الجزء
          </button>
        </div>
      </article>
      <article className="wk-rrow" data-file="tall">
        <ReviewPlayer
          assetId={TALL}
          version={1}
          name="مقطع عمودي.mp4"
          kind="video"
          notes={notes.filter((n) => n.asset_id === TALL)}
          canNote
          nameOf={(e) => (e ? NAMES[e] ?? e : '')}
          onNotesChanged={reload}
          active={active === TALL}
          onActivate={() => setActive(TALL)}
          partKey={`a:${TALL}`}
        />
        <div className="ra">
          <button type="button" className="wk-btn sm primary" disabled data-keyhold={HOLD.approvePart} data-approve-part={`a:${TALL}`} onClick={() => approved('tall')}>
            اعتماد هذا الجزء
          </button>
        </div>
      </article>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

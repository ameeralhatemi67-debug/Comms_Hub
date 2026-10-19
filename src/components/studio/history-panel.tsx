'use client';

// «السجل» (MVP_draft.md 62.2): every step of this session's editing, oldest first, the current one
// marked; a click on a step goes back (or forward) to it, as many undos or redos as it takes. The
// history is the studio's own (history.ts), up to 200 steps; it starts again when the project is opened.
import { History as HistoryIcon, RotateCcw } from 'lucide-react';
import type { History } from '@/lib/studio/history';

export function HistoryPanel<T>({ hist, onGo, readOnly }: { hist: History<T>; onGo: (steps: number) => void; readOnly: boolean }) {
  const past = hist.past;
  const future = hist.future;
  return (
    <section className="st-hist" aria-label="السجل">
      {!past.length && !future.length ? (
        <p className="st-hint">
          <HistoryIcon aria-hidden="true" />
          لا خطوات بعد. كل تعديل يظهر هنا، وتعود إليه بنقرة.
        </p>
      ) : (
        <ol>
          <li data-state={past.length ? 'past' : 'now'}>
            <button type="button" disabled={readOnly || !past.length} onClick={() => onGo(-past.length)} title="العودة إلى حال المشروع عند فتحه">
              <RotateCcw aria-hidden="true" />
              عند فتح المشروع
            </button>
          </li>
          {past.map((s, i) => {
            const isNow = i === past.length - 1;
            return (
              <li key={`p${i}`} data-state={isNow ? 'now' : 'past'} aria-current={isNow ? 'step' : undefined}>
                <button type="button" disabled={readOnly || isNow} onClick={() => onGo(i - (past.length - 1))}>
                  {s.label}
                </button>
              </li>
            );
          })}
          {future.map((s, i) => (
            <li key={`f${i}`} data-state="future">
              <button type="button" disabled={readOnly} onClick={() => onGo(i + 1)} title="إعادة حتى هذه الخطوة">
                {s.label}
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="st-hint">يحفظ السجل خطوات هذه الجلسة فقط. النسخ المرقّمة تبقى في «حفظ نسخة».</p>
    </section>
  );
}

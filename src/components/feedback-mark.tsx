'use client';
// The marking layer of a note, and the outline it is shown on afterwards (MVP_draft.md section 69). A click sets a pointer,
// a drag draws a box: one gesture, no tool to choose. The layer is a modal dialog so it opens above any window the problem
// is in, which makes the page behind it inert, so what a mark sits on is worked out from the rectangles read when the
// layer opened (src/lib/feedback/marks.ts, pickTarget) and never from the browser's hit test.
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { capturePage, nameOf, pathOf, screenSize, type Capture } from '@/lib/feedback/capture';
import { MAX_MARKS, markBox, markFrom, pickTarget, type Mark, type Outline, type Point, type View } from '@/lib/feedback/marks';

const NUMBER_SIZE = 0.03;

export function MarkLayer({ page, marks: start, onDone, onCancel }: { page: string; marks: Mark[]; onDone: (marks: Mark[], outline: Outline | null) => void; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const seen = useRef<Capture | null>(null);
  const [marks, setMarks] = useState(start);
  const [drag, setDrag] = useState<{ a: Point; b: Point } | null>(null);
  const [barOnTop, setBarOnTop] = useState(false);

  useEffect(() => {
    // Read before the layer opens: from here on nothing on the page moves.
    seen.current = capturePage(document, screenSize(window));
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);

  const full = marks.length >= MAX_MARKS;
  const place = (a: Point, b: Point) => {
    const view = screenSize(window);
    const mark = markFrom(a, b, view);
    const targets = seen.current?.targets ?? [];
    const hit = targets[pickTarget(targets, mark, view)];
    setMarks([...marks, { ...mark, el: hit ? nameOf(hit.el, page) : '', sel: hit ? pathOf(hit.el) : '' }]);
  };
  const down = (e: PointerEvent<HTMLDialogElement>) => {
    if (full || e.button !== 0 || (e.target as Element).closest('.fb-bar')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const at = { x: e.clientX, y: e.clientY };
    setDrag({ a: at, b: at });
  };
  const move = (e: PointerEvent<HTMLDialogElement>) => {
    if (drag) setDrag({ a: drag.a, b: { x: e.clientX, y: e.clientY } });
  };
  const up = () => {
    if (drag) place(drag.a, drag.b);
    setDrag(null);
  };

  const live = drag ? { left: Math.min(drag.a.x, drag.b.x), top: Math.min(drag.a.y, drag.b.y), width: Math.abs(drag.b.x - drag.a.x), height: Math.abs(drag.b.y - drag.a.y) } : null;
  return (
    <dialog
      ref={ref}
      className="fb-layer"
      data-fb-own
      data-no-note
      aria-label="حدد المكان على الصفحة"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => setDrag(null)}
    >
      {marks.map((m, i) => (
        <span
          key={i}
          className={`fb-mark ${m.t === 'p' ? 'point' : 'box'}`}
          style={{ left: `${m.x / 10}%`, top: `${m.y / 10}%`, width: `${m.w / 10}%`, height: `${m.h / 10}%` }}
        >
          <b>{i + 1}</b>
        </span>
      ))}
      {live && <span className="fb-mark box drawing" style={live} />}
      <div className={`fb-bar ${barOnTop ? 'top' : ''}`}>
        <span aria-live="polite">{full ? `بلغت ${MAX_MARKS} علامات، وهو الحد.` : 'انقر على المكان، أو اسحب لرسم مربع حوله.'}</span>
        <div className="actions">
          <button type="button" className="primary fb-bar-done" onClick={() => onDone(marks, marks.length ? (seen.current?.outline ?? null) : null)}>
            تم
          </button>
          <button type="button" className="secondary" disabled={!marks.length} onClick={() => setMarks(marks.slice(0, -1))}>
            تراجع
          </button>
          <button type="button" className="secondary fb-bar-move" onClick={() => setBarOnTop(!barOnTop)}>
            انقل الشريط
          </button>
          <button type="button" className="secondary" onClick={onCancel}>
            إلغاء
          </button>
        </div>
      </div>
    </dialog>
  );
}

/** A note's screen as it was: grey rectangles with no words, and the marks on top, numbered as they are in the note. */
export function OutlineView({ outline, marks, screen }: { outline?: Outline | null; marks: Mark[]; screen?: Partial<View> }) {
  const w = outline?.w ?? screen?.w ?? 1280;
  const h = outline?.h ?? screen?.h ?? 800;
  const size = Math.max(w, h) * NUMBER_SIZE;
  return (
    <svg className="fb-outline" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="مخطط الشاشة وعليه ما حدده المرسل">
      <rect className="fb-o-frame" width={w} height={h} />
      {outline?.r.map(([x, y, rw, rh, kind], i) => <rect key={i} className={`fb-o k${kind}`} x={x} y={y} width={rw} height={rh} rx={2} />)}
      {marks.map((m, i) => {
        const b = markBox(m, { w, h });
        return (
          <g key={i} className="fb-o-mark">
            {m.t === 'b' && <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={3} />}
            <circle cx={b.x} cy={b.y} r={size} />
            <text x={b.x} y={b.y} fontSize={size * 1.25} textAnchor="middle" dominantBaseline="central">
              {i + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

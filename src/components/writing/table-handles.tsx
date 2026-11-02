'use client';
// Handles around a table (MVP_draft.md 68.3): a strip above the columns and beside the rows. Click one to select that column or
// row, drag along the strip to select several, and the corner selects the whole table. Dragging across cells selects a range,
// as in Word. They show for the table the caret is in or the pointer is over, and sit over the page, outside the document.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { tableAtPos, tableInfo, selectAll, selectCols, selectRows, scopeOf, type TableInfo } from './table-ops';

type Box = { left: number; top: number; width: number; height: number; cols: { x: number; w: number }[]; rows: { y: number; h: number }[]; pos: number };

function measure(editor: Editor, t: TableInfo, wrap: HTMLElement): Box | null {
  const { view } = editor;
  const dom = view.nodeDOM(t.pos) as HTMLElement | null;
  const table = dom?.matches?.('table') ? dom : (dom?.querySelector?.('table') as HTMLElement | null);
  if (!table) return null;
  const at = table.getBoundingClientRect();
  const base = wrap.getBoundingClientRect();
  const cellRect = (i: number) => (view.nodeDOM(t.start + t.map.map[i]) as HTMLElement | null)?.getBoundingClientRect() ?? null;
  const cols = Array.from({ length: t.cols }, (_, c) => {
    const r = cellRect(c);
    const span = (t.node.firstChild?.child(0).attrs.colspan as number) || 1;
    return r ? { x: r.left - base.left, w: r.width / (t.map.map[c] === t.map.map[c + 1] ? span : 1) } : { x: 0, w: 0 };
  });
  const rows = Array.from({ length: t.rows }, (_, r) => {
    const b = cellRect(r * t.cols);
    return b ? { y: b.top - base.top, h: b.height } : { y: 0, h: 0 };
  });
  return { left: at.left - base.left, top: at.top - base.top, width: at.width, height: at.height, cols, rows, pos: t.pos };
}

export function TableHandles({ editor, wrap, tick }: { editor: Editor; wrap: HTMLElement | null; tick: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const drag = useRef<{ axis: 'row' | 'col'; from: number } | null>(null);

  const current = useCallback((): TableInfo | null => {
    if (hover !== null) {
      try {
        const t = tableAtPos(editor, hover + 1);
        if (t) return t;
      } catch {
        return tableInfo(editor);
      }
    }
    return tableInfo(editor);
  }, [editor, hover]);

  const update = useCallback(() => {
    const t = current();
    setBox(t && wrap ? measure(editor, t, wrap) : null);
  }, [current, editor, wrap]);

  useEffect(update, [update, tick]);

  useEffect(() => {
    if (!wrap) return;
    const move = (e: PointerEvent) => {
      if (drag.current) return;
      const el = (e.target as HTMLElement).closest?.('table');
      if (!el) return setHover((v) => ((e.target as HTMLElement).closest?.('.wr-grip') ? v : null));
      try {
        const inner = editor.view.posAtDOM(el.querySelector('th,td') as HTMLElement, 0);
        const $p = editor.state.doc.resolve(inner);
        for (let d = $p.depth; d > 0; d--) if ($p.node(d).type.name === 'table') return setHover($p.before(d));
      } catch {
        setHover(null);
      }
    };
    const up = () => (drag.current = null);
    const resize = new ResizeObserver(update);
    resize.observe(wrap);
    wrap.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      resize.disconnect();
      wrap.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [editor, update, wrap]);

  const t = current();
  if (!box || !t || !editor.isEditable) return null;
  const scope = tableInfo(editor)?.pos === t.pos ? scopeOf(editor, t) : null;
  const on = (axis: 'row' | 'col', i: number) => !!scope && (scope.kind === 'table' || (axis === 'col' ? scope.kind === 'col' && scope.cols.includes(i) : scope.kind === 'row' && scope.rows.includes(i)));
  const start = (axis: 'row' | 'col', i: number) => {
    drag.current = { axis, from: i };
    if (axis === 'col') selectCols(editor, t, i);
    else selectRows(editor, t, i);
  };
  const over = (axis: 'row' | 'col', i: number) => {
    const d = drag.current;
    if (!d || d.axis !== axis) return;
    const a = Math.min(d.from, i);
    const b = Math.max(d.from, i);
    if (axis === 'col') selectCols(editor, t, a, b);
    else selectRows(editor, t, a, b);
  };
  return (
    <div className="wr-handles" aria-label="تحديد صفوف الجدول وأعمدته">
      <button type="button" className="wr-grip all" aria-pressed={scope?.kind === 'table'} aria-label="تحديد الجدول كله" title="تحديد الجدول كله" style={{ left: box.left + box.width + 3, top: box.top - 15 }} onMouseDown={(e) => e.preventDefault()} onClick={() => selectAll(editor, t)} />
      {box.cols.map((c, i) => (
        <button
          type="button"
          key={i}
          className="wr-grip col"
          aria-pressed={on('col', i)}
          aria-label={`تحديد العمود ${t.cols - i}`}
          title="تحديد العمود"
          style={{ left: c.x, top: box.top - 15, width: c.w }}
          onMouseDown={(e) => e.preventDefault()}
          onPointerDown={() => start('col', i)}
          onPointerEnter={() => over('col', i)}
        />
      ))}
      {box.rows.map((r, i) => (
        <button
          type="button"
          key={i}
          className="wr-grip row"
          aria-pressed={on('row', i)}
          aria-label={`تحديد الصف ${i + 1}`}
          title="تحديد الصف"
          style={{ left: box.left + box.width + 3, top: r.y, height: r.h }}
          onMouseDown={(e) => e.preventDefault()}
          onPointerDown={() => start('row', i)}
          onPointerEnter={() => over('row', i)}
        />
      ))}
    </div>
  );
}

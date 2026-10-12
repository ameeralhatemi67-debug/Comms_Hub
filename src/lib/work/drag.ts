// Drag a plan row by its grip to a new place, with pointer events so a finger works as
// well as a mouse (the reference used HTML drag and drop, which touch screens lack).
// Rows carry data-prow="<index>"; the grip carries data-pdrag. While dragging, the row
// under the pointer shows where the stage will land (drop-before or drop-after), as in
// «النموذج المرجعي للمركز». The page applies the move (planMove in ./rules.ts), so the
// rule that a stage waits only for stages above it stays in one place.

export type RowDragOptions = {
  /** Called once on release over a row, with the stage's old and new index. */
  onMove: (from: number, to: number) => void;
};

const ROW = '[data-prow]';
const GRIP = '[data-pdrag]';
const MARKS = ['drop-before', 'drop-after', 'dragging'];

/** Where a release at clientY puts the dragged row. Between two rows counts as after the upper one. */
export function dropIndex(rects: { top: number; bottom: number }[], from: number, y: number): { to: number; over: number; before: boolean } | null {
  if (!rects.length) return null;
  const at = (over: number, before: boolean) => {
    const ins = before ? over : over + 1;
    return { to: ins > from ? ins - 1 : ins, over, before };
  };
  for (let k = 0; k < rects.length; k++) {
    const r = rects[k];
    if (y < r.top) return k === 0 ? at(0, true) : at(k - 1, false);
    if (y <= r.bottom) return at(k, y < r.top + (r.bottom - r.top) / 2);
  }
  return at(rects.length - 1, false);
}

/** The element that scrolls around the list: its dialog when it is in one, else the page. */
function scroller(list: HTMLElement): { el: Element; top: number; bottom: number } {
  for (let e = list.parentElement; e; e = e.parentElement) {
    const o = getComputedStyle(e).overflowY;
    if ((o === 'auto' || o === 'scroll') && e.scrollHeight > e.clientHeight) {
      const r = e.getBoundingClientRect();
      return { el: e, top: r.top, bottom: r.bottom };
    }
  }
  return { el: document.scrollingElement ?? document.documentElement, top: 0, bottom: window.innerHeight };
}

export function installRowDrag(list: HTMLElement, opts: RowDragOptions): () => void {
  let from = -1;
  let pid = -1;
  let grip: HTMLElement | null = null;
  const rows = () => Array.from(list.querySelectorAll<HTMLElement>(ROW)).filter((r) => r.parentElement === list);
  const clear = () => rows().forEach((r) => r.classList.remove(...MARKS));

  const down = (e: PointerEvent) => {
    const g = (e.target as HTMLElement | null)?.closest<HTMLElement>(GRIP);
    if (!g || !list.contains(g) || e.button > 0) return;
    const row = g.closest<HTMLElement>(ROW);
    if (!row) return;
    e.preventDefault();
    from = Number(row.dataset.prow);
    pid = e.pointerId;
    grip = g;
    try {
      g.setPointerCapture(e.pointerId);
    } catch {
      // A synthetic pointer cannot be captured; moves still reach the document.
    }
    row.classList.add('dragging');
  };
  const move = (e: PointerEvent) => {
    if (from < 0 || e.pointerId !== pid) return;
    e.preventDefault();
    // Near the edge of a long plan, scroll so the far rows come into reach.
    const sc = scroller(list);
    if (e.clientY < sc.top + 40) sc.el.scrollBy(0, -14);
    else if (e.clientY > sc.bottom - 40) sc.el.scrollBy(0, 14);
    const rs = rows();
    const at = dropIndex(rs.map((r) => r.getBoundingClientRect()), from, e.clientY);
    rs.forEach((r, k) => {
      r.classList.toggle('drop-before', !!at && k === at.over && at.before);
      r.classList.toggle('drop-after', !!at && k === at.over && !at.before);
    });
  };
  const up = (e: PointerEvent) => {
    if (from < 0 || e.pointerId !== pid) return;
    const at = dropIndex(rows().map((r) => r.getBoundingClientRect()), from, e.clientY);
    const start = from;
    from = -1;
    pid = -1;
    try {
      grip?.releasePointerCapture(e.pointerId);
    } catch {
      // Already released.
    }
    grip = null;
    clear();
    if (at && at.to !== start) opts.onMove(start, at.to);
  };
  const cancel = (e: PointerEvent) => {
    if (e.pointerId !== pid) return;
    from = -1;
    pid = -1;
    grip = null;
    clear();
  };

  list.addEventListener('pointerdown', down);
  document.addEventListener('pointermove', move, { passive: false });
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', cancel);
  return () => {
    list.removeEventListener('pointerdown', down);
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', cancel);
  };
}

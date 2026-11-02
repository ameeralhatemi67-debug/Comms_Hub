// What the table tools do to the document (MVP_draft.md 68.3). A fill, a line colour or a transparency always applies to the
// selected cells: one cell, a row, a column, a dragged range or the whole table. Every change is one transaction, so
// Ctrl+Z undoes it.
import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { CellSelection, TableMap, cellAround, selectionCell } from '@tiptap/pm/tables';
import { designOf } from '@/lib/writing/doc';

export type CellAttrs = { fill?: string | null; fillAlpha?: number | null; line?: string | null; lineAlpha?: number | null };

export type TableInfo = {
  /** Position of the table node. */
  pos: number;
  node: PMNode;
  map: TableMap;
  /** Where its content starts: `map` positions are relative to this. */
  start: number;
  rows: number;
  cols: number;
};

const infoOf = (node: PMNode, pos: number): TableInfo => {
  const map = TableMap.get(node);
  return { pos, node, map, start: pos + 1, rows: map.height, cols: map.width };
};

/** The table the selection is in, or null. */
export function tableInfo(editor: Editor): TableInfo | null {
  const { $from } = editor.state.selection;
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === 'table') return infoOf($from.node(d), $from.before(d));
  return null;
}

/** The table at a position inside it, for the handles of a table the pointer is over. */
export function tableAtPos(editor: Editor, inside: number): TableInfo | null {
  const $p = editor.state.doc.resolve(inside);
  for (let d = $p.depth; d > 0; d--) if ($p.node(d).type.name === 'table') return infoOf($p.node(d), $p.before(d));
  return null;
}

function select(editor: Editor, t: TableInfo, r0: number, c0: number, r1: number, c1: number) {
  const anchor = t.start + t.map.map[r0 * t.cols + c0];
  const head = t.start + t.map.map[r1 * t.cols + c1];
  const { state, view } = editor;
  view.dispatch(state.tr.setSelection(CellSelection.create(state.doc, anchor, head)));
  view.focus();
}

export const selectCols = (editor: Editor, t: TableInfo, a: number, b = a) => select(editor, t, 0, a, t.rows - 1, b);
export const selectRows = (editor: Editor, t: TableInfo, a: number, b = a) => select(editor, t, a, 0, b, t.cols - 1);
export const selectAll = (editor: Editor, t: TableInfo) => select(editor, t, 0, 0, t.rows - 1, t.cols - 1);

/** The row and column of the caret's cell. */
export function caretCell(editor: Editor, t: TableInfo): { row: number; col: number } | null {
  try {
    const $c = selectionCell(editor.state);
    const rect = t.map.findCell($c.pos - t.start);
    return { row: rect.top, col: rect.left };
  } catch {
    return null;
  }
}

type Picked = { pos: number; node: PMNode; row: number; col: number };

/** The selected cells; with a plain caret, the cell it is in. */
export function pickedCells(editor: Editor, t: TableInfo): Picked[] {
  const sel = editor.state.selection;
  const out: Picked[] = [];
  const add = (node: PMNode, pos: number) => {
    const r = t.map.findCell(pos - t.start);
    out.push({ pos, node, row: r.top, col: r.left });
  };
  if (sel instanceof CellSelection) sel.forEachCell(add);
  else {
    const $c = cellAround(sel.$from);
    if ($c?.nodeAfter) add($c.nodeAfter, $c.pos);
  }
  return out;
}

export type Scope = { kind: 'cell' | 'row' | 'col' | 'table' | 'cells'; count: number; rows: number[]; cols: number[]; label: string };

const many = (n: number, one: string, two: string, few: string, lots: string) => (n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${few}` : `${n} ${lots}`);

/** What the selection covers, in words for the bar. */
export function scopeOf(editor: Editor, t: TableInfo): Scope {
  const cells = pickedCells(editor, t);
  const rows = [...new Set(cells.map((c) => c.row))].sort((a, b) => a - b);
  const cols = [...new Set(cells.map((c) => c.col))].sort((a, b) => a - b);
  const whole = (n: number, all: number) => n === all;
  if (cells.length <= 1) return { kind: 'cell', count: 1, rows, cols, label: 'خلية واحدة' };
  if (whole(rows.length, t.rows) && whole(cols.length, t.cols)) return { kind: 'table', count: cells.length, rows, cols, label: 'الجدول كله' };
  if (whole(rows.length, t.rows)) return { kind: 'col', count: cells.length, rows, cols, label: many(cols.length, 'عمود واحد', 'عمودان', 'أعمدة', 'عموداً') };
  if (whole(cols.length, t.cols)) return { kind: 'row', count: cells.length, rows, cols, label: many(rows.length, 'صف واحد', 'صفان', 'صفوف', 'صفاً') };
  return { kind: 'cells', count: cells.length, rows, cols, label: many(cells.length, 'خلية واحدة', 'خليتان', 'خلايا', 'خلية') };
}

/** Apply a change to the selected cells, as one step of undo. */
export function updateCells(editor: Editor, t: TableInfo, change: (c: Picked) => CellAttrs) {
  const { state, view } = editor;
  const tr = state.tr;
  for (const c of pickedCells(editor, t)) tr.setNodeMarkup(c.pos, undefined, { ...c.node.attrs, ...change(c) });
  if (tr.docChanged) view.dispatch(tr);
}

/** The colour a cell shows from its design, so transparency can act on a cell with no fill of its own. */
export function designFill(design: unknown, c: Pick<Picked, 'row' | 'col' | 'node'>): string {
  const d = designOf(design);
  if (c.node.type.name === 'tableHeader') return d.head;
  if (d.first && c.col === 0) return d.first;
  return (c.row % 2 === 1 ? d.band : '') || d.body;
}

export const setFill = (editor: Editor, t: TableInfo, color: string | null) => updateCells(editor, t, () => ({ fill: color, ...(color ? {} : { fillAlpha: null }) }));
export const setLine = (editor: Editor, t: TableInfo, color: string | null) => updateCells(editor, t, () => ({ line: color, ...(color ? {} : { lineAlpha: null }) }));

export function setFillAlpha(editor: Editor, t: TableInfo, pct: number) {
  updateCells(editor, t, (c) => ({ fill: (c.node.attrs.fill as string | null) ?? (designFill(t.node.attrs.design, c) || null), fillAlpha: pct }));
}

export function setLineAlpha(editor: Editor, t: TableInfo, pct: number) {
  const base = designOf(t.node.attrs.design).line;
  updateCells(editor, t, (c) => ({ line: (c.node.attrs.line as string | null) ?? base, lineAlpha: pct }));
}

export const clearCells = (editor: Editor, t: TableInfo) => updateCells(editor, t, () => ({ fill: null, fillAlpha: null, line: null, lineAlpha: null }));

export function setDesign(editor: Editor, t: TableInfo, key: string) {
  const { state, view } = editor;
  view.dispatch(state.tr.setNodeMarkup(t.pos, undefined, { ...t.node.attrs, design: key === 'grid' ? null : key }));
}

/** What the selected cells have in common, for the bar's swatches and sliders. */
export function sharedLook(editor: Editor, t: TableInfo) {
  const cells = pickedCells(editor, t);
  const one = <T,>(f: (c: Picked) => T): T | undefined => {
    const v = cells.map(f);
    return v.every((x) => x === v[0]) ? v[0] : undefined;
  };
  return {
    fill: one((c) => (c.node.attrs.fill as string | null) ?? null),
    line: one((c) => (c.node.attrs.line as string | null) ?? null),
    fillAlpha: one((c) => (c.node.attrs.fillAlpha as number | null) ?? 0) ?? 0,
    lineAlpha: one((c) => (c.node.attrs.lineAlpha as number | null) ?? 0) ?? 0,
  };
}

/** A new table, the caret in its first cell. */
export function insertTable(editor: Editor, rows: number, cols: number, header: boolean) {
  editor.chain().focus().insertTable({ rows, cols, withHeaderRow: header }).run();
}

/** Grow or shrink the table the caret is in, to an exact size. Refuses to drop text unless told to. */
export function resizeTable(editor: Editor, t: TableInfo, rows: number, cols: number, force: boolean): boolean {
  const lost = () => {
    const map = t.map;
    for (let r = 0; r < map.height; r++) {
      for (let c = 0; c < map.width; c++) {
        if (r < rows && c < cols) continue;
        const node = t.node.nodeAt(map.map[r * map.width + c]);
        if (node?.textContent.trim()) return true;
      }
    }
    return false;
  };
  if (!force && lost()) return false;
  const chain = () => editor.chain().focus();
  // Move into the last row and column, then add or delete from there.
  const cellAt = (r: number, c: number) => {
    const info = tableInfo(editor);
    if (!info) return;
    editor.commands.setTextSelection(info.start + info.map.map[r * info.cols + c] + 2);
  };
  for (let info = tableInfo(editor); info && info.rows < rows; info = tableInfo(editor)) {
    cellAt(info.rows - 1, 0);
    chain().addRowAfter().run();
  }
  for (let info = tableInfo(editor); info && info.rows > rows; info = tableInfo(editor)) {
    cellAt(info.rows - 1, 0);
    chain().deleteRow().run();
  }
  for (let info = tableInfo(editor); info && info.cols < cols; info = tableInfo(editor)) {
    cellAt(0, info.cols - 1);
    chain().addColumnAfter().run();
  }
  for (let info = tableInfo(editor); info && info.cols > cols; info = tableInfo(editor)) {
    cellAt(0, info.cols - 1);
    chain().deleteColumn().run();
  }
  return true;
}

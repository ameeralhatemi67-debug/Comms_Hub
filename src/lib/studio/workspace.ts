// The studio's window layout (MVP_draft.md 62.1): every part of an editor is a window that can be
// moved, merged into another window's tabs, split beside it, floated, resized, closed and opened again,
// in the manner of a desktop video editor. This file is the layout alone, as data: a tree of splits whose
// leaves are tab groups, plus floating windows. Pure: no React, no DOM, so it is tested on its own.
//
// Rules:
//   - A window (panel) appears at most once: in one group, docked or floating.
//   - Directions are physical (a row runs left to right) because the workspace is laid out left to right;
//     each window's own content stays right to left.
//   - Every operation returns a new layout and leaves the old one untouched, and the result is normalised:
//     no empty group, no split with one child, no split directly inside a split of the same direction.

export type Dir = 'row' | 'col';
export type GroupNode = { type: 'group'; id: string; tabs: string[]; active: string };
export type SplitNode = { type: 'split'; id: string; dir: Dir; children: WsNode[]; sizes: number[] };
export type WsNode = GroupNode | SplitNode;
/** A floating window, in pixels from the workspace's top left corner. Later in the list is on top. */
export type FloatWin = { id: string; group: GroupNode; x: number; y: number; w: number; h: number };
export type Layout = { v: 1; root: WsNode | null; floats: FloatWin[]; /** The group shown alone, filling the workspace. */ max: string | null };

export type Zone = 'center' | 'left' | 'right' | 'top' | 'bottom';
export type Edge = Exclude<Zone, 'center'>;
export type Target =
  | { kind: 'group'; group: string; zone: Zone; index?: number }
  | { kind: 'root'; zone: Edge }
  | { kind: 'float'; x: number; y: number; w: number; h: number };

export const MIN_FRACTION = 0.06;

let seq = 0;
export const wsId = (p: string) => `${p}${(++seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ------------------------------------------------------------------ building

/** A tab group of these windows; the first is shown unless `active` names another. */
export const group = (tabs: string[], active?: string): GroupNode => ({ type: 'group', id: wsId('g'), tabs: [...tabs], active: active && tabs.includes(active) ? active : tabs[0] });
const split = (dir: Dir, parts: [number, WsNode][]): SplitNode => ({ type: 'split', id: wsId('s'), dir, children: parts.map((x) => x[1]), sizes: fit(parts.map((x) => x[0])) });
/** Children side by side, left to right, with their shares of the width. */
export const row = (...parts: [number, WsNode][]) => split('row', parts);
/** Children one above the other, with their shares of the height. */
export const col = (...parts: [number, WsNode][]) => split('col', parts);
export const layoutOf = (root: WsNode | null): Layout => normalize({ v: 1, root, floats: [], max: null });

/** Shares made positive, at least the minimum, and summing to one. */
function fit(sizes: number[]): number[] {
  if (!sizes.length) return [];
  const pos = sizes.map((s) => (Number.isFinite(s) && s > 0 ? s : 1));
  const sum = pos.reduce((a, b) => a + b, 0);
  let out = pos.map((s) => s / sum);
  if (out.length * MIN_FRACTION < 1 && out.some((s) => s < MIN_FRACTION)) {
    const low = out.filter((s) => s < MIN_FRACTION).length;
    const rest = out.filter((s) => s >= MIN_FRACTION).reduce((a, b) => a + b, 0);
    const k = (1 - low * MIN_FRACTION) / (rest || 1);
    out = out.map((s) => (s < MIN_FRACTION ? MIN_FRACTION : s * k));
  }
  return out;
}

// ------------------------------------------------------------------ reading

export function groupsOf(l: Layout): GroupNode[] {
  const out: GroupNode[] = [];
  const walk = (n: WsNode | null) => {
    if (!n) return;
    if (n.type === 'group') out.push(n);
    else n.children.forEach(walk);
  };
  walk(l.root);
  for (const f of l.floats) out.push(f.group);
  return out;
}

export const panelsOf = (l: Layout): string[] => groupsOf(l).flatMap((g) => g.tabs);
export const isOpen = (l: Layout, panel: string) => groupsOf(l).some((g) => g.tabs.includes(panel));
/** The group holding a window, and its floating window when it floats. */
export function whereIs(l: Layout, panel: string): { group: GroupNode; float: FloatWin | null } | null {
  for (const f of l.floats) if (f.group.tabs.includes(panel)) return { group: f.group, float: f };
  const g = groupsOf({ ...l, floats: [] }).find((x) => x.tabs.includes(panel));
  return g ? { group: g, float: null } : null;
}
export const findGroup = (l: Layout, id: string) => groupsOf(l).find((g) => g.id === id) ?? null;
/** The windows shown now: the active tab of each group (of the maximised group alone, when one is). */
export function visiblePanels(l: Layout): string[] {
  const groups = l.max ? groupsOf(l).filter((g) => g.id === l.max) : groupsOf(l);
  return groups.map((g) => g.active);
}

// ------------------------------------------------------------------ normalising

function normNode(n: WsNode | null): WsNode | null {
  if (!n) return null;
  if (n.type === 'group') {
    const tabs = n.tabs.filter((t, i) => typeof t === 'string' && n.tabs.indexOf(t) === i);
    if (!tabs.length) return null;
    return tabs.length === n.tabs.length && tabs.includes(n.active) ? n : { ...n, tabs, active: tabs.includes(n.active) ? n.active : tabs[0] };
  }
  const kids: WsNode[] = [];
  const sizes: number[] = [];
  n.children.forEach((c, i) => {
    const k = normNode(c);
    if (!k) return;
    const s = n.sizes[i] ?? 1 / n.children.length;
    if (k.type === 'split' && k.dir === n.dir) {
      // a split inside a split of the same direction: its children join the parent
      k.children.forEach((cc, j) => {
        kids.push(cc);
        sizes.push(s * k.sizes[j]);
      });
    } else {
      kids.push(k);
      sizes.push(s);
    }
  });
  if (!kids.length) return null;
  if (kids.length === 1) return kids[0];
  return { ...n, children: kids, sizes: fit(sizes) };
}

export function normalize(l: Layout): Layout {
  const root = normNode(l.root);
  const floats = l.floats.map((f) => ({ ...f, group: normNode(f.group) as GroupNode | null })).filter((f): f is FloatWin => !!f.group);
  const next: Layout = { v: 1, root, floats, max: null };
  next.max = l.max && groupsOf(next).some((g) => g.id === l.max) ? l.max : null;
  return next;
}

// ------------------------------------------------------------------ changing groups

/** Apply `fn` to every group, docked or floating (a floating group must stay a group). */
function mapGroups(l: Layout, fn: (g: GroupNode) => WsNode | null): Layout {
  // keep sizes aligned when a child disappears: map with placeholders, then normalise
  const keep = (n: WsNode | null): WsNode | null => {
    if (!n) return null;
    if (n.type === 'group') return fn(n);
    const kids = n.children.map(keep);
    const sizes = n.sizes.filter((_, i) => kids[i]);
    return { ...n, children: kids.filter((k): k is WsNode => !!k), sizes };
  };
  const root = keep(l.root);
  const floats = l.floats
    .map((f) => {
      const g = fn(f.group);
      return g && g.type === 'group' ? { ...f, group: g } : null;
    })
    .filter((f): f is FloatWin => !!f);
  return normalize({ ...l, root, floats });
}

export function activate(l: Layout, panel: string): Layout {
  const at = whereIs(l, panel);
  if (!at) return l;
  let next = mapGroups(l, (g) => (g.id === at.group.id ? { ...g, active: panel } : g));
  if (at.float) next = raiseFloat(next, at.float.id);
  return next;
}

/** Close a window (it stays registered and can be opened again). */
export function removePanel(l: Layout, panel: string): Layout {
  if (!isOpen(l, panel)) return l;
  return mapGroups(l, (g) => {
    if (!g.tabs.includes(panel)) return g;
    const i = g.tabs.indexOf(panel);
    const tabs = g.tabs.filter((t) => t !== panel);
    if (!tabs.length) return null;
    return { ...g, tabs, active: g.active === panel ? tabs[Math.max(0, i - 1)] : g.active };
  });
}
export const closePanel = removePanel;

/** Close a whole group of windows. */
export function closeGroup(l: Layout, groupId: string): Layout {
  return mapGroups(l, (g) => (g.id === groupId ? null : g));
}

function addTab(l: Layout, groupId: string, panel: string, index?: number): Layout {
  return mapGroups(l, (g) => {
    if (g.id !== groupId) return g;
    const tabs = g.tabs.filter((t) => t !== panel);
    const at = index === undefined ? tabs.length : Math.max(0, Math.min(tabs.length, index));
    tabs.splice(at, 0, panel);
    return { ...g, tabs, active: panel };
  });
}

const dirOf = (z: Edge): Dir => (z === 'left' || z === 'right' ? 'row' : 'col');
const before = (z: Edge) => z === 'left' || z === 'top';

function splitBeside(l: Layout, groupId: string, zone: Edge, panel: string): Layout {
  const fresh = group([panel]);
  const dir = dirOf(zone);
  const replace = (n: WsNode | null): WsNode | null => {
    if (!n) return null;
    if (n.type === 'group') {
      if (n.id !== groupId) return n;
      return { type: 'split', id: wsId('s'), dir, children: before(zone) ? [fresh, n] : [n, fresh], sizes: [0.5, 0.5] };
    }
    // a parent of the same direction takes the new group as a sibling, halving the target's share
    const i = n.children.findIndex((c) => c.type === 'group' && c.id === groupId);
    if (i >= 0 && n.dir === dir) {
      const kids = [...n.children];
      const sizes = [...n.sizes];
      const half = sizes[i] / 2;
      sizes[i] = half;
      const at = before(zone) ? i : i + 1;
      kids.splice(at, 0, fresh);
      sizes.splice(at, 0, half);
      return { ...n, children: kids, sizes };
    }
    return { ...n, children: n.children.map((c) => replace(c)).filter((c): c is WsNode => !!c) };
  };
  // a floating group: the window joins the float as a split is not possible, so it opens beside the float's group as a tab
  const inFloat = l.floats.find((f) => f.group.id === groupId);
  if (inFloat) return addTab(l, groupId, panel);
  return normalize({ ...l, root: replace(l.root) });
}

function dockAtRoot(l: Layout, zone: Edge, panel: string, share = 0.24): Layout {
  const fresh = group([panel]);
  if (!l.root) return normalize({ ...l, root: fresh });
  const dir = dirOf(zone);
  const parts: [number, WsNode][] = before(zone) ? [[share, fresh], [1 - share, l.root]] : [[1 - share, l.root], [share, fresh]];
  return normalize({ ...l, root: split(dir, parts) });
}

export function floatPanel(l: Layout, panel: string, rect: { x: number; y: number; w: number; h: number }): Layout {
  const removed = removePanel(l, panel);
  return normalize({ ...removed, floats: [...removed.floats, { id: wsId('f'), group: group([panel]), ...roundRect(rect) }] });
}

const roundRect = (r: { x: number; y: number; w: number; h: number }) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.max(160, Math.round(r.w)), h: Math.max(120, Math.round(r.h)) });

/**
 * Move a window: into a group's tabs (`center`, at `index`), beside a group (an edge), along an edge of
 * the whole workspace, or into a new floating window.
 */
export function movePanel(l: Layout, panel: string, target: Target): Layout {
  const from = whereIs(l, panel);
  if (target.kind === 'float') return floatPanel(l, panel, target);
  if (target.kind === 'root') return dockAtRoot(from ? removePanel(l, panel) : l, target.zone, panel);
  const dest = findGroup(l, target.group);
  if (!dest) return l;
  if (from && from.group.id === dest.id) {
    if (target.zone === 'center') {
      if (target.index === undefined) return activate(l, panel);
      return addTab(l, dest.id, panel, target.index > dest.tabs.indexOf(panel) ? target.index - 1 : target.index);
    }
    // splitting a group by its only window changes nothing
    if (dest.tabs.length === 1) return l;
  }
  const without = from ? removePanel(l, panel) : l;
  if (!findGroup(without, dest.id)) return l;
  return target.zone === 'center' ? addTab(without, dest.id, panel, target.index) : splitBeside(without, dest.id, target.zone, panel);
}

/**
 * Open a window, or show it if it is open. A closed window goes back beside the windows it belongs
 * with (`near`, in order of preference), else along the given edge of the workspace.
 */
export function openPanel(l: Layout, panel: string, near: string[] = [], edge: Edge = 'right'): Layout {
  if (isOpen(l, panel)) return activate(l, panel);
  for (const n of near) {
    const at = whereIs(l, n);
    if (at) return addTab(l, at.group.id, panel);
  }
  return dockAtRoot(l, edge, panel);
}

export function togglePanel(l: Layout, panel: string, near: string[] = [], edge: Edge = 'right'): Layout {
  return isOpen(l, panel) ? removePanel(l, panel) : openPanel(l, panel, near, edge);
}

// ------------------------------------------------------------------ sizes, floats, maximising

function mapSplit(n: WsNode | null, id: string, fn: (s: SplitNode) => SplitNode): WsNode | null {
  if (!n || n.type === 'group') return n;
  if (n.id === id) return fn(n);
  return { ...n, children: n.children.map((c) => mapSplit(c, id, fn) as WsNode) };
}

/** Move the border after child `i` of a split by `delta` (a share of the split's size). */
export function resizeSplit(l: Layout, splitId: string, i: number, delta: number, min = MIN_FRACTION): Layout {
  return {
    ...l,
    root: mapSplit(l.root, splitId, (s) => {
      if (i < 0 || i >= s.sizes.length - 1) return s;
      const sizes = [...s.sizes];
      const pair = sizes[i] + sizes[i + 1];
      const lo = Math.min(min, pair / 2);
      const a = Math.max(lo, Math.min(pair - lo, sizes[i] + delta));
      sizes[i] = a;
      sizes[i + 1] = pair - a;
      return { ...s, sizes };
    }),
  };
}

/** Give the two children beside a border equal shares (a double click on the border). */
export function evenSplit(l: Layout, splitId: string, i: number): Layout {
  return {
    ...l,
    root: mapSplit(l.root, splitId, (s) => {
      if (i < 0 || i >= s.sizes.length - 1) return s;
      const sizes = [...s.sizes];
      const pair = sizes[i] + sizes[i + 1];
      sizes[i] = pair / 2;
      sizes[i + 1] = pair / 2;
      return { ...s, sizes };
    }),
  };
}

export function raiseFloat(l: Layout, floatId: string): Layout {
  const f = l.floats.find((x) => x.id === floatId);
  if (!f || l.floats[l.floats.length - 1] === f) return l;
  return { ...l, floats: [...l.floats.filter((x) => x !== f), f] };
}

export function placeFloat(l: Layout, floatId: string, rect: Partial<{ x: number; y: number; w: number; h: number }>): Layout {
  return { ...l, floats: l.floats.map((f) => (f.id === floatId ? { ...f, ...roundRect({ ...f, ...rect }) } : f)) };
}

/** Keep every floating window reachable inside a workspace of this size. */
export function clampFloats(l: Layout, W: number, H: number): Layout {
  let changed = false;
  const floats = l.floats.map((f) => {
    const w = Math.min(f.w, Math.max(160, W));
    const h = Math.min(f.h, Math.max(120, H));
    const x = Math.max(0, Math.min(f.x, W - Math.min(w, 120)));
    const y = Math.max(0, Math.min(f.y, H - 32));
    if (w === f.w && h === f.h && x === f.x && y === f.y) return f;
    changed = true;
    return { ...f, w, h, x, y };
  });
  return changed ? { ...l, floats } : l;
}

/** Put a floating window's group back into the docked layout, along the given edge. */
export function dockFloat(l: Layout, floatId: string, edge: Edge = 'right'): Layout {
  const f = l.floats.find((x) => x.id === floatId);
  if (!f) return l;
  const rest = { ...l, floats: l.floats.filter((x) => x !== f) };
  if (!rest.root) return normalize({ ...rest, root: f.group });
  const dir = dirOf(edge);
  const parts: [number, WsNode][] = before(edge) ? [[0.24, f.group], [0.76, rest.root]] : [[0.76, rest.root], [0.24, f.group]];
  return normalize({ ...rest, root: split(dir, parts) });
}

export function toggleMax(l: Layout, groupId: string | null): Layout {
  if (!groupId || l.max === groupId) return { ...l, max: null };
  return findGroup(l, groupId) ? { ...l, max: groupId } : l;
}

// ------------------------------------------------------------------ storing

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * A layout read back from this device's storage, checked: unknown windows are dropped, each window kept
 * once, broken parts removed. Null when nothing usable is left.
 */
export function repair(raw: unknown, known: string[]): Layout | null {
  if (!isObj(raw) || raw.v !== 1) return null;
  const seen = new Set<string>();
  const okTabs = (tabs: unknown) => (Array.isArray(tabs) ? tabs.filter((t): t is string => typeof t === 'string' && known.includes(t) && !seen.has(t) && (seen.add(t), true)) : []);
  const node = (n: unknown, depth: number): WsNode | null => {
    if (!isObj(n) || depth > 12) return null;
    if (n.type === 'group') {
      const tabs = okTabs(n.tabs);
      if (!tabs.length) return null;
      return { type: 'group', id: typeof n.id === 'string' && n.id ? n.id : wsId('g'), tabs, active: typeof n.active === 'string' && tabs.includes(n.active) ? n.active : tabs[0] };
    }
    if (n.type === 'split' && (n.dir === 'row' || n.dir === 'col') && Array.isArray(n.children)) {
      const kids: WsNode[] = [];
      const sizes: number[] = [];
      n.children.forEach((c, i) => {
        const k = node(c, depth + 1);
        if (!k) return;
        kids.push(k);
        const s = Array.isArray(n.sizes) ? Number(n.sizes[i]) : NaN;
        sizes.push(Number.isFinite(s) && s > 0 ? s : 1);
      });
      if (!kids.length) return null;
      return { type: 'split', id: typeof n.id === 'string' && n.id ? n.id : wsId('s'), dir: n.dir, children: kids, sizes: fit(sizes) };
    }
    return null;
  };
  const root = node(raw.root, 0);
  const floats: FloatWin[] = [];
  if (Array.isArray(raw.floats)) {
    for (const f of raw.floats) {
      if (!isObj(f)) continue;
      const g = node(f.group, 0);
      if (!g || g.type !== 'group') continue;
      const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
      floats.push({ id: typeof f.id === 'string' && f.id ? f.id : wsId('f'), group: g, ...roundRect({ x: num(f.x, 40), y: num(f.y, 40), w: num(f.w, 360), h: num(f.h, 300) }) });
    }
  }
  const l = normalize({ v: 1, root, floats, max: typeof raw.max === 'string' ? raw.max : null });
  return l.root || l.floats.length ? l : null;
}

/** Windows that should always exist somewhere are opened if a stored layout lost them. */
export function ensurePanels(l: Layout, required: { panel: string; near: string[]; edge?: Edge }[]): Layout {
  let next = l;
  for (const r of required) if (!isOpen(next, r.panel)) next = openPanel(next, r.panel, r.near, r.edge);
  return next;
}

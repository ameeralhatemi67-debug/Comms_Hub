'use client';

// The studio's windows (MVP_draft.md 62.1), drawn from the layout data of src/lib/studio/workspace.ts:
// a tab is dragged to merge its window into another group, to split it beside one (the highlighted
// edge), along an edge of the whole workspace, or out into a floating window; borders are dragged to
// resize; a window is closed from its tab and opened again from «النوافذ»; a group is maximised with `
// or a double click on its tab. Each window's content is rendered once, through a portal, and the node
// moves between groups, so nothing restarts when a window moves (an export keeps running, a canvas
// keeps its picture). The layout runs left to right; each window's content is right to left.
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2, MoreHorizontal, PictureInPicture2, X, PanelTopClose, Plus } from 'lucide-react';
import {
  activate, closeGroup, closePanel, dockFloat, evenSplit, floatPanel, isOpen, movePanel, openPanel, placeFloat, raiseFloat, repair, resizeSplit, toggleMax, clampFloats, ensurePanels,
  type GroupNode, type Layout, type Target, type WsNode, type Zone,
} from '@/lib/studio/workspace';
import { PANEL_HOMES, PRESETS, type EditorKind } from '@/lib/studio/panels';

export type PanelSpec = { id: string; title: string; icon: ReactNode; element: ReactNode; shortcut?: string };
type SetLayout = (next: Layout | ((l: Layout) => Layout)) => void;

const STORE = (kind: EditorKind) => `studio.workspace.v1.${kind}`;
const PRESET_STORE = (kind: EditorKind) => `studio.workspace.preset.${kind}`;

function readStore(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStore(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private window or storage blocked: the layout simply is not remembered
  }
}

/** The layout of one editor, remembered on this device (a per-person convenience, not project data). */
export function useWorkspaceLayout(kind: EditorKind, known: string[]) {
  const presets = PRESETS[kind];
  const [preset, setPresetId] = useState<string>(() => readStore(PRESET_STORE(kind)) ?? presets[0].id);
  const [layout, setLayoutState] = useState<Layout>(() => {
    const raw = readStore(STORE(kind));
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    const fixed = repair(parsed, known);
    const base = fixed ?? (presets.find((p) => p.id === preset) ?? presets[0]).build();
    return ensurePanels(base, [{ panel: 'program', near: [], edge: 'top' }]);
  });
  const setLayout: SetLayout = useCallback((next) => setLayoutState((l) => (typeof next === 'function' ? next(l) : next)), []);
  useEffect(() => {
    const t = setTimeout(() => writeStore(STORE(kind), JSON.stringify(layout)), 200);
    return () => clearTimeout(t);
  }, [layout, kind]);
  const applyPreset = useCallback(
    (id: string) => {
      const p = presets.find((x) => x.id === id) ?? presets[0];
      setPresetId(p.id);
      writeStore(PRESET_STORE(kind), p.id);
      setLayoutState(p.build());
    },
    [presets, kind],
  );
  const open = useCallback((id: string) => setLayout((l) => openPanel(l, id, PANEL_HOMES[id]?.near ?? [], PANEL_HOMES[id]?.edge ?? 'right')), [setLayout]);
  const toggle = useCallback((id: string) => setLayout((l) => (isOpen(l, id) ? closePanel(l, id) : openPanel(l, id, PANEL_HOMES[id]?.near ?? [], PANEL_HOMES[id]?.edge ?? 'right'))), [setLayout]);
  return { layout, setLayout, preset, presets, applyPreset, open, toggle, reset: () => applyPreset(preset) };
}

type Drag = { panel: string; title: string; x: number; y: number; target: Target | null; rect: { left: number; top: number; width: number; height: number } | null };

const EDGE = 22;

export function Workspace({
  panels, layout, onLayout, focused, onFocus, chromeLabel,
}: {
  panels: PanelSpec[];
  layout: Layout;
  onLayout: SetLayout;
  /** The window the person works in now (its group is outlined, ` maximises it). */
  focused: string | null;
  onFocus: (panel: string) => void;
  chromeLabel: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const park = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLDivElement>());
  const [drag, setDrag] = useState<Drag | null>(null);
  const byId = useMemo(() => new Map(panels.map((p) => [p.id, p])), [panels]);

  const nodeOf = useCallback((id: string) => {
    let n = nodes.current.get(id);
    if (!n && typeof document !== 'undefined') {
      n = document.createElement('div');
      n.className = 'st-ws-panel';
      n.dir = 'rtl';
      n.dataset.panel = id;
      nodes.current.set(id, n);
    }
    return n!;
  }, []);
  const parkNode = useCallback((n: HTMLElement) => park.current?.appendChild(n), []);

  // windows not shown anywhere wait, still rendered, in the hidden parking place
  useLayoutEffect(() => {
    for (const n of nodes.current.values()) if (!n.parentNode) parkNode(n);
  });

  // floating windows stay reachable when the workspace shrinks
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      onLayout((l) => clampFloats(l, r.width, r.height));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [onLayout]);

  // ---------------------------------------------------------------- dragging a tab
  const hitTest = useCallback(
    (x: number, y: number): { target: Target | null; rect: Drag['rect'] } => {
      const el = root.current;
      if (!el) return { target: null, rect: null };
      const R = el.getBoundingClientRect();
      const groups = [...el.querySelectorAll<HTMLElement>('[data-ws-group]')].reverse();
      for (const g of groups) {
        const r = g.getBoundingClientRect();
        if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
        const id = g.dataset.wsGroup!;
        const floating = g.dataset.floating === 'yes';
        const head = g.querySelector('.st-ws-head')?.getBoundingClientRect();
        if ((head && y <= head.bottom) || floating) {
          // over the tab row: join the tabs at the place pointed to (tabs run right to left)
          const tabs = [...g.querySelectorAll<HTMLElement>('.st-ws-tabwrap')];
          let index = tabs.length;
          for (let i = 0; i < tabs.length; i++) {
            const tr = tabs[i].getBoundingClientRect();
            if (x > tr.left + tr.width / 2) {
              index = i;
              break;
            }
          }
          return { target: { kind: 'group', group: id, zone: 'center', index }, rect: { left: r.left - R.left, top: r.top - R.top, width: r.width, height: r.height } };
        }
        const body = g.querySelector('.st-ws-body')?.getBoundingClientRect() ?? r;
        const fx = (x - body.left) / body.width;
        const fy = (y - body.top) / body.height;
        const d: [Zone, number][] = [['left', fx], ['right', 1 - fx], ['top', fy], ['bottom', 1 - fy]];
        d.sort((a, b) => a[1] - b[1]);
        const zone: Zone = d[0][1] < 0.25 ? d[0][0] : 'center';
        const b = { left: body.left - R.left, top: body.top - R.top, width: body.width, height: body.height };
        const rect =
          zone === 'left' ? { ...b, width: b.width / 2 } : zone === 'right' ? { ...b, left: b.left + b.width / 2, width: b.width / 2 } : zone === 'top' ? { ...b, height: b.height / 2 } : zone === 'bottom' ? { ...b, top: b.top + b.height / 2, height: b.height / 2 } : b;
        return { target: { kind: 'group', group: id, zone }, rect };
      }
      if (x >= R.left && x <= R.right && y >= R.top && y <= R.bottom) {
        const band = (z: 'left' | 'right' | 'top' | 'bottom') => {
          const w = R.width * 0.22;
          const h = R.height * 0.26;
          return z === 'left' ? { left: 0, top: 0, width: w, height: R.height } : z === 'right' ? { left: R.width - w, top: 0, width: w, height: R.height } : z === 'top' ? { left: 0, top: 0, width: R.width, height: h } : { left: 0, top: R.height - h, width: R.width, height: h };
        };
        for (const z of ['left', 'right', 'top', 'bottom'] as const) {
          const near = z === 'left' ? x - R.left : z === 'right' ? R.right - x : z === 'top' ? y - R.top : R.bottom - y;
          if (near < EDGE) return { target: { kind: 'root', zone: z }, rect: band(z) };
        }
        return { target: null, rect: null };
      }
      // outside the workspace: a floating window where the pointer is, kept inside the workspace
      const w = 380;
      const h = 320;
      const fx = Math.max(0, Math.min(R.width - w, x - R.left - w / 2));
      const fy = Math.max(0, Math.min(R.height - h, y - R.top - 16));
      return { target: { kind: 'float', x: fx, y: fy, w, h }, rect: { left: fx, top: fy, width: w, height: h } };
    },
    [],
  );

  const startTabDrag = useCallback(
    (e: RPointerEvent, panel: string) => {
      if (e.button !== 0) return;
      const x0 = e.clientX;
      const y0 = e.clientY;
      const title = byId.get(panel)?.title ?? '';
      let active = false;
      const move = (ev: PointerEvent) => {
        if (!active && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        active = true;
        document.body.classList.add('st-ws-dragging');
        const h = hitTest(ev.clientX, ev.clientY);
        setDrag({ panel, title, x: ev.clientX, y: ev.clientY, target: h.target, rect: h.rect });
      };
      const finish = (ev: PointerEvent | null) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        window.removeEventListener('keydown', esc, true);
        document.body.classList.remove('st-ws-dragging');
        setDrag(null);
        if (!active || !ev) return;
        const h = hitTest(ev.clientX, ev.clientY);
        if (h.target) onLayout((l) => movePanel(l, panel, h.target!));
      };
      const up = (ev: PointerEvent) => finish(ev);
      const cancel = () => finish(null);
      const esc = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') {
          ev.stopPropagation();
          active = false;
          finish(null);
        }
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
      window.addEventListener('keydown', esc, true);
    },
    [byId, hitTest, onLayout],
  );

  const closedPanels = panels.filter((p) => !isOpen(layout, p.id));
  const ctx: GroupCtx = { byId, nodeOf, parkNode, startTabDrag, onLayout, focused, onFocus, closedPanels, layout, root };

  const maxGroup = layout.max ? [layout.root, ...layout.floats.map((f) => f.group)].map((n) => findIn(n, layout.max!)).find(Boolean) ?? null : null;

  return (
    <div className="st-ws" ref={root} dir="ltr" aria-label={chromeLabel}>
      {maxGroup ? (
        <GroupView group={maxGroup} ctx={ctx} />
      ) : layout.root ? (
        <NodeView node={layout.root} ctx={ctx} />
      ) : (
        <div className="st-ws-empty" dir="rtl">
          <p>كل النوافذ مغلقة. افتحها من قائمة «النوافذ»، أو اختر مساحة عمل جاهزة.</p>
        </div>
      )}
      {!maxGroup &&
        layout.floats.map((f, i) => (
          <FloatView key={f.id} f={f} z={30 + i} ctx={ctx} />
        ))}
      <div className="st-ws-park" ref={park} hidden aria-hidden="true" />
      {drag?.rect && <div className="st-ws-drop" style={{ left: drag.rect.left, top: drag.rect.top, width: drag.rect.width, height: drag.rect.height }} data-kind={drag.target?.kind ?? 'none'} aria-hidden="true" />}
      {drag && (
        <div className="st-ws-ghost" style={{ left: drag.x + 12, top: drag.y + 10 }} dir="rtl" aria-hidden="true">
          {byId.get(drag.panel)?.icon}
          {drag.title}
          <small>{dropWords(drag.target)}</small>
        </div>
      )}
      {panels.map((p) => createPortal(p.element, nodeOf(p.id), p.id))}
    </div>
  );
}

const dropWords = (t: Target | null) =>
  !t ? '' : t.kind === 'float' ? 'نافذة عائمة' : t.kind === 'root' ? 'على طرف المساحة' : t.zone === 'center' ? 'مع هذه النوافذ' : 'بجانب هذه النافذة';

function findIn(n: WsNode | null, id: string): GroupNode | null {
  if (!n) return null;
  if (n.type === 'group') return n.id === id ? n : null;
  for (const c of n.children) {
    const g = findIn(c, id);
    if (g) return g;
  }
  return null;
}

type GroupCtx = {
  byId: Map<string, PanelSpec>;
  nodeOf: (id: string) => HTMLDivElement;
  parkNode: (n: HTMLElement) => void;
  startTabDrag: (e: RPointerEvent, panel: string) => void;
  onLayout: SetLayout;
  focused: string | null;
  onFocus: (panel: string) => void;
  closedPanels: PanelSpec[];
  layout: Layout;
  root: React.RefObject<HTMLDivElement | null>;
};

function NodeView({ node, ctx }: { node: WsNode; ctx: GroupCtx }) {
  if (node.type === 'group') return <GroupView group={node} ctx={ctx} />;
  return (
    <div className="st-ws-split" data-dir={node.dir}>
      {node.children.map((c, i) => (
        <Fragment key={c.id}>
          <div className="st-ws-cell" style={{ flex: `${node.sizes[i]} 1 0px` }}>
            <NodeView node={c} ctx={ctx} />
          </div>
          {i < node.children.length - 1 && <Splitter splitId={node.id} index={i} dir={node.dir} share={node.sizes[i]} ctx={ctx} />}
        </Fragment>
      ))}
    </div>
  );
}

function Splitter({ splitId, index, dir, share, ctx }: { splitId: string; index: number; dir: 'row' | 'col'; share: number; ctx: GroupCtx }) {
  const ref = useRef<HTMLDivElement>(null);
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    const parent = ref.current?.parentElement;
    if (!parent || e.button !== 0) return;
    e.preventDefault();
    const size = dir === 'row' ? parent.getBoundingClientRect().width : parent.getBoundingClientRect().height;
    let last = dir === 'row' ? e.clientX : e.clientY;
    const minPx = dir === 'row' ? 150 : 96;
    ref.current!.setPointerCapture(e.pointerId);
    document.body.classList.add(dir === 'row' ? 'st-ws-resize-x' : 'st-ws-resize-y');
    const move = (ev: PointerEvent) => {
      const now = dir === 'row' ? ev.clientX : ev.clientY;
      const delta = (now - last) / size;
      last = now;
      if (delta) ctx.onLayout((l) => resizeSplit(l, splitId, index, delta, minPx / size));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      document.body.classList.remove('st-ws-resize-x', 'st-ws-resize-y');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const key = (e: RKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.08 : 0.02;
    const grow = dir === 'row' ? (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0) : e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0;
    if (!grow) return;
    e.preventDefault();
    e.stopPropagation();
    ctx.onLayout((l) => resizeSplit(l, splitId, index, grow));
  };
  return (
    <div
      ref={ref}
      className="st-ws-bar"
      data-dir={dir}
      role="separator"
      aria-orientation={dir === 'row' ? 'vertical' : 'horizontal'}
      aria-label="تغيير حجم النافذتين"
      aria-valuenow={Math.round(share * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
      title="اسحب لتغيير الحجم، وانقر مرتين للتساوي"
      onPointerDown={down}
      onDoubleClick={() => ctx.onLayout((l) => evenSplit(l, splitId, index))}
      onKeyDown={key}
    />
  );
}

/** Where a window's content is shown: its node is moved here, and back to the parking place after. */
function Slot({ panel, ctx }: { panel: string; ctx: GroupCtx }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const node = ctx.nodeOf(panel);
    el.appendChild(node);
    return () => {
      if (node.parentNode === el) ctx.parkNode(node);
    };
  }, [panel, ctx.nodeOf, ctx.parkNode]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="st-ws-body" ref={host} />;
}

function GroupView({ group, ctx, floatId }: { group: GroupNode; ctx: GroupCtx; floatId?: string }) {
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const maxed = ctx.layout.max === group.id;
  const focused = !!ctx.focused && group.tabs.includes(ctx.focused);
  const active = ctx.byId.get(group.active);
  useEffect(() => {
    if (!menu) return;
    const off = (e: PointerEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    window.addEventListener('pointerdown', off, true);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', off, true);
      window.removeEventListener('keydown', esc);
    };
  }, [menu]);

  const moveFloat = (e: RPointerEvent<HTMLElement>) => {
    if (!floatId || e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    const f = ctx.layout.floats.find((x) => x.id === floatId);
    if (!f) return;
    e.preventDefault();
    const x0 = e.clientX;
    const y0 = e.clientY;
    const fx = f.x;
    const fy = f.y;
    const move = (ev: PointerEvent) => ctx.onLayout((l) => placeFloat(l, floatId, { x: fx + ev.clientX - x0, y: Math.max(0, fy + ev.clientY - y0) }));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const r = ctx.root.current?.getBoundingClientRect();
      if (r) ctx.onLayout((l) => clampFloats(l, r.width, r.height));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const floatOut = (panel: string) => {
    const r = ctx.root.current?.getBoundingClientRect();
    const w = 380;
    const h = 340;
    ctx.onLayout((l) => floatPanel(l, panel, { x: r ? Math.max(0, r.width / 2 - w / 2) : 80, y: 60, w, h }));
  };

  return (
    <section className="st-ws-group" data-ws-group={group.id} data-floating={floatId ? 'yes' : 'no'} data-focused={focused ? 'yes' : 'no'} aria-label={active?.title} onPointerDownCapture={() => ctx.onFocus(group.active)}>
      <header className="st-ws-head" dir="rtl" onPointerDown={moveFloat} onDoubleClick={(e) => !(e.target as HTMLElement).closest('button') && ctx.onLayout((l) => toggleMax(l, group.id))}>
        <div className="st-ws-tabs" role="tablist" aria-label="نوافذ هذه المجموعة">
          {group.tabs.map((id) => {
            const p = ctx.byId.get(id);
            if (!p) return null;
            const on = id === group.active;
            return (
              <div key={id} className="st-ws-tabwrap" data-on={on ? 'yes' : 'no'}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={on}
                  className="st-ws-tab"
                  data-panel={id}
                  title={p.shortcut ? `${p.title} (${p.shortcut}) · اسحب لنقل النافذة` : `${p.title} · اسحب لنقل النافذة`}
                  onPointerDown={(e) => ctx.startTabDrag(e, id)}
                  onClick={() => ctx.onLayout((l) => activate(l, id))}
                  onDoubleClick={() => ctx.onLayout((l) => toggleMax(l, group.id))}
                  onAuxClick={(e) => e.button === 1 && ctx.onLayout((l) => closePanel(l, id))}
                >
                  {p.icon}
                  <span>{p.title}</span>
                </button>
                <button type="button" className="st-ws-x" aria-label={`إغلاق «${p.title}»`} title="إغلاق النافذة" onClick={() => ctx.onLayout((l) => closePanel(l, id))}>
                  <X aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
        <div className="st-ws-tools">
          <button type="button" className="st-ws-tool" aria-label={maxed ? 'استعادة الحجم' : 'تكبير النافذة'} title={maxed ? 'استعادة الحجم (`)' : 'تكبير النافذة (`)'} onClick={() => ctx.onLayout((l) => toggleMax(l, group.id))}>
            {maxed ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
          </button>
          <div className="st-ws-menuwrap" ref={menuRef}>
            <button type="button" className="st-ws-tool" aria-label="خيارات النافذة" aria-haspopup="menu" aria-expanded={menu} title="خيارات النافذة" onClick={() => setMenu((v) => !v)}>
              <MoreHorizontal aria-hidden="true" />
            </button>
            {menu && (
              <div className="st-menu st-ws-menu" role="menu" dir="rtl">
                <button type="button" role="menuitem" onClick={() => (ctx.onLayout((l) => toggleMax(l, group.id)), setMenu(false))}>
                  {maxed ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
                  <span>{maxed ? 'استعادة الحجم' : 'تكبير النافذة'}</span>
                  <kbd>`</kbd>
                </button>
                {floatId ? (
                  <button type="button" role="menuitem" onClick={() => (ctx.onLayout((l) => dockFloat(l, floatId, 'right')), setMenu(false))}>
                    <PanelTopClose aria-hidden="true" />
                    <span>إرساء النافذة في المساحة</span>
                  </button>
                ) : (
                  <button type="button" role="menuitem" onClick={() => (floatOut(group.active), setMenu(false))}>
                    <PictureInPicture2 aria-hidden="true" />
                    <span>فصل في نافذة عائمة</span>
                  </button>
                )}
                <button type="button" role="menuitem" onClick={() => (ctx.onLayout((l) => closePanel(l, group.active)), setMenu(false))}>
                  <X aria-hidden="true" />
                  <span>إغلاق «{active?.title}»</span>
                </button>
                {group.tabs.length > 1 && (
                  <button type="button" role="menuitem" onClick={() => (ctx.onLayout((l) => closeGroup(l, group.id)), setMenu(false))}>
                    <X aria-hidden="true" />
                    <span>إغلاق المجموعة كلها</span>
                  </button>
                )}
                {ctx.closedPanels.length > 0 && (
                  <>
                    <hr />
                    <span className="st-menu-label">فتح نافذة هنا</span>
                    {ctx.closedPanels.map((p) => (
                      <button key={p.id} type="button" role="menuitem" onClick={() => (ctx.onLayout((l) => movePanel(l, p.id, { kind: 'group', group: group.id, zone: 'center' })), setMenu(false))}>
                        <Plus aria-hidden="true" />
                        <span>{p.title}</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>
      <Slot panel={group.active} ctx={ctx} />
    </section>
  );
}

function FloatView({ f, z, ctx }: { f: Layout['floats'][number]; z: number; ctx: GroupCtx }) {
  const resize = (e: RPointerEvent<HTMLElement>, dir: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const y0 = e.clientY;
    const s = { ...f };
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      const dy = ev.clientY - y0;
      const next = { x: s.x, y: s.y, w: s.w, h: s.h };
      if (dir.includes('e')) next.w = Math.max(220, s.w + dx);
      if (dir.includes('s')) next.h = Math.max(150, s.h + dy);
      if (dir.includes('w')) {
        next.w = Math.max(220, s.w - dx);
        next.x = s.x + (s.w - next.w);
      }
      if (dir.includes('n')) {
        next.h = Math.max(150, s.h - dy);
        next.y = Math.max(0, s.y + (s.h - next.h));
      }
      ctx.onLayout((l) => placeFloat(l, f.id, next));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className="st-ws-float" style={{ left: f.x, top: f.y, width: f.w, height: f.h, zIndex: z }} onPointerDownCapture={() => ctx.onLayout((l) => raiseFloat(l, f.id))}>
      <GroupView group={f.group} ctx={ctx} floatId={f.id} />
      {['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((d) => (
        <i key={d} className="st-ws-rs" data-dir={d} onPointerDown={(e) => resize(e, d)} aria-hidden="true" />
      ))}
    </div>
  );
}

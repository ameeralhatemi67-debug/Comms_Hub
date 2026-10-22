// Where an explanation window goes: beside the element it explains, never over it, and
// never over a dialog, menu, panel or list that is open. Pure, after the reference
// (placePop in «النموذج المرجعي للمركز» version 5), covered by tests/kit.test.mjs.

export type Box = { l: number; t: number; r: number; b: number };
export type Size = { w: number; h: number };

export const overlap = (a: Box, b: Box) => {
  const w = Math.min(a.r, b.r) - Math.max(a.l, b.l);
  const h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
  return w > 0 && h > 0 ? w * h : 0;
};

export type Placement = { x: number; y: number; cost: number; width?: number };

/**
 * The best spot for a window of `size` in a viewport of `view`, beside `target` when
 * there is one, away from `layers`. Candidates are the four sides and the corners of the
 * target, then the corners of the screen. If nothing beside a wide dialog is free, the
 * window narrows into the widest free side (down to 210 pixels) rather than cover it.
 * `avoid` must stay in reach even more than the target stays visible, and does not narrow
 * the window: the guide bar, whose «دليل الصفحة» and exit a phone-wide window would
 * otherwise cover (HELP-001 of sim-20261015-03).
 */
export function place(size: Size, view: Size, target: Box | null, layers: Box[], avoid: Box[] = [], margin = 10, gap = 14): Placement {
  const pick = (w: number, h: number): Placement => {
    const cost = (x: number, y: number, corner: boolean) => {
      const R = { l: x, t: y, r: x + w, b: y + h };
      let c = 0;
      for (const a of layers) c += overlap(R, a) * 3;
      for (const a of avoid) c += overlap(R, a) * 10;
      if (target) {
        c += overlap(R, target) * 8;
        const dx = Math.max(0, target.l - R.r, R.l - target.r);
        const dy = Math.max(0, target.t - R.b, R.t - target.b);
        c += (dx + dy) * 2;
      }
      return c + (corner ? 600 : 0);
    };
    const cands: [number, number][] = [];
    if (target) {
      const tw = target.r - target.l;
      const th = target.b - target.t;
      const cx = target.l + tw / 2 - w / 2;
      const cy = target.t + th / 2 - h / 2;
      cands.push(
        [cx, target.b + gap], [cx, target.t - gap - h], [target.l - gap - w, cy], [target.r + gap, cy],
        [target.r - w, target.b + gap], [target.l, target.b + gap], [target.r - w, target.t - gap - h], [target.l, target.t - gap - h],
        [target.l - gap - w, target.t], [target.r + gap, target.t],
      );
    }
    const corners: [number, number][] = [[margin, view.h - h - margin], [view.w - w - margin, view.h - h - margin], [margin, margin], [view.w - w - margin, margin]];
    let best: Placement | null = null;
    [...cands, ...corners].forEach(([cx, cy], k) => {
      const x = Math.max(margin, Math.min(cx, view.w - w - margin));
      const y = Math.max(margin, Math.min(cy, view.h - h - margin));
      const v = cost(x, y, k >= cands.length);
      if (!best || v < best.cost) best = { x, y, cost: v };
    });
    return best!;
  };

  const first = pick(size.w, size.h);
  if (!layers.length || first.cost === 0) return first;
  const left = Math.min(...layers.map((r) => r.l)) - 2 * margin;
  const right = view.w - Math.max(...layers.map((r) => r.r)) - 2 * margin;
  const room = Math.max(left, right);
  if (room >= 210 && room < size.w) {
    // Narrower means taller: keep the area roughly the same.
    const h = Math.min(view.h - 2 * margin, Math.ceil((size.w * size.h) / room));
    const narrow = pick(room, h);
    if (narrow.cost < first.cost) return { ...narrow, width: room };
  }
  return first;
}

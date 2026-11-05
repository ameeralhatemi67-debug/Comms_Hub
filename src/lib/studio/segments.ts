// Export lanes' segments (Desktop_Power_Ideas.md P-06): a project's frames cut into contiguous stretches, each starting
// on a key frame of the single-lane export (every `keyEvery` seconds), so that the joined file's key frames fall where
// one lane puts them. As equal as whole key-frame groups allow; never more lanes than groups. Pure.

export type Segment = { from: number; to: number };

/** Frames [0, total) at `fps` cut into at most `lanes` segments on key-frame boundaries. */
export function segmentsOf(total: number, fps: number, lanes: number, keyEvery = 2): Segment[] {
  const group = Math.max(1, Math.round(fps * keyEvery));
  const groups = Math.ceil(total / group);
  const k = Math.max(1, Math.min(Math.floor(lanes), groups));
  const out: Segment[] = [];
  let at = 0;
  for (let i = 0; i < k; i++) {
    const take = Math.floor(groups / k) + (i < groups % k ? 1 : 0);
    const to = Math.min(total, at + take * group);
    out.push({ from: at, to });
    at = to;
  }
  return out;
}

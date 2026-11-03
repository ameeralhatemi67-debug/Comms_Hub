// The paused preview's frame cache (src/lib/studio/scrub.ts; Desktop_Power_Ideas.md P-02, phase D10): which kept frame
// answers a time (the export's rule, and only while the next frame is known to start later), the share of the size a
// frame is kept at (a power of two, never smaller than drawn, so compose.ts lays it out to the bit as the full frame),
// and the budget (the least recently shown let go first, never the frame on screen).
import test from 'node:test';
import assert from 'node:assert/strict';
import { divisorFor, EPS, FrameStore, MOVEMENT_HEADROOM, needOf } from '../src/lib/studio/scrub.ts';
import { newVideoDoc } from '../src/lib/studio/schema.ts';
import { addClip, addSource } from '../src/lib/studio/timeline.ts';

const US = 1e6;

test('the share of the size: the smallest whole power-of-two share still at least the drawn size', () => {
  assert.equal(divisorFor(3840, 2160, 960, 540), 4);
  assert.equal(divisorFor(3840, 2160, 961, 540), 2);
  assert.equal(divisorFor(3840, 2160, 1080, 607.5), 2);
  assert.equal(divisorFor(3840, 2160, 400, 225), 8);
  assert.equal(divisorFor(3840, 2160, 3000, 1700), 1);
  assert.equal(divisorFor(3840, 2160, 5000, 3000), 1);
  // only shares that divide both sides exactly: 1366 / 4 is not whole
  assert.equal(divisorFor(1366, 768, 300, 160), 2);
  assert.equal(divisorFor(1281, 721, 100, 100), 1);
});

test('a kept frame at a power-of-two share lays out exactly as the whole frame (compose.ts fitSize)', () => {
  const fit = (w, h, W, H, cover) => {
    const k = cover ? Math.max(W / w, H / h) : Math.min(W / w, H / h);
    return [w * k, h * k];
  };
  for (const [W, H] of [[1080, 1920], [1920, 1080], [1080, 1080]]) {
    for (const [w, h] of [[3840, 2160], [1920, 1080], [2160, 3840], [1280, 720]]) {
      for (const d of [2, 4, 8]) {
        if (w % d || h % d) continue;
        for (const cover of [false, true]) assert.deepEqual(fit(w / d, h / d, W, H, cover), fit(w, h, W, H, cover), `${w}x${h}/${d} in ${W}x${H}`);
      }
    }
  }
});

function docWith(clip) {
  const r = addSource(newVideoDoc('9:16', 30), { kind: 'local', key: 'k1', name: 'a.mp4', media: 'video', mime: 'video/mp4', size: 1, w: 3840, h: 2160, duration: 10 * US });
  return { doc: addClip(r.doc, { source: r.id, start: 0, length: 5 * US, in: 0, ...clip }).doc, id: r.id };
}

test('the drawn size of a source: fitted into the canvas, at its largest scale and crop, with room for movements', () => {
  // 3840 x 2160 contained in 1080 x 1920: 1080 x 607.5 project pixels; at half scale on the preview, half that
  let { doc, id } = docWith({});
  assert.deepEqual(needOf(doc, id, 3840, 2160, 1), { w: 1080, h: 607.5 });
  assert.deepEqual(needOf(doc, id, 3840, 2160, 0.5), { w: 540, h: 303.75 });
  ({ doc, id } = docWith({ transform: { x: 540, y: 960, scale: 0.5, rotation: 0, opacity: 1 }, keys: { scale: [{ t: 0, v: 0.5 }, { t: US, v: 2 }] } }));
  assert.equal(needOf(doc, id, 3840, 2160, 1).w, 2160);
  ({ doc, id } = docWith({ crop: { l: 0.25, t: 0, r: 0.25, b: 0 } }));
  assert.equal(needOf(doc, id, 3840, 2160, 1).w, 2160);
  ({ doc, id } = docWith({ fit: 'cover' }));
  assert.equal(needOf(doc, id, 3840, 2160, 1).h, 1920);
  ({ doc, id } = docWith({ animIn: { kind: 'zoom', length: 500000 } }));
  assert.equal(needOf(doc, id, 3840, 2160, 1).w, 1080 * MOVEMENT_HEADROOM);
  assert.deepEqual(needOf(doc, 'none', 3840, 2160, 1), { w: 0, h: 0 });
});

const frame = (n, fps = 30) => n / fps;
function filled(store, id, n, d = 2, fps = 30) {
  let prev = null;
  for (let i = 0; i < n; i++) {
    const from = frame(i, fps);
    if (prev) store.close(prev, from);
    prev = store.put(id, { from, to: from + 1 / fps, canvas: `${id}:${i}`, bytes: 10, d });
  }
  return prev;
}

test('which frame answers a time: the last starting at most a microsecond after it, the export\'s rule', () => {
  const s = new FrameStore(1e9, () => undefined);
  filled(s, 'a', 3);
  assert.equal(s.find('a', 0, 2).canvas, 'a:0');
  assert.equal(s.find('a', frame(1) - 2e-6, 2).canvas, 'a:0');
  // a time a microsecond short of a frame's start is that frame, as export.ts frameFor takes it
  assert.equal(s.find('a', frame(1) - EPS / 2, 2).canvas, 'a:1');
  assert.equal(s.find('a', 33333 / US, 2).canvas, 'a:1');
  assert.equal(s.find('a', frame(1.5), 2).canvas, 'a:1');
  // the last frame read is open: it answers only within its own length
  assert.equal(s.find('a', frame(2.5), 2).canvas, 'a:2');
  assert.equal(s.find('a', frame(3.2), 2), null);
  // another share is not an answer
  assert.equal(s.find('a', 0, 4), null);
  assert.equal(s.find('b', 0, 2), null);
});

test('a frame whose next one is unknown answers nothing after its own length; the source\'s last frame answers to the end', () => {
  const s = new FrameStore(1e9, () => undefined);
  const last = filled(s, 'a', 3);
  s.close(last, Infinity);
  assert.equal(s.find('a', 99, 2).canvas, 'a:2');
  // a gap: frames 0 to 2 kept, then 10 alone (another pass); frame 2 does not answer for 5
  const s2 = new FrameStore(1e9, () => undefined);
  filled(s2, 'a', 3);
  s2.put('a', { from: frame(10), to: frame(11), canvas: 'a:10', bytes: 10, d: 2 });
  assert.equal(s2.find('a', frame(5), 2), null);
  assert.equal(s2.find('a', frame(10.5), 2).canvas, 'a:10');
});

test('the budget: the least recently shown let go first, never one on screen, and canvases handed back', () => {
  const gone = [];
  const s = new FrameStore(40, (c) => gone.push(c));
  filled(s, 'a', 4);
  s.find('a', frame(0), 2);
  s.put('a', { from: frame(9), to: frame(10), canvas: 'a:9', bytes: 10, d: 2 });
  s.evict(new Set(['a:1']));
  assert.equal(s.bytes, 40);
  // a:1 is on screen and a:0 was just shown: a:2 is the least recently shown of the rest
  assert.deepEqual(gone, ['a:2']);
  assert.equal(s.count('a'), 4);
  s.drop('a', 4);
  assert.equal(s.count(), 0);
  assert.equal(s.bytes, 0);
});

test('a frame kept again at the same start replaces the old one; drop keeps the frames of one share', () => {
  const gone = [];
  const s = new FrameStore(1e9, (c) => gone.push(c));
  s.put('a', { from: 0, to: 1, canvas: 'x', bytes: 5, d: 2 });
  s.put('a', { from: 0, to: 1, canvas: 'y', bytes: 5, d: 4 });
  assert.deepEqual(gone, ['x']);
  assert.equal(s.bytes, 5);
  assert.equal(s.get('a', 0, 4).canvas, 'y');
  assert.equal(s.get('a', 0, 2), null);
  s.put('a', { from: 1, to: 2, canvas: 'z', bytes: 5, d: 2 });
  s.drop('a', 4);
  assert.equal(s.count('a'), 1);
  assert.equal(s.get('a', 0, 4).canvas, 'y');
});

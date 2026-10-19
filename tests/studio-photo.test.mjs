// Photo projects (Studio_Build_Plan.md Phase 5): layers added on top, ordered, duplicated, removed (not
// when locked), the canvas resized with layers kept in place, alignment, and the pixel functions of the
// adjustments (brightness, contrast, saturation, warmth, blur) on small arrays.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newPhotoDoc, checkDoc } from '../src/lib/studio/schema.ts';
import { addLayer, updateLayer, removeLayer, duplicateLayer, moveLayer, setCanvas, alignLayer, adjustPixels, blurPixels, adjusts } from '../src/lib/studio/photo.ts';
import { defaultText } from '../src/lib/studio/text.ts';

const px = (r, g, b, a = 255) => new Uint8ClampedArray([r, g, b, a]);

test('layers go on top, in order, and the document stays valid', () => {
  let d = newPhotoDoc(1080, 1350);
  const a = addLayer(d, { text: defaultText('أ') });
  const b = addLayer(a.doc, { shape: { type: 'rect', w: 100, h: 50, fill: '#000000', stroke: null, strokeWidth: 0, radius: 0 } });
  d = b.doc;
  assert.deepEqual(d.photo.layers.map((l) => l.id), [a.id, b.id]);
  assert.deepEqual(d.photo.layers[0].transform, { x: 540, y: 675, scale: 1, rotation: 0, opacity: 1 }, 'centred');
  assert.equal(checkDoc(d), null);
});

test('ordering: up, down, top and bottom', () => {
  let d = newPhotoDoc();
  const ids = [];
  for (const n of ['1', '2', '3']) {
    const r = addLayer(d, { text: defaultText(n) });
    d = r.doc;
    ids.push(r.id);
  }
  const order = (x) => x.photo.layers.map((l) => ids.indexOf(l.id) + 1).join('');
  assert.equal(order(moveLayer(d, ids[0], 'up')), '213');
  assert.equal(order(moveLayer(d, ids[2], 'down')), '132');
  assert.equal(order(moveLayer(d, ids[0], 'top')), '231');
  assert.equal(order(moveLayer(d, ids[2], 'bottom')), '312');
  assert.equal(order(moveLayer(d, ids[2], 'up')), '123', 'the top stays the top');
});

test('duplicating puts the copy just above, offset; a locked layer is not removed', () => {
  let d = newPhotoDoc();
  const a = addLayer(d, { text: defaultText('أ') });
  const dup = duplicateLayer(a.doc, a.id);
  assert.equal(dup.doc.photo.layers.length, 2);
  assert.equal(dup.doc.photo.layers[1].id, dup.id);
  assert.equal(dup.doc.photo.layers[1].transform.x, a.doc.photo.layers[0].transform.x + 24);
  const locked = updateLayer(a.doc, a.id, { locked: true });
  assert.equal(removeLayer(locked, a.id), locked);
  assert.equal(removeLayer(a.doc, a.id).photo.layers.length, 0);
});

test('a new canvas size keeps layers in place relative to it; sizes stay within limits', () => {
  let d = newPhotoDoc(1000, 1000);
  const a = addLayer(d, { text: defaultText('أ'), transform: { x: 250, y: 750, scale: 1, rotation: 0, opacity: 1 } });
  const big = setCanvas(a.doc, { w: 2000, h: 500 });
  assert.deepEqual([big.photo.layers[0].transform.x, big.photo.layers[0].transform.y], [500, 375]);
  assert.deepEqual([setCanvas(d, { w: 99999 }).photo.w, setCanvas(d, { h: 1 }).photo.h], [8000, 16]);
  assert.equal(setCanvas(d, { background: null }).photo.background, null, 'a transparent background');
});

test('alignment: the right edge is «البداية» in the right-to-left page', () => {
  const d = newPhotoDoc(1000, 800);
  const a = addLayer(d, { text: defaultText('أ') });
  const t = (how) => alignLayer(a.doc, a.id, how, { w: 200, h: 100 }).photo.layers[0].transform;
  assert.equal(t('start').x, 900);
  assert.equal(t('end').x, 100);
  assert.equal(t('top').y, 50);
  assert.equal(t('bottom').y, 750);
  assert.deepEqual([t('centerX').x, t('centerY').y], [500, 400]);
});

test('brightness, contrast, saturation and warmth on pixels', () => {
  const darker = px(200, 100, 50);
  adjustPixels(darker, { brightness: -50 });
  assert.deepEqual([...darker.slice(0, 3)], [100, 50, 25]);
  const contrast = px(160, 128, 96);
  adjustPixels(contrast, { contrast: 100 });
  assert.deepEqual([...contrast.slice(0, 3)], [192, 128, 64]);
  const grey = px(255, 0, 0);
  adjustPixels(grey, { saturation: -100 });
  assert.ok(Math.abs(grey[0] - grey[1]) <= 1 && Math.abs(grey[1] - grey[2]) <= 1, 'no saturation is grey');
  const warm = px(100, 100, 100);
  adjustPixels(warm, { warmth: 100 });
  assert.ok(warm[0] > 100 && warm[2] < 100 && warm[1] === 100, 'warmth adds red and takes blue');
  const alpha = px(10, 10, 10, 77);
  adjustPixels(alpha, { brightness: 50 });
  assert.equal(alpha[3], 77, 'transparency is untouched');
  assert.equal(adjusts({ brightness: 0, contrast: 0, saturation: 0 }), false);
  assert.equal(adjusts({ brightness: 0, contrast: 0, saturation: 0, blur: 3 }), true);
});

test('blur spreads a single bright pixel and keeps the total light', () => {
  const w = 9;
  const h = 9;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  const c = (4 * w + 4) * 4;
  data[c] = data[c + 1] = data[c + 2] = 255;
  blurPixels(data, w, h, 1);
  assert.ok(data[c] < 255 && data[c] > 0, 'the centre is softened');
  assert.ok(data[(4 * w + 3) * 4] > 0, 'its neighbour lit');
  blurPixels(data, w, h, 0);
});

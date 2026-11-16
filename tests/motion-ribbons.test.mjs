// The two lower thirds of designs-ribbons.js (MVP_draft.md section 80): the Hedayah emblem drawn as vector strokes
// must be the emblem the site ships, and the design options must be data the template tab and the studio both keep.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { EMBLEM, CAPSULE_LENGTH } from '../src/lib/motion/emblem.js';
import { catalog } from '../src/lib/motion/catalog.ts';
import { motionParams, changedParams, graphicById } from '../src/lib/studio/motion-adapter.ts';

/** The alpha channel of an 8-bit PNG with alpha (grey or colour), decoded by hand (no image library in the tests). */
function pngAlpha(file) {
  const buf = readFileSync(file);
  let pos = 8, w = 0, h = 0, depth = 0, type = 0; const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), kind = buf.toString('ascii', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; }
    if (kind === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  assert.equal(depth, 8); assert.ok(type === 4 || type === 6, 'grey or colour, with alpha');
  const raw = inflateSync(Buffer.concat(idat)), bpp = type === 6 ? 4 : 2, stride = w * bpp, out = new Uint8Array(w * h * bpp);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0, b = y ? out[(y - 1) * stride + x] : 0, c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      out[y * stride + x] = (line[x] + pred) & 255;
    }
  }
  const alpha = new Float64Array(w * h); for (let i = 0; i < w * h; i++) alpha[i] = out[i * bpp + bpp - 1] / 255;
  return { w, h, alpha };
}

test('the vector emblem is the emblem of public/motion/logo_src-emblem.png', () => {
  const { w, h, alpha } = pngAlpha(new URL('../public/motion/logo_src-emblem.png', import.meta.url));
  const R = 384, cx = 384, cy = 384.5, r = EMBLEM.r * R, half = EMBLEM.half * R, sw = EMBLEM.stroke * R;
  let both = 0, either = 0, ink = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = x + .5 - cx, py = y + .5 - cy; let cover = 0;
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 4, ux = Math.sin(a), uy = -Math.cos(a), t = Math.max(-half, Math.min(half, px * ux + py * uy));
      const d = Math.hypot(px - t * ux, py - t * uy), e = Math.abs(d - r) - sw / 2;
      cover = Math.max(cover, Math.max(0, Math.min(1, .5 - e)));
    }
    const m = alpha[y * w + x]; both += Math.min(cover, m); either += Math.max(cover, m); ink += m;
  }
  assert.ok(both / either > .975, `overlap ${(both / either).toFixed(4)}`);
  assert.ok(Math.abs(EMBLEM.half + EMBLEM.r + EMBLEM.stroke / 2 - 1) < .002, 'the outer radius is the unit');
  assert.ok(Math.abs(CAPSULE_LENGTH - (4 * EMBLEM.half + 2 * Math.PI * EMBLEM.r)) < 1e-9);
  assert.ok(ink > 100000, 'the mask was read');
});

test('ten Repine designs; the two new ones carry Arabic names and their options', () => {
  const repine = catalog.filter(g => g.category === 'repine');
  assert.equal(repine.length, 10);
  assert.equal(catalog.length, 28);
  assert.equal(graphicById('rp-liquid').name, 'الذهب السائل');
  assert.equal(graphicById('rp-ivory').name, 'اللوحة العاجية');
  for (const id of ['rp-liquid', 'rp-ivory']) {
    const g = graphicById(id);
    assert.equal(g.badge, 'new');
    for (const key of ['metal', 'shine', 'shineSpeed', 'pattern', 'patternAmt', 'font', 'span', 'side', 'size', 'lift', 'dropShadow', 'glow', 'particles'])
      assert.ok(g.options.some(o => o.key === key), `${id} offers ${key}`);
  }
  assert.ok(graphicById('rp-liquid').options.some(o => o.key === 'flow') && graphicById('rp-liquid').options.some(o => o.key === 'drips'));
  assert.ok(graphicById('rp-ivory').options.some(o => o.key === 'plaque'));
  assert.equal(graphicById('rp-gold').options, undefined, 'the older designs are unchanged');
});

test('every option is a parameter every design knows, with a default of the right kind', () => {
  const known = catalog[0].defaults;                       // what the studio keeps of a clip's saved parameters
  for (const g of catalog.filter(x => x.options)) for (const o of g.options) {
    assert.ok(o.key in known, `${g.id}.${o.key} is kept by the studio`);
    const v = g.defaults[o.key];
    if (o.kind === 'switch') assert.equal(typeof v, 'boolean', `${g.id}.${o.key}`);
    if (o.kind === 'slider') assert.ok(typeof v === 'number' && v >= o.min && v <= o.max, `${g.id}.${o.key} = ${v}`);
    if (o.kind === 'choice') assert.ok(o.choices.some(c => c.value === v), `${g.id}.${o.key} = ${v} is one of its choices`);
    for (const c of o.kind === 'choice' ? o.choices : []) assert.match(c.label, /[؀-ۿ]/, `${g.id}.${o.key}: Arabic label`);
    assert.match(o.label, /[؀-ۿ]/);
  }
});

test('fields that matter only with another choice are shown only with it', () => {
  const g = graphicById('rp-liquid'), custom = g.colors.find(c => c.key === 'accent');
  assert.equal(custom.when({ ...g.defaults, metal: 'gold' }), false);
  assert.equal(custom.when({ ...g.defaults, metal: 'custom' }), true);
  const speed = g.options.find(o => o.key === 'shineSpeed');
  assert.equal(speed.when({ ...g.defaults, shine: false }), false);
  const iv = graphicById('rp-ivory'), kicker = iv.texts.find(t => t.key === 'kicker');
  assert.equal(kicker.when({ ...iv.defaults, plaque: 'wordmark' }), false);
  assert.equal(kicker.when({ ...iv.defaults, plaque: 'kicker' }), true);
});

test('a studio clip keeps the options it changed, and only those', () => {
  const g = graphicById('rp-ivory');
  const p = motionParams(g, { metal: 'silver', side: 'left', size: 90, shine: false, pattern: 7 }, '16:9');
  assert.equal(p.metal, 'silver'); assert.equal(p.side, 'left'); assert.equal(p.size, 90); assert.equal(p.shine, false);
  assert.equal(p.pattern, g.defaults.pattern, 'a value of the wrong kind is ignored');
  assert.deepEqual(changedParams(g, p), { metal: 'silver', side: 'left', size: 90, shine: false });
});

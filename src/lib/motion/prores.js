/* Apple ProRes 4444 encoder for transparent video. Every frame is intra coded, so the file opens in Premiere, After Effects,
   DaVinci Resolve, Final Cut and any player that reads ProRes, with a real 16-bit alpha channel (straight, not premultiplied).
   Layout follows SMPTE RDD 36: 4:4:4 BT.709 limited range, 12-bit sample scale, 8 macroblocks per slice, progressive.
   A fixed quantiser is used and raised only for a slice that would not fit its 16-bit size field. */

import { bx } from './containers.js';

const SCAN = [
  0, 1, 8, 9, 2, 3, 10, 11, 16, 17, 24, 25, 18, 19, 26, 27, 4, 5, 12, 20, 13, 6, 7, 14, 21, 28, 29, 22, 15, 23, 30, 31,
  32, 33, 40, 48, 41, 34, 35, 42, 49, 56, 57, 50, 43, 36, 37, 44, 51, 58, 59, 52, 45, 38, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
];
const DC_CB = [0x04, 0x28, 0x28, 0x4D, 0x4D, 0x70, 0x70];
const RUN_CB = [0x06, 0x06, 0x05, 0x05, 0x04, 0x29, 0x29, 0x29, 0x29, 0x28, 0x28, 0x28, 0x28, 0x28, 0x28, 0x4C];
const LEVEL_CB = [0x04, 0x0A, 0x05, 0x06, 0x04, 0x28, 0x28, 0x28, 0x28, 0x4C];
const FIRST_DC_CB = 0xB8;
const MBS_PER_SLICE = 8, DC_MID = 16384;                // 8 * 2048, the DC of a flat block at mid grey
const POW = Array.from({ length: 40 }, (_, i) => 2 ** i);

/* Orthonormal 8-point DCT matrix: M[u * 8 + x]. */
const DCT = (() => {
  const m = new Float64Array(64);
  for (let u = 0; u < 8; u++) for (let x = 0; x < 8; x++) m[u * 8 + x] = (u ? 1 : Math.SQRT1_2) * Math.cos((2 * x + 1) * u * Math.PI / 16) / 2;
  return m;
})();

class BitWriter {
  constructor(capacity = 1 << 15) { this.buf = new Uint8Array(capacity); this.length = 0; this.acc = 0; this.count = 0; }
  put(n, value) {                                        // n in 0..31, value is non-negative
    if (!n) return;
    this.acc = this.acc * POW[n] + (value % POW[n]); this.count += n;
    while (this.count >= 8) {
      const shift = POW[this.count - 8], byte = Math.floor(this.acc / shift);
      this.acc -= byte * shift; this.count -= 8;
      if (this.length === this.buf.length) { const bigger = new Uint8Array(this.buf.length * 2); bigger.set(this.buf); this.buf = bigger; }
      this.buf[this.length++] = byte;
    }
  }
  align() { if (this.count) this.put(8 - this.count, 0); }
  bytes() { return this.buf.subarray(0, this.length); }
}

function putCodeword(bw, codebook, val) {
  const switchBits = (codebook & 3) + 1, rice = codebook >> 5, expo = (codebook >> 2) & 7, switchVal = switchBits << rice;
  if (val >= switchVal) {
    val -= switchVal - (1 << expo);
    const e = 31 - Math.clz32(val);
    bw.put(e - expo + switchBits, 0); bw.put(e + 1, val);
  } else {
    const e = val >> rice;
    if (e) bw.put(e, 0);
    bw.put(1, 1);
    if (rice) bw.put(rice, val);
  }
}
const zigzag = x => x >= 0 ? x * 2 : -x * 2 - 1;
const round = x => x < 0 ? -Math.floor(-x + .5) : Math.floor(x + .5);

function writeDcs(bw, levels, blocks) {
  let prev = levels[0];
  putCodeword(bw, FIRST_DC_CB, zigzag(prev));
  let codebook = 5, sign = 0;
  for (let b = 1; b < blocks; b++) {
    const dc = levels[b * 64], delta = dc - prev, newSign = delta < 0 ? -1 : 0, folded = (delta ^ sign) - sign, code = zigzag(folded);
    putCodeword(bw, DC_CB[codebook], code);
    codebook = Math.min(code, 6); sign = newSign; prev = dc;
  }
}

function writeAcs(bw, levels, blocks) {
  let prevRun = 4, prevLevel = 2, run = 0;
  for (let i = 1; i < 64; i++) {
    const at = SCAN[i];
    for (let b = 0; b < blocks; b++) {
      const level = levels[b * 64 + at];
      if (level) {
        const mag = level < 0 ? -level : level;
        putCodeword(bw, RUN_CB[prevRun], run);
        putCodeword(bw, LEVEL_CB[prevLevel], mag - 1);
        bw.put(1, level < 0 ? 1 : 0);
        prevRun = Math.min(run, 15); prevLevel = Math.min(mag, 9); run = 0;
      } else run++;
    }
  }
}

function putAlphaDiff(bw, cur, prev) {
  let diff = (cur - prev) & 0xFFFF;
  if (diff >= 0x10000 - 64) diff -= 0x10000;
  if (diff < -64 || diff > 64 || !diff) { bw.put(1, 1); bw.put(16, diff & 0xFFFF); }
  else { bw.put(1, 0); bw.put(6, Math.abs(diff) - 1); bw.put(1, diff < 0 ? 1 : 0); }
}
function putAlphaRun(bw, run) {
  if (!run) { bw.put(1, 1); return; }
  bw.put(1, 0);
  if (run < 16) bw.put(4, run); else bw.put(15, run);
}
function writeAlpha(bw, values, count) {
  let prev = 0xFFFF, cur = values[0], run = 0;
  putAlphaDiff(bw, cur, prev); prev = cur;
  for (let i = 1; i < count; i++) {
    cur = values[i];
    if (cur !== prev) { putAlphaRun(bw, run); putAlphaDiff(bw, cur, prev); prev = cur; run = 0; } else run++;
  }
  putAlphaRun(bw, run);
}

const u16 = (a, o, v) => { a[o] = v >> 8 & 255; a[o + 1] = v & 255; };
const u32 = (a, o, v) => { a[o] = v >>> 24; a[o + 1] = v >>> 16 & 255; a[o + 2] = v >>> 8 & 255; a[o + 3] = v & 255; };

/* Returns encode(rgba) -> Uint8Array for one ProRes frame. rgba is straight (non-premultiplied) 8-bit data, as getImageData gives. */
export function createProresEncoder(width, height, { quant = 3 } = {}) {
  const mbW = Math.ceil(width / 16), mbH = Math.ceil(height / 16), pw = mbW * 16, ph = mbH * 16;
  const Y = new Int16Array(pw * ph), CB = new Int16Array(pw * ph), CR = new Int16Array(pw * ph), A = new Uint16Array(pw * ph);
  const planes = [Y, CB, CR];
  const slicesPerRow = []; for (let x = 0, n = MBS_PER_SLICE; x < mbW; x += n) { while (mbW - x < n) n >>= 1; slicesPerRow.push({ x, n }); }
  const sampleBuf = new Float64Array(64), mid = new Float64Array(64), coef = new Float64Array(64);
  const levels = new Int32Array(MBS_PER_SLICE * 4 * 64), alphaRun = new Uint16Array(MBS_PER_SLICE * 256);

  function convert(rgba) {
    for (let y = 0; y < ph; y++) {
      const sy = Math.min(y, height - 1) * width * 4;
      for (let x = 0; x < pw; x++) {
        const i = sy + Math.min(x, width - 1) * 4, r = rgba[i], g = rgba[i + 1], b = rgba[i + 2], a = rgba[i + 3];
        const luma = .2126 * r + .7152 * g + .0722 * b, o = y * pw + x;
        Y[o] = Math.round(256 + luma * 3504 / 255);
        CB[o] = Math.round(2048 + (b - luma) / 1.8556 * 3584 / 255);
        CR[o] = Math.round(2048 + (r - luma) / 1.5748 * 3584 / 255);
        A[o] = a << 8 | a;
      }
    }
  }

  /* One 8x8 block into `levels` at `at`, already divided by the quantiser step. */
  function block(plane, bx, by, at, step) {
    const first = plane[by * pw + bx]; let flat = true;
    for (let r = 0; r < 8; r++) { const row = (by + r) * pw + bx; for (let c = 0; c < 8; c++) { const v = plane[row + c]; sampleBuf[r * 8 + c] = v; if (v !== first) flat = false; } }
    for (let i = 1; i < 64; i++) levels[at + i] = 0;
    if (flat) { levels[at] = round((first * 8 - DC_MID) / step); return; }
    for (let r = 0; r < 8; r++) for (let u = 0; u < 8; u++) { let s = 0; for (let x = 0; x < 8; x++) s += DCT[u * 8 + x] * sampleBuf[r * 8 + x]; mid[r * 8 + u] = s; }
    for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) { let s = 0; for (let y = 0; y < 8; y++) s += DCT[v * 8 + y] * mid[y * 8 + u]; coef[v * 8 + u] = s; }
    levels[at] = round((coef[0] - DC_MID) / step);
    for (let i = 1; i < 64; i++) levels[at + i] = round(coef[i] / step);
  }

  /* Luma blocks run top-left, top-right, bottom-left, bottom-right in each macroblock. */
  function lumaBlocks(plane, mbX, mbY, mbs, q) {
    const step = 4 * q;
    for (let m = 0; m < mbs; m++) {
      const x = (mbX + m) * 16, y = mbY * 16, at = m * 4 * 64;
      block(plane, x, y, at, step); block(plane, x + 8, y, at + 64, step);
      block(plane, x, y + 8, at + 128, step); block(plane, x + 8, y + 8, at + 192, step);
    }
    return mbs * 4;
  }

  /* 4:4:4 chroma is stored as two columns of (top, bottom) blocks per macroblock. */
  function chromaBlocks(plane, mbX, mbY, mbs, q) {
    const step = 4 * q;
    for (let m = 0; m < mbs; m++) {
      const x = (mbX + m) * 16, y = mbY * 16, at = m * 4 * 64;
      block(plane, x, y, at, step); block(plane, x, y + 8, at + 64, step);
      block(plane, x + 8, y, at + 128, step); block(plane, x + 8, y + 8, at + 192, step);
    }
    return mbs * 4;
  }

  function encodeSlice(mbX, mbY, mbs, q) {
    const parts = [];
    for (let p = 0; p < 3; p++) {
      const blocks = p === 0 ? lumaBlocks(planes[0], mbX, mbY, mbs, q) : chromaBlocks(planes[p], mbX, mbY, mbs, q), bw = new BitWriter(4096);
      writeDcs(bw, levels, blocks); writeAcs(bw, levels, blocks); bw.align(); parts.push(bw.bytes().slice());
    }
    const count = mbs * 256, bw = new BitWriter(2048);
    for (let r = 0; r < 16; r++) alphaRun.set(A.subarray((mbY * 16 + r) * pw + mbX * 16, (mbY * 16 + r) * pw + (mbX + mbs) * 16), r * mbs * 16);
    writeAlpha(bw, alphaRun, count); bw.align(); parts.push(bw.bytes().slice());
    return parts;
  }

  return function encode(rgba) {
    convert(rgba);
    const slices = [];
    for (let my = 0; my < mbH; my++) for (const { x, n } of slicesPerRow) {
      let q = quant, parts, size;
      for (;;) {
        parts = encodeSlice(x, my, n, q); size = 8 + parts[0].length + parts[1].length + parts[2].length + parts[3].length;
        if ((size < 65535 && parts.every(p => p.length < 65535)) || q >= 128) break;
        q = Math.min(128, q + Math.max(1, q >> 1));
      }
      const out = new Uint8Array(size); out[0] = 64; out[1] = q; u16(out, 2, parts[0].length); u16(out, 4, parts[1].length); u16(out, 6, parts[2].length);
      let o = 8; for (const p of parts) { out.set(p, o); o += p.length; }
      slices.push(out);
    }
    const sliceBytes = slices.reduce((a, s) => a + s.length, 0), picture = 8 + slices.length * 2 + sliceBytes;
    const frame = new Uint8Array(8 + 20 + picture);
    u32(frame, 0, frame.length); frame.set([0x69, 0x63, 0x70, 0x66], 4);                // 'icpf'
    let o = 8; u16(frame, o, 20); u16(frame, o + 2, 1); frame.set([0x63, 0x6F, 0x6D, 0x6D], o + 4);   // header size, version, vendor 'comm'
    u16(frame, o + 8, width); u16(frame, o + 10, height);
    frame[o + 12] = 0xC0; frame[o + 14] = 1; frame[o + 15] = 1; frame[o + 16] = 1; frame[o + 17] = 2;  // 4:4:4 progressive, BT.709, 16-bit alpha
    o += 20;
    frame[o] = 64; u32(frame, o + 1, picture); u16(frame, o + 5, slices.length); frame[o + 7] = Math.log2(MBS_PER_SLICE) << 4;
    let t = o + 8, d = t + slices.length * 2;
    for (const s of slices) { u16(frame, t, s.length); t += 2; frame.set(s, d); d += s.length; }
    return frame;
  };
}

/* Extra atoms QuickTime-based editors expect on a ProRes sample entry: progressive fields and BT.709 colour, plus the vendor. */
export function proresSampleEntry() {
  return {
    vendor: 'appl', spatial: 1023,
    extra: [bx.box('fiel', new Uint8Array([1, 0])), bx.box('colr', bx.str('nclc'), bx.u16(1, 1, 1))],
  };
}

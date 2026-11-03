// yuv.ts's BT.709 conversion as WebAssembly with 128-bit lanes, for the export's workers (yuv-pipe.ts): the same
// whole-number arithmetic four pixels at a time, so the same bytes, in a fraction of the time (measured on
// 2026-11-04: about 13 ms a 1080p frame in plain code). The module is written here instruction by instruction, not
// shipped as a binary, so what it does can be read: `convert(w, h, x1)` reads w x h RGBA pixels at address 0 and
// writes the I420 planes right after them, for the columns before x1 (a multiple of 16); i420Into does the columns
// from x1. tests/studio-export-power.test.mjs holds the two equal byte for byte. Pure.
import { BT709 } from './yuv.ts';

const leb = (n: number): number[] => {
  const out: number[] = [];
  for (;;) {
    const b = n & 0x7f;
    n >>>= 7;
    if (!n) return [...out, b];
    out.push(b | 0x80);
  }
};
/** A signed LEB128, for i32.const. */
const sleb = (n: number): number[] => {
  const out: number[] = [];
  for (;;) {
    const b = n & 0x7f;
    n >>= 7;
    const done = (n === 0 && !(b & 0x40)) || (n === -1 && b & 0x40);
    out.push(done ? b : b | 0x80);
    if (done) return out;
  }
};
const section = (id: number, body: number[]) => [id, ...leb(body.length), ...body];
const vec = (items: number[][]) => [...leb(items.length), ...items.flat()];
const name = (s: string) => [...leb(s.length), ...[...s].map((c) => c.charCodeAt(0))];

// the few instructions used (WebAssembly 2.0, its SIMD opcodes after 0xfd)
const simd = (op: number) => [0xfd, ...leb(op)];
const I = {
  get: (i: number) => [0x20, ...leb(i)],
  set: (i: number) => [0x21, ...leb(i)],
  tee: (i: number) => [0x22, ...leb(i)],
  i32: (n: number) => [0x41, ...sleb(n)],
  add: [0x6a],
  mul: [0x6c],
  shrU: [0x76],
  ltU: [0x49],
  eqz: [0x45],
  load: (offset = 0) => [...simd(0x00), 0x04, ...leb(offset)],
  store: [...simd(0x0b), 0x04, 0x00],
  store64: [...simd(0x5b), 0x03, 0x00, 0x00],
  const: (bytes: number[]) => [...simd(0x0c), ...bytes],
  shuffle: (lanes: number[]) => [...simd(0x0d), ...lanes],
  swizzle: simd(0x0e),
  splat: simd(0x11),
  narrow8: simd(0x66),
  narrow16: simd(0x86),
  shrS: simd(0xac),
  shrUx: simd(0xad),
  addx: simd(0xae),
  mulx: simd(0xb5),
};
/** Picks byte k of each 4-byte pixel into a 32-bit lane (index 16 or more gives 0). */
const channel = (k: number) => [0, 1, 2, 3].flatMap((p) => [p * 4 + k, 16, 16, 16]);
const splat = (n: number) => [...I.i32(n), ...I.splat];

/** The module's bytes: one memory, imported, and `convert`. */
export function simdModule(): Uint8Array<ArrayBuffer> {
  // locals: 0 w, 1 h, 2 x1 (params); i32: 3 y, 4 x, 5 top, 6 bottom, 7 yTop, 8 yBot, 9 uv, 10 size, 11 vOff, 12 out;
  // the v128s from 13. The pixels are at 0, the Y plane at out = size * 4, U and V after it.
  const W = 0, H = 1, X1 = 2, Y = 3, X = 4, TOP = 5, BOT = 6, YT = 7, YB = 8, UV = 9, SIZE = 10, VOFF = 11, OUT = 12;
  const I32_LOCALS = 10;
  let next = 13;
  const v = () => next++;
  const R = [v(), v(), v(), v()], G = [v(), v(), v(), v()], B = [v(), v(), v(), v()];
  const Yv = [v(), v(), v(), v()];
  const sum = { r: [v(), v(), v(), v()], g: [v(), v(), v(), v()], b: [v(), v(), v(), v()] };
  const cR = [v(), v()], cG = [v(), v()], cB = [v(), v()];
  const MR = v(), MG = v(), MB = v(), HALF = v(), Y16 = v(), C128 = v(), TWO = v();
  const coef = (c: readonly number[]) => [v(), v(), v()].map((l, i) => ({ l, n: c[i] }));
  const KY = coef(BT709.y), KU = coef(BT709.cb), KV = coef(BT709.cr);
  const v128Count = next - 13;

  const body: number[] = [];
  const emit = (...xs: number[][]) => xs.forEach((x) => body.push(...x));
  // the constants, once
  emit(I.const(channel(0)), I.set(MR), I.const(channel(1)), I.set(MG), I.const(channel(2)), I.set(MB));
  emit(splat(32768), I.set(HALF), splat(16), I.set(Y16), splat(128), I.set(C128), splat(2), I.set(TWO));
  for (const k of [...KY, ...KU, ...KV]) emit(splat(k.n), I.set(k.l));
  emit(I.get(W), I.get(H), I.mul, I.set(SIZE));
  emit(I.get(SIZE), I.i32(2), I.shrU, I.set(VOFF));
  emit(I.get(SIZE), I.i32(2), [0x74], I.set(OUT));
  // Y = 16 + ((YR r + YG g + YB b + 2^15) >> 16), four pixels in one value
  const dot = (k: { l: number }[], r: number, g: number, b: number, plus: number) =>
    emit(I.get(r), I.get(k[0].l), I.mulx, I.get(g), I.get(k[1].l), I.mulx, I.addx, I.get(b), I.get(k[2].l), I.mulx, I.addx, I.get(HALF), I.addx, I.i32(16), I.shrS, I.get(plus), I.addx);

  // for (y = 0; y < h; y += 2)
  emit(I.i32(0), I.set(Y));
  emit([0x02, 0x40], [0x03, 0x40]); // block, loop
  emit(I.get(Y), I.get(H), I.ltU, I.eqz, [0x0d, 0x01]); // br_if out
  emit(I.get(Y), I.get(W), I.mul, I.set(YT)); // y * w: the top row's first pixel
  emit(I.get(YT), I.get(W), I.add, I.set(YB));
  emit(I.get(OUT), I.get(SIZE), I.add, I.get(Y), I.i32(1), I.shrU, I.get(W), I.i32(1), I.shrU, I.mul, I.add, I.set(UV)); // out + size + (y/2) * (w/2)
  emit(I.i32(0), I.set(X));
  emit([0x02, 0x40], [0x03, 0x40]);
  emit(I.get(X), I.get(X1), I.ltU, I.eqz, [0x0d, 0x01]);
  emit(I.get(YT), I.get(X), I.add, I.i32(2), [0x74], I.set(TOP)); // (y * w + x) * 4 (shl)
  emit(I.get(YB), I.get(X), I.add, I.i32(2), [0x74], I.set(BOT));
  for (const [row, base, out] of [[0, TOP, YT], [1, BOT, YB]] as const) {
    for (let k = 0; k < 4; k++) {
      emit(I.get(base), I.load(k * 16));
      // the load stays on the stack for three swizzles: kept in R[k] first, then read again
      emit(I.tee(R[k]), I.get(MG), I.swizzle, I.set(G[k]));
      emit(I.get(R[k]), I.get(MB), I.swizzle, I.set(B[k]));
      emit(I.get(R[k]), I.get(MR), I.swizzle, I.set(R[k]));
      dot(KY, R[k], G[k], B[k], Y16);
      emit(I.set(Yv[k]));
      if (row === 0) emit(I.get(R[k]), I.set(sum.r[k]), I.get(G[k]), I.set(sum.g[k]), I.get(B[k]), I.set(sum.b[k]));
      else emit(I.get(sum.r[k]), I.get(R[k]), I.addx, I.set(sum.r[k]), I.get(sum.g[k]), I.get(G[k]), I.addx, I.set(sum.g[k]), I.get(sum.b[k]), I.get(B[k]), I.addx, I.set(sum.b[k]));
    }
    // sixteen Y bytes: 32-bit lanes to 16 to 8, exact as every value is 16 to 235
    emit(I.get(OUT), I.get(out), I.add, I.get(X), I.add);
    emit(I.get(Yv[0]), I.get(Yv[1]), I.narrow16, I.get(Yv[2]), I.get(Yv[3]), I.narrow16, I.narrow8, I.store);
  }
  // each 2 by 2 block: the columns' sums added in pairs, averaged with rounding, then Cb and Cr
  const evens = [0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27];
  const odds = [4, 5, 6, 7, 12, 13, 14, 15, 20, 21, 22, 23, 28, 29, 30, 31];
  for (const [ch, out] of [['r', cR], ['g', cG], ['b', cB]] as const) {
    for (let half = 0; half < 2; half++) {
      const a = sum[ch][half * 2], b = sum[ch][half * 2 + 1];
      emit(I.get(a), I.get(b), I.shuffle(evens), I.get(a), I.get(b), I.shuffle(odds), I.addx, I.get(TWO), I.addx, I.i32(2), I.shrUx, I.set(out[half]));
    }
  }
  for (const [k, off] of [[KU, 0], [KV, VOFF]] as const) {
    emit(I.get(UV), I.get(X), I.i32(1), I.shrU, I.add);
    if (off) emit(I.get(VOFF), I.add);
    dot(k, cR[0], cG[0], cB[0], C128);
    dot(k, cR[1], cG[1], cB[1], C128);
    emit(I.narrow16, I.const(new Array(16).fill(0)), I.narrow8, I.store64);
  }
  emit(I.get(X), I.i32(16), I.add, I.set(X), [0x0c, 0x00], [0x0b, 0x0b]); // x += 16; br loop; end loop; end block
  emit(I.get(Y), I.i32(2), I.add, I.set(Y), [0x0c, 0x00], [0x0b, 0x0b]);
  emit([0x0b]);

  const locals = [[...leb(I32_LOCALS), 0x7f], [...leb(v128Count), 0x7b]];
  const code = [...vec(locals), ...body];
  const bytes = [
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ...section(1, vec([[0x60, ...vec([[0x7f], [0x7f], [0x7f]]), 0x00]])), // (i32, i32, i32) -> ()
    ...section(2, vec([[...name('env'), ...name('memory'), 0x02, 0x00, 0x01]])), // memory, at least one page
    ...section(3, vec([[0x00]])),
    ...section(7, vec([[...name('convert'), 0x00, 0x00]])),
    ...section(10, vec([[...leb(code.length), ...code]])),
  ];
  return new Uint8Array(bytes);
}

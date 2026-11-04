// code.ts blurPixels as WebAssembly with 128-bit lanes, one pixel's four channels at a time, for a computer without a
// usable graphics chip: the same whole-number arithmetic, so the same bytes, where plain code took the blurred cross
// from 175 to 626 ms a frame (measured on 2026-11-04 with no chip). Every step's result is a byte (the reduction's
// average, each pass's rounded sum), so the pictures between steps are kept as bytes; only the sums of one line are
// wider. The loops along a line are WebAssembly, written instruction by instruction as simd.ts is; which lines, in
// which order, is plain code here, so a pass down the picture runs along its rows, the order memory holds them in.
// A box's quotient, and premultiplying and unpremultiplying, are worked out in 32-bit floats: each dividend is below
// 2^24 and each divisor at most 255, so the float quotient cut to a whole number is the exact one.
// tests/studio-effect-kernels.test.mjs holds the two equal byte for byte. It works in the memory simd.ts's colour works
// in, so a clip with both is copied in once. Pure apart from the module it compiles.
import { reduced, type BlurPlan, type ColourPlan } from './plan.ts';
import { colourInPlace, I, lanesMemory, leb, memoryImport, name, roomFor, section, simd, vec } from './simd.ts';

const T = { i32: 0x7f, v128: 0x7b } as const;
const X = {
  tee: (i: number) => [0x22, ...leb(i)],
  sub: [0x6b],
  and: [0x71],
  ltU: [0x49],
  leU: [0x4d],
  selectI: [0x1b],
  loadI32: (offset: number) => [0x28, 0x02, ...leb(offset)],
  /** Four bytes at the address on the stack as four 32-bit lanes. */
  pixel: [...simd(0x5c), 0x02, 0x00, ...simd(0x89), ...simd(0xa9)],
  /** One 32-bit word at the address on the stack in every lane. */
  splat32: (offset: number) => [...simd(0x09), 0x02, ...leb(offset)],
  divF: simd(0xe7),
  narrow32: simd(0x86),
  narrow16: simd(0x66),
  /** The low four bytes of a vector to the address below it. */
  store32: [...simd(0x5a), 0x02, 0x00, 0x00],
  /** A pixel's opacity (lane 3) in every lane. */
  opacity: [...simd(0x0d), ...[0, 1, 2, 3].flatMap(() => [12, 13, 14, 15])],
  allTrue: simd(0xa3),
  /** A 16-byte constant of four 32-bit lanes. */
  lanes: (l: [number, number, number, number]) => [...simd(0x0c), ...new Uint8Array(Int32Array.from(l).buffer)],
};

/** while (cond) { body }: `cond` leaves an i32, true to go on. */
const loop = (cond: number[], body: number[]) => [0x02, 0x40, 0x03, 0x40, ...cond, 0x45, 0x0d, 0x01, ...body, 0x0c, 0x00, 0x0b, 0x0b];
/** if (cond) { body } */
const when = (cond: number[], body: number[]) => [...cond, 0x04, 0x40, ...body, 0x0b];
/** local += by */
const bump = (local: number, by: number) => [...I.get(local), ...I.i32(by), ...I.add, ...I.set(local)];
/** The lanes in `t` (0 to 255 each) as four bytes, left on the stack as a vector whose low word holds them. */
const bytes = (t: number) => [...X.tee(t), ...I.get(t), ...X.narrow32, ...X.tee(t), ...I.get(t), ...X.narrow16];
/** a < b, both locals, unsigned */
const below = (a: number, b: number) => [...I.get(a), ...I.get(b), ...X.ltU];

type Fn = { name: string; params: number; locals: number[]; code: number[] };

/** Each pixel's opacity byte, four pixels at a time. */
const OPAQUE = X.lanes([-0x1000000, -0x1000000, -0x1000000, -0x1000000]);

/**
 * A loop over the pixels from local `g` to local 1 in fours, skipping four that are all opaque, and `each` for every
 * pixel of the rest, at local `p`, before local `until`.
 */
const unlessOpaque = (g: number, p: number, until: number, each: number[]) =>
  loop(below(g, 1), [
    ...I.get(g), ...I.load, ...OPAQUE, ...I.and, ...OPAQUE, ...I.eq, ...X.allTrue,
    0x45, 0x04, 0x40,
    // the lesser of g + 16 and the end
    ...I.get(g), ...I.i32(16), ...I.add, ...I.get(1), ...I.get(g), ...I.i32(16), ...I.add, ...I.get(1), ...X.ltU, ...X.selectI, ...I.set(until),
    ...I.get(g), ...I.set(p),
    ...loop(below(p, until), [...each, ...bump(p, 4)]),
    0x0b,
    ...bump(g, 16),
  ]);

const ALPHA = X.lanes([0, 0, 0, -1]);

const FNS: Fn[] = [
  {
    // premultiplied(start, end): straight colour to premultiplied, in place, as code.ts premultiply rounds it
    name: 'premultiplied',
    params: 2,
    // 2 g, 3 p, 4 until (i32); 5 x, 6 t (v128)
    locals: [T.i32, T.i32, T.i32, T.v128, T.v128],
    code: [
      ...I.get(0), ...I.set(2),
      ...unlessOpaque(2, 3, 4, [
        ...I.get(3),
        ...I.get(3), ...X.pixel, ...X.tee(5), ...I.get(5), ...I.get(5), ...X.opacity, ...I.mulx, ...I.i32(127), ...I.splat, ...I.addx,
        ...I.convertF, ...I.f32(255), ...I.splatF, ...X.divF, ...I.truncF,
        // the opacity as it was
        ...I.set(6), ...I.get(5), ...I.get(6), ...ALPHA, ...I.select,
        ...bytes(6), ...X.store32,
      ]),
    ],
  },
  {
    // straight(start, end): premultiplied to straight colour, in place, as code.ts unpremultiply rounds it
    name: 'straight',
    params: 2,
    // 2 g, 3 p, 4 until (i32); 5 x, 6 a, 7 t (v128)
    locals: [T.i32, T.i32, T.i32, T.v128, T.v128, T.v128],
    code: [
      ...I.get(0), ...I.set(2),
      ...unlessOpaque(2, 3, 4, [
        ...I.get(3),
        ...I.get(3), ...X.pixel, ...X.tee(5), ...I.get(5), ...X.opacity, ...I.set(6),
        // (p * 255 + (a >> 1)) / a, at most 255; clear where a is 0
        ...I.get(5), ...I.i32(255), ...I.splat, ...I.mulx, ...I.get(6), ...I.i32(1), ...I.shrU, ...I.addx, ...I.convertF,
        ...I.get(6), ...I.convertF, ...X.divF, ...I.truncF, ...I.i32(255), ...I.splat, ...I.minS,
        ...I.set(7), ...I.get(5), ...I.get(7), ...ALPHA, ...I.select,
        ...I.set(7), ...I.i32(0), ...I.splat, ...I.get(7), ...I.get(6), ...I.i32(0), ...I.splat, ...I.eq, ...I.select,
        ...bytes(7), ...X.store32,
      ]),
    ],
  },
  {
    // cells(acc, src, end, n4): the pixels from src to end summed into acc's cells, n pixels (n4 bytes) to a cell
    name: 'cells',
    params: 4,
    locals: [T.i32, T.v128],
    code: loop(below(1, 2), [
      // the cell's end: the lesser of src + n4 and end
      ...I.get(1), ...I.get(3), ...I.add, ...I.get(2), ...I.get(1), ...I.get(3), ...I.add, ...I.get(2), ...X.ltU, ...X.selectI, ...I.set(4),
      ...I.get(0), ...I.load, ...I.set(5),
      ...loop(below(1, 4), [...I.get(5), ...I.get(1), ...X.pixel, ...I.addx, ...I.set(5), ...bump(1, 4)]),
      ...I.get(0), ...I.get(5), ...I.store,
      ...bump(0, 16),
    ]),
  },
  {
    // shifted(acc, dst, end, shift): each cell's sum cut by shift, as bytes from dst to end
    name: 'shifted',
    params: 4,
    locals: [T.v128],
    code: loop(below(1, 2), [
      ...I.get(1), ...I.get(0), ...I.load, ...I.get(3), ...I.shrU, ...bytes(4), ...X.store32,
      ...bump(0, 16), ...bump(1, 4),
    ]),
  },
  {
    // weighed(acc, src, end, weight): acc += each pixel from src to end times weight
    name: 'weighed',
    params: 4,
    locals: [T.v128],
    code: [
      ...I.get(3), ...I.splat, ...I.set(4),
      ...loop(below(1, 2), [
        ...I.get(0), ...I.get(0), ...I.load, ...I.get(1), ...X.pixel, ...I.get(4), ...I.mulx, ...I.addx, ...I.store,
        ...bump(0, 16), ...bump(1, 4),
      ]),
    ],
  },
  {
    // rounded(acc, dst, end): (acc + 32768) >> 16, as bytes from dst to end
    name: 'rounded',
    params: 3,
    locals: [T.v128, T.v128],
    code: [
      ...I.i32(32768), ...I.splat, ...I.set(3),
      ...loop(below(1, 2), [
        ...I.get(1), ...I.get(0), ...I.load, ...I.get(3), ...I.addx, ...I.i32(16), ...I.shrU, ...bytes(4), ...X.store32,
        ...bump(0, 16), ...bump(1, 4),
      ]),
    ],
  },
  {
    // boxAlong(src, dst, len, r): one line of len pixels, each the box of 2r + 1 around it, transparent outside
    name: 'boxAlong',
    params: 4,
    // 4 j, 5 k (i32); 6 sum, 7 wv, 8 two, 9 t (v128)
    locals: [T.i32, T.i32, T.v128, T.v128, T.v128, T.v128],
    code: [
      ...I.get(3), ...I.i32(1), ...[0x74], ...I.i32(1), ...I.add, ...I.splat, ...I.set(7),
      ...I.get(7), ...I.convertF, ...I.get(7), ...I.convertF, ...I.addF, ...I.set(8),
      // the first r + 1 pixels
      ...I.i32(0), ...I.set(4),
      ...loop([...I.get(4), ...I.get(3), ...X.leU, ...I.get(4), ...I.get(2), ...X.ltU, ...X.and], [
        ...I.get(6), ...I.get(0), ...I.get(4), ...I.i32(2), ...[0x74], ...I.add, ...X.pixel, ...I.addx, ...I.set(6),
        ...bump(4, 1),
      ]),
      ...I.i32(0), ...I.set(5),
      ...loop(below(5, 2), [
        // (2 * sum + w) / (2 * w)
        ...I.get(1), ...I.get(5), ...I.i32(2), ...[0x74], ...I.add,
        ...I.get(6), ...I.get(6), ...I.addx, ...I.get(7), ...I.addx, ...I.convertF, ...I.get(8), ...X.divF, ...I.truncF,
        ...bytes(9), ...X.store32,
        // the pixel r + 1 ahead comes in, the one r behind goes out
        ...when([...I.get(5), ...I.get(3), ...I.add, ...I.i32(1), ...I.add, ...I.get(2), ...X.ltU], [
          ...I.get(6), ...I.get(0), ...I.get(5), ...I.get(3), ...I.add, ...I.i32(1), ...I.add, ...I.i32(2), ...[0x74], ...I.add, ...X.pixel, ...I.addx, ...I.set(6),
        ]),
        ...when([...I.get(5), ...I.get(3), ...I.geU], [
          ...I.get(6), ...I.get(0), ...I.get(5), ...I.get(3), ...X.sub, ...I.i32(2), ...[0x74], ...I.add, ...X.pixel, ...I.subx, ...I.set(6),
        ]),
        ...bump(5, 1),
      ]),
    ],
  },
  {
    // added(sums, src, end): sums += each pixel from src to end
    name: 'added',
    params: 3,
    locals: [],
    code: loop(below(1, 2), [...I.get(0), ...I.get(0), ...I.load, ...I.get(1), ...X.pixel, ...I.addx, ...I.store, ...bump(0, 16), ...bump(1, 4)]),
  },
  {
    // taken(sums, src, end): sums -= each pixel from src to end
    name: 'taken',
    params: 3,
    locals: [],
    code: loop(below(1, 2), [...I.get(0), ...I.get(0), ...I.load, ...I.get(1), ...X.pixel, ...I.subx, ...I.store, ...bump(0, 16), ...bump(1, 4)]),
  },
  {
    // boxed(sums, dst, end, width): (2 * sums + width) / (2 * width), as bytes from dst to end
    name: 'boxed',
    params: 4,
    locals: [T.v128, T.v128, T.v128],
    code: [
      ...I.get(3), ...I.splat, ...I.set(4),
      ...I.get(4), ...I.convertF, ...I.get(4), ...I.convertF, ...I.addF, ...I.set(5),
      ...loop(below(1, 2), [
        ...I.get(1), ...I.get(0), ...I.load, ...I.get(0), ...I.load, ...I.addx, ...I.get(4), ...I.addx, ...I.convertF, ...I.get(5), ...X.divF, ...I.truncF,
        ...bytes(6), ...X.store32,
        ...bump(0, 16), ...bump(1, 4),
      ]),
    ],
  },
  {
    // across(src, cols, into, end): into = wa * src[a] + wb * src[b], each column's a, b (byte offsets), wa and wb at cols
    name: 'across',
    params: 4,
    locals: [],
    code: loop(below(2, 3), [
      ...I.get(2),
      ...I.get(0), ...I.get(1), ...X.loadI32(0), ...I.add, ...X.pixel, ...I.get(1), ...X.splat32(8), ...I.mulx,
      ...I.get(0), ...I.get(1), ...X.loadI32(4), ...I.add, ...X.pixel, ...I.get(1), ...X.splat32(12), ...I.mulx,
      ...I.addx, ...I.store,
      ...bump(1, 16), ...bump(2, 16),
    ]),
  },
  {
    // blend(lo, hi, dst, end, wy0, wy1, half, total): (wy0 * lo + wy1 * hi + half) >> total, as bytes from dst to end
    name: 'blend',
    params: 8,
    locals: [T.v128, T.v128, T.v128, T.v128],
    code: [
      ...I.get(4), ...I.splat, ...I.set(8),
      ...I.get(5), ...I.splat, ...I.set(9),
      ...I.get(6), ...I.splat, ...I.set(10),
      ...loop(below(2, 3), [
        ...I.get(2),
        ...I.get(0), ...I.load, ...I.get(8), ...I.mulx, ...I.get(1), ...I.load, ...I.get(9), ...I.mulx, ...I.addx, ...I.get(10), ...I.addx,
        ...I.get(7), ...I.shrU, ...bytes(11), ...X.store32,
        ...bump(0, 16), ...bump(1, 16), ...bump(2, 4),
      ]),
    ],
  },
];

/** Locals grouped as the code section declares them: runs of one type. */
function localsOf(types: number[]): number[] {
  const runs: number[][] = [];
  for (const t of types) {
    const last = runs[runs.length - 1];
    if (last && last[1] === t) last[0]++;
    else runs.push([1, t]);
  }
  return vec(runs);
}

/** The module: memory imported as `env.mem`, each function of FNS exported by its name. */
export function blurModule(): Uint8Array<ArrayBuffer> {
  const types = section(1, vec(FNS.map((f) => [0x60, ...vec(Array.from({ length: f.params }, () => [T.i32])), 0x00])));
  const funcs = section(3, vec(FNS.map((_, i) => leb(i))));
  const exports = section(7, vec(FNS.map((f, i) => [...name(f.name), 0x00, ...leb(i)])));
  const codes = section(10, vec(FNS.map((f) => {
    const body = [...localsOf(f.locals), ...f.code, 0x0b];
    return [...leb(body.length), ...body];
  })));
  return Uint8Array.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, ...types, ...memoryImport(), ...funcs, ...exports, ...codes]);
}

type Kernel = {
  mem: WebAssembly.Memory;
  premultiplied: (start: number, end: number) => void;
  straight: (start: number, end: number) => void;
  cells: (acc: number, src: number, end: number, n4: number) => void;
  shifted: (acc: number, dst: number, end: number, shift: number) => void;
  weighed: (acc: number, src: number, end: number, weight: number) => void;
  rounded: (acc: number, dst: number, end: number) => void;
  boxAlong: (src: number, dst: number, len: number, r: number) => void;
  added: (sums: number, src: number, end: number) => void;
  taken: (sums: number, src: number, end: number) => void;
  boxed: (sums: number, dst: number, end: number, width: number) => void;
  across: (src: number, cols: number, into: number, end: number) => void;
  blend: (lo: number, hi: number, dst: number, end: number, wy0: number, wy1: number, half: number, total: number) => void;
};
/** Undefined until first asked; null where WebAssembly with 128-bit lanes is missing or refused. */
let made: Kernel | null | undefined;

function kernel(): Kernel | null {
  if (made !== undefined) return made;
  made = null;
  try {
    const mem = lanesMemory();
    if (!mem) return null;
    const bytes = blurModule();
    if (!WebAssembly.validate(bytes)) return null;
    made = { ...(new WebAssembly.Instance(new WebAssembly.Module(bytes), { env: { mem } }).exports as unknown as Kernel), mem };
  } catch {
    made = null;
  }
  return made;
}

/** Below this address the memory is simd.ts's (the colour plan, and its own pixels). */
const BASE = 1024;

/**
 * code.ts blurPixels in lanes: the same arguments, the same bytes; null where the module is not offered or `pad` is not
 * a whole number of the plan's cells. With `straight`, `px` is straight colour as getImageData gives it, and so is the
 * result: code.ts toPremultiplied before and toStraight after, in the same lanes. With `borrowed`, the result is the
 * module's own memory, good until the next blur, for putImageData at once. With `colour`, straight colour is first
 * coloured as code.ts colourStraight colours it, in simd.ts's lanes.
 */
export function blurLanes(px: Uint8ClampedArray, w: number, h: number, plan: BlurPlan, pad = 0, o: { straight?: boolean; borrowed?: boolean; colour?: ColourPlan | null } = {}): Uint8ClampedArray<ArrayBuffer> | null {
  const { n, k, radius, weights, boxes } = plan;
  if (pad % n) return null;
  const m = kernel();
  if (!m) return null;
  const rw = reduced(w + 2 * pad, n);
  const rh = reduced(h + 2 * pad, n);
  const line = rw * 4;
  // the picture (and at the end the result), two reduced pictures in turn, one line of sums, and the enlargement's
  // two lines and columns
  const IN = BASE;
  // the picture's bytes rounded up to 16 for the colour, whose last few lanes fall in A before A is written
  const A = IN + Math.ceil((w * h) / 4) * 16;
  const B = A + rw * rh * 4;
  const SUMS = B + rw * rh * 4;
  const LO = SUMS + Math.max(rw, w) * 16;
  const HI = LO + w * 16;
  const COLS = HI + w * 16;
  roomFor(m.mem, COLS + w * 16);
  const mem = new Uint8Array(m.mem.buffer);
  mem.set(px, IN);
  if (o.colour && !colourInPlace(IN, A, o.colour)) return null;
  if (o.straight) m.premultiplied(IN, IN + w * h * 4);
  const clear = (at: number, count: number) => mem.fill(0, at, at + count);
  // 1. reduce into A; at full size a copy into the middle of the margin
  if (n === 1) {
    clear(A, rw * rh * 4);
    for (let y = 0; y < h; y++) mem.copyWithin(A + ((y + pad) * rw + pad) * 4, IN + y * w * 4, IN + (y + 1) * w * 4);
  } else {
    const skip = (pad / n) * 16;
    for (let j = 0; j < rh; j++) {
      clear(SUMS, rw * 16);
      for (let yy = Math.max(0, j * n - pad), end = Math.min(h, j * n - pad + n); yy < end; yy++) m.cells(SUMS + skip, IN + yy * w * 4, IN + (yy + 1) * w * 4, n * 4);
      m.shifted(SUMS, A + j * line, A + (j + 1) * line, 2 * k);
    }
  }
  // 2. across then down
  let src = A;
  let dst = B;
  const swap = () => ([src, dst] = [dst, src]);
  if (boxes) {
    for (const width of boxes) {
      const r = (width - 1) >> 1;
      for (let y = 0; y < rh; y++) m.boxAlong(src + y * line, dst + y * line, rw, r);
      swap();
    }
    for (const width of boxes) {
      const r = (width - 1) >> 1;
      clear(SUMS, rw * 16);
      for (let j = 0; j <= r && j < rh; j++) m.added(SUMS, src + j * line, src + (j + 1) * line);
      for (let y = 0; y < rh; y++) {
        m.boxed(SUMS, dst + y * line, dst + (y + 1) * line, width);
        if (y + r + 1 < rh) m.added(SUMS, src + (y + r + 1) * line, src + (y + r + 2) * line);
        if (y >= r) m.taken(SUMS, src + (y - r) * line, src + (y - r + 1) * line);
      }
      swap();
    }
  } else if (radius) {
    for (let y = 0; y < rh; y++) {
      clear(SUMS, rw * 16);
      for (let j = -radius; j <= radius; j++) {
        const lo = Math.max(0, -j);
        const hi = Math.min(rw, rw - j);
        if (hi > lo) m.weighed(SUMS + lo * 16, src + y * line + (lo + j) * 4, src + y * line + (hi + j) * 4, weights[j + radius]);
      }
      m.rounded(SUMS, dst + y * line, dst + (y + 1) * line);
    }
    swap();
    for (let y = 0; y < rh; y++) {
      clear(SUMS, rw * 16);
      for (let j = -radius; j <= radius; j++) {
        const yy = y + j;
        if (yy >= 0 && yy < rh) m.weighed(SUMS, src + yy * line, src + (yy + 1) * line, weights[j + radius]);
      }
      m.rounded(SUMS, dst + y * line, dst + (y + 1) * line);
    }
    swap();
  }
  // 3. enlarge into the picture's place; at full size the middle of the margin, copied
  if (n === 1) {
    for (let y = 0; y < h; y++) mem.copyWithin(IN + y * w * 4, src + ((y + pad) * rw + pad) * 4, src + ((y + pad) * rw + pad + w) * 4);
  } else {
    const two = 2 * n;
    const mask = two - 1;
    const sh = k + 1;
    const cols = new Int32Array(m.mem.buffer, COLS, w * 4);
    for (let x = 0; x < w; x++) {
      const u = 2 * (x + pad) + 1 - n + two;
      const i0 = (u >> sh) - 1;
      cols[x * 4] = Math.min(rw - 1, Math.max(0, i0)) * 4;
      cols[x * 4 + 1] = Math.min(rw - 1, Math.max(0, i0 + 1)) * 4;
      cols[x * 4 + 2] = two - (u & mask);
      cols[x * 4 + 3] = u & mask;
    }
    let lo = LO;
    let hi = HI;
    let loRow = -1;
    let hiRow = -1;
    for (let y = 0; y < h; y++) {
      const v = 2 * (y + pad) + 1 - n + two;
      const j0 = (v >> sh) - 1;
      const r0 = Math.min(rh - 1, Math.max(0, j0));
      const r1 = Math.min(rh - 1, Math.max(0, j0 + 1));
      if (r0 !== loRow) {
        if (r0 === hiRow) {
          [lo, hi] = [hi, lo];
          hiRow = loRow;
        } else m.across(src + r0 * line, COLS, lo, lo + w * 16);
        loRow = r0;
      }
      if (r1 !== hiRow) {
        m.across(src + r1 * line, COLS, hi, hi + w * 16);
        hiRow = r1;
      }
      const wy1 = v & mask;
      m.blend(lo, hi, IN + y * w * 4, IN + (y + 1) * w * 4, two - wy1, wy1, 2 * n * n, 2 * sh);
    }
  }
  if (o.straight) m.straight(IN, IN + w * h * 4);
  return o.borrowed ? new Uint8ClampedArray(m.mem.buffer, IN, w * h * 4) : new Uint8ClampedArray(m.mem.buffer.slice(IN, IN + w * h * 4));
}

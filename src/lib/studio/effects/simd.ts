// code.ts colourStraight for opaque pixels as WebAssembly with 128-bit lanes, four pixels at a time, for a computer
// without a usable graphics chip: the same whole-number arithmetic, so the same bytes, where plain code took about
// 66 ms a 1080p frame (measured on 2026-11-04 with no chip). The table's steps are float32 multiplies and adds, which
// WebAssembly rounds exactly as Math.fround does in plan.ts; the matrix is 32-bit integers. The module is written here
// instruction by instruction, as yuv-simd.ts is, so what it does can be read: `run(start, end)` works the RGBA bytes
// from `start` to `end` (a multiple of 16 apart) in its own memory, with the plan written at address 0, and leaves every
// pixel that is not opaque as it was, for code.ts to finish. tests/studio-effect-kernels.test.mjs holds the two equal
// byte for byte. Pure apart from the module it compiles.
import type { ColourPlan } from './plan.ts';

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
const f32 = (x: number) => [...new Uint8Array(Float32Array.of(x).buffer)];

// the instructions used (WebAssembly 2.0, its SIMD opcodes after 0xfd)
const simd = (op: number) => [0xfd, ...leb(op)];
const I = {
  get: (i: number) => [0x20, ...leb(i)],
  set: (i: number) => [0x21, ...leb(i)],
  i32: (n: number) => [0x41, ...sleb(n)],
  f32: (x: number) => [0x43, ...f32(x)],
  loadI32: (offset: number) => [0x28, 0x02, ...leb(offset)],
  loadF32: (offset: number) => [0x2a, 0x02, ...leb(offset)],
  add: [0x6a],
  geU: [0x4f],
  gtU: [0x4b],
  load: [...simd(0x00), 0x04, 0x00],
  store: [...simd(0x0b), 0x04, 0x00],
  splat: simd(0x11),
  splatF: simd(0x13),
  eq: simd(0x37),
  and: simd(0x4e),
  or: simd(0x50),
  select: simd(0x52),
  floor: simd(0x68),
  shl: simd(0xab),
  shrS: simd(0xac),
  shrU: simd(0xad),
  addx: simd(0xae),
  subx: simd(0xb1),
  mulx: simd(0xb5),
  minS: simd(0xb6),
  maxS: simd(0xb8),
  addF: simd(0xe4),
  mulF: simd(0xe6),
  minF: simd(0xe8),
  maxF: simd(0xe9),
  truncF: simd(0xf8),
  convertF: simd(0xfa),
};

/** Where the plan is written, and where the pixels start. */
export const PLAN_AT = 0;
export const PIXELS_AT = 128;

// locals: start, end (params), p, steps, useMatrix (i32); then v128 locals by name
const V = ['v', 'r', 'g', 'b', 's0', 'c0', 's1', 'c1', 'm0', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'o0', 'o1', 'o2', 'k255', 'kA', 'kHalf', 'kLow', 'kOne', 'f0', 'f255', 'q', 'nr', 'ng'] as const;
const L = (n: (typeof V)[number]) => 5 + V.indexOf(n);

/** One table step on channel `x`: convert, multiply, add, cut, keep within 0 to 255, back to integers. */
const tableStep = (x: number, s: number, c: number) => [...I.get(x), ...I.convertF, ...I.get(s), ...I.mulF, ...I.get(c), ...I.addF, ...I.floor, ...I.get(L('f0')), ...I.maxF, ...I.get(L('f255')), ...I.minF, ...I.truncF, ...I.set(x)];

/** A sum in 1/65536 (on the stack) to a byte: rounded to the nearest, an exact half to the even neighbour, 0 to 255. */
const toByte = (into: number) => [
  ...I.set(L('q')),
  // tie mask: (s & 65535) == 32768
  ...I.get(L('q')), ...I.get(L('kLow')), ...I.and, ...I.get(L('kHalf')), ...I.eq,
  // (s + 32768) >> 16
  ...I.get(L('q')), ...I.get(L('kHalf')), ...I.addx, ...I.i32(16), ...I.shrS, ...I.set(into),
  // minus (tie and odd)
  ...I.get(into), ...I.get(L('kOne')), ...I.and, ...I.and,
  ...I.set(L('q')), ...I.get(into), ...I.get(L('q')), ...I.subx,
  ...I.i32(0), ...I.splat, ...I.maxS, ...I.get(L('k255')), ...I.minS, ...I.set(into),
];

/** m[a] * r + m[b] * g + m[c] * b + o, then toByte, into `into`. */
const row = (a: string, b: string, c: string, o: string, into: number) => [
  ...I.get(L('r')), ...I.get(L(a as never)), ...I.mulx,
  ...I.get(L('g')), ...I.get(L(b as never)), ...I.mulx, ...I.addx,
  ...I.get(L('b')), ...I.get(L(c as never)), ...I.mulx, ...I.addx,
  ...I.get(L(o as never)), ...I.addx,
  ...toByte(into),
];

function body(): number[] {
  const splatF = (n: string, offset: number) => [...I.i32(PLAN_AT), ...I.loadF32(offset), ...I.splatF, ...I.set(L(n as never))];
  const constI = (n: string, value: number) => [...I.i32(value), ...I.splat, ...I.set(L(n as never))];
  const constF = (n: string, value: number) => [...I.f32(value), ...I.splatF, ...I.set(L(n as never))];
  return [
    // the plan: 0 s0, 4 c0, 8 s1, 12 c1 (float32), 16 steps, 20 use the matrix, 24 to 56 m0 to m8, 60 to 68 o0 to o2
    ...splatF('s0', 0), ...splatF('c0', 4), ...splatF('s1', 8), ...splatF('c1', 12),
    ...I.i32(PLAN_AT), ...I.loadI32(16), ...I.set(3),
    ...I.i32(PLAN_AT), ...I.loadI32(20), ...I.set(4),
    ...['m0', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8'].flatMap((m, i) => [...I.i32(PLAN_AT), ...I.loadI32(24 + 4 * i), ...I.splat, ...I.set(L(m as never))]),
    ...['o0', 'o1', 'o2'].flatMap((o, i) => [...I.i32(PLAN_AT), ...I.loadI32(60 + 4 * i), ...I.splat, ...I.set(L(o as never))]),
    ...constI('k255', 255), ...constI('kA', -0x1000000), ...constI('kHalf', 32768), ...constI('kLow', 65535), ...constI('kOne', 1),
    ...constF('f0', 0), ...constF('f255', 255),
    ...I.get(0), ...I.set(2),
    // block { loop { if p >= end break; ... p += 16; continue } }
    0x02, 0x40, 0x03, 0x40,
    ...I.get(2), ...I.get(1), ...I.geU, 0x0d, 0x01,
    ...I.get(2), ...I.load, ...I.set(L('v')),
    ...I.get(L('v')), ...I.get(L('k255')), ...I.and, ...I.set(L('r')),
    ...I.get(L('v')), ...I.i32(8), ...I.shrU, ...I.get(L('k255')), ...I.and, ...I.set(L('g')),
    ...I.get(L('v')), ...I.i32(16), ...I.shrU, ...I.get(L('k255')), ...I.and, ...I.set(L('b')),
    // the table's steps
    ...I.get(3), ...I.i32(0), ...I.gtU, 0x04, 0x40,
    ...tableStep(L('r'), L('s0'), L('c0')), ...tableStep(L('g'), L('s0'), L('c0')), ...tableStep(L('b'), L('s0'), L('c0')),
    0x0b,
    ...I.get(3), ...I.i32(1), ...I.gtU, 0x04, 0x40,
    ...tableStep(L('r'), L('s1'), L('c1')), ...tableStep(L('g'), L('s1'), L('c1')), ...tableStep(L('b'), L('s1'), L('c1')),
    0x0b,
    // the matrix: r, g and b are read by every row before any is written
    ...I.get(4), 0x04, 0x40,
    ...row('m0', 'm1', 'm2', 'o0', L('nr')), ...row('m3', 'm4', 'm5', 'o1', L('ng')), ...row('m6', 'm7', 'm8', 'o2', L('b')),
    ...I.get(L('nr')), ...I.set(L('r')), ...I.get(L('ng')), ...I.set(L('g')),
    0x0b,
    // back into one word: the opacity kept, red low; a pixel not opaque stays as it was
    ...I.get(2),
    ...I.get(L('v')), ...I.get(L('kA')), ...I.and,
    ...I.get(L('r')), ...I.or,
    ...I.get(L('g')), ...I.i32(8), ...I.shl, ...I.or,
    ...I.get(L('b')), ...I.i32(16), ...I.shl, ...I.or,
    ...I.get(L('v')),
    ...I.get(L('v')), ...I.i32(24), ...I.shrU, ...I.get(L('k255')), ...I.eq,
    ...I.select,
    ...I.store,
    ...I.get(2), ...I.i32(16), ...I.add, ...I.set(2),
    0x0c, 0x00,
    0x0b, 0x0b,
    0x0b,
  ];
}

/** The module: memory exported as `mem`, the function as `run(start, end)`. */
export function colourModule(): Uint8Array<ArrayBuffer> {
  const types = section(1, vec([[0x60, ...vec([[0x7f], [0x7f]]), 0x00]]));
  const funcs = section(3, vec([[0x00]]));
  const memory = section(5, vec([[0x00, 0x01]]));
  const exports = section(7, vec([[...name('run'), 0x00, 0x00], [...name('mem'), 0x02, 0x00]]));
  const locals = vec([[3, 0x7f], [V.length, 0x7b]]);
  const code = body();
  const fn = [...locals, ...code];
  const codes = section(10, vec([[...leb(fn.length), ...fn]]));
  return Uint8Array.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, ...types, ...funcs, ...memory, ...exports, ...codes]);
}

type Kernel = { mem: WebAssembly.Memory; run: (start: number, end: number) => void };
/** Undefined until first asked; null where WebAssembly with 128-bit lanes is missing or refused. */
let made: Kernel | null | undefined;

function kernel(): Kernel | null {
  if (made !== undefined) return made;
  made = null;
  try {
    if (typeof WebAssembly === 'undefined') return null;
    const bytes = colourModule();
    if (!WebAssembly.validate(bytes)) return null;
    // small enough (under 4 KB) to compile at once on the page
    const e = new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports as unknown as Kernel;
    made = { mem: e.mem, run: e.run };
  } catch {
    made = null;
  }
  return made;
}

/**
 * The plan over the opaque pixels of `px` (straight RGBA), four at a time, for the first `done` bytes (a multiple of 16);
 * every other pixel is left as it was. 0 where the module is not offered or the plan is not one it takes.
 */
export function colourOpaque(px: Uint8ClampedArray, plan: ColourPlan): number {
  if (plan.table && !plan.steps.length) return 0;
  const k = kernel();
  if (!k) return 0;
  const done = px.length - (px.length % 16);
  const need = PIXELS_AT + done;
  if (k.mem.buffer.byteLength < need) k.mem.grow(Math.ceil((need - k.mem.buffer.byteLength) / 65536));
  const f = new Float32Array(k.mem.buffer, PLAN_AT, 4);
  const n = new Int32Array(k.mem.buffer, PLAN_AT, 18);
  const st = plan.table ? plan.steps : [];
  f[0] = st[0]?.[0] ?? 1;
  f[1] = st[0]?.[1] ?? 0;
  f[2] = st[1]?.[0] ?? 1;
  f[3] = st[1]?.[1] ?? 0;
  n[4] = st.length;
  n[5] = plan.matrix ? 1 : 0;
  for (let i = 0; i < 9; i++) n[6 + i] = plan.matrix ? plan.matrix[i] : 0;
  for (let i = 0; i < 3; i++) n[15 + i] = plan.offset ? plan.offset[i] : 0;
  const mem = new Uint8Array(k.mem.buffer, PIXELS_AT, done);
  mem.set(px.subarray(0, done));
  k.run(PIXELS_AT, PIXELS_AT + done);
  px.set(mem);
  return done;
}

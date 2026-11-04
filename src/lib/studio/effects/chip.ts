// The effects of plan.ts on the graphics chip, in WebGL2, held equal byte for byte to the plain code (code.ts) by
// qa/studio-effects-parity.cjs: texelFetch reads every pixel without filtering, sums are 32-bit unsigned integers,
// every rounding is an integer shift or division, as squares-gl.ts does for «إخفاء بالمربعات». The picture is taken as
// the canvas keeps it (premultiplied, uploaded unchanged) and nothing is read back: the result is a canvas the caller
// draws. Where WebGL2 is missing, runs without a graphics chip, or its context is lost, it answers null and index.ts
// takes the plain code. Needs OffscreenCanvas, so it runs in a worker too.
import { reduced, type BlurPlan, type ColourPlan, type EffectPlan } from './plan.ts';

const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
uniform sampler2D src;
uniform ivec2 size;
uniform bool toCanvas;
uniform int flip;
uniform ivec2 origin;
out vec4 colour;
uvec4 at(ivec2 p) { return uvec4(round(texelFetch(src, p + origin, 0) * 255.0)); }
// the pixel this fragment writes: textures keep the picture's rows top first, the canvas (flip rows high) bottom first
ivec2 here() { ivec2 p = ivec2(gl_FragCoord.xy); if (toCanvas) p.y = flip - 1 - p.y; return p; }
`;

// A colour plan (code.ts colourPixels): straight colour, the table, the matrix, premultiplied again. Shared by COLOUR
// and by REDUCE, which colours each pixel as it reads it when a clip has both colour and a reduced blur.
const COLOURED = `
uniform usampler2D table;
uniform bool useTable;
uniform bool useMatrix;
uniform ivec3 m0;
uniform ivec3 m1;
uniform ivec3 m2;
uniform ivec3 offset;
uvec4 coloured(uvec4 p) {
  uint a = p.a;
  if (a == 0u) return uvec4(0u);
  uvec3 c = a == 255u ? p.rgb : min(uvec3(255u), (p.rgb * 255u + (a >> 1u)) / a);
  if (useTable) c = uvec3(texelFetch(table, ivec2(int(c.r), 0), 0).r, texelFetch(table, ivec2(int(c.g), 0), 0).r, texelFetch(table, ivec2(int(c.b), 0), 0).r);
  if (useMatrix) {
    ivec3 s = ivec3(c);
    ivec3 v = max(ivec3(0), ivec3(m0.x * s.r + m0.y * s.g + m0.z * s.b, m1.x * s.r + m1.y * s.g + m1.z * s.b, m2.x * s.r + m2.y * s.g + m2.z * s.b) + offset);
    ivec3 q = (v + 32768) >> 16;
    q -= ivec3(equal(v & 65535, ivec3(32768))) * (q & 1);
    c = uvec3(min(ivec3(255), q));
  }
  uvec3 o = a == 255u ? c : (c * a + 127u) / 255u;
  return uvec4(o, a);
}
`;

const COLOUR = `${HEAD}${COLOURED}
void main() {
  colour = vec4(coloured(at(here()))) / 255.0;
}`;

// The reduction: each n by n block summed (outside the picture transparent), cut to a whole number.
const REDUCE = `${HEAD}${COLOURED}
uniform ivec2 area;
uniform int n;
uniform int shift;
uniform int pad;
uniform bool colourFirst;
void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  uvec4 s = uvec4(0u);
  for (int y = 0; y < n; y++) {
    for (int x = 0; x < n; x++) {
      ivec2 q = cell * n + ivec2(x, y) - ivec2(pad);
      if (q.x < 0 || q.y < 0 || q.x >= area.x || q.y >= area.y) continue;
      s += colourFirst ? coloured(at(q)) : at(q);
    }
  }
  colour = vec4(s >> uint(shift)) / 255.0;
}`;

// One direction of the weights, transparent outside, rounded to the nearest.
const WEIGHTS = `${HEAD}
uniform ivec2 dir;
uniform int radius;
uniform int weights[25];
void main() {
  ivec2 p = here();
  uvec4 s = uvec4(0u);
  for (int j = -radius; j <= radius; j++) {
    ivec2 q = p + dir * j;
    if (q.x < 0 || q.y < 0 || q.x >= size.x || q.y >= size.y) continue;
    s += uint(weights[j + radius]) * at(q);
  }
  colour = vec4((s + 32768u) >> 16u) / 255.0;
}`;

// One box of 2r + 1 pixels in one direction, transparent outside, rounded to the nearest (code.ts blurPixels box).
const BOX = `${HEAD}
uniform ivec2 dir;
uniform int r;
void main() {
  ivec2 p = here();
  uvec4 s = uvec4(0u);
  for (int j = -r; j <= r; j++) {
    ivec2 q = p + dir * j;
    if (q.x < 0 || q.y < 0 || q.x >= size.x || q.y >= size.y) continue;
    s += at(q);
  }
  uint w = uint(2 * r + 1);
  colour = vec4((2u * s + w) / (2u * w)) / 255.0;
}`;

// The enlargement: bilinear weights in 1/(2n) steps, the edge repeated, one rounding over the four.
const ENLARGE = `${HEAD}
uniform ivec2 small;
uniform int n;
uniform int sh;
uniform int pad;
void main() {
  ivec2 p = here();
  int two = 2 * n;
  ivec2 uv = 2 * (p + ivec2(pad)) + 1 - n + two;
  ivec2 lo = clamp((uv >> sh) - 1, ivec2(0), small - 1);
  ivec2 hi = clamp(uv >> sh, ivec2(0), small - 1);
  uvec2 w1 = uvec2(uv & (two - 1));
  uvec2 w0 = uvec2(two) - w1;
  uvec4 s = w0.y * (w0.x * at(lo) + w1.x * at(ivec2(hi.x, lo.y))) + w1.y * (w0.x * at(ivec2(lo.x, hi.y)) + w1.x * at(hi));
  colour = vec4((s + uint(2 * n * n)) >> uint(2 * sh)) / 255.0;
}`;

type Program = { program: WebGLProgram; at: (name: string) => WebGLUniformLocation | null };
/** A picture on the chip: `w` by `h` used, in a texture of `cw` by `ch` (fitted), so no frame reallocates it. */
type Target = Room & { tex: WebGLTexture; w: number; h: number };
type Gl = {
  canvas: OffscreenCanvas;
  gl: WebGL2RenderingContext;
  colour: Program;
  reduce: Program;
  weights: Program;
  box: Program;
  enlarge: Program;
  input: Target;
  out: Room;
  table: WebGLTexture;
  frame: WebGLFramebuffer;
  targets: Target[];
  max: number;
};

/** Undefined until first asked; null once WebGL2 proved unusable here. */
let made: Gl | null | undefined;

function program(gl: WebGL2RenderingContext, fragment: string): Program {
  const shader = (type: number, source: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader');
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, shader(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('program');
  const at = new Map<string, WebGLUniformLocation | null>();
  return { program: p, at: (name) => (at.has(name) ? at.get(name)! : (at.set(name, gl.getUniformLocation(p, name)), at.get(name)!)) };
}

function texture(gl: WebGL2RenderingContext): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

function setup(): Gl | null {
  if (made !== undefined) return made;
  made = null;
  if (typeof OffscreenCanvas === 'undefined') return null;
  try {
    const canvas = new OffscreenCanvas(1, 1);
    // a software renderer is refused: without a graphics chip the plain code is the quicker one
    // the drawing buffer is kept and drawn back: handing it over instead (transferToImageBitmap) was measured slower on
    // 2026-11-04, the effects document drawing in 8.25 rather than 6.04 ms a frame in Edge and 8.63 rather than 6.81 on
    // the AMD chip
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false, depth: false, stencil: false, failIfMajorPerformanceCaveat: true });
    if (!gl) return null;
    canvas.addEventListener('webglcontextlost', () => {
      made = null;
    });
    const max = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) as number, ...(gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array));
    const table = texture(gl);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, 256, 1, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, Uint8Array.from({ length: 256 }, (_, i) => i));
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    made = {
      canvas,
      gl,
      colour: program(gl, COLOUR),
      reduce: program(gl, REDUCE),
      weights: program(gl, WEIGHTS),
      box: program(gl, BOX),
      enlarge: program(gl, ENLARGE),
      input: { tex: texture(gl), w: 0, h: 0, cw: 0, ch: 0, over: 0 },
      out: { cw: 1, ch: 1, over: 0 },
      table,
      frame: gl.createFramebuffer()!,
      targets: [],
      max,
    };
  } catch {
    made = null;
  }
  return made;
}

/** Whether this computer works the effects out on its graphics chip. */
export const effectsChip = () => setup() !== null;

/** A size kept for a canvas or texture: `over` counts the requests in a row it was far too large for. */
export type Room = { cw: number; ch: number; over: number };

/**
 * The size `r` must take to hold w by h, or null to keep it: grown to the larger of each side, never following each
 * request (a frame may ask for several sizes, and each change reallocates), and made exactly w by h once it has held
 * more than four times what was asked for 120 requests in a row, since drawing a canvas back copies all of it.
 */
export function fitted(r: Room, w: number, h: number): [number, number] | null {
  r.over = r.cw * r.ch > 4 * w * h ? r.over + 1 : 0;
  if (r.over > 120) {
    r.over = 0;
    r.cw = w;
    r.ch = h;
    return [w, h];
  }
  if (r.cw >= w && r.ch >= h) return null;
  r.cw = Math.max(r.cw, w);
  r.ch = Math.max(r.ch, h);
  return [r.cw, r.ch];
}

/** `t` with room for w by h (fitted). */
function room(gl: WebGL2RenderingContext, t: Target, w: number, h: number): Target {
  if (fitted(t, w, h)) {
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, t.cw, t.ch, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
  t.w = w;
  t.h = h;
  return t;
}

/** Intermediate picture `i`, w by h used. */
function target(s: Gl, i: number, w: number, h: number): Target {
  return room(s.gl, (s.targets[i] ??= { tex: texture(s.gl), w: 0, h: 0, cw: 0, ch: 0, over: 0 }), w, h);
}

/**
 * One pass: `p` reads `from` and writes `size` pixels into `to`, or into the canvas's top left corner when `to` is
 * null (the canvas only grows; the caller takes that corner).
 */
function run(s: Gl, p: Program, from: WebGLTexture, size: [number, number], to: Target | null, set: () => void, origin: [number, number] = [0, 0]) {
  const { gl } = s;
  if (to) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, s.frame);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, to.tex, 0);
    gl.viewport(0, 0, size[0], size[1]);
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, s.canvas.height - size[1], size[0], size[1]);
  }
  gl.useProgram(p.program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, from);
  gl.uniform1i(p.at('src'), 0);
  gl.uniform2i(p.at('size'), size[0], size[1]);
  gl.uniform1i(p.at('toCanvas'), to ? 0 : 1);
  gl.uniform1i(p.at('flip'), s.canvas.height);
  gl.uniform2i(p.at('origin'), origin[0], origin[1]);
  set();
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

/** The colour plan's uniforms on `p` (COLOURED), the table already uploaded. */
function setColour(s: Gl, p: Program, c: ColourPlan) {
  const { gl } = s;
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, s.table);
  gl.uniform1i(p.at('table'), 1);
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(p.at('useTable'), c.table ? 1 : 0);
  gl.uniform1i(p.at('useMatrix'), c.matrix ? 1 : 0);
  const m = c.matrix ?? new Int32Array(9);
  gl.uniform3i(p.at('m0'), m[0], m[1], m[2]);
  gl.uniform3i(p.at('m1'), m[3], m[4], m[5]);
  gl.uniform3i(p.at('m2'), m[6], m[7], m[8]);
  const o = c.offset ?? new Int32Array(3);
  gl.uniform3i(p.at('offset'), o[0], o[1], o[2]);
}

/** A blur of `from`; with `colour`, each pixel is coloured as the reduction reads it (the blur must reduce). */
function blur(s: Gl, b: BlurPlan, from: WebGLTexture, w: number, h: number, pad: number, origin: [number, number], colour: ColourPlan | null = null) {
  const { gl } = s;
  const vw = w + 2 * pad;
  const vh = h + 2 * pad;
  const rw = reduced(vw, b.n);
  const rh = reduced(vh, b.n);
  const direct = b.n === 1 && !pad;
  let src = from;
  if (!direct) {
    const small = target(s, 1, rw, rh);
    run(s, s.reduce, from, [rw, rh], small, () => {
      gl.uniform2i(s.reduce.at('area'), w, h);
      gl.uniform1i(s.reduce.at('n'), b.n);
      gl.uniform1i(s.reduce.at('shift'), 2 * b.k);
      gl.uniform1i(s.reduce.at('pad'), pad);
      gl.uniform1i(s.reduce.at('colourFirst'), colour ? 1 : 0);
      // the table's sampler always on its own unit: an integer and a float sampler may not share one, used or not
      if (colour) setColour(s, s.reduce, colour);
      else {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, s.table);
        gl.uniform1i(s.reduce.at('table'), 1);
        gl.activeTexture(gl.TEXTURE0);
      }
    }, origin);
    src = small.tex;
  }
  // the passes: the weights across then down, or three boxes across then three down; between two pictures in turn, the
  // last onto the canvas when nothing is enlarged
  type Pass = { p: Program; set: () => void };
  const weights = (dir: [number, number]): Pass => ({
    p: s.weights,
    set: () => {
      gl.uniform2i(s.weights.at('dir'), dir[0], dir[1]);
      gl.uniform1i(s.weights.at('radius'), b.radius);
      gl.uniform1iv(s.weights.at('weights'), b.weights);
    },
  });
  const box = (dir: [number, number], width: number): Pass => ({
    p: s.box,
    set: () => {
      gl.uniform2i(s.box.at('dir'), dir[0], dir[1]);
      gl.uniform1i(s.box.at('r'), (width - 1) >> 1);
    },
  });
  const passes: Pass[] = b.boxes ? [...b.boxes.map((wd) => box([1, 0], wd)), ...b.boxes.map((wd) => box([0, 1], wd))] : [weights([1, 0]), weights([0, 1])];
  for (let i = 0; i < passes.length; i++) {
    const last = i === passes.length - 1;
    const to = last && direct ? null : target(s, 2 + (i % 2), rw, rh);
    run(s, passes[i].p, src, [rw, rh], to, passes[i].set, i === 0 && direct ? origin : [0, 0]);
    if (!to) return;
    src = to.tex;
  }
  run(s, s.enlarge, src, [w, h], null, () => {
    gl.uniform2i(s.enlarge.at('small'), rw, rh);
    gl.uniform1i(s.enlarge.at('n'), b.n);
    gl.uniform1i(s.enlarge.at('sh'), b.k + 1);
    gl.uniform1i(s.enlarge.at('pad'), pad);
  });
}

/**
 * The plan over the top left w by h of `picture` (as a canvas keeps it), as a picture whose top left w by h is the result
 * to draw back (it may be larger: the chip's canvas grows to fit), drawn before the next call; null when this computer
 * cannot do it on its chip. `pad` as code.ts blurPixels. `at` reads the w by h from that place of
 * `picture` instead, uploaded straight from it.
 */
export function effectsOnChip(picture: TexImageSource, w: number, h: number, plan: EffectPlan, pad = 0, at: [number, number] = [0, 0]): OffscreenCanvas | null {
  const s = setup();
  if (!s) return null;
  const { gl } = s;
  if (gl.isContextLost()) {
    made = null;
    return null;
  }
  const big = Math.max(w, h) + 2 * pad;
  if (big > s.max || w < 1 || h < 1) return null;
  try {
    gl.disable(gl.BLEND);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    // the canvas's own bytes, premultiplied: converting them on the way would round differently on each chip
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.activeTexture(gl.TEXTURE0);
    // the whole picture, read at `at` by the shaders, as squares-gl.ts uploads it: the copy that stays on the chip
    const pw = (picture as { width: number }).width;
    const ph = (picture as { height: number }).height;
    if (at[0] < 0 || at[1] < 0 || at[0] + w > pw || at[1] + h > ph) return null;
    room(gl, s.input, pw, ph);
    gl.bindTexture(gl.TEXTURE_2D, s.input.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, pw, ph, gl.RGBA, gl.UNSIGNED_BYTE, picture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    // the canvas grows rather than following each size (resizing reallocates its drawing buffer, and a frame may ask for
    // several), and shrinks back when far too large, since drawing it back copies all of it
    const fit = fitted(s.out, w, h);
    if (fit) {
      s.canvas.width = fit[0];
      s.canvas.height = fit[1];
    }
    // a canvas too large for the chip's memory gets a smaller drawing buffer, silently: then the plain code works it out
    if (gl.drawingBufferWidth !== s.canvas.width || gl.drawingBufferHeight !== s.canvas.height) {
      s.canvas.width = s.canvas.height = 1;
      s.out = { cw: 1, ch: 1, over: 0 };
      return null;
    }
    let from = s.input.tex;
    let origin = at;
    const c = plan.colour;
    if (c?.table) {
      gl.bindTexture(gl.TEXTURE_2D, s.table);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RED_INTEGER, gl.UNSIGNED_BYTE, c.table);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    }
    // colour and a blur that reduces: each pixel coloured as the reduction reads it, one full-size pass fewer
    const folded = !!(c && plan.blur && (plan.blur.n > 1 || pad > 0));
    if (c && !folded) {
      const into = plan.blur ? target(s, 0, w, h) : null;
      run(s, s.colour, from, [w, h], into, () => setColour(s, s.colour, c), origin);
      if (!into) return s.canvas;
      from = into.tex;
      origin = [0, 0];
    }
    if (plan.blur) blur(s, plan.blur, from, w, h, pad, origin, folded ? c : null);
    return s.canvas;
  } catch {
    return null;
  }
}

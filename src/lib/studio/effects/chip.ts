// The effects of plan.ts on the graphics chip, in WebGL2, held equal byte for byte to the plain code (code.ts) by
// qa/studio-effects-parity.cjs: texelFetch reads every pixel without filtering, sums are 32-bit unsigned integers,
// every rounding is an integer shift or division, as squares-gl.ts does for «إخفاء بالمربعات». The picture is taken as
// the canvas keeps it (premultiplied, uploaded unchanged) and nothing is read back: the result is a canvas the caller
// draws. Where WebGL2 is missing, runs without a graphics chip, or its context is lost, it answers null and index.ts
// takes the plain code. Needs OffscreenCanvas, so it runs in a worker too.
import { reduced, type BlurPlan, type EffectPlan } from './plan.ts';

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
out vec4 colour;
uvec4 at(ivec2 p) { return uvec4(round(texelFetch(src, p, 0) * 255.0)); }
// the pixel this fragment writes: textures keep the picture's rows top first, the canvas bottom first
ivec2 here() { ivec2 p = ivec2(gl_FragCoord.xy); if (toCanvas) p.y = size.y - 1 - p.y; return p; }
`;

// A colour plan (code.ts colourPixels): straight colour, the table, the matrix, premultiplied again.
const COLOUR = `${HEAD}
uniform usampler2D table;
uniform bool useTable;
uniform bool useMatrix;
uniform ivec3 m0;
uniform ivec3 m1;
uniform ivec3 m2;
uniform ivec3 offset;
void main() {
  uvec4 p = at(here());
  uint a = p.a;
  if (a == 0u) { colour = vec4(0.0); return; }
  uvec3 c = a == 255u ? p.rgb : min(uvec3(255u), (p.rgb * 255u + (a >> 1u)) / a);
  if (useTable) c = uvec3(texelFetch(table, ivec2(int(c.r), 0), 0).r, texelFetch(table, ivec2(int(c.g), 0), 0).r, texelFetch(table, ivec2(int(c.b), 0), 0).r);
  if (useMatrix) {
    ivec3 s = ivec3(c);
    ivec3 v = max(ivec3(0), ivec3(m0.x * s.r + m0.y * s.g + m0.z * s.b, m1.x * s.r + m1.y * s.g + m1.z * s.b, m2.x * s.r + m2.y * s.g + m2.z * s.b) + offset);
    c = uvec3(min(ivec3(255), (v + 32768) >> 16));
  }
  uvec3 o = a == 255u ? c : (c * a + 127u) / 255u;
  colour = vec4(vec3(o), float(a)) / 255.0;
}`;

// The reduction: each n by n block summed (outside the picture transparent), cut to a whole number.
const REDUCE = `${HEAD}
uniform ivec2 area;
uniform int n;
uniform int shift;
uniform int pad;
void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  uvec4 s = uvec4(0u);
  for (int y = 0; y < n; y++) {
    for (int x = 0; x < n; x++) {
      ivec2 q = cell * n + ivec2(x, y) - ivec2(pad);
      if (q.x < 0 || q.y < 0 || q.x >= area.x || q.y >= area.y) continue;
      s += at(q);
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
type Target = { tex: WebGLTexture; w: number; h: number };
type Gl = {
  canvas: OffscreenCanvas;
  gl: WebGL2RenderingContext;
  colour: Program;
  reduce: Program;
  weights: Program;
  enlarge: Program;
  input: WebGLTexture;
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
      enlarge: program(gl, ENLARGE),
      input: texture(gl),
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

/** Intermediate picture `i`, w by h, made or resized as needed. */
function target(s: Gl, i: number, w: number, h: number): Target {
  const { gl } = s;
  let t = s.targets[i];
  if (!t) t = s.targets[i] = { tex: texture(gl), w: 0, h: 0 };
  if (t.w !== w || t.h !== h) {
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    t.w = w;
    t.h = h;
  }
  return t;
}

/** One pass: `p` reads `from` (w by h) and writes into `to`, or into the canvas (w by h) when `to` is null. */
function run(s: Gl, p: Program, from: WebGLTexture, size: [number, number], to: Target | null, set: () => void) {
  const { gl } = s;
  if (to) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, s.frame);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, to.tex, 0);
    gl.viewport(0, 0, to.w, to.h);
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, s.canvas.width, s.canvas.height);
  }
  gl.useProgram(p.program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, from);
  gl.uniform1i(p.at('src'), 0);
  gl.uniform2i(p.at('size'), size[0], size[1]);
  gl.uniform1i(p.at('toCanvas'), to ? 0 : 1);
  set();
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function blur(s: Gl, b: BlurPlan, from: WebGLTexture, w: number, h: number, pad: number) {
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
    });
    src = small.tex;
  }
  const weights = (dir: [number, number]) => () => {
    gl.uniform2i(s.weights.at('dir'), dir[0], dir[1]);
    gl.uniform1i(s.weights.at('radius'), b.radius);
    gl.uniform1iv(s.weights.at('weights'), b.weights);
  };
  const across = target(s, 2, rw, rh);
  run(s, s.weights, src, [rw, rh], across, weights([1, 0]));
  if (direct) {
    run(s, s.weights, across.tex, [rw, rh], null, weights([0, 1]));
    return;
  }
  const down = target(s, 3, rw, rh);
  run(s, s.weights, across.tex, [rw, rh], down, weights([0, 1]));
  run(s, s.enlarge, down.tex, [w, h], null, () => {
    gl.uniform2i(s.enlarge.at('small'), rw, rh);
    gl.uniform1i(s.enlarge.at('n'), b.n);
    gl.uniform1i(s.enlarge.at('sh'), b.k + 1);
    gl.uniform1i(s.enlarge.at('pad'), pad);
  });
}

/**
 * The plan over `picture` (w by h, as a canvas keeps it), as a canvas of w by h to draw back; null when this computer
 * cannot do it on its chip. `pad` as code.ts blurPixels.
 */
export function effectsOnChip(picture: TexImageSource, w: number, h: number, plan: EffectPlan, pad = 0): OffscreenCanvas | null {
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
    gl.bindTexture(gl.TEXTURE_2D, s.input);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, picture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    if (s.canvas.width !== w) s.canvas.width = w;
    if (s.canvas.height !== h) s.canvas.height = h;
    let from = s.input;
    const c = plan.colour;
    if (c) {
      if (c.table) {
        gl.bindTexture(gl.TEXTURE_2D, s.table);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, 256, 1, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, c.table);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      }
      const into = plan.blur ? target(s, 0, w, h) : null;
      run(s, s.colour, from, [w, h], into, () => {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, s.table);
        gl.uniform1i(s.colour.at('table'), 1);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(s.colour.at('useTable'), c.table ? 1 : 0);
        gl.uniform1i(s.colour.at('useMatrix'), c.matrix ? 1 : 0);
        const m = c.matrix ?? new Int32Array(9);
        gl.uniform3i(s.colour.at('m0'), m[0], m[1], m[2]);
        gl.uniform3i(s.colour.at('m1'), m[3], m[4], m[5]);
        gl.uniform3i(s.colour.at('m2'), m[6], m[7], m[8]);
        const o = c.offset ?? new Int32Array(3);
        gl.uniform3i(s.colour.at('offset'), o[0], o[1], o[2]);
      });
      if (!into) return s.canvas;
      from = into.tex;
    }
    if (plan.blur) blur(s, plan.blur, from, w, h, pad);
    return s.canvas;
  } catch {
    return null;
  }
}

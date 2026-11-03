// «إخفاء بالمربعات» on the graphics chip (cover.ts): the same whole-number arithmetic as cover.ts `mosaic`, in WebGL2,
// so the squares need no read-back of the picture and come out the same, byte for byte, on any conformant chip.
// texelFetch reads each pixel without filtering, the sums are 32-bit unsigned integers and every rounding is an
// integer division. Measured on 2026-11-03: reading the pixels back every frame slowed an export with a squares
// cover from about 115 to about 41 frames a second; this path reads nothing back. Where WebGL2 is missing, runs
// without a graphics chip, or its context is lost, it answers null and cover.ts works the squares out in plain code,
// which is also the reference the browser check holds this against. Browser only.

const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// One fragment per square: its colour, not premultiplied, from the pixels on its grid (cover.ts mosaic).
const SQUARES = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D picture;
uniform ivec2 origin;
uniform ivec2 area;
uniform ivec2 grid;
uniform int stride;
out vec4 colour;
void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  int left = cell.x * area.x / grid.x;
  int right = (cell.x + 1) * area.x / grid.x;
  int top = cell.y * area.y / grid.y;
  int bottom = (cell.y + 1) * area.y / grid.y;
  uint r = 0u;
  uint g = 0u;
  uint b = 0u;
  uint a = 0u;
  uint n = 0u;
  for (int y = top; y < bottom; y += stride) {
    for (int x = left; x < right; x += stride) {
      uvec4 p = uvec4(round(texelFetch(picture, origin + ivec2(x, y), 0) * 255.0));
      r += p.r * p.a;
      g += p.g * p.a;
      b += p.b * p.a;
      a += p.a;
      n += 1u;
    }
  }
  uvec4 c = uvec4(0u);
  if (n > 0u) {
    if (a > 0u) c.rgb = (2u * uvec3(r, g, b) + a) / (2u * a);
    c.a = (2u * a + n) / (2u * n);
  }
  colour = vec4(c) / 255.0;
}`;

// The area itself: each pixel takes its square's colour, premultiplied as the canvas keeps it.
const AREA = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D squares;
uniform ivec2 area;
uniform ivec2 grid;
out vec4 colour;
void main() {
  int x = int(gl_FragCoord.x);
  int y = area.y - 1 - int(gl_FragCoord.y);
  int i = ((x + 1) * grid.x - 1) / area.x;
  int j = ((y + 1) * grid.y - 1) / area.y;
  uvec4 c = uvec4(round(texelFetch(squares, ivec2(i, j), 0) * 255.0));
  uvec3 pm = (c.rgb * c.a + 127u) / 255u;
  colour = vec4(vec3(pm), float(c.a)) / 255.0;
}`;

type Program = { program: WebGLProgram; at: (name: string) => WebGLUniformLocation | null };
type Gl = { canvas: OffscreenCanvas; gl: WebGL2RenderingContext; squares: Program; area: Program; picture: WebGLTexture; cells: WebGLTexture; frame: WebGLFramebuffer };

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
    // a software renderer is refused: without a graphics chip the plain-code path is the quicker one
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false, depth: false, stencil: false, failIfMajorPerformanceCaveat: true });
    if (!gl) return null;
    canvas.addEventListener('webglcontextlost', () => {
      made = null;
    });
    made = { canvas, gl, squares: program(gl, SQUARES), area: program(gl, AREA), picture: texture(gl), cells: texture(gl), frame: gl.createFramebuffer()! };
  } catch {
    made = null;
  }
  return made;
}

/**
 * The squares of the area (x0, y0, bw, bh) of `picture`, cols by rows, each averaged on a grid of every `stride`-th
 * pixel, as a canvas of bw by bh to draw back at (x0, y0); null when this computer cannot draw them on its chip.
 */
export function squaresOnChip(picture: TexImageSource, x0: number, y0: number, bw: number, bh: number, cols: number, rows: number, stride: number): OffscreenCanvas | null {
  const s = setup();
  if (!s) return null;
  const { gl } = s;
  if (gl.isContextLost()) {
    made = null;
    return null;
  }
  try {
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, s.picture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, picture);
    // pass 1: one colour per square
    gl.bindTexture(gl.TEXTURE_2D, s.cells);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, s.frame);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, s.cells, 0);
    gl.viewport(0, 0, cols, rows);
    gl.disable(gl.BLEND);
    gl.useProgram(s.squares.program);
    gl.bindTexture(gl.TEXTURE_2D, s.picture);
    gl.uniform1i(s.squares.at('picture'), 0);
    gl.uniform2i(s.squares.at('origin'), x0, y0);
    gl.uniform2i(s.squares.at('area'), bw, bh);
    gl.uniform2i(s.squares.at('grid'), cols, rows);
    gl.uniform1i(s.squares.at('stride'), Math.max(1, Math.floor(stride)));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // pass 2: the area, on the canvas
    if (s.canvas.width !== bw) s.canvas.width = bw;
    if (s.canvas.height !== bh) s.canvas.height = bh;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, bw, bh);
    gl.useProgram(s.area.program);
    gl.bindTexture(gl.TEXTURE_2D, s.cells);
    gl.uniform1i(s.area.at('squares'), 0);
    gl.uniform2i(s.area.at('area'), bw, bh);
    gl.uniform2i(s.area.at('grid'), cols, rows);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return s.canvas;
  } catch {
    return null;
  }
}

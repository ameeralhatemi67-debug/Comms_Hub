// The export's colour where the video encoder runs on the processor (export.ts): the studio turns each composed frame
// into BT.709 limited-range YUV 4:2:0 itself, with whole-number arithmetic, and says so on the frame. Given the
// canvas's RGB instead, the processor-only encoders wrote BT.601 (measured on 2026-11-03 with no graphics chip:
// `smpte170m`, and green at 19.6 dB when the file is read as BT.709, as many players read HD video), while the
// graphics chips' encoders write BT.709. Fixed-point coefficients scaled by 2^16, rounded so that every grey stays
// exactly neutral; chroma is the rounded average of each 2 by 2 block. The conversion itself (i420Into) names
// nothing outside its own text, so the export's workers are made from it (yuv-pipe.ts) and give the same bytes. Pure.

/** BT.709 limited range: Y = 16 + 219/255 (0.2126 R + 0.7152 G + 0.0722 B), Cb and Cr 128 + 224/255 of their differences. */
export const BT709 = Object.freeze({
  y: [11966, 40254, 4064],
  cb: [-6596, -22189, 28785],
  cr: [28785, -26145, -2640],
});

/** The colour space a frame made by rgbaToI420 carries, and the encoder writes into the file. */
export const BT709_SPACE = Object.freeze({ primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false } as const);

/**
 * RGBA pixels, w by h (both even), as I420: the Y plane (w x h), then U and V (w/2 x h/2 each). Alpha is ignored: an
 * exported frame is opaque. One pass over each 2 by 2 block: its four Y values, then its chroma from the block's
 * average, rounded half up. `out` may be given to reuse a buffer of w * h * 3 / 2 bytes.
 */
export function rgbaToI420(rgba: Uint8ClampedArray, w: number, h: number, out?: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  if (w % 2 || h % 2) throw new Error('even sizes only');
  const size = w * h;
  const dst = out && out.length === (size * 3) / 2 ? out : new Uint8Array((size * 3) / 2);
  i420Into(rgba, w, h, dst);
  return dst;
}

/**
 * rgbaToI420's arithmetic, into `dst` (w * h * 3 / 2 bytes), for the columns from x0 (even; 0 is the whole frame,
 * yuv-simd.ts does the columns before it), with every constant written inside it (BT709 above, held equal by
 * tests/studio-export-power.test.mjs): a worker is made from this function's text. Each pixel is read once as a 32-bit
 * word where the bytes are in that order (every desktop and phone processor) and the pixels start on a word.
 */
export function i420Into(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, dst: Uint8Array, x0 = 0): void {
  const YR = 11966, YG = 40254, YB = 4064;
  const UR = -6596, UG = -22189, UB = 28785;
  const VR = 28785, VG = -26145, VB = -2640;
  const HALF = 32768;
  const size = w * h;
  const little = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  const words = little && rgba.byteOffset % 4 === 0 ? new Uint32Array(rgba.buffer, rgba.byteOffset, size) : null;
  for (let y = 0; y < h; y += 2) {
    const top = y * w;
    const bottom = top + w;
    let u = size + (y >> 1) * (w >> 1) + (x0 >> 1);
    let v = u + (size >> 2);
    for (let x = x0; x < w; x += 2, u++, v++) {
      let r0: number, g0: number, b0: number, r1: number, g1: number, b1: number, r2: number, g2: number, b2: number, r3: number, g3: number, b3: number;
      if (words) {
        const p0 = words[top + x];
        const p1 = words[top + x + 1];
        const p2 = words[bottom + x];
        const p3 = words[bottom + x + 1];
        r0 = p0 & 255; g0 = (p0 >>> 8) & 255; b0 = (p0 >>> 16) & 255;
        r1 = p1 & 255; g1 = (p1 >>> 8) & 255; b1 = (p1 >>> 16) & 255;
        r2 = p2 & 255; g2 = (p2 >>> 8) & 255; b2 = (p2 >>> 16) & 255;
        r3 = p3 & 255; g3 = (p3 >>> 8) & 255; b3 = (p3 >>> 16) & 255;
      } else {
        const a = (top + x) * 4;
        const c = (bottom + x) * 4;
        r0 = rgba[a]; g0 = rgba[a + 1]; b0 = rgba[a + 2];
        r1 = rgba[a + 4]; g1 = rgba[a + 5]; b1 = rgba[a + 6];
        r2 = rgba[c]; g2 = rgba[c + 1]; b2 = rgba[c + 2];
        r3 = rgba[c + 4]; g3 = rgba[c + 5]; b3 = rgba[c + 6];
      }
      dst[top + x] = 16 + ((YR * r0 + YG * g0 + YB * b0 + HALF) >> 16);
      dst[top + x + 1] = 16 + ((YR * r1 + YG * g1 + YB * b1 + HALF) >> 16);
      dst[bottom + x] = 16 + ((YR * r2 + YG * g2 + YB * b2 + HALF) >> 16);
      dst[bottom + x + 1] = 16 + ((YR * r3 + YG * g3 + YB * b3 + HALF) >> 16);
      const R = (r0 + r1 + r2 + r3 + 2) >> 2;
      const G = (g0 + g1 + g2 + g3 + 2) >> 2;
      const B = (b0 + b1 + b2 + b3 + 2) >> 2;
      dst[u] = 128 + ((UR * R + UG * G + UB * B + HALF) >> 16);
      dst[v] = 128 + ((VR * R + VG * G + VB * B + HALF) >> 16);
    }
  }
}

// The count of notices waiting for a decision, drawn for Windows (Desktop_App_Plan.md 5.2 `notify.badge`).
// Windows has no number badge on a taskbar button, only a small overlay picture, so the number is drawn
// here: a red disc with white figures, 1 to 9 and then «9+», in a 3 by 5 pixel font scaled to the size.
// The tray icon gets a red dot instead, since its picture is too small for figures. Bitmaps are BGRA,
// the order Electron's nativeImage.createFromBitmap reads on Windows. Pure.

export const BADGE_RED = Object.freeze({ r: 0xc6, g: 0x28, b: 0x28 });

/** What the badge says: nothing for none, the figure up to 9, then «9+». */
export function badgeLabel(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  return n > 9 ? '9+' : String(Math.floor(n));
}

// Rows of three pixels, top to bottom.
const FONT: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '001', '001', '001'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  '+': ['000', '010', '111', '010', '000'],
};

function put(buf: Buffer, size: number, x: number, y: number, rgb: { r: number; g: number; b: number }, alpha: number) {
  if (x < 0 || y < 0 || x >= size || y >= size || alpha <= 0) return;
  const i = (y * size + x) * 4;
  const a = Math.min(1, alpha);
  const under = buf[i + 3] / 255;
  const out = a + under * (1 - a);
  const mix = (top: number, bottom: number) => (out === 0 ? 0 : Math.round((top * a + bottom * under * (1 - a)) / out));
  buf[i] = mix(rgb.b, buf[i]);
  buf[i + 1] = mix(rgb.g, buf[i + 1]);
  buf[i + 2] = mix(rgb.r, buf[i + 2]);
  buf[i + 3] = Math.round(out * 255);
}

/** A filled disc, its edge softened by how much of each pixel it covers. */
function disc(buf: Buffer, size: number, cx: number, cy: number, radius: number, rgb: { r: number; g: number; b: number }) {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      put(buf, size, x, y, rgb, radius + 0.5 - d);
    }
  }
}

/** The taskbar overlay for `n` notices at `size` pixels (16, or 32 for a scaled display), or null for none. */
export function badgeBitmap(n: number, size: 16 | 32): Buffer | null {
  const label = badgeLabel(n);
  if (!label) return null;
  const buf = Buffer.alloc(size * size * 4);
  disc(buf, size, size / 2, size / 2, size / 2 - 0.5, BADGE_RED);
  const scale = size / 8;
  const gap = label.length > 1 ? Math.max(1, Math.round(scale / 2)) : 0;
  const width = label.length * 3 * scale + gap * (label.length - 1);
  const left = Math.round((size - width) / 2);
  const top = Math.round((size - 5 * scale) / 2);
  [...label].forEach((ch, k) => {
    const x0 = left + k * (3 * scale + gap);
    FONT[ch].forEach((row, ry) => {
      [...row].forEach((bit, rx) => {
        if (bit !== '1') return;
        for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) put(buf, size, x0 + rx * scale + dx, top + ry * scale + dy, { r: 255, g: 255, b: 255 }, 1);
      });
    });
  });
  return buf;
}

/** A copy of a square BGRA icon with a red dot in its top corner, for the tray while decisions wait. */
export function withDot(icon: Buffer, size: number): Buffer {
  if (icon.length !== size * size * 4) throw new Error('the icon is not a square BGRA bitmap of this size');
  const out = Buffer.from(icon);
  const radius = Math.max(2, size * 0.22);
  disc(out, size, size - radius - 0.5, radius + 0.5, radius, BADGE_RED);
  return out;
}

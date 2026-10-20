// «هوية الاستوديو» (MVP_draft.md 62.11): up to twelve named colours and a font for titles and one for text,
// shared by everyone who may open the studio. Colour choices show these first; a new text takes these
// fonts. The rules equal studio_brand_save (supabase/migrations/20261020140000_studio_kit.sql). Pure.
import { FONTS, nearestWeight, type FontFamily } from './fonts.ts';
import type { TextStyle } from './schema.ts';

export type BrandColor = { name: string; hex: string };
export type Brand = { colors: BrandColor[]; title_font: FontFamily | null; body_font: FontFamily | null };
export const BRAND_MAX = 12;
export const NO_BRAND: Brand = { colors: [], title_font: null, body_font: null };

const HEX = /^#[0-9a-fA-F]{6}$/;
const isFont = (f: unknown): f is FontFamily => typeof f === 'string' && FONTS.some((x) => x.family === f);

/** What the database would refuse in a brand, in Arabic, or null. */
export function brandIssue(b: { colors: BrandColor[]; title_font: string | null; body_font: string | null }): string | null {
  if (b.colors.length > BRAND_MAX) return `حتى ${BRAND_MAX} لوناً.`;
  for (const c of b.colors) {
    if (!HEX.test(c.hex)) return `اللون «${c.name || c.hex}» ليس لوناً صالحاً.`;
    const n = c.name.trim().length;
    if (n < 1 || n > 40) return 'لكل لون اسم، حتى 40 حرفاً.';
  }
  for (const f of [b.title_font, b.body_font]) if (f !== null && (f.length < 1 || f.length > 60)) return 'اسم الخط غير صالح.';
  return null;
}

/** A brand row read from the database, made safe: valid colours, and fonts the studio has. */
export function readBrand(row: unknown): Brand {
  const r = (row ?? {}) as { colors?: unknown; title_font?: unknown; body_font?: unknown };
  const colors = Array.isArray(r.colors)
    ? (r.colors as unknown[])
        .filter((c): c is BrandColor => !!c && typeof c === 'object' && typeof (c as BrandColor).hex === 'string' && HEX.test((c as BrandColor).hex) && typeof (c as BrandColor).name === 'string')
        .slice(0, BRAND_MAX)
        .map((c) => ({ name: c.name, hex: c.hex.toLowerCase() }))
    : [];
  return { colors, title_font: isFont(r.title_font) ? r.title_font : null, body_font: isFont(r.body_font) ? r.body_font : null };
}

/** A new text in the brand's font for its kind (a title, or other text), at the nearest weight it has. */
export function brandText(style: TextStyle, brand: Brand, kind: 'title' | 'body'): TextStyle {
  const font = kind === 'title' ? (brand.title_font ?? brand.body_font) : (brand.body_font ?? brand.title_font);
  if (!font) return style;
  return { ...style, font, weight: nearestWeight(font, style.weight) };
}

// Arabic text on the studio's canvas (MVP_draft.md 62): only the fonts the site ships, loaded with
// Arabic sample text (the font files are split by character range, so a Latin-only load would leave
// the Arabic part unloaded), right-to-left paragraphs, no letter spacing (it breaks joined letters),
// line breaks at word boundaries (Intl.Segmenter), a box, an outline, a shadow, entry and exit, and a
// reveal letter by letter or word by word (transitions.ts).
import { US, type Clip, type Micros, type ProjectDoc, type TextStyle } from './schema.ts';
import { fontDef, fontSample } from './fonts.ts';

export const FALLBACK = '"IBM Plex Sans Arabic", "Segoe UI", Tahoma, sans-serif';
export const SAMPLE = 'نص عربي للتحميل Text 0123';

export const defaultText = (content = 'اكتب النص هنا'): TextStyle => ({
  content,
  font: 'IBM Plex Sans Arabic',
  weight: 600,
  size: 72,
  color: '#ffffff',
  align: 'center',
  width: 0.84,
  lineHeight: 1.35,
  box: null,
  stroke: null,
  shadow: { color: 'rgba(0,0,0,0.55)', blur: 12 },
  enter: 'fade',
  exit: 'fade',
});

export const fontOf = (s: Pick<TextStyle, 'font' | 'weight' | 'size'>, scale = 1) => `${s.weight} ${Math.max(1, s.size * scale)}px "${s.font}", ${FALLBACK}`;

/**
 * Loads each font and weight used, with sample text of its script (Arabic and Latin for an Arabic font,
 * Latin for an English one). Resolves to whether all of them are ready.
 */
export async function loadFonts(styles: Pick<TextStyle, 'font' | 'weight'>[]): Promise<boolean> {
  if (typeof document === 'undefined' || !document.fonts) return false;
  const want = new Map<string, { font: string; sample: string }>();
  for (const s of styles) want.set(`${s.weight}|${s.font}`, { font: `${s.weight} 48px "${s.font}"`, sample: fontSample(fontDef(s.font)) });
  await Promise.all([...want.values()].map((f) => document.fonts.load(f.font, f.sample).catch(() => [])));
  return [...want.values()].every((f) => document.fonts.check(f.font, f.sample));
}

/** Every font and weight the texts of a project use, once each. */
export function usedFonts(doc: ProjectDoc): Pick<TextStyle, 'font' | 'weight'>[] {
  const seen = new Map<string, Pick<TextStyle, 'font' | 'weight'>>();
  const add = (s: TextStyle | undefined) => s && seen.set(`${s.weight}|${s.font}`, { font: s.font, weight: s.weight });
  for (const t of doc.video?.tracks ?? []) for (const c of t.clips) add(c.text);
  for (const l of doc.photo?.layers ?? []) add(l.text);
  return [...seen.values()];
}

const STRONG_RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const STRONG_LTR = /[A-Za-zÀ-ɏ]/;
/** A paragraph's direction from its first strong letter (Arabic: right to left). */
export function paragraphDir(text: string): 'rtl' | 'ltr' {
  for (const ch of text) {
    if (STRONG_RTL.test(ch)) return 'rtl';
    if (STRONG_LTR.test(ch)) return 'ltr';
  }
  return 'rtl';
}

type Measure = (s: string) => number;

function words(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Seg) return [...new Seg('ar', { granularity: 'word' }).segment(text)].map((x) => x.segment);
  return text.split(/(\s+)/);
}

function graphemes(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  return Seg ? [...new Seg('ar', { granularity: 'grapheme' }).segment(text)].map((x) => x.segment) : [...text];
}

export type Line = { text: string; width: number; dir: 'rtl' | 'ltr' };

/** Lines of a text within a width: each paragraph keeps its direction; a word wider than the box is cut. */
export function wrap(text: string, maxWidth: number, measure: Measure): Line[] {
  const out: Line[] = [];
  for (const para of text.split(/\r?\n/)) {
    const dir = paragraphDir(para);
    if (!para.trim()) {
      out.push({ text: '', width: 0, dir });
      continue;
    }
    let line = '';
    const push = () => {
      const t = line.trimEnd();
      out.push({ text: t, width: measure(t), dir });
      line = '';
    };
    for (const w of words(para)) {
      const next = line + w;
      if (measure(next.trimEnd()) <= maxWidth || !line.trim()) {
        if (!line.trim() && measure(w.trim()) > maxWidth) {
          // a single word wider than the box: cut it by letters
          for (const g of graphemes(w)) {
            if (measure(line + g) > maxWidth && line) push();
            line += g;
          }
        } else line = next;
      } else {
        push();
        line = w.trimStart();
      }
    }
    if (line.trim() || !out.length) push();
  }
  return out;
}

export type TextLayout = { lines: Line[]; lineH: number; boxW: number; height: number; width: number };

export function layoutText(ctx: CanvasRenderingContext2D, s: TextStyle, canvasW: number, scale = 1): TextLayout {
  ctx.font = fontOf(s, scale);
  (ctx as unknown as { letterSpacing?: string }).letterSpacing = '0px';
  const boxW = Math.max(10, s.width * canvasW * scale);
  const pad = s.box ? s.box.padding * scale : 0;
  const lines = wrap(s.content, boxW - 2 * pad, (x) => ctx.measureText(x).width);
  const lineH = s.size * scale * s.lineHeight;
  return { lines, lineH, boxW, height: lines.length * lineH + 2 * pad, width: Math.max(0, ...lines.map((l) => l.width)) + 2 * pad };
}

/** Entry and exit of a timed text: 0.4 s each, as opacity and a small move. */
export function textMotion(s: TextStyle, clip: Pick<Clip, 'start' | 'length'>, t: Micros): { alpha: number; dx: number; dy: number } {
  const dur = 0.4 * US;
  const into = t - clip.start;
  const left = clip.start + clip.length - t;
  let alpha = 1;
  let dx = 0;
  let dy = 0;
  const apply = (kind: TextStyle['enter'], k: number, sign: 1 | -1) => {
    const e = 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
    if (kind === 'fade' || kind === 'rise' || kind === 'slide') alpha = Math.min(alpha, e);
    if (kind === 'rise') dy += (1 - e) * s.size * 0.6 * sign;
    if (kind === 'slide') dx += (1 - e) * s.size * 1.2 * sign;
  };
  if (s.enter && s.enter !== 'none' && into < dur) apply(s.enter, into / dur, 1);
  if (s.exit && s.exit !== 'none' && left < dur) apply(s.exit, left / dur, -1);
  return { alpha, dx, dy };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** How many letters (graphemes) or words each line shows when a share `f` of the whole text is revealed. */
export function revealCounts(lines: Line[], f: number, by: 'chars' | 'words'): number[] {
  const units = lines.map((l) => (by === 'words' ? words(l.text).filter((w) => w.trim()).length : graphemes(l.text).length));
  let left = Math.round(Math.max(0, Math.min(1, f)) * units.reduce((a, b) => a + b, 0));
  return units.map((u) => {
    const n = Math.min(u, left);
    left -= n;
    return n;
  });
}

/** The start of a line cut to its first n letters or words. */
export function revealText(text: string, n: number, by: 'chars' | 'words'): string {
  if (by === 'chars') return graphemes(text).slice(0, n).join('');
  let out = '';
  let seen = 0;
  for (const w of words(text)) {
    if (w.trim()) {
      if (seen >= n) break;
      seen++;
    }
    out += w;
  }
  return out.trimEnd();
}

/**
 * Draws a text centred on (cx, cy) in the context's current transform. `scale` turns the style's
 * canvas pixels into the target's pixels (a preview is smaller than the project's canvas). With
 * `reveal`, only that share of the letters or words is drawn, each line growing from its start.
 */
export function drawText(ctx: CanvasRenderingContext2D, s: TextStyle, cx: number, cy: number, canvasW: number, scale = 1, layout?: TextLayout, reveal?: { f: number; by: 'chars' | 'words' } | null) {
  const L = layout ?? layoutText(ctx, s, canvasW, scale);
  const pad = s.box ? s.box.padding * scale : 0;
  const top = cy - L.height / 2;
  const left = cx - L.boxW / 2;
  ctx.save();
  if (s.box && s.box.opacity > 0) {
    const bw = s.align === 'center' ? L.width : L.boxW;
    const bx = s.align === 'center' ? cx - bw / 2 : left;
    ctx.globalAlpha *= s.box.opacity;
    ctx.fillStyle = s.box.color;
    roundRect(ctx, bx, top, bw, L.height, s.box.radius * scale);
    ctx.fill();
    ctx.globalAlpha /= s.box.opacity;
  }
  ctx.font = fontOf(s, scale);
  (ctx as unknown as { letterSpacing?: string }).letterSpacing = '0px';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const counts = reveal && reveal.f < 1 ? revealCounts(L.lines, reveal.f, reveal.by) : null;
  L.lines.forEach((line, i) => {
    if (!line.text) return;
    const y = top + pad + L.lineH * (i + 0.5);
    ctx.direction = line.dir;
    // 'start' and 'end' follow each paragraph's own direction
    const align = s.align === 'center' ? 'center' : s.align;
    ctx.textAlign = align as CanvasTextAlign;
    let x =
      align === 'center' ? cx : (align === 'start') === (line.dir === 'rtl') ? left + L.boxW - pad : left + pad;
    let shown = line.text;
    if (counts) {
      if (!counts[i]) return;
      shown = revealText(line.text, counts[i], reveal!.by);
      // the cut line grows from where the whole line starts: its right edge in Arabic, its left in English
      const lx = align === 'center' ? cx - line.width / 2 : x === left + pad ? left + pad : left + L.boxW - pad - line.width;
      ctx.textAlign = line.dir === 'rtl' ? 'right' : 'left';
      x = line.dir === 'rtl' ? lx + line.width : lx;
    }
    if (s.stroke && s.stroke.width > 0) {
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = s.stroke.color;
      ctx.lineWidth = s.stroke.width * 2 * scale;
      ctx.strokeText(shown, x, y);
    }
    if (s.shadow && s.shadow.blur > 0) {
      ctx.shadowColor = s.shadow.color;
      ctx.shadowBlur = s.shadow.blur * scale;
    } else ctx.shadowColor = 'transparent';
    ctx.fillStyle = s.color;
    ctx.fillText(shown, x, y);
  });
  ctx.restore();
  return L;
}

// ---------------------------------------------------------------------------
// SRT captions: each cue becomes a text clip on a text track.
// ---------------------------------------------------------------------------

const srtTime = (s: string): Micros | null => {
  const m = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/.exec(s);
  if (!m) return null;
  return ((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000 + Number(m[4].padEnd(3, '0'))) * 1000;
};

/** The cues of an SRT file, in order: start, end and text (tags removed). Malformed cues are skipped. */
export function parseSrt(text: string): { start: Micros; end: Micros; text: string }[] {
  const out: { start: Micros; end: Micros; text: string }[] = [];
  for (const block of text.replace(/^﻿/, '').split(/\r?\n\s*\r?\n/)) {
    const lines = block.split(/\r?\n/).map((l) => l.trim());
    const ti = lines.findIndex((l) => l.includes('-->'));
    if (ti < 0) continue;
    const [a, b] = lines[ti].split('-->');
    const start = srtTime(a);
    const end = srtTime(b);
    const body = lines.slice(ti + 1).join('\n').replace(/<[^>]+>/g, '').trim();
    if (start === null || end === null || end <= start || !body) continue;
    out.push({ start, end, text: body });
  }
  return out.sort((x, y) => x.start - y.start);
}

/** A caption style: smaller text on a dark box near the bottom. */
export const captionStyle = (content: string): TextStyle => ({ ...defaultText(content), size: 54, weight: 500, box: { color: '#000000', opacity: 0.6, padding: 18, radius: 12 }, shadow: null, enter: 'none', exit: 'none' });

// Right-to-left text for the report's PDF, where nothing does this for us (MVP_draft.md 66). The site's Arabic font file has
// no Latin digits, brackets or quotation marks, so a line is cut into pieces, each with its font, in the order they
// are drawn from left to right. Arabic pieces stay in reading order, because the font engine turns them itself; a
// neutral sign inside Arabic turns with it, and a bracket takes its mirror. Enough of the Unicode rules for the
// report's own words: one right-to-left paragraph with Latin words and numbers inside it. Pure, tested.

export type Piece = { text: string; font: 'ar' | 'la' };

const STRONG_AR = /[֐-׿؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const STRONG_LA = /[A-Za-z0-9À-ɏ]/;
/** Signs that stay with a Latin word or a number around them: 2026-10, a@b.sa, 1,234, 85%, 10:30. */
const JOINERS = /[-.,:/@_%+]/;
const MIRROR: Record<string, string> = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '«': '»', '»': '«', '<': '>', '>': '<' };

const dirOf = (c: string): 'R' | 'L' | 'N' => (STRONG_AR.test(c) ? 'R' : STRONG_LA.test(c) ? 'L' : 'N');

type Run = { dir: 'R' | 'L'; text: string };

/** Direction runs in reading order: neutrals join Latin only between two Latin characters. */
export function runsOf(text: string): Run[] {
  const chars = [...text];
  const dirs = chars.map(dirOf);
  const resolved = dirs.map((d, i) => {
    if (d !== 'N') return d;
    let p = i - 1;
    while (p >= 0 && dirs[p] === 'N') p--;
    let n = i + 1;
    while (n < dirs.length && dirs[n] === 'N') n++;
    const between = p >= 0 && n < dirs.length && dirs[p] === 'L' && dirs[n] === 'L';
    if (between && chars.slice(p + 1, n).every((c) => JOINERS.test(c) || c === ' ')) return 'L';
    // A sign that closes a number, such as 85%.
    if (chars[i] === '%' && p === i - 1 && dirs[p] === 'L') return 'L';
    return 'R';
  });
  const runs: Run[] = [];
  chars.forEach((c, i) => {
    const dir = resolved[i] as 'R' | 'L';
    const last = runs[runs.length - 1];
    if (last && last.dir === dir) last.text += c;
    else runs.push({ dir, text: c });
  });
  return runs;
}

/**
 * The pieces of a line, left to right as they are drawn. `hasArabicGlyph` says what the Arabic font holds, because
 * its file carries a few signs of its own; anything else is drawn from the Latin font.
 */
export function visualPieces(text: string, hasArabicGlyph: (char: string) => boolean): Piece[] {
  const runs = runsOf(text);
  if (!runs.some((r) => r.dir === 'R' && STRONG_AR.test(r.text))) return text ? [{ text, font: 'la' }] : [];
  const out: Piece[] = [];
  for (const run of [...runs].reverse()) {
    if (run.dir === 'L') {
      out.push({ text: run.text, font: 'la' });
      continue;
    }
    // Inside a right-to-left run: cut by font, in reading order, then lay the cuts out from the left.
    const cuts: Piece[] = [];
    for (const c of run.text) {
      const font: Piece['font'] = hasArabicGlyph(c) ? 'ar' : 'la';
      const last = cuts[cuts.length - 1];
      if (last && last.font === font) last.text += c;
      else cuts.push({ text: c, font });
    }
    for (const cut of cuts.reverse()) {
      // A cut of Latin-font signs runs right to left: its characters are reversed by hand, and the brackets mirrored.
      out.push(cut.font === 'ar' ? cut : { text: [...cut.text].reverse().map((c) => MIRROR[c] ?? c).join(''), font: 'la' });
    }
  }
  return out;
}

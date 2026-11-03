// Mixed Arabic and English in one sentence, so a person can follow it (MVP_draft.md section 67.5). The steps are
// Arabic and the platforms' own screens are English, and a bare English word beside an Arabic comma, a bracket or
// a guillemet makes the browser reorder the whole line. The rule here is small and has no exceptions:
//   «Create client»  a label on the platform's screen: set apart as a chip, without the guillemets;
//   `Comms Hub`      a value to type: set apart in a different chip;
//   every other run of English (and digits joined to it) is isolated, so it keeps its own direction and what
//   is around it keeps the sentence's.
// A guillemet around Arabic, or around Arabic and English together, is the site's own wording and stays as it is.
// Pure: the same segments are drawn by src/components/guide-text.tsx and checked by tests/setup-guides.test.mjs.

export type Seg = { k: 'text' | 'latin' | 'ui' | 'val'; s: string };

const ARABIC = /[؀-ۿݐ-ݿ]/;
const LETTER = /[A-Za-z]/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TOKEN = String.raw`[A-Za-z0-9](?:[A-Za-z0-9_.\-/\\:@+&#%='’]*[A-Za-z0-9])?`;
const RUN = new RegExp(`${TOKEN}(?: ${TOKEN})*`, 'g');

/** English runs of a plain stretch of text: a run with no letter (a number beside Arabic) is not English, except a date (2026-11-03), whose hyphens an Arabic line would otherwise reverse. */
function plain(s: string, out: Seg[]) {
  let last = 0;
  for (const m of s.matchAll(RUN)) {
    if (!LETTER.test(m[0]) && !DATE.test(m[0])) continue;
    if (m.index > last) out.push({ k: 'text', s: s.slice(last, m.index) });
    out.push({ k: 'latin', s: m[0] });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ k: 'text', s: s.slice(last) });
}

export function segments(text: string): Seg[] {
  const out: Seg[] = [];
  text.split('`').forEach((part, i) => {
    if (i % 2 === 1) {
      out.push({ k: 'val', s: part });
      return;
    }
    let last = 0;
    for (const m of part.matchAll(/«([^«»]*)»/g)) {
      plain(part.slice(last, m.index), out);
      if (LETTER.test(m[1]) && !ARABIC.test(m[1])) out.push({ k: 'ui', s: m[1] });
      else {
        out.push({ k: 'text', s: '«' });
        plain(m[1], out);
        out.push({ k: 'text', s: '»' });
      }
      last = m.index + m[0].length;
    }
    plain(part.slice(last), out);
  });
  return out;
}

/** The words as a person reads them, with the marks gone: what a search or a test sees. */
export const plainText = (text: string) => segments(text).map((g) => g.s).join('');

// «الفحص» in «ورقة الكتابة» (MVP_draft.md 68.2): fixed rules from the department's style, with no AI. Each finds what it finds in the
// plain text and says what to do instead. Pure.
export type StyleNote = { text: string; count: number };

const RULES: [RegExp, string][] = [
  [/(^|\s)تم(\s)/g, '«تم» مع مصدر: استخدم الفعل. «تم توقيع» تصبح «وُقّعت».'],
  [/(^|\s)قام(ت)?\sب/g, '«قام بـ»: استخدم الفعل مباشرة. «قامت بتوقيع» تصبح «وقّعت».'],
  [/بشكل كبير/g, '«بشكل كبير»: استخدم «كثيراً» أو عدداً محدداً.'],
  [/ {2,}/g, 'مسافتان متتاليتان.'],
];

const LONG_SENTENCE = 30;

export function styleNotes(text: string): StyleNote[] {
  const out: StyleNote[] = [];
  for (const [re, note] of RULES) {
    const n = (text.match(re) ?? []).length;
    if (n) out.push({ text: note, count: n });
  }
  for (const s of text.match(/[^.!؟\n]+[.!؟]?/g) ?? []) {
    const words = (s.trim().match(/\S+/g) ?? []).length;
    if (words > LONG_SENTENCE) out.push({ text: `جملة طويلة من ${words} كلمة: «${s.trim().slice(0, 34)}…»`, count: 1 });
  }
  const twice = text.match(/(^|\s)(\S+)\s+\2(\s|$)/);
  if (twice) out.push({ text: `كلمة مكررة: «${twice[2]}»`, count: 1 });
  return out;
}

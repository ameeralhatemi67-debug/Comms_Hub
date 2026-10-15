// The cases that tests/limits-parity.test.mjs (TypeScript) and supabase/tests/limits_rules.sql
// (work_copy_issues) both run, so the two implementations of the send-step rule cannot drift.
import { BUILTIN_LIMITS, TEMPLATE_LIMITS, limitsToAccepts } from '../src/lib/platforms/limits.ts';

export const ACCEPTS = {
  instagram: { ...limitsToAccepts(BUILTIN_LIMITS.instagram), video_only: false },
  x: { ...limitsToAccepts(BUILTIN_LIMITS.x), video_only: false },
  linkedin: { ...limitsToAccepts(BUILTIN_LIMITS.linkedin), video_only: false },
  youtube: { ...limitsToAccepts(BUILTIN_LIMITS.youtube), video_only: true },
  tiktok: { ...limitsToAccepts(TEMPLATE_LIMITS.tiktok), video_only: true },
  facebook: { ...limitsToAccepts(TEMPLATE_LIMITS.facebook), video_only: false },
  mail: { video_only: false },
};

// A text is a list of parts: a string, or [piece, times] (so the SQL side can use repeat()).
const R = (piece, n) => [piece, n];
const ar = (n, ch = 'ن') => R(ch, n);
const tags = (n) => Array.from({ length: n }, (_, i) => (i ? ' ' : '') + `#وسم${i}`);
const links = (n, len = 60) => Array.from({ length: n }, (_, i) => (i ? ' ' : '') + 'https://example.org/' + 'a'.repeat(len));

/** The text of a part list. */
export const textOf = (parts) => parts.map((p) => (Array.isArray(p) ? p[0].repeat(p[1]) : p)).join('');

/** [parts, images, videos, typeVideo, platform] */
export const CASES = [
  [[''], 0, 0, false, 'instagram'],
  [['   \n\t '], 0, 0, false, 'instagram'],
  [['   '], 1, 0, false, 'instagram'],
  [['نص قصير'], 0, 0, false, 'instagram'],
  [[ar(2200)], 0, 0, false, 'instagram'],
  [[ar(2201)], 0, 0, false, 'instagram'],
  [tags(30), 0, 0, false, 'instagram'],
  [tags(31), 0, 0, false, 'instagram'],
  [['كلمة #وسم_عربي و#tag و (#أول) وبريد a@b.c#no'], 0, 0, false, 'instagram'],
  [['نص'], 10, 0, false, 'instagram'],
  [['نص'], 11, 0, false, 'instagram'],
  [['نص'], 6, 5, false, 'instagram'],
  [[R('😀', 2200)], 0, 0, false, 'instagram'],
  [[R('😀', 2201)], 0, 0, false, 'instagram'],
  [[ar(280)], 0, 0, false, 'x'],
  [[ar(281)], 0, 0, false, 'x'],
  [links(11, 10), 0, 0, false, 'x'],
  [links(12, 10), 0, 0, false, 'x'],
  [[ar(250), ' ', ...links(1, 300)], 0, 0, false, 'x'],
  [[ar(260), ' ', ...links(1, 5)], 0, 0, false, 'x'],
  [['نص HTTPS://EXAMPLE.ORG/ABC و http://a.b/c'], 0, 0, false, 'x'],
  [['نص'], 4, 0, false, 'x'],
  [['نص'], 5, 0, false, 'x'],
  [['نص'], 0, 1, false, 'x'],
  [['نص'], 0, 2, false, 'x'],
  [['نص'], 1, 1, false, 'x'],
  [[ar(3000)], 0, 0, false, 'linkedin'],
  [[ar(3001)], 0, 0, false, 'linkedin'],
  [['عنوان الفيديو'], 0, 1, false, 'youtube'],
  [['عنوان الفيديو'], 0, 0, false, 'youtube'],
  [['عنوان الفيديو'], 0, 0, true, 'youtube'],
  [[ar(100), '\nوصف'], 0, 1, false, 'youtube'],
  [[ar(101), '\nوصف'], 0, 1, false, 'youtube'],
  [['\nوصف بلا عنوان'], 0, 1, false, 'youtube'],
  [['  \n  \nوصف بعد أسطر فارغة'], 0, 1, false, 'youtube'],
  [['عنوان <b>\nوصف'], 0, 1, false, 'youtube'],
  [['عنوان\nوصف > سهم'], 0, 1, false, 'youtube'],
  [['عنوان\r\n', ar(2500)], 0, 1, false, 'youtube'],
  [['عنوان\r\n', ar(2501)], 0, 1, false, 'youtube'],
  [['title\n', R('a', 5000)], 0, 1, false, 'youtube'],
  [['title\n', R('a', 5001)], 0, 1, false, 'youtube'],
  [['عنوان'], 0, 2, false, 'youtube'],
  [['وصف تيك توك'], 0, 1, false, 'tiktok'],
  [['وصف تيك توك'], 0, 0, false, 'tiktok'],
  [[ar(2200)], 0, 1, false, 'tiktok'],
  [[ar(2201)], 0, 1, false, 'tiktok'],
  [['نص فيسبوك طويل ', ar(8000)], 5, 0, false, 'facebook'],
  [[''], 0, 0, false, 'facebook'],
  [[''], 0, 0, false, 'mail'],
  [['رسالة'], 0, 0, false, 'mail'],
];

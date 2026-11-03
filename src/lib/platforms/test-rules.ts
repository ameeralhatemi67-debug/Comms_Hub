// «تجربة النشر» on a YouTube account's sheet (MVP_draft.md section 71): the limits, the links and the words the page, the
// routes and the tests share. Client-safe: no token, no fetch. The database holds the same limits
// (supabase/migrations/20261103120000_platform_tests.sql), and tests/youtube-test.test.mjs keeps the two equal.
//
// From Google's documentation as read on 2026-11-03: a title is at most 100 characters and a description 5000 bytes,
// neither may hold < or >; an upload is sent in pieces that are multiples of 256 KiB; deleting a video needs the
// youtube.force-ssl scope (or youtube), which youtube.upload does not give. The API cannot create a community post.

/** The largest file a test sends. A test needs a short clip, and a file from this device goes through the site in pieces. */
export const TEST_MAX_BYTES = 1024 * 1024 * 1024;
/** A piece of a file from this device, sent through the site's server: under the host's 4.5 MB body limit, 12 × 256 KiB. */
export const DEVICE_PIECE = 3 * 1024 * 1024;
/** A piece of a library file, read by the server from Drive itself: 64 × 256 KiB. */
export const LIBRARY_PIECE = 16 * 1024 * 1024;
export const TITLE_MAX = 100;
export const DESCRIPTION_MAX_BYTES = 5000;
export const TESTS_PER_DAY = 10;
/** The scope that lets the site delete a video. Uploading needs only youtube.upload. */
export const YT_MANAGE_SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl';
/** Every upload address YouTube gives starts so; the server sends a piece nowhere else. */
export const UPLOAD_PREFIX = 'https://www.googleapis.com/upload/youtube/v3/videos?';

export type TestPrivacy = 'private' | 'public';
export type TestState = 'uploading' | 'published' | 'failed' | 'deleted';
export type TestRow = {
  id: string;
  privacy: TestPrivacy;
  title: string;
  state: TestState;
  video_id: string | null;
  shown_privacy: 'private' | 'public' | 'unlisted' | null;
  error: string | null;
  created_by: string;
  created_at: string;
  deleted_at: string | null;
};

const bytes = (s: string) => new TextEncoder().encode(s).length;

/** What is wrong with a test before it is sent, in words, or null. The database checks the same and more. */
export function testProblem(t: { title: string; description: string; size: number; mime: string }): string | null {
  const title = t.title.trim();
  if (!title) return 'اكتب عنواناً للمقطع.';
  if ([...title].length > TITLE_MAX) return `العنوان أطول من ${TITLE_MAX} حرف.`;
  if (/[<>]/.test(title) || /[<>]/.test(t.description)) return 'يرفض يوتيوب العلامتين < و> في العنوان والوصف.';
  if (bytes(t.description) > DESCRIPTION_MAX_BYTES) return 'الوصف أطول مما يقبله يوتيوب.';
  if (!/^video\/[a-z0-9.+-]{1,60}$/.test(t.mime)) return 'اختر ملف فيديو.';
  if (!Number.isInteger(t.size) || t.size < 1) return 'الملف فارغ.';
  if (t.size > TEST_MAX_BYTES) return 'التجربة تقبل مقطعاً حتى 1 غيغابايت.';
  return null;
}

/** Whether every piece but the last is the size YouTube accepts. */
export const pieceFits = (piece: number) => piece > 0 && piece % (256 * 1024) === 0;
/** The length of the piece that starts at `from`. */
export const pieceAt = (from: number, size: number, piece: number) => Math.max(0, Math.min(piece, size - from));
export const isUploadUrl = (u: unknown): u is string => typeof u === 'string' && u.length <= 4096 && u.startsWith(UPLOAD_PREFIX);

const enc = encodeURIComponent;
const isHandle = (h: string | null | undefined): h is string => typeof h === 'string' && /^@[\w.-]{3,30}$/.test(h);
/** The channel on YouTube, by its handle when it has one. */
export const channelUrl = (a: { handle: string | null; external_id?: string | null }) =>
  isHandle(a.handle) ? `https://www.youtube.com/${a.handle}` : a.external_id ? `https://www.youtube.com/channel/${enc(a.external_id)}` : null;
export const studioUrl = (externalId: string | null | undefined) => (externalId ? `https://studio.youtube.com/channel/${enc(externalId)}/videos` : null);
/** The channel's posts, where its owner writes a community post on YouTube itself. */
export const postsUrl = (a: { handle: string | null; external_id?: string | null }) => {
  const c = channelUrl(a);
  return c ? `${c}/posts` : null;
};
export const videoUrl = (id: string) => `https://www.youtube.com/watch?v=${enc(id)}`;
export const videoStudioUrl = (id: string) => `https://studio.youtube.com/video/${enc(id)}/edit`;

export const PRIVACY_AR: Record<string, string> = { private: 'خاص', public: 'عام', unlisted: 'غير مدرج' };

/** The codes of the test routes, in words. A connection code falls through to the connection's words. */
export const TEST_ERROR_AR: Record<string, string> = {
  FORBIDDEN: 'تجربة النشر لمن يدير الحسابات ولمن ينشر على هذه القناة.',
  ACCOUNT_OFF: 'الحساب موقوف. فعّله أولاً.',
  NOT_CONNECTED: 'القناة غير مربوطة الآن. أعد ربطها ثم جرّب.',
  TEST_INVALID: 'بيانات التجربة ناقصة أو غير صالحة.',
  TEST_LIMIT: `بلغت القناة ${TESTS_PER_DAY} تجارب في يوم. جرّب غداً.`,
  SCOPE_MISSING: 'لم يأذن Google للموقع بهذا بعد. أعد ربط القناة مرة واحدة ووافق على كل الصلاحيات.',
  UPLOAD_LIMIT: 'بلغ تطبيق Google حد الرفع اليومي عند يوتيوب. جرّب بعد يوم.',
  UPLOAD_EXPIRED: 'انتهت مهلة هذا الرفع عند يوتيوب. ابدأ التجربة من جديد.',
  VIDEO_REFUSED: 'رفض يوتيوب المقطع أو بياناته.',
  NO_CHANNEL: 'حساب Google هذا بلا قناة يوتيوب.',
  CHANNEL_MISMATCH: 'وصل المقطع إلى قناة غير هذه القناة، فلم يُسجَّل هنا. راجعه من YouTube Studio.',
  ABANDONED: 'تُرك الرفع قبل أن يكتمل.',
  CANCELLED: 'أُلغي الرفع.',
  FILE_UNREADABLE: 'تعذّرت قراءة الملف من المكتبة.',
  FORBIDDEN_BY_PLATFORM: 'رفض يوتيوب الطلب.',
};

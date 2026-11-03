// «تجربة النشر» on a YouTube channel's or an Instagram account's sheet (MVP_draft.md sections 71 and 72): the limits, the
// links and the words the pages, the routes and the tests share. Client-safe: no token, no fetch. The database holds the
// same limits (supabase/migrations/*platform_tests*), and tests/youtube-test.test.mjs and tests/instagram-test.test.mjs keep
// them equal.
//
// From Google's documentation as read on 2026-11-03: a title is at most 100 characters and a description 5000 bytes,
// neither may hold < or >; an upload is sent in pieces that are multiples of 256 KiB; deleting a video needs the
// youtube.force-ssl scope (or youtube), which youtube.upload does not give. The API cannot create a community post.
//
// From Meta's documentation as read on 2026-11-03: pictures are JPEG only, at most 8 MB, 4:5 to 1.91:1 for a post; a Story
// video is MP4 or MOV, 3 to 60 seconds, at most 100 MB; a Reel 3 seconds to 15 minutes, at most 300 MB (100 MB for a test
// here); a caption has at most 2200 characters, 30 hashtags and 20 mentions, and a Story none; alt text 1000 characters,
// picture posts only. Deleting needs instagram_manage_contents. Instagram has no private post.
//
// And for a Facebook Page: a post may be scheduled 10 minutes to 30 days ahead and deleted before it shows (the silent check);
// a photo is sent as a file of at most 4 MB; a Reel lasts 3 to 90 seconds, and a Page publishes at most 30 a day through
// applications. Deleting a Page post needs pages_manage_posts, which the connection already asks for.
import { copyStats } from './limits.ts';

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
  privacy: TestPrivacy | null;
  title: string;
  kind?: TestKind;
  post_url?: string | null;
  done_at?: string | null;
  state: TestState;
  video_id: string | null;
  shown_privacy: 'private' | 'public' | 'unlisted' | null;
  error: string | null;
  created_by: string;
  created_at: string;
  deleted_at: string | null;
  link?: string | null;
  scheduled_for?: string | null;
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
  FORBIDDEN: 'تجربة النشر لمن يدير الحسابات ولمن ينشر على هذا الحساب.',
  ACCOUNT_OFF: 'الحساب موقوف. فعّله أولاً.',
  NOT_CONNECTED: 'الحساب غير مربوط الآن. أعد ربطه ثم جرّب.',
  TEST_INVALID: 'بيانات التجربة ناقصة أو غير صالحة.',
  TEST_LIMIT: `بلغ الحساب ${TESTS_PER_DAY} تجارب في يوم. جرّب غداً.`,
  SCOPE_MISSING: 'لم تأذن المنصة للموقع بهذا بعد. أعد ربط الحساب مرة واحدة ووافق على كل الصلاحيات.',
  UPLOAD_LIMIT: 'بلغ تطبيق Google حد الرفع اليومي عند يوتيوب. جرّب بعد يوم.',
  UPLOAD_EXPIRED: 'انتهت مهلة هذا الرفع عند يوتيوب. ابدأ التجربة من جديد.',
  VIDEO_REFUSED: 'رفض يوتيوب المقطع أو بياناته.',
  NO_CHANNEL: 'حساب Google هذا بلا قناة يوتيوب.',
  CHANNEL_MISMATCH: 'وصل المقطع إلى قناة غير هذه القناة، فلم يُسجَّل هنا. راجعه من YouTube Studio.',
  ABANDONED: 'تُرك الرفع قبل أن يكتمل.',
  CANCELLED: 'أُلغي الرفع.',
  FILE_UNREADABLE: 'تعذّرت قراءة الملف من المكتبة.',
  FORBIDDEN_BY_PLATFORM: 'رفضت المنصة الطلب.',
  // Instagram
  MEDIA_FETCH_FAILED: 'لم يستطع إنستغرام جلب الملف من الموقع. أعد المحاولة بعد قليل.',
  MEDIA_REFUSED: 'رفض إنستغرام الملف: تحقق من نوعه ومقاسه ومدته.',
  RATIO_REFUSED: 'نسبة الصورة خارج ما يقبله إنستغرام للمنشور (من 4:5 إلى 1.91:1).',
  CAPTION_REFUSED: 'رفض إنستغرام الشرح: 2200 حرف و30 وسماً و20 إشارة على الأكثر.',
  QUOTA_REACHED: 'بلغ الحساب حد إنستغرام اليومي للنشر عبر التطبيقات. جرّب غداً.',
  ACCOUNT_RESTRICTED: 'إنستغرام يقيّد هذا الحساب الآن. افتح تطبيق إنستغرام وأكمل ما يطلبه.',
  SPAM_SUSPECTED: 'أوقف إنستغرام النشر لاشتباهه بإزعاج. انتظر قليلاً قبل تجربة أخرى.',
  PROCESSING_FAILED: 'تعذّر على إنستغرام تجهيز الملف. جرّب ملفاً آخر.',
  CONTAINER_EXPIRED: 'انتهت مهلة تجهيز المنشور عند إنستغرام. ابدأ التجربة من جديد.',
  WAIT_TOO_LONG: 'أطال إنستغرام تجهيز الملف. ابدأ التجربة من جديد بملف أقصر.',
  TEMP_UPLOAD_FAILED: 'تعذّر رفع الملف إلى المساحة المؤقتة في Google Drive.',
  TEMP_MISMATCH: 'الملف المرفوع لا يطابق هذه التجربة.',
  DRIVE_NOT_CONNECTED: 'لم يُربط Google Drive بعد، وفيه يُحفظ الملف مؤقتاً.',
  // Facebook
  PAGE_REFUSED: 'رفضت فيسبوك النشر على الصفحة: تأكد أن من ربطها يستطيع إنشاء المحتوى عليها، وأن الصفحة لا تنتظر «تفويض النشر».',
  LINK_REFUSED: 'رفضت فيسبوك الرابط. تأكد أنه يفتح للعموم.',
  REEL_LIMIT: 'بلغت الصفحة 30 ريلز في يوم عبر التطبيقات. جرّب غداً.',
  SILENT_MISMATCH: 'قرأ الفحص منشوراً لا يطابق ما أنشأه، فلم يُعدّ ناجحاً. حُذف المنشور إن أمكن.',
  SILENT_NOT_DELETED: 'أنشأ الفحص المنشور المجدول وقرأه، لكن فيسبوك رفض حذفه. احذفه من هنا أو من Meta Business Suite قبل موعده.',
  PHOTO_REFUSED: 'رفضت فيسبوك الصورة. جرّب صورة أخرى.',
};

// ---------------------------------------------------------------------------
// Instagram (MVP_draft.md section 72)
// ---------------------------------------------------------------------------
export type TestKind = 'video' | 'story_image' | 'story_video' | 'image' | 'reel' | 'fb_silent' | 'fb_text' | 'fb_photo' | 'fb_reel';
/** What the person chooses; a Story becomes a picture or a video Story by its file. */
export type IgChoice = 'story' | 'image' | 'reel';
export const IG_PICTURE_MAX = 8 * 1024 * 1024;
export const IG_VIDEO_MAX = 100 * 1024 * 1024;
export const IG_CAPTION_MAX = 2200;
export const IG_HASHTAGS_MAX = 30;
export const IG_MENTIONS_MAX = 20;
export const IG_ALT_MAX = 1000;
/** Seconds a Story video and a Reel may last. */
export const IG_SECONDS: Record<'story_video' | 'reel', [number, number]> = { story_video: [3, 60], reel: [3, 15 * 60] };
/** The widest and the tallest a picture post may be (width over height). */
export const IG_RATIO: [number, number] = [4 / 5, 1.91];
/** A picture is redrawn no wider than this: Instagram scales anything wider down. */
export const IG_PICTURE_WIDTH = 1440;
export const IG_VIDEO_TYPES = ['video/mp4', 'video/quicktime'] as const;
/** The permission that lets the site delete a post. Publishing needs instagram_content_publish. */
export const IG_MANAGE_SCOPE = 'instagram_manage_contents';
/** How long Meta has to fetch the file from the site's temporary address. */
export const IG_LINK_MINUTES = 30;
/** The page asks Meta again this often while the post is being prepared, and gives up after this long. */
export const IG_POLL_MS = 5000;
export const IG_WAIT_MS = 10 * 60 * 1000;

export const IG_KIND_AR: Record<string, string> = { story_image: 'قصة', story_video: 'قصة', image: 'منشور صورة', reel: 'ريلز', video: 'فيديو' };
export const kindOf = (choice: IgChoice, mime: string): TestKind | null =>
  choice === 'image' ? (mime === 'image/jpeg' ? 'image' : null)
  : choice === 'reel' ? ((IG_VIDEO_TYPES as readonly string[]).includes(mime) ? 'reel' : null)
  : mime === 'image/jpeg' ? 'story_image' : (IG_VIDEO_TYPES as readonly string[]).includes(mime) ? 'story_video' : null;
export const isPictureKind = (k: TestKind) => k === 'story_image' || k === 'image';

/** What is wrong with an Instagram test before it is sent, in words, or null. The database checks the same and more. */
export function igProblem(t: { kind: TestKind; size: number; mime: string; caption: string; alt: string; seconds?: number | null; ratio?: number | null }): string | null {
  const picture = isPictureKind(t.kind);
  if (picture ? t.mime !== 'image/jpeg' : !(IG_VIDEO_TYPES as readonly string[]).includes(t.mime)) return picture ? 'الصورة تُرسل JPEG.' : 'يقبل إنستغرام الفيديو MP4 أو MOV.';
  if (!Number.isInteger(t.size) || t.size < 1) return 'الملف فارغ.';
  if (t.size > (picture ? IG_PICTURE_MAX : IG_VIDEO_MAX)) return picture ? 'الصورة أكبر من 8 ميغابايت.' : 'التجربة تقبل مقطعاً حتى 100 ميغابايت.';
  if (t.kind === 'image' && t.ratio != null && (t.ratio < IG_RATIO[0] - 0.005 || t.ratio > IG_RATIO[1] + 0.005))
    return 'نسبة الصورة خارج ما يقبله إنستغرام للمنشور (من 4:5 إلى 1.91:1). اقصصها، أو انشرها قصة.';
  if ((t.kind === 'story_video' || t.kind === 'reel') && t.seconds != null) {
    const [min, max] = IG_SECONDS[t.kind];
    if (t.seconds < min) return `المقطع أقصر من ${min} ثوانٍ.`;
    if (t.seconds > max) return t.kind === 'reel' ? 'الريلز حتى 15 دقيقة.' : 'فيديو القصة حتى 60 ثانية.';
  }
  if (t.kind === 'story_image' || t.kind === 'story_video') return null;
  const s = copyStats(t.caption);
  if (s.chars > IG_CAPTION_MAX) return `الشرح أطول من ${IG_CAPTION_MAX} حرف.`;
  if (s.hashtags > IG_HASHTAGS_MAX) return `أكثر من ${IG_HASHTAGS_MAX} وسماً.`;
  if (s.mentions > IG_MENTIONS_MAX) return `أكثر من ${IG_MENTIONS_MAX} إشارة.`;
  if (t.kind === 'image' && [...t.alt].length > IG_ALT_MAX) return `النص البديل أطول من ${IG_ALT_MAX} حرف.`;
  return null;
}

/** The list's title for an Instagram test: the caption's first line, else the kind. Never holds < or >. */
export function igTitle(kind: TestKind, caption: string): string {
  const line = caption.split(/\r?\n/).find((l) => l.trim())?.trim().replace(/[<>]/g, '') ?? '';
  const t = [...line].slice(0, TITLE_MAX).join('');
  return t || `تجربة ${IG_KIND_AR[kind] ?? ''}`.trim();
}

const isIgName = (h: string | null | undefined): h is string => typeof h === 'string' && /^@?[A-Za-z0-9._]{1,30}$/.test(h);
/** The account on Instagram, by its username. */
export const igProfileUrl = (handle: string | null | undefined) => (isIgName(handle) ? `https://www.instagram.com/${encodeURIComponent(handle.replace(/^@/, ''))}/` : null);
/** A Story is gone 24 hours after it was published. */
export const storyEnds = (doneAt: string | null | undefined) => (doneAt ? new Date(Date.parse(doneAt) + 24 * 3600e3).toISOString() : null);

// ---------------------------------------------------------------------------
// Facebook (MVP_draft.md section 73)
// ---------------------------------------------------------------------------
export type FbChoice = 'silent' | 'text' | 'photo' | 'reel';
export const FB_KIND: Record<FbChoice, TestKind> = { silent: 'fb_silent', text: 'fb_text', photo: 'fb_photo', reel: 'fb_reel' };
export const FB_PHOTO_MAX = 4 * 1024 * 1024;
export const FB_VIDEO_MAX = IG_VIDEO_MAX;
/** A test message is short; Facebook's own limit is far above it. */
export const FB_MESSAGE_MAX = 5000;
export const FB_REEL_SECONDS: [number, number] = [3, 90];
/** How far ahead the silent check schedules its post: inside both of Meta's stated windows (30 and 75 days). */
export const FB_SILENT_DAYS = 28;
/** The silent check's words, so a post left behind by a refused delete says what it is. */
export const FB_SILENT_MESSAGE = 'فحص صامت من مركز الاتصال: منشور مجدول يُحذف فوراً ولا يُنشر.';
/** A request to the site's server carries a photo and its words; a little room is left under the host's 4.5 MB. */
export const FB_PHOTO_BODY_MAX = FB_PHOTO_MAX + 64 * 1024;
export const FB_KIND_AR: Record<string, string> = { fb_silent: 'فحص صامت', fb_text: 'منشور نصي', fb_photo: 'منشور صورة', fb_reel: 'ريلز' };
export const isFbKind = (k: string): k is 'fb_silent' | 'fb_text' | 'fb_photo' | 'fb_reel' => k.startsWith('fb_');

/** What is wrong with a Page test before it is sent, in words, or null. The database checks the same and more. */
export function fbProblem(t: { kind: TestKind; message: string; link: string; size?: number | null; mime?: string | null; seconds?: number | null }): string | null {
  if (t.kind === 'fb_silent') return null;
  if (t.kind === 'fb_text' && !t.message.trim() && !t.link.trim()) return 'اكتب نص المنشور.';
  if ([...t.message].length > FB_MESSAGE_MAX) return `النص أطول من ${FB_MESSAGE_MAX} حرف.`;
  if (t.link.trim()) {
    if (t.kind !== 'fb_text') return 'الرابط للمنشور النصي وحده.';
    if (!/^https:\/\/[^\s<>"]+$/.test(t.link.trim()) || t.link.trim().length > 2000) return 'الرابط يبدأ بـ https:// وبلا مسافات.';
  }
  if (t.kind === 'fb_text') return null;
  if (t.kind === 'fb_photo') {
    if (t.mime !== 'image/jpeg') return 'الصورة تُرسل JPEG.';
    if (!t.size || t.size < 1) return 'الملف فارغ.';
    if (t.size > FB_PHOTO_MAX) return 'الصورة أكبر من 4 ميغابايت.';
    return null;
  }
  if (!(IG_VIDEO_TYPES as readonly string[]).includes(t.mime ?? '')) return 'تقبل فيسبوك الريلز MP4 أو MOV.';
  if (!t.size || t.size < 1) return 'الملف فارغ.';
  if (t.size > FB_VIDEO_MAX) return 'التجربة تقبل مقطعاً حتى 100 ميغابايت.';
  if (t.seconds != null && t.seconds < FB_REEL_SECONDS[0]) return 'المقطع أقصر من 3 ثوانٍ.';
  if (t.seconds != null && t.seconds > FB_REEL_SECONDS[1]) return 'ريلز فيسبوك حتى 90 ثانية.';
  return null;
}

/** The list's title for a Page test: the text's first line, else the kind. Never holds < or >. */
export function fbTitle(kind: TestKind, message: string): string {
  if (kind === 'fb_silent') return 'فحص صامت';
  const line = message.split(/\r?\n/).find((l) => l.trim())?.trim().replace(/[<>]/g, '') ?? '';
  const t = [...line].slice(0, TITLE_MAX).join('');
  return t || `تجربة ${FB_KIND_AR[kind] ?? ''}`.trim();
}

/** The Page on Facebook, by its id. */
export const fbPageUrl = (id: string | null | undefined) => (id && /^[0-9]{5,30}$/.test(id) ? `https://www.facebook.com/${id}` : null);
/** Where a Page's scheduled posts are listed, for a silent check whose delete was refused. */
export const fbScheduledUrl = (id: string | null | undefined) =>
  id && /^[0-9]{5,30}$/.test(id) ? `https://business.facebook.com/latest/posts/scheduled_posts?asset_id=${id}` : null;

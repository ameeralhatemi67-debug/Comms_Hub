// «تجربة النشر» on a YouTube channel's or an Instagram account's sheet (MVP_draft.md sections 71 and 72): the limits, the
// links and the words the pages, the routes and the tests share. Client-safe: no token, no fetch. The database holds the
// same limits (supabase/migrations/*platform_tests*), and tests/youtube-test.test.mjs and tests/instagram-test.test.mjs keep
// them equal.
//
// From Google's documentation as read on 2026-11-03: a title is at most 100 characters and a description 5000 bytes,
// neither may hold < or >; an upload is sent in pieces that are multiples of 256 KiB; deleting a video needs the
// youtube.force-ssl scope (or youtube), which youtube.upload does not give. The API cannot create a community post.
// Read on 2026-11-05: a privacy is public, unlisted or private; status.publishAt can be set only on a private video that was
// never published, YouTube makes it public at that time, and a time already past publishes at once.
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

/** YouTube's three privacy values (videos resource, status.privacyStatus). */
export type TestPrivacy = 'private' | 'public' | 'unlisted';
/**
 * The four ways a YouTube video goes out, in YouTube Studio's order (owner directive of 2026-11-05, MVP_draft.md 71.2).
 * «مجدول» is YouTube's own: a private video with a `publishAt`, which YouTube makes public at that time by itself.
 */
export type YtChoice = 'private' | 'unlisted' | 'public' | 'scheduled';
export const YT_CHOICES: readonly YtChoice[] = ['private', 'unlisted', 'public', 'scheduled'];
export const YT_CHOICE_AR: Record<YtChoice, string> = { private: 'خاص', unlisted: 'غير مدرج', public: 'عام', scheduled: 'مجدول' };
/** One line under the choice: who sees the video. */
export const YT_CHOICE_SUB: Record<YtChoice, string> = {
  private: 'لا يراه إلا من يدير القناة.',
  unlisted: 'لا يظهر في القناة ولا في البحث، ويراه من معه الرابط فقط.',
  public: 'يراه كل من يزور القناة، ويبقى حتى يُحذف.',
  scheduled: 'يبقى خاصاً حتى موعده، ثم يجعله يوتيوب عاماً بنفسه ولو لم يكن الموقع مفتوحاً.',
};
/** What YouTube is asked for: the privacy, and the time for «مجدول». A scheduled video is private until then. */
export const ytStatus = (choice: YtChoice, at: string | null): { privacy: TestPrivacy; publishAt: string | null } =>
  choice === 'scheduled' ? { privacy: 'private', publishAt: at } : { privacy: choice, publishAt: null };
/**
 * The window of a scheduled test: the site's own rule, not YouTube's, so a test is not forgotten and made public months later.
 * The database holds the same (supabase/migrations/*platform_tests_youtube_choices*).
 */
export const YT_SCHEDULE_MIN_MINUTES = 10;
export const YT_SCHEDULE_MAX_DAYS = 30;
/** A direct post from Home's «نشر مباشر» may be scheduled further ahead than a test (MVP_draft.md 76). */
export const YT_DIRECT_SCHEDULE_MAX_DAYS = 180;
/**
 * A direct post on Instagram may be scheduled too (MVP_draft.md 76.5, answer Q3). Meta publishes at the moment it is asked, so the
 * site asks at the time: the bridge computer's loop, or the next opening of Home, said as late. The database holds the same window
 * (*direct_schedule*).
 */
export const IG_DIRECT_SCHEDULE_MAX_DAYS = 30;
/** A scheduled Instagram post that went out more than this after its time is told as late. The database holds the same. */
export const DIRECT_LATE_MINUTES = 5;
/** A scheduled Instagram post left this long past its time is given up (OVERDUE). The database holds the same. */
export const DIRECT_OVERDUE_HOURS = 24;
/** What is wrong with a scheduled time, in words, or null. A test's window is said as a test's. */
export function scheduleProblem(at: string | null, now: number = Date.now(), maxDays: number = YT_SCHEDULE_MAX_DAYS, purpose: TestPurpose = maxDays === YT_SCHEDULE_MAX_DAYS ? 'test' : 'direct'): string | null {
  const t = at ? Date.parse(at) : NaN;
  if (!Number.isFinite(t)) return 'اختر موعد النشر.';
  if (t < now + YT_SCHEDULE_MIN_MINUTES * 60e3) return `الموعد بعد ${YT_SCHEDULE_MIN_MINUTES} دقائق على الأقل.`;
  if (t > now + maxDays * 864e5) return purpose === 'test' ? `تُجدول التجربة حتى ${maxDays} يوماً من الآن.` : `يُجدول النشر حتى ${maxDays} يوماً من الآن.`;
  return null;
}
/** How many minutes after its time a scheduled Instagram post went out, when that is late; else null. */
export function lateMinutes(t: { scheduled_for?: string | null; done_at?: string | null; kind?: TestKind; state?: TestState }): number | null {
  if (t.state !== 'published' || !t.scheduled_for || !t.done_at || t.kind === 'video' || t.kind === undefined) return null;
  const late = Date.parse(t.done_at) - Date.parse(t.scheduled_for);
  return Number.isFinite(late) && late > DIRECT_LATE_MINUTES * 60e3 ? Math.ceil(late / 60e3) : null;
}

/**
 * Why a post is made: a test («تجربة النشر») or a real post from Home's «نشر مباشر» (Director_Notes_Plan.md N-2, MVP_draft.md 76).
 * Both run on the same engine and table; the database tells them apart and keeps their rules.
 */
export type TestPurpose = 'test' | 'direct';
/** Direct posts a day per account, apart from the tests. The database holds the same (*direct_publish*). */
export const DIRECT_PER_DAY = 20;
/**
 * Whether YouTube tells the channel's subscribers of a direct post: what the person chose, else yes when the video is or
 * becomes public. A test never does. The database works out the same default.
 */
export const directNotify = (privacy: TestPrivacy, scheduled: boolean, chosen: boolean | null | undefined) =>
  chosen ?? (privacy === 'public' || scheduled);
/** The choice a recorded test was sent with. */
export const choiceOf = (t: { privacy: TestPrivacy | null; scheduled_for?: string | null }): YtChoice | null =>
  t.privacy === 'private' && t.scheduled_for ? 'scheduled' : t.privacy;
/** `waiting`: a scheduled Instagram direct post, its file ready, until the due run fires it. */
export type TestState = 'uploading' | 'waiting' | 'published' | 'failed' | 'deleted';
export type TestRow = {
  id: string;
  privacy: TestPrivacy | TtPrivacy | null;
  title: string;
  kind?: TestKind;
  post_url?: string | null;
  done_at?: string | null;
  state: TestState;
  video_id: string | null;
  shown_privacy: 'private' | 'public' | 'unlisted' | null;
  /** The time YouTube said it will make a scheduled video public, read back with the video. */
  shown_publish_at?: string | null;
  purpose?: TestPurpose;
  /** A YouTube direct post: whether subscribers were told. */
  notify?: boolean | null;
  error: string | null;
  /** What the platform said beside the site's code (MVP_draft.md 79.6): TikTok's code, log id and status, or Drive's code. */
  error_detail?: string | null;
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

/**
 * A direct post's line in its account's sheet on «حسابات المنصات» (MVP_draft.md 76.6): where it stands, in words. `at` formats a
 * time as the page shows it.
 */
export function directLine(t: TestRow, now: number, at: (iso: string) => string): string {
  if (t.state === 'waiting') return t.scheduled_for ? `مجدول · يُنشر ${at(t.scheduled_for)}` : 'مجدول';
  if (t.state === 'uploading') return t.scheduled_for && Date.parse(t.scheduled_for) > now ? 'يُرفع الملف' : 'يُنشر الآن';
  if (t.state === 'deleted') return 'حُذف من المنصة';
  if (t.state === 'failed')
    return t.error === 'CANCELLED' && t.scheduled_for
      ? 'أُلغي قبل موعده'
      : `لم يكتمل${t.error ? `: ${TEST_ERROR_AR[t.error] ?? 'خطأ من المنصة.'}` : ''}${t.error_detail && DETAIL_RE.test(t.error_detail) ? ` (${t.error_detail})` : ''}`;
  if (!t.kind || t.kind === 'video') {
    if (t.scheduled_for && t.shown_publish_at) return Date.parse(t.shown_publish_at) > now ? `مجدول · يصبح عاماً ${at(t.shown_publish_at)}` : 'عام';
    return PRIVACY_AR[t.shown_privacy ?? t.privacy ?? ''] ?? 'نُشر';
  }
  if (t.kind === 'tt_draft') return 'أُرسل مسودة إلى صندوق TikTok';
  if (t.kind === 'tt_post') return `نُشر على TikTok · ${TT_PRIVACY_AR[(t.privacy ?? 'private') as TtPrivacy] ?? ''}`;
  const late = lateMinutes(t);
  return `نُشر · ${IG_KIND_AR[t.kind] ?? ''}${late ? ` · متأخراً ${late} دقيقة عن موعده` : ''}`;
}

/**
 * What another service said, as a refusal may carry it after its words: a code («DRIVE_403»), or TikTok's own line («tiktok
 * url_ownership_unverified log 2026... http 403»). Letters, digits and a few marks only, never a message or a body.
 */
export const DETAIL_RE = /^[A-Za-z0-9_.:~ -]{2,160}$/;

/** The codes of the test routes, in words. A connection code falls through to the connection's words. */
export const TEST_ERROR_AR: Record<string, string> = {
  FORBIDDEN: 'تجربة النشر لمن يدير الحسابات ولمن ينشر على هذا الحساب.',
  ACCOUNT_OFF: 'الحساب موقوف. فعّله أولاً.',
  NOT_CONNECTED: 'الحساب غير مربوط الآن. أعد ربطه ثم جرّب.',
  TEST_INVALID: 'بيانات التجربة ناقصة أو غير صالحة.',
  SCHEDULE_INVALID: `الموعد المجدول بعد ${YT_SCHEDULE_MIN_MINUTES} دقائق على الأقل، وحتى ${YT_SCHEDULE_MAX_DAYS} يوماً للتجربة ولمنشور إنستغرام، و${YT_DIRECT_SCHEDULE_MAX_DAYS} يوماً لمقطع يوتيوب مباشر.`,
  OVERDUE: 'مضى يوم على موعده ولم يُنشر، لأن جهاز الجسر كان مغلقاً ولم يُفتح الموقع. جدوله من جديد.',
  FIRING: 'يُنشر هذا المنشور الآن، فلا يُلغى. انتظر حتى يكتمل ثم احذفه إن شئت.',
  TEST_LIMIT: `بلغ الحساب ${TESTS_PER_DAY} تجارب في يوم. جرّب غداً.`,
  DIRECT_LIMIT: `بلغ الحساب ${DIRECT_PER_DAY} منشوراً مباشراً في يوم. انشر غداً.`,
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
  PUBLISHED_UNRECORDED: 'نُشر المنشور عند إنستغرام لكن تعذّر تسجيله هنا. افتح حساب إنستغرام وتأكد منه، ولا تُعد النشر.',
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
  // TikTok
  RATE_LIMIT: 'طلبات كثيرة إلى المنصة في دقيقة. انتظر قليلاً ثم جرّب.',
  TT_UNAUDITED: 'لم يدقق TikTok التطبيق بعد، فلا ينشر مباشرة إلا على حساب خاص. اجعل الحساب خاصاً في تطبيق TikTok، أو أرسل مسودة.',
  TT_URL_UNVERIFIED: 'لم يوثَّق عنوان الموقع في تطبيق TikTok، فلا يجلب TikTok الملف منه. راجع خطوة «وثّق عنوان الموقع».',
  TT_PRIVACY_MISMATCH: 'لم يعد هذا الخيار متاحاً للحساب. أعد فتح النموذج واختر من جديد.',
  TT_DAILY_CAP: 'بلغ الحساب حد TikTok اليومي للنشر عبر التطبيقات. جرّب غداً.',
  TT_PENDING_CAP: 'في صندوق الحساب على TikTok خمس مسودات لم تُكمل في يوم. أكملها أو احذفها من تطبيق TikTok أولاً.',
  TT_BANNED: 'يمنع TikTok هذا الحساب من النشر الآن. افتح تطبيق TikTok وراجع الحساب.',
  TT_FORMAT: 'رفض TikTok صيغة الملف. جرّب MP4 بترميز H.264.',
  TT_DURATION: 'مدة المقطع خارج ما يقبله TikTok لهذا الحساب.',
  TT_FRAME_RATE: 'يقبل TikTok من 23 إلى 60 إطاراً في الثانية.',
  TT_PICTURE_SIZE: 'أبعاد المقطع خارج ما يقبله TikTok (من 360 إلى 4096 بكسل).',
  TT_PULL_FAILED: 'لم يستطع TikTok جلب الملف من الموقع. أعد المحاولة بعد قليل.',
  TT_TEXT_REFUSED: 'رفض TikTok نص الشرح.',
  TT_SPAM: 'أوقف TikTok النشر لاشتباهه بإزعاج. انتظر قبل تجربة أخرى.',
  TT_WAIT_TOO_LONG: 'أطال TikTok جلب المقطع وفحصه. ابدأ من جديد بملف أصغر.',
  TT_NO_DELETE: 'لا يسمح TikTok للتطبيقات بحذف منشور. احذفه من تطبيق TikTok نفسه.',
  // Snapchat (MVP_draft.md section 85)
  SN_NO_DELETE: 'لا تتيح Snap حذف القصة عبر التطبيقات: تنتهي وحدها بعد 24 ساعة من نشرها.',
  SN_MEDIA_REFUSED: 'رفضت Snap الملف: تقبل فيديو MP4 من 5 إلى 300 ثانية.',
  SN_MEDIA_EXPIRED: 'انتهت مهلة الملف عند Snap (24 ساعة). ابدأ التجربة من جديد.',
  SN_UPLOAD_FAILED: 'تعذّر رفع الملف إلى Snap. أعد المحاولة بعد قليل.',
  SN_POST_REFUSED: 'رفضت Snap النشر. تأكد أن الملف MP4 وأن التطبيق مسموح له عند Snap.',
  SN_SILENT_MISMATCH: 'قرأ الفحص من Snap ما لا يطابق ما أنشأه، فلم يُعدّ ناجحاً. حُذف المنشور إن أمكن.',
  SN_SILENT_NOT_DELETED: 'أنشأ الفحص السبوتلايت المجدول وقرأه، لكن Snap رفضت حذفه. احذفه من هنا أو من تطبيق Snapchat قبل موعده.',
  SN_STATS_UNAVAILABLE: 'لم تعطِ Snap أرقاماً لهذا المنشور بعد: تصل عادةً بعد نحو يوم من نشره.',
  SN_TOO_BIG: 'التجربة تقبل مقطعاً حتى 30 ميغابايت.',
};

// ---------------------------------------------------------------------------
// Instagram (MVP_draft.md section 72)
// ---------------------------------------------------------------------------
export type TestKind = 'video' | 'story_image' | 'story_video' | 'image' | 'reel' | 'fb_silent' | 'fb_text' | 'fb_photo' | 'fb_reel' | 'tt_draft' | 'tt_post' | 'snap_silent' | 'snap_spotlight' | 'snap_story';
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

// ---------------------------------------------------------------------------
// TikTok (MVP_draft.md section 79)
// ---------------------------------------------------------------------------
// From TikTok's Content Posting API as read on 2026-11-15: a caption has at most 2200 UTF-16 units; TikTok fetches the file
// (MP4 or MOV here) from the site's temporary address; a draft waits in the creator's TikTok inbox, at most 5 pending in 24
// hours; an unaudited app posts only as «لي فقط» and only to a private account; the API cannot delete or schedule a post.
export type TtChoice = 'draft' | 'post';
export const TT_KIND: Record<TtChoice, TestKind> = { draft: 'tt_draft', post: 'tt_post' };
export const TT_KIND_AR: Record<string, string> = { tt_draft: 'مسودة في صندوق TikTok', tt_post: 'منشور مباشر' };
export const TT_VIDEO_MAX = IG_VIDEO_MAX;
export const TT_CAPTION_MAX = 2200;
/** TikTok's privacy levels by the site's short names, in TikTok's own order, and their words as TikTok's app says them. */
export type TtPrivacy = 'public' | 'friends' | 'followers' | 'private';
export const TT_PRIVACY_ORDER: readonly TtPrivacy[] = ['public', 'friends', 'followers', 'private'];
export const TT_PRIVACY_AR: Record<TtPrivacy, string> = { public: 'الجميع', friends: 'الأصدقاء', followers: 'المتابعون', private: 'أنا فقط' };
export const isTtKind = (k: string): k is 'tt_draft' | 'tt_post' => k === 'tt_draft' || k === 'tt_post';
/** The page asks TikTok again this often while it fetches the video, and gives up after this long. */
export const TT_POLL_MS = 5000;
export const TT_WAIT_MS = 10 * 60 * 1000;
/** TikTok's own pages the consent sentence links to. */
export const TT_MUSIC_URL = 'https://www.tiktok.com/legal/page/global/music-usage-confirmation/en';
export const TT_BRANDED_URL = 'https://www.tiktok.com/legal/page/global/bc-policy/en';

/** The length TikTok counts a caption in: UTF-16 units. */
const units = (s: string) => s.length;

/**
 * What is wrong with a TikTok test before it is sent, in words, or null. For a post, `privacy` is the person's own choice (TikTok
 * asks that none is chosen in advance), and the commercial switches follow TikTok's rules for its posting page.
 */
export function ttProblem(t: {
  kind: TestKind;
  size?: number | null;
  mime?: string | null;
  seconds?: number | null;
  maxSeconds?: number | null;
  caption: string;
  privacy?: TtPrivacy | null;
  commercial?: boolean;
  ownBrand?: boolean;
  branded?: boolean;
}): string | null {
  if (!(IG_VIDEO_TYPES as readonly string[]).includes(t.mime ?? '')) return 'يقبل TikTok هنا الفيديو MP4 أو MOV.';
  if (!t.size || t.size < 1) return 'الملف فارغ.';
  if (t.size > TT_VIDEO_MAX) return 'التجربة تقبل مقطعاً حتى 100 ميغابايت.';
  if (t.seconds != null && t.seconds < 1) return 'المقطع أقصر من ثانية.';
  if (t.seconds != null && t.maxSeconds != null && t.seconds > t.maxSeconds) return `يقبل هذا الحساب على TikTok مقطعاً حتى ${clockOf(t.maxSeconds)}.`;
  if (t.kind === 'tt_draft') return null;
  if (units(t.caption) > TT_CAPTION_MAX) return `الشرح أطول من ${TT_CAPTION_MAX} حرف.`;
  if (!t.privacy) return 'اختر من يرى المنشور.';
  if (t.commercial && !t.ownBrand && !t.branded) return 'اختر «علامتك التجارية» أو «محتوى ممول» أو كليهما، أو أطفئ الإفصاح.';
  if (t.branded && t.privacy === 'private') return 'المحتوى الممول لا يكون «أنا فقط».';
  return null;
}
const clockOf = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** The list's title for a TikTok test: the caption's first line, else the kind. Never holds < or >. */
export function ttTitle(kind: TestKind, caption: string): string {
  const line = caption.split(/\r?\n/).find((l) => l.trim())?.trim().replace(/[<>]/g, '') ?? '';
  const t = [...line].slice(0, TITLE_MAX).join('');
  return t || `تجربة ${TT_KIND_AR[kind] ?? ''}`.trim();
}

/** The label TikTok puts on a post with the commercial disclosure on. */
export function ttLabel(ownBrand: boolean, branded: boolean): string | null {
  if (branded) return 'سيُوسم المنشور «شراكة مدفوعة».';
  if (ownBrand) return 'سيُوسم المنشور «محتوى ترويجي».';
  return null;
}

// ---------------------------------------------------------------------------
// Snapchat (MVP_draft.md section 85, Snapchat_Test_Plan.md)
// ---------------------------------------------------------------------------
// From Snap's Public Profile API as read on 2026-11-26 (allowlist only, so none of it has met a real answer): a video is .mp4 of 5 to 300 seconds,
// encrypted with AES-256-CBC before it is uploaded in parts of at most 32 MB; a Story ends after 24 hours and has no delete endpoint; a Spotlight can
// be scheduled up to 30 days ahead and deleted; the numbers arrive about a day late.
export type SnKind = 'snap_silent' | 'snap_spotlight' | 'snap_story';
/** What the person chooses: a read-only check (no row, no file) or one of the three kinds. */
export type SnChoice = 'check' | 'silent' | 'spotlight' | 'story';
export const SN_KIND: Record<Exclude<SnChoice, 'check'>, SnKind> = { silent: 'snap_silent', spotlight: 'snap_spotlight', story: 'snap_story' };
export const SN_KIND_AR: Record<string, string> = { snap_silent: 'فحص صامت', snap_spotlight: 'سبوتلايت', snap_story: 'قصة' };
export const isSnKind = (k: string): k is SnKind => k === 'snap_silent' || k === 'snap_spotlight' || k === 'snap_story';
/** One part of Snap's multipart upload is at most 32 MB and the encryption adds up to 16 bytes, so a test file is kept well under it. */
export const SN_VIDEO_MAX = 30 * 1024 * 1024;
export const SN_VIDEO_TYPE = 'video/mp4';
export const SN_SECONDS: [number, number] = [5, 300];
/** The test's title is the table's (100 characters); Snap allows 160 in a Spotlight's description. */
export const SN_DESCRIPTION_MAX = 100;
/** The silent check's Spotlight is scheduled this far ahead (Snap allows up to 30 days). */
export const SN_SILENT_DAYS = 14;
/** A Story posted with the default time stays this long. */
export const SN_STORY_HOURS = 24;
export const SN_SILENT_TITLE = 'فحص صامت من مركز الاتصال';
export const SN_STORY_TITLE = 'قصة تجربة من مركز الاتصال';
/** Snap's numbers: «usually synchronize after 24 hours», reaching back 90 days. */
export const SN_STATS_NOTE = 'تصل أرقام Snap عادةً بعد نحو يوم من النشر، وتعود إلى 90 يوماً. منشور حُذف فوراً لا أرقام له.';

/** What is wrong with a Snapchat test before it is sent, in words, or null. The database checks the same and more. */
export function snProblem(t: { kind: string; size?: number | null; mime?: string | null; description: string; seconds?: number | null }): string | null {
  if (!isSnKind(t.kind)) return 'بيانات التجربة ناقصة أو غير صالحة.';
  if (t.mime !== SN_VIDEO_TYPE) return 'تقبل Snap هنا الفيديو MP4.';
  if (!t.size || t.size < 1) return 'الملف فارغ.';
  if (t.size > SN_VIDEO_MAX) return TEST_ERROR_AR.SN_TOO_BIG;
  if (t.seconds != null && t.seconds < SN_SECONDS[0]) return 'المقطع أقصر من 5 ثوانٍ.';
  if (t.seconds != null && t.seconds > SN_SECONDS[1]) return 'المقطع أطول من 5 دقائق.';
  if (t.kind === 'snap_spotlight') {
    if ([...t.description].length > SN_DESCRIPTION_MAX) return `الوصف أطول من ${SN_DESCRIPTION_MAX} حرف.`;
    if (/[<>]/.test(t.description)) return 'الوصف لا يحمل < أو >.';
  }
  return null;
}

/** The list's title for a Snapchat test: the Spotlight's description, else the kind's own words. Never holds < or >. */
export function snTitle(kind: TestKind, description: string): string {
  if (kind === 'snap_silent') return SN_SILENT_TITLE;
  if (kind === 'snap_story') return SN_STORY_TITLE;
  const line = description.split(/\r?\n/).find((l) => l.trim())?.trim().replace(/[<>]/g, '') ?? '';
  return [...line].slice(0, SN_DESCRIPTION_MAX).join('') || 'تجربة سبوتلايت من مركز الاتصال';
}

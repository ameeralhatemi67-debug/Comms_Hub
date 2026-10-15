// What a platform accepts, and the check of one copy against it (the post preview, Step 5 of
// Readiness_Audit.md). Pure: no database, no React. The limits are data in `platforms.accepts`
// (supabase/migrations/*platform_limits*); this file reads them, counts a copy, and words what is
// wrong. The preview, the review screen, the scheduling dialog and, later, a platform adapter's
// validate step all call `checkCopy`, so one rule answers everywhere.
//
// Every number here says where it came from (`note`) and when it was read from the platform's own
// documentation (`checked`). A number nobody could confirm is left out rather than guessed, and a
// number taken from a platform's public help rather than its API reference says so.

export type Limits = {
  /** A work published here needs a video (YouTube, TikTok). Enforced by the database. */
  video_only?: boolean;
  /** Longest text, in characters (code points). */
  max_chars?: number;
  max_hashtags?: number;
  max_images?: number;
  max_videos?: number;
  /** Images and videos together, when the platform counts them as one list (a carousel). */
  max_media?: number;
  /** The first line of the copy is the title and the rest the description (YouTube). */
  title_max?: number;
  description_max_bytes?: number;
  /** Characters shown before the platform folds the text behind «المزيد». Approximate. */
  fold_chars?: number;
  /** What every link counts as, whatever its length (X). */
  url_chars?: number;
  /** Longest video, in seconds. Information only: the library does not know a file's length. */
  max_video_seconds?: number;
  /** Where the numbers came from, in Arabic. */
  note?: string;
  /** The day they were last read from the platform's documentation (YYYY-MM-DD). */
  checked?: string;
};

const NUM_KEYS = ['max_chars', 'max_hashtags', 'max_images', 'max_videos', 'max_media', 'title_max', 'description_max_bytes', 'fold_chars', 'url_chars', 'max_video_seconds'] as const;
export type LimitKey = (typeof NUM_KEYS)[number];
export const LIMIT_KEYS: readonly LimitKey[] = NUM_KEYS;

/** Reads the limits out of a registry row's `accepts`, ignoring anything that is not a sane number. */
export function limitsOf(accepts: Record<string, unknown> | null | undefined): Limits {
  const a = accepts ?? {};
  const out: Limits = {};
  if (a.video_only === true) out.video_only = true;
  for (const k of NUM_KEYS) {
    const v = a[k];
    if (typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 1_000_000) out[k] = v;
  }
  if (typeof a.limits_note === 'string' && a.limits_note.trim()) out.note = a.limits_note.trim().slice(0, 300);
  if (typeof a.limits_checked === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.limits_checked)) out.checked = a.limits_checked;
  return out;
}

/** The keys of `accepts` that carry the limits: what the registry stores and platform_save accepts. */
export function limitsToAccepts(l: Limits): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of NUM_KEYS) if (l[k] != null) out[k] = l[k];
  if (l.note) out.limits_note = l.note;
  if (l.checked) out.limits_checked = l.checked;
  return out;
}

// ---------------------------------------------------------------------------
// The limits the built-in platforms and the ready-made templates start with. They equal what the
// migration seeds (tests/preview.test.mjs keeps them so).
// ---------------------------------------------------------------------------
const OFFICIAL = '2026-10-15';

export const BUILTIN_LIMITS: Record<string, Limits> = {
  instagram: {
    max_chars: 2200,
    max_hashtags: 30,
    max_media: 10,
    fold_chars: 125,
    note: 'عدد العناصر (10 في الدوّارة) من وثائق Instagram الرسمية. طول الشرح (2200) وعدد الوسوم (30) وبداية «المزيد» (نحو 125) من مساعدة إنستغرام العامة لا من وثائق الواجهة، فتحقق منها عند الربط.',
    checked: OFFICIAL,
  },
  x: {
    max_chars: 280,
    max_images: 4,
    max_videos: 1,
    url_chars: 23,
    note: 'عدد الوسائط (4 صور أو فيديو واحد) من وثائق X الرسمية. 280 حرفاً لحساب عادي وعدّ الرابط 23 حرفاً من مساعدة X العامة لا من وثائق الواجهة. حساب Premium يسمح بأكثر.',
    checked: OFFICIAL,
  },
  linkedin: {
    max_chars: 3000,
    note: 'وثائق لينكدإن تذكر رفض النص الأطول من الحد دون رقم. الرقم 3000 من مساعدة لينكدإن العامة، فتحقق منه عند الربط.',
    checked: OFFICIAL,
  },
  youtube: {
    video_only: true,
    max_videos: 1,
    title_max: 100,
    description_max_bytes: 5000,
    note: 'العنوان 100 حرف والوصف 5000 بايت (حرف عربي = بايتان) من وثائق YouTube Data API الرسمية. السطر الأول من النسخة هو العنوان والباقي الوصف.',
    checked: OFFICIAL,
  },
};

/** Limits a template sets when the platform is added from «الإعدادات». */
export const TEMPLATE_LIMITS: Record<string, Limits> = {
  facebook: {
    note: 'وثائق صفحات فيسبوك لا تذكر حداً لطول النص، فلا يُفرض حد. الجدولة من 10 دقائق إلى 30 يوماً بعد الطلب (من الوثائق الرسمية).',
    checked: OFFICIAL,
  },
  tiktok: {
    video_only: true,
    max_chars: 2200,
    max_videos: 1,
    max_video_seconds: 600,
    note: 'الوصف حتى 2200 حرف، والفيديو حتى 10 دقائق و4 غيغابايت عبر الواجهة (وثائق TikTok الرسمية). قد يكون حد حساب الناشر أقل، وتُقرأ مدته من الحساب عند الربط. قبل تدقيق التطبيق يُقيَّد النشر بالخصوصية الخاصة.',
    checked: OFFICIAL,
  },
  snapchat: { note: 'لا مسار نشر رسمي معروف ولا حدود موثقة، فلا يُفرض حد.' },
  whatsapp_channel: { note: 'لا واجهة رسمية للقنوات ولا حدود موثقة، فلا يُفرض حد.' },
  whatsapp_status: { note: 'لا واجهة رسمية للحالات ولا حدود موثقة، فلا يُفرض حد.' },
};

// ---------------------------------------------------------------------------
// Counting a copy
// ---------------------------------------------------------------------------
const LINK_RE = /https?:\/\/[^\s]+/giu;
const TAG_RE = /(^|[\s(])#[\p{L}\p{N}_]+/gu;
const MENTION_RE = /(^|[\s(])@[\p{L}\p{N}_.]+/gu;

export type CopyStats = { chars: number; bytes: number; hashtags: number; mentions: number; links: number; lines: number };

const utf8 = (s: string) => {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
};

export function copyStats(text: string): CopyStats {
  const t = text ?? '';
  return {
    chars: [...t].length,
    bytes: utf8(t),
    hashtags: (t.match(TAG_RE) ?? []).length,
    mentions: (t.match(MENTION_RE) ?? []).length,
    links: (t.match(LINK_RE) ?? []).length,
    lines: t ? t.split(/\r?\n/).length : 0,
  };
}

/** Characters counted against `max_chars`: a link counts as `url_chars` where the platform does so. */
export function countedChars(text: string, l: Limits): number {
  const t = text ?? '';
  if (!l.url_chars) return [...t].length;
  const links = t.match(LINK_RE) ?? [];
  const without = t.replace(LINK_RE, '');
  return [...without].length + links.length * l.url_chars;
}

/** The title and the description when the copy's first line is a title (YouTube). */
export function splitTitle(text: string): { title: string; description: string } {
  const t = (text ?? '').replace(/^\s+/, '');
  const i = t.search(/\r?\n/);
  if (i < 0) return { title: t.trim(), description: '' };
  return { title: t.slice(0, i).trim(), description: t.slice(i).trim() };
}

/** The part shown before the platform's «المزيد», cut at a word. */
export function foldOf(text: string, fold: number | undefined): { shown: string; hidden: string } {
  const t = text ?? '';
  const chars = [...t];
  if (!fold || chars.length <= fold) return { shown: t, hidden: '' };
  let cut = fold;
  const space = chars.slice(0, fold).lastIndexOf(' ');
  if (space > fold * 0.6) cut = space;
  return { shown: chars.slice(0, cut).join(''), hidden: chars.slice(cut).join('') };
}

// ---------------------------------------------------------------------------
// Checking a copy
// ---------------------------------------------------------------------------
export type Level = 'error' | 'warn' | 'info';
export type Issue = { code: string; level: Level; text: string };
export type Counter = { key: string; label: string; used: number; max: number | null; unit: string; level: 'ok' | 'near' | 'over' };
export type CopyInput = { text: string; images: number; videos: number; /** The work itself is of the video type. */ typeVideo?: boolean };
export type Check = { issues: Issue[]; counters: Counter[]; stats: CopyStats; ok: boolean };

const level = (used: number, max: number | null): Counter['level'] => (max == null ? 'ok' : used > max ? 'over' : used >= Math.ceil(max * 0.9) ? 'near' : 'ok');

export function checkCopy(l: Limits, c: CopyInput): Check {
  const issues: Issue[] = [];
  const counters: Counter[] = [];
  const stats = copyStats(c.text);
  const blank = !c.text.trim();
  const media = c.images + c.videos;
  if (blank && media === 0) issues.push({ code: 'EMPTY', level: 'error', text: 'لا نص ولا ملف: لا شيء يُنشر.' });
  else if (blank) issues.push({ code: 'NO_TEXT', level: 'warn', text: 'لا نص مع الملف. يُنشر الملف وحده.' });

  if (l.title_max || l.description_max_bytes) {
    const { title, description } = splitTitle(c.text);
    const tl = [...title].length;
    if (l.title_max) {
      counters.push({ key: 'title', label: 'العنوان', used: tl, max: l.title_max, unit: 'حرفاً', level: level(tl, l.title_max) });
      if (tl > l.title_max) issues.push({ code: 'TITLE_TOO_LONG', level: 'error', text: `العنوان (السطر الأول) ${tl} حرفاً والحد ${l.title_max}.` });
      if (!blank && !title) issues.push({ code: 'NO_TITLE', level: 'error', text: 'السطر الأول فارغ، وهو عنوان الفيديو.' });
      if (/[<>]/.test(title)) issues.push({ code: 'TITLE_BRACKETS', level: 'error', text: 'العنوان لا يقبل الرمزين < و >.' });
    }
    if (l.description_max_bytes) {
      const b = utf8(description);
      counters.push({ key: 'description', label: 'الوصف', used: b, max: l.description_max_bytes, unit: 'بايت', level: level(b, l.description_max_bytes) });
      if (b > l.description_max_bytes) issues.push({ code: 'DESCRIPTION_TOO_LONG', level: 'error', text: `الوصف ${b} بايت والحد ${l.description_max_bytes} (الحرف العربي بايتان).` });
      if (/[<>]/.test(description)) issues.push({ code: 'DESCRIPTION_BRACKETS', level: 'error', text: 'الوصف لا يقبل الرمزين < و >.' });
    }
  }
  if (l.max_chars) {
    const used = countedChars(c.text, l);
    counters.push({ key: 'chars', label: 'النص', used, max: l.max_chars, unit: 'حرفاً', level: level(used, l.max_chars) });
    if (used > l.max_chars) issues.push({ code: 'TOO_LONG', level: 'error', text: `النص ${used} حرفاً والحد ${l.max_chars}. اختصره بـ ${used - l.max_chars}.` });
    else if (used >= Math.ceil(l.max_chars * 0.9)) issues.push({ code: 'NEAR_LIMIT', level: 'warn', text: `النص قريب من الحد: ${used} من ${l.max_chars}.` });
  }
  if (l.max_hashtags) {
    counters.push({ key: 'hashtags', label: 'الوسوم', used: stats.hashtags, max: l.max_hashtags, unit: 'وسماً', level: level(stats.hashtags, l.max_hashtags) });
    if (stats.hashtags > l.max_hashtags) issues.push({ code: 'TOO_MANY_HASHTAGS', level: 'error', text: `${stats.hashtags} وسماً والحد ${l.max_hashtags}.` });
  }
  if (l.max_images != null) {
    counters.push({ key: 'images', label: 'الصور', used: c.images, max: l.max_images, unit: 'صورة', level: level(c.images, l.max_images) });
    if (c.images > l.max_images) issues.push({ code: 'TOO_MANY_IMAGES', level: 'error', text: `${c.images} صور والحد ${l.max_images}.` });
  }
  if (l.max_videos != null) {
    counters.push({ key: 'videos', label: 'الفيديو', used: c.videos, max: l.max_videos, unit: 'ملف', level: level(c.videos, l.max_videos) });
    if (c.videos > l.max_videos) issues.push({ code: 'TOO_MANY_VIDEOS', level: 'error', text: `${c.videos} ملفات فيديو والحد ${l.max_videos}.` });
  }
  if (l.max_media != null) {
    counters.push({ key: 'media', label: 'الوسائط', used: media, max: l.max_media, unit: 'عنصراً', level: level(media, l.max_media) });
    if (media > l.max_media) issues.push({ code: 'TOO_MANY_MEDIA', level: 'error', text: `${media} عناصر والحد ${l.max_media}.` });
  }
  if (l.max_images != null && l.max_videos != null && c.images > 0 && c.videos > 0) {
    issues.push({ code: 'MIXED_MEDIA', level: 'error', text: 'هذه المنصة لا تجمع صوراً وفيديو في منشور واحد.' });
  }
  if (l.video_only && c.videos === 0) {
    // The database accepts a work of the video type without a file (work_youtube_ok), so that case warns.
    if (c.typeVideo) issues.push({ code: 'VIDEO_FILE_MISSING', level: 'warn', text: 'العمل من نوع «فيديو» لكن لا ملف فيديو مرتبطاً به بعد.' });
    else issues.push({ code: 'VIDEO_REQUIRED', level: 'error', text: 'تقبل الفيديو فقط. أرفق ملف فيديو من المكتبة.' });
  }
  if (l.fold_chars && stats.chars > l.fold_chars) {
    issues.push({ code: 'FOLD', level: 'info', text: `يظهر نحو ${l.fold_chars} حرفاً قبل «المزيد». ضع أهم ما في البداية.` });
  }
  if (l.max_video_seconds && c.videos > 0) {
    issues.push({ code: 'VIDEO_LENGTH', level: 'info', text: `أطول فيديو تقبله ${Math.round(l.max_video_seconds / 60)} دقائق. مدة الملف لا يعرفها الموقع، فتأكد منها.` });
  }
  return { issues, counters, stats, ok: !issues.some((i) => i.level === 'error') };
}

/** One line for a list: «تجاوز الحد» or the first warning, or nothing when the copy is clean. */
export function headline(c: Check): string {
  const e = c.issues.find((i) => i.level === 'error');
  if (e) return e.text;
  const w = c.issues.find((i) => i.level === 'warn');
  return w ? w.text : '';
}

// ---------------------------------------------------------------------------
// How the preview is drawn
// ---------------------------------------------------------------------------
export type Layout = 'square' | 'feed' | 'video' | 'text';
const LAYOUTS: Record<string, Layout> = {
  instagram: 'square',
  facebook: 'feed',
  x: 'feed',
  linkedin: 'feed',
  youtube: 'video',
  tiktok: 'video',
  snapchat: 'video',
  whatsapp_channel: 'text',
  whatsapp_status: 'text',
};
export const layoutOf = (key: string): Layout => LAYOUTS[key] ?? 'feed';

/** The Arabic words of one issue code's level, for a badge. */
export const LEVEL_AR: Record<Level, string> = { error: 'يمنع النشر', warn: 'تنبيه', info: 'للعلم' };

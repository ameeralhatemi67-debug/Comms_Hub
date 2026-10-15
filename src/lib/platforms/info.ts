// The words and the knowledge of the platform registry (Settings_Integrations_Plan.md 8.5).
// Pure. The database holds the registry and the readiness (supabase/migrations/*platform_registry*);
// this file holds what the interface says about each platform: what it can publish, what it asks
// of the department outside the site, how long that usually takes, and where its own
// documentation is. The facts of a platform change often and none of this was re-read from the
// platform's official documentation when it was written (`checked` is null): the info card says
// so, and the readiness tracker is how the owner records what is true for the department.
import type { PublishMode, Readiness } from '../work/rules.ts';
import { TEMPLATE_LIMITS, type Limits } from './limits.ts';

export const MODE_AR: Record<PublishMode, string> = {
  auto: 'نشر تلقائي',
  assisted: 'نشر مساعد',
  manual: 'مهمة يدوية',
};
export const MODE_HELP_AR: Record<PublishMode, string> = {
  auto: 'يرسل الموقع المنشور إلى المنصة بنفسه عبر واجهتها الرسمية.',
  assisted: 'يجهّز الموقع المنشور (النص والملف ورابط الفتح) ويؤكد مسؤول النشر أنه نُشر، فيُسجَّل.',
  manual: 'مهمة لمسؤول النشر بالحزمة نفسها، ويُسجَّل إنجازها بيده. احتياط حين لا يوجد مسار آمن للأتمتة.',
};

export const READINESS_ORDER: Readiness[] = ['not_started', 'preparing', 'submitted', 'approved', 'live'];
export const READINESS_AR: Record<Readiness, string> = {
  not_started: 'لم يبدأ',
  preparing: 'قيد التجهيز',
  submitted: 'قُدّم للمراجعة',
  approved: 'اعتُمد',
  live: 'يعمل',
};
export const READINESS_HELP_AR: Record<Readiness, string> = {
  not_started: 'لم يُفتح تطبيق مطوّر ولا طلب توثيق.',
  preparing: 'يُجهَّز تطبيق المطوّر أو التوثيق التجاري أو الأوراق المطلوبة.',
  submitted: 'قُدّم طلب المراجعة أو التدقيق وبانتظار قرار المنصة.',
  approved: 'وافقت المنصة، ولم يُبنَ بعد ربط الموقع بها.',
  live: 'الربط يعمل ونشر الموقع عبره حقيقي.',
};
export const READINESS_TONE: Record<Readiness, string> = { not_started: '', preparing: 'warn', submitted: 'warn', approved: 'success', live: 'success' };

export const KIND_AR: Record<'social' | 'mail', string> = { social: 'منصة اجتماعية', mail: 'قناة بريد' };

export type PlatformKnowledge = {
  can: string;
  cannot: string;
  requires: string[];
  lead: string;
  connect: string;
  docs: string | null;
  /** When the facts were last read from the platform's official documentation: never so far. */
  checked: string | null;
};

const meta = 'يحتاج تطبيق مطوّر في Meta وتوثيق النشاط التجاري ومراجعة التطبيق (App Review) لصلاحيات النشر.';

/** What is known per platform key, for the platforms the registry holds and those it may be given. */
export const KNOWLEDGE: Record<string, PlatformKnowledge> = {
  instagram: {
    can: 'منشور بصورة أو فيديو أو دوّارة، وفيديو قصير، عبر واجهة Graph API لحساب احترافي.',
    cannot: 'لا يُنشر على حساب شخصي، ولا تُجدول الأنواع كلها بالطريقة نفسها.',
    requires: ['حساب إنستغرام احترافي (تجاري أو منشئ محتوى) مرتبط بصفحة فيسبوك', 'تطبيق في Meta for Developers', meta],
    lead: 'من أيام إلى أسابيع بحسب المراجعة.',
    connect: 'تسجيل دخول Meta (OAuth) واختيار الصفحة والحساب. يلزم تجديد التفويض عند انتهائه.',
    docs: 'https://developers.facebook.com/docs/instagram-platform/',
    checked: null,
  },
  facebook: {
    can: 'منشور نصي أو بصورة أو فيديو على صفحة فيسبوك، ويمكن جدولته، عبر Graph API.',
    cannot: 'لا يُنشر على ملف شخصي ولا على مجموعة بهذا المسار.',
    requires: ['صفحة فيسبوك يديرها حساب مسؤول', 'تطبيق في Meta for Developers (التطبيق نفسه مع إنستغرام)', meta],
    lead: 'من أيام إلى أسابيع بحسب المراجعة.',
    connect: 'تسجيل دخول Meta (OAuth) واختيار الصفحة. رمز الصفحة يُحفظ في الخادم وحده.',
    docs: 'https://developers.facebook.com/docs/pages-api/',
    checked: null,
  },
  x: {
    can: 'تغريدة نصية أو بوسائط عبر X API v2.',
    cannot: 'النشر عبر الواجهة يعتمد على مستوى اشتراك مدفوع، وقد لا يتوفر في المستوى المجاني.',
    requires: ['حساب مطوّر وتطبيق في X', 'مستوى اشتراك يسمح بالنشر'],
    lead: 'فوري عادةً بعد الاشتراك.',
    connect: 'تسجيل دخول X (OAuth 2.0 مع PKCE). تنتهي الرموز وتُجدَّد.',
    docs: 'https://developer.x.com/en/docs/x-api',
    checked: null,
  },
  linkedin: {
    can: 'منشور نصي أو بصورة أو فيديو على صفحة المؤسسة.',
    cannot: 'النشر نيابةً عن صفحات المؤسسات يحتاج موافقة شراكة على واجهة إدارة المجتمع.',
    requires: ['صفحة مؤسسة على لينكدإن', 'طلب شراكة لواجهة Community Management وموافقة لينكدإن'],
    lead: 'أسابيع في الغالب.',
    connect: 'تسجيل دخول لينكدإن (OAuth) واختيار الصفحة. تنتهي الرموز وتُجدَّد.',
    docs: 'https://learn.microsoft.com/en-us/linkedin/marketing/',
    checked: null,
  },
  youtube: {
    can: 'رفع فيديو بعنوان ووصف وصورة مصغّرة وخصوصية، طويلاً أو Shorts، عبر YouTube Data API.',
    cannot: 'فيديو فقط. للرفع حصة يومية، وتحتاج شاشة موافقة Google إلى تحقق قبل الاستعمال العام.',
    requires: ['قناة يوتيوب', 'مشروع Google Cloud وشاشة موافقة OAuth', 'تحقق Google للتطبيق وزيادة الحصة عند الحاجة'],
    lead: 'من أيام إلى أسابيع.',
    connect: 'تسجيل دخول Google (OAuth) واختيار القناة. رمز التحديث يُحفظ في الخادم وحده.',
    docs: 'https://developers.google.com/youtube/v3',
    checked: null,
  },
  tiktok: {
    can: 'رفع فيديو أو إرساله مسودة عبر Content Posting API.',
    cannot: 'قبل اجتياز تدقيق التطبيق تُقيَّد المنشورات بالخصوصية الخاصة وعدد محدود.',
    requires: ['حساب مطوّر وتطبيق في TikTok', 'تدقيق التطبيق (Audit) لصلاحية النشر'],
    lead: 'أسابيع في الغالب.',
    connect: 'تسجيل دخول TikTok (OAuth). تنتهي الرموز وتُجدَّد.',
    docs: 'https://developers.tiktok.com/doc/content-posting-api-get-started',
    checked: null,
  },
  snapchat: {
    can: 'لا مسار نشر عام معروف للمؤسسات عبر واجهة.',
    cannot: 'يُفترض أن النشر يدوي حتى يثبت مسار رسمي آمن.',
    requires: ['البحث في وثائق Snap الرسمية قبل الاعتماد على أي مسار'],
    lead: 'غير معروفة.',
    connect: 'لا ربط تلقائي: مهمة يدوية لمسؤول النشر بحزمة جاهزة.',
    docs: null,
    checked: null,
  },
  whatsapp_channel: {
    can: 'نشر تحديث في قناة واتساب.',
    cannot: 'الواجهة الرسمية لا تغطي القنوات حسب المعروف. الجسر غير الرسمي قد يُحجب ويؤثر في رقم الإشعارات.',
    requires: ['قناة واتساب يديرها رقم المؤسسة', 'قرار بقبول مخاطر المسار غير الرسمي إن اختير'],
    lead: 'غير معروفة.',
    connect: 'تبدأ مهمة يدوية. أي أتمتة لاحقة تمرّ بجسر منفصل عن جسر الإشعارات حتى لا يختلط الحجب بين الغرضين.',
    docs: null,
    checked: null,
  },
  whatsapp_status: {
    can: 'نشر حالة واتساب من رقم المؤسسة.',
    cannot: 'لا مسار رسمي معروف. الأتمتة غير الرسمية قد تُحجب.',
    requires: ['رقم المؤسسة', 'قرار بقبول مخاطر المسار غير الرسمي إن اختير'],
    lead: 'غير معروفة.',
    connect: 'تبدأ مهمة يدوية بحزمة جاهزة (النص والملف).',
    docs: null,
    checked: null,
  },
  mail: {
    can: 'البيانات والردود الرسمية من صندوق القسم المشترك في Gmail. هذا حقيقي اليوم.',
    cannot: 'لا يُنشر عبره على منصة اجتماعية.',
    requires: ['كلمة مرور تطبيق Google لصندوق القسم، وهي مضبوطة في الخادم'],
    lead: 'قائم.',
    connect: 'IMAP وSMTP بكلمة مرور تطبيق. يُزامَن الصندوق حين تُفتح صفحة البريد.',
    docs: null,
    checked: null,
  },
};

/** Platforms the department may add to the registry in one step: not in it yet, with sensible defaults. */
export type PlatformTemplate = { key: string; label_ar: string; publish_mode: PublishMode; requires_review: boolean; video_only: boolean; limits: Limits };
export const PLATFORM_TEMPLATES: PlatformTemplate[] = [
  { key: 'facebook', label_ar: 'فيسبوك', publish_mode: 'assisted', requires_review: true, video_only: false, limits: TEMPLATE_LIMITS.facebook },
  { key: 'tiktok', label_ar: 'تيك توك', publish_mode: 'assisted', requires_review: true, video_only: true, limits: TEMPLATE_LIMITS.tiktok },
  { key: 'snapchat', label_ar: 'سناب شات', publish_mode: 'manual', requires_review: false, video_only: false, limits: TEMPLATE_LIMITS.snapchat },
  { key: 'whatsapp_channel', label_ar: 'قناة واتساب', publish_mode: 'manual', requires_review: false, video_only: false, limits: TEMPLATE_LIMITS.whatsapp_channel },
  { key: 'whatsapp_status', label_ar: 'حالة واتساب', publish_mode: 'manual', requires_review: false, video_only: false, limits: TEMPLATE_LIMITS.whatsapp_status },
];

/** The registry's own errors, in words. */
export function platformError(message: string | null | undefined): string {
  const m = message ?? '';
  const table: [string, string][] = [
    ['PLATFORM_IN_USE', 'عليها حسابات أو نسخ نصوص. أوقف حساباتها أو احذفها أولاً، ولا تُحذف منصة استُعملت.'],
    ['PLATFORM_BUILTIN', 'منصة أساسية في المركز: لا تُحذف ولا يتغير اسمها ولا تُوقف.'],
    ['PLATFORM_KEY_INVALID', 'المعرّف حروف إنجليزية صغيرة وأرقام وشرطة سفلية، ويبدأ بحرف.'],
    ['LABEL_REQUIRED', 'اكتب اسماً للمنصة بالعربية، حتى 40 حرفاً.'],
    ['MODE_INVALID', 'اختر مساراً من الثلاثة.'],
    ['URL_INVALID', 'الرابط يبدأ بـ https وطوله حتى 300 حرف.'],
    ['LIFE_INVALID', 'مدة التفويض من يوم إلى 3650 يوماً.'],
    ['LIMIT_INVALID', 'الحد عدد صحيح من 1 إلى 1000000، أو اتركه فارغاً بلا حد.'],
    ['LIMIT_NOTE_INVALID', 'مصدر الحدود حتى 300 حرف، وتاريخ المراجعة بصيغة سنة-شهر-يوم.'],
    ['READINESS_INVALID', 'حالة غير معروفة.'],
    ['UNKNOWN_PLATFORM', 'المنصة غير موجودة.'],
    ['APPEND_ONLY', 'السجل يُكتب ولا يُعدّل.'],
    ['FORBIDDEN', 'لا تملك «إدارة المنصات وتطبيقاتها».'],
  ];
  for (const [code, text] of table) if (m.includes(code)) return text;
  if (m.includes('duplicate key')) return 'هذه المنصة مضافة بالفعل.';
  return 'تعذّر تنفيذ الطلب. أعد المحاولة.';
}

/** One line of the platform's log, in Arabic. */
export function platformEventLine(e: { kind: string; actor_name: string | null; data: Record<string, unknown> }): string {
  const who = e.actor_name ?? 'النظام';
  const d = e.data ?? {};
  switch (e.kind) {
    case 'created':
      return `${who} أضاف المنصة${d.label ? ` «${String(d.label)}»` : ''}.`;
    case 'enabled':
      return `${who} فعّل المنصة لإضافة حسابات.`;
    case 'disabled':
      return `${who} أوقف المنصة لإضافة حسابات جديدة.`;
    case 'readiness': {
      const to = READINESS_AR[d.to as Readiness] ?? '';
      const from = READINESS_AR[d.from as Readiness] ?? '';
      return `${who} نقل التجهيز من «${from}» إلى «${to}»${d.note ? `: ${String(d.note)}` : ''}.`;
    }
    case 'updated': {
      const parts = [
        d.mode ? `المسار المخطط «${MODE_AR[d.mode as PublishMode] ?? ''}»` : '',
        d.video_only === true ? 'تقبل الفيديو فقط' : d.video_only === false ? 'لا تقتصر على الفيديو' : '',
        d.label ? `الاسم «${String(d.label)}»` : '',
        d.limits === true ? 'حدود النشر' : '',
      ].filter(Boolean);
      return `${who} عدّل المنصة${parts.length ? `: ${parts.join('، ')}` : ''}.`;
    }
    case 'deleted':
      return `${who} حذف المنصة${d.label ? ` «${String(d.label)}»` : ''}.`;
    default:
      return `${who}: حدث.`;
  }
}

// ---------------------------------------------------------------------------
// Connection health, in words (the codes come from src/lib/platforms/oauth.ts)
// ---------------------------------------------------------------------------
export const CONN_ERROR_AR: Record<string, string> = {
  TOKEN_REFUSED: 'رفضت المنصة الرمز. أعد ربط الحساب.',
  TOKEN_EXPIRED: 'انتهى الرمز. أعد ربط الحساب.',
  PERMISSION_REVOKED: 'سُحبت صلاحية من التطبيق. أعد الربط ووافق على كل الصلاحيات.',
  NOT_CONNECTED: 'لا رمز محفوظاً لهذا الحساب. اربطه.',
  DISCONNECTED: 'فُصل الحساب عمداً. اربطه من جديد لتعود الصلاحية.',
  RATE_LIMIT: 'المنصة تحدّ الطلبات الآن. أعد الفحص بعد قليل.',
  PLATFORM_DOWN: 'المنصة لا تستجيب الآن.',
  PLATFORM_ERROR: 'ردّت المنصة بخطأ غير معروف.',
  UNREACHABLE: 'تعذّر الوصول إلى المنصة.',
  APP_NOT_CONFIGURED: 'تطبيق المطوّر غير مضبوط. أدخل معرّفه وسره من «الإعدادات» «المنصات».',
  APP_REFUSED: 'رفضت المنصة المعرّف أو السر. تحقق منهما في لوحة المطوّرين.',
  CODE_REFUSED: 'رفضت المنصة رمز الدخول. ابدأ الربط من جديد.',
  REFRESH_MISSING: 'لم تُعطِ المنصة رمزاً للتجديد. أزل وصول التطبيق من حسابك على المنصة ثم أعد الربط.',
};
export const connErrorAr = (code: string | null | undefined) => (code ? (CONN_ERROR_AR[code] ?? 'فشل فحص الاتصال.') : '');

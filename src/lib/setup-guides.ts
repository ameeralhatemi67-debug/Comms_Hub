// The "how do I set this up" steps of every outside connection, kept in the site so a person can
// follow them from the screen that needs them (the setup sheet of «المنصات», or the circled "!" beside
// a storage provider). Pure data, Arabic, no network. The facts come from each service's own developer
// documentation, as read on the date each guide states, and change often; the exact scopes and the
// API version live in one place in code (src/lib/platforms/oauth.ts).
//
// `{redirect}` in a step is replaced with the address of this site plus the platform's return path
// when the guide is drawn; `{origin}` with the site's address.
//
// Mixed Arabic and English is written once, in the markup of src/lib/guide-text.ts: a label on the platform's own
// screen goes in «», a value to type in backticks, and everything else is left alone (the page isolates it).

/** A picture of the platform's own page, made by scripts/guide-shots.mjs: cropped, with what is private blurred. */
export type GuideShot = {
  /** A path in public/, such as /guides/google/menu.png. */
  src: string;
  /** The picture's own size in pixels, so the page keeps its place before it loads. */
  w: number;
  h: number;
  alt: string;
  caption?: string;
};

export type GuideStep = {
  /** A stable name for saved progress in «المنصات», so a reworded step keeps its place. */
  id?: string;
  t: string;
  /** One sentence: what this step is and why. It sits under the step's name in the list. */
  b?: string;
  /** What to do, one small action to a line, in order. Drawn beside the pictures instead of the sentence above. */
  todo?: string[];
  /** Where on the platform's page to look. */
  shots?: GuideShot[];
  /** A value to copy exactly (an address), shown on its own line. */
  copy?: string;
  /** What the value to copy is. */
  copyLabel?: string;
  /** More values to copy in the same step. */
  more?: { label: string; copy: string }[];
  /** Where this step is done, on the platform's own site. */
  link?: { href: string; label: string };
  /** What the input side of the setup sheet asks; without it the step is done outside and confirmed there. */
  kind?: 'copy' | 'keys' | 'review';
  /** The button that says the step is done. On a review step, the button that leaves it for later. */
  ok?: string;
  /** Already true once the app's secret is stored: another connection of the same app did it. */
  implied?: boolean;
};
export type Guide = {
  title: string;
  /** Who this is for and what it ends with. */
  intro: string;
  steps: GuideStep[];
  /** What to expect, or what is not yet true (publishing is a simulation until an adapter exists). */
  notes?: string[];
  /** A link to the platform's own page, and its name. */
  link?: { href: string; label: string };
};

const DEV_FACTS = 'المعلومات هنا من وثائق المنصة الرسمية كما قُرئت في 2026-10-15، وتتغير. راجع صفحة المنصة نفسها عند التسجيل.';
const PLATFORM_FACTS = 'المعلومات هنا من وثائق المنصة الرسمية كما قُرئت في 2026-11-01، وتتغير. راجع صفحة المنصة نفسها عند التسجيل.';
const SIMULATION = 'النشر نفسه ما زال محاكاة في كل الحالات. هذه الخطوات تجهّز الربط والفحص فقط.';
const META_APPS = { href: 'https://developers.facebook.com/apps/', label: 'Meta for Developers' };
const META_PORTFOLIO = { href: 'https://business.facebook.com/settings', label: 'إعدادات حافظة الأعمال' };
const TIKTOK_APPS = { href: 'https://developers.tiktok.com/apps/', label: 'TikTok for Developers' };
const LINKEDIN_APPS = { href: 'https://www.linkedin.com/developers/apps', label: 'تطبيقاتي في LinkedIn' };
const X_CONSOLE = { href: 'https://console.x.com', label: 'وحدة مطوّري X' };
/** A picture of Google's console for the «google» guide (public/guides/google/, made by scripts/guide-shots.mjs). */
const shot = (name: string, w: number, h: number, alt: string, caption?: string): GuideShot => ({ src: `/guides/google/${name}.png`, w, h, alt, caption });

export const GUIDES: Record<string, Guide> = {
  meta: {
    title: 'تجهيز تطبيق Meta لإنستغرام',
    intro: 'للمدير. تُجرى مرة واحدة على مسار Meta الجديد (Unified login)، وتنتهي بإدخال معرّف التطبيق وسره ومعرّف الإعداد في الموقع.',
    steps: [
      { id: 'accounts', implied: true, t: 'جهّز حسابات إنستغرام', b: 'كل حساب مهني (Business أو Creator) ومملوك لحافظة أعمال القسم. الحساب الشخصي لا يعمل، والحساب في حافظة أخرى يحتاج دخولاً مستقلاً.', link: META_PORTFOLIO, ok: 'الحسابات جاهزة' },
      { id: 'app', implied: true, t: 'أنشئ التطبيق', b: '«Create app»، ثم حالة الاستخدام «Manage messaging & content on Instagram»، واربطه بحافظة أعمال القسم. بدون الحافظة لا يظهر تبويب الخطوة التالية.', link: META_APPS, ok: 'أنشأت التطبيق' },
      { id: 'config', implied: true, t: 'أنشئ الإعداد', b: 'في التطبيق: «Use cases» ثم «Customize» ثم «API setup with Unified login» ثم «Create new configuration». تأكد أن instagram_content_publish ضمن الصلاحيات، ثم «Use this configuration».', link: META_APPS, ok: 'أنشأت الإعداد' },
      { id: 'redirect', implied: true, kind: 'copy', t: 'سجّل عنوان العودة', b: 'في الحقل «Redirect URL» تحت الإعداد: الصق هذا العنوان تماماً واحفظ.', copy: '{redirect}', copyLabel: 'عنوان العودة', ok: 'سجّلت العنوان' },
      { id: 'roles', implied: true, t: 'أضف من سيربطون الحسابات', b: 'في «App roles» أضف كل من سيسجّل الدخول لربط الحسابات. هذا يكفي لحسابات القسم نفسه، و«App Review» لازمة فقط لخدمة حسابات لا تملكها.', link: META_APPS, ok: 'أضفتهم' },
      { id: 'keys', kind: 'keys', t: 'انسخ المعرّف والسر', b: '«App ID» و«App Secret» من «App settings» ثم «Basic»، و«Configuration ID» من الإعداد الذي أنشأته. الصقهما هنا فقط، ولا ترسلهما إلى أحد.', link: META_APPS },
    ],
    notes: [
      'بعد هذه الخطوات تُربط الحسابات من «حسابات المنصات»: دخول واحد يعطي كل حسابات إنستغرام التي تختارها من حافظة واحدة.',
      'ما يُنشأ والتطبيق في وضع التطوير قد لا يراه إلا أصحاب الأدوار عليه، فتحقق من أول منشور.',
      'تذكر Meta عنوان Webhooks ضمن متطلبات هذا المسار، ولا يملك الموقع عنواناً لها بعد. إن منعك ذلك من المتابعة فأخبر مسؤول النظام.',
      'أفاد مطوّرون في 2026-11-01 أن الخطأ 100/33 زال بإضافة business_management إلى الإعداد من «Facebook Login for Business» ثم «Configurations». ليس هذا من وثائق Meta.',
      SIMULATION,
      PLATFORM_FACTS,
    ],
    link: META_APPS,
  },
  facebook: {
    title: 'تجهيز تطبيق Meta لفيسبوك',
    intro: 'للمدير. تُجرى مرة واحدة على تطبيق Meta نفسه إن قبل الجمع بين حالتي الاستخدام، وتنتهي بنشر التطبيق.',
    steps: [
      { id: 'usecase', t: 'أضف حالة الاستخدام', b: 'في التطبيق: «Use cases» ثم إضافة «Manage everything on your Page». إن ظهرت رمادية فهي لا تجتمع مع إنستغرام في تطبيق واحد: توقف هنا وأخبر مسؤول النظام.', link: META_APPS, ok: 'أضفتها' },
      { id: 'permissions', t: 'أضف الصلاحيات', b: 'في «Customize»: pages_manage_posts وpages_read_engagement، وpublish_video لنشر الفيديو. تُضاف من نفسها business_management وpages_show_list وpublic_profile.', link: META_APPS, ok: 'أضفتها' },
      { id: 'redirect', kind: 'copy', t: 'سجّل عنوان العودة', b: 'في «Facebook Login for Business» ثم «Settings»، الحقل «Valid OAuth Redirect URIs»: الصق هذا العنوان تماماً.', copy: '{redirect}', copyLabel: 'عنوان العودة', ok: 'سجّلت العنوان' },
      { id: 'config', t: 'أكمل الإعداد', b: 'في «Facebook Login for Business» ثم «Configurations»: اجعل الإعداد يشمل الصفحات وهذه الصلاحيات. للتطبيق في الموقع إعداد واحد، فعدّل إعداد إنستغرام إن وُجد.', link: META_APPS, ok: 'أكملته' },
      { id: 'keys', implied: true, kind: 'keys', t: 'انسخ المعرّف والسر', b: '«App ID» و«App Secret» من «App settings» ثم «Basic»، و«Configuration ID» من الإعداد. الصقهما هنا فقط، ولا ترسلهما إلى أحد.', link: META_APPS },
      { id: 'tasks', t: 'تأكد من صلاحية من يربط الصفحة', b: 'يجب أن يستطيع إنشاء المحتوى على الصفحة (CREATE_CONTENT). إن جاء دوره من حافظة الأعمال فليكن الإعداد شاملاً ads_management وads_read.', link: META_PORTFOLIO, ok: 'تأكدت' },
      { id: 'publish', kind: 'review', t: 'انشر التطبيق', b: 'ما يُنشر والتطبيق في وضع التطوير لا يراه إلا أصحاب الأدوار عليه. جهّز الأيقونة ورابط الخصوصية ورابط حذف البيانات، ثم «App Review» و«Publish».', link: META_APPS, copy: '{origin}/privacy.html', copyLabel: 'رابط الخصوصية', more: [{ label: 'رابط حذف البيانات', copy: '{origin}/account-deletion.html' }], ok: 'سأكمل لاحقاً' },
    ],
    notes: ['لم تؤكد وثائق Meta أن حالتي الاستخدام تجتمعان في تطبيق واحد: لوحة Meta تقول ذلك في الخطوة الأولى.', SIMULATION, PLATFORM_FACTS],
    link: META_APPS,
  },
  tiktok: {
    title: 'تجهيز تطبيق TikTok',
    intro: 'للمدير. تُجرى مرة واحدة، وتنتهي بإدخال مفتاح العميل وسره في الموقع، ثم مراجعة TikTok وتدقيقها.',
    steps: [
      { id: 'app', implied: true, t: 'أنشئ التطبيق', b: 'في TikTok for Developers: «Manage apps» ثم «Connect an app»، واختر مؤسسة مالكة له لا حساباً فردياً.', link: TIKTOK_APPS, ok: 'أنشأت التطبيق' },
      { id: 'details', implied: true, kind: 'copy', t: 'أكمل بيانات التطبيق', b: 'الأيقونة (1024 في 1024)، والاسم، والفئة، والوصف، والمنصة Web. وهذه روابط الموقع والشروط والخصوصية.', copy: '{origin}', copyLabel: 'عنوان الموقع', more: [{ label: 'رابط الشروط', copy: '{origin}/terms.html' }, { label: 'رابط الخصوصية', copy: '{origin}/privacy.html' }], ok: 'أكملتها' },
      { id: 'verify', implied: true, t: 'وثّق الروابط', b: 'اختر التوثيق بـ«URL prefix». تعطيك TikTok ملف توقيع يوضع على الموقع: أرسله إلى مسؤول النظام ليضيفه، ثم اضغط «Verify».', link: TIKTOK_APPS, ok: 'وثّقتها' },
      { id: 'products', implied: true, t: 'أضف المنتجين', b: '«Login Kit» و«Content Posting API»، وفعّل فيه «Direct Post».', link: TIKTOK_APPS, ok: 'أضفتهما' },
      { id: 'redirect', implied: true, kind: 'copy', t: 'سجّل عنوان العودة', b: 'في Login Kit، الحقل «Redirect URI»: الصق هذا العنوان تماماً.', copy: '{redirect}', copyLabel: 'عنوان العودة', ok: 'سجّلت العنوان' },
      { id: 'scopes', implied: true, t: 'حدّد الصلاحيات', b: 'user.info.basic (يحتاجها فحص الاتصال) وvideo.publish وvideo.upload. صلاحية لم تُمنح تجعل TikTok يرفض الدخول.', link: TIKTOK_APPS, ok: 'حدّدتها' },
      { id: 'keys', kind: 'keys', t: 'انسخ المفتاح والسر', b: '«Client key» و«Client secret» من «App details». الصقهما هنا فقط، ولا ترسلهما إلى أحد.', link: TIKTOK_APPS },
      { id: 'review', t: 'قدّم التطبيق للمراجعة', b: 'في «App review» اشرح كل منتج وصلاحية، وارفع فيديو يعرض الاستعمال كاملاً، ثم «Submit for review». يصير التطبيق «Live» بعد الموافقة.', link: TIKTOK_APPS, ok: 'صار Live' },
      { id: 'audit', kind: 'review', t: 'تدقيق النشر', b: 'قبل اجتياز «التدقيق» كل ما يُنشر مقيّد بالمشاهدة الخاصة: هذه قاعدة TikTok لا قاعدة الموقع.', link: TIKTOK_APPS, ok: 'سأقدّمه لاحقاً' },
    ],
    notes: [
      'قبل التدقيق يجب أن يكون الحساب خاصاً وقت النشر، وبحد 5 مستخدمين في 24 ساعة. بعده يبقى حد نحو 15 منشوراً في اليوم للحساب.',
      'بيئة Sandbox تتيح التجربة بلا مراجعة.',
      'مدة رمز الدخول 24 ساعة ويُجدَّد تلقائياً بالفحص الذي يجري حين تُفتح صفحة الحسابات.',
      SIMULATION,
      PLATFORM_FACTS,
    ],
    link: { href: 'https://developers.tiktok.com/doc/content-posting-api-get-started', label: 'وثائق Content Posting API' },
  },
  connect_meta: {
    title: 'ربط حسابك عبر Meta',
    intro: 'لمن ينشر على الصفحات وحسابات إنستغرام. تنتهي بحساب «ربط حقيقي» يُفحص اتصاله فعلاً.',
    steps: [
      { t: 'اضغط «ربط عبر Meta»', b: 'تنتقل إلى صفحة Meta وتسجّل الدخول هناك بفيسبوك أو إنستغرام، ولا يطلب الموقع كلمة مرورك أبداً.' },
      { t: 'اختر الحافظة والحسابات', b: 'اختر حافظة الأعمال، ثم حسابات إنستغرام والصفحات، ووافق. الحساب في حافظة أخرى يحتاج دخولاً مستقلاً.' },
      { t: 'عُد إلى الموقع واختر', b: 'تظهر الصفحات والحسابات بأسمائها: اختر ما يُربط، ولو عدة حسابات معاً، وحدّد من ينشر عليها.' },
      { t: 'تأكد من الحالة', b: 'يظهر الحساب بعلامة «ربط حقيقي» وتاريخ انتهاء التفويض إن كان له تاريخ. «فحص الاتصال» يسأل المنصة فوراً.' },
    ],
    notes: [
      'إن ظهرت عبارة «تطبيق المطوّر غير مضبوط» فالتطبيق لم يُجهَّز بعد: يجهّزه المدير من «الإعدادات» ثم «المنصات».',
      'إن قال Meta إن التطبيق في وضع التطوير فاطلب من المدير أن يعطيك دوراً على التطبيق.',
      SIMULATION,
    ],
  },
  connect_tiktok: {
    title: 'ربط حسابك عبر TikTok',
    intro: 'لمن ينشر على TikTok. تنتهي بحساب «ربط حقيقي» يُفحص اتصاله فعلاً.',
    steps: [
      { t: 'اضغط «ربط عبر TikTok»', b: 'تنتقل إلى TikTok لتسجّل الدخول بحسابك وتوافق على الصلاحيات. كل دخول يربط حساباً واحداً.' },
      { t: 'عُد إلى الموقع', b: 'يظهر حسابك باسمه، فحدّد من ينشر عليه.' },
      { t: 'تأكد من الحالة', b: '«ربط حقيقي» وتاريخ التفويض. يُجدَّد الرمز تلقائياً حين تُفتح هذه الصفحة.' },
    ],
    notes: ['لربط حساب آخر سجّل خروجك من TikTok ثم أعد الخطوات.', 'إن ظهرت عبارة «تطبيق المطوّر غير مضبوط» فيجهّز المدير التطبيق من «الإعدادات» ثم «المنصات».', SIMULATION],
  },
  google: {
    title: 'تجهيز تطبيق Google ليوتيوب وDrive',
    intro: 'للمدير. تُجرى مرة واحدة في موقع Google Cloud، وتنتهي بنسخ معرّف العميل وسره إلى هذا الموقع. التطبيق نفسه يخدم ربط قناة يوتيوب واتصال Google Drive، فلا تُنشئ تطبيقين.',
    steps: [
      {
        id: 'project',
        implied: true,
        t: 'أنشئ مشروعاً في Google Cloud',
        b: 'المشروع هو الحاوية التي يعيش فيها تطبيقك عند Google، وهو مجاني.',
        todo: [
          'افتح الصفحة من الرابط، وسجّل الدخول بحساب Google الذي يملكه القسم.',
          'في «Project name» اكتب `Comms Hub`.',
          'اضغط «Create». يظهر اسم المشروع بعدها في الشريط العلوي من الصفحة: تأكد منه قبل كل خطوة، فكل ما يلي يجب أن يتم داخل هذا المشروع.',
        ],
        link: { href: 'https://console.cloud.google.com/projectcreate', label: 'إنشاء مشروع في Google Cloud' },
        ok: 'أنشأته',
      },
      {
        id: 'youtube',
        t: 'فعّل واجهة YouTube Data API v3',
        b: 'بدونها لا يستطيع الموقع الوصول إلى قناتك.',
        todo: ['افتح الصفحة من الرابط، وتأكد أن اسم مشروعك ظاهر في الشريط العلوي.', 'اضغط الزر الأزرق «Enable».', 'إن كان الزر «Manage» بدل «Enable» فالواجهة مفعّلة من قبل، ولا تحتاج شيئاً.'],
        link: { href: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com', label: 'YouTube Data API v3' },
        ok: 'فعّلتها',
      },
      {
        id: 'drive',
        implied: true,
        t: 'فعّل واجهة Google Drive API',
        b: 'بها يحفظ الموقع ملفات القسم في Drive.',
        todo: ['افتح الصفحة من الرابط.', 'اضغط الزر الأزرق «Enable»، وإن كان «Manage» فهي مفعّلة من قبل.'],
        link: { href: 'https://console.cloud.google.com/apis/library/drive.googleapis.com', label: 'Google Drive API' },
        ok: 'فعّلتها',
      },
      {
        id: 'consent',
        implied: true,
        t: 'افتح شاشة الموافقة',
        b: 'هي الشاشة التي تظهر لمن يربط قناته. تضبطها من «Google Auth Platform».',
        todo: [
          'افتح الصفحة من الرابط. على اليسار قائمة فيها ما سنستعمله: «Branding» و«Audience» و«Clients».',
          'إن ظهرت رسالة تقول إن Google Auth Platform لم تُضبط بعد، فاضغط «Get started». ستسألك أربع شاشات بالترتيب: «App Information» ثم «Audience» ثم «Contact Information» ثم «Finish»، وهي موضوع الخطوات الثلاث التالية.',
          'وإن كانت مضبوطة من قبل فلا تضغط «Get started»: عدّل ما يلي من القائمة نفسها.',
        ],
        shots: [shot('menu', 340, 467, 'القائمة الجانبية في Google Auth Platform: Overview وBranding وAudience وClients وData access وVerification centre وSettings', 'قائمة الصفحة التي على اليسار: منها تفتح «Branding» و«Audience» و«Clients».')],
        link: { href: 'https://console.cloud.google.com/auth/branding', label: 'Google Auth Platform' },
        ok: 'فتحتها',
      },
      {
        id: 'branding',
        implied: true,
        t: 'اكتب اسم التطبيق وبريد الدعم',
        b: 'هذان ما يراه الناس حين يوافقون على ربط قناتهم.',
        todo: [
          'في «App name» اكتب `Comms Hub`.',
          'في «User support email» اختر بريدك من القائمة.',
          'لا ترفع شعاراً في «App logo»: رفعه يستلزم أن تراجع Google التطبيق عند نشره.',
          'اضغط «Next»، أو «Save» إن كنت في صفحة Branding نفسها.',
        ],
        shots: [shot('branding', 755, 582, 'صفحة Branding: حقل App name وحقل User support email، وتحتهما App logo', 'الاسم في الصورة مثال من مشروع آخر، والبريد محجوب. الحلقة الحمراء تعني: لا تفعل هذا.')],
        link: { href: 'https://console.cloud.google.com/auth/branding', label: 'Branding في Google Cloud' },
        ok: 'كتبتهما',
      },
      {
        id: 'audience',
        implied: true,
        t: 'اختر نوع المستخدمين',
        b: 'اختر «External» ما لم يكن للقسم حساب Google Workspace مؤسسي.',
        todo: [
          'في «Audience» اختر «External».',
          'لا تختر «Internal» إلا إن كان الحساب من Google Workspace للمؤسسة وكل من سيربط القناة من داخلها: القناة التي يملكها حساب من خارج المؤسسة لا تُربط بها.',
          'اضغط «Next».',
        ],
        ok: 'اخترته',
      },
      {
        id: 'contact',
        implied: true,
        t: 'اكتب بريد التواصل وأنهِ الإعداد',
        b: 'تستعمله Google لتنبيهك بأي تغيير يخص المشروع.',
        todo: [
          'في «Contact Information» اكتب بريدك ثم اضغط «Next».',
          'في «Finish» علّم «I agree to the Google API Services: User Data Policy» ثم اضغط «Continue».',
          'اضغط «Create». بهذا ينتهي الإعداد الأول.',
          'وفي صفحة Branding تجد هذا الحقل أسفلها باسم «Developer contact information»: اكتب بريدك ثم اضغط «Save».',
        ],
        shots: [shot('contact', 733, 198, 'أسفل صفحة Branding: Developer contact information وحقل Email addresses وزرا Save وDiscard changes', 'الحلقتان على الحقل وعلى زر «Save»، والبريد محجوب.')],
        link: { href: 'https://console.cloud.google.com/auth/branding', label: 'Branding في Google Cloud' },
        ok: 'ضبطتها',
      },
      {
        id: 'testusers',
        implied: true,
        t: 'أضف بريد من سيربط القناة',
        b: 'ما دام التطبيق في وضع التجربة «Testing» لا يدخل إلا من تضيفه هنا.',
        todo: [
          'من القائمة التي على اليسار افتح «Audience».',
          'تحت «Test users» اضغط «Add users».',
          'اكتب بريد حساب Google الذي يملك القناة أو يديرها. ولك أن تضيف أكثر من بريد.',
          'اضغط «Save».',
          'هذه الخطوة تخص مرحلة التجربة، وستنشر التطبيق في الخطوة الأخيرة. ولا تظهر إن اخترت «Internal».',
        ],
        shots: [
          shot('test-users', 650, 371, 'صفحة Audience: قسم Test users وزر Add users وتحته قائمة البريد', 'قائمة الأسماء محجوبة.'),
          shot('add-users', 435, 175, 'لوحة Add users: حقل كتابة البريد وزر Save', 'الحقل لكتابة البريد، ثم زر «Save».'),
        ],
        link: { href: 'https://console.cloud.google.com/auth/audience', label: 'Audience في Google Cloud' },
        ok: 'أضفتها',
      },
      {
        id: 'client',
        implied: true,
        t: 'أنشئ معرّف العميل',
        b: 'هو الهوية التي يعرّف بها الموقع نفسه عند Google.',
        todo: [
          'من القائمة التي على اليسار افتح «Clients» ثم اضغط «Create client».',
          'في «Application type» اختر «Web application».',
          'في «Name» اكتب `Comms Hub Web`: اسم للتمييز داخل Google فقط.',
          'اترك «Authorised JavaScript origins» فارغاً. ولا تضغط «Create» الآن: نضيف عنواني العودة أولاً في الخطوتين التاليتين.',
        ],
        shots: [
          shot('clients', 975, 295, 'صفحة Clients: زر Create client وجدول OAuth 2.0 Client IDs', 'الأسماء في الجدول أمثلة من مشروع آخر.'),
          shot('app-type', 688, 297, 'قائمة Application type: Web application أولها، ثم Android وChrome extension وiOS', 'اختر «Web application»، وهي أول القائمة.'),
        ],
        link: { href: 'https://console.cloud.google.com/auth/clients', label: 'Clients في Google Cloud' },
        ok: 'أنشأته',
      },
      {
        id: 'redirect',
        kind: 'copy',
        t: 'سجّل عنوان العودة ليوتيوب',
        b: 'هو العنوان الذي تعيد Google الناس إليه بعد موافقتهم، ويجب أن يطابق تماماً.',
        todo: [
          'انزل في الصفحة نفسها إلى «Authorised redirect URIs». وقد تُكتب «Authorized» بحسب لغة حسابك.',
          'اضغط «Add URI» فيظهر حقل «URIs 1».',
          'انسخ العنوان من الحقل أدناه والصقه في «URIs 1» بالضبط، بلا مسافة قبله أو بعده.',
        ],
        copy: '{redirect}',
        copyLabel: 'عنوان العودة ليوتيوب',
        shots: [shot('redirect', 660, 245, 'قسم Authorised redirect URIs: حقل URIs 1 وزر Add URI', 'الحقل فارغ، والنص الباهت «https://www.example.com» مثال فقط: الصق عنواننا مكانه.')],
        ok: 'سجّلت العنوان',
      },
      {
        id: 'redirect_drive',
        implied: true,
        kind: 'copy',
        t: 'وسجّل عنوان العودة لـ Drive',
        b: 'عنوان ثانٍ في القائمة نفسها، به يربط الموقع Google Drive.',
        todo: [
          'اضغط «Add URI» مرة ثانية فيظهر حقل «URIs 2».',
          'انسخ العنوان من الحقل أدناه والصقه في «URIs 2».',
          'اضغط «Create» في أسفل الصفحة. يصير الزر أزرق حين تمتلئ الحقول.',
        ],
        copy: '{origin}/api/drive/callback',
        copyLabel: 'عنوان العودة لـ Drive',
        shots: [shot('redirect-create', 660, 272, 'أسفل Create OAuth client ID: زر Add URI ثم زرا Create وCancel', 'الزر «Create» رمادي في الصورة لأن الحقول فارغة.')],
        ok: 'سجّلت العنوان',
      },
      {
        id: 'keys',
        kind: 'keys',
        t: 'انسخ المعرّف والسر',
        b: 'تظهر بعد «Create» نافذة فيها القيمتان.',
        todo: [
          'بعد «Create» تظهر نافذة فيها «Client ID» و«Client secret».',
          'انسخ «Client ID» والصقه في الحقل الأول هنا.',
          'انسخ «Client secret» والصقه في الحقل الثاني. يظهر كاملاً مرة واحدة عند إنشائه، فانسخه فوراً.',
          'إن أغلقت النافذة قبل نسخه فافتح العميل من «Clients» وأنشئ سراً جديداً.',
          'الصقهما هنا فقط، ولا ترسلهما إلى أحد.',
        ],
        link: { href: 'https://console.cloud.google.com/auth/clients', label: 'Clients في Google Cloud' },
      },
      {
        id: 'publish',
        t: 'انشر التطبيق',
        b: 'حتى لا ينتهي الربط بعد 7 أيام.',
        todo: [
          'من القائمة التي على اليسار افتح «Audience».',
          'تحت «Publishing status» اضغط «Publish app» ثم «Confirm». تصير الحالة «In production».',
          'ما دام التطبيق في «Testing» ينتهي الربط بعد 7 أيام، فلا تترك هذه الخطوة.',
          'عند الموافقة ستظهر شاشة تحذير تقول إن Google لم تتحقق من التطبيق، ولهذه المرحلة حد 100 مستخدم جديد. هذا طبيعي ويكفي للقسم.',
        ],
        link: { href: 'https://console.cloud.google.com/auth/audience', label: 'Audience في Google Cloud' },
        ok: 'نشرته',
      },
    ],
    notes: [
      'بعد هذه الخطوات تُربط القنوات من «حسابات المنصات»، ولكل قناة دخول مستقل.',
      'الصور من مشروع Google آخر: الأسماء فيها أمثلة، وقد حُجبت العناوين والمعرّفات الخاصة. قد يختلف شكل صفحات Google قليلاً بحسب لغة حسابك وتحديثاتها، فاعتمد على أسماء الأزرار.',
      'صفحة الواجهة الرسمية تقول إن رفع المشاريع غير الموثقة لم يعد مقيّداً بالخصوصية الخاصة، وقد يبدأ المقطع خاصاً بحسب إعدادات الحساب. تحقق من أول مقطع.',
      'حد الرفع 100 مقطع في اليوم، وبقية الطلبات 10000 وحدة في اليوم.',
      'Drive: يرى الموقع الملفات التي أنشأها وحده فقط، لا بقية ملفات الحساب.',
      'ترتيب شاشات «Get started» من وثائق Google الرسمية كما قُرئت في 2026-11-02.',
      SIMULATION,
      PLATFORM_FACTS,
    ],
    link: { href: 'https://console.cloud.google.com/', label: 'Google Cloud Console' },
  },
  linkedin: {
    title: 'تجهيز تطبيق LinkedIn',
    intro: 'للمدير. تُجرى مرة واحدة، وتنتهي بإدخال معرّف العميل وسره في الموقع. يربط الموقع بها ملف عضو (من يسجّل الدخول) لينشر باسمه.',
    steps: [
      { id: 'app', implied: true, t: 'أنشئ التطبيق', b: 'في LinkedIn Developers: «Create app». يطلب صفحة LinkedIn للمؤسسة (يكفي أن تكون مديرها) وشعاراً.', link: { href: 'https://www.linkedin.com/developers/apps/new', label: 'إنشاء تطبيق LinkedIn' }, ok: 'أنشأت التطبيق' },
      { id: 'products', implied: true, t: 'اطلب المنتجين', b: 'من تبويب «Products»: «Share on LinkedIn» (للنشر) و«Sign In with LinkedIn using OpenID Connect» (لمعرفة صاحب الحساب).', link: LINKEDIN_APPS, ok: 'طلبتهما' },
      { id: 'redirect', implied: true, kind: 'copy', t: 'سجّل عنوان العودة', b: 'من تبويب «Auth»، حقل «Authorized redirect URLs for your app»: الصق هذا العنوان تماماً.', copy: '{redirect}', copyLabel: 'عنوان العودة', ok: 'سجّلت العنوان' },
      { id: 'keys', kind: 'keys', t: 'انسخ المعرّف والسر', b: 'في التبويب نفسه: «Client ID» و«Primary Client Secret». الصقهما هنا فقط، ولا ترسلهما إلى أحد.', link: LINKEDIN_APPS },
      { id: 'page', kind: 'review', t: 'النشر باسم صفحة الشركة', b: 'ما سبق ينشر باسم شخص. صفحة الشركة تحتاج تطبيقاً جديداً منفصلاً بمنتج «Community Management API» وحده، ومؤسسة مسجلة، وبريد عمل موثّقاً (لا Gmail)، ويوثّق التطبيق مدير أعلى للصفحة. الموقع لا يربط الصفحة بعد.', link: { href: 'https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review', label: 'شروط Community Management' }, ok: 'أكتفي بالنشر باسم شخص' },
    ],
    notes: [
      'مدة رمز الدخول 60 يوماً ولا يُجدَّد بصمت (التجديد البرمجي لشركاء LinkedIn المعتمدين فقط). يُسجَّل التاريخ في الحساب ويُنبَّه الناشرون، وتُعاد الدخلة قبل انتهائه.',
      'تطبيق صفحة الشركة يبدأ بمستوى التطوير (500 طلب في اليوم، و12 شهراً لإكمال التكامل)، والمستوى القياسي يحتاج تسجيل شاشة. الاسم بلا «Linked» ولا «In». ومن رُفض طلبه ينشئ تطبيقاً جديداً.',
      SIMULATION,
      PLATFORM_FACTS,
    ],
    link: LINKEDIN_APPS,
  },
  x: {
    title: 'تجهيز تطبيق X',
    intro: 'للمدير. تُجرى مرة واحدة، وتنتهي بإدخال معرّف العميل وسره في الموقع.',
    steps: [
      { id: 'console', implied: true, t: 'ادخل وحدة المطوّرين', b: 'سجّل الدخول في console.x.com بحساب القسم على X، واقبل اتفاقية المطوّرين.', link: X_CONSOLE, ok: 'دخلت' },
      { id: 'credits', implied: true, t: 'اشحن رصيداً', b: 'X تحاسب على كل طلب من رصيد مسبق: 0.015 دولار للمنشور، و0.20 دولار للمنشور الذي فيه رابط. لا مستوى مجاني في صفحة الأسعار.', link: { href: 'https://docs.x.com/x-api/getting-started/pricing', label: 'أسعار X API' }, ok: 'شحنت الرصيد' },
      { id: 'app', implied: true, t: 'أنشئ التطبيق', b: '«Create App»، ثم الاسم والوصف والاستعمال.', link: X_CONSOLE, ok: 'أنشأت التطبيق' },
      { id: 'auth', implied: true, t: 'فعّل تسجيل دخول المستخدم', b: 'في إعدادات OAuth 2.0: الصلاحيات «Read and write»، والنوع «Web App» (عميل سرّي).', link: X_CONSOLE, ok: 'فعّلته' },
      { id: 'redirect', implied: true, kind: 'copy', t: 'سجّل عنوان العودة', b: 'أضفه إلى عناوين العودة في التطبيق. يجب أن يطابق تماماً، حتى الشرطة الأخيرة.', copy: '{redirect}', copyLabel: 'عنوان العودة', ok: 'سجّلت العنوان' },
      { id: 'website', implied: true, kind: 'copy', t: 'أدخل عنوان الموقع', b: 'في حقل عنوان الموقع: الصق هذا العنوان.', copy: '{origin}', copyLabel: 'عنوان الموقع', ok: 'أدخلته' },
      { id: 'keys', kind: 'keys', t: 'انسخ المعرّف والسر', b: '«Client ID» و«Client Secret» من مفاتيح التطبيق. يظهران مرة واحدة، فانسخهما فوراً. الصقهما هنا فقط، ولا ترسلهما إلى أحد.', link: X_CONSOLE },
    ],
    notes: [
      'بعد هذه الخطوات تُربط الحسابات من «حسابات المنصات»، ولكل حساب دخول مستقل.',
      'الأسعار من صفحة X الرسمية في 2026-11-01، وتتغير. يمكن وضع حد للإنفاق في وحدة المطوّرين.',
      'رمز الدخول ساعتان ويُجدَّد تلقائياً بالفحص الذي يجري حين تُفتح صفحة الحسابات، ما دام الدخول طلب «offline.access».',
      SIMULATION,
      PLATFORM_FACTS,
    ],
    link: X_CONSOLE,
  },
  connect_google: {
    title: 'ربط قناة يوتيوب',
    intro: 'لمن ينشر على القناة. تنتهي بحساب «ربط حقيقي» يُفحص اتصاله فعلاً.',
    steps: [
      { t: 'اضغط «ربط عبر Google (يوتيوب)»', b: 'تنتقل إلى صفحة Google. ولا يطلب الموقع كلمة مرورك أبداً.' },
      { t: 'اختر الحساب ثم القناة', b: 'سجّل الدخول بحساب Google الذي يملك القناة أو يديرها. وإن كانت القناة لحساب علامة تجارية فاختره حين تعرضه Google.' },
      { t: 'وافق على الصلاحيتين', b: 'رفع الفيديو، وقراءة القنوات التي تملكها.' },
      { t: 'عُد إلى الموقع', b: 'تظهر القناة باسمها، فحدّد من ينشر عليها.' },
      { t: 'تأكد من الحالة', b: '«ربط حقيقي» وتاريخ التفويض. يُجدَّد التفويض مع كل فحص ناجح.' },
    ],
    notes: [
      'لكل قناة دخول مستقل: لربط قناة أخرى أعد الخطوات واخترها عند Google.',
      'إن قالت Google «التطبيق لم يتحقق منه» أو لم يُسمح لك بالدخول فأضف بريدك ضمن «Test users» في شاشة الموافقة، أو انشر التطبيق.',
      'إن لم يصل رمز تجديد فأزل وصول «Comms Hub» من حسابك على Google ثم أعد الربط.',
      SIMULATION,
    ],
    link: { href: 'https://myaccount.google.com/permissions', label: 'التطبيقات التي لها وصول إلى حساب Google' },
  },
  connect_linkedin: {
    title: 'ربط ملفك على LinkedIn',
    intro: 'لمن ينشر باسمه على LinkedIn. تنتهي بحساب «ربط حقيقي» يُفحص اتصاله فعلاً.',
    steps: [
      { t: 'اضغط «ربط عبر LinkedIn»', b: 'تنتقل إلى LinkedIn لتسجّل الدخول وتوافق على النشر باسمك.' },
      { t: 'عُد إلى الموقع', b: 'يظهر ملفك باسمه، فحدّد من ينشر عليه.' },
      { t: 'تأكد من الحالة', b: '«ربط حقيقي» وتاريخ الانتهاء بعد 60 يوماً تقريباً. أعد الربط قبله.' },
    ],
    notes: ['يربط الموقع شخصاً لا صفحة شركة: كل دخول يربط ملفاً واحداً.', 'إن ظهرت عبارة «تطبيق المطوّر غير مضبوط» فيجهّز المدير التطبيق من «الإعدادات» ثم «المنصات».', SIMULATION],
  },
  connect_x: {
    title: 'ربط حساب X',
    intro: 'لمن ينشر على X. تنتهي بحساب «ربط حقيقي» يُفحص اتصاله فعلاً.',
    steps: [
      { t: 'اضغط «ربط عبر X»', b: 'تنتقل إلى X لتسجّل الدخول بحساب القسم وتوافق على القراءة والكتابة ورفع الوسائط.' },
      { t: 'عُد إلى الموقع', b: 'يظهر الحساب باسمه، فحدّد من ينشر عليه.' },
      { t: 'تأكد من الحالة', b: '«ربط حقيقي». يُجدَّد الرمز تلقائياً بالفحص الذي يجري حين تُفتح هذه الصفحة.' },
    ],
    notes: ['لربط حساب آخر سجّل خروجك من X ثم أعد الخطوات.', 'إن ظهرت عبارة «تطبيق المطوّر غير مضبوط» فيجهّز المدير التطبيق من «الإعدادات» ثم «المنصات».', SIMULATION],
  },
  mail: {
    title: 'ربط صندوق بريد القسم (Gmail)',
    intro: 'للمدير. تنتهي بإدخال عنوان الصندوق وكلمة مرور تطبيق خاصة به في النموذج. يقرأ الموقع به البريد الوارد ويرسل الصادر.',
    steps: [
      { t: 'فعّل التحقق بخطوتين', b: 'لا تُنشأ «كلمة مرور التطبيق» بدونه. فعّله على حساب الصندوق نفسه.', link: { href: 'https://myaccount.google.com/signinoptions/two-step-verification', label: 'التحقق بخطوتين في حساب Google' } },
      { t: 'أنشئ كلمة مرور تطبيق', b: 'سمّها «Comms Hub». تظهر 16 حرفاً مرة واحدة: انسخها.', link: { href: 'https://myaccount.google.com/apppasswords', label: 'كلمات مرور التطبيقات' } },
      { t: 'تأكد أن IMAP مفعّل', b: 'في Gmail: «Settings» ثم «See all settings» ثم «Forwarding and POP/IMAP» ثم «Enable IMAP». إن ظهر خطأ في الفحص فراجع هذه الخطوة.', link: { href: 'https://mail.google.com/mail/u/0/#settings/fwdandpop', label: 'إعدادات IMAP في Gmail' } },
      { t: 'املأ النموذج', b: 'العنوان الكامل للصندوق، ثم كلمة مرور التطبيق (تُقبل بمسافاتها أو بدونها).' },
      { t: 'اضغط «فحص وحفظ»', b: 'يسجّل الموقع الدخول إلى Gmail أولاً ولا يحفظ شيئاً إن رفض. ثم تُحفظ كلمة المرور في خزنة الأسرار ولا تُعرض بعد ذلك.' },
    ],
    notes: [
      'حسابات Google Workspace قد يمنع مسؤولها كلمات مرور التطبيقات: اطلب منه السماح بها.',
      'ما في متغيرات الخادم يبقى احتياطاً إلى أن تُدخل القيم هنا، وما تدخله هنا هو المعتمد.',
      'لا يعمل في الخلفية: يُزامَن الصندوق حين يفتح أحدهم صفحة البريد.',
      DEV_FACTS,
    ],
  },
  drive: {
    title: 'ربط Google Drive',
    intro: 'للمدير. حساب Google واحد يحفظ فيه الموقع ملفات القسم في مجلد «Comms Hub».',
    steps: [
      { t: 'جهّز تطبيق Google أولاً', b: 'إن لم يُدخل معرّف العميل وسره فأدخلهما من بطاقة «تطبيق Google» في هذه الصفحة (علامة «!» فيها تشرح كيف).' },
      { t: 'اضغط «ربط Google Drive»', b: 'تنتقل إلى Google لتسجّل الدخول بالحساب الذي سيحمل ملفات القسم.' },
      { t: 'وافق على صلاحية الملفات', b: 'الموقع يرى الملفات التي ينشئها هو فقط، لا بقية ملفات الحساب.' },
      { t: 'عُد إلى الموقع', b: 'يُحفظ الرمز الدائم في خزنة الأسرار بعد أن يتحقق منه الموقع عند Google، ويظهر الحساب المرتبط.' },
      { t: 'جرّب برفع ملف', b: 'من «مكتبة الوسائط» ارفع ملفاً صغيراً: يظهر في مجلد «Comms Hub» في Drive.' },
    ],
    notes: [
      'إن قالت الصفحة «لم يصل رمز دائم» فأزل «Comms Hub» من أذونات حسابك على Google ثم أعد الربط.',
      'للانتقال إلى مزود آخر أو أخذ نسخة احتياطية: «الإعدادات» ثم «التخزين» و«النسخ الاحتياطي».',
      DEV_FACTS,
    ],
    link: { href: 'https://myaccount.google.com/permissions', label: 'أذونات حساب Google' },
  },
  whatsapp: {
    title: 'إعداد واتساب النظام (الجسر)',
    intro: 'للمدير. رقم واتساب للقسم يرسل منه الموقع الرسائل العاجلة والمدفوعة، باتجاه واحد: لا يُقرأ منه شيء. يعمل عبر برنامج «جسر» على جهاز يبقى مشغّلاً.',
    steps: [
      { t: 'اختر رقماً مخصصاً', b: 'رقم للقسم على هاتف تحتفظ به، لا رقماً شخصياً. يحتاج الهاتف إلى اتصال بالإنترنت وقت الربط.' },
      { t: 'جهّز جهاز الجسر', b: 'حاسوب ويندوز يبقى مشغّلاً، عليه Node.js ومتصفح Edge أو Chrome.', link: { href: 'https://nodejs.org/en/download', label: 'تنزيل Node.js' } },
      { t: 'انسخ مجلد الجسر إليه', b: 'مجلد bridge\\whatsapp من مشروع Comms Hub (فيه run-bridge.bat). لا يلزم فتح أي منفذ على الجهاز: هو الذي يسأل الموقع.' },
      { t: 'أنشئ المفتاح هنا', b: 'اضغط «إنشاء مفتاح الجسر» في هذه الصفحة. يظهر السطران مرة واحدة: انسخهما.' },
      { t: 'ضعهما في ملف الإعداد', b: 'انسخ الملف .env.example إلى .env داخل المجلد، والصق السطرين بدل ما فيه من COMMS_SITE_URL وWHATSAPP_SERVER_KEY.', copy: '{origin}' },
      { t: 'شغّل الجسر', b: 'انقر run-bridge.bat. في أول مرة يثبّت الحزم ثم يظهر رمز QR في النافذة.' },
      { t: 'اربط الهاتف', b: 'على هاتف الرقم: واتساب ثم «الأجهزة المرتبطة» ثم «ربط جهاز»، وامسح الرمز. تقول النافذة «Linked».' },
      { t: 'شغّل واتساب النظام', b: 'علّم «تشغيل واتساب النظام» في هذه الصفحة. تتحول الحالة إلى «متصل» خلال دقيقة.' },
      { t: 'جرّب', b: 'اربط رقمك من «الحساب» ثم اضغط «رسالة تجربة إلى رقمي»: تصل من رقم النظام.' },
    ],
    notes: [
      'ما يرسله الجسر طريقة غير رسمية لواتساب: قد تحجبها واتساب يوماً، فيتوقف الرقم دون أن يتأثر بقية الموقع. لا يوجد بديل رسمي مجاني لرقم شخصي.',
      'إنشاء مفتاح جديد يوقف الجسر القائم حتى يُحدَّث ملفه. ما في الطابور ينتظر ولا يضيع.',
      'الموقع لا يرسل شيئاً إلى الجهاز ولا يقرأ منه الردود: الجسر يسأل ويُرسل فقط.',
      DEV_FACTS,
    ],
    link: { href: 'https://faq.whatsapp.com/', label: 'مركز مساعدة واتساب' },
  },
  microsoft: {
    title: 'تجهيز تطبيق Microsoft (OneDrive)',
    intro: 'للمدير. تُجرى مرة واحدة، وتنتهي بإدخال معرّف التطبيق وسره في الحقلين. التطبيق يخدم ربط حسابات OneDrive بعدها.',
    steps: [
      { t: 'افتح تسجيل التطبيقات في Microsoft Entra', b: 'سجّل الدخول بأي حساب Microsoft (شخصي أو للعمل). التسجيل مجاني ولا يلزم اشتراك.', link: { href: 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade', label: 'App registrations في Microsoft Entra' } },
      { t: 'اضغط «New registration»', b: 'سمّه «Comms Hub». في «Supported account types» اختر «Accounts in any organizational directory and personal Microsoft accounts»: هكذا يصلح لحساب شخصي ولحساب عمل.' },
      { t: 'سجّل عنوان العودة', b: 'في «Redirect URI» اختر النوع «Web» والصق هذا العنوان تماماً.', copy: '{origin}/api/onedrive/callback' },
      { t: 'اضغط «Register»', b: 'تفتح صفحة التطبيق. انسخ «Application (client) ID» من «Overview».' },
      { t: 'أنشئ سراً', b: 'من «Certificates & secrets» ثم «New client secret»، ومدة مثل 24 شهراً. دوّن تاريخ الانتهاء الذي يظهر: تكتبه في حقل «ينتهي السر في» ليذكّرك الموقع قبله بشهر. انسخ العمود «Value» فوراً (لا «Secret ID»): لا يُعرض مرة ثانية.' },
      { t: 'تأكد من الصلاحيات', b: 'من «API permissions»: «Microsoft Graph» ثم «Delegated»: Files.ReadWrite وUser.Read وoffline_access. الأخيرة تعطي الرمز الدائم. لا تحتاج موافقة مسؤول لحساب شخصي.' },
      { t: 'الصق المعرّف والسر', b: 'في الحقلين أسفل البطاقة، ثم «فحص وحفظ». يسأل الموقع Microsoft أولاً ولا يحفظ شيئاً إن رفضت.' },
      { t: 'اربط الحساب', b: 'من بطاقة «OneDrive» في الصفحة نفسها: «ربط OneDrive».' },
    ],
    notes: [
      'السر له تاريخ انتهاء (حتى 24 شهراً): أنشئ غيره قبل أن ينتهي وأدخله هنا بـ«استبدال بعد الفحص»، وإلا يتوقف OneDrive.',
      'حساب العمل أو المدرسة قد يمنع تطبيقات خارجية: يطلب مسؤول المستأجر الموافقة، أو يُستعمل حساب شخصي.',
      DEV_FACTS,
    ],
    link: { href: 'https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app', label: 'تسجيل تطبيق في Microsoft Entra (وثائق Microsoft)' },
  },
  onedrive: {
    title: 'ربط OneDrive',
    intro: 'للمدير. حساب OneDrive واحد أو أكثر يحفظ فيه الموقع نسخاً من ملفات القسم في مجلد «Comms Hub». لا يُرفع إليه الجديد مباشرة: تُنقل إليه الملفات أو تُنسخ احتياطياً من «التخزين».',
    steps: [
      { t: 'جهّز تطبيق Microsoft أولاً', b: 'إن لم يُدخل معرّفه وسره فأدخلهما من بطاقة «تطبيق Microsoft» في هذه الصفحة (علامة «!» فيها تشرح كيف).' },
      { t: 'اضغط «ربط OneDrive»', b: 'تنتقل إلى صفحة Microsoft لتسجّل الدخول بالحساب الذي يحمل الملفات وتختاره من القائمة.' },
      { t: 'وافق على الصلاحية', b: 'قراءة ملفاتك وكتابتها. لا يطلب الموقع كلمة مرورك. يعمل في مجلده «Comms Hub» وحده.' },
      { t: 'عُد إلى الموقع', b: 'يظهر الحساب في البطاقة، ويُحفظ الرمز الدائم في خزنة الأسرار ولا يُعرض.' },
      { t: 'افحص الاتصال', b: '«فحص الاتصال» يسأل OneDrive من صاحب الحساب وكم المساحة. تتحول الحالة إلى «متصل».' },
      { t: 'انقل مجلداً صغيراً أولاً', b: 'من «الإعدادات» ثم «التخزين»: اختر OneDrive هدفاً، ثم «احسب الخطة»، ثم «ابدأ النقل». كل ملف يُتحقق منه ببصمة OneDrive (quickXorHash) قبل أن يُحوَّل.' },
    ],
    notes: [
      'لم يُجرَّب مع حساب Microsoft حقيقي بعد: اختبر بمجلد صغير ولا تنقل مكتبة كاملة قبل أن ترى تقرير النقل سليماً.',
      'ما يُحذف يذهب إلى سلة OneDrive، فيمكن استرجاعه من هناك.',
      'الحد الأقصى لملف في OneDrive 250 غيغابايت.',
      'إن توقف الربط (انتهى السر، أو سُحب الإذن من حسابك على Microsoft) فتتحول الحالة إلى «يحتاج ربطاً من جديد»: اضغط «ربط حساب آخر أو إعادة ربط».',
      DEV_FACTS,
    ],
    link: { href: 'https://account.microsoft.com/privacy/app-access', label: 'التطبيقات التي لها وصول إلى حسابك على Microsoft' },
  },
  manual: {
    title: 'النشر اليدوي على هذه المنصة',
    intro: 'لا يوجد مسار رسمي معروف للنشر الآلي على هذه المنصة، فالمسار اليدوي هو المسار المكتمل لها وليس حلاً مؤقتاً.',
    steps: [
      { t: 'بعد الاعتماد', b: 'تفتح نافذة النشر أو الجدولة فتجد «حزمة النشر»: النص تماماً كما اعتُمد، والملفات.' },
      { t: 'انسخ وارفع', b: 'انسخ النص والصقه في تطبيق المنصة، وحمّل الملفات من الروابط في الحزمة.' },
      { t: 'أكّد النشر', b: 'عُد إلى الموقع وأكّد أنه نُشر، فيُسجَّل في سجل العمل باسمك.' },
    ],
    notes: ['لا يُنشر شيء قبل الاعتماد، والاعتماد مربوط بالإصدار نفسه الذي في الحزمة.'],
  },
  move: {
    title: 'نقل الملفات بين مزودي التخزين',
    intro: 'لمن يملك «نقل الملفات بين مزودي التخزين». ابدأ بمجلد صغير.',
    steps: [
      { t: 'جهّز مزوداً ثانياً', b: 'أضف مزود تخزين بالزر أعلاه (علامة «!» فيه تشرح كل نوع) وافحص اتصاله حتى يصير «متصل».' },
      { t: 'اختر ما يُنقل', b: 'المصدر والهدف، ثم المكتبة كلها أو مجلداً أو مرفقات البريد، والنمط: «نقل» يجعل الجديد هو الأصل، و«نسخ فقط» يُبقي الأصل مكانه.' },
      { t: 'احسب الخطة', b: 'لا ينسخ شيئاً. اقرأ التقرير: عدد الملفات وحجمها ومساحة الهدف وما لا يمكن نقله وسببه.' },
      { t: 'ابدأ وأبقِ الصفحة مفتوحة', b: 'يُنسخ ملف واحد في كل مرة ويُتحقق منه ببصمة محتواه قبل أن يُحوَّل. لا عامل في الخلفية: إن أغلقت الصفحة توقّف، وتستأنف من حيث وقفت.' },
      { t: 'افتح ملفاً منقولاً', b: 'من المكتبة، فإنه يُخدَّم من الموضع الجديد بالرابط نفسه.' },
      { t: 'أحل المصدر للتقاعد بعد مدة الاحتفاظ', b: 'بضغط مطوّل، وتذهب نسخ المصدر إلى سلة مزودها الأول ولا يُحذف شيء نهائياً.' },
    ],
    notes: ['الملفات المرفوعة بعد النقل تذهب إلى Google Drive كما كانت، وتُنقل بخطة جديدة.'],
  },
  backups: {
    title: 'النسخ الاحتياطي',
    intro: 'لمن يملك «تشغيل النسخ الاحتياطي». كل شيء يدوي حتى يصل جهاز الوكيل: تقول الصفحة عمر آخر نسخة سليمة، وتبدأ أنت الجديدة.',
    steps: [
      { t: 'حدّد مزود النسخ', b: 'مزود تخزين غير مزود المكتبة، متصل. أضفه من «التخزين» أولاً. نسخة في المكان نفسه ليست نسخة احتياطية.' },
      { t: 'انسخ الملفات', b: '«انسخ الملفات الجديدة» ينسخ كل ما ليس له نسخة متحقق منها فقط، ويتحقق من كل ملف ببصمته، ولا يغيّر الأصل. أبقِ الصفحة مفتوحة، ويستأنف إن أغلقتها.' },
      { t: 'صدّر السجلات والإعدادات', b: 'ملف مضغوط يُنزَّل إلى جهازك ويُحفظ عند مزود النسخ ويُعاد قراءته للتأكد. لا بريد فيه ولا مراسلة ولا أسرار.' },
      { t: 'تحقق', b: '«تحقق من النسخة» يعيد قراءة نسخ من المزود ويقارن بصماتها. النسخة التي لم تُقرأ لا تُحسب متحققاً منها.' },
      { t: 'اضبط التنبيه والاحتفاظ', b: 'تتحول البطاقة إلى «متقادمة» بعد المدة التي تضبطها، وتُحفظ آخر عدد من ملفات التصدير وما قبلها يذهب إلى سلة المزود.' },
      { t: 'كرّر بانتظام', b: 'لا مؤقت في الموقع. ما يتأخر يظهر في «عام وصحة النظام» وفي هذه الصفحة.' },
    ],
    notes: [
      'استعادة ملف فقد أصله تتم من هذه الصفحة بضغط مطوّل. استعادة قاعدة البيانات لا تُعرض من الموقع: الدليل في الصفحة يشرحها.',
      'نسخ مزود قاعدة البيانات هي النسخة الكاملة التي تشمل البريد والمراسلة.',
    ],
  },
  storage_supabase: {
    title: 'إضافة تخزين Supabase',
    intro: 'مفاتيح S3 تتجاوز قواعد الصفوف، فاستعمل حاوية يكتب فيها المركز وحده.',
    steps: [
      { t: 'أنشئ حاوية خاصة', b: 'في لوحة مشروع Supabase: Storage ثم «New bucket» بلا وصول عام. حجم الملف الأقصى تحدده خطة المشروع.' },
      { t: 'خذ عنوان S3 والمنطقة', b: 'Storage ثم «S3 connection»: انسخ الـ endpoint (يشبه https://<معرّف المشروع>.storage.supabase.co/storage/v1/s3) ومنطقة المشروع مثل eu-central-1.' },
      { t: 'أنشئ مفتاح وصول', b: 'من الصفحة نفسها: «New access key». انسخ المعرّف والسر الآن، فلا يُعرض السر بعد ذلك.' },
      { t: 'املأ النموذج', b: 'اختر «تخزين Supabase»، الاسم والعنوان والحاوية والمنطقة، ثم المفتاح والسر، ثم «حفظ وفحص الاتصال».' },
    ],
    notes: ['يكتب الموقع ملفاً صغيراً ويقرأه ويحذفه للفحص قبل أن يقبل المفتاح.', DEV_FACTS],
    link: { href: 'https://supabase.com/docs/guides/storage/s3', label: 'وثائق S3 في Supabase' },
  },
  storage_b2: {
    title: 'إضافة Backblaze B2',
    intro: 'استعمل مفتاح تطبيق محصوراً بالحاوية، لا المفتاح الرئيسي للحساب.',
    steps: [
      { t: 'أنشئ حاوية خاصة', b: 'في Backblaze: Buckets ثم «Create a Bucket»، خاصة. دوّن «Endpoint» الذي يظهر لها.' },
      { t: 'أنشئ مفتاح تطبيق', b: 'App Keys ثم «Add a New Application Key»، محصوراً بهذه الحاوية، بصلاحية قراءة وكتابة.' },
      { t: 'انسخ المعرّف والمفتاح', b: 'keyID و applicationKey: يُعرض المفتاح مرة واحدة.' },
      { t: 'املأ النموذج', b: 'العنوان على صورة https://s3.<المنطقة>.backblazeb2.com، والمنطقة مثل us-west-004، ثم «حفظ وفحص الاتصال».' },
    ],
    notes: [DEV_FACTS],
    link: { href: 'https://www.backblaze.com/docs/cloud-storage-s3-compatible-api', label: 'وثائق واجهة S3 في Backblaze' },
  },
  storage_r2: {
    title: 'إضافة Cloudflare R2',
    intro: 'استعمل رمز API محصوراً بالحاوية.',
    steps: [
      { t: 'أنشئ حاوية', b: 'في Cloudflare: R2 ثم «Create bucket».' },
      { t: 'أنشئ رمز API', b: 'R2 ثم «Manage API tokens»: صلاحية «Object Read & Write» محصورة بهذه الحاوية.' },
      { t: 'انسخ البيانات', b: 'Access Key ID و Secret Access Key (يُعرض السر مرة واحدة) ومعرّف الحساب.' },
      { t: 'املأ النموذج', b: 'العنوان https://<معرّف الحساب>.r2.cloudflarestorage.com والمنطقة auto، ثم «حفظ وفحص الاتصال».' },
    ],
    notes: [DEV_FACTS],
    link: { href: 'https://developers.cloudflare.com/r2/api/s3/', label: 'وثائق واجهة S3 في R2' },
  },
  storage_aws: {
    title: 'إضافة Amazon S3',
    intro: 'استعمل مستخدم IAM مخصصاً بصلاحيات هذه الحاوية فقط.',
    steps: [
      { t: 'أنشئ حاوية خاصة', b: 'في S3: «Create bucket» مع حجب الوصول العام. دوّن المنطقة.' },
      { t: 'أنشئ مستخدم IAM', b: 'بصلاحيات s3:GetObject وs3:PutObject وs3:DeleteObject وs3:ListBucket وs3:AbortMultipartUpload على هذه الحاوية، ثم مفتاح وصول له.' },
      { t: 'املأ النموذج', b: 'العنوان https://s3.<المنطقة>.amazonaws.com والمنطقة نفسها، والمفتاح والسر، ثم «حفظ وفحص الاتصال».' },
    ],
    notes: [DEV_FACTS],
    link: { href: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html', label: 'وثائق Amazon S3' },
  },
  storage_minio: {
    title: 'إضافة MinIO',
    intro: 'يجب أن يكون الخادم متاحاً من الإنترنت بعنوان https وشهادة صالحة: لا تُقبل العناوين الخاصة ولا أرقام IP.',
    steps: [
      { t: 'أنشئ حاوية ومستخدماً', b: 'بصلاحيات القراءة والكتابة والحذف على الحاوية فقط، ثم مفتاح وصول.' },
      { t: 'املأ النموذج', b: 'العنوان https://<عنوان الخادم>، والمنطقة كما أعددتها (الافتراضي us-east-1)، ثم «حفظ وفحص الاتصال».' },
    ],
    notes: [DEV_FACTS],
  },
  storage_other: {
    title: 'إضافة مزود متوافق مع S3',
    intro: 'أي خدمة تدعم واجهة S3 بنمط المسار.',
    steps: [
      { t: 'احصل من المزود على', b: 'عنوان واجهة S3، واسم حاوية خاصة، ومنطقتها، ومفتاح وصول بصلاحيات القراءة والكتابة والحذف على الحاوية.' },
      { t: 'املأ النموذج', b: 'العنوان يبدأ بـ https:// ولا يكون رقم IP ولا اسماً محلياً. ثم «حفظ وفحص الاتصال».' },
    ],
    notes: [DEV_FACTS],
  },
};

/** Which guide a storage provider kind uses. */
export const storageGuideKey = (flavor: string) => (`storage_${flavor}` in GUIDES ? `storage_${flavor}` : 'storage_other');

/** The steps with the site's own addresses filled in. */
export function resolveGuide(g: Guide, origin: string, provider?: string): Guide {
  const fill = (s: string) => s.replace(/\{redirect\}/g, `${origin}/api/platforms/callback/${provider ?? ''}`).replace(/\{origin\}/g, origin);
  return { ...g, steps: g.steps.map((s) => ({ ...s, copy: s.copy ? fill(s.copy) : undefined, more: s.more?.map((m) => ({ ...m, copy: fill(m.copy) })) })) };
}

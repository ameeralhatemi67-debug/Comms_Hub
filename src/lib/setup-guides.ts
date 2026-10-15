// The "how do I set this up" steps of every outside connection, kept in the site so a person can
// follow them from the screen that needs them (the circled "!" beside a platform or a storage
// provider). Pure data, Arabic, no network. The facts come from each platform's own developer
// documentation as read on 2026-10-15 and change often; each guide says so, and the exact scopes
// and the API version live in one place in code (src/lib/platforms/oauth.ts).
//
// `{redirect}` in a step is replaced with the address of this site plus the platform's return path
// when the guide is drawn; `{origin}` with the site's address.

export type GuideStep = {
  t: string;
  b?: string;
  /** A value to copy exactly (an address), shown on its own line. */
  copy?: string;
  /** Where this step is done, on the platform's own site. */
  link?: { href: string; label: string };
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
const SIMULATION = 'النشر نفسه ما زال محاكاة في كل الحالات. هذه الخطوات تجهّز الربط والفحص فقط.';

export const GUIDES: Record<string, Guide> = {
  meta: {
    title: 'تجهيز تطبيق Meta (فيسبوك وإنستغرام)',
    intro: 'للمدير. تُجرى مرة واحدة، وتنتهي بإدخال معرّف التطبيق وسره في الحقلين أسفل هذه البطاقة.',
    steps: [
      { t: 'أنشئ التطبيق', b: 'في Meta for Developers: «إنشاء تطبيق»، النوع Business، داخل حافظة أعمال القسم. إن لم يكن للقسم حساب أعمال موثّق في Meta فاكتب ذلك في ملاحظة «التجهيز»: هو ما يحدد مدة الانتظار.', link: { href: 'https://developers.facebook.com/apps/', label: 'Meta for Developers' } },
      { t: 'أضف «Facebook Login»', b: 'من «Add products»، نمط الويب.' },
      { t: 'سجّل عنوان العودة', b: 'في إعدادات Facebook Login، الحقل «Valid OAuth Redirect URIs»: الصق هذا العنوان تماماً.', copy: '{redirect}' },
      { t: 'أضف من سيربطون الحسابات', b: 'ما دام التطبيق في وضع التطوير يعمل فقط لمن له دور على التطبيق (مسؤول أو مطوّر أو مختبر). أضفهم من «App roles». للجميع لاحقاً يلزم «App Review» والتحقق من النشاط التجاري، وهو ما يستغرق أسابيع.' },
      { t: 'جهّز الصفحات والحسابات', b: 'صفحة فيسبوك: يجب أن يكون من يربطها ممن يديرونها. حساب إنستغرام: مهني ومربوط بصفحة فيسبوك، وإلا لا يظهر في القائمة.' },
      { t: 'انسخ المعرّف والسر', b: 'من «App settings» ثم «Basic»: App ID و App Secret. الصقهما في الحقلين أسفل البطاقة فقط، ولا ترسلهما إلى أحد.' },
      { t: 'احفظ وفعّل', b: 'اضغط «فحص وحفظ»: يسأل الموقع Meta أولاً إن كان الزوج صحيحاً، ولا يحفظ شيئاً إن لم يكن. ثم فعّل المنصة من بطاقتها، وأخبر الناشرين أن يربطوا حساباتهم من «حسابات المنصات».' },
    ],
    notes: [SIMULATION, DEV_FACTS, 'الصلاحيات المطلوبة: pages_show_list وpages_read_engagement وpages_manage_posts وinstagram_basic وinstagram_content_publish.'],
    link: { href: 'https://developers.facebook.com/apps/', label: 'Meta for Developers' },
  },
  tiktok: {
    title: 'تجهيز تطبيق TikTok',
    intro: 'للمدير. تُجرى مرة واحدة، وتنتهي بإدخال مفتاح العميل وسره في الحقلين أسفل هذه البطاقة.',
    steps: [
      { t: 'أنشئ التطبيق', b: 'في TikTok for Developers: «Manage apps» ثم «Connect an app».', link: { href: 'https://developers.tiktok.com/apps/', label: 'TikTok for Developers' } },
      { t: 'أضف المنتجين', b: '«Login Kit» و«Content Posting API» (Direct Post).' },
      { t: 'سجّل عنوان العودة', b: 'في Login Kit، الحقل «Redirect URI»: الصق هذا العنوان تماماً.', copy: '{redirect}' },
      { t: 'حدّد الصلاحيات', b: 'user.info.basic (يحتاجها فحص الاتصال) وvideo.publish وvideo.upload. اكتب في حقل «الصلاحيات المطلوبة» ما أضفته إلى التطبيق فقط: صلاحية لم تُمنح تجعل TikTok يرفض الدخول.' },
      { t: 'انسخ المفتاح والسر', b: 'Client key و Client secret من «App details». الصقهما أسفل البطاقة فقط.' },
      { t: 'احفظ وفعّل', b: 'اضغط «فحص وحفظ» ثم فعّل المنصة، وليربط الناشرون حساباتهم من «حسابات المنصات».' },
    ],
    notes: [
      'قبل أن يجتاز التطبيق «التدقيق» عند TikTok، كل ما يُنشر عبره مقيّد بالمشاهدة الخاصة وللحسابات الخاصة: هذه قاعدة TikTok لا قاعدة الموقع.',
      'مدة رمز الدخول 24 ساعة ويُجدَّد تلقائياً بالفحص الذي يجري حين تُفتح صفحة الحسابات.',
      SIMULATION,
      DEV_FACTS,
    ],
    link: { href: 'https://developers.tiktok.com/', label: 'TikTok for Developers' },
  },
  connect_meta: {
    title: 'ربط حسابك عبر Meta',
    intro: 'لمن ينشر على الصفحات. تنتهي بحساب «ربط حقيقي» يُفحص اتصاله فعلاً.',
    steps: [
      { t: 'اضغط «ربط عبر Meta»', b: 'ستنتقل إلى صفحة تسجيل الدخول في فيسبوك. هناك تسجّل أنت بحسابك، ولا يطلب الموقع كلمة مرورك أبداً.' },
      { t: 'اسمح بالصلاحيات', b: 'اختر الصفحات وحسابات إنستغرام التي تريد ربطها ووافق. إن لم تظهر صفحة فتأكد أنك تديرها، وأن حساب إنستغرام مهني ومربوط بها.' },
      { t: 'عُد إلى الموقع واختر', b: 'تظهر قائمة بأسماء الصفحات والحسابات: اختر ما يُربط، وحدّد من ينشر على كل حساب.' },
      { t: 'تأكد من الحالة', b: 'يظهر الحساب بعلامة «ربط حقيقي» وتاريخ انتهاء التفويض. «فحص الاتصال» يسأل المنصة فوراً.' },
    ],
    notes: [
      'إن ظهرت عبارة «تطبيق المطوّر غير مضبوط» فالتطبيق لم يُجهَّز بعد: يجهّزه مسؤول النظام من «الإعدادات» ثم «المنصات» (علامة «!» بجانب بطاقة Meta).',
      'إن قال Meta إن التطبيق في وضع التطوير فاطلب من المسؤول أن يضيفك مختبراً على التطبيق.',
      SIMULATION,
    ],
  },
  connect_tiktok: {
    title: 'ربط حسابك عبر TikTok',
    intro: 'لمن ينشر على TikTok. تنتهي بحساب «ربط حقيقي» يُفحص اتصاله فعلاً.',
    steps: [
      { t: 'اضغط «ربط عبر TikTok»', b: 'تنتقل إلى TikTok لتسجّل الدخول بحسابك وتوافق على الصلاحيات.' },
      { t: 'عُد إلى الموقع', b: 'يظهر حسابك باسمه، فحدّد من ينشر عليه.' },
      { t: 'تأكد من الحالة', b: '«ربط حقيقي» وتاريخ التفويض. يُجدَّد الرمز تلقائياً حين تُفتح هذه الصفحة.' },
    ],
    notes: ['إن ظهرت عبارة «تطبيق المطوّر غير مضبوط» فيجهّز مسؤول النظام التطبيق من «الإعدادات» ثم «المنصات».', SIMULATION],
  },
  google: {
    title: 'تجهيز تطبيق Google (يوتيوب وDrive معاً)',
    intro: 'للمدير. تُجرى مرة واحدة، وتنتهي بإدخال معرّف العميل وسره في الحقلين. التطبيق نفسه يخدم ربط قناة يوتيوب واتصال Google Drive، فلا تُنشئ تطبيقين.',
    steps: [
      { t: 'أنشئ مشروعاً في Google Cloud', b: 'سجّل الدخول بحساب Google الذي يملكه القسم، ثم «Create project» باسم مثل «Comms Hub». المشروع مجاني.', link: { href: 'https://console.cloud.google.com/projectcreate', label: 'إنشاء مشروع في Google Cloud' } },
      { t: 'فعّل واجهة يوتيوب', b: 'افتح الصفحة واضغط «Enable» لـ YouTube Data API v3.', link: { href: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com', label: 'YouTube Data API v3' } },
      { t: 'فعّل واجهة Drive', b: 'الأمر نفسه لـ Google Drive API.', link: { href: 'https://console.cloud.google.com/apis/library/drive.googleapis.com', label: 'Google Drive API' } },
      { t: 'اضبط شاشة الموافقة', b: 'في «OAuth consent screen» (أو «Google Auth Platform»): اسم التطبيق وبريد الدعم، والنوع External ما لم يكن حساب القسم ضمن Google Workspace فاختر Internal. أضف بريد من سيربط القناة والمخزن ضمن «Test users».', link: { href: 'https://console.cloud.google.com/apis/credentials/consent', label: 'شاشة الموافقة' } },
      { t: 'أنشئ معرّف العميل', b: '«Credentials» ثم «Create credentials» ثم «OAuth client ID»، النوع «Web application».', link: { href: 'https://console.cloud.google.com/apis/credentials', label: 'Credentials في Google Cloud' } },
      { t: 'سجّل عنوان العودة ليوتيوب', b: 'في «Authorized redirect URIs»: الصق هذا العنوان تماماً.', copy: '{redirect}' },
      { t: 'وسجّل عنوان العودة لـ Drive', b: 'أضف هذا العنوان تحته في القائمة نفسها.', copy: '{origin}/api/drive/callback' },
      { t: 'انسخ المعرّف والسر', b: 'تظهر «Client ID» و«Client secret» بعد الإنشاء. الصقهما في الحقلين أسفل البطاقة فقط، ولا ترسلهما إلى أحد.' },
      { t: 'احفظ، ثم اربط', b: 'اضغط «فحص وحفظ». بعدها اربط Drive من «الإعدادات» ثم «الاتصالات»، واربط القناة من «حسابات المنصات».' },
    ],
    notes: [
      'ما دام التطبيق في حالة «Testing» تنتهي رموز التجديد بعد 7 أيام فيطلب الموقع إعادة الربط. لتدوم، اضغط «Publish app» في شاشة الموافقة ليصير «In production».',
      'رفع الفيديو إلى يوتيوب عبر الواجهة قد يبقى «خاصاً» حتى تجتاز مراجعة الامتثال التي يطلبها يوتيوب لمشاريع الواجهة. اقرأ سياسة YouTube API Services قبل أن تعتمد على النشر الآلي.',
      'Drive: يرى الموقع الملفات التي أنشأها وحده فقط، لا بقية ملفات الحساب.',
      SIMULATION,
      DEV_FACTS,
    ],
    link: { href: 'https://console.cloud.google.com/', label: 'Google Cloud Console' },
  },
  linkedin: {
    title: 'تجهيز تطبيق LinkedIn',
    intro: 'للمدير. تُجرى مرة واحدة، وتنتهي بإدخال معرّف العميل وسره في الحقلين. يربط الموقع بها ملف عضو (من يسجّل الدخول) لينشر باسمه.',
    steps: [
      { t: 'أنشئ التطبيق', b: 'في LinkedIn Developers: «Create app». يطلب صفحة LinkedIn للمؤسسة تُربط بالتطبيق (يكفي أن تكون مديرها) وشعاراً.', link: { href: 'https://www.linkedin.com/developers/apps/new', label: 'إنشاء تطبيق LinkedIn' } },
      { t: 'اطلب المنتجين', b: 'من تبويب «Products»: «Share on LinkedIn» (للنشر) و«Sign In with LinkedIn using OpenID Connect» (لمعرفة صاحب الحساب).', link: { href: 'https://www.linkedin.com/developers/apps', label: 'تطبيقاتي في LinkedIn' } },
      { t: 'سجّل عنوان العودة', b: 'من تبويب «Auth»، حقل «Authorized redirect URLs for your app»: الصق هذا العنوان تماماً.', copy: '{redirect}' },
      { t: 'انسخ المعرّف والسر', b: 'في التبويب نفسه: «Client ID» و«Primary Client Secret». الصقهما في الحقلين أسفل البطاقة فقط.' },
      { t: 'احفظ وفعّل', b: 'اضغط «فحص وحفظ» ثم فعّل المنصة، وليربط الناشرون حساباتهم من «حسابات المنصات».' },
    ],
    notes: [
      'مدة رمز الدخول 60 يوماً ولا يُجدَّد بصمت (التجديد البرمجي لشركاء LinkedIn المعتمدين فقط). يُسجَّل التاريخ في الحساب ويُنبَّه الناشرون، وتُعاد الدخلة قبل انتهائه.',
      'النشر على صفحة مؤسسة (لا على ملف عضو) يحتاج منتج «Community Management API» وموافقة LinkedIn عليه: خارج هذا الربط.',
      SIMULATION,
      DEV_FACTS,
    ],
    link: { href: 'https://www.linkedin.com/developers/apps', label: 'LinkedIn Developers' },
  },
  x: {
    title: 'تجهيز تطبيق X',
    intro: 'للمدير. تُجرى مرة واحدة، وتنتهي بإدخال معرّف العميل وسره في الحقلين.',
    steps: [
      { t: 'ادخل بوابة المطوّرين', b: 'سجّل الدخول بحساب القسم على X، وأنشئ مشروعاً وتطبيقاً داخله.', link: { href: 'https://developer.x.com/en/portal/dashboard', label: 'بوابة مطوّري X' } },
      { t: 'فعّل تسجيل دخول المستخدم', b: 'في تطبيقك: «User authentication settings» ثم «Set up». الصلاحيات «Read and write»، والنوع «Web App, Automated App or Bot» (عميل سرّي).' },
      { t: 'سجّل عنوان العودة', b: 'في حقل «Callback URI / Redirect URL»: الصق هذا العنوان تماماً.', copy: '{redirect}' },
      { t: 'أدخل عنوان الموقع', b: 'في «Website URL»: الصق عنوان هذا الموقع.', copy: '{origin}' },
      { t: 'انسخ المعرّف والسر', b: 'من «Keys and tokens»، قسم «OAuth 2.0 Client ID and Client Secret»: «Client ID» و«Client Secret». الصقهما في الحقلين أسفل البطاقة فقط.' },
      { t: 'احفظ وفعّل', b: 'اضغط «فحص وحفظ» ثم فعّل المنصة، وليربط الناشرون حساباتهم من «حسابات المنصات».' },
    ],
    notes: [
      'واجهة X مدفوعة بمستويات وحدود تتغير: تأكد في بوابة المطوّرين أن مستوى اشتراككم يسمح بالكتابة (النشر) قبل أن تعتمد عليه.',
      'رمز الدخول ساعتان ويُجدَّد تلقائياً بالفحص الذي يجري حين تُفتح صفحة الحسابات، ما دام تطبيقك طلب «offline.access».',
      SIMULATION,
      DEV_FACTS,
    ],
    link: { href: 'https://developer.x.com/en/portal/dashboard', label: 'بوابة مطوّري X' },
  },
  connect_google: {
    title: 'ربط قناة يوتيوب',
    intro: 'لمن ينشر على القناة. تنتهي بحساب «ربط حقيقي» يُفحص اتصاله فعلاً.',
    steps: [
      { t: 'اضغط «ربط عبر Google (يوتيوب)»', b: 'تنتقل إلى صفحة Google لتسجّل الدخول بالحساب الذي يملك القناة (أو يديرها كحساب علامة تجارية).' },
      { t: 'وافق على الصلاحيتين', b: 'رفع الفيديو، وقراءة القنوات التي تملكها. لا يطلب الموقع كلمة مرورك أبداً.' },
      { t: 'عُد إلى الموقع واختر القناة', b: 'تظهر قنواتك بأسمائها: اختر ما يُربط، وحدّد من ينشر عليها.' },
      { t: 'تأكد من الحالة', b: '«ربط حقيقي» وتاريخ التفويض. يُجدَّد التفويض مع كل فحص ناجح.' },
    ],
    notes: [
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
    notes: ['إن ظهرت عبارة «تطبيق المطوّر غير مضبوط» فيجهّز المدير التطبيق من «الإعدادات» ثم «المنصات».', SIMULATION],
  },
  connect_x: {
    title: 'ربط حساب X',
    intro: 'لمن ينشر على X. تنتهي بحساب «ربط حقيقي» يُفحص اتصاله فعلاً.',
    steps: [
      { t: 'اضغط «ربط عبر X»', b: 'تنتقل إلى X لتسجّل الدخول بحساب القسم وتوافق على القراءة والكتابة.' },
      { t: 'عُد إلى الموقع', b: 'يظهر الحساب باسمه، فحدّد من ينشر عليه.' },
      { t: 'تأكد من الحالة', b: '«ربط حقيقي». يُجدَّد الرمز تلقائياً بالفحص الذي يجري حين تُفتح هذه الصفحة.' },
    ],
    notes: ['إن ظهرت عبارة «تطبيق المطوّر غير مضبوط» فيجهّز المدير التطبيق من «الإعدادات» ثم «المنصات».', SIMULATION],
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
  return { ...g, steps: g.steps.map((s) => ({ ...s, copy: s.copy ? fill(s.copy) : undefined })) };
}

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
  /** The rings drawn on it: the number of the action in the step's list each one points at, and 'x' for what not to do. */
  rings?: string[];
  /** The action this picture is drawn under in a guide shown as one page (src/lib/guide-layout.ts), when its rings name no action. */
  at?: number;
};

/** A table of two columns, drawn inside a step: a price list, a list of limits. Cells are plain text; English ones are isolated by the page. */
export type GuideTable = {
  /** What the table is (marked text). */
  title: string;
  /** The names of the two columns (Arabic). */
  head: [string, string];
  rows: [string, string][];
  /** Drawn folded until opened. */
  fold?: boolean;
  /** One line under the table (marked text). */
  note?: string;
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
  /** The action the value to copy is drawn under in a guide shown as one page; otherwise the first action that says «أدناه». */
  copyAt?: number;
  /** More values to copy in the same step, each under its own action when `at` is given. */
  more?: { label: string; copy: string; at?: number }[];
  /** In a guide shown as one page, the action each field of a keys step is drawn under; a field with no place follows the actions. */
  fieldsAt?: Partial<Record<'id' | 'secret' | 'config' | 'more', number>>;
  /** Where this step is done, on the platform's own site. */
  link?: { href: string; label: string };
  /** What the input side of the setup sheet asks; without it the step is done outside and confirmed there. */
  kind?: 'copy' | 'keys' | 'review';
  /** The button that says the step is done. On a review step, the button that leaves it for later. */
  ok?: string;
  /** Already true once the app's secret is stored: another connection of the same app did it. */
  implied?: boolean;
  /** A short condition shown beside the step's name: who needs it, when it does not apply. */
  tag?: string;
  /** Things worth knowing, each drawn as a note with the circled "!": a price, a limit, a trap. */
  info?: string[];
  /** Tables of figures the step refers to, drawn after the list of actions. */
  tables?: GuideTable[];
  /** A tool drawn after the tables: X's cost calculator (src/components/settings/x-cost.tsx). */
  tool?: 'x-cost';
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
  /** The parts of a long guide shown as one page: a name and the ids of its steps, in order (MVP_draft.md section 67.10). */
  phases?: { t: string; ids: string[] }[];
};

const DEV_FACTS = 'المعلومات هنا من وثائق المنصة الرسمية كما قُرئت في 2026-10-15، وتتغير. راجع صفحة المنصة نفسها عند التسجيل.';
const PLATFORM_FACTS = 'المعلومات هنا من وثائق المنصة الرسمية كما قُرئت في 2026-11-01، وتتغير. راجع صفحة المنصة نفسها عند التسجيل.';
const SIMULATION = 'النشر نفسه ما زال محاكاة في كل الحالات. هذه الخطوات تجهّز الربط والفحص فقط.';
/** YouTube alone has a real test upload (MVP_draft.md section 71). */
const SIMULATION_YT = 'نشر الأعمال ما زال محاكاة. وحدها «تجربة النشر» في بطاقة القناة من «حسابات المنصات» ترفع مقطعاً حقيقياً، ولها أن تحذفه.';
/** Instagram's real test (MVP_draft.md section 72). */
const SIMULATION_IG = 'نشر الأعمال ما زال محاكاة. وحدها «تجربة النشر» في بطاقة الحساب من «حسابات المنصات» تنشر قصة أو منشوراً حقيقياً، ولها أن تحذفه.';
/** A Facebook Page's real test (MVP_draft.md section 73). */
const SIMULATION_FB = 'نشر الأعمال ما زال محاكاة. وحدها «تجربة النشر» في بطاقة الصفحة من «حسابات المنصات» تنشر حقاً، وأولها «فحص صامت» لا يظهر لأحد.';
const META_APPS = { href: 'https://developers.facebook.com/apps/', label: 'Meta for Developers' };
const META_PORTFOLIO = { href: 'https://business.facebook.com/settings', label: 'إعدادات حافظة الأعمال' };
const TIKTOK_APPS = { href: 'https://developers.tiktok.com/apps/', label: 'TikTok for Developers' };
const TIKTOK_PORTAL = { href: 'https://developers.tiktok.com/', label: 'TikTok for Developers' };
/** What TikTok shows people about the app (at most 120 characters, held by tests/setup-guides.test.mjs). */
const TIKTOK_DESCRIPTION = "Our communications department's internal tool for publishing its own videos to its TikTok account.";
/** The explanation TikTok asks for in «App review» (at most 1000 characters): what each product and scope does on the site. */
const TIKTOK_REVIEW =
  'Comms Hub is the internal web tool of our communications department. ' +
  'Login Kit: an administrator connects the department\'s own TikTok account from the Connected accounts page. The token stays on our server. ' +
  'user.info.basic shows the account\'s display name and avatar and checks that the connection still works. ' +
  'Content Posting API: in the account\'s panel a team member picks a video and writes the caption, then either sends it to the account\'s TikTok inbox as a draft that the owner finishes in TikTok (video.upload), ' +
  'or posts it directly (video.publish). Before a direct post the page reads the creator info, shows the account\'s nickname, offers only the privacy levels TikTok returns with none chosen in advance, ' +
  'the comment, duet and stitch settings and the commercial content disclosure, and asks for agreement to TikTok\'s Music Usage Confirmation. The video is sent as a file and the page shows the publish status.';
const LINKEDIN_APPS = { href: 'https://www.linkedin.com/developers/apps', label: 'تطبيقاتي في LinkedIn' };
const X_CONSOLE = { href: 'https://console.x.com', label: 'وحدة مطوّري X' };
const SNAP_ACCOUNTS = { href: 'https://accounts.snapchat.com/', label: 'حساب سناب شات' };
const SNAP_ADS = { href: 'https://ads.snapchat.com/', label: 'Snapchat Ads Manager' };
const SNAP_BUSINESS = { href: 'https://business.snapchat.com/', label: 'لوحة أعمال Snapchat' };
/** Where the facts of the Snapchat guide come from (MVP_draft.md section 84). */
const SNAP_FACTS = 'المعلومات هنا من وثائق Snap الرسمية ومن تجربة فعلية على حساب في 2026-11-26، وتتغير. راجع صفحة المنصة نفسها عند التسجيل.';
/** The request for access to the Public Profile API, as Snap asks it: the client id and the use, never the secret. */
const SNAP_REQUEST =
  'Hello, we are the communications department of our organisation. We would like access to the Snap Public Profile API for our organisation\'s own Public Profile, to publish our own Stories and Spotlight content from our internal communications tool. Our OAuth app was created in Business details of our Snap business account; its client ID is: (paste the Snap Client ID here). Scope: snapchat-profile-api. Please allowlist it. We have not shared the client secret.';
/** A picture of a platform's own page (public/guides/<set>/, made by scripts/guide-shots.mjs): Google's console for «google», Meta's pages for «meta». */
/** The prices of X's API as the developer console showed them on 2026-11-03 (MVP_draft.md section 67.8), one row per line of its pages. */
const X_READS: [string, string][] = [
  ['Posts: Read', '$0.005 per resource'],
  ['User: Read', '$0.010 per resource'],
  ['DM Event: Read', '$0.010 per resource'],
  ['Following/Followers: Read', '$0.010 per resource'],
  ['List: Read', '$0.005 per resource'],
  ['Space: Read', '$0.005 per resource'],
  ['Community: Read', '$0.005 per resource'],
  ['Note: Read', '$0.005 per resource'],
  ['Like: Read', '$0.001 per resource'],
  ['Mute: Read', '$0.001 per resource'],
  ['Block: Read', '$0.001 per resource'],
  ['Profile Update: Read', '$0.005 per resource'],
];
const X_ACTIONS: [string, string][] = [
  ['Post: Create', '$0.015 per request'],
  ['Post: Create (with URL)', '$0.200 per request'],
  ['Post: Create (summoned)', '$0.010 per request'],
  ['DM Interaction: Create', '$0.015 per request'],
  ['User Interaction: Create', '$0.015 per request'],
  ['Interaction: Delete', '$0.010 per request'],
  ['Content: Manage', '$0.005 per request'],
  ['List: Create', '$0.010 per request'],
  ['List: Manage', '$0.005 per request'],
  ['Bookmark', '$0.005 per request'],
  ['Media Metadata', '$0.005 per request'],
  ['Privacy: Update', '$0.010 per request'],
  ['Mute: Delete', '$0.005 per request'],
  ['Counts: Recent', '$0.005 per request'],
  ['Counts: All', '$0.010 per request'],
  ['Trends', '$0.010 per request'],
];
const X_EVENTS: [string, string][] = [
  ['post.create', '$0.005'],
  ['post.delete', 'Not billed'],
  ['follow.follow', '$0.010'],
  ['follow.unfollow', '$0.010'],
  ['mute.mute', '$0.001'],
  ['mute.unmute', '$0.001'],
  ['block.block', '$0.001'],
  ['block.unblock', '$0.001'],
  ['profile.update.*', '$0.005'],
  ['chat.received', '$0.010'],
  ['chat.sent', 'Not billed'],
  ['chat.conversation_join', 'Not billed'],
  ['dm.received', '$0.010'],
  ['dm.sent', 'Not billed'],
  ['dm.read', 'Not billed'],
  ['dm.indicate_typing', 'Not billed'],
  ['news.new', '$0.005'],
  ['spaces.start', '$0.005'],
  ['spaces.end', '$0.005'],
];

const shotOf =
  (set: string) =>
  (name: string, w: number, h: number, alt: string, caption?: string, rings?: string[]): GuideShot => ({ src: `/guides/${set}/${name}.png`, w, h, alt, caption, rings });
const shot = shotOf('google');
const metaShot = shotOf('meta');
const xShot = shotOf('x');
const tiktokShot = shotOf('tiktok');
const snapShot = shotOf('snapchat');

export const GUIDES: Record<string, Guide> = {
  meta: {
    title: 'تجهيز تطبيق Meta لإنستغرام',
    intro: 'للمدير. تُجرى مرة واحدة على مسار Meta الجديد (Unified login)، وتنتهي بإدخال معرّف التطبيق وسره ومعرّف الإعداد في الموقع.',
    steps: [
      {
        id: 'accounts',
        implied: true,
        t: 'افتح حسابات إنستغرام في الحافظة',
        b: 'حافظة الأعمال هي التي تملك حسابات القسم، ومنها يربطها التطبيق.',
        todo: [
          'افتح الصفحة من الرابط، وسجّل الدخول بحساب فيسبوك الذي يدير حافظة أعمال القسم.',
          'إن فتحت الصفحة الرئيسية للحافظة «Home» بدل الإعدادات، فاضغط «Go to Business settings».',
          'من القائمة التي على اليسار افتح «Accounts» ثم «Instagram accounts».',
        ],
        shots: [
          metaShot('ig-home', 975, 128, 'الصفحة الرئيسية لحافظة الأعمال: «No ad accounts» وتحتها زر Go to Business settings', 'الاسم في الصورة محجوب. هذه الصفحة تفتح أحياناً بدل الإعدادات.', ['2']),
          metaShot('ig-menu', 378, 560, 'قائمة Business settings: تحت Accounts تجد Pages وAd accounts وApps وInstagram accounts', 'العنصر المظلل هو «Instagram accounts».', ['3']),
        ],
        link: META_PORTFOLIO,
        ok: 'فتحتها',
      },
      {
        id: 'ig_add',
        implied: true,
        t: 'أضف حساب إنستغرام إلى الحافظة',
        b: 'يجب أن يكون الحساب مهنياً ومملوكاً لحافظة القسم، فالشخصي لا يعمل.',
        todo: [
          'في «Instagram accounts» اضغط «Add» أعلى الصفحة.',
          'يقول التنبيه إن الحسابات المهنية وحدها تُضاف، وإن الحساب الشخصي يتحول إلى مهني. اقرأه ثم اضغط «Add Instagram account».',
          'تفتح نافذة إنستغرام: سجّل الدخول بحساب القسم نفسه.',
          'إن سألتك «Which best describes you?» فاختر «Business» للقسم، أو «Creator» لحساب شخص عام، ثم «Next». لا يُسأل عنها حساب مهني من قبل.',
          'تظهر رسالة أن الحساب أُضيف إلى الحافظة. اترك المفتاح الأخير مطفأً: تشغيله يعطي من يدخل بهذا الحساب صلاحيات على إعدادات الحافظة. ثم اضغط «Done».',
        ],
        shots: [
          metaShot('ig-add', 902, 100, 'أعلى صفحة Instagram accounts: حقل البحث وزر Filters وزر Add', undefined, ['1']),
          metaShot('ig-warning', 751, 430, 'نافذة Add an Instagram account: تنبيه أن الحسابات المهنية وحدها تُضاف، وزر Add Instagram account', undefined, ['2']),
          metaShot('ig-professional', 469, 724, 'نافذة إنستغرام «Which best describes you?»: خياران Creator وBusiness وزر Next', 'تظهر هذه النافذة لحساب لم يكن مهنياً.', ['4']),
          metaShot('ig-added', 748, 380, 'أسفل نافذة إضافة الحساب: Summary of changes ومفتاح إدارة المستخدمين وزر Done', 'اسم الحافظة والحساب محجوبان. الحلقة الحمراء على المفتاح: اتركه مطفأً.', ['5', 'x']),
        ],
        ok: 'أضفته',
      },
      {
        id: 'app',
        implied: true,
        t: 'أنشئ التطبيق',
        b: 'التطبيق هو الهوية التي يعرّف بها الموقع نفسه عند Meta.',
        todo: [
          'افتح الصفحة من الرابط، وسجّل الدخول بحساب فيسبوك الذي يدير حافظة أعمال القسم.',
          'اضغط «Create App»: في أعلى الصفحة، أو في وسطها إن لم يكن عندك تطبيق بعد.',
          'في «App name» اكتب `Comms Hub`. الاسم يظهر لمن يوافق على الربط، وتعدّله لاحقاً من «Settings».',
          'في «App contact email» اترك بريدك، أو اكتب بريداً تراجعه بانتظام: تراسلك Meta عليه في شأن التطبيق.',
          'اضغط «Next». يصير الزر أزرق حين يُكتب الاسم.',
        ],
        shots: [
          metaShot('app-list', 640, 70, 'أعلى صفحة Apps في Meta for Developers: حقل البحث وزر Create App', undefined, ['2']),
          metaShot('app-name', 975, 263, 'شاشة App details في Create an app: حقل App name وحقل App contact email وزر Next', 'البريد محجوب. الزر «Next» رمادي لأن الاسم فارغ.', ['3', '4', '5']),
        ],
        link: META_APPS,
        ok: 'أنشأت التطبيق',
      },
      {
        id: 'usecase',
        implied: true,
        t: 'اختر حالة الاستخدام',
        b: 'هي ما يحدد الصلاحيات التي يطلبها التطبيق، فاختر إنستغرام وحده.',
        todo: [
          'في «Add use cases» لن تجد إنستغرام في «Featured»: اضغط «Content management» من القائمة التي على اليسار.',
          'علّم «Manage messaging & content on Instagram» وحدها. ولا تعلّم «Manage everything on your Page»: لفيسبوك خطوات مستقلة.',
          'اضغط «Next».',
          'في «Business» اختر حافظة الأعمال التي أضفت إليها حساب إنستغرام. بدون الحافظة لا يظهر الإعداد في الخطوة التالية.',
          'تابع «Requirements» ثم «Overview» وأنشئ التطبيق. تفتح بعدها لوحة التطبيق «Dashboard».',
        ],
        shots: [
          metaShot('use-featured', 975, 582, 'شاشة Add use cases على قائمة Featured: ست حالات استخدام ليس بينها إنستغرام', 'القائمة المميزة لا تحمل إنستغرام.', ['1']),
          metaShot('use-instagram', 975, 527, 'شاشة Add use cases على Content management: «Manage messaging & content on Instagram» معلَّمة وزر Next', 'الخيار الثاني معلَّم وحده. شاشات «Business» و«Requirements» و«Overview» لم تُصوَّر بعد.', ['2', '3']),
        ],
        link: META_APPS,
        ok: 'اخترتها',
      },
      {
        id: 'config',
        implied: true,
        t: 'أنشئ الإعداد',
        b: 'هو ما يحدد الصلاحيات التي يطلبها الموقع ممن يربط حسابه.',
        todo: [
          'من لوحة التطبيق اضغط «Customize the Manage messaging & content on Instagram use case».',
          'من القائمة التي على اليسار اختر «API setup with Unified login». تقول لافتة أعلى الصفحة إن «API setup with Instagram login» لا يتوفر للتطبيقات الجديدة: هذا طبيعي.',
          'تحت «1. Configure your app» اضغط «Create new configuration».',
          'تعرض النافذة الصلاحيات: تأكد أن `instagram_content_publish` بينها، ثم اضغط «Create from template».',
          'يظهر الإعداد باسم «Instagram API (unified login)» وعليه «Selected»، وفيه «Configuration ID». ابق في الصفحة: ستنسخه في خطوة المعرّف والسر.',
        ],
        shots: [
          metaShot('dashboard', 975, 210, 'لوحة التطبيق Dashboard: «App customization and requirements» وأولها Customize the Manage messaging & content on Instagram use case', 'هذا أول ما تراه بعد إنشاء التطبيق. اسم التطبيق خارج الصورة.', ['1']),
          metaShot('config-menu', 376, 300, 'قائمة حالة الاستخدام Instagram API: Permissions and features وAPI setup with Unified login وAPI setup with Facebook login', undefined, ['2']),
          metaShot('config-page', 975, 385, 'قسم «1. Configure your app»: «No compatible configurations found» وجدول الإعداد وزر Create new configuration', 'الجدول هو ما سيُنشأ: رمز وصول لمستخدم نظام لا ينتهي، وحساب إنستغرام مطلوب.', ['3']),
          metaShot('config-confirm', 738, 560, 'نافذة Confirm login configuration details: قائمة الصلاحيات وفيها instagram_content_publish وزر Create from template', 'ads_management وads_read في القائمة من قالب Meta نفسه: اتركهما.', ['4']),
          metaShot('config-done', 975, 87, 'الإعداد Instagram API (unified login) وعليه «Instagram Login Compatible» و«Selected» ومعرّف الإعداد Configuration ID', 'المعرّف محجوب.', ['5']),
        ],
        link: META_APPS,
        ok: 'أنشأت الإعداد',
      },
      {
        id: 'redirect',
        implied: true,
        kind: 'copy',
        t: 'سجّل عنوان العودة',
        b: 'هو العنوان الذي تعيد Meta الناس إليه بعد موافقتهم، ويجب أن يطابق تماماً.',
        todo: [
          'في الصفحة نفسها انزل إلى «Redirect URL».',
          'انسخ العنوان من الحقل أدناه والصقه في «Register a new redirect URL» بالضبط، بلا مسافة قبله أو بعده.',
          'اضغط «Save».',
        ],
        copy: '{redirect}',
        copyLabel: 'عنوان العودة',
        copyAt: 2,
        shots: [metaShot('redirect-url', 975, 140, 'قسم Redirect URL: حقل Register a new redirect URL وزر Save', 'النص الباهت «https://yourdomain.com/auth/callback» مثال فقط: الصق عنواننا مكانه.', ['2', '3']),
          metaShot('redirect-saved', 975, 256, 'قسم Redirect URL بعد الحفظ: العنوان في القائمة المنسدلة ورسالة «Redirect URL saved»', 'بعد «Save» يظهر العنوان في القائمة، وتظهر رسالة النجاح.'),
        ],
        link: META_APPS,
        ok: 'سجّلت العنوان',
      },
      {
        id: 'skip',
        implied: true,
        t: 'اترك الأقسام التي تحت الإعداد',
        b: 'ثلاثة أقسام في الصفحة نفسها، ولا يحتاجها الربط.',
        todo: [
          'في «2. Generate access tokens» لا تضغط «Add account»: يأخذ الموقع الرمز من تسجيل الدخول نفسه.',
          'في «3. Configure webhooks» اترك «Callback URL» و«Verify token» فارغين. لا يملك الموقع عنوان Webhooks بعد، وإن منعتك Meta من المتابعة فأخبر مسؤول النظام.',
          'في «4. Complete App Review» تقول Meta إن لك تخطّيه إن كنت تبني لحسابات تملكها فقط. لا تضغط «Go to app review».',
        ],
        shots: [
          { ...metaShot('skip-webhooks', 975, 477, 'قسما «2. Generate access tokens» و«3. Configure webhooks»: زر Add account وحقلا Callback URL وVerify token', undefined, ['x']), at: 2 },
          { ...metaShot('skip-review', 975, 221, 'قسم «4. Complete App Review»: عبارة أن لك تخطّيه إن كنت تبني لحسابات تملكها فقط وزر Go to app review', 'العبارة في الصورة هي كلام Meta نفسها.', ['x']), at: 3 },
        ],
        ok: 'تركتها',
      },
      {
        id: 'roles',
        implied: true,
        t: 'أضف من سيربطون الحسابات',
        b: 'في «App roles» أضف كل من سيسجّل الدخول لربط الحسابات. هذا يكفي لحسابات القسم نفسه، و«App Review» لازمة فقط لخدمة حسابات لا تملكها.',
        info: [
          'إن ظهرت لمن يربط صفحة Meta «App not active» فالتطبيق في وضع التطوير وهو بلا دور عليه: أضف حسابه في فيسبوك من «App roles» ثم «Roles» دوراً «Administrator» أو «Developer»، وليقبل الدعوة من developers.facebook.com قبل أن يحاول. وإن كان له دور فافتح لوحة التطبيق وانظر في «Required actions»: Meta توقف التطبيق حتى تُكمل ما تطلبه.',
          'وإن فتح مالك التطبيق developers.facebook.com فظهرت له «Account confirmation needed» فحساب المطوّر نفسه موقوف عند Meta، ويظهر «App not active» لكل من يحاول الربط، وبدور أو بلا دور. لا يحلّه إلا المالك بنفسه: يضغط «Confirm Account» ويكمل خطوات التحقق التي تطلبها Meta، ثم يعيد المحاولة.',
        ],
        link: META_APPS,
        ok: 'أضفتهم',
      },
      {
        id: 'keys',
        kind: 'keys',
        t: 'انسخ المعرّف والسر',
        b: 'ثلاث قيم من Meta، تلصقها هنا وحدها ولا ترسلها إلى أحد.',
        todo: [
          'من القائمة التي على اليسار افتح «App settings» ثم «Basic».',
          'انسخ «App ID» والصقه في الحقل الأول هنا.',
          'بجانب «App secret» اضغط «Show» وانسخ السر والصقه في الحقل الثاني. لا ترسله إلى أحد.',
          'من صفحة الإعداد («API setup with Unified login») اضغط أيقونة النسخ بجانب «Configuration ID» والصقه في الحقل الثالث.',
          'اضغط «فحص وحفظ». يسأل الموقع Meta أولاً، ولا يحفظ شيئاً إن رفضت.',
        ],
        shots: [
          metaShot('basic-menu', 376, 140, 'قائمة التطبيق: App settings مفتوحة وتحتها Basic وAdvanced', undefined, ['1']),
          metaShot('basic-keys', 975, 74, 'صفحة App settings ثم Basic: حقل App ID وحقل App secret المخفي وزر Show', 'المعرّف محجوب. السر مخفي حتى تضغط «Show».', ['2', '3']),
          metaShot('config-id', 650, 75, 'الإعداد Instagram API (unified login): سطر Configuration ID وبجانبه أيقونة النسخ', 'المعرّف محجوب.', ['4']),
        ],
        fieldsAt: { id: 2, secret: 3, config: 4 },
        link: META_APPS,
      },
    ],
    notes: [
      'بعد هذه الخطوات تُربط الحسابات من «حسابات المنصات»: دخول واحد يعطي كل حسابات إنستغرام التي تختارها من حافظة واحدة.',
      'ما يُنشأ والتطبيق في وضع التطوير قد لا يراه إلا أصحاب الأدوار عليه، فتحقق من أول منشور.',
      'تذكر Meta عنوان Webhooks ضمن متطلبات هذا المسار، ولا يملك الموقع عنواناً لها بعد. إن منعك ذلك من المتابعة فأخبر مسؤول النظام.',
      'الصور من حساب Meta تجريبي: الأسماء والحسابات والبريد فيها محجوبة. قد يختلف شكل صفحات Meta قليلاً بحسب لغة حسابك وتحديثاتها، فاعتمد على أسماء الأزرار.',
      'أفاد مطوّرون في 2026-11-01 أن الخطأ 100/33 زال بإضافة business_management إلى الإعداد من «Facebook Login for Business» ثم «Configurations». ليس هذا من وثائق Meta.',
      'ليحذف الموقع منشور «تجربة النشر» من إنستغرام يحتاج الإعداد صلاحية instagram_manage_contents. إن لم تكن في قائمته فأضفها ثم أعد ربط الحساب. بدونها ينشر الموقع ولا يحذف.',
      SIMULATION_IG,
      PLATFORM_FACTS,
    ],
    link: META_APPS,
    phases: [
      { t: 'حافظة الأعمال', ids: ['accounts', 'ig_add'] },
      { t: 'التطبيق والإعداد', ids: ['app', 'usecase', 'config', 'redirect', 'skip', 'roles'] },
      { t: 'المعرّف والسر', ids: ['keys'] },
    ],
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
    notes: [
      'لم تؤكد وثائق Meta أن حالتي الاستخدام تجتمعان في تطبيق واحد: لوحة Meta تقول ذلك في الخطوة الأولى. إن رفضت فلا يحفظ الموقع اليوم إلا تطبيق Meta واحداً: أخبر مسؤول النظام.',
      '«تجربة النشر» على الصفحة تحتاج pages_manage_posts وpages_read_engagement، وpublish_video للريلز. وحذف منشور التجربة لا يحتاج غيرها.',
      SIMULATION_FB,
      PLATFORM_FACTS,
    ],
    link: META_APPS,
  },
  tiktok: {
    title: 'تجهيز تطبيق TikTok',
    intro: 'للمدير. تُجرى مرة واحدة في TikTok for Developers: مؤسسة، ثم تطبيق، ثم بيئة تجربة تُربط بها الحسابات وتُجرَّب، ثم مراجعة TikTok.',
    steps: [
      {
        id: 'org',
        implied: true,
        t: 'أنشئ مؤسسة',
        b: 'يطلب TikTok أن تملك التطبيقَ مؤسسة لا شخص، فتُنشأ أولاً.',
        todo: [
          'افتح الصفحة من الرابط، وسجّل الدخول بحساب TikTok الذي سيملك التطبيق.',
          'من «Developer Portal» أعلى الصفحة اختر «My organizations».',
          'اضغط «Create an organization».',
          'في «Organization name» اكتب اسم القسم، ثم اضغط «Create». لا يتغير الاسم بعد ذلك.',
          'تفتح صفحة المؤسسة على «Overview».',
        ],
        shots: [
          tiktokShot('org-menu', 350, 205, 'قائمة Developer Portal: My organizations وManage apps', undefined, ['2']),
          tiktokShot('org-list', 680, 108, 'أعلى صفحة My organizations من جهة اليمين: زر Create an organization', undefined, ['3']),
          tiktokShot('org-name', 945, 416, 'نافذة Create an organization: حقل Organization name وتحته أن الاسم لا يتغير، وزر Create', undefined, ['4']),
          { ...tiktokShot('org-page', 537, 152, 'أعلى صفحة المؤسسة: Organizations ثم اسمها، وتبويبات Overview وRoles and access وCompliance وSettings', 'اسم المؤسسة محجوب.'), at: 5 },
        ],
        link: TIKTOK_PORTAL,
        ok: 'أنشأتها',
      },
      {
        id: 'app',
        implied: true,
        t: 'أنشئ التطبيق',
        b: 'التطبيق هو الهوية التي يعرّف بها الموقع نفسه عند TikTok.',
        todo: [
          'في صفحة المؤسسة، تحت «Apps»، اضغط «Create app».',
          'في «App name» اكتب `Comms Hub`. يظهر الاسم لمن يربط حسابه.',
          'في «App type» اختر «Other». لا يتغير النوع بعد ذلك.',
          'اضغط «Create app».',
          'تفتح صفحة التطبيق، وفي أعلاها «Production» و«Sandbox».',
        ],
        shots: [
          tiktokShot('app-create', 480, 300, 'قسم Apps في صفحة المؤسسة: No apps yet وزر Create app', undefined, ['1']),
          tiktokShot('app-name', 782, 651, 'نافذة Create app: حقل App name وفيه Comms Hub، وثلاثة أنواع آخرها Other مختار، وزر Create app', undefined, ['2', '3', '4']),
          tiktokShot('app-page', 980, 330, 'صفحة التطبيق: Production وSandbox في أعلاها، والقائمة، وCredentials مخفية', 'الاسم في الصورة كما ظهر بعد الإنشاء.', ['5']),
        ],
        info: ['إن بدأت من «Manage apps» ثم «Connect an app» فاختر «Organization» ثم مؤسستك. إن قالت القائمة «No organizations» فارجع إلى الخطوة السابقة.'],
        link: TIKTOK_APPS,
        ok: 'أنشأت التطبيق',
      },
      {
        id: 'verify',
        implied: true,
        kind: 'copy',
        t: 'وثّق عنوان الموقع',
        b: 'يثبت لـTikTok أن الموقع لكم. يُجرى مرة واحدة ويغطي كل عناوين الموقع.',
        todo: [
          'أعلى صفحة التطبيق اضغط «URL properties»، ثم «Verify properties».',
          'اختر «URL prefix». لا تختر «Domain»: يحتاج سجلاً في DNS لا نملكه.',
          'انسخ العنوان من الحقل أدناه والصقه كما هو، بالشرطة التي في آخره، ثم اضغط «Verify».',
          'اضغط «Download File» وأرسل الملف إلى مسؤول النظام ليضعه على الموقع، وانتظر حتى يخبرك أنه وُضع.',
          'اضغط «Verify». يظهر العنوان تحت «Verified properties».',
        ],
        copy: '{origin}/',
        copyLabel: 'عنوان الموقع',
        shots: [
          tiktokShot('verify-open', 942, 478, 'نافذة URL properties for Production: «You must verify URL properties» وزر Verify properties', undefined, ['1']),
          tiktokShot('verify-type', 938, 532, 'نافذة Select property type: Domain بسجل DNS وURL prefix بملف توقيع', undefined, ['2', 'x']),
          tiktokShot('verify-prefix', 870, 268, 'خيار URL prefix وفي حقله عنوان الموقع منتهياً بشرطة، وزر Verify', undefined, ['3']),
          tiktokShot('verify-file', 937, 466, 'نافذة Verify URL prefix: زر Download File باسم الملف، ثم Upload to وعنوان الموقع، وزر Verify', 'اسم الملف محجوب: لكل تطبيق ملفه.', ['4', '5']),
          tiktokShot('verify-error', 922, 382, 'نافذة Your property could not be verified: لم يُعثر على ملف التوقيع، وزرا Back وOk', 'هذا ما يظهر إن ضغطت «Verify» قبل أن يوضع الملف.'),
          tiktokShot('verify-done', 942, 260, 'نافذة URL properties: عنوان الموقع تحت Verified properties بنوع URL prefix', 'بعد التوثيق.'),
        ],
        info: ['إن ظهرت «Your property could not be verified» فالملف لم يوضع بعد، أو وُضع قبل أقل من دقيقتين. اضغط «Back» ثم أعد المحاولة بعد قليل.'],
        link: TIKTOK_APPS,
        ok: 'وثّقته',
      },
      {
        id: 'sandbox',
        implied: true,
        t: 'أنشئ بيئة التجربة',
        b: 'لا يحفظ TikTok نسخة «Production» إلا مع طلب المراجعة وفيديو من الموقع نفسه، فالربط والتجربة يبدآن في «Sandbox».',
        todo: [
          'أعلى صفحة التطبيق اضغط «Sandbox».',
          'إن لم تكن هناك بيئة، فاضغط زر الإضافة بجانب «Sandbox» في القائمة وسمّها `Comms Hub test`.',
          'تأكد أن اللافتة تقول إنك تعدّل بيئة التجربة لا «Production».',
          'بعد كل تعديل في البيئة اضغط «Apply changes».',
        ],
        shots: [
          tiktokShot('sandbox-menu', 565, 521, 'أعلى صفحة التطبيق على Sandbox: في القائمة Sandbox وبجانبها زر الإضافة، وتحتها Comms Hub test', undefined, ['1', '2']),
          tiktokShot('sandbox-bar', 975, 100, 'شريط بيئة التجربة: Delete Sandbox وApply changes، ولافتة أنك تعدّل Comms Hub test وهي نسخة Sandbox', undefined, ['3', '4']),
        ],
        info: ['إن ضغطت «Save» في «Production» فسترى «This form has 2 errors»: هما شرح المراجعة وفيديوها، ولا يُحفظ شيء قبلهما. هذا طبيعي، وتعود إليهما في آخر الخطوات.'],
        link: TIKTOK_APPS,
        ok: 'أنشأتها',
      },
      {
        id: 'products',
        implied: true,
        t: 'أضف المنتجين',
        b: 'Login Kit لربط الحساب، وContent Posting API للنشر. كل منتج يُضاف يجب أن يظهر في فيديو المراجعة، فلا تضف غيرهما.',
        todo: [
          'من القائمة افتح «Products»، ثم اضغط «Add products».',
          'اضغط «Add» في «Login Kit» أولاً: «Content Posting API» لا يُضاف قبله.',
          'ثم «Add» في «Content Posting API»، ثم «Done». لا تضف «Share Kit»، وإن أضفته فاحذفه بأيقونة السلة على بطاقته.',
          'في بطاقة «Content Posting API» شغّل «Direct Post».',
          'في «Verify domains» اضغط «Verify»: تفتح «URL properties» لبيئة التجربة، ولها توثيقها المستقل. وثّق عنوان الموقع كما في الخطوة 3، بملف جديد يرسله مسؤول النظام. منه يجلب TikTok المقطع (pull_by_url).',
        ],
        shots: [
          tiktokShot('products-add', 787, 650, 'نافذة Add products: Login Kit وShare Kit بزر Add، وContent Posting API رمادي «Requires Login Kit»', undefined, ['2']),
          tiktokShot('products-added', 785, 858, 'نافذة Add products بعد الإضافة: Login Kit وContent Posting API وعليهما Added، وزر Done', 'الحلقة الحمراء على «Share Kit»: لا يحتاجه الموقع.', ['3', 'x']),
          tiktokShot('posting', 975, 384, 'بطاقة Content Posting API: مفتاح Direct Post مشغّل، وتحته Verify domains وزر Verify', undefined, ['4', '5']),
        ],
        link: TIKTOK_APPS,
        ok: 'أضفتهما',
      },
      {
        id: 'redirect',
        implied: true,
        kind: 'copy',
        t: 'سجّل عنوان العودة',
        b: 'هو العنوان الذي يعيد TikTok الناس إليه بعد موافقتهم، ويجب أن يطابق تماماً.',
        todo: [
          'في بطاقة «Login Kit»، تحت «Redirect URI»، اختر «Web».',
          'انسخ العنوان من الحقل أدناه والصقه بالضبط، بلا مسافة قبله أو بعده.',
          'اضغط «Apply changes».',
        ],
        copy: '{redirect}',
        copyLabel: 'عنوان العودة',
        shots: [tiktokShot('redirect', 975, 377, 'بطاقة Login Kit: Redirect URI وتبويب Web وفي الحقل عنوان العودة', undefined, ['1', '2'])],
        link: TIKTOK_APPS,
        ok: 'سجّلت العنوان',
      },
      {
        id: 'scopes',
        implied: true,
        t: 'حدّد الصلاحيات',
        b: 'ثلاث صلاحيات فقط، وكل صلاحية تُضاف يجب أن تظهر في فيديو المراجعة.',
        todo: [
          'من القائمة افتح «Scopes»، ثم اضغط «Add scopes».',
          'اختر user.info.basic وvideo.publish وvideo.upload، ولا شيء غيرها.',
          'تأكد أن الثلاث في القائمة، ثم اضغط «Apply changes».',
        ],
        shots: [tiktokShot('scopes', 975, 431, 'قسم Scopes: زر Add scopes وتحته user.info.basic وvideo.publish وvideo.upload', undefined, ['1', '3'])],
        info: ['user.info.basic يقرأ اسم الحساب ويفحص الاتصال، وvideo.publish ينشر مباشرة، وvideo.upload يرسل الفيديو مسودةً إلى صندوق الحساب في TikTok.'],
        link: TIKTOK_APPS,
        ok: 'حدّدتها',
      },
      {
        id: 'targets',
        implied: true,
        t: 'أضف حساب التجربة',
        b: 'لا يدخل بيئة التجربة إلا حساب TikTok مضاف إليها، فأضف حساب القسم الذي سيُربط.',
        todo: [
          'من القائمة افتح «Sandbox settings»، وفي «Target Users» اضغط «Add account».',
          'اضغط «Continue»، وسجّل الدخول بحساب القسم في TikTok.',
          'يسأل TikTok إن كنت تفوّض الحساب مستخدمَ اختبار للتطبيق: اضغط «متابعة».',
          'يظهر الحساب في القائمة. أضف بالطريقة نفسها كل حساب آخر سيُربط، ثم اضغط «Apply changes».',
        ],
        shots: [
          tiktokShot('targets-add', 975, 257, 'قسم Target Users: «Try out your Sandbox with an authorized target account» وزر Add account', undefined, ['1']),
          tiktokShot('targets-continue', 443, 267, 'نافذة Connect TikTok account: سيُطلب منك الدخول إلى TikTok، وزرا Cancel وContinue', undefined, ['2']),
          tiktokShot('targets-consent', 797, 673, 'صفحة TikTok بالعربية: يحتاج تطبيق TikTok for Developers إلى التحقق من حسابك، وزرا متابعة وإلغاء', 'اسم الحساب وصورته محجوبان.', ['3']),
          tiktokShot('targets-list', 975, 292, 'قسم Target Users: الحساب المضاف ووقت إضافته وزر Remove', 'اسم الحساب محجوب.', ['4']),
        ],
        link: TIKTOK_APPS,
        ok: 'أضفته',
      },
      {
        id: 'keys',
        kind: 'keys',
        t: 'انسخ المفتاح والسر',
        b: 'قيمتان من بيئة التجربة، تلصقهما هنا وحدهما ولا ترسلهما إلى أحد.',
        todo: [
          'في بيئة التجربة افتح «App details» ثم «Credentials».',
          'اضغط العين بجانب «Client key» وانسخه، والصقه في الحقل الأول هنا.',
          'وكذلك «Client secret» في الحقل الثاني. لا ترسله إلى أحد.',
          'اترك «الصلاحيات المطلوبة» في «خيارات أخرى» فارغاً: الافتراضي هو الثلاث نفسها.',
          'اضغط «فحص وحفظ». يسأل الموقع TikTok أولاً، ولا يحفظ شيئاً إن رفض.',
        ],
        fieldsAt: { id: 2, secret: 3, more: 4 },
        shots: [
          tiktokShot('keys-menu', 291, 325, 'قائمة التطبيق: App details مفتوحة وتحتها Credentials وBasic information', undefined, ['1']),
          tiktokShot('keys', 975, 164, 'قسم Credentials: Client key وClient secret مخفيان، وبجانب كل منهما أيقونة العين', 'لا تصوّر المفتاحين وهما ظاهران.', ['2', '3']),
        ],
        info: ['بعد أن يوافق TikTok على المراجعة ويصير التطبيق «Live»، تُستبدل بهذين مفتاحا «Production» من هذه الخطوة نفسها.'],
        link: TIKTOK_APPS,
      },
      {
        id: 'details',
        kind: 'copy',
        t: 'أكمل بيانات «Production»',
        b: 'تُملأ في «Production» مع طلب المراجعة، لأن TikTok لا يحفظها قبله.',
        todo: [
          'اضغط «Production» أعلى الصفحة، ثم من القائمة «App details» ثم «Basic information».',
          'في «App icon» ارفع أيقونة الموقع: نزّلها من العنوان أدناه (1024 في 1024).',
          'في «App name» `Comms Hub`، وفي «Category» اختر «Business»، وفي «Description» الصق الوصف من الحقل أدناه.',
          'في «Terms of Service URL» و«Privacy Policy URL» الصق الرابطين من الحقلين أدناه.',
          'في «Platforms» اختر «Web»، والصق عنوان الموقع بالشرطة التي في آخره. بدونها يقول TikTok «This URL is not verified».',
        ],
        copy: '{origin}/',
        copyLabel: 'عنوان الموقع',
        copyAt: 5,
        more: [
          { label: 'أيقونة الموقع', copy: '{origin}/brand/comms-hub-icon-1024.png', at: 2 },
          { label: 'الوصف', copy: TIKTOK_DESCRIPTION, at: 3 },
          { label: 'رابط الشروط', copy: '{origin}/terms.html', at: 4 },
          { label: 'رابط الخصوصية', copy: '{origin}/privacy.html', at: 4 },
        ],
        shots: [
          tiktokShot('details-category', 582, 400, 'قائمة Category مفتوحة: Books وBusiness وEducation وEntertainment وFinance', undefined, ['3']),
          { ...tiktokShot('details-web', 975, 326, 'Platforms وعليها Web، وحقل Web/Desktop URL بلا شرطة في آخره وتحته «This URL is not verified»', 'الحلقة الحمراء: عنوان بلا شرطة في آخره لا يطابق العنوان الموثَّق.', ['x']), at: 5 },
        ],
        link: TIKTOK_APPS,
        ok: 'أكملتها',
      },
      {
        id: 'review',
        kind: 'copy',
        t: 'قدّم التطبيق للمراجعة',
        b: 'يراجع TikTok التطبيق بفيديو يعرض الربط والنشر من الموقع نفسه. بعد الموافقة يصير «Live».',
        todo: [
          'في «Production» أضف المنتجين وعنوان العودة والصلاحيات نفسها كما في بيئة التجربة.',
          'في «App review»، في حقل الشرح، الصق النص من الحقل أدناه.',
          'سجّل فيديو من الموقع وهو على بيئة التجربة: ربط الحساب من «حسابات المنصات»، ثم «تجربة النشر» بنوعيها حتى يظهر الفيديو في TikTok. الصيغة mp4 أو mov، حتى 50 MB.',
          'اضغط «Upload» وارفع الفيديو، ثم «Save»، ثم «Submit for review».',
          'بعد الموافقة انسخ مفتاحي «Production» وضعهما مكان مفتاحي التجربة في خطوة المفتاح والسر.',
        ],
        copy: TIKTOK_REVIEW,
        copyLabel: 'شرح المراجعة',
        shots: [tiktokShot('review', 975, 452, 'قسم App review: حقل الشرح بحد 1000 حرف، وزر Upload لفيديو العرض وشروطه', undefined, ['2', '4'])],
        info: ['يقول TikTok إن التطبيق الذي لم يُوافَق عليه من قبل يُعرض في الفيديو من بيئة التجربة، وإن عنوان الموقع في الفيديو يجب أن يطابق العنوان الموثَّق.'],
        link: TIKTOK_APPS,
        ok: 'صار Live',
      },
      { id: 'audit', kind: 'review', t: 'تدقيق النشر', b: 'قبل اجتياز «التدقيق» كل ما يُنشر مباشرة مقيّد بالمشاهدة الخاصة: هذه قاعدة TikTok لا قاعدة الموقع.', link: TIKTOK_APPS, ok: 'سأقدّمه لاحقاً' },
    ],
    notes: [
      'قبل التدقيق لا يُنشر مباشرة إلا بالمشاهدة الخاصة، وبحد 5 مستخدمين في 24 ساعة. بعده يبقى حد نحو 15 منشوراً في اليوم للحساب.',
      'في بيئة التجربة لا يدخل إلا الحسابات المضافة في «Target Users»، والمسودة المرسلة إلى الصندوق لا تظهر لأحد حتى ينشرها صاحب الحساب من TikTok.',
      'مدة رمز الدخول 24 ساعة ويُجدَّد تلقائياً بالفحص الذي يجري حين تُفتح صفحة الحسابات.',
      'الصور من حساب مطوّر جُرّبت عليه الخطوات في 2026-11-15: اسم المؤسسة والحساب محجوبان. قد يختلف شكل صفحات TikTok قليلاً، فاعتمد على أسماء الأزرار.',
      SIMULATION,
      PLATFORM_FACTS,
    ],
    link: { href: 'https://developers.tiktok.com/doc/content-posting-api-get-started', label: 'وثائق Content Posting API' },
    phases: [
      { t: 'المؤسسة والتطبيق', ids: ['org', 'app', 'verify'] },
      { t: 'بيئة التجربة', ids: ['sandbox', 'products', 'redirect', 'scopes', 'targets'] },
      { t: 'المفتاح والسر', ids: ['keys'] },
      { t: 'المراجعة', ids: ['details', 'review', 'audit'] },
    ],
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
      'إن قال Meta إن التطبيق في وضع التطوير، أو ظهرت «App not active»، فاطلب من مسؤول النظام أن يعطيك دوراً على التطبيق، واقبل الدعوة قبل أن تحاول من جديد.',
      SIMULATION_IG,
      SIMULATION_FB,
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
    notes: ['لربط حساب آخر سجّل خروجك من TikTok ثم أعد الخطوات.', 'قبل أن يوافق TikTok على التطبيق لا يُربط إلا حساب أضافه المدير إلى «Target Users» في بيئة التجربة.', 'إن ظهرت عبارة «تطبيق المطوّر غير مضبوط» فيجهّز المدير التطبيق من «الإعدادات» ثم «المنصات».', SIMULATION],
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
        shots: [{ ...shot('menu', 340, 467, 'القائمة الجانبية في Google Auth Platform: Overview وBranding وAudience وClients وData access وVerification centre وSettings', 'قائمة الصفحة التي على اليسار: منها تفتح «Branding» و«Audience» و«Clients».'), at: 1 }],
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
        shots: [shot('branding', 755, 582, 'صفحة Branding: حقل App name وحقل User support email، وتحتهما App logo', 'الاسم في الصورة مثال من مشروع آخر، والبريد محجوب.', ['1', '2', 'x'])],
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
        shots: [{ ...shot('contact', 733, 198, 'أسفل صفحة Branding: Developer contact information وحقل Email addresses وزرا Save وDiscard changes', 'الحلقتان على الحقل وعلى زر «Save»، والبريد محجوب.'), at: 4 }],
        link: { href: 'https://console.cloud.google.com/auth/branding', label: 'Branding في Google Cloud' },
        ok: 'ضبطتها',
      },
      {
        id: 'testusers',
        implied: true,
        tag: 'لمن اختار «External»',
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
          shot('test-users', 650, 371, 'صفحة Audience: قسم Test users وزر Add users وتحته قائمة البريد', 'قائمة الأسماء محجوبة.', ['2']),
          shot('add-users', 435, 175, 'لوحة Add users: حقل كتابة البريد وزر Save', 'الحقل لكتابة البريد، ثم زر «Save».', ['3', '4']),
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
          shot('clients', 975, 295, 'صفحة Clients: زر Create client وجدول OAuth 2.0 Client IDs', 'أسماء العملاء في الجدول محجوبة.', ['1']),
          shot('app-type', 688, 297, 'قائمة Application type: Web application أولها، ثم Android وChrome extension وiOS', 'اختر «Web application»، وهي أول القائمة.', ['2']),
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
        shots: [shot('redirect', 660, 245, 'قسم Authorised redirect URIs: حقل URIs 1 وزر Add URI', 'الحقل فارغ، والنص الباهت «https://www.example.com» مثال فقط: الصق عنواننا مكانه.', ['2', '3'])],
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
        shots: [shot('redirect-create', 660, 272, 'أسفل Create OAuth client ID: زر Add URI ثم زرا Create وCancel', 'الزر «Create» رمادي في الصورة لأن الحقول فارغة.', ['1', '3'])],
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
        fieldsAt: { id: 2, secret: 3 },
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
      SIMULATION_YT,
      PLATFORM_FACTS,
    ],
    link: { href: 'https://console.cloud.google.com/', label: 'Google Cloud Console' },
    phases: [
      { t: 'المشروع والواجهات', ids: ['project', 'youtube', 'drive'] },
      { t: 'شاشة الموافقة', ids: ['consent', 'branding', 'audience', 'contact', 'testusers'] },
      { t: 'معرّف العميل', ids: ['client', 'redirect', 'redirect_drive', 'keys'] },
      { t: 'النشر', ids: ['publish'] },
    ],
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
    intro: 'للمدير. هذه خطوات واجهة X المدفوعة، وتُجرى مرة واحدة وتنتهي بإدخال معرّف العميل وسره في الموقع. لا تحتاجها للنشر بالرابط: أضف حساب X بالرابط من «حسابات المنصات» (مجاني وبلا إعداد).',
    steps: [
      {
        id: 'console',
        implied: true,
        t: 'ادخل وحدة المطوّرين',
        b: 'هي صفحة X التي تُنشأ منها التطبيقات وتُشحن منها الأرصدة.',
        todo: [
          'افتح الصفحة من الرابط، وسجّل الدخول بحساب القسم على X.',
          'اقبل اتفاقية المطوّرين إن ظهرت.',
          'تفتح لك «Dashboard» باسمك. على اليسار القوائم التي سنستعملها: «Apps» و«Usage» و«Credits».',
        ],
        link: X_CONSOLE,
        ok: 'دخلت',
      },
      {
        id: 'credits',
        implied: true,
        t: 'اشحن رصيداً',
        b: 'X تحاسب كل طلب من رصيد تشحنه مسبقاً، وأسعار الطلبات في الجداول أدناه.',
        todo: [
          'في «Dashboard» ترى «Total Balance» و«Credits» و«Free Credits»: كلها صفر دولار في حساب جديد.',
          'اضغط «Buy Credits» واختر المبلغ. ابدأ بمبلغ صغير: النشر ما زال محاكاة في الموقع.',
          'اقرأ أسعار الطلبات في الجداول أدناه قبل أن تدفع.',
          'اللافتة الصفراء «Enable now» تفعّل الشحن التلقائي حين ينقص الرصيد. فعّله إن أردت ألا يتوقف النشر بغتة، وإلا فراقب الرصيد بنفسك.',
          'قدّر تكلفة نشاطك بالحاسبة أدناه قبل أن تختار المبلغ.',
        ],
        tool: 'x-cost',
        info: [
          'الأسعار من وحدة المطوّرين كما ظهرت يوم 2026-11-03، وتتغير: راجعها قبل الشحن.',
          'ما يُحاسَب عليه الموقع الآن هو فحص الاتصال فقط: يقرأ حساب X مرة، وتسمّيه X «User: Read»، أي نحو 0.010 دولار لكل فحص. أما النشر الحقيقي على X فلم يبدأ بعد.',
        ],
        tables: [
          {
            title: 'الأهم للنشر',
            head: ['الطلب', 'السعر'],
            rows: [X_ACTIONS[0], X_ACTIONS[1], X_READS[1]],
            note: 'المنشور الذي فيه رابط أغلى بكثير من غيره: 0.200 دولار.',
          },
          { title: 'أسعار القراءة (Resource)', head: ['المورد', 'السعر'], rows: X_READS, fold: true },
          { title: 'أسعار الإجراءات (Action)', head: ['الإجراء', 'السعر'], rows: X_ACTIONS, fold: true },
          { title: 'أسعار الأحداث (Event)', head: ['الحدث', 'السعر'], rows: X_EVENTS, fold: true, note: 'لا يشترك الموقع في أحداث X، فهذا الجدول للعلم فقط.' },
        ],
        shots: [xShot('x-dashboard', 975, 205, 'لوحة وحدة المطوّرين Dashboard: رصيد الحساب وزر Buy Credits ولافتة الشحن التلقائي', 'الاسم محجوب. الأرصدة صفر في حساب جديد.', ['1', '2', '4'])],
        link: { href: 'https://docs.x.com/x-api/getting-started/pricing', label: 'أسعار X API' },
        ok: 'شحنت الرصيد',
      },
      { id: 'app', implied: true, t: 'أنشئ التطبيق', b: '«Create App»، ثم الاسم والوصف والاستعمال.', link: X_CONSOLE, ok: 'أنشأت التطبيق' },
      { id: 'auth', implied: true, t: 'فعّل تسجيل دخول المستخدم', b: 'في إعدادات OAuth 2.0: الصلاحيات «Read and write»، والنوع «Web App» (عميل سرّي).', link: X_CONSOLE, ok: 'فعّلته' },
      { id: 'redirect', implied: true, kind: 'copy', t: 'سجّل عنوان العودة', b: 'أضفه إلى عناوين العودة في التطبيق. يجب أن يطابق تماماً، حتى الشرطة الأخيرة.', copy: '{redirect}', copyLabel: 'عنوان العودة', ok: 'سجّلت العنوان' },
      { id: 'website', implied: true, kind: 'copy', t: 'أدخل عنوان الموقع', b: 'في حقل عنوان الموقع: الصق هذا العنوان.', copy: '{origin}', copyLabel: 'عنوان الموقع', ok: 'أدخلته' },
      { id: 'keys', kind: 'keys', t: 'انسخ المعرّف والسر', b: '«Client ID» و«Client Secret» من مفاتيح التطبيق. يظهران مرة واحدة، فانسخهما فوراً. الصقهما هنا فقط، ولا ترسلهما إلى أحد.', link: X_CONSOLE },
    ],
    notes: [
      'النشر بالرابط لا يحتاج هذه الخطوات: يجهّز الموقع المنشور (النص والملفات ورابطاً يفتح X والنص فيه)، وينشر مسؤول النشر بنفسه ثم يلصق رابط المنشور. يُضاف الحساب بالرابط من «حسابات المنصات» عند «إضافة حساب» ثم X.',
      'بعد هذه الخطوات تُربط الحسابات من «حسابات المنصات»، ولكل حساب دخول مستقل.',
      'الأسعار من وحدة المطوّرين في 2026-11-03، وتتغير. يمكن وضع حد للإنفاق في وحدة المطوّرين.',
      'رمز الدخول ساعتان ويُجدَّد تلقائياً بالفحص الذي يجري حين تُفتح صفحة الحسابات، ما دام الدخول طلب «offline.access».',
      SIMULATION,
      PLATFORM_FACTS,
    ],
    link: X_CONSOLE,
  },
  snapchat: {
    title: 'تجهيز تطبيق Snapchat',
    intro: 'للمدير. تُجرى مرة واحدة، وتنتهي بإدخال معرّف العميل وسره في الموقع. يربط الموقع بها «الملف العام» (Public Profile) لحساب سناب شات الذي يسجّل الدخول. النشر على سناب شات ما زال يدوياً بحزمة جاهزة.',
    steps: [
      {
        id: 'account',
        implied: true,
        t: 'سجّل الدخول بحساب سناب شات الذي سيملك الملف',
        b: 'حساب سناب شات واحد يملكه القسم، ببريد موثَّق. منه تُنشأ حسابات الأعمال والملف العام وتطبيق الربط.',
        todo: ['افتح الصفحة من الرابط، واكتب بريد الحساب ثم كلمة المرور.', 'إن لم يكن البريد موثَّقاً فوثّقه أولاً من إعدادات الحساب.'],
        info: ['استعمل حساباً يملكه القسم لا حساباً شخصياً: من يملك حساب الأعمال يملك الملف العام ومفاتيح التطبيق.'],
        shots: [snapShot('signin', 458, 540, 'صفحة Snapchat لتسجيل الدخول: الحقل Password وزر Next، والبريد في أعلاها محجوب', undefined, ['1'])],
        link: SNAP_ACCOUNTS,
        ok: 'دخلت',
      },
      {
        id: 'business',
        implied: true,
        t: 'أنشئ حساب الأعمال في Ads Manager',
        b: 'حساب الأعمال (Organisation) هو الذي يملك تطبيق الربط. يُنشأ بشاشتين.',
        todo: [
          'افتح Ads Manager من الرابط. في أول زيارة تظهر «Welcome to Ads Manager!».',
          'اكتب في «Business name» اسم القسم، وفي «Business email address» بريده، وفي «Your name» اسمك، ثم اضغط «Next».',
          'في «Where do you do business?» اختر «Country» و«Currency» واكتب رقم هاتف القسم. «Business website» و«VAT/Tax ID» اختياريان.',
          'المربعان المعلَّمان مسبقاً هما موافقة على أن تتصل بك Snap بعروض تسويقية بالهاتف وواتساب وبالبريد. أزل العلامة منهما إن لم تردهما.',
          'اضغط «Next».',
        ],
        info: ['لا حاجة لإنشاء إعلان: لا يدفع الموقع شيئاً لسناب شات، والتطبيق مجاني.'],
        shots: [
          snapShot('business-name', 722, 540, 'Welcome to Ads Manager: الحقول Business name وBusiness email address وYour name، وتحتها زر Next ورابط Skip ad creation', 'القيم في الحقول محجوبة: اكتب اسم قسمك وبريده واسمك.', ['2']),
          snapShot('business-where', 722, 710, 'Where do you do business؟: Country وCurrency ورقم الهاتف ثم الحقلان الاختياريان، والمربعان المعلَّمان مسبقاً، وزرا Back وNext', 'رقم الهاتف محجوب. الحلقة 4 على المربعين المعلَّمين مسبقاً: عروض Snap التسويقية بالهاتف وواتساب وبالبريد.', ['3', '4', '5']),
        ],
        link: SNAP_ADS,
        ok: 'أنشأته',
      },
      {
        id: 'profile',
        implied: true,
        t: 'أنشئ الملف العام',
        b: 'الواجهة تعمل على «الملف العام» (Public Profile) للحساب الذي يسجّل الدخول، فلا بد من ملف عام.',
        todo: [
          'بعد إنشاء حساب الأعمال تظهر «Complete your Public Profile» وفيها ملف حساب سناب شات الذي سجّلت به.',
          'اضغط «Create Public Profile» ليصير هذا الملف هو الملف العام للقسم. بذلك توافق على «Commercial Content Terms».',
        ],
        info: ['الملف العام يراه كل مستخدمي سناب شات. أنشئه بحساب القسم، لا بحساب شخصي.'],
        shots: [snapShot('public-profile', 722, 616, 'Complete your Public Profile: ملف الحساب، والسؤال Do you want to make this your business\'s Public Profile؟ وزر Create Public Profile', 'اسم الملف وصورته محجوبان.', ['2'])],
        ok: 'أنشأته',
      },
      {
        id: 'dashboard',
        implied: true,
        t: 'افتح «Business details»',
        b: 'في لوحة الأعمال، لا في بوابة المطوّرين.',
        todo: [
          'افتح لوحة الأعمال من الرابط، أو اضغط «Business Dashboard» في القائمة العلوية لـ Ads Manager.',
          'من القائمة اليسرى «Business Settings» اضغط «Business details».',
          'انزل إلى بطاقة «OAuth apps». في حساب جديد تقول «You have added zero OAuth apps.».',
        ],
        info: ['لا تستعمل Snap Kit Developer Portal (kit.snapchat.com): معرّف العميل الذي يصدر منه لا يعمل مع Public Profile API، وتحذّر Snap من ذلك بنفسها.'],
        shots: [
          snapShot('menu', 330, 505, 'القائمة اليسرى Business Settings: Business Dashboard وBusiness details وMembers وAd accounts وPixels وApps وShared وUser Settings وCatalogues', 'العنصر المحاط هو «Business details».', ['2']),
          snapShot('oauth-card', 975, 164, 'بطاقة OAuth apps في Business details: زر «+ OAuth app» والسطر You have added zero OAuth apps.', undefined, ['3']),
        ],
        link: SNAP_BUSINESS,
        ok: 'وصلت',
      },
      {
        id: 'oauth',
        implied: true,
        t: 'ابدأ تطبيق OAuth',
        b: 'زر في بطاقة «OAuth apps» ثم موافقة على شروط Snap.',
        todo: [
          'اضغط «+ OAuth app» في بطاقة «OAuth apps».',
          'تظهر نافذة «API Terms and Conditions»: علّم المربع، وهو موافقة باسم المؤسسة على «Snap Developer Terms» و«Snap Business Tools Terms»، ثم اضغط «Save».',
        ],
        info: ['من يعلّم المربع يلزم المؤسسة بشروط Snap. اقرأ الشرطين من الرابطين اللذين في النافذة قبل ذلك.'],
        shots: [
          snapShot('oauth-add', 975, 164, 'بطاقة OAuth apps: زر «+ OAuth app» في أعلاها', undefined, ['1']),
          snapShot('terms', 675, 290, 'نافذة API Terms and Conditions: مربع الموافقة على Snap Developer Terms وSnap Business Tools Terms، وزرا Cancel وSave', 'اسم المؤسسة في العبارة محجوب.', ['2']),
        ],
        link: SNAP_BUSINESS,
        ok: 'وصلت إلى النموذج',
      },
      {
        id: 'form',
        implied: true,
        kind: 'copy',
        t: 'املأ نموذج التطبيق',
        b: 'اسم وعنوان عودة، ثم «Create OAuth app».',
        todo: [
          'في «App name» اكتب `Comms Hub`. «App logo» اختياري.',
          'في «Snap redirect URIs» الصق عنوان العودة أدناه، سطراً واحداً. يجب أن يطابق تماماً.',
          'اضغط «Create OAuth app».',
        ],
        copy: '{redirect}',
        copyLabel: 'عنوان العودة',
        shots: [snapShot('oauth-form', 975, 330, 'صفحة Create OAuth app: App logo وحقل App name وحقل Snap redirect URIs، وزر Create OAuth app', undefined, ['1', '2', '3'])],
        ok: 'أنشأت التطبيق',
      },
      {
        id: 'secret',
        implied: true,
        t: 'احفظ السر فوراً',
        b: 'يظهر السر مرة واحدة هنا ولا يُعاد.',
        todo: [
          'تظهر صفحة فيها «Snap Client ID» و«Snap client secret key». اضغط «Copy key» وخزّن السر في مدير كلمات مرور.',
          'انسخ «Snap Client ID» كذلك.',
          'اضغط «Done».',
        ],
        info: [
          'غطِّ السر قبل أي لقطة شاشة، ولا ترسله في محادثة أو بريد. ما يظهر في صورة يُعدّ مكشوفاً.',
          'إن ضاع السر أو انكشف فاحذف التطبيق من «Business details» وأنشئ غيره: لا طريقة لعرض السر ثانية.',
        ],
        shots: [snapShot('created', 975, 367, 'بعد إنشاء التطبيق: اسمه وعنوان العودة وSnap Client ID، والتحذير البرتقالي أن السر لن يظهر ثانية مع الرابط Copy key وزر Done', 'المعرّف والسر محجوبان في الصورة، وهكذا يجب أن تكون كل صورة تلتقطها.', ['1', '2', '3'])],
        ok: 'حفظته',
      },
      { id: 'keys', kind: 'keys', t: 'الصق المعرّف والسر', b: '«Snap Client ID» و«Snap client secret key». الصقهما هنا وحدهما، ولا ترسلهما إلى أحد.', link: SNAP_BUSINESS },
      {
        id: 'allowlist',
        kind: 'review',
        t: 'اطلب من Snap إضافة التطبيق',
        b: 'الواجهة بدعوة من Snap فقط (allowlist): يُسجَّل الدخول، وقد ترفض Snap قراءة الملف حتى تُضيف التطبيق. أرسل إلى جهة الاتصال لديك في Snap معرّف العميل (لا السر) ووصفاً لاستعمالك. لا تخبر Snap الموقع بقرارها، فقل له أنت أين وصل الطلب.',
        copy: SNAP_REQUEST,
        copyLabel: 'نص الرسالة',
        link: { href: 'https://developers.snap.com/api/marketing-api/Public-Profile-API/GetStarted', label: 'شرح Snap لطلب الوصول' },
        ok: 'أكتفي بالنشر اليدوي',
      },
    ],
    notes: [
      'بعد هذه الخطوات يُربط الملف العام من «حسابات المنصات»: دخول واحد يربط ملفاً واحداً. رمز الدخول ساعة ويُجدَّد بالفحص الذي يجري حين تُفتح تلك الصفحة.',
      'إن سجّلت الدخول ثم ظهرت عبارة أن Snap رفضت قراءة الملف العام فالتطبيق لم تُضفه Snap إلى قائمتها بعد، أو ليس للحساب ملف عام.',
      'النشر على سناب شات ما زال يدوياً بحزمة جاهزة، وما زال النشر عبر الواجهة محاكاة. هذه الخطوات تجهّز الربط والفحص فقط.',
      SNAP_FACTS,
    ],
    link: SNAP_BUSINESS,
  },
  connect_google: {
    title: 'ربط قناة يوتيوب',
    intro: 'لمن ينشر على القناة. تنتهي بحساب «ربط حقيقي» يُفحص اتصاله فعلاً.',
    steps: [
      { t: 'اضغط «ربط عبر Google (يوتيوب)»', b: 'تنتقل إلى صفحة Google. ولا يطلب الموقع كلمة مرورك أبداً.' },
      { t: 'اختر الحساب ثم القناة', b: 'سجّل الدخول بحساب Google الذي يملك القناة أو يديرها. وإن كانت القناة لحساب علامة تجارية فاختره حين تعرضه Google.' },
      { t: 'وافق على الصلاحيات الثلاث', b: 'رفع الفيديو، وقراءة القنوات التي تملكها، وإدارة مقاطعها: بها يحذف الموقع مقطع «تجربة النشر».' },
      { t: 'عُد إلى الموقع', b: 'تظهر القناة باسمها، فحدّد من ينشر عليها.' },
      { t: 'تأكد من الحالة', b: '«ربط حقيقي» وتاريخ التفويض. يُجدَّد التفويض مع كل فحص ناجح.' },
    ],
    notes: [
      'لكل قناة دخول مستقل: لربط قناة أخرى أعد الخطوات واخترها عند Google.',
      'إن قالت Google «التطبيق لم يتحقق منه» أو لم يُسمح لك بالدخول فأضف بريدك ضمن «Test users» في شاشة الموافقة، أو انشر التطبيق.',
      'إن لم يصل رمز تجديد فأزل وصول «Comms Hub» من حسابك على Google ثم أعد الربط.',
      'القناة المربوطة قبل 2026-11-03 لم تأذن بإدارة مقاطعها: ترفع مقطع التجربة ولا تحذفه حتى يُعاد ربطها مرة واحدة.',
      SIMULATION_YT,
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
  connect_snapchat: {
    title: 'ربط الملف العام على Snapchat',
    intro: 'لمن يربط حساب القسم. تنتهي بحساب «ربط حقيقي» يُفحص اتصاله فعلاً. النشر على سناب شات يبقى يدوياً.',
    steps: [
      { t: 'اضغط «ربط عبر Snapchat»', b: 'تنتقل إلى صفحة سناب شات. ولا يطلب الموقع كلمة مرورك أبداً.' },
      { t: 'اقبل «Public Profile APIs»', b: 'تسأل سناب شات «Continue to Comms Hub?» وتقول إن التطبيق سيصل إلى «Public Profile APIs». سجّل الدخول بحساب القسم واضغط «Continue».', shots: [snapShot('consent', 640, 605, 'Continue to Comms Hub؟: ملف الحساب، وعبارة أن التطبيق سيصل إلى Public Profile APIs، وزرا Continue وCancel', 'اسم الحساب وصورته محجوبان.')] },
      { t: 'اضغط «Continue» مرة ثانية', b: 'تقول سناب شات «Authorisation successful». اضغط «Continue» للعودة إلى الموقع.', shots: [snapShot('authorised', 691, 502, 'Authorisation successful: اضغط Continue للعودة إلى التطبيق')] },
      { t: 'عُد إلى الموقع', b: 'يظهر الملف العام باسمه، فحدّد من ينشر عليه.' },
      { t: 'تأكد من الحالة', b: '«ربط حقيقي». يُجدَّد الرمز تلقائياً بالفحص الذي يجري حين تُفتح هذه الصفحة.' },
    ],
    notes: [
      'كل دخول يربط ملفاً عاماً واحداً. لربط آخر سجّل خروجك من Snapchat ثم أعد الخطوات.',
      'إن ظهرت عبارة «رفضت Snap قراءة الملف العام» فالتطبيق لم تُضفه Snap إلى قائمتها بعد (آخر خطوة من إعداد سناب شات)، أو ليس للحساب ملف عام.',
      'إن ظهرت عبارة «تطبيق المطوّر غير مضبوط» فيجهّز المدير التطبيق من «الإعدادات» ثم «المنصات».',
      SIMULATION,
    ],
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

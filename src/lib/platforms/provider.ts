// Which platforms connect through which sign-in. Pure and client-safe: no token, no fetch.
export type ConnProvider = 'meta' | 'tiktok' | 'google' | 'linkedin' | 'x' | 'microsoft';
export const CONN_PROVIDERS: readonly ConnProvider[] = ['meta', 'tiktok', 'google', 'linkedin', 'x', 'microsoft'];
const PROVIDER: Record<string, ConnProvider> = {
  facebook: 'meta',
  instagram: 'meta',
  tiktok: 'tiktok',
  youtube: 'google',
  linkedin: 'linkedin',
  x: 'x',
};
export const providerOf = (platform: string): ConnProvider | null => PROVIDER[platform] ?? null;
/** The name of the sign-in a person is sent to, as the buttons and messages say it. */
export const PROVIDER_NAME: Record<ConnProvider, string> = { meta: 'Meta', tiktok: 'TikTok', google: 'Google (YouTube)', linkedin: 'LinkedIn', x: 'X', microsoft: 'Microsoft (OneDrive)' };
/** The integration type of the app a provider's accounts are connected through. */
export const APP_INTEGRATION_TYPE: Record<ConnProvider, string> = {
  meta: 'meta_app',
  tiktok: 'tiktok_app',
  google: 'google_app',
  linkedin: 'linkedin_app',
  x: 'x_app',
  microsoft: 'microsoft_app',
};

/** What each app is called and where its two values are found. */
export const PROVIDER_COPY: Record<ConnProvider, { name: string; idLabel: string; secretLabel: string; where: string }> = {
  meta: {
    name: 'تطبيق Meta (فيسبوك وإنستغرام معاً)',
    idLabel: 'معرّف التطبيق (App ID)',
    secretLabel: 'سر التطبيق (App Secret)',
    where: 'من Meta for Developers، تطبيقك، «إعدادات التطبيق» ثم «أساسي».',
  },
  tiktok: {
    name: 'تطبيق TikTok',
    idLabel: 'مفتاح العميل (Client key)',
    secretLabel: 'سر العميل (Client secret)',
    where: 'من TikTok for Developers، تطبيقك، «App details».',
  },
  google: {
    name: 'تطبيق Google (يوتيوب وDrive)',
    idLabel: 'معرّف العميل (Client ID)',
    secretLabel: 'سر العميل (Client secret)',
    where: 'من Google Auth Platform، «Clients»، عميل من نوع «Web application». يظهر السر كاملاً مرة واحدة عند إنشائه. هذا التطبيق نفسه يخدم ربط قناة يوتيوب واتصال Google Drive.',
  },
  linkedin: {
    name: 'تطبيق LinkedIn',
    idLabel: 'معرّف العميل (Client ID)',
    secretLabel: 'سر العميل (Primary Client Secret)',
    where: 'من LinkedIn Developers، تطبيقك، تبويب «Auth».',
  },
  microsoft: {
    name: 'تطبيق Microsoft (OneDrive)',
    idLabel: 'معرّف التطبيق (Application / client ID)',
    secretLabel: 'قيمة السر (Client secret Value)',
    where: 'من Microsoft Entra، «App registrations»، تطبيقك: «Overview» للمعرّف و«Certificates & secrets» للسر. انسخ «Value» لا «Secret ID».',
  },
  x: {
    name: 'تطبيق X',
    idLabel: 'معرّف العميل (OAuth 2.0 Client ID)',
    secretLabel: 'سر العميل (OAuth 2.0 Client Secret)',
    where: 'من وحدة مطوّري X (console.x.com)، مفاتيح التطبيق، قسم OAuth 2.0. يظهران مرة واحدة.',
  },
};

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

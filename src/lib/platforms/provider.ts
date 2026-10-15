// Which platforms connect through which sign-in. Pure and client-safe: no token, no fetch.
export type ConnProvider = 'meta' | 'tiktok';
const PROVIDER: Record<string, ConnProvider> = { facebook: 'meta', instagram: 'meta', tiktok: 'tiktok' };
export const providerOf = (platform: string): ConnProvider | null => PROVIDER[platform] ?? null;

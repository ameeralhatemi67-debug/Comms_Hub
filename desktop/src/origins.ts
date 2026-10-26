// The compiled list of addresses the application opens (Desktop_App_Plan.md 5.1, decision D-5 of
// 11.1). A release build holds the production address alone; a development build adds the local site.
// No setting, switch or variable widens the list: it is fixed when the application is built. Pure.

export const PRODUCTION_ORIGIN = 'https://comms-hub-three.vercel.app';
export const DEVELOPMENT_ORIGIN = 'http://127.0.0.1:3000';

/** The list for a build. main.ts and preload.ts call it only through the compiled flag. */
export function originsFor(dev: boolean): readonly string[] {
  return Object.freeze(dev ? [PRODUCTION_ORIGIN, DEVELOPMENT_ORIGIN] : [PRODUCTION_ORIGIN]);
}

/**
 * Whether an address is on the list: http or https, its exact origin listed, and no name or
 * password written into it. `https://comms-hub-three.vercel.app.example.com` and
 * `http://localhost:3000` are other origins, so they are not on it.
 */
export function isAllowed(address: string, allowed: readonly string[]): boolean {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (url.username || url.password) return false;
  return allowed.includes(url.origin);
}

// Where an address goes (Desktop_App_Plan.md 5.1, DT-01). On the list it stays in the application.
// The outside-connection routes open in the system browser after a note, because Google refuses
// sign-in inside an embedded browser and the connection's state cookie must sit in the same browser
// as its callback. Other web addresses and mail links open in the system browser. Any other kind of
// address is refused. Pure.
import { isAllowed } from './origins.ts';

/** The note shown before an outside connection opens in the browser (the plan's wording, verbatim). */
export const CONNECT_NOTE = 'يكتمل الربط في المتصفح. سجّل الدخول إلى المركز هناك إن طُلب منك، ثم ارجع إلى التطبيق.';

export type Decision =
  | { action: 'stay' }
  | { action: 'browser'; url: string; note: boolean }
  | { action: 'refuse' };

const CONNECT_ROUTES = ['/api/drive/connect', '/api/onedrive/connect'];
const PLATFORM_CONNECT = '/api/platforms/connect/';

/** The site's outside-connection routes: Drive, OneDrive and every platform's connection. */
export function isConnectRoute(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '');
  return CONNECT_ROUTES.includes(path) || (path.startsWith(PLATFORM_CONNECT) && path.length > PLATFORM_CONNECT.length);
}

/** One rule for a link, a form, a redirect and window.open alike. */
export function decideNavigation(address: string, allowed: readonly string[]): Decision {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return { action: 'refuse' };
  }
  if (url.protocol === 'https:' || url.protocol === 'http:') {
    if (!isAllowed(url.href, allowed)) return { action: 'browser', url: url.href, note: false };
    return isConnectRoute(url.pathname) ? { action: 'browser', url: url.href, note: true } : { action: 'stay' };
  }
  if (url.protocol === 'mailto:') return { action: 'browser', url: url.href, note: false };
  return { action: 'refuse' };
}

/**
 * What a failed load of the page means. -3 is a load the application or the person stopped (a
 * refused navigation, a download), so nothing is shown. Chromium's certificate errors are -200 to
 * -299: the page is never shown and the screen says why. Anything else is the connection screen.
 */
export function loadFailure(code: number): 'ignore' | 'certificate' | 'offline' {
  if (code === -3) return 'ignore';
  if (code <= -200 && code > -300) return 'certificate';
  return 'offline';
}

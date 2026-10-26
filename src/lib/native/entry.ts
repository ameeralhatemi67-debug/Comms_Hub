// Where a link mailed from the sign-in screen comes back (MVP_draft.md 63 and 64; Android_Build_Plan.md A1).
// «أول دخول» and «نسيت كلمة المرور» mail a link whose code is exchanged in the cookie store that asked for
// it (PKCE). In a browser that is the browser, so the link returns to the site's root as before. Inside an
// application the link would open the system browser, which holds no part of the request, so the link
// would fail: the application points the person to the browser instead, until it receives its own links.
// The Android application receives them once its links are verified (A6), through /app/return. Pure.
import type { Platform } from './index.ts';

export type MailReturn = { to: string } | { browser: true };

export const BROWSER_ONLY = 'يكتمل هذا من المتصفح: افتح المركز في المتصفح وأكمله هناك، ثم ارجع إلى التطبيق وسجّل الدخول.';

/** The address a mailed link returns to, or that the person must use the browser for it. */
export function mailReturn(platform: Platform, linksVerified: boolean, origin: string): MailReturn {
  if (platform === 'web') return { to: `${origin}/` };
  if (platform === 'android' && linksVerified) return { to: `${origin}/app/return` };
  return { browser: true };
}

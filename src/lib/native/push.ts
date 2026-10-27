// Push notices inside the Android application (MVP_draft.md 64.3; Android_Build_Plan.md A5, the application's
// half). The application asks Android for the notices permission after the site has said why, gets the phone's
// token from Firebase, and hands it to the page, which registers it for the signed-in person; the server sends
// through Firebase. A tap opens the notice's page, a path of the site checked here and again by the application,
// and a push that arrives while the application is in front refreshes the notices. In a browser and in the
// desktop application nothing of this exists. Plain TypeScript, tested in tests/native.test.mjs.
import { native } from './index.ts';

export type PushState = 'granted' | 'denied' | 'prompt';

/**
 * A page a notice may open: a path of the site's own pages, never another address, a file or an API route. Held
 * equal to the application's Push.java by tests/native.test.mjs.
 */
export function goPath(go: unknown): string | null {
  if (typeof go !== 'string' || go.length > 300) return null;
  // As Push.java, which must refuse them before its patterns: no control character.
  if (/[\u0000-\u001f\u007f]/.test(go)) return null;
  for (const rule of GO_RULES) if (new RegExp(rule.pattern).test(go) !== rule.must) return null;
  return go;
}

/**
 * The rules of goPath, each a pattern a path must match (`must`) or must not: plain ASCII of a path and query,
 * one leading slash, no dot segment, and none of the routes that are not pages for a member (API routes, the
 * site's own scripts, Capacitor's file routes, pages for outside people). Written once here as text so that
 * Push.java holds the very same patterns.
 */
export const GO_RULES: readonly { pattern: string; must: boolean }[] = Object.freeze([
  { pattern: "^/[A-Za-z0-9._~/?=&%:+,;@!$'()*-]*$", must: true },
  { pattern: '^//', must: false },
  { pattern: '(^|/)[.][.]?(/|$|[?])', must: false },
  { pattern: '^/(api|_next|_capacitor_file_|_capacitor_content_|r|m)(/|$|[?])', must: false },
]);

/** Whether the notices permission is granted, refused, or still to be asked; null outside the application. */
export async function pushState(): Promise<PushState | null> {
  const n = native();
  if (!n.has('push')) return null;
  try {
    return readState(await n.raw!.push!.state!());
  } catch {
    return null;
  }
}

/** Asks Android, after the page has said why; the answer as pushState gives it. */
export async function requestPush(): Promise<PushState | null> {
  const n = native();
  if (!n.has('push')) return null;
  try {
    return readState(await n.raw!.push!.request!());
  } catch {
    return null;
  }
}

/** This phone's token for the push service, or null: not allowed, no Firebase project in this build, or not yet. */
export async function pushToken(): Promise<string | null> {
  const n = native();
  if (!n.has('push')) return null;
  try {
    const t = await n.raw!.push!.token!();
    // The characters device_register accepts (supabase/migrations/*push*).
    return typeof t === 'string' && /^[A-Za-z0-9_:-]{20,4096}$/.test(t) ? t : null;
  } catch {
    return null;
  }
}

const readState = (v: unknown): PushState | null => (v === 'granted' || v === 'denied' || v === 'prompt' ? v : null);

/** How the page moves when a push is tapped; returns the function that stops listening. */
export function onPushOpen(fn: (go: string) => void): () => void {
  const open = native().raw?.push?.onOpen;
  if (typeof open !== 'function') return () => undefined;
  open((go) => {
    const path = goPath(go);
    if (path) fn(path);
  });
  return () => open(null);
}

/** What the page does when a push arrives while the application is in front: it reads the notices again. */
export function onPushReceive(fn: () => void): () => void {
  const receive = native().raw?.push?.onReceive;
  if (typeof receive !== 'function') return () => undefined;
  receive(fn);
  return () => receive(null);
}

// --- asking once, after saying why ----------------------------------------------------------------------

/** The site says why before Android asks (MVP_draft.md 64.3); «ليس الآن» puts it off for a week. */
export const ASK_AGAIN_MS = 7 * 24 * 60 * 60 * 1000;

/** Whether to show the explanation: the permission is still to be asked, and it was not put off lately. */
export function shouldExplain(state: PushState | null, putOffAt: number | null, now: number): boolean {
  if (state !== 'prompt') return false;
  return putOffAt === null || !Number.isFinite(putOffAt) || now - putOffAt >= ASK_AGAIN_MS;
}

export const EXPLAIN = Object.freeze({
  title: 'تنبيهات الهاتف',
  body: 'يرسل المركز إلى هذا الهاتف ما يحتاج قرارك، والرسائل المباشرة والإشارات إليك، وما تختار متابعته. ولا تظهر على شاشة القفل نصوص الرسائل والبريد. يمكنك تغيير ذلك من «الحساب».',
  allow: 'السماح بالتنبيهات',
  later: 'ليس الآن',
  denied: 'التنبيهات متوقفة لهذا التطبيق في إعدادات Android. فعّلها من هناك إن أردت أن تصلك.',
});

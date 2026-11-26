// «تجربة النشر بالرابط» (MVP_draft.md section 83): the test of an X account added «بالرابط». Nothing is sent to X and nothing is deleted
// there. A person gives the link of a post of the account, one already on X («فحص بلا نشر») or a test post they publish by hand from X's
// composer («نشر تجريبي»), and the database records that the account's handle and that post agree. Pure: drawn by
// src/components/work/x-link-test.tsx, held by tests/x-link-test.test.mjs. Who may and which link counts are the database's
// (supabase/migrations/20261126120000_x_link_tests.sql); the pattern of a post's link is src/lib/work/x-link.ts, the same one.
import { handleOf, xLength } from './x-link.ts';

export type XTestMode = 'existing' | 'new';

/** Tests an account may record in a day; held equal to the database's by tests/x-link-test.test.mjs. */
export const X_TEST_DAILY_LIMIT = 20;

export const X_TEST_MODE_AR: Record<XTestMode, string> = { existing: 'فحص بلا نشر', new: 'نشر تجريبي' };
export const X_TEST_MODE_HELP_AR: Record<XTestMode, string> = {
  existing: 'لا يُنشر شيء. تلصق رابط منشور سبق أن نشره الحساب، فيتأكد الموقع أنه لهذا الحساب.',
  new: 'تنشر أنت منشوراً حقيقياً من الحساب عبر نافذة النشر في X، ثم تلصق رابطه. المنشور عام ولا يحذفه الموقع.',
};

/** The text a test post starts from: short, plain, without a link (a link would be counted and shortened) and without a name. */
export const X_TEST_TEXT = 'تجربة نشر داخلية من المركز. يُحذف هذا المنشور بعد قليل.';

/** The address of the account's page on X, for opening a post to copy its link. Only a handle that X could have is turned into one. */
export function profileLink(handle: string | null | undefined): string | null {
  const h = handleOf(handle);
  return /^[A-Za-z0-9_]{1,15}$/.test(h) ? `https://x.com/${h}` : null;
}

/** Whether the test text can be posted as it is: not empty, and within X's limit as X counts it. */
export function testTextProblem(text: string): string | null {
  if (!text.trim()) return 'اكتب نص المنشور التجريبي.';
  return null;
}
export const testTextLength = xLength;

/** The refusals of the database, in words. */
export const X_TEST_ERROR_AR: Record<string, string> = {
  FORBIDDEN: 'تجربة هذا الحساب لمن يدير الحسابات ولناشري الحساب نفسه.',
  ACCOUNT_OFF: 'الحساب موقوف. شغّله أولاً من «خيارات أخرى».',
  TEST_INVALID: 'نوع التجربة غير معروف. اختر «فحص بلا نشر» أو «نشر تجريبي».',
  POST_LINK_INVALID: 'هذا ليس رابط منشور على X. الرابط الصحيح شكله x.com/اسم_الحساب/status/رقم.',
  POST_LINK_OTHER_ACCOUNT: 'هذا المنشور لحساب آخر غير هذا الحساب. إن كان اسم الحساب هنا خطأً فصحّحه، وإلا فالصق رابطاً من الحساب الصحيح.',
  TEST_LIMIT: `بلغ هذا الحساب ${X_TEST_DAILY_LIMIT} تجربة في اليوم. أعد المحاولة غداً.`,
};
/** What the page says when the database has not been given the migration yet: the link is fine, but nothing could be recorded. */
export const X_TEST_NOT_READY = 'الرابط سليم، لكن لم تُسجَّل التجربة لأن قاعدة البيانات تحتاج تحديثاً.';

export function xTestErrorAr(message: string | null | undefined): string {
  const m = message ?? '';
  for (const code of Object.keys(X_TEST_ERROR_AR)) if (m.includes(code)) return X_TEST_ERROR_AR[code];
  return 'تعذّر تسجيل التجربة. أعد المحاولة.';
}
/** Is the refusal the database's way of saying the function or the table is not there yet (the migration has not been run)? */
export const xTestNotReady = (error: { code?: string | null; message?: string | null } | null | undefined) =>
  !!error && (error.code === 'PGRST202' || error.code === 'PGRST205' || error.code === '42883' || error.code === '42P01' || /Could not find the (function|table)|does not exist/i.test(error.message ?? ''));

export type XLinkTestRow = { id: string; account_id: string; mode: XTestMode; post_id: string; post_url: string; created_by: string; created_at: string };

/** One recorded test, as the list says it: the kind, when, and who. */
export const testLineAr = (t: Pick<XLinkTestRow, 'mode' | 'created_at'>, who: string, at: (iso: string) => string) => `${X_TEST_MODE_AR[t.mode] ?? ''} · ${at(t.created_at)} · ${who}`;

/** The link as it is shown under a test: X's address without the scheme. */
export const shownLink = (url: string) => url.replace(/^https?:\/\//, '');

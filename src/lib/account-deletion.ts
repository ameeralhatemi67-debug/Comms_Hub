// «طلب حذف حسابي» (Android_Build_Plan.md A8; MVP_draft.md 64.6; supabase/migrations/*account_deletion*). Google
// Play asks that a person who can ask for an account inside the application can also have it deleted, from the
// application and from the web. The person asks on «الحساب»; those who may remove them are told in «يحتاج قرارك»
// and carry it out with «إزالة» in «الحسابات». The database decides who is told, who sees what, and what goes with
// the account; this file holds the words, the same in the panels, the public page and the specification. Pure.

/** The public page Play's listing names as the web address for deletion: public/account-deletion.html. */
export const DELETION_PAGE = '/account-deletion.html';

/** What goes with the account, beside the sign-in and every session. */
export const DELETED = [
  'الدخول وكل الجلسات على كل جهاز',
  'ملفك الشخصي: الاسم الظاهر والصورة والعنوان واللون والتوقيع',
  'صلاحياتك المضافة وطلباتها',
  'رقم واتساب المرتبط وما كتمته',
  'هواتفك في «أجهزتي» ورموز تنبيهاتها',
  'تنبيهاتك وتذكيراتك الخاصة وتقدّمك في الأدلة ونجومك في المراسلة',
  'أفكارك التي لم تصر أعمالاً',
] as const;

/** What stays, as the institution's record. */
export const KEPT = [
  'الأعمال ونصوصها وتعليقاتها وقراراتها والمهام',
  'آخر مسودة لك في مجلد كل عمل، ملفاً بلا اسمك',
  'الملفات التي رفعتها إلى المكتبة',
  'البريد والرسائل في المحادثات، لأنها لأعضائها جميعاً',
  'السجلات: من فعل ماذا ومتى',
  'سجل الطلب نفسه: من طلب الحذف ومتى ومن نفّذه',
] as const;

export type DeletionRequest = { id: string; email: string; name: string; note: string | null; status: 'open' | 'withdrawn' | 'done'; created_at: string };

/** A refusal of the database, in Arabic. */
export function deletionError(message: string | null | undefined): string {
  const m = message ?? '';
  if (m.includes('PROTECTED_ACCOUNT')) return 'حساب مؤسس: لا يُحذف من التطبيق. تواصل مع مالك المركز.';
  if (m.includes('TOO_MANY')) return 'طلبت الحذف ثلاث مرات اليوم. أعد المحاولة غداً.';
  if (m.includes('FORBIDDEN')) return 'تعذّر إرسال الطلب: حسابك غير معروف للمركز.';
  return 'تعذّر إرسال الطلب الآن. أعد المحاولة.';
}

/** The longest note, as the database keeps it. */
export const NOTE_MAX = 500;

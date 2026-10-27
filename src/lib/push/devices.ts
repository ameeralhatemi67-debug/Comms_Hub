// «أجهزتي» and «إعدادات التنبيهات» (MVP_draft.md 64.3; Mobile_Apps_Plan.md 5.3, M-13): the words the
// account page shows for a person's own devices. Pure. The rules are the database's
// (supabase/migrations/*push*): a person reads only their own devices, through the view my_devices,
// which has no token; every change is a database function.

/** One row of the view my_devices. */
export type MyDevice = {
  id: string;
  platform: 'android';
  version: string;
  name: string;
  push_ready: boolean;
  attention: boolean;
  hide_text: boolean;
  created_at: string;
  seen_at: string;
};

export const PLATFORM_AR: Record<MyDevice['platform'], string> = { android: 'Android' };

const DEVICE_ERRORS: Record<string, string> = {
  DEVICE_NOT_FOUND: 'لم يعد هذا الجهاز في قائمتك. حدّث الصفحة.',
  DEVICE_NAME: 'اكتب اسماً للجهاز من حرف واحد إلى ستين حرفاً.',
  DEVICE_REMOVED: 'أُزيل هذا الجهاز من قبل.',
  DEVICE_LIMIT: 'بلغت عشرين جهازاً. أزل جهازاً لم تعد تستعمله.',
  FORBIDDEN: 'سجّل الدخول من جديد ثم أعد المحاولة.',
};
/** A database refusal in the account page's words; never the raw code. */
export function deviceErrorText(message: string | null | undefined): string {
  const m = String(message ?? '');
  const code = Object.keys(DEVICE_ERRORS).find((k) => m.includes(k));
  return code ? DEVICE_ERRORS[code] : 'تعذّر الحفظ. أعد المحاولة.';
}

const day = (iso: string) => new Date(iso).toLocaleDateString('ar-SA-u-nu-latn', { dateStyle: 'medium', timeZone: 'Asia/Riyadh' });

/** «Android · الإصدار 1.0.2 · آخر فتح اليوم» */
export function deviceLine(d: Pick<MyDevice, 'platform' | 'version' | 'seen_at'>, nowMs: number): string {
  const seen = Date.parse(d.seen_at);
  const days = Number.isFinite(seen) ? Math.floor((nowMs - seen) / 864e5) : NaN;
  const when = !Number.isFinite(days) ? '' : days <= 0 ? 'اليوم' : days === 1 ? 'أمس' : day(d.seen_at);
  return [PLATFORM_AR[d.platform] ?? d.platform, `الإصدار ${d.version}`, when ? `آخر فتح ${when}` : ''].filter(Boolean).join(' · ');
}

/** What «إعدادات التنبيهات» shows: a setting is on when every device keeps it on. */
export function prefsOf(list: Pick<MyDevice, 'attention' | 'hide_text'>[]): { attention: boolean; hide_text: boolean; mixed: boolean } {
  if (!list.length) return { attention: true, hide_text: false, mixed: false };
  const attention = list.every((d) => d.attention);
  const hide = list.every((d) => d.hide_text);
  const mixed = list.some((d) => d.attention !== list[0].attention || d.hide_text !== list[0].hide_text);
  return { attention, hide_text: hide, mixed };
}

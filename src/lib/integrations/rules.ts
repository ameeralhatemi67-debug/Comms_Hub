// Words for the integrations core (Settings_Integrations_Plan.md 4, 5). Pure; shared by the
// settings tabs and tests. The database (supabase/migrations/*integrations*) decides.

export type IntState = 'pending' | 'connected' | 'needs_reconnect' | 'error' | 'disabled';
export type Integration = {
  id: string;
  kind: 'storage' | 'platform' | 'messaging';
  type: string;
  label: string;
  state: IntState;
  config: Record<string, unknown>;
  has_secret: boolean;
  secret_tail: string | null;
  secret_set_at: string | null;
  pending: boolean;
  last_check_at: string | null;
  last_ok_at: string | null;
  last_error: string | null;
  created_at: string;
  disabled_at: string | null;
};
export type IntEvent = { id: number; at: string; kind: string; actor: string | null; actor_name: string | null; integration: string | null; data: Record<string, unknown> };
export type Overview = {
  library_files: number;
  library_bytes: number;
  mail_files: number;
  mail_bytes: number;
  integrations: Partial<Record<IntState, number>>;
  whatsapp: { enabled: boolean; heartbeat_at: string | null } | null;
  events_day: number;
};
export type ConfigView = { present: Record<string, boolean>; vault: boolean; driveToken: 'vault' | 'env' | 'none' };

export const STATE_AR: Record<IntState, string> = {
  pending: 'بانتظار الفحص',
  connected: 'متصل',
  needs_reconnect: 'يحتاج ربطاً من جديد',
  error: 'خطأ',
  disabled: 'موقوف',
};
export const STATE_TONE: Record<IntState, string> = { pending: '', connected: 'success', needs_reconnect: 'warn', error: 'danger', disabled: '' };
export const KIND_AR: Record<Integration['kind'], string> = { storage: 'تخزين', platform: 'منصة', messaging: 'مراسلة' };

const ERROR_AR: Record<string, string> = {
  NOT_CONNECTED: 'لا يوجد رمز دائم بعد. اربط الحساب.',
  NOT_CONFIGURED: 'عميل Google OAuth غير مضبوط في الخادم.',
  TOKEN_REFUSED: 'رفضت Google الرمز. اربط الحساب من جديد.',
  DRIVE_ERROR: 'تعذّر الاتصال بـ Google Drive.',
};
export const errorAr = (code: string | null | undefined) => (code ? ERROR_AR[code] ?? (code.startsWith('DRIVE_') ? 'ردّت Google Drive بخطأ.' : 'خطأ غير معروف.') : '');

export const TOKEN_SOURCE_AR: Record<ConfigView['driveToken'], string> = {
  vault: 'في خزنة الأسرار',
  env: 'في متغيرات الخادم فقط (احتياطي)',
  none: 'لا رمز',
};

/** The server settings shown as present or missing, in words. Never a value. */
export const CONFIG_AR: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: 'عنوان قاعدة البيانات',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'مفتاح قاعدة البيانات العام',
  MAIL_SERVER_KEY: 'مفتاح الخادم (يفتح خزنة الأسرار والبريد)',
  GOOGLE_CLIENT_ID: 'معرّف عميل Google',
  GOOGLE_CLIENT_SECRET: 'سر عميل Google',
  GOOGLE_DRIVE_REFRESH_TOKEN: 'رمز Drive الاحتياطي',
  GMAIL_ADDRESS: 'عنوان صندوق البريد',
  GMAIL_APP_PASSWORD: 'كلمة مرور تطبيق البريد',
  MAIL_SITE_URL: 'عنوان الموقع في الرسائل',
  WHATSAPP_SERVER_KEY: 'مفتاح جسر واتساب',
  WHATSAPP_LINK_SECRET: 'سر روابط واتساب',
};

export const EVENT_AR: Record<string, string> = {
  created: 'أُنشئ',
  connected: 'رُبط',
  health: 'تغيّرت حالته',
  secret_set: 'أُدخل سر جديد بانتظار الفحص',
  secret_committed: 'اعتُمد السر الجديد بعد فحصه',
  secret_discarded: 'رُفض السر الجديد بعد فحصه',
  secret_used: 'استعمل الخادم السر',
  enabled: 'شُغّل',
  disabled: 'أُوقف',
  deleted: 'حُذف',
  settings: 'تغيّرت الإعدادات العامة',
};

/** One line per event, never a value. */
export function eventLine(e: IntEvent): string {
  const head = `${EVENT_AR[e.kind] ?? e.kind}${e.integration ? ` · ${e.integration}` : ''}`;
  const d = e.data ?? {};
  if (e.kind === 'health') return `${head}: ${STATE_AR[d.from as IntState] ?? ''} إلى ${STATE_AR[d.to as IntState] ?? ''}${d.error ? ` (${errorAr(String(d.error))})` : ''}`;
  if (e.kind === 'secret_used') return `${head} لـ «${d.purpose ?? ''}»`;
  if (e.kind === 'settings') {
    const parts = [
      d.maintenance_on === true && 'شُغّل شريط الصيانة',
      d.maintenance_on === false && 'أُطفئ شريط الصيانة',
      d.maintenance_text && 'تغيّر نص الصيانة',
      typeof d.upload_max_mb === 'number' && `حد الرفع ${d.upload_max_mb} ميغابايت`,
    ].filter(Boolean);
    return parts.length ? `${head}: ${parts.join('، ')}` : head;
  }
  return head;
}

export function sizeAr(bytes: number): string {
  if (!bytes) return 'لا شيء';
  if (bytes < 1024 ** 2) return `${Math.max(1, Math.round(bytes / 1024))} كيلوبايت`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} ميغابايت`;
  return `${(bytes / 1024 ** 3).toFixed(2)} غيغابايت`;
}

const INT_ERRORS: Record<string, string> = {
  FORBIDDEN: 'لا تملك صلاحية هذا الإجراء.',
  INT_NOT_FOUND: 'التكامل غير موجود.',
  SECRET_INVALID: 'السر قصير جداً أو طويل جداً.',
  INT_NO_PENDING: 'لا سر بانتظار الفحص.',
  APPEND_ONLY: 'السجل يُكتب ولا يُعدّل.',
};
export function intError(message: string | null | undefined): string {
  const m = message ?? '';
  const code = Object.keys(INT_ERRORS).find((k) => m.includes(k));
  if (code) return INT_ERRORS[code];
  if (m.includes('upload_max_mb')) return 'حد الرفع بين 1 و5120 ميغابايت.';
  return 'تعذّر تنفيذ الطلب. أعد المحاولة.';
}

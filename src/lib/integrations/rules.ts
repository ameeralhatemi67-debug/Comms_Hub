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
  storage_verified: 'فُحصت ملفات التخزين',
  storage_move_planned: 'خُطّط نقل ملفات',
  storage_move_started: 'بدأ نقل ملفات',
  storage_move_paused: 'أُوقف نقل الملفات مؤقتاً',
  storage_move_completed: 'اكتمل نقل ملفات',
  storage_move_cancelled: 'أُلغي نقل ملفات',
  storage_retired: 'أُحيلت نسخ المصدر إلى التقاعد',
};

/** One line per event, never a value. */
export function eventLine(e: IntEvent): string {
  const head = `${EVENT_AR[e.kind] ?? e.kind}${e.integration ? ` · ${e.integration}` : ''}`;
  const d = e.data ?? {};
  if (e.kind === 'health') return `${head}: ${STATE_AR[d.from as IntState] ?? ''} إلى ${STATE_AR[d.to as IntState] ?? ''}${d.error ? ` (${errorAr(String(d.error))})` : ''}`;
  if (e.kind === 'secret_used') return `${head} لـ «${d.purpose ?? ''}»`;
  if (e.kind === 'storage_verified')
    return `${head}: فُحص ${Number(d.checked ?? 0)}، سليم ${Number(d.ok ?? 0)}، مفقود ${Number(d.missing ?? 0)}، يحتاج انتباهاً ${Number(d.failed ?? 0)}`;
  if (e.kind === 'storage_move_planned')
    return `${head}: ${Number(d.files ?? 0)} ${Number(d.files ?? 0) === 1 ? 'ملف' : 'ملفات'}، ${sizeAr(Number(d.bytes ?? 0))}${d.mode === 'copy' ? '، نسخ فقط' : ''}`;
  if (e.kind === 'storage_move_started') return `${head}${d.resumed ? ' (استئناف)' : d.retry ? ` (إعادة محاولة ${Number(d.retry)})` : ''}`;
  if (e.kind === 'storage_move_completed')
    return `${head}: ${Number(d.switched ?? 0)} حُوّل، ${Number(d.copied ?? 0)} نُسخ فقط، ${Number(d.failed ?? 0)} تعذّر، ${Number(d.skipped ?? 0)} تُخطّي`;
  if (e.kind === 'storage_retired') return `${head}: ${Number(d.retired ?? 0)} نسخة`;
  if (e.kind === 'settings' && d.provider === true) return `${head}: عُدّلت إعدادات مزود التخزين`;
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

// ---------------------------------------------------------------------------
// Storage (Settings_Integrations_Plan.md 6, migration 20261014140000_storage_locations.sql)
// ---------------------------------------------------------------------------
export type StorageRoleId = 'library' | 'mail' | 'chat' | 'backup';
export type CopyState = 'ok' | 'pending' | 'failed' | 'missing' | 'retired';
export type StorageProviderRow = {
  id: string;
  type: string;
  label: string;
  state: IntState;
  last_check_at: string | null;
  last_ok_at: string | null;
  last_error: string | null;
  account: string | null;
  files: number;
  bytes: number;
  library_files: number;
  mail_files: number;
  ok: number;
  pending: number;
  failed: number;
  missing: number;
  unverified: number;
  last_verified_at: string | null;
  /** Non-secret settings (an S3-compatible provider's address, bucket, region, prefix). */
  config?: Record<string, unknown>;
  has_secret?: boolean;
  secret_tail?: string | null;
  /** Copies kept here that are not the file's primary (a held source, a backup). */
  replicas?: number;
};
export type StorageOverview = {
  providers: StorageProviderRow[];
  roles: { role: StorageRoleId; integration_id: string | null; label: string | null }[];
  unrecorded: number;
  can_manage: boolean;
  can_migrate?: boolean;
  can_secrets?: boolean;
};
/** One stored copy of a library version, as the library page shows it (never a reference). */
export type AssetCopy = {
  version: number;
  provider: string;
  type: string;
  role: 'primary' | 'replica' | 'backup';
  state: CopyState;
  size_bytes: number | null;
  verified_at: string | null;
};
/** What the verification route answers. */
export type VerifyResult = { checked: number; ok: number; missing: number; failed: number; unverified: number };

export const STORAGE_ROLE_AR: Record<StorageRoleId, string> = {
  library: 'مكتبة الوسائط',
  mail: 'مرفقات البريد',
  chat: 'ملفات المراسلة',
  backup: 'النسخ الاحتياطي',
};
export const COPY_STATE_AR: Record<CopyState, string> = {
  ok: 'سليم',
  pending: 'قيد النسخ',
  failed: 'يحتاج انتباهاً',
  missing: 'مفقود',
  retired: 'أُحيل للتقاعد',
};
export const COPY_STATE_TONE: Record<CopyState, string> = { ok: 'success', pending: '', failed: 'warn', missing: 'danger', retired: '' };
export const COPY_ROLE_AR: Record<AssetCopy['role'], string> = { primary: 'الأصل', replica: 'نسخة', backup: 'نسخة احتياطية' };

/** Providers the plan names that cannot be connected yet, with the honest reason. */
export const COMING_PROVIDERS: { id: string; label: string; why: string }[] = [
  { id: 'onedrive', label: 'OneDrive', why: 'الخطوة التالية بعد محرك النقل: يحتاج تطبيق Microsoft يعتمده المالك.' },
  { id: 'nas', label: 'جهاز تخزين شبكي (NAS)', why: 'لا يصل إليه الموقع مباشرة: ينتظر جهاز الوكيل الذي يبقى مشغّلاً، وهو غير موجود بعد.' },
];

/** When a check was made, in words, or that none was. */
export function checkedAr(iso: string | null | undefined): string {
  return iso ? `تُحقق منه ${new Date(iso).toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' })}` : 'لم يُتحقق منه بعد';
}

// ---------------------------------------------------------------------------
// Second provider and the move engine (Settings Step S3, migration 20261015140000)
// ---------------------------------------------------------------------------
export type S3Flavor = 'supabase' | 'b2' | 'r2' | 'minio' | 'aws' | 'other';
export const PROVIDER_TYPE_AR: Record<string, string> = {
  google_drive: 'Google Drive',
  s3_compatible: 'تخزين متوافق مع S3',
};
export const FLAVORS: { id: S3Flavor; label: string; endpoint: string; region: string; note: string }[] = [
  {
    id: 'supabase',
    label: 'تخزين Supabase',
    endpoint: 'https://<معرّف المشروع>.storage.supabase.co/storage/v1/s3',
    region: 'منطقة المشروع، مثل eu-central-1',
    note: 'مفاتيح S3 تُنشأ من إعدادات التخزين في لوحة المشروع وتتجاوز قواعد الصفوف. حجم الملف الأقصى تحدّده خطة المشروع.',
  },
  { id: 'b2', label: 'Backblaze B2', endpoint: 'https://s3.<المنطقة>.backblazeb2.com', region: 'مثل us-west-004', note: 'مفتاح تطبيق محصور بالحاوية.' },
  { id: 'r2', label: 'Cloudflare R2', endpoint: 'https://<معرّف الحساب>.r2.cloudflarestorage.com', region: 'auto', note: 'مفتاح API محصور بالحاوية.' },
  { id: 'aws', label: 'Amazon S3', endpoint: 'https://s3.<المنطقة>.amazonaws.com', region: 'مثل eu-central-1', note: 'مستخدم IAM بصلاحيات الحاوية فقط.' },
  { id: 'minio', label: 'MinIO', endpoint: 'https://<عنوان الخادم>', region: 'us-east-1', note: 'عنوان عام بشهادة صالحة. لا تُقبل العناوين الخاصة.' },
  { id: 'other', label: 'مزود متوافق آخر', endpoint: 'https://<العنوان>', region: 'حسب المزود', note: 'أي خدمة تدعم واجهة S3.' },
];
export type S3Settings = { endpoint: string; bucket: string; region: string; prefix: string; path_style: boolean; flavor: S3Flavor };

export type MoveState = 'planned' | 'running' | 'paused' | 'completed' | 'cancelled';
export type MoveItemState = 'pending' | 'copying' | 'copied' | 'verified' | 'switched' | 'failed' | 'skipped' | 'cancelled';
export type MoveScope = { kind: 'library' | 'mail'; folder_id?: string; asset_ids?: string[] };

export type MoveRow = {
  id: string;
  label: string | null;
  mode: 'move' | 'copy';
  state: MoveState;
  scope: MoveScope;
  files: number;
  bytes: number;
  hold_until: string | null;
  created_at: string;
  finished_at: string | null;
  source: string;
  dest: string;
  switched: number;
  copied: number;
  failed: number;
  skipped: number;
  open: number;
  retirable: number;
};

export type MoveReport = {
  move: {
    id: string;
    label: string | null;
    mode: 'move' | 'copy';
    scope: MoveScope;
    state: MoveState;
    hold_days: number;
    hold_until: string | null;
    files: number;
    bytes: number;
    dest_free: number | null;
    dest_account: string | null;
    dest_checked_at: string | null;
    created_by: string;
    created_by_name: string | null;
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
    source: { id: string; label: string; type: string };
    dest: { id: string; label: string; type: string };
  };
  counts: Partial<Record<MoveItemState, number>>;
  bytes: { planned: number; done: number; partial: number };
  skipped: Record<string, number>;
  failed: Record<string, number>;
  already_there: number;
  approved: number;
  verify: Partial<Record<'checksum' | 'size', number>>;
  retirable: number;
  retired: number;
  hold_over: boolean;
  can_migrate: boolean;
};

/** What a batch answers (src/app/api/storage/move). */
export type BatchAnswer = { state: string; claimed: number; switched: number; copied: number; failed: number; bytes: number; more: boolean; stopped?: 'provider' };

export const MOVE_STATE_AR: Record<MoveState, string> = {
  planned: 'خطة بانتظار البدء',
  running: 'يعمل',
  paused: 'موقوف مؤقتاً',
  completed: 'اكتمل',
  cancelled: 'أُلغي',
};
export const MOVE_STATE_TONE: Record<MoveState, string> = { planned: '', running: 'success', paused: 'warn', completed: 'success', cancelled: '' };
export const MOVE_ITEM_AR: Record<MoveItemState, string> = {
  pending: 'ينتظر',
  copying: 'يُنسخ',
  copied: 'نُسخ ولم يُتحقق منه',
  verified: 'تُحقق منه',
  switched: 'نُقل',
  failed: 'تعذّر',
  skipped: 'تُخطّي',
  cancelled: 'أُلغي',
};
export const SKIP_REASON_AR: Record<string, string> = {
  source_unhealthy: 'نسخته الحالية مفقودة أو بحجم غير مطابق: افحصها من «تحقق من عينة» أولاً',
  too_large: 'أكبر مما يقبله المزود الهدف في ملف واحد',
  source_changed: 'تغيّر موضعه الأصلي أثناء النقل أو حُذف',
  unknown: 'سبب غير مسجّل',
};
export const FAIL_REASON_AR: Record<string, string> = {
  SOURCE_MISSING: 'الملف غير موجود عند المصدر',
  SOURCE_CHANGED: 'تغيّر محتوى الملف عند المصدر أثناء النسخ فلم يُعتمد',
  SOURCE_SIZE_MISMATCH: 'حجمه عند المصدر لا يطابق المسجّل',
  DEST_NOT_WRITABLE: 'المزود الهدف لا يقبل الكتابة من الخادم',
  DEST_SIZE_MISMATCH: 'حجم النسخة الجديدة لا يطابق الأصل',
  DEST_CHECKSUM_MISMATCH: 'بصمة النسخة الجديدة لا تطابق ما قُرئ',
  DEST_CHECKSUM_CHANGED: 'تغيّرت بصمة النسخة الجديدة بعد الكتابة',
  DEST_MISSING: 'النسخة الجديدة مفقودة بعد الكتابة',
  DEST_FAILED: 'النسخة الجديدة بحجم غير مطابق',
  APPROVED_NEEDS_CHECKSUM: 'إصدار معتمد لا يُنقل بتحقق من الحجم وحده: يلزم تطابق البصمة',
  SESSION_EXPIRED: 'انتهت جلسة الرفع عند المزود',
};
export const failReasonAr = (code: string) => FAIL_REASON_AR[code] ?? 'تعذّرت بخطأ من المزود (' + code.slice(0, 30) + ')';

const MOVE_ERRORS: Record<string, string> = {
  MOVE_SAME_PROVIDER: 'المصدر والهدف مزود واحد.',
  MOVE_PROVIDER_NOT_READY: 'يجب أن يكون المزودان «متصل»: افحص الاتصال أولاً.',
  MOVE_BAD_SCOPE: 'نطاق النقل غير صالح.',
  MOVE_BAD_MODE: 'نمط النقل غير صالح.',
  MOVE_BAD_HOLD: 'مدة الاحتفاظ من 0 إلى 365 يوماً.',
  MOVE_TOO_MANY_PLANS: 'لديك عشر خطط بانتظار البدء. ابدأ إحداها أو ألغها.',
  MOVE_NOT_FOUND: 'الخطة غير موجودة.',
  MOVE_BAD_STATE: 'لا يصلح هذا الإجراء لحالة النقل الآن.',
  MOVE_NOT_CHECKED: 'لم يُفحص المزود الهدف بعد: أعد حساب الخطة.',
  MOVE_NO_SPACE: 'المساحة الحرة عند الهدف لا تكفي.',
  MOVE_ALREADY_RUNNING: 'يوجد نقل آخر يعمل بين المزودين نفسيهما.',
  HOLD_NOT_OVER: 'مدة الاحتفاظ بالمصدر لم تنقضِ بعد.',
  PROVIDER_LABEL: 'اسم المزود من 1 إلى 60 حرفاً.',
  PROVIDER_ENDPOINT: 'العنوان يبدأ بـ https:// ولا يكون عنوان IP ولا اسماً محلياً.',
  PROVIDER_BUCKET: 'اسم الحاوية: 3 إلى 63 حرفاً صغيراً أو رقماً أو نقطة أو شرطة.',
  PROVIDER_REGION: 'المنطقة حروف وأرقام وشرطات فقط.',
  PROVIDER_PREFIX: 'المسار البادئ حروف وأرقام ونقاط وشرطات، حتى أربعة مستويات.',
  PROVIDER_FLAVOR: 'نوع المزود غير معروف.',
  PROVIDER_LIMIT: 'بلغت الحد الأقصى من المزودين.',
  PROVIDER_IN_MOVE: 'المزود طرف في نقل مفتوح: لا يُغيَّر عنوانه حتى ينتهي.',
  PROVIDER_HOLDS_FILES: 'لا يُحذف مزود يحفظ ملفات: انقلها أو أحلها للتقاعد أولاً.',
  PROVIDER_IN_USE: 'المزود في نقل مفتوح أو يخدم دوراً.',
  NO_SECRET: 'لا مفتاح محفوظ لهذا المزود.',
  S3_FORBIDDEN: 'رفض المزود المفتاح أو لا صلاحية له على الحاوية.',
  S3_NO_BUCKET: 'الحاوية غير موجودة عند المزود.',
  S3_READBACK: 'كُتب الملف التجريبي وقُرئ مختلفاً.',
  S3_UNREACHABLE: 'تعذّر الوصول إلى عنوان المزود.',
};
export function moveError(message: string | null | undefined): string {
  const m = message ?? '';
  const code = Object.keys(MOVE_ERRORS).find((k) => m.includes(k));
  if (code) return MOVE_ERRORS[code];
  return intError(m);
}

/** A rough time for a copy: a browser-driven run moves a few megabytes a second. */
export const COPY_RATE_BYTES_PER_SECOND = 3 * 1024 * 1024;
export const estimateSeconds = (bytes: number, files = 0) => Math.ceil(bytes / COPY_RATE_BYTES_PER_SECOND) + files;
export function durationAr(seconds: number): string {
  if (seconds < 90) return 'أقل من دقيقتين';
  if (seconds < 90 * 60) return `نحو ${Math.round(seconds / 60)} دقيقة`;
  if (seconds < 36 * 3600) return `نحو ${(seconds / 3600).toFixed(1)} ساعة`;
  return `نحو ${Math.round(seconds / 86400)} يوماً`;
}

export function moveScopeAr(scope: MoveScope, folder?: string | null): string {
  if (scope.kind === 'mail') return 'مرفقات البريد والمراسلة كلها';
  if (scope.asset_ids?.length) return `${scope.asset_ids.length} ملفاً من المكتبة محدداً`;
  if (scope.folder_id) return `مجلد «${folder ?? 'محدد'}» وما تحته من المكتبة`;
  return 'مكتبة الوسائط كلها';
}

/** Share of a plan that is done, 0 to 1, for the progress bar. */
export function moveProgress(r: MoveReport): number {
  const planned = r.bytes.planned;
  if (planned <= 0) return r.move.state === 'completed' ? 1 : 0;
  return Math.max(0, Math.min(1, (r.bytes.done + r.bytes.partial) / planned));
}

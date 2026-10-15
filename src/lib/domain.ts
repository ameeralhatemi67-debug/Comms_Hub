// The product's role table and the few names the pages still read from the prototype's first
// model (Action_Plan.md B8, 2026-10-15). The sample works, notices, directory, campaign and the
// code that ran them were retired: the product reads and writes the database
// (src/components/work/, supabase/migrations/*work_cycle*). What is left:
//   - `roles`, `Role`, `roleIds`: the eight roles and what each may do. Used everywhere.
//   - `statusLabels`, `Status`: the words for the eleven work statuses.
//   - `channelAccounts`, `Channel`, `channelRisks`, `riskText`: the fixed list of channels the library's
//     publishing dialogs still offer, with the authorisation-risk words. Known leftover: they are not
//     the platform registry; replacing them is part of connecting those dialogs to it.

export const roles = {
  director: {
    name: 'مدير الاتصال المؤسسي',
    user: 'محمد',
    create: true,
    review: true,
    publish: false,
    admin: false,
    priority: 'قراراتك اليوم ومتابعة الحملة',
  },
  assistant: {
    name: 'مساعد مدير الاتصال المؤسسي',
    user: 'ريم',
    create: true,
    review: true,
    publish: false,
    admin: false,
    priority: 'تنسيق العمل ومراجعة التسليمات',
  },
  writer: {
    name: 'كاتب المحتوى',
    user: 'خالد',
    create: true,
    review: false,
    publish: false,
    admin: false,
    priority: 'المحتوى المطلوب وملاحظات المراجعة',
  },
  designer: {
    name: 'المصمم',
    user: 'سارة',
    create: true,
    review: false,
    publish: false,
    admin: false,
    priority: 'التصاميم وإصدارات الوسائط',
  },
  producer: {
    name: 'المنتج الإعلامي',
    user: 'أحمد',
    create: true,
    review: false,
    publish: false,
    admin: false,
    priority: 'الإنتاج والتسليم والمراجعة',
  },
  publisher: {
    name: 'مسؤول النشر وإدارة الحسابات',
    user: 'نورة',
    create: false,
    review: false,
    publish: true,
    admin: false,
    priority: 'الإصدارات المعتمدة ومواعيد النشر',
  },
  member: {
    name: 'عضو',
    user: 'عبدالله',
    create: true,
    review: false,
    publish: false,
    admin: false,
    priority: 'أعمالك ومشاركات الفريق',
  },
  admin: {
    name: 'Admin',
    user: 'مسؤول النظام',
    create: false,
    review: false,
    publish: false,
    admin: true,
    priority: 'حالة النظام وإعدادات المستخدمين',
  },
} as const;

export type Role = keyof typeof roles;

export const roleIds = Object.keys(roles) as Role[];

export const statusLabels = {
  DRAFT: 'مسودة',
  IN_PRODUCTION: 'قيد الإنتاج',
  IN_REVIEW: 'قيد المراجعة',
  CHANGES_REQUESTED: 'بحاجة إلى تعديل',
  REJECTED: 'مرفوض',
  APPROVED: 'جاهز للنشر',
  SCHEDULED: 'مجدول',
  PUBLISHING: 'جارٍ النشر',
  PUBLISHED: 'منشور',
  PARTIAL: 'نشر جزئي',
  FAILED: 'فشل النشر',
};

export type Status = keyof typeof statusLabels;

export const channels = ['Instagram', 'X', 'LinkedIn'] as const;

export type Channel = (typeof channels)[number];

export type IntegrationStatus = 'CONNECTED' | 'REAUTH' | 'NOT_CONFIGURED';

export type Integration = {
  id: string;
  name: string;
  kind: 'channel' | 'storage' | 'mail';
  status: IntegrationStatus;
  detail: string;
  /** Channel accounts: when the publishing authorization runs out, Riyadh time (task 0.2.3.9). */
  authorizedUntil?: string;
};

export const integrations: Integration[] = [
  {
    id: 'instagram',
    name: 'Instagram',
    kind: 'channel',
    status: 'CONNECTED',
    detail: '@organization · التفويض صالح حتى 2026-11-02',
    authorizedUntil: '2026-11-02T00:00',
  },
  {
    id: 'x',
    name: 'X',
    kind: 'channel',
    status: 'CONNECTED',
    // Runs out on the campaign day, before the evening publication (finding F-R01-07).
    detail: '@organization · التفويض صالح حتى 2026-09-23 12:00',
    authorizedUntil: '2026-09-23T12:00',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    kind: 'channel',
    status: 'REAUTH',
    detail: 'انتهت صلاحية التفويض · النشر معطل حتى إعادة الربط',
    authorizedUntil: '2026-09-20T09:00',
  },
  {
    id: 'drive',
    name: 'Google Drive',
    kind: 'storage',
    status: 'NOT_CONFIGURED',
    detail: 'لم تُضبط مساحة التخزين المشتركة',
  },
  {
    id: 'mail',
    name: 'البريد',
    kind: 'mail',
    status: 'CONNECTED',
    detail: 'صندوق الاتصال المؤسسي',
  },
  {
    id: 'nas',
    name: 'NAS',
    kind: 'storage',
    status: 'NOT_CONFIGURED',
    detail: 'لم يُضبط التخزين الداخلي',
  },
];

/** Channel accounts only: what the publishing officer depends on before a release. */
export const channelAccounts = integrations.filter((i) => i.kind === 'channel');

export type ChannelRisk = { channel: Channel; until: string; expired: boolean };

/**
 * Channels whose authorization will not hold at the publication time (task 0.2.3.9,
 * F-R01-07): already expired, or running out before `when`. Times are Riyadh time.
 */
export function channelRisks(list: Channel[], when: string): ChannelRisk[] {
  return list.flatMap((channel) => {
    const account = channelAccounts.find((a) => a.name === channel);
    if (!account?.authorizedUntil) return [];
    const expired = account.status !== 'CONNECTED';
    const runsOut = account.authorizedUntil < when;
    return expired || runsOut ? [{ channel, until: account.authorizedUntil, expired }] : [];
  });
}

/** One Arabic line per risk, for the scheduling dialog and the publishing officer's home. */
export function riskText(r: ChannelRisk) {
  const until = r.until.replace('T', ' ');
  return r.expired
    ? `تفويض ${r.channel} منتهٍ منذ ${until}. سيفشل النشر على ${r.channel} حتى إعادة الربط.`
    : `تفويض ${r.channel} ينتهي ${until}، قبل موعد النشر. أعد ربط الحساب قبل الموعد.`;
}

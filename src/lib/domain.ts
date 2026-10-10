// Domain model for the Comms Hub UI prototype.
// Local mock state only: no persistence, no network, no real authorization.
// Authority for the modelled behaviour is MVP_draft.md; the approval and
// publication policy notes below cite disscussios/approval_policy_design.md.

export type Campaign = {
  id: string;
  title: string;
  date: string;
  description: string;
  /** Planned figures recorded with the campaign brief (MVP_draft.md section 4). */
  progress: number;
  members: number;
  pieces: number;
  pendingApprovals: number;
};

export const campaign: Campaign = {
  id: 'national-2026',
  title: 'اليوم الوطني السعودي 2026',
  date: '2026-09-23',
  description: 'نحتفي بمنجزاتنا، ونروي قصص الانتماء والعطاء.',
  progress: 72,
  members: 5,
  pieces: 8,
  pendingApprovals: 2,
};

/**
 * The prototype's fixed "today" (Roadmap task 0.2.3.5, finding F-R01-02). The seed
 * tells the story of the days before the campaign date, so overdue and due-soon are
 * measured against this date, never against the viewer's clock. It is stated on
 * every page so a tester in another month is not misled.
 */
export const scenario = { today: '2026-09-21', label: 'الاثنين 21 سبتمبر 2026' };

/** Days ahead of the scenario date that count as due soon. */
export const soonDays = 2;

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

/** Roles holding content review authority. Admin authority is deliberately excluded. */
export const reviewerRoles: Role[] = roleIds.filter((r) => roles[r].review);

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

export type ChannelResult = 'SUCCESS' | 'FAILED';

export type Asset = {
  id: string;
  title: string;
  kind: 'poster' | 'video' | 'raw';
  versions: number[];
  approved: number | null;
  filename: string;
  creator: string;
};

export const assets: Asset[] = [
  {
    id: 'poster',
    title: 'الملصق النهائي',
    kind: 'poster',
    versions: [3, 4, 5],
    approved: 5,
    filename: 'poster-final.jpg',
    creator: 'سارة',
  },
  {
    id: 'reel',
    title: 'الفيديو الرئيسي',
    kind: 'video',
    versions: [3, 4],
    approved: null,
    filename: 'main-reel.mp4',
    creator: 'أحمد',
  },
  {
    id: 'footage',
    title: 'لقطات التغطية',
    kind: 'raw',
    versions: [1],
    approved: null,
    filename: 'drone-shot.mov',
    creator: 'أحمد',
  },
];

// --- Administration mock data (MVP_draft.md sections 35 to 37). UI shells only. ---

export type AccountState = 'ACTIVE' | 'SUSPENDED' | 'INVITED';

export type DirectoryEntry = {
  role: Role;
  user: string;
  roleName: string;
  email: string;
  state: AccountState;
  lastSeen: string;
};

export const accountStateLabels: Record<AccountState, string> = {
  ACTIVE: 'نشط',
  SUSPENDED: 'موقوف',
  INVITED: 'دعوة معلقة',
};

const directorySeed: { role: Role; email: string; state: AccountState; lastSeen: string }[] = [
  { role: 'director', email: 'mohammed@org.sa', state: 'ACTIVE', lastSeen: 'اليوم 08:40' },
  { role: 'assistant', email: 'reem@org.sa', state: 'ACTIVE', lastSeen: 'اليوم 08:05' },
  { role: 'writer', email: 'khalid@org.sa', state: 'ACTIVE', lastSeen: 'اليوم 09:12' },
  { role: 'designer', email: 'sara@org.sa', state: 'ACTIVE', lastSeen: 'اليوم 09:30' },
  { role: 'producer', email: 'ahmed@org.sa', state: 'ACTIVE', lastSeen: 'أمس 17:55' },
  { role: 'publisher', email: 'noura@org.sa', state: 'ACTIVE', lastSeen: 'اليوم 07:50' },
  { role: 'member', email: 'abdullah@org.sa', state: 'INVITED', lastSeen: 'لم يسجل الدخول بعد' },
  { role: 'admin', email: 'sysadmin@org.sa', state: 'ACTIVE', lastSeen: 'اليوم 06:20' },
];

export const directory: DirectoryEntry[] = directorySeed.map((entry) => ({
  ...entry,
  user: roles[entry.role].user,
  roleName: roles[entry.role].name,
}));

export type IntegrationStatus = 'CONNECTED' | 'REAUTH' | 'NOT_CONFIGURED';

export type Integration = {
  id: string;
  name: string;
  kind: 'channel' | 'storage' | 'mail';
  status: IntegrationStatus;
  detail: string;
};

export const integrationStatusLabels: Record<IntegrationStatus, string> = {
  CONNECTED: 'متصل',
  REAUTH: 'يحتاج إعادة ربط',
  NOT_CONFIGURED: 'غير مهيأ',
};

export const integrations: Integration[] = [
  {
    id: 'instagram',
    name: 'Instagram',
    kind: 'channel',
    status: 'CONNECTED',
    detail: '@organization · التفويض صالح حتى 2026-11-02',
  },
  {
    id: 'x',
    name: 'X',
    kind: 'channel',
    status: 'CONNECTED',
    detail: '@organization · التفويض صالح حتى 2026-10-18',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    kind: 'channel',
    status: 'REAUTH',
    detail: 'انتهت صلاحية التفويض · النشر معطل حتى إعادة الربط',
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

export function healthyChannels() {
  return channelAccounts.filter((i) => i.status === 'CONNECTED').length;
}

export const systemHealth = [
  { id: 'app', label: 'واجهة النموذج', value: 'تعمل محلياً', ok: true },
  { id: 'jobs', label: 'المهام الخلفية', value: 'غير مفعلة في النموذج', ok: true },
  { id: 'db', label: 'قاعدة البيانات', value: 'لا توجد قاعدة بيانات متصلة', ok: true },
  { id: 'external', label: 'الاتصالات الخارجية', value: 'لا توجد طلبات خارجية', ok: true },
];

export const storageUsage = {
  usedGb: 412,
  totalGb: 600,
  percent: Math.round((412 / 600) * 100),
  buckets: [
    { id: 'media', label: 'وسائط الحملات', gb: 268 },
    { id: 'raw', label: 'المواد الأصلية', gb: 121 },
    { id: 'docs', label: 'المستندات والنسخ', gb: 23 },
  ],
};

export const securityEvents = [
  { id: 's1', at: 'اليوم 08:41', actor: 'محمد', text: 'تسجيل دخول من جهاز معروف' },
  { id: 's2', at: 'أمس 21:10', actor: 'النظام', text: 'فشل تحديث تفويض LinkedIn' },
  { id: 's3', at: 'أمس 16:02', actor: 'مسؤول النظام', text: 'تعديل صلاحيات دور عضو' },
];

export const permissionMatrix = roleIds.map((id) => ({
  id,
  name: roles[id].name,
  create: roles[id].create,
  review: roles[id].review,
  publish: roles[id].publish,
  admin: roles[id].admin,
}));

// --- Work items, releases and publication records ---

export type Content = {
  title: string;
  body: string;
  type: string;
  owner: Role;
  due: string;
  channels: Channel[];
  assetId: string;
  assetVersion: number;
  variants: Record<Channel, string>;
  campaignId: string;
};

export type Release = Content & { revision: number; submittedBy: Role; approvedBy?: Role };

export type ReleaseRecord = {
  release: Release;
  decision: 'SUBMITTED' | 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED';
  by: Role;
  note?: string;
};

/**
 * A dispatch that actually happened.
 *
 * Publication is an external fact. Once a release has been dispatched to
 * channels, a later edit produces a new revision that needs fresh approval,
 * but it must not erase the record of what was already sent. See the note on
 * the 'edit' case in the reducer.
 */
export type PublicationRecord = {
  revision: number;
  channels: Channel[];
  results: Partial<Record<Channel, ChannelResult>>;
  outcome: Extract<Status, 'PUBLISHED' | 'PARTIAL' | 'FAILED'>;
  scheduled?: string;
};

export type Work = Content & {
  id: string;
  revision: number;
  status: Status;
  release?: Release;
  history: ReleaseRecord[];
  publications: PublicationRecord[];
  scheduled?: string;
  results: Partial<Record<Channel, ChannelResult>>;
  comments: { by: string; text: string }[];
  activity: string[];
  checklist: boolean[];
};

export type Notice = {
  id: string;
  kind: 'action' | 'attention' | 'info' | 'mention';
  title: string;
  workId: string;
  read: boolean;
  /** Roles this notice is addressed to. A role never reads another role's queue. */
  for: Role[];
};

export type State = {
  role: Role;
  work: Work[];
  campaigns: Campaign[];
  notices: Notice[];
  message: string;
};

export type Action =
  | { type: 'role'; role: Role }
  | { type: 'create'; content: Content; submit: boolean }
  | { type: 'campaign'; title: string; date: string; description: string }
  | { type: 'edit'; id: string; content: Content }
  | { type: 'submit' | 'approve' | 'publish' | 'retry'; id: string }
  | { type: 'changes' | 'reject' | 'comment'; id: string; text: string }
  | { type: 'schedule'; id: string; date: string }
  | { type: 'result'; id: string; mode: 'success' | 'partial' | 'failure' }
  | { type: 'check'; id: string; index: number }
  | { type: 'read'; id: string }
  | { type: 'clear' }
  | { type: 'notify'; text: string }
  | { type: 'reset' };

const blankVariants = { Instagram: '', X: '', LinkedIn: '' };

const baseCopy =
  'في يومنا الوطني، نحتفي بوطن يجمعنا على الطموح والعطاء. نفخر بمنجزاتنا، ونواصل العمل معاً لمستقبل يستحقه وطننا. #اليوم_الوطني_السعودي';

type SeedRow = {
  title: string;
  owner: Role;
  status: Status;
  assetId: string;
  type: string;
  due: string;
  revision?: number;
  assetVersion?: number;
  body?: string;
  channels?: Channel[];
  /** A previous submitted revision that received a change request (for the version difference). */
  previous?: { body: string; assetVersion: number; note: string };
  scheduled?: string;
  comments?: { by: string; text: string }[];
  activity: string[];
};

const seedRows: SeedRow[] = [
  {
    title: 'إعداد الفيديو الرئيسي',
    owner: 'producer',
    status: 'IN_REVIEW',
    assetId: 'reel',
    type: 'فيديو',
    due: '2026-09-22',
    revision: 4,
    activity: ['أرسل أحمد الإصدار 4 للمراجعة', 'رفع أحمد نسخة المونتاج الرابعة'],
  },
  {
    title: 'تصميم الملصق',
    owner: 'designer',
    status: 'APPROVED',
    assetId: 'poster',
    type: 'تصميم',
    due: '2026-09-22',
    activity: ['اعتمد محمد الإصدار 1', 'ثبّتت سارة الإصدار المعتمد من الملصق v5'],
  },
  {
    title: 'كتابة محتوى X',
    owner: 'writer',
    status: 'CHANGES_REQUESTED',
    assetId: 'poster',
    type: 'منشور اجتماعي',
    due: '2026-09-19',
    comments: [{ by: 'محمد', text: 'يرجى اختصار النص وإبراز مشاركة الفريق.' }],
    activity: ['طلب محمد تعديل النص', 'أرسل خالد الصياغة الأولى للمراجعة'],
  },
  {
    title: 'إعداد منشور Instagram',
    owner: 'designer',
    status: 'SCHEDULED',
    assetId: 'poster',
    type: 'منشور اجتماعي',
    due: '2026-09-22',
    // MVP_draft.md section 47: the demo calendar shows a 23 Sep 18:00 publication.
    scheduled: '2026-09-23T18:00',
    activity: ['جدولت نورة النشر في 23 سبتمبر الساعة 18:00', 'اعتمدت ريم الإصدار 1'],
  },
  {
    title: 'تغطية الحدث',
    owner: 'member',
    status: 'DRAFT',
    assetId: 'footage',
    type: 'تغطية حدث',
    due: '2026-09-23',
    activity: ['أضاف عبدالله خطة التغطية الميدانية'],
  },
  {
    title: 'معالجة لقطات التغطية',
    owner: 'producer',
    status: 'IN_PRODUCTION',
    assetId: 'footage',
    type: 'فيديو',
    due: '2026-09-21',
    activity: ['بدأ أحمد معالجة لقطات الطائرة'],
  },
  // Added for Round 1 (task 0.2.3.5): a realistic mix of overdue, due-soon and
  // on-time work against the scenario date, across more of the team.
  {
    title: 'كتابة البيان الصحفي',
    owner: 'writer',
    status: 'DRAFT',
    assetId: 'poster',
    type: 'بيان صحفي',
    due: '2026-09-18',
    activity: ['بدأت كتابة مسودة البيان الصحفي'],
  },
  {
    title: 'تصميم بطاقة LinkedIn',
    owner: 'designer',
    status: 'CHANGES_REQUESTED',
    assetId: 'poster',
    type: 'تصميم',
    due: '2026-09-20',
    comments: [{ by: 'ريم', text: 'وحّد ألوان البطاقة مع الملصق المعتمد.' }],
    activity: ['طلبت ريم تعديل ألوان البطاقة', 'أُرسلت البطاقة للمراجعة'],
  },
  {
    title: 'فيديو قصير للقصص',
    owner: 'producer',
    status: 'IN_PRODUCTION',
    assetId: 'reel',
    type: 'فيديو',
    due: '2026-09-25',
    activity: ['بدأ تقطيع مقاطع القصص من الفيديو الرئيسي'],
  },
  {
    title: 'منشور شكر المتطوعين',
    owner: 'writer',
    status: 'IN_REVIEW',
    assetId: 'poster',
    type: 'منشور اجتماعي',
    due: '2026-09-24',
    revision: 2,
    channels: ['Instagram', 'X'],
    body: 'شكراً لكل المتطوعين والزملاء الذين شاركوا معنا في التحضير لليوم الوطني السعودي 96، عطاؤكم يصنع الفرق. #اليوم_الوطني_السعودي',
    previous: {
      body: 'شكراً لكل من شارك معنا في التحضير لليوم الوطني. #اليوم_الوطني_السعودي',
      assetVersion: 4,
      note: 'اذكر المتطوعين صراحة واستخدم الملصق المعتمد.',
    },
    activity: ['أرسل خالد الإصدار 2 للمراجعة', 'طلب محمد تعديل الإصدار 1'],
  },
  {
    title: 'ألبوم صور التغطية',
    owner: 'designer',
    status: 'DRAFT',
    assetId: 'footage',
    type: 'تصميم',
    due: '2026-09-26',
    activity: ['أنشئ ألبوم صور التغطية'],
  },
];

export function initialState(): State {
  const work: Work[] = seedRows.map((row, i) => {
    const w: Work = {
      id: `CH-${241 + i}`,
      title: row.title,
      owner: row.owner,
      status: row.status,
      type: row.type,
      body: row.body ?? baseCopy,
      due: row.due,
      channels: row.channels ? [...row.channels] : [...channels],
      assetId: row.assetId,
      assetVersion: row.assetVersion ?? (row.assetId === 'reel' ? 4 : row.assetId === 'poster' ? 5 : 1),
      variants: { ...blankVariants },
      campaignId: campaign.id,
      revision: row.revision ?? 1,
      history: [],
      publications: [],
      results: {},
      comments: row.comments ? row.comments.map((c) => ({ ...c })) : [],
      activity: [...row.activity],
      checklist: [true, true, false, false],
      ...(row.scheduled ? { scheduled: row.scheduled } : {}),
    };
    if (['IN_REVIEW', 'APPROVED', 'SCHEDULED'].includes(w.status)) {
      w.release = {
        ...pickContent(w),
        revision: w.revision,
        submittedBy: w.owner,
        ...(w.status === 'IN_REVIEW' ? {} : { approvedBy: 'director' as Role }),
      };
    }
    if (w.release) {
      w.history = [
        {
          release: {
            ...pickContent(w.release),
            revision: w.release.revision,
            submittedBy: w.release.submittedBy,
            approvedBy: w.release.approvedBy,
          },
          decision: w.status === 'IN_REVIEW' ? 'SUBMITTED' : 'APPROVED',
          by: w.release.approvedBy || w.owner,
        },
      ];
    }
    if (row.previous && w.release) {
      // An earlier revision that went to review and came back with a change request.
      const before: Release = {
        ...pickContent(w),
        body: row.previous.body,
        assetVersion: row.previous.assetVersion,
        revision: w.revision - 1,
        submittedBy: w.owner,
      };
      w.history = [
        { release: before, decision: 'SUBMITTED', by: w.owner },
        { release: { ...before }, decision: 'CHANGES_REQUESTED', by: 'director', note: row.previous.note },
        ...w.history,
      ];
      w.comments = [{ by: roles.director.user, text: row.previous.note }, ...w.comments];
    }
    return w;
  });

  return {
    role: 'director',
    message: '',
    work,
    campaigns: [{ ...campaign }],
    notices: [
      {
        id: 'n1',
        kind: 'action',
        title: 'الفيديو الرئيسي يحتاج مراجعتك',
        workId: 'CH-241',
        read: false,
        for: [...reviewerRoles],
      },
      {
        id: 'n2',
        kind: 'mention',
        title: 'محمد طلب تعديل محتوى X',
        workId: 'CH-243',
        read: false,
        for: ['writer', ...reviewerRoles],
      },
      {
        id: 'n3',
        kind: 'action',
        title: 'إصدار معتمد بانتظار الجدولة: تصميم الملصق',
        workId: 'CH-242',
        read: false,
        for: ['publisher'],
      },
      {
        id: 'n4',
        kind: 'attention',
        title: 'تفويض LinkedIn منتهٍ · إعادة الربط مطلوبة قبل النشر',
        workId: 'CH-244',
        read: false,
        for: ['publisher', 'admin'],
      },
      {
        id: 'n5',
        kind: 'attention',
        title: `استخدام التخزين المؤسسي بلغ ${storageUsage.percent} بالمئة`,
        workId: 'CH-241',
        read: false,
        for: ['admin'],
      },
    ],
  };
}

export function pickContent(w: Content): Content {
  return {
    title: w.title,
    body: w.body,
    type: w.type,
    owner: w.owner,
    due: w.due,
    channels: [...w.channels],
    assetId: w.assetId,
    assetVersion: w.assetVersion,
    variants: { ...w.variants },
    campaignId: w.campaignId,
  };
}

export function canEdit(role: Role, w: Work) {
  return roles[role].create && (roles[role].review || role === w.owner);
}

export function ready(w: Work) {
  return !!w.release?.approvedBy && w.release.revision === w.revision;
}

const activeStatuses: Status[] = [
  'DRAFT',
  'IN_PRODUCTION',
  'IN_REVIEW',
  'CHANGES_REQUESTED',
  'REJECTED',
  'APPROVED',
  'SCHEDULED',
];

export function isActive(w: Work) {
  return activeStatuses.includes(w.status);
}

export function needsAttention(w: Work) {
  return ['FAILED', 'PARTIAL', 'CHANGES_REQUESTED', 'REJECTED'].includes(w.status);
}

/** Work whose delivery is still outstanding: not yet approved, scheduled or published. */
const openStatuses: Status[] = ['DRAFT', 'IN_PRODUCTION', 'IN_REVIEW', 'CHANGES_REQUESTED', 'REJECTED'];

export function isOpen(w: Work) {
  return openStatuses.includes(w.status);
}

/** Whole days from one ISO date to another, positive when `to` is later. */
export function daysBetween(from: string, to: string) {
  const day = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`);
  return Math.round((day(to) - day(from)) / 86400000);
}

/** Delivery is outstanding and its date has passed (task 0.2.3.5, F-R01-02). */
export function isOverdue(w: Work, today = scenario.today) {
  return isOpen(w) && daysBetween(today, w.due) < 0;
}

/** Delivery is outstanding and due today or within `soonDays` days. */
export function dueSoon(w: Work, today = scenario.today) {
  const d = daysBetween(today, w.due);
  return isOpen(w) && d >= 0 && d <= soonDays;
}

/** Work list filter by delivery date: 'overdue', 'soon', or anything else for all. */
export function matchesDue(w: Work, filter: string) {
  return filter === 'overdue' ? isOverdue(w) : filter === 'soon' ? dueSoon(w) : true;
}

/** Short Arabic note on a work item's delivery date, or '' when nothing is pressing. */
export function dueNote(w: Work, today = scenario.today) {
  if (!isOpen(w)) return '';
  const d = daysBetween(today, w.due);
  if (d < 0) {
    const late = -d;
    if (late === 1) return 'متأخر يوماً واحداً';
    if (late === 2) return 'متأخر يومين';
    return late <= 10 ? `متأخر ${late} أيام` : `متأخر ${late} يوماً`;
  }
  if (d === 0) return 'يستحق اليوم';
  if (d === 1) return 'يستحق غداً';
  if (d === 2) return 'يستحق بعد يومين';
  return '';
}

/** True once a release of this work item has actually been dispatched to channels. */
export function wasDispatched(w: Work) {
  return Object.keys(w.results).length > 0 || w.publications.length > 0;
}

/** Notices a given role is addressed by. Roles never read each other's queues. */
export function noticesFor(role: Role, notices: Notice[]) {
  return notices.filter((n) => n.for.includes(role));
}

// --- Role-specific home experience (MVP_draft.md section 6) ---

export type Tile = { key: string; label: string; value: number | string; hint: string; href?: string };

function countWork(work: Work[], predicate: (w: Work) => boolean) {
  return work.filter(predicate).length;
}

export function homeTiles(state: State): Tile[] {
  const work = state.work;
  const role = state.role;
  const own = (w: Work) => w.owner === role;
  const scheduledToday = (w: Work) => !!w.scheduled && w.scheduled.startsWith(campaign.date);
  const revisionRequested = (w: Work) => ['CHANGES_REQUESTED', 'REJECTED'].includes(w.status);
  const until = 'اليوم وخلال يومين';
  // Leadership counts, each a link to Work filtered to exactly those items (task 0.2.3.5).
  const overdueTile: Tile = {
    key: 'overdue',
    label: 'متأخر',
    value: countWork(work, (w) => isOverdue(w)),
    hint: 'تجاوز موعد التسليم',
    href: '/work?due=overdue',
  };
  const soonTile: Tile = {
    key: 'soon',
    label: 'قريب الموعد',
    value: countWork(work, (w) => dueSoon(w)),
    hint: until,
    href: '/work?due=soon',
  };

  switch (role) {
    case 'director':
      return [
        {
          key: 'approvals',
          label: 'بانتظار اعتمادك',
          value: countWork(work, (w) => w.status === 'IN_REVIEW'),
          hint: 'إصدارات مرسلة للمراجعة',
        },
        overdueTile,
        soonTile,
        {
          key: 'today',
          label: 'نشر اليوم',
          value: countWork(work, scheduledToday),
          hint: `مجدول في ${campaign.date}`,
        },
        {
          key: 'attention',
          label: 'يحتاج انتباه',
          value: countWork(work, needsAttention),
          hint: 'تعديلات أو إخفاقات نشر',
        },
        { key: 'campaign', label: 'حالة الحملة', value: `${campaign.progress}%`, hint: campaign.title },
      ];
    case 'assistant':
      return [
        { key: 'queue', label: 'قائمة التشغيل', value: countWork(work, isActive), hint: 'أعمال مفتوحة في الحملة' },
        {
          key: 'approvals',
          label: 'المراجعات',
          value: countWork(work, (w) => w.status === 'IN_REVIEW'),
          hint: 'بانتظار قرار مراجعة',
        },
        {
          key: 'assignments',
          label: 'الإسنادات',
          value: countWork(work, (w) => isActive(w) && w.owner !== role),
          hint: 'مسندة إلى المختصين',
        },
        {
          key: 'load',
          label: 'الأعضاء المشغولون',
          value: new Set(work.filter(isActive).map((w) => w.owner)).size,
          hint: 'توزيع الحمل الحالي',
        },
        overdueTile,
        soonTile,
      ];
    case 'writer':
      return [
        {
          key: 'tasks',
          label: 'مهام التحرير',
          value: countWork(work, (w) => own(w) && isActive(w)),
          hint: 'نصوص مسندة إليك',
        },
        {
          key: 'revisions',
          label: 'تعديلات مطلوبة',
          value: countWork(work, (w) => own(w) && revisionRequested(w)),
          hint: 'ملاحظات من المراجع',
        },
        {
          key: 'due',
          label: 'مواعيد قريبة',
          value: countWork(work, (w) => own(w) && dueSoon(w)),
          hint: until,
        },
        {
          key: 'review',
          label: 'بانتظار المراجعة',
          value: countWork(work, (w) => own(w) && w.status === 'IN_REVIEW'),
          hint: 'أرسلتها ولم يُبت فيها',
        },
      ];
    case 'designer':
      return [
        {
          key: 'tasks',
          label: 'مهام التصميم',
          value: countWork(work, (w) => own(w) && isActive(w)),
          hint: 'تصاميم مسندة إليك',
        },
        {
          key: 'revisions',
          label: 'تعديلات مطلوبة',
          value: countWork(work, (w) => own(w) && revisionRequested(w)),
          hint: 'ملاحظات من المراجع',
        },
        {
          key: 'assets',
          label: 'وسائط بانتظار الاعتماد',
          value: assets.filter((a) => a.approved === null).length,
          hint: 'إصدارات لم تُعتمد بعد',
        },
        {
          key: 'due',
          label: 'مواعيد قريبة',
          value: countWork(work, (w) => own(w) && dueSoon(w)),
          hint: until,
        },
      ];
    case 'producer':
      return [
        {
          key: 'tasks',
          label: 'مهام الإنتاج',
          value: countWork(work, (w) => own(w) && isActive(w)),
          hint: 'أعمال إنتاج مسندة إليك',
        },
        {
          key: 'uploads',
          label: 'المواد المرفوعة',
          value: assets.filter((a) => a.creator === roles.producer.user).length,
          hint: 'وسائط باسمك في المكتبة',
        },
        {
          key: 'processing',
          label: 'قيد المعالجة',
          value: countWork(work, (w) => own(w) && ['IN_PRODUCTION', 'DRAFT'].includes(w.status)),
          hint: 'لم تُرسل للمراجعة بعد',
        },
        {
          key: 'due',
          label: 'مواعيد قريبة',
          value: countWork(work, (w) => own(w) && dueSoon(w)),
          hint: until,
        },
        {
          key: 'review',
          label: 'حالة المراجعة',
          value: countWork(work, (w) => own(w) && w.status === 'IN_REVIEW'),
          hint: 'بانتظار قرار المراجع',
        },
      ];
    case 'publisher':
      return [
        {
          key: 'ready',
          label: 'جاهز للنشر',
          value: countWork(work, (w) => ready(w) && w.status === 'APPROVED'),
          hint: 'إصدارات معتمدة بلا موعد',
        },
        {
          key: 'today',
          label: 'مجدول اليوم',
          value: countWork(work, scheduledToday),
          hint: `بتوقيت الرياض · ${campaign.date}`,
        },
        {
          key: 'failures',
          label: 'إخفاقات النشر',
          value: countWork(work, (w) => ['FAILED', 'PARTIAL'].includes(w.status)),
          hint: 'قنوات تحتاج إعادة محاولة',
        },
        {
          key: 'accounts',
          label: 'صحة الحسابات',
          value: `${healthyChannels()}/${channelAccounts.length}`,
          hint: 'حسابات النشر المتصلة',
        },
      ];
    case 'member':
      return [
        {
          key: 'assigned',
          label: 'أعمالي',
          value: countWork(work, (w) => own(w) && isActive(w)),
          hint: 'مسندة إليك في الحملة',
        },
        {
          key: 'due',
          label: 'مواعيد قريبة',
          value: countWork(work, (w) => own(w) && dueSoon(w)),
          hint: until,
        },
        {
          key: 'comments',
          label: 'تعليقات على أعمالك',
          value: work.filter(own).reduce((sum, w) => sum + w.comments.length, 0),
          hint: 'نقاش الفريق',
        },
        {
          key: 'calendar',
          label: 'مواعيد التقويم',
          value: countWork(work, (w) => !!w.scheduled),
          hint: 'نشر مجدول في الحملة',
        },
      ];
    case 'admin':
      return [
        {
          key: 'health',
          label: 'حالة النظام',
          value: systemHealth.every((h) => h.ok) ? 'سليم' : 'يحتاج فحصاً',
          hint: 'النموذج المحلي',
        },
        {
          key: 'users',
          label: 'المستخدمون',
          value: directory.length,
          hint: `${directory.filter((d) => d.state === 'ACTIVE').length} حساب نشط`,
        },
        {
          key: 'integrations',
          label: 'صحة التكاملات',
          value: `${integrations.filter((i) => i.status === 'CONNECTED').length}/${integrations.length}`,
          hint: 'قنوات وتخزين وبريد',
        },
        {
          key: 'storage',
          label: 'التخزين',
          value: `${storageUsage.percent}%`,
          hint: `${storageUsage.usedGb} من ${storageUsage.totalGb} غيغابايت`,
        },
        { key: 'security', label: 'أحداث الأمن', value: securityEvents.length, hint: 'آخر الأحداث المسجلة' },
      ];
  }
}

/** Who an activity notice is addressed to, decided by the action that produced it. */
function audienceFor(type: Action['type'], w: Work, actor: Role): Role[] {
  const owner = w.owner;
  let list: Role[];
  switch (type) {
    case 'submit':
      list = [...reviewerRoles, owner];
      break;
    case 'approve':
      list = [...reviewerRoles, owner, 'publisher'];
      break;
    case 'changes':
    case 'reject':
    case 'comment':
    case 'edit':
      list = [owner, ...reviewerRoles];
      break;
    case 'schedule':
      list = ['publisher', ...reviewerRoles];
      break;
    case 'publish':
    case 'retry':
    case 'result':
      list = ['publisher', ...reviewerRoles, owner];
      break;
    default:
      list = [owner];
  }
  return [...new Set([...list, actor])];
}

export function reducer(state: State, a: Action): State {
  if (a.type === 'role') return { ...state, role: a.role, message: '' };
  if (a.type === 'reset') return initialState();
  if (a.type === 'clear') return { ...state, message: '' };
  if (a.type === 'notify') return { ...state, message: a.text };
  if (a.type === 'read')
    return { ...state, notices: state.notices.map((n) => (n.id === a.id ? { ...n, read: true } : n)) };

  const actor = roles[state.role];
  const fail = (message: string) => ({ ...state, message });

  if (a.type === 'campaign') {
    // MVP_draft.md section 51: the provisional flow starts with campaign creation
    // by department leadership, before any work item exists.
    if (!actor.create || !actor.review) return fail('إنشاء الحملات يخص إدارة الاتصال المؤسسي.');
    if (!a.title.trim() || !a.date) return fail('أكمل اسم الحملة وتاريخها.');
    const created: Campaign = {
      id: `camp-${state.campaigns.length + 1}`,
      title: a.title.trim(),
      date: a.date,
      description: a.description.trim(),
      progress: 0,
      members: 0,
      pieces: 0,
      pendingApprovals: 0,
    };
    return {
      ...state,
      campaigns: [...state.campaigns, created],
      message: `أُنشئت حملة ${created.title}`,
    };
  }

  if (a.type === 'create') {
    if (!actor.create) return fail('هذا الدور لا ينشئ المحتوى.');
    if (!a.content.title.trim() || !a.content.body.trim() || !a.content.channels.length)
      return fail('أكمل العنوان والمحتوى وقنوات النشر.');
    const id = `CH-${Math.max(...state.work.map((w) => Number(w.id.slice(3)))) + 1}`;
    const w: Work = {
      ...a.content,
      id,
      revision: 1,
      status: a.submit ? 'IN_REVIEW' : 'DRAFT',
      history: [],
      publications: [],
      results: {},
      comments: [],
      activity: [`أنشأ ${actor.user} العمل`],
      checklist: [false, false, false, false],
    };
    if (a.submit) {
      w.release = { ...pickContent(w), revision: 1, submittedBy: state.role };
      w.history = [
        { release: { ...w.release, ...pickContent(w.release) }, decision: 'SUBMITTED', by: state.role },
      ];
    }
    return {
      ...state,
      work: [w, ...state.work],
      message: `تم إنشاء ${id}`,
      notices: a.submit
        ? [
            {
              id: `${id}-1`,
              kind: 'action',
              title: `طلب مراجعة: ${w.title}`,
              workId: id,
              read: false,
              for: audienceFor('submit', w, state.role),
            },
            ...state.notices,
          ]
        : state.notices,
    };
  }

  const original = state.work.find((w) => w.id === a.id);
  if (!original) return fail('العمل غير موجود.');

  let w: Work = {
    ...original,
    activity: [...original.activity],
    comments: [...original.comments],
    results: { ...original.results },
    publications: [...original.publications],
  };
  let message = '';
  let kind: Notice['kind'] = 'info';

  switch (a.type) {
    case 'edit': {
      if (!canEdit(state.role, w) || w.status === 'PUBLISHING')
        return fail('لا يمكن تعديل هذا العمل بهذا الدور أو أثناء النشر.');
      if (!a.content.title.trim() || !a.content.body.trim() || !a.content.channels.length)
        return fail('أكمل بيانات المحتوى.');
      // Deliberate policy, two rules that must not be confused:
      //
      // 1. Approval invalidation. disscussios/approval_policy_design.md section 3
      //    requires that any post-approval mutation invalidates the approval and
      //    produces a new revision, so the edit drops release/scheduled and the
      //    item returns to DRAFT awaiting fresh review.
      //
      // 2. Publication preservation. A dispatch already sent to external channels
      //    is a fact about the outside world, not a draft state. If this revision
      //    was dispatched, its channel results are moved into the publication
      //    record rather than discarded, so editing never erases the evidence of
      //    what the department actually published.
      const dispatched = Object.keys(w.results).length > 0;
      const publications = dispatched
        ? [
            ...w.publications,
            {
              revision: w.revision,
              channels: [...w.channels],
              results: { ...w.results },
              outcome: w.status as PublicationRecord['outcome'],
              ...(w.scheduled ? { scheduled: w.scheduled } : {}),
            },
          ]
        : w.publications;
      w = {
        ...w,
        ...a.content,
        revision: w.revision + 1,
        status: 'DRAFT',
        release: undefined,
        scheduled: undefined,
        results: {},
        publications,
      };
      message = dispatched
        ? `حُفظ الإصدار ${w.revision} بعد نشر الإصدار ${w.revision - 1}. سجل النشر محفوظ، ويلزم اعتماد جديد قبل إعادة النشر.`
        : 'حُفظ إصدار جديد. يلزم إرساله للمراجعة.';
      break;
    }
    case 'submit':
      if (
        !canEdit(state.role, w) ||
        !['DRAFT', 'IN_PRODUCTION', 'CHANGES_REQUESTED', 'REJECTED'].includes(w.status)
      )
        return fail('هذا العمل غير متاح للإرسال الآن.');
      w.release = { ...pickContent(w), revision: w.revision, submittedBy: state.role };
      w.status = 'IN_REVIEW';
      message = `أُرسل الإصدار ${w.revision} للمراجعة`;
      kind = 'action';
      break;
    case 'approve':
      if (!actor.review || w.status !== 'IN_REVIEW' || w.release?.revision !== w.revision)
        return fail('لا يوجد إصدار مطابق متاح لاعتمادك.');
      w.release = { ...w.release, approvedBy: state.role };
      w.status = 'APPROVED';
      message = `اعتمد ${actor.user} الإصدار ${w.revision}`;
      kind = 'action';
      break;
    case 'changes':
    case 'reject':
      if (!actor.review || w.status !== 'IN_REVIEW' || !a.text.trim())
        return fail('المراجعة تتطلب صلاحية وسبباً واضحاً.');
      w.status = a.type === 'changes' ? 'CHANGES_REQUESTED' : 'REJECTED';
      w.comments.push({ by: actor.user, text: a.text });
      message = a.type === 'changes' ? 'طُلب تعديل المحتوى' : 'رُفض الإصدار';
      kind = 'action';
      break;
    case 'comment':
      if (!a.text.trim()) return state;
      w.comments.push({ by: actor.user, text: a.text });
      message = 'أُضيف تعليق للفريق';
      kind = 'mention';
      break;
    case 'check':
      if (!canEdit(state.role, w)) return fail('قائمة الإنتاج تخص فريق العمل.');
      w.checklist = w.checklist.map((v, i) => (i === a.index ? !v : v));
      message = 'حُدّثت قائمة الإنتاج';
      break;
    case 'schedule':
      if (!actor.publish || !ready(w) || !['APPROVED', 'SCHEDULED'].includes(w.status))
        return fail('الجدولة تتطلب إصداراً معتمداً ودور مسؤول النشر.');
      if (!a.date || !Number.isFinite(Date.parse(`${a.date}+03:00`))) return fail('حدد موعداً صالحاً.');
      w.scheduled = a.date;
      w.status = 'SCHEDULED';
      message = 'تمت الجدولة بتوقيت الرياض';
      break;
    case 'publish':
      if (!actor.publish || !ready(w) || !['APPROVED', 'SCHEDULED'].includes(w.status))
        return fail('النشر يتطلب إصداراً معتمداً ودور مسؤول النشر.');
      w.status = 'PUBLISHING';
      message = 'بدأت محاكاة النشر';
      break;
    case 'retry':
      if (!actor.publish || !ready(w) || !['PARTIAL', 'FAILED'].includes(w.status))
        return fail('لا توجد قنوات فاشلة قابلة لإعادة المحاولة.');
      w.status = 'PUBLISHING';
      message = 'إعادة محاولة القنوات الفاشلة فقط';
      break;
    case 'result': {
      if (w.status !== 'PUBLISHING') return state;
      w.channels.forEach((c, i) => {
        if (w.results[c] !== 'SUCCESS')
          w.results[c] =
            a.mode === 'failure' || (a.mode === 'partial' && i === w.channels.length - 1)
              ? 'FAILED'
              : 'SUCCESS';
      });
      const count = w.channels.filter((c) => w.results[c] === 'SUCCESS').length;
      w.status = count === w.channels.length ? 'PUBLISHED' : count === 0 ? 'FAILED' : 'PARTIAL';
      message =
        w.status === 'PUBLISHED'
          ? 'اكتمل النشر التجريبي'
          : w.status === 'PARTIAL'
            ? 'نُشرت بعض القنوات. راجع القنوات الفاشلة.'
            : 'تعذر النشر التجريبي. أعد المحاولة.';
      kind = w.status === 'PUBLISHED' ? 'info' : 'attention';
      break;
    }
  }

  if (w.release && ['submit', 'approve', 'changes', 'reject'].includes(a.type)) {
    const decision =
      a.type === 'submit'
        ? 'SUBMITTED'
        : a.type === 'approve'
          ? 'APPROVED'
          : a.type === 'changes'
            ? 'CHANGES_REQUESTED'
            : 'REJECTED';
    w.history = [
      ...w.history,
      {
        release: { ...w.release, ...pickContent(w.release) },
        decision,
        by: state.role,
        ...('text' in a ? { note: a.text } : {}),
      },
    ];
  }

  w.activity = [`${actor.user}: ${message}`, ...w.activity];

  return {
    ...state,
    work: state.work.map((x) => (x.id === w.id ? w : x)),
    message,
    notices:
      a.type === 'check'
        ? state.notices
        : [
            {
              id: `n-${Date.now()}-${state.notices.length}`,
              kind,
              title: `${w.title}: ${message}`,
              workId: w.id,
              read: false,
              for: audienceFor(a.type, w, state.role),
            },
            ...state.notices,
          ],
  };
}

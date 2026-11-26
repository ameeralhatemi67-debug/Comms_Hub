// What X's paid API would cost the department, worked out for the director (MVP_draft.md section 82). Pure, no network.
//
// The prices are those of X's pay-per-use page (docs.x.com/x-api/getting-started/pricing, read 2026-11-26), which agreed line for
// line with the developer console as read on 2026-11-03 (the table in src/lib/setup-guides.ts; tests/x-cost.test.mjs holds the two
// equal). Money is counted in mills, a thousandth of a dollar: every X price is a whole number of mills, so every sum is exact.
//
// X's pages leave three things open, and the calculator says so instead of choosing silently:
//  - what makes a post one "with URL" (taken here: any post whose text holds a link, replies included);
//  - whether uploading a picture or a video is billed (no line names it, so it is not counted unless the reader asks for the cautious figure);
//  - which line a delete falls under (two lines could, so the higher is taken).
// Prices change: the page that shows this says the day they were read.

export const X_PRICES_READ = '2026-11-26';

/** Mills (thousandths of a dollar) per unit, from X's pricing page. */
export const PRICE = {
  /** Post: Create, per request. */
  post: 15,
  /** Post: Create (with URL), per request. */
  postWithUrl: 200,
  /** User: Read, per resource: what the site's connection check asks for. */
  userRead: 10,
  /** Posts: Read, per resource. */
  postRead: 5,
  /** Media Metadata, per request: the only media line on the page. */
  mediaMetadata: 5,
  /** Interaction: Delete is 10 and Content: Manage is 5; X does not say which a delete uses, so the higher. */
  postDelete: 10,
} as const;

export type Per = 'day' | 'week' | 'month';

export type CostInput = {
  /** The length of the period, in whole months. */
  months: number;
  /** How many posts, per `per`. */
  posts: number;
  per: Per;
  /** The share of posts whose text holds a link, in percent. */
  linkShare: number;
  /** The share of posts that carry pictures or a video, in percent. */
  mediaShare: number;
  /** How many pictures one such post carries (X allows up to 4; a video or a GIF is 1). */
  mediaPerPost: number;
  /** Count the cautious figure for media: one Media Metadata for each picture or video. */
  mediaBilled: boolean;
  /** Posts deleted, per month. */
  deletes: number;
  /** Connection checks per day: each reads the account once. The site asks at most every half hour per account. */
  checksPerDay: number;
  /** Posts read back (their numbers), per month. */
  reads: number;
};

/** The range of every field, as [least, most]. */
export const RANGE = {
  months: [1, 36],
  posts: [0, 1000],
  share: [0, 100],
  mediaPerPost: [1, 4],
  deletes: [0, 10000],
  checksPerDay: [0, 48],
  reads: [0, 100000],
} as const;

export const PERIODS = [1, 2, 3, 6, 12] as const;

export const PER_AR: Record<Per, string> = { day: 'في اليوم', week: 'في الأسبوع', month: 'في الشهر' };

export function periodAr(months: number): string {
  if (months === 1) return 'شهر';
  if (months === 2) return 'شهرين';
  if (months === 12) return 'سنة';
  if (months === 24) return 'سنتين';
  if (months >= 3 && months <= 10) return `${months} أشهر`;
  return `${months} شهراً`;
}

export const DEFAULT_INPUT: CostInput = { months: 3, posts: 2, per: 'day', linkShare: 25, mediaShare: 60, mediaPerPost: 1, mediaBilled: false, deletes: 5, checksPerDay: 2, reads: 0 };

export type Scenario = { id: string; label: string; note: string; input: Partial<CostInput> };
export const SCENARIOS: Scenario[] = [
  { id: 'quiet', label: 'هادئ', note: 'منشور واحد في اليوم، بلا روابط', input: { posts: 1, per: 'day', linkShare: 0, mediaShare: 50, deletes: 2, checksPerDay: 2, reads: 0 } },
  { id: 'usual', label: 'معتاد', note: 'منشوران في اليوم، ربعها فيه رابط', input: { posts: 2, per: 'day', linkShare: 25, mediaShare: 60, deletes: 5, checksPerDay: 2, reads: 0 } },
  { id: 'busy', label: 'نشط', note: 'ثمانية منشورات في اليوم، ثلثها فيه رابط', input: { posts: 8, per: 'day', linkShare: 35, mediaShare: 70, mediaPerPost: 2, deletes: 20, checksPerDay: 6, reads: 240 } },
];

const clamp = (n: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, n));
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** Every field brought into its range and made a whole number (posts keep one decimal: "half a post a day"). Anything else becomes the default. */
export function clampInput(i: Partial<CostInput>): CostInput {
  const d = DEFAULT_INPUT;
  return {
    months: clamp(Math.round(num(i.months, d.months)), RANGE.months),
    posts: clamp(Math.round(num(i.posts, d.posts) * 10) / 10, RANGE.posts),
    per: i.per === 'week' || i.per === 'month' || i.per === 'day' ? i.per : d.per,
    linkShare: clamp(Math.round(num(i.linkShare, d.linkShare)), RANGE.share),
    mediaShare: clamp(Math.round(num(i.mediaShare, d.mediaShare)), RANGE.share),
    mediaPerPost: clamp(Math.round(num(i.mediaPerPost, d.mediaPerPost)), RANGE.mediaPerPost),
    mediaBilled: i.mediaBilled === true,
    deletes: clamp(Math.round(num(i.deletes, d.deletes)), RANGE.deletes),
    checksPerDay: clamp(Math.round(num(i.checksPerDay, d.checksPerDay)), RANGE.checksPerDay),
    reads: clamp(Math.round(num(i.reads, d.reads)), RANGE.reads),
  };
}

/** The days in a number of months: a year is 365. */
export const daysOf = (months: number) => Math.round((months * 365.25) / 12);

/** How many posts the period holds. */
export function postsIn(i: CostInput): number {
  const days = daysOf(i.months);
  return Math.round(i.per === 'day' ? i.posts * days : i.per === 'week' ? (i.posts * days) / 7 : i.posts * i.months);
}

/** `listed`: a price X prints. `assumed`: a price X prints for a line the action may or may not use. `unlisted`: X prints no price for it. */
export type Basis = 'listed' | 'assumed' | 'unlisted';
export type LineId = 'plain' | 'link' | 'media' | 'delete' | 'check' | 'read';
export type CostLine = { id: LineId; count: number; unit: number; total: number; basis: Basis };

export type CostResult = {
  input: CostInput;
  days: number;
  posts: number;
  linkPosts: number;
  mediaPosts: number;
  mediaItems: number;
  lines: CostLine[];
  /** Mills for the whole period. */
  total: number;
  perMonth: number;
  perDay: number;
  /** What one post costs on average, links included; null with no posts. */
  perPost: number | null;
  /** What the links add to the bill. */
  linkExtra: number;
  withoutLinks: number;
  /** The share of the total that links cost, in percent. */
  linkShareOfCost: number;
  /** A monthly spending limit to set in X's console: the month's cost and a fifth more, in whole dollars. */
  limitDollars: number;
};

export function estimate(raw: Partial<CostInput>): CostResult {
  const input = clampInput(raw);
  const days = daysOf(input.months);
  const posts = postsIn(input);
  const linkPosts = Math.round((posts * input.linkShare) / 100);
  const mediaPosts = Math.round((posts * input.mediaShare) / 100);
  const mediaItems = mediaPosts * input.mediaPerPost;
  const line = (id: LineId, count: number, unit: number, basis: Basis): CostLine => ({ id, count, unit, total: count * unit, basis });
  const lines: CostLine[] = [
    line('plain', posts - linkPosts, PRICE.post, 'listed'),
    line('link', linkPosts, PRICE.postWithUrl, 'listed'),
    input.mediaBilled ? line('media', mediaItems, PRICE.mediaMetadata, 'assumed') : line('media', mediaItems, 0, 'unlisted'),
    line('delete', input.deletes * input.months, PRICE.postDelete, 'assumed'),
    line('check', input.checksPerDay * days, PRICE.userRead, 'listed'),
    line('read', input.reads * input.months, PRICE.postRead, 'listed'),
  ];
  const total = lines.reduce((s, l) => s + l.total, 0);
  const postCost = lines[0].total + lines[1].total;
  const linkExtra = linkPosts * (PRICE.postWithUrl - PRICE.post);
  return {
    input,
    days,
    posts,
    linkPosts,
    mediaPosts,
    mediaItems,
    lines,
    total,
    perMonth: Math.round(total / input.months),
    perDay: Math.round(total / days),
    perPost: posts > 0 ? Math.round(postCost / posts) : null,
    linkExtra,
    withoutLinks: total - linkExtra,
    linkShareOfCost: total > 0 ? Math.round((lines[1].total * 100) / total) : 0,
    limitDollars: Math.ceil((total * 12) / (input.months * 10000)),
  };
}

/** The same activity over other lengths of time: months and their total in mills. */
export const compare = (input: Partial<CostInput>, months: readonly number[] = [1, 3, 6, 12]) => months.map((m) => ({ months: m, total: estimate({ ...input, months: m }).total }));

/** How many days a balance in dollars lasts at this pace; null when nothing is spent. */
export function coverDays(balanceDollars: number, r: CostResult): number | null {
  if (r.total <= 0 || !(balanceDollars > 0)) return r.total <= 0 ? null : 0;
  return Math.floor((balanceDollars * 1000 * r.days) / r.total);
}

/** Mills as dollars: cents from a dollar up (half a cent rounds up, worked out in whole numbers, never in floats), thousandths below it, since a post costs 1.5 cents. */
export function usd(mills: number): string {
  const m = Math.round(mills);
  const sign = m < 0 ? '-' : '';
  const a = Math.abs(m);
  if (a < 1000) return `${sign}$0.${String(a).padStart(3, '0')}`;
  const cents = Math.round(a / 10);
  return `${sign}$${Math.floor(cents / 100).toLocaleString('en-US')}.${String(cents % 100).padStart(2, '0')}`;
}

export const LINE_AR: Record<LineId, string> = {
  plain: 'منشورات بلا رابط',
  link: 'منشورات فيها رابط',
  media: 'رفع الصور والمقاطع',
  delete: 'حذف منشورات',
  check: 'فحص الاتصال بالحساب',
  read: 'قراءة أرقام المنشورات',
};

export const BASIS_AR: Record<Basis, string> = { listed: 'سعر معلن', assumed: 'تقدير', unlisted: 'غير مسعّر' };

/** What the account can do through the API and what each costs, as X's pages say (read 2026-11-26). English names are isolated by the page. */
export type CanRow = { what: string; cost: string; basis: Basis | 'none'; note: string };
export const X_CAN: CanRow[] = [
  { what: 'منشور نصي', cost: '$0.015', basis: 'listed', note: '«Post: Create». حتى 280 حرفاً، إلا إن كان الحساب مشتركاً في X Premium.' },
  { what: 'منشور فيه رابط', cost: '$0.200', basis: 'listed', note: '«Post: Create (with URL)». لا تُعرّف X في صفحاتها ما يجعل المنشور «with URL»: احتُسب كل منشور في نصه رابط، والرد كذلك على الأرجح.' },
  { what: 'صور مع المنشور', cost: 'بلا سعر معلن', basis: 'unlisted', note: 'حتى 4 صور في المنشور، من نوع JPG أو PNG أو GIF أو WEBP، ولا تزيد الصورة على 5 ميغابايت. لا سطر لرفعها في صفحة الأسعار، وأقرب سطر «Media Metadata» بسعر $0.005 للطلب.' },
  { what: 'فيديو', cost: 'بلا سعر معلن', basis: 'unlisted', note: 'فيديو واحد في المنشور، حتى 20 دقيقة و8 غيغابايت (125 دقيقة و16 غيغابايت للمشتركين في Premium). لا سعر لرفعه.' },
  { what: 'صورة متحركة GIF', cost: 'بلا سعر معلن', basis: 'unlisted', note: 'واحدة في المنشور، حتى 15 ميغابايت، ولا تجتمع مع صور في المنشور نفسه.' },
  { what: 'رد على منشور', cost: '$0.015', basis: 'assumed', note: 'لا سطر للردود في الصفحة: غالباً «Post: Create»، ويصير $0.200 إن كان في الرد رابط.' },
  { what: 'اقتباس منشور (Quote)', cost: 'غير متاح', basis: 'none', note: 'تقول X إن «quote_tweet_id» لا يعمل إلا في خطة Enterprise، ولا يعمل في الدفع بحسب الاستعمال.' },
  { what: 'حذف منشور', cost: '$0.010', basis: 'assumed', note: '«Interaction: Delete» بسعر $0.010، أو «Content: Manage» بسعر $0.005. لا تقول X أيهما يخص الحذف، فاحتُسب الأعلى.' },
  { what: 'رسالة مباشرة', cost: '$0.015', basis: 'listed', note: '«DM Interaction: Create». والقراءة «DM Event: Read» بسعر $0.010 للرسالة.' },
  { what: 'قراءة الحساب (فحص الاتصال)', cost: '$0.010', basis: 'listed', note: '«User: Read». هذا ما يطلبه الموقع حين يفحص أن الربط سليم، ولا يفحص حساباً مرتين في نصف ساعة.' },
  { what: 'قراءة منشورات', cost: '$0.005', basis: 'listed', note: '«Posts: Read» لكل منشور. وبيانات حسابك أنت تُحاسَب «Owned Reads» بسعر $0.001 لكل منشور، إن كان الحساب مالك التطبيق.' },
  { what: 'حد النشر', cost: 'حدّ لا سعر', basis: 'none', note: '100 منشور كل 15 دقيقة لكل مستخدم، و10,000 في اليوم للتطبيق كله. حدود المعدّل شيء، والفوترة شيء آخر.' },
];

/** What X's pages do not say, and the way to settle it: said under the figures, never left out. */
export const X_UNKNOWN: string[] = [
  'تقول صفحة الأسعار «Post: Create (with URL)» بلا تعريف. احتُسب كل منشور في نصه رابط بهذا السعر، وهذا أحوط من العكس.',
  'لا سطر في الأسعار لرفع صورة أو مقطع. الحاسبة لا تحسب له شيئاً إلا إن اخترت «الرقم الأحوط»، فتضيف $0.005 لكل صورة أو مقطع.',
  'لا تقول X أي سطر يخص حذف المنشور. احتُسب الأعلى ($0.010).',
  'الأسعار تتغير، وتكتب X ذلك في صفحتها. اقرأها من وحدة المطوّرين قبل أن تشحن رصيداً.',
  'بعد أول نشر حقيقي افتح «Usage» في وحدة المطوّرين وقارن ما خُصم بما تقوله هذه الحاسبة: الفرق يحسم الأسئلة أعلاه.',
];

/** The incentives on X's free-credits page (read 2026-11-26; the page says they are still rolling out). */
export const X_FREE_CREDITS =
  'تعرض X رصيداً مجانياً لمرة واحدة: $20 بعد أول شراء رصيد ببطاقة مؤهلة، ورصيداً مجانياً مساوياً لأول شحن تلقائي حتى $50. الرصيد المجاني ينتهي بعد 3 أشهر من منحه ويُنفَق قبل رصيدك المدفوع. تقول الصفحة إن العرض ما زال يُطرح، فتحقق منه عند الشراء.';

// Push notices: what a payload may hold (Mobile_Apps_Plan.md 5.4, decisions M-4 and M-5;
// MVP_draft.md 64.3). The database builds each item at claim time (push_claim); these rules check
// it again before anything leaves for Firebase, so a mistake on either side cannot put a message's
// text, an address with a query string or a token in the wrong place. Pure: no network, no secret.

export type Tier = 'decide' | 'attention';
export type PushKind = 'notice' | 'chat' | 'mail';

/** One claimed row, as push_claim returns it. The keys are held equal to the SQL by tests/push.test.mjs. */
export type Claimed = {
  id: string;
  token: string;
  kind: PushKind;
  tier: Tier;
  notice: string | null;
  title: string;
  body: string;
  go: string;
  tag: string;
};
export const CLAIM_KEYS = ['body', 'go', 'id', 'kind', 'notice', 'tag', 'tier', 'title', 'token'] as const;

export type ChannelId = 'decide' | 'attention' | 'messages';
/**
 * The Android channels the application creates and chooses (A5 app). The payload never names a
 * channel: it carries the kind and the tier, and the application's own messaging service picks the
 * channel (appChannel), shows the notice and handles the tap. The names are what Android shows in
 * the application's notification settings.
 */
export const CHANNELS: Record<ChannelId, { id: ChannelId; name: string; sound: boolean; importance: 'high' | 'default' | 'low' }> = {
  decide: { id: 'decide', name: 'يحتاج قرارك', sound: true, importance: 'high' },
  attention: { id: 'attention', name: 'للانتباه', sound: false, importance: 'low' },
  messages: { id: 'messages', name: 'الرسائل', sound: true, importance: 'default' },
};
/** The application's choice: messaging and mail in «الرسائل» whatever their tier, a notice by its tier. */
export const appChannel = (kind: PushKind, tier: Tier): ChannelId => (kind === 'notice' ? tier : 'messages');

/** A notice is titled by its tier, a message by where it was written. */
export const TIER_TITLES: Record<Tier, string> = { decide: 'يحتاج قرارك', attention: 'يحتاج انتباهك' };
export const KIND_TITLES: Record<'chat' | 'mail', string> = { chat: 'المراسلة', mail: 'البريد' };
/** What a device that hides the text shows instead. */
export const HIDDEN_NOTICE = 'لديك إشعار جديد في المركز.';
export const NEW_MESSAGE = 'رسالة جديدة';
export const NEW_MESSAGE_FROM = 'رسالة جديدة من ';
export const BODY_MAX = 240;
export const NAME_MAX = 80;
/** One day: a decision or a message older than that is no longer worth a sound. */
export const TTL = '86400s';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_RE = new RegExp(`^${UUID}$`);
/** A destination inside the site: /n/<kind>/<uuid>, nothing else, no query string, no fragment. */
export const GO_RE = new RegExp(`^/n/(notice|chat|mail)/${UUID}$`);
const TAG_RE = new RegExp(`^(notice|chat|mail):${UUID}:(decide|attention)$`);
/** The shape of an FCM registration token, as device_register accepts it. */
export const TOKEN_RE = /^[A-Za-z0-9_:-]{20,4096}$/;

const oneLine = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Messaging and mail say who wrote, never what: «رسالة جديدة من …», or «رسالة جديدة». */
export function messageLine(body: string): string {
  const b = oneLine(body);
  if (b === NEW_MESSAGE) return NEW_MESSAGE;
  if (b.startsWith(NEW_MESSAGE_FROM)) {
    const who = b.slice(NEW_MESSAGE_FROM.length).trim();
    // A name only: anything that looks like an address or a link is dropped.
    if (who && who.length <= NAME_MAX && !/[@/:?#]/.test(who)) return NEW_MESSAGE_FROM + who;
  }
  return NEW_MESSAGE;
}

/** A notice's own words, on one line and short; links are never part of them. */
export function noticeLine(body: string): string {
  const b = oneLine(body);
  if (!b || /https?:\/\/|www\./i.test(b)) return HIDDEN_NOTICE;
  return clip(b, BODY_MAX);
}

/** The keys of a message's data, all strings: what the application's messaging service reads. */
export const DATA_KEYS = ['body', 'go', 'id', 'kind', 'tag', 'tier', 'title', 'v'] as const;
export type FcmData = Record<(typeof DATA_KEYS)[number], string>;

/**
 * A data-only message (asked for by the application's build, A5 app, 2026-10-27): no `notification` block, so Firebase
 * never shows the notice or starts the application itself. The application's own messaging service
 * shows it, picks its channel (appChannel) and handles the tap, which another application cannot
 * forge. Priority and lifetime still travel in `android`.
 */
export type FcmMessage = {
  token: string;
  data: FcmData;
  android: { priority: 'HIGH' | 'NORMAL'; ttl: string };
};

/**
 * The FCM HTTP v1 message for one claimed row, or null when the row breaks a rule (it is then
 * reported as BAD_PAYLOAD and never sent).
 */
export function buildMessage(c: Claimed): FcmMessage | null {
  if (!c || typeof c !== 'object') return null;
  if (!UUID_RE.test(String(c.id))) return null;
  if (typeof c.token !== 'string' || !TOKEN_RE.test(c.token)) return null;
  if (c.kind !== 'notice' && c.kind !== 'chat' && c.kind !== 'mail') return null;
  if (c.tier !== 'decide' && c.tier !== 'attention') return null;
  if (typeof c.go !== 'string' || !GO_RE.test(c.go) || !c.go.startsWith(`/n/${c.kind}/`)) return null;
  if (typeof c.tag !== 'string' || !TAG_RE.test(c.tag) || !c.tag.startsWith(`${c.kind}:`) || !c.tag.endsWith(`:${c.tier}`)) return null;
  const notice = c.kind === 'notice' ? c.notice : null;
  if (c.kind === 'notice' && (typeof notice !== 'string' || !UUID_RE.test(notice) || c.go !== `/n/notice/${notice}`)) return null;
  const title = c.kind === 'notice' ? TIER_TITLES[c.tier] : KIND_TITLES[c.kind];
  const body = c.kind === 'notice' ? noticeLine(String(c.body ?? '')) : messageLine(String(c.body ?? ''));
  return {
    token: c.token,
    data: { v: '1', kind: c.kind, id: notice ?? '', tier: c.tier, go: c.go, tag: c.tag, title, body },
    android: { priority: c.tier === 'decide' ? 'HIGH' : 'NORMAL', ttl: TTL },
  };
}

/** The codes push_report understands. Anything else from a provider becomes one of these. */
export type ReportCode = 'TOKEN_GONE' | 'RETRY' | 'REFUSED' | 'AUTH' | 'BAD_PAYLOAD' | 'FAILED';
export type Report = { id: string; ok: true } | { id: string; ok: false; error: ReportCode };

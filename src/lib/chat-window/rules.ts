// The mail and messaging window (MVP_draft.md section 74): its sizes, the launcher's place,
// what each size shows, how the message box reads @ and /, and where a message goes.
// Pure; held by tests/chat-window.test.mjs. The database decides every rule about people
// (supabase/migrations/*chat_window*); this only arranges the window.

/** The side size, the middle stop and the narrowest the window goes, in CSS pixels. */
export const SIDE_W = 380;
export const MID_W = 720;
export const MIN_W = 340;
/** Below this viewport width the window fills the screen and is not resized. */
export const PHONE_W = 700;
/** The launcher: its size, its distance from the left edge, and the gap kept from the bottom. */
export const LAUNCHER = { size: 56, x: 16, gap: 16 };
/** A dragged width this close to a stop lands on it. */
export const MAGNET = 16;

export type Tier = 'side' | 'middle' | 'full' | 'page';
export type SizeName = 'side' | 'middle' | 'full';
const ORDER: Tier[] = ['side', 'middle', 'full', 'page'];

/** Does this tier show what `min` shows? The mail page shows everything. */
export const atLeast = (tier: Tier, min: Tier) => ORDER.indexOf(tier) >= ORDER.indexOf(min);

/** What a window of this width shows: one column, two, or three. */
export const tierOf = (width: number): Tier => (width < 600 ? 'side' : width < 1000 ? 'middle' : 'full');

/** The widest the window may be: up to the sidebar, never over it. */
export const maxWidth = (viewport: number, sidebar: number) => Math.max(MIN_W, Math.round(viewport - sidebar));

/** Is the middle stop offered? Only when there is room for it beside the full size. */
export const hasMiddle = (max: number) => max >= MID_W + 40;

/** The width shown, from what is remembered: the full size follows the sidebar as it opens and closes. */
export function shownWidth(saved: { w: number; full: boolean }, max: number) {
  if (saved.full) return max;
  return Math.min(Math.max(Math.round(saved.w) || SIDE_W, MIN_W), max);
}

/** The name of the size the window is at, which decides its buttons. */
export function sizeName(width: number, max: number): SizeName {
  if (width >= max - 2) return 'full';
  return width < 600 ? 'side' : 'middle';
}

/** Where a drag of the window's edge lands: clamped, pulled onto a stop, or the full size. */
export function snapWidth(raw: number, max: number): { w: number; full: boolean } {
  let w = Math.min(Math.max(Math.round(raw), MIN_W), max);
  if (w >= max - MAGNET) return { w: max, full: true };
  for (const stop of [SIDE_W, ...(hasMiddle(max) ? [MID_W] : [])]) if (Math.abs(w - stop) < MAGNET) w = stop;
  return { w, full: false };
}

/** A step of the keyboard on the edge: wider or narrower by 40, Home to the side size, End to full. */
export function keyWidth(key: string, width: number, max: number): { w: number; full: boolean } | null {
  if (key === 'ArrowRight') return snapWidth(width + 40, max);
  if (key === 'ArrowLeft') return snapWidth(width - 40, max);
  if (key === 'Home') return { w: Math.min(SIDE_W, max), full: false };
  if (key === 'End') return { w: max, full: true };
  return null;
}

export type SizeButton = 'side' | 'middle' | 'full';
/**
 * The size buttons beside «تصغير» and «فتح صفحة البريد», by the owner's brief: the side size offers
 * the middle stop and the full size, the middle stop offers the side and full sizes, the full size
 * offers the side size.
 */
export function sizeButtons(name: SizeName, max: number): SizeButton[] {
  if (name === 'side') return hasMiddle(max) ? ['middle', 'full'] : ['full'];
  if (name === 'middle') return ['side', 'full'];
  return ['side'];
}

/** The width each button sets. */
export const buttonWidth = (b: SizeButton, max: number) => (b === 'side' ? { w: SIDE_W, full: false } : b === 'middle' ? { w: MID_W, full: false } : { w: max, full: true });

/**
 * The launcher moves up and down along the left edge only (owner's note of 2026-11-05). `y` is its
 * distance from the bottom; it stays between the bottom gap (above a phone's bottom bar) and the
 * top bar. Null is the default place, at the bottom.
 */
export function launcherY(y: number | null, viewport: number, top: number, bottom: number) {
  const lo = bottom + LAUNCHER.gap;
  const hi = Math.max(lo, viewport - top - LAUNCHER.size - LAUNCHER.gap);
  return Math.min(Math.max(y ?? lo, lo), hi);
}

/** A launcher dropped this close to its default place returns to it. */
export const backHome = (y: number, home: number) => Math.abs(y - home) < 48;

export type Trigger = { kind: 'addr' | 'cmd' | 'men'; q: string };
/**
 * What the text before the caret asks for. @ as the first word picks where the message goes;
 * / as the first word is a quick action; @ later in the text mentions a member of the
 * destination, which a direct conversation has no use for.
 */
export function boxTrigger(before: string, canMention: boolean): Trigger | null {
  let m = before.match(/^@(\S*)$/);
  if (m) return { kind: 'addr', q: m[1] };
  m = before.match(/^\/(\S*)$/);
  if (m) return { kind: 'cmd', q: m[1] };
  m = before.match(/\s@([^\s@]*)$/);
  if (m && canMention) return { kind: 'men', q: m[1] };
  return null;
}

/** The text once a destination is picked: the @word that picked it is removed. */
export const dropAddress = (text: string) => text.replace(/^@\S*\s?/, '');
/** The text once a quick action is picked. */
export const dropCommand = (text: string) => text.replace(/^\/\S*\s?/, '');

/**
 * Where a message goes.
 * room: a conversation the person is in; person: someone with no direct conversation yet;
 * all: «العام», created with its first message; work: a work's own conversation, created with its
 * first message; mail: a new mail; reply: a reply in the open thread.
 */
export type Dest =
  | { k: 'room'; id: string }
  | { k: 'person'; email: string }
  | { k: 'all' }
  | { k: 'work'; id: string; title: string }
  | { k: 'mail' }
  | { k: 'reply'; thread: string };

/** With nothing chosen: the open conversation, else «العام»; in mail, the open thread, else a new mail. */
export function defaultDest(mode: 'chat' | 'mail', room: string | null, thread: string | null, globalRoom: string | null): Dest {
  if (mode === 'mail') return thread ? { k: 'reply', thread } : { k: 'mail' };
  if (room) return { k: 'room', id: room };
  return globalRoom ? { k: 'room', id: globalRoom } : { k: 'all' };
}

export function sameDest(a: Dest, b: Dest) {
  if (a.k !== b.k) return false;
  if (a.k === 'room' && b.k === 'room') return a.id === b.id;
  if (a.k === 'person' && b.k === 'person') return a.email === b.email;
  if (a.k === 'work' && b.k === 'work') return a.id === b.id;
  if (a.k === 'reply' && b.k === 'reply') return a.thread === b.thread;
  return true;
}

/** Does this message need «العام»'s one confirmation? Once in a session, for the first message there. */
export const needsGlobalConfirm = (isGlobal: boolean, confirmed: boolean) => isGlobal && !confirmed;

/** Does every word of the query appear in one of the texts? Arabic and Latin, case ignored for Latin. */
export function matches(q: string, ...texts: (string | null | undefined)[]) {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = texts.filter(Boolean).join(' ').toLowerCase();
  return words.every((w) => hay.includes(w));
}

const count = (n: number, one: string, two: string, few: string, many: string) =>
  n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? `${n} ${few}` : `${n} ${many}`;
/** «عضو واحد», «عضوان», «5 أعضاء», «24 عضواً». */
export const membersAr = (n: number) => count(n, 'عضو واحد', 'عضوان', 'أعضاء', 'عضواً');
/** «مستلم واحد», «مستلمان», «4 مستلمين», «12 مستلماً». */
export const recipientsAr = (n: number) => (n === 0 ? 'أضف المستلمين' : count(n, 'مستلم واحد', 'مستلمان', 'مستلمين', 'مستلماً'));

/** The words of each size, for the reading shown while the edge is dragged. */
export const SIZE_AR: Record<SizeName, string> = { side: 'جانبية', middle: 'وسطى', full: 'كاملة' };
export const ADDS_AR: Record<Exclude<Tier, 'page'>, string> = {
  side: 'محادثة واحدة في كل مرة',
  middle: 'القائمة بجانب المحادثة، والبحث داخلها، وفرز البريد',
  full: 'لوحة الأعضاء والملفات، ومجلدات البريد ووسومه',
};
/** What a larger size adds, said under the list. */
export const NEXT_AR: Record<'chat' | 'mail', Record<Exclude<Tier, 'page'>, string>> = {
  chat: {
    side: 'وسّع النافذة لترى القائمة بجانب المحادثة.',
    middle: 'في الحجم الكامل: لوحة الأعضاء والملفات بجانب المحادثة.',
    full: 'في صفحة البريد: الحضور وربط واتساب وإعدادات المراسلة.',
  },
  mail: {
    side: 'وسّع النافذة لترى الفرز والمجلدات بجانب الرسالة.',
    middle: 'في الحجم الكامل: المجلدات والوسوم.',
    full: 'في صفحة البريد: القواعد وإيقاف الصادر والتحديد المتعدد.',
  },
};

/** Pages where the launcher stays away: the mail page has everything, and the studio's editor needs the whole screen. */
export function launcherHidden(path: string) {
  return path === '/mail' || path.startsWith('/mail/') || path.startsWith('/motion/studio');
}

/** The work a page is about, for «محادثة هذا العمل»: /work/CH-241 gives CH-241. */
export function workOfPath(path: string): string | null {
  const m = path.match(/^\/work\/(CH-\d{1,6})(?:\/|$)/);
  return m ? m[1] : null;
}

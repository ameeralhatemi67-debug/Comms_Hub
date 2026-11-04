// What the page may ask of the application through the bridge (Desktop_App_Plan.md 5.2, version 1,
// phase D2), checked in the main process before anything is done. Nothing the page sends is trusted:
// a reason is one of a fixed list, a notice is short plain text whose link is a path on the page's own
// allowed address, a count is a small whole number. No request carries a file path, a command or an
// address of another site. From D12 an activity is a word of a fixed list, and the media queue names sources
// as `media` does (a token or a library version) with a small width. Pure.
import { TOKEN } from './files.ts';
import { isAllowed } from './origins.ts';

/** Why the page keeps the laptop awake or the window busy. */
export const REASONS = Object.freeze(['export', 'upload'] as const);
export type Reason = (typeof REASONS)[number];

export function reasonOf(value: unknown): Reason | null {
  return typeof value === 'string' && (REASONS as readonly string[]).includes(value) ? (value as Reason) : null;
}

/** A hold's number, as the main process gave it. */
export function holdIdOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** The taskbar count: a whole number from 0 to 9999. */
export function badgeOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 9999 ? value : null;
}

export const NOTICE_LIMITS = Object.freeze({ title: 120, body: 400, go: 500 });

export type NoticeRequest = { title: string; body: string; go: string | null };

// Control characters would let a notice lay itself out as something else.
const plain = (text: string) => text.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * A native notice the page asked for, or null. `title` is required; `body` may be empty; `go` is an
 * optional path ("/work/CH-101") on the asking page's own address, which must be on the list. A notice
 * whose link is refused is refused whole, so a bad link never becomes a notice that opens nothing.
 */
export function noticeOf(value: unknown, pageUrl: string, allowed: readonly string[]): NoticeRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { title, body, go } = value as { title?: unknown; body?: unknown; go?: unknown };
  if (typeof title !== 'string' || (body !== undefined && typeof body !== 'string')) return null;
  const t = plain(title);
  const b = plain(body ?? '');
  if (!t || t.length > NOTICE_LIMITS.title || b.length > NOTICE_LIMITS.body) return null;
  if (go === undefined || go === null) return { title: t, body: b, go: null };
  const path = pathOn(go, pageUrl, allowed);
  return path === null ? null : { title: t, body: b, go: path };
}

/** A path on the page's own address, or null when it is anything else. */
export function pathOn(value: unknown, pageUrl: string, allowed: readonly string[]): string | null {
  if (typeof value !== 'string' || value.length > NOTICE_LIMITS.go) return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  if (!isAllowed(pageUrl, allowed)) return null;
  let url: URL;
  try {
    const base = new URL(pageUrl);
    url = new URL(value, base.origin);
    if (url.origin !== base.origin) return null;
  } catch {
    return null;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/** What a page says it is doing, so background work waits (D12, P-30: «تشغيل», «تمرير», «قياس»); `none` ends it. */
export const ACTIVITIES = Object.freeze(['none', 'playing', 'scrubbing', 'measuring'] as const);
export type Activity = (typeof ACTIVITIES)[number];

export function activityOf(value: unknown): Activity | null {
  return typeof value === 'string' && (ACTIVITIES as readonly string[]).includes(value) ? (value as Activity) : null;
}

/** A source as the media tools name it: a device file's token, or a library version. Never a path. */
export type MediaRef = { token: string } | { asset: string; version: number };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function mediaRefOf(value: unknown): MediaRef | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const keys = Object.keys(v).sort().join(',');
  if (keys === 'token') return typeof v.token === 'string' && TOKEN.test(v.token) ? { token: v.token } : null;
  if (keys !== 'asset,version') return null;
  if (typeof v.asset !== 'string' || !UUID.test(v.asset)) return null;
  if (typeof v.version !== 'number' || !Number.isSafeInteger(v.version) || v.version < 1) return null;
  return { asset: v.asset, version: v.version };
}

/** The sources a window wants light copies of in idle time (D12, P-08), at most this many. */
export const QUEUE_LIMITS = Object.freeze({ items: 200, width: 3 });

/** `media.queue`'s request, or null: every source well named, a bounded list, a width from 1 to 3. Refused whole. */
export function queueAskOf(value: unknown): { items: MediaRef[]; width: number } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { items, width } = value as { items?: unknown; width?: unknown };
  if (!Array.isArray(items) || items.length > QUEUE_LIMITS.items) return null;
  if (typeof width !== 'number' || !Number.isInteger(width) || width < 1 || width > QUEUE_LIMITS.width) return null;
  const refs: MediaRef[] = [];
  for (const it of items) {
    const r = mediaRefOf(it);
    if (!r) return null;
    refs.push(r);
  }
  return { items: refs, width };
}

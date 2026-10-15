// When an app's secret expires (Action_Plan.md section 5). Microsoft's client secrets last at most
// 24 months and the site cannot read the date from Microsoft, so the Director states it when he
// enters the secret (`config.secret_expires_on`, a plain date). The database reminds the holders of
// the secrets right from 30 days before (integration_expiry_notes, supabase/migrations/
// *secret_expiry*); this file is the same rule for the interface. Pure: no network, no clock of its
// own except the helper that names today in Riyadh.

export const EXPIRY_WINDOW_DAYS = 30;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A date the way the database stores it, or null when it is not a real date. */
export function parseExpiry(v: unknown): string | null {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
}

const DAY = 86_400_000;

/** Whole days from `today` to `on` (negative once past). Both are YYYY-MM-DD. */
export function daysUntil(on: string, today: string): number {
  return Math.round((Date.parse(`${on}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);
}

/** Today's date in Riyadh, where the department works. */
export function riyadhToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Accepts a date entered in the form: real, no more than a year back and no more than ten ahead. */
export function expiryInputOk(v: unknown, today: string): v is string {
  const on = parseExpiry(v);
  if (!on) return false;
  const d = daysUntil(on, today);
  return d >= -366 && d <= 3660;
}

export type ExpiryState = { state: 'none' | 'ok' | 'soon' | 'expired'; days: number | null; on: string | null };

export function expiryOf(config: Record<string, unknown> | null | undefined, today: string): ExpiryState {
  const on = parseExpiry(config?.secret_expires_on);
  if (!on) return { state: 'none', days: null, on: null };
  const days = daysUntil(on, today);
  return { state: days < 0 ? 'expired' : days <= EXPIRY_WINDOW_DAYS ? 'soon' : 'ok', days, on };
}

/** One line for the app's card. Empty when no date was stated. */
export function expiryLineAr(e: ExpiryState): string {
  if (e.state === 'none' || e.days == null || !e.on) return '';
  if (e.state === 'expired') return `انتهى السر بتاريخ ${e.on}. أنشئ سراً جديداً وأدخله هنا.`;
  if (e.days === 0) return `ينتهي السر اليوم (${e.on}). أنشئ سراً جديداً وأدخله هنا.`;
  if (e.state === 'soon') return `ينتهي السر بعد ${e.days} يوماً (${e.on}). أنشئ سراً جديداً وأدخله هنا قبل ذلك.`;
  return `ينتهي السر بتاريخ ${e.on} (بعد ${e.days} يوماً).`;
}

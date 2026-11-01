// What «المنصات» says about a platform (MVP_draft.md section 67): one state worked out from what is stored,
// so nobody keeps it by hand, and the sentence and the button that go with it. Pure. The steps themselves are
// in src/lib/setup-guides.ts; only «بانتظار موافقة المنصة» rests on what a person told the site, because no
// platform tells the site where a review stands.
import { GUIDES, type GuideStep } from '../setup-guides.ts';
import { expiryLineAr, expiryOf } from '../integrations/expiry.ts';
import type { Integration } from '../integrations/rules.ts';
import type { PlatformInfo } from '../work/rules.ts';
import { PLATFORM_TEMPLATES, type PlatformTemplate } from './info.ts';
import { providerOf, type ConnProvider } from './provider.ts';

export type PlatformState = 'none' | 'steps' | 'wait' | 'ok' | 'soon' | 'issue' | 'off' | 'manual' | 'mail';

/** Saved progress of one platform's setup. Never a secret: the database refuses any other field. */
export type SetupRow = { key: string; done: string[]; step: string | null; fields: { app_id?: string; config_id?: string } };

const GUIDE_OF: Record<string, string> = { instagram: 'meta', facebook: 'facebook', tiktok: 'tiktok', youtube: 'google', linkedin: 'linkedin', x: 'x' };

/** The guide of a platform's one-time setup; null for a platform with no sign-in. */
export const setupGuideOf = (platform: string): string | null => GUIDE_OF[platform] ?? null;

export const stepId = (s: GuideStep, i: number) => s.id ?? String(i);

/** The steps that count as done: those saved, those a stored secret proves, and the secret's own step. */
export function doneSteps(steps: GuideStep[], setup: Pick<SetupRow, 'done'> | null | undefined, hasKeys: boolean): Set<string> {
  const saved = new Set(setup?.done ?? []);
  const out = new Set<string>();
  steps.forEach((s, i) => {
    const id = stepId(s, i);
    if (saved.has(id) || (hasKeys && (s.implied || s.kind === 'keys'))) out.add(id);
  });
  return out;
}

/** A review is the platform's own decision: it never holds a connection back. */
const required = (steps: GuideStep[]) => steps.filter((s) => s.kind !== 'review');

/** The first step not done, or null when none is left. */
export function firstOpen(steps: GuideStep[], done: Set<string>): string | null {
  for (let i = 0; i < steps.length; i++) if (!done.has(stepId(steps[i], i))) return stepId(steps[i], i);
  return null;
}

export type StateInput = { p: Pick<PlatformInfo, 'key' | 'kind' | 'enabled' | 'readiness'>; app?: Integration | null; setup?: SetupRow | null; today: string };

export function platformState({ p, app, setup, today }: StateInput): PlatformState {
  if (p.kind === 'mail') return 'mail';
  const key = setupGuideOf(p.key);
  if (!key) return p.enabled ? 'manual' : 'off';
  const steps = GUIDES[key].steps;
  const hasKeys = app?.has_secret === true;
  const done = doneSteps(steps, setup, hasKeys);
  const all = required(steps).every((s) => done.has(stepId(s, steps.indexOf(s))));
  const expiry = expiryOf(app?.config, today).state;
  if (hasKeys && (app?.state === 'error' || app?.state === 'needs_reconnect' || expiry === 'expired')) return 'issue';
  if (hasKeys && all && (!p.enabled || app?.state === 'disabled')) return 'off';
  if (p.readiness === 'submitted') return 'wait';
  if (hasKeys && all) return expiry === 'soon' ? 'soon' : 'ok';
  return done.size > 0 || setup ? 'steps' : 'none';
}

export const CHIP_CLASS: Record<PlatformState, string> = {
  none: 'none', steps: 'steps', wait: 'wait', ok: 'ok', soon: 'soon', issue: 'bad', off: 'off', manual: 'man', mail: 'man',
};

const CHIP_AR: Record<Exclude<PlatformState, 'steps'>, string> = {
  none: 'غير متصلة',
  wait: 'بانتظار موافقة المنصة',
  ok: 'متصلة',
  soon: 'ينتهي السر قريباً',
  issue: 'يوجد خلل',
  off: 'موقوفة',
  manual: 'نشر يدوي',
  mail: 'قناة بريد',
};

export function chipOf(state: PlatformState, done = 0, total = 0): string {
  return state === 'steps' ? `خطوات ناقصة · ${done} من ${total}` : CHIP_AR[state];
}

export const countAccounts = (n: number) => (n === 0 ? 'لا حسابات بعد' : n === 1 ? 'حساب واحد' : n === 2 ? 'حسابان' : n <= 10 ? `${n} حسابات` : `${n} حساباً`);

/** The one sentence under a platform's name. */
export function lineOf(state: PlatformState, o: { accounts: number; next?: string | null; app?: Integration | null; today: string; provider?: ConnProvider | null }): string {
  switch (state) {
    case 'ok':
      return countAccounts(o.accounts) + (o.provider === 'google' ? ' · تطبيق Google مشترك مع Drive' : '');
    case 'steps':
      return o.next ? `التالي: ${o.next}` : 'أكمل الخطوات المتبقية.';
    case 'wait':
      return 'قُدّم الطلب، ويبقى الربط محدوداً إلى أن توافق المنصة.';
    case 'soon':
      return expiryLineAr(expiryOf(o.app?.config, o.today));
    case 'issue':
      return expiryOf(o.app?.config, o.today).state === 'expired' ? expiryLineAr(expiryOf(o.app?.config, o.today)) : 'رفضت المنصة المعرّف أو السر. أدخلهما من جديد.';
    case 'off':
      return 'لا تظهر عند إضافة حساب جديد.';
    case 'manual':
      return 'لا ربط تلقائي: يُنشر من تطبيق المنصة بحزمة جاهزة.';
    case 'mail':
      return 'يُضبط صندوق القسم من «الاتصالات».';
    default:
      return 'لم يبدأ الإعداد بعد.';
  }
}

export type RowAction = { label: string; tone: 'pri' | 'fix' | '' ; to: 'first' | 'keys' | 'review' | 'enable' } | null;

/** The one button a platform's state asks for. */
export function actionOf(state: PlatformState): RowAction {
  if (state === 'none') return { label: 'بدء الإعداد', tone: 'pri', to: 'first' };
  if (state === 'steps') return { label: 'متابعة الإعداد', tone: 'pri', to: 'first' };
  if (state === 'issue') return { label: 'إصلاح', tone: 'fix', to: 'keys' };
  if (state === 'soon') return { label: 'استبدال السر', tone: '', to: 'keys' };
  if (state === 'wait') return { label: 'تحديث الحالة', tone: '', to: 'review' };
  if (state === 'off') return { label: 'تفعيل', tone: '', to: 'enable' };
  return null;
}

/** A row needs the reader when it asks for something now; what waits on a platform does not. */
export const needsYou = (state: PlatformState) => state === 'issue' || state === 'steps' || state === 'none' || state === 'soon';

const ORDER: PlatformState[] = ['issue', 'steps', 'soon', 'none', 'wait', 'ok', 'manual', 'off', 'mail'];
export const stateRank = (s: PlatformState) => ORDER.indexOf(s);

/** Is this platform shown on the page at all? One switched off and never touched waits in the menu. */
export function listed(p: Pick<PlatformInfo, 'key' | 'kind' | 'enabled'> & { readiness?: PlatformInfo['readiness'] }, o: { app?: Integration | null; setup?: SetupRow | null; accounts: number }): boolean {
  if (p.kind === 'mail' || p.enabled || o.accounts > 0 || o.setup || (p.readiness && p.readiness !== 'not_started')) return true;
  return setupGuideOf(p.key) ? o.app?.has_secret === true : true;
}

export type AddOption =
  | { kind: 'open'; key: string; label: string; hint: string }
  | { kind: 'template'; key: string; label: string; hint: string; template: PlatformTemplate; manual: boolean }
  | { kind: 'custom'; key: 'custom'; label: string; hint: string };

const stepsWord = (n: number) => (n === 2 ? 'خطوتان' : n <= 10 ? `${n} خطوات` : `${n} خطوة`);

/** «إضافة منصة»: every platform that is not on its way yet, those with steps first, then those with no sign-in. */
export function addOptions(list: Pick<PlatformInfo, 'key' | 'label_ar' | 'kind'>[], stateOf: (key: string) => PlatformState | null): AddOption[] {
  const out: AddOption[] = [];
  for (const p of list) {
    if (p.kind !== 'social') continue;
    const guide = setupGuideOf(p.key);
    if (!guide) continue;
    const state = stateOf(p.key);
    if (state === null || state === 'none') out.push({ kind: 'open', key: p.key, label: p.label_ar, hint: stepsWord(GUIDES[guide].steps.length) });
  }
  const have = new Set(list.map((p) => p.key));
  const free = PLATFORM_TEMPLATES.filter((t) => !have.has(t.key));
  for (const t of free) {
    const guide = setupGuideOf(t.key);
    if (guide) out.push({ kind: 'template', key: t.key, label: t.label_ar, hint: stepsWord(GUIDES[guide].steps.length), template: t, manual: false });
  }
  for (const t of free) {
    if (!setupGuideOf(t.key)) out.push({ kind: 'template', key: t.key, label: t.label_ar, hint: 'نشر يدوي، بلا خطوات', template: t, manual: true });
  }
  out.push({ kind: 'custom', key: 'custom', label: 'منصة أخرى…', hint: 'بالاسم، وتبدأ موقوفة' });
  return out;
}

type Info = (key: string) => Pick<PlatformInfo, 'kind' | 'enabled' | 'label_ar'> | undefined;

/** A platform's name when it may not be in the registry yet: a template's, and never its key. */
export const platformName = (key: string, info: Info) => info(key)?.label_ar ?? PLATFORM_TEMPLATES.find((t) => t.key === key)?.label_ar ?? 'منصة أخرى';

/** What a sign-in brought, split: what links now, and the platforms that must be added or switched on first (one Meta sign-in brings both Pages and Instagram). */
export function splitOffer<T extends { platform: string }>(list: T[], info: Info): { can: T[]; away: string[] } {
  const on = (key: string) => info(key)?.kind === 'social' && info(key)?.enabled === true;
  return { can: list.filter((c) => on(c.platform)), away: [...new Set(list.filter((c) => !on(c.platform)).map((c) => c.platform))] };
}

export { providerOf };

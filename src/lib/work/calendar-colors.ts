// «ألوان التقويم» (MVP_draft.md section 74, Director_Notes_Plan.md N-1, owner's answer Q1 of 2026-11-05): a
// person colours the calendar by one of five things, each value taking one of twelve preset colours. The choice is
// personal and lives in the database (`calendar_prefs`, supabase/migrations/*calendar_prefs*), so it follows the
// person to every device. Pure, covered by tests/calendar-colors.test.mjs, which also holds the palette equal to the
// classes `pal-0` to `pal-11` in src/app/work.css and these key patterns equal to the migration's.
//
// Three rules shape everything here:
//   - «نوع الموعد» with nothing chosen is today's calendar, class for class (`chipClass` with DEFAULT_PREFS).
//   - A colour changes only the fill, the text and the edge. The shape of a kind (a dashed border for what is not
//     fixed yet, a struck-through held time) stays, and so do the warnings: late, at risk, near and urgent keep
//     their marks over any colour, drawn outside the chip where no colour can hide them. A failed publish keeps
//     its red and takes no colour at all.
//   - There is no free colour: twelve pairs, each drawn for light and dark with readable text.
import { CAL_KIND, KEY_ORDER, toneOf, type CalEntry, type CalKind } from './planning.ts';
import { statusLabels, type WorkStatus } from './rules.ts';

// ---------------------------------------------------------------------------
// The modes
// ---------------------------------------------------------------------------
export type ColorMode = 'kind' | 'status' | 'project' | 'platform' | 'person';
/** «لوّن حسب», in the order of the sheet; the first is the default. */
export const COLOR_MODES: { id: ColorMode; label: string; hint: string; none: string }[] = [
  { id: 'kind', label: 'نوع الموعد', hint: 'ألوان التقويم المعتادة: لكل نوع موعد لونه.', none: '' },
  { id: 'status', label: 'حالة العمل', hint: 'لون كل عمل بحالته، لمتابعة التقدم.', none: 'ما ليس عملاً (مهمة أو حدث أو تذكير) يبقى بلون نوعه.' },
  { id: 'project', label: 'المشروع', hint: 'لون كل موعد بمشروعه.', none: 'ما ليس في مشروع يبقى بلون نوعه.' },
  { id: 'platform', label: 'المنصة', hint: 'لون كل موعد نشر بحسابه.', none: 'ما ليس نشراً على حساب يبقى بلون نوعه.' },
  { id: 'person', label: 'المسؤول', hint: 'لون كل موعد بالمسؤول عنه.', none: 'ما ليس له مسؤول يبقى بلون نوعه.' },
];
export const MODE_IDS = COLOR_MODES.map((m) => m.id);
export const modeLabel = (m: ColorMode) => COLOR_MODES.find((x) => x.id === m)!.label;

// ---------------------------------------------------------------------------
// The palette: [background, text, edge] for light and for dark. The edge draws the stripe of a row, the strip of a
// month day, a project card's top and the swatch itself. Contrast is checked by the test: text on its background at
// least 4.5:1 (they are about 7.7:1 and above), the edge against every surface at least 3:1.
// ---------------------------------------------------------------------------
export type Trio = readonly [bg: string, fg: string, edge: string];
export type Swatch = { name: string; light: Trio; dark: Trio };
export const PALETTE: readonly Swatch[] = [
  { name: 'أخضر', light: ['#dcf2e3', '#14532d', '#2f8f57'], dark: ['#173d29', '#a7e8bf', '#4fcf8a'] },
  { name: 'فيروزي', light: ['#d3efed', '#134e4a', '#1f8580'], dark: ['#113a39', '#99e3df', '#3cc4bd'] },
  { name: 'سماوي', light: ['#d9ebf9', '#0c4a6e', '#2a78b5'], dark: ['#12324a', '#a5d4f5', '#4aa6e8'] },
  { name: 'أزرق', light: ['#dfe6fb', '#1e3a8a', '#3b5fcc'], dark: ['#1b2a55', '#b9c9f7', '#7393f0'] },
  { name: 'نيلي', light: ['#e5e1fa', '#312e81', '#5a52d0'], dark: ['#272457', '#c9c5f6', '#8f89f0'] },
  { name: 'بنفسجي', light: ['#eee2f9', '#581c87', '#8743c2'], dark: ['#34204f', '#ddc4f4', '#b583ea'] },
  { name: 'وردي', light: ['#f9e1ee', '#831843', '#bf3b79'], dark: ['#4a1c33', '#f5c0da', '#e874aa'] },
  { name: 'أحمر', light: ['#fbe2df', '#7f1d1d', '#c2453a'], dark: ['#4c1d1b', '#f6bfb9', '#ee7d72'] },
  { name: 'برتقالي', light: ['#fce7d6', '#7c2d12', '#c05f22'], dark: ['#4a2716', '#f7cba9', '#ef9c5e'] },
  { name: 'ذهبي', light: ['#f8edc8', '#6b3d0f', '#a87a08'], dark: ['#43341a', '#f0d891', '#dcb64c'] },
  { name: 'زيتوني', light: ['#e9f0d0', '#3a4710', '#6f831c'], dark: ['#2f3816', '#d6e4a3', '#abc44e'] },
  { name: 'رمادي', light: ['#e6eaee', '#1f2937', '#5f6e82'], dark: ['#262d36', '#d3dae3', '#98a6ba'] },
];
export const PAL_COUNT = PALETTE.length;
/** The most value-to-colour pairs a person keeps, over all modes together (as the database's check). */
export const MAX_PAIRS = 200;

/** WCAG relative luminance of '#rrggbb'. */
export function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
/** WCAG contrast ratio of two '#rrggbb' colours, from 1 to 21. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// ---------------------------------------------------------------------------
// Values and their keys. A key names a value of one mode: 'kind:pub', 'status:IN_REVIEW', 'project:<id>',
// 'platform:<account id>', 'person:<email>'. The patterns are the database's, word for word.
// ---------------------------------------------------------------------------
export const STATUS_ORDER: WorkStatus[] = [
  'DRAFT', 'IN_PRODUCTION', 'IN_REVIEW', 'CHANGES_REQUESTED', 'REJECTED', 'APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'PARTIAL', 'FAILED',
];
export const KEY_PATTERNS = [
  '^kind:(pub|pubok|plan|move|held|done|due|stage|task|evt|rem)$',
  '^status:(DRAFT|IN_PRODUCTION|IN_REVIEW|CHANGES_REQUESTED|REJECTED|APPROVED|SCHEDULED|PUBLISHING|PUBLISHED|PARTIAL|FAILED)$',
  '^(project|platform):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
  '^person:[^@\\s]{1,64}@[^@\\s]{1,190}$',
] as const;
const KEY_RES = KEY_PATTERNS.map((p) => new RegExp(p));
export const KEY_MAX = 260;
export const validKey = (k: string) => k.length <= KEY_MAX && KEY_RES.some((r) => r.test(k));
export const keyOf = (mode: ColorMode, value: string) => `${mode}:${value}`;
export const modeOfKey = (key: string) => key.slice(0, key.indexOf(':')) as ColorMode;
/** «تغطية حدث» and «حدث» are one kind on the key and take one colour. */
const kindValue = (k: CalKind) => (k === 'event' ? 'evt' : k);

// ---------------------------------------------------------------------------
// Default colours: none for a kind (today's class), a fixed one for a status and a platform, the project band's own
// tone for a project, and a steady one from the name for a person or an unknown platform.
// ---------------------------------------------------------------------------
export const STATUS_PAL: Record<WorkStatus, number> = {
  DRAFT: 11, IN_PRODUCTION: 2, IN_REVIEW: 5, CHANGES_REQUESTED: 8, REJECTED: 6, APPROVED: 0, SCHEDULED: 1, PUBLISHING: 4, PUBLISHED: 3, PARTIAL: 9, FAILED: 7,
};
/** The palette colour nearest each of the four project tones (`t0` to `t3` in work.css). */
export const TONE_PAL = [5, 9, 0, 1] as const;
export const PLATFORM_PAL: Record<string, number> = { instagram: 6, youtube: 7, x: 11, facebook: 3, linkedin: 2, tiktok: 1, mail: 9 };
export function hashPal(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % PAL_COUNT;
}
/** What an account's platform is, so 'platform:<id>' can start from the platform's colour. */
export type PlatformOf = (accountId: string) => string | undefined;
export function defaultPal(key: string, platformOf?: PlatformOf): number | null {
  const mode = modeOfKey(key);
  const v = key.slice(mode.length + 1);
  if (mode === 'kind') return null;
  if (mode === 'status') return STATUS_PAL[v as WorkStatus] ?? null;
  if (mode === 'project') return TONE_PAL[toneOf(v)];
  if (mode === 'platform') return PLATFORM_PAL[platformOf?.(v) ?? ''] ?? hashPal(v);
  return hashPal(v);
}

// ---------------------------------------------------------------------------
// A person's choice
// ---------------------------------------------------------------------------
export type CalPrefs = { mode: ColorMode; colors: Record<string, number> };
export const DEFAULT_PREFS: CalPrefs = { mode: 'kind', colors: {} };
const isPal = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < PAL_COUNT;
/** A row from the database, or anything else, as a choice the page can use: what does not fit is dropped. */
export function cleanPrefs(raw: unknown): CalPrefs {
  const r = (raw ?? {}) as { mode?: unknown; colors?: unknown };
  const mode = MODE_IDS.includes(r.mode as ColorMode) ? (r.mode as ColorMode) : 'kind';
  const colors: Record<string, number> = {};
  if (r.colors && typeof r.colors === 'object' && !Array.isArray(r.colors))
    for (const [k, v] of Object.entries(r.colors as Record<string, unknown>)) if (validKey(k) && isPal(v) && Object.keys(colors).length < MAX_PAIRS) colors[k] = v;
  return { mode, colors };
}
/** The colour a value has now: the chosen one, else its default (null: today's class of its kind). */
export const palOf = (key: string, prefs: CalPrefs, platformOf?: PlatformOf): number | null => prefs.colors[key] ?? defaultPal(key, platformOf);
export const isChanged = (key: string, prefs: CalPrefs) => key in prefs.colors;
/**
 * Picks a colour for a value; `null` returns it to its default. A colour equal to the default is not kept, so only
 * real choices count toward the 200. `full` says the pick was refused because 200 are kept already.
 */
export function setColor(prefs: CalPrefs, key: string, pal: number | null, platformOf?: PlatformOf): { prefs: CalPrefs; full: boolean } {
  if (!validKey(key) || (pal !== null && !isPal(pal))) return { prefs, full: false };
  const colors = { ...prefs.colors };
  if (pal === null || pal === defaultPal(key, platformOf)) delete colors[key];
  else if (!(key in colors) && Object.keys(colors).length >= MAX_PAIRS) return { prefs, full: true };
  else colors[key] = pal;
  return { prefs: { ...prefs, colors }, full: false };
}
/** «إرجاع الافتراضي» for every value of one mode; the other modes keep theirs. */
export function resetMode(prefs: CalPrefs, mode: ColorMode): CalPrefs {
  return { ...prefs, colors: Object.fromEntries(Object.entries(prefs.colors).filter(([k]) => modeOfKey(k) !== mode)) };
}
export const changedIn = (prefs: CalPrefs, mode: ColorMode) => Object.keys(prefs.colors).filter((k) => modeOfKey(k) === mode).length;

// ---------------------------------------------------------------------------
// Which value an entry has in a mode
// ---------------------------------------------------------------------------
export type ColorLook = {
  /** The projects of a work, in their order. */
  projectsOf?: (workId: string) => string[];
  /** Who holds a stage of a work. */
  stageWho?: (workId: string, si: number) => string | null | undefined;
  /** The project the calendar is showing, which wins for a work in several projects. */
  project?: string;
  platformOf?: PlatformOf;
};
export function entryValue(e: CalEntry, mode: ColorMode, look: ColorLook = {}): string | null {
  if (mode === 'kind') return kindValue(e.k);
  if (mode === 'status') return e.w && e.k !== 'task' ? e.w.status : null;
  if (mode === 'platform') return e.ch ?? null;
  if (mode === 'project') {
    const ps = e.k === 'evt' ? (e.ev?.project_id ? [e.ev.project_id] : []) : e.k === 'rem' ? [] : e.k === 'task' && e.t?.project_id ? [e.t.project_id] : e.w ? (look.projectsOf?.(e.w.id) ?? []) : [];
    return look.project && look.project !== 'all' && ps.includes(look.project) ? look.project : (ps[0] ?? null);
  }
  // «المسؤول»: the holder of a stage, the one a task is given to, the person responsible for a work.
  if (e.k === 'task') return e.t?.assignee ?? null;
  if (e.k === 'stage') return (e.w && e.si != null ? look.stageWho?.(e.w.id, e.si) : null) ?? null;
  if (e.k === 'evt' || e.k === 'rem') return null;
  return e.w?.assignee ?? null;
}
export function entryKey(e: CalEntry, prefs: CalPrefs, look: ColorLook = {}): string | null {
  const v = entryValue(e, prefs.mode, look);
  return v ? keyOf(prefs.mode, v) : null;
}
/** A failed publish keeps its red. */
const failed = (e: CalEntry) => e.k === 'done' && !!e.ch && !!e.w?.results[e.ch] && !e.w.results[e.ch].ok;
/** The palette colour of an entry, or null for its kind's own colour. */
export function entryPal(e: CalEntry, prefs: CalPrefs, look: ColorLook = {}): number | null {
  if (failed(e)) return null;
  const k = entryKey(e, prefs, look);
  return k && validKey(k) ? palOf(k, prefs, look.platformOf) : null;
}

// ---------------------------------------------------------------------------
// Classes. A palette colour adds 'pal pal-N'; the warnings always follow it.
// ---------------------------------------------------------------------------
export type Mark = 'late' | 'risk' | 'near' | 'urg';
export function marksOf(e: CalEntry): Mark[] {
  const m: Mark[] = [];
  if (e.late) m.push('late');
  if (e.risk) m.push('risk');
  if (e.near) m.push('near');
  if (e.w && e.w.priority === 'urgent' && e.k !== 'done') m.push('urg');
  return m;
}
const palClass = (p: number | null) => (p === null ? '' : ` pal pal-${p}`);
/** Everything after 'wk-cchip ' on a calendar chip. With DEFAULT_PREFS it is today's string. */
export function chipClass(e: CalEntry, prefs: CalPrefs = DEFAULT_PREFS, look: ColorLook = {}): string {
  const res = e.k === 'done' && e.ch && e.w?.results[e.ch] ? (e.w.results[e.ch].ok ? ' ok' : ' bad') : '';
  return `${CAL_KIND[e.k][1]}${palClass(entryPal(e, prefs, look))}${res}${marksOf(e).map((m) => ` ${m}`).join('')}`;
}
/** A kind's label in its colour, with no marks: Home's next days, where lateness is said in words beside it. */
export function labelClass(e: CalEntry, prefs: CalPrefs = DEFAULT_PREFS, look: ColorLook = {}): string {
  return `${CAL_KIND[e.k][1]}${palClass(entryPal(e, prefs, look))}`;
}
/** Everything after 'wk-crow ' on a row of the day and list views. */
export function rowClass(e: CalEntry, prefs: CalPrefs = DEFAULT_PREFS, look: ColorLook = {}): string {
  return `${CAL_KIND[e.k][1]}${palClass(entryPal(e, prefs, look))}${e.late ? ' late' : ''}`;
}
/** An account's name in a row: its result or risk wins, else its colour in «المنصة». */
export function accountClass(ch: string, state: '' | 'ok' | 'bad' | 'risk', prefs: CalPrefs, platformOf?: PlatformOf): string {
  if (state || prefs.mode !== 'platform') return state;
  return palClass(palOf(keyOf('platform', ch), prefs, platformOf)).trim();
}
/** A project's band, strip and card: its chosen colour, else its tone as before. */
export function bandClass(projectId: string, prefs: CalPrefs = DEFAULT_PREFS): string {
  const p = prefs.colors[keyOf('project', projectId)];
  return isPal(p) ? `pal pal-${p}` : `t${toneOf(projectId)}`;
}
/** The chip of a kind on the key, in «نوع الموعد». */
export const kindClass = (k: CalKind, prefs: CalPrefs) => `${CAL_KIND[k][1]}${palClass(prefs.colors[keyOf('kind', kindValue(k))] ?? null)}`;

// ---------------------------------------------------------------------------
// The sheet's rows and the key
// ---------------------------------------------------------------------------
export type ValueRow = { key: string; label: string };
export type ValueSource = {
  projects: { id: string; name: string }[];
  accounts: { id: string; label: string }[];
  people: { email: string; name: string }[];
};
/** The values of a mode, in the order the sheet lists them. */
export function valuesOf(mode: ColorMode, src: ValueSource): ValueRow[] {
  if (mode === 'kind') return KEY_ORDER.map((k) => ({ key: keyOf('kind', k), label: CAL_KIND[k][0] }));
  if (mode === 'status') return STATUS_ORDER.map((s) => ({ key: keyOf('status', s), label: statusLabels[s] }));
  if (mode === 'project') return src.projects.map((p) => ({ key: keyOf('project', p.id), label: p.name }));
  if (mode === 'platform') return src.accounts.map((a) => ({ key: keyOf('platform', a.id), label: a.label }));
  return src.people.map((p) => ({ key: keyOf('person', p.email), label: p.name }));
}
export type KeyItem = { key: string; label: string; cls: string };
/**
 * The key under the calendar. In «نوع الموعد» it is today's key, each kind in its colour. In another mode it lists
 * the values that are on the calendar now, in the sheet's order, each in its colour.
 */
export function legendOf(prefs: CalPrefs, entries: CalEntry[], look: ColorLook, src: ValueSource): KeyItem[] {
  if (prefs.mode === 'kind') return KEY_ORDER.map((k) => ({ key: keyOf('kind', k), label: CAL_KIND[k][0], cls: kindClass(k, prefs) }));
  const on = new Set(entries.filter((e) => !failed(e)).map((e) => entryKey(e, prefs, look)).filter((k): k is string => !!k && validKey(k)));
  const rows = valuesOf(prefs.mode, src);
  const known = new Set(rows.map((r) => r.key));
  const unknown = [...on].filter((k) => !known.has(k)).map((k) => ({ key: k, label: prefs.mode === 'person' ? k.slice(7).split('@')[0] : 'غير معروف' }));
  return [...rows.filter((r) => on.has(r.key)), ...unknown].map((r) => ({ ...r, cls: `pal pal-${palOf(r.key, prefs, look.platformOf)}` }));
}

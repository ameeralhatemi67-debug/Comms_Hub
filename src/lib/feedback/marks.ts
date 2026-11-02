// Marks on a note (MVP_draft.md section 69). What a tester points at is saved as data on the note's own row: where on the
// screen, what stands there, and an outline of the screen made of rectangles with no words. No picture is ever taken, so
// nothing private on the page can reach the people who read the notes. Pure, so it can be tested; reading the page itself
// is capture.ts. The database rebuilds all of this again (feedback_clean_marks and its neighbours, *feedback_marks*).

import type { FeedbackRow } from './rules.ts';
import { KIND_AR, SEVERITY_AR, STATE_AR } from './rules.ts';

export const MAX_MARKS = 3;
export const MAX_OUTLINE = 140;
/** Up to this many pixels of movement is a click, not a drag. */
export const CLICK_SLOP = 8;
/** Errors of the visit carried by a note. */
export const MAX_NOTE_ERRORS = 3;

/** Pages whose content stays private from administrators: a mark there keeps only the word for what it is. */
export const PRIVATE_PATHS = ['/mail'];
export const isPrivatePage = (page: string) => PRIVATE_PATHS.some((p) => page === p || page.startsWith(`${p}/`));

export type Point = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };
export type View = { w: number; h: number };

/** A pointer (`p`, no size) or a box (`b`), in thousandths of the screen so it can be drawn at any size. */
export type Mark = Box & { t: 'p' | 'b'; el: string; sel: string };

export type OutlineRect = [x: number, y: number, w: number, h: number, kind: number];
export type Outline = { w: number; h: number; r: OutlineRect[] };

/** What a rectangle of the outline is. The order is the order of importance when the outline must be cut. */
export const KIND = { control: 0, field: 1, media: 2, text: 3, area: 4 } as const;
export type OutlineItem = Box & { kind: number };

export type NoteContext = {
  role?: string;
  viewAs?: string;
  build?: string;
  app?: string;
  appVersion?: string;
  w?: number;
  h?: number;
  dpr?: number;
  theme?: string;
  dialog?: string;
  errors?: string[];
};

const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));
const thousandths = (n: number, of: number) => clamp(Math.round((n / of) * 1000), 0, 1000);

/** A press at `a` released at `b`: a pointer if it barely moved, otherwise the box between them. */
export function markFrom(a: Point, b: Point, view: View): Pick<Mark, 't' | 'x' | 'y' | 'w' | 'h'> {
  const moved = Math.hypot(b.x - a.x, b.y - a.y) > CLICK_SLOP;
  if (!moved) return { t: 'p', x: thousandths(a.x, view.w), y: thousandths(a.y, view.h), w: 0, h: 0 };
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const x = thousandths(left, view.w);
  const y = thousandths(top, view.h);
  return { t: 'b', x, y, w: thousandths(left + Math.abs(b.x - a.x), view.w) - x, h: thousandths(top + Math.abs(b.y - a.y), view.h) - y };
}

/** A mark back in pixels of a screen of the given size. */
export function markBox(m: Box, view: View): Box {
  return { x: (m.x / 1000) * view.w, y: (m.y / 1000) * view.h, w: (m.w / 1000) * view.w, h: (m.h / 1000) * view.h };
}

const area = (b: Box) => b.w * b.h;
const contains = (b: Box, p: Point) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * What a mark sits on, by geometry alone: an open dialog makes the rest of the page inert, so the browser's own hit
 * test cannot answer while the marking layer is up. A pointer takes the smallest thing under it; a box takes what it
 * matches best, so a box around a button finds the button and a box around a card finds the card.
 */
export function pickTarget(items: Box[], mark: Pick<Mark, 't' | 'x' | 'y' | 'w' | 'h'>, view: View): number {
  const at = markBox(mark, view);
  let best = -1;
  let score = 0;
  items.forEach((item, i) => {
    let s: number;
    if (mark.t === 'p') s = contains(item, at) ? 1 / (1 + area(item)) : 0;
    else {
      const both = overlap(item, at);
      s = both / (area(item) + area(at) - both || 1);
    }
    if (s > score) {
      best = i;
      score = s;
    }
  });
  return best;
}

/**
 * The screen as rectangles: clipped to it, without what is too small to see, whole numbers only. When there are too
 * many, controls and fields stay and the smallest areas go. Drawn largest first, so nothing hides behind a panel.
 */
export function packOutline(items: OutlineItem[], view: View, max = MAX_OUTLINE): Outline {
  const seen = new Set<string>();
  const kept: OutlineRect[] = [];
  const clipped = items
    .map((b) => {
      const x = clamp(b.x, 0, view.w);
      const y = clamp(b.y, 0, view.h);
      return { x, y, w: clamp(b.x + b.w, 0, view.w) - x, h: clamp(b.y + b.h, 0, view.h) - y, kind: b.kind };
    })
    .filter((b) => b.w >= 6 && b.h >= 6)
    .sort((a, b) => a.kind - b.kind || area(b) - area(a));
  for (const b of clipped) {
    if (kept.length >= max) break;
    const r: OutlineRect = [Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h), b.kind];
    const key = r.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(r);
  }
  kept.sort((a, b) => b[2] * b[3] - a[2] * a[3]);
  return { w: Math.round(view.w), h: Math.round(view.h), r: kept };
}

/** What each thing is called in the notes. First match wins, so a button that is also a link reads as a button. */
export const ELEMENT_WORDS: [selector: string, word: string][] = [
  ['button,[role=button]', 'زر'],
  ['[role=tab]', 'تبويب'],
  ['a[href]', 'رابط'],
  ['select', 'قائمة'],
  ['textarea,[contenteditable=true]', 'مربع نص'],
  ['input', 'حقل'],
  ['img,svg', 'صورة'],
  ['video', 'فيديو'],
  ['canvas', 'لوحة'],
  ['table', 'جدول'],
  ['h1,h2,h3,h4', 'عنوان'],
  ['th', 'عمود'],
  ['td,tr,li', 'سطر'],
  ['label', 'تسمية'],
  ['p', 'نص'],
];

/** The name of what a mark sits on. The words are the site's own, cut short; on a private spot only the word for what it is. */
export function elementName(word: string, label: string, hidden: boolean): string {
  const said = label.replace(/\s+/g, ' ').trim().slice(0, 40);
  return said && !hidden ? `${word} «${said}»` : word;
}

export type InboxEntry = { row: FeedbackRow; merged: FeedbackRow[] };

const SEVERITY_RANK: Record<string, number> = { blocking: 0, annoying: 1, cosmetic: 2 };

/** The inbox: merged notes under the note they joined, new first, then what stops work, then the latest. */
export function groupInbox(rows: FeedbackRow[]): InboxEntry[] {
  const present = new Set(rows.map((r) => r.id));
  const under = new Map<string, FeedbackRow[]>();
  const top: FeedbackRow[] = [];
  for (const r of rows) {
    if (r.duplicate_of && present.has(r.duplicate_of)) under.set(r.duplicate_of, [...(under.get(r.duplicate_of) ?? []), r]);
    else top.push(r);
  }
  const rank = (r: FeedbackRow) => (r.severity ? SEVERITY_RANK[r.severity] : 1);
  top.sort((a, b) => Number(b.state === 'new') - Number(a.state === 'new') || rank(a) - rank(b) || Date.parse(b.last_at) - Date.parse(a.last_at));
  return top.map((row) => ({ row, merged: under.get(row.id) ?? [] }));
}

const APP_AR: Record<string, string> = { web: 'متصفح', desktop: 'تطبيق الحاسوب', android: 'تطبيق أندرويد', ios: 'تطبيق آيفون' };

/** The note's surroundings as label and value, for the inbox and the brief. `roleName` keeps role keys out of the interface. */
export function contextLines(c: NoteContext | null | undefined, roleName: (key: string) => string): [string, string][] {
  if (!c) return [];
  const out: [string, string][] = [];
  if (c.role) out.push(['الدور', roleName(c.role)]);
  if (c.viewAs) out.push(['عرض بصفة', roleName(c.viewAs)]);
  if (c.app) out.push(['الجهاز', `${APP_AR[c.app] ?? c.app}${c.appVersion ? ` ${c.appVersion}` : ''}`]);
  if (c.w && c.h) out.push(['الشاشة', `${c.w}×${c.h}${c.dpr && c.dpr !== 1 ? ` بكثافة ${c.dpr}` : ''}`]);
  if (c.theme) out.push(['المظهر', c.theme === 'dark' ? 'مسائي' : 'نهاري']);
  if (c.build) out.push(['إصدار الموقع', c.build]);
  if (c.dialog) out.push(['النافذة المفتوحة', c.dialog]);
  return out;
}

const percent = (n: number) => `${Math.round(n / 10)}%`;

/** A mark as a reader sees it beside the outline, which already shows where. */
export const markName = (m: Mark, i: number) => `${i + 1}. ${m.el || 'مكان في الصفحة'}`;

/** A mark with its position, for whoever fixes it. */
export function markLine(m: Mark, i: number): string {
  const where = m.t === 'p' ? `عند ${percent(m.x)} من العرض و${percent(m.y)} من الارتفاع` : `مربع عند ${percent(m.x)} و${percent(m.y)} بحجم ${percent(m.w)} في ${percent(m.h)}`;
  return `${markName(m, i)}، ${where}`;
}

/** The note as plain text to hand to whoever fixes it, with the files that draw its page. */
export function devBrief(row: FeedbackRow, opts: { roleName: (key: string) => string; sources: string[] }): string {
  const head = [KIND_AR[row.kind], row.severity ? SEVERITY_AR[row.severity] : '', STATE_AR[row.state]].filter(Boolean).join(' · ');
  const lines = [`[${head}] ${row.page ?? ''}`.trim(), '', row.body];
  const details = contextLines(row.context, opts.roleName);
  if (details.length) lines.push('', ...details.map(([k, v]) => `${k}: ${v}`));
  if (row.marks?.length) {
    lines.push('', 'العلامات:');
    for (const [i, m] of row.marks.entries()) lines.push(markLine(m, i) + (m.sel ? ` | ${m.sel}` : ''));
  }
  if (row.place) lines.push('', `المكان: ${row.place}`);
  if (row.context?.errors?.length) lines.push('', 'أخطاء الزيارة:', ...row.context.errors.map((e) => `- ${e}`));
  if (opts.sources.length) lines.push('', 'ملفات الصفحة:', ...opts.sources.map((s) => `- ${s}`));
  return lines.join('\n');
}

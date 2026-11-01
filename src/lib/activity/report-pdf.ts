// «تقرير الشهر» as a PDF, in two templates (MVP_draft.md 66). «الملخص التنفيذي» is one page for a glance: who came first,
// the team's numbers and the ranking. «التقرير التفصيلي» is the ledger: the full table, then what each person finished.
// Both draw on A4 from the same report, with the site's fonts (OFL), and run in the browser or in Node. pdf-lib
// shapes Arabic through fontkit when the text is plain, so body text stays selectable; Reem Kufi places its dots with
// positions pdf-lib drops, so its headings are drawn as outlines. qa/activity-exports.mjs renders both and reads them.
import { PDFDocument, rgb, type Color, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { visualPieces, type Piece } from './bidi.ts';
import { CATEGORIES, methodLines, topNames, type Category, type MonthlyReport, type ReportPerson } from './report.ts';

export type PdfTemplate = 'brief' | 'full';

export const PDF_TEMPLATES: { id: PdfTemplate; label: string; note: string }[] = [
  { id: 'brief', label: 'الملخص التنفيذي', note: 'صفحة للنظرة السريعة: الأول والأرقام والترتيب' },
  { id: 'full', label: 'التقرير التفصيلي', note: 'الجدول كاملاً، وما أنجزه كل شخص' },
];

/** The files a report is drawn with. */
export type PdfAssets = { ar: Uint8Array; arBold: Uint8Array; la: Uint8Array; laBold: Uint8Array; display: Uint8Array; logo: Uint8Array };

export const PDF_ASSET_PATHS: Record<keyof PdfAssets, string> = {
  ar: '/report/plex-arabic-400.woff',
  arBold: '/report/plex-arabic-700.woff',
  la: '/report/plex-latin-400.woff',
  laBold: '/report/plex-latin-700.woff',
  display: '/report/reem-kufi-600.woff',
  logo: '/brand/comms-hub-logo-120.png',
};

const hex = (v: string) => rgb(parseInt(v.slice(1, 3), 16) / 255, parseInt(v.slice(3, 5), 16) / 255, parseInt(v.slice(5, 7), 16) / 255);
const C = {
  deep: hex('#0b3a2d'),
  emerald: hex('#14684f'),
  gold: hex('#d9ad4f'),
  goldSoft: hex('#f8eccb'),
  goldText: hex('#84580f'),
  cream: hex('#f6e3a6'),
  ink: hex('#10241d'),
  muted: hex('#526b5e'),
  line: hex('#d6e0d7'),
  soft: hex('#f2f6ef'),
  white: rgb(1, 1, 1),
  late: hex('#a23a2e'),
};

const A4 = { w: 595.28, h: 841.89 };
const M = 40;

type Face = 'r' | 'b';
type TextOpts = { size: number; face?: Face; color?: Color; align?: 'right' | 'left' | 'center' };
// fontkit's own types are thin; only what is used here.
type Glyph = { path: { scale(x: number, y: number): { translate(x: number, y: number): { toSVG(): string } } } };
type RawFont = {
  unitsPerEm: number;
  hasGlyphForCodePoint(c: number): boolean;
  layout(text: string): { glyphs: Glyph[]; positions: { xAdvance: number; xOffset: number; yOffset: number }[] };
};

class Draw {
  page!: PDFPage;
  readonly pages: PDFPage[] = [];
  readonly doc: PDFDocument;
  readonly logo: PDFImage;
  private fonts: Record<Face, { ar: PDFFont; la: PDFFont }>;
  private raw: { ar: RawFont; display: RawFont; displayLa: RawFont };

  constructor(doc: PDFDocument, fonts: Record<Face, { ar: PDFFont; la: PDFFont }>, raw: { ar: RawFont; display: RawFont; displayLa: RawFont }, logo: PDFImage) {
    this.doc = doc;
    this.fonts = fonts;
    this.raw = raw;
    this.logo = logo;
  }

  addPage() {
    this.page = this.doc.addPage([A4.w, A4.h]);
    this.pages.push(this.page);
  }

  private pieces(text: string): Piece[] {
    return visualPieces(text, (c) => this.raw.ar.hasGlyphForCodePoint(c.codePointAt(0)!));
  }

  width(text: string, size: number, face: Face = 'r'): number {
    return this.pieces(text).reduce((w, p) => w + this.fonts[face][p.font].widthOfTextAtSize(p.text, size), 0);
  }

  /** Right-aligned by default: `x` is the line's right edge, its left edge or its centre, as `align` says. */
  text(text: string, x: number, y: number, o: TextOpts) {
    const face = o.face ?? 'r';
    const total = this.width(text, o.size, face);
    let at = o.align === 'left' ? x : o.align === 'center' ? x - total / 2 : x - total;
    for (const p of this.pieces(text)) {
      const font = this.fonts[face][p.font];
      this.page.drawText(p.text, { x: at, y, size: o.size, font, color: o.color ?? C.ink });
      at += font.widthOfTextAtSize(p.text, o.size);
    }
    return total;
  }

  /** A line cut to fit, with an ellipsis. */
  fit(text: string, max: number, size: number, face: Face = 'r'): string {
    if (this.width(text, size, face) <= max) return text;
    const chars = [...text];
    while (chars.length > 1 && this.width(`${chars.join('').trimEnd()}…`, size, face) > max) chars.pop();
    return `${chars.join('').trimEnd()}…`;
  }

  /** Words into lines of at most `max`. */
  wrap(text: string, max: number, size: number, face: Face = 'r'): string[] {
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && this.width(next, size, face) > max) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }

  private outline(font: RawFont, text: string, size: number) {
    const k = size / font.unitsPerEm;
    const run = font.layout(text);
    let x = 0;
    const parts: string[] = [];
    run.glyphs.forEach((g, i) => {
      const at = run.positions[i];
      parts.push(g.path.scale(k, -k).translate(x + at.xOffset * k, -at.yOffset * k).toSVG());
      x += at.xAdvance * k;
    });
    return { d: parts.filter(Boolean).join(' '), width: x };
  }

  /** A heading in the brand's face, drawn as outlines; `x` is its right edge. */
  display(text: string, x: number, y: number, size: number, color: Color) {
    const pieces = visualPieces(text, (c) => this.raw.display.hasGlyphForCodePoint(c.codePointAt(0)!));
    const shaped = pieces.map((p) => this.outline(p.font === 'ar' ? this.raw.display : this.raw.displayLa, p.text, size));
    const total = shaped.reduce((w, s) => w + s.width, 0);
    let at = x - total;
    for (const s of shaped) {
      if (s.d) this.page.drawSvgPath(s.d, { x: at, y, color, borderWidth: 0 });
      at += s.width;
    }
    return total;
  }

  rect(x: number, y: number, w: number, h: number, color: Color, opacity = 1) {
    this.page.drawRectangle({ x, y, width: w, height: h, color, opacity, borderWidth: 0 });
  }

  /** A rectangle with rounded corners; `y` is its bottom. */
  round(x: number, y: number, w: number, h: number, r: number, o: { fill?: Color; border?: Color; opacity?: number }) {
    const d = `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
    this.page.drawSvgPath(d, { x, y: y + h, color: o.fill, opacity: o.opacity, borderColor: o.border, borderWidth: o.border ? 0.75 : 0 });
  }

  line(x1: number, x2: number, y: number, color: Color = C.line, thickness = 0.75) {
    this.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color });
  }

  /** The logo's rosette as a line drawing: four capsules turned about a point. */
  rosette(cx: number, cy: number, size: number, color: Color, opacity: number) {
    const L = size / 2;
    const R = size * 0.15;
    const capsule = (a: number) => {
      const c = Math.cos(a);
      const s = Math.sin(a);
      const at = (x: number, y: number) => `${(x * c - y * s).toFixed(2)} ${(-(x * s + y * c)).toFixed(2)}`;
      return `M ${at(-L + R, -R)} L ${at(L - R, -R)} A ${R} ${R} 0 0 0 ${at(L - R, R)} L ${at(-L + R, R)} A ${R} ${R} 0 0 0 ${at(-L + R, -R)} Z`;
    };
    const d = [0, 45, 90, 135].map((deg) => capsule((deg * Math.PI) / 180)).join(' ');
    this.page.drawSvgPath(d, { x: cx, y: cy, borderColor: color, borderWidth: 1.4, borderOpacity: opacity });
  }
}

const stamp = (iso: string) => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Riyadh' }).slice(0, 10);
const pts = (n: number) => (n === 1 ? 'نقطة واحدة' : n === 2 ? 'نقطتان' : n >= 3 && n <= 10 ? `${n} نقاط` : `${n} نقطة`);
const percent = (v: number | null) => (v === null ? 'لا مواعيد' : `${v}%`);

// ---------------------------------------------------------------- «الملخص التنفيذي»
function brief(d: Draw, r: MonthlyReport) {
  d.addPage();
  const right = A4.w - M;
  const left = M;
  const inner = right - left;
  const bandH = 196;
  const top = A4.h;
  d.rect(0, top - bandH, A4.w, bandH, C.deep);
  // The rosette is large and quiet, and leaves the page at its corner.
  d.rosette(92, top - 72, 236, C.gold, 0.26);
  d.page.drawImage(d.logo, { x: right - 42, y: top - 78, width: 42, height: 42 });
  d.text('مركز الاتصال المؤسسي', right - 54, top - 52, { size: 10.5, color: C.cream });
  d.display('تقرير الفريق الشهري', right - 54, top - 75, 15, C.white);
  d.display(r.title, right, top - 124, 32, C.white);
  d.text(r.partial ? 'الشهر لم ينتهِ بعد: الأرقام حتى يوم الإصدار' : 'الملخص التنفيذي', right, top - 148, { size: 11, color: C.cream });

  // The first place sits on the band's edge, the one object the eye lands on.
  const cardH = 136;
  const cardY = top - bandH - cardH + 34;
  d.round(left, cardY, inner, cardH, 12, { fill: C.white, border: C.line });
  d.text('الأكثر إنتاجية هذا الشهر', right - 22, cardY + cardH - 30, { size: 11, face: 'b', color: C.goldText });
  if (r.top.length) {
    const lead = r.top[0];
    const name = d.fit(topNames(r), inner - 190, 26, 'b');
    d.display(name, right - 22, cardY + cardH - 66, 26, C.deep);
    d.text(r.top.length > 1 ? 'تعادل في المركز الأول' : lead.roleName, right - 22, cardY + cardH - 86, { size: 11, color: C.muted });
    const stats: [string, string][] = [
      ['مراحل', String(lead.counts.stages)],
      ['مهام', String(lead.counts.tasks)],
      ['في الموعد', lead.onTime === null ? 'بلا مواعيد' : `${lead.onTime}%`],
      ['أيام النشاط', String(lead.days)],
    ];
    let x = right - 22;
    for (const [label, value] of stats) {
      const w = d.text(value, x, cardY + 18, { size: 11, face: 'b' });
      const l = d.text(label, x - w - 5, cardY + 18, { size: 9.5, color: C.muted });
      x -= w + l + 22;
    }
    d.text(String(lead.points), left + 92, cardY + cardH - 74, { size: 44, face: 'b', color: C.emerald, align: 'center' });
    d.text('نقطة', left + 92, cardY + cardH - 96, { size: 11, color: C.muted, align: 'center' });
  } else {
    d.text('لا إنجاز مسجّل في هذا الشهر.', right - 22, cardY + cardH - 70, { size: 16, face: 'b', color: C.muted });
  }

  // The team's month in four numbers, on the page itself, with no boxes.
  let y = cardY - 54;
  const kpis: [string, string][] = [
    ['مراحل أُنجزت', String(r.totals.counts.stages)],
    ['مهام أُنجزت', String(r.totals.counts.tasks)],
    ['أعمال اعتُمدت', String(r.totals.counts.works)],
    ['أُنجز في موعده', r.totals.onTime === null ? '—' : `${r.totals.onTime}%`],
  ];
  const col = inner / kpis.length;
  kpis.forEach(([label, value], i) => {
    const cx = right - col * i - col / 2;
    d.text(value, cx, y, { size: 26, face: 'b', color: C.deep, align: 'center' });
    d.text(label, cx, y - 18, { size: 10, color: C.muted, align: 'center' });
    if (i) d.page.drawLine({ start: { x: right - col * i, y: y + 22 }, end: { x: right - col * i, y: y - 20 }, thickness: 0.75, color: C.line });
  });
  y -= 50;

  d.line(left, right, y);
  y -= 26;
  d.display('ترتيب الفريق', right, y, 16, C.deep);
  y -= 16;
  const rowH = 30;
  const footer = 92;
  const max = Math.max(1, ...r.ranked.map((p) => p.points));
  const nameW = 150;
  const barRight = right - 22 - nameW - 8;
  const barLeft = left + 46;
  const bar = barRight - barLeft;
  const rows = r.ranked.filter((p) => p.points > 0);
  const idle = r.ranked.length - rows.length;
  for (const p of rows) {
    if (y - rowH < footer) {
      d.addPage();
      y = A4.h - M - 8;
    }
    y -= rowH;
    const first = p.rank === 1 && p.points > 0;
    const my = y + 9;
    d.page.drawCircle({ x: right - 9, y: my + 3, size: 9, color: first ? C.gold : C.soft });
    d.text(String(p.rank ?? ''), right - 9, my - 0.5, { size: 9.5, face: 'b', color: first ? C.deep : C.muted, align: 'center' });
    d.text(d.fit(p.name, nameW, 11, 'b'), right - 26, my + 6, { size: 11, face: 'b' });
    d.text(d.fit(p.roleName, nameW, 8.5), right - 26, my - 6, { size: 8.5, color: C.muted });
    d.round(barLeft, my - 2, bar, 9, 4.5, { fill: C.soft });
    const w = Math.max(p.points ? 9 : 0, (p.points / max) * bar);
    if (w) d.round(barRight - w, my - 2, w, 9, 4.5, { fill: first ? C.gold : C.emerald });
    d.text(String(p.points), left + 36, my - 1, { size: 12, face: 'b', color: first ? C.goldText : C.deep });
  }
  if (!rows.length) {
    y -= 24;
    d.text('لا نقاط لأحد في هذا الشهر.', right, y, { size: 11, color: C.muted });
  } else if (idle > 0) {
    y -= 18;
    d.text(`و${idle === 1 ? 'شخص واحد' : `${idle} أشخاص`} بلا نقاط في هذا الشهر.`, right, y, { size: 10, color: C.muted });
  }
  const outside = r.people.filter((p) => !p.ranked && p.points > 0);
  if (outside.length) {
    y -= 22;
    d.text(`خارج الترتيب: ${outside.map((p) => `${p.name} ${pts(p.points)}`).join('، ')}`, right, y, { size: 9.5, color: C.muted });
  }
}

// ---------------------------------------------------------------- «التقرير التفصيلي»
const LEDGER: Category[] = ['stages', 'tasks', 'works', 'reviews', 'publishing', 'content'];

function full(d: Draw, r: MonthlyReport) {
  const right = A4.w - M;
  const left = M;
  const inner = right - left;
  const head = () => {
    d.addPage();
    d.page.drawImage(d.logo, { x: right - 20, y: A4.h - 52, width: 20, height: 20 });
    d.text('تقرير الفريق الشهري', right - 28, A4.h - 41, { size: 9.5, face: 'b', color: C.deep });
    d.text(r.title, right - 28, A4.h - 52, { size: 8.5, color: C.muted });
    d.text('للاطلاع الداخلي', left, A4.h - 46, { size: 8.5, color: C.muted, align: 'left' });
    d.line(left, right, A4.h - 60, C.deep, 1);
    return A4.h - 84;
  };
  const room = (y: number, need: number) => (y - need < 56 ? head() : y);

  let y = head();
  d.display('التقرير التفصيلي', right, y - 12, 25, C.deep);
  y -= 34;
  d.text(r.partial ? `${r.title}. الشهر لم ينتهِ بعد: الأرقام حتى يوم الإصدار.` : r.title, right, y, { size: 12, color: C.emerald });
  y -= 22;
  const t = r.totals;
  const summary = `أنجز الفريق ${t.counts.stages} من المراحل و${t.counts.tasks} من المهام، واعتُمد ${t.counts.works} من الأعمال، وأُنجز ${t.onTime === null ? 'ما له موعد' : `${t.onTime}% مما له موعد`} ${t.onTime === null ? 'دون مواعيد مسجلة' : 'في وقته'}.${r.top.length ? ` الأكثر إنتاجية: ${topNames(r)}.` : ''}`;
  for (const line of d.wrap(summary, inner, 11)) {
    d.text(line, right, y, { size: 11 });
    y -= 17;
  }
  y -= 10;

  // The table, read from the right: who, how much, then of what.
  const cRank = 26;
  const cName = 148;
  const cPoints = 42;
  const cOn = 46;
  const cCat = (inner - cRank - cName - cPoints - cOn) / LEDGER.length;
  const tableHead = (top: number) => {
    d.round(left, top - 24, inner, 24, 5, { fill: C.deep });
    const yy = top - 16;
    let x = right;
    d.text('#', x - cRank / 2, yy, { size: 9, face: 'b', color: C.white, align: 'center' });
    x -= cRank;
    d.text('الاسم', x - 4, yy, { size: 9, face: 'b', color: C.white });
    x -= cName;
    d.text('النقاط', x - cPoints / 2, yy, { size: 9, face: 'b', color: C.cream, align: 'center' });
    x -= cPoints;
    for (const c of LEDGER) {
      d.text(CATEGORIES.find((k) => k.id === c)!.short, x - cCat / 2, yy, { size: 8.5, face: 'b', color: C.white, align: 'center' });
      x -= cCat;
    }
    d.text('في الموعد', x - cOn / 2, yy, { size: 8.5, face: 'b', color: C.white, align: 'center' });
    return top - 24;
  };
  y = tableHead(y);
  const rowH = 30;
  r.people.forEach((p, i) => {
    if (y - rowH < 56) y = tableHead(head());
    y -= rowH;
    if (p.rank === 1 && p.points > 0) d.rect(left, y, inner, rowH, C.goldSoft);
    else if (i % 2) d.rect(left, y, inner, rowH, C.soft);
    const yy = y + 11;
    let x = right;
    d.text(p.rank ? String(p.rank) : '–', x - cRank / 2, yy, { size: 10, face: 'b', color: C.muted, align: 'center' });
    x -= cRank;
    d.text(d.fit(p.name, cName - 8, 10.5, 'b'), x - 4, y + 17, { size: 10.5, face: 'b' });
    d.text(d.fit(p.roleName, cName - 8, 8), x - 4, y + 6, { size: 8, color: C.muted });
    x -= cName;
    d.text(String(p.points), x - cPoints / 2, yy, { size: 11, face: 'b', color: C.deep, align: 'center' });
    x -= cPoints;
    for (const c of LEDGER) {
      d.text(String(p.counts[c]), x - cCat / 2, yy, { size: 10, color: p.counts[c] ? C.ink : C.line, align: 'center' });
      x -= cCat;
    }
    d.text(p.onTime === null ? '–' : `${p.onTime}%`, x - cOn / 2, yy, { size: 10, align: 'center' });
    d.line(left, right, y);
  });
  y -= 30;

  // Each person, with what they finished.
  const worked = r.people.filter((p) => p.points > 0 || p.days > 0);
  const quiet = r.people.filter((p) => !worked.includes(p) && !p.removed);
  const MAX_ITEMS = 14;
  for (const p of worked) {
    const shown = p.items.slice(0, MAX_ITEMS);
    y = room(y, 74 + Math.min(3, shown.length) * 17);
    y = person(d, p, y, right, left);
    for (const it of shown) {
      y = room(y, 17);
      const mark = it.onTime === null ? '' : it.onTime ? 'في الموعد' : 'متأخرة';
      d.text(stamp(it.at).slice(5), right, y, { size: 8.5, color: C.muted });
      const label = it.work ? `${it.name} · ${it.work}` : it.name;
      d.text(d.fit(label, inner - 98, 9.5), right - 34, y, { size: 9.5 });
      if (mark) d.text(mark, left, y, { size: 8.5, color: it.onTime ? C.emerald : C.late, align: 'left' });
      y -= 16;
    }
    if (p.items.length > MAX_ITEMS) {
      y = room(y, 16);
      d.text(`و${p.items.length - MAX_ITEMS} غيرها في ملف Excel.`, right - 34, y, { size: 9, color: C.muted });
      y -= 16;
    }
    if (!p.items.length) {
      d.text('لا مراحل ولا مهام أُنجزت؛ نشاطه في الأعداد أعلاه.', right, y, { size: 9.5, color: C.muted });
      y -= 16;
    }
    y -= 16;
  }
  if (quiet.length) {
    y = room(y, 34);
    d.text('بلا نشاط مسجّل في هذا الشهر', right, y, { size: 10.5, face: 'b', color: C.muted });
    y -= 15;
    for (const line of d.wrap(quiet.map((p) => p.name).join('، '), inner, 9.5)) {
      y = room(y, 14);
      d.text(line, right, y, { size: 9.5, color: C.muted });
      y -= 14;
    }
    y -= 12;
  }

  const lines = methodLines().flatMap((l) => d.wrap(l, inner, 9.5));
  y = room(y, 40 + lines.length * 14);
  d.display('كيف تُحسب النقاط', right, y - 4, 14, C.deep);
  y -= 24;
  for (const line of lines) {
    d.text(line, right, y, { size: 9.5, color: C.muted });
    y -= 14;
  }
}

function person(d: Draw, p: ReportPerson, y: number, right: number, left: number): number {
  d.line(left, right, y + 13);
  const w = d.text(p.name, right, y - 4, { size: 13, face: 'b', color: C.deep });
  d.text(p.roleName, right - w - 8, y - 4, { size: 9.5, color: C.muted });
  d.text(pts(p.points), left, y - 4, { size: 11, face: 'b', color: C.emerald, align: 'left' });
  y -= 19;
  const bits = CATEGORIES.filter((c) => p.counts[c.id] > 0).map((c) => `${c.short} ${p.counts[c.id]}`);
  bits.push(`في الموعد ${percent(p.onTime)}`, `أيام النشاط ${p.days}`);
  if (p.lateOpen) bits.push(`مهام متأخرة ${p.lateOpen}`);
  d.text(bits.join('   ·   '), right, y, { size: 9, color: C.muted });
  return y - 18;
}

/** The PDF of a report in one of the two templates. */
export async function reportPdf(r: MonthlyReport, template: PdfTemplate, assets: PdfAssets): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`تقرير الفريق: ${r.title}`);
  doc.setSubject(PDF_TEMPLATES.find((t) => t.id === template)!.label);
  doc.setCreator('مركز الاتصال المؤسسي');
  doc.setProducer('مركز الاتصال المؤسسي');
  doc.setLanguage('ar');
  const embed = (bytes: Uint8Array) => doc.embedFont(bytes, { subset: true });
  const [ar, arBold, la, laBold, logo] = await Promise.all([embed(assets.ar), embed(assets.arBold), embed(assets.la), embed(assets.laBold), doc.embedPng(assets.logo)]);
  const d = new Draw(doc, { r: { ar, la }, b: { ar: arBold, la: laBold } }, {
    ar: fontkit.create(assets.ar) as unknown as RawFont,
    display: fontkit.create(assets.display) as unknown as RawFont,
    displayLa: fontkit.create(assets.laBold) as unknown as RawFont,
  }, logo);
  if (template === 'brief') brief(d, r);
  else full(d, r);

  // Footers come last, when the number of pages is known.
  const made = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Riyadh' }).slice(0, 10);
  const note = template === 'brief' ? 'المرحلة والمهمة 3 نقاط ونقطة للموعد، والعمل المعتمد 4، والمراجعة والنشر 2، والنص والملف 1. يقيس التقرير ما سُجّل من إنجاز لا جودته.' : null;
  d.pages.forEach((page, i) => {
    d.page = page;
    if (note && i === d.pages.length - 1) d.text(note, A4.w - M, 54, { size: 8, color: C.muted });
    d.line(M, A4.w - M, 44);
    d.text(`صفحة ${i + 1} من ${d.pages.length}`, A4.w - M, 30, { size: 8.5, color: C.muted });
    d.text(`صدر في ${made}`, M, 30, { size: 8.5, color: C.muted, align: 'left' });
  });
  return doc.save();
}

// «تقرير الشهر» as an Excel file (MVP_draft.md 66): three right-to-left sheets, the summary, what each person did and
// how it is counted. An .xlsx is a zip of a few XML files, and this report needs only a small part of the format, so it
// is written here directly rather than bringing in a library of a megabyte; the zip's entries are stored, not
// compressed, which every reader takes. qa/activity-exports.cjs opens the result in Excel itself. Pure, tested.
import { CATEGORIES, methodLines, topNames, type MonthlyReport } from './report.ts';

const encoder = new TextEncoder();
const stamp = (iso: string) => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Riyadh' }).slice(0, 10);

// ---------------------------------------------------------------- zip
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A zip of stored entries. */
export function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  // A fixed date: the same report makes the same file.
  const TIME = 0;
  const DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const f of files) {
    const name = encoder.encode(f.name);
    const crc = crc32(f.data);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true);
    head.setUint16(4, 20, true);
    head.setUint16(6, 0x0800, true);
    head.setUint16(8, 0, true);
    head.setUint16(10, TIME, true);
    head.setUint16(12, DATE, true);
    head.setUint32(14, crc, true);
    head.setUint32(18, f.data.length, true);
    head.setUint32(22, f.data.length, true);
    head.setUint16(26, name.length, true);
    head.setUint16(28, 0, true);
    const local = new Uint8Array(head.buffer);
    chunks.push(local, name, f.data);
    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint16(8, 0x0800, true);
    dir.setUint16(10, 0, true);
    dir.setUint16(12, TIME, true);
    dir.setUint16(14, DATE, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, f.data.length, true);
    dir.setUint32(24, f.data.length, true);
    dir.setUint16(28, name.length, true);
    dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), name);
    offset += local.length + name.length + f.data.length;
  }
  const size = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of all) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

// ---------------------------------------------------------------- sheets
const xml = (v: string) =>
  v
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** The styles of styles.xml below, by name. */
const S = { base: 0, title: 1, subtitle: 2, head: 3, text: 4, num: 5, strong: 6, percent: 7, note: 8, top: 9, zebraText: 10, zebraNum: 11, zebraStrong: 12, zebraPercent: 13, date: 14, zebraDate: 15 };

type Cell = string | number | null | { v: string | number | null; s: number };
type Row = { cells: Cell[]; height?: number };

const column = (i: number) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

function cellXml(cell: Cell, ref: string): string {
  const c = cell !== null && typeof cell === 'object' ? cell : { v: cell, s: S.base };
  const style = c.s ? ` s="${c.s}"` : '';
  if (c.v === null || c.v === '') return `<c r="${ref}"${style}/>`;
  if (typeof c.v === 'number') return `<c r="${ref}"${style}><v>${c.v}</v></c>`;
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xml(c.v)}</t></is></c>`;
}

function sheetXml(o: { rows: Row[]; widths: number[]; merges?: string[]; freeze?: number; filter?: string; bar?: string }): string {
  const rows = o.rows
    .map((r, i) => `<row r="${i + 1}"${r.height ? ` ht="${r.height}" customHeight="1"` : ''}>${r.cells.map((c, j) => cellXml(c, `${column(j)}${i + 1}`)).join('')}</row>`)
    .join('');
  const pane = o.freeze ? `<pane ySplit="${o.freeze}" topLeftCell="A${o.freeze + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${o.freeze + 1}" sqref="A${o.freeze + 1}"/>` : '';
  const last = `${column(Math.max(0, ...o.rows.map((r) => r.cells.length)) - 1 || 0)}${Math.max(1, o.rows.length)}`;
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    `<dimension ref="A1:${last}"/>` +
    `<sheetViews><sheetView rightToLeft="1" showGridLines="0" workbookViewId="0">${pane}</sheetView></sheetViews>` +
    '<sheetFormatPr defaultRowHeight="18"/>' +
    `<cols>${o.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` +
    `<sheetData>${rows}</sheetData>` +
    (o.filter ? `<autoFilter ref="${o.filter}"/>` : '') +
    (o.merges?.length ? `<mergeCells count="${o.merges.length}">${o.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '') +
    (o.bar
      ? `<conditionalFormatting sqref="${o.bar}"><cfRule type="dataBar" priority="1"><dataBar><cfvo type="num" val="0"/><cfvo type="max"/><color rgb="FFE8C46C"/></dataBar></cfRule></conditionalFormatting>`
      : '') +
    '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>' +
    '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>' +
    '</worksheet>'
  );
}

const FONT = 'Segoe UI';
const INK = 'FF10241D';
const STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="1"><numFmt numFmtId="164" formatCode="0&quot;%&quot;"/></numFmts>' +
  '<fonts count="7">' +
  `<font><sz val="11"/><color rgb="${INK}"/><name val="${FONT}"/></font>` +
  `<font><b/><sz val="18"/><color rgb="FF0B3A2D"/><name val="${FONT}"/></font>` +
  `<font><sz val="11"/><color rgb="FF526B5E"/><name val="${FONT}"/></font>` +
  `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="${FONT}"/></font>` +
  `<font><b/><sz val="11"/><color rgb="${INK}"/><name val="${FONT}"/></font>` +
  `<font><sz val="10"/><color rgb="FF526B5E"/><name val="${FONT}"/></font>` +
  `<font><b/><sz val="12"/><color rgb="FF84580F"/><name val="${FONT}"/></font>` +
  '</fonts>' +
  '<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FF0B3A2D"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFF2F6EF"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFF8ECCB"/><bgColor indexed="64"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left/><right/><top/><bottom style="thin"><color rgb="FFD6E0D7"/></bottom><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="16">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1" readingOrder="2"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
  '<xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
  '<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="6" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1" readingOrder="2"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
  '<xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
  '<xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

function summarySheet(r: MonthlyReport): string {
  const heads = ['الترتيب', 'الاسم', 'الدور', 'النقاط', ...CATEGORIES.map((c) => c.short), 'في الموعد', 'مهام متأخرة', 'أيام النشاط'];
  const rows: Row[] = [
    { cells: [{ v: `تقرير الفريق: ${r.title}`, s: S.title }], height: 32 },
    { cells: [{ v: r.partial ? 'الشهر لم ينتهِ بعد: الأرقام حتى يوم إصدار التقرير.' : 'مركز الاتصال المؤسسي', s: S.subtitle }] },
    { cells: [{ v: r.top.length ? `الأكثر إنتاجية: ${topNames(r)} (${r.top[0].points} نقطة)` : 'لا إنجاز مسجّل في هذا الشهر.', s: S.top }], height: 26 },
    { cells: [] },
    { cells: heads.map((h) => ({ v: h, s: S.head })), height: 34 },
  ];
  r.people.forEach((p, i) => {
    const z = i % 2 === 1;
    const text = z ? S.zebraText : S.text;
    const num = z ? S.zebraNum : S.num;
    rows.push({
      cells: [
        { v: p.ranked ? p.rank ?? '–' : 'خارج الترتيب', s: num },
        { v: p.name, s: text },
        { v: p.roleName, s: text },
        { v: p.points, s: z ? S.zebraStrong : S.strong },
        ...CATEGORIES.map((c) => ({ v: p.counts[c.id], s: num })),
        { v: p.onTime, s: z ? S.zebraPercent : S.percent },
        { v: p.lateOpen, s: num },
        { v: p.days, s: num },
      ],
      height: 22,
    });
  });
  const lastCol = column(heads.length - 1);
  const lastRow = 5 + r.people.length;
  return sheetXml({
    rows,
    widths: [11, 24, 30, 9, ...CATEGORIES.map(() => 9), 11, 11, 11],
    merges: [`A1:${lastCol}1`, `A2:${lastCol}2`, `A3:${lastCol}3`],
    freeze: 5,
    filter: r.people.length ? `A5:${lastCol}${lastRow}` : undefined,
    bar: r.people.length ? `D6:D${lastRow}` : undefined,
  });
}

function detailSheet(r: MonthlyReport): string {
  const rows: Row[] = [
    { cells: [{ v: `ما أنجزه كل شخص: ${r.title}`, s: S.title }], height: 32 },
    { cells: [] },
    { cells: ['الشخص', 'النوع', 'ما أُنجز', 'العمل', 'التاريخ', 'في الموعد'].map((v) => ({ v, s: S.head })), height: 26 },
  ];
  let i = 0;
  for (const p of r.people) {
    for (const it of p.items) {
      const z = i++ % 2 === 1;
      const text = z ? S.zebraText : S.text;
      rows.push({
        cells: [
          { v: p.name, s: text },
          { v: it.kind === 'stage' ? 'مرحلة' : 'مهمة', s: z ? S.zebraNum : S.num },
          { v: it.name, s: text },
          { v: it.work, s: text },
          { v: stamp(it.at), s: z ? S.zebraDate : S.date },
          { v: it.onTime === null ? 'بلا موعد' : it.onTime ? 'نعم' : 'متأخرة', s: z ? S.zebraNum : S.num },
        ],
      });
    }
  }
  if (!i) rows.push({ cells: [{ v: 'لا مراحل ولا مهام أُنجزت في هذا الشهر.', s: S.note }] });
  return sheetXml({ rows, widths: [24, 9, 38, 38, 13, 11], merges: ['A1:F1'], freeze: 3, filter: i ? `A3:F${3 + i}` : undefined });
}

function methodSheet(): string {
  const lines = methodLines();
  return sheetXml({
    rows: [{ cells: [{ v: 'كيف تُحسب النقاط', s: S.title }], height: 32 }, { cells: [] }, ...lines.map((v) => ({ cells: [{ v, s: S.base }], height: 22 }))],
    widths: [110],
  });
}

const SHEETS = ['الملخص', 'ما أنجزه كل شخص', 'كيف تُحسب النقاط'];

/** The .xlsx file of a report. */
export function reportXlsx(r: MonthlyReport): Uint8Array {
  const file = (name: string, text: string) => ({ name, data: encoder.encode(text) });
  return zip([
    file(
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        SHEETS.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
        '</Types>',
    ),
    file(
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ),
    file(
      'xl/workbook.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews><sheets>' +
        SHEETS.map((name, i) => `<sheet name="${xml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        '</sheets></workbook>',
    ),
    file(
      'xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        SHEETS.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${SHEETS.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    file('xl/styles.xml', STYLES),
    file('xl/worksheets/sheet1.xml', summarySheet(r)),
    file('xl/worksheets/sheet2.xml', detailSheet(r)),
    file('xl/worksheets/sheet3.xml', methodSheet()),
  ]);
}

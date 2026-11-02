// A written document as a Word file (MVP_draft.md 68.4), in the browser, so its text passes through no extra server. Right to
// left is set on every paragraph, run and table. Word has no transparent fills or lines, so a transparency is flattened on
// white. Fonts are named, not embedded: a reader without one sees a substitute, and the PDF keeps the look.
import { AlignmentType, BorderStyle, Document, ExternalHyperlink, Footer, Header, HeadingLevel, ImageRun, LevelFormat, Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import type { ParagraphChild } from 'docx';
import { DOC_FONT, designOf, docText, flatten, isDark, type Doc, type DocMark, type DocNode } from './doc.ts';

const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
const PAGE_PX = 620;
const hex = (c: string) => c.replace('#', '').toUpperCase();

export type DocxImage = { data: ArrayBuffer | Uint8Array; type: 'png' | 'jpg' | 'gif' | 'bmp'; width: number; height: number };
export type DocxOptions = {
  title: string;
  /** The line at the top of every page: work number, version and whether it is a draft. */
  headerText: string;
  origin: string;
  image?: (attrs: Record<string, unknown>) => Promise<DocxImage | null>;
};

type Base = { color?: string; bold?: boolean };

function run(text: string, marks: DocMark[] | undefined, base: Base = {}, forceRtl?: boolean) {
  const has = (t: string) => marks?.some((m) => m.type === t);
  const st = marks?.find((m) => m.type === 'textStyle')?.attrs ?? {};
  const rtl = forceRtl ?? ARABIC.test(text);
  const font = String(st.fontFamily ?? DOC_FONT);
  const size = st.fontSize ? Math.round(parseInt(String(st.fontSize), 10) * 1.5) : undefined;
  const bold = has('bold') || base.bold;
  return new TextRun({
    text,
    bold,
    boldComplexScript: bold,
    italics: has('italic'),
    italicsComplexScript: has('italic'),
    underline: has('underline') ? {} : undefined,
    strike: has('strike'),
    color: st.color ? hex(String(st.color)) : base.color,
    shading: st.backgroundColor ? { type: ShadingType.CLEAR, color: 'auto', fill: hex(String(st.backgroundColor)) } : undefined,
    font: { ascii: font, hAnsi: font, cs: font, eastAsia: font },
    size,
    sizeComplexScript: size,
    rightToLeft: rtl,
  });
}

function inline(n: DocNode, o: DocxOptions, base: Base = {}): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  for (const c of n.content ?? []) {
    if (c.type === 'text') {
      const link = c.marks?.find((m) => m.type === 'link');
      const r = run(c.text ?? '', c.marks, base);
      out.push(link ? new ExternalHyperlink({ link: String(link.attrs?.href), children: [r] }) : r);
    } else if (c.type === 'hardBreak') out.push(new TextRun({ break: 1 }));
    else if (c.type === 'mediaLink') {
      const label = `${String(c.attrs?.name ?? '')} · الإصدار ${String(c.attrs?.v ?? '')}`;
      out.push(new ExternalHyperlink({ link: `${o.origin}/api/media/${String(c.attrs?.asset)}/content`, children: [run(label, [{ type: 'underline' }], { color: '14684F' })] }));
    }
  }
  return out;
}

const ALIGN = { left: AlignmentType.LEFT, right: AlignmentType.RIGHT, center: AlignmentType.CENTER, justify: AlignmentType.JUSTIFIED } as const;

function paraProps(a: Record<string, unknown> | undefined) {
  return {
    bidirectional: a?.dir !== 'ltr',
    alignment: a?.textAlign ? ALIGN[a.textAlign as keyof typeof ALIGN] : undefined,
    spacing: { after: 120, line: a?.lineHeight ? Math.round(Number(a.lineHeight) * 240) : 360 },
  };
}

const HEADINGS = [HeadingLevel.TITLE, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];

type Ctx = { lists: number; base?: Base };

async function blocks(nodes: DocNode[] | undefined, o: DocxOptions, ctx: Ctx, list?: { ref: string; level: number; instance: number }, quote?: boolean): Promise<(Paragraph | Table)[]> {
  const out: (Paragraph | Table)[] = [];
  for (const n of nodes ?? []) {
    switch (n.type) {
      case 'paragraph':
        out.push(
          new Paragraph({
            ...paraProps(n.attrs),
            children: inline(n, o, ctx.base),
            ...(list ? { numbering: { reference: list.ref, level: list.level, instance: list.instance } } : {}),
            ...(quote ? { indent: { start: 240 }, border: { right: { style: BorderStyle.SINGLE, size: 18, color: 'B8892B', space: 8 } }, shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F8F3E4' } } : {}),
          }),
        );
        break;
      case 'heading':
        out.push(new Paragraph({ ...paraProps(n.attrs), heading: HEADINGS[Number(n.attrs?.level ?? 2) - 1], children: inline(n, o, ctx.base) }));
        break;
      case 'blockquote':
        out.push(...(await blocks(n.content, o, ctx, list, true)));
        break;
      case 'bulletList':
      case 'orderedList': {
        const ref = n.type === 'bulletList' ? 'bullets' : 'numbers';
        const instance = ++ctx.lists;
        for (const li of n.content ?? []) out.push(...(await blocks(li.content, o, ctx, { ref, level: list ? Math.min(list.level + 1, 2) : 0, instance })));
        break;
      }
      case 'horizontalRule':
        out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'B6C8BB', space: 4 } } }));
        break;
      case 'image': {
        const pic = await o.image?.(n.attrs ?? {}).catch(() => null);
        if (pic) {
          const w = Math.round((PAGE_PX * Number(n.attrs?.width ?? 75)) / 100);
          out.push(
            new Paragraph({
              alignment: ALIGN[(n.attrs?.align as keyof typeof ALIGN) ?? 'center'],
              children: [new ImageRun({ type: pic.type, data: pic.data, transformation: { width: w, height: Math.round((w * pic.height) / pic.width) }, altText: { title: 'صورة', description: String(n.attrs?.alt ?? ''), name: 'صورة' } })],
            }),
          );
        } else out.push(new Paragraph({ bidirectional: true, children: [run(`[صورة: ${String(n.attrs?.alt ?? '')}]`, undefined, { color: '526B5E' })] }));
        break;
      }
      case 'table':
        out.push(await table(n, o, ctx));
        out.push(new Paragraph({ spacing: { after: 60 } }));
        break;
      default:
        out.push(...(await blocks(n.content, o, ctx, list)));
    }
  }
  return out;
}

async function table(n: DocNode, o: DocxOptions, ctx: Ctx): Promise<Table> {
  const d = designOf(n.attrs?.design);
  const lastRow = (n.content?.length ?? 1) - 1;
  const rows: TableRow[] = [];
  for (const [r, row] of (n.content ?? []).entries()) {
    const cells: TableCell[] = [];
    for (const [c, cell] of (row.content ?? []).entries()) {
      const head = cell.type === 'tableHeader';
      const a = cell.attrs ?? {};
      const designFill = head ? d.head : c === 0 && d.first ? d.first : (r % 2 === 1 ? d.band : '') || d.body;
      const fill = a.fill ? flatten(String(a.fill), Number(a.fillAlpha ?? 0)) : designFill;
      const line = a.line ? flatten(String(a.line), Number(a.lineAlpha ?? 0)) : d.line;
      const edge = (on: boolean, size = 4) => (on || a.line ? { style: BorderStyle.SINGLE, size, color: hex(line) } : { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' });
      const inner = d.lines === 'all';
      const horizontal = d.lines === 'all' || d.lines === 'rows';
      const textColor = fill ? (isDark(fill) ? 'FFFFFF' : undefined) : undefined;
      cells.push(
        new TableCell({
          columnSpan: a.colspan as number | undefined,
          rowSpan: a.rowspan as number | undefined,
          shading: fill ? { type: ShadingType.CLEAR, color: 'auto', fill: hex(fill) } : undefined,
          borders: {
            top: edge(horizontal || (d.lines === 'rule' && head), d.lines === 'rule' ? 12 : 4),
            bottom: edge(horizontal || (d.lines === 'rule' && (head || r === lastRow)), d.lines === 'rule' ? 12 : 4),
            left: edge(inner),
            right: edge(inner),
          },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: (await blocks(cell.content, o, { ...ctx, base: { color: textColor ?? (head ? hex(d.headText) : undefined), bold: head } })) as (Paragraph | Table)[],
        }),
      );
    }
    rows.push(new TableRow({ children: cells, tableHeader: r === 0 && row.content?.[0]?.type === 'tableHeader' }));
  }
  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE }, visuallyRightToLeft: true });
}

const heading = (id: string, name: string, size: number, color: string) => ({
  id,
  name,
  basedOn: 'Normal',
  next: 'Normal',
  quickFormat: true,
  run: { font: { ascii: DOC_FONT, hAnsi: DOC_FONT, cs: DOC_FONT, eastAsia: DOC_FONT }, size, sizeComplexScript: size, bold: true, boldComplexScript: true, color },
  paragraph: { spacing: { before: 240, after: 120 } },
});

/** The Word file of a document. */
export async function docToDocx(doc: Doc, o: DocxOptions): Promise<Blob> {
  const levels = (format: (typeof LevelFormat)[keyof typeof LevelFormat], text: (l: number) => string) =>
    [0, 1, 2].map((level) => ({ level, format, text: text(level), alignment: AlignmentType.START, style: { paragraph: { indent: { start: 360 * (level + 1), hanging: 260 } } } }));
  const children = await blocks(doc.content, o, { lists: 0 });
  const file = new Document({
    title: o.title,
    description: docText(doc, { images: false }).slice(0, 180),
    creator: 'مركز الاتصال المؤسسي',
    styles: {
      default: { document: { run: { font: { ascii: DOC_FONT, hAnsi: DOC_FONT, cs: DOC_FONT, eastAsia: DOC_FONT }, size: 24, sizeComplexScript: 24 } } },
      paragraphStyles: [heading('Title', 'Title', 42, '10241D'), heading('Heading1', 'Heading 1', 32, '14684F'), heading('Heading2', 'Heading 2', 27, '10241D'), heading('Heading3', 'Heading 3', 24, '3B574B')],
    },
    numbering: {
      config: [
        { reference: 'bullets', levels: levels(LevelFormat.BULLET, (l) => ['•', '◦', '▪'][l]) },
        { reference: 'numbers', levels: levels(LevelFormat.DECIMAL, (l) => `%${l + 1}.`) },
      ],
    },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1300, bottom: 1200, left: 1200, right: 1200 } } },
        headers: { default: new Header({ children: [new Paragraph({ bidirectional: true, alignment: AlignmentType.CENTER, children: [run(o.headerText, undefined, { color: '526B5E' }, true)] })] }) },
        footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], color: '526B5E', size: 18 })] })] }) },
        children: children.length ? children : [new Paragraph({})],
      },
    ],
  });
  return Packer.toBlob(file);
}

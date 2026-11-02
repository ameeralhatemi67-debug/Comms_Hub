// The written document (Writing_Build_Plan.md W-1, MVP_draft.md section 68): the shape a version has in Drive, shared by
// the save route, the editor, the read-only view and the Word export. The route checks every document here, so nothing but
// these nodes, marks and attributes is ever stored or drawn, and a read-only page never needs injected HTML. Pure.
import { FONTS } from '../studio/fonts.ts';

export type DocMark = { type: string; attrs?: Record<string, unknown> };
export type DocNode = { type: string; attrs?: Record<string, unknown>; content?: DocNode[]; marks?: DocMark[]; text?: string };
export type Doc = DocNode & { type: 'doc'; content: DocNode[] };

export const MAX_DOC_BYTES = 2_000_000;
export const MAX_DOC_CHARS = 200_000;
const MAX_NODES = 40_000;
const MAX_DEPTH = 16;

export const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40] as const;
export const DOC_FONT = 'IBM Plex Sans Arabic';
const FONT_NAMES = new Set(FONTS.map((f) => f.family));

const COLOR = /^#[0-9a-f]{6}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALIGN = new Set(['left', 'right', 'center', 'justify']);

const color = (v: unknown) => (typeof v === 'string' && COLOR.test(v) ? v.toLowerCase() : undefined);
const pct = (v: unknown, lo = 0, hi = 100) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v) : undefined);
const short = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : undefined);
const uuid = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : undefined);
const int = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : undefined);

/** A link may only go to the web or to mail. */
export function safeHref(v: unknown): string | undefined {
  if (typeof v !== 'string' || v.length > 2000) return undefined;
  return /^(https?:\/\/|mailto:)/i.test(v.trim()) ? v.trim() : undefined;
}

/** Keep the attributes that are defined; the editor fills in its own defaults. */
function pick(entries: Record<string, unknown>): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entries)) if (v !== undefined && v !== null) out[k] = v;
  return Object.keys(out).length ? out : undefined;
}

const blockAttrs = (a: Record<string, unknown>) => ({
  textAlign: typeof a.textAlign === 'string' && ALIGN.has(a.textAlign) ? a.textAlign : undefined,
  dir: a.dir === 'ltr' || a.dir === 'rtl' ? a.dir : undefined,
  lineHeight: typeof a.lineHeight === 'number' && a.lineHeight >= 1 && a.lineHeight <= 3 ? a.lineHeight : undefined,
});

const cellAttrs = (a: Record<string, unknown>) => ({
  colspan: int(a.colspan, 2, 40),
  rowspan: int(a.rowspan, 2, 400),
  colwidth: Array.isArray(a.colwidth) ? a.colwidth.filter((x) => typeof x === 'number' && x > 0 && x < 4000).map(Math.round) : undefined,
  fill: color(a.fill),
  fillAlpha: pct(a.fillAlpha),
  line: color(a.line),
  lineAlpha: pct(a.lineAlpha),
});

type Spec = { attrs?: (a: Record<string, unknown>) => Record<string, unknown>; inline?: boolean; leaf?: boolean };

const NODES: Record<string, Spec> = {
  paragraph: { attrs: blockAttrs, inline: true },
  heading: { attrs: (a) => ({ ...blockAttrs(a), level: int(a.level, 1, 4) ?? 2 }), inline: true },
  blockquote: {},
  bulletList: {},
  orderedList: { attrs: (a) => ({ start: int(a.start, 2, 9999) }) },
  listItem: {},
  horizontalRule: { leaf: true },
  table: { attrs: (a) => ({ design: typeof a.design === 'string' && a.design in TABLE_DESIGNS ? a.design : undefined }) },
  tableRow: {},
  tableCell: { attrs: cellAttrs },
  tableHeader: { attrs: cellAttrs },
  image: {
    leaf: true,
    attrs: (a) => ({
      asset: uuid(a.asset),
      v: int(a.v, 1, 100000),
      imageId: uuid(a.imageId),
      alt: short(a.alt, 200) ?? '',
      width: int(a.width, 10, 100) ?? 75,
      align: typeof a.align === 'string' && ALIGN.has(a.align) ? a.align : undefined,
    }),
  },
};

const INLINE_LEAF: Record<string, Spec> = {
  hardBreak: {},
  mediaLink: {
    attrs: (a) => ({
      asset: uuid(a.asset),
      v: int(a.v, 1, 100000),
      name: short(a.name, 200) ?? '',
      kind: typeof a.kind === 'string' && /^[a-z]{1,12}$/.test(a.kind) ? a.kind : 'other',
    }),
  },
};

function markOf(m: DocMark): DocMark | null {
  const a = m.attrs ?? {};
  switch (m.type) {
    case 'bold':
    case 'italic':
    case 'underline':
    case 'strike':
      return { type: m.type };
    case 'link': {
      const href = safeHref(a.href);
      return href ? { type: 'link', attrs: { href } } : null;
    }
    case 'textStyle': {
      const size = typeof a.fontSize === 'string' && /^\d{1,2}px$/.test(a.fontSize) && +a.fontSize.slice(0, -2) >= 8 ? a.fontSize : undefined;
      const family = typeof a.fontFamily === 'string' && FONT_NAMES.has(a.fontFamily.replace(/["']/g, '')) ? a.fontFamily.replace(/["']/g, '') : undefined;
      const attrs = pick({ color: color(a.color), backgroundColor: color(a.backgroundColor), fontFamily: family, fontSize: size });
      return attrs ? { type: 'textStyle', attrs } : null;
    }
    default:
      return null;
  }
}

class Invalid extends Error {}

/** A checked copy of a document, or the reason it is refused. Unknown attributes are dropped; an unknown node refuses it. */
export function checkDoc(input: unknown): { ok: true; doc: Doc } | { ok: false; error: string } {
  let nodes = 0;
  let chars = 0;
  const walk = (n: unknown, depth: number, inInline: boolean): DocNode => {
    if (!n || typeof n !== 'object' || Array.isArray(n)) throw new Invalid('DOC_INVALID');
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) throw new Invalid('DOC_TOO_BIG');
    const x = n as DocNode;
    if (inInline) {
      if (x.type === 'text') {
        if (typeof x.text !== 'string' || !x.text) throw new Invalid('DOC_INVALID');
        chars += x.text.length;
        if (chars > MAX_DOC_CHARS) throw new Invalid('DOC_TOO_BIG');
        const marks = (Array.isArray(x.marks) ? x.marks : []).map(markOf).filter((m): m is DocMark => !!m);
        return marks.length ? { type: 'text', text: x.text, marks } : { type: 'text', text: x.text };
      }
      const spec = INLINE_LEAF[x.type];
      if (!spec) throw new Invalid('DOC_INVALID');
      const attrs = spec.attrs ? pick(spec.attrs((x.attrs ?? {}) as Record<string, unknown>)) : undefined;
      return attrs ? { type: x.type, attrs } : { type: x.type };
    }
    const spec = NODES[x.type];
    if (!spec) throw new Invalid('DOC_INVALID');
    const attrs = spec.attrs ? pick(spec.attrs((x.attrs ?? {}) as Record<string, unknown>)) : undefined;
    const out: DocNode = { type: x.type };
    if (attrs) out.attrs = attrs;
    if (spec.leaf) return out;
    if (x.content !== undefined && !Array.isArray(x.content)) throw new Invalid('DOC_INVALID');
    if (x.content?.length) out.content = x.content.map((c) => walk(c, depth + 1, !!spec.inline));
    return out;
  };
  try {
    const d = input as DocNode;
    if (!d || typeof d !== 'object' || d.type !== 'doc' || !Array.isArray(d.content)) return { ok: false, error: 'DOC_INVALID' };
    return { ok: true, doc: { type: 'doc', content: d.content.map((c) => walk(c, 1, false)) } };
  } catch (e) {
    return { ok: false, error: e instanceof Invalid ? e.message : 'DOC_INVALID' };
  }
}

/** Inline text of a node. */
function inlineText(n: DocNode, out: string[], images: boolean) {
  for (const c of n.content ?? []) {
    if (c.type === 'text') out.push(c.text ?? '');
    else if (c.type === 'hardBreak') out.push('\n');
    else if (c.type === 'mediaLink') out.push(String(c.attrs?.name ?? ''));
    else if (c.content) inlineText(c, out, images);
    else if (c.type === 'image' && images) out.push(`[صورة: ${String(c.attrs?.alt ?? '')}]`);
  }
}

function blockLines(n: DocNode, lines: string[], images: boolean, prefix = '') {
  switch (n.type) {
    case 'paragraph':
    case 'heading': {
      const out: string[] = [];
      inlineText(n, out, images);
      lines.push(prefix + out.join(''));
      return;
    }
    case 'bulletList':
      for (const li of n.content ?? []) (li.content ?? []).forEach((c, i) => blockLines(c, lines, images, i ? '  ' : '• '));
      return;
    case 'orderedList':
      (n.content ?? []).forEach((li, k) => (li.content ?? []).forEach((c, i) => blockLines(c, lines, images, i ? '  ' : `${k + Number(n.attrs?.start ?? 1)}. `)));
      return;
    case 'table':
      for (const row of n.content ?? []) {
        lines.push(
          (row.content ?? [])
            .map((cell) => {
              const inner: string[] = [];
              for (const c of cell.content ?? []) blockLines(c, inner, images);
              return inner.join(' ');
            })
            .join(' | '),
        );
      }
      return;
    case 'image':
      if (images) lines.push(`[صورة: ${String(n.attrs?.alt ?? '')}]`);
      return;
    case 'horizontalRule':
      return;
    default:
      for (const c of n.content ?? []) blockLines(c, lines, images, prefix);
  }
}

/** The plain text of a document: the copy the database keeps (W-2), and what a platform copy starts from. */
export function docText(doc: Doc | DocNode, o: { images?: boolean } = {}): string {
  const lines: string[] = [];
  for (const c of doc.content ?? []) blockLines(c, lines, o.images !== false);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** A version saved before documents existed: its plain text as paragraphs. */
export function textToDoc(text: string): Doc {
  const content = String(text ?? '')
    .split(/\r?\n/)
    .map((l): DocNode => (l ? { type: 'paragraph', content: [{ type: 'text', text: l }] } : { type: 'paragraph' }));
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

export const emptyDoc = (): Doc => ({ type: 'doc', content: [{ type: 'paragraph' }] });
export const docIsEmpty = (d: Doc | DocNode) => !docText(d).trim();

/** Words, characters and reading time, for the line under the page. */
export function docStats(text: string) {
  const words = (text.trim().match(/\S+/g) ?? []).length;
  return { words, chars: [...text.replace(/\n/g, '')].length, minutes: words / 130 };
}

// ---------------------------------------------------------------------------
// Tables: seven designs, and fills and lines on any cells (MVP_draft.md 68.3)
// ---------------------------------------------------------------------------
export type TableLines = 'all' | 'rows' | 'rule' | 'none';
export type TableDesign = { name: string; head: string; headText: string; body: string; band: string; first: string; line: string; lines: TableLines };

export const TABLE_DESIGNS: Record<string, TableDesign> = {
  grid: { name: 'شبكة', head: '#eef3ec', headText: '#10241d', body: '', band: '', first: '', line: '#b6c8bb', lines: 'all' },
  dark: { name: 'رأس داكن', head: '#14684f', headText: '#ffffff', body: '', band: '', first: '', line: '#b6c8bb', lines: 'rows' },
  band: { name: 'صفوف متناوبة', head: '#dcefe5', headText: '#0f5a43', body: '', band: '#f2f6ef', first: '', line: '#d6e0d7', lines: 'rows' },
  rule: { name: 'خطوط أفقية', head: '', headText: '#14684f', body: '', band: '', first: '', line: '#3b574b', lines: 'rule' },
  gold: { name: 'ذهبي', head: '#f3e8c8', headText: '#7d5a14', body: '', band: '', first: '', line: '#b8892b', lines: 'rows' },
  side: { name: 'عمود أول مميز', head: '#0b3a2d', headText: '#ffffff', body: '', band: '', first: '#dcefe5', line: '#b6c8bb', lines: 'all' },
  soft: { name: 'بلا خطوط', head: '#e8eee9', headText: '#10241d', body: '#f7f9f4', band: '', first: '', line: '#d6e0d7', lines: 'none' },
};

export const designOf = (key: unknown): TableDesign => TABLE_DESIGNS[String(key)] ?? TABLE_DESIGNS.grid;

/** The CSS variables a table carries, one source for the editor and the read-only view. */
export function designVars(key: unknown): Record<string, string> {
  const d = designOf(key);
  return {
    '--t-head': d.head || 'transparent',
    '--t-headfg': d.headText,
    '--t-body': d.body || 'transparent',
    '--t-band': d.band || d.body || 'transparent',
    '--t-first': d.first || 'transparent',
    '--t-line': d.line,
  };
}

/** A colour with its transparency, in percent: 0 is solid, 100 is gone. */
export function rgba(hex: string, transparency = 0): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${Math.round((1 - transparency / 100) * 100) / 100})`;
}

/** The same colour flattened on white, for Word, which has no transparent fills or lines. */
export function flatten(hex: string, transparency = 0): string {
  const n = parseInt(hex.slice(1), 16);
  const a = 1 - transparency / 100;
  const mix = (c: number) => Math.round(c * a + 255 * (1 - a)).toString(16).padStart(2, '0');
  return `#${mix(n >> 16)}${mix((n >> 8) & 255)}${mix(n & 255)}`;
}

/** Whether a colour needs light text on it. */
export const isDark = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 < 0.5;
};

/** The inline style of a cell that carries its own fill or lines. */
export function cellStyle(a: Record<string, unknown> | undefined): Record<string, string> {
  const s: Record<string, string> = {};
  if (typeof a?.fill === 'string') {
    s.backgroundColor = rgba(a.fill, Number(a.fillAlpha ?? 0));
    if (isDark(a.fill) && Number(a.fillAlpha ?? 0) < 60) s.color = '#ffffff';
  } else if (typeof a?.fillAlpha === 'number') s.opacity = '1';
  if (typeof a?.line === 'string') {
    s.borderColor = rgba(a.line, Number(a.lineAlpha ?? 0));
    s.borderStyle = 'solid';
    s.borderWidth = '1px';
  }
  return s;
}

/** Where a picture is read from: a library file under its own permissions, or a picture kept with the work. */
export function imageSrc(work: string, a: Record<string, unknown>): string {
  if (typeof a.asset === 'string') return `/api/media/${a.asset}/content${a.v ? `?v=${a.v}` : ''}`;
  if (typeof a.imageId === 'string') return `/api/writing/${encodeURIComponent(work)}/image/${a.imageId}`;
  return '';
}

/** A style object as an inline style string, for the editor's own output. */
export const styleText = (s: Record<string, string>) =>
  Object.entries(s)
    .map(([k, v]) => `${k.startsWith('--') ? k : k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${v}`)
    .join(';');

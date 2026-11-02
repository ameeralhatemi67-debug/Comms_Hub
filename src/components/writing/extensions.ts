// The editor of «ورقة الكتابة» (MVP_draft.md 68.2): Tiptap with this document's own nodes. The schema is the cleaner: what
// is pasted from Word or a page keeps only what these nodes hold, and src/lib/writing/doc.ts checks the result again on the
// server. Loaded only when the sheet opens.
import { Extension, Node, mergeAttributes, type Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Table, TableCell, TableHeader, TableRow, TableView } from '@tiptap/extension-table';
import { TextStyleKit } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import { Placeholder } from '@tiptap/extensions';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { cellStyle, designOf, designVars, imageSrc, styleText } from '@/lib/writing/doc';

/** Direction and line spacing belong to a paragraph, not to the text in it. */
const BlockAttrs = Extension.create({
  name: 'blockAttrs',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          dir: {
            default: null,
            parseHTML: (e) => {
              const d = (e.getAttribute('dir') || e.style.direction || '').toLowerCase();
              return d === 'ltr' || d === 'rtl' ? d : null;
            },
            renderHTML: (a) => (a.dir ? { dir: a.dir } : {}),
          },
          lineHeight: {
            default: null,
            parseHTML: (e) => {
              const v = parseFloat(e.style.lineHeight);
              return Number.isFinite(v) && v >= 1 && v <= 3 ? v : null;
            },
            renderHTML: (a) => (a.lineHeight ? { style: `line-height:${a.lineHeight}` } : {}),
          },
        },
      },
    ];
  },
});

const data = (name: string, number = false) => ({
  default: null,
  parseHTML: (e: HTMLElement) => {
    const v = e.getAttribute(`data-${name}`);
    return v === null ? null : number ? Number(v) : v;
  },
  renderHTML: (a: Record<string, unknown>) => (a[name] != null ? { [`data-${name}`]: a[name] } : {}),
});

/** A cell's own fill and lines, on top of the table's design. */
const cellAttrs = () => ({
  fill: {
    ...data('fill'),
    renderHTML: (a: Record<string, unknown>) => {
      const style = styleText(cellStyle(a));
      return { ...(a.fill != null ? { 'data-fill': a.fill } : {}), ...(style ? { style } : {}) };
    },
  },
  fillAlpha: data('fillAlpha', true),
  line: data('line'),
  lineAlpha: data('lineAlpha', true),
});

const DocCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellAttrs() };
  },
});
const DocHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellAttrs() };
  },
});

function paintTable(el: HTMLElement, node: PMNode) {
  const key = node.attrs.design as string | null;
  el.setAttribute('data-design', key ?? 'grid');
  el.setAttribute('data-lines', designOf(key).lines);
  for (const [k, v] of Object.entries(designVars(key))) el.style.setProperty(k, v);
}

/** The table on the page carries its design, so a change shows at once. */
class DesignTableView extends TableView {
  constructor(node: PMNode, cellMinWidth: number, view?: EditorView, attrs?: Record<string, unknown>) {
    super(node, cellMinWidth, view, attrs);
    paintTable(this.table, node);
  }
  update(node: PMNode) {
    const ok = super.update(node);
    if (ok) paintTable(this.table, node);
    return ok;
  }
}

const DocTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      design: {
        default: null,
        parseHTML: (e) => e.getAttribute('data-design'),
        renderHTML: (a) => (a.design ? { 'data-design': a.design, 'data-lines': designOf(a.design).lines, style: styleText(designVars(a.design)) } : {}),
      },
    };
  },
}).configure({ resizable: true, View: DesignTableView, cellMinWidth: 60, lastColumnResizable: false });

/** A picture: from the library by its id and version, or from the device. The file stays where it is kept. */
const DocImage = Node.create<{ work: string }>({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
  addOptions() {
    return { work: '' };
  },
  addAttributes() {
    return {
      asset: data('asset'),
      v: data('v', true),
      imageId: data('image'),
      alt: { default: '', parseHTML: (e) => e.getAttribute('alt') ?? '', renderHTML: (a) => ({ alt: a.alt ?? '' }) },
      width: { default: 75, parseHTML: (e) => Number(e.getAttribute('data-width')) || 75, renderHTML: (a) => ({ 'data-width': a.width, style: `width:${a.width}%` }) },
      align: data('align'),
    };
  },
  parseHTML() {
    return [{ tag: 'img[data-asset]' }, { tag: 'img[data-image]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ['div', { class: 'wr-img', 'data-align': node.attrs.align ?? 'center' }, ['img', mergeAttributes(HTMLAttributes, { src: imageSrc(this.options.work, node.attrs) })]];
  },
});

/** A link to a library file, by its id: it opens under the file's own permissions. */
const MediaLink = Node.create({
  name: 'mediaLink',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return { asset: data('asset'), v: data('v', true), name: data('name'), kind: data('kind') };
  },
  parseHTML() {
    return [{ tag: 'a.wr-mlink' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ['a', mergeAttributes(HTMLAttributes, { class: 'wr-mlink', href: `/api/media/${node.attrs.asset}/content${node.attrs.v ? `?v=${node.attrs.v}` : ''}`, target: '_blank', rel: 'noopener noreferrer', 'data-kind': node.attrs.kind }), `${node.attrs.name} · الإصدار ${node.attrs.v}`];
  },
});

// ---------------------------------------------------------------------------
// Marks drawn over the text and never stored: review notes on their sentences, and search results.
// ---------------------------------------------------------------------------
export type NoteMark = { id: string; quote: string; active?: boolean };
type OverlayState = { notes: NoteMark[]; find: string; at: number; hits: { from: number; to: number }[]; set: DecorationSet };
export const overlayKey = new PluginKey<OverlayState>('writingOverlay');

/** Where a phrase occurs in the document, block by block. */
export function findText(doc: PMNode, q: string): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  if (!q) return out;
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const text = node.textBetween(0, node.content.size, undefined, '￼');
    for (let i = text.indexOf(q); i !== -1; i = text.indexOf(q, i + q.length)) out.push({ from: pos + 1 + i, to: pos + 1 + i + q.length });
    return false;
  });
  return out;
}

function decorate(doc: PMNode, s: Pick<OverlayState, 'notes' | 'find' | 'at'>) {
  const hits = findText(doc, s.find);
  const deco: Decoration[] = hits.map((h, i) => Decoration.inline(h.from, h.to, { class: i === s.at ? 'wr-hit on' : 'wr-hit' }));
  for (const n of s.notes) {
    const at = findText(doc, n.quote)[0];
    if (at) deco.push(Decoration.inline(at.from, at.to, { class: n.active ? 'wr-note on' : 'wr-note', 'data-note': n.id }));
  }
  return { hits, set: DecorationSet.create(doc, deco) };
}

const Overlay = Extension.create({
  name: 'writingOverlay',
  addProseMirrorPlugins() {
    return [
      new Plugin<OverlayState>({
        key: overlayKey,
        state: {
          init: () => ({ notes: [], find: '', at: 0, hits: [], set: DecorationSet.empty }),
          apply(tr, old, _o, state) {
            const meta = tr.getMeta(overlayKey) as Partial<OverlayState> | undefined;
            if (!meta && !tr.docChanged) return old;
            const next = { notes: meta?.notes ?? old.notes, find: meta?.find ?? old.find, at: meta?.at ?? old.at };
            return { ...next, ...decorate(state.doc, next) };
          },
        },
        props: {
          decorations: (state) => overlayKey.getState(state)?.set,
        },
      }),
    ];
  },
});

export const setOverlay = (editor: Editor, meta: Partial<Pick<OverlayState, 'notes' | 'find' | 'at'>>) => editor.view.dispatch(editor.state.tr.setMeta(overlayKey, meta));
export const overlayHits = (editor: Editor) => overlayKey.getState(editor.state)?.hits ?? [];

export function writingExtensions(work: string, placeholder: string) {
  return [
    StarterKit.configure({
      code: false,
      codeBlock: false,
      heading: { levels: [1, 2, 3, 4] },
      link: { openOnClick: false, autolink: true, protocols: ['mailto'], HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } },
    }),
    TextStyleKit.configure({ lineHeight: false }),
    TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
    BlockAttrs,
    DocTable,
    TableRow,
    DocHeader,
    DocCell,
    DocImage.configure({ work }),
    MediaLink,
    Overlay,
    Placeholder.configure({ placeholder }),
  ];
}

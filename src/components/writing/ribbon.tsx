'use client';
// The tools of «ورقة الكتابة» (MVP_draft.md 68.2): a ribbon in the manner of Word, tabs over one row of named groups. Its height
// is fixed, so the page never jumps. «الجدول» and «الصورة» appear by themselves when the caret is in a table or a picture is
// selected, and go when it leaves. Nothing here keeps the document: every button is one command on the editor.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Editor } from '@tiptap/core';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Columns3,
  Eraser,
  FileDown,
  FileText,
  FileType2,
  FileUp,
  Highlighter,
  ImagePlus,
  IndentDecrease,
  IndentIncrease,
  Library,
  Link2,
  List,
  ListOrdered,
  Maximize2,
  Merge,
  Minus,
  PaintBucket,
  PanelTop,
  Pilcrow,
  Plus,
  Redo2,
  Rows3,
  Search,
  Square,
  SquareDashed,
  Split,
  Table2,
  Trash2,
  Undo2,
} from 'lucide-react';
import { FONTS } from '@/lib/studio/fonts';
import { DOC_FONT, FONT_SIZES, TABLE_DESIGNS, type TableDesign } from '@/lib/writing/doc';
import { clearCells, insertTable, resizeTable, scopeOf, selectAll, selectCols, selectRows, setDesign, setFill, setFillAlpha, setLine, setLineAlpha, sharedLook, tableInfo, caretCell } from './table-ops';
import { Ic } from '../work/parts';

export const TEXT_COLORS = ['#10241d', '#14684f', '#7d5a14', '#a23a2e', '#17606f', '#6a4f8f', '#3f5876', '#526b5e', '#b8892b', '#1f6b45', '#c0392b', '#2b6cb0'];
export const HIGHLIGHTS = ['#f8e4a8', '#d3eedd', '#f6d8d2', '#d9e8f6', '#e6dcf4', '#eceff1'];
export const CELL_FILLS = ['#ffffff', '#f2f6ef', '#dcefe5', '#f3e8c8', '#f9e5e1', '#e0f0f2', '#eee8f6', '#e8eee9', '#14684f', '#0b3a2d', '#b8892b', '#3f5876'];
export const CELL_LINES = ['#b6c8bb', '#526b5e', '#14684f', '#0b3a2d', '#b8892b', '#a23a2e', '#17606f', '#6a4f8f', '#3f5876', '#10241d', '#d6e0d7', '#ffffff'];

const SIZE_OF_BLOCK: Record<string, number> = { h1: 28, h2: 24, h3: 20, h4: 18, p: 16 };

export type RibbonTab = 'home' | 'insert' | 'view' | 'file' | 'table' | 'image';

export type RibbonCtx = {
  locked: boolean;
  page: boolean;
  setPage: (v: boolean) => void;
  zoom: number;
  setZoom: (v: number) => void;
  focus: boolean;
  setFocus: (v: boolean) => void;
  find: () => void;
  media: () => void;
  link: () => void;
  phrases: () => void;
  exportAs: (kind: 'docx' | 'pdf' | 'txt') => void;
  importWord: () => void;
  exporting: string;
};

const hold = (e: { preventDefault: () => void }) => e.preventDefault();

function Tool({ on, label, keys, onClick, disabled, children, wide }: { on?: boolean; label: string; keys?: string; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void; disabled?: boolean; children: ReactNode; wide?: boolean }) {
  return (
    <button type="button" className={`wr-tool ${wide ? 'wide' : ''}`} aria-pressed={on === undefined ? undefined : on} aria-label={label} title={keys ? `${label} · ${keys}` : label} disabled={disabled} onMouseDown={hold} onClick={onClick}>
      {children}
    </button>
  );
}

function Group({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="wr-g" role="group" aria-label={name}>
      <div className="wr-gb">{children}</div>
      <small>{name}</small>
    </div>
  );
}

/** A small panel beside a button, on the sheet's own layer. Closes on a click outside, or Escape. */
export function Pop({ anchor, onClose, children, width = 244 }: { anchor: HTMLElement; onClose: () => void; children: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const b = anchor.getBoundingClientRect();
    const h = ref.current?.offsetHeight ?? 0;
    const rtl = getComputedStyle(anchor).direction === 'rtl';
    const left = Math.max(8, Math.min(innerWidth - width - 8, rtl ? b.right - width : b.left));
    const top = b.bottom + h + 6 > innerHeight ? Math.max(8, b.top - h - 4) : b.bottom + 4;
    setAt({ left, top });
  }, [anchor, width]);
  useEffect(() => {
    const out = (e: Event) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor.contains(t)) onClose();
    };
    const close = () => onClose();
    document.addEventListener('pointerdown', out, true);
    document.addEventListener('wr-close-pop', close);
    return () => {
      document.removeEventListener('pointerdown', out, true);
      document.removeEventListener('wr-close-pop', close);
    };
  }, [anchor, onClose]);
  return (
    <div ref={ref} className="wr-pop" role="dialog" style={{ width, left: at?.left ?? -9999, top: at?.top ?? -9999 }}>
      {children}
    </div>
  );
}

function ColorMenu({ colors, value, clear, onPick, alpha, onAlpha, alphaLabel }: { colors: string[]; value?: string | null; clear: string; onPick: (c: string | null) => void; alpha?: number; onAlpha?: (v: number) => void; alphaLabel?: string }) {
  return (
    <div className="wr-colors">
      <div className="wr-sw">
        {colors.map((c) => (
          <button type="button" key={c} aria-label={`اللون ${c}`} aria-pressed={value === c} style={{ background: c }} onMouseDown={hold} onClick={() => onPick(c)} />
        ))}
      </div>
      <div className="wr-colrow">
        <label className="wr-custom">
          لون آخر
          <input type="color" value={value && /^#/.test(value) ? value : '#14684f'} onChange={(e) => onPick(e.target.value)} />
        </label>
        <button type="button" className="wr-mini" onMouseDown={hold} onClick={() => onPick(null)}>
          {clear}
        </button>
      </div>
      {onAlpha && (
        <label className="wr-alpha">
          <span>{alphaLabel}</span>
          <input type="range" min={0} max={100} step={5} value={alpha ?? 0} onChange={(e) => onAlpha(Number(e.target.value))} />
          <output>{alpha ?? 0}%</output>
        </label>
      )}
    </div>
  );
}

function designThumb(d: TableDesign) {
  const W = 30;
  const H = 22;
  const rh = H / 3;
  const cw = W / 3;
  const line = (x1: number, y1: number, x2: number, y2: number, w = 1) => <line key={`${x1}${y1}${x2}${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={d.line} strokeWidth={w} />;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      {d.head && <rect width={W} height={rh} fill={d.head} />}
      {d.body && <rect y={rh} width={W} height={rh * 2} fill={d.body} />}
      {d.band && <rect y={rh} width={W} height={rh} fill={d.band} />}
      {d.first && <rect x={W - cw} y={rh} width={cw} height={rh * 2} fill={d.first} />}
      {(d.lines === 'all' || d.lines === 'rows') && [1, 2, 3].map((i) => line(0, rh * i, W, rh * i))}
      {d.lines === 'all' && [line(cw, 0, cw, H), line(cw * 2, 0, cw * 2, H), <rect key="b" x=".5" y=".5" width={W - 1} height={H - 1} fill="none" stroke={d.line} />]}
      {d.lines === 'rule' && [line(0, 1, W, 1, 2), line(0, rh, W, rh, 2), line(0, H - 1, W, H - 1, 2)]}
    </svg>
  );
}

const COUNT = (n: number, a: [string, string, string, string]) => (n === 1 ? a[0] : n === 2 ? a[1] : n <= 10 ? `${n} ${a[2]}` : `${n} ${a[3]}`);

/** Rows and columns: a grid to hover and click, or exact numbers. Inside a table it resizes that table. */
export function TablePicker({ editor, anchor, onClose }: { editor: Editor; anchor: HTMLElement; onClose: () => void }) {
  const t = tableInfo(editor);
  const [rows, setRows] = useState(t?.rows ?? 3);
  const [cols, setCols] = useState(t?.cols ?? 3);
  const [head, setHead] = useState(true);
  const [warn, setWarn] = useState(false);
  const clamp = (v: number, hi: number) => Math.max(1, Math.min(hi, v || 1));
  const go = (r: number, c: number) => {
    if (t) {
      if (!resizeTable(editor, t, r, c, warn)) return setWarn(true);
    } else insertTable(editor, r, c, head);
    onClose();
  };
  const pick = (r: number, c: number) => {
    setRows(r);
    setCols(c);
    setWarn(false);
  };
  return (
    <Pop anchor={anchor} onClose={onClose} width={250}>
      <b className="wr-popt">
        {COUNT(rows, ['صف واحد', 'صفان', 'صفوف', 'صفاً'])} × {COUNT(cols, ['عمود واحد', 'عمودان', 'أعمدة', 'عموداً'])}
      </b>
      <div className="wr-tgrid" onMouseLeave={() => undefined}>
        {Array.from({ length: 64 }, (_, i) => {
          const r = Math.floor(i / 8) + 1;
          const c = (i % 8) + 1;
          return <button type="button" key={i} tabIndex={-1} aria-hidden="true" className={r <= rows && c <= cols ? 'on' : ''} onMouseEnter={() => pick(r, c)} onMouseDown={hold} onClick={() => go(r, c)} />;
        })}
      </div>
      <div className="wr-tnums">
        <label>
          الصفوف
          <input type="number" min={1} max={40} value={rows} onChange={(e) => pick(clamp(Number(e.target.value), 40), cols)} />
        </label>
        <label>
          الأعمدة
          <input type="number" min={1} max={20} value={cols} onChange={(e) => pick(rows, clamp(Number(e.target.value), 20))} />
        </label>
      </div>
      {!t && (
        <label className="wr-chk">
          <input type="checkbox" checked={head} onChange={(e) => setHead(e.target.checked)} />
          الصف الأول عناوين
        </label>
      )}
      {warn && <p className="wr-warn">سيُحذف نص من الصفوف أو الأعمدة التي تُزال.</p>}
      <button type="button" className="wk-btn primary sm" onClick={() => go(rows, cols)}>
        {t ? (warn ? 'تطبيق وحذف هذا النص' : 'تطبيق على هذا الجدول') : 'إدراج الجدول'}
      </button>
    </Pop>
  );
}

function HomeTab({ editor, ctx }: { editor: Editor; ctx: RibbonCtx }) {
  const [pop, setPop] = useState<{ k: 'color' | 'mark'; el: HTMLElement } | null>(null);
  const a = editor.getAttributes('textStyle') as { color?: string; backgroundColor?: string; fontFamily?: string; fontSize?: string };
  const level = [1, 2, 3, 4].find((l) => editor.isActive('heading', { level: l }));
  const style = editor.isActive('blockquote') ? 'q' : level ? `h${level}` : 'p';
  const px = a.fontSize ? parseInt(a.fontSize, 10) : (SIZE_OF_BLOCK[style] ?? 16);
  const family = (a.fontFamily ?? DOC_FONT).replace(/["']/g, '');
  const rtl = (editor.getAttributes('paragraph').dir ?? editor.getAttributes('heading').dir) !== 'ltr';
  const aligned = (s: 'left' | 'right' | 'center' | 'justify') => editor.isActive({ textAlign: s }) || (s === (rtl ? 'right' : 'left') && !['left', 'right', 'center', 'justify'].some((v) => editor.isActive({ textAlign: v })));
  const c = () => editor.chain().focus();
  const step = (d: number) => {
    const i = FONT_SIZES.findIndex((s) => s >= px);
    const next = FONT_SIZES[Math.max(0, Math.min(FONT_SIZES.length - 1, (i < 0 ? FONT_SIZES.length - 1 : i) + d))];
    c().setFontSize(`${next}px`).run();
  };
  const setStyle = (v: string) => {
    if (v === 'p') c().setParagraph().run();
    else if (v === 'q') c().toggleBlockquote().run();
    else c().setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 | 4 }).run();
  };
  const setDir = () => {
    const dir = rtl ? 'ltr' : 'rtl';
    c().updateAttributes('paragraph', { dir }).updateAttributes('heading', { dir }).run();
  };
  return (
    <>
      <Group name="تراجع">
        <Tool label="تراجع" keys="Ctrl+Z" onClick={() => c().undo().run()} disabled={!editor.can().undo()}>
          <Ic i={Undo2} />
        </Tool>
        <Tool label="إعادة" keys="Ctrl+Y" onClick={() => c().redo().run()} disabled={!editor.can().redo()}>
          <Ic i={Redo2} />
        </Tool>
      </Group>
      <Group name="الخط">
        <select className="wr-sel style" id="wrStyle" aria-label="النمط" value={style} onChange={(e) => setStyle(e.target.value)}>
          <option value="p">نص عادي</option>
          <option value="h1">العنوان الرئيسي</option>
          <option value="h2">عنوان 1</option>
          <option value="h3">عنوان 2</option>
          <option value="h4">عنوان 3</option>
          <option value="q">اقتباس</option>
        </select>
        <select className="wr-sel font" id="wrFont" aria-label="الخط" title="الخط · Ctrl+Shift+F" value={family} onChange={(e) => c().setFontFamily(e.target.value).run()}>
          <optgroup label="عربي">
            {FONTS.filter((f) => f.script === 'ar').map((f) => (
              <option key={f.family} value={f.family} style={{ fontFamily: f.family }}>
                {f.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="English">
            {FONTS.filter((f) => f.script === 'en').map((f) => (
              <option key={f.family} value={f.family} style={{ fontFamily: f.family }}>
                {f.label}
              </option>
            ))}
          </optgroup>
        </select>
        <span className="wr-size">
          <Tool label="تصغير الخط" keys="Ctrl+Shift+," onClick={() => step(-1)}>
            <Ic i={Minus} />
          </Tool>
          <select className="wr-sel size" id="wrSize" aria-label="حجم الخط" value={FONT_SIZES.includes(px as never) ? px : ''} onChange={(e) => c().setFontSize(`${e.target.value}px`).run()}>
            {!FONT_SIZES.includes(px as never) && <option value="">{px}</option>}
            {FONT_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <Tool label="تكبير الخط" keys="Ctrl+Shift+." onClick={() => step(1)}>
            <Ic i={Plus} />
          </Tool>
        </span>
      </Group>
      <Group name="التنسيق">
        <Tool label="غامق" keys="Ctrl+B" on={editor.isActive('bold')} onClick={() => c().toggleBold().run()}>
          <b>غ</b>
        </Tool>
        <Tool label="مائل" keys="Ctrl+I" on={editor.isActive('italic')} onClick={() => c().toggleItalic().run()}>
          <i>م</i>
        </Tool>
        <Tool label="تسطير" keys="Ctrl+U" on={editor.isActive('underline')} onClick={() => c().toggleUnderline().run()}>
          <u>ت</u>
        </Tool>
        <Tool label="يتوسطه خط" keys="Ctrl+Shift+X" on={editor.isActive('strike')} onClick={() => c().toggleStrike().run()}>
          <s>خ</s>
        </Tool>
        <span className="wr-sep" />
        <Tool label="لون النص" on={!!a.color} onClick={(e) => setPop({ k: 'color', el: e.currentTarget })}>
          <span className="wr-swtool">
            <Ic i={Baseline} />
            <i style={{ background: a.color ?? 'currentColor' }} />
          </span>
        </Tool>
        <Tool label="تمييز النص" on={!!a.backgroundColor} onClick={(e) => setPop({ k: 'mark', el: e.currentTarget })}>
          <span className="wr-swtool">
            <Ic i={Highlighter} />
            <i style={{ background: a.backgroundColor ?? '#f8e4a8' }} />
          </span>
        </Tool>
        <Tool label="مسح التنسيق" onClick={() => c().unsetAllMarks().setParagraph().run()}>
          <Ic i={Eraser} />
        </Tool>
      </Group>
      <Group name="الفقرة">
        <Tool label="محاذاة لليمين" keys="Ctrl+R" on={aligned('right')} onClick={() => c().setTextAlign('right').run()}>
          <Ic i={AlignRight} />
        </Tool>
        <Tool label="توسيط" keys="Ctrl+E" on={aligned('center')} onClick={() => c().setTextAlign('center').run()}>
          <Ic i={AlignCenter} />
        </Tool>
        <Tool label="محاذاة لليسار" keys="Ctrl+L" on={aligned('left')} onClick={() => c().setTextAlign('left').run()}>
          <Ic i={AlignLeft} />
        </Tool>
        <Tool label="ضبط" keys="Ctrl+J" on={aligned('justify')} onClick={() => c().setTextAlign('justify').run()}>
          <Ic i={AlignJustify} />
        </Tool>
        <Tool label="تغيير اتجاه الفقرة" on={!rtl} onClick={setDir}>
          <Ic i={Pilcrow} />
        </Tool>
        <span className="wr-sep" />
        <Tool label="قائمة نقطية" keys="Ctrl+Shift+L" on={editor.isActive('bulletList')} onClick={() => c().toggleBulletList().run()}>
          <Ic i={List} />
        </Tool>
        <Tool label="قائمة مرقمة" keys="Ctrl+Shift+7" on={editor.isActive('orderedList')} onClick={() => c().toggleOrderedList().run()}>
          <Ic i={ListOrdered} />
        </Tool>
        <Tool label="زيادة المسافة البادئة" disabled={!editor.can().sinkListItem('listItem')} onClick={() => c().sinkListItem('listItem').run()}>
          <Ic i={IndentIncrease} />
        </Tool>
        <Tool label="إنقاص المسافة البادئة" disabled={!editor.can().liftListItem('listItem')} onClick={() => c().liftListItem('listItem').run()}>
          <Ic i={IndentDecrease} />
        </Tool>
        <select
          className="wr-sel line"
          id="wrLine"
          aria-label="تباعد الأسطر"
          title="تباعد الأسطر"
          value={String(editor.getAttributes('paragraph').lineHeight ?? editor.getAttributes('heading').lineHeight ?? '')}
          onChange={(e) => {
            const v = e.target.value ? Number(e.target.value) : null;
            c().updateAttributes('paragraph', { lineHeight: v }).updateAttributes('heading', { lineHeight: v }).run();
          }}
        >
          <option value="">تباعد</option>
          <option value="1.5">1.5</option>
          <option value="1.9">1.9</option>
          <option value="2.3">2.3</option>
        </select>
      </Group>
      {pop?.k === 'color' && (
        <Pop anchor={pop.el} onClose={() => setPop(null)}>
          <ColorMenu
            colors={TEXT_COLORS}
            value={a.color}
            clear="اللون التلقائي"
            onPick={(v) => {
              if (v) c().setColor(v).run();
              else c().unsetColor().run();
              setPop(null);
            }}
          />
        </Pop>
      )}
      {pop?.k === 'mark' && (
        <Pop anchor={pop.el} onClose={() => setPop(null)}>
          <ColorMenu
            colors={HIGHLIGHTS}
            value={a.backgroundColor}
            clear="بلا تمييز"
            onPick={(v) => {
              if (v) c().setBackgroundColor(v).run();
              else c().unsetBackgroundColor().run();
              setPop(null);
            }}
          />
        </Pop>
      )}
    </>
  );
}

function InsertTab({ editor, ctx }: { editor: Editor; ctx: RibbonCtx }) {
  const [table, setTable] = useState<HTMLElement | null>(null);
  return (
    <>
      <Group name="الوسائط">
        <button type="button" className="wr-big" onMouseDown={hold} onClick={ctx.media} title="Ctrl+Alt+I">
          <Ic i={ImagePlus} />
          صورة أو ملف
        </button>
      </Group>
      <Group name="الجداول">
        <button type="button" className="wr-big" data-cmd="table" onMouseDown={hold} onClick={(e) => setTable(e.currentTarget)}>
          <Ic i={Table2} />
          جدول
        </button>
      </Group>
      <Group name="الروابط">
        <button type="button" className="wr-big" onMouseDown={hold} onClick={ctx.link} title="Ctrl+K">
          <Ic i={Link2} />
          رابط
        </button>
      </Group>
      <Group name="النص">
        <button type="button" className="wr-big" onMouseDown={hold} onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <Ic i={Minus} />
          خط فاصل
        </button>
        <button type="button" className="wr-big" onMouseDown={hold} onClick={ctx.phrases}>
          <Ic i={Library} />
          عبارات معتمدة
        </button>
      </Group>
      {table && <TablePicker editor={editor} anchor={table} onClose={() => setTable(null)} />}
    </>
  );
}

function ViewTab({ ctx }: { ctx: RibbonCtx }) {
  return (
    <>
      <Group name="العرض">
        <button type="button" className="wr-big" aria-pressed={ctx.page} onMouseDown={hold} onClick={() => ctx.setPage(!ctx.page)}>
          <Ic i={FileText} />
          عرض الصفحة
        </button>
        <button type="button" className="wr-big" aria-pressed={ctx.focus} onMouseDown={hold} onClick={() => ctx.setFocus(!ctx.focus)} title="Ctrl+Alt+F">
          <Ic i={Maximize2} />
          وضع التركيز
        </button>
      </Group>
      <Group name="التكبير">
        <span className="wr-size">
          <Tool label="تصغير العرض" onClick={() => ctx.setZoom(Math.max(0.8, Math.round((ctx.zoom - 0.1) * 10) / 10))}>
            <Ic i={Minus} />
          </Tool>
          <output className="wr-zoom">{Math.round(ctx.zoom * 100)}%</output>
          <Tool label="تكبير العرض" onClick={() => ctx.setZoom(Math.min(1.5, Math.round((ctx.zoom + 0.1) * 10) / 10))}>
            <Ic i={Plus} />
          </Tool>
        </span>
      </Group>
      <Group name="البحث">
        <button type="button" className="wr-big" onMouseDown={hold} onClick={ctx.find} title="Ctrl+F">
          <Ic i={Search} />
          بحث واستبدال
        </button>
      </Group>
    </>
  );
}

function FileTab({ ctx }: { ctx: RibbonCtx }) {
  return (
    <>
      <Group name="تصدير">
        <button type="button" className="wr-big" disabled={!!ctx.exporting} onClick={() => ctx.exportAs('docx')}>
          <Ic i={FileType2} />
          {ctx.exporting === 'docx' ? 'جارٍ التجهيز…' : 'ملف Word'}
        </button>
        <button type="button" className="wr-big" disabled={!!ctx.exporting} onClick={() => ctx.exportAs('pdf')}>
          <Ic i={FileDown} />
          {ctx.exporting === 'pdf' ? 'جارٍ التجهيز…' : 'ملف PDF'}
        </button>
        <button type="button" className="wr-big" disabled={!!ctx.exporting} onClick={() => ctx.exportAs('txt')}>
          <Ic i={FileText} />
          نص عادي
        </button>
      </Group>
      <Group name="فتح">
        <button type="button" className="wr-big" disabled={ctx.locked} onClick={ctx.importWord}>
          <Ic i={FileUp} />
          من ملف Word
        </button>
      </Group>
    </>
  );
}

function TableTab({ editor }: { editor: Editor }) {
  const [pop, setPop] = useState<{ k: 'fill' | 'line' | 'size'; el: HTMLElement } | null>(null);
  const t = tableInfo(editor);
  if (!t) return null;
  const scope = scopeOf(editor, t);
  const look = sharedLook(editor, t);
  const cell = caretCell(editor, t);
  const design = (t.node.attrs.design as string | null) ?? 'grid';
  const c = () => editor.chain().focus();
  return (
    <>
      <Group name={`التحديد: ${scope.label}`}>
        <button type="button" className="wr-chip" aria-pressed={scope.kind === 'row'} onMouseDown={hold} onClick={() => cell && selectRows(editor, t, cell.row)}>
          <Ic i={Rows3} />
          الصف
        </button>
        <button type="button" className="wr-chip" aria-pressed={scope.kind === 'col'} onMouseDown={hold} onClick={() => cell && selectCols(editor, t, cell.col)}>
          <Ic i={Columns3} />
          العمود
        </button>
        <button type="button" className="wr-chip" aria-pressed={scope.kind === 'table'} onMouseDown={hold} onClick={() => selectAll(editor, t)}>
          <Ic i={Square} />
          الجدول
        </button>
      </Group>
      <Group name="التصميم">
        <div className="wr-designs">
          {Object.entries(TABLE_DESIGNS).map(([k, d]) => (
            <button type="button" key={k} className="wr-design" data-design-key={k} aria-pressed={design === k} aria-label={`تصميم ${d.name}`} title={d.name} onMouseDown={hold} onClick={() => setDesign(editor, t, k)}>
              {designThumb(d)}
            </button>
          ))}
        </div>
      </Group>
      <Group name="لون المحدد">
        <button type="button" className="wr-chip" data-tcolor="fill" onMouseDown={hold} onClick={(e) => setPop({ k: 'fill', el: e.currentTarget })}>
          <Ic i={PaintBucket} />
          التعبئة
          <i className="wr-dot" style={{ background: look.fill ?? 'transparent' }} />
        </button>
        <button type="button" className="wr-chip" data-tcolor="line" onMouseDown={hold} onClick={(e) => setPop({ k: 'line', el: e.currentTarget })}>
          <Ic i={SquareDashed} />
          الخطوط
          <i className="wr-dot" style={{ background: look.line ?? 'transparent' }} />
        </button>
        <Tool label="مسح تلوين المحدد" onClick={() => clearCells(editor, t)}>
          <Ic i={Eraser} />
        </Tool>
      </Group>
      <Group name="الصفوف والأعمدة">
        <Tool label="صف فوق" onClick={() => c().addRowBefore().run()}>
          <span className="wr-add">
            <Ic i={Rows3} />
            <small>فوق</small>
          </span>
        </Tool>
        <Tool label="صف تحت" onClick={() => c().addRowAfter().run()}>
          <span className="wr-add">
            <Ic i={Rows3} />
            <small>تحت</small>
          </span>
        </Tool>
        <Tool label="عمود قبل" onClick={() => c().addColumnBefore().run()}>
          <span className="wr-add">
            <Ic i={Columns3} />
            <small>قبل</small>
          </span>
        </Tool>
        <Tool label="عمود بعد" onClick={() => c().addColumnAfter().run()}>
          <span className="wr-add">
            <Ic i={Columns3} />
            <small>بعد</small>
          </span>
        </Tool>
        <Tool label="الحجم" onClick={(e) => setPop({ k: 'size', el: e.currentTarget })}>
          <span className="wr-add" data-size="1">
            <b>
              {t.rows}×{t.cols}
            </b>
          </span>
        </Tool>
      </Group>
      <Group name="الخلايا">
        <Tool label="دمج الخلايا" disabled={!editor.can().mergeCells()} onClick={() => c().mergeCells().run()}>
          <Ic i={Merge} />
        </Tool>
        <Tool label="تقسيم الخلية" disabled={!editor.can().splitCell()} onClick={() => c().splitCell().run()}>
          <Ic i={Split} />
        </Tool>
        <Tool label="الصف الأول عناوين" on={t.node.firstChild?.firstChild?.type.name === 'tableHeader'} onClick={() => c().toggleHeaderRow().run()}>
          <Ic i={PanelTop} />
        </Tool>
      </Group>
      <Group name="حذف">
        <Tool label="حذف الصف" onClick={() => c().deleteRow().run()}>
          <span className="wr-add">
            <Ic i={Trash2} />
            <small>صف</small>
          </span>
        </Tool>
        <Tool label="حذف العمود" onClick={() => c().deleteColumn().run()}>
          <span className="wr-add">
            <Ic i={Trash2} />
            <small>عمود</small>
          </span>
        </Tool>
        <Tool label="حذف الجدول" onClick={() => c().deleteTable().run()}>
          <span className="wr-add">
            <Ic i={Trash2} />
            <small>جدول</small>
          </span>
        </Tool>
      </Group>
      {pop?.k === 'fill' && (
        <Pop anchor={pop.el} onClose={() => setPop(null)}>
          <b className="wr-popt">تعبئة: {scope.label}</b>
          <ColorMenu colors={CELL_FILLS} value={look.fill} clear="بلا لون" onPick={(v) => setFill(editor, t, v)} alpha={look.fillAlpha} onAlpha={(v) => setFillAlpha(editor, t, v)} alphaLabel="الشفافية" />
        </Pop>
      )}
      {pop?.k === 'line' && (
        <Pop anchor={pop.el} onClose={() => setPop(null)}>
          <b className="wr-popt">خطوط: {scope.label}</b>
          <ColorMenu colors={CELL_LINES} value={look.line} clear="لون التصميم" onPick={(v) => setLine(editor, t, v)} alpha={look.lineAlpha} onAlpha={(v) => setLineAlpha(editor, t, v)} alphaLabel="الشفافية" />
        </Pop>
      )}
      {pop?.k === 'size' && <TablePicker editor={editor} anchor={pop.el} onClose={() => setPop(null)} />}
    </>
  );
}

function ImageTab({ editor }: { editor: Editor }) {
  const a = editor.getAttributes('image') as { width?: number; align?: string; alt?: string };
  const set = (v: Record<string, unknown>) => editor.chain().updateAttributes('image', v).run();
  return (
    <>
      <Group name="الحجم">
        {[25, 50, 75, 100].map((p) => (
          <button type="button" key={p} className="wr-chip" data-img-size={p} aria-pressed={(a.width ?? 75) === p} onMouseDown={hold} onClick={() => set({ width: p })}>
            {p}%
          </button>
        ))}
      </Group>
      <Group name="المحاذاة">
        <Tool label="يمين" on={a.align === 'right'} onClick={() => set({ align: 'right' })}>
          <Ic i={AlignRight} />
        </Tool>
        <Tool label="وسط" on={!a.align || a.align === 'center'} onClick={() => set({ align: 'center' })}>
          <Ic i={AlignCenter} />
        </Tool>
        <Tool label="يسار" on={a.align === 'left'} onClick={() => set({ align: 'left' })}>
          <Ic i={AlignLeft} />
        </Tool>
      </Group>
      <Group name="نص بديل">
        <input className="wr-alt" id="wrAlt" aria-label="نص بديل للصورة" maxLength={200} placeholder="وصف قصير للصورة" value={a.alt ?? ''} onChange={(e) => set({ alt: e.target.value })} />
      </Group>
      <Group name="حذف">
        <Tool label="حذف الصورة من النص" onClick={() => editor.chain().focus().deleteSelection().run()}>
          <Ic i={Trash2} />
        </Tool>
      </Group>
    </>
  );
}

export function Ribbon({ editor, ctx, tab, setTab }: { editor: Editor; ctx: RibbonCtx; tab: RibbonTab; setTab: (t: RibbonTab) => void }) {
  const inTable = !!tableInfo(editor);
  const onImage = editor.isActive('image');
  const shown: [RibbonTab, string][] = [
    ['file', 'ملف'],
    ['home', 'الرئيسية'],
    ['insert', 'إدراج'],
    ['view', 'عرض'],
    ...(inTable ? ([['table', 'الجدول']] as [RibbonTab, string][]) : []),
    ...(onImage ? ([['image', 'الصورة']] as [RibbonTab, string][]) : []),
  ];
  return (
    <div className="wr-ribbon" role="toolbar" aria-label="أدوات الكتابة" aria-disabled={ctx.locked}>
      <div className="wr-rtabs" role="tablist">
        {shown.map(([k, l]) => (
          <button type="button" key={k} role="tab" aria-selected={tab === k} className={k === 'table' || k === 'image' ? 'ctx' : ''} data-rtab={k} onMouseDown={hold} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      <div className="wr-rbody" role="tabpanel">
        {tab === 'home' && <HomeTab editor={editor} ctx={ctx} />}
        {tab === 'insert' && <InsertTab editor={editor} ctx={ctx} />}
        {tab === 'view' && <ViewTab ctx={ctx} />}
        {tab === 'file' && <FileTab ctx={ctx} />}
        {tab === 'table' && <TableTab editor={editor} />}
        {tab === 'image' && <ImageTab editor={editor} />}
      </div>
    </div>
  );
}

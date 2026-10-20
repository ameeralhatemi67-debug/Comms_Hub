'use client';

// The studio's sources of things to add (MVP_draft.md 62): «المكتبة» (files this person may see, at their
// current version; needs the media page, like the library's own file route), «هذا الجهاز» (a file kept
// in this browser only, marked so, with uploading to the library offered first), «قوالب الحركة» (the 26
// templates of the template tab), text, captions, SRT, shapes and «علامات الهوية» (the brand marks).
// On a computer each is its own window (62.1) and anything in them can be dragged onto the timeline or
// the preview; on a phone they are the tabs of one panel.
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Circle, FileUp, Film, Minus, Music, Search, Square, Subtitles, Type, Upload, EyeOff, Grid3x3, SquareDashed } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { STICKERS, STICKER_LABELS, type StickerKey } from '@/lib/studio/schema';
import { motionCatalog, motionParams, motionDims, settledSec, STICKER_SRC } from '@/lib/studio/motion-adapter';
import { renderFrame } from '@/lib/motion/renderers.js';
import type { Category, Graphic } from '@/lib/motion/types';
import { suggestedFirst } from '@/lib/studio/worklink';
import { DesktopOnly } from './compact';

export type LibraryItem = { id: string; name: string; kind: 'video' | 'image' | 'audio'; current_version: number; mime_type: string; dims: string | null; duration: string | null };

/** What is dragged from these windows onto the timeline or the preview. */
export const ADD_MIME = 'application/x-studio-add';
export type AddDrop =
  | { type: 'library'; item: LibraryItem }
  | { type: 'motion'; id: string }
  | { type: 'text'; kind: 'title' | 'body' | 'caption' }
  | { type: 'mark'; key: StickerKey; color: string }
  | { type: 'shape'; shape: 'rect' | 'ellipse' | 'line' }
  | { type: 'cover'; mode: 'blur' | 'blocks' }
  | { type: 'slot'; media: 'video' | 'image'; over: boolean };

const dragAdd = (payload: AddDrop) => (e: DragEvent) => {
  e.dataTransfer.setData(ADD_MIME, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = 'copy';
};

/** "1920 × 1080" and "1:05" from the library's own fields, as numbers (the exact ones come when the file is read). */
export function parseDims(d: string | null): { w?: number; h?: number } {
  const m = /(\d+)\s*[×x]\s*(\d+)/.exec(d ?? '');
  return m ? { w: Number(m[1]), h: Number(m[2]) } : {};
}
export function parseDuration(d: string | null): number | undefined {
  const m = /^(\d+):(\d{2})$/.exec(d ?? '');
  return m ? (Number(m[1]) * 60 + Number(m[2])) * 1_000_000 : undefined;
}

async function searchLibrary(q: string): Promise<LibraryItem[]> {
  let query = supabase()
    .from('media_files')
    .select('id,name,kind,current_version,mime_type,dims,duration')
    .in('kind', ['video', 'image', 'audio'])
    .order('created_at', { ascending: false })
    .limit(60);
  if (q.trim()) query = query.ilike('name', `%${q.trim()}%`);
  const { data } = await query;
  return (data ?? []) as LibraryItem[];
}

type Tab = 'library' | 'device' | 'motion' | 'text' | 'marks';
const TABS: { id: Tab; label: string }[] = [
  { id: 'library', label: 'المكتبة' },
  { id: 'device', label: 'هذا الجهاز' },
  { id: 'motion', label: 'قوالب الحركة' },
  { id: 'text', label: 'نص' },
  { id: 'marks', label: 'علامات الهوية' },
];
const GROUPS: { id: Category; label: string }[] = [
  { id: 'numbers', label: 'الأرقام' },
  { id: 'repine', label: 'تصاميم ريبين' },
  { id: 'frames', label: 'إطارات الفيديو' },
];

export type BinProps = {
  ratio: string;
  readOnly: boolean;
  canLibrary: boolean;
  canDevice: boolean;
  /** Images only (a photo project has no timeline). */
  photo?: boolean;
  onLibrary: (item: LibraryItem) => void;
  onDevice: (file: File, upload: boolean) => void;
  onMotion: (g: Graphic) => void;
  onText: (kind: 'title' | 'body' | 'caption') => void;
  onSrt?: (text: string) => void;
  onMark: (key: StickerKey, color: string) => void;
  /** Photos: a rectangle, an ellipse or a line. */
  onShape?: (type: 'rect' | 'ellipse' | 'line') => void;
  /** A covered area: blur or squares (MVP_draft.md 62.8). */
  onCover?: (mode: 'blur' | 'blocks') => void;
  /** «مكان محجوز» for a picture or video still to come (MVP_draft.md 62.12). */
  onSlot?: (media: 'video' | 'image', over: boolean) => void;
  assetsReady: boolean;
  /** A phone: SRT import is kept for the computer. */
  compact?: boolean;
  /** Template groups shown first, for a project made for a work (MVP_draft.md 62.12, I-023). */
  suggest?: string[];
};

function MotionTile({ g, ratio, onPick, ready, disabled }: { g: Graphic; ratio: string; onPick: () => void; ready: boolean; disabled: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !ready) return;
    const p = motionParams(g, {}, ratio as never);
    const d = motionDims(g, p);
    const w = 150;
    c.width = w;
    c.height = Math.round((w * d.h) / d.w);
    try {
      renderFrame(g, p, settledSec(g, p), c.getContext('2d')!, w / d.w, null);
    } catch {
      // a thumbnail is a convenience
    }
  }, [g, ratio, ready]);
  return (
    <button type="button" className="st-tile" onClick={onPick} disabled={disabled} title={`${g.blurb} · انقر للإضافة عند رأس التشغيل، أو اسحب`} data-template={g.id} draggable={!disabled} onDragStart={dragAdd({ type: 'motion', id: g.id })}>
      <canvas ref={ref} aria-hidden="true" />
      <span>{g.name}</span>
    </button>
  );
}

export function LibraryPane(p: Pick<BinProps, 'canLibrary' | 'readOnly' | 'photo' | 'onLibrary'>) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  useEffect(() => {
    if (!p.canLibrary) return;
    let live = true;
    const t = setTimeout(() => void searchLibrary(q).then((r) => live && setItems(p.photo ? r.filter((x) => x.kind === 'image') : r)), 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, p.canLibrary, p.photo]);
  if (!p.canLibrary) return <p className="st-hint">ملفات المكتبة تحتاج صفحة «مكتبة الوسائط»، وهي غير مفتوحة لحسابك. اطلبها من «صلاحياتي»، أو استعمل ملفاً من هذا الجهاز.</p>;
  return (
    <>
      <label className="st-search">
        <Search aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم الملف" aria-label="ابحث في المكتبة" />
      </label>
      {!items ? (
        <p role="status" className="st-hint">جارٍ البحث…</p>
      ) : items.length === 0 ? (
        <p className="st-hint">لا ملفات مطابقة تراها في المكتبة.</p>
      ) : (
        <ul className="st-lib">
          {items.map((it) => (
            <li key={it.id}>
              <button type="button" disabled={p.readOnly} onClick={() => p.onLibrary(it)} title={`إضافة «${it.name}» عند رأس التشغيل، أو اسحبه إلى الخط الزمني`} draggable={!p.readOnly} onDragStart={dragAdd({ type: 'library', item: it })}>
                {it.kind === 'image' ? (
                  <img src={`/api/media/${it.id}/content?v=${it.current_version}`} alt="" loading="lazy" draggable={false} />
                ) : (
                  <span className="st-lib-ico">{it.kind === 'video' ? <Film /> : <Music />}</span>
                )}
                <span className="st-lib-name" dir="auto">{it.name}</span>
                <small>
                  {it.kind === 'video' ? 'فيديو' : it.kind === 'audio' ? 'صوت' : 'صورة'}
                  {it.duration ? ` · ${it.duration}` : ''} · الإصدار {it.current_version}
                </small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function DevicePane(p: Pick<BinProps, 'canLibrary' | 'canDevice' | 'readOnly' | 'photo' | 'onDevice'>) {
  const [picked, setPicked] = useState<File | null>(null);
  return (
    <div className="st-device">
      <label className="button st-file">
        <FileUp aria-hidden="true" />
        اختر ملفاً من هذا الجهاز
        <input type="file" accept={p.photo ? 'image/*' : 'video/*,image/*,audio/*'} disabled={p.readOnly} onChange={(e) => setPicked(e.target.files?.[0] ?? null)} hidden />
      </label>
      {picked && (
        <div className="st-picked">
          <b dir="auto">{picked.name}</b>
          {p.canLibrary && (
            <button type="button" className="primary" onClick={() => (p.onDevice(picked, true), setPicked(null))}>
              <Upload aria-hidden="true" />
              رفعه إلى المكتبة ثم استخدامه
            </button>
          )}
          {p.canDevice ? (
            <button type="button" onClick={() => (p.onDevice(picked, false), setPicked(null))}>
              استخدامه من هذا الجهاز فقط
            </button>
          ) : (
            <p className="st-hint">هذا المتصفح لا يحفظ الملفات على الجهاز (نافذة خاصة أو متصفح لا يدعم ذلك)، فارفع الملف إلى المكتبة.</p>
          )}
          <small>الملف المستعمل من هذا الجهاز فقط يظهر «على هذا الجهاز فقط»، ولا يفتح المشروع كاملاً من جهاز آخر.</small>
        </div>
      )}
    </div>
  );
}

/** «الوسائط»: the library and this device. */
export function MediaPane(p: BinProps) {
  const [tab, setTab] = useState<'library' | 'device'>(p.canLibrary ? 'library' : 'device');
  return (
    <aside className="st-bin st-pane" aria-label="الوسائط">
      <div className="st-pane-tabs" role="tablist" aria-label="مصدر الملفات">
        <button type="button" role="tab" aria-selected={tab === 'library'} data-on={tab === 'library' ? 'yes' : 'no'} onClick={() => setTab('library')}>المكتبة</button>
        <button type="button" role="tab" aria-selected={tab === 'device'} data-on={tab === 'device' ? 'yes' : 'no'} onClick={() => setTab('device')}>هذا الجهاز</button>
      </div>
      <div className="st-bin-body" role="tabpanel">
        {tab === 'library' ? <LibraryPane {...p} /> : <DevicePane {...p} />}
      </div>
    </aside>
  );
}

export function TemplatesPane(p: Pick<BinProps, 'ratio' | 'readOnly' | 'photo' | 'onMotion' | 'assetsReady' | 'suggest'>) {
  const suggested = new Set((p.suggest ?? []).filter((x) => GROUPS.some((g) => g.id === x)));
  const order = suggested.size ? suggestedFirst(GROUPS, p.suggest ?? []) : GROUPS;
  const [group, setGroup] = useState<Category>(suggested.size ? order[0].id : 'repine');
  return (
    <div className="st-bin-body st-pane" aria-label="قوالب الحركة">
      <div className="st-seg-mini" role="group" aria-label="فئة القوالب">
        {order.map((g) => (
          <button key={g.id} type="button" aria-pressed={group === g.id} className={group === g.id ? 'on' : ''} onClick={() => setGroup(g.id)} data-suggested={suggested.has(g.id) ? 'yes' : undefined} title={suggested.has(g.id) ? 'مقترحة لنوع العمل' : undefined}>
            {g.label}
          </button>
        ))}
      </div>
      {suggested.size > 0 && <p className="st-hint">الفئات الأولى مقترحة لنوع العمل المرتبط.</p>}
      {group === 'frames' && !p.photo && <p className="st-hint">إطارات الفيديو تأخذ شكل المشروع، وتظهر مقاطع المسارات التي تحتها من نافذتها.</p>}
      <div className="st-tiles">
        {motionCatalog.filter((g) => g.category === group).map((g) => (
          <MotionTile key={g.id} g={g} ratio={p.ratio} ready={p.assetsReady} disabled={p.readOnly} onPick={() => p.onMotion(g)} />
        ))}
      </div>
      {!p.assetsReady && <p className="st-hint" role="status">جارٍ تجهيز القوالب…</p>}
    </div>
  );
}

export function GraphicsPane(p: Pick<BinProps, 'readOnly' | 'photo' | 'onText' | 'onSrt' | 'onMark' | 'onShape' | 'onCover' | 'onSlot' | 'compact'> & { marks?: boolean; texts?: boolean }) {
  const [markColor, setMarkColor] = useState('#ffffff');
  const srtInput = useRef<HTMLInputElement>(null);
  const texts = p.texts !== false;
  const marks = p.marks !== false;
  return (
    <div className="st-bin-body st-pane" aria-label="النصوص والعلامات">
      {texts && (
        <div className="st-textadd">
          <b className="st-sub">نص</b>
          <button type="button" disabled={p.readOnly} onClick={() => p.onText('title')} draggable={!p.readOnly} onDragStart={dragAdd({ type: 'text', kind: 'title' })}>
            <Type aria-hidden="true" />
            عنوان كبير
          </button>
          <button type="button" disabled={p.readOnly} onClick={() => p.onText('body')} draggable={!p.readOnly} onDragStart={dragAdd({ type: 'text', kind: 'body' })}>
            <Type aria-hidden="true" />
            نص عادي
          </button>
          {!p.photo && (
            <button type="button" disabled={p.readOnly} onClick={() => p.onText('caption')} draggable={!p.readOnly} onDragStart={dragAdd({ type: 'text', kind: 'caption' })}>
              <Subtitles aria-hidden="true" />
              تعليق أسفل الشاشة
            </button>
          )}
          {p.onShape && (
            <>
              <b className="st-sub">أشكال</b>
              <button type="button" disabled={p.readOnly} onClick={() => p.onShape!('rect')} draggable={!p.readOnly} onDragStart={dragAdd({ type: 'shape', shape: 'rect' })}>
                <Square aria-hidden="true" />
                مستطيل
              </button>
              <button type="button" disabled={p.readOnly} onClick={() => p.onShape!('ellipse')} draggable={!p.readOnly} onDragStart={dragAdd({ type: 'shape', shape: 'ellipse' })}>
                <Circle aria-hidden="true" />
                دائرة
              </button>
              <button type="button" disabled={p.readOnly} onClick={() => p.onShape!('line')} draggable={!p.readOnly} onDragStart={dragAdd({ type: 'shape', shape: 'line' })}>
                <Minus aria-hidden="true" />
                خط
              </button>
            </>
          )}
          {p.onCover && (
            <>
              <b className="st-sub">إخفاء جزء من الصورة</b>
              <button type="button" disabled={p.readOnly} onClick={() => p.onCover!('blur')} draggable={!p.readOnly} onDragStart={dragAdd({ type: 'cover', mode: 'blur' })} title="لوجه أو لوحة سيارة أو ورقة: يموّه ما تحته">
                <EyeOff aria-hidden="true" />
                تمويه منطقة
              </button>
              <button type="button" disabled={p.readOnly} onClick={() => p.onCover!('blocks')} draggable={!p.readOnly} onDragStart={dragAdd({ type: 'cover', mode: 'blocks' })} title="يحوّل ما تحته إلى مربعات كبيرة">
                <Grid3x3 aria-hidden="true" />
                إخفاء بالمربعات
              </button>
            </>
          )}
          {p.onSlot && (
            <>
              <b className="st-sub">مكان محجوز</b>
              <button type="button" disabled={p.readOnly} onClick={() => p.onSlot!('video', false)} draggable={!p.readOnly} onDragStart={dragAdd({ type: 'slot', media: 'video', over: false })} title="لقطة لم تصل بعد، ملء الإطار. يُسند إلى من يحضرها مهمة من إعداداته">
                <SquareDashed aria-hidden="true" />
                مكان للقطة
              </button>
              <button type="button" disabled={p.readOnly} onClick={() => p.onSlot!('image', true)} draggable={!p.readOnly} onDragStart={dragAdd({ type: 'slot', media: 'image', over: true })} title="صورة أو تصميم لم يصل بعد، في مربع فوق اللقطة">
                <SquareDashed aria-hidden="true" />
                مكان لصورة فوق اللقطة
              </button>
            </>
          )}
          {p.onSrt && p.compact && <DesktopOnly what="استيراد ترجمة SRT" />}
          {p.onSrt && !p.compact && (
            <>
              <button type="button" disabled={p.readOnly} onClick={() => srtInput.current?.click()}>
                <Subtitles aria-hidden="true" />
                استيراد ترجمة SRT
              </button>
              <input
                ref={srtInput}
                type="file"
                accept=".srt,text/plain"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) p.onSrt!(await f.text());
                  e.target.value = '';
                }}
              />
            </>
          )}
        </div>
      )}
      {marks && (
        <>
          <b className="st-sub">علامات الهوية</b>
          <label className="st-markcolor">
            لون العلامة
            <input type="color" value={markColor} onChange={(e) => setMarkColor(e.target.value)} />
          </label>
          <div className="st-tiles st-marks">
            {STICKERS.map((k) => (
              <button key={k} type="button" className="st-tile" disabled={p.readOnly} onClick={() => p.onMark(k, markColor)} draggable={!p.readOnly} onDragStart={dragAdd({ type: 'mark', key: k, color: markColor })}>
                <span className="st-mark-img" style={{ WebkitMaskImage: `url(${STICKER_SRC[k]})`, maskImage: `url(${STICKER_SRC[k]})`, background: markColor === '#ffffff' ? '#17634b' : markColor }} aria-hidden="true" />
                <span>{STICKER_LABELS[k]}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** A phone: one panel with a tab for each source. */
export function Bin(p: BinProps) {
  const [tab, setTab] = useState<Tab>(p.canLibrary ? 'library' : 'device');
  const tabs = TABS.map((t) => (p.photo && t.id === 'text' ? { ...t, label: 'نص وأشكال' } : t));
  return (
    <aside className="st-bin" aria-label="الوسائط">
      <div className="st-bin-tabs" role="tablist" aria-label="مصادر الوسائط">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="st-bin-body" role="tabpanel">
        {tab === 'library' && <LibraryPane {...p} />}
        {tab === 'device' && <DevicePane {...p} />}
        {tab === 'motion' && <TemplatesPane {...p} />}
        {tab === 'text' && <GraphicsPane {...p} marks={false} />}
        {tab === 'marks' && <GraphicsPane {...p} texts={false} />}
      </div>
    </aside>
  );
}

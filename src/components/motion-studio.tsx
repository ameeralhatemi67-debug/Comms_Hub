'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Download, Pause, Play, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { Title, Tabs } from './ui';
import { catalog } from '@/lib/motion/catalog';
import { loadAssets, renderFrame, timingOf } from '@/lib/motion/renderers.js';
import { exportDesign, type ExportFormat } from '@/lib/motion/export.js';
import type { Category, Graphic, Params } from '@/lib/motion/types';
import './motion-studio.css';

const groups = [{ id: 'numbers', label: 'الأرقام' }, { id: 'repine', label: 'تصاميم ريبين' }, { id: 'frames', label: 'إطارات الفيديو' }];
const settledTime = (g: Graphic, p: Params) => g.category === 'numbers' && !g.isNew ? 3.4 : p.tIn + Math.min(.5, p.tHold / 2);
function NumberField({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return <label>{label}<input type="number" min={min} max={max} step={step} value={draft}
    onChange={event => {
      setDraft(event.target.value);
      const next = event.target.valueAsNumber;
      if (Number.isFinite(next) && next >= min && next <= max) onChange(next);
    }}
    onBlur={() => {
      const next = draft.trim() === '' ? value : Number(draft);
      const valid = Number.isFinite(next) ? Math.max(min, Math.min(max, next)) : value;
      setDraft(String(valid)); onChange(valid);
    }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>;
}
function paint(canvas: HTMLCanvasElement, g: Graphic, p: Params, time: number, thumbnail = false) {
  const d = g.dims?.(p) || { w: 1280, h: 720 }, width = thumbnail ? 420 : 1000;
  if (canvas.width !== width || canvas.height !== Math.round(width * d.h / d.w)) {
    canvas.width = width; canvas.height = Math.round(width * d.h / d.w);
  }
  const ctx = canvas.getContext('2d');
  if (ctx) renderFrame(g, p, time, ctx, width / d.w, null);
}
function Thumbnail({ graphic }: { graphic: Graphic }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) paint(ref.current, graphic, graphic.defaults, settledTime(graphic, graphic.defaults), true);
  }, [graphic]);
  return <canvas ref={ref} aria-hidden="true" />;
}
function Player({ g, p, time, busy }: { g: Graphic; p: Params; time: RefObject<number>; busy: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null), scrub = useRef<HTMLInputElement>(null), counter = useRef<HTMLOutputElement>(null);
  const [playing, setPlaying] = useState(false);
  const duration = timingOf(g, p).total;
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const stop = () => { if (media.matches) setPlaying(false); };
    media.addEventListener('change', stop); return () => media.removeEventListener('change', stop);
  }, []);
  useEffect(() => { if (busy) setPlaying(false); }, [busy]);
  useEffect(() => {
    let frame = 0, previous = performance.now();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const params = reduced ? { ...p, mIdle: 0, particles: false } : p;
    const draw = () => {
      time.current = Math.min(time.current, duration);
      if (canvas.current) paint(canvas.current, g, params, time.current);
      if (scrub.current) scrub.current.value = String(time.current);
      if (counter.current) counter.current.textContent = `${(time.current / p.speed).toFixed(1)} / ${(duration / p.speed).toFixed(1)} ث`;
    };
    const tick = (now: number) => {
      if (!document.hidden) time.current = Math.min(duration, time.current + Math.min(now - previous, 100) / 1000 * p.speed);
      previous = now; draw();
      if (time.current < duration) frame = requestAnimationFrame(tick); else setPlaying(false);
    };
    draw();
    if (playing && !busy) frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [g, p, duration, playing, busy, time]);
  return <div className="motion-player">
    <div className={`motion-stage ${g.category === 'frames' ? 'portrait' : ''}`}>
      <canvas ref={canvas} role="img" aria-label={`معاينة ${g.name}`} style={{ aspectRatio: `${g.dims?.(p).w || 1280} / ${g.dims?.(p).h || 720}` }} />
    </div>
    <div className="motion-transport">
      <button disabled={busy} aria-label={playing ? 'إيقاف المعاينة' : 'تشغيل المعاينة'} onClick={() => {
        if (time.current >= duration || !playing && time.current === settledTime(g, p)) time.current = 0;
        setPlaying(!playing);
      }}>{playing ? <Pause /> : <Play />}</button>
      <input ref={scrub} aria-label="موضع المعاينة" type="range" min="0" max={duration} step="0.01" defaultValue={time.current} disabled={busy} onChange={e => {
        setPlaying(false); time.current = Number(e.target.value);
        if (canvas.current) paint(canvas.current, g, p, time.current);
        if (counter.current) counter.current.textContent = `${(time.current / p.speed).toFixed(1)} / ${(duration / p.speed).toFixed(1)} ث`;
      }} />
      <output ref={counter} dir="ltr" />
    </div>
  </div>;
}

export default function MotionStudio() {
  const [assetsReady, setAssetsReady] = useState(false), [assetError, setAssetError] = useState('');
  const [category, setCategory] = useState<Category>('numbers');
  const [selected, setSelected] = useState('count-up');
  const [drafts, setDrafts] = useState<Record<string, Params>>({});
  const [format, setFormat] = useState<ExportFormat>('mov'), [shortSide, setShortSide] = useState(720);
  const [keyColor, setKeyColor] = useState('#ff00ff');
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(0), [message, setMessage] = useState('');
  const controller = useRef<AbortController | null>(null), time = useRef(3.4);
  const editorTitle = useRef<HTMLHeadingElement>(null);
  const g = catalog.find(item => item.id === selected)!;
  const p = drafts[selected] || g.defaults;
  const templates = catalog.filter(item => item.category === category);
  const dimensions = g.dims?.(p) || { w: 1280, h: 720 };
  const scale = shortSide / Math.min(dimensions.w, dimensions.h);
  const init = () => {
    setAssetError(''); loadAssets().then(() => setAssetsReady(true)).catch(() => setAssetError('تعذر تحميل عناصر التصميم.'));
  };
  useEffect(() => { init(); return () => controller.current?.abort(); }, []);
  const update = <K extends keyof Params>(key: K, value: Params[K]) => {
    setDrafts(previous => ({ ...previous, [selected]: { ...p, [key]: value } })); setMessage('');
  };
  const choose = (graphic: Graphic, focusEditor = false) => {
    setSelected(graphic.id); time.current = settledTime(graphic, drafts[graphic.id] || graphic.defaults); setMessage('');
    if (focusEditor) requestAnimationFrame(() => { editorTitle.current?.focus(); editorTitle.current?.scrollIntoView({ block: 'start' }); });
  };
  const field = (key: keyof Params, label: string, maxLength = 48) => <label>{label}<input value={String(p[key])} maxLength={maxLength} onChange={e => update(key, e.target.value)} /></label>;
  const color = (key: keyof Params, label: string) => <label className="motion-color">{label}<input type="color" value={String(p[key])} onChange={e => update(key, e.target.value)} /></label>;
  const numeric = (key: keyof Params, label: string, min: number, max: number, step = .1) => <NumberField key={`${g.id}-${key}`} label={label} min={min} max={max} step={step} value={Number(p[key])} onChange={value => update(key, value)} />;
  async function exportCurrent() {
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setProgress(0); setMessage('');
    try {
      await exportDesign(g, p, { format, shortSide, keyColor, time: time.current }, abort.signal, setProgress);
      setMessage('اكتمل إنشاء الملف وبدأ تنزيله على جهازك.');
    } catch (error) {
      setMessage(abort.signal.aborted ? 'أُلغي التصدير. يمكنك المحاولة من جديد.' : error instanceof Error && /[\u0600-\u06ff]/.test(error.message) ? error.message : 'تعذر التصدير. حاول بدقة أقل أو استخدم صيغة أخرى.');
    } finally { setBusy(false); controller.current = null; }
  }
  return <div className="motion-studio">
    <Title title="استوديو الحركة" sub="اختر قالباً، خصّص محتواه، ثم نزّل التصميم لاستخدامه في موادك.">
      <Link href="/media" className="button">مكتبة الوسائط</Link>
    </Title>
    <div className="motion-note"><span className="chip">أداة محلية تجريبية</span><p>التعديلات مؤقتة حتى تحديث الصفحة. التنزيل محلي، ولا يُضاف الملف إلى مكتبة الوسائط أو يُنشر تلقائياً.</p></div>
    <fieldset className="motion-categories" disabled={busy}>
      <Tabs items={groups.map(group => ({ ...group, label: `${group.label} (${catalog.filter(g => g.category === group.id).length})` }))} value={category} onChange={value => {
        setCategory(value as Category); choose(catalog.find(g => g.category === value)!);
      }} />
    </fieldset>
    {assetError ? <div className="panel"><p role="alert">{assetError}</p><button onClick={init}>إعادة المحاولة</button></div> : !assetsReady ? <div className="motion-loading" role="status">جارٍ تجهيز القوالب…</div> : <>
      <div className="motion-chooser"><label>القالب<select aria-label="اختيار قالب" disabled={busy} value={g.id} onChange={event => choose(catalog.find(item => item.id === event.target.value)!)}>{templates.map(item => <option key={item.id} value={item.id}>{item.name}{item.isNew ? ' · جديد' : ''}</option>)}</select></label><a className="button" href="#motion-gallery">استعراض القوالب</a></div>
      <section className="motion-editor" aria-label="تخصيص التصميم">
        <div className="motion-preview-column">
          <div className="between motion-preview-heading"><div><span className="eyebrow">معاينة التصميم</span><h2 ref={editorTitle} tabIndex={-1}>{g.name}</h2></div>{g.isNew && <span className="chip success">جديد</span>}</div>
          <Player key={g.id} g={g} p={p} time={time} busy={busy} />
          <p className="motion-caption">{g.blurb} المربعات تمثل المساحة الشفافة ولا تظهر في الملف.</p>
          {g.category === 'numbers' && ['growth-bars', 'line-rise'].includes(g.id) && <p className="motion-caption">مسار الرسم توضيحي، ولا يمثل بيانات فعلية.</p>}
          {g.category !== 'numbers' && !['rp-editorial', 'fr-portal', 'fr-broadcast'].includes(g.id) && <p className="motion-caption">يتضمن القالب شعار هداية الأصلي. النصوص القابلة للتعديل تخص التصميم فقط.</p>}
          <div className="motion-export">
            <h3><Download /> تنزيل التصميم</h3>
            <fieldset disabled={busy} className="motion-export-fields">
              <label>صيغة الملف<select aria-label="صيغة الملف" value={format} onChange={e => setFormat(e.target.value as ExportFormat)}>
                <option value="mov">فيديو شفاف (MOV)</option><option value="mp4">فيديو بخلفية مفتاحية (MP4)</option><option value="zip">تسلسل صور شفاف (ZIP)</option><option value="png">صورة الموضع الحالي (PNG)</option>
              </select></label>
              <label>دقة الضلع القصير<select aria-label="دقة الضلع القصير" value={shortSide} onChange={e => setShortSide(Number(e.target.value))}><option value="360">٣٦٠ بكسل</option><option value="720">٧٢٠ بكسل</option></select></label>
              {format === 'mp4' && <label className="motion-color">لون الخلفية المفتاحية<input type="color" value={keyColor} onChange={e => setKeyColor(e.target.value)} /></label>}
            </fieldset>
            <p className="motion-caption">{Math.round(dimensions.w * scale / 2) * 2} × {Math.round(dimensions.h * scale / 2) * 2} بكسل · {format === 'png' ? 'صورة ثابتة' : `٢٤ إطاراً/ث · ${(timingOf(g, p).total / p.speed).toFixed(1)} ثانية`}</p>
            <p className="motion-caption">{format === 'mp4' ? 'أزل اللون المفتاحي في برنامج المونتاج. اختر لوناً مختلفاً عن ألوان التصميم.' : format === 'mov' ? 'ملف شفاف بترميز PNG. قد يكون حجمه كبيراً؛ افتحه في برنامج المونتاج.' : format === 'zip' ? 'فك الضغط ثم استورد الصور كتسلسل في برنامج المونتاج.' : 'يحفظ موضع المعاينة الحالي بخلفية شفافة.'}</p>
            <div className="actions"><button className="primary" disabled={busy} onClick={exportCurrent}><Download />{busy ? `جارٍ التصدير ${progress}٪` : 'تنزيل التصميم'}</button>{busy && <button onClick={() => controller.current?.abort()}>إلغاء التصدير</button>}</div>
            {busy && <progress aria-label="تقدم التصدير" value={progress} max="100" />}
            <p role="status" className="motion-feedback">{message}</p>
          </div>
        </div>
        <aside className="motion-settings">
          <div className="between"><h3><SlidersHorizontal /> تخصيص القالب</h3><button aria-label="إعادة ضبط القالب" title="إعادة ضبط القالب" disabled={busy} onClick={() => { setDrafts(previous => ({ ...previous, [selected]: { ...g.defaults } })); time.current = settledTime(g, g.defaults); setMessage('أُعيد القالب إلى إعداداته الأصلية.'); }}><RotateCcw /></button></div>
          <fieldset disabled={busy}>
            {category === 'numbers' ? <>{field('label', 'وصف الرقم', 38)}{numeric('value', 'القيمة', 0, g.id === 'arc-gauge' ? 100 : g.value?.boxMax || 99999999, 1)}<div className="field-pair">{field('prefix', 'قبل الرقم', 4)}{field('suffix', 'بعد الرقم', 4)}</div><div className="field-pair">{color('color', 'لون الحركة')}{color('text', 'لون الرقم')}</div></> : category === 'repine' ? <>{field('title', 'العنوان', 38)}{field('subtitle', 'النص الفرعي', 65)}<div className="field-pair">{color('main', 'اللون الأساسي')}{color('accent', 'لون الزخرفة')}</div></> : <>
              <label>أبعاد الإطار<select aria-label="أبعاد الإطار" value={p.ratio} onChange={e => update('ratio', e.target.value)}><option value="9:16">رأسي 9:16</option><option value="4:5">منشور 4:5</option><option value="1:1">مربع 1:1</option><option value="16:9">أفقي 16:9</option></select></label>
              {g.isNew && field('title', 'العنوان العلوي', 38)}{field('reciter', 'الاسم أو عنوان التغطية', 38)}{g.isNew && field('subtitle', g.id === 'fr-broadcast' ? 'النص العلوي الفرعي' : 'النص السفلي', 50)}
              <div className="field-pair">{color('c1', 'اللون الأساسي')}{color('c2', 'اللون الثانوي')}{color('c3', 'اللون الثالث')}{!g.isNew && g.colors?.some(item => Array.isArray(item) && item[0] === 'c4') && color('c4', 'اللون الرابع')}</div>
              {!g.isNew && <details><summary>عناصر الإطار</summary>{(['showLogo', 'showVerse', 'showWave', 'particles', 'showContact', 'showSocial'] as const).map((key, index) => g.toggles?.includes(key) && <label className="check-row" key={key}><input type="checkbox" checked={p[key]} onChange={e => update(key, e.target.checked)} />{['الشعار', 'الآية', 'الموجة الصوتية الزخرفية', 'الجزيئات', 'معلومات التواصل', 'روابط التواصل'][index]}</label>)}{p.showContact && <>{field('support', 'عبارة التواصل')}{field('phone', 'رقم التواصل', 20)}</>}{p.showSocial && <>{field('handle', 'اسم الحساب', 25)}{field('web', 'الموقع الإلكتروني', 40)}</>}</details>}
            </>}
            <details className="motion-timing"><summary>التوقيت والحركة</summary>
              {numeric('speed', 'سرعة الحركة', .5, 2, .25)}
              {category === 'numbers' && !g.isNew ? numeric('hold', 'مدة الثبات بالثواني', .5, 10, .5) : <>{numeric('tIn', 'مدة الدخول بالثواني', .5, 5, .1)}{numeric('tHold', 'مدة الثبات بالثواني', .5, 12, .5)}{numeric('tOut', 'مدة الخروج بالثواني', .3, 3, .1)}</>}
              {!g.isNew && category === 'numbers' && <label className="check-row"><input type="checkbox" checked={p.glow} onChange={e => update('glow', e.target.checked)} />التوهج</label>}
            </details>
          </fieldset>
        </aside>
      </section>
      <section id="motion-gallery" tabIndex={-1} aria-label="قوالب الحركة" className="motion-library">
        <div className="between"><h2>قوالب {groups.find(group => group.id === category)?.label}</h2><small>{templates.length} قوالب · تصميمان جديدان</small></div>
        <div className="motion-grid">{templates.map(graphic => <button key={graphic.id} disabled={busy} className={`motion-card ${selected === graphic.id ? 'selected' : ''}`} aria-pressed={selected === graphic.id} onClick={() => choose(graphic, true)} data-template={graphic.id}>
          <div className={`motion-thumb ${category === 'frames' ? 'frame-thumb' : ''}`}><Thumbnail graphic={graphic} /></div>
          <span className="motion-card-text"><span className="between"><b>{graphic.name}</b>{graphic.isNew && <span className="chip success">جديد</span>}</span><small>{graphic.blurb}</small></span>
        </button>)}</div>
      </section>
    </>}
  </div>;
}

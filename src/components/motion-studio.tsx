'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, ChevronLeft, ChevronRight, Layers, Palette, RotateCcw, Timer, Type, Upload } from 'lucide-react';
import { Title, Tabs } from './ui';
import { catalog } from '@/lib/motion/catalog';
import { loadAssets, timingOf } from '@/lib/motion/renderers.js';
import { planExport } from '@/lib/motion/export.js';
import type { Category, Graphic, Params, ToggleKey } from '@/lib/motion/types';
import { ColorInput, Segmented, Slider, Switch, TextInput } from './motion-controls';
import { Stage, paint, settledTime, type Backdrop, type WinMode } from './motion-stage';
import { ExportPanel } from './motion-export';
import { MotionTabs } from './studio/motion-tabs';
import './motion-studio.css';

const groups: { id: Category; label: string }[] = [{ id: 'numbers', label: 'الأرقام' }, { id: 'repine', label: 'تصاميم ريبين' }, { id: 'frames', label: 'إطارات الفيديو' }];
const intro: Record<Category, string> = {
  numbers: 'أرقام وإحصاءات متحركة بخلفية شفافة، تُوضع فوق مقطعك.',
  repine: 'شرائط عناوين سفلية تنبثق من الشعار وتنكمش إليه عند الخروج.',
  frames: 'إطارات كاملة لإنستغرام بنافذة في المنتصف لمقطعك. نزّلها وضعها فوق الفيديو.',
};
const ratios = [{ value: '9:16', hint: 'ستوري وريلز' }, { value: '4:5', hint: 'منشور' }, { value: '1:1', hint: 'مربع' }, { value: '16:9', hint: 'أفقي' }];
const backdrops: { value: Backdrop; label: string }[] = [{ value: 'scene', label: 'مشهد' }, { value: 'alpha', label: 'شفاف' }, { value: 'dark', label: 'داكن' }, { value: 'light', label: 'فاتح' }];
const windows: { value: WinMode; label: string }[] = [{ value: 'sample', label: 'عينة' }, { value: 'video', label: 'مقطعي' }, { value: 'green', label: 'أخضر' }, { value: 'alpha', label: 'شفاف' }];
type TabId = 'content' | 'colors' | 'elements' | 'timing' | 'motion';
const tabMeta: Record<TabId, { label: string; icon: typeof Type }> = {
  content: { label: 'المحتوى', icon: Type }, colors: { label: 'الألوان', icon: Palette }, elements: { label: 'العناصر', icon: Layers },
  timing: { label: 'التوقيت', icon: Timer }, motion: { label: 'الحركة', icon: Activity },
};
const tabsFor = (c: Category): TabId[] => c === 'numbers' ? ['content', 'colors', 'timing'] : c === 'repine' ? ['content', 'colors', 'timing', 'motion'] : ['content', 'colors', 'elements', 'timing', 'motion'];

/* Thumbnails paint one at a time so the stage itself is never kept waiting behind them. */
const queue: (() => void)[] = []; let draining = false;
function enqueue(job: () => void) {
  queue.push(job);
  if (draining) return;
  draining = true;
  const next = () => { const run = queue.shift(); if (!run) { draining = false; return; } try { run(); } catch { /* a failed thumbnail stays blank */ } setTimeout(next, 20); };
  setTimeout(next, 60);
}

function Tile({ graphic, selected, disabled, onPick }: { graphic: Graphic; selected: boolean; disabled: boolean; onPick: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null), box = useRef<HTMLSpanElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const el = box.current, cv = canvas.current; if (!el || !cv) return;
    let cancelled = false, queued = false;
    const draw = () => { if (cancelled) return; paint(cv, graphic, graphic.defaults, settledTime(graphic, graphic.defaults), { area: graphic.category === 'frames' ? 72000 : 60000, backdrop: 'scene', win: 'sample', key: '#00ff00' }); setReady(true); };
    const io = new IntersectionObserver(entries => { if (!queued && entries.some(e => e.isIntersecting)) { queued = true; io.disconnect(); enqueue(draw); } }, { rootMargin: '200px' });
    io.observe(el); return () => { cancelled = true; io.disconnect(); };
  }, [graphic]);
  return <button type="button" className={`ms-tile ${selected ? 'on' : ''} ${graphic.category}`} aria-pressed={selected} disabled={disabled} onClick={onPick} data-template={graphic.id}>
    <span className={`ms-thumb ${ready ? 'ready' : ''}`} ref={box}><canvas ref={canvas} aria-hidden="true" />{graphic.badge && <em className={graphic.badge}>{graphic.badge === 'new' ? 'جديد' : 'مُحدَّث'}</em>}</span>
    <span className="ms-tile-name"><b>{graphic.name}</b></span>
  </button>;
}

function Rail({ items, selected, busy, onPick }: { items: Graphic[]; selected: string; busy: boolean; onPick: (g: Graphic) => void }) {
  const list = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => list.current?.scrollBy({ left: dir * (list.current.clientWidth * .8), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  useEffect(() => { list.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [selected]);
  return <div className="ms-rail">
    <button type="button" className="ms-rail-arrow" aria-label="القوالب السابقة" onClick={() => scroll(1)}><ChevronRight /></button>
    <div className="ms-rail-list" ref={list} role="group" aria-label="قوالب التصميم">{items.map(g => <Tile key={g.id} graphic={g} selected={g.id === selected} disabled={busy} onPick={() => onPick(g)} />)}</div>
    <button type="button" className="ms-rail-arrow" aria-label="القوالب التالية" onClick={() => scroll(-1)}><ChevronLeft /></button>
  </div>;
}

/** Opened from a work item (task 0.3.4.2, I-023): ?template=<id>&title=<text>&from=<work id>. */
function fromWork() {
  const q = new URLSearchParams(window.location.search);
  const g = catalog.find(item => item.id === q.get('template'));
  return { g, title: q.get('title') || '', work: q.get('from') || '' };
}

export default function MotionStudio() {
  const [start] = useState(fromWork);
  const [assetsReady, setAssetsReady] = useState(false), [assetError, setAssetError] = useState('');
  const [category, setCategory] = useState<Category>(start.g?.category || 'numbers');
  const [picked, setPicked] = useState<Record<Category, string>>({ numbers: 'count-up', repine: 'rp-gold', frames: 'fr-mihrab', ...(start.g ? { [start.g.category]: start.g.id } : {}) });
  // The work's title goes into the template's title field when it has one.
  const [drafts, setDrafts] = useState<Record<string, Params>>(() =>
    start.g && start.title && start.g.texts.some(t => t.key === 'title')
      ? { [start.g.id]: { ...start.g.defaults, title: start.title.slice(0, start.g.texts.find(t => t.key === 'title')!.max) } as Params }
      : {});
  const [tab, setTab] = useState<TabId>('content');
  const [backdrop, setBackdrop] = useState<Backdrop>('scene'), [win, setWin] = useState<WinMode>('sample'), [safe, setSafe] = useState(false);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null), [videoName, setVideoName] = useState('');
  const [keyColor, setKeyColor] = useState('#00ff00'), [busy, setBusy] = useState(false), [token, setToken] = useState(0);
  const time = useRef(0), fileInput = useRef<HTMLInputElement>(null), restartTimer = useRef(0), videoUrl = useRef('');
  const g = catalog.find(item => item.id === picked[category])!;
  const p = drafts[g.id] || g.defaults;
  const items = catalog.filter(item => item.category === category);
  const tabs = tabsFor(category), activeTab = tabs.includes(tab) ? tab : 'content';
  const frames = category === 'frames';

  const init = () => { setAssetError(''); loadAssets().then(() => setAssetsReady(true)).catch(() => setAssetError('تعذر تحميل شعار هداية والآيات. تحقق من الاتصال ثم أعد المحاولة.')); };
  useEffect(() => { init(); return () => { clearTimeout(restartTimer.current); if (videoUrl.current) URL.revokeObjectURL(videoUrl.current); }; }, []);

  const restart = useCallback(() => { clearTimeout(restartTimer.current); setToken(t => t + 1); }, []);
  const later = () => { clearTimeout(restartTimer.current); restartTimer.current = window.setTimeout(restart, 650); };
  const update = <K extends keyof Params>(key: K, value: Params[K], replay: 'none' | 'soon' = 'none') => {
    setDrafts(previous => ({ ...previous, [g.id]: { ...(previous[g.id] || g.defaults), [key]: value } }));
    if (replay === 'soon') later();
  };
  const choose = (graphic: Graphic) => { setPicked(previous => ({ ...previous, [graphic.category]: graphic.id })); time.current = 0; };
  const changeCategory = (next: Category) => { setCategory(next); time.current = 0; };
  const loadVideo = (file: File | undefined) => {
    if (!file) return;
    if (videoUrl.current) URL.revokeObjectURL(videoUrl.current);
    videoUrl.current = URL.createObjectURL(file);
    const v = document.createElement('video'); v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto'; v.src = videoUrl.current;
    setVideo(v); setVideoName(file.name); setWin('video');
  };
  const reset = () => { setDrafts(previous => { const next = { ...previous }; delete next[g.id]; return next; }); restart(); };
  const resetColors = () => setDrafts(previous => ({ ...previous, [g.id]: { ...(previous[g.id] || g.defaults), ...Object.fromEntries(g.colors.map(c => [c.key, g.defaults[c.key]])) } }));
  const plan = assetsReady ? planExport(g, p, { shortSide: 1080, fps: 30 }) : null;
  const total = timingOf(g, p).total / p.speed;

  const content = <>
    {g.value && <Slider label={g.value.label} value={p.value} min={g.value.min} max={g.value.max} step={g.value.step} box boxMax={g.value.boxMax} onChange={v => update('value', v, 'soon')} />}
    {g.texts.filter(t => (t.group === 'main' || !t.group) && !t.compact).map(t => <TextInput key={t.key} label={t.label} value={String(p[t.key])} max={t.max} hint={t.hint} placeholder={t.placeholder} ltr={t.ltr} onChange={v => update(t.key, v, 'soon')} />)}
    {category === 'numbers' && <div className="ms-pair">{g.texts.filter(t => t.compact).map(t => <TextInput key={t.key} label={t.label} value={String(p[t.key])} max={t.max} placeholder={t.placeholder} onChange={v => update(t.key, v, 'soon')} />)}</div>}
    {frames && g.toggles.some(t => t.key === 'showContact') && <fieldset className="ms-group"><legend>معلومات التواصل</legend>
      <Switch label="إظهار عبارة ورقم التواصل" checked={p.showContact} onChange={v => update('showContact', v, 'soon')} />
      {p.showContact && g.texts.filter(t => t.group === 'contact').map(t => <TextInput key={t.key} label={t.label} value={String(p[t.key])} max={t.max} ltr={t.ltr} placeholder={t.placeholder} onChange={v => update(t.key, v, 'soon')} />)}
    </fieldset>}
    {frames && g.toggles.some(t => t.key === 'showSocial') && <fieldset className="ms-group"><legend>حسابات التواصل</legend>
      <Switch label="إظهار الحسابات والموقع" checked={p.showSocial} onChange={v => update('showSocial', v, 'soon')} />
      {p.showSocial && g.texts.filter(t => t.group === 'social').map(t => <TextInput key={t.key} label={t.label} value={String(p[t.key])} max={t.max} ltr={t.ltr} placeholder={t.placeholder} onChange={v => update(t.key, v, 'soon')} />)}
    </fieldset>}
  </>;
  const colorsTab = <>
    <div className="ms-colors">{g.colors.map(c => <ColorInput key={c.key} label={c.label} value={String(p[c.key])} onChange={v => update(c.key, v)} />)}</div>
    {category === 'numbers' && <Switch label="التوهج حول الأرقام" checked={p.glow} onChange={v => update('glow', v)} hint="أوقفه إذا ظهر هالة خضراء عند إزالة اللون الأخضر" />}
    <button type="button" className="ms-link" onClick={resetColors}><RotateCcw />استعادة الألوان الأصلية</button>
  </>;
  const elementsTab = <div className="ms-switches">{g.toggles.filter(t => t.key !== 'showContact' && t.key !== 'showSocial').map(t => <Switch key={t.key} label={t.label} checked={Boolean(p[t.key as ToggleKey])} onChange={v => update(t.key as ToggleKey, v)} />)}</div>;
  const timingTab = <>
    {category === 'numbers'
      ? <Slider label="مدة الثبات في النهاية" value={p.hold} min={0} max={6} step={.25} unit="ث" decimals={2} box onChange={v => update('hold', v)} onCommit={restart} />
      : <>
        <Slider label="مدة الدخول" value={p.tIn} min={.6} max={8} step={.1} unit="ث" decimals={1} onChange={v => update('tIn', v)} onCommit={restart} />
        <Slider label={frames ? 'مدة العرض (بطول مقطعك)' : 'مدة العرض'} value={p.tHold} min={0} max={frames ? 180 : 20} step={.5} unit="ث" decimals={1} box={frames} boxMax={frames ? 900 : undefined} onChange={v => update('tHold', v)} onCommit={restart}
          hint={frames ? 'اجعلها بطول المقطع الذي ستضعه داخل النافذة.' : undefined} />
        <Slider label="مدة الخروج" value={p.tOut} min={frames ? 0 : .6} max={6} step={.1} unit="ث" decimals={1} onChange={v => update('tOut', v)} onCommit={restart} hint={frames ? 'صفر يعني أن يبقى الإطار ظاهراً حتى نهاية الفيديو.' : undefined} />
      </>}
    <Slider label="سرعة التشغيل" value={p.speed} min={.25} max={category === 'numbers' ? 3 : 2} step={.05} format={v => `${v.toFixed(2)}×`} onChange={v => update('speed', v)} onCommit={restart} />
    <p className="ms-total">المدة الكلية للملف: <bdi dir="ltr">{total.toFixed(1)}</bdi> ثانية</p>
  </>;
  const motionTab = <>
    <p className="ms-tip">كلما زادت النسبة زادت المبالغة في الارتداد والتمايل. صفر يعطي حركة هادئة بلا ارتداد.</p>
    <Slider label="حركة الدخول" value={p.mIn} min={0} max={100} step={1} unit="٪" onChange={v => update('mIn', v)} onCommit={restart} />
    <Slider label="حركة الخروج" value={p.mOut} min={0} max={100} step={1} unit="٪" onChange={v => update('mOut', v)} onCommit={restart} />
    <Slider label="حركة العرض (الهدوء الحي)" value={p.mIdle} min={0} max={100} step={1} unit="٪" onChange={v => update('mIdle', v)} hint="تمايل خفيف ولمعان أثناء بقاء التصميم على الشاشة." />
  </>;
  const panels: Record<TabId, React.ReactNode> = { content, colors: colorsTab, elements: elementsTab, timing: timingTab, motion: motionTab };

  return <div className="ms">
    <Title title="استوديو الحركة" sub={start.work ? `مفتوح من العمل ${start.work} بقالب مقترح. ${intro[category]}` : intro[category]}>
      <MotionTabs active="templates" />
      <Link href="/media" className="button">مكتبة الوسائط</Link>
    </Title>
    <Tabs items={groups.map(group => ({ id: group.id, label: `${group.label} (${catalog.filter(item => item.category === group.id).length})` }))} value={category} onChange={value => changeCategory(value as Category)} />
    {assetError ? <div className="panel"><p role="alert">{assetError}</p><button onClick={init}>إعادة المحاولة</button></div>
      : !assetsReady ? <div className="ms-loading" role="status"><span className="skeleton" />جارٍ تجهيز القوالب…</div> : <>
        <Rail items={items} selected={g.id} busy={busy} onPick={choose} />
        <section className="ms-workbench" aria-label="تخصيص التصميم">
          <div className="ms-preview">
            <div className="ms-preview-head">
              <div><h2>{g.name}{g.badge && <em className={`ms-badge ${g.badge}`}>{g.badge === 'new' ? 'جديد' : 'مُحدَّث'}</em>}</h2><p>{g.blurb}</p></div>
            </div>
            {frames && <div className="ms-ratios">
              <Segmented label="أبعاد الإطار" value={p.ratio} disabled={busy} onChange={v => { update('ratio', v); }} options={ratios.map(r => {
                const [w, h] = r.value.split(':').map(Number), k = 18 / Math.max(w, h);
                return { value: r.value, hint: r.hint, label: <><i className="ratio-glyph" style={{ width: w * k, height: h * k }} /><span><b dir="ltr">{r.value}</b><small>{r.hint}</small></span></> };
              })} />
              {plan && <p className="ms-size">الملف عند 1080p: عرض <bdi dir="ltr">{plan.w}</bdi> × ارتفاع <bdi dir="ltr">{plan.h}</bdi> بكسل</p>}
            </div>}
            <Stage g={g} p={p} backdrop={backdrop} win={win} video={video} safe={safe && p.ratio === '9:16'} keyColor={keyColor} token={token} busy={busy} time={time} />
            <div className="ms-viewopts">
              {frames ? <>
                <Segmented label="ما يظهر داخل النافذة" size="sm" value={win} onChange={v => { if (v === 'video' && !video) fileInput.current?.click(); else setWin(v); }} options={windows} />
                <div className="ms-viewrow">
                  <button type="button" className="ms-chip-btn" onClick={() => fileInput.current?.click()}><Upload />{videoName ? 'تغيير مقطع المعاينة' : 'تحميل مقطع للمعاينة'}</button>
                  {videoName && <bdi dir="ltr" className="ms-file" title={videoName}>{videoName}</bdi>}
                  {p.ratio === '9:16' && <Switch label="مناطق واجهة ريلز" checked={safe} onChange={setSafe} hint="يظلل المناطق التي قد تغطيها أزرار إنستغرام" />}
                </div>
                <input ref={fileInput} type="file" accept="video/*" hidden onChange={e => { loadVideo(e.target.files?.[0]); e.target.value = ''; }} />
              </> : <Segmented label="خلفية المعاينة" size="sm" value={backdrop} onChange={setBackdrop} options={backdrops} />}
              <p className="ms-hint">{frames ? 'المقطع يظهر في المعاينة فقط ولا يدخل في الملف المنزَّل.' : backdrop === 'alpha' ? 'المربعات تعني شفافية، ولا تظهر في الملف.' : 'الخلفية للمعاينة فقط، والملف المنزَّل يبقى شفافاً.'}</p>
            </div>
          </div>
          <aside className="ms-settings" aria-label="إعدادات القالب"><div className="ms-settings-inner">
            <div className="ms-tablist" role="tablist" aria-label="أقسام الإعدادات">
              {tabs.map(id => { const I = tabMeta[id].icon; return <button key={id} role="tab" type="button" id={`ms-tab-${id}`} aria-selected={activeTab === id} aria-controls="ms-panel" className={activeTab === id ? 'on' : ''} onClick={() => setTab(id)}><I />{tabMeta[id].label}</button>; })}
            </div>
            <fieldset className="ms-panel" id="ms-panel" role="tabpanel" aria-labelledby={`ms-tab-${activeTab}`} disabled={busy}>{panels[activeTab]}</fieldset>
            <button type="button" className="ms-reset" disabled={busy} onClick={reset}><RotateCcw />إعادة ضبط هذا التصميم</button>
          </div></aside>
        </section>
        <ExportPanel g={g} p={p} time={time} keyColor={keyColor} onKeyColor={setKeyColor} onBusy={setBusy} />
      </>}
  </div>;
}

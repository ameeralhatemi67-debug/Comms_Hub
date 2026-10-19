'use client';

// The studio's inspector (MVP_draft.md 62): the selected clip's settings (time, place, size, turn,
// opacity, crop, adjustments, fades, sound, cross-fade), a text's style, a motion template's own
// fields (from the template tab's catalog, with its controls), a brand mark's colour; with nothing
// selected, the project's shape, frame rate and background, the device cache and the keys.
import type { ReactNode } from 'react';
import { Copy, Scissors, Trash2, ArrowLeftToLine, Frame, RotateCcw } from 'lucide-react';
import {
  FONTS, FPS_CHOICES, RATIOS, STICKERS, STICKER_LABELS, US, canvasOf, durationOf,
  type Clip, type Crop, type Layer, type ProjectDoc, type Ratio, type TextStyle, type Transform,
} from '@/lib/studio/schema';
import { changedParams, graphicById, motionParams, naturalLength, holdKey } from '@/lib/studio/motion-adapter';
import { setFormat, sourceOf } from '@/lib/studio/timeline';
import { shortTime } from '@/lib/studio/time';
import { transformOf } from '@/lib/studio/compose';
import { ColorInput, Segmented, Slider, Switch, TextInput } from '../motion-controls';

export type Patch = (patch: Partial<Clip> | ((c: Clip) => Clip), label: string, key?: string) => void;

const sec = (us: number) => Math.round((us / US) * 100) / 100;
const usOf = (s: number) => Math.round(s * US);

function Section({ title, children, open = true }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="st-sec" open={open}>
      <summary>{title}</summary>
      <div className="st-sec-body">{children}</div>
    </details>
  );
}

/** Place, size, turn and opacity of a clip or layer. */
export function TransformControls({ item, W, H, onChange, disabled }: { item: Clip | Layer; W: number; H: number; onChange: (t: Transform, key: string) => void; disabled: boolean }) {
  const tr = transformOf(item, W, H);
  const set = (k: keyof Transform, v: number) => onChange({ ...tr, [k]: v }, `transform-${k}-${item.id}`);
  return (
    <>
      <Slider label="الموضع أفقياً" value={Math.round(tr.x)} min={-W / 2} max={W * 1.5} step={1} unit="px" onChange={(v) => set('x', v)} disabled={disabled} box />
      <Slider label="الموضع عمودياً" value={Math.round(tr.y)} min={-H / 2} max={H * 1.5} step={1} unit="px" onChange={(v) => set('y', v)} disabled={disabled} box />
      <Slider label="الحجم" value={Math.round(tr.scale * 100)} min={5} max={400} step={1} unit="٪" onChange={(v) => set('scale', v / 100)} disabled={disabled} box />
      <Slider label="الدوران" value={Math.round(tr.rotation)} min={-180} max={180} step={1} unit="°" onChange={(v) => set('rotation', v)} disabled={disabled} />
      <Slider label="الشفافية" value={Math.round(tr.opacity * 100)} min={0} max={100} step={1} unit="٪" onChange={(v) => set('opacity', v / 100)} disabled={disabled} />
      <button type="button" className="st-mini" disabled={disabled} onClick={() => onChange({ x: W / 2, y: H / 2, scale: 1, rotation: 0, opacity: tr.opacity }, `transform-reset-${item.id}`)}>
        <RotateCcw aria-hidden="true" />
        إلى المنتصف وبالحجم الأصلي
      </button>
    </>
  );
}

export function CropControls({ crop, onChange, disabled }: { crop: Crop | undefined; onChange: (c: Crop, key: string) => void; disabled: boolean }) {
  const c = crop ?? { l: 0, t: 0, r: 0, b: 0 };
  const set = (k: keyof Crop, v: number) => onChange({ ...c, [k]: v / 100 }, `crop-${k}`);
  return (
    <>
      <Slider label="قص من اليمين" value={Math.round(c.r * 100)} min={0} max={45} step={1} unit="٪" onChange={(v) => set('r', v)} disabled={disabled} />
      <Slider label="قص من اليسار" value={Math.round(c.l * 100)} min={0} max={45} step={1} unit="٪" onChange={(v) => set('l', v)} disabled={disabled} />
      <Slider label="قص من الأعلى" value={Math.round(c.t * 100)} min={0} max={45} step={1} unit="٪" onChange={(v) => set('t', v)} disabled={disabled} />
      <Slider label="قص من الأسفل" value={Math.round(c.b * 100)} min={0} max={45} step={1} unit="٪" onChange={(v) => set('b', v)} disabled={disabled} />
    </>
  );
}

const ALIGN_LABELS = { start: 'بداية السطر', center: 'وسط', end: 'نهاية السطر' } as const;
const MOTION_LABELS = { none: 'بلا', fade: 'ظهور', rise: 'صعود', slide: 'انزلاق' } as const;

export function TextControls({ style, onChange, disabled, timed }: { style: TextStyle; onChange: (s: TextStyle, label: string, key: string) => void; disabled: boolean; timed: boolean }) {
  const set = <K extends keyof TextStyle>(k: K, v: TextStyle[K], label = 'تنسيق النص') => onChange({ ...style, [k]: v }, label, `text-${String(k)}`);
  const font = FONTS.find((f) => f.family === style.font) ?? FONTS[0];
  return (
    <>
      <label className="st-textarea">
        النص
        <textarea value={style.content} dir="auto" rows={3} maxLength={600} disabled={disabled} onChange={(e) => set('content', e.target.value, 'تعديل النص')} />
      </label>
      <label>
        الخط
        <select value={style.font} disabled={disabled} onChange={(e) => {
          const f = FONTS.find((x) => x.family === e.target.value)!;
          onChange({ ...style, font: f.family, weight: (f.weights as readonly number[]).includes(style.weight) ? style.weight : f.weights[f.weights.length - 1] }, 'الخط', 'text-font');
        }}>
          {FONTS.map((f) => (
            <option key={f.family} value={f.family}>{f.label}</option>
          ))}
        </select>
      </label>
      {font.weights.length > 1 && (
        <Segmented label="السماكة" size="sm" value={style.weight} onChange={(v) => set('weight', v)} disabled={disabled} options={font.weights.map((w) => ({ value: w, label: String(w) }))} />
      )}
      <Slider label="حجم الخط" value={style.size} min={14} max={320} step={1} unit="px" onChange={(v) => set('size', v)} disabled={disabled} box />
      <ColorInput label="لون النص" value={style.color} onChange={(v) => set('color', v)} disabled={disabled} />
      <Segmented label="المحاذاة" size="sm" value={style.align} onChange={(v) => set('align', v)} disabled={disabled} options={(['start', 'center', 'end'] as const).map((a) => ({ value: a, label: ALIGN_LABELS[a] }))} />
      <Slider label="عرض مربع النص" value={Math.round(style.width * 100)} min={15} max={100} step={1} unit="٪" onChange={(v) => set('width', v / 100)} disabled={disabled} />
      <Slider label="تباعد الأسطر" value={style.lineHeight} min={1} max={2.2} step={0.05} decimals={2} onChange={(v) => set('lineHeight', v)} disabled={disabled} />
      <Switch label="خلفية خلف النص" checked={!!style.box} onChange={(on) => set('box', on ? { color: '#000000', opacity: 0.6, padding: 18, radius: 12 } : null)} disabled={disabled} />
      {style.box && (
        <>
          <ColorInput label="لون الخلفية" value={style.box.color} onChange={(v) => set('box', { ...style.box!, color: v })} disabled={disabled} />
          <Slider label="عتامة الخلفية" value={Math.round(style.box.opacity * 100)} min={5} max={100} step={1} unit="٪" onChange={(v) => set('box', { ...style.box!, opacity: v / 100 })} disabled={disabled} />
          <Slider label="الهامش" value={style.box.padding} min={0} max={80} step={1} unit="px" onChange={(v) => set('box', { ...style.box!, padding: v })} disabled={disabled} />
        </>
      )}
      <Switch label="إطار حول الحروف" checked={!!style.stroke} onChange={(on) => set('stroke', on ? { color: '#000000', width: 3 } : null)} disabled={disabled} />
      {style.stroke && (
        <>
          <ColorInput label="لون الإطار" value={style.stroke.color} onChange={(v) => set('stroke', { ...style.stroke!, color: v })} disabled={disabled} />
          <Slider label="سماكة الإطار" value={style.stroke.width} min={1} max={16} step={1} unit="px" onChange={(v) => set('stroke', { ...style.stroke!, width: v })} disabled={disabled} />
        </>
      )}
      <Switch label="ظل" checked={!!style.shadow} onChange={(on) => set('shadow', on ? { color: 'rgba(0,0,0,0.55)', blur: 12 } : null)} disabled={disabled} />
      {timed && (
        <>
          <Segmented label="الدخول" size="sm" value={style.enter ?? 'none'} onChange={(v) => set('enter', v)} disabled={disabled} options={(['none', 'fade', 'rise', 'slide'] as const).map((k) => ({ value: k, label: MOTION_LABELS[k] }))} />
          <Segmented label="الخروج" size="sm" value={style.exit ?? 'none'} onChange={(v) => set('exit', v)} disabled={disabled} options={(['none', 'fade', 'rise', 'slide'] as const).map((k) => ({ value: k, label: MOTION_LABELS[k] }))} />
        </>
      )}
    </>
  );
}

/** A motion template's own fields, from the template tab's catalog. The clip's length sets the showcase. */
export function MotionControls({ item, ratio, onParams, onLength, disabled, timed }: { item: Clip | Layer; ratio: Ratio; onParams: (params: Record<string, unknown>, label: string, key: string) => void; onLength?: (us: number) => void; disabled: boolean; timed: boolean }) {
  const g = graphicById(item.motion!.template);
  if (!g) return <p className="st-hint">هذا القالب لم يعد موجوداً في «قوالب الحركة»، فيبقى في المشروع كما هو دون رسم.</p>;
  const p = motionParams(g, item.motion!.params, ratio);
  const set = (k: string, v: unknown, label = 'إعدادات القالب') => onParams(changedParams(g, { ...p, [k]: v } as typeof p), label, `motion-${k}`);
  const showGroup = (group?: string) => (group === 'contact' ? p.showContact : group === 'social' ? p.showSocial : true);
  const toggleOn = (k: string) => (p as Record<string, unknown>)[k] as boolean;
  return (
    <>
      <p className="st-hint">{g.blurb}</p>
      {g.value && <Slider label={g.value.label} value={p.value} min={g.value.min} max={g.value.max} step={g.value.step} onChange={(v) => set('value', v)} disabled={disabled} box boxMax={g.value.boxMax} />}
      {g.texts.filter((f) => showGroup(f.group)).map((f) => (
        <TextInput key={f.key} label={f.label} value={String(p[f.key] ?? '')} max={f.max} ltr={f.ltr} placeholder={f.placeholder} hint={f.hint} disabled={disabled} onChange={(v) => set(f.key, v, 'نص القالب')} />
      ))}
      {g.colors.map((c) => (
        <ColorInput key={c.key} label={c.label} value={String(p[c.key])} onChange={(v) => set(c.key, v, 'لون القالب')} disabled={disabled} />
      ))}
      {g.toggles.map((tg) => (
        <Switch key={tg.key} label={tg.label} checked={toggleOn(tg.key)} onChange={(v) => set(tg.key, v)} disabled={disabled} />
      ))}
      {g.category !== 'numbers' && (
        <>
          <Slider label="مدة الدخول" value={p.tIn} min={0.3} max={6} step={0.1} decimals={1} unit="ث" onChange={(v) => set('tIn', v)} disabled={disabled} />
          <Slider label="مدة الخروج" value={p.tOut} min={0} max={6} step={0.1} decimals={1} unit="ث" onChange={(v) => set('tOut', v)} disabled={disabled} hint={g.category === 'frames' ? 'صفر يبقي الإطار حتى النهاية.' : undefined} />
          <Slider label="حركة الدخول" value={p.mIn} min={0} max={100} step={1} unit="٪" onChange={(v) => set('mIn', v)} disabled={disabled} />
          <Slider label="حركة الخروج" value={p.mOut} min={0} max={100} step={1} unit="٪" onChange={(v) => set('mOut', v)} disabled={disabled} />
          <Slider label="حركة العرض" value={p.mIdle} min={0} max={100} step={1} unit="٪" onChange={(v) => set('mIdle', v)} disabled={disabled} />
        </>
      )}
      <Slider label="السرعة" value={p.speed} min={0.25} max={3} step={0.05} decimals={2} unit="×" onChange={(v) => set('speed', v)} disabled={disabled} />
      {timed && onLength && (
        <button type="button" className="st-mini" disabled={disabled} onClick={() => onLength(naturalLength(g, { ...p, [holdKey(g)]: g.defaults[holdKey(g)] }))}>
          طول القالب الأصلي ({shortTime(naturalLength(g, { ...p, [holdKey(g)]: g.defaults[holdKey(g)] }))})
        </button>
      )}
      <button type="button" className="st-mini" disabled={disabled} onClick={() => onParams({}, 'إعادة القالب إلى أصله', 'motion-reset')}>
        <RotateCcw aria-hidden="true" />
        إعادة القالب إلى أصله
      </button>
    </>
  );
}

export function Inspector({
  doc, clip, onClip, onDoc, readOnly, actions, canFillWindow, hasPrevAdjacent, cachePanel, sourceNote, onLength,
}: {
  doc: ProjectDoc;
  clip: Clip | null;
  onClip: Patch;
  onDoc: (doc: ProjectDoc, label: string, key?: string) => void;
  readOnly: boolean;
  actions: { split: () => void; duplicate: () => void; remove: () => void; ripple: () => void; fillWindow: () => void; setTransition: (us: number | null) => void; setStart: (us: number) => void; setLength: (us: number) => void };
  canFillWindow: boolean;
  hasPrevAdjacent: boolean;
  cachePanel: ReactNode;
  sourceNote: string | null;
  onLength: (us: number) => void;
}) {
  const { w: W, h: H } = canvasOf(doc);
  const ratio = doc.video?.ratio ?? '9:16';
  if (!clip)
    return (
      <aside className="st-insp" aria-label="الإعدادات">
        <Section title="المشروع">
          <Segmented label="شكل الإطار" size="sm" value={ratio} disabled={readOnly} onChange={(v) => onDoc(setFormat(doc, { ratio: v }), 'شكل الإطار')} options={(Object.keys(RATIOS) as Ratio[]).map((r) => ({ value: r, label: RATIOS[r].label, hint: `${RATIOS[r].w}×${RATIOS[r].h}` }))} />
          <Segmented label="الإطارات في الثانية" size="sm" value={doc.video?.fps ?? 30} disabled={readOnly} onChange={(v) => onDoc(setFormat(doc, { fps: v }), 'الإطارات في الثانية')} options={FPS_CHOICES.map((f) => ({ value: f, label: String(f) }))} />
          <ColorInput label="لون الخلفية" value={doc.video?.background ?? '#000000'} disabled={readOnly} onChange={(v) => onDoc(setFormat(doc, { background: v }), 'لون الخلفية', 'bg')} />
          <p className="st-hint">المدة {shortTime(durationOf(doc))} · <bdi dir="ltr">{W}×{H}</bdi></p>
        </Section>
        {cachePanel}
        <Section title="مفاتيح سريعة" open={false}>
          <ul className="st-keys">
            <li><kbd>المسافة</kbd> تشغيل وإيقاف</li>
            <li><kbd>S</kbd> قص المقطع المحدد عند رأس التشغيل</li>
            <li><kbd>Delete</kbd> حذف، و<kbd>Shift+Delete</kbd> حذف مع سد الفراغ</li>
            <li><kbd>Ctrl+D</kbd> نسخ المقطع</li>
            <li><kbd>Ctrl+Z</kbd> تراجع، و<kbd>Ctrl+Shift+Z</kbd> إعادة</li>
            <li><kbd>←</kbd> <kbd>→</kbd> إطار، ومع <kbd>Shift</kbd> ثانية</li>
          </ul>
        </Section>
      </aside>
    );

  const src = sourceOf(doc, clip.source);
  const media = src?.media;
  const audible = media === 'video' || media === 'audio';
  const visual = media !== 'audio';
  const label = clip.text ? 'نص' : clip.motion ? 'قالب حركة' : clip.sticker ? 'علامة الهوية' : media === 'image' ? 'صورة' : media === 'audio' ? 'صوت' : 'فيديو';
  return (
    <aside className="st-insp" aria-label="إعدادات المقطع">
      <div className="st-insp-head">
        <b>{label}</b>
        <small dir="auto">{clip.text?.content.split('\n')[0] ?? (clip.motion ? graphicById(clip.motion.template)?.name : src?.name) ?? ''}</small>
        {sourceNote && <p className="st-hint st-warn">{sourceNote}</p>}
        <div className="st-insp-acts">
          <button type="button" onClick={actions.split} disabled={readOnly} title="قص عند رأس التشغيل (S)"><Scissors aria-hidden="true" />قص</button>
          <button type="button" onClick={actions.duplicate} disabled={readOnly} title="نسخ (Ctrl+D)"><Copy aria-hidden="true" />نسخ</button>
          <button type="button" onClick={actions.remove} disabled={readOnly} title="حذف (Delete)"><Trash2 aria-hidden="true" />حذف</button>
          <button type="button" onClick={actions.ripple} disabled={readOnly} title="حذف مع سد الفراغ (Shift+Delete)"><ArrowLeftToLine aria-hidden="true" />حذف وسد الفراغ</button>
        </div>
      </div>
      <Section title="التوقيت">
        <Slider label="البداية" value={sec(clip.start)} min={0} max={Math.max(60, sec(durationOf(doc)) + 30)} step={0.01} decimals={2} unit="ث" box boxMax={36000} disabled={readOnly} onChange={(v) => actions.setStart(usOf(v))} />
        <Slider label="المدة" value={sec(clip.length)} min={0.04} max={Math.max(30, sec(clip.length) * 2)} step={0.01} decimals={2} unit="ث" box boxMax={36000} disabled={readOnly} onChange={(v) => actions.setLength(usOf(v))} />
        {visual && (
          <>
            <Slider label="ظهور تدريجي" value={sec(clip.fadeIn ?? 0)} min={0} max={3} step={0.05} decimals={2} unit="ث" disabled={readOnly || !!clip.transition} onChange={(v) => onClip({ fadeIn: usOf(v) }, 'ظهور تدريجي', 'fadeIn')} hint={clip.transition ? 'يظهر بالمزج مع المقطع السابق.' : undefined} />
            <Slider label="اختفاء تدريجي" value={sec(clip.fadeOut ?? 0)} min={0} max={3} step={0.05} decimals={2} unit="ث" disabled={readOnly} onChange={(v) => onClip({ fadeOut: usOf(v) }, 'اختفاء تدريجي', 'fadeOut')} />
          </>
        )}
        {(hasPrevAdjacent || clip.transition) && (
          <Slider label="مزج مع المقطع السابق" value={sec(clip.transition?.length ?? 0)} min={0} max={2} step={0.05} decimals={2} unit="ث" disabled={readOnly} onChange={(v) => actions.setTransition(v > 0 ? usOf(v) : null)} hint="يتداخل المقطعان بهذه المدة، ويُمزج الصوت معهما." />
        )}
      </Section>
      {clip.text && (
        <Section title="النص">
          <TextControls style={clip.text} timed disabled={readOnly} onChange={(s, l, k) => onClip({ text: s }, l, k)} />
        </Section>
      )}
      {clip.motion && (
        <Section title="القالب">
          <MotionControls item={clip} ratio={ratio} timed disabled={readOnly} onParams={(params, l, k) => onClip((c) => ({ ...c, motion: { template: c.motion!.template, params } }), l, k)} onLength={onLength} />
        </Section>
      )}
      {clip.sticker && (
        <Section title="العلامة">
          <Segmented label="العلامة" size="sm" value={clip.sticker.key} disabled={readOnly} onChange={(v) => onClip({ sticker: { ...clip.sticker!, key: v } }, 'العلامة')} options={STICKERS.map((k) => ({ value: k, label: STICKER_LABELS[k] }))} />
          <ColorInput label="اللون" value={clip.sticker.color} disabled={readOnly} onChange={(v) => onClip({ sticker: { ...clip.sticker!, color: v } }, 'لون العلامة', 'sticker-color')} />
        </Section>
      )}
      {visual && (
        <Section title="الموضع والحجم">
          <TransformControls item={clip} W={W} H={H} disabled={readOnly} onChange={(tr, key) => onClip({ transform: tr }, 'الموضع والحجم', key)} />
          {(media === 'video' || media === 'image' || clip.motion) && (
            <Segmented label="داخل الإطار" size="sm" value={clip.fit ?? 'contain'} disabled={readOnly} onChange={(v) => onClip({ fit: v }, 'الاحتواء')} options={[{ value: 'contain', label: 'احتواء كامل' }, { value: 'cover', label: 'ملء الإطار' }]} />
          )}
          {canFillWindow && (
            <button type="button" className="st-mini" disabled={readOnly} onClick={actions.fillWindow}>
              <Frame aria-hidden="true" />
              ضع الفيديو داخل نافذة الإطار
            </button>
          )}
        </Section>
      )}
      {(media === 'video' || media === 'image') && (
        <>
          <Section title="القص" open={false}>
            <CropControls crop={clip.crop} disabled={readOnly} onChange={(c, key) => onClip({ crop: c }, 'القص', key)} />
          </Section>
          <Section title="الألوان" open={false}>
            <Slider label="السطوع" value={clip.adjust?.brightness ?? 0} min={-100} max={100} step={1} disabled={readOnly} onChange={(v) => onClip((c) => ({ ...c, adjust: { brightness: v, contrast: c.adjust?.contrast ?? 0, saturation: c.adjust?.saturation ?? 0 } }), 'السطوع', 'adj-b')} />
            <Slider label="التباين" value={clip.adjust?.contrast ?? 0} min={-100} max={100} step={1} disabled={readOnly} onChange={(v) => onClip((c) => ({ ...c, adjust: { brightness: c.adjust?.brightness ?? 0, contrast: v, saturation: c.adjust?.saturation ?? 0 } }), 'التباين', 'adj-c')} />
            <Slider label="التشبع" value={clip.adjust?.saturation ?? 0} min={-100} max={100} step={1} disabled={readOnly} onChange={(v) => onClip((c) => ({ ...c, adjust: { brightness: c.adjust?.brightness ?? 0, contrast: c.adjust?.contrast ?? 0, saturation: v } }), 'التشبع', 'adj-s')} />
          </Section>
        </>
      )}
      {audible && (
        <Section title="الصوت">
          <Slider label="مستوى الصوت" value={Math.round((clip.volume ?? 1) * 100)} min={0} max={200} step={1} unit="٪" disabled={readOnly || !!clip.mute} onChange={(v) => onClip({ volume: v / 100 }, 'مستوى الصوت', 'volume')} hint={(clip.volume ?? 1) > 1 ? 'ما فوق 100٪ يُسمع في الملف المصدَّر، والمعاينة تقف عند 100٪.' : undefined} />
          <Switch label="كتم صوت هذا المقطع" checked={!!clip.mute} onChange={(v) => onClip({ mute: v }, 'كتم الصوت')} disabled={readOnly} />
          {media === 'audio' && (
            <>
              <Slider label="ظهور تدريجي للصوت" value={sec(clip.fadeIn ?? 0)} min={0} max={5} step={0.05} decimals={2} unit="ث" disabled={readOnly} onChange={(v) => onClip({ fadeIn: usOf(v) }, 'ظهور تدريجي', 'fadeIn')} />
              <Slider label="اختفاء تدريجي للصوت" value={sec(clip.fadeOut ?? 0)} min={0} max={5} step={0.05} decimals={2} unit="ث" disabled={readOnly} onChange={(v) => onClip({ fadeOut: usOf(v) }, 'اختفاء تدريجي', 'fadeOut')} />
            </>
          )}
        </Section>
      )}
    </aside>
  );
}

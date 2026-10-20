'use client';

// The studio's inspector (MVP_draft.md 62): the selected clip's settings (time, place, size, turn,
// opacity, crop, adjustments, sound), its transition from the clip before it and its entry and exit
// movements (transitions.ts), a text's style and font (fonts.ts), a motion template's own fields (from
// the template tab's catalog, with its controls), a brand mark's colour. The project's shape, frame rate
// and background are the window «المشروع» (ProjectSettings).
import type { ReactNode } from 'react';
import { Copy, Scissors, Trash2, ArrowLeftToLine, Frame, RotateCcw, MousePointerClick, Blend, Diamond, ChevronLeft, ChevronRight, Snowflake, KeyRound, Pin } from 'lucide-react';
import {
  FPS_CHOICES, RATIOS, STICKERS, STICKER_LABELS, US, canvasOf, durationOf,
  type Clip, type Cover, type Crop, type Layer, type ProjectDoc, type Ratio, type TextStyle, type Track, type Transform,
} from '@/lib/studio/schema';
import { WEIGHT_LABELS, fontDef, nearestWeight } from '@/lib/studio/fonts';
import { ANIMATIONS, DEFAULT_ANIM_LENGTH, DEFAULT_TRANSITION, ENTER_NONE, TRANSITIONS, entryOf, entryPatch, type EnterValue, type TransitionKind } from '@/lib/studio/transitions';
import { withKeys } from '@/lib/studio/shortcuts';
import { changedParams, graphicById, motionParams, naturalLength, holdKey } from '@/lib/studio/motion-adapter';
import { DUCK_MAX, roleOf, setFormat, sourceOf } from '@/lib/studio/timeline';
import { shortTime } from '@/lib/studio/time';
import { transformOf } from '@/lib/studio/compose';
import { HOLD } from '@/lib/kit/hold-reasons';
import { EASES, KEY_TOLERANCE, MOTION_PROPS, hasKeys, keyAt, keyTimes, transformWithKeys, writeTransform as writeTransformKeys, type Ease, type KeyProp, type Keys, type MotionProp } from '@/lib/studio/keys';
import { SPEED_MAX, SPEED_MIN, isHold, retimed, speedAt } from '@/lib/studio/speed';
import { COVER_MODES, COVER_SHAPES } from '@/lib/studio/cover';
import { EXTRA_SHAPES_MAX, setShapes, shapesOf } from '@/lib/studio/reframe';
import { ColorInput, Segmented, Slider, Switch, TextInput } from '../motion-controls';
import { DesktopOnly } from './compact';
import { FontPicker } from './font-picker';

export type Patch = (patch: Partial<Clip> | ((c: Clip) => Clip), label: string, key?: string) => void;

/** A clip's place, size, turn or opacity changed at clip time tau: keyed settings get their key there. */
export function writeClipTransform(c: Clip, tau: number, changed: Partial<Transform>, W: number, H: number): Clip {
  const r = writeTransformKeys(transformOf(c, W, H), c.keys, tau, changed);
  const next: Clip = { ...c, transform: r.transform, keys: r.keys };
  if (!next.keys) delete next.keys;
  return next;
}

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

/** Keyframes of a timed clip, for its settings: where the playhead is in the clip, and the switch. */
export type Keying = {
  /** The playhead's time inside the clip. */
  tau: number;
  keys: Keys | undefined;
  onToggle: (prop: KeyProp) => void;
};

/** The key switch beside a setting: filled when a key is at the playhead. */
function KeyButton({ prop, keying, disabled }: { prop: KeyProp; keying?: Keying; disabled: boolean }) {
  if (!keying) return null;
  const on = !!keyAt(keying.keys?.[prop], keying.tau);
  const keyed = hasKeys(keying.keys, prop);
  const label = on ? 'إزالة المفتاح عند رأس التشغيل' : 'مفتاح عند رأس التشغيل';
  return (
    <button type="button" className="st-keybtn" data-on={on ? 'yes' : 'no'} data-keyed={keyed ? 'yes' : 'no'} aria-pressed={on} disabled={disabled} onClick={() => keying.onToggle(prop)} title={label} aria-label={label}>
      <Diamond aria-hidden="true" />
    </button>
  );
}

/**
 * Place, size, turn and opacity of a clip or layer. With `keying` (a timed clip), the values shown are those
 * at the playhead and each setting has its key switch; a change to a keyed setting sets its key there.
 */
export function TransformControls({ item, W, H, onChange, disabled, keying }: { item: Clip | Layer; W: number; H: number; onChange: (t: Transform, key: string, changed: Partial<Transform>) => void; disabled: boolean; keying?: Keying }) {
  const base = transformOf(item, W, H);
  const tr = keying ? transformWithKeys(base, keying.keys, keying.tau) : base;
  const set = (k: keyof Transform, v: number) => onChange({ ...tr, [k]: v }, `transform-${k}-${item.id}`, { [k]: v });
  const row = (prop: MotionProp, el: ReactNode) =>
    keying ? (
      <div className="st-keyrow" data-prop={prop}>
        {el}
        <KeyButton prop={prop} keying={keying} disabled={disabled} />
      </div>
    ) : (
      el
    );
  return (
    <>
      {row('x', <Slider label="الموضع أفقياً" value={Math.round(tr.x)} min={-W / 2} max={W * 1.5} step={1} unit="px" onChange={(v) => set('x', v)} disabled={disabled} box />)}
      {row('y', <Slider label="الموضع عمودياً" value={Math.round(tr.y)} min={-H / 2} max={H * 1.5} step={1} unit="px" onChange={(v) => set('y', v)} disabled={disabled} box />)}
      {row('scale', <Slider label="الحجم" value={Math.round(tr.scale * 100)} min={5} max={400} step={1} unit="٪" onChange={(v) => set('scale', v / 100)} disabled={disabled} box />)}
      {row('rotation', <Slider label="الدوران" value={Math.round(tr.rotation)} min={-180} max={180} step={1} unit="°" onChange={(v) => set('rotation', v)} disabled={disabled} />)}
      {row('opacity', <Slider label="الشفافية" value={Math.round(tr.opacity * 100)} min={0} max={100} step={1} unit="٪" onChange={(v) => set('opacity', v / 100)} disabled={disabled} />)}
      <button type="button" className="st-mini" disabled={disabled} onClick={() => onChange({ x: W / 2, y: H / 2, scale: 1, rotation: 0, opacity: tr.opacity }, `transform-reset-${item.id}`, { x: W / 2, y: H / 2, scale: 1, rotation: 0 })}>
        <RotateCcw aria-hidden="true" />
        إلى المنتصف وبالحجم الأصلي
      </button>
    </>
  );
}

/** The keys of a clip at a glance: the previous and next key, the curve of the key here, removing them all. */
function KeyControls({ keying, onSeekKey, onEase, onClear, disabled }: { keying: Keying; onSeekKey: (dir: -1 | 1) => void; onEase: (e: Ease) => void; onClear: () => void; disabled: boolean }) {
  const times = keyTimes(keying.keys, MOTION_PROPS);
  if (!times.length) return <p className="st-hint">زر المعين بجانب أي إعداد يضع مفتاحاً عند رأس التشغيل. حرّك رأس التشغيل وغيّر القيمة، فيتحرك المقطع بين المفاتيح.</p>;
  const here = MOTION_PROPS.map((p) => keyAt(keying.keys?.[p], keying.tau)).find(Boolean);
  return (
    <div className="st-keytools">
      <div className="st-keynav">
        <button type="button" className="st-mini" onClick={() => onSeekKey(-1)} disabled={!times.some((x) => x < keying.tau - KEY_TOLERANCE)} title={withKeys('المفتاح السابق', 'key-prev')}>
          <ChevronRight aria-hidden="true" />
          السابق
        </button>
        <span className="st-chip">{times.length === 1 ? 'مفتاح واحد' : `${times.length} مفاتيح`}</span>
        <button type="button" className="st-mini" onClick={() => onSeekKey(1)} disabled={!times.some((x) => x > keying.tau + KEY_TOLERANCE)} title={withKeys('المفتاح التالي', 'key-next')}>
          التالي
          <ChevronLeft aria-hidden="true" />
        </button>
      </div>
      {here && (
        <label>
          منحنى المفتاح عند رأس التشغيل
          <select value={here.ease ?? 'linear'} disabled={disabled} onChange={(e) => onEase(e.target.value as Ease)}>
            {EASES.map((x) => (
              <option key={x.value} value={x.value}>{x.label}</option>
            ))}
          </select>
        </label>
      )}
      <button type="button" className="st-mini" disabled={disabled} onClick={onClear}>
        <KeyRound aria-hidden="true" />
        إزالة مفاتيح الحركة كلها
      </button>
    </div>
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

/** A covered area: blur or squares, its shape, strength and size (MVP_draft.md 62.8). */
export function CoverControls({ cover, onChange, disabled, W, H }: { cover: Cover; onChange: (c: Cover, label: string, key: string) => void; disabled: boolean; W: number; H: number }) {
  const set = <K extends keyof Cover>(k: K, v: Cover[K], label: string) => onChange({ ...cover, [k]: v }, label, `cover-${String(k)}`);
  return (
    <>
      <Segmented label="الطريقة" size="sm" value={cover.mode} disabled={disabled} onChange={(v) => set('mode', v, 'طريقة الإخفاء')} options={COVER_MODES} />
      <Segmented label="الشكل" size="sm" value={cover.shape} disabled={disabled} onChange={(v) => set('shape', v, 'شكل المنطقة')} options={COVER_SHAPES} />
      <Slider label="القوة" value={Math.round(cover.amount)} min={1} max={100} step={1} unit="٪" disabled={disabled} onChange={(v) => set('amount', v, 'قوة الإخفاء')} />
      <Slider label="العرض" value={Math.round(cover.w)} min={8} max={Math.max(W, H) * 2} step={1} unit="px" box disabled={disabled} onChange={(v) => set('w', v, 'عرض المنطقة')} />
      <Slider label="الارتفاع" value={Math.round(cover.h)} min={8} max={Math.max(W, H) * 2} step={1} unit="px" box disabled={disabled} onChange={(v) => set('h', v, 'ارتفاع المنطقة')} />
      <p className="st-hint">يُخفي ما تحت المنطقة من الطبقات والمسارات الأدنى. مع مفاتيح الحركة تتبع المنطقة الوجه أو اللوحة إن تحركت.</p>
    </>
  );
}

const ALIGN_LABELS = { start: 'بداية السطر', center: 'وسط', end: 'نهاية السطر' } as const;

export type WorkTextNote = { label: string; n: number; newer: { n: number; body: string } | null };

/** «من نص العمل»: the version a text was taken at, and «تغيّر نص العمل» with «تحديث» when the work has a newer one. */
export function WorkTextLine({ note, readOnly, onUpdate }: { note: WorkTextNote; readOnly: boolean; onUpdate: (n: { n: number; body: string }) => void }) {
  return note.newer ? (
    <div className="st-hint st-warn st-worktext-stale" role="note">
      تغيّر {note.label}: الإصدار {note.newer.n} أحدث من الإصدار {note.n} الذي في المقطع.{' '}
      <button type="button" className="st-linkish" disabled={readOnly} onClick={() => onUpdate(note.newer!)}>
        تحديث
      </button>
    </div>
  ) : (
    <p className="st-hint st-worktext">من {note.label} (الإصدار {note.n}).</p>
  );
}

/** A text's content and style. A timed text's entry and exit are the clip's («الدخول والخروج»). */
export function TextControls({ style, onChange, disabled }: { style: TextStyle; onChange: (s: TextStyle, label: string, key: string) => void; disabled: boolean; timed?: boolean }) {
  const set = <K extends keyof TextStyle>(k: K, v: TextStyle[K], label = 'تنسيق النص') => onChange({ ...style, [k]: v }, label, `text-${String(k)}`);
  const font = fontDef(style.font);
  return (
    <>
      <label className="st-textarea">
        النص
        <textarea value={style.content} dir="auto" rows={3} maxLength={600} disabled={disabled} onChange={(e) => set('content', e.target.value, 'تعديل النص')} />
      </label>
      <FontPicker value={style.font} disabled={disabled} onChange={(family) => onChange({ ...style, font: family, weight: nearestWeight(family, style.weight) }, 'الخط', 'text-font')} />
      {font.weights.length > 1 && (
        <Segmented label="السماكة" size="sm" value={nearestWeight(font.family, style.weight)} onChange={(v) => set('weight', v)} disabled={disabled} options={font.weights.map((w) => ({ value: w, label: WEIGHT_LABELS[w] ?? String(w), hint: String(w) }))} />
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
      {style.shadow && <Slider label="نعومة الظل" value={style.shadow.blur} min={0} max={60} step={1} unit="px" onChange={(v) => set('shadow', { ...style.shadow!, blur: v })} disabled={disabled} />}
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

/** The window «المشروع» of a video project: its shape, frame rate and background, and the device cache. */
export function ProjectSettings({ doc, onDoc, readOnly, cachePanel }: { doc: ProjectDoc; onDoc: (doc: ProjectDoc, label: string, key?: string) => void; readOnly: boolean; cachePanel: ReactNode }) {
  const { w: W, h: H } = canvasOf(doc);
  const ratio = doc.video?.ratio ?? '9:16';
  return (
    <aside className="st-insp st-project-pane" aria-label="المشروع">
      <Section title="المشروع">
        <Segmented label="شكل الإطار" size="sm" value={ratio} disabled={readOnly} onChange={(v) => onDoc(setFormat(doc, { ratio: v }), 'شكل الإطار')} options={(Object.keys(RATIOS) as Ratio[]).map((r) => ({ value: r, label: RATIOS[r].label, hint: `${RATIOS[r].w}×${RATIOS[r].h}` }))} />
        <Segmented label="الإطارات في الثانية" size="sm" value={doc.video?.fps ?? 30} disabled={readOnly} onChange={(v) => onDoc(setFormat(doc, { fps: v }), 'الإطارات في الثانية')} options={FPS_CHOICES.map((f) => ({ value: f, label: String(f) }))} />
        <ColorInput label="لون الخلفية" value={doc.video?.background ?? '#000000'} disabled={readOnly} onChange={(v) => onDoc(setFormat(doc, { background: v }), 'لون الخلفية', 'bg')} />
        <p className="st-hint">المدة {shortTime(durationOf(doc))} · <bdi dir="ltr">{W}×{H}</bdi></p>
      </Section>
      <Section title="أشكال أخرى للتصدير">
        <div className="st-shape-picks">
          {(Object.keys(RATIOS) as Ratio[])
            .filter((r) => r !== ratio)
            .map((r) => {
              const on = shapesOf(doc).includes(r);
              const full = !on && shapesOf(doc).length >= EXTRA_SHAPES_MAX;
              return (
                <label key={r} className="st-switch-row">
                  <input type="checkbox" checked={on} disabled={readOnly || full} onChange={(e) => onDoc(setShapes(doc, e.target.checked ? [...shapesOf(doc), r] : shapesOf(doc).filter((x) => x !== r)), e.target.checked ? 'إضافة شكل' : 'إزالة شكل')} />
                  {RATIOS[r].label}
                </label>
              );
            })}
        </div>
        <p className="st-hint">يُصدَّر المقطع نفسه في كل شكل مختار ملفاً مستقلاً. اعرض الشكل من «المعاينة»، واسحب المقاطع فيه لتضبط مكانها في ذلك الشكل وحده.</p>
      </Section>
      {cachePanel}
    </aside>
  );
}

function EntryControls({ clip, onClip, readOnly }: { clip: Clip; onClip: Patch; readOnly: boolean }) {
  const kinds = ANIMATIONS.filter((a) => !a.textOnly || clip.text);
  const row = (side: 'in' | 'out') => {
    const v = entryOf(clip, side);
    const label = side === 'in' ? 'الدخول' : 'الخروج';
    return (
      <div className="st-entry" data-side={side}>
        <label>
          {label}
          <select value={v.kind} disabled={readOnly} onChange={(e) => onClip(entryPatch(clip, side, { kind: e.target.value as EnterValue['kind'], length: v.kind === ENTER_NONE ? DEFAULT_ANIM_LENGTH : v.length }), side === 'in' ? 'حركة الدخول' : 'حركة الخروج')}>
            <option value={ENTER_NONE}>بلا</option>
            {kinds.map((a) => (
              <option key={a.kind} value={a.kind}>{a.label}</option>
            ))}
          </select>
        </label>
        {v.kind !== ENTER_NONE && (
          <Slider label={`مدة ${label}`} value={sec(v.length)} min={0.1} max={3} step={0.05} decimals={2} unit="ث" disabled={readOnly} onChange={(x) => onClip(entryPatch(clip, side, { ...v, length: usOf(x) }), side === 'in' ? 'مدة الدخول' : 'مدة الخروج', `entry-${side}`)} />
        )}
      </div>
    );
  };
  return (
    <>
      {row('in')}
      {row('out')}
      {clip.transition && entryOf(clip, 'in').kind === 'fade' && <p className="st-hint">يدخل هذا المقطع بانتقاله من المقطع السابق، فلا يُرى تلاشي الدخول.</p>}
      <p className="st-hint">التلاشي يخفت الصوت معه أيضاً؛ بقية الحركات للصورة وحدها.</p>
    </>
  );
}

function TransitionControls({ clip, readOnly, compact, onSet, nextFree, onNext }: { clip: Clip; readOnly: boolean; compact: boolean; onSet: (length: number | null, kind?: TransitionKind) => void; nextFree: boolean; onNext: () => void }) {
  if (compact) return <DesktopOnly what="الانتقال بين المقطعين" />;
  const tr = clip.transition;
  return (
    <>
      <label>
        الانتقال من المقطع السابق
        <select value={tr ? tr.kind : ''} disabled={readOnly} onChange={(e) => (e.target.value ? onSet(tr?.length ?? DEFAULT_TRANSITION.length, e.target.value as TransitionKind) : onSet(null))}>
          <option value="">بلا انتقال (قطع مباشر)</option>
          {TRANSITIONS.map((x) => (
            <option key={x.kind} value={x.kind}>{x.label}</option>
          ))}
        </select>
      </label>
      {tr && (
        <Slider label="مدة الانتقال" value={sec(tr.length)} min={0.05} max={3} step={0.05} decimals={2} unit="ث" disabled={readOnly} onChange={(v) => onSet(usOf(v))} hint="يتداخل المقطعان بهذه المدة، ويُمزج الصوت معهما." />
      )}
      {nextFree && (
        <button type="button" className="st-mini" disabled={readOnly} onClick={onNext}>
          <Blend aria-hidden="true" />
          انتقال إلى المقطع التالي
        </button>
      )}
    </>
  );
}

export type KeyActions = {
  toggle: (prop: KeyProp) => void;
  seek: (dir: -1 | 1) => void;
  ease: (e: Ease) => void;
  clear: () => void;
  setSpeed: (v: number) => void;
  setReverse: (on: boolean) => void;
  freeze: () => void;
};

export function Inspector({
  doc, clip, onClip, readOnly, actions, canFillWindow, hasPrevAdjacent, hasNextFree, reviewPanel, sourceNote, onLength, compact = false, t = 0, keyActions, track, onTrackSound, workText, slotPanel,
}: {
  doc: ProjectDoc;
  clip: Clip | null;
  /** The playhead (keyframes and speed are read and set there). */
  t?: number;
  keyActions?: KeyActions;
  /** The selected clip's track, and its part in the mix (MVP_draft.md 62.9). */
  track?: Track;
  onTrackSound?: (patch: { role?: 'voice' | 'music'; duck?: number }) => void;
  onClip: Patch;
  onDoc?: (doc: ProjectDoc, label: string, key?: string) => void;
  readOnly: boolean;
  actions: { split: () => void; duplicate: () => void; remove: () => void; ripple: () => void; fillWindow: () => void; setTransition: (us: number | null, kind?: TransitionKind) => void; nextTransition: () => void; setStart: (us: number) => void; setLength: (us: number) => void };
  canFillWindow: boolean;
  hasPrevAdjacent: boolean;
  /** A clip follows this one with no transition yet. */
  hasNextFree?: boolean;
  cachePanel?: ReactNode;
  /** The work and the review notes (phones show them here; computers in the window «المراجعة»). */
  reviewPanel?: ReactNode;
  sourceNote: string | null;
  onLength: (us: number) => void;
  /** A phone: transitions, crop and colours are kept for the computer. */
  compact?: boolean;
  /** A text taken from the linked work: where from, and a newer version when there is one (MVP_draft.md 62.12). */
  workText?: WorkTextNote | null;
  /** The settings of «مكان محجوز»: its task and what came for it (slot-panel.tsx). */
  slotPanel?: ReactNode;
}) {
  const { w: W, h: H } = canvasOf(doc);
  const ratio = doc.video?.ratio ?? '9:16';
  if (!clip)
    return (
      <aside className="st-insp" aria-label="الإعدادات">
        <div className="st-insp-empty">
          <MousePointerClick aria-hidden="true" />
          <b>لا شيء محدد</b>
          <p>حدد مقطعاً على الخط الزمني أو في المعاينة لترى إعداداته هنا: الموضع والحجم والنص والانتقال والحركة.</p>
          <p className="st-hint">شكل المشروع وخلفيته في نافذة «المشروع»، والاختصارات في «مساعدة».</p>
        </div>
        {reviewPanel}
      </aside>
    );

  const src = sourceOf(doc, clip.source);
  const media = src?.media;
  const audible = media === 'video' || media === 'audio';
  const visual = media !== 'audio';
  const label = clip.text ? 'نص' : clip.motion ? 'قالب حركة' : clip.sticker ? 'علامة الهوية' : clip.cover ? 'منطقة مخفية' : clip.slot ? 'مكان محجوز' : media === 'image' ? 'صورة' : media === 'audio' ? 'صوت' : 'فيديو';
  const tau = Math.max(0, Math.min(clip.length, t - clip.start));
  // keyframes on a computer: phones keep the plain values (and never remove keys)
  const keying: Keying | undefined = keyActions && !compact ? { tau, keys: clip.keys, onToggle: keyActions.toggle } : undefined;
  return (
    <aside className="st-insp" aria-label="إعدادات المقطع">
      <div className="st-insp-head">
        <b>{label}</b>
        <small dir="auto">{clip.text?.content.split('\n')[0] ?? (clip.motion ? graphicById(clip.motion.template)?.name : src?.name) ?? ''}</small>
        {sourceNote && <p className="st-hint st-warn">{sourceNote}</p>}
        <div className="st-insp-acts">
          {clip.pinned ? (
            <button type="button" className="st-pin" data-on="yes" disabled={readOnly} data-hold={HOLD.studioUnpin} onClick={() => onClip((c) => { const n = { ...c }; delete n.pinned; return n; }, 'إلغاء التثبيت')}><Pin aria-hidden="true" />مثبّت في القالب</button>
          ) : (
            <button type="button" className="st-pin" data-on="no" disabled={readOnly} onClick={() => onClip({ pinned: true }, 'تثبيت في القالب')} title="لا يُنقل ولا يُقص ولا يُحذف خطأً حتى يُلغى تثبيته بضغطة مطولة"><Pin aria-hidden="true" />تثبيت</button>
          )}
          <button type="button" onClick={actions.split} disabled={readOnly || !!clip.pinned} title={withKeys('قص عند رأس التشغيل', 'split')}><Scissors aria-hidden="true" />قص</button>
          <button type="button" onClick={actions.duplicate} disabled={readOnly} title={withKeys('تكرار', 'duplicate')}><Copy aria-hidden="true" />تكرار</button>
          <button type="button" onClick={actions.remove} disabled={readOnly || !!clip.pinned} title={withKeys('حذف', 'delete')}><Trash2 aria-hidden="true" />حذف</button>
          <button type="button" onClick={actions.ripple} disabled={readOnly || !!clip.pinned} title={withKeys('حذف مع سد الفراغ', 'ripple-delete')}><ArrowLeftToLine aria-hidden="true" />حذف وسد الفراغ</button>
        </div>
      </div>
      <Section title="التوقيت">
        <Slider label="البداية" value={sec(clip.start)} min={0} max={Math.max(60, sec(durationOf(doc)) + 30)} step={0.01} decimals={2} unit="ث" box boxMax={36000} disabled={readOnly} onChange={(v) => actions.setStart(usOf(v))} />
        <Slider label="المدة" value={sec(clip.length)} min={0.04} max={Math.max(30, sec(clip.length) * 2)} step={0.01} decimals={2} unit="ث" box boxMax={36000} disabled={readOnly} onChange={(v) => actions.setLength(usOf(v))} />
      </Section>
      {(hasPrevAdjacent || clip.transition || hasNextFree) && media !== 'audio' && (
        <Section title="الانتقال">
          {hasPrevAdjacent || clip.transition ? (
            <TransitionControls clip={clip} readOnly={readOnly} compact={compact} onSet={actions.setTransition} nextFree={!!hasNextFree} onNext={actions.nextTransition} />
          ) : compact ? (
            <DesktopOnly what="الانتقال بين المقطعين" />
          ) : (
            <button type="button" className="st-mini" disabled={readOnly} onClick={actions.nextTransition}>
              <Blend aria-hidden="true" />
              انتقال إلى المقطع التالي
            </button>
          )}
        </Section>
      )}
      {clip.slot && slotPanel && <Section title="المكان المحجوز">{slotPanel}</Section>}
      {clip.cover && (
        <Section title="المنطقة المخفية">
          <CoverControls cover={clip.cover} W={W} H={H} disabled={readOnly} onChange={(c, l, k) => onClip({ cover: c }, l, k)} />
        </Section>
      )}
      {visual && !clip.cover && (
        <Section title="الدخول والخروج">
          <EntryControls clip={clip} onClip={onClip} readOnly={readOnly} />
        </Section>
      )}
      {clip.text && (
        <Section title="النص">
          {workText && <WorkTextLine note={workText} readOnly={readOnly} onUpdate={(n) => onClip((c) => ({ ...c, text: { ...c.text!, content: n.body }, fromWork: { ...c.fromWork!, n: n.n } }), 'تحديث نص العمل')} />}
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
      {media === 'video' && keyActions && (
        <Section title="السرعة">
          {compact ? (
            <DesktopOnly what="السرعة والعكس والتجميد" />
          ) : isHold(clip) ? (
            <p className="st-hint">إطار ثابت من المصدر عند {shortTime(clip.hold!)}. غيّر مدته من «التوقيت».</p>
          ) : (
            <>
              <div className="st-keyrow" data-prop="speed">
                <Slider label="السرعة" value={Math.round(speedAt(clip, tau) * 100) / 100} min={SPEED_MIN} max={SPEED_MAX} step={0.05} decimals={2} unit="×" disabled={readOnly} onChange={(v) => keyActions.setSpeed(v)} box boxMax={SPEED_MAX} />
                <KeyButton prop="speed" keying={keying} disabled={readOnly} />
              </div>
              <p className="st-hint">{hasKeys(clip.keys, 'speed') ? 'للسرعة نقاط تتدرج بينها على طول المقطع: حرّك رأس التشغيل إلى نقطة وغيّر قيمتها.' : 'السرعة الثابتة تُبقي المقطع على الجزء نفسه من المصدر، فيقصر أو يطول. زر المعين يضع نقطة سرعة لتتدرج.'}</p>
              <Switch label="تشغيل عكسي" checked={!!clip.reverse} onChange={(v) => keyActions.setReverse(v)} disabled={readOnly} />
              {clip.reverse && <p className="st-hint">يستغرق تصدير المقطع المعكوس وقتاً أطول، وتعرضه المعاينة إطاراً إطاراً.</p>}
            </>
          )}
          {!compact && (
            <button type="button" className="st-mini" disabled={readOnly} onClick={keyActions.freeze} title={withKeys('تجميد الإطار عند رأس التشغيل', 'freeze')}>
              <Snowflake aria-hidden="true" />
              تجميد الإطار عند رأس التشغيل
            </button>
          )}
          {retimed(clip) && <p className="st-hint st-warn">لا يُسمع صوت هذا المقطع ما دامت سرعته غير 1× أو كان معكوساً أو إطاراً ثابتاً.</p>}
        </Section>
      )}
      {visual && (
        <Section title="الموضع والحجم">
          <TransformControls item={clip} W={W} H={H} disabled={readOnly} keying={keying} onChange={(tr, key, changed) => (keying ? onClip((c) => writeClipTransform(c, keying.tau, changed, W, H), 'الموضع والحجم', key) : onClip({ transform: tr }, 'الموضع والحجم', key))} />
          {keying && keyActions && <KeyControls keying={keying} disabled={readOnly} onSeekKey={keyActions.seek} onEase={keyActions.ease} onClear={keyActions.clear} />}
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
      {(media === 'video' || media === 'image') && compact && <Section title="القص والألوان" open={false}><DesktopOnly what="القص والألوان" /></Section>}
      {(media === 'video' || media === 'image') && !compact && (
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
          {media === 'audio' && track && onTrackSound && (
            <>
              <Segmented label="المسار في المزج" size="sm" value={roleOf(track)} disabled={readOnly} onChange={(v) => onTrackSound({ role: v })} options={[{ value: 'voice', label: 'كلام' }, { value: 'music', label: 'موسيقى' }]} />
              {roleOf(track) === 'music' && (
                <Slider label="خفض الموسيقى تحت الكلام" value={track.duck ?? 0} min={0} max={DUCK_MAX} step={1} unit="ديسيبل" disabled={readOnly} onChange={(v) => onTrackSound({ duck: v })} hint={track.duck ? 'تنخفض الموسيقى بهذا القدر كلما سُمع كلام، بانتقال ناعم.' : 'صفر: لا تنخفض.'} />
              )}
            </>
          )}
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

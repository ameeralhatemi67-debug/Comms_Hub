'use client';

import { useEffect, useRef } from 'react';
import { Segmented, Slider, Switch } from './motion-controls';
import { METALS, metalCss, metalOf, patternSwatch } from '@/lib/motion/designs-ribbons.js';
import { shown, type OptionField, type OptionKey, type OptionPlace, type Params } from '@/lib/motion/types';

/* The design options of a template (designs-ribbons.js): the metal, the light around it, the pattern, the font, the
   place and size, the effects. Shared by «قوالب الحركة» and the studio's inspector, so both offer the same choices. */

type Value = string | number | boolean;
type Change = (key: OptionKey, value: Value) => void;

const PLACES: { id: Exclude<OptionPlace, 'colors'>; label: string }[] = [
  { id: 'shine', label: 'اللمعة' }, { id: 'surface', label: 'النقش والخط' }, { id: 'layout', label: 'الموضع والحجم' }, { id: 'effects', label: 'المؤثرات' },
];

const light = (hex: string) => {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return Number.isFinite(n) && (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) > 150;
};

function MetalChoice({ field, p, onChange, disabled }: { field: Extract<OptionField, { kind: 'choice' }>; p: Params; onChange: Change; disabled?: boolean }) {
  return <div className="ms-seg" role="radiogroup" aria-label={field.label}>
    <span className="ms-seg-label">{field.label}</span>
    <div className="ms-picks">{field.choices.map(c => {
      const tones = c.value === 'custom' ? metalOf({ metal: 'custom', accent: p.accent }) : METALS[c.value as keyof typeof METALS];
      return <button key={c.value} type="button" role="radio" aria-checked={p.metal === c.value} className="ms-pick" disabled={disabled} onClick={() => onChange(field.key, c.value)}>
        <i className="ms-pick-metal" style={{ background: metalCss(tones) }} aria-hidden="true" />{c.label}
      </button>;
    })}</div>
  </div>;
}

function PatternSwatch({ kind, ink, paper }: { kind: string; ink: string; paper: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current) patternSwatch(ref.current, kind, ink, paper); }, [kind, ink, paper]);
  return <canvas ref={ref} width={128} height={64} aria-hidden="true" />;
}

function PatternChoice({ field, p, onChange, disabled }: { field: Extract<OptionField, { kind: 'choice' }>; p: Params; onChange: Change; disabled?: boolean }) {
  const paper = String(p[field.paper ?? 'main']), tones = metalOf(p), ink = light(paper) ? tones[1] : tones[3];
  return <div className="ms-seg" role="radiogroup" aria-label={field.label}>
    <span className="ms-seg-label">{field.label}</span>
    <div className="ms-picks wide">{field.choices.map(c =>
      <button key={c.value} type="button" role="radio" aria-checked={p[field.key] === c.value} className="ms-pick" disabled={disabled} onClick={() => onChange(field.key, c.value)}>
        <PatternSwatch kind={c.value} ink={ink} paper={paper} />{c.label}
      </button>)}</div>
  </div>;
}

/** One option's control. */
export function OptionControl({ field, p, onChange, onCommit, disabled }: { field: OptionField; p: Params; onChange: Change; onCommit?: () => void; disabled?: boolean }) {
  if (field.kind === 'switch') return <Switch label={field.label} hint={field.hint} checked={Boolean(p[field.key])} disabled={disabled} onChange={v => onChange(field.key, v)} />;
  if (field.kind === 'slider') {
    return <Slider label={field.label} hint={field.hint} value={Number(p[field.key])} min={field.min} max={field.max} step={field.step} unit={field.unit} decimals={field.decimals}
      format={field.times ? v => `${v.toFixed(2)}×` : undefined} disabled={disabled} onChange={v => onChange(field.key, v)} onCommit={onCommit} />;
  }
  if (field.look === 'metal') return <MetalChoice field={field} p={p} onChange={onChange} disabled={disabled} />;
  if (field.look === 'pattern') return <PatternChoice field={field} p={p} onChange={onChange} disabled={disabled} />;
  return <>
    <Segmented label={field.label} size="sm" value={String(p[field.key])} disabled={disabled} onChange={v => onChange(field.key, v)} options={field.choices.map(c => ({ value: c.value, label: c.label }))} />
    {field.hint && <small className="ms-option-hint">{field.hint}</small>}
  </>;
}

/**
 * The options that show for these parameters. `colors` gives those that sit with the colours; otherwise the rest, in
 * groups with a heading each, or one after another when `flat` (the studio's narrow inspector).
 */
export function DesignOptions({ fields, p, onChange, onCommit, disabled, colors, flat }: {
  fields?: OptionField[]; p: Params; onChange: Change; onCommit?: () => void; disabled?: boolean; colors?: boolean; flat?: boolean;
}) {
  const list = (fields ?? []).filter(f => shown(f, p) && (colors ? f.place === 'colors' : f.place !== 'colors'));
  if (!list.length) return null;
  const control = (f: OptionField) => <OptionControl key={f.key} field={f} p={p} onChange={onChange} onCommit={onCommit} disabled={disabled} />;
  if (colors || flat) return <div className="ms-options">{list.map(control)}</div>;
  return <>{PLACES.map(place => {
    const group = list.filter(f => f.place === place.id);
    return group.length ? <fieldset key={place.id} className="ms-group ms-options"><legend>{place.label}</legend>{group.map(control)}</fieldset> : null;
  })}</>;
}

'use client';

import { useEffect, useId, useState, type ReactNode, createContext, useContext } from 'react';

/* Small form controls used by the motion studio. All of them carry a real label and a visible focus state. */

export function Segmented<T extends string | number>({ label, value, options, onChange, disabled, size = 'md', hideLabel }: {
  label: string; value: T; options: { value: T; label: ReactNode; hint?: string }[]; onChange: (value: T) => void; disabled?: boolean; size?: 'sm' | 'md'; hideLabel?: boolean;
}) {
  return <div className={`ms-seg ${size}`} role="radiogroup" aria-label={label}>
    {!hideLabel && <span className="ms-seg-label">{label}</span>}
    <div className="ms-seg-row">{options.map(option => <button key={String(option.value)} type="button" role="radio" aria-checked={option.value === value} title={option.hint}
      disabled={disabled} className={option.value === value ? 'on' : ''} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>
  </div>;
}

export function Switch({ label, checked, onChange, disabled, hint }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; hint?: string }) {
  return <label className="ms-switch" title={hint}>
    <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
    <span className="ms-switch-track" aria-hidden="true"><i /></span>
    <span className="ms-switch-text">{label}</span>
  </label>;
}

export function TextInput({ label, value, onChange, max, ltr, placeholder, hint, disabled }: {
  label: string; value: string; onChange: (value: string) => void; max: number; ltr?: boolean; placeholder?: string; hint?: string; disabled?: boolean;
}) {
  const id = useId();
  return <div className="ms-field">
    <label htmlFor={id}>{label}</label>
    <input id={id} value={value} maxLength={max} dir={ltr ? 'ltr' : 'auto'} lang={ltr ? 'en' : 'ar'} placeholder={placeholder} disabled={disabled} autoComplete="off" spellCheck={false}
      onChange={e => onChange(e.target.value)} />
    {hint && <small>{hint}</small>}
  </div>;
}

/** Named colours offered first in every colour choice inside a provider (the studio's «هوية الاستوديو»). */
export const SwatchContext = createContext<{ name: string; hex: string }[]>([]);

export function ColorInput({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const id = useId();
  const swatches = useContext(SwatchContext);
  return <div className="ms-color">
    <input id={id} type="color" value={value} disabled={disabled} onChange={e => onChange(e.target.value)} />
    <label htmlFor={id}><span>{label}</span><bdi dir="ltr">{value.toUpperCase()}</bdi></label>
    {swatches.length > 0 && <div className="ms-swatches" role="group" aria-label={`ألوان الهوية: ${label}`}>
      {swatches.map(s => <button key={s.hex + s.name} type="button" className="ms-swatch" disabled={disabled} title={s.name} aria-label={s.name} aria-pressed={s.hex.toLowerCase() === value.toLowerCase()} style={{ background: s.hex }} onClick={() => onChange(s.hex)} />)}
    </div>}
  </div>;
}

/* A slider with an optional exact-value box. Typing is tolerated mid-edit; the value is clamped when the box loses focus. */
export function Slider({ label, value, min, max, step, unit, onChange, onCommit, disabled, box, boxMax, decimals = 0, hint, format }: {
  label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (value: number) => void; onCommit?: () => void; disabled?: boolean;
  box?: boolean; boxMax?: number; decimals?: number; hint?: string; format?: (value: number) => string;
}) {
  const id = useId(), [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const shown = format ? format(value) : `${value.toFixed(decimals)}${unit ? ` ${unit}` : ''}`;
  const limit = boxMax ?? max;
  const percent = Math.max(0, Math.min(100, (value - min) / (max - min) * 100));
  return <div className="ms-slider">
    <div className="ms-slider-head"><label htmlFor={id}>{label}</label>{!box && <output htmlFor={id} dir="ltr">{shown}</output>}</div>
    <div className="ms-slider-row">
      <input id={id} type="range" min={min} max={max} step={step} value={Math.min(max, value)} disabled={disabled} style={{ ['--fill' as string]: `${percent}%` }}
        aria-valuetext={shown} onChange={e => onChange(Number(e.target.value))} onPointerUp={onCommit} onKeyUp={e => { if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End' || e.key.startsWith('Page')) onCommit?.(); }} />
      {box && <span className="ms-numbox"><input type="number" dir="ltr" inputMode="decimal" min={min} max={limit} step={step} value={draft} disabled={disabled} aria-label={`${label}، قيمة دقيقة`}
        onChange={e => { setDraft(e.target.value); const n = e.target.valueAsNumber; if (Number.isFinite(n) && n >= min && n <= limit) onChange(n); }}
        onBlur={() => { const n = draft.trim() === '' ? value : Number(draft); const v = Number.isFinite(n) ? Math.max(min, Math.min(limit, n)) : value; setDraft(String(v)); onChange(v); onCommit?.(); }}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />{unit && <em>{unit}</em>}</span>}
    </div>
    {hint && <small>{hint}</small>}
  </div>;
}

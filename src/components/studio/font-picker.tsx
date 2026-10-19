'use client';

// The font list of the studio's text (MVP_draft.md 62.4): the fonts shown in their own faces, Arabic
// and English apart, searchable, worked with the keyboard. Choosing one loads it before it is drawn.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { FONTS, fontDef, fontPreview, type FontDef } from '@/lib/studio/fonts';

export function FontPicker({ value, onChange, disabled }: { value: string; onChange: (family: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const current = fontDef(value);
  const shown = useMemo(() => FONTS.filter((f) => !q.trim() || f.label.includes(q.trim()) || f.family.toLowerCase().includes(q.trim().toLowerCase()) || f.kind.includes(q.trim())), [q]);
  useEffect(() => {
    if (!open) return;
    setAt(Math.max(0, shown.findIndex((f) => f.family === value)));
    const off = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', off, true);
    return () => window.removeEventListener('pointerdown', off, true);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${at}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [at]);
  const pick = (f: FontDef) => {
    onChange(f.family);
    setOpen(false);
    setQ('');
  };
  const group = (script: 'ar' | 'en') => shown.map((f, i) => ({ f, i })).filter((x) => x.f.script === script);
  return (
    <div className="st-font" ref={wrap}>
      <span className="st-font-label" id={`${id}-l`}>الخط</span>
      <button type="button" className="st-font-btn" aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${id}-l ${id}-v`} disabled={disabled} onClick={() => setOpen((v) => !v)}>
        <span id={`${id}-v`} style={{ fontFamily: `"${current.family}", "IBM Plex Sans Arabic"` }}>{current.label}</span>
        <small>{current.script === 'ar' ? 'عربي' : 'إنجليزي'} · {current.kind}</small>
        <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <div className="st-font-pop" role="dialog" aria-label="اختيار الخط">
          <label className="st-search">
            <Search aria-hidden="true" />
            <input
              value={q}
              autoFocus
              onChange={(e) => (setQ(e.target.value), setAt(0))}
              placeholder="ابحث باسم الخط أو نوعه"
              aria-label="ابحث في الخطوط"
              aria-controls={`${id}-list`}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') (e.preventDefault(), setAt((a) => Math.min(shown.length - 1, a + 1)));
                else if (e.key === 'ArrowUp') (e.preventDefault(), setAt((a) => Math.max(0, a - 1)));
                else if (e.key === 'Enter' && shown[at]) (e.preventDefault(), pick(shown[at]));
                else if (e.key === 'Escape') (e.preventDefault(), e.stopPropagation(), setOpen(false));
              }}
            />
          </label>
          <ul className="st-font-list" role="listbox" id={`${id}-list`} ref={list} aria-label="الخطوط">
            {(['ar', 'en'] as const).map((script) => {
              const rows = group(script);
              if (!rows.length) return null;
              return [
                <li key={`h-${script}`} className="st-font-group" role="presentation">{script === 'ar' ? `خطوط عربية (${rows.length})` : `خطوط إنجليزية (${rows.length})`}</li>,
                ...rows.map(({ f, i }) => (
                  <li
                    key={f.family}
                    role="option"
                    aria-selected={f.family === value}
                    data-i={i}
                    data-on={i === at ? 'yes' : 'no'}
                    data-font={f.family}
                    onPointerEnter={() => setAt(i)}
                    onClick={() => pick(f)}
                  >
                    <span className="st-font-name">{f.label}<small>{f.kind}{f.weights.length > 1 ? ` · ${f.weights.length} سماكات` : ''}</small></span>
                    <span className="st-font-sample" dir={f.script === 'ar' ? 'rtl' : 'ltr'} style={{ fontFamily: `"${f.family}", "IBM Plex Sans Arabic"`, fontWeight: f.weights.includes(700) ? 700 : f.weights[f.weights.length - 1] }}>
                      {fontPreview(f)}
                    </span>
                  </li>
                )),
              ];
            })}
            {!shown.length && <li className="st-hint" role="presentation">لا خط مطابق.</li>}
          </ul>
          <p className="st-hint">الخطوط الإنجليزية بلا حروف عربية: ما يُكتب فيها بالعربية يظهر بخط بلكس العربي.</p>
        </div>
      )}
    </div>
  );
}

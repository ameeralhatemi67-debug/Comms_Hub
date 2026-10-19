'use client';

// Phones (MVP_draft.md 62): at 760 px wide or less the editors show the preview with one panel at a
// time, finger-sized controls, and a reduced set of tools. A tool kept for the computer is shown
// disabled with its reason; nothing it would edit is removed from the project (the document keeps every
// field, schema.ts). What the browser can do (export, device storage) is measured, not assumed from the
// width (support.ts).
import { useEffect, useState } from 'react';

export const PHONE_QUERY = '(max-width: 760px)';
export const PHONE_NOTE = 'متاح على الحاسوب: يبقى في المشروع كما هو.';

export function useCompact(): boolean {
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.matchMedia(PHONE_QUERY).matches);
  useEffect(() => {
    const m = window.matchMedia(PHONE_QUERY);
    const on = () => setCompact(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return compact;
}

export type Panel = 'timeline' | 'add' | 'settings' | 'export';

export function PanelTabs({ value, onChange, panels }: { value: Panel; onChange: (p: Panel) => void; panels: { id: Panel; label: string }[] }) {
  return (
    <nav className="st-phone-tabs" aria-label="لوحات المحرر">
      {panels.map((p) => (
        <button key={p.id} type="button" aria-pressed={value === p.id} className={value === p.id ? 'on' : ''} onClick={() => onChange(p.id)}>
          {p.label}
        </button>
      ))}
    </nav>
  );
}

/** A tool kept for the computer: its name and the reason, in place of its controls. */
export function DesktopOnly({ what }: { what: string }) {
  return (
    <p className="st-hint st-desktop-only">
      <b>{what}</b> · {PHONE_NOTE}
    </p>
  );
}

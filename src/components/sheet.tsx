'use client';
// The bottom sheet of «المنصات» and «حسابات المنصات» (MVP_draft.md section 67), on the native dialog like every other
// dialog here, so the guide sees it as open, Escape closes it and focus comes back to what opened it. Its two sides
// follow the page's direction: `SheetSteps` comes first in the document, so it sits on the right in Arabic and on the
// left in English, and nothing here names a side.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ExternalLink } from 'lucide-react';

export function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    const opener = document.activeElement as HTMLElement | null;
    d?.showModal();
    return () => {
      d?.close();
      queueMicrotask(() => opener?.isConnected && opener.focus());
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="pf-sheet"
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <span className="pf-grab" aria-hidden="true" />
      {children}
    </dialog>
  );
}

export function SheetHead({ tile, title, sub, chip, onClose }: { tile?: ReactNode; title: string; sub?: ReactNode; chip?: ReactNode; onClose: () => void }) {
  return (
    <header className="pf-head">
      {tile}
      <div className="pf-title">
        <h2>{title}</h2>
        {sub && <small>{sub}</small>}
      </div>
      {chip}
      <button type="button" className="pf-btn" onClick={onClose}>
        إغلاق
      </button>
    </header>
  );
}

export function SheetProgress({ at, pct, saved }: { at: string; pct: number; saved?: ReactNode }) {
  return (
    <div className="pf-prog">
      <div className="pf-prog-line">
        <b>{at}</b>
        {saved}
      </div>
      <div className="pf-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="نسبة الإنجاز">
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export type SheetStep = { id: string; t: string; b?: string; link?: { href: string; label: string }; done: boolean };

/** The steps side. A step can be opened by clicking it when `onPick` is given. */
export function SheetSteps({ steps, at, onPick, children }: { steps: SheetStep[]; at: string | null; onPick?: (id: string) => void; children?: ReactNode }) {
  return (
    <div className="pf-side">
      <ol className="pf-steps" aria-label="الخطوات">
        {steps.map((s, i) => {
          const cur = s.id === at;
          const mark = <span className="pf-num">{s.done ? <Check aria-hidden="true" /> : i + 1}</span>;
          return (
            <li key={s.id} className={`pf-step ${cur ? 'cur' : ''} ${s.done ? 'done' : ''}`} data-step={s.id}>
              {onPick ? (
                <button type="button" className="pf-step-btn" aria-current={cur ? 'step' : undefined} onClick={() => onPick(s.id)}>
                  {mark}
                  <span>{s.t}</span>
                </button>
              ) : (
                <div className="pf-step-btn" aria-current={cur ? 'step' : undefined}>
                  {mark}
                  <span>{s.t}</span>
                </div>
              )}
              {cur && (s.b || s.link) && (
                <div className="pf-step-text">
                  {s.b && <p>{s.b}</p>}
                  {s.link && (
                    <a className="pf-link" href={s.link.href} target="_blank" rel="noopener noreferrer">
                      {s.link.label}
                      <ExternalLink aria-hidden="true" />
                    </a>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {children}
    </div>
  );
}

/** A value to copy exactly: an address the platform's own page asks for. */
export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async (input: HTMLInputElement | null) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // A page without clipboard access: leave the value selected for Ctrl+C.
      input?.select();
    }
  };
  const ref = useRef<HTMLInputElement>(null);
  return (
    <label className="pf-f">
      {label}
      <span className="pf-copy">
        <input ref={ref} className="ltr" readOnly value={value} onFocus={(e) => e.target.select()} />
        <button type="button" className="pf-btn" onClick={() => void copy(ref.current)}>
          {copied ? 'نُسخ' : 'نسخ'}
        </button>
      </span>
    </label>
  );
}

'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Image as ImageIcon } from 'lucide-react';

/** Today in Riyadh, written out; empty until the page is in the browser (the server's day may differ). */
function useToday() {
  const [text, setText] = useState('');
  useEffect(() => {
    setText(
      new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Riyadh' }).format(new Date()),
    );
  }, []);
  return text;
}

export function Title({
  title,
  accent,
  sub,
  children,
}: {
  title: string;
  /** One word set apart; the second design writes it in a calligraphic gold face. */
  accent?: string;
  sub?: string;
  children?: ReactNode;
}) {
  const today = useToday();
  return (
    <header className="page-heading">
      <div>
        <span className="eyebrow">
          مركز الاتصال المؤسسي{today && <> · <span className="scenario-date">اليوم: {today}</span></>}
        </span>
        <h1>
          {title}
          {accent && <em className="accent-word">{accent}</em>}
        </h1>
        {sub && <p>{sub}</p>}
      </div>
      <div className="actions">{children}</div>
    </header>
  );
}

export function Panel({
  title,
  children,
  className = '',
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <ImageIcon />
      <h3>لا توجد نتائج هنا</h3>
      <p>{children}</p>
    </div>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      queueMicrotask(() => {
        if (opener?.isConnected) opener.focus();
      });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-label={title}
    >
      <div className="between">
        <h2>{title}</h2>
        <button onClick={onClose} aria-label="إغلاق">
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function Tabs({
  items,
  value,
  onChange,
}: {
  items: { id: string; label: string }[];
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <div className="tabs" role="group" aria-label="عرض المحتوى">
      {items.map((t) => (
        <button
          type="button"
          key={t.id}
          aria-pressed={value === t.id}
          className={value === t.id ? 'active' : ''}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export { LogoLoader } from './logo-loader';
export type { LogoLoaderProps } from './logo-loader';

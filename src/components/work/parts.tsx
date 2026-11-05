'use client';
// Small pieces the work pages share: icons, chips, avatars, the dialog frame and the
// library picker. Words come from src/lib/work/rules.ts; keys never reach the screen.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Bell,
  CalendarDays,
  Check,
  Clock,
  FileText,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Lock,
  Mail,
  Search,
  Send,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react';
import { priorityLabels, statusLabels, type Priority, type WorkStatus, type WorkType } from '@/lib/work/rules';
import { libraryFiles, type LibraryFile } from './data';
import { FileThumb } from '../file-thumb';

export const TYPE_ICON: Record<WorkType, LucideIcon> = {
  post: Send,
  video: Film,
  design: ImageIcon,
  announce: Bell,
  email: Mail,
  press: FileText,
  event: CalendarDays,
};
export const TYPE_HINT: Record<WorkType, string> = {
  post: 'نص أساسي ونسخة لكل منصة، مع صورة أو فيديو من المكتبة.',
  video: 'نص وتصوير ومونتاج، والملاحظات الزمنية في المراجعة.',
  design: 'فكرة ومسودة وتصميم نهائي بمقاسات المنصات.',
  announce: 'إعلان داخلي أو عام بنص قصير ومرئيات.',
  email: 'رسالة رسمية لقائمة مستلمين، تُرسل من صفحة البريد.',
  press: 'بيان أو رد صحفي يمر بالتدقيق قبل الإرسال.',
  event: 'تخطيط وتصوير يوم الحدث ومعالجة وتسليم.',
};

export function Ic({ i: Icon, size }: { i: LucideIcon; size?: number }) {
  return <Icon className="wk-i" aria-hidden="true" width={size} height={size} />;
}

const STATUS_CLASS: Record<WorkStatus, string> = {
  DRAFT: '', IN_PRODUCTION: 'info', IN_REVIEW: 'review', CHANGES_REQUESTED: 'warn', REJECTED: 'danger', APPROVED: 'approved',
  SCHEDULED: 'sched', PUBLISHING: 'sched', PUBLISHED: 'done', PARTIAL: 'warn', FAILED: 'danger',
};
export function StatusChip({ status }: { status: WorkStatus }) {
  return <span className={`wk-chip ${STATUS_CLASS[status]}`}>{statusLabels[status]}</span>;
}
export function PrioChip({ p }: { p: Priority }) {
  if (p === 'normal') return null;
  return <span className={`wk-chip ${p === 'urgent' ? 'urg' : 'high'}`}>{priorityLabels[p]}</span>;
}
export function RestrictedChip() {
  return (
    <span className="wk-chip lockc">
      <Ic i={Lock} />
      مقيّد
    </span>
  );
}
export function Wid({ id }: { id: string }) {
  return <span className="wk-wid">{id}</span>;
}
export function Av({ name, size = '' }: { name: string; size?: '' | 'sm' | 'lg' }) {
  return (
    <span className={`wk-av ${size}`} aria-hidden="true">
      {(name.trim()[0] ?? '؟').toUpperCase()}
    </span>
  );
}
export function Hint({ i = Clock, warn, children }: { i?: LucideIcon; warn?: boolean; children: ReactNode }) {
  return (
    <p className={`wk-hint ${warn ? 'warn' : ''}`}>
      <Ic i={warn ? TriangleAlert : i} />
      <span>{children}</span>
    </p>
  );
}
export function Empty({ i: Icon = FolderOpen, title, children }: { i?: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="wk-empty">
      <span className="e-i">
        <Ic i={Icon} />
      </span>
      <b>{title}</b>
      {children && <span>{children}</span>}
    </div>
  );
}

/**
 * A dialog on the native element, so the guide sees it as open (src/lib/kit/guide.ts) and
 * Escape closes it. Focus returns to what opened it.
 */
export function Modal({ title, wide, onClose, children }: { title: string; wide?: boolean; onClose: () => void; children: ReactNode }) {
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
      className={`wk-modal ${wide ? 'wide' : ''}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="m-body">
        <h3 className="m-h">
          <span>{title}</span>
          <button type="button" className="wk-btn icon quiet" aria-label="إغلاق" onClick={onClose}>
            <Ic i={X} />
          </button>
        </h3>
        {children}
      </div>
    </dialog>
  );
}

/** Pick a file from the library: only files in folders this person can reach, and of one kind when `only` says so. */
export function LibraryPicker({ have, only, note, onPick, onClose }: { have: string[]; only?: string; note?: string; onPick: (f: LibraryFile) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [files, setFiles] = useState<LibraryFile[] | null>(null);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => void libraryFiles(q, only).then((f) => live && setFiles(only ? f.filter((x) => x.kind === only) : f)), q ? 250 : 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, only]);
  return (
    <Modal title="اختر من مكتبة الوسائط" onClose={onClose}>
      <Hint i={FolderOpen}>{note ?? 'تظهر الملفات التي تملك الوصول إلى مجلداتها فقط. الملف يبقى في مجلده بصلاحياته، والعمل يشير إليه.'}</Hint>
      <label className="wk-field">
        <Ic i={Search} />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم الملف…" aria-label="ابحث باسم الملف" />
      </label>
      <div className="wk-pick-list">
        {files === null && <p className="wk-col-hint">جارٍ التحميل…</p>}
        {files?.length === 0 && <p className="wk-col-hint">لا ملفات تطابق البحث في المجلدات التي تصل إليها.</p>}
        {files?.map((f) => (
          <button type="button" key={f.id} disabled={have.includes(f.id)} onClick={() => onPick(f)}>
            <span className="wk-pth">
              <FileThumb of={{ asset: f.id, version: f.current_version }} kind={f.kind} name={f.name} />
            </span>
            <span className="grow">
              <b>{f.name}</b>
              <small> · الإصدار {f.current_version}{have.includes(f.id) ? ' · مرتبط' : ''}</small>
            </span>
            {have.includes(f.id) && <Ic i={Check} />}
          </button>
        ))}
      </div>
    </Modal>
  );
}

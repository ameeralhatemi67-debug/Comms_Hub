'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { Play, Image as ImageIcon } from 'lucide-react';
import {
  assets,
  diffWords,
  releaseChanges,
  scenario,
  staleVariants,
  statusLabels,
  type Channel,
  type Content,
  type Release,
  type Status,
} from '@/lib/domain';

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
  return (
    <header className="page-heading">
      <div>
        <span className="eyebrow">
          مركز الاتصال المؤسسي · <span className="scenario-date">اليوم في النموذج: {scenario.label}</span>
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

export function StatusChip({ status }: { status: Status }) {
  return <span className={`chip status-${status}`}>{statusLabels[status]}</span>;
}

/** One channel's text, flagged when written before the latest master text (F-R01-05). */
export function VariantCopy({ content, channel }: { content: Content; channel: Channel }) {
  const stale = staleVariants(content).includes(channel);
  return (
    <div className={`variant-copy ${stale ? 'stale' : ''}`}>
      <b>{channel}</b>
      {stale && <span className="chip status-CHANGES_REQUESTED stale-flag">تحتاج مراجعة: كُتبت قبل تعديل النص الأساسي</span>}
      <p>{content.variants[channel] || content.body}</p>
    </div>
  );
}

/** What changed between two versions: highlighted text and changed fields (F-R01-06). */
export function VersionDiff({ before, after }: { before: Release; after: Release }) {
  const parts = diffWords(before.body, after.body);
  const fields = releaseChanges(before, after);
  const textChanged = parts.some((p) => p.kind !== 'same');
  return (
    <section className="version-diff" aria-label={`الفرق بين الإصدار ${before.revision} والإصدار ${after.revision}`}>
      <h3>
        ما الذي تغيّر منذ الإصدار {before.revision}
      </h3>
      {textChanged ? (
        <>
          <p className="diff-text">
            {parts.map((p, i) =>
              p.kind === 'add' ? (
                <ins key={i}>{p.text}</ins>
              ) : p.kind === 'del' ? (
                <del key={i}>{p.text}</del>
              ) : (
                <span key={i}>{p.text}</span>
              ),
            )}
          </p>
          <small className="diff-legend">
            <ins>المضاف مظلل</ins> · <del>المحذوف مشطوب</del>
          </small>
        </>
      ) : (
        <p className="muted">لم يتغير النص الأساسي.</p>
      )}
      {fields.length > 0 ? (
        <dl className="diff-fields">
          {fields.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>
                <del>{f.before}</del> ← <ins>{f.after}</ins>
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="muted">لم تتغير الحقول الأخرى.</p>
      )}
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

export function MediaPreview({
  assetId = 'poster',
  version = 5,
  large = false,
}: {
  assetId?: string;
  version?: number;
  large?: boolean;
}) {
  const a = assets.find((x) => x.id === assetId) || assets[0];
  return (
    <div
      className={`media-preview ${a.kind} ${large ? 'media-large' : ''}`}
      role="img"
      aria-label={`${a.title}، الإصدار ${version}، رسم توضيحي تجريبي`}
    >
      <div className="art-brand">
        <span>الاتصال المؤسسي</span>
        <span>2026 / v{version}</span>
      </div>
      <div className="art-lines" />
      <div className="art-copy">
        <span>23 سبتمبر · اليوم الوطني السعودي</span>
        <strong>{a.kind === 'video' ? 'حكاية وطن' : a.kind === 'raw' ? 'من الميدان' : 'وطنٌ نعتزّ به'}</strong>
        <p>نحتفي بمنجزاتنا، ونصنع مستقبلنا معاً.</p>
      </div>
      <div className="art-base">
        <span>تصوّر تجريبي · ليس هوية رسمية</span>
        <b>96</b>
      </div>
      {a.kind === 'video' && <Play className="play" />}
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

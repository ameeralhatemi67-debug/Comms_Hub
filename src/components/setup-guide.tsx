'use client';
// The circled "!" that opens the steps of a setup (Meta app, TikTok app, connecting an account, a
// storage provider, a first move). The steps are written in the site (src/lib/setup-guides.ts), so
// a person follows them from the screen that needs them and not from a document. The icon is the
// icon set's circle with an exclamation mark, never an emoji.
import { useEffect, useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { GUIDES, resolveGuide, type Guide } from '@/lib/setup-guides';
import { Modal } from './ui';

export function SetupGuide({
  guide,
  provider,
  label = 'خطوات الإعداد',
  initialOpen = false,
  className = '',
}: {
  /** A key of GUIDES. */
  guide: string;
  /** The platform whose return address the guide shows (meta or tiktok). */
  provider?: string;
  label?: string;
  /** Draws the steps without a click (qa). */
  initialOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const raw = GUIDES[guide];
  if (!raw) return null;
  const g: Guide = resolveGuide(raw, origin || 'https://موقعك', provider);

  return (
    <>
      <button
        type="button"
        className={`su-hint ${className}`.trim()}
        aria-label={`${label}: ${g.title}`}
        title={label}
        data-guide={guide}
        onClick={() => setOpen(true)}
      >
        <CircleAlert aria-hidden="true" />
      </button>
      {open && (
        <Modal title={g.title} onClose={() => setOpen(false)}>
          <div className="su-body" data-guide-open={guide}>
            <p>{g.intro}</p>
            <ol className="su-steps">
              {g.steps.map((s, i) => (
                <li key={i}>
                  <b>{s.t}</b>
                  {s.b && <span>{s.b}</span>}
                  {s.copy && (
                    <bdi className="su-copy" dir="ltr">
                      {s.copy}
                    </bdi>
                  )}
                  {s.link && (
                    <a className="su-link" href={s.link.href} target="_blank" rel="noopener noreferrer">
                      {s.link.label}
                    </a>
                  )}
                </li>
              ))}
            </ol>
            {g.notes && g.notes.length > 0 && (
              <ul className="su-notes">
                {g.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
            {g.link && (
              <p>
                <a href={g.link.href} target="_blank" rel="noopener noreferrer">
                  {g.link.label}
                </a>
              </p>
            )}
            <div className="actions">
              <button type="button" className="primary" onClick={() => setOpen(false)}>
                فهمت
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

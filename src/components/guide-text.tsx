'use client';
// What a setup guide's steps are drawn with (the setup sheet of «المنصات» and the circled "!"; MVP_draft.md section 67.5):
// the words with their English set apart (rules in src/lib/guide-text.ts), the short list of things to do, and the
// pictures of the platform's own page. Tokens only, no emoji.
import { useState } from 'react';
import { segments } from '@/lib/guide-text';
import type { GuideShot } from '@/lib/setup-guides';

/** A sentence whose English is isolated, so the Arabic around it keeps its order. */
export function Rich({ text }: { text: string }) {
  return (
    <>
      {segments(text).map((g, i) =>
        g.k === 'text' ? (
          g.s
        ) : (
          <bdi key={i} dir="ltr" className={g.k === 'ui' ? 'gd-ui' : g.k === 'val' ? 'gd-val' : undefined}>
            {g.s}
          </bdi>
        ),
      )}
    </>
  );
}

/** What to do in a step, one small action to a line, in order. */
export function GuideTodo({ items }: { items: string[] }) {
  return (
    <ol className="gd-todo">
      {items.map((t) => (
        <li key={t}>
          <Rich text={t} />
        </li>
      ))}
    </ol>
  );
}

// A picture narrower than this fits its place whole on any screen, so there is nothing to enlarge.
const FITS = 420;

function Shot({ shot }: { shot: GuideShot }) {
  const [big, setBig] = useState(false);
  const zoomable = shot.w > FITS;
  const img = <img src={shot.src} alt={shot.alt} width={shot.w} height={shot.h} loading="lazy" decoding="async" />;
  return (
    <figure className={`gd-shot${big ? ' big' : ''}`} style={{ maxWidth: shot.w }}>
      {zoomable ? (
        <button type="button" className="gd-zoom" aria-pressed={big} aria-label={`${shot.alt}. ${big ? 'اضغط لتصغير الصورة' : 'اضغط لتكبير الصورة'}`} onClick={() => setBig(!big)}>
          {img}
        </button>
      ) : (
        <div className="gd-zoom">{img}</div>
      )}
      {(shot.caption || zoomable) && (
        <figcaption>
          {shot.caption && <Rich text={shot.caption} />}
          {zoomable && <span className="gd-hint">{big ? 'اضغط الصورة لتصغيرها' : 'اضغط الصورة لتكبيرها'}</span>}
        </figcaption>
      )}
    </figure>
  );
}

/** The platform's own page, cropped to the part that matters, with what is private blurred out. */
export function GuideShots({ shots }: { shots: GuideShot[] }) {
  return (
    <div className="gd-shots">
      {shots.map((s) => (
        <Shot key={s.src} shot={s} />
      ))}
    </div>
  );
}

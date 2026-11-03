'use client';
// What a setup guide's steps are drawn with (the setup sheet of «المنصات» and the circled "!"; MVP_draft.md section 67.5):
// the words with their English set apart (rules in src/lib/guide-text.ts), the short list of things to do, and the
// pictures of the platform's own page. Tokens only, no emoji.
import { useState } from 'react';
import { Check, Copy, Image as ImageIcon } from 'lucide-react';
import { segments } from '@/lib/guide-text';
import type { GuideShot } from '@/lib/setup-guides';

/** A value to type, with a button that copies it exactly: nobody retypes a name or an address by eye. */
function Val({ s }: { s: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(s);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // A page without clipboard access: the value stays on screen to be typed.
    }
  };
  return (
    <bdi dir="ltr" className="gd-val gd-copyable">
      <span>{s}</span>
      <button type="button" className="gd-copy" aria-label={`${copied ? 'نُسخ' : 'نسخ'} ${s}`} onClick={() => void copy()}>
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </button>
    </bdi>
  );
}

/** A sentence whose English is isolated, so the Arabic around it keeps its order. `copy` adds a copy button to each value to type. */
export function Rich({ text, copy = false }: { text: string; copy?: boolean }) {
  return (
    <>
      {segments(text).map((g, i) =>
        g.k === 'text' ? (
          g.s
        ) : g.k === 'val' && copy ? (
          <Val key={i} s={g.s} />
        ) : (
          <bdi key={i} dir="ltr" className={g.k === 'ui' ? 'gd-ui' : g.k === 'val' ? 'gd-val' : undefined}>
            {g.s}
          </bdi>
        ),
      )}
    </>
  );
}

/** The rings of a step's pictures, as {action number: the pictures (1-based) that show it}. */
function ringMap(shots: GuideShot[] = []) {
  const at = new Map<number, number[]>();
  shots.forEach((s, i) => {
    for (const r of s.rings ?? []) if (r !== 'x') at.set(Number(r), [...(at.get(Number(r)) ?? []), i + 1]);
  });
  return at;
}

/** What to do in a step, one small action to a line, in order. An action a picture shows says which picture. */
export function GuideTodo({ items, shots }: { items: string[]; shots?: GuideShot[] }) {
  const seen = ringMap(shots);
  const many = (shots?.length ?? 0) > 1;
  return (
    <ol className="gd-todo">
      {items.map((t, i) => {
        const pics = seen.get(i + 1);
        return (
          <li key={t}>
            <Rich text={t} copy />
            {pics && (
              <span className="gd-seen">
                <ImageIcon aria-hidden="true" />
                {many ? `في الصورة ${pics.join(' و')}` : 'في الصورة'}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// A picture narrower than this fits its place whole on any screen, so there is nothing to enlarge.
const FITS = 420;

/** What the rings in a picture mean: the same numbers as the list of actions, and a red one for what not to do. */
function Legend({ rings }: { rings: string[] }) {
  const nums = rings.filter((r) => r !== 'x');
  return (
    <span className="gd-legend">
      {nums.length > 0 && (
        <span>
          {nums.map((r) => (
            <i key={r} className="gd-ring">
              {r}
            </i>
          ))}
          رقم الحلقة هو رقم العمل في القائمة
        </span>
      )}
      {rings.includes('x') && (
        <span>
          <i className="gd-ring x" aria-hidden="true" />
          الحلقة الحمراء: لا تفعل هذا
        </span>
      )}
    </span>
  );
}

function Shot({ shot, n, of }: { shot: GuideShot; n: number; of: number }) {
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
      {(shot.caption || zoomable || shot.rings || of > 1) && (
        <figcaption>
          {of > 1 && <b className="gd-order">{`الصورة ${n} من ${of}`}</b>}
          {shot.caption && <Rich text={shot.caption} />}
          {shot.rings && shot.rings.length > 0 && <Legend rings={shot.rings} />}
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
      {shots.map((s, i) => (
        <Shot key={s.src} shot={s} n={i + 1} of={shots.length} />
      ))}
    </div>
  );
}

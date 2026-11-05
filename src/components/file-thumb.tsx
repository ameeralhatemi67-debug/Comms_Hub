'use client';
// A stored file's small picture (MVP_draft.md section 77), wherever a file is listed: the thumbnail when there is one, else a
// tile with the kind's icon and the file's extension, so a file is never shown as a name alone. The route answers with nothing (204)
// when there is no picture, the picture fails to load, and the tile takes its place. A video's picture carries a small play mark.
import { useState, type ReactNode } from 'react';
import { File as FileIcon, FileText, Film, Image as ImageIcon, Music, Play } from 'lucide-react';
import { extOf, thumbUrl, type FileKind, type ThumbOf } from '@/lib/media/thumbs';

const ICON = { image: ImageIcon, video: Film, audio: Music, document: FileText, other: FileIcon };
const KINDS: readonly string[] = ['image', 'video', 'audio', 'document', 'other'];

export function FileThumb({
  of,
  kind,
  name,
  alt = '',
  className = '',
  fallback,
}: {
  /** What the thumbnail belongs to; null when the file has none to ask for (a file still on this device). */
  of: ThumbOf | null;
  kind?: string | null;
  name?: string | null;
  /** Words for a picture that says something; empty when the name stands beside it. */
  alt?: string;
  className?: string;
  /** A page's own tile, in place of the shared one. */
  fallback?: ReactNode;
}) {
  const url = of ? thumbUrl(of) : null;
  const [bad, setBad] = useState<string | null>(null);
  const k = (KINDS.includes(kind ?? '') ? kind : 'other') as FileKind;
  if (url && bad !== url)
    return (
      <span className={`fthumb k-${k} ${className}`} data-thumb={url}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={alt} loading="lazy" decoding="async" draggable={false} onError={() => setBad(url)} />
        {k === 'video' && (
          <i className="fthumb-play" aria-hidden="true">
            <Play />
          </i>
        )}
      </span>
    );
  if (fallback) return <>{fallback}</>;
  const Icon = ICON[k];
  const ext = extOf(name);
  return (
    <span className={`fthumb tile k-${k} ${className}`} role={alt ? 'img' : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true}>
      <Icon aria-hidden="true" />
      {ext && <b dir="ltr">{ext}</b>}
    </span>
  );
}

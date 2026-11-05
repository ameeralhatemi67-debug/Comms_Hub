'use client';
// The file chosen in a «تجربة النشر» panel, as a small picture beside its name (MVP_draft.md section 77). A file from this device
// is drawn here, in the browser, before anything is sent; a library file shows its stored thumbnail.
import { useEffect, useState } from 'react';
import { FileThumb } from '../file-thumb';
import { makeThumb } from '@/lib/media/thumb-maker';
import { kindOfMime } from '@/lib/media/thumbs';

export function PickedThumb({ blob, asset, version, mime, name }: { blob: Blob | null; asset: string | null; version?: number | null; mime: string; name: string }) {
  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setLocal(null);
    if (blob) void makeThumb(blob).then((t) => live && t && setLocal(`data:${t.mime};base64,${t.data}`));
    return () => {
      live = false;
    };
  }, [blob]);
  const kind = kindOfMime(mime);
  return (
    <span className="yt-pth" data-picked-thumb={local ? 'local' : asset && version ? 'stored' : 'tile'}>
      {local ? (
        <span className={`fthumb k-${kind}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={local} alt="" />
        </span>
      ) : (
        <FileThumb of={!blob && asset && version ? { asset, version } : null} kind={kind} name={name} />
      )}
    </span>
  );
}

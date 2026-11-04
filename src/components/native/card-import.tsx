'use client';

// «استيراد من بطاقة الكاميرا» (MVP_draft.md 63.9, Desktop_Power_Ideas.md P-20), inside the desktop application only: the
// person picks a camera's card or a folder of it in Windows' dialog, sees its recordings (a recording the camera split
// in parts shown as one), keeps or leaves each, and picks the folder they are copied to. Every copy is checked against
// the card before it is used; what was copied can then be added from «هذا الجهاز», and its light copy is made while the
// laptop is free. No path is ever shown or sent: the application names the card, the folder and each recording.
import { useEffect, useState } from 'react';
import { HardDriveDownload, X } from 'lucide-react';
import { native, type NativeCard } from '@/lib/native';
import { CARD_WORDS, cardDone, cardLine, cardWhy } from '@/lib/native/copies';
import type { DeviceCache } from '@/lib/studio/cache';
import { formatBytes } from '@/lib/studio/support';

export function CardImport({ cache, onDone }: { cache: DeviceCache; onDone: () => void }) {
  const files = native().raw?.files;
  const [card, setCard] = useState<NativeCard | null>(null);
  const [keep, setKeep] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<{ done: string; failed: string[] } | null>(null);
  useEffect(() => {
    files?.onCard?.((p) => setProgress(p.total > 0 ? Math.min(99, Math.round((p.done / p.total) * 100)) : 0));
    return () => files?.onCard?.(null);
  }, [files]);
  if (!files?.importCard) return null;

  const pick = async () => {
    setResult(null);
    const c = await files.importCard!().catch(() => null);
    if (!c) return;
    setCard(c);
    setKeep(new Set(c.items.map((i) => i.key)));
  };
  const copy = async () => {
    if (!card || !keep.size) return;
    setProgress(0);
    try {
      const r = await files.copyCard!({ id: card.id, keys: card.items.filter((i) => keep.has(i.key)).map((i) => i.key) }).catch(() => null);
      if (!r) return;
      const name = (key: string) => card.items.find((i) => i.key === key)?.name ?? key;
      setResult({ done: cardDone(r.results.filter((x) => x.ok).length, r.folder), failed: r.results.flatMap((x) => (x.ok ? [] : [`${name(x.key)}: ${cardWhy(x.why)}`])) });
      cache.wantFiles(r.results.flatMap((x) => (x.ok ? [x.file] : [])));
      setCard(null);
      onDone();
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="st-card-import" data-card-import>
      {!card && (
        <button type="button" className="st-mini" onClick={() => void pick()}>
          <HardDriveDownload aria-hidden="true" />
          {CARD_WORDS.action}
        </button>
      )}
      {card && (
        <>
          <p className="st-hint">
            {card.items.length ? cardLine(card.label, card.items.length, formatBytes(card.items.reduce((n, i) => n + i.size, 0))) : CARD_WORDS.none}
          </p>
          {card.items.length > 0 && (
            <ul className="st-locals">
              {card.items.map((i) => (
                <li key={i.key}>
                  <label>
                    <input
                      type="checkbox"
                      checked={keep.has(i.key)}
                      disabled={progress !== null}
                      onChange={(e) => {
                        const next = new Set(keep);
                        if (e.target.checked) next.add(i.key);
                        else next.delete(i.key);
                        setKeep(next);
                      }}
                    />
                    <span dir="auto">{i.name}</span>
                  </label>
                  <small>
                    {formatBytes(i.size)}
                    {i.parts > 1 ? ` · ${CARD_WORDS.joined} (${i.parts})` : ''}
                  </small>
                </li>
              ))}
            </ul>
          )}
          <p className="st-hint">{CARD_WORDS.hint}</p>
          {progress === null ? (
            <div className="actions">
              <button type="button" className="st-mini" disabled={!keep.size} onClick={() => void copy()}>
                {CARD_WORDS.copy}
              </button>
              <button type="button" className="st-mini" onClick={() => setCard(null)}>
                {CARD_WORDS.cancel}
              </button>
            </div>
          ) : (
            <div className="actions">
              <p className="st-hint" role="status">
                {CARD_WORDS.hint.replace('.', '')} ({progress}٪)…
              </p>
              <button type="button" className="st-mini" onClick={() => void files.cancelCard?.(card.id)}>
                <X aria-hidden="true" />
                {CARD_WORDS.cancel}
              </button>
            </div>
          )}
        </>
      )}
      {result && (
        <>
          <p className="st-hint" role="status" data-card-done>
            {result.done}
          </p>
          {result.failed.map((line) => (
            <p key={line} className="st-hint st-warn">
              {line}
            </p>
          ))}
        </>
      )}
    </div>
  );
}

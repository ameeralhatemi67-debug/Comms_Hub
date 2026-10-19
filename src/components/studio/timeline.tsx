'use client';

// The studio's timeline (MVP_draft.md 62). Time runs left to right inside the right-to-left page, as in
// every editor; the track names stay Arabic. A clip is moved by dragging it (onto another track of its
// kind too), trimmed by its edges, and snaps to clip edges and the playhead. The ruler scrubs.
import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Eye, EyeOff, Lock, Unlock, Volume2, VolumeX, Plus } from 'lucide-react';
import { TRACK_LABELS, TRACK_LIMITS, US, durationOf, type Clip, type Micros, type ProjectDoc, type Track, type TrackKind } from '@/lib/studio/schema';
import { legalStart, snapPoints, snapTo, sourceOf } from '@/lib/studio/timeline';
import { shortTime } from '@/lib/studio/time';
import type { SourceState } from '@/lib/studio/media';
import { graphicById } from '@/lib/studio/motion-adapter';

export const ROW_H = 54;
export const ROW_H_PHONE = 62;
const SNAP_PX = 8;

export type TimelineProps = {
  doc: ProjectDoc;
  t: Micros;
  /** Pixels per second. */
  zoom: number;
  selected: string | null;
  readOnly: boolean;
  /** A phone: tracks are not added here; rows and edges are finger-sized. */
  compact?: boolean;
  stateOf: (sourceId: string) => SourceState | undefined;
  onSelect: (id: string | null) => void;
  onSeek: (t: Micros) => void;
  /** A drag in progress (`key` joins its steps into one undo step). */
  onMove: (id: string, start: Micros, trackId: string, key: string) => void;
  onTrim: (id: string, edge: 'start' | 'end', to: Micros, key: string) => void;
  onTrack: (id: string, patch: Partial<Pick<Track, 'muted' | 'hidden' | 'locked'>>) => void;
  onAddTrack: (kind: TrackKind) => void;
};

export function clipLabel(doc: ProjectDoc, c: Clip): string {
  if (c.text) return c.text.content.split('\n')[0] || 'نص';
  if (c.motion) return graphicById(c.motion.template)?.name ?? 'قالب حركة';
  if (c.sticker) return 'علامة الهوية';
  if (c.shape) return 'شكل';
  return sourceOf(doc, c.source)?.name ?? 'ملف';
}

const kindClass = (doc: ProjectDoc, c: Clip) => (c.text ? 'text' : c.motion ? 'motion' : c.sticker || c.shape ? 'mark' : sourceOf(doc, c.source)?.media ?? 'video');

type Drag = { id: string; mode: 'move' | 'start' | 'end'; x0: number; y0: number; start0: number; len0: number; track0: string; key: string };

export function Timeline(p: TimelineProps) {
  const { doc, zoom } = p;
  const rowH = p.compact ? ROW_H_PHONE : ROW_H;
  const tracks = doc.video?.tracks ?? [];
  const total = Math.max(durationOf(doc), p.t) + 10 * US;
  const width = Math.max(600, (total / US) * zoom);
  const lanes = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const px = useCallback((us: Micros) => (us / US) * zoom, [zoom]);
  const us = useCallback((x: number) => Math.round((x / zoom) * US), [zoom]);

  const timeAt = (clientX: number) => {
    const el = lanes.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.max(0, us(clientX - r.left));
  };

  const onRuler = (e: RPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    p.onSeek(timeAt(e.clientX));
  };

  const startDrag = (e: RPointerEvent, c: Clip, track: Track, mode: Drag['mode']) => {
    e.stopPropagation();
    p.onSelect(c.id);
    if (p.readOnly || track.locked) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDrag({ id: c.id, mode, x0: e.clientX, y0: e.clientY, start0: c.start, len0: c.length, track0: track.id, key: `${mode}-${c.id}-${Date.now()}` });
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const dt = us(e.clientX - drag.x0);
      const pts = snapPoints(doc, drag.id, [p.t]);
      const tol = us(SNAP_PX);
      if (drag.mode === 'move') {
        const track0 = tracks.find((t) => t.id === drag.track0)!;
        const same = tracks.filter((t) => t.kind === track0.kind && !t.locked);
        const rows = Math.round((e.clientY - drag.y0) / rowH);
        const idx = tracks.indexOf(track0) + rows;
        const dest = tracks[Math.max(0, Math.min(tracks.length - 1, idx))];
        const target = dest && same.includes(dest) ? dest : track0;
        let start = drag.start0 + dt;
        const snappedStart = snapTo(start, pts, tol);
        const snappedEnd = snapTo(start + drag.len0, pts, tol) - drag.len0;
        start = Math.abs(snappedStart - start) <= Math.abs(snappedEnd - start) ? snappedStart : snappedEnd;
        const clip = target.clips.find((c) => c.id === drag.id) ?? tracks.flatMap((t) => t.clips).find((c) => c.id === drag.id)!;
        const legal = legalStart(target, { ...clip, start }, start);
        if (legal !== null) p.onMove(drag.id, legal, target.id, drag.key);
      } else if (drag.mode === 'start') p.onTrim(drag.id, 'start', snapTo(drag.start0 + dt, pts, tol), drag.key);
      else p.onTrim(drag.id, 'end', snapTo(drag.start0 + drag.len0 + dt, pts, tol), drag.key);
    };
    const up = () => setDrag(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [drag, doc, p, tracks, us]);

  // seconds marks on the ruler, spaced to stay readable at any zoom
  const step = zoom >= 120 ? 1 : zoom >= 50 ? 2 : zoom >= 20 ? 5 : zoom >= 8 ? 10 : 30;
  const marks: number[] = [];
  for (let s = 0; s <= total / US; s += step) marks.push(s);

  const kinds = (Object.keys(TRACK_LIMITS) as TrackKind[]).filter((k) => tracks.filter((t) => t.kind === k).length < TRACK_LIMITS[k]);

  return (
    <div className="st-tl" aria-label="الخط الزمني" data-compact={p.compact ? 'yes' : 'no'}>
      <div className="st-tl-heads">
        <div className="st-tl-corner">
          {!p.readOnly && !p.compact && kinds.length > 0 && (
            <details className="st-tl-add">
              <summary aria-label="إضافة مسار">
                <Plus aria-hidden="true" />
                مسار
              </summary>
              <div>
                {kinds.map((k) => (
                  <button key={k} type="button" onClick={() => p.onAddTrack(k)}>
                    {TRACK_LABELS[k]}
                  </button>
                ))}
              </div>
            </details>
          )}
        </div>
        {tracks.map((t) => (
          <div key={t.id} className="st-tl-head" data-kind={t.kind} style={{ height: rowH }}>
            <span>{TRACK_LABELS[t.kind]}</span>
            <span className="st-tl-flags">
              {t.kind !== 'audio' && (
                <button type="button" aria-pressed={!!t.hidden} aria-label={t.hidden ? 'إظهار المسار' : 'إخفاء المسار'} title={t.hidden ? 'إظهار المسار' : 'إخفاء المسار'} onClick={() => p.onTrack(t.id, { hidden: !t.hidden })}>
                  {t.hidden ? <EyeOff /> : <Eye />}
                </button>
              )}
              {(t.kind === 'audio' || t.kind === 'video') && (
                <button type="button" aria-pressed={!!t.muted} aria-label={t.muted ? 'تشغيل صوت المسار' : 'كتم صوت المسار'} title={t.muted ? 'تشغيل صوت المسار' : 'كتم صوت المسار'} onClick={() => p.onTrack(t.id, { muted: !t.muted })}>
                  {t.muted ? <VolumeX /> : <Volume2 />}
                </button>
              )}
              <button type="button" aria-pressed={!!t.locked} aria-label={t.locked ? 'فتح قفل المسار' : 'قفل المسار'} title={t.locked ? 'فتح قفل المسار' : 'قفل المسار'} onClick={() => p.onTrack(t.id, { locked: !t.locked })}>
                {t.locked ? <Lock /> : <Unlock />}
              </button>
            </span>
          </div>
        ))}
      </div>
      <div className="st-tl-scroll" dir="ltr">
        <div className="st-tl-body" style={{ width }}>
          <div className="st-tl-ruler" onPointerDown={onRuler} onPointerMove={(e) => e.buttons === 1 && p.onSeek(timeAt(e.clientX))} role="slider" aria-label="موضع التشغيل" aria-valuemin={0} aria-valuemax={Math.round(durationOf(doc) / US)} aria-valuenow={Math.round(p.t / US)} aria-valuetext={shortTime(p.t)} tabIndex={0}>
            {marks.map((s) => (
              <span key={s} style={{ left: px(s * US) }}>
                {shortTime(s * US)}
              </span>
            ))}
          </div>
          <div className="st-tl-lanes" ref={lanes} onPointerDown={(e) => e.target === e.currentTarget && p.onSelect(null)}>
            {tracks.map((t) => (
              <div key={t.id} className="st-tl-lane" data-kind={t.kind} data-locked={t.locked ? 'yes' : 'no'} data-hidden={t.hidden ? 'yes' : 'no'} style={{ height: rowH }} onPointerDown={(e) => e.target === e.currentTarget && p.onSelect(null)}>
                {t.clips.map((c) => {
                  const src = c.source ? p.stateOf(c.source) : undefined;
                  const missing = src?.kind === 'missing' || src?.kind === 'error';
                  return (
                    <div
                      key={c.id}
                      className="st-clip"
                      data-kind={kindClass(doc, c)}
                      data-selected={p.selected === c.id ? 'yes' : 'no'}
                      data-missing={missing ? 'yes' : 'no'}
                      data-clip={c.id}
                      style={{ left: px(c.start), width: Math.max(6, px(c.length)) }}
                      onPointerDown={(e) => startDrag(e, c, t, 'move')}
                      title={`${clipLabel(doc, c)} · ${shortTime(c.length)}`}
                    >
                      {c.transition && <i className="st-clip-xfade" style={{ width: px(c.transition.length) }} aria-hidden="true" />}
                      <span dir="auto">{clipLabel(doc, c)}</span>
                      {src?.kind === 'loading' && <em className="st-clip-load" style={{ width: `${src.total ? Math.round((src.done / src.total) * 100) : 5}%` }} />}
                      {!p.readOnly && !t.locked && (
                        <>
                          <b className="st-clip-edge start" onPointerDown={(e) => startDrag(e, c, t, 'start')} aria-hidden="true" />
                          <b className="st-clip-edge end" onPointerDown={(e) => startDrag(e, c, t, 'end')} aria-hidden="true" />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            <div className="st-tl-playhead" style={{ left: px(p.t) }} aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

// The studio's timeline (MVP_draft.md 62, 62.5). Time runs left to right inside the right-to-left page, as
// in every editor; the track names stay Arabic. With the selection tool a clip is moved by dragging it
// (onto another track of its kind too) and trimmed by its edges; the razor cuts where it is clicked; the
// hand scrolls. Moves snap to clip edges and the playhead (a gold line shows the snap; Shift+S turns it
// off). Files, templates, texts and marks dragged from the other windows are dropped onto a track at the
// time pointed to; a transition or a movement is dropped onto a clip near its start or its end. Ctrl and
// the wheel zoom about the pointer; a right click opens the clip's menu.
import { useCallback, useEffect, useRef, useState, type DragEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import {
  Eye, EyeOff, Lock, Unlock, Volume2, VolumeX, Plus, MousePointer2, Scissors, Hand, Magnet, Undo2, Redo2, Trash2, ZoomIn, Maximize, Film, Image as ImageIcon, Music, Sparkles, Type, Stamp, Copy, ClipboardPaste, ArrowLeftToLine, Blend, Mic,
} from 'lucide-react';
import { TRACK_LABELS, TRACK_LIMITS, US, durationOf, type Clip, type Micros, type ProjectDoc, type Track, type TrackKind } from '@/lib/studio/schema';
import { legalStart, snapPoints, snapTo, sourceOf } from '@/lib/studio/timeline';
import { shortTime } from '@/lib/studio/time';
import { animLabel, transitionLabel } from '@/lib/studio/transitions';
import { KEY_TOLERANCE, keyTimes } from '@/lib/studio/keys';
import { isHold, retimed, speedAt } from '@/lib/studio/speed';
import { coverLabel } from '@/lib/studio/cover';
import { markerHex, markersOf } from '@/lib/studio/markers';
import { peakIn } from '@/lib/studio/peaks';
import { roleOf } from '@/lib/studio/timeline';
import { withKeys } from '@/lib/studio/shortcuts';
import type { SourceState } from '@/lib/studio/media';
import { graphicById } from '@/lib/studio/motion-adapter';
import { ADD_MIME, type AddDrop } from './bin';
import { EFFECT_MIME, type EffectDrop } from './effects-panel';
import type { Tool } from './stage';

export const ROW_H = 54;
export const ROW_H_PHONE = 62;
const SNAP_PX = 8;

export type ClipMenu = { split: () => void; copy: () => void; paste: () => void; duplicate: () => void; remove: () => void; ripple: () => void; transition: () => void; mute: () => void; muted: boolean; audible: boolean; canPaste: boolean };

export type TimelineProps = {
  doc: ProjectDoc;
  t: Micros;
  /** Pixels per second. */
  zoom: number;
  onZoom?: (z: number) => void;
  /** Changes when «الخط الزمني كله في النافذة» is asked for. */
  fitSignal?: number;
  selected: string | null;
  readOnly: boolean;
  /** A phone: tracks are not added here; rows and edges are finger-sized. */
  compact?: boolean;
  tool?: Tool;
  snap?: boolean;
  stateOf: (sourceId: string) => SourceState | undefined;
  onSelect: (id: string | null) => void;
  onSeek: (t: Micros) => void;
  /** A drag in progress (`key` joins its steps into one undo step). */
  onMove: (id: string, start: Micros, trackId: string, key: string) => void;
  onTrim: (id: string, edge: 'start' | 'end', to: Micros, key: string) => void;
  onTrack: (id: string, patch: Partial<Pick<Track, 'muted' | 'hidden' | 'locked'>>) => void;
  onAddTrack: (kind: TrackKind) => void;
  onSplitAt?: (id: string, at: Micros) => void;
  onDropAdd?: (d: AddDrop, trackId: string | null, at: Micros) => void;
  onDropEffect?: (e: EffectDrop, clipId: string, where: 'start' | 'end') => void;
  clipMenu?: (id: string) => ClipMenu;
  /** A source's waveform (MVP_draft.md 62.9), or null while it is worked out or when it has no sound. */
  peaksOf?: (sourceId: string) => Float32Array | null;
  /** A sound track's part in the mix switched between speech and music. */
  onTrackRole?: (id: string, role: 'voice' | 'music') => void;
  /** A key diamond of the selected clip dragged from one clip time to another (`key` joins the steps). */
  onMoveKey?: (id: string, from: Micros, to: Micros, key: string) => void;
};

/** A clip's waveform: one bar every two pixels, the loudest moment of its stretch of source. */
function ClipWave({ peaks, clip, zoom, width, height }: { peaks: Float32Array; clip: Clip; zoom: number; width: number; height: number }) {
  const step = 2;
  const half = height / 2;
  let d = '';
  for (let x = 0; x < width; x += step) {
    const from = ((clip.in ?? 0) / US) + x / zoom;
    const v = peakIn(peaks, from, from + step / zoom);
    const h = Math.max(0.5, v * half);
    d += `M${x + 0.5} ${(half - h).toFixed(1)}V${(half + h).toFixed(1)}`;
  }
  return (
    <svg className="st-clip-wave" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" preserveAspectRatio="none">
      <path d={d} />
    </svg>
  );
}

/** A short word on a re-timed clip: its speed, «متدرج» for a ramp, «معكوس», or «ثابت» for a still. */
export function retimeLabel(c: Clip): string | null {
  if (!retimed(c)) return null;
  if (isHold(c)) return 'ثابت';
  const parts: string[] = [];
  if (c.keys?.speed?.length) parts.push('متدرج');
  else if ((c.speed ?? 1) !== 1) parts.push(`${Math.round(speedAt(c, 0) * 100) / 100}×`);
  if (c.reverse) parts.push('معكوس');
  return parts.join(' ');
}

export function clipLabel(doc: ProjectDoc, c: Clip): string {
  if (c.text) return c.text.content.split('\n')[0] || 'نص';
  if (c.motion) return graphicById(c.motion.template)?.name ?? 'قالب حركة';
  if (c.sticker) return 'علامة الهوية';
  if (c.shape) return 'شكل';
  if (c.cover) return coverLabel(c.cover);
  return sourceOf(doc, c.source)?.name ?? 'ملف';
}

const kindClass = (doc: ProjectDoc, c: Clip) => (c.text ? 'text' : c.motion ? 'motion' : c.cover ? 'cover' : c.sticker || c.shape ? 'mark' : sourceOf(doc, c.source)?.media ?? 'video');
const KIND_ICON: Record<string, ReactNode> = { video: <Film aria-hidden="true" />, image: <ImageIcon aria-hidden="true" />, audio: <Music aria-hidden="true" />, motion: <Sparkles aria-hidden="true" />, text: <Type aria-hidden="true" />, mark: <Stamp aria-hidden="true" />, cover: <EyeOff aria-hidden="true" /> };
const TRACK_ICON: Record<TrackKind, ReactNode> = { video: <Film aria-hidden="true" />, graphics: <Sparkles aria-hidden="true" />, text: <Type aria-hidden="true" />, audio: <Music aria-hidden="true" /> };

type Drag = { id: string; mode: 'move' | 'start' | 'end'; x0: number; y0: number; start0: number; len0: number; track0: string; key: string };

/** The bar above the timeline: tools, undo, cut, delete, snapping, zoom. */
export function TimelineBar({
  tool, onTool, snap, onSnap, zoom, onZoom, onFit, undo, redo, canUndo, canRedo, undoTitle, redoTitle, split, remove, hasSelection, readOnly, compact, onRecord,
}: {
  tool: Tool;
  onTool: (t: Tool) => void;
  snap: boolean;
  onSnap: (v: boolean) => void;
  zoom: number;
  onZoom: (z: number) => void;
  onFit: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoTitle: string;
  redoTitle: string;
  split: () => void;
  remove: () => void;
  hasSelection: boolean;
  readOnly: boolean;
  compact?: boolean;
  /** «تسجيل صوت» (a computer only). */
  onRecord?: () => void;
}) {
  const tools: { id: Tool; icon: ReactNode; label: string; key: string }[] = [
    { id: 'select', icon: <MousePointer2 aria-hidden="true" />, label: 'أداة التحديد', key: 'tool-select' },
    { id: 'razor', icon: <Scissors aria-hidden="true" />, label: 'أداة الشفرة', key: 'tool-razor' },
    { id: 'hand', icon: <Hand aria-hidden="true" />, label: 'أداة اليد', key: 'tool-hand' },
    { id: 'text', icon: <Type aria-hidden="true" />, label: 'أداة النص', key: 'tool-text' },
  ];
  return (
    <div className="st-tl-bar" role="toolbar" aria-label="أدوات الخط الزمني">
      {!compact && (
        <div className="st-tools" role="radiogroup" aria-label="الأداة">
          {tools.map((x) => (
            <button key={x.id} type="button" role="radio" aria-checked={tool === x.id} data-on={tool === x.id ? 'yes' : 'no'} aria-label={x.label} title={withKeys(x.label, x.key)} onClick={() => onTool(x.id)} data-tool={x.id}>
              {x.icon}
            </button>
          ))}
        </div>
      )}
      <span className="st-tl-sep" aria-hidden="true" />
      {onRecord && !compact && (
        <button type="button" className="st-rec-btn" onClick={onRecord} disabled={readOnly} title="تسجيل صوت من الميكروفون عند رأس التشغيل" aria-label="تسجيل صوت">
          <Mic aria-hidden="true" />
        </button>
      )}
      <button type="button" onClick={undo} disabled={readOnly || !canUndo} title={`${undoTitle} (Ctrl+Z)`} aria-label={undoTitle}>
        <Undo2 aria-hidden="true" />
      </button>
      <button type="button" onClick={redo} disabled={readOnly || !canRedo} title={`${redoTitle} (Ctrl+Shift+Z)`} aria-label={redoTitle}>
        <Redo2 aria-hidden="true" />
      </button>
      <button type="button" onClick={split} disabled={readOnly || !hasSelection} title={withKeys('قص عند رأس التشغيل', 'split')}>
        <Scissors aria-hidden="true" />
        قص
      </button>
      <button type="button" onClick={remove} disabled={readOnly || !hasSelection} title={withKeys('حذف', 'delete')}>
        <Trash2 aria-hidden="true" />
        حذف
      </button>
      {!compact && (
        <button type="button" className="st-snap" aria-pressed={snap} data-on={snap ? 'yes' : 'no'} onClick={() => onSnap(!snap)} title={withKeys(snap ? 'الالتقاط يعمل' : 'الالتقاط متوقف', 'snap')} aria-label="الالتقاط">
          <Magnet aria-hidden="true" />
        </button>
      )}
      <label className="st-zoom">
        <ZoomIn aria-hidden="true" />
        <span className="sr-only">تكبير الخط الزمني</span>
        <input type="range" min={4} max={320} step={1} value={zoom} onChange={(e) => onZoom(Number(e.target.value))} aria-label="تكبير الخط الزمني" />
      </label>
      {!compact && (
        <button type="button" onClick={onFit} title={withKeys('الخط الزمني كله في النافذة', 'zoom-fit')} aria-label="الخط الزمني كله في النافذة">
          <Maximize aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function readEffect(e: DragEvent): EffectDrop | null {
  try {
    const raw = e.dataTransfer.getData(EFFECT_MIME);
    return raw ? (JSON.parse(raw) as EffectDrop) : null;
  } catch {
    return null;
  }
}
function readAdd(e: DragEvent): AddDrop | null {
  try {
    const raw = e.dataTransfer.getData(ADD_MIME);
    return raw ? (JSON.parse(raw) as AddDrop) : null;
  } catch {
    return null;
  }
}

export function Timeline(p: TimelineProps) {
  const { doc, zoom } = p;
  const tool = p.tool ?? 'select';
  const snapOn = p.snap ?? true;
  const rowH = p.compact ? ROW_H_PHONE : ROW_H;
  const tracks = doc.video?.tracks ?? [];
  const total = Math.max(durationOf(doc), p.t) + 10 * US;
  const width = Math.max(600, (total / US) * zoom);
  const lanes = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [snapLine, setSnapLine] = useState<Micros | null>(null);
  const [razorAt, setRazorAt] = useState<{ id: string; x: number } | null>(null);
  const [dropAt, setDropAt] = useState<{ track: string | null; x: number; clip?: string; where?: 'start' | 'end' } | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const px = useCallback((us: Micros) => (us / US) * zoom, [zoom]);
  const us = useCallback((x: number) => Math.round((x / zoom) * US), [zoom]);

  const timeAt = (clientX: number) => {
    const el = lanes.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.max(0, us(clientX - r.left));
  };

  // «الخط الزمني كله في النافذة»
  useEffect(() => {
    if (!p.fitSignal || !scroller.current || !p.onZoom) return;
    const w = scroller.current.clientWidth - 40;
    const d = Math.max(durationOf(doc), 5 * US) / US;
    p.onZoom(Math.max(4, Math.min(320, Math.floor(w / d))));
  }, [p.fitSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl (or Command) and the wheel zoom about the pointer
  useEffect(() => {
    const el = scroller.current;
    if (!el || !p.onZoom) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const at = (el.scrollLeft + e.clientX - r.left) / zoom;
      const next = Math.max(4, Math.min(320, Math.round(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
      p.onZoom!(next);
      requestAnimationFrame(() => (el.scrollLeft = at * next - (e.clientX - r.left)));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [zoom, p.onZoom]); // eslint-disable-line react-hooks/exhaustive-deps

  // the playhead stays in view while playing
  useEffect(() => {
    const el = scroller.current;
    if (!el || drag) return;
    const x = px(p.t);
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 30) el.scrollLeft = Math.max(0, x - el.clientWidth * 0.2);
  }, [p.t]); // eslint-disable-line react-hooks/exhaustive-deps

  const onRuler = (e: RPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    p.onSeek(timeAt(e.clientX));
  };

  const startHand = (e: RPointerEvent) => {
    const el = scroller.current;
    if (!el) return;
    const x0 = e.clientX;
    const s0 = el.scrollLeft;
    const move = (ev: PointerEvent) => (el.scrollLeft = s0 - (ev.clientX - x0));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const startDrag = (e: RPointerEvent, c: Clip, track: Track, mode: Drag['mode']) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (tool === 'hand') return startHand(e);
    if (tool === 'razor') {
      p.onSelect(c.id);
      if (!p.readOnly && !track.locked) p.onSplitAt?.(c.id, snapOn ? snapTo(timeAt(e.clientX), snapPoints(doc, null, [p.t]), us(4)) : timeAt(e.clientX));
      return;
    }
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
      const tol = snapOn ? us(SNAP_PX) : -1;
      const sn = (v: number) => (snapOn ? snapTo(v, pts, tol) : v);
      if (drag.mode === 'move') {
        const track0 = tracks.find((t) => t.id === drag.track0)!;
        const same = tracks.filter((t) => t.kind === track0.kind && !t.locked);
        const rows = Math.round((e.clientY - drag.y0) / rowH);
        const idx = tracks.indexOf(track0) + rows;
        const dest = tracks[Math.max(0, Math.min(tracks.length - 1, idx))];
        const target = dest && same.includes(dest) ? dest : track0;
        let start = drag.start0 + dt;
        const snappedStart = sn(start);
        const snappedEnd = sn(start + drag.len0) - drag.len0;
        const useStart = Math.abs(snappedStart - start) <= Math.abs(snappedEnd - start);
        start = useStart ? snappedStart : snappedEnd;
        setSnapLine(snapOn && (snappedStart !== drag.start0 + dt || snappedEnd !== drag.start0 + dt) ? (useStart ? start : start + drag.len0) : null);
        const clip = target.clips.find((c) => c.id === drag.id) ?? tracks.flatMap((t) => t.clips).find((c) => c.id === drag.id)!;
        const legal = legalStart(target, { ...clip, start }, start);
        if (legal !== null) p.onMove(drag.id, legal, target.id, drag.key);
      } else {
        const want = drag.mode === 'start' ? drag.start0 + dt : drag.start0 + drag.len0 + dt;
        const to = sn(want);
        setSnapLine(to !== want ? to : null);
        p.onTrim(drag.id, drag.mode, to, drag.key);
      }
    };
    const up = () => {
      setDrag(null);
      setSnapLine(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [drag, doc, p, tracks, us, snapOn, rowH]);

  useEffect(() => {
    if (!menu) return;
    const off = (e: PointerEvent) => !(e.target as HTMLElement).closest('.st-ctx') && setMenu(null);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null);
    window.addEventListener('pointerdown', off, true);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', off, true);
      window.removeEventListener('keydown', esc);
    };
  }, [menu]);

  // seconds marks on the ruler, spaced to stay readable at any zoom
  const step = zoom >= 160 ? 0.5 : zoom >= 90 ? 1 : zoom >= 40 ? 2 : zoom >= 18 ? 5 : zoom >= 8 ? 10 : 30;
  const marks: number[] = [];
  for (let s = 0; s <= total / US; s += step) marks.push(Math.round(s * 100) / 100);

  const kinds = (Object.keys(TRACK_LIMITS) as TrackKind[]).filter((k) => tracks.filter((t) => t.kind === k).length < TRACK_LIMITS[k]);

  const laneDrag = (e: DragEvent<HTMLDivElement>, track: Track) => {
    if (p.readOnly) return;
    const types = e.dataTransfer.types;
    if (types.includes(ADD_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setDropAt({ track: track.id, x: px(timeAt(e.clientX)) });
    }
  };
  const clipDrag = (e: DragEvent<HTMLDivElement>, c: Clip) => {
    if (p.readOnly || !e.dataTransfer.types.includes(EFFECT_MIME)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    const r = e.currentTarget.getBoundingClientRect();
    setDropAt({ track: null, x: 0, clip: c.id, where: e.clientX - r.left < r.width / 2 ? 'start' : 'end' });
  };

  const ctxMenu = menu && p.clipMenu ? p.clipMenu(menu.id) : null;

  // a key diamond dragged along its clip (the selected one)
  const startKeyDrag = (e: RPointerEvent, c: Clip, from: Micros) => {
    if (e.button !== 0 || p.readOnly || !p.onMoveKey) return;
    e.stopPropagation();
    e.preventDefault();
    const x0 = e.clientX;
    let cur = from;
    const key = `key-${c.id}-${Date.now()}`;
    const move = (ev: PointerEvent) => {
      const to = Math.max(0, Math.min(c.length, from + us(ev.clientX - x0)));
      if (Math.abs(to - cur) <= KEY_TOLERANCE) return;
      p.onMoveKey!(c.id, cur, to, key);
      cur = to;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="st-tl" aria-label="الخط الزمني" data-compact={p.compact ? 'yes' : 'no'} data-tool={tool}>
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
                    {TRACK_ICON[k]}
                    {TRACK_LABELS[k]}
                  </button>
                ))}
              </div>
            </details>
          )}
        </div>
        {tracks.map((t) => (
          <div key={t.id} className="st-tl-head" data-kind={t.kind} style={{ height: rowH }}>
            <span className="st-tl-name">
              {TRACK_ICON[t.kind]}
              {TRACK_LABELS[t.kind]}
            </span>
            <span className="st-tl-flags">
              {t.kind !== 'audio' && (
                <button type="button" aria-pressed={!!t.hidden} aria-label={t.hidden ? 'إظهار المسار' : 'إخفاء المسار'} title={t.hidden ? 'إظهار المسار' : 'إخفاء المسار'} onClick={() => p.onTrack(t.id, { hidden: !t.hidden })}>
                  {t.hidden ? <EyeOff /> : <Eye />}
                </button>
              )}
              {t.kind === 'audio' && p.onTrackRole && (
                <button type="button" className="st-tl-role" data-role={roleOf(t)} aria-label={roleOf(t) === 'voice' ? 'مسار كلام: انقر ليصير موسيقى' : 'مسار موسيقى: انقر ليصير كلاماً'} title={roleOf(t) === 'voice' ? 'كلام (يخفض الموسيقى تحته)' : `موسيقى${t.duck ? `، تنخفض ${t.duck} ديسيبل تحت الكلام` : ''}`} onClick={() => p.onTrackRole!(t.id, roleOf(t) === 'voice' ? 'music' : 'voice')}>
                  {roleOf(t) === 'voice' ? <Mic /> : <Music />}
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
      <div className="st-tl-scroll" dir="ltr" ref={scroller} onPointerDown={(e) => tool === 'hand' && e.button === 0 && startHand(e)}>
        <div className="st-tl-body" style={{ width }}>
          <div className="st-tl-ruler" onPointerDown={onRuler} onPointerMove={(e) => e.buttons === 1 && p.onSeek(timeAt(e.clientX))} role="slider" aria-label="موضع التشغيل" aria-valuemin={0} aria-valuemax={Math.round(durationOf(doc) / US)} aria-valuenow={Math.round(p.t / US)} aria-valuetext={shortTime(p.t)} tabIndex={0}>
            {marks.map((s) => (
              <span key={s} style={{ left: px(s * US) }} data-minor={Number.isInteger(s) ? 'no' : 'yes'}>
                {Number.isInteger(s) ? shortTime(s * US) : ''}
              </span>
            ))}
            {markersOf(doc).map((m) => (
              <button
                key={m.id}
                type="button"
                className="st-tl-marker"
                style={{ left: px(m.t), ['--mk' as string]: markerHex(m.color) }}
                title={`${m.label} · ${shortTime(m.t)}`}
                aria-label={`العلامة ${m.label} عند ${shortTime(m.t)}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  p.onSeek(m.t);
                }}
              />
            ))}
            <i className="st-tl-head-mark" style={{ left: px(p.t) }} aria-hidden="true" />
          </div>
          <div className="st-tl-lanes" ref={lanes} onPointerDown={(e) => e.target === e.currentTarget && tool !== 'hand' && p.onSelect(null)}>
            {tracks.map((t) => (
              <div
                key={t.id}
                className="st-tl-lane"
                data-kind={t.kind}
                data-locked={t.locked ? 'yes' : 'no'}
                data-hidden={t.hidden ? 'yes' : 'no'}
                data-track={t.id}
                style={{ height: rowH }}
                onPointerDown={(e) => e.target === e.currentTarget && tool !== 'hand' && p.onSelect(null)}
                onDragOver={(e) => laneDrag(e, t)}
                onDragLeave={() => setDropAt(null)}
                onDrop={(e) => {
                  const d = readAdd(e);
                  setDropAt(null);
                  if (!d || p.readOnly) return;
                  e.preventDefault();
                  p.onDropAdd?.(d, t.id, timeAt(e.clientX));
                }}
              >
                {dropAt?.track === t.id && <i className="st-tl-dropline" style={{ left: dropAt.x }} aria-hidden="true" />}
                {t.clips.map((c) => {
                  const src = c.source ? p.stateOf(c.source) : undefined;
                  const missing = src?.kind === 'missing' || src?.kind === 'error';
                  const kc = kindClass(doc, c);
                  const w = Math.max(6, px(c.length));
                  return (
                    <div
                      key={c.id}
                      className="st-clip"
                      data-kind={kc}
                      data-selected={p.selected === c.id ? 'yes' : 'no'}
                      data-missing={missing ? 'yes' : 'no'}
                      data-clip={c.id}
                      data-drop={dropAt?.clip === c.id ? dropAt.where : undefined}
                      style={{ left: px(c.start), width: w }}
                      onPointerDown={(e) => startDrag(e, c, t, 'move')}
                      onPointerMove={(e) => tool === 'razor' && setRazorAt({ id: c.id, x: e.clientX - e.currentTarget.getBoundingClientRect().left })}
                      onPointerLeave={() => setRazorAt(null)}
                      onContextMenu={(e) => {
                        if (!p.clipMenu) return;
                        e.preventDefault();
                        p.onSelect(c.id);
                        setMenu({ id: c.id, x: e.clientX, y: e.clientY });
                      }}
                      onDragOver={(e) => clipDrag(e, c)}
                      onDragLeave={() => setDropAt(null)}
                      onDrop={(e) => {
                        const fx = readEffect(e);
                        const where = dropAt?.where ?? 'start';
                        setDropAt(null);
                        if (!fx || p.readOnly) return;
                        e.preventDefault();
                        e.stopPropagation();
                        p.onDropEffect?.(fx, c.id, where);
                      }}
                      title={`${clipLabel(doc, c)} · ${shortTime(c.length)}${c.transition ? ` · انتقال: ${transitionLabel(c.transition.kind)}` : ''}${c.animIn ? ` · دخول: ${animLabel(c.animIn.kind)}` : ''}${c.animOut ? ` · خروج: ${animLabel(c.animOut.kind)}` : ''}`}
                    >
                      {c.transition && (
                        <i className="st-clip-xfade" style={{ width: px(c.transition.length) }} data-kind={c.transition.kind} aria-hidden="true">
                          {px(c.transition.length) > 22 && <Blend />}
                        </i>
                      )}
                      {c.source && !retimed(c) && !c.mute && p.peaksOf?.(c.source) && <ClipWave peaks={p.peaksOf(c.source)!} clip={c} zoom={zoom} width={Math.round(w)} height={Math.max(12, rowH - 12)} />}
                      {w > 40 && <span className="st-clip-ico">{KIND_ICON[kc]}</span>}
                      <span className="st-clip-name" dir="auto">{clipLabel(doc, c)}</span>
                      {w > 110 && <small className="st-clip-len" dir="ltr">{shortTime(c.length)}</small>}
                      {retimeLabel(c) && w > 60 && <small className="st-clip-speed">{retimeLabel(c)}</small>}
                      {p.selected === c.id &&
                        keyTimes(c.keys).map((kt) => (
                          <i
                            key={kt}
                            className="st-clip-key"
                            style={{ left: Math.max(0, Math.min(w, px(kt))) }}
                            onPointerDown={(e) => startKeyDrag(e, c, kt)}
                            onClick={(e) => {
                              e.stopPropagation();
                              p.onSeek(c.start + kt);
                            }}
                            title={`مفتاح عند ${shortTime(c.start + kt)}: اسحبه لتنقله، وانقره لتذهب إليه`}
                            aria-hidden="true"
                          />
                        ))}
                      {(c.animIn || (c.fadeIn ?? 0) > 0) && <i className="st-clip-anim in" style={{ width: Math.min(w / 2, px(c.animIn?.length ?? c.fadeIn ?? 0)) }} aria-hidden="true" />}
                      {(c.animOut || (c.fadeOut ?? 0) > 0) && <i className="st-clip-anim out" style={{ width: Math.min(w / 2, px(c.animOut?.length ?? c.fadeOut ?? 0)) }} aria-hidden="true" />}
                      {src?.kind === 'loading' && <em className="st-clip-load" style={{ width: `${src.total ? Math.round((src.done / src.total) * 100) : 5}%` }} />}
                      {razorAt?.id === c.id && <i className="st-clip-razor" style={{ left: razorAt.x }} aria-hidden="true" />}
                      {!p.readOnly && !t.locked && tool === 'select' && (
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
            {snapLine !== null && <div className="st-tl-snap" style={{ left: px(snapLine) }} aria-hidden="true" />}
            <div className="st-tl-playhead" style={{ left: px(p.t) }} aria-hidden="true" />
          </div>
        </div>
      </div>
      {menu && ctxMenu && (
        <div className="st-menu st-ctx" role="menu" style={{ left: menu.x, top: menu.y }} dir="rtl">
          {[
            { label: 'قص عند رأس التشغيل', keys: 'S', icon: <Scissors aria-hidden="true" />, run: ctxMenu.split, off: p.readOnly },
            { label: 'نسخ', keys: 'Ctrl+C', icon: <Copy aria-hidden="true" />, run: ctxMenu.copy },
            { label: 'لصق عند رأس التشغيل', keys: 'Ctrl+V', icon: <ClipboardPaste aria-hidden="true" />, run: ctxMenu.paste, off: p.readOnly || !ctxMenu.canPaste },
            { label: 'تكرار', keys: 'Ctrl+D', icon: <Copy aria-hidden="true" />, run: ctxMenu.duplicate, off: p.readOnly },
            { label: 'انتقال افتراضي عند البداية', keys: 'Shift+D', icon: <Blend aria-hidden="true" />, run: ctxMenu.transition, off: p.readOnly },
            ...(ctxMenu.audible ? [{ label: ctxMenu.muted ? 'تشغيل صوت المقطع' : 'كتم صوت المقطع', keys: '', icon: ctxMenu.muted ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />, run: ctxMenu.mute, off: p.readOnly }] : []),
            { label: 'حذف', keys: 'Delete', icon: <Trash2 aria-hidden="true" />, run: ctxMenu.remove, off: p.readOnly },
            { label: 'حذف وسد الفراغ', keys: 'Shift+Delete', icon: <ArrowLeftToLine aria-hidden="true" />, run: ctxMenu.ripple, off: p.readOnly },
          ].map((it) => (
            <div key={it.label} className="st-menu-row">
              <button type="button" role="menuitem" disabled={it.off} onClick={() => (setMenu(null), it.run())}>
                <span className="st-menu-ico">{it.icon}</span>
                <span className="st-menu-text">{it.label}</span>
                {it.keys && <kbd dir="ltr">{it.keys}</kbd>}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

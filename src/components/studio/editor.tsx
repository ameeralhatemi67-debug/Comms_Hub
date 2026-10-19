'use client';

// The video editor (MVP_draft.md 62): media panel, preview and inspector above the timeline. Every
// change makes a new document, goes into the studio's own undo history, and is handed to the project
// shell, which autosaves it. Media come from the device cache; the 26 templates and the brand marks
// from the template tab's renderers and files.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Redo2, Undo2, ZoomIn, Scissors, Trash2 } from 'lucide-react';
import { canOpen } from '@/lib/access';
import { useAccount } from '@/lib/account-context';
import { loadAssets } from '@/lib/motion/renderers.js';
import type { Graphic } from '@/lib/motion/types';
import { FONTS, STICKERS, US, canvasOf, type Clip, type Micros, type NewClip, type ProjectDoc, type StickerKey } from '@/lib/studio/schema';
import { historyOf, record, undo, redo, historyKey, undoLabel, redoLabel, type History } from '@/lib/studio/history';
import {
  addClip, addSource, addTrack, duplicateClip, locate, moveClip, removeClip, setTrack, setTransition, splitClip, trimEnd, trimStart, updateClip, visibleAt, maxLengthOf,
} from '@/lib/studio/timeline';
import { MotionRenderer, graphicById, loadSticker, motionClip } from '@/lib/studio/motion-adapter';
import { captionStyle, defaultText, loadFonts, parseSrt } from '@/lib/studio/text';
import { fillWindow } from '@/lib/studio/compose';
import { DeviceCache } from '@/lib/studio/cache';
import { MediaPool, probeFile, type SourceState } from '@/lib/studio/media';
import { Player } from '@/lib/studio/preview';
import { frameUs } from '@/lib/studio/time';
import { Modal } from '../ui';
import { Bin, type LibraryItem } from './bin';
import { CachePanel } from './cache-panel';
import { ExportPanel } from './export-panel';
import { FolderSelect } from './folder-picker';
import { Inspector } from './inspector';
import { librarySource, uploadToLibrary } from './library';
import type { EditorProps } from './project-shell';
import { Stage, drawOutline, drawSafeZones } from './stage';
import { Timeline } from './timeline';
import '../motion-studio.css';
import './editor.css';

/** What a source's state means for the person, or null when it is ready. */
export function sourceNote(s: SourceState | undefined): string | null {
  if (!s) return null;
  if (s.kind === 'loading') return s.total ? `جارٍ نسخ الملف إلى هذا الجهاز (${Math.round((s.done / s.total) * 100)}٪)…` : 'جارٍ تجهيز الملف…';
  if (s.kind === 'missing') return s.why === 'device' ? 'هذا الملف على جهاز آخر («على هذا الجهاز فقط» حيث أُضيف)، فلا يُعرض هنا.' : s.why === 'denied' ? 'لا تملك صلاحية هذا الملف في المكتبة، فيبقى في المشروع دون عرض.' : 'لم يعد هذا الملف في المكتبة.';
  if (s.kind === 'error') return s.message;
  return null;
}

/** The project's media, shared by the video and photo editors: the device cache, the pool, a tick on change. */
export function useStudioMedia(doc: ProjectDoc) {
  const [cache, setCache] = useState<DeviceCache | null | undefined>(undefined);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    void DeviceCache.open().then((c) => live && setCache(c));
    return () => {
      live = false;
    };
  }, []);
  const pool = useMemo(() => (cache === undefined ? null : new MediaPool({ cache, onChange: () => setTick((x) => x + 1) })), [cache]);
  useEffect(() => () => pool?.dispose(), [pool]);
  useEffect(() => {
    pool?.ensure(doc);
  }, [pool, doc]);
  // the ten-day sweep runs once when the studio opens, leaving what this project uses
  const swept = useRef(false);
  useEffect(() => {
    if (!cache || !pool || swept.current) return;
    swept.current = true;
    void cache.sweep(pool.inUse(doc));
  }, [cache, pool, doc]);
  return { cache: cache ?? null, pool, tick, cacheReady: cache !== undefined };
}

/** Templates, brand marks and fonts are ready (each failure still lets the editor open). */
export function useStudioAssets() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void Promise.allSettled([
      loadAssets(),
      ...STICKERS.map((k) => loadSticker(k)),
      loadFonts(FONTS.flatMap((f) => f.weights.map((w) => ({ font: f.family, weight: w })))),
    ]).then(() => setReady(true));
  }, []);
  return ready;
}

/** The studio's own history over the shell's document: resets when the document comes from outside. */
export function useDocHistory(p: Pick<EditorProps, 'doc' | 'onChange' | 'readOnly'>) {
  const hist = useRef<History<ProjectDoc>>(historyOf(p.doc));
  const emitted = useRef(p.doc);
  const [, force] = useReducer((x: number) => x + 1, 0);
  if (p.doc !== emitted.current) {
    hist.current = historyOf(p.doc);
    emitted.current = p.doc;
  }
  const commit = useCallback(
    (h: History<ProjectDoc>) => {
      hist.current = h;
      emitted.current = h.present;
      force();
      p.onChange(h.present);
    },
    [p],
  );
  const apply = useCallback(
    (next: ProjectDoc, label: string, key: string | null = null) => {
      if (p.readOnly || next === hist.current.present) return;
      commit(record(hist.current, next, label, key));
    },
    [commit, p.readOnly],
  );
  /** A change that is not a step of its own (exact sizes read from a file). */
  const quiet = useCallback(
    (next: ProjectDoc) => {
      if (p.readOnly || next === hist.current.present) return;
      commit({ ...hist.current, present: next });
    },
    [commit, p.readOnly],
  );
  return {
    doc: hist.current.present,
    hist: hist.current,
    get: () => hist.current.present,
    apply,
    quiet,
    undo: () => !p.readOnly && hist.current.past.length && commit(undo(hist.current)),
    redo: () => !p.readOnly && hist.current.future.length && commit(redo(hist.current)),
  };
}

/** Exact sizes and lengths read from the files replace the library's approximate ones. */
export function useExactSources(doc: ProjectDoc, pool: MediaPool | null, tick: number, quiet: (d: ProjectDoc) => void) {
  useEffect(() => {
    if (!pool) return;
    let next = doc;
    for (const s of doc.sources) {
      const i = pool.info(s.id);
      if (!i) continue;
      const patch: Record<string, number> = {};
      if (i.duration && s.media !== 'image' && i.duration !== s.duration) patch.duration = i.duration;
      if (i.w && i.w !== s.w) patch.w = i.w;
      if (i.h && i.h !== s.h) patch.h = i.h;
      if (Object.keys(patch).length) next = { ...next, sources: next.sources.map((x) => (x.id === s.id ? ({ ...x, ...patch } as typeof x) : x)) };
    }
    if (next !== doc) quiet(next);
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function VideoEditor(p: EditorProps) {
  const account = useAccount();
  const canLibrary = canOpen(account, 'media');
  const h = useDocHistory(p);
  const doc = h.doc;
  const { w: W, h: H } = canvasOf(doc);
  const fps = doc.video?.fps ?? 30;
  const { cache, pool, tick, cacheReady } = useStudioMedia(doc);
  useExactSources(doc, pool, tick, h.quiet);
  const assetsReady = useStudioAssets();
  const motion = useMemo(() => new MotionRenderer(), []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [t, setT] = useState<Micros>(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [safe, setSafe] = useState(false);
  const [zoom, setZoom] = useState(40);
  const [uploading, setUploading] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const live = useRef({ doc, selected, safe });
  live.current = { doc, selected, safe };

  useEffect(() => {
    if (!pool || !canvasRef.current) return;
    const pl = new Player({
      canvas: canvasRef.current,
      pool,
      motion,
      getDoc: () => live.current.doc,
      scale: () => (canvasRef.current?.width ?? W) / canvasOf(live.current.doc).w,
      onTime: (tt, pp) => {
        setT(tt);
        setPlaying(pp);
      },
      overlay: (ctx, scale) => {
        const d = live.current.doc;
        if (live.current.safe) drawSafeZones(ctx, { width: ctx.canvas.width, ratio: d.video?.ratio ?? '' });
        const sel = live.current.selected ? locate(d, live.current.selected)?.clip ?? null : null;
        if (sel && !pl.playing) drawOutline(ctx, d, sel, pl.resolver(), scale);
      },
    });
    setPlayer(pl);
    return () => pl.dispose();
  }, [pool, motion]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (player && !player.playing) player.draw();
  }, [player, doc, selected, tick, assetsReady, safe]);

  const seek = useCallback((tt: Micros) => player?.seek(tt) ?? setT(tt), [player]);
  const at = player?.t ?? t;

  // ------------------------------------------------------------- adding
  const place = (d: ProjectDoc, clip: NewClip, label: string) => {
    const r = addClip(d, clip, { at });
    h.apply(r.doc, label);
    setSelected(r.clipId);
  };
  const addLibrary = (item: LibraryItem) => {
    const src = librarySource(item);
    const r = addSource(doc, src);
    const length = src.media === 'image' ? 5 * US : (src.duration ?? 5 * US);
    place(r.doc, { source: r.id, start: at, length, in: 0 }, 'إضافة ملف من المكتبة');
  };
  const addDevice = async (file: File, upload: boolean) => {
    setError(null);
    if (upload) return setUploading(file);
    if (!cache) return setError('هذا المتصفح لا يحفظ الملفات على الجهاز. ارفع الملف إلى المكتبة.');
    try {
      const info = await probeFile(file);
      if (!info) return setError('نوع هذا الملف غير مدعوم في الاستوديو.');
      const { key } = await cache.putLocal(file);
      const r = addSource(live.current.doc, { kind: 'local', key, name: file.name, media: info.media, mime: file.type, size: file.size, w: info.w, h: info.h, duration: info.duration });
      const length = info.media === 'image' ? 5 * US : (info.duration ?? 5 * US);
      place(r.doc, { source: r.id, start: at, length, in: 0 }, 'إضافة ملف من هذا الجهاز');
    } catch (e) {
      setError((e as Error).message || 'تعذّر قراءة الملف.');
    }
  };
  const addMotion = (g: Graphic) => place(doc, { ...motionClip(g, doc.video?.ratio ?? '9:16', at) }, 'إضافة قالب حركة');
  const addText = (kind: 'title' | 'body' | 'caption') => {
    const style = kind === 'caption' ? captionStyle('تعليق أسفل الشاشة') : kind === 'title' ? { ...defaultText('عنوان'), size: 110, weight: 700 } : { ...defaultText('نص'), size: 64, weight: 500 };
    const y = kind === 'caption' ? H * 0.84 : kind === 'title' ? H * 0.42 : H * 0.5;
    place(doc, { start: at, length: 3 * US, text: style, transform: { x: W / 2, y, scale: 1, rotation: 0, opacity: 1 } }, 'إضافة نص');
  };
  const addSrt = (text: string) => {
    const cues = parseSrt(text);
    if (!cues.length) return setError('لم يُعثر على ترجمة صالحة في الملف.');
    let d = addTrack(doc, 'text');
    const textTracks = d.video!.tracks.filter((x) => x.kind === 'text');
    const target = textTracks[textTracks.length - 1].id;
    for (const c of cues) d = addClip(d, { start: c.start, length: c.end - c.start, text: captionStyle(c.text), transform: { x: W / 2, y: H * 0.84, scale: 1, rotation: 0, opacity: 1 } }, { trackId: target, at: c.start }).doc;
    h.apply(d, `استيراد ${cues.length} سطر ترجمة`);
  };
  const addMark = (key: StickerKey, color: string) =>
    place(doc, { start: at, length: 4 * US, sticker: { key, color }, transform: { x: W * 0.78, y: H * 0.1, scale: 0.6, rotation: 0, opacity: 1 } }, 'إضافة علامة الهوية');

  // ------------------------------------------------------------- editing the selection
  const sel = selected ? locate(doc, selected) : null;
  const patch = (pt: Partial<Clip> | ((c: Clip) => Clip), label: string, key?: string) => selected && h.apply(updateClip(h.get(), selected, pt), label, key ? `${key}-${selected}` : null);
  const split = () => {
    if (!selected) return;
    const r = splitClip(doc, selected, at);
    if (r.secondId) {
      h.apply(r.doc, 'قص المقطع');
      setSelected(r.secondId);
    }
  };
  const remove = (ripple: boolean) => {
    if (!selected) return;
    h.apply(removeClip(doc, selected, ripple), ripple ? 'حذف وسد الفراغ' : 'حذف المقطع');
    setSelected(null);
  };
  const duplicate = () => {
    if (!selected) return;
    const r = duplicateClip(doc, selected);
    if (r.clipId) {
      h.apply(r.doc, 'نسخ المقطع');
      setSelected(r.clipId);
    }
  };
  const frameAbove = sel && sel.clip.source && doc.sources.find((s) => s.id === sel.clip.source)?.media !== 'audio'
    ? visibleAt(doc, at).map((v) => v.clip).find((c) => c.motion && graphicById(c.motion.template)?.winBox)
    : undefined;
  const sortedTrack = sel ? [...sel.track.clips].sort((a, b) => a.start - b.start) : [];
  const prev = sel ? sortedTrack[sortedTrack.indexOf(sel.clip) - 1] : undefined;
  const hasPrevAdjacent = !!prev && Math.abs(prev.start + prev.length - sel!.clip.start) <= 1;

  // ------------------------------------------------------------- keys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
      if (target?.closest('dialog')) return;
      const hk = historyKey(e, target);
      if (hk) {
        e.preventDefault();
        if (hk === 'undo') h.undo();
        else h.redo();
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        player?.toggle();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const n = (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? fps : 1);
        seek(at + n * frameUs(fps));
      } else if (e.key === 'Home') seek(0);
      else if (e.key === 'End') seek(Number.MAX_SAFE_INTEGER);
      else if ((e.key === 's' || e.key === 'S' || e.code === 'KeyS') && !e.ctrlKey && !e.metaKey) split();
      else if (e.key === 'Delete' || e.key === 'Backspace') remove(e.shiftKey);
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.code === 'KeyD')) {
        e.preventDefault();
        duplicate();
      } else if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const missing = doc.sources.map((s) => pool?.state(s.id)).filter((s) => s?.kind === 'missing' || s?.kind === 'error').length;

  return (
    <div className="st-editor" data-readonly={p.readOnly ? 'yes' : 'no'}>
      {error && (
        <p className="warning st-err" role="alert">
          {error}
          <button type="button" onClick={() => setError(null)} aria-label="إغلاق">×</button>
        </p>
      )}
      <div className="st-work">
        <Bin
          ratio={doc.video?.ratio ?? '9:16'}
          readOnly={p.readOnly}
          canLibrary={canLibrary}
          canDevice={cacheReady && !!cache}
          onLibrary={addLibrary}
          onDevice={(f, up) => void addDevice(f, up)}
          onMotion={addMotion}
          onText={addText}
          onSrt={addSrt}
          onMark={addMark}
          assetsReady={assetsReady}
        />
        <div className="st-center">
          <Stage
            doc={doc}
            player={player}
            canvasRef={canvasRef}
            t={t}
            playing={playing}
            safe={safe}
            onSafe={setSafe}
            selected={selected}
            readOnly={p.readOnly}
            onSelect={setSelected}
            onPlace={(id, x, y, key) => h.apply(updateClip(h.get(), id, (c) => ({ ...c, transform: { x, y, scale: c.transform?.scale ?? 1, rotation: c.transform?.rotation ?? 0, opacity: c.transform?.opacity ?? 1 } })), 'نقل على الإطار', key)}
            ready={assetsReady && !!pool}
            note={missing ? `${missing} من ملفات المشروع غير متاح هنا، ويبقى في المشروع.` : null}
          />
          <ExportPanel doc={doc} pool={pool} t={at} projectId={p.projectId} title={p.title} readOnly={p.readOnly} canLibrary={canLibrary} api={p.api} saveVersion={p.saveVersion} revision={p.revision} />
        </div>
        <Inspector
          doc={doc}
          clip={sel?.clip ?? null}
          onClip={patch}
          onDoc={(d, label, key) => h.apply(d, label, key ?? null)}
          readOnly={p.readOnly}
          canFillWindow={!!frameAbove}
          hasPrevAdjacent={hasPrevAdjacent}
          sourceNote={sel?.clip.source ? sourceNote(pool?.state(sel.clip.source)) : null}
          cachePanel={<CachePanel cache={cache} inUse={pool ? pool.inUse(doc) : new Set()} onChanged={() => player?.draw()} />}
          onLength={(us) => selected && h.apply(trimEnd(doc, selected, (sel?.clip.start ?? 0) + us), 'طول القالب')}
          actions={{
            split,
            duplicate,
            remove: () => remove(false),
            ripple: () => remove(true),
            fillWindow: () => {
              if (!sel || !frameAbove || !player) return;
              const tr = fillWindow(doc, sel.clip, frameAbove, player.resolver());
              if (tr) h.apply(updateClip(doc, sel.clip.id, { transform: tr, fit: 'contain' }), 'وضع الفيديو داخل الإطار');
            },
            setTransition: (us) => selected && h.apply(setTransition(h.get(), selected, us), 'مزج مع المقطع السابق', `xfade-${selected}`),
            setStart: (us) => selected && h.apply(moveClip(h.get(), selected, us), 'بداية المقطع', `start-${selected}`),
            setLength: (us) => selected && h.apply(trimEnd(h.get(), selected, (locate(h.get(), selected)?.clip.start ?? 0) + Math.min(us, maxLengthOf(h.get(), locate(h.get(), selected)!.clip))), 'مدة المقطع', `len-${selected}`),
          }}
        />
      </div>
      <div className="st-tl-bar">
        <button type="button" onClick={h.undo} disabled={p.readOnly || !h.hist.past.length} title={undoLabel(h.hist)} aria-label={undoLabel(h.hist)}>
          <Undo2 aria-hidden="true" />
        </button>
        <button type="button" onClick={h.redo} disabled={p.readOnly || !h.hist.future.length} title={redoLabel(h.hist)} aria-label={redoLabel(h.hist)}>
          <Redo2 aria-hidden="true" />
        </button>
        <button type="button" onClick={split} disabled={p.readOnly || !selected} title="قص عند رأس التشغيل (S)">
          <Scissors aria-hidden="true" />
          قص
        </button>
        <button type="button" onClick={() => remove(false)} disabled={p.readOnly || !selected} title="حذف (Delete)">
          <Trash2 aria-hidden="true" />
          حذف
        </button>
        <label className="st-zoom">
          <ZoomIn aria-hidden="true" />
          <span className="sr-only">تكبير الخط الزمني</span>
          <input type="range" min={6} max={240} step={1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="تكبير الخط الزمني" />
        </label>
      </div>
      <Timeline
        doc={doc}
        t={t}
        zoom={zoom}
        selected={selected}
        readOnly={p.readOnly}
        stateOf={(id) => pool?.state(id)}
        onSelect={setSelected}
        onSeek={seek}
        onMove={(id, start, trackId, key) => h.apply(moveClip(h.get(), id, start, trackId), 'نقل المقطع', key)}
        onTrim={(id, edge, to, key) => h.apply(edge === 'start' ? trimStart(h.get(), id, to) : trimEnd(h.get(), id, to), 'تعديل طرف المقطع', key)}
        onTrack={(id, pt) => h.apply(setTrack(doc, id, pt), 'إعدادات المسار')}
        onAddTrack={(k) => h.apply(addTrack(doc, k), 'إضافة مسار')}
      />
      {uploading && (
        <UploadDialog
          file={uploading}
          onClose={() => setUploading(null)}
          onDone={(row) => {
            setUploading(null);
            addLibrary({ id: row.id, name: row.name, kind: row.kind as LibraryItem['kind'], current_version: row.current_version, mime_type: row.mime_type, dims: row.dims, duration: row.duration });
          }}
        />
      )}
    </div>
  );
}

export function UploadDialog({ file, onClose, onDone }: { file: File; onClose: () => void; onDone: (row: Awaited<ReturnType<typeof uploadToLibrary>>) => void }) {
  const [folder, setFolder] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="رفع الملف إلى المكتبة" onClose={() => progress === null && onClose()}>
      <div className="st-form">
        <p dir="auto">{file.name}</p>
        <FolderSelect value={folder} onChange={setFolder} disabled={progress !== null} />
        {progress !== null && (
          <div className="st-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <i style={{ width: `${Math.round(progress * 100)}%` }} />
            <span>جارٍ رفع الملف {Math.round(progress * 100)}٪</span>
          </div>
        )}
        {error && <p className="warning" role="alert">{error}</p>}
        <div className="actions">
          <button
            type="button"
            className="primary"
            disabled={!folder || progress !== null}
            onClick={async () => {
              setError(null);
              setProgress(0);
              try {
                onDone(await uploadToLibrary(file, folder, setProgress));
              } catch (e) {
                setProgress(null);
                setError((e as Error).message || 'تعذّر رفع الملف.');
              }
            }}
          >
            رفع ثم استخدام
          </button>
          <button type="button" onClick={onClose} disabled={progress !== null}>
            إلغاء
          </button>
        </div>
      </div>
    </Modal>
  );
}

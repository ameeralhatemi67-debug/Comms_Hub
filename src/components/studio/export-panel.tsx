'use client';

// The export panel (MVP_draft.md 62): a video (MP4, or WebM where MP4 cannot be made) at 720p, 1080p
// or 4K, or the current frame as a picture; downloaded, or saved to the library as a new file in a
// folder the person may create in, or as a new version of a file (long press when the file has been in
// review; refused when it is published). Saving to the library first saves a numbered version of the
// project and records which version produced which library version (studio_export_record). The export
// runs in this page, with the screen kept awake; the page asks to stay visible.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Download, Film, Image as ImageIcon, Library, X } from 'lucide-react';
import { HOLD } from '@/lib/kit/hold-reasons';
import { durationOf, type Micros, type ProjectDoc } from '@/lib/studio/schema';
import { EXPORT_ERRORS, ExportError, SHORT_LABELS, estimateBytes, exportStill, exportVideo, fileName, outputSize, type ExportProgress, type Short, type VideoFormat } from '@/lib/studio/export';
import { download } from '@/lib/studio/target';
import { formatBytes, probeSupport } from '@/lib/studio/support';
import { shortTime } from '@/lib/studio/time';
import type { MediaPool } from '@/lib/studio/media';
import type { Resolver } from '@/lib/studio/compose';
import type { StudioApi } from '@/lib/studio/persist';
import { Segmented } from '../motion-controls';
import { FolderSelect } from './folder-picker';
import { REVIEWED_STAGES, assetRow, projectExports, uploadToLibrary, uploadVersion, type AssetRow } from './library';
import { linkFileToWork } from './work-links';

type Dest = 'device' | 'new' | 'version';
type Done = { kind: 'device'; name: string; bytes: number; url: string } | { kind: 'library'; name: string; asset: string; version: number };

export function ExportPanel({
  doc, pool, t, projectId, title, readOnly, canLibrary, api, saveVersion, revision, photo, adjusted, workRef = null, onSaved,
}: {
  doc: ProjectDoc;
  pool: MediaPool | null;
  t: Micros;
  projectId: string;
  title: string;
  readOnly: boolean;
  canLibrary: boolean;
  api: StudioApi;
  saveVersion: (note: string | null) => Promise<{ ok: boolean; error?: string }>;
  revision: () => number;
  /** A photo project: pictures only. */
  photo?: boolean;
  /** Photos: pictures already adjusted, as the editor shows them. */
  adjusted?: Resolver['adjusted'];
  /** The work the project belongs to: the saved file can be linked to it. */
  workRef?: string | null;
  /** A file was saved to the library (the review window reads again). */
  onSaved?: () => void;
}) {
  const [what, setWhat] = useState<'video' | 'still'>(photo ? 'still' : 'video');
  const [short, setShort] = useState<Short>(1080);
  const [stillType, setStillType] = useState<'image/png' | 'image/jpeg' | 'image/webp'>('image/png');
  const [format, setFormat] = useState<VideoFormat>('mp4');
  const [dest, setDest] = useState<Dest>('device');
  const [folder, setFolder] = useState('');
  const [targets, setTargets] = useState<AssetRow[]>([]);
  const [targetId, setTargetId] = useState('');
  const [progress, setProgress] = useState<{ label: string; f: number } | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [linkWork, setLinkWork] = useState(true);
  const [linkNote, setLinkNote] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const lastUrl = useRef<string | null>(null);

  // MP4 where the browser makes it, WebM otherwise
  useEffect(() => {
    void probeSupport().then((s) => setFormat(s.mp4 || !s.webm ? 'mp4' : 'webm'));
  }, []);
  // the files this project already saved to, offered first for a new version
  useEffect(() => {
    if (dest !== 'version') return;
    let live = true;
    void projectExports(projectId).then(async (rows) => {
      const seen = new Set<string>();
      const list: AssetRow[] = [];
      for (const r of rows) {
        if (seen.has(r.asset_id)) continue;
        seen.add(r.asset_id);
        const a = await assetRow(r.asset_id);
        if (a) list.push(a);
      }
      if (!live) return;
      setTargets(list);
      if (list[0] && !targetId) setTargetId(list[0].id);
    });
    return () => {
      live = false;
    };
  }, [dest, projectId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => {
    if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
  }, []);
  useEffect(() => {
    if (!progress) return;
    const onVis = () => setHidden(document.visibilityState === 'hidden');
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('beforeunload', warn);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('beforeunload', warn);
    };
  }, [progress]);

  const empty = !photo && durationOf(doc) <= 0;
  const size = outputSize(doc, photo ? Math.min(doc.photo!.w, doc.photo!.h) : short);
  const target = targets.find((x) => x.id === targetId);
  const published = dest === 'version' && target?.stage === 'published';
  const reviewed = dest === 'version' && !!target && REVIEWED_STAGES.includes(target.stage);
  const toLibrary = dest !== 'device';
  const ext = what === 'still' ? stillType.split('/')[1].replace('jpeg', 'jpg') : format;

  const run = async () => {
    if (!pool) return;
    setError(null);
    setDone(null);
    const ctl = new AbortController();
    abort.current = ctl;
    let lock: { release(): Promise<void> } | null = null;
    try {
      lock = (await (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen').catch(() => null)) ?? null;
      let rev = revision();
      if (toLibrary) {
        setProgress({ label: 'جارٍ حفظ نسخة من المشروع…', f: 0 });
        const saved = await saveVersion(what === 'still' ? 'قبل حفظ صورة في المكتبة' : 'قبل التصدير إلى المكتبة');
        if (!saved.ok) throw new Error(saved.error ?? 'تعذّر حفظ نسخة من المشروع.');
        rev = revision();
      }
      const name = fileName(title, ext);
      let file: File;
      if (what === 'still') {
        setProgress({ label: 'جارٍ إنشاء الصورة…', f: 0.5 });
        file = await exportStill(doc, pool, { t, name, type: stillType, short: photo ? undefined : short, adjusted });
      } else {
        const r = await exportVideo(doc, pool, {
          short,
          format,
          name,
          signal: ctl.signal,
          onProgress: (p: ExportProgress) => setProgress({ label: p.phase === 'prepare' ? 'جارٍ التجهيز…' : p.phase === 'finish' ? 'جارٍ إنهاء الملف…' : `جارٍ التصدير ${Math.round((p.done / p.total) * 100)}٪`, f: p.done / Math.max(1, p.total) }),
        });
        file = r.file;
      }
      if (!toLibrary) {
        if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
        lastUrl.current = download(file);
        setDone({ kind: 'device', name: file.name, bytes: file.size, url: lastUrl.current });
      } else {
        let asset: string;
        let version: number;
        if (dest === 'new') {
          const row = await uploadToLibrary(file, folder, (f) => setProgress({ label: `جارٍ رفع الملف ${Math.round(f * 100)}٪`, f }));
          asset = row.id;
          version = row.current_version;
        } else {
          asset = targetId;
          version = await uploadVersion(targetId, file, `من الاستوديو: ${title} (النسخة ${rev})`.slice(0, 200), (f) => setProgress({ label: `جارٍ رفع الإصدار ${Math.round(f * 100)}٪`, f }));
        }
        const rec = await api.exportRecord(projectId, rev, asset, version, what === 'still' ? 'image' : 'video');
        if (!rec.ok) throw new Error(rec.error);
        if (workRef && linkWork) {
          const err = await linkFileToWork(workRef, asset);
          setLinkNote(err ?? `رُبط الملف بالعمل ${workRef}.`);
        } else setLinkNote(null);
        setDone({ kind: 'library', name: file.name, asset, version });
        onSaved?.();
      }
    } catch (e) {
      const code = e instanceof ExportError ? e.code : (e as Error).message;
      setError(EXPORT_ERRORS[code] ?? ((e as Error).message || 'تعذّر التصدير.'));
    } finally {
      await lock?.release().catch(() => undefined);
      abort.current = null;
      setProgress(null);
      setHidden(false);
    }
  };

  const busy = !!progress;
  const blocked = empty || !pool || (toLibrary && (readOnly || !canLibrary || (dest === 'new' && !folder) || (dest === 'version' && (!targetId || published))));
  return (
    <section className="st-export" aria-label="التصدير">
      <h2>التصدير</h2>
      {!photo && (
        <Segmented
          label="ما يُصدَّر"
          size="sm"
          value={what}
          disabled={busy}
          onChange={setWhat}
          options={[
            { value: 'video', label: <><Film aria-hidden="true" /> {format === 'mp4' ? 'فيديو MP4' : 'فيديو WebM'}</> },
            { value: 'still', label: <><ImageIcon aria-hidden="true" /> صورة من الإطار الحالي</> },
          ]}
        />
      )}
      {(what === 'video' || !photo) && (
        <Segmented label="المقاس" size="sm" value={short} disabled={busy} onChange={setShort} options={([720, 1080, 2160] as Short[]).map((s) => ({ value: s, label: SHORT_LABELS[s], hint: `${outputSize(doc, s).w}×${outputSize(doc, s).h}` }))} />
      )}
      {what === 'still' && (
        <Segmented label="صيغة الصورة" size="sm" value={stillType} disabled={busy} onChange={setStillType} options={[{ value: 'image/png', label: 'PNG' }, { value: 'image/jpeg', label: 'JPEG' }, { value: 'image/webp', label: 'WebP' }]} />
      )}
      <Segmented
        label="إلى أين"
        size="sm"
        value={dest}
        disabled={busy}
        onChange={setDest}
        options={[
          { value: 'device', label: <><Download aria-hidden="true" /> تنزيل إلى الجهاز</> },
          { value: 'new', label: <><Library aria-hidden="true" /> ملف جديد في المكتبة</> },
          { value: 'version', label: 'إصدار جديد من ملف' },
        ]}
      />
      {toLibrary && !canLibrary && <p className="st-hint st-warn">الحفظ في المكتبة يحتاج صفحة «مكتبة الوسائط»، وهي غير مفتوحة لحسابك.</p>}
      {toLibrary && readOnly && <p className="st-hint st-warn">الحفظ في المكتبة يحفظ نسخة من المشروع أولاً، والتحرير الآن ليس لك.</p>}
      {dest === 'new' && canLibrary && <FolderSelect value={folder} onChange={setFolder} disabled={busy} />}
      {dest === 'version' && canLibrary && (
        targets.length ? (
          <label>
            الملف
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)} disabled={busy}>
              {targets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · الإصدار {a.current_version}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="st-hint">لم يُحفظ من هذا المشروع ملف في المكتبة بعد. احفظه أولاً ملفاً جديداً، ثم تُضاف إليه الإصدارات.</p>
        )
      )}
      {toLibrary && canLibrary && workRef && (
        <label className="st-switch-row">
          <input type="checkbox" checked={linkWork} onChange={(e) => setLinkWork(e.target.checked)} disabled={busy} />
          ربط الملف بالعمل {workRef}
        </label>
      )}
      {toLibrary && canLibrary && !workRef && <p className="st-hint">لربط الملف بعمل، اربط المشروع بعمل من «المراجعة» في الإعدادات.</p>}
      {published && <p className="st-hint st-warn">هذا الملف منشور، فلا يأخذ إصداراً جديداً. احفظ التصدير ملفاً جديداً.</p>}
      {reviewed && <p className="st-hint">هذا الملف مرّ بالمراجعة: الإصدار الجديد يعيده إلى «قيد المراجعة»، ويبقى الإصدار المعتمد قبله مسجلاً.</p>}
      <p className="st-hint">
        {what === 'video' ? <>المدة {shortTime(durationOf(doc))} · <bdi dir="ltr">{size.w}×{size.h}</bdi> · نحو {formatBytes(estimateBytes(doc, short))} (تقدير)</> : <><bdi dir="ltr">{size.w}×{size.h}</bdi></>}
      </p>
      {what === 'video' && <p className="st-hint">يجري التصدير في هذا المتصفح: أبقِ الصفحة ظاهرة حتى ينتهي.</p>}
      {hidden && <p className="st-hint st-warn" role="alert">الصفحة مخفية الآن، فيتباطأ التصدير. أعدها إلى الواجهة.</p>}
      {progress ? (
        <div className="st-export-run">
          <div className="st-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.f * 100)}>
            <i style={{ width: `${Math.round(progress.f * 100)}%` }} />
            <span>{progress.label}</span>
          </div>
          {what === 'video' && (
            <button type="button" onClick={() => abort.current?.abort()} aria-label="إلغاء التصدير">
              <X aria-hidden="true" />
              إلغاء
            </button>
          )}
        </div>
      ) : (
        reviewed ? (
          <button type="button" className="primary" disabled={blocked} onClick={() => void run()} data-hold={HOLD.studioNewVersion}>
            تصدير وحفظ إصداراً جديداً
          </button>
        ) : (
          <button type="button" className="primary" disabled={blocked} onClick={() => void run()}>
            {dest === 'device' ? 'تصدير وتنزيل' : 'تصدير وحفظ في المكتبة'}
          </button>
        )
      )}
      {empty && <p className="st-hint">أضف مقطعاً قبل التصدير.</p>}
      {error && <p className="warning" role="alert">{error}</p>}
      {done?.kind === 'device' && (
        <p className="st-done" role="status">
          جاهز: {done.name} ({formatBytes(done.bytes)}).{' '}
          <a href={done.url} download={done.name}>
            تنزيل مرة أخرى
          </a>
        </p>
      )}
      {done?.kind === 'library' && (
        <div className="st-done" role="status">
          <p>
            حُفظ في المكتبة: {done.name}، الإصدار {done.version}. <Link href={`/media/${done.asset}`}>فتحه في المكتبة</Link>
          </p>
          {linkNote && <p className="st-hint">{linkNote}</p>}
          <p className="st-hint">لا يعتمد أحد ما رفعه بنفسه: يعتمد هذا الإصدار مراجع غيرك. والنشر ما يزال محاكاة.</p>
        </div>
      )}
    </section>
  );
}

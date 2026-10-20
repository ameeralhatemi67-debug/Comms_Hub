'use client';

// The export panel (MVP_draft.md 62): a video (MP4, or WebM where MP4 cannot be made) at 720p, 1080p
// or 4K, or the current frame as a picture; downloaded, or saved to the library as a new file in a
// folder the person may create in, or as a new version of a file (long press when the file has been in
// review; refused when it is published). Saving to the library first saves a numbered version of the
// project and records which version produced which library version (studio_export_record). The export
// runs in this page, with the screen kept awake; the page asks to stay visible. A video project exports in
// each shape ticked (MVP_draft.md 62.10), one file each; the platforms it is meant for are checked first;
// a download may carry the «مسودة» mark (never a library file: what is approved there is what is
// published); a text track can be written out as SRT captions.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Download, Film, Image as ImageIcon, Library, Send, Subtitles, X } from 'lucide-react';
import { HOLD } from '@/lib/kit/hold-reasons';
import { RATIOS, US, canvasOf, durationOf, type Micros, type ProjectDoc, type Ratio } from '@/lib/studio/schema';
import { allShapes, docForShape } from '@/lib/studio/reframe';
import { exportChecks, hasStop } from '@/lib/studio/checks';
import { openSlots } from '@/lib/studio/slot';
import { toSrt } from '@/lib/studio/text';
import { factsOf, usePlatforms } from './platforms';
import { EXPORT_ERRORS, ExportError, SHORT_LABELS, estimateBytes, exportStill, exportVideo, fileName, measureLoudness, outputSize, type ExportProgress, type Short, type VideoFormat } from '@/lib/studio/export';
import { LOUDNESS_TARGET, lufsText, normalizeGain } from '@/lib/studio/loudness';
import { hasSound } from '@/lib/studio/audio';
import { download } from '@/lib/studio/target';
import { formatBytes, probeSupport } from '@/lib/studio/support';
import { shortTime } from '@/lib/studio/time';
import { withKeys } from '@/lib/studio/shortcuts';
import type { MediaPool } from '@/lib/studio/media';
import type { Resolver } from '@/lib/studio/compose';
import type { StudioApi } from '@/lib/studio/persist';
import { Segmented } from '../motion-controls';
import { FolderSelect } from './folder-picker';
import { REVIEWED_STAGES, assetRow, projectExports, uploadToLibrary, uploadVersion, type AssetRow } from './library';
import { linkFileToWork } from './work-links';

type Dest = 'device' | 'new' | 'version';
type Done = { kind: 'device'; name: string; bytes: number; url: string } | { kind: 'library'; name: string; asset: string; version: number };
export const DRAFT_MARK = 'مسودة';
const shapeName = (r: Ratio) => r.replace(':', 'x');

export function ExportPanel({
  doc, pool, t, projectId, title, readOnly, canLibrary, api, saveVersion, revision, photo, adjusted, workRef = null, onSaved, onSend,
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
  /** Opens «تصدير وإرسال للمراجعة» for the linked work (MVP_draft.md 62.12). */
  onSend?: () => void;
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
  const [done, setDone] = useState<Done[] | null>(null);
  const main = doc.video?.ratio ?? '9:16';
  const shapes: Ratio[] = photo ? [] : allShapes(doc);
  const [picked, setPicked] = useState<Ratio[]>([main]);
  const chosenShapes = photo ? [] : picked.filter((r) => shapes.includes(r));
  const [mark, setMark] = useState(false);
  const [ack, setAck] = useState(false);
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [srtTrack, setSrtTrack] = useState('');
  const [srtNote, setSrtNote] = useState<string | null>(null);
  const plat = usePlatforms(workRef);
  const platformKeys = chosen ?? plat.workKeys;
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [linkWork, setLinkWork] = useState(true);
  const [linkNote, setLinkNote] = useState<string | null>(null);
  const [normalize, setNormalize] = useState(false);
  const [level, setLevel] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const lastUrls = useRef<string[]>([]);

  // the project's own shape changed: it is the one ticked
  useEffect(() => {
    if (!photo && !picked.some((r) => shapes.includes(r))) setPicked([main]);
  }, [main]); // eslint-disable-line react-hooks/exhaustive-deps
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
    for (const u of lastUrls.current) URL.revokeObjectURL(u);
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

  // what the export is checked against: the work's platforms, or those picked here
  const { w: CW, h: CH } = canvasOf(doc);
  const ratios = photo ? [CW / CH] : chosenShapes.map((r) => RATIOS[r].w / RATIOS[r].h);
  const checks = exportChecks({ kind: photo ? 'still' : what, ratios, seconds: durationOf(doc) / US, slots: openSlots(doc).length }, platformKeys.map(factsOf));
  const warned = checks.some((c) => c.level === 'warn');

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
      // «توحيد مستوى الصوت»: measured first, then one gain for the whole sound (the same in every shape)
      let gain = 1;
      if (what === 'video' && normalize && hasSound(doc)) {
        const m = await measureLoudness(doc, pool, { signal: ctl.signal, onProgress: (f) => setProgress({ label: `جارٍ قياس مستوى الصوت ${Math.round(f * 100)}٪`, f }) });
        gain = normalizeGain(m);
        const after = m.integrated + 20 * Math.log10(gain);
        setLevel(`كان الصوت ${lufsText(m.integrated)}، وصار في الملف نحو ${lufsText(after)}${after < LOUDNESS_TARGET - 0.5 ? ' (أوقفته القمم عند -1 ديسيبل)' : ''}.`);
      }
      const watermark = dest === 'device' && mark ? DRAFT_MARK : null;
      const list: (Ratio | null)[] = photo ? [null] : chosenShapes;
      const results: Done[] = [];
      let linked: string | null = null;
      for (let i = 0; i < list.length; i++) {
        const shape = list[i];
        const d = shape ? docForShape(doc, shape) : doc;
        const tag = list.length > 1 || (shape && shape !== main) ? ` (${shapeName(shape!)})` : '';
        const name = fileName(`${title}${tag}`, ext);
        const of = list.length > 1 ? ` ${i + 1} من ${list.length}` : '';
        let file: File;
        if (what === 'still') {
          setProgress({ label: `جارٍ إنشاء الصورة${of}…`, f: 0.5 });
          file = await exportStill(d, pool, { t, name, type: stillType, short: photo ? undefined : short, adjusted, watermark });
        } else {
          const r = await exportVideo(d, pool, {
            short,
            format,
            name,
            gain,
            watermark,
            signal: ctl.signal,
            onProgress: (p: ExportProgress) => setProgress({ label: p.phase === 'prepare' ? `جارٍ التجهيز${of}…` : p.phase === 'finish' ? `جارٍ إنهاء الملف${of}…` : `جارٍ التصدير${of} ${Math.round((p.done / p.total) * 100)}٪`, f: p.done / Math.max(1, p.total) }),
          });
          file = r.file;
        }
        if (!toLibrary) {
          const url = download(file);
          lastUrls.current.push(url);
          results.push({ kind: 'device', name: file.name, bytes: file.size, url });
          continue;
        }
        let asset: string;
        let version: number;
        if (dest === 'new') {
          const row = await uploadToLibrary(file, folder, (f) => setProgress({ label: `جارٍ رفع الملف${of} ${Math.round(f * 100)}٪`, f }));
          asset = row.id;
          version = row.current_version;
        } else {
          asset = targetId;
          version = await uploadVersion(targetId, file, `من الاستوديو: ${title} (النسخة ${rev})`.slice(0, 200), (f) => setProgress({ label: `جارٍ رفع الإصدار ${Math.round(f * 100)}٪`, f }));
        }
        const rec = await api.exportRecord(projectId, rev, asset, version, what === 'still' ? 'image' : 'video', shape);
        if (!rec.ok) throw new Error(rec.error);
        if (workRef && linkWork) {
          const err = await linkFileToWork(workRef, asset);
          linked = err ?? `رُبط ${list.length > 1 ? 'كل ملف' : 'الملف'} بالعمل ${workRef}.`;
        }
        results.push({ kind: 'library', name: file.name, asset, version });
      }
      setLinkNote(linked);
      setDone(results);
      if (toLibrary) onSaved?.();
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

  // captions out: a text track as SRT, downloaded or saved to the library as a text file
  const textTracks = (doc.video?.tracks ?? []).filter((x) => x.kind === 'text' && x.clips.some((c) => c.text?.content.trim()));
  const srtOf = () => {
    const id = srtTrack || textTracks[0]?.id;
    return id ? toSrt(doc, id) : '';
  };
  const srtFile = () => new File([srtOf()], fileName(title, 'srt'), { type: 'text/plain' });
  const saveSrt = async () => {
    setSrtNote(null);
    try {
      const row = await uploadToLibrary(srtFile(), folder, () => undefined);
      setSrtNote(`حُفظت الترجمة في المكتبة: ${row.name}.`);
    } catch (e) {
      setSrtNote((e as Error).message || 'تعذّر حفظ الترجمة.');
    }
  };

  const busy = !!progress;
  const blocked =
    empty || !pool || (!photo && !chosenShapes.length) || hasStop(checks) || (warned && !ack) ||
    (toLibrary && (readOnly || !canLibrary || (dest === 'new' && !folder) || (dest === 'version' && (!targetId || published || (!photo && chosenShapes.length !== 1)))));
  return (
    <section className="st-export" aria-label="التصدير">
      <h2>التصدير</h2>
      {onSend && (
        <div className="st-export-send">
          <p className="st-hint">المشروع مرتبط بعمل: يُصدَّر ويُحفظ في المكتبة ويُرسل العمل للمراجعة بخطوة واحدة.</p>
          <button type="button" className="st-mini" disabled={busy} onClick={onSend} title={withKeys('تصدير وإرسال للمراجعة', 'send-review')}>
            <Send aria-hidden="true" />
            تصدير وإرسال للمراجعة
          </button>
        </div>
      )}
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
      {!photo && shapes.length > 1 && (
        <fieldset className="st-shapes">
          <legend>الأشكال</legend>
          {shapes.map((r) => (
            <label key={r} className="st-switch-row">
              <input type="checkbox" checked={picked.includes(r)} disabled={busy} onChange={(e) => setPicked((x) => (e.target.checked ? [...x, r] : x.filter((y) => y !== r)))} />
              {RATIOS[r].label}
              {r === main ? ' (شكل المشروع)' : ''}
            </label>
          ))}
          <p className="st-hint">ملف لكل شكل، بالاسم نفسه ومعه الشكل.</p>
        </fieldset>
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
      {dest === 'device' && (
        <label className="st-switch-row">
          <input type="checkbox" checked={mark} onChange={(e) => setMark(e.target.checked)} disabled={busy} />
          علامة «{DRAFT_MARK}» على الصورة
        </label>
      )}
      {dest !== 'device' && <p className="st-hint">لا تُكتب علامة «{DRAFT_MARK}» على ملف المكتبة: ما يُعتمد فيها هو الملف الذي يُنشر نفسه.</p>}
      {dest === 'version' && !photo && chosenShapes.length > 1 && <p className="st-hint st-warn">الإصدار الجديد لملف واحد: اختر شكلاً واحداً.</p>}
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
      {what === 'video' && hasSound(doc) && (
        <div className="st-level">
          <label className="st-switch-row">
            <input type="checkbox" checked={normalize} onChange={(e) => setNormalize(e.target.checked)} disabled={busy} />
            توحيد مستوى الصوت ({LOUDNESS_TARGET} LUFS، والقمم دون -1 ديسيبل)
          </label>
          <button
            type="button"
            className="st-mini"
            disabled={busy || !pool}
            onClick={async () => {
              if (!pool) return;
              setLevel('جارٍ القياس…');
              try {
                const m = await measureLoudness(doc, pool);
                setLevel(`مستوى صوت المشروع ${lufsText(m.integrated)}، وأعلى قمة ${Number.isFinite(m.peakDb) ? `${m.peakDb.toFixed(1)} ديسيبل` : 'لا شيء'}.`);
              } catch {
                setLevel('تعذّر القياس.');
              }
            }}
          >
            قياس المستوى
          </button>
          {level && <p className="st-hint" role="status">{level}</p>}
        </div>
      )}
      <fieldset className="st-checks">
        <legend>المنصات</legend>
        {plat.workKeys.length > 0 && chosen === null && <p className="st-hint">منصات العمل {workRef}.</p>}
        <div className="st-check-plats">
          {plat.social.map((x) => (
            <label key={x.key} className="st-switch-row">
              <input type="checkbox" checked={platformKeys.includes(x.key)} disabled={busy} onChange={(e) => setChosen(e.target.checked ? [...platformKeys, x.key] : platformKeys.filter((k) => k !== x.key))} />
              {x.label_ar}
            </label>
          ))}
        </div>
        {platformKeys.length > 0 && !checks.length && <p className="st-hint">لا ملاحظات على هذا التصدير للمنصات المختارة.</p>}
        {checks.length > 0 && (
          <ul className="st-check-list">
            {checks.map((c) => (
              <li key={c.text} data-level={c.level}>{c.text}</li>
            ))}
          </ul>
        )}
        {warned && (
          <label className="st-switch-row">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} disabled={busy} />
            قرأت التنبيهات أعلاه
          </label>
        )}
      </fieldset>
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
      {done?.map((d) =>
        d.kind === 'device' ? (
          <p key={d.url} className="st-done" role="status">
            جاهز: {d.name} ({formatBytes(d.bytes)}).{' '}
            <a href={d.url} download={d.name}>
              تنزيل مرة أخرى
            </a>
          </p>
        ) : null,
      )}
      {done?.some((d) => d.kind === 'library') && (
        <div className="st-done" role="status">
          {done.map((d) =>
            d.kind === 'library' ? (
              <p key={`${d.asset}:${d.version}`}>
                حُفظ في المكتبة: {d.name}، الإصدار {d.version}. <Link href={`/media/${d.asset}`}>فتحه في المكتبة</Link>
              </p>
            ) : null,
          )}
          {linkNote && <p className="st-hint">{linkNote}</p>}
          <p className="st-hint">لا يعتمد أحد ما رفعه بنفسه: يعتمد هذا الإصدار مراجع غيرك. والنشر ما يزال محاكاة.</p>
        </div>
      )}
      {!photo && textTracks.length > 0 && (
        <fieldset className="st-srt">
          <legend>الترجمة</legend>
          {textTracks.length > 1 && (
            <label>
              مسار النص
              <select value={srtTrack || textTracks[0].id} onChange={(e) => setSrtTrack(e.target.value)}>
                {textTracks.map((x, i) => (
                  <option key={x.id} value={x.id}>مسار النص {i + 1}</option>
                ))}
              </select>
            </label>
          )}
          <div className="actions">
            <button type="button" className="st-mini" onClick={() => setDone([{ kind: 'device', name: srtFile().name, bytes: srtFile().size, url: download(srtFile()) }])}>
              <Subtitles aria-hidden="true" />
              تنزيل ملف SRT
            </button>
            {canLibrary && dest === 'new' && folder && (
              <button type="button" className="st-mini" disabled={readOnly} onClick={() => void saveSrt()}>
                حفظ الترجمة في المكتبة
              </button>
            )}
          </div>
          {canLibrary && !(dest === 'new' && folder) && <p className="st-hint">للحفظ في المكتبة اختر «ملف جديد في المكتبة» ومجلداً أعلاه.</p>}
          {srtNote && <p className="st-hint" role="status">{srtNote}</p>}
        </fieldset>
      )}
    </section>
  );
}

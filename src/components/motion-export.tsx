'use client';

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { CircleCheck, Download, FileArchive, FileVideo, Film, Image as ImageIcon, TriangleAlert, X } from 'lucide-react';
import { exportDesign, hasWebCodecs, MAX_BYTES, planExport, saveBlob, type ExportFormat, type ExportProgress, type ExportResult } from '@/lib/motion/export.js';
import type { Graphic, Params } from '@/lib/motion/types';
import { ColorInput, Segmented } from './motion-controls';

const formats: { value: ExportFormat; icon: typeof Film; title: string; text: string }[] = [
  { value: 'mp4', icon: FileVideo, title: 'فيديو بخلفية خضراء', text: 'MP4 يعمل في أي برنامج مونتاج. أزل اللون الأخضر بأداة Chroma Key فيظهر التصميم فوق مقطعك.' },
  { value: 'mov', icon: Film, title: 'فيديو شفاف', text: 'MOV بصيغة ProRes 4444 وبشفافية حقيقية دون إزالة لون، يعمل داخل برامج المونتاج مثل CapCut وPremiere Pro وAfter Effects وDaVinci Resolve وFinal Cut.' },
  { value: 'zip', icon: FileArchive, title: 'تسلسل صور شفافة', text: 'ZIP أعلى جودة وأوسع توافقاً. فك الضغط واستورد الصور كتسلسل في برنامج المونتاج.' },
  { value: 'png', icon: ImageIcon, title: 'صورة واحدة', text: 'PNG للقطة المعروضة الآن بخلفية شفافة.' },
];
const resolutions = [{ value: 720, label: '720p' }, { value: 1080, label: '1080p' }, { value: 2160, label: '4K' }];
const rates = [{ value: 24, label: '24' }, { value: 30, label: '30' }, { value: 60, label: '60' }];
const keys = [{ value: '#00ff00', label: 'أخضر' }, { value: '#ff00ff', label: 'أرجواني' }, { value: '#0000ff', label: 'أزرق' }];

const size = (bytes: number) => bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} جيجابايت` : bytes >= 1e6 ? `${Math.max(1, Math.round(bytes / 1e6))} ميغابايت` : `${Math.max(1, Math.round(bytes / 1e3))} كيلوبايت`;
const eta = (s: number) => s < 60 ? `${Math.max(1, Math.ceil(s))} ثانية` : `${Math.floor(s / 60)} د ${Math.round(s % 60)} ث`;
const seconds = (s: number) => `${s.toFixed(1)} ثانية`;

export function ExportPanel({ g, p, time, keyColor, onKeyColor, onBusy }: { g: Graphic; p: Params; time: MutableRefObject<number>; keyColor: string; onKeyColor: (value: string) => void; onBusy: (busy: boolean) => void }) {
  const [format, setFormat] = useState<ExportFormat | null>(null), [shortSide, setShortSide] = useState(1080), [fps, setFps] = useState(30);
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState<ExportProgress | null>(null), [error, setError] = useState('');
  const [result, setResult] = useState<(ExportResult & { url: string }) | null>(null);
  const controller = useRef<AbortController | null>(null), url = useRef('');
  const recommended: ExportFormat = g.category === 'frames' ? 'mp4' : 'mov', active = format ?? recommended;
  const codecs = typeof window === 'undefined' ? true : hasWebCodecs();

  const plan = useMemo(() => planExport(g, p, { shortSide, fps }), [g, p, shortSide, fps]);
  const bitrate = plan.w * plan.h * fps * .3;
  const estimate = active === 'mp4' ? bitrate * plan.duration / 8 : active === 'png' ? plan.w * plan.h * .6 : plan.pixels * (g.category === 'frames' ? .5 : .06);
  const tooBig = (active === 'mov' || active === 'zip') && estimate > MAX_BYTES;
  const heavy = (active === 'mov' || active === 'zip') && estimate > MAX_BYTES * .5 && !tooBig;

  useEffect(() => { setError(''); setResult(null); }, [g.id]);
  useEffect(() => () => { controller.current?.abort(); if (url.current) URL.revokeObjectURL(url.current); }, []);
  useEffect(() => onBusy(busy), [busy, onBusy]);

  async function start() {
    const abort = new AbortController(); controller.current = abort;
    if (url.current) { URL.revokeObjectURL(url.current); url.current = ''; }
    setBusy(true); setError(''); setResult(null); setProgress(null);
    try {
      const out = await exportDesign(g, p, { format: active, shortSide, fps, time: time.current, keyColor }, abort.signal, setProgress);
      url.current = saveBlob(out.blob, out.name);
      setResult({ ...out, url: url.current });
    } catch (e) {
      if (abort.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) setError('أُلغي التصدير. لم يُحفظ أي ملف.');
      else setError(e instanceof Error && /[؀-ۿ]/.test(e.message) ? e.message : 'تعذر إنشاء الملف. جرّب دقة أقل أو صيغة أخرى.');
    } finally { setBusy(false); setProgress(null); controller.current = null; }
  }
  const label = !progress ? 'جارٍ التجهيز…' : progress.phase === 'pack' ? 'جارٍ تجميع الملف…' : progress.phase === 'record' ? `جارٍ تسجيل الفيديو بالوقت الحقيقي… ${progress.done}٪`
    : `${progress.phase === 'encode' ? 'جارٍ ترميز الفيديو' : 'جارٍ تجهيز الإطارات'}: ${progress.done} من ${progress.total}${progress.eta != null ? ` · المتبقي نحو ${eta(progress.eta)}` : ''}`;

  return <section className="ms-export" aria-labelledby="ms-export-title">
    <div className="ms-export-head"><h2 id="ms-export-title">تنزيل التصميم</h2><p>يُنشأ الملف على جهازك مباشرة ولا يُرفع إلى أي مكان.</p></div>
    <div className="ms-export-grid">
      <fieldset className="ms-formats" disabled={busy}>
        <legend>صيغة الملف</legend>
        {formats.map(f => <label key={f.value} className={`ms-format ${active === f.value ? 'on' : ''}`}>
          <input type="radio" name="ms-format" value={f.value} checked={active === f.value} onChange={() => setFormat(f.value)} />
          <f.icon aria-hidden="true" />
          <span><b>{f.title}{f.value === recommended && <em>الأنسب لهذا التصميم</em>}</b><small>{f.text}</small></span>
        </label>)}
      </fieldset>
      <div className="ms-export-side">
        <Segmented label="دقة الضلع القصير" value={shortSide} disabled={busy} onChange={setShortSide} options={resolutions} />
        {active !== 'png' && <Segmented label="إطارات في الثانية" value={fps} disabled={busy} onChange={setFps} options={rates} />}
        {active === 'mp4' && <div className="ms-keys"><span className="ms-seg-label">لون الخلفية المفتاحية</span>
          <div className="ms-seg-row">{keys.map(k => <button key={k.value} type="button" aria-pressed={keyColor === k.value} disabled={busy} className={keyColor === k.value ? 'on' : ''} onClick={() => onKeyColor(k.value)}><i style={{ background: k.value }} />{k.label}</button>)}
            <ColorInput label="لون آخر" value={keyColor} onChange={onKeyColor} disabled={busy} /></div>
          <small>اختر لوناً لا يوجد في ألوان التصميم حتى لا يُزال معه جزء منه.</small></div>}
        <dl className="ms-summary">
          <div><dt>الأبعاد</dt><dd>عرض <bdi dir="ltr">{plan.w}</bdi> × ارتفاع <bdi dir="ltr">{plan.h}</bdi> بكسل</dd></div>
          {active !== 'png' && <div><dt>المدة</dt><dd>{seconds(plan.duration)} · {plan.frames} إطاراً · <bdi dir="ltr">{fps}</bdi> إطاراً/ث</dd></div>}
          <div><dt>الحجم التقريبي</dt><dd>{size(estimate)}</dd></div>
        </dl>
        {active === 'mp4' && !codecs && <p className="ms-warn"><TriangleAlert />هذا المتصفح لا يوفر الترميز السريع، لذلك سيُسجَّل الفيديو بالوقت الحقيقي وتستغرق العملية مدة التصميم نفسها. افتح الاستوديو عبر العنوان المحلي localhost أو استخدم المتصفح Chrome الحديث لتسريعها.</p>}
        {active === 'mov' && <p className="ms-warn"><TriangleAlert />هذا الملف يعمل داخل برامج المونتاج فقط (مثل CapCut وPremiere Pro وAfter Effects وDaVinci Resolve وFinal Cut). مشغّلات الفيديو العادية، مثل مشغّل ويندوز وتطبيق الصور في الهاتف، لا تفتحه، ولا يوجد مشغّل عادي يعرض الشفافية. للمعاينة السريعة أو للمشاركة اختر «فيديو بخلفية خضراء».</p>}
        {heavy &&<p className="ms-warn"><TriangleAlert />الملف كبير وقد يبطئ المتصفح. MP4 أو دقة أقل أنسب لهذه المدة.</p>}
        {tooBig && <p className="ms-warn danger"><TriangleAlert />الملف أكبر مما تتحمله ذاكرة المتصفح. اختر MP4، أو قلّل الدقة أو مدة العرض.</p>}
        <div className="ms-export-actions">
          <button type="button" className="primary" disabled={busy || tooBig} onClick={start}><Download />{busy ? 'جارٍ التصدير…' : 'تنزيل التصميم'}</button>
          {busy && <button type="button" onClick={() => controller.current?.abort()}><X />إلغاء</button>}
        </div>
        {busy && <div className="ms-progress" role="status"><progress aria-label="تقدم التصدير" value={progress ? progress.fraction : undefined} max={1} /><span>{label}</span></div>}
        {error && <p className="ms-error" role="alert"><TriangleAlert />{error}</p>}
        {result && <div className="ms-result" role="status">
          <CircleCheck aria-hidden="true" />
          <div><b>اكتمل التصدير وبدأ تنزيل الملف</b><bdi dir="ltr" className="ms-file">{result.name}</bdi><small>{size(result.blob.size)}{result.method === 'recorder' ? ' · سُجّل بالوقت الحقيقي' : ''}</small>
            <small>إن لم يظهر الملف في مجلد التنزيلات، احفظه من الرابط التالي.</small></div>
          <a className="button" href={result.url} download={result.name}><Download />حفظ الملف</a>
        </div>}
      </div>
    </div>
    <p className="ms-note">أداة محلية تجريبية: لا يُضاف الملف إلى مكتبة الوسائط ولا يُنشر تلقائياً، وتعود التعديلات إلى الإعدادات الأصلية عند تحديث الصفحة.</p>
  </section>;
}

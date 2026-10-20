'use client';

// «تصدير وإرسال للمراجعة» (MVP_draft.md 62.12, Ctrl+Shift+M): the checks for the work's platforms, a numbered
// version of the project, the export, the file saved to the library (a new version of the work's file from
// this project, or a new file linked to the work), the export recorded, then the work sent to review by the
// work cycle's own work_submit with the work's accounts and proposed time, exactly as its page sends it.
// The studio approves nothing: who decides next is said, and nobody approves what they sent.
import { useEffect, useRef, useState } from 'react';
import { Send, X } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { HOLD } from '@/lib/kit/hold-reasons';
import { PUBLISHABLE_TYPES, workErrorText, type WorkType } from '@/lib/work/rules';
import { useAccount } from '@/lib/account-context';
import { RATIOS, US, canvasOf, durationOf, type ProjectDoc } from '@/lib/studio/schema';
import { EXPORT_ERRORS, ExportError, exportStill, exportVideo, fileName } from '@/lib/studio/export';
import { exportChecks, hasStop } from '@/lib/studio/checks';
import { decidesNext, sendBlock, sendNeeds } from '@/lib/studio/worklink';
import { probeSupport } from '@/lib/studio/support';
import type { MediaPool } from '@/lib/studio/media';
import type { Resolver } from '@/lib/studio/compose';
import type { StudioApi } from '@/lib/studio/persist';
import { Modal } from '../ui';
import { FolderSelect } from './folder-picker';
import { REVIEWED_STAGES, assetRow, projectExports, uploadToLibrary, uploadVersion, type AssetRow } from './library';
import { factsOf, usePlatforms } from './platforms';
import { linkFileToWork } from './work-links';
import { workChanged, type LinkedWork } from './work-bar';

export function SendReviewDialog(p: {
  projectId: string;
  title: string;
  doc: ProjectDoc;
  pool: MediaPool | null;
  api: StudioApi;
  saveVersion: (note: string | null) => Promise<{ ok: boolean; error?: string }>;
  revision: () => number;
  linked: LinkedWork;
  canLibrary: boolean;
  photo?: boolean;
  adjusted?: Resolver['adjusted'];
  onClose: () => void;
}) {
  const account = useAccount();
  const w = p.linked.work;
  const pub = PUBLISHABLE_TYPES.includes(w.type as WorkType);
  const block = sendBlock(w.status) ?? sendNeeds(w, pub, Date.now());
  const [target, setTarget] = useState<AssetRow | null | undefined>(undefined);
  const [folder, setFolder] = useState('');
  const [note, setNote] = useState('');
  const [ack, setAck] = useState(false);
  const [step, setStep] = useState<{ label: string; f: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const plat = usePlatforms(w.id);

  // the work's file from this project: one this project exported and the work already carries
  useEffect(() => {
    let live = true;
    void (async () => {
      const ex = await projectExports(p.projectId);
      const { data } = await supabase().from('work_assets').select('asset_id').eq('work_id', w.id);
      const inWork = new Set(((data ?? []) as { asset_id: string }[]).map((x) => x.asset_id));
      const mine = ex.find((e) => inWork.has(e.asset_id));
      const row = mine ? await assetRow(mine.asset_id) : null;
      if (live) setTarget(row);
    })();
    return () => {
      live = false;
    };
  }, [p.projectId, w.id]);

  const { w: W, h: H } = canvasOf(p.doc);
  const ratio = p.photo ? W / H : RATIOS[p.doc.video?.ratio ?? '9:16'].w / RATIOS[p.doc.video?.ratio ?? '9:16'].h;
  const checks = exportChecks({ kind: p.photo ? 'still' : 'video', ratios: [ratio], seconds: durationOf(p.doc) / US }, plat.workKeys.map(factsOf));
  const warned = checks.some((c) => c.level === 'warn');
  const reviewed = !!target && REVIEWED_STAGES.includes(target.stage);
  const published = target?.stage === 'published';
  const empty = !p.photo && durationOf(p.doc) <= 0;
  const blocked = !!block || empty || !p.pool || !p.canLibrary || target === undefined || published || (!target && !folder) || hasStop(checks) || (warned && !ack) || !!step;

  const run = async () => {
    if (!p.pool) return;
    setError(null);
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      setStep({ label: 'جارٍ حفظ نسخة من المشروع…', f: 0 });
      const saved = await p.saveVersion('للمراجعة من الاستوديو');
      if (!saved.ok) throw new Error(saved.error ?? 'تعذّر حفظ نسخة من المشروع.');
      const rev = p.revision();
      let file: File;
      if (p.photo) {
        setStep({ label: 'جارٍ إنشاء الصورة…', f: 0.3 });
        file = await exportStill(p.doc, p.pool, { name: fileName(p.title, 'png'), type: 'image/png', adjusted: p.adjusted });
      } else {
        const s = await probeSupport();
        const format = s.mp4 || !s.webm ? 'mp4' : 'webm';
        const r = await exportVideo(p.doc, p.pool, {
          short: 1080,
          format,
          name: fileName(p.title, format),
          signal: ctl.signal,
          onProgress: (x) => setStep({ label: x.phase === 'encode' ? `جارٍ التصدير ${Math.round((x.done / x.total) * 100)}٪` : 'جارٍ التجهيز…', f: x.done / Math.max(1, x.total) }),
        });
        file = r.file;
      }
      let asset: string;
      let version: number;
      if (target) {
        asset = target.id;
        version = await uploadVersion(target.id, file, `من الاستوديو: ${p.title} (النسخة ${rev})`.slice(0, 200), (f) => setStep({ label: `جارٍ رفع الإصدار ${Math.round(f * 100)}٪`, f }));
      } else {
        const row = await uploadToLibrary(file, folder, (f) => setStep({ label: `جارٍ رفع الملف ${Math.round(f * 100)}٪`, f }));
        asset = row.id;
        version = row.current_version;
      }
      const rec = await p.api.exportRecord(p.projectId, rev, asset, version, p.photo ? 'image' : 'video', p.photo ? null : (p.doc.video?.ratio ?? null));
      if (!rec.ok) throw new Error(rec.error);
      if (!target) {
        const linkErr = await linkFileToWork(w.id, asset);
        if (linkErr) throw new Error(linkErr);
      }
      setStep({ label: 'جارٍ إرسال العمل للمراجعة…', f: 1 });
      const { error: e } = await supabase().rpc('work_submit', {
        p_work: w.id,
        p_note: `من الاستوديو: النسخة ${rev}${note.trim() ? ` · ${note.trim()}` : ''}`.slice(0, 1000),
        p_channels: pub ? w.channels : null,
        p_proposed: pub ? w.proposed_at : null,
      });
      if (e) throw new Error(workErrorText(e.message));
      workChanged();
      setDone(`حُفظ الإصدار ${version} من «${file.name}» وأُرسل العمل ${w.id} للمراجعة. يقرره ${decidesNext(account?.role ?? '')}، ولا يعتمد أحد ما أرسله.`);
    } catch (err) {
      const code = err instanceof ExportError ? err.code : (err as Error).message;
      setError(EXPORT_ERRORS[code] ?? ((err as Error).message || 'تعذّر الإرسال.'));
      workChanged();
    } finally {
      abort.current = null;
      setStep(null);
    }
  };

  return (
    <Modal title="تصدير وإرسال للمراجعة" onClose={() => (step ? abort.current?.abort() : p.onClose())}>
      <div className="st-form st-send">
        <p>
          العمل <bdi dir="ltr">{w.id}</bdi> · {w.title}. يُحفظ المشروع نسخةً مرقّمة، ويُصدَّر، ويُحفظ في المكتبة، ثم يُرسل العمل للمراجعة كما يُرسل من صفحته.
        </p>
        {block && <p className="warning" role="alert">{block}</p>}
        {!p.canLibrary && <p className="warning">الحفظ في المكتبة يحتاج صفحة «مكتبة الوسائط»، وهي غير مفتوحة لحسابك.</p>}
        {empty && <p className="warning">أضف مقطعاً قبل التصدير.</p>}
        {target === undefined ? (
          <p className="st-hint" role="status">جارٍ البحث عن ملف العمل…</p>
        ) : target ? (
          <p className="st-hint">
            يُحفظ إصداراً جديداً من «{target.name}» (الإصدار {target.current_version} الآن).
            {reviewed && ' مرّ هذا الملف بالمراجعة، فيعود إلى «قيد المراجعة» ويبقى الإصدار المعتمد قبله مسجلاً.'}
            {published && ' هذا الملف منشور فلا يأخذ إصداراً جديداً.'}
          </p>
        ) : (
          <>
            <p className="st-hint">لا ملف من هذا المشروع في العمل بعد: يُحفظ ملفاً جديداً ويُربط بالعمل.</p>
            <FolderSelect value={folder} onChange={setFolder} disabled={!!step} />
          </>
        )}
        {checks.length > 0 && (
          <ul className="st-check-list">
            {checks.map((c) => (
              <li key={c.text} data-level={c.level}>{c.text}</li>
            ))}
          </ul>
        )}
        {warned && (
          <label className="st-switch-row">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            قرأت التنبيهات أعلاه
          </label>
        )}
        <label>
          ملاحظة للمراجع (اختيارية)
          <textarea value={note} rows={2} maxLength={400} onChange={(e) => setNote(e.target.value)} disabled={!!step} />
        </label>
        {step && (
          <div className="st-export-run">
            <div className="st-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(step.f * 100)}>
              <i style={{ width: `${Math.round(step.f * 100)}%` }} />
              <span>{step.label}</span>
            </div>
            <button type="button" onClick={() => abort.current?.abort()} aria-label="إلغاء">
              <X aria-hidden="true" />
              إلغاء
            </button>
          </div>
        )}
        {error && <p className="warning" role="alert">{error}</p>}
        {done ? (
          <>
            <p className="st-done" role="status">{done}</p>
            <div className="actions">
              <button type="button" className="primary" onClick={p.onClose}>تم</button>
            </div>
          </>
        ) : (
          <div className="actions">
            <button type="button" className="primary" disabled={blocked} onClick={() => void run()} {...(reviewed ? { 'data-hold': HOLD.studioNewVersion } : {})}>
              <Send aria-hidden="true" />
              تصدير وإرسال
            </button>
            <button type="button" onClick={p.onClose} disabled={!!step}>إلغاء</button>
          </div>
        )}
      </div>
    </Modal>
  );
}

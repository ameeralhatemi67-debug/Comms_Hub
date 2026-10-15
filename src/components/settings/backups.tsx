'use client';
// «النسخ الاحتياطي» in Settings (Settings_Integrations_Plan.md 7): the last good backup of each kind,
// its age and size and whether it was verified, the provider that holds backups, the policy (manual,
// a warning age, how many exports to keep), starting a backup, verifying one, restoring a file whose
// original is gone, and the runbooks. Nothing is scheduled: the page says how old the last good
// backup is and when it is stale, and a person starts the next. The copying of files is the move
// engine's, driven here by the open page.
import { useCallback, useEffect, useRef, useState } from 'react';
import { HOLD } from '@/lib/kit/hold-reasons';
import { needProps } from '@/lib/kit/need';
import { supabase } from '@/lib/supabase/client';
import {
  BACKUP_EXCLUDED as EXCLUDED,
  BACKUP_KIND_AR,
  BACKUP_KIND_NOTE,
  BACKUP_STATE_AR,
  BACKUP_STATE_TONE,
  PROVIDER_TYPE_AR,
  ageAr,
  backupError,
  intError,
  sizeAr,
  type BackupJob,
  type BackupKind,
  type BackupOverview,
  type Restorable,
} from '@/lib/integrations/rules';
import { useCaps } from '../caps';
import { SetupGuide } from '../setup-guide';

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const KINDS: BackupKind[] = ['files', 'database', 'config'];

async function post(path: string, body: Record<string, unknown>) {
  try {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { res, json: res.headers.get('content-type')?.includes('json') ? ((await res.clone().json().catch(() => ({}))) as Record<string, unknown>) : ({} as Record<string, unknown>) };
  } catch {
    return { res: null, json: { error: intError('') } as Record<string, unknown> };
  }
}

export function BackupsTab({ initial, initialRestorable }: { initial?: BackupOverview; initialRestorable?: Restorable[] }) {
  const caps = useCaps();
  const [data, setData] = useState<BackupOverview | null>(initial ?? null);
  const [refused, setRefused] = useState(false);
  const [restorable, setRestorable] = useState<Restorable[]>(initialRestorable ?? []);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    const { data: d, error } = await supabase().rpc('backup_overview');
    if (error) return setRefused(true);
    setData(d as BackupOverview);
    if ((d as BackupOverview).can_restore && (d as BackupOverview).restorable > 0) {
      const r = await supabase().rpc('backup_restorable');
      if (Array.isArray(r.data)) setRestorable(r.data as Restorable[]);
    } else setRestorable([]);
  }, []);
  useEffect(() => {
    if (!initial) void load();
    return () => {
      alive.current = false;
    };
  }, [initial, load]);

  if (refused || (caps.ready && !caps.has('backups.run') && !caps.has('backups.restore') && !caps.has('settings.view')))
    return (
      <div className="st-backups">
        <p className="muted">النسخ الاحتياطي لمن يملك «تشغيل النسخ الاحتياطي» أو «استعادة ملفات من نسخة احتياطية»: مسؤول النظام افتراضياً.</p>
        <button type="button" className="secondary" {...needProps('backups.run', 'النسخ الاحتياطي لمسؤول النظام افتراضياً، ويمنحه لغيره لمدة.')}>
          اطلب هذه الصلاحية
        </button>
      </div>
    );
  if (!data) return <p className="muted">جارٍ تحميل النسخ الاحتياطي…</p>;

  const canRun = data.can_run;
  const lock = (cap: string, why: string) => needProps(cap, why);
  const stale = data.jobs.filter((j) => j.enabled && j.stale);

  const exportFile = async (kind: 'database' | 'config') => {
    setBusy(kind);
    setNote(null);
    const { res, json } = await post('/api/backups/export', { kind });
    if (!res || !res.ok) {
      setBusy(null);
      return setNote({ ok: false, text: String(json.error ?? intError('')) });
    }
    const blob = await res.blob();
    const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `${kind}.json.gz`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    const kept = res.headers.get('X-Backup-Kept') === '1';
    const verified = res.headers.get('X-Backup-Verified');
    setNote({
      ok: !kept || verified === '1',
      text: kept
        ? `نُزّلت وحُفظت عند مزود النسخ الاحتياطي، ${verified === '1' ? 'وأُعيدت قراءتها فتطابقت بصمتها' : 'لكن بصمتها لم تتطابق بعد القراءة: كرّر التصدير'}.`
        : 'نُزّلت إلى جهازك فقط ولم تُحفظ عند مزود: حدّد مزود النسخ الاحتياطي ليحفظ الموقع نسخة.',
    });
    setBusy(null);
    await load();
  };

  const runFiles = async () => {
    setBusy('files');
    setNote(null);
    setProgress('يجهّز الخطط…');
    const { res, json } = await post('/api/backups/run', {});
    if (!res || !res.ok) {
      setBusy(null);
      setProgress(null);
      return setNote({ ok: false, text: String(json.error ?? intError('')) });
    }
    const run = String(json.run);
    const moves = (json.moves as string[]) ?? [];
    let copied = 0;
    let failed = 0;
    for (const [n, id] of moves.entries()) {
      let idle = 0;
      while (alive.current) {
        setProgress(`يُنسخ: خطة ${n + 1} من ${moves.length}، نُسخ ${copied}…`);
        const r = await post('/api/storage/move', { action: 'run', id });
        if (!r.res || !r.res.ok) {
          setNote({ ok: false, text: String(r.json.error ?? intError('')) });
          break;
        }
        const a = r.json as { state: string; claimed: number; copied: number; failed: number; stopped?: string };
        copied += a.copied ?? 0;
        failed += a.failed ?? 0;
        if (a.stopped) {
          setNote({ ok: false, text: 'تعذّر الوصول إلى أحد المزودين: لم يُعلَّم ملف بالفشل. افحص الاتصال ثم أعد النسخ.' });
          break;
        }
        if (a.state !== 'running') break;
        if (a.claimed === 0) {
          if (++idle > 20) break;
          await sleep(3000);
        } else idle = 0;
      }
    }
    setProgress('يُغلق التشغيل ويتحقق من عيّنة…');
    const closed = await supabase().rpc('backup_run_close', { p_run: run });
    if (closed.error) {
      setNote({ ok: false, text: backupError(closed.error.message) + ' استأنف من هذه الصفحة: يكمل من حيث وقف.' });
    } else {
      const v = await post('/api/backups/verify', { run });
      const c = closed.data as { state: string; items: number; failed: number };
      setNote({
        ok: c.failed === 0 && (v.json.ok as boolean | undefined) !== false,
        text: `نُسخ ${c.items} ملفاً${c.failed ? `، وتعذّر ${c.failed}` : ''}. ${
          v.res?.ok ? (v.json.checked ? `أُعيدت قراءة ${v.json.checked} نسخة للتحقق: ${v.json.good} سليمة${Number(v.json.failed) ? `، و${v.json.failed} تعذّرت` : ''}.` : String(v.json.note ?? '')) : 'لم يُجرَ التحقق.'
        }`,
      });
    }
    setBusy(null);
    setProgress(null);
    await load();
  };

  const verify = async (job: BackupJob) => {
    setBusy(`v-${job.kind}`);
    setNote(null);
    const { res, json } = await post('/api/backups/verify', { run: job.last_good?.id });
    setBusy(null);
    if (!res || !res.ok) return setNote({ ok: false, text: String(json.error ?? intError('')) });
    setNote({
      ok: json.ok === true,
      text: json.checked !== undefined ? (json.checked ? `قُرئت ${json.checked} نسخة: ${json.good} سليمة، ${json.failed} تعذّرت.` : String(json.note ?? '')) : String(json.note ?? ''),
    });
    await load();
  };

  const setPolicy = async (job: BackupJob, retention: number, warn: number) => {
    setBusy(`p-${job.kind}`);
    const { error } = await supabase().rpc('backup_policy_set', { p_kind: job.kind, p_frequency: 'manual', p_retention: retention, p_warn_days: warn, p_enabled: job.enabled });
    setBusy(null);
    setNote(error ? { ok: false, text: backupError(error.message) } : { ok: true, text: 'حُفظت السياسة.' });
    await load();
  };

  const setTarget = async (id: string | null) => {
    setBusy('target');
    const { error } = await supabase().rpc('backup_target_set', { p_integration: id });
    setBusy(null);
    setNote(error ? { ok: false, text: backupError(error.message) } : { ok: true, text: id ? 'حُدّد مزود النسخ الاحتياطي.' : 'أُزيل مزود النسخ الاحتياطي.' });
    await load();
  };

  const restore = async (r: Restorable) => {
    setBusy(`r-${r.subject}`);
    const { error } = await supabase().rpc('backup_restore_file', { p_kind: r.kind, p_subject: r.subject });
    setBusy(null);
    setNote(error ? { ok: false, text: backupError(error.message) } : { ok: true, text: 'استُعيد الملف: تُخدَّم نسخته الاحتياطية الآن. انقله إلى مزود المكتبة من «التخزين» حين تريد.' });
    await load();
  };

  return (
    <div className="st-backups">
      <div className="st-backups-head">
        <p className="muted">
          نسخ احتياطية يدوية حتى يصل جهاز الوكيل: تقول الصفحة عمر آخر نسخة سليمة ومتى تتقادم، ولا شيء يعمل وحده. النسخة لا تُعدّ متحققاً منها إلا بعد قراءة نسخها من المزود ومطابقة بصمتها.{' '}
          <SetupGuide guide="backups" label="كيف تعمل النسخ الاحتياطية" />
        </p>
      </div>

      {stale.length > 0 && (
        <p className="warning st-backup-stale" role="alert">
          {stale.map((j) => BACKUP_KIND_AR[j.kind]).join(' و')}: {stale.some((j) => !j.last_good) ? 'لا توجد نسخة سليمة بعد' : 'آخر نسخة أقدم من مدة التنبيه'}. ابدأ نسخة من البطاقة أدناه.
        </p>
      )}

      <section className="st-block st-backup-target" aria-label="مزود النسخ الاحتياطي">
        <h3>أين تُحفظ النسخ</h3>
        {data.target ? (
          <p>
            مزود النسخ الاحتياطي: <b>{data.target.label}</b> ({PROVIDER_TYPE_AR[data.target.type] ?? data.target.type}).
          </p>
        ) : (
          <p className="ml-hint">لم يُحدَّد مزود. التصدير يُنزَّل إلى جهازك فقط، ونسخ الملفات تحتاج مزوداً غير مزود المكتبة.</p>
        )}
        {data.candidates.length > 0 ? (
          <div className="actions">
            <select
              aria-label="مزود النسخ الاحتياطي"
              value={data.target?.id ?? ''}
              disabled={busy === 'target' || !data.can_manage}
              onChange={(e) => void setTarget(e.target.value || null)}
              {...(!data.can_manage ? lock('storage.manage', 'تحديد مزود النسخ لمن يملك «إدارة مزودي التخزين».') : {})}
            >
              <option value="">بلا مزود</option>
              {data.candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="muted">لا مزود متصل غير مزود المكتبة. أضف مزوداً ثانياً وافحص اتصاله من «التخزين».</p>
        )}
      </section>

      {note && (
        <p className={note.ok ? 'ml-hint' : 'ml-err'} role="status">
          {note.text}
        </p>
      )}
      {progress && (
        <p className="ml-hint st-backup-progress" role="status">
          {progress} أبقِ هذه الصفحة مفتوحة.
        </p>
      )}

      <section className="st-block st-backup-jobs" aria-label="أنواع النسخ">
        {KINDS.map((kind) => {
          const job = data.jobs.find((j) => j.kind === kind);
          if (!job) return null;
          return (
            <JobCard
              key={kind}
              job={job}
              files={data.files}
              target={Boolean(data.target)}
              canRun={canRun}
              canMigrate={data.can_migrate}
              busy={busy}
              onRun={() => (kind === 'files' ? void runFiles() : void exportFile(kind))}
              onVerify={() => void verify(job)}
              onPolicy={(r, w) => void setPolicy(job, r, w)}
              lock={lock}
            />
          );
        })}
      </section>

      <section className="st-block st-backup-restore" aria-label="استعادة ملفات">
        <h3>استعادة ملف من نسخته</h3>
        {restorable.length === 0 ? (
          <p className="muted">
            لا ملف يحتاج استعادة الآن. تظهر هنا الملفات التي فُقد أصلها أو فسد وكانت لها نسخة احتياطية متحقق منها.
            {data.can_restore ? '' : ' الاستعادة لمن يملك «استعادة ملفات من نسخة احتياطية».'}
          </p>
        ) : (
          <ul className="st-events">
            {restorable.map((r) => (
              <li key={r.subject}>
                <span className="between">
                  <b>{r.name ? `${r.name}${r.version ? ` (الإصدار ${r.version})` : ''}` : 'مرفق بريد'}</b>
                  <span className="mx-chip danger">{r.state === 'missing' ? 'مفقود' : 'يحتاج انتباهاً'}</span>
                </span>
                <small>{r.size_bytes ? sizeAr(r.size_bytes) : ''}</small>
                <button
                  type="button"
                  className="secondary danger st-restore"
                  disabled={busy === `r-${r.subject}` || !data.can_restore}
                  data-hold={HOLD.backupRestore}
                  onClick={() => void restore(r)}
                >
                  استعادة من النسخة الاحتياطية
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="muted">
          الاستعادة تجعل النسخة الاحتياطية هي ما يُخدَّم منه الملف، دون نقل بايتات. استعادة قاعدة البيانات نفسها لا تُعرض من الموقع: هي إجراء مُشرَف عليه في الدليل أدناه.
        </p>
      </section>

      <section className="st-block st-backup-runs" aria-label="آخر النسخ">
        <h3>آخر النسخ</h3>
        {data.runs.length === 0 ? (
          <p className="muted">لم تُؤخذ نسخة بعد.</p>
        ) : (
          <ul className="st-events">
            {data.runs.map((r) => (
              <li key={r.id}>
                <span className="between">
                  <b>{BACKUP_KIND_AR[r.kind]}</b>
                  <span className={`mx-chip ${BACKUP_STATE_TONE[r.state]}`}>{BACKUP_STATE_AR[r.state]}</span>
                </span>
                <small>
                  {when(r.at)} · {r.items} {r.kind === 'files' ? 'ملف' : 'سجل'} · {sizeAr(r.size_bytes)}
                  {r.failed ? ` · تعذّر ${r.failed}` : ''}
                  {r.verified_at ? ` · ${r.verify_ok ? 'متحقق منها' : 'فشل التحقق'}` : ' · لم يُتحقق منها'}
                  {r.pruned ? ' · أُزيلت بحسب الاحتفاظ' : ''}
                  {r.by ? ` · ${r.by}` : ''}
                </small>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="st-block st-backup-runbook" aria-label="الدليل">
        <h3>الدليل: كيف تُستعاد الأشياء</h3>
        <details>
          <summary>ملف مفقود أو فاسد</summary>
          <ol>
            <li>افحص النسخ من «التخزين»: «تحقق من عينة» يعلّم المفقود.</li>
            <li>إن كانت له نسخة احتياطية متحقق منها ظهر في «استعادة ملف من نسخته» أعلاه؛ اضغط مطوّلاً.</li>
            <li>يُخدَّم الملف من النسخة. لإعادته إلى مزود المكتبة خطّط نقلاً من «التخزين».</li>
          </ol>
        </details>
        <details>
          <summary>قاعدة البيانات</summary>
          <ol>
            <li>لا تُعرض استعادة القاعدة من الموقع، لأن الاستعادة قد تتعارض مع حالة خارجية (بريد أُرسل، منشورات، رسائل واتساب).</li>
            <li>نسخ مزود قاعدة البيانات (Supabase) هي النسخة الكاملة التي تشمل البريد والمراسلة؛ تُستعاد منها إلى مشروع مرحلي أولاً.</li>
            <li>ملف «السجلات» هنا يُقرأ ويُقارَن؛ يساعد في استرجاع سجل معيّن أو التحقق، ولا يُضخّ كله في قاعدة قائمة.</li>
            <li>بعد أي استعادة: أعد إدخال مفاتيح التكاملات (لا تُصدَّر) وافحص الاتصالات.</li>
          </ol>
        </details>
        <details>
          <summary>الإعدادات والصلاحيات</summary>
          <ol>
            <li>ملف «الإعدادات» يسرد الأدوار والصلاحيات والمنصات وقوالب الخطط؛ لا سر فيه.</li>
            <li>أعد ما تغيّر من الواجهة (الحسابات، المنصات، التخزين) ولا تنسخه حرفياً إلى القاعدة.</li>
          </ol>
        </details>
        <details>
          <summary>الأسرار</summary>
          <p>لا تُصدَّر ولا تُنسخ. الاستعادة بإعادة إدخالها: مفتاح مزود التخزين، تطبيقا Meta وTikTok، ورمز Google Drive.</p>
        </details>
        <h4>ما لا يدخل في التصدير</h4>
        <ul className="st-yesno">
          {EXCLUDED.map((x) => (
            <li key={x.what} className="no">
              <span>{x.what}</span>
              <b>{x.why}</b>
            </li>
          ))}
        </ul>
        <small className="muted">
          الجداول المصدّرة: السجلات ({data.tables.database.length} جدولاً) والإعدادات ({data.tables.config.length} جدولاً). يقرأ التصدير كل جدول على صفحات: غيّر شيء أثناءه قد لا يظهر، فشغّله وقت الهدوء.
        </small>
      </section>
    </div>
  );
}

function JobCard({
  job,
  files,
  target,
  canRun,
  canMigrate,
  busy,
  onRun,
  onVerify,
  onPolicy,
  lock,
}: {
  job: BackupJob;
  files: BackupOverview['files'];
  target: boolean;
  canRun: boolean;
  canMigrate: boolean;
  busy: string | null;
  onRun: () => void;
  onVerify: () => void;
  onPolicy: (retention: number, warn: number) => void;
  lock: (cap: string, why: string) => ReturnType<typeof needProps>;
}) {
  const [retention, setRetention] = useState(job.retention_count);
  const [warn, setWarn] = useState(job.warn_days);
  const g = job.last_good;
  const isFiles = job.kind === 'files';
  const needsBoth = isFiles && !canMigrate;
  const cannot = canRun && !needsBoth && isFiles && !target;
  return (
    <article className={`st-int st-backup-job ${job.stale && job.enabled ? 'danger' : g ? 'success' : ''}`} data-kind={job.kind}>
      <header className="between">
        <b>{BACKUP_KIND_AR[job.kind]}</b>
        <span className={`mx-chip ${job.stale ? 'danger' : 'success'}`}>{job.stale ? (g ? 'متقادمة' : 'لا نسخة') : 'حديثة'}</span>
      </header>
      <small>{BACKUP_KIND_NOTE[job.kind]}</small>
      <div className="table st-copies">
        <div className="between">
          <span>آخر نسخة سليمة</span>
          <b>{g ? `${ageAr(g.at)} · ${when(g.at)}` : 'لا توجد نسخة بعد'}</b>
        </div>
        {g && (
          <>
            <div className="between">
              <span>الحجم</span>
              <b>
                {g.items} {isFiles ? 'ملف' : 'سجل'} · {sizeAr(g.size_bytes)}
              </b>
            </div>
            <div className="between">
              <span>التحقق</span>
              <b className={g.verified_at ? (g.verify_ok ? '' : 'danger') : 'muted'}>
                {g.verified_at ? `${g.verify_ok ? 'متحقق منها' : 'فشل التحقق'} · ${when(g.verified_at)}` : 'لم يُتحقق منها بعد'}
              </b>
            </div>
            {!isFiles && (
              <div className="between">
                <span>المحفوظ</span>
                <b>{g.kept ? 'عند مزود النسخ الاحتياطي' : 'نُزّلت إلى جهازك فقط'}</b>
              </div>
            )}
          </>
        )}
        {isFiles && (
          <div className="between">
            <span>ملفات لها نسخة متحقق منها</span>
            <b>
              {files.backed_up} من {files.total}
              {files.failed_copies ? ` · تعذّر ${files.failed_copies}` : ''}
            </b>
          </div>
        )}
        {job.last_run && job.last_run.state === 'failed' && (
          <div className="between st-bad">
            <span>آخر محاولة</span>
            <b className="danger">فشلت</b>
          </div>
        )}
      </div>
      <div className="actions">
        <button
          type="button"
          className="primary st-backup-run"
          disabled={busy !== null || cannot}
          {...(!canRun
            ? lock('backups.run', 'النسخ لمن يملك «تشغيل النسخ الاحتياطي»: مسؤول النظام افتراضياً.')
            : needsBoth
              ? lock('storage.migrate', 'نسخ الملفات يحتاج أيضاً «نقل الملفات بين مزودي التخزين».')
              : { onClick: onRun })}
        >
          {busy === job.kind ? 'يعمل…' : isFiles ? 'انسخ الملفات الجديدة' : 'صدّر ونزّل'}
        </button>
        <button
          type="button"
          className="secondary st-backup-verify"
          disabled={busy !== null || !g || (!isFiles && !g.kept)}
          {...(!canRun ? lock('backups.run', 'التحقق لمن يملك «تشغيل النسخ الاحتياطي».') : { onClick: onVerify })}
        >
          {busy === `v-${job.kind}` ? 'يقرأ…' : 'تحقق من النسخة'}
        </button>
      </div>
      {isFiles && !target && <small className="muted">حدّد مزود النسخ أعلاه أولاً.</small>}
      <div className="st-policy">
        <label>
          التنبيه بعد (أيام)
          <input type="number" min={1} max={365} value={warn} disabled={!canRun} onChange={(e) => setWarn(Math.max(1, Math.min(365, Number(e.target.value) || 1)))} />
        </label>
        {!isFiles && (
          <label>
            الاحتفاظ بآخر
            <input type="number" min={1} max={60} value={retention} disabled={!canRun} onChange={(e) => setRetention(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} />
          </label>
        )}
        <button
          type="button"
          className="secondary"
          disabled={busy !== null || (warn === job.warn_days && retention === job.retention_count)}
          {...(!canRun ? lock('backups.run', 'السياسة لمن يملك «تشغيل النسخ الاحتياطي».') : { onClick: () => onPolicy(retention, warn) })}
        >
          حفظ السياسة
        </button>
        <small className="muted">التكرار: يدوي. الجدولة تنتظر جهاز الوكيل.</small>
      </div>
    </article>
  );
}

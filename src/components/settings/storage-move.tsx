'use client';
// Moving files between storage providers (Settings_Integrations_Plan.md 6.3): a plan with a dry
// run, a copy that can be paused and resumed, verification, the switch, the hold of the source,
// and a report. The state is in the database; this page only drives it, one batch at a time,
// while it is open. There is no background worker: closing the page pauses the run in practice,
// and opening it again continues from where it was. Nothing here deletes a file: a source is
// kept as a replica until a separate, hold-confirmed action sends it to its provider's trash.
import { useCallback, useEffect, useRef, useState } from 'react';
import { HOLD } from '@/lib/kit/hold-reasons';
import { needProps } from '@/lib/kit/need';
import { supabase } from '@/lib/supabase/client';
import { SetupGuide } from '../setup-guide';
import {
  MOVE_ITEM_AR,
  MOVE_STATE_AR,
  MOVE_STATE_TONE,
  PROVIDER_TYPE_AR,
  SKIP_REASON_AR,
  durationAr,
  estimateSeconds,
  failReasonAr,
  intError,
  moveProgress,
  moveScopeAr,
  sizeAr,
  type BatchAnswer,
  type MoveReport,
  type MoveRow,
  type MoveItemState,
  type StorageProviderRow,
} from '@/lib/integrations/rules';

export type FolderRow = { id: string; name: string; parent_id: string | null };

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Reply = Record<string, unknown> & { error?: string };
async function post(body: Record<string, unknown>): Promise<{ ok: boolean; data: Reply }> {
  try {
    const res = await fetch('/api/storage/move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Reply };
  } catch {
    return { ok: false, data: { error: intError('') } };
  }
}

/** Folders in tree order with their depth, for an indented list. */
function ordered(folders: FolderRow[]): { f: FolderRow; depth: number }[] {
  const out: { f: FolderRow; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const f of folders.filter((x) => x.parent_id === parent).sort((a, b) => a.name.localeCompare(b.name, 'ar'))) {
      out.push({ f, depth });
      if (depth < 8) walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function MovePanel({
  providers,
  canMigrate,
  initialMoves,
  initialReport,
  initialFolders,
  onChanged,
}: {
  providers: StorageProviderRow[];
  canMigrate: boolean;
  initialMoves?: MoveRow[];
  initialReport?: MoveReport | null;
  initialFolders?: FolderRow[];
  onChanged: () => void;
}) {
  const ready = providers.filter((p) => p.state === 'connected');
  const [moves, setMoves] = useState<MoveRow[]>(initialMoves ?? []);
  const [report, setReport] = useState<MoveReport | null>(initialReport ?? null);
  const [folders, setFolders] = useState<FolderRow[]>(initialFolders ?? []);
  const [source, setSource] = useState('');
  const [dest, setDest] = useState('');
  const [kind, setKind] = useState<'library' | 'mail'>('library');
  const [folder, setFolder] = useState('');
  const [mode, setMode] = useState<'move' | 'copy'>('move');
  const [hold, setHold] = useState(14);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const token = useRef(0);

  const loadMoves = useCallback(async () => {
    const { data } = await supabase().rpc('storage_moves_overview');
    if (Array.isArray(data)) setMoves(data as MoveRow[]);
  }, []);
  const loadReport = useCallback(async (id: string) => {
    const { data, error } = await supabase().rpc('storage_move_report', { p_id: id });
    if (error || !data) return null;
    setReport(data as MoveReport);
    return data as MoveReport;
  }, []);

  useEffect(() => {
    if (initialMoves) return;
    void loadMoves();
    void (async () => {
      const { data } = await supabase().from('media_folders').select('id, name, parent_id');
      if (Array.isArray(data)) setFolders(data as FolderRow[]);
    })();
  }, [initialMoves, loadMoves]);
  // Leaving the page ends the runner; the plan stays where it was in the database.
  useEffect(
    () => () => {
      token.current = -1;
    },
    [],
  );

  const folderName = (id?: string) => folders.find((f) => f.id === id)?.name ?? null;

  /** One batch after another, until the move stops, the provider refuses, or the page is left. */
  const drive = useCallback(
    async (id: string) => {
      const mine = ++token.current;
      setRunning(true);
      let idle = 0;
      try {
        while (token.current === mine) {
          const r = await post({ action: 'run', id });
          if (!r.ok) {
            setNote({ ok: false, text: r.data.error ?? intError('') });
            break;
          }
          const a = r.data as unknown as BatchAnswer;
          await loadReport(id);
          if (a.stopped === 'provider') {
            setNote({ ok: false, text: 'تعذّر الوصول إلى أحد المزودين أو رفض الخادم. لم يُعلَّم ملف بالفشل: افحص الاتصال ثم استأنف.' });
            break;
          }
          if (a.state !== 'running') break;
          if (a.claimed === 0) {
            // Everything left is held by another open page, or settling: look again in a moment.
            if (++idle > 20) break;
            await sleep(3000);
          } else {
            idle = 0;
            await sleep(250);
          }
        }
      } finally {
        if (token.current === mine) token.current = 0;
        setRunning(false);
        await loadMoves();
        onChanged();
      }
    },
    [loadReport, loadMoves, onChanged],
  );

  const act = async (action: string, id: string, done: string) => {
    setBusy(true);
    setNote(null);
    const r = await post({ action, id });
    setBusy(false);
    if (!r.ok) return setNote({ ok: false, text: r.data.error ?? intError('') });
    setNote({ ok: true, text: done });
    return r;
  };

  const plan = async () => {
    setBusy(true);
    setNote(null);
    const r = await post({
      action: 'plan',
      source,
      dest,
      scope: { kind, folderId: kind === 'library' && folder ? folder : undefined },
      mode,
      label,
      holdDays: hold,
    });
    setBusy(false);
    if (!r.ok) return setNote({ ok: false, text: r.data.error ?? intError('') });
    const id = String(r.data.id);
    await loadReport(id);
    await loadMoves();
    setNote(
      r.data.warning
        ? { ok: false, text: String(r.data.warning) }
        : { ok: true, text: 'حُسبت الخطة. لم يُنسخ شيء بعد: راجع التقرير ثم ابدأ.' },
    );
  };

  const start = async (id: string) => {
    const r = await act('start', id, 'بدأ النقل. أبقِ هذه الصفحة مفتوحة حتى يكتمل أو أوقفه مؤقتاً.');
    if (!r) return;
    await loadReport(id);
    void drive(id);
  };
  const pause = async (id: string) => {
    token.current++; // the loop stops after the batch in hand
    const r = await act('pause', id, 'أُوقف النقل مؤقتاً. أُنهيت الدفعة الجارية ولا شيء مفقود.');
    if (r) await loadReport(id);
    await loadMoves();
  };
  const cancel = async (id: string) => {
    token.current++;
    const r = await act('cancel', id, 'أُلغي النقل. ما نُقل يبقى منقولاً ومصدره محفوظ.');
    if (r) await loadReport(id);
    await loadMoves();
    onChanged();
  };
  const retry = async (id: string) => {
    const r = await act('retry', id, 'أُعيدت المحاولة لما تعذّر.');
    if (!r) return;
    await loadReport(id);
    void drive(id);
  };
  const retire = async (id: string) => {
    setBusy(true);
    setNote(null);
    const r = await post({ action: 'retire', id });
    setBusy(false);
    if (!r.ok) return setNote({ ok: false, text: r.data.error ?? intError('') });
    const n = Number(r.data.retired ?? 0);
    const left = Number(r.data.remaining ?? 0);
    setNote({ ok: left === 0, text: `أُحيلت ${n} نسخة من المصدر إلى سلة مزودها${left ? `، وتعذّر ${left}: أعد المحاولة` : ''}.` });
    await loadReport(id);
    await loadMoves();
    onChanged();
  };

  const lock = needProps('storage.migrate', 'نقل الملفات لمن يملك «نقل الملفات بين مزودي التخزين»: مسؤول النظام افتراضياً.');
  const sameProvider = Boolean(source) && source === dest;
  const planReady = Boolean(source) && Boolean(dest) && !sameProvider;
  const sourceRow = providers.find((p) => p.id === source);
  const destRow = providers.find((p) => p.id === dest);

  return (
    <section className="st-block st-moves" aria-label="نقل الملفات">
      <h3>
        نقل الملفات بين المزودين <SetupGuide guide="move" label="خطوات النقل الأول" />
      </h3>
      <p className="muted">
        تنسخ الملفات إلى المزود الآخر وتتحقق من كل ملف ببصمته، ثم يصير الجديد هو الأصل ويبقى المصدر نسخة محفوظة. لا شيء يُحذف: إحالة المصدر إلى
        التقاعد إجراء منفصل بعد مدة الاحتفاظ. الملفات المرفوعة بعد النقل تذهب إلى Google Drive كما كانت، وتُنقل بخطة جديدة.
      </p>

      {ready.length < 2 ? (
        <p className="ml-hint st-move-need">
          النقل يحتاج مزودين متصلين. أضف مزود تخزين من الأعلى وافحص اتصاله، ثم تعود هنا.
        </p>
      ) : (
        <div className="st-int st-move-form">
          <div className="st-provider-row">
            <label>
              من
              <select value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="">اختر المصدر</option>
                {ready.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              إلى
              <select value={dest} onChange={(e) => setDest(e.target.value)}>
                <option value="">اختر الهدف</option>
                {ready.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="st-provider-row">
            <label>
              ما يُنقل
              <select value={kind} onChange={(e) => setKind(e.target.value as 'library' | 'mail')}>
                <option value="library">مكتبة الوسائط</option>
                <option value="mail">مرفقات البريد والمراسلة</option>
              </select>
            </label>
            {kind === 'library' && (
              <label>
                المجلد
                <select value={folder} onChange={(e) => setFolder(e.target.value)}>
                  <option value="">المكتبة كلها</option>
                  {ordered(folders).map(({ f, depth }) => (
                    <option key={f.id} value={f.id}>
                      {'— '.repeat(depth)}
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              النمط
              <select value={mode} onChange={(e) => setMode(e.target.value as 'move' | 'copy')}>
                <option value="move">نقل: يصير الجديد هو الأصل</option>
                <option value="copy">نسخ فقط: يبقى الأصل مكانه</option>
              </select>
            </label>
          </div>
          <div className="st-provider-row">
            <label>
              الاحتفاظ بالمصدر (أيام)
              <input type="number" min={0} max={365} value={hold} onChange={(e) => setHold(Math.max(0, Math.min(365, Number(e.target.value) || 0)))} disabled={mode === 'copy'} />
            </label>
            <label>
              ملاحظة (اختياري)
              <input value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder="مثل: أرشيف 2025" />
            </label>
          </div>
          {sameProvider && <p className="ml-err">المصدر والهدف مزود واحد.</p>}
          <div className="actions">
            <button
              type="button"
              className="primary st-move-plan-btn"
              disabled={busy || running || (canMigrate && !planReady)}
              {...(canMigrate ? { onClick: () => void plan() } : lock)}
            >
              {busy ? 'جارٍ الحساب…' : 'احسب الخطة (تجربة بلا نسخ)'}
            </button>
          </div>
          {sourceRow && destRow && kind === 'library' && (
            <small className="muted">
              من {sourceRow.label} ({PROVIDER_TYPE_AR[sourceRow.type] ?? sourceRow.type}) إلى {destRow.label} ({PROVIDER_TYPE_AR[destRow.type] ?? destRow.type}).
            </small>
          )}
        </div>
      )}

      {note && (
        <p className={note.ok ? 'ml-hint' : 'ml-err'} role="status">
          {note.text}
        </p>
      )}

      {report && (
        <ReportCard
          r={report}
          running={running}
          busy={busy}
          canMigrate={canMigrate}
          folder={folderName(report.move.scope.folder_id)}
          lock={lock}
          onStart={() => void start(report.move.id)}
          onPause={() => void pause(report.move.id)}
          onResume={() => void start(report.move.id)}
          onCancel={() => void cancel(report.move.id)}
          onRetry={() => void retry(report.move.id)}
          onRetire={() => void retire(report.move.id)}
          onDrive={() => void drive(report.move.id)}
        />
      )}

      {moves.length > 0 && (
        <div className="st-move-history">
          <h4>آخر عمليات النقل</h4>
          <ul className="st-events">
            {moves.map((m) => (
              <li key={m.id}>
                <span className="between">
                  <b>
                    {m.source} إلى {m.dest}
                  </b>
                  <span className={`mx-chip ${MOVE_STATE_TONE[m.state]}`}>{MOVE_STATE_AR[m.state]}</span>
                </span>
                <small>
                  {moveScopeAr(m.scope, folderName(m.scope.folder_id))} · {m.mode === 'backup' ? 'نسخ احتياطي' : m.mode === 'copy' ? 'نسخ فقط' : 'نقل'} · {m.switched + m.copied} من {m.files} · {sizeAr(m.bytes)}
                  {m.failed ? ` · تعذّر ${m.failed}` : ''}
                  {m.skipped ? ` · تُخطّي ${m.skipped}` : ''} · {when(m.created_at)}
                </small>
                <button type="button" className="secondary" onClick={() => void loadReport(m.id)}>
                  عرض التقرير
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ReportCard({
  r,
  running,
  busy,
  canMigrate,
  folder,
  lock,
  onStart,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onRetire,
  onDrive,
}: {
  r: MoveReport;
  running: boolean;
  busy: boolean;
  canMigrate: boolean;
  folder: string | null;
  lock: ReturnType<typeof needProps>;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onRetire: () => void;
  onDrive: () => void;
}) {
  const m = r.move;
  const c = (k: MoveItemState) => r.counts[k] ?? 0;
  const done = c('switched') + (m.mode === 'copy' ? c('verified') : 0);
  const failed = Object.entries(r.failed);
  const skipped = Object.entries(r.skipped);
  const enough = m.dest_free === null || m.bytes <= m.dest_free;
  const pct = Math.round(moveProgress(r) * 100);
  const movable = c('pending') + c('copying') + c('copied') + (m.mode === 'move' ? c('verified') : 0);
  const act = (fn: () => void) => (canMigrate ? { onClick: fn } : lock);

  return (
    <article className={`st-int st-move-plan ${MOVE_STATE_TONE[m.state]}`}>
      <header className="between">
        <b>
          {m.source.label} إلى {m.dest.label}
          {m.label ? ` · ${m.label}` : ''}
        </b>
        <span className={`mx-chip ${MOVE_STATE_TONE[m.state]}`}>{MOVE_STATE_AR[m.state]}</span>
      </header>
      <small>
        {moveScopeAr(m.scope, folder)} · {m.mode === 'copy' ? 'نسخ فقط، يبقى الأصل مكانه' : `نقل، يُحتفظ بالمصدر ${m.hold_days} يوماً`} · أنشأها {m.created_by_name ?? m.created_by} في {when(m.created_at)}
      </small>

      <div className="table st-copies">
        <div className="between">
          <span>ملفات جاهزة للنسخ</span>
          <b>
            {m.files} · {sizeAr(m.bytes)}
          </b>
        </div>
        {m.state === 'planned' && (
          <div className="between">
            <span>الوقت المقدّر (تقريبي)</span>
            <b>{durationAr(estimateSeconds(m.bytes, m.files))}</b>
          </div>
        )}
        <div className="between">
          <span>المساحة الحرة عند الهدف</span>
          <b className={enough ? '' : 'danger'}>
            {m.dest_checked_at === null ? 'لم تُفحص' : m.dest_free === null ? 'لا يذكرها المزود' : `${sizeAr(m.dest_free)}${enough ? '' : ' (لا تكفي)'}`}
          </b>
        </div>
        {r.already_there > 0 && (
          <div className="between">
            <span>لها نسخة جاهزة عند الهدف (يُتحقق منها ولا تُنسخ)</span>
            <b>{r.already_there}</b>
          </div>
        )}
        {r.approved > 0 && (
          <div className="between">
            <span>إصدارات معتمدة (لا تُنقل إلا ببصمة مطابقة)</span>
            <b>{r.approved}</b>
          </div>
        )}
      </div>

      {m.state !== 'planned' && (
        <div className="st-move-run">
          <div className="st-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="تقدم النقل">
            <span style={{ width: `${pct}%` }} />
          </div>
          <div className="table">
            <div className="between">
              <span>التقدم</span>
              <b>
                {pct}% · {sizeAr(r.bytes.done + r.bytes.partial)} من {sizeAr(r.bytes.planned)}
              </b>
            </div>
            {(Object.keys(MOVE_ITEM_AR) as MoveItemState[])
              .filter((k) => c(k) > 0)
              .map((k) => (
                <div className="between" key={k}>
                  <span>{MOVE_ITEM_AR[k]}</span>
                  <b>{c(k)}</b>
                </div>
              ))}
            {(r.verify.checksum ?? 0) + (r.verify.size ?? 0) > 0 && (
              <div className="between">
                <span>تحقق ببصمة المحتوى / بالحجم فقط</span>
                <b>
                  {r.verify.checksum ?? 0} / {r.verify.size ?? 0}
                </b>
              </div>
            )}
          </div>
        </div>
      )}

      {skipped.length > 0 && (
        <div className="st-move-skipped">
          <b>لا يمكن نقلها</b>
          <ul>
            {skipped.map(([reason, n]) => (
              <li key={reason}>
                {n} · {SKIP_REASON_AR[reason] ?? SKIP_REASON_AR.unknown}
              </li>
            ))}
          </ul>
        </div>
      )}
      {failed.length > 0 && (
        <div className="st-move-failed">
          <b>تعذّر نقلها</b>
          <ul>
            {failed.map(([reason, n]) => (
              <li key={reason}>
                {n} · {failReasonAr(reason)}
              </li>
            ))}
          </ul>
          <small className="muted">لم يُغيَّر شيء عند المصدر لهذه الملفات. تُعاد المحاولة بزر «أعد محاولة ما تعذّر».</small>
        </div>
      )}

      <div className="actions st-move-actions">
        {m.state === 'planned' && (
          <button type="button" className="primary st-move-start" disabled={busy || m.files === 0 || !enough || m.dest_checked_at === null} {...act(onStart)}>
            {m.files === 0 ? 'لا ملفات للنقل' : 'ابدأ النقل'}
          </button>
        )}
        {m.state === 'running' && (
          <>
            {running ? (
              <button type="button" className="secondary st-move-pause" disabled={busy} {...act(onPause)}>
                إيقاف مؤقت
              </button>
            ) : (
              <button type="button" className="primary st-move-drive" disabled={busy} {...act(onDrive)}>
                تابع التنفيذ من هذه الصفحة
              </button>
            )}
          </>
        )}
        {m.state === 'paused' && (
          <button type="button" className="primary st-move-resume" disabled={busy} {...act(onResume)}>
            استئناف
          </button>
        )}
        {(m.state === 'planned' || m.state === 'running' || m.state === 'paused') && (
          <button type="button" className="secondary danger st-move-cancel" disabled={busy} data-hold={HOLD.moveCancel} onClick={onCancel}>
            {m.state === 'planned' ? 'إلغاء الخطة' : 'إلغاء النقل'}
          </button>
        )}
        {c('failed') > 0 && (m.state === 'completed' || m.state === 'running' || m.state === 'paused') && (
          <button type="button" className="secondary st-move-retry" disabled={busy} {...act(onRetry)}>
            أعد محاولة ما تعذّر
          </button>
        )}
      </div>

      {m.state === 'running' && (
        <p className="ml-hint st-move-honest">
          {running
            ? 'يعمل الآن من هذه الصفحة. لا عامل في الخلفية: إن أغلقتها توقّف التنفيذ بعد الدفعة الجارية ويستأنف من حيث وقف حين تفتحها وتضغط «تابع التنفيذ».'
            : 'الحالة «يعمل» لكن لا صفحة تنفّذ الآن. لا عامل في الخلفية: اضغط «تابع التنفيذ من هذه الصفحة».'}
        </p>
      )}

      {m.state === 'completed' && m.mode === 'move' && (
        <div className="st-move-hold">
          <b>نسخ المصدر المحفوظة</b>
          <p className="muted">
            {r.retirable > 0
              ? `${r.retirable} نسخة بقيت عند ${m.source.label} نسخةً احتياطية، وتُحفظ حتى ${when(m.hold_until)}. الملفات تُخدَّم من ${m.dest.label}.`
              : r.retired > 0
                ? `أُحيلت ${r.retired} نسخة من المصدر إلى سلة ${m.source.label}، وتُستعاد منه وحده.`
                : 'لا نسخ محفوظة عند المصدر.'}
          </p>
          {r.retirable > 0 && (
            <button
              type="button"
              className="secondary danger st-move-retire"
              disabled={busy || !r.hold_over || !canMigrate}
              data-hold={HOLD.retireSource}
              onClick={onRetire}
              title={canMigrate ? undefined : 'لمن يملك «نقل الملفات بين مزودي التخزين».'}
            >
              أحل نسخ المصدر إلى التقاعد
            </button>
          )}
          {r.retirable > 0 && !r.hold_over && <small className="muted">يُفتح هذا الإجراء بعد {when(m.hold_until)}.</small>}
        </div>
      )}
      {m.state === 'completed' && (
        <small className="muted st-move-report">
          التقرير: {done} {done === 1 ? 'ملف' : 'ملفات'} {m.mode === 'copy' ? 'نُسخت' : 'نُقلت'}
          {m.finished_at ? ` وانتهى ${when(m.finished_at)}` : ''}
          {movable > 0 ? ` · بقي ${movable}` : ''}. السجل في «السجل» يحفظ هذا الملخص.
        </small>
      )}
    </article>
  );
}


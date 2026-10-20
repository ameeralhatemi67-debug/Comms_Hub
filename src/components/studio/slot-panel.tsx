'use client';

// The settings of «مكان محجوز» (MVP_draft.md 62.12): what it waits for and whether it is a video or a picture;
// «إسناد مهمة» makes a work task for it through the work cycle's own task_create (the person, the kind, the
// due time and a note with its place, length and size), with the frame at the place attached to the task when
// wanted (saved to a chosen library folder). Then the place reads its task: open, or «سُلّمت» once done, and
// lists the files linked to the work since the task began and a newer version of the attached frame;
// «وضعه مكان المحجوز» puts the chosen one there at its exact version. Read again on focus and on «تحديث».
import { useCallback, useEffect, useState } from 'react';
import { CircleCheck, ClipboardList, RefreshCw, SquareDashed } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { workErrorText } from '@/lib/work/rules';
import { SLOT_MEDIA_LABELS, SLOT_WHAT_MAX, slotNote } from '@/lib/studio/slot';
import { exportStill, fileName } from '@/lib/studio/export';
import type { Clip, ProjectDoc, Slot } from '@/lib/studio/schema';
import type { MediaPool } from '@/lib/studio/media';
import { Modal } from '../ui';
import { FolderSelect } from './folder-picker';
import { assetRow, uploadToLibrary, type AssetRow } from './library';

type Task = { id: string; what: string; assignee: string; status: string; due: string; done_at: string | null; created_at: string; asset_id: string | null };
type Person = { email: string; display_name: string; role: string };

const when = (iso: string) => new Intl.DateTimeFormat('ar-SA-u-nu-latn', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' }).format(new Date(iso));

export function SlotPanel({ doc, clip, title, workRef, readOnly, pool, onSlot, onFill }: {
  doc: ProjectDoc;
  clip: Clip;
  title: string;
  workRef: string | null;
  readOnly: boolean;
  pool: MediaPool | null;
  onSlot: (slot: Slot, label: string, key?: string) => void;
  onFill: (row: AssetRow) => void;
}) {
  const slot = clip.slot!;
  const [task, setTask] = useState<Task | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<AssetRow[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [again, setAgain] = useState(0);

  const load = useCallback(async () => {
    if (!slot.task) {
      setTask(null);
      setFiles([]);
      return;
    }
    const db = supabase();
    const t = await db.from('media_tasks').select('id,what,assignee,status,due,done_at,created_at,asset_id').eq('id', slot.task).maybeSingle();
    const row = (t.data as Task | null) ?? null;
    setTask(row);
    if (row) {
      const a = await db.from('accounts').select('email,display_name').eq('email', row.assignee).maybeSingle();
      const p = a.data as { email: string; display_name: string } | null;
      if (p) setNames((n) => ({ ...n, [p.email]: p.display_name }));
    }
    // what came for it: files linked to the work since the task began, and a newer version of the attached frame
    const since = slot.taskAt ?? row?.created_at ?? '';
    const ids: string[] = [];
    if (workRef) {
      const w = await db.from('work_assets').select('asset_id,added_at').eq('work_id', workRef);
      for (const x of (w.data ?? []) as { asset_id: string; added_at: string }[]) if (!since || x.added_at >= since) ids.push(x.asset_id);
    }
    const out: AssetRow[] = [];
    for (const id of [...new Set(ids)]) {
      const r = await assetRow(id);
      if (r && r.kind !== 'audio') out.push(r);
    }
    if (row?.asset_id) {
      const r = await assetRow(row.asset_id);
      if (r && r.current_version > (slot.taskVersion ?? 1) && !out.some((x) => x.id === r.id)) out.push(r);
    }
    setFiles(out);
  }, [slot.task, slot.taskAt, slot.taskVersion, workRef]);
  useEffect(() => {
    void load();
    const back = () => void load();
    window.addEventListener('focus', back);
    return () => window.removeEventListener('focus', back);
  }, [load, again]);

  return (
    <div className="st-slot">
      <label>
        المطلوب
        <input value={slot.what} maxLength={SLOT_WHAT_MAX} dir="auto" disabled={readOnly} onChange={(e) => onSlot({ ...slot, what: e.target.value }, 'وصف المكان المحجوز', `slot-what-${clip.id}`)} />
      </label>
      <div className="st-seg-mini" role="group" aria-label="نوع المطلوب">
        {(['video', 'image'] as const).map((m) => (
          <button key={m} type="button" aria-pressed={slot.media === m} className={slot.media === m ? 'on' : ''} disabled={readOnly} onClick={() => onSlot({ ...slot, media: m }, 'نوع المكان المحجوز')}>
            {SLOT_MEDIA_LABELS[m]}
          </button>
        ))}
      </div>
      <p className="st-hint">
        <SquareDashed aria-hidden="true" /> {slot.over ? 'مربع فوق اللقطة' : 'ملء الإطار'}، ويظهر مخططاً في المعاينة والتصدير حتى يُملأ.
      </p>
      {!slot.task ? (
        <button type="button" className="st-mini st-slot-assign" disabled={readOnly} onClick={() => setAssigning(true)}>
          <ClipboardList aria-hidden="true" />
          إسناد مهمة…
        </button>
      ) : (
        <div className="st-slot-task" data-state={task?.status === 'done' ? 'done' : 'open'}>
          {task ? (
            task.status === 'done' ? (
              <p>
                <CircleCheck aria-hidden="true" /> سُلّمت{task.done_at ? ` في ${when(task.done_at)}` : ''} · {names[task.assignee] ?? task.assignee}
              </p>
            ) : (
              <p>
                <ClipboardList aria-hidden="true" /> مُسندة إلى {names[task.assignee] ?? task.assignee}، التسليم {when(task.due)}
              </p>
            )
          ) : (
            <p className="st-hint">لا تظهر المهمة لك، أو حُذفت.</p>
          )}
          <button type="button" className="st-linkish" onClick={() => setAgain((x) => x + 1)}>
            <RefreshCw aria-hidden="true" /> تحديث
          </button>
        </div>
      )}
      {slot.task && (
        <div className="st-slot-files">
          <b className="st-sub">ما وصل له</b>
          {!files.length && <p className="st-hint">{workRef ? 'لم يُربط بالعمل ملف جديد منذ إسناد المهمة بعد.' : 'المشروع غير مرتبط بعمل: يظهر هنا الإصدار الأحدث من صورة الإطار المرفقة فقط.'}</p>}
          <ul>
            {files.map((f) => (
              <li key={f.id}>
                <span dir="auto">{f.name}</span> <small>الإصدار {f.current_version}</small>
                <button type="button" className="st-mini" disabled={readOnly} onClick={() => onFill(f)}>
                  وضعه مكان المحجوز
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {assigning && (
        <AssignDialog
          doc={doc}
          clip={clip}
          title={title}
          workRef={workRef}
          pool={pool}
          onClose={() => setAssigning(false)}
          onDone={(id, version) => {
            setAssigning(false);
            onSlot({ ...slot, task: id, taskAt: new Date().toISOString(), ...(version ? { taskVersion: version } : {}) }, 'إسناد مهمة');
          }}
        />
      )}
    </div>
  );
}

/** A local «YYYY-MM-DDTHH:mm» two days from now at one in the afternoon, for the due field. */
function defaultDue(): string {
  const d = new Date(Date.now() + 2 * 86_400_000);
  d.setHours(13, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function AssignDialog({ doc, clip, title, workRef, pool, onClose, onDone }: {
  doc: ProjectDoc;
  clip: Clip;
  title: string;
  workRef: string | null;
  pool: MediaPool | null;
  onClose: () => void;
  onDone: (taskId: string, frameVersion: number | null) => void;
}) {
  const slot = clip.slot!;
  const [people, setPeople] = useState<Person[]>([]);
  const [who, setWho] = useState('');
  const [kind, setKind] = useState<'design' | 'edit' | 'other'>(slot.media === 'image' ? 'design' : 'edit');
  const [due, setDue] = useState(defaultDue);
  const [extra, setExtra] = useState('');
  const [frame, setFrame] = useState(true);
  const [folder, setFolder] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void supabase()
      .from('accounts')
      .select('email,display_name,role')
      .order('display_name')
      .then(({ data }) => setPeople(((data ?? []) as Person[]).filter((p) => p.role !== 'member')));
  }, []);
  const note = slotNote(doc, clip, title, extra);
  const run = async () => {
    setError(null);
    try {
      let asset: AssetRow | null = null;
      if (frame) {
        if (!pool) throw new Error('الملفات لم تجهز بعد على هذا الجهاز.');
        setBusy('جارٍ حفظ صورة الإطار…');
        const file = await exportStill(doc, pool, { t: clip.start, name: fileName(`مكان محجوز ${title}`, 'png'), type: 'image/png' });
        asset = await uploadToLibrary(file, folder, () => undefined);
      }
      setBusy('جارٍ إسناد المهمة…');
      const { data, error: e } = await supabase().rpc('task_create', {
        p: { what: slot.what.trim().slice(0, 140), kind, assignee: who, due: new Date(due).toISOString(), note, work: workRef ?? '', asset: asset?.id ?? '', priority: 'normal' },
      });
      if (e) throw new Error(workErrorText(e.message));
      onDone(String(data), asset?.current_version ?? null);
    } catch (err) {
      setError((err as Error).message || 'تعذّر إسناد المهمة.');
    } finally {
      setBusy(null);
    }
  };
  return (
    <Modal title="إسناد مهمة للمكان المحجوز" onClose={() => !busy && onClose()}>
      <div className="st-form">
        <p dir="auto">«{slot.what}»</p>
        <label>
          إلى
          <select value={who} onChange={(e) => setWho(e.target.value)} disabled={!!busy}>
            <option value="">اختر الشخص</option>
            {people.map((p) => (
              <option key={p.email} value={p.email}>{p.display_name}</option>
            ))}
          </select>
        </label>
        <div className="st-seg-mini" role="group" aria-label="نوع المهمة">
          {([['design', 'تصميم'], ['edit', 'تصوير ومونتاج'], ['other', 'أخرى']] as const).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)} disabled={!!busy}>
              {l}
            </button>
          ))}
        </div>
        <label>
          موعد التسليم
          <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} disabled={!!busy} />
        </label>
        <label>
          ملاحظة إضافية (اختيارية)
          <input value={extra} maxLength={200} dir="auto" onChange={(e) => setExtra(e.target.value)} disabled={!!busy} />
        </label>
        <p className="st-hint" dir="auto">{note}</p>
        <label className="st-switch-row">
          <input type="checkbox" checked={frame} onChange={(e) => setFrame(e.target.checked)} disabled={!!busy} />
          إرفاق صورة الإطار عند المكان
        </label>
        {frame && <FolderSelect value={folder} onChange={setFolder} disabled={!!busy} />}
        {!workRef && <p className="st-hint">المشروع غير مرتبط بعمل: لا تُربط المهمة بعمل، ويُتابَع ما يصل من صورة الإطار المرفقة.</p>}
        {busy && <p className="st-hint" role="status">{busy}</p>}
        {error && <p className="warning" role="alert">{error}</p>}
        <div className="actions">
          <button type="button" className="primary" disabled={!!busy || !who || !due || (frame && !folder)} onClick={() => void run()}>
            إسناد
          </button>
          <button type="button" onClick={onClose} disabled={!!busy}>إلغاء</button>
        </div>
      </div>
    </Modal>
  );
}

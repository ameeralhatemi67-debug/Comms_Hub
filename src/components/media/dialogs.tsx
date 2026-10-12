'use client';
// Every dialog of the media section. Each one asks the database (through the media
// provider) and shows its Arabic refusal text when the rules say no.
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { channelAccounts, channelRisks, riskText, roles, type Channel, type Role } from '@/lib/domain';
import { supabase } from '@/lib/supabase/client';
import {
  LEVELS,
  LEVEL_NAMES,
  capabilityMatrix,
  levelLabels,
  platformSpecs,
  taskKindLabels,
  timecodeSeconds,
  type Level,
  type TaskKind,
} from '@/lib/media/rules';
import { Modal } from '../ui';
import { HOLD } from '@/lib/kit/hold-reasons';
import { Icon, Ts } from './parts';
import { useMedia, type AssetRow } from './provider';

export type Dialog =
  | { type: 'newfolder'; parentId: string | null }
  | { type: 'access'; folderId: string }
  | { type: 'move'; ids: string[] }
  | { type: 'assign'; ids: string[] }
  | {
      type: 'copyreq' | 'writecopy' | 'schedule' | 'publish' | 'changes' | 'reject' | 'approve' | 'newver' | 'note' | 'link';
      assetId: string;
    };

const dtLocal = (hoursAhead: number) => {
  const d = new Date(Date.now() + hoursAhead * 3600000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`;
};

function Actions({ onClose, label, busy = false }: { onClose: () => void; label: string; busy?: boolean }) {
  return (
    <div className="mx-row">
      <button type="button" className="secondary" onClick={onClose}>
        إلغاء
      </button>
      <button className="primary" disabled={busy}>
        {busy ? 'جارٍ التنفيذ…' : label}
      </button>
    </div>
  );
}

function ErrorLine({ text }: { text: string }) {
  return text ? (
    <p className="mx-note warn" role="alert">
      <Icon name="alert" />
      <span>{text}</span>
    </p>
  ) : null;
}

export function MediaDialogs({ dialog, onClose }: { dialog: Dialog | null; onClose: () => void }) {
  if (!dialog) return null;
  switch (dialog.type) {
    case 'newfolder':
      return <NewFolder parentId={dialog.parentId} onClose={onClose} />;
    case 'access':
      return <Access folderId={dialog.folderId} onClose={onClose} />;
    case 'move':
      return <MoveTo ids={dialog.ids} onClose={onClose} />;
    case 'assign':
      return <Assign ids={dialog.ids} onClose={onClose} />;
    default:
      return <AssetDialog dialog={dialog} onClose={onClose} />;
  }
}

/* ------------------------------------------------------------------ folder */
function NewFolder({ parentId, onClose }: { parentId: string | null; onClose: () => void }) {
  const m = useMedia();
  const [name, setName] = useState('');
  const [parent, setParent] = useState(parentId ?? '');
  const [restricted, setRestricted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const topLevelOk = m.isAdmin || m.role === 'director' || m.role === 'assistant';
  const parents = m.folders.filter((f) => !f.ghost && m.canCreate(f.id));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await m.createFolder(name, parent || null, restricted);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    m.say(`أُنشئ المجلد «${name.trim()}» في Google Drive`);
    onClose();
  };
  return (
    <Modal title="مجلد جديد" onClose={onClose}>
      <form className="mx-form" onSubmit={submit}>
        <label>
          الاسم
          <input autoFocus required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: الحملة الرمضانية" />
        </label>
        <label>
          داخل
          <select value={parent} onChange={(e) => setParent(e.target.value)}>
            {topLevelOk && <option value="">المستوى الأعلى</option>}
            {parents.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="mx-sw">
          <input type="checkbox" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} />
          مقيّد: يراه من أمنحه الوصول فقط (يتطلب صلاحية «إدارة»)
        </label>
        <p className="mx-note">
          <Icon name="cloud" />
          <span>يُنشأ المجلد في Google Drive بالاسم نفسه ضمن «Comms Hub»، ويرث الوصول من المجلد الأعلى ما لم تقيّده.</span>
        </p>
        <ErrorLine text={error} />
        <Actions onClose={onClose} label="إنشاء المجلد" busy={busy} />
      </form>
    </Modal>
  );
}

type GrantRow = { id: string; subject_type: 'role' | 'person'; subject: string; level: number };

function Access({ folderId, onClose }: { folderId: string; onClose: () => void }) {
  const m = useMedia();
  const folder = m.folderOf(folderId);
  const [grants, setGrants] = useState<GrantRow[] | null>(null);
  const [error, setError] = useState('');
  const [reason, setReason] = useState(folder?.lock_reason ?? '');
  const [addWho, setAddWho] = useState('');

  const refresh = async () => {
    const { data } = await supabase().from('media_grants').select('id, subject_type, subject, level').eq('folder_id', folderId);
    setGrants((data as GrantRow[]) ?? []);
  };
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId]);

  if (!folder) return null;
  const roleIds = (Object.keys(roles) as Role[]).filter((r) => r !== 'admin');
  const levelOfRow = (type: string, subject: string) => grants?.find((g) => g.subject_type === type && g.subject === subject)?.level;
  const persons = (grants ?? []).filter((g) => g.subject_type === 'person');
  const addable = m.people.filter((p) => p.role !== 'admin' && !persons.some((g) => g.subject === p.email));

  const set = async (type: 'role' | 'person', subject: string, value: string) => {
    const r = await m.setGrant(folderId, type, subject, value === '' ? null : (value as Level));
    if (!r.ok) setError(r.error);
    else setError('');
    await refresh();
  };
  const patch = async (p: Parameters<typeof m.patchFolder>[1]) => {
    const r = await m.patchFolder(folderId, p);
    setError(r.ok ? '' : r.error);
  };
  const options = (current?: number, inheritLabel = 'موروث') => (
    <>
      <option value="">{inheritLabel}</option>
      {LEVEL_NAMES.map((l) => (
        <option key={l} value={l} selected={current === LEVELS[l]}>
          {levelLabels[l]}
        </option>
      ))}
    </>
  );

  return (
    <Modal title={`الوصول إلى «${folder.name}»`} onClose={onClose}>
      <div className="mx-form">
        <label className="mx-sw">
          <input type="checkbox" checked={folder.restricted} onChange={(e) => void patch({ restricted: e.target.checked })} />
          مقيّد: لا يرث الوصول من المجلد الأعلى
        </label>
        <div className="mx-note" style={{ display: 'grid' }}>
          <label className="mx-sw">
            <input type="checkbox" checked={folder.locked} onChange={(e) => void patch({ locked: e.target.checked, lock_reason: reason || 'للقراءة فقط' })} />
            <span>
              <b>مقفل</b>: المجلد وما بداخله للقراءة فقط لكل من هم دون «إدارة»
            </span>
          </label>
          <input
            value={reason}
            disabled={!folder.locked}
            maxLength={200}
            placeholder="سبب القفل (يظهر لمن يدخل المجلد)"
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => folder.locked && reason !== (folder.lock_reason ?? '') && void patch({ lock_reason: reason })}
          />
        </div>

        <div className="mx-acl">
          <div className="r h">
            <span>الدور</span>
            <span>المستوى</span>
          </div>
          {roleIds.map((r) => {
            const cur = levelOfRow('role', r);
            return (
              <div className="r" key={r}>
                <span>
                  {roles[r].name}
                  <small>{cur === undefined ? 'موروث' : 'محدد هنا'}</small>
                </span>
                <select
                  aria-label={roles[r].name}
                  value={cur === undefined ? '' : LEVEL_NAMES[cur]}
                  onChange={(e) => void set('role', r, e.target.value)}
                >
                  {options(cur)}
                </select>
              </div>
            );
          })}
          {persons.map((g) => (
            <div className="r" key={g.id}>
              <span>
                {m.nameOf(g.subject)}
                <small>صلاحية خاصة بالشخص</small>
              </span>
              <select aria-label={m.nameOf(g.subject)} value={LEVEL_NAMES[g.level]} onChange={(e) => void set('person', g.subject, e.target.value)}>
                {options(g.level, 'إزالة')}
              </select>
            </div>
          ))}
        </div>

        {addable.length > 0 && (
          <div className="mx-toolbar">
            <select aria-label="شخص" value={addWho} onChange={(e) => setAddWho(e.target.value)}>
              <option value="">اختر شخصاً…</option>
              {addable.map((p) => (
                <option key={p.email} value={p.email}>
                  {p.display_name} · {roles[p.role]?.name}
                </option>
              ))}
            </select>
            <button type="button" className="secondary" disabled={!addWho} onClick={() => void set('person', addWho, 'view').then(() => setAddWho(''))}>
              <Icon name="plus" />
              إضافة شخص
            </button>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table className="mx-matrix">
            <thead>
              <tr>
                <th>ما يستطيعه</th>
                <th>عرض فقط</th>
                <th>تحرير</th>
                <th>إنشاء</th>
                <th>إدارة</th>
              </tr>
            </thead>
            <tbody>
              {capabilityMatrix.map(([label, cells]) => (
                <tr key={label}>
                  <td>{label}</td>
                  {cells.map((v, i) => (
                    <td key={i} className={v ? 'y' : 'no'}>
                      {v ? <Icon name="check" /> : '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mx-note">
          <Icon name="shield" />
          <span>«لا وصول» يخفي المجلد وملفاته تماماً. كل تغيير هنا يُسجَّل في سجل النشاط بقيمته قبل التغيير وبعده.</span>
        </p>
        <ErrorLine text={error} />
        <div className="mx-row">
          <button className="primary" onClick={onClose}>
            تم
          </button>
        </div>
      </div>
    </Modal>
  );
}

function MoveTo({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const m = useMedia();
  const [error, setError] = useState('');
  const here = new Set(ids.map((i) => m.assets.find((a) => a.id === i)?.folder_id));
  return (
    <Modal title={`نقل ${ids.length} ${ids.length === 1 ? 'ملف' : 'ملفات'} إلى…`} onClose={onClose}>
      <div className="mx-form">
        <div className="mx-pick-list">
          {m.folders
            .filter((f) => !f.ghost)
            .map((f) => {
              const ok = m.canEdit(f.id) && !(here.size === 1 && here.has(f.id));
              return (
                <button
                  key={f.id}
                  disabled={!ok}
                  onClick={async () => {
                    const r = await m.moveAssets(ids, f.id);
                    if (!r.ok) return setError(r.error);
                    m.say(`نُقل إلى «${f.name}» في Google Drive`);
                    onClose();
                  }}
                >
                  <Icon name={f.restricted || f.locked ? 'lock' : 'folder'} />
                  <span style={{ flex: 1 }}>{f.name}</span>
                  <small>{m.lockedIn(f.id) ? 'مقفل' : ok ? levelLabels[LEVEL_NAMES[f.level]] : 'غير متاح'}</small>
                </button>
              );
            })}
        </div>
        <ErrorLine text={error} />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ tasks */
function Assign({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const m = useMedia();
  const first = m.assets.find((a) => a.id === ids[0]);
  const [who, setWho] = useState('');
  const [kind, setKind] = useState<TaskKind>('other');
  const [what, setWhat] = useState('');
  const [due, setDue] = useState(dtLocal(24));
  const [prio, setPrio] = useState<'normal' | 'urgent'>('normal');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const people = m.people.filter((p) => p.role !== 'admin');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    for (const id of ids) {
      const r = await m.assignTask({ assetId: id, what, kind, assignee: who, due, priority: prio, note });
      if (!r.ok) {
        setBusy(false);
        return setError(r.error);
      }
    }
    setBusy(false);
    m.say(`أُسندت المهمة إلى ${m.nameOf(who)} قبل ${due.replace('T', ' ')}`);
    onClose();
  };
  return (
    <Modal title={ids.length > 1 ? `إسناد مهمة إلى ${ids.length} ملفات` : 'إسناد مهمة'} onClose={onClose}>
      <form className="mx-form" onSubmit={submit}>
        <p className="mx-note">
          <Icon name="file" />
          <span>
            الأصل: <b>{first?.name}</b>
            {ids.length > 1 ? ' وغيره' : ''}. تظهر المهمة لدى المكلّف وفي صفحة الأصل وفي سجل النشاط.
          </span>
        </p>
        <div className="mx-two">
          <label>
            إلى من
            <select required value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">اختر…</option>
              {people.map((p) => (
                <option key={p.email} value={p.email}>
                  {p.display_name} · {roles[p.role]?.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            نوع المهمة
            <select value={kind} onChange={(e) => setKind(e.target.value as TaskKind)}>
              {Object.entries(taskKindLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          ماذا يُطلب
          <input required maxLength={140} value={what} onChange={(e) => setWhat(e.target.value)} placeholder="مثال: كتابة عنوان ووصف المنشور لـ Instagram" />
        </label>
        <div className="mx-two">
          <label>
            متى (الموعد النهائي)
            <input type="datetime-local" required value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
          <label>
            الأولوية
            <select value={prio} onChange={(e) => setPrio(e.target.value as 'normal' | 'urgent')}>
              <option value="normal">عادية</option>
              <option value="urgent">عاجلة</option>
            </select>
          </label>
        </div>
        <label>
          تفاصيل <small>اختياري</small>
          <textarea maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="النبرة، المرجع، ما يجب تجنبه…" />
        </label>
        <ErrorLine text={error} />
        <Actions onClose={onClose} label="إسناد المهمة" busy={busy} />
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ asset dialogs */
function platformState(name: string) {
  const acc = channelAccounts.find((a) => a.name === name);
  if (!acc) return { label: 'غير معروف', tone: 'warn' as const, expired: false };
  if (acc.status !== 'CONNECTED') return { label: 'يحتاج إعادة ربط', tone: 'danger' as const, expired: true };
  return { label: `التفويض حتى ${(acc.authorizedUntil ?? '').replace('T', ' ')}`, tone: 'success' as const, expired: false };
}

function AssetDialog({ dialog, onClose }: { dialog: Exclude<Dialog, { type: 'newfolder' | 'access' | 'move' | 'assign' }>; onClose: () => void }) {
  const m = useMedia();
  const asset = m.assets.find((a) => a.id === dialog.assetId);
  if (!asset) return null;
  const common = { asset, onClose };
  switch (dialog.type) {
    case 'copyreq':
      return <CopyRequest {...common} />;
    case 'writecopy':
      return <WriteCopy {...common} />;
    case 'schedule':
    case 'publish':
      return <Schedule {...common} publishNow={dialog.type === 'publish'} />;
    case 'changes':
    case 'reject':
      return <Review {...common} reject={dialog.type === 'reject'} />;
    case 'approve':
      return <Approve {...common} />;
    case 'newver':
      return <NewVersion {...common} />;
    case 'note':
      return <NoteDialog {...common} />;
    case 'link':
      return <ShareLink {...common} />;
  }
}

type AP = { asset: AssetRow; onClose: () => void };

function CopyRequest({ asset, onClose }: AP) {
  const m = useMedia();
  const writers = m.people.filter((p) => p.role === 'writer');
  const [who, setWho] = useState(writers[0]?.email ?? '');
  const [plats, setPlats] = useState<string[]>(asset.channels.length ? asset.channels : []);
  const [due, setDue] = useState(dtLocal(20));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await m.assignTask({
      assetId: asset.id,
      what: `كتابة عنوان ووصف «${asset.name}»${plats.length ? ` لـ ${plats.join('، ')}` : ''}`,
      kind: 'copy',
      assignee: who,
      due,
      priority: 'normal',
      note,
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    m.say(`أُرسل طلب العنوان والوصف إلى ${m.nameOf(who)}`);
    onClose();
  };
  return (
    <Modal title="طلب عنوان ووصف" onClose={onClose}>
      <form className="mx-form" onSubmit={submit}>
        <p className="mx-note">
          <Icon name="file" />
          <span>سيصل إلى الكاتب طلب بكتابة عنوان ووصف لـ «{asset.name}» لكل منصة تحددها.</span>
        </p>
        <label>
          الكاتب
          <select required value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">اختر…</option>
            {writers.map((p) => (
              <option key={p.email} value={p.email}>
                {p.display_name}
              </option>
            ))}
          </select>
        </label>
        <div>
          <b style={{ fontSize: 13 }}>المنصات</b>
          <div className="mx-toolbar">
            {platformSpecs.map((p) => (
              <label key={p.id} className="mx-sw">
                <input type="checkbox" checked={plats.includes(p.id)} onChange={(e) => setPlats(e.target.checked ? [...plats, p.id] : plats.filter((x) => x !== p.id))} />
                {p.name}
              </label>
            ))}
          </div>
        </div>
        <label>
          الموعد النهائي
          <input type="datetime-local" required value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        <label>
          توجيهات <small>اختياري</small>
          <textarea maxLength={400} value={note} onChange={(e) => setNote(e.target.value)} placeholder="النبرة، الكلمات المفتاحية، عدد الأحرف…" />
        </label>
        <ErrorLine text={error} />
        <Actions onClose={onClose} label="إرسال الطلب" busy={busy} />
      </form>
    </Modal>
  );
}

function PlatformFields({
  channels,
  checked,
  setChecked,
  copy,
  setCopy,
  withCopy,
}: {
  channels: Channel[];
  checked: Record<string, boolean>;
  setChecked: (v: Record<string, boolean>) => void;
  copy: Record<string, { t: string; d: string }>;
  setCopy: (v: Record<string, { t: string; d: string }>) => void;
  withCopy: boolean;
}) {
  return (
    <div className="mx-form">
      {channels.map((c) => {
        const st = platformState(c);
        const cp = copy[c] ?? { t: '', d: '' };
        return (
          <div key={c} className={`mx-plat ${st.expired ? 'off' : ''}`}>
            <div className="top">
              <label className="mx-sw">
                <input type="checkbox" disabled={st.expired} checked={!!checked[c] && !st.expired} onChange={(e) => setChecked({ ...checked, [c]: e.target.checked })} />
                <b>{c}</b>
              </label>
              <span className={`mx-chip ${st.tone}`}>{st.label}</span>
            </div>
            {withCopy && (
              <>
                <label>
                  <small>العنوان</small>
                  <input maxLength={100} value={cp.t} onChange={(e) => setCopy({ ...copy, [c]: { ...cp, t: e.target.value } })} placeholder="عنوان المنشور" />
                </label>
                <label>
                  <small>الوصف{c === 'X' ? ' (حتى 280 حرفاً)' : ''}</small>
                  <textarea maxLength={c === 'X' ? 280 : 2200} value={cp.d} onChange={(e) => setCopy({ ...copy, [c]: { ...cp, d: e.target.value } })} placeholder="نص المنشور" />
                </label>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

const CHANNELS = channelAccounts.map((a) => a.name as Channel);

function WriteCopy({ asset, onClose }: AP) {
  const m = useMedia();
  const [copy, setCopy] = useState(asset.copy ?? {});
  const [checked, setChecked] = useState<Record<string, boolean>>(Object.fromEntries(asset.channels.map((c) => [c, true])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const shown = asset.channels.length ? (asset.channels as Channel[]) : CHANNELS;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const clean = Object.fromEntries(Object.entries(copy).filter(([, v]) => v.t.trim() || v.d.trim()));
    const r = await m.patchAsset(asset.id, { copy: clean });
    if (r.ok) {
      for (const t of m.tasks.filter((x) => x.asset_id === asset.id && x.kind === 'copy' && x.assignee === m.email && x.status === 'open')) {
        await m.completeTask(t.id);
      }
    }
    setBusy(false);
    if (!r.ok) return setError(r.error);
    m.say('حُفظ العنوان والوصف، وأُنجزت مهمتك إن وُجدت');
    onClose();
  };
  return (
    <Modal title="العنوان والوصف" onClose={onClose}>
      <form className="mx-form" onSubmit={submit}>
        <p className="mx-note">
          <Icon name="file" />
          <span>اكتب النص لكل منصة. يُحفظ مع الأصل ويراه مسؤول النشر عند الجدولة.</span>
        </p>
        <PlatformFields channels={shown} checked={checked} setChecked={setChecked} copy={copy} setCopy={setCopy} withCopy />
        <ErrorLine text={error} />
        <Actions onClose={onClose} label="حفظ النص" busy={busy} />
      </form>
    </Modal>
  );
}

function Schedule({ asset, onClose, publishNow }: AP & { publishNow: boolean }) {
  const m = useMedia();
  const [when, setWhen] = useState(asset.schedule?.at?.replace(' ', 'T') ?? dtLocal(72).slice(0, 11) + '18:00');
  const initial = asset.schedule?.platforms ?? asset.channels;
  const [checked, setChecked] = useState<Record<string, boolean>>(Object.fromEntries(CHANNELS.map((c) => [c, initial.includes(c) || (!initial.length && c !== 'LinkedIn')])));
  const [copy, setCopy] = useState(asset.copy ?? {});
  const [askCopy, setAskCopy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selected = CHANNELS.filter((c) => checked[c] && !platformState(c).expired);
  const risks = useMemo(() => channelRisks(selected, when), [selected, when]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected.length) return setError('اختر منصة واحدة على الأقل.');
    setBusy(true);
    const clean = Object.fromEntries(Object.entries(copy).filter(([, v]) => v.t.trim() || v.d.trim()));
    if (askCopy) {
      const writer = m.people.find((p) => p.role === 'writer');
      if (writer)
        await m.assignTask({
          assetId: asset.id,
          what: `كتابة عنوان ووصف «${asset.name}» لـ ${selected.join('، ')}`,
          kind: 'copy',
          assignee: writer.email,
          due: dtLocal(20),
          priority: 'normal',
          note: 'مطلوب قبل موعد النشر.',
        });
    }
    let r;
    if (publishNow) {
      const bad = selected.filter((c) => platformState(c).expired);
      r = await m.patchAsset(asset.id, { copy: clean, stage: bad.length ? 'partial' : 'published' });
      if (r.ok) m.say(`نُشر على ${selected.join(' و')} (محاكاة، لم يُرسل شيء إلى المنصات)`);
    } else {
      r = await m.patchAsset(asset.id, {
        copy: clean,
        schedule: { at: when.replace('T', ' '), platforms: selected, by: m.email },
        ...(asset.stage === 'ready' ? { stage: 'scheduled' } : {}),
      });
      if (r.ok) m.say(`جُدول النشر يوم ${when.replace('T', ' ')} على ${selected.join(' و')}`);
    }
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onClose();
  };
  return (
    <Modal title={publishNow ? 'نشر الآن' : 'جدولة النشر'} onClose={onClose}>
      <form className="mx-form" onSubmit={submit}>
        <p className="mx-note">
          <Icon name="shield" />
          <span>
            الإصدار الذي يُنشر هو <b>v{asset.approved_version}</b> المعتمد، لا غيره. النشر محاكاة: لا يُرسل شيء إلى المنصات في هذا النموذج.
          </span>
        </p>
        {!publishNow && (
          <label>
            التاريخ والوقت (بتوقيت الرياض)
            <input type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} />
          </label>
        )}
        <PlatformFields channels={CHANNELS} checked={checked} setChecked={setChecked} copy={copy} setCopy={setCopy} withCopy />
        {risks.map((rk) => (
          <p key={rk.channel} className="mx-note warn">
            <Icon name="alert" />
            <span>{riskText(rk)}</span>
          </p>
        ))}
        <label className="mx-sw">
          <input type="checkbox" checked={askCopy} onChange={(e) => setAskCopy(e.target.checked)} />
          اطلب من الكاتب كتابة العنوان والوصف بدلاً مني (مهمة)
        </label>
        <ErrorLine text={error} />
        <Actions onClose={onClose} label={publishNow ? 'نشر الآن' : 'تأكيد الجدولة'} busy={busy} />
      </form>
    </Modal>
  );
}

function Review({ asset, onClose, reject }: AP & { reject: boolean }) {
  const m = useMedia();
  const [text, setText] = useState('');
  const [tc, setTc] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (tc && timecodeSeconds(tc) === null) return setError('اكتب الوقت بصيغة دقيقة:ثانية، مثل 01:30.');
    setBusy(true);
    const stage = await m.patchAsset(asset.id, { stage: reject ? 'rejected' : 'changes' });
    if (stage.ok) await m.addNote(asset.id, text.trim(), tc);
    setBusy(false);
    if (!stage.ok) return setError(stage.error);
    m.say(reject ? 'رُفض الأصل وأُبلغ المنشئ' : 'أُعيد إلى المنشئ مع ملاحظتك');
    onClose();
  };
  return (
    <Modal title={reject ? 'رفض الأصل' : 'طلب تعديل'} onClose={onClose}>
      <form className="mx-form" onSubmit={submit}>
        <label>
          السبب والملاحظة
          <textarea autoFocus required maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder={reject ? 'سبب الرفض' : 'ما الذي يجب تعديله؟'} />
        </label>
        {!reject && asset.kind === 'video' && (
          <label>
            عند الوقت <small>اختياري، بصيغة دقيقة:ثانية</small>
            <input className="ltr" style={{ maxWidth: 140 }} value={tc} onChange={(e) => setTc(e.target.value)} placeholder="00:32" />
          </label>
        )}
        <ErrorLine text={error} />
        <Actions onClose={onClose} label={reject ? 'تأكيد الرفض' : 'إرسال الطلب'} busy={busy} />
      </form>
    </Modal>
  );
}

function Approve({ asset, onClose }: AP) {
  const m = useMedia();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal title={`اعتماد الإصدار v${asset.current_version}`} onClose={onClose}>
      <div className="mx-form">
        <p>
          سيُعتمد <b>{asset.name}</b> بإصداره <b>v{asset.current_version}</b> فقط.
        </p>
        <ul style={{ margin: 0, paddingInlineStart: 18, lineHeight: 2 }}>
          <li>يُقفل الإصدار: لا يُغيَّر اسمه ولا يُحذف.</li>
          <li>أي تعديل لاحق يكون بإصدار جديد يحتاج اعتماداً جديداً.</li>
          <li>يصبح الأصل «جاهز للنشر» ويظهر لمسؤول النشر.</li>
        </ul>
        <ErrorLine text={error} />
        <div className="mx-row">
          <button className="secondary" onClick={onClose}>
            إلغاء
          </button>
          <button
            className="primary"
            disabled={busy}
            data-hold={HOLD.approveLock}
            onClick={async () => {
              setBusy(true);
              const r = await m.patchAsset(asset.id, { stage: 'ready' });
              setBusy(false);
              if (!r.ok) return setError(r.error);
              m.say(`اعتُمد v${asset.current_version} وصار مقفلاً. يظهر الآن لمسؤول النشر.`);
              onClose();
            }}
          >
            <Icon name="check" />
            اعتماد وقفل
          </button>
        </div>
      </div>
    </Modal>
  );
}

function NewVersion({ asset, onClose }: AP) {
  const m = useMedia();
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = asset.approved_version !== null && ['ready', 'scheduled', 'published'].includes(asset.stage);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    const r = await m.uploadVersion(asset.id, file, note);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    m.say(`أُضيف الإصدار v${asset.current_version + 1}${asset.approved_version ? ` والمعتمد v${asset.approved_version} كما هو` : ''}`);
    onClose();
  };
  return (
    <Modal title="رفع إصدار جديد" onClose={onClose}>
      <form className="mx-form" onSubmit={submit}>
        <p className="mx-note">
          <Icon name="history" />
          <span>
            سيصبح الإصدار <b>v{asset.current_version + 1}</b> الحالي.
            {locked ? ` الإصدار المعتمد v${asset.approved_version} يبقى كما هو، ويعود الأصل إلى «قيد المراجعة» للاعتماد من جديد.` : ''}
          </span>
        </p>
        <label>
          ملف الإصدار
          <input type="file" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <label>
          ما الذي تغيّر؟
          <input required maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثال: ضبط الألوان بعد ملاحظة ريم" />
        </label>
        <ErrorLine text={error} />
        <Actions onClose={onClose} label="رفع الإصدار" busy={busy} />
      </form>
    </Modal>
  );
}

function NoteDialog({ asset, onClose }: AP) {
  const m = useMedia();
  const [text, setText] = useState('');
  const [tc, setTc] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (tc && timecodeSeconds(tc) === null) return setError('اكتب الوقت بصيغة دقيقة:ثانية، مثل 01:30.');
    setBusy(true);
    const r = await m.addNote(asset.id, text.trim(), tc);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    m.say('أُضيفت الملاحظة');
    onClose();
  };
  return (
    <Modal title="إضافة ملاحظة" onClose={onClose}>
      <form className="mx-form" onSubmit={submit}>
        <label>
          الملاحظة
          <textarea autoFocus required maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        {(asset.kind === 'video' || asset.kind === 'audio') && (
          <label>
            عند الوقت <small>اختياري</small>
            <input className="ltr" style={{ maxWidth: 140 }} value={tc} onChange={(e) => setTc(e.target.value)} placeholder="00:32" />
          </label>
        )}
        <ErrorLine text={error} />
        <Actions onClose={onClose} label="إضافة" busy={busy} />
      </form>
    </Modal>
  );
}

type LinkRow = { token: string; expires_at: string; revoked: boolean; created_by: string };

function ShareLink({ asset, onClose }: AP) {
  const m = useMedia();
  const [hours, setHours] = useState(168);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fresh, setFresh] = useState('');
  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  const refresh = async () => {
    const { data } = await supabase()
      .from('media_share_links')
      .select('token, expires_at, revoked, created_by')
      .eq('asset_id', asset.id)
      .order('created_at', { ascending: false });
    setLinks((data as LinkRow[]) ?? []);
  };
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.id]);

  const create = async () => {
    setBusy(true);
    const { data, error: err } = await supabase().rpc('media_share_create', { p_asset: asset.id, p_hours: hours });
    setBusy(false);
    if (err) return setError('إنشاء الرابط لمدير الاتصال ومساعده ومسؤول النشر.');
    setError('');
    setFresh(`${origin}/r/${data as string}`);
    await refresh();
    await m.reload();
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      m.say('نُسخ الرابط');
    } catch {
      m.say('انسخ الرابط يدوياً من الحقل.');
    }
  };
  return (
    <Modal title="رابط مراجعة" onClose={onClose}>
      <div className="mx-form">
        <p>
          رابط لمن لا يملك حساباً يعرض «{asset.name}» للمراجعة فقط. من يملك الرابط يرى هذا الملف دون غيره حتى انتهاء المدة أو إلغائه.
        </p>
        <div className="mx-toolbar">
          <select aria-label="المدة" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            <option value={24}>ينتهي بعد 24 ساعة</option>
            <option value={168}>ينتهي بعد 7 أيام</option>
            <option value={720}>ينتهي بعد 30 يوماً</option>
          </select>
          <button className="primary" disabled={busy} onClick={() => void create()}>
            <Icon name="link" />
            إنشاء رابط جديد
          </button>
        </div>
        {fresh && (
          <label>
            الرابط الجديد
            <span className="mx-toolbar">
              <input readOnly dir="ltr" value={fresh} style={{ flex: 1 }} onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="secondary" onClick={() => void copy(fresh)}>
                نسخ
              </button>
            </span>
          </label>
        )}
        <ErrorLine text={error} />
        {links.length > 0 && (
          <div className="mx-acl">
            {links.map((l) => {
              const expired = new Date(l.expires_at) < new Date();
              return (
                <div className="r" key={l.token}>
                  <span>
                    <Ts>…{l.token.slice(-8)}</Ts>
                    <small>
                      {m.nameOf(l.created_by)} · ينتهي <Ts>{l.expires_at.slice(0, 16).replace('T', ' ')}</Ts>
                      {l.revoked ? ' · مُلغى' : expired ? ' · منتهٍ' : ''}
                    </small>
                  </span>
                  <button
                    className="secondary"
                    disabled={l.revoked || expired}
                    onClick={async () => {
                      await supabase().from('media_share_links').update({ revoked: true }).eq('token', l.token);
                      await refresh();
                    }}
                  >
                    إلغاء الرابط
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <p className="mx-note">
          <Icon name="shield" />
          <span>يُسجَّل إنشاء الرابط في سجل النشاط. الرابط يعرض الإصدار الحالي، ولا يفتح أي مجلد أو ملف آخر.</span>
        </p>
        <div className="mx-row">
          <button className="primary" onClick={onClose}>
            تم
          </button>
        </div>
      </div>
    </Modal>
  );
}

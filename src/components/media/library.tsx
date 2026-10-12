'use client';
// مكتبة الوسائط: folders, pipeline stages and assets. Views: grid, list, stage board.
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { stageLabels, pipeline, stagePosition, formatBytes, canCreateAt, type Stage, LEVELS, levelLabels, LEVEL_NAMES } from '@/lib/media/rules';
import { HOLD } from '@/lib/kit/hold-reasons';
import { Title } from '../ui';
import { useDriveStatus } from '../drive-files';
import { MediaDialogs, type Dialog } from './dialogs';
import { useAssetActions } from './actions';
import { Icon, KIND_AR, PipeDots, StageChip, Thumb } from './parts';
import { useMedia, type AssetRow, type FolderRow } from './provider';

// The page remembers where you were when you open an asset and come back.
const memory = { folder: 'all', view: 'grid' as 'grid' | 'list' | 'board' };

const TYPES: [string, string][] = [
  ['all', 'كل الأنواع'],
  ['image', 'صور'],
  ['video', 'فيديو'],
  ['document', 'مستندات'],
  ['audio', 'صوت'],
];

export function MediaLibrary() {
  const m = useMedia();
  const router = useRouter();
  const drive = useDriveStatus();
  const { actionsFor, run } = useAssetActions();

  const [folder, setFolderState] = useState(memory.folder);
  const [view, setViewState] = useState(memory.view);
  const [type, setType] = useState('all');
  const [stage, setStage] = useState<'all' | Stage>('all');
  const [att, setAtt] = useState<'' | 'review' | 'ready' | 'changes' | 'mine'>('');
  const [sort, setSort] = useState<'new' | 'name' | 'size'>('new');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState<{ type: 'asset' | 'folder'; id: string } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const dragIds = useRef<string[] | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const setFolder = (id: string) => {
    memory.folder = id;
    setFolderState(id);
    setSelected([]);
  };
  const setView = (v: 'grid' | 'list' | 'board') => {
    memory.view = v;
    setViewState(v);
  };

  // A folder the person can no longer see falls back to the whole library.
  useEffect(() => {
    if (m.status === 'ready' && folder !== 'all' && !m.folderOf(folder)) setFolder('all');
  }, [m.status, m.folders]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [menu]);

  const open = useMemo(() => m.folders.filter((f) => !f.ghost), [m.folders]);
  const openIds = useMemo(() => new Set(open.map((f) => f.id)), [open]);
  const kids = (pid: string | null) => m.folders.filter((f) => f.parent_id === pid);
  const subtree = (id: string): string[] => [id, ...kids(id).flatMap((k) => subtree(k.id))];
  const countIn = (id: string) => m.assets.filter((a) => subtree(id).includes(a.folder_id) && openIds.has(a.folder_id)).length;

  const inScope = m.assets.filter((a) => (folder === 'all' ? openIds.has(a.folder_id) : a.folder_id === folder));
  const myOpenTaskAssets = new Set(m.tasks.filter((t) => t.assignee === m.email && t.status === 'open').map((t) => t.asset_id));
  const files = inScope
    .filter((a) => (type === 'all' ? true : a.kind === type))
    .filter((a) => (stage === 'all' ? true : a.stage === stage))
    .filter((a) => {
      if (att === 'review') return a.stage === 'review';
      if (att === 'ready') return a.stage === 'ready' || a.stage === 'scheduled';
      if (att === 'changes') return a.stage === 'changes';
      if (att === 'mine') return myOpenTaskAssets.has(a.id);
      return true;
    })
    .filter((a) => (q ? `${a.name} ${a.tags.join(' ')} ${a.work_ref ?? ''}`.includes(q) : true))
    .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name, 'ar') : sort === 'size' ? b.size_bytes - a.size_bytes : 0));

  const cur = folder === 'all' ? null : m.folderOf(folder);
  const curId = cur?.id ?? null;
  const level = cur ? cur.level : LEVELS.manage;
  const locked = cur ? Boolean(cur.locked_by) : false;
  const lockSource = cur?.locked_by ? m.folderOf(cur.locked_by) : null;
  const uploadTarget = curId ?? open.find((f) => m.canCreate(f.id))?.id ?? null;
  const canUp = Boolean(uploadTarget && m.canCreate(uploadTarget));
  const chain: FolderRow[] = [];
  for (let c = cur; c; c = m.folderOf(c.parent_id)) chain.unshift(c);
  const sub = folder === 'all' ? open.filter((f) => !(f.parent_id && openIds.has(f.parent_id))) : kids(folder).filter((f) => !f.ghost);

  // attention counters for the current person
  const att_items: { key: 'review' | 'ready' | 'changes' | 'mine' | 'tasks'; n: number; label: string }[] = [];
  const myTasks = m.tasks.filter((t) => t.assignee === m.email && t.status === 'open').length;
  if (myTasks) att_items.push({ key: 'tasks', n: myTasks, label: 'مهام عليك' });
  const reviewN = m.assets.filter((a) => a.stage === 'review').length;
  if (reviewN && ['admin', 'director', 'assistant'].includes(m.role)) att_items.push({ key: 'review', n: reviewN, label: 'بانتظار مراجعتك' });
  const readyN = m.assets.filter((a) => a.stage === 'ready').length;
  if (readyN && ['admin', 'publisher'].includes(m.role)) att_items.push({ key: 'ready', n: readyN, label: 'جاهزة للنشر' });
  const changesN = m.assets.filter((a) => a.stage === 'changes' && (a.uploaded_by === m.email || m.isAdmin)).length;
  if (changesN) att_items.push({ key: 'changes', n: changesN, label: 'تحتاج تعديلاً منك' });

  const totalBytes = m.assets.reduce((n, a) => n + a.size_bytes, 0);
  const GB15 = 15 * 1024 ** 3;
  const pct = Math.max(1, Math.round((totalBytes / GB15) * 100));
  const circ = 2 * Math.PI * 21;

  const stageCounts = (s: string) => inScope.filter((a) => a.stage === s).length;
  const typeCount = (t: string) => (t === 'all' ? inScope.length : inScope.filter((a) => a.kind === t).length);

  /* --- actions --- */
  const startUpload = async (list: File[]) => {
    if (!uploadTarget || !canUp) return m.say('الرفع يحتاج صلاحية «إنشاء» في مجلد غير مقفل.');
    await m.upload(list, uploadTarget);
  };
  const commitRename = async (value: string) => {
    const r = renaming;
    setRenaming(null);
    if (!r || !value.trim()) return;
    const res = r.type === 'asset' ? await m.renameAsset(r.id, value) : await m.renameFolder(r.id, value);
    m.say(res.ok ? 'تغيّر الاسم في المركز وفي Google Drive معاً' : res.error);
  };
  const startRename = (type: 'asset' | 'folder', id: string) => {
    if (type === 'asset') {
      const a = m.assets.find((x) => x.id === id);
      if (!a) return;
      if (a.approved_version !== null && ['ready', 'scheduled', 'published'].includes(a.stage)) return m.say('الإصدار المعتمد مقفل: لا يُغيَّر اسمه.');
      if (!m.canEdit(a.folder_id)) return m.say('صلاحيتك في هذا المجلد لا تتيح التعديل.');
    } else if (!m.canEdit(id)) return m.say('صلاحيتك في هذا المجلد لا تتيح التعديل.');
    setRenaming({ type, id });
  };
  const trash = async (ids: string[]) => {
    let n = 0;
    let last = '';
    for (const id of ids) {
      const r = await m.trashAsset(id);
      if (r.ok) n += 1;
      else last = r.error;
    }
    setSelected([]);
    m.say(n ? `نُقل ${n} إلى سلة Google Drive (30 يوماً)` : last);
  };
  const dropOnFolder = async (e: DragEvent, id: string) => {
    e.preventDefault();
    setOver(null);
    const os = Array.from(e.dataTransfer.files ?? []);
    if (os.length) return void (m.canCreate(id) ? m.upload(os, id) : m.say('الرفع يحتاج صلاحية «إنشاء» في هذا المجلد.'));
    const ids = dragIds.current;
    dragIds.current = null;
    if (!ids?.length) return;
    const r = await m.moveAssets(ids, id);
    m.say(r.ok ? `نُقل إلى «${m.folderOf(id)?.name}» في Google Drive` : r.error);
    setSelected([]);
  };
  const dropOnStage = async (e: DragEvent, s: Stage) => {
    e.preventDefault();
    setOver(null);
    const ids = dragIds.current ?? [];
    dragIds.current = null;
    for (const id of ids) {
      const a = m.assets.find((x) => x.id === id);
      if (!a || a.stage === s) continue;
      if (s === 'scheduled' || s === 'published') {
        m.say('الجدولة والنشر لمسؤول النشر، من الإجراءات السريعة داخل صفحة الأصل.');
        continue;
      }
      const r = await m.patchAsset(id, { stage: s });
      m.say(r.ok ? `انتقل إلى «${stageLabels[s]}»` : r.error);
    }
  };
  const dragProps = (a: AssetRow) => ({
    draggable: m.canEdit(a.folder_id),
    onDragStart: (e: DragEvent) => {
      dragIds.current = selected.includes(a.id) ? selected : [a.id];
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', a.id);
    },
    onDragEnd: () => {
      dragIds.current = null;
      setOver(null);
    },
  });
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const dropHandlers = (key: string, onDrop: (e: DragEvent) => void) => ({
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      setOver(key);
    },
    onDragLeave: () => setOver((o) => (o === key ? null : o)),
    onDrop,
  });

  /* --- pieces --- */
  const nameCell = (a: AssetRow) =>
    renaming?.type === 'asset' && renaming.id === a.id ? (
      <input
        className="rename"
        autoFocus
        defaultValue={a.name}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => void commitRename(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setRenaming(null);
        }}
      />
    ) : (
      <div className="mx-fname" title={a.name} onDoubleClick={() => startRename('asset', a.id)}>
        {a.name}
      </div>
    );

  const card = (a: AssetRow, compact = false) => {
    const mine = m.tasks.filter((t) => t.asset_id === a.id && t.assignee === m.email && t.status === 'open').length;
    const lockedAsset = a.approved_version !== null && ['ready', 'scheduled', 'published'].includes(a.stage);
    const sel = selected.includes(a.id);
    return (
      <article key={a.id} className={`mx-card ${sel ? 'sel' : ''}`} {...dragProps(a)}>
        <button className="mx-thumb" onClick={() => router.push(`/media/${a.id}`)} aria-label={`فتح صفحة ${a.name}`}>
          <Thumb asset={a} />
          <span className="badge">
            <StageChip stage={a.stage} />
          </span>
          {a.duration && <span className="dur">{a.duration}</span>}
          <span className="ver">
            {lockedAsset && <Icon name="lock" />}v{a.current_version}
          </span>
        </button>
        <button className="mx-pick" role="checkbox" aria-checked={sel} aria-label="تحديد" onClick={() => toggle(a.id)}>
          {sel && <Icon name="check" />}
        </button>
        {mine > 0 && (
          <span className="mx-flag">
            <Icon name="tasks" />
            {mine} مهمة لك
          </span>
        )}
        <div className="mx-quick">
          <button
            aria-label="إجراءات سريعة"
            title="إجراءات سريعة"
            onClick={(e) => {
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              setMenu({ id: a.id, x: Math.min(r.left, window.innerWidth - 270), y: Math.min(r.bottom + 4, window.innerHeight - 340) });
            }}
          >
            <Icon name="more" />
          </button>
          <button aria-label="إعادة تسمية" title={lockedAsset ? 'مقفل' : 'إعادة تسمية'} disabled={!m.canEdit(a.folder_id) || lockedAsset} onClick={() => startRename('asset', a.id)}>
            <Icon name="pencil" />
          </button>
          <button aria-label="نقل" title="نقل" disabled={!m.canEdit(a.folder_id) || lockedAsset} onClick={() => setDialog({ type: 'move', ids: [a.id] })}>
            <Icon name="move" />
          </button>
        </div>
        <div className="mx-fmeta">
          {nameCell(a)}
          <PipeDots stage={a.stage} />
          {!compact && (
            <div className="mx-tags">
              {a.tags.slice(0, 3).map((t) => (
                <span key={t} className="mx-tag mini">
                  {t}
                </span>
              ))}
            </div>
          )}
          <div className="mx-fsub">
            <span>
              {KIND_AR[a.kind]} · {formatBytes(a.size_bytes)}
            </span>
            <span>{m.nameOf(a.uploaded_by)}</span>
          </div>
        </div>
      </article>
    );
  };

  const treeRow = (f: FolderRow) => {
    const children = kids(f.id);
    const editing = renaming?.type === 'folder' && renaming.id === f.id;
    return (
      <Fragment key={f.id}>
        <button
          className={`mx-trow ${folder === f.id ? 'on' : ''} ${f.ghost ? 'ghost' : ''} ${over === `f:${f.id}` ? 'drop' : ''}`}
          disabled={f.ghost}
          title={f.ghost ? 'لا تملك وصولاً إلى هذا المجلد' : undefined}
          onClick={() => setFolder(f.id)}
          onDoubleClick={() => !f.ghost && startRename('folder', f.id)}
          {...(f.ghost ? {} : dropHandlers(`f:${f.id}`, (e) => void dropOnFolder(e, f.id)))}
        >
          <Icon name={f.restricted || f.locked ? 'lock' : 'folder'} className={f.restricted || f.locked ? 'lk' : ''} />
          {editing ? (
            <input
              className="rename"
              autoFocus
              defaultValue={f.name}
              onClick={(e) => e.stopPropagation()}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={(e) => void commitRename(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') setRenaming(null);
              }}
            />
          ) : (
            <span className="nm">{f.name}</span>
          )}
          {f.ghost ? (
            <Icon name="lock" className="lk" />
          ) : (
            <>
              {!m.isAdmin && <span className="lvl">{levelLabels[LEVEL_NAMES[f.level]]}</span>}
              <span className="ct">{countIn(f.id)}</span>
            </>
          )}
        </button>
        {children.length > 0 && (
          <div className="mx-kids">
            {children.map((c) => treeRow(c))}
          </div>
        )}
      </Fragment>
    );
  };

  if (m.status === 'loading') return <p role="status">جارٍ تحميل المكتبة…</p>;
  if (m.status === 'error')
    return (
      <p className="warning" role="alert">
        تعذّر تحميل المكتبة. أعد تحميل الصفحة.
      </p>
    );

  const driveText =
    drive.state === 'connected'
      ? `متصل${drive.account ? ` · ${drive.account}` : ''}`
      : drive.state === 'loading'
        ? 'جارٍ التحقق…'
        : drive.state === 'needs-connection'
          ? 'لم يُربط حساب Google بعد'
          : drive.state === 'not-configured'
            ? 'لم يُضبط Google Drive بعد'
            : 'تعذّر الاتصال بـ Google Drive';

  return (
    <div className="mx" dir="rtl">
      <Title title="مكتبة" accent="الوسائط" sub="أصول الحملات ومجلداتها ومراحلها، مرتبطة بالعمل والمراجعة والنشر.">
        <div className="mx-actions">
        <div className="mx-drive">
          <span className="mx-ring" aria-hidden="true">
            <svg viewBox="0 0 52 52">
              <circle className="t" cx="26" cy="26" r="21" />
              <circle className="p" cx="26" cy="26" r="21" strokeDasharray={circ.toFixed(1)} strokeDashoffset={(circ * (1 - pct / 100)).toFixed(1)} />
            </svg>
            <b>{pct}%</b>
          </span>
          <span>
            <b className="t">
              Google Drive · {formatBytes(totalBytes)} من 15 GB
            </b>
            <small>{driveText}</small>
          </span>
          {drive.canConnect && drive.state !== 'connected' && drive.state !== 'loading' && (
            <a className="button primary" href="/api/drive/connect">
              ربط
            </a>
          )}
        </div>
        <button onClick={() => setDialog({ type: 'newfolder', parentId: curId })} disabled={!canCreateAt(level, locked) && folder !== 'all'}>
          <Icon name="folder" />
          مجلد جديد
        </button>
        <button className="primary" onClick={() => input.current?.click()} disabled={!canUp || drive.state !== 'connected'} title={drive.state !== 'connected' ? 'Google Drive غير متصل' : ''}>
          <Icon name="upload" />
          رفع ملفات
        </button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          aria-label="اختيار ملفات للرفع"
          onChange={(e) => {
            const list = Array.from(e.target.files ?? []);
            e.target.value = '';
            if (list.length) void startUpload(list);
          }}
        />
        </div>
      </Title>

      <div className="mx-attn">
        <span className="lbl">يحتاج انتباهك</span>
        {att_items.length ? (
          att_items.map((x) => (
            <button
              key={x.key}
              onClick={() => {
                if (x.key === 'tasks') router.push('/tasks');
                else {
                  setAtt(att === x.key ? '' : x.key);
                  setStage('all');
                  setType('all');
                  setFolder('all');
                }
              }}
            >
              <b>{x.n}</b>
              {x.label}
            </button>
          ))
        ) : (
          <span className="mx-chip plain">لا شيء يحتاج انتباهك الآن</span>
        )}
        {att && (
          <button onClick={() => setAtt('')}>
            <Icon name="x" />
            إلغاء التصفية
          </button>
        )}
      </div>

      <div className="mx-body">
        <aside className="mx-tree" aria-label="المجلدات">
          <h3>
            <span>المجلدات</span>
          </h3>
          <button className={`mx-trow ${folder === 'all' ? 'on' : ''}`} onClick={() => setFolder('all')}>
            <Icon name="grid" />
            <span className="nm">كل الملفات</span>
            <span className="ct">{m.assets.filter((a) => openIds.has(a.folder_id)).length}</span>
          </button>
          {kids(null).map((f) => treeRow(f))}
          <div className="mx-legend">انقر مرتين على اسم مجلد لإعادة تسميته. اسحب بطاقة إلى مجلد لنقلها.</div>
        </aside>

        <div className="mx-content">
          <div className="mx-crumbs">
            <div className="mx-crumb">
              <button onClick={() => setFolder('all')}>المكتبة</button>
              {chain.map((c, i) => (
                <span key={c.id} style={{ display: 'contents' }}>
                  <span aria-hidden="true">‹</span>
                  {i === chain.length - 1 ? (
                    <span className="cur">{c.name}</span>
                  ) : c.ghost ? (
                    <span>{c.name}</span>
                  ) : (
                    <button onClick={() => setFolder(c.id)}>{c.name}</button>
                  )}
                </span>
              ))}
            </div>
            {cur && (
              <div className="mx-who">
                <span className="mx-chip plain">صلاحيتك: {levelLabels[LEVEL_NAMES[level]]}</span>
                <button disabled={level < LEVELS.manage} title={level < LEVELS.manage ? 'الإدارة لمن يملك صلاحية «إدارة»' : ''} onClick={() => setDialog({ type: 'access', folderId: cur.id })}>
                  <Icon name="shield" />
                  الوصول والقفل
                </button>
              </div>
            )}
          </div>

          {locked && (
            <div className="mx-lockbar">
              <Icon name="lock" />
              <span>
                <b>مجلد مقفل:</b> {lockSource?.lock_reason || 'للقراءة فقط'}
                {lockSource && lockSource.id !== curId ? ` (من «${lockSource.name}»)` : ''}. لا رفع ولا تعديل ولا نقل لغير المديرين.
              </span>
              {lockSource && level >= LEVELS.manage && <button onClick={() => setDialog({ type: 'access', folderId: lockSource.id })}>فتح القفل</button>}
            </div>
          )}

          <div
            className={`mx-drop ${over === 'dz' ? 'over' : ''}`}
            {...dropHandlers('dz', (e) => {
              e.preventDefault();
              setOver(null);
              const os = Array.from(e.dataTransfer.files ?? []);
              if (os.length) void startUpload(os);
            })}
          >
            <span className="ic">
              <Icon name="upload" />
            </span>
            <span>
              <b>{canUp ? 'اسحب الملفات هنا للرفع إلى Google Drive' : 'الرفع غير متاح في هذا المجلد'}</b>
              <small>
                {canUp
                  ? `إلى «${m.folderOf(uploadTarget)?.name ?? ''}» · صور وفيديو وصوت ومستندات حتى 5 غيغابايت`
                  : 'يحتاج صلاحية «إنشاء» وألا يكون المجلد مقفلاً.'}
              </small>
            </span>
          </div>

          {sub.length > 0 && (
            <div className="mx-folders">
              {sub.map((f) => (
                <button
                  key={f.id}
                  className={`mx-fold ${f.restricted ? 'restricted' : ''} ${f.locked_by ? 'locked' : ''} ${over === `c:${f.id}` ? 'drop' : ''}`}
                  onClick={() => setFolder(f.id)}
                  {...dropHandlers(`c:${f.id}`, (e) => void dropOnFolder(e, f.id))}
                >
                  <span className="fi">
                    <Icon name={f.restricted || f.locked_by ? 'lock' : 'folder'} />
                  </span>
                  <span className="ft">
                    <b>{f.name}</b>
                    <small>
                      {countIn(f.id)} ملف · {f.locked_by ? 'مقفل' : f.restricted ? 'مقيّد' : 'يرث الوصول'}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="mx-toolbar">
            <label className="mx-field">
              <Icon name="search" />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم أو الوسم أو رقم العمل…" aria-label="بحث" />
            </label>
            <select className="sel" value={sort} onChange={(e) => setSort(e.target.value as 'new' | 'name' | 'size')} aria-label="الترتيب">
              <option value="new">الأحدث</option>
              <option value="name">الاسم</option>
              <option value="size">الحجم</option>
            </select>
            <div className="mx-seg" role="group" aria-label="العرض">
              {(['grid', 'list', 'board'] as const).map((v) => (
                <button key={v} aria-pressed={view === v} aria-label={v === 'grid' ? 'شبكة' : v === 'list' ? 'قائمة' : 'لوحة المراحل'} onClick={() => setView(v)}>
                  <Icon name={v === 'grid' ? 'grid' : v === 'list' ? 'list' : 'board'} />
                </button>
              ))}
            </div>
          </div>

          <div className="mx-types" role="group" aria-label="المرحلة والنوع">
            <button aria-pressed={stage === 'all'} onClick={() => setStage('all')}>
              كل المراحل<span className="n">{inScope.length}</span>
            </button>
            {[...pipeline, 'changes' as Stage].map((s) => (
              <button key={s} aria-pressed={stage === s} onClick={() => setStage(s)}>
                {stageLabels[s]}
                <span className="n">{stageCounts(s)}</span>
              </button>
            ))}
            <span className="sep" />
            {TYPES.map(([id, label]) => (
              <button key={id} aria-pressed={type === id} onClick={() => setType(id)}>
                {label}
                <span className="n">{typeCount(id)}</span>
              </button>
            ))}
          </div>

          {!files.length ? (
            <div className="mx-empty">
              <span className="ei">
                <Icon name="cloud" />
              </span>
              <b>{q || type !== 'all' || stage !== 'all' || att ? 'لا توجد ملفات مطابقة' : 'هذا المجلد فارغ'}</b>
              <span>{canUp ? 'اسحب الملفات إلى هنا أو اضغط «رفع ملفات».' : 'صلاحيتك في هذا المجلد لا تتيح الرفع.'}</span>
            </div>
          ) : view === 'list' ? (
            <div className="mx-table">
              <div className="mx-tr th">
                <span />
                <span>الاسم</span>
                <span>المرحلة</span>
                <span>المجلد</span>
                <span>الوسوم</span>
                <span>الحجم</span>
                <span>المنشئ</span>
                <span />
              </div>
              {files.map((a) => (
                <div className="mx-tr" key={a.id} {...dragProps(a)}>
                  <button className="mini" onClick={() => router.push(`/media/${a.id}`)} aria-label={`فتح ${a.name}`}>
                    <Thumb asset={a} />
                  </button>
                  {nameCell(a)}
                  <span>
                    <StageChip stage={a.stage} />
                  </span>
                  <span>{m.folderOf(a.folder_id)?.name}</span>
                  <span className="mx-tags">
                    {a.tags.slice(0, 2).map((t) => (
                      <span key={t} className="mx-tag mini">
                        {t}
                      </span>
                    ))}
                  </span>
                  <span>{formatBytes(a.size_bytes)}</span>
                  <span>{m.nameOf(a.uploaded_by)}</span>
                  <button aria-label="فتح الصفحة" onClick={() => router.push(`/media/${a.id}`)}>
                    <Icon name="eye" />
                  </button>
                </div>
              ))}
            </div>
          ) : view === 'board' ? (
            <>
              <p className="mx-hint">اسحب بطاقة بين الأعمدة لتغيير مرحلتها. الاعتماد لمراجعي المحتوى، والجدولة لمسؤول النشر، والإصدار المعتمد يُقفل.</p>
              <div className="mx-board">
                {pipeline.map((s) => {
                  const items = files.filter((a) => (a.stage === s) || (!pipeline.includes(a.stage) && pipeline[stagePosition(a.stage)] === s));
                  return (
                    <div key={s} className={`mx-col ${over === `s:${s}` ? 'drop' : ''}`} {...dropHandlers(`s:${s}`, (e) => void dropOnStage(e, s))}>
                      <h4>
                        <StageChip stage={s} />
                        <span>{items.length}</span>
                      </h4>
                      {items.map((a) => card(a, true))}
                      {!items.length && <p className="mx-hint">لا توجد ملفات.</p>}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className={`mx-grid ${selected.length ? 'selecting' : ''}`}>
              {files.map((a) => card(a))}
            </div>
          )}

          {selected.length > 0 && (
            <div className="mx-selbar">
              <b>{selected.length} محدد</b>
              <button onClick={() => setDialog({ type: 'assign', ids: selected })}>
                <Icon name="users" />
                إسناد مهمة
              </button>
              <button onClick={() => setDialog({ type: 'move', ids: selected })}>
                <Icon name="move" />
                نقل
              </button>
              <button data-hold={HOLD.trashSelected} onClick={() => void trash(selected)}>
                <Icon name="trash" />
                حذف
              </button>
              <button onClick={() => setSelected([])}>إلغاء</button>
            </div>
          )}
        </div>
      </div>

      {menu &&
        (() => {
          const a = m.assets.find((x) => x.id === menu.id);
          if (!a) return null;
          const list = actionsFor(a);
          return (
            <div className="mx-menu" style={{ top: menu.y, insetInlineStart: 'auto', left: menu.x }} role="menu" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => router.push(`/media/${a.id}`)}>
                <Icon name="eye" />
                فتح صفحة الأصل
              </button>
              <hr />
              {list.slice(0, 6).map((x) => (
                <button
                  key={x.id}
                  onClick={() => {
                    setMenu(null);
                    void run(a, x.id, setDialog);
                  }}
                >
                  <Icon name={x.icon} />
                  {x.label}
                </button>
              ))}
              {!list.length && <button disabled>لا إجراءات متاحة لدورك</button>}
            </div>
          );
        })()}

      {m.transfers.length > 0 && (
        <div className="mx-tray" role="status">
          <h5>
            <span>رفع إلى Google Drive</span>
            <span>{m.transfers.length}</span>
          </h5>
          {m.transfers.map((t) => (
            <div className="u" key={t.key}>
              <div>
                <span className="n">{t.name}</span>
                <span>{t.error ? 'فشل' : `${Math.round(t.progress * 100)}%`}</span>
              </div>
              {t.error ? (
                <small>{t.error}</small>
              ) : (
                <div className="mx-bar">
                  <i style={{ width: `${t.progress * 100}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <MediaDialogs dialog={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

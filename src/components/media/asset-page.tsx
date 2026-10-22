'use client';
// صفحة الأصل: its path through the pipeline, who worked on it, versions, notes,
// channels and the quick actions the current person may take.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { channelAccounts } from '@/lib/domain';
import { supabase } from '@/lib/supabase/client';
import { describe, type LogRow } from '@/lib/media/log-text';
import {
  LEVELS,
  LEVEL_NAMES,
  actionOwners,
  allActionIds,
  fitsPlatform,
  formatBytes,
  isAssetLocked,
  isSideStage,
  levelLabels,
  pipeline,
  platformSpecs,
  reviewerRoles,
  riyadhStamp,
  stageLabels,
  stagePosition,
  timecodeSeconds,
  type Stage,
} from '@/lib/media/rules';
import { Title } from '../ui';
import { MediaDialogs, type Dialog } from './dialogs';
import { useAssetActions } from './actions';
import { Avatar, Icon, KIND_AR, StageChip, Thumb, Ts } from './parts';
import { useMedia } from './provider';
import { StorageState } from './storage-state';
import { HOLD } from '@/lib/kit/hold-reasons';

type VersionRow = { id: string; version: number; uploaded_by: string; note: string | null; created_at: string; size_bytes: number };
type NoteRow = { id: string; author: string; body: string; timecode: string | null; created_at: string };

export function AssetPage({ id }: { id: string }) {
  const m = useMedia();
  const router = useRouter();
  const { actionsFor, run } = useAssetActions();
  const asset = m.assets.find((a) => a.id === id);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [journey, setJourney] = useState<LogRow[]>([]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [tag, setTag] = useState('');
  const media = useRef<HTMLVideoElement & HTMLAudioElement>(null);

  useEffect(() => {
    let live = true;
    const db = supabase();
    void Promise.all([
      db.from('media_versions').select('id, version, uploaded_by, note, created_at, size_bytes').eq('asset_id', id).order('version', { ascending: false }),
      db.from('media_notes').select('id, author, body, timecode, created_at').eq('asset_id', id).order('created_at', { ascending: true }),
      db.from('activity_log').select('*').eq('asset_id', id).order('at', { ascending: false }),
    ]).then(([v, n, j]) => {
      if (!live) return;
      setVersions((v.data as VersionRow[]) ?? []);
      setNotes((n.data as NoteRow[]) ?? []);
      setJourney((j.data as LogRow[]) ?? []);
    });
    return () => {
      live = false;
    };
  }, [id, m.assets, m.tasks]);

  const team = useMemo(() => {
    if (!asset) return [];
    const map = new Map<string, { email: string; n: number; roleIn: string }>();
    const touch = (email: string, roleIn = '') => {
      const cur = map.get(email) ?? { email, n: 0, roleIn };
      if (!cur.roleIn && roleIn) cur.roleIn = roleIn;
      map.set(email, cur);
      return cur;
    };
    touch(asset.uploaded_by, 'المنشئ');
    for (const e of journey) {
      const x = touch(e.actor_email);
      x.n += 1;
      if (!x.roleIn) x.roleIn = ['approve', 'changes', 'reject'].includes(e.type) ? 'مراجع' : ['schedule', 'publish'].includes(e.type) ? 'نشر' : 'مساهم';
    }
    for (const t of m.tasks.filter((t) => t.asset_id === id)) touch(t.assignee, 'مكلّف بمهمة');
    return [...map.values()].sort((a, b) => Number(b.email === asset.uploaded_by) - Number(a.email === asset.uploaded_by) || b.n - a.n);
  }, [asset, journey, m.tasks, id]);

  if (m.status === 'loading') return <p role="status">جارٍ التحميل…</p>;
  if (!asset)
    return (
      <div className="mx" dir="rtl">
        <Title title="الأصل غير موجود" sub="قد لا تملك صلاحية مجلده، أو أُزيل." />
        <Link className="button" href="/media">
          العودة إلى المكتبة
        </Link>
      </div>
    );

  const folder = m.folderOf(asset.folder_id);
  const level = m.levelOf(asset.folder_id);
  const canEdit = m.canEdit(asset.folder_id);
  const locked = isAssetLocked(asset);
  const folderLocked = m.lockedIn(asset.folder_id);
  const mineNow = versions.find((v) => v.version === asset.current_version)?.uploaded_by === m.email;
  const acts = actionsFor(asset, mineNow);
  const ownedElsewhere = [...new Set(allActionIds.filter((a) => !acts.some((x) => x.id === a)).map((a) => actionOwners[a]))].filter((o) => o !== 'الجميع');
  const pos = stagePosition(asset.stage);
  const side = isSideStage(asset.stage);
  const spec = platformSpecs;
  const dur = asset.duration ? (timecodeSeconds(asset.duration) ?? 0) : 0;
  const chain: string[] = [];
  for (let c = folder; c; c = m.folderOf(c.parent_id)) chain.unshift(c.name);

  const stageEvent = (s: Stage) => {
    if (s === 'draft') return [...journey].reverse().find((e) => e.type === 'upload');
    return journey.find((e) => (e.data as { to?: string }).to === s);
  };
  const setTags = async (tags: string[]) => {
    const r = await m.patchAsset(asset.id, { tags });
    if (!r.ok) m.say(r.error);
  };
  const toggleChannel = async (name: string) => {
    const next = asset.channels.includes(name) ? asset.channels.filter((c) => c !== name) : [...asset.channels, name];
    const r = await m.patchAsset(asset.id, { channels: next });
    if (!r.ok) m.say(r.error);
  };
  const toggleCheck = async (key: 'rights' | 'sizes') => {
    const r = await m.patchAsset(asset.id, { checklist: { ...asset.checklist, [key]: !asset.checklist[key] } });
    if (!r.ok) m.say(r.error);
  };
  const remove = async () => {
    const r = await m.trashAsset(asset.id);
    if (r.ok) {
      m.say('نُقل إلى سلة Google Drive (30 يوماً)');
      router.push('/media');
    } else m.say(r.error);
  };
  const seek = (tc: string | null) => {
    const s = timecodeSeconds(tc);
    if (s !== null && media.current) {
      media.current.currentTime = s;
      void media.current.play?.();
    }
  };
  const src = `/api/media/${asset.id}/content?v=${asset.current_version}`;

  return (
    <div className="mx" dir="rtl">
      <div className="mx-back">
        <Link className="button" href="/media">
          <Icon name="back" />
          العودة إلى المكتبة
        </Link>
        <div className="mx-crumb">
          <span>{chain.join(' ‹ ')}</span>
        </div>
      </div>

      <section className="mx-hero">
        <div className="mx-player">
          <div className="box">
            {asset.kind === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={asset.name} />
            ) : asset.kind === 'video' ? (
              <video ref={media} src={src} controls preload="metadata" />
            ) : asset.kind === 'audio' ? (
              <div>
                <Thumb asset={asset} large />
                <audio ref={media} src={src} controls preload="none" />
              </div>
            ) : (
              <Thumb asset={asset} large />
            )}
          </div>
          {(asset.kind === 'video' || asset.kind === 'audio') && notes.some((n) => n.timecode) && (
            <div className="mx-notes-track" aria-label="ملاحظات بوقت محدد">
              {notes
                .filter((n) => n.timecode)
                .map((n) => (
                  <button key={n.id} onClick={() => seek(n.timecode)} title={n.body}>
                    {n.timecode}
                  </button>
                ))}
            </div>
          )}
          {asset.kind === 'document' && (
            <div className="mx-notes-track">
              <a className="button" href={src} target="_blank" rel="noreferrer">
                <Icon name="eye" />
                فتح الملف
              </a>
            </div>
          )}
        </div>

        <div className="mx-title">
          <div className="mx-toolbar">
            <StageChip stage={asset.stage} />
            {locked && (
              <span className="mx-chip plain">
                <Icon name="lock" /> الإصدار المعتمد v{asset.approved_version} مقفل
              </span>
            )}
            {folderLocked && (
              <span className="mx-chip plain">
                <Icon name="lock" /> المجلد مقفل
              </span>
            )}
          </div>
          {renaming ? (
            <input
              className="rename"
              autoFocus
              defaultValue={asset.name}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={async (e) => {
                const v = e.currentTarget.value;
                setRenaming(false);
                if (v.trim() && v.trim() !== asset.name) {
                  const r = await m.renameAsset(asset.id, v);
                  m.say(r.ok ? 'تغيّر الاسم في المركز وفي Google Drive معاً' : r.error);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') setRenaming(false);
              }}
            />
          ) : (
            <h2 onDoubleClick={() => canEdit && !locked && setRenaming(true)}>{asset.name}</h2>
          )}
          <div className="mx-facts">
            <span>
              <Icon name="users" />
              أنشأه {m.nameOf(asset.uploaded_by)}
            </span>
            <span>
              <Icon name="history" />
              آخر تعديل <Ts>{riyadhStamp(asset.updated_at)}</Ts>
            </span>
            <span>
              <Icon name="folder" />
              {folder?.name}
            </span>
            {asset.work_ref && (
              <span>
                <Icon name="flag" />
                {asset.work_ref}
              </span>
            )}
          </div>
          <div className="mx-tags">
            {asset.tags.map((t, i) => (
              <span key={t + i} className="mx-tag">
                {t}
                {canEdit && !locked && (
                  <button aria-label={`حذف الوسم ${t}`} onClick={() => void setTags(asset.tags.filter((_, k) => k !== i))}>
                    ×
                  </button>
                )}
              </span>
            ))}
            {canEdit && !locked && (
              <input
                value={tag}
                maxLength={30}
                placeholder="وسم جديد + Enter"
                aria-label="وسم جديد"
                style={{ width: 160, minHeight: 32, margin: 0 }}
                onChange={(e) => setTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && tag.trim()) {
                    e.preventDefault();
                    void setTags([...asset.tags, tag.trim()]);
                    setTag('');
                  }
                }}
              />
            )}
          </div>
          <div className="mx-toolbar">
            <a className="button" href={`/api/media/${asset.id}/content?download=1`}>
              <Icon name="download" />
              تنزيل
            </a>
            <button disabled={!canEdit || locked} onClick={() => setRenaming(true)}>
              <Icon name="pencil" />
              إعادة تسمية
            </button>
            <button disabled={!canEdit || locked} onClick={() => setDialog({ type: 'move', ids: [asset.id] })}>
              <Icon name="move" />
              نقل
            </button>
            <button disabled={!m.canManage(asset.folder_id) || locked} data-hold={HOLD.trashOne} onClick={() => void remove()}>
              <Icon name="trash" />
              حذف
            </button>
          </div>
          {locked && (
            <p className="mx-lock">
              <Icon name="lock" />
              <span>الاعتماد مرتبط بهذا الإصدار بعينه، لذلك الاسم والحذف مقفلان. أي تعديل يكون بإصدار جديد.</span>
            </p>
          )}
        </div>
      </section>

      <section className="mx-pn">
        <h3>
          مسار الأصل في خط الإنتاج<small>من المسودة إلى النشر</small>
        </h3>
        <div className="mx-stepper" role="list">
          {pipeline.map((s, i) => {
            const e = stageEvent(s);
            const cls = i < pos ? 'done' : i === pos ? (side ? 'warn' : 'now') : '';
            return (
              <div key={s} className={`mx-step ${cls}`} role="listitem">
                <span className="dot">{i < pos ? <Icon name="check" /> : <Icon name={s === 'review' ? 'eye' : s === 'ready' ? 'check' : s === 'scheduled' ? 'cal' : s === 'published' ? 'upload' : s === 'production' ? 'film' : 'file'} />}</span>
                <b>{stageLabels[s]}</b>
                <small>{e && i <= pos ? <>{m.nameOf(e.actor_email)}<br /><Ts>{riyadhStamp(e.at).slice(5)}</Ts></> : i > pos ? 'لم تبدأ' : ''}</small>
              </div>
            );
          })}
        </div>
        {side && (
          <p className="mx-side">
            <Icon name="alert" />
            <span>
              الحالة الحالية: <b>{stageLabels[asset.stage]}</b>.{' '}
              {asset.stage === 'changes'
                ? 'ينتظر المنشئ تنفيذ الملاحظات ثم يعيد الإرسال للمراجعة.'
                : asset.stage === 'partial'
                  ? 'نُشر على بعض المنصات وفشل بعضها: أحد الحسابات يحتاج إعادة ربط.'
                  : asset.stage === 'failed'
                    ? 'فشل النشر، أعد المحاولة بعد إصلاح الحساب.'
                    : 'أُعيد الأصل إلى المنتج.'}
            </span>
          </p>
        )}
      </section>

      <div className="mx-agrid">
        <div className="mx-acol">
          <section className="mx-pn">
            <h3>
              رحلة الأصل<small>{journey.length} حدثاً</small>
            </h3>
            <ul className="mx-tl">
              {journey.map((e) => {
                const d = describe(e, m.nameOf);
                return (
                  <li key={e.id}>
                    <span className="ti">
                      <Icon name={({ upload: 'upload', version: 'history', approve: 'check', changes: 'pencil', reject: 'x', schedule: 'cal', publish: 'send', assign: 'users', done: 'check', copy: 'file', rename: 'pencil', move: 'move', tag: 'tag', note: 'note', download: 'download', link: 'link', stage: 'board' } as Record<string, string>)[e.type] ?? 'file'} />
                    </span>
                    <span className="tx">
                      {d.text} {d.stage && <StageChip stage={d.stage} />}
                      {(d.before || d.after) && (
                        <span className="mx-ba">
                          <s>{d.before ?? '—'}</s>
                          <span aria-hidden="true">←</span>
                          <b>{d.after ?? '—'}</b>
                        </span>
                      )}
                      <small>
                        <Ts>{riyadhStamp(e.at)}</Ts>
                      </small>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="mx-pn">
            <h3>
              الإصدارات<small>{versions.length}</small>
            </h3>
            <ul className="mx-vers">
              {versions.map((v) => {
                const ok = asset.approved_version === v.version;
                const now = v.version === asset.current_version;
                return (
                  <li key={v.id} className={`${ok ? 'ok' : ''} ${now ? 'now' : ''}`}>
                    <span className="dt">
                      <Icon name={ok ? 'lock' : 'history'} />
                    </span>
                    <span>
                      <b>
                        v{v.version}
                        {now ? ' · الحالي' : ''}
                      </b>
                      <small>
                        {m.nameOf(v.uploaded_by)} · <Ts>{riyadhStamp(v.created_at)}</Ts> · {formatBytes(v.size_bytes)}
                        {v.note ? ` · ${v.note}` : ''}
                      </small>
                    </span>
                    <span className="mx-toolbar">
                      {ok && <span className="mx-chip success">معتمد</span>}
                      <a className="button" href={`/api/media/${asset.id}/content?v=${v.version}`} target="_blank" rel="noreferrer">
                        عرض
                      </a>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="mx-pn">
            <h3>
              ملاحظات المراجعة<small>{asset.kind === 'video' || asset.kind === 'audio' ? 'بوقت محدد' : ''}</small>
            </h3>
            {notes.length ? (
              <div className="mx-notes">
                {notes.map((n) => (
                  <div className="n" key={n.id}>
                    {n.timecode ? (
                      <button className="mx-link" onClick={() => seek(n.timecode)}>
                        <time>{n.timecode}</time>
                      </button>
                    ) : (
                      <span className="mx-chip plain">عام</span>
                    )}
                    <span>
                      <b>{m.nameOf(n.author)}</b> · {n.body}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mx-hint">لا توجد ملاحظات بعد.</p>
            )}
          </section>

          <section className="mx-pn">
            <h3>
              النشر والمنصات{asset.schedule && <small>مجدول <Ts>{asset.schedule.at}</Ts></small>}
            </h3>
            <div className="mx-chan">
              {spec.map((p) => {
                const targeted = asset.channels.includes(p.id);
                const acc = channelAccounts.find((a) => a.name === p.id);
                const fit = fitsPlatform(asset.dims, p);
                const cp = asset.copy[p.id];
                const on = asset.schedule?.platforms.includes(p.id);
                return (
                  <div className="r" key={p.id} style={{ opacity: targeted ? 1 : 0.7 }}>
                    <span>
                      <b>{p.name}</b>
                      <small>
                        {cp?.t ? `«${cp.t}»` : 'لا يوجد عنوان ووصف بعد'} · المقاس المطلوب {p.size}
                        {fit === null ? '' : fit ? ' · مطابق' : ' · يحتاج قصاً'}
                      </small>
                    </span>
                    <span className="mx-toolbar">
                      {on && <span className="mx-chip schedule">مجدول</span>}
                      <span className={`mx-chip ${acc?.status === 'CONNECTED' ? 'success' : 'danger'}`}>{acc?.status === 'CONNECTED' ? 'متصل' : 'يحتاج إعادة ربط'}</span>
                      {canEdit && !locked && (
                        <button aria-pressed={targeted} onClick={() => void toggleChannel(p.id)}>
                          {targeted ? 'مستهدفة' : 'استهداف'}
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mx-hint">النشر محاكاة في هذا النموذج: لا يُرسل شيء إلى المنصات.</p>
          </section>
        </div>

        <div className="mx-acol">
          <section className="mx-pn">
            <h3>
              الإجراءات السريعة<small>{m.role === 'admin' ? 'Admin' : ''}</small>
            </h3>
            <div className="mx-qlist">
              {acts.length ? (
                acts.map((x) => (
                  <button key={x.id} className={`mx-qbtn ${x.next ? 'next' : ''}`} onClick={() => void run(asset, x.id, setDialog)}>
                    <span className="qi">
                      <Icon name={x.icon} />
                    </span>
                    <span>
                      <b>{x.label}</b>
                      <small>{x.hint}</small>
                    </span>
                  </button>
                ))
              ) : (
                <p className="mx-hint">لا توجد إجراءات متاحة لدورك على هذا الأصل.</p>
              )}
              {mineNow && asset.stage === 'review' && reviewerRoles.includes(m.role) && (
                <p className="mx-more">رفعت الإصدار v{asset.current_version} بنفسك، فيقرر فيه غيرك من القيادة.</p>
              )}
              {ownedElsewhere.length > 0 && <p className="mx-more">إجراءات أخرى لهذا الأصل متاحة لـ: {ownedElsewhere.join('، ')}.</p>}
            </div>
          </section>

          <section className="mx-pn">
            <h3>
              الفريق<small>{team.length}</small>
            </h3>
            <div className="mx-team">
              {team.map((t) => (
                <div className="mx-mem" key={t.email}>
                  <Avatar name={m.nameOf(t.email)} large />
                  <span>
                    <b>{m.nameOf(t.email)}</b>
                    <small>{t.roleIn}</small>
                  </span>
                  <span className="cnt">{t.n} إجراء</span>
                </div>
              ))}
            </div>
          </section>

          <section className="mx-pn">
            <h3>
              المهام على هذا الأصل<small>{m.tasks.filter((t) => t.asset_id === asset.id).length}</small>
            </h3>
            {m.tasks.filter((t) => t.asset_id === asset.id).length ? (
              m.tasks
                .filter((t) => t.asset_id === asset.id)
                .map((t) => {
                  const late = t.status === 'open' && new Date(t.due) < new Date();
                  return (
                    <div className="mx-mem" key={t.id}>
                      <Avatar name={m.nameOf(t.assignee)} />
                      <span>
                        <b>{t.what}</b>
                        <small>
                          {m.nameOf(t.assignee)} · قبل <Ts>{riyadhStamp(t.due)}</Ts>
                          {late && <span style={{ color: 'var(--danger)' }}> · متأخرة</span>}
                        </small>
                      </span>
                      <span className={`mx-chip ${t.status === 'done' ? 'success' : 'plain'}`}>{t.status === 'done' ? 'تمت' : 'مفتوحة'}</span>
                    </div>
                  );
                })
            ) : (
              <p className="mx-hint">لا توجد مهام.</p>
            )}
          </section>

          <section className="mx-pn">
            <h3>قائمة الجاهزية</h3>
            <div className="mx-chk">
              {(
                [
                  ['copy', 'العنوان والوصف مكتوبان', false],
                  ['rights', 'الحقوق والإذن مؤكدان', true],
                  ['sizes', 'مقاسات المنصات مضبوطة', true],
                  ['review', 'اعتُمد من المراجع', false],
                ] as const
              ).map(([k, label, manual]) => (
                <div key={k}>
                  {manual && canEdit ? (
                    <button className={`b ${asset.checklist[k] ? 'y' : ''}`} style={{ padding: 0, minHeight: 20 }} role="checkbox" aria-checked={asset.checklist[k]} aria-label={label} onClick={() => void toggleCheck(k as 'rights' | 'sizes')}>
                      {asset.checklist[k] && <Icon name="check" />}
                    </button>
                  ) : (
                    <span className={`b ${asset.checklist[k] ? 'y' : ''}`}>{asset.checklist[k] && <Icon name="check" />}</span>
                  )}
                  {label}
                </div>
              ))}
            </div>
          </section>

          <section className="mx-pn">
            <h3>معلومات الملف</h3>
            <dl className="mx-kv">
              <dt>النوع</dt>
              <dd>{KIND_AR[asset.kind]}</dd>
              <dt>الحجم</dt>
              <dd>{formatBytes(asset.size_bytes)}</dd>
              <dt>الأبعاد</dt>
              <dd>{asset.dims ?? '—'}</dd>
              {asset.duration && (
                <>
                  <dt>المدة</dt>
                  <dd>{asset.duration}</dd>
                </>
              )}
              <dt>أُنشئ</dt>
              <dd>
                <Ts>{riyadhStamp(asset.created_at)}</Ts>
              </dd>
              <dt>المجلد</dt>
              <dd>{folder?.name}</dd>
              <dt>صلاحيتك</dt>
              <dd>{levelLabels[LEVEL_NAMES[Math.min(level, LEVELS.manage)]]}</dd>
              <dt>التخزين</dt>
              <dd className="mx-storage-line">
                <StorageState assetId={asset.id} refreshKey={versions.length} />
              </dd>
              <dt>معرّف Drive</dt>
              <dd dir="ltr">{asset.drive_file_id}</dd>
            </dl>
          </section>
        </div>
      </div>

      <MediaDialogs dialog={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

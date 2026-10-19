'use client';

// The studio home (MVP_draft.md 62): the projects shared by everyone who may open the studio, new
// video and photo projects, rename, archive by long press (never a deletion), and the archive.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Archive, ArchiveRestore, Film, Image as ImageIcon, Pencil, Plus, UserRound } from 'lucide-react';
import { HOLD } from '@/lib/kit/hold-reasons';
import { FPS_CHOICES, KIND_LABELS, PHOTO_MAX_SIDE, PHOTO_PRESETS, RATIOS, newPhotoDoc, newVideoDoc, type Fps, type Ratio } from '@/lib/studio/schema';
import type { ProjectRow } from '@/lib/studio/persist';
import { Modal } from '../ui';
import { Segmented } from '../motion-controls';
import { useStudioApi } from './use-project';

const when = (iso: string, now = Date.now()) => {
  const min = Math.round((now - Date.parse(iso)) / 60_000);
  if (min < 1) return 'الآن';
  if (min < 60) return `قبل ${min} دقيقة`;
  const h = Math.round(min / 60);
  if (h < 24) return `قبل ${h} ساعة`;
  return new Intl.DateTimeFormat('ar-SA-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
};

export function ProjectList() {
  const api = useStudioApi();
  const router = useRouter();
  const [archived, setArchived] = useState(false);
  const [rows, setRows] = useState<ProjectRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<null | 'video' | 'photo'>(null);
  const [renaming, setRenaming] = useState<ProjectRow | null>(null);

  const reload = useCallback(async () => {
    const r = await api.list(archived);
    if (r.ok) {
      setRows(r.data);
      setError(null);
    } else setError(r.error);
  }, [api, archived]);
  useEffect(() => {
    setRows(null);
    void reload();
    const onFocus = () => void reload();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reload]);

  const archive = async (p: ProjectRow, on: boolean) => {
    const r = await api.archive(p.id, on);
    if (!r.ok) setError(r.error);
    await reload();
  };

  return (
    <section className="st-home" aria-label="مشاريع الاستوديو">
      <div className="st-home-bar">
        <div className="actions">
          <button type="button" className="primary" onClick={() => setCreating('video')}>
            <Plus aria-hidden="true" />
            مشروع فيديو جديد
          </button>
          <button type="button" onClick={() => setCreating('photo')}>
            <Plus aria-hidden="true" />
            مشروع صورة جديد
          </button>
        </div>
        <label className="st-switch-row">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          الأرشيف
        </label>
      </div>
      {error && <p className="warning" role="alert">{error}</p>}
      {!rows ? (
        <div className="st-cards" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton st-card-skel" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="panel st-empty">
          <h2>{archived ? 'لا مشاريع في الأرشيف' : 'لا مشاريع بعد'}</h2>
          <p>
            {archived
              ? 'المشاريع المؤرشفة تظهر هنا بكل نسخها، ويمكن إعادتها.'
              : 'ابدأ مشروع فيديو أو صورة. يُحفظ المشروع في قاعدة البيانات تلقائياً، ويستعمل ملفات المكتبة وقوالب الحركة وعلامات الهوية.'}
          </p>
        </div>
      ) : (
        <ul className="st-cards">
          {rows.map((p) => (
            <li key={p.id} className="st-card">
              <Link href={`/motion/studio/${p.id}`} className="st-card-open">
                <span className="st-card-kind" data-kind={p.kind}>
                  {p.kind === 'video' ? <Film aria-hidden="true" /> : <ImageIcon aria-hidden="true" />}
                  {KIND_LABELS[p.kind]}
                </span>
                <b>{p.title}</b>
                <small>
                  {p.owner_name ?? p.owner} · آخر تعديل {when(p.updated_at)}
                  {p.updated_by !== p.owner && p.updated_by_name ? ` بيد ${p.updated_by_name}` : ''}
                </small>
                <small>
                  النسخة {p.revision}
                  {p.exports ? ` · ${p.exports} تصدير إلى المكتبة` : ''}
                  {p.work_ref ? ` · العمل ${p.work_ref}` : ''}
                </small>
                {p.editing && (
                  <span className="st-card-editing">
                    <UserRound aria-hidden="true" />
                    يحرره {p.editing_name ?? p.editing} الآن
                  </span>
                )}
              </Link>
              <div className="st-card-acts">
                {!archived && (
                  <button type="button" onClick={() => setRenaming(p)} aria-label={`إعادة تسمية ${p.title}`}>
                    <Pencil aria-hidden="true" />
                  </button>
                )}
                {archived ? (
                  <button type="button" onClick={() => void archive(p, false)}>
                    <ArchiveRestore aria-hidden="true" />
                    إعادة
                  </button>
                ) : (
                  <button type="button" data-hold={HOLD.studioArchive} onClick={() => void archive(p, true)} aria-label={`أرشفة ${p.title}`}>
                    <Archive aria-hidden="true" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {creating && (
        <CreateDialog
          kind={creating}
          onClose={() => setCreating(null)}
          onCreate={async (title, doc) => {
            const r = await api.create(title, doc);
            if (r.ok) router.push(`/motion/studio/${r.data}`);
            return r.ok ? null : r.error;
          }}
        />
      )}
      {renaming && (
        <RenameDialog
          title={renaming.title}
          onClose={() => setRenaming(null)}
          onSave={async (t) => {
            const r = await api.rename(renaming.id, t);
            if (r.ok) {
              setRenaming(null);
              await reload();
            }
            return r.ok ? null : r.error;
          }}
        />
      )}
    </section>
  );
}

function CreateDialog({ kind, onClose, onCreate }: { kind: 'video' | 'photo'; onClose: () => void; onCreate: (title: string, doc: ReturnType<typeof newVideoDoc>) => Promise<string | null> }) {
  const [title, setTitle] = useState('');
  const [ratio, setRatio] = useState<Ratio>('9:16');
  const [fps, setFps] = useState<Fps>(30);
  const [preset, setPreset] = useState<number>(0);
  const [w, setW] = useState(1080);
  const [h, setH] = useState(1080);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const custom = preset === PHOTO_PRESETS.length;
  const submit = async () => {
    if (!title.trim()) return setError('اكتب اسماً للمشروع، حتى 120 حرفاً.');
    setBusy(true);
    const size = custom ? { w, h } : PHOTO_PRESETS[preset];
    const err = await onCreate(title.trim(), kind === 'video' ? newVideoDoc(ratio, fps) : newPhotoDoc(size.w, size.h));
    setBusy(false);
    if (err) setError(err);
  };
  return (
    <Modal title={kind === 'video' ? 'مشروع فيديو جديد' : 'مشروع صورة جديد'} onClose={onClose}>
      <form
        className="st-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label>
          اسم المشروع
          <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder={kind === 'video' ? 'مثال: مقطع إطلاق الحملة' : 'مثال: بطاقة اليوم الوطني'} />
        </label>
        {kind === 'video' ? (
          <>
            <Segmented label="شكل الإطار" value={ratio} onChange={setRatio} options={(Object.keys(RATIOS) as Ratio[]).map((r) => ({ value: r, label: RATIOS[r].label, hint: `${RATIOS[r].w}×${RATIOS[r].h}` }))} />
            <Segmented label="الإطارات في الثانية" value={fps} onChange={setFps} options={FPS_CHOICES.map((f) => ({ value: f, label: String(f) }))} />
            <small>يمكن تغييرهما لاحقاً من إعدادات المشروع.</small>
          </>
        ) : (
          <>
            <Segmented
              label="المقاس"
              value={preset}
              onChange={setPreset}
              options={[...PHOTO_PRESETS.map((p, i) => ({ value: i, label: p.label })), { value: PHOTO_PRESETS.length, label: 'مقاس آخر' }]}
            />
            {custom && (
              <div className="field-pair">
                <label>
                  العرض بالبكسل
                  <input type="number" min={16} max={PHOTO_MAX_SIDE} value={w} onChange={(e) => setW(Number(e.target.value))} dir="ltr" />
                </label>
                <label>
                  الارتفاع بالبكسل
                  <input type="number" min={16} max={PHOTO_MAX_SIDE} value={h} onChange={(e) => setH(Number(e.target.value))} dir="ltr" />
                </label>
              </div>
            )}
          </>
        )}
        {error && <p className="warning" role="alert">{error}</p>}
        <div className="actions">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'جارٍ الإنشاء…' : 'إنشاء وفتح'}
          </button>
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function RenameDialog({ title, onClose, onSave }: { title: string; onClose: () => void; onSave: (title: string) => Promise<string | null> }) {
  const [t, setT] = useState(title);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="إعادة تسمية المشروع" onClose={onClose}>
      <form
        className="st-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(await onSave(t));
        }}
      >
        <label>
          الاسم
          <input value={t} maxLength={120} onChange={(e) => setT(e.target.value)} autoFocus />
        </label>
        {error && <p className="warning" role="alert">{error}</p>}
        <div className="actions">
          <button type="submit" className="primary">حفظ الاسم</button>
          <button type="button" onClick={onClose}>إلغاء</button>
        </div>
      </form>
    </Modal>
  );
}

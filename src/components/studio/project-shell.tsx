'use client';

// An open project (MVP_draft.md 62): the bar above the editor (back to the projects, the name, the
// save state, «حفظ نسخة»), the reading-only banner with who is editing and the take-over by long
// press, and the offer of a newer draft from this device. The editor itself is chosen by kind.
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, CircleAlert, History, Lock, Save } from 'lucide-react';
import { HOLD } from '@/lib/kit/hold-reasons';
import { KIND_LABELS, type ProjectDoc } from '@/lib/studio/schema';
import { saveStateText, type StudioApi } from '@/lib/studio/persist';
import { Modal } from '../ui';
import { RenameDialog } from './project-list';
import { useStudioProject } from './use-project';

export type EditorProps = {
  projectId: string;
  title: string;
  doc: ProjectDoc;
  onChange: (doc: ProjectDoc) => void;
  readOnly: boolean;
  /** The numbered revision the next save builds on (an export first saves one). */
  revision: () => number;
  saveVersion: (note: string | null) => Promise<{ ok: boolean; error?: string }>;
  api: StudioApi;
  /** Opens «حفظ نسخة» (Ctrl+S and the menu «ملف»). */
  onRequestVersion?: () => void;
  /** Opens the renaming of the project (F2). */
  onRequestRename?: () => void;
};

/** A numbered version asked for by the address (`?v=N`, «عرض» in «النسخ»), or null for the project itself. */
function viewOf(raw: string | null): number | null {
  const n = Number(raw);
  return raw && Number.isInteger(n) && n >= 1 ? n : null;
}

export function ProjectShell({ id, editor }: { id: string; editor: (p: EditorProps) => ReactNode }) {
  const view = viewOf(useSearchParams()?.get('v') ?? null);
  const p = useStudioProject(id, view);
  const { state } = p;
  const [now, setNow] = useState(() => Date.now());
  const [versioning, setVersioning] = useState(false);
  const [renaming, setRenaming] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);

  if (state.status === 'loading') return <div className="panel" role="status">جارٍ فتح المشروع…</div>;
  if (state.status === 'error')
    return (
      <div className="panel" role="alert">
        <p>{state.error}</p>
        <Link href="/motion/studio" className="button">العودة إلى المشاريع</Link>
      </div>
    );

  const ro = state.save.kind === 'readonly' ? state.save : null;
  const readOnly = !!ro;
  const holder = state.lease && !state.lease.mine ? (state.lease.holder_name ?? state.lease.holder) : null;
  return (
    <div className="st-project" data-readonly={readOnly ? 'yes' : 'no'}>
      <div className="st-bar">
        <Link href="/motion/studio" className="st-back" aria-label="العودة إلى المشاريع">
          <ArrowRight aria-hidden="true" />
        </Link>
        <button type="button" className="st-title" onClick={() => !readOnly && setRenaming(true)} disabled={readOnly} title="إعادة تسمية">
          <b>{state.opened.title}</b>
          <small>{KIND_LABELS[state.opened.kind]} · النسخة {view ?? state.opened.revision}</small>
        </button>
        <span className={`st-save st-save-${state.save.kind}`} role="status" aria-live="polite">
          {state.save.kind === 'error' && <CircleAlert aria-hidden="true" />}
          {readOnly && <Lock aria-hidden="true" />}
          {saveStateText(state.save, now)}
        </span>
        <button type="button" className="primary st-version" disabled={readOnly || state.save.kind === 'saving'} onClick={() => setVersioning(true)}>
          <Save aria-hidden="true" />
          حفظ نسخة
        </button>
      </div>
      {ro?.code === 'VIEW' && (
        <div className="st-banner st-banner-view" role="note">
          <Lock aria-hidden="true" />
          <span>تعرض النسخة {view} من «{state.opened.title}» للقراءة فقط. لا يُحفظ فيها شيء.</span>
          <Link href={`/motion/studio/${id}`} className="button">
            فتح الحال الحالية
          </Link>
        </div>
      )}
      {ro && ro.code !== 'VIEW' && (
        <div className="st-banner" role="note">
          <Lock aria-hidden="true" />
          <span>
            {ro.code === 'ARCHIVED'
              ? 'هذا المشروع في الأرشيف، فهو للقراءة فقط. أعِده من الأرشيف في صفحة المشاريع.'
              : holder
                ? `يحرره ${holder} الآن، فهو أمامك للقراءة فقط.`
                : ro.error}
          </span>
          {ro.code !== 'ARCHIVED' && (
            <button type="button" data-hold={HOLD.studioTakeOver} onClick={() => void p.takeOver()}>
              تولي التحرير
            </button>
          )}
        </div>
      )}
      {state.draft && (
        <div className="st-banner st-banner-draft" role="note">
          <History aria-hidden="true" />
          <span>على هذا الجهاز تغييرات أحدث من آخر حفظ ({new Date(state.draft.at).toLocaleTimeString('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}). أتريد استعادتها؟</span>
          <button type="button" className="primary" onClick={p.applyDraft} disabled={readOnly}>
            استعادة
          </button>
          <button type="button" onClick={p.discardDraft}>تجاهل</button>
        </div>
      )}
      {editor({
        projectId: id,
        title: state.opened.title,
        doc: state.doc,
        onChange: p.change,
        readOnly,
        revision: p.revision,
        saveVersion: p.saveVersion,
        api: p.api,
        onRequestVersion: readOnly || state.save.kind === 'saving' ? undefined : () => setVersioning(true),
        onRequestRename: readOnly ? undefined : () => setRenaming(true),
      })}
      {versioning && <VersionDialog onClose={() => setVersioning(false)} onSave={async (note) => {
        const r = await p.saveVersion(note);
        if (r.ok) setVersioning(false);
        return r.ok ? null : r.error;
      }} />}
      {renaming && <RenameDialog title={state.opened.title} onClose={() => setRenaming(false)} onSave={async (t) => {
        const r = await p.rename(t);
        if (r.ok) setRenaming(false);
        return r.ok ? null : r.error;
      }} />}
    </div>
  );
}

function VersionDialog({ onClose, onSave }: { onClose: () => void; onSave: (note: string | null) => Promise<string | null> }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="حفظ نسخة مرقّمة" onClose={onClose}>
      <form
        className="st-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(await onSave(note.trim() || null));
          setBusy(false);
        }}
      >
        <p>تبقى النسخة المرقّمة كما هي ولا تُستبدل. الحفظ التلقائي يستمر بين النسخ.</p>
        <label>
          ملاحظة (اختيارية)
          <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="مثال: قبل إرسالها للمراجعة" autoFocus />
        </label>
        {error && <p className="warning" role="alert">{error}</p>}
        <div className="actions">
          <button type="submit" className="primary" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ النسخة'}</button>
          <button type="button" onClick={onClose}>إلغاء</button>
        </div>
      </form>
    </Modal>
  );
}

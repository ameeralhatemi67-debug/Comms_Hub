'use client';

// «النسخ» (MVP_draft.md 62.6): the numbered versions of the project, newest first, with who saved each
// one, its note and the library files exported from it. «عرض» opens a version for reading in a new tab;
// «مقارنة بالحالية» says in words what differs from the state on screen; «استعادة» (long press) makes a
// version the current state: the state on screen is first kept as a numbered version when it is not one
// already, then the old version is applied as one undoable step and saved as a numbered version. No
// version is ever removed (studio_revisions is append-only).
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, GitCompare, RefreshCw, RotateCcw } from 'lucide-react';
import { HOLD } from '@/lib/kit/hold-reasons';
import { diffDocs, sameDoc, type DiffLabel } from '@/lib/studio/diff';
import { openDoc, type ProjectDoc } from '@/lib/studio/schema';
import { STUDIO_ERRORS, type RevisionRow, type StudioApi } from '@/lib/studio/persist';
import { when } from './project-list';

export type VersionsProps = {
  projectId: string;
  api: StudioApi;
  readOnly: boolean;
  /** The state on screen. */
  doc: ProjectDoc;
  /** The latest numbered revision (the base of the next save). */
  revision: () => number;
  saveVersion: (note: string | null) => Promise<{ ok: boolean; error?: string }>;
  /** Applies a document as one step of the editor's history. */
  onApply: (doc: ProjectDoc, label: string) => void;
  label: DiffLabel;
  /** Changes after each numbered save, so the list reads again. */
  refreshKey?: number;
};

export function VersionsPanel(p: VersionsProps) {
  const [rows, setRows] = useState<RevisionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [open, setOpen] = useState<{ n: number; lines: string[] } | null>(null);
  const [again, setAgain] = useState(0);
  const root = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(0);

  // the window may wait behind another tab: it reads again when it comes into view
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    let seen = false;
    const io = new IntersectionObserver((entries) => {
      const vis = entries.some((e) => e.isIntersecting);
      if (vis && !seen) setShown((x) => x + 1);
      seen = vis;
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    let live = true;
    void p.api.revisions(p.projectId).then((r) => {
      if (!live) return;
      if (r.ok) {
        setRows(r.data);
        setError(null);
      } else setError(r.error);
    });
    return () => {
      live = false;
    };
  }, [p.api, p.projectId, p.refreshKey, again, shown]);

  const load = useCallback(
    async (n: number): Promise<ProjectDoc | string> => {
      const r = await p.api.open(p.projectId, n);
      if (!r.ok) return r.error;
      try {
        return openDoc(r.data.doc);
      } catch {
        return STUDIO_ERRORS.DOC_INVALID;
      }
    },
    [p.api, p.projectId],
  );

  const compare = async (n: number) => {
    if (open?.n === n) return setOpen(null);
    setBusy(n);
    const d = await load(n);
    setBusy(null);
    if (typeof d === 'string') return setError(d);
    const diff = diffDocs(d, p.doc, p.label);
    setOpen({ n, lines: diff.same ? ['لا فرق: الحال الحالية مثل هذه النسخة.'] : diff.lines });
  };

  const restore = async (n: number) => {
    setError(null);
    setNote(null);
    setBusy(n);
    try {
      const d = await load(n);
      if (typeof d === 'string') return setError(d);
      if (sameDoc(d, p.doc)) return setNote(`الحال الحالية مثل النسخة ${n}، فلا شيء يُستعاد.`);
      // the state on screen is kept first, unless it is already the latest numbered version
      const latest = await load(p.revision());
      if (typeof latest === 'string' || !sameDoc(latest, p.doc)) {
        const kept = await p.saveVersion(`قبل استعادة النسخة ${n}`);
        if (!kept.ok) return setError(kept.error ?? STUDIO_ERRORS.NETWORK);
      }
      p.onApply(d, `استعادة النسخة ${n}`);
      const saved = await p.saveVersion(`استعادة النسخة ${n}`);
      if (!saved.ok) return setError(saved.error ?? STUDIO_ERRORS.NETWORK);
      setNote(`استُعيدت النسخة ${n} وحُفظت نسخةً جديدة. ما كان قبلها باقٍ في القائمة.`);
      setOpen(null);
      setAgain((x) => x + 1);
    } finally {
      setBusy(null);
    }
  };

  const latest = rows?.[0]?.revision ?? null;
  return (
    <section className="st-pane st-versions" aria-label="النسخ" ref={root}>
      <div className="st-versions-head">
        <b>النسخ المرقّمة</b>
        <button type="button" className="st-mini" onClick={() => setAgain((x) => x + 1)} title="قراءة النسخ من جديد">
          <RefreshCw aria-hidden="true" />
          تحديث
        </button>
      </div>
      {error && <p className="warning" role="alert">{error}</p>}
      {note && <p className="st-done" role="status">{note}</p>}
      {!rows ? (
        <p className="st-hint" role="status">جارٍ القراءة…</p>
      ) : !rows.length ? (
        <p className="st-hint">لا نسخ مرقّمة بعد. «حفظ نسخة» يحفظ واحدة.</p>
      ) : (
        <ol className="st-versions-list">
          {rows.map((r) => (
            <li key={r.revision} data-latest={r.revision === latest ? 'yes' : 'no'}>
              <div className="st-versions-row">
                <b>النسخة {r.revision}</b>
                {r.revision === latest && <span className="st-chip">الأحدث</span>}
                <small>
                  {when(r.saved_at)} · {r.saved_by_name ?? r.saved_by}
                </small>
              </div>
              {r.note && <p className="st-versions-note" dir="auto">{r.note}</p>}
              {r.exports.length > 0 && (
                <ul className="st-versions-exports">
                  {r.exports.map((e) => (
                    <li key={`${e.asset}:${e.version}`}>
                      {e.name ? (
                        <Link href={`/media/${e.asset}`} dir="auto">
                          {e.name}
                        </Link>
                      ) : (
                        <span>ملف لا تملك صلاحيته</span>
                      )}{' '}
                      <small>الإصدار {e.version}</small>
                    </li>
                  ))}
                </ul>
              )}
              <div className="st-versions-acts">
                <Link href={`/motion/studio/${p.projectId}?v=${r.revision}`} target="_blank" className="st-mini" title="فتح هذه النسخة للقراءة في نافذة جديدة">
                  <Eye aria-hidden="true" />
                  عرض
                </Link>
                <button type="button" className="st-mini" disabled={busy !== null} aria-expanded={open?.n === r.revision} onClick={() => void compare(r.revision)}>
                  <GitCompare aria-hidden="true" />
                  مقارنة بالحالية
                </button>
                <button type="button" className="st-mini" disabled={p.readOnly || busy !== null} data-hold={HOLD.studioRestore} onClick={() => void restore(r.revision)}>
                  <RotateCcw aria-hidden="true" />
                  {busy === r.revision ? 'جارٍ…' : 'استعادة'}
                </button>
              </div>
              {open?.n === r.revision && (
                <ul className="st-versions-diff" aria-label={`الفرق بين النسخة ${r.revision} والحال الحالية`}>
                  {open.lines.slice(0, 40).map((l, i) => (
                    <li key={i} dir="auto">
                      {l}
                    </li>
                  ))}
                  {open.lines.length > 40 && <li>وفروق أخرى: {open.lines.length - 40}</li>}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
      <p className="st-hint">لا تُحذف نسخة أبداً. الاستعادة تحفظ الحال الحالية أولاً، ثم تحفظ النسخة المستعادة نسخةً جديدة.</p>
    </section>
  );
}

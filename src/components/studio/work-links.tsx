'use client';

// The studio and the work cycle (MVP_draft.md 62, Studio_Build_Plan.md Phase 7):
//   - the work page offers «فتح في الاستوديو» on a file a studio project exported, to those who may open
//     the studio (studio_exports has a read policy for them alone, so nobody else even learns the link);
//   - a project can belong to a work (studio_project_link_work), and a file it saves to the library can be
//     linked to that work (the work cycle's own work_asset_link, with its rules);
//   - the studio shows the work's status and the review notes on every file it exported, by version, with
//     answers and «تم» (media_note_add, media_note_done; MVP_draft.md 62.12), a note's time moves the
//     playhead there, and the open ones are marks on the time ruler; the work's texts can be put on the
//     timeline.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Clapperboard, MessageSquareText, RefreshCw, Type as TypeIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { canOpenStudio, STUDIO_CAP } from '@/lib/access';
import { useAccount } from '@/lib/account-context';
import { statusLabels } from '@/lib/domain';
import { NOTE_COLUMNS, addNote, noteMs, noteTime, setNoteDone, type Note } from '@/lib/media/notes';
import { platformLabels, workErrorText } from '@/lib/work/rules';
import { suggestFor, withChapters } from '@/lib/studio/worklink';
import { newPhotoDoc, newVideoDoc } from '@/lib/studio/schema';
import { studioErrorText, type StudioApi } from '@/lib/studio/persist';
import type { Micros, WorkTextRef } from '@/lib/studio/schema';
import { useCaps } from '../caps';
import { assetRow, projectExports } from './library';
import { WORK_CHANGED, workChanged } from './work-bar';
import { Modal } from '../ui';

/** Which studio project each of these files came from (only for those who may open the studio). */
export function useStudioOrigins(assetIds: string[]): Map<string, string> {
  const account = useAccount();
  const caps = useCaps();
  const allowed = canOpenStudio(account) && caps.has(STUDIO_CAP);
  const key = assetIds.join(',');
  const [map, setMap] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!allowed || !key) return setMap(new Map());
    let live = true;
    void supabase()
      .from('studio_exports')
      .select('asset_id,project_id,created_at')
      .in('asset_id', key.split(','))
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!live) return;
        const m = new Map<string, string>();
        for (const r of (data ?? []) as { asset_id: string; project_id: string }[]) if (!m.has(r.asset_id)) m.set(r.asset_id, r.project_id);
        setMap(m);
      });
    return () => {
      live = false;
    };
  }, [allowed, key]);
  return map;
}

export function StudioOpenLink({ projectId }: { projectId: string }) {
  return (
    <Link href={`/motion/studio/${projectId}`} className="wk-btn sm quiet" title="فتح المشروع الذي صُدّر منه هذا الملف">
      <Clapperboard aria-hidden="true" />
      فتح في الاستوديو
    </Link>
  );
}

/**
 * «فتح في الاستوديو» on a work's page (MVP_draft.md 62.12), for those who may open the studio only: the work's
 * project when it has one (the latest, not archived), else a new project made for it by
 * studio_project_for_work, already linked, whose kind, shape and first template groups follow the work's type
 * and platforms (worklink.ts `suggestFor`).
 */
export function WorkStudioButton({ work, title, type, platforms }: { work: string; title: string; type: string; platforms: string[] }) {
  const account = useAccount();
  const caps = useCaps();
  const router = useRouter();
  const allowed = canOpenStudio(account) && caps.has(STUDIO_CAP);
  const [project, setProject] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!allowed) return;
    let live = true;
    void supabase()
      .from('studio_projects')
      .select('id')
      .eq('work_ref', work)
      .is('archived_at', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .then(({ data }) => live && setProject(((data ?? []) as { id: string }[])[0]?.id ?? null));
    return () => {
      live = false;
    };
  }, [allowed, work]);
  if (!allowed || project === undefined) return null;
  if (project)
    return (
      <Link href={`/motion/studio/${project}`} className="wk-btn sm st-work-open" title="فتح مشروع الاستوديو المرتبط بهذا العمل">
        <Clapperboard aria-hidden="true" />
        فتح في الاستوديو
      </Link>
    );
  const make = async () => {
    setBusy(true);
    setError(null);
    const s = suggestFor(type, platforms);
    const doc = { ...(s.kind === 'video' ? newVideoDoc(s.ratio, 30) : newPhotoDoc(s.photo.w, s.photo.h)), suggest: { categories: s.categories } };
    const { data, error: e } = await supabase().rpc('studio_project_for_work', { p_work: work, p_kind: s.kind, p_title: title.slice(0, 120), p_doc: doc });
    setBusy(false);
    if (e) return setError(studioErrorText(e.message));
    router.push(`/motion/studio/${String(data)}`);
  };
  return (
    <>
      <button type="button" className="wk-btn sm st-work-open" disabled={busy} onClick={() => void make()} title="مشروع جديد في الاستوديو مرتبط بهذا العمل، شكله من منصاته">
        <Clapperboard aria-hidden="true" />
        فتح في الاستوديو
      </button>
      {error && <span className="warning" role="alert">{error}</span>}
    </>
  );
}

export type WorkRow = { id: string; title: string; status: keyof typeof statusLabels };

/** The work a project belongs to, and linking it. */
export function useProjectWork(projectId: string, api: StudioApi) {
  const [workRef, setWorkRef] = useState<string | null>(null);
  const [work, setWork] = useState<WorkRow | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase().from('studio_projects').select('work_ref').eq('id', projectId).maybeSingle();
    const ref = (data as { work_ref: string | null } | null)?.work_ref ?? null;
    setWorkRef(ref);
    if (!ref) return setWork(null);
    const w = await supabase().from('works').select('id,title,status').eq('id', ref).maybeSingle();
    setWork((w.data as WorkRow | null) ?? null);
  }, [projectId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const again = () => void load();
    window.addEventListener(WORK_CHANGED, again);
    return () => window.removeEventListener(WORK_CHANGED, again);
  }, [load]);
  const link = useCallback(
    async (id: string | null) => {
      const r = await api.linkWork(projectId, id);
      if (r.ok) workChanged();
      return r.ok ? null : r.error;
    },
    [api, projectId],
  );
  return { workRef, work, link, reload: load };
}

/** Links a file saved from the studio to the project's work (the work cycle decides; its refusal is said). */
export async function linkFileToWork(work: string, asset: string): Promise<string | null> {
  const { error } = await supabase().rpc('work_asset_link', { p_work: work, p_asset: asset, p_add: true });
  if (!error) return null;
  if (/STATUS_DENIED/.test(error.message)) return 'العمل في حالة لا تقبل ملفات جديدة الآن، فبقي الملف في المكتبة دون ربط.';
  if (/FORBIDDEN/.test(error.message)) return 'لا تملك ربط ملفات بهذا العمل، فبقي الملف في المكتبة دون ربط.';
  return studioErrorText(error.message);
}

/** A note shown on the time ruler (MVP_draft.md 62.12): its moment in the project, open or done. */
export type NoteMark = { id: string; t: Micros; open: boolean; label: string };
/** Where a text clip came from: the work's main text or a platform's copy, at a version. */
export type TextFrom = WorkTextRef;
export type WorkTexts = { text: { n: number; body: string } | null; variants: Record<string, { n: number; body: string }> };

/** The work's latest text and each platform's latest copy (work_texts, work_variants; the work cycle's own reads). */
export function useWorkTexts(workRef: string | null): WorkTexts {
  const [texts, setTexts] = useState<WorkTexts>({ text: null, variants: {} });
  useEffect(() => {
    let live = true;
    if (!workRef) {
      setTexts({ text: null, variants: {} });
      return;
    }
    const load = async () => {
      const [t, v] = await Promise.all([
        supabase().from('work_texts').select('n,body').eq('work_id', workRef).order('n', { ascending: false }).limit(1),
        supabase().from('work_variants').select('platform,n,body').eq('work_id', workRef).order('n'),
      ]);
      if (!live) return;
      const variants: WorkTexts['variants'] = {};
      for (const r of (v.data ?? []) as { platform: string; n: number; body: string }[]) if (!variants[r.platform] || variants[r.platform].n < r.n) variants[r.platform] = { n: r.n, body: r.body };
      const top = ((t.data ?? []) as { n: number; body: string }[])[0] ?? null;
      setTexts({ text: top, variants });
    };
    void load();
    const again = () => void load();
    window.addEventListener('focus', again);
    window.addEventListener(WORK_CHANGED, again);
    return () => {
      live = false;
      window.removeEventListener('focus', again);
      window.removeEventListener(WORK_CHANGED, again);
    };
  }, [workRef]);
  return texts;
}

/** The latest version of the text a clip came from, when it is newer than the clip's («تغير نص العمل»). */
export function newerText(from: TextFrom | undefined, texts: WorkTexts): { n: number; body: string } | null {
  if (!from) return null;
  const now = from.part === 'text' ? texts.text : texts.variants[from.part.replace(/^v:/, '')];
  return now && now.n > from.n ? now : null;
}

/**
 * «إضافة الفصول إلى نسخة يوتيوب» (MVP_draft.md 62.12): a new version of the work's YouTube copy with the
 * project's chapter lines, after a confirmation that shows it. The work cycle's own work_text_save writes it,
 * so the copy's rules hold (the work's YouTube account, who may write, an approved work back to review).
 */
export function ChaptersToWork({ workRef, lines, ready, current, readOnly }: { workRef: string; lines: string; ready: boolean; current: { n: number; body: string } | null; readOnly: boolean }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const body = withChapters(current?.body ?? '', lines);
  const save = async () => {
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase().rpc('work_text_save', { p_work: workRef, p_target: 'youtube', p_body: body, p_note: 'فصول من الاستوديو' });
    setBusy(false);
    if (e) return setError(workErrorText(e.message));
    const r = (data ?? {}) as { n?: number; reopened?: boolean };
    setAsking(false);
    setDone(`حُفظت نسخة يوتيوب في العمل، الإصدار ${r.n ?? ''}${r.reopened ? '، وعاد العمل إلى المراجعة لأنه كان معتمداً' : ''}.`);
    workChanged();
  };
  return (
    <>
      <button type="button" className="st-mini st-chapters-work" disabled={readOnly || !ready} onClick={() => (setDone(null), setError(null), setAsking(true))}>
        <Clapperboard aria-hidden="true" />
        إضافة الفصول إلى نسخة يوتيوب
      </button>
      {done && <p className="st-hint" role="status">{done}</p>}
      {asking && (
        <Modal title="إضافة الفصول إلى نسخة يوتيوب" onClose={() => !busy && setAsking(false)}>
          <div className="st-form">
            <p>
              يُحفظ إصدار جديد من نسخة يوتيوب في العمل {workRef}{current ? ` بعد الإصدار ${current.n}` : ''}، ويبقى ما قبله مسجلاً.
              {current ? ' تحل الفصول محل فصول سابقة في آخر النسخة، أو تُضاف بعدها.' : ''} إن كان العمل معتمداً أو مجدولاً عاد إلى المراجعة.
            </p>
            <textarea readOnly value={body} rows={Math.min(12, body.split('\n').length + 1)} dir="auto" aria-label="نسخة يوتيوب بعد الإضافة" />
            {error && <p className="warning" role="alert">{error}</p>}
            <div className="actions">
              <button type="button" className="primary" disabled={busy} onClick={() => void save()}>
                حفظ إصدار جديد
              </button>
              <button type="button" disabled={busy} onClick={() => setAsking(false)}>
                إلغاء
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

type ExportRow = { asset_id: string; version: number; revision: number; created_at: string; shape?: string | null };
type FileGroup = { id: string; name: string; version: number; exports: ExportRow[] };

/**
 * «المراجعة» in the studio (MVP_draft.md 62.12): the work, the files saved from the project with their
 * notes by version, answers and «تم», and the work's texts to put on the timeline. Its window stays open
 * while other windows are used, so it reads again when it comes into view, after an export (`refreshKey`)
 * and on «تحديث»; it hands the open notes with a time to the editor for the time ruler (`onNotes`).
 */
export function ReviewPanel({
  projectId, api, readOnly, onSeek, pw, refreshKey = 0, revision = 0, onNotes, onInsertText, texts,
}: {
  projectId: string;
  api: StudioApi;
  readOnly: boolean;
  onSeek?: (t: Micros) => void;
  pw: ReturnType<typeof useProjectWork>;
  refreshKey?: number;
  /** The project's latest numbered revision: an export from an older one is said to be older. */
  revision?: number;
  onNotes?: (marks: NoteMark[]) => void;
  onInsertText?: (body: string, from: TextFrom) => void;
  texts?: WorkTexts;
}) {
  const root = useRef<HTMLDetailsElement>(null);
  const [shown, setShown] = useState(0);
  const [again, setAgain] = useState(0);
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
  const [works, setWorks] = useState<WorkRow[]>([]);
  const [pick, setPick] = useState('');
  const [files, setFiles] = useState<FileGroup[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [openOnly, setOpenOnly] = useState(false);
  const [answering, setAnswering] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const rpc = useCallback((fn: string, args: Record<string, unknown>) => supabase().rpc(fn, args), []);

  useEffect(() => {
    let live = true;
    void supabase()
      .from('works')
      .select('id,title,status')
      .is('closed_at', null)
      .order('updated_at', { ascending: false })
      .limit(60)
      .then(({ data }) => live && setWorks((data ?? []) as WorkRow[]));
    void projectExports(projectId).then(async (rows) => {
      const groups = new Map<string, FileGroup>();
      for (const r of rows as ExportRow[]) {
        if (!groups.has(r.asset_id)) {
          const a = await assetRow(r.asset_id);
          if (!a) continue;
          groups.set(r.asset_id, { id: a.id, name: a.name, version: a.current_version, exports: [] });
        }
        groups.get(r.asset_id)!.exports.push(r);
      }
      const list = [...groups.values()];
      if (!live) return;
      setFiles(list);
      if (!list.length) return setNotes([]);
      const { data } = await supabase().from('media_notes').select(NOTE_COLUMNS).in('asset_id', list.map((f) => f.id)).order('created_at', { ascending: true });
      const ns = ((data ?? []) as Note[]).map((n) => ({ ...n, version: n.version ?? null, at_ms: n.at_ms ?? null, area: n.area ?? null, parent_id: n.parent_id ?? null, done_at: n.done_at ?? null, done_by: n.done_by ?? null }));
      if (!live) return;
      setNotes(ns);
      const authors = [...new Set(ns.map((n) => n.author))];
      if (authors.length) {
        const acc = await supabase().from('accounts').select('email,display_name').in('email', authors);
        if (live) setNames(Object.fromEntries(((acc.data ?? []) as { email: string; display_name: string }[]).map((a) => [a.email, a.display_name])));
      }
    });
    return () => {
      live = false;
    };
  }, [projectId, refreshKey, shown, again]);

  // the open notes with a time, for the time ruler
  useEffect(() => {
    onNotes?.(notes.filter((n) => !n.parent_id && noteMs(n) !== null).map((n) => ({ id: n.id, t: noteMs(n)! * 1000, open: !n.done_at, label: n.body })));
  }, [notes]); // eslint-disable-line react-hooks/exhaustive-deps

  const who = (email: string) => names[email] ?? email.split('@')[0];
  const done = async (n: Note) => {
    setError(await setNoteDone(rpc, n.id, !n.done_at));
    setAgain((x) => x + 1);
  };
  const reply = async (n: Note) => {
    const r = await addNote(rpc, { asset: n.asset_id, body: answer.trim(), parent: n.id });
    if ('error' in r) return setError(r.error);
    setAnswer('');
    setAnswering(null);
    setAgain((x) => x + 1);
  };
  const revisionOf = (f: FileGroup, version: number | null) => f.exports.find((e) => e.version === version)?.revision ?? null;

  return (
    <details className="st-sec st-review" open ref={root}>
      <summary>المراجعة</summary>
      <div className="st-sec-body">
        <button type="button" className="st-mini st-review-refresh" onClick={() => (setAgain((x) => x + 1), void pw.reload())} title="قراءة الملاحظات والعمل من جديد">
          <RefreshCw aria-hidden="true" />
          تحديث
        </button>
        {pw.workRef ? (
          <p className="st-hint">
            العمل: <Link href={`/work/${pw.workRef}`}>{pw.workRef}</Link>
            {pw.work ? ` · ${pw.work.title} · ${statusLabels[pw.work.status] ?? ''}` : ''}
            {!readOnly && (
              <>
                {' · '}
                <button type="button" className="st-linkish" onClick={async () => setError(await pw.link(null))}>
                  فك الربط
                </button>
              </>
            )}
          </p>
        ) : (
          <>
            <label>
              ربط المشروع بعمل
              <select value={pick} onChange={(e) => setPick(e.target.value)} disabled={readOnly || !works.length}>
                <option value="">{works.length ? 'اختر عملاً' : 'لا أعمال مفتوحة تراها'}</option>
                {works.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.id} · {w.title}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="st-mini" disabled={readOnly || !pick} onClick={async () => setError(await pw.link(pick))}>
              ربط
            </button>
          </>
        )}
        {pw.workRef && texts && onInsertText && (texts.text || Object.keys(texts.variants).length > 0) && (
          <div className="st-worktexts">
            <b className="st-sub">نصوص العمل</b>
            {texts.text && (
              <button type="button" className="st-mini" disabled={readOnly} onClick={() => onInsertText(texts.text!.body, { work: pw.workRef!, part: 'text', n: texts.text!.n })}>
                <TypeIcon aria-hidden="true" />
                إدراج نص العمل (الإصدار {texts.text.n})
              </button>
            )}
            {Object.entries(texts.variants).map(([pl, v]) => (
              <button key={pl} type="button" className="st-mini" disabled={readOnly} onClick={() => onInsertText(v.body, { work: pw.workRef!, part: `v:${pl}`, n: v.n })}>
                <TypeIcon aria-hidden="true" />
                إدراج نسخة {platformLabels[pl] ?? pl} (الإصدار {v.n})
              </button>
            ))}
          </div>
        )}
        {error && <p className="warning" role="alert">{error}</p>}
        {files.length ? (
          <>
            <b className="st-sub">ما حُفظ من المشروع في المكتبة</b>
            <ul className="st-files">
              {files.map((f) => (
                <li key={f.id}>
                  <Link href={`/media/${f.id}`} dir="auto">
                    {f.name}
                  </Link>{' '}
                  <small>الإصدار {f.version}</small>
                </li>
              ))}
            </ul>
            <label className="st-switch-row">
              <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
              المفتوحة فقط
            </label>
            {files.map((f) => {
              const mine = notes.filter((n) => n.asset_id === f.id && !n.parent_id && (!openOnly || !n.done_at));
              const versions = [...new Set(mine.map((n) => n.version))].sort((a, b) => (b ?? 0) - (a ?? 0));
              return (
                <section key={f.id} className="st-notes-file">
                  <b className="st-sub">
                    <MessageSquareText aria-hidden="true" /> ملاحظات المراجعة على «{f.name}»
                  </b>
                  {!mine.length && <p className="st-hint">لا ملاحظات{openOnly ? ' مفتوحة' : ''} بعد. يكتبها المراجعون في شاشة المراجعة، وتظهر هنا بأوقاتها.</p>}
                  {versions.map((v) => {
                    const rev = revisionOf(f, v);
                    return (
                      <div key={String(v)} className="st-notes-version">
                        <small className="st-notes-vlabel">
                          {v ? `الإصدار ${v}` : 'دون إصدار'}
                          {rev ? ` · من النسخة ${rev}` : ''}
                          {rev && rev < revision ? ' · تغيّر المشروع بعد هذا التصدير، فقد لا تطابق الأوقاتُ الحالَ الحالية' : ''}
                        </small>
                        <ul className="st-notes">
                          {mine
                            .filter((n) => n.version === v)
                            .map((n) => {
                              const ms = noteMs(n);
                              const answers = notes.filter((x) => x.parent_id === n.id);
                              return (
                                <li key={n.id} data-open={n.done_at ? 'no' : 'yes'}>
                                  <div className="st-note-row">
                                    {ms !== null && (
                                      <button type="button" className="st-tc" dir="ltr" onClick={() => onSeek?.(ms * 1000)} disabled={!onSeek} title="إلى هذا الوقت في الخط الزمني">
                                        {n.at_ms !== null ? noteTime(n.at_ms) : n.timecode}
                                      </button>
                                    )}
                                    <span dir="auto">{n.body}</span>
                                    {n.area && <span className="st-chip" title="ملاحظة على منطقة من الصورة">منطقة</span>}
                                  </div>
                                  <small className="st-note-by">
                                    {who(n.author)}
                                    {n.done_at ? ` · تم بيد ${who(n.done_by ?? '')}` : ''}
                                  </small>
                                  <div className="st-note-acts">
                                    <button type="button" className="st-linkish" onClick={() => void done(n)}>
                                      {n.done_at ? 'فتحها من جديد' : 'تم'}
                                    </button>
                                    <button type="button" className="st-linkish" onClick={() => (setAnswering(answering === n.id ? null : n.id), setAnswer(''))}>
                                      رد
                                    </button>
                                  </div>
                                  {answers.length > 0 && (
                                    <ul className="st-note-answers">
                                      {answers.map((a) => (
                                        <li key={a.id}>
                                          <span dir="auto">{a.body}</span> <small>· {who(a.author)}</small>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                  {answering === n.id && (
                                    <form
                                      className="st-note-answer"
                                      onSubmit={(e) => {
                                        e.preventDefault();
                                        if (answer.trim()) void reply(n);
                                      }}
                                    >
                                      <input value={answer} maxLength={500} dir="auto" aria-label="الرد" placeholder="اكتب ردك" onChange={(e) => setAnswer(e.target.value)} autoFocus />
                                      <button type="submit" className="st-mini" disabled={!answer.trim()}>إرسال</button>
                                    </form>
                                  )}
                                </li>
                              );
                            })}
                        </ul>
                      </div>
                    );
                  })}
                </section>
              );
            })}
          </>
        ) : (
          <p className="st-hint">لم يُحفظ من المشروع ملف في المكتبة بعد. احفظ تصديراً في المكتبة، ثم تظهر هنا ملاحظات مراجعته.</p>
        )}
      </div>
    </details>
  );
}

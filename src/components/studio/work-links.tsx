'use client';

// The studio and the work cycle (MVP_draft.md 62, Studio_Build_Plan.md Phase 7):
//   - the work page offers «فتح في الاستوديو» on a file a studio project exported, to those who may open
//     the studio (studio_exports has a read policy for them alone, so nobody else even learns the link);
//   - a project can belong to a work (studio_project_link_work), and a file it saves to the library can be
//     linked to that work (the work cycle's own work_asset_link, with its rules);
//   - the studio shows the work's status and the timed review notes written on its exported file
//     (media_notes.timecode, section 59.6), and a note's time moves the playhead there.
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Clapperboard, MessageSquareText, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { canOpenStudio, STUDIO_CAP } from '@/lib/access';
import { useAccount } from '@/lib/account-context';
import { statusLabels } from '@/lib/domain';
import { parseMmSs } from '@/lib/studio/time';
import { studioErrorText, type StudioApi } from '@/lib/studio/persist';
import type { Micros } from '@/lib/studio/schema';
import { useCaps } from '../caps';
import { assetRow, projectExports } from './library';

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
  const link = useCallback(
    async (id: string | null) => {
      const r = await api.linkWork(projectId, id);
      if (r.ok) await load();
      return r.ok ? null : r.error;
    },
    [api, load, projectId],
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

type Note = { id: string; author: string; body: string; timecode: string | null; created_at: string };

/**
 * «المراجعة» in the studio: the work, the files saved from the project, and their timed notes. Its window
 * stays open while other windows are used, so it reads again when it comes into view, after an export
 * to the library (`refreshKey`), and on «تحديث».
 */
export function ReviewPanel({ projectId, api, readOnly, onSeek, pw, refreshKey = 0 }: { projectId: string; api: StudioApi; readOnly: boolean; onSeek?: (t: Micros) => void; pw: ReturnType<typeof useProjectWork>; refreshKey?: number }) {
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
  const [files, setFiles] = useState<{ id: string; name: string; version: number }[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [error, setError] = useState<string | null>(null);
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
      const seen = new Set<string>();
      const out: { id: string; name: string; version: number }[] = [];
      for (const r of rows) {
        if (seen.has(r.asset_id)) continue;
        seen.add(r.asset_id);
        const a = await assetRow(r.asset_id);
        if (a) out.push({ id: a.id, name: a.name, version: a.current_version });
      }
      if (!live) return;
      setFiles(out);
      if (out[0]) {
        const { data } = await supabase().from('media_notes').select('id,author,body,timecode,created_at').eq('asset_id', out[0].id).order('created_at', { ascending: true });
        if (live) setNotes((data ?? []) as Note[]);
      }
    });
    return () => {
      live = false;
    };
  }, [projectId, refreshKey, shown, again]);

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
            <b className="st-sub">
              <MessageSquareText aria-hidden="true" /> ملاحظات المراجعة على «{files[0].name}»
            </b>
            {notes.length ? (
              <ul className="st-notes">
                {notes.map((n) => (
                  <li key={n.id}>
                    {n.timecode ? (
                      <button type="button" className="st-tc" dir="ltr" onClick={() => onSeek?.(parseMmSs(n.timecode!) ?? 0)} disabled={!onSeek} title="إلى هذا الوقت في الخط الزمني">
                        {n.timecode}
                      </button>
                    ) : null}
                    <span dir="auto">{n.body}</span>
                    <small>{n.author.split('@')[0]}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="st-hint">لا ملاحظات بعد. يكتبها المراجعون في شاشة المراجعة، وتظهر هنا بأوقاتها.</p>
            )}
            <p className="st-hint">الملاحظات على الملف كله لا على إصدار بعينه، فقد تخص إصداراً سابقاً.</p>
          </>
        ) : (
          <p className="st-hint">لم يُحفظ من المشروع ملف في المكتبة بعد. احفظ تصديراً في المكتبة، ثم تظهر هنا ملاحظات مراجعته.</p>
        )}
      </div>
    </details>
  );
}

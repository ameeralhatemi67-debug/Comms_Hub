'use client';

// The work in the studio's title row (MVP_draft.md 62.12): the linked work's number and title, its status,
// the date of its current stage, its delivery date and its publish time in plain words, read again when the
// page comes back into view, every minute, and after an export («studio-work-changed»). When the work needs
// changes it shows the request; when it is approved or scheduled it says that a new version sends it back
// to review. Its actions (sending to review, an extension, a reminder) are given by the editor.
import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Briefcase, CircleAlert, CalendarClock } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { riyadhToday, statusLabels, type WorkStatus } from '@/lib/work/rules';
import { LIVE_AFTER, currentStage, dayWords, type StageFacts, type WorkFacts } from '@/lib/studio/worklink';

export const WORK_CHANGED = 'studio-work-changed';
/** Tells the work bar (and anything reading the work) to read it again. */
export const workChanged = () => window.dispatchEvent(new Event(WORK_CHANGED));

export type LinkedWork = { work: WorkFacts; stages: StageFacts[]; changes: { note: string | null; at: string } | null };

/** The work a project belongs to, read again on focus, every minute and after an export. */
export function useLinkedWork(projectId: string): { workRef: string | null; linked: LinkedWork | null; reload: () => void } {
  const [workRef, setWorkRef] = useState<string | null>(null);
  const [linked, setLinked] = useState<LinkedWork | null>(null);
  const load = useCallback(async () => {
    const db = supabase();
    const p = await db.from('studio_projects').select('work_ref').eq('id', projectId).maybeSingle();
    const ref = (p.data as { work_ref: string | null } | null)?.work_ref ?? null;
    setWorkRef(ref);
    if (!ref) return setLinked(null);
    const [w, s, d] = await Promise.all([
      db.from('works').select('id,title,type,status,due,proposed_at,sched_at,channels,assignee').eq('id', ref).maybeSingle(),
      db.from('work_stages').select('id,pos,name,who,due_on,started_at,done_at,gate,gate_at').eq('work_id', ref).order('pos'),
      db.from('work_decisions').select('note,decided_at').eq('work_id', ref).eq('op', 'changes').order('decided_at', { ascending: false }).limit(1),
    ]);
    if (!w.data) return setLinked(null);
    const last = ((d.data ?? []) as { note: string | null; decided_at: string }[])[0];
    setLinked({ work: w.data as WorkFacts, stages: (s.data ?? []) as StageFacts[], changes: last ? { note: last.note, at: last.decided_at } : null });
  }, [projectId]);
  useEffect(() => {
    void load();
    const again = () => void load();
    const vis = () => document.visibilityState === 'visible' && again();
    window.addEventListener('focus', again);
    window.addEventListener(WORK_CHANGED, again);
    document.addEventListener('visibilitychange', vis);
    const t = setInterval(again, 60_000);
    return () => {
      window.removeEventListener('focus', again);
      window.removeEventListener(WORK_CHANGED, again);
      document.removeEventListener('visibilitychange', vis);
      clearInterval(t);
    };
  }, [load]);
  return { workRef, linked, reload: () => void load() };
}

const when = (iso: string) => new Intl.DateTimeFormat('ar-SA-u-nu-latn', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' }).format(new Date(iso));

export function WorkBar({ linked, actions }: { linked: LinkedWork; actions?: ReactNode }) {
  const { work: w, stages, changes } = linked;
  const today = riyadhToday();
  const stage = currentStage(stages);
  const publish = w.sched_at ?? w.proposed_at;
  return (
    <div className="st-workbar" role="region" aria-label="العمل المرتبط">
      <div className="st-workbar-row">
        <Briefcase aria-hidden="true" />
        <Link href={`/work/${w.id}`} className="st-workbar-title">
          <bdi dir="ltr">{w.id}</bdi> · {w.title}
        </Link>
        <span className={`chip status-${w.status}`}>{statusLabels[w.status as WorkStatus] ?? w.status}</span>
        {stage?.due_on && (
          <span className="st-workbar-date" data-late={stage.due_on < today ? 'yes' : 'no'}>
            <CalendarClock aria-hidden="true" />
            {stage.name}: {dayWords(stage.due_on, today)}
          </span>
        )}
        {w.due && <span className="st-workbar-date" data-late={w.due < today ? 'yes' : 'no'}>التسليم: {dayWords(w.due, today)}</span>}
        {publish && <span className="st-workbar-date">{w.sched_at ? 'يُنشر' : 'النشر المقترح'}: {when(publish)}</span>}
        {actions && <span className="st-workbar-acts">{actions}</span>}
      </div>
      {w.status === 'CHANGES_REQUESTED' && (
        <p className="st-workbar-note" data-kind="changes" role="note">
          <CircleAlert aria-hidden="true" />
          بحاجة إلى تعديل{changes?.note ? `: ${changes.note}` : ''}. الملاحظات على الوقت في نافذة «المراجعة».
        </p>
      )}
      {LIVE_AFTER.includes(w.status) && (
        <p className="st-workbar-note" role="note">
          العمل {statusLabels[w.status as WorkStatus]}: أي إصدار جديد لملفه يعيده إلى «قيد المراجعة».
        </p>
      )}
    </div>
  );
}

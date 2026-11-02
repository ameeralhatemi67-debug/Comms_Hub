// What waits for a writer, and what a review compares (MVP_draft.md 68.1, 68.6). One list instead of three places: stages,
// what came back from review, copies older than the text, and the library's requests for a title and description. Home and
// the «الكتابة» tab both read it. Pure.
import { fdate, lateStages, platformLabels, stageState, stageStateLabels, statusLabels, type Platform, type StageRow, type WorkRow } from '../work/rules.ts';
import type { TaskItem } from '../work/planning.ts';

export type CopyMark = { work_id: string; platform: string; n: number; base: number };
export type WriteGroup = 'back' | 'late' | 'ready' | 'copies' | 'library';
export const WRITE_GROUPS: [WriteGroup, string][] = [
  ['back', 'عاد إليك'],
  ['late', 'متأخر'],
  ['ready', 'جاهز للكتابة'],
  ['copies', 'نسخ تحتاج مراجعة'],
  ['library', 'عناوين وأوصاف'],
];
export type WriteRow = { group: WriteGroup; key: string; work: string | null; title: string; line: string; chip: string; tone: '' | 'warn' | 'late'; href: string };

/** The newest copy of each platform that is older than the newest text. */
export function staleCopies(work: string, latest: number, copies: CopyMark[]): string[] {
  const newest = new Map<string, CopyMark>();
  for (const c of copies) if (c.work_id === work && (newest.get(c.platform)?.n ?? 0) < c.n) newest.set(c.platform, c);
  return [...newest.values()].filter((c) => c.base < latest).map((c) => c.platform);
}

type WorkIn = { w: Pick<WorkRow, 'id' | 'title' | 'status' | 'closed_at' | 'assignee' | 'due' | 'created_by' | 'people'> & Partial<WorkRow>; stages: StageRow[]; flags: number };
export type WriteTask = Pick<TaskItem, 'id' | 'what' | 'kind' | 'assignee' | 'status' | 'due'> & { asset_id?: string | null };

export function writingQueue({ items, tasks, latest, copies, me, today, nameOf }: { items: WorkIn[]; tasks: WriteTask[]; latest: Record<string, number>; copies: CopyMark[]; me: string; today: string; nameOf: (e: string | null) => string }): WriteRow[] {
  const out: WriteRow[] = [];
  for (const { w, stages, flags } of items) {
    if (w.closed_at || !['DRAFT', 'IN_PRODUCTION', 'CHANGES_REQUESTED', 'REJECTED'].includes(w.status)) continue;
    const owner = w.assignee === me;
    const mine = stages.map((s, i) => ({ s, i })).filter(({ s }) => s.who === me && s.role === 'writer' && !s.done_at);
    if (!owner && !mine.length) continue;
    const n = latest[w.id] ?? 0;
    const stale = staleCopies(w.id, n, copies);
    const lead = owner ? '' : ` · المسؤول ${nameOf(w.assignee)}`;
    const row = (group: WriteGroup, line: string, chip: string, tone: WriteRow['tone'], tab = '1'): WriteRow => ({ group, key: w.id, work: w.id, title: w.title, line, chip, tone, href: `/work/${w.id}?write=${tab}` });
    const copyWords = stale.length ? ` · ${stale.length === 1 ? `نسخة ${platformLabels[stale[0] as Platform] ?? stale[0]} تحتاج مراجعة` : `${stale.length} نسخ تحتاج مراجعة`}` : '';
    if (w.status === 'CHANGES_REQUESTED' || w.status === 'REJECTED') {
      out.push(row('back', `${flags ? `أجزاء عادت: ${flags}` : 'عاد من المراجعة'}${lead}${copyWords}`, statusLabels[w.status], 'warn'));
      continue;
    }
    const late = lateStages(w as never, stages, today).filter((s) => s.who === me && s.role === 'writer');
    const ready = mine.filter(({ i }) => stageState(stages, i) !== 'waiting');
    if (late.length) out.push(row('late', `مرحلة «${late[0].name}»${lead}${copyWords}`, 'متأخرة', 'late'));
    else if (ready.length) out.push(row('ready', `مرحلة «${ready[0].s.name}»${lead}${copyWords}`, stageStateLabels[stageState(stages, ready[0].i)], ''));
    else if (owner && !n) out.push(row('ready', 'لم يُكتب النص بعد', statusLabels[w.status], ''));
    else if (stale.length) out.push(row('copies', copyWords.slice(3), 'نسخة', 'warn', stale[0]));
  }
  for (const t of tasks)
    if (t.kind === 'copy' && t.assignee === me && t.status === 'open')
      out.push({ group: 'library', key: t.id, work: null, title: t.what, line: `موعدها ${fdate(t.due.slice(0, 10))}`, chip: 'مهمة', tone: t.due.slice(0, 10) < today ? 'late' : '', href: t.asset_id ? `/media/${t.asset_id}?copy=1` : '/tasks' });
  const order = WRITE_GROUPS.map((g) => g[0]);
  return out.map((r, i) => ({ r, i })).sort((a, b) => order.indexOf(a.r.group) - order.indexOf(b.r.group) || a.i - b.i).map((x) => x.r);
}

/** «تابع الكتابة» on Home: what holds a draft, or else what is first. */
export const resumeRow = (rows: WriteRow[], hasDraft: (work: string) => boolean) => rows.find((r) => r.work && hasDraft(r.work)) ?? rows.find((r) => r.work && r.group !== 'copies') ?? null;

type Versioned = { n: number; body: string };
export type BaseInput = {
  part: { key: string; kind: string; ver: string; snap?: string | null };
  approvals: { part: string; snap: string | null }[];
  flags: { part: string; ver: string }[];
  texts: Versioned[];
  variants: (Versioned & { platform: string })[];
  cycles: { n: number; text_n?: number | null }[];
  cycle: number | null;
};
/** What a text or copy is compared with in a round: the approved wording, or the version that came back, or the version sent the
 *  round before. Null when this is the first the reviewer has seen of it. */
export function reviewBase({ part, approvals, flags, texts, variants, cycles, cycle }: BaseInput): { body: string; label: string } | null {
  const snap = part.snap ?? '';
  const differs = (b: string | null | undefined): b is string => !!b && b !== snap;
  const approved = approvals.find((a) => a.part === part.key)?.snap;
  if (differs(approved)) return { body: approved, label: 'ما تغيّر منذ الإصدار المعتمد:' };
  const versions: Versioned[] = part.kind === 'text' ? texts : variants.filter((v) => `v:${v.platform}` === part.key);
  const flag = flags.find((f) => f.part === part.key);
  if (flag && flag.ver !== part.ver) {
    const back = versions.find((v) => v.n === Number(flag.ver.slice(1)))?.body;
    if (differs(back)) return { body: back, label: 'ما تغيّر منذ طلب التعديل:' };
  }
  if (part.kind === 'text') {
    const before = cycles.filter((c) => c.n < (cycle ?? Infinity) && c.text_n != null && `t${c.text_n}` !== part.ver).sort((a, b) => b.n - a.n)[0];
    const sent = before && versions.find((v) => v.n === before.text_n)?.body;
    if (differs(sent)) return { body: sent, label: 'ما تغيّر منذ الدورة السابقة:' };
  }
  return null;
}

// Review notes on library files (MVP_draft.md 59.6, 62.12, 62.13): written through media_note_add, which
// records the file version a note was written on, its exact time and, when wanted, an area of the frame,
// and answers (one level); «تم» through media_note_done. The table stays readable to those who may see the
// file (row level security). Pure apart from the database caller passed in.

export type NoteArea = { x: number; y: number; w: number; h: number };
export type Note = {
  id: string;
  asset_id: string;
  author: string;
  body: string;
  timecode: string | null;
  created_at: string;
  version: number | null;
  at_ms: number | null;
  area: NoteArea | null;
  parent_id: string | null;
  done_at: string | null;
  done_by: string | null;
};
export const NOTE_COLUMNS = 'id,asset_id,author,body,timecode,created_at,version,at_ms,area,parent_id,done_at,done_by';

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

const ERRORS: Record<string, string> = {
  FORBIDDEN: 'لا تملك أن تفعل هذا في هذه الملاحظة.',
  NOT_FOUND: 'لم تعد الملاحظة موجودة.',
  NOTE_INVALID: 'نص الملاحظة من حرف إلى 500 حرف، والمنطقة داخل الصورة، ولا رد على رد.',
  VERSION_INVALID: 'لا يوجد هذا الإصدار من الملف.',
};
export function noteErrorText(message: string | null | undefined): string {
  for (const m of (message ?? '').matchAll(/\b([A-Z][A-Z_]{3,})\b/g)) if (ERRORS[m[1]]) return ERRORS[m[1]];
  return 'تعذّر حفظ الملاحظة. أعد المحاولة.';
}

/** Milliseconds of a «دقيقة:ثانية» timecode, or null. */
export function msOfTimecode(tc: string | null | undefined): number | null {
  const m = (tc ?? '').trim().match(/^(\d{1,2}):([0-5]\d)$/);
  return m ? (Number(m[1]) * 60 + Number(m[2])) * 1000 : null;
}

/** «دقيقة:ثانية.جزء» of a time in milliseconds, for display: 01:05.2. */
export function noteTime(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = (s % 60).toFixed(1).padStart(4, '0');
  return `${mm}:${ss}`;
}

/** A note's moment in milliseconds: its exact time, else its older minutes and seconds. */
export const noteMs = (n: Pick<Note, 'at_ms' | 'timecode'>) => n.at_ms ?? msOfTimecode(n.timecode);

export async function addNote(rpc: Rpc, p: { asset: string; body: string; atMs?: number | null; version?: number | null; area?: NoteArea | null; parent?: string | null }): Promise<{ id: string } | { error: string }> {
  const { data, error } = await rpc('media_note_add', {
    p_asset: p.asset,
    p_body: p.body,
    p_at_ms: p.atMs ?? null,
    p_version: p.version ?? null,
    p_area: p.area ?? null,
    p_parent: p.parent ?? null,
  });
  return error ? { error: noteErrorText(error.message) } : { id: String(data) };
}

export async function setNoteDone(rpc: Rpc, id: string, done: boolean): Promise<string | null> {
  const { error } = await rpc('media_note_done', { p_note: id, p_done: done });
  return error ? noteErrorText(error.message) : null;
}

/** An area dragged on a picture, as fractions of it, kept inside it. */
export function areaOf(a: { x: number; y: number }, b: { x: number; y: number }): NoteArea | null {
  const c = (v: number) => Math.max(0, Math.min(1, v));
  const [ax, ay, bx, by] = [c(a.x), c(a.y), c(b.x), c(b.y)];
  const x = Math.min(ax, bx);
  const y = Math.min(ay, by);
  const w = Math.abs(ax - bx);
  const h = Math.abs(ay - by);
  return w > 0.01 && h > 0.01 ? { x: round(x), y: round(y), w: round(w), h: round(h) } : null;
}
const round = (v: number) => Math.round(v * 10000) / 10000;

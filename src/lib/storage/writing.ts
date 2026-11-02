// The server half of the writing documents (Writing_Build_Plan.md, W-1 to W-9): what every route under
// /api/writing shares. The routes decide who is asking; the database decides who may, in work_doc_prepare before
// anything reaches the provider, and again in the function that records it. Nothing here logs a body, a token or a
// reference. The folders are Comms Hub/مستندات الكتابة/<CH-10 العنوان>/{الحالي,الإصدارات,مسودات,صور}; the site tracks
// their ids, never their names.
import { createHash } from 'node:crypto';
import { cleanName } from '../drive/media.ts';
import { workErrorText } from '../work/rules.ts';
import { StorageError, type StorageProvider } from './provider.ts';

export const WORK_ID = /^CH-[0-9]{1,6}$/;
export const IMAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_WORD_BYTES = 20 * 1024 * 1024;
export const IMAGE_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const WORD_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export type Rpc = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
export type WorkDocs = {
  work_id: string;
  folder_ref: string;
  current_ref: string;
  versions_ref: string;
  drafts_ref: string;
  images_ref: string;
  word_ref: string | null;
  word_n: number | null;
  pdf_ref: string | null;
  pdf_n: number | null;
  text_ref: string | null;
};
/** What work_doc_prepare answers. */
export type Prepared = { title: string; latest: number | null; next: number; checksum: string | null; docs: WorkDocs | null };

type Copy = { integration_id: string; type: string; config: Record<string, unknown>; ref: string };
type Commit = { n: number; reopened: boolean; prune: string[]; copies: Copy[]; draft: string | null };

export type WritingDeps = {
  db: Rpc;
  storage: Pick<StorageProvider, 'markedFolder' | 'createFolder' | 'putSmall' | 'update' | 'trash'>;
  /** The site's server key. */
  key: string;
  /** Sends what the database let go of to the trash. Never throws. */
  trashAll: (copies: Copy[], refs: string[]) => Promise<void>;
  now?: () => Date;
};

/** The database refused: its message carries the code. */
export class Refused extends Error {}

const quiet = (p: Promise<unknown>) => p.catch(() => undefined);
const encode = (text: string) => new TextEncoder().encode(text);

// ---------------------------------------------------------------------------
// Bytes and names
// ---------------------------------------------------------------------------
/** The sha256 of a checked document's JSON: checkDoc builds every object in a fixed order, so equal documents are equal text. */
export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/** The picture type the bytes themselves say, or null. An SVG is text, so it never matches. */
export function sniffImage(b: Uint8Array): string | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return 'image/gif';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

/** A Word file is a zip. */
export const isDocx = (b: Uint8Array) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

/** `v003 2026-11-02.json`, in Riyadh's date. */
export const masterName = (n: number, at: Date) =>
  `v${String(n).padStart(3, '0')} ${at.toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' })}.json`;

/** `CH-10 العنوان.docx`, safe as a file name. */
export const workFileName = (id: string, title: string, ext: 'docx' | 'pdf' | 'txt') => `${cleanName(`${id} ${title}`).slice(0, 190)}.${ext}`;

/** A draft's name says nothing about whose it is. */
export const draftName = (email: string) => `مسودة ${sha256(email).slice(0, 8)}.json`;

/** The body of a request up to `max` bytes, or null above it. */
export async function readCapped(request: Request, max: number): Promise<Uint8Array | null> {
  if (Number(request.headers.get('content-length') ?? 0) > max) return null;
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await quiet(reader.cancel());
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------
const code = (message: string | null | undefined) => /[A-Z][A-Z_]{2,}/.exec(message ?? '')?.[0] ?? 'FAILED';

const STATUS: Record<string, number> = {
  FORBIDDEN: 403,
  NO_CHANGE: 409,
  STATUS_DENIED: 409,
  WRITER_LOCKED: 409,
  EXPORT_STALE: 409,
  TEXT_TOO_LONG: 413,
};

/** The database's refusal as an answer: in Arabic for the person, and its code for the page. */
export function refusal(message: string | null | undefined): Response {
  const c = code(message);
  return Response.json({ error: workErrorText(message), code: c }, { status: STATUS[c] ?? 400, headers: { 'Cache-Control': 'no-store' } });
}

/** The same safety headers as a library file: a stored file never runs from the Hub's own address. */
export function fileHeaders(mime: string, name: string, disposition: 'attachment' | 'inline', extra: Record<string, string> = {}): Headers {
  return new Headers({
    'Content-Type': mime,
    'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'",
    'Cache-Control': 'private, no-store',
    ...extra,
  });
}

/** The rule check every write starts with: nothing reaches the provider for someone who may not write. */
export async function prepare(db: Rpc, id: string, op: 'save' | 'export'): Promise<Prepared> {
  const { data, error } = await db.rpc('work_doc_prepare', { p_work: id, p_op: op });
  if (error) throw new Refused(error.message);
  return data as Prepared;
}

// ---------------------------------------------------------------------------
// Folders and current files
// ---------------------------------------------------------------------------
const ROOT_MARKER = 'commsHubWriting';
const ROOT_NAME = 'مستندات الكتابة';

/** The work's folders, made the first time it needs them. Two saves at once leave one set. */
export async function ensureFolders(deps: Pick<WritingDeps, 'db' | 'storage' | 'key'>, id: string, title: string, docs: WorkDocs | null): Promise<WorkDocs> {
  if (docs) return docs;
  const { storage, db, key } = deps;
  const root = await storage.markedFolder(ROOT_MARKER, ROOT_NAME);
  const folder = await storage.createFolder(cleanName(`${id} ${title}`), root);
  const [current, versions, drafts, images] = await Promise.all(['الحالي', 'الإصدارات', 'مسودات', 'صور'].map((n) => storage.createFolder(n, folder)));
  const { data, error } = await db.rpc('work_doc_folders', { p_key: key, p_work: id, p_folder: folder, p_current: current, p_versions: versions, p_drafts: drafts, p_images: images });
  if (error) {
    await quiet(storage.trash(folder));
    throw new Refused(error.message);
  }
  const row = data as WorkDocs;
  if (row.folder_ref !== folder) await quiet(storage.trash(folder));
  return row;
}

/** Puts a file in a folder, over the one that was there when there is one. If that file is gone, a new one takes its place. */
export async function writeOver(
  storage: WritingDeps['storage'],
  parentId: string,
  existing: string | null | undefined,
  file: { name: string; mimeType: string; bytes: Uint8Array },
): Promise<string> {
  if (existing) {
    try {
      await storage.update(existing, file);
      return existing;
    } catch (e) {
      if (!(e instanceof StorageError && e.status === 404)) throw e;
    }
  }
  return storage.putSmall({ ...file, parentId });
}

// ---------------------------------------------------------------------------
// A saved version
// ---------------------------------------------------------------------------
export type SaveInput = { id: string; prepared: Prepared; json: string; text: string; note: string | null; checksum: string };

/**
 * Uploads the master, commits the version, then does what no longer decides anything: the text file in «الحالي», and
 * the trash for what was pruned and for the draft this save finished. If the commit is refused, the master goes to the
 * trash. The text file comes after the commit, so a refused save never replaces it.
 */
export async function saveVersion(deps: WritingDeps, input: SaveInput): Promise<{ n: number; reopened: boolean; pruned: number }> {
  const { db, storage, key } = deps;
  const { id, prepared, json, text, note, checksum } = input;
  const docs = await ensureFolders(deps, id, prepared.title, prepared.docs);
  const bytes = encode(json);
  const master = await storage.putSmall({
    name: masterName(prepared.next, deps.now?.() ?? new Date()),
    mimeType: 'application/json',
    bytes,
    parentId: docs.versions_ref,
    appProperties: { commsHubWork: id },
  });
  const { data, error } = await db.rpc('work_doc_commit', {
    p_key: key,
    p_work: id,
    p_body: text,
    p_note: note,
    p_master_ref: master,
    p_size: bytes.length,
    p_checksum: checksum,
  });
  if (error) {
    await quiet(storage.trash(master));
    throw new Refused(error.message);
  }
  const saved = data as Commit;
  try {
    const ref = await writeOver(storage, docs.current_ref, docs.text_ref, {
      name: workFileName(id, prepared.title, 'txt'),
      mimeType: 'text/plain',
      bytes: encode(text),
    });
    if (ref !== docs.text_ref) await db.rpc('work_doc_export', { p_key: key, p_work: id, p_kind: 'text', p_ref: ref, p_n: saved.n });
  } catch {
    // The database holds the text, and the file route answers from there: the version is saved.
  }
  await deps.trashAll(saved.copies ?? [], [...(saved.prune ?? []), ...(saved.draft ? [saved.draft] : [])]);
  return { n: saved.n, reopened: saved.reopened, pruned: saved.prune?.length ?? 0 };
}

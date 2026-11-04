// Downloads go through the system's save dialog, starting in the Downloads folder, for library files
// and studio exports alike (Desktop_App_Plan.md 5.1). From bridge version 10 (Desktop_Power_Ideas.md P-28) a
// library, mail or messaging download, once saved, can be opened in its program («فتح بالبرنامج الافتراضي») or
// shown in its folder, by an id the main process gave at `will-download`, never by a path. Only documents,
// pictures, sound and video of a fixed list open, never a program, a shortcut or a script, and only while Windows'
// mark of the web (Zone.Identifier) is on the file. Pure; download-store.ts keeps the records and reads the mark.
import path from 'node:path';
import { isAllowed } from './origins.ts';

export const SAVE_TITLE = 'حفظ الملف';

/** A file name that cannot leave the folder or carry characters Windows refuses. */
export function safeFileName(suggested: string): string {
  const last = (suggested || '').split(/[\\/]/).pop() ?? '';
  const name = last.replace(/[:*?"<>|\u0000-\u001f]/g, '_').replace(/^[.\s]+|[.\s]+$/g, '');
  return name || 'download';
}

export function saveDialogFor(downloadsFolder: string, suggested: string) {
  return { title: SAVE_TITLE, defaultPath: path.join(downloadsFolder, safeFileName(suggested)) };
}

// --- opening a saved file (P-28) ------------------------------------------------------------------

export type OpenKind = 'document' | 'picture' | 'sound' | 'video';

/**
 * The kinds that may be opened in their program, by the file's last extension. Nothing that runs: no program,
 * installer, shortcut, script, web page, picture that can carry a script (SVG), Office file with macros (docm, xlsm,
 * pptm and their kin) or archive. Anything not named here is never opened by the application.
 */
export const OPEN_KINDS: Readonly<Record<string, OpenKind>> = Object.freeze({
  pdf: 'document', txt: 'document', rtf: 'document', csv: 'document',
  doc: 'document', docx: 'document', xls: 'document', xlsx: 'document', ppt: 'document', pptx: 'document',
  odt: 'document', ods: 'document', odp: 'document',
  jpg: 'picture', jpeg: 'picture', png: 'picture', gif: 'picture', webp: 'picture', bmp: 'picture', tif: 'picture', tiff: 'picture',
  heic: 'picture', heif: 'picture', avif: 'picture',
  mp3: 'sound', wav: 'sound', m4a: 'sound', aac: 'sound', ogg: 'sound', oga: 'sound', opus: 'sound', flac: 'sound', wma: 'sound',
  mp4: 'video', m4v: 'video', mov: 'video', webm: 'video', mkv: 'video', avi: 'video', wmv: 'video', mpg: 'video', mpeg: 'video', '3gp': 'video',
});

/**
 * The kind a saved file opens as, or null. It reads the name Windows will act on: the last extension, in any case.
 * A name that ends in a dot or a space, or carries a colon (a stream of another file), is refused, since Windows
 * reads such names otherwise.
 */
export function openKind(file: string): OpenKind | null {
  const name = (file || '').split(/[\\/]/).pop() ?? '';
  if (!name || /[:\u0000-\u001f]/.test(name) || /[.\s]$/.test(name)) return null;
  const at = name.lastIndexOf('.');
  if (at <= 0) return null;
  const ext = name.slice(at + 1).toLowerCase();
  return Object.hasOwn(OPEN_KINDS, ext) ? OPEN_KINDS[ext] : null;
}

const ID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

/**
 * The site's file routes a download is offered from: a library file, a mail attachment (sent or received), a file in
 * «المراسلة». The same strings as the site's FILE_ROUTES (src/lib/native/files.ts), held equal by a test.
 */
export const DOWNLOAD_ROUTES: Readonly<Record<'library' | 'mail' | 'messaging', readonly string[]>> = Object.freeze({
  library: [`^/api/media/${ID}/content(\\?(v=[1-9][0-9]{0,5}(&download=1)?|download=1))?$`],
  mail: [`^/api/mail/file/${ID}$`, `^/api/mail/inbound/${ID}/[0-9]{1,2}$`],
  messaging: [`^/api/chat/file/${ID}$`],
});
const ROUTES = Object.entries(DOWNLOAD_ROUTES).flatMap(([from, list]) => list.map((r) => [from, new RegExp(r)] as const));

/** Where a download came from when it is one of those routes on a compiled address, else null. */
export function downloadFrom(address: string, allowed: readonly string[]): 'library' | 'mail' | 'messaging' | null {
  if (!isAllowed(address, allowed)) return null;
  const u = new URL(address);
  if (u.hash) return null;
  const at = `${u.pathname}${u.search}`;
  const hit = ROUTES.find(([, r]) => r.test(at));
  return hit ? (hit[0] as 'library' | 'mail' | 'messaging') : null;
}

/** Windows' mark of the web as the application writes it when Chromium has not: the internet zone, and the site's own address. */
export function zoneText(origin: string): string {
  return `[ZoneTransfer]\r\nZoneId=3\r\nHostUrl=${origin}/\r\n`;
}

/** Whether a Zone.Identifier stream says the file came from the internet zone or a more restricted one. */
export function isMarked(text: string | null): boolean {
  if (!text) return false;
  const t = text.replace(/\u0000/g, '');
  if (!/^\s*\[ZoneTransfer\]/im.test(t)) return false;
  const zone = /^\s*ZoneId\s*=\s*(\d+)\s*$/im.exec(t);
  return !!zone && Number(zone[1]) >= 3;
}

/** What the page is told of a saved download: its id, the name it was saved under, and the kind it opens as. Never its folder. */
export type DownloadView = { id: string; name: string; kind: OpenKind | null };

export function viewOf(r: { id: string; file: string; kind: OpenKind | null }): DownloadView {
  const name = (path.win32.basename(r.file) || 'ملف').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200);
  return { id: r.id, name, kind: r.kind };
}

/** Why a saved file was not opened: no longer known or not where it was, a kind that never opens, no mark of the web, or Windows refused. */
export type OpenWhy = 'gone' | 'kind' | 'unmarked' | 'failed';

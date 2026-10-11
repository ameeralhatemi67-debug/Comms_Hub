// Rules for files that go to Google Drive. Pure, shared by the API routes and the
// Media page, and covered by tests/drive.test.mjs.
import { roles } from '../domain.ts';
import type { Account } from '../access.ts';

/** Largest single upload the Hub accepts. Drive itself allows far more. */
export const MAX_UPLOAD_BYTES = 5 * 1024 ** 3;

/** Size of one chunk of a resumable upload: a multiple of 256 KiB, as Drive requires. */
export const CHUNK_BYTES = 8 * 1024 * 1024;

export type MediaKind = 'image' | 'video' | 'audio' | 'document' | 'other';

export const kindLabels: Record<MediaKind, string> = {
  image: 'صورة',
  video: 'فيديو',
  audio: 'صوت',
  document: 'مستند',
  other: 'ملف',
};

// Types that can run script when opened from the Hub's own address are refused.
const refused = new Set([
  'image/svg+xml',
  'text/html',
  'application/xhtml+xml',
  'text/javascript',
  'application/javascript',
  'application/x-msdownload',
  'application/x-sh',
]);

const documents = new Set([
  'application/pdf',
  'application/zip',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

/** The kind of an allowed file, or null when the type is not accepted. */
export function mediaKind(mime: string): MediaKind | null {
  const type = mime.toLowerCase().split(';')[0].trim();
  if (!type || refused.has(type)) return null;
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (documents.has(type)) return 'document';
  return null;
}

/** A file name safe to store and show: no path parts, no control characters, bounded length. */
export function cleanName(name: string): string {
  const base = name.replace(/[\\/]+/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (!base) return 'file';
  if (base.length <= 200) return base;
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 && base.length - dot <= 12 ? base.slice(dot) : '';
  return base.slice(0, 200 - ext.length) + ext;
}

/**
 * True when a state-changing request came from this site. Browsers send Origin on
 * every POST and DELETE; a missing one is refused.
 */
export function sameOrigin(origin: string | null, requestUrl: string): boolean {
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(requestUrl).origin;
  } catch {
    return false;
  }
}

/** Who may add files: administrators and every role that can create content. */
export function canUpload(account: Pick<Account, 'role'>): boolean {
  return account.role === 'admin' || roles[account.role].create;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

// Downloads go through the system's save dialog, starting in the Downloads folder, for library files
// and studio exports alike (Desktop_App_Plan.md 5.1). Pure.
import path from 'node:path';

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

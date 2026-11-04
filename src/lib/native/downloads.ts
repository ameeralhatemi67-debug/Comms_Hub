// What the desktop application says after a library, mail or messaging download it saved (MVP_draft.md 63.10;
// Desktop_Power_Ideas.md P-28): the file's name, «فتح بالبرنامج الافتراضي» for the kinds that open, «إظهار في
// المجلد» for every saved file, and why a file did not open. The application decides what opens; these are only its
// words. Plain TypeScript, tested.
import type { DownloadWhy, NativeDownload } from './index.ts';

export const OPEN_LABEL = 'فتح بالبرنامج الافتراضي';
export const SHOW_LABEL = 'إظهار في المجلد';

/** The notice's line for a saved download, around the file's name, which the page isolates (a name may be Latin, Arabic or both). */
export const SAVED_BEFORE = 'حُفظ «';
export const SAVED_AFTER = '».';
export function downloadLine(d: NativeDownload): string {
  return `${SAVED_BEFORE}${d.name}${SAVED_AFTER}`;
}

/** Said under the line of a file whose kind never opens from the application. */
export const NEVER_OPENS = 'لا يُفتح هذا النوع من الملفات من داخل التطبيق، ويمكن إظهاره في مجلده.';

export const WHY_LINE: Readonly<Record<DownloadWhy, string>> = Object.freeze({
  gone: 'لم يعد الملف في المكان الذي حُفظ فيه.',
  kind: NEVER_OPENS,
  unmarked: 'لم يعد الملف يحمل علامة Windows للملفات القادمة من الإنترنت، فلا يفتحه التطبيق. يمكنك فتحه من مجلده.',
  failed: 'تعذّر فتح الملف.',
});

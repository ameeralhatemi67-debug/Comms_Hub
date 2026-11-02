// The site's files on the phone (MVP_draft.md 64.2; Android_Build_Plan.md A4). Inside the Android application a
// file of the library, of mail or of «المراسلة» can be opened in the phone's own viewer («فتح الملف»), saved to
// the phone («حفظ في الهاتف»: photos and videos to the gallery, everything else to Downloads) or shared
// («مشاركة»). The page names the file by its path on its own address, one of the routes below, and the
// application fetches it with the site's cookie and answers only whether it worked: no file's bytes cross the
// bridge. The routes are held equal to the application's SiteFiles.java by tests/native.test.mjs. In a browser
// none of this is offered and the links stay as they were. Plain TypeScript, tested.
import { native, type Feature, type NativeSiteFile } from './index.ts';

const ID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

/** The site's file routes, as a page may name them: a library file (a version, a download), messaging, mail, a written work. */
export const FILE_ROUTES: readonly string[] = Object.freeze([
  `^/api/media/${ID}/content(\\?(v=[1-9][0-9]{0,5}(&download=1)?|download=1))?$`,
  `^/api/chat/file/${ID}$`,
  `^/api/mail/file/${ID}$`,
  `^/api/mail/inbound/${ID}/[0-9]{1,2}$`,
  '^/api/writing/CH-[0-9]{1,6}/file\\?kind=(docx|pdf|txt)$',
  `^/api/writing/CH-[0-9]{1,6}/image/${ID}$`,
]);
const COMPILED = FILE_ROUTES.map((r) => new RegExp(r));

/** The path when it is one of the site's file routes, else null. */
export function filePath(path: unknown): string | null {
  if (typeof path !== 'string' || path.length > 200) return null;
  return COMPILED.some((r) => r.test(path)) ? path : null;
}

/** The paths of each file the pages show. */
export const fileAt = {
  /** A library file: a version shown in place, or recorded as a download in its log. */
  media: (id: string, version?: number, download = false) => {
    const q = [version ? `v=${version}` : '', download ? 'download=1' : ''].filter(Boolean).join('&');
    return `/api/media/${id}/content${q ? `?${q}` : ''}`;
  },
  chat: (id: string) => `/api/chat/file/${id}`,
  mail: (id: string) => `/api/mail/file/${id}`,
  inbound: (message: string, index: number) => `/api/mail/inbound/${message}/${index}`,
  /** A current file of a written work. */
  writing: (work: string, kind: 'docx' | 'pdf' | 'txt') => `/api/writing/${work}/file?kind=${kind}`,
  /** A picture from the device, placed in a document. */
  writingImage: (work: string, image: string) => `/api/writing/${work}/image/${image}`,
};

/**
 * A file as the pages offer it on the phone: the path that shows it, and the one that records a download
 * (a library file's `?download=1`), used for saving and sharing, which take the file out of the site.
 */
export type PhoneFile = { name: string; path: string; downloadPath?: string };
export type PhoneAction = 'open' | 'save' | 'share';

/** Pictures, video and sound show in the page itself; other kinds need the phone's viewer. */
export function showsInPage(mime: string | null | undefined): boolean {
  return /^(image|video|audio)\//i.test(mime ?? '');
}

/**
 * What the phone offers for a file, in this order: «فتح الملف» for what the page cannot show itself, «حفظ في
 * الهاتف», then «مشاركة». Nothing in a browser or an application without these features.
 */
export function phoneActions(has: (f: Feature) => boolean, inPage: boolean): PhoneAction[] {
  const out: PhoneAction[] = [];
  if (has('download') && !inPage) out.push('open');
  if (has('download')) out.push('save');
  if (has('share')) out.push('share');
  return out;
}

export const ACTION_LABEL: Readonly<Record<PhoneAction, string>> = Object.freeze({ open: 'فتح الملف', save: 'حفظ في الهاتف', share: 'مشاركة' });
export const ACTION_BUSY: Readonly<Record<PhoneAction, string>> = Object.freeze({ open: 'جارٍ تجهيز الملف…', save: 'جارٍ الحفظ…', share: 'جارٍ تجهيز الملف…' });

/** The file the application is asked for: the right path for the action, a plain name, or null for anything else. */
export function askFor(action: PhoneAction, file: PhoneFile): NativeSiteFile | null {
  const path = filePath(action === 'open' ? file.path : (file.downloadPath ?? file.path));
  const name = typeof file.name === 'string' ? file.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200) : '';
  return path ? { path, name: name || 'ملف' } : null;
}

/**
 * Asks the application; true when the file was opened, saved or handed to the share sheet. The application says
 * itself how it went (Android's own short messages), so a false needs nothing more from the page.
 */
export async function onPhone(action: PhoneAction, file: PhoneFile): Promise<boolean> {
  const n = native();
  const ask = askFor(action, file);
  if (!ask) return false;
  try {
    if (action === 'share') return n.has('share') ? (await n.raw!.share!.file!(ask)) === true : false;
    if (!n.has('download')) return false;
    return (await (action === 'open' ? n.raw!.download!.open! : n.raw!.download!.save!)(ask)) === true;
  } catch {
    return false;
  }
}

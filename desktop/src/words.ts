// The application's own Arabic words for phase D2 (MVP_draft.md 63): the tray, its tooltip, the notices
// the application raises itself and the question before quitting during work. Everything the site
// shows stays the site's. Established terms only; no emoji. Pure.
import type { Reason } from './bridge.ts';
import { PRODUCT_NAME } from './identity.ts';

export const TRAY_OPEN = `فتح ${PRODUCT_NAME}`;
export const TRAY_KEEP = 'إبقاء التطبيق في شريط المهام';
export const TRAY_QUIT = 'إنهاء';

const WORKING: Record<Reason, string> = { export: 'جارٍ التصدير', upload: 'جارٍ رفع ملف' };

/** The tray's tooltip: the name, what is running, and how many notices wait for a decision. */
export function trayTooltip(busy: Reason | null, decisions: number): string {
  const lines = [busy ? `${PRODUCT_NAME}: ${WORKING[busy]}` : PRODUCT_NAME];
  if (decisions > 0) lines.push(decisionsLine(decisions));
  return lines.join('\n');
}

/** Said beside the taskbar badge and in the tooltip. */
export function decisionsLine(n: number): string {
  return `إشعارات تحتاج قرارك: ${n}`;
}

/** The notice when a busy window is closed: it is hidden, and the work goes on. */
export const HIDDEN_BUSY: Record<Reason, { title: string; body: string }> = {
  export: { title: 'التصدير مستمر', body: 'أُغلقت النافذة وما يزال التصدير يعمل. يصلك إشعار عند انتهائه، وتفتح النافذة من أيقونة المركز في شريط المهام.' },
  upload: { title: 'الرفع مستمر', body: 'أُغلقت النافذة وما يزال رفع الملف يعمل. تفتح النافذة من أيقونة المركز في شريط المهام.' },
};

/** The notice the first time the main window is closed with «إبقاء التطبيق في شريط المهام» on. */
export const HIDDEN_KEPT = { title: PRODUCT_NAME, body: 'ما يزال التطبيق يعمل في شريط المهام. تفتحه من أيقونته، وتوقف ذلك من قائمتها.' };

/** The question before quitting while a window is busy. The first button keeps working. */
export const QUIT_QUESTION: Record<Reason, { message: string; detail: string; stay: string; quit: string }> = {
  export: { message: 'يجري تصدير الآن.', detail: 'إن أنهيت التطبيق يتوقف التصدير ولا يُحفظ الملف.', stay: 'متابعة التصدير', quit: 'إنهاء وإيقاف التصدير' },
  upload: { message: 'يجري رفع ملف الآن.', detail: 'إن أنهيت التطبيق يتوقف الرفع ولا يُحفظ الملف.', stay: 'متابعة الرفع', quit: 'إنهاء وإيقاف الرفع' },
};

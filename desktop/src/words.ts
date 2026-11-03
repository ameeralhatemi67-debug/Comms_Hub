// The application's own Arabic words for phase D2 (MVP_draft.md 63): the tray, its tooltip, the notices
// the application raises itself and the question before quitting during work. Everything the site
// shows stays the site's. Established terms only; no emoji. Pure.
import type { Reason } from './bridge.ts';
import { PRODUCT_NAME } from './identity.ts';
import type { Hold } from './idle.ts';

export const TRAY_OPEN = `فتح ${PRODUCT_NAME}`;
export const TRAY_KEEP = 'إبقاء التطبيق في شريط المهام';
export const TRAY_QUIT = 'إنهاء';
export const TRAY_RESTART = 'إعادة التشغيل للتحديث';

/** The system dialogs the page may open (D4). */
export const PICK_TITLE = 'اختيار ملفات من هذا الجهاز';
export const FOLDER_TITLE = 'اختيار مجلد التخزين المؤقت للاستوديو';

/** The notice when an update has been downloaded (D3). */
export function updateReady(version: string): { title: string; body: string } {
  return { title: 'تحديث جاهز', body: `الإصدار ${version} جاهز، ويُثبَّت عند إنهاء التطبيق. للتثبيت الآن اختر «${TRAY_RESTART}».` };
}

/** «إعادة التشغيل للتحديث» while a window works: refused, and said why. */
export const UPDATE_WAITS = { title: 'التحديث ينتظر', body: 'لا يُعاد تشغيل التطبيق أثناء العمل. يُثبَّت التحديث عند إنهاء التطبيق بعد انتهائه.' };

const WORKING: Record<Reason, string> = { export: 'جارٍ التصدير', upload: 'جارٍ رفع ملف' };

/** Why the light copies made in idle time wait (idle.ts HOLDS), said in the tray. */
const HELD: Record<Hold, string> = {
  battery: 'تنتظر التوصيل بالكهرباء',
  throttled: 'تنتظر حتى يعود المعالج إلى سرعته',
  export: 'تنتظر انتهاء التصدير',
  upload: 'تنتظر انتهاء الرفع',
  measuring: 'تنتظر انتهاء القياس',
  playing: 'تنتظر انتهاء التشغيل',
  scrubbing: 'تنتظر انتهاء التمرير',
  asked: 'تنتظر النسخة التي طلبتها',
  input: 'تنتظر حتى تتوقف عن العمل لحظات',
};

/** The tray's line for the light copies made in idle time (D12, P-08), or null when there are none to make. */
export function copiesLine(c: { making: number; waiting: number; hold: Hold | null }): string | null {
  const left = c.making + c.waiting;
  if (!left) return null;
  return c.hold ? `نسخ خفيفة للمعاينة: ${left} ${HELD[c.hold]}` : `نسخ خفيفة للمعاينة: تُنشأ ${c.making} من ${left} في وقت فراغ الجهاز`;
}

/** The tray's tooltip: the name, what is running, how many notices wait for a decision, and the copies being made. */
export function trayTooltip(busy: Reason | null, decisions: number, copies: { making: number; waiting: number; hold: Hold | null } = { making: 0, waiting: 0, hold: null }): string {
  const lines = [busy ? `${PRODUCT_NAME}: ${WORKING[busy]}` : PRODUCT_NAME];
  if (decisions > 0) lines.push(decisionsLine(decisions));
  const line = copiesLine(copies);
  if (line) lines.push(line);
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

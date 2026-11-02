// The keys of «ورقة الكتابة» (MVP_draft.md 68.5), as close to Word as a browser allows. A key is read by its place on the keyboard
// (`code`), not its letter, so they work with the keyboard set to Arabic. On a Mac, Cmd stands for Ctrl. Pure.
export type KeyId = string;
export type Shortcut = { id: KeyId; keys: string; label: string; group: 'write' | 'app'; rich?: boolean };

export const SHORTCUTS: Shortcut[] = [
  { id: 'bold', keys: 'Ctrl+B', label: 'غامق', group: 'write', rich: true },
  { id: 'italic', keys: 'Ctrl+I', label: 'مائل', group: 'write', rich: true },
  { id: 'underline', keys: 'Ctrl+U', label: 'تسطير', group: 'write', rich: true },
  { id: 'strike', keys: 'Ctrl+Shift+X', label: 'يتوسطه خط', group: 'write', rich: true },
  { id: 'font', keys: 'Ctrl+Shift+F', label: 'الخط', group: 'write', rich: true },
  { id: 'p', keys: 'Ctrl+Alt+0', label: 'نص عادي', group: 'write', rich: true },
  { id: 'h1', keys: 'Ctrl+Alt+1', label: 'عنوان 1', group: 'write', rich: true },
  { id: 'h2', keys: 'Ctrl+Alt+2', label: 'عنوان 2', group: 'write', rich: true },
  { id: 'h3', keys: 'Ctrl+Alt+3', label: 'عنوان 3', group: 'write', rich: true },
  { id: 'bigger', keys: 'Ctrl+Shift+.', label: 'تكبير الخط', group: 'write', rich: true },
  { id: 'smaller', keys: 'Ctrl+Shift+,', label: 'تصغير الخط', group: 'write', rich: true },
  { id: 'right', keys: 'Ctrl+R', label: 'محاذاة لليمين', group: 'write', rich: true },
  { id: 'center', keys: 'Ctrl+E', label: 'توسيط', group: 'write', rich: true },
  { id: 'left', keys: 'Ctrl+L', label: 'محاذاة لليسار', group: 'write', rich: true },
  { id: 'justify', keys: 'Ctrl+J', label: 'ضبط', group: 'write', rich: true },
  { id: 'ul', keys: 'Ctrl+Shift+L', label: 'قائمة نقطية', group: 'write', rich: true },
  { id: 'ol', keys: 'Ctrl+Shift+7', label: 'قائمة مرقمة', group: 'write', rich: true },
  { id: 'image', keys: 'Ctrl+Alt+I', label: 'صورة أو ملف من المكتبة', group: 'write', rich: true },
  { id: 'link', keys: 'Ctrl+K', label: 'رابط', group: 'write', rich: true },
  { id: 'find', keys: 'Ctrl+F', label: 'بحث', group: 'write', rich: true },
  { id: 'replace', keys: 'Ctrl+H', label: 'استبدال', group: 'write', rich: true },
  { id: 'save', keys: 'Ctrl+S', label: 'حفظ إصدار', group: 'app' },
  { id: 'send', keys: 'Ctrl+Enter', label: 'إرسال للمراجعة أو تسليم', group: 'app' },
  { id: 'ext', keys: 'Ctrl+Alt+T', label: 'طلب تمديد', group: 'app' },
  { id: 'ask', keys: 'Ctrl+Alt+O', label: 'طلب رأي', group: 'app' },
  { id: 'mail', keys: 'Ctrl+Alt+M', label: 'إرسال كبريد', group: 'app' },
  { id: 'msg', keys: 'Ctrl+Alt+G', label: 'إرسال كرسالة', group: 'app' },
  { id: 'done', keys: 'Ctrl+Alt+D', label: 'إنهاء المرحلة', group: 'app' },
  { id: 'brief', keys: 'Ctrl+Alt+B', label: 'الموجز', group: 'app' },
  { id: 'notes', keys: 'Ctrl+Alt+N', label: 'الملاحظات', group: 'app' },
  { id: 'vers', keys: 'Ctrl+Alt+V', label: 'الإصدارات', group: 'app' },
  { id: 'compare', keys: 'Ctrl+Alt+C', label: 'مقارنة الإصدارات', group: 'app' },
  { id: 'focus', keys: 'Ctrl+Alt+F', label: 'وضع التركيز', group: 'app' },
  { id: 'palette', keys: 'Ctrl+/', label: 'قائمة الأوامر', group: 'app' },
];

const CODE: Record<string, string> = { '.': 'Period', ',': 'Comma', '/': 'Slash', Enter: 'Enter' };

/** `Ctrl+Alt+2` as the id of a key event: `CA:Digit2`. */
export function keyCode(keys: string): string {
  const parts = keys.split('+');
  const k = parts[parts.length - 1];
  const code = CODE[k] ?? (/^\d$/.test(k) ? `Digit${k}` : `Key${k}`);
  return `${parts.includes('Alt') ? 'A' : ''}${parts.includes('Shift') ? 'S' : ''}:${code}`;
}

const TABLE = new Map(SHORTCUTS.map((s) => [keyCode(s.keys), s]));

/** The shortcut a key event means, or null. Plain typing is never one. */
export function shortcutOf(e: { code: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }): Shortcut | null {
  if (!e.ctrlKey && !e.metaKey) return null;
  return TABLE.get(`${e.altKey ? 'A' : ''}${e.shiftKey ? 'S' : ''}:${e.code}`) ?? null;
}

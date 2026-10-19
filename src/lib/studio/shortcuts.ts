// The studio's keyboard shortcuts (MVP_draft.md 62.2), in one list: the editors act on them, the menus
// show them, and the shortcuts sheet is drawn from them. Keys are matched by their physical position
// (KeyboardEvent.code), so they work the same with an Arabic keyboard layout. Ctrl means Command on a Mac.
// Pure.

export type Scope = 'video' | 'photo';
export type Shortcut = { id: string; combos: string[]; label: string; group: string; scopes: Scope[] };

const both: Scope[] = ['video', 'photo'];
const video: Scope[] = ['video'];
const photo: Scope[] = ['photo'];

export const GROUPS = ['التشغيل', 'التحرير', 'الأدوات', 'العرض', 'النوافذ', 'الملف'] as const;

export const SHORTCUTS: Shortcut[] = [
  // playing
  { id: 'play', combos: ['Space'], label: 'تشغيل وإيقاف', group: 'التشغيل', scopes: video },
  { id: 'play-forward', combos: ['KeyL'], label: 'تشغيل', group: 'التشغيل', scopes: video },
  { id: 'stop', combos: ['KeyK'], label: 'إيقاف مؤقت', group: 'التشغيل', scopes: video },
  { id: 'back-second', combos: ['KeyJ'], label: 'رجوع ثانية', group: 'التشغيل', scopes: video },
  { id: 'frame-back', combos: ['ArrowLeft'], label: 'إطار للخلف', group: 'التشغيل', scopes: video },
  { id: 'frame-forward', combos: ['ArrowRight'], label: 'إطار للأمام', group: 'التشغيل', scopes: video },
  { id: 'second-back', combos: ['Shift+ArrowLeft'], label: 'رجوع ثانية', group: 'التشغيل', scopes: video },
  { id: 'second-forward', combos: ['Shift+ArrowRight'], label: 'تقدم ثانية', group: 'التشغيل', scopes: video },
  { id: 'edit-back', combos: ['ArrowUp'], label: 'إلى القطع السابق', group: 'التشغيل', scopes: video },
  { id: 'edit-forward', combos: ['ArrowDown'], label: 'إلى القطع التالي', group: 'التشغيل', scopes: video },
  { id: 'home', combos: ['Home'], label: 'إلى البداية', group: 'التشغيل', scopes: video },
  { id: 'end', combos: ['End'], label: 'إلى النهاية', group: 'التشغيل', scopes: video },
  // editing
  { id: 'undo', combos: ['Ctrl+KeyZ'], label: 'تراجع', group: 'التحرير', scopes: both },
  { id: 'redo', combos: ['Ctrl+Shift+KeyZ', 'Ctrl+KeyY'], label: 'إعادة', group: 'التحرير', scopes: both },
  { id: 'split', combos: ['KeyS', 'Ctrl+KeyK'], label: 'قص المقطع المحدد عند رأس التشغيل', group: 'التحرير', scopes: video },
  { id: 'split-all', combos: ['Ctrl+Shift+KeyK'], label: 'قص كل المسارات عند رأس التشغيل', group: 'التحرير', scopes: video },
  { id: 'delete', combos: ['Delete', 'Backspace'], label: 'حذف المحدد', group: 'التحرير', scopes: both },
  { id: 'ripple-delete', combos: ['Shift+Delete', 'Shift+Backspace'], label: 'حذف مع سد الفراغ', group: 'التحرير', scopes: video },
  { id: 'duplicate', combos: ['Ctrl+KeyD'], label: 'تكرار المحدد', group: 'التحرير', scopes: both },
  { id: 'copy', combos: ['Ctrl+KeyC'], label: 'نسخ', group: 'التحرير', scopes: both },
  { id: 'cut', combos: ['Ctrl+KeyX'], label: 'قص إلى الحافظة', group: 'التحرير', scopes: both },
  { id: 'paste', combos: ['Ctrl+KeyV'], label: 'لصق عند رأس التشغيل', group: 'التحرير', scopes: both },
  { id: 'deselect', combos: ['Escape'], label: 'إلغاء التحديد', group: 'التحرير', scopes: both },
  { id: 'default-transition', combos: ['Shift+KeyD'], label: 'انتقال افتراضي عند بداية المقطع', group: 'التحرير', scopes: video },
  { id: 'snap', combos: ['Shift+KeyS'], label: 'تشغيل الالتقاط وإيقافه', group: 'التحرير', scopes: video },
  { id: 'nudge-left', combos: ['ArrowLeft'], label: 'تحريك بكسل يساراً', group: 'التحرير', scopes: photo },
  { id: 'nudge-right', combos: ['ArrowRight'], label: 'تحريك بكسل يميناً', group: 'التحرير', scopes: photo },
  { id: 'nudge-up', combos: ['ArrowUp'], label: 'تحريك بكسل إلى الأعلى', group: 'التحرير', scopes: photo },
  { id: 'nudge-down', combos: ['ArrowDown'], label: 'تحريك بكسل إلى الأسفل', group: 'التحرير', scopes: photo },
  { id: 'nudge-left-10', combos: ['Shift+ArrowLeft'], label: 'تحريك عشرة بكسلات يساراً', group: 'التحرير', scopes: photo },
  { id: 'nudge-right-10', combos: ['Shift+ArrowRight'], label: 'تحريك عشرة بكسلات يميناً', group: 'التحرير', scopes: photo },
  { id: 'nudge-up-10', combos: ['Shift+ArrowUp'], label: 'تحريك عشرة بكسلات إلى الأعلى', group: 'التحرير', scopes: photo },
  { id: 'nudge-down-10', combos: ['Shift+ArrowDown'], label: 'تحريك عشرة بكسلات إلى الأسفل', group: 'التحرير', scopes: photo },
  { id: 'forward', combos: ['Ctrl+BracketRight'], label: 'طبقة إلى الأمام', group: 'التحرير', scopes: photo },
  { id: 'backward', combos: ['Ctrl+BracketLeft'], label: 'طبقة إلى الخلف', group: 'التحرير', scopes: photo },
  { id: 'to-front', combos: ['Ctrl+Shift+BracketRight'], label: 'إلى المقدمة', group: 'التحرير', scopes: photo },
  { id: 'to-back', combos: ['Ctrl+Shift+BracketLeft'], label: 'إلى الخلفية', group: 'التحرير', scopes: photo },
  // tools
  { id: 'tool-select', combos: ['KeyV'], label: 'أداة التحديد', group: 'الأدوات', scopes: both },
  { id: 'tool-razor', combos: ['KeyC'], label: 'أداة الشفرة (قص بالنقر)', group: 'الأدوات', scopes: video },
  { id: 'tool-hand', combos: ['KeyH'], label: 'أداة اليد (تمرير الخط الزمني)', group: 'الأدوات', scopes: video },
  { id: 'tool-text', combos: ['KeyT'], label: 'أداة النص (انقر على المعاينة)', group: 'الأدوات', scopes: both },
  // viewing
  { id: 'zoom-in', combos: ['Equal', 'NumpadAdd'], label: 'تكبير الخط الزمني', group: 'العرض', scopes: video },
  { id: 'zoom-out', combos: ['Minus', 'NumpadSubtract'], label: 'تصغير الخط الزمني', group: 'العرض', scopes: video },
  { id: 'zoom-fit', combos: ['Backslash'], label: 'الخط الزمني كله في النافذة', group: 'العرض', scopes: video },
  { id: 'maximize', combos: ['Backquote'], label: 'تكبير النافذة النشطة واستعادتها', group: 'العرض', scopes: both },
  { id: 'full-window', combos: ['Ctrl+Shift+KeyF'], label: 'المحرر بملء نافذة المتصفح', group: 'العرض', scopes: both },
  { id: 'safe-zones', combos: ['Shift+KeyG'], label: 'مناطق Reels الآمنة', group: 'العرض', scopes: video },
  { id: 'shortcuts', combos: ['Shift+Slash', 'F1'], label: 'قائمة الاختصارات', group: 'العرض', scopes: both },
  // windows: Shift and the window's digit (panels.ts)
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => ({ id: `window-${d}`, combos: [`Shift+Digit${d}`], label: `النافذة ${d}`, group: 'النوافذ', scopes: both })),
  // file
  { id: 'save-version', combos: ['Ctrl+KeyS'], label: 'حفظ نسخة مرقّمة', group: 'الملف', scopes: both },
  { id: 'export', combos: ['Ctrl+KeyM'], label: 'نافذة التصدير', group: 'الملف', scopes: both },
  { id: 'rename', combos: ['F2'], label: 'إعادة تسمية المشروع', group: 'الملف', scopes: both },
];

export type KeyLike = { code: string; key?: string; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean };

/** A key press as written in the list: modifiers in a fixed order, then the key's position. */
export function comboOf(e: KeyLike): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(e.code || '');
  return parts.join('+');
}

/** The shortcut a key press means in this editor, or null. */
export function matchShortcut(e: KeyLike, scope: Scope): string | null {
  const c = comboOf(e);
  for (const s of SHORTCUTS) if (s.scopes.includes(scope) && s.combos.includes(c)) return s.id;
  return null;
}

const KEY_NAMES: Record<string, string> = {
  Space: 'المسافة',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Equal: '=',
  Minus: '-',
  NumpadAdd: '+',
  NumpadSubtract: '−',
  Backslash: '\\',
  Backquote: '`',
  Slash: '/',
  BracketRight: ']',
  BracketLeft: '[',
  Escape: 'Esc',
  Delete: 'Delete',
  Backspace: 'Backspace',
  Home: 'Home',
  End: 'End',
};

/** How a combination is written for a person: «Ctrl+Shift+K», «Shift+?», «المسافة». */
export function comboLabel(combo: string): string {
  return combo
    .split('+')
    .map((p) => KEY_NAMES[p] ?? p.replace(/^Key/, '').replace(/^Digit/, ''))
    .join('+')
    .replace('Shift+/', '?');
}

/** The first way to press a shortcut, for menus and button titles. */
export function keysOf(id: string): string {
  const s = SHORTCUTS.find((x) => x.id === id);
  return s ? comboLabel(s.combos[0]) : '';
}

/** A title with its shortcut: «قص (S)». */
export const withKeys = (title: string, id: string) => (keysOf(id) ? `${title} (${keysOf(id)})` : title);

/** Keys typed into a field are the field's: only Escape is the studio's there. */
export function typingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  if (el.tagName === 'INPUT') {
    const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
    return !['checkbox', 'radio', 'button', 'submit', 'color'].includes(type);
  }
  return false;
}

// The taskbar button (Desktop_Power_Ideas.md P-26, phase D12): the progress of the page's work on it, red when that
// work failed, and a jump list of two places in the site. The page sends a number from 0 to 1, or one of two words; the
// jump list is a fixed list built here, and a start from it carries one of its own words, never an address, so
// whoever starts the program with an argument can reach nothing else. Pure; native.ts and main.ts apply it.

/** What the page asks the button to show: how far (0 to 1), finished («done»: the bar goes) or failed (red). */
export type Progress = { mode: 'normal'; value: number } | { mode: 'none' } | { mode: 'error' };

export function progressOf(value: unknown): Progress | null {
  if (value === 'done') return { mode: 'none' };
  if (value === 'failed') return { mode: 'error' };
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) return null;
  return { mode: 'normal', value: Math.round(value * 1000) / 1000 };
}

/** Electron's setProgressBar arguments for a state; a red bar keeps the last fraction shown, or a full one. */
export function progressBar(p: Progress, last: number): { value: number; mode: 'normal' | 'none' | 'error' } {
  if (p.mode === 'normal') return { value: p.value, mode: 'normal' };
  if (p.mode === 'error') return { value: last > 0 ? last : 1, mode: 'error' };
  return { value: -1, mode: 'none' };
}

/** The jump list's places: «الاستوديو», and the home page, which leads a director or an assistant with «يحتاج قرارك». */
export const JUMPS = Object.freeze({
  studio: { title: 'الاستوديو', path: '/motion/studio', description: 'فتح الاستوديو في استوديو الحركة' },
  decisions: { title: 'يحتاج قرارك', path: '/', description: 'فتح الصفحة الرئيسية: ما يحتاج قرارك أو متابعتك' },
} as const);
export type Jump = keyof typeof JUMPS;
export const JUMP_ARG = '--commshub-go=';

/** The place a start from the jump list asks for, from the program's arguments, or null. */
export function jumpOf(argv: readonly string[]): Jump | null {
  for (const a of [...argv].reverse()) {
    if (typeof a !== 'string' || !a.startsWith(JUMP_ARG)) continue;
    const k = a.slice(JUMP_ARG.length);
    return Object.prototype.hasOwnProperty.call(JUMPS, k) ? (k as Jump) : null;
  }
  return null;
}

/** The address of a place on the site the window shows (its own allowed origin). */
export const jumpAddress = (origin: string, jump: Jump) => `${origin}${JUMPS[jump].path}`;

/** The jump list Windows shows on the taskbar button: one category of tasks, each starting this program. */
export function jumpList(exe: string) {
  return [
    {
      type: 'tasks' as const,
      items: (Object.keys(JUMPS) as Jump[]).map((k) => ({ type: 'task' as const, title: JUMPS[k].title, description: JUMPS[k].description, program: exe, args: `${JUMP_ARG}${k}`, iconPath: exe, iconIndex: 0 })),
    },
  ];
}

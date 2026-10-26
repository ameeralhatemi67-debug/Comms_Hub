// The window's life while the page works (Desktop_App_Plan.md 5.2 `power` and `life`, decision D-10).
// A page marks its window busy during an export or an upload and may hold the laptop awake. While a
// window is busy, closing it hides it to the tray instead, and quitting asks first. With
// «إبقاء التطبيق في شريط المهام» on, closing the main window always hides it. Holds belong to the window
// that asked: another window cannot release them, and a window that closes, crashes or loads another
// document loses all of its own. The main process turns these answers into Electron calls. Pure.
import type { Reason } from './bridge.ts';

type Hold = { owner: number; blocker: number; reason: Reason };

export class Registry {
  private busy = new Map<number, Reason>();
  private holds = new Map<number, Hold>();
  private next = 1;

  /** Marks a window busy. True when this changed anything. */
  setBusy(owner: number, reason: Reason): boolean {
    const was = this.busy.get(owner);
    this.busy.set(owner, reason);
    return was !== reason;
  }

  /** Marks a window idle. True when it was busy. */
  clearBusy(owner: number): boolean {
    return this.busy.delete(owner);
  }

  isBusy(owner: number): boolean {
    return this.busy.has(owner);
  }

  /** Why one window is busy, or null. */
  busyOf(owner: number): Reason | null {
    return this.busy.get(owner) ?? null;
  }

  /** The reason the application is busy, export first, or null when no window is. */
  busyReason(): Reason | null {
    const all = [...this.busy.values()];
    return all.includes('export') ? 'export' : (all[0] ?? null);
  }

  /** Records a system blocker for a window; returns the number the page will hand back. */
  addHold(owner: number, blocker: number, reason: Reason): number {
    const id = this.next++;
    this.holds.set(id, { owner, blocker, reason });
    return id;
  }

  /** The blocker to stop for this hold, only when it is the asking window's own. */
  release(owner: number, id: number): number | null {
    const hold = this.holds.get(id);
    if (!hold || hold.owner !== owner) return null;
    this.holds.delete(id);
    return hold.blocker;
  }

  /** Everything a window held, now let go: its blockers to stop, and whether it was busy. */
  releaseAll(owner: number): { blockers: number[]; wasBusy: boolean } {
    const blockers: number[] = [];
    for (const [id, hold] of this.holds) {
      if (hold.owner !== owner) continue;
      blockers.push(hold.blocker);
      this.holds.delete(id);
    }
    return { blockers, wasBusy: this.busy.delete(owner) };
  }

  holdCount(): number {
    return this.holds.size;
  }
}

/** What closing a window does. Quitting always closes; a busy window, or the main one kept in the tray, hides. */
export function closeAction(state: { quitting: boolean; busy: boolean; isMain: boolean; keepInTray: boolean }): 'close' | 'hide' {
  if (state.quitting) return 'close';
  if (state.busy) return 'hide';
  return state.isMain && state.keepInTray ? 'hide' : 'close';
}

/** Quitting while something is busy asks first, unless the person already said to go on. */
export function quitAction(busy: Reason | null, confirmed: boolean): 'quit' | 'ask' {
  return busy && !confirmed ? 'ask' : 'quit';
}

/** A native notice is for someone not looking at the window: not focused, hidden or minimised. */
export function shouldNotify(window: { focused: boolean; visible: boolean; minimized: boolean } | null): boolean {
  if (!window) return true;
  return !window.focused || !window.visible || window.minimized;
}

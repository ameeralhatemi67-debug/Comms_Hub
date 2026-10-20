// The check every main-process handler of the bridge must pass (Desktop_App_Plan.md 5.0, principle
// 3; section 9): the message comes from the main frame of one of the application's windows, and that
// frame is on an address in the list now, at the moment of the call. Frames inside the page, a window
// the page steered elsewhere and any other web contents are refused. D1 registers no handler; every
// D2 handler is registered through guard(). Pure.
import { isAllowed } from './origins.ts';

/** The fields of Electron's IpcMainEvent and IpcMainInvokeEvent that decide. */
export type SenderEvent = {
  sender?: { id: number } | null;
  senderFrame?: { url: string; parent: unknown | null } | null;
};

export function trustedSender(event: SenderEvent, allowed: readonly string[], windows: ReadonlySet<number>): boolean {
  const frame = event.senderFrame;
  if (!frame || frame.parent !== null) return false;
  if (!event.sender || !windows.has(event.sender.id)) return false;
  return isAllowed(frame.url, allowed);
}

export class RefusedSender extends Error {
  constructor() {
    super('refused: the sender is not an allowed page of this application');
  }
}

/** A handler that runs only for a trusted sender. `windows` is read at each call. */
export function guard<E extends SenderEvent, A extends unknown[], R>(
  allowed: readonly string[],
  windows: () => ReadonlySet<number>,
  handler: (event: E, ...args: A) => R,
): (event: E, ...args: A) => R {
  return (event, ...args) => {
    if (!trustedSender(event, allowed, windows())) throw new RefusedSender();
    return handler(event, ...args);
  };
}

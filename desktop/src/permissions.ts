// Which permissions the site gets (Desktop_App_Plan.md 5.1, DT-03). Granted, and only to an address
// on the list: the microphone (sound alone, never the camera), notifications, the clipboard, full
// screen and file access. Refused: the camera, location, USB, serial, HID, Bluetooth, MIDI and any
// other, including those a browser would give quietly (the screen wake lock, persistent storage):
// the studio already carries on without them. Pure.
import { isAllowed } from './origins.ts';

/** Electron's names for what is granted. 'media' is narrowed to sound below. */
export const GRANTED = Object.freeze(['media', 'notifications', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'fileSystem']);

export type PermissionAsk = {
  permission: string;
  /** The asking frame's address (a request's requestingUrl, a check's requestingUrl or origin). */
  url: string | null | undefined;
  /** A request names every kind of media it wants. */
  mediaTypes?: readonly string[];
  /** A check names one. */
  mediaType?: string;
};

export function permissionGranted(ask: PermissionAsk, allowed: readonly string[]): boolean {
  if (!GRANTED.includes(ask.permission)) return false;
  if (!ask.url || !isAllowed(ask.url, allowed)) return false;
  if (ask.permission === 'media') {
    const kinds = ask.mediaTypes ?? (ask.mediaType ? [ask.mediaType] : []);
    return kinds.length > 0 && kinds.every((kind) => kind === 'audio');
  }
  return true;
}

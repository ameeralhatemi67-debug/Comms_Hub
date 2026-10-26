// The studio's preview in a window of its own (MVP_draft.md 63.5, Desktop_App_Plan.md D6), kept in step with
// the editor. The two are pages of the same address in the same profile, so they speak over a
// BroadcastChannel named after the project; nothing passes through the application or the server. The
// editor (the leader) sends what the preview shows (the project as shown, in its chosen shape) and its
// clock: where the playhead started, whether it plays, and the moment it did, on the clock both windows
// share (performance.timeOrigin + performance.now(), milliseconds since the epoch on this computer).
// The preview window (the follower) runs its own player from that moment, so the two stay together within
// a frame without a message per frame. The follower sends space to play or pause; it never edits.
import type { Micros, ProjectDoc } from './schema.ts';

export type Clock = { t: Micros; playing: boolean; wall: number };
export type LinkMessage =
  | { type: 'hello' }
  | { type: 'leader' }
  | { type: 'doc'; doc: ProjectDoc }
  | { type: 'clock'; clock: Clock }
  | { type: 'bye'; from: 'leader' | 'follower' }
  | { type: 'key'; key: 'toggle' };

export const channelName = (projectId: string) => `comms-hub-studio-preview-${projectId}`;

/**
 * The address of a studio panel's own window (/motion/studio/<project>/preview). The site's frame (menu,
 * notices, searches) stays out of it: the window only shows, and the editor's window does everything else.
 */
export function isPanelWindow(path: string | null | undefined): boolean {
  return /^\/motion\/studio\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/preview\/?$/.test(path ?? '');
}

/** This computer's clock, the same in both windows. */
export const wallNow = () => performance.timeOrigin + performance.now();

/** Where the leader's playhead is at `wall`, from its last clock; never past `end`. */
export function timeAt(c: Clock, wall: number, end?: Micros): Micros {
  if (!c.playing) return c.t;
  const t = Math.round(c.t + (wall - c.wall) * 1000);
  return end === undefined ? Math.max(0, t) : Math.max(0, Math.min(t, end));
}

/** Moves a player to where the editor's is: playing from the same moment, or standing on the same frame. */
export function followClock(pl: { playing: boolean; play(): void; pause(): void; seek(t: Micros): void }, c: Clock, end: Micros) {
  if (!c.playing) {
    if (pl.playing) pl.pause();
    pl.seek(c.t);
    return;
  }
  const t = timeAt(c, wallNow(), end);
  if (t >= end) {
    if (pl.playing) pl.pause();
    pl.seek(end);
    return;
  }
  pl.seek(t);
  if (!pl.playing) pl.play();
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** A message as one of the two pages sent it, or null for anything else on the channel. */
export function readMessage(data: unknown): LinkMessage | null {
  if (!data || typeof data !== 'object') return null;
  const m = data as Record<string, unknown>;
  switch (m.type) {
    case 'hello':
      return { type: 'hello' };
    case 'leader':
      return { type: 'leader' };
    case 'doc':
      return m.doc && typeof m.doc === 'object' && Array.isArray((m.doc as ProjectDoc).sources) ? { type: 'doc', doc: m.doc as ProjectDoc } : null;
    case 'clock': {
      const c = m.clock as Record<string, unknown> | undefined;
      return c && finite(c.t) && finite(c.wall) && typeof c.playing === 'boolean' ? { type: 'clock', clock: { t: c.t, playing: c.playing, wall: c.wall } } : null;
    }
    case 'bye':
      return m.from === 'leader' || m.from === 'follower' ? { type: 'bye', from: m.from } : null;
    case 'key':
      return m.key === 'toggle' ? { type: 'key', key: 'toggle' } : null;
    default:
      return null;
  }
}

type Channel = Pick<BroadcastChannel, 'postMessage' | 'close'> & { onmessage: ((e: MessageEvent) => void) | null };
const open = (projectId: string): Channel | null => (typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(channelName(projectId)));

/** The editor's side: tells the preview window what to show and when; hears it come and go. */
export class PreviewLeader {
  private ch: Channel | null;
  private doc: ProjectDoc | null = null;
  private present = false;
  private readonly o: { now: () => Clock; onKey?: (key: 'toggle') => void; onPresence?: (present: boolean) => void };

  constructor(projectId: string, o: { now: () => Clock; onKey?: (key: 'toggle') => void; onPresence?: (present: boolean) => void }, channel?: Channel) {
    this.o = o;
    this.ch = channel ?? open(projectId);
    if (!this.ch) return;
    this.ch.onmessage = (e) => {
      const m = readMessage(e.data);
      if (!m) return;
      if (m.type === 'hello') {
        this.setPresent(true);
        // nothing to show yet: show() sends it once there is (and the window keeps waiting quietly)
        if (!this.doc) return;
        this.post({ type: 'doc', doc: this.doc });
        this.post({ type: 'clock', clock: this.o.now() });
      } else if (m.type === 'bye' && m.from === 'follower') this.setPresent(false);
      else if (m.type === 'key') this.o.onKey?.(m.key);
    };
    // a preview window already open (the editor was reloaded, or opened after it) answers this
    this.post({ type: 'leader' });
  }

  private setPresent(p: boolean) {
    if (this.present === p) return;
    this.present = p;
    this.o.onPresence?.(p);
  }

  private post(m: LinkMessage) {
    try {
      this.ch?.postMessage(m);
    } catch {
      // a document that cannot be copied is simply not shown there
    }
  }

  get hasFollower(): boolean {
    return this.present;
  }

  /** What the preview shows; sent only while a preview window is open, and again when one opens. */
  show(doc: ProjectDoc) {
    const first = !this.doc;
    this.doc = doc;
    if (!this.present) return;
    this.post({ type: 'doc', doc });
    if (first) this.post({ type: 'clock', clock: this.o.now() });
  }

  clock(c: Clock) {
    if (this.present) this.post({ type: 'clock', clock: c });
  }

  dispose() {
    this.post({ type: 'bye', from: 'leader' });
    this.ch?.close();
    this.ch = null;
  }
}

/** The preview window's side: says it is there, hears the project and the clock, sends space. */
export class PreviewFollower {
  private ch: Channel | null;
  private readonly o: { onDoc: (doc: ProjectDoc) => void; onClock: (c: Clock) => void; onLeader: (present: boolean) => void };

  constructor(projectId: string, o: { onDoc: (doc: ProjectDoc) => void; onClock: (c: Clock) => void; onLeader: (present: boolean) => void }, channel?: Channel) {
    this.o = o;
    this.ch = channel ?? open(projectId);
    if (!this.ch) return;
    this.ch.onmessage = (e) => {
      const m = readMessage(e.data);
      if (!m) return;
      if (m.type === 'doc') {
        this.known = true;
        this.o.onLeader(true);
        this.o.onDoc(m.doc);
      } else if (m.type === 'clock') {
        this.o.onClock(m.clock);
      } else if (m.type === 'leader') {
        // an editor that opened after this window, or opened again: it learns of this window from the hello
        this.hello();
      } else if (m.type === 'bye' && m.from === 'leader') {
        this.known = false;
        this.o.onLeader(false);
      }
    };
    this.hello();
  }

  /** The editor has sent the project since it last said goodbye. */
  private known = false;
  private hello() {
    this.ch?.postMessage({ type: 'hello' } satisfies LinkMessage);
  }

  key(key: 'toggle') {
    this.ch?.postMessage({ type: 'key', key } satisfies LinkMessage);
  }

  dispose() {
    try {
      this.ch?.postMessage({ type: 'bye', from: 'follower' } satisfies LinkMessage);
    } finally {
      this.ch?.close();
      this.ch = null;
    }
  }
}

// The light copies the open projects want made in idle time (Desktop_Power_Ideas.md P-08, phase D12). Each window
// says which of its sources it wants, in its own order (the clips nearest the playhead first, when the page says
// so); the queue keeps one entry per copy, owned by every window that wants it, in the order of the window that
// wants it soonest. An entry first learns whether its source needs a copy at all (`probing`), then waits, runs,
// pauses and ends as `ready`, `light` (no copy needed on this machine), `failed` or `missing`. An entry no window
// wants any more leaves the queue, and native-media.ts stops its job. A window that closes or loads another document
// wants nothing. Pure.

export type EntryState = 'probing' | 'waiting' | 'running' | 'paused' | 'ready' | 'light' | 'failed' | 'missing';
export type Entry = { name: string; key: string; state: EntryState; done: number; total: number; why?: string; pausedAt?: number };
/** What a window is told of one of its sources: never a path. */
export type EntryView = { name: string; state: EntryState; done: number; total: number; why: string | null };

/** At most this many sources per window. */
export const MAX_WANTED = 200;

export class CopyQueue {
  private entries = new Map<string, Entry>();
  /** owner (a window's web contents) -> the names it wants, in its order */
  private wants = new Map<number, string[]>();
  private seq = new Map<string, number>();
  private next = 0;

  /**
   * Replaces what a window wants. `key` is how the main process finds the source again. Returns the entries now
   * new to the queue and those no window wants any more.
   */
  want(owner: number, items: readonly { name: string; key: string }[]): { added: Entry[]; dropped: Entry[] } {
    const names: string[] = [];
    const added: Entry[] = [];
    for (const it of items.slice(0, MAX_WANTED)) {
      if (names.includes(it.name)) continue;
      names.push(it.name);
      if (!this.entries.has(it.name)) {
        const e: Entry = { name: it.name, key: it.key, state: 'probing', done: 0, total: 0 };
        this.entries.set(it.name, e);
        this.seq.set(it.name, this.next++);
        added.push(e);
      }
    }
    this.wants.set(owner, names);
    return { added, dropped: this.sweep() };
  }

  /** A window that closed or loaded another document. */
  forget(owner: number): Entry[] {
    if (!this.wants.delete(owner)) return [];
    return this.sweep();
  }

  private sweep(): Entry[] {
    const wanted = new Set([...this.wants.values()].flat());
    const dropped: Entry[] = [];
    for (const [name, e] of this.entries) {
      if (wanted.has(name)) continue;
      this.entries.delete(name);
      this.seq.delete(name);
      dropped.push(e);
    }
    return dropped;
  }

  get(name: string): Entry | undefined {
    return this.entries.get(name);
  }

  /** Changes an entry; false when it is no longer in the queue. */
  set(name: string, change: Partial<Omit<Entry, 'name' | 'key'>>): boolean {
    const e = this.entries.get(name);
    if (!e) return false;
    Object.assign(e, change);
    if (e.state !== 'paused') delete e.pausedAt;
    return true;
  }

  /** Every entry, the one wanted soonest by any window first. */
  ordered(): Entry[] {
    const rank = (name: string) => {
      let best = Infinity;
      for (const names of this.wants.values()) {
        const i = names.indexOf(name);
        if (i >= 0 && i < best) best = i;
      }
      return best;
    };
    return [...this.entries.values()].sort((a, b) => rank(a.name) - rank(b.name) || (this.seq.get(a.name) ?? 0) - (this.seq.get(b.name) ?? 0));
  }

  owners(name: string): number[] {
    return [...this.wants].filter(([, names]) => names.includes(name)).map(([owner]) => owner);
  }

  /** What one window is told: its own sources, in its own order. */
  view(owner: number): EntryView[] {
    return (this.wants.get(owner) ?? []).flatMap((name) => {
      const e = this.entries.get(name);
      return e ? [{ name, state: e.state, done: e.done, total: e.total, why: e.why ?? null }] : [];
    });
  }

  /** Counts for the tray's tooltip: copies being made now (or paused) and copies still to make. */
  counts(): { making: number; waiting: number } {
    let making = 0;
    let waiting = 0;
    for (const e of this.entries.values()) {
      if (e.state === 'running' || e.state === 'paused') making++;
      else if (e.state === 'waiting' || e.state === 'probing') waiting++;
    }
    return { making, waiting };
  }
}

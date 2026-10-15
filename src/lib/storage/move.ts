// The move engine (Settings_Integrations_Plan.md 6.3): copy, verify, switch, one file at a
// time, resumable, driven by whoever has the storage page open. The database holds the state
// (storage_moves, storage_move_items) and decides what is allowed; this code only moves bytes
// and reports what the providers said. Nothing here deletes anything: a source stays where it
// is until a separate retire call trashes it at its provider.
//
// A batch is one request. It claims one item at a time, copies as many parts as its time and
// byte budget allow, saves the destination's partial state after every part, and gives the item
// back if it ran out of budget; the page calls again. Closing the page loses at most one part.
import { Md5, type Md5State } from './md5.ts';
import { StorageError, type SinkState, type StorageProvider } from './provider.ts';

export type Rpc = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export type ProviderInfo = { id: string; type: string; config: Record<string, unknown> };
export type DestLocation = { id: string; ref: string; state: string; size: number | null; checksum: string | null; remote_checksum: string | null };
export type ClaimItem = {
  id: string;
  state: 'pending' | 'copying' | 'copied' | 'verified';
  kind: 'media_version' | 'mail_file';
  subject: string;
  approved: boolean;
  size: number;
  attempts: number;
  progress: { sink: SinkState; md5: Md5State; offset: number } | null;
  source_ref: string;
  source_checksum: string | null;
  source_remote: string | null;
  name: string | null;
  mime: string | null;
  parent: string | null;
  dest_location: DestLocation | null;
};
export type Claim = { state: string; mode: 'move' | 'copy' | 'backup'; source: ProviderInfo; dest: ProviderInfo; items: ClaimItem[] };

export type BatchDeps = {
  /** The signed-in person's database client: the right to move files is theirs, checked again there. */
  db: Rpc;
  /** The site's server key (MAIL_SERVER_KEY). */
  key: string;
  provider: (p: ProviderInfo) => Promise<StorageProvider>;
  now?: () => number;
  /** Milliseconds a batch may spend. */
  budgetMs?: number;
  /** Bytes a batch may read from the source. */
  maxBytes?: number;
};

export type BatchResult = {
  state: string;
  claimed: number;
  switched: number;
  copied: number;
  failed: number;
  bytes: number;
  /** The batch ended on its budget with work left (or its items are leased): call again. */
  more: boolean;
  /** A provider refused or is not connected: nothing was marked failed, fix the connection and resume. */
  stopped?: 'provider';
};

export const BATCH_MS = 40_000;
export const BATCH_BYTES = 64 * 1024 * 1024;

const isMd5 = (s: string | null | undefined): s is string => typeof s === 'string' && /^[0-9a-f]{32}$/.test(s);
const code = (e: unknown) => {
  const raw = e instanceof StorageError || e instanceof Error ? e.message : 'FAILED';
  const clean = raw.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 60);
  return clean || 'FAILED';
};
/** The provider cannot be reached or refuses the site: not a finding about any file. */
const providerDown = (e: unknown) =>
  e instanceof StorageError && (e.status === 503 || e.status === 401 || e.status === 403 || e.message === 'S3_UNREACHABLE' || e.message === 'NO_SECRET');

class Final extends Error {}

async function call(db: Rpc, name: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

/** One batch of a running move. */
export async function runBatch(deps: BatchDeps, moveId: string): Promise<BatchResult> {
  const now = deps.now ?? Date.now;
  const started = now();
  const budgetMs = deps.budgetMs ?? BATCH_MS;
  let bytesLeft = deps.maxBytes ?? BATCH_BYTES;
  const out: BatchResult = { state: 'running', claimed: 0, switched: 0, copied: 0, failed: 0, bytes: 0, more: false };
  const key = deps.key;
  const rpc = (name: string, args: Record<string, unknown>) => call(deps.db, name, { p_key: key, ...args });

  let src: StorageProvider | null = null;
  let dst: StorageProvider | null = null;

  const outOfBudget = () => now() - started >= budgetMs || bytesLeft <= 0;

  async function process(claim: Claim, item: ClaimItem): Promise<void> {
    const source = src!;
    const dest = dst!;
    const sink = dest.sink?.();
    if (!sink) throw new Final('DEST_NOT_WRITABLE');
    const kindDir = item.kind === 'media_version' ? 'library' : 'mail';

    let phase: ClaimItem['state'] = item.state;
    let ref: string | null = null;
    let whole: string | null = null;
    let remote: string | null = null;
    let sourceProven = false;
    let attached = false;

    // A verified replica is already at the destination (the source of an earlier move, still held).
    const existing = item.dest_location;
    if (phase === 'pending' && !item.progress && existing && existing.state === 'ok' && existing.checksum) {
      await rpc('storage_move_attach', { p_item: item.id, p_location: existing.id });
      phase = 'copied';
      attached = true;
    }
    if (phase === 'copied' || phase === 'verified') {
      if (!existing) throw new Final('DEST_LOCATION_MISSING');
      ref = existing.ref;
      whole = existing.checksum;
      remote = existing.remote_checksum;
    }

    if (phase === 'pending' || phase === 'copying') {
      const copied = await copyBytes(claim, item, source, dest, sink, kindDir);
      if (copied === 'budget') {
        out.more = true;
        return;
      }
      ref = copied.ref;
      whole = copied.whole;
      remote = copied.remote;
      sourceProven = copied.sourceProven;
      out.bytes += item.size;
      phase = 'copied';
    }

    if (phase === 'copied') {
      if (!ref || !whole) throw new Final('DEST_LOCATION_MISSING');
      // Source side: for an attached replica, the source must still be what the replica was made from.
      if (attached || !sourceProven) {
        const now_ = await source.checksum(item.source_ref).catch(() => null);
        if (isMd5(now_)) {
          if (now_ !== whole) throw new Final('SOURCE_CHANGED');
          sourceProven = true;
        } else if (now_ && item.source_remote) {
          if (now_ !== item.source_remote) throw new Final('SOURCE_CHANGED');
          sourceProven = isMd5(item.source_checksum) && item.source_checksum === whole;
        } else if (isMd5(item.source_checksum)) {
          sourceProven = item.source_checksum === whole;
          if (!sourceProven) throw new Final('SOURCE_CHANGED');
        }
      }
      // Destination side: it is there, at the size, and says the same thing it said when it finished.
      const c = await dest.check(ref, item.size);
      if (c.state !== 'ok') {
        await rpc('storage_move_verified', { p_item: item.id, p_ok: false, p_level: 'size', p_error: `DEST_${c.state.toUpperCase()}` });
        out.failed++;
        return;
      }
      const fresh = await dest.checksum(ref).catch(() => null);
      let destProven = false;
      if (fresh && remote) {
        if (fresh !== remote) {
          await rpc('storage_move_verified', { p_item: item.id, p_ok: false, p_level: 'size', p_error: 'DEST_CHECKSUM_CHANGED' });
          out.failed++;
          return;
        }
        destProven = isMd5(remote) ? remote === whole : /^[0-9a-f]{32}-\d+$/.test(remote);
      }
      const level = sourceProven && destProven ? 'checksum' : 'size';
      await rpc('storage_move_verified', { p_item: item.id, p_ok: true, p_level: level, p_error: null });
      out.copied++;
      phase = 'verified';
    }

    if (phase === 'verified') {
      if (claim.mode === 'move') {
        await rpc('storage_move_switch', { p_item: item.id });
        out.switched++;
      }
    }
  }

  async function copyBytes(
    claim: Claim,
    item: ClaimItem,
    source: StorageProvider,
    dest: StorageProvider,
    sink: NonNullable<ReturnType<NonNullable<StorageProvider['sink']>>>,
    kindDir: string,
  ): Promise<'budget' | { ref: string; whole: string; remote: string | null; sourceProven: boolean }> {
    let sinkState: SinkState | null = null;
    let md5 = new Md5();
    let offset = 0;

    const restart = async () => {
      if (sinkState) await sink.abort(sinkState).catch(() => undefined);
      sinkState = null;
      md5 = new Md5();
      offset = 0;
    };

    if (item.progress?.sink) {
      sinkState = item.progress.sink;
      md5 = Md5.from(item.progress.md5);
      offset = item.progress.offset;
      try {
        const r = await sink.resume(sinkState);
        sinkState = r.state;
        if (r.offset < offset) await restart();
        else if (r.offset > offset) {
          // The destination got further than we recorded: hash the gap from the source, do not send it.
          while (offset < r.offset) {
            const end = Math.min(offset + sink.partSize, r.offset) - 1;
            const bytes = await readRange(source, item, offset, end);
            md5.update(bytes);
            offset += bytes.length;
          }
        }
      } catch (e) {
        if (e instanceof StorageError && e.status === 410) await restart();
        else throw e;
      }
    }

    if (!sinkState) {
      // Before anything is written: the source is there and has the size the database says.
      const c = await source.check(item.source_ref, item.size);
      if (c.state === 'missing') throw new Final('SOURCE_MISSING');
      if (c.state === 'failed') throw new Final('SOURCE_SIZE_MISMATCH');
      sinkState = await sink.begin({
        key: `${kindDir}/${item.subject}`,
        name: item.name ?? item.subject,
        mimeType: item.mime ?? 'application/octet-stream',
        size: item.size,
        parentId: item.parent ?? undefined,
      });
      await call(deps.db, 'storage_move_progress', { p_key: key, p_item: item.id, p_progress: { sink: sinkState, md5: md5.state(), offset: 0 }, p_bytes: 0 });
    }

    while (offset < item.size) {
      if (outOfBudget()) {
        await rpc('storage_move_release', { p_item: item.id });
        return 'budget';
      }
      const end = Math.min(offset + sink.partSize, item.size) - 1;
      const bytes = await readRange(source, item, offset, end);
      md5.update(bytes);
      sinkState = await sink.put(sinkState!, offset, bytes, end + 1 >= item.size);
      offset += bytes.length;
      bytesLeft -= bytes.length;
      await rpc('storage_move_progress', { p_item: item.id, p_progress: { sink: sinkState, md5: md5.state(), offset }, p_bytes: offset });
    }

    const whole = md5.digest();
    // What the source says its bytes are, against the bytes just read.
    const sourceNow = await source.checksum(item.source_ref).catch(() => null);
    let sourceProven = false;
    if (isMd5(sourceNow)) {
      if (sourceNow !== whole) {
        await sink.abort(sinkState!).catch(() => undefined);
        throw new Final('SOURCE_CHANGED');
      }
      sourceProven = true;
    }
    if (isMd5(item.source_checksum)) {
      if (item.source_checksum !== whole) {
        await sink.abort(sinkState!).catch(() => undefined);
        throw new Final('SOURCE_CHANGED');
      }
      sourceProven = true;
    }

    const fin = await sink.finish(sinkState!);
    const expected = sink.expectedRemote(sinkState!, whole);
    if (fin.size !== item.size || (expected && fin.remoteChecksum && fin.remoteChecksum !== expected)) {
      await dest.trash(fin.ref).catch(() => undefined);
      throw new Final(fin.size !== item.size ? 'DEST_SIZE_MISMATCH' : 'DEST_CHECKSUM_MISMATCH');
    }
    await rpc('storage_move_copied', { p_item: item.id, p_ref: fin.ref, p_size: fin.size, p_checksum: whole, p_remote: fin.remoteChecksum });
    return { ref: fin.ref, whole, remote: fin.remoteChecksum, sourceProven };
  }

  async function readRange(source: StorageProvider, item: ClaimItem, from: number, to: number): Promise<Uint8Array> {
    const res = await source.open(item.source_ref, `bytes=${from}-${to}`);
    if (res.status === 404) throw new Final('SOURCE_MISSING');
    if (res.status === 401 || res.status === 403) throw new StorageError(503, 'SOURCE_REFUSED');
    const whole = res.status === 200 && from === 0 && to + 1 >= item.size;
    if (res.status !== 206 && !whole) throw new StorageError(502, 'SOURCE_RANGE');
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length !== to - from + 1) throw new StorageError(502, 'SOURCE_SHORT_READ');
    return bytes;
  }

  // The loop: one item at a time, until the budget ends or nothing is left to claim.
  while (true) {
    if (outOfBudget() && out.claimed > 0) {
      out.more = true;
      break;
    }
    const claim = (await rpc('storage_move_claim', { p_id: moveId, p_limit: 1 })) as Claim;
    out.state = claim.state;
    if (claim.state !== 'running') break;
    if (!claim.items.length) break;
    if (!src) {
      try {
        src = await deps.provider(claim.source);
        dst = await deps.provider(claim.dest);
      } catch (e) {
        // Release what was just leased and report the provider, without failing a single file.
        for (const it of claim.items) await rpc('storage_move_release', { p_item: it.id }).catch(() => undefined);
        if (providerDown(e)) {
          out.stopped = 'provider';
          break;
        }
        throw e;
      }
    }
    for (const item of claim.items) {
      out.claimed++;
      try {
        await process(claim, item);
      } catch (e) {
        if (e instanceof Final) {
          const sinkState = item.progress?.sink;
          if (sinkState) await dst!.sink?.().abort(sinkState).catch(() => undefined);
          await rpc('storage_move_fail', { p_item: item.id, p_error: e.message, p_final: true });
          out.failed++;
        } else if (providerDown(e)) {
          await rpc('storage_move_release', { p_item: item.id }).catch(() => undefined);
          out.stopped = 'provider';
          out.more = false;
          return out;
        } else {
          await rpc('storage_move_fail', { p_item: item.id, p_error: code(e), p_final: false }).catch(() => undefined);
        }
      }
    }
    if (out.more) break;
  }
  // `more` also when items are leased by another open page: the caller waits and asks again.
  return out;
}

// Where an export is written (MVP_draft.md 62), so that a long video never sits whole in memory:
//   - a private file of the browser (OPFS, folder studio-exports), written as a stream; its File is
//     read from disk to download it or upload it to the library;
//   - where the browser has no private storage, memory, refused above the 1.6 GB the template tab
//     already uses as its ceiling (MAX_BYTES in src/lib/motion/export.js).
// Browser only.
import type { BufferTarget, StreamTarget } from 'mediabunny';

export const MEMORY_CEILING = 1.6e9;
export const EXPORT_DIR = 'studio-exports';

export type Target = {
  kind: 'device' | 'memory';
  target: StreamTarget | BufferTarget;
  /** The written file, once the output is finalised. */
  result: () => Promise<File>;
  /** Removes a partial file after a cancel or a failure. */
  discard: () => Promise<void>;
};

export async function openTarget(name: string, type: string, expectedBytes: number): Promise<Target> {
  const mb = await import('mediabunny');
  try {
    if (navigator.storage?.getDirectory) {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle(EXPORT_DIR, { create: true });
      // one export kept at a time: the previous ones are removed
      for await (const [k] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) await dir.removeEntry(k).catch(() => undefined);
      const handle = await dir.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      return {
        kind: 'device',
        target: new mb.StreamTarget(writable, { chunked: true }),
        result: async () => {
          const f = await handle.getFile();
          return new File([f], name, { type });
        },
        discard: async () => {
          await writable.abort?.().catch(() => undefined);
          await dir.removeEntry(name).catch(() => undefined);
        },
      };
    }
  } catch {
    // no private storage here: fall back to memory
  }
  if (expectedBytes > MEMORY_CEILING) throw new Error('MEMORY_CEILING');
  const target = new mb.BufferTarget();
  return {
    kind: 'memory',
    target,
    result: async () => new File([target.buffer!], name, { type }),
    discard: async () => undefined,
  };
}

/** Saves a file to the device through an object URL (no copy into memory for a disk-backed File). */
export function download(file: File): string {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  return url;
}

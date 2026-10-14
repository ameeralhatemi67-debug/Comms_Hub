// Google Drive behind the storage provider interface. A thin adapter: every call goes to the
// existing Drive client (../drive/google.ts), whose behaviour is unchanged. What it adds is
// the provider-neutral names and `check`, the one place that knows how Drive words a missing
// or trashed file.
import { DriveError, type Drive } from '../drive/google.ts';
import type { CopyCheck, StorageProvider } from './provider.ts';

export function driveStorage(drive: Drive): StorageProvider {
  return {
    type: 'google_drive',
    rootFolder: () => drive.rootFolder(),
    startUpload: (meta) => drive.startUpload(meta),
    createFolder: (name, parentId) => drive.createFolder(name, parentId),
    rename: (ref, name) => drive.rename(ref, name),
    move: (ref, from, to) => drive.move(ref, from, to),
    trash: (ref) => drive.trash(ref),
    info: (ref) => drive.fileInfo(ref),
    open: (ref, range) => drive.open(ref, range),
    checksum: (ref) => drive.checksum(ref),
    account: () => drive.account(),
    quota: () => drive.quota(),

    async check(ref, expectedSize): Promise<CopyCheck> {
      try {
        const f = await drive.fileInfo(ref);
        const size = f.size === undefined ? null : Number(f.size);
        // In the provider's trash counts as gone: nothing the site serves is read from there.
        if (f.trashed) return { state: 'missing', size };
        if (size !== null && expectedSize != null && size !== expectedSize) return { state: 'failed', size };
        return { state: 'ok', size };
      } catch (e) {
        if (e instanceof DriveError && e.status === 404) return { state: 'missing', size: null };
        // Not connected at all is not a finding about this file: the caller stops the batch.
        if (e instanceof DriveError && e.status === 503) throw e;
        return { state: 'failed', size: null };
      }
    },
  };
}

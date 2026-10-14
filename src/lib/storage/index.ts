// Which provider serves which role. Today every role is Google Drive (storage_roles in the
// database says the same); the backup role has none yet. The map here is read-only until a
// second provider exists (Step S3): the routes ask for a role, never for Drive by name.
import { driveConfigured, getDrive } from '../drive/google.ts';
import { driveStorage } from './drive.ts';
import { StorageError, type StorageProvider, type StorageRole } from './provider.ts';

export { StorageError } from './provider.ts';
export type { CopyCheck, StorageProvider, StorageRole, StoredFile, UploadRequest } from './provider.ts';

/** The roles a provider serves in this build. */
export const SERVED_ROLES: readonly StorageRole[] = ['library', 'mail', 'chat'];

/** The provider for a role. Throws 503 for a role no provider serves yet. */
export function storageFor(role: StorageRole): StorageProvider {
  if (!SERVED_ROLES.includes(role)) throw new StorageError(503, 'NO_PROVIDER_FOR_ROLE');
  return driveStorage(getDrive());
}

/** The provider for this role is set up and may hold a token (not proof that it works). */
export function storageConfigured(role: StorageRole): boolean {
  return SERVED_ROLES.includes(role) && driveConfigured();
}

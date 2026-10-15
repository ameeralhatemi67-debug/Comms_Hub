// Which provider serves which role, and where a given file really is. The routes ask for a role,
// never for a provider by name. A file's reference stays what it was when it was uploaded (a
// Drive id); `storage_serving` says where its live copies are now, so a file that was moved to
// another provider is still opened through the same reference (Settings_Integrations_Plan.md 6.3).
//
// New uploads still go to the role's provider, Google Drive: changing a role's provider is not
// offered, and the plan's step 6.3 moves existing files only.
import { driveConfigured, getDrive, resolveDriveEnv } from '../drive/google.ts';
import { integrationCreds, rotateOneDriveToken, storageServing, vaultSecretById, type ServedCopy } from '../integrations/vault.ts';
import { driveStorage } from './drive.ts';
import { StorageError, type StorageProvider, type StorageRole } from './provider.ts';
import { onedriveStorage } from './onedrive.ts';
import { parseCredentials, s3ConfigFrom, s3Storage } from './s3.ts';

export { StorageError } from './provider.ts';
export type { CopyCheck, SinkState, SinkTarget, StorageProvider, StorageRole, StorageSink, StoredFile, UploadRequest } from './provider.ts';

/** The roles a provider serves in this build. */
export const SERVED_ROLES: readonly StorageRole[] = ['library', 'mail', 'chat'];

/** The provider for a role. Throws 503 for a role no provider serves yet. */
export function storageFor(role: StorageRole): StorageProvider {
  if (!SERVED_ROLES.includes(role)) throw new StorageError(503, 'NO_PROVIDER_FOR_ROLE');
  return driveStorage(getDrive());
}

/** The provider for this role is set up and may hold a token (not proof that it works). */
export async function storageConfigured(role: StorageRole): Promise<boolean> {
  return SERVED_ROLES.includes(role) && driveConfigured(await resolveDriveEnv());
}

// A second provider's connection, kept in this process for a minute so a burst of reads
// asks the vault once. Keyed by the integration and its settings, so an edit is seen at once.
const built = new Map<string, { at: number; provider: StorageProvider }>();
const TTL = 60_000;

/** A provider by integration: Drive, or an S3-compatible store with its key pair from the vault. */
export async function providerFor(p: { id: string; type: string; config: Record<string, unknown> }): Promise<StorageProvider> {
  if (p.type === 'google_drive') return driveStorage(getDrive());
  if (p.type === 's3_compatible') {
    const key = `${p.id}:${JSON.stringify(p.config)}`;
    const hit = built.get(key);
    if (hit && Date.now() - hit.at < TTL) return hit.provider;
    const creds = parseCredentials(await vaultSecretById(p.id, 'storage access'));
    if (!creds) throw new StorageError(503, 'NO_SECRET');
    const provider = s3Storage(s3ConfigFrom(p.config), creds);
    built.set(key, { at: Date.now(), provider });
    return provider;
  }
  if (p.type === 'onedrive') {
    const key = `${p.id}:${JSON.stringify(p.config)}`;
    const hit = built.get(key);
    if (hit && Date.now() - hit.at < TTL) return hit.provider;
    const provider = onedriveStorage({
      auth: async () => {
        // The Microsoft app entered in the site, and this account's refresh token, read when a new access token is needed.
        const app = await integrationCreds('microsoft_app', 'onedrive access');
        const refresh = await vaultSecretById(p.id, 'onedrive access');
        const clientId = typeof app?.config.app_id === 'string' ? app.config.app_id : '';
        return app && clientId && refresh ? { clientId, secret: app.secret, refresh } : null;
      },
      rotate: (token) => rotateOneDriveToken(p.id, token),
    });
    built.set(key, { at: Date.now(), provider });
    return provider;
  }
  throw new StorageError(503, 'UNKNOWN_PROVIDER_TYPE');
}

/** Forget a provider's cached connection (after its key pair or settings change). */
export function forgetProvider(id: string) {
  for (const k of built.keys()) if (k.startsWith(`${id}:`)) built.delete(k);
}

const usable = (c: ServedCopy) => c.state === 'ok' || c.role === 'primary';

/**
 * The bytes of a stored file, from wherever its live copies are: the primary first, then a
 * verified replica if the primary does not answer. `ref` is the reference the database row
 * holds (the Drive id). Falls back to Drive when the database cannot say.
 */
export async function openStored(role: StorageRole, ref: string, range?: string | null): Promise<Response> {
  const copies = ((await storageServing(ref)) ?? []).filter(usable);
  if (!copies.length) return storageFor(role).open(ref, range);
  let last: Response | null = null;
  let error: unknown = null;
  for (const c of copies) {
    try {
      const res = await (await providerFor({ id: c.integration_id, type: c.type, config: c.config })).open(c.ref, range);
      if (res.ok || res.status === 206) return res;
      last = res;
    } catch (e) {
      error = e;
    }
  }
  if (last) return last;
  throw error instanceof Error ? error : new StorageError(502, 'NO_COPY_READABLE');
}

/**
 * This file's live references at providers of one type (Drive, for the library's own folder
 * structure): what a rename or a folder change in the library must be mirrored to. When the
 * database cannot say, a Drive reference is taken to be its own.
 */
export async function copiesAt(type: string, ref: string): Promise<string[]> {
  const copies = await storageServing(ref);
  if (!copies || !copies.length) return type === 'google_drive' ? [ref] : [];
  return copies.filter((c) => c.type === type).map((c) => c.ref);
}

/** Sends every live copy of a file to its provider's recoverable trash (a deleted asset). */
export async function trashEverywhere(role: StorageRole, ref: string): Promise<void> {
  const copies = await storageServing(ref);
  if (!copies || !copies.length) {
    await storageFor(role).trash(ref);
    return;
  }
  for (const c of copies) await (await providerFor({ id: c.integration_id, type: c.type, config: c.config })).trash(c.ref);
}

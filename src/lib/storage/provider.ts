// The storage provider interface (Settings_Integrations_Plan.md 6.2): what the rest of the
// site may ask of wherever files are kept, without knowing which provider it is. Google
// Drive is the first implementation (./drive.ts); OneDrive, Supabase Storage or an
// S3-compatible store come behind the same shape in later steps. Pure types: no network,
// no secrets, importable from anywhere on the server.

/** The roles a provider can serve (migration 20261014140000, storage_roles). */
export type StorageRole = 'library' | 'mail' | 'chat' | 'backup';

/** A failure at a provider, with the HTTP status the provider answered (or the site chose). */
export class StorageError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** A stored file or folder as the provider describes it. */
export type StoredFile = {
  id: string;
  name: string;
  mimeType: string;
  /** Bytes, as the provider words them (a string of digits for Drive). */
  size?: string;
  parents?: string[];
  trashed?: boolean;
  /** Tags the site wrote at upload, so a later "complete" can prove whom the file was made for. */
  appProperties?: Record<string, string>;
};

export type UploadRequest = {
  name: string;
  mimeType: string;
  size: number;
  /** The site origin, so the browser may send the chunks straight to the provider (CORS). */
  origin: string;
  uploadedBy: string;
  /** The provider folder to create the file in. Defaults to the site root folder there. */
  parentId?: string;
  assetId?: string;
};

/** What a check of one stored copy found. */
export type CopyCheck = { state: 'ok' | 'missing' | 'failed'; size: number | null };


/** What a provider's resumable write keeps between requests: ids and offsets, never a secret. */
export type SinkState = Record<string, unknown>;

/** A file to write at a provider from the server, for the move engine. */
export type SinkTarget = {
  /** The object's name where names matter (a path without a leading slash). Drive ignores it. */
  key: string;
  name: string;
  mimeType: string;
  size: number;
  /** The provider folder, where the provider has folders (Drive). */
  parentId?: string;
};

/**
 * A resumable server-side write (Settings_Integrations_Plan.md 6.3: "resumable, throttled").
 * The engine feeds it `partSize` bytes at a time and saves the returned state after each part,
 * so a request that ends early, or a page that is closed, loses at most one part.
 */
export interface StorageSink {
  /** Bytes per part: the engine reads and writes in steps of this size (the last may be shorter). */
  readonly partSize: number;
  begin(target: SinkTarget): Promise<SinkState>;
  /** Asks the destination how far it really got, after a pause or a crash. */
  resume(state: SinkState): Promise<{ state: SinkState; offset: number }>;
  put(state: SinkState, offset: number, bytes: Uint8Array, last: boolean): Promise<SinkState>;
  finish(state: SinkState): Promise<{ ref: string; size: number; remoteChecksum: string | null }>;
  /** Throws away what was written so far. Best effort. */
  abort(state: SinkState): Promise<void>;
  /**
   * The checksum the destination should report for a file whose content hashes to `wholeMd5`:
   * the md5 itself, or for an S3 multipart object the composite ETag. Null when it cannot be known.
   */
  expectedRemote(state: SinkState, wholeMd5: string): string | null;
}

export interface StorageProvider {
  /** The integration type this implements (google_drive). */
  readonly type: string;

  /** The site's own folder at the provider, created on first use. */
  rootFolder(): Promise<string>;
  /** Starts a resumable upload and returns the address the browser sends the chunks to. */
  startUpload(meta: UploadRequest): Promise<string>;
  createFolder(name: string, parentId?: string): Promise<string>;
  rename(ref: string, name: string): Promise<void>;
  move(ref: string, fromParent: string, toParent: string): Promise<void>;
  /** To the provider's recoverable trash; never a hard delete. */
  trash(ref: string): Promise<void>;

  /** The provider's description of one file. Throws StorageError (404 when it is gone). */
  info(ref: string): Promise<StoredFile>;
  /** The raw response for the bytes, honouring a Range header so video can seek. */
  open(ref: string, range?: string | null): Promise<Response>;
  /** A content hash the provider keeps, or null when it has none for this file. */
  checksum(ref: string): Promise<string | null>;

  /** Asks the provider whether a copy is still there, and how big it is. Does not throw for a missing file. */
  check(ref: string, expectedSize?: number | null): Promise<CopyCheck>;
  /** The account the connection belongs to, which doubles as the health check. */
  account(): Promise<string | null>;
  /** Space used and the limit, or null when the provider does not say. */
  quota(): Promise<{ used: number; total: number | null } | null>;

  /** A resumable server-side writer, for providers the move engine may write to. */
  sink?(): StorageSink;
}

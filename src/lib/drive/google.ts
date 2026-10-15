// Google Drive, as the one Google account the owner connected. Server only: it holds
// the client secret and the refresh token, which must never reach a browser. Since Step S1
// of Settings_Integrations_Plan.md the refresh token is read from Supabase Vault first
// (../integrations/vault.ts); GOOGLE_DRIVE_REFRESH_TOKEN stays as a fallback until the
// owner confirms the vault holds it.
//
// A personal Gmail account has no Shared Drives and a service account cannot own
// files there, so the Hub acts as the account itself through OAuth 2.0 offline
// access. The scope is drive.file: the Hub can only see and change files it created,
// never the rest of the account's Drive.

import { vaultReachable, vaultSecret } from '../integrations/vault.ts';
import { StorageError, type SinkState, type SinkTarget, type StorageSink } from '../storage/provider.ts';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const ROOT_NAME = 'Comms Hub';

export type DriveEnv = {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  /** Optional: pin the Hub's folder instead of finding it by name. */
  folderId?: string;
};

export const readDriveEnv = (): DriveEnv => ({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  refreshToken: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
  folderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
});

/** The OAuth client is set up (enough to run the connect flow). */
export const oauthConfigured = (env: DriveEnv = readDriveEnv()) => Boolean(env.clientId && env.clientSecret);

/**
 * The Hub may hold a refresh token: in its environment, or in the vault when the vault can be
 * asked. Whether the vault really holds one is known only by asking (the status route does).
 */
export const driveConfigured = (env: DriveEnv = readDriveEnv()) => oauthConfigured(env) && (Boolean(env.refreshToken) || vaultReachable());

/** A Drive failure. It is a StorageError, so code that serves any provider can catch the base class. */
export class DriveError extends StorageError {}

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  parents?: string[];
  trashed?: boolean;
  appProperties?: Record<string, string>;
};

type Deps = {
  env: DriveEnv;
  fetch: typeof fetch;
  now: () => number;
  /** Where the refresh token comes from; defaults to the environment. */
  tokenSource: () => Promise<string | null | undefined>;
};

export function createDrive(deps: Partial<Deps> = {}) {
  const env = deps.env ?? readDriveEnv();
  const http = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const source = deps.tokenSource ?? (async () => env.refreshToken);
  let token: { value: string; expires: number } | null = null;
  let folder: string | null = env.folderId ?? null;

  async function accessToken(): Promise<string> {
    if (token && token.expires - 60_000 > now()) return token.value;
    if (!oauthConfigured(env)) throw new DriveError(503, 'DRIVE_NOT_CONFIGURED');
    const refreshToken = await source();
    if (!refreshToken) throw new DriveError(503, 'DRIVE_NOT_CONFIGURED');
    const res = await http(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.clientId!,
        client_secret: env.clientSecret!,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) throw new DriveError(res.status === 400 || res.status === 401 ? 502 : res.status, 'TOKEN_REFUSED');
    const data = (await res.json()) as { access_token: string; expires_in: number };
    token = { value: data.access_token, expires: now() + data.expires_in * 1000 };
    return token.value;
  }

  async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
    const { json, ...rest } = init;
    const res = await http(`${API}${path}`, {
      ...rest,
      headers: {
        ...(rest.headers as Record<string, string>),
        Authorization: `Bearer ${await accessToken()}`,
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
    if (!res.ok) throw new DriveError(res.status, `DRIVE_${res.status}`);
    return (await res.json()) as T;
  }

  /** The Hub's own folder in the account's Drive, created on first use. */
  async function rootFolder(): Promise<string> {
    if (folder) return folder;
    const q = `mimeType='${FOLDER_MIME}' and trashed=false and appProperties has { key='commsHubRoot' and value='1' }`;
    const found = await api<{ files?: { id: string }[] }>(
      `/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent('files(id)')}&pageSize=1&spaces=drive`,
    );
    if (found.files?.[0]) return (folder = found.files[0].id);
    const created = await api<{ id: string }>('/files?fields=id', {
      method: 'POST',
      json: { name: ROOT_NAME, mimeType: FOLDER_MIME, appProperties: { commsHubRoot: '1' } },
    });
    return (folder = created.id);
  }

  return {
    rootFolder,

    /** Starts a resumable upload and returns the session address the browser sends chunks to. */
    async startUpload(meta: {
      name: string;
      mimeType: string;
      size: number;
      origin: string;
      uploadedBy: string;
      /** The Drive folder to create the file in. Defaults to the Hub's root folder. */
      parentId?: string;
      /** Stored on the file so a later "complete" can prove which asset it was for. */
      assetId?: string;
    }) {
      const res = await http(`${UPLOAD}/files?uploadType=resumable&fields=${encodeURIComponent('id,name,mimeType,size')}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await accessToken()}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': meta.mimeType,
          'X-Upload-Content-Length': String(meta.size),
          // Lets the browser send the chunks itself (CORS), straight to Google.
          Origin: meta.origin,
        },
        body: JSON.stringify({
          name: meta.name,
          mimeType: meta.mimeType,
          parents: [meta.parentId ?? (await rootFolder())],
          appProperties: {
            commsHub: '1',
            uploadedBy: meta.uploadedBy,
            ...(meta.assetId ? { assetId: meta.assetId } : {}),
          },
        }),
      });
      if (!res.ok) throw new DriveError(res.status, `DRIVE_${res.status}`);
      const location = res.headers.get('location');
      if (!location) throw new DriveError(502, 'NO_UPLOAD_SESSION');
      return location;
    },

    /** A folder in the account's Drive. Defaults to inside the Hub's root folder. */
    async createFolder(name: string, parentId?: string) {
      const parent = parentId ?? (await rootFolder());
      const created = await api<{ id: string }>('/files?fields=id', {
        method: 'POST',
        json: { name, mimeType: FOLDER_MIME, parents: [parent], appProperties: { commsHub: '1' } },
      });
      return created.id;
    },

    /** Renames a file or folder in Drive. */
    async rename(id: string, name: string) {
      await api(`/files/${encodeURIComponent(id)}?fields=id`, { method: 'PATCH', json: { name } });
    },

    /** Moves a file or folder between Drive folders. */
    async move(id: string, fromParent: string, toParent: string) {
      await api(
        `/files/${encodeURIComponent(id)}?addParents=${encodeURIComponent(toParent)}&removeParents=${encodeURIComponent(fromParent)}&fields=id`,
        { method: 'PATCH', json: {} },
      );
    },

    fileInfo(id: string) {
      return api<DriveFile>(
        `/files/${encodeURIComponent(id)}?fields=${encodeURIComponent('id,name,mimeType,size,parents,trashed,appProperties')}`,
      );
    },

    /** The raw Drive response for a file's bytes, honouring a Range header for video seeking. */
    async open(id: string, range?: string | null) {
      return http(`${API}/files/${encodeURIComponent(id)}?alt=media`, {
        headers: { Authorization: `Bearer ${await accessToken()}`, ...(range ? { Range: range } : {}) },
      });
    },

    /** Moves the file to the Drive trash (recoverable for 30 days from Drive itself). */
    async trash(id: string) {
      await api(`/files/${encodeURIComponent(id)}?fields=id`, { method: 'PATCH', json: { trashed: true } });
    },

    /** Drive's own MD5 of a binary file's bytes, or null (folders and Google Docs have none). */
    async checksum(id: string) {
      const f = await api<{ md5Checksum?: string }>(`/files/${encodeURIComponent(id)}?fields=md5Checksum`);
      return f.md5Checksum ?? null;
    },

    /** What the account has used and its limit (null when the account does not say). */
    async quota() {
      const about = await api<{ storageQuota?: { limit?: string; usage?: string } }>(`/about?fields=${encodeURIComponent('storageQuota(limit,usage)')}`);
      const used = Number(about.storageQuota?.usage ?? NaN);
      if (!Number.isFinite(used)) return null;
      const limit = Number(about.storageQuota?.limit ?? NaN);
      return { used, total: Number.isFinite(limit) ? limit : null };
    },

    /**
     * A resumable server-side write into Drive, for the move engine. The session address is a
     * capability: it is kept in the database on the move item and nowhere a browser can read it.
     */
    sink(): StorageSink {
      type DriveSinkState = { kind: 'drive'; session: string; size: number; id: string | null };
      const as = (s: SinkState) => {
        if (s.kind !== 'drive') throw new DriveError(500, 'SINK_STATE_MISMATCH');
        return s as unknown as DriveSinkState;
      };
      const done = async (res: Response, s: DriveSinkState): Promise<DriveSinkState> => {
        const body = (await res.json().catch(() => null)) as { id?: string } | null;
        if (!body?.id) throw new DriveError(502, 'NO_FILE_ID');
        return { ...s, id: body.id };
      };
      return {
        // A multiple of 256 KiB, as Drive's resumable protocol requires for every chunk but the last.
        partSize: 8 * 1024 * 1024,

        async begin(t: SinkTarget) {
          const res = await http(`${UPLOAD}/files?uploadType=resumable&fields=${encodeURIComponent('id')}`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${await accessToken()}`,
              'Content-Type': 'application/json; charset=UTF-8',
              'X-Upload-Content-Type': t.mimeType,
              'X-Upload-Content-Length': String(t.size),
            },
            body: JSON.stringify({
              name: t.name,
              mimeType: t.mimeType,
              parents: [t.parentId ?? (await rootFolder())],
              appProperties: { commsHub: '1', movedBy: 'storage-engine' },
            }),
          });
          if (!res.ok) throw new DriveError(res.status, `DRIVE_${res.status}`);
          const session = res.headers.get('location');
          if (!session) throw new DriveError(502, 'NO_UPLOAD_SESSION');
          return { kind: 'drive', session, size: t.size, id: null } satisfies DriveSinkState as unknown as SinkState;
        },

        // Asks Drive how many bytes the session holds (308 with a Range header), or finishes if it is complete.
        async resume(state) {
          const s = as(state);
          if (s.id) return { state, offset: s.size };
          const res = await http(s.session, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Range': `bytes */${s.size}`, 'Content-Length': '0' },
          });
          if (res.status === 200 || res.status === 201) return { state: (await done(res, s)) as unknown as SinkState, offset: s.size };
          if (res.status === 404 || res.status === 410) throw new DriveError(410, 'SESSION_EXPIRED');
          if (res.status !== 308) throw new DriveError(res.status, `DRIVE_${res.status}`);
          const range = /bytes=0-(\d+)/.exec(res.headers.get('range') ?? '');
          return { state, offset: range ? Number(range[1]) + 1 : 0 };
        },

        async put(state, offset, bytes) {
          const s = as(state);
          const end = offset + bytes.length - 1;
          const res = await http(s.session, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${await accessToken()}`,
              'Content-Range': `bytes ${offset}-${end}/${s.size}`,
              'Content-Length': String(bytes.length),
            },
            body: bytes as unknown as BodyInit,
          });
          if (res.status === 200 || res.status === 201) return (await done(res, s)) as unknown as SinkState;
          if (res.status === 308) return state;
          if (res.status === 404 || res.status === 410) throw new DriveError(410, 'SESSION_EXPIRED');
          throw new DriveError(res.status, `DRIVE_${res.status}`);
        },

        async finish(state) {
          let s = as(state);
          if (!s.id) {
            const r = await this.resume(state);
            s = as(r.state);
          }
          if (!s.id) throw new DriveError(409, 'UPLOAD_INCOMPLETE');
          const f = await api<{ md5Checksum?: string; size?: string }>(
            `/files/${encodeURIComponent(s.id)}?fields=${encodeURIComponent('md5Checksum,size')}`,
          );
          return { ref: s.id, size: Number(f.size ?? s.size), remoteChecksum: f.md5Checksum ?? null };
        },

        async abort(state) {
          const s = as(state);
          if (s.id) return;
          await http(s.session, { method: 'DELETE', headers: { Authorization: `Bearer ${await accessToken()}` } }).catch(() => undefined);
        },

        // Drive reports the plain md5 of the content.
        expectedRemote: (_state, wholeMd5) => wholeMd5,
      };
    },

    /** The Google account the refresh token belongs to. */
    async account() {
      const about = await api<{ user?: { emailAddress?: string } }>(`/about?fields=${encodeURIComponent('user(emailAddress)')}`);
      return about.user?.emailAddress ?? null;
    },
  };
}

export type Drive = ReturnType<typeof createDrive>;

// The refresh token, vault first, kept in this process's memory for a few minutes so a burst
// of requests asks the vault once.
let cached: { value: string | null; source: 'vault' | 'env' | 'none'; at: number } | null = null;
const CACHE_MS = 5 * 60_000;
export async function driveRefreshToken(): Promise<{ value: string | null; source: 'vault' | 'env' | 'none' }> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached;
  const fromVault = await vaultSecret('google_drive', 'drive access');
  const env = readDriveEnv().refreshToken ?? null;
  cached = fromVault ? { value: fromVault, source: 'vault', at: Date.now() } : { value: env, source: env ? 'env' : 'none', at: Date.now() };
  return cached;
}

let shared: Drive | undefined;
/** One instance per server process, built on first use so the build never reads secrets. */
export function getDrive(): Drive {
  return (shared ??= createDrive({ tokenSource: async () => (await driveRefreshToken()).value }));
}

/** After a new token is stored: forget the cached token and the access token made from it. */
export function resetDrive() {
  cached = null;
  shared = undefined;
}

/** The address Google sends the person back to after they approve the connection. */
export const redirectUri = (origin: string) => `${origin}/api/drive/callback`;

export function authUrl(env: DriveEnv, origin: string, state: string, loginHint?: string) {
  const params = new URLSearchParams({
    client_id: env.clientId!,
    redirect_uri: redirectUri(origin),
    response_type: 'code',
    scope: DRIVE_SCOPE,
    access_type: 'offline',
    // Forces Google to hand out a refresh token even if this app was approved before.
    prompt: 'consent',
    include_granted_scopes: 'false',
    state,
  });
  if (loginHint) params.set('login_hint', loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCode(
  env: DriveEnv,
  origin: string,
  code: string,
  http: typeof fetch = fetch,
): Promise<{ refreshToken: string | null; accessToken: string }> {
  const res = await http(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.clientId!,
      client_secret: env.clientSecret!,
      redirect_uri: redirectUri(origin),
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new DriveError(502, 'CODE_REFUSED');
  const data = (await res.json()) as { refresh_token?: string; access_token: string };
  return { refreshToken: data.refresh_token ?? null, accessToken: data.access_token };
}

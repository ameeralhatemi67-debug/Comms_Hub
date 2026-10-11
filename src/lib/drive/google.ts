// Google Drive, as the one Google account the owner connected. Server only: it holds
// the client secret and the refresh token, which must never reach a browser.
//
// A personal Gmail account has no Shared Drives and a service account cannot own
// files there, so the Hub acts as the account itself through OAuth 2.0 offline
// access. The scope is drive.file: the Hub can only see and change files it created,
// never the rest of the account's Drive.

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

/** The Hub holds a refresh token and can talk to Drive. */
export const driveConfigured = (env: DriveEnv = readDriveEnv()) => oauthConfigured(env) && Boolean(env.refreshToken);

export class DriveError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  parents?: string[];
  trashed?: boolean;
  appProperties?: Record<string, string>;
};

type Deps = { env: DriveEnv; fetch: typeof fetch; now: () => number };

export function createDrive(deps: Partial<Deps> = {}) {
  const env = deps.env ?? readDriveEnv();
  const http = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  let token: { value: string; expires: number } | null = null;
  let folder: string | null = env.folderId ?? null;

  async function accessToken(): Promise<string> {
    if (token && token.expires - 60_000 > now()) return token.value;
    if (!driveConfigured(env)) throw new DriveError(503, 'DRIVE_NOT_CONFIGURED');
    const res = await http(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.clientId!,
        client_secret: env.clientSecret!,
        refresh_token: env.refreshToken!,
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
    async startUpload(meta: { name: string; mimeType: string; size: number; origin: string; uploadedBy: string }) {
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
          parents: [await rootFolder()],
          appProperties: { commsHub: '1', uploadedBy: meta.uploadedBy },
        }),
      });
      if (!res.ok) throw new DriveError(res.status, `DRIVE_${res.status}`);
      const location = res.headers.get('location');
      if (!location) throw new DriveError(502, 'NO_UPLOAD_SESSION');
      return location;
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

    /** The Google account the refresh token belongs to. */
    async account() {
      const about = await api<{ user?: { emailAddress?: string } }>(`/about?fields=${encodeURIComponent('user(emailAddress)')}`);
      return about.user?.emailAddress ?? null;
    },
  };
}

export type Drive = ReturnType<typeof createDrive>;

let shared: Drive | undefined;
/** One instance per server process, built on first use so the build never reads secrets. */
export function getDrive(): Drive {
  return (shared ??= createDrive());
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

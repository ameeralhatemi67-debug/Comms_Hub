// OneDrive behind the storage provider interface (Action_Plan.md B10, Settings_Integrations_Plan.md
// S8), through Microsoft Graph, as the one account the Director connected. Server only: it holds the
// app secret and the refresh token, which never reach a browser.
//
// What it is for. The library and the mail keep their files at Google Drive (new uploads still go
// there). OneDrive is a second provider: the move engine copies files to it, verifies them and keeps
// them as replicas or switches to it, the library serves them from it, and the backup engine writes
// to it. So it implements everything the engine and the serving routes ask for, and not the browser's
// direct upload (`startUpload`), which a role's primary provider needs.
//
// The facts below were read from Microsoft's own documentation on 2026-10-15 (the OAuth 2.0
// authorization code flow of the Microsoft identity platform, driveItem: createUploadSession, and
// the hashes resource) and are constants in one place. They change; each guide says the
// documentation is the authority. NOT YET TRIED against a real Microsoft account: it is tested
// against a fake Graph that answers as the documentation says.
//
//  - Access to the account's files is `Files.ReadWrite` with `offline_access` (a refresh token). The
//    site only touches its own folder, «Comms Hub», at the root of the OneDrive.
//  - Verification: quickXorHash is the only content hash both kinds of account always report. The
//    sink hashes the bytes it sends (./quickxor.ts) and the file is "proven" only if OneDrive's own
//    value for the finished file is the same; a copy OneDrive gives no hash for stays at size level.
//  - Uploads are sessions: ranges that are multiples of 320 KiB (the last may be shorter), in order,
//    without the Authorization header on the range requests, resumable by asking the session.
import { QuickXor, type QuickXorState } from './quickxor.ts';
import { StorageError, type CopyCheck, type SinkState, type SinkTarget, type StorageProvider, type StorageSink, type StoredFile } from './provider.ts';

export const MS_AUTH = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
export const MS_TOKEN = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
export const GRAPH_URL = 'https://graph.microsoft.com/v1.0';
/** Read and write the account's files (the site stays in its own folder), and stay connected. */
export const ONEDRIVE_SCOPES = ['offline_access', 'Files.ReadWrite', 'User.Read'] as const;
export const ROOT_FOLDER = 'Comms Hub';
/** 320 KiB, the unit every upload range but the last must be a multiple of. */
export const RANGE_UNIT = 327_680;
/** 10 MiB: 32 units, inside the 5 to 10 MiB Microsoft recommends and under its 60 MiB ceiling. */
export const PART_SIZE = 32 * RANGE_UNIT;

export type OneDriveAuth = { clientId: string; secret: string; refresh: string };

export type OneDriveDeps = {
  /** The app and the refresh token, read when a new access token is needed. Null when not connected. */
  auth: () => Promise<OneDriveAuth | null>;
  /** Called with the new refresh token Microsoft hands back at a refresh, so it can be kept. */
  rotate?: (refresh: string) => Promise<void>;
  fetch?: typeof fetch;
  now?: () => number;
};

export function onedriveAuthUrl(a: { clientId: string; redirectUri: string; state: string; loginHint?: string }): string {
  const q = new URLSearchParams({
    client_id: a.clientId,
    response_type: 'code',
    redirect_uri: a.redirectUri,
    response_mode: 'query',
    scope: ONEDRIVE_SCOPES.join(' '),
    state: a.state,
    prompt: 'select_account',
  });
  if (a.loginHint) q.set('login_hint', a.loginHint);
  return `${MS_AUTH}?${q}`;
}

type Tokens = { access: string; refresh: string | null; expiresInMs: number };

async function tokenRequest(http: typeof fetch, form: Record<string, string>): Promise<{ ok: true; t: Tokens } | { ok: false; status: number; error: string }> {
  let res: Response;
  try {
    res = await http(MS_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    });
  } catch {
    return { ok: false, status: 504, error: 'UNREACHABLE' };
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 200 && typeof body.access_token === 'string') {
    return {
      ok: true,
      t: {
        access: body.access_token,
        refresh: typeof body.refresh_token === 'string' && body.refresh_token ? body.refresh_token : null,
        expiresInMs: (Number(body.expires_in) > 0 ? Number(body.expires_in) : 3600) * 1000,
      },
    };
  }
  return { ok: false, status: res.status, error: String(body.error ?? 'error') };
}

/** The code the person's sign-in returned, exchanged for a refresh token and who it belongs to. */
export async function onedriveExchangeCode(
  a: { clientId: string; secret: string; redirectUri: string; code: string },
  http: typeof fetch = fetch,
): Promise<{ refresh: string; account: string }> {
  const r = await tokenRequest(http, {
    client_id: a.clientId,
    client_secret: a.secret,
    grant_type: 'authorization_code',
    code: a.code,
    redirect_uri: a.redirectUri,
    scope: ONEDRIVE_SCOPES.join(' '),
  });
  if (!r.ok) throw new StorageError(r.status === 504 ? 504 : 400, 'CODE_REFUSED');
  // offline_access gives the refresh token; without it nothing here can be kept.
  if (!r.t.refresh) throw new StorageError(400, 'REFRESH_MISSING');
  const me = await fetchJson(http, `${GRAPH_URL}/me?$select=userPrincipalName,mail`, r.t.access);
  const account = String(me.body.mail ?? me.body.userPrincipalName ?? '');
  if (me.status !== 200 || !account) throw new StorageError(502, 'ACCOUNT_UNKNOWN');
  return { refresh: r.t.refresh, account };
}

/** A pair of app id and secret is checked by exchanging a code that cannot be valid: only a refused client is a refusal. */
export async function microsoftAppCheck(http: typeof fetch, clientId: string, secret: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await tokenRequest(http, {
    client_id: clientId,
    client_secret: secret,
    grant_type: 'authorization_code',
    code: 'not-a-real-code',
    redirect_uri: 'https://localhost/',
  });
  if (r.ok) return { ok: true };
  if (r.status === 504) return { ok: false, error: 'UNREACHABLE' };
  if (r.status === 401 || r.error === 'invalid_client' || r.error === 'unauthorized_client') return { ok: false, error: 'APP_REFUSED' };
  if (r.status >= 500) return { ok: false, error: 'PLATFORM_DOWN' };
  return { ok: true };
}

async function fetchJson(http: typeof fetch, url: string, access: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await http(url, { headers: { Authorization: `Bearer ${access}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000), cache: 'no-store' });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

type Item = {
  id?: string;
  name?: string;
  size?: number;
  folder?: unknown;
  deleted?: unknown;
  file?: { mimeType?: string; hashes?: { quickXorHash?: string } };
  parentReference?: { id?: string };
};

/** A file name OneDrive accepts: none of " * : < > ? / \ | and no trailing dots or spaces. */
export const safeName = (name: string) => {
  const n = name.replace(/[\u0000-\u001f"*:<>?/\\|]/g, '_').replace(/[. ]+$/, '').slice(0, 200).trim();
  return n || 'file';
};

const qxh = (b64: string) => `qxh:${b64}`;
const ranges = (v: unknown): number | null => {
  const first = Array.isArray(v) ? String(v[0] ?? '') : '';
  const m = /^(\d+)-/.exec(first);
  return m ? Number(m[1]) : null;
};

export function onedriveStorage(deps: OneDriveDeps): StorageProvider {
  const http = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  let token: { value: string; expires: number } | null = null;
  let refresh: string | null = null;
  let root: string | null = null;

  async function access(): Promise<string> {
    if (token && token.expires - 60_000 > now()) return token.value;
    const a = await deps.auth();
    if (!a) throw new StorageError(503, 'NO_SECRET');
    const r = await tokenRequest(http, {
      client_id: a.clientId,
      client_secret: a.secret,
      grant_type: 'refresh_token',
      refresh_token: refresh ?? a.refresh,
      scope: ONEDRIVE_SCOPES.join(' '),
    });
    if (!r.ok) {
      if (r.status === 504) throw new StorageError(504, 'ONEDRIVE_UNREACHABLE');
      // invalid_grant: the person revoked it, or it lapsed; connecting again fixes it. Not a finding about a file.
      throw new StorageError(503, r.error === 'invalid_grant' || r.error === 'invalid_client' ? 'TOKEN_REFUSED' : `ONEDRIVE_TOKEN_${r.status}`);
    }
    token = { value: r.t.access, expires: now() + r.t.expiresInMs };
    if (r.t.refresh && r.t.refresh !== (refresh ?? a.refresh)) {
      refresh = r.t.refresh;
      // Kept for next time; failing to keep it never breaks this request (the old one still answers).
      await deps.rotate?.(r.t.refresh).catch(() => undefined);
    }
    return token.value;
  }

  async function graph(path: string, init: RequestInit & { json?: unknown } = {}): Promise<Response> {
    const { json, ...rest } = init;
    let res: Response;
    try {
      res = await http(`${GRAPH_URL}${path}`, {
        ...rest,
        headers: {
          ...(rest.headers as Record<string, string>),
          Authorization: `Bearer ${await access()}`,
          ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: json !== undefined ? JSON.stringify(json) : rest.body,
        cache: 'no-store',
      });
    } catch (e) {
      if (e instanceof StorageError) throw e;
      throw new StorageError(504, 'ONEDRIVE_UNREACHABLE');
    }
    return res;
  }
  async function graphJson<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
    const res = await graph(path, init);
    if (!res.ok) throw new StorageError(res.status === 401 ? 503 : res.status, res.status === 401 ? 'TOKEN_REFUSED' : `ONEDRIVE_${res.status}`);
    return (await res.json()) as T;
  }

  async function rootFolder(): Promise<string> {
    if (root) return root;
    const found = await graph(`/me/drive/root:/${encodeURIComponent(ROOT_FOLDER)}?$select=id,folder`);
    if (found.status === 200) {
      const it = (await found.json()) as Item;
      if (it.id) return (root = it.id);
    } else if (found.status !== 404) {
      throw new StorageError(found.status === 401 ? 503 : found.status, found.status === 401 ? 'TOKEN_REFUSED' : `ONEDRIVE_${found.status}`);
    }
    const made = await graphJson<Item>('/me/drive/root/children', {
      method: 'POST',
      json: { name: ROOT_FOLDER, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' },
    });
    if (!made.id) throw new StorageError(502, 'NO_FOLDER_ID');
    return (root = made.id);
  }

  const toStored = (it: Item): StoredFile => ({
    id: String(it.id ?? ''),
    name: String(it.name ?? ''),
    mimeType: it.folder ? 'application/vnd.onedrive.folder' : String(it.file?.mimeType ?? 'application/octet-stream'),
    size: it.size === undefined ? undefined : String(it.size),
    parents: it.parentReference?.id ? [it.parentReference.id] : undefined,
    trashed: it.deleted ? true : undefined,
  });

  const itemUrl = (ref: string) => `/me/drive/items/${encodeURIComponent(ref)}`;

  return {
    type: 'onedrive',
    rootFolder,

    async startUpload() {
      // The library's browser upload goes to the role's primary provider (Google Drive); a second
      // provider is written to by the move engine and the backup engine, from the server.
      throw new StorageError(501, 'ONEDRIVE_NOT_A_PRIMARY');
    },

    async createFolder(name, parentId) {
      const made = await graphJson<Item>(`${itemUrl(parentId ?? (await rootFolder()))}/children`, {
        method: 'POST',
        json: { name: safeName(name), folder: {}, '@microsoft.graph.conflictBehavior': 'rename' },
      });
      if (!made.id) throw new StorageError(502, 'NO_FOLDER_ID');
      return made.id;
    },

    async rename(ref, name) {
      await graphJson<Item>(itemUrl(ref), { method: 'PATCH', json: { name: safeName(name) } });
    },

    async move(ref, _from, to) {
      await graphJson<Item>(itemUrl(ref), { method: 'PATCH', json: { parentReference: { id: to } } });
    },

    // DELETE puts the item in the account's recycle bin: recoverable, never a hard delete.
    async trash(ref) {
      const res = await graph(itemUrl(ref), { method: 'DELETE' });
      if (res.status !== 204 && res.status !== 404) throw new StorageError(res.status === 401 ? 503 : res.status, `ONEDRIVE_${res.status}`);
    },

    async info(ref) {
      const res = await graph(`${itemUrl(ref)}?$select=id,name,size,folder,deleted,file,parentReference`);
      if (!res.ok) throw new StorageError(res.status === 401 ? 503 : res.status, res.status === 401 ? 'TOKEN_REFUSED' : `ONEDRIVE_${res.status}`);
      return toStored((await res.json()) as Item);
    },

    // The content address answers with a redirect to a pre-authorised download address; the range
    // header goes with it, and the bearer token does not (a cross-origin redirect drops it).
    async open(ref, range) {
      return graph(`${itemUrl(ref)}/content`, { headers: range ? { Range: range } : {}, redirect: 'follow' });
    },

    async checksum(ref) {
      const res = await graph(`${itemUrl(ref)}?$select=id,file`);
      if (!res.ok) return null;
      const h = ((await res.json()) as Item).file?.hashes?.quickXorHash;
      return h ? qxh(h) : null;
    },

    async check(ref, expectedSize): Promise<CopyCheck> {
      try {
        const res = await graph(`${itemUrl(ref)}?$select=id,size,deleted`);
        if (res.status === 404) return { state: 'missing', size: null };
        if (res.status === 401 || res.status === 403) throw new StorageError(503, 'TOKEN_REFUSED');
        if (!res.ok) return { state: 'failed', size: null };
        const it = (await res.json()) as Item;
        const size = it.size === undefined ? null : Number(it.size);
        if (it.deleted) return { state: 'missing', size };
        if (size !== null && expectedSize != null && size !== expectedSize) return { state: 'failed', size };
        return { state: 'ok', size };
      } catch (e) {
        // Not connected is not a finding about this file: the caller stops the batch.
        if (e instanceof StorageError && (e.status === 503 || e.status === 504)) throw e;
        return { state: 'failed', size: null };
      }
    },

    async account() {
      const me = await graphJson<{ mail?: string; userPrincipalName?: string }>('/me?$select=userPrincipalName,mail');
      return me.mail || me.userPrincipalName || null;
    },

    async quota() {
      const d = await graphJson<{ quota?: { used?: number; total?: number } }>('/me/drive?$select=quota');
      const used = Number(d.quota?.used ?? NaN);
      if (!Number.isFinite(used)) return null;
      const total = Number(d.quota?.total ?? NaN);
      return { used, total: Number.isFinite(total) && total > 0 ? total : null };
    },

    sink(): StorageSink {
      type S = {
        kind: 'onedrive';
        url: string;
        size: number;
        id: string | null;
        qx: QuickXorState;
        /** Bytes of the file the hash has seen. A gap the engine filled from the source breaks the proof. */
        qxAt: number;
        qxBroken: boolean;
        hash: string | null;
      };
      const as = (s: SinkState) => {
        if (s.kind !== 'onedrive') throw new StorageError(500, 'SINK_STATE_MISMATCH');
        return s as unknown as S;
      };
      const out = (s: S) => s as unknown as SinkState;
      const finalItem = async (res: Response, s: S): Promise<S> => {
        const it = (await res.json().catch(() => null)) as Item | null;
        if (!it?.id) throw new StorageError(502, 'NO_FILE_ID');
        return { ...s, id: it.id, hash: it.file?.hashes?.quickXorHash ?? null };
      };

      return {
        partSize: PART_SIZE,

        async begin(t: SinkTarget) {
          const parent = t.parentId ?? (await rootFolder());
          const name = encodeURIComponent(safeName(t.name));
          const fresh: S = { kind: 'onedrive', url: '', size: t.size, id: null, qx: new QuickXor().state(), qxAt: 0, qxBroken: false, hash: null };
          if (t.size === 0) {
            // An upload session cannot make an empty file: a plain write does.
            const res = await graph(`${itemUrl(parent)}:/${name}:/content?@microsoft.graph.conflictBehavior=rename`, { method: 'PUT', body: new Uint8Array(0) as unknown as BodyInit });
            if (!res.ok) throw new StorageError(res.status === 401 ? 503 : res.status, `ONEDRIVE_${res.status}`);
            return out(await finalItem(res, fresh));
          }
          const res = await graph(`${itemUrl(parent)}:/${name}:/createUploadSession`, {
            method: 'POST',
            json: { item: { '@microsoft.graph.conflictBehavior': 'rename' } },
          });
          if (!res.ok) throw new StorageError(res.status === 401 ? 503 : res.status, res.status === 507 ? 'ONEDRIVE_QUOTA' : `ONEDRIVE_${res.status}`);
          const body = (await res.json().catch(() => null)) as { uploadUrl?: string } | null;
          if (!body?.uploadUrl || !body.uploadUrl.startsWith('https://')) throw new StorageError(502, 'NO_UPLOAD_SESSION');
          return out({ ...fresh, url: body.uploadUrl });
        },

        // Asks the session which range it still wants; the answer is its next expected byte.
        async resume(state) {
          const s = as(state);
          if (s.id) return { state, offset: s.size };
          let res: Response;
          try {
            res = await http(s.url, { method: 'GET', signal: AbortSignal.timeout(15_000), cache: 'no-store' });
          } catch {
            throw new StorageError(504, 'ONEDRIVE_UNREACHABLE');
          }
          if (res.status === 404 || res.status === 410) throw new StorageError(410, 'SESSION_EXPIRED');
          if (!res.ok) throw new StorageError(res.status, `ONEDRIVE_${res.status}`);
          const body = (await res.json().catch(() => ({}))) as { nextExpectedRanges?: unknown };
          const next = ranges(body.nextExpectedRanges) ?? 0;
          // The engine will hash a gap from the source without sending it: this hash then lacks it.
          return { state: out(next === s.qxAt ? s : { ...s, qxBroken: true }), offset: next };
        },

        // The range requests go to the session address without the bearer token (it is pre-authorised).
        async put(state, offset, bytes) {
          const s = as(state);
          const end = offset + bytes.length - 1;
          let res: Response;
          try {
            res = await http(s.url, {
              method: 'PUT',
              headers: { 'Content-Length': String(bytes.length), 'Content-Range': `bytes ${offset}-${end}/${s.size}` },
              body: bytes as unknown as BodyInit,
              cache: 'no-store',
            });
          } catch {
            throw new StorageError(504, 'ONEDRIVE_UNREACHABLE');
          }
          if (res.status === 404 || res.status === 410) throw new StorageError(410, 'SESSION_EXPIRED');
          if (res.status !== 200 && res.status !== 201 && res.status !== 202) throw new StorageError(res.status, `ONEDRIVE_${res.status}`);
          let next: S = s;
          if (!s.qxBroken && s.qxAt === offset) {
            const q = QuickXor.from(s.qx);
            q.update(bytes);
            next = { ...s, qx: q.state(), qxAt: s.qxAt + bytes.length };
          } else next = { ...s, qxBroken: true };
          if (res.status === 200 || res.status === 201) next = await finalItem(res, next);
          return out(next);
        },

        async finish(state) {
          const s = as(state);
          if (!s.id) throw new StorageError(502, 'NO_FILE_ID');
          let hash = s.hash;
          let size = s.size;
          if (!hash) {
            // The final response did not carry the hash: the item says it, once its content is processed.
            const res = await graph(`${itemUrl(s.id)}?$select=id,size,file`);
            if (res.ok) {
              const it = (await res.json()) as Item;
              hash = it.file?.hashes?.quickXorHash ?? null;
              if (it.size !== undefined) size = Number(it.size);
            }
          }
          return { ref: s.id, size, remoteChecksum: hash ? qxh(hash) : null };
        },

        async abort(state) {
          const s = as(state);
          if (s.id || !s.url) return;
          await http(s.url, { method: 'DELETE', signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
        },

        // What OneDrive should say for what was sent, from the bytes the sink itself saw. Null when it
        // could not see all of them (a gap), so the copy is not called proven.
        expectedRemote(state) {
          const s = as(state);
          if (s.qxBroken || s.qxAt !== s.size) return null;
          return qxh(QuickXor.from(s.qx).digest());
        },
      };
    },
  };
}

/** One look at a connected account: who it is and how much room it has. Never throws. */
export async function onedriveProbe(p: StorageProvider): Promise<{ ok: true; account: string | null; used: number | null; total: number | null } | { ok: false; error: string }> {
  try {
    const [account, quota] = await Promise.all([p.account(), p.quota().catch(() => null)]);
    return { ok: true, account, used: quota?.used ?? null, total: quota?.total ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof StorageError ? e.message : 'ONEDRIVE_ERROR' };
  }
}

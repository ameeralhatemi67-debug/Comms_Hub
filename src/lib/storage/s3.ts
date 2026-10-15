// An S3-compatible object store behind the storage provider interface: Supabase Storage's S3
// endpoint, Backblaze B2, Cloudflare R2, MinIO, AWS S3. Requests are signed with AWS Signature
// Version 4 here, with no SDK, so the whole signing path is visible and tested against the
// published example. Server only: it holds an access key pair, which comes from the vault for
// one request and is never logged or returned.
//
// Objects are named by the file's own id (`library/<version id>`), so a rename or a move of a
// file in the library never touches the store. "Trash" is a copy under `_trash/` followed by a
// delete of the original: the store has no recoverable bin of its own, and nothing is removed for good.
import { createHash, createHmac } from 'node:crypto';
import { Md5, md5Hex, md5OfDigests } from './md5.ts';
import {
  StorageError,
  type CopyCheck,
  type SinkState,
  type SinkTarget,
  type StorageProvider,
  type StorageSink,
  type StoredFile,
} from './provider.ts';

export type S3Config = {
  /** https://host[:port][/path], as the store documents its S3 endpoint. */
  endpoint: string;
  bucket: string;
  region: string;
  /** Prepended to every object key the site writes; may be empty. */
  prefix: string;
  /** Path-style addressing (https://host/bucket/key), the safe default for compatible stores. */
  pathStyle: boolean;
};
export type S3Credentials = { accessKeyId: string; secretAccessKey: string };

/** The settings as the database keeps them (integrations.config). */
export function s3ConfigFrom(config: Record<string, unknown>): S3Config {
  return {
    endpoint: String(config.endpoint ?? ''),
    bucket: String(config.bucket ?? ''),
    region: String(config.region ?? 'auto'),
    prefix: String(config.prefix ?? ''),
    pathStyle: config.path_style !== false,
  };
}

/** The key pair is kept as one vault secret: `ACCESSKEYID:SECRET` (neither half holds a colon). */
export function parseCredentials(secret: string | null | undefined): S3Credentials | null {
  if (!secret) return null;
  const at = secret.indexOf(':');
  if (at < 1 || at === secret.length - 1) return null;
  return { accessKeyId: secret.slice(0, at), secretAccessKey: secret.slice(at + 1) };
}
export const joinCredentials = (c: S3Credentials) => `${c.accessKeyId}:${c.secretAccessKey}`;

// ---------------------------------------------------------------------------
// Signature Version 4
// ---------------------------------------------------------------------------
const sha256Hex = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data).digest();

/** RFC 3986 encoding of one path segment or query value. */
export const uriEncode = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export type SignInput = {
  method: string;
  /** The request URL exactly as it is sent (its path is already encoded). */
  url: URL;
  /** Headers to sign besides host and x-amz-date, lower-case names. */
  headers: Record<string, string>;
  payloadHash: string;
  region: string;
  service?: string;
  credentials: S3Credentials;
  /** Compact ISO time, `20130524T000000Z`. */
  amzDate: string;
  /** Whether to add x-amz-content-sha256 to the signed headers (S3 does). */
  contentHeader?: boolean;
};

/** The headers a request must carry to be accepted, including Authorization. */
export function signRequest(i: SignInput): Record<string, string> {
  const service = i.service ?? 's3';
  const date = i.amzDate.slice(0, 8);
  const all: Record<string, string> = { ...i.headers, host: i.url.host, 'x-amz-date': i.amzDate };
  if (i.contentHeader !== false) all['x-amz-content-sha256'] = i.payloadHash;
  const names = Object.keys(all).sort();
  const canonicalHeaders = names.map((n) => `${n}:${String(all[n]).trim().replace(/\s+/g, ' ')}\n`).join('');
  const signedHeaders = names.join(';');
  const query = [...i.url.searchParams.entries()]
    .map(([k, v]) => [uriEncode(k), uriEncode(v)] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const canonical = [i.method, i.url.pathname, query, canonicalHeaders, signedHeaders, i.payloadHash].join('\n');
  const scope = `${date}/${i.region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', i.amzDate, scope, sha256Hex(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${i.credentials.secretAccessKey}`, date), i.region), service), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  const out: Record<string, string> = { ...all };
  delete out.host; // the HTTP stack sets Host from the URL; it is part of the signature all the same
  out.Authorization = `AWS4-HMAC-SHA256 Credential=${i.credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return out;
}

// ---------------------------------------------------------------------------
// The client
// ---------------------------------------------------------------------------
type Deps = { fetch?: typeof fetch; now?: () => number };
const PART = 8 * 1024 * 1024;
const COPY_LIMIT = 4 * 1024 ** 3;
const COPY_PART = 512 * 1024 ** 2;

const amz = (t: number) => new Date(t).toISOString().replace(/[:-]|\.\d{3}/g, '');
const unquote = (s: string | null) => (s ? s.replace(/^W\//, '').replace(/"/g, '').toLowerCase() : null);
const xml = (body: string, tag: string) => {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(body);
  return m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : null;
};
const isMd5 = (s: string | null | undefined): s is string => typeof s === 'string' && /^[0-9a-f]{32}$/.test(s);

export function createS3(cfg: S3Config, credentials: S3Credentials, deps: Deps = {}) {
  const http = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const prefix = cfg.prefix ? `${cfg.prefix.replace(/^\/+|\/+$/g, '')}/` : '';

  function urlFor(key: string | null, query?: Record<string, string>): URL {
    const base = new URL(cfg.endpoint);
    const root = base.pathname.replace(/\/+$/, '');
    const keyPath = key === null ? '' : key.split('/').map(uriEncode).join('/');
    let host = base.host;
    let path: string;
    if (cfg.pathStyle) {
      path = `${root}/${uriEncode(cfg.bucket)}${key === null ? '' : `/${keyPath}`}`;
    } else {
      host = `${cfg.bucket}.${base.host}`;
      path = `${root}/${keyPath}`;
    }
    const u = new URL(`https://${host}${path}`);
    for (const [k, v] of Object.entries(query ?? {})) u.searchParams.set(k, v);
    return u;
  }

  async function call(
    method: string,
    key: string | null,
    o: { query?: Record<string, string>; headers?: Record<string, string>; body?: Uint8Array | string } = {},
  ): Promise<Response> {
    const url = urlFor(key, o.query);
    const body = o.body === undefined ? undefined : typeof o.body === 'string' ? new TextEncoder().encode(o.body) : o.body;
    const headers = signRequest({
      method,
      url,
      headers: o.headers ?? {},
      payloadHash: sha256Hex(body ?? ''),
      region: cfg.region,
      credentials,
      amzDate: amz(now()),
    });
    try {
      return await http(url, { method, headers, body: body as unknown as BodyInit | undefined });
    } catch {
      throw new StorageError(502, 'S3_UNREACHABLE');
    }
  }

  const need = (res: Response, ok: number[] = [200]) => {
    if (!ok.includes(res.status)) throw new StorageError(res.status, `S3_${res.status}`);
    return res;
  };
  const fullKey = (k: string) => `${prefix}${k}`;

  return {
    call,
    urlFor,
    fullKey,
    need,

    async head(ref: string) {
      return call('HEAD', ref);
    },
    async put(ref: string, bytes: Uint8Array, mime: string) {
      const res = need(await call('PUT', ref, { body: bytes, headers: { 'content-type': mime } }));
      return unquote(res.headers.get('etag'));
    },
    async get(ref: string, range?: string | null) {
      return call('GET', ref, { headers: range ? { range } : {} });
    },
    async del(ref: string) {
      need(await call('DELETE', ref), [200, 204]);
    },
    async createMultipart(ref: string, mime: string) {
      const res = need(await call('POST', ref, { query: { uploads: '' }, headers: { 'content-type': mime } }));
      const id = xml(await res.text(), 'UploadId');
      if (!id) throw new StorageError(502, 'S3_NO_UPLOAD_ID');
      return id;
    },
    async uploadPart(ref: string, uploadId: string, n: number, bytes: Uint8Array) {
      const res = need(await call('PUT', ref, { query: { partNumber: String(n), uploadId }, body: bytes }));
      return unquote(res.headers.get('etag'));
    },
    async completeMultipart(ref: string, uploadId: string, parts: { n: number; etag: string }[]) {
      const body =
        '<CompleteMultipartUpload>' +
        parts.map((p) => `<Part><PartNumber>${p.n}</PartNumber><ETag>"${p.etag}"</ETag></Part>`).join('') +
        '</CompleteMultipartUpload>';
      const res = need(await call('POST', ref, { query: { uploadId }, body, headers: { 'content-type': 'application/xml' } }));
      const text = await res.text();
      // A complete can answer 200 with an error in the body.
      if (/<Error>/.test(text)) throw new StorageError(502, 'S3_COMPLETE_FAILED');
      return unquote(xml(text, 'ETag')) ?? null;
    },
    async abortMultipart(ref: string, uploadId: string) {
      await call('DELETE', ref, { query: { uploadId } });
    },
    async copy(fromRef: string, toRef: string, size: number) {
      const source = `/${uriEncode(cfg.bucket)}/${fromRef.split('/').map(uriEncode).join('/')}`;
      if (size <= COPY_LIMIT) {
        const res = need(await call('PUT', toRef, { headers: { 'x-amz-copy-source': source } }));
        if (/<Error>/.test(await res.text())) throw new StorageError(502, 'S3_COPY_FAILED');
        return;
      }
      const uploadId = await this.createMultipart(toRef, 'application/octet-stream');
      const parts: { n: number; etag: string }[] = [];
      for (let at = 0, n = 1; at < size; at += COPY_PART, n++) {
        const end = Math.min(at + COPY_PART, size) - 1;
        const res = need(
          await call('PUT', toRef, {
            query: { partNumber: String(n), uploadId },
            headers: { 'x-amz-copy-source': source, 'x-amz-copy-source-range': `bytes=${at}-${end}` },
          }),
        );
        const etag = unquote(xml(await res.text(), 'ETag'));
        if (!etag) throw new StorageError(502, 'S3_COPY_FAILED');
        parts.push({ n, etag });
      }
      await this.completeMultipart(toRef, uploadId, parts);
    },
  };
}
export type S3Client = ReturnType<typeof createS3>;

// ---------------------------------------------------------------------------
// The provider
// ---------------------------------------------------------------------------
export function s3Storage(cfg: S3Config, credentials: S3Credentials, deps: Deps = {}): StorageProvider {
  const c = createS3(cfg, credentials, deps);
  const unsupported = () => {
    throw new StorageError(501, 'S3_NOT_SUPPORTED');
  };
  const sizeOf = (res: Response) => {
    const n = Number(res.headers.get('content-length'));
    return Number.isFinite(n) ? n : null;
  };

  return {
    type: 's3_compatible',
    rootFolder: async () => cfg.prefix,
    // Browsers do not upload straight to a store in this build (that needs bucket CORS).
    startUpload: async () => unsupported(),
    // Objects are named by file id: the library's own folders do not exist here.
    createFolder: async () => cfg.prefix,
    rename: async () => undefined,
    move: async () => undefined,

    async trash(ref) {
      const head = await c.head(ref);
      if (head.status === 404) return;
      c.need(head);
      const size = sizeOf(head) ?? 0;
      await c.copy(ref, `_trash/${ref}`, size);
      await c.del(ref);
    },

    async info(ref): Promise<StoredFile> {
      const res = c.need(await c.head(ref));
      return {
        id: ref,
        name: ref.split('/').pop() ?? ref,
        mimeType: res.headers.get('content-type') ?? 'application/octet-stream',
        size: String(sizeOf(res) ?? ''),
      };
    },

    open: (ref, range) => c.get(ref, range),

    async checksum(ref) {
      const res = c.need(await c.head(ref));
      return unquote(res.headers.get('etag'));
    },

    async check(ref, expectedSize): Promise<CopyCheck> {
      let res: Response;
      try {
        res = await c.head(ref);
      } catch (e) {
        if (e instanceof StorageError && e.status === 502) throw e;
        return { state: 'failed', size: null };
      }
      if (res.status === 404) return { state: 'missing', size: null };
      // Refused credentials say nothing about this file: stop the batch.
      if (res.status === 401 || res.status === 403) throw new StorageError(503, 'S3_FORBIDDEN');
      if (!res.ok) return { state: 'failed', size: null };
      const size = sizeOf(res);
      if (size !== null && expectedSize != null && size !== expectedSize) return { state: 'failed', size };
      return { state: 'ok', size };
    },

    async account() {
      const res = await c.call('HEAD', null);
      if (res.status === 404) throw new StorageError(404, 'S3_NO_BUCKET');
      if (res.status === 401 || res.status === 403) throw new StorageError(403, 'S3_FORBIDDEN');
      c.need(res);
      return `${cfg.bucket}@${new URL(cfg.endpoint).host}`;
    },

    quota: async () => null,

    sink: () => s3Sink(c, cfg),
  };
}

// ---------------------------------------------------------------------------
// The sink: a multipart upload kept in the database between requests
// ---------------------------------------------------------------------------
type Part = { n: number; etag: string; md5: string };
type S3SinkState = { kind: 's3'; key: string; mime: string; size: number; uploadId: string | null; parts: Part[] };

function s3Sink(c: S3Client, cfg: S3Config): StorageSink {
  const asState = (s: SinkState) => {
    if (s.kind !== 's3') throw new StorageError(500, 'SINK_STATE_MISMATCH');
    return s as unknown as S3SinkState;
  };
  return {
    partSize: PART,

    async begin(t: SinkTarget) {
      const key = c.fullKey(t.key);
      const multi = t.size > PART;
      const uploadId = multi ? await c.createMultipart(key, t.mimeType) : null;
      return { kind: 's3', key, mime: t.mimeType, size: t.size, uploadId, parts: [] } satisfies S3SinkState as unknown as SinkState;
    },

    // The part list is kept here, so the store is only asked at the end (Complete).
    async resume(state) {
      const s = asState(state);
      return { state, offset: Math.min(s.size, s.parts.length * PART) };
    },

    async put(state, offset, bytes) {
      const s = asState(state);
      const md5 = md5Hex(bytes);
      if (s.uploadId === null) {
        // One part: one object. The ETag of a plain put is the content's md5.
        const etag = await c.put(s.key, bytes, s.mime);
        if (isMd5(etag) && etag !== md5) throw new StorageError(502, 'S3_ETAG_MISMATCH');
        return { ...s, parts: [{ n: 1, etag: etag ?? md5, md5 }] } as unknown as SinkState;
      }
      const n = offset / PART + 1;
      if (!Number.isInteger(n) || n < 1 || n > 10000) throw new StorageError(500, 'S3_BAD_PART');
      const etag = await c.uploadPart(s.key, s.uploadId, n, bytes);
      if (isMd5(etag) && etag !== md5) throw new StorageError(502, 'S3_ETAG_MISMATCH');
      const parts = s.parts.filter((p) => p.n !== n).concat({ n, etag: etag ?? md5, md5 }).sort((a, b) => a.n - b.n);
      return { ...s, parts } as unknown as SinkState;
    },

    async finish(state) {
      const s = asState(state);
      if (s.uploadId === null) {
        return { ref: s.key, size: s.size, remoteChecksum: s.parts[0]?.etag ?? null };
      }
      const etag = await c.completeMultipart(s.key, s.uploadId, s.parts);
      return { ref: s.key, size: s.size, remoteChecksum: etag };
    },

    async abort(state) {
      const s = asState(state);
      if (s.uploadId) await c.abortMultipart(s.key, s.uploadId).catch(() => undefined);
    },

    expectedRemote(state, wholeMd5) {
      const s = asState(state);
      if (s.uploadId === null) return wholeMd5;
      if (!s.parts.length || !s.parts.every((p) => isMd5(p.etag) && p.etag === p.md5)) return null;
      return `${md5OfDigests(s.parts.map((p) => p.md5))}-${s.parts.length}`;
    },
  };
}

/**
 * A write, a read-back and a delete of a small probe object: what «فحص الاتصال» does for a
 * second provider. Proves the credentials, the bucket and that the site may write there.
 */
export async function s3Probe(cfg: S3Config, credentials: S3Credentials, deps: Deps = {}): Promise<{ ok: true; account: string } | { ok: false; error: string }> {
  const c = createS3(cfg, credentials, deps);
  const p = s3Storage(cfg, credentials, deps);
  const key = c.fullKey(`_probe/${Math.random().toString(36).slice(2, 12)}`);
  const body = new TextEncoder().encode('comms-hub storage probe');
  try {
    const account = (await p.account()) ?? cfg.bucket;
    await c.put(key, body, 'text/plain');
    const back = await c.get(key);
    c.need(back);
    const text = new Uint8Array(await back.arrayBuffer());
    await c.del(key);
    if (new Md5().update(text).digest() !== new Md5().update(body).digest()) return { ok: false, error: 'S3_READBACK' };
    return { ok: true, account };
  } catch (e) {
    await c.del(key).catch(() => undefined);
    if (e instanceof StorageError) {
      if (e.status === 401 || e.status === 403) return { ok: false, error: 'S3_FORBIDDEN' };
      if (e.status === 404) return { ok: false, error: 'S3_NO_BUCKET' };
      return { ok: false, error: e.message };
    }
    return { ok: false, error: 'S3_ERROR' };
  }
}

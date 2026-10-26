// commshub-file:// (Desktop_App_Plan.md 5.2 `files` and `cache`, phase D4; DT-10, DT-11): how the page reads
// a file from «هذا الجهاز» where it is, and a copy in the cache folder, in byte ranges like the site's own
// file route. Read-only (GET, HEAD and the CORS question before them). An address names a token or a cache
// name and nothing else (files.ts); there is no way to name a path. A request carrying an Origin must come
// from an address on the list; media elements send none, and the token is a secret only the page on the
// list was given. Registered on the site's own profile only, with the privileges below. Node only: the
// answer is built from a web Request, so the tests call it directly.
import fs from 'node:fs';
import { Readable } from 'node:stream';
import type { CacheStore } from './cache-store.ts';
import type { FileStore } from './file-store.ts';
import { parseAddress } from './files.ts';
import { isAllowed } from './origins.ts';
import { parseRange, rangeHeaders } from './range.ts';

/** standard and secure like https, fetch and CORS for the page, stream so a video element reads it in pieces. */
export const PRIVILEGES = Object.freeze({ standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true });

export type Sources = { files: FileStore; cache: CacheStore; allowed: readonly string[] };

const plain = (status: number, headers: Record<string, string> = {}) => new Response(null, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

export function answer(request: Request, o: Sources): Response {
  const origin = request.headers.get('origin');
  if (origin !== null && !isAllowed(`${origin}/`, o.allowed)) return plain(403);
  const cors: Record<string, string> = origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
  if (request.method === 'OPTIONS') {
    return plain(204, { ...cors, 'Access-Control-Allow-Methods': 'GET, HEAD', 'Access-Control-Allow-Headers': 'Range', 'Access-Control-Max-Age': '600' });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') return plain(405, { ...cors, Allow: 'GET, HEAD' });

  const what = parseAddress(request.url);
  if (!what) return plain(404, cors);
  let file: string;
  let size: number;
  let type: string;
  if (what.kind === 'local') {
    const found = o.files.lookup(what.token);
    if ('missing' in found) return plain(found.missing === 'changed' ? 410 : 404, cors);
    ({ path: file, size, type } = found.record);
  } else {
    const found = o.cache.complete(what.name);
    if (!found) return plain(404, cors);
    ({ file, size } = found);
    type = what.name.endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream';
  }

  const headers: Record<string, string> = {
    ...cors,
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
  };
  const range = parseRange(request.headers.get('range'), size);
  if (range === 'unsatisfiable') return plain(416, { ...headers, 'Content-Range': `bytes */${size}` });
  const part = range === 'full' ? null : range;
  const start = part ? part.start : 0;
  const end = part ? part.end : size - 1;
  Object.assign(headers, part ? rangeHeaders(part, size) : { 'Content-Length': String(size) });
  const body = request.method === 'HEAD' || size === 0 ? null : (Readable.toWeb(fs.createReadStream(file, { start, end })) as unknown as ReadableStream<Uint8Array>);
  return new Response(body, { status: part ? 206 : 200, headers });
}

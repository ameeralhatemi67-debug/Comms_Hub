// How FFmpeg reads the source of a copy in a way that can be paused (Desktop_Power_Ideas.md P-08 and P-30, phase
// D12). Windows gives a program no way to pause another, so the utility process serves each copy's source to FFmpeg
// over a loopback address it alone answers, and pausing a job is stopping the bytes: FFmpeg then waits on its input
// and does nothing until they flow again, so a paused copy loses nothing. The server listens on 127.0.0.1 only,
// answers GET and HEAD of exactly one address per running job, `/` and 32 random bytes in base64url, for that job's
// one file and only while the job runs, checks the Host header (a web page that renamed itself to 127.0.0.1 cannot
// ask), and sends no header that would let a browser read it. FFmpeg reads the same bytes as from the file, so
// the copy is the same; the recipe (media-jobs.ts RECIPE) is unchanged. Pure; media-worker.ts serves.
import { TOKEN } from './files.ts';

export const LOOPBACK_HOST = '127.0.0.1';

/** The address FFmpeg is given in place of the file's path. */
export function servedUrl(port: number, token: string): string {
  if (!Number.isInteger(port) || port <= 0 || port > 65535 || !TOKEN.test(token)) throw new Error('not a served address');
  return `http://${LOOPBACK_HOST}:${port}/${token}`;
}

/** What a request to the loopback server may have: its token, or the status it is refused with. */
export function servedRequest(req: { method?: string; host?: string; url?: string }, port: number, known: (token: string) => boolean): { token: string; head: boolean } | { status: 404 | 405 } {
  if (req.method !== 'GET' && req.method !== 'HEAD') return { status: 405 };
  if (req.host !== `${LOOPBACK_HOST}:${port}`) return { status: 404 };
  const m = /^\/([A-Za-z0-9_-]{43})$/.exec(req.url ?? '');
  if (!m || !TOKEN.test(m[1]) || !known(m[1])) return { status: 404 };
  return { token: m[1], head: req.method === 'HEAD' };
}

/** The headers of a served answer: the bytes and their range, nothing that opens them to a browser. */
export function servedHeaders(size: number, range: { start: number; end: number } | null): Record<string, string> {
  const base = { 'Content-Type': 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (!range) return { ...base, 'Content-Length': String(size) };
  return { ...base, 'Content-Range': `bytes ${range.start}-${range.end}/${size}`, 'Content-Length': String(range.end - range.start + 1) };
}

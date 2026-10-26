// Byte ranges for the application's own file addresses (Desktop_App_Plan.md 5.2 `files` and `cache`,
// phase D4; DT-10). The studio reads a long video in pieces, as it reads the site's file route: one
// range per request, "bytes=a-b", "bytes=a-" or the last n bytes "bytes=-n". A header that is not one
// range of that form is ignored and the whole file is served, as RFC 9110 allows; a range that starts
// past the end cannot be served (416). Pure.

export type ByteRange = { start: number; end: number };

/** The range a request asks for in a file of `size` bytes. `end` is inclusive. */
export function parseRange(header: string | null | undefined, size: number): ByteRange | 'full' | 'unsatisfiable' {
  if (!header) return 'full';
  const m = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(header);
  if (!m || (m[1] === '' && m[2] === '')) return 'full';
  if (size <= 0) return 'unsatisfiable';
  if (m[1] === '') {
    const n = Number(m[2]);
    if (!Number.isSafeInteger(n)) return 'full';
    if (n === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(m[1]);
  const last = m[2] === '' ? size - 1 : Number(m[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(last)) return 'full';
  if (start >= size) return 'unsatisfiable';
  if (last < start) return 'full';
  return { start, end: Math.min(last, size - 1) };
}

/** The headers of a partial answer. */
export function rangeHeaders(r: ByteRange, size: number): Record<string, string> {
  return { 'Content-Range': `bytes ${r.start}-${r.end}/${size}`, 'Content-Length': String(r.end - r.start + 1) };
}

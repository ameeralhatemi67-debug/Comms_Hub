import { guard, fail } from '@/lib/drive/guard';
import { isUuid } from '@/lib/drive/parents';
import { StorageError, storageFor } from '@/lib/storage';
import { serverKeyOrNull } from '@/lib/integrations/vault';
import { NONE_RETRY_MS } from '@/lib/media/thumbs';
import { serverClient } from '@/lib/supabase/server';

// A thumbnail of a stored file (MVP_draft.md section 77): /api/thumb/media/<asset>?v=<version> for a library version,
// /api/thumb/mail/<file> for a file sent in mail or messaging. Who sees it is the database's: exactly who may see the file,
// so no page grant is asked here (a library card in messaging shows its picture to whoever may see the file).
//   * A picture the uploader's browser drew, or one kept earlier, is served and cached by the browser for good: the version
//     is in the address, and a version never changes.
//   * With none yet, the server asks Drive for its own thumbnail of the file, keeps it (thumb_keep, with the server key), and
//     serves it. When Drive has none, `none` is kept so Drive is not asked again for a day, and the page shows its tile.
//   * An empty answer (204) is the page's sign to draw the tile: the picture fails to load, quietly. A 404 means the file is
//     not there, or not this person's to see. Nothing here ever serves the file itself.
const HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'" };

function picture(bytes: Uint8Array, mime: string) {
  return new Response(bytes as BodyInit, {
    headers: { ...HEADERS, 'Content-Type': mime, 'Content-Length': String(bytes.byteLength), 'Cache-Control': 'private, max-age=31536000, immutable' },
  });
}
/** No picture: the tile. Cached a short while, so a page of tiles does not ask again at once. */
const nothing = (seconds = 600) =>
  new Response(null, { status: 204, headers: { ...HEADERS, 'Cache-Control': `private, max-age=${seconds}` } });

/** PostgREST gives a bytea as «\x» and hex. */
function bytesOf(v: unknown): Uint8Array | null {
  if (typeof v !== 'string' || !v.startsWith('\\x')) return null;
  return new Uint8Array(Buffer.from(v.slice(2), 'hex'));
}

export async function GET(request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const g = await guard(request);
  if (!g.ok) return g.response;
  const { kind, id } = await params;
  if ((kind !== 'media' && kind !== 'mail') || !isUuid(id)) return fail(404, 'غير موجود.');
  const v = Number(new URL(request.url).searchParams.get('v'));
  if (kind === 'media' && !(Number.isInteger(v) && v >= 1)) return fail(404, 'غير موجود.');
  const media = kind === 'media';
  const db = await serverClient();

  const read = async () => {
    const q = db.from('file_thumbs').select('state, data, mime, made_at');
    const { data } = await (media ? q.eq('asset_id', id).eq('version', v) : q.eq('mail_file_id', id)).maybeSingle();
    return data as { state: 'ready' | 'none'; data: unknown; mime: string | null; made_at: string } | null;
  };
  const row = await read();
  if (row?.state === 'ready') {
    const b = bytesOf(row.data);
    return b && row.mime ? picture(b, row.mime) : nothing();
  }
  if (row?.state === 'none' && Date.now() - Date.parse(row.made_at) < NONE_RETRY_MS) return nothing(3600);

  // No picture yet: where the file is in Drive, read under the person's own rules. Nothing found means they may not see it.
  let ref: string | null = null;
  if (media) {
    const { data: ver } = await db.from('media_versions').select('drive_file_id').eq('asset_id', id).eq('version', v).maybeSingle();
    ref = (ver?.drive_file_id as string | undefined) ?? null;
  } else {
    for (const fn of ['mail_file', 'chat_file'] as const) {
      const { data } = await db.rpc(fn, { p_id: id });
      const hit = Array.isArray(data) ? (data[0] as { drive_file_id?: string } | undefined) : undefined;
      if (hit?.drive_file_id) {
        ref = hit.drive_file_id;
        break;
      }
    }
  }
  if (!ref) return fail(404, 'غير موجود.');
  const key = serverKeyOrNull();
  if (!key) return nothing();

  // The provider of the file's role: Drive, whose own thumbnail is asked for. A provider with none leaves the tile.
  const provider = storageFor(media ? 'library' : 'mail');
  let got: { bytes: Uint8Array; mime: string } | null = null;
  try {
    got = (await provider.thumbnail?.(ref)) ?? null;
  } catch (e) {
    // A file the provider no longer holds (moved and retired) has no picture there; anything else is a passing failure, not kept.
    if (!(e instanceof StorageError && e.status === 404)) return nothing(60);
  }
  const { data: said } = await db.rpc('thumb_keep', {
    p_key: key,
    p_asset: media ? id : null,
    p_version: media ? v : null,
    p_mail_file: media ? null : id,
    p_data: got ? Buffer.from(got.bytes).toString('base64') : null,
    p_mime: got?.mime ?? null,
  });
  if (got) return picture(got.bytes, got.mime);
  if (said === 'already') {
    const again = await read();
    const b = again?.state === 'ready' ? bytesOf(again.data) : null;
    if (b && again?.mime) return picture(b, again.mime);
  }
  return nothing(3600);
}

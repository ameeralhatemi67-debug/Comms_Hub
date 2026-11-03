import { guard } from '@/lib/drive/guard';
import { serverKeyOrNull } from '@/lib/integrations/vault';
import { isUuid, json } from '@/lib/platforms/route';
import { DEVICE_PIECE, LIBRARY_PIECE, pieceAt } from '@/lib/platforms/test-rules';
import { dbCode, giveUp, libraryPiece, refuse, testInfo, youtubeToken } from '@/lib/platforms/test-server';
import { youtubeDelete, youtubeSendPiece } from '@/lib/platforms/youtube';
import { serverClient } from '@/lib/supabase/server';

export const maxDuration = 60;

// The rest of «تجربة النشر» (MVP_draft.md section 71).
//   PUT ?from=N   one piece of the file, relayed to the upload the server opened: the page's bytes for a file from its
//                 device (each piece exactly the agreed size, so YouTube gets 256 KiB multiples), or a piece the server
//                 reads from the library itself. ?ask=1 sends nothing and asks YouTube where the upload stands.
//   DELETE        a test still uploading is cancelled by whoever started it; a published one is deleted from YouTube by
//                 anyone who may test the account, by the id recorded when it arrived, after the token is checked.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(request, { mutating: true });
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!isUuid(id)) return refuse('TEST_INVALID');
  const q = new URL(request.url).searchParams;
  const from = Number(q.get('from'));
  const asking = q.get('ask') === '1';
  const db = await serverClient();
  const t = await testInfo(db, id);
  if (!t || !t.mine) return refuse('FORBIDDEN');
  if (t.state !== 'uploading' || !t.url) return refuse(t.state === 'uploading' ? 'UPLOAD_EXPIRED' : 'TEST_INVALID');
  if (!Number.isInteger(from) || from < 0 || from >= t.size) return refuse('TEST_INVALID');

  let bytes: Uint8Array = new Uint8Array(0);
  if (!asking) {
    const len = pieceAt(from, t.size, t.source === 'library' ? LIBRARY_PIECE : DEVICE_PIECE);
    if (t.source === 'device') {
      bytes = new Uint8Array(await request.arrayBuffer());
      if (bytes.byteLength !== len) return refuse('TEST_INVALID');
    } else {
      const read = await libraryPiece(db, t, from, len);
      if (!read) return refuse('FILE_UNREADABLE', true);
      bytes = read;
    }
  }

  const tok = await youtubeToken(db, fetch, t, 'تجربة نشر على يوتيوب', false);
  if ('error' in tok) return tok.error === 'UNREACHABLE' ? refuse(tok.error, true) : giveUp(db, id, tok.error);
  const r = await youtubeSendPiece(fetch, { url: t.url, access: tok.access, bytes, from, total: t.size });
  if ('next' in r) return json({ next: r.next });
  if ('video' in r) {
    const { data: state, error } = await db.rpc('platform_test_done', { p_key: serverKeyOrNull(), p_test: id, p_video: r.video.id, p_channel: r.video.channelId, p_privacy: r.video.privacy });
    if (error) return refuse(dbCode(error.message));
    if (state !== 'published') return refuse('CHANNEL_MISMATCH');
    return json({ done: true, video: r.video.id, privacy: r.video.privacy });
  }
  if (r.error === 'UNREACHABLE' || r.error === 'PLATFORM_DOWN') return refuse(r.error, true);
  return giveUp(db, id, r.error);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(request, { mutating: true });
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!isUuid(id)) return refuse('TEST_INVALID');
  const db = await serverClient();
  const t = await testInfo(db, id);
  if (!t) return refuse('FORBIDDEN');

  if (t.state === 'uploading') {
    if (!t.mine) return refuse('FORBIDDEN');
    const { error } = await db.rpc('platform_test_failed', { p_key: serverKeyOrNull(), p_test: id, p_error: 'CANCELLED' });
    return error ? refuse(dbCode(error.message)) : json({ cancelled: true });
  }
  if (t.state !== 'published' || !t.video) return refuse('TEST_INVALID');
  const tok = await youtubeToken(db, fetch, t, 'حذف مقطع تجربة من يوتيوب', true);
  if ('error' in tok) return refuse(tok.error);
  const r = await youtubeDelete(fetch, { access: tok.access, id: t.video });
  if ('error' in r) return refuse(r.error);
  const { error } = await db.rpc('platform_test_deleted', { p_key: serverKeyOrNull(), p_test: id });
  if (error) return refuse(dbCode(error.message));
  return json({ deleted: true, gone: r.gone });
}

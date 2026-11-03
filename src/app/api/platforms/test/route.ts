import { fail, guard } from '@/lib/drive/guard';
import { serverKeyOrNull } from '@/lib/integrations/vault';
import { isUuid, json } from '@/lib/platforms/route';
import { DEVICE_PIECE, LIBRARY_PIECE, TEST_ERROR_AR, testProblem } from '@/lib/platforms/test-rules';
import { igStart } from '@/lib/platforms/test-instagram';
import { dbCode, giveUp, refuse, testInfo, youtubeToken } from '@/lib/platforms/test-server';
import { youtubeOpenUpload } from '@/lib/platforms/youtube';
import { serverClient } from '@/lib/supabase/server';

export const maxDuration = 60;

// Step 1 of «تجربة النشر» (MVP_draft.md sections 71 and 72). The database decides who may test this account and records
// the test. For YouTube the server asks that the account's token still owns its channel, opens the upload there and keeps
// its address; the page gets the test's id and the size of the pieces to send, never a token or an address. Instagram's
// steps are in src/lib/platforms/test-instagram.ts. A library file is named by its id, and its size and type are read under
// the person's own row level security.
export async function POST(request: Request) {
  const g = await guard(request, { mutating: true });
  if (!g.ok) return g.response;
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || !isUuid(b.account)) return fail(400, TEST_ERROR_AR.TEST_INVALID);
  const { data: account } = await (await serverClient()).from('platform_accounts').select('platform').eq('id', b.account).maybeSingle();
  if (account?.platform === 'instagram') return igStart(request, await serverClient(), b, g.account.email);
  if (
    (b.privacy !== 'private' && b.privacy !== 'public') ||
    (b.privacy !== 'private' && b.privacy !== 'public') ||
    typeof b.title !== 'string' ||
    typeof b.description !== 'string' ||
    (b.source !== 'device' && b.source !== 'library')
  )
    return fail(400, TEST_ERROR_AR.TEST_INVALID);
  const db = await serverClient();

  let size: number;
  let mime: string;
  let asset: string | null = null;
  let version: number | null = null;
  if (b.source === 'library') {
    if (!isUuid(b.asset)) return fail(400, TEST_ERROR_AR.TEST_INVALID);
    const { data: f } = await db.from('media_files').select('id, mime_type, size_bytes, current_version').eq('id', b.asset).maybeSingle();
    if (!f) return fail(404, 'الملف غير موجود، أو لا تصل إلى مجلده.');
    size = Number(f.size_bytes);
    mime = String(f.mime_type).toLowerCase();
    asset = f.id as string;
    version = Number(f.current_version);
  } else {
    size = Number(b.size);
    mime = typeof b.mime === 'string' ? b.mime.toLowerCase() : '';
  }
  const problem = testProblem({ title: b.title, description: b.description, size, mime });
  if (problem) return fail(400, problem);

  const { data: id, error } = await db.rpc('platform_test_start', {
    p_account: b.account,
    p: { privacy: b.privacy, title: b.title.trim(), source: b.source, asset, version, size, mime },
  });
  if (error || typeof id !== 'string') return refuse(dbCode(error?.message));
  const t = await testInfo(db, id);
  if (!t) return giveUp(db, id, 'FORBIDDEN');

  const tok = await youtubeToken(db, fetch, t, 'تجربة نشر على يوتيوب', true);
  if ('error' in tok) return giveUp(db, id, tok.error);
  const open = await youtubeOpenUpload(fetch, { access: tok.access, video: { title: b.title, description: b.description, privacy: b.privacy, size, mime } });
  if ('error' in open) return giveUp(db, id, open.error);
  const { error: kept } = await db.rpc('platform_test_session', { p_key: serverKeyOrNull(), p_test: id, p_url: open.url });
  if (kept) return giveUp(db, id, 'PLATFORM_ERROR');
  return json({ test: id, size, piece: b.source === 'library' ? LIBRARY_PIECE : DEVICE_PIECE });
}

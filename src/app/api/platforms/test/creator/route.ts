import { fail, guard } from '@/lib/drive/guard';
import { isUuid } from '@/lib/platforms/route';
import { TEST_ERROR_AR } from '@/lib/platforms/test-rules';
import { ttCreatorFor } from '@/lib/platforms/test-tiktok';
import { serverClient } from '@/lib/supabase/server';

export const maxDuration = 30;

// What TikTok says of the creator before a post (MVP_draft.md section 79): the nickname, the privacy levels the account may use,
// the interactions it has turned off and the longest video it may post. TikTok asks that its posting page reads this each time
// it opens. The database decides who may ask (platform_test_may); the page never holds a token.
export async function POST(request: Request) {
  const g = await guard(request, { mutating: true });
  if (!g.ok) return g.response;
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || !isUuid(b.account)) return fail(400, TEST_ERROR_AR.TEST_INVALID);
  return ttCreatorFor(await serverClient(), b.account, b.purpose === 'direct');
}

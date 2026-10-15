import { fail } from '@/lib/drive/guard';
import { loadSecret } from '@/lib/platforms/connect';
import { PlatformCallError, connErrorAr, metaPages } from '@/lib/platforms/oauth';
import { connectGuard, isUuid, json } from '@/lib/platforms/route';

// What a person's sign-in can connect: the Facebook pages they manage with the Instagram account
// linked to each, or the one TikTok account. Names and ids only: never a token.
export async function GET(request: Request) {
  const g = await connectGuard(request, false);
  if (!g.ok) return g.response;
  const id = new URL(request.url).searchParams.get('id');
  if (!isUuid(id)) return fail(400, 'طلب غير صالح.');

  const { data } = await g.db.rpc('platform_conn_offer', { p_id: id });
  const offer = data as { id: string; type: string; config: Record<string, unknown> } | null;
  if (!offer) return fail(404, 'انتهت صلاحية الربط أو لم يبدأ من هنا. ابدأ من جديد.');

  if (offer.type === 'tiktok_user_offer') {
    const c = offer.config;
    return json({
      provider: 'tiktok',
      candidates: [
        {
          platform: 'tiktok',
          id: String(c.open_id ?? ''),
          name: String(c.display_name ?? 'حساب TikTok'),
          handle: c.username ? `@${String(c.username)}` : null,
          parent: null,
        },
      ],
    });
  }

  const token = await loadSecret(g.db, id, 'قائمة صفحات للاختيار');
  if (!token) return fail(404, 'انتهت صلاحية الربط. ابدأ من جديد.');
  try {
    const pages = await metaPages(fetch, token);
    const candidates = pages.flatMap((p) => [
      { platform: 'facebook', id: p.id, name: p.name, handle: p.username ? `@${p.username}` : null, parent: null, canPost: p.tasks.includes('CREATE_CONTENT') || p.tasks.includes('MANAGE') },
      ...(p.instagram
        ? [{ platform: 'instagram', id: p.instagram.id, name: p.instagram.username ? `@${p.instagram.username}` : p.name, handle: p.instagram.username ? `@${p.instagram.username}` : null, parent: p.name, canPost: true }]
        : []),
    ]);
    return json({ provider: 'meta', candidates });
  } catch (e) {
    return fail(502, connErrorAr(e instanceof PlatformCallError ? e.code : 'PLATFORM_ERROR'));
  }
}

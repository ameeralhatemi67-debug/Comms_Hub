import { fail, guard } from '@/lib/drive/guard';
import { oembedLink, parsePostLink, type PostCheck } from '@/lib/work/x-link';

export const maxDuration = 15;

// X's link route (MVP_draft.md section 81): does the post the publisher pasted exist, and whose is it? X answers this from its public
// lookup (oEmbed) with no key and no sign-in. The answer is advice, never a gate: if X does not answer, the person is told it was not
// checked and the database still decides by the link's own handle. Only a link that is a post's link is ever asked about, and only
// X's own address is ever fetched. Nothing about the work or the person is sent.
export async function POST(request: Request) {
  const g = await guard(request, { mutating: true });
  if (!g.ok) return g.response;
  const b = (await request.json().catch(() => null)) as { url?: unknown } | null;
  const post = typeof b?.url === 'string' && b.url.length <= 300 ? parsePostLink(b.url) : null;
  if (!post) return fail(400, 'هذا ليس رابط منشور على X.');
  const out: PostCheck = { found: null, author: null };
  try {
    const r = await fetch(oembedLink(post), { signal: AbortSignal.timeout(6000), headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (r.status === 404) out.found = false;
    else if (r.ok) {
      const j = (await r.json().catch(() => null)) as { author_url?: unknown } | null;
      out.found = true;
      const m = typeof j?.author_url === 'string' ? /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/?$/i.exec(j.author_url) : null;
      out.author = m ? m[1] : null;
    }
  } catch {
    // X did not answer: not known.
  }
  return Response.json(out, { headers: { 'Cache-Control': 'no-store' } });
}

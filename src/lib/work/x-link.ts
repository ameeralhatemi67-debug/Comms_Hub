// X's link route (MVP_draft.md section 81). X's own API is paid, so an X account may be used by hand-off: the site prepares the post
// (the text, the files, a link that opens X's composer with the text filled in) and the person posts it on X themselves, then gives
// the post's link. Nothing is sent to X from here and no token or key is involved. Pure: drawn by src/components/work/x-handoff.tsx,
// held by tests/x-link.test.mjs. The rules about who may confirm and which link counts are the database's
// (supabase/migrations/20261125120000_work_cycle_x_link_route.sql); the pattern of a post's link is the same in both.

/** X's own composer: it takes text, a url, hashtags, `via`, `related` and `in_reply_to`, and no media (docs.x.com, web intents). */
export const X_COMPOSER = 'https://x.com/intent/tweet';
/** A post's length limit, counted as X counts it. */
export const X_LIMIT = 280;
/** X shortens every link in a post to this many characters. */
export const X_LINK_WEIGHT = 23;

/** The pattern of a post's link; held equal to the database's `x_post_parse` by tests/x-link.test.mjs. */
export const POST_URL = '^https?://(?:www\\.|mobile\\.)?(?:x|twitter)\\.com/([A-Za-z0-9_]{1,15})/status/([0-9]{5,25})(?:[/?#].*)?$';
const POST_RE = new RegExp(POST_URL, 'i');
const LINK_RE = /https?:\/\/\S+/g;

/** The handle without its @ and the spaces around it. */
export const handleOf = (h: string | null | undefined) => (h ?? '').trim().replace(/^@/, '');

/**
 * A post's length as X counts it: every link is 23, a character of the Latin, Arabic and other alphabets up to U+10FF counts 1, and
 * the rest (Chinese, Japanese, Korean, emoji) counts 2 (twitter-text's weights, read 2026-11-25).
 */
export function xLength(text: string): number {
  let units = 0;
  const bare = text.replace(LINK_RE, () => {
    units += X_LINK_WEIGHT;
    return '';
  });
  for (const ch of bare) {
    const c = ch.codePointAt(0)!;
    const one = c <= 4351 || (c >= 8192 && c <= 8205) || (c >= 8208 && c <= 8223) || (c >= 8242 && c <= 8247);
    units += one ? 1 : 2;
  }
  return units;
}

/** The link that opens X's composer with the text filled in. The person still attaches the files and presses «Post». */
export const composerLink = (text: string) => `${X_COMPOSER}?text=${encodeURIComponent(text)}`;

export type PostLink = { handle: string; id: string; url: string };
/** A post's link as the database reads it, or null: the account's handle, the post's number and the address kept. */
export function parsePostLink(input: string): PostLink | null {
  const m = POST_RE.exec((input ?? '').trim());
  return m ? { handle: m[1], id: m[2], url: `https://x.com/${m[1]}/status/${m[2]}` } : null;
}

/** Why a link cannot be confirmed for this account, in words, or null when it can. */
export function postLinkProblem(input: string, handle: string | null | undefined): string | null {
  if (!input.trim()) return 'الصق رابط المنشور بعد أن تنشره على X.';
  const p = parsePostLink(input);
  if (!p) return 'هذا ليس رابط منشور على X. الرابط الصحيح شكله x.com/اسم_الحساب/status/رقم.';
  if (p.handle.toLowerCase() !== handleOf(handle).toLowerCase()) return `هذا المنشور لحساب آخر (@${p.handle}). المنتظَر منشور لـ @${handleOf(handle)}.`;
  return null;
}

/** What the oEmbed lookup says of a post's link: found, not found, or not known (X did not answer). */
export type PostCheck = { found: boolean | null; author: string | null };
/** The address of X's public lookup for a post (no key, no sign-in). Only a link that passes `parsePostLink` is asked about. */
export const oembedLink = (post: PostLink) => `https://publish.x.com/oembed?url=${encodeURIComponent(post.url)}&omit_script=1`;

/** What the page says of X's lookup for this account: advice only, never a gate. */
export type PostNote = { text: string; level: 'ok' | 'warn' | 'bad' } | null;
export function checkNote(c: PostCheck, handle: string | null): PostNote {
  if (c.found === false) return { level: 'warn', text: 'لم يجد X هذا المنشور. تأكد من الرابط بفتحه، فإن كان صحيحاً أكّد.' };
  if (c.found === true && c.author && c.author.toLowerCase() !== handleOf(handle).toLowerCase()) return { level: 'bad', text: `هذا المنشور لحساب @${c.author}.` };
  if (c.found === true) return { level: 'ok', text: 'وجد X المنشور وهو من هذا الحساب.' };
  return { level: 'warn', text: 'لم يتحقق الموقع من المنشور عند X (لم يرد). يكفي أن الرابط لهذا الحساب.' };
}

/** The result of a work on a link account, as the pages say it. */
export type LinkResult = { ok: boolean; pending?: boolean; route?: 'link'; url?: string; why?: string | null };
export const isWaiting = (r: { pending?: boolean } | undefined | null) => !!r?.pending;

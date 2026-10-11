// Access check shared by every Drive and media route. Route handlers sit outside the
// layout, so each one decides for itself who may call it; this is that decision.
import { canOpen, isAdmin, type Account } from '../access';
import { getSession } from '../supabase/session';
import { canUpload, sameOrigin } from './media';

type Rule = {
  /** The call changes something: the request must come from this site. */
  mutating?: boolean;
  /** The caller must hold a grant for this page. */
  page?: string;
  /** The caller must be allowed to add files. */
  upload?: boolean;
  /** Administrators only. */
  admin?: boolean;
};

export const fail = (status: number, error: string) =>
  Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function guard(
  request: Request,
  rule: Rule = {},
): Promise<{ ok: true; account: Account } | { ok: false; response: Response }> {
  if (rule.mutating && !sameOrigin(request.headers.get('origin'), request.url))
    return { ok: false, response: fail(403, 'طلب من خارج النظام.') };

  const session = await getSession();
  if (session.status !== 'ready') return { ok: false, response: fail(401, 'سجّل الدخول أولاً.') };
  const account = session.account;

  if (rule.admin && !isAdmin(account)) return { ok: false, response: fail(403, 'لمسؤول النظام فقط.') };
  if (rule.page && !canOpen(account, rule.page)) return { ok: false, response: fail(403, 'لا تملك صلاحية هذه الصفحة.') };
  if (rule.upload && !canUpload(account)) return { ok: false, response: fail(403, 'هذا الدور لا يضيف ملفات.') };
  return { ok: true, account };
}

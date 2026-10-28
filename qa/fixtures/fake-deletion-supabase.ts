// A stand-in for the Supabase browser client in the account deletion fixture (qa/account-deletion.cjs). It records
// the calls and answers as supabase/migrations/*account_deletion* would for one signed-in person. What it answers is
// set by the check in localStorage: «qa.del» holds the open request, «qa.del.fail» a refusal to give
// (TOO_MANY, PROTECTED_ACCOUNT) or «missing» for a database without the table.
type Call = { name: string; args: unknown };
const w = window as unknown as { __rpc: Call[]; __kicks: number };
w.__rpc = w.__rpc ?? [];

const get = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

export function supabase() {
  const select = () => {
    const chain = {
      eq: () => chain,
      maybeSingle: async () => {
        if (get('qa.del.fail') === 'missing') return { data: null, error: { message: 'relation "public.account_deletions" does not exist' } };
        const open = get('qa.del');
        return { data: open ? JSON.parse(open) : null, error: null };
      },
    };
    return chain;
  };
  return {
    from: (table: string) => ({ select: () => (table === 'account_deletions' ? select() : select()) }),
    rpc: async (name: string, args?: Record<string, unknown>) => {
      w.__rpc.push({ name, args: args ?? null });
      const fail = get('qa.del.fail');
      if (name === 'account_deletion_request') {
        if (fail && fail !== 'missing') return { data: null, error: { message: fail } };
        const row = { id: '0a4d4c6b-9e7f-4a2b-8c4d-0000000000e1', email: 'writer@example.test', name: 'كاتب الفحص', note: (args?.p_note as string | null) ?? null, status: 'open', created_at: '2026-10-28T09:30:00Z' };
        localStorage.setItem('qa.del', JSON.stringify(row));
        return { data: row.id, error: null };
      }
      if (name === 'account_deletion_withdraw') {
        const had = !!get('qa.del');
        localStorage.removeItem('qa.del');
        return { data: had, error: null };
      }
      return { data: null, error: { message: 'UNKNOWN' } };
    },
  };
}

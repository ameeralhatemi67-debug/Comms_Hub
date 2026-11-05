// The database's client for qa/thumbs-flow.cjs: every rpc is recorded with its arguments, in order, beside the page's requests,
// so the check can say a thumbnail was saved for the file just registered, and after it. The rules themselves are the
// database's (supabase/tests/thumbs_rules.sql).
type Call = { at: number; name: string; args: Record<string, unknown> };
const w = window as unknown as { __rpc: Call[] };
w.__rpc = [];
export const supabase = () => ({
  rpc: (name: string, args: Record<string, unknown>) => {
    w.__rpc.push({ at: performance.now(), name, args });
    return Promise.resolve({ data: null, error: null });
  },
});

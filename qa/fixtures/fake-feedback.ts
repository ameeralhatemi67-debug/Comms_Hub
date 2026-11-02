// Stand-ins for qa/feedback-flow.cjs: the note, the marking layer and the inbox are the real components; the database, the
// account and the store are these. The database's rules are held by supabase/tests/feedback_marks_rules.sql. Calls are kept
// on window.__calls, so the check reads exactly what the page would send.
type Call = { fn: string; args: Record<string, unknown> };
const w = window as unknown as { __calls: Call[]; __rows: unknown[]; __mine: unknown[]; __refuse?: string };
w.__calls = [];
w.__rows ??= [];
w.__mine ??= [];

export function supabase() {
  return {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      w.__calls.push({ fn, args });
      if (w.__refuse) return { data: null, error: { message: w.__refuse } };
      if (fn === 'feedback_list') return { data: w.__rows, error: null };
      if (fn === 'feedback_mine') return { data: w.__mine, error: null };
      return { data: null, error: null };
    },
  };
}

export const useHub = () => ({ state: { role: new URLSearchParams(location.search).get('viewAs') ?? 'writer' }, dispatch: () => undefined });
export const useAccount = () => ({ email: 'w@t.test', name: 'كاتب', role: 'writer', pages: [] });
export const useCaps = () => ({ ready: true, has: () => true, evals: [], grants: [], evalOf: () => undefined, reload: async () => undefined });

// A stand-in for the Supabase browser client in the push fixture (qa/android-push.cjs). It records the calls the
// page makes (device_register, device_seen, signing out) and answers them as the push migration would for a signed-in
// person; what device_seen answers is set by the check in localStorage («qa.seen»). The rules themselves are run
// against the real database in supabase/tests/push_rules.sql; this only lets the real component be driven inside
// the application without signing in.
type Call = { name: string; args: unknown };
type Log = { __rpc: Call[]; __signOut: unknown[] };
const w = window as unknown as Log;
w.__rpc = w.__rpc ?? [];
w.__signOut = w.__signOut ?? [];

const seenAnswer = () => {
  try {
    return localStorage.getItem('qa.seen') ?? 'live';
  } catch {
    return 'live';
  }
};

export const DEVICE = '0a4d4c6b-9e7f-4a2b-8c4d-0000000000d1';

export function supabase() {
  return {
    rpc: async (name: string, args: Record<string, unknown>) => {
      w.__rpc.push({ name, args });
      if (name === 'device_seen') return { data: seenAnswer(), error: null };
      if (name === 'device_register') return { data: { id: DEVICE, name: 'هاتف Android', push: args.p_token !== null }, error: null };
      return { data: null, error: { message: 'UNKNOWN' } };
    },
    auth: {
      signOut: async (o?: unknown) => {
        w.__signOut.push(o ?? null);
        return { error: null };
      },
    },
  };
}

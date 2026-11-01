// Stand-ins for the database client, the shell's store and the signed-in account in the flow check of «الحسابات»
// (qa/accounts-flow.cjs). The page's own provider is fake-accounts-flow.tsx; these only keep the requests list, which
// reads for itself, quiet: an empty answer to every read.
const answer = { data: [], error: null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const chain: any = new Proxy(function () {}, { get: (_t, k) => (k === 'then' ? (done: (r: typeof answer) => void) => done(answer) : chain), apply: () => chain });

export const supabase = () => chain;
export const useHub = () => ({ state: { role: 'director', message: '' }, dispatch: () => undefined });
export const useAccount = () => ({ email: 'director@example.test', name: 'مدير الفحص', role: 'director', pages: [], protected: false, caps: [] });

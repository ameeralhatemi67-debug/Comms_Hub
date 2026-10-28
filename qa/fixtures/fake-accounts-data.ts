// A stand-in for «الحسابات»' provider (src/components/accounts/data.tsx) in the account deletion fixture
// (qa/account-deletion.cjs): the director's view, with two open requests to delete an account. What row level
// security lets a person see is held by supabase/tests/account_deletion_rules.sql; this only feeds the real list.
const members = [
  { email: 'director@example.test', display_name: 'مدير الفحص', role: 'director', pages: [], protected: false },
  { email: 'writer@example.test', display_name: 'كاتب الفحص', role: 'writer', pages: [], protected: false },
  { email: 'member@example.test', display_name: 'عضو الفحص', role: 'member', pages: [], protected: false },
];
const deletions = [
  { id: 'd1', email: 'writer@example.test', name: 'كاتب الفحص', note: 'أغادر المؤسسة نهاية الشهر.', status: 'open', created_at: '2026-10-28T09:30:00Z' },
  { id: 'd2', email: 'member@example.test', name: 'عضو الفحص', note: null, status: 'open', created_at: '2026-10-28T10:05:00Z' },
];
const caps = new Set(['accounts.view', 'members.remove', 'members.invite', 'permissions.grant']);

export function useAccounts() {
  return {
    status: 'ready',
    me: { email: 'director@example.test', name: 'مدير الفحص', role: 'director', pages: [], protected: false, caps: [...caps] },
    can: (c: string) => caps.has(c),
    members,
    entry: {},
    requests: [],
    deletions,
    grants: [],
    defaults: [],
    events: [],
    presets: [],
    nameOf: (e: string) => members.find((m) => m.email === e)?.display_name ?? e,
    reload: async () => undefined,
    call: async () => ({ ok: true, data: null }),
    say: () => undefined,
  };
}

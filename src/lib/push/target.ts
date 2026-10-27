// The destination a push notice names, /n/<kind>/<id> (MVP_draft.md 64.3), turned back into the
// page it means. Pure: the notice kind still needs the person's session to find its page.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type PushTarget = { kind: 'notice'; id: string } | { kind: 'chat' | 'mail'; id: string; to: string };

export function pushTarget(kind: string, id: string): PushTarget | null {
  const v = String(id ?? '').toLowerCase();
  if (!UUID.test(v)) return null;
  if (kind === 'notice') return { kind, id: v };
  if (kind === 'chat') return { kind, id: v, to: `/mail/chat?room=${v}` };
  if (kind === 'mail') return { kind, id: v, to: `/mail?thread=${v}` };
  return null;
}

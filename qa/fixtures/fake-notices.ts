// A stand-in for the Supabase browser client in the notices fixture (qa/desktop-native.cjs). The list of
// notifications lives in window.__noticeRows, so the check can add a notice as the database would; the
// read function marks rows read, as notifications_read does for the person's own rows. Only what
// src/components/notices.tsx asks is answered. It lets the real hook run inside the desktop application
// without signing in.
type Row = { id: string; tier: string; body: string; go: unknown; created_at: string; read_at: string | null };

const rows = (): Row[] => {
  const w = window as unknown as { __noticeRows?: Row[] };
  return (w.__noticeRows ??= []);
};

export function supabase() {
  return {
    from(table: string) {
      // On a plainly started application the page reports each read to the check (qa/desktop-helpers.cjs).
      (window as unknown as { __say?: (t: string) => void }).__say?.(`load:${document.visibilityState}:${rows().length}`);
      const answer = () => ({ data: table === 'notifications' ? rows().slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 100) : [], error: null });
      const q = {
        select: () => q,
        order: () => q,
        limit: () => q,
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(answer()).then(ok, bad),
      };
      return q;
    },
    async rpc(name: string, args: { p_ids?: string[] | null }) {
      if (name === 'notifications_read') {
        for (const r of rows()) if (!args.p_ids || args.p_ids.includes(r.id)) r.read_at ??= new Date().toISOString();
      }
      return { data: null, error: null };
    },
  };
}

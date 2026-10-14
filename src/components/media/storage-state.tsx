'use client';
// Where a library file's versions are stored and whether that was checked (the storage state
// the database keeps in file_locations). Read through storage_asset_state, which says only
// the provider's name, never an address. A person who may see the asset may see this.
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { COPY_ROLE_AR, COPY_STATE_AR, checkedAr, type AssetCopy } from '@/lib/integrations/rules';

export function StorageState({ assetId, refreshKey, initial }: { assetId: string; refreshKey?: unknown; initial?: AssetCopy[] }) {
  const [copies, setCopies] = useState<AssetCopy[] | null>(initial ?? null);
  useEffect(() => {
    if (initial) return;
    let live = true;
    void supabase()
      .rpc('storage_asset_state', { p_asset: assetId })
      .then(({ data, error }) => {
        if (live) setCopies(error ? [] : ((data ?? []) as AssetCopy[]));
      });
    return () => {
      live = false;
    };
  }, [assetId, refreshKey, initial]);

  if (!copies) return <span className="muted">…</span>;
  if (!copies.length) return <span className="muted">لا موضع مسجّل</span>;
  return (
    <ul className="mx-storage">
      {copies.map((c, i) => (
        <li key={`${c.version}-${c.role}-${i}`} data-state={c.state}>
          <b>الإصدار {c.version}</b>: {c.provider}
          {c.role !== 'primary' ? ` (${COPY_ROLE_AR[c.role]})` : ''} · {COPY_STATE_AR[c.state]} · <small>{checkedAr(c.verified_at)}</small>
        </li>
      ))}
    </ul>
  );
}

'use client';
// The works a messaging room may be linked to, or a card may show: the real ones this person can
// see (row level security decides), not the prototype's sample works (Action_Plan.md B8).
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { WorkStatus } from '@/lib/work/rules';

export type LinkableWork = { id: string; title: string; status: WorkStatus };

let cache: { at: number; rows: Promise<LinkableWork[]> } | null = null;
const TTL = 30_000;

function load(): Promise<LinkableWork[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.rows;
  const rows = Promise.resolve(
    supabase()
      .from('works')
      .select('id,title,status')
      .order('updated_at', { ascending: false })
      .limit(300),
  ).then((r) => ((r.data as LinkableWork[] | null) ?? []));
  cache = { at: Date.now(), rows };
  return rows;
}

export function useLinkableWorks(): LinkableWork[] {
  const [rows, setRows] = useState<LinkableWork[]>([]);
  useEffect(() => {
    let live = true;
    void load().then((r) => live && setRows(r));
    return () => {
      live = false;
    };
  }, []);
  return rows;
}

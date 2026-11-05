'use client';
// The works whose conversation this person may start or open from the window: those they are
// involved in (owner, creator, participant, a stage's holder), or every open work for the
// director, the assistant and the administrator. chat_work_room decides again in the database.
import { useEffect, useState } from 'react';
import { useAccount } from '@/lib/account-context';
import { supabase } from '@/lib/supabase/client';

export type MyWork = { id: string; title: string; status: string };

let cache: { key: string; at: number; rows: Promise<MyWork[]> } | null = null;
const TTL = 30_000;
const LEADS = ['director', 'assistant', 'admin'];

function load(email: string, role: string): Promise<MyWork[]> {
  const key = `${email}|${role}`;
  if (cache && cache.key === key && Date.now() - cache.at < TTL) return cache.rows;
  const db = supabase();
  const cols = 'id,title,status,closed_at,updated_at';
  type Row = MyWork & { closed_at: string | null; updated_at: string };
  const rows = (async () => {
    let list: Row[] = [];
    if (LEADS.includes(role)) {
      const r = await db.from('works').select(cols).is('closed_at', null).order('updated_at', { ascending: false }).limit(200);
      list = (r.data as Row[] | null) ?? [];
    } else {
      const q = `"${email.replace(/"/g, '')}"`;
      const [own, st] = await Promise.all([
        db.from('works').select(cols).or(`assignee.eq.${q},created_by.eq.${q},people.cs.{${q}}`).limit(200),
        db.from('work_stages').select('work_id').eq('who', email).limit(500),
      ]);
      list = (own.data as Row[] | null) ?? [];
      const more = [...new Set(((st.data as { work_id: string }[] | null) ?? []).map((x) => x.work_id))].filter((id) => !list.some((w) => w.id === id));
      if (more.length) {
        const r = await db.from('works').select(cols).in('id', more);
        list = [...list, ...((r.data as Row[] | null) ?? [])];
      }
      list = list.filter((w) => !w.closed_at).sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
    }
    return list.map(({ id, title, status }) => ({ id, title, status }));
  })().catch(() => [] as MyWork[]);
  cache = { key, at: Date.now(), rows };
  return rows;
}

export function useMyWorks(): MyWork[] {
  const account = useAccount();
  const [rows, setRows] = useState<MyWork[]>([]);
  useEffect(() => {
    let live = true;
    void load(account.email, account.role).then((r) => live && setRows(r));
    return () => {
      live = false;
    };
  }, [account.email, account.role]);
  return rows;
}

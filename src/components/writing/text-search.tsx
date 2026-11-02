'use client';
// Ctrl+/ on any page: a search inside the texts and copies of works this person may see (MVP_draft.md 68.5). The database decides
// what comes back (`work_text_search`). Inside «ورقة الكتابة» the same key opens the sheet's own list of commands.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

type Hit = { work_id: string; title: string; part: 'text' | 'copy'; platform: string | null; n: number; snippet: string };

export function TextSearch() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'Slash' && !e.defaultPrevented && !document.querySelector('dialog[open]')) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
  return open ? <SearchDialog onClose={() => setOpen(false)} /> : null;
}

function SearchDialog({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) return setHits([]);
    let live = true;
    const t = setTimeout(async () => {
      const { data } = await supabase().rpc('work_text_search', { p_q: q.trim() });
      if (live) setHits((data ?? []) as Hit[]);
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);
  return (
    <dialog
      open
      className="wr-search"
      aria-label="بحث داخل النصوص"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <label>
        <Search aria-hidden="true" />
        <input autoFocus value={q} placeholder="ابحث داخل النصوص والنسخ…" aria-label="بحث داخل النصوص" onChange={(e) => setQ(e.target.value)} onBlur={(e) => !e.relatedTarget && !q && onClose()} />
      </label>
      <div className="wr-pal">
        {hits.map((h) => (
          <Link key={`${h.work_id}${h.part}${h.platform}`} className="wr-palrow" href={`/work/${h.work_id}`} onClick={onClose}>
            <span>
              <b>
                {h.work_id} · {h.title}
              </b>
              <small>{h.snippet}</small>
            </span>
          </Link>
        ))}
        {q.trim().length >= 2 && !hits.length && <p className="wr-none">لا نتائج.</p>}
      </div>
    </dialog>
  );
}

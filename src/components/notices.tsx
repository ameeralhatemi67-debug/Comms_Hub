'use client';
// The notifications drawer, from the `notifications` table, in the three tiers of
// disscussios/notification_model.md: «قرارك» waits for this person's action, «انتباه» is
// about their work, «للعلم» is for information. Each person reads their own only (row
// level security, administrators included). Reading a notice does not do or approve the
// work; it opens where the work is. There is no background worker, so the list reloads
// when the page changes, when the window comes back, and once a minute.
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { noticeHref, riyadhStamp, tierLabels, type Tier } from '@/lib/work/rules';

export type Notice = { id: string; tier: Tier; body: string; go: { page?: string; id?: string; tab?: string } | null; created_at: string; read_at: string | null };

export function useNotices() {
  const [list, setList] = useState<Notice[]>([]);
  const path = usePathname();
  const load = useCallback(async () => {
    const { data } = await supabase().from('notifications').select('id,tier,body,go,created_at,read_at').order('created_at', { ascending: false }).limit(100);
    if (data) setList(data as Notice[]);
  }, []);
  useEffect(() => {
    void load();
  }, [load, path]);
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && void load(), 60_000);
    const again = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', again);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', again);
    };
  }, [load]);
  const read = useCallback(
    async (ids: string[] | null) => {
      await supabase().rpc('notifications_read', { p_ids: ids });
      await load();
    },
    [load],
  );
  return { list, unread: list.filter((n) => !n.read_at).length, read, reload: load };
}

const TIERS: Tier[] = ['decide', 'attention', 'info'];

export function NoticeDrawer({ notices, onClose }: { notices: ReturnType<typeof useNotices>; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  useEffect(() => {
    const d = ref.current;
    const opener = document.activeElement as HTMLElement | null;
    d?.showModal();
    return () => {
      d?.close();
      queueMicrotask(() => opener?.isConnected && opener.focus());
    };
  }, []);
  const { list } = notices;
  return (
    <dialog
      ref={ref}
      className="nt-drawer"
      aria-label="الإشعارات"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="nt-body">
        <div className="nt-h">
          <h2>الإشعارات</h2>
          {list.some((n) => !n.read_at) && (
            <button type="button" onClick={() => void notices.read(null)}>
              تعليم الكل كمقروء
            </button>
          )}
          <button type="button" aria-label="إغلاق" onClick={onClose}>
            <X />
          </button>
        </div>
        {!list.length && <p className="nt-note">لا إشعارات.</p>}
        {TIERS.map((t) => {
          const g = list.filter((n) => n.tier === t);
          if (!g.length) return null;
          return (
            <section className="nt-tier" key={t}>
              <h3>
                {tierLabels[t]} <span className={`nt-chip ${t}`}>{g.length}</span>
              </h3>
              {g.map((n) => (
                <button
                  type="button"
                  key={n.id}
                  className={`nt-row ${n.read_at ? '' : 'unread'}`}
                  onClick={() => {
                    if (!n.read_at) void notices.read([n.id]);
                    onClose();
                    router.push(noticeHref(n.go));
                  }}
                >
                  <span>{n.body}</span>
                  <small>{riyadhStamp(n.created_at).slice(5)}</small>
                </button>
              ))}
            </section>
          );
        })}
        <p className="nt-note">«يحتاج قرارك» ينتظر إجراءك، و«يحتاج انتباهك» يخص عملك، و«للعلم» تحديثات. قراءة الإشعار لا تُنجز العمل ولا تعتمده.</p>
      </div>
    </dialog>
  );
}

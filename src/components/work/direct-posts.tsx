'use client';
// Direct posts outside «نشر مباشر» itself (MVP_draft.md 76.6): the list in an account's sheet on «حسابات المنصات», and what the
// calendar reads. Both read platform_tests where `purpose` is 'direct', and row level security decides who sees a post: those who
// may test its account. Both are read only: a scheduled post is cancelled, and a published one deleted, from «نشر مباشر».
import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { directLine, videoUrl } from '@/lib/platforms/test-rules';
import { supabase } from '@/lib/supabase/client';
import type { DirectItem } from '@/lib/work/planning';
import type { AccountRow } from '@/lib/work/rules';
import { useWork } from './data';
import { Ic } from './parts';
import { useTests, when } from './test-kit';

/** The account's last direct posts, in its sheet. Nothing is drawn while it has none. */
export function DirectPosts({ a }: { a: AccountRow }) {
  const w = useWork();
  const [posts] = useTests(a.id, 'direct');
  const [now] = useState(() => Date.now());
  if (!posts.length) return null;
  return (
    <section className="yt-list dp-list" aria-label="المنشورات المباشرة" data-gd="direct-posts">
      <h5>المنشورات المباشرة</h5>
      <p className="yt-sub">تُنشر من «نشر مباشر» في «الرئيسية»، خارج دورة العمل. منه تُلغى جدولتها أو تُحذف.</p>
      {posts.map((t) => {
        const url = t.state === 'published' ? (t.post_url ?? (t.video_id && (t.kind ?? 'video') === 'video' ? videoUrl(t.video_id) : null)) : null;
        return (
          <div className="yt-item" key={t.id} data-test={t.id} data-state={t.state}>
            <span className="yt-item-text">
              <b>
                <bdi>{t.title}</bdi>
              </b>
              <small>
                {directLine(t, now, when)} · {when(t.created_at)} · {w.nameOf(t.created_by)}
              </small>
            </span>
            {url && (
              <span className="yt-item-acts">
                <a className="wk-btn sm quiet" href={url} target="_blank" rel="noopener noreferrer" aria-label={`فتح «${t.title}» على المنصة`}>
                  <Ic i={ExternalLink} />
                  فتح
                </a>
              </span>
            )}
          </div>
        );
      })}
    </section>
  );
}

const COLUMNS = 'id,account_id,kind,title,state,scheduled_for,shown_publish_at,done_at,post_url,video_id,privacy,shown_privacy,created_by';

/** The direct posts the calendar shows: waiting for their time, or published. At most 200, the newest first. */
export function useDirectPosts(): DirectItem[] {
  const [rows, setRows] = useState<DirectItem[]>([]);
  useEffect(() => {
    let live = true;
    void Promise.resolve(
      supabase().from('platform_tests').select(COLUMNS).eq('purpose', 'direct').in('state', ['waiting', 'published']).order('created_at', { ascending: false }).limit(200),
    ).then(
      ({ data }) => {
        if (live) setRows((data ?? []) as DirectItem[]);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);
  return rows;
}

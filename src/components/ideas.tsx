'use client';
// «الأفكار»: an idea is saved here, with a tag, and stays until it becomes a work (MVP_draft.md 68.7). A person sees their own and
// the leaders see all, decided by row level security. Carrying an idea into «إنشاء» sends its words through the session, and the
// real create form marks the idea with the work it became.
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { canOpen } from '@/lib/access';
import { useAccount } from '@/lib/account-context';
import { supabase } from '@/lib/supabase/client';
import { workErrorText } from '@/lib/work/rules';
import { Panel, Title } from './ui';
import { useWork } from './work/data';

type Idea = { id: string; body: string; tag: string | null; author: string; work_id: string | null; created_at: string };

export function IdeasPage() {
  const router = useRouter();
  const account = useAccount();
  const w = useWork();
  const [rows, setRows] = useState<Idea[] | null>(null);
  const [idea, setIdea] = useState('');
  const [tag, setTag] = useState('');
  const [shown, setShown] = useState('');
  const [busy, setBusy] = useState(false);
  const canCreate = canOpen(account, 'create');
  const text = idea.trim();
  const tags = [...new Set((rows ?? []).map((r) => r.tag).filter((t): t is string => !!t))];
  const list = (rows ?? []).filter((r) => !shown || r.tag === shown);

  const load = useCallback(async () => {
    const { data } = await supabase().from('ideas').select('id,body,tag,author,work_id,created_at').order('created_at', { ascending: false }).limit(300);
    setRows((data ?? []) as Idea[]);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    setBusy(true);
    const { error } = await supabase().rpc('idea_add', { p_body: text, p_tag: tag.trim() || null });
    setBusy(false);
    if (error) return w.say(workErrorText(error.message));
    setIdea('');
    await load();
  };
  const remove = async (r: Idea) => {
    const { error } = await supabase().rpc('idea_remove', { p_id: r.id });
    if (error) return w.say(workErrorText(error.message));
    await load();
  };
  const carry = (r: Idea) => {
    const [first, ...rest] = r.body.split('\n');
    try {
      window.sessionStorage.setItem('comms-hub:idea', JSON.stringify({ title: first.slice(0, 140), brief: rest.length ? r.body : '', id: r.id }));
    } catch {
      return w.say('تعذّر فتحها في «إنشاء» من هذا المتصفح.');
    }
    router.push('/create?idea=1');
  };

  return (
    <div dir="rtl">
      <Title title="الأفكار" sub="تبقى الفكرة محفوظة وموسومة حتى تصبح عملاً" />
      <Panel title="فكرة جديدة">
        <label className="field">
          اكتب الفكرة
          <textarea value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="السطر الأول يصير عنوان العمل، وما بعده يدخل في وصفه" rows={4} maxLength={4000} />
        </label>
        <label className="field">
          وسم <small>اختياري</small>
          <input value={tag} list="idea-tags" maxLength={40} placeholder="مثلاً: اليوم الوطني" onChange={(e) => setTag(e.target.value)} />
          <datalist id="idea-tags">
            {tags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <div className="actions">
          <button className="primary" disabled={!text || busy} onClick={() => void add()}>
            <Plus />
            حفظ الفكرة
          </button>
        </div>
      </Panel>
      <Panel title={`الأفكار المحفوظة${rows ? ` (${list.length})` : ''}`}>
        {tags.length > 0 && (
          <div className="wr-ideatags" role="group" aria-label="التصفية بالوسم">
            <button type="button" aria-pressed={!shown} onClick={() => setShown('')}>
              الكل
            </button>
            {tags.map((t) => (
              <button type="button" key={t} aria-pressed={shown === t} onClick={() => setShown(t)}>
                {t}
              </button>
            ))}
          </div>
        )}
        {!rows ? (
          <p className="muted">جارٍ التحميل…</p>
        ) : !list.length ? (
          <p className="muted">لا أفكار بعد. ما تحفظه هنا يبقى حتى يصبح عملاً.</p>
        ) : (
          <ul className="wr-ideas">
            {list.map((r) => (
              <li key={r.id}>
                <span className="b">
                  <b>{r.body.split('\n')[0]}</b>
                  {r.body.includes('\n') && <small>{r.body.split('\n').slice(1).join(' ')}</small>}
                  <small>
                    {r.author === w.me ? 'فكرتك' : w.nameOf(r.author)}
                    {r.tag ? ` · ${r.tag}` : ''}
                  </small>
                </span>
                <span className="a">
                  {r.work_id ? (
                    <Link href={`/work/${r.work_id}`}>صارت عملاً {r.work_id}</Link>
                  ) : (
                    <>
                      <button className="primary" disabled={!canCreate} onClick={() => carry(r)}>
                        <ArrowLeft />
                        تحويل إلى عمل
                      </button>
                      <button className="secondary" aria-label="حذف الفكرة" onClick={() => void remove(r)}>
                        <Trash2 />
                      </button>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {!canCreate && <p className="muted">«إنشاء» غير مفتوحة لحسابك. اطلب فتحها من مدير الاتصال أو مسؤول النظام.</p>}
      </Panel>
    </div>
  );
}

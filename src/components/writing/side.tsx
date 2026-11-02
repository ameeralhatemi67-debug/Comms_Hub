'use client';
// The panel beside the page in «ورقة الكتابة» (MVP_draft.md 68.2): the brief and research notes, the reviewers' notes tied to their
// sentences, the versions, the department's approved phrases, and the style check.
import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { BookMarked, Check, ClipboardList, GitCompare, History, MessageSquareText, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { isLead, riyadhStamp } from '@/lib/work/rules';
import { checkDoc, docText, type Doc, type DocNode } from '@/lib/writing/doc';
import { styleNotes } from '@/lib/writing/style';
import { useWork, type TextVersion, type WorkDetail, type WorkNote } from '../work/data';
import { Hint, Ic } from '../work/parts';

export type SideTab = 'brief' | 'notes' | 'vers' | 'phr' | 'style';

type Phrase = { id: string; title: string; doc: DocNode };

function Phrases({ editor }: { editor: Editor | null }) {
  const w = useWork();
  const [list, setList] = useState<Phrase[] | null>(null);
  const [name, setName] = useState('');
  const lead = isLead(w.role);
  const load = () =>
    void supabase()
      .from('writing_phrases')
      .select('id,title,doc')
      .order('title')
      .then(({ data }) => setList((data ?? []) as Phrase[]));
  useEffect(load, []);
  const insert = (p: Phrase) => {
    const c = checkDoc(p.doc);
    if (c.ok && editor) editor.chain().focus().insertContent(c.doc.content).run();
  };
  const add = async () => {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    const slice = empty ? null : editor.state.doc.slice(from, to).content.toJSON();
    if (!slice) return w.say('حدّد النص الذي تريد حفظه أولاً.');
    const r = await w.call('phrase_add', { p_title: name.trim(), p_doc: { type: 'doc', content: slice } });
    if (!r.ok) return w.say(r.error);
    setName('');
    load();
  };
  const remove = async (p: Phrase) => {
    const r = await w.call('phrase_remove', { p_id: p.id });
    if (!r.ok) return w.say(r.error);
    load();
  };
  return (
    <>
      <Hint>عبارات اعتمدها القسم، تُدرج عند موضع المؤشر.</Hint>
      {list?.length === 0 && <p className="wk-col-hint">لا عبارات بعد.{lead ? ' حدّد نصاً واحفظه هنا.' : ''}</p>}
      {list?.map((p) => (
        <div className="wr-item" key={p.id}>
          <button type="button" className="wr-itemb" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(p)}>
            <b>{p.title}</b>
            <small>{docText(p.doc).slice(0, 60)}</small>
          </button>
          {lead && (
            <button type="button" className="wk-btn icon quiet" aria-label={`حذف «${p.title}»`} onClick={() => void remove(p)}>
              <Ic i={Trash2} />
            </button>
          )}
        </div>
      ))}
      {lead && (
        <div className="wr-addphrase">
          <input className="wk-inp" maxLength={60} placeholder="اسم العبارة" aria-label="اسم العبارة" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="button" className="wk-btn sm" disabled={!name.trim()} onMouseDown={(e) => e.preventDefault()} onClick={() => void add()}>
            حفظ المحدد
          </button>
        </div>
      )}
    </>
  );
}

export function SidePanel(props: {
  d: WorkDetail;
  tab: SideTab;
  setTab: (t: SideTab) => void;
  editor: Editor | null;
  plain: string;
  rich: boolean;
  notes: WorkNote[];
  canResolve: boolean;
  onGoNote: (n: WorkNote) => void;
  onResolve: (n: WorkNote) => void;
  onCompare: () => void;
  onRestore: (t: TextVersion) => void;
  mainDoc: () => Doc | null;
}) {
  const { d, tab, setTab, editor, plain, rich, notes, canResolve, onGoNote, onResolve, onCompare, onRestore, mainDoc } = props;
  const w = useWork();
  const x = d.w;
  const open = notes.filter((n) => !n.resolved_at).length;
  const [research, setResearch] = useState(x.research ?? '');
  const tabs: [SideTab, string, typeof History][] = [
    ['brief', 'الموجز', ClipboardList],
    ['notes', open ? `الملاحظات ${open}` : 'الملاحظات', MessageSquareText],
    ['vers', 'الإصدارات', History],
    ['phr', 'العبارات', BookMarked],
    ['style', 'الفحص', ShieldCheck],
  ];
  const saveResearch = async () => {
    if (research === (x.research ?? '')) return;
    const r = await w.call('work_research_save', { p_work: x.id, p_text: research });
    if (!r.ok) w.say(r.error);
  };
  const flagged = d.flags.filter((f) => f.note);
  const checks = styleNotes(plain);
  const main = mainDoc();
  return (
    <aside className="wr-side" aria-label="الموجز والملاحظات والإصدارات">
      <div className="wr-stabs" role="group" aria-label="اللوحة الجانبية">
        {tabs.map(([k, l, I]) => (
          <button type="button" key={k} aria-pressed={tab === k} data-side={k} onClick={() => setTab(k)}>
            <Ic i={I} />
            {l}
          </button>
        ))}
      </div>
      <div className="wr-sbody">
        {tab === 'brief' && (
          <>
            <h3>الموجز</h3>
            <p className="wr-brief">{x.brief || 'لا يوجد موجز لهذا العمل.'}</p>
            <dl className="wr-facts">
              {x.requester && (
                <div>
                  <dt>طلبه</dt>
                  <dd>{w.nameOf(x.requester)}</dd>
                </div>
              )}
              <div>
                <dt>المسؤول</dt>
                <dd>{w.nameOf(x.assignee) || 'لم يُحدَّد'}</dd>
              </div>
            </dl>
            {!rich && main && (
              <>
                <h3>النص الأساسي</h3>
                <div className="wk-textbox wr-basetext">{docText(main, { images: false }) || 'لا يوجد نص بعد.'}</div>
              </>
            )}
            <label className="l">
              ملاحظات البحث
              <textarea className="wk-inp" rows={5} maxLength={8000} placeholder="المصادر والأرقام وما تجمعه قبل الكتابة" value={research} onChange={(e) => setResearch(e.target.value)} onBlur={() => void saveResearch()} />
            </label>
          </>
        )}
        {tab === 'notes' && (
          <>
            {notes.length > 0 && <Hint>كل ملاحظة مرتبطة بجملتها. «اذهب إليها» يعرض موضعها.</Hint>}
            {flagged.length > 0 &&
              flagged.map((f) => (
                <div className="wr-note-item" key={f.part}>
                  <small>طلب التعديل</small>
                  <p>{f.note}</p>
                </div>
              ))}
            {notes.map((n) => (
              <div className={`wr-note-item ${n.resolved_at ? 'done' : ''}`} key={n.id} data-note-id={n.id}>
                <small>
                  {w.nameOf(n.author)} · {n.part === 'text' ? 'النص الأساسي' : n.part.replace('v:', 'نسخة ')}
                </small>
                {n.quote && <q>{n.quote}</q>}
                <p>{n.body}</p>
                <div className="wr-note-acts">
                  {n.quote && (
                    <button type="button" className="wk-btn sm" onClick={() => onGoNote(n)}>
                      اذهب إليها
                    </button>
                  )}
                  {n.resolved_at ? (
                    <span className="wk-chip ok">عولجت</span>
                  ) : canResolve ? (
                    <button type="button" className="wk-btn sm" onClick={() => onResolve(n)}>
                      <Ic i={Check} />
                      عولجت
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
            {!notes.length && !flagged.length && <p className="wk-col-hint">لا ملاحظات على هذا العمل.</p>}
          </>
        )}
        {tab === 'vers' &&
          (d.texts.length ? (
            <>
              <button type="button" className="wk-btn sm primary" id="wrCompare" onClick={onCompare}>
                <Ic i={GitCompare} />
                مقارنة الإصدارات
              </button>
              {[...d.texts].reverse().map((t) => (
                <div className="wr-note-item" key={t.n} data-version={t.n}>
                  <b>الإصدار {t.n}</b>
                  <small>
                    {w.nameOf(t.author)} · <span className="ltr">{riyadhStamp(t.created_at)}</span>
                  </small>
                  {t.note && <p>{t.note}</p>}
                  {t.pruned_at && <small>حُذف ملفه بعد تجاوز حد الإصدارات، ويبقى نصه العادي.</small>}
                  <div className="wr-note-acts">
                    <button type="button" className="wk-btn sm" onClick={() => onRestore(t)}>
                      <Ic i={RotateCcw} />
                      استعادة هذا الإصدار
                    </button>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <Hint>لا إصدار بعد. مسودتك تبقى لك وحدك حتى تضغط «حفظ إصدار».</Hint>
          ))}
        {tab === 'phr' && <Phrases editor={editor} />}
        {tab === 'style' && (
          <>
            <Hint i={ShieldCheck}>قواعد ثابتة من أسلوب القسم، بلا ذكاء اصطناعي.</Hint>
            {checks.length ? (
              checks.map((c) => (
                <div className="wr-note-item" key={c.text}>
                  <p>{c.text}</p>
                  {c.count > 1 && <small>{c.count} مرات</small>}
                </div>
              ))
            ) : (
              <p className="wk-col-hint">لا ملاحظات على هذا النص.</p>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

'use client';
// «تجربة النشر بالرابط» on an X account added «بالرابط» (MVP_draft.md section 83), in the account's sheet of «حسابات المنصات», where the
// other platforms' accounts have theirs. Nothing is sent to X and nothing is deleted there: a person gives the link of a post of the
// account, one already on X («فحص بلا نشر») or a test post they publish by hand from X's composer («نشر تجريبي»), and the database
// records that the account's handle and that post agree (x_link_test_record). X's public lookup is asked first, as advice only: it never
// decides. Who may test and which link counts are the database's; the page only explains and asks. Words and rules: src/lib/work/x-link-test.ts.
import { useCallback, useEffect, useState } from 'react';
import { Check, ExternalLink, FlaskConical } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import type { AccountRow } from '@/lib/work/rules';
import { X_LIMIT, checkNote, composerLink, handleOf, parsePostLink, postLinkProblem, withRef, type PostCheck, type PostNote, type RefMode } from '@/lib/work/x-link';
import {
  X_TEST_MODE_AR,
  X_TEST_MODE_HELP_AR,
  X_TEST_NOT_READY,
  X_TEST_TEXT,
  profileLink,
  shownLink,
  testLineAr,
  testTextLength,
  testTextProblem,
  xTestErrorAr,
  xTestNotReady,
  type XLinkTestRow,
  type XTestMode,
} from '@/lib/work/x-link-test';
import { useWork } from './data';
import { Hint, Ic } from './parts';
import { when } from './test-kit';

type Phase = { t: 'idle' } | { t: 'ok'; kept: boolean; mode: XTestMode; post: string; lookup: PostNote } | { t: 'error'; text: string };

/** The account's last five tests, as row level security shows them to this person; empty before the migration. */
function useXLinkTests(account: string): [XLinkTestRow[], () => Promise<void>] {
  const [rows, setRows] = useState<XLinkTestRow[]>([]);
  const load = useCallback(async () => {
    const { data, error } = await supabase().from('x_link_tests').select('id,account_id,mode,post_id,post_url,created_by,created_at').eq('account_id', account).order('created_at', { ascending: false }).limit(5);
    setRows(error ? [] : ((data ?? []) as unknown as XLinkTestRow[]));
  }, [account]);
  useEffect(() => {
    void load();
  }, [load]);
  return [rows, load];
}

export function XLinkTest({ a }: { a: AccountRow }) {
  const w = useWork();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<XTestMode>('existing');
  const [text, setText] = useState(X_TEST_TEXT);
  const [signed, setSigned] = useState(false);
  const [refMode, setRefMode] = useState<RefMode>('none');
  const [ref, setRef] = useState('');
  const sent = withRef(text, refMode, ref);
  const [url, setUrl] = useState('');
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<Phase>({ t: 'idle' });
  const [tests, load] = useXLinkTests(a.id);
  const handle = handleOf(a.handle);
  const profile = profileLink(a.handle);
  const problem = asked ? postLinkProblem(url, a.handle) : null;
  const length = testTextLength(text);
  const textProblem = mode === 'new' ? testTextProblem(text) : null;

  const record = async () => {
    setAsked(true);
    setPhase({ t: 'idle' });
    if (postLinkProblem(url, a.handle)) return;
    setBusy(true);
    // X's own lookup, as advice. It never stops a test: the database decides by the link's handle, and a post that X cannot see is said, not refused.
    let found: PostCheck = { found: null, author: null };
    try {
      const r = await fetch('/api/platforms/x-post', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      if (r.ok) found = (await r.json()) as PostCheck;
    } catch {
      // not known
    }
    const lookup = checkNote(found, a.handle);
    if (lookup?.level === 'bad') {
      setBusy(false);
      return setPhase({ t: 'error', text: lookup.text });
    }
    const post = parsePostLink(url)!.url;
    const { error } = await supabase().rpc('x_link_test_record', { p_account: a.id, p_url: url.trim(), p_mode: mode });
    setBusy(false);
    if (error && !xTestNotReady(error)) return setPhase({ t: 'error', text: xTestErrorAr(error.message) });
    setPhase({ t: 'ok', kept: !error, mode, post, lookup });
    if (!error) {
      setUrl('');
      setAsked(false);
      void load();
    }
  };

  const linkBox = (
    <>
      <input
        className="wk-inp ltr"
        dir="ltr"
        value={url}
        placeholder={`x.com/${handle}/status/…`}
        aria-label="رابط المنشور على X"
        aria-invalid={Boolean(problem)}
        data-xl="url"
        disabled={busy}
        onChange={(e) => {
          setUrl(e.target.value);
          setPhase({ t: 'idle' });
          if (asked) setAsked(false);
        }}
      />
      {problem && (
        <p className="wk-err" role="alert" data-xl="problem">
          {problem}
        </p>
      )}
      <div className="wk-xh-row">
        <button type="button" className="pf-btn pri" data-xl="record" disabled={busy || !url.trim() || Boolean(textProblem)} onClick={() => void record()}>
          <Check aria-hidden="true" />
          {mode === 'new' ? 'نشرته، سجّل التجربة' : 'افحص الرابط وسجّل التجربة'}
        </button>
      </div>
    </>
  );

  return (
    <section className="yt-test" aria-label="تجربة النشر بالرابط" data-gd="xl-test" data-xl="panel" data-mode={mode}>
      <h4>تجربة النشر بالرابط</h4>
      <p className="yt-lead">
        لا يرسل الموقع شيئاً إلى X ولا يحذف منها شيئاً. تتأكد أن اسم الحساب هنا هو اسمه على X، وأن رابط منشوره يُقبل، قبل أن تُنشر به الأعمال.
      </p>
      {!a.active ? (
        <Hint warn>الحساب موقوف، فلا تُجرى التجربة. شغّله أولاً من «خيارات أخرى».</Hint>
      ) : !open ? (
        <div className="pf-acts">
          <button type="button" className="wk-btn sm" data-xl="open" onClick={() => setOpen(true)}>
            <Ic i={FlaskConical} />
            بدء تجربة
          </button>
        </div>
      ) : (
        <div className="yt-form" data-xl="form">
          <div className="yt-row">
            <span className="yt-lbl" id={`xl-mode-${a.id}`}>
              النوع
            </span>
            <div className="wk-seg" role="group" aria-labelledby={`xl-mode-${a.id}`}>
              {(['existing', 'new'] as XTestMode[]).map((m) => (
                <button
                  type="button"
                  key={m}
                  aria-pressed={mode === m}
                  disabled={busy}
                  data-xl-mode={m}
                  onClick={() => {
                    setMode(m);
                    setPhase({ t: 'idle' });
                  }}
                >
                  {X_TEST_MODE_AR[m]}
                </button>
              ))}
            </div>
          </div>
          <p className="yt-sub" data-xl="lead">
            {X_TEST_MODE_HELP_AR[mode]}
          </p>

          {mode === 'existing' ? (
            <ol className="wk-xh-steps">
              <li data-xl-step="profile">
                <b>افتح حساب @{handle} على X</b>
                {profile ? (
                  <div className="wk-xh-row">
                    <a className="wk-btn sm" href={profile} target="_blank" rel="noopener noreferrer" data-xl="profile">
                      <Ic i={ExternalLink} />
                      افتح الحساب
                    </a>
                  </div>
                ) : (
                  <small>اسم الحساب هنا لا يصلح اسماً على X: صحّحه أولاً.</small>
                )}
                <small>افتح أي منشور سبق أن نشره الحساب، ثم من زر المشاركة اختر «نسخ الرابط»، أو انسخه من شريط العنوان.</small>
              </li>
              <li data-xl-step="link">
                <b>الصق رابط المنشور</b>
                {linkBox}
              </li>
            </ol>
          ) : (
            <ol className="wk-xh-steps">
              <li data-xl-step="text">
                <b>نص المنشور التجريبي</b>
                <textarea className="wk-inp" value={text} disabled={busy} data-xl="text" aria-label="نص المنشور التجريبي" onChange={(e) => setText(e.target.value)} />
                <small className={length > X_LIMIT ? 'wk-xh-over' : undefined} data-xl="count">
                  <span className="ltr">
                    {length} / {X_LIMIT}
                  </span>{' '}
                  حرفاً بحساب X{length > X_LIMIT ? ': أطول من الحد، فاختصره' : ''}
                </small>
                {textProblem && (
                  <p className="wk-err" role="alert">
                    {textProblem}
                  </p>
                )}
              </li>
              <li data-xl-step="ref">
                <b>رد أو اقتباس (اختياري)</b>
                <div className="wk-seg" role="group" aria-label="النوع">
                  {(['none', 'reply', 'quote'] as RefMode[]).map((m) => (
                    <button type="button" key={m} aria-pressed={refMode === m} data-xl-ref={m} onClick={() => setRefMode(m)}>
                      {m === 'none' ? 'منشور جديد' : m === 'reply' ? 'رد' : 'اقتباس'}
                    </button>
                  ))}
                </div>
                {refMode !== 'none' && <input className="wk-inp ltr" dir="ltr" value={ref} placeholder="x.com/…/status/…" aria-label="رابط المنشور المقصود" onChange={(e) => setRef(e.target.value)} />}
              </li>
              <li data-xl-step="open">
                <b>افتح X ومعك النص</b>
                <label className="wk-xh-row" data-xl="signed">
                  <input type="checkbox" checked={signed} onChange={(e) => setSigned(e.target.checked)} />
                  <span>أنا داخل في X بحساب <b className="ltr">@{handle}</b>، لا بحسابي الشخصي</span>
                </label>
                <div className="wk-xh-row">
                  <a
                    className={`wk-btn sm${textProblem || !signed ? ' off' : ''}`}
                    href={textProblem || !signed ? undefined : composerLink(sent.text, { replyTo: sent.replyTo })}
                    aria-disabled={Boolean(textProblem) || !signed}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-xl="compose"
                  >
                    <Ic i={ExternalLink} />
                    افتح X ومعك النص
                  </a>
                </div>
                <small>تفتح صفحة النشر في X والنص فيها جاهزاً. تأكد أنك داخل بحساب @{handle} ثم اضغط «Post».</small>
                <Hint warn>
                  هذا منشور حقيقي وعام على @{handle} يراه متابعوه. لا يحذفه الموقع: احذفه أنت من X بعد التجربة. إن كنت لا تريد نشراً فاختر «{X_TEST_MODE_AR.existing}».
                </Hint>
              </li>
              <li data-xl-step="link">
                <b>الصق رابط المنشور</b>
                {linkBox}
              </li>
            </ol>
          )}
          <div className="pf-acts">
            <button type="button" className="pf-btn ghost" disabled={busy} onClick={() => setOpen(false)}>
              إغلاق
            </button>
          </div>
        </div>
      )}

      {phase.t === 'error' && (
        <div className="pf-note bad" role="alert" data-xl="error">
          {phase.text}
        </div>
      )}
      {phase.t === 'ok' && (
        <div className={`pf-note ${phase.kept ? 'ok' : 'bad'} yt-done`} role="status" data-xl="done" data-kept={phase.kept ? 'yes' : 'no'}>
          <span>
            {phase.kept ? 'الرابط سليم وسُجّلت التجربة.' : X_TEST_NOT_READY} <bdi dir="ltr">{shownLink(phase.post)}</bdi>
          </span>
          {phase.lookup && (
            <span className={`wk-xh-note ${phase.lookup.level}`} data-xl="lookup">
              {phase.lookup.text}
            </span>
          )}
          {phase.mode === 'new' && <span data-xl="delete-note">المنشور التجريبي ما زال على X: احذفه من هناك، فلا يحذفه الموقع.</span>}
        </div>
      )}

      {tests.length > 0 && (
        <div className="yt-list" data-xl="list">
          <h5>آخر التجارب</h5>
          {tests.map((t) => (
            <div className="yt-item" key={t.id} data-test={t.id} data-mode={t.mode}>
              <span className="yt-item-text">
                <b>
                  <a href={t.post_url} target="_blank" rel="noopener noreferrer">
                    <bdi dir="ltr">{shownLink(t.post_url)}</bdi>
                  </a>
                </b>
                <small>{testLineAr(t, w.nameOf(t.created_by), when)}</small>
              </span>
            </div>
          ))}
          <small className="yt-sub">لا يحذف الموقع شيئاً من X: يُحذف المنشور التجريبي من X نفسها.</small>
        </div>
      )}
    </section>
  );
}

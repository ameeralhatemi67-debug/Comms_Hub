'use client';
// «تجربة النشر» in a YouTube account's sheet (MVP_draft.md section 71), by owner directive of 2026-11-03. A short video is
// really uploaded to the channel through the site, to prove that publishing reaches it, and can be deleted again here.
// The file comes from this device, sent in pieces through the site, or from the library, read by the server itself; the
// page never holds a token or YouTube's upload address. A community post cannot be published by any outside application,
// because YouTube's API has no such method: it is written here, copied, and posted on YouTube itself. Who may test is the
// database's decision (platform_test_may); the panel is drawn for the same people.
import { useRef, useState } from 'react';
import { Copy, ExternalLink, FolderOpen, Laptop, Link2, Trash2, Upload, X } from 'lucide-react';
import { HOLD } from '@/lib/kit/hold-reasons';
import {
  PRIVACY_AR,
  TEST_ERROR_AR,
  YT_MANAGE_SCOPE,
  channelUrl,
  postsUrl,
  studioUrl,
  testProblem,
  videoStudioUrl,
  videoUrl,
  type TestPrivacy,
  type TestRow,
} from '@/lib/platforms/test-rules';
import type { AccountRow } from '@/lib/work/rules';
import { useWork, type LibraryFile } from './data';
import { Hint, Ic, LibraryPicker } from './parts';
import { api, mb, mimeOf, said, useTests, when } from './test-kit';

type Picked = { from: 'device'; file: File; mime: string } | { from: 'library'; file: LibraryFile };
type Phase =
  | { t: 'idle' }
  | { t: 'sending'; pct: number }
  | { t: 'done'; video: string; privacy: string | null; asked: TestPrivacy }
  | { t: 'error'; text: string; code?: string };

export function YouTubeTest({ a, onReconnect }: { a: AccountRow; onReconnect: () => void }) {
  const w = useWork();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'video' | 'post'>('video');
  const [privacy, setPrivacy] = useState<TestPrivacy>('private');
  const [picked, setPicked] = useState<Picked | null>(null);
  const [picking, setPicking] = useState(false);
  const [title, setTitle] = useState('تجربة نشر');
  const [description, setDescription] = useState('');
  const [post, setPost] = useState('');
  const [copied, setCopied] = useState(false);
  const [phase, setPhase] = useState<Phase>({ t: 'idle' });
  const [tests, load] = useTests(a.id);
  const [removing, setRemoving] = useState<string | null>(null);
  const [scopeNote, setScopeNote] = useState(false);
  const stop = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const scopes = a.scopes ?? [];
  // An account connected before the wider permission can upload but not delete; one with no recorded scopes may try.
  const canDelete = scopes.length === 0 || scopes.includes(YT_MANAGE_SCOPE);
  const channel = channelUrl(a);
  const studio = studioUrl(a.external_id);
  const posts = postsUrl(a);
  const connected = a.conn_state === 'connected' && a.active;


  const size = picked ? (picked.from === 'device' ? picked.file.size : null) : null;
  const problem =
    kind === 'video'
      ? !picked
        ? 'اختر مقطع الفيديو.'
        : testProblem({ title, description, size: size ?? 1, mime: picked.from === 'device' ? picked.mime : 'video/mp4' })
      : null;
  const sending = phase.t === 'sending';

  const send = async () => {
    if (!picked || problem) return;
    stop.current = false;
    setPhase({ t: 'sending', pct: 0 });
    const start = await api('/api/platforms/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account: a.id,
        privacy,
        title: title.trim(),
        description,
        source: picked.from,
        ...(picked.from === 'device' ? { size: picked.file.size, mime: picked.mime } : { asset: picked.file.id }),
      }),
    });
    if (!start.ok || typeof start.b.test !== 'string') {
      setPhase({ t: 'error', text: said(start.b), code: start.b.code as string | undefined });
      return void load();
    }
    const test = start.b.test;
    const total = Number(start.b.size);
    const piece = Number(start.b.piece);
    let from = 0;
    let tries = 0;
    for (;;) {
      if (stop.current) {
        await api(`/api/platforms/test/${test}`, { method: 'DELETE' });
        setPhase({ t: 'error', text: TEST_ERROR_AR.CANCELLED });
        return void load();
      }
      const len = Math.min(piece, total - from);
      const body = picked.from === 'device' ? picked.file.slice(from, from + len) : null;
      const r = await api(`/api/platforms/test/${test}?from=${from}`, { method: 'PUT', headers: body ? { 'Content-Type': 'application/octet-stream' } : undefined, body });
      if (r.b.done === true && typeof r.b.video === 'string') {
        setPhase({ t: 'done', video: r.b.video, privacy: typeof r.b.privacy === 'string' ? r.b.privacy : null, asked: privacy });
        w.say('وصل مقطع التجربة إلى يوتيوب.');
        return void load();
      }
      if (typeof r.b.next === 'number') {
        from = r.b.next;
        tries = 0;
        setPhase({ t: 'sending', pct: Math.min(99, Math.round((from / total) * 100)) });
        continue;
      }
      // A piece lost on the way: ask YouTube how much arrived, and go on from there, up to three times in a row.
      if (r.b.retry === true && tries < 3) {
        tries++;
        const where = await api(`/api/platforms/test/${test}?from=${from}&ask=1`, { method: 'PUT' });
        if (typeof where.b.next === 'number') from = where.b.next;
        else if (where.b.done === true && typeof where.b.video === 'string') {
          setPhase({ t: 'done', video: where.b.video, privacy: typeof where.b.privacy === 'string' ? where.b.privacy : null, asked: privacy });
          return void load();
        }
        continue;
      }
      setPhase({ t: 'error', text: said(r.b), code: r.b.code as string | undefined });
      return void load();
    }
  };

  const remove = async (t: TestRow) => {
    setRemoving(t.id);
    const r = await api(`/api/platforms/test/${t.id}`, { method: 'DELETE' });
    setRemoving(null);
    if (r.ok) {
      w.say(`حُذف «${t.title}» من يوتيوب.`);
      if (phase.t === 'done' && phase.video === t.video_id) setPhase({ t: 'idle' });
    } else if (r.b.code === 'SCOPE_MISSING') setScopeNote(true);
    else w.say(said(r.b));
    await load();
  };

  const pickDevice = (f: File | undefined) => {
    if (!f) return;
    setPicked({ from: 'device', file: f, mime: mimeOf(f) });
    if (phase.t !== 'sending') setPhase({ t: 'idle' });
  };

  return (
    <section className="yt-test" aria-label="تجربة النشر" data-gd="yt-test">
      {(channel || studio) && (
        <div className="pf-acts yt-links">
          {channel && (
            <a className="pf-link" href={channel} target="_blank" rel="noopener noreferrer" data-yt="channel">
              <ExternalLink aria-hidden="true" />
              القناة على يوتيوب
            </a>
          )}
          {studio && (
            <a className="pf-link" href={studio} target="_blank" rel="noopener noreferrer" data-yt="studio">
              <ExternalLink aria-hidden="true" />
              YouTube Studio
            </a>
          )}
        </div>
      )}
      <h4>تجربة النشر</h4>
      <p className="yt-lead">يرفع مقطعاً حقيقياً إلى القناة ليتأكد أن النشر يصل. لا يمر بالمراجعة ولا يُعدّ عملاً، ولا يُنبَّه المشتركون.</p>
      {!connected ? (
        <Hint warn>القناة غير متصلة الآن، فلا تُجرى التجربة. أعد ربطها أولاً.</Hint>
      ) : !open ? (
        <div className="pf-acts">
          <button type="button" className="wk-btn sm" data-yt="open" onClick={() => setOpen(true)}>
            <Ic i={Upload} />
            بدء تجربة
          </button>
        </div>
      ) : (
        <div className="yt-form">
          <div className="yt-row">
            <span className="yt-lbl" id={`yt-kind-${a.id}`}>
              النوع
            </span>
            <div className="wk-seg" role="group" aria-labelledby={`yt-kind-${a.id}`}>
              <button type="button" aria-pressed={kind === 'video'} disabled={sending} onClick={() => setKind('video')}>
                فيديو
              </button>
              <button type="button" aria-pressed={kind === 'post'} disabled={sending} onClick={() => setKind('post')}>
                منشور مجتمع
              </button>
            </div>
          </div>

          {kind === 'post' ? (
            <>
              <p className="pf-note info" data-yt="post-note">
                لا تتيح واجهة يوتيوب البرمجية لأي تطبيق خارجي نشر منشور مجتمع، فلا يستطيع الموقع إرساله. اكتب النص هنا، ثم انسخه وانشره من صفحة منشورات القناة في يوتيوب،
                وأرفق الصورة هناك.
              </p>
              <label className="pf-f yt-f">
                نص المنشور
                <textarea
                  className="wk-inp"
                  value={post}
                  maxLength={5000}
                  onChange={(e) => {
                    setPost(e.target.value);
                    setCopied(false);
                  }}
                />
              </label>
              <div className="pf-acts">
                {posts && (
                  <a
                    className={`pf-btn pri${post.trim() ? '' : ' off'}`}
                    href={posts}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-disabled={!post.trim()}
                    data-yt="post-open"
                    onClick={(e) => {
                      if (!post.trim()) return e.preventDefault();
                      void navigator.clipboard?.writeText(post).then(
                        () => setCopied(true),
                        () => undefined,
                      );
                    }}
                  >
                    <Copy aria-hidden="true" />
                    نسخ النص وفتح يوتيوب
                  </a>
                )}
                <button type="button" className="pf-btn ghost" onClick={() => setOpen(false)}>
                  إغلاق
                </button>
              </div>
              {copied && (
                <p className="pf-note ok" role="status">
                  نُسخ النص. الصقه في خانة المنشور على يوتيوب.
                </p>
              )}
            </>
          ) : (
            <>
              <div className="yt-row">
                <span className="yt-lbl" id={`yt-priv-${a.id}`}>
                  الخصوصية
                </span>
                <div className="wk-seg" role="group" aria-labelledby={`yt-priv-${a.id}`}>
                  <button type="button" aria-pressed={privacy === 'private'} disabled={sending} onClick={() => setPrivacy('private')}>
                    خاص
                  </button>
                  <button type="button" aria-pressed={privacy === 'public'} disabled={sending} onClick={() => setPrivacy('public')}>
                    عام
                  </button>
                </div>
              </div>
              <p className="yt-sub">{privacy === 'private' ? 'لا يراه إلا من يدير القناة.' : 'يراه كل من يزور القناة، ويبقى حتى يُحذف.'}</p>

              <div className="yt-file">
                {picked ? (
                  <div className="yt-chip" data-yt="picked">
                    <b>
                      <bdi>{picked.file.name}</bdi>
                    </b>
                    <small>{picked.from === 'device' ? `من هذا الجهاز · ${mb(picked.file.size)}` : `من المكتبة · الإصدار ${picked.file.current_version}`}</small>
                    <button type="button" className="wk-btn icon quiet" aria-label="إزالة الملف" disabled={sending} onClick={() => setPicked(null)}>
                      <Ic i={X} />
                    </button>
                  </div>
                ) : (
                  <div className="pf-acts">
                    <button type="button" className="wk-btn sm" data-yt="library" onClick={() => setPicking(true)}>
                      <Ic i={FolderOpen} />
                      من المكتبة
                    </button>
                    <button type="button" className="wk-btn sm" data-yt="device" onClick={() => fileInput.current?.click()}>
                      <Ic i={Laptop} />
                      من هذا الجهاز
                    </button>
                  </div>
                )}
                <input
                  ref={fileInput}
                  type="file"
                  accept="video/*"
                  hidden
                  data-yt="file"
                  onChange={(e) => {
                    pickDevice(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </div>

              <label className="pf-f yt-f">
                العنوان <small>حتى 100 حرف</small>
                <input value={title} maxLength={100} disabled={sending} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label className="pf-f yt-f">
                الوصف <small>اختياري</small>
                <textarea className="wk-inp" value={description} maxLength={5000} disabled={sending} onChange={(e) => setDescription(e.target.value)} />
              </label>

              {sending ? (
                <div className="yt-progress" role="status" aria-live="polite">
                  <div className="yt-bar">
                    <i style={{ width: `${phase.pct}%` }} />
                  </div>
                  <span>جارٍ الرفع {phase.pct}٪</span>
                  <button
                    type="button"
                    className="pf-btn ghost"
                    data-yt="cancel"
                    onClick={() => {
                      stop.current = true;
                    }}
                  >
                    إلغاء
                  </button>
                </div>
              ) : (
                <div className="pf-acts">
                  {/* A public test asks for a long press; a private one does not. */}
                  {privacy === 'public' ? (
                    <button type="button" className="pf-btn pri" data-yt="send" disabled={Boolean(problem)} data-hold={HOLD.platformTestPublic} onClick={() => void send()}>
                      <Upload aria-hidden="true" />
                      نشر التجربة للعموم
                    </button>
                  ) : (
                    <button type="button" className="pf-btn pri" data-yt="send" disabled={Boolean(problem)} onClick={() => void send()}>
                      <Upload aria-hidden="true" />
                      نشر التجربة
                    </button>
                  )}
                  <button type="button" className="pf-btn ghost" onClick={() => setOpen(false)}>
                    إغلاق
                  </button>
                </div>
              )}
              {problem && picked && !sending && <p className="yt-sub warn">{problem}</p>}
            </>
          )}
        </div>
      )}

      {phase.t === 'error' && (
        <div className="pf-note bad" role="alert" data-yt="error">
          {phase.text}
          {phase.code === 'SCOPE_MISSING' && (
            <button type="button" className="wk-btn sm" onClick={onReconnect}>
              <Ic i={Link2} />
              إعادة الربط
            </button>
          )}
        </div>
      )}
      {phase.t === 'done' && (
        <div className="pf-note ok yt-done" role="status" data-yt="done">
          <span>
            وصل المقطع إلى القناة{phase.privacy ? ` (${PRIVACY_AR[phase.privacy] ?? phase.privacy})` : ''}. قد يحتاج يوتيوب دقائق لمعالجته قبل أن يُشاهَد.
          </span>
          {phase.asked === 'public' && phase.privacy && phase.privacy !== 'public' && (
            <span className="yt-sub">طلبت «عام» فأبقاه يوتيوب «{PRIVACY_AR[phase.privacy] ?? phase.privacy}». غيّر خصوصيته من YouTube Studio إن شئت.</span>
          )}
          <span className="pf-acts">
            <a className="pf-link" href={videoUrl(phase.video)} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden="true" />
              مشاهدة على يوتيوب
            </a>
          </span>
        </div>
      )}

      {tests.length > 0 && (
        <div className="yt-list" data-yt="list">
          <h5>آخر التجارب</h5>
          {(scopeNote || (!canDelete && tests.some((t) => t.state === 'published'))) && (
            <Hint>
              الحذف من هنا يحتاج إذناً إضافياً من Google لم تُعطه القناة عند ربطها. أعد ربطها مرة واحدة ووافق على كل الصلاحيات، أو احذف المقطع من YouTube Studio.{' '}
              <button type="button" className="wk-btn sm" data-yt="reconnect" onClick={onReconnect}>
                <Ic i={Link2} />
                إعادة الربط
              </button>
            </Hint>
          )}
          {tests.map((t) => (
            <div className="yt-item" key={t.id} data-test={t.id} data-state={t.state}>
              <span className="yt-item-text">
                <b>
                  <bdi>{t.title}</bdi>
                </b>
                <small>
                  {t.state === 'published'
                    ? `منشور · ${PRIVACY_AR[t.shown_privacy ?? t.privacy ?? ''] ?? ''}`
                    : t.state === 'deleted'
                      ? 'حُذف من يوتيوب'
                      : t.state === 'uploading'
                        ? 'يُرفع الآن'
                        : `لم يكتمل${t.error ? `: ${TEST_ERROR_AR[t.error] ?? 'خطأ من المنصة.'}` : ''}`}{' '}
                  · {when(t.created_at)} · {w.nameOf(t.created_by)}
                </small>
              </span>
              {t.state === 'published' && t.video_id && (
                <span className="yt-item-acts">
                  <a className="wk-btn sm quiet" href={videoUrl(t.video_id)} target="_blank" rel="noopener noreferrer" aria-label={`مشاهدة «${t.title}» على يوتيوب`}>
                    <Ic i={ExternalLink} />
                    مشاهدة
                  </a>
                  {canDelete && !scopeNote ? (
                    <button type="button" className="wk-btn sm quiet danger" data-hold={HOLD.platformTestDelete} disabled={removing === t.id} onClick={() => void remove(t)}>
                      <Ic i={Trash2} />
                      {removing === t.id ? 'جارٍ الحذف…' : 'حذف'}
                    </button>
                  ) : (
                    <a className="wk-btn sm quiet" href={videoStudioUrl(t.video_id)} target="_blank" rel="noopener noreferrer">
                      <Ic i={ExternalLink} />
                      في Studio
                    </a>
                  )}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {picking && (
        <LibraryPicker
          have={[]}
          only="video"
          note="تظهر مقاطع الفيديو التي تملك الوصول إلى مجلداتها فقط. يقرأ الخادم الملف من المكتبة مباشرة، ويبقى في مجلده."
          onPick={(f) => {
            setPicked({ from: 'library', file: f });
            setPicking(false);
            if (phase.t !== 'sending') setPhase({ t: 'idle' });
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </section>
  );
}

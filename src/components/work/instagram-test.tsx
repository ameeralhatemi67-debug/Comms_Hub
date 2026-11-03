'use client';
// «تجربة النشر» in an Instagram account's sheet (MVP_draft.md section 72), by owner directive of 2026-11-03: a real Story,
// picture post or Reel, to prove that publishing reaches the account, and a delete from here. Instagram has no private
// post, so the quiet choice is a Story, gone after 24 hours. Meta fetches the file itself, from an address the site serves
// for a few minutes: a picture is redrawn to JPEG here and goes, like any file from this device, to the site's Drive folder
// «تجارب النشر» first; a library video is read where it is. Meta prepares the post before it can be published, and nothing
// runs in the background, so this page asks how it is getting on until it is done. It never holds a token or the address.
// Who may test is the database's decision (platform_test_may); the panel is drawn for the same people.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, FolderOpen, Laptop, Link2, Trash2, Upload, X } from 'lucide-react';
import { HOLD } from '@/lib/kit/hold-reasons';
import { copyStats } from '@/lib/platforms/limits';
import { supabase } from '@/lib/supabase/client';
import {
  IG_ALT_MAX,
  IG_CAPTION_MAX,
  IG_HASHTAGS_MAX,
  IG_KIND_AR,
  IG_MANAGE_SCOPE,
  IG_MENTIONS_MAX,
  IG_PICTURE_WIDTH,
  IG_POLL_MS,
  IG_WAIT_MS,
  TEST_ERROR_AR,
  igProfileUrl,
  igProblem,
  kindOf,
  storyEnds,
  type IgChoice,
  type TestKind,
  type TestRow,
} from '@/lib/platforms/test-rules';
import type { AccountRow } from '@/lib/work/rules';
import { useWork, type LibraryFile } from './data';
import { Hint, Ic, LibraryPicker } from './parts';
import { api, clock, mb, mimeOf, said, when } from './test-kit';

/** A chosen file, ready to send: a picture already redrawn to JPEG, a video with its length when the browser can tell. */
type Ready = {
  name: string;
  from: 'device' | 'library';
  /** The bytes to send, for a file that goes through «تجارب النشر». A library video has none: the server reads it. */
  blob: Blob | null;
  asset: string | null;
  mime: string;
  size: number;
  ratio: number | null;
  seconds: number | null;
};
type Phase =
  | { t: 'idle' }
  | { t: 'preparing' }
  | { t: 'upload'; pct: number }
  | { t: 'wait'; since: number }
  | { t: 'done'; url: string | null; kind: TestKind }
  | { t: 'error'; text: string; code?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DRIVE_CHUNK = 8 * 1024 * 1024;

/** A picture as JPEG, no wider than Instagram keeps, on white (JPEG has no transparency). Drops the file's metadata. */
async function toJpeg(blob: Blob): Promise<{ jpeg: Blob; ratio: number }> {
  const bmp = await createImageBitmap(blob);
  const ratio = bmp.width / bmp.height;
  const scale = Math.min(1, IG_PICTURE_WIDTH / bmp.width);
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const jpeg = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.9));
  if (!jpeg) throw new Error('تعذّر تحويل الصورة.');
  return { jpeg, ratio };
}

/** A video's length in seconds, from its own address; null when the browser cannot read it. */
function videoSeconds(src: string): Promise<number | null> {
  return new Promise((done) => {
    const v = document.createElement('video');
    const end = (s: number | null) => {
      clearTimeout(timer);
      v.removeAttribute('src');
      v.load();
      done(s);
    };
    const timer = setTimeout(() => end(null), 8000);
    v.preload = 'metadata';
    v.muted = true;
    v.onloadedmetadata = () => end(Number.isFinite(v.duration) ? v.duration : null);
    v.onerror = () => end(null);
    v.src = src;
  });
}

/** Sends a file straight to the Drive upload the site opened, in pieces, and returns Drive's id for it. */
async function sendToDrive(session: string, blob: Blob, onProgress: (f: number) => void, stopped: () => boolean): Promise<string> {
  let offset = 0;
  let failures = 0;
  for (;;) {
    if (stopped()) throw new Error('stopped');
    const end = Math.min(offset + DRIVE_CHUNK, blob.size);
    let res: Response;
    try {
      res = await fetch(session, { method: 'PUT', headers: { 'Content-Range': `bytes ${offset}-${end - 1}/${blob.size}` }, body: blob.slice(offset, end) });
    } catch {
      if (++failures > 5) throw new Error(TEST_ERROR_AR.TEMP_UPLOAD_FAILED);
      await sleep(1000 * failures);
      continue;
    }
    if (res.status === 308) {
      const range = res.headers.get('Range');
      offset = range ? Number(range.split('-')[1]) + 1 : end;
      onProgress(offset / blob.size);
    } else if (res.ok) {
      onProgress(1);
      return ((await res.json()) as { id: string }).id;
    } else if (res.status >= 500 && ++failures <= 5) {
      await sleep(1000 * failures);
    } else {
      throw new Error(TEST_ERROR_AR.TEMP_UPLOAD_FAILED);
    }
  }
}

const ACCEPT: Record<IgChoice, string> = { story: 'image/*,video/mp4,video/quicktime', image: 'image/*', reel: 'video/mp4,video/quicktime' };
const LEAD: Record<IgChoice, string> = {
  story: 'يراها المتابعون 24 ساعة ثم تختفي. صورة أو فيديو حتى 60 ثانية، بلا شرح.',
  image: 'يظهر في الحساب للجميع ويبقى حتى يُحذف. نسبة الصورة من 4:5 إلى 1.91:1.',
  reel: 'يظهر في تبويب الريلز للجميع ويبقى حتى يُحذف. MP4 أو MOV، من 3 ثوانٍ إلى 15 دقيقة.',
};

export function InstagramTest({ a, onReconnect }: { a: AccountRow; onReconnect: () => void }) {
  const w = useWork();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<IgChoice>('story');
  const [ready, setReady] = useState<Ready | null>(null);
  const [picking, setPicking] = useState(false);
  const [caption, setCaption] = useState('تجربة نشر');
  const [alt, setAlt] = useState('');
  const [feed, setFeed] = useState(false);
  const [phase, setPhase] = useState<Phase>({ t: 'idle' });
  const [quota, setQuota] = useState<{ used: number; total: number } | null>(null);
  const [tests, setTests] = useState<TestRow[]>([]);
  const [removing, setRemoving] = useState<string | null>(null);
  const [scopeNote, setScopeNote] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const stop = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const scopes = a.scopes ?? [];
  // An account connected without the delete permission can publish but not delete; one with no recorded scopes may try.
  const canDelete = scopes.length === 0 || scopes.includes(IG_MANAGE_SCOPE);
  const profile = igProfileUrl(a.handle);
  const connected = a.conn_state === 'connected' && a.active;
  const busy = phase.t === 'preparing' || phase.t === 'upload' || phase.t === 'wait';

  const load = useCallback(async () => {
    const { data } = await supabase()
      .from('platform_tests')
      .select('id,privacy,title,kind,state,video_id,post_url,shown_privacy,error,created_by,created_at,done_at,deleted_at')
      .eq('account_id', a.id)
      .order('created_at', { ascending: false })
      .limit(5);
    setTests((data ?? []) as TestRow[]);
  }, [a.id]);
  useEffect(() => {
    void load();
  }, [load]);
  // The clock of the wait, and of a Story's end.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const kind = ready ? kindOf(choice, ready.mime) : null;
  const words = kind === 'story_image' || kind === 'story_video' ? '' : caption;
  const problem = !ready
    ? choice === 'reel'
      ? 'اختر مقطع الفيديو.'
      : 'اختر الملف.'
    : !kind
      ? choice === 'image'
        ? 'المنشور صورة.'
        : choice === 'reel'
          ? 'يقبل إنستغرام الريلز MP4 أو MOV.'
          : 'القصة صورة أو فيديو MP4 أو MOV.'
      : igProblem({ kind, size: ready.size, mime: ready.mime, caption: words, alt: kind === 'image' ? alt : '', seconds: ready.seconds, ratio: ready.ratio });
  const stats = copyStats(caption);

  const take = async (pick: { name: string; from: 'device'; file: File } | { name: string; from: 'library'; file: LibraryFile }) => {
    setReady(null);
    setPhase({ t: 'preparing' });
    try {
      const mime = pick.from === 'device' ? mimeOf(pick.file) : pick.file.kind === 'image' ? 'image/*' : 'video/*';
      if (mime.startsWith('image/')) {
        // A picture always goes as JPEG through «تجارب النشر», a library picture too.
        const source = pick.from === 'device' ? pick.file : await fetch(`/api/media/${pick.file.id}/content`).then((r) => (r.ok ? r.blob() : Promise.reject(new Error())));
        const { jpeg, ratio } = await toJpeg(source);
        setReady({ name: pick.name, from: pick.from, blob: jpeg, asset: null, mime: 'image/jpeg', size: jpeg.size, ratio, seconds: null });
      } else if (pick.from === 'device') {
        const url = URL.createObjectURL(pick.file);
        const seconds = await videoSeconds(url);
        URL.revokeObjectURL(url);
        setReady({ name: pick.name, from: 'device', blob: pick.file, asset: null, mime, size: pick.file.size, ratio: null, seconds });
      } else {
        // A library video is read by the server where it is; its type and size are the library's.
        const { data } = await supabase().from('media_files').select('mime_type,size_bytes').eq('id', pick.file.id).maybeSingle();
        const seconds = await videoSeconds(`/api/media/${pick.file.id}/content`);
        setReady({ name: pick.name, from: 'library', blob: null, asset: pick.file.id, mime: String(data?.mime_type ?? '').toLowerCase(), size: Number(data?.size_bytes ?? 0), ratio: null, seconds });
      }
      setPhase({ t: 'idle' });
    } catch {
      setPhase({ t: 'error', text: 'تعذّر تجهيز الملف. جرّب ملفاً آخر.' });
    }
  };

  const send = async () => {
    if (!ready || !kind || problem) return;
    stop.current = false;
    const fail = async (b: Record<string, unknown>) => {
      setPhase({ t: 'error', text: said(b), code: b.code as string | undefined });
      await load();
    };
    setPhase({ t: 'upload', pct: 0 });
    const start = await api('/api/platforms/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account: a.id,
        kind,
        source: ready.from === 'library' && !ready.blob ? 'library' : 'device',
        ...(ready.blob ? { size: ready.size, mime: ready.mime } : { asset: ready.asset }),
        caption: words,
        alt: kind === 'image' ? alt : '',
        share_to_feed: kind === 'reel' ? feed : undefined,
      }),
    });
    if (!start.ok || typeof start.b.test !== 'string') return fail(start.b);
    const test = start.b.test;
    if (start.b.quota && typeof start.b.quota === 'object') setQuota(start.b.quota as { used: number; total: number });
    const cancel = async () => {
      await api(`/api/platforms/test/${test}`, { method: 'DELETE' });
      setPhase({ t: 'error', text: TEST_ERROR_AR.CANCELLED });
      await load();
    };

    if (start.b.phase === 'upload' && typeof start.b.upload === 'string' && ready.blob) {
      let ref: string;
      try {
        ref = await sendToDrive(start.b.upload, ready.blob, (f) => setPhase({ t: 'upload', pct: Math.min(99, Math.round(f * 100)) }), () => stop.current);
      } catch (e) {
        if (stop.current) return cancel();
        await api(`/api/platforms/test/${test}`, { method: 'DELETE' });
        return fail({ error: e instanceof Error && e.message !== 'stopped' ? e.message : TEST_ERROR_AR.TEMP_UPLOAD_FAILED });
      }
      const sent = await api(`/api/platforms/test/${test}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'uploaded', ref, caption: words, alt: kind === 'image' ? alt : '' }),
      });
      if (!sent.ok) return fail(sent.b);
    }

    // Meta fetches and prepares the file; the page asks how it is going until it is published.
    const since = Date.now();
    setPhase({ t: 'wait', since });
    let tries = 0;
    for (;;) {
      if (stop.current) return cancel();
      if (Date.now() - since > IG_WAIT_MS) {
        await api(`/api/platforms/test/${test}`, { method: 'DELETE' });
        return fail({ error: TEST_ERROR_AR.WAIT_TOO_LONG });
      }
      await sleep(IG_POLL_MS);
      if (stop.current) return cancel();
      const r = await api(`/api/platforms/test/${test}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step: 'advance' }) });
      if (r.b.done === true) {
        setPhase({ t: 'done', url: typeof r.b.url === 'string' ? r.b.url : null, kind });
        w.say(kind === 'story_image' || kind === 'story_video' ? 'نُشرت القصة التجريبية على إنستغرام.' : 'نُشرت التجربة على إنستغرام.');
        return load();
      }
      if (r.b.phase === 'wait') {
        tries = 0;
        continue;
      }
      if (r.b.retry === true && ++tries <= 3) continue;
      return fail(r.b);
    }
  };

  const remove = async (t: TestRow) => {
    setRemoving(t.id);
    const r = await api(`/api/platforms/test/${t.id}`, { method: 'DELETE' });
    setRemoving(null);
    if (r.ok) w.say(`حُذف «${t.title}» من إنستغرام.`);
    else if (r.b.code === 'SCOPE_MISSING') setScopeNote(true);
    else w.say(said(r.b));
    await load();
  };

  const story = kind === 'story_image' || kind === 'story_video' || (!kind && choice === 'story');
  const statusOf = (t: TestRow) => {
    if (t.state === 'deleted') return 'حُذف من إنستغرام';
    if (t.state === 'uploading') return 'يُنشر الآن';
    if (t.state === 'failed') return `لم يكتمل${t.error ? `: ${TEST_ERROR_AR[t.error] ?? 'خطأ من المنصة.'}` : ''}`;
    const ends = t.kind === 'story_image' || t.kind === 'story_video' ? storyEnds(t.done_at) : null;
    if (ends) return Date.parse(ends) <= now ? 'قصة انتهت' : `قصة · تختفي ${when(ends)}`;
    return `نُشر · ${IG_KIND_AR[t.kind ?? ''] ?? ''}`;
  };

  return (
    <section className="yt-test" aria-label="تجربة النشر" data-gd="ig-test">
      {profile && (
        <div className="pf-acts yt-links">
          <a className="pf-link" href={profile} target="_blank" rel="noopener noreferrer" data-ig="profile">
            <ExternalLink aria-hidden="true" />
            الحساب على إنستغرام
          </a>
        </div>
      )}
      <h4>تجربة النشر</h4>
      <p className="yt-lead">ينشر على الحساب شيئاً حقيقياً ليتأكد أن النشر يصل. لا يمر بالمراجعة ولا يُعدّ عملاً. لا يوجد على إنستغرام نشر خاص: القصة تختفي بعد 24 ساعة، والمنشور والريلز يبقيان حتى يُحذفا.</p>
      {!connected ? (
        <Hint warn>الحساب غير متصل الآن، فلا تُجرى التجربة. أعد ربطه أولاً.</Hint>
      ) : !open ? (
        <div className="pf-acts">
          <button type="button" className="wk-btn sm" data-ig="open" onClick={() => setOpen(true)}>
            <Ic i={Upload} />
            بدء تجربة
          </button>
        </div>
      ) : (
        <div className="yt-form">
          <div className="yt-row">
            <span className="yt-lbl" id={`ig-kind-${a.id}`}>
              النوع
            </span>
            <div className="wk-seg" role="group" aria-labelledby={`ig-kind-${a.id}`}>
              {(['story', 'image', 'reel'] as IgChoice[]).map((c) => (
                <button
                  type="button"
                  key={c}
                  aria-pressed={choice === c}
                  disabled={busy}
                  onClick={() => {
                    setChoice(c);
                    setReady(null);
                  }}
                >
                  {c === 'story' ? 'قصة' : c === 'image' ? 'منشور صورة' : 'ريلز'}
                </button>
              ))}
            </div>
          </div>
          <p className="yt-sub" data-ig="lead">
            {LEAD[choice]}
          </p>

          <div className="yt-file">
            {ready ? (
              <div className="yt-chip" data-ig="picked">
                <b>
                  <bdi>{ready.name}</bdi>
                </b>
                <small>
                  {ready.from === 'device' ? 'من هذا الجهاز' : 'من المكتبة'}
                  {ready.mime === 'image/jpeg' ? ' · JPEG' : ''}
                  {ready.seconds != null ? ` · ${clock(ready.seconds)}` : ''} · {mb(ready.size)}
                </small>
                <button type="button" className="wk-btn icon quiet" aria-label="إزالة الملف" disabled={busy} onClick={() => setReady(null)}>
                  <Ic i={X} />
                </button>
              </div>
            ) : phase.t === 'preparing' ? (
              <p className="yt-sub" role="status">
                جارٍ تجهيز الملف…
              </p>
            ) : (
              <div className="pf-acts">
                <button type="button" className="wk-btn sm" data-ig="library" onClick={() => setPicking(true)}>
                  <Ic i={FolderOpen} />
                  من المكتبة
                </button>
                <button type="button" className="wk-btn sm" data-ig="device" onClick={() => fileInput.current?.click()}>
                  <Ic i={Laptop} />
                  من هذا الجهاز
                </button>
              </div>
            )}
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT[choice]}
              hidden
              data-ig="file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void take({ name: f.name, from: 'device', file: f });
              }}
            />
          </div>

          {choice !== 'story' && (
            <label className="pf-f yt-f">
              الشرح <small>اختياري</small>
              <textarea className="wk-inp" value={caption} maxLength={IG_CAPTION_MAX + 200} disabled={busy} onChange={(e) => setCaption(e.target.value)} />
              <small className="yt-count" data-ig="count">
                {stats.chars} / {IG_CAPTION_MAX} حرفاً · {stats.hashtags} / {IG_HASHTAGS_MAX} وسماً · {stats.mentions} / {IG_MENTIONS_MAX} إشارة
              </small>
            </label>
          )}
          {choice === 'image' && (
            <label className="pf-f yt-f">
              النص البديل <small>اختياري، يصف الصورة لمن لا يراها</small>
              <input value={alt} maxLength={IG_ALT_MAX} disabled={busy} onChange={(e) => setAlt(e.target.value)} />
            </label>
          )}
          {choice === 'reel' && (
            <label className="yt-check">
              <input type="checkbox" checked={feed} disabled={busy} onChange={(e) => setFeed(e.target.checked)} />
              يظهر في شبكة الحساب أيضاً <small>وقد يظهر في تبويب الريلز وحده بحسب إنستغرام</small>
            </label>
          )}

          {phase.t === 'upload' || phase.t === 'wait' ? (
            <div className="yt-progress" role="status" aria-live="polite" data-ig="progress">
              {phase.t === 'upload' ? (
                <>
                  <div className="yt-bar">
                    <i style={{ width: `${phase.pct}%` }} />
                  </div>
                  <span>يُرفع الملف {phase.pct}٪</span>
                </>
              ) : (
                <span>
                  إنستغرام يجلب الملف ويجهّزه · {clock((now - phase.since) / 1000)}
                  <small className="yt-sub"> قد يأخذ الفيديو دقائق. أبقِ الصفحة مفتوحة.</small>
                </span>
              )}
              <button
                type="button"
                className="pf-btn ghost"
                data-ig="cancel"
                onClick={() => {
                  stop.current = true;
                }}
              >
                إلغاء
              </button>
            </div>
          ) : (
            <div className="pf-acts">
              {/* Every Instagram test is seen by others, so both ask for a long press. */}
              {story ? (
                <button type="button" className="pf-btn pri" data-ig="send" disabled={Boolean(problem) || busy} data-hold={HOLD.igTestStory} onClick={() => void send()}>
                  <Upload aria-hidden="true" />
                  نشر القصة التجريبية
                </button>
              ) : (
                <button type="button" className="pf-btn pri" data-ig="send" disabled={Boolean(problem) || busy} data-hold={HOLD.igTestPost} onClick={() => void send()}>
                  <Upload aria-hidden="true" />
                  نشر التجربة للعموم
                </button>
              )}
              <button type="button" className="pf-btn ghost" onClick={() => setOpen(false)}>
                إغلاق
              </button>
            </div>
          )}
          {problem && ready && !busy && <p className="yt-sub warn">{problem}</p>}
        </div>
      )}

      {quota && (
        <p className="yt-sub yt-quota" data-ig="quota">
          نشر الحساب {quota.used} من {quota.total} منشوراً عبر التطبيقات في آخر 24 ساعة.
        </p>
      )}
      {phase.t === 'error' && (
        <div className="pf-note bad" role="alert" data-ig="error">
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
        <div className="pf-note ok yt-done" role="status" data-ig="done">
          <span>{phase.kind === 'story_image' || phase.kind === 'story_video' ? 'نُشرت القصة على الحساب، وتختفي بعد 24 ساعة.' : 'نُشرت التجربة على الحساب.'}</span>
          {phase.url && (
            <span className="pf-acts">
              <a className="pf-link" href={phase.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden="true" />
                فتح على إنستغرام
              </a>
            </span>
          )}
        </div>
      )}

      {tests.length > 0 && (
        <div className="yt-list" data-ig="list">
          <h5>آخر التجارب</h5>
          {(scopeNote || (!canDelete && tests.some((t) => t.state === 'published'))) && (
            <Hint>
              الحذف من هنا يحتاج إذن «instagram_manage_contents» في إعداد تطبيق Meta، ولم يُعطه الحساب عند ربطه. أضفه في الإعداد ثم أعد ربط الحساب، أو احذف المنشور من تطبيق إنستغرام.{' '}
              <button type="button" className="wk-btn sm" data-ig="reconnect" onClick={onReconnect}>
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
                  {statusOf(t)} · {when(t.created_at)} · {w.nameOf(t.created_by)}
                </small>
              </span>
              {t.state === 'published' && (
                <span className="yt-item-acts">
                  {t.post_url && (
                    <a className="wk-btn sm quiet" href={t.post_url} target="_blank" rel="noopener noreferrer" aria-label={`فتح «${t.title}» على إنستغرام`}>
                      <Ic i={ExternalLink} />
                      فتح
                    </a>
                  )}
                  {canDelete && !scopeNote ? (
                    <button type="button" className="wk-btn sm quiet danger" data-hold={HOLD.igTestDelete} disabled={removing === t.id} onClick={() => void remove(t)}>
                      <Ic i={Trash2} />
                      {removing === t.id ? 'جارٍ الحذف…' : 'حذف'}
                    </button>
                  ) : (
                    <span className="yt-sub">احذفه من التطبيق</span>
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
          only={choice === 'image' ? 'image' : choice === 'reel' ? 'video' : undefined}
          note="تظهر الملفات التي تملك الوصول إلى مجلداتها فقط. الصورة تُحوَّل إلى JPEG هنا، والفيديو يقرؤه الخادم من المكتبة مباشرة."
          onPick={(f) => {
            setPicking(false);
            if (f.kind !== 'image' && f.kind !== 'video') return setPhase({ t: 'error', text: 'اختر صورة أو فيديو.' });
            void take({ name: f.name, from: 'library', file: f });
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </section>
  );
}

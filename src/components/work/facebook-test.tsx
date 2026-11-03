'use client';
// «تجربة النشر» in a Facebook Page's sheet (MVP_draft.md section 73), by owner directive of 2026-11-03. The default is a silent
// check: a post scheduled four weeks ahead, read back from the Page and deleted at once, so the Page's token is proved without
// anyone seeing anything. A text post, a photo post and a Reel are real and public, and ask for a long press. A photo is
// redrawn to JPEG here and sent to the site as a file; a Reel, like Instagram's, is fetched by Meta from an address the site
// serves for a few minutes, and the page asks how Meta is getting on until it is published. The page never holds a token or
// the address. Who may test is the database's decision (platform_test_may); the panel is drawn for the same people.
import { useEffect, useRef, useState } from 'react';
import { ExternalLink, FolderOpen, Laptop, Link2, ShieldCheck, Trash2, Upload, X } from 'lucide-react';
import { HOLD } from '@/lib/kit/hold-reasons';
import { supabase } from '@/lib/supabase/client';
import {
  FB_KIND,
  FB_KIND_AR,
  FB_MESSAGE_MAX,
  IG_PICTURE_WIDTH,
  IG_POLL_MS,
  IG_WAIT_MS,
  TEST_ERROR_AR,
  fbPageUrl,
  fbProblem,
  fbScheduledUrl,
  type FbChoice,
  type TestRow,
} from '@/lib/platforms/test-rules';
import type { AccountRow } from '@/lib/work/rules';
import { useWork, type LibraryFile } from './data';
import { Hint, Ic, LibraryPicker } from './parts';
import { api, clock, mb, mimeOf, said, sendToDrive, sleep, toJpeg, useTests, videoSeconds, when } from './test-kit';

/** A chosen file, ready to send: a picture already redrawn to JPEG, a video with its length when the browser can tell. */
type Ready = { name: string; from: 'device' | 'library'; blob: Blob | null; asset: string | null; mime: string; size: number; seconds: number | null };
type Phase =
  | { t: 'idle' }
  | { t: 'preparing' }
  | { t: 'sending'; pct: number | null }
  | { t: 'wait'; since: number }
  | { t: 'silent'; deleted: boolean }
  | { t: 'done'; url: string | null }
  | { t: 'error'; text: string; code?: string };

const CHOICES: FbChoice[] = ['silent', 'text', 'photo', 'reel'];
const LABEL: Record<FbChoice, string> = { silent: 'فحص صامت', text: 'منشور نصي', photo: 'منشور صورة', reel: 'ريلز' };
const LEAD: Record<FbChoice, string> = {
  silent: 'ينشئ منشوراً مجدولاً بعد أربعة أسابيع، ويقرؤه من الصفحة، ثم يحذفه فوراً. لا يظهر لأحد.',
  text: 'يظهر على الصفحة للجميع ويبقى حتى يُحذف. نص، ورابط إن شئت.',
  photo: 'يظهر على الصفحة للجميع ويبقى حتى يُحذف. الصورة تُرسل JPEG حتى 4 ميغابايت.',
  reel: 'يظهر في الريلز للجميع ويبقى حتى يُحذف. MP4 أو MOV، من 3 ثوانٍ إلى 90 ثانية.',
};

export function FacebookTest({ a, onReconnect }: { a: AccountRow; onReconnect: () => void }) {
  const w = useWork();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<FbChoice>('silent');
  const [ready, setReady] = useState<Ready | null>(null);
  const [picking, setPicking] = useState(false);
  const [message, setMessage] = useState('تجربة نشر');
  const [link, setLink] = useState('');
  const [alt, setAlt] = useState('');
  const [phase, setPhase] = useState<Phase>({ t: 'idle' });
  const [tests, load] = useTests(a.id);
  const [removing, setRemoving] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const stop = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const page = fbPageUrl(a.external_id);
  const planner = fbScheduledUrl(a.external_id);
  const connected = a.conn_state === 'connected' && a.active;
  const busy = phase.t === 'preparing' || phase.t === 'sending' || phase.t === 'wait';
  const kind = FB_KIND[choice];
  const needsFile = choice === 'photo' || choice === 'reel';

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const problem = needsFile && !ready
    ? choice === 'reel'
      ? 'اختر مقطع الفيديو.'
      : 'اختر الصورة.'
    : fbProblem({ kind, message: choice === 'silent' ? '' : message, link: choice === 'text' ? link : '', size: ready?.size, mime: ready?.mime, seconds: ready?.seconds });

  const take = async (pick: { name: string; from: 'device'; file: File } | { name: string; from: 'library'; file: LibraryFile }) => {
    setReady(null);
    setPhase({ t: 'preparing' });
    try {
      const mime = pick.from === 'device' ? mimeOf(pick.file) : pick.file.kind === 'image' ? 'image/*' : 'video/*';
      if (choice === 'photo') {
        if (!mime.startsWith('image/')) throw new Error();
        // A picture always goes as JPEG, a library picture too.
        const source = pick.from === 'device' ? pick.file : await fetch(`/api/media/${pick.file.id}/content`).then((r) => (r.ok ? r.blob() : Promise.reject(new Error())));
        const { jpeg } = await toJpeg(source, IG_PICTURE_WIDTH);
        setReady({ name: pick.name, from: pick.from, blob: jpeg, asset: null, mime: 'image/jpeg', size: jpeg.size, seconds: null });
      } else if (pick.from === 'device') {
        const url = URL.createObjectURL(pick.file);
        const seconds = await videoSeconds(url);
        URL.revokeObjectURL(url);
        setReady({ name: pick.name, from: 'device', blob: pick.file, asset: null, mime, size: pick.file.size, seconds });
      } else {
        // A library video is read by the server where it is; its type and size are the library's.
        const { data } = await supabase().from('media_files').select('mime_type,size_bytes').eq('id', pick.file.id).maybeSingle();
        const seconds = await videoSeconds(`/api/media/${pick.file.id}/content`);
        setReady({ name: pick.name, from: 'library', blob: null, asset: pick.file.id, mime: String(data?.mime_type ?? '').toLowerCase(), size: Number(data?.size_bytes ?? 0), seconds });
      }
      setPhase({ t: 'idle' });
    } catch {
      setPhase({ t: 'error', text: choice === 'photo' ? 'اختر صورة يمكن فتحها.' : 'تعذّر تجهيز الملف. جرّب ملفاً آخر.' });
    }
  };

  const send = async () => {
    if (problem) return;
    stop.current = false;
    const fail = async (b: Record<string, unknown>) => {
      setPhase({ t: 'error', text: said(b), code: b.code as string | undefined });
      await load();
    };
    setPhase({ t: 'sending', pct: null });
    const start = await api('/api/platforms/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account: a.id,
        kind,
        message: choice === 'silent' ? '' : message,
        link: choice === 'text' ? link.trim() : '',
        ...(needsFile && ready ? (ready.blob ? { source: 'device', size: ready.size, mime: ready.mime } : { source: 'library', asset: ready.asset }) : {}),
      }),
    });
    if (start.b.silent === true) {
      setPhase({ t: 'silent', deleted: start.b.deleted === true });
      w.say(start.b.deleted === true ? 'نجح الفحص الصامت: أُنشئ المنشور وقُرئ وحُذف.' : 'أُنشئ منشور الفحص وقُرئ، لكن حذفه لم يتم.');
      return void load();
    }
    if (start.b.done === true) {
      setPhase({ t: 'done', url: typeof start.b.url === 'string' ? start.b.url : null });
      w.say('نُشرت التجربة على الصفحة.');
      return void load();
    }
    if (!start.ok || typeof start.b.test !== 'string') return fail(start.b);
    const test = start.b.test;
    const cancel = async () => {
      await api(`/api/platforms/test/${test}`, { method: 'DELETE' });
      setPhase({ t: 'error', text: TEST_ERROR_AR.CANCELLED });
      await load();
    };

    // A photo goes to the site as a file with its words; Meta answers at once.
    if (start.b.phase === 'photo' && ready?.blob) {
      const body = new FormData();
      body.set('file', ready.blob, 'photo.jpg');
      body.set('caption', message);
      body.set('alt', alt);
      const r = await api(`/api/platforms/test/${test}`, { method: 'PUT', body });
      if (r.b.done === true) {
        setPhase({ t: 'done', url: typeof r.b.url === 'string' ? r.b.url : null });
        w.say('نُشرت التجربة على الصفحة.');
        return void load();
      }
      return fail(r.b);
    }

    if (start.b.phase === 'upload' && typeof start.b.upload === 'string' && ready?.blob) {
      let ref: string;
      try {
        ref = await sendToDrive(start.b.upload, ready.blob, (f) => setPhase({ t: 'sending', pct: Math.min(99, Math.round(f * 100)) }), () => stop.current);
      } catch (e) {
        if (stop.current) return cancel();
        await api(`/api/platforms/test/${test}`, { method: 'DELETE' });
        return fail({ error: e instanceof Error && e.message !== 'stopped' ? e.message : TEST_ERROR_AR.TEMP_UPLOAD_FAILED });
      }
      const sent = await api(`/api/platforms/test/${test}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step: 'uploaded', ref }) });
      if (!sent.ok) return fail(sent.b);
    }

    // Meta fetches and prepares the Reel; the page asks how it is going until it is published.
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
      const r = await api(`/api/platforms/test/${test}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step: 'advance', message }) });
      if (r.b.done === true) {
        setPhase({ t: 'done', url: typeof r.b.url === 'string' ? r.b.url : null });
        w.say('نُشر الريلز التجريبي على الصفحة.');
        return void load();
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
    if (r.ok) w.say(`حُذف «${t.title}» من فيسبوك.`);
    else w.say(said(r.b));
    await load();
  };

  const statusOf = (t: TestRow) => {
    if (t.kind === 'fb_silent') {
      if (t.state === 'deleted') return 'أُنشئ وقُرئ وحُذف، ولم يظهر';
      if (t.state === 'published') return `لم يُحذف بعد${t.scheduled_for ? `، ويظهر ${when(t.scheduled_for)} إن بقي` : ''}`;
    }
    if (t.state === 'deleted') return 'حُذف من فيسبوك';
    if (t.state === 'uploading') return 'يُنشر الآن';
    if (t.state === 'failed') return `لم يكتمل${t.error ? `: ${TEST_ERROR_AR[t.error] ?? 'خطأ من المنصة.'}` : ''}`;
    return `نُشر · ${FB_KIND_AR[t.kind ?? ''] ?? ''}`;
  };

  return (
    <section className="yt-test" aria-label="تجربة النشر" data-gd="fb-test">
      {page && (
        <div className="pf-acts yt-links">
          <a className="pf-link" href={page} target="_blank" rel="noopener noreferrer" data-fb="page">
            <ExternalLink aria-hidden="true" />
            الصفحة على فيسبوك
          </a>
        </div>
      )}
      <h4>تجربة النشر</h4>
      <p className="yt-lead">يتأكد أن الموقع ينشر على الصفحة فعلاً. «فحص صامت» لا يظهر لأحد؛ أما المنشور والصورة والريلز فعامة وتبقى حتى تُحذف. لا يمر شيء منها بالمراجعة ولا يُعدّ عملاً.</p>
      {!connected ? (
        <Hint warn>الصفحة غير متصلة الآن، فلا تُجرى التجربة. أعد ربطها أولاً.</Hint>
      ) : !open ? (
        <div className="pf-acts">
          <button type="button" className="wk-btn sm" data-fb="open" onClick={() => setOpen(true)}>
            <Ic i={Upload} />
            بدء تجربة
          </button>
        </div>
      ) : (
        <div className="yt-form">
          <div className="yt-row">
            <span className="yt-lbl" id={`fb-kind-${a.id}`}>
              النوع
            </span>
            <div className="wk-seg" role="group" aria-labelledby={`fb-kind-${a.id}`}>
              {CHOICES.map((c) => (
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
                  {LABEL[c]}
                </button>
              ))}
            </div>
          </div>
          <p className="yt-sub" data-fb="lead">
            {LEAD[choice]}
          </p>

          {needsFile && (
            <div className="yt-file">
              {ready ? (
                <div className="yt-chip" data-fb="picked">
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
                  <button type="button" className="wk-btn sm" data-fb="library" onClick={() => setPicking(true)}>
                    <Ic i={FolderOpen} />
                    من المكتبة
                  </button>
                  <button type="button" className="wk-btn sm" data-fb="device" onClick={() => fileInput.current?.click()}>
                    <Ic i={Laptop} />
                    من هذا الجهاز
                  </button>
                </div>
              )}
              <input
                ref={fileInput}
                type="file"
                accept={choice === 'photo' ? 'image/*' : 'video/mp4,video/quicktime'}
                hidden
                data-fb="file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void take({ name: f.name, from: 'device', file: f });
                }}
              />
            </div>
          )}

          {choice !== 'silent' && (
            <label className="pf-f yt-f">
              {choice === 'text' ? 'نص المنشور' : choice === 'photo' ? 'الشرح' : 'الوصف'} {choice !== 'text' && <small>اختياري</small>}
              <textarea className="wk-inp" value={message} maxLength={FB_MESSAGE_MAX + 200} disabled={busy} onChange={(e) => setMessage(e.target.value)} />
            </label>
          )}
          {choice === 'text' && (
            <label className="pf-f yt-f">
              الرابط <small>اختياري، يبدأ بـ https://</small>
              <input className="ltr" value={link} maxLength={2000} disabled={busy} dir="ltr" onChange={(e) => setLink(e.target.value)} />
            </label>
          )}
          {choice === 'photo' && (
            <label className="pf-f yt-f">
              النص البديل <small>اختياري، يصف الصورة لمن لا يراها</small>
              <input value={alt} maxLength={1000} disabled={busy} onChange={(e) => setAlt(e.target.value)} />
            </label>
          )}

          {phase.t === 'sending' || phase.t === 'wait' ? (
            <div className="yt-progress" role="status" aria-live="polite" data-fb="progress">
              {phase.t === 'sending' ? (
                phase.pct === null ? (
                  <span>جارٍ الإرسال إلى فيسبوك…</span>
                ) : (
                  <>
                    <div className="yt-bar">
                      <i style={{ width: `${phase.pct}%` }} />
                    </div>
                    <span>يُرفع الملف {phase.pct}٪</span>
                  </>
                )
              ) : (
                <span>
                  فيسبوك يجلب المقطع ويجهّزه · {clock((now - phase.since) / 1000)}
                  <small className="yt-sub"> قد يأخذ دقائق. أبقِ الصفحة مفتوحة.</small>
                </span>
              )}
              {phase.t === 'wait' || phase.pct !== null ? (
                <button
                  type="button"
                  className="pf-btn ghost"
                  data-fb="cancel"
                  onClick={() => {
                    stop.current = true;
                  }}
                >
                  إلغاء
                </button>
              ) : null}
            </div>
          ) : (
            <div className="pf-acts">
              {/* The silent check shows nothing to anyone, so it needs no long press; every public test does. */}
              {choice === 'silent' ? (
                <button type="button" className="pf-btn pri" data-fb="send" disabled={Boolean(problem) || busy} onClick={() => void send()}>
                  <ShieldCheck aria-hidden="true" />
                  تشغيل الفحص الصامت
                </button>
              ) : (
                <button type="button" className="pf-btn pri" data-fb="send" disabled={Boolean(problem) || busy} data-hold={HOLD.fbTestPost} onClick={() => void send()}>
                  <Upload aria-hidden="true" />
                  نشر التجربة للعموم
                </button>
              )}
              <button type="button" className="pf-btn ghost" onClick={() => setOpen(false)}>
                إغلاق
              </button>
            </div>
          )}
          {problem && (ready || choice === 'text') && !busy && <p className="yt-sub warn">{problem}</p>}
        </div>
      )}

      {phase.t === 'error' && (
        <div className="pf-note bad" role="alert" data-fb="error">
          {phase.text}
          {phase.code === 'SCOPE_MISSING' && (
            <button type="button" className="wk-btn sm" onClick={onReconnect}>
              <Ic i={Link2} />
              إعادة الربط
            </button>
          )}
        </div>
      )}
      {phase.t === 'silent' && (
        <div className={`pf-note ${phase.deleted ? 'ok' : 'bad'} yt-done`} role="status" data-fb="silent">
          {phase.deleted ? (
            <span>تم الفحص: أُنشئ منشور مجدول، وقُرئ من الصفحة، وحُذف. لم يظهر لأحد.</span>
          ) : (
            <>
              <span>{TEST_ERROR_AR.SILENT_NOT_DELETED}</span>
              {planner && (
                <span className="pf-acts">
                  <a className="pf-link" href={planner} target="_blank" rel="noopener noreferrer">
                    <ExternalLink aria-hidden="true" />
                    المنشورات المجدولة في Meta Business Suite
                  </a>
                </span>
              )}
            </>
          )}
        </div>
      )}
      {phase.t === 'done' && (
        <div className="pf-note ok yt-done" role="status" data-fb="done">
          <span>نُشرت التجربة على الصفحة.</span>
          {phase.url && (
            <span className="pf-acts">
              <a className="pf-link" href={phase.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden="true" />
                فتح على فيسبوك
              </a>
            </span>
          )}
        </div>
      )}

      {tests.length > 0 && (
        <div className="yt-list" data-fb="list">
          <h5>آخر التجارب</h5>
          {tests.map((t) => (
            <div className="yt-item" key={t.id} data-test={t.id} data-state={t.state} data-kind={t.kind}>
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
                  {t.post_url && t.kind !== 'fb_silent' && (
                    <a className="wk-btn sm quiet" href={t.post_url} target="_blank" rel="noopener noreferrer" aria-label={`فتح «${t.title}» على فيسبوك`}>
                      <Ic i={ExternalLink} />
                      فتح
                    </a>
                  )}
                  <button type="button" className="wk-btn sm quiet danger" data-hold={HOLD.fbTestDelete} disabled={removing === t.id} onClick={() => void remove(t)}>
                    <Ic i={Trash2} />
                    {removing === t.id ? 'جارٍ الحذف…' : 'حذف'}
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {picking && (
        <LibraryPicker
          have={[]}
          only={choice === 'photo' ? 'image' : 'video'}
          note="تظهر الملفات التي تملك الوصول إلى مجلداتها فقط. الصورة تُحوَّل إلى JPEG هنا، والفيديو يقرؤه الخادم من المكتبة مباشرة."
          onPick={(f) => {
            setPicking(false);
            void take({ name: f.name, from: 'library', file: f });
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </section>
  );
}

'use client';
// «تجربة النشر» in a TikTok account's sheet, and «نشر مباشر» to TikTok from Home (MVP_draft.md section 79), by owner directive of
// 2026-11-15. The default is a draft: the video goes to the account's TikTok inbox and nothing shows until its owner posts it from
// the TikTok app. A post goes out at once with the privacy the person picks, and asks for a long press. Both follow TikTok's rules
// for a posting page: the creator's settings are read each time the form opens, the account's nickname is shown, no privacy is
// chosen in advance, the interactions start off and follow the account's own settings, the commercial disclosure is the person's,
// the consent sentence stands under the button, and the video is shown before it goes. TikTok fetches the file from an address
// the site serves for a few minutes, and the page asks how it is getting on. The page never holds a token or the address. TikTok's
// API cannot delete a post: the page says to remove it in the TikTok app. Who may test is the database's (platform_test_may).
import { useEffect, useRef, useState } from 'react';
import { FolderOpen, Inbox, Laptop, Link2, RefreshCw, Send, X } from 'lucide-react';
import { HOLD } from '@/lib/kit/hold-reasons';
import { supabase } from '@/lib/supabase/client';
import {
  DETAIL_RE,
  TEST_ERROR_AR,
  TT_BRANDED_URL,
  TT_CAPTION_MAX,
  TT_KIND,
  TT_KIND_AR,
  TT_MUSIC_URL,
  TT_POLL_MS,
  TT_PRIVACY_AR,
  TT_PRIVACY_ORDER,
  TT_WAIT_MS,
  directLine,
  ttLabel,
  ttProblem,
  type TestPurpose,
  type TestRow,
  type TtChoice,
  type TtPrivacy,
} from '@/lib/platforms/test-rules';
import type { AccountRow } from '@/lib/work/rules';
import { useWork, type LibraryFile } from './data';
import { Hint, Ic, LibraryPicker } from './parts';
import { api, clock, mb, mimeOf, said, sendToDrive, sleep, useTests, videoSeconds, when } from './test-kit';
import { PickedThumb } from './picked-thumb';

type Creator = { nickname: string; privacy: TtPrivacy[]; commentOff: boolean; duetOff: boolean; stitchOff: boolean; maxSeconds: number | null };
type Ready = { name: string; from: 'device' | 'library'; blob: Blob | null; asset: string | null; version?: number; mime: string; size: number; seconds: number | null; preview: string };
type Phase =
  | { t: 'idle' }
  | { t: 'preparing' }
  | { t: 'sending'; pct: number | null }
  | { t: 'wait'; since: number }
  | { t: 'done'; inbox: boolean }
  | { t: 'error'; text: string; code?: string };

const LABEL: Record<TtChoice, string> = { draft: 'مسودة في صندوق TikTok', post: 'منشور' };
const LEAD: Record<TtChoice, string> = {
  draft: 'يصل المقطع إلى صندوق الحساب في تطبيق TikTok، ولا يظهر لأحد حتى يكمله صاحب الحساب وينشره من التطبيق.',
  post: 'يُنشر المقطع على الحساب فوراً بالخصوصية التي تختارها، ويبقى حتى يُحذف من تطبيق TikTok.',
};

export function TikTokTest({ a, onReconnect, mode = 'test' }: { a: AccountRow; onReconnect: () => void; mode?: TestPurpose }) {
  const direct = mode === 'direct';
  const w = useWork();
  const [open, setOpen] = useState(direct);
  const [choice, setChoice] = useState<TtChoice>('draft');
  const [creator, setCreator] = useState<Creator | null>(null);
  const [creatorError, setCreatorError] = useState<{ text: string; code?: string } | null>(null);
  const [ready, setReady] = useState<Ready | null>(null);
  const [picking, setPicking] = useState(false);
  const [caption, setCaption] = useState('');
  const [privacy, setPrivacy] = useState<TtPrivacy | ''>('');
  const [comments, setComments] = useState(false);
  const [duet, setDuet] = useState(false);
  const [stitch, setStitch] = useState(false);
  const [commercial, setCommercial] = useState(false);
  const [ownBrand, setOwnBrand] = useState(false);
  const [branded, setBranded] = useState(false);
  const [phase, setPhase] = useState<Phase>({ t: 'idle' });
  const [tests, load] = useTests(a.id, mode);
  const [now, setNow] = useState(() => Date.now());
  const stop = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const connected = a.conn_state === 'connected' && a.active;
  const busy = phase.t === 'preparing' || phase.t === 'sending' || phase.t === 'wait';
  const kind = TT_KIND[choice];
  const post = choice === 'post';

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => () => {
    if (ready?.blob) URL.revokeObjectURL(ready.preview);
  }, [ready]);

  // TikTok asks that the creator's settings are read each time the posting page opens.
  const readCreator = async () => {
    setCreator(null);
    setCreatorError(null);
    const r = await api('/api/platforms/test/creator', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: a.id, purpose: mode }) });
    if (r.ok && r.b.creator && typeof r.b.creator === 'object') setCreator(r.b.creator as Creator);
    else setCreatorError({ text: said(r.b), code: r.b.code as string | undefined });
  };
  useEffect(() => {
    if (open && connected) void readCreator();
    // Read once per opening of the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, connected, a.id]);

  const problem = !ready
    ? 'اختر مقطع الفيديو.'
    : ttProblem({ kind, size: ready.size, mime: ready.mime, seconds: ready.seconds, maxSeconds: creator?.maxSeconds ?? null, caption, privacy: privacy || null, commercial, ownBrand, branded });
  const blocked = !creator || Boolean(problem) || busy;

  const take = async (pick: { name: string; from: 'device'; file: File } | { name: string; from: 'library'; file: LibraryFile }) => {
    setReady(null);
    setPhase({ t: 'preparing' });
    try {
      if (pick.from === 'device') {
        const preview = URL.createObjectURL(pick.file);
        const seconds = await videoSeconds(preview);
        setReady({ name: pick.name, from: 'device', blob: pick.file, asset: null, mime: mimeOf(pick.file), size: pick.file.size, seconds, preview });
      } else {
        // A library video is read by the server where it is; its type and size are the library's.
        const { data } = await supabase().from('media_files').select('mime_type,size_bytes').eq('id', pick.file.id).maybeSingle();
        const preview = `/api/media/${pick.file.id}/content`;
        const seconds = await videoSeconds(preview);
        setReady({ name: pick.name, from: 'library', blob: null, asset: pick.file.id, version: pick.file.current_version, mime: String(data?.mime_type ?? '').toLowerCase(), size: Number(data?.size_bytes ?? 0), seconds, preview });
      }
      setPhase({ t: 'idle' });
    } catch {
      setPhase({ t: 'error', text: 'تعذّر تجهيز الملف. جرّب ملفاً آخر.' });
    }
  };

  const send = async () => {
    if (blocked || !ready) return;
    stop.current = false;
    const fail = async (b: Record<string, unknown>) => {
      setPhase({ t: 'error', text: said(b), code: b.code as string | undefined });
      await load();
    };
    const words = { caption, comments, duet, stitch, commercial, own_brand: ownBrand, branded };
    setPhase({ t: 'sending', pct: null });
    const start = await api('/api/platforms/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account: a.id,
        kind,
        ...(post ? { privacy, ...words } : { caption: '' }),
        ...(ready.blob ? { source: 'device', size: ready.size, mime: ready.mime } : { source: 'library', asset: ready.asset }),
        ...(direct ? { purpose: 'direct' } : {}),
      }),
    });
    if (!start.ok || typeof start.b.test !== 'string') return fail(start.b);
    const test = start.b.test;
    const cancel = async () => {
      await api(`/api/platforms/test/${test}`, { method: 'DELETE' });
      setPhase({ t: 'error', text: TEST_ERROR_AR.CANCELLED });
      await load();
    };

    if (start.b.phase === 'upload' && typeof start.b.upload === 'string' && ready.blob) {
      let ref: string;
      try {
        ref = await sendToDrive(start.b.upload, ready.blob, (f) => setPhase({ t: 'sending', pct: Math.min(99, Math.round(f * 100)) }), () => stop.current);
      } catch (e) {
        if (stop.current) return cancel();
        await api(`/api/platforms/test/${test}`, { method: 'DELETE' });
        return fail({ error: e instanceof Error && e.message !== 'stopped' ? e.message : TEST_ERROR_AR.TEMP_UPLOAD_FAILED });
      }
      const sent = await api(`/api/platforms/test/${test}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step: 'uploaded', ref, ...(post ? words : {}) }) });
      if (!sent.ok) return fail(sent.b);
    }

    // TikTok fetches and checks the video; the page asks how it is going until it arrives.
    const since = Date.now();
    setPhase({ t: 'wait', since });
    let tries = 0;
    for (;;) {
      if (stop.current) return cancel();
      if (Date.now() - since > TT_WAIT_MS) {
        await api(`/api/platforms/test/${test}`, { method: 'DELETE' });
        return fail({ error: TEST_ERROR_AR.TT_WAIT_TOO_LONG });
      }
      await sleep(TT_POLL_MS);
      if (stop.current) return cancel();
      const r = await api(`/api/platforms/test/${test}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step: 'advance' }) });
      if (r.b.done === true) {
        const inbox = r.b.inbox === true;
        setPhase({ t: 'done', inbox });
        w.say(inbox ? 'وصلت المسودة إلى صندوق الحساب على TikTok.' : 'نُشر المقطع على TikTok.');
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

  const statusOf = (t: TestRow) => {
    if (t.state === 'uploading') return 'يُرسل الآن';
    if (t.state === 'failed') return `لم يكتمل${t.error ? `: ${TEST_ERROR_AR[t.error] ?? 'خطأ من المنصة.'}` : ''}${t.error_detail && DETAIL_RE.test(t.error_detail) ? ` (${t.error_detail})` : ''}`;
    if (direct) return directLine(t, now, when);
    if (t.kind === 'tt_draft') return 'وصلت مسودة إلى صندوق الحساب';
    return `نُشر · ${TT_PRIVACY_AR[(t.privacy ?? 'private') as TtPrivacy] ?? ''}`;
  };

  const reconnectNeeded = (code?: string) => code === 'SCOPE_MISSING' || code === 'TOKEN_EXPIRED' || code === 'TOKEN_REFUSED' || code === 'PERMISSION_REVOKED';
  const label = ttLabel(ownBrand, branded);

  return (
    <section className="yt-test" aria-label={direct ? 'نشر مباشر' : 'تجربة النشر'} data-gd="tt-test" data-mode={mode}>
      <h4>{direct ? 'نشر مباشر' : 'تجربة النشر'}</h4>
      <p className="yt-lead">
        {direct
          ? 'يرسل إلى الحساب على TikTok فعلاً، خارج دورة العمل. يُسجَّل في «سجل النشاط»، ويُبلَّغ ناشرو الحساب والمساعد. لا يحذف TikTok منشوراً عبر التطبيقات: يُحذف من تطبيق TikTok نفسه.'
          : 'يرسل إلى الحساب على TikTok شيئاً حقيقياً ليتأكد أن النشر يصل. لا يمر بالمراجعة ولا يُعدّ عملاً. لا يحذف TikTok منشوراً عبر التطبيقات: يُحذف من تطبيق TikTok نفسه.'}
      </p>
      {!connected ? (
        <Hint warn>{direct ? 'الحساب غير متصل الآن، فلا يُنشر عليه. أعد ربطه أولاً.' : 'الحساب غير متصل الآن، فلا تُجرى التجربة. أعد ربطه أولاً.'}</Hint>
      ) : !open ? (
        <div className="pf-acts">
          <button type="button" className="wk-btn sm" data-tt="open" onClick={() => setOpen(true)}>
            <Ic i={Send} />
            {direct ? 'نشر جديد' : 'بدء تجربة'}
          </button>
        </div>
      ) : (
        <div className="yt-form">
          {creator ? (
            <>
              <p className="yt-sub" data-tt="creator">
                يُرسل إلى حساب TikTok: <b><bdi>{creator.nickname || 'الحساب'}</bdi></b>
                {/* TikTok offers «الجميع» only to a public account: that is how the page knows which one TikTok sees now. */}
                <span data-tt="visibility"> · الحساب عند TikTok الآن: {creator.privacy.includes('public') ? 'عام' : 'خاص'}</span>
                <button type="button" className="wk-btn sm quiet" data-tt="reread" disabled={busy} onClick={() => void readCreator()}>
                  <Ic i={RefreshCw} />
                  تحديث
                </button>
              </p>
              {post && creator.privacy.includes('public') && (
                <Hint warn>
                  يرى TikTok الحساب عاماً الآن، فسيرفض المنشور المباشر حتى يدقق التطبيق. اجعل الحساب خاصاً في تطبيق TikTok ثم اضغط «تحديث» هنا. قد يتأخر TikTok
                  دقائق في رؤية التغيير.
                </Hint>
              )}
            </>
          ) : creatorError ? (
            <div className="pf-note bad" role="alert" data-tt="creator-error">
              {creatorError.text}
              {reconnectNeeded(creatorError.code) ? (
                <button type="button" className="wk-btn sm" onClick={onReconnect}>
                  <Ic i={Link2} />
                  إعادة الربط
                </button>
              ) : (
                <button type="button" className="wk-btn sm" onClick={() => void readCreator()}>
                  <Ic i={RefreshCw} />
                  إعادة المحاولة
                </button>
              )}
            </div>
          ) : (
            <p className="yt-sub" role="status">
              جارٍ قراءة إعدادات الحساب من TikTok…
            </p>
          )}

          <div className="yt-row">
            <span className="yt-lbl" id={`tt-kind-${a.id}`}>
              النوع
            </span>
            <div className="wk-seg" role="group" aria-labelledby={`tt-kind-${a.id}`}>
              {(['draft', 'post'] as TtChoice[]).map((c) => (
                <button type="button" key={c} aria-pressed={choice === c} disabled={busy} data-tt-choice={c} onClick={() => setChoice(c)}>
                  {LABEL[c]}
                </button>
              ))}
            </div>
          </div>
          <p className="yt-sub" data-tt="lead">
            {LEAD[choice]}
          </p>

          <div className="yt-file">
            {ready ? (
              <>
                <div className="yt-chip" data-tt="picked">
                  <PickedThumb blob={ready.blob} asset={ready.asset} version={ready.version} mime={ready.mime} name={ready.name} />
                  <b>
                    <bdi>{ready.name}</bdi>
                  </b>
                  <small>
                    {ready.from === 'device' ? 'من هذا الجهاز' : 'من المكتبة'}
                    {ready.seconds != null ? ` · ${clock(ready.seconds)}` : ''} · {mb(ready.size)}
                  </small>
                  <button type="button" className="wk-btn icon quiet" aria-label="إزالة الملف" disabled={busy} onClick={() => setReady(null)}>
                    <Ic i={X} />
                  </button>
                </div>
                {/* TikTok asks that the video is shown before it is sent. */}
                <video className="tt-preview" src={ready.preview} controls muted playsInline preload="metadata" data-tt="preview" />
              </>
            ) : phase.t === 'preparing' ? (
              <p className="yt-sub" role="status">
                جارٍ تجهيز الملف…
              </p>
            ) : (
              <div className="pf-acts">
                <button type="button" className="wk-btn sm" data-tt="library" onClick={() => setPicking(true)}>
                  <Ic i={FolderOpen} />
                  من المكتبة
                </button>
                <button type="button" className="wk-btn sm" data-tt="device" onClick={() => fileInput.current?.click()}>
                  <Ic i={Laptop} />
                  من هذا الجهاز
                </button>
              </div>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="video/mp4,video/quicktime"
              hidden
              data-tt="file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void take({ name: f.name, from: 'device', file: f });
              }}
            />
          </div>

          {post && (
            <>
              <label className="pf-f yt-f">
                الشرح <small>اختياري، حتى {TT_CAPTION_MAX} حرف، والوسوم والإشارات تُقرأ كما في TikTok</small>
                <textarea className="wk-inp" value={caption} maxLength={TT_CAPTION_MAX} disabled={busy} data-tt="caption" onChange={(e) => setCaption(e.target.value)} />
              </label>
              <label className="pf-f yt-f">
                من يرى المنشور
                <select className="wk-inp" value={privacy} disabled={busy || !creator} data-tt="privacy" onChange={(e) => setPrivacy(e.target.value as TtPrivacy | '')}>
                  <option value="" disabled>
                    اختر
                  </option>
                  {TT_PRIVACY_ORDER.filter((p) => creator?.privacy.includes(p)).map((p) => (
                    <option key={p} value={p} disabled={branded && p === 'private'}>
                      {TT_PRIVACY_AR[p]}
                      {branded && p === 'private' ? ' (لا يكون المحتوى الممول خاصاً)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="yt-f tt-allow" disabled={busy}>
                <legend>السماح للمستخدمين</legend>
                {(
                  [
                    ['comments', 'التعليق', comments, setComments, creator?.commentOff],
                    ['duet', 'الثنائي (Duet)', duet, setDuet, creator?.duetOff],
                    ['stitch', 'الدمج (Stitch)', stitch, setStitch, creator?.stitchOff],
                  ] as const
                ).map(([k, text, on, set, off]) => (
                  <label key={k} className="pf-check tt-check" data-tt-allow={k} aria-disabled={off ? true : undefined}>
                    <input type="checkbox" checked={on && !off} disabled={Boolean(off)} onChange={(e) => set(e.target.checked)} />
                    {text}
                    {off && <small> مغلق في إعدادات الحساب</small>}
                  </label>
                ))}
              </fieldset>
              <fieldset className="yt-f tt-allow" disabled={busy}>
                <legend>الإفصاح عن محتوى تجاري</legend>
                <label className="pf-check tt-check">
                  <input
                    type="checkbox"
                    checked={commercial}
                    data-tt="commercial"
                    onChange={(e) => {
                      setCommercial(e.target.checked);
                      if (!e.target.checked) {
                        setOwnBrand(false);
                        setBranded(false);
                      }
                    }}
                  />
                  يروّج هذا المقطع لعلامة تجارية أو منتج أو خدمة
                </label>
                {commercial && (
                  <>
                    <label className="pf-check tt-check" title="بيّن إن كان المحتوى يروّج لك، أو لطرف آخر، أو لكليكما.">
                      <input type="checkbox" checked={ownBrand} data-tt="own-brand" onChange={(e) => setOwnBrand(e.target.checked)} />
                      علامتك التجارية <small>تروّج لنفسك أو لعملك</small>
                    </label>
                    <label className="pf-check tt-check" title="بيّن إن كان المحتوى يروّج لك، أو لطرف آخر، أو لكليكما.">
                      <input
                        type="checkbox"
                        checked={branded}
                        data-tt="branded"
                        onChange={(e) => {
                          setBranded(e.target.checked);
                          // Branded content cannot be «أنا فقط»: TikTok's rule, applied where the choice is made.
                          if (e.target.checked && privacy === 'private') setPrivacy('');
                        }}
                      />
                      محتوى ممول <small>تروّج لطرف آخر</small>
                    </label>
                    {label && <small className="yt-sub">{label}</small>}
                  </>
                )}
              </fieldset>
            </>
          )}

          {phase.t === 'sending' || phase.t === 'wait' ? (
            <div className="yt-progress" role="status" aria-live="polite" data-tt="progress">
              {phase.t === 'sending' ? (
                phase.pct === null ? (
                  <span>جارٍ الإرسال إلى TikTok…</span>
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
                  TikTok يجلب المقطع ويفحصه · {clock((now - phase.since) / 1000)}
                  <small className="yt-sub"> قد يأخذ دقائق. أبقِ الصفحة مفتوحة.</small>
                </span>
              )}
              {phase.t === 'wait' || phase.pct !== null ? (
                <button
                  type="button"
                  className="pf-btn ghost"
                  data-tt="cancel"
                  onClick={() => {
                    stop.current = true;
                  }}
                >
                  إلغاء
                </button>
              ) : null}
            </div>
          ) : (
            <>
              {post && (
                <p className="yt-sub" data-tt="consent">
                  بالنشر توافق على{' '}
                  {branded && (
                    <>
                      <a href={TT_BRANDED_URL} target="_blank" rel="noopener noreferrer">
                        سياسة المحتوى الممول
                      </a>{' '}
                      و
                    </>
                  )}
                  <a href={TT_MUSIC_URL} target="_blank" rel="noopener noreferrer">
                    تأكيد استخدام الموسيقى
                  </a>{' '}
                  لدى TikTok. قد يستغرق ظهور المنشور على الحساب بضع دقائق.
                </p>
              )}
              <div className="pf-acts">
                {post ? (
                  <button type="button" className="pf-btn pri" data-tt="send" disabled={blocked} data-hold={direct ? HOLD.directTikTok : HOLD.ttTestPost} onClick={() => void send()}>
                    <Send aria-hidden="true" />
                    {direct ? 'نشر على TikTok' : 'نشر التجربة على TikTok'}
                  </button>
                ) : (
                  <button type="button" className="pf-btn pri" data-tt="send" disabled={blocked} onClick={() => void send()}>
                    <Inbox aria-hidden="true" />
                    إرسال مسودة إلى TikTok
                  </button>
                )}
                {!direct && (
                  <button type="button" className="pf-btn ghost" onClick={() => setOpen(false)}>
                    إغلاق
                  </button>
                )}
              </div>
            </>
          )}
          {post && <Hint>حتى يدقق TikTok التطبيق لا يُنشر مباشرة إلا «أنا فقط»، وعلى حساب جُعل خاصاً في تطبيق TikTok. المسودة تصل إلى أي حساب.</Hint>}
          {problem && ready && !busy && <p className="yt-sub warn">{problem}</p>}
        </div>
      )}

      {phase.t === 'error' && (
        <div className="pf-note bad" role="alert" data-tt="error">
          {phase.text}
          {reconnectNeeded(phase.code) && (
            <button type="button" className="wk-btn sm" onClick={onReconnect}>
              <Ic i={Link2} />
              إعادة الربط
            </button>
          )}
        </div>
      )}
      {phase.t === 'done' && (
        <div className="pf-note ok yt-done" role="status" data-tt="done">
          <span>
            {phase.inbox
              ? 'وصلت المسودة إلى صندوق الحساب على TikTok. في تطبيق TikTok على الهاتف افتح «Inbox» ثم «System notifications»، واضغط إشعار الصندوق «Your content from … is ready» لإكمالها ونشرها.'
              : 'نُشر المقطع على TikTok. قد يستغرق ظهوره على الحساب بضع دقائق.'}
          </span>
        </div>
      )}

      {tests.length > 0 && (
        <div className="yt-list" data-tt="list">
          <h5>{direct ? 'آخر المنشورات المباشرة' : 'آخر التجارب'}</h5>
          {tests.map((t) => (
            <div className="yt-item" key={t.id} data-test={t.id} data-state={t.state} data-kind={t.kind}>
              <span className="yt-item-text">
                <b>
                  <bdi>{t.title}</bdi>
                </b>
                <small>
                  {TT_KIND_AR[t.kind ?? ''] ? `${TT_KIND_AR[t.kind ?? '']} · ` : ''}
                  {statusOf(t)} · {when(t.created_at)} · {w.nameOf(t.created_by)}
                </small>
              </span>
            </div>
          ))}
          {tests.some((t) => t.state === 'published') && <small className="yt-sub">لا يحذف TikTok منشوراً عبر التطبيقات: يُحذف من تطبيق TikTok نفسه.</small>}
        </div>
      )}

      {picking && (
        <LibraryPicker
          have={[]}
          only="video"
          note="تظهر الملفات التي تملك الوصول إلى مجلداتها فقط. يقرأ الخادم الفيديو من المكتبة، ويجلبه TikTok من عنوان مؤقت."
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

'use client';
// «تجربة النشر» in a Snapchat account's sheet (Snapchat_Test_Plan.md section 6, MVP_draft.md section 85), by owner directive of
// 2026-11-26. Snap's whole API is open only to apps Snap has allowed, so nothing here has met a real Snap answer, and the panel says so.
// The default is a check that reads the account and posts nothing. A «فحص صامت» posts a Spotlight scheduled fourteen days ahead, reads
// it back and deletes it at once; that Snap shows a scheduled Spotlight to nobody before its time is read from one line of its
// documents and is NOT proven, and the page says so wherever it speaks of the silent check. A Spotlight is public and can be deleted;
// a Story is visible to followers for 24 hours and cannot be deleted by any application. A file from the library is read by the
// server where it is; a file from this device goes to Drive and is read from there. The page never holds a token, a key, or an
// address other than Drive's upload. Who may test is the database's (platform_test_may); the panel is drawn for the same people.
import { useEffect, useRef, useState } from 'react';
import { Eye, FolderOpen, Laptop, Link2, Search, Send, ShieldCheck, Trash2, X } from 'lucide-react';
import { Rich } from '@/components/guide-text';
import { HOLD } from '@/lib/kit/hold-reasons';
import { supabase } from '@/lib/supabase/client';
import {
  DETAIL_RE,
  SN_DESCRIPTION_MAX,
  SN_KIND,
  SN_KIND_AR,
  SN_SILENT_DAYS,
  SN_STATS_NOTE,
  SN_STORY_HOURS,
  TEST_ERROR_AR,
  isSnKind,
  snProblem,
  type SnChoice,
  type TestRow,
} from '@/lib/platforms/test-rules';
import type { AccountRow } from '@/lib/work/rules';
import { useWork, type LibraryFile } from './data';
import { Hint, Ic, LibraryPicker } from './parts';
import { api, clock, mb, mimeOf, said, sendToDrive, useTests, videoSeconds, when } from './test-kit';
import { PickedThumb } from './picked-thumb';

type Ready = { name: string; from: 'device' | 'library'; blob: Blob | null; asset: string | null; version?: number; mime: string; size: number; seconds: number | null };
/** What the account check read; a part Snap would not give is null. */
type Check = {
  profile: { name: string; username: string | null; subscribers: number | null };
  spotlights: { count: number; live: number; submitted: number; rejected: number } | null;
  stories: { count: number } | null;
  stats: { subscribers: number | null; views: number | null; viewers: number | null; shares: number | null; screenshots: number | null } | null;
  note: string;
};
type Numbers = { views: number | null; viewers: number | null; shares: number | null; screenshots: number | null; at: string | null; late: boolean };
type Phase =
  | { t: 'idle' }
  | { t: 'preparing' }
  | { t: 'checking' }
  | { t: 'sending'; pct: number | null }
  | { t: 'checked'; check: Check }
  | { t: 'silent'; deleted: boolean; status: string | null; at: string | null }
  | { t: 'spotlight'; status: string | null }
  | { t: 'story'; endsAt: string | null }
  | { t: 'error'; text: string; code?: string };

const CHOICES: SnChoice[] = ['check', 'silent', 'spotlight', 'story'];
const LABEL: Record<SnChoice, string> = { check: 'فحص الحساب بلا نشر', silent: 'فحص صامت', spotlight: 'سبوتلايت', story: 'قصة' };
const LEAD: Record<SnChoice, string> = {
  check: 'يقرأ الملف العام للحساب: اسمه ومشتركيه، وآخر ما فيه من سبوتلايت وقصص، وأرقام الحساب الإجمالية. لا ينشر شيئاً ولا يحتاج ملفاً.',
  silent: `ينشئ سبوتلايت مجدولاً بعد ${SN_SILENT_DAYS} يوماً من مقطع تختاره، ويقرؤه من Snap، ثم يحذفه فوراً.`,
  spotlight: 'يُنشر المقطع الآن سبوتلايت علنياً: يراه كل من يزور الملف العام ويظهر في Spotlight. يمكن حذفه من القائمة بعد نشره.',
  story: `تُنشر القصة الآن، ويراها متابعو الحساب ${SN_STORY_HOURS} ساعة ثم تنتهي وحدها.`,
};
const STATUS_AR: Record<string, string> = { SUBMITTED: 'أُرسل إلى Snap وينتظر', LIVE: 'ظاهر الآن', REJECTED: 'رفضته Snap' };
const RECONNECT = ['SCOPE_MISSING', 'TOKEN_EXPIRED', 'TOKEN_REFUSED', 'PERMISSION_REVOKED', 'NOT_CONNECTED', 'NO_PROFILE'];

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null);
const fmt = (n: number | null) => (n === null ? 'غير متاح' : n.toLocaleString('ar-SA-u-nu-latn'));

/** What the route answered for a check, taken apart defensively: the page draws only what is a number or a word. */
function readCheck(b: unknown): Check | null {
  const c = obj(b);
  const p = obj(c?.profile);
  if (!c || !p) return null;
  const sp = obj(c.spotlights);
  const st = obj(c.stories);
  const ss = obj(c.stats);
  return {
    profile: { name: str(p.name), username: str(p.username) || null, subscribers: num(p.subscribers) },
    spotlights: sp ? { count: num(sp.count) ?? 0, live: num(sp.live) ?? 0, submitted: num(sp.submitted) ?? 0, rejected: num(sp.rejected) ?? 0 } : null,
    stories: st ? { count: num(st.count) ?? 0 } : null,
    stats: ss ? { subscribers: num(ss.subscribers), views: num(ss.views), viewers: num(ss.viewers), shares: num(ss.shares), screenshots: num(ss.screenshots) } : null,
    note: str(c.note),
  };
}
function readNumbers(b: unknown): Numbers | null {
  const s = obj(b);
  if (!s) return null;
  return { views: num(s.views), viewers: num(s.viewers), shares: num(s.shares), screenshots: num(s.screenshots), at: str(s.at) || null, late: s.late === true };
}
const statusWord = (s: unknown) => (typeof s === 'string' ? (STATUS_AR[s] ?? null) : null);
const iso = (v: unknown) => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null);
/** When a Story posted at `from` ends by itself. */
const endOf = (from: string) => new Date(Date.parse(from) + SN_STORY_HOURS * 3600e3).toISOString();

export function SnapchatTest({ a, onReconnect }: { a: AccountRow; onReconnect: () => void }) {
  const w = useWork();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<SnChoice>('check');
  const [ready, setReady] = useState<Ready | null>(null);
  const [picking, setPicking] = useState(false);
  const [description, setDescription] = useState('');
  const [phase, setPhase] = useState<Phase>({ t: 'idle' });
  const [tests, load] = useTests(a.id);
  const [removing, setRemoving] = useState<string | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [numbers, setNumbers] = useState<Record<string, Numbers>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());
  const stop = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const connected = a.conn_state === 'connected' && a.active;
  const busy = phase.t === 'preparing' || phase.t === 'checking' || phase.t === 'sending';
  const needsFile = choice !== 'check';
  const kind = choice === 'check' ? null : SN_KIND[choice];
  const spot = choice === 'spotlight';
  const mine = tests.filter((t) => isSnKind(t.kind ?? ''));

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const problem = !needsFile
    ? null
    : !ready
      ? 'اختر مقطع الفيديو.'
      : snProblem({ kind: kind ?? '', size: ready.size, mime: ready.mime, seconds: ready.seconds, description: spot ? description : '' });
  const blocked = Boolean(problem) || busy;
  const reconnectNeeded = (code?: string) => Boolean(code && RECONNECT.includes(code));

  const take = async (pick: { name: string; from: 'device'; file: File } | { name: string; from: 'library'; file: LibraryFile }) => {
    setReady(null);
    setPhase({ t: 'preparing' });
    try {
      if (pick.from === 'device') {
        const url = URL.createObjectURL(pick.file);
        const seconds = await videoSeconds(url);
        URL.revokeObjectURL(url);
        setReady({ name: pick.name, from: 'device', blob: pick.file, asset: null, mime: mimeOf(pick.file), size: pick.file.size, seconds });
      } else {
        // A library video is read by the server where it is; its type and size are the library's.
        const { data } = await supabase().from('media_files').select('mime_type,size_bytes').eq('id', pick.file.id).maybeSingle();
        const seconds = await videoSeconds(`/api/media/${pick.file.id}/content`);
        setReady({ name: pick.name, from: 'library', blob: null, asset: pick.file.id, version: pick.file.current_version, mime: String(data?.mime_type ?? '').toLowerCase(), size: Number(data?.size_bytes ?? 0), seconds });
      }
      setPhase({ t: 'idle' });
    } catch {
      setPhase({ t: 'error', text: 'تعذّر تجهيز الملف. جرّب ملفاً آخر.' });
    }
  };

  const send = async () => {
    if (blocked) return;
    stop.current = false;
    const fail = async (b: Record<string, unknown>) => {
      setPhase({ t: 'error', text: said(b), code: b.code as string | undefined });
      await load();
    };

    // The account check: one request, no row and no file.
    if (choice === 'check') {
      setPhase({ t: 'checking' });
      const r = await api('/api/platforms/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: a.id, kind: 'snap_check' }) });
      const check = r.ok ? readCheck(r.b.check) : null;
      if (!check) return fail(r.b);
      setPhase({ t: 'checked', check });
      w.say('قُرئ حساب سناب شات.');
      return;
    }
    if (!kind || !ready) return;

    // The whole post is one request on the server; this turns its final answer into words.
    const finish = (b: Record<string, unknown>) => {
      const k = typeof b.kind === 'string' ? b.kind : kind;
      if (k === 'snap_silent') {
        const deleted = b.deleted === true;
        setPhase({ t: 'silent', deleted, status: statusWord(b.status), at: iso(b.at) });
        w.say(deleted ? 'نجح الفحص الصامت على سناب شات: أُنشئ السبوتلايت وقُرئ وحُذف.' : 'أُنشئ سبوتلايت الفحص وقُرئ، لكن حذفه لم يتم.');
      } else if (k === 'snap_story') {
        setPhase({ t: 'story', endsAt: iso(b.endsAt) ?? endOf(new Date().toISOString()) });
        w.say('نُشرت القصة على سناب شات.');
      } else {
        setPhase({ t: 'spotlight', status: statusWord(b.status) });
        w.say('نُشر السبوتلايت على سناب شات.');
      }
      return void load();
    };

    setPhase({ t: 'sending', pct: null });
    const start = await api('/api/platforms/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account: a.id,
        kind,
        ...(spot ? { description: description.trim() } : {}),
        ...(ready.blob ? { source: 'device', size: ready.size, mime: ready.mime } : { source: 'library', asset: ready.asset }),
      }),
    });
    if (start.b.done === true) return finish(start.b);
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
      // The file is on Drive; the server now reads it, sends it to Snap and posts, in this one request.
      setPhase({ t: 'sending', pct: null });
      const sent = await api(`/api/platforms/test/${test}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step: 'uploaded', ref }) });
      if (sent.b.done === true) return finish(sent.b);
      return fail(sent.b);
    }
    return fail({ error: 'جاء جواب غير متوقع من الخادم.' });
  };

  const remove = async (t: TestRow) => {
    setRemoving(t.id);
    const r = await api(`/api/platforms/test/${t.id}`, { method: 'DELETE' });
    setRemoving(null);
    if (r.ok) {
      setNotes((n) => ({ ...n, [t.id]: '' }));
      w.say(r.b.gone === true ? `«${t.title}» كان قد حُذف من Snap.` : `حُذف «${t.title}» من Snap.`);
    } else {
      const text = said(r.b);
      setNotes((n) => ({ ...n, [t.id]: text }));
      w.say(text);
    }
    await load();
  };

  const readNumbersOf = async (t: TestRow) => {
    setReading(t.id);
    const r = await api(`/api/platforms/test/${t.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step: 'stats' }) });
    setReading(null);
    const got = r.ok ? readNumbers(r.b.stats) : null;
    if (got) {
      setNumbers((s) => ({ ...s, [t.id]: got }));
      setNotes((n) => ({ ...n, [t.id]: '' }));
    } else {
      setNotes((n) => ({ ...n, [t.id]: said(r.b) }));
    }
  };

  const statusOf = (t: TestRow) => {
    if (t.state === 'uploading') return 'يُرسل الآن';
    if (t.state === 'failed') return `لم يكتمل${t.error ? `: ${TEST_ERROR_AR[t.error] ?? 'خطأ من المنصة.'}` : ''}${t.error_detail && DETAIL_RE.test(t.error_detail) ? ` (${t.error_detail})` : ''}`;
    if (t.kind === 'snap_silent') {
      if (t.state === 'deleted') return 'أُنشئ سبوتلايت مجدول وقُرئ وحُذف قبل موعده';
      return `لم يُحذف بعد${t.scheduled_for ? `، وإن بقي نُشر ${when(t.scheduled_for)}` : ''}`;
    }
    if (t.kind === 'snap_story') {
      const ends = Date.parse(endOf(t.done_at ?? t.created_at));
      return ends <= now ? 'نُشرت قصة · انتهت وحدها' : `نُشرت قصة · تنتهي وحدها ${when(new Date(ends).toISOString())}، ولا تُحذف`;
    }
    if (t.state === 'deleted') return 'حُذف من Snap';
    return 'نُشر على Snap';
  };
  const numbersLine = (s: Numbers) =>
    `المشاهدات ${fmt(s.views)} · المشاهدون ${fmt(s.viewers)} · المشاركات ${fmt(s.shares)} · لقطات الشاشة ${fmt(s.screenshots)}${s.at ? ` · قُرئت ${when(s.at)}` : ''}`;

  return (
    <section className="yt-test" aria-label="تجربة النشر على سناب شات" data-gd="sn-test">
      <h4>
        <Rich text="تجربة النشر على Snapchat" />
      </h4>
      <p className="yt-lead" data-sn="lead">
        <Rich text="واجهة Snap مفتوحة للتطبيقات التي أذنت لها Snap وحدها، فإلى أن تأذن للتطبيق قد يقول الفحص إن Snap رفضت. لا يمر شيء من التجارب بالمراجعة ولا يُعدّ عملاً." />
      </p>
      {!connected ? (
        <Hint warn>الحساب غير متصل الآن، فلا تُجرى التجربة. أعد ربطه أولاً.</Hint>
      ) : !open ? (
        <div className="pf-acts">
          <button type="button" className="wk-btn sm" data-sn="open" onClick={() => setOpen(true)}>
            <Ic i={Send} />
            بدء تجربة
          </button>
        </div>
      ) : (
        <div className="yt-form">
          <div className="yt-row">
            <span className="yt-lbl" id={`sn-kind-${a.id}`}>
              النوع
            </span>
            <div className="wk-seg" role="group" aria-labelledby={`sn-kind-${a.id}`}>
              {CHOICES.map((c) => (
                <button
                  type="button"
                  key={c}
                  aria-pressed={choice === c}
                  disabled={busy}
                  data-sn-choice={c}
                  onClick={() => {
                    setChoice(c);
                    setPhase({ t: 'idle' });
                  }}
                >
                  {LABEL[c]}
                </button>
              ))}
            </div>
          </div>
          <p className="yt-sub" data-sn="choice-lead">
            <Rich text={LEAD[choice]} />
          </p>
          {choice === 'silent' && (
            <Hint warn>
              <span data-sn="unproven">
                <Rich text="لم يثبت أن Snap تخفي السبوتلايت المجدول عن الناس قبل موعده: قُرئ هذا من سطر واحد في وثائقها ولم يُجرَّب. إن بقي الفحص غير محذوف فاحذفه من القائمة قبل موعده." />
              </span>
            </Hint>
          )}
          {choice === 'story' && (
            <Hint warn>
              <span data-sn="story-warn">
                <Rich text="لا يمكن حذف القصة: لا تتيح Snap ذلك للتطبيقات، ولا يحذفها الموقع. تبقى ظاهرة لمتابعي الحساب حتى تنتهي وحدها بعد 24 ساعة." />
              </span>
            </Hint>
          )}

          {needsFile && (
            <div className="yt-file">
              {ready ? (
                <div className="yt-chip" data-sn="picked">
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
              ) : phase.t === 'preparing' ? (
                <p className="yt-sub" role="status">
                  جارٍ تجهيز الملف…
                </p>
              ) : (
                <div className="pf-acts">
                  <button type="button" className="wk-btn sm" data-sn="library" onClick={() => setPicking(true)}>
                    <Ic i={FolderOpen} />
                    من المكتبة
                  </button>
                  <button type="button" className="wk-btn sm" data-sn="device" onClick={() => fileInput.current?.click()}>
                    <Ic i={Laptop} />
                    من هذا الجهاز
                  </button>
                </div>
              )}
              <input
                ref={fileInput}
                type="file"
                accept="video/mp4"
                hidden
                data-sn="file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void take({ name: f.name, from: 'device', file: f });
                }}
              />
              <p className="yt-sub" data-sn="limits">
                <Rich text="فيديو MP4 فقط، حتى 30 ميغابايت، من 5 ثوانٍ إلى 5 دقائق." />
              </p>
            </div>
          )}

          {spot && (
            <label className="pf-f yt-f">
              الوصف <small>اختياري، حتى {SN_DESCRIPTION_MAX} حرف، ويكون عنوان التجربة في القائمة</small>
              <textarea className="wk-inp" value={description} disabled={busy} data-sn="description" onChange={(e) => setDescription(e.target.value)} />
              <small className="yt-count" data-sn="count">
                {[...description].length} من {SN_DESCRIPTION_MAX}
              </small>
            </label>
          )}

          {phase.t === 'sending' || phase.t === 'checking' ? (
            <div className="yt-progress" role="status" aria-live="polite" data-sn="progress">
              {phase.t === 'checking' ? (
                <span>
                  <Rich text="جارٍ قراءة الحساب من Snap…" />
                </span>
              ) : phase.pct === null ? (
                <span>
                  <Rich text="جارٍ الإرسال إلى Snap. قد يأخذ دقيقة، فأبقِ الصفحة مفتوحة." />
                </span>
              ) : (
                <>
                  <div className="yt-bar">
                    <i style={{ width: `${phase.pct}%` }} />
                  </div>
                  <span>يُرفع الملف {phase.pct}٪</span>
                </>
              )}
              {phase.t === 'sending' && phase.pct !== null ? (
                <button
                  type="button"
                  className="pf-btn ghost"
                  data-sn="cancel"
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
              {/* The check and the silent check show nothing to anyone, so they need no long press; a Spotlight and a Story do. */}
              {choice === 'check' ? (
                <button type="button" className="pf-btn pri" data-sn="send" disabled={blocked} onClick={() => void send()}>
                  <Search aria-hidden="true" />
                  فحص الحساب
                </button>
              ) : choice === 'silent' ? (
                <button type="button" className="pf-btn pri" data-sn="send" disabled={blocked} onClick={() => void send()}>
                  <ShieldCheck aria-hidden="true" />
                  تشغيل الفحص الصامت
                </button>
              ) : choice === 'spotlight' ? (
                <button type="button" className="pf-btn pri" data-sn="send" disabled={blocked} data-hold={HOLD.snTestSpotlight} onClick={() => void send()}>
                  <Send aria-hidden="true" />
                  نشر السبوتلايت للعموم
                </button>
              ) : (
                <button type="button" className="pf-btn pri" data-sn="send" disabled={blocked} data-hold={HOLD.snTestStory} onClick={() => void send()}>
                  <Send aria-hidden="true" />
                  نشر القصة
                </button>
              )}
              <button type="button" className="pf-btn ghost" onClick={() => setOpen(false)}>
                إغلاق
              </button>
            </div>
          )}
          {problem && ready && !busy && (
            <p className="yt-sub warn" data-sn="problem">
              {problem}
            </p>
          )}
        </div>
      )}

      {phase.t === 'error' && (
        <div className="pf-note bad" role="alert" data-sn="error">
          <span>
            <Rich text={phase.text} />
          </span>
          {reconnectNeeded(phase.code) && (
            <button type="button" className="wk-btn sm" onClick={onReconnect}>
              <Ic i={Link2} />
              إعادة الربط
            </button>
          )}
        </div>
      )}
      {phase.t === 'checked' && (
        <div data-sn="check">
          <div className="pf-note ok yt-done" role="status">
            <span>
              <Rich text="قُرئ حساب Snapchat. لم يُنشر شيء ولم يُرفع ملف." />
            </span>
          </div>
          <div className="yt-list">
            <div className="yt-item" data-sn-row="profile">
              <span className="yt-item-text">
                <b>الملف العام</b>
                <small>
                  <bdi>{phase.check.profile.name || 'بلا اسم'}</bdi>
                  {phase.check.profile.username && (
                    <>
                      {' · '}
                      <bdi dir="ltr">@{phase.check.profile.username}</bdi>
                    </>
                  )}
                  {' · '}المشتركون: {fmt(phase.check.profile.subscribers)}
                </small>
              </span>
            </div>
            <div className="yt-item" data-sn-row="spotlights">
              <span className="yt-item-text">
                <b>السبوتلايت</b>
                <small>
                  {phase.check.spotlights
                    ? `المقروء: ${fmt(phase.check.spotlights.count)} · ظاهر: ${fmt(phase.check.spotlights.live)} · ينتظر: ${fmt(phase.check.spotlights.submitted)} · مرفوض: ${fmt(phase.check.spotlights.rejected)}`
                    : 'لم تعطِ Snap هذا الجزء.'}
                </small>
              </span>
            </div>
            <div className="yt-item" data-sn-row="stories">
              <span className="yt-item-text">
                <b>القصص</b>
                <small>{phase.check.stories ? `المقروء: ${fmt(phase.check.stories.count)}` : 'لم تعطِ Snap هذا الجزء.'}</small>
              </span>
            </div>
            <div className="yt-item" data-sn-row="stats">
              <span className="yt-item-text">
                <b>أرقام الحساب الإجمالية</b>
                <small>
                  {phase.check.stats
                    ? `المشاهدات ${fmt(phase.check.stats.views)} · المشاهدون ${fmt(phase.check.stats.viewers)} · المشاركات ${fmt(phase.check.stats.shares)} · لقطات الشاشة ${fmt(phase.check.stats.screenshots)} · المشتركون ${fmt(phase.check.stats.subscribers)}`
                    : 'لم تعطِ Snap هذا الجزء.'}
                </small>
                <small data-sn="stats-note">
                  <Rich text={SN_STATS_NOTE} />
                </small>
                {phase.check.note && (
                  <small data-sn="check-note">
                    <Rich text={phase.check.note} />
                  </small>
                )}
              </span>
            </div>
          </div>
        </div>
      )}
      {phase.t === 'silent' && (
        <div className={`pf-note ${phase.deleted ? 'ok' : 'bad'} yt-done`} role="status" data-sn="silent">
          {phase.deleted ? (
            <>
              <span>
                <Rich
                  text={`تم الفحص: أُنشئ سبوتلايت مجدول بعد ${SN_SILENT_DAYS} يوماً${phase.status ? `، وقُرئ من Snap وحالته «${phase.status}»` : ' وقُرئ من Snap'}، ثم حُذف قبل موعده.`}
                />
              </span>
              <span data-sn="silent-unproven">
                <Rich text="لا يثبت هذا الفحص أن Snap تخفي السبوتلايت المجدول عن الناس قبل موعده؛ ذلك لم يُجرَّب." />
              </span>
            </>
          ) : (
            <>
              <span>
                <Rich text={TEST_ERROR_AR.SN_SILENT_NOT_DELETED} />
              </span>
              {phase.at && <span>إن بقي نُشر {when(phase.at)}.</span>}
            </>
          )}
        </div>
      )}
      {phase.t === 'spotlight' && (
        <div className="pf-note ok yt-done" role="status" data-sn="done">
          <span>
            <Rich text={`نُشر السبوتلايت على الملف العام${phase.status ? `. حالته عند Snap: ${phase.status}` : ''}.`} />
          </span>
          <span>
            <Rich text="يمكن حذفه من القائمة أدناه، وقراءة أرقامه بعد نحو يوم." />
          </span>
        </div>
      )}
      {phase.t === 'story' && (
        <div className="pf-note ok yt-done" role="status" data-sn="done">
          <span>
            <Rich text={`نُشرت القصة. يراها متابعو الحساب${phase.endsAt ? ` حتى ${when(phase.endsAt)}` : ''} ثم تنتهي وحدها.`} />
          </span>
          <span>
            <Rich text={TEST_ERROR_AR.SN_NO_DELETE} />
          </span>
        </div>
      )}

      {mine.length > 0 && (
        <div className="yt-list" data-sn="list">
          <h5>آخر التجارب</h5>
          {mine.map((t) => (
            <div className="yt-item" key={t.id} data-test={t.id} data-state={t.state} data-kind={t.kind}>
              <span className="yt-item-text">
                <b>
                  <bdi>{t.title}</bdi>
                </b>
                <small>
                  {SN_KIND_AR[t.kind ?? ''] ? `${SN_KIND_AR[t.kind ?? '']} · ` : ''}
                  <Rich text={statusOf(t)} /> · {when(t.created_at)} · {w.nameOf(t.created_by)}
                </small>
                {numbers[t.id] && (
                  <>
                    <small data-sn="numbers">{numbersLine(numbers[t.id])}</small>
                    {numbers[t.id].late && (
                      <small data-sn="numbers-note">
                        <Rich text={SN_STATS_NOTE} />
                      </small>
                    )}
                  </>
                )}
                {notes[t.id] && (
                  <small data-sn="row-note">
                    <Rich text={notes[t.id]} />
                  </small>
                )}
              </span>
              {t.state === 'published' && t.kind !== 'snap_story' && (
                <span className="yt-item-acts">
                  {t.kind === 'snap_spotlight' && (
                    <button type="button" className="wk-btn sm quiet" data-sn="stats" disabled={reading === t.id} onClick={() => void readNumbersOf(t)}>
                      <Ic i={Eye} />
                      {reading === t.id ? 'جارٍ القراءة…' : 'قراءة الأرقام'}
                    </button>
                  )}
                  <button type="button" className="wk-btn sm quiet danger" data-sn="delete" data-hold={HOLD.snTestDelete} disabled={removing === t.id} onClick={() => void remove(t)}>
                    <Ic i={Trash2} />
                    {removing === t.id ? 'جارٍ الحذف…' : 'حذف'}
                  </button>
                </span>
              )}
            </div>
          ))}
          {mine.some((t) => t.kind === 'snap_story' && t.state === 'published') && (
            <small className="yt-sub" data-sn="story-note">
              <Rich text={TEST_ERROR_AR.SN_NO_DELETE} />
            </small>
          )}
        </div>
      )}

      {picking && (
        <LibraryPicker
          have={[]}
          only="video"
          note="تظهر الملفات التي تملك الوصول إلى مجلداتها فقط. يقرأ الخادم الفيديو من المكتبة مباشرة، فلا يمر عبر متصفحك."
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

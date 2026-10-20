'use client';
// The review screen's player for a video or sound file (MVP_draft.md 62.13). Space and K play and pause, J and
// L move a second, the arrows a frame (its length measured from the frames shown, 1/30 until known), Shift+G
// shows the Reels safe zones, N writes a note at the current frame bound to the version shown, and a drag on
// the paused picture marks an area for it. Notes are marks under the player, for this version or every
// version; a chosen note shows its area; notes are answered and closed («تم») through the database functions.
// «مقارنة بالإصدار السابق» plays an earlier version beside this one or under a wipe, both on one clock. A, held
// as long as a long press, presses this file's «اعتماد هذا الجزء» (hold.ts `keyHoldStart`): nothing where that
// button is off. The keys act on the player last used. No studio code: the safe zones are the template tab's.
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Check, Columns2, Eye, MessageSquarePlus, Reply, ScanLine, SquareDashed, X } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { drawSafeZones } from '@/lib/motion/preview.js';
import { keyHoldEnd, keyHoldStart } from '@/lib/kit/hold';
import { addNote, areaOf, noteMs, noteTime, setNoteDone, type Note, type NoteArea } from '@/lib/media/notes';
import { typingTarget } from '@/lib/studio/shortcuts';
import { contentBox, frameLength, isReels, markAt, matchReviewKey, pictureFraction, playerTime, reviewKeyLabel } from '@/lib/work/review-keys';

type VideoWithFrames = HTMLVideoElement & { requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number; cancelVideoFrameCallback?: (h: number) => void };

export type PlayerStart = { t: number; v: number | null };

const rpc = (fn: string, args: Record<string, unknown>) => supabase().rpc(fn, args);

export function ReviewPlayer({
  assetId, version, name, kind, notes, canNote, nameOf, onNotesChanged, active, onActivate, start, partKey,
}: {
  assetId: string;
  /** The version under review (the file's current one). */
  version: number;
  name: string;
  kind: 'video' | 'audio';
  /** Every note on this file, every version, answers included. */
  notes: Note[];
  canNote: boolean;
  nameOf: (email: string | null | undefined) => string;
  onNotesChanged: () => Promise<void> | void;
  /** The keys act on this player. */
  active: boolean;
  onActivate: () => void;
  /** Open at this moment (`?t=&v=`). */
  start?: PlayerStart | null;
  /** The part key of this file («a:<id>»): A presses that part's «اعتماد هذا الجزء». */
  partKey: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const video = useRef<VideoWithFrames>(null);
  const prevVideo = useRef<HTMLVideoElement>(null);
  const over = useRef<HTMLCanvasElement>(null);
  const [t, setT] = useState(start?.t ?? 0);
  const [dur, setDur] = useState(0);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [box, setBox] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [measured, setMeasured] = useState<number | null>(null);
  const [safe, setSafe] = useState(false);
  const [scope, setScope] = useState<'this' | 'all'>('this');
  const [chosen, setChosen] = useState<string | null>(null);
  const [composing, setComposing] = useState<{ ms: number } | null>(null);
  const [body, setBody] = useState('');
  const [area, setArea] = useState<NoteArea | null>(null);
  const drag = useRef<{ a: { x: number; y: number } } | null>(null);
  const [dragNow, setDragNow] = useState<NoteArea | null>(null);
  const [answering, setAnswering] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [compare, setCompare] = useState<'off' | 'side' | 'wipe'>(start?.v && start.v < version ? 'side' : 'off');
  const [against, setAgainst] = useState(start?.v && start.v < version ? start.v : Math.max(1, version - 1));
  const [wipe, setWipe] = useState(50);
  const [say, setSay] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const picture = kind === 'video';

  // ---------------------------------------------------------------- the clock and the picture's place
  const fit = useCallback(() => {
    const v = video.current;
    const s = stage.current;
    if (!v || !s) return;
    setBox(contentBox(v.clientWidth, v.clientHeight, v.videoWidth, v.videoHeight));
  }, []);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const onMeta = () => {
      setDur(Number.isFinite(v.duration) ? v.duration : 0);
      setDims({ w: v.videoWidth, h: v.videoHeight });
      fit();
      if (start && start.t > 0) v.currentTime = Math.min(start.t, v.duration || start.t);
    };
    const onTime = () => setT(v.currentTime);
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('seeked', onTime);
    if (v.readyState >= 1) onMeta();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(v);
    return () => {
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('seeked', onTime);
      ro?.disconnect();
    };
  }, [fit]); // eslint-disable-line react-hooks/exhaustive-deps

  // a frame's length, from the media times of frames as they are shown
  useEffect(() => {
    const v = video.current;
    if (!v?.requestVideoFrameCallback) return;
    let last: number | null = null;
    let best: number | null = null;
    let h = 0;
    let live = true;
    const tick = (_now: number, meta: { mediaTime: number }) => {
      if (!live) return;
      if (last !== null) {
        const d = meta.mediaTime - last;
        if (d > 0.004 && d < 0.2 && (best === null || d < best - 0.0005)) {
          best = d;
          setMeasured(d);
        }
      }
      last = meta.mediaTime;
      h = v.requestVideoFrameCallback!(tick);
    };
    h = v.requestVideoFrameCallback(tick);
    return () => {
      live = false;
      v.cancelVideoFrameCallback?.(h);
    };
  }, []);

  // the earlier version follows this one's clock
  useEffect(() => {
    const v = video.current;
    const p = prevVideo.current;
    if (!v || !p || compare === 'off') return;
    const follow = () => {
      if (Math.abs(p.currentTime - v.currentTime) > 0.05) p.currentTime = Math.min(v.currentTime, p.duration || v.currentTime);
    };
    const play = () => void p.play().catch(() => {});
    const pause = () => {
      p.pause();
      follow();
    };
    const rate = () => (p.playbackRate = v.playbackRate);
    v.addEventListener('play', play);
    v.addEventListener('pause', pause);
    v.addEventListener('seeked', follow);
    v.addEventListener('timeupdate', follow);
    v.addEventListener('ratechange', rate);
    p.addEventListener('loadedmetadata', follow);
    follow();
    if (!v.paused) play();
    return () => {
      v.removeEventListener('play', play);
      v.removeEventListener('pause', pause);
      v.removeEventListener('seeked', follow);
      v.removeEventListener('timeupdate', follow);
      v.removeEventListener('ratechange', rate);
      p.removeEventListener('loadedmetadata', follow);
    };
  }, [compare, against]);

  // ---------------------------------------------------------------- notes
  const top = useMemo(() => notes.filter((n) => !n.parent_id), [notes]);
  const shown = useMemo(() => top.filter((n) => scope === 'all' || n.version === version), [top, scope, version]);
  const chosenNote = top.find((n) => n.id === chosen) ?? null;

  // the overlay: safe zones, the chosen note's area, the area being marked
  useEffect(() => {
    const c = over.current;
    if (!c || !picture) return;
    const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
    c.width = Math.max(1, Math.round(box.w * dpr));
    c.height = Math.max(1, Math.round(box.h * dpr));
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    if (safe && isReels(dims.w, dims.h)) drawSafeZones(ctx, { width: c.width, ratio: '9:16' });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const rect = (a: NoteArea, colour: string, dash: number[]) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = 2.5;
      ctx.setLineDash(dash);
      ctx.strokeRect(a.x * box.w, a.y * box.h, a.w * box.w, a.h * box.h);
      ctx.fillStyle = `${colour}22`;
      ctx.fillRect(a.x * box.w, a.y * box.h, a.w * box.w, a.h * box.h);
    };
    const live = dragNow ?? (composing ? area : null);
    if (live) rect(live, '#ffd166', [8, 6]);
    else if (chosenNote?.area) rect(chosenNote.area, '#ff5a6e', []);
  }, [box, safe, dims, chosenNote, area, dragNow, composing, picture]);

  const seek = (sec: number) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(sec, v.duration || sec));
    setT(v.currentTime);
  };
  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  };
  const frame = (dir: 1 | -1) => {
    const v = video.current;
    if (!v) return;
    v.pause();
    seek(v.currentTime + dir * frameLength(measured));
  };
  const openNote = () => {
    if (!canNote) return setSay('الملاحظات هنا لمن يراجع هذا العمل.');
    const v = video.current;
    v?.pause();
    setComposing({ ms: Math.round((v?.currentTime ?? t) * 1000) });
    setArea(null);
    setChosen(null);
    setSay(null);
    setTimeout(() => root.current?.querySelector<HTMLInputElement>('.wk-rp-compose input')?.focus(), 0);
  };
  const saveNote = async () => {
    if (!composing || !body.trim()) return;
    const r = await addNote(rpc, { asset: assetId, body: body.trim(), atMs: composing.ms, version, area: picture ? area : null });
    if ('error' in r) return setError(r.error);
    setError(null);
    setComposing(null);
    setBody('');
    setArea(null);
    setChosen(r.id);
    await onNotesChanged();
  };
  const reply = async (n: Note) => {
    const r = await addNote(rpc, { asset: assetId, body: answer.trim(), parent: n.id });
    if ('error' in r) return setError(r.error);
    setError(null);
    setAnswer('');
    setAnswering(null);
    await onNotesChanged();
  };
  const done = async (n: Note) => {
    setError(await setNoteDone(rpc, n.id, !n.done_at));
    await onNotesChanged();
  };
  const pick = (n: Note) => {
    setChosen(n.id);
    const ms = noteMs(n);
    if (ms !== null) {
      video.current?.pause();
      seek(ms / 1000);
    }
  };

  // ---------------------------------------------------------------- marking an area on the paused picture
  const at = (e: RPointerEvent) => {
    const r = over.current!.getBoundingClientRect();
    return pictureFraction(e.clientX - r.left, e.clientY - r.top, { x: 0, y: 0, w: r.width, h: r.height });
  };
  const down = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!composing || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { a: at(e) };
  };
  const move = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (drag.current) setDragNow(areaOf(drag.current.a, at(e)));
  };
  const up = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!drag.current) return;
    const a = areaOf(drag.current.a, at(e));
    drag.current = null;
    setDragNow(null);
    setArea(a);
  };

  // ---------------------------------------------------------------- keys
  const keys = useRef({ toggle, frame, seek, openNote, safe: () => setSafe((x) => !x), composing: false, t: 0 });
  keys.current = { toggle, frame, seek, openNote, safe: () => setSafe((x) => !x), composing: !!composing, t };
  useEffect(() => {
    if (!active) return;
    let holding = false;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (typingTarget(target) || target?.closest?.('dialog')) return;
      const id = matchReviewKey(e);
      if (!id) return;
      if (id === 'play' && e.code === 'Space' && target?.closest?.('button,a,summary,[role="button"]') && !target.closest('.wk-rp')) return;
      const k = keys.current;
      switch (id) {
        case 'play': k.toggle(); break;
        case 'back': k.seek((video.current?.currentTime ?? 0) - 1); break;
        case 'forward': k.seek((video.current?.currentTime ?? 0) + 1); break;
        case 'frame-back': k.frame(-1); break;
        case 'frame-forward': k.frame(1); break;
        case 'safe': k.safe(); break;
        case 'note': k.openNote(); break;
        case 'approve': {
          if (e.repeat) break;
          const b = document.querySelector<HTMLButtonElement>(`[data-approve-part="${CSS.escape(partKey)}"]`);
          if (keyHoldStart(b)) holding = true;
          else setSay('اعتماد هذا الملف غير متاح لك هنا الآن.');
          break;
        }
        default:
          return;
      }
      e.preventDefault();
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyA' && holding) {
        holding = false;
        keyHoldEnd();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onUp);
    };
  }, [active, partKey]);

  const reels = picture && isReels(dims.w, dims.h);
  const src = (v: number) => `/api/media/${assetId}/content?v=${v}`;
  const answersOf = (n: Note) => notes.filter((x) => x.parent_id === n.id);
  const late = start?.v && start.v !== version ? start.v : null;

  return (
    <div className="wk-rp" ref={root} data-active={active ? 'yes' : 'no'} onPointerDownCapture={onActivate} onFocusCapture={onActivate}>
      {late && (
        <p className="wk-rp-hint" role="note">
          الرابط يشير إلى الإصدار {late} عند {playerTime(start!.t)}؛ المعروض للمراجعة الإصدار {version}{late < version ? '، والإصدار المطلوب بجانبه للمقارنة' : ''}.
        </p>
      )}
      <div className="wk-rp-views" data-compare={compare}>
        {compare !== 'off' && (
          <div className="wk-rp-stage wk-rp-prev" style={compare === 'wipe' ? { clipPath: `inset(0 ${100 - wipe}% 0 0)` } : undefined}>
            <video ref={prevVideo} muted preload="metadata" playsInline src={src(against)} aria-label={`الإصدار ${against}`} />
            <span className="wk-rp-tag">الإصدار {against}</span>
          </div>
        )}
        <div className="wk-rp-stage" ref={stage}>
          <video ref={video} controls preload="metadata" playsInline src={src(version)} aria-label={`${name}، الإصدار ${version}`} />
          {picture && (
            <canvas
              ref={over}
              className="wk-rp-over"
              data-marking={composing ? 'yes' : 'no'}
              style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              aria-hidden="true"
            />
          )}
          {compare !== 'off' && <span className="wk-rp-tag">الإصدار {version}</span>}
        </div>
      </div>
      {compare === 'wipe' && (
        <label className="wk-rp-wipe">
          موضع الفاصل
          <input type="range" min={0} max={100} value={wipe} onChange={(e) => setWipe(Number(e.target.value))} />
        </label>
      )}

      <div className="wk-rp-bar">
        <output className="wk-rp-time" dir="ltr" aria-label="الوقت الحالي">
          {playerTime(t)} / {playerTime(dur)}
        </output>
        {picture && (
          <button type="button" className="wk-btn sm quiet" aria-pressed={safe} disabled={!reels} onClick={() => setSafe(!safe)} title={reels ? `مناطق Reels الآمنة (${reviewKeyLabel('safe')})` : 'للفيديو العمودي 9:16 فقط'}>
            <ScanLine aria-hidden="true" />
            المناطق الآمنة
          </button>
        )}
        {version > 1 && (
          <div className="wk-seg wk-rp-cmp" role="group" aria-label="مقارنة بالإصدار السابق">
            <button type="button" aria-pressed={compare === 'off'} onClick={() => setCompare('off')}>دون مقارنة</button>
            <button type="button" aria-pressed={compare === 'side'} onClick={() => setCompare('side')}>
              <Columns2 aria-hidden="true" />
              جنباً إلى جنب
            </button>
            <button type="button" aria-pressed={compare === 'wipe'} onClick={() => setCompare('wipe')}>
              <SquareDashed aria-hidden="true" />
              بالفاصل
            </button>
          </div>
        )}
        {version > 2 && compare !== 'off' && (
          <select className="wk-sel" value={against} onChange={(e) => setAgainst(Number(e.target.value))} aria-label="الإصدار المقارن">
            {Array.from({ length: version - 1 }, (_, i) => version - 1 - i).map((n) => (
              <option key={n} value={n}>الإصدار {n}</option>
            ))}
          </select>
        )}
        <button type="button" className="wk-btn sm" disabled={!canNote} onClick={openNote} title={`ملاحظة عند هذا الإطار (${reviewKeyLabel('note')})`}>
          <MessageSquarePlus aria-hidden="true" />
          ملاحظة هنا
        </button>
      </div>

      <div className="wk-rp-marks" role="group" aria-label="الملاحظات على مدة الملف">
        {dur > 0 &&
          shown
            .filter((n) => noteMs(n) !== null)
            .map((n) => (
              <button
                key={n.id}
                type="button"
                className="wk-rp-mark"
                data-open={n.done_at ? 'no' : 'yes'}
                data-on={chosen === n.id ? 'yes' : 'no'}
                style={{ left: `${markAt(noteMs(n)!, dur)}%` }}
                title={`${noteTime(noteMs(n)!)} · ${n.body}`}
                aria-label={`ملاحظة عند ${noteTime(noteMs(n)!)}`}
                onClick={() => pick(n)}
              />
            ))}
        <i className="wk-rp-head" style={{ left: `${dur ? (t / dur) * 100 : 0}%` }} aria-hidden="true" />
      </div>

      {composing && (
        <form
          className="wk-rp-compose"
          onSubmit={(e) => {
            e.preventDefault();
            void saveNote();
          }}
        >
          <span className="wk-tcb">{noteTime(composing.ms)}</span>
          <input className="wk-inp" value={body} maxLength={500} dir="auto" placeholder="ملاحظة عند هذا الإطار" aria-label="الملاحظة" onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setComposing(null)} />
          <button type="submit" className="wk-btn sm primary" disabled={!body.trim()}>
            <Check aria-hidden="true" />
            حفظ
          </button>
          <button type="button" className="wk-btn sm quiet" onClick={() => (setComposing(null), setArea(null))}>
            <X aria-hidden="true" />
            إلغاء
          </button>
          <small className="wk-why">
            {picture ? (area ? 'حُددت منطقة على الصورة. اسحب من جديد لتغييرها.' : 'اسحب على الصورة لتحديد منطقة (اختياري).') : ''} تُحفظ على الإصدار {version}.
          </small>
        </form>
      )}
      {say && <p className="wk-why" role="status">{say}</p>}
      {error && <p className="wk-err" role="alert">{error}</p>}

      <div className="wk-rp-notes">
        <div className="wk-rp-nhead">
          <b>ملاحظات المراجعة</b>
          <div className="wk-seg" role="group" aria-label="أي الملاحظات">
            <button type="button" aria-pressed={scope === 'this'} onClick={() => setScope('this')}>
              هذا الإصدار <span className="n">{top.filter((n) => n.version === version).length}</span>
            </button>
            <button type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>
              كل الإصدارات <span className="n">{top.length}</span>
            </button>
          </div>
        </div>
        {!shown.length && <small className="wk-why">لا ملاحظات {scope === 'this' ? 'على هذا الإصدار ' : ''}بعد. {canNote ? `${reviewKeyLabel('note')} يكتب ملاحظة عند الإطار المعروض.` : ''}</small>}
        <ul className="wk-rp-list">
          {shown.map((n) => {
            const ms = noteMs(n);
            return (
              <li key={n.id} data-open={n.done_at ? 'no' : 'yes'} data-on={chosen === n.id ? 'yes' : 'no'}>
                <div className="wk-rp-nrow">
                  {ms !== null ? (
                    <button type="button" className="wk-tcb" onClick={() => pick(n)} aria-label={`انتقل إلى ${noteTime(ms)}`}>
                      {noteTime(ms)}
                    </button>
                  ) : (
                    <span className="wk-chip plain">عام</span>
                  )}
                  <span dir="auto">
                    <b>{nameOf(n.author)}</b> · {n.body}
                  </span>
                  {n.area && (
                    <button type="button" className="wk-chip info" onClick={() => pick(n)} title="عرض المنطقة على الصورة">
                      <Eye aria-hidden="true" />
                      منطقة
                    </button>
                  )}
                  {scope === 'all' && <span className="wk-chip plain">{n.version ? `الإصدار ${n.version}` : 'دون إصدار'}</span>}
                </div>
                {n.done_at && <small className="wk-why">تمت · {nameOf(n.done_by)}</small>}
                {answersOf(n).map((a) => (
                  <div className="wk-rp-answer" key={a.id}>
                    <Reply aria-hidden="true" />
                    <span dir="auto">
                      <b>{nameOf(a.author)}</b> · {a.body}
                    </span>
                  </div>
                ))}
                <div className="wk-rp-nacts">
                  <button type="button" className="wk-lk" onClick={() => (setAnswering(answering === n.id ? null : n.id), setAnswer(''))}>
                    رد
                  </button>
                  <button type="button" className="wk-lk" onClick={() => void done(n)}>
                    {n.done_at ? 'فتحها من جديد' : 'تم'}
                  </button>
                </div>
                {answering === n.id && (
                  <form
                    className="wk-rp-answerform"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (answer.trim()) void reply(n);
                    }}
                  >
                    <input className="wk-inp" value={answer} maxLength={500} dir="auto" aria-label="الرد" placeholder="اكتب ردك" onChange={(e) => setAnswer(e.target.value)} autoFocus />
                    <button type="submit" className="wk-btn sm" disabled={!answer.trim()}>إرسال</button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
        <Link className="wk-lk" href={`/media/${assetId}`}>
          صفحة الملف في المكتبة
        </Link>
      </div>
    </div>
  );
}

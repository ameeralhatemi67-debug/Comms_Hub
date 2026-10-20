'use client';

// «تسجيل صوت» (MVP_draft.md 62.9): a voice-over recorded from the microphone after a three-second count.
// The preview plays without sound while recording, so the person sees what they speak over and the
// microphone does not hear the project. The recording is a file on this device until it is uploaded
// to the library, like any file from «هذا الجهاز». The browser asks for the microphone itself.
import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { shortTime } from '@/lib/studio/time';
import type { Micros } from '@/lib/studio/schema';
import { Modal } from '../ui';

/** A recording format this browser makes: Opus in WebM where it can, else AAC in MP4. */
export function recordingType(): { mime: string; ext: string } {
  const can = (t: string) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(t);
  if (can('audio/webm;codecs=opus')) return { mime: 'audio/webm;codecs=opus', ext: 'webm' };
  if (can('audio/mp4')) return { mime: 'audio/mp4', ext: 'm4a' };
  return { mime: '', ext: 'webm' };
}

/** A recording's file name: «تسجيل صوت 2026-10-20 14-30-05.webm». */
export function recordingName(ext: string, d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `تسجيل صوت ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}.${ext}`;
}

type Phase = { kind: 'ready' } | { kind: 'count'; n: number } | { kind: 'rec' } | { kind: 'saving' } | { kind: 'error'; message: string };

export function RecordDialog({ at, onClose, onDone, onRun }: {
  /** Where on the timeline the recording starts. */
  at: Micros;
  onClose: () => void;
  onDone: (file: File, at: Micros) => void | Promise<void>;
  /** The preview plays without sound while recording (true), and stops after (false). */
  onRun: (on: boolean) => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'ready' });
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const live = useRef<{ stream?: MediaStream; rec?: MediaRecorder; ctx?: AudioContext; raf?: number; timers: number[]; started?: number }>({ timers: [] });

  const cleanup = () => {
    const l = live.current;
    l.timers.forEach((t) => clearTimeout(t));
    l.timers = [];
    if (l.raf) cancelAnimationFrame(l.raf);
    l.stream?.getTracks().forEach((t) => t.stop());
    void l.ctx?.close().catch(() => undefined);
    live.current = { timers: [] };
  };
  useEffect(
    () => () => {
      if (live.current.rec && live.current.rec.state !== 'inactive') live.current.rec.stop();
      cleanup();
      onRun(false);
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const start = async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      return setPhase({ kind: 'error', message: 'لم يُسمح باستعمال الميكروفون، أو لا ميكروفون في هذا الجهاز. اسمح به من إعدادات المتصفح ثم أعد المحاولة.' });
    }
    live.current.stream = stream;
    // a level meter, so the person sees the microphone hears them
    try {
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Float32Array(an.fftSize);
      const tick = () => {
        an.getFloatTimeDomainData(buf);
        let s = 0;
        for (const v of buf) s += v * v;
        setLevel(Math.min(1, Math.sqrt(s / buf.length) * 4));
        live.current.raf = requestAnimationFrame(tick);
      };
      live.current.ctx = ctx;
      tick();
    } catch {
      // the meter is a convenience
    }
    for (const n of [3, 2, 1]) live.current.timers.push(window.setTimeout(() => setPhase({ kind: 'count', n }), (3 - n) * 1000));
    setPhase({ kind: 'count', n: 3 });
    live.current.timers.push(
      window.setTimeout(() => {
        const type = recordingType();
        const rec = new MediaRecorder(stream, type.mime ? { mimeType: type.mime } : undefined);
        const chunks: Blob[] = [];
        rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        rec.onstop = async () => {
          onRun(false);
          const blob = new Blob(chunks, { type: (rec.mimeType || type.mime || 'audio/webm').split(';')[0] });
          cleanup();
          if (!blob.size) return setPhase({ kind: 'error', message: 'لم يُسجَّل صوت. أعد المحاولة.' });
          setPhase({ kind: 'saving' });
          await onDone(new File([blob], recordingName(type.ext), { type: blob.type }), at);
          onClose();
        };
        live.current.rec = rec;
        live.current.started = performance.now();
        rec.start(250);
        onRun(true);
        setPhase({ kind: 'rec' });
        const clock = () => {
          if (live.current.rec?.state === 'recording') {
            setElapsed(Math.round((performance.now() - (live.current.started ?? 0)) * 1000));
            live.current.timers.push(window.setTimeout(clock, 200));
          }
        };
        clock();
      }, 3000),
    );
  };

  const stop = () => live.current.rec?.state === 'recording' && live.current.rec.stop();

  return (
    <Modal title="تسجيل صوت" onClose={() => (phase.kind === 'rec' ? stop() : onClose())}>
      <div className="st-form st-rec" data-phase={phase.kind}>
        <p>يبدأ التسجيل عند {shortTime(at)} بعد عدّ ثلاث ثوانٍ، وتُشغَّل المعاينة بلا صوت لترى ما تتحدث عنه. يُحفظ التسجيل على هذا الجهاز حتى ترفعه إلى المكتبة.</p>
        <div className="st-rec-meter" aria-hidden="true">
          <i style={{ width: `${Math.round(level * 100)}%` }} />
        </div>
        {phase.kind === 'count' && <p className="st-rec-count" role="status">{phase.n}</p>}
        {phase.kind === 'rec' && (
          <p className="st-rec-live" role="status">
            <Mic aria-hidden="true" /> يُسجَّل الآن · <bdi dir="ltr">{shortTime(elapsed)}</bdi>
          </p>
        )}
        {phase.kind === 'saving' && <p role="status">جارٍ حفظ التسجيل…</p>}
        {phase.kind === 'error' && <p className="warning" role="alert">{phase.message}</p>}
        <div className="actions">
          {phase.kind === 'rec' ? (
            <button type="button" className="primary" onClick={stop}>
              <Square aria-hidden="true" />
              إيقاف وحفظ
            </button>
          ) : (
            <button type="button" className="primary" onClick={() => void start()} disabled={phase.kind === 'count' || phase.kind === 'saving'}>
              <Mic aria-hidden="true" />
              ابدأ التسجيل
            </button>
          )}
          <button type="button" onClick={onClose} disabled={phase.kind === 'rec' || phase.kind === 'saving'}>
            إلغاء
          </button>
        </div>
      </div>
    </Modal>
  );
}

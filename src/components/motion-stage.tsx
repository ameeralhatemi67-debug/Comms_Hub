'use client';

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { Pause, Play, Repeat, RotateCcw } from 'lucide-react';
import { renderFrame, timingOf } from '@/lib/motion/renderers.js';
import { drawBackdrop, drawFootage, drawSafeZones } from '@/lib/motion/preview.js';
import type { Graphic, Params } from '@/lib/motion/types';

export type Backdrop = 'scene' | 'alpha' | 'dark' | 'light';
export type WinMode = 'sample' | 'video' | 'green' | 'alpha';

/* The moment at which a design reads as "finished", used for thumbnails and the still image. */
export function settledTime(g: Graphic, p: Params) {
  if (g.category === 'numbers') return 3.4;
  return Math.max(.3, p.tIn) + .5;
}
export function sizeFor(dims: { w: number; h: number }, area: number) {
  const w = Math.round(Math.sqrt(area * dims.w / dims.h));
  return { w, h: Math.round(w * dims.h / dims.w) };
}

/* One paint of a design into a canvas, including whatever sits behind it in the preview. Never used by exports. */
export function paint(canvas: HTMLCanvasElement, g: Graphic, p: Params, t: number, o: { area: number; backdrop: Backdrop; win: WinMode; video?: HTMLVideoElement | null; safe?: boolean; key: string }) {
  const dims = g.dims?.(p) || { w: 1280, h: 720 }, size = sizeFor(dims, o.area);
  if (canvas.width !== size.w || canvas.height !== size.h) { canvas.width = size.w; canvas.height = size.h; }
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  const scale = size.w / dims.w;
  renderFrame(g, p, t, ctx, scale, null);
  if (g.category === 'frames' && g.winBox) {
    drawFootage(ctx, { width: size.w, height: size.h, scale, win: g.winBox(p), mode: o.win, video: o.video, key: o.key, time: t });
    if (o.safe) drawSafeZones(ctx, { width: size.w, ratio: p.ratio });
  } else drawBackdrop(ctx, { width: size.w, height: size.h, mode: o.backdrop, time: t });
}

const fmt = (v: number) => v.toFixed(1);
function phases(g: Graphic, p: Params) {
  if (g.category === 'numbers') return { parts: [3.1, p.hold, .7], names: ['العدّ', 'الثبات', 'الخروج'] };
  return { parts: [Math.max(.2, p.tIn), Math.max(0, p.tHold), Math.max(0, p.tOut)], names: ['الدخول', 'العرض', 'الخروج'] };
}

export function Stage({ g, p, backdrop, win, video, safe, keyColor, token, busy, time }: {
  g: Graphic; p: Params; backdrop: Backdrop; win: WinMode; video: HTMLVideoElement | null; safe: boolean; keyColor: string; token: number; busy: boolean; time: MutableRefObject<number>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null), scrub = useRef<HTMLInputElement>(null), clock = useRef<HTMLOutputElement>(null);
  const [playing, setPlaying] = useState(false), [loop, setLoop] = useState(true);
  const [reduced, setReduced] = useState(false);
  const rendered = reduced ? { ...p, mIdle: 0, particles: false } : p;
  const total = timingOf(g, rendered).total;
  const dims = g.dims?.(p) || { w: 1280, h: 720 };
  const latest = useRef({ g, p: rendered, backdrop, win, video, safe, keyColor, total });
  latest.current = { g, p: rendered, backdrop, win, video, safe, keyColor, total };

  const paintNow = useCallback(() => {
    const L = latest.current, el = canvas.current; if (!el) return;
    const t = Math.min(time.current, L.total);
    paint(el, L.g, L.p, t, { area: L.g.category === 'frames' ? 600000 : 700000, backdrop: L.backdrop, win: L.win, video: L.video, safe: L.safe, key: L.keyColor });
    if (scrub.current) { scrub.current.value = String(t); scrub.current.style.setProperty('--fill', `${L.total ? t / L.total * 100 : 0}%`); }
    if (clock.current) clock.current.textContent = `${fmt(t / L.p.speed)} / ${fmt(L.total / L.p.speed)} ث`;
  }, [time]);
  const seekVideo = useCallback((t: number) => {
    const v = latest.current.video; if (!v || !v.duration || !Number.isFinite(v.duration)) return;
    try { v.currentTime = Math.max(0, t - Math.max(.3, latest.current.p.tIn)) % v.duration; } catch { /* not seekable yet */ }
  }, []);

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(media.matches);
    const change = () => { setReduced(media.matches); if (media.matches) setPlaying(false); };
    media.addEventListener('change', change); return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => { paintNow(); }, [g, p, reduced, backdrop, win, safe, video, keyColor, total, paintNow]);
  useEffect(() => {                                    // a new selection, or an explicit restart, plays from the start
    time.current = 0; seekVideo(0); setPlaying(!matchMedia('(prefers-reduced-motion: reduce)').matches); paintNow();
  }, [token, g.id, time, seekVideo, paintNow]);
  useEffect(() => { if (busy) setPlaying(false); }, [busy]);
  useEffect(() => {
    if (!video) return;
    const redraw = () => paintNow();
    video.addEventListener('seeked', redraw); video.addEventListener('loadeddata', redraw);
    if (playing) video.play().catch(() => { /* autoplay refused: the first frame still shows */ }); else video.pause();
    return () => { video.removeEventListener('seeked', redraw); video.removeEventListener('loadeddata', redraw); };
  }, [video, playing, paintNow]);
  useEffect(() => {
    if (!playing || busy) return;
    let raf = 0, previous = performance.now();
    const tick = (now: number) => {
      const L = latest.current;
      if (!document.hidden) time.current += Math.min(now - previous, 100) / 1000 * L.p.speed;
      previous = now;
      if (time.current >= L.total) {
        if (!loop) { time.current = L.total; setPlaying(false); paintNow(); return; }
        if (time.current >= L.total + .6 * L.p.speed) { time.current = 0; seekVideo(0); }
      }
      paintNow(); raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [playing, busy, loop, time, paintNow, seekVideo]);

  const toggle = () => { if (busy) return; if (!playing && time.current >= latest.current.total) { time.current = 0; seekVideo(0); } setPlaying(!playing); };
  const replay = () => { if (busy) return; time.current = 0; seekVideo(0); setPlaying(true); paintNow(); };
  const ph = phases(g, rendered), sum = ph.parts.reduce((a, b) => a + b, 0) || 1;
  const ar = dims.w / dims.h;

  return <div className="ms-stage-wrap">
    <div className={`ms-stage ${win === 'alpha' && g.category === 'frames' || backdrop === 'alpha' && g.category !== 'frames' ? 'checker' : ''}`}>
      <div className="ms-canvas-box" style={{ ['--ar' as string]: ar }} role="button" tabIndex={0} aria-label={playing ? 'إيقاف المعاينة مؤقتاً' : 'تشغيل المعاينة'}
        onClick={toggle} onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } }}>
        <canvas ref={canvas} role="img" aria-label={`معاينة ${g.name}`} />
        {!playing && !busy && !(g.category === 'frames' && win === 'sample') && <span className="ms-playhint" aria-hidden="true"><Play /></span>}
      </div>
    </div>
    <div className="ms-transport" dir="ltr">
      <button type="button" className="ms-play" disabled={busy} aria-label={playing ? 'إيقاف المعاينة مؤقتاً' : 'تشغيل المعاينة'} onClick={toggle}>{playing ? <Pause /> : <Play />}</button>
      <button type="button" className="ms-icon" disabled={busy} aria-label="إعادة التشغيل من البداية" title="إعادة التشغيل من البداية" onClick={replay}><RotateCcw /></button>
      <div className="ms-track">
        <input ref={scrub} className="ms-scrub" type="range" min="0" max={total} step="0.01" defaultValue={0} disabled={busy} aria-label="موضع المعاينة"
          onChange={e => { setPlaying(false); time.current = Number(e.target.value); seekVideo(time.current); paintNow(); }} />
        <div className="ms-phases" aria-label="مراحل التصميم">
          {ph.parts.map((part, i) => <span key={i} className={`ph${i}`} style={{ flexGrow: Math.max(part, .001) / sum * 100, flexBasis: 0 }} title={`${ph.names[i]}: ${fmt(part / rendered.speed)} ث`}><b>{ph.names[i]}</b><bdi dir="ltr">{fmt(part / rendered.speed)} ث</bdi></span>)}
        </div>
      </div>
      <output ref={clock} className="ms-clock" aria-live="off" />
      <button type="button" className="ms-icon" aria-pressed={loop} aria-label="تكرار المعاينة" title="تكرار المعاينة" onClick={() => setLoop(!loop)}><Repeat /></button>
    </div>
  </div>;
}

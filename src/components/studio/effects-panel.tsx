'use client';

// «الانتقالات والحركات» (MVP_draft.md 62.3): the transitions between clips and the entry and exit
// movements, each with a small moving picture drawn by the same maths the preview and the export use
// (transitions.ts). A tile is dragged onto a clip in the timeline (near its start or its end), or
// applied to the selected clip with its buttons; the default length is set here.
import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { ANIMATIONS, TRANSITIONS, animFx, transitionFx, type AnimKind, type Fx, type TransitionKind } from '@/lib/studio/transitions';
import { US } from '@/lib/studio/schema';
import { Slider } from '../motion-controls';

export const EFFECT_MIME = 'application/x-studio-effect';
export type EffectDrop = { type: 'transition'; kind: TransitionKind } | { type: 'anim'; kind: AnimKind };

const TW = 112;
const TH = 64;

function paint(ctx: CanvasRenderingContext2D, color: string, label: string, fx: Fx, w: number, h: number, inset = 0) {
  if (fx.alpha <= 0.001) return;
  ctx.save();
  if (fx.clip) {
    ctx.beginPath();
    if (fx.clip.kind === 'rect') ctx.rect(fx.clip.x, fx.clip.y, fx.clip.w, fx.clip.h);
    else ctx.arc(fx.clip.cx, fx.clip.cy, fx.clip.r, 0, Math.PI * 2);
    ctx.clip();
  }
  ctx.globalAlpha = Math.min(1, fx.alpha);
  ctx.translate(w / 2 + fx.dx, h / 2 + fx.dy);
  if (fx.rotate) ctx.rotate((fx.rotate * Math.PI) / 180);
  ctx.scale(fx.scale, fx.scale);
  const bw = w - inset * 2;
  const bh = h - inset * 2;
  if (fx.local) {
    const f = fx.local.f;
    ctx.beginPath();
    if (fx.local.from === 'right') ctx.rect(bw / 2 - bw * f, -bh / 2, bw * f, bh);
    else if (fx.local.from === 'left') ctx.rect(-bw / 2, -bh / 2, bw * f, bh);
    else if (fx.local.from === 'bottom') ctx.rect(-bw / 2, bh / 2 - bh * f, bw, bh * f);
    else ctx.rect(-bw / 2, -bh / 2, bw, bh * f);
    ctx.clip();
  }
  if (fx.blur > 0.1) ctx.filter = `blur(${(fx.blur / 12).toFixed(1)}px)`;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-bw / 2, -bh / 2, bw, bh, inset ? 6 : 0);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.92)';
  ctx.font = `600 ${Math.round(bh * 0.42)}px "IBM Plex Sans Arabic", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let text = label;
  if (fx.reveal) text = [...label].slice(0, Math.round(fx.reveal.f * [...label].length)).join('');
  ctx.fillText(text, 0, 2);
  ctx.restore();
}

/** One frame of a tile's picture at time `ms` of its loop (or its middle, when still). */
function drawTile(c: HTMLCanvasElement, type: 'transition' | 'anim', kind: string, ms: number | null) {
  const ctx = c.getContext('2d');
  if (!ctx) return;
  const w = c.width;
  const h = c.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0b1210';
  ctx.fillRect(0, 0, w, h);
  if (type === 'transition') {
    // A holds, B comes in over 1.2 s, B holds
    const p = ms === null ? 0.5 : Math.max(0, Math.min(1, ((ms % 2200) - 400) / 1200));
    const out = transitionFx(kind, p, 'out', w, h);
    const inn = transitionFx(kind, p, 'in', w, h);
    paint(ctx, '#17795a', 'أ', out.fx, w, h);
    paint(ctx, '#b8892b', 'ب', inn.fx, w, h);
    if (inn.overlay && inn.overlay.alpha > 0) {
      ctx.globalAlpha = inn.overlay.alpha;
      ctx.fillStyle = inn.overlay.color;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
    if (kind === 'fade') {
      // a cross-fade is drawn by opacity in the editor (timeline.ts): the same here
      ctx.globalAlpha = p;
      paint(ctx, '#b8892b', 'ب', { ...inn.fx, alpha: 1 }, w, h);
      ctx.globalAlpha = 1;
    }
  } else {
    // enter over 0.8 s, hold, leave over 0.8 s
    const t = ms === null ? 600 : ms % 2600;
    const k = t < 800 ? t / 800 : t < 1800 ? 1 : 1 - (t - 1800) / 800;
    const fx = animFx(kind, k, t < 1800 ? 1 : -1, w, h);
    paint(ctx, '#17795a', kind === 'typewriter' || kind === 'words' ? 'نص متحرك' : 'عنوان', fx, w, h, 14);
  }
}

function Tile({ type, kind, label, hint, onA, onB, aLabel, bLabel, disabled }: { type: 'transition' | 'anim'; kind: string; label: string; hint?: string; onA: () => void; onB: () => void; aLabel: string; bLabel: string; disabled: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(TW * dpr);
    c.height = Math.round(TH * dpr);
    if (!live) return drawTile(c, type, kind, null);
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      drawTile(c, type, kind, now - t0);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [live, type, kind]);
  return (
    <li
      className="st-fx-tile"
      draggable={!disabled}
      data-effect={`${type}:${kind}`}
      title={hint ? `${label}: ${hint}` : label}
      onPointerEnter={() => setLive(true)}
      onPointerLeave={() => setLive(false)}
      onFocus={() => setLive(true)}
      onBlur={() => setLive(false)}
      onDragStart={(e) => {
        e.dataTransfer.setData(EFFECT_MIME, JSON.stringify({ type, kind }));
        e.dataTransfer.effectAllowed = 'copy';
      }}
    >
      <canvas ref={ref} style={{ width: TW, height: TH }} aria-hidden="true" />
      <b>{label}</b>
      <span className="st-fx-acts">
        <button type="button" onClick={onA} disabled={disabled}>{aLabel}</button>
        <button type="button" onClick={onB} disabled={disabled}>{bLabel}</button>
      </span>
    </li>
  );
}

export function EffectsPanel({
  readOnly, selection, length, onLength, onTransition, onAnim, note,
}: {
  readOnly: boolean;
  /** What the selected clip allows: a clip before it, a clip after it, a text. */
  selection: { has: boolean; prev: boolean; next: boolean; text: boolean } | null;
  length: number;
  onLength: (us: number) => void;
  onTransition: (kind: TransitionKind, where: 'start' | 'end') => void;
  onAnim: (kind: AnimKind, where: 'in' | 'out') => void;
  note: string | null;
}) {
  const [tab, setTab] = useState<'transitions' | 'anims'>('transitions');
  const [q, setQ] = useState('');
  const match = (label: string) => !q.trim() || label.includes(q.trim());
  const sel = selection;
  return (
    <section className="st-fx" aria-label="الانتقالات والحركات">
      <div className="st-pane-tabs" role="tablist" aria-label="نوع المؤثر">
        <button type="button" role="tab" aria-selected={tab === 'transitions'} data-on={tab === 'transitions' ? 'yes' : 'no'} onClick={() => setTab('transitions')}>
          الانتقالات ({TRANSITIONS.length})
        </button>
        <button type="button" role="tab" aria-selected={tab === 'anims'} data-on={tab === 'anims' ? 'yes' : 'no'} onClick={() => setTab('anims')}>
          الدخول والخروج ({ANIMATIONS.length})
        </button>
      </div>
      <div className="st-fx-head">
        <label className="st-search">
          <Search aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم" aria-label="ابحث في المؤثرات" />
        </label>
        <Slider label="المدة" value={Math.round((length / US) * 100) / 100} min={0.1} max={3} step={0.05} decimals={2} unit="ث" onChange={(v) => onLength(Math.round(v * US))} />
        <p className="st-hint">
          {tab === 'transitions'
            ? 'اسحب الانتقال إلى مقطع على الخط الزمني قرب بدايته أو نهايته، أو حدد مقطعاً واختر «البداية» أو «النهاية». يحتاج الانتقال مقطعاً ملاصقاً على المسار نفسه.'
            : 'اسحب الحركة إلى مقطع (النصف الأول للدخول، والثاني للخروج)، أو حدد مقطعاً واختر «دخول» أو «خروج».'}
        </p>
        {note && <p className="st-hint st-warn" role="status">{note}</p>}
      </div>
      <ul className="st-fx-grid">
        {tab === 'transitions'
          ? TRANSITIONS.filter((x) => match(x.label)).map((x) => (
              <Tile key={x.kind} type="transition" kind={x.kind} label={x.label} hint={x.hint} aLabel="البداية" bLabel="النهاية" disabled={readOnly || !sel?.has} onA={() => onTransition(x.kind, 'start')} onB={() => onTransition(x.kind, 'end')} />
            ))
          : ANIMATIONS.filter((x) => match(x.label) && (!x.textOnly || !sel?.has || sel.text)).map((x) => (
              <Tile key={x.kind} type="anim" kind={x.kind} label={x.label} hint={x.textOnly ? 'للنصوص.' : undefined} aLabel="دخول" bLabel="خروج" disabled={readOnly || !sel?.has} onA={() => onAnim(x.kind, 'in')} onB={() => onAnim(x.kind, 'out')} />
            ))}
      </ul>
    </section>
  );
}

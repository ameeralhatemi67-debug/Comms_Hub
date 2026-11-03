'use client';
// The sign-in screen's moving background: the brand rosette repeated in a quiet, drifting pattern, which
// brightens to gold and spins where the pointer is. One canvas, nothing stored, nothing read from the page
// but two colour tokens. It never takes the pointer from the card (pointer-events none), stops with the tab,
// and under «تقليل الحركة» it stays still and only lights up near the pointer. Rules: src/lib/auth-backdrop.ts.
import { useEffect, useRef } from 'react';
import { CAPSULE, GOLD, REACH, SPIN_SPEED, influence, springStep, layout, look, parseHex, rgba, type Cell, type Rgb } from '@/lib/auth-backdrop';

export function AuthBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const host = canvas.parentElement ?? canvas;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let cells: Cell[] = [];
    let width = 0;
    let height = 0;
    let muted: Rgb = parseHex(null);
    // the pointer, eased: where the light is and how much of it there is
    const p = { x: 0, y: 0, tx: 0, ty: 0, power: 0, target: 0, seen: false };
    let last = 0;
    let raf = 0;

    const readColours = () => {
      muted = parseHex(getComputedStyle(host).getPropertyValue('--campaign-muted'));
    };

    const size = () => {
      const r = host.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, Math.round(r.width));
      height = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cells = layout(width, height);
      start();
    };

    const draw = (now: number) => {
      const t = motion.matches ? 0 : now / 1000;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
      last = now;
      if (p.seen) {
        p.x += (p.tx - p.x) * Math.min(1, dt * 10);
        p.y += (p.ty - p.y) * Math.min(1, dt * 10);
      }
      p.power += (p.target - p.power) * Math.min(1, dt * 6);

      ctx.clearRect(0, 0, width, height);
      if (p.power > 0.01) {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, REACH * 1.3);
        g.addColorStop(0, rgba(GOLD, 0.09 * p.power));
        g.addColorStop(1, rgba(GOLD, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.lineCap = 'round';
      for (const c of cells) {
        const f = p.power > 0.001 ? influence(c.x - p.x, c.y - p.y) * p.power : 0;
        if (!motion.matches) {
          c.spin += dt * f * SPIN_SPEED;
          const s = springStep(c.grow, c.vel, f, dt);
          c.grow = s.grow;
          c.vel = s.vel;
        } else {
          c.grow = f;
        }
        const v = look(f, t, c, muted, c.grow);
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(v.angle + c.dir * c.spin + c.dir * f * (Math.PI / 4));
        ctx.scale(v.scale, v.scale);
        ctx.strokeStyle = rgba(v.color, v.alpha);
        // in the rosette's own units: about two thirds of a pixel at rest, thicker when lit
        ctx.lineWidth = 4 * (1 + f * 0.8);
        for (let k = 0; k < 4; k++) {
          ctx.beginPath();
          ctx.roundRect(-CAPSULE.half, -CAPSULE.thick, CAPSULE.half * 2, CAPSULE.thick * 2, CAPSULE.radius);
          ctx.stroke();
          ctx.rotate(Math.PI / 4);
        }
        ctx.restore();
      }
      // still: draw again only while the light is still settling
      if (!motion.matches || Math.abs(p.target - p.power) > 0.01 || Math.hypot(p.tx - p.x, p.ty - p.y) > 0.5) raf = requestAnimationFrame(draw);
      else raf = 0;
    };

    function start() {
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(draw);
      }
    }

    const move = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      p.tx = e.clientX - r.left;
      p.ty = e.clientY - r.top;
      if (!p.seen) {
        p.x = p.tx;
        p.y = p.ty;
        p.seen = true;
      }
      p.target = 1;
      start();
    };
    const away = () => {
      p.target = 0;
      start();
    };
    const lift = (e: PointerEvent) => {
      if (e.pointerType === 'touch') away();
    };

    readColours();
    size();
    const resize = new ResizeObserver(size);
    resize.observe(host);
    // the screen follows the design and theme: read the tones again when either changes
    const theme = new MutationObserver(() => {
      readColours();
      start();
    });
    theme.observe(document.documentElement, { attributes: true });
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', move, { passive: true });
    window.addEventListener('pointerup', lift, { passive: true });
    window.addEventListener('pointercancel', away, { passive: true });
    document.documentElement.addEventListener('pointerleave', away);
    window.addEventListener('blur', away);
    motion.addEventListener('change', start);
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      theme.disconnect();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', move);
      window.removeEventListener('pointerup', lift);
      window.removeEventListener('pointercancel', away);
      document.documentElement.removeEventListener('pointerleave', away);
      window.removeEventListener('blur', away);
      motion.removeEventListener('change', start);
    };
  }, []);

  return <canvas ref={ref} className="auth-backdrop" aria-hidden="true" />;
}

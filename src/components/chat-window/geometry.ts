'use client';
// Where the window may sit: the viewport, the sidebar it never covers, the top bar it starts
// under (which scrolls away with the page) and a phone's bottom bar. Read from the page itself,
// so the window follows the sidebar as it opens and closes.
import { useEffect, useState } from 'react';
import { PHONE_W } from '@/lib/chat-window/rules';

export type Geometry = { vw: number; vh: number; sidebar: number; top: number; bottom: number; phone: boolean };

const read = (): Geometry => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const phone = vw < PHONE_W;
  const side = document.querySelector('.sidebar:not(.mobile-open)');
  const sideBox = side && !phone ? side.getBoundingClientRect() : null;
  const bar = document.querySelector('.topbar');
  const nav = document.querySelector('.mobile-nav');
  const navBox = nav && phone ? nav.getBoundingClientRect() : null;
  return {
    vw,
    vh,
    phone,
    sidebar: sideBox && sideBox.width > 0 ? Math.round(sideBox.width) : 0,
    top: phone ? 0 : Math.max(0, Math.round(bar?.getBoundingClientRect().bottom ?? 0)),
    bottom: navBox && navBox.height > 0 ? Math.round(vh - navBox.top) : 0,
  };
};

export function useGeometry(active: boolean): Geometry {
  const [g, setG] = useState<Geometry>(() =>
    typeof window === 'undefined' ? { vw: 1280, vh: 800, sidebar: 224, top: 72, bottom: 0, phone: false } : read(),
  );
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setG((old) => {
          const n = read();
          return Object.keys(n).every((k) => n[k as keyof Geometry] === old[k as keyof Geometry]) ? old : n;
        }),
      );
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    const side = document.querySelector('.sidebar');
    if (side) ro.observe(side);
    const bar = document.querySelector('.topbar');
    if (bar) ro.observe(bar);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [active]);
  return g;
}

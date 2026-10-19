'use client';

// Per-person conveniences of the studio, remembered on this device only (the editor's light or dark
// chrome, filling the window, the preview resolution, the effects' default length). Never project data:
// a private window or blocked storage simply starts from the defaults.
import { useCallback, useEffect, useRef, useState } from 'react';

export function usePref<T>(key: string, initial: T, valid: (v: unknown) => v is T = (v): v is T => typeof v === typeof initial): [T, (v: T | ((x: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`studio.pref.${key}`);
      if (raw !== null) {
        const v = JSON.parse(raw) as unknown;
        if (valid(v)) return v;
      }
    } catch {
      // storage unavailable
    }
    return initial;
  });
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    try {
      localStorage.setItem(`studio.pref.${key}`, JSON.stringify(value));
    } catch {
      // storage unavailable: the choice lasts for this visit
    }
  }, [key, value]);
  return [value, useCallback((v: T | ((x: T) => T)) => setValue(v), [])];
}

/** The editor fills the browser window below its top edge, so the page itself does not scroll. */
export function useFillHeight(ref: React.RefObject<HTMLElement | null>, on: boolean) {
  const [h, setH] = useState<number | null>(null);
  useEffect(() => {
    if (!on) return setH(null);
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      setH(Math.max(420, Math.floor(window.innerHeight - top - 10)));
    };
    fit();
    window.addEventListener('resize', fit);
    const parent = el.parentElement;
    const ro = parent ? new ResizeObserver(fit) : null;
    if (parent) ro!.observe(parent);
    return () => {
      window.removeEventListener('resize', fit);
      ro?.disconnect();
    };
  }, [ref, on]);
  return h;
}

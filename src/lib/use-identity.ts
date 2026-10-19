'use client';
// Client-side reading of the theme. Kept apart from identity.ts so the
// server layout can import the constants without a client hook.
import { useSyncExternalStore } from 'react';
import type { Theme } from './identity';

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  return () => observer.disconnect();
}

/** The current theme. The server renders light; the client corrects it before paint. */
export function useTheme(): Theme {
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'),
    () => 'light',
  );
}

'use client';
// Client-side reading of the design switch. Kept apart from identity.ts so the
// server layout can import the switch's constants without a client hook.
import { useSyncExternalStore } from 'react';
import { IDENTITY_NEW } from './identity';

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-identity'] });
  return () => observer.disconnect();
}

/**
 * True while the second design is on. Screens of Checkpoint 0.3 that add structure,
 * not only style (decisions on Home, the approval stamp, notification tiers, the
 * calendar week), render only when this is true. The server always renders
 * Direction A; React then re-renders on the client without a hydration error.
 */
export function useIdentity(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => document.documentElement.getAttribute('data-identity') === IDENTITY_NEW,
    () => false,
  );
}

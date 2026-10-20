'use client';
// Whether the shell around this page offers a feature (src/lib/native). The server and the first render
// say no, so the page hydrates the same everywhere; the browser's answer follows at once.
import { useSyncExternalStore } from 'react';
import { native, type Feature } from '@/lib/native';

const never = () => () => undefined;

export function useNativeFeature(feature: Feature): boolean {
  return useSyncExternalStore(never, () => native().has(feature), () => false);
}

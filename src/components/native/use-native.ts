'use client';
// Whether the shell around this page offers a feature (src/lib/native). The server and the first render
// say no, so the page hydrates the same everywhere; the browser's answer follows at once.
import { useSyncExternalStore } from 'react';
import { native, type Feature, type Platform } from '@/lib/native';

const never = () => () => undefined;

export function useNativeFeature(feature: Feature): boolean {
  return useSyncExternalStore(never, () => native().has(feature), () => false);
}

/** The version of the application around this page, any version from D1 on; null in a browser. */
export function useNativeVersion(): string | null {
  return useSyncExternalStore(never, () => native().version, () => null);
}

/** Which application is around this page: 'desktop' or 'android', or 'web' in a browser and on the server. */
export function useNativePlatform(): Platform {
  return useSyncExternalStore(never, () => native().platform, () => 'web');
}

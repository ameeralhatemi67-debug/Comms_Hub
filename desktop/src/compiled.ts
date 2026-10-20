// What a build fixes when it is compiled (scripts/build.mjs). In a release build the flag is false, so
// esbuild drops the development address and every development-only branch from the bundle; the
// release bundle does not contain them at all (tests/build.test.mjs reads it).
import { PRODUCTION_ORIGIN, originsFor } from './origins.ts';

export const DEV: boolean = __COMMS_HUB_DEV__;
export const VERSION: string = __APP_VERSION__;
export const ALLOWED: readonly string[] = __COMMS_HUB_DEV__ ? originsFor(true) : Object.freeze([PRODUCTION_ORIGIN]);

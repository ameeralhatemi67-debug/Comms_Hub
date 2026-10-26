// What a build fixes when it is compiled (scripts/build.mjs). In a release build the flag is false, so
// esbuild drops the development address and every development-only branch from the bundle; the
// release bundle does not contain them at all (tests/build.test.mjs reads it). The update check's
// package (QA) is a release build under its own id with a feed on this laptop; nothing else is.
import { PRODUCTION_ORIGIN, originsFor } from './origins.ts';
import { PRODUCTION_FEED } from './update.ts';

export const DEV: boolean = __COMMS_HUB_DEV__;
export const QA: boolean = __COMMS_HUB_QA__;
export const VERSION: string = __APP_VERSION__;
export const UPDATE_FEED: string = __UPDATE_FEED__ ?? PRODUCTION_FEED;
/** The pinned FFmpeg's short tag (ffmpeg.lock.json), part of every light or converted copy's name (D5). */
export const FFMPEG_TAG: string = __FFMPEG_TAG__;
export const ALLOWED: readonly string[] = __COMMS_HUB_DEV__ ? originsFor(true) : Object.freeze([PRODUCTION_ORIGIN]);

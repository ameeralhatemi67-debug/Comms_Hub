// Values compiled in by scripts/build.mjs through esbuild's define.

/** True in a development build only: the local site on the list, developer tools, test variables. */
declare const __COMMS_HUB_DEV__: boolean;

/** The application's version, from desktop/package.json (the update check's package is given its own). */
declare const __APP_VERSION__: string;

/** True in the update check's package only (qa/desktop-update.cjs): its own id, data folder and feed. */
declare const __COMMS_HUB_QA__: boolean;

/** The update feed of the update check's package; null in every other build, which carries the production feed. */
declare const __UPDATE_FEED__: string | null;

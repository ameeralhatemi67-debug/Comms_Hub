// The configuration of each build (Android_Build_Plan.md A2). capacitor.config.json is the release's: the
// production address alone, no cleartext, no inspection. A development or check build is the same file
// opening the local site, inspectable. The phone reaches the site on this computer through
// `adb reverse tcp:3000 tcp:3000`, at the loopback address, the desktop's development address too: a page
// there is a secure context, as the production site is, so the microphone and the like behave the same. Pure.

export const LOCAL_ORIGIN = 'http://127.0.0.1:3000';

/** The configuration of a development or check build: the release's, opening the local site, inspectable. */
export function localConfig(release) {
  return {
    ...release,
    loggingBehavior: 'debug',
    server: { ...release.server, url: LOCAL_ORIGIN, cleartext: true },
    android: { ...release.android, webContentsDebuggingEnabled: true },
  };
}

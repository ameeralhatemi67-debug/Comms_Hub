// Who the application is (Desktop_App_Plan.md 11.1): the fixed internal id, the name Windows shows,
// the data folder and the user agent. The id never changes, so the data folder never moves when the
// name shown does. It names no host and is never looked up; it only has to stay the same. Pure.

/** Fixed for good: the Windows application id, the uninstall key and the data folder come from it. */
export const APP_ID = 'sa.commshub.desktop';

/** What Windows shows in the Start menu, the taskbar, the installer and the file details. */
export const PRODUCT_NAME = 'مركز الاتصال المؤسسي';

/** The profile's folder under %APPDATA%. A development build keeps its own, apart from the real one. */
export const dataFolderName = (dev: boolean) => (dev ? `${APP_ID}.dev` : APP_ID);

/** The Windows application id; a development build is grouped apart on the taskbar. */
export const windowsAppId = (dev: boolean) => (dev ? `${APP_ID}.dev` : APP_ID);

/**
 * Chromium's user agent with Electron's own tokens taken out and ` CommsHubDesktop/<version>` at
 * the end, so support can see which version someone runs. Always plain ASCII, since a header
 * cannot carry the Arabic name. The page learns its features from the bridge, never from this.
 */
export function userAgentFor(base: string, version: string): string {
  const head = /^.*?\(KHTML, like Gecko\)/.exec(base)?.[0];
  const chrome = /\bChrome\/[\d.]+/.exec(base)?.[0];
  const safari = /\bSafari\/[\d.]+/.exec(base)?.[0];
  const kept = head && chrome && safari ? `${head} ${chrome} ${safari}` : base.replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, ' ').trim();
  return `${kept} CommsHubDesktop/${version}`;
}

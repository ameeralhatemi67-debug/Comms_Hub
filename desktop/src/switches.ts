// Command-line switches the application will not start with (Desktop_App_Plan.md section 9). In every
// build: anything that ignores certificate errors, turns web security or the sandbox off, or treats
// a plain address as secure. In a release build also remote debugging, because the developer tools
// open only in a development build. The Node.js inspector, NODE_OPTIONS and ELECTRON_RUN_AS_NODE are
// closed by fuses at packaging, not here. Pure.

export const REFUSED_ALWAYS = Object.freeze([
  'ignore-certificate-errors',
  'ignore-certificate-errors-spki-list',
  'allow-insecure-localhost',
  'unsafely-treat-insecure-origin-as-secure',
  'disable-web-security',
  'no-sandbox',
  'disable-site-isolation-trials',
]);

export const REFUSED_IN_RELEASE = Object.freeze(['remote-debugging-port', 'remote-debugging-pipe', 'remote-allow-origins']);

/** The first refused switch present, or null. `has` is app.commandLine.hasSwitch. */
export function refusedSwitch(has: (name: string) => boolean, dev: boolean): string | null {
  const list = dev ? REFUSED_ALWAYS : [...REFUSED_ALWAYS, ...REFUSED_IN_RELEASE];
  return list.find((name) => has(name)) ?? null;
}

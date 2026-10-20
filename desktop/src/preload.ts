// The bridge (Desktop_App_Plan.md 5.2; Mobile_Apps_Plan.md 5.2): window.commsHubNative, the desktop
// side of the native contract the site will read through src/lib/native/ (D2). It is exposed only when
// this document is the top-level page and its address is on the compiled list; frames, foreign pages
// and the application's own Arabic screens get nothing. In D1 it carries who the application is and
// no method. D2 adds methods, and each one's main-process handler checks its sender again (sender.ts).
import { contextBridge } from 'electron';
import { ALLOWED, VERSION } from './compiled.ts';
import { isAllowed } from './origins.ts';

if (window.top === window && isAllowed(window.location.href, ALLOWED)) {
  contextBridge.exposeInMainWorld('commsHubNative', Object.freeze({ platform: 'desktop', shell: 'electron', version: VERSION, bridge: 1 }));
}

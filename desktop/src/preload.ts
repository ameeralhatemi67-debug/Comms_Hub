// The bridge (Desktop_App_Plan.md 5.2; Mobile_Apps_Plan.md 5.2): window.commsHubNative, the desktop
// side of the native contract the site reads through src/lib/native/. It is exposed only when this
// document is the top-level page and its address is on the compiled list; frames, foreign pages and the
// application's own Arabic screens get nothing. Version 1 (D2) adds `info`, `power`, `life` and
// `notify`; version 2 (D3) adds `update`; version 3 (D4) adds `files`, `cache` and `data`; version 4 (D5)
// adds `media`, which names a source by its token or library version, never by a path; version 5 (D6) adds
// `windows`, which names a panel and its project, never an address; version 6 (D9) adds `gpu`, which takes a
// word from a fixed list, and `profile`, which takes measured numbers in a fixed shape; version 7 (D12) adds
// `life.activity`, a word from a fixed list, and `media.queue`, which names sources as `media` does; version 8 adds
// `life.progress`, a number from 0 to 1 or a word of a fixed list, and `files.dragOut`, which takes a token; version 9
// adds the camera card's import, which opens the system's dialogs and names recordings by the keys it gave.
// Each method only
// sends a message; its main-process handler checks the sender again (sender.ts) and every argument. No
// method takes a file path, a command or another address: `files.fromDropped` takes a File the person
// chose, and only here, in the preload, is the path Chromium attached to it read (webUtils).
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { ALLOWED, VERSION } from './compiled.ts';
import { BRIDGE_VERSION, CHANNEL } from './ipc.ts';
import { isAllowed } from './origins.ts';

if (window.top === window && isAllowed(window.location.href, ALLOWED)) {
  const call = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args);
  let opener: ((go: string) => void) | null = null;
  let progress: ((p: unknown) => void) | null = null;
  let mediaProgress: ((p: unknown) => void) | null = null;
  let queueState: ((s: unknown) => void) | null = null;
  let cardProgress: ((p: unknown) => void) | null = null;
  ipcRenderer.on(CHANNEL.cacheProgress, (_event, p: unknown) => progress?.(p));
  ipcRenderer.on(CHANNEL.mediaProgress, (_event, p: unknown) => mediaProgress?.(p));
  ipcRenderer.on(CHANNEL.mediaQueueState, (_event, s: unknown) => queueState?.(s));
  ipcRenderer.on(CHANNEL.cardProgress, (_event, p: unknown) => cardProgress?.(p));
  // A native notice was clicked: the page moves itself if it said how, otherwise the address changes.
  ipcRenderer.on(CHANNEL.open, (_event, go: unknown) => {
    if (typeof go !== 'string' || !go.startsWith('/') || go.startsWith('//')) return;
    if (opener) opener(go);
    else window.location.assign(go);
  });
  contextBridge.exposeInMainWorld(
    'commsHubNative',
    Object.freeze({
      platform: 'desktop',
      shell: 'electron',
      version: VERSION,
      bridge: BRIDGE_VERSION,
      info: () => call(CHANNEL.info),
      power: Object.freeze({ keepAwake: (reason: unknown) => call(CHANNEL.keepAwake, reason), release: (id: unknown) => call(CHANNEL.release, id) }),
      life: Object.freeze({ busy: (reason: unknown) => call(CHANNEL.busy, reason), idle: () => call(CHANNEL.idle), activity: (kind: unknown) => call(CHANNEL.activity, kind), progress: (state: unknown) => call(CHANNEL.progress, state) }),
      notify: Object.freeze({
        show: (notice: unknown) => call(CHANNEL.notify, notice),
        badge: (count: unknown) => call(CHANNEL.badge, count),
        onOpen: (fn: unknown) => {
          opener = typeof fn === 'function' ? (fn as (go: string) => void) : null;
        },
      }),
      update: Object.freeze({ status: () => call(CHANNEL.updateStatus), restart: () => call(CHANNEL.updateRestart) }),
      files: Object.freeze({
        pick: (kinds: unknown) => call(CHANNEL.filesPick, kinds),
        fromDropped: (file: unknown) => {
          let where = '';
          try {
            where = file instanceof File ? webUtils.getPathForFile(file) : '';
          } catch {
            where = '';
          }
          return where ? call(CHANNEL.filesAdd, where) : Promise.resolve(null);
        },
        check: (token: unknown) => call(CHANNEL.filesCheck, token),
        forget: (token: unknown) => call(CHANNEL.filesForget, token),
        dragOut: (token: unknown) => call(CHANNEL.filesDragOut, token),
        importCard: () => call(CHANNEL.filesImportCard),
        copyCard: (ask: unknown) => call(CHANNEL.filesCopyCard, ask),
        cancelCard: (id: unknown) => call(CHANNEL.filesCancelCard, id),
        onCard: (fn: unknown) => {
          cardProgress = typeof fn === 'function' ? (fn as (p: unknown) => void) : null;
        },
      }),
      cache: Object.freeze({
        library: (ask: unknown) => call(CHANNEL.cacheLibrary, ask),
        cancel: (name: unknown) => call(CHANNEL.cacheCancel, name),
        has: (ask: unknown) => call(CHANNEL.cacheHas, ask),
        usage: () => call(CHANNEL.cacheUsage),
        choose: () => call(CHANNEL.cacheChoose),
        useDefault: () => call(CHANNEL.cacheDefault),
        limit: (bytes: unknown, inUse: unknown) => call(CHANNEL.cacheLimit, bytes, inUse),
        sweep: (inUse: unknown) => call(CHANNEL.cacheSweep, inUse),
        clear: (inUse: unknown) => call(CHANNEL.cacheClear, inUse),
        onProgress: (fn: unknown) => {
          progress = typeof fn === 'function' ? (fn as (p: unknown) => void) : null;
        },
      }),
      data: Object.freeze({ clear: () => call(CHANNEL.dataClear) }),
      windows: Object.freeze({
        screens: () => call(CHANNEL.windowsScreens),
        popOut: (ask: unknown) => call(CHANNEL.windowsPopOut, ask),
        close: (panel: unknown) => call(CHANNEL.windowsClose, panel),
      }),
      media: Object.freeze({
        probe: (source: unknown) => call(CHANNEL.mediaProbe, source),
        copies: (source: unknown) => call(CHANNEL.mediaCopies, source),
        proxy: (source: unknown, height: unknown, inUse: unknown) => call(CHANNEL.mediaProxy, source, height, inUse),
        convert: (source: unknown, inUse: unknown) => call(CHANNEL.mediaConvert, source, inUse),
        cancel: (name: unknown) => call(CHANNEL.mediaCancel, name),
        onProgress: (fn: unknown) => {
          mediaProgress = typeof fn === 'function' ? (fn as (p: unknown) => void) : null;
        },
        queue: (ask: unknown) => call(CHANNEL.mediaQueue, ask),
        queued: () => call(CHANNEL.mediaQueued),
        onQueue: (fn: unknown) => {
          queueState = typeof fn === 'function' ? (fn as (s: unknown) => void) : null;
        },
      }),
      gpu: Object.freeze({
        state: () => call(CHANNEL.gpuState),
        choose: (choice: unknown) => call(CHANNEL.gpuChoose, choice),
        restart: () => call(CHANNEL.gpuRestart),
      }),
      profile: Object.freeze({
        read: () => call(CHANNEL.profileRead),
        save: (numbers: unknown) => call(CHANNEL.profileSave, numbers),
      }),
    }),
  );
}

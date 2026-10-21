// The message channels between the bridge (preload.ts) and the main process (native.ts, native-files.ts), the
// groups of Desktop_App_Plan.md 5.2: info, power, life and notify (version 1, D2), update (version 2, D3),
// files, cache and data (version 3, D4). Every channel the page can call is answered by a handler
// registered through sender.ts's guard(); `open` and `cacheProgress` go the other way, from the main
// process to the page. Pure.

export const CHANNEL = Object.freeze({
  info: 'commshub:info',
  keepAwake: 'commshub:power.keepAwake',
  release: 'commshub:power.release',
  busy: 'commshub:life.busy',
  idle: 'commshub:life.idle',
  notify: 'commshub:notify.show',
  badge: 'commshub:notify.badge',
  open: 'commshub:notify.open',
  updateStatus: 'commshub:update.status',
  updateRestart: 'commshub:update.restart',
  filesPick: 'commshub:files.pick',
  filesAdd: 'commshub:files.add',
  filesCheck: 'commshub:files.check',
  filesForget: 'commshub:files.forget',
  cacheLibrary: 'commshub:cache.library',
  cacheCancel: 'commshub:cache.cancel',
  cacheHas: 'commshub:cache.has',
  cacheUsage: 'commshub:cache.usage',
  cacheChoose: 'commshub:cache.choose',
  cacheDefault: 'commshub:cache.default',
  cacheLimit: 'commshub:cache.limit',
  cacheSweep: 'commshub:cache.sweep',
  cacheClear: 'commshub:cache.clear',
  cacheProgress: 'commshub:cache.progress',
  dataClear: 'commshub:data.clear',
});

/** The channels the page may call; `open` is sent by the main process only. */
export const CALLABLE = Object.freeze([
  CHANNEL.info, CHANNEL.keepAwake, CHANNEL.release, CHANNEL.busy, CHANNEL.idle, CHANNEL.notify, CHANNEL.badge, CHANNEL.updateStatus, CHANNEL.updateRestart,
  CHANNEL.filesPick, CHANNEL.filesAdd, CHANNEL.filesCheck, CHANNEL.filesForget,
  CHANNEL.cacheLibrary, CHANNEL.cacheCancel, CHANNEL.cacheHas, CHANNEL.cacheUsage, CHANNEL.cacheChoose, CHANNEL.cacheDefault, CHANNEL.cacheLimit, CHANNEL.cacheSweep, CHANNEL.cacheClear,
  CHANNEL.dataClear,
]);

/** The bridge's version: 1 for info, power, life and notify (D2); 2 adds update (D3); 3 adds files, cache and data (D4). */
export const BRIDGE_VERSION = 3;

// The message channels between the bridge (preload.ts) and the main process (native.ts, native-files.ts), the
// groups of Desktop_App_Plan.md 5.2: info, power, life and notify (version 1, D2), update (version 2, D3),
// files, cache and data (version 3, D4), media (version 4, D5), windows (version 5, D6), gpu and profile (version 6,
// D9, Desktop_Power_Ideas.md P-01 and P-33), life.activity and the media queue (version 7, D12, P-30 and P-08).
// Every channel the page can call is answered by a handler registered through sender.ts's guard(); `open`,
// `cacheProgress`, `mediaProgress` and `mediaQueueState` go the other way, from the main process to the page. Pure.

export const CHANNEL = Object.freeze({
  info: 'commshub:info',
  keepAwake: 'commshub:power.keepAwake',
  release: 'commshub:power.release',
  busy: 'commshub:life.busy',
  idle: 'commshub:life.idle',
  activity: 'commshub:life.activity',
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
  mediaProbe: 'commshub:media.probe',
  mediaCopies: 'commshub:media.copies',
  mediaProxy: 'commshub:media.proxy',
  mediaConvert: 'commshub:media.convert',
  mediaCancel: 'commshub:media.cancel',
  mediaProgress: 'commshub:media.progress',
  mediaQueue: 'commshub:media.queue',
  mediaQueued: 'commshub:media.queued',
  mediaQueueState: 'commshub:media.queueState',
  windowsScreens: 'commshub:windows.screens',
  windowsPopOut: 'commshub:windows.popOut',
  windowsClose: 'commshub:windows.close',
  gpuState: 'commshub:gpu.state',
  gpuChoose: 'commshub:gpu.choose',
  gpuRestart: 'commshub:gpu.restart',
  profileRead: 'commshub:profile.read',
  profileSave: 'commshub:profile.save',
});

/** The channels the page may call; `open` is sent by the main process only. */
export const CALLABLE = Object.freeze([
  CHANNEL.info, CHANNEL.keepAwake, CHANNEL.release, CHANNEL.busy, CHANNEL.idle, CHANNEL.activity, CHANNEL.notify, CHANNEL.badge, CHANNEL.updateStatus, CHANNEL.updateRestart,
  CHANNEL.filesPick, CHANNEL.filesAdd, CHANNEL.filesCheck, CHANNEL.filesForget,
  CHANNEL.cacheLibrary, CHANNEL.cacheCancel, CHANNEL.cacheHas, CHANNEL.cacheUsage, CHANNEL.cacheChoose, CHANNEL.cacheDefault, CHANNEL.cacheLimit, CHANNEL.cacheSweep, CHANNEL.cacheClear,
  CHANNEL.dataClear,
  CHANNEL.mediaProbe, CHANNEL.mediaCopies, CHANNEL.mediaProxy, CHANNEL.mediaConvert, CHANNEL.mediaCancel, CHANNEL.mediaQueue, CHANNEL.mediaQueued,
  CHANNEL.windowsScreens, CHANNEL.windowsPopOut, CHANNEL.windowsClose,
  CHANNEL.gpuState, CHANNEL.gpuChoose, CHANNEL.gpuRestart, CHANNEL.profileRead, CHANNEL.profileSave,
]);

/** The bridge's version: 1 for info, power, life and notify (D2); 2 adds update (D3); 3 adds files, cache and data (D4); 4 adds media (D5); 5 adds windows (D6); 6 adds gpu and profile (D9); 7 adds life.activity and media.queue, queued and onQueue (D12). */
export const BRIDGE_VERSION = 7;

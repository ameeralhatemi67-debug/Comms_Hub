// The message channels between the bridge (preload.ts) and the main process (native.ts), bridge
// version 1 of Desktop_App_Plan.md 5.2: info, power, life and notify (D2). Every channel the page can
// call is answered by a handler registered through sender.ts's guard(); `open` goes the other way,
// from the main process to the page, when a native notice is clicked. Pure.

export const CHANNEL = Object.freeze({
  info: 'commshub:info',
  keepAwake: 'commshub:power.keepAwake',
  release: 'commshub:power.release',
  busy: 'commshub:life.busy',
  idle: 'commshub:life.idle',
  notify: 'commshub:notify.show',
  badge: 'commshub:notify.badge',
  open: 'commshub:notify.open',
});

/** The channels the page may call; `open` is sent by the main process only. */
export const CALLABLE = Object.freeze([CHANNEL.info, CHANNEL.keepAwake, CHANNEL.release, CHANNEL.busy, CHANNEL.idle, CHANNEL.notify, CHANNEL.badge]);

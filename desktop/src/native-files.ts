// The bridge's `files`, `cache` and `data` groups (Desktop_App_Plan.md 5.2 and 5.4, phase D4; decision D-11),
// wired to Electron: files from «هذا الجهاز» used where they are (file-store.ts), the studio's cache in a
// folder (cache-store.ts), both read by the page at commshub-file:// (protocol.ts), and «مسح بيانات هذا
// الجهاز». Every handler goes through the same guard() as the rest of the bridge; every argument is checked
// here. The page never sends a path: `files.pick` opens the system's own dialog, and a dropped or chosen
// File reaches the main process only as the path Chromium attached to it, read in the preload.
import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, dialog } from 'electron';
import type { IpcMainInvokeEvent, Session } from 'electron';
import { CacheStore, LIMITS, libraryName } from './cache-store.ts';
import { freeBytes } from './device.ts';
import { FileStore } from './file-store.ts';
import { addressOf, CACHE_NAME, dialogFilters, publicView, SCHEME, TOKEN } from './files.ts';
import { CHANNEL } from './ipc.ts';
import { isAllowed } from './origins.ts';
import { answer } from './protocol.ts';
import type { Handle } from './native.ts';
import { FOLDER_TITLE, PICK_TITLE } from './words.ts';

const refused = () => new Error('refused');
const MAX_IN_USE = 2000;

/** Names of cache entries the open project uses, from the page: only well-formed names, a bounded list. */
function inUseOf(value: unknown): Set<string> {
  if (!Array.isArray(value) || value.length > MAX_IN_USE) throw refused();
  return new Set(value.filter((n): n is string => typeof n === 'string' && CACHE_NAME.test(n)));
}

export function startFiles(o: { handle: Handle; site: Session; allowed: readonly string[]; reload: () => void }) {
  const profile = app.getPath('userData');
  const files = new FileStore(path.join(profile, 'files.json'));
  const cache = new CacheStore(path.join(profile, 'cache.json'), path.join(profile, 'StudioCache'));
  o.site.protocol.handle(SCHEME, (request) => answer(request, { files, cache, allowed: o.allowed }));
  const owner = (event: IpcMainInvokeEvent) => BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const originOf = (event: IpcMainInvokeEvent) => {
    const url = event.senderFrame?.url ?? '';
    if (!isAllowed(url, o.allowed)) throw refused();
    return new URL(url).origin;
  };

  // --- files ---------------------------------------------------------------------------------------
  o.handle(CHANNEL.filesPick, async (event, kinds: unknown) => {
    const win = owner(event);
    const options = { title: PICK_TITLE, properties: ['openFile', 'multiSelections'] as ('openFile' | 'multiSelections')[], filters: dialogFilters(Array.isArray(kinds) ? kinds : []) };
    const r = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (r.canceled) return [];
    return r.filePaths.map((p) => files.add(p)).filter((x) => x !== null).map((x) => publicView(x!));
  });
  // The preload passes the path Chromium attached to a File the person dropped or chose (webUtils).
  o.handle(CHANNEL.filesAdd, (_event, file: unknown) => {
    if (typeof file !== 'string' || file.length > 32_767) throw refused();
    const r = files.add(file);
    return r ? publicView(r) : null;
  });
  o.handle(CHANNEL.filesCheck, (_event, token: unknown) => {
    if (typeof token !== 'string' || !TOKEN.test(token)) throw refused();
    const found = files.lookup(token);
    return 'record' in found ? { ok: true, url: addressOf('local', token) } : { ok: false, why: found.missing };
  });
  o.handle(CHANNEL.filesForget, (_event, token: unknown) => {
    if (typeof token !== 'string' || !TOKEN.test(token)) throw refused();
    return files.forget(token);
  });

  // --- cache ---------------------------------------------------------------------------------------
  const running = new Map<string, AbortController>();
  o.handle(CHANNEL.cacheLibrary, async (event, ask: unknown) => {
    const a = (ask ?? {}) as { asset?: unknown; version?: unknown; label?: unknown; inUse?: unknown };
    const name = libraryName(a.asset, a.version);
    if (!name) throw refused();
    // The site's own file route on the asking page's address, with the window's session, as the page fetches it.
    const url = `${originOf(event)}/api/media/${a.asset as string}/content?v=${a.version as number}`;
    const label = typeof a.label === 'string' ? a.label.slice(0, 200) : undefined;
    const sender = event.sender;
    const ctl = new AbortController();
    running.set(name, ctl);
    try {
      const e = await cache.library(name, url, (u, init) => o.site.fetch(u, { ...init, credentials: 'include' }), {
        label,
        signal: ctl.signal,
        inUse: a.inUse === undefined ? undefined : inUseOf(a.inUse),
        onProgress: (done, total) => {
          if (!sender.isDestroyed()) sender.send(CHANNEL.cacheProgress, { name, done, total });
        },
      });
      return { name, url: addressOf('cache', name), bytes: e.total };
    } finally {
      running.delete(name);
    }
  });
  o.handle(CHANNEL.cacheCancel, (_event, name: unknown) => {
    if (typeof name !== 'string' || !CACHE_NAME.test(name)) throw refused();
    running.get(name)?.abort();
    return true;
  });
  o.handle(CHANNEL.cacheHas, (_event, ask: unknown) => {
    const a = (ask ?? {}) as { asset?: unknown; version?: unknown };
    const name = libraryName(a.asset, a.version);
    if (!name) throw refused();
    return cache.complete(name) ? addressOf('cache', name) : null;
  });
  const usage = () => {
    let free: number | null = null;
    try {
      fs.mkdirSync(cache.folder(), { recursive: true });
      free = freeBytes(fs.statfsSync(cache.folder()));
    } catch {
      free = null;
    }
    return { ...cache.usage(), free, folder: cache.folder(), isDefault: cache.isDefault(), limits: [...LIMITS], entries: cache.entries().map((e) => ({ name: e.name, kind: e.kind, bytes: e.bytes, complete: e.complete, lastUsed: e.lastUsed, label: e.label ?? null })) };
  };
  o.handle(CHANNEL.cacheUsage, () => usage());
  o.handle(CHANNEL.cacheChoose, async (event) => {
    const win = owner(event);
    const options = { title: FOLDER_TITLE, properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[] };
    const r = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (!r.canceled && r.filePaths[0]) cache.setFolder(r.filePaths[0]);
    return usage();
  });
  o.handle(CHANNEL.cacheDefault, () => {
    cache.setFolder(null);
    return usage();
  });
  o.handle(CHANNEL.cacheLimit, (_event, bytes: unknown, inUse: unknown) => {
    if (typeof bytes !== 'number' || !LIMITS.includes(bytes)) throw refused();
    cache.setLimit(bytes, inUseOf(inUse ?? []));
    return usage();
  });
  o.handle(CHANNEL.cacheSweep, (_event, inUse: unknown) => cache.sweep(inUseOf(inUse ?? [])));
  o.handle(CHANNEL.cacheClear, (_event, inUse: unknown) => cache.clear(inUseOf(inUse ?? [])));

  // --- «مسح بيانات هذا الجهاز» (D-11) ----------------------------------------------------------------
  o.handle(CHANNEL.dataClear, async () => {
    for (const ctl of running.values()) ctl.abort();
    const removed = { files: files.clear(), cache: cache.clear().removed };
    await o.site.clearStorageData();
    await o.site.clearCache();
    // Every window goes back to the start: the session is gone, so the site asks to sign in again.
    setTimeout(o.reload, 200);
    return removed;
  });

  return { files, cache };
}

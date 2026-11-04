// The bridge's `files`, `cache` and `data` groups (Desktop_App_Plan.md 5.2 and 5.4, phase D4; decision D-11),
// wired to Electron: files from «هذا الجهاز» used where they are (file-store.ts), the studio's cache in a
// folder (cache-store.ts), both read by the page at commshub-file:// (protocol.ts), and «مسح بيانات هذا
// الجهاز». Every handler goes through the same guard() as the rest of the bridge; every argument is checked
// here. The page never sends a path: `files.pick` opens the system's own dialog, and a dropped or chosen
// File reaches the main process only as the path Chromium attached to it, read in the preload. From D12 (P-22) a file
// the application gave a token for can be dragged out of the window into another program, by its token; and
// «استيراد من بطاقة الكاميرا» (P-20) lists a card the person picked, copies the recordings they chose into a folder they
// pick, each verified (card-copy.ts), and hands back tokens. Neither dialog's path reaches the page.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, dialog, nativeImage } from 'electron';
import type { IpcMainInvokeEvent, Session } from 'electron';
import { CacheStore, folderLabel, LIMITS, libraryName } from './cache-store.ts';
import { cardItems, cardView, chosenKeys, freeName, type CardItem } from './card.ts';
import { copyVerified, listCard, onCard } from './card-copy.ts';
import { freeBytes } from './device.ts';
import { FileStore } from './file-store.ts';
import { addressOf, CACHE_NAME, dialogFilters, newToken, publicView, SCHEME, TOKEN } from './files.ts';
import { CHANNEL } from './ipc.ts';
import { isAllowed } from './origins.ts';
import { answer } from './protocol.ts';
import type { Handle } from './native.ts';
import { CARD_DEST_TITLE, CARD_TITLE, FOLDER_TITLE, PICK_TITLE } from './words.ts';

const refused = () => new Error('refused');
const MAX_IN_USE = 2000;

/** Names of cache entries the open project uses, from the page: only well-formed names, a bounded list. */
function inUseOf(value: unknown): Set<string> {
  if (!Array.isArray(value) || value.length > MAX_IN_USE) throw refused();
  return new Set(value.filter((n): n is string => typeof n === 'string' && CACHE_NAME.test(n)));
}

export function startFiles(o: { handle: Handle; site: Session; allowed: readonly string[]; reload: () => void; icon: string }) {
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
  // Dragging a file out into another program (P-22): the page calls this as its drag starts; Windows does the rest.
  const dragIcon = nativeImage.createFromPath(o.icon).resize({ width: 32, height: 32, quality: 'best' });
  o.handle(CHANNEL.filesDragOut, (event, token: unknown) => {
    if (typeof token !== 'string' || !TOKEN.test(token)) throw refused();
    const file = files.dragPath(token);
    if (!file) return false;
    event.sender.startDrag({ file, icon: dragIcon });
    return true;
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
    // the folder's label, never its path: the default one lives under the Windows user's name
    return { ...cache.usage(), free, folder: cache.label(), isDefault: cache.isDefault(), limits: [...LIMITS], entries: cache.entries().map((e) => ({ name: e.name, kind: e.kind, bytes: e.bytes, complete: e.complete, lastUsed: e.lastUsed, label: e.label ?? null })) };
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

  // --- «استيراد من بطاقة الكاميرا» (D12, P-20) ---------------------------------------------------------
  /** The cards listed, by an id of 32 random bytes; the page names recordings by the keys of one listing. */
  const cards = new Map<string, { root: string; items: CardItem[]; ctl: AbortController | null }>();
  const MAX_CARDS = 4;
  /** A folder's name for the page: its last name, or a drive's letter. */
  const nameOf = (folder: string) => folderLabel(path.join(folder, 'x'));
  o.handle(CHANNEL.filesImportCard, async (event) => {
    const win = owner(event);
    const options = { title: CARD_TITLE, properties: ['openDirectory'] as 'openDirectory'[] };
    const r = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (r.canceled || !r.filePaths[0]) return null;
    const root = r.filePaths[0];
    const items = cardItems(listCard(root));
    const id = newToken(crypto.randomBytes(32));
    for (const [old, c] of cards) if (cards.size >= MAX_CARDS && !c.ctl) cards.delete(old);
    cards.set(id, { root, items, ctl: null });
    return { id, label: nameOf(root), items: cardView(items) };
  });
  const whyOf = (e: unknown, signal: AbortSignal) => {
    if (signal.aborted) return 'cancelled';
    const x = e as { why?: string; code?: string };
    if (x?.why === 'changed' || x?.why === 'mismatch') return x.why;
    if (x?.code === 'ENOENT' || x?.code === 'EIO' || x?.code === 'ENODEV' || x?.code === 'EBUSY') return 'gone';
    if (x?.code === 'ENOSPC') return 'space';
    return 'failed';
  };
  o.handle(CHANNEL.filesCopyCard, async (event, ask: unknown) => {
    const a = (ask ?? {}) as { id?: unknown; keys?: unknown };
    if (typeof a.id !== 'string' || !TOKEN.test(a.id)) throw refused();
    const id = a.id;
    const card = cards.get(id);
    if (!card) throw refused();
    const keys = chosenKeys(a.keys, card.items);
    if (!keys) throw refused();
    if (card.ctl) throw new Error('busy');
    const win = owner(event);
    const options = { title: CARD_DEST_TITLE, properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[] };
    const r = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (r.canceled || !r.filePaths[0]) return null;
    const dest = r.filePaths[0];
    // the copies never go back onto the card
    const inside = path.relative(path.resolve(card.root), path.resolve(dest));
    if (!inside || (!inside.startsWith('..') && !path.isAbsolute(inside))) return { folder: nameOf(dest), results: keys.map((key) => ({ key, ok: false, why: 'inside' })) };
    const ctl = new AbortController();
    card.ctl = ctl;
    const chosen = keys.map((k) => card.items.find((i) => i.key === k)!);
    const total = chosen.reduce((n, i) => n + i.size, 0) * 2;
    let before = 0;
    const tell = (done: number) => {
      if (!event.sender.isDestroyed()) event.sender.send(CHANNEL.cardProgress, { id, done, total });
    };
    let taken: Set<string>;
    try {
      taken = new Set(fs.readdirSync(dest));
    } catch {
      taken = new Set();
    }
    const results: ({ key: string; ok: true; file: ReturnType<typeof publicView> } | { key: string; ok: false; why: string })[] = [];
    try {
      for (const item of chosen) {
        const parts = item.parts.map((rel) => onCard(card.root, rel));
        if (ctl.signal.aborted || parts.some((p) => !p)) {
          results.push({ key: item.key, ok: false, why: ctl.signal.aborted ? 'cancelled' : 'gone' });
          continue;
        }
        const name = freeName(taken, item.name);
        taken.add(name);
        let last = 0;
        try {
          await copyVerified(parts as string[], path.join(dest, name), {
            signal: ctl.signal,
            onProgress: (n, phase) => {
              const now = Date.now();
              if (now - last < 200) return;
              last = now;
              tell(before + (phase === 'copy' ? n : item.size + n));
            },
          });
          const rec = files.add(path.join(dest, name));
          results.push(rec ? { key: item.key, ok: true, file: publicView(rec) } : { key: item.key, ok: false, why: 'failed' });
        } catch (e) {
          results.push({ key: item.key, ok: false, why: whyOf(e, ctl.signal) });
        }
        before += item.size * 2;
        tell(before);
      }
    } finally {
      card.ctl = null;
    }
    return { folder: nameOf(dest), results };
  });
  o.handle(CHANNEL.filesCancelCard, (_event, id: unknown) => {
    if (typeof id !== 'string' || !TOKEN.test(id)) throw refused();
    const c = cards.get(id);
    if (!c?.ctl) return false;
    c.ctl.abort();
    return true;
  });

  // --- «مسح بيانات هذا الجهاز» (D-11) ----------------------------------------------------------------
  /** What else stops before the data goes: the media jobs (native-media.ts) and a card's copy. */
  const stops: (() => void)[] = [
    () => {
      for (const c of cards.values()) c.ctl?.abort();
      cards.clear();
    },
  ];
  o.handle(CHANNEL.dataClear, async () => {
    for (const ctl of running.values()) ctl.abort();
    for (const stop of stops) stop();
    const removed = { files: files.clear(), cache: cache.clear().removed };
    await o.site.clearStorageData();
    await o.site.clearCache();
    // Every window goes back to the start: the session is gone, so the site asks to sign in again.
    setTimeout(o.reload, 200);
    return removed;
  });

  return { files, cache, onClear: (stop: () => void) => void stops.push(stop) };
}

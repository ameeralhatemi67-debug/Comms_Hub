// The bridge's `windows` group (Desktop_App_Plan.md 5.2, phase D6; MVP_draft.md 63.5), wired to Electron: the
// screens there are, and the studio's preview in a window of its own, placed on a screen and full screen when
// asked. The page names the panel and its project only; the address is built here on the page's own origin
// (windows.ts), so it is always the site's, and the window gets every rule of the site's windows (main.ts).
// Each window has at most one window per panel; asking again moves that one. A panel's window closes with
// the window that opened it. Keeping the two in step is the pages' own business, between two pages of the
// same address (src/lib/studio/preview-link.ts): nothing of the project passes through here.
import { BrowserWindow, screen } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { CHANNEL } from './ipc.ts';
import { isAllowed } from './origins.ts';
import type { Handle } from './native.ts';
import { centreOn, panelAddress, pickScreen, screensOf, type Panel, type Rect } from './windows.ts';

const refused = () => new Error('refused');

export function startWindows(o: { handle: Handle; allowed: readonly string[]; open: (url: string, bounds: Rect) => BrowserWindow }) {
  /** The panel windows of each opening window, by its web contents' id. */
  const panels = new Map<number, Map<Panel, BrowserWindow>>();
  const ownerOf = (event: IpcMainInvokeEvent) => BrowserWindow.fromWebContents(event.sender);
  const screens = (win: BrowserWindow | null) =>
    screensOf(screen.getAllDisplays(), screen.getPrimaryDisplay().id, win && !win.isDestroyed() ? screen.getDisplayMatching(win.getBounds()).id : null);

  function closeAll(openerId: number) {
    for (const win of panels.get(openerId)?.values() ?? []) if (!win.isDestroyed()) win.close();
    panels.delete(openerId);
  }

  o.handle(CHANNEL.windowsScreens, (event) => screens(ownerOf(event)));

  o.handle(CHANNEL.windowsPopOut, (event, ask: unknown) => {
    const a = (ask ?? {}) as { panel?: unknown; project?: unknown; screen?: unknown; full?: unknown };
    const page = event.senderFrame?.url ?? '';
    if (!isAllowed(page, o.allowed)) throw refused();
    const address = panelAddress(new URL(page).origin, a.panel, a.project);
    const opener = ownerOf(event);
    if (!address || !opener) throw refused();
    const target = pickScreen(screens(opener), a.screen);
    if (!target) throw refused();
    const panel = a.panel as Panel;
    const openerId = event.sender.id;
    let mine = panels.get(openerId);
    if (!mine) {
      mine = new Map();
      panels.set(openerId, mine);
      event.sender.once('destroyed', () => closeAll(openerId));
    }
    let win = mine.get(panel);
    if (!win || win.isDestroyed()) {
      win = o.open(address, centreOn(target));
      mine.set(panel, win);
      const own = win;
      win.once('closed', () => {
        if (panels.get(openerId)?.get(panel) === own) panels.get(openerId)?.delete(panel);
      });
    } else if (win.webContents.getURL() !== address) {
      void win.webContents.loadURL(address);
    }
    // onto the screen, then full screen there when asked
    if (win.isFullScreen()) win.setFullScreen(false);
    win.setBounds(centreOn(target));
    if (a.full === true) win.setFullScreen(true);
    win.show();
    win.focus();
    return { screen: target.id, full: a.full === true };
  });

  o.handle(CHANNEL.windowsClose, (event, panel: unknown) => {
    if (typeof panel !== 'string') throw refused();
    const win = panels.get(event.sender.id)?.get(panel as Panel);
    if (!win || win.isDestroyed()) return false;
    win.close();
    return true;
  });
}

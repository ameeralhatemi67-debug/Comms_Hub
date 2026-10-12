// The layer the help windows and the hold tip live in. It sits outside the page, so a
// re-render never removes it. While a modal dialog is open, everything outside it is
// out of reach, so the layer moves inside the dialog (still drawn over the whole screen).

let root: HTMLElement | null = null;

function topDialog(): HTMLElement | null {
  const open = Array.from(document.querySelectorAll('dialog[open]')) as HTMLElement[];
  for (let i = open.length - 1; i >= 0; i--) {
    try {
      if (open[i].matches(':modal')) return open[i];
    } catch {
      return open[i];
    }
  }
  return null;
}

export function layer(): HTMLElement {
  if (!root) {
    root = document.createElement('div');
    root.className = 'gdl';
    root.setAttribute('dir', 'rtl');
    root.setAttribute('lang', 'ar');
  }
  const host = topDialog() ?? document.body;
  if (root.parentElement !== host) host.appendChild(root);
  return root;
}

/** The one element of this kind in the layer, created if needed. */
export function layerEl(cls: string): HTMLElement {
  const l = layer();
  let e = l.querySelector(`:scope > .${cls}`) as HTMLElement | null;
  if (!e) {
    e = document.createElement('div');
    e.className = cls;
    l.appendChild(e);
  }
  return e;
}

export function layerRemove(cls: string) {
  root?.querySelectorAll(`:scope > .${cls}`).forEach((e) => e.remove());
}

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

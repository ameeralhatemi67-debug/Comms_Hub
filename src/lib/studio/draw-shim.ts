// What the compositor's modules expect of a page, inside an export drawing worker (export-draw.ts; Desktop_Power_Ideas.md
// P-07). They were written for a page and call `document.createElement('canvas')`, read `document.fonts`, and load
// pictures with `new Image()`. Here a canvas is an OffscreenCanvas, the fonts are the worker's own set, and an image
// is an OffscreenCanvas holding the decoded file, so drawing it draws the same pixels. Imported first by the worker,
// before any compositor module runs. Nothing else of a page is imitated: anything that needs more fails, and the
// export then draws on the page as before. Worker only.

type Listener = (() => void) | null;

class WorkerImage extends OffscreenCanvas {
  onload: Listener = null;
  onerror: Listener = null;
  naturalWidth = 0;
  naturalHeight = 0;
  complete = false;
  private url = '';

  constructor() {
    super(1, 1);
  }

  get src() {
    return this.url;
  }

  set src(url: string) {
    this.url = url;
    void (async () => {
      try {
        const res = await fetch(new URL(url, (self as unknown as { location: Location }).location.origin));
        if (!res.ok) throw new Error(String(res.status));
        const bmp = await createImageBitmap(await res.blob());
        this.width = bmp.width;
        this.height = bmp.height;
        this.naturalWidth = bmp.width;
        this.naturalHeight = bmp.height;
        const ctx = this.getContext('2d')!;
        ctx.clearRect(0, 0, bmp.width, bmp.height);
        ctx.drawImage(bmp, 0, 0);
        bmp.close();
        this.complete = true;
        this.onload?.();
      } catch {
        this.onerror?.();
      }
    })();
  }
}

const g = globalThis as unknown as { document?: unknown; Image?: unknown; fonts?: FontFaceSet };
if (typeof g.document === 'undefined') {
  g.document = {
    createElement(tag: string) {
      if (tag !== 'canvas') throw new Error(`no ${tag} in a drawing worker`);
      return new OffscreenCanvas(300, 150);
    },
    fonts: g.fonts,
  };
}
if (typeof g.Image === 'undefined') g.Image = WorkerImage;

export {};

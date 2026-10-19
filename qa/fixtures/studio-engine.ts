// Fixture of the studio's engine (Studio_Build_Plan.md Phase 3), bundled by qa/studio-engine.cjs with
// esbuild from the real src/lib/studio modules and the real motion renderers, and run in headless Edge.
// The page's server plays the site's file route (/api/media/<id>/content, byte ranges); the media are
// made by ffmpeg with known colours, so frames can be checked by their pixels.
import * as schema from '../../src/lib/studio/schema.ts';
import * as timeline from '../../src/lib/studio/timeline.ts';
import * as compose from '../../src/lib/studio/compose.ts';
import * as motion from '../../src/lib/studio/motion-adapter.ts';
import * as text from '../../src/lib/studio/text.ts';
import * as cache from '../../src/lib/studio/cache.ts';
import * as media from '../../src/lib/studio/media.ts';
import * as preview from '../../src/lib/studio/preview.ts';
import * as persist from '../../src/lib/studio/persist.ts';
import { loadAssets } from '../../src/lib/motion/renderers.js';

type Check = { name: string; pass: boolean; detail: string };
const US = schema.US;
export const RGB = '00000000-0000-4000-8000-0000000000a1';
export const RGB2 = '00000000-0000-4000-8000-0000000000a2';
export const PNG = '00000000-0000-4000-8000-0000000000b1';

const px = (ctx: CanvasRenderingContext2D, x: number, y: number) => Array.from(ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data);
const near = (a: number[], b: number[], tol = 48) => a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= tol);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitReady(pool: media.MediaPool, ids: string[], ms = 20000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const states = ids.map((id) => pool.state(id)?.kind);
    if (states.every((s) => s === 'ready' || s === 'missing' || s === 'error')) return states;
    await sleep(50);
  }
  return ids.map((id) => pool.state(id)?.kind);
}

export async function run(): Promise<{ checks: Check[]; log: string[] }> {
  const checks: Check[] = [];
  const log: string[] = [];
  const check = (name: string, pass: boolean, detail: unknown = '') => checks.push({ name, pass: !!pass, detail: String(detail) });

  // a clean device cache for the run
  const root = await navigator.storage.getDirectory();
  for (const d of [cache.CACHE_DIR, cache.LOCAL_DIR, 'studio-manifest.json']) await root.removeEntry(d, { recursive: true }).catch(() => undefined);

  await loadAssets();
  for (const k of schema.STICKERS) await motion.loadSticker(k);
  const fontsOk = await text.loadFonts([{ font: 'IBM Plex Sans Arabic', weight: 600 }, { font: 'Reem Kufi', weight: 600 }, { font: 'Aref Ruqaa', weight: 700 }]);
  check('the shipped Arabic fonts load with Arabic sample text', fontsOk, fontsOk);

  const dc = await cache.DeviceCache.open();
  check('the browser\'s private storage opens for the device cache', !!dc);
  const reqs = (): string[] => (window as unknown as { __requests: string[] }).__requests;

  // ---------------------------------------------------------------- media and the compositor
  const pool = new media.MediaPool({ cache: dc, onChange: () => undefined });
  let doc = schema.newVideoDoc('16:9', 30);
  let r = timeline.addSource(doc, { kind: 'library', asset: RGB, version: 1, name: 'ألوان.mp4', media: 'video', duration: 6 * US });
  doc = r.doc;
  const vid = r.id;
  r = timeline.addSource(doc, { kind: 'library', asset: PNG, version: 1, name: 'صورة.png', media: 'image' });
  doc = r.doc;
  const img = r.id;
  pool.ensure(doc);
  const states = await waitReady(pool, [vid, img]);
  check('library sources are copied to the device and made ready', states.every((s) => s === 'ready'), states.join(','));
  const info = pool.info(vid)!;
  check('the exact length and size are read from the file by Mediabunny', info.duration! > 5.9 * US && info.duration! < 6.1 * US && info.w === 640 && info.h === 360, JSON.stringify(info));
  const firstCopyRequests = reqs().filter((u) => u.includes(RGB)).length;
  check('the copy went through the file route with byte ranges', firstCopyRequests >= 1 && reqs().some((u) => u.includes(RGB) && u.includes('range=bytes=0-')), reqs().filter((u) => u.includes(RGB)).join(' | '));

  const a = timeline.addClip(doc, { source: vid, start: 0, length: 6 * US, in: 0 });
  doc = a.doc;
  const W = 1920;
  const H = 1080;
  const scale = 0.25;
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const mr = new motion.MotionRenderer();
  const draw = async (d: schema.ProjectDoc, t: number, opts: { transparent?: boolean } = {}) => {
    const frames = new Map<string, CanvasImageSource | null>();
    for (const { clip } of timeline.visibleAt(d, t)) {
      const s = d.sources.find((x) => x.id === clip.source);
      if (s?.media === 'video') {
        const f = await pool.frameAt(s.id, (clip.in ?? 0) + (t - clip.start));
        // copy: the decoder's canvases are reused
        if (f) {
          const c = document.createElement('canvas');
          c.width = (f as HTMLCanvasElement).width;
          c.height = (f as HTMLCanvasElement).height;
          c.getContext('2d')!.drawImage(f, 0, 0);
          frames.set(clip.id, c);
        }
      }
    }
    const res: compose.Resolver = { motion: mr, image: (id) => pool.image(id), videoFrame: (_id, _at, clipId) => (clipId ? frames.get(clipId) ?? null : null) };
    compose.composeFrame(ctx, d, t, res, { scale, ...opts });
  };
  await draw(doc, 1 * US);
  const c1 = px(ctx, canvas.width / 2, canvas.height / 2);
  await draw(doc, 3 * US);
  const c3 = px(ctx, canvas.width / 2, canvas.height / 2);
  await draw(doc, 5 * US);
  const c5 = px(ctx, canvas.width / 2, canvas.height / 2);
  check('the composed frame shows the source\'s own colour at 1 s, 3 s and 5 s (red, green, blue)', near(c1, [255, 0, 0]) && near(c3, [0, 255, 0]) && near(c5, [0, 0, 255]), JSON.stringify([c1, c3, c5]));

  // split exactly on the colour change at 2 s: frame 59 red, frame 60 green, the second part continues
  const sp = timeline.splitClip(doc, a.clipId, 2 * US);
  await draw(sp.doc, 2 * US - Math.round(US / 30));
  const before = px(ctx, canvas.width / 2, canvas.height / 2);
  await draw(sp.doc, 2 * US);
  const after = px(ctx, canvas.width / 2, canvas.height / 2);
  check('a split on a frame boundary: the last frame of the first part and the first of the second are exact', near(before, [255, 0, 0]) && near(after, [0, 255, 0]), JSON.stringify([before, after]));
  // the second part moved later still starts where the first stopped in the source
  const moved = timeline.moveClip(sp.doc, sp.secondId!, 2.5 * US);
  await draw(moved, 2.5 * US);
  check('the second part, moved, still starts at its place in the source', near(px(ctx, canvas.width / 2, canvas.height / 2), [0, 255, 0]), JSON.stringify(px(ctx, canvas.width / 2, canvas.height / 2)));

  // a picture above the video, placed and scaled
  const b = timeline.addClip(doc, { source: img, start: 0, length: 6 * US, transform: { x: W * 0.25, y: H * 0.5, scale: 0.3, rotation: 0, opacity: 1 } });
  await draw(b.doc, 1 * US);
  const onPic = px(ctx, W * 0.25 * scale, H * 0.5 * scale);
  const offPic = px(ctx, W * 0.75 * scale, H * 0.5 * scale);
  check('a picture is drawn where it is placed, at its size, over the video', near(onPic, [255, 0, 255]) && near(offPic, [255, 0, 0]), JSON.stringify([onPic, offPic]));
  const half = timeline.updateClip(b.doc, b.clipId, (c) => ({ ...c, transform: { ...c.transform!, opacity: 0.5 } }));
  await draw(half, 1 * US);
  const mixed = px(ctx, W * 0.25 * scale, H * 0.5 * scale);
  check('opacity mixes the picture with the video', near(mixed, [255, 0, 128], 40), JSON.stringify(mixed));

  // a frame template above: its window is real transparency, the video shows through
  const g = motion.graphicById('fr-arch')!;
  const fr = timeline.addClip(doc, { ...motion.motionClip(g, '16:9', 0), length: 6 * US });
  await draw(fr.doc, 5 * US);
  const p = motion.motionParams(g, {}, '16:9');
  const win = g.winBox!(p);
  const d = motion.motionDims(g, p);
  const k = (W / d.w) * scale;
  const inside = px(ctx, (win.x + win.w / 2) * k, (win.y + win.h / 2) * k);
  const margin = win.x > d.w - win.x - win.w ? { x: win.x / 2, y: win.y + win.h / 2 } : win.y > 30 ? { x: win.x + win.w / 2, y: win.y / 2 } : { x: (win.x + win.w + d.w) / 2, y: win.y + win.h / 2 };
  const outside = px(ctx, margin.x * k, margin.y * k);
  check('a frame template shows the video through its window and draws over the rest', near(inside, [0, 0, 255]) && !near(outside, [0, 0, 255], 30), JSON.stringify({ inside, outside, win }));

  // a number template on transparency
  const n = timeline.addClip(schema.newVideoDoc('16:9', 30), motion.motionClip(motion.graphicById('count-up')!, '16:9', 0));
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  await draw(n.doc, 3.4 * US, { transparent: true });
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let drawn = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) drawn++;
  check('a number template draws on transparency (the rest stays transparent)', drawn > 500 && drawn < data.length / 4, `${drawn} of ${data.length / 4} pixels`);

  // Arabic text: the shipped font is used, and the words land in their box
  ctx.font = text.fontOf({ font: 'IBM Plex Sans Arabic', weight: 600, size: 120 });
  const plex = ctx.measureText('مركز الاتصال المؤسسي').width;
  ctx.font = '600 120px serif';
  const serif = ctx.measureText('مركز الاتصال المؤسسي').width;
  check('the text is measured in IBM Plex Sans Arabic, not a fallback', Math.abs(plex - serif) > 5, `${plex.toFixed(1)} against ${serif.toFixed(1)}`);
  const tx = timeline.addClip(schema.newVideoDoc('16:9', 30), { start: 0, length: 3 * US, text: { ...text.defaultText('مركز الاتصال المؤسسي'), color: '#ffffff', shadow: null, enter: 'none', exit: 'none', size: 120 } });
  await draw(tx.doc, US);
  const tdata = ctx.getImageData(0, (canvas.height / 2) - 30, canvas.width, 60).data;
  let white = 0;
  for (let i = 0; i < tdata.length; i += 4) if (tdata[i] > 200 && tdata[i + 1] > 200 && tdata[i + 2] > 200) white++;
  check('Arabic text is drawn in the middle of the frame', white > 400, `${white} white pixels`);
  const enter = timeline.addClip(schema.newVideoDoc('16:9', 30), { start: 0, length: 3 * US, text: { ...text.defaultText('عنوان'), color: '#ffffff', shadow: null, enter: 'fade', exit: 'fade' } });
  await draw(enter.doc, 50_000);
  const early = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let earlyWhite = 0;
  for (let i = 0; i < early.length; i += 4) if (early[i] > 200) earlyWhite++;
  check('a text fading in is barely visible at its first frames', earlyWhite < 50, `${earlyWhite} bright pixels at 0.05 s`);

  // ---------------------------------------------------------------- transitions and movements (MVP_draft.md 62.3)
  // two clips meeting at 2 s (red, then green from the source's 2 s), with a 1 s transition: they overlap
  // from 1 s to 2 s, and at 1.5 s the transition is half way
  const pair = (kind: string) => {
    const s2 = timeline.splitClip(doc, a.clipId, 2 * US);
    return timeline.setTransition(s2.doc, s2.secondId!, US, kind as never);
  };
  const at15 = async (kind: string) => {
    await draw(pair(kind), 1.5 * US);
    return { left: px(ctx, canvas.width * 0.2, canvas.height / 2), right: px(ctx, canvas.width * 0.8, canvas.height / 2), mid: px(ctx, canvas.width / 2, canvas.height / 2), corner: px(ctx, 4, 4) };
  };
  const push = await at15('push-left');
  check('a push from the right, half way: the incoming clip fills the right half and the outgoing the left', near(push.right, [0, 255, 0]) && near(push.left, [255, 0, 0]), JSON.stringify(push));
  const wipe = await at15('wipe-left');
  check('a wipe from the right, half way: the incoming clip shows on the right, the outgoing on the left', near(wipe.right, [0, 255, 0]) && near(wipe.left, [255, 0, 0]), JSON.stringify(wipe));
  const dip = await at15('dip-black');
  check('a dip to black covers the frame in black at its middle', near(dip.mid, [0, 0, 0], 20), JSON.stringify(dip));
  const iris = await at15('iris');
  check('a circle transition shows the incoming clip in the middle and the outgoing in the corner', near(iris.mid, [0, 255, 0]) && near(iris.corner, [255, 0, 0]), JSON.stringify(iris));
  const fade = await at15('fade');
  check('a cross-fade is still drawn as before: half of each at its middle', near(fade.mid, [128, 128, 0], 40), JSON.stringify(fade));
  await draw(pair('push-left'), 2.2 * US);
  check('after the transition the incoming clip is whole', near(px(ctx, canvas.width * 0.2, canvas.height / 2), [0, 255, 0]), JSON.stringify(px(ctx, canvas.width * 0.2, canvas.height / 2)));

  // an entry movement: a picture sliding in from the right is to the right of its place early on
  const centroid = () => {
    const row = ctx.getImageData(0, Math.round(canvas.height / 2), canvas.width, 1).data;
    let sum = 0;
    let n2 = 0;
    for (let x = 0; x < canvas.width; x++) if (row[x * 4 + 2] > 120 && row[x * 4] > 120) (sum += x, n2++);
    return n2 ? sum / n2 : -1;
  };
  const slid = timeline.updateClip(b.doc, b.clipId, { animIn: { kind: 'slide-left', length: US }, animOut: { kind: 'zoom-out', length: US } });
  await draw(slid, 0.3 * US);
  const early2 = centroid();
  await draw(slid, 3 * US);
  const settled = centroid();
  check('a picture entering with a slide from the right is right of its place at 0.3 s and in place after', early2 > settled + canvas.width * 0.05 && Math.abs(settled - W * 0.25 * scale) < 8, `${early2.toFixed(1)} then ${settled.toFixed(1)}`);

  // a text revealed letter by letter has fewer letters drawn half way than at the end
  const brightIn = () => {
    const dd = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let c = 0;
    for (let i = 0; i < dd.length; i += 4) if (dd[i] > 200 && dd[i + 1] > 200 && dd[i + 2] > 200) c++;
    return c;
  };
  const typed = timeline.addClip(schema.newVideoDoc('16:9', 30), { start: 0, length: 3 * US, animIn: { kind: 'typewriter', length: 2 * US }, animOut: null, text: { ...text.defaultText('مركز الاتصال المؤسسي'), color: '#ffffff', shadow: null, size: 120 } });
  await draw(typed.doc, 0.9 * US);
  const halfTyped = brightIn();
  await draw(typed.doc, 2.5 * US);
  const allTyped = brightIn();
  check('a text written letter by letter shows part of its letters half way and all of them at the end', halfTyped > 50 && halfTyped < allTyped * 0.8, `${halfTyped} then ${allTyped}`);

  // the added fonts: an Arabic one and an English one load from the site and are used
  const addedOk = await text.loadFonts([{ font: 'Cairo', weight: 700 }, { font: 'Bebas Neue', weight: 400 }, { font: 'Amiri', weight: 400 }]);
  ctx.font = text.fontOf({ font: 'Cairo', weight: 700, size: 120 });
  const cairo = ctx.measureText('مركز الاتصال المؤسسي').width;
  ctx.font = text.fontOf({ font: 'IBM Plex Sans Arabic', weight: 700, size: 120 });
  const plex7 = ctx.measureText('مركز الاتصال المؤسسي').width;
  ctx.font = text.fontOf({ font: 'Bebas Neue', weight: 400, size: 120 });
  const bebas = ctx.measureText('CORPORATE COMMS').width;
  ctx.font = '400 120px serif';
  const serifL = ctx.measureText('CORPORATE COMMS').width;
  check('added fonts load from the site (Cairo, Bebas Neue, Amiri) and are used for drawing', addedOk && Math.abs(cairo - plex7) > 5 && Math.abs(bebas - serifL) > 20, `${addedOk} Cairo ${cairo.toFixed(0)} / Plex ${plex7.toFixed(0)}; Bebas ${bebas.toFixed(0)} / serif ${serifL.toFixed(0)}`);

  // a brand mark, tinted
  const mark = motion.sticker('emblem', '#ff0000');
  const mctx = mark?.getContext('2d');
  const mid = mctx ? Array.from(mctx.getImageData(0, 0, mark!.width, mark!.height).data).filter((_, i) => i % 4 === 0 && _ > 200).length : 0;
  check('a brand mark is tinted in its colour', mid > 1000, `${mid} red pixels`);

  // ---------------------------------------------------------------- the device cache
  const before2 = reqs().filter((u) => u.includes(RGB)).length;
  const pool2 = new media.MediaPool({ cache: dc, onChange: () => undefined });
  pool2.ensure(doc);
  await waitReady(pool2, [vid]);
  check('a second open reads the copy from the device: no new request', reqs().filter((u) => u.includes(RGB)).length === before2, `${before2} then ${reqs().filter((u) => u.includes(RGB)).length}`);
  pool2.dispose();

  // a partial copy resumes where it stopped
  const original = new Uint8Array(await (await fetch('/media/rgb.mp4')).arrayBuffer());
  const dir = await root.getDirectoryHandle(cache.CACHE_DIR, { create: true });
  const part = await dir.getFileHandle(cache.libraryName(RGB2, 1), { create: true });
  const w = await part.createWritable();
  await w.write(original.slice(0, 50_000));
  await w.close();
  const resumed = await dc!.libraryFile(RGB2, 1, `/api/media/${RGB2}/content?v=1`);
  const got = new Uint8Array(await resumed.arrayBuffer());
  const same = got.length === original.length && got.every((v, i) => v === original[i]);
  check('a partial copy resumes from its last byte and ends identical to the original', same && reqs().some((u) => u.includes(RGB2) && u.includes('range=bytes=50000-')), `${got.length} of ${original.length} bytes; ${reqs().filter((u) => u.includes(RGB2)).join(' | ')}`);

  // the ten-day sweep and the manual clear leave what is in use
  const entries = (dc as unknown as { manifest: cache.Manifest }).manifest.entries;
  entries[cache.libraryName(RGB2, 1)].lastUsed = Date.now() - cache.TEN_DAYS - 1000;
  entries[cache.libraryName(RGB, 1)].lastUsed = Date.now() - cache.TEN_DAYS - 1000;
  const swept = await dc!.sweep(new Set([cache.libraryName(RGB, 1)]));
  const stillThere = await dc!.cachedLibraryFile(RGB, 1);
  check('the ten-day sweep removes old copies and leaves the one in use', swept.removed === 1 && !!stillThere && !(await dc!.cachedLibraryFile(RGB2, 1)), JSON.stringify(swept));

  // a file from this device, kept by its fingerprint
  const blob = await (await fetch('/media/pic.png')).blob();
  const file = new File([blob], 'صورتي.png', { type: 'image/png', lastModified: 1 });
  const kept = await dc!.putLocal(file);
  const back = await dc!.localFile(kept.key);
  check('a file from this device is kept under its fingerprint and read back', !!back && back.size === file.size && /^[0-9a-f]{64}$/.test(kept.key), kept.key);
  await dc!.libraryFile(RGB2, 1, `/api/media/${RGB2}/content?v=1`);
  const cleared = await dc!.clearLibrary(pool.inUse(doc));
  check('«حذف ملفات المعاينة المؤقتة» removes the library copies not in use, keeps the one in use and the device files', cleared.removed === 1 && !!(await dc!.cachedLibraryFile(RGB, 1)) && !(await dc!.cachedLibraryFile(RGB2, 1)) && !!(await dc!.localFile(kept.key)), JSON.stringify(cleared));

  // the crash draft in IndexedDB
  const drafts = persist.browserDrafts();
  await drafts.put('p-test', { doc, base: 3, at: 123 });
  const dr = await drafts.get('p-test');
  check('a draft is kept in IndexedDB and read back whole', !!dr && dr.base === 3 && dr.doc.sources.length === doc.sources.length, dr ? dr.base : 'none');
  await drafts.delete('p-test');

  // ---------------------------------------------------------------- the player
  const view = document.createElement('canvas');
  view.width = 480;
  view.height = 270;
  document.body.append(view);
  const pl = new preview.Player({ canvas: view, pool, motion: mr, getDoc: () => doc, scale: () => 480 / W, onTime: () => undefined });
  pl.seek(3 * US);
  await sleep(400);
  pl.draw();
  const paused = px(view.getContext('2d')!, 240, 135);
  check('paused, the preview shows the exact frame from the decoder', near(paused, [0, 255, 0]), JSON.stringify(paused));
  pl.play();
  await sleep(700);
  const tPlayed = pl.t;
  pl.pause();
  check('playing advances the playhead in real time and pause stops it', tPlayed > 3.4 * US && tPlayed < 4.2 * US && !pl.playing, `${(tPlayed / US).toFixed(2)} s`);
  pl.dispose();
  pool.dispose();
  log.push(`requests: ${reqs().length}`);
  return { checks, log };
}

(window as unknown as { studioEngine: typeof run }).studioEngine = run;

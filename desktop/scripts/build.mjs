// Compiles the application with esbuild (Desktop_App_Plan.md 7.1): src/main.ts and src/preload.ts into
// one file each, with the build's kind and version compiled in, the media jobs' utility process (D5) with
// the pinned FFmpeg's tag, the two Arabic pages beside them with the
// brand mark filled in, the brand mark as a picture for the tray and the notices (D2), and the licence of
// every package bundled into the code (THIRD_PARTY_LICENSES.txt, shipped beside the application). Three kinds:
// release; dev (the local site on the list, developer tools); and qa, the release build under its own id
// with a version and an update feed on this laptop, built only by qa/desktop-update.cjs (D3). A release build holds the production address only; esbuild drops the
// development address and every development branch from it.
// Usage: node scripts/build.mjs release|dev   (writes build/; qa is built by its check)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = path.resolve(desktop, '..');
const PAGES = ['offline.html', 'connect-note.html'];
export const LICENSES = 'THIRD_PARTY_LICENSES.txt';

/** The licence of every npm package esbuild bundled (their own comments are not kept in the bundle). */
function licenses(metafiles) {
  const names = new Set();
  for (const meta of metafiles) for (const input of Object.keys(meta.inputs)) {
    const m = /node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(input);
    if (m) names.add(input.slice(0, m.index) + 'node_modules/' + m[1]);
  }
  const parts = [];
  for (const dir of [...names].sort((a, b) => path.basename(a).localeCompare(path.basename(b)))) {
    const abs = path.resolve(desktop, dir);
    const pkg = JSON.parse(fs.readFileSync(path.join(abs, 'package.json'), 'utf8'));
    const file = fs.readdirSync(abs).find((f) => /^licen[cs]e(\.(md|txt))?$/i.test(f));
    const text = file ? fs.readFileSync(path.join(abs, file), 'utf8').trim() : `Licensed under the ${pkg.license} licence (package.json); the package carries no licence file. Source: ${typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url ?? 'npm'}`;
    parts.push(`${pkg.name} ${pkg.version} (${pkg.license})

${text}`);
  }
  return `Packages bundled into the application's code (Comms Hub desktop), with their licences.
Electron's and Chromium's notices are in LICENSE.electron.txt and LICENSES.chromium.html; FFmpeg's in ffmpeg/LICENSE.txt.

${parts.join(`

${'-'.repeat(72)}

`)}
`;
}

/** Builds one kind ('release', 'dev' or 'qa') into `outdir`. Returns the files written. */
export async function buildApp(flavour, outdir = path.join(desktop, 'build'), qa = {}) {
  if (!['release', 'dev', 'qa'].includes(flavour)) throw new Error(`unknown build kind: ${flavour}`);
  if (flavour === 'qa' && (!/^\d+\.\d+\.\d+$/.test(qa.version ?? '') || !/^http:\/\/127\.0\.0\.1:\d+\//.test(qa.feed ?? ''))) {
    throw new Error('the update check\'s package needs a version and a feed on this laptop');
  }
  const version = flavour === 'qa' ? qa.version : JSON.parse(fs.readFileSync(path.join(desktop, 'package.json'), 'utf8')).version;
  const ffmpeg = JSON.parse(fs.readFileSync(path.join(desktop, 'ffmpeg.lock.json'), 'utf8'));
  if (!/^[a-z0-9]{1,16}$/.test(ffmpeg.tag ?? '')) throw new Error('ffmpeg.lock.json has no tag');
  fs.rmSync(outdir, { recursive: true, force: true });
  fs.mkdirSync(outdir, { recursive: true });
  const common = {
    bundle: true,
    format: 'cjs',
    external: ['electron'],
    define: {
      __COMMS_HUB_DEV__: String(flavour === 'dev'),
      __COMMS_HUB_QA__: String(flavour === 'qa'),
      __APP_VERSION__: JSON.stringify(version),
      __UPDATE_FEED__: flavour === 'qa' ? JSON.stringify(qa.feed) : 'null',
      __FFMPEG_TAG__: JSON.stringify(ffmpeg.tag),
    },
    minifySyntax: true,
    legalComments: 'none',
    logLevel: 'warning',
    charset: 'utf8',
  };
  const main = await esbuild.build({ ...common, metafile: true, entryPoints: [path.join(desktop, 'src', 'main.ts')], platform: 'node', target: 'node24', outfile: path.join(outdir, 'main.js') });
  // The utility process runs FFmpeg's jobs (D5): Node.js, no Electron module.
  const worker = await esbuild.build({ ...common, metafile: true, entryPoints: [path.join(desktop, 'src', 'media-worker.ts')], platform: 'node', target: 'node24', outfile: path.join(outdir, 'media-worker.js') });
  // The preload runs sandboxed: no Node.js, only Electron's own modules.
  await esbuild.build({ ...common, entryPoints: [path.join(desktop, 'src', 'preload.ts')], platform: 'browser', target: 'chrome150', outfile: path.join(outdir, 'preload.js') });
  const logo = fs.readFileSync(path.join(site, 'public', 'brand', 'comms-hub-logo.svg'), 'utf8').trim();
  for (const page of PAGES) {
    const html = fs.readFileSync(path.join(desktop, 'src', page), 'utf8').replace('<!-- logo -->', logo);
    fs.writeFileSync(path.join(outdir, page), html);
  }
  fs.copyFileSync(path.join(site, 'public', 'brand', 'comms-hub-logo-120.png'), path.join(outdir, 'icon.png'));
  fs.writeFileSync(path.join(outdir, LICENSES), licenses([main.metafile, worker.metafile]));
  return ['main.js', 'preload.js', 'media-worker.js', ...PAGES, 'icon.png', LICENSES].map((name) => path.join(outdir, name));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flavour = process.argv[2] ?? 'release';
  const files = await buildApp(flavour);
  console.log(`built ${flavour}: ${files.map((f) => path.relative(desktop, f)).join(', ')}`);
}

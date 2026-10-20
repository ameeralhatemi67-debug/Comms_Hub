// Compiles the application with esbuild (Desktop_App_Plan.md 7.1): src/main.ts and src/preload.ts into
// one file each, with the build's kind and version compiled in, the two Arabic pages beside them with the
// brand mark filled in, and the brand mark as a picture for the tray and the notices (D2). Three kinds:
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

/** Builds one kind ('release', 'dev' or 'qa') into `outdir`. Returns the files written. */
export async function buildApp(flavour, outdir = path.join(desktop, 'build'), qa = {}) {
  if (!['release', 'dev', 'qa'].includes(flavour)) throw new Error(`unknown build kind: ${flavour}`);
  if (flavour === 'qa' && (!/^\d+\.\d+\.\d+$/.test(qa.version ?? '') || !/^http:\/\/127\.0\.0\.1:\d+\//.test(qa.feed ?? ''))) {
    throw new Error('the update check\'s package needs a version and a feed on this laptop');
  }
  const version = flavour === 'qa' ? qa.version : JSON.parse(fs.readFileSync(path.join(desktop, 'package.json'), 'utf8')).version;
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
    },
    minifySyntax: true,
    legalComments: 'none',
    logLevel: 'warning',
    charset: 'utf8',
  };
  await esbuild.build({ ...common, entryPoints: [path.join(desktop, 'src', 'main.ts')], platform: 'node', target: 'node24', outfile: path.join(outdir, 'main.js') });
  // The preload runs sandboxed: no Node.js, only Electron's own modules.
  await esbuild.build({ ...common, entryPoints: [path.join(desktop, 'src', 'preload.ts')], platform: 'browser', target: 'chrome150', outfile: path.join(outdir, 'preload.js') });
  const logo = fs.readFileSync(path.join(site, 'public', 'brand', 'comms-hub-logo.svg'), 'utf8').trim();
  for (const page of PAGES) {
    const html = fs.readFileSync(path.join(desktop, 'src', page), 'utf8').replace('<!-- logo -->', logo);
    fs.writeFileSync(path.join(outdir, page), html);
  }
  fs.copyFileSync(path.join(site, 'public', 'brand', 'comms-hub-logo-120.png'), path.join(outdir, 'icon.png'));
  return ['main.js', 'preload.js', ...PAGES, 'icon.png'].map((name) => path.join(outdir, name));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flavour = process.argv[2] ?? 'release';
  const files = await buildApp(flavour);
  console.log(`built ${flavour}: ${files.map((f) => path.relative(desktop, f)).join(', ')}`);
}

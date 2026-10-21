# Comms Hub desktop application

The Windows application «مركز الاتصال المؤسسي» of `Desktop_App_Plan.md`, phase D1, specified for the
person in `MVP_draft.md` section 63. It is an Electron shell that opens the live site,
`https://comms-hub-three.vercel.app`, in its own window, with a small, locked native layer. It is not a
copy of the site: every page, rule and check stays the website's.

## What it does and does not do

- **Opens one address.** The list is compiled in: the production address in a release build, plus
  `http://127.0.0.1:3000` in a development build. Nothing widens it in a release build.
- **Sends everything else out.** Other web addresses and mail links open in the system browser or mail
  program. `/api/drive/connect`, `/api/onedrive/connect` and `/api/platforms/connect/*` open in the system
  browser after an Arabic note. Every other kind of address is refused.
- **Grants five permissions, to the list only:** microphone (never the camera), notifications,
  clipboard, full screen, file access. Everything else is refused.
- **Holds no secret.** Signing in is the site's form. The session is the site's cookie in the
  application's own profile, `%APPDATA%\sa.commshub.desktop`, encrypted by Windows. There is no sign-in
  bypass, stored password or service key, in the application or in its checks.
- **Bridge.** `window.commsHubNative`, exposed only on a top-level page on the list: who the application is
  (`platform`, `shell`, `version`, `bridge`), then `info`, `power`, `life` and `notify` (version 1, D2),
  `update` (2, D3), `files`, `cache` and `data` (3, D4), `media` (4, D5), and `windows` (5, D6). Every
  handler is registered through `src/sender.ts`'s `guard()` (`src/native.ts`, `src/native-files.ts`,
  `src/native-media.ts`, `src/native-windows.ts`).
- **Files in place and the cache folder** (D4). A chosen file becomes a token (`src/file-store.ts`), never a
  path in the page; the page reads it, and the library copies in the cache folder (`src/cache-store.ts`),
  at `commshub-file://` (`src/protocol.ts`), read-only and in byte ranges.
- **Light and editable copies** (D5). FFmpeg runs in a utility process (`src/media-worker.ts`) with the fixed
  jobs of `src/media-jobs.ts` only: a probe, a 720p or 1080p light copy for the preview, and an editable
  H.264 copy of what the browser cannot decode, written into the cache folder. The jobs name Windows' own
  encoders (`h264_mf`, `aac_mf`). The build is LGPL v3, pinned by hash in `ffmpeg.lock.json`
  (`THIRD_PARTY_NOTICES.md` at the repository root).
- **Keys.** It takes only Ctrl with + - 0 (zoom), F11 (full screen) and F5 (reload); F12 opens the
  developer tools in a development build only. Every other key is the page's.

The fixed internal id is `sa.commshub.desktop`. It names the Windows application id, the uninstall
entry and the data folder, and it never changes. It names no host and is never looked up.

## Files

| File | Holds |
|---|---|
| `src/main.ts` | The main process: the window, the session, the rules wired to Electron. |
| `src/preload.ts` | The bridge, on the list only, never in frames. |
| `src/compiled.ts` | What a build fixes: development or release, the version, the list. |
| `src/origins.ts` | The address list and the check against it. |
| `src/navigation.ts` | Where a link, redirect or new window goes; the connection note; failed loads. |
| `src/permissions.ts` | Which permission is granted to whom. |
| `src/keys.ts` | The application's keys and the zoom steps. |
| `src/window-state.ts` | Where the window opens. |
| `src/sender.ts` | The sender check every future bridge handler must pass. |
| `src/switches.ts` | Command-line switches the application refuses to start with. |
| `src/downloads.ts` | The save dialog's folder and file name. |
| `src/identity.ts` | The fixed id, the name, the data folder, the user agent. |
| `src/offline.html` | The Arabic connection screen. |
| `src/connect-note.html` | The Arabic note before an outside connection. |
| `src/files.ts`, `src/file-store.ts`, `src/cache-store.ts`, `src/protocol.ts`, `src/range.ts`, `src/native-files.ts` | Files used in place, the cache folder and `commshub-file://` (D4). |
| `src/media-jobs.ts`, `src/media-worker.ts`, `src/native-media.ts` | FFmpeg's fixed jobs, the utility process that runs them, and the bridge's `media` group (D5). |
| `src/windows.ts`, `src/native-windows.ts` | The screens, and a studio panel's own window on one of them (D6). |
| `ffmpeg.lock.json`, `scripts/fetch-ffmpeg.mjs` | The pinned FFmpeg build, and its download into `vendor/ffmpeg` with the size and SHA-256 checked before it is opened. |
| `scripts/build.mjs` | esbuild: `src/` into `build/`, with `THIRD_PARTY_LICENSES.txt` for the bundled packages. |
| `electron-builder.release.cjs` | The release package: NSIS, x64, per user, Arabic, fuses. |
| `electron-builder.dev.cjs` | The development package, unpacked only, for the checks. |
| `tests/*.test.mjs` | Unit tests of every rule, the bundles, the pages and the packaging. |

## Build and check

Run these in this folder, on Windows. `node_modules/`, `build/`, `dist/` and `vendor/` are ignored by git,
and Vercel never uploads this folder (`.vercelignore`). Both `pack` scripts first run `npm run ffmpeg`, which
downloads the pinned FFmpeg build once (about 77 MB, from the BtbN/FFmpeg-Builds release named in
`ffmpeg.lock.json`) and refuses any file whose size or SHA-256 differs; a `vendor/ffmpeg` already matching
the pin is kept.

```bash
npm ci
```

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run pack
```

`npm run pack` writes `dist/release/CommsHub-Setup-<version>-x64.exe` and `dist/release/win-unpacked/`.
`npm run pack:dev` writes the development package to `dist/dev/win-unpacked/`. To read the release
package's fuses back:

```bash
npm run fuses
```

`npm test` also runs the jobs' recipes against `vendor/ffmpeg` once it has been fetched (`tests/media-jobs.test.mjs`).
`node qa/desktop-media.cjs` checks the media tools inside the development package. It needs a local ffmpeg
with libx264, libx265, prores_ks, dnxhd, mpeg2video and ac3, used only to make its test files.

The application check drives both packages. Build both first, then run it from the repository root:

```bash
node qa/desktop-shell.cjs
```

It writes `qa/desktop-shell.json`. It installs the release package silently, runs it and uninstalls it
again, but only when this laptop has no installation or profile of the application. Otherwise it skips
that part and touches nothing.

## Updates and publishing a release

The application updates itself (D3) from the public bucket `desktop-releases` of the `comms-hub` Supabase
project, folder `windows-x64/`. It reads `latest.yml` there when it starts and every four hours, downloads a
newer installer in the background, checks its SHA-512, and installs it when the person quits (or at once with
«إعادة التشغيل للتحديث»). «تطبيق سطح المكتب» on «الحساب» links to the same installer.

Publishing is the owner's alone; nothing is uploaded by the site or by an agent. The first time:

1. In the Supabase dashboard of `comms-hub`, Storage, Settings: raise the upload size limit above 300 MB
   (an installer is about 110 MB).
2. Apply `supabase/migrations/20261021090000_desktop_releases.sql`. It creates the public bucket, which no
   visitor or signed-in person can write to.

Each release:

1. Raise `version` in `package.json` (and the lockfile's two copies of it), then `npm run pack`.
2. Upload these three files from `dist/release/` to `desktop-releases/windows-x64/`, the installer first and
   `latest.yml` last, so no application sees a manifest before its file:
   - `CommsHub-Setup-<version>-x64.exe`;
   - `CommsHub-Setup-<version>-x64.exe.blockmap`;
   - `latest.yml`, replacing the old one.

An application that is open looks within four hours; one that starts looks at once. The update check,
`node qa/desktop-update.cjs`, proves the same path on this laptop with its own package
(`electron-builder.qa.cjs`, id `sa.commshub.desktop.qa`) and a local feed, and never touches a real
installation.

## Installing the pilot build

1. Copy `CommsHub-Setup-0.1.0-x64.exe` to the laptop and open it.
2. The build is not signed, so SmartScreen warns once: choose "More info", then "Run anyway".
3. It installs for this user only, without administrator rights, and adds a Start menu and a desktop
   shortcut named «مركز الاتصال المؤسسي».

A newer version arrives by itself once releases are published; until then, run its installer over the old one. The session is kept either way. Uninstalling from
Windows' settings removes the program and the application's data on this laptop, the session included
(decision D-11).

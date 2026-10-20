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
- **Bridge.** `window.commsHubNative` is `{ platform: 'desktop', shell: 'electron', version, bridge: 1 }`,
  exposed only on a top-level page on the list. D1 has no method and no main-process handler. D2 adds
  methods, each one registered through `src/sender.ts`'s `guard()`.
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
| `scripts/build.mjs` | esbuild: `src/` into `build/`. |
| `electron-builder.release.cjs` | The release package: NSIS, x64, per user, Arabic, fuses. |
| `electron-builder.dev.cjs` | The development package, unpacked only, for the checks. |
| `tests/*.test.mjs` | Unit tests of every rule, the bundles, the pages and the packaging. |

## Build and check

Run these in this folder, on Windows. `node_modules/`, `build/` and `dist/` are ignored by git, and
Vercel never uploads this folder (`.vercelignore`).

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

The application check drives both packages. Build both first, then run it from the repository root:

```bash
node qa/desktop-shell.cjs
```

It writes `qa/desktop-shell.json`. It installs the release package silently, runs it and uninstalls it
again, but only when this laptop has no installation or profile of the application. Otherwise it skips
that part and touches nothing.

## Installing the pilot build

1. Copy `CommsHub-Setup-0.1.0-x64.exe` to the laptop and open it.
2. The build is not signed, so SmartScreen warns once: choose "More info", then "Run anyway".
3. It installs for this user only, without administrator rights, and adds a Start menu and a desktop
   shortcut named «مركز الاتصال المؤسسي».

To install a newer pilot build, run its installer over the old one; the session is kept. Uninstalling from
Windows' settings removes the program and the application's data on this laptop, the session included
(decision D-11).

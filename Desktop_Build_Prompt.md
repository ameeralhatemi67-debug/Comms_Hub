You are starting the Comms Hub desktop application, in
D:\Agents\main\projects\ideas\Comms_Hub. The owner accepted the plan on 2026-10-20 and answered
every open question. This run does phases D0 and D1 of Desktop_App_Plan.md, for Windows x64 only,
start to finish. Do not stop to ask for permission between steps; stop only for the blockers listed
at the end.

THE TASK
An Electron application for Windows x64 that opens the live Comms Hub site in its own window, with a
small, locked native layer. It is a shell around the website, not a copy of it: every page, rule and
check stays the website's. The specification is Desktop_App_Plan.md, and it is the authority. Read
all of it before writing anything, especially sections 5 (architecture), 8 (phases D0 and D1),
9 (security) and 11.1 (the owner's answers). Mobile_Apps_Plan.md section 5.2 defines the native
contract shared with the future phone applications; read that section too.

READ FIRST, in this order
1. AGENTS.md (binding project rules). It warns that this is not the Next.js you know: read the
   relevant guide in node_modules/next/dist/docs/ before writing any Next.js code. D1 should need
   none.
2. Desktop_App_Plan.md in full, then Mobile_Apps_Plan.md section 5.2, then Status.md and the last
   entries of progress.md.
3. bridge/whatsapp/ (how a separate Node program with its own package.json lives in this repository),
   qa/runtime.cjs and one qa/studio-*.cjs script (how browser checks are written and saved),
   tsconfig.json (only src/** is in the site's build).
4. For Electron, electron-builder and @electron/fuses, use current documentation (Context7 or the
   official sites), not memory.

DECISIONS (final, do not reopen): Desktop_App_Plan.md section 11 and 11.1. In short:
- Electron, opening https://comms-hub-three.vercel.app (the Vercel address is kept for now). A
  development build also allows http://127.0.0.1:3000. The list is compiled in; a release build has no
  way to widen it.
- Windows x64 only, until it is fully running. Nothing for macOS or arm64 in this run.
- Windows shows the name «مركز الاتصال المؤسسي». The internal application id is fixed now and never
  changes, so the data folder stays put. Choose a reverse-DNS id, and record it in progress.md.
- No native menu bar. The application handles only zoom (Ctrl with plus, minus and zero), full screen
  (F11) and reload (F5), and takes no key the site uses (Ctrl+Z, the studio's shortcuts).
- Unsigned for the pilot. No signing, no auto-update, no download page in this run (that is D3).
- The pilot is the Admin's and the director's laptops, both Windows x64.
- Pin Electron to the newest 44.x patch published at least fourteen days ago (check publish dates with
  npm view electron time --json). Pin every other dependency exactly, the same way.

SETUP: baseline and an isolated worktree
Another session is building the studio's third round in this same checkout, on main, with
uncommitted changes of its own. Never stage, edit, revert or commit its files.
1. In the main checkout, commit only these three files, as a local commit on main:
   Desktop_App_Plan.md, Mobile_Apps_Plan.md, Desktop_Build_Prompt.md. Use git add on those three
   paths, then git commit --only with the same three paths, so nothing else that is staged is swept
   in. The owner authorises this commit.
2. Create a git worktree on a new branch named desktop-app from that commit. Use the EnterWorktree
   tool if you have it, otherwise git worktree add. Do every later step inside that worktree. Never
   merge into main and never push: the owner merges after the studio round has finished.
3. Install the site's dependencies in the worktree (npm ci), so the site's checks can run there.

D0: SPECIFICATION AND RECORDS (small)
- MVP_draft.md: a new section for the desktop application. Use the next free section number; the plan
  expects 63. Write what the person sees: the window, the name, the offline screen, outside
  connections opening in the browser, permissions, and what is not there yet (exports in the
  background and the tray are D2). Arabic strings verbatim; established terms only.
- AGENTS.md: one paragraph in "Prototype boundary". It says the desktop application is real, by owner
  directive of 2026-10-20 (Desktop_App_Plan.md). It opens the live site and holds no secret. Its
  native layer is window.commsHubNative, exposed only to the compiled address list. It has no sign-in
  bypass, and nothing is scheduled in the site.
- Roadmap.md and Status.md: one line each. progress.md: a dated entry with the owner's decisions,
  then the D1 evidence with numbers (below).
- The studio session edits these same files on main. Keep every addition in its own new section or
  paragraph, so the later merge stays simple.

D1: THE SHELL (Desktop_App_Plan.md section 8, D1)
- desktop/ with its own package.json and lockfile, like bridge/whatsapp/. The source is TypeScript,
  compiled with esbuild. Expected files: src/main.ts, src/preload.ts, src/origins.ts,
  src/navigation.ts, src/permissions.ts, src/keys.ts, src/window-state.ts, src/offline.html,
  tests/*.test.mjs, and an electron-builder configuration. Keep the rules (origins, navigation,
  permissions, keys) as plain functions, so tests can run them without Electron.
- Window: one BrowserWindow on the session persist:comms-hub; contextIsolation and sandbox on,
  nodeIntegration off, webviewTag off; Menu.setApplicationMenu(null). The user agent gets the suffix
  " CommsHubDesktop/<version>". Size, position and the maximised state are remembered. A second
  launch focuses the open window (single-instance lock). Certificate errors are never ignored.
- Address rules: navigation and window.open inside the list stay in the window. Other http, https and
  mailto addresses open in the system browser; any other scheme is refused.
  /api/drive/connect, /api/onedrive/connect and /api/platforms/connect/* open in the system browser,
  with this Arabic note: «يكتمل الربط في المتصفح. سجّل الدخول إلى المركز هناك إن طُلب منك، ثم ارجع
  إلى التطبيق.»
- Permissions, granted to the allowed addresses only: microphone (audio only, never the camera),
  notifications, clipboard, full screen, and file-system access. Everything else is refused: camera,
  location, USB, serial, HID, Bluetooth, MIDI, and any other.
- Downloads go through the system's save dialog, starting in Downloads.
- Load failure: an Arabic, right-to-left offline screen with «إعادة المحاولة». It gets no bridge.
- Preload: window.commsHubNative = { platform: 'desktop', shell: 'electron', version, bridge: 1 },
  and nothing more in D1 (D2 adds methods). It is exposed only when the top-level page is on an
  allowed address, never in frames. Every future main-process handler must also check the sender's
  frame address; put that helper in place now, with tests.
- Fuses, flipped at packaging and read back: RunAsNode off, EnableNodeOptionsEnvironmentVariable
  off, EnableNodeCliInspectArguments off, EnableCookieEncryption on,
  EnableEmbeddedAsarIntegrityValidation on, OnlyLoadAppFromAsar on.
- Installer: electron-builder NSIS, x64, per user (no administrator rights), Arabic installer
  language if electron-builder supports it, Start menu and desktop shortcuts, version 0.1.0. The icon
  comes from public/brand/comms-hub-logo-512.png. App data is removed on uninstall (D-11); say so in
  the end report, so the owner can object. Build outputs go in desktop/ folders that are ignored by
  git. Add desktop/ to a .vercelignore, so Vercel never uploads it.
- Developer tools open only in a development build.

EVIDENCE (the D1 gate; AGENTS.md "Evidence over assertion")
- desktop/tests: unit tests of the address list, navigation decisions, the outside-connection routes,
  permission decisions, the keys, and the sender-address helper. They run with npm test inside
  desktop/.
- qa/desktop-shell.cjs, plus its JSON result qa/desktop-shell.json. It drives the packaged
  application with Playwright's Electron support (through qa/runtime.cjs). Checks:
  - the production sign-in page loads right to left, signed out; never sign in;
  - the bridge exists on an allowed fixture page served at 127.0.0.1:3000 by a development build, and
    does not exist on a foreign fixture page on another port or inside a frame;
  - a foreign link and window.open go to the system browser (stub shell.openExternal) and leave the
    window where it was;
  - an outside-connection address goes to the system browser;
  - the microphone is granted and the camera refused (Chromium's fake media device flags);
  - F11, zoom and F5 work, and Ctrl+Z reaches the page;
  - the offline screen appears when the address cannot be reached.
- Fuses read back from the packaged application (npx @electron/fuses read), recorded in the JSON.
- The installer's size and the installed size, recorded.
- The site: npm run typecheck, npm test, and npm run build in the worktree must still pass. D1 changes
  no site source. Never copy .env.local or any secret into the worktree. If the build cannot run
  without environment values, record that, and do not invent a way around it.
- progress.md gets every number, and everything skipped or failed, said plainly. Then a local commit
  on desktop-app. Several commits are fine (D0, D1).

NEVER, in this run
- Touch src/components/studio/**, src/lib/studio/** or src/components/notices.tsx. Those belong to
  D2, after the studio round.
- Add a sign-in bypass, a stub session, a stored password or a service_role key, not even for a test.
  Signed-in screens are the owner's walkthrough.
- Push, merge into main, publish a release, buy anything, or create any account.
- Use emoji anywhere. Translate or "improve" established Arabic terms. Write markdown through a
  double-quoted PowerShell string (AGENTS.md "Writing markdown from a shell").
- Edit disscussios/ or discussions_list.md.

STOP AND ASK ONLY IF
- a step needs the owner: a sign-in, a purchase, an account, or a secret;
- a project rule and this prompt disagree;
- a gate fails and cannot be fixed without changing a decision above.

END REPORT TO THE OWNER (plain words)
What was built; the evidence numbers; the installer's path; how to install it (SmartScreen: "More
info", then "Run anyway"); the signed-in walkthrough to do. The walkthrough: install; sign in; move
between pages; open «استوديو الحركة» and «الاستوديو» as the Admin; record a voice note to check the
microphone prompt; start a Drive connection from «الإعدادات» and see it open in the browser; close and
reopen, still signed in; uninstall, data gone. Also: what waits for D2, and the branch name to merge
when the studio round is done.

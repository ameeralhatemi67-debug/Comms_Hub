# The Android application: handoff of 2026-10-26

The state of the Android build at the end of the session of 2026-10-26, for the next session. The plan is
`Android_Build_Plan.md` (accepted 2026-10-26). The specification is `MVP_draft.md` section 64 and 64.1. The
project rule is the Android paragraph of `AGENTS.md`. Evidence with numbers is in `progress.md`, in the four
entries "the Android application, A0" to "A3". The prompt for the next session is `Android_Continue_Prompt.md`.

## 1. Where it stands

All local commits on `main`; nothing pushed, applied or published.

| Step | Commit | Evidence |
|---|---|---|
| The desktop application merged into main | `936d861` | site 537 of 537, desktop 120 of 120 |
| A0: decisions, plan, specification | `0ee6eec` | documents |
| A1: site preparation | `e9db82e` | `qa/android-site.cjs` 12 of 12 |
| A2: the shell in `mobile/` | `3362d55` | `qa/android-shell.cjs` 27 of 27 then |
| A3: «تطبيق الهاتف» and the update window | `bf802d0` | `qa/android-update.cjs` 12 of 12, `qa/android-shell.cjs` 28 of 28 |

Totals at `bf802d0`: site `npm test` 550 of 550; `mobile` `npm test` 11 of 11; JVM tests 15 of 15; typecheck and
build clean.

**What the application is now.** Capacitor 8.5.3, id `sa.commshub.app`, Android 10 or newer.
- It opens `https://comms-hub-three.vercel.app` and keeps the session, with backups off.
- It keeps the page clear of the system bars and the keyboard.
- It downloads the site's files to Downloads, with the cookie kept in its own process.
- It sends other sites, review links (`/r/`), answer pages (`/m/`) and outside connections to the browser,
  the connections after the desktop's note.
- It grants the microphone only, and shows the Arabic connection screen.
- The back key closes the page's open window first.
- It updates itself from the `android-releases` bucket after checking the APK's size, SHA-256, id, version and
  signing key; Android asks the person.

**The bridge**, version 2, is `window.commsHubNative` with `platform: 'android'`, `shell: 'capacitor'`, the
installed version, and `appUpdate`.

**Left exactly as found:** main's uncommitted files from before this work (`src/components/studio/project-shell.tsx`,
`work-bar.tsx`, `work-links.tsx`, `src/components/work/calendar.tsx`, `validation/recheck-R01.md`,
`Owner_Setup_Guide.md`, `Role_Simulation_*.md`, `qa/simulations/`, `supabase/.temp/`, `videos/`). Never stage
them.

## 2. What remains

| Phase | What | Size | Needs from the owner |
|---|---|---|---|
| A4 | Opening, saving, sharing the site's files (`download` and `share` features, the PDF viewer, «حفظ في الهاتف», «مشاركة») | S to M | nothing |
| A5 server | Devices and the push core: tables, outbox, triggers, chat and mail hooks, the FCM sender, `/api/push/flush`, «أجهزتي», «إعدادات التنبيهات» | L | the Firebase service account, entered by the owner in «الإعدادات» |
| A5 app | The application's push: permission, channels, token, tap to `go`, removed device signs out | M | a Firebase project and `google-services.json` |
| A6 | App links (`assetlinks.json`, `/app/return`, `/w/`), the fingerprint lock | M | the release key's SHA-256 fingerprint |
| A7 | Camera, sharing files in (`/share`), background upload to the library | L | nothing |
| A8 | Play readiness: the `play` build, Play's own updates, «طلب حذف حسابي», listing drafts | S to M | the verified Play account |

## 3. Running the next phases in parallel

**Two lanes, not more.**
- **Lane 1: A4, A6, A5 app, A7, A8, in order, in one session.** These phases all edit the same native files
  (`MainActivity.java`, `CommsHubShell.java`, `Identity.java` with its bridge version, the manifests,
  `src/lib/native/index.ts`, `tests/native.test.mjs`). They also share the one emulator, the check package
  `sa.commshub.app.qa`, and the fixed ports 3000 (the site) and 3002 (the feed), which the check package
  compiles in.
- **Lane 2: A5 server, in its own session and its own worktree and branch.** It needs no emulator and touches
  none of lane 1's files.
- **A third lane would collide** with one of these two.

**Files lane 2 owns**, which lane 1 does not edit while it runs:
- `supabase/migrations/*push*`, `supabase/tests/push_rules.sql`;
- `src/lib/push/**`, `src/app/api/push/**`;
- a new `src/components/native/devices.tsx`, `src/components/supporting.tsx` (the account page);
- the settings integrations component that takes the Firebase credential;
- `bridge/whatsapp/**`;
- the places that start a flush: `useWork().call`, chat send, mail send;
- `tests/push.test.mjs`, and the root `package.json` test script.

**Files both lanes write:** `progress.md`, `Status.md`. Each lane appends its own dated entries. When lane 2's
branch is merged, keep both sides in date order, as the desktop merge did (`936d861`).

**Order between them.** Lane 1 reaches A5 app only after lane 2 is merged, because the application registers
its token through lane 2's `device_register`. Until then lane 1 does A4 and A6, and A7 if A5 server is not
ready.

## 4. Environment and gotchas (this computer)

- **JDK.** Gradle 8.14 of Capacitor's template runs on JDK 17 to 21. `JAVA_HOME` here is Android Studio's Java
  25, so set `COMMSHUB_JAVA_HOME="C:/Program Files/Microsoft/jdk-21.0.12.101-hotspot"` for `mobile/scripts/build.mjs`
  and `JAVA_HOME` to the same for `gradlew.bat`.
- **SDK.** `ANDROID_HOME=D:\app\Android\Sdk` (platforms to 36.1, build-tools 37, emulator, adb).
- **The emulator**, read-only so nothing is kept, in the background:
  `"D:/app/Android/Sdk/emulator/emulator.exe" -avd Pixel_9_Pro -read-only -no-snapshot -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect`.
  WHPX is available; boot takes about two minutes.
- **The local site** for checks is `npm run build`, then the checks start `next start` on `127.0.0.1:3000`
  themselves. The phone reaches it through `adb reverse tcp:3000 tcp:3000` (the checks do it).
  - It is a loopback address so the page is a secure context; `10.0.2.2` is not, and has no `mediaDevices`.
  - To make the site unreachable in a check, stop the server: an open connection outlives removing the route,
    and airplane mode does not cut adb's route.
- **Builds.** `cd mobile && npm run build:qa` (check package), `npm run pack:release` (unsigned without the
  owner's key), `npm test`, and the JVM tests with `gradlew.bat testDirectReleaseUnitTest` in `mobile/android`.
  `COMMSHUB_CHECK_VERSION=x.y.z` builds the check package at another version (check package only).
- **Driving the emulator** (`qa/android-helpers.cjs`, `qa/android-shell.cjs`):
  - Tap through adb at the element's place (`tapOn`), not Playwright's click. A synthetic click is unreliable
    when the application has just come back to the front, and it waits for navigations the shell cancels.
  - Take Playwright's handle on the web view again after another application was in front (`backToApp`).
  - UI Automator reports the web view's place from before the keyboard: measure `window.innerHeight` instead.
  - A forced stop may come before the web view writes `localStorage`: clear and reload in the page rather than
    relying on what a forced stop kept.
  - Never use two check runs at once (one emulator, fixed ports). If a run is cut off, look for a leftover
    `node` on ports 3000 to 3002 before the next run.
- **Shell quoting.** Escaping of backslashes and `${}` through bash and `node -e` has corrupted edits several
  times. Use the file-editing tool for Java and JavaScript with backslashes or template strings.
- **Google Play Protect** shows "App scan recommended" on every installation of an unknown APK. The update check
  takes «More details» then «Install without scanning» (a link at the end of a paragraph: tap the centre of its
  last line) and sends nothing to Google.

## 5. Owner steps, none done yet

1. **Make the release key**, using the `keytool` command in `mobile/README.md`. Keep it in a password manager
   with an offline copy. Give the certificate's SHA-256 fingerprint (public) for A6.
2. **Create a free Firebase project**, add an Android app `sa.commshub.app`, and keep `google-services.json`
   outside the repository (A5 app). Then create a service account for Cloud Messaging and paste its JSON in
   «الإعدادات» once A5 server has that entry.
3. **Check Supabase Auth's redirect allow list** for `/app/return` (A6).
4. **For a pilot release:**
   - push, which deploys the site's A1 and A3 parts;
   - apply `supabase/migrations/20261026120000_android_releases.sql`;
   - build the signed APK and upload it, then `latest.json` (`mobile/README.md`, "Publishing a release").
5. **Walk through it signed in on a real phone**, as `Android_Build_Plan.md` lists.

## 6. Decisions already taken (do not reopen)

- APK pilot until Play; id `sa.commshub.app`; the owner's key, reused on Play; the download on «الحساب» for
  everyone (owner, 2026-10-26).
- From `Mobile_Apps_Plan.md`:
  - M-1: Capacitor.
  - M-3: push started by the writer's page and the bridge computer, nothing scheduled, no database-started
    call.
  - M-4: «قرار» with sound, «انتباه» silent and optional, «للعلم» never; direct messages, mentions and mail
    action cards as «رسالة جديدة من …» only.
  - M-5: lock-screen text rules.
  - M-12: the lock off by default.
  - M-13: devices private to their owner.
- **Taken while building**, recorded in `progress.md`:
  - Java not Kotlin.
  - The application's own downloader, not `DownloadManager`.
  - The loopback address for the local site.
  - Android 10 as the floor.
  - Safe areas handled by the shell, not the site's CSS.
  - Mailed sign-in links point to the browser inside an application until links are verified.
- **Out of scope:** the studio and «استوديو الحركة» (their exports are refused with an Arabic message), web
  push for browsers, the iPhone.

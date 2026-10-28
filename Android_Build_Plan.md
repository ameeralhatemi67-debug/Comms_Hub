# Android application «مركز الاتصال المؤسسي» (`sa.commshub.app`), without the studio: build plan

Status: **accepted by the owner on 2026-10-26** (recorded in `progress.md`). It narrows `Mobile_Apps_Plan.md` to
Android, with a sideloaded APK as the pilot channel until the Google Play account is verified, and leaves the
studio out. The specification is `MVP_draft.md` section 64; the project rule is the Android paragraph of `AGENTS.md`.

## Context

- **Owner request of 2026-10-26:** a sideloaded APK as the pre-launch Android download while the Google Play
  developer account is verified, then a plan for the Android build covering everything except the studio
  (the video and photo editors).
- **Owner answers of 2026-10-26:**
  - The APK pilot goes ahead.
  - The app id is `sa.commshub.app`.
  - The owner holds the signing key, outside the repository. Play uses the same key (Play App Signing with
    our own key), so APK users later update from Play without reinstalling.
  - The download sits on «الحساب» for every signed-in person, from a public bucket.
- **Taken from the accepted `Mobile_Apps_Plan.md` (2026-10-20), unless the owner says otherwise:**
  - Capacitor 8 opening the live site (M-1), with the thin native shell as the fallback if the shell phase
    fails.
  - Pushes started by the writer's page and the bridge computer (M-3, S-1 and S-2). There is still no
    database-started call and nothing scheduled in the site.
  - What is pushed and what a lock screen shows (M-4, M-5).
  - The app lock is optional, off by default (M-12).
  - A person sees only their own devices (M-13).
- **The desktop application was merged into main today** (`936d861`, not pushed). The shared native contract
  `src/lib/native/` and the release-feed pattern (`releases.ts`, the `desktop-releases` bucket migration)
  are now on main to build on.
- **This computer can build and test Android:**
  - JDK 21, Android Studio 2026.2, and the SDK in `D:\app\Android\Sdk` (API 36, build-tools 37).
  - An emulator with an Android 16 image that includes Google Play services, and the `Pixel_9_Pro` virtual
    device.
  - Capacitor 8.5.3 (2026-10-07), which meets the project's 14-day rule for new versions.

## Scope

**In:**
1. The shell.
2. The download page and the update window.
3. Opening, saving and sharing files.
4. «أجهزتي» and push notices.
5. App links and the app lock.
6. Camera capture, sharing files in, and background upload to the library.
7. Play readiness.

**Out:**
- The studio and «استوديو الحركة» (both tabs). They open in the app as they do in Chrome, but are not
  qualified there. Saving their exports to the phone is refused with an Arabic message (A2), never failing
  silently. Their phone work stays `Mobile_Apps_Plan.md` M5.
- Web push for ordinary browsers (the installed web app, M1). The push core of A5 is built so it can follow.
- iPhone, Media3 copies, the HyperFrames items, launcher badges and quiet hours.

**Rules that hold throughout (`AGENTS.md`):**
- No sign-in bypass, stub session or stored password, not even in checks. Agents never sign in.
- No secret in the repository. The keystore stays with the owner, `google-services.json` is supplied at
  build time, and the Firebase service account lives in Vault.
- Arabic interface strings and no emoji.
- Approval never sits on a notice, publishing stays a simulation, and there is no service_role key.

## What exists and is reused

- **`src/lib/native/index.ts`**
  - `Platform` already includes `'android'`, and `SHELLS` accepts it.
  - Detection reads `window.commsHubNative`.
  - `FEATURES` maps each feature to the methods it needs.
  - Existing helpers: `notifyNative`, `onNoticeOpen`, `compareVersions`.
- **`src/lib/native/releases.ts`:** the pattern of `DESKTOP_FEED`, `MINIMUM_DESKTOP`, `parseLatest`, `tooOld`,
  `newer` and `updateLine`.
- **`src/components/native/desktop-app.tsx`**
  - `DesktopAppPanel` is mounted at `src/components/supporting.tsx:130`, and `DesktopUpdateBanner` at
    `src/components/shell.tsx:236`.
  - **Defect to fix:** both treat any app as the desktop (`inApp = version !== null`). `device.ts:70` also
    hard-codes «تطبيق سطح المكتب».
- **Desktop rules to port and hold equal by tests:**
  - `desktop/src/origins.ts`: the compiled address.
  - `desktop/src/navigation.ts`: what goes to the browser, and the connect routes `/api/drive/connect`,
    `/api/onedrive/connect` and `/api/platforms/connect/*`, which go to the browser after a note.
  - `desktop/src/bridge.ts`: argument checks.
  - `desktop/src/sender.ts`: the main-frame check.
  - `offline.html`, `connect-note.html`.
- **The page Content-Security-Policy** (`src/lib/csp.ts`, `src/proxy.ts`): nonce scripts and no
  `unsafe-inline`. Native document-start injection is not subject to it; an inline `<script>` would be
  blocked.
- **Notices and the outbox pattern**
  - `public.notifications` (`*work_cycle*`): `recipient` is an email, there are three tiers and a `go`
    target, and there is no realtime. The table is written by `work_notify` and by direct inserts in the
    permissions, urgency, whatsapp, entry_flow and secret_expiry migrations.
  - `whatsapp_outbox` holds ids only. It is filled by `wa_route` inside `chat_send`, claimed by `wa_claim`
    (skip locked, 5-minute stale release) and closed by `wa_report`.
  - `mail_key_ok` and `wa_key_ok` check keys by sha256. `mail_sync_begin` (lock plus gate) is the model for
    rate-limiting S-1.
  - Plain DMs, @mentions and mail action cards write no notice. Unread state for them is worked out in the
    browser (`src/lib/chat/rules.ts:111`, `src/lib/mail/rules.ts:179`), so they need their own hooks.
- **Vault:** `int_secret_set`, `int_secret_commit` and `int_secret_use`, `integration_creds` with its type
  whitelist, and on the server `src/lib/integrations/vault.ts` (`vaultSecret`, `storeChecked`). Nothing signs
  an RS256 JWT yet, so FCM needs one in `node:crypto`.
- **Sessions:** «الحساب» already has «الخروج من كل الأجهزة» (`signOut({scope:'global'})`,
  `supporting.tsx:188`). Supabase's `'others'` scope is unused.
- **Files**
  - Same-site file routes, served through `openStored`:
    - `/api/media/[id]/content`: byte ranges, up to 5 GB.
    - `/api/chat/file/[id]`: byte ranges.
    - `/api/mail/file/[id]` and `/api/mail/inbound/[id]/[i]`: no ranges, 25 MB.
  - Library uploads: `src/lib/media/upload.ts` opens a resumable Drive session on the server, PUTs 8 MB
    chunks with a `bytes */size` probe, then calls `/api/media/complete`.
  - Mail and chat: `uploadAttachment` (`src/lib/mail/upload.ts`).
  - Blob downloads outside the studio: only the backup export (`settings/backups.tsx:85`) and `/motion`.
- **Token routes:**
  - `/r/[token]` (outsiders) and `/m/[token]` (outsiders) open in the browser.
  - `/w/[token]` (signed WhatsApp link for members, which answers with a redirect to `/mail/chat`) opens in
    the app.
- **Entry:** `auth-gate.tsx:134,155,186` set `emailRedirectTo`/`redirectTo` to `${origin}/`. @supabase/ssr
  uses PKCE, so a link must come back to the cookie store that started the request.
- **Phone layout**
  - `layout.tsx` has no `viewport` export and nothing uses `env(safe-area-inset-*)`.
  - Elements pinned to the bottom or top:
    - `.mobile-nav` (sticky) and `.toast` (80 px).
    - `identity.css:182` (`bottom:69px`).
    - `work.css:319` and `:486`.
    - `media.css:170` and `:174`.
    - `mail.css:342`.
    - `kit.css:30` (top).
  - Heights in `100vh`: `chat.css:255`, `mail.css:53`, `auth.css:3`.
- **Help guides:** `src/lib/help/pages.ts` and `registry.ts`. `tests/kit.test.mjs:21` pins the page keys and
  checks that selectors exist.

## Phases

Each phase ends as the project's phases do:
- `npm run typecheck`, `npm run build` and `npm test` pass, plus `mobile/` tests and SQL rule runs where
  there is a migration.
- A re-runnable check under `qa/` with its JSON result.
- A dated `progress.md` entry with numbers, and a local commit.

Nothing is pushed, applied, uploaded or released unless the owner asks. The APK opens production, so a
phase's site code reaches the APK only after the owner pushes. Main's existing uncommitted studio, calendar
and simulation files are never staged.

### A0. Record and specify (S)

- In `progress.md`, the owner's answers of 2026-10-26 and this scope.
- `Android_Build_Plan.md`: this plan, kept in the repository.
- `MVP_draft.md` section 64, «تطبيق Android»: the window, the name, links, the update window, notices,
  «أجهزتي», the lock, files, and what waits.
- An `AGENTS.md` paragraph like the desktop's: compiled address, no secret, bridge top-frame only, release
  key held by the owner, nothing scheduled.
- `Roadmap.md` and `Status.md` lines, and a dated pointer at the top of `Mobile_Apps_Plan.md`.

### A1. Site preparation, no app needed (S to M)

> **Changed while building, 2026-10-26** (recorded in `progress.md`):
> - Safe areas are handled by the shell, not by the site's CSS. In A2 the shell pads its web view by the
>   system bars and the keyboard, so the site's styles are unchanged and no `viewport-fit=cover` is added
>   (that would change iPhone Safari today).
> - The safe-area check moves to A2's emulator check.
> - The sign-in links fix covers the desktop application too, which had the same fault.

- **`src/lib/native/index.ts`:** new features in `Feature`/`FEATURES`: `push`, `appUpdate`, `download`,
  `share`, `incoming`, `upload`, `capture` and `lock`, with tests in `tests/native.test.mjs`.
- **Platform-aware native interface**
  - `DesktopAppPanel` and `DesktopUpdateBanner` act only for `platform === 'desktop'`.
  - `device.ts` names the client by platform.
  - `releases.ts` gains `ANDROID_FEED`, `MINIMUM_ANDROID`, `parseAndroidLatest` (strict JSON: `.apk` name,
    size, 64-hex SHA-256, versionCode, minimum, short Arabic notes) and a per-platform `tooOld`.
- **Safe areas, harmless in browsers**
  - A `viewport` export with `viewportFit: 'cover'`.
  - Tokens `--safe-b` and the like, equal to `var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))`.
    The first value is the variable Capacitor 8's SystemBars plugin injects.
  - Applied to every pinned element listed above.
  - `100dvh` where `100vh` cuts content.
- **The entry return:** a route `/app/return` that redirects to `/` with the same query. Inside the app,
  `auth-gate.tsx` uses it as `emailRedirectTo`/`redirectTo`, so a link from a request started in the app
  returns to the app's cookie store. Browsers keep `/`.
- **Check:** `qa/android-site.cjs` in Edge.
  - Emulated insets: set `--safe-area-inset-*` on `html` at 320 to 430 px. Nothing pinned may sit under the
    inset. Each case is also shown failing without the change.
  - The panels say nothing about the desktop when the bridge reports `android`.

### A2. The shell (the Android part of M2), the gate for everything after (M)

> **Done 2026-10-26; the gate passed**, 27 of 27 (`qa/android-shell.cjs`). Changed while building (recorded in
> `progress.md`):
> - Java instead of Kotlin, as Capacitor's template is.
> - The application's own downloader instead of `DownloadManager`, which would have kept the cookie in its
>   database.
> - The local site at `http://127.0.0.1:3000` through `adb reverse` instead of `10.0.2.2`, so the page is a
>   secure context.
> - Android 10 as the floor.

- **Layout:** `mobile/` with its own `package.json` and lockfile, like `desktop/`, outside the site's
  typecheck and build.
- **Pinned packages:** `@capacitor/core`, `@capacitor/cli` and `@capacitor/android` 8.5.3, and `@capacitor/app`.
- **`capacitor.config.ts`**
  - appId `sa.commshub.app`, name «مركز الاتصال المؤسسي».
  - `server.url` is the compiled `https://comms-hub-three.vercel.app`. Development and check builds add
    `http://10.0.2.2:3000`, with cleartext allowed only in them.
  - `errorPath`: an Arabic offline screen with «إعادة المحاولة» and a link to the download page.
  - SystemBars `insetsHandling: 'css'`, zoom off, logging `none` and WebView debugging off in release.
- **Builds:** Gradle flavours `direct` (sideload) and `play`. A check package `sa.commshub.app.qa` that
  checks install and remove, so a real installation is never touched.
- **The bridge:** a Kotlin plugin `CommsHubShell` adds a document-start script restricted to the compiled
  origins.
  - In the top frame only, it defines a frozen `window.commsHubNative` with `platform:'android'`,
    `shell:'capacitor'`, version and bridge 1, mapping to plugin calls.
  - Every native method re-checks that the main frame's address is on the list, and checks its arguments
    by the rules ported from `desktop/src/bridge.ts`.
- **Navigation:** a custom `BridgeWebViewClient`.
  - Off-list addresses and `/r/` and `/m/` go to the system browser.
  - The connect routes go to the browser after the Arabic note.
  - Rules are held equal to `desktop/src/navigation.ts` by a test.
- **Back key:** back through the site's history, then leave.
- **Downloads:** a `DownloadListener` sends same-site file routes to `DownloadManager` with the WebView's own
  cookies. The session never leaves the phone and no bytes cross the bridge. A `blob:` download gets an
  Arabic toast saying it cannot be saved from the app yet. Backups and `/motion` are done from a computer.
- **Permissions:** the file chooser and the microphone for voice notes, with Arabic permission texts.
  Location is never asked.
- **Brand:** the icon and splash from the brand files.
- **Pass criteria**, all required, otherwise the owner chooses the thin native shell (M-1). Recorded with
  screenshots in `qa/android-shell.cjs`, driven on the emulator by Playwright's Android support over adb
  against the check package and the local site:
  1. A site cookie survives a force-stop and a reopen.
  2. The bridge exists on the allowed origin's top frame only. It is absent in an iframe and on another
     origin.
  3. No Content-Security-Policy violation with the bridge present, the same check as `qa/desktop-csp.cjs`
     inside the app.
  4. The file chooser and the microphone work.
  5. Outside links and the connect routes open the browser.
  6. The offline screen shows in airplane mode.
  7. A release APK builds.

  Then the owner, signed in on a real phone: the session survives a restart.

### A3. «تطبيق الهاتف» and the update window (M)

> **Done 2026-10-26**, 12 of 12 (`qa/android-update.cjs`).
> - The application reads its own feed and the site draws the window from its report.
> - Google Play Protect proposes a scan on every installation until Google knows the application; the texts
>   say so.
> - The back key closes the page's open window first.

- **The bucket:** migration `*android_releases*`, a public bucket `android-releases` (APK and JSON types,
  about 150 MB, no write policies). Written, not applied: the owner applies it with the first release.
- **The feed:** `android/latest.json` with versionName, versionCode, file, size, sha256, minimum, Arabic notes
  and date.
- **Native `appUpdate`:** downloads only from the compiled feed address into the app's cache, then checks:
  - the SHA-256;
  - that the APK's signing certificate equals the installed one (`getPackageArchiveInfo`), with an Arabic
    message on a mismatch.

  It then installs through a `PackageInstaller` session. It asks once for «تثبيت التطبيقات غير المعروفة»
  with an Arabic explanation, and refuses while a background upload runs.
- **On «الحساب»**, beside the desktop panel, `PhoneAppPanel`:
  - in a browser: the APK download with its version, its size, and the steps, including Play Protect's
    warning about a new developer;
  - in the app: the version and «تحديث الآن».
- **`AppUpdateWindow`**, mounted in the shell and on the sign-in screen, so an old app updates before
  sign-in and the check is testable signed out:
  - optional: once per version, with «لاحقاً» for 24 hours, remembered in device storage inside try/catch;
  - required: below `MINIMUM_ANDROID`, a window that cannot be closed;
  - «ما الجديد» once after an update.

  It checks on start and on return to the app, at most every 4 hours.
- **`mobile/README.md`, "Publishing a release":** the owner bumps the version and runs `npm run pack:release`
  with their keystore (a properties file outside the repository). They upload the `.apk`, then
  `latest.json` last.
- **Check:** `qa/android-update.cjs` on the emulator.
  - The check package 0.1.0 is installed, and a local feed offers 0.1.1.
  - The window shows on the sign-in screen, the system dialog is driven by adb, and the version is 0.1.1
    afterwards with the site cookie kept.
  - A wrong SHA-256 is refused, and an APK signed by another key is refused with the Arabic message.
  - The package is uninstalled at the end.

### A4. Opening, saving and sharing files (S to M)

- **Opening:** «فتح الملف» on a document (the Android WebView has no PDF viewer) downloads to the cache and
  opens the system viewer through a `FileProvider`. Images and video stay inline.
- **Saving and sharing:** «حفظ في الهاتف» (Downloads, with photos and videos in the gallery through
  MediaStore) and «مشاركة» (the share sheet).
  - On the asset page, mail attachments and chat files.
  - Shown only when `has('download')` or `has('share')`.
  - The native layer fetches with the WebView's cookies, so no bytes cross the bridge. Progress shows in a
    native notice, and sharing a very large file shows its size first.
- **Check:** `qa/android-files.cjs` on signed-out-safe fixtures served by the local site's check route, with
  file contents checked by checksum.

### A5. «أجهزتي» and push notices (L)

- **Migration `*push*`**
  - **`devices`:** the person, platform, version, name, `fcm` token, tiers wanted, «إخفاء نص التنبيهات»,
    last seen and removed.
    - RLS: own rows only, read through a view without the token. The token is never selectable.
    - Functions: `device_register`, `device_seen` (returns removed), `device_rename`, `device_remove` and
      `device_prefs`.
  - **`push_outbox`:** ids only, unique per device, kind and reference. It is filled by:
    - a trigger on `notifications` for `decide` (always) and `attention` (if wanted), never `info`;
    - `push_route_chat` spliced into `chat_send` like `wa_route`, for direct messages and @mentions, skipping
      the sender and muted members;
    - a hook in internal mail sending, for action cards addressed to the person.
  - **`push_claim` and `push_report`:** server-key sha256 check, skip locked, 5-minute stale release,
    5 attempts.
    - The payload is built at claim time: notice id, `go` path, tier, and the work notice's text unless
      hidden.
    - Chat and mail carry only «رسالة جديدة من …» and their destination, never message text.
    - An invalid token clears that device's token.
  - **`push_flush_begin`:** lock and gate, modelled on `mail_sync_begin`.
- **The sender:** `src/lib/push/fcm.ts`, an RS256 service-account JWT with `node:crypto`, the token cached for
  55 minutes, FCM HTTP v1 with Android channels.
  - The credential is a new integrations type `fcm_service_account` (kind messaging). It is entered in
    «الإعدادات» by someone holding `integrations.secrets`, and verified by getting a token before
    `storeChecked` commits it.
  - **`/api/push/flush`** accepts the signed-in page (S-1, gated) or the bridge key (S-2). It uses
    `MAIL_SERVER_KEY` for claim and report, and returns at once when nothing is queued.
- **Starters**
  - S-1: a debounced `kickPush()` after successful writes in `useWork().call`, chat send, mail send and the
    other notice writers.
  - S-2: `bridge/whatsapp/` calls the flush route each loop tick (a second client beside `siteClient`).
- **The app**
  - An Arabic explanation, then the Android 13 notices permission.
  - Two channels: «يحتاج قرارك» (sound, high) and «للانتباه» (silent).
  - It registers its token, and updates it when it changes.
  - A tap opens `go`, checked as a same-origin path.
  - A push received while the app is in front refreshes the notices list.
  - At each opening, `device_seen` signs a removed device out locally.
- **On «الحساب»**
  - «أجهزتي»: rename, and «إزالة الجهاز» behind a long press.
  - «الخروج من الأجهزة الأخرى» (`signOut({scope:'others'})`).
  - «إعدادات التنبيهات»: «انتباه» on or off, and «إخفاء نص التنبيهات».
- **Checks**
  - `supabase/tests/push_rules.sql`:
    - devices are private and the token is never readable;
    - the outbox holds ids only, one row per notice per device;
    - nothing goes to the actor, `info` never goes out, and muted conversations are skipped;
    - a removed device gets nothing;
    - claim and report work with the key only.
  - Node tests: payload rules (no message text, no query strings, hidden text honoured) and JWT signing with
    a key made for the run.
  - `qa/push-flush.cjs`: a local FCM stub receives exactly the expected messages.
  - Delivery to a locked phone is the owner's check, with the real Firebase project.

### A6. App links and the app lock (M)

- **App links**
  - `public/.well-known/assetlinks.json` with `sa.commshub.app` and the release certificate's SHA-256, which
    the owner supplies; it is public information.
  - Verified intent filters with path prefixes from the site's page list (`src/lib/access.ts:161`), plus
    `/w/` and `/app/return`.
  - Excluded: `/`, `/r/`, `/m/` and `/api/`.
  - A test holds the manifest equal to the page list minus the exclusions. The proxy must serve
    `.well-known` as JSON with no redirect.
- **The app lock:** a small plugin using `BiometricPrompt` with the device credential as fallback.
  - Offered once after the first sign-in, off by default.
  - Locks after 5 minutes away.
  - The lock screen is native and in Arabic.
- **Check:** `qa/android-links.cjs`. `adb am start` with a work address opens the app, and `/r/` opens the
  browser. The check package's links are approved with `pm set-app-links`.

### A7. Camera, sharing in, background upload (L)

- **Camera:** «تصوير» in the library upload uses the native camera, for photo or video.
- **Sharing in:** `ACTION_SEND` and `ACTION_SEND_MULTIPLE` open «استلام ملفات» (`/share`). The person chooses a
  library folder (the create right is checked by the server), a work, or a conversation.
- **No bytes over the bridge**
  - The shell serves files by token at a reserved same-origin path (`/__app/file/<token>`): GET only, byte
    ranges, answered in `shouldInterceptRequest`. A test checks the site never uses that path.
  - Mail and chat attachments (25 MB) then use the existing `uploadAttachment` unchanged.
  - Library files use the native transfer.
- **Background upload:** the page opens the session through `/api/media/upload-session` as today and hands
  the session address and the token to native code.
  - A WorkManager foreground worker («جارٍ رفع الملفات», dataSync type, Android 15 time limits checked)
    PUTs 8 MB chunks with the same resume probe.
  - The page, or the next opening, completes through `/api/media/complete`.
  - The pending list survives restarts.
- **Check:** `qa/android-upload.cjs`.
  - A resumable-protocol stub receives a 2 GB file, with the app in the background and the network cut
    once.
  - The checksum is equal, and a refused folder is refused by the server.
  - A real Drive upload is the owner's check.

### A8. Play readiness; release when the account is verified (S to M)

> **Built 2026-10-28** (recorded in `progress.md`; `MVP_draft.md` 64.6; the Console drafts in `Play_Console_Drafts.md`).
> Changed while building:
> - Google's own Play in-app updates library (`com.google.android.play:app-update` 2.1.0, `play` flavour only) behind
>   the application's plugin, instead of `@capawesome/capacitor-app-update`. A third-party Capacitor plugin would
>   answer the page without the bridge's address check, and would sit in the APK channel too.
> - Bridge version 7 adds `playUpdate`; the site draws Play's offer, download, restart and required update in the
>   same window. Play names a release by its whole number, read back as the version by the builds' rule.
> - The check package's play copy asks Play's `FakeAppUpdateManager`, so the window is checked on the emulator;
>   Play's real update is the owner's check through internal testing.
> - «طلب حذف حسابي» reaches the holders of «إزالة عضو» who may remove the person, and «إزالة» carries it out; a
>   requested removal also removes what only that person could read. The migration is written and its rules pass,
>   not applied until the owner says.
> - The public page is static (`/account-deletion.html`, with an email route for someone who cannot sign in), and
>   the privacy policy is rewritten for everything the Hub handles today.
> - The listing's icon and feature graphic are drawn from the brand; phone screenshots are the owner's, signed in.

- **The `play` flavour:** no `REQUEST_INSTALL_PACKAGES`. Updates through Google Play in-app updates
  (`@capawesome/capacitor-app-update`, pinned) behind the same window. An AAB build.
- **«طلب حذف حسابي»** on «الحساب»: Play requires a deletion path for apps that create accounts. The request
  reaches the administrators, and the listing gets a web address for it.
- **Drafts for the owner:** data-safety answers, the Arabic listing and screenshots. Privacy policy at
  `public/privacy.html`, target API 36.
- **Owner steps:** Play App Signing with the same key, the internal testing track, and registering
  `sa.commshub.app` and its certificate for developer verification. The Play Console covers apps outside
  Play too.

**Order.** A0, then A1, then A2 (the gate), then A3 and A4. That is pilot release 0.1: the site, files and
self-update.

A5's database and site work can start after A1, alongside A2 to A4, because it touches different files. Its
app part needs A2. Releases follow: 0.2 (push), 0.3 (links and lock), 0.4 (camera, share-in, upload), then A8.

## Owner steps (no agent does these)

1. **Make the release keystore** with the `keytool` command given in `mobile/README.md`. Keep it in your
   password manager with an offline backup, and never send it. Give the certificate's SHA-256 fingerprint
   (public) for `assetlinks.json`.
2. **Set up Firebase:** create a Firebase project (free) and add the Android app.
   - Place `google-services.json` at the path the README names. It stays out of the repository.
   - Paste the service-account JSON in «الإعدادات».
3. **Check Supabase Auth's redirect allow list** for `/app/return`.
4. **For each release:** push the site parts first (a push deploys). Apply the bucket migration (first time
   only), build the signed APK, and upload it.
5. **Walk through it signed in on a real Android phone:**
   - install and update;
   - receive an approval notice with the phone locked and open it on the review screen;
   - open a link from mail and from WhatsApp;
   - save and share a file, and share a photo in from WhatsApp;
   - upload a video with the screen locked;
   - remove the phone from «أجهزتي» on the computer and see it sign out.

## Verification

- **Every phase:** typecheck, build and `npm test`; `mobile/` unit tests (Kotlin unit tests plus node tests for
  the config and the feed); and the phase's `qa/android-*.cjs` with its JSON result.
- **Emulator checks:** they run on `Pixel_9_Pro` (Android 16, Google Play image) with the `.qa` check package,
  through Playwright's Android support over adb, against the local site at `10.0.2.2:3000`. They use
  signed-out pages only and leave nothing installed.
- **SQL rule files** run through the Supabase tool against the project, with results in
  `qa/<name>-rules.json`, as the project does today.
- **What only the owner can verify:** signed-in behaviour, real FCM delivery and real Drive uploads. Each
  phase's `progress.md` entry says so plainly.

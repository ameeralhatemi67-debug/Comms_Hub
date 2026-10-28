# «مركز الاتصال المؤسسي» for Android

The Android application of `Android_Build_Plan.md` (specification: `MVP_draft.md` section 64; project rules:
the Android paragraph of `AGENTS.md`). It is a Capacitor 8 window on the live site,
`https://comms-hub-three.vercel.app`, with a native layer. It holds no secret, and the session is the site's own
cookie in the application's storage.

It has its own `package.json` and lockfile and stays outside the site's typecheck and build. Vercel ignores
the folder (`.vercelignore`).

## What you need

- Node, as for the site, and `npm install` in this folder.
- The Android SDK (`ANDROID_HOME`), with platform 36 and the build tools. Android Studio 2025.2.1 or newer
  installs them.
- **A JDK from 17 to 21 for Gradle.** Capacitor 8's template uses Gradle 8.14, which does not run on Java 25,
  and recent Android Studios bundle Java 25. If `JAVA_HOME` points at a newer Java, name a JDK 21 for the
  build:

  ```bash
  export COMMSHUB_JAVA_HOME="C:/Program Files/Microsoft/jdk-21.0.12.101-hotspot"
  ```

## Builds

| Command | Package | Opens |
|---|---|---|
| `npm run build:debug` | `sa.commshub.app.dev` | the production site, or the local one (below) |
| `npm run build:qa` | `sa.commshub.app.qa`, the check package | the local site; inspectable by the checks |
| `npm run pack:release` | `sa.commshub.app` | the production site alone |
| `npm run pack:play` | `sa.commshub.app`, Google Play's App Bundle | the production site alone |
| `npm run build:qa:play` | `sa.commshub.app.qa`, Google Play's copy of the check package | the local site; asks Play's stand-in |

Each command copies `www/` and `capacitor.config.json` into the Android project (`cap sync`), writes the
local configuration of the debug and check builds, runs Gradle, and prints the APK's path, size and SHA-256.
The APK lands in `android/app/build/outputs/apk/<channel>/<kind>/`; Google Play's release is an App Bundle in
`android/app/build/outputs/bundle/playRelease/` (A8, below).

**Rules held by the files.**
- A release opens the production address alone, over https, with inspection off.
- The debug and check builds add the local site at `http://127.0.0.1:3000`, the desktop's development address,
  and only those builds allow cleartext, and only to that address.
- The phone reaches the site on this computer through `adb reverse tcp:3000 tcp:3000`. That is a loopback
  address, so the page is a secure context, as production is.
- The application needs Android 10 or newer (API 29) and targets Android 16 (API 36), as Google Play requires.

## Tests

- `npm test`: the rules that live in files. The address equals the desktop's and the site's; the builds;
  the permissions; the desktop's connection routes, note and connection screen, word for word; no emoji.
- `npm run test:jvm`: the rules in Java (where an address goes, the name a download is saved under, the
  identity script, Play's update states), on the JVM, for both channels. On Windows, run
  `gradlew.bat testDirectReleaseUnitTest testPlayReleaseUnitTest` in `android/` with `JAVA_HOME` set to the JDK above.
- `qa/android-shell.cjs` (from the repository's root): the gate of A2 on the emulator. Start the emulator
  read-only first, so nothing the check installs is kept:

  ```bash
  "$ANDROID_HOME/emulator/emulator" -avd Pixel_9_Pro -read-only -no-snapshot -no-window -no-audio
  ```

  It needs `npm run build` at the root, then `npm run build:qa` and `npm run pack:release` here. It opens
  signed-out pages only, and uninstalls the check package at the end.

## The release key (the owner's, once)

The application is signed with one key for its whole life. Android installs an update only when it is
signed with the same key, and Google Play is enrolled later with this key too (Play App Signing, "use my own
key"). An installed APK then updates from Play without being removed.

- **If the key is lost, every phone must remove the application and install it again.**
- No agent creates, reads or uses it. It never enters this repository: `*.jks`, `*.keystore`,
  `keystore.properties` and `google-services.json` are ignored.

1. Make the key on your computer, outside the repository, and choose its password yourself:

   ```bash
   keytool -genkeypair -v -keystore "D:/keys/commshub-release.jks" -alias commshub -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=Comms Hub, O=<your organisation>, C=SA"
   ```

2. Keep the `.jks` file and its password in your password manager, with one offline copy (a USB key in a
   safe place).
3. Write the properties file, also outside the repository, for example `D:/keys/commshub-release.properties`:

   ```properties
   storeFile=D:/keys/commshub-release.jks
   storePassword=...
   keyAlias=commshub
   keyPassword=...
   ```

4. For each release, name it before building:

   ```bash
   export COMMSHUB_KEYSTORE_PROPERTIES="D:/keys/commshub-release.properties"
   npm run pack:release
   ```

   Without it, the release APK is built unsigned (`app-direct-release-unsigned.apk`), and Android will not
   install it.
5. The certificate's fingerprint is public, and A6 (`assetlinks.json`) needs it:

   ```bash
   keytool -list -v -keystore "D:/keys/commshub-release.jks" -alias commshub
   ```

   Copy the line `SHA256:`.

## Publishing a release

Releases go to the public bucket `android-releases` of the `comms-hub` project, in the folder `android/`. The
application reads `android/latest.json` there, and «تطبيق الهاتف» on «الحساب» links to the APK beside it. Only
the owner publishes, from the Supabase dashboard; nothing is uploaded through the site or by an agent.

**The first time:** apply `supabase/migrations/20261026120000_android_releases.sql`. It makes the bucket public
for reading, with no write policy, and limits files to 150 MB.

**Each release:**

1. Raise `version` in `package.json`, and in `package-lock.json`'s two copies (`npm install` writes them).
   Android's whole number follows: `x.y.z` gives `x*10000 + y*100 + z`, so neither `y` nor `z` may pass 99.
2. Build it signed with your key (`COMMSHUB_KEYSTORE_PROPERTIES`, above):

   ```bash
   npm run pack:release
   ```

   The last lines print the APK's path, size and SHA-256.
3. Rename the APK to `CommsHub-<version>.apk` and upload it to `android-releases/android/`.
4. Write `latest.json` with the figures from step 2, and upload it last, so the application never reads a
   release that is not there yet:

   ```json
   {
     "version": "0.1.1",
     "code": 101,
     "file": "CommsHub-0.1.1.apk",
     "size": 7590000,
     "sha256": "<the 64 lowercase hex characters printed>",
     "minimum": null,
     "notes": ["سطر قصير لكل تغيير يراه الناس."],
     "date": "2026-11-01T08:00:00.000Z"
   }
   ```

   - `minimum`: the oldest version allowed to keep running without updating. Leave it `null` unless an older
     application must not be used any more. The site has its own floor too (`MINIMUM_ANDROID` in
     `src/lib/native/releases.ts`), raised only when a change of the site needs a newer application.
   - `notes`: up to eight short Arabic lines. They appear in the update window and, after the update,
     in «ما الجديد».

**What the application checks** before Android asks the person: the size and the SHA-256 against `latest.json`;
the application's own id; a newer version; and the application's own signing key. A release signed with any
other key is refused. That is why the key must never change (above).

A site change that needs a newer application must be pushed (which deploys it) only after the release is
published.

**Google Play Protect.** Until Google knows the application, through developer verification of
`sa.commshub.app` or Google Play, Play Protect shows "App scan recommended" on the first installation and on
each update, with «Scan app» and «Don't install app».
- «Scan app» sends the APK to Google for a scan, then the installation goes on. The site's text recommends it.
- «More details» then «Install without scanning» installs without sending it.

The update check takes that second path, so it sends nothing to Google.

## The update check

`qa/android-update.cjs` builds the check package at 0.1.0 and 0.1.1 (`COMMSHUB_CHECK_VERSION`, check package
only), and a copy of 0.1.1 re-signed with a throwaway key made for the run and deleted after it. It serves its
own feed at `http://127.0.0.1:3002/android`, which is the check package's compiled feed, and drives the whole
path on the emulator.

## Links that open the application

Android opens the site's links in the application only after it has read `https://comms-hub-three.vercel.app/.well-known/assetlinks.json`
and found there the certificate the installed application is signed with (`public/.well-known/assetlinks.json` in this
repository). Until the owner gives it, the file holds the stand-in `OWNER_RELEASE_KEY_SHA256`.

1. Read the release certificate's SHA-256 fingerprint (it is public), with the `keytool -list` command of "The release key"
   above; it looks like `AB:CD:…` (32 pairs).
2. Put it in place of `OWNER_RELEASE_KEY_SHA256` in `public/.well-known/assetlinks.json`, commit, and push: the site must
   serve it before the release is published. A signed `npm run pack:release` refuses to finish while the file names
   another certificate.
3. In Supabase, "Authentication", "URL Configuration", add `https://comms-hub-three.vercel.app/app/return` to the
   allowed redirect addresses, so a link mailed from the sign-in screen inside the application can come back to it.
4. If Google Play later signs the application with a key of its own, add that certificate's fingerprint too (Play
   Console, "App integrity").

## Push notices (the owner's Firebase project)

Push notices go through Firebase Cloud Messaging. The application needs four public identifiers of the owner's
Firebase project at build time, and the site needs the project's service account to send. Neither is in this
repository.

1. Create a Firebase project (free) and add an Android application with the package name `sa.commshub.app`. To
   try push on a phone with a development build, add `sa.commshub.app.dev` as a second Android application of the
   same project. Download `google-services.json` and keep it outside the repository, for example beside the
   release key in `D:/keys/`.
2. Name it when building, the same way as the key:

   ```powershell
   $env:COMMSHUB_GOOGLE_SERVICES = "D:/keys/google-services.json"
   npm run pack:release
   ```

   The build takes only the identifiers of the client whose package name is the build's own id (`build.gradle`,
   `firebaseFor`). Without the file, or without a client for that id, the application builds and offers no push:
   «أجهزتي» still lists the phone, with no notices.
3. In the Firebase console, "Project settings", "Service accounts", generate a private key for the Firebase Admin
   SDK, and paste the JSON once in «الإعدادات» on the site (A5's server half). It is stored in Supabase Vault and
   never read back.

What the application asks: Android 13 and newer ask the person for notices after the site has said why
(«تنبيهات الهاتف»). No token is made before then (`firebase_messaging_auto_init_enabled` is off): the application asks
Firebase for one only once notices are allowed.

## Google Play (A8)

Google Play's copy is the `play` channel: the same application, signed with the same key, with no permission to install
packages and no update of its own. Play updates it, and the page shows Play's offer in the same update window
(`MVP_draft.md` 64.6). Google's Play in-app updates library (`com.google.android.play:app-update`, pinned in
`variables.gradle`) is in this channel alone; the APK channel carries none of it.

**Building the release.** With the key and the Firebase file named as for the APK:

```powershell
$env:COMMSHUB_KEYSTORE_PROPERTIES = "D:/keys/commshub-release.properties"
$env:COMMSHUB_GOOGLE_SERVICES = "D:/keys/google-services.json"
npm run pack:play
```

It prints the `.aab` path, size and SHA-256. Like a signed APK, a signed bundle must carry the certificate the site's
`assetlinks.json` names, or the build refuses to finish. Raise `version` in `package.json` first, as for an APK: Play
refuses a whole number it has already seen. A release for both channels has the same version.

**The key in Play.** Choose your own app signing key at the first upload (Play Console, "App integrity"), with
Google's PEPK tool and the command the Console shows, so that Play signs with the same key as the APK and an installed
APK updates from Play. The bundle is signed with the same key too. Google recommends a separate upload key; using one
needs the build's certificate check changed first. Everything else the owner enters in the Console, in order, is in
`Play_Console_Drafts.md`.

**Marking a release required.** A Play release with in-app update priority 4 or 5 (set through Play's Developer API
when the release is rolled out) cannot be put off: the window offers only Play's full-screen update. The site's own
floor, `MINIMUM_ANDROID`, applies to both channels.

**The Play check.** `qa/android-play.cjs` builds the bundle (unsigned) and reads its manifest with bundletool from
Gradle's cache, then installs Google Play's copy of the check package, which asks Play's `FakeAppUpdateManager` (an
application not installed from Play has nothing to ask Play about). The check plays Play's part through the package's
own receiver (`src/playQa/QaPlay.java`): a release offered, put off, downloaded with its share shown, the restart, and a
required release declined. Play's real update is the owner's check, through Play's internal testing track.

**The listing's pictures.** `qa/play-graphics.cjs` draws `play/icon-512.png` and `play/feature-graphic-1024x500.png`
from the brand logo and the site's fonts.

## The files check

`qa/android-files.cjs` compiles the site's own file buttons (`src/components/native/phone-file.tsx`) into a
fixture page and serves it at `http://127.0.0.1:3000`, with fixture files at the site's file routes. It saves,
opens and shares them on the emulator and reads the bytes back from Downloads, the gallery and the
application's cache folder. It also checks that a redirect to another address goes without the cookie, that a
page can name nothing but a file route, and that no Capacitor interface reaches a frame of another address.

## The upload check

`qa/android-upload.cjs` shares files into the check package from its own provider of made files (`src/qa/QaFiles.java`;
Android does not let the shell grant another application's files), reads them back from the page, and has the
application send a large one in the background to a stand-in of Google Drive's resumable protocol at
`http://127.0.0.1:3004/upload/`, which drops the connection once. It also takes a photo with the emulator's camera.

## Where the rules are

| File | Holds |
|---|---|
| `capacitor.config.json` | the release's configuration: the production address, no cleartext, no inspection |
| `scripts/config.mjs` | the debug and check builds' configuration, derived from it |
| `android/app/build.gradle` | the version (from `package.json`), the address list per build, the check package, the key from outside |
| `android/app/src/play/`, `android/app/src/direct/` | Google Play's updates (`PlayUpdate`) and the APK channel's empty one; the APK channel's permission to install and its receiver (`src/direct/AndroidManifest.xml`); Google Play's check package's driver of Play's stand-in (`src/playQa/QaPlay.java`) |
| `android/app/src/main/java/sa/commshub/app/` | the window (`MainActivity`), where an address goes (`Navigation`), the page's view of the application (`Identity`, `Shell`), Play's update states in the page's words (`PlayStates`), downloads, saving, opening and sharing the site's files (`Downloads`, `FileNames`, `SiteFiles`), Capacitor's page interfaces and cookie handler taken off (`Shell.narrow`), links (`Links`), the lock (`AppLock`), files held for the page, shared in and uploaded in the background (`Held`, `Incoming`, `Uploads`, `UploadWorker`; the check package's `src/qa/QaFiles.java`), push notices (`Push`, `PushService`, `ShellApp`; the check package's own `src/qa/QaPush.java`), the narrowed permissions (`ShellChromeClient`), the refused file routes and the connection screen (`ShellWebViewClient`) |
| `www/offline.html` | the connection screen |

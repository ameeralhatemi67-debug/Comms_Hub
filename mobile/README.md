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

Each command copies `www/` and `capacitor.config.json` into the Android project (`cap sync`), writes the
local configuration of the debug and check builds, runs Gradle, and prints the APK's path, size and SHA-256.
The APK lands in `android/app/build/outputs/apk/direct/<kind>/`. The `play` channel (`node scripts/build.mjs
release play`) waits for Google Play (A8).

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
  identity script), on the JVM. On Windows, run `gradlew.bat testDirectReleaseUnitTest` in `android/` with
  `JAVA_HOME` set to the JDK above.
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

This part arrives with A3: the public bucket `android-releases`, `latest.json` and the update window. Until
then, a signed APK can be installed by hand on a pilot phone.

## Where the rules are

| File | Holds |
|---|---|
| `capacitor.config.json` | the release's configuration: the production address, no cleartext, no inspection |
| `scripts/config.mjs` | the debug and check builds' configuration, derived from it |
| `android/app/build.gradle` | the version (from `package.json`), the address list per build, the check package, the key from outside |
| `android/app/src/main/java/sa/commshub/app/` | the window (`MainActivity`), where an address goes (`Navigation`), the page's view of the application (`Identity`, `Shell`), downloads (`Downloads`, `FileNames`), the narrowed permissions (`ShellChromeClient`), the refused file routes and the connection screen (`ShellWebViewClient`) |
| `www/offline.html` | the connection screen |

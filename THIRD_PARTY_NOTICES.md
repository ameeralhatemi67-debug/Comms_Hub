# Third-party notices

Libraries whose licences ask for a notice when their code is served to browsers. Each is used
unmodified from `node_modules`, at the exact version pinned in `package.json`.

## Mediabunny

- Package: `mediabunny` 1.61.2, used by the studio (`/motion/studio`) to read, decode, encode and write
  audio and video in the browser.
- Licence: Mozilla Public License 2.0. Source: https://github.com/Vanilagy/mediabunny
- The files are not modified. A change to any of them would have to be published under the same licence.

## Mediabunny AAC encoder

- Package: `@mediabunny/aac-encoder` 1.61.2, loaded by the studio only on browsers that cannot encode AAC
  audio themselves.
- Licence of the package: Mozilla Public License 2.0. Source: https://github.com/Vanilagy/mediabunny
- It contains a WebAssembly build of FFmpeg's AAC encoder (`libavcodec`, `libavutil`), configured with
  `--disable-everything --enable-avcodec --enable-encoder=aac` and without `--enable-gpl` or
  `--enable-nonfree`. That part is licensed under the GNU Lesser General Public License, version 2.1 or
  later. FFmpeg source: https://ffmpeg.org/download.html. The WebAssembly module is a separate file loaded
  at run time and can be replaced by another build of the same encoder.

## Fonts

All fonts are served from the site itself, from the `@fontsource` packages pinned in `package.json`
(version 5.3.0 each), unmodified. Each font is licensed under the SIL Open Font License, version 1.1
(https://openfontlicense.org), which allows bundling and serving them with the site; the licence text is in
each package's `LICENSE` file. The font software may not be sold on its own.

- Used across the site: IBM Plex Sans Arabic, Reem Kufi, Aref Ruqaa.
- Added for the studio's text (2026-10-20), Arabic: Cairo, Tajawal, Almarai, Readex Pro, Noto Kufi Arabic,
  Changa, Amiri, Noto Naskh Arabic, Markazi Text, El Messiri, Lalezar, Rakkas.
- Added for the studio's text (2026-10-20), English: Inter, Montserrat, Poppins, Raleway, Oswald,
  Bebas Neue, Anton, Playfair Display, Merriweather, Dancing Script.

## The desktop application (`desktop/`)

The application installed on Windows (`Desktop_App_Plan.md`) ships the components below beside its own code.
None of them is modified. Each is pinned: Electron and the bundled packages in `desktop/package.json` and
`desktop/package-lock.json`, FFmpeg in `desktop/ffmpeg.lock.json`.

### Electron and Chromium

- Electron 44.5.1 (MIT licence), which contains Chromium and Node.js under their own licences.
- The package carries their notices as Electron ships them: `LICENSE.electron.txt` and
  `LICENSES.chromium.html`, in the application's folder.

### Packages bundled into the application's code

- electron-updater 6.8.10 and the packages it uses, bundled into the code by esbuild: builder-util-runtime,
  debug, fs-extra, graceful-fs, has-flag, js-yaml, jsonfile, lazy-val, lodash.escaperegexp, lodash.isequal,
  ms, sax, supports-color and universalify.
- Their licences are MIT, ISC and Blue Oak 1.0.0. The bundle does not keep their comments, so
  `scripts/build.mjs` writes each package's name, version and licence text into `THIRD_PARTY_LICENSES.txt`.
  The package ships that file in its `resources` folder.

### FFmpeg (from version 0.5.0, phase D5)

- **What.** FFmpeg n9.0.2-17-g2a571b6068, the shared Windows x64 build
  `ffmpeg-n9.0.2-17-g2a571b6068-win64-lgpl-shared-9.0.zip`, from the BtbN/FFmpeg-Builds release
  `autobuild-2026-09-30-13-08`, SHA-256 `7157177b8a6cb2174c1650ba8c71b363f2c78cba5330f88c4c02cf5b2b880646`.
- **What is shipped.** `ffmpeg.exe`, `ffprobe.exe` and their libraries (`avcodec-63`, `avdevice-63`,
  `avfilter-12`, `avformat-63`, `avutil-61`, `swresample-7`, `swscale-10`), with the build's `LICENSE.txt`, in
  `resources/ffmpeg`. The application runs the two programs as separate processes; it does not link them
  into its own code.
- **Licence.** The build is configured with `--enable-version3` and without `--enable-gpl` or
  `--enable-nonfree`, so it is licensed under the GNU Lesser General Public License, version 3. The full text
  is `resources/ffmpeg/LICENSE.txt`. Someone who has the application may replace these files with their own
  build of the same version.
- **Exact configure line,** as `ffmpeg -version` reports it:

  ```
  --prefix=/ffbuild/prefix --pkg-config-flags=--static --pkg-config=pkg-config --cross-prefix=x86_64-w64-mingw32- --arch=x86_64 --target-os=mingw32 --enable-version3 --disable-debug --enable-shared --disable-static --disable-w32threads --enable-pthreads --enable-iconv --enable-zlib --enable-libxml2 --enable-libvmaf --enable-fontconfig --enable-libharfbuzz --enable-libfreetype --enable-libfribidi --enable-vulkan --enable-libdav1d --enable-libvorbis --enable-librav1e --enable-librsvg --disable-libxcb --disable-xlib --disable-libpulse --enable-gmp --enable-lzma --enable-liblcevc-dec --enable-opencl --enable-amf --enable-libaom --disable-avisynth --enable-chromaprint --disable-libdavs2 --disable-libdvdread --disable-libdvdnav --disable-libfdk-aac --enable-ffnvcodec --enable-cuda-llvm --disable-frei0r --enable-libgme --enable-libkvazaar --enable-libaribb24 --enable-libaribcaption --enable-libass --enable-libbluray --enable-libjxl --enable-libmp3lame --enable-libopus --enable-libplacebo --enable-librist --enable-libssh --enable-libtheora --enable-libvpx --enable-libwebp --enable-libzmq --enable-lv2 --enable-libvpl --enable-openal --enable-liboapv --enable-libopencore-amrnb --enable-libopencore-amrwb --enable-libopenh264 --enable-libopenjpeg --enable-libopenmpt --disable-librubberband --enable-schannel --enable-sdl2 --enable-libsnappy --enable-libsoxr --enable-libsrt --enable-libsvtav1 --enable-libtwolame --enable-libuavs3d --disable-libdrm --enable-vaapi --disable-libvidstab --enable-libvvenc --disable-whisper --disable-libx264 --disable-libx265 --disable-libxavs2 --disable-libxvid --enable-libzimg --enable-libzvbi --extra-cflags=-DLIBTWOLAME_STATIC --extra-cxxflags= --extra-libs=-lgomp --extra-ldflags=-pthread --extra-ldexeflags= --cc=x86_64-w64-mingw32-gcc --cxx=x86_64-w64-mingw32-g++ --ar=x86_64-w64-mingw32-gcc-ar --ranlib=x86_64-w64-mingw32-gcc-ranlib --nm=x86_64-w64-mingw32-gcc-nm --extra-version=20260930
  ```

- **Source.**
  - FFmpeg's source at this version: https://github.com/FFmpeg/FFmpeg/commit/2a571b6068 (release
    branch 9.0), and https://ffmpeg.org/download.html.
  - The scripts that built these files, with every library they include: https://github.com/BtbN/FFmpeg-Builds
    at the tag `autobuild-2026-09-30-13-08`.
  - Before any copy of the application is given to people outside the organisation, the owner is to make
    sure this source stays available from those places, or keep a copy to hand on request. That copy would
    be the archive the build started from, at the same version.
- **What the application uses.** It names only the operating system's encoders (Media Foundation: `h264_mf`
  and `aac_mf`), FFmpeg's own decoders, and its scale and format filters (`desktop/src/media-jobs.ts`). The
  build also carries other encoders and libraries; the application never names them. Among them are the
  hardware encoders of NVIDIA, AMD and Intel, OpenH264, libvpx, libaom, SVT-AV1 and others.
- **Patents.** H.264, HEVC and AAC are covered by patents in some countries. The plan's line stands:
  internal use is a lower exposure; legal advice comes before any public release
  (`Desktop_App_Plan.md`, risks).

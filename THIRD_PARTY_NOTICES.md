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

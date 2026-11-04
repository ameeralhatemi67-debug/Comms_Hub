# The desktop application at the machine's strength: audit, ideas and a build order

Advice of 2026-11-03, at the owner's request: "make the desktop version far more capable than a browser tab, by using
the machine's real power, without hard-limiting it". The web version's behaviour is the floor; each machine rises
above it as far as it can measure, and steps down on any failure.

Status: written as ideas and a plan on 2026-11-03; the measurements in section 3 were made with a throwaway probe
outside the repository (section 2). **The owner chose D9 the same day ("Build D9 first"), and D9 is built:**
`MVP_draft.md` 63.6, desktop version 0.7.0, bridge version 6, with its checks `qa/desktop-profile.cjs` and
`qa/studio-crossdevice.cjs`; what was measured and what failed is in `progress.md`, 2026-11-03. D10 onward are not built.

Companion documents: `Desktop_App_Plan.md` (D0 to D8), `MVP_draft.md` sections 62 and 63 to 63.5,
`Studio_Build_Plan.md`, `Studio_Feasibility_and_App_Path.md`, `HyperFrames_Studio_Learnings.md` (H-01 to H-23, which
this document builds on rather than repeats), `progress.md` (D2 to D6 entries of 2026-10-20 and 2026-10-21).

## Contents

1. [The answer in short](#1-the-answer-in-short)
2. [How this was worked out](#2-how-this-was-worked-out)
3. [Measured on the owner's laptop](#3-measured-on-the-owners-laptop)
4. [Audit: where the editor is limited today](#4-audit-where-the-editor-is-limited-today)
5. [The design principle, challenged](#5-the-design-principle-challenged)
6. [Ideas](#6-ideas)
7. [Rejected](#7-rejected)
8. [Ranked shortlist](#8-ranked-shortlist)
9. [Build order: D9 to D13](#9-build-order-d9-to-d13)
10. [Questions for the owner](#10-questions-for-the-owner)
11. [What to build first](#11-what-to-build-first)
12. [Found on the way](#12-found-on-the-way)
13. [Sources](#13-sources)

---

## 1. The answer in short

- **The editor is not limited by RAM or cores on a strong machine. It is limited by one encoder stream, one decode
  pass per clip, a paused preview with no frame cache, a manual preview resolution, and the wrong graphics chip.**
  All five are visible in the code, and four were measured on the owner's laptop.
- **The pilot laptop draws the studio on its weaker chip by default.** In a fresh Chromium profile, canvas, WebGL and
  WebGPU all ran on the AMD Radeon inside the processor, and WebGPU's `high-performance` request did not change that.
  Chromium's `--force_high_performance_gpu` switch moved all of them, and the video encoder, to the RTX 3050. The
  application sets no switch today.
- **The "stronger" chip is not stronger at everything.** One run each: two parallel 1080p H.264 encoders gave
  **185 frames a second on the RTX 3050 and 115 on the AMD chip**, but 4K H.264 hardware decoding gave **102 on the RTX
  and 187 on the AMD chip**. A single score, or a chip name, cannot pick the knobs. The profile has to be per operation.
- **The encoder has headroom one stream does not use.** On the AMD chip, one, two and three simultaneous 1080p encoders
  gave 74, 115 and 145 frames a second together; on the RTX 80, 185 and 187. Parallel export lanes are worth building,
  and the measured curve says how many lanes each chip takes.
- **10-bit and HDR output are not reachable on this hardware** through WebCodecs or Windows' own encoders: no 10-bit
  encoder was offered by either chip, `hevc_mf` refused 10-bit, and no AV1 encoder exists on either. HDR *sources*
  (phone footage) are the real problem, and they need consistent tone mapping, not HDR export.
- **The principle needs one correction.** "The exported result must not change with the machine" cannot mean the
  same bytes: the browser and the application on the same laptop already wrote files of 572,743,220 and 588,921,876
  bytes from one project (DT-06). The rule that can be held is: **output facts are fixed by the project and the export
  settings; only speed is decided by the machine**, proven by exact structure, exact composed frames on one machine
  across every knob, and a stated tolerance across machines (section 5).
- **Build first: D9 «قياس الجهاز»**, the measured profile, the graphics-chip choice and the cross-device proof harness
  (section 11). Every later gain depends on it, and it is small.

---

## 2. How this was worked out

### 2.1 Read

`AGENTS.md`; `Desktop_App_Plan.md` sections 1 to 14; `MVP_draft.md` 62 to 63.5; `Studio_Feasibility_and_App_Path.md`
sections 3, 11 and 12; `HyperFrames_Studio_Learnings.md` H-03, H-04, H-14, H-18, H-20, H-21; the D2 to D6 entries in
`progress.md`; `Status.md`. Code: every file in `desktop/src/` named in the brief, plus `cache-store.ts`,
`native-files.ts`, `native-media.ts`, `permissions.ts`, `files.ts`, `ipc.ts`, `preload.ts`; `src/lib/studio/`
(`export.ts`, `media.ts`, `compose.ts`, `preview.ts`, `target.ts`, `cache.ts`, `support.ts`, `photo.ts`, `cover.ts`,
`audio.ts`, `schema.ts`, `handles.ts`); `src/lib/native/device.ts`; `src/components/studio/export-panel.tsx`;
`src/components/native/device-info.tsx`.

### 2.2 Measured

A probe was written and run in the session's scratch folder, not in the repository (this session was limited to one
new file). It is described here so it can be rebuilt as `qa/desktop-profile.cjs` in D9.

- **Engine.** The repository's Electron 44.5.1 is not unpacked (`desktop/node_modules/electron/dist` is absent) and
  the release package's fuses refuse outside scripts, so the installed **Edge 156.0.4314.58** stood in for the
  application's Chromium 152. Same engine family, four versions apart: treat every number as indicative of the
  application, not as the application's own.
- **Method.** A fresh Edge profile, a headed window, background throttling off, one page that runs WebCodecs
  `isConfigSupported` for seven codecs at three sizes, WebGPU adapters for three power preferences, the WebGL renderer,
  canvas colour options, worker capabilities, then timed encodes (a 4K soft-noise picture drawn and scaled the way
  `compose.ts` draws a clip, an Arabic caption on top, snapshot as a `VideoFrame`), a timed decode of the encoded 4K
  stream, and one to three encoders fed the same frames at once. Run twice: as started, and with
  `--force_high_performance_gpu`.
- **FFmpeg.** The pinned LGPL build in `desktop/vendor/ffmpeg` (n9.0.2, tag `ff902`) was asked for its encoders,
  hardware accelerations, demuxers and filters, then timed on a 10-second 4K `testsrc2` clip with the D5 recipe `r1`.
- **Limits of the measurement.** One laptop. One run per configuration, so differences under about 15% are noise.
  Synthetic content. No studio document was exported in the probe; the studio's own export was last timed by DT-06.

### 2.3 How each claim is marked

**[READ]** seen in the code or the records, with the file. **[MEASURED]** measured on this laptop (section 3, or a
`progress.md` entry named). **[GUESS]** an expectation, with how to check it. **[UNVERIFIED]** a fact that depends on
something not available here, with how to verify it.

---

## 3. Measured on the owner's laptop

Windows 11 Home 10.0.26300, AMD Ryzen 5 6600H (12 logical cores), 16 GB reported by the browser, AMD Radeon (in the
processor, device 0x1681, driver 31.0.12044.3) and NVIDIA GeForce RTX 3050 Laptop (driver 32.0.16.1091), screen not HDR.

### 3.1 Which chip draws

| | As started | With `--force_high_performance_gpu` |
|---|---|---|
| WebGL renderer (the canvas's chip) | ANGLE, AMD Radeon, Direct3D 11 | ANGLE, NVIDIA GeForce RTX 3050 Laptop, Direct3D 11 |
| WebGPU, default request | AMD, RDNA 2 | NVIDIA, Ampere |
| WebGPU, `powerPreference: 'high-performance'` | **AMD, RDNA 2** | NVIDIA, Ampere |
| WebGPU, `powerPreference: 'low-power'` | AMD | NVIDIA |

WebGPU on both: `shader-f16`, `subgroups`, `timestamp-query`, `float32-filterable`, largest 2D texture 16384, largest
buffer 2 GiB.

### 3.2 Speed, frames per second (one run each)

| Test | AMD Radeon | RTX 3050 |
|---|---|---|
| 1080p H.264 encode, `prefer-hardware` | 76.4 | 87.7 |
| 1080p H.264 encode, `no-preference` (what the export uses today) | 74.9 | 74.2 |
| 1080p H.264 encode, `prefer-software` | 55.0 | 43.0 |
| 1080p, `brightness contrast saturate` filter on the drawn clip | 76.9 | 74.3 |
| 1080p, `blur(8px)` on the drawn clip | 70.7 | 72.0 |
| 4K H.264 encode, `prefer-hardware` | 20.2 | 22.8 |
| 4K H.264 encode, `prefer-software` | 11.7 | 13.5 |
| 4K H.264 decode of that stream, `prefer-hardware` | **187.0** | **101.7** |
| 4K H.264 decode, `prefer-software` | 102.8 | 95.7 |
| 1080p, one encoder (parallel test) | 74.3 | 79.7 |
| 1080p, two encoders together | 115.2 | **184.8** |
| 1080p, three encoders together | 144.9 | 186.5 |

**Corrected by D9's own measurement (2026-11-03, `qa/desktop-device-panel.json`, `qa/desktop-profile.json`).** The lane
figures above feed every encoder the same drawn frame, so they measure the encoders alone. With each lane drawing its
own frames of the effects document (D9's `bench.ts`), the application on the RTX gave **71.7, 76.6 and 83.1** frames a
second for one, two and three lanes: drawing on one thread becomes the limit, and lanes need the drawing in workers
(P-07) to gain what the encoders allow. Those runs were on a loaded laptop (largest spread 20.6%).

The main-thread time to draw and snapshot a frame was 0.3 to 1.2 ms in every 1080p and 4K run. **The JavaScript of a
simple frame is not the bottleneck; the encoder is.** Heavy documents (many texts, motion templates, covers) were not
timed. For comparison, DT-06 exported a ten-minute 1080p `testsrc2` project in the application at 114 frames a second
(`progress.md`, 2026-10-20); its content is far easier to encode than the probe's, so the two do not compare directly.

Derived, not measured: a ten-minute 4K30 export is 18,000 frames, so at 20 to 23 frames a second it takes about 13 to
15 minutes on this laptop if the encoder is the bound **[GUESS]**. 4K was not tried with parallel encoders.

### 3.3 What can be encoded and decoded (WebCodecs, both chips the same)

| Codec | Encode 1080p and 4K | Decode 4K |
|---|---|---|
| H.264 High | hardware and software, 4K60 included | hardware and software |
| HEVC Main | **no** (neither) | hardware only |
| HEVC Main 10 | **no** | hardware only |
| AV1 8-bit | software only | hardware and software |
| AV1 10-bit | **no** | hardware and software |
| VP9 8-bit and 10-bit (profile 2) | software only | hardware and software |

Canvas 2D accepted `colorType: 'float16'` and `colorSpace: 'display-p3'`. A worker has `OffscreenCanvas` with 2D,
`VideoEncoder`, `VideoDecoder`, `FontFace`, `self.fonts` and WebGPU, but **no `OfflineAudioContext`**. The page's
JavaScript heap limit was 3.76 GB.

### 3.4 The pinned FFmpeg

- **Present in the build** (D-9 lets jobs name only `h264_mf` and `aac_mf`): `hevc_mf`, `av1_mf`, `ac3_mf`, `mp3_mf`;
  also `h264_nvenc`, `hevc_nvenc`, `av1_nvenc`, `h264_amf`, `hevc_amf`, `av1_amf`, the Quick Sync encoders,
  `libopenh264`, `libsvtav1`, `libaom-av1`, `libvpx-vp9`, `prores_ks`, `dnxhd`. Decoders include `prores_raw` and
  `cfhd`. Accelerations: `d3d11va`, `d3d12va`, `cuda`, `qsv`, `amf`, `vulkan`, `opencl`. Filters include `deshake`,
  `scdet`, `silencedetect`, `afftdn`, `anlmdn`, `arnndn` (a neural network), `ebur128`, `loudnorm`, `tonemap`, `zscale`.
  No `vidstab` (GPL).
- **Windows' HEVC encoder** (`hevc_mf`) works at 8-bit only with `-hw_encoding 1`; at 10-bit it fails ("format
  negotiation failed"). `av1_mf`: "could not find any MFT", as neither chip encodes AV1.
- **A 720p light copy (recipe `r1`) of a 10-second 4K H.264 clip:** 2.96 s with software decoding, **3.62 s with
  `-hwaccel d3d11va`**, 2.63 s with `-threads 4`. Hardware decoding did not help a light copy of H.264 here. Made with
  `h264_mf`, the 10-second 4K source itself took 11.5 s.

---

## 4. Audit: where the editor is limited today

Ordered by how much each costs on a strong machine.

- **A-01, export is one lane.** [READ] `src/lib/studio/export.ts` lines 177 to 188: for each frame, every visible video
  clip's frame is awaited in turn, `composeFrame` draws on one canvas, and `await video.add()` hands it to one
  `CanvasSource`, so one encoder. [MEASURED] One H.264 encoder reached 74 to 88 frames a second at 1080p and 20 to 23
  at 4K, while two encoders together reached 115 (AMD) and 185 (RTX). A strong machine therefore leaves 50% to 130% of
  its encoder capacity unused.
- **A-02, no encoder preference, and the result does not say which encoder ran.** [READ] `export.ts` line 132 passes
  `codec`, `quality` and `keyFrameInterval` only; `hardwareAcceleration` stays at its default. Only
  `device-info.tsx` line 15 asks `prefer-hardware`, and only for display. Nothing records the encoder or the chip with
  an export. [MEASURED] `no-preference` ran at 74 on the RTX against 88 with `prefer-hardware` (one run; may be noise).
- **A-03, the weaker chip by default.** [MEASURED] Section 3.1. [READ] `desktop/src/main.ts` appends no command-line
  switch; the only remedy is the Windows settings guide `CHIP_GUIDE` in `src/lib/native/device.ts`. **[MEASURED in D9, which
  corrects this item]** the application's development package, with no switch, started on the RTX 3050 on this laptop,
  while Edge 156 starts on the AMD chip: the default is per program, so it is shown and chosen, never assumed
  (`qa/desktop-device-panel.json`).
- **A-04, the paused preview has no frame cache and decodes at full size.** [READ] `src/lib/studio/media.ts` line 306:
  `new mb.CanvasSink(v)` with no size and no pool. Mediabunny's guide: without `poolSize` "a new canvas is created for
  every canvas yielded". A 4K source allocates a 33 MB canvas per scrub step, keeps one frame (`last`), decodes one
  request at a time (`decodeLoop`), and seeks back to a key frame for every jump. [GUESS] Scrubbing a long-GOP 4K file
  costs tens to hundreds of milliseconds per step; measure as in P-02.
- **A-05, preview resolution is the person's job.** [READ] `src/lib/studio/handles.ts` `RESOLUTIONS` (full to 1/32) and
  `src/components/studio/editor.tsx` line 250: `usePref('resolution', { play: 1, pause: 1 })`. Nothing watches dropped
  frames. [UNVERIFIED] `Desktop_App_Plan.md` section 2 says several 4K tracks stutter; no measurement exists in
  `progress.md`.
- **A-06, every playing clip is its own media element, whatever the load.** [READ] `src/lib/studio/preview.ts` `sync`:
  one element per visible or audible clip, re-seeked at 0.12 s drift; reversed clips and stills go through the paused
  decoder while playing. No budget for how many streams the decoders can carry.
- **A-07, several shapes are exported one after another.** [READ] `src/components/studio/export-panel.tsx` lines 203 to
  249: each shape runs `exportVideo` again, decoding every source again, and its upload starts only when its export
  ends.
- **A-08, uploads wait for the whole file.** [READ] Same lines: `uploadToLibrary` and `uploadVersion` run after
  `exportVideo` returns. [GUESS] A 600 MB export on a 20 Mbit/s upload adds about four minutes after the export.
- **A-09, the light-copy queue is one job at a time, and copies are offered, not made.** [READ]
  `desktop/src/media-worker.ts` lines 81 to 87 (`encoding` holds one job); `desktop/src/media-jobs.ts` `heavy()` uses
  fixed thresholds (above 1080p, above 50 Mbit/s, ProRes, DNxHR, CineForm) and `PROXY_HEIGHTS` is 720 or 1080.
  [MEASURED] ProRes 4K converted at 1.3 times real time and a 720p copy at 3.47 times (`progress.md`, D5).
- **A-10, the export reads full-size frames for any output size.** [READ] `media.ts` line 307: `passSink` has no width,
  so a 1080p export of 4K sources decodes and copies 4K canvases, then scales them in `drawImage`. Changing this changes
  resampling, so it is an output decision (section 5), not a free speed knob.
- **A-11, photo adjustments are one CPU thread.** [READ] `src/lib/studio/photo.ts` lines 145 to 201: one worker, the
  whole picture as RGBA bytes through `getImageData` and `putImageData`, blur as six box passes. `PHOTO_MAX_SIDE` is
  8000 (`schema.ts` line 42), so up to 256 MB per pass. [GUESS] Seconds per change on a large photo; measure in P-17.
- **A-12, sound is mixed on the main thread, twice when loudness is normalised.** [READ] `src/lib/studio/audio.ts`
  `mixWindow`: an `OfflineAudioContext` per ten-second window, between video frames; `export-panel.tsx` line 194 runs
  `measureLoudness`, a whole extra decode and mix, before the export. [MEASURED] `OfflineAudioContext` does not exist in
  a worker, so moving the mix off the main thread means mixing in plain code.
- **A-13, library copies are fetched one 16 MB range at a time.** [READ] `desktop/src/cache-store.ts` `PART` and the
  copy loop: each range is awaited and held in memory before the next is asked. [GUESS] One connection through Vercel
  limits a first open of a large file; measure throughput with one and with three ranges in flight.
- **A-14, device facts are shown, never used.** [READ] `desktop/src/native.ts` `info` fetches
  `app.getGPUInfo('complete')` but `desktop/src/device.ts` keeps only the chips; the page tests one encoder
  configuration (1080p H.264). Nothing measures decode, 4K, parallel streams or speed, and nothing decides anything from
  them.
- **A-15, the window is unthrottled only while busy.** [READ] `native.ts` lines 292 to 307:
  `setBackgroundThrottling(false)` on `busy`, back on at `idle`. Idle-time work (section 6f) would need its own
  arrangement.
- **A-16, 8-bit sRGB throughout.** [READ] `export.ts` asks `getContext('2d')` with no colour options; `media-jobs.ts`
  forces `format=nv12` for every copy, so a 10-bit source becomes 8-bit; the export is H.264 8-bit. [MEASURED] No 10-bit
  encoder on this laptop (section 3.3). [GUESS] An HDR phone clip (HLG or PQ) is tone-mapped by Chromium's own path
  when drawn, which may differ between chips and drivers; this is the colour risk worth fixing (P-10).
- **A-17, fixed product ceilings.** [READ] `schema.ts`: 24, 25, 30 or 60 frames a second; a 1080-wide canvas
  (`RATIOS`); export short side 720, 1080 or 2160; `TRACK_LIMITS` 3 video, 2 graphics, 2 text, 3 sound; project document
  at most 1,000,000 bytes. These are product rules, not weak-machine assumptions. They should not scale with the
  machine (section 7, R-03).
- **A-18, the memory ceiling never applies in the application.** [READ] `src/lib/studio/target.ts` `MEMORY_CEILING`
  1.6 GB only where no private storage exists; the application always has it, and writes straight to a chosen file
  (D4). Not a limit there. [MEASURED] The page's heap limit is 3.76 GB; decoded frames live outside it.

What is **not** limiting, contrary to the brief's premise: total RAM, core count and disk speed are not the bottleneck
of any path read here. They become relevant only once lanes (P-05, P-06) and caches (P-02) exist to use them.

---

## 5. The design principle, challenged

The brief's principle: *the web version's behaviour is the floor, and each machine rises above it as far as it can
measure, with graceful step-down on any failure, never a hard tier wall.* Five corrections make it buildable.

### 5.1 Output facts are fixed; speed is measured

Every knob is one of two kinds.

| Kind | Examples | Who decides | May vary with the machine |
|---|---|---|---|
| **Speed knobs** | preview resolution, frame cache size, prefetch depth, export lanes, light-copy queue width, photo tile workers, graphics chip | the profile, then the person's override | **yes**, freely |
| **Output facts** | codec, profile, size, frame rate, bit depth, colour handling, audio rate and channels, the encoder's quality target, the resampling recipe | the project and the export settings | **never** |

The machine never chooses an output fact. If a machine cannot make the chosen output on its fast path, it takes the
floor path (today's single-lane export, software encode if need be) and is slower, or it says plainly that it cannot,
with the reason. It never makes a lighter file instead.

### 5.2 "The same output" has three levels

Byte-equality is impossible with hardware encoders: the same project already gave two different files on one laptop
(DT-06). Hold three levels instead.

1. **Structure, exact, everywhere:** frame count, every timestamp, duration, audio sample count, container, codec
   profile, size, frame rate.
2. **Composed frames** (the canvas before encoding): **exactly equal on one machine for every knob setting** (a hash
   per frame), and **within a stated tolerance across machines** (DT-06 found 1 level of 255; propose a maximum
   difference of 2 levels and PSNR at least 50 dB on the corpus of P-37).
3. **Encoded file:** quality at least a floor against its own composed frames (propose PSNR 40 dB on the corpus) and
   bit rate within 15% of the target.

### 5.3 Measure per operation and per chip, never one score

The measured AMD chip decoded 4K nearly twice as fast as the RTX; the RTX ran two encoders 60% faster than the AMD chip.
A tier ("strong", "workstation") or a chip name would have picked wrong for one of the two. The profile is a set of
numbers per operation (P-33), and each knob reads the numbers it needs.

### 5.4 Some capabilities are facts, not tiers

"Never a hard wall" holds for speed. It cannot hold for a capability the hardware does not have: no encoder makes
10-bit on these laptops. Such a fact is shown with its reason in one place (H-06's `can(action)` with `reason`), and the
agent computer (D7) is the way round it. It is not hidden behind a tier, and it is never imitated.

### 5.5 The profile is a cache of measurements, never data

The profile lives on the device, keyed by what makes it true (section 6g). It is never written into a project, never
needed to open one, never sent to the site unless the owner decides otherwise (Q3). Deleting it only makes the next
session measure again.

### 5.6 What stays exactly as stated

The floor is today's behaviour, and every path, at every rung, ends at the floor: a knob that fails steps down until it
reaches today's code. The browser keeps today's defaults until the same proof (P-37) passes in Edge too; after that,
the browser may use the same policy for what it can prove, such as one-pass shapes (P-05).

---

## 6. Ideas

Thirty-eight ideas in seven groups. The first set the owner already had is not repeated as the answer; where an idea
refines one of them it says so, with what is new.

Each idea gives: **What**, **For**, **Needs** (bridge and site), **Uses** (machine resources), **Size** (S, M, L, XL),
**Risk**, **Rules** (whether it touches a hard constraint of the brief) and **Proof** (a re-runnable script under `qa/`
and its JSON, in the project's style).

### 6a. Editor performance

**P-01 The graphics chip chosen by measurement** (refines "capability profile")
- **What:** the application starts Chromium on the chip that the profile says is faster for the studio's own work,
  through `--force_high_performance_gpu` or `--force_low_power_gpu`, set before `app.whenReady()`.
- **For:** the director and the Admin on dual-chip laptops; the guide `CHIP_GUIDE` becomes a fallback.
- **Needs:** a setting in `desktop/src/settings.ts` from a fixed list (`auto`, `strong`, `saving`); a bridge call
  `gpu.choose(choice)` that writes it and offers a restart; `info` already reports the active chip. The site shows
  «بطاقة الرسوميات للاستوديو»: «تلقائي»، «الأقوى»، «الموفّرة للطاقة», and «تُطبَّق بعد إعادة تشغيل التطبيق.».
  `auto` uses the profile's numbers on mains power and the saving chip on battery (`powerMonitor.isOnBatteryPower`).
- **Uses:** the discrete chip's power and heat.
- **Size:** S.
- **Risk:** battery and heat; a restart is needed; a driver that misbehaves on one chip.
- **Rules:** none. The page sends a word from a fixed list, never a switch.
- **Proof:** `qa/desktop-gpu-choice.cjs`: plain launches with each choice; `info.gpu.active` and the WebGL renderer
  read back; the P-33 benchmark run on each; JSON with the chip and the numbers per choice. Measured already: the switch
  moves canvas, WebGL, WebGPU and the encoder (section 3.1).

**P-02 A scrub cache for the paused preview**
- **What:** the paused decoder gets a pool and a size (Mediabunny `CanvasSink` `poolSize`, `width`, `height` at the
  preview canvas's size), a ring of recently decoded frames sized from the profile, and look-ahead decoding of the
  frames around the playhead while nothing else runs. The export keeps its full-size decoder (A-10).
- **For:** the designer and the media producer, every time they scrub a 4K or long-GOP clip.
- **Needs:** site only (`src/lib/studio/media.ts` `frameNear` and `decodeLoop`); the frame budget from the profile.
- **Uses:** graphics memory and RAM, continuously sized (for example 256 MB to 3 GB).
- **Size:** M.
- **Risk:** the promise of 62.7, "the paused frame is the exported frame". It is about which frame, not which pixels at
  a reduced preview size; at «كاملة» the cache holds full-size frames, so the promise holds exactly.
- **Rules:** none.
- **Proof:** `qa/studio-scrub.cjs`: 200 random seeks on a 4K 60 Mbit/s H.264 fixture with a 2 s and a 10 s key-frame
  interval; median and 95th-percentile time to the right frame, before and after; frame identity at 48 times as DT-12;
  peak memory. Gate: median at least three times faster, identity 48 of 48.

**P-03 «تلقائية»: preview resolution that follows the frame rate**
- **What:** a new first entry in `RESOLUTIONS`. While playing, the stage watches its own frame times and the elements'
  `getVideoPlaybackQuality()`, steps down a level after a run of dropped frames, steps up after a calm run, and
  remembers the last good level per project shape on this device. The badge reads «تلقائية: 1/2».
- **For:** everyone in the studio; the person stops guessing.
- **Needs:** site only (`handles.ts`, `stage.tsx`, `editor.tsx`); a device preference like today's.
- **Uses:** nothing new; it spends what the machine has.
- **Size:** S.
- **Risk:** visible jumps in sharpness; hysteresis must be slow enough.
- **Rules:** none. Default «تلقائية» in the application; in a browser the default stays «كاملة» until the owner says
  otherwise.
- **Proof:** `qa/studio-autores.cjs`: three 4K tracks played for 20 s on the RTX, on the AMD chip and with
  `--disable-gpu`; dropped frames and the chosen level per run. Gate: dropped frames at most 2% with «تلقائية» on
  every run.

**P-04 A stream budget for playback**
- **What:** before playing, the player counts the simultaneous video streams at the playhead and their sizes, compares
  them with the profile's measured decode capacity, and plays the excess from light copies (D5) where they exist, or
  lowers that clip's element to a smaller copy, rather than letting every element compete.
- **For:** the media producer with picture-in-picture or split screens of 4K footage.
- **Needs:** site only (`preview.ts` `sync`, `media.ts` `element`); the profile's decode numbers.
- **Uses:** the hardware decoders, within what they can carry.
- **Size:** S to M.
- **Risk:** a clip that switches between original and copy mid-play may jump; switch only at play start or a seek.
- **Rules:** none. Export is unaffected.
- **Proof:** in `qa/studio-autores.cjs`: three 4K streams with a budget of two; the third plays from its copy; dropped
  frames recorded.

**P-05 One pass, several shapes**
- **What:** when 62.10 exports two to four shapes, decode each source once and compose every shape for the same moment
  into its own canvas and encoder. The number of shapes run together is the measured number of encoder lanes; the rest
  follow, as today.
- **For:** the director, who exports 9:16, 1:1 and 16:9 for different platforms from one project.
- **Needs:** site only (`export.ts` takes a list of shape documents; `export-panel.tsx` loops over results, not over
  exports).
- **Uses:** encoder sessions and graphics memory, one canvas per shape.
- **Size:** M.
- **Risk:** memory with four 4K canvases; a failure in one shape must not lose the others.
- **Rules:** none. Each file is composed by the same `composeFrame` with the same inputs.
- **Proof:** `qa/studio-shapes-onepass.cjs`: four shapes one pass against four sequential exports on the same machine;
  composed-frame hashes identical per shape; ffprobe structure identical; time recorded.

**P-06 Export lanes: parallel segments joined into one file** (refines "parallel segment export")
- **What:** cut the timeline into K segments on key-frame boundaries (the export already puts a key frame every two
  seconds); each lane decodes, composes and encodes its own segment with its own `VideoEncoder`; the packets join in
  order through Mediabunny's `EncodedVideoPacketSource` into one track; sound is mixed and encoded once. K comes from
  the measured encoder curve (on this laptop: 3 on the AMD chip, 2 on the RTX).
- **New against the first set:** the lanes can start on the main thread (the measured frame code costs 0.3 to 1.2 ms;
  the encoder is the bound), so this does not wait for P-07. And the join is guarded: every lane's decoder configuration
  (codec string and `description` bytes) must be identical, or the run steps down to one lane before writing anything.
- **For:** the director and the Admin with long or 4K exports.
- **Needs:** site only (`export.ts`), and the profile's lane count.
- **Uses:** encoder sessions, decoder sessions (one per lane per source), graphics memory.
- **Size:** L.
- **Risk:** rate control restarts at each segment, which can show as a quality step at the boundary; a source decoded
  by K lanes costs K times its decode; 4K lanes were not measured.
- **Rules:** none, under section 5.2: composed frames identical to one lane, structure exact.
- **Proof:** `qa/studio-lanes.cjs`: ten-minute 1080p and 4K fixtures with K = 1, 2, 3; composed-frame hashes equal to
  K = 1 for every frame; ffprobe structure equal; PSNR of each boundary frame within 0.5 dB of K = 1; a forced
  configuration mismatch falls back to one lane and still writes a valid file; times recorded.

**P-07 The export's picture side in a worker**
- **What:** the compositor and the encoder run in a dedicated worker on an `OffscreenCanvas`; the sound windows are
  mixed on the main thread (no `OfflineAudioContext` in workers, measured) and posted to the worker as samples. Later
  lanes (P-06) become workers.
- **For:** everyone: the editor stays responsive during an export, in a browser too.
- **Needs:** site only. The drawing modules lose their `document` uses (thirteen in seven files of
  `src/lib/studio`, seven in `src/lib/motion/renderers.js`): one canvas factory, brand marks rasterised on the main thread and passed as
  `ImageBitmap`s (an SVG cannot be decoded in a worker), fonts loaded through `self.fonts` from the same served files.
- **Uses:** a second thread and its graphics context.
- **Size:** L.
- **Risk:** Arabic shaping or font fallback differing between the page and the worker; H-05's corpus must pass in both.
- **Rules:** none.
- **Proof:** `qa/studio-export-worker.cjs`: the corpus of P-37 exported both ways on one machine; composed frames
  identical by hash; the editor's input delay during the export, before and after.

**P-08 Light copies made automatically, in parallel, when the machine is free** (refines "automatic light copies")
- **What:** on import, heavy sources join a queue in the utility process. The queue width comes from the profile
  (Windows' encoder's parallel sessions, to be measured), and it pauses within a second when the editor plays, scrubs
  or exports (P-30). Clips on the timeline near the playhead go first. The thresholds of `heavy()` become the profile's
  measured decode capacity, so a strong machine makes fewer copies and a weak one more.
- **For:** the media producer importing a shoot.
- **Needs:** bridge `media.queue(refs)` and `media.pause(reason)` from fixed lists; the recipes stay `r1`.
- **Uses:** the encoder, disk space (the cache limit applies), heat.
- **Size:** M.
- **Risk:** stealing the encoder from an export: the queue pauses during `busy`.
- **Rules:** none. Fixed jobs, refs only, no paths.
- **Proof:** `qa/desktop-proxy-queue.cjs`: ten 4K fixtures imported; time to all copies with width 1 and 2; the stage's
  95th-percentile frame time while the queue runs; the queue paused within one second of an export starting.
- **Measured caution:** hardware decoding did not speed up a light copy of H.264 (section 3.4). Keep software decoding
  for `r1`, and try `d3d11va` only for sources whose software decoding is slow (4K HEVC 10-bit, AV1), measured first.

**P-09 One effect, three back ends** (extends H-03)
- **What:** each picture effect (the grade of H-03, LUT looks, blur covers, later scopes) is written once as a
  specification with a pure JavaScript reference, then as a WebGL2 shader and a WebGPU shader. The profile picks the
  fastest back end that has passed its tolerance test on this machine; the JavaScript reference is the floor.
- **For:** the designer: heavy effects in real time on a strong chip, the same picture on a weak one.
- **Needs:** site only (`src/lib/studio/grade.ts` of H-03 becomes `effects/`).
- **Uses:** the graphics chip.
- **Size:** L.
- **Risk:** three implementations drifting apart; held by tests, not by care.
- **Rules:** none, if the tolerance of section 5.2 is held.
- **Proof:** `qa/studio-effects-parity.cjs`: every effect at five strengths on the corpus, three back ends; maximum
  difference and PSNR against the JavaScript reference; the back end refused on a machine where it fails.

### 6b. Editor capability

**P-10 HDR and 10-bit phone footage, tone-mapped the same way everywhere**
- **What:** a source whose transfer is HLG or PQ (read from the decoder's `colorSpace`, or from `probe`) is drawn
  through one explicit tone map with fixed parameters (in the P-09 effect back ends), instead of whatever the chip's
  path does. The clip's settings say «فيديو بمدى ديناميكي عالٍ (HDR): يُحوَّل إلى المدى العادي بالطريقة نفسها على كل
  جهاز.». Output stays 8-bit SDR H.264.
- **For:** the media producer: phones record HDR by default, and today their footage may look different on each
  laptop.
- **Needs:** site (`compose.ts` draws such a clip through the effect); in the application a converted copy for a source
  the browser decodes badly, through FFmpeg's `zscale` and `tonemap` (both in the pinned build) as a new fixed recipe.
- **Uses:** the graphics chip.
- **Size:** M.
- **Risk:** a tone map that looks flat to the eye; choose it with the owner on real footage.
- **Rules:** a new fixed recipe in `media-jobs.ts`; LGPL filters only.
- **Proof:** `qa/studio-hdr.cjs`: HLG and PQ fixtures exported on both chips and in Edge; PSNR between chips at least
  45 dB; against a reference tone map computed in plain code at least 40 dB.

**P-11 Analysis that becomes project data: silence and scene changes**
- **What:** «اقتراح القص عند السكتات» and «علامات عند تغيّر اللقطة»: new fixed jobs `silence` and `scenes` run
  `silencedetect` and `scdet` (both LGPL, in the pinned build) and return times only. The studio turns them into markers
  or proposed cuts the person accepts. In a browser, silence comes from the waveform already decoded (`peaks.ts`).
- **For:** the media producer cutting interviews and long recordings.
- **Needs:** bridge `media.analyse(ref, kind)` with `kind` from a fixed list; the result is numbers.
- **Uses:** a core or two for a few seconds a minute of footage **[GUESS]**.
- **Size:** M.
- **Risk:** thresholds that suit one room and not another; the person chooses from three strengths.
- **Rules:** classical signal analysis, not AI; still worth the owner's yes (Q5).
- **Proof:** `qa/desktop-analysis.cjs`: fixtures with known silences and cuts; found within one frame; the same project
  opened in a browser shows the same markers, since they are data.

**P-12 «تثبيت الصورة» as keyframes**
- **What:** stabilisation computed on the strong machine, stored as the clip's transform keyframes (62.7 keys), so any
  device plays it with no special ability. First version: FFmpeg's `deshake` (LGPL) run on the light copy, its motion
  read back as numbers; `vidstab` is GPL and excluded.
- **For:** the media producer with handheld footage.
- **Needs:** bridge `media.analyse(ref, 'motion')`; the site converts motion to smoothed keys and a slight zoom.
- **Uses:** a core, a minute of footage at a time.
- **Size:** L.
- **Risk:** `deshake` is weak on large shakes; it may need our own block matching on the GPU later.
- **Rules:** none beyond Q5 (classical, not AI).
- **Proof:** `qa/desktop-stabilise.cjs`: a fixture shaken by a known path; residual motion after, in pixels; the project
  opens on a fresh browser profile with the same keys.

**P-13 «تنقية الكلام» as a library file**
- **What:** a fixed job runs `afftdn` or `anlmdn` (LGPL, classical) on a clip's sound and saves the result to the
  library as a new file through the normal upload, which the project then uses. A device-made asset becomes a library
  file, so no project depends on the device. `arnndn` is a neural network and waits for the owner (Q5).
- **For:** field interviews; complements H-19's Web Audio chain, which works everywhere.
- **Needs:** bridge `media.clean(ref)`; the site's existing upload.
- **Uses:** a core.
- **Size:** M.
- **Risk:** over-cleaning; offer two strengths and listen.
- **Rules:** none; the library file is reviewed like any other.
- **Proof:** `qa/desktop-clean-audio.cjs`: speech plus known noise; the noise floor measured before and after; the file
  appears as a library version through the normal route.

**P-14 More panels on other screens: «المقاييس», the timeline, the media** (extends D6)
- **What:** `PANELS` in `desktop/src/windows.ts` grows from `preview` to a fixed list of studio windows; scopes (H-20)
  are computed on the graphics chip from the preview frame and shown on the second screen.
- **For:** the director grading on a second monitor.
- **Needs:** bridge `windows.popOut` with the longer list; the site's `preview-link.ts` carries the scopes' frame.
- **Uses:** the graphics chip; a second display.
- **Size:** M.
- **Risk:** which window owns the editing keys; only the editor's window edits, as today.
- **Rules:** none; still one address per panel, built by the main process.
- **Proof:** `qa/desktop-windows.cjs` extended: each panel opens on the asked screen; scopes of a known gradient match a
  computed histogram.

**P-15 Loudness and waveforms worked out before they are needed**
- **What:** while the project is open and the machine is free (P-30), the loudness of the current mix is measured and
  kept by a hash of the document's sound, so «توحيد مستوى الصوت» starts the export at once instead of a full extra pass
  (A-12).
- **For:** the director exporting with normalisation.
- **Needs:** site only (`export.ts` `measureLoudness` with a cache).
- **Uses:** idle decoding time.
- **Size:** S.
- **Risk:** a stale value; the hash of the sound's clips, gains and sources decides.
- **Rules:** none.
- **Proof:** in `qa/studio-export.cjs`: the cached and the export-time measurement equal to 0.1 LU; time to first frame
  before and after.

**P-16 «تصدير دفعة» on lanes** (extends H-08)
- **What:** a template exported for N rows of fields (H-08) runs its exports on the measured lanes, two or three at a
  time, each a whole short export.
- **For:** the designer making a series (event cards, speaker quotes).
- **Needs:** site only.
- **Uses:** encoder sessions.
- **Size:** S once H-08 and P-33 exist.
- **Risk:** none new.
- **Rules:** none.
- **Proof:** a batch of 12 with one and with two lanes; outputs identical by composed hash; time recorded.

### 6c. Photo editor

**P-17 Photo adjustments in tiles across workers, on the graphics chip once proven**
- **What:** `adjustImage` (`photo.ts`) splits the picture into tiles with a blur halo and runs them on as many workers
  as the profile allows; the P-09 GPU back end takes over where it passes its tolerance. The preview adjusts the
  screen-sized picture first, the full size after.
- **For:** the designer editing large photos.
- **Needs:** site only.
- **Uses:** cores, then the graphics chip.
- **Size:** M.
- **Risk:** halo arithmetic at tile edges; exact equality with today's single pass is required for the worker path.
- **Rules:** none.
- **Proof:** `qa/studio-photo-tiles.cjs`: an 8000 by 6000 photo, every adjustment; single worker against N workers
  identical to the byte; GPU within 1 level; times recorded.

**P-18 Phone pictures (HEIC) and camera RAW, converted on the laptop**
- **What:** «تحويل إلى صورة قابلة للتحرير» for a HEIC picture from an iPhone and, if the team shoots RAW, a camera RAW
  file. HEIC through FFmpeg (its HEVC decoder is LGPL) **[UNVERIFIED: whether n9.0.2 reads HEIF image grids; check with
  an iPhone sample]**; RAW through a pinned LibRaw build (LGPL 2.1 or CDDL), a second fixed program like FFmpeg. The
  result is a 16-bit PNG kept in the cache and uploadable to the library.
- **For:** the designer and the media producer; HEIC is the default iPhone format, and `desktop/src/files.ts` `TYPES`
  does not list it today.
- **Needs:** bridge `media.convertImage(ref)`; new kinds in `TYPES`.
- **Uses:** a core for a second or two a picture **[GUESS]**.
- **Size:** M for HEIC, L for RAW.
- **Risk:** RAW colour without camera profiles; a new third-party program to maintain.
- **Rules:** a new pinned program needs its licence in `THIRD_PARTY_NOTICES.md`; LibRaw only under the LGPL option.
- **Proof:** `qa/desktop-images.cjs`: HEIC and RAW samples with known sizes; output size, orientation and a colour
  patch within tolerance of a reference.

**P-19 Photo batch export straight to a folder**
- **What:** a photo project applied to N pictures (a layer marked as the picture's place), exported on parallel workers
  into one folder the person picks through the system dialog.
- **For:** the designer resizing and branding a set of pictures for an event.
- **Needs:** bridge `files.chooseFolderForOutput()` returning a handle-like token; the main process writes there, the
  page sends bytes and a file name only.
- **Uses:** cores and the graphics chip.
- **Size:** M.
- **Risk:** file names from Arabic titles (`fileName` in `export.ts` already cleans them).
- **Rules:** no path from the page; the folder is chosen in Windows' own dialog.
- **Proof:** `qa/desktop-photo-batch.cjs`: 50 pictures with one and four workers; PNG bytes identical between runs;
  time recorded.

### 6d. Workflow around the editor

**P-20 «استيراد من بطاقة الكاميرا»**
- **What:** the person picks a card or its folder in Windows' dialog; the application lists the media inside (by the
  `TYPES` list), copies them to a folder they chose with a SHA-256 check of each copy, joins a camera's split clips
  (MTS over 4 GB) by their order, hands the page tokens, and starts light copies (P-08). «تُنسخ الملفات ويُتحقَّق منها
  قبل استعمالها.»
- **For:** the media producer after a shoot.
- **Needs:** bridge `files.importFolder()` and `files.copyChosen(tokens)` (destination chosen in the dialog); no path
  in either direction.
- **Uses:** disk throughput.
- **Size:** M.
- **Risk:** cards removed mid-copy; the copy is a `.part` until verified, as copies are now.
- **Rules:** none.
- **Proof:** `qa/desktop-card-import.cjs`: a fixture folder shaped like a card (DCIM, AVCHD, split clips); copies
  verified; a pulled file mid-copy leaves nothing half-made; times per GB.

**P-21 «مجلد متابعة»**
- **What:** a folder the person chose; while the application is open, new media files in it appear in the studio's
  «هذا الجهاز» list (Node's `fs.watch` in the main process), for a screen recorder, a tethered camera or another
  program's exports.
- **For:** the media producer and the designer working with other tools.
- **Needs:** bridge `files.watchFolder()` (dialog) and an event with public views only (name, size, kind, token).
- **Uses:** nothing measurable.
- **Size:** S to M.
- **Risk:** names of files the person did not mean to show; only the chosen folder, one level, studio kinds only, no
  links followed out of it.
- **Rules:** nothing is scheduled in the site; the watch runs on the laptop while the application is open.
- **Proof:** `qa/desktop-watch.cjs`: files added, renamed, half-written and linked; only finished studio kinds appear,
  within two seconds; a junction out of the folder is refused.

**P-22 Drag an export out of the application**
- **What:** a finished export, or a file from «هذا الجهاز», can be dragged from the studio into another program
  (Explorer, an editor, a desktop messenger) through Electron's `webContents.startDrag`.
- **For:** the director handing a file to a colleague's tool.
- **Needs:** bridge `files.dragOut(token)` for tokens the main process issued or files it wrote; nothing else.
- **Uses:** nothing.
- **Size:** S.
- **Risk:** small.
- **Rules:** none; a token, never a path.
- **Proof:** unit tests in `desktop/tests` (unknown and revoked tokens refused). The drag itself is the operating
  system's and cannot be driven by Playwright: it is an owner walkthrough step, said plainly.

**P-23 Recording the screen into the studio**
- **What:** «تسجيل الشاشة»: a window or the screen, with the microphone, recorded by WebCodecs straight to a file on the
  laptop and added as a «هذا الجهاز» source; for help guides and tutorials.
- **For:** the Admin and the director making guides (the site's help system).
- **Needs:** the permission policy (`desktop/src/permissions.ts`) grants `media` for audio only and refuses display
  capture today; this needs `display-capture` granted to the compiled address, with Electron's
  `setDisplayMediaRequestHandler` showing Windows' own picker.
- **Uses:** the encoder while recording.
- **Size:** M.
- **Risk:** recording private mail or messages by mistake; the recording stays on the device until uploaded.
- **Rules:** **changes the D1 permission rule** (camera and capture refused): the owner's decision. The camera itself
  stays refused unless the owner says otherwise.
- **Proof:** `qa/desktop-record.cjs`: a test window recorded 10 s; frames and sound present; a foreign page still
  refused capture.

**P-24 «تجهيز المشروع للعمل دون اتصال»: keep editing through a dropped connection**
- **What:** one action copies every library source of a project into the cache folder and makes its light copies;
  when the connection drops, the open editor keeps working on local media, keeps saving its device draft (`persist.ts`),
  and writes the autosave slot when the connection returns, after checking the lease. A line says «انقطع الاتصال: يستمر
  التحرير على هذا الجهاز، ويُحفظ في المركز عند عودته.». Starting the studio with no connection is not offered: the
  application keeps no copy of the site (D1).
- **For:** the media producer on location or on a weak office line.
- **Needs:** site (`use-project.ts` and the saver); bridge `cache.prepare(sources)`.
- **Uses:** disk.
- **Size:** M.
- **Risk:** a lease taken by someone else meanwhile; the conflict is shown and both states kept (feasibility 12.2).
- **Rules:** none; every write still goes through the database functions on reconnect.
- **Proof:** `qa/desktop-offline-edit.cjs`: the session set offline for five minutes (`session.enableNetworkEmulation`),
  edits made, the connection back; no edit lost; a taken lease produces the conflict, not an overwrite.

**P-25 «يُرفع الملف أثناء التصدير»**
- **What:** the export's stream feeds a resumable upload to the library's storage as it is written; the library
  record is created only when the last part is confirmed and the file read back for its size, so a cancelled export
  leaves nothing in the library.
- **For:** the director using «تصدير وإرسال للمراجعة».
- **Needs:** site (`target.ts` tees the stream; the upload route's resumable session); no bridge change.
- **Uses:** upload bandwidth during the export.
- **Size:** M.
- **Risk:** MP4 finalisation rewrites the header at the end (`fastStart: false` today means the index is written last,
  which suits streaming); the provider's resumable session must accept it.
- **Rules:** none; the same upload rules and review.
- **Proof:** `qa/studio-upload-while-export.cjs` against a stand-in provider: time from «تصدير وإرسال» to «أُرسل العمل
  للمراجعة» before and after; a cancel leaves no library row.
- **2026-11-04: parked. Not possible on Google Drive with the file unchanged** (`qa/studio-export-writes.mjs`, 9 of 9):
  - The export rewrites the mdat header at byte 28 only at finalize, and a file under 16 MiB is written in one write at
    the end.
  - Drive's resumable upload, the library's only provider, takes bytes only forward from byte 0, so nothing can be sent
    before the export ends.
  - It would work with S3 multipart as the library's provider, the first part sent last. A role's provider cannot be
    changed today (`src/lib/storage/index.ts`).

### 6e. The rest of the application

**P-26 Taskbar progress and a jump list**
- **What:** the taskbar button shows the export's progress (`BrowserWindow.setProgressBar`), red on failure; the jump
  list offers «الاستوديو» and «يحتاج قرارك», each a path of the site.
- **For:** the director who minimises during exports.
- **Needs:** bridge `life.progress(fraction)` (a number from 0 to 1) or carried on `busy`; jump list built in the main
  process from a fixed list.
- **Uses:** nothing.
- **Size:** S.
- **Risk:** none.
- **Rules:** none.
- **Proof:** unit tests of the mapping; `qa/desktop-native.cjs` reads `setJumpList`'s `ok` and the progress calls.

**P-27 «تشغيل التطبيق مع بدء Windows»**
- **What:** an opt-in tick in the tray menu; the application starts hidden in the tray at sign-in to Windows, so
  «يحتاج قرارك» notices arrive from the start of the day (`app.setLoginItemSettings`).
- **For:** the director and the assistant, who decide approvals.
- **Needs:** main process only.
- **Uses:** memory while idle.
- **Size:** S.
- **Risk:** an unsigned application starting at sign-in may alarm antivirus; better after signing (D-7).
- **Rules:** none; the page's minute reading is the page's own, as in D2.
- **Proof:** `qa/desktop-native.cjs`: the setting read back through `getLoginItemSettings`; started with the hidden
  argument, no window shown, the tray present.

**P-28 «فتح بالبرنامج الافتراضي» for a downloaded file**
- **What:** after a library, mail or messaging download finishes, the notice and the page offer to open it in its
  program (`shell.openPath`) or show it in its folder, for files the main process itself saved.
- **For:** everyone handling PDF, Word and Excel attachments.
- **Needs:** bridge `downloads.open(id)` and `downloads.show(id)` with ids the main process gave at `will-download`.
- **Uses:** nothing.
- **Size:** S.
- **Risk:** opening a program file; only document, picture, sound and video kinds from a fixed list, never `.exe`,
  `.lnk`, `.bat` or scripts, and Windows' mark of the web kept on the file.
- **Rules:** none; an id, never a path.
- **Proof:** unit tests of the kind list; a check that a saved file carries `Zone.Identifier`.

**P-29 Library copies fetched in parallel ranges**
- **What:** `CacheStore.copy` asks for two to four 16 MB ranges at once (the number from the measured link), writes
  each where it belongs, and resumes from the lowest gap.
- **For:** the first open of a large library video.
- **Needs:** main process only (`desktop/src/cache-store.ts`).
- **Uses:** bandwidth; the same number of requests to the site's file route.
- **Size:** S.
- **Risk:** the provider's or Vercel's limits on concurrent requests; measure before choosing more than two.
- **Rules:** none; the same route, the same session.
- **Proof:** `qa/desktop-files.cjs` extended with a local server that adds latency: copy time with one and three
  ranges; the copy's SHA-256 equal; resume after a cut.

### 6f. Idle time and several machines

**P-30 An idle-time broker on the laptop**
- **What:** one queue in the main process for the fixed background jobs (light copies, analysis, loudness, peaks,
  library prefetch). It runs only while the application is open, on mains power, when the CPU speed limit is 100%
  (`powerMonitor` `speed-limit-change`, documented for Windows) and the person is idle or only reading; it pauses within
  a second at input, playback or an export.
- **For:** everyone in the studio: work done before it is asked for.
- **Needs:** main process; bridge `life.activity(kind)` from a fixed list so the page can say "playing" or "exporting".
- **Uses:** spare cores, the encoder, disk.
- **Size:** M.
- **Risk:** heat and fan noise; a cap of cores from the profile and a visible line in the tray tooltip.
- **Rules:** nothing in the site is scheduled (E-1); this is the laptop's own housekeeping while the application is
  open, like the ten-day sweep "when the studio opens" (`Desktop_App_Plan.md` 5.0).
- **Proof:** `qa/desktop-idle.cjs`: a queued copy pauses within 1 s of simulated input and of `busy`; resumes after idle;
  never runs on battery (simulated); the stage's frame time unaffected while paused.

**P-31 A shared cache folder on the office NAS**
- **What:** the cache folder (D4) chosen on the NAS share, safe for the two laptops at once: a copy is written under a
  name unique to its writer and renamed only once its size and checksum match the site's; readers trust only complete
  names.
- **For:** the Admin and the director working on the same footage: fetched from Drive once, not twice.
- **Needs:** main process (`cache-store.ts`); the NAS as decided in `Owner_Handoff.md` part D.
- **Uses:** the office network.
- **Size:** M.
- **Risk:** scrubbing 4K over SMB may be slower than a local disk; organisational media on a share (D-11).
- **Rules:** none, if the share is the organisation's.
- **Proof:** `qa/desktop-shared-cache.cjs`: two development profiles on one folder, the same file fetched at once; one
  copy, both read the same bytes, no half-file ever served.

**P-32 The office computer as a render lane, with scoped authority** (refines D7 and H-21)
- **What:** the studio engine in a pinned Chromium on the agent computer, pulling an export job of a fixed project
  revision and shape, as the WhatsApp bridge pulls. New here: **the authority question.** The studio is the Admin's and
  the director's alone (`motion.studio` is fixed), and no stored password or session is allowed. So the job carries
  its own short-lived, single-use authority, issued by a database function when the director queues it: read that
  revision and its sources' exact versions, write one library version to the named place, nothing else. The machine
  proves itself with a server key whose hash alone is stored. The result enters review like any export.
- **For:** the director: "export after I close the laptop".
- **Needs:** a database change (jobs, claims, leases, heartbeats, the scoped grant), a plan of its own, the computer.
- **Uses:** the office computer's GPU and disk.
- **Size:** XL.
- **Risk:** the scoped grant is a new kind of authority and must be held by tests as strictly as `has_capability`.
- **Rules:** **needs an owner directive (E-1, D7)**; never approves or publishes.
- **Proof:** its own plan; at least: a job's grant refused for any other revision or file; an expired lease reclaimed;
  output structure and composed frames as section 5.2 against the laptop's export.

### 6g. Scaling design: from "floor and ceiling" to a mechanism

**P-33 «ملف قدرات الجهاز»: the profile as numbers per operation**
- **What:** a JSON kept in the application's profile folder, keyed by application version, Chromium version, active
  chip and driver, and power source. It holds numbers, not tiers:
  - decode frames a second per codec and size, hardware and software;
  - encode frames a second per codec and size, and the curve for one to four lanes;
  - compose milliseconds per frame for three reference documents of the studio itself (plain cuts; text and motion
    templates; covers and transitions), drawn by the real `composeFrame`;
  - the encoder's and the chip's names as reported;
  - cache folder read and write speed; the time to fetch a 16 MB range from the site;
  - logical cores and memory.

  The first measurement takes about half a minute («قياس قدرة الجهاز»: «يقيس التطبيق ما يقدر عليه هذا الجهاز في نحو
  نصف دقيقة. لا يُرسل شيء خارج الجهاز.»), runs again when a key changes, and is refined in use by a moving average of
  real export and playback figures (an export that ran slower than its estimate lowers the number).
- **For:** every later idea; support, through «معلومات الجهاز».
- **Needs:** a small page of the site's own address, `/motion/studio/bench`, opened in a hidden window by the main
  process (one fixed address, like the preview window); bridge `profile.read()` and `profile.measure()`.
- **Uses:** half a minute of the whole machine, once per key.
- **Size:** M.
- **Risk:** noise (section 2.2): repeat each figure three times and keep the median and the spread.
- **Rules:** none; it decides nothing about people and is never project data.
- **Proof:** `qa/desktop-profile.cjs`: three runs per chip on this laptop; every figure's coefficient of variation at
  most 10%; the key changes when the chip changes.

**P-34 One policy, from numbers to knobs, shared by the browser and the application**
- **What:** a pure `src/lib/studio/scale.ts`: `plan(profile, workload) -> knobs` for the speed knobs of section 5.1.
  Each knob has a floor value equal to today's behaviour (one lane, no cache, «كاملة», one light copy at a time, one
  photo worker) and a formula from the numbers, such as `lanes = largest k whose measured aggregate rate is at least
  1.3 times that of k - 1, at most the decoders' capacity for the project's sources`. A browser without a profile gets
  the floor; a browser with one may later get what P-37 has proven there.
- **For:** maintainers: one place to read why a machine does what it does.
- **Needs:** site only; tested like `src/lib/access.ts`.
- **Uses:** nothing.
- **Size:** S.
- **Risk:** formulas tuned on one laptop; the three example machines below are partly guesses.
- **Rules:** none.
- **Proof:** `tests/scale.test.mjs`: the floor for an empty profile; monotone knobs (a faster number never lowers a
  knob); the three example profiles below give the knobs listed.

| Knob | A weak laptop (4 cores, 8 GB, one integrated chip, no hardware HEVC decode) **[GUESS]** | The pilot laptop (section 3) **[MEASURED inputs]** | A workstation (16 cores, 64 GB, a large card with two encoders) **[GUESS]** |
|---|---|---|---|
| Graphics chip | the only one | measured per operation; RTX for exports, either for editing | the card |
| Preview start | 1/2, «تلقائية» | «كاملة», «تلقائية» | «كاملة» |
| Paused frame cache | 256 MB | 1.5 GB | 6 GB |
| Export lanes (1080p) | 1 | 2 on either chip by the 1.3 rule (the AMD chip's third lane gained 26%); 3 on the AMD chip with «أقصى ما يقدر عليه الجهاز» | 2 to 4 |
| Light copies at once | 1, more sources counted heavy | 1 to 2 | 2, few sources heavy |
| Photo tile workers | 2 | 8 | 14 |

**P-35 A step-down ladder with a memory**
- **What:** every knob has rungs down to its floor. A failure (an encoder error, a decoder configuration mismatch
  between lanes, a renderer gone for memory, `render-process-gone` with `oom`, a sustained dropped-frame rate, a CPU
  speed limit under 100%) steps that knob down one rung, retries the unit of work (one segment, one copy), and writes
  the event into the profile so the next session starts one rung lower for a set number of sessions. After the floor
  there is nothing to retry: the floor is today's code. The person sees one line only when the result took longer:
  «تعذّر التصدير المتوازي على هذا الجهاز، فأُكمل بالطريقة المعتادة.».
- **For:** reliability; nobody loses an export to an ambitious setting.
- **Needs:** site (`export.ts`, `media.ts`), the profile's event list.
- **Uses:** nothing.
- **Size:** M.
- **Risk:** a fault that repeats at the floor is a real bug, and must surface as one, not loop.
- **Rules:** none; output facts never change on the ladder.
- **Proof:** `qa/studio-stepdown.cjs`: each fault forced in turn (a stand-in encoder that throws at frame 500, a lane
  with a different configuration, a renderer killed mid-segment through the debugging protocol); every run ends with a
  valid file of exact structure; the profile records the event.

**P-36 «الأداء»: one override, folded**
- **What:** in «معلومات الجهاز» one choice: «تلقائي» (the default), «أخف على الجهاز» (one rung below the plan, for a
  hot laptop or a meeting), «أقصى ما يقدر عليه الجهاز» (the plan without the safety margins). «التفاصيل», folded,
  shows the numbers and the knobs. This follows the director's stated preference: defaults first, one kind of
  control, options folded until needed.
- **For:** the director and the Admin.
- **Needs:** site; the choice kept on the device.
- **Uses:** nothing.
- **Size:** S.
- **Risk:** none.
- **Rules:** none.
- **Proof:** in `qa/studio-ui.cjs`: the three choices change the knobs as `scale.ts` says.

**P-37 The cross-device output proof**
- **What:** `qa/studio-crossdevice.cjs` and a fixed corpus of at least eight studio documents (Arabic text in several
  fonts with letter reveals, the sixteen transitions, covers in both modes, speed ramps and reverse, keyframes, a 4K
  source, a frame template, sound with ducking and normalisation). It exports each document under every knob setting a
  machine offers and records, per frame, the composed hash and, per file, the ffprobe structure and PSNR. It holds the
  three levels of section 5.2: exact structure everywhere; identical composed hashes across knobs on one machine;
  tolerance across machines against a reference set kept in the repository (hashes and small downscaled frames, never
  real media). Each export also records the engine's build hash, Mediabunny's version, the chip and the encoder (H-04,
  H-18).
- **For:** the owner: the evidence that "a strong machine changes speed, never the video".
- **Needs:** site (an export report field); the corpus under `qa/fixtures`.
- **Uses:** time on each machine.
- **Size:** M.
- **Risk:** tolerance chosen too loose; start strict (2 levels, 50 dB) and loosen only with a recorded reason.
- **Rules:** none; it is the "evidence over assertion" rule applied to the principle itself.
- **Proof:** it is the proof; its JSON per machine and per run is the record.

**P-38 A weak machine on demand**
- **What:** check profiles that make the strong laptop behave like weaker ones, so the whole range is tested on one
  desk: `--force_low_power_gpu`; `--disable-gpu` (software drawing); `prefer-software` encoding; CPU slowed through the
  debugging protocol's `Emulation.setCPUThrottlingRate`; a small cache limit; a profile file forced to the "weak
  laptop" numbers. Development and check builds only; a release build refuses them as it refuses other switches
  (`desktop/src/switches.ts`).
- **For:** the checks of every idea above.
- **Needs:** check builds only.
- **Uses:** nothing.
- **Size:** S.
- **Risk:** emulation is not a real weak laptop; one real weak machine should still be tried before rollout.
- **Rules:** none; release builds unchanged.
- **Proof:** P-37 run under each emulated profile; the knobs chosen match `scale.ts`'s expectations.

---

## 7. Rejected

- **R-01, naming NVENC, AMF or Quick Sync in FFmpeg jobs.** They are in the pinned LGPL build (section 3.4) and would
  give 10-bit HEVC. Rejected for now: decision D-9 limits jobs to Windows' own encoders, Chromium's encoder already uses
  the same chips, and an export made by FFmpeg would be a second engine with a second picture (H-21's argument). Revisit
  only if Q4 changes.
- **R-02, a native compositor for exports** (Skia, C++ or FFmpeg filter graphs). Faster, and two engines: the preview
  would stop being the export.
- **R-03, project limits that grow with the machine** (more tracks, longer documents, 8K, 120 frames). A project made
  on a workstation would not open on the director's laptop: this breaks "projects never depend on the device". If the
  owner wants more tracks, raise them for everyone and let light copies and P-03 carry the weak machines.
- **R-04, HDR and 10-bit export.** No 10-bit encoder on the pilot hardware (measured); the pilot screens are not HDR;
  the platforms tone-map anyway. Handle HDR sources well instead (P-10).
- **R-05, HEVC or AV1 delivery files.** No hardware HEVC or AV1 encoding through WebCodecs here (measured); the review
  screen must play the exact file on any member's device, and H.264 is the one every device plays.
- **R-06, general smart rendering** (copying the packets of untouched stretches without re-encoding). The copied
  stretches would carry the camera's decoder configuration and the re-encoded ones the encoder's, which one MP4 track
  cannot hold in this muxer. A narrow version, a pure trim of one clip, could be reconsidered later.
- **R-07, raising the JavaScript heap** (`--js-flags=--max-old-space-size`). Frames live outside the heap; the limit is
  3.76 GB; no heap failure is recorded. It would hide leaks, not add speed.
- **R-08, overriding Chromium's graphics blocklist** (`--ignore-gpu-blocklist` and the like). Drivers are blocked for
  crashes and security; the step-down ladder is the safe answer.
- **R-09, rendering on a colleague's laptop over the office network.** Discovery, firewall and authority problems for
  two users; the office computer (P-32) is the cleaner path.
- **R-10, a float16 or Display P3 working space for the compositor.** Chromium accepts both (measured), but the phone
  application and Safari would then draw a different picture: one engine for three clients is worth more. It belongs to
  a studio-wide decision, not to the desktop.
- **R-11, rewriting the whole compositor in WebGPU.** Arabic text shaping and font fallback are Canvas 2D's strength;
  rewriting text for the GPU is a large risk for a small gain. Effects passes (P-09) take the GPU's value.
- **R-12, sending device profiles to the site automatically.** Little gain for two users, and a new kind of data about
  people's equipment; at most an opt-in copy for support (Q3).
- **R-13, GPL tools** (`vidstab`, x264, x265). The licence rule forbids them; `deshake` and Windows' encoders cover the
  need.
- **R-14, approving from a Windows notice.** Approval belongs to the version-bound review screen (the reference); a
  notice only points to it.
- **R-15, a hidden window that finishes an export after the person leaves the studio page.** Closing the window
  already hides it during an export (D2); a second, hidden editor would need its own lease and project state for a
  small gain. The office computer answers "after I leave" properly.

---

## 8. Ranked shortlist

Value for effort, best first.

| Rank | Idea | Size | Why here | Depends on |
|---|---|---|---|---|
| 1 | P-01 graphics chip by measurement | S | Measured effect; a precondition of every number | P-33 for `auto` (manual choice works without it) |
| 2 | P-37 cross-device proof, with P-38 | M | Nothing may touch the export path before it exists | none |
| 3 | P-33 and P-34 the profile and the policy | M | Turns every later knob from a guess into a reading | P-01 |
| 4 | P-02 scrub cache | M | The most frequent pain for the designer; floor unchanged | P-34 for its budget |
| 5 | P-03 «تلقائية» resolution, with P-04 | S | Small, visible, no output risk | P-33 helps; works without it |
| 6 | P-05 one pass, several shapes | M | A feature people already use, decode once | P-37 |
| 7 | P-06 export lanes, with P-35 | L | Measured 1.5 to 2.3 times the encoder rate; the biggest export gain | P-37, P-34, P-35 |
| 8 | P-15 loudness ahead of time | S | Removes a whole pass from normalised exports | P-30 helps |
| 9 | P-08 with P-30 automatic copies in idle time | M | Footage ready before it is played | P-33 |
| 10 | P-25 upload while exporting | M | Minutes saved on every «تصدير وإرسال» | none |

---

## 9. Build order: D9 to D13

Continuing `Desktop_App_Plan.md`'s numbering; D7 (the office computer) and D8 (later features) keep their meaning,
and P-32 belongs to D7. Each phase ends as the project's phases do: the site's typecheck, build and tests, the
application's tests, the phase's `qa/` scripts with their JSON, a local commit and a dated `progress.md` entry with
numbers. Nothing is pushed or released unless the owner asks.

### D9 «قياس الجهاز»: measure first (S to M)

P-01, P-33, P-34, P-36 (its first form), P-37, P-38, and the export report fields (engine hash, Mediabunny version,
chip, encoder). No change to how anything is drawn or exported.
- **Exit gate:**
  - `qa/desktop-profile.cjs` on this laptop, AMD and RTX, three runs each, every figure within 10% spread;
  - `qa/desktop-gpu-choice.cjs` shows each choice taking effect after a restart;
  - `qa/studio-crossdevice.cjs` passes on Edge, the application on the AMD chip and the application on the RTX:
    structure exact, composed frames within 2 levels and 50 dB, the encoded files at least 40 dB;
  - the bridge's new calls refuse anything off their lists (unit tests).

### D10 «معاينة أسرع»: preview (M)

P-02, P-03, P-04, P-15.
- **Exit gate:**
  - scrub median at least three times faster on the 4K fixture, with frame identity at 48 of 48 times;
  - three 4K tracks with «تلقائية»: at most 2% dropped frames on both chips and with `--disable-gpu`;
  - the studio's engine and interface checks unchanged in Edge.

### D11 «تصدير أسرع»: export (L)

P-05, P-06, P-35; P-07 only if D11's measurements show the main thread limiting heavy documents.
- **Exit gate:**
  - ten-minute 1080p and 4K fixtures: composed-frame hashes identical to one lane, structure exact, boundary frames
    within 0.5 dB;
  - every forced fault of P-35 ends in a valid file;
  - a time ratio recorded per chip, with no promise made before it is measured.

### D12 «حول المحرر»: workflow (M)

P-08 with P-30, P-20, P-25, P-26, P-22, P-29.
- **Exit gate:**
  - a card-shaped fixture imported and verified;
  - copies made in idle time without moving the stage's 95th-percentile frame time;
  - «تصدير وإرسال» faster end to end against a stand-in provider: **not met** (2026-11-04). P-25 is parked: with the file
    unchanged, nothing can reach Google Drive before the export ends (see P-25);
  - nothing left half-made after a cancel or a quit.

### D13 gated work: one item at a time, each on an owner's answer

P-10 (HDR sources), P-11 and P-12 (analysis, Q5), P-13 (clean speech), P-17 (photo tiles), P-18 (HEIC, RAW: Q6), P-19,
P-21, P-23 (recording: a permission rule), P-24 (dropped connection), P-27 (after signing), P-31 (with the NAS).
- **Exit gate:** each item's own proof in section 6.

---

## 10. Questions for the owner

Only the answers that change what is built.

| ID | Question | Recommended answer | What it changes |
|---|---|---|---|
| Q1 | What exactly is the director's laptop (processor, memory, graphics chips), and is any stronger desktop planned? Only the owner's laptop is recorded (`Desktop_App_Plan.md` 11.1). | Read it from «معلومات الجهاز» on that laptop and run the D9 profile there before D11. | Whether lanes and caches are tuned on one machine or two. |
| Q2 | May the application choose the stronger graphics chip by itself on mains power? | Yes on mains power, the saving chip on battery, with the manual choice always available. | P-01's default. |
| Q3 | Does the device profile stay on the laptop only? | Yes; shown in «معلومات الجهاز» and copied by hand when support needs it. | Whether any new data reaches the site. |
| Q4 | Does D-9 stay: Windows' own encoders only, H.264 8-bit output? | Yes. Revisit only if a platform or a client requires HEVC or 10-bit. | R-01, R-04, R-05. |
| Q5 | Are classical analyses (silence, scene changes, stabilisation, noise reduction without neural networks) acceptable under "Version 0 has no AI"? | Yes for classical signal processing; neural models (`arnndn`, captions from speech) wait for a separate decision. | P-11, P-12, P-13. |
| Q6 | What does the team shoot: phones (HEIC, HDR), cameras with cards (which models, MTS or MP4), RAW photos? | Answer with one sample of each, which also becomes a test fixture. | P-10, P-18, P-20 priority. |
| Q7 | Is the office computer of E-1 coming, and when? | Plan P-32 only once it exists. | D7's timing. |

---

## 11. What to build first

**D9 «قياس الجهاز».** Every other gain in this document is a knob, and a knob set without a measurement is the tier
wall the owner wants to avoid. D9 is small, changes no drawing or export path, and ends with three things the project
does not have today: a per-operation profile of the real laptops, a one-switch fix for the measured wrong-chip default,
and the proof harness that turns "the export never changes with the machine" from a promise into a checked number.
Its own speed gain is modest on its own (one encoder ran 76 against 88 frames a second, one run each); the large gains
(lanes at 1.5 to 2.3 times, a scrub cache) come in D10 and D11, and they need D9's numbers and harness to be built
safely.

Waiting for the owner's choice; nothing is built until then.

---

## 12. Found on the way

Small facts noticed while reading, none of them a power limit.

- **A path reaches the page.** `desktop/src/native-files.ts` `usage()` returns `folder: cache.folder()`, the cache
  folder's full path, which holds the Windows user name. No bridge input takes a path, but this one goes the other way.
  A display label («المجلد الافتراضي» or the folder's last name) would do.
- **The specification lags one recorded change.** `MVP_draft.md` 62 and `Studio_Build_Plan.md` say one graphics and
  one text track; `TRACK_LIMITS` allows two of each, a deviation recorded in `progress.md` (line 974). Only the
  specification's sentence needs updating.
- **A comment is out of date.** `src/lib/native/device.ts` says a browser's memory figure "stops at 8 GB"; Edge 156
  reported 16.
- **Electron is due.** `desktop/package.json` pins Electron 44.5.1; `Desktop_App_Plan.md` 4.2 says to move to 45 once it
  has been out fourteen days, and 45 became stable on 2026-10-20, so the move is due from today.
- **The plan's NVENC sentence** was already corrected in D5 (`progress.md`); this document's measurement agrees: the
  pinned LGPL build carries NVENC, AMF and Quick Sync, and no job names them.

---

## 13. Sources

### 13.1 Project

`AGENTS.md`; `Desktop_App_Plan.md`; `MVP_draft.md` 62 to 63.5; `Studio_Build_Plan.md`;
`Studio_Feasibility_and_App_Path.md` 3, 11, 12; `HyperFrames_Studio_Learnings.md`; `progress.md` (2026-10-20 and
2026-10-21 desktop entries; line 974); `Status.md`; the code named in section 2.1; `desktop/ffmpeg.lock.json`.

### 13.2 External documentation, read for this document

| Topic | Source |
|---|---|
| `--force_high_performance_gpu`, `--force_low_power_gpu`, `--js-flags` | [Electron command-line switches](https://www.electronjs.org/docs/latest/api/command-line-switches) (v44 docs through Context7) |
| `getGPUInfo('complete')`, `getGPUFeatureStatus` | [Electron app](https://www.electronjs.org/docs/latest/api/app) |
| `speed-limit-change` (Windows and macOS), `isOnBatteryPower`, `getSystemIdleTime`; thermal state macOS only | [Electron powerMonitor](https://www.electronjs.org/docs/latest/api/power-monitor) |
| Utility process options | [Electron utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process) |
| Dragging files out | [Electron native file drag and drop](https://www.electronjs.org/docs/latest/tutorial/native-file-drag-drop), [webContents.startDrag](https://www.electronjs.org/docs/latest/api/web-contents) |
| Jump lists | [Electron app.setJumpList](https://www.electronjs.org/docs/latest/api/app) |
| `CanvasSink` size and pool | [Mediabunny media sinks](https://mediabunny.dev/guide/media-sinks) |
| `EncodedVideoPacketSource`: decode order, decoder configuration on the first packet | [Mediabunny media sources](https://mediabunny.dev/guide/media-sources) |

### 13.3 Measurements

Section 3, made on 2026-11-03 with a throwaway probe in the session's scratch folder (not in the repository, by this
session's one-file limit): Edge 156.0.4314.58 in a fresh profile, run as started and with
`--force_high_performance_gpu`; the pinned FFmpeg n9.0.2 (`ff902`). D9 turns the probe into `qa/desktop-profile.cjs`
with its JSON, which is where these numbers should be re-measured and recorded.

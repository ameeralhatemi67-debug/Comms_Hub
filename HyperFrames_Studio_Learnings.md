# What HyperFrames can teach «الاستوديو»: research and recommendations

Research of 2026-10-25, from the owner's request of the same day: study HeyGen HyperFrames in depth
and say what the studio of «استوديو الحركة» can take from it, for the web, the desktop application
and the phone applications. Status: **research for the owner's review**. Nothing is built and
`MVP_draft.md` section 62 does not change until the owner picks items from section 5.

Companion documents: `MVP_draft.md` section 62 (the studio's specification), `Studio_Build_Plan.md`
(its rounds), `Desktop_App_Plan.md` (phases D0 to D8, decision D-1), `Mobile_Apps_Plan.md` (phases
M0 to M8, finding F-1), `Settings_Integrations_Plan.md` (E-1: nothing scheduled in the site),
`AGENTS.md` (rules: no AI in Version 0, fonts served by the site, approval never in the studio).

Arabic labels written in this document for new tools are **proposals** for the owner, not
established terms.

---

## Contents

1. The answer in short
2. What HyperFrames is
3. How it works
4. HyperFrames and our studio side by side
5. What to take: 23 learnings
6. By platform: web, desktop, phone
7. What not to take, and why
8. A suggested order
9. Decisions for the owner
10. Method and sources

---

## 1. The answer in short

- **HyperFrames is HeyGen's open-source framework for making video from HTML** (Apache-2.0,
  repository created 2026-03-10, 549 releases on npm, latest 0.8.196 on 2026-10-25, about 71,700
  GitHub stars). A video is a folder of HTML files with timed elements and a paused animation
  timeline. Headless Chrome seeks that timeline frame by frame and FFmpeg encodes. A browser editor
  ("Studio") and a desktop application (macOS and Linux) edit the same files, and the whole design
  is aimed at AI agents writing the video.
- **Its engine and format are not for us.** We draw on one Canvas 2D compositor in the person's
  browser, keep the project as a checked JSON document in Postgres, render nothing on a server and
  use no AI. Copying their engine would undo decisions the owner already made (section 7).
- **Its discipline is for us.** HyperFrames is good at the things around the engine: measured
  checks with a fix for each finding, one clock shared by preview and export, colour on the GPU,
  template fields with batch output, history that records who changed what, and review sheets. Most
  of these are pure TypeScript in `src/lib/studio/` and work the same in all three clients.
- **The first five to build** (all small, all three clients): «فحص المشروع» before export (H-01),
  safe areas for every shape and platform (H-02), colour adjustments on the GPU, which also fixes
  F-1 on iPhone and Safari (H-03), written determinism rules with parity tests (H-04), and an Arabic
  text test set taken from HyperFrames' own open Arabic bug (H-05).
- **Where each client fits.** The computer (web, and better the desktop application) is where
  batch output, light preview copies of heavy footage, scopes and long exports belong. The phone is
  where a person reads check results, review sheets and "what changed", and where touch is better
  than a mouse: timing caption words by tapping, tapping beats, and dragging a blur over a moving
  face. HyperFrames has no phone application at all, so the phone lessons are ours to adapt.
- **Arabic is our advantage.** HyperFrames ships no Arabic font, its editor is English and left to
  right, and on 2026-10-19 its maintainers confirmed that Arabic split into letters renders as
  isolated letters (issue 5885, open). Our studio already serves fifteen Arabic fonts itself and
  keeps letters joined while revealing them.

---

## 2. What HyperFrames is

| Fact | Detail | Source |
|---|---|---|
| Maker | HeyGen. A product separate from HeyGen's avatar video service. | [1], [44] |
| Licence | Apache-2.0 (checked through the GitHub and npm APIs on 2026-10-25). GSAP, which it bundles, is under GreenSock's own "standard" licence, not an open-source one. | [2], [3], local package |
| Age and pace | Repository created 2026-03-10; first npm release 2026-03-23; 549 releases since; versions 0.2 (April) to 0.8 (August); latest 0.8.196 on 2026-10-25. Still before 1.0; parts of its API are marked experimental. | [2], [3], [11] |
| Reach | 71,697 stars and 6,473 forks on 2026-10-25. About 520,000 npm downloads in the week of 16 to 22 October, against about 1.48 million for Remotion (reported by the research pass, not re-checked). | [2], [3] |
| Pieces | A command line tool (`npx hyperframes`) with packages for the runtime, capture engine, renderer, browser editor ("Studio"), its server, the embeddable player, lint, parsers, an SDK, and AWS Lambda and Google Cloud Run renderers. | [1], local package |
| Closed parts | HeyGen cloud rendering, the hyperframes.dev publishing site, the review pages for shared videos, HeyGen media (avatars, voices) and the desktop application (Electron; no public source found). | [18], [19], [28] |
| Desktop application | "HyperFrames Studio" for macOS (Apple Silicon and Intel) and Linux; Windows "coming soon"; needs a free HeyGen account; announced 2026-10-05. A chat with a coding agent (Claude Code, Codex and others) beside the preview; a small green guide called Framey shows what the agent is doing. | [18], [20], checked 2026-10-25 |
| Phones | No phone application and no phone editor. Vertical video is supported as a shape only. | [18], [28] |
| The argument | HeyGen's research article (2026-06-22) says that their earlier Remotion-based work produced safer and more repetitive output the more guardrails they added, so they moved to plain HTML that any model writes well, with a seekable runtime. No evaluation numbers are published. | [8] |

---

## 3. How it works

### 3.1 The project is HTML

- `index.html` is the root composition: width, height, length (`data-duration`) and one host per
  scene. Each scene is a file in `compositions/` with its markup inside a `<template>`.
- A timed element has `class="clip"`, `data-start` and `data-duration` in seconds. `data-track-index`
  is only the lane shown in the editor; paint order is CSS `z-index`.
- Each composition builds one **paused** GSAP timeline and registers it in
  `window.__timelines["<id>"]`. Other animation systems (CSS, Web Animations, Lottie, Anime.js,
  Three.js, canvas) are driven through small seek adapters.
- Swappable content is a **variable**: `data-var-text`, `data-var-src`, or a CSS custom property.
- The rules are short and strict: no wall clock, no `requestAnimationFrame`, no timers, no unseeded
  random numbers, no network fetches, never `play()` a video. Everything visible is a function of
  timeline time. [7], [13]

### 3.2 One clock, seeked, never played

- The page exposes `window.__hf.seek(t)`. Time is snapped to the frame grid (frame number divided by
  frames per second), the timeline is paused and seeked, and seeking twice in any order gives the same
  picture. "The renderer never calls play()." [7], [8], local package
- Preview and render load the same runtime bundle, and its hash is checked: in their words, parity
  "isn't hoped for. It's enforced". [8]
- During preview playback, video is kept in step by nudging its playback rate (by 3, 10 or 25
  percent depending on the drift) and reloaded when a seek lands more than half a second off.
  Local package (`hyperframe.runtime.iife.js`)

### 3.3 Rendering

- Puppeteer drives a pinned Chrome headless shell. Three capture modes: Chrome's `beginFrame`
  (Linux only, byte-exact), screenshots (Windows and the default elsewhere), and an experimental
  `drawElementImage` path said to be about 46 percent faster on a hardware GPU. [9], local package
- **Video is never decoded by Chrome for output.** FFmpeg extracts frames at the target rate and
  they are injected into the page frame by frame. [8], [9]
- FFmpeg encodes (H.264, VP9, ProRes, GIF, PNG sequences, HLS) and mixes sound per clip with trims,
  volume curves, fades and delays at 48 kHz. Audio effects are rendered by running the same Web
  Audio code inside Chrome, so preview and export share one sound pipeline. Local package
- Quality presets `draft`, `looks` and `delivery`. Unchanged frames are detected and reused. The
  render summary names the capture path and the time spent in each stage. [15], local package
- Footage the browser plays badly (HEVC, ProRes, some AV1 and VP9) gets an H.264 **preview copy by
  default**; export still reads the original. Local package
- `--docker` pins Chromium, fonts and FFmpeg for pixel-exact output; outside Docker "a local render
  can shift by a pixel" between machines. [7], checked 2026-10-25
- `render --batch rows.json --output "renders/{name}.mp4"` makes one video per row of variable
  values, with concurrency, stop-on-first-failure and a manifest of each row's result. The same idea
  runs on HeyGen's cloud, AWS Lambda (Step Functions, up to 256 chunks) and Google Cloud Run. [24],
  [28], [29], [30]

### 3.4 The editor ("Studio")

Studio is a local web application served by the command line tool. Its features, from the shipped
bundle and the documentation [16]:

- **Timeline.** Lanes by kind (video, graphics, captions, audio); move, trim, razor (one clip or all);
  ripple on or off; snapping to playhead, edges and **beat markers**; expandable **keyframe lanes**;
  volume and effect **automation lanes**; **detach audio** and merge it back; **link and unlink**
  clips; freeze frame; in and out points; nested scenes with a breadcrumb.
- **Accessible timeline.** Exposed to screen readers as a tree grid with full keyboard navigation
  (Tab, arrows, Home, End, Shift+F10 for the menu).
- **Canvas.** Move, resize, rotate, crop, nudge, smart guides, a grid, 3D orientation, editable
  **motion paths**, an ease editor per segment.
- **Gesture recording.** While playing, dragging records position, scrolling records depth and
  modifier keys record turn, opacity and size, as keyframes.
- **Colour.** On WebGL: 13 presets, colour wheels, curves, up to four HSL keys, `.cube` LUTs, grain,
  vignette, with histogram, vectorscope and RGB parade.
- **Sound.** An effects rack (equaliser, compressor, limiter, reverb, pitch), groups with mute and
  solo, ducking under narration, loudness normalisation.
- **Variables panel.** "Make this a variable", preview overrides, "Set default", and "Use this
  template", which copies the values or a ready batch command (checked 2026-10-25).
- **Writing back.** Every edit is a small operation on the HTML source (an attribute, a style, a
  text, a keyframe in the GSAP script rewritten through a parser), written atomically with a version
  check (a stale write gets HTTP 409) and a backup file.
- **For agents.** The current selection (file, time, box, text, thumbnail) can be read by a coding
  agent; Studio also offers twelve in-page tools through WebMCP (look, select, seek, set text, set
  style, transform, add keyframe), each write returning a stage: refused, dispatched, saved,
  verified or failed. [17]
- The interface is English only and left to right. No title-safe or action-safe overlay was found in
  the bundle or the documentation, although HyperFrames' own agent instructions say Studio draws them.

### 3.5 Checks and review

- **Lint**: stable codes, each with a `Fix:` line (123 codes in the 0.8.195 bundle analysed here; the
  documentation lists 153). Examples: `non_deterministic_code`, `font_family_without_font_face`,
  `linked_clips_out_of_sync`, `clip_ends_past_root_duration`. [22], local package
- **`check`**: one browser start, lint first, then a sweep of the timeline at sample times (nine by
  default) that measures:
  - layout: `text_box_overflow`, `clipped_text`, `content_overlap`, `text_occluded`, `canvas_overflow`;
  - contrast against WCAG (4.5:1, or 3:1 for large text), with a `suggestedColor` that passes;
  - craft: `line_unread` (a line not shown long enough to read), `dead_stretch`, `text_below_floor`
    (text too small), `first_frame_empty`, `film_silent`;
  - `sweep_static`: a video of three seconds or more in which nothing changes.

  A finding seen at only one sample (an entrance still moving) is lowered to information. Local package
- **Motion assertions**: a `*.motion.json` beside a scene declares what must appear by when, what
  must stay in frame and what must keep moving, checked on the same seeked timeline.
- **Snapshots**: frames at chosen times; a review sheet with one frame per scene, strips of the frames
  0.2 seconds either side of every cut, and a 360-pixel phone-size sheet; an onion-skin view of a
  motion path; side-by-side comparison of up to sixteen variants or colour grades.
- **Review notes** are written as "time, where, problem, change, what stays", ranked P0 to P2.

### 3.6 History

Every write is kept as content-addressed files. Each entry records **who** (`person`, `agent` or
`outside` for edits made in another program), a label and the files before and after. Undo has three
modes: just this step, back to before it, or keep later edits. `catch-up` lists what others changed
since you last looked. Timeline edits can be **planned** first (`--plan` shows the result without
writing) and return a receipt that undoes them. Time can be typed as `12.5`, `+0.5`, `30f`, `end`,
`after:#id`. Local package

### 3.7 Templates, presets and captions

- **Registry**: 210 blocks, 239 components and 8 examples (titles, lower thirds, captions, charts,
  maps, transitions). Installing one **copies its source into the project** as an editable file; it
  is not a dependency. [26]
- **Frame presets** (13): a `FRAME.md` design system per look, with colour, radius, spacing and type
  tokens in container units (so a title keeps its proportion in any shape), rules per aspect ratio,
  do and do-not lists, and a matching **caption skin** with an active-word state. Local package
- **Captions**: words with start and end times, shown in groups of two to six, one group at a time,
  the current word highlighted. Words come from automatic transcription (an AI model run locally).

### 3.8 Arabic and right to left in HyperFrames

- The eighteen bundled font families have no Arabic letters, and system fonts such as Tahoma and Arial
  are mapped to fonts without them. Arabic falls back to whatever the computer has. [37], local package
- Google Fonts are fetched at build time with the page's own text in the request (to subset the
  font), so a composition's words are sent to Google. Local package
- `<html dir="rtl">` once rendered a blank video (issue 1934). The lint error added after it was
  removed on 2026-10-17 in favour of a render test with an Arabic headline (pull request 5744, merged).
- **Open issue 5885 (2026-10-19)**: splitting Arabic into letters renders isolated letters, and rows
  of words come out reversed; no lint rule catches either. Pull request 5887 (open) proposes a rule:
  direction on the container, split by word, and when letters must move, a split that keeps
  harakat, lam-alef, the word «الله» and zero-width joiners intact; embed an Arabic font; beware a
  Safari zero-width-joiner font problem. [33], [34], [35], checked 2026-10-25

---

## 4. HyperFrames and our studio side by side

| Area | HyperFrames | «الاستوديو» today | Gap worth closing |
|---|---|---|---|
| Project format | HTML files and a GSAP script | One JSON document per revision in Postgres (`schema.ts`), checked by the database, unknown fields kept | None: ours is safer for a shared database (section 7) |
| Engine | Headless Chrome and FFmpeg for export; the same runtime in the browser for preview | One Canvas 2D compositor (`compose.ts`) and Mediabunny, in the person's browser, for preview and export | None in kind; tests of parity (H-04) |
| One clock | Frame-grid seek, rules enforced by lint, runtime hash checked | "The paused frame is the exported frame" (62.7); motion renderers take time and use seeded noise (`renderers.js`) | Rules written down and tested (H-04) |
| Checks before export | 123 to 153 lint codes; measured layout, contrast, reading time, text size, static video | `exportChecks` in `checks.ts`: video-only platforms (stop), length (warning), shape (note), empty places (warning) | Large (H-01, H-02) |
| Safe areas | Stated in their instructions, not found in the editor | Reels safe zones at 9:16 only (`stage.tsx`, Shift+G) | Every shape and platform (H-02) |
| Colour | WebGL shader, LUTs, scopes | `ctx.filter` (`compose.ts` `filterOf`), skipped where unsupported: Safari and every iPhone (F-1) | Large (H-03, H-20) |
| Timeline editing | Detach and link sound, beats, keyframe and automation lanes, gesture recording, motion paths | Keys as diamonds with five curves, ripple delete, freeze, markers, transitions; sound fixed to its video clip; no beats | Medium (H-11, H-15, H-16, H-20) |
| Timeline accessibility | Tree grid, keyboard navigation | Clips are plain `div` elements with pointer handlers (`timeline.tsx` line 531); not focusable | Medium (H-07) |
| Captions | Word timing, groups, active word, skins | SRT in and out, a caption style, reveal by letter or word with joined letters (`text.ts`) | Medium (H-12) |
| Templates and brand | Variables, batch rows, design-system presets, copied blocks | 26 motion templates; project templates with pinned clips; «هوية الاستوديو» of 12 colours and two fonts | Medium (H-08, H-13) |
| History | Persistent, by author, three undo modes, catch-up, planned edits with receipts | 200 steps for the session (`history.ts`), lost on reload; numbered versions compared in words (`diff.ts`); one editor at a time | Medium (H-09, H-17) |
| Review | Review sheets, phone-size sheet, variant comparison; hosted share pages | Review screen with keys, notes at a frame with an area, version compare, version-bound approval, moment links | Small (H-10) |
| Heavy footage | Preview copies on by default | Lower preview resolution (1/2 to 1/32); copies planned for the desktop only (D5) | Medium (H-14) |
| Where export runs | Local, Docker, HeyGen cloud, Lambda, Cloud Run | The person's browser; desktop application (D2); agent computer later (E-1, D7) | Gated (H-21) |
| Arabic | No Arabic font; English left-to-right editor; open Arabic letter bug | Arabic right-to-left interface; 15 Arabic fonts served by the site; letters kept joined | Ours is ahead; keep it tested (H-05) |
| Clients | Command line, browser editor, desktop on macOS and Linux | Web now; desktop (Electron, Windows and macOS) and phones (Capacitor) planned | Phones: nothing to copy |

---

## 5. What to take: 23 learnings

Each item says what HyperFrames does, what we would build, where in our code, how it lands on each
client, and its size (S, M, L as in the other plans) and gates. "All three" means the code is plain
TypeScript in `src/lib/studio/` and behaves the same on web, desktop and phone.

### Group A: first, small, all three clients

#### H-01 «فحص المشروع»: measured checks, each with a way to fix it

- **HyperFrames.** `check` samples the timeline and measures what a person would notice: text
  overflowing its box or the frame, text over a background it cannot be read on (with a colour that
  would pass), lines shown too briefly to read, text too small, an empty first frame, long stretches
  where nothing moves, a silent film. Every finding names its fix; a finding seen only once (an
  entrance in flight) is lowered.
- **For us.** A pure `src/lib/studio/audit.ts` that reads the document and frames drawn by the same
  compositor at low resolution (so it is fast and runs on phones too), and returns findings shaped
  `{ code, level, clipId, t, text, fix }`. The code is stable English; the text is Arabic. Checks:
  - text outside the safe area of the shape or platform (with H-02);
  - text wider than its box or cut by the frame's edge (from `layoutText` in `text.ts`);
  - contrast of a text with what is under it, measured at several moments of the clip because
    footage changes, the worst one reported; the fix offers the closest colour of «هوية الاستوديو»
    that passes, then «إضافة صندوق» or a shadow;
  - a text on screen for less than its reading time (the rate is set by the owner; a starting
    proposal is one second plus 0.4 seconds a word, to be tuned with the content team);
  - text smaller than a floor for phone viewing (proposal: 3 percent of the frame's short side);
  - an empty or black first frame (platforms show it before the cover loads);
  - a long stretch in which nothing changes;
  - linked sound out of step with its video (with H-11);
  - loudness far from the target when «توحيد مستوى الصوت» is off (the measure exists in
    `loudness.ts`);
  - the existing checks of `checks.ts` (platforms, empty places) folded in.
- **Levels.** The rule of 62.10 stays: only what the site itself refuses stops an export. Everything
  new is a warning or a note. A finding that lasts less than half a second or appears at one sample
  only is a note.
- **Interface.** «فحص المشروع» in «ملف» and in the export dialog, and before «تصدير وإرسال
  للمراجعة». Each line has «انتقال» (moves the playhead and selects the clip) and, where a fix is
  certain, «إصلاح» (moves the text inside the safe area, applies the suggested colour, lengthens
  the clip). Fixes are ordinary undoable steps.
- **Clients.** All three. On phones the sample count is lower and the list is read-only apart from
  «انتقال».
- **Size and gates.** M. It meets idea I-008 (accessibility before publishing) part of the way.

#### H-02 Safe areas for every shape and every platform

- **HyperFrames.** Its instructions keep content inside a 90 percent action-safe box and key text
  inside an 80 percent title-safe box (the broadcast convention).
- **For us.** «المناطق الآمنة» (Shift+G) draws, for the shape shown: the 90 and 80 percent boxes,
  and the areas each linked platform covers with its own interface (buttons, captions, profile row).
  The covered areas are **data in the platform registry** (`platforms.accepts`) with a stated source
  and date, like the copy limits of C4, so a platform's change is a row edit, not a release. The
  extra shapes of 62.10 each show their own guides. H-01 uses the same data.
- **Clients.** All three; on phones the guides matter most, since that is how the video will be seen.
- **Size and gates.** S, after someone with `platforms.manage` records the areas with their sources.

#### H-03 Colour adjustments on the GPU, which also fixes F-1

- **HyperFrames.** "Grades, grain, blur and vignettes on footage" never go through CSS filters. They
  are stored as data on the clip and drawn by a WebGL shader in preview and export alike, with `.cube`
  LUTs up to 64 points a side.
- **For us.** Today `compose.ts` applies brightness, contrast and saturation through `ctx.filter`,
  and `supportsFilter()` silently skips them where the canvas filter is missing: every iPhone and
  Safari on a Mac (finding F-1 of `Mobile_Apps_Plan.md`). Build `src/lib/studio/grade.ts`: one WebGL2
  pass per adjusted clip, drawn into an off-screen canvas that the 2D compositor then draws as
  before. It covers brightness, contrast, saturation and warmth, then LUT looks («المظاهر»: a
  `.cube` file imported once, kept with «هوية الاستوديو»), then grain seeded by the frame number.
  Where WebGL2 is missing, the pixel functions that `photo.ts` already runs in a worker are the
  fallback, so no client exports a different picture without saying so. The blur cover (`cover.ts`)
  keeps its present fallback, which still hides what it covers, and can use the same pass later.
- **Clients.** Web and phone gain the most (Safari and iPhone get adjustments at all); the desktop
  application gains parity with the browser.
- **Size and gates.** M. Gate: pixel probes in `qa/studio-engine.cjs` show the same picture from
  preview and export, and the same picture (within a stated tolerance) in Chromium and WebKit.

#### H-04 One clock, written rules, tested parity

- **HyperFrames.** Rules are short and enforced by lint: no wall clock, no animation-frame loops, no
  unseeded random numbers, no media control from scripts. Time is snapped to the frame grid; seeks
  in any order give the same frame; the runtime's hash is checked; only one pinned environment is
  byte-exact, and their Arabic regression test compares renders with PSNR, not bytes.
- **For us.** We already follow the principle; it is not written as a rule or tested as one.
  - A test that scans the drawing code (`src/lib/studio/` drawing modules and `src/lib/motion/`
    renderers) for `Math.random`, `Date.now`, `performance.now` and `requestAnimationFrame`, with a
    short allow-list (ids, history timing, export progress).
  - A fixture that draws the same document at a set of times in a shuffled order, twice, and gets
    identical pixels.
  - Frame snapping in one place (`time.ts`).
  - The studio engine's build hash and the Mediabunny version recorded with each export
    (`studio_exports`), so a file says which engine made it.
  - Across engines (Edge, Electron, Android WebView, iPhone WebKit) the comparison is by PSNR above a
    threshold, not exact bytes. This is the method the desktop check DT-05 and the phone check MT-11
    need.
- **Clients.** All three; it is what makes "one engine, three clients" safe.
- **Size and gates.** S. A short rule in `AGENTS.md` for the studio.

#### H-05 An Arabic text test set taken from HyperFrames' own bug

- **HyperFrames.** Issue 5885 and pull request 5887 list exactly what breaks Arabic in video:
  per-letter splits, reversed word rows, harakat, lam-alef, «الله», zero-width joiners, and a Safari
  font problem with the joiner.
- **For us.** Our letter-by-letter and word-by-word reveals (62.3) already keep letters joined. Make
  that a standing test: a corpus of lines with lam-alef, «الله», full harakat, zero-width joiner and
  non-joiner, mixed Arabic, English and digits, Arabic-Indic digits, and long words, drawn in each of
  the fifteen Arabic fonts through `drawText` and the reveal functions, compared with reference images
  per engine. Missing glyphs are caught by comparing against the fallback font's widths.
- **Clients.** All three, and it must run on iPhone WebKit in the phone spike (M2, M5).
- **Size and gates.** S.

#### H-06 One answer to "can this client do this, and if not, why"

- **HyperFrames.** Its SDK and Studio answer each action with `can` and `reasonIfDisabled`; the
  agent tools return the same answer before acting.
- **For us.** The phone tool set (62, "Phones"), Safari's missing storage, F-1, read-only versions,
  the editing lease, pinned clips and permissions are decided today in many components. Put them in
  one pure `src/lib/studio/affordances.ts`: `can(action, context)` returns `{ ok, reason }` with an
  Arabic reason, and menus, buttons, keys and drag targets all ask it. A test checks that every
  refused action has a reason.
- **Clients.** All three; this is where the differences between the clients live, as one table.
- **Size and gates.** S to M. A refactor with no visible change, checked by the existing interface
  fixtures.

### Group B: the next round, medium

#### H-07 A timeline that works from the keyboard and with screen readers

- **HyperFrames.** The timeline is a tree grid: Tab enters it, arrows move between clips and lanes,
  Home and End jump, Shift+F10 opens a clip's menu.
- **For us.** Our clips are plain elements that only a pointer can select; the many keys of 62.2 act
  on a clip once it is selected. Give the timeline grid semantics: one focusable clip at a time,
  arrows along the time axis (which runs left to right inside the right-to-left page, so Right is
  later) and between tracks, Enter to select, the menu key or Shift+F10 for the clip menu, and an
  Arabic announcement of the clip's name, start and length.
- **Clients.** Web and desktop; on phones the same semantics serve TalkBack and VoiceOver.
- **Size and gates.** M. The page guide's selectors (`src/lib/help/pages.ts`) stay tested.

#### H-08 «حقول القالب» and «تصدير دفعة»

- **HyperFrames.** A text, picture, colour or font becomes a named variable; "Use this template"
  hands over the values; `render --batch` makes one video per row with a name pattern, a strict mode
  that refuses unknown or missing values, and a status per row.
- **For us.** In a template project (62.11) a text, a picture, a colour or a motion template's value
  can be made a «حقل» with an Arabic name. «مشروع من قالب» then asks for the fields in a form.
  «تصدير دفعة» takes a table (pasted from a spreadsheet, or a CSV file) with one row per output and
  one column per field, runs the exports one after another with the existing export, and saves each
  as a new library file in a chosen folder, named from a column. A row with an unknown or missing
  field is refused before anything runs. The panel keeps a line per row (waiting, done, failed with
  its reason). Uses: a greeting per branch, a card per speaker, a number per region with the eight
  number templates.
- **Rules unchanged.** Each output is a library file that goes through review by itself; nobody
  approves what they uploaded.
- **Clients.** Web: runs with the page in front, as exports do now. Desktop: the right place, since
  the window may be minimised (D2). Phone: fill one form and export one file; the batch is shown
  disabled with its reason. Later the agent computer runs batches unattended (H-21).
- **Size and gates.** M to L. Owner decision O-H2 on the volume a batch may put into the library.

#### H-09 History by author, and «ما تغيّر منذ آخر تحرير لك»

- **HyperFrames.** Every change is kept with who made it (a person, an agent, another program),
  `catch-up` lists what others did since you last looked, and undo can take back one step, go back
  to before it, or keep later edits.
- **For us.**
  - The session history (`history.ts`, 200 steps) is kept on the device beside the crash draft
    (`persist.ts`), so a reload does not lose it.
  - When a person opens a project that someone else saved since that person's last save, or takes
    over the lease, the studio shows «ما تغيّر منذ آخر تحرير لك»: `diffDocs` from that person's last
    revision to the current one, in words, by who saved each revision, each line moving to its clip.
  - «السجل» marks the steps made before a take-over as the other person's.
  - Undoing one step out of order needs edits stored as operations, not snapshots; it waits for H-17.
- **Clients.** All three; the summary is most useful on a phone, where the director picks up a
  project away from the desk.
- **Size and gates.** S to M. No new table: revisions already record who saved them.

#### H-10 «لوحة اللقطات»: review sheets

- **HyperFrames.** A review sheet with a frame per scene, strips of the frames just before and after
  every cut (where flash frames, black frames and jump cuts hide), and a 360-pixel phone-size sheet
  to judge legibility.
- **For us.** Three pictures drawn by the compositor: one frame per marker or per clip, with times;
  «حواف القطع», the last frame before and the first after each cut; «على شاشة الهاتف», the same
  frames 360 pixels wide. Saved to the device, attached to a reserved place's task as its frame is
  today, shared in messaging, or (owner decision O-H4) added to the review request. On the review
  screen, «تشغيل حول الملاحظة» loops two seconds either side of a note, as their player plays a range.
- **Clients.** Made anywhere (it is the compositor); read best on a phone.
- **Size and gates.** S.

#### H-11 «فصل الصوت», linked clips, and J and L cuts

- **HyperFrames.** A video keeps its own sound only when marked; replacement sound and J and L cuts
  (sound that starts before its picture, or runs on after it) are separate audio clips. The editor
  detaches and merges sound, links and unlinks clips, and lint flags linked clips that drift.
- **For us.** A video clip's sound is part of the clip (`volume`, `mute`), so a J or L cut is
  impossible today. «فصل الصوت» puts the clip's sound on a free sound track as a sound clip of the
  same source and range, linked to it by a shared `link` field, and mutes the video clip. Linked
  clips move, trim and split together; «فك الربط» frees them; «دمج الصوت مع الفيديو» undoes it. A
  linked pair out of step shows by how many frames, and H-01 reports it.
- **Clients.** Web and desktop for editing. Phones keep links when they trim and split (they do
  both), so a phone never breaks a pair; the field passes through untouched on any client that does
  not know it.
- **Size and gates.** M.

#### H-12 Captions with word timing, without AI

- **HyperFrames.** Words with their own times, shown in groups of two to six, one group at a time,
  the current word highlighted, a style per look.
- **For us.** Transcription stays out (no AI in Version 0, owner answer of 2026-10-20), but the rest
  does not need it.
  - A text clip may carry its words' times.
  - «أسلوب الترجمة»: whole line, «الكلمة الحالية» in the accent colour, word by word, or short groups.
  - Word times come from three places: an even split of the cue by letters (automatic), «توقيت
    بالنقر» (play, and tap or press Space at each word), or an imported file that carries them.
  - The current word is drawn by shaping the whole line once and recolouring that word's span, so
    Arabic letters stay joined (the bug of H-05 avoided by construction).
  - Long cues split into groups that fit the title-safe width.
  - SRT export stays; WebVTT with word times can be added.
- **Clients.** All three. Tapping words is natural on a phone.
- **Size and gates.** M.

#### H-13 «هوية الاستوديو» as a design system, and projects that follow their template

- **HyperFrames.** A preset is a full design system: tokens for colour, radius, spacing and type in
  units of the frame, rules per aspect ratio, do and do-not lists, a caption skin. Their SDK keeps a
  project made from a template as a small set of overrides over the base.
- **For us.**
  - «هوية الاستوديو» grows from twelve colours and two fonts to: a type scale in proportion to the
    frame's short side (a title keeps its weight in 9:16 and 16:9, which the extra shapes of 62.10
    need), the default styles of title, subtitle, caption and lower third, a default entry and exit
    movement with its length, a default transition, the caption style of H-12, the looks of H-03, and
    where the brand mark sits in each shape.
  - New texts take these styles; «تطبيق الهوية» re-applies them to the selected clips.
  - A project made from a template remembers the template's version. When the template gets a newer
    numbered version, the project shows «إصدار أحدث من القالب» (as the library shows «إصدار أحدث»
    today) and lists what changed; «تحديث من القالب» applies it only where the project did not change
    the same thing. Nothing changes until then.
- **Clients.** All three (it is data).
- **Size and gates.** M. Owner decision O-H5: one identity, or the centre's plus one per campaign.

### Group C: useful, medium or computer-first

#### H-14 «نسخة خفيفة للمعاينة» made in the browser

- **HyperFrames.** Footage the browser plays badly gets a light preview copy by default; export reads
  the original.
- **For us.** `Desktop_App_Plan.md` D5 plans copies through FFmpeg for formats the browser cannot
  open. Mediabunny's conversion (resize, frame rate, key-frame interval, quality, hardware preference)
  can make copies in the browser for footage it can open but plays slowly: 4K, high bit rates, long
  groups of pictures. The copy is kept in the device cache beside the original, named by source
  version, recipe and engine version (the naming of D5); preview reads it, export reads the original,
  and the clip shows that a copy is in use.
- **Clients.** Web: offered for heavy sources. Desktop: the same, plus FFmpeg for the rest (D5).
  Phone: the most benefit and the highest cost in battery and heat; offered, never automatic.
- **Size and gates.** M.

#### H-15 «علامات الإيقاع»: beats on music

- **HyperFrames.** `beats` finds the beats of a music file; the editor shows beat markers, adds one
  at the playhead and snaps to them.
- **For us.** From the sound already decoded for waveforms (`peaks.ts`), find onsets and tempo in a
  worker and keep them on the music clip; snapping includes them. A key adds a beat at the playhead
  while playing.
- **Clients.** All three; tapping beats on a phone works well.
- **Size and gates.** S to M.

#### H-16 «تسجيل الحركة»: record movement into keyframes

- **HyperFrames.** While playing, dragging records position, and modifier keys record turn, opacity
  and size, as keyframes.
- **For us.** While playing (at full or half speed), dragging the selected clip on the preview records
  its place as keys, thinned to the few that keep the path. The main use is a covered area (62.8)
  that follows a moving face or a number plate, which 62.8 already allows with keys but which is slow
  to key by hand, and needs no AI.
- **Clients.** Web and desktop with a mouse. On a phone a finger following a face is the most natural
  of all, but keyframes are outside the phone tool set today (owner decision O-H6).
- **Size and gates.** S to M.

#### H-17 Planned edits and typed times

- **HyperFrames.** An edit that would move other clips can be shown first and applied after; every
  edit returns a receipt that undoes it; time can be typed as `+0.5`, `30f`, `end`.
- **For us.**
  - Before an edit that moves more than the selected clip («حذف وسد الفراغ», a freeze that pushes the
    track, «وضعه مكان المحجوز», «تحديث إلى الإصدار n» with a different length, «تطبيق الهوية»), the
    timeline shows where each clip will go; Enter applies, Escape cancels.
  - Time fields accept `+0.5`, `-2`, `30f` for frames, `1:02.5`, «نهاية», and Arabic-Indic digits.
  - Edits are named operations in the history, the ground for undoing one step out of order (H-09)
    and for any later helper (H-22).
- **Clients.** All three; typed times help most on phones, where dragging is imprecise.
- **Size and gates.** S to M.

#### H-18 «مسودة سريعة» and the export report

- **HyperFrames.** Presets `draft`, `looks` and `delivery`; a summary of the capture path and the
  time of each stage; unchanged frames reused; the output's length checked against the project.
- **For us.**
  - «مسودة سريعة»: 540p or 720p with faster encoder settings and the «مسودة» mark, for a quick
    opinion. Downloads only, as 62.10 already rules for the mark.
  - An export report: time spent decoding, drawing and encoding; whether the encoder ran on the
    hardware; frames written against frames expected; the output read back for its length. It is the
    figure the desktop panel «معلومات الجهاز» (D2) and the phone heat question need.
  - Where no visible clip changes from one frame to the next (still pictures, settled text, no
    keys), the drawn frame is reused; the encoder still receives every frame, so the file is unchanged
    and the compositing work is saved.
- **Clients.** All three; the quick draft is the phone's natural export, shared onward through «مشاركة»
  (M4).
- **Size and gates.** S to M.

#### H-19 «تحسين الكلام»: one sound pipeline for preview and export

- **HyperFrames.** Audio effects run as the same Web Audio code in preview and in the render.
- **For us.** A speech track may get a fixed chain (a high-pass filter, a gentle compressor, a limiter
  at -1 dB) built once and used by the preview's `AudioContext` and by the export's
  `OfflineAudioContext` inside the ten-second windows of `audio.ts`, with an overlap at each window's
  edge so the compressor's state carries over. Field interviews are the main use.
- **Clients.** All three (Web Audio is in every engine).
- **Size and gates.** M.

#### H-20 Motion paths, volume keys and scopes (computer only)

- **HyperFrames.** Editable motion paths, an onion-skin view, automation lanes for volume and
  effects, histogram, vectorscope and RGB parade.
- **For us.** Show the path of a clip with keys on the preview, a dot per frame; keys for volume
  beside the four of 62.7; «المقاييس» (histogram, luma waveform, vectorscope) drawn in a worker from
  the preview frame, useful once H-03 exists, and a natural candidate for the second screen (D6).
- **Clients.** Web and desktop. Not on phones.
- **Size and gates.** M. After H-03.

### Group D: gated

#### H-21 The same engine on the agent computer

- **HyperFrames.** Every render, local, Docker or cloud, runs the same runtime in a pinned headless
  Chrome; batches split across workers.
- **For us.** When the agent computer exists (E-1, desktop D7, phone M7 «صدّر على حاسوبي»), its
  exporter should be **our studio engine in a pinned Chromium**, not a second engine built on FFmpeg
  filters: the same compositor, fonts served by the site, a job pulled the way the WhatsApp bridge
  pulls, and the parity tests of H-04 run there. Two engines would draw two different videos.
  Keep the export entry point callable without the interface (it is plain TypeScript today).
- **Clients.** Serves all three.
- **Size and gates.** L. Gate: E-1 and an owner directive.

#### H-22 Ready for a later helper, without AI now

- **HyperFrames.** Built for agents: the selection can be read, edits are small operations with
  receipts, findings have stable codes, history knows who is an agent.
- **For us.** Nothing is built: Version 0 has no AI. But H-01 (stable codes), H-06 (actions with
  reasons), H-09 (authors) and H-17 (named operations) are exactly the shapes a helper would use. If
  the owner later allows one on the agent computer, it edits through the same operations, leaves the
  same trail, and can never approve or publish, as the reference fixes.
- **Size and gates.** None now.

#### H-23 Starting from a storyboard

- **HyperFrames.** Before building, the agent writes three storylines in words, then a specification
  with every adjective made a number and the shots by frame.
- **For us.** «لوحة القصة»: a project begins as a row of reserved places (62.12) with their
  descriptions, lengths and texts; its review sheet (H-10) goes to the director or the assistant for
  notes before anyone shoots, and the places' tasks follow as today. The storyboard is commented on,
  not approved: approval stays where the reference puts it.
- **Clients.** All three; writing descriptions works on a phone.
- **Size and gates.** S, since the pieces exist. Owner decision O-H7.

---

## 6. By platform: web, desktop, phone

"Full" means the same as on the other clients. "Better" means the client is the best place for it.

| Item | Web (laptop browser) | Desktop (Electron) | Phone (Android WebView, iPhone WebKit) |
|---|---|---|---|
| H-01 «فحص المشروع» | Full | Full | Full, fewer samples; read and move |
| H-02 Safe areas | Full | Full | Better: where the video is watched |
| H-03 Colour on the GPU | Full; Safari gains adjustments | Full (parity) | Better: iPhone gains adjustments (F-1) |
| H-04 One clock and parity | Full | Full (DT-05) | Full (MT-11) |
| H-05 Arabic test set | Full | Full | Must pass on iPhone WebKit |
| H-06 Actions with reasons | Full | Full | Full: the phone tool set becomes data |
| H-07 Keyboard timeline | Full | Full | Screen readers (TalkBack, VoiceOver) |
| H-08 Fields and batch | Fields full; batch with the page in front | Better: batch while minimised | One form, one file; batch disabled with reason |
| H-09 History and what changed | Full | Full | Better for reading the summary |
| H-10 Review sheets | Full | Full | Better for reading |
| H-11 Detach and link sound | Full | Full | Links kept on trim and split |
| H-12 Word-timed captions | Full | Full | Better for tap timing |
| H-13 Identity as design system | Full | Full | Full |
| H-14 Light preview copies | Offered for heavy sources | Better: plus FFmpeg formats (D5) | Offered only, never automatic |
| H-15 Beats | Full | Full | Better for tapping |
| H-16 Record movement | Full | Full | Natural with a finger; needs O-H6 |
| H-17 Planned edits, typed times | Full | Full | Typed times help most |
| H-18 Quick draft and report | Full | Full; report feeds «معلومات الجهاز» | Better: the draft is the phone's export |
| H-19 Speech clean-up | Full | Full | Full |
| H-20 Paths, volume keys, scopes | Full | Better: second screen (D6) | No |
| H-21 Agent computer | Sends jobs | Shares the engine and runner | Sends jobs («صدّر على حاسوبي», M7) |
| H-22 Later helper | None now | None now | None now |
| H-23 Storyboard | Full | Full | Full |

What this says about the three releases:

- **Web** carries almost everything, because almost everything is plain TypeScript in
  `src/lib/studio/`. Its limits stay those already known: the page must stay in front during exports,
  storage is rationed, and Safari lacks the canvas filter until H-03.
- **Desktop** is the home of volume and weight: batches (H-08), FFmpeg copies (H-14 with D5), scopes
  on a second screen (H-20), long exports, and later the same engine for the agent computer (H-21).
  HyperFrames' own desktop application is also Electron, which agrees with decision D-1.
- **Phone** is the home of reading and touch: check results, review sheets and "what changed" (H-01,
  H-09, H-10), tap timing and tap beats (H-12, H-15), a finger following a face (H-16), and the quick
  draft (H-18). H-03 is what lets the iPhone export the same picture at all.

---

## 7. What not to take, and why

| HyperFrames choice | Why not here |
|---|---|
| HTML and scripts as the project format | A project document would then hold runnable code shared between people through the database. Our JSON document is checked by `studio_doc_check`, capped at 1 MB, read by row level security, and keeps unknown fields so a phone never strips what a computer wrote: the same "the editor writes what you wrote" property without running anyone's script. |
| Rendering in headless Chrome on a server | Vercel functions are not a render farm (`Studio_Build_Plan.md` section 2). HyperFrames' own Vercel template needs Sandbox microVMs and about two minutes cold for an eleven-second video [32]. Our export runs in the person's browser; a server render waits for the agent computer (H-21). |
| HeyGen cloud rendering | Paid per minute, and media of 5 MB or more is uploaded as HeyGen assets by public, unsigned address [28]. Library files would leave the organisation outside its access rules. |
| Framey, the coding agents, voices, avatars, transcription, background removal | Version 0 has no AI (owner answer of 2026-10-20). H-22 keeps the door shaped, not open. |
| Google Fonts fetched at build time with the text | Sends the video's words to Google and contradicts 62.4 (fonts served by the site, no request to a font service). |
| GSAP as a bundled dependency | Under GreenSock's standard licence, not open source. Our motion renderers are our own code. |
| `drawElementImage` (HTML drawn into a canvas) | Behind a Chrome flag with many fallbacks. Worth watching: it could one day draw rich Arabic HTML text into the compositor, but `text.ts` already does what we need. |
| Telemetry on by default | Their command line sends usage unless switched off (`HYPERFRAMES_NO_TELEMETRY` or `DO_NOT_TRACK`) [21]. The site sends nothing of the kind. |
| Publishing to hyperframes.dev, community remix | Our files stay in the library and go through review; publishing stays a simulation. |
| Copying their code | Ideas are free to use; their code is Apache-2.0. If any code is ever copied (the contrast colour search, for example), it needs its notice in `THIRD_PARTY_NOTICES.md`. Nothing in this plan needs their code. |

---

## 8. A suggested order

Each round would end as the studio's rounds do: typecheck, build and tests passing, its own fixture
checks under `qa/`, a local commit and a dated `progress.md` entry with numbers.

| Round | Items | Why this order |
|---|---|---|
| 1 | H-04, H-05, H-06, H-02, then H-01 | Rules and tests first (cheap, and they protect everything after), then the checks that use them. All three clients at once. |
| 2 | H-03, H-11, H-12, H-10, H-09 | F-1 fixed before the phone applications (M5); the editing gaps people notice first. |
| 3 | H-13, H-08, H-15, H-16, H-17, H-18, H-07 | Brand and templates, then batches; the touch-friendly tools; accessibility. |
| 4 | H-14, H-19, H-20 | Heavier media work; H-14 lines up with desktop D5, H-20 with D6. |
| Gated | H-21, H-22, H-23 | E-1 and owner directives. |

Ties to the other plans: desktop D2's parity check (DT-05) uses H-04's method; desktop D5 takes
H-14's naming of copies; phone M5's gate (MT-11) runs H-04 and H-05 on Android WebView and iPhone
WebKit, and expects H-03 to have closed F-1.

---

## 9. Decisions for the owner

| Id | Question | Proposal |
|---|---|---|
| O-H1 | Which items, and in which order? | Rounds 1 and 2 of section 8. |
| O-H2 | May a batch put many files into the library at once, and up to how many rows? | Yes, into one chosen folder, up to 50 rows a batch; each file reviewed by itself. |
| O-H3 | The reading rate and the smallest text size used by H-01. | Start with one second plus 0.4 seconds a word, and 3 percent of the short side; tune with the content team. |
| O-H4 | Do check results and review sheets travel with «تصدير وإرسال للمراجعة» to the reviewer? | Yes, as information under the player; they never block a decision. |
| O-H5 | One «هوية الاستوديو», or the centre's plus one per campaign? | One now; campaigns later if asked. |
| O-H6 | May phones record movement (H-16) and tap caption and beat times (H-12, H-15)? | Yes for tapping; recording movement on tablets and large phones only. |
| O-H7 | Start projects from a storyboard (H-23)? | Yes, as an option of «مشروع فيديو جديد». |

---

## 10. Method and sources

### 10.1 What was done

- Read our side: `MVP_draft.md` sections 57 and 62 to 62.14, `Studio_Build_Plan.md`,
  `Desktop_App_Plan.md`, `Mobile_Apps_Plan.md`, `Ideas_Backlog.md`, `Status.md`, and in the code
  `src/lib/studio/` (`schema.ts`, `compose.ts`, `cover.ts`, `checks.ts`, `history.ts`, `text.ts`,
  `timeline.ts`, `peaks.ts`, `loudness.ts`), `src/components/studio/timeline.tsx` and `stage.tsx`,
  and `src/lib/motion/renderers.js`.
- A public-source research pass over the official site, documentation and changelog, the GitHub
  repository, pull requests and issues, the npm registry, HeyGen's research article, Hacker News and
  independent reviews.
- A read-only analysis of the HyperFrames package installed on this computer (version 0.8.195, under
  `D:\app\npm-cache\_npx\`), its bundled Studio, player, renderer and lint, its state files, and the
  HyperFrames agent instructions installed under `C:\Users\User\.claude\skills\` (`hyperframes`,
  `hyperframes-cli`, `hyperframes-registry`, `media-use`). Only `--version`, `--help` and
  `media-treatment --capabilities` were run, with telemetry off; no render, no sign-in.
- Spot checks on 2026-10-25 through the GitHub and npm APIs and the documentation pages: licence,
  creation date, stars, forks, release count and tags, issue 5885 (open), pull request 5887 (open),
  pull request 5744 (merged 2026-10-17), the desktop application's platforms and HeyGen account, the
  Docker pixel note, and the variables panel's "Use this template".
- Mediabunny's conversion options (for H-14) checked in its documentation through Context7.
- Not done: no HyperFrames render was run here, so no speed figure in this document is our own; the
  download count and the reviewers' timings are as reported by their sources.

### 10.2 Sources

[1] https://github.com/heygen-com/hyperframes
[2] https://api.github.com/repos/heygen-com/hyperframes (fetched 2026-10-25)
[3] https://registry.npmjs.org/hyperframes (fetched 2026-10-25)
[6] https://hyperframes.heygen.com/changelog
[7] https://hyperframes.heygen.com/concepts/determinism
[8] https://www.heygen.com/research/html-to-video
[9] https://github.com/heygen-com/hyperframes/tree/main/packages/engine/src/services
[10] https://hyperframes.heygen.com/packages/player
[11] https://hyperframes.heygen.com/concepts/frame-adapters
[13] https://hyperframes.heygen.com/reference/html-schema
[15] https://hyperframes.heygen.com/guides/performance
[16] https://hyperframes.heygen.com/studio (and its pages timeline, canvas, animation, captions, variables, shortcuts)
[17] https://hyperframes.heygen.com/guides/webmcp
[18] https://hyperframes.heygen.com/studio-app (and its pages workspace, export, share)
[19] https://github.com/heygen-com/hyperframes/pull/5129
[20] https://runtimewire.com/article/heygen-hyperframes-studio-agent-video-editor
[21] https://hyperframes.heygen.com/packages/cli
[22] https://hyperframes.heygen.com/reference/lint-rules
[23] https://hyperframes.heygen.com/guides/hyperframes-vs-remotion
[24] https://hyperframes.heygen.com/concepts/variables
[25] https://hyperframes.heygen.com/sdk/quickstart
[26] https://github.com/heygen-com/hyperframes/blob/main/registry/registry.json
[28] https://hyperframes.heygen.com/deploy/cloud
[29] https://hyperframes.heygen.com/deploy/aws-lambda
[30] https://hyperframes.heygen.com/deploy/gcp-cloud-run
[32] https://github.com/heygen-com/hyperframes-vercel-template
[33] https://github.com/heygen-com/hyperframes/issues/5885
[34] https://github.com/heygen-com/hyperframes/pull/5887
[35] https://github.com/heygen-com/hyperframes/pull/5744 and https://github.com/heygen-com/hyperframes/issues/1934
[37] https://github.com/heygen-com/hyperframes/pull/196
[39] https://andrew.ooo/posts/hyperframes-heygen-html-video-agents-review/
[40] https://dev.to/hoe_shilee_b3aa96e0da49e/remotion-vs-hyperframe-vs-coanimator-best-ai-video-editor-3n6n
[44] https://themenonlab.blog/blog/heygen-hyperframes-video-as-code
[48] https://hyperframes.heygen.com/guides/color-grading

Source numbers follow the research pass and are not consecutive; the missing numbers were sources
not cited here.

### 10.3 What independent reviewers said, in brief

- Speed varies widely with the machine and the capture path: one reviewer measured 35 to 50 seconds
  for a ten-second 1080p video on an M2 Pro and about three minutes for thirty seconds [39]; HeyGen's
  own performance guide shows one CSS declaration changing a 300-frame render from 25.0 to 9.8
  seconds [15].
- The common criticism is that a broken rule fails quietly, "the render simply looks wrong" [40],
  which is why their lint and checks carry so much weight, and why H-01 and H-04 lead this plan.

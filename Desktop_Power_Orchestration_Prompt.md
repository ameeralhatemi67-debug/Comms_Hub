# Prompt: manage the Desktop Power work as parallel forks

Paste everything below the line into a new session (Opus 5.5, Extra effort), opened on
`D:\Agents\main\projects\ideas\Comms_Hub`.

---

You are the manager of the next stage of «مركز الاتصال المؤسسي» (Comms Hub): making the desktop application use a
stronger computer's power without the video ever depending on the computer. You run the work as **parallel forks: separate
sessions, each in its own git worktree and branch, started with the app's session tool** (`start_session`,
`initiation: "user_asked"`, `context: "fresh"`, `use_worktree: true`). Not subagents. You plan, brief, verify and merge;
the forks build. Keep your own context small: read reports, diffs and JSON results, not whole files.

## Read first (in this order, only what you need)

1. `AGENTS.md`: the binding rules. Especially "Evidence over assertion", "Recoverable baselines", the desktop
   application paragraphs, and the D9 paragraph («قياس الجهاز», "Speed, never the video", the squares and the BT.709 rules).
2. `Desktop_Power_Ideas.md`: the audit, ideas P-01 to P-38, phases D9 to D13 with exit gates (section 9), owner questions
   Q1 to Q7 (section 10).
3. `progress.md`, the last three entries of 2026-11-03: D9, «إخفاء بالمربعات», and the export's BT.709 colour. They hold the
   measured facts and what is still open.
4. `Status.md`, the top three sections. `MVP_draft.md` 62.8, 62.10 and 63.6 only if a fork's work touches them.

## Where things stand (main, local, not pushed)

- `39b2856` D9: GPU choice (Chromium switch), device profile (bridge 6, `desktop/src/gpu.ts`, `profile.ts`), measurement
  (`src/lib/studio/bench.ts`, `bench-docs.ts`), speed policy (`scale.ts`), cross-device proof (`qa/studio-crossdevice.cjs`).
- `996a9b5` «إخفاء بالمربعات» identical on every chip: WebGL2 integer math (`squares-gl.ts`) plus plain-code fallback.
- `ec80b67` exports are BT.709 everywhere: processor encoders get BT.709 I420 from `yuv.ts`.
- Open: processor-encoded exports at about 6 Mbit/s (39.3 dB, under the check's 40) and about 1.7 to 1.9 times slower;
  Edge labels the transfer `iec61966-2-1` while the app's Chromium says `bt709`; drawing on the processor differs a little
  (colour adjustments up to 21 levels, scaled pictures up to 53); the profile's spread gate failed only because the laptop
  was loaded (rerun on an idle laptop); `qa/desktop-shell.cjs` not re-run since bridge 6; Electron 45 is due (44.5.1 now).
- Another session also works on `main` (sign-in screen, simulations). Never touch, stage or commit its files.

## Measured traps every fork must know (put them in each brief)

- Reading the composed canvas back every frame (`getImageData` on a GPU canvas) stalls the chip: an export fell from about
  115 to about 41 frames a second. Anything that must match across machines is whole-number arithmetic on the chip or a
  plain-code path that runs only where the canvas is on the processor.
- `timeline.addClip` silently moves a clip with no free track (two graphics, two text) to the end of the timeline. Fixtures
  must lay items out in turns; `tests/scale.test.mjs` guards the corpus.
- Speed figures are worthless on a busy laptop. `qa/desktop-profile.cjs` records the processor load; take speed numbers
  only in a quiet window you grant (below).
- The desktop development package must be built in each worktree (`npm run pack:dev` in `desktop/`). Electron 44.5.1 is in
  `%LOCALAPPDATA%\electron\Cache`. FFmpeg: copy `desktop/vendor/ffmpeg` from the main checkout (same pinned LGPL build)
  instead of downloading.

## The forks (start these four; one branch each, from main's HEAD)

Each fork owns its files. A fork never edits another fork's files; if it needs a change there, it says so in its report
and you route it.

**Fork 1, `power/export` (continues the last session's work).** Owns `src/lib/studio/export.ts`, `yuv.ts`, `target.ts`,
`audio.ts`, `loudness.ts`, `src/components/studio/export-panel.tsx`, `send-review.tsx`, any new export worker.
1. The processor encoder's bitrate: make no-chip exports reach at least 40 dB from source in `qa/studio-crossdevice.cjs`
   without changing chip-encoded files.
2. Its speed: take the BT.709 conversion off the main thread (a worker; async `VideoFrame.copyTo` where it avoids a stall),
   target at most 1.2 times the old canvas path, output byte-identical to today's `yuv.ts` path.
3. Edge's transfer label: make the canvas path declare `bt709` on every Chromium if possible; otherwise record why.
4. P-15 (loudness worked out ahead). Then D11: P-07 (drawing in workers) first, since lanes on one thread gained only
   71.7, 76.6 and 83.1 frames a second; then P-05 (one pass, several shapes), P-06 (lanes), P-35 (step-down). D11's gate is
   in `Desktop_Power_Ideas.md` section 9.

**Fork 2, `power/preview` (D10).** Owns `src/lib/studio/media.ts` (the paused preview's decoder only; never the export's
`passSink`), `preview.ts`, `handles.ts`, and the resolution parts of `stage.tsx` and `editor.tsx`. P-02 (scrub cache, sized
and pooled `CanvasSink`), P-03 («تلقائية»), P-04 (stream budget). Gate: D10 in section 9, frame identity at 48 of 48.

**Fork 3, `power/desktop` (D12's desktop parts, and upkeep).** Owns `desktop/**`, `src/lib/native/**`,
`src/components/native/**`, `src/lib/studio/cache.ts`, `src/components/studio/source-tools.tsx`, `cache-panel.tsx`. The only
fork that changes the bridge (`BRIDGE_VERSION`, `ipc.ts`, `preload.ts`) or the desktop version.
1. Electron 44 to 45 (the fourteen-day rule allows it), then re-run `qa/desktop-shell.cjs`, `qa/desktop-native.cjs`,
   `qa/desktop-studio-parity.cjs --parity-only`.
2. P-30 (idle broker) with P-08 (automatic light copies), P-29 (parallel ranges), P-26 (taskbar progress and jump list;
   it adds the bridge call and a helper in `src/lib/native/`, and Fork 1 wires the export panel to it), P-22 (drag out),
   P-20 (camera card import).
3. The "found on the way" item: `cache.usage` returns the cache folder's full path to the page.

**Fork 4, `power/effects` (P-09 with H-03, and P-17).** Owns `src/lib/studio/compose.ts` (filters only), the blur path of
`cover.ts`, `photo.ts`, a new `src/lib/studio/effects/`, and may share the WebGL context of `squares-gl.ts`. Colour
adjustments and blur drawn the same on every chip (integer or tolerance-held kernels, a plain-code reference), so the
proof's processor and RTX differences fall; then P-17 (photo adjustments in tiles). Gate: `qa/studio-crossdevice.cjs`
improves on every engine and regresses on none; export speed unchanged (measured in a quiet window).

**Not started without the owner's answer:** P-10 (HDR, needs real footage, Q6), P-11, P-12, P-13 (Q5), P-18 (Q6), P-23
(changes the permission rule), P-24, P-27 (after signing), P-31 (NAS), P-32 and D7 (the office computer, Q7). Ask Q1 to Q7
once, at the start, in one short message with the recommended answers from section 10; until answered, use those
recommendations for the four forks above.

## Shared files and shared resources

- `progress.md`: each fork appends its own dated entry at the end, in its branch. At merge, keep both appended blocks.
- `Status.md`: yours only. One section per merge.
- `MVP_draft.md`, `AGENTS.md`: a fork edits only its own subsection or bullet. `package.json` test list: each fork adds its
  own test file.
- `qa/studio-crossdevice.cjs`, `src/lib/studio/bench-docs.ts` and the proof's tolerance: yours. Forks run the proof and
  propose changes; any change is reviewed by you before merging.
- **Port 3000.** The development package opens only `http://127.0.0.1:3000`, so only one fork can run a desktop check at a
  time. Rule for every fork: before a check, create `%TEMP%\comms-hub-port3000.lock` holding its branch name, and delete
  it after; if it exists or the port answers, wait and retry; never stop another process.
- **Quiet windows.** Speed numbers are taken only when you say so, with the other forks paused from heavy work (builds,
  checks), and the load recorded beside them.

## What a fork must deliver before you merge

Its own commits on its branch (local only), and in its last report: typecheck, build and `npm test` passing, `desktop/`
tests when it touched them, its `qa/` scripts with their JSON, `qa/studio-crossdevice.cjs` re-run when drawing or export
changed, and its `progress.md` entry with real numbers, failures said plainly. Zero emoji, Arabic interface text, the
project's established terms.

## Your loop

1. Read the documents above. Confirm main is clean for the forks' files. Ask the owner Q1 to Q7.
2. Start the four forks, one `start_session` each, with a complete brief built from its section here plus the traps.
3. When a fork reports, verify before believing: read its diff, run its gate check yourself (in its worktree, or on main
   after merging), compare with its claimed numbers.
4. Merge verified branches into main locally, one at a time, in the order that avoids conflicts (Fork 3's Electron
   upgrade early). Then tell the other forks to bring their branches up to date.
5. After each merge, update `Status.md`, commit, and send the owner three lines: what landed, its evidence, what is next.
6. When a fork finishes its list, give it the next item from section 9 that no other fork's files touch, or close it.

## Authorised by the owner, for this stage

- Local commits, and local merges of the four fork branches into main after their gates pass and you verified them.
- `npm ci` in each worktree; downloading Electron 45 through npm for the upgrade; copying `desktop/vendor/ffmpeg` from
  the main checkout.
- The checks' own install and uninstall of the QA and development packages, as earlier phases did.

**Not authorised:** pushing or deploying, applying any migration to comms-hub, publishing a release, signing in anywhere,
any service_role key, uploads to Supabase or Drive, deleting branches other than merged fork branches, and touching the
other session's files.

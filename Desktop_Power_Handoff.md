# Desktop Power stage: handoff at the owner's pause, 2026-11-04

The stage that makes the desktop application use a stronger computer's power without the video ever depending on the
computer (`Desktop_Power_Ideas.md`, phases D10 to D12, after D9 of 2026-11-03). It ran as four parallel fork sessions,
each in its own git worktree and branch cut from `998ef0c`, with one manager session that briefed, verified and merged.
The owner paused it on 2026-11-04 at about 14:40. Every fork stopped at a safe point: no process of theirs runs, no
port lock is held, every branch tree is clean.

Nothing is pushed, deployed or released. No migration was applied. Everything below is local to this laptop.

## 1. Where it stands

About three quarters of the listed work is merged into `main`. What is left is two pieces:
- the rest of Fork 1's D11 gate runs;
- Fork 4's effects, which fail their speed gate.

| Fork | Its list | On `main` | Left |
|---|---|---|---|
| 1 export | Rate, BT.709 workers, label, P-15; D11: P-07, P-05, P-06, P-35 | Items 1 to 3 and P-15 | D11 gate rows; merge of D11 |
| 2 preview (D10) | P-02, P-03, P-04; dispose fix | All | Nothing; ideas in 3.2 |
| 3 desktop (D12) | Electron 45; P-30 with P-08, P-29, P-26, P-22, P-20; cache label | All | Nothing; P-28 waits for the owner |
| 4 effects | P-09 with H-03; P-17 | Nothing | Speed gate fails; one more slot or park |

The owner accepted the recommended answers to Q1 to Q7 of `Desktop_Power_Ideas.md` section 10 on 2026-11-03.

## 2. What is on `main`

Each merge was verified by the manager's own runs in a clean worktree before merging. `Status.md` has one section
per merge, with the evidence.

| Merge | What | Status section |
|---|---|---|
| `60335d7` | Electron 45.0.0 (Chromium 156), desktop 0.7.1 | `a80d45b` |
| `dcb2d80` | Fork 1 items 1 to 3 and P-15. The processor encoder at 10 Mbit/s (41.2 dB, chip packets unchanged). BT.709 in workers with WebAssembly lanes (1.19 times the canvas path in the application, 1.14 in Edge, same bytes, works under the real CSP and falls back without WebAssembly). `bt709` named on every engine. Loudness worked out ahead (first frame 470 ms against 7270) | `3158c15` |
| `411007d`, `d39660a` | Fork 3's D12, desktop 0.8.0, bridge 9: light copies in idle time with the broker's holds, library copies two parts at a time, taskbar progress and jump list, drag out, camera card import, `cache.usage` gives a label and never a path | `ab371d8` |
| `aa9ac18`, `7bc3757` | Fork 2's D10: the paused preview's frame memory, «تلقائية», the stream budget, wired to the idle-time copies; the device panel's plan note | `a8e3206` |
| `85e642a` | Fork 2's follow-up: a closed media pool disposes its Mediabunny inputs, so a closed project stops decoding | `5a442e6` |

Manager decisions recorded there:
- **P-07 (drawing in workers)** stays off by default (option A). Frames in workers differ by 1 level on the AMD chip and in blur and filters with no chip.
- **Light copies** pause while Windows lowers its own speed limit, and run one at a time (`copiesAtOnce` 1): widths 1, 2 and 3 took the same time.
- **Fork 4's effects:** colour by a WebAssembly kernel, small blurs as three box passes.
- **No-chip «transitions»** at 48.77 dB against 48.90 is accepted: picture scaling alone accounts for it.

## 3. Each fork: branch, state, what remains

Worktrees are under `.claude/worktrees/`. Session links: Fork 1 `local_f9305850-76fa-47d1-9e3b-1d3608f31017`, Fork 2
`local_6a69471b-1e5c-4e16-a31c-6cfdd7d97970`, Fork 3 `local_5d732c7f-f6fe-4416-924b-163979b325b8`, Fork 4
`local_9f29b458-03fc-46e1-b096-db6ee73b1627`. The manager was `local_62689cbb-357d-4dcb-ba5f-e01fc2e8faa6`.

### 3.1 Fork 1, export (`claude/power-export-821809`, tip `f155ca8`, 18 commits not in `main`)

**Built on the branch, not merged.** At `f155ca8`: typecheck clean, `npm test` 824 of 824. The branch has `main` up to
`aa9ac18`; `85e642a` is not merged into it yet.
- **P-06 lanes and P-35's ladder** (`b8a0413`, `a04d40c`, `c7f8ade`):
  - Edge 20 s: 16 of 16.
  - AMD chip (app-saving): 20 s with faults 8 of 8; 1080p ten minutes 5 of 5, all 18,000 frames of two and three lanes equal to one lane's; 4K ten minutes 5 of 5 (every fifteenth frame and 30 either side of each boundary).
  - RTX (app-strong): 20 s with faults 8 of 8; 1080p ten minutes 5 of 5.
  - Every boundary frame within 0.04 dB. Encoded bytes differ between lane counts while composed frames and structure are exact (section 5.2's second level).
- **P-05, one pass for several shapes** (`c7f8ade`, `7ecc0dc`): Edge 8 of 8, AMD 4 of 4, RTX 4 of 4. With no chip, two shapes' packets were 56 dB apart while frames and structure stayed exact.
- **P-07, drawing in workers** (`c7c8cc6`, `bc68a4c`): off by default. `qa/studio-export-draw-edge.json` is 6 of 8; the two failures are the measured differences.
- **The export panel** wired to taskbar progress and «اسحب الملف» (`20133fa`), and the panel's lanes and shapes: unit tests only, not clicked through.

**Remaining.**
- D11 gate rows:
  - RTX 4K ten minutes: one lane passed (576 s); the run then stopped on a full drive C, which is fixed.
  - No chip: 20 s with faults, shapes, 1080p ten minutes. Expect a crawl.
  - (d) the lanes' time ratio per chip, in a quiet window, not yet tried.
- Then the manager's own verification and the D11 merge.
- P-07 stays off until Fork 4's whole-number effects are on `main` and the corpus is exact in workers per engine.

**Resume.** From the worktree, one engine at a time; each check takes and frees the lock itself. Set
`TEMP` and `TMP` to `D:\Agents\main\projects\ideas\Comms_Hub\.claude\worktrees\power-export-821809\qa\artifacts\tmp` on every
command. First merge `refs/heads/main`, and run `npm ci` and `npm run pack:dev` in `desktop/` if `desktop/` changed.
1. `ENGINES=app-strong SECONDS=600 SIZE=2160 FAULTS=0 EVERY=15 node qa/studio-lanes.cjs`
2. `ENGINES=app-nochip SECONDS=20 node qa/studio-lanes.cjs`
3. `ENGINES=app-nochip node qa/studio-shapes-onepass.cjs`
4. `ENGINES=app-nochip SECONDS=600 SIZE=1080 FAULTS=0 node qa/studio-lanes.cjs`
5. In a quiet window: `QUIET=1 SECONDS=120 SIZE=1080 FAULTS=0 ENGINES=<engine> node qa/studio-lanes.cjs`, then `SIZE=2160`.

### 3.2 Fork 2, preview (`claude/power-preview-b15ae2`, tip `b0a319f`, nothing outside `main`)

**Verified only on the fork's own runs:**
- the no-chip rows of `qa/studio-scrub.cjs` and `qa/studio-autores.cjs`;
- `studio-autores` 9 of 9;
- `studio-preview-ui` 9 of 9 before the harness fixes (`3ab0c25`, `e97fb50`), not rerun after them.

**The manager's own runs:**
- the RTX scrub row in full, 6 of 6;
- `studio-preview-ui` 8 of 9, its one failure a run on a saturated processor;
- the no-chip rows refused: the package window drew about one frame a second, first with the processor saturated, later with the laptop in use.

The dispose fix is proven by `tests/studio-media-dispose.test.mjs` only. The fork's `progress.md` entry still needs a
line for `aab1a1d` and `b0a319f` (824 tests).

**Known gaps:**
- No check drives a copy made in idle time into an open editor.
- No check reads «scrubbing» or «playing» in the broker.
- The second-screen preview (D6) keeps today's decoder.
- With no chip and 10 s key frames, back-to-back forward steps take 1692 ms against 1639 today.

**Ideas that touch only its files:**
1. A check that swaps a playing element to an idle-time copy within one frame, and reads the broker's activity.
2. Reading ahead on the no-hardware path during a run of steps.
3. The D6 window following the plan and the frame memory.
4. Recording the no-chip load after a row.

### 3.3 Fork 3, desktop (`claude/power-desktop-5fba9d`, tip `7bc3757`, nothing outside `main`)

**Unverified:**
- the release installer's install, run and uninstall: skipped, since a real installation is on this laptop;
- a real camera card: the check used a fixture of the same shape, a 2.07 GB AVCHD stream in two parts;
- a real drag into Explorer;
- anything signed in.

**Remaining:**
- P-28 («فتح بالبرنامج الافتراضي») waits for the owner's word.
- P-25 belongs to the export.
- Card files straight onto the timeline are outside this stage.
- The release steps (build, sign, upload to `desktop-releases`) are the owner's.
- Electron 45.2.1 is due from 2026-11-14 under the fourteen-day rule.

### 3.4 Fork 4, effects (`claude/power-effects-72ab66`, tip `50b0916`, 17 commits not in `main`)

The fork's full pause note is `fork4-power-effects-pause-2026-11-04.md` in the manager's notes folder,
`C:\Users\User\AppData\Local\Claude-Data\claude_pzs8sxrjxfjjc\side-session-notes\local_62689cbb-357d-4dcb-ba5f-e01fc2e8faa6\`.
Fork 3's `fork3-wiring-requests.md` is there too.

**Built and checked:**
- identity (chip equal to plain code) 19 of 19 on all four engines;
- photo tiles 9 of 9;
- the cross-device proof 38 of 43 on its merged tree, against `main`'s 37, regressing on no document;
- `npm test` 801 of 801, and the build.

**The speed gate fails** (export frames a second, before and after, at `60699cc`):

| Engine | Before | After | Change |
|---|---|---|---|
| Edge | 68.3 | 69.8 | Pass |
| App, AMD chip | 96.5 | 92.6 | -4.0%, fails |
| App, RTX | 166.5 | 175.0 | Pass |
| App, no chip | 11.8 | 6.1 | About half, fails |

The cost is the blurred cross. On the chip, each blurred clip is drawn into a layer, uploaded, blurred and drawn back.
With no chip, the blur is plain code, and every effect pays a read-back and a write-back.

**Written, unit tests only:**
- (a) blurs at the frame's own size;
- (b) WebAssembly lanes for the blur (`5372c64`, `50aeab7`, `bd2ccaa`, `50b0916`).

Typecheck has not run since these. They change bytes for blurs above 4 pixels, so the bound and the proof must be re-run.

**Resume:** merge `refs/heads/main`, then `sh qa/artifacts/fxdiag/slot5.sh`, about 35 minutes. It runs typecheck and unit
tests, then under the lock parity, speed, the proof, photo tiles and frames. It stops after the speed check if any
engine is under 97% of before.

## 4. Decisions waiting for the owner

1. **Fork 4:** one more timing slot for (a) and (b), or park P-09 and P-17 on their branch. If no chip still fails after (b), what is left is the read-back each effect pays, which is a design decision rather than more code.
2. **P-07 option B:** always draw in one worker, so that every lane count gives identical frames, at the cost of changing today's frames once. Not built; option A is in place.
3. **Fork 3:** P-28 next, or close the session.
4. **Drive C:**
   - It reached 3.5 GB free during the D11 runs. Fork 1's own leftover profiles, about 15 GB, are removed, and it was 28 GB free at the pause.
   - Removable with the owner's word:
     - the Visual Studio Installer's temp copies, 503 folders, 5.8 GB;
     - the Android emulator's temp files, 9.9 GB, last used 2026-11-01;
     - 518 old check profiles in `%TEMP%` (`comms-hub-desktop-qa-*`, `playwright*`), 7.5 GB.
5. **Pushing and deploying** the merged work. Nothing is pushed.
6. **The director's laptop (Q1):** run D9's device profile there before trusting the lanes and preview settings tuned on this laptop.

## 5. Resuming: suggested order

1. Fork 1's D11 rows 1 to 4 on port 3000. Not a quiet window, but the laptop should be idle and its screen on.
2. Fork 1's (d), in a quiet window.
3. The manager verifies D11 at Fork 1's final commit:
   - typecheck, tests and build in a clean worktree;
   - one full engine row of `qa/studio-lanes.cjs`;
   - `qa/studio-crossdevice.cjs`.
   Then merge, with `Status.md`.
4. Fork 4's slot, by the owner's decision in section 4, then its merge or its parking.
5. Optional: Fork 2's ideas; Fork 3's P-28.

## 6. How the stage was run, and the traps found

**Port 3000.** The development package opens only `http://127.0.0.1:3000`, so one desktop check runs at a time.
- The lock is `%LOCALAPPDATA%\Temp\comms-hub-port3000.lock`, created atomically and holding the running branch's name. A detached worktree writes `HEAD`.
- The D10 and D11 checks take the lock themselves: never hold it around them.

**Quiet windows.** Speed figures are taken only when the manager opens a window and the other forks run nothing.
- The load is recorded beside every figure, and rounds before and after are interleaved.
- A round run beside another fork's work is run again.

**Messages.** A message to a session's `local_…` id waits until that session's turn ends, and forks run long turns.
Reach a working fork by its name from `ListAgents`, which arrives at its next step. The manager's own peer name changed
during the day; read it from `ListAgents`.

**Drive C.** A check's application profile holds private copies of its sources and exports; a ten-minute 4K run needs
6 to 10 GB.
- Run checks with `TEMP` and `TMP` on D:, inside the worktree, in `qa/artifacts/tmp`, which is gitignored.
- Remove each profile when its engine closes.

**A covered window.** Chromium throttles a package window that Windows thinks is covered, to about one draw a second.
- The checks launch it with `--disable-features=CalculateNativeWinOcclusion`, in front.
- The D10 checks refuse to time a window that does not draw.
- Timed checks need the laptop idle and its screen on.
- With no chip, 4K decoding saturates about eight cores and slows the window the same way.

**Windows' own speed limit** falls to 34 to 75% whenever copies load every core and returns within about ten seconds.
Checks that need one reason keep those events out.

**Measured rules kept from D9:**
- never read the composed canvas back each frame on the chip;
- `timeline.addClip` moves a clip with no free track to the end;
- the low-latency decoder is only for computers with a hardware decoder;
- a jump ends every other pass;
- re-seeks count as missed frames;
- Mediabunny inputs are disposed on close.

**Verification worktree.** The manager verified in `.claude/worktrees/verify-e3cab67`, a detached worktree with its
own `npm ci`. A junction to the main checkout's `node_modules` breaks `next build`, because Turbopack refuses modules
outside the root. Its run logs are in `.claude/worktrees/verify*.log`.

**Other files.** Another session works on `main` in the main checkout (sign-in screen, role simulations). Its files
were never touched: `.claude/launch.json`, `validation/recheck-R01.md`, `Owner_Setup_Guide.md`, `Role_Simulation_*`,
`qa/simulations/`, `videos/`.

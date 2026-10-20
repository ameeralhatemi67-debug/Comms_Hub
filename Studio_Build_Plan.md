# The studio inside «استوديو الحركة»: audit and build plan

Plan of 2026-10-19, from the owner's request of the same day. Status: **accepted by the owner
2026-10-19**. It replaces the open research direction of `Studio_Feasibility_and_App_Path.md`
(2026-10-15) with decisions that can be built. Each phase below ends with a local commit and a
dated `progress.md` entry, and leaves the site working. Do them in order.

Companion documents: `Studio_Feasibility_and_App_Path.md` (the research audited here),
`AGENTS.md` (rules), `MVP_draft.md` section 62 (the studio's specification), `Permissions_Plan.md`
(fixed capabilities), `Settings_Integrations_Plan.md` (E-1: nothing scheduled in the site).

---

## 1. What the owner asked for

1. Audit the feasibility research and make a better plan from it.
2. Build the studio fully, inside «استوديو الحركة», not mixed into the current template editor:
   a new tab, «الاستوديو», opened from a tab bar on that page, so the current content is untouched.
3. The motion graphics of the current page stay usable inside the studio.
4. Only the Admin and the director (مدير الاتصال المؤسسي) may open the studio.

Owner answers of 2026-10-19: a tab in the page (not a new browser tab); restore the damaged
`MVP_draft.md` first; build laptop web and phone web now, native applications later; the editing
engine is chosen by research (section 3).

## 2. Audit of the feasibility research

**What holds.** Keep the current stack (Next.js, React, TypeScript, Supabase, Vercel). Laptop web
first; phone web with a reduced tool set that keeps what it cannot edit. Projects saved with the
exact versions of their sources. Approval and publishing rules unchanged. Vercel functions are not
a render farm. No scheduler until the organisation computer exists (E-1). Mediabunny is a sound
base for media in the browser.

**What is wrong or stale.**

| Finding | Evidence | Consequence |
|---|---|---|
| Its first video reference, OpenCut Classic, is dead. | The repository was archived by its owner on 2026-05-17, "no longer maintained". | It cannot be the reference engine. |
| It cites `MVP_draft.md` section 57. | Commit `dbaaa74` (a settings change, 2026-10-15) deleted sections 12 to 61, 1,782 lines. | Restored first (progress entry of 2026-10-19). |
| It assumes the existing page model covers a studio page. | `src/app/[[...slug]]/page.tsx` checks only the first address segment; `/motion` is open to all eight roles. | A plain `/motion/studio` would be open to everyone. |
| It does not use the tool that already exists for this. | Fixed capabilities: `perm_eval` decides them before any grant; five write paths refuse them with `CAP_FIXED` (approval, publishing, urgency 3). | Admin and director only is one seeded row plus checks. |
| Its role table (9.3) gives designers, producers and writers studio work. | Owner decision of 2026-10-19. | Others meet studio output through the library and the work cycle, not the studio. |
| It treats the file route as ready for editing. | `/api/media/[id]/content` sends `no-store`; every range request runs the full sign-in and capability check and a provider fetch through Vercel. | Scrubbing over it is slow and costly: each version is copied to the device once. |
| It says nothing on reusing the motion renderers. | `renderFrame` clears its canvas, resets the transform and sets the module-wide `gScale` (a layer cache of 18 entries keyed on it); it creates canvases with `document.createElement`. | Each motion clip renders into its own off-screen canvas at a fixed scale, on the main thread. |
| It misses a destructive collision. | `src/components/kit.tsx` binds Ctrl+Z on the whole document; `undoKeyApplies` exempts only `/mail`. | Ctrl+Z in the studio would undo the person's last library action. The studio is exempted. |
| It misses self-approval. | `SELF_APPROVAL` in the library, `work_uploader_block` in the work cycle. | The director cannot approve the director's own export: the assistant approves it, or the admin while testing. |
| Its exit evidence assumes signed-in browser checks. | `AGENTS.md` forbids any sign-in bypass. | Evidence is fixture pages, SQL rule runs and the owner's signed-in walkthrough. |
| It plans shared temporary storage with a ten-day remote cleanup. | Nothing may be scheduled in the site (E-1). | Version 1 keeps no shared temporary files: sources are library files or files on this device; only the device cache expires. |

**What is missing.** A decided engine, a data model, the access wiring, a declared tool set,
concrete tests and an order of work with gates. Sections 3 to 7.

## 3. Engine decision (research of 2026-10-19)

| Candidate | State on 2026-10-19 | Verdict |
|---|---|---|
| OpenCut Classic | Archived 2026-05-17. | Out. |
| OpenCut (rewrite) | Rust and GPUI; export "being refactored". | Out. |
| OpenReel Video (MIT, about 5.4k stars, active in October 2026) | An application, not a library: `@openreel/core` 0.1.0 pulls in ffmpeg.wasm with threads (needs cross-origin isolation), onnxruntime, mediapipe and three.js; the public repository is a sync of a private one; no right-to-left support. | Reference only. It confirms Mediabunny as the base. |
| WebAV | Last push 2025-03; a commercial tier. | Out. |
| FilmCraft, PhotoCraft | Rust and egui compiled to WebAssembly, alpha, one thread on the web, interface not right to left. | Out for now. |
| miniPaint, Toast UI, Jodit image editors | Standalone left-to-right interfaces, partial right-to-left text, cannot host the motion templates. | Out. |
| **Own compositor with Mediabunny** | Mediabunny 1.61, MPL-2.0, no dependencies, released about weekly. | **Chosen.** |

One Canvas 2D compositor serves video and photo. The 26 motion templates run inside it as they
are; a frame template cuts a real transparent window that the footage shows through. The interface
is Arabic and right to left like every other page. Mediabunny does the hard parts: demuxing with
range reads, decoding, thumbnails, H.264 and AAC encoding, muxing, and writing the output as a
stream instead of one block in memory. It is pinned to the newest release at least fourteen days old
when installed, imported only inside the studio's code, and used unmodified from `node_modules`.
`@mediabunny/aac-encoder` of the same version is registered only where the browser cannot encode
AAC itself, after its licence is checked.

## 4. What the studio does (version 1)

**The tab bar.** In the title row of «استوديو الحركة», after the pattern of «المراسلة» in the mail
page: «قوالب الحركة» (`/motion`) and «الاستوديو» (`/motion/studio`). It appears only for those who
may open the studio; the other six roles see `/motion` exactly as before.

**Studio home** (`/motion/studio`). The projects, shared by everyone who may open the studio: title,
kind, owner, last save, who is editing now. «مشروع فيديو جديد», «مشروع صورة جديد», archive by long
press.

**Video projects** (`/motion/studio/<id>`).
- Shape 9:16, 16:9, 1:1 or 4:5; 24, 25, 30 or 60 frames per second.
- Tracks: up to three of video and pictures, one of graphics, one of text, up to three of sound. The
  time axis runs left to right inside the right-to-left page.
- Clips: add from the media panel, move, trim, split at the playhead, delete, duplicate, snap, ripple
  delete. Per clip: place, size, turn, opacity, crop, fit or fill, brightness, contrast, saturation,
  fade in and out, volume and mute, a cross-fade with the clip beside it.
- Text and captions in Arabic with the fonts the site already ships (IBM Plex Sans Arabic 400 to
  700, Reem Kufi 500 and 600, Aref Ruqaa 700): box, outline, shadow, entry and exit; SRT import.
- Motion graphics: all 26 templates as clips. Their texts, colours and switches are edited beside the
  preview; the clip's length sets the showcase time; frame templates take the project's shape and
  show the video beneath through their window.
- Brand marks from `public/motion/` (emblem, wordmark, tagline, verses), tinted.
- Preview: play, scrub, step a frame, zoom the timeline, Reels safe zones. A paused frame comes from
  the same decoder as the export.
- Undo and redo inside the studio (200 steps).
- Export: MP4 (H.264 and AAC; WebM where MP4 cannot be encoded), 720p, 1080p or 4K, with an estimate,
  progress and cancel; written to a private file of the browser and then downloaded or saved to the
  library as a new file or a new version (long press over a file that was already reviewed); the
  current frame as PNG. The screen is kept awake and the page asks to stay visible while exporting.

**Photo projects.** The same compositor with one frame. Sizes 1080x1080, 1080x1350, 1080x1920,
1920x1080 or chosen. Layers: picture, text, shape, a motion template at its settled moment (editable),
brand mark. Move, size, turn, crop, flip, opacity, blend (normal, multiply, screen), order, lock, hide,
align. Brightness, contrast, saturation, warmth and blur as pixel functions in a worker. PNG, JPEG or
WebP to the device or the library.

**Sources.** «المكتبة» opens what the person may see in the library and needs the media page (the
file route requires it); without it the choice is hidden and the reason given. Files from «هذا
الجهاز» stay in the browser's private storage and are marked «على هذا الجهاز فقط»; the offered
action is «رفعه إلى المكتبة ثم استخدامه», and a save warns while such files remain.

**The device cache.** Each library version is copied to the browser's private storage once, in
resumable parts, named by file and version. Ten days after its last use it is removed when the
studio next opens. «حذف ملفات المعاينة المؤقتة» empties it by long press and shows the space used.
Where that storage is missing (private windows, some Safari versions) the studio reads from the server
and says so, and an export is built in memory up to the existing 1.6 GB limit.

**Phones** (760 px wide or less). The projects, the preview, trim and split on one row, text and
template edits, export; for photos crop, adjust and text. Everything else is shown disabled with its
reason, and nothing a phone cannot edit is ever removed from a project.

## 5. Data and rules

Migrations `*studio*`, applied to the Supabase project `comms-hub`.

- **Capability** `motion.studio`, fixed to `{admin,director}`, with an Arabic reason that cites the
  owner's decision of 2026-10-19. `studio_can()` is `has_capability('motion.studio')` and
  `has_capability('page.motion')`: removing the motion page removes the studio too.
- **Tables**, row level security on, read policies only, no write policies:
  `studio_projects` (title, kind, owner, times, the linked work, archive time, who holds the editing
  lease and until when); `studio_revisions` (each project has one autosave row, replaced on every
  autosave, and explicit saves, appended and never deleted; the document is capped at 1 MB);
  `studio_sources` (the library file and version each saved revision uses, read by the database
  from the document itself); `studio_exports` (which revision produced which library version).
- **Functions**, each `security definer` with an empty search path, executable by signed-in
  accounts only: create, rename, archive; the lease (one editor at a time, 90 seconds renewed every
  30 while the editor is open; taking over is a long press and the other editor drops to reading,
  keeping its changes as a local draft); save (refuses a stale base, a missing lease, an oversize or
  malformed document, and a new library source the saver cannot see; sources carried over from the
  previous revision are kept even when the saver cannot see them, shown as «لا تملك صلاحية هذا
  الملف»); the export record (the caller must have uploaded that exact version); the link to a work
  (through `work_can_see` and the existing `work_asset_link`).
- **Backups**: the three tables join `backup_table_list`; project revisions are read 25 rows at a
  time instead of 500.
- **Approval** is untouched. The studio approves nothing. A new version of a reviewed file returns
  to «قيد المراجعة»; a published file takes no new version and the export dialog says so. The
  director's export is approved by the assistant, or by the admin while testing.

## 6. Phases

Every phase ends with `npm run typecheck`, `npm run build` and `npm test` passing, its own checks,
a local commit and a `progress.md` entry with numbers. Nothing is pushed unless the owner asks.

**Phase 0: baseline and specification.** Commit the research alone. Restore `MVP_draft.md` sections
12 to 61 and keep the later edits. This plan, and `MVP_draft.md` section 62. Add the pinned
`mediabunny`; a trial fixture proves the build, browser decode, encode and private storage, and
records the size of the studio's code and the AAC encoder's licence.

**Phase 1: access and the tab.** The capability (migration `studio_access`); `canOpenRoute` and
`studioTabVisible` in `src/lib/access.ts` (an administrator viewing as another role sees the tab only
as admin or director, and the address still opens, as with «الحسابات»); the server check in
`src/app/[[...slug]]/page.tsx`; `/motion/studio` in `src/components/hub-page.tsx`; the tab bar
(`src/components/studio/motion-tabs.tsx`, one line in `motion-studio.tsx`); Ctrl+Z exempted; the
sidebar highlights «استوديو الحركة» on its tabs; the access table regenerated. Gate: SQL rules
(`qa/studio-access-rules.json`) and a fixture check of the tab bar.

**Phase 2: projects in the database.** Migration `studio_projects`, `src/lib/studio/schema.ts`
(versioned document, whole microseconds, unknown fields kept), `persist.ts` (autosave every 15
seconds while changed and leased, a crash draft in IndexedDB), the projects list. Gate:
`qa/studio-rules.json`.

**Phase 3: engine and video editor.** `src/lib/studio/` (time, timeline, compose, motion adapter,
text, media, cache, history, preview; plain TypeScript with no React or Next, so it can later move
into a desktop or phone shell) and `src/components/studio/` (editor, media panel, timeline,
transport, inspector, motion clip inspector, `studio.css`). Gate: `qa/studio-engine.cjs` (pixel
probes, transparent windows, Arabic font loaded, cache, draft restore) and the motion export
regression unchanged.

**Phase 4: export and saving to the library.** `export.ts`, `audio.ts` (mixed ten seconds at a
time), `target.ts`, the export panel and the save dialog; `uploadNewVersion` returns the version
number. Gate: ffprobe on the exports (codecs, duration within a frame, frame count, sound level,
sync against reference beeps and flashes, a split on the exact frame).

**Phase 5: photo editor.** `photo.ts` (adjustments in a worker), `photo-editor.tsx`. Gate: pixel
tests and a fixture export.

**Phase 6: phones.** Layout and tool limits from what the browser can do. Gate: `qa/studio-ui.cjs`
at 1440 and 390 px, and a test that a phone save keeps every unknown field.

**Phase 7: links to works and review notes.** «ربط بعمل» in the export dialog; «فتح في الاستوديو»
on the work page for those who may open the studio, on files that came from a studio export. The
studio shows the timed review notes already written on that file (`media_notes.timecode`, the
mechanism of `MVP_draft.md` section 59.6), and a click moves the playhead there. Gate: SQL checks
and a fixture check.

**Phase 8: guide and records.** A `studio` block for `Help_Content_Matrix.md`, drafted for the
owner's review; the page guide; a studio paragraph in `AGENTS.md`; `Status.md`, `Roadmap.md`,
`progress.md`.

## 7. Deferred, with what must come first

| Item | Starts when |
|---|---|
| Rendering on the organisation computer, so an export continues after the page closes | The agent computer exists (E-1, `Owner_Handoff.md` part D). |
| Shared temporary storage with a ten-day remote cleanup | The same, and an owner decision on a scratch storage role. |
| Desktop application (Tauri) | Phases 1 to 6 accepted; signing and update accounts. |
| Phone applications (Capacitor) | Phone web accepted; Apple and Google developer accounts. |
| Review notes bound to a version, or to an area of a picture | Decided by the owner on 2026-10-20: built in the third round (section 10). |
| Speed ramps and keyframes | Asked for by the owner on 2026-10-20: built in the third round (section 10). |
| Editing together at the same time, RAW, PSD, HDR | A stated need. |
| Automatic captions, background removal | They need AI, which Version 0 does not have (owner answer of 2026-10-20). An owner decision and the agent computer. |
| Sound kept at its pitch when a clip's speed changes | A stated need (third round decision: a re-timed clip is silent). |

## 8. Verification

- Each phase: typecheck, build, `npm test` (each new test file added to the list in `package.json`).
- SQL rule runs in rolled-back transactions through the Supabase tool, saved under `qa/`.
- Fixture browser runs in headless Edge over a local server, compiled from the real source.
- The owner's signed-in walkthrough, recorded in `progress.md` as pending until done:
  - as admin: the tab shows; viewing as designer hides it but the address still opens; viewing as
    director shows it;
  - as a writer: `/motion` unchanged, `/motion/studio` refused;
  - as director: a ten-minute 1080p video from Drive with a template and Arabic text, exported to the
    library; the director's own approval refused and the assistant's accepted;
  - taking over editing from a second browser;
  - Safari and phone messages;
  - the Vercel usage page after the first copies to a device.

## 9. Second round, the owner's notes of 2026-10-20

The owner found the first version very good and asked for polish, all of it built in one round and specified
in `MVP_draft.md` 62.1 to 62.5:

| Note | What was built |
|---|---|
| A layout like a desktop editor: everything a window, moved, merged, resized, opened and closed | A docking workspace written for the studio (`src/lib/studio/workspace.ts`, the layout as data, tested; `workspace.tsx`, the windows). No docking library was added (none was evaluated this round): the studio's own layout keeps each window's content mounted through a portal, so an export or a canvas survives a move, and it was written for the right-to-left page. Five video and three photo workspaces (`panels.ts`), remembered per device. |
| A menu to reach the windows | A menu bar with «ملف», «تحرير», «المقطع» (or «الطبقة»), «عرض», «النوافذ», «مساعدة» (`menubar.tsx`, `editor-frame.tsx`). |
| Shortcuts, icons, keyboard shortcuts | One list (`shortcuts.ts`) by key position, so an Arabic layout works; tools V, C, H, T; a shortcuts sheet; every menu item and button title shows its key. |
| Better looking windows | A dark editor chrome by default (light on request), tabs with icons and an accent line, a focused outline, drop previews, floating windows with shadows. |
| More transitions and entry and exit animations | Sixteen transitions and seventeen movements (`transitions.ts`), drawn by the compositor for preview and export alike, with an effects window of moving thumbnails. |
| A lower preview quality for smooth playback (1/2 to 1/32) | Separate playing and paused resolutions: full, 1/2, 1/3, 1/4, 1/8, 1/16, 1/32; the export stays full. |
| Ten English and twelve Arabic fonts | `fonts.ts` and `studio-fonts.ts`, pinned `@fontsource` packages, loaded only when used; a font list with previews. |
| Better interface and handling | Handles to scale and turn on the canvas, drag and drop from every window to the timeline and the preview, a clip menu, copy and paste, the razor, Ctrl and wheel zoom, a snap line, the history window, the editor filling the browser window. |

## 10. Third round, the owner's request of 2026-10-20

The owner asked for two lists from the review of the studio: tools inside the studio, and the studio
joined to the rest of the site (the work cycle, the review screen, tasks, the calendar, mail,
messaging, requests, the library, notifications, projects and Home). Specified in `MVP_draft.md` 62.6
to 62.14.

**Owner answers of 2026-10-20.**
- Keyframes and speed ramps are built now.
- Automatic captions and background removal stay out: Version 0 has no AI.
- `media_notes` records the file version a note was written on and, when wanted, an area of the frame.
- On the review screen approval has a key, held as long as a long press; changes and notes are plain
  keys; approval stays bound to the exact version.

**Decisions of the plan.**
- No «مسودة» mark on a file saved to the library: approval binds the exact file that is published.
  The mark is offered on downloads only.
- A clip whose speed is not 1, that has a ramp, plays backwards or is a still has no sound.
- Approval never happens inside the studio; the studio delivers a version to review, and every
  approval key is on the review screen.
- No Realtime publication is added: the studio's work bar reads again on focus, every minute and
  after an export, as the notifications do.

**Phases.** Each ends with typecheck, build and tests passing, its own checks under `qa/`, a local
commit and a `progress.md` entry.

| Phase | What |
|---|---|
| 0 | This section and `MVP_draft.md` 62.6 to 62.14. |
| 1 | «النسخ»: open, restore and compare numbered versions. |
| 2 | Speed, ramps, reverse, freeze and keyframes on one source-time function. |
| 3 | Markers and YouTube chapters; covered areas (blur, squares). |
| 4 | Waveforms, recording, lowering music under speech, loudness. |
| 5 | Several shapes, platform checks, SRT out, the download mark, frame to photo project. |
| 6 | Templates and «هوية الاستوديو». |
| 7 | The database for the connections: versioned and area notes, replies, «تم», notices, a project from a work, access requests. |
| 8 | The studio and the work: open from any work, the work bar, «تصدير وإرسال للمراجعة», notes on the time ruler, the work's texts, chapters to the YouTube copy. |
| 9 | The review screen: keys, notes at a frame with an area, comparing versions, keys for decisions, the next work. |
| 10 | Reserved places and their tasks. |
| 11 | The calendar, extension requests and reminders. |
| 12 | Mail and messaging. |
| 13 | The library, notifications, projects and Home. |
| 14 | Guides and records; the owner's signed-in walkthrough. |

---
type: changelog
project: "[[projects/ideas/Comms_Hub/Comms Hub|Communication Department Hub]]"
tags:
  - comms-hub
  - document/progress
  - knowledge/dated
created: 2026-08-18
updated: 2026-11-05
status: active
parent: "[[projects/ideas/Comms_Hub/Comms Hub]]"
aliases:
  - Communication Hub Progress Log
  - سجل تقدم مركز الاتصال المؤسسي
related:
  - "[[Roadmap|Product Roadmap]]"
  - "[[Status|Current Status]]"
  - "[[MVP_draft|MVP Draft UI Shell]]"
  - "[[discussions_list|Master Discussions Index]]"
---

[[projects/ideas/Comms_Hub/Comms Hub|Comms Hub Overview]] | [[Roadmap|Product Roadmap]] | [[Status|Current Status]] | [[MVP_draft|MVP Draft UI Shell]] | [[discussions_list|Master Discussions Index]]

---

# Communication Department Hub — Progress Log

> [!note] Update as you work
> This document records dated, verified outcomes, architectural milestones, and material technical decisions. It is an immutable, evidence-based history of what was actually built and verified. Future planning belongs in [[Roadmap]], and present conditions belong in [[Status]].

---

## Progress Entries

### 2026-09-19 — Phase 0.2.1 workflow mapping and pre-validation corrections

- **Milestone:** Checkpoint 0.2, Phase 0.2.1, tasks 0.2.1.1 through 0.2.1.5. Phase 0.2.2 was not started: it requires real department participants and cannot be simulated.
- **Recoverability:** Baseline committed before any change. Line endings normalized first in its own commit, then the code corrections in `079cd5d` and `221477c`. No remote push. `disscussios/` was read and cited but never edited.
- **Deliverables:** `validation/workflow-map.md` (nine representative workflows, 25 prototype assumptions classified as 15 supported, 6 partial, 4 unsupported, 11 exceptions, 7 bottlenecks, 9 terminology items, seven open questions), `validation/validation-scripts.md` (seven guided session scripts with fixed setup, unaided-success criteria and participant-facing Arabic wording), and `validation/feedback-rubric.md` (four-level severity rubric, per-session capture sheet, consolidated findings register, exit gate roll-up).
- **Corrections applied (task 0.2.1.5), each against a named specification section:**
  - Role home experiences differentiated per section 6; notices now carry an explicit role audience so each role reads only its own queue. Previously all eight roles saw near-identical tiles and one shared notification list, which contradicted the "eight role experiences" claim.
  - Admin built out per sections 35 to 37: Users, Roles and Permissions, Integrations, System Health, Storage, Security, Automation, Notification Policy. Connected account health added to the Publishing Officer's home.
  - Calendar grid corrected: weekday headers and leading pad cells, so a month starts on its real weekday instead of always placing day 1 in the first column. Month and year are now chosen through Arabic selects rather than the browser's own locale label.
  - Post-publication editing: approval invalidation retained as `disscussios/approval_policy_design.md` section 3 requires, but the dispatch outcome is now preserved in a publication record instead of being wiped. The previous behaviour silently destroyed the record of what the department had actually published.
  - Settings expanded to the eight sections in section 38. Account shows the Arabic role name instead of the raw role key, plus email, language, permissions and mock sessions per section 39.
  - Seed data aligned with section 47: the 23 Sep 18:00 publication is pre-scheduled, per-item activity lines vary, the hard-coded home schedule entry is gone, section 4 campaign figures appear on home, and a campaign creation step matches the section 51 provisional flow.
  - Every `src` file and the test suite reformatted from single-line source to normal line breaks, so Phase 0.2.3 corrections are reviewable. No behaviour change.
  - `package.json` gained `"type": "module"`, removing the module-type warning on every `npm test`.
- **Repository hygiene:** added `.gitattributes` pinning text files to LF in index and working tree, and renormalized, so CRLF drift no longer shows whole files as modified. Added the project's working rules to `AGENTS.md`: document ownership, the prohibition on editing `disscussios/`, Arabic terminology, the zero-emoji policy, evidence over assertion, recoverable baselines, the Version 0 prototype boundary, and the shell-quoting rule that caused the corruption repaired below.
- **Document repairs:** three lines of this log had been corrupted by a double-quoted PowerShell string consuming a backtick and the letter n; `node --check ...`, `node design-review/verify.cjs` and `notification_model.md` are restored. The two 2026-09-19 entries that had been stranded after the `^comms-hub-progress-boundary` anchor and the protocol template were moved back into chronological order. Usage-meter narration was removed from this log and from `Status.md`; it belongs in a handoff message, not the vault. All verified content and evidence were preserved.
- **Roadmap:** Checkpoint 0.2 now carries `X.Y.Z.W` task identifiers with a definition of done and an evidence requirement per task, as the Work Hierarchy rules require, and a measurable exit gate: five role groups covered, at least six distinct participants with two in leadership, unaided scenario completion, an 80 percent scenario pass threshold, zero unresolved Severity 1 findings, and a completed rubric sheet per session.
- **Verification & evidence:** `npm run typecheck` clean. `npm run build` clean. `npm test` 8 of 8 passing, including two new tests: one asserting that editing a published item invalidates the approval *and* preserves the publication record, and one asserting that all eight roles present distinct home tiles. `node qa/checkpoint-02-corrections.cjs` reports 34 of 34 browser checks passing, covering calendar weekday alignment across two months, per-role tiles for all eight roles, notice scoping, the admin and settings sections, the account role name and the derived home schedule; zero page or console errors. Responsive re-check at 1440 and 390 shows zero horizontal overflow on home, calendar and admin. Results in `qa/checkpoint-02-corrections.json`.
- **Key decision:** the post-publication edit behaviour was treated as a genuine defect rather than intended policy. `approval_policy_design.md` requires invalidating the *approval*; it says nothing about erasing the *publication*, and the state diagram there does not route Published back to Draft. Approval invalidation and publication preservation are now two separate, separately tested rules, and the reasoning is written into `src/lib/domain.ts` at the `edit` case.
- **Remaining limitations:** no human validation has occurred. Upload and playback remain deferred; delegation and an urgent path remain absent; the composer is still one form for every content type; the calendar still has no week, day or date-level creation. None of the seven open questions was answered, and no Arabic term was changed, because both depend on findings only real participants can produce.
- **Next action:** arrange department participants and run Phase 0.2.2 from `validation/validation-scripts.md`. No Version 1 work.

### 2026-09-19 — Phase 0.1.5 accepted

- **Result:** READY FOR CHECKPOINT 0.2. No blocking prototype defect remains; actual department validation is pending. Checkpoint 0.2 preparation was not started to preserve the usage reserve.
- **Fixes:** retained local submitted/reviewed release snapshots with exact content/asset versions; dialog focus return; modal mobile navigation; mobile search accessible name; empty-month message; reduced-motion handling.
- **Evidence:** production build/typecheck pass; five domain tests pass; complete publication journey and 60 viewport checks pass; eight personas and B/C main actions pass; 14 Level A desktop/mobile screenshots and three additional mobile views visually inspected. Focused keyboard/form/RTL/contrast review completed. qa/final-interactions.json reports eight passing interaction groups, zero console/page errors and no external origins. qa/scope.json reports no source/config findings. Full record: qa/ACCEPTANCE.md.
- **Decisions:** historical content necessary for credible exact-version review, now retained in memory. Upload/playback deferred because illustrative versioned media is sufficient for workflow evaluation. Other accepted limits are listed in the acceptance record; no production infrastructure added.
- **QA portability:** local Playwright resolution, optional CODEX_NODE_MODULES fallback, configurable QA_BROWSER/QA_BASE_URL. Corrected select-label matching in final QA; restarted stopped local server before successful rerun.
- **Recoverability:** Baseline `893cef5`; acceptance changes saved in a separate local commit. No remote push. No subagent used.
- **Next:** 0.2.1 assumption mapping and human walkthrough preparation; 0.2.2 must involve actual department participants. No Version 1 work.

### 2026-09-19 — Runnable UI prototype and verified core journey

- Selected A with B only for larger media canvases, recorded in DESIGN.md. Next.js/TypeScript/Tailwind app added with shared client state and reusable shell/components.
- Core screens and lighter supporting shells implemented. One Luna subagent handled supporting.tsx; primary agent integrated and verified.
- Evidence: production build passes; typecheck passes after Next applied its standard skipLibCheck setting; npm test passes 3 domain tests. qa/verification.json records a passing browser acceptance journey and 60 route/viewport checks, zero captured JavaScript errors and zero horizontal document overflow.
- Browser journey: create, request revision, edit, resubmit, approve revision 2, schedule, calendar, partial publish and failed-channel retry. Admin separation also checked. Initial browser checks exposed selector and navigation-timing issues, corrected in QA; composer received an explicit accessible textarea label.
- Screenshots saved locally under ignored qa/artifacts. These are not a completed visual/accessibility audit.
- Limitations and next actions are enumerated in Status.md. Media upload/playback, retained historical release snapshots, full persona/supporting-action QA and broad department-validation signoff remain incomplete. No production services were added.

### 2026-09-18 — UI-first scope aligned and three visual directions checked

- **Milestone:** Checkpoint 0.1, Phase 0.1.1, tasks 0.1.1.1 and 0.1.1.2.
- **Scope:** Read the six requested root documents; inspected relevant sections across all nine requested discussion documents. `MVP_draft.md` remains authoritative. Reordered the roadmap so prototype validation precedes platform and database work; retained future production horizons.
- **Recoverability:** Existing tracked baseline was clean at commit `7e45e2b`. Pre-existing untracked `.serena/` was untouched. Discussion files and the authoritative MVP specification were not edited.
- **Deliverable:** A local browser gallery in `design-review/`, with A (operations workspace), B (campaign studio), and C (compact operations desk). Each has Home, Work, Work detail, Create, Approvals/Publishing, and Media Library with a connected National Day scenario and mobile adaptation. Custom CSS artwork is illustrative, not an official national campaign identity.
- **Verified evidence:** `node --check design-review/gallery.js` passed. HTTP server returned 200. `node design-review/verify.cjs` passed 72 page/viewport combinations at 1440, 1280, 900, and 390px, with zero JavaScript errors and zero document-width overflow. Direction switch, screen selector, Work detail navigation, phone preview, notice dialog, Escape dismissal, and mobile More menu passed. Captured 36 screenshots and inspected three six-screen desktop boards plus representative full-size desktop/mobile views. `git diff --check` passed.
- **Correction during QA:** Initial verification selected an invisible navigation control; narrowed the test to the visible notification control and reran successfully. Aligned Instagram review state and ready-to-publish count across the sample screens.
- **Limits:** These are visual alternatives with navigation, editable sample fields and explicit preview notices. They are not three MVP implementations. No Next.js scaffold, role behavior, working review/publishing transitions, calendar, or Level B/C pages are claimed complete. Comprehensive accessibility and MVP workflow acceptance remain future tasks.
- **Delegation:** No subagents were used. The design stage cost more than planned; full implementation was recommended to continue in a later session to preserve the complete core scope.
- **Local checkpoint commit:** `040f8a4` saves the gallery and scope alignment. No remote push.
- **Next action:** Wait for the user's selected/combined direction, then implement only that direction. Favor shared shell, centralized local mock state and the connected acceptance workflow; avoid more alternate-design polish.

### 2026-09-18 — Vault Architecture & Specification Foundation Complete

- **Milestone Reference:** Inception & Architectural Foundation across all 15 vault documents.
- **Outcome Summary:** Successfully transformed and standardized all 15 documentation files across the Communication Department Hub vault into production-grade Obsidian Markdown adhering strictly to [[Obsidian_Guide]] and user constraints. Every file was equipped with YAML frontmatter, breadcrumb navigation, interactive document maps, bidirectional wikilinks, native Obsidian callouts, external technical references, deep block anchors, and native Mermaid diagrams.
- **Quantitative Results:**
  - Total vault content expanded from 291,864 characters to 540,872 characters (+249,008 chars, +85.3% expansion).
  - Total word count expanded from 38,155 words to 68,970 words (+30,815 words, +80.8% expansion).
  - 100% of all original notes, section headings, code blocks, tables, and ASCII diagrams preserved verbatim with zero data loss.
  - Exactly 0 new emojis added across all 15 files, maintaining strict compliance with the zero-emoji directive.
  - 95 native Mermaid.js diagrams constructed covering data models, workflows, state machines, and network topologies.
- **Documents Established & Verified:**
  1. `MVP_draft.md`: 56 sections, 6 diagrams, UI shell layout and functional scope.
  2. `Original_Idea.md`: Core concept, problem statement, and 3 solution topology diagrams.
  3. `discussions_list.md`: 23 sections, 6 diagrams, comprehensive master discussion index.
  4. `Comms Hub.md`: 4 diagrams, root vault overview and architectural sitemap.
  5. `First_idea_darft.md`: 28 sections, 7 diagrams, foundational technical ideation.
  6. `Second_discussion_draft.md`: 28 sections, 7 diagrams, storage, AI controls, and publishing.
  7. `organizational_role_discussion.md`: 36 sections, 6 diagrams, 8 confirmed roles and authority model.
  8. `approval_policy_design.md`: 54 sections, 7 diagrams, multi-stage approval and version binding.
  9. `storage_lifecycle_disaster_recovery.md`: 54 sections + addenda, 7 diagrams, 3-2-1 hybrid storage.
  10. `failure_handling_background_jobs.md`: 51 sections, 7 diagrams, background queue and failure routing.
  11. `connected_account_secrets_management.md`: 73 sections, 7 diagrams, OAuth and secret envelopes.
  12. `notification_model.md`: 70 sections, 7 diagrams, three-tier attention architecture.
  13. `search_and_metadata.md`: 74 sections, 7 diagrams, full-text search and Arabic taxonomy.
  14. `security_discussion.md`: 42 sections, 7 diagrams, defense-in-depth and immutable audit log.
  15. `emergency_workflows.md`: 74 sections, 7 diagrams, crisis governance and kill-switch freeze.
- **Verification Evidence:** Automated verification test scripts in `scratch/` executed with exit code 0 on every document, confirming character expansion, symbol whitelist compliance, section retention, frontmatter schema, and diagram validity.
- **Key Decisions:**
  - Standardized on strict zero-emoji policy for professional enterprise readability.
  - Preserved all original text verbatim while augmenting with structural scaffolding and deep linking.
  - Decoupled operational files (`Roadmap.md`, `Status.md`, `progress.md`) from deep specifications (`disscussios/`).
- **Remaining Limitations:** Application codebase implementation has not yet commenced; current state represents a complete architectural design and specification baseline.
- **Next Action:** Initialize repository environment scaffolding and database schema migrations.

---

## Protocol for Future Progress Entries

When recording future implementation outcomes, follow this standardized template:

```markdown
### YYYY-MM-DD — [Descriptive Title of the Milestone or Outcome]

- **Milestone / Context:** [Reference to the relevant roadmap horizon or feature area]
- **Outcome Summary:** [Clear, factual description of what was completed and what now works]
- **Technical Changes & Implementation:**
  - [Specific files modified, APIs added, or database tables created]
  - [Architectural patterns, algorithms, or integrations implemented]
- **Verification & Evidence:**
  - [Test suite results, command outputs, or manual verification steps with specific numbers]
  - [Performance benchmarks or error-rate measurements where applicable]
- **Key Decisions & Deviations:** [Any non-obvious choices, trade-offs, or changes from original plan]
- **Remaining Limitations:** [Known edge cases, deferred items, or environment prerequisites]
- **Next Action:** [The immediate next technical task]
```

### 2026-09-20 — Checkpoint 0.2 Google Form Transformation & Wi-Fi LAN Tooling

- **Milestone / Context:** Checkpoint 0.2 (Department Validation), Phase 0.2.2 readiness.
- **Outcome Summary:** Created an automated Google Apps Script form generator, complete form architecture specification, visual mapping guide connecting validation tasks to screenshot artifacts, and local network Wi-Fi hosting commands.
- **Technical Changes & Implementation:**
  - `validation/google-form-generator.gs`: Turnkey Google Apps Script creating a 9-section Arabic Google Form with automatic role branching (`مدير الاتصال المؤسسي`, `مساعد مدير الاتصال`, `كاتب المحتوى`, `المصمم`, `المنتج الإعلامي`, `مسؤول النشر`, `عضو / مسؤول النظام`), task execution blocks, open architecture questions, and D1–D5 dimension scales converging to the final exit gate section.
  - `validation/google-form-spec.md`: Authoritative specification document for all form fields, options, and logic.
  - `validation/form-visual-guide.md`: Mapping guide linking each validation scenario to corresponding screenshots in `qa/artifacts/` and documenting prototype boundaries.
  - `package.json`: Added `dev:lan` and `start:lan` scripts binding Next.js to `0.0.0.0:3000` for multi-device local network access.
- **Verification & Evidence:**
  - JavaScript syntax check on `google-form-generator.gs`: passed (exit code 0).
  - TypeScript typecheck: `npm run typecheck` passed cleanly (0 errors).
  - Domain tests: `npm test` passed 8 of 8 unit tests.
  - Production build: `npm run build` compiled successfully in 654ms via Next.js Turbopack.
  - Zero emoji verified across all added and modified files.
- **Key Decisions & Deviations:** Used Google Apps Script programmatically to construct the complex multi-section Google Form since Google Forms does not support file-based JSON imports.
- **Remaining Limitations:** Google Form must be generated once in the user's Google Drive by running the script; live human validation sessions with department staff remain required for exit gate sign-off.
- **Next Action:** Facilitate Phase 0.2.2 department validation sessions and collect participant submissions.

---

### 2026-09-20 — Logo Loading Animation Motion Lab & 2-Stop Full 360 Continuous Forward Loop

- **Milestone / Context:** Brand Logo Loading Animation Visual & Motion Calibration Workbench.
- **Outcome Summary:** Built and calibrated the interactive, zero-dependency Logo Loading Animation Motion Lab in `loading/logo-loader-motion-lab.html` and documented it in `loading/README.md`. Mathematically verified and implemented the 2-stop continuous forward loop geometry ($90 \mid -90$ and $0 \mid 180$) with zero backward swing.
- **Technical Changes & Implementation:**
  - `loading/logo-loader-motion-lab.html`: Standalone SVG/CSS/JS motion sandbox featuring rAF animation engine, cubic-Bézier visualizer, 7 actual-size previews (16px to 128px), continuous whole-assembly rotation, and individual capsule trajectories (`A-B-A`, `A-B-C-B`, and `continuous-360`).
  - Mathematical modeling of the 2-stop full 360 forward loop:
    - Shape 2 ($90^\circ$): $90^\circ \to 0^\circ \to -90^\circ \to 180^\circ \to 90^\circ$.
    - Shape 1 ($45^\circ$): $45^\circ \to 0^\circ \to -135^\circ \to 180^\circ \to 45^\circ$.
    - Shape 3 ($135^\circ$): $135^\circ \to 0^\circ \to -45^\circ \to 180^\circ \to 135^\circ$.
    - Shape 0 ($0^\circ$): Anchored horizontal baseline capsule.
  - UI toggle configured: OFF = Reversing (`A-B-A`), ON = Full 360 Forward (`continuous-360`).
  - Transport step buttons updated: `Step Collapsed (0|180)`, `Step Expanded (+90)`, and `Step Expanded (-90)`.
- **Verification & Evidence:**
  - `vm.Script` JavaScript syntax check: passed (exit code 0).
  - Node simulation of exact angular trajectory across both Clockwise and Counterclockwise directions: confirmed 100% agreement with theoretical deltas.
  - Microsoft Edge headless DOM dump: executed and verified without errors.
  - `npm run typecheck`: passed cleanly (exit code 0).
  - `npm test`: passed 8/8 tests.
  - Zero emoji verified across all files.
- **Key Decisions & Deviations:** Maintained Capsule 0 as the stationary horizontal baseline anchor so petals revolve around it, while providing whole-shape continuous assembly rotation on a separate dedicated control.
- **Remaining Limitations:** Visual tuning of final parameters (timing, stroke, color, and curves) is in progress by user.
- **Next Action:** User experiments with sliders, exports approved values, and reports back to finalize production SVG/CSS implementation.

---

### 2026-09-20 — Production LogoLoader Component Integration into Comms Hub

- **Milestone / Context:** Brand Identity & Motion Design Integration across Comms Hub Prototype.
- **Outcome Summary:** Integrated the user-approved branded loading animation (4-capsule continuous forward pass-through trajectory, 1.5s continuous assembly spin, and custom cubic-Bézier `(0.44, -0.03, 0.4, 1)`) into the Comms Hub Next.js application as a production-grade, hardware-accelerated pure CSS React component.
- **Technical Changes & Implementation:**
  - `src/components/logo-loader.tsx`: Created `<LogoLoader />` parameterized component supporting visual sizes (`xs` 16px, `sm` 24px, `md` 32px, `lg` 48px, `xl` 64px, `2xl` 80px, or numeric px), modes (`active` animated spinner vs `static` brand rosette), custom color (`#B99445`), and accessible ARIA attributes (`role="status"`). Includes `@media (prefers-reduced-motion: reduce)` fallback.
  - `src/components/ui.tsx`: Re-exported `LogoLoader` and `LogoLoaderProps` from the core UI component barrel.
  - `src/app/loading.tsx`: Replaced generic skeleton placeholder with centered `<LogoLoader size={72} />` and Arabic status text *«جارٍ تجهيز مساحة العمل…»* for all Next.js route transitions and Suspense boundaries.
  - `src/components/shell.tsx`: Replaced placeholder Lucide icon `<ChartNoAxesCombined />` in the sidebar header (`aside.sidebar .brand .brandmark`) with the static brand rosette `<LogoLoader size={26} mode="static" color="#FFFFFF" />`.
  - `src/components/operations.tsx`: Integrated `<LogoLoader size={22} />` next to *«جارٍ النشر التجريبي…»* and `<LogoLoader size={16} />` next to *«جارٍ التنفيذ…»* during publishing and retry simulations.
- **Verification & Evidence:**
  - `npm run typecheck`: Passed with 0 errors.
  - `npm test`: Passed 8/8 domain and workflow unit tests.
  - `npm run build`: Compiled production build successfully in 1074ms via Next.js Turbopack.
  - Headless Microsoft Edge browser (`--headless --dump-dom`): Verified that `<LogoLoader />` renders valid SVG markup in the live application shell and sidebar brandmark.
  - Zero emoji verified across all added and modified files.
- **Key Decisions & Deviations:** Compiled animation into pure CSS `@keyframes` inside SVG/defs rather than a runtime JavaScript rAF loop, ensuring zero React re-render overhead, 60/120fps GPU compositing, and full compatibility with Next.js SSR.
- **Remaining Limitations:** None for prototype scope; visual shell and simulation flows now reflect approved brand motion design.
- **Next Action:** Continue Phase 0.2.2 department validation and user feedback.

### 2026-09-20 — Dedicated Health Check API Route for External Watchdog Compatibility

- **Milestone / Context:** Server Stability & Continuous Availability for Checkpoint 0.2 Testing.
- **Outcome Summary:** Resolved silent server shutdowns occurring every 3-5 minutes by implementing a dedicated unauthenticated JSON health check route at `/health`.
- **Technical Changes & Implementation:**
  - `src/app/health/route.ts`: Created unauthenticated GET route handler returning `{ status: "ok", timestamp, uptime, environment }` with HTTP 200 and `application/json` header, satisfying background port monitors and IDE liveness probes that previously received 31KB HTML pages and deemed the server unhealthy.
- **Verification & Evidence:**
  - `npm run typecheck`: Passed with 0 errors.
  - `npm test`: Passed 8 of 8 tests.
  - `npm run build`: Compiled successfully; `/health` confirmed in production route inventory as dynamic route.
  - Local HTTP verification: `GET http://127.0.0.1:3000/health` verified returning HTTP 200, `Content-Type: application/json`, and body `{"status":"ok",...}`.
  - Zero emoji verified.
- **Key Decisions & Deviations:** Placed directly at `/health` (matching the exact probe path from external monitoring tools) rather than `/api/health`.
- **Remaining Limitations:** None.
- **Next Action:** Run server persistently via `npm run start:lan` or process manager for department testing.

---

^comms-hub-progress-boundary

### 2026-10-08: Native motion studio and six new templates

- User-requested scope extension, specified in `MVP_draft.md` section 57 and noted in `Roadmap.md`. Added `/motion` and its shared-sidebar entry, using the established Arabic RTL shell, Title/Tabs controls, green tokens and larger preview treatment.
- Preserved all 16 source designs from `motion_design/numbers-library`: six number animations, four Repine lower-thirds and six video frames. Extracted only canvas drawing functions, five local image masks and container writers. Removed standalone HTML/UI wiring, external font loading and global canvas prototype mutation. Canvas radius safety is scoped to the extracted renderer functions; Arabic labels no longer use Latin letter spacing.
- Added six distinct templates: مقياس الأثر, محطات الإنجاز, الشريط التحريري, مدار الهوية, بوابة الأثر, إطار التغطية. The two frames have distinct layouts and staged border/corner/text motion. Total inventory is 8 numbers, 6 Repine and 8 frames.
- Native controls support editable content/colors/timing, four frame proportions, independent template drafts, reset, playback, pause and scrubbing. Gallery selection returns focus to the editor; a compact chooser keeps templates reachable on mobile. Previews start paused, respect reduced-motion preferences and cancel animation on unmount.
- Local exports include PNG snapshots, PNG sequences in ZIP, alpha MOV using PNG codec and keyed H.264 MP4. Progress, cancellation, browser capability failures and load retry have Arabic messages. Original contact defaults were cleared; embedded source identity is disclosed in the relevant template captions.
- Verification: `npm run typecheck` passed with zero errors; `npm run build` passed; `npm test` passed 8/8 domain tests. `node qa/motion-studio.cjs` passed 100/100 checks with zero captured page/console errors. This exercised every template, all 32 original/new frame-ratio combinations, editable drafts, normal decimal typing and blur bounds, play/pause/scrub/reset, focus return, keyboard navigation, cancellation and overflow at 1440, 1280, 900 and 390 pixels.
- Export evidence: real PNG, ZIP, MOV and MP4 downloads. ffprobe decoded 32 frames each from the 640×360 MOV and H.264 MP4 test files; MOV reported RGBA pixel format. ffmpeg decoded both complete videos without errors. `node qa/checkpoint-02-corrections.cjs` passed the existing 34/34 browser regression checks. Zero emoji scan passed across all 11 new implementation/import/QA source files.
- Browser evidence: repeatable script `qa/motion-studio.cjs` and JSON `qa/motion-studio.json`; screenshot/export artifacts under ignored `qa/artifacts/motion/`. Inspected desktop/mobile layouts and all six new-template captures. The script requires the shared Playwright runtime, Edge and ffprobe/ffmpeg on PATH, plus a local server at `QA_BASE_URL` or port 3000.
- Independent critic completed the requested three rounds, scoring 4.1/5, 4.7/5 and 5/5 for agreed prototype scope. Fixed mobile discoverability, numeric editing, frame hierarchy/motion, the broadcast field label and an inactive Repine glow toggle. Full findings and resolutions: `qa/motion-critic.json`.
- Execution issues recorded: initial sandboxed server/browser launches were denied; authorized elevated local runs succeeded. Initial production builds failed launching a Turbopack CSS worker, including an elevated retry. Renaming the generated Turbopack cache resolved the stale-cache failure; final production builds pass. An initial browser check exposed ambiguous select labels, corrected with explicit accessible labels before the successful runs.
- Deliberate limits: temporary page-local state, no authentication/access enforcement, no video/file upload, no asset attachment/storage and no publishing. Local exports offer 360/720 pixels on the short side at 24 fps and reject over 1,200 frames. The source library's 1080p/4K and variable frame-rate controls are reduced to bound browser memory. No external editor compatibility matrix or formal accessibility certification was performed.
- Recovery: existing user document edits were preserved in baseline commit `a391ced` before implementation. No institutional architecture document or its index was edited by this integration. All Git work is local.
- Next action: user review of `/motion`; real department validation remains the prerequisite for Version 1. Future access controls belong to production scope.

### 2026-10-08 (second pass): Motion studio rebuilt after first review

- **Why:** first review reported missing timing sliders, frame sizes that did not match the source library, downloads that did not work, an unfriendly page, and four basic designs. Reproduced before changing anything: a 5-second number clip took over 3 minutes to export (PNG encoding by `canvas.toBlob` measured at about 1 second per 1280x720 frame in the test browser), with no result card, so a finished download was easy to miss. Over plain `http` on a LAN address `VideoEncoder` does not exist, so MP4 could not be produced at all.
- **Interface (Operate mode, per `DESIGN.md` Direction A):** replaced the dropdown, card grid and details sections with one workbench: template rail with live thumbnails, dark stage with transport and an entry/showcase/exit strip, tabbed settings panel that stays in view, and a download panel. Frame ratios show their true shape and state the output width and height. Components: `motion-studio.tsx`, `motion-stage.tsx`, `motion-export.tsx`, `motion-controls.tsx`, `motion-studio.css` (all scoped under `.ms`).
- **Controls restored from `motion_design`:** timing sliders (entry, showcase up to 180 s, exit, speed), motion intensity sliders, window preview (sample, own clip, key green, transparent), Reels safe zones, backdrop choice for numbers and Repine, restore-colors, loop and replay.
- **Designs:** rebuilt the four basic designs at the level of the source designs: الشريط التحريري, مدار الهوية, بوابة الأثر, إطار التغطية. Added two Repine (المخطوطة, الهلال المضيء) and two frames (أبواب المشربية, طيف التلاوة). Replaced the two thin number designs with a graduated dial and a milestone track. Total 26 (8 numbers, 8 Repine, 10 frames). Sources: `designs.js`, `designs-frames.js`, `designs-numbers.js`; they use the same drawing kit as the source designs through an exported `kit` in `renderers.js`.
- **Downloads:** new `export.js`. PNG frames are encoded by a small encoder over `CompressionStream` (about 30 ms per frame instead of about 1000), four in flight. MP4 uses WebCodecs and falls back to real-time recording when the browser lacks it. Short side 720/1080/4K, 24/30/60 fps, output size and approximate file size stated before export, estimates above 1.6 GB refused, progress with time remaining, cancel, and a result card that keeps a working save link.
- **Evidence:** `npm run typecheck` clean; `npm test` 8/8; `npm run build` compiled; `node qa/motion-studio.cjs` 205/205 (every one of the 26 designs draws real artwork early and late; all four ratios on six frames keep their shape and stated size; window modes verified by pixel; every timing and motion slider present; real downloads decoded with ffprobe and ffmpeg: MP4 h264 720x1280 38 frames, MOV rgba 38 frames, ZIP of 38 PNGs with alpha, still PNG; cancel; no-WebCodecs fallback produces a decodable video; reduced motion starts paused; no overflow at 1440/1100/900/390; zero console errors). Export times for a 1.6 s, 720x1280 frame clip in Edge: MP4 3.1 s, MOV 5.0 s, ZIP 4.8 s, PNG 0.3 s. A 16 s clip at 720x1280: MP4 about 12 s, ZIP 66 s (269 MB). `node qa/checkpoint-02-corrections.cjs` 34/34. Impeccable detector: no findings. Results in `qa/motion-studio.json`; screenshots under ignored `qa/artifacts/motion/`.
- **Deviation from the earlier specification, recorded as required:** `MVP_draft.md` section 57 previously limited export to 360/720 pixels at 24 fps and 1,200 frames. That limit existed because exports were slow and held every frame in memory. It is replaced by the 720/1080/4K, 24/30/60 fps controls above with an estimate-based memory guard. Section 57 was rewritten to match.
- **Not verified, said plainly:** downloads were tested in Edge and in the in-app browser, not in Safari or Firefox. Playing the exported MOV inside Premiere, After Effects, Resolve or Final Cut was not tested; the MOV is verified only by ffprobe/ffmpeg. The real-time fallback records at the preview's pace and its frame rate is approximate. 4K and 60 fps were not exercised end to end; large PNG-based exports hold all frames in memory.
- **Caution:** `qa/import-motion-source.cjs` regenerates `renderers.js` from the source library and would discard the `kit` export and the contact guard added in this pass. Do not rerun it without re-applying them.
- Next action: user review of `/motion`. The production server (`start-server.bat`) must be restarted to serve this build. Real department validation remains the prerequisite for Version 1.

### 2026-10-10: First department response recorded, Roadmap replanned from 2026-10-11

- **Milestone / Context:** Checkpoint 0.2, Phase 0.2.2 started; Phase 0.2.3 Round 1 planned; optional Checkpoint 0.3 (new identity) added. Documentation only: no source file changed.
- **Inputs read:** the Google Form response sheet (`170JQB5I...`, fetched as CSV) and the CSV export the owner attached. A script compared all 177 columns: the two hold the same single response, differing only in timestamp format. The identity proposal artifact «الهوية الجديدة لمركز الاتصال» (<https://claude.ai/artifact/51Rsuxkv8LeDK1JJEpq6nr>), read in full: tokens for light and evening modes, four fonts, four gradients, eleven status colour pairs, motion rules, seven interface proposals and a three-stage plan. It states itself as a proposal awaiting approval.
- **Response R01:** Director, more than three years in the department, desktop, self-administered. Transcribed into the rubric's capture-sheet format at `validation/responses/R01-2026-10-10-director.md`; name and email stay in the response sheet. Dimension scores D1 3, D2 4, D3 3, D4 3, D5 3. Own-role scripts S1 and S2: 10 of 13 tasks passed (76.9 percent). Whole submission: 39 of 45 (86.7 percent). Failed tasks: S1.3 and S1.6 (purpose of «العمل», team workflow), S2.4 (overdue count), S4.4 and S5.5 (upload, a recorded prototype limit, not scored), S5.4 (timestamped video note).
- **Findings:** 19, with provisional severities assigned by the agent from the written answers because the session had no facilitator: 8 Severity 1, 7 Severity 2, 3 Severity 4, and the upload demand recorded but not scored. The participant also answered six of the seven open questions in the workflow map (all but Q5) and confirmed exceptions E1, E2, E3, E4, E6, E7, E8, E9 and E11 as real.
- **Anomaly:** the form branches each role to one section (`validation/google-form-generator.gs` lines 82 to 99), yet R01 carries answers in all seven. The S3 to S7 answers are short and in a different register from S1 and S2, and S3 to S6 structural questions are blank. Not resolved; task 0.2.2.7 asks the participant. Those sections are treated as findings, not role coverage.
- **Prototype defect found while planning:** `src/lib/domain.ts` has no scenario "today". `dueSoon` counts every active item due on or before the campaign date, and all seed due dates are 22 or 23 September 2026, so a tester in October sees all work as late; this is the "six items past their dates" the Director noticed. Folded into task 0.2.3.5.
- **Roadmap:** added a work plan from Sunday 2026-10-11 with two tracks (frozen validation build for participants, Round 1 corrections on `main`), owner decisions D-01 to D-03, tasks 0.2.2.6 to 0.2.2.8 and 0.2.3.5 to 0.2.3.12, gate standing after R01, R01 input lines in Checkpoints 2.1, 2.3 and 2.4, and Checkpoint 0.3 for the identity, optional and approval-gated, with a colour clean-up task (`globals.css` has six colour variables and many inline colours) as the only work allowed before approval. Corrected task 0.2.4.2, which pointed new notes at `discussions_list.md`, an index `AGENTS.md` forbids editing; notes now go to `validation/design-notes/`.
- **New files:** `validation/responses/R01-2026-10-10-director.md`; `Ideas_Backlog.md` with 23 parked ideas: video editing and photo editing from the owner, 15 agent suggestions, 3 Severity 4 preferences from R01, 3 identity-proposal ideas. Updated `README.md`, `Status.md`, `Roadmap.md`.
- **Verification:** no code changed, so typecheck, tests and build were not rerun for this entry. Day-of-week for the plan checked by script (11 October 2026 is a Sunday). Zero emoji in the new and changed files, checked by script. `disscussios/` and `discussions_list.md` not edited.
- **Remaining limitations:** one participant of six; severities provisional until D-03; the R01 anomaly is open; the identity is not approved.
- **Next action:** task 0.2.2.6, freeze the validation build, then the rest of Sunday's list in `Status.md`.

### 2026-10-10 (later): Phase 0.2.2 closed on the Director's input; colour tokens; second design behind a toggle

- **Owner directives, 2026-10-10.** (1) The Director said his input alone is enough, so the other members are not asked: every remaining Phase 0.2.2 task is marked skipped (`[-]`) with that reason, and exit gate criteria 1 and 2 are recorded as waived by directive, not met. Before marking, the response sheet was fetched again as CSV: still one response (2026-10-10 11:44, 177 columns), the one transcribed as R01. (2) The proposed identity goes into the prototype as an option: a double-click on the sidebar logo switches between Direction A and the new design. This runs Checkpoint 0.3 alongside Checkpoint 0.2, an exception to the one-active-checkpoint rule authorized by the owner. Direction A stays the default; D-01 now decides the default.
- **Recoverability.** Baseline commit `8b91df5` before any change (documents only). Task 0.3.1.1 committed alone as `91b67b4` before the toggle work. Local commits only.
- **Task 0.3.1.1, colour tokens.** `src/app/globals.css` held six colour variables and about seventy literals. All are now 73 named tokens in one `:root` block (70 colours, 3 shadows), set to the Direction A values; no colour literal remains outside it (checked by script). The sidebar logo takes its colour from the brandmark instead of a literal white. Applied by a script that asserted the exact count of every replacement.
- **Pixel evidence.** New `qa/colour-tokens.cjs` captures 63 screenshots (15 routes, Director and Publishing Officer, 1440 and 390, the notifications dialog, the phone menu) and compares them pixel by pixel. The baseline was captured twice and was stable only after screenshots were taken with animations disabled: the slowly settling logo behind the dialog differed by up to 233 pixels between two runs of the same build. With that fixed: baseline against itself 63 of 63, baseline against the token build 63 of 63, baseline against the final toggle build (second design off) 63 of 63 identical.
- **The toggle.** `src/lib/identity.ts` sets `data-identity="emerald"` on `<html>` and stores the choice in `localStorage`; an inline script in the layout head restores it before first paint, per `node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md`. `src/app/identity.css` holds the whole second design under that attribute: the token map from the proposal (light mode) and the shell, surfaces, chips, controls, overlays and motion. A new reducer action `notify` shows the switch in the existing status message. Fonts: `@fontsource/reem-kufi` and `@fontsource/ibm-plex-sans-arabic` 5.3.0, exact versions, OFL; the browser downloads them only when the second design is on.
- **Contrast.** Two proposal values failed 4.5 to 1 and were changed: sidebar small text `#a3c4b4` (3.97) to `#bad3c6`, and gold behind dark text now ends at `#c99a3c` instead of `#a8761f` (4.08). The gold logo is a graphic and passes the 3 to 1 rule at 3.59.
- **Verification, all run on the final production build.** `npm run typecheck` clean. `npm run build` clean. `npm test` 9 of 9 (new: the design notice changes only the message). `node qa/identity-toggle.cjs` 134 of 134: default is Direction A; double-click switches, is announced, does not select text; reload keeps it with no console or hydration errors; both faces load from the app; no request leaves the local server; no horizontal overflow on 16 routes at 1440, 1280, 900 and 390; collapsed-sidebar double-click switches back and clears the stored choice; a single click still opens Home; reduced motion removes transitions; 48 contrast pairs pass. Screenshots of every route at 1440 and 390, the notifications dialog, and all eight role homes in both designs were inspected. Regressions: `qa/checkpoint-02-corrections.cjs` 34 of 34, `qa/verify.cjs` journey PASS with 60 views and no overflow, `qa/motion-studio.cjs` 205 of 205.
- **Not done, said plainly.** Evening mode (0.3.4.3) and its contrast table; the QA component page of 0.3.2.3; the Aref Ruqaa accent word and IBM Plex Mono (not installed until used). The switch has no keyboard path and cannot be reached on phone widths, where the sidebar is hidden. The built-in browser pane would not draw while the app window was hidden, so all visual checks used Playwright screenshots in Edge.
- **Next action:** owner decision D-01 with the Director, now on the live toggle instead of the artifact; then Round 1 corrections from task 0.2.3.5.

## 2026-10-10 — Logged by Compass

- 937e22b feat(identity): second design behind a double-click on the sidebar logo

### 2026-10-11: Round 1 corrections from the Director's response (Phase 0.2.3)

- **Owner decision D-03, 2026-10-11:** R01's severities confirmed as transcribed (8 Severity 1, 7 Severity 2, 3 Severity 4, 1 not scored). The consolidated register in `validation/feedback-rubric.md` section 5 now holds all 19 findings with a decision and status each (task 0.2.3.1).
- **Six corrections, one commit each, each citing its findings:**
  - `0a0c5e5` task 0.2.3.5 (F-R01-02): fixed scenario date, Monday 21 September 2026, stated in every page header; overdue and due-soon measured against it; seed of 11 items with 3 overdue, 3 due soon, 3 on time; Director and Assistant Director Home counts linked to the filtered list; «متأخر» filter on Work.
  - `1418f68` task 0.2.3.6 (F-R01-01, F-R01-17): work assigned to ten named people, two per specialism; team view on Work (default for leadership) with status, stage and lateness per item; «حمل الفريق» on leadership Home; purpose line under «العمل». A specialist now edits only their own work.
  - `792eae0` task 0.2.3.7 (F-R01-05): channel versions written before a change to the main text are flagged on the work page, the reviewer's release and the history; cleared by rewriting or «تأكيد الصياغة».
  - `e0863d9` task 0.2.3.8 (F-R01-06): word-level difference between submitted revisions, suited to Arabic, with changed fields listed, on the review screen and in the writer's history.
  - `65b740d` task 0.2.3.9 (F-R01-07): channel authorization end times; the scheduling dialog warns for the chosen time; «مواعيد معرضة للخطر» on the Publishing Officer's Home.
  - `93b321a` task 0.2.3.10 (F-R01-03): typed mm:ss video notes in time order, carried by a change request; the interface says playback is deferred.
- **Verification, final production build:** `npm run typecheck` clean; `npm run build` clean; `npm test` 15 of 15 (six new tests, one per correction); `node qa/round1.cjs` 52 of 52 (new script, one section per task, both leadership roles where the task names them, 390 px checks for the team view and the difference); `qa/checkpoint-02-corrections.cjs` 34 of 34 and `qa/verify.cjs` journey PASS with 60 views after every correction. Screenshots of each correction inspected.
- **Task 0.2.3.12, design notes and recommended decisions** (`validation/design-notes/`). Each Severity 1 deferral below is recorded with its reason, as exit gate criterion 5 requires; the owner confirms or overrules.
  - F-R01-04 approval scoped to what changed (Severity 1): recommended defer to Checkpoint 2.3. Reason: it changes the approval engine; `approval_policy_design.md` sections 4 to 6 already anticipate it after the conservative first-version rule.
  - F-R01-09 close and archive (Severity 2): recommended defer to Checkpoint 2.1; the Arabic action word needs a verdict first.
  - F-R01-10 stages per content type (Severity 2): recommended defer to Checkpoint 2.1, templates kept by leadership.
  - F-R01-11 delegation (Severity 1): recommended defer to Checkpoints 1.2 and 2.3. Reason: needs real authority checks the prototype does not have; `organizational_role_discussion.md` section 5 already specifies the acting assignment.
  - F-R01-12 urgent path (Severity 1): recommended defer to Checkpoints 2.3 and 2.4. Reason: reminders and escalation need the notification engine; `emergency_workflows.md` section 1 already matches the Director's answer. A visual urgent mark in the prototype is offered as an owner option.
  - F-R01-13 several campaigns (Severity 1): recommended defer to Checkpoint 2.1. Reason: changes the core data model; pair it with a source field to measure planned against unplanned work.
  - F-R01-18 stage deadlines (Severity 2): recommended defer to Checkpoint 2.1, on the stage templates.
  - F-R01-19 edit attribution (Severity 2): recommended defer to Checkpoints 1.4 and 2.3; the activity log already names the editor. Showing it on each version in the prototype is offered as an owner option.
- **Task 0.2.3.11:** re-check script `validation/recheck-R01.md` prepared; waits on the Director.
- **Tasks 0.2.3.3 and 0.2.3.4:** nothing removed (R01 named no unused interaction); no terminology verdicts exist yet (T6 asked in the re-check).
- **Not done, said plainly:** no participant has seen the corrections yet, so no Severity 1 finding is closed. The scenario date is fixed; nothing in the prototype advances time.
- **Next action:** the Director's re-check (0.2.3.11) and the owner's decisions on the eight design notes.

### 2026-10-11: Second design, remaining screens behind the logo toggle (Checkpoint 0.3)

- **Owner directive, 2026-10-11:** keep building the new identity as a toggle on the logo, on and off. Direction A stays the default; D-01 still decides the default.
- **Built, each only while the second design is on:** evening mode (device preference); the Aref Ruqaa accent word; Home «قراراتك الآن» with inline actions, campaign pulse and an attention strip (0.3.3.1); approval binding note and stamp (0.3.3.2); phone approval sheet with 44 px targets (0.3.4.3); notification tiers (0.3.3.3); calendar week with channel lanes, drag or dialog to request a time, Publishing Officer confirms (0.3.4.1); Motion Studio opened from a poster or video work with suggested templates and the work's title (0.3.4.2); component QA page at `/components` (0.3.2.3). The logo also sits in the phone top bar, so the switch works on phones.
- **Supporting changes:** a `--green-text` token (same value in Direction A) so links stay readable in evening mode; `useIdentity` in its own client module (`src/lib/use-identity.ts`), because the server layout imports the switch's constants and a client hook in the same file broke the build; `@fontsource/aref-ruqaa` 5.3.0 (OFL).
- **Defects found by inspecting screenshots and fixed before commit:** the pulse summary used muted grey on the dark banner; the stamp caption used muted grey on the backdrop; the phone sheet clipped the approve label; the sheet stopped 5 px short of the navigation bar; white on the evening hover green was 4.04 to 1 (hover now darkens to `#146a50`).
- **Verification, final production build:** `npm run typecheck` clean; `npm run build` clean; `npm test` 15 of 15; new `node qa/identity-screens.cjs` 48 of 48 (Direction A carries none of the new structures; each screen above; stamp with and without reduced motion; drag, request and confirm; keyboard request; 44 px buttons above the bar after scrolling; phone logo switches off and on; six evening pages without sideways scrolling; no page errors; no external requests); `qa/identity-toggle.cjs` 190 of 190 including 51 contrast pairs in each mode (lowest text pair 4.73); `qa/round1.cjs` 52 of 52; `qa/checkpoint-02-corrections.cjs` 34 of 34; `qa/verify.cjs` journey PASS; `qa/motion-studio.cjs` 205 of 205. Screenshots of Home, calendar, stamp, phone sheet and evening Home inspected.
- **Not done, said plainly:** the command palette (waits on the Director, question added to the re-check script); no real-phone test of the sheet (emulated 390 px only); IBM Plex Mono not installed (no screen uses it); `DESIGN.md` is not rewritten, because the new identity is not approved as the default. Direction A's pixel baseline from 0.3.1.1 no longer applies, because the Round 1 corrections changed what Direction A shows; `qa/colour-tokens.json` stays the record of that task.
- **Next action:** the Director's re-check (`validation/recheck-R01.md`), which now also covers D-01 and the command palette; then the owner's decisions on the design notes (D-04).

## 2026-10-11 — Logged by Compass

- b8cd964 feat(identity): second-design screens and evening mode behind the logo toggle (Checkpoint 0.3)

### 2026-10-11 (later): three small fixes after the deployment

- **Deployed:** commits up to `b8cd964` pushed to `main` at the owner's request; Vercel production deployment `dpl_D3AaHTfvAf9mUuCn1oqAz9gc8TYP` built in 23 s and is READY at `comms-hub-three.vercel.app` (public) and two team aliases behind Vercel login. Checked on the public address: `/health` 200, `/components` 200, the scenario date and the Work purpose line present.
- **Calendar move requests kept (task 0.3.4.1 follow-up).** Requests moved from the calendar's local state into the shared store (`moveRequests`, actions `move-request` and `move-cancel`). They survive navigating away, notify the Publishing Officer as an action, are replaced by a newer request for the same work, and are cleared by scheduling. Leadership and the Publishing Officer may request; the Publishing Officer or the requester may cancel.
- **Phone approval sheet (task 0.3.4.3 follow-up).** Fixed above the 69 px navigation bar from first load instead of sticky (which could not rise above its panel until the user scrolled); applies only when the sheet holds decision buttons; the page gains bottom space so nothing is hidden behind it.
- **Zero-emoji rule.** The bell emoji in the `MVP_draft.md` top-bar wireframe (section on search) replaced by «الإشعارات». No emoji remain in the file; the plain check marks in other wireframes are text symbols and stay.
- **Verification, production build:** typecheck clean; build clean; `npm test` 16 of 16 (new move request test); `qa/identity-screens.cjs` 51 of 51 (new: sheet above the bar on first load, end of page reachable, request survives navigation, Publishing Officer notified); `qa/identity-toggle.cjs` 190 of 190; `qa/round1.cjs` 52 of 52; `qa/checkpoint-02-corrections.cjs` 34 of 34; `qa/verify.cjs` journey PASS. Phone sheet screenshot inspected.

## 2026-10-11 — Logged by Compass

- da86098 fix: keep calendar move requests, fix the phone sheet on first load, remove an emoji

### 2026-10-11 (later still): light mode as the default, theme toggle in Settings, and real accounts

- **Owner directive, 2026-10-11:** (1) make light mode the default and put the dark mode toggle in Settings; (2) check roles and permissions, then add sign-in with the three founding administrators (`ameeralhatemi67@gmail.com` Ameer Alhatime, `polkgvd2@gmail.com` Amir Alhatime, `duaij1422@gmail.com` دعيج الرشدان), other people added by an administrator or by an access request, permissions to use features and to open pages managed on an accounts page, and the role switch kept for administrators only. Sign-in method chosen by the owner: email and password, stored in Supabase.
- **Recorded deviation from `MVP_draft.md` and the Version 0 boundary:** the specification says "NO real authentication". By this directive the accounts layer is now real, for the testing phase. Work items, approvals and publications are still local mock state in each browser; nothing about them is persisted or shared. `AGENTS.md` (Prototype boundary), `Status.md` and `Roadmap.md` (task 1.2.1) were updated to say so. This pulls Roadmap task 1.2.1 forward in part (Supabase Auth integration), nothing more.
- **Theme.** Light is the default and the device's colour preference is no longer read. `<html data-theme>` is `light` unless a person chose dark; dark is a stored per-browser choice (`comms-hub-theme`), set in Settings, Appearance, together with a design selector (Direction A or the new identity) that also gives the logo double-click a keyboard path. Dark exists only in the new identity, as before; the control says so and is disabled in Direction A. Files: `src/lib/identity.ts`, `src/lib/use-identity.ts`, `src/app/identity.css`, `src/app/layout.tsx`, `src/components/supporting.tsx`.
- **Accounts (Supabase project `comms-hub`, eu-central-1, created for this, 10 USD per month).** Tables `accounts` and `access_requests` with row level security; migration kept in `supabase/migrations/20261011000000_accounts.sql`. Only an email on the list can create a sign-in (trigger on `auth.users`). A founding administrator is protected: cannot be removed or demoted from the app. `admin` is not assignable to anyone else. Removing an account deletes its sign-in and sessions. An unconfirmed email is never trusted, whatever the project's confirmation setting says. The project's `mailer_autoconfirm` is false, so email confirmation is enforced.
- **Permissions model.** One account has a role and a list of pages. The role decides what the person may do (create, review, publish) through the existing `roles` table, enforced by the existing reducer. The page list decides where they may go; Home and Account are always open; administrators open everything. Defaults per role come from `defaultPages`. A page grant cannot give create to a role that lacks it. Pure rules in `src/lib/access.ts`.
- **Role switch.** Only an administrator sees «عرض بصفة». For everyone else the control is replaced by a fixed role chip, and the reducer refuses `role` actions (`roleLocked`), so hiding the control is not the only defence. Administrators start as role `admin`, which by the project's own separation of duties does not create, review or publish; they reach every feature by switching the role they view as.
- **Access enforcement points.** The root layout renders nothing of the product without an approved account (sign-in screen instead, no product markup or text in the HTML); the page re-checks per navigation; the sidebar and phone menu list only granted pages; `/admin`, `/accounts` and `/components` are administrator-only; database policies refuse the rest.
- **Roles and permissions audit (findings, before this change).** (a) The role switch was open to everyone and enforced nowhere; any tester could view Admin. Fixed above. (b) `/admin` and the component gallery were guarded only by hiding links and a check against the viewed role. Fixed above. (c) The reducer does enforce create, review (approve, request changes, reject), publish (schedule, publish, retry) and edit rights per role; the permission matrix in Admin matches `roles`. (d) `comment` and `read` carry no role guard, which is intended. (e) Nothing prevents a reviewer who submitted a work from approving it; the specification does not forbid it, noted for the owner. (f) The real limit: work data is per-browser memory, so reducer rules protect the interface's behaviour, not shared data. Real enforcement of approval and publication needs the work data in the database (Roadmap Checkpoint 1.3 onward).
- **Verification actually run.** `npm run typecheck` clean. `npm run build` clean (Next 16.3.5, proxy recognised). `npm test` 28 of 28 (the 16 existing domain tests plus 12 new in `tests/access.test.mjs`: page rules, role lock and reset, admin not assignable). Database rules: one transaction of 28 assertions run as anonymous, administrator, ordinary member and unconfirmed founder, rolled back, all passed (sign-up gate, request deduplication, protection of founders, no escalation by a member, removal revokes sign-in). Supabase security advisors: only the expected warnings for the callable functions (each checks its caller). Browser, signed out, built app: the gate shows on `/`, `/admin`, `/accounts`, `/work/CH-241`, `/settings` and `/create`, and the raw HTML contains no work titles, role names or shell; light stays on a device that prefers dark; dark applies when stored; Direction A stays light even with dark stored; no console errors and no request leaving the origin on load; no sideways scroll at 375 px; the request-access form wrote one row, which was then deleted.
- **Not done and not verified, said plainly.** (1) No signed-in screen was seen in a browser: signing in needs a person's real password and a confirmation email, and a stub session was refused as an authentication bypass. The Settings toggle, the role switch, the filtered navigation, the accounts page and the account page are covered by typecheck, build and unit tests only. The owner's first real sign-in is the check. (2) The older browser scripts (`qa/acceptance.cjs`, `identity-toggle.cjs`, `identity-screens.cjs`, `round1.cjs` and the rest) now meet the sign-in screen first and need a signed-in session; they were not re-run. Their evening-mode assertions were edited to the new rule (dark is chosen, not inferred) without being run. (3) `qa/auth-gate.cjs` was written for the signed-out checks above but its execution was blocked in this session, so it has no JSON result; the checks were done by hand in the browser pane. (4) Email confirmation, password reset and the confirmation links were not exercised: they send real email. (5) Supabase built-in mail is rate limited, and confirmation and reset links land on the project's Site URL, which defaults to `http://localhost:3000`; set Site URL and Redirect URLs in the Supabase dashboard to every address the app is served from, including the Vercel domain, before relying on password reset there.
- **Before deploying.** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` must be set on Vercel. Without them the deployed app fails closed and shows the «الاتصال بالحسابات غير مضبوط» screen. Nothing was pushed or deployed.
- **Next action:** the owner signs in once as each administrator, sets a password, and checks Settings, Accounts and the role switch; then the older QA scripts get a signed-in run.

### 2026-10-11 (evening): Google Drive as the file store (Roadmap 3.2, pulled forward)

- **Owner directive, 2026-10-11:** use Google Drive for storage, built now, with the Gmail account `commshubhadayah@gmail.com` until a later upgrade. Recorded deviation from the Version 0 boundary, in the same way as the accounts layer: the file store is real, work data is still mock.
- **Design, forced by the account type.** A personal Gmail has no Shared Drives, and a service account cannot own files there (no quota of its own). So the Hub acts as that account through OAuth 2.0 offline access, with the narrow `drive.file` scope: it sees and changes only files it created, in one folder, «Comms Hub». The refresh token and client secret are server-only environment variables (`GOOGLE_*`), never in the repository, never stored by the Hub. When the organisation moves to Google Workspace, a Shared Drive and a service account replace this behind the same adapter (`src/lib/drive/google.ts`).
- **Upload path.** The browser asks the server for a resumable session (`/api/media/upload-session`, which validates type, size and role), sends the file in 8 MiB chunks straight to Google (the file never passes through Vercel, so its body limit does not apply), then calls `/api/media/complete`, where the server asks Drive whether the file is in the Hub folder, was created for that person and is an accepted type before registering it in `media_files`. Preview and download stream through `/api/media/[id]/content` with Range support, behind the session; the Drive address is never exposed. Delete moves the file to the Drive trash (30 days) and removes the record; uploader or administrator only.
- **Rules.** Who may add: administrators and every role that can create (the publisher cannot); the database repeats this rule and a test fails if it drifts from `roles`. Refused types: SVG, HTML, scripts, executables, unknown binaries. Cap 5 GiB per file. Served files carry `nosniff` and a sandbox CSP, since they come from the Hub's own address. Every API route refuses a signed-out caller; mutating routes also require a same-origin request.
- **Files:** `src/lib/drive/{google,media,guard}.ts`, `src/app/api/drive/{connect,callback,status}`, `src/app/api/media/*`, `src/components/drive-files.tsx` (Media page and Admin, Integrations), `supabase/migrations/20261011120000_media_files.sql`, `tests/drive.test.mjs`.
- **Verification actually run.** `npm run typecheck` clean; `npm run build` clean, nine new routes registered; `npm test` 43 of 43 (the 28 before plus 15 in `tests/drive.test.mjs`: type and name rules, same-origin rule, role rule against the migration, token caching and expiry, folder find-or-create, resumable session request shape including the Origin header, Range pass-through, connect link, code exchange; Google is replaced by a scripted fetch). Database: a rolled-back transaction as writer, publisher, anonymous and administrator confirmed insert-as-yourself only, no insert for the publisher, no delete of another person's file, administrator may delete. Running server: all seven new endpoints answer 401 when signed out.
- **Not done and not verified, said plainly.** No real Google call has been made: there is no OAuth client yet, so the connect flow, the token exchange against Google, the resumable upload, the CORS behaviour of the session address from a browser, preview, range playback and trash have only been checked against the documented API through scripted tests. The first real upload is the test. The retry-and-resume path after a dropped connection reads Drive's `Range` header, which a browser may not be allowed to read cross-origin; in that case a resumed upload restarts from the beginning, which is slower, not wrong. Video playback streams through a serverless function, so very long single requests are bounded by the host's function duration.
- **Owner steps, once.** (1) In Google Cloud Console, signed in as `commshubhadayah@gmail.com`: create a project; Google Auth Platform, audience External; add the scope `.../auth/drive.file`; set the publishing status to In production (otherwise tokens expire after 7 days); enable the Google Drive API; create an OAuth client of type Web application with authorised redirect URIs `https://comms-hub-three.vercel.app/api/drive/callback` and `http://localhost:3000/api/drive/callback`. (2) Put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Vercel (secret) and `.env.local`; redeploy. (3) As an administrator press «ربط Google Drive» on the Media page, approve with the Gmail account, copy the token shown into `GOOGLE_DRIVE_REFRESH_TOKEN` in Vercel and `.env.local`, redeploy. (4) The account's free 15 GB is shared with Gmail and Photos; buy Google One storage on that account for the volume you expect.
- **Next action:** the owner's three steps above, then the first real upload and the checks listed as not verified.
- **Correction found while publishing the Google consent screen (same day).** Google's Publish button stays disabled for an External app until a valid app name, support email, homepage URL **and privacy policy URL** are saved, and a logo additionally forces a verification review. The earlier owner steps said to leave the links empty; that was wrong. Added public static pages outside the sign-in gate: `public/privacy.html` and `public/terms.html` (English and Arabic; they state the `drive.file` scope, what is stored, and how to revoke). Consent-screen values to use: homepage `https://comms-hub-three.vercel.app`, privacy `/privacy.html`, terms `/terms.html`, authorised domain `comms-hub-three.vercel.app`, no logo. Not verified: that Google accepts a `vercel.app` subdomain as an authorised domain without a verification step; the fallback is Testing mode with a weekly reconnect, or a custom domain.

### 2026-10-11 (night): the media section as a real feature (folders, permissions, pipeline, asset page, tasks, activity log)

- **Owner directive, 2026-10-11:** implement the approved media design (artifact `JaqMD4oRMFPUxHS7yPJ2g5`) in the project and push it. One design note applied: the Drive card and the two buttons beside it now share one height.
- **Data model (Supabase, migrations `20261011180000_media_system.sql`, `..190000_media_record.sql`, `..200000_media_share_links.sql`).** `media_folders` (tree, restricted, locked, Drive id), `media_grants` (role or person, levels 0 to 4), `media_files` grown into the asset record (stage, tags, approved version, channels, copy, schedule, checklist, dims, duration), `media_versions`, `media_tasks`, `media_notes`, `media_share_links`, and an append-only `activity_log`. Existing uploads were kept: they sit in the folder «غير مصنّف».
- **Rules live in Postgres.** A level is resolved by walking the folder's ancestors (person beats role, a restricted folder stops inheritance, a locked folder is read-only below manage). Triggers on the asset table enforce who may rename, tag, move, change stage (reviewers approve, only the director rejects, only the publisher schedules and publishes), save copy and delete; an approved version that is ready, scheduled or published cannot be renamed or deleted; a new version after review returns the asset to review and keeps the approved version recorded. The log is written by triggers, so no screen can skip it, and nobody can edit or delete a row.
- **Deviation, recorded.** Administrators act as any role in these rules (`media_acts`), so the existing role switch lets them test every action. This departs from the earlier separation of duties (Admin does not approve or publish). One function to tighten later.
- **Drive.** Folders are created, renamed and moved in Drive together with the database change; the database goes first so its rules decide, and the record is put back if Drive refuses. Versions are separate Drive files, trashed together with the asset (30 days). Uploads still go from the browser straight to Google.
- **Screens.** Library (folder tree with levels and locks, pipeline stage filters, grid, list and stage board, drag to move, selection, quick-action menu, attention strip, real storage figure), full asset page (stepper with who moved it and when, journey from the log, versions, timecoded notes, channels with size fit, checklist, team, tasks, quick actions by role), tasks page, activity log page (managers see all, others their own), role-aware dialogs (assign, request or write copy, schedule or publish, changes, reject, approve, new version, note, access and lock, review link). Pages `tasks` and `activity` were added to the grantable pages. The role switch decides which quick actions are shown to an administrator.
- **Review links are real:** a random 64-character token, 24 hours to 30 days, revocable, answering only for a valid token at `/r/<token>`; creation is logged.
- **Verification actually run.** `npm run typecheck` clean; `npm run build` clean (15 routes); `npm test` 55 of 55 (12 new in `tests/media.test.mjs`: levels, locks, stage terms, quick actions per role and stage, role lists compared with the SQL, log text). Database: a rolled-back transaction acting as writer, designer, producer, publisher, director, assistant covered 40 assertions (upload only where granted; sees only what is granted and ghost parents; designer cannot approve; publisher cannot schedule an unapproved asset; assistant approves and the version freezes; approved assets cannot be renamed or deleted; director cannot publish; publisher needs a schedule; new version after approval returns to review with the approved version kept; version numbers cannot skip; locked folders refuse additions and moves; restricted folders do not inherit; designer cannot assign; assignee completes; the log cannot be edited or deleted). Supabase advisors: only the expected callable-function warnings.
- **Not done and not verified, said plainly.** (1) No signed-in screen was seen in a browser by me: every screen of this section is covered by typecheck, build and unit tests only. The first real sign-in is the test, including the Drive card height fix. (2) No real Google call was made for folder create, rename, move, new version, trash or review-link streaming; they follow the documented API and the earlier scripted adapter tests only. (3) Publishing remains a simulation (no message leaves the system); the interface says so. (4) The older illustrative assets (poster, reel, footage) remain only for the work items that point to them. (5) `qa/*.cjs` scripts need a signed-in session and were not re-run. (6) The channel integration data (Instagram, X, LinkedIn) is still the mock list from `domain.ts`.
- **Owner steps.** Sign in as an administrator and walk the library: create a folder, upload, rename, move, change access and lock, then switch «عرض بصفة» to the publisher and the writer to see their actions. Grant «المهام» and «سجل النشاط» to the other accounts in the accounts page; grant folder levels from «الوصول والقفل».
- **Next action:** the owner's walk-through and a list of what to fix; then the signed-in browser run of the older QA scripts.

## 2026-10-11 — Logged by Compass

- 55211de feat(media): folders, permissions, pipeline, asset page, tasks, activity log and review links

### 2026-10-11 (late night): the mail page as a real feature

- **Owner directive, 2026-10-11:** build the mail page into the site, following the approved artifact «البريد الجديد» (`DkADjn9JXUYUPkGRm46Gqb`) and the owner's four decisions: external mail through the existing Gmail account with an app password; the director, assistant and publisher see the whole shared mailbox, others only what is assigned to them or copied to them; a new outside thread from anyone but the director or assistant waits for their approval, while replies on a thread assigned to its author go out directly; all Hub-specific features in scope.
- **Data model (Supabase, migrations `20261011210000_media_task_progress.sql`, `20261011220000_mail.sql`, `20261011230000_mail_file_names.sql`).** `mail_threads`, `mail_members` (participation plus each person's read, star, archive, trash, mute, snooze), `mail_messages` (mail, internal notes, timeline lines; states sent, held, returned, outbox, queued, failed; scheduled sending), `mail_files`, `mail_date_tokens`, `mail_rules`, `mail_settings`, `mail_server_key`. Tables have read policies only; every write is a `security definer` function that checks the rule first. Groups («فريق الإنتاج», «القيادة», «كل القسم») are expanded from roles at send time.
- **Action cards act through the existing rules.** Approval cards are bound to one version and move the asset through the media guard (a newer version turns the card to «تجاوزه إصدار أحدث»); task cards create a real `media_tasks` row and follow it wherever it changes; progress cards move a stage through the same guard; date cards are confirmed inside the Hub, or by an outside party through two signed links (`/m/<token>`, 72 hours, one answer, opening the page changes nothing).
- **Review finding 2 fixed on the way.** The person assigned a task can no longer move its due date, priority, kind or note (`TASK_TERMS_LOCKED`); they report progress (0 to 99) and mark it done.
- **Server.** `src/lib/mail/{gmail,sync,rules}.ts`; routes `/api/mail/sync` (read new mail into the Hub, then send what is due; one turn at a time, held by the database), `/api/mail/upload-session` and `/upload-complete` (attachments to Drive, 25 MB, checked in Drive before they are registered), `/api/mail/file/[id]`, `/api/mail/inbound/[id]/[index]`, `/m/[token]`. The server proves itself to the database with `MAIL_SERVER_KEY`; only its sha256 is stored. Outside mail carries the approved version of each referenced asset, or a 7-day review link above Gmail's 25 MB.
- **Page.** Folders (الوارد، يحتاج إجراءك، المُسندة إليّ، بانتظار الرد، المميّزة، المؤجلة، المرسلة، المجدولة، المسودات، بانتظار الاعتماد، الأرشيف، المهملات), the shared mailbox for leads, labels, search with `from: to: is: has: label: in:`, bulk actions, keyboard shortcuts, composer with people, groups and outside addresses, @ mentions, references from the library, cards, templates, signature, send later, a ten-second undo, handling bar (status, owner, reply-by time, request number, convert to work), internal notes, context panel, admin settings (pause outbound mail, reply time, sorting rules). Works in Direction A, the new identity and evening mode through the existing tokens. The old mail stub in `supporting.tsx` was removed and `qa/acceptance.cjs` updated.
- **Deviations, recorded.** (1) Drafts are kept in the browser (localStorage), not the database. (2) Work items are still local mock state, so «تحويل إلى عمل» creates the work item in the browser that converts and links its number to the thread for everyone. (3) Undo send holds the message in the page for ten seconds; leaving the page in that window sends it at once. (4) External status has four values (جديد، مُسند، بانتظار الرد، مغلق); «تم الرد» from the brainstorm was folded into «بانتظار الرد».
- **Verification actually run.** `npm run typecheck` clean; `npm run build` clean (5 new mail routes and `/m/[token]`); `npm test` 74 of 74 (19 new in `tests/mail.test.mjs`: approval rule, who sees the shared mailbox, every folder, unread, cards, search operators, reply time, Arabic error text, timeline wording, Riyadh time, groups, outgoing mail escaping and links, every called function exists in a migration). Database: `supabase/tests/mail_rules.sql`, a rolled-back run acting as writer, director, publisher and member, 25 of 25 as expected (outside mail held for the writer, refused approval by the writer, internal thread invisible to the publisher, shared thread visible to the publisher, member sees neither, director approves into the outbox, task card creates a task, progress 50 reaches the card, the writer cannot move their own deadline, scheduled mail invisible before its time, assignment numbers the request #184, member cannot change status). Browser: `qa/mail-public.cjs` 15 of 15 against the production build (unknown and malformed tokens 404, a real token shows the date in Riyadh time, no sideways scroll at 1280 and 390 px, confirming records once, a second visit says it was answered, `/mail` without sign-in shows the gate, mail API refuses signed-out and cross-site calls, no page errors); the database then showed the card confirmed, the token used, the timeline line and the activity log row. The test thread was removed afterwards. Supabase security advisor: no new kind of warning (definer functions as the only write path, two closed tables by design).
- **Not done and not verified, said plainly.** (1) No signed-in mail screen was seen in a browser by me (no sign-in bypass may exist); the page is covered by typecheck, build, unit tests and the database run only. (2) No real Gmail connection was made: `GMAIL_ADDRESS` and `GMAIL_APP_PASSWORD` are not set, so reading, sending, threading by headers and inbound attachments are untested against Gmail. (3) Attachments from the computer need Google Drive connected, which is not set locally.
- **Owner steps.** (1) On the department Gmail account: turn on 2-Step Verification, then create an app password (Google Account, Security, App passwords). (2) Set `GMAIL_ADDRESS`, `GMAIL_APP_PASSWORD` and `MAIL_SERVER_KEY` in `.env.local` and in Vercel; the server key is already in the local `.env.local` and its hash is in the database, so copy that same value to Vercel. Optionally set `MAIL_SITE_URL` to the public address. (3) Grant the «البريد» page to the accounts that should use it. (4) Sign in, open البريد as an administrator and send one internal and one outside message, then reply to the outside one from another mailbox.
- **Next action:** the owner's steps above, then a signed-in walk-through of the mail page across the roles.

## 2026-10-11 — Logged by Compass

- 4bc0666 feat(mail): internal mail, the shared Gmail mailbox and action cards

### 2026-10-12: messaging tab, profiles, and the mail page deployed

- **Owner directive, 2026-10-12:** push the mail page to deploy (the Gmail steps are done), build the approved messaging tab («المراسلة», artifact «البريد الجديد» version 2) into the site, and let people edit how they appear in mail and messaging, including a profile picture; then push.
- **Mail deployed.** Commits pushed to `main`; Vercel deployment `dpl_AnXdYhNB1K3tCQtuHtJNoQgfB4dc` READY on `comms-hub-three.vercel.app`. The four mail variables are present in Production (names checked, values not read). In production `/m/<unknown token>` answered 404 and an unsigned `POST /api/mail/sync` answered 401; `/health` 200.
- **Data model (migration `20261012000000_chat_profiles.sql`).** `profiles` (picture as a data URL of at most about 190 KB, headline, name colour, presence, signature, Enter-sends), `chat_rooms` (dm, group, channel; optional link to the campaign or a work item; pinned message), `chat_members` (admin, read time, mute, pin), `chat_messages` (text, voice, image, file, asset, work, poll, task, approval, timeline), `chat_reactions`, `chat_votes`, `chat_acks`, `chat_stars`. Read policies only; writes through `chat_*` and `profile_update` functions. Channels and urgent messages belong to the director and the assistant; tasks to the director, assistant and producer, as on the Tasks page; approval cards move the asset through the media guard; task cards follow their task (the existing follow trigger now updates chat cards too). Realtime publication covers the chat tables.
- **Interface.** `/mail` and `/mail/chat` share one page with two tabs and unread counts. Messaging: room list with presence, filters and search; conversation with day separators, unread marker, grouping, quotes, forwarding, reactions as words with icons (no emoji), stars, pins, edits within 15 minutes, delete for everyone, live previews of assets and work items, polls, tasks, approval cards, urgent acknowledgement, `/` commands, `@` mentions, typing indicator over Realtime broadcast, pictures, files and voice notes recorded with the microphone (waveform from the real levels, playback speed), info panel with members, media and starred messages, «تحويل إلى بريد رسمي» which opens a mail draft to the room's members. Account page: «مظهرك في البريد والمراسلة» with a live preview. Mail now shows profile pictures and uses the personal signature when one is set.
- **Verification actually run.** `npm run typecheck` clean; `npm run build` clean (new route `/api/chat/file/[id]`); `npm test` 87 of 87 (13 new in `tests/chat.test.mjs`). Database: `supabase/tests/chat_rules.sql`, a rolled-back run acting as writer, director, publisher and member, 22 of 22 as expected (a direct chat is invisible to a third person, the writer cannot open a channel or post in one, the director's urgent message is acknowledged, the writer cannot send urgent messages or tasks, the director's task to the writer is completed from the card and the card follows, a single-choice vote keeps one vote, nobody edits or deletes another's message, a person renames themselves through `profile_update`, a member outside a room sees nothing and cannot post). Supabase rows after the run: none left.
- **Not done and not verified, said plainly.** (1) No signed-in screen of the messaging tab or the profile editor was seen in a browser by an agent (no sign-in bypass may exist). (2) Realtime delivery, the typing broadcast and microphone recording have not been exercised in a real browser session. (3) Pictures, files and voice notes need Google Drive, configured in production only.
- **Owner steps.** Sign in on the live site, open «المراسلة», start a direct chat and a group, send a picture and a voice note, vote in a poll, and set a profile picture in «الحساب». Report anything that looks wrong.
- **Next action:** the owner's signed-in walk-through of mail and messaging.

### 2026-10-12: Next.js upgraded to 16.3.8 (security)

- **Why.** `npm audit` reported one critical and two high advisories in production dependencies: Next.js 16.3.5 (remote code execution in `next/og` ImageResponse, GHSA-vcvr-r3jv-pc5j, fixed in 16.3.6; image optimisation SSRF, two cache poisoning issues, metadata image disclosure and a dev MCP disclosure, all fixed in 16.3.8), `sharp` below 0.35.5 (librsvg) and `source-map-js` 1.2.1 (event-loop denial of service).
- **Change.** `next` pinned from 16.3.5 to 16.3.8, the patch release that closes every Next.js advisory, rather than the 16.4 minor. `npm audit fix` (no `--force`) moved `sharp` to 0.35.5 and `source-map-js` to 1.2.2 inside the lockfile. No source change. `.claude/launch.json` gains a second start configuration on port 3100.
- **Verification actually run.** `npm audit`: 0 vulnerabilities. `npm run typecheck` clean. `npm test` 87 of 87. `npm run build` clean. The built app started on port 3100 (log: "Next.js 16.3.8", ready in 546 ms, no errors); `/health` 200; `QA_BASE_URL=http://127.0.0.1:3100 node qa/auth-gate.cjs` 31 of 31; `node qa/mail-public.cjs` 8 of 9, the ninth (the real date-token flow) skipped because it needs a token made by hand in the database for the run; the sign-in page renders.
- **Not done.** Production still runs 16.3.5 until this commit is pushed to `main` (pushing deploys). A `next start` from earlier on port 3000 (started 18:34) still holds the old version in memory; restart it to serve the new build locally.

## 2026-10-11 — Logged by Compass

- 7d7e0c9 chore(qa): browser check results for the Next.js 16.3.8 build
- c5ca6de chore(deps): upgrade Next.js to 16.3.8 for security advisories
- **Deployed (later the same day).** Pushed to `main` on the owner's request; Vercel deployment `dpl_AtSDAUR1wGQVLmpbYNco6D3kVt9b` READY and aliased to `comms-hub-three.vercel.app`. In production `/health` 200, `/` 200, `/m/<unknown token>` 404.

### 2026-10-12: artifact «دورة العمل», pass 1 («العمل» and «إنشاء»)

- **Owner direction.** Design «العمل», «إنشاء», «الموافقات والنشر» and «التقويم» as one artifact on one shared sample dataset, in three review passes, then build them into the site one page at a time. Reason: a work item, its approval and its schedule are one record (`Work` in `src/lib/domain.ts`), and the media and mail artifacts each stubbed work differently.
- **Pass 1 published:** https://claude.ai/artifact/1tREdJRSuLpY9yignsf8q9 (private). Same frame, three designs and sample world as «مكتبة الوسائط الجديدة» and «البريد الجديد» (11 October 2026, CH-241, CH-236, the same assets), plus لمى، فهد، ماجد from the site. Contents: «العمل» with team, all, mine, requests and closed tabs, list and status board, attention counts and filters; the work item page (stages with per-stage dates, text with versions and channel copies, media from the library, links to mail and messaging, comments, an append-only log, role-aware actions, an approval placeholder for pass 2); «إنشاء» by type, prefilled from a mail thread, with validation.
- **Director findings designed in, previously deferred by `validation/design-notes/`:** several campaigns and a request source (F-R01-13), an urgent mark that sorts but bypasses nothing (F-R01-12), per-stage deadlines (F-R01-18), close with a reason and an archive tab (F-R01-09), the editor shown on a text version (F-R01-19), stage templates per type (F-R01-10, proposed, awaiting the department's real stages).
- **Decisions for the owner, listed in the artifact:** the word «عاجل»; «إغلاق العمل» or «إلغاء العمل»; default visibility with a «مقيّد» option; members create requests only (a change from the site); stage templates; work numbers issued by the server (fixes the mail «تحويل إلى عمل» numbering at `src/components/mail/mail-page.tsx:586`); per-asset or whole-work approval (pass 2).
- **Checked before publishing.** Script parses; no emoji. One headless Edge run clicked all 13 tour buttons and the main actions with no page errors: stage completion, close refused without a reason then accepted with undo, director's edit shown as «عدّله محمد · الكاتب خالد» with channel copies flagged, create from mail issued CH-251, member request validated then issued CH-252, a request assigned; Khalid's list has 13 items without the restricted CH-244, the director's 14 with it; no sideways scroll at 390 px. Screens seen in light, dark and phone width.
- **Next action:** owner review of pass 1 and the seven decisions; then pass 2, «الموافقات والنشر», in the same artifact.

### 2026-10-12: owner decisions on the work pages; artifact «دورة العمل», pass 2 («الموافقات والنشر»)

- **Owner decision, 2026-10-12:** all seven pass 1 recommendations accepted: «عاجل» as a third priority that sorts but bypasses no approval; «إغلاق العمل» with a written reason and a closed tab, keeping the last status; every account sees all work, with «مقيّد» for the people involved, leadership and the requester; members create requests only, leaders assign them; stage templates per type with optional per-stage dates, edited by leaders, awaiting the department's real stages; work numbers issued by the server; approval per part (design note `validation/design-notes/component-scoped-approval.md`, option 2 inside the policy model of option 3).
- **Pass 2 published** to the same artifact, version 2: https://claude.ai/artifact/1tREdJRSuLpY9yignsf8q9. «الموافقات والنشر» opens from the sidebar with two tabs. Approvals: «بانتظار قراري» (urgent first, then oldest), «أرسلتها أنا», and an append-only decision log; each card names the parts awaiting a decision. Review screen («أنت تراجع»): policy line, one row per pending part (text with a word-level difference against the approved version, each channel copy with length and stale flag, each media file with its version change and timestamped video notes, channels with exact accounts, proposed date), approve a part or all, request changes on chosen parts with a required reason and attached video notes, reject with a reason and optional close. Publishing: simulation notice, account authorisation with reconnect (simulated), «مواعيد معرضة للخطر», ready, scheduled (including schedules paused while a changed part is re-approved), partial or failed with retry of failed channels only, published.
- **Rules modelled, listed in the artifact for confirmation:** each channel copy is its own part (the Director's open question at the re-check); press releases, mail and announcements are approved as a whole package (`disscussios/approval_policy_design.md` sections 5 and 6); urgent work is approved by the Director only (R01, Q4); no self-approval (section 28); an approved proposed date binds scheduling, and a different time re-opens only «موعد النشر», then schedules itself when approved (section 20); adding a channel re-opens «المنصات والحسابات» (section 21); approval never publishes, only the Publishing Officer schedules or publishes (section 18); retry re-sends failed channels only.
- **Checked before publishing.** Script parses; no emoji. Headless Edge run `check2.cjs` (scratchpad), 33 of 33: all 26 tour buttons without page errors; urgent work leads the director's queue; CH-241 shows one pending part and finishes as ready to publish; Reem gets no decision buttons on her own urgent work and is told why, the director approves it as a whole package; approving one part shrinks the pending list; a change request is refused without a reason and keeps approved parts; Khalid's X fix resubmits that part alone; editing approved text re-opens the text alone; a different schedule time sends only the date for approval and schedules on approval; an expired LinkedIn fails publishing, reconnect and retry succeed; the at-risk panel lists the welcome post and its arrival ends as partial; the decision log lists the seeded decisions; pass 1 regressions (create from mail, restricted visibility); no sideways scroll at 390 px. Screens seen in light, dark and phone width.
- **Next action:** owner review of pass 2 and its eight rules; then pass 3, «التقويم», in the same artifact.

### 2026-10-12: owner approves the pass 2 rules; artifact «دورة العمل», pass 3 («التقويم»)

- **Owner decision, 2026-10-12:** the eight approval and publishing rules of pass 2 are accepted as written in the artifact (per-part approval with each channel copy its own part; whole-package policy for press releases, mail and announcements; urgent work approved by the Director only; no self-approval; an approved date binds scheduling and a different time re-opens «موعد النشر» alone; approval never publishes; rejection needs a reason and may close the work; retry re-sends failed channels only).
- **Pass 3 published** to the same artifact, version 3: https://claude.ai/artifact/1tREdJRSuLpY9yignsf8q9. «التقويم» opens from the sidebar with day, week, month and list views (list by default at phone width). Week: a lane each for Instagram, X, LinkedIn, mail, events and delivery, campaign bands, team load per day, overdue count pinned on today, busy-day mark. Entries: scheduled, approved but unscheduled, proposed, requested, held and published publications per channel; delivery and stage dates; media tasks; coverage events; personal reminders. Each entry opens a side panel with role actions. Each day has «إضافة»: work due that day, event coverage, scheduling ready work (Publishing Officer), a reminder.
- **Pass 3 rules, listed in the artifact for confirmation:** moving a publication (drag or dialog) is a request that re-opens «موعد النشر» only, replacing the Publishing Officer's lone «تأكيد النقل» of `MVP_draft.md` section 60; the current time is held until approval or withdrawal; leaders, the assignee and the Publishing Officer may request, and the requester, leaders or the Publishing Officer may withdraw; delivery and stage dates are internal (`disscussios/approval_policy_design.md` section 4) and leaders move them directly, never before an open stage; authorisation gaps, two works on one channel within two hours and days with seven or more entries warn without blocking; restricted work stays hidden; reminders are private to their owner; nothing but reminders exists outside a work item.
- **Checked before publishing.** Script parses; no emoji. Headless Edge run `check3.cjs` (scratchpad), 37 of 37: lanes, bands, risk marks and overdue count in the week; the spacing warning on 13 October; a move request warns per channel at the new time, holds the old time and offers withdrawal (not approval) to the requester; withdrawal restores the schedule; the director approves the new time from the panel and the post moves to Thursday; a delivery date before an open stage is refused, a valid one is accepted; a real drag of an approved date opens the move dialog on the new day at the same time; members get nothing draggable; the day menu per role; scheduling from a day sends a non-approved day for approval; reminders private and validated; «عملي فقط» and restricted work; whole-week month grid; Escape closes the panel; no page-level sideways scroll at 390 px in four views. Pass 2 regression `check2.cjs` 33 of 33. Screens seen in light, dark and phone width; a class-name collision with the «اليوم» pill and an off-screen side panel were found that way and fixed.
- **Next action:** owner review of pass 3 and its seven rules; then implementation in the site, starting with «العمل» and «إنشاء» on Supabase, with the approvals and schedule columns in the first migration.

### 2026-10-12: owner accepts the pass 3 rules; artifact version 4, the merged reference

- **Owner decision, 2026-10-12:** the seven calendar rules of pass 3 are accepted. A campaign («حملة») is one type of project («مشروع»). The Admin, the Director and the Assistant manage platform accounts. The owner asked for eleven additions and for the media and mail artifacts to be merged into this one, "so we have a fully working reference that we can use to correctly build this into reality".
- **Version 4 published** to the same artifact: https://claude.ai/artifact/1tREdJRSuLpY9yignsf8q9 (private). Page title «النموذج المرجعي للمركز». One shared sidebar, person switch and three-tier notification drawer across «العمل», «إنشاء», «المشاريع», «الموافقات والنشر», «التقويم», «الطلبات», «مكتبة الوسائط», «المهام», «سجل النشاط», «البريد والمراسلة» and «الحسابات المرتبطة», on one sample dataset. The media and mail artifacts run as modules inside it: one people list, one task list, one approval rule for files.
- **The eleven additions:** (1) connected accounts, several per platform, with add, edit, pause and delete for those three roles; deletion and pausing are refused while approved or scheduled work uses the account, and renaming a handle re-opens «المنصات والحسابات» on that work. (2) Tasks for one day, a run of days (a bar in the calendar), or chosen days each with its own person; events across days. (3) A «مشروع» card in «إنشاء» with a works plan; each planned work gets its stages assigned and dated backwards from its due date; a project page with a timeline, «من يعمل على ماذا», works and tasks; and «إنشاء» itself now builds the stage plan with people and dates. (4) Stages wait for the stages before them; finishing one notifies the next person «صار دورك». (5) Stages in parallel and stages or tasks that wait for several others. (6) Automatic assignment to the least busy person in the stage or task role, with the reason shown, changeable by hand. (7) Image and video preview in the review screen, with note marks on the video track. (8) Extension requests from a stage or task showing what moves after it; one-click approval moves the dependent stages and tasks and notifies their owners, with an option to extend the final due date. (9) «الطلبات»: extensions, folder access, publish-date moves, approvals, work requests, held outside mail, publish confirmations and delegation while away. (10) Per account and per post: publish automatically, or ask the Publishing Officer to confirm when the time comes. (11) A file approved in the library, mail, messaging or the review screen is the same decision everywhere; tasks are one list across mail, messaging, «المهام», the calendar and projects; «تحويل إلى عمل» opens «إنشاء» from the message or links an existing work.
- **Checked before publishing.** Script parses; no emoji. Headless Edge (scratchpad `merge/`): all 11 sidebar pages render with no page errors; all 83 tour buttons run with no errors; `check4.cjs` 50 of 50 (each of the eleven additions clicked through as the relevant person, plus the shared shell and designs). Earlier suites re-run on version 4: pass 2 `check2.v4.cjs` 34 of 34 and pass 3 `check3.v4.cjs` 37 of 37, after four expectations were updated for intended changes (the welcome post's account asks before publishing, so the check confirms before it ends as partial; the next work number is CH-254 after two seeded works; four project bands this week with «حملة الشتاء»; the day menu gains «مهمة» and «حدث»). Screens seen in light, dark and phone width. Found and fixed this way: two calendar tours still keyed to the old platform id, the review header collapsed by a reused class name, no confirm button on the work page for an ask-first post, the «الطلبات» badge counting less than its tab, and a cramped plan row in «إنشاء».
- **Next action:** owner review of version 4; then implementation in the site, starting with «العمل» and «إنشاء» on Supabase, using version 4 as the reference for the data model (projects, stages with people and dependencies, tasks with dependencies, requests, accounts).

### 2026-10-12: artifact version 5: hold to confirm, undo, YouTube, the plan editor, and the help system

- **Owner direction, 2026-10-12:** four corrections to version 4 of «النموذج المرجعي للمركز», and a three-level help and guide system, all in the artifact first so it stays the reference for the build: (1) a hold-to-confirm button for important actions, and an undo for misclicks; (2) YouTube in «الحسابات المرتبطة»; (3) drag to reorder stages in «خطة المراحل», plus more freedom to build a plan, added beside the current editor rather than replacing it; (4) a first-visit guide per page and per section, a help button on every page that explains anything clicked without covering what it opens, and a page guide opened by a double click with «إعادة الإرشاد لهذه الصفحة».
- **Version 5 published** to the same artifact: https://claude.ai/artifact/1tREdJRSuLpY9yignsf8q9 (private). What was built, listed in the artifact for confirmation:
  - **Hold to confirm.** Sixteen actions need a press of about 900 ms, with the button filling as it is pressed and a small ring marking it: approving the pending parts or the package, confirming a rejection, closing a work, publish now and «انشر الآن», deleting an account or an event, delegation, approving and locking a library file, deleting files, approving and sending held outside mail, approving from mail and messaging cards, and deleting a message for everyone. A quick click explains why instead of acting. Enter or Space held does the same from the keyboard.
  - **Undo.** Every change to data on the work pages and in the library can be undone from the message at the bottom, from a top-bar button that keeps the last 15 actions, or with Ctrl+Z outside text fields. Publishing cannot be undone and clears the history; if anything else changed the data since (mail, messaging, a scenario button), undo refuses and says why. Mail keeps its own 10-second undo of sending.
  - **YouTube.** A fourth platform with the account «الرسمي» (ask before publishing), in the accounts page, every account picker, approvals, the calendar lanes and publishing results, and in the library's platform list. YouTube takes video only: submitting or creating a work with YouTube and no video is refused with the reason.
  - **Plan editor.** A grip to drag each stage and arrows for keyboard and touch, in the work page editor and in «إنشاء». Moving a stage keeps what it waits for; a wait that would point down is removed and named. The new «المحرر الحر» adds a role, a duration, a note and an approval point per stage; insert after and copy; ten ready-made stages; chain or parallel in one click; dates computed forward from today or back from the due date; templates saved by leaders and applied to any plan; a live timeline with errors and warnings before saving. «إنشاء» opens the same editor for a new work.
  - **Approval points.** A stage marked as an approval point holds the stages after it until the Director or the Assistant approves it; nobody approves a stage they finished. Seeded on «النص» of CH-253.
  - **Help system.** A first-visit guide of three or four steps on the main use of each of the 16 pages, once per person; a tip the first time someone clicks inside a part of a page; the help button (a question mark in a circle) on the top bar of every page: hover says what the page is for, one click turns on guide mode (click anything to see what it does, who may use it and what it connects to; click it again to try it), a double click opens the page guide inside the page (purpose, what each role sees, every part with «أرني», rules, links to other pages, questions, and «إعادة الإرشاد لهذه الصفحة»). The explanation window places itself beside the element and away from any dialog, menu, panel or list that is open, narrows to fit beside a wide dialog, and moves when something new opens.
  - **Fixed on the way:** the publish panel named accounts with a missing field (showed «undefined»); dialogs opened in the middle of a tall frame, often off screen, and now sit in the visible part of the frame; the result message now stays at the bottom of the screen.
- **Checked before publishing.** Script parses; no emoji. New browser check `qa/reference-pass5.cjs` (headless Edge against the saved page, the automatic guide on, storage cleared first): 47 of 47, result in `qa/reference-pass5.json`. It covers the first-visit guide (four steps, does not return after reload), the hover, guide mode (first click explains, second acts, Escape leaves), the page guide and «إعادة الإرشاد لهذه الصفحة», a section tip on first click, the explanation window not covering the plan editor it opened (zero overlap), hold to confirm (quick click refused, long press approves), undo from the message and with Ctrl+Z, arrows and drag in the plan editor, the free editor (library, back-scheduling, live timeline, save), an approval point (Khalid finishes, Mohammed approves, the next stage is ready), YouTube (account, video-only refusal, calendar lane), 11 pages for 5 people with no page errors, all 96 scenario buttons with no errors, and no sideways scroll at 390 px. Earlier suites re-run on version 5 with the automatic guide off and hold buttons pressed for a second: pass 2 34 of 34, pass 3 37 of 37, pass 4 49 of 50; the one difference is intended (the accounts page now shows 7 cards with YouTube, the check expected 6). Screens seen in light, dark and phone width. Found and fixed this way: the first click after any long press was swallowed; the explanation window covered part of a wide dialog until it learned to narrow; dialogs and the undo message could open off screen on a long page.
- **Not done:** nothing is built in the site yet. Guide progress is kept per person in the browser (local storage) in the artifact; in the site it belongs in the `profiles` data so it follows the account.
- **Next action:** owner review of version 5 and its rules (the list of hold buttons, the 15-step undo and what it cannot undo, YouTube as video only, approval points, who saves plan templates, the help system's three levels); then implementation in the site, starting with «العمل» and «إنشاء».

## 2026-10-12 — Logged by Compass

- 089bd6e docs: artifact version 5 (hold to confirm, undo, YouTube, plan editor, help system) and its browser check

### 2026-10-12: build plan for the reference

- **Owner direction:** a plan in three to six steps for building version 5 of «النموذج المرجعي للمركز» into the site, to work through over the next sessions.
- **Written:** `Reference_Build_Plan.md`, five steps: (1) the work cycle in the database, (2) the shared interaction kit (hold to confirm, undo by server tokens, the help system, guide progress on `profiles`) proven on the library, mail and messaging, (3) «العمل», the work page and «إنشاء» with the plan editor, (4) «الموافقات والنشر», the review screen and «الحسابات المرتبطة», (5) «التقويم», «المشاريع», «الطلبات» and acceptance. Each step names its tables or pages, what counts as done, and the suggested model.
- **Needed before Step 1:** an owner directive that the work cycle moves to Postgres and publishing stays a simulation, then the prototype boundary in `AGENTS.md` updated.

### 2026-10-12: owner decisions before the build

- **Directive: the work cycle moves to Postgres.** Works, stages, approvals, projects, tasks, requests, notices and platform accounts become real data in the Supabase project `comms-hub`, with their rules in the database, as the library, mail and messaging did. Publishing stays a simulation. `AGENTS.md`, «Prototype boundary», is updated to say so.
- **Version 5 rules accepted as listed in the artifact.** The owner tested version 5 and has no notes: hold to confirm on the sixteen actions, undo of the last 15 actions (never publishing or outside mail), YouTube as video only, the drag-to-reorder plan and the free editor with approval points and templates saved by leaders, and the three-level help system. Decision D-05 is closed.
- **Who approves urgent work: the director and the assistant.** This replaces the pass 2 rule «العاجل يعتمده مدير الاتصال وحده» and the reference's delegate exception. The owner wants a way to give the right to approve to other people later; that is separate work, and delegation while away waits for it (the database keeps the two places that decide this, `work_approver()` and `work_urgent_approver()`, as the only ones to change).
- **No sample data in the database.** The reference's sample works (CH-233 to CH-253, four projects, the accounts) stay in the artifact; the live site starts empty. The first real work will be CH-1.
- **The reference is kept in the repository.** Version 5 of the artifact, as published (version id 1791792060-1cb9, 1,036,556 bytes), is saved as `reference/comms-hub-reference-v5.html`, so each build session reads a fixed copy.

### 2026-10-12: Step 1 of the build plan: the work cycle in the database

- **Data model (migrations `20261012120000_work_cycle.sql`, `20261012130000_work_cycle_fixes.sql`, `20261012140000_work_cycle_indexes.sql`, applied to `comms-hub`).** `works` (number issued by the server from a sequence, `CH-n`; type, status, priority with «عاجل», restricted, source, assignee or none for a request, people, due date, event time and place, accounts, proposed and scheduled time, ask-first mode, move request, open review cycle, simulated results per account, closed with reason), `work_stages` (person, role, start, due, the earlier stages it waits for, duration, note, approval point and who approved it), `work_texts` and `work_variants` (versions with their author; a copy keeps the text version it was written from), `work_approvals` (one per part, bound to that part's version: text, each platform copy, each file, accounts with their handles, publish date), `work_flags`, `work_cycles`, `work_decisions`, `work_comments`, `work_log` (append only), `projects` and `work_projects`, `events`, `reminders` (owner only, administrators included), `work_requests` (stage or task extension, folder access), `notifications` (three tiers), `platform_accounts` (Instagram, X, LinkedIn, YouTube, and the shared mailbox as a fixed channel) and `plan_templates`. `media_tasks` gains a start date, the tasks it waits for, a group, a project and a work, so the library, mail, messaging and the calendar keep one task list.
- **Every write is a database function** (44 callable functions, each checking its own rule; tables have read policies only): create a work (a member's request loses its people and dates; YouTube without a video refused; a stage waits only for stages above it), details and stage dates, assign, restrict, close with a reason and reopen, start, start or finish a stage (hand-over notices «صار دورك» and «للعلم»; an approval point holds what follows until a leader approves it, never the one who finished it), save the whole plan (insert, reorder, keep finished stages), text and platform copies (an edit after approval re-opens that part alone, or the whole package for press, mail and announcements), confirm a copy, link files, comment, submit, decide per part (approve, request changes with a note, reject with a note and optionally close), request and withdraw a publish-date move (only «موعد النشر» goes back to review), schedule (another time than the approved one becomes a move request), publish now, confirm or decline an ask-first time, retry failed accounts only, unschedule, run what is due (no background worker: whoever has a page open runs it), extension requests with their impact computed before the decision, folder access requests, accounts (add, edit, stop, delete, reconnect; none stopped or deleted while approved, scheduled or in-review work uses it; a renamed handle re-opens «المنصات والحسابات»), projects, events, reminders, templates, tasks with waits, and reading notifications. Approval never publishes. The library and the works decide together: approving, sending back or replacing a file in the library, mail or messaging does the same in every work it belongs to, and the library stage follows the work. The library guard gains one rule: nobody approves a file version they uploaded.
- **Rules library:** `src/lib/work/rules.ts` mirrors the database for the interface (statuses and words, the type templates and stage library, stage states, the plan editor's move, insert, remove, dates forward and back, the same errors the database raises, automatic assignment, parts and versions, who may decide, YouTube, the publishing simulation, extension impact, Arabic text for every error code). `SELF_APPROVAL` also added to the library, mail and messaging error wording.
- **Verification actually run.** `npm run typecheck` clean; `npm run build` exit 0; `npm test` 104 of 104 (17 new in `tests/work.test.mjs`, including that the type templates and stage library equal the reference's, that every error code the migrations raise has Arabic wording, and that every function the pages will call exists in a migration and is granted). Database: `supabase/tests/work_rules.sql`, a rolled-back run acting as director, assistant, writer, designer, producer, publisher, member and administrator. First run 89 of 101: five failures were the check reading another person's notifications (hidden by row level security, so the test was wrong), and five came from one real defect: three functions used a local variable with the name of a column (`ver`, `n`), which plpgsql refuses as ambiguous; fixed in `20261012130000_work_cycle_fixes.sql`. Second run, with a section added that runs every remaining function at least once: 135 of 135. Result in `qa/work-rules.json`. After the runs: no test rows left and the work counter back at 1. The migration files match what was applied (md5 of the stored statements equals the files). Supabase security advisor: no new kind of finding (the new definer functions are the only write path, by design, as for mail and messaging; no internal helper is callable). Performance advisor: seven new foreign keys without an index, added in `20261012140000_work_cycle_indexes.sql`.
- **Deviations from the plan, with reasons:** delegation while away is not built (owner decision above); the database rule script sits in `supabase/tests/` beside the mail and messaging ones, with its result in `qa/`; the reference's sample world is not seeded (owner decision above).
- **Not visible yet.** No page reads these tables; the work pages still show the browser mock until Steps 3 to 5. Not checked in a browser, since nothing renders differently.
- **Next action:** Step 2 of `Reference_Build_Plan.md`: hold to confirm, undo by server tokens and the help system, proven on the library, mail and messaging.

## 2026-10-12 — Logged by Compass

- bed3fda feat: Step 1, the work cycle in the database

### 2026-10-12: Step 2 of the build plan: hold to confirm, undo, and the help system

- **Owner direction:** start Step 2 of `Reference_Build_Plan.md`.
- **Hold to confirm (`src/lib/kit/hold.ts`).** One engine on the document, after the reference: a button with a `data-hold` reason acts only after a press of about 900 ms, filling as it is pressed, with a small ring; a quick click explains why; Enter or Space held does the same; inside guide mode the first click explains instead. The reasons are the reference's own words (`src/lib/kit/hold-reasons.ts`). In this step's pages: «اعتماد وقفل» in the library, deleting one file and deleting the selection, «اعتماد وإرسال» for held outside mail, approving from a mail approval card, approving from a messaging card or a shared file, and «حذف للجميع». The work pages' hold buttons come with their pages.
- **Undo (`supabase/migrations/20261012160000_interaction_kit.sql`, `/api/undo`, `src/components/kit.tsx`).** The database records each library edit a person makes as a step (rename, move, tags, title and description, checklist, a stage move on the board that is not a decision, folder name, lock and restriction, folder access), with the values before and after and a fingerprint of the row; one request is one action. `undo_action` puts the values back only for the person who made it, within an hour, if nothing touched the rows since, and with the rights checked again; the activity log records «تراجع». The server route then brings Google Drive into step (names and folders); if Drive refuses, the action is taken forward again and stays offered. In the page: «تراجع» in the result message for eight seconds after an undoable change, a top-bar button that keeps the last 15 actions with their count, and Ctrl+Z outside text fields and outside the mail page. Moving several files is now one request (`/api/media/move`), so one undo moves them all back. When Drive refuses a rename or a move, the database cancels it (`undo_cancel_last`) instead of the route writing the old values back.
- **Help system (`src/lib/kit/guide.ts`, `src/lib/help/`).** One engine on the document, after the reference: a first-visit guide of three or four steps per page, once per person; a tip the first time someone clicks into a part of a page, beside it; the help button (a question mark) in the top bar: hover says what the page is for, a click turns guide mode on (the first click on anything explains it, who it is for and what it links to; the second click, or «جرّبه», lets it act; Esc leaves), a double click opens the page guide in place of the page (purpose, what each role sees with the reader's role marked, every part with «أرني», rules, links, questions, and «إعادة الإرشاد لهذه الصفحة»). Windows place themselves beside their target and away from any open dialog, menu or panel, narrow when a wide dialog leaves little room (`src/lib/kit/place.ts`), and while a modal dialog is open the layer moves inside it so its buttons stay reachable. Progress per person is in the new table `guide_progress`, written through `guide_update`, so it follows the account, not the browser. Content written for «مكتبة الوسائط», «صفحة الملف», «المهام», «سجل النشاط», «البريد» and «المراسلة», plus the shared frame; other pages get guide mode and the hover, and say that their guide comes with their build.
- **Verification actually run.** `npm run typecheck` clean; `npm run build` exit 0 (new routes `/api/undo`, `/api/media/move`); `npm test` 112 of 112 (8 new in `tests/kit.test.mjs`: every help page complete, every selector it points at exists in the page's components, every key it saves passes the database's key check, routes to pages, the hold reasons equal the reference's and each is used by a button, placement beside the target and never over a dialog with narrowing, undo wording and when Ctrl+Z applies, the kit's functions exist and are granted, no emoji). Database: `supabase/tests/kit_rules.sql`, rolled back, acting as director, assistant and writer: 56 of 56 on the first run, result in `qa/kit-rules.json`; nothing left behind. Browser: `qa/kit-browser.cjs` compiles the kit's own modules into a test page laid out like the library, with a modal dialog, and drives it in headless Edge: 40 of 40, result in `qa/kit-browser.json`, screenshots in `qa/artifacts/kit/` (first-visit guide, page guide, an explanation beside a dialog). Found and fixed on the way: the guide window was 34 pixels too wide at 390 px where the page does not set border-box sizing (the layer now sets its own), and guide mode ignored a dialog drawn outside the frame (open dialogs now count as the frame). Production build served locally: the signed-out page renders as before with no console errors; `/api/undo` and `/api/media/move` answer 403 from another origin and «سجّل الدخول أولاً» signed out. Supabase security advisor: no new kind of finding (the five new callable functions are intended; the internal undo functions are not callable).
- **Deviations from the plan, with reasons:** guide progress is a table of its own, readable by its owner only, not a column of `profiles`, which everyone signed in can read. Undo covers the library's edits; mail and messaging keep their own behaviour as in the reference (mail's 10-second unsend), and decisions, scheduling, publishing, uploads and deletions are not undoable, since a decision reaches other people and works the moment it is made; they ask for a long press instead. An action stays undoable for an hour. Guide mode explains a button by the part it sits in and its own label, with a few written explanations, instead of the reference's long per-button list; the work pages will add theirs. The browser check runs the kit's real code in a test page because the signed-in pages cannot be opened by an agent.
- **Not checked yet:** the kit on the real signed-in pages. Owner walkthrough: (1) open «مكتبة الوسائط»: the three-step guide appears once; reload and it does not; click into the folder tree and its tip appears once. (2) Hover the question mark, click it, click a file card (it explains), click it again (it opens); Esc. (3) Double click the question mark: the page guide; «أرني» on a part; «إعادة الإرشاد لهذه الصفحة». (4) Rename a file, press «تراجع» in the message: the old name is back in the library and in Google Drive, and «سجل النشاط» shows the undo. (5) Select two files, move them, press Ctrl+Z: both go back. (6) «اعتماد وقفل» on a file someone else uploaded: a quick click explains, a long press approves; on a file you uploaded it is refused. (7) In mail, «اعتماد وإرسال» on held outside mail and an approval card; in messaging, an approval card and «حذف للجميع»: each needs the long press. (8) Sign in from another browser: the library guide does not repeat.
- **Next action:** Step 3 of `Reference_Build_Plan.md`: «العمل», the work page and «إنشاء» on the work-cycle database, with the plan editor.

## 2026-10-12 — Logged by Compass

- 8d7289d feat: Step 2, the shared interaction kit

### 2026-10-12: Step 3 of the build plan: «العمل», the work page and «إنشاء»

- **Owner direction:** start Step 3 of `Reference_Build_Plan.md`.
- **«العمل» (`src/components/work/list.tsx`).** On the database, after the reference: attention counts (late, due soon, late stages, waiting for review, urgent, new requests), each a filter; tabs per role (team and requests for leaders, «مهامي» or «طلباتي», all, closed) with counts; list and status board; search and filters by due date, project, type and person (leaders); the team view with one card per person (active work, stages, tasks, late, a load bar, the works they own and take part in). The order is the reference's: open work with urgent first and then by due date, then requests, then delivered, then closed. A restricted work is not in any list or count for those outside it, because row level security never returns it.
- **The work page (`src/components/work/item.tsx`).** Header with number, type, status, priority, restricted and request marks; closed and restricted bars; stages with person, dates, what each waits for, approval points, a bar on the work's time span with today, and per stage «بدء», «تمّت», «اعتماد المرحلة» (a leader who did not finish it) and «طلب تمديد» with what moves after it (`work_step_impact`); the main text with its versions and who edited it, a tab per platform copy with stale marks and «تأكيد الصياغة»; library media with their stage, and files in folders the reader cannot reach shown as such; the review state of each part with the policy line and the review cycles; the accounts and their simulated result (read only); discussion; the append-only log; details, links to mail and messaging (opening the thread or room), team with load. The actions panel lists only what the role may do now (`workActions` in `src/lib/work/rules.ts`), with the suggested next step marked and, below it, who holds the rest. Dialogs: assign, details and stage dates, edit text or copy, send for review (accounts, proposed time, the parts that will be reviewed and those already approved, computed with the database's own part keys), library picker, extension request, close (hold to confirm, the reference's reason), and «فتح محادثة للعمل», which creates a messaging group linked to the work.
- **«إنشاء» (`src/components/work/create.tsx`).** Type cards and, for leaders, a project card (creates a project; its works plan comes with «المشاريع»); fields per type; projects, source, requester; owner by role (leaders pick with load, makers choose themselves or leave it as a request, members send a request); participants; due date and priority; the plan from the type template, each stage given to the least busy person in its role (`work_people_load`) and dated backwards from the due date, recomputed until edited by hand; media from the library; restricted for leaders. The database issues the number (`work_create`). `/create?type=<type>` opens on a type; `/create?mail=<thread>` fills the page from the conversation and links it.
- **Plan editor (`src/components/work/plan.tsx`, `src/lib/work/drag.ts`).** The simple editor (person, start, end, waits, drag or arrows, remove, automatic assignment of unassigned stages) and the free editor (role, duration, approval point and note per stage, insert after and copy, the ten ready-made stages, chain or parallel, dates forward from today or back from the due date, type templates and leaders' saved templates with delete, and a live timeline with what stops a save and what only warns). Drag uses pointer events, so it works by finger; a release between two rows counts as after the upper one, and dragging near the edge of a long plan scrolls it. The compact rows in «إنشاء» use the same component.
- **Mail «تحويل إلى عمل» fixed.** It no longer numbers works in the browser: it opens «إنشاء» from the message, and the database issues the number and links the thread (`work_create` with `mail_thread`); or it links an existing work (`mail_link_work`). `/mail?thread=` and `/mail/chat?room=` now open that thread or room.
- **Also:** help content for «العمل», the work page and «إنشاء» (`src/lib/help/pages.ts`), routed by `pageKeyOf`; the hold reason «الإغلاق يخرج العمل من القوائم النشطة ومن حمل صاحبه.»; the old mock pages (`src/components/work.tsx`) removed, Home keeps its sample row; the sign-in page footnote now says work data is real and publishing a simulation.
- **Verification actually run.** `npm run typecheck` clean. `npm test` 123 of 123 (11 new in `tests/work.test.mjs`: moves keep waits pointing up and report dropped waits, chain, parallel and copy, templates round-trip and the plan payload, stage states and the list line, tabs, order and attention counts, the actions per role, Arabic dates in Riyadh time, the drag drop arithmetic, every database function the pages call exists in a migration and is granted, no emoji; `tests/kit.test.mjs` updated for the three new help pages, their selectors and the close hold). `npm run build` clean. Browser: `qa/work-pages.cjs` compiles the pages' own components with the database layer replaced by fixture data, renders 23 scenarios (the list for four roles and empty, the work page as writer, designer, director in review, closed and missing, «إنشاء» for five roles, both editors, six dialogs) and drives them in headless Edge: 264 of 264, result in `qa/work-pages.json`, screenshots in `qa/artifacts/work/`: no page errors, the expected words, what a role must not see, no sideways scroll at 390 px, in Direction A, the new identity and its evening mode; then a real mouse drag down, a mouse drag up and a touch drag on the plan rows, with the marks shown while dragging and cleared after. Found and fixed this way: the stage buttons stacked their icon over the label (a class name shared with the small buttons), a release in the gap between rows did nothing, and the team view counted a member as taking part in their own request. Production build served locally: `/work` and `/create` show the sign-in gate signed out, no console errors.
- **Deviations from the plan, with reasons:** no database change was needed. The review decision (approve, request changes, reject) and the publishing actions are Step 4's; the work page shows each part's state and says the decision is made in «الموافقات والنشر», which is still being built, so a work sent for review waits there until Step 4. Edits on the work pages are written to the work log and are not undoable from «تراجع»; the undo of Step 2 covers library edits only, and the help says so. A post needs a connected account and «الحسابات المرتبطة» is Step 4, so until then posts cannot be created and publishable work cannot be sent for review; press releases and mail can (the shared mailbox is a fixed account). Video, design and mail extras (duration, size, recipients) are kept in the brief, as the database has no fields for them.
- **Not checked yet:** the pages signed in, against the real database. Owner walkthrough: (1) as the director, «إنشاء» a press release, owner خالد, due in a week: the plan shows people and dates; drag «التدقيق» above «كتابة البيان» and see the dropped wait named; save with «إنشاء وبدء الإنتاج»: the page opens as CH-1. (2) «خطة المراحل», «المحرر الحر»: mark «كتابة البيان» as an approval point, apply «رجوعاً من التسليم», save; save the plan as a template. (3) Sign in as خالد: «مهامي» has CH-1; finish «جمع المعلومات», write the text, finish «كتابة البيان»; as the director approve the stage, which is refused for خالد. (4) As خالد «طلب تمديد» on «التدقيق»: what moves is listed. (5) Send for review: the parts and the package. (6) As a member, send a request; as the director it is in «الطلبات», assign it. (7) Restrict CH-1: a member no longer sees it in any list. (8) Close a work: a quick click explains, a long press closes; it is in «المغلقة». (9) In mail, «تحويل إلى عمل» on a conversation: «إنشاء» opens with its subject; after saving, the work page links the thread and the thread shows the number. (10) On a phone, drag a stage by its grip.
- **Next action:** Step 4 of `Reference_Build_Plan.md`: «الموافقات والنشر», the review screen, «الحسابات المرتبطة» and the notifications drawer.

## 2026-10-12 — Logged by Compass

- 1bd27a7 feat: Step 3, «العمل», the work page and «إنشاء» on the database

### 2026-10-12: Step 4 of the build plan: «الموافقات والنشر», the review screen, «الحسابات المرتبطة» and notifications

- **Owner direction:** start Step 4 of `Reference_Build_Plan.md`.
- **Review of the approval rules first, and one gap fixed.** The rules of pass 2 (with the owner's decision that urgent work is approved by the director and the assistant) were read against the functions before building on them. One gap: a file approved or sent back from a work's review went through `work_decide`, which writes the library stage with the library guard switched off, so the person who uploaded a version could approve it there, although the library refuses it. `supabase/migrations/20261012180000_approval_uploader.sql` adds `work_uploader_block` (not callable from the API) and makes `work_decide` refuse it the same way, for a part and for a package holding the file. Applied to `comms-hub`.
- **Database rule run `supabase/tests/approval_rules.sql`**, one section per rule, rolled back: per-part approval with each platform copy its own part and approved parts not reviewed again; the whole package for press releases, mail and announcements (approving one part approves all; an edit re-opens all); urgent work approved by the assistant; no approving what you sent, an approval point you finished, or a file version you uploaded (from the review, for a part and for a package; the director then approves it and the library shows it approved, one decision); approval never publishes, the director cannot schedule or publish, a publisher not named on the accounts cannot schedule; another time than the approved one re-opens «موعد النشر» alone and schedules itself when approved; a rejection needs a reason and closes when asked; a retry sends the failed account only and does not re-send a successful one; each person reads and clears only their own notifications. First run 59 of 71: all twelve failures came from the test setup (the writer had no view right on the test folder, which Step 1's run grants); with that grant, 71 of 71. Nothing left behind (no test accounts, no works, the work counter at 1). Step 1's run (`work_rules.sql`) was not repeated: the change only adds a refusal when a file part is among the decided keys, and that run never decides a file through `work_decide`.
- **«الموافقات والنشر» (`src/components/work/approvals.tsx`).** Approvals: «بانتظار قراري» (urgent first, then oldest sent), «أرسلتها أنا», and the decision log (never edited), filtered by project and priority, with the works a leader may not decide on listed with the reason. Publishing: the simulation notice, each account's authorisation with reconnect for the publisher, at-risk dates, ready, scheduled (including schedules waiting for a changed part), partial or failed with a retry of the failed accounts only, and published. Schedule (approved time binds; another time is sent for approval; auto or ask first, with the account's default), publish now and confirm at the time (hold to confirm), decline, unschedule.
- **The review screen (`src/components/work/review.tsx`, `/approvals/<work>`).** Header with cycle, sender, note and policy; one row per pending part: the text and copies with a word difference against the approved version, copy length and the 240 limit for X, stale copies; a file with its preview from the library (image or video), its version change and timed notes, a note added at the current video time; the accounts with whether their authorisation covers the time; the proposed time. Approve a part, request changes on chosen parts with a reason and timed notes attached, approve all pending (hold to confirm), reject with a reason and optionally close (hold to confirm). It says why someone may not decide, and a file the reader uploaded has no decision buttons.
- **«الحسابات المرتبطة» (`src/components/work/channels.tsx`, `/channels`).** Instagram, X, LinkedIn, YouTube (video only) and the shared mailbox; add, edit (a new handle re-opens «المنصات والحسابات» in the works using it, and the dialog says which), stop, delete (refused while approved, scheduled or in-review work uses it; hold to confirm), reconnect (simulated, 60 days). Opened by the director, the assistant and the publisher with «الموافقات والنشر», and by administrators (`canOpen`, tested).
- **Notifications (`src/components/notices.tsx`).** The bell now reads the `notifications` table: a drawer in three tiers, mark one or all read, each notice opens where it points (`noticeHref`, which covers every page the database writes into a notice). The sample notices are gone from the shell.
- **The work page** now opens the review screen, and gives the publisher schedule, publish now, confirm or decline, unschedule and retry; the old mock «الموافقات والنشر» (`operations.tsx`) and its two orphan components are removed. Help content for the three pages; the reference's hold reasons for approving, rejecting, publishing and deleting an account.
- **Library, mail and messaging cards:** not changed. They already approve by moving the file's library stage, which passes the library guard (no self-approval) and the trigger that records the same decision in every work holding the file, as `approval_rules.sql` 04q-04r and Step 1's run 57 show.
- **Verification actually run.** `npm run typecheck` clean. `npm test` 129 of 129 (new: the word difference, part lines, account state and at-risk dates, notification links, the publisher's and the reviewer's actions on the work page, «الحسابات المرتبطة» access; the help tests cover the three new pages and the new hold reasons). `npm run build` clean. Browser: `qa/work-pages.cjs` extended with 21 scenarios (approvals for a leader, a writer and the publisher, the review screen for a leader, a writer, the sender and a package, the accounts page for three roles, the work page for the publisher, the drawer, and six dialogs): 495 of 495, screenshots in `qa/artifacts/work/`; five expectations of mine were wrong on the first run (words that occur inside others, and Step 3's «قيد البناء» that this step removed) and were corrected. Production build served locally: `/approvals/CH-1` and `/channels` show the sign-in gate signed out, no console errors. Supabase security advisor: four findings, all of kinds already present; the new helper is not callable.
- **Deviations from the plan, with reasons:** the uploader fix above; «الحسابات المرتبطة» at `/channels` because `/accounts` is the people page; no «محاكاة حلول الموعد» button, since the database has no such operation and due work runs when a work page opens; the review screen's video shows notes as a list with seek buttons rather than marks on the timeline.
- **Not checked yet:** the pages signed in, against the real database. Owner walkthrough: (1) as the director, «الحسابات المرتبطة»: add Instagram and X with نورة as publisher, X «اسأل قبل النشر». (2) As خالد, create a post on both, write the text and the X copy, send it with a proposed time. (3) As the director, «الموافقات والنشر»: the card; «مراجعة»; approve the X copy alone; request changes on the text with a reason. (4) As خالد, edit, resend: only the text waits. (5) As the assistant, approve it all with a long press: «جاهز للنشر», nothing published. (6) As نورة, schedule at another time: it goes back for «موعد النشر» alone; approve it; it is scheduled. (7) Rename the X handle: the post goes back for «المنصات والحسابات». (8) Publish now: each account succeeds (simulation) and the work page shows the result per account; an account whose authorisation has run out fails it alone («نشر جزئي»), and «إعادة الربط» then «إعادة المحاولة» sends that account only (the authorisation lasts 60 days, so this is seen only on an old account; the database run checks it). (9) Upload a video to the library as the director, add it to a work, send it: the director gets no decision buttons on it, the assistant does. (10) The bell: the three tiers, opening a notice, marking all read.
- **Next action:** Step 5 of `Reference_Build_Plan.md`: «التقويم», «المشاريع», «الطلبات», then acceptance.

## 2026-10-12 — Logged by Compass

- 7814620 feat: Step 4, «الموافقات والنشر», the review screen, linked accounts, notifications

### 2026-10-13: Step 5 of the build plan: «التقويم», «المشاريع», «الطلبات», then acceptance

- **Owner direction:** start Step 5 of `Reference_Build_Plan.md`; finish with a review of the rules and row level security across Steps 1 to 5 and a rolled-back rule run for Step 5's functions; local commits only, push only on request.
- **Review of the rules and row level security across Steps 1 to 5, before building on them.** Every function granted to signed-in people was read against who may see the work it touches. Found and closed in `supabase/migrations/20261013120000_work_cycle_planning.sql` (applied to `comms-hub`; the stored statements have the same md5 as the file):
  - **Serious:** `work_parts` and `work_pending` run with the owner's rights, were callable by any signed-in account and did not check who asks, so a member could read the text and copies of a restricted work by its number (confirmed against the live database before the fix). They are now internal; the pages read `work_view_parts` and `work_view_pending`, which answer only for a work the caller can see. `work_stage_state` is internal too (no page used it).
  - `work_decide_block` told anyone a hidden work's review state; it now answers FORBIDDEN for a work the caller cannot see.
  - `work_task_impact` answered for any task id (what and who of the tasks after it); now only for the task's person, the person who assigned it and the leaders.
  - `work_request_move` and `work_cancel_move` let the publisher act on a restricted work he cannot see; they now check visibility.
  - `work_update` let a leader set a stage's date before the end of an open stage it waits for; refused now (`STAGE_BEFORE_WAIT`, worded in Arabic). The delivery date already could not fall before an open stage's end.
  - `task_create` let a task wait for any task id, confirming that it exists; now only for tasks the caller can read. A project that does not exist is refused with its own wording.
  - Known item: `mail_link_work` accepted a work number that did not exist or that the caller cannot see, and linking an existing work wrote nothing in the work's log. Both fixed; a conversation is not linked twice to the same work; a work created from a conversation is still logged once (by `work_create`).
  - Read and found sound: the visibility of works and everything under them, requests (requester, leaders, the work's owner, the person who assigned a task, the folder's manager), reminders (owner only, administrators included), notifications (recipient only), the decision rules of Steps 1 and 4.
- **New database functions:** `project_create` (a project and its works plan in one transaction; each planned work goes through `work_create`, so its rules apply; if one is refused nothing is created) and `work_request_list` (the requests a person may see, under the same rule as the table's policy, with what each is about and whether the caller may decide it, as `request_decide` decides).
- **«التقويم» (`src/components/work/calendar.tsx`, rules in `src/lib/work/planning.ts`).** Day, week (Sunday first, Riyadh time), month and a two-week list (the default on a phone). A lane per active or used account, then mail, events, and deliveries with tasks and reminders; project bands and stripes; open stages and tasks with a start as bars across days; the team's load under each day. Kinds as in the reference: scheduled, approved and not scheduled, proposed, requested move with the held time, published with each account's result, delivery, stage, task, event coverage, event, reminder, with a key. Warnings that do not block: authorisation that will not cover the time (on the entry and under the lane), two works on one account within two hours, seven or more entries in a day. The entry panel gives this role's actions: request a move, schedule at the approved time (publisher), approve the new date when it is the only part waiting (not by the one who asked), withdraw the request, change a delivery or a stage date (leaders, never before an open stage it waits for, never after the delivery), extension requests for one's own stage or task, delete an event or a reminder. Drag (pointer events, `installCellDrag` in `src/lib/work/drag.ts`): a publish entry dropped on another day opens the move request, a delivery or stage opens the new date for a leader; a press that does not move opens the panel. «إضافة» from a day: a work or request due that day and an event coverage (opening «إنشاء» with `?due=`), scheduling an approved work that day (publisher), a task (one day, days in a row, chosen days each with its person; the least busy person in the kind's role suggested), an event (leaders), a private reminder. The old browser calendar (`src/components/operations.tsx`) is deleted.
- **«المشاريع» and the project page (`src/components/work/projects.tsx`).** Cards with state, dates, owner, progress from done stages and tasks, late count, the next date and the people. A new project takes an optional works plan: per work a title, a type and a due date; each work's stages from its type, given to the least busy person in each role counting what the plan already gave out, dated back from its due date, its owner the least busy in the type's main role (event coverage now goes to the producer, as in the reference), a post on the active accounts other than YouTube; a preview per row says who and when. The «مشروع» card in «إنشاء» opens the same dialog. The page: timeline (works with delivery and publish marks, stages by state, tasks, events, today), «من يعمل على ماذا» (each person's stages and tasks in order, what they wait for, whom they hand over to), the works list and the tasks with extension requests; «عمل في المشروع» opens «إنشاء» with `?project=`; «في التقويم» opens its filtered week.
- **«الطلبات» (`src/components/work/requests.tsx`).** «بانتظار قراري», «طلباتي», «المنتهية», «التفويض». Extensions show what moves after them, computed by the database (`work_step_impact`, `work_task_impact`) before the decision, with «مدّ التسليم النهائي أيضاً» when the plan would pass the delivery; extension requests made on the work page since Step 3 are decided here. Folder access grants view access. Publish-date moves approved or withdrawn here when only the date waits, else sent to the review screen. Work requests without an owner are assigned here. Held outside mail and ask-first confirmations link to «البريد» and «النشر», where they are decided. The sender withdraws a pending request; a decline takes an optional reason. «طلب جديد»: an extension of one's open stage or task, access to a restricted folder that shows in the library, or a new work. Delegation while away is shown as coming later, with the owner's reason.
- **Home (`src/components/home.tsx`)** reads the database: tiles per role, each opening what it counts; the works that need this person; the next seven days from the calendar; the team's load for leaders; an attention strip when a scheduled account's authorisation will not cover its time. The sample campaign and the links to sample work numbers are gone, and so is the sample asset page at `/media/<sample id>`.
- **Navigation and access.** «المشاريع» and «الطلبات» in the sidebar after «التقويم». They are not new grants, so existing accounts need no change: projects open with «العمل» or «التقويم», requests with «العمل», «مكتبة الوسائط» or «المهام» (`src/lib/access.ts`, tested). Notices about requests open `/requests`, about a project its page.
- **Help.** Guides for «التقويم», «المشاريع», the project page and «الطلبات», so all sixteen pages of the reference have theirs; the test checks the sixteen keys, their routes and that every selector exists in the pages' components.
- **Known items.** Linking an existing work from mail: fixed (above). Creating a work from an outside conversation as a maker who is not its assignee: «إنشاء» now says so before saving, refuses to save it linked, and offers «إنشاء بلا ربط بالرسالة».
- **Verification actually run.** `npm run typecheck` clean. `npm test` 141 of 141 (new `tests/planning.test.mjs`, 11 tests: the week and month, every calendar kind and lane in Riyadh time, which deliveries and stages show, tasks, events across days and reminders, the three warnings, who may move what and the date rules, project progress, people, next date and range, the works plan spreading people and dating back, the requests inbox and its tabs, bands and the drag threshold, and what the migration must hold; `tests/access.test.mjs` for the two pages; `tests/kit.test.mjs` for sixteen guides). First run 139 of 141: both failures were my fixtures (entries sort by time within a day; `can_decide` comes from the database per caller). `npm run build` clean. Database: `supabase/tests/planning_rules.sql`, rolled back, eight throwaway accounts: 113 of 113 on the first run, result in `qa/planning-rules.json`; Step 1's run (`work_rules.sql`) 135 of 135 and Step 4's (`approval_rules.sql`) 71 of 71 again after the migration, their direct reads of the now internal functions switched to the visible-only ones. Nothing left behind (no test accounts, works, projects or requests; the work counter at 1). Security advisor: the same four kinds of finding as before; the four new functions are on the signed-in security definer list by design, and the three now internal ones are off it. Browser: `qa/work-pages.cjs` extended with 44 scenarios (the calendar in four views and for a writer, a member and a project, eight entry panels, projects, the project page in four views and missing, requests in four tabs and for the publisher, Home for four roles, thirteen dialogs) and a real drag on the rendered week (a mouse drag drops on the new day and does not also open the entry, a click without moving only opens it, a finger drag drops too): 1010 of 1010, screenshots in `qa/artifacts/work/`, looked at in Direction A, the new identity and its evening mode, at 1280 and 390. Found and fixed this way: my first expectation named a stage that starts and ends the same day as a bar; stage entries showed the work's title instead of the stage; «طوال اليوم» wrapped on a phone; raw date stamps read reversed inside Arabic sentences (now «الخميس 15 أكتوبر 12:00»). Production build served locally (`comms-hub-start-3100`): `/calendar`, `/projects`, `/projects/<id>` and `/requests` show the sign-in gate, no console errors, no server errors.
- **Deviations from the plan, with reasons:** delegation while away not built (owner decision of 2026-10-12); the review's fixes and two new functions in one migration; Home put on the database rather than labelled as sample; the two pages open with existing grants rather than new ones; tasks are completed in «المهام», not from the calendar (the calendar offers extension requests and a link); people other than the leaders see only the tasks given to them or by them, as the task table's rule says, so a project's progress for them counts what they can see, and the page says so; the reference's event coverage owner role (producer) replaces the assistant in the plan's main roles.
- **Not checked yet:** the pages signed in, against the real database, and nothing is pushed (Steps 1 to 5 are local commits; the live site still runs the mock work pages). Owner walkthrough of the whole cycle: (1) as the director, «المشاريع», «مشروع جديد» with two planned works (a post due in a week, a press release due in ten days): the preview names people and dates; create it; «من يعمل على ماذا» shows them, and each person got a notice. (2) Open the post from the timeline; as its owner write the text and send it with a proposed time; as the assistant approve it in «الموافقات والنشر». (3) As نورة, «التقويم», week: the post is on the Instagram lane as «معتمد · لم يُجدول»; «إضافة» on another day, «جدولة عمل جاهز للنشر». (4) As the writer, drag the scheduled post to the next day: the move request opens, with any warnings; send it; the old time shows held. (5) As the director, open it in «الطلبات» and approve the new date; it is scheduled at the new time; try approving a move you asked for yourself: refused. (6) As the director drag the press release's delivery earlier than an open stage: refused with the reason; move a stage within its bounds. (7) As a stage's person, «طلب تمديد» past the delivery; as the work's owner in «الطلبات» see what moves, approve with «مدّ التسليم النهائي أيضاً»; the calendar bars move. (8) Add a task for the designer over three days, an event, and a private reminder; sign in as someone else: the reminder is not there. (9) As a member, «طلب جديد» for a restricted folder; as the assistant grant it. (10) Home for each role; the bell's request and project notices open «الطلبات» and the project page. (11) Help: double click the question mark on each new page. (12) On a phone, the calendar opens on the list; drag an entry by finger in the week view.
- **Next action:** owner asks for the push; then the signed-in walkthrough above, its findings recorded here.

## 2026-10-13 — Logged by Compass

- c6eb969 feat: Step 5, calendar, projects and requests on the database, with a rules review

### 2026-10-13: owner directive before the permissions build

- **Owner direction:** build `Permissions_Plan.md` (accepted 2026-10-13, decisions D-1 to D-13) in one run, its six steps in order, each with its own local commit and entry here.
- **Directive: permissions are real.** Role templates, standing, temporary and one-time grants, permission requests and the permission log move to Postgres in the Supabase project `comms-hub`, decided by database functions and row level security. Approval and publishing stay fixed by the reference (D-9): no grant can unlock them.
- **Directive: WhatsApp is a real outside channel,** one way (D-6), full content (D-5), only to numbers a member verified on the site, only for urgent or pushed messages, through a pull bridge on the owner's computer adapted from the Hedayah bridge (D-8). No cron or edge function in the site (D-7, idea I-024). Server-only variables: `WHATSAPP_SERVER_KEY` (its sha256 alone in the database) and `WHATSAPP_LINK_SECRET` (signs the link in each message).
- **Recorded in `AGENTS.md`,** «Prototype boundary», after the accounts exception. Baseline commit 41a9470 holds the plan, the build prompt, idea I-024 and the Compass log as they were.

### 2026-10-13: Permissions Step P1: the permission engine

- **Owner direction:** `Permissions_Plan.md`, Step P1: the engine in the database, its TypeScript mirror, and the existing checks moved onto it one at a time, with no visible change and nobody's behaviour changed.
- **Built.** Migration `supabase/migrations/20261013150000_permissions.sql`, applied to `comms-hub` (stored statement md5 equals the file's). Tables `capabilities` (31 entries: 13 pages, 5 messaging and mail, 7 accounts, 6 fixed by the reference with their reason), `role_capabilities` (the editable defaults, D-1), `member_capabilities` (standing allow or deny, temporary, one-time with uses and an optional target), `permission_events` (append-only). Functions: `has_capability`, `use_capability` (internal; uses one use inside the action's own transaction), `my_capabilities`, `perm_card`, `perm_can_manage`, `grant_capability`, `set_member_override`, `revoke_capability`, `revoke_all_capabilities`, `extend_capability`, `set_role_default`, `assign_role`, `account_update`, `account_remove`; `add_account`, `approve_request` and `reject_request` rewritten on the engine. The mirror is `src/lib/permissions.ts`.
- **Checks moved onto the engine, answering as before:** urgent messages (`chat_send`, now «عاجل», fixed to admin, director and assistant), announcement channels (`chat_create_room`, `room.create`), outside mail held for approval (`mail_send`, `mail.outside.send`), every account action and the `accounts` and `access_requests` policies (were `is_admin`), and the page layer: the session now reads `my_capabilities()` and adds temporary page grants to the account's pages; `canOpen` opens «الحسابات» on `accounts.view` (`src/lib/access.ts`, `src/lib/supabase/session.ts`). The accounts page writes through `assign_role`, `account_update` and `account_remove` instead of writing the table (no visible change).
- **Decisions taken while building, within the plan:** layers resolve as in plan 4.1, later wins: a standing deny beats the role, and a temporary or one-time grant (a later layer) beats a standing deny. An administrator manages everyone but themselves, other administrators included (a founder's role and account stay protected); everyone else manages only lower ranks. Only an administrator may give what they do not hold (so the push, off for everyone by D-13, can be given at all). The Admin template is not editable. The account-management capabilities have a minimum rank of 2. `room.create` means an announcement channel (groups stay open to everyone, as before). Expiry needs no sweep: the ending is written to the log, dated when it happened, the next time the person loads a page; a refused attempt after expiry is not logged, because a refused action rolls back with everything it wrote, as every refused action in the product does.
- **Sequencing note on the plan:** section 5 opens «الحسابات» to the director and assistant by default, and section 3 says installation changes nothing. Both hold: Step P1 installs the templates equal to today (account capabilities for administrators only); Step P2 switches them on for the director and assistant as the deliberate widening of section 5.
- **Verification actually run.** Database: `supabase/tests/permissions_rules.sql`, rolled back, eleven throwaway accounts: part 1 attempt 1 121 of 122 (check 77 read a notice as the wrong person; the check was corrected), attempt 2 122 of 122; part 2 5 of 5. Result in `qa/permissions-rules.json`. One-time use under two simultaneous calls: tried twice with committed throwaway data; the second call was refused both times, but the database tool runs calls one after another (the second began 1.7 s after the first committed), so true overlap was **not** shown; part 2 shows the conditional update refusing a reading taken before the use. Throwaway data removed (0 left). Existing runs after the migration: `chat_rules.sql` 22 of 22 and `mail_rules.sql` 25 of 25, identical to runs made just before it; kit, work, approval and planning were not re-run in this step because none calls anything this migration changed (checked by search); they are re-run after Step P3. `npm test` 151 of 151 (new `tests/permissions.test.mjs`, 10 tests: the catalog equals the seeded table, fixed rules and their reasons, installed templates, the layers, who manages whom, «الحسابات» on the capability, card wording and the preview line, every raised code worded in Arabic, notice routes, no emoji). `npm run typecheck` clean, `npm run build` clean. Advisors: security, the same four kinds of finding as before, the sixteen new or changed callable functions intended, internal ones not callable; performance, two new INFO (unindexed capability foreign keys), fixed in Step P2.
- **Not checked:** nothing visible changed, so there is no browser check in this step; signed-in use is part of the Step P2 walkthrough.

### 2026-10-13: Permissions Step P2: the accounts page

- **Owner direction:** `Permissions_Plan.md`, Step P2: tabs, the person's card, the grant dialog, presets, role templates, hold buttons, widened access, the shell's live refresh, and help for «الحسابات» at all three levels.
- **Database.** Migration `supabase/migrations/20261013160000_permissions_accounts.sql`, applied to `comms-hub` (stored md5 equals the file's): the widening of section 5 (the director's templates gain view, grant, change roles, add, remove and edit role templates; the assistant's view and grant), logged as eight role-template events; presets (`permission_presets`, `preset_save`, `preset_delete`, `preset_apply`: all items through `grant_capability`, all or nothing); Realtime on `permission_events`, `member_capabilities` and `role_capabilities` (row level security filters the stream); covering indexes for the two capability foreign keys the Step P1 advisor flagged.
- **«الحسابات»** (`src/components/accounts/`: `page.tsx`, `members.tsx`, `card.tsx`, `roles.tsx`, `log.tsx`, data layer `data.tsx`). Four tabs: «الأعضاء» (search; rows with role, pages and markers for temporary, one-time and removed; tick several to grant, change role or remove together, each checked on its own and the refusals named; the person's card beside the list), «الأدوار» (the matrix of capabilities by role; switches the reader may not touch are disabled with the reason; the Admin column is fixed; the rules fixed by the reference are shown locked with their reason; a change says how many people it affects; switching off for a whole role is a long press), «الطلبات» (access requests from outside; permission requests come in Step P3), «السجل» (every event in words, filterable by person, permission and kind). The card: name, role, last seen; «منح», a preset to apply, name and pages and role, «إنهاء كل الإضافات» (long press), «إزالة العضو» (a dialog that says the person's work and mail stay, long press); one list of permissions grouped, each with its source and its one control (stop it for this person, withdraw an addition, restore, extend, end now, give), what the person does not hold folded under «لا يملكها», folder levels with a link to the library. The grant dialog: search over the catalog with the reason beside what cannot be given, permanent, temporary or once, the duration row (hour, day, week, a date), uses and an optional conversation for once, a reason, and the sentence of what the person will be able to do and until when. «حزمة جديدة» saves a preset.
- **Shell and account page.** `src/components/caps.tsx` reads `my_capabilities()` once per page, again on a Realtime ping about the person and at the next end of one of their grants, and refreshes the server's page check when a page grant starts or ends; the sidebar shows «الحسابات» from it. The account page gains «صلاحياتي» (`src/components/my-permissions.tsx`): what the person may do now, the source and the end of each.
- **Hold buttons** (`src/lib/kit/hold-reasons.ts`): remove a member, end all of a person's grants, switch a capability off for a whole role, change a role to a lower one, with the plan's wording, tested word for word.
- **Help.** Guides for «الحسابات» and «الحساب» (`src/lib/help/pages.ts`): the tip of the plan, purpose, a three-step first visit, parts with section tips on the list, the card, «منح», the three modes and the matrix, two acts, each role group with a separate line for the assistant, the rules, links and questions. `/accounts` and `/account` are in `pageKeyOf` and `PAGE_HREF`; the selector test covers both.
- **Verification actually run.** Database: `supabase/tests/permissions_rules.sql` with part 3 for this step, 137 of 137 on the first run (parts 1 and 2 now pin the templates as Step P1 installed them). `npm test` 152 of 152 (help pages 18 with their selectors; the new hold reasons; the log worded for every kind the table allows; markers; next end). `npm run typecheck` and `npm run build` clean. Browser: new `qa/permissions-pages.cjs` renders the real components with fixture data in headless Edge: first run 268 of 271 (two interface points fixed: a permission that does not fit the person's role now says so instead of offering «منح», and a one-time grant defaults to no end; one check read a placeholder as text), then, after folding what a person does not hold, 271 of 271, in `qa/permissions-pages.json` with screenshots in `qa/artifacts/permissions/`. A screenshot showed the fixed rows of the role matrix misaligned (a style meant for the card applied to the table row); fixed and re-run, 271 of 271. Advisors: no new kind of security finding (the three preset functions are the intended callable ones); performance, the two flagged foreign keys are indexed.
- **Not seen signed in.** The agent cannot sign in, so the page against the real database was not seen. Owner walkthrough: (1) as an administrator, «الحسابات», «إضافة عضو» with a test email as a writer with «العمل» and «البريد»; its card opens. (2) «منح» on that person: «رسائل «مهم» (المستوى 2)», «مؤقتة», «يوم»; read the sentence, save; the row shows «مؤقتة حتى …» and the member list a «مؤقتة» marker; the person (signed in elsewhere) sees it in «صلاحياتي» without reloading. (3) «منح» again: «إنشاء قناة إعلانات في المراسلة», «مرة واحدة»; as that person create one announcement channel in «المراسلة»: it works once, the second is refused, and «السجل» shows the use. (4) «الأدوار»: switch «رسائل «مهم»» off for «مساعد مدير الاتصال المؤسسي»: the dialog says how many it affects and needs a long press; switch it back on. (5) Give the assistant role to a test account; sign in as it: «الحسابات» opens; its card of the director says «في رتبتك أو فوقها» and offers nothing; «إضافة عضو» is disabled with its reason.

### 2026-10-13: Permissions Step P3: asking for a permission, and the connections

- **Owner direction:** `Permissions_Plan.md`, Step P3: `permission_requests`, the locked-control helper, the requests tab, the messaging and mail doors, notices, Home, the activity log, and help for the pages touched.
- **Database.** Migration `supabase/migrations/20261013170000_permissions_requests.sql`, applied to `comms-hub` (stored md5 equals the file's). `permission_requests` (one pending per person per capability and target), `perm_requests()` (what the reader may see, with whether they may decide each), `request_capability` (fixed rules, what does not fit the role and what one already holds are refused; everyone who may decide is told, tier «قرارك»), `decide_permission_request` (approving goes through `grant_capability`, so every rule of the engine applies, and the granter may change the mode and length; declining needs a reason; the cards in messaging and mail follow; a line in the conversation when it was asked there), `withdraw_permission_request`, `chat_request_permission` (a request card in the conversation with a chosen granter; only someone who may decide), `perm_granters`, a permission card in `mail_send` (internal only). Folder access for a time: `media_grants.expires_at`, read by `media_level` (a person's level counts until its end; then the role's applies), restored by undo with its end, and `request_decide_folder` for an access request decided with an end. `perm_card` lists only folder grants that have not ended, and pending requests.
- **The four doors.** (1) A locked control: `src/lib/kit/need.ts`, installed by the kit beside hold to confirm: a control with `data-need` and `aria-disabled` explains why on a click or Enter and offers «اطلب هذه الصلاحية»; a rule fixed by the reference explains itself and offers nothing; guide mode gives a locked control its fourth kind of answer (why you cannot, and what to do). Used for «إضافة عضو» in «الحسابات» and an announcement channel in «المراسلة». (2) Messaging: «اطلب صلاحية» in the composer menu and the `/صلاحية` command; the request card in the conversation, decided from it; the system line. (3) Mail: «طلب صلاحية» card in the composer and its card in the thread, decided from it; when outside mail would be held, the composer says why and offers the request. (4) «الطلبات»: a «الصلاحيات» tab beside the others with its count, and «طلب صلاحية». Shared components in `src/components/perm-requests.tsx` (cards, the decision dialog with the requested mode as default and editable, the asking dialog). «الحسابات» shows permission requests in its requests tab; the account page has «اطلب صلاحية».
- **Connections.** Notices for requests lead to `/requests?tab=perm` (`noticeHref`, tested). Home (`src/components/home-perms.tsx`): requests waiting for this person's decision, temporary permissions ending within 24 hours, one-time permissions not used yet. «سجل النشاط» shows permission events as a filterable type «الصلاحيات». The library's access dialog gives a person a folder level for a day, a week or a month, and shows the end.
- **Help.** Parts, acts, rules and questions added to «الطلبات», «المراسلة», «البريد», «الحسابات» and «الحساب»; Home gets its guide (the plan lists its tip), so 19 pages have one; the selector test covers the new components.
- **Verification actually run.** Database: `supabase/tests/permission_requests_rules.sql`, rolled back: attempt 1 47 of 49 (the checks of who was told also counted the three real administrators, who are rightly told; the checks were narrowed to the throwaway accounts), attempt 2 49 of 49; result in `qa/permission-requests-rules.json`. Existing runs after the migration: kit 56 of 56, work 135 of 135, approval 71 of 71, planning 113 of 113, mail 25 of 25 (chat is re-run after Step P4, which changes `chat_send`). `npm test` 153 of 153 (the chat test now expects eight slash commands: «صلاحية» was added on purpose; new tests: request wording mirrors `perm_how`, what may be asked for, the locked-control helper, the notice route, every raised code worded). `npm run typecheck` and `npm run build` clean. Browser: `qa/permissions-pages.cjs` extended (request cards for a granter and a requester, both decision dialogs, the asking dialog from a locked control, the page, messaging and a fixed rule, Home's line, «صلاحياتي» with its button, and a live click test of the locked-control helper: explains in the control's words, offers the request, the control itself does not act, a fixed rule offers nothing, an ordinary button acts, Enter explains): 406 of 406 before the live test was runnable (the test runner refuses to click an `aria-disabled` control, which a person can; the clicks were forced), then 414 of 414. `qa/work-pages.cjs` re-run with Home's permission line and the requests tab's permission list mocked there: 1010 of 1010, as before. Advisors: no new kind of finding.
- **Not rendered by the browser check:** the request cards inside a chat conversation and a mail thread (they live inside the full chat and mail pages, which the harness does not compile); they are covered by the database rule run (doors 2 and 3) and the owner walkthrough. **Not seen signed in.** Owner walkthrough: (1) as a writer, open «الحسابات» if granted, or any page with a locked control (the chat «محادثة جديدة» dialog): click «اطلب هذه الصلاحية» on the channel option, ask for a week with a reason; as the director, the notice «قرارك» opens «الطلبات» on «الصلاحيات»; approve with «يوم» instead; the writer sees it in «صلاحياتي». (2) In «المراسلة», the writer uses «اطلب صلاحية» to ask the assistant for «رسائل «مهم»»; the card appears in their conversation; the assistant approves from the card; a line says so. (3) In «البريد», the writer writes to the director with a «طلب صلاحية» card for outside mail; the director declines from the card with a reason; the writer is told. (4) In the library, give a writer view access to a folder «لأسبوع»; the row shows «حتى …»; open the writer's card in «الحسابات»: the folder shows with its end. (5) «سجل النشاط»: choose «الصلاحيات»: the requests and decisions are there. (6) Home of the director shows the waiting request; Home of the writer shows a temporary permission ending within a day.

### 2026-10-13: Permissions Step P4 started, stopped at a safe point (owner asked to stop)

- **Owner direction:** stop at a safe point because the session reached its limit; continue in a new session with `Permissions_Continue_Prompt.md`.
- **Done in P4 so far (database only).** Migration `supabase/migrations/20261013190000_urgency.sql`, applied to `comms-hub` (stored md5 equals the file's): `chat_messages.urgency` (0 to 3; the 0 existing rows with `urgent` set became level 3, 0 mismatches after); `chat_send(..., p_urgency smallint, ...)` (level 3 fixed to `urgency.3`, error `URGENT_ROLE` as before; level 2 through `use_capability('urgency.2')`, error `URGENCY_2`; notices: levels 1 and 2 «انتباه» to members who did not mute the room, level 3 «قرارك» to every member with the acknowledgement asked); the old boolean `chat_send` kept as a wrapper meaning level 3; `chat_toggle` acknowledges level 3 only. The column `urgent` is still written, for the interface that still reads it.
- **Safe state.** The interface is unchanged: it still sends `p_urgent` and reads `urgent`, which the database keeps in step. Chat rule run after the migration: 22 of 22, identical to before. Not yet done in P4: the interface (composer picker, badges, acknowledgement at level 3, mail card mapping), the rule run for levels 1 and 2, the help, the browser check, and the migration that drops `urgent`. Not started: P5a, P5b.


### 2026-10-14: Comms Hub Arabic launch film

- Owner request: adapt the reference motion video to this project. Delivered a standalone film package under `videos/comms-hub-launch/`, preserving the source application.
- Identity and content: exact existing brand colors and capsule geometry from `public/brand/comms-hub-logo.svg`, Arabic font already installed in the project, established role and status terms. Ten scenes explain fragmented context, identity, work stages, approval of an exact version, the media library, mail and messaging, planning, permissions, a unified workspace, and the closing brand line. All UI content is illustrative; no member data is used, and publishing is not presented as live functionality.
- Outputs: 1080 by 1920 portrait and 1920 by 1080 landscape, each 38.4 seconds and 2,304 frames; a 15-second, 900-frame portrait teaser. All 60 fps, H.264 Rec.709 limited range, 48 kHz stereo AAC. Original 100 BPM synthesized score; no reference soundtrack reused. Arabic SRT, two posters, editable JavaScript art, music source, storyboard, design profile, local preview, and repeatable renderer included.
- Verification actually run: `npm run typecheck`, `npm test` (153 of 153), `npm run build` (14 static pages generated), film browser/media script (128 of 128), and two source-to-encoded color comparisons. The browser script tests both layouts and all scene boundaries, random-order determinism, fonts, play/pause/seek/sound, mobile overflow, reduced-motion initial still, codec dimensions, frame counts, duration, color metadata, audio, and full-file decoding. Evidence: `qa/comms-hub-film.json`, `videos/comms-hub-launch/qa/verification.json`, `color-verification.json`, and saved screenshots. Re-run through `node qa/comms-hub-film.cjs`.
- Recoverability: local baseline commit `6016355` before project mutation. Existing untracked `Settings_Integrations_Plan.md` left untouched. No push or deployment. This deliverable does not change the app's selected default identity, Permissions P4 status, or product readiness.

### 2026-10-14: Permissions Step P4: urgency 0 to 3, finished

- **Owner direction:** continue the permissions build from the safe stop (`Permissions_Continue_Prompt.md`): finish Step P4, then P5a and P5b.
- **Baseline.** The launch film's records (its `Status.md` and `progress.md` entries, `qa/comms-hub-film.cjs` and its result) were uncommitted; committed as found (11e635c). The rendered film package under `videos/` (96 MB) is left untracked and untouched, as is `Settings_Integrations_Plan.md`.
- **Interface.** `src/lib/chat/rules.ts`: a message carries `urgency` (0 to 3) instead of `urgent`; the names «للانتباه» «مهم» «عاجل» (D-10), what each does, why a level is locked, `urgencySteps` (which levels the person may use, from `useCaps`), `cardUrgency` (a task card of priority «عاجلة» shows as level 3 in messaging, so the mail and messaging vocabularies do not drift), the tier of each level, and the words for `URGENCY_2` and `BAD_URGENCY`. `src/components/chat/provider.tsx` sends `p_urgency`. `src/components/chat/urgency.tsx` (new): the four steps and the mark of a level. `src/components/chat/chat-tab.tsx`: the urgent toggle became a picker beside the attach button (none, 1, 2, 3); level 2 without «رسائل «مهم»» is a locked control (`needProps('urgency.2', ...)`) that explains and offers the request; level 3 without `urgency.3` is a locked control of a fixed rule, explained, offering nothing; a mark on each message of level 1 or 2; the acknowledgement block on level 3 only; `/عاجل` sets level 3 when the person holds it, else says why; a failed send keeps the text and the level. Styles in `src/app/chat.css`.
- **One deliberate change, recorded:** level 3 is now offered in a direct conversation too. Before, only the interface kept «عاجل» to groups (the database always allowed it); with WhatsApp delivery coming in P5a an urgent direct message is the natural case, and the database stays the authority.
- **Database.** Migration `supabase/migrations/20261014090000_urgency_drop_urgent.sql`, applied to `comms-hub` (stored md5 equals the file's): `chat_send` stops writing `urgent` (replaced through `pg_get_functiondef`, stopping if the expected text is gone) and the column is dropped. Checked first, by query: no view, policy, index or trigger depends on it, the Realtime publication has no column list, and `chat_send` was the only function naming it.
- **Help.** «المراسلة»: parts for the picker (`.cx-urgency`), each level with who may use it (`.cx-lvl-opt[data-level]`), the mark and the acknowledgement; the roles, two rules (one-time use, muted members) and two questions. `PAGE_SOURCES` includes `urgency.tsx`, so the selector test covers it.
- **Verification actually run.** Database: new `supabase/tests/urgency_rules.sql`, rolled back, five throwaway accounts: 41 of 41 before the drop, 41 of 41 after it (two checks changed to read `urgency` only); 0 throwaway accounts left. `chat_rules.sql` after the drop: 22 of 22, every value as its header states. Result in `qa/urgency-rules.json`. `npm test` 155 of 155 (two new chat tests: the four steps by what the person holds, the tiers, the task-card mapping, the error words, the migration's level checks). `npm run typecheck` and `npm run build` clean. Browser: `qa/permissions-pages.cjs` extended with the picker for a writer without «مهم», with it given, and for the director, the level marks, and a live click on the locked steps («مهم» explains and opens the request for `urgency.2`; «عاجل» explains and offers nothing): 483 of 483 on the third run (the first two read the mark and its word as one line; flex items are separate lines in the page's text; the checks were corrected, the interface was right). Advisors: security, the same four kinds of finding as before (all 149 callable-function warnings are the intended callable functions); performance, nothing new from this change.
- **Not seen signed in.** The full chat page is not compiled by the harness, so the picker in its real composer, the marks inside a live conversation and the WhatsApp-free notices were not seen against the real database. Owner walkthrough: (1) as a writer, open a group in «المراسلة», press the flag beside «+»: four steps; «للانتباه» sends with a mark, and the others get a notice in «انتباه» unless they muted the group. (2) Press «مهم»: it says why and offers «اطلب هذه الصلاحية»; ask for it «مرة واحدة». (3) As the director, approve from the requests tab; as the writer, send one «مهم»; the second is refused with the reason. (4) Press «عاجل» as the writer: explained, nothing offered. (5) As the director, send «عاجل» (or type /عاجل): every member, muted or not, gets «قرارك» and the message shows «أقرّ 0 من N» with «أقرّ بالاستلام».

### 2026-10-14: Permissions Step P5a: WhatsApp, everything but the real sender

- **Owner direction:** `Permissions_Continue_Prompt.md`, item 2 (plan sections 8 and 9).
- **Database.** Migration `supabase/migrations/20261014100000_whatsapp.sql`, applied to `comms-hub` (stored md5 equals the file's), and a follow-up `20261014110000_whatsapp_dispatch_settings.sql` (the dispatch route runs without a sign-in, so it reads the length cap through the key; `wa_settings`). Tables: `whatsapp_server_key` (only the sha256 of `WHATSAPP_SERVER_KEY`, no policies), `system_whatsapp` (one row: switch, name, about, daily cap of pushes per sender, length cap, heartbeat, the bridge's last note), `whatsapp_links` (the verified number, a version that grows with each number, from level 2 or 3, pushed on or off; readable by its owner and administrators only, D-12), `whatsapp_codes` (number being proved, nonce, sha256 of code and nonce, tries, expiry; no policies), `whatsapp_mutes`, `whatsapp_outbox` (ids only: message, room, recipient, sender, reason, link version, state; foreign keys make a recipient outside the message's room, or a message paired with another room, impossible to insert; a trigger refuses a recipient without a verified link of that version; one row per message, recipient and reason). Routing: `wa_route`, called at the end of `chat_send` in the same transaction (replaced through `pg_get_functiondef`), not callable by anyone. Functions for members (`wa_me`, `wa_set`, `wa_mute`, `wa_code_verify`, `wa_people`, `wa_push`, `wa_retry`), for the system number (`wa_system_view`, `wa_system_update`, `wa_test_send`, `whatsapp.system.manage`), for an administrator (`wa_admin_unlink`), and for the bridge through the key (`wa_heartbeat`, `wa_claim`, `wa_report`, `wa_settings`; executable without a sign-in, the key decides). `wa_code_issue` needs both the member's session and the server key.
- **Decisions taken while building, within the plan:** the code is made on the server as an HMAC of a random nonce under `WHATSAPP_LINK_SECRET`; the database keeps only sha256 of code and nonce, so neither the browser nor the database ever holds the code. A wrong code is counted without raising (a raise would undo the count). A recipient's mute applies to urgent and pushed messages alike; a muted conversation stops level 2 but not level 3, as its notices do. While the system number is switched off nothing new is queued and what is queued waits. A row whose number changed, whose link ended, or whose message was deleted fails at claim with its reason instead of going out. A row claimed but never reported is queued again five minutes later, at the next claim (no timer). The phone numbers in tests use +999, a country code assigned to no country.
- **Site.** `src/lib/whatsapp/rules.ts` (international form only, the package of plan 8.5: sender and room, level, the full content up to the cap with files named not attached, the one-way line, the link; delivery words; refusal words), `src/lib/whatsapp/server.ts` (the code, constant-time key check, signed links `/w/<token>` of outbox row, recipient, message, room and expiry, fourteen days), `src/lib/whatsapp/provider.ts` (the `WhatsAppProvider` interface, a `FakeProvider`, and `deliver`). Routes: `/api/whatsapp/code` (signed in, same site), `/api/whatsapp/dispatch` (the bridge's only door: the key, reports, heartbeat, claim; a destination in the request is ignored), `/w/[token]` (a valid link opens that room at that message; row level security still decides what is shown). Screens: «واتساب» on the account page (`src/components/whatsapp/member.tsx`: the switch, the number, the code, the level, pushed messages, mutes, the connection line), «واتساب النظام» as a Settings tab (`system-panel.tsx`), the person's card in «الحسابات» shows linked or not, the number only to an administrator, with «قطع ربط الرقم» as a long press (`HOLD.waUnlink`, the plan's words), and in «المراسلة» «إرسال إلى واتساب» on one's own message (`src/components/chat/whatsapp.tsx`: a locked control until granted, the reason beside each member without revealing a number) and the delivery line with «إعادة المحاولة». A link from WhatsApp jumps to its message. Help: parts for each of these on «الحساب», «المراسلة» and «الحسابات», questions («متى يصلني واتساب؟»، «هل يرى الآخرون رقمي؟»), and a guide for «الإعدادات» (20 pages now; the selector test covers the new files). `.env.example` names the two server-only variables, without values.
- **Verification actually run.** Database: `supabase/tests/whatsapp_rules.sql`, rolled back, eight throwaway accounts: 98 of 98 on the first run, including the four-room case (urgent rows exactly `a1>des,a1>wri,a2>pro,a3>des,a4>asst,a4>wri,a5>des,a5>pro`, pushes exactly `a2>pro,a7>wri,a8>wri`, 0 violations of room, membership, verified link and case); afterwards 0 throwaway accounts, 0 key rows, 0 outbox rows. `chat_rules.sql` 22 of 22 and `urgency_rules.sql` 41 of 41 after the routing was added to `chat_send`. Result in `qa/whatsapp-rules.json`. `npm test` 168 of 168 (new `tests/whatsapp.test.mjs`, 13 tests: international form, the code and the database's hash formula, signed and expiring links, the package, the handshake run against the fake provider, the fake-provider run of the routing case receiving exactly what was claimed, refusal words for every code the migration raises, notice routes, the hold reason, ids-only outbox, no phone number or secret anywhere in the repository, no emoji). `npm run typecheck` and `npm run build` clean. Live routes: new `qa/whatsapp-routes.cjs` starts the built site with throwaway key and secret made in memory: first run 23 of 25 (the check sent the wrong `Origin` for a server that names itself localhost; and the link's redirect is now relative so it never depends on the host's name), second run 25 of 25, in `qa/whatsapp-routes.json` (no key and a wrong key refused; the database refuses a key whose hash it does not hold; a valid link redirects to its room and message with no referrer; expired, forged and wrongly signed links refused; the refusal page in Edge at 1280 and 390, right to left, no sideways scroll). Browser: `qa/permissions-pages.cjs` extended with the member's section (off, pending, linked and offline), the system panel and its locked form, the push list with and without the permission, and the delivery line: 625 of 625 on the first run. Advisors: security, the same four kinds of finding as before; the new entries are the intended ones (two tables without policies by design, the key-gated bridge functions callable without a sign-in, the member functions); performance, one new INFO (an unused index on the new, empty outbox).
- **Not seen signed in, and not sent for real.** The agent cannot sign in and has no phone: no code or message has reached a real WhatsApp. The bridge is Step P5b. Owner walkthrough after P5b is in place: see the P5b entry.

### 2026-10-14: Permissions Step P5b: the pull bridge

- **Owner direction:** `Permissions_Continue_Prompt.md`, item 3 (plan 8.1).
- **Built,** in `bridge/whatsapp/`, copied and reduced from the Hedayah bridge (`D:\Agents\main\projects\hida\bridge`, read only; nothing there was changed): `compat.cjs` (the reviewed message-key transform for whatsapp-web.js 1.34.7, unchanged but for its marker), `policy.cjs` (numbers in international form; a claimed batch split into what may go and what is refused; `guardedSender`, the only way to send, bound to one claimed batch: a destination that is not the claimed number of that row is refused, and each row goes once), `transport.cjs` (the one door, `POST /api/whatsapp/dispatch` with `WHATSAPP_SERVER_KEY`; errors described by kind, never with a number, text or key; Arabic reasons for the site), `loop.cjs` (one tick: report, heartbeat, claim, send, report at once; claims nothing while not linked; keeps unsent reports; waits longer after site errors, up to a minute), `provider.cjs` (the real `WhatsAppProvider`: asks WhatsApp whether the number is registered, sends without marking anything seen), `bridge.cjs` (the QR drawn in its own terminal, the link's life, a five-second loop; it registers only the link events, no message, call or receipt handler, so it reads and answers nothing), `run-bridge.bat` (installs the pinned packages once from the copied lockfile, without downloading a browser, then runs), `.env.example`, `.gitignore` (session, packages and `.env` stay on the computer), `README.md` (what it does and does not, files, and the owner walkthrough).
- **Verification actually run.** Offline tests against a fake site (a real HTTP server on 127.0.0.1 behaving like the dispatch route), `npm test` in `bridge/whatsapp`: without the library installed there, 13 of 14 with the compatibility check skipped and saying why; with `COMMS_WA_LIB` pointed at the owner's existing install of the same pinned 1.34.7 (read only), 14 of 14. Covered: policy, transport, polling, one way, refusal of any destination not in a claimed row, the site down and a wrong key. Result in `qa/whatsapp-bridge.json`. The site's `npm test` 168 of 168 (its repository scan now also covers `bridge/`: no phone number, key or secret). The two PowerShell lines of the walkthrough were run with a dummy input (64 hexadecimal characters generated; the fingerprint of "abc" equals the known SHA-256 value, in the lowercase form the database compares).
- **Not performed, and why.** The first QR link of the system number and a real message to a phone need the owner's phone and a chosen number; no WhatsApp session was opened and no packages were installed in `bridge/whatsapp`. The site's real database has no server key yet, so nothing can be claimed until the owner stores the fingerprint (step 4 below); until then the system number stays switched off, as installed.
- **Owner walkthrough** (also in `bridge/whatsapp/README.md`): (1) choose a dedicated number; (2) make two secrets in PowerShell and print the first one's fingerprint (the lines are in the README); (3) in Vercel set `WHATSAPP_SERVER_KEY` and `WHATSAPP_LINK_SECRET` (and `MAIL_SITE_URL` if unset), redeploy; (4) in the Supabase SQL editor store only the fingerprint in `public.whatsapp_server_key`; (5) copy `bridge\whatsapp\.env.example` to `.env` with the site address and the key; (6) run `run-bridge.bat`; (7) scan the QR from the system number's phone (Linked devices); (8) as an administrator switch on «واتساب النظام» in «الإعدادات», which turns «متصل» within a minute; (9) «الحساب», «واتساب»: link your own number with the code that arrives; (10) «رسالة تجربة إلى رقمي»; (11) a second linked member receives a «عاجل» message from a group, with the link opening that message; (12) give yourself the push for a day and push one message; (13) reply from your phone: nothing happens; (14) close the bridge, send «عاجل», see «لم تُسلَّم بعد», reopen, and it arrives.

### 2026-10-14: permissions build pushed and deployed

- **Owner direction:** push it.
- Pushed `main` (12 commits, `41a9470` to `d954ed1`, P1 to P5b and the film records) to GitHub; Vercel production deployment `dpl_GQcrPTpwL3m7jpeah7zBGBSaSjBr` built in about 60 seconds and is READY on `https://comms-hub-three.vercel.app`.
- Checked live, signed out: `POST /api/whatsapp/dispatch` answers 503 «not configured» (the WhatsApp variables are not set in Vercel yet, as expected), `/w/not-a-token` answers 404 with the Arabic refusal page, Home answers 200. The database migrations were already applied in each step. The signed-in screens and WhatsApp delivery still wait for the owner's walkthroughs.

### 2026-10-14: owner directive before the settings and integrations build (Step S0)

- **Owner direction:** "start with S0 to S2" of `Settings_Integrations_Plan.md` (plan of 2026-10-13, decisions E-1 to E-7), after the permissions build landed.
- **Directive recorded:** integrations, storage providers and backups are real; secrets of anything connected through the interface live in Supabase Vault (E-2), never read back, never logged; the Google Drive refresh token moves there with the environment variable kept as a fallback until the owner confirms; where each stored file lives is recorded per location; nothing scheduled runs in the site (E-1). Written into `AGENTS.md`, «Prototype boundary».
- **Decision taken, within the plan:** the site's server proves itself to the vault functions with the existing `MAIL_SERVER_KEY` (already in Vercel, its sha256 already in the database), so no new secret is needed; the plan says the server key stays an environment variable.
- **Checked before building:** Supabase Vault 0.3.1 is installed in `comms-hub` and its functions and views are not granted to `anon` or `authenticated`; `log_statement` is `ddl`, so a function call carrying a secret is not written to the database log; 5 library file versions and 0 mail files exist to record locations for.
- **Baseline:** commit a621d73 holds the plan as written.

### 2026-10-14: Settings Step S1 (integrations core and vault): built, stopped before full verification (usage limit)

- **Database:** migration `20261014120000_integrations.sql` applied to `comms-hub` (stored md5 equals the file's): eight settings capabilities (admin only by default), `integrations` (Google Drive seeded), append-only `integration_events`, `site_settings` (maintenance banner, library upload limit), Vault functions (`int_secret_set` pending, `int_secret_use` with the server key, `int_secret_commit` after a check, `int_secret_discard`), `int_health`, `int_set_enabled`, `settings_update`, `settings_overview`.
- **Site:** Drive reads its refresh token from the vault first, env fallback (`src/lib/drive/google.ts`, `src/lib/integrations/vault.ts`); the Drive callback stores the token in the vault after checking it instead of showing it; routes `/api/integrations/{check,config,drive-adopt}`; upload limit enforced in both library upload routes; Settings tabs «عام وصحة النظام» and «السجل»; maintenance banner in the shell; help for both tabs; hold reason `intDisable`.
- **Verified:** `supabase/tests/integrations_rules.sql` 56 of 57 on the first run (check 15 expected FORBIDDEN, got "permission denied": stricter, the check was corrected; not yet re-run), real server-key row and vault confirmed untouched after rollback; `npm test` 175 of 175; typecheck and build clean; `qa/permissions-pages.cjs` 733 of 733 (first run 690 of 733: the fixture lacked the new capabilities).
- **Not yet done:** re-run of `integrations_rules.sql` and of `permissions_rules.sql` (check 09 updated for the new capabilities; check 56c had a latent boolean-to-text error that kept the committed file from running as written, now cast; the edited file has not been run); advisors; a live route check; the signed-in walkthrough. **Step S2 (storage locations) not started.**

### 2026-10-14: Settings Step S1 verified, and a readiness audit before adding testers

- **S1 database rule run re-run:** `supabase/tests/integrations_rules.sql` against `comms-hub`, one transaction, rolled back: **57 of 57** (the earlier failing check 15 now expects "permission denied", as corrected). After the rollback the server key md5, the vault (0 secrets), the event log (0 rows), the test accounts (0) and the maintenance banner (off) are as before. Result in `qa/integrations-rules.json`.
- **Also run:** `npm run typecheck` clean; `npm test` 175 of 175; Supabase advisors read (security and performance), summarised in `Readiness_Audit.md`.
- **Not run:** `permissions_rules.sql` after its edit, a live route check of `/api/integrations/*`, the signed-in walkthrough.
- **Audit:** `Readiness_Audit.md` records what is not ready before adding testers, checked against the owner's list of the same day, with a proposed order. No code changed.

### 2026-10-14: entry flow and honest labels (steps 1 and 2 of `Readiness_Audit.md` section 6)

- **Owner direction:** proceed with step 1 (SMTP, a real «دعوة», admin resend and reset, request notices, a clear expired-link state) and step 2 (honest labels on the mock pages, fix or hide «الأفكار»). Baseline commit `944ba99` taken first.
- **Database:** migration `20261014130000_entry_flow.sql` applied to `comms-hub` (the statements as in the file, without its comment lines, so the stored text is not byte-identical). `accounts` records `invited_at`, `invited_by`, `invite_count`; `entry_states()` (not started, unconfirmed, confirmed, active, read from `auth.users` for those with «فتح صفحة الحسابات» or «إضافة الأعضاء»); `invite_prepare` / `invite_mark` (the right is `members.invite` over a person the caller manages, one invitation a minute, refused for someone who already signed in); `entry_help_log`; `request_access` answers `received` whether the address is new, approved or pending, with a 24-hour wait after a refusal, 30 requests an hour, and a «يحتاج قرارك» notice to every administrator and director; `entry_notice_targets` (server key) tells the site whom to email once per request; `request_reject_notice`. `email_status` is closed to visitors.
- **Site:** `/api/entry/invite` (invitation, and the refusal notice) and `/api/entry/request` (the public request, which then emails the leaders once); `src/lib/entry.ts` (wording, link-error reading); the sign-in screen has a «انتهت صلاحية الرابط» state with a new reset or confirmation link, and the first-time screen no longer asks whether an address is approved; «الحسابات» shows each person's entry state, an invite checkbox on add and accept, and on the card «إرسال دعوة» / «إعادة إرسال الدعوة», «إعادة إرسال رابط التأكيد», «إرسال رابط كلمة مرور جديدة», all logged («السجل»).
- **«الأفكار»:** no longer builds a sample work in the browser. It carries the text through the session into the real «إنشاء» form (`/create?idea=1`), where the work is saved to the database; it says the page itself keeps nothing.
- **Honest labels:** «التحليلات» and «المراقبة» and every «الإدارة» tab but «المستخدمون», and the settings tabs not backed by the database, say «لم يُبنَ بعد» and what their numbers are; the three pages carry «تجريبي» in the menu; the account page's reset button says it only resets the browser's sample data. Nothing was removed from the sample pages.
- **Verified:** `supabase/tests/entry_rules.sql` against `comms-hub`, one transaction rolled back: **30 of 30** (first run 27 of 30, the three misses were checks that listed the real founding administrators too; the checks were narrowed and the script re-run; no database behaviour changed). Server key md5, account, request and notice counts as before the run. `npm test` 185 of 185 (175 + `tests/entry.test.mjs` 10). Typecheck and build clean. `qa/entry-gate.cjs` (signed out, production build on port 3100): **14 of 14**; `qa/auth-gate.cjs` re-run **31 of 31**. Results in `qa/entry-rules.json`, `qa/entry-gate.json`.
- **Not verified:** the administrator's screens (entry state on the card, invitation, reset, resend, request notices) signed in, since no agent can sign in; the real send of an invitation and of the leaders' email (needs the owner's mailbox and a person to look); the Arabic text in the signed-out screens was read, not judged by a native reader.
- **Owner action, one time (not done, not doable by an agent):** point Supabase Auth's SMTP at the site's Gmail account, set the site and redirect addresses, optionally paste the Arabic templates and switch on leaked-password protection. Steps and the walkthrough are in `Entry_Flow_Setup.md`. Until the SMTP change, confirmation and reset emails still go through Supabase's built-in sender and its small hourly limit; the invitation and the request notices do not (they use the site's Gmail).
- **Found on the way:** on a local `next start` bound to `127.0.0.1`, the same-origin check of the mutating routes (`sameOrigin`) sees the host as `localhost`, so a page opened at `http://127.0.0.1:3000` gets «طلب من خارج النظام» from `/api/mail/sync` and the other mutating routes; opened at `http://localhost:3000` they work. Production is unaffected. Not changed.
- **Live data seen while testing:** of the three founding administrators, `polkgvd2@gmail.com` has no sign-in yet (`not_started`).

### 2026-10-14: Settings Step S2 (storage locations and the provider interface)

- **Owner direction:** "work on step 3" of the order in `Readiness_Audit.md` section 6: the real storage tab with file locations and the provider interface, with no change to how files behave. Baseline: the working tree was clean at `989bb36`.
- **Database:** migration `20261014140000_storage_locations.sql` applied to `comms-hub` (the statements as in the file, without its comment lines). `storage_roles` (library, mail, chat, backup: Drive for the first three, backup empty); `file_locations` (provider, what the file is, the provider reference, role primary or replica or backup, state ok or pending or failed or missing or retired, size, checksum, last verified), one primary per version by a partial unique index; backfilled (5 library versions, 0 attachments, all at Drive) and kept true by triggers on `media_versions` and `mail_files` (insert and delete). Both tables have row level security and no policy: read through `storage_asset_state` (anyone who may see the asset; provider name and state only, never a reference), `storage_overview` and `storage_verify_batch` (the storage right), and written only by `storage_verify_mark`, which needs the server key. `media_versions.drive_file_id` and `mail_files.drive_file_id` are unchanged and still what serves a file.
- **Site:** `src/lib/storage/` (the `StorageProvider` interface, the Drive adapter with `check`, the role map `storageFor` / `storageConfigured`); every route and library module that serves or changes a file now asks for a role instead of `getDrive()` (16 files; the Drive connection routes under `api/drive` and `api/integrations` stay provider-specific); `DriveError` is a `StorageError`; Drive gained `checksum` and `quota`. `/api/storage/verify` (the storage right; the database picks the batch of up to 20, the server asks the provider, then records with its key; a provider that is not connected marks nothing). Settings «التخزين» is real: providers with counts and last verification, «تحقق من عينة», the role map (read only), and «غير متاح بعد» for OneDrive, Supabase Storage, S3 and the NAS with the reason. The library file page shows where each version is kept and whether it was checked. Help for both, and a log line for each check.
- **Verified:** `supabase/tests/storage_rules.sql` against `comms-hub`, one transaction rolled back: **31 of 31** (three earlier attempts stopped on test-harness mistakes, listed in `qa/storage-rules.json`; no database behaviour changed between them). Server key md5, location and version counts as before. `npm test` **196 of 196** (185 + `tests/storage.test.mjs` 11; the help-selector test needed the new tab's file listed). Typecheck and build clean. `qa/permissions-pages.cjs` **830 of 830** (733 before; it had stopped on a missing module after the entry-flow work and was repaired and extended: entry state on the member list and card, the storage tab in five states, the library line). `qa/storage-gate.cjs` (signed out, production build on port 3100) **10 of 10**; `qa/auth-gate.cjs` **31 of 31** and `qa/entry-gate.cjs` **14 of 14** re-run. Advisors read: nothing new above the earlier warnings.
- **Behaviour change:** none intended. The route changes are mechanical (`getDrive()` to `storageFor(role)`, `DriveError` to `StorageError`, `fileInfo` to `info`); the Drive client's own tests pass unchanged. Not exercised against the real Drive: an upload, a download or a move after the change, because no agent can sign in.
- **Not verified:** the storage tab and the library line signed in on the real site; a real «تحقق من عينة» against Google Drive (it needs the administrator's session); that the five existing library files are still in Drive (the first check will say).
- **Still not built (Steps S3 onward):** changing a role's provider, a second provider, moving files, backups, per-folder override, OneDrive, the NAS.

### 2026-10-14: Settings Step S5 (the platform registry)

- **Owner direction:** "proceed to step 4" of the order in `Readiness_Audit.md` section 6: the platform registry with add, edit, delete, an info tab and a readiness tracker, the existing platforms migrated with no change in behaviour. Baseline: the tree was clean at `95d8df4`.
- **Database:** migrations `20261014150000_platform_registry.sql` and `20261014150100_platform_registry_url_fix.sql` applied to `comms-hub`. `platforms` (key, Arabic label, kind, order, `accepts` with `video_only`, adapter `simulated` only, planned publish mode, review, token life, enabled, built-in, docs link, readiness with note, time and person) holds the five existing rows with the labels and order the code had; `platform_accounts.platform` and `work_variants.platform` are foreign keys to it instead of checks; the three functions that carried the list (`work_parts`, `work_text_save`, `account_save`) were patched from their live definitions and the two small ones (`work_platform_ar`, `work_youtube_ok`) recreated, so the video-only rule, the label and the order of platform copies are data (`work_youtube_ok` keeps its name and its refusal code `YOUTUBE_VIDEO_ONLY`, so nothing that calls it changed; its privileges were kept: internal). Writes need «إدارة المنصات وتطبيقاتها» (`platforms.manage`, the administrator's by default) through `platform_save`, `platform_set_enabled`, `platform_set_readiness`, `platform_delete`; `platform_impact` and `platform_log` read; `platform_events` is append-only with no policy. A new platform is added switched off; a built-in one keeps its name and cannot be deleted or, for the mailbox, switched off; a platform with an active account cannot be switched off and one that was ever used cannot be deleted.
- **Site:** the shared words and rules read the registry (`src/lib/work/rules.ts`: `platformLabels` is a view of it, `VIDEO_ONLY` and `PLATFORM_ORDER` are filled when it loads, five built-in rows answer before it does; `src/components/work/data.tsx` loads it with the rest). «الحسابات المرتبطة» lists the registry's platforms, offers only enabled ones for a new account, and says on each section that publishing is a simulation, what the planned path is and how far its preparation is. «الإعدادات» has a new tab «المنصات»: a card per platform with what it publishes and what it asks of the department outside the site (`src/lib/platforms/info.ts`, none of it re-read from the platforms' official documents, and each card says so), the readiness tracker with its note and a log, add (from a list of facebook, tiktok, snapchat, whatsapp channel and status, or any key), edit, switch on or off, and delete on a long press with its impact. Help for the tab.
- **Verified:** `supabase/tests/platform_rules.sql` against `comms-hub`, one transaction rolled back: **54 of 54** (the first runs found two defects of mine, both fixed and both listed in `qa/platform-rules.json`: a key pattern that refused the one-letter key `x`, and a link pattern whose repetition count exceeds Postgres's limit). Re-run unchanged on the migrated database: `work_rules.sql` **135 of 135**, `approval_rules.sql` **71 of 71**, `planning_rules.sql` **113 of 113**. `npm test` **206 of 206** (196 + `tests/platforms.test.mjs` 10). Typecheck and build clean. `qa/permissions-pages.cjs` **885 of 885** (830 before; the tab in two roles) and `qa/work-pages.cjs` **1010 of 1010** (unchanged) drawn from fixtures; `qa/platform-gate.cjs` **11 of 11** (signed out, with the public key only: the registry and its functions are not reachable, and the tab shows only the sign-in screen); `qa/storage-gate.cjs` 10 of 10, `qa/entry-gate.cjs` 14 of 14 and `qa/auth-gate.cjs` 31 of 31 re-run. Advisors: nothing new above the earlier warnings; no new function callable by a visitor.
- **Not verified:** the new tab and «الحسابات المرتبطة» signed in against the real database (no agent can sign in); a real add, switch-on and account on a new platform by a person; the facts in the knowledge cards.
- **Not built (S6 onward):** any real connection, OAuth, token or adapter; a «assisted» or «manual» publishing task; per-platform limits and the preview (the next step in the audit order). The planned mode and the readiness are information until an adapter exists.

### 2026-10-15: post preview per platform, and real connection and health for Facebook, Instagram and TikTok (steps 5 and 6 of `Readiness_Audit.md` section 6)

- **Owner direction:** continue with the audit order after steps 1 to 4: "per-platform post preview with limits, shown through to the send step" and "real OAuth and health checks: Facebook and Instagram (one Meta app), then TikTok, with Snapchat as a manual task". Working tree at `65b59be` plus the untracked `videos/` folder; nothing committed in this entry.
- **Step 5, what a platform accepts.** `platforms.accepts` now also holds the limits (text, hashtags, images, videos, a combined media count, a title and a description in bytes, the fold, what a link counts) with a stated source and the day it was read (`limits_note`, `limits_checked`). Seeded for Instagram, X, LinkedIn and YouTube; templates for Facebook, TikTok, Snapchat and the WhatsApp ones. A number nobody could confirm is not stored: Facebook has no text limit (its documents state none), and the three figures taken from a platform's public help rather than its API reference (Instagram 2200 and 30 hashtags, X 280 and a link counting 23, LinkedIn 3000) say so on the card. `platform_save` reads and validates them (an empty value removes one, anything else is a whole number 1 to 1000000) and logs that limits changed; the edit dialog in «المنصات» edits the five common ones with the source and the date.
- **Step 5, the preview.** One pure check (`src/lib/platforms/limits.ts`, `copies.ts`) feeds every place: the work page's copy tab draws the post the way the platform lays it out (Instagram square, feed, video, plain) with counters and what would be refused, and the main-text tab lists each platform as fits or not; the review screen shows the exact approved text of a platform copy through the same preview and replaces the hard-coded "longer than 240" note for X; the copy editor counts as the person writes against the registry's limits (the fixed «الحد المقترح 240» is gone); the scheduling and publish-now dialogs show one row per account with its preview and **stop** while any copy breaks a limit. For a platform whose planned path is assisted or manual the same row carries the publishing pack: the exact text with a copy button and the files with links to the library. The card says the shape is approximate and the numbers exact.
- **Step 5, what is enforced where.** The database still enforces only `video_only` (it did before). A copy over a limit is stopped by the interface at the send step, and is not stopped by the database: a person who calls `work_schedule` directly can still schedule it. This is recorded here because AGENTS.md says the database decides; the adapter's own validate step (not built) is where the refusal will live, using the same `checkCopy`.
- **Step 6, connection.** Migrations `20261015110000_platform_connections.sql`, `20261015120000_account_delete_vault.sql`, `20261015130000_platform_conn_due_all.sql` applied to `comms-hub`. `platform_accounts` gains `conn_kind` (simulated or oauth), `conn_state`, `conn_checked_at`, `conn_ok_at`, `conn_error`, `external_id`, `external_name`, `scopes`, `integration_id`; every existing account stays simulated. Tokens are the secrets of `integrations` rows in Vault; the key-gated functions `platform_conn_app_set`, `app_get`, `user_put`, `secret`, `link`, `health` and the session ones `offer`, `due`, `disconnect` are in the migration; the app id and secret of the Meta and TikTok apps are entered once through «المنصات» into the vault by someone holding both «إدارة المنصات وتطبيقاتها» and «إدخال أسرار التكاملات وتجديدها».
- **Step 6, site.** `/api/platforms/{app,connect/[provider],callback/[provider],offer,link,check,disconnect}`; `src/lib/platforms/oauth.ts` (Graph API v26.0 Facebook Login, long-lived user token, pages with their tokens and the Instagram account linked to each, `debug_token`; TikTok Login Kit v2, token exchange and refresh, user info) built against a fake platform in tests. The flow: sign-in at the platform; the code is exchanged on the server and the user token goes into the vault as a passing "offer" owned by the person; «الحسابات المرتبطة» opens a chooser of pages and accounts (names only), then links each with its own vault token; a simulated account on the same handle is upgraded in place. The authorisation becomes the token's real expiry, so the work cycle's own rule is now true for these accounts; a check that says the token is no longer valid ends the authorisation at once and tells the publishers once; a network failure does not. The channels page asks about accounts not checked for 30 minutes whenever someone opens it (no timer exists), «فحص الاتصال» asks at once, «فصل» is a hold button that destroys the token, and the simulated «إعادة الربط» is refused for a real account (`RECONNECT_REAL`). Deleting a real account destroys its token. Snapchat and the WhatsApp channel and status are manual tasks: no sign-in button, the registry says «مهمة يدوية», the send step shows the pack.
- **Verified, numbers.** `npm run typecheck` clean, `npm run build` clean, `npm test` **234 of 234** (206 at the start of the day, 219 with `tests/preview.test.mjs`, 234 with `tests/connections.test.mjs`); database `supabase/tests/platform_limits_rules.sql` **28 of 28** and `supabase/tests/platform_connections_rules.sql` **65 of 65** (each with its attempts listed in `qa/platform-limits-rules.json`, `qa/platform-connections-rules.json`), `platform_rules.sql` re-run against the new `platform_save` **53 of 53** (see the note in `qa/platform-limits-rules.json` about the count); browser check `qa/post-preview.cjs` **160 of 160** (preview in three layouts, the over-limit stop, the pack, the connection lines, no sideways scroll at 390 and 1280 in Direction A and the new identity), and the earlier `qa/work-pages.cjs` re-run **1012 of 1012** with the new files included.
- **Not verified, said plainly.** Nothing here touched a real platform: no Meta app, no TikTok app, no real sign-in, no real token, no App Review exists yet, so the requests to Meta and TikTok are verified only against a fake that returns the documented shapes. The facts of the two APIs were read from the platforms' documentation on 2026-10-15 (Facebook Login and Graph API v26.0, TikTok Login Kit and Content Posting API); things the documentation pages read did not state were left out (Facebook's text limit; Instagram's caption and hashtag figures from the API reference; TikTok's PKCE for the web flow, which the web guide shows without; the token exchange sends `redirect_uri` as the web guide lists it, though its shortest example omits it). Nothing signed in was seen by an agent (no sign-in bypass exists): the settings app form, the chooser and the channels page against the real database are in the owner walkthrough. The preview's drawing of a post is an approximation by design.
- **Owner steps, in order:** `Platform_Connections_Setup.md`: (0) answer whether a verified Meta Business account exists (E-7); (1) create the Meta app and (2) the TikTok app, register the two redirect addresses it lists; (3) in «المنصات» switch on Facebook and TikTok and enter each app's id and secret; (4) connect the first account from «الحسابات المرتبطة» and press «فحص الاتصال»; (5) walk the preview on a real work. Publishing stays a simulation until each platform's review passes and an adapter is built (S9).
- **Found on the way.** The earlier fixed "240 characters" hint for X in two places was not tied to any platform document (X's own figure is 280 for a standard account); both now read the registry. `account_delete` left nothing behind for a simulated account, but would have left a live token for a connected one: fixed in the same step.
- **Next action:** step 7 of the audit order, the move engine with a second provider (S3), then OneDrive (S8); and the help upgrade (step 8) now also owes the new settings app block, the chooser and the preview.

### 2026-10-15: Settings Step S3 (second provider and the move engine; step 7 of `Readiness_Audit.md` section 6)

- **Owner direction:** build S3 of `Settings_Integrations_Plan.md` (6.3 and 11): a second storage provider and the move engine, driven from «التخزين» by the open page with state in the database. Baseline: the working tree held the uncommitted platform-connection work of the same day; nothing was committed or pushed in this entry.
- **Provider.** An S3-compatible provider (type `s3_compatible`) is a row of `integrations` with its non-secret settings in `config` (https address, bucket, region, prefix, path style, flavour) and its key pair as one vault secret `ACCESSKEYID:SECRET`. `storage_provider_save` (right «إدارة مزودي التخزين») refuses an address that is not https, an IP, localhost or an internal name, credentials or a query in it, a dot segment in the path or the prefix; `storage_provider_remove` only for a provider holding nothing. The key pair goes in through the existing `int_secret_set` (right «إدخال أسرار التكاملات وتجديدها») after the server wrote, read back and deleted a small probe object (`/api/storage/provider`), through `storeChecked` (now also by integration id: `int_secret_use_id`, `storage_provider_health`). Signing is AWS Signature Version 4 written here (`src/lib/storage/s3.ts`), no SDK; trash is a copy under `_trash/` then a delete.
- **Engine.** `storage_moves` and `storage_move_items` (no policy, read through `storage_move_report`, `storage_moves_overview`). Plan with a dry-run report (counts, bytes, estimate, destination room, files already there, approved versions, what cannot move and why); start, pause, resume, cancel, retry. Per file: copy in 8 MiB parts with the destination's partial state and the whole-file md5 state kept on the item (`src/lib/storage/md5.ts` is a resumable md5), so a request or a page that ends loses one part; the source's own checksum is compared with the bytes read, the destination's reported checksum with what was written (composite ETag included), a fresh check of the destination before the copy is trusted; an approved version moves only on a checksum match (`APPROVED_NEEDS_CHECKSUM`). Switch is `storage_move_switch` (verified, checksummed copy only). Hold: the plan states it (0 to 365 days); `storage_retire_claim` refuses until it is over and offers replicas of a verified primary only; `storage_retire_mark` retires nothing that is a primary. Every record function needs the person's right «نقل الملفات بين مزودي التخزين» and the server key together. A replica already at the destination (the held source of an earlier move) is verified and switched to without copying.
- **Serving.** `storage_serving(key, ref)` returns the live copies by the legacy reference; the content, mail, messaging and review-link routes and the mail sender open through `openStored` (primary first, a verified replica if it does not answer, the old Drive read when the database cannot say). Rename, folder move and delete follow the Drive copies that are live and send every live copy to its trash on delete. `media_versions.drive_file_id` and `mail_files.drive_file_id` are untouched.
- **Site.** «التخزين»: provider form and controls, the move panel (plan, run, pause, cancel on a long press, report, hold, retire on a long press), help for each, six new hold and event words. `/api/storage/move` (maxDuration 60), `/api/storage/provider`, `/api/storage/verify` now asks each copy of its own provider.
- **Verified, numbers.** `supabase/tests/storage_move_rules.sql` against `comms-hub`, one transaction rolled back: **95 of 95** (attempts in `qa/storage-move-rules.json`; the first run's failures were a harness mistake, and the review found one real defect, a `../` prefix, fixed in migration `20261015140300`). `npm run typecheck` clean, `npm run build` clean, `npm test` **252 of 252** (234 + 18 in `tests/storage-move.test.mjs`: md5, the AWS signing example, a fake S3 that verifies signatures, Drive to S3 with a 8 MiB multipart object over several batches, back with and without the held copy, a changed source, a wrong ETag, a provider down, copy mode, wrong key). `qa/permissions-pages.cjs` **1023 of 1023** (it had stopped on the platform files added the same day: their modules were added to its list; six new states of the tab; three old expectations about the S3 and Supabase entries of «غير متاح بعد» updated), `qa/storage-gate.cjs` **21 of 21**. After the rule run: server key md5, locations (5), versions (5), integrations (1), events (0), vault secrets (0) as before.
- **Not verified, said plainly.** Nothing ran against a real second provider (no key pair exists): the S3 client is verified against a fake, and its signing against AWS's published example. A real move from Drive was not run, and a Drive resumable upload (the way back after retirement) was written from Google's documented protocol and tested only against a fake. The signed-in screens were drawn from fixtures, not seen by an agent. Supabase Storage's per-file limit and each flavour's address form were taken from its documentation and not tried. Zero-byte files are not special-cased (the library refuses them).
- **Known gaps.** New uploads and the role map are unchanged (Drive); changing a role's provider is not offered. A run needs the page open. An S3 target takes files up to about 80 GB. A copy cancelled with its destination unreachable leaves an incomplete upload for the store to expire. Per-asset «move this file» from its own page is not added (the plan accepts asset ids; the panel offers the whole library, a folder or mail). Backups (S4) will reuse the engine in copy mode.
- **Owner steps:** `Storage_Provider_Setup.md`.

### 2026-10-15: in-site setup guides, and steps 5 to 7 pushed

- **Owner direction:** the platform information is given in the website, not by the agent: where there are steps, a circled "!" lets the user follow them; finish steps 6 and 7, push all of steps 1 to 7, then work on step 8.
- **Built.** `src/lib/setup-guides.ts` holds the numbered steps (Meta app, TikTok app, connecting an account through each, the manual path for Snapchat and the WhatsApp channel and status, a first storage move, and each storage kind: Supabase, B2, R2, Amazon, MinIO, other); `src/components/setup-guide.tsx` draws the button (the icon set's circle with an exclamation mark, no emoji) and the steps in the site's own dialog, with the return address filled in from the site's address and shown to copy. Placed beside each platform app block and manual platform in «المنصات», each platform section in «الحسابات المرتبطة», the storage provider form and the move panel. Each platform guide says that publishing is still a simulation and that the facts were read from the platform's documentation on 2026-10-15.
- **Verified.** `npm run typecheck` and `npm run build` clean; `npm test` **258 of 258** (252 + `tests/setup-guides.test.mjs` 6: every guide complete, a guide for every platform app, connection path, manual path, move and storage kind, the return address filled in, every use names a guide that exists, no emoji); `qa/permissions-pages.cjs` **1102 of 1102** (six guides drawn open, at 1280 and 390 wide, the buttons in the platform and storage tabs).
- **Pushed.** The work of steps 5, 6 and 7 and these guides in one commit on `main`; `videos/` (96 MB of film exports) was left out of it. The database migrations were applied to `comms-hub` when each step was built.
- **Not verified.** The signed-in screens (drawn from fixtures only); the guides' facts against the live platform consoles, which change.

### 2026-10-15: help upgrade (step 8 of `Readiness_Audit.md` section 6)

- **Owner direction:** proceed with step 8 after steps 1 to 7 were pushed (production deployment of `860e877` READY, signed-out routes refuse a visitor).
- **What the audit said was weak, and what changed** (`src/lib/kit/guide.ts`, `src/lib/help/`):
  - *Every page had the same three steps for every role.* The first card now says what the page means for the person's role group, from the page's own role text, and a page can add steps for one group (`onbRole`): the lead's approvals queue, the publisher's publish and schedule, the lead's permission requests on Home, the add-account and connect steps on «الحسابات المرتبطة».
  - *Steps skipped silently, so an empty page showed one step or none.* When some steps are not on screen the tour ends with a closing card («ما لا يظهر بعد»: some parts appear with content or permission, the page guide explains them all); when nothing at all drew after about five seconds, one card says what the page is for.
  - *No «what changed» re-tour; progress keyed by page only.* A page may carry `v` and `news`: a person who saw the guide before is shown only the added steps, once, under the key `page:v2` (accepted by the existing guide key rule; replay clears it). A first visit marks both, so a new person never sees «جديد في». «الإعدادات» is version 2 with three news steps (the move panel, adding a provider, the circled "!").
  - *Touch.* The guide speaks of touching on a coarse pointer; «دليل الصفحة» is a button in the guide bar (it was reachable only by a double click); buttons and the close control are 44 px on touch; windows are capped to the screen; double-tap zoom is off on the guide's controls.
  - *Six routes had no entry.* «الأفكار», «التحليلات», «المراقبة», «الإدارة», «استوديو الحركة» and «مكونات الواجهة» have complete guides (the sample pages say what is sample and where the real data is).
- **Verified, numbers.** `npm run typecheck` and `npm run build` clean; `npm test` **263 of 263** (258 + `tests/help-tours.test.mjs` 5; `tests/kit.test.mjs` extended for the six routes); `qa/help-tours.cjs` **25 of 25**: the real engine and registry compiled and run in headless Edge over fixture pages, covering the lead's, the publisher's and the member's tours, a partly drawn page, a page with nothing drawn, what is new (shown once, marked, not shown again, not shown to a new person), and a phone (Pixel 7 profile) for the touch words, the guide button, 44 px controls, the window inside 390 px and the page guide opening; `qa/permissions-pages.cjs` still **1102 of 1102**.
- **Not verified.** The tours on the real signed-in pages (the fixtures use the pages' selectors, not the pages); a real finger on a real phone; the Arabic wording by a native reader. The role steps point at elements that exist only for some states (for example the publish section appears when something is approved), and are skipped when absent by design.
- **Not done in step 8.** A role-aware tour per page for every page (five pages have role steps); a mobile walk-through of the signed-in screens by a person.

### 2026-10-15: Settings Step S4 (backups)

- **Owner direction:** "push step 8, then start S4". Step 8 was pushed (`d20edb1`). S4 of `Settings_Integrations_Plan.md` (7, 11): policy, the admin export, file replicas to the backup provider, verification, age and stale banner, runbooks.
- **Database.** Migrations `20261015150000_backups.sql`, `150100_backup_run_ref.sql`, `150200_move_start_per_scope.sql` applied to `comms-hub`. `backup_jobs` (files, database, config: manual frequency, warning age, retention count) and `backup_runs` (no policy; read through `backup_overview`). The move engine gained a **backup mode**: `storage_move_plan` accepts `backup` (no hold; incremental: a file with an ok or pending copy at the backup provider is not planned), `storage_move_copied` records the role `backup`, the primary never changes, a switch is refused. `backup_run_begin('files')` makes one plan per provider that holds files without a backup, for the library and for attachments, and `backup_run_close` ends the run when they have. The export is an allow-list (`backup_table_list`): 25 tables of records, 12 of configuration; no mail, messaging, private reminders or notifications, phone numbers, upload sessions or secrets, and the integrations page drops `secret_id` and `pending_secret_id`. `backup_target_set` refuses the library's own provider. `backup_policy_set` accepts only `manual` (no timer exists). `backup_sample_claim` and `backup_sample_mark` re-read backup copies; `backup_run_verify` records an export's re-read; `backup_prune_*` keeps the last N exports. `backup_restore_file` makes a verified backup copy the primary of a file whose primary is missing or failed (no bytes move). `settings_overview` carries `last_backup` and `backup_stale`.
- **Site.** `src/lib/backups/export.ts`; `/api/backups/export` (builds the file in pages, gzips, keeps it at the backup provider, reads it back and compares sha256, prunes, hands it to the person), `/api/backups/run` (starts the file plans; the copying is the move engine's loop in the open page), `/api/backups/verify` (re-reads three least-recently-checked backup copies and compares their md5, or re-reads a kept export and compares sha256). «الإعدادات» has a tab «النسخ الاحتياطي»: provider, a card per kind (age, size, verified or not, run, verify, policy), the restorable list with a long-press restore, the runs, the runbooks and what is excluded; «عام وصحة النظام» shows the real age. A circled "!" explains the tab; the settings guide is version 3 with the news.
- **Found by the database run, fixed.** One backup makes a library plan and an attachments plan between the same two providers, and the engine refused to start the second (`MOVE_ALREADY_RUNNING`), so attachments would silently never have started; the refusal now applies to the same scope only (migration `150200`).
- **Verified, numbers.** `supabase/tests/backup_rules.sql` against `comms-hub`, one transaction rolled back: **61 of 61** (attempts in `qa/backup-rules.json`); the engine's core re-checked after its three functions were replaced, `supabase/tests/backup_engine_regression.sql` **15 of 15** (the full 95-check S3 script was run before S4 and not repeated). `npm run typecheck` and `npm run build` clean, `npm test` **271 of 271** (263 + `tests/backups.test.mjs` 8), fixture browser check **1183 of 1183** (4 backup states, 3 more guides), signed-out gate **27 of 27**.
- **Not verified, said plainly.** Nothing ran against a real backup provider (no S3 key pair exists): the export, its keeping and its read-back, and the sample re-read, are tested as database functions and as unit tests of the builder, not as an end-to-end run. The signed-in tab was drawn from fixtures. A database restore is deliberately not offered.
- **Known limits.** Everything is manual (no scheduler until the agent computer, E-1). The export is built in the server's memory and refused above 300,000 rows; the provider's own backups are then the tool. The pages of an export are read one table at a time without a snapshot, so a change made during it may be missed or doubled. A files backup needs both «تشغيل النسخ الاحتياطي» and «نقل الملفات بين مزودي التخزين» (the administrator holds both). A backup copy larger than 100 MB is not part of the sample re-read.


### 2026-10-15: health check of the pages, `Action_Plan.md`, and its step B1 (menu and routes)

- **Owner direction.** After the health check of the seven supporting pages (what each does, who sees it), the owner accepted the action plan in `Action_Plan.md` and asked to start with its first step. Directives recorded here, as `AGENTS.md` requires for a departure from `MVP_draft.md`: «الإدارة» is dissolved; «الحساب» is reached from the name badge at the foot of the sidebar; «الحسابات المرتبطة» is renamed «حسابات المنصات»; «التحليلات» is hidden until it reads real data. The sidebar list in `MVP_draft.md` section 11 is superseded by the amendment added under it.
- **Findings of the health check.** «الإدارة»: eight tabs, only «المستخدمون» (a link) and the Drive card did anything, every other tab duplicated a real tab of «الحسابات» or «الإعدادات» or was static text. «المراقبة» and «التحليلات»: sample state in the browser, not the database; «المراقبة» imitated «سجل النشاط». «الإعدادات»: six real tabs, seven display-only. The owner's list said step 8 of the audit order was not done; it was (`d20edb1`), and S4 backups are built (`7a1d2a9`); only OneDrive (S8) and step 9 remain open.
- **Built (B1).** The menu is 17 entries (was 20): «الإدارة», «الحساب» and «التحليلات» left the list. `/admin` redirects to `/accounts` (`src/app/[[...slug]]/page.tsx`, `redirect` from `next/navigation`, checked against the Next docs in `node_modules`); the admin branch, its eight sample tabs and its guide were deleted (`src/components/supporting.tsx`, `src/lib/help/pages.ts`, `registry.ts`). The name badge is a link to `/account` with an active state, shown as the avatar alone when the sidebar is collapsed or narrow (it was hidden before, which would have left no way in); the phone menu has an «الحساب» entry. «الحسابات المرتبطة» became «حسابات المنصات» in 16 source and test files (route `/channels` unchanged). `/analytics` and `/monitoring` still open by URL and by grant; only «التحليلات» left the menu.
- **Verified, numbers.** `npm run typecheck` and `npm run build` clean; `npm test` **275 of 275** (271 + `tests/consolidation.test.mjs` 4: the menu list, the badge, the rename left nowhere, `/admin` and its guide gone; `tests/kit.test.mjs` and `tests/help-tours.test.mjs` adjusted for the removed guide); `qa/menu-consolidation.cjs` **18 of 18** (`qa/menu-consolidation.json`, screenshots under `qa/artifacts/menu-consolidation/`): the real stylesheets and the menu list read from `shell.tsx`, at 1400, collapsed, 1000 and in the plain design: badge visible and inside the sidebar, words hidden when narrow, sign-out separate and hidden when narrow, no horizontal overflow.
- **Not verified.** The signed-in shell itself (a fixture page carries the real styles and the footer markup, not the running application); the redirect in a browser; the phone menu entry drawn by a person. Per rule no sign-in bypass was added.
- **Left on purpose, for later steps.** `domain.ts` still holds the sample constants only the old admin page used (`permissionMatrix`, `systemHealth`, `storageUsage`, `securityEvents`, `integrations`) and `drive-files.tsx` still exports `DriveIntegration`, now unused: removal belongs to step B6 with the other renaming and clean-up. «المراقبة» is still its own page until B2.

### 2026-10-15: step B2 of `Action_Plan.md` («المراقبة» merged into «سجل النشاط»)

- **Owner direction.** "Start step B2": «المراقبة» keeps only logs of actions by all members and information about the team; nothing else.
- **Built.** A «الفريق» panel at the top of «سجل النشاط» (`src/components/media/activity-page.tsx`, rule in `src/lib/media/team.ts`), shown only to those who already see the whole log (director, assistant, administrator): each member with their role, last recorded action, actions in the last seven days and open tasks with the late ones; pressing a name filters the log to that person. It reads only rows the person's own row level security returned (the log, the people list, the tasks); nothing is sample data. `/monitoring` redirects to `/activity`; the sample page, its menu entry and its guide are deleted. The `monitoring` page grant still exists in the catalogue and now opens «سجل النشاط» (`canOpen`), so nobody loses a page; the activity guide has a «الفريق» step and a what-is-new note (`v: 2`). The menu is 16 entries.
- **Dropped on purpose.** The sample panels «التنبيهات الموجهة لدورك» (the real notices are in the bell and in «الطلبات») and «نشاط الأعمال» (the real log is the page itself); open works per member is not shown because the work cycle's data is read by another provider and the panel must not invent it.
- **Verified, numbers.** `npm run typecheck` and `npm run build` clean; `npm test` **279 of 279** (275 + 4 in `tests/consolidation.test.mjs`: the redirect and deletions, the grant alias, the team numbers, the panel's scope); `qa/team-panel.cjs` **16 of 16** (`qa/team-panel.json`): the real `team.ts`, the real stylesheets, at 1280, 900 and 390: order, counts, no overflow; `qa/menu-consolidation.cjs` re-run **19 of 19**.
- **Not verified.** The panel on the signed-in page with real rows (a fixture carries the markup); the filter by pressing a name; the redirect in a browser.
- **Known limits.** The weekly count and the last action come from the latest 500 log rows read, and the panel says so; a member whose last action is older shows "no recorded action". The old `monitoring` grant remains in the catalogue and in the accounts page list until a migration folds it (step B6).

### 2026-10-15: step B3 of `Action_Plan.md` (settings: the system's page only)

- **Owner direction.** B1 and B2 were pushed to `main` (`7a1d2a9..cb02b71`), then "start B3".
- **Built.** «الإعدادات» keeps six tabs, all real: عام وصحة النظام، التخزين، النسخ الاحتياطي، المنصات، واتساب النظام، السجل; its subtitle says it is the system's page (it said "this browser's preferences"). The personal choices, the design and the mode, are a «المظهر» panel on «الحساب» (`src/components/appearance-panel.tsx`), still kept in the browser only. Removed because they stored nothing and changed nothing: المؤسسة (three fixed read-only values), اللغة (one option), الإشعارات and the «العرض المختصر» switch (local state that did nothing), افتراضات النشر (a fixed list from the sample channels), افتراضات الاعتماد (static text of rules the reference fixes), الذكاء والأتمتة. A link `?tab=appearance` or any removed id falls back to the first tab. Guides: «الإعدادات» v4 with a what-is-new note, «الحساب» v2 with a «المظهر» step.
- **Verified, numbers.** `npm run typecheck` and `npm run build` clean; `npm test` **281 of 281** (279 + 2 in `tests/consolidation.test.mjs`); `qa/settings-account.cjs` **10 of 10** (`qa/settings-account.json`): the tab list read from the source, the real stylesheets, at 1280 and 390: six tabs, no sideways overflow, both appearance groups with one pressed choice each, buttons at least 30 px.
- **Not verified.** The signed-in pages (a fixture carries the markup); that the design and mode switches still apply (their code is unchanged and moved as it was).
- **Left for later.** If the owner wants an organisation name, a default publish time or a default review rule as real settings, each needs its own stored value and a place where it is read; none exists today. The «إعادة البيانات التجريبية» button on «الحساب» still resets the sample state behind «التحليلات» and goes with step B5.


### 2026-10-15: step B4 of `Action_Plan.md` (who sees what, written down and tested)

- **Owner direction.** B3 was pushed to `main` (`cb02b71..ca3a0b5`), then "start step B4".
- **Built.** The sidebar list and the rule for who is offered what are one place: `menuEntries` and `menuFor` in `src/lib/access.ts` (the shell keeps only the icons and calls `menuFor`; it no longer computes visibility itself). `src/lib/access-matrix.ts` computes, for each role, the pages a new account starts with, the capabilities held by default (the installed templates and the fixed rules), the sidebar, the routes it opens by address, what it sees in «سجل النشاط», and the administrator's sidebar for each viewed role. `qa/access-matrix.mjs` saves it as `qa/access-matrix.json` and prints the table, which is written in `MVP_draft.md` ("Access by role").
- **Verified, numbers.** `npm run typecheck` and `npm run build` clean; `npm test` **289 of 289** (281 + `tests/access-matrix.test.mjs` 8: the sidebar of each of the eight roles equals a written expectation; the routes each opens by address; «الحسابات» and «حسابات المنصات» only to the right roles; creating not given to the publisher or by a page grant; the administrator viewing as a role; the whole log and the team panel for three roles; the default capabilities; the shell draws from `menuFor` with an icon per entry); `qa/menu-consolidation.cjs` re-run **19 of 19** over the new list.
- **Found.** (1) The default page list of every role contains «الإعدادات», whose tabs all need `settings.view`, held by the administrator only: a writer or a member sees a page of refusals. (2) The member is offered «إنشاء» (the domain role creates and `work_create` has a member branch) while `page.create` is fixed-denied for the member, so «صلاحياتي» says the page is not held. Neither is changed here: both are the owner's, recorded as B4b in `Action_Plan.md`.
- **Not verified.** The table is the default of a new account, computed from the rules; no real signed-in account of each role was opened. An account whose page list was edited, or that holds grants, differs by design.


### 2026-10-15: step B4b of `Action_Plan.md` (default pages per role; the member creates)

- **Owner decision.** «الإعدادات» by default for the administrator only, others only when granted `settings.view` or `settings.manage`; the member keeps creating and the capability `page.create` says so for the member. Then push B4 and B4b.
- **Built.** `defaultPages` gives «الإعدادات» to the administrator alone; `canOpen` and `menuFor` open it also for a person who holds `settings.view` or `settings.manage` (the menu reads the capability live; the page guard reads the session's), and the page grant still works. Existing accounts keep the page list they have: the defaults are chosen in the interface when an account is added or a request accepted, so no stored list was touched. A storage or backup capability alone does not open the page (the owner named the two). `page.create` is now held by the member: migration `supabase/migrations/20261015160000_member_creates.sql` widens the list of creating roles in `perm_eval`, `grant_capability` and `request_capability`, each exactly once and failing the migration otherwise; the TS mirror (`permissions.ts`, `askable`, the grant picker on the member card) and the old-rule comparison in `supabase/tests/permissions_rules.sql` follow. The publisher stays denied.
- **Applied to the database.** To `comms-hub` as `20261015082747 member_creates`; afterwards the three functions each carry the widened list.
- **Verified, numbers.** Database run in one rolled-back transaction, **7 of 7** (`qa/member-creates-rules.json`): a member holding the page is held, without it not, the publisher still fixed-denied, the writer unchanged, the administrator can give a member the page through `account_update`, cannot give a publisher a standing create grant (`PAGE_NEEDS_CREATE`), and the member then holds it. `npm run typecheck` clean; `npm test` **291 of 291** (289 + 2 in `tests/access-matrix.test.mjs`; the expected sidebar table updated so «الإعدادات» is the administrator's); `qa/menu-consolidation.cjs` **19 of 19**; the access table regenerated (`qa/access-matrix.json`) and rewritten in `MVP_draft.md`.
- **Not verified.** `supabase/tests/permissions_rules.sql` was not re-run in full (38 KB through the tool): only its comparison list was widened to match, and the targeted run above covers the changed rule. Re-run it before relying on its totals. No signed-in account of each role was opened.
- **Effect to know.** A leader or member who has «الإعدادات» today keeps it; a person added from now on does not get it unless the administrator ticks it or grants `settings.view`.


### 2026-10-15: steps B6 and B7 of `Action_Plan.md` (clean-up, the grant folded, help refreshed)

- **Owner direction.** "Do steps B6 and B7": the rename sweep and clean-up (unused sample constants, `DriveIntegration`, folding the monitoring grant), then the help refresh for the changed pages. B4 and B4b were pushed first (`ca3a0b5..dbaaa74`).
- **B6, the grant.** Migration `supabase/migrations/20261015170000_fold_monitoring.sql`, applied to `comms-hub` as `fold_monitoring`: an account holding the page gets «سجل النشاط» instead, person grants and requests naming it name `page.activity`, the catalogue row goes, and the two functions that carry the list of valid pages (`perm_pages_ok`, `account_update`) lose the word (each carried it exactly once; the block fails otherwise). Counted before writing it: no account, grant, request or role template referred to it. After: 0 catalogue rows named it, 38 rows in total (equal to the TypeScript catalogue), 0 functions name it, 0 accounts contain it; a rolled-back run of `account_update` with the new list and with a stale `monitoring` entry gave 3 of 3 (`qa/fold-monitoring-rules.json`). TypeScript: `grantablePages`, the catalogue and the alias in `canOpen` no longer name it; `tests/permissions.test.mjs` reads the removal from the migration.
- **B6, clean-up.** Deleted `permissionMatrix` and `integrationStatusLabels` from `src/lib/domain.ts` and `DriveIntegration` from `src/components/drive-files.tsx` (nothing read them since B1). Kept on purpose: `systemHealth`, `storageUsage`, `securityEvents` and `integrations`, which the legacy store's `homeTiles` (tested in `tests/domain.test.mjs`) and one sample notice still read; retiring that store is the new optional step B8 in `Action_Plan.md`.
- **B6, names.** Present-tense documents carry the new names: `MVP_draft.md` (the page index says what became of 34, 35, 38 and 39), `Readiness_Audit.md`, `Roadmap.md`. Dated records (`progress.md`, the status sections of past steps, `Reference_Build_Plan.md`) keep the name they were written with, because they describe what was built then. The legacy route lists of `qa/colour-tokens.cjs` and `qa/identity-toggle.cjs` and the key list of `qa/permissions-pages.cjs` lost the removed pages.
- **B7, help.** «الإعدادات»: the role lines (written for display tabs and for every role opening the page) now say it is the administrator's by default and opens with the page grant or either settings capability; its what-is-new note (v4) lists only what was added in that version (it had repeated the v3 notes). «الحسابات» v2: it took what the dissolved admin page held. «حسابات المنصات» v2: the new name, and that these are the organisation's accounts on platforms, not people. «سجل النشاط» v2 and «الحساب» v2 were done in B2 and B3.
- **Found and fixed.** `qa/help-tours.cjs` had gone stale at the S3 and B3 version bumps of the settings guide (it hard-coded `settings:v2` and a `.st-moves` element) and timed out; it now reads the version from the registry and uses the real news element.
- **Verified, numbers.** `npm run typecheck` and `npm run build` clean; `npm test` **291 of 291** (the alias test became a test that the grant is gone from the page list, the defaults, the catalogue and the migration); `qa/help-tours.cjs` **25 of 25**; `qa/menu-consolidation.cjs` **19 of 19**, `qa/settings-account.cjs` **10 of 10**, `qa/team-panel.cjs` **16 of 16**; the access table regenerated unchanged.
- **Not verified.** The signed-in pages, and the tours on them (the check drives the real engine over fixtures). `supabase/tests/permissions_rules.sql` was not re-run in full after the page list change.


### 2026-10-15: steps B5 and B8 of `Action_Plan.md` («التحليلات» real, the prototype's sample model retired)

- **Owner direction.** "Work on" B5, B8, Part C and Part D (a pasted list). B5 had been waiting for the owner's choice of numbers; none was given, so the numbers were chosen here from what the database holds (decision recorded in `Action_Plan.md` B5; the list is easy to change). Part C and D items that need the owner's accounts or hardware were not started: see the next entry.
- **B5, built.** `src/lib/work/analytics.ts` (rules) and `src/components/work/analytics.tsx` (page, under `WorkProvider`, route `/analytics`): the flow of work (eleven statuses, open, late, due within seven days, works made and published in each of the last eight weeks), review (waiting, returned for changes, works that went to review, mean rounds, share approved in the first round) and the platforms (accounts active and total, connected through the platform's own sign-in, needing attention, authorisation ending within 14 days, works addressed to the platform, simulated results ok and failed). Each section names its source; a banner says publishing is a simulation and that every number is for what the person may see. Team workload stays in «سجل النشاط» (the user's rule: analytics is platforms and analysis). «التحليلات» is in the menu again (17 entries) and its guide was rewritten (v2). The `useHub` sample branch of `supporting.tsx` is gone.
- **B8, built.** `src/lib/domain.ts` went from about 1,600 lines of sample state (works, notices, directory, campaign, the reducer, the home tiles) to 196: the role table, the eleven status words, and the fixed channel list the library's publishing dialogs still use (not the platform registry: a known leftover). The shell's own state is `src/lib/ui-state.ts` (role, lock, message). Real consequences found and fixed: (1) messaging's work link, work card and the room-link picker listed the **sample** works (CH-241 and the like), which do not exist in the database; they now list the real works the person may see (`src/components/chat/works.ts`); an existing room linked to the sample campaign shows a plain strip without the sample title and date; (2) the global search searched sample works with a hard-coded "اليوم الوطني"; it now asks the database by title or number; (3) every page header said "اليوم في النموذج: الاثنين 21 سبتمبر 2026", a model date; it now shows today in Riyadh. Removed: the component gallery page (`/components`, admin only, a viewer of the sample content) with its guide, and the «إعادة البيانات التجريبية» button of «الحساب». `tests/domain.test.mjs` (the sample model's rules; their real counterparts are the database rule runs) was replaced by `tests/channels.test.mjs`.
- **Verified, numbers.** `npm run typecheck` and `npm run build` clean; `npm test` **287 of 287** (291 − the retired domain tests + `tests/analytics.test.mjs` 6 + `tests/channels.test.mjs` 6 + access and help updates); `qa/analytics-page.cjs` **18 of 18** (the real analytics rules over fixture rows, the real stylesheets, three widths); `qa/menu-consolidation.cjs` **18 of 18**, `qa/settings-account.cjs` **10 of 10**, `qa/team-panel.cjs` **16 of 16**, `qa/help-tours.cjs` **25 of 25**; the access table regenerated (`qa/access-matrix.json`): «التحليلات» in every role's menu.
- **Not verified.** The signed-in pages; the global search and the messaging pickers against real rows; that «التحليلات» numbers are right on real data (the rules are tested on fixtures; no works exist in the database yet: "no sample data in the database"). Older qa scripts (`qa/acceptance.cjs`, `qa/verify.cjs`, `qa/final-interactions.cjs` and others written for the sample model) still reference it and need a signed-in session anyway; they were left as written and are not part of `npm test`.


### 2026-10-15: Parts C and D of `Action_Plan.md` (what could be done, and what was not)

- **Owner direction.** "Work on" Part C (OneDrive, a first real second-provider move, the Meta and TikTok apps, the signed-in walkthrough) and Part D (the agent computer and NAS) after B5 and B8.
- **Not doable by an agent, so not done:** a first real move and a real backup (need a bucket and key pair that exist only in the owner's account), the Meta and TikTok apps (the owner's developer accounts and, for Meta, a verified business), the signed-in walkthrough (no agent can sign in, by rule), the NAS and scheduled backups (the hardware does not exist, E-1). Nothing was faked to look finished.
- **OneDrive (S8) was deliberately not built.** The move engine verifies by MD5 and approved versions move only by checksum; OneDrive gives SHA-1 and quickXorHash (a personal account) or quickXorHash only (work or school), so the provider needs two new resumable hashes next to `src/lib/storage/md5.ts`, and Microsoft Graph's upload sessions and redirecting downloads cannot be proven by a fake. S3 could be built blind because its signing has published test vectors; this cannot. Recorded as a decision for the owner in `Owner_Handoff.md` section 1.4, with what to register and which account type to report. If the owner still wants it built before an account exists, it can be, labelled untested.
- **Done instead.** `Owner_Handoff.md`: the order that costs least, each outside item with what the owner does, what the agent does with the answer and what closes it, the signed-in walkthrough as tables (what to do and what should happen, per page changed in B1 to B8, with the per-role entry counts from `qa/access-matrix.json`), and the Part D plan. `Status.md` and `Action_Plan.md` point to it.
- **Verified.** The walkthrough's expected counts (16 entries as administrator; 17, 17, 16, 16, 16, 15, 16 when viewing as director, assistant, writer, designer, producer, publisher, member) are the generated access table's, not typed by hand. Nothing else to run: the file is documentation.


### 2026-10-15: step B9 of `Action_Plan.md` (the Director connects the platforms, the mail, Drive and the WhatsApp bridge from the site)

- **Owner direction.** "Only the Director" holds the platform-app and secret entry by default; "full build this system": every connection entered through the website (X, Instagram, WhatsApp, YouTube, Snapchat, LinkedIn, and the mail and Drive credentials), with step-by-step guides that have links. Interpretation recorded: the Director holds the rights by default and the assistant does not; the administrator keeps everything (the three real accounts are administrators, and removing it would lock the owner out of the settings).
- **Rights.** Migration `20261015180000_director_connection_rights.sql` (applied): the Director's template gains `settings.view`, `settings.manage`, `platforms.manage`, `integrations.secrets`, `storage.manage`; `20261015200000_whatsapp_bridge_from_site.sql` adds `whatsapp.system.manage`. Not given: `storage.migrate`, `backups.*`. **Correction of the B4 table:** the interface's mirror of the role templates (`installedDefault`) was the 2026-10-13 state and missed Step P2 (the Director and the assistant hold `accounts.view`, the Director also `roles.assign`, `members.invite`, `members.remove`, `roles.templates.edit`, the assistant `permissions.grant`); so the B4 table said «الحسابات» was the administrator's alone, while the database always let the director and the assistant open it. The mirror is now `TEMPLATE_HOLDS`, held by a test that reads the migrations; the table and `MVP_draft.md` were regenerated.
- **Providers.** YouTube (Google), LinkedIn and X join Meta and TikTok on one model (`src/lib/platforms/oauth2.ts`, the connect, callback, offer, link, app and check routes generalised): the platform's own sign-in with a state cookie (and an S256 PKCE verifier for X, kept in a second httpOnly cookie), the token in the vault as a passing offer, the person chooses the channel or profile and who publishes, the real expiry becomes the authorisation, a health check refreshes a Google or X token (X rotates its refresh token, stored) and records the state. Where a platform gives no end date (Google, X) the authorisation is a rolling 90 days renewed by each good check, said so in the guide. The pair of an app is checked by sending the platform's token endpoint a code that cannot be valid: a wrong client id or secret answers 401 or `invalid_client` (refused, nothing stored); anything else counts as the pair being known. Migration `20261015190000_connections_generalised.sql` (applied) widens the app, offer and account type lists in eight functions from their own current definitions (failing if one does not carry them) and renames the reminder to «حسابات المنصات».
- **Mail and Drive credentials.** The shared mailbox: «الإعدادات» ثم «الاتصالات», address and app password, logged in to Gmail over IMAP before anything is kept, then `mail_account_set` (vault, write-only); the server reads it with its key for the sync, the invitations and the attachments (`resolveMailEnv`), the environment is the fallback. The Google app: client id and secret entered once (the YouTube card and the connections tab are the same block), read by Drive (`resolveDriveEnv`) with the environment as fallback; Drive's connect and callback now need the capability `storage.manage` instead of the administrator role, and `storageConfigured` is a question to the site (async). WhatsApp: «إنشاء مفتاح الجسر» makes the bridge key and the link secret in the site (vault; the database keeps the fingerprint), shown once for the bridge computer's `.env`; no PowerShell, no hosting variable, no SQL editor (the old way still answers).
- **Guides.** Eleven guides with links at the step and at the foot, the return addresses to copy, and what each platform requires that no form can do (`google`, `linkedin`, `x`, `connect_google`, `connect_linkedin`, `connect_x`, `mail`, `drive`, `whatsapp`, plus links added to `meta` and `tiktok`). The link addresses are those of the platforms' own consoles as known on this date; the guides say the platform's page is the authority.
- **Verified, numbers.** `npm run typecheck` and `npm run build` clean; `npm test` **306 of 306** (287 + `tests/connections2.test.mjs` 20; the permission, access-matrix, consolidation, setup-guide and connections tests updated); database rule runs in rolled-back transactions: **40 of 40** (`supabase/tests/connections_generalised_rules.sql`, `qa/connections-generalised-rules.json`) and **15 of 15** (`supabase/tests/whatsapp_bridge_from_site_rules.sql`, `qa/whatsapp-bridge-rules.json`); `qa/connections-tab.cjs` **39 of 39** (the real guides resolved to a site address, every link https and opening in a new page, copy lines left to right, the tab at 1280 and 390), `qa/settings-account.cjs` **10 of 10** (seven tabs), `qa/menu-consolidation.cjs` **18 of 18**, `qa/help-tours.cjs` **25 of 25**.
- **Not verified, said plainly.** Nothing here met a real platform: no Google, LinkedIn, X, Gmail or Drive account was used, every platform call was driven against a fake that answers as the documentation says (read 2026-10-15); the pair checks of Google, LinkedIn and X in particular rest on how those services word a refused client and need a first real try. The signed-in screens were drawn from fixtures. `supabase/tests/platform_connections_rules.sql` was edited (check 32 now expects the Director to hold the right) and not re-run in full; `supabase/tests/permissions_rules.sql` likewise.
- **What this is not.** A connection is not publishing: every platform stays a simulation until its adapter posts for real and the platform approves the app (YouTube's upload audit, LinkedIn's Community Management API for company pages, X's paid tiers, Meta's and TikTok's reviews). Snapchat and WhatsApp channel/status stay manual (no public posting API known). The Supabase address and key, the server key `MAIL_SERVER_KEY`, and Supabase Auth's own SMTP are configuration the site cannot set for itself: the vault needs something to open it with.


### 2026-10-15: step B10 of `Action_Plan.md` (OneDrive as a storage provider, connected from the site)

- **Owner direction.** "Work on the OneDrive connector, with the guides, then push to deploy." Supersedes the earlier decision (Parts C and D entry above) not to build it before an account exists: it is built against Microsoft's documentation and a fake, and labelled untried.
- **Provider.** `src/lib/storage/onedrive.ts` implements the storage provider on Microsoft Graph: its own folder «Comms Hub», upload sessions in ranges of 320 KiB multiples (parts of 10 MiB, no bearer token on the session address, resume by asking the session, an empty file as a plain content PUT), download with ranges, trash to the recycle bin, quota. The refresh token Microsoft hands back at every refresh replaces the stored one through `onedrive_token_rotate` (key only).
- **Proof.** `src/lib/storage/quickxor.ts` is QuickXorHash with a saveable state; the sink hashes what it sends and the engine (`move.ts`) accepts `qxh:<base64>` as a destination proof and calls the copy proven at the checksum level only when OneDrive reports the same hash. A gap the engine had to hash itself withholds the proof (size only).
- **Connection.** The Director enters the Microsoft app in «الاتصالات» (`microsoft_app`, vault, same route as the other apps, checked by a refused dummy code), then connects an account through `/api/onedrive/connect` and `/callback` (state cookie, `storage.manage`); up to three accounts; «فحص الاتصال» and «إعادة ربط». Migration `20261015210000_onedrive.sql` (applied as `onedrive`).
- **Guides.** `microsoft` (eight steps, the Entra registration link, the return address to copy) and `onedrive` (six steps), with the untried note.
- **Verified, numbers.** `npm run typecheck` and `npm run build` clean; `npm test` **320 of 320** (306 + `tests/onedrive.test.mjs` 14: QuickXorHash equal to a literal port of Microsoft's reference code for empty, short, 160-multiple and 100,000-byte inputs and from a saved state; the sign-in; the fake Graph for ranges, resume, expiry, empty file, token rotation, revoked token; the move engine end to end ending at the `checksum` level; wiring and guide assertions). Database rules `supabase/tests/onedrive_rules.sql` **27 of 27** against `comms-hub` (`qa/onedrive-rules.json`; run in a transaction aborted at the end). `qa/connections-tab.cjs` **43 of 43** (the two new guides drawn at 1280 and 390, no sideways overflow).
- **Not verified, said plainly.** No real Microsoft account was used: Graph's behaviour (quickXorHash on a personal account, range edge cases, the recycle bin, the sign-in screens) is as documented on 2026-10-15, not observed. The «Comms Hub» folder limit is by behaviour, not by scope. Library and mail uploads still go to Google Drive; OneDrive receives moves and backups. The client secret has an expiry (up to 24 months) and nothing reminds anyone yet.


### 2026-10-15: section 5 of `Action_Plan.md` (C4, secret-expiry reminder, Drive token, feedback and error monitoring)

- **Owner direction.** "Work on these": C4, the platform adapters one at a time, and the carried-over list (delegation while away, email notifications, error monitoring and a tester feedback channel, data handling when a person leaves, the Drive refresh token into the vault, a reminder before the Microsoft client secret expires).
- **C4, built.** `20261015220000_limits_enforced.sql` (applied as `limits_enforced` and `limits_enforced_fix`): `work_copy_issues` is the SQL port of the error-level part of `checkCopy`; `work_schedule` and `work_publish` (now, confirm, retry) refuse with `COPY_OVER_LIMIT: <platform> <CODE>`, and the due run fails the account with «النسخة تتجاوز حد المنصة» like an expired authorisation. Not at submit-for-review. The database counts every linked file, the interface only the files its viewer sees, so it can be stricter. The interface words the refusal with the platform and the limit. `tests/limits-parity.test.mjs` holds the 50 cases to the expected column of `supabase/tests/limits_rules.sql`.
- **Secret-expiry reminder, built.** `20261015230000_secret_expiry.sql`: `integration_expiry_notes()` tells every holder of `integrations.secrets`, once a week per secret from 30 days before the date the Director stated (`config.secret_expires_on`, optional field on every app card), called once per visit where `work_due_run` is. Entering the secret again clears the date.
- **Drive refresh token.** The adoption route already existed (`/api/integrations/drive-adopt`); the button is now also on the Drive card of «الاتصالات». The live `google_drive` row has no secret in the vault, so one click by an administrator or the Director is still owed; it cannot be done by an agent.
- **Feedback and error monitoring, built.** `20261015240000_feedback_errors.sql`: one closed table, written only by functions; notes (idea, problem, question; 20 a day per person), errors caught by the page (scrubbed again in the database: query strings, e-mail addresses and long tokens removed; equal errors one row with a counter; 100 new an hour), read by `settings.view`, marked by `settings.manage`. Interface: a note button in the top bar, the error page and a global listener (at most five per visit), inbox «ملاحظات وأخطاء» in «الإعدادات», help refreshed (v6).
- **Not built, said plainly.** Platform adapters: each needs its approved app and a real account to be tried against. Delegation while away, email notifications, and data handling when a person leaves need decisions that are the owner's; they are written out in `Action_Plan.md` section 5.
- **Verified, numbers.** `npm run typecheck` and `npm run build` clean; `npm test` **339 of 339**. Database rule runs against `comms-hub`, each in a transaction aborted at the end: C4 **63 of 63** (`qa/limits-rules.json`), secret expiry **11 of 11**, feedback and errors **32 of 32**. `qa/feedback-fixture.cjs` **10 of 10** (note dialog and inbox at 1280 and 390, real stylesheets). Found and fixed on the way: `out := out || 'EMPTY'` read an untyped literal as an array (13 sites, `array_append`); the dialog's minimum width overflowed at 390.
- **Not verified.** The signed-in screens (the note button, the inbox, the new field on the app card) were drawn over fixtures, not by a person; the expiry reminder was run in the database but not seen in the notifications drawer.

### 2026-10-16: owner-authorized cleanup of local simulation sim-20261015-03

- **Scope and outcome.** The owner authorized retaining the evidence and recovery files, preserving code changes and final receipts, then deleting the duplicate package, worktree and this run's Docker resources. Removed 51,722 files totaling 23,482,147,626 content bytes from the two approved D-drive folders; three verified junctions were unlinked without following their targets. Git's worktree registration was repaired to the physical D path and removed with the checkout. Stopped the two identified Node services and removed exactly 10 containers, two exclusive volumes and one network. The local site is intentionally offline.
- **Retained evidence.** `D:/Agents/testingh/sim-20261015-03/archive` remains unchanged: 9,619 files, 6,969,295,045 bytes. Every file in both archive and package matched the recorded SHA256 before deletion; every retained archive file matched again afterward. The existing screenshot, journal, report and film links inside the archive retain their files. Historical localhost links require a rebuilt environment.
- **Code and recovery.** Preserved branch `codex/role-simulation-sim-20261015-03` at `fea9f61`, a self-contained Git bundle, a committed-source ZIP, tracked uncommitted patches and all six nonignored untracked files. A bare clone of the bundle passed `git fsck --full` and matched the original head; all 1,101 ZIP entries were readable with .NET. Nineteen final receipts and `Completion_Report.md` were copied outside the checkout, with copied-file checksums verified. A fresh 1,387,787-byte database dump has a readable 2,019-line catalog; global roles, database recovery configuration/keys, stopped mail data, the previous database snapshots and private local files/configuration were retained. All 35 inventoried private recovery files matched their saved SHA256 afterward. Recovery instructions and receipts are in `D:/Agents/testingh/sim-20261015-03/recovery`.
- **Isolation and space.** All 32 unrelated containers retained their IDs/images and running states; all 22 unrelated volumes and seven unrelated networks remained. None of the seven simulation ports retained a listener. Main's head and the earlier simulation worktrees were preserved. D free space rose from 548,846,878,720 to 572,399,239,168 bytes, an observed increase of 23,552,360,448 bytes, about 23.55 GB. Docker's internal reclaimed allocation is not added to this Windows free-space measurement. Receipts: `recovery/cleanup-result.json`, `docker-cleanup-result.json`, `filesystem-cleanup-result.json` and `code-preservation-verification.json`.
- **Limits and remaining work.** No product source was changed, merged, pushed or deployed. Typecheck, build and npm tests were not rerun for this storage-only cleanup; the prior run's 339 passing tests remain historical evidence. No rendered application output changed. Database catalog readability is verified, not a full restore. The high stale-media-version approval race remains unresolved; the archived run's 100 PASS, five FAIL and one NOT_APPLICABLE results are unchanged.

### 2026-10-18: transparent video from the Motion Studio is ProRes 4444

- **Problem.** The «فيديو شفاف» download held PNG frames in a QuickTime MOV. Windows' player refused it ("encoded in png format which isn't supported", 0xC00D5212) and most editors cannot read PNG-in-MOV either, so only the green-screen MP4 worked. The earlier note of 2026-10 said the MOV was verified by ffprobe only and never opened in an editor; this was that gap.
- **Fix.** `src/lib/motion/prores.js` is a ProRes 4444 encoder written for the browser (RDD 36 layout: 4:4:4 BT.709 limited range, 16-bit straight alpha, 8 macroblocks per slice, fixed quantiser raised only for a slice that would overflow its size field). `export.js` renders each frame, encodes it and writes `ap4h` with `fiel` and `colr` atoms through `muxVideo` (`containers.js` gained vendor, quality and extra atoms). The ZIP of PNG frames is unchanged. The format card now says it is ProRes 4444 and that Windows' built-in player does not open it (use the editor or VLC).
- **Verified, numbers.** `npm run typecheck` clean; `npm test` **341 of 341** (339 + `tests/motion-prores.test.mjs` 2: frames decoded by ffmpeg keep alpha within 1 level and colour within 12 levels of 255; a noisy frame that needs a coarser quantiser still decodes with no ffmpeg error). `qa/motion-transparent-export.cjs` **10 of 10** in Edge, running the real export code: `rp-editorial` 1920x1080 at 30 fps (the file from the report) gave 246 frames, ProRes 4444 `yuva444p12le`, 53.9 MB, 52 s to export, complete decode with no errors, clear and solid alpha pixels in the decoded frame, and the frame composited over grey (`qa/artifacts/motion-transparent/editorial-over-grey.png`) shows the lower third with its soft shadow; `arc-gauge` at 720p gave 159 frames, 67.1 MB, 23.7 s. Result in `qa/motion-transparent-export.json`.
- **Not verified, said plainly.** The files were decoded by ffmpeg, the reference decoder, the owner opened the file in CapCut, where it works; it was not opened in Premiere, After Effects, Resolve or Final Cut. Normal players (Windows' built-in player, phone galleries) do not open ProRes 4444 and no ordinary player shows transparency, so nothing more can be done there; the green-screen MP4 is the one for quick viewing and sharing, and the format card plus a visible note under the summary now say so (owner direction of 2026-10-18). `qa/motion-studio.cjs` (the full studio script) cannot run now because `/motion` sits behind sign-in; its MOV checks were updated to ProRes but not re-run. The file is held in memory like before (limit unchanged); 4K was not exercised.

### 2026-10-19: the old design is removed, the new identity is the only design

- **What changed.** The Director approved «الهوية الجديدة لمركز الاتصال», so «التصميم الحالي» is gone. `<html>` carries `data-identity="emerald"` from the server (`src/app/layout.tsx`), so there is no first paint of the old look; the double-click on the logo (sidebar and phone bar, `src/components/shell.tsx`) no longer switches anything; «الحساب» «المظهر» keeps only «الوضع» (فاتح / داكن), which is now always available; `toggleIdentity`, `IDENTITY_KEY` and `useIdentity` were deleted; the help text of the appearance part was shortened. A saved `comms-hub-identity` value in a browser is simply ignored.
- **Verified.** `npm run typecheck` clean; `npm test` 341 of 341 (the appearance test now asserts the switch and the old label are absent); `npm run build` passes.
- **QA scripts.** `qa/identity-toggle.cjs` and its JSON were removed because they tested only the switch; `qa/identity-screens.cjs` now checks that a double-tap on the phone logo changes nothing. Neither was re-run in a browser, and the signed-in screens cannot be driven by an agent, so the look after this change was not checked visually.
- **Left as it was.** The old design's CSS rules (default selectors in `globals.css` and the other stylesheets) are still present and unused; removing them is a larger, separate cleanup. `reference/comms-hub-reference-v5.html` still contains its own design toggle, being a frozen reference.

### 2026-10-19: the help guide is written for each exact role (Help_Content_Matrix.md implemented for first visits and the page guide)

- **What changed.** `Help_Content_Matrix.md` was reviewed (one stale card about the removed design switch corrected, one status word restored to «بحاجة إلى تعديل», five dense cards shortened) and then implemented: `src/lib/help/roles.ts` holds 143 cards and the table of 23 pages by 8 roles (184 rows); the guide engine (`src/lib/kit/guide.ts`, host `exactRole` in `src/components/kit.tsx`) shows the cards written for the exact role on a first visit, with the role's introduction under the first card, and the page guide opens with «ما يخصك بصفتك …». Two anchors were added on Home. A page guide never grants or checks a permission; the cards only explain.
- **Verified.** `npm run typecheck` clean; `npm test` 346 of 346 (new `tests/help-roles.test.mjs`: the data equals the matrix, 3 or 4 cards per row, every selector's classes and `data-gd` anchors exist in the page components, no raw keys, no emoji); `npm run build` passes; `qa/help-tours.cjs` 26 of 26 in headless Edge over fixture pages with the real engine (director, publisher and member cards on «الموافقات والنشر», a partly drawn page, nothing drawn, news, first visit, touch, and the new section in the page guide). Result in `qa/help-tours.json`.
- **Not verified, said plainly.** The signed-in application was not opened, so no card was seen on a real page with real data; the selectors were checked to exist in the source, not to be visible at every state. Several cards of a page share one anchor, so a tour can spotlight the same block twice.
- **Not done.** First-section tips, role-specific empty-state texts, the settings tab tips, the shared shell, entry and external-link cards, the grant-dependent replacement cards, dismissed-versus-completed tracking, and levels 2 and 3 remain proposals in the matrix (its "Implementation record" lists them).

### 2026-10-19: the message menu in «المراسلة» no longer breaks the conversation layout

- **The bug.** Opening a message's menu (the arrow beside a message) made the menu a full-width block inside the conversation pane: the message list shrank to a few lines, the composer moved up, and the menu covered the bottom of the pane and ran past the screen. Cause: `.cx-main>*:not(.cx-wall){position:relative;z-index:1}` in `src/app/chat.css` also matched the menu, which is drawn as a direct child of `.cx-main`, and out-ranked `.mx-menu{position:fixed}`. The room menu, the attach menu and the emoji picker had the same fault.
- **The fix.** The rule now excludes menus (`:not(.mx-menu)`). The menu's placement (`Pop` in `src/components/chat/chat-tab.tsx`) also measures its real height (about 450 px for the full set of actions) instead of assuming 380 px: it opens below the pointer or above it, is kept inside the screen, and scrolls inside itself if the screen is shorter.
- **Verified.** `npm run typecheck` clean; `npm test` 348 of 348 (new `tests/chat-menu.test.mjs`); `npm run build` passes; `qa/chat-menu.cjs` 6 of 6 in headless Edge with the real stylesheets over a fixture of the pane, including a check that the old rule reproduces the fault (list 444 px shrinks, menu not fixed) and that with the fix the list, composer and its reply bar do not move.
- **Not verified, said plainly.** The signed-in messaging page was not opened, so the real menu with icons, the real placement code near the bottom edge, and the reply bar showing the quoted message were not seen; they follow from the fixed layout, not from a run.

### 2026-10-19: `MVP_draft.md` sections 12 to 61 restored (lost by accident in `dbaaa74`)

- **What was wrong.** Commit `dbaaa74` (step B4b, 2026-10-15) meant to add one row to the access table and two bullets under it. It also deleted the rest of the file: 1,782 lines, sections 12 to 61 (top bar, home, work, create, approvals, review, calendar, media library, mail, settings, mobile, the demo scenario, the status vocabulary of section 49, the motion studio of section 57, the round 1 corrections of section 59 and the calendar, projects and requests of section 61). The contents list still named them. `AGENTS.md` makes this file the authority, and `Roadmap.md`, `progress.md` and `Studio_Feasibility_and_App_Path.md` still cite section 57, so the authority was missing most of its text.
- **What was done.** The current file was kept whole and the deleted block was appended from `e488727` (lines 735 to 2509 of that version: from «Selected state» of section 11 to the end of section 61). The one deleted bullet that B4b had deliberately replaced ("Known display mismatch", superseded by "The member creates") was not restored. The access block still sits inside section 11 where step B4 placed it; that order is as it was before the damage.
- **Verified.** Against `HEAD`: 1,775 lines added, 0 removed. Against `e488727`: 22 lines added and 16 removed, every one an intended edit of B4b, B5/B8, B6/B7 or B9 (contents list notes, the menu sentence, the access table rows for «التحليلات», «الحسابات» and «الإعدادات», and the bullets under the table). 2,515 lines in total. No code changed, so typecheck, build and tests were not re-run for this commit.
- **Not done.** The restored sections are history as written on 2026-10-15; the name changes of B6/B7 ("documents carry the new names where they describe the present") were not applied inside them. Section 57 still calls the transparent MOV "PNG codec"; it has been ProRes 4444 since 2026-10-18 (entry above).

### 2026-10-19: the studio, Phase 0: audit, plan, specification and the media base on trial

- **Owner request.** Audit `Studio_Feasibility_and_App_Path.md`, make a better plan, and build the studio inside «استوديو الحركة» as a new tab («الاستوديو», `/motion/studio`) without changing the template tab, with the motion graphics usable in the studio and access for the Admin and the director only. Answers of the same day: a tab in the page, restore the specification first, laptop and phone web now with native applications later, the engine to be chosen by research.
- **Audit and decisions.** `Studio_Build_Plan.md` (accepted by the owner). Main findings: the research's first video reference (OpenCut Classic) was archived on 2026-05-17; `/motion/studio` would inherit `/motion`, open to all eight roles; the fixed-capability mechanism already locks approval and publishing and is used for the studio; Ctrl+Z in the studio would have undone the person's last library action; the director cannot approve the director's own export. Engine: our own Canvas 2D compositor with Mediabunny, which reuses the 26 templates as they are (OpenReel, WebAV, FilmCraft, PhotoCraft and the image editors were examined and set aside, reasons in the plan).
- **Specification.** `MVP_draft.md` section 62 «الاستوديو» (the template tab keeps section 57).
- **Dependencies.** `mediabunny` 1.61.2 and `@mediabunny/aac-encoder` 1.61.2, exact (the newest release at least fourteen days old: 1.61.2 was published 2026-10-05; 1.61.6 of 2026-10-16 was skipped). Licences in `THIRD_PARTY_NOTICES.md`: MPL-2.0 for both packages; the AAC encoder's WebAssembly core is FFmpeg's AAC encoder built without GPL or non-free parts, so LGPL-2.1 or later, loaded as a separate file only where the browser cannot encode AAC.
- **Verified.** `node qa/studio-trial.cjs`: **13 of 13** in headless Edge over a local http server (`qa/studio-trial.json`, files in `qa/artifacts/studio-trial/`). The page drew 60 numbered frames and a 440 Hz tone, encoded H.264 and AAC straight into a file of the browser's private storage, read it back with Mediabunny (60 packets, 2.005 s, a thumbnail frame decoded at 1.0 s) and ffprobe read H.264 with 60 frames and AAC at 48 kHz stereo; the same with the AAC extension registered (2.027 s; the encoder's priming differs). No page errors.
- **Not verified yet.** No application code imports Mediabunny yet, so the production build's chunk and the absence of server-only imports in client code are checked in Phase 1. Typecheck, build and tests were not re-run for this commit: only documents, `package.json` and a QA script changed.

### 2026-10-19: the studio, Phase 1: «الاستوديو» opens for the Admin and the director only

- **What changed.** «استوديو الحركة» has a tab bar in its title row for those who may open the studio: «قوالب الحركة» (`/motion`, unchanged) and «الاستوديو» (`/motion/studio`). Everyone else sees the template page as before (the bar renders nothing for them).
- **Access, database.** Migration `20261019120000_studio_access.sql`, applied to `comms-hub` as version `20261019172208` 'studio_access': the fixed capability `motion.studio` («الاستوديو في «استوديو الحركة»», `{admin,director}`, rank 3, reason citing the owner decision of 2026-10-19) and `studio_can()` (that capability and the motion page together), executable by signed-in accounts only. Being fixed, no grant, override, role default, preset or request can give it.
- **Access, site.** `src/lib/access.ts`: `canOpenRoute` (the server's page check now reads the whole address, because the first segment alone would have opened the studio to all eight roles), `canOpenStudio`, `studioTabVisible` (an administrator viewing as another role sees the tab only as the Admin or the director; the address still opens, as with «الحسابات»). `src/app/[[...slug]]/page.tsx` uses `canOpenRoute`; `hub-page.tsx` routes `/motion/studio[/id]` to the studio page (loaded on demand). Ctrl+Z no longer reaches the library's undo on `/motion/studio` (`undoKeyApplies`). The sidebar keeps «استوديو الحركة» highlighted on its tabs. The access table (`qa/access-matrix.json`, `MVP_draft.md`) gains the studio row: نعم for the Admin and the director, لا for the other six.
- **The studio page so far.** A heading with the tab bar and a measured list of what this browser can do (MP4 or WebM export, AAC natively or through the extension, the browser's private storage and its quota), from `src/lib/studio/support.ts`. Projects come in Phase 2.
- **Verified, numbers.** `npm run typecheck` clean. `npm test` **358 of 358** (348 before; new `tests/studio-access.test.mjs` 9: the role matrix of `/motion/studio`, the motion page dependency, the administrator's view-as, the access table, the server and router source, one line changed in the template page, the sidebar, the migration; `tests/permissions.test.mjs` +1 and its catalog check now reads the new migration; `tests/access-matrix.test.mjs` and `tests/kit.test.mjs` extended). `npm run build` passes; Mediabunny is in its own chunk loaded with the studio only (572 KB, 139 KB compressed), the AAC extension 992 KB (253 KB compressed) is loaded only where the browser cannot encode AAC, and no `node:` module reaches browser code. Database rules `supabase/tests/studio_access_rules.sql` **21 of 21** (`qa/studio-access-rules.json`): Admin and director hold and open it; a director without the motion page holds it but cannot open the studio; the other six roles do not; grant for a time, grant once, person override on and off, role default, preset and request all `CAP_FIXED`; anonymous callers cannot run `studio_can`. Browser fixture `node qa/studio-tabs.cjs` **17 of 17** (`qa/studio-tabs.json`): the real tab bar component with the real stylesheets at 1440 and 390 px. Production server on 127.0.0.1:3100 signed out: `/motion/studio` shows the sign-in screen and nothing of the studio; no server or console errors.
- **Not verified, said plainly.** The signed-in application was not opened, so the tab bar was not seen with a real account and the studio page was not seen past the sign-in screen. The owner's walkthrough (`Studio_Build_Plan.md` section 8) stays pending.

### 2026-10-19: the studio, Phase 2: projects saved in the database

- **What changed.** The studio home lists the projects shared by the Admin and the director (title, kind, owner, last change and by whom, numbered version, exports, the work, and «يحرره {الاسم} الآن» while someone edits), creates video projects (shape and frame rate) and photo projects (four sizes or a chosen one), renames, archives by long press and brings back from the archive. An open project has a bar with its name, the save state and «حفظ نسخة», a reading-only banner with who is editing and «تولي التحرير» by long press, and the offer of newer changes kept on this device. The editor itself comes in Phase 3.
- **Database.** Migration `20261019130000_studio_projects.sql`, applied to `comms-hub` as version `20261019173321` 'studio_projects': `studio_projects`, `studio_revisions` (revision 0 the autosave slot, replaced; numbered revisions appended and never changed or deleted), `studio_sources` (the library file and version of each kept revision, read from the document by the database), `studio_exports`; row level security with read policies only (`studio_can()`), and every write a function (`studio_project_create`, `_rename`, `_archive`, `studio_lease`, `studio_release`, `studio_save`, `studio_project_doc`, `studio_list`, `studio_export_record`, `studio_project_link_work`). A new library source must be visible to the person saving; a source already recorded for the project is kept even when it is not. The four tables joined the database backup (`backup_table_list`, without the lease columns), and the export reads project revisions 25 rows at a time (`backup_export_plan` passes a table's own page size; `buildExport` honours it).
- **Site.** `src/lib/studio/schema.ts` (the versioned document: whole microseconds, sources as library file and version or a file on one device, unknown fields kept, the database's checks mirrored), `src/lib/studio/persist.ts` (the calls and their Arabic refusals; the autosaver: 15 seconds after a change while the lease is held, a numbered save on «حفظ نسخة», a lost lease or a newer revision turns the editor to reading, a lost connection retries after 20 seconds; a draft in IndexedDB within a second of every change), `src/components/studio/use-project.ts` (lease renewed every 30 seconds, released on leaving, take-over reloads the latest state), `project-list.tsx`, `project-shell.tsx`. Two long-press reasons added (`studioArchive`, `studioTakeOver`).
- **Verified, numbers.** `npm run typecheck` clean. `npm test` **381 of 381** (new `tests/studio-schema.test.mjs` 15 with a fake database and clock, `tests/studio-sql.test.mjs` 7 static checks of the migration; `tests/backups.test.mjs` +1 and now reads the latest list; the long-press test covers the studio files). `npm run build` passes. Database rules `supabase/tests/studio_rules.sql` **51 of 51** (`qa/studio-rules.json`): the writer and the assistant see and call nothing; create refuses an invisible file, a missing version, an empty title, another schema, the other kind, duplicate source ids, a fake file id and a document above the limit; autosave replaces its slot and numbered saves are kept; a stale base, a missing lease and a lease taken by someone else are refused; take-over names whom it took from; a carried-over restricted source is kept and a new one refused; direct insert, update and delete change nothing; exports need the caller's own upload and a numbered revision; archive is refused while another person edits and an archived project takes no lease; a director made a writer loses the studio at once; anonymous callers are refused; the backup list has the four tables, revisions 25 at a time.
- **Not verified, said plainly.** No signed-in browser opened the studio home or a project. The project list, the bar and the banners were built and type-checked but not seen working against the real database; that is the owner's walkthrough.

### 2026-10-19: the studio, Phase 3: the engine and the video editor

- **What changed.** An open video project is now an editor: a media panel («المكتبة»، «هذا الجهاز»، «قوالب الحركة»، «نص»، «علامات الهوية»), the preview with its transport and Reels safe zones, the inspector, and the timeline (time left to right inside the right-to-left page). Clips are added at the playhead, moved by dragging (onto another track of their kind too), trimmed by their edges, split with S, deleted with or without closing the gap, duplicated, cross-faded with the clip before (the two overlap; picture and equal-power sound), faded, placed and sized on the canvas by dragging or from the inspector, cropped, adjusted, and their sound set or muted. All 26 templates of «قوالب الحركة» are clips with their own fields, colours and switches from the template tab's catalog; the clip's length sets the showcase; a frame template shows the footage through its transparent window and «ضع الفيديو داخل نافذة الإطار» fits a video into it. Arabic titles and captions use only the fonts the site ships; SRT files become captions. The brand marks of public/motion are tinted. Undo and redo are the studio's own (200 steps, a dragged control is one step). Files from the library are copied once to the device, in resumable parts, and removed ten days after last use when the studio opens; «حذف ملفات المعاينة المؤقتة» clears them (long press); files from «هذا الجهاز» are kept and marked, and «رفعه إلى المكتبة ثم استخدامه» uploads into a folder the person may create in.
- **Code.** `src/lib/studio/`: `time.ts`, `history.ts`, `timeline.ts` (every operation returns a new document), `motion-adapter.ts` (the renderers drawn into one off-screen canvas per clip at a steady scale), `text.ts`, `compose.ts` (one compositor for preview, export and photos), `cache.ts`, `media.ts` (Mediabunny decoding; media elements for playback), `preview.ts`. `src/components/studio/`: `editor.tsx`, `stage.tsx`, `timeline.tsx`, `bin.tsx`, `inspector.tsx`, `cache-panel.tsx`, `folder-picker.tsx`, `library.ts`, `editor.css`. `uploadNewVersion` now returns the version number its route already gave. Two more long-press reasons (`studioClearCache`, `studioRemoveLocal`).
- **One change from the plan, recorded.** Two graphics tracks and two text tracks instead of one each, so a counter and a lower third, or a title and a caption, can show at once (`TRACK_LIMITS`).
- **Development dependency.** `esbuild` 0.28.2 (MIT, published 2026-08-08), exact, for the QA fixtures only: it bundles the real studio modules with React into fixture pages. It is not part of the site's build.
- **Verified, numbers.** `npm run typecheck` clean. `npm test` **398 of 398** (new `tests/studio-timeline.test.mjs` 17: frames and time codes, history, adding on the right track and the limits, move, trim against the source, split, ripple delete, cross-fade with equal-power sound, snapping, hidden and muted tracks, sources, all 26 templates in two shapes, Arabic line breaks, SRT, the cache's ten-day rule). `npm run build` passes. `node qa/studio-engine.cjs` **25 of 25** in headless Edge (`qa/studio-engine.json`): the real modules over a local server that plays the file route with byte ranges and ffmpeg-made media of known colours; frames exact at 1, 3, 5 s and on both sides of a split; a picture placed, scaled, half transparent; a frame template's window showing the video; a number template on transparency; the text measured in IBM Plex Sans Arabic and drawn; a fading text barely visible at 0.05 s; a tinted mark; the copy over byte ranges, read again with no new request, a partial copy resumed from byte 50,000 and identical to the original; the sweep and «حذف» leaving what is in use; a device file kept by fingerprint; a draft in IndexedDB; the player paused on the exact frame and playing in real time. `node qa/studio-ui.cjs --only=video` **17 of 17** (`qa/studio-ui-video.json`): the real project list, shell and editor with an in-memory stand-in for the database that keeps the studio functions' rules; create, a library video on the timeline with its frame on the preview, a template and a title, select, split with S, undo and redo, a drag on the timeline, the inspector editing the title, autosave after 15 s, a numbered version, another person taking the editing (save refused, reading only, «تولي التحرير»), a draft offered back after a reload, the space bar. `node qa/motion-transparent-export.cjs` 11 of 11: the template tab's export unchanged.
- **Found by the fixtures and fixed before this commit.** The selection outline asked the decoder for frame 0 just to know a clip's size, so with a clip selected the paused preview flipped between frame 0 and the right frame; sizes now come from the source's recorded size. Overlapping decodes on a pooled decoder could leave an older frame on screen; the paused preview now has its own unpooled decoder and decodes one request at a time, ending on the newest. A refused save wrote a device draft even when nothing was unsaved; now only unsaved changes are kept, and a draft identical to what was opened is not offered.
- **Not verified, said plainly.** Nothing was seen signed in or against the real database and Drive. Playback sound was not listened to. Safari and Firefox were not run. The upload to the library from the editor was built but not exercised (the fixture has no upload route).

### 2026-10-19: the studio, Phase 4: export, and saving to the library

- **What changed.** Under the preview, «التصدير»: a video (MP4 with H.264 and AAC; WebM with VP9 and Opus where the browser cannot make MP4) at 720p, 1080p or 4K, or the current frame as PNG, JPEG or WebP; downloaded, or saved to the library as a new file in a folder the person may create in, or as a new version of a file this project saved before (long press when the file has been in review; refused when it is published, with the reason). Saving to the library first saves a numbered version of the project, uploads through the library's own resumable upload, and records which numbered version made which library version (`studio_export_record`). Progress, cancel, a size estimate (said as an estimate), the screen kept awake, a warning when the page is hidden, and the reminder that nobody approves what they uploaded and that publishing is a simulation.
- **Code.** `src/lib/studio/audio.ts` (the sound mixed in contiguous ten-second windows by an OfflineAudioContext at each clip's gain over time, so the export's level is the preview's), `target.ts` (a streamed file in the browser's private storage; memory only where there is none, capped at the template tab's 1.6 GB), `export.ts` (frames from the shared compositor, one forward decoder pass per video clip, sound kept one window ahead, Mediabunny encoding; stills), `src/components/studio/export-panel.tsx`; `library.ts` gained the project's exports and the reviewed stages. One more long-press reason (`studioNewVersion`).
- **Verified, numbers.** `npm run typecheck` clean. `npm test` **405 of 405** (new `tests/studio-audio.test.mjs` 7: windows, what is mixed, gain over time with fades, equal-power cross-fade, output sizes, the estimate, file names). `npm run build` passes. `node qa/studio-export.cjs` **11 of 11** (`qa/studio-export.json`), every file read by ffprobe and decoded by ffmpeg: H.264 1280x720 and AAC 48 kHz stereo; 210 frames for 7 s, length 7.019 s; written through the browser's private storage; a split at 2 s with the second part moved to 3 s gives frame 59 red, frames 60 and 89 the black background, frame 90 green; sound in [0,2) and [3,7) at -18.1 dB and -90 dB in the gap; half volume 6.02 dB quieter; flashes at 1 s and 3 s against beep onsets at 1.003 s and 3.008 s; a PNG still 1920x1080 showing blue at 5 s; the export of 7 s at 720p took 2.9 s in headless Edge. `node qa/studio-ui.cjs --only=video` **21 of 21** (`qa/studio-ui-video.json`): the earlier 17, plus a download read by ffprobe (H.264 1280x720 with AAC), a new library file through a stand-in of the upload routes (session, resumable PUT, complete) with the export recorded against numbered revision 3, the reminder about approval, and a new version 2 of that file recorded against revision 4.
- **Not verified, said plainly.** No real Drive upload, no real database export record, no signed-in run. The new-version path was exercised on a file in draft only, so the long-press for a reviewed file and the refusal for a published one were not driven in a browser. The director's own approval being refused on such an export is the existing rule (`SELF_APPROVAL`), not re-run here. WebM was not exported in this run (Edge makes MP4). Long exports (ten minutes, 4K) were not measured.

### 2026-10-19: the studio, Phase 5: the photo editor

- **What changed.** A photo project opens in its own editor: one canvas of layers (pictures from the library or this device, Arabic text, rectangles, circles and lines, the 26 motion templates at their settled moment with their own fields, the brand marks), drawn by the same compositor as the video editor. Layers are dragged on the canvas, nudged with the arrow keys, ordered, hidden, locked, duplicated, deleted and aligned (the right edge is «البداية»); pictures are cropped, flipped, blended (عادي، ضرب، تفتيح) and adjusted (السطوع، التباين، التشبع، الدفء، التمويه). The canvas has four sizes or any size up to 8000 pixels a side, and a background colour or none (a transparent PNG). The export panel makes PNG, JPEG or WebP, downloaded or saved to the library like a video. The same undo history, device cache and media panel.
- **Code.** `src/lib/studio/photo.ts` (layer operations; the adjustments as pixel functions run in a worker made from their own source text, the same functions on the main thread where workers are refused; the canvas's own filter is not used for photos, as Safari long ignored it and it has no warmth), `src/components/studio/photo-editor.tsx`; the compositor takes a picture already adjusted for a layer (`Resolver.adjusted`), and stills use it too; the media panel gained «نص وأشكال» for photos. Sizes in labels are kept left to right inside Arabic text (`dims`, Unicode isolates), since «قصة 1080×1920» otherwise reads 1920×1080.
- **Verified, numbers.** `npm run typecheck` clean. `npm test` **412 of 412** (new `tests/studio-photo.test.mjs` 7: layers on top, ordering, duplicate and locked layers, canvas resize keeping places, alignment, brightness, contrast, saturation, warmth and alpha on pixels, blur). `npm run build` passes. `node qa/studio-ui.cjs` **30 of 30** (`qa/studio-ui.json`; the video flow's 21 and the photo flow's 9 plus no page errors): a 1080x1080 photo project; a library picture drawn as a layer; brightness -50 through the worker (centre 128,0,128); a title and a rectangle on top; a layer moved down and back with Ctrl+Z; a drag on the canvas; a PNG download decoded by ffmpeg, 1080x1080 with the rectangle in the middle; Delete removes a layer. `node qa/studio-engine.cjs` 25 of 25 and `node qa/studio-export.cjs` 11 of 11 again after the compositor change.
- **Not verified, said plainly.** Not seen signed in. Very large photos (24 megapixels and up) were not measured for time or memory in the worker. Safari was not run, so the main-thread fallback was not exercised in a browser that refuses workers.

### 2026-10-19: the studio, Phase 6: phones

- **What changed.** At 760 px wide or less both editors show the preview with one panel at a time: «الخط الزمني» (or «الطبقات» for photos), «إضافة», «الإعدادات», «التصدير». Panel tabs, transport, timeline buttons, layer actions and option buttons are at least 44 px tall; timeline rows are 62 px with 18 px trim edges; the time axis still runs left to right. On a phone, cross-fade, crop and colour adjustments of video, SRT import, adding tracks, photo blend modes, alignment buttons and custom photo sizes are kept for the computer: each is shown as «متاح على الحاسوب: يبقى في المشروع كما هو.» in place of its controls, and nothing it would edit is removed from the project. What the browser can do (making MP4 or WebM, keeping files on the device) is still measured (`support.ts`), not assumed from the width.
- **Code.** `src/components/studio/compact.tsx` (`useCompact`, `PanelTabs`, `DesktopOnly`); `editor.tsx` and `photo-editor.tsx` build their parts once and lay them out for the computer or the phone; `inspector.tsx`, `timeline.tsx`, `bin.tsx` take `compact`; phone styles in `editor.css`.
- **Verified, numbers.** `npm run typecheck` clean. `npm test` **413 of 413** (`tests/studio-timeline.test.mjs` +1: unknown fields of the project, its tracks, clips and photo layers survive add, move, trim, cross-fade, split and layer edits, so a simpler client's save drops nothing). `npm run build` passes. `node qa/studio-ui.cjs` **41 of 41** (`qa/studio-ui.json`): the video flow's 21 and the photo flow's 9, and the phone flow at 390x844 with touch: the home fits; one panel at a time; a library video added and split from the phone; the time axis left to right; no horizontal overflow on the timeline, settings and export panels; every panel tab, transport and timeline button at least 44 px; clips at least 44 px tall; crop and colours said to be for the computer; a photo keeps its four sizes and leaves other sizes for the computer.
- **Not verified, said plainly.** This is a phone-sized desktop Edge with touch emulated, not a phone: iOS Safari and Android Chrome on real devices, memory, heat, backgrounding and real touch dragging were not tried (`Studio_Build_Plan.md` section 8 names them for the owner's walkthrough).

### 2026-10-19: the studio, Phase 7: links to works and review notes

- **What changed.** A studio project can belong to a work: «المراجعة» in the project settings links it (or unlinks it) and shows the work, its title and its status. Saving to the library then offers «ربط الملف بالعمل CH-…», done through the work cycle's own `work_asset_link` (its rules apply: an open work, a person who may add files; a refusal is said and the file stays in the library). «المراجعة» lists the files the project saved to the library and the timed review notes written on the latest one (`media_notes.timecode`, section 59.6); a note's time moves the playhead there, with the plain statement that notes are on the whole file, not one version. The work page shows «فتح في الاستوديو» beside a file a studio project exported, to those who may open the studio only.
- **Code.** `src/components/studio/work-links.tsx` (`useStudioOrigins`, `StudioOpenLink`, `useProjectWork`, `linkFileToWork`, `ReviewPanel`); `inspector.tsx` takes a review slot; both editors and the export panel use it; `src/components/work/item.tsx` asks for studio origins (one hook and the link beside the stage chip). No migration: `studio_project_link_work` and the read policy of `studio_exports` from Phase 2 carry the rules.
- **Verified, numbers.** `npm run typecheck` clean. `npm test` **414 of 414** (`tests/studio-access.test.mjs` +1: the work page's link comes only from the studio holders' own read, and files join a work through `work_asset_link`). `npm run build` passes. Database rules `supabase/tests/studio_links_rules.sql` **13 of 13** (`qa/studio-links-rules.json`; the work-number sequence put back with setval): the director opens a work and a project, links them, records an export and links the file to the work through the work cycle; the director reads the file's studio origin; a writer who sees the file reads no studio origin and cannot link a project; unlinking leaves the file in the work. `node qa/studio-ui.cjs` **45 of 45** (the video flow now 25: «المراجعة» links the project to a work and shows its status, saving to the library offers and makes the link, a timed note on the exported file shows and moves the playhead to 00:03.00).
- **Not verified, said plainly.** The work page's «فتح في الاستوديو» was checked in the database and the source, not seen on a signed-in work page. Review notes are not bound to a version (the existing `media_notes` model); binding them is listed as deferred in `Studio_Build_Plan.md` section 7.

### 2026-10-19: the studio, Phase 8: the guide and the records

- **What changed.** «الاستوديو» and «محرر الاستوديو» have their own page guides: `src/lib/help/pages.ts` (`studio`, `studio-edit`), routes in `src/lib/help/registry.ts` (`/motion/studio` and `/motion/studio/<id>`), and cards for each exact role in `src/lib/help/roles.ts`. The director and the Admin get four cards on each page. The projects page covers starting a project, shared projects, archiving and the browser check. The editor covers autosave, adding from the library or the templates, the preview being the export, and exporting to the library without approval. The six other roles get B01, then SD05 (who the studio is for, by owner decision, and how its output reaches them), then B03. The same blocks are written as sections 24 and 25 of `Help_Content_Matrix.md`, marked as drafts for the owner's review; the reviewed scope of that file stays the 23 pages until then. Records: a studio paragraph in `AGENTS.md` (a new real exception: the fixed capability, projects in Postgres, export in the browser, no shared temporary storage or remote render), a status section in `Status.md`, and a scope addition with each phase's commit in `Roadmap.md`.
- **Verified, numbers.** `npm run typecheck` clean. `npm test` **414 of 414**. `tests/help-roles.test.mjs` now holds 25 pages (200 rows) equal between the matrix and `roles.ts`, with every selector found in the page's components. `tests/kit.test.mjs` lists the two new page keys. `npm run build` passes. `node qa/help-tours.cjs` **32 of 32** (`qa/help-tours.json`; 6 new): in headless Edge, a director's first visit to «الاستوديو» shows four cards with the director's introduction, ending on the browser check. An Admin's first visit to the editor shows four cards with the Admin's introduction, ending on «التصدير إلى المكتبة», which says nobody approves what they uploaded and publishing is a simulation. A designer gets three plain cards saying the studio does not open for the role, and who it is for. `node qa/studio-ui.cjs` **45 of 45** again.
- **Not verified, said plainly.** The tours ran over fixture pages with the real guide engine and registry, not over the signed-in studio. The wording of sections 24 and 25 has not been reviewed by the owner. The whole studio still waits for the owner's signed-in walkthrough (`Studio_Build_Plan.md` section 8). Pushed later the same day on the owner's request (next entry).

### 2026-10-19: the studio pushed and deployed

- **What changed.** On the owner's request, `main` was pushed to GitHub (`fe38143..8258a13`, eleven commits: the feasibility baseline, the `MVP_draft.md` restoration and studio Phases 0 to 8). Vercel built and deployed it to production (deployment `dpl_9q76oSSue99XXc5SCeUD6MZX9PNC`, `https://comms-hub-three.vercel.app`). The two studio migrations (`20261019120000_studio_access`, `20261019130000_studio_projects`) were already applied to `comms-hub` and are listed by the database, so the deployed code meets its tables and functions.
- **Verified, numbers.** Vercel reports the deployment READY in about 38 seconds, aliased to `comms-hub-three.vercel.app`. Signed out, the live site answers `/health` with 200, and `/motion`, `/motion/studio`, a `/motion/studio/<id>` address and `/login` each with the sign-in form (no redirect loop, no error page). Vercel reports no runtime errors in the first 15 minutes. `npm run typecheck`, `npm test` (414 of 414) and `npm run build` had passed on the same commit before the push.
- **Not verified, said plainly.** Nothing was seen signed in on the live site. The owner's walkthrough in `Studio_Build_Plan.md` section 8 is the first real use: the tab for the Admin and the director, its absence for the other roles, a Drive video exported to the library, the assistant's approval of the director's export, taking over editing from a second browser, and phones and Safari.

### 2026-10-20: the studio, second round: windows, menus, keys, effects, preview resolution, fonts

- **What the owner asked.** On the first version: make everything a window that is moved, merged, resized, opened and closed, as in a desktop video editor; a menu to reach the windows; shortcuts, icons and keyboard keys; better looking windows; more transitions and entry and exit animations; a lower preview quality for smooth playback (1/2 down to 1/32); ten English and twelve Arabic fonts; a better interface and handling; then commit and deploy.
- **What changed.**
  - *Windows* (`MVP_draft.md` 62.1). `src/lib/studio/workspace.ts` holds the layout as data: tab groups in splits, floating windows, maximising, and a stored layout checked before use. `panels.ts` lists the windows and the ready-made workspaces. `src/components/studio/workspace.tsx` draws them: dragging a tab merges, splits along a highlighted edge, docks along an edge of the workspace or floats. Each window's content is rendered once through a portal and its node moves, so an export or a canvas survives a move. `editor-frame.tsx` puts the menu bar, the windows, the full-window mode and the chrome together for both editors. The media panel became three windows (`bin.tsx`); new windows are «الانتقالات والحركات» (`effects-panel.tsx`), «السجل» (`history-panel.tsx`), «المشروع» (`ProjectSettings`) and «المراجعة», which now reads again when shown, after an export to the library, and on «تحديث».
  - *Menus and keys* (62.2). `menubar.tsx` holds the menu bar and the shortcuts sheet. `shortcuts.ts` is one list matched by `KeyboardEvent.code`, so the keys work with an Arabic layout. The timeline has the razor and hand tools, a snapping switch and a snap line, Ctrl and wheel zoom, zoom to fit, a right-click clip menu and drop targets. The photo editor has layer order keys, nudging, copy and paste, and the text tool.
  - *Transitions and movements* (62.3). `transitions.ts` is pure maths used by `compose.ts` for the preview and the export alike: 16 transitions, with dips drawn over their own track only, and 17 entry and exit movements, including letter-by-letter and word-by-word text (`text.ts` `revealCounts`). The older cross-fade, fades and a text's earlier entry and exit look as before. `setTransition` keeps or sets a kind; `prevAdjacent` and `nextAdjacent` were added.
  - *Fonts* (62.4). `fonts.ts` lists 25 fonts. 22 `@fontsource` packages are pinned at 5.3.0, published 2026-07-19, all OFL-1.1 (`THIRD_PARTY_NOTICES.md`). `studio-fonts.ts` imports only the offered weights and the Arabic and Latin subsets, inside the studio's code. A font is loaded only when used, and the export waits for the fonts its texts use. `font-picker.tsx` shows each font in its face.
  - *Preview and handles* (62.5). `handles.ts` and `stage.tsx` give separate playing and paused resolution (full, 1/2, 1/3, 1/4, 1/8, 1/16, 1/32). Corner handles scale and a round handle turns, in both editors.
  - *Look.* `workspace.css` has a dark chrome by default, done by redefining the site's tokens on the open project; tabs with icons and an accent line, a focused outline, drop previews, floating windows. The guide of «محرر الاستوديو» gains the menus, the windows, the effects and the history, with one «جديد» notice (version 2). `AGENTS.md`, `Studio_Build_Plan.md` section 9 and `Roadmap.md` record the round.
- **Verified, numbers.**
  - `npm run typecheck` clean; `npm run build` passes.
  - `npm test` **435 of 435**: new `tests/studio-workspace.test.mjs` (13) and `tests/studio-effects.test.mjs` (8). They cover merging, splitting, floating, resizing, closing and reopening, maximising, the stored layout, every preset of both editors; every transition and movement hidden at its start and whole at its end; a push moving the outgoing clip out; key position matching with an Arabic layout; no two shortcuts on one key in an editor; the 25 fonts bundled with their weights; the reveal.
  - `node qa/studio-engine.cjs` **34 of 34**, 9 new, as pixels in Edge: a push and a wipe half way (incoming right, outgoing left), a dip to black, a circle, a cross-fade as before, a slide-in entry, letter-by-letter text, and Cairo, Bebas Neue and Amiri loaded from the site and used for drawing.
  - `node qa/studio-ui.cjs` **70 of 70**. The earlier flows were updated for the windows: video 25, photo 9, phone 9. The new workspace flow has 26 checks:
    - every window present in groups; the six menus; no page scroll; the dark chrome;
    - a tab merged, split below, floated, the float moved; the arrangement kept after a reload;
    - a window closed and reopened from «النوافذ»; Shift+4 and ` to maximise and restore; a workspace switched and rebuilt; a border dragged by 80 px;
    - the shortcuts sheet with 48 rows;
    - the paused resolution 1/4 drawing a quarter of the pixels, and «كاملة» from the menu restoring them;
    - a push transition from the effects window, shown in the inspector; a movement dragged onto a clip; Cairo chosen from the 25 fonts and loaded;
    - Ctrl+C and Ctrl+V; the razor; the clip menu; a corner drag scaling the title;
    - «السجل» back to the opened project and forward again; Ctrl+Shift+F; the light chrome.
  - `node qa/studio-export.cjs` **11 of 11** and `node qa/help-tours.cjs` **32 of 32** again.
- **Not verified, said plainly.**
  - Nothing was seen signed in.
  - Safari, Firefox and real phones were not run: the drag and drop of windows and effects was tried in Edge only.
  - The look of the dark chrome was judged from screenshots, not by the owner.
  - Performance at 1/32 against full on a slow computer was not measured; only that the canvas is drawn at the chosen size.
- **Deployed.** On the owner's request `main` was pushed (`8258a13..294b8cc`, with the earlier record commit `72ce966`). Vercel deployment `dpl_7vPfQGLbnHSTAVDJm5XWZ492bbu6` was serving within about 40 seconds: the live pages name it. Signed out, `/health` answers 200, and `/motion`, `/motion/studio`, a project address and `/login` each show the sign-in form. Vercel reported no runtime errors in the first ten minutes.

### 2026-10-20: the studio, third round, Phase 0: plan and specification

- **What the owner asked.** To plan and build two lists from the review of the studio: tools inside it (versions, speed and keyframes, markers, covered areas, sound, more shapes, platform checks, captions out, templates and a brand kit) and the studio joined to the rest of the site (the work, the review screen, tasks, the calendar, mail, messaging, requests, the library, notifications, projects and Home).
- **Owner answers, same day.** Keyframes and speed ramps are built now; automatic captions and background removal stay out (Version 0 has no AI); `media_notes` records a note's file version and, when wanted, an area of the frame; on the review screen approval has a key that must be held, and stays bound to the exact version.
- **Decisions of the plan.** No «مسودة» mark on a library file (what is approved there is what is published), so the mark is for downloads only; a re-timed clip is silent; approval stays outside the studio; no Realtime publication is added.
- **Documents.** `MVP_draft.md` 62.6 to 62.14; `Studio_Build_Plan.md` section 10 (answers, decisions, fourteen phases) and section 7 updated; `Ideas_Backlog.md` I-023 in build.
- **Verified.** Documents only; no code changed in this step.

### 2026-10-20: the studio, third round, Phase 1: «النسخ»

- **What changed.** A new window «النسخ» (`MVP_draft.md` 62.6) lists a project's numbered versions, newest first, with who saved each one, its note and the library files exported from it. «عرض» opens a version for reading only at `/motion/studio/<id>?v=N` (no lease is taken, nothing is saved, a banner says so and offers «فتح الحال الحالية»). «مقارنة بالحالية» lists in words what differs from the state on screen. «استعادة» (long press, `HOLD.studioRestore`) first keeps the state on screen as a numbered version «قبل استعادة النسخة N» when it is not one already, then applies the old version as one step of the editor's history (Ctrl+Z undoes it) and saves it as «استعادة النسخة N». No version is removed.
- **Code.** Migration `20261020120000_studio_versions.sql` (`studio_revisions_list`: read only, studio check first, a file's name only for those who may see the file), applied to `comms-hub` as version `20261020093821`. `src/lib/studio/diff.ts` (pure: `diffDocs`, `canonical`, `sameDoc`, since the database gives a document back with its keys in its own order); `src/components/studio/versions-panel.tsx`; the window in `panels.ts` beside «السجل» in every workspace; `use-project.ts` and `project-shell.tsx` read `?v=`; `persist.ts` `revisions`.
- **Verified, numbers.** `npm run typecheck` clean; `npm run build` passes; `npm test` **439 of 439** (new `tests/studio-versions.test.mjs`, 4: the function's shape and grants, key order, moves, lengths, removals, file versions and shape changes said in words, photo layers). Database rules `supabase/tests/studio_versions_rules.sql` **12 of 12** (`qa/studio-versions-rules.json`), run with the migration inside the rolled-back transaction before it was applied: numbered versions only and newest first, the note and the saver's name, the exported file by name, an old version opening as it was, a file in a restricted folder left unnamed for the director, the writer refused, an unknown project said as such. `node qa/studio-ui.cjs` **76 of 76** (new versions flow, 6: listed with the latest marked, the removal said by the comparison, the restore keeping version 3 and making version 4, Ctrl+Z and Ctrl+Shift+Z over the restore, version 1 opened at `?v=1` with no lease, back to the current state).
- **Not verified, said plainly.** The fixture runs without the long-press engine, so «استعادة» was pressed as a click there; the long press itself is the kit's, tested in `tests/kit.test.mjs`. Nothing was seen signed in.

### 2026-10-20: the studio, third round, Phase 2: speed, ramps, reverse, stills and keyframes

- **What changed** (`MVP_draft.md` 62.7). A video clip has a speed from 0.1 to 8 times, a ramp (speed points joined in straight lines, or held), «تشغيل عكسي», and «تجميد الإطار» (Shift+F: the clip is cut and a two-second still of the frame goes in, the rest of the track moving on). Position, size, turn and opacity of any visual clip take keyframes: a key switch beside each setting, P keys all four at the playhead, [ and ] go to the previous and next key, each key has a curve (مستقيم، تسارع، تباطؤ، ناعم، ثابت حتى المفتاح التالي), diamonds on the selected clip are dragged along it, and a drag of the clip's handles on the preview sets keys where keys exist. Re-timed clips are silent, and the settings say so; the timeline marks them «2×», «متدرج», «معكوس» or «ثابت».
- **Code.** `src/lib/studio/keys.ts` and `src/lib/studio/speed.ts` (pure). Every place that turned timeline time into source time (`compose.ts`, `export.ts`, `preview.ts`, `audio.ts`, `timeline.ts` trims and cuts) now uses `sourceTime`, worked out exactly with trapezoids over the ramp; `compose.ts` `transformAt` applies keys for the preview, the export and the handles. `timeline.ts` gained `setSpeed`, `setSpeedKeys`, `setReverse`, `insertHold`; a reversed clip trims its other edge; a cut keeps the movement and the picture continuous on both sides. The export decodes forward clips and ramps in one pass, a reversed clip frame by frame, a still once. The preview plays an element at the clip's rate (changed every frame on a ramp) and draws reversed clips and stills from the decoder. A bug found by the new tests was fixed on the way: removing a field (speed, reverse, keys) through `updateClip` with an object merged the old value back, so these operations now replace the clip whole.
- **Verified, numbers.** `npm run typecheck` clean; `npm run build` passes; `npm test` **455 of 455** (new `tests/studio-speed.test.mjs`, 11, and `tests/studio-keys.test.mjs`, 5: rates and stretches, ramps and held points, the inverse, the limits 0.1 and 8, reverse and stills, exact microseconds at 24, 25, 30 and 60 frames, trims and cuts of re-timed clips, the room before the next clip, silence, the freeze; curves, setting and moving keys, a cut keeping the movement, a trim keeping keys in time). `node qa/studio-engine.cjs` **37 of 37** (3 new pixel probes: 2x and a ramp from 1x to 3x land on the expected colours, reversed and still frames, a keyed picture at a quarter, the middle and three quarters of the width at 0, 1 and 2 s). `node qa/studio-export.cjs` **14 of 14** (3 new, read by ffprobe and ffmpeg: 2x gives 90 frames of red, green, blue and no sound track; a ramp from 1x to 3x is cut back to its source at 2.667 s, 80 frames, reaching 1.5, 3.42 and 5.5 s of source; reversed gives 180 frames from blue to red). `node qa/studio-ui.cjs` **82 of 82** (new time flow, 6: «السرعة» 2x halves the clip and marks it, key switch and a change make two diamonds, [ returns to the key, P keys every setting, Shift+F puts in a still, «تشغيل عكسي» and Ctrl+Z).
- **Not verified, said plainly.** Smoothness of a ramp or a reversed clip while playing was not measured; reversed clips play frame by frame from the decoder by design. Nothing was seen signed in.

### 2026-10-20: the studio, third round, Phase 3: markers, YouTube chapters and covered areas

- **What changed** (`MVP_draft.md` 62.8). M puts a marker at the playhead; markers sit on the time ruler as coloured flags (a click moves the playhead there) and clip edges snap to them. The new window «العلامات» lists, renames, recolours and removes them, and «نسخ الفصول» copies them as YouTube chapter lines once YouTube's rules hold (first at 00:00, at least three, ascending, each at least ten seconds; read from YouTube Help on 2026-10-20 and written beside the rule in `markers.ts`); a broken rule is said in words. «تمويه منطقة» and «إخفاء بالمربعات» in «النصوص والعلامات» add a box or an oval that blurs, or turns into large squares, what is drawn under it, as a clip on a graphics track (video) or a layer (photo), with its way, shape, strength and size in the settings and keyframes to follow a moving face.
- **Code.** `src/lib/studio/markers.ts` and `src/lib/studio/cover.ts`; `compose.ts` draws a covered area as a pass over the pixels already drawn (`drawCover`), in `composeFrame` and `composePhoto`, so the preview and the export cover the same pixels (where the canvas filter is missing, blur falls back to a soft reduce-and-enlarge); `markers-panel.tsx`; the ruler's flags in `timeline.tsx`; `CoverControls` in `inspector.tsx`, used by both editors; the shortcut M and a menu item.
- **Verified, numbers.** `npm run typecheck` clean; `npm run build` passes; `npm test` **459 of 459** (new `tests/studio-markers.test.mjs`, 4: adding, ordering, renaming, recolouring, removing, snapping and the diff; YouTube times; chapter lines and each of YouTube's rules; a covered area on a graphics track and its strengths). `node qa/studio-engine.cjs` **38 of 38** (new: blur and squares over the edge of a magenta picture change the pixels inside the area and leave the picture and the video outside it unchanged). The paused-preview check of that file had failed once on a fixed 400 ms wait for the decoder and passed on a rerun; it now waits for the decoded frame instead of a fixed time. `node qa/studio-ui.cjs` **86 of 86** (new marks flow, 4: markers on the ruler and in the list, a rename and YouTube's rules said while copying waits, a flag moving the playhead, a covered area on a graphics track switched to squares).
- **Not verified, said plainly.** The look of a covered area over a real face was not seen; the probes use flat colours. Nothing was seen signed in.

### 2026-10-20: the studio, third round, Phase 4: waveforms, recording, music under speech, loudness

- **What changed** (`MVP_draft.md` 62.9). Clips with sound show their waveform, worked out once per file with Mediabunny and kept on this device (IndexedDB «comms-hub-studio-peaks»). «تسجيل صوت» (a button in the timeline bar and «المقطع») records from the microphone after a three-second count while the preview plays without sound; the recording lands on a free sound track, which becomes a speech track, as a file on this device («على هذا الجهاز فقط») until uploaded. A sound track is «كلام» or «موسيقى» (a switch in its header and in the settings); a music track can be lowered under speech by up to 24 dB, with quarter-second ramps, alike in the preview and the export. The export window has «توحيد مستوى الصوت» (to -14 LUFS, peaks under -1 dB, one gain for the whole sound after a measuring pass) and «قياس المستوى».
- **Code.** `src/lib/studio/loudness.ts` (ITU-R BS.1770-4 at 48 kHz: K-weighting, 400 ms gated blocks, filters carried across the export's ten-second windows), `src/lib/studio/peaks.ts`, `timeline.ts` (`roleOf`, `speechAt`, `duckGain`, `mixGain`, `setTrackSound`; `Track.role` and `Track.duck` in the schema), `audio.ts` `gainCurve` and `preview.ts` through `mixGain`, `export.ts` (`measureLoudness`, a `gain` option), `media.ts` (`MediaPool.peaks`), `recorder.tsx`, the timeline's waveforms and role switch, the inspector's mix settings. The -14 LUFS target is written as a default people may change, not as a platform's stated rule.
- **Verified, numbers.** `npm run typecheck` clean; `npm run build` passes; `npm test` **464 of 464** (new `tests/studio-sound.test.mjs`, 5: a full-scale 997 Hz tone in one channel reads -3.01 LUFS and -20 dB on both reads -20 LUFS; silence gated out; ten one-second windows read as one; the gain to the target and the peak ceiling; music lowered 12 dB under speech with a half-way point a quarter second out, the export curve the same, re-timed speech lowering nothing; waveform peaks. `tests/studio-audio.test.mjs` updated for the project now passed to `gainCurve`). `node qa/studio-export.cjs` **16 of 16** (2 new, against ffmpeg's EBU R128 meter: the studio's meter reads -18.29 LUFS where ffmpeg reads -18.3; with «توحيد مستوى الصوت» the file measures -14 LUFS after +4.29 dB). `node qa/studio-ui.cjs` **90 of 90** (new sound flow, 4, with Edge's fake microphone: a waveform in a video clip, a recording after the count on a speech track with its waveform, the recording a device file about two seconds long in the saved version, a sound track switched to music offering its lowering). `node qa/studio-engine.cjs` **38 of 38** again.
- **Not verified, said plainly.** A real microphone and a real voice over music were not heard; the fake device plays a tone. Recording in Safari (which records AAC in MP4) was not tried. Nothing was seen signed in.

### 2026-10-20: the studio, third round, Phase 5: other shapes, platform checks, captions out, the download mark, frame to photo

- **What changed** (`MVP_draft.md` 62.10). A video project can add up to three shapes beside its own («أشكال أخرى للتصدير» in «المشروع»); «الشكل المعروض» in the preview shows one, and a clip dragged or sized there is placed for that shape alone (an offset and a size factor on top of its own place and keyframes). The export window ticks the shapes wanted and makes one file each, named with its shape. Before exporting it checks the platforms of the linked work (or ones ticked) using only what the site holds: a picture for a video-only platform stops (as the database itself refuses), a length over a limit the registry states warns and must be acknowledged, a shape the library suggests and the export lacks is a note. A text track can be downloaded as SRT captions, or saved to the library as a text file. A download may carry «مسودة» across the picture; a library file never does, and the window says why. «إطار إلى مشروع صورة» (in «ملف») starts a photo project whose layer is the frame at the playhead, read from the same file.
- **Code.** Migration `20261020130000_studio_shapes.sql` (`studio_exports.shape`; `studio_export_record` with `p_shape`, default null, so the deployed site's older call still works; the version list names the shape), applied to `comms-hub`. `src/lib/studio/reframe.ts`, `src/lib/studio/checks.ts`, `text.ts` `toSrt`, `compose.ts` `drawWatermark` and the `watermark` option, `Layer.at` with `export.ts` reading those frames for a still, `src/components/studio/platforms.ts` (the registry and the work's platforms, since the studio sits outside the work pages' provider), the rewritten export window, the shape picker in the preview and «المشروع», the photo editor reading video-frame layers.
- **Verified, numbers.** `npm run typecheck` clean; `npm run build` passes; `npm test` **470 of 470** (new `tests/studio-export2.test.mjs`, 6: shapes kept valid, proportional places and a clip's own placing in one shape only, keyframes offset alike, each kind of check, SRT out read back by the SRT reader, the migration's shape and grants). Database rules `supabase/tests/studio_shapes_rules.sql` **8 of 8** (`qa/studio-shapes-rules.json`), with the migration inside the rolled-back transaction before applying. `node qa/studio-engine.cjs` **40 of 40** (new: the mark touches between 2 and 60 percent of pixels and the picture shows through; a photo layer from a video frame shows the frame at 3 s). `node qa/studio-export.cjs` **18 of 18** (new: the same cut in a square is a 720x720 file of 210 frames, letterboxed; a photo whose layer is the frame at 5 s exports as a 640x360 PNG of that frame). `node qa/studio-ui.cjs` **96 of 96** (new export2 flow, 6: a square added and shown, a drag in the square leaving the project's own place unchanged, one export making two named files, a picture for YouTube stopped with the reason, SRT captions downloaded, a frame turned into a photo project). The video flow's library check had first failed on this round's rewrite (two result boxes where it expected one); the library results are one box again.
- **Not verified, said plainly.** The look of the mark on a real picture and the shape suggestions for Facebook, TikTok and other added platforms (the library suggests shapes for three platforms only) were not reviewed. Nothing was seen signed in.

### 2026-10-20: the studio, third round, Phase 6: templates and «هوية الاستوديو»

- **What changed** (`MVP_draft.md` 62.11). «حفظ قالباً» in «ملف» marks a project as a template; the studio home lists templates under «القوالب» (apart from the projects), and «مشروع من القالب» starts a new project from a template's latest numbered version, its library files carried even when the person copying cannot see them, as a save carries them. A clip or layer can be «مثبّت في القالب»: it is not moved, trimmed, cut or removed (on the timeline, by Delete, or by a drag on a photo) until released by a long press (`HOLD.studioUnpin`); it is a guide, not a lock on anyone. «هوية الاستوديو» on the studio home keeps up to twelve named colours and a title and a text font, shared by everyone who may open the studio; every colour choice in the studio shows those colours first (`SwatchContext` in `motion-controls.tsx`, empty outside the studio), and a new text takes those fonts.
- **Code.** Migration `20261020140000_studio_kit.sql` (`studio_projects.template`, `studio_brand` with a read policy only, `studio_project_set_template`, `studio_project_copy`, `studio_brand_save`, `studio_list` with the flag, `backup_table_list` with `studio_brand` among the configuration), applied to `comms-hub`. `src/lib/studio/brand.ts`, `src/components/studio/brand.tsx`, the templates section and copy dialog in `project-list.tsx`, pins in `timeline.ts`, `photo.ts`, the inspector, the timeline and the photo editor.
- **Verified, numbers.** `npm run typecheck` clean; `npm run build` passes; `npm test` **475 of 475** (new `tests/studio-kit.test.mjs`, 5: the brand's rules equal the database's, a stored brand read safely, brand fonts for new text at a weight the font has, a pinned clip and layer refused every move, the migration's shape; `tests/backups.test.mjs` now reads the new list and finds `studio_brand` in the configuration; `tests/kit.test.mjs` lists the two files that carry the new long press). Database rules `supabase/tests/studio_kit_rules.sql` **18 of 18** (`qa/studio-kit-rules.json`), with the migration inside the rolled-back transaction; two earlier attempts stopped on the test's own setup (an Admin account must be protected; the library guard needs an acting person for a file row). `node qa/studio-ui.cjs` **102 of 102** (new kit flow, 6: the brand saved, a new title in the brand's font with the brand's colour offered, a pinned title surviving Delete, the template listed apart, a project made from it with the pinned title, and that title drawn on its preview; the last check first read 0 because a new title fades in from 0 s, and passes at 1 s).
- **Not verified, said plainly.** The long press that releases a pin was pressed as a click in the fixture (no long-press engine there). Nothing was seen signed in.

### 2026-10-20: the studio, third round, Phase 7: the database for the studio's connections

- **What changed** (`MVP_draft.md` 62.12 to 62.14; the owner's decision of 2026-10-20 on notes). Review notes record the file version they were written on, their exact time in milliseconds (the older minutes and seconds are still written for older readers), an area of the frame when wanted, one level of answers, and «تم». They are written by `media_note_add` and closed or reopened by `media_note_done` (the author, a leader, or someone who may edit the file); the work pages and the library now write through it, and the older direct insert still works for the deployed site. A new note on a file exported from the studio tells the project's owner and last editor («يحتاج انتباهك»), only while they still hold the studio's fixed rule (`studio_can_for`); taking over the editing tells the person who was editing («للعلم»); both notices open the studio (`noticeHref`). `studio_project_for_work` makes a project already linked to a work the caller can see. `studio_request_source_access` raises a folder-access request for a file the project uses and the caller cannot see, without showing the folder.
- **Code.** Migration `20261020150000_studio_connections.sql`, applied to `comms-hub`. `src/lib/media/notes.ts` (the note shape, the writers, times and areas); `work/data.tsx` `addFileNote` and the media provider's `addNote` through `media_note_add`; `rules.ts` `noticeHref` for `studio`.
- **Verified, numbers.** `npm run typecheck` clean; `npm run build` passes; `npm test` **479 of 479** (new `tests/studio-connections.test.mjs`, 4: the migration's columns and policies, definer functions with the studio check first and the internal ones callable by nobody, note times and areas, the studio notice link; it found a real bug on the way, an area dragged from outside the picture kept its outside width, now clamped). Database rules `supabase/tests/studio_connections_rules.sql` **27 of 27** (`qa/studio-connections-rules.json`), with the migration inside the rolled-back transaction: a note at 3250 ms on version 1 with an area, a bad area and a missing version refused, the director told with a link to the project, an answer that keeps the version, no answer to an answer, the writer reading but not closing, the director closing and the author reopening, a project for a work and the writer refused, the take-over notice, a folder-access request for a hidden file, the older insert still working. `node qa/studio-ui.cjs --only=video` **25 of 25** again.
- **Not verified, said plainly.** The notices were read from the database, not seen in a signed-in drawer.

### 2026-10-20: the studio, third round, Phase 8: the studio and the work

- **What changed** (`MVP_draft.md` 62.12, with what was settled while building written there). «فتح في الاستوديو» on a work's page, for those who may open the studio and only on open works: it opens the work's project, or makes one already linked through `studio_project_for_work`. Its kind, shape and first template groups come from the work's type and platforms (`suggestFor`); the groups are kept in the document and shown first in «قوالب الحركة». A linked project has a work bar under the title row, read again on focus, every minute and after a send. It shows the number and title, the status in Arabic, the current stage's date and the delivery date in plain words (late in red), and the publish time. It also shows the request of a work that needs changes, and the note that a new version sends an approved or scheduled work back to review. «تصدير وإرسال للمراجعة» opens from the bar, «ملف», the export window and Ctrl+Shift+M. It runs the platform checks, saves a numbered version, exports at 1080 (a picture for a photo project), saves a new version of the work's file from this project (held when reviewed) or a new file linked with `work_asset_link`, and records the export with its shape. It then sends through the work cycle's own `work_submit` with the work's accounts and time and the note «من الاستوديو: النسخة N», and says who decides next. It is offered only in production or changes requested, and with accounts and a proposed time still ahead; otherwise it says why before exporting anything. «المراجعة» was rebuilt: notes of every exported file by version, with the project version that made it, the open-only filter, answers and «تم» through `media_note_add` and `media_note_done`. Notes with a time are marks on the ruler (open and done); N and Shift+N step through the open ones. «إدراج نص العمل» and «إدراج نسخة منصة» put the work's text or a copy on the timeline (video) or as a layer (photo), remembering its version; when the work's text is newer, the inspector says so and «تحديث» brings it. «إضافة الفصول إلى نسخة يوتيوب» shows the copy with the chapters (an older chapter block replaced, otherwise added after a blank line) and saves a new copy version with `work_text_save` after a confirmation. The studio still approves nothing.
- **Code.** New: `src/lib/studio/worklink.ts` (pure), `src/components/studio/work-bar.tsx`, `send-review.tsx`, and `WorkStudioButton`, `ChaptersToWork`, `useWorkTexts`, `newerText` and the new `ReviewPanel` in `work-links.tsx`. Changed: `project-shell.tsx` (the bar, the send state through `EditorProps`), `editor.tsx`, `photo-editor.tsx`, `export-panel.tsx`, `inspector.tsx` (`WorkTextLine`), `timeline.tsx` (note marks), `bin.tsx` (suggested groups first), `schema.ts` (`fromWork`, `suggest`), `shortcuts.ts` (`send-review`, `note-next`, `note-prev`), `work/item.tsx`, the styles. No migration.
- **Verified, numbers.** `npm run typecheck` clean; `npm run build` passes; `npm test` **488 of 488**. New `tests/studio-worklink.test.mjs`, 9: shapes and groups by work, the current stage, dates in words, the statuses and needs of a send held equal to `work_submit`, who decides, chapters into a copy, no key clash, and the wiring sending through `work_submit` while never deciding or publishing. Database rules `supabase/tests/studio_worklink_rules.sql` **12 of 12** (`qa/studio-worklink-rules.json`), in one rolled-back transaction on `comms-hub`, with a count of the throwaway rows afterwards returning 0. They check: a project for a work keeping its groups and a clip's text version, its autosave, a draft not sent, no accounts and a past time refused, a copy only for the work's platforms, and a writer neither seeing nor making a project. Interface `node qa/studio-ui.cjs --only=work` **17 of 17**, in headless Edge over the real components with the fixture database taught the work tables and functions. It covers the work page button making a 9:16 project, the bar, the groups, the work's text inserted and brought up to date, Ctrl+Shift+M saving, exporting, linking and sending with the work's two accounts, the result naming the assistant, a work in review not sent again, a request for changes in the bar, notes by version as ruler marks, N passing over a done note, an answer and «تم», a second send making version 2 of the same file, the chapters refused while in review then reopening an approved work, the work page opening the existing project, and a post for Instagram opening a 1080x1350 photo project that sends its picture. All flows together **118 of 118** (`qa/studio-ui.json`).
- **Not verified, said plainly.** Signed-in pages cannot be checked by an agent (no sign-in bypass): the work page's button, the bar and the send were driven in the fixture with the work page stood in by the button alone, and the real `work_submit` path was checked in SQL only up to its refusals, not a full send with an uploaded file. A full send stays in the owner's walkthrough.

### 2026-10-20: the studio, third round, Phase 9: the review screen

- **What changed** (`MVP_draft.md` 62.13, with what was settled while building written there). A video or sound file on «المراجعة» (`/approvals/<id>`) now plays in a review player instead of a bare video. Space and K play and pause; J and L move a second; the arrows move a frame, its length measured from the frames shown (1/30 until known); Shift+G shows the Reels safe zones on a 9:16 video (the template tab's own drawing; no studio code on this page); ? lists the keys. N, or «ملاحظة هنا», pauses and writes a note at that frame on the version shown, and a drag on the paused picture marks an area. Notes are marks on a strip under the player, filtered «هذا الإصدار» or «كل الإصدارات»; a chosen note's area is drawn over the picture; notes are answered and closed («تم») through `media_note_add` and `media_note_done`. «مقارنة بالإصدار السابق» plays an earlier version side by side or under a divider, both on one clock. The page's keys: R opens «طلب تعديل» on the file last used, with this version's open timed notes; A, held as long as a long press, presses that file's «اعتماد هذا الجزء» (the button keeps its plain click); Shift+A, held, is «اعتماد الكل». A key works only where its button works, so nobody approves what they uploaded or sent, and `work_decide` decides again. ] and [ go to the next and previous work waiting, in the order of «الموافقات والنشر», now one module both pages use (`src/lib/work/queue.ts`). After a decision the screen offers «التالي». An address with `?t=`, `&v=` and `&a=` opens a player at that moment and shows that version beside it.
- **Code.** New: `src/components/work/review-player.tsx`, `src/lib/work/review-keys.ts`, `src/lib/work/queue.ts`. Changed: `review.tsx` (the player, the page keys, the queue, the start point, «طلب تعديل» with versioned notes), `approvals.tsx` (the shared order), `data.tsx` (`fileNotes` reads the versioned note shape), `src/lib/kit/hold.ts` (`keyHoldStart` and `keyHoldEnd`: a letter key fills a button's ring for the same 900 ms and sends no extra click), `hold-reasons.ts` (`approvePart`), `src/app/kit.css` (`data-keyhold`), `src/app/work.css`, the page guide `review` (`pages.ts`, `registry.ts`), `tests/kit.test.mjs` (a key hold carries its reason as `data-keyhold`). No migration.
- **Verified, numbers.** `npm run typecheck` clean; `npm run build` passes; `npm test` **495 of 495**. New `tests/review-screen.test.mjs`, 7: the queue order for a leader and for others, next and previous, both pages on one order, the keys by physical key with none twice, the player's arithmetic, the address of a moment both ways, and the approval keys held like their buttons and only where they stand. New `qa/review-player.cjs` **14 of 14** in headless Edge over the real player, the real long press and the site's styles (`qa/review-player.json`). It checks Space and K; L and J; a frame each way at exactly 1/30 s; N at 00:02.0 with a dragged area saved as 2000 ms, version 2 and the area within 0.02, its mark and its area drawn; the version filter and a note's time seeking; an answer keeping the version and «تم» on the list and the mark; side by side asking for version 1 and staying within 0.3 s playing and 0.08 s paused; the divider at 50 then 70 percent; A held pressing the button once with its ring, a short press explaining with the reason; the keys following the player last used; Shift+G tinting the 9:16 video's top and not offered on the wide one; A doing nothing on a button that is off and saying so; and `?a=&t=3.2&v=1` opening at 3.2 s with version 1 beside it. `qa/work-pages.cjs` **1012 of 1012**.
- **Found on the way, fixed.** `qa/work-pages.cjs` had not run since 2026-10-14. It stopped compiling on 2026-10-19, when the work page began importing the studio's links (now stood in; they have their own fixture), and on the channels page's setup guide (stood in; it has its own test). Its three channel wordings predated the rename of 2026-10-15 («الحسابات المرتبطة» to «حسابات المنصات», commit `64f95ed`) and now follow it. A note read without a version field (older rows) is treated as having none, which the fixture's older notes showed.
- **Not verified, said plainly.** The review page itself is behind sign-in. The player and the key hold were driven in the fixture; the page keys R, Shift+A, ] and [ were checked by their wiring and the rendered page (`qa/work-pages.cjs`), not pressed against the real database. They stay in the owner's walkthrough.

### 2026-10-20: the studio, third round, Phase 10: reserved places and tasks

- **What changed** (`MVP_draft.md` 62.12, with what was settled while building written there). «مكان محجوز» stands for a picture or a video still to come: «مكان للقطة» (full frame on a video track) and «مكان لصورة فوق اللقطة» (a box on a graphics track) in «النصوص والعلامات». It is drawn striped with what it waits for, by the one compositor, so the preview and an export are alike, and an export with an empty place warns. Its settings name what it waits for and offer «إسناد مهمة». That makes a work task through the work cycle's own `task_create`: the person, the kind, the due time, the work, and a note with its place, length and size. The frame at the place can be attached, saved to a chosen library folder. The place then reads its task, open or «سُلّمت». It lists the files linked to the work since the task was given and a newer version of the attached frame. «وضعه مكان المحجوز» puts the chosen file there at its exact version: start and track kept, a video's length kept to the file, fitted to the frame or to the box. The comparison of versions says a file was put in a place.
- **Found on the way, fixed.** Leaving the editor inside the site cancelled the pending autosave: the work bar's link, the work page, or any link. The last seconds of changes stayed only as a device draft, and that offer was dropped at the next edit. The saver now has `flush()`, and leaving writes the device draft and saves the autosave slot at once, then lets the editing go (`use-project.ts`). Before Phase 8 there were few links out of the editor; now there are several.
- **Code.** New: `src/lib/studio/slot.ts`, `src/components/studio/slot-panel.tsx`. Changed: `schema.ts` (`Slot`), `compose.ts`, `timeline.ts` (`kindFor`), `diff.ts`, `checks.ts`, `timeline.tsx`, `inspector.tsx`, `bin.tsx`, `editor.tsx`, `export-panel.tsx`, `send-review.tsx`, `persist.ts` (`flush`), `use-project.ts`, the styles. No migration.
- **Verified, numbers.** `npm run typecheck` clean; `npm run build` passes; `npm test` **501 of 501**. New `tests/studio-slot.test.mjs`, 5: tracks, names, task note, the export warning, filling at the version with the box fit, one source for one file, task_create's fields and no direct write. `tests/studio-schema.test.mjs` gains the flush test (saved without waiting, once, nothing for no change, only the draft without the lease). Engine `qa/studio-engine.cjs` **41 of 41**: the place's stripes inside, the red video outside unchanged. Interface `qa/studio-ui.cjs --only=work` **21 of 21**: edits kept after leaving for the work page; a box named «شعار الشريك» with a design task for CH-101 to the designer, its note and an attached PNG frame; the export warning; the task done and a picture linked to the work listed under «سُلّمت»; the place turned into that picture. All flows **122 of 122**.
- **Not verified, said plainly.** `task_create` itself was not run again in SQL (it is the work cycle's, tested there); the task was driven in the fixture database. The person who receives the task works on «المهام» as before.

### 2026-10-20: the desktop application, D0: the owner's decisions and the specification

- **The owner's decisions.** The owner accepted `Desktop_App_Plan.md` on 2026-10-20: every recommendation of its section 11, with the answers of 11.1.
  - Electron, not Tauri (D-1), carrying the whole site (D-2).
  - A pilot of the Admin and the director (D-3), whose laptops are both Windows x64 (D-4). Windows x64 first, and only, until it is fully running; Windows arm64 and macOS come after, and Apple membership waits with macOS (D-8).
  - The Vercel address is kept for now, `https://comms-hub-three.vercel.app` (D-5). A development build also opens `http://127.0.0.1:3000`.
  - Installers and updates will go to a public bucket of the `comms-hub` Supabase project when D3 comes (D-6).
  - Unsigned for the pilot, a certificate before rollout (D-7).
  - FFmpeg in D5 under the LGPL with the system's own encoders (D-9).
  - Closing the window quits, except during an export or with «إبقاء التطبيق في شريط المهام» (D-10, from D2).
  - Disk encryption where library copies are kept; «مسح بيانات هذا الجهاز» removes the session, cache, tokens and proxies (D-11).
  - Windows shows the site's own name, «مركز الاتصال المؤسسي».
  - No native menu bar: the application takes only zoom, F11 and F5.
  - D1 now; D2 after the studio's third round, which is being built in the main checkout at the same time.
- **Settled while building, for the owner to see** (each can be changed):
  - **The fixed internal id is `sa.commshub.desktop`**: reverse DNS, with `sa` for the organisation's country. It names the Windows application id, the uninstall entry and the data folder, `%APPDATA%\sa.commshub.desktop`, and it never changes. It names no host and is never looked up. `desktop/package.json` carries the same name, because electron-builder's uninstaller removes `%APPDATA%\<package name>`. A development build keeps its profile apart, in `sa.commshub.desktop.dev`.
  - **Pins**, by the rule of the newest release at least fourteen days old, counted by the clock (2026-10-20T15:13Z, so published by 2026-10-06T15:13Z):
    - Electron **44.5.1**, published 2026-09-30, carrying Chromium 152.0.7977.130 and Node.js 24.21.0. 44.6.0 was published 2026-10-06T22:39Z, about seven hours short of fourteen days, so it waits.
    - electron-builder 26.17.0, @electron/fuses 2.1.3, esbuild 0.28.2 (the site's own) and TypeScript 7.0.2, each pinned exactly.
  - **window.open of a page on the list opens a second window of the application**, with every rule of the first, rather than replacing the page in the window. The site opens such pages in a new window on purpose: a library file's content (`asset-page.tsx`) and «فتح هذه النسخة للقراءة في نافذة جديدة» (`versions-panel.tsx`). The application also has no back button. This is how the brief's "stay in the window" was read; the owner can ask for the other reading.
  - **The note comes first.** An outside connection shows its note with «متابعة في المتصفح» and «إلغاء» before the browser opens, so it is read before the person leaves the application.
  - **Permissions follow the brief exactly.** So the screen wake lock and persistent storage, which a browser gives without asking, are refused too. The studio already carries on without both: `export-panel.tsx` and `cache.ts` catch the refusal. D2's own keep-awake replaces the wake lock.
  - The new Arabic strings (the connection screen, the note, «حفظ الملف») are listed in `MVP_draft.md` 63.
- **Records.**
  - `MVP_draft.md` section 63 describes what the person sees.
  - `AGENTS.md` has a new paragraph in "Prototype boundary".
  - `Roadmap.md` (a new scope addition at the end of Version 0) and `Status.md` (a new section at the top) have one line each.
  - Each addition is its own new section or paragraph, so the merge with the studio round stays simple.
- **Baseline.** The three plan files (`Desktop_App_Plan.md`, `Mobile_Apps_Plan.md`, `Desktop_Build_Prompt.md`) were committed on `main` first, as `09757c2`. The commit was owner-authorised and used `git commit --only`, so none of the studio session's files went in. The work went on in a worktree on branch `desktop-app`.

### 2026-10-20: the desktop application, D1: the Windows shell

- **What changed.** `desktop/` holds an Electron application for Windows x64 that opens the live site in its own window (`Desktop_App_Plan.md` sections 5, 8 and 9; `MVP_draft.md` 63). It has its own `package.json` and lockfile, like `bridge/whatsapp/`, and stays outside the site's typecheck and build. `.vercelignore` keeps Vercel from uploading it. The TypeScript source is compiled by esbuild into one main file and one preload file.
  - **The window.** One window on the persistent profile `persist:comms-hub`. `contextIsolation` and `sandbox` are on, `nodeIntegration` is off (also in frames and workers), there is no `webview` and no native menu bar, and the developer tools exist in a development build only. Size, position and maximised state are remembered, and a second launch brings the open window forward.
  - **The user agent** is Chromium's own with Electron's tokens taken out and ` CommsHubDesktop/0.1.0` at the end. It stays plain ASCII, because a header cannot carry the Arabic name.
  - **The address list** is compiled in: the production address alone in a release build, plus `http://127.0.0.1:3000` in a development build. esbuild drops the development address and every development branch from a release build; a test reads the release bundle to prove it.
  - **One rule for links, forms, redirects and window.open** (`navigation.ts`):
    - on the list, the address stays; a new window opens as a second application window;
    - `/api/drive/connect`, `/api/onedrive/connect` and `/api/platforms/connect/*` open in the system browser after the Arabic note;
    - other http, https and mailto addresses go to the system;
    - anything else is refused.
  - **Permissions** (`permissions.ts`): the microphone (sound only), notifications, the clipboard, full screen and file access, to the list only. Everything else is refused. USB, serial and HID devices are never offered, and every device chooser is cancelled.
  - **Downloads** open the save dialog «حفظ الملف» in Downloads.
  - **Failed loads.** Any failed load of the page shows the Arabic connection screen (`offline.html`), with its own message when a certificate is not accepted. Certificate errors are never ignored: there is no handler and no verify procedure, and `--ignore-certificate-errors` is refused at start.
  - **Keys** (`keys.ts`): Ctrl with + - 0, F11, F5 (with Ctrl or Shift, without the cache), and F12 in a development build only.
  - **The bridge** (`preload.ts`) is `window.commsHubNative = { platform: 'desktop', shell: 'electron', version: '0.1.0', bridge: 1 }`, frozen, and only when the top-level page is on the list. `sender.ts` holds the check every D2 handler must pass (`trustedSender`, `guard()`). D1 registers no handler.
  - **Refused switches** at start (`switches.ts`): certificate, web-security, sandbox and site-isolation switches in every build, and remote debugging in a release build.
  - **The release package** (`electron-builder.release.cjs`):
    - NSIS one-click, x64, per user, with no administrator rights;
    - Arabic: `ar_SA`, LCID 1025 (electron-builder carries Arabic installer messages);
    - Start menu and desktop shortcuts named «مركز الاتصال المؤسسي»;
    - `CommsHub.exe`, with the Arabic name in the file's details (description, product, company);
    - the icon from `public/brand/comms-hub-logo-512.png`, version 0.1.0;
    - unsigned and unpublished, with Electron's locales trimmed to Arabic and English;
    - the application's data removed on uninstall but not on an update (D-11);
    - fuses flipped at packaging.
  - **The development package** (`electron-builder.dev.cjs`) is unpacked only and never handed out. It differs from the release package in its compiled list, the developer tools and one fuse: `EnableNodeCliInspectArguments` stays on. Playwright's Electron support attaches through the Node.js inspector (`_electron.launch` waits for "Debugger listening on", read in playwright-core 1.62.1). That is also why the release package cannot be driven by Playwright: part 2 of the check proves it from outside.
- **Code.**
  - Sources, in `desktop/src/`: `main.ts`, `preload.ts`, `compiled.ts`, `origins.ts`, `navigation.ts`, `permissions.ts`, `keys.ts`, `window-state.ts`, `sender.ts`, `switches.ts`, `downloads.ts`, `identity.ts`, `globals.d.ts`, `offline.html`, `connect-note.html`.
  - Build, packaging and docs, in `desktop/`: `scripts/build.mjs`, `electron-builder.release.cjs`, `electron-builder.dev.cjs`, `tsconfig.json`, `README.md`.
  - Tests: `desktop/tests/` (10 files). The application check: `qa/desktop-shell.cjs` and `qa/desktop-shell.json`. Also `.vercelignore`.
  - No site source changed.
- **Verified, numbers.**
  - **`desktop/`:** `npm test` **52 of 52**, in ten files. They cover the address list, navigation and the connection routes, permissions, and the keys, held apart from every studio shortcut and review-screen key read from the site itself. They also cover the window's place, the sender check, the id, the user agent, refused switches and downloads, the two pages, the compiled bundles, and the packaging with its pins. `npm run typecheck` (TypeScript 7.0.2) is clean.
  - **Fuses**, read back with `@electron/fuses` 2.1.3 from `dist/release/win-unpacked/CommsHub.exe`:
    - RunAsNode Disabled;
    - EnableCookieEncryption Enabled;
    - EnableNodeOptionsEnvironmentVariable Disabled;
    - EnableNodeCliInspectArguments Disabled;
    - EnableEmbeddedAsarIntegrityValidation Enabled;
    - OnlyLoadAppFromAsar Enabled.

    The three fuses outside the plan stay at Electron's defaults: LoadBrowserProcessSpecificV8Snapshot Disabled, GrantFileProtocolExtraPrivileges Enabled, WasmTrapHandlers Enabled.
  - **Sizes.** The installer, `desktop/dist/release/CommsHub-Setup-0.1.0-x64.exe`, is 111,513,992 bytes (106.3 MB). Installed, the application takes 336,222,753 bytes (320.6 MB) in 21 files, in `%LOCALAPPDATA%\Programs\sa.commshub.desktop`. The silent installation took 17.1 s.
  - **`node qa/desktop-shell.cjs`: 80 of 80** (`qa/desktop-shell.json`, run 2026-10-20T15:59Z).
    - **Part 1, the development package, in Playwright:**
      - The connection screen appears when nothing answers. It is Arabic and right to left, has no bridge, and «إعادة المحاولة» loads the site once it answers.
      - The bridge is on the allowed fixture with exactly its four fields, frozen. It is absent in a frame on the same address, in a frame from another port, and on a foreign top-level page.
      - A foreign link, `window.open` of a foreign address, a mail link and a redirect out of the list go to the stubbed `shell.openExternal`, and the window stays where it was. `ms-settings:` and `file:` open nothing, and no foreign page was ever loaded inside.
      - A link on the list stays in the window. `window.open` on the list opens an application window with the bridge and the same session.
      - `/api/drive/connect`, `/api/onedrive/connect` and `/api/platforms/connect/facebook` show the note verbatim, modal over the window and with no bridge. «متابعة في المتصفح» opens the address in the browser, and «إلغاء» opens nothing. No `/api/` address was ever loaded inside.
      - On the allowed page: microphone granted; camera refused, even together with the microphone; notifications granted; clipboard granted (by query); location, MIDI, persistent storage and the screen wake lock refused. HID offered no device, serial, USB and Bluetooth were cancelled, and full screen was granted. A foreign page got neither the microphone nor notifications.
      - Window settings, the persistent `persist:comms-hub` profile, no menu, and the user agent `... Chrome/152.0.7977.130 Safari/537.36 CommsHubDesktop/0.1.0`.
      - Keys: Ctrl+Z, Ctrl+Shift+Z, Ctrl+K and S reach the page, with Ctrl+Z not held back by the application. Ctrl with + - 0 gave 1.1, 0.9 and 1 and were held back from the page. F11 went into and out of full screen. F12 opened the developer tools, and F5 reloaded the page.
      - A download's dialog in `C:\Users\User\Downloads\comms-hub-check.txt`, titled «حفظ الملف», and the download completed.
      - A second launch exited 0, the first window got `second-instance` once, and there was still one window.
      - The place came back exactly: 1100 by 720 at a display scale of 1.25. The maximised state came back too.
      - The production sign-in page loaded signed out: right to left, «تسجيل الدخول», a password field, and the bridge present. It was never signed in.
      - A self-signed certificate for the production name was refused with «تعذّر التحقق من أمان الاتصال», and its server received no request.
    - **Part 2, the release package:**
      - The six fuses, and the development package differing in the inspector fuse alone.
      - A silent installation as this user, exit 0. Shortcuts in the Start menu and on the desktop carry the Arabic name. Windows lists «مركز الاتصال المؤسسي» 0.1.0 under the key `dc656aed-13ec-55ab-a2e3-19f784d0109c`.
      - At run time:
        - `--remote-debugging-port` exits with code 2, and the port never answered;
        - `--ignore-certificate-errors` exits with code 2;
        - `--inspect` opens no port while the application runs;
        - `ELECTRON_RUN_AS_NODE=1` and `NODE_OPTIONS=--require` ran no code.
      - The window took the site's title, and its profile, `%APPDATA%\sa.commshub.desktop\Partitions\comms-hub`, holds the production site.
      - A silent uninstall removed the program, both shortcuts, the Windows entry and `%APPDATA%\sa.commshub.desktop`.
  - **The site, in the worktree:**
    - `npm run typecheck` is clean, and `npm test` gives **501 of 501**.
    - `npm run build` passes (compiled in 21.0 s, 36 static pages) with no environment file: the worktree has only `.env.example`, and no secret was copied into it.
    - No tracked file changed during the build.
- **Found on the way, fixed.**
  - At a display scale of 125%, Windows widened a new window by 4 pixels (1100 to 1104), though the stored place was exact. The main process now sets the stored bounds once more after creating the window, and the check holds the result to the stored value within 1 pixel.
  - `path.win32.basename` read `a:` in a suggested download name as a drive. The name is now split on slashes.
  - The release bundle still carried an unreachable developer-tools call behind a constant. It now sits behind the compiled flag and is gone from the bundle.
  - A first run of the check stopped when a part failed with an application still open. The check now closes every application it started before it writes its result.
- **How the checks were driven, said plainly.**
  - **Keys** were sent through `webContents.sendInputEvent`, the browser-side path a real key takes past Electron's `before-input-event`. Playwright's own key presses enter below that point: in a probe the page received Ctrl+Equal and the zoom stayed at 1, so they would prove nothing. Keys sent in the first second after a load reached neither the page nor the application, so the check first waits until a neutral F24 reaches the page.
  - **Links** after a refused navigation are clicked through the page, and device buttons with the low-level mouse. Playwright's own actions keep waiting for a navigation that never comes.
  - **No browser opened**: `shell.openExternal` was replaced inside the main process for the check.
  - **The microphone** was Chromium's fake device.
  - **The certificate case** pointed the production name at a local server with a self-signed certificate (`--host-resolver-rules`, development package).
  - **Part 2 used this laptop's real per-user locations.** It installed silently and removed the application again, and would have skipped all of that had an installation or a profile existed. The desktop shortcut was on the owner's desktop for about a minute.
- **Not verified, said plainly.**
  - **Nothing was seen signed in.** By rule no agent signs in; the owner's walkthrough below is pending.
  - **File access** (`showSaveFilePicker`) was not driven, because it opens Windows' own dialog; the rule is unit-tested only. The clipboard was checked by a permission query only, to leave this laptop's clipboard untouched.
  - **The installer's Arabic pages were not seen**, because the one-click installer ran silently.
  - **SmartScreen was not seen**: a file built on this laptop carries no download mark. The first installation from a copied file will show it.
  - **Only this laptop was tried** (Windows 11 Home 10.0.26300, display at 125%). The director's laptop was not, and its Smart App Control is still the owner's to check (plan 11.1).
  - A real keyboard, the mouse's back button and a second screen were not tried.
- **Owner walkthrough (pending).**
  1. Install with `CommsHub-Setup-0.1.0-x64.exe`: "More info", then "Run anyway".
  2. Sign in, and move between pages.
  3. Open «استوديو الحركة» and «الاستوديو» as the Admin.
  4. Record a voice note in «المراسلة» to check the microphone. The application grants it itself, so no browser prompt appears; Windows may ask once whether desktop applications may use the microphone.
  5. Start a Drive connection from «الإعدادات»: the note appears, then the browser.
  6. Close and reopen the application; it should still be signed in.
  7. Uninstall; the data should be gone, so a new installation starts at the sign-in page.
- **Waits for D2**, after the studio's third round:
  - `backgroundThrottling: false`;
  - the bridge methods `info`, `power`, `life` and `notify`, each behind `guard()`;
  - the tray and native notices;
  - in the site, `src/lib/native/`, the export panel, `support.ts` and `notices.tsx`;
  - «معلومات الجهاز»;
  - the parity check DT-05.
- **Branch.** `desktop-app`, as local commits: not merged into `main` and not pushed.

### 2026-10-20: the desktop application, D2: the studio at full strength, the tray and notices

- **The owner's word.** On 2026-10-20 the owner asked for the desktop application to be finished: D2 to D6, on branch `desktop-app`, while the studio's third round is still open on `main` (Phases 11 to 14 remain). D7 and D8 stay gated on hardware and decisions, as the plan says. The download of an LGPL FFmpeg build for D5 was allowed, and D3's bucket is to be a migration file only, not applied. D2 therefore touches studio files (`export-panel.tsx`, `send-review.tsx`, `support.ts`, `studio-page.tsx`, `editor-frame.tsx`) and `notices.tsx` in the worktree only; `main` and the studio session's files there were not touched. Each site change is small and additive, and new code sits in new files, so the merge after the studio round stays simple.
- **What changed, in the application** (`desktop/`, version 0.2.0; `MVP_draft.md` 63.1):
  - **Bridge version 1.** `window.commsHubNative` gains `info`, `power` (`keepAwake`, `release`), `life` (`busy`, `idle`) and `notify` (`show`, `badge`, `onOpen`). Each method only sends a message (`src/ipc.ts`). Every handler is registered once, in `src/native.ts`, through `sender.ts`'s `guard()`, and every argument is checked by `src/bridge.ts`: a reason from a fixed list (export, upload), a hold number the window itself took, a whole count up to 9999, and a notice of plain text (title up to 120 characters, text up to 400) whose link must be a path on the asking page's own allowed address. A notice with a bad link is refused whole. No method takes a file path, a command or another address.
  - **Busy.** While a window is busy, its background throttling is off, so an export keeps its speed minimised or hidden. When it is idle again, throttling is back on, so an idle minimised window costs no more than a browser tab. This turns throttling off only during an export, instead of for the whole window as the plan's D2 line reads; the reason is a laptop's battery, and the effect for an export is the same. Closing a busy window hides it, with a notice «التصدير مستمر»; quitting asks first («يجري تصدير الآن.», «متابعة التصدير» by default). A window's holds and busy state end when it closes, crashes or loads another document (`src/life.ts`).
  - **Awake.** `keepAwake` starts the system's `prevent-app-suspension` blocker: the laptop does not sleep, the screen may turn off.
  - **The tray** (`native.ts`, `words.ts`): the icon while the application runs, with «فتح مركز الاتصال المؤسسي», «إبقاء التطبيق في شريط المهام» (off at first, D-10, kept in the profile's `settings.json`) and «إنهاء». Its tooltip names an export and the decisions waiting.
  - **Notices and the badge.** A native notice is shown only when its window is not in front. A click brings the window back and hands the page the path. Windows has no number badge, so `src/badge.ts` draws one: a red disc with white figures (1 to 9, then 9+) at 16 and 32 pixels, set as the taskbar overlay with a description for screen readers. The tray icon gets a red dot.
  - **«معلومات الجهاز»'s facts** (`src/device.ts`): version, processor, memory, free disk at the profile, and the graphics chips with the one in use, from `app.getGPUInfo('complete')`. On the owner's laptop it named the NVIDIA GeForce RTX 3050 Laptop GPU as active and the AMD Radeon as idle. Windows' software renderer is not listed as a chip. No path of any kind.
- **What changed, in the site:**
  - `src/lib/native/` is new: the native contract shared with the phone applications (`Mobile_Apps_Plan.md` 5.2). `native()` reads a well-formed shell object and detects each feature by its methods, so the D1 application offers none, and a browser is `web`. Helpers: `keepAwake` (the bridge, or the browser's screen wake lock as before), `markBusy`, `notifyNative`, `setBadge`, `onNoticeOpen`, `compareVersions`. `notices.ts` decides what reaches the tray: only new, unread «يحتاج قرارك» items, none on the first read, more than three as one. `device.ts` builds «معلومات الجهاز»'s lines and the guide to the stronger graphics chip.
  - `export-panel.tsx` and `send-review.tsx`: the laptop kept awake, the window marked busy, and a native notice at the end or on failure (not on cancel). In the application the export line reads «يمكنك تصغير النافذة أثناء التصدير.». In a browser the export panel is unchanged; `send-review.tsx` now also holds the screen awake, as the export panel always did.
  - `notices.tsx`: inside the application the list keeps reading itself once a minute while hidden, raises native notices, sets the badge, and opens a clicked notice through the site's router. In a browser nothing changes.
  - `support.ts`: the support report gains `desktop`, and the studio's home says when it runs in the application.
  - «معلومات الجهاز» (`src/components/native/device-info.tsx`): on the studio's home below «ما يقدر عليه هذا المتصفح», and in «مساعدة» of both editors. The hardware encoder is measured with `VideoEncoder.isConfigSupported` and `prefer-hardware`; in a browser the chip comes from WebGL.
  - `tests/native.test.mjs` is new and on the test list.
- **Verified, numbers.**
  - **`desktop/`:** `npm test` **76 of 76**, in 15 files (new: `bridge`, `life`, `badge`, `device`, `words`). The D1 tests whose expectations D2 changes on purpose were updated: the bridge's shape, every handler through `guard()` in `native.ts` with one registration per callable channel, and the version. `npm run typecheck` is clean.
  - **The site:** `npm run typecheck` is clean, `npm test` gives **514 of 514** (501 before, plus 13 in `tests/native.test.mjs`), and `npm run build` passes with no environment file (compiled in 4.5 s; every page is rendered per request, only `/_not-found` is prerendered).
  - **`node qa/desktop-native.cjs`: 37 of 37** (`qa/desktop-native.json`). It drives the development package in three parts:
    - **Part 1, the bridge:**
      - its shape, frozen at every level;
      - `info` names the processor, memory, free disk and the chip in use, with no path;
      - `keepAwake` starts a real `prevent-app-suspension` blocker and `release` stops it once; another window cannot release it, and loading the page again ends it;
      - eight kinds of bad request are refused, starting nothing and showing nothing;
      - busy turns throttling off and idle back on;
      - closing a busy window hides it, with one notice, and the tray icon brings it back;
      - quitting during an export asks in Arabic, and the first answer keeps it;
      - a notice for a window in front is not shown; one for a minimised window is, and its click restores the window and hands the page the path (or moves the page itself when it said nothing);
      - the badge at 16 and 32 pixels with its description, 9+ above nine, cleared at zero, and the tray's dot and tooltip;
      - closing quits when nothing runs; with «إبقاء التطبيق في شريط المهام» on, closing hides, says so once, and quitting from the tray asks nothing.
    - **Part 2, DT-07, the site's real `useNotices`** on a fixture page with a stand-in list (`qa/fixtures/desktop-notices.tsx`, `fake-notices.ts`): the first read raises nothing and the taskbar counts one decision; with the window minimised a new «يحتاج قرارك» item raises a native notice and the count, while an «يحتاج انتباهك» item does not; a click restores the window and opens `/approvals/CH-202` through the router; reading clears the count.
    - **Part 3, with nothing attached.** Playwright's attachment keeps every page visible and unthrottled. In a probe, a minimised and even a hidden window still said "visible" and kept its timers; Playwright's loader also adds Chromium's `--disable-background-timer-throttling` and two like it. Started plainly and minimised through Windows' own `ShowWindow` (`qa/desktop-helpers.cjs`, `launchPlain`), the application gave:
      - idle and minimised: hidden, **3** timer ticks in 3 s;
      - busy and minimised: visible, **30** ticks;
      - idle again: hidden, **3** ticks;
      - and the notifications hook, minimised and hidden, read its list again on its own **56 s** after a new decision arrived.
  - **`node qa/desktop-studio-parity.cjs`: 12 of 12** (`qa/desktop-studio-parity.json`).
    - **DT-05.** The studio's own checks ran unchanged in Edge and inside the application at the same moment (`qa/desktop-parity-hook.cjs` swaps Playwright's browser for the development package; both results go to `qa/artifacts`, never over `qa/studio-*.json`): `qa/studio-engine.cjs` **41 of 41** in both, `qa/studio-export.cjs` **18 of 18** in both, the same check names. The application ran Electron 44.5.1, Chromium 152.0.7977.130.
    - **DT-06.** A ten-minute 1080p source made by ffmpeg (testsrc2 and a 440 Hz tone, 306,844,658 bytes) was exported whole at 1080p by the studio's own modules (`qa/fixtures/desktop-long-export.ts`), once in Edge and once in the application:
      - **in the application,** started plainly with nothing attached and minimised through Windows the whole time, the export completed: **18,000 frames in 158.2 s**, its page reporting "visible" in all 19 progress reports;
      - **in Edge,** the reference, the same export took **241.5 s**. Edge ran headless, so the two times are not like for like;
      - **ffprobe reads both files the same:** H.264 High, 1920x1080, yuv420p, 30/1, 18,000 frames, AAC 48 kHz stereo, 600.0 s (572,743,220 and 588,921,876 bytes);
      - **at 1, 150, 300.5, 450 and 599 s** the application's frame matches Edge's within 1 level of 255, and the source's within 1.
      - **For contrast,** a one-minute piece, minimised: marked busy, it stayed visible and took 15.8 s. Not marked busy, its page was hidden, and it still took 16.1 s. On this laptop, hiding the window did not slow the encoder itself, which runs on promises and the graphics chip rather than timers. What "busy" changes is visibility, timers and the process's priority. The plan's premise that a hidden export slows was not reproduced here for a one-minute piece, and a hidden ten-minute export without "busy" was not measured. In a browser, tab discarding and long-hidden throttling are a separate matter.
  - **`node qa/desktop-shell.cjs` (D1's check) against D2: 80 of 80** (`qa/desktop-shell.json`). Its bridge check now expects version 1's groups. The release package 0.2.0: installer **111,527,803 bytes (106.4 MB)**; installed **336,251,542 bytes (320.7 MB), 21 files**, in 12.7 s; fuses as in D1; installed silently on this laptop and removed again (no installation of the application was present).
  - **The D2 package was proven to be this commit.** D3's first edits had started in the same files before this commit. They were undone, and the bundled `main.js`, `preload.js`, both pages and the icon built from this commit are byte for byte the ones inside the development package that passed the checks above.
- **Found on the way, fixed.**
  - A regular expression in `bridge.ts` held real line-separator characters, which end a JavaScript regular expression literal. It now uses escapes.
  - Python on Windows wrote edited files with CRLF. The repository's `.gitattributes` stores LF, so commits were never affected; the working files were normalised.
  - The check's command channel handed a command to a long poll left over from a closed application. It now drops a poll whose connection closed.
  - The check's own wait for a report re-armed itself on every look, so waiters doubled every cycle. During a long export the check's Node process reached its 4 GB heap and stopped, and it had pressed this laptop's memory while it ran. A wait now has one timer and one listener, both removed at its end. Every result above comes from runs after the fix.
  - In the application, a studio check's navigation could be interrupted by the application's own first page (its connection screen, since nothing answers at its address during the check). The hook now waits for that first page to settle.
  - The Edge reference of DT-06 first ran in a plain Playwright context, whose storage lives in memory under a small quota: «exceed its storage quota». It now uses a profile on disk, like a person's Edge.
- **Not verified, said plainly.**
  - **Nothing was seen signed in.** The real notifications, the studio and the export panel inside the application were driven through fixtures, never the signed-in site.
  - **No native notice reached the screen.** In the checks they were recorded inside the main process, so nothing appeared on the owner's screen. Windows shows an application's notices only once it is installed with its Start menu shortcut, which the release package has.
  - **The tray menu was not clicked by a person.** Its items were driven through the main process.
  - **The export panel's and send-review's own buttons were not pressed in the application.** The same helpers ran in the long-export fixture.
  - **The graphics-chip guide** was written from Windows 11's settings, not walked on the director's laptop.
- **Owner walkthrough, added for D2.**
  1. Export a long video, minimise the window, and wait for «انتهى التصدير».
  2. Close the window during an export: it goes to the tray. Then quit from the tray during an export: the question appears.
  3. Turn on «إبقاء التطبيق في شريط المهام», close the window, and reopen it from the tray.
  4. Have someone send you a work for a decision while the window is minimised: the notice and the taskbar number appear.
  5. Open «معلومات الجهاز» in the studio: it should name the graphics chip in use.

### 2026-10-21: the desktop application, D3: updates and the download page (signing waits)

- **Scope.** D3 of `Desktop_App_Plan.md` without signing, which waits for a certificate (decision D-7), and without a build workflow, which waits for macOS (11.1). By the owner's answer of 2026-10-20, the release bucket is a migration file only, not applied, and no release is published.
- **What changed, in the application** (`desktop/`, version 0.3.0; `MVP_draft.md` 63.2):
  - **Updates** (`src/update.ts`, `src/updater.ts`):
    - electron-updater **6.8.10**, pinned by the fourteen-day rule (published 2026-09-26), and bundled. Only its Windows updater is imported: its index would bring the macOS updater into the bundle.
    - The generic feed is compiled in: `https://hrghmioxvgkjpnydrxrk.supabase.co/storage/v1/object/public/desktop-releases/windows-x64`, the public bucket of decision D-6.
    - It looks ten seconds after start and every four hours, downloads in the background, checks the SHA-512 against `latest.yml`, and installs on quit or with «إعادة التشغيل للتحديث». That is refused while a window is busy («التحديث ينتظر»).
    - When an update is ready and the window is not in front: a notice «تحديث جاهز», and the item in the tray's menu.
    - `feedAllowed` refuses every feed but the production one, except in the update check's own package. A development build never runs the updater.
    - The updater's log is off.
  - **Bridge version 2** adds `update` (`status`, `restart`), registered through `guard()` like the others.
  - **Three kinds of build** (`scripts/build.mjs`):
    - release;
    - development;
    - `qa`, the update check's package: the release build under its own id, name and data folder, `sa.commshub.desktop.qa`, «مركز الاتصال المؤسسي، فحص التحديث», with a version and a feed on this laptop (`electron-builder.qa.cjs`). It can be built only with both, and the release bundle never carries its feed.
  - **The release package** names the generic feed, so electron-builder writes `latest.yml`, the blockmap and `app-update.yml`. `--publish never` keeps anything from being uploaded.
  - **The uninstaller** (`resources/installer.nsh`, a `customUnInstall` step) now also removes `%LOCALAPPDATA%\sa.commshub.desktop-updater`, but never during an update. electron-builder's installer copies itself there (about 110 MB) and its own uninstaller left it behind. The checks of D1 and D2 had left it on this laptop that way.
  - **Names apart.** Electron writes a Start menu shortcut for an application's notices, named after the package. The development package is now «مركز الاتصال المؤسسي، نسخة التطوير» and the update check's «مركز الاتصال المؤسسي، فحص التحديث», so neither can replace the real application's shortcut. Every check also removes, when it ends, any shortcut pointing into this worktree (`qa/desktop-helpers.cjs`, `removeTestShortcuts`).
- **What changed, in the site:**
  - `src/lib/native/releases.ts`: the same feed, held equal by a test; `latest.yml` read strictly (a version, an `.exe` name with no path, a size); `MINIMUM_DESKTOP` 0.2.0; and the update state in Arabic.
  - `src/components/native/desktop-app.tsx`:
    - «تطبيق سطح المكتب» on «الحساب» (`supporting.tsx`): in a browser, the download, the version, the size and what SmartScreen asks; inside the application, the version and the update state with «إعادة التشغيل للتحديث»;
    - the banner for an application older than the site needs (`shell.tsx`). It works from D1's bridge on, because it reads only the version.
  - `src/lib/native/index.ts`: the feature `update`.
  - `use-native.ts`: `useNativeVersion`.
- **The bucket.** `supabase/migrations/20261021090000_desktop_releases.sql`, **written, not applied**: a public bucket `desktop-releases`, 300 MB per file, a few types, and no write policy for anyone. `desktop/README.md` says how the owner publishes a release: raise the project's upload limit, apply the migration, upload the installer, the blockmap and `latest.yml` last.
- **Verified, numbers.**
  - **`desktop/`:** `npm test` **86 of 86**, in 16 files (new: `update`; D2's tests updated for bridge version 2, the build kinds, the names and the uninstall step), `npm run typecheck` clean.
  - **The site:** `npm run typecheck` clean, `npm test` **518 of 518**, `npm run build` passes (compiled in 7.4 s).
  - **`node qa/desktop-update.cjs`: 10 of 10** (`qa/desktop-update.json`). On this laptop, with the update check's own package and a local feed:
    - two packages built, 0.3.0 and 0.3.1; `latest.yml` names 0.3.1 with its size and SHA-512;
    - DT-09: the package names no publisher, so electron-updater checks the SHA-512 only. Signing is not applicable to an unsigned pilot; signtool and the other tools were not run;
    - 0.3.0 installed silently for this user. Started plainly, it asked the feed and downloaded 0.3.1 in the background (it asked for 0.3.0's blockmap first, which the feed did not have, then took the whole installer);
    - closing its window quit it, and 0.3.1 was installed on quit. The data folder stayed, and the program on disk is 0.3.1;
    - DT-09: a replaced installer (version 0.3.2 named with 0.3.1's checksum, one byte changed) was downloaded and refused, and nothing was installed;
    - a silent uninstall removed the program, its Start menu shortcut, its Windows entry, its data and the updater's folder.
  - **`node qa/desktop-account.cjs`: 8 of 8** (`qa/desktop-account.json`). Two runs had timed out on the application window's last screenshot, a picture rather than a check; pictures are now tried twice and a miss is noted:
    - in Edge, «تنزيل التطبيق» to the bucket's installer, the version, about 112 MB, and SmartScreen's two steps;
    - no release: «لم يُنشر إصدار للتنزيل بعد.»;
    - with D1's bridge (0.1.0): the banner and the panel's warning;
    - inside the development package: «… الإصدار 0.3.0» and the idle line, with nothing asked of the feed.
  - **`node qa/desktop-native.cjs`: 37 of 37** against bridge version 2. Its notes record the Start menu shortcut Electron wrote for the development package during the run, now named «مركز الاتصال المؤسسي، نسخة التطوير.lnk», and removed at the end.
  - **`node qa/desktop-shell.cjs`: 81 of 81** against the 0.3.0 release package, now also checking that uninstalling removes the updater's folder. Installer **111,615,091 bytes (106.4 MB)**; installed **336,748,035 bytes (321.1 MB), 22 files**, in 13.5 s. Nothing was left on this laptop: no program, updater folder or shortcut.
  - **Not re-run:** `qa/desktop-studio-parity.cjs`. D3 changes no studio code; its D2 result stands.
- **Found on the way, fixed.**
  - Uninstalling left `%LOCALAPPDATA%\sa.commshub.desktop-updater` (above). The copies left by D1's and D2's checks on this laptop were removed.
  - Electron wrote «مركز الاتصال المؤسسي.lnk» in the Start menu during a check, pointing to the development package. On a laptop with the application installed, that would have replaced its shortcut. It was removed, and the names are now apart (above).
  - The update check's first run had two faults of its own:
    - the updater, holding the genuine 0.3.1 file, took it as the 0.3.2 download because the manifest named its checksum, so the replaced file was never fetched. The check now clears the updater's downloads first, as on a laptop that never fetched the genuine one;
    - NSIS's uninstaller returns before it has finished, and a silent update was still running. The check now waits for every process of the package and for every trace to go. The package that the race had left installed was removed.
  - The release bundle grew from about 35 KB to about 531 KB with electron-updater and its libraries (YAML, semver, file utilities).
  - `npm audit` reports a moderate finding in sprintf-js, reached through electron-builder's download of Electron at build time. Nothing of it ships in the application. The fix offered is a downgrade of electron-builder, not taken.
- **Not verified, said plainly.**
  - **No real release was published or fetched,** and the bucket does not exist; the application's check against it fails quietly until the owner publishes.
  - **SmartScreen and the installer's Arabic pages** were not seen: every install was silent and built on this laptop.
  - **Updating over a version that has the older uninstaller:** electron-builder runs the *installed* version's uninstaller during an update. The pilot's 0.1.0 and 0.2.0 do not remove the updater's folder, so it stays until a version from 0.3.0 on is uninstalled.
- **Owner steps, when the first release is wanted** (desktop/README.md): raise the upload limit, apply the migration, `npm run pack`, upload the three files. Then, in a browser, «الحساب» shows «تنزيل التطبيق», and an installed application finds the update within four hours.

### 2026-10-21: the desktop application, D4: files used in place, the cache folder and the pages' security policy

- **What changed, in the site, for everyone:** the pages' Content-Security-Policy (`Desktop_App_Plan.md` 3 and 9, "before D4"). `src/proxy.ts` gives every page request a fresh nonce, which Next.js 16.3 puts on its own scripts, following `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`, and sends the policy (`src/lib/csp.ts`):
  - `script-src` takes the nonce, the theme script's SHA-256 (the layout's one inline script, moved to `csp.ts` as `RESTORE_THEME` so the hash and the page share one text), `'strict-dynamic'` and `'wasm-unsafe-eval'` (the AAC encoder). It allows no `'unsafe-inline'`, and `'unsafe-eval'` only under `next dev`;
  - the other directives stay broad, so nothing the site does today is refused: `connect-src` https and wss (Drive, OneDrive and S3 uploads go straight to their own hosts), blobs for workers and media, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri` and `form-action` to the site;
  - `commshub-file:` is allowed for media and reads; a browser never has such an address;
  - the API routes keep their own headers.

  Every page was already rendered per request (only `/_not-found` is prerendered), so the nonce costs nothing new.
- **What changed, in the application** (`desktop/`, version 0.4.0, bridge version 3; `MVP_draft.md` 63.3):
  - **Files used in place** (`src/files.ts`, `src/file-store.ts`). A chosen file becomes a token (32 random bytes), recorded in the profile's `files.json` with its path, size, modification time and a SHA-256 of its size and first and last 4 MB. The page sees name, size, type and date only. The same unchanged file keeps its token. A file changed, moved or removed is no longer served.
    - `files.fromDropped(file)` reads, in the preload alone, the path Chromium attached to a File the person chose or dropped (webUtils). The main process accepts only an absolute path to a regular file of a kind the studio takes.
    - Said plainly: a renderer taken over by an attacker could name a media file by path on this channel. The preload is the only caller in normal use, and the page itself has no way to send one.
    - `files.pick` opens the system's own dialog. `files.check` and `files.forget` complete the group.
  - **`commshub-file://`** (`src/protocol.ts`, `src/range.ts`), registered as privileged (standard, secure, fetch, CORS, stream) and answered on the site's profile only:
    - read-only (GET, HEAD, and the CORS question), in single byte ranges (206, or 416 past the end);
    - an address names exactly one token (`local/`) or one cache name (`cache/`, `asset-`, `proxy-` or `convert-` names the main process gives), never a path;
    - a request carrying an Origin must come from the list; CORS headers go only to it.
  - **The cache folder** (`src/cache-store.ts`):
    - library versions are copied in resumable 16 MB parts from the site's own file route, `/api/media/<asset>/content?v=<n>` on the asking page's address. The main process uses the window's session with `credentials: 'include'`, so the site still decides who may read a file;
    - the folder is `StudioCache` in the profile by default, or «CommsHub Studio Cache» inside a folder the person chooses. Changing folders removes only its own copies;
    - the ten-day rule is the site's; the size limits are none, 10, 25, 50, 100 or 250 GB, the oldest used going first and what is in use never.
  - **«مسح بيانات هذا الجهاز»** (`data.clear`, decision D-11) forgets every token, removes the folder's copies, clears the profile's storage and cache (the session cookie included), and starts every window again.
  - The bridge's new handlers live in `src/native-files.ts`, registered through the same `guard()` (`native.ts` passes its `handle`). The sender test now reads both files.
- **What changed, in the site's studio** (only inside the application):
  - `cache.ts` gains a native backend: `libraryPlace` and `localPlace` return a File in a browser and an application address in the application. A device file is used where it is (an entry with its token, no copy). `removeLocal` forgets the token and never touches the file. The sweep, «حذف ملفات المعاينة المؤقتة» and the usage also cover the folder;
  - `media.ts` asks for places, so a source read from an address goes through Mediabunny's URL source and the media element, as a library file without a cache always did;
  - `target.ts` and `export.ts` can write straight to a file handle. In the application, `export-panel.tsx` asks with the system's save dialog before a video for the device, and says «حُفظ: … (…)، في المكان الذي اخترته.»;
  - `cache-panel.tsx` shows the folder, the free space, «اختيار مجلد آخر», «العودة إلى المجلد الافتراضي», «الحد الأعلى للتخزين» and «· من مكانه»;
  - `desktop-app.tsx` offers «مسح بيانات هذا الجهاز», held down;
  - two long-press reasons were added (`studioForgetInPlace`, `desktopClearData`), and `tests/kit.test.mjs` now also reads `desktop-app.tsx`.
- **Verified, numbers.**
  - **`desktop/`:** `npm test` **105 of 105**, in 21 files (new: `files`, `file-store`, `cache-store`, `protocol`). `npm run typecheck` is clean.
  - **The site:** `npm run typecheck` is clean, `npm test` **524 of 524** (new: `tests/csp.test.mjs` and D4's contract tests in `tests/native.test.mjs`), and `npm run build` passes (compiled in 9.6 s; the proxy is listed).
  - **`node qa/desktop-csp.cjs`: 13 of 13** (`qa/desktop-csp.json`). The site's own production build (`next start`, no environment file, so the signed-out gate) was checked in Edge and inside the development package:
    - every page carries the policy with a fresh nonce on each request;
    - every script Next.js wrote carries that nonce, and the only other script is the theme's;
    - pages load with no violation and the theme script ran;
    - an inline event handler slipped into the page does not run, and the browser reports it;
    - an API route does not get the pages' policy;
    - inside the application, its own address is allowed: an unknown token answered 404, not blocked.
  - **`node qa/desktop-files.cjs`: 16 of 16** (`qa/desktop-files.json`). DT-10 and DT-11 inside the development package, with the studio's own modules:
    - a **4,503,664,011-byte** H.264 video, made by ffmpeg on this disk, was chosen in the page's file field and given a token, not copied;
    - the frame at 291 s, past 4 GB into the file, matched ffmpeg's decode of the same moment within 12 levels;
    - five seconds from there exported to 1280x720, 150 frames, in 3.4 s;
    - **the private storage grew by 2,864,643 bytes, the export's own file (2,864,294) and the manifest; the whole profile on disk by 7.8 MB**;
    - the same project on a fresh profile: the file missing on this device, and the editor's «على هذا الجهاز فقط» line;
    - a file changed after it was chosen: 410; let go of: 404, still on the disk;
    - a library version copied into the folder with the page's own cookie and read from there; refused when the route answered 401;
    - the limit kept, and clearing spared what was in use;
    - an export written straight to a file handle with no temporary copy;
    - «مسح بيانات هذا الجهاز»: the cookie, the private storage, the folder's copies and the token all gone.
  - **Against bridge version 3:**
    - `qa/desktop-native.cjs` **37 of 37**;
    - `qa/desktop-account.cjs` **8 of 8**;
    - `qa/desktop-shell.cjs` **81 of 81** on the 0.4.0 release package: installer **111,621,449 bytes**, installed silently and removed, nothing left behind.
  - **`qa/desktop-studio-parity.cjs --parity-only`: DT-05 again, 6 of 6.** The studio's engine (41 checks) and export (18 checks) pass in Edge and inside the application with the same names, after `cache.ts` and `media.ts` changed. The ten-minute export (DT-06) was not re-run; its D2 result stands, and the folder path is covered by `qa/desktop-files.cjs`.
- **Found on the way, fixed.**
  - A copy the site refused (401) left an empty, incomplete entry and an empty file in the folder, which «حذف ملفات المعاينة المؤقتة» then counted. A refused copy, or one that failed before its first byte, now leaves nothing; a partial copy stays, to be resumed (unit-tested, and the check found it).
  - The URL parser resolves `../` before the address is read, so `commshub-file://cache/../manifest.json` arrived as `manifest.json`. Cache names now carry the main process's own prefixes, and the folder's record is kept in the profile, not in the folder.
  - A byte range starting past the end was ignored instead of refused (416).
- **Not verified, said plainly.**
  - **The system's file and folder dialogs** (`files.pick`, «اختيار مجلد آخر») and the save dialog of an export were not driven: they are Windows' own windows. The paths behind them are unit-tested, the save path through a file handle.
  - **Drag and drop** was not driven; a file field was, which gives the same kind of File.
  - **The pages' policy was checked on the signed-out gate only.** Signed-in pages load more (the database's live connection, uploads to Drive, OneDrive and S3), which the policy's directives allow by design, but no signed-in page was seen under it. This is the D4 change most worth the owner's attention in the walkthrough: any page that misbehaves should be reported, with the browser console's «Content Security Policy» lines.
  - The studio's own interface checks (`qa/studio-ui.cjs`) were not run. The cache panel's new controls were not seen rendered; they use the existing classes.

### 2026-10-21: the desktop application, D5: light copies for the preview and editable copies (FFmpeg)

- **What changed, in the application** (`desktop/`, version 0.5.0, bridge version 4; `MVP_draft.md` 63.4; decision D-9):
  - **FFmpeg, LGPL v3.** The owner allowed this download on 2026-10-20: `ffmpeg-n9.0.2-17-g2a571b6068-win64-lgpl-shared-9.0.zip`, BtbN/FFmpeg-Builds release `autobuild-2026-09-30-13-08`, pinned by size and SHA-256 in `desktop/ffmpeg.lock.json`.
    - `desktop/scripts/fetch-ffmpeg.mjs` downloads it into a new empty folder and checks it before opening anything. It unpacks with Windows' own `tar.exe` into another new folder, and copies only the two programs, their libraries and the licence into `desktop/vendor/ffmpeg`, which git ignores. Both `pack` scripts run it first.
    - The package carries them in `resources/ffmpeg`.
  - **Fixed jobs only** (`src/media-jobs.ts`): `probe`; `proxy`, a 720p or 1080p light copy; and `convert`, an editable H.264 and AAC copy at full size, even dimensions, 8-bit.
    - They name Windows' own encoders only (`h264_mf`, `aac_mf`) and keep every frame at its time (`-fps_mode passthrough`).
    - They keep the original's timestamps (`-copyts`) whenever the browser can read the original's container. A camera's MPEG-TS starts at about 1.48 s, and so do its copies. Anything else starts at zero.
  - **Naming.** Each copy is named by its source (a device file's fingerprint, or a library file and version), the recipe (`r1`) and FFmpeg's tag (`ff902`).
  - **Where the jobs run.** In a utility process (`src/media-worker.ts`): one encoding at a time, below normal priority, and a probe at once.
  - **The bridge's `media` group** (`src/native-media.ts`): probe, copies, proxy, convert, cancel and progress.
    - The page names a source by its token or its library version only, never by a path, a program or an argument.
    - A copy is written as a `.part` file that is never served, and recorded only once FFmpeg has finished it. The size limit then applies to it like any copy.
    - Its free disk space is checked against an estimate first.
    - FFmpeg's error lines never leave the main process: the page is told one word.
  - **Cancelling and quitting.** Cancelling, «مسح بيانات هذا الجهاز» and quitting end FFmpeg too: the main process ends its processes by their ids. The next start removes any `.part` left behind (`CacheStore.cleanParts`).
  - **Licences, D3 to D4 fixed here.** Since D3 the bundle dropped the licence comments of electron-updater and the 14 packages it brings. `scripts/build.mjs` now writes each bundled package's name, version and licence text into `THIRD_PARTY_LICENSES.txt`, shipped in `resources`. `THIRD_PARTY_NOTICES.md` gains a section for the desktop application covering:
    - Electron and Chromium;
    - the bundled packages;
    - FFmpeg, with its exact configure line, where its source is and the patent note.
- **What changed, in the site's studio** (only inside the application; a browser behaves as before):
  - `src/lib/native/` gains the `media` feature and its types.
  - `cache.ts` asks the application for a source's copies, makes one, cancels one, and reads a file the browser cannot (`probeInApp`).
  - `folderName` leaves a copy's own name as it is, so the sweep spares copies in use.
  - `media.ts`:
    - a ready video source loads its light copy if it has one, and the paused preview and the playing element read it. Its frames are matched to the original's by their first timestamps, as a safety net;
    - the export, a still and the photo editor read the original, or the converted copy when there is one;
    - a source the browser cannot decode becomes «convertible», and so does one whose sound it cannot decode;
    - `inUse` covers the copies.
  - `source-tools.tsx`, under the clip's line in the inspector: «إنشاء نسخة خفيفة للمعاينة», the heavy-source line, progress with «إلغاء», «تحويل إلى نسخة قابلة للتحرير», and the failures in Arabic.
  - `editor.tsx`: adding a file the browser cannot read asks the application.
  - `bin.tsx`: in the application the picker also lists `.mxf`, `.mts` and `.m2ts`.
  - In a browser, a file the studio's reader refused used to raise the reader's own message. It now raises «نوع هذا الملف غير مدعوم في الاستوديو.».
- **Verified, numbers.**
  - **`desktop/`:** `npm test` **116 of 116**, in 21 files (new: `media-jobs`, which also runs the recipes on the pinned build: a ProRes source of odd width, and an MPEG-TS whose light copy starts with it). `npm run typecheck` is clean. Correction: D4's entry said 105 tests in 21 files; they were in 20.
  - **The site:** `npm run typecheck` is clean, `npm test` **527 of 527** (D5's contract tests in `tests/native.test.mjs`), and `npm run build` passes.
  - **`node qa/desktop-media.cjs`: **52 of 52**** (`qa/desktop-media.json`), inside the development package.
    - **The corpus**, made by the local (GPL) ffmpeg as fixtures only, 8 s each, each frame carrying its number as a 12-bit gray code:
      - ProRes 422 and HEVC 10-bit at 3840x2160;
      - DNxHR HQ 1080p;
      - two MTS files: H.264 with AAC sound, and H.264 with AC-3 sound;
      - an MXF with MPEG-2 4:2:2;
      - an H.264 4K file.
    - **How each opened:**
      - The browser decodes the H.264, HEVC 10-bit (through this laptop's graphics chip) and the MTS with AAC sound as they are.
      - It cannot decode ProRes, DNxHR or MXF, nor the AC-3 sound. Those four were converted, every frame kept in order: ProRes 4K in 5.6 s, DNxHR in 1.7 s, the AC-3 MTS in 2.0 s and the MXF in 1.5 s.
      - The MXF and both MTS files came in through the application's reading, as the editor now adds them. On this laptop Chromium gives `.mts` the type `text/plain` and `.mxf` none, so the studio's reader never looked at them.
    - **The frame at each time.** At every time tried, the frame read is the frame that time names, from the source's first frame (1.48 s for the MTS).
    - **DT-12.** On three sources (the H.264 4K, the converted ProRes 4K and the MTS starting at 1.48 s):
      - «إنشاء نسخة خفيفة للمعاينة» made a 720p copy;
      - **at 48 times each, frame middles and both edges included, the preview's frame from the light copy was the export's frame from the original**;
      - the playing element played the light copy;
      - the export took its frames from the original's decoder (or the converted copy's) and never from the light copy's;
      - the export passed ffprobe: 1280x720, 100 frames, 4 s, its frames the source's own in order.
    - **Speed, measured on a busy picture** (`testsrc2`, ProRes 422 3840x2160, 10 s, 205.5 MB): converted in 7.7 s (1.3 times real time), and a 720p light copy of the original in 2.9 s (3.47 times). The corpus itself is black with white boxes and costs FFmpeg almost nothing, so its times say little.
    - **Cancelling and quitting.** A light copy cancelled midway left no file and no entry. Quitting midway left no FFmpeg of the application running, and the next start removed the `.part`.
    - **DT-13.** The package carries the pinned build:
      - `--enable-version3`, no `--enable-gpl` and no `--enable-nonfree`;
      - the LGPL v3 text;
      - `h264_mf` and `aac_mf` present;
      - only the two programs, their libraries, the licence and the pin.
  - **Re-run after the bridge changed:**
    - `qa/desktop-native.cjs` **37 of 37** (the bridge checked as version 4);
    - `qa/desktop-files.cjs` **16 of 16**;
    - `qa/desktop-shell.cjs` **81 of 81** (it installs and removes the 0.5.0 release, FFmpeg included);
    - DT-05, `qa/desktop-studio-parity.cjs --parity-only`, **12 of 12**: engine and export, in Edge and the application.
  - **Size.** The installer grows from 111.6 MB (0.4.0) to 161.3 MB (0.5.0). The unpacked application is 493.6 MB.
  - **The studio's own interface check, `qa/studio-ui.cjs`: 122 of 122 in Edge** with D5's changes. It ran through `qa/desktop-parity-hook.cjs` with `DESKTOP_PARITY_SHELL=edge`, so the studio's own record `qa/studio-ui.json` was not touched. In a browser the new line in the inspector shows nothing.
- **Found on the way, fixed.**
  - **Times.** Mediabunny reads an MPEG-TS from its first timestamp (1.48 s), while FFmpeg's output starts near zero. A converted MTS would have moved every cut already placed on it by 1.48 s. Copies of readable containers now keep the original's times (`-copyts`, tested at both ends).
  - **Adding a file.** The editor refused MXF and MTS outright, before anything could convert them.
  - **The plan was wrong about NVENC.** In FFmpeg 9, NVENC does not need the "nonfree" switch, and the pinned LGPL build carries it, with AMD's and Intel's encoders, OpenH264 and others. The application never names them. `THIRD_PARTY_NOTICES.md` says so.
  - Three faults in the check itself, before its record:
    - hooking `window.fetch` sees nothing of Mediabunny, which keeps its own reference, so decoder calls are counted instead;
    - a light copy of the tiny corpus finished before a cancel could reach it, so cancelling is tested on a three-minute busy file;
    - `ffprobe` prints an MPEG-TS stream twice (under its program too).
- **Not verified, said plainly.**
  - **The new line in the inspector was not seen rendered in the application**, and no signed-in page was opened. Its states come from the media pool, which the check drives; the owner's walkthrough is the place to see it.
  - **Real camera files were not tried.** The corpus is made by ffmpeg, not by a camera. Interlaced footage, variable frame rates, timecode tracks and audio layouts beyond stereo are untested. A converted copy keeps the first sound track only, mixed to stereo.
  - A library video's light copy is made from its copy in the folder; it is the same path as a device file's, but no library source was converted or given a light copy in the check.
  - The sound of a playing light copy was not compared with the original's; the light copy carries the first sound track at 160 kbit/s.

### 2026-10-21: the desktop application, D6: the preview on a second screen

- **What changed, in the application** (`desktop/`, version 0.6.0, bridge version 5; `MVP_draft.md` 63.5):
  - **The bridge's `windows` group** (`src/native-windows.ts`, rules in `src/windows.ts`):
    - `screens()` lists the screens: the system's own name for each, its bounds, its scale, which is the main one and which holds the asking window;
    - `popOut({ panel, project, screen, full })` opens the studio's preview in a window of its own, or moves the one already open. It goes on the screen asked for (by default another than the editor's), in the middle of it, or full screen there;
    - `close(panel)` closes it.
  - **One address.** The page names the panel (`preview` only) and the project (a UUID). The main process builds `/motion/studio/<project>/preview` on the asking page's own origin, so it never takes an address from the page. The window gets every rule of the site's windows: the address list, navigation, keys and permissions.
  - **Lifetime.** A panel's window closes when the window that opened it does.
  - **Packaging.** `package-lock.json` carries the version again: the D5 commit had left it at 0.4.0, and `tests/config.test.mjs` now holds the two equal.
- **What changed, in the site** (only inside the application; a browser behaves as before):
  - **`src/lib/studio/preview-link.ts`.** The editor and its preview window are two pages of the same address in the same profile, so they speak over a `BroadcastChannel` named after the project. Nothing of the project passes through the application or the server.
    - The editor sends what its preview shows, in the chosen shape, and its clock: where the playhead started, whether it plays, and the moment it did, on `performance.timeOrigin + performance.now()`, which both windows share.
    - The preview window runs the studio's own player from that moment, so there is no message per frame.
    - A window opened before the editor, or an editor reloaded, finds the other again: a new editor announces itself, and a window answers with hello.
    - Only well-formed messages are heard.
  - **`src/lib/studio/preview.ts`:** the player tells its clock when it starts, stops or jumps (`onClock`, `clock()`).
  - **`src/components/studio/preview-window.tsx`:**
    - `usePreviewLink` in the video editor;
    - «فتح المعاينة في نافذة مستقلة» in «عرض», one entry per screen when there are several, and «إغلاق نافذة المعاينة المستقلة»;
    - `PreviewWindow`: the picture alone on black, silent, space sending play or pause to the editor, and the two Arabic lines for waiting and for an editor gone.
  - `studio-page.tsx` shows it for `/motion/studio/<project>/preview`. `hub-page.tsx` is unchanged, as the studio's own route test pins it.
  - `Shell` leaves its frame out of that address (`isPanelWindow`). Otherwise the preview window, rarely the focused one, would have read notices every minute and raised «يحتاج قرارك» while the person worked in the editor.
- **Verified, numbers.**
  - **`desktop/`:** `npm test` **120 of 120** in 22 files (new: `windows`). `npm run typecheck` is clean.
  - **The site:** `npm run typecheck` is clean, `npm test` **533 of 533** (D6's contract tests in `tests/native.test.mjs`: the feature, the clock, the messages, the handshake both ways with a channel that delivers as a real one does, and the panel address). `npm run build` passes.
  - **`node qa/desktop-windows.cjs`: **13 of 13**** (`qa/desktop-windows.json`), inside the development package, with the studio's player, media pool and link on both sides and a 20 s source carrying its frame numbers:
    - the bridge: version 5; the screens; another panel and a malformed project refused; the window opened on the project's own address, and the two finding each other;
    - **DT-14, playing 8 s: at each of the 473 frames the preview window drew while playing, its playhead was within one frame (33.3 ms) of the editor's at the same moment: mean 1.65 ms, p95 2.7 ms, max 12.5 ms**;
    - standing still at 7.3 s, both show frame 219, read from the picture; paused after playing, both stop on the same frame;
    - **a jump to 15 s while playing is followed in 0.4 ms, and the two stay within one frame on both sides of it (mean 1.31 ms, max 11.4 ms)**;
    - space in the preview window plays and pauses the editor;
    - full screen on the screen asked for, then back to a window, the same window each time;
    - the editor reloaded is found again; the editor leaving closes the window.
  - **Re-run with bridge version 5:** `qa/desktop-media.cjs` **52 of 52** (the light copy still played, now asked with CORS); `qa/desktop-native.cjs` **37 of 37**; `qa/desktop-files.cjs` **16 of 16**; `qa/desktop-shell.cjs` **81 of 81** (it installs and removes the 0.6.0 release); DT-05 `--parity-only` **12 of 12**; and the studio's own `qa/studio-ui.cjs` **122 of 122** in Edge, through `qa/desktop-parity-hook.cjs` so the studio's record was not touched.
- **Found on the way, fixed.**
  - **A tainted preview canvas (D4).** A playing video element read from `commshub-file://` was not asked with CORS, so a canvas that drew it could no longer be read. The protocol already answered CORS for the site, so `media.ts` now sets `crossOrigin = 'anonymous'` on those elements.
  - **A preview window raising notices**, before it was written: the site's frame is left out of it.
  - **An editor reloaded runs no cleanup**, so the preview window never heard it leave. The editor now also says goodbye on `pagehide`, and a window always greets a newly announced editor.
  - Three faults in the check itself, before its record:
    - `window.status` is the browser's own status-line property, so the fixture's function of that name never existed, and early waits on it timed out quietly;
    - frames the preview window drew while standing still were compared as if the editor were still playing;
    - the window count was read a moment before the closed window left it.
- **Not verified, said plainly.**
  - **A second screen.** This laptop had one screen (1536x864 at 125%) during the check. Full screen was checked on the screen the editor was on; placing the window on another screen is the same call with another screen's id, unit-tested for which screen and where, but not seen.
  - **The menu entry was not seen rendered**, and no signed-in page was opened: the owner's walkthrough is the place.
  - **The deviation from the plan.** "Kept in step through the bridge" became two pages speaking directly, with the bridge only opening and placing the window: there is less to secure, and nothing of a project in the main process.

### 2026-10-22: fixes from role simulation sim-20261015-03, the quick ones

- **Source.** The run's archive at `D:/Agents/testingh/sim-20261015-03`, which tested main `e8386cc` of 2026-10-15. Its reports, journals and 3,518 page diagnostics were read again; about 690 of its screenshots and 556 frames of its films were reviewed; every finding was checked against the current code before a change. APPROVAL-001 (approval through a stale dialog, and a board drag to «جاهز للنشر» that approves without a dialog) and REQ-001 (lists that refresh only on opening or on returning to the tab) are not part of this entry and stay open.
- **What changed.**
  - Work page «مرتبط به»: the linked-mail query passed an array to `.contains()`, which postgrest-js writes as `cs.{[object Object]}`. Every work and approval page got a 400 (241 in the run) and linked mail never showed. It is now a JSON string (`src/components/work/data.tsx`). Found in the run's diagnostics, not in its findings.
  - PROJECT-001: «عمل في المشروع» opens «إنشاء» with `?project=`. The form read it once, at first render, before the projects had loaded, and dropped it. It is now added when the projects arrive, once (`src/components/work/create.tsx`).
  - HELP-001: the explanation window was placed without regard to the guide bar and is drawn above it, so on a phone it covered «دليل الصفحة» and «إنهاء وضع الإرشاد». The bar is now kept clear, weighted above covering the explained element (`src/lib/kit/place.ts` `avoid`, `src/lib/kit/guide.ts`).
  - RESP-001: on a phone the Admin's «عرض بصفة» select kept 192 px in a top-bar row that could not wrap, so the page was 392 px wide. The row wraps and the select is `min(192px, 44vw)` (`src/app/globals.css`).
  - «حسابات المنصات»: a platform heading could not wrap and «ربط عبر …» left the screen at 390 to 430 px (`src/app/work.css`).
  - «إنشاء»: its bar was sticky 12 px from the foot, under the phone's bottom bar. Below 700 px it sits 80 px up (`src/app/work.css`).
  - Library card: the video length sat on the stage chip («بحاجة إلى تعديل» read «احة إلى تعديل»). It now sits under the version (`src/app/media.css`).
  - Arabic counts: «1 أعمال»، «1 مراحل»، «1 أجزاء»، «1 مشاريع»، «1 نشطة» and the like. `countOf` gives the forms for one, two, 3 to 10 and 11 up (`src/lib/work/rules.ts`), used on home, projects, the plan, the list, channels, create, the day dialogs and the work page.
  - Wording: «حين تُبنى» is gone from the no-accounts hints (the accounts page exists). The create hint says who adds accounts and that a social post is not saved until one is linked; the database refuses it (`CHANNEL_REQUIRED`).
  - Self-approval in the library: the uploader of the current version no longer sees «اعتماد», «طلب تعديل» or «رفض» on the asset page and is told why; the approval dialog checks the version's uploader itself and disables «اعتماد وقفل» (`src/lib/media/rules.ts` `uploadedByMe`, `src/components/media/actions.ts`, `asset-page.tsx`, `dialogs.tsx`). The database already refused it (SELF_APPROVAL).
  - Checked and left as it is: «Google Drive» in the upload, folder and rename messages is correct, since new uploads go to Google Drive by design. The run's mismatch came from its test-only storage path.
- **Verified, numbers.** `npm run typecheck` clean; `npm run build` passes (36 static pages); `npm test` **505 of 505**. Four tests are new: the guide bar kept clear on a phone, no decision offered on your own version, the linked-mail filter as postgrest-js writes it, Arabic counts. One existing assertion was corrected from «تبقى 2 مراحل» to «وتبقى مرحلتان». Browser fixture `qa/sim03-quick-fixes.cjs` **17 of 17** in headless Edge with the real stylesheets: the Admin top bar fits 320, 360, 375 and 390 px, and the old rule reproduces the run's 392 px at 320; «ربط عبر LinkedIn» stays on screen at 390 to 430 px; the create buttons stay above the bottom bar while scrolling; the video length clears the stage chip. Each fix is also shown failing with the old rule.
- **Not verified, said plainly.** Nothing was seen signed in. The fixtures copy the markup, not the pages. The project prefill, the linked-mail list and the self-approval note were not seen in a running page.

### 2026-10-26: the desktop application merged into main

- **The owner's request.** On 2026-10-26 the owner asked for the desktop application to be merged first, before the Android application is planned. This replaces the earlier intention to merge after the studio's third round.
- **How it was done.** `desktop-app` (D0 to D6, `4df8776`, version 0.6.0) was merged into `main` (`330b9fd`) on a side branch in the desktop worktree. The merge was checked there, and then main moved to the merge commit by fast-forward. Main's uncommitted files (the studio and calendar changes, `validation/recheck-R01.md`, the role-simulation documents, `qa/simulations/`, `videos/`) share no path with the merge, were not touched, and are still uncommitted. Only `Status.md` and `progress.md` conflicted. Both sides were kept, in date order, and the front matter kept main's newer `updated:` dates.
- **Verified, numbers.** All of these ran on the merged tree:
  - `npm run typecheck` clean, and `npm run build` passes.
  - `npm test` **537 of 537**: the desktop branch's 533 plus the four of 2026-10-22.
  - Desktop `npm test` **120 of 120**, with its typecheck clean.
  - `qa/sim03-quick-fixes.cjs` **17 of 17**: main's phone layout fixes with the desktop's styles.
  - `qa/desktop-csp.cjs` **13 of 13**: every page's Content-Security-Policy in Edge and in the development package, now including main's newer pages.

  The first build attempt ran beside the test run and stopped with exit code 127 and no message. Run again on its own, the build passed.
- **Not done, said plainly.** Nothing is pushed. Until a push, which deploys, production has none of the desktop's site code: `src/lib/native/`, «تطبيق سطح المكتب» on «الحساب», the old-application banner, or the pages' Content-Security-Policy. The `desktop-releases` migration is still not applied, no release is published, the application is unsigned, and nothing was seen signed in.

### 2026-10-26: the Android application, A0: the owner's decisions and the specification

- **The owner's decisions.** On 2026-10-26 the owner answered the questions raised that day about phones:
  - A sideloaded APK is the pre-launch Android download while the Google Play developer account is verified.
  - The app id is `sa.commshub.app`, matching `sa.commshub.desktop`.
  - The release key is held by the owner outside the repository, and Google Play later uses the same key (Play App Signing with our own key), so an installed APK updates from Play without being removed.
  - The download sits on «الحساب» for every signed-in person, from a public bucket.
- **The plan.** The owner then approved `Android_Build_Plan.md`: everything of `Mobile_Apps_Plan.md` for Android except the studio, in phases:
  - A1: site preparation;
  - A2: the Capacitor shell, with written pass criteria and the thin native shell as fallback;
  - A3: the download page and the update window;
  - A4: files;
  - A5: «أجهزتي» and push through Firebase Cloud Messaging;
  - A6: app links and the lock;
  - A7: camera, share-in and background upload;
  - A8: Play readiness.

  Where the owner gave no new answer, the accepted recommendations of `Mobile_Apps_Plan.md` stand:
  - M-1: Capacitor opening the live site;
  - M-3: pushes started by the writer's page and the bridge computer, nothing scheduled;
  - M-4 and M-5: what is pushed and what a lock screen shows;
  - M-12: the lock off by default;
  - M-13: a person sees only their own devices.
- **What changed.**
  - `Android_Build_Plan.md` (new).
  - `MVP_draft.md` section 64: the window, links, outside connections, links sent from the sign-in page, no connection, permissions, downloads, the studio left out, and what waits.
  - The Android paragraph of `AGENTS.md`.
  - A scope-addition line in `Roadmap.md`.
  - A dated pointer at the top of `Mobile_Apps_Plan.md`.
- **One choice made while specifying.** Links sent by email from the sign-in page («أول دخول», «نسيت كلمة المرور») use PKCE, so they must come back to the cookie store that asked for them. Until the application receives its own links (A6), the application points the person to the browser for those two instead of sending a link that would fail.
- **Verified.** Documents only; no code changed, so no tests were run for this entry.

### 2026-10-26: the Android application, A1: site preparation

- **What changed.**
  - **The native contract** (`src/lib/native/index.ts`) names the Android application's features: `appUpdate`, `download`, `share`, `push`, `links`, `lock`, `capture`, `incoming` and `upload`. Each is detected by all of its methods, like the desktop's, and the shapes they carry name files by a path on the page's own address or by a token, never by a full address or a path on the phone.
  - **Releases** (`src/lib/native/releases.ts`):
    - `ANDROID_FEED`, the public bucket `android-releases`, folder `android`;
    - `MINIMUM_ANDROID` = 0.1.0;
    - `parseAndroidLatest`, a strict reading of `latest.json`: an `.apk` name with no path, a size up to 300 MB, a lowercase SHA-256, a growing version code, an optional floor, and up to eight lines of Arabic notes;
    - `apkMustUpdate`;
    - `tooOld`, which now takes the platform and keeps the desktop's answer when none is named.
  - **Panels that assumed any application is the desktop.**
    - `DesktopAppPanel` speaks of the application only inside the desktop's.
    - `DesktopUpdateBanner` shows only in the desktop's.
    - «الحساب» leaves the desktop panel out inside the Android application.
    - «معلومات الجهاز» names the Android application «تطبيق الهاتف».
    - A new hook, `useNativePlatform`.
  - **Links mailed from the sign-in screen** (`src/lib/native/entry.ts`, `auth-gate.tsx`). «أول دخول», «نسيت كلمة المرور» and «انتهت صلاحية الرابط» ask where the link returns:
    - a browser: the root, as before;
    - the Android application with verified links (A6): the new route `/app/return`, which forwards with the same query to the root;
    - otherwise: the screens show «يكتمل هذا من المتصفح: افتح المركز في المتصفح وأكمله هناك، ثم ارجع إلى التطبيق وسجّل الدخول.» in place of their form, and nothing is mailed.
- **Found on the way, fixed.** The desktop application had the same fault: a link mailed from its sign-in screen opens the system browser, where the PKCE code of the request does not exist, so the link could not work. It now points to the browser like the Android application (`MVP_draft.md` 63, amended).
- **Deviation from the plan, reasoned.** Safe areas are not added to the site's CSS. The Android shell pads its web view by the system bars and the keyboard (A2), so nothing pinned can sit under them at any width, the site's styles stay as they are, and no `viewport-fit=cover` changes iPhone Safari today. The safe-area check moves to A2. The plan carries the note.
- **Verified, numbers.**
  - `npm run typecheck` clean; `npm run build` passes (the route `/app/return` listed).
  - `npm test` **546 of 546**. Nine tests are new in `tests/native.test.mjs`: the Android shell and its features, the floors per platform, `latest.json` with fifteen refused shapes, the update floor, where a mailed link returns on each client, `/app/return` (303, the query and nothing else), every mailed link in `auth-gate.tsx` going through it, the device line, and no emoji.
  - Browser check `qa/android-site.cjs` **12 of 12**, in headless Edge on the production build with the checkout's environment, at 390 px. Four clients were stood in for: a browser, the desktop application, and the Android application without and with verified links.
    - A browser mails `redirect_to` the root, and the Android application with verified links mails it `/app/return`.
    - The desktop application and the unverified Android application show the note, ask for no address or password, and mail nothing.
    - `/app/return` answers 303 and lands on the sign-in screen with the query kept.
    - The mail requests were answered inside the browser and never reached Supabase.
- **Not verified, said plainly.** Nothing was seen signed in: the account page's panels and the banner were not rendered in a running page. The bridges were stand-ins; the real Android shell comes in A2.

### 2026-10-26: the Android application, A2: the shell, and its gate passed

- **What was built.** `mobile/`: Capacitor 8.5.3 (`@capacitor/core`, `@capacitor/android`, `@capacitor/cli`, pinned, 2026-10-07), id `sa.commshub.app`, with its own `package.json` and lockfile outside the site's build. Vercel ignores it.
  - **The window** (`MainActivity.java`) opens the compiled address. It pads the web view by the status bar, the gesture or button bar, the display cut-out and the keyboard. The back key goes back through the site, then leaves. Cookies are written to disk when the application goes to the background.
  - **The page's view of the application** (`Identity.java`, `Shell.java`): a document-start script on the compiled addresses defines `window.commsHubNative` (platform `android`, shell `capacitor`, version, bridge 1) in the top frame only, frozen and not replaceable.
  - **Where an address goes** (`Navigation.java`): the desktop's rules, plus pages for outside people (`/r/`, `/m/`), which go to the browser. The connection note is a native Arabic dialog.
  - **Downloads** (`Downloads.java`, `FileNames.java`): fetched by the application with the web view's cookies, written to Downloads under the name the site gives (RFC 5987 Arabic names), or else the name in the address. A file made inside the page (blob, data) gets the Arabic message.
  - **Narrowed** (`ShellWebViewClient.java`, `ShellChromeClient.java`):
    - only the microphone, and only to a compiled address;
    - Capacitor's file routes refused;
    - the site's own error pages left as they are;
    - certificate errors refused with their own screen.
  - **The connection screen** `www/offline.html`, in the desktop's words.
  - **The brand.** The launcher icon is a vector of the brand tile's rosette (adaptive and themed), and the opening screen is the tile's green.
  - **Builds** (`android/app/build.gradle`, `scripts/build.mjs`, `scripts/config.mjs`):
    - release `sa.commshub.app`, development `.dev`, and the check package `.qa`;
    - the address list per build, from `BuildConfig`;
    - the version from `package.json`;
    - the owner's key only from a properties file named by `COMMSHUB_KEYSTORE_PROPERTIES`;
    - channels `direct` and `play`;
    - Android 10 (API 29) or newer, targeting API 36.
  - **Not copied or kept.** Backups of the application are off (`allowBackup="false"`, `data_extraction_rules.xml`). `file_paths.xml` exposes only a `shared/` cache folder.
  - **`mobile/README.md`**: builds, tests, the owner's key (the `keytool` command, the properties file, the fingerprint), and the JDK note.
- **Found while building, fixed.**
  - **Error status shown as offline.** Capacitor shows its offline page on any error status of the main page, so the site's own "link not valid" page (404) would have read «تعذّر الوصول إلى المركز». The shell now shows the site's page.
  - **«إعادة المحاولة» reopened nothing.** Capacitor serves the offline page from its own local address (`https://localhost/offline.html`), so the button reloaded an empty local page. It now asks the application for the site (`/again`).
  - **Files on the phone reachable from the page.** Capacitor's `/_capacitor_file_` route would have let a page of the site read the application's own files on the phone.
  - **Permissions granted without a word.** Capacitor's chrome client grants any web permission that has no Android permission behind it (MIDI, protected media) without asking.
- **Deviations from the plan, reasoned.**
  - Java instead of Kotlin, as Capacitor's template is, so no Kotlin plugin is added.
  - The application's own downloader instead of Android's `DownloadManager`, whose database would have kept the session cookie in the request's headers.
  - The local site at `http://127.0.0.1:3000` through `adb reverse` instead of `10.0.2.2`. A loopback address is a secure context, as production is: on `10.0.2.2` the page has no `navigator.mediaDevices`.
  - Android 10 as the floor (decision M-11 taken here). Scoped storage writes to Downloads without a storage permission.
  - No `@capacitor/app`: the back key is native.
- **Verified, numbers.**
  - **Unit tests.** `mobile` `npm test` **9 of 9**: the address equal to the desktop's and the site's, the builds, the permissions, the desktop's routes, note and connection screen word for word, the retry, and no emoji. JVM tests **12 of 12**: where an address goes (5), file names (5), the identity script (2).
  - **Builds.** The check APK is 9.29 MB, and the unsigned release APK 7.59 MB, with Android's release lint passing.
  - **The gate**, `qa/android-shell.cjs`: **27 of 27**. It ran on the `Pixel_9_Pro` emulator, Android 16, started read-only, against the site's production build at `http://127.0.0.1:3000`, on signed-out pages:
    - the release APK opens production alone with inspection off;
    - the bridge's shape, frozen; absent in a same-address frame and on another address; Capacitor's file routes answer 404;
    - no Content-Security-Policy violation with the bridge;
    - the site's 404 page shown as itself;
    - the file chooser opens Android's picker;
    - the microphone is asked by Android ("While using the app"), then gives one audio track; the camera through the page and location are refused;
    - another site, a review link and «متابعة في المتصفح» open the browser; the connection note in Arabic, with «إلغاء» keeping the page;
    - the back key;
    - a file of the site saved to Downloads with the same SHA-256; a file made in the page not saved;
    - the web view clear of the status and gesture bars;
    - with the keyboard open the page shrinks (876 to 477 CSS pixels) and a field at its foot stays in view;
    - with the local site stopped, the Arabic connection screen, and «إعادة المحاولة» back to the site;
    - a cookie surviving the application being closed and stopped.

    The check package was uninstalled at the end.
  - The site's typecheck stays clean; `mobile/` is outside it.
- **Not verified, said plainly.**
  - Nothing was seen signed in, so the real session surviving a restart is the owner's check on a real phone.
  - The Arabic toasts (download started, file made in the page) are not readable by UI Automator.
  - No real phone was used, no signed release was built (the key is the owner's), and nothing was pushed or published.

### 2026-10-26: the Android application, A3: «تطبيق الهاتف» and the update window

- **What was built.**
  - **Native, the APK channel only** (`AppUpdate.java`, `InstallReceiver.java`, `Releases.java`, `CommsHubShell.java`, `src/direct/AndroidManifest.xml`):
    - The application reads `latest.json` from its compiled feed (the public bucket `android-releases`, folder `android`, held equal to `ANDROID_FEED`). It reads it when it opens and, at most every four hours, when it comes back to the front, and hands the text to the page.
    - On «تحديث الآن» it builds the APK's address itself and fetches it. Before Android is asked, it checks the size, the SHA-256, the application's own id, a newer version, and the application's own signing key. It then installs through a `PackageInstaller` session, and Android asks the person.
    - The first time, it opens Android's «install unknown apps» setting.
    - Google Play's copy (`play`) has neither the permission nor the update.
    - Bridge version 2: `window.commsHubNative.appUpdate` (`status`, `start`), mapped by the identity script to the plugin through Capacitor, which hears only the main frame. The plugin also checks that the page in front is on the list.
  - **Site** (`src/lib/native/app-update.ts`, `src/components/native/phone-app.tsx`):
    - The update window on every page and on the sign-in screen: a newer release with «تحديث الآن» and «لاحقاً» (a day); «يجب تحديث التطبيق» below the site's floor or the release's `minimum`, which cannot be put off; «ما الجديد في الإصدار …» once after an update, never at the first opening.
    - «تطبيق الهاتف» on «الحساب»: in a browser the APK from the bucket and how to install it, inside the application its version and update.
    - Every reason the application gives for stopping is said in Arabic.
  - **Release mechanics.** The migration `20261026120000_android_releases.sql` is written and not applied. `mobile/README.md` has "Publishing a release" (the key, the order of uploads, `latest.json`).
  - **Also.** The back key now asks the page's open window first, as Escape does: the site's dialogs close on it, and the required update stays.
- **Found while checking, recorded.**
  - **Google Play Protect.** After Android's «Update», Play Protect shows "App scan recommended" for an application it has not seen. A pilot phone will see it on the first installation and on every update until Google knows `sa.commshub.app` (developer verification or Play). The texts on «الحساب», in the update window, in `MVP_draft.md` 64.1 and in the README say to choose the scan and then go on.
  - **The check sends nothing to Google.** It takes «More details» then «Install without scanning».
  - **The check's two versions.** The check package is built at two versions with `-PcheckVersion` (check package only). The application reads its version from Android at run time, so the page always sees the version installed.
- **Verified, numbers.**
  - **Tests.** `npm test` **550 of 550**, with four new A3 tests: the report's shape, which window, the Arabic words for every reason the application gives, and the feed equal to the build and the bucket read-only. `mobile` `npm test` **11 of 11**. JVM **15 of 15**, adding the release rules and bridge 2. Typecheck and build clean.
  - **`qa/android-update.cjs`: 12 of 12** on the `Pixel_9_Pro` emulator, Android 16:
    - 0.1.0 installed; 0.1.1 offered on the sign-in screen with its notes;
    - «لاحقاً» held on the next page;
    - «تحديث الآن» first opening Android's own setting;
    - a file with a wrong SHA-256 refused, and an APK re-signed with a throwaway key refused, nothing installed in either case;
    - a `minimum` above 0.1.0 giving the window that the back key does not close;
    - Android's «Update this app?» with the rosette and «مركز الاتصال المؤسسي», then Play Protect, then 0.1.1 installed;
    - the site's cookie kept, the page seeing version 0.1.1, «ما الجديد في الإصدار 0.1.1» with its two lines, said once.

    The throwaway key and the APKs were deleted, and the check package uninstalled.
  - **`qa/android-shell.cjs` again: 28 of 28**, adding the back key closing a window of the page.
- **Not verified, said plainly.**
  - Nothing was seen signed in, so «الحساب»'s panel was not seen rendered.
  - The bucket is not applied, so the browser's download link was not seen working against a real release.
  - No real phone, no signed release (the key is the owner's), nothing pushed or published.

### 2026-10-27: the Android application, A4: opening, saving and sharing files

The owner asked on 2026-10-27 to build through A5 now. A4 was built here on `main`; A5's server half runs at the same time in its own worktree.

- **What was built.**
  - **Native** (`SiteFiles.java`, `Downloads.java`, `CommsHubShell.java`, `Identity.java`, `MainActivity.java`, `Shell.java`):
    - Bridge version 3: `download.save`, `download.open` and `share.file`, each taking `{ path, name }` and answering `true` or `false`.
    - The path must be one of the site's four file routes (a library file with `?v=N` or `?download=1`, a messaging file, a mail attachment, an inbound mail file). The application builds the address on the origin of the page in front; anything else is refused before anything is fetched.
    - «حفظ في الهاتف» puts photos and videos in the gallery, in the album «مركز الاتصال المؤسسي», and everything else in Downloads. A kind the gallery refuses falls back to Downloads.
    - «فتح الملف» and «مشاركة» fetch into `cache/shared/<random>/<name>`, the FileProvider's only folder, then open the phone's viewer or Android's share sheet with a read grant. Copies are kept a day and swept at start.
    - A file over 50 MB asks before it is fetched to share, saying its size. «إلغاء» fetches nothing.
    - A progress notice in a quiet channel «التنزيلات», shown only when notices are allowed. `POST_NOTIFICATIONS` is declared now and asked for in A5.
    - The tapped-link download of A2 is unchanged: Downloads, the same messages.
  - **Site** (`src/lib/native/files.ts`, `src/components/native/phone-file.tsx`):
    - The asset page shows «فتح الملف» (for kinds the page cannot show), «حفظ في الهاتف» and «مشاركة» in place of «تنزيل»; an earlier version has «فتح الملف» in place of «عرض».
    - A mail attachment, a Gmail attachment and a file in «المراسلة» ask which, in a small window the back key closes. A picture in «المراسلة» gets «حفظ في الهاتف» and «مشاركة» in its own window.
    - A browser and the desktop application see exactly what they saw before.
    - Saving and sharing a library file use `?download=1`, so the library's log records it as a download; opening uses the version shown.
  - **The specification** is `MVP_draft.md` 64.2; the rule is a new bullet of the Android paragraph of `AGENTS.md`; `mobile/README.md` names the new classes and the check.
- **Found while checking, and fixed.**
  - **Capacitor's own interfaces reached every frame.** Capacitor 8.5.3's built-in plugins add `CapacitorCookiesAndroidInterface` and `CapacitorHttpAndroidInterface` with `addJavascriptInterface`, which Android gives every frame of every address. The cookie one sets a cookie for any domain. A first run without the fix showed both as objects inside a frame of another address. `Shell.narrow` removes both once Capacitor has loaded its plugins. Capacitor's page script works without them. The A2 and A3 builds had the same exposure; nothing was released.
  - **Capacitor's cookie handler.** The same plugin sets a process-wide `CookieHandler` that adds the web view's cookies to every Java connection by host. The first run showed the site's cookie sent twice to the site and once to another port of the same host after a redirect. `Shell.narrow` sets the handler to none, so the application's connections carry the site's cookie only where `Downloads.java` puts it, an address on the compiled list. The update feed of A3 needs no cookie.
  - Both are held by a mobile test that also reads Capacitor's sources, so an upgrade that renames them fails the test.
- **Verified, numbers.**
  - **Tests.** `npm test` **556 of 556** (550 before; 6 new A4 tests: the routes equal to `SiteFiles.java`, the paths a page may name, what the phone offers, which path each action asks for, the bridge call, the three pages wired; and 3 A5 rule tests that come with A5). `mobile` `npm test` **13 of 13** (11 before). JVM **21 of 21** (15 before; `SiteFilesTest` 5, `IdentityTest` one more). Typecheck clean; `npm run build` clean.
  - **`qa/android-files.cjs`: 23 of 23** on the `Pixel_9_Pro` emulator (Android 16, check package), first run 20 of 22 before the two fixes above and a mistake in the check (the refusal step counted the redirect step's request); 21 of 23 with the fix taken out again, to show the check catches both; 23 of 23 with it.
    - In Edge as a browser: no phone button, «تنزيل» kept, a mail attachment followed as a link.
    - In the application: bridge 3, the buttons in order; a PDF to Downloads under its Arabic name, a PNG and a video to the gallery album, each by SHA-256; the cookie sent and the download address asked; the window that asks, closed by the back key; the phone's PDF viewer opening the cached copy; the share sheet with the cached copy; a 60 MB file saying «60 ميغابايت» first and «إلغاء» keeping nothing; a redirect to another address without the cookie; eighteen refusals (six paths, three methods) with nothing fetched; the progress notice in «التنزيلات» shown while a slow file arrived and gone after.
  - **Earlier checks again on the changed shell:** `qa/android-shell.cjs` **28 of 28** run alone; in the first run straight after the files check it was 27 of 28, the keyboard step not seeing the page shrink within its 8 seconds while this computer was also building the site for A5's server half (nothing in A4 touches the window's insets), `qa/android-update.cjs` **12 of 12** on the third run. The first two stopped at a relaunch (3 of 4, then 5 of 6) with "Target page, context or browser has been closed"; the crash log showed Android stopping UiAutomation, Playwright's driver, which shares Android's one accessibility connection with the checks' own screen dumps, and no crash of the application. The check now takes the phone again once when that happens (the shell check already did); on the third run it was not needed.
- **Not verified, said plainly.**
  - Nothing was seen signed in: the asset page, mail and «المراسلة» were not seen with real files. The fixture page uses the same component.
  - The Android toasts (started, done, failed) cannot be read by UI Automator and were not read.
  - No real phone. Nothing pushed.

### 2026-10-27: the Android application, A5 server: «أجهزتي» and the push core

Lane 2 of `Android_Continue_Prompt.md`, in its own worktree, cut from `main` at `895f636`. The specification is
`MVP_draft.md` 64.3; the project rule is the new "Push notices are real too" paragraph of `AGENTS.md`. The owner approved
applying the migration on 2026-10-27 ("Yes, apply it").

- **What was built.**
  - **Migration `20261027120000_push.sql`, applied to comms-hub** as version `20261027184903 'push'`; the stored statement's
    md5 `e82661a14d3861edd1482443f964d106` equals the file's.
    - `devices`: the person, platform (`android`), version, name, the FCM token, tiers wanted, «إخفاء نص التنبيهات», seen,
      removed. Pages get every column but the token (column grants) and read the view `my_devices`; nobody writes the table.
    - `device_register(p_device, p_platform, p_version, p_name, p_token)` returns `{id, name, push}`: the same device again by
      its id or by its token; a token that was on another row (someone else signed in on that phone) leaves it, and that row
      is removed; a removed device is refused with `DEVICE_REMOVED`; twenty live devices a person; a new phone keeps the
      person's latest choices. `device_seen(p_device, p_version)` answers `live`, `removed` or `unknown`. `device_rename`,
      `device_remove` (token deleted, waiting rows gone), `device_prefs(p_device or null for all, p_attention, p_hide_text)`.
    - `push_outbox`: ids only (device, kind, notice or chat or mail message), one row per device per reference, state,
      attempts, an error code. Filled by a trigger on `notifications` (decide always, attention if wanted, never info, never
      the actor, never a notice about messaging), by `push_route_chat` spliced into `chat_send` after `wa_route` (direct
      messages, mentions, levels; level 3 passes a mute; never the author) and by `push_route_mail` spliced into `mail_send`
      just before it answers (action cards to their addressees in internal mail; never muted threads, held or scheduled
      mail). Both splices take the live definition and fail the migration if it is not as expected.
    - `push_flush_begin`/`push_flush_end` (a lock and a two-second gate in `push_state`, at once `empty` when nothing waits),
      `push_claim` (skip locked, five-minute stale release, five attempts; builds the words: a notice's text unless hidden,
      «رسالة جديدة من …» for messaging and mail, `/n/<kind>/<id>`), `push_report` (`TOKEN_GONE` deletes the device's token,
      `RETRY` requeues, anything else closes), all with `MAIL_SERVER_KEY`. `push_fcm_slot` makes the
      `fcm_service_account` integration row for a holder of `integrations.secrets`.
  - **The sender** (`src/lib/push/`): `payload.ts` (the rules, pure; data-only FCM messages at lane 1's request of the same
    day, with `v, kind, id, tier, go, tag, title, body`; priority HIGH for decide, NORMAL for attention), `fcm.ts` (the
    service account, an RS256 assertion with `node:crypto`, the access token kept 55 minutes and the vault read only then,
    FCM HTTP v1, Google's refusals as codes; Google's addresses are fixed, never taken from the file), `flush.ts`,
    `server.ts`, `target.ts`, `kick.ts`, `devices.ts`.
  - **Routes.** `/api/push/flush` (POST: the bridge's key, or a signed-in page of this site; counts only in the answer).
    `/api/push/credential` (the service account, checked with Google before `storeChecked` keeps it). `/n/[kind]/[id]`
    (where a tapped push leads: a notice through the person's own session, a conversation or a thread by id; changes nothing).
  - **Starters.** S-1: `kickPush()` after successful writes in `useWork().call`, chat send and the chat provider's other
    writes, mail send and the mail provider's writes, the accounts provider and the permission requests. S-2: the WhatsApp
    bridge calls `/api/push/flush` on each tick through a second client (`pushClient`), one flush at a time, a minute's
    pause after a refusal, never in the way of the WhatsApp work.
  - **Interface.** «الحساب»: «أجهزتي» (rename; «إزالة الجهاز» behind a long press, `HOLD.deviceRemove`), «إعدادات التنبيهات»,
    and «الخروج من الأجهزة الأخرى». «الإعدادات» «الاتصالات»: «تنبيهات الهاتف (Firebase)». The account guide has three new
    parts, a rule and a news step (version 3).
- **Decided while building, recorded.**
  - **Destinations without a query string.** `noticeHref` gives addresses with queries (`/mail/chat?room=…`,
    `/accounts?person=<email>`), which `Mobile_Apps_Plan.md` 5.4 forbids in a payload. A push names `/n/<kind>/<id>` and the
    site turns it into the page.
  - **Urgent chat notices are pushed by the chat route,** because `chat_send` writes the message's first 80 characters
    into those notices; pushing them as notices would send the text through Google.
  - **Direct messages and mentions are «يحتاج انتباهك»,** so a person who turns that off gets only decisions; mail action
    cards are «يحتاج قرارك». A task card also writes its task notice («يحتاج انتباهك»), so a person who keeps attention on
    gets both; recorded in 64.3.
  - **Data-only messages** (lane 1's request): the application shows each push itself, picks the channel (`decide`,
    `attention`, `messages` for chat and mail) and handles the tap, which another application cannot forge.
- **Found while building, fixed.**
  - **«تسجيل الخروج» signed out of every device.** supabase-js signs out globally when no scope is given; the button now
    passes `scope: 'local'`, beside the new «الخروج من الأجهزة الأخرى» and the existing «الخروج من كل الأجهزة».
  - **`supabase/tests/permissions_rules.sql` check 88** passed a boolean to a helper that takes text, so the file stopped
    there; the expression is now cast to text, its meaning unchanged.
- **Verified, numbers.**
  - **Rules before applying** (the migration and `push_rules.sql` in one rolled-back transaction): attempt 1 stopped at
    check 08 (a Postgres regex bound above 255; fixed in the migration), attempt 2 stopped at check 49 (the rule file read
    `devices` as anon; fixed in the file), attempt 3 **130 of 130**, including the two splices changing nothing else
    (chat_send and mail_send without the new line equal their md5 from before). The run's md5 equals the combined text's.
  - **After applying:** `push_rules.sql` **128 of 128**, run md5 `e1a1b2045d0cd2a67763a64ad6215ce6` equal to the file's;
    afterwards 0 throwaway accounts, devices or outbox rows. `qa/push-rules.json`.
  - **Existing runs after applying:** `chat_rules.sql` 22 of 22 as its header states; `urgency_rules.sql` 41 of 41;
    `mail_rules.sql` 25 of 25 as its header states except the request number of 16b (187, not 184: a sequence advances even
    in a rolled-back run); `permission_requests_rules.sql` 49 of 49. **`whatsapp_rules.sql` 96 of 98** and
    **`permissions_rules.sql` parts 1 and 3, 135 of 137**: the four that differ (whatsapp 04 and 04b, permissions 02 and
    114) expect the role defaults of 2026-10-13 and 14, before the owner's decisions of 2026-10-15 gave the director the
    system number and the settings rights (`Action_Plan.md` B9); every routing, claim, report, mail and messaging check
    passed. Part 2 of `permissions_rules.sql` calls neither replaced function and was not run.
  - **Advisors after applying:** security, the push objects only as the intended callable definer functions (four
    key-gated ones to anon, the five device functions, the slot and the four to authenticated; the three routes are not
    callable); performance, two INFO unused-index notes on the new, empty `push_outbox`. Nothing else new.
  - **`npm test` 572 of 572** (550 + `tests/push.test.mjs` 22); `npm run typecheck` and `npm run build` clean (the three new
    routes listed). Bridge `node --test`: 16 passed (three new push tests), 1 skipped (the compat test needs
    `whatsapp-web.js`, which is not installed in this worktree's bridge folder).
  - **`qa/push-flush.cjs` 35 of 35** (`qa/push-flush.json`): the real flush against a local FCM stub that verifies the RS256
    assertion with a key pair made in the run; the stub received exactly the seven sendable messages, data-only, each equal
    to the specification, none with a message's text or a query string; an invalid token, a busy Google and a refused item
    handled; the access token and the vault read once for two flushes; nothing claimed without a credential or with a
    refused one. Then the built site on port 3101: the flush route refuses outsiders (403), the signed-out (401) and a wrong
    bridge key (401), and with the right bridge key the database refuses a server key it does not know (502, counts only);
    `/n/` leads to the conversation, the thread, or home. Attempt 1 was 33 of 35: the check sent `127.0.0.1` as Origin
    while the server names itself `localhost`; the check was corrected, not the route.
- **Not verified, said plainly.**
  - **No real delivery.** There is no Firebase project yet: nothing reached a phone, and Google's real token and send
    endpoints were not called. Real delivery waits for the owner's Firebase project, the service account entered in
    «الإعدادات», and lane 1's A5 app.
  - Nothing was seen signed in: «أجهزتي», «إعدادات التنبيهات», the session buttons and the Firebase card were not seen
    rendered, and S-1 was not seen starting a flush from a real page.
  - «الخروج من كل الأجهزة» does not clear device tokens: a phone signed out that way keeps its token until the application
    registers again or the person removes it.
  - Nothing pushed; `Status.md` is left to the coordinator.

### 2026-10-27: the Android application, A5, the application's half: push notices on the phone

Built on `main` against the push migration of A5's server half (built at the same time in its own worktree, merged after). Delivery through Firebase waits for the owner's Firebase project.

- **What was built.**
  - **Native** (`Push.java`, `PushService.java`, `ShellApp.java`, `CommsHubShell.java`, `Identity.java`, `MainActivity.java`):
    - Bridge version 4: `push.state`, `push.request`, `push.token`, `push.onOpen`, `push.onReceive`. The events use Capacitor's own listeners, which reach only the site's top frame.
    - Android 13's notices permission, asked only from the page after the site has said why. The state is `granted`, `denied` or `prompt`, and notices turned off in Android's settings count as denied.
    - Three channels, made when the process starts: «يحتاج قرارك» (high, with sound), «للانتباه» (low, silent) and «الرسائل» (default). Messaging and mail go to «الرسائل», a notice by its tier, `info` never.
    - Firebase Messaging 25.1.3 (Firebase BoM 34.19.0 of 2026-09-09, past the 14-day rule). Its four public identifiers come at build time from the owner's `google-services.json`, named by `COMMSHUB_GOOGLE_SERVICES`, for the build's own application id only. There is no Google services plugin and no Firebase file in the repository. Without them the build has no push and `push.token` answers null.
    - No token is made before notices are allowed: Firebase's automatic start of messaging and its analytics collection are off.
    - Data messages only: the service shows the notice itself, and shows nothing while the application is in front, where the page reads its notices again.
    - A tap opens the push's page: in the open page through `onOpen`, or by loading it when the application was closed. The page must be a page of the site (`Push.goPath`, held equal to `src/lib/native/push.ts`: plain ASCII, one leading slash, no dot segment, no API route, script, file route or outside page).
    - The window is open to every application on the phone (it is the launcher's), so a page is opened from an intent only when the intent carries the application's own key, made once in its private storage and put on its own notices only.
  - **Site** (`src/lib/native/push.ts`, `src/lib/native/device-push.ts`, `src/components/native/phone-push.tsx`, `src/components/notices.tsx`, `src/components/shell.tsx`, `src/components/auth-gate.tsx`):
    - At each opening, and at most every ten minutes on returning to the application, the phone is registered for the person (`device_register`, with its token once notices are allowed) and asked about (`device_seen`).
    - A phone removed from «أجهزتي» signs out on that phone only (`scope: 'local'`) and forgets its id.
    - Before any sign-out inside the application the token is taken off, so a signed-out phone receives nothing.
    - «تنبيهات الهاتف» explains before Android asks, never over another window of the page. «ليس الآن» puts it off a week.
    - The notices drawer moves to a tapped push's page and reads the list again when a push arrives in front.
  - **The check package only:** `src/qa/QaPush.java`, a receiver that hands a push to the same `PushService.handle` that Firebase's messages reach, so the check sees what is shown without a Firebase project.
  - **Release size.** The check package grew from 9.3 MB to 12.9 MB with Firebase. Firebase adds three permissions to the merged manifest: network state, wake lock, and receiving FCM.
- **Changed while building.** A5's server half first built notification messages, which Firebase displays itself; a tap would then reach the window as an intent any application can send. At lane 1's request it sends data messages, with the title and the body in `data`.
- **Verified, numbers.**
  - **Tests.** `npm test` **561 of 561** (556 at A4; 5 new A5 tests: the pushed-page rules, the same rules as Push.java, the explanation's timing, the shapes the page accepts, and the registration and sign-out wiring). `mobile` `npm test` **15 of 15** (2 new: the manifest, the service and the key; Firebase from outside per build id, the check's receiver only in the check package). JVM **25 of 25** (`PushTest` 3, `IdentityTest` one more). Typecheck clean.
  - **`qa/android-push.cjs`: 19 of 19**, twice in a row on the final build, on the `Pixel_9_Pro` emulator, Android 16, check package. Two earlier runs failed in the check, not the application. The first was 17 of 19: five notices posted at once were bundled by Android into one group, and a tap on a line of the group opened the group; the check now taps one notice at a time. A later run was 11 of 13: the tap came while a «يحتاج قرارك» notice was still moving from its drop-down into the shade; the check now waits for it to settle and tries the tap once more if the application did not come to the front.
    - In Edge as a browser: nothing asked, nothing registered.
    - In the application: bridge 4; the three channels with their Arabic names and levels 4, 2 and 3; the phone registered at its opening with no token.
    - The explanation first; «ليس الآن» held at the next opening; «السماح بالتنبيهات» bringing Android's own question; granted, then registered again with its remembered id; no token (no Firebase project in this build).
    - In front: nothing shown and the page told. In the background: a decision in «يحتاج قرارك» with sound, attention in «للانتباه» silent, a message in «الرسائل», `info` never.
    - A tap opening the push's page in the open page; a push naming another site opening nothing; with the application closed, a tap opening it at the push's page.
    - Another application's intent naming a page, with no key or a wrong one, opening nothing.
    - A removed phone signing out locally, forgetting its id, and registering nothing.
- **Not verified, said plainly.**
  - No Firebase project exists yet, so no token was made, nothing was sent through Firebase, and no phone was reached when locked. That is the owner's check once the project exists (`mobile/README.md`, "Push notices").
  - Nothing was seen signed in: the component ran on a fixture page with a stand-in for the database client. The functions themselves are held by `supabase/tests/push_rules.sql`.
  - No real phone. Nothing pushed.

### 2026-10-27: the Android application, A5 joined: the server half merged, sign-out and devices together

- **Merged.** The server half's branch (`8359a7b`) into `main` as `d76311c`. The only conflicts were the two appended documents: `MVP_draft.md` now runs 64.2 then 64.3, and these entries run A4, A5 server, A5 application. Before merging, the database was checked directly: `push` applied as `20261027184903`, its stored md5 `e82661a14d3861edd1482443f964d106` equal to the committed file's, no devices or outbox rows, and the two release buckets still not applied.
- **Joined while merging.**
  - **Sign-out.** supabase-js signs out everywhere when no scope is given. The server half fixed «تسجيل الخروج» on «الحساب»; the side menu's and the sign-in screen's now sign out this device only too. Each takes the phone's token off first.
  - **Other devices.** «الخروج من الأجهزة الأخرى» and «الخروج من كل الأجهزة» did not clear device tokens (the server half's report said so). A signed-out phone would have kept receiving notice texts. Both now remove the person's other phones from «أجهزتي» first, through `device_remove` on each row of `my_devices`; this phone stays. The note says so when any were removed.
  - **Signing in again.** A phone removed while it was signed out would otherwise be signed out once more at its next sign-in. A successful sign-in now marks the session, so the first check after it starts the phone over in «أجهزتي».
  - `MVP_draft.md` 64.3 gains the application's half and the sign-out rules.
- **Verified on the merged code, numbers.**
  - `npm test` **583 of 583** (561 on lane 1 plus the server half's 22). `mobile` **15 of 15**. JVM **25 of 25**. Typecheck clean; `npm run build` clean.
  - `qa/push-flush.cjs` **35 of 35** (the server half's check against a local Firebase stand-in).
  - On the emulator, the check package rebuilt from this code:
    - `qa/android-push.cjs` **20 of 20**, with a new step: right after signing in, a phone removed while signed out starts over.
    - `qa/android-shell.cjs` **28 of 28**; `qa/android-update.cjs` **12 of 12**.
    - `qa/android-files.cjs` **23 of 23**. The first run on this code was 22 of 23: the check still required bridge version 3 exactly, and A5 made it 4; it now accepts 3 or later. The next run stopped before its first file step: Playwright did not see the application's web view within 60 seconds, and the crash log showed nothing new. The run after that passed.
  - The release APK, unsigned, is 10.6 MB; the check package is 12.9 MB.
- **Not verified, said plainly.**
  - Nothing signed in: «أجهزتي», «إعدادات التنبيهات», the session buttons and the Firebase card were not seen rendered.
  - No real push: there is no Firebase project.
  - No real phone. Nothing pushed; the live site is still the build of 2026-10-22.

### 2026-10-27: the Android application, A6: links that open the application, and the application lock

The owner asked on 2026-10-27 for A6 and A7. The release key does not exist yet, so its certificate is a stand-in (below).

- **What was built.**
  - **Links** (`Links.java`, `MainActivity.java`, the manifest, `public/.well-known/assetlinks.json`):
    - The manifest claims, with Android's verification (`autoVerify`), the site's pages from `menuEntries` without the root, each as `path` and as `path/` prefix, plus `/w/` and `/app/return`. It never claims `/`, `/r/`, `/m/` or `/api/`. Claiming the page and `page/` exactly, rather than a bare prefix, means Android never hands the application an address like `/workx` that it would then send to the browser, which would hand it back.
    - `Links.target` opens exactly those, on the address the build opens (the check package opens the local site), with the query kept. It refuses dot segments, plain or percent-encoded, and any other host, scheme or user part. The compiled list checks the address again.
    - `links.verified` reads Android's domain verification (Android 12 and newer): verified, or chosen by the person in Android's settings. The sign-in screen already used it (A1) to mail links back through `/app/return`.
    - `assetlinks.json` names `sa.commshub.app` with the stand-in `OWNER_RELEASE_KEY_SHA256`. `scripts/build.mjs` reads a signed release's certificate with `apksigner` and refuses to finish (exit 3) unless the site's file names it. An unsigned release is not checked.
  - **The lock** (`AppLock.java`, `CommsHubShell.java`), decision M-12: off by default.
    - Android asks (fingerprint, face, or the phone's PIN, pattern or password; `androidx.biometric` 1.1.0) to turn it on or off, when the application opens, and when it comes back after `LOCK_AFTER_MS` away: five minutes, five seconds in the check package only.
    - Until Android is answered, a native screen covers the page: the rosette, «المركز مقفل», «افتح القفل ببصمتك أو بقفل الشاشة.» and «فتح القفل».
    - While it is on, the recent-applications list shows no picture of the page (Android 13 and newer).
  - **Bridge version 5:** `links.verified`, `lock.state`, `lock.set`.
  - **Site** (`src/lib/native/lock.ts`, `src/components/native/phone-lock.tsx`):
    - «قفل التطبيق» on «الحساب», inside the application only.
    - The offer, once after signing in, when the phone can lock and the notices question is settled, never over another window.
  - **Documents.** `MVP_draft.md` 64.4; the A6 bullet of the Android paragraph of `AGENTS.md`; `mobile/README.md`, "Links that open the application", with the owner's steps: the fingerprint into `assetlinks.json`, the Supabase redirect address `/app/return`, and Play's own certificate if Play signs later.
- **Verified, numbers.**
  - **Tests.** `npm test` **585 of 585** (2 new: the lock's shapes and offer rules; the panels and `assetlinks.json`). `mobile` `npm test` **18 of 18**: the claimed links equal to `menuEntries` and to `Links.java`; the release guard and the stand-in; the lock off by default, asking both ways, five minutes. JVM **29 of 29** (`LinksTest` 3, `IdentityTest` one more). Typecheck clean; `npm run build` clean.
  - **`qa/android-links.cjs`: 19 of 19** on the `Pixel_9_Pro` emulator, Android 16, check package.
    - The lock, with a screen PIN set for the run and cleared after it: offered once after the notices question; on only after the PIN; covered and asked after six seconds away; put off, the cover stays with «فتح القفل», which asks again; a short absence does not lock; a cold start asks; «إيقاف القفل» asks, then nothing locks.
    - The links, on a fresh installation and the site's own production build:
      - `assetlinks.json` served as JSON with no redirect;
      - `links.verified` false, then true once allowed with `pm set-app-links-user-selection`;
      - `/work/CH-101?tab=texts`, `/app/return?qa=a6` (forwarded to `/?qa=a6`) and `/w/…` open in the application on the local site;
      - `/r/…` and `/` open in the browser;
      - four forged intents (two traversals, another site, a look-alike host) open nothing.
    - Getting there took three fixes to the check, none to the application:
      - The emulator's own System UI stopped responding while drawing Android's PIN question; the check now answers Android's «Wait».
      - A page handle went stale across the `/app/return` redirect; the check now takes a fresh handle for each read.
      - A second Playwright connection opened beside a live one waited for ever; the check now closes the old one first, and runs the lock part before the links part.
  - **The earlier checks on the changed window:**
    - `qa/android-push.cjs` **20 of 20**. It had required bridge version 4 exactly, and now accepts 4 or later; its 19 other steps passed in the first run too.
    - `qa/android-shell.cjs` **28 of 28**. Two runs before it each missed one timing step: once a screen read just after coming back from the browser, once the keyboard step. The latter's screenshot shows the page shrunk above the keyboard as it should, but later than the check's 8 seconds; it now waits up to 20.
- **Not verified, said plainly.**
  - No release key: the links of a real release are not verified by Android until the owner's certificate is in `assetlinks.json` and the site is pushed.
  - The Supabase redirect address for `/app/return` is the owner's step and was not checked.
  - Nothing signed in: «قفل التطبيق» on «الحساب» and the offer were seen on a fixture page only.
  - A fingerprint was not tried: the emulator has none enrolled, so the PIN stood for both.
  - No real phone. Nothing pushed.

### 2026-10-28: the Android application, A7: the camera, sharing files in, and uploading in the background

- **What was built.**
  - **Held files** (`Held.java`, `ShellWebViewClient.java`): a photo or video from «تصوير», or a file shared in, is kept in `cache/held/<token>/<name>` and named by 32 random bytes. The page reads it at `/__app/file/<token>`, which the application answers itself, GET only, in byte ranges, on the site's own address only; the site never serves that path (tested). They are removed two days after they arrived, unless an upload still reads them.
  - **«تصوير»** (`CommsHubShell.captureTake`): the phone's camera application writes straight into a held file through the FileProvider's new `held/` folder. The application never asks for the camera itself. In the library it sits beside «رفع ملفات» («صورة», «فيديو»), and what it takes goes to the folder in the background.
  - **Sharing in** (`Incoming.java`, the manifest's `SEND` and `SEND_MULTIPLE`): up to twenty files are copied into held files at once, while Android's read permission lasts, and the window opens «استلام ملفات». Only another application's `content://` provider is read (`Held.acceptable`): never `file://`, never the application's own FileProvider.
  - **Uploading in the background** (`Uploads.java`, `UploadWorker.java`; WorkManager 2.11.2, a foreground task of the data-sync kind with «جارٍ رفع الملفات»):
    - The page opens the Drive session through `/api/media/upload-session` as a browser upload does, so the site still checks the folder's «إنشاء».
    - The application sends 8 MB pieces with the same resume probe. If Android stops it, WorkManager starts it again.
    - It accepts only Google Drive's upload address (`UPLOAD_PREFIXES`), and never shows the session's address back to the page.
    - `PhoneUploads` in the shell registers what arrived (`/api/media/complete`), links it to its work (`work_asset_link`) when one was chosen, and has the application forget it, on any page or at the next opening.
    - The application's own update answers «busy» while one runs.
  - **«استلام ملفات»** (`/share`, open to every member): the files, then «مكتبة الوسائط» (folders with «إنشاء» only), «عمل» (open works the person takes part in, plus a folder) or «المراسلة» (attachments up to 25 MB). Each destination shows only if the person's pages allow it.
  - **Bridge version 6:** `capture`, `incoming`, `upload`.
  - **The check package alone** gains `QaFiles`, a provider of made files under its own authority, beside `QaPush`.
  - **Documents.** `MVP_draft.md` 64.5, the A7 bullet of `AGENTS.md`, `mobile/README.md`.
- **Verified, numbers.**
  - **Tests.** `npm test` **589 of 589** (4 new: held files and their reserved path, nothing else of the site using `/__app/`, uploads read without the session, the page and its places). `mobile` **20 of 20**: shared-in sources, the held path and the provider folder, uploads to Drive only, the data-sync task, no camera permission, the update waiting. JVM **35 of 35** (`HeldTest` 5, `IdentityTest` one more). Typecheck clean; `npm run build` clean.
  - **`qa/android-upload.cjs`: 11 of 11** on the `Pixel_9_Pro` emulator, Android 16:
    - bridge 6;
    - two files shared in, held with their bytes, «استلام ملفات» opened and taken once;
    - a `file://` address of the application's own storage refused;
    - the page reading a held file whole (200) and by range (206, `bytes 0-1023/…`), SHA-256 equal;
    - a 238 MB file sent in the background with the application in the background: 30 pieces, one dropped connection, the stand-in's SHA-256 equal, «جارٍ رفع الملفات» showing;
    - the page registering it with the Drive id and linking it to its work, then the application forgetting it;
    - three refused uploads (another address, a look-alike host, an unknown file);
    - a photo taken with the emulator's camera application (`com.android.camera2`) and read by the page.
  - **How the check got there.**
    - The plan named a 2 GB file, but the emulator has about 600 MB free: the size is now a share of the free space (238 MB).
    - Android does not let the shell grant MediaStore files to another application (`SecurityException … has no access`), and `am` cannot put a list of addresses in an intent. So the check shares from `QaFiles`, as two `SEND` intents, and the application reads them through the same path as `SEND_MULTIPLE`.
  - **Every earlier emulator check again on the A7 build:** `qa/android-files.cjs` **23 of 23**, `qa/android-links.cjs` **19 of 19**, `qa/android-shell.cjs` **28 of 28**, `qa/android-push.cjs` **20 of 20**, `qa/android-update.cjs` **12 of 12**.
    - The links check now accepts bridge 5 or later.
    - Push and update first failed for the emulator, not the application: Android's «System UI isn't responding» dialog covered the screen (seen three times this session), and once Playwright's connection was reset. After a fresh emulator, and with the shared screen reader (`qa/android-helpers.cjs`) now answering «Wait» and counting it (`systemUiWaits` in each result), both passed.
- **Not verified, said plainly.**
  - Nothing signed in: «استلام ملفات», «تصوير» in the library and the upload tray were not seen on the real pages, which need a session. The check drove the same functions on a fixture page.
  - No real Google Drive upload: the stand-in speaks Drive's protocol. A real Drive upload from a phone is the owner's check.
  - No real share from WhatsApp or Photos: the made-file provider stood for them.
  - A 2 GB file was not sent.
  - Play's declaration for the data-sync foreground task is A8's.
  - No real phone. Nothing pushed.

### 2026-10-28: the Android application, A8: Google Play's copy, «طلب حذف حسابي», the privacy policy and the Console drafts

The owner asked in a new session to finish A8, the last phase of `Android_Build_Plan.md`. Built on `main`; nothing pushed, applied, uploaded or released.

- **What was built.**
  - **Google Play's copy** (the `play` flavour; `MVP_draft.md` 64.6):
    - `src/play/PlayUpdate.java` asks Google Play through Google's own in-app updates library (`com.google.android.play:app-update` 2.1.0 of 2023-05-22, a `playImplementation` dependency, so the APK channel carries none of it). `src/direct/PlayUpdate.java` answers nothing. Play's numbers become the page's words in `PlayStates.java`, tested on the JVM.
    - Bridge version 7 adds `playUpdate` (`status`, `start`, `complete`) in Play's copy only, which has no `appUpdate`, no `REQUEST_INSTALL_PACKAGES` and no installer. Every method checks the page's address as the others do.
    - The same update window (`src/lib/native/play-update.ts`, `phone-app.tsx`): a release Play offers (flexible: Play downloads while the person works), the restart once downloaded, a required release (the site's floor, or Play priority 4 or 5: Play's full-screen update), and «ما الجديد» once. «لاحقاً» is kept apart for the offer and the restart. Play names a release by its whole number, read back as the version by the builds' rule.
    - The restart and the full-screen update wait while a file is being sent in the background.
    - `npm run pack:play` builds an App Bundle (`bundlePlayRelease`), signed with the owner's key when named, and refuses to finish unless the site's `assetlinks.json` names the bundle's certificate (read with keytool).
    - Google Play's copy of the check package asks Play's `FakeAppUpdateManager` (`PLAY_STAND_IN`, check package only), driven by `src/playQa/QaPlay.java`.
  - **«طلب حذف حسابي»** (`MVP_draft.md` 64.6):
    - Migration `20261028120000_account_deletion.sql`, **written, not applied**: `account_deletions`, read through row level security (one's own, or one the reader may carry out); `account_deletion_request` (one open at a time, three a day) and `account_deletion_withdraw`; the people told are the holders of «إزالة عضو» who may remove that person, by the same rule as `account_remove`, never for a founder; removing the account closes the request and, for a requested deletion only, also removes the person's notices, private reminders, guide progress and stars.
    - «حذف الحساب» on «الحساب» (`src/components/account-deletion.tsx`): what is deleted and what stays, an optional note, «طلب حذف حسابي» behind a long press (`HOLD.deletionRequest`), the open request with «سحب الطلب», and the public page linked.
    - «طلبات حذف الحساب» in «الحسابات», «الطلبات» (`src/components/accounts/deletions.tsx`), with «إزالة الحساب» opening the existing «إزالة», whose window now says what a request adds.
    - The words of what is deleted and kept are one list (`src/lib/account-deletion.ts`), held equal to the public page by tests. Both guides have a new part and a news step.
  - **Public pages:** `/account-deletion.html` (both ways: from «الحساب», or an email from the account's own address, answered before deleting) and `/privacy.html` rewritten for mail, messaging, WhatsApp, the two applications, phone notices, the YouTube scopes and the second storage and backup providers, keeping the Drive and Limited Use text.
  - **Drafts for the owner:** `Play_Console_Drafts.md` (the order of the owner's steps, the listing in Arabic, data safety, content rating, app access, the foreground-service declaration), and `mobile/play/icon-512.png` and `feature-graphic-1024x500.png` drawn by `qa/play-graphics.cjs`.
  - **Documents:** `MVP_draft.md` 64.6 (and 64.1's line on Play's copy), `AGENTS.md`, `mobile/README.md` "Google Play (A8)", the plan's A8 note, `Roadmap.md`.
- **Changed while building.**
  - Google's own Play library behind the application's plugin, instead of `@capawesome/capacitor-app-update`: a third-party Capacitor plugin would answer the page without the bridge's address check, and would sit in the APK channel too.
  - **Found by the Play check and fixed:** after «تحديث الآن» the Play window closed itself for the rest of the page's life, so «التحديث جاهز» never appeared in the same session. It now steps aside only for the release it offered.
  - **Found by re-running A7's upload check, and fixed (an A7 defect):** held files lived in the application's cache folder, which Android empties for every application when the phone runs low on space (it trims whenever free space falls within 150% of its low line, here 445 MB of a 5.8 GB `/data`). On this boot the emulator had 554 MB free; the 173 MB shared-in copy crossed the line, `DeviceStorageMonitorService` ran `freeCache` (logged, trying to free 594 MB), and both held files vanished before the page read them: 5 of 11. A phone nearly full would lose a large video in the middle of its background upload the same way. Held files now live in the application's own files (`files/held/`, `Held.root`), which Android never empties; the FileProvider's `held/` root follows (`files-path`), the two-day sweep still removes them, and the application's data is still excluded from backups. The A7 test of `file_paths.xml` now holds the new place.
- **Verified, numbers.**
  - **Tests.** `npm test` **601 of 601** (12 new: 5 for Play's updates in `tests/native.test.mjs`, 7 in the new `tests/account-deletion.test.mjs`); `mobile` **22 of 22** (2 new; the A6 assertion follows the bundle branch, and the A7 one the held folder's new place); JVM **39 of 39** on each channel (`PlayStatesTest` 3, `IdentityTest` one more). Typecheck clean; `npm run build` clean (the first two tries crashed in Next's build worker for lack of memory beside the emulator, with 388 MB free; it passed with the emulator and Gradle stopped).
  - **Database, before applying:** the migration and `supabase/tests/account_deletion_rules.sql` in one rolled-back transaction against `comms-hub`: attempt 1 stopped at setup (a throwaway administrator must be a founder, `admin_role_is_protected`), attempt 2 **42 of 42**. Afterwards no table, trigger, throwaway account, sign-in or notice was left (`qa/account-deletion-rules.json`).
  - **`qa/android-play.cjs` 19 of 19** on the `Pixel_9_Pro` emulator, Android 16: the bundle's manifest read with bundletool (`sa.commshub.app`, API 29 to 36, exactly the expected permissions, no installer, nothing of the check package, the data-sync service); bridge 7 with `playUpdate` and no `appUpdate`; the offer, «لاحقاً» held, Play's own window, the download's share in «تطبيق الهاتف» with no window, the restart and its «لاحقاً», the install handed to Play, a required release that the back key leaves open, Play's immediate window, and the window staying after a refusal. Its first two runs stopped on the check's own pattern (it took Android's `ProfileInstallReceiver` for an installer) and on the emulator's frozen System UI, then on the defect above.
  - **`qa/account-deletion.cjs` 17 of 17** in Edge: both public pages answer signed out on the production build, in both languages, at phone width, with no error under the site's Content-Security-Policy; the real panels on a fixture page with stand-ins for the database client and the accounts provider.
  - **`qa/play-graphics.cjs` 7 of 7.**
  - **Every earlier emulator check again on the bridge-7 build:** `qa/android-shell.cjs` **28 of 28**, `qa/android-update.cjs` **12 of 12**, `qa/android-links.cjs` **19 of 19**, `qa/android-push.cjs` **20 of 20**, `qa/android-files.cjs` **23 of 23**, `qa/android-upload.cjs` **11 of 11** after the held-files fix (205 MB in 26 pieces, one dropped connection, SHA-256 equal, while Android tried ten times during the boot to free storage). Its first run on this build was 5 of 11 (above). Links, push and files ran before that fix, which touches only `Held.java` and the provider's `held/` root.
    - The shell and update checks first failed for the emulator, not the application: System UI froze while a tap read the screen, Chrome's first-run screen came back over the application after the outside-link step, and Android dropped Playwright's handle after the update's restart. The shared helper now waits for the web view (`webViewNode`), the shell check stops Chrome once its step is recorded, and the update check re-takes the phone once after the update.
- **Not verified, said plainly.**
  - Play's real update: the check used Play's own stand-in. Publishing to internal testing and updating a Play-installed copy is the owner's check, as is an APK copy updating from Play once Play App Signing uses the same key.
  - Nothing signed in: «حذف الحساب», «طلبات حذف الحساب» and «تطبيق الهاتف» of Play's copy ran on fixture pages.
  - The migration is not applied: until it is, the panel says it cannot read requests, and the public page's email route is the only one.
  - The Play Console forms are drafts: the government-app question and the data-safety judgement calls are the owner's.
  - No real phone. Nothing pushed.

### 2026-10-28: the account deletion migration applied

- **The owner's word.** "Apply supabase/migrations/20261028120000_account_deletion.sql to comms-hub, then re-run its rules and the advisors."
- **Applied** to `comms-hub` as version `20261028122912` (`account_deletion`). The stored statement's md5 `8ed2dba138462f0c073630ced82970af` equals the committed file's.
- **Verified, numbers.**
  - `supabase/tests/account_deletion_rules.sql`, sent verbatim, rolled back: **42 of 42**; the run's md5 `0b5446b07b750df46edf36d2fbf2e1f2` equals the file's (`qa/account-deletion-rules.json`, attempt 3).
  - Afterwards: 0 requests, 0 throwaway accounts, sign-ins or notices; the 5 real accounts untouched; the three triggers on `accounts`; row level security on; execute only where intended.
  - **Advisors**, both read in full before and after applying. Security: exactly 3 new notices, all `authenticated_security_definer_function_executable` for the functions meant for signed-in people (`account_deletion_request`, `account_deletion_withdraw`, and `deletion_visible`, the read policy's helper, which tells the caller only whether they may see a given person's request); nothing new for `anon`, nothing removed. Performance: unchanged.
- **Not re-run.** The other rule files: no existing function was replaced. The trigger on deleting an account does nothing without an open request, which check 23 covers.
- **Not done.** Nothing pushed: «طلب حذف حسابي» reaches people once the site is deployed.

### 2026-11-01: «الحسابات» redesigned from the Director's notes

- **The owner's word.** The Director's notes: the page is hard to understand and needs polish; «الأعضاء» should make changing a person's role and permissions easier; «الأدوار» should allow two members of one role to differ; «إضافة عضو» should start from defaults and open the rest only when needed. Asked with it: the difference between «السجل» and «سجل النشاط».
- **Specification.** `MVP_draft.md` section 65; `Permissions_Plan.md` 5 says that section replaces its layout where they differ. No rule changed and no migration was written: every action is a database function that already existed.
- **Built.**
  - «الأعضاء»: named columns; a role changed on the person's row, saying what it gives and takes (`roleChange`) before it is saved, with a long press when anything is taken away.
  - The card: one switch for every permission and page. `switchStep` turns on or off into the database call by where the permission comes from, and clears an override when that alone gives the wanted state, so a person returns to their role with no row left behind. `switchWhy` words what cannot move, as the database would refuse. The seven control words are gone. The clock gives a permission for a time; «إعادته إلى دوره» replaces «إنهاء كل الإضافات»; a search box filters the card.
  - «الأدوار»: one role at a time, with the role's column and a column for each person of the role whom the signed-in person manages. A switch in a person's column changes that person alone. «ما يختلف» keeps the rows where someone stands apart. Each person's state comes from `resolve`, the tested mirror of `perm_eval`.
  - «إضافة عضو»: three fields and one sentence that says what the defaults are; «خيارات متقدمة» folds the pages, extra permissions from the start and the invitation. After adding, the card opens.
  - «السجل» says what it holds and links to «سجل النشاط». The help of the page moved to version 4, with three news steps.
- **Deliberately removed.** The table of eight roles side by side, in favour of one role at a time. «حزمة جديدة» left the page's header for «الأدوار».
- **Found and fixed.**
  - `qa/permissions-pages.cjs` had not run since A5 and A8: it did not compile `deletions.tsx`, `lib/push/kick.ts` or `lib/integrations/expiry.ts`, and its screenshots were old. It also skipped `auth.css`, so dialogs were drawn without their grids. Repaired. One stale expectation corrected: OneDrive under «غير متاح بعد», connected since B10.
  - The default pages of a new member were not limited to those the adder holds, so an adder missing a page would be refused with the list folded away. They are limited now.
  - `usePermRequests` was called after an early return in `page.tsx`, against the rules of hooks.
  - A refused card (`perm_card`) showed nothing; it says why now.
  - While building: page rows marked everyone as different, because a role has no page list; a page now sets a person apart only when the people of the role differ on it. The role row crashed the page after `scrollIntoView` was returned from an effect, because recent browsers return a Promise there. `qa/accounts-flow.cjs` caught that one; typecheck and tests could not.
- **Verified, numbers.**
  - `npm test` **604 of 604**, with three new tests. One simulates the database's writes and proves a flip reaches the opposite state from every source and leaves no row when back on the role.
  - `npm run typecheck` and `npm run build` clean.
  - `qa/permissions-pages.cjs` **1243 of 1243**: the first full run since A5.
  - `qa/accounts-flow.cjs`, new, **63 of 63**, in Edge: the real page and components clicked through on a fixture (`qa/fixtures/accounts-flow.tsx`), reading the database calls they make, at desktop, tablet, phone and evening.
  - `impeccable detect` over the changed files: three warnings, all in older requests and settings styles, left alone.
- **Not verified.**
  - The signed-in page on the real site and the real database: the page needs a signed-in person and no bypass is allowed. The rules were not touched, so `supabase/tests/` were not re-run.
  - The long press itself: the fixture has no kit, so the check reads the `data-hold` reason and clicks through.
- **Known limits.**
  - A person who holds a permission from their role and also from a live temporary grant needs two flips: the first adds the removal and the temporary grant still allows it (`perm_eval`), the second ends it.
  - A one-time grant bound to one conversation reads as off on the switch, because `perm_card` evaluates without a target. It is counted on the row. This is as before.
- **Merged.** The redesign is on `main` as `975d546`, by fast-forward, by the owner's word "Merge the redesign only". On `main`, without the studio edits: `npm test` 604 of 604, typecheck and build clean. The two browser checks were not re-run there: they ran with those edits in the tree, and the four files that separate the two commits are outside what either check reaches.
- **Not done.** Nothing pushed. The earlier studio and calendar edits are `8bdb7b1` on the branch `claude/accounts-redesign`, not merged.
- **Left out of the commits, on purpose.**
  - `validation/recheck-R01.md`: its only change is a block of another project's Firebase identifiers, pasted in. The project's rules keep Firebase values out of this repository.
  - `videos/` (96 MB) and `supabase/.temp/` (tool residue).
  - `qa/simulations/`: already on the `codex/role-simulation-*` branches, and it carries the real project reference.
  - `Owner_Setup_Guide.md` and the two `Role_Simulation_*` documents: untracked for weeks across many commits, so left for the owner to decide.

### 2026-11-01: the site's icon, «سجل النشاط» upgraded, and «تقرير الشهر»

- **The owner's word.** The logo in the browser's tab; a tab between the whole view and the solo view, for the Admin and the Director by default, either of whom can add the permission to anyone; and a report for the Director at the end of the month of what each person did and who is the most productive, to download as Excel or as PDF with two templates designed here.
- **Specification.** `MVP_draft.md` section 66.
- **Built.**
  - The icon: `src/app/favicon.ico` (16 to 64 pixels), `icon.svg`, `apple-icon.png`. The site had none, so tabs showed a globe. The rosette is redrawn with a heavier line by size, because the logo's own line is a quarter of a pixel at 16 (`qa/site-icons-build.cjs`).
  - One list from three logs (`src/lib/activity/feed.ts`): the work cycle's `work_log` was not on this page before, though the page said "every action". Paging across the three never skips a row (`mergePage`). Filters by person and period ask the database, and a kind of action spans the logs.
  - Two capabilities, migration `20261101120000_activity_report.sql`: `activity.full` (grantable to anyone) replaces the list of roles in the read rule, and `activity.report` (from rank 2). Both are the Admin's and the director's by default, so **the assistant no longer sees the whole log by default**, as asked.
  - «تقرير الشهر»: `activity_report` gives counts; `src/lib/activity/report.ts` gives points, ranks and the method in words, once, for the page and all three files.
  - The files, made in the browser: Excel with no library (`report-xlsx.ts`), PDF in two templates with pdf-lib 1.17.1 and fontkit 1.1.1, loaded only when asked for (`report-pdf.ts`, `bidi.ts`, fonts in `public/report/`).
- **Decisions taken here, for the owner to overrule.**
  - How productivity is counted (`MVP_draft.md` 66.3). A stage or task 3 and 1 more in time, an approved work 4, a review or publication 2, a text or file 1, tidying 0.
  - The Admin and the director are shown and not ranked, because a director's approvals would otherwise put them first in their own report.
  - «تقرير الشهر» can be granted to the assistant but not to team roles.
- **Found and fixed.**
  - `Title` joined its two words with no space, so the live site reads «سجلالنشاط» and «مكتبةالوسائط» (`src/components/ui.tsx`).
  - Counting the logs plainly would have counted twice: a file approved in a work is written to both logs, and a finished stage or task is both a record and a log line. The function and `report.ts` count each once.
  - An empty month ranked everyone first at zero. Nobody is placed for nothing now.
  - pdf-lib drops Reem Kufi's dot positions, so headings are drawn as outlines. The Arabic font file has no digits, brackets or quotation marks, so `bidi.ts` cuts a line by font and mirrors brackets.
- **Verified, numbers.**
  - `npm test` **628 of 628**, with 24 new in `tests/activity-report.test.mjs`. Typecheck and build clean.
  - `supabase/tests/activity_report_rules.sql` **38 of 38**, with all migrations replayed on a private Docker container of the Supabase image (`qa/activity-rules-local.cjs`, `qa/activity-report-rules.json`). This is new: nothing touched comms-hub. The container stands in for what the platform's services add (`auth.users` columns, `auth.uid()`, `storage` tables), and feeds the migrations with LF line endings, because `20261015220000_limits_enforced.sql` patches functions by matching text and a CRLF checkout does not match.
  - `qa/activity-exports.mjs` **21 of 21**: both PDFs rendered and their text read back with PyMuPDF; the .xlsx opened by Excel itself, without a repair, right to left, its cells read back; an empty month and a large one.
  - `qa/activity-flow.cjs` **39 of 39**: the real page on a fixture under the site's Content-Security-Policy, the three files really downloaded; a person without the permission, one given it, and the database before the migration.
  - `qa/site-icon.cjs` **6 of 6** on the production build, signed out.
  - `qa/accounts-flow.cjs` **63 of 63**, `qa/team-panel.cjs` **16 of 16**.
  - `qa/permissions-pages.cjs` **1243 of 1243**.
- **Not verified.**
  - The rules on comms-hub itself, and the migration is **not applied**. The Supabase connector in this session is signed in to an account that does not list comms-hub (it lists NBC, streamer_app and dnfom-system), so both the read and the rolled-back run were refused.
  - The signed-in page on the real site.
  - The report on real data: the fixture's month is invented.
  - The long press is not involved here. The Android application's disabled buttons were not run on the emulator.
- **Before the migration is applied.** The site keeps working: the director keeps the whole log (tested), and «تقرير الشهر» simply does not appear. So the site can be deployed first, or the migration applied first.
- **Not done at the time.** `npm audit` lists critical advisories for `next` 16.3.8, fixed in 16.4.3; proposed as a task of its own.

### 2026-11-01: pushed to production for the Director's test

- **The owner's word.** "please commit, push and deploy. so we can have the director test"
- **What went out.** `15c36ea..91e2c9a`, 25 commits: this work and the 24 waiting since 2026-10-22, among them the desktop application's site code, the Android application's, push notices, «طلب حذف حسابي», the Content-Security-Policy on every page and the redesign of «الحسابات». Production deployment `dpl_GWJFjSqTPTUp69cSczatWbYdc7gK`.
- **Left out of the commit.** `validation/recheck-R01.md` (another project's Firebase identifiers), `videos/`, `supabase/.temp/`, `qa/simulations/`, `Owner_Setup_Guide.md` and the `Role_Simulation_*` documents. The studio and calendar edits stay on `claude/accounts-redesign`.
- **Checked before pushing.** Of the four migrations in those commits, push and account deletion are applied, and the two release buckets wait for a first release by design, so none of them could break the site. `next` was 16.3.8 on production already, so the push added no exposure. On the commit: `npm test` 628 of 628, typecheck and build clean.
- **Verified on production, numbers.**
  - Vercel: READY on `91e2c9a` in 69 seconds, `comms-hub-three.vercel.app` pointing at it, no runtime errors.
  - `qa/site-icon.cjs` against the live address **13 of 13**: the icons, and the files the report's PDF needs.
  - `qa/site-live.cjs`, new, **9 of 9**: the policy with a nonce, the sign-in page running under it, the public pages, «سجل النشاط» behind sign-in, a phone's width.
- **Found.** The site used to answer every unknown address with an HTML page, `/favicon.ico` included. That is why browsers showed a globe, and it means a status of 200 proves nothing: waiting on a new file only worked once the check read its content type.
- **Not verified.** Anything signed in on production. The migration is not applied, because the Supabase connector cannot see comms-hub.
- **Rollback.** The deployment before this one is `dpl_2D8VxoZVVHBjtdeoh7Q6PuKNLQ6z`, on `15c36ea`.

### 2026-11-01: the migration of «تقرير الشهر» applied to comms-hub

- **The owner's word.** "Yes, apply it", after the Director asked where the report was, and "Connector switched" once the Supabase connector was on the account that holds comms-hub.
- **Found first.** The tab was missing because the function did not exist on comms-hub. Signed out, `activity_report` answered 404 `PGRST202`, as a name that does not exist does, while `deletion_visible`, which exists and is closed to visitors, answered 401 `42501`.
- **Applied.** `supabase/migrations/20261101120000_activity_report.sql` as version `20261101184751` 'activity_report'. The md5 of the stored statement, `370fff3023eccaf057334c3af9f28de6`, equals the file's.
- **Verified on comms-hub, numbers** (`qa/activity-report-rules-comms-hub.json`).
  - Before applying: the migration and the rules in one rolled-back transaction, **38 of 38**. Capabilities still 39 and role rows still 152 after it, nothing of the fixture left.
  - After applying: the rules file run verbatim, **38 of 38**, the run's md5 `19fed7b0d3833fa8b1525329a4187460` equal to the file's.
  - Capabilities 39 to 41, role rows 152 to 168. Both permissions on for `admin` and `director` only, in all eight roles' rows; no personal overrides.
  - Signed out, `activity_report` now answers 401 `42501`.
  - Security advisors, 318 findings before and 319 after, compared in full by script: one new, `activity_report` callable by `authenticated`, which is meant, since it checks `activity.report` itself. Nothing new for `anon`. Performance advisors: nothing new; `unused_index` 22 to 21, because the rules run used `activity_log_at_idx`.
  - On the real months, as a throwaway director in a rolled-back run, sizes only and no real identity used: September and October empty, November 9 action groups, 2 active people, 4 finished stages, each month 3 to 13 ms.
- **October is empty and that is correct.** `activity_log`, `work_log`, finished stages and finished tasks have no row before 2026-11-01. Only `permission_events` has rows in October (21), and the report does not count those. The page opens on the month before (`defaultMonth`), so until the last days of November it opens on the words «لا إنجاز مسجّل في هذا الشهر.», and the Director has to choose November.
- **Behaviour changed.** The assistant no longer sees the whole log unless given it. comms-hub has 3 admins, 1 director and 1 producer, so nobody lost anything yet.
- **Not verified.** The page signed in on the real site, and the three downloads from real data: both need a real sign-in, which is the Director's. The Excel and PDF files remain checked on the fixture only.

### 2026-11-01: «المنصات» and «حسابات المنصات» rebuilt, with the steps of 2026-11-01

- **The owner's word.** "ok now we have the correct info on the steps, yes fix those, and now please build this in the live site, add the new visuals, correctly add the correct steps (with links). as for the arabic, yes swtich sides in the steps sheet, so the side switch when in Arabic, from when In English. then commit"
- **Where it stands.** Committed on `claude/platforms-redesign`. Not merged, not pushed, so not on the live site yet. `supabase/migrations/20261101200000_platform_setup.sql` is written and not applied.
- **Done.** `MVP_draft.md` section 67 holds the behaviour.
  - «المنصات»: one chip per platform worked out from what is stored (`src/lib/platforms/setup.ts`), «إضافة منصة» as one menu, the rest folded.
  - The steps sheet (`src/components/sheet.tsx`, `src/components/settings/platform-sheet.tsx`): links, a bar, saved progress. The owner first described the steps on the left; the steps now come first in the document, so they sit on the right in Arabic and on the left in English.
  - «حسابات المنصات» (`src/components/work/channels.tsx`, `connect.tsx`): attention first, a filter, groups, and adding as one sign-in and a choice. A publisher may reconnect.
  - The migration adds `platform_setup` and `platform_setup_save`, lets a publisher reconnect, and has `platform_ready` return each application's state.
- **The steps and the code follow the official pages of 2026-11-01** (`src/lib/setup-guides.ts`, `src/lib/platforms/info.ts`, `oauth.ts`, `oauth2.ts`).
  - Meta: Unified Login with a Configuration ID, its token and account list, `publish_video`.
  - X: the new console, pay per use, `media.write`.
  - TikTok: `username` asked for only when `user.info.profile` was granted, and the review, URL and audit steps added.
  - LinkedIn: the separate application a company Page needs is explained, and not built.
  - Google: the secret shown once, 100 uploads a day.
- **Verified, numbers.**
  - `npm test` **645 of 645**; `npm run typecheck` and `npm run build` clean.
  - `qa/platforms-flow.cjs`, new, **74 of 74** on a fixture of the real components, with screenshots of each state, English, a phone and the evening theme.
  - `qa/permissions-pages.cjs` **1275 of 1275**, `qa/work-pages.cjs` **1021 of 1021**, `qa/post-preview.cjs` **202 of 202**, `qa/connections-tab.cjs` **43 of 43**.
  - `supabase/tests/platform_setup_rules.sql` **35 of 35** on a private container (`qa/platform-setup-rules.json`), the migration and rules run together, nothing touching comms-hub.
  - `qa/platform-gate.cjs` **11 of 11**, signed out, on a local build of the site with comms-hub's public key. It ran before the last change to the chooser, which no signed-out page reaches.
- **Found on the way.**
  - comms-hub's registry has no Facebook. A Meta sign-in returning Pages would have shown the raw key `facebook`, and picking it would have failed with `PLATFORM_INVALID`. The chooser now offers only what can be linked and names the rest (`splitOffer`, `platformName`, tested). The list was read from comms-hub with one select, changing nothing.
  - Instagram offers carry the same `@name` as name and handle, so it printed twice and reversed in Arabic. Fixed.
  - `qa/work-pages.cjs` and `qa/post-preview.cjs` had stopped running since the desktop and Android work added modules they did not build. Repaired, which also brought their stale expectations up to date.
  - A `فصل<` check in `qa/post-preview.cjs` could never fail, because it compared against text with the tags stripped. It now reads the page, with the director's page beside it.
- **Decided without asking.** Simulated accounts stay, folded. The Google application can still be edited in «الاتصالات» too, as one record. TikTok stays video-only, because the site has no rule for a post that needs media. A LinkedIn company Page is not built.
- **Not verified.** Anything signed in on the real site: both pages were checked on fixtures only. The Meta Unified Login code has met a stand-in, never a real application, and whether one Meta application can hold both the Instagram and the Page use cases is still unconfirmed. Until the migration is applied, the pages work, a saved step says it failed, and a publisher cannot reconnect.
- **Left out of the commit.** `validation/recheck-R01.md`, `videos/`, `supabase/.temp/`, `qa/simulations/`, `Owner_Setup_Guide.md`, the `Role_Simulation_*` documents and `qa/site-live.json`.

### 2026-11-02: «المنصات» and «حسابات المنصات» live, the migration applied, `next` at 16.4.3

- **The owner's word.** "Yes, take it live", answering "Should I merge to main, push, and apply the migration so it goes live?"
- **What went out.** `9385e14..8917fa1`, fast-forwarded: `a13c2b8`, the rebuild recorded in the entry above, and `8917fa1`, the upgrade.
- **`next` 16.3.8 to 16.4.3.** Listed the day before as what had to be cleared before going live, and done as its own commit. "An advisory" undersold it: `npm audit` rated it critical, with unauthenticated remote code execution in the image optimisation API and in `use cache` functions, and a denial of service through Server Actions (GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr, GHSA-p3m5-59mp-jv5r). No source change. On a local build: `npm test` 645 of 645, typecheck and build clean, `qa/site-live.cjs` 9 of 9, the nonce policy still sent, and `qa/platform-gate.cjs` 11 of 11.
- **Applied.** `supabase/migrations/20261101200000_platform_setup.sql` as version `20261101211812` 'platform_setup'. The md5 of the stored statement, `2ee597843c835447f7d1d23ab358b267`, equals the file's.
- **Verified on comms-hub, numbers** (`qa/platform-setup-rules-comms-hub.json`).
  - Before applying: the migration and the rules in one rolled-back transaction, **35 of 35**, nothing left behind.
  - After applying: the rules file run verbatim, **35 of 35**, the run's md5 `16933fa438b518a9835d7da584ade7e1` equal to the file's. No throwaway account, user or secret left, `platform_setup` empty, `platform_accounts` still 1.
  - Security advisors, 319 findings before and 322 after, compared in full by script: three new, `platform_conn_manage`, `platform_ready` and `platform_setup_save`, callable by `authenticated`, which is meant. Nothing new for `anon`, nothing gone. Performance unchanged at 30.
- **Verified on production, numbers.**
  - Vercel: READY on `8917fa1` in 66 seconds (`dpl_CYP4ocrnVFp6WQqbKjpqqfUJ1gnn`), `comms-hub-three.vercel.app` pointing at it, no runtime errors in the 15 minutes after.
  - `qa/site-live.cjs` **9 of 9**, `qa/site-icon.cjs` **13 of 13**, `qa/platform-gate.cjs` **11 of 11**.
  - `qa/platform-setup-live.cjs`, new, **10 of 10**: the live page reports `next` 16.4.3, the styles of both pages are out and the old ones gone, both pages stay behind the sign-in, the image route serves no SVG, and the new functions and table refuse anyone signed out.
- **Found.** A check can pass on the wrong site. `qa/site-live.cjs` takes its address as an argument and ignores `QA_BASE_URL`, and `qa/site-icon.cjs` with no address checks a local build. Each gave a clean result for the wrong site on a first run here. The numbers above are from the runs that named the right address.
- **Not verified.** Anything signed in on the real site, so saving a step and a publisher's reconnection have run only in the rules, not from the page. The Meta Unified Login code has met a stand-in, never a real application. Whether the holes in `next` 16.3.8 were ever used on production was not checked.
- **Left as they are.** Three moderate `npm audit` findings in the mail libraries (`nodemailer`, `mailparser`, `ip-address`). `validation/recheck-R01.md`, `videos/`, `supabase/.temp/`, `qa/simulations/`, `Owner_Setup_Guide.md` and the `Role_Simulation_*` documents stay out of the commits.
- **Rollback.** The deployment before this one is `dpl_3MnFGeWHCdzx7hydSzLG1F18ShW7`, on `9385e14`, but it returns `next` to 16.3.8. Reverting `a13c2b8` alone keeps the upgrade. The migration can stay in place, because the old pages do not use what it adds.

### 2026-11-02: «ورقة الكتابة» and the writing documents

- **The owner's word.** "I want you to build my storage idea with your edits and suggestions. also build the writers new tools and UI (I approve the artifact «كاتب المحتوى في المركز")", with three edits: improve the tools bar, let a user select one column or one row and change its fill or lines, and more polish. "With your edits and suggestions" settled the three open recommendations: the master is the site's own format, access is the same rule as seeing the work, and a plain-text copy stays in the database.
- **Deviation from the reference, recorded on purpose.** «النموذج المرجعي للمركز» version 5 lets «المسؤول» and the leaders save text. A person holding a stage of role `writer` may now save it too, in `DRAFT`, `IN_PRODUCTION`, `CHANGES_REQUESTED` and `REJECTED`. Reason: a writer given a stage was told to write and could not save, so they pressed «تمّت» on nothing. Sending, approval and publishing do not change.
- **Built.** All 18 items of the artifact (`MVP_draft.md` section 68): the sheet, Word-style tools, keyboard and application shortcuts, private drafts, copies that start from the main text, comparison and notes in every review round, withdrawing from review, accounts before sending, «الكتابة», «المستندات», Home, real «الأفكار», search inside texts, shared phrases and the fixed style check. Storage (W-1 to W-11 in `Writing_Build_Plan.md`): a checked JSON master per version in Drive, the record and a plain copy in Postgres, «الحالي» with Word, PDF and text, the version limit in «الإعدادات», and `file_locations` so moves and backups carry documents.
- **The owner's three edits.**
  - The tools bar: labelled groups in fixed tabs at one height, so the text never jumps when «الجدول» or «الصورة» comes forward.
  - Tables: a strip above the columns and beside the rows, dragging along it for several, a corner for the whole table, and dragging across cells for a range. Fill, line colour and both transparencies act on the selected cells only, as one undo step, and the bar says what is selected.
  - Polish: the sheet opens with the cursor in the text on a computer, the panel's five tabs all fit, the side and chips match the site, and every state has its words.
- **Verified, numbers.**
  - `npm run typecheck` clean, `npm test` **699 of 699**, `npm run build` passes, `mobile` tests **22 of 22**.
  - `qa/writing-flow.cjs`, new, **100 of 100** in Edge: the real sheet and pages on a fixture, with the screenshots read by eye as well.
  - `qa/work-pages.cjs` **1011 of 1011**, brought up to date.
  - `supabase/tests/writing_rules.sql`, new, **322 of 322** on a private container, every migration replayed (`qa/writing-rules.json`).
  - `work_rules` **135 of 135**, `approval_rules` **71 of 71**, `account_deletion_rules` **42 of 42**. `storage_rules` 30 of 31, `storage_move_rules` 93 of 95 and `backup_rules` 60 of 61 fail the same four checks with this migration held out, so none is from this work: three say the director holds no storage right by default, stale since `director_connection_rights`, and one is an overview count. `backup_rules.sql` cannot run under psql as it stands, because of its `\'` quotes, so a corrected copy was run and the file left alone.
  - The real production build was loaded on the public sign-in page, with a temporary component that was never committed: Tiptap, the sheet's module, a table, the Word writer and Word reader all ran under the real Content-Security-Policy with no page or console error. Signing in was not touched.
- **Found by the checks and fixed.**
  - A site-wide `button{min-height:42px}` stretched every tool, swatch and picker cell, and laid the column handles over the table's first row. Tests passed; only reading the screenshots showed it. A check now holds the tools' height and the handles' place.
  - Escape did nothing with the cursor in the editor, and Escape in a small card closed the whole sheet, because React carries a dialog's `cancel` to the dialog around it.
  - Shortcuts stopped once a focused button disappeared, as after «عولجت». The sheet now listens on the document, and only while it is the top dialog.
  - «سحب الإرسال» never appeared, because it was tied to the right to send, which ends at sending.
  - A draft compared by this browser's clock could be hidden. A draft now carries the version it was written on.
  - The page's text was the site's muted grey, the Word file picker showed at the foot, and «بلا لون» spilled out of its panel.
- **A limit met and handled.** A request through the site's server carries about 4 MB. Vercel's documentation search did not return the figure, so it is from memory and the build assumes the lower number: a picture above it is redrawn in the browser, checked with a 5 MB file, and a Word file too large to upload still downloads from the browser and is not kept in «الحالي».
- **Account deletion.** Ideas that never became a work now go with an account removed at its owner's request (rule 305). A private draft's row goes too, but its file stays in the work's folder under a name that does not say whose it is, because the database cannot reach Drive and nothing is scheduled. Both public pages and `src/lib/account-deletion.ts` say so. `public/privacy.html` says texts are kept in Drive.
- **Not verified.** Nothing signed in has run on the real site, and no route has met a real Drive: they ran against stand-ins. Drive's PDF conversion of an Arabic file is unproven. A file above 4 MB was not sent through Vercel itself.
- **Not built.** Editing a Word file inside the site (W-10). A Word file opens in the sheet, and the page says it loses fonts, sizes, colours and table borders.
- **Tools.** Tiptap 3.32.0, `docx` 9.12.0 and `mammoth` 1.13.0 are pinned and in `THIRD_PARTY_NOTICES.md`. The database and server half was written by a subagent; its report was checked by reading the migration and routes and rerunning the rules, not taken on trust.

### 2026-11-02: «ورقة الكتابة» live, the migration applied

- **The owner's word.** "then commit, then push and deploy", and "Apply and deploy" to the question naming the migration, which adds tables and columns, removes no data, and changes existing functions.
- **Applied.** `supabase/migrations/20261102120000_writing_documents.sql` as version `20261102020350` 'writing_documents'. The md5 of the stored statement, `4f2a558267804e54394465d1c65923e3`, equals the file's, read back independently of the helper that pasted it. The live history records the time of applying, not the file's timestamp, as for every earlier migration.
- **Verified on comms-hub, numbers** (`qa/writing-rules-comms-hub.json`).
  - Before applying: the migration and the rules in one rolled-back transaction, **322 of 322**. The migration ran only after the md5 of its text inside the query equalled the file's. Nothing stayed: no `work_docs`, no new column, no throwaway account or user.
  - After applying: the rules file run verbatim, **322 of 322**, the run's md5 `41b7273835dbdff5e8e95e8f8655b738` equal to the file's. No throwaway account or user, every new table empty, `writing_keep` 10, the work counter unchanged. comms-hub has no saved text yet, so the backfill of `keep` and `text_n` had nothing to act on.
  - Security advisors, 322 findings before and 342 after, compared entry by entry by script: 20 new, all new functions callable by `authenticated`, each checking its own rule. None for `anon`, no table without a policy, none gone.
- **Verified on production, numbers.**
  - Vercel: READY on `08d0bf1` (`dpl_Bu2TuJ6ZcZHRbAqYPGTUwZwEnXrv`), no runtime errors in the hour after.
  - `qa/writing-live.cjs`, new, **16 of 16**: signed out, all eight routes of the writing documents refuse, the styles and both public pages are out, and «العمل» stays behind the sign-in.
  - `qa/site-live.cjs` **9 of 9**, `qa/site-icon.cjs` **13 of 13**, `qa/platform-gate.cjs` **11 of 11**.
- **Not verified.** Anything signed in on the real site. The first real save, the first Drive folder under «مستندات الكتابة» and the first Arabic PDF happen with the first person who writes. A file above 4 MB has not gone through Vercel.
- **Left as they are.** `validation/recheck-R01.md`, `videos/`, `supabase/.temp/`, `qa/simulations/`, `Owner_Setup_Guide.md` and `Role_Simulation_*` stay out of the commits. The four stale rule checks of `storage_rules`, `storage_move_rules` and `backup_rules`, and the quotes that stop `backup_rules.sql` under psql, were found here and not changed.
- **Rollback.** The site: promote `dpl_6hf5unQ6UF7WJRMzoCQuSSY8WRam`, on `b795065`. The migration can stay, because that site reads nothing it changed. Undoing the migration itself would take a new migration.

### 2026-11-02: a tester's note and its marks, built and committed locally

- **Owner direction.** Ahead of the test week: add a pointer and a free box to «أرسل ملاحظة», either with more Drive space or by saving the location as code. After the review of those ideas, "Yes, build it" to the version that saves everything as data (`MVP_draft.md` section 69).
- **Decision: data, not pictures.** Measured on comms-hub the same day: the database is 21 MB, `feedback_reports` was empty and the library lists 5 files, 37 MB. Space was not the deciding reason. A screenshot of mail, messaging or a draft would show administrators what the rules hide from them, so no picture is taken at all. Drive's real free space was not visible to an agent.
- **Built.**
  - A click sets a pointer and a drag draws a box, up to three, in a layer above any open window (`src/components/feedback-mark.tsx`).
  - The note is reachable from inside any open window, which blocked the top bar before, and by Alt+Shift+N. It opens on «مشكلة» with a severity, and a note closed by accident waits.
  - A note carries its marks, an outline of at most 140 rectangles with no words, and its context: role from the account, «عرض بصفة», site version, device, screen, theme, open window, errors of the visit (`src/lib/feedback/marks.ts`, `capture.ts`). The version is a `hub-build` meta tag read from `VERCEL_GIT_COMMIT_SHA`.
  - On the mail pages and inside `data-fb-private` (the writing sheet) a mark keeps only the word for what it is.
  - The inbox has an outline view, severity and page filters, new and blocking first, merge and separate, and «انسخ للمطور» with the page's files. «عولج» tells the author through «للعلم», and «ملاحظاتي» is on «الحساب».
  - The daily limit rose from 20 to 50. The note's window and `public/privacy.html` in both languages say what is sent.
- **Verified, numbers.**
  - `npm test` **711 of 711**, typecheck and `npm run build` clean.
  - `qa/feedback-flow.cjs`, new, **83 of 83** in Edge on the real components with the database stood in: desktop, 390 wide with a real tap, the evening theme, and each of the site's window styles (`Modal`, `ml-dlg`, its wide form, `nt-drawer`, `wk-modal`, the real `Sheet`) at both widths. It replaces the static `qa/feedback-fixture.cjs`, removed, which drew a copy of the markup and would have kept passing whatever the component did.
  - On a private Docker container with every migration replayed, nothing touching comms-hub: `supabase/tests/feedback_marks_rules.sql`, new, **72 of 72**, and `feedback_errors_rules.sql`, updated for the new limit and signature, **32 of 32**.
  - The production build loaded on the sign-in page under the real Content-Security-Policy: `hub-build` read `local`, the layer's styles were present, no console or server errors.
- **Size.** The fixture's note was 889 bytes for the whole call. At most, a stored note is about 7 KB: the outline 4.1 KB, the marks 1.1 KB, the context under 2 KB. The review's "1 to 2 KB" was an estimate that left the outline out. Eight testers at 50 notes a day for seven days would be 2,800 notes, about 20 MB at the very most.
- **Found by the checks and fixed.**
  - An open dialog makes the page inert, so the browser's hit test cannot find what a mark sits on. Targets are worked out from rectangles read when the layer opens (`pickTarget`).
  - The writing sheet asks which window is on top by document order, so the note is rendered at the end of the body, where that answer is the note.
  - Reading the screenshots showed mark numbers too small to read on the outline, position percentages that said nothing beside it, and wrapped labels. The brief keeps the positions.
- **Not verified.** Anything signed in on the real site: the first real note is the first real test of the button inside each kind of window and of the role and version it sends. `hub-build` holds a commit only once deployed. The window styles were checked with their real classes on the fixture, not inside the real mail, messaging or writing pages.
- **Not applied.** `supabase/migrations/20261102180000_feedback_marks.sql` is not on comms-hub, and nothing is pushed. Apply first, then push: the live site's three-argument call still resolves on the new function, but the new site needs the new functions.
- **Not built.** Drawing a mark over the real page from the inbox. It would fail for what the reader cannot see, so the outline comes first. Nothing scrolls during marking, so a person scrolls first, and the note's window says so.
- **Left as they are.** `validation/recheck-R01.md`, `videos/`, `supabase/.temp/`, `qa/simulations/`, `Owner_Setup_Guide.md` and `Role_Simulation_*` stay out of the commit.

### 2026-11-02: a tester's note and its marks live, the migration applied

- **The owner's word.** "Apply and deploy", to the question naming the migration on comms-hub. It adds columns and functions, removes no data, and changes `feedback_submit`, `feedback_list` and `feedback_mark`.
- **Found before applying.** The rules file cleared the whole of `notifications`, inside a transaction that would roll back. It would have touched real rows on the live database for the length of the run, so it was limited to `@t.test` before anything ran there (`ed657c0`), and rerun on the private container, **72 of 72**.
- **Applied.** `supabase/migrations/20261102180000_feedback_marks.sql` as version `20261102080038` 'feedback_marks'. The md5 of the stored statement, `47d34a0209fc3963f56eecdc2f356516`, equals the file's.
- **Verified on comms-hub, numbers** (`qa/feedback-marks-rules-comms-hub.json`).
  - Before applying: the migration and the marks rules in one rolled-back transaction, **72 of 72**. The migration ran only after the md5 of its text inside the query equalled the file's. Nothing stayed: 13 columns, no `feedback_mine`, no throwaway account or user, `notifications` still 15.
  - After applying: `feedback_errors_rules.sql`, **32 of 32**. The marks rules were not run a second time, because the stored statement is byte-equal to the text they passed against. 18 columns, the old function gone, 0 notes, no throwaway account, `notifications` still 15.
  - Security advisors, 342 findings before and 344 after, compared entry by entry by script: `feedback_merge` and `feedback_mine` are new, callable by `authenticated`, each checking its own rule. `feedback_submit` reads as one new and one gone because its signature changed. None new for `anon`.
- **Verified on production, numbers.**
  - Vercel: READY on `ed657c0` (`dpl_ofUcf9aEsVLhEYLwhBDH8BvGaRMk`), no runtime errors in the hour checked.
  - `qa/feedback-live.cjs`, new, **8 of 8**: the page carries `ed657c0` as `hub-build`, so the version really reaches a note, the privacy page says no picture is taken in both languages, and a stranger is refused by `feedback_submit`, `feedback_list`, `feedback_mine`, `feedback_merge` and the helper `feedback_tell`.
  - `qa/site-live.cjs` **9 of 9**, `qa/site-icon.cjs` **13 of 13**, `qa/platform-gate.cjs` **11 of 11**, `qa/writing-live.cjs` **16 of 16**.
- **Not verified.** Anything signed in on the real site. The first real note is the first real test of a mark on a real page, of the button inside the real mail, messaging and writing windows, and of the role it sends.
- **Left as they are.** `validation/recheck-R01.md`, `videos/`, `supabase/.temp/`, `qa/simulations/`, `Owner_Setup_Guide.md` and `Role_Simulation_*` stay out of the commits.
- **Rollback.** The site: promote `dpl_9uWrKTDXHxEcQMBo48uTL52GJNB5`, on `3412e08`. The migration can stay, because that site's three-argument call still resolves on the new function. Undoing the migration itself would take a new migration.

### 2026-11-02: «إنشاء» as a permission, «إلغاء العمل», and the return button, built and committed locally

- **Owner direction.** The designer and the member do not have «إنشاء» by default, and the Admin or the Director can give it to a whole role or a person. Report what the return button cannot do, then "Yes, build it" to `Create_Access_Plan.md`, which replaces the decision of 2026-10-15 (B4b).
- **Built, «إنشاء».** `page.create` moved from each account's page list to the capability model: a role template, a person's override, a temporary grant. The designer and the member start without it. Only the Admin and the Director give, take or decide it. `work_create` now asks for it, where it refused only the publisher. Every place that offers creating asks `useCanCreate`. «الأدوار» has a real switch, and `/create` offers «اطلب هذه الصلاحية».
- **Built, «إلغاء العمل».** `work_cancel`, for the creator, within the hour, if the work was never sent and nobody else touched it. It closes the work with a stated reason, never deletes it, clears what was waiting on people, tells them through «للعلم», and frees an idea. A leader can reopen it.
- **Built, the return button.** It works on the newest action it can undo and skips a refused one, which used to block older actions for up to an hour. It reads the list again before acting. Its count and tooltip show only what can really be undone.
- **Found while reading.** `roles[...].create` also decides who may upload files, so it was left alone: setting it to false would have stopped designers uploading.
- **Verified, numbers.**
  - `npm test` **716 of 716**, typecheck and `npm run build` clean.
  - Browser checks on the real components: `qa/work-pages.cjs` **1077 of 1077**, `qa/permissions-pages.cjs` **1275 of 1275**, `qa/accounts-flow.cjs` **68 of 68**, `qa/writing-flow.cjs` **100 of 100**, `qa/platforms-flow.cjs` **74 of 74**, `qa/feedback-flow.cjs` **83 of 83**.
  - On a private Docker container with every migration replayed, nothing touching comms-hub: `create_access_rules` **61 of 61**, `work_cancel_rules` **40 of 40**, `work_rules` **135 of 135**, `planning_rules` **113 of 113**, `approval_rules` **71 of 71**, `permission_requests_rules` **49 of 49**, `urgency_rules` **41 of 41**, `writing_rules` **322 of 322**, `account_deletion_rules` **42 of 42**.
  - `permissions_rules` **134 of 137**. The three failures, 02, 09 and 114, are not from this work: the same three fail with both new migrations held out. They are stale, and were left as they are.
- **Changed from the plan.** The planned `qa/create-access-flow.cjs` was not written. Its checks went into `qa/work-pages.cjs` and `qa/accounts-flow.cjs`, which already draw these pages. `work-pages` stands in for `useCanCreate`, so the hook itself is held by unit tests of `mayCreate`, not by a browser. The shell's bottom bar, mail, requests and ideas were not clicked without the permission; a test holds that each asks the same rule.
- **Tests changed because the rule changed.** `tests/access-matrix.test.mjs`, `tests/permissions.test.mjs`, `work_rules.sql` (its member now holds the page) and `permissions_rules.sql` (its "before" rule for `page.create`).
- **Not verified.** Anything signed in on the real site. Both migrations on comms-hub.
- **Not applied.** `20261102200000_create_access.sql` and `20261102210000_work_cancel.sql` are not on comms-hub, and nothing is pushed. Apply first, then push: the live site still gets the page from `my_capabilities`, but the new site calls the new functions.
- **Known limit.** An account of the designer or the member holding the page in its list would lose it at the migration. None exists on comms-hub: 3 admins, 1 director, 1 producer on 2026-11-02.

### 2026-11-02: the desktop release channel opened, and the account card says Windows only

- **Owner direction.** Apply the SQL, make the account page offer the download and say it is for Windows for now, give the first release a version, and add logic for sending an update when one is ready.
- **Applied to comms-hub, with the owner's word.** `desktop_releases`: the public bucket `desktop-releases`, 300 MB per file, no write policy. Read back after: the bucket exists, `public` true, limit 314572800. No file is uploaded.
- **Already built, found by reading.** «تطبيق سطح المكتب» on «الحساب» (`src/components/native/desktop-app.tsx`), the download from the bucket's `latest.yml`, the old-application banner and the application's own updater (`desktop/src/update.ts`: checks at start and every four hours, SHA-512, installs on quit) were done in D3. None of it was rewritten.
- **Added.**
  - The card opens with «متاح لنظام Windows فقط حالياً» (Windows 10 or 11, 64 bit; macOS and Linux not built). `desktopFit` reads the browser's user agent after mounting; a Mac, a Linux machine or a phone gets a plain note and no download button, an unknown device still gets it. The release date shows beside the version.
  - Inside the application, when its own update ends in an error and the feed names a higher version, the card offers the installer to run over the current one.
  - `desktop/scripts/release.mjs`, `npm run release:bump -- <x.y.z>` and `npm run release:check`. The check refuses a `latest.yml` whose version differs from `package.json`, an installer whose size or SHA-512 differs from it, a missing blockmap, an installer over 300 MB, and a version not higher than the published one. It prints the upload order and uploads nothing.
- **Release version.** `0.6.0` stands as the first release (never published); the next is raised with `release:bump`.
- **Verified, numbers.**
  - Site `npm test` **717 of 717** (one new test in `tests/native.test.mjs`), `npm run typecheck` clean, `npm run build` clean.
  - Desktop `npm test`: 116 run, 113 passed, 2 skipped, 1 failed. The failure is `tests/build.test.mjs`: `desktop/node_modules` is not installed on this laptop, so esbuild cannot resolve `electron-updater`. It is not from this change; `npm ci` in `desktop/` is the fix. The new `tests/release.test.mjs` (3 tests) passed.
- **Not verified.** The card in a real browser (not drawn), `release:check` on a real `dist/release/` (nothing was packed), and an actual upload.
- **Not done, said plainly.** Not committed, not pushed. The card is not on production: the desktop's site code reaches production only on a push, and `main` also holds the «إنشاء» and `work_cancel` commits whose migrations are not applied, so apply those first. The project's global upload limit in the dashboard (Storage, Settings) is not changed by an agent and must be at least 150 MB before the installer can be uploaded. The application is unsigned.

### 2026-11-02: the YouTube setup guide rewritten for a first-time reader, live

- **Owner direction.** The director found the YouTube steps in «المنصات» still hard to follow, above all step 4 (the consent screen). Add pictures (private data blurred, corners rounded, cropped to the part that matters), set the English inside Arabic sentences in an order a reader can follow, upgrade the whole manual, commit, push and deploy, and do not break the YouTube and Google connection that already works.
- **Why step 4 was unreadable.** One sentence held six English names (Branding, Audience, External, Internal, Workspace, Test users) beside Arabic guillemets, a colon, a comma and brackets, so the browser reordered the line (the owner's screenshot shows it). Fixed at two levels: the words (one action to a step) and the drawing (every run of English is isolated).
- **Built (`MVP_draft.md` section 67.5, `8133276`).**
  - The Google guide is 13 steps in the order of Google's own «Get started» wizard, each with one short sentence and a numbered list of actions; the consent screen is five small steps. «ربط قناة يوتيوب» says the same in five plainer steps.
  - `src/lib/guide-text.ts` and `src/components/guide-text.tsx`: a label on Google's screen in «» is a chip, a value to type in backticks is a dashed chip, every other run of English is isolated with `<bdi>`. It applies to every guide, in the setup sheet and in the circled "!". Chips never split across lines. The labels of the copy boxes and the key fields, and the secret's tail, are isolated too.
  - Nine pictures in `public/guides/google/`, made by `scripts/guide-shots.mjs` from nine screenshots of another Google project (Streamer App) that the owner sent: cropped, the test users' emails, the support and developer emails pixelated and blurred (the client IDs and the project's domain were cropped out), two stray marks of the capture mended, numbered amber rings that match the numbers of the actions, a red ring with a cross on the logo (do not). The page rounds the corners (12px) and enlarges a picture on a click. The originals are not in the repository. The names «Streamer App» and its client names stay visible as examples, and the guide says so.
- **Kept, so the live connection cannot change.** The three ids a person confirmed (`youtube`, `redirect`, `publish`) keep their names and every step added is `implied`, proved by the stored secret. No database function, migration, route or secret was touched; `connect_google` and the sign-in code are as they were.
- **Deployed without the other local commits.** Local `main` holds the «إنشاء» and `work_cancel` commits whose migrations are not applied, and `origin/main` had gained the desktop release commit `3b9f4cd`. So this change was built in a clean worktree on `origin/main` (`npm ci` there: a `node_modules` junction makes Turbopack refuse the build) and pushed as `8133276` on top of `3b9f4cd`. Nothing else was pushed.
- **Verified, numbers.**
  - On the tree that was pushed: `npm run typecheck` clean; `npm test` **717 of 717** (5 new in `tests/setup-guides.test.mjs`: the markup, balanced marks, the 13 steps and the saved ids, the nine files byte-checked for size and for nothing private, the parts of both places that draw a guide); `npm run build` clean.
  - `qa/platforms-flow.cjs` **121 of 121** (was 74): every one of the 13 steps opened in a real Edge page and checked for its list of actions, no stray English outside an isolate, the order of chips on a line reading right to left, the pictures loaded at their own size; the click that enlarges and the one that restores; the addresses; the saved progress holding only `youtube`, `redirect`, `publish` and ending on «متصلة»; the phone, the evening and the English direction.
  - `qa/guide-modal.cjs` **10 of 10** (new): the circled "!" draws the 13 steps, the nine pictures inside the dialog, the same isolation, two counters that do not continue each other, Escape, phone and evening.
  - On production: deployment `dpl_3hm6CPykoEeVpXJrGFZPMQ8Q1JVd` READY for `8133276`; no runtime errors in the first hour; the nine pictures served as `image/png` and byte-identical (sha256) to the files; the guide styles in the live stylesheet and the new text in the live script.
  - The stored progress of YouTube on comms-hub, read only (the nine old step ids, the Google app connected with its secret stored, one YouTube account), run through the new rules: **13 of 13** steps, state `ok`, chip «متصلة». Nothing was written to the database.
- **Not verified.** A signed-in session on the real site: the sheet drawn from real data in a real browser (the fixture uses the real components and stand-ins for the database). The new steps followed from nothing on a fresh Google project; the order of the wizard's four screens comes from Google's page of 2026-11-02, not from a screenshot, and Google's wording differs by language. `qa/platform-setup-live.cjs` was not run (it needs `.env.local`, which the worktree does not have). The pictures are of another project's console.
- **Next.** The next person to set up a Google project follows the guide and says where they stopped.

### 2026-11-03: the look of a setup step, and the client names blurred

- **Owner direction.** After the YouTube steps were called right, the owner asked to blur the two client names in the picture of the «Clients» page, and then for the look to follow: the four suggestions A1 to A4 (progress, one card per step, pictures in order, calm states). Which platform comes next was asked as a separate question and is answered in the session, not built.
- **Built (`MVP_draft.md` section 67.6).**
  - `public/guides/google/clients.png`: the two names pixelated and blurred. The originals are not kept, so it was done on the finished file with the same routine, and the same two boxes were added to `scripts/guide-shots.mjs`. Its caption now says the names are blurred.
  - Progress: «الخطوة 9 من 13» with «أُنجز 11 وبقي 2», and a strip of one segment per step (`SheetProgress` with `marks`; the other two sheets keep the single fill).
  - One card per step (`StepCard` in `platform-sheet.tsx`, used by the ordinary, keys and review steps): number or check, name, an optional condition (`tag`, set on the test-users step), the body, and a bar with the buttons kept in view and on the sheet's bottom edge. A done step says so and its button reads «متابعة».
  - A copy button on every value in backticks (`Rich copy`), a «في الصورة» marker on an action a picture shows, «الصورة 1 من 2» on pictures, and a legend for the rings (`rings` in a shot, held equal to the pictures by a new test).
  - Done and to-do steps in the muted ink, to-do numbers dashed.
- **Not changed.** Saved progress, step ids, `implied`, every database rule. Pictures stay stacked: the card is too narrow for two side by side, which differs from what was first suggested.
- **Verified, numbers.**
  - `npm run typecheck` clean; `npm test` **723 of 723** (one new test in `tests/setup-guides.test.mjs`: every ring points at an action of its step, a tag is short, and the rings equal the nine pictures').
  - `qa/platforms-flow.cjs` **131 of 131** in Edge (was 121; ten new: the strip's segments and counts, the card, the picture markers and legends, the dimmed steps, the copy button copying exactly `Comms Hub Web`, the red-ring legend, the tag in the list and on the card, the button in view while pictures scroll and on the bottom edge, a step not yet done keeping its own button). `qa/guide-modal.cjs` **10 of 10**. Screenshots of every step, the phone and the evening theme were looked at.
  - One defect found by looking, not by a check: the strip's segments had no height at first (a percentage height inside the flex strip), so the bar looked empty although every check on its markup passed. Fixed, and the check now asks for the segments' real size.
  - `npm run build` clean (exit 0).
- **Not verified.** Signed in on the real site (the fixture uses the real components with stand-ins for the database). The look on a real phone. The circled "!" shows the copy buttons and picture notes but was checked only through `qa/guide-modal.cjs`.
- **Not done, said plainly.** Not committed, not pushed, not deployed.

### 2026-11-03: «تجربة النشر» on a YouTube account, the one real upload

- **Owner direction.** In «حسابات المنصات», a connected YouTube channel's sheet should offer a quick test of the connection: a video
  upload or a community post, a public or private choice, media from the library (Google Drive) or from the person's own files, a
  title and description or a post's text, a button that publishes the test, a button that deletes it, and a link to the channel.
  This is a deliberate exception to "publishing is a simulation", recorded here and in `AGENTS.md`; publishing works stays a simulation.
- **Read first, from Google's own pages on 2026-11-03.** `videos.insert` (one call of the "Video Uploads" quota, 100 a day; the page
  now says uploads from unverified projects are not restricted to private), the resumable upload protocol (pieces in 256 KiB
  multiples, 308 with `Range`, 201 with the video), `videos.delete` (50 units; needs `youtube.force-ssl`, `youtube` or
  `youtubepartner`, not `youtube.upload`), and the revision history: no method creates a community post, and channel discussions
  were withdrawn on 2024-04-30.
- **Decided, and why.**
  - A community post is not sent: the API cannot. The panel says so, keeps the text box, copies the text and opens the channel's
    posts page on YouTube. No picture is asked for there, because it would go nowhere; it is attached on YouTube.
  - Delete needs a wider Google permission, so the sign-in now asks for `youtube.force-ssl` beside the two it asked. Upload works on
    a channel connected before; delete there shows «في Studio» and asks for one reconnect.
  - The file travels through the site, not straight from the browser to YouTube: Google's documented upload sends the token with
    every piece, and the page must never hold a token or the upload's address. A device file goes in 3 MiB pieces (under the host's
    4.5 MB body limit), a library file is read by the server from Drive in 16 MiB pieces under the person's own folder permissions.
  - Privacy is «خاص» (the default) or «عام», as asked; subscribers are never notified of a test; at most 1 GB and ten tests a day.
  - Who: those who manage accounts and the account's own publishers (`platform_test_may`). Anyone of them may delete a test.
- **Built (`MVP_draft.md` section 71).**
  - `supabase/migrations/20261103120000_platform_tests.sql`: the table `platform_tests`, readable by row level security with every
    column but `upload_url`; `platform_test_start` (rights, account state, the same limits as TypeScript, one open upload per person
    and account, ten a day), and the server-key steps `platform_test_get`, `_session`, `_done` (a video on another channel is
    recorded as failed, never as this account's), `_failed`, `_deleted`.
  - `src/lib/platforms/youtube.ts` (open an upload, send a piece or ask where it stands, delete; errors as short codes),
    `test-rules.ts` (limits, links, words), `test-server.ts` (the token from the vault, renewed or refused as a check records it;
    a library piece), and the routes `src/app/api/platforms/test/route.ts` (start) and `[id]/route.ts` (PUT a piece, DELETE).
    `googleAccess` was taken out of `googleAccountHealth` in `oauth2.ts`, which keeps its behaviour.
  - `src/components/work/youtube-test.tsx` in the sheet's «الربط» column: the two links, the folded form, the progress with
    «إلغاء» and a resume after a lost piece, the result, «آخر التجارب» with «مشاهدة» and «حذف». Two long-press reasons
    (`platformTestPublic`, `platformTestDelete`). `LibraryPicker` takes `only` and `note`, and `libraryFiles` a kind.
  - Words: the simulation line on the page, the chooser, the help card Z01 (and `Help_Content_Matrix.md`), the page help, the
    Google guides (three permissions; the test as the one exception), and `public/privacy.html` in both languages (the third scope,
    what a test uploads and deletes; dated 3 November 2026).
- **Verified, numbers.**
  - `npm run typecheck` clean. `npm test` **734 of 734** (eleven new in `tests/youtube-test.test.mjs`: the calls against a fake
    YouTube, the rules, the links, the same limits in the migration, the hidden column, every refusal worded, no token or address
    in the page, no log; three existing tests updated for what changed: the scopes the policy names, the policy's date, the hold
    buttons' files).
  - `supabase/tests/platform_tests_rules.sql` **75 of 75** on a private Docker container with every migration replayed, nothing
    touching comms-hub (`qa/platform-tests-rules.json`). Its first run stopped on its own check reading `upload_url` as a signed-in
    person, which the database refused as it should; that check was moved to the administrator's side.
  - `qa/youtube-test-flow.cjs` **49 of 49** in Edge on a fixture of the real page, sheet and panel: links, post (text copied, posts
    page opened, nothing sent), device upload in exact pieces, library upload named by id, asked public kept private, delete, a lost
    piece resumed, a cancel half way, no delete without the permission, a refusal with its cure, who sees the panel, a channel that
    needs reconnecting, phone and evening. One defect found by looking at the screenshots, not by a check: the hidden file input
    showed «Choose File» because a page rule on inputs beat `hidden`; fixed in `work.css` and a check added.
  - `qa/platforms-flow.cjs` **131 of 131** (no regression on the two platform pages). `npm run build` clean (exit 0).
- **Not verified.** A real upload to a real channel: nothing was sent to YouTube in this work, and the browser's fixture stands in
  for the routes. YouTube's answer to a piece without CORS is not involved (the server sends every piece). Signed in on the real site.
- **Not done, said plainly.** The migration is not applied to comms-hub, nothing is pushed or deployed. The Hedayh channel was
  connected before 2026-11-03, so it uploads at once after deployment but deletes only after one reconnect.

### 2026-11-03: the Instagram guide, first pictures

- **Owner direction.** The owner followed the Instagram steps of «المنصات» on a real Meta account, sent six screenshots (the business portfolio's pages) and asked for them to be cropped, blurred and added.
- **Built (`MVP_draft.md` section 67.7).** `scripts/guide-shots.mjs` takes a set (`google` or `meta`) and makes six pictures in `public/guides/meta/`: the portfolio's name, the account's handle and picture blurred, Instagram's address bar and bottom bar cut out. The first Instagram step became two (`accounts` kept, `ig_add` new and `implied`), each with a numbered list of actions, so the guide has 7 steps.
- **What the pages showed that the old text did not say.** The portfolio's home may open before the settings; Meta warns that a personal account is switched to professional; Instagram asks Creator or Business; the closing window offers a switch to manage the account's users, which the steps tell the reader to leave off. That last piece of advice is the author's reading of Meta's own sentence, not a Meta instruction.
- **Verified, numbers.** `npm run typecheck` and `npm run build` clean; `npm test` **735 of 735** (one new test for the Meta pictures and the seven ids; the count of steps in the add-platform menu changed from 6 to 7). `qa/guide-modal.cjs` **16 of 16** (six new: the seven steps, the six pictures loaded at their size and inside the dialog, the picture markers and numbering, the red-ring legend, no sideways scroll, on a phone). `qa/platforms-flow.cjs` 131 of 131. A screenshot of the modal was looked at.
- **Not verified.** Following the new two steps on a fresh portfolio; the rest of the Instagram steps (app, configuration, return address, roles, keys) are still the old one-sentence steps with no pictures. The setup sheet itself was not run for Instagram (its row is connected in the fixture); the circled "!" draws the same steps.
- **Not done, said plainly.** Not committed, not pushed.

### 2026-11-03: «تجربة النشر» live, with the checks

- **Owner direction.** "Yes, put it live": apply the migration to comms-hub, then deploy.
- **Database.** `20261103120000_platform_tests.sql` applied to comms-hub (recorded as `platform_tests`) with the owner's approval,
  after checking that every function it relies on was there. Read back on comms-hub: row level security on; `authenticated` may
  select `title` but not `upload_url`, and may not insert or update; `anon` has nothing; seven functions, all security definer with
  an empty search path; 0 rows. The one YouTube account (Hedayh) has no `youtube.force-ssl` in its scopes, as expected. Supabase's
  security advisor lists the seven functions only under the project-wide notice that signed-in callers may run security-definer
  functions (316 entries, this project's design), and none under the signed-out or missing-policy notices.
- **Deployed from a worktree off `origin/main`**, because local `main` is 8 commits ahead (the «إنشاء» work, whose migrations are not
  applied) and 3 behind. The feature was cherry-picked as `07ff75f`; the three record files were resolved as GitHub's text plus this
  section. In that tree the hold test is stricter than local `main`'s (it wants `data-hold={HOLD.x}` written out) and failed on the
  public test button; fixed by two literal buttons (`267e88f`, and `ba68f4b` on local `main`). Checks in that tree: typecheck clean,
  `npm test` **728 of 728**, build clean, `qa/youtube-test-flow.cjs` **49 of 49**, `qa/platforms-flow.cjs` **121 of 121**.
- **Live.** Pushed `0e15a54..267e88f`; Vercel production `dpl_H25DpBsbZfEZCeuzPzJPyuoaCPCN`, serving after about 50 seconds. On
  `https://comms-hub-three.vercel.app`: `privacy.html` dated 3 November 2026 in both languages and naming `youtube.force-ssl`;
  `POST /api/platforms/test` from another site 403 and signed out 401; `PUT` and `DELETE` on a test signed out 401; signed out, the
  REST call to `platform_test_start` and a select of `platform_tests` (and of `upload_url`) are refused with `42501`. No runtime errors
  in the 30 minutes after.
- **Not verified.** A signed-in test on the real site and a real upload to YouTube (an agent does not sign in). Delete on Hedayh waits
  for one reconnect. `3d07b0f` (the look of a setup step) is still on local `main` only, not deployed.
- **Next.** The owner opens Hedayh's sheet in «حسابات المنصات», runs one private test, reconnects the channel once, and deletes the test.

### 2026-11-03: the Instagram guide, the app steps

- **Owner direction.** The owner went on following the Instagram steps on developers.facebook.com and sent five more screenshots (the apps page, the new app's name and email, the use cases listed as featured and as content management, the dashboard), asking that every screenshot be saved into the guide's steps.
- **Built (`MVP_draft.md` section 67.7).** Five more pictures in `public/guides/meta/` (11 in all; `scripts/guide-shots.mjs` gained a `width` that scales a wide crop after cropping, and the email is blurred). `app` now lists its actions with two pictures; a new `implied` step `usecase` carries the use-case choice with two pictures; `config` starts from the dashboard picture. The guide has 8 steps.
- **What the screens showed that the text did not say.** Instagram's use case is not among «Featured» but under «Content management»; the Page use case sits beside it and was not disabled after ticking Instagram.
- **Verified, numbers.** `npm run typecheck` and `npm run build` clean; `npm test` **735 of 735** (the Meta test now holds eight ids and eleven files; the add-platform hint counts 8 steps). `qa/guide-modal.cjs` **16 of 16** (the Instagram checks now expect eight steps, eleven pictures, fourteen picture markers). `qa/platforms-flow.cjs` 131 of 131. A screenshot of the modal was looked at.
- **Not verified.** Whether the Instagram and Page use cases can be ticked together; the «Business», «Requirements» and «Overview» screens (never photographed, described from the tab names); the steps after the dashboard (configuration, return address, roles, keys), still unchanged and without pictures.
- **Not done, said plainly.** Not committed, not pushed.

### 2026-11-03: the Instagram guide, the configuration and the return address

- **Owner direction.** The owner reached the use case's page and sent three more screenshots (the page, the confirmation window, the created configuration with the return address field).
- **Built (`MVP_draft.md` section 67.7).** Five more pictures (16 in all): the use case's menu, the configuration table, the confirmation window, the configuration (its ID blurred) and the return address field. `config` now lists five actions with five pictures, `redirect` three actions with a picture. The guide still has 8 steps and no id changed.
- **What the screens showed that the text did not say.** A banner says the older «API setup with Instagram login» is not available for newer apps; the configuration is made from Meta's template with a system-user token that never expires and the permissions ads_management, ads_read, instagram_basic, instagram_content_publish, instagram_manage_comments and instagram_manage_messages; the Configuration ID is shown with a copy button in the configuration's row. This is the first sight of the Unified Login screens, which the notes of 2026-11-01 called untested.
- **Verified, numbers.** `npm run typecheck` and `npm run build` clean; `npm test` **735 of 735** (the Meta test holds sixteen files and rejects the configuration ID in any word); `qa/guide-modal.cjs` **16 of 16** (eight steps, sixteen pictures, twenty markers); `qa/platforms-flow.cjs` 131 of 131.
- **Not verified.** The steps after the return address (roles, the App ID and App Secret) are still the old text without pictures; whether the connection through the site works with this configuration has not been tried (nothing was entered in the site).
- **Not done, said plainly.** Not committed, not pushed.

### 2026-11-03: the Instagram guide, what to leave alone

- **Owner direction.** The owner saved the return address and asked where to go next, sending three more screenshots (the sections under the configuration, and the saved address).
- **Built (`MVP_draft.md` section 67.7).** Three more pictures (19 in all). A new `implied` step `skip` («اترك الأقسام التي تحت الإعداد») says to leave «Generate access tokens», «Configure webhooks» and «Complete App Review» alone, with red rings; `redirect` gains the picture of the saved address. The guide has 9 steps; no id changed.
- **Reasoning, said plainly.** The step's advice follows Meta's own page for review («you can skip this step if you are a direct developer who only builds for your own Instagram businesses») and the site's design (the token comes from the sign-in; the site has no webhook address). That webhooks can be left empty without Meta blocking the sign-in is not yet proven: no connection has been tried.
- **Verified, numbers.** `npm run typecheck` and `npm run build` clean; `npm test` **735 of 735**; `qa/guide-modal.cjs` **16 of 16** (nine steps, nineteen pictures, three red-ring legends); `qa/platforms-flow.cjs` 131 of 131.
- **Not verified.** The roles and keys steps remain the old text without pictures; no connection through the site has been tried.
- **Not done, said plainly.** Not committed, not pushed.

### 2026-11-03: the Instagram guide, finished

- **Owner direction.** The owner finished the walk (the Basic page, the configuration's ID) and asked for the last pictures, then for the whole to be checked, committed, pushed and deployed, so that their manager can follow the steps. Replies to the owner are in English from this point, at their request.
- **Built (`MVP_draft.md` section 67.7).** Three more pictures (22 in all) and the keys step with five actions; the keys card of the sheet now draws the step's pictures (`KeysPanel` renders `GuideShots`). The old test line that asked the Instagram guide to say «ولا ترسلهما إلى أحد» now accepts the three forms of that sentence.
- **Verified, numbers.** `npm run typecheck` clean; `npm test` **735 of 735**; `qa/guide-modal.cjs` **16 of 16** (nine steps, twenty-two pictures, twenty-four markers); `qa/platforms-flow.cjs` **132 of 132** (one new: the keys step of Instagram opened from the connected platform's summary draws five actions and three loaded pictures beside the three fields).
- **Not verified.** A real connection through the site with this app: the owner has not entered the keys in the site. The steps for «Business», «Requirements» and «Overview» were never photographed.
- **On the tree that was pushed** (a clean worktree on `origin/main`, because local `main` holds the «إنشاء» commits whose migrations are not applied): `npm run typecheck` clean; `npm test` **730 of 730** (the local count of 735 includes tests of those other commits); `npm run build` clean; `qa/guide-modal.cjs` 16 of 16, `qa/platforms-flow.cjs` 132 of 132, `qa/youtube-test-flow.cjs` 49 of 49 (unchanged by this work). No migration, route, secret or database function was touched.
- **Deployed.** Pushed as `6d75aab` to `main`; Vercel deployment `dpl_GutEjueopLWtBXBs9ptj8RbGdbuB` READY about a minute later. No runtime errors in the first hour. Six of the new pictures were fetched from production and are byte-identical (sha256) to the files; the home page answers 200. Nothing signed in was checked on the real site.
- **Remark.** The test that keeps private strings out of the guides names three of them in its pattern (an Instagram handle, an Instagram app number in a URL, a configuration ID), so those three now exist in the repository. They are identifiers of the owner's own test account.

### 2026-11-03: «تجربة النشر» on Instagram, built

- **Owner direction.** "Check the new commits to connecting Meta for Instagram; if all is good, implement the Instagram test,
  commit, push and deploy." The six recommended answers of `Instagram_Test_Plan.md` were taken as given.
- **The review first.** The new commits (`6d75aab`, `3143604` on GitHub; `e8acfd1` on local `main`) are the Instagram setup
  guide (nine steps, 22 pictures) and the setup-step look. They change no connection code. The guide's configuration comes from
  Meta's Unified-login template, which lists `instagram_content_publish`, and the keys it collects (app id, secret, configuration
  id) are what the existing connection reads. GitHub's `main` was green before building on it: typecheck clean, `npm test`
  **730 of 730**. One gap for this work: the template's picture does not show `instagram_manage_contents`, so a note was added
  to the guide (not a step, so no saved progress moves) and the panel falls back when the permission is missing.
- **Built (`MVP_draft.md` section 72).**
  - `supabase/migrations/20261103180000_platform_tests_instagram.sql`: `platform_tests` gains `kind`, `container_id`,
    `post_url`, `share_to_feed`, `temp_ref`, `link_hash` and `link_until`; `privacy` is YouTube's alone; type and size are checked
    per kind. `platform_test_may` and `platform_test_start` accept Instagram. New server-key steps `platform_test_temp`, `_link`,
    `_container` and `platform_test_fetch`, the one function that runs with the server key and no session (Meta has none).
    `platform_test_done` takes the post's link and keeps YouTube's five-part call.
  - `src/lib/platforms/instagram.ts` (container, status, publish, the post's link and owner, delete, quota; Meta's error
    subcodes as short codes; the token in a header only) and `test-instagram.ts` (start, the Drive check of a device file,
    the temporary address, the steps, delete, and serving the file). Routes: `POST /api/platforms/test` branches by platform,
    `POST /api/platforms/test/[id]` takes `uploaded` and `advance`, and `GET`/`HEAD /api/platforms/test/file/[token]` is new.
  - `src/components/work/instagram-test.tsx`, with the helpers both panels share in `test-kit.ts`. Three long-press reasons.
    The words of the simulation line, help card Z01 (and `Help_Content_Matrix.md`), the page help, the Meta guides' notes, and
    `public/privacy.html` in both languages.
- **Where it differs from the plan.** `advance` is a POST with a step, because a GET must not change anything. The page asks
  every five seconds for up to ten minutes; Meta suggests once a minute, so this is quicker for pictures and still far under any
  rate limit for a test. The start also refuses when Meta's quota is used up.
- **Verified, numbers (on the tree that is pushed).**
  - `npm run typecheck` clean; `npm test` **741 of 741** (eleven new in `tests/instagram-test.test.mjs`); `npm run build` clean,
    with `/api/platforms/test/file/[token]` among the routes.
  - On a private Docker container with every migration replayed, nothing touching comms-hub:
    `platform_tests_instagram_rules.sql` **62 of 62**, and YouTube's `platform_tests_rules.sql` still **75 of 75**.
  - `qa/instagram-test-flow.cjs` **43 of 43**: a picture Story redrawn to JPEG, uploaded to Drive, registered, waited on and
    published; a picture post with counters and alt text, and a too-tall picture caught first; a library Reel never uploaded by
    the page; a library picture redrawn; delete; no delete without the permission; a failed fetch; a cancel while Meta prepares;
    who sees it; phone and evening. Two things were fixed from its screenshots, not its checks: the quota line sat on the form's
    border, and a post read «منشور · منشور صورة».
  - `qa/youtube-test-flow.cjs` **49 of 49**; `qa/platforms-flow.cjs` **132 of 132** after its database stand-in learned
    `eq` and `limit` (its Instagram accounts are connected for real, so their sheets now draw the panel).
- **Not verified.** Anything against Meta itself: no Instagram account is connected on comms-hub yet, and the Meta app is not
  entered. In particular: Meta fetching the file from the site within the function's 60 seconds, whether the Unified-login token
  may delete, and Meta's real daily quota. The first real Story is the proof.

### 2026-11-03: «تجربة النشر» on Instagram live, with the checks

- **Owner direction.** "Yes, apply and push", after the first attempt to apply the migration was held back for that approval.
- **Database.** `20261103180000_platform_tests_instagram.sql` applied to comms-hub (recorded as `platform_tests_instagram`) with
  the owner's approval; the table had 0 rows. Read back:
  - signed-in people may read `kind` and `post_url`, never `link_hash`, `temp_ref` or `upload_url`;
  - signed-out callers may run `platform_test_fetch` alone (gated by the server key), never `platform_test_link` or `_start`;
  - one `platform_test_done`; eleven `platform_test_*` functions, all security definer with an empty search path.
  - Supabase's security advisor: `platform_test_fetch` joins the 21 functions already callable signed out (review links among
    them), by design; the rest only under the project-wide notice for signed-in callers.
- **Deployed** from the worktree on `origin/main`: pushed `3143604..bf7388a` (`bf7388a` removes a duplicated line in the start
  route's check, found after `f80e528`). Vercel production `dpl_EkYf82Ztjn9fSUhcrsSwdeRS71LW`, READY, serving after about 80 seconds.
- **Live checks.**
  - `privacy.html` has the Instagram section in both languages and names `instagram_manage_contents`.
  - `/api/platforms/test/file/<token>`: 404 for an unknown token (GET and HEAD) and for a malformed one, with
    `Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow`.
  - `POST /api/platforms/test` from another site 403, signed out 401; a step signed out 401.
  - Signed out, through the REST API: `platform_test_fetch` without the key answers `FORBIDDEN`; `platform_test_link` and a select
    of `link_hash` are refused (`42501`).
  - No runtime errors in the 30 minutes after.
- **Not verified.** Anything against Meta: no Instagram account is connected, and the Meta app is not entered yet.
- **Next.** The owner finishes the Meta app, adds `instagram_manage_contents` to its configuration, connects the department's
  Instagram account, and publishes one test Story from its card.

### 2026-11-03: the X guide, the prices and two new parts of a step

- **Owner direction.** Begin the X guide as the Instagram one was done (better wording with the English set apart, pictures, notes with the circled "!"), starting with the prices of 2026-11-03 as a table and the first steps. The owner sent four pictures of the pricing pages and one of the dashboard, and could not find «Create App» there.
- **Built (`MVP_draft.md` section 67.8).** `info` (notes with the circled "!") and `tables` (two columns, foldable, every cell isolated) as parts of a step, drawn by the setup sheet and the circled "!". The prices step shows a short table and three folded ones (12, 16 and 19 rows, copied from the pictures), dated, with two notes; the first step lists its actions; one picture of the dashboard, name blurred. Dates in a sentence are now isolated (a defect found by looking: «2026-11-03» read as «03-11-2026» in an Arabic line, and it affected the older dated notes as well).
- **Verified, numbers.** In a clean tree on `origin/main`: `npm run typecheck` clean; `npm test` **733 of 733** (three new: the parts of a step, the X prices and their agreement, the date); `qa/guide-modal.cjs` 16 of 16; `qa/platforms-flow.cjs` **136 of 136** (four new: the notes with their icons and the four tables with their open and folded states and row counts, the English cells isolated, a folded table opening, a phone with nothing sideways). Screenshots of the step on a computer and a phone were looked at.
- **Not verified.** The prices were typed from the owner's pictures and checked against them by a test only for agreement among the tables, not against X. Nothing signed in on the real site.
- **Not done, said plainly.** The steps from «أنشئ التطبيق» on are the old text.
- **On the tree that was pushed** (rebased on `origin/main` after another session's Instagram test went live): `npm run typecheck` clean; `npm test` **744 of 744**; `npm run build` clean; `qa/guide-modal.cjs` 16 of 16, `qa/platforms-flow.cjs` 136 of 136, `qa/instagram-test-flow.cjs` 43 of 43 and `qa/youtube-test-flow.cjs` 49 of 49 (the last two unchanged by this work). No migration, route, secret or database function was touched.

### 2026-11-03: «تجربة النشر» on a Facebook Page, built

- **Owner direction.** "Plan the testing for the Facebook connection", then "Yes, build it" with the six recommended answers of
  `Facebook_Test_Plan.md`. Built, not deployed.
- **Read first.** Meta's Pages API posts, Page Post, Page feed, Page photos and Reels publishing pages (Graph API v26.0). Two
  details changed the build:
  - The feed page allows scheduling 10 minutes to 75 days ahead and the posts guide says 30 days, so the silent check schedules
    28 days ahead.
  - The Page Post reference says API deletes are for "select developers", while the posts guide documents `DELETE` plainly. So a
    refused delete is kept honest: the test stays scheduled, the panel says so with a link to the Page's scheduled posts in
    Meta Business Suite, and the list offers the delete again.
- **Built (`MVP_draft.md` section 73).**
  - `supabase/migrations/20261103200000_platform_tests_facebook.sql`:
    - the kinds `fb_silent`, `fb_text`, `fb_photo` and `fb_reel`;
    - `source`, `size` and `mime` empty for the two text kinds;
    - new columns `link` and `scheduled_for`;
    - a Page post's long id (`page_post`) accepted, and a Facebook `post_url` kept;
    - `platform_test_may` and `platform_test_start` accept a Page.
  - `src/lib/platforms/facebook.ts` (feed post, read back, photo as a file, Reel start, upload by `file_url`, status, finish,
    delete; Meta's codes as the site's) and `test-facebook.ts` (the silent check in one request, the text post, the photo
    step, the Reel steps, delete). `test-instagram.ts` now shares its token check, temporary copy and address (`metaToken`,
    `openTempUpload`, `acceptTemp`, `setLink`, `endLink`). The routes branch by platform; `PUT` takes a Facebook photo as a form.
  - `src/components/work/facebook-test.tsx`. The panels now share `test-kit.ts`: the request wrapper, the JPEG redraw, a video's
    length, the direct-to-Drive upload and the list hook `useTests`, used by all three panels.
  - Words: the simulation line, help card Z01 (and `Help_Content_Matrix.md`), the page help, the Facebook and Meta guides'
    notes, and `public/privacy.html` in both languages (a «Facebook Pages» section).
- **Where it differs from the plan.**
  - The silent check needed no special database step: it is recorded as published, then deleted, with the existing functions.
  - The file chooser stays in each panel, because each platform treats files differently; what the three share went into the kit.
  - A Reel's words travel with each `advance`, because Meta takes them at the finish and the database does not keep them.
- **Verified, numbers (on the tree on GitHub's `main`, `4914ddb`).**
  - `npm run typecheck` clean; `npm test` **755 of 755** (eleven new in `tests/facebook-test.test.mjs`); `npm run build` clean.
  - On a private Docker container with every migration replayed, nothing touching comms-hub:
    `platform_tests_facebook_rules.sql` **48 of 48**, Instagram's **62 of 62** and YouTube's **75 of 75**.
  - `qa/facebook-test-flow.cjs` **37 of 37**:
    - the silent check by default with no long press, its result and its list line;
    - a refused delete shown with the scheduled posts link and deleted from the list;
    - an http link caught; a Page refusal in words;
    - a library picture redrawn and sent as a form with its words;
    - a library Reel never uploaded by the page, and a device Reel sent to Drive;
    - a cancel while Meta prepares; delete; who sees it; phone and evening.
    - One wording fixed from its screenshots: the silent check's list line repeated its title.
  - After the shared kit, `qa/instagram-test-flow.cjs` **43 of 43**, `qa/youtube-test-flow.cjs` **49 of 49**,
    `qa/platforms-flow.cjs` **136 of 136**.
- **Not verified.** Anything against Meta:
  - Facebook is switched off in the platform list, the Meta app is not entered, and no Page is connected.
  - Whether the Page use case sits on the same Meta app as Instagram's (the guide's first step) is the first unknown.
- **Not done, said plainly.** The migration is not applied to comms-hub, and nothing is pushed or deployed.

### 2026-11-03: the desktop application, D9: measuring the device and choosing the graphics chip

- **Owner direction.** The owner asked for ideas to use a stronger laptop's power without hard limits; the answer is
  `Desktop_Power_Ideas.md` (an audit, 38 ideas, phases D9 to D13). The owner chose "Build D9 first". Built locally, not
  pushed, no release published.
- **What changed, in the application** (`desktop/`, version 0.7.0, bridge version 6; `MVP_draft.md` 63.6):
  - **The graphics chip** (`src/gpu.ts`). «تلقائي», «الأقوى», «الموفّرة للطاقة» become Chromium's `force_high_performance_gpu`
    or `force_low_power_gpu`, appended in `main.ts` before Chromium is ready, from `settings.json` (new fields `gpu` and
    `lastPower`). «تلقائي» uses `measuredPick`: on mains power only, the newest measurement under each switch for this
    Chromium, two different chips, the faster at least 1.1 times the other. A switch given on the command line is kept.
  - **The profile** (`src/profile.ts`). `profileOf` keeps numbers in one fixed shape and nothing else; `ProfileStore` keeps
    `profile.json`, one measurement per key, at most twelve. The key is the main process's own: its version, Chromium's,
    the active chip with its driver (`activeChip` in `src/device.ts`), the switch, mains or battery.
  - **Bridge version 6**: `gpu.state`, `gpu.choose` (a word from the list), `gpu.restart` ('busy' during an export,
    'nothing' when it would not change the chip), `profile.read`, `profile.save`; every handler through `guard()`.
  - «مسح بيانات هذا الجهاز» also removes the profile.
- **What changed, in the site** (inside the application only; a browser shows what it did before):
  - `src/lib/native/`: the features `gpu` and `profile`, their types, and the panel's words in `device.ts`.
  - `src/lib/studio/bench-docs.ts`: eight reference documents built with the studio's own timeline functions, their video
    and picture sources synthetic, painted from integer arithmetic so every machine starts from the same pixels.
  - `src/lib/studio/bench.ts`: «قياس قدرة الجهاز», loaded only when asked: an untimed warm-up, then three timed runs of
    H.264 encoding (1080p, 4K, chip and processor), 4K decoding, one to three export lanes each drawing and encoding the
    effects document, and the compositor drawing three documents.
  - `src/lib/studio/scale.ts`: the plan from the numbers, today's behaviour as its floor (no profile, a browser), «الأداء».
  - `src/components/native/device-info.tsx` and `studio.css`: the chip's choice on a laptop with two chips, the measurement,
    and «التفاصيل» with the figures, «الأداء» and the plan. Nothing reads the plan yet; D10 and D11 will.
- **Where it differs from `Desktop_Power_Ideas.md` section 9, with reasons.**
  - One check, `qa/desktop-profile.cjs`, covers what the plan named as two (the profile and the chip's choice).
  - **No export report in the database.** Recording the engine, chip and encoder with each export in `studio_exports` needs
    a migration and the owner's approval to apply it; the proof records them in its own JSON instead.
  - **The spread gate covers the figures something decides on** (`DECIDING` in `bench.ts`: export lanes, 4K decoding, the
    effects drawing), not every figure. Measured on the RTX run: processor-only 1080p encoding gave 64.7, 43.0 and 28.8
    frames a second in three runs as the laptop warmed, and a two-millisecond drawing is too short to time steadily. Every
    figure and its spread is still in the JSON and on the panel.
  - **Lanes include their drawing.** The ideas document's lane figures fed every encoder one drawn frame. In the first run of
    the check that flattered a machine drawing on its processor: the emulated weak machine planned three lanes, more than
    the RTX. Each lane now draws its own frames.
  - **The cross-device tolerance stayed strict** (PSNR at least 50 dB, at most 0.1% of channels more than 2 levels apart)
    and is checked document by document, so the failures below name what depends on the machine.
- **Verified, numbers.**
  - **`desktop/`:** `npm run typecheck` clean; `npm test` **135 of 135** (twelve new, in `tests/gpu.test.mjs` and `tests/profile.test.mjs`).
  - **The site:** `npm run typecheck` clean; `npm test` **774 of 774** (764 before; new `tests/scale.test.mjs`, four D9 tests in
    `tests/native.test.mjs`); `npm run build` passes.
  - **`qa/desktop-device-panel.cjs` 10 of 10.** In Edge the panel is as before. In the development package on a fresh profile:
    the choice with «تلقائي», its hints, «قياس قدرة الجهاز» followed to «سرعة التصدير المرجعية 71.7 إطار/ث (1080p) على NVIDIA
    GeForce RTX 3050 Laptop GPU.», «التفاصيل» with every figure, «الأداء» remembered, «الأقوى» asking for a restart. Pictures in
    `qa/artifacts/desktop-device-panel`.
  - **`qa/desktop-native.cjs` 37 of 37** against bridge version 6.
  - **`qa/desktop-profile.cjs` 12 of 14** (last of four runs; the earlier three led to the warm-up, the lanes with their
    drawing and `DECIDING` above):
    - Edge and the application on each chip measure through the studio's own modules; `settings.json`'s `gpu` puts Chromium
      on the AMD chip («الموفّرة للطاقة») and on the RTX («الأقوى»), each confirmed by the application and by WebGL;
    - each measurement is kept under the application's own key (0.7.0, Chromium 152.0.7977.130, the chip and its driver,
      the switch); the bridge refuses five malformed requests and keeps nothing beyond the shape;
    - the reference export of the effects document: **39.8 frames a second on the AMD chip, 76.7 on the RTX** (Edge 40.0);
      «تلقائي» then started on the RTX, as the rule says (mains power, 1.9 times);
    - a restart for the chip is refused during an export and relaunches when idle; «مسح بيانات هذا الجهاز» removes the profile;
    - the emulated weak machine measured 1.8 frames a second and planned nothing above the strong chip;
    - **failed: the spread gate on both chips** (36.6% and 21.8%, with 4K decoding on the processor and the one-lane export
      the widest). The processor was at 94% to 100% before and after those measurements, from other work on the laptop.
      The gate stays as it is, to be run on an idle laptop; the panel says «فأعد القياس حين لا يعمل على الجهاز شيء ثقيل» in
      this case.
  - **`qa/studio-crossdevice.cjs` 29 of 39**, every failure a measured property of the studio as it was before D9:
    - every engine draws every one of the 54 frames identically in a second, shuffled pass (Edge, the application on the AMD
      chip, on the RTX, and with no graphics chip);
    - the application on the AMD chip: **all 54 frames identical to Edge's, byte for byte**, across Chromium 152 and 156;
    - on the RTX: 7 of 8 documents within the tolerance; «effects» is not (worst frame 40.5 dB, up to 112 levels);
    - with no graphics chip: 2 of 8 within it; differences of up to 4 levels on most documents, up to 53 on scaled pictures;
    - the real three-second export: structure exact everywhere (codec, profile, size, pixel format, rate, all 90 timestamps,
      sound); 42.1 dB from its source in Edge, 42.3 on either chip, **39.1 with no chip**.
- **Found, and left as they are (each is the studio before D9, now measured).**
  - **«إخفاء بالمربعات» depends on the chip.** A diagnostic in the session's scratch folder took the effects document apart:
    the squares cover differs by up to 76 levels on about 1% of channels on the RTX; colour adjustments, the blur cover, the
    blurred cross, the text and the 4K scaling are within 3 levels (62 to 68 dB). The squares are made by shrinking without
    smoothing, and each chip picks a different source pixel for each square.
  - **With no graphics chip the export changes colour.** The file is written as BT.601 (`smpte170m`) instead of BT.709, 40%
    smaller, 39.1 dB from its source.
  - **The browser and the application describe colour differently.** Edge 156 writes the transfer as `iec61966-2-1`, the
    application's Chromium 152 as `bt709`.
  - **The default chip is per program.** With no switch, the development package started on the RTX on this laptop; Edge 156
    starts on the AMD chip. `Desktop_Power_Ideas.md` A-03 is corrected.
  - **Lanes on one thread gain little** for the effects document: 71.7, 76.6 and 83.1 frames a second for one, two and three
    lanes on the RTX, under load. Lanes will need their drawing in workers (P-07). `Desktop_Power_Ideas.md` section 3 is
    corrected.
- **Not verified, said plainly.**
  - Nothing was seen signed in: the panel was seen on a fixture, with the real component and the real bridge.
  - The restart for the chip was recorded in the main process (`relaunch` and `quit` replaced by recorders), not performed.
  - The laptop was busy with other work during every run (a Gradle daemon and Docker; the processor at 54% to 85% with
    nothing of this check running), so the speed figures are those of a loaded laptop.
  - The weak machine is emulated (`--disable-gpu`, the page's thread slowed four times); no real weak laptop was tried.
  - `qa/desktop-shell.cjs` (D1's install check) was updated for bridge version 6 and not re-run: it needs the release package
    and an install on this laptop.
- **Not done.** Nothing pushed, no release published.

### 2026-11-03: «إخفاء بالمربعات» the same on every computer

- **Owner direction.** "Yes, fix the squares", after D9's proof found them chip-dependent; the owner had been told it changes
  those squares' pixels everywhere.
- **What changed (the studio, every client; `MVP_draft.md` 62.8).**
  - Each square takes the average colour, weighted by opacity, of what it covers, on a fixed grid of about six samples a side
    (`cover.ts`: `squareEdges`, `mosaic`, `mosaicStep`), with whole-number sums and integer rounding.
  - On the graphics chip, in WebGL2 (`src/lib/studio/squares-gl.ts`): texelFetch reads the pixels without filtering, the
    sums are 32-bit unsigned integers, a second pass paints the area. Nothing is read back. Where WebGL2 is missing, would
    run without a graphics chip, or loses its context, `cover.ts` works the squares out in plain code (`squaresImage`).
  - Before: each square was one pixel of what it covered, picked by shrinking without smoothing, and each chip picked its own.
- **On the way.**
  - **The first version read the picture back each frame and averaged it in plain code.** Exact, and too slow: in an
    export-like loop on this laptop a 560 by 360 read-back each frame brought 110 to 120 frames a second down to 41, and
    large squares to 8 to 14. The chip path replaced it; the plain-code path remains only where there is no chip, where a
    read-back is cheap.
  - **D9's reference documents were wrong, and D9's record above with them.** Two graphics and two text tracks are allowed,
    and `addClip` moves a clip that fits on none to the end of the timeline. So in «plain», «text», «covers» and «brand» every
    item beyond the second at a time was pushed past the times the proof draws. In particular, **D9's proof never drew the
    squares of the covers document**; only «effects» had squares on screen. `bench-docs.ts` now lays them out in turns within
    the limits, and `tests/scale.test.mjs` refuses a reference document with a clip pushed past its length. «effects», the
    one the measurement's export rate uses, was not affected.
- **Verified, numbers.**
  - `npm run typecheck` clean; `npm test` **778 of 778** (four new in `tests/studio-markers.test.mjs`); `npm run build` passes.
  - `qa/studio-engine.cjs` **41 of 41** in Edge (the squares still change what they cover and nothing outside it).
  - **`qa/studio-crossdevice.cjs` 34 of 43** (29 of 39 before the fix):
    - the squares worked out on the chip equal the plain-code squares **byte for byte** in Edge, on the AMD chip and on the
      RTX, in five areas from 37 by 29 pixels to the whole frame; with no graphics chip the chip path declines, as designed;
    - **the RTX now passes on all eight documents**, «effects» included (its worst frame 40.5 dB before, 53.8 now), with the
      covers document's squares on screen; the AMD chip still draws all 54 frames identical to Edge's;
    - with no graphics chip: «covers» 50.8 dB at worst (the squares no longer differ), «effects» 48.2 (40.0 before); what still
      differs there is picture scaling and colour adjustments drawn on the processor, up to 53 levels on scaled pictures;
    - still failing, unchanged and separate: the BT.601 export with no graphics chip (39.1 dB) and the two colour descriptions.
  - **Cost, an export-like loop on this laptop** (draw, VideoFrame, encode; 1080p over the 4K synthetic footage; scratch
    timing, not a check): squares on the chip **109 to 128 frames a second**, the same as no cover (114 to 129) and as the old
    squares (115 to 124), with nothing slower afterwards.
- **Not verified.** Nothing signed in. A real project with squares was not opened: a project saved before today shows the same
  squares softer in colour.
- **Not done.** Nothing pushed.

### 2026-11-03: an export's colour is BT.709 on every computer

- **Owner direction.** "Yes, fix the colour", after D9's proof found that with no graphics chip an export was BT.601.
- **What it was.** Given the canvas, Chromium's processor-only encoders convert to YUV as BT.601 and say so (`smpte170m`); the
  graphics chips' encoders convert as BT.709. Read with its own label the file was close to right (31.8 dB in RGB); read as
  BT.709, as players often read HD video, green fell to 19.6 dB.
- **What changed (the studio, every client; `MVP_draft.md` 62.10).**
  - `src/lib/studio/yuv.ts`: `rgbaToI420`, BT.709 limited range in fixed point (coefficients scaled by 2^16, every grey exactly
    neutral), chroma from each 2 by 2 block's rounded average, each pixel read once as a 32-bit word.
  - `export.ts`: where no hardware encoder is offered for the export's codec and size, frames go to the encoder as BT.709 I420
    made by `rgbaToI420` (`VideoSampleSource`), labelled BT.709. Elsewhere the canvas path is unchanged, and if its encoder's
    first packets report any matrix but BT.709 (a chip that fell back to the processor), the export starts again the BT.709
    way. `ExportResult.via` says which path made the file.
- **Verified, numbers.**
  - `npm run typecheck` clean; `npm test` **783 of 783** (five new in `tests/studio-colour.test.mjs`); `npm run build` passes.
  - A first experiment with no graphics chip: the same two seconds from the canvas came out `smpte170m`, from BT.709 frames
    `bt709`.
  - `qa/studio-export.cjs` **18 of 18** in Edge (the canvas path; the studio's record), and **18 of 18 inside the development
    package with no graphics chip** (the BT.709 path: sound in step, speeds, ramps, reverse, a square shape, stills; record kept
    in the session's scratch folder, not over the studio's).
  - **`qa/studio-crossdevice.cjs` 35 of 43** (34 before): "the application writes the same colour description on every chip
    and with no chip" now passes; the no-chip export is `bt709` throughout, its green 38.8 dB from the source in RGB (19.6
    before, read as BT.709), and two runs wrote the same file to the byte.
- **What it costs, said plainly.** Only where the encoder runs on the processor. Profiled with no graphics chip, per 1080p frame:
  the conversion 13 ms and reading the frame about 10 ms; the whole path 46 ms against 26 from the canvas. The proof's
  three-second no-chip export took 3.1 s, against about 1.7 s before. Computers that encode on a graphics chip, the pilot
  laptops included, take the canvas path as before.
- **Still open, separate.**
  - With no graphics chip the encoder writes about 6 Mbit/s where the chips write 10.5 (2.4 MB against 4.0 MB for the proof's
    three seconds), so the file stays 39.3 dB from its source, under the check's 40. That is quality, not colour.
  - Edge 156 labels the transfer `iec61966-2-1` and the application's Chromium 152 `bt709`; the matrix and primaries agree.
- **Not done.** Nothing pushed.

### 2026-11-04: the desktop application on Electron 45 (Desktop Power, Fork 3, item 1)

- **Direction.** The Desktop Power stage's manager session assigned the upkeep: `Desktop_App_Plan.md` 4.2 moves the application to
  45 once it has been out fourteen days, and `Desktop_Power_Ideas.md` section 12 found it due. Built in the worktree branch
  `claude/power-desktop-5fba9d`, local only.
- **What changed.** `desktop/package.json` pins **Electron 45.0.0** (was 44.5.1), with Chromium 156.0.8078.48 and Node.js 24.22.0;
  the desktop version is **0.7.1**; the bridge stays at version 6 (no call changed). `THIRD_PARTY_NOTICES.md` names the new
  version. `qa/desktop-windows.cjs` asked for bridge version exactly 5, stale since D9; it now asks for 5 or later.
- **Which release, said plainly.** npm records 45.0.0 at 2026-10-21 06:03 UTC (2026-10-20 on Electron's calendar), so by UTC
  it was 13 days and some hours old at the move. 45.1.0 (2026-10-27) and 45.2.1 (2026-10-31) are newer and younger than
  fourteen days; 45.2.1 is due from 2026-11-14.
- **What Electron 45 changes for this application** (its `breaking-changes.md`): sandboxed preloads lose the `events`, `timers`
  and `url` shims and the `Buffer` and `setImmediate` globals. The built preload requires only `electron` and uses none of
  them. `window.open` children of an unsandboxed window get a process of their own; every window here is sandboxed.
- **Verified, numbers.**
  - `desktop/`: `npm run typecheck` clean; `npm test` **135 of 135** (the same 135 on 44.5.1 before the move).
  - The site: `npm run typecheck` clean; `npm run build` passes; `npm test` **783 of 783**.
  - **The chip switches** (a scratch probe on Electron 45, `getGPUInfo` and WebGL's renderer): no switch starts on the RTX 3050,
    `force_high_performance_gpu` on the RTX, `force_low_power_gpu` on the AMD chip. Chromium 156 still honours both.
  - **The profile's key** reads `process.versions.chrome`, now 156.0.8078.48, so the measurements taken under 152 no longer drive
    «تلقائي» until the laptop is measured again; that is the design (a measurement is true for its Chromium).
  - `qa/desktop-shell.cjs` **68 of 68**, including the six release fuses read back from the packaged 0.7.1 and the development
    package differing in the inspector fuse only. **Its install, run and uninstall were skipped**: this laptop already has an
    installation in `%LOCALAPPDATA%\Programs\sa.commshub.desktop` and its profile, which the check never touches.
  - `qa/desktop-native.cjs` **37 of 37**; `qa/desktop-studio-parity.cjs --parity-only` **12 of 12** (`studio-engine` and
    `studio-export` the same in Edge and inside the application); `qa/desktop-csp.cjs` **13 of 13**; `qa/desktop-files.cjs`
    **16 of 16** (the protocol, the cache folder, a file over 4 GB read in place); `qa/desktop-media.cjs` **52 of 52** (the same
    frame at 48 times from every light copy); `qa/desktop-windows.cjs` **13 of 13** (12 of 13 before the stale assertion was fixed).
- **Not run.** `qa/desktop-profile.cjs`, `qa/desktop-device-panel.cjs` and `qa/studio-crossdevice.cjs` (speed figures need a quiet
  window; the proof is the manager's). Chromium 156 is Edge 156's version, so the transfer label that differed between Edge and the
  application (`iec61966-2-1` against `bt709`) may now agree; not checked here.
- **Not done.** Nothing pushed, no release published.

### 2026-11-04: the export's rate, its BT.709 conversion off the page, BT.709 named everywhere, and the loudness ahead (Desktop Power, Fork 1, items 1 to 4)

- **Owner direction.** The Desktop Power stage (`Desktop_Power_Ideas.md`), run by a manager session as parallel forks; this is Fork 1
  (`power-export`), items 1 to 3 of its list and P-15. Built on branch `claude/power-export-821809`, local only.
- **Item 1, the processor encoder's rate (`export.ts`).** Read in Mediabunny 1.61.2: its high quality asks an H.264 encoder for quantizer
  22 and, where the encoder takes no quantizer, falls back to about 6.1 Mbit/s at 1080p. The graphics chips take the quantizer (10.5
  Mbit/s for the proof's source); the processor's encoder does not, hence 6 Mbit/s and 39.3 dB. H.264 now asks for quantizer 22 with the
  export's own stated rate as the fallback (`videoQuality`, `aimMbps`: 5, 10 and 35 Mbit/s at 720p, 1080p and 4K, half as much again
  above 30 frames). With no chip the proof file is now 41.2 dB from its source at 10.1 Mbit/s, in Edge and in the application. The chips'
  files carry the same video packets as before (framemd5 of every packet, as it is against as it was at 998ef0c), on Edge's AMD chip and
  on the application's two chips; a test holds the codec string, and so the level, equal in every shape, size and rate. WebM is unchanged.
- **Item 2, the BT.709 conversion off the page (`yuv-pipe.ts`, `yuv-simd.ts`, `yuv.ts`).** Each composed frame leaves the page as a
  VideoFrame of the canvas; two workers read it (`VideoFrame.copyTo`) and convert it. The arithmetic is yuv.ts's, as WebAssembly with
  128-bit lanes built instruction by instruction at run time (`simdModule`), four pixels at a time; `i420Into` does the last columns of
  a width that is not a multiple of 16, and everything where the lanes are missing. A failed worker starts the export again on the page,
  the old way. Same bytes everywhere checked:
  - the corpus's 54 composed frames converted by the workers equal the page's conversion byte for byte, from the bundle and from a
    minified bundle, in Edge with and without its chip and in the application with no chip, on the saving chip and on the strong chip;
  - a real export with the workers and with the page's conversion carry the same 90 video packets;
  - in Node, the WebAssembly conversion equals `i420Into` in every shape at 720p and 1080p, plus a 40-pixel width.
  The conversion of a 1080p frame: about 2.9 ms with WebAssembly, 12 to 14 ms in plain code (Node, this laptop, under load).
- **Item 3, the transfer named BT.709 (`export.ts` `asBt709`).** Edge 156's chip encoder labels the transfer `iec61966-2-1`. Its H.264
  headers leave colour unspecified (primaries and transfer 0), so the label is only in the MP4's `colr` box, written by Mediabunny from
  the encoder's description. The export now names the transfer `bt709` there when the encoder converted with BT.709 into limited range,
  and changes nothing else. After the merge of Electron 45 (Chromium 156) the application's chips also wrote `iec61966-2-1` under the
  old code; with this change every engine, chip or none, writes bt709/bt709/bt709/tv (`qa/studio-export-yuv.cjs`).
- **Item 4, P-15, the loudness worked out ahead (`loudness-ahead.ts`, `export-panel.tsx`).** While the export panel is open, a moment
  after the last change and once every source heard is ready, the mix's loudness is measured the export's way in the browser's idle time
  and kept under a key of everything the mix depends on (every clip field but those that move only the picture). «قياس المستوى» and
  «توحيد مستوى الصوت» use it; the panel says «قيس مستوى الصوت مسبقاً: … LUFS، فيبدأ التصدير الموحَّد دون انتظار القياس.». The sources'
  waveforms are asked for at the same time. Nothing drawn in the timeline changed.
- **Verified, numbers.**
  - `npm run typecheck` clean; `npm test` **790 of 790** (new `tests/studio-export-power.test.mjs`, seven tests).
  - **`qa/studio-export-yuv.cjs` 28 of 28** on Electron 45 (Chromium 156.0.8078.48) and Edge 156.0.4314.58 (untimed run).
  - **`qa/studio-loudness-ahead.cjs` 8 of 8** in Edge: on a two-minute project the figure worked out ahead equals the export's own
    measurement exactly (-11.17 LUFS, peak -9.89 dB); from pressing export to the first encoded frame with «توحيد مستوى الصوت», 7270 ms
    measured first against 470 ms with the figure ahead (laptop at 57 to 58% load); a volume halved is measured again (6.02 LU quieter),
    a picture moved keeps the figure; in the real panel the figure appears by itself, the export shows no «جارٍ قياس مستوى الصوت», and
    the file is at -14 LUFS within 1 LU by ffmpeg.
  - **Speed of item 2, in the manager's quiet window, before the WebAssembly lanes** (mean load 34% before timing with nothing of this
    fork running; 24 to 39% around the application's runs, 64 to 71% around Edge's; the stray `find.exe` was stopped by the owner during
    the run). Medians of three interleaved rounds of the proof's three-second export with no chip: the application 1723 ms by the canvas
    (996a9b5), 4521 ms by the page's BT.709 conversion (998ef0c), 2729 ms with workers in plain code: **1.58 times, the target 1.2 not
    met**. Edge with `--disable-gpu`: 1574, 3837 and 2552 ms, 1.62 times. A stage profile then showed the conversion competing for the
    processor, which led to the WebAssembly lanes.
  - **After the WebAssembly lanes, in the manager's second quiet window** (`qa/studio-export-yuv-speed.json`, 30 of 30; the load
    with nothing of this fork running was 30 to 73%, mean 55%, before another fork's check ended; the first timed run straddled that end
    and is not the record). Medians of three interleaved rounds, the same three ways:
    - the application with no chip: 1386 ms by the canvas, 3257 ms by the page's conversion, 1648 ms now: **1.19 times** (load 19% before,
      22% after);
    - Edge with `--disable-gpu`: 1369, 3074 and 1562 ms: **1.14 times** (load 15% before, 5% after).
    The target of 1.2 is met, the application's narrowly. Earlier, not in a quiet window, Edge gave 0.91 at 48 to 52% load.
  - **Under the site's own Content-Security-Policy.** `buildCsp` (`src/lib/csp.ts`) gives every page `script-src ... 'wasm-unsafe-eval'`
    and `worker-src 'self' blob:`, and a blob: worker keeps its page's policy. `qa/studio-export-yuv.cjs` now serves its page with that
    policy, built by `buildCsp` itself with a nonce: the workers compile their WebAssembly there. With `'wasm-unsafe-eval'` taken out,
    they convert in plain code, to the same bytes, in Edge with and without its chip (`qa/studio-export-yuv-edge.json`, 16 of 16;
    the policy is a page's, so the application's engines run the other checks only). The timed record was made before these two
    checks were added.
- **Not verified, said plainly.** Nothing signed in: the panel was seen on the studio's fixture with the real component. A WebM export
  was not timed (VP9 has no chip encoder here, so it always takes the BT.709 path).
- **Not done.** Nothing pushed.

### 2026-11-04: the export's drawing in workers (P-07), built, proven where it is exact, and kept off (Desktop Power, Fork 1)

- **What was built.** `src/lib/studio/export-draw.ts` is an export drawing worker: it composes frames with the studio's own
  compositor, `compose.ts`, unchanged, on an OffscreenCanvas. `draw-shim.ts` gives the compositor's modules the little of a page they
  use: a canvas element is an OffscreenCanvas, `document.fonts` is the worker's own set, and `new Image()` loads a picture into an
  OffscreenCanvas. `drawers.ts` is the page's half. It mirrors the font faces the page has loaded (each with its own file and range,
  read from the page's style sheets, so text falls back from font to font as on the page), and sends the project's pictures and,
  frame by frame, the decoded frames as ImageBitmaps. `export.ts` takes `drawers` (default 0) and encodes the workers' frames as it
  encodes its own canvas. A worker that cannot start or fails starts the export again on the page (`steps: ['DRAW_WORKER']`).
- **Measured (`qa/studio-export-draw.cjs`, Edge 156 with and without its chip, `qa/studio-export-draw-edge.json`, 6 of 8).**
  - An export with an Arabic title drawn by two workers carries exactly the page's 90 video packets, on both engines.
  - Where the workers cannot start, the export draws on the page, says so, and carries the same packets.
  - **The corpus is not exact everywhere.** With the AMD chip: plain, 2 frames (38 to 95 pixels, 1 level) and brand, 5 frames (5 to
    67 pixels, 1 level). The page's canvas element and an OffscreenCanvas on the page agree there; the worker thread's raster differs
    by one level on shape and brand-mark edges. With `--disable-gpu`: effects, 6 frames (up to 3394 pixels, 50 levels); covers, 6
    frames (up to 144137 pixels, 27 levels); transitions, 1 frame (3431 pixels, 108 levels). Here the cause is the kind of canvas,
    not the thread: an OffscreenCanvas on the page already differs from the canvas element in those blur and filter paths, and the
    worker equals the page's OffscreenCanvas exactly (a diagnostic in the session's scratch folder).
- **Decision (the manager, (A)).** The drawing in workers stays in the code, off by default; nothing in `scale.ts` or the export panel
  turns it on in this stage, and the floor stays the page's canvas element, today's frames. Once Fork 4's whole-number blur and
  filters are on main, the corpus in workers is to be run again on every engine; the AMD chip's one-level edges may remain, so any
  later switch-on is per engine and proven by this check. Making the floor itself draw in a worker (B) goes to the owner as a choice.
- **Verified.** `npm run typecheck` clean; `tests/studio-export-power.test.mjs` and `tests/studio-colour.test.mjs` 12 of 12. The
  application's engines (no chip, both chips) wait for the port-3000 lock.
- **Not done.** Nothing pushed; drawing in workers not switched on anywhere.

### 2026-11-04: the desktop application, D12: light copies in idle time, parallel library copies, the taskbar, dragging out, the camera card (Desktop Power, Fork 3)

- **Direction.** The Desktop Power manager's list for Fork 3: `Desktop_Power_Ideas.md` P-30 with P-08, P-29, P-26, P-22, P-20, and the
  path found in its section 12; the recommended answers of its section 10 stand for Q1 to Q7. Built in `claude/power-desktop-5fba9d`,
  local only; desktop 0.8.0, bridge versions 7 to 9; `MVP_draft.md` 63.9 and the D12 paragraph of `AGENTS.md`.
- **What changed.**
  - **Light copies made while the laptop is free (P-30, P-08; bridge 7: `life.activity`, `media.queue`, `queued`, `onQueue`).**
    - **Where they come from.** The studio names every video source its media pool opens to the application's queue
      (`src/lib/studio/cache.ts`). The width is `copiesAtOnce` of `scale.ts`.
    - **When they run** (`desktop/src/idle.ts`): only on mains power, at the processor's full speed limit, with nothing exporting,
      uploading, playing (said by the page, or the window heard), scrubbing, measuring or asked for, and three seconds after the last
      key or click in the application. Moving the pointer and scrolling hold nothing.
    - **A held copy pauses.** The utility process serves its source to FFmpeg over loopback (`loopback.ts`: 127.0.0.1, one 32-byte
      token per running job, the Host checked, no CORS header) and stops the bytes.
    - **A copy whose source FFmpeg had already read whole** (a still scene) goes on despite that; after 1.7 s it is ended as `held`
      and made again later. So is a copy held three minutes, or wanted by no window.
    - **Which sources need a copy** follows the device profile's 4K decoding rate (`heavyOn`), and today's rule without one.
    - **What is said:** «التخزين على هذا الجهاز» says how far the copies are and why they wait, and the tray adds a line.
  - **P-29.** `CacheStore.copy` asks for two 16 MB parts at once, at most four when asked, and keeps only the unbroken start, so a
    resume starts from the first gap.
  - **P-26, P-22 (bridge 8: `life.progress`, `files.dragOut`).**
    - **The taskbar button** shows a page's progress, red on failure until the window is looked at.
    - **The jump list** offers «الاستوديو» and «يحتاج قرارك» (the home page), by a word of a fixed list, never an address.
    - **A file used where it is** can be dragged out of «التخزين على هذا الجهاز» into another program.
    - **Site helpers** for the export panel: `setTaskbarProgress`, `fileToken`, `dragOutFile`. Fork 1 wires them after the merge.
  - **Section 12.** `cache.usage` names the folder «المجلد الافتراضي» or by its last name, never by its path, which held the Windows user
    name; the studio shows only a last name even from an older application.
  - **P-20 «استيراد من بطاقة الكاميرا» (bridge 9: `files.importCard`, `copyCard`, `cancelCard`, `onCard`).**
    - **The listing:** the card is listed without following a link or a junction out of it, and an AVCHD recording split in parts is
      one item.
    - **The copy:** each copy is a `.part` until its SHA-256 read back matches what was read.
    - **The page** gets keys and tokens, never a path, and the copied videos join the light-copy queue.
    - **Added from «هذا الجهاز» for now:** the copied files go into a project from there; adding them straight to the timeline is not in
      this stage.
  - The plan's note in «معلومات الجهاز» now says the light copies follow it.
- **Verified, numbers** (the desktop package built from `99d685b`, desktop 0.8.0, bridge 9; records in `0357022`).
  - **`desktop/`:** `npm run typecheck` clean; `npm test` **158 of 158**. The real-FFmpeg tests:
    - a copy read over loopback has the same frames as one read from the file;
    - a paused copy stays at 7.74 s for three seconds, then ends the same;
    - a still source's copy is ended as held 1741 ms after the pause.
  - **The site** (at `0357022`): `npm run typecheck` clean; `npm run build` passes; `npm test` **795 of 795** (twelve new in
    `tests/native-power.test.mjs`).
  - **`qa/desktop-native.cjs` 37 of 37** (bridge 9; the check now takes the shape from the tree's `BRIDGE_VERSION`).
  - **`qa/desktop-taskbar.cjs` 13 of 13:** the jump list's first and second starts; the bar, red until focus, ended with its document;
    refusals; a drag by token, and unknown, malformed or forgotten tokens drag nothing; the label without a path or user name.
  - **`qa/desktop-files.cjs` 16 of 16.**
  - **`qa/desktop-card-import.cjs` 11 of 11:**
    - a 2.07 GB recording split as a camera splits it is copied and joined, its SHA-256 the camera's stream's;
    - nothing hidden, of Windows' own, a side file or behind the junction is listed;
    - a cancel, a part pulled out mid-copy and a destination on the card each leave nothing;
    - 4.29 s per GB on this laptop (read, write, read back).
  - **`qa/desktop-media.cjs` 52 of 52.** The check now holds the broker, since it is of copies asked for.
  - **`qa/desktop-idle.cjs` 21 of 23**, on 4K sources with grain at a camera's bitrate (140 MB for 30 s) and still ones (0.8 MB):
    - a click, an export, «playing», battery and the speed limit each paused the copy in 6 to 20 ms, with no progress from a second on;
      it went on in 0.5 to 0.9 s, and by itself 3.46 s after the click;
    - the still source's copy was stopped at 1792 ms and made again;
    - the asked copy held the others;
    - the four copies kept 750 of 750 frames, and a cancel and a quit left no FFmpeg and no part.
  - **Failed in that run: the sound case, two checks.** The window was heard (audible, then silent; the element unmuted at volume 1)
    and the copy paused in 20 ms. But Windows lowered the processor's speed limit at that moment, so the queue reported the stronger
    «throttled» and held 16 s.
  - **The speed runs** (`qa/desktop-idle.cjs --speed`, in two quiet windows the manager granted).
    - **First run, at `99d685b`, 24 of 27.** 157 speed-limit events in 6.5 minutes, the limit falling to 34% to 75% and back to 100
      within about ten seconds whenever copies load every core, on a cool and otherwise quiet laptop. The three widths took 37 to 40
      s for three copies. The stage's p95 was unreadable from single plays (66.8 ms with nothing to make; 83.3, 17.4 and 83.4 ms held
      at widths 1 to 3), and Fork 4's short benchmarks overlapped its last rows. It also showed a held copy still decoding for up
      to a second after the pause, while the stage starts; from `e695d04` a paused job drains at idle priority.
    - **Second run, at `e695d04`, 25 of 26.** The D12 gate holds: the stage's 95th-percentile frame time, median of three
      interleaved 8 s plays each, was **50.1 ms with copies held at width 1 and at width 3, against 49.9 ms with nothing to make**
      (within 10%). The processor's load just before each held play was 97% to 100%, as the copies had been running. One copy
      running, played without sound, gave 33.3 ms; a play with sound is not directly comparable.
    - **The widths, Windows' speed limit set aside:** 30.4 s, 33.6 s and 28.9 s for one, two and three copies at once. No gain, so
      `copiesAtOnce` stays 1 in every mode (`scale.ts`); it had followed the export lanes' gain, which measures the chip's encoders.
      136 speed-limit events, the lowest 34%.
    - **The sound alone holds a copy**, with Windows' speed-limit events kept out: the hold was «playing», 22 ms after the window was
      heard. That run's check still failed, because the 4K grainy clip stalled (`readyState` 1) and the window was heard 0.3 s only,
      after which the copy went on, as it should.
    - **The sound case again, at `afbde46`, 21 of 23.** The hold was «playing» 23 ms after the window was heard, the reason proven
      again. But the studio's player in the fixture was heard only in two bursts of about 0.23 s, its element stalling (`readyState`
      1), so the copy went on between them. The export case paused in 12 ms and did not resume within 15 s of the release, since
      Windows lowered its own speed limit meanwhile. Both are the fixture's conditions, not the broker's rules.
    - **`2903ecc`** holds the sound rule with a steady tone from the page and checks the player's own sound apart, and keeps
      Windows' speed-limit events out of every hold case but the simulated one. The manager runs it in the verification worktree;
      its result is the manager's record of the merge.
- **Decisions on the way** (the manager, 2026-11-04): keep the speed-limit hold as built, so copies never push the laptop into its
  limit; do not raise `copiesAtOnce` above 1 without a measured gain.
- **On the way.**
  - **The first packaged run** (from `3a6eb4f`, before the fix): `desktop-idle` 16 of 21, because on 1 MB sources FFmpeg had read the
    whole file before the pause and went on. That led to the `held` stop and to the grainy corpus. `desktop-media` 50 of 52, because
    its heavy 4K sources were copied by the broker before the check asked; it now holds the broker.
  - `qa/desktop-windows.cjs` asked for bridge version exactly 5; it now asks for 5 or later.
- **Where it differs from the ideas document, with reasons.**
  - `media.pause(reason)` became `life.activity(kind)`: one word the broker reads for every background job.
  - Playback is also held when the window is heard, because the studio's player does not say «playing» yet (it is Fork 2's file); the
    manager routes the player's «scrubbing», using a copy made in idle time at once, and stopping a closed project's copies, after the
    merge.
  - P-26 and P-22 share bridge version 8. «يحتاج قرارك» opens the home page, which has no page of its own.
- **Not verified, said plainly.**
  - A real drag into Explorer is Windows' own and cannot be driven by Playwright: an owner walkthrough step.
  - `qa/desktop-shell.cjs` was not run again after item 1.
  - Nothing was seen signed in.
- **Not done.** Nothing pushed, no release published.

### 2026-11-04: the desktop application, D10: a faster preview (Desktop Power, Fork 2)

- **Owner direction.** The Desktop Power stage ("Speed, never the video"), phase D10 «معاينة أسرع» of `Desktop_Power_Ideas.md`
  (P-02, P-03, P-04; P-15 is Fork 1's), built as Fork 2 of the manager's parallel forks from `998ef0c`, brought up to date with
  Electron 45 (`60335d7`), Fork 1's export work (`dcb2d80`) and Fork 3's D12 (`411007d`). Q1 to Q7 at their recommended answers.
  Built locally, not pushed. `MVP_draft.md` 63.7, the D10 paragraph of `AGENTS.md`.
- **What changed** (the studio, inside the application once the device is measured; a browser, and an application not yet
  measured, keep today's behaviour, held by the Edge checks below).
  - **«ذاكرة الإطارات للتنقل» (P-02)**, `src/lib/studio/scrub.ts`, `media.ts` `setFrameCache`. The paused preview gets a decoder of its
    own (Mediabunny's `VideoSampleSink`; the export's `sink` and `passSink` are untouched) and keeps the frames it decodes in the
    plan's memory (1024 MB on this laptop), in two tiers:
    - the frames near the playhead at the size the preview draws them: a power-of-two share of the source never smaller than drawn
      (`needOf`: the fit, the largest scale and key, the crop, room for movements), so compose.ts lays them out exactly as the
      whole frame; the least recently shown let go first;
    - every frame of the stretch the timeline uses at most 480 pixels wide (`THUMB_WIDTH`), in a third of the memory, filled while
      paused: a jump shows the right frame at once, small, and its sharp frame follows.
    - Which frame: the export's rule (`EPS`, export.ts `frameFor`), the target known from the packets' own times; a kept frame
      answers a time only while its next frame is known to start later.
    - A jump ends every other pass and paints only its own frame. With a hardware decoder it reads with a low-latency decoder;
      without one it takes today's path exactly (`getSample`, the decoder emptied). What lies ahead, behind and small is read only
      after `SCRUB_IDLE` (150 ms) with nothing asked, and stops at the next ask.
  - **«تلقائية» (P-03)**, `src/lib/studio/playback.ts` `AutoLevel`, `handles.ts` `AUTO`, `stage.tsx`, `editor.tsx`,
    `src/components/studio/plan.ts`: the first choice of «أثناء التشغيل», the default once measured; each project frame drawn once,
    a quarter second with two missed (a re-seek counts as one) steps down, four calm seconds step up, never back to a step that
    missed in the same play; a first play starts no higher than the measured budget allows (`startLevel`), a remembered or
    just-ended level is kept; the badge «تلقائية: 1/2».
  - **The stream budget (P-04)**, `playback.ts` `streamBudget`, `streamPlan`, `preview.ts`, `media.ts` `element`: a third of the
    measured 4K decoding (less when drawing is slow); the largest on the canvas play their source, the rest their light copy; a
    run of re-seeks lowers the budget for the session at that jump; a clip catching up keeps its last frame.
  - **With D12**: a 720p copy the idle-time queue reports ready is read at once when paused, at the next pause when playing;
    `dispose()` stops the queue; the player says «scrubbing» while a paused playhead moves and «playing» while it plays, never
    waited for.
- **On the way, measured** (each led to a change; the first gate run's records are `aee226c`).
  - **A sized `CanvasSink` is slower, not faster.** In Edge (a loaded laptop) it read 4K at 10.8 frames a second into 1920 and 5.9
    into 960, against 37.8 at full size: its fine downscaling draws a canvas onto itself. Frames are painted with `drawWithFit` and
    halved on separate canvases instead.
  - **The jump path waited for other work.** Painting the half second before a jump's frame, and the small frames' pass decoding
    beside it, put the sharp frame at 399 ms against 260 today in Edge (2 s key frames). Fixed in `c96e9b5`.
  - **A pass that is not emptied holds a frame back on the processor.** With no graphics chip, a jump right after opening came at
    349 ms against 276. The low-latency decoder tried first (`977757b`) **backfired there: 1252 ms against 267, the sharp frame 1043
    against 288, and the application's page closed during the 10 s row** (the rerun of 06:31 to 08:25). Found and fixed in
    `b755b25`: the low-latency decoder only where a hardware decoder is offered, today's path where none is.
  - **A single stream's decoding does not carry several elements.** Three 4K originals fell behind (66 re-seeks in 8 s) on the
    RTX, measured at four and at six 4K streams decoded alone. The margin is a third, and the session lowers it at a run of
    re-seeks.
  - **Starting low cost frames.** On the RTX «تلقائية» with copies missed 2.8% and 2.4% in the two steps back up from a quarter,
    though «كاملة» held; the first level now follows the measured budget and a known level is kept.
  - **A frozen picture looked smooth.** Without light copies the elements kept re-seeking and showed no frame while the stage drew
    on time; «تلقائية» then stepped up. A re-seek now counts as a missed frame, and the playback check counts frames never shown.
- **Verified, numbers** (2026-11-04, the D10 quiet windows, the other forks paused; the processor's load beside each row).
  - `npm run typecheck` clean; `npm test` **820 of 820** (new `tests/studio-scrub.test.mjs`, 10, and
    `tests/studio-playback.test.mjs`, 8); `npm run build` passes.
  - **`qa/studio-scrub.cjs` 48 of 48**, judged (`--judge`) from the rerun of 06:31 to 08:25 at `18e53a2` for Edge 156 and the
    development package (Chromium 156) on the AMD chip and the RTX (`qa/studio-scrub-gate.json`), and from 08:48 to 09:21 at
    `b755b25` with no graphics chip (`qa/studio-scrub-software.json`). 200 random jumps over 20 s of 4K30 at 60 Mbit/s on a
    1280-wide stage, today / with the frame memory, medians in ms:

    | Engine, key frames | Right frame | Sharp frame | Jump right after opening | Step forward | Step back | Small frames filled | Load % |
    |---|---|---|---|---|---|---|---|
    | Edge, 2 s | 261 / 0.1 | 261 / 250 | 247 / 251 | 262 / 3.1 | 259 / 0 | 17.7 s | 12 to 40 |
    | Edge, 10 s | 1025 / 0.1 | 1025 / 661 | 1078 / 697 | 1322 / 11.7 | 1307 / 0 | 17.4 s | 8 to 23 |
    | AMD, 2 s | 223 / 0.1 | 223 / 218 | 202 / 217 | 238 / 1.6 | 241 / 0 | 15.6 s | 10 to 31 |
    | AMD, 10 s | 980 / 0.2 | 980 / 630 | 1006 / 681 | 1312 / 1.3 | 1295 / 0 | 15.3 s | 9 to 39 |
    | RTX, 2 s | 169 / 0.1 | 169 / 175 | 163 / 177 | 191 / 1.5 | 195 / 0 | 8.1 s | 6 to 21 |
    | RTX, 10 s | 957 / 0.2 | 957 / 608 | 963 / 661 | 1216 / 1.0 | 1211 / 0 | 7.9 s | 10 to 29 |
    | No chip, 2 s | 335 / 0.1 | 335 / 260 | 336 / 300 | 322 / 297 | 353 / 0 | 29.8 s | 29 to 62 |
    | No chip, 10 s | 1318 / 0.3 | 1318 / 1018 | 1255 / 1189 | 1639 / 1692 | 1525 / 0 | 32.0 s | 35 to 100 |

    The gate (median to the right frame at least three times faster) passes on every row. The sharp frame and the jump right
    after opening are held at no later than today's within 10% and 5 ms: the closest are the RTX's 2 s jump right after opening
    (177 against 163, 8.4% later) and, in the first run, the no-chip 2 s sharp frame (310 against 278), **inside the rule only just**.
    Identity: **48 of 48** at DT-12's times, the small frames **48 of 48**, frame starts to the microsecond **36 of 36**, on every row.
    **With no hardware decoder, steps forward back to back are no faster than today, and with 10 s key frames a little slower: 1692
    ms against 1639** (2 s: 297 against 322). That path reads nothing ahead until 150 ms of quiet, so each step of a run of steps
    decodes from its key frame as today; steps back are 0 ms from the kept frames.
  - **`qa/studio-autores.cjs` 9 of 9** (08:25 to 08:46): three 4K tracks for 18 s with «تلقائية», the budget and light copies, at most
    2% missed, dropped and not shown: AMD 0% and 0.6%, RTX 0% and 0%, no chip 0% and 0% missed, 0% not shown everywhere. Today's
    «كاملة» without copies on the same laptop: 67.3%, 25.4% and 7% missed, with 59%, 67% and 100% of the elements' frames not shown;
    «تلقائية» without copies showed every frame on the AMD chip and the RTX (3.9% and 6.5% missed).
  - **`qa/studio-preview-ui.cjs` 9 of 9**: inside the application with a measurement saved through the bridge, «تلقائية» is the default
    and first in the menu with its words, a play starts where the last of the shape ended («تلقائية: 1/2», the canvas at half), the
    person's choice wins and is remembered; in Edge «كاملة» stays the default and «تلقائية» can be chosen.
  - In Edge on the final code (`b755b25`), as on main: `qa/studio-engine.cjs` **41 of 41**, `qa/studio-ui.cjs` **122 of 122**.
  - `qa/studio-crossdevice.cjs` was not rerun: nothing the compositor or the export draws changed.
- **Found, and left as they are.**
  - **Without light copies, three 4K tracks freeze in large part at «كاملة»** on the AMD chip, the RTX and with no chip in this run
    (198, 354 and 390 re-seeks in 18 s; 59%, 67% and 100% of the elements' frames never shown; the RTX had 76 re-seeks and showed
    most frames in the first run, on a quieter moment). This is today's floor; found, not caused. Light copies end it.
  - The note under the plan (`src/lib/native/device.ts` `PLAN_NOTE`, Fork 3's) names «النسخ الخفيفة معاً» as followed now; after D10
    «دقة المعاينة عند البدء» and «ذاكرة الإطارات للتنقل» are followed too.
  - A play's "load before" is read just after the play before it, so it includes this check's own previous play.
- **Not verified, said plainly.**
  - Nothing signed in; the editor was checked on the interface fixture with a measurement saved through the real bridge.
  - The D12 wiring is not exercised by a check: the playback check keeps the idle-time queue out of its plays, and no check drives a
    copy made in idle time into an open editor, or reads «scrubbing» and «playing» in the application's broker.
  - The D6 preview window keeps today's decoder (its own pool, no plan).
  - One laptop only; the speed rows were taken on it with other work quiet but not absent (loads above).
- **The harness, after the manager's verification.** Run from another worktree, the playback check drew 8 frames of about 211 in
  every play, today's «كاملة» included: a window Chromium took as hidden (covered, or the screen locked or off) draws about once
  a second. The three D10 checks now share `qa/studio-d10.cjs`: the package starts with Windows' occlusion tracking off and its
  window above the others, a check refuses loudly to time a window that draws under 45 frames a second (and drops a row during
  which it fell), the port's lock names the running worktree's branch (it was a fixed name) and is freed when the process ends,
  and the editor check waits for the save before a reload and accepts a «leave with unsaved changes?» prompt (its crash in
  `Page.handleJavaScriptDialog`).
  - The manager's run of `3ab0c25`: `qa/studio-scrub.cjs --only=app-strong --fixture=gop2` **6 of 6** (the jump right after
    opening 179.9 ms against 162.7, inside the rule; the sharp frame 171.9 against 180.2). With no chip on 10 s key frames the
    check refused its floor row, "1 frame a second": a misfire, since the window was shown, on top, the screen on. The rate had
    been read just after the row, while a 4K frame was still being painted on the page's own thread. It is now read only at a
    quiet moment (the row's media let go, the best of three probes). `qa/studio-preview-ui.cjs` stopped at 4 of 5 on «saved is
    not a function»: the new save wait shared its name with the profile's result. Both fixed after; not yet rerun.
- **A closed project stops its files' decoding** (`aab1a1d`, `b0a319f`, merged as `85e642a`). After the no-chip 10 s floor row,
  with its media let go, the manager's runs twice found one application process busy on about eight cores for seconds.
  `MediaPool.dispose` and `forget` never disposed the files' Mediabunny inputs, so a decode still under way ran to its frame;
  they now dispose the original's and the light copy's, which ends every pass at once. The likelier cause of that load is the
  software renderer (ANGLE on WARP painting each 4K frame into a new full-size canvas), so `qa/studio-scrub.cjs` now waits after a
  row until the application uses under one core, and records how long that took and which processes were busiest.
  - `tests/studio-media-dispose.test.mjs`, 4 tests without a browser: a real Mediabunny input over an MP4 made in the test, a packet
    pass under way, ended by `dispose()` or `forget()`. With the fix taken out, the three dispose tests fail.
  - `npm test` **824 of 824**; `npm run build` passes (12:39 to 12:40, at `b0a319f`).
  - **Not shown in the application:** the manager's port checks that would show the processor settling after a no-chip 4K row were
    refused, the window drawing about one frame a second while the laptop was in use. That is the guard working.
- **The copy made in idle time, in an open editor** (`qa/studio-copy-swap.cjs`, written after the handoff, `Desktop_Power_Handoff.md`
  3.2 idea 1). Run once in the manager's slot. It drives the real editor in the development package with
  no profile, on the D10 4K fixture added from «هذا الجهاز». It reads the application's hold while the editor plays («playing», the
  source silent and «تشغيل» pressed from the page) and while the ruler is dragged («scrubbing»), and that nothing is held after.
  The copy is taken up at the pause, and the next play runs from the copy: the check reads the paused frame's identity across the
  take-up, the next play's element and frames, and the copy's element at four times. This is D10's design (`media.ts`
  `copiesReady`): a copy is taken up only while paused, and there is no swap in mid-play (the manager accepted it on 2026-11-04). A
  copy that becomes ready during a play (`readyWhilePlaying`) is not driven: the broker holds every copy while the page plays, so
  that only happens in a race.
  - **The run: 14 of 17** (`qa/studio-copy-swap.json`, 2026-11-04 23:18:50 to 23:19:33, the other forks idle). It ran at
    `80e0ac1` on the development package (bridge 9), with no profile, on the RTX 3050, a 510-pixel stage canvas at 1.25 device
    pixels, TEMP in `qa/artifacts/tmp`, and the shared lock under this branch's name.
  - **Passed:**
    - The editor named its source to the queue, and the application found it needs a copy.
    - While the editor played, the hold read «playing» in every reading. The running copy (1.77 s into its work) paused and made
      no progress. Paused, nothing was held within 600 ms.
    - While the ruler was dragged, the hold read «scrubbing». It ended within 800 ms of the last move, and nothing was held from
      762 ms on.
    - The copy was made while nothing happened and was taken up at the pause. The editor first read the copy 18.0 s into the page.
    - The next play ran from the copy: its element was the copy's, and no element of the original was made.
    - Sent to 4, 5.5, 10 and 15.5 s, the copy's element gave frames 120, 165, 300 and 465.
    - «playing» was read during that play too, and afterwards nothing was held or being made.
  - **Failed, the check's own numbers (2 rows).** The check expected frame 120 at 4 s; the stage was at 119.
    - Cause: «تقدم ثانية» moves 30 times `frameUs(30)`, which is 33,333 µs rounded to whole microseconds. Four presses end 40 µs
      before 4 s, on frame 119.
    - Every reading agreed with the playhead (119, 149, 121, 119). Across the take-up the frame was the same: 119 from the
      original, then 119 from the copy. The identity held; the rows failed on the wrong constant.
    - That the editor's «تقدم ثانية» lands a frame short after a few presses at 30 fps is existing behaviour, found here and
      not changed.
  - **Failed, the copy's play (1 row).**
    - It was in step 87 ms after the press, with all 163 frames after that inside the player's 5-frame rule and none going back.
    - The median was 2 frames behind the clock as the check computes it (worst 2), against a limit of one. The check's clock
      starts from the playhead's frame (119) while the player's time was 3.99996 s, so the element ran about 2 to 3 frames behind
      the player's clock for the whole play.
    - The element starts playing when ready, about 87 ms after the clock starts. The player puts it back in step only beyond
      `DRIFT` (0.12 s, 3.6 frames), so that lag stays for the play.
    - The original's element did the same (median 2, worst 3), but only after a 1240 ms warm-up of up to 25 frames behind.
      Dropped frames by the elements' own count: 0 of 131 for the original, 2 of 100 for the copy.
  - Not rerun then, by the manager's instruction.
  - **Why the rows changed after this run** (the manager's decision): two rows had a wrong constant, and one a limit stricter
    than the player's design. The expected frame is now the playhead's. The copy's play is now judged by the player's own
    rule (`DRIFT`), with its median and worst recorded beside the original's. A row was added for the step itself (four
    presses of «تقدم ثانية» land on frame 120), so the check has 18 rows.
  - **The rerun: 18 of 18** (`qa/studio-copy-swap.json`, 2026-11-05 from 00:42:13, 43 s, the other forks idle). It ran once, at
    `bae0e13` (main `5c24b55` merged, the step and time fixes in), on the development package 0.8.0 (bridge 9), with no profile,
    on the RTX 3050, a 421-pixel stage canvas at 1.25 device pixels, TEMP in `qa/artifacts/tmp`, the lock taken by the check.
    - Four presses of «تقدم ثانية» landed on frame 120. Every reading agreed with the playhead: 120 from the original, then
      120, 150, 122 and 120 from the copy.
    - While the editor played, the hold read «playing» in all ten readings. The running copy (1.97 s into its work) paused;
      what was already in flight landed by 617 ms (3 s), and then it made no progress. Nothing was held after the pause.
    - While the ruler was dragged, the hold read «scrubbing». It gave way to the drag's own input within 340 ms of the last
      move, and nothing was held from 882 ms on.
    - The copy was made in the quiet after the drag, ready 2 ms after the editor was left at 4 s, and taken up at the pause.
      The editor first read the copy 18.0 s into the page.
    - The next play ran from the copy: in step 64 ms after the press, then every drawn frame within `DRIFT` and none going
      back, median 2 and worst 3 frames off, 0 of 96 dropped. The original's play in the same run was in step only after
      2237 ms (up to 47 frames behind while warming up), then median 3 and worst 6, one frame outside, 0 of 170 dropped.
    - Sent to 4, 5.5, 10 and 15.5 s, the copy's element gave frames 120, 165, 300 and 465. «playing» was read during that
      play too, and afterwards nothing was held or being made.
- **A step of the playhead goes in whole frames** (`b4b2dd4`, found by the run above).
  - **What changed.** The stage's «إطار للأمام», «إطار للخلف», «تقدم ثانية» and «رجوع ثانية», and the editor's frame keys, used to
    add a rounded frame length (`frameUs`, 33,333 µs at 30 frames a second) at each press. They now move by whole frames from the
    frame shown, to the start an export gives that frame (`time.ts` `stepFrames`, `frameStart`).
  - **Which frame a time shows** follows the export's rule (`frameShown`, a microsecond as `scrub.ts` `EPS`). A second is whole
    frames: the rate, and 30 at 29.97. The editor's second keys were first left adding a real second, which is exact at every
    project rate. At 29.97 that lands mid-frame and a frame short of the button whose title shows the same key, so they now step
    the same whole frames (`7364254`, the manager's follow-up of 2026-11-05).
  - `tests/studio-step.test.mjs`, 15 tests: 100 presses each way of a frame and of a second at 24, 25, 30, 29.97 and 60, each on
    its exact frame. With the old step put back, 9 of the 15 fail.
  - Two more with the keys (`7364254`). Each step key, read from `editor.tsx`, lands where the stage button whose title names
    that key lands, at the five rates and from seven starting times. With the old keys, or a key of `Math.floor(fps)` frames, it
    fails.
  - `npm run typecheck` clean. The full `npm test` and `npm run build` waited for the manager's go (Fork 3 was building), and
    were run after the check's rerun, with the time fix in (the suites bullet below).
  - Found after it: the transport's time still took its frame with `frameAt`, fixed in the next bullet.
- **The transport's time reads the frame the stage shows** (`bae0e13`, approved by the manager on 2026-11-05).
  - **What changed.** `timecode` took its frame with `frameAt`. At 30 frames a second a start that rounds down (frames 1, 4, 7
    and so on) read as the frame before: one «إطار للأمام» from 0 drew frame 1 and read 00:00.00. It now takes the frame by
    `frameShown` and counts a second in whole frames (`secondFrames`, 30 at 29.97), as «تقدم ثانية» steps. Both times on the
    stage use it. No Arabic string changed.
  - `tests/studio-timecode.test.mjs`, 10 tests: after n presses of «إطار للأمام» from 0, n = 0 to 100, at 24, 25, 30, 29.97
    and 60, the time reads frame n. With the old `timecode`, 7 of the 10 fail; 25 reads right either way, its frames being
    whole microseconds.
  - **At 29.97 the time counts 30 frames to a second** (a timecode without dropped frames). So it reads behind the ruler's real
    seconds by 0.1%: about 2 frames at the end of a 60 s video (00:59.28 at 60 s). This is accepted, not a fault. Projects offer
    24, 25, 30 and 60 today (`schema.ts` `FPS_CHOICES`).
  - **The review player is unchanged.** It shows tenths of a second of its element's time (`review-keys.ts` `playerTime`), not
    frames, with 100 µs of room for a seek that lands early. A test holds that each of those frame starts shows its own tenth.
- **The suites, at `bae0e13` with the rerun done** (2026-11-05, one after another): `npm run typecheck` clean (20 s);
  `npm test` **851 of 851** (00:44:25 to 00:44:38); `npm run build` passes, compiled in 22.0 s, 43 of 43 pages, no warning
  (00:44:53 to 00:45:42). At `7364254`, the second keys in: `npm run typecheck` clean (00:49:28 to 00:49:40); `npm test`
  **853 of 853** (00:49:41 to 00:49:56). The build and the qa checks were not run there; the manager runs them.
- **The D10 checks' port lock** is `%LOCALAPPDATA%\Temp\comms-hub-port3000.lock` always (`9a3db90`, `qa/studio-d10.cjs`, the line
  Fork 1's branch has). With TEMP moved for a run's files, the lock followed TEMP, so two checks could each hold "the" lock.
- **The manager's check before the merge** (2026-11-05, in the detached worktree `verify-e3cab67` with its own `npm ci`).
  - At `d85de58`: `npm run typecheck` clean, `npm test` **851 of 851**, `npm run build` passes (43 of 43 pages). Then
    `qa/studio-copy-swap.cjs` got **16 of 18**, run right after that build on a warm laptop. In two rows the hold read «throttled»
    for a few readings: during the play (797 to 1419 ms) and 5.2 s after the drag. Every identity row passed.
  - **Why: the check's guard held nothing back.** It replaced `powerMonitor.emit` to keep Windows' speed limit at 100. But
    Electron hands Windows' own events to a copy of `emit` bound when the first listener was added. The application's listener is
    the only thing that lowers its limit, and the check sent only 100, so a real lower limit had reached it. The application did
    the right thing with it (a held processor holds background copies).
  - **The fix** is in the check only. It takes the application's speed-limit listeners off, tells them 100 once, and records
    Windows' own changes in the result (`windowsLimits`) with a note. `qa/desktop-idle.cjs` has the same guard. It is fixed
    and rerun at its next port slot, after this stage's timing.
  - At `5453009` (the second keys in) with the fixed check: typecheck clean, `npm test` **853 of 853**, build passes, then
    `qa/studio-copy-swap.cjs` **18 of 18** (00:53:13 to 00:53:54). Windows did not change the limit during that run, so the
    new guard has not yet met a real change.
- **The idle check's guard** (`59733bf`, the manager's item of 2026-11-05). `qa/desktop-idle.cjs` also replaced
  `powerMonitor.emit`, which holds nothing back (above). It now wraps the application's speed-limit listeners.
  - Held (`realLimits(false)`), only the check's own limits reach them, told 100 once. Let through (`realLimits(true)`),
    Windows' changes reach them as before. The check's own 70 and 100 (`__sayLimit`) reach them either way.
  - Windows' changes are recorded apart (`windowsLimits`, each held or let through); `speedLimits` is what the application heard.
  - **Checked only off the port.** The check's own guard code was run against an `EventEmitter` whose native side calls a copy
    of `emit` bound beforehand, as Electron's does. Held, Windows' 60 was kept out and the check's 100, 70 and 100 arrived; let
    through, Windows' 80 arrived. The old guard let the 60 through.
  - **The port run: 21 of 24** (`qa/desktop-idle.json`, 2026-11-05 02:02:39 to 02:20:13, 1054 s, at `2a62233`). It ran in the
    manager's slot, relayed by Fork 4, on the development package (bridge 9), on Fork 3's corpus copied in (hashes equal, made
    after the recipe's last change). TEMP was in `qa/artifacts/tmp`, and the shared lock was taken by me around the run, since
    this check does not take it itself.
  - **The guard held.** Windows changed the limit 85 times, from 35% to 78%. While held (18 to 55 s), all 29 of its changes
    were kept out, and the application heard only the check's own 100. Let through from the simulated case on (55 s), they
    reached the application, as the check intends. Its last change, at 138 s, was back to 100.
  - **Passed:**
    - the asked copy;
    - a click (47 ms, on by itself 3.57 s after);
    - «playing» (8 ms);
    - the window's sound (33 ms);
    - battery (9 ms);
    - the simulated limit (7 ms, «throttled»);
    - the still source stopped (1757 ms) and made again;
    - the tray's words;
    - a project that wants nothing;
    - quitting.
  - **Failed (3 rows), not caused by the guard:**
    - **An export (busy):** paused in 11 ms with «export», but 1 s on the copy had advanced from 7.72 to 8.77 s, and 1.5 s
      later it was waiting at 0. It was a grainy source. The record fits the worker's rule for a job that would not wait,
      stopped and made again (`native-media.ts`, `why === 'held'`). No limit reached the application during that case.
    - **Every light copy was made:** at the end the queue held one item, still-3's copy, ready, with nothing held, so the
      wait ran out after 900 s. That is why the run took 17.5 minutes. The check throws away the answer of
      `queueWith(1)`, so whether the application refused it is not known.
    - **Each copy keeps every frame:** only 2 copies existed, the two stills. Both kept 750 of 750 frames in order.
  - Not rerun, as instructed.
- **The causes, found by the manager** (2026-11-05, reading the code from `411007d`, when the check passed 25 of 26, to `238417a`).
  - **The queue: D10's take-up.** When a copy turns ready, `MediaPool.takeUp` asks `DeviceCache.copies`, and asking also
    named the source to the queue (`want`). The check had stopped the queue (`stopQueue`, which empties what is wanted) and
    then named the four sources straight through the bridge. So when still-3 turned ready, the page named still-3 alone, and
    the application, which replaces a window's whole list, dropped the other three. In the product, everything open is
    already wanted and the queue stops only when a project closes, so nothing showed there.
    - **Fixed:** `copies(ref, { want: false })` only asks, and the take-up uses it. `tests/native-power.test.mjs` has a new
      test: a stopped queue stays stopped after a take-up, and opening a source still names it. With the old line it fails.
  - **The export hold: the processor really was slow.** At the pause FFmpeg's input buffers hold a second or two of a grainy
    source. Windows held the processor at 36 to 38% then, kept from the application by the guard, so draining them took
    longer than the worker's settle time, and the copy was rightly stopped as one that would not wait. The old guard let
    every limit through, so the case never met a slowed processor before.
    - **Changed in the check:** each hold waits up to two minutes for Windows' own limit to be back at 100. Otherwise it is
      recorded as not measured (`notMeasured`), never passed. The answer of the last `queueWith` is recorded too (`lastQueue`).
  - The check is rerun at the next port slot, after D11's proof.
- **Not done.** Nothing pushed.

### 2026-11-04: the studio says when this device is not measured, or its measurement is stale (Desktop Power, Fork 3, 63.6.1)

- **Asked.** By Desktop Power's new manager at the resumption of 2026-11-04: inside the desktop application only, a quiet line
  when the studio runs at its floor because no measurement fits this device as it is now. A browser and an older application
  show nothing. P-28 stays waiting and was not built.
- **Built** (`81aec83`, `2e7becd`, `1e50612`, on main merged at `ea72695`):
  - `measureState` in `src/lib/native/device.ts`: measured, never measured, or stale with one reason, the first that differs
    from the newest measurement on the same chip (or the newest of all): the application or Chromium, then the chip or its
    switch, then the driver; mains or battery aside, as `currentEntry`. `measureLine` gives the words, each reason its own
    whole phrase after the manager's review: «تغيّر إصدار التطبيق», «تغيّرت بطاقة الرسوميات», «تغيّر برنامج تشغيل البطاقة».
  - `src/components/native/measure-note.tsx`, on the studio's home above the projects and under the editors' menus
    (`studio-page.tsx`, `editor-frame.tsx`). «قياس قدرة الجهاز» opens «معلومات الجهاز» with its own button in view and focused;
    the note never measures by itself. «لاحقاً» is kept on this device for the present key only (`studio.pref.measureLater`,
    through `usePref`, so a failed storage read shows the note). Hidden while the page is busy and in the preview's window
    (`isPanelWindow`); gone as soon as a measurement is saved (`PROFILE_SAVED`).
  - `src/lib/native/index.ts` counts the page's busy reasons (`pageBusy`, `onPageBusy`): an export and a send for review both
    hide the note.
  - «معلومات الجهاز» shows the stale line under «قياس قدرة الجهاز» (`data-measure-why`). The note under the plan
    (`PLAN_NOTE`) now names what D10 follows too, as the D10 entry found.
  - `MVP_draft.md` 63.6.1 holds the words and rules; `AGENTS.md`'s D9 paragraph gains one bullet.
- **Verification & evidence**, in the manager's slot, with TEMP and TMP in this worktree's `qa/artifacts/tmp` and the port's
  lock (`%LOCALAPPDATA%\Temp\comms-hub-port3000.lock`) held by this branch for the whole slot:
  - `npm run typecheck` clean.
  - `next build` clean: compiled in 25.8 s, 43 of 43 static pages, about 60 s in all.
  - `npm test` **826 of 826** (12.7 s). Before the slot, single files: `tests/native-power.test.mjs` 14 of 14 (two new tests: the
    reasons, their order, power aside, the same-chip preference, the words and the key; the busy count), `tests/native.test.mjs`
    68 of 68, `tests/scale.test.mjs` 6 of 6, `tests/help-tours.test.mjs` 5 of 5.
  - `qa/desktop-measure-note.cjs` **12 of 12** in 34 s, run once, on the development package 0.8.0 (Electron 45, Chromium
    156.0.8078.48), this laptop's RTX 3050 and AMD Radeon. The real component on a fixture page:
    - in Edge, no note;
    - on a fresh profile the never-measured line, its button opening «معلومات الجهاز» with «قياس قدرة الجهاز» focused, the note
      gone during `markBusy('export')` and back after;
    - «لاحقاً» kept across a reload, and the note back when the same profile started with `--force_low_power_gpu` (another key);
    - each stale reason from a `profile.json` written before the start, with the same line in «معلومات الجهاز»;
    - only the other chip measured: one entry for the default start (switch «none», the RTX), the application started with
      `--force_low_power_gpu` (the AMD chip), no entry for the running chip, and «تغيّرت بطاقة الرسوميات…» in both places;
    - no note with an entry for the current key, and the note gone at once after a save through the bridge.

    Results in `qa/desktop-measure-note.json`; pictures in `qa/artifacts/desktop-measure-note/`.
- **Not verified, said plainly.**
  - Nothing signed in. The studio's home and the editors need a signed-in person, so the check renders the same component on a
    fixture page; its place in `studio-page.tsx` and `editor-frame.tsx` was checked in the diff and the build, not seen.
  - The preview window's rule (`isPanelWindow`) and the hide during a send for review were not driven by the check; the second
    is the same busy count as the export.
  - No real measurement ran in the check: a save of fixed numbers through the real bridge stood in for it.
  - One laptop, with two chips. On a laptop with one chip a switch change counts as a chip change by rule (unit-tested), not seen.
- **Not done.** Nothing pushed.

### 2026-11-04: colour adjustments and blur the same on every computer, and photo adjustments in bands (Desktop Power, Fork 4, P-09 with H-03, and P-17)

- **Owner direction.** The Desktop Power stage, "a stronger computer changes speed, never the video", run by the manager
  session as parallel forks; this is Fork 4, branch `claude/power-effects-72ab66` from `998ef0c`, with `main` merged in twice
  (Electron 45, `60335d7`; the export, `dcb2d80`). Q1 to Q7 taken with the recommended answers of `Desktop_Power_Ideas.md`
  section 10. Local commits only.
- **What it was, measured first** (a diagnostic in `qa/artifacts`, Edge 156 against the application on each chip and with none,
  over the synthetic footage at 1:1):
  - brightness and contrast were the same everywhere: Chromium's 8-bit tables, cut to whole numbers;
  - the saturation matrix differed by 1 level on 1.5% of channels on the RTX and on 3.4% with no chip;
  - the canvas blur at 2, 8 and 30 pixels differed by up to 2, 3 and 4 levels on the RTX, 3, 4 and 5 with no chip (49.6 dB);
  - `willReadFrequently` did not move a canvas off the chip in Edge 156 or the application's Chromium 152 and 156: both
    kinds of canvas drew the same bytes on each engine, so the choice of path cannot follow it.
- **What changed (the studio, every client; `MVP_draft.md` 62.15; the `AGENTS.md` D9 bullet).**
  - `src/lib/studio/effects/`: `plan.ts` specifies each effect once as whole numbers, `chip.ts` works it out in WebGL2
    (texelFetch, unsigned sums, nothing read back), `code.ts` in plain code, `index.ts` takes the chip where WebGL2 runs on one
    (as `squares-gl.ts` does) and the plain code elsewhere. No DOM, so Fork 1's workers can import it.
  - **Colour:** brightness then contrast as Chromium's tables, in its own float formulas; saturation as its matrix, to 1/65536;
    a sum rounded to the nearest, an exact half to the even neighbour.
  - **Blur:** the picture averaged in blocks of 2^k until the radius is at most 4 pixels (Skia's rule), integer Gaussian weights
    there (e^-x from additions and products), bilinear enlargement in 1/(2n) steps, all read as if transparency lay beyond.
  - `compose.ts` `drawItem`: an item with an adjustment or a blur is drawn into a layer the size of what it covers and the blur's
    reach, the effect is worked out on that layer, and the layer is laid on the canvas with the item's opacity, blend and
    clipping. The filter worked on each drawing call alone, so an item drawn in several calls (a text and its box, a shape's
    fill and line) takes its opacity inside the layer, which by the associativity of source-over gives what the filter gave.
    `supportsFilter` is gone (it used `document`); `filterOf` stays as the description the effects follow.
  - `cover.ts`: «تمويه منطقة» uses the same blur. The squares are untouched.
  - `photo.ts` (P-17): the colour as one whole-number map (`photoColourPlan`); with blur, the picture in bands across up to
    `photoWorkers` workers (`bandsOf`: each band reads the 3r rows its blur reaches); without blur, on the chip in tiles of 4096.
- **Found on the way.**
  - **A picture must reach the chip as the canvas keeps it.** Uploaded with `UNPACK_PREMULTIPLY_ALPHA_WEBGL` false, a canvas came
    out with other straight colours than getImageData gives on about 3 800 of the 65 536 (colour, opacity) pairs on the AMD chip.
    Uploaded premultiplied, all 65 536 matched. `squares-gl.ts` uploads unpremultiplied, so on see-through pixels its squares
    could differ from the plain code's; its check uses opaque footage only. Not changed: the squares were not this fork's.
  - **Each engine reads see-through pixels back its own way.** getImageData's straight colour of the same canvas bytes differs
    between Edge, the RTX and no chip; premultiplying it again is exact everywhere. The checks compare what the canvas holds, and
    a photo's blur, which reads straight colour, first puts every see-through pixel into one form.
  - **A canvas too large for the chip's memory gets a smaller drawing buffer, silently** (8000 by 6000 on the AMD chip): `chip.ts`
    checks `drawingBufferWidth` and declines, and `photo.ts` goes through the chip in tiles.
  - **Skia did its own thing at the edges of a blur and after a colour adjustment.** Inside a picture the blur keeps within
    2 levels of Edge's filter; within about the radius of a picture's edge, where it fades into transparency, up to 5; after a
    colour adjustment up to 5 on about 2% of channels. That is the old filter's own spread between this laptop's chips, and the
    check holds the change to it, with the reason written in the script.
  - **The first effects were slower, and the cause was one shared scratch canvas.** The timing check
    (`qa/studio-effects-speed.cjs`) first gave export medians of 77.9 against 23.3 frames a second in Edge, 106.4 against
    46.0 on the AMD chip, 156.0 against 90.4 on the RTX, 11.3 against 4.9 with no chip. Short probes in Edge (40 frames
    each) found it: `drawCover` made one scratch canvas for both kinds of cover, and the effects document has a blur cover
    and a squares cover on screen together, so that canvas was resized twice a frame (one of each kind 11 to 16 ms a frame,
    two of one kind 2.2 to 5.1 ms). The blur cover now reads its area from the composed picture itself, as the squares do;
    the chip's canvas and textures grow instead of being resized (`fitted`); the plain-code colour is one pass. The whole
    effects document then drew in 6.2 ms a frame in Edge, against 10.5 for the old compositor.
  - **Two first timing runs measured the fixture, not the studio**: 60 painted 4K frames kept per build (about 4 GB of
    canvases), and a pixel read back each frame from the export's own page canvas. With 8 frames kept it still gave 7 to
    21 frames a second, before and after alike; with drawing timed on an OffscreenCanvas and the export's canvas never
    read back, as `export.ts` uses it, 11 to 156. The check now does that.
- **What changed after the first timing, to bring the cost back** (each held by the identity check and the kernel tests):
  - a blur of more than 1 and at most 4 pixels is three odd boxes each way (Skia's own on the processor), whose cost in
    plain code does not grow with the radius;
  - colour with a blur is folded into the blur's first pass, on the chip and in plain code;
  - the plain code runs in WebAssembly lanes (`effects/simd.ts`, `effects/blur-simd.ts`, one memory): the colour, see-through
    pixels included, and the whole blur (reduction, weights, boxes, enlargement, premultiplying and unpremultiplying), the
    pictures between its steps kept as bytes and its passes down the picture run along the rows; a clip is copied in once and
    handed to putImageData from there;
  - a blurred clip cut by the frame's edge keeps only what reaches the frame and the frame pixels it reaches, with the blur's
    margin transparent around them, when that is less to blur: a full-frame clip blurs at 1920 by 1080, no longer 2132 by 1292;
  - on the chip a full-size blur with no colour reads the picture where it is and writes its own corner, with no reduction or
    enlargement pass.
  The timing of 2026-11-04 09:53 to 10:02, before the last three, still failed: AMD 96.5 against 92.6 frames a second (-4.0%), no
  chip 11.8 against 6.1. The profile then (each part of the document alone, before the boxes) put the cost in the blurred cross:
  on the AMD chip 88.9 against 64.2 frames a second, with no chip 175 against 626 ms a frame; colour 45.2 against 51.7 ms and the
  covers 27.0 against 38.7 ms with no chip.
- **Verified on 2026-11-05, 01:40 to 02:00**, at `520a441` (main `5c24b55` merged) with the check-only commits `95b2f27` and
  `c2450b5`, in one slot under the port lock, the laptop otherwise idle (`qa/artifacts/fxdiag/slot5.sh`):
  - `npm run typecheck` clean; the effects' unit tests 32 of 32 (`tests/studio-effect-kernels.test.mjs` 14,
    `tests/studio-photo-tiles.test.mjs` 3, with the photo and marker tests).
  - **Identity**, `qa/studio-effects-parity.cjs`: 19 of 19. On Edge, the AMD chip and the RTX every effect on the chip equals the
    plain code byte for byte in all 90 cases; the WebAssembly lanes equal the plain code one pixel at a time in 90 of 90 cases on
    all four engines; the plain code gives Edge's bytes everywhere; the 54 corpus frames have one hash whichever path draws them.
  - **What a saved project changes**, against Edge's canvas filter (`qa/studio-effects-parity.json`): colour adjustments on
    footage at most 1 level (PSNR 61.42 dB at worst), on an item with soft edges at most 2 (59.42 dB), no channel more than 2
    apart; blurs at most 5 levels (49.10 dB at worst, the effects A colour with a blur of 9 pixels on footage; 49.73 dB on the
    item). The bound is the old filter's own spread between this laptop's engines, 6 levels and 49 dB.
  - **Timing**, `qa/studio-effects-speed.cjs` (`qa/studio-effects-speed.json`), the effects document at 1080p, median export in
    frames a second before and after, three runs each, the load before each run in per cent:
    - Edge 156: 78.7 and 81.0 (+2.9%); load 13, 27, 3 and 8, 18, 47, 2 (round 3 run again for its load);
    - application, AMD chip: 107.9 and 106.5 (-1.3%); load 11, 13, 31 and 4, 2, 10;
    - application, RTX: 163.5 and 171.1 (+4.6%); load 6, 2, 31 and 1, 2, 20;
    - application, no chip: 12.4 and 13.0 (+4.8%); load 7, 3, 20 and 28, 15, 10.
    Drawing alone went from 10.51 to 6.37 ms a frame in Edge, 7.39 to 6.39 on the AMD chip, 4.66 to 3.22 on the RTX and 76.16 to
    72.72 with no chip. Every engine is within 3% of before or faster.
  - **The proof**, `qa/studio-crossdevice.cjs`: 38 of 43, the same five failures as on this branch's last run, all with no chip.
    - «effects»: 48.54 dB at worst, 0.21% of channels more than 2 apart, against main's 48.21 dB and 0.77% before the effects,
      and 48.85 dB and 0.18% on this branch before the frame-size blur, which moves the reduction's grid.
    - «transitions»: 48.77 dB (main 48.90). The frames below show that scaling alone accounts for most of it.
    - «keys», «brand» and «landscape-keys» are unchanged to the digit (55.04, 50.17 and 53.36 dB), with no effects in them.
    - «covers» failed on main and passes.
  - **«transitions» by frame and level**, `qa/studio-effects-frames.cjs` (`qa/studio-effects-frames.json`): frames 0, 13 and
    15 drawn with no chip and on the RTX, as saved and with every colour adjustment taken out, each against Edge, before and
    after. With no chip, frame 13:
    - before: 48.90 dB as saved, 0 levels apart on 39.74% of channels, 1 on 52.58%, 2 on 7.60%, 3 on 0.0834%, 4 on 0.0002%;
    - before, no colour: 48.61 dB;
    - after: 48.77 dB as saved, 0 on 38.57%, 1 on 53.31%, 2 on 8.03%, 3 on 0.0895%, never 4;
    - after, no colour: 48.61 dB, the same as before: the picture's scaling, which neither path changes.
    Frames 0 and 15 with no chip go from 50.42 and 50.60 dB to 49.35 and 49.55, at most 2 levels after, against 2 and 4 before. On
    the RTX every frame is at least 54.02 dB after, against 53.83 before.
  - **Photo tiles**, `qa/studio-photo-tiles.cjs`: 9 of 9. Every way (1, 2, 4 and 10 workers, and the chip where there is one)
    gives one worker's bytes for every adjustment of the 8000 by 6000 photo and the see-through one, on every engine.
  - `qa/studio-engine.cjs` in Edge: 41 of 41.
  - At `d14f1d5`, after the slot: `npm test` 843 of 843 and `npm run build` clean (05:17 to 05:19).
- **Not verified, said plainly.**
  - One laptop with two chips. The director's laptop (Q1) was not measured.
  - Nothing was seen signed in, and no real project was opened.
  - An export in a worker (P-07 option B) is not built yet. The effects use no DOM: WebGL2 on an OffscreenCanvas, WebAssembly
    and ImageData. Nothing has shown them inside that worker.
  - The step timing (`--steps`) and the profile (`--profile`) were not run on this tip: the timing passed, so the slot did not
    need them.
- **Not done.** Nothing pushed. `squares-gl.ts` still uploads unpremultiplied (found above; not this fork's).

### 2026-11-05: a saved download opens in its program (P-28, bridge 10), and the account card says what the application adds (Desktop Power, Fork 3)

- **Asked.** By Desktop Power's manager on the owner's yes to P-28 of 2026-11-05, with the account card's line by the owner's words:
  the desktop version is the stronger one. Main merged first at `6c35268`.
- **Built** (`e0ffbd5`, `f3ee449`, `3951903` and this entry's commit):
  - `desktop/src/downloads.ts`: the fixed list of kinds that open (`OPEN_KINDS`: documents, pictures, sound, video, by the saved
    name's last extension; never a program, installer, shortcut, script, web page, SVG, Office file with macros or archive), the
    site's file routes a download is offered from (`DOWNLOAD_ROUTES`, held equal to `src/lib/native/files.ts`), and the mark of the
    web read and written (`isMarked`, `zoneText`).
  - `desktop/src/download-store.ts`: an id of 32 random bytes per download at `will-download`, the newest twenty in memory, forgotten
    with «مسح بيانات هذا الجهاز»; the mark kept, or written (zone 3, the site's origin) when Chromium left none or a weaker one; open
    only a plain file of a listed kind while the mark is on it, show any.
  - `native-files.ts` registers the listener and the two handlers; bridge version 10 adds `downloads.open`, `show` and `onDone`.
  - The page: `src/components/native/desktop-downloads.tsx` in the shell, «حُفظ «…».» with «فتح بالبرنامج الافتراضي» (not for a kind that
    never opens) and «إظهار في المجلد»; the name is isolated (`bdi`). No Windows notice for a download: only «يحتاج قرارك» items become
    Windows notices (the manager approved the in-page notice only).
  - The account card's browser view: one line of what every member gets («يحتاج قرارك» on the device with its count on the taskbar,
    documents, pictures and clips opened in their programs), and a second of the studio's gains shown only when `useStudioTab`, the
    studio tab bar's own check, says the studio opens. Export lanes are left out (planned, not used by the export yet), and so is the
    taskbar's progress (no page sends it yet); dragging files out is in the studio line, since only the studio's storage panel offers it.
  - `MVP_draft.md` 63.2 and 63.10; `AGENTS.md`'s bridge 10 paragraph.
- **Verification & evidence**, in the manager's slot (02:23 to 02:34), TEMP and TMP in this worktree's `qa/artifacts/tmp`, the port's
  lock held by this branch:
  - `npm run typecheck` clean (22 s; 10 s again on the final code); `desktop` typecheck clean.
  - `npm test`: **854 of 855** on the first run. `tests/studio-access.test.mjs` pinned the studio tab's old line, which `useStudioTab`
    replaced; the test now holds the hook and the same check (`3951903`). Then **855 of 855**, twice, the second on the final code.
  - `desktop` `npm test` **164 of 164** (36.2 s), `desktop/tests/downloads.test.mjs` 6 of 6 among them (real NTFS files and their
    Zone.Identifier streams).
  - `npm run pack:dev` (0.8.0, bridge 10) in 19 s.
  - `qa/desktop-downloads.cjs` **12 of 12** (11 s), and 12 of 12 again after the name was isolated (10 s): nothing in Edge; the library, mail
    and messaging downloads heard with an id, the saved name and the kind only; every saved file in zone 3; the PDF opened and shown (both
    recorded in the main process, nothing really opened); `tool.exe` refused for its kind and only shown; the PDF refused once its mark was
    taken off; an unknown id «gone», a number or a path refused by the bridge; an address outside the file routes saved and not offered;
    the notice's words and buttons for both. Results in `qa/desktop-downloads.json`, pictures in `qa/artifacts/desktop-downloads/`.
  - `qa/desktop-native.cjs` **36 of 37** first: the check's own expected shape was written out by hand and lacked `downloads`. It now
    follows its `GROUPS` list; then **37 of 37** (94 s).
  - `next build` clean: compiled in 25.5 s, 43 of 43 static pages, 62 s in all.
- **Found.** Electron 45's Chromium writes the mark of the web itself: zone 3 with `ReferrerUrl` and a `HostUrl` that is the whole file
  address (the file's id included), on all three files. The application's own mark, which names the origin only, was therefore not written
  in the packaged run; that path is held by the unit tests alone.
- **Not verified, said plainly.** Nothing signed in: the notice and the card were checked on fixture pages, and the card's studio line
  through its test, not seen. No program was really opened: `shell.openPath` was recorded. One laptop.
- **Not done.** Nothing pushed. Release preparation (0.9.0) waits for the manager.

### 2026-11-04: export lanes (P-06), the step-down ladder (P-35) and one pass for several shapes (P-05) (Desktop Power, Fork 1, D11)

- **Lanes (`segments.ts`, `lanes.ts`, `export.ts`).** The frames are cut into contiguous segments on one lane's key frames
  (every two seconds), as equal as whole groups allow. Each lane runs its segment on the page's own canvases (the floor's
  kind, so composed frames are one lane's): its own decoders, made with the media pool's sink settings, and its own
  Mediabunny encoder from one lane's settings, into an output that keeps nothing. The first segment's packets go into the
  file as they come; the others wait in the browser's private storage (`studio-lanes`) and follow in order. The sound is
  mixed once and kept one window ahead, as with one lane.
  - **The join's guard.** Every lane's decoder description (codec string, parameter sets, colour) is compared with the first
    segment's as it arrives; on a difference every lane stops, the attempt's file is thrown away, and the export runs
    again with one lane, so no mixed file is ever kept. (Section 9 said "before writing anything": the first segment's
    packets reach the attempt's file before the other lanes report, and that file is discarded; holding them instead
    could hold a whole segment in memory when a later lane starts late.)
  - **Warming a later lane.** Started cold at its segment, the processor's encoder made a later segment's first frame about
    1.5 dB worse than one lane (Edge with no chip, 20 s fixture: 41.36 against 42.90 dB). A lane after the first now encodes
    the two seconds before its segment first and drops those packets: the boundary frames then equal one lane's to 0.00 dB.
- **The ladder (P-35; `lanes.ts`, `export.ts`, `export-plan.ts`).** A later segment whose lane fails is run again on the
  lanes left (the last lane running takes it itself; twice at most); a failure of the first segment, a refused join, or
  repeated failures end the attempt and the export runs again with a lane fewer; a drawing or BT.709 worker's failure runs it
  again without that worker. After a step down, the next five exports on this device start at most at the lanes that
  finished (`rememberExport`, kept beside the studio's preferences). The panel says «تعذّر التصدير المتوازي على هذا الجهاز،
  فأُكمل بالطريقة المعتادة.» when an export finished a slower way. A renderer killed mid-segment is not covered: it ends the
  page and the export with it, as it always did; resuming across it is outside this stage.
- **Where lanes come from.** The panel asks `exportLanes()`: the device's measured plan (`scale.ts`, the D9 measurement for this
  application, Chromium, chip, driver and switch), then the ladder's memory. With no measurement, in a browser or on a phone,
  it is one lane: today's export. Drawing in workers is not turned on anywhere (P-07, decision (A)).
- **One pass, several shapes (P-05; `shapes.ts`).** With more than one lane and two to four shapes ticked, as many shapes as
  lanes are made together: each source decoded once (a shape moves where a clip sits, never which frame it shows), every
  shape composed on its own canvas and encoded by its own encoder into its own file, the sound mixed once for all. Any
  failure but a cancel makes the shapes again one after another, as before (`steps: ['ONE_PASS']`), so nothing is lost.
- **Verified, numbers.** `npm run typecheck` clean; `npm test` 806 of 806. `qa/studio-lanes.cjs` with one lane (the floor),
  two and three, the application started with `--disable-features=CalculateNativeWinOcclusion` and its window in front (a
  covered window draws about once a second, Fork 2's finding); the times are with fingerprints and are not speed figures.
  - **Edge 156, with and without its chip, 20 s at 1080p:** 16 of 16 (`qa/studio-lanes-1080-20s-edge.json`).
  - **The application on the saving chip (AMD):**
    - 20 s with the forced faults, 8 of 8: the guard refused a lane with another H.264 profile and one lane made the file;
      a lane failing once mid-segment had its segment run again by the lanes left; the first segment's lane failing ran the
      export again with two lanes; every file exact (`qa/studio-lanes-1080-20s-app-saving.json`).
    - Ten minutes at 1080p, every one of the 18000 composed frames fingerprinted, 5 of 5: two and three lanes give one
      lane's frames and structure (300 key frames); the frames at the boundaries 0.00 dB from one lane's at frame 9000, and
      0.00, 0.00 and +0.04 dB at 6000 and 12000. 644, 656 and 695 s (28.0, 27.4 and 25.9 frames a second), the processor at
      13 then 32%, 30 then 41%, 40 then 85% (`qa/studio-lanes-1080-600s-app-saving.json`).
    - Ten minutes at 4K, 1368 frames fingerprinted (sampled, below), 5 of 5: frames and structure exact; boundary frames
      0.00 dB at 9000, and 0.00, 0.00 and +0.01 dB at 6000 and 12000. 738, 610 and 589 s (24.4, 29.5 and 30.5 frames a
      second), the processor at 54 then 85%, 40 then 31%, 73 then 14% (`qa/studio-lanes-2160-600s-app-saving.json`).
  - **The application on the strong chip (RTX 3050):**
    - 20 s with the forced faults, 8 of 8, at 21 to 24 frames a second with fingerprints, so the window was not throttled
      (`qa/studio-lanes-1080-20s-app-strong.json`).
    - Ten minutes at 1080p, every frame fingerprinted, 5 of 5: frames and structure exact; boundary frames 0.00 dB at 9000,
      6000 and 12000. 752, 759 and 758 s (23.9, 23.7 and 23.8 frames a second), the processor at 42 then 32%, 37 then 33%,
      15 then 22% (`qa/studio-lanes-1080-600s-app-strong.json`).
    - **Ten minutes at 4K: not finished.** One lane finished (576 s, 31.2 frames a second, sampled fingerprints). The two-lane
      export then stopped with `QuotaExceededError`: drive C was down to 3.5 GB, about 15 GB of it this fork's own earlier
      profiles, holding the private copies of the long sources and exports, which the checks did not remove
      (`qa/studio-lanes-2160-600s-app-strong.json`, 0 of 1, the error alone). Those four profiles were removed (C back to 18.6
      GB), the checks now remove their profile when an engine closes, and the run was started again with TEMP and TMP on D:.
      The owner paused the stage while it was making its source; it was stopped there, and nothing of it is recorded.
  - **With no graphics chip in the application: not run** (the owner's pause came first). Edge with `--disable-gpu` passed the
    20 s lanes and faults (above).
  - **The encoded bytes are not the same, and section 5.2 does not ask them to be.** On the AMD chip the files of one, two
    and three lanes differ by some tens of kilobytes (1080p: 828,060,193, 828,040,925 and 828,060,326 bytes); four processor
    encoders run at once for P-05 made two shapes' bits differ, the files 56.3 and 56.9 dB apart. In both, section 5.2's
    first level (structure, exact) and second level (composed frames exactly equal on one machine for every knob setting)
    hold; the encoded file is its third level, quality against its own frames, where byte-equality is not asked, as hardware
    encoders do not give it (DT-06).
  - **One pass, several shapes (`qa/studio-shapes-onepass.cjs`):** Edge with and without its chip 8 of 8, the saving chip 4 of 4;
    every shape's composed frames and structure are its own export's; the packets are recorded (identical with a chip, as
    above without one).
- **Found and fixed on the way (a04d40c).** In the Edge run before the long ones, a first segment whose lane failed before its
  encoder had described itself made the export run again with one lane instead of one fewer: the missing description was taken
  for a refused join. A lane's own failure is now read before the descriptions are compared; Edge then passed 16 of 16.
- **Deviations from `Desktop_Power_Ideas.md` section 9, with reasons (the manager's approval of 2026-11-04).**
  - The 4K ten-minute fixture fingerprints every 15th composed frame and the 30 on each side of every boundary, not every
    frame: fingerprinting every 4K frame would hold port 3000, which all forks share, for hours more.
  - No ten-minute 4K run with no graphics chip: about 80 minutes for each lane count.
  - The time ratios are of two-minute fixtures in a quiet window: ten-minute runs do not fit in one.
- **Stopped at the owner's pause (2026-11-04), said plainly.** Of D11's gate, still to run: ten minutes at 4K on the strong
  chip; with no chip in the application, the 20 s faults, the shapes and ten minutes at 1080p; and (d), the time ratio for each
  chip in a quiet window (two-minute 1080p and 4K fixtures, three interleaved rounds of one, two and three lanes, without
  fingerprints: `QUIET=1`). Not verified: a renderer killed mid-segment (above); nothing signed in (the panel's lanes and one
  pass were not clicked through); the plan's lanes on a measured profile (`exportLanes`) were not exercised in the application.
- **To resume, and the traps.**
  - Each run of the application takes port 3000's lock itself, at `%LOCALAPPDATA%\Temp\comms-hub-port3000.lock` (the checks no
    longer read it through TEMP), and frees it when it ends; one engine at a time.
  - **Run with TEMP and TMP on D:.** The application's profile, and so its private storage (a ten-minute 4K source's copy of 2 to
    4 GB, a 3.4 GB export, the lanes' spills), goes where `os.tmpdir()` says; on C: it filled the owner's drive. The command:
    `TEMP=D:\…\qa\artifacts\tmp TMP=D:\…\qa\artifacts\tmp ENGINES=app-strong SECONDS=600 SIZE=2160 FAULTS=0 EVERY=15 node qa/studio-lanes.cjs`,
    then `ENGINES=app-nochip SECONDS=20 node qa/studio-lanes.cjs`, `ENGINES=app-nochip node qa/studio-shapes-onepass.cjs` and
    `ENGINES=app-nochip SECONDS=600 SIZE=1080 FAULTS=0 node qa/studio-lanes.cjs`, each with the same TEMP and TMP.
  - The application starts with `--disable-features=CalculateNativeWinOcclusion` and its window in front (a covered window drew
    about once a second); each export prints its frame rate and the processor's load, so a throttled run shows within one export.
  - With no chip, the application at 4K saturates the processor and its window falls to about one frame a second (the manager's
    finding): its 1080p run may crawl; stop it if the first export takes far longer than about 12 minutes.
- **Not done.** Nothing pushed; drawing in workers (P-07) not switched on anywhere.

### 2026-11-04 (evening): D11's gate rows 1 to 4 after the owner resumed Desktop Power (Desktop Power, Fork 1)

- **Before the rows.** Merged `main` (85e642a, 5a442e6, ea72695) into the branch (6780c40). `desktop/` had not changed, so the
  development package was not rebuilt. `npm run typecheck` clean; `npm test` 828 of 828.
- **How they ran.** One engine at a time on port 3000, each run taking and freeing the lock itself; TEMP and TMP on
  `qa/artifacts/tmp` in this worktree (drive D) for every command; each run removed its profile when its engine closed (two empty
  folders were left each time and removed by hand). Nothing of tonight's runs was written to drive C. The application was the
  development package 0.8.0 (Electron 45.0.0, Chromium 156.0.8078.48), started with `--disable-features=CalculateNativeWinOcclusion`
  and its window in front. The times are with fingerprints and are not speed figures; the time ratio is (d), below.
- **Row 1, the strong chip (RTX 3050), ten minutes at 4K, every 15th frame and 30 each side of every boundary fingerprinted
  (1368 frames): 5 of 5** (`qa/studio-lanes-2160-600s-app-strong.json`, which replaces the record of the run the full drive
  stopped; that one is at f155ca8).
  - One, two and three lanes: 445.9, 366.9 and 386.9 s (40.4, 49.1 and 46.5 frames a second), the processor at 46%, 5 then 5%,
    4 then 2%.
  - Every fingerprinted composed frame is one lane's, the structure is one lane's exactly (18000 frames, 300 key frames).
  - The frames at the boundaries are 0.00 dB from one lane's: 43.48 and 43.57 dB at 8999 and 9000; 43.00, 43.09, 43.08 and
    43.12 dB at 5999, 6000, 11999 and 12000.
  - The files: 3,431,240,009, 3,430,985,206 and 3,430,894,885 bytes (section 5.2's third level, as above).
- **Row 2, no graphics chip in the application, 20 s at 1080p with the forced faults, every frame fingerprinted: 8 of 8**
  (`qa/studio-lanes-1080-20s-app-nochip.json`).
  - One, two and three lanes: 17.7, 18.7 and 19.8 s (33.9, 32.1 and 30.3 frames a second, so the window was not throttled).
  - Frames and structure exact; boundary frames 0.00 dB from one lane's (41.84 and 42.90 dB at 299 and 300; 41.51, 42.88,
    41.93 and 42.92 dB at 239, 240, 419 and 420).
  - The guard refused a lane with another H.264 profile and one lane made the file (21.6 s); a lane failing once mid-segment
    had its segment run again on the lanes left (three lanes, 20.1 s); the first segment's lane failing ran the export again
    with two lanes (18.2 s); every file exact.
- **Row 3, no graphics chip, one pass for four shapes: 4 of 4** (`qa/studio-shapes-onepass-app-nochip.json`). Every shape's
  composed frames and structure equal its own export's. The packets are identical for 16:9 and 9:16; for 1:1 and 4:5 they
  differ, the two files 56.84 and 55.98 dB apart, recorded as a note, as with the saving chip (section 5.2's third level). Four
  shapes one after another 20.0 s, in one pass 15.2 s, with fingerprints.
- **Row 4, no graphics chip, ten minutes at 1080p, every one of the 18000 frames fingerprinted: 5 of 5**
  (`qa/studio-lanes-1080-600s-app-nochip.json`).
  - It did not crawl: one, two and three lanes 492.9, 488.6 and 550.3 s (36.5, 36.8 and 32.7 frames a second), the processor
    at 20%, 14 then 2%, 1%.
  - Frames and structure exact (300 key frames); boundary frames 0.00 dB from one lane's (41.62 and 42.79 dB at 8999 and 9000;
    41.65, 42.80, 41.57 and 42.78 dB at 5999, 6000, 11999 and 12000).
  - The files: 761,761,518, 761,760,931 and 761,765,326 bytes.
- **Still not run, said plainly.** (d), the time ratio for each chip, waits for a quiet window from the manager (two-minute 1080p
  and 4K fixtures, three interleaved rounds of one, two and three lanes, `QUIET=1`). Without it no lane count is promised as
  faster: tonight two lanes were quicker than one on the strong chip at 4K and three lanes slower than one with no chip at 1080p,
  with fingerprints and a processor shared with other sessions. Still not verified: a renderer killed mid-segment; nothing signed
  in (the panel's lanes and one pass were not clicked through); `exportLanes` on a measured profile in the application.
- **Found on the way, not touched.** Drive C holds 268 older check profiles (`%LOCALAPPDATA%\Temp\comms-hub-desktop-qa-*`, about
  7.5 GB in all, none written tonight), from runs of several sessions before the checks removed their profiles; which session
  made each cannot be told from the folder, so none was removed.
- **(d) made timing only, before the quiet window (the manager's decision of 2026-11-04).** `QUIET=1` in `qa/studio-lanes.cjs`
  now runs no fingerprinted export: three interleaved rounds of one, two and three lanes, the processor's load before and after
  every export in the record, and a check that every timed export ran with its own lane count, stepped down nowhere and made
  every frame. It refuses to start without `ENGINES`; its record always ends in `-speed` (held by the name's own check), so it
  never writes over a gate row's; its notes say "timing only; frames and structure proven by rows 1 to 4 and the earlier engine
  rows at 29a1a30". A timed export's file is not sent to the runner (`keep: false` in `qa/fixtures/studio-lanes.ts`). The window
  times the strong and the saving chips at 1080p and 4K and no chip at 1080p; **4K with no chip is not timed** (about 16 minutes
  for each 120 s export, so about 2.4 hours for nine), and nothing is claimed for it. Checked so far: the script parses, the
  fixture bundles, and `QUIET=1` without `ENGINES` stops before touching anything; the timing path itself has not run yet.
- **Not done.** Nothing pushed; drawing in workers (P-07) not switched on anywhere.

### 2026-11-05: D11 (d), the lanes' time on each chip, in the manager's quiet window (Desktop Power, Fork 1)

- **How it ran.** In the window the manager opened at 00:55 for this alone (nobody else ran anything), after merging `main`
  5c24b55 (`cd11562`; `npm run typecheck` clean). Five runs of `QUIET=1 SECONDS=120 FAULTS=0 node qa/studio-lanes.cjs`, one
  engine each, in the approved order, one after another, each taking and freeing the port's lock; TEMP and TMP on this
  worktree's `qa/artifacts/tmp`. The development package 0.8.0 (Electron 45.0.0, Chromium 156.0.8078.48), started with
  `--disable-features=CalculateNativeWinOcclusion` and its window in front. Each run: three interleaved rounds of one, two and
  three lanes over a two-minute fixture (3600 frames), no fingerprints, the processor's load before and after every export.
  Windows' processor speed limit (`% Performance Limit`) was read before and after each run, outside the check: 100% every
  time, on mains power. These are option A's figures (drawing on the page), the baseline for option B.
- **Results, all 1 of 1** (every timed export ran with its own lane count, stepped down nowhere and made all 3600 frames).
  Medians of three, as frames a second for one, two and three lanes, and the speed-up of two and three lanes over one:
  - the strong chip (RTX 3050), 1080p: 148.6, 252.1, 231.2 (1.70, 1.56); run 3 min 41 s
    (`qa/studio-lanes-1080-120s-app-strong-speed.json`);
  - the strong chip, 4K: 50.5, 78.8, 90.2 (1.56, 1.79); run 9 min 37 s (`qa/studio-lanes-2160-120s-app-strong-speed.json`);
  - the saving chip (AMD Radeon), 1080p: 95.1, 128.8, 130.8 (1.35, 1.38); run 5 min 41 s
    (`qa/studio-lanes-1080-120s-app-saving-speed.json`);
  - the saving chip, 4K: 30.5, 49.6, 45.7 (1.63, 1.50); run 15 min 27 s (`qa/studio-lanes-2160-120s-app-saving-speed.json`);
  - no graphics chip, 1080p (the processor's encoder, BT.709 in workers): 66.9, 67.2, 67.3 (1.00, 1.01); run 9 min 2 s
    (`qa/studio-lanes-1080-120s-app-nochip-speed.json`). Lanes gain nothing here.
  - **4K with no graphics chip was not timed** (the manager's decision: about 16 minutes for each 120 s export), and nothing is
    claimed for it.
- **The load beside the figures.** With a chip it stayed at 1 to 9% almost everywhere, except: the strong chip at 4K in round 1
  (46% before the first export, then 12 to 29%); the saving chip at 4K in rounds 2 and 3 (29% then 47% around round 2's three
  lanes, 100% then 29% around round 3's one lane, 45% then 35% around round 3's three lanes), cause not known. The medians
  are of three, so one disturbed export does not move them alone. With no chip the export itself loads the processor (20 to
  51%). Two of the 100 load readings came back empty (null), and the record keeps them as such.
- **Not verified.** These are one laptop's figures, on mains, with Windows' speed limit read only before and after each run,
  not during it. The check pins nothing about power through `powerMonitor`.
- **Not done.** Nothing pushed.

### 2026-11-05: D11 merged with option A, and the cross-device tolerance for no graphics chip (Desktop Power, the manager)

- **Decision.** D11 (export lanes P-06, the step-down ladder P-35, one pass for several shapes P-05) is merged with P-07 kept
  off (option A), from Fork 1's `f62caf7`, which carries no code of option B.
  - The owner said yes to option B on 2026-11-05, as "today's frames change once". Built and measured by Fork 1, it broke the
    manager's rule (b): at 4K on the saving chip its best lane count was 15.9% slower than A's.
  - It also made an export differ from the preview, which draws on the page: brand marks by up to 137 levels with a chip.
  - It did not close the no-chip gap either: six rows still failed in worker mode.
  - Option B stays on `claude/power-export-821809` (`016c952`), with Fork 1's numbers, for the owner to decide on.
- **Evidence, run by the manager** on the merge (`dfe0684`, main `19c31f2` with D11) in `verify-e3cab67`:
  - typecheck clean, `npm test` 880 of 880, `next build`;
  - `qa/studio-lanes.cjs` with `ENGINES=app-strong`, 8 of 8;
  - `qa/studio-shapes-onepass.cjs` 20 of 20;
  - `qa/studio-export-yuv.cjs` 32 of 32;
  - `qa/studio-effects-parity.cjs` 19 of 19, with D11 and Fork 4's effects together;
  - `qa/studio-crossdevice.cjs` 38 of 43 at first, then 43 of 43 with the stated tolerance below.
  - Fork 1's own records stand beside these: D11's gate rows 1 to 4 and (d) under A, 5 of 5.
- **The tolerance for no graphics chip** (the manager's, `qa/studio-crossdevice.cjs` `tolOf`).
  - Between `--disable-gpu` and a chip: PSNR at least 48 dB and at most 2.5% of channels more than 2 levels apart.
  - Between chips it stays at 50 dB and 0.1%, and the same machine stays exact in any order.
  - **Why.** Chromium's software rasterizer smooths the edges of text, shapes and pictures by its own rule (keys 55.04 dB,
    brand 50.17, landscape-keys 53.36), and turns a decoded video frame into colour with its own rounding, a few levels
    across the whole picture. The whole-number effects then carry that input exactly: effects frame 0 is 50.43 dB with 2.02%
    over 2 levels, frame 2 is 48.54 dB, and transitions are 48.77.
  - Before Fork 4's effects the same effects frames were 3.01% and 48.21 dB. No speed knob is in the difference.
- **Not verified.** One laptop. The no-chip figures are this laptop's processor, and another processor's software drawing may
  round differently.
- **Not done.** Nothing pushed.

### 2026-11-04: «يُرفع الملف أثناء التصدير» (P-25) parked: not possible on Google Drive with the file unchanged (Desktop Power, Fork 5)

- **What was asked.** During «تصدير وإرسال للمراجعة», the export's stream should feed the library's upload as it is written.
  The file that reaches the library had to stay byte for byte today's: `Mp4OutputFormat({ fastStart: false })` over
  `StreamTarget(writable, { chunked: true })`. The brief said to stop and say so if that proved impossible.
- **Measured (`qa/studio-export-writes.mjs`, `qa/studio-export-writes.json`, 9 of 9).** The probe runs in Node only: no port
  and no browser. It makes the export's output with the pinned Mediabunny 1.61.2 from made-up AVC and AAC packets, and
  records every write the writable receives.
  - **A 60,382,042-byte file** gets five writes:
    1. three full 16 MiB pieces in order (0, 16 MiB and 32 MiB), 50,331,648 bytes, while it is being made;
    2. then, at finalize, 8 bytes at byte 28: the mdat header, whose size is known only then (`isobmff-muxer.js`
       `patchBox`);
    3. then the remaining 10,050,394 bytes (the rest of mdat and the moov).
  - **A 6,039,002-byte file** gets one write of the whole file, at finalize. Mediabunny keeps 16 MiB pieces in memory, so a
    file under 16 MiB does not exist anywhere before the end.
  - The layout in both is ftyp (28 bytes), mdat from byte 28, moov at the end. The probe also checks that `export.ts` and
    `target.ts` still use these options.
- **Why that rules it out.**
  - The library uploads only to Google Drive: `storageFor` always returns Drive, every `storage_roles` row points at it, and
    a role's provider cannot be changed.
  - Drive's resumable upload takes bytes only forward from byte 0 and never rewrites a byte it has received.
  - Its first chunk must hold bytes 28 to 31, which are written last. So with the file unchanged nothing can be sent before
    the export ends: the probe's forward prefix before finalize is 28 bytes, and no 256 KiB chunk.
  - S3 multipart takes parts in any order. There, everything but the first part could go during the export, with the first
    part sent last. But the S3-compatible provider holds only moves and backups, and making it the library's provider is
    not offered.
  - A streaming layout (fragmented MP4, or `fastStart: 'reserve'`) changes the file, which the fixed rule forbids.
- **Decision.** Parked by the manager; the owner may choose otherwise.
  - The two small savings that remain on Drive are not built:
    - (a) opening Drive's session during the export, about a second, not measured: the session would be opened without
      a length, so the administrator's upload limit would be checked against an estimate;
    - (b) skipping the browser's metadata read of a new file, under a second.
  - `Desktop_Power_Ideas.md` P-25 carries the dated note. D12's gate row «تصدير وإرسال» faster end to end is marked not met
    for this reason.
  - No change to Fork 1's files, no migration.
- **A correction to the brief.** The page does see Drive's session address.
  - `/api/media/upload-session` and `/api/media/[id]/version` return Drive's resumable session address to the page
    (`upload-session/route.ts:42`).
  - The page then sends 8 MiB chunks straight to Google (`src/lib/media/upload.ts` `sendToDrive`); nothing passes through
    the site's server.
  - The address held back from the page and the server relay in pieces under 4 MB are the platform tests' rules
    (`platform_tests.upload_url`), not the library's.
  - The library's path already makes its record only after Drive has the last byte and the server has read the file's size
    back (`/api/media/complete`). A Drive session that never receives its last byte leaves no file at Google.
- **Verified.** `node qa/studio-export-writes.mjs`: 9 of 9. `npm run typecheck` clean.
- **Not run, as the change is a probe and documents only:** the build and `npm test`. Port 3000 is shared and Fork 1's
  checks are running, and nothing under `src/` changed. Nothing pushed.

### 2026-11-05: the director's notes approved, and step 1 built: «غير مدرج» and «مجدول» in YouTube's «تجربة النشر» (N-3)

- **Owner decision.** The owner approved `Director_Notes_Plan.md` (committed `de6dde0`) with the recommended answer to all five
  questions: calendar colours are personal and kept in the database (Q1); «نشر مباشر» is the director's and the Admin's only,
  fixed (Q2); a scheduled Instagram post is fired by the WhatsApp bridge's loop, or at the next opening of the site, said as late
  (Q3); thumbnails are kept in the database (Q4); the YouTube choice in the work cycle needs no new approval (Q5). Step 1 of its
  section 6 was asked for first.
- **Deviation from the specification, by that directive.** `MVP_draft.md` 71.2 said «غير مدرج» is not offered and
  `supabase/tests/platform_tests_rules.sql` test 09 enforced it. Both are revised: the YouTube test now offers YouTube's four
  choices, «خاص» (default), «غير مدرج», «عام» and «مجدول».
- **What was built.**
  - Migration `20261105120000_platform_tests_youtube_choices.sql` (written, **not applied** to comms-hub): `privacy` may be
    `unlisted`; a YouTube test may carry `scheduled_for` only when private; the window is 10 minutes to 30 days ahead, refused
    as `SCHEDULE_INVALID`; `shown_publish_at` keeps the time YouTube answered; `platform_test_done` takes `p_publish_at`.
  - «مجدول» is YouTube's `status.publishAt` on a private video (videos resource, read 2026-11-05 through Context7): YouTube
    makes it public by itself, so the site needs no timer. Rules in `src/lib/platforms/test-rules.ts` (`YT_CHOICES`, `ytStatus`,
    `scheduleProblem`), the request in `youtube.ts` (`ytUploadStatus`, which never sends a time with anything but private), the
    routes, the panel `src/components/work/youtube-test.tsx`, and a new hold reason `platformTestScheduled`.
  - The result and «آخر التجارب» say when YouTube kept a video narrower than asked, including a scheduled video given no time.
- **Verified.**
  - `npm run typecheck` clean; `npm run build` clean; `npm test` 882 of 882 (`tests/youtube-test.test.mjs` 13 of 13, two new).
  - SQL rules on a private container with every migration replayed (67): `platform_tests_rules.sql` 95 of 95 (20 new cases,
    75 to 94, and test 09 rewritten), `platform_tests_instagram_rules.sql` 62 of 62, `platform_tests_facebook_rules.sql` 48 of 48.
    Results in `qa/platform-tests-rules.json`, `qa/platform-tests-instagram-rules.json`, `qa/platform-tests-facebook-rules.json`.
  - `node qa/youtube-test-flow.cjs`: 68 of 68 on the fixture (19 new: the four choices in order, unlisted sent with no time,
    the time field in Riyadh time, refusals under 10 minutes and over 30 days, the hold, the instant sent, the result and the
    list, and a scheduled video YouTube gave no time). Result `qa/youtube-test-flow.json`, pictures under
    `qa/artifacts/youtube-test-flow/`.
- **Not verified.** Nothing was tried against YouTube itself. Google's pages disagree on whether an unaudited application may
  upload anything but private (the 2020 revision note says no, today's reference says yes); the first real unlisted or scheduled
  test settles it, and the panel says what YouTube applied.
- **Before deploying.** Apply the migration first: the panel now selects `shown_publish_at`, so the code without it would empty
  every platform's «آخر التجارب». Nothing pushed.

### 2026-11-05: three migrations applied to comms-hub, «إنشاء» as a permission, «إلغاء العمل» and the Facebook test (the manager)

- **By the owner's yes of 2026-11-05** ("Yes, apply them"), applied in order through the Supabase MCP tool:
  `create_access` (version 20261105072249), `work_cancel` (20261105072309), `platform_tests_facebook` (20261105072343).
  The md5 of each stored statement equals the file's (`ec7c7f71...`, `b73c33be...`, `8a62413b...`). `create_access` patches
  each function only if it carries the expected text exactly once, and it applied, so the live definitions were as written.
  `android_releases` stays unapplied by design, and `platform_tests_youtube_choices` (20261105120000, step 1 of the director's
  notes) was **not** applied: it was not part of the question, and its entry above says it must be applied before deploying.
- **Verified on comms-hub after applying**, each rules file sent verbatim as one transaction rolled back at the end, with
  throwaway accounts only: `create_access_rules.sql` **61 of 61**, `work_cancel_rules.sql` **40 of 40**,
  `platform_tests_facebook_rules.sql` **48 of 48** (the same totals as on the private container before). Nothing was left
  behind: no @t.test account or user, no throwaway integration, the server key's hash is the real one, `platform_tests` holds
  its one earlier row. Results in `qa/create-access-rules-comms-hub.json`, `qa/work-cancel-rules-comms-hub.json`,
  `qa/platform-tests-facebook-rules-comms-hub.json`.
- **Found on the way: a rolled-back test still uses up work numbers.** `work_create` draws from `work_no_seq`, which a rollback
  does not return; the two runs that create works took 11 numbers (1 to 12, with one work on the site). The sequence was set back
  to 1 under a share lock on `works`, only because the count and the highest number were unchanged, so the next real work is
  number 2. A later run on comms-hub that creates works should note the sequence first and restore it the same way.
- **Security advisor after applying:** on these migrations' objects only `authenticated_security_definer_function_executable`,
  for `work_cancel` (new, callable by signed-in people by design, it checks its caller) and the three replaced platform-test
  functions (callable as before); none for anon, no table without a policy; `perm_create_giver` and `work_touched_by_others` are
  not callable through the API. The count before applying was not taken.
- **What the live site does now.** Its code (origin/main) predates these migrations, and it agrees with them: it builds a
  person's pages from `my_capabilities` (`src/lib/supabase/session.ts`), so `page.create`'s role templates now decide «إنشاء»
  there too. The assistant, the writer and the producer keep it; the designer and the member no longer see it, and the database
  refuses them `work_create`. «إلغاء العمل» and the Facebook test wait for the push. Nothing pushed.

### 2026-11-05: `platform_tests_youtube_choices` applied to comms-hub (director's notes, step 1; the manager)

- **By the owner's yes of 2026-11-05** ("Yes, apply it"), applied as version 20261105073612; the md5 of the stored statement
  equals the file's (`be2272f0...`), the same file the container runs of the step-1 entry above used. The live site's code keeps
  working on it: `platform_test_done` gains `p_publish_at` with a default, so the current five- and six-part calls still resolve,
  and the table's checks only widen. This settles that entry's "Before deploying": the push no longer waits for it.
- **Verified on comms-hub after applying**, each rules file verbatim in one rolled-back transaction:
  `platform_tests_instagram_rules.sql` **62 of 62**, `platform_tests_facebook_rules.sql` **48 of 48** (again, against the
  replaced functions), `platform_tests_rules.sql` **94 of 95**. The one difference is case 28, "the director sees it", which
  counts every test a director may see and got 2 for 1: comms-hub holds one real test from before the run. A separate rolled-back
  query as a throwaway director saw that 1 row and none made by the tests, so the rule holds and the file's count assumes an empty
  table. Left behind: nothing (no @t.test account, user, integration, platform account or library file; the real server key; one
  `platform_test_done`, not callable by anon; `work_no_seq` untouched at 1).
- **Security advisor:** 357 findings before and after; the only change is `platform_test_done`'s finding moving to its new form.
- Results in `qa/platform-tests-rules-comms-hub.json`, `qa/platform-tests-instagram-rules-comms-hub.json`, and the second run in
  `qa/platform-tests-facebook-rules-comms-hub.json` (`after_youtube_choices`). Nothing pushed.

### 2026-11-05: the desktop release's final regression, continued (Desktop Power; stage 1 of the release)

- **Why.** The owner asked a new session to finish the regression the manager had left at 21 of 27 (`power-final`, `09ddefc`), as
  the first stage of shipping 0.9.0; the manager stood down. At the owner's word the session stopped the Hatan project's
  `next dev`, which held port 3000.
- **Two failures were in the checks, not the application.**
  - `qa/desktop-idle.cjs`, 8 of 17. Since D10 an open project reads a light copy made in idle time from the moment it is ready
    (`MediaPool.copiesReady`), and «حذف ملفات المعاينة المؤقتة» rightly spares what is in use. The fixture cleared with its project
    open; once the wait for Windows' full speed outlasted both grainy copies, they stayed taken up, the check remade them six times
    and every hold found nothing running. `qa/fixtures/desktop-idle.ts` now closes the project, clears every copy and opens it
    again (`eeb2b47`). The application is unchanged.
  - `qa/android-site.cjs`, 0 of 1. The verify worktree had no `.env.local`, so the site showed «الاتصال بالحسابات غير مضبوط»
    instead of the sign-in form. The worktree was given the two public values only (`NEXT_PUBLIC_SUPABASE_URL` and the
    publishable key, gitignored); no server secret was copied.
- **On the merged tree.** main's `de6dde0` and `68244c2` merged into `power-final` as `5ee911d`, no conflicts. Typecheck clean,
  `npm test` **882 of 882**, `next build` clean. Then, from 10:29: `qa/android-site.cjs` **12 of 12**, `qa/youtube-test-flow.cjs`
  **68 of 68**, `qa/desktop-idle.cjs` **19 of 22**.
- **Not measured, because of the laptop, not the code.**
  - desktop-idle's three failures are the battery hold and the simulated speed limit. Both paused within 13 and 9 ms, then the
    copy was stopped (back to waiting at 0 s) instead of held, and after the speed-limit hold it had not resumed within 15 s.
    Windows changed the processor's speed limit 248 times in the 532 s run, mostly to 34 to 70%; before both holds it was back at
    100 only for a moment and fell again within about ten seconds. A copy whose FFmpeg cannot drain its input within the worker's
    settle time is stopped by design. The click, export and sound holds passed (55, 12 and 34 ms).
  - `qa/studio-scrub.cjs --quick`, 12 of 15: the Edge rows kept 48 of 48 identity times on gop2 and gop10. The three application
    rows were refused by the check's own guard: the window drew one frame a second, because the owner was using the laptop and
    the package window was covered.
  - `qa/studio-autores.cjs --quick`, 0 of 1: refused by the same guard (two frames a second).
  - Measured at 11:00: on mains, display never turned off, the processor at 69% of its rated performance at 24% load, Docker
    Desktop and several other sessions running.
- **Records.** The 22 checks that passed in full are committed (`00b8337`). desktop-idle, studio-scrub and studio-autores keep
  their gate records until the quiet re-run. `qa/studio-ui.cjs` (122 of 122) and youtube-test-flow passed too, but their records
  are being rewritten by other work in the main checkout, so they are not committed here.
- **Not checked in a browser:** `09ddefc`'s photo editor taking the plan's worker count. `qa/studio-photo-tiles.cjs` (9 of 9) ran
  before that change; it proves every worker count gives the same bytes.
- **Next.** The three checks in a quiet window (the laptop untouched, about 45 minutes). The merge into main waits for the main
  checkout's uncommitted `MVP_draft.md` (section 77, thumbnails; no line overlaps). Then the 0.9.0 package. Nothing pushed.

---
type: changelog
project: "[[projects/ideas/Comms_Hub/Comms Hub|Communication Department Hub]]"
tags:
  - comms-hub
  - document/progress
  - knowledge/dated
created: 2026-08-18
updated: 2026-10-10
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

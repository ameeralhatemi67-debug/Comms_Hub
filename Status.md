---
type: status
project: "[[projects/ideas/Comms_Hub/Comms Hub|Communication Department Hub]]"
tags:
  - comms-hub
  - document/status
  - status/active
created: 2026-08-18
updated: 2026-10-10
status: active
parent: "[[projects/ideas/Comms_Hub/Comms Hub]]"
aliases:
  - Communication Hub Current Status
  - حالة مركز الاتصال المؤسسي
related:
  - "[[Roadmap|Product Roadmap]]"
  - "[[progress|Progress Log]]"
  - "[[MVP_draft|MVP Draft UI Shell]]"
  - "[[discussions_list|Master Discussions Index]]"
  - "[[validation/workflow-map|Department Workflow Map]]"
---

[[projects/ideas/Comms_Hub/Comms Hub|Comms Hub Overview]] | [[Roadmap|Product Roadmap]] | [[progress|Progress Log]] | [[MVP_draft|MVP Draft UI Shell]] | [[discussions_list|Master Discussions Index]]

---

# Communication Department Hub — Current Status

Updated 2026-10-10. **CHECKPOINT 0.2 IN PROGRESS.** Checkpoint 0.1 is complete and accepted. Phase 0.2.1 (Workflow Mapping) is complete. **Phase 0.2.2 (Guided Department Validation) is closed on the Director's response alone:** R01 arrived on 2026-10-10, and the same day the owner directed that the Director's input is enough, so the remaining participants and the frozen build are skipped (`[-]` in `Roadmap.md`; exit gate criteria 1 and 2 waived by that directive). Phase 0.2.3 Round 1 corrections start on 2026-10-11. The day-by-day plan is in `Roadmap.md` under "Work plan from 2026-10-11".

Design: Direction A is the default; B only for larger media previews. See DESIGN.md. The new identity, «الهوية الجديدة لمركز الاتصال», is **built as an option, not approved as the default** (2026-10-10, owner directive): a double-click on the sidebar logo switches between the two designs, remembered per browser. See `MVP_draft.md` section 58. D-01 decides which design is the default.

## Validation so far (2026-10-10)

- **Response R01, Director, desktop, self-administered Google Form.** Transcribed in `validation/responses/R01-2026-10-10-director.md`. The shared response sheet and the attached CSV hold the same single response.
- **Scores:** workflow fidelity 3, authority 4, findability 3, terminology 3, trust in the record 3, out of 5.
- **Own-role tasks (S1 and S2):** 10 of 13 passed. Failed: the purpose of «العمل» and the team's work (S1.3, S1.6), and counting overdue work (S2.4).
- **Whole submission:** answers appear in all seven role sections although the form sends each role to one section. 39 of 45 tasks passed. Who completed sections S3 to S7 is unconfirmed (task 0.2.2.7), so those answers are findings, not role coverage.
- **Findings:** 19 recorded, 8 provisionally Severity 1: team workload and stage view, overdue count, timestamped video notes, component-scoped approval, delegation, urgent path, work linked to several campaigns, assignment to a named person. Severities await owner confirmation (D-03).
- **Prototype defect exposed:** the prototype has no scenario "today", and every seed due date is 22 or 23 September, so a tester in October sees all work as late. Corrected in task 0.2.3.5.
- **Exit gate:** one of five role groups, one of six participants, one of two leadership. Whether self-administered form responses count as sessions is owner decision D-02.

## Round 1 corrections (2026-10-11)

All six Round 1 corrections from the Director's findings are built and verified: overdue and due-soon against a fixed scenario date (21 September 2026), named assignees with a team view and load per person, stale channel version flags, highlighted version difference, early reconnect warning, and timestamped video notes. `npm test` 15/15, `qa/round1.cjs` 52/52, regressions pass. See `MVP_draft.md` section 59. Eight design notes for the structural findings are in `validation/design-notes/`, each recommending a Version 1 or 2 checkpoint. The re-check script for the Director is `validation/recheck-R01.md`.

## Decisions waiting on the owner

| ID | Decision |
|---|---|
| D-01 | With the Director, on the live toggle: make the new identity the default, keep it as an option, adjust it, or remove it |
| D-02 | Count self-administered form responses as sessions, with "facilitator: none" recorded. Effectively settled by the 2026-10-10 directive that the Director's response alone is enough; to be confirmed |
| D-03 | Done 2026-10-11: severities confirmed as transcribed |
| D-04 | Confirm or overrule the eight design-note recommendations (`validation/design-notes/README.md`), including whether to show an urgent mark and the editor's name in the prototype |

## Verified capability

- **Second design screens (2026-10-11).** Behind the same logo toggle (also in the phone top bar): evening mode, decisions and campaign pulse on Home, approval stamp, phone approval sheet, notification tiers, calendar week with drag-to-request, motion from the work item, and the `/components` page. `qa/identity-screens.cjs` 48/48; contrast 51 pairs per mode, lowest 4.73. See `MVP_draft.md` section 60.
- **Design toggle (2026-10-10).** Double-click on the sidebar logo switches between Direction A and the new identity; restored before first paint; fonts served by the app. Direction A is pixel-identical to before on 63 captures (`qa/colour-tokens.json`). `qa/identity-toggle.cjs` 134 of 134, including 48 contrast pairs and no request leaving the machine. Regressions 34/34, journey PASS, motion studio 205/205, domain tests 9/9, typecheck and build clean. Evening mode and the component QA page are not built.
- **Colour tokens (task 0.3.1.1).** Every interface colour in `globals.css` is one of 73 named tokens.
- `/motion`, the local Arabic motion studio, revised after first review (2026-10-08): 26 templates (8 numbers, 8 Repine, 10 video frames), template rail with live thumbnails, stage with transport and phase strip, tabbed settings with every timing and motion slider restored, frame ratios with true shapes and stated output sizes, window preview (sample, own clip, key green, transparent) and Reels safe zones, and downloads (MP4, transparent MOV, PNG sequence ZIP, single PNG) up to 4K and 60 fps with progress, cancel and a persistent save link. See `MVP_draft.md` section 57. Edits reset on refresh; access restrictions and asset attachment are deferred.
- Motion studio evidence, 2026-10-08 (second round): `node qa/motion-studio.cjs` passed all checks, including real downloads decoded with ffprobe and ffmpeg; existing regression 34/34; domain tests 8/8; typecheck and production build pass. Details in `progress.md` and `qa/motion-studio.json`.

- Runnable Next.js/TypeScript/Tailwind local UI with a coherent Saudi National Day 2026 campaign, eight role experiences, and distinct approval/publishing/Admin authority.
- Full browser journey passes: create, submit, request changes, edit, resubmit, approve exact revision, schedule, calendar, partial publication, retry and success.
- All eight personas and central B/C actions checked. 60 route/viewport checks at 1440/1280/900/390 pass without overflow or captured page errors.
- Fourteen Level A desktop/mobile screenshots inspected, plus mobile menu, historical release and calendar dialog. Focused keyboard, labels, focus return, Escape, contrast, validation and RTL review completed.
- Production build and typecheck pass; eight domain tests pass.
- Historical submitted/reviewed content and asset-version snapshots survive later edits within the session. Editing invalidates current approval. Notification reading cannot approve; retries preserve successful channels.

### Added and verified in Phase 0.2.1 (2026-09-19)

- **Role-specific home experiences are now genuinely distinct.** Each of the eight roles presents its own tile set per `MVP_draft.md` section 6, and no two roles share a set. Notices carry an explicit role audience, so the notification centre, monitoring page and home panels show only what the active role is addressed by.
- **Admin is a real shell.** Users, Roles and Permissions, Integrations, System Health, Storage, Security, Automation and Notification Policy, per sections 35 to 37. Connected account health also appears on the Publishing Officer's home.
- **Calendar grid is correct.** Weekday headers plus leading pad cells, so each month starts on its real weekday; verified across two months. Month and year are selected in Arabic rather than through the browser's own locale label.
- **Post-publication editing no longer erases the publication.** Editing still invalidates the bound approval, as `disscussios/approval_policy_design.md` section 3 requires, but a dispatch that already reached the channels is preserved in a publication record and shown on the work item.
- **Settings has eight sections** (section 38); Account shows the Arabic role name, email, language, permissions and mock sessions (section 39).
- **Seed data matches the demo scenario:** the 23 Sep 18:00 publication is pre-scheduled (section 47), campaign figures from section 4 appear on home, activity lines vary per item, and the hard-coded home schedule entry is gone. A campaign creation step matches the section 51 provisional flow.
- Every `src` file and the test suite were reformatted from single-line source to normal line breaks, with no behaviour change.
- Evidence: `npm test` 8 of 8; clean `npm run typecheck` and `npm run build`; `qa/checkpoint-02-corrections.cjs` 34 of 34 browser checks passing with zero page or console errors and no horizontal overflow at 1440 or 390.

### Phase 0.2.1 deliverables

- `validation/workflow-map.md` — nine representative workflows, 25 prototype assumptions classified, 11 exceptions, 7 bottlenecks, 9 terminology items, and the seven open questions that only real participants can answer.
- `validation/validation-scripts.md` — seven guided session scripts with fixed setup, unaided-success criteria, and participant-facing Arabic wording.
- `validation/feedback-rubric.md` — four-level severity rubric, per-session capture sheet, consolidated findings register, and the exit gate roll-up.

## Limits and decisions

- Media upload/playback deferred: fixed illustrative assets and version previews support workflow validation. Designers and producers may reject this in 0.2.2; the question is in the scripts.
- State/history reset on refresh. Content types share one composer. Calendar supports month/agenda only, without week/day or date-level creation. Settings and Admin are visual shells with no enforcement.
- Accounts are real since 2026-10-11 (owner directive, recorded in `progress.md`): email and password sign-in, approved accounts, access requests, roles and page permissions in the Supabase project `comms-hub`; the role switch is administrators only. Work data is still local mock state. No real publishing, mail delivery, OAuth, AI, Drive/NAS, workers, external notification delivery or production secrets/services.
- No delegation of review authority and no urgent or crisis path exist. Both are recorded as unsupported assumptions, not oversights.
- This is not formal accessibility certification, production readiness or department sign-off. **Human validation rests on one participant, the Director, by owner directive; the exit gate's six-participant and five-role-group criteria are waived, not met.**
- Extra ideas outside the Roadmap (video and photo editing, agent suggestions, Severity 4 preferences) are parked in `Ideas_Backlog.md`. None is planned work.
- Phase 0.2.1 corrected only defects that contradict `MVP_draft.md` on their face. It deliberately did not resolve any of the seven open questions, add delegation or an urgent path, change any Arabic term, or restructure the composer. Those belong to Phase 0.2.3, after real findings exist.

Evidence, reproduction instructions and precise accepted scope for Checkpoint 0.1: [qa/ACCEPTANCE.md](qa/ACCEPTANCE.md). Phase 0.2.1 correction evidence: [qa/checkpoint-02-corrections.json](qa/checkpoint-02-corrections.json).

## Next action

Waiting on people; no agent task is open on the critical path.

1. Director: run the re-check `validation/recheck-R01.md` on the current build. It covers the three failed tasks, each Round 1 correction, the open design questions, T6, D-01 (which design is the default, on the live logo toggle) and the command palette.
2. Owner: decide the eight design-note recommendations (D-04) and confirm D-02.
3. Agent, after the re-check: record the addendum, close or reopen each finding, and start Round 2 if any correction is rejected. If D-01 approves the new identity as default, rewrite `DESIGN.md` and flip the default.

Phase 0.2.2 is closed on the Director's response by owner directive; tasks 0.2.2.2 to 0.2.2.8 are skipped, not pending. Version 1 remains gated on the Checkpoint 0.2 exit gate, with criteria 1 and 2 waived by that directive.

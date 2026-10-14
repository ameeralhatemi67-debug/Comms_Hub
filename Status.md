---
type: status
project: "[[projects/ideas/Comms_Hub/Comms Hub|Communication Department Hub]]"
tags:
  - comms-hub
  - document/status
  - status/active
created: 2026-08-18
updated: 2026-10-14
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

## Film deliverable completed 2026-10-14

The owner requested a Comms Hub version of the supplied Arabic motion-video reference. The standalone package is in `videos/comms-hub-launch/`: a 38.4-second portrait film, a separately composed landscape film, and a 15-second portrait teaser, all at 60 fps, with original synthesized music, Arabic captions, poster frames, editable artwork, a local preview, and render scripts. It uses the existing forest-green and gold brand and preserves the established Arabic terms. Illustrative scenes explain work, version-bound approval, the media library, mail and messaging, planning, and permissions; no live publishing or AI capability is claimed.

Verification: typecheck and production build passed; all 153 existing tests passed. Film browser and media verification passed 128 checks, including deterministic seeking, both layouts, transitions, play/pause, fonts, audio, mobile overflow, reduced-motion initial state, and full decode of all three exports. Video is Rec.709 limited-range H.264 with 48 kHz stereo AAC. Two encoded-frame color comparisons passed. Re-run `node qa/comms-hub-film.cjs`; full evidence is beside the film under `qa/`. The application interface and the paused Permissions P4 work were not changed. Next action for this deliverable: review the film and copy; the application next actions below still apply.


## Entry flow and honest labels, 2026-10-14

Steps 1 and 2 of the order in `Readiness_Audit.md` are built and verified except for the signed-in screens. An administrator can now send a real invitation, see how far each person got, resend the confirmation, send a reset link; access requests notify the leaders (in the site and by email) and tell a refused applicant; the sign-in screen has an expired-link state and stops revealing which addresses have accounts; «الأفكار» hands the text to the real «إنشاء»; the mock pages say «لم يُبنَ بعد». Database rule run 30 of 30, `npm test` 185 of 185, signed-out browser check 14 of 14.

- **Waiting on the owner:** the one-time Supabase Auth SMTP change and address settings in `Entry_Flow_Setup.md`, then the signed-in walkthrough in the same file.
- **Next action:** step 3 of the audit order, the real storage tab with file locations and the provider interface (S2), with no change to how files behave.

Updated 2026-10-10. **CHECKPOINT 0.2 IN PROGRESS.** Checkpoint 0.1 is complete and accepted. Phase 0.2.1 (Workflow Mapping) is complete. **Phase 0.2.2 (Guided Department Validation) is closed on the Director's response alone:** R01 arrived on 2026-10-10, and the same day the owner directed that the Director's input is enough, so the remaining participants and the frozen build are skipped (`[-]` in `Roadmap.md`; exit gate criteria 1 and 2 waived by that directive). Phase 0.2.3 Round 1 corrections start on 2026-10-11. The day-by-day plan is in `Roadmap.md` under "Work plan from 2026-10-11".

Design: Direction A is the default; B only for larger media previews. See DESIGN.md. The new identity, «الهوية الجديدة لمركز الاتصال», is **built as an option, not approved as the default** (2026-10-10, owner directive): a double-click on the sidebar logo switches between the two designs, remembered per browser. See `MVP_draft.md` section 58. D-01 decides which design is the default.

## Building the reference into the site (from 2026-10-12)

The plan is `Reference_Build_Plan.md`, five steps; the reference is kept in `reference/comms-hub-reference-v5.html`.

- **Step 1, the work cycle in the database: done 2026-10-12.** Works, stages with approval points, versioned text and copies, approval per part bound to versions, projects, events, reminders, requests, notifications, connected accounts with YouTube and plan templates are in the Supabase project `comms-hub`, every rule in the database. Database rule run 135 of 135, `npm test` 104 of 104, typecheck and build clean. Nothing visible yet: the work pages still show the browser mock.
- **Step 2, the shared interaction kit: done 2026-10-12.** Hold to confirm on the library, mail and messaging; undo of library edits, decided in the database and followed by Google Drive; the help system (first-visit guides, section tips, the help button with guide mode, the page guide) with progress per person in the database, written for the library pages, mail and messaging. `npm test` 112 of 112, kit rule run 56 of 56, browser check of the kit 40 of 40. Not yet seen signed in: the owner walkthrough is in `progress.md`.
- **Step 3, «العمل», the work page and «إنشاء»: done 2026-10-12.** The work pages read and write the database: attention counts, tabs, list, status board and team view; the work page with stages, approval points, text and platform copies with versions, library media, mail and messaging links, comments, log and role-aware actions; «إنشاء» with automatic assignment and dates worked back from the due date; both plan editors with drag (mouse and touch) and arrows; mail «تحويل إلى عمل» now opens «إنشاء» and the database issues the number. `npm test` 123 of 123, browser check of the pages 264 of 264, typecheck and build clean. Not yet seen signed in: the owner walkthrough is in `progress.md`. The review decision and publishing come in Step 4; until then a work sent for review waits there.
- **Step 4, «الموافقات والنشر», the review screen, «الحسابات المرتبطة» and notifications: done 2026-10-12.** Approvals (waiting for me, sent by me, the decision log) and publishing (account authorisation, at-risk dates, ready, scheduled, partial or failed with retry, published; a simulation); the review screen part by part with a word difference, file preview and timed notes, and approve, request changes or reject; the linked accounts at `/channels` with YouTube; the notifications drawer in three tiers from the database. The approval rules were reviewed first: one gap found and fixed (an uploader could approve their own file version from a work's review). Approval rule run 71 of 71, `npm test` 129 of 129, browser check of the pages 495 of 495, typecheck and build clean. Not yet seen signed in: the owner walkthrough is in `progress.md`.
- **Step 5, «التقويم», «المشاريع» and «الطلبات», then acceptance: built 2026-10-13, local commit, not pushed.** The calendar on the database (day, week, month, list; a lane per account; project bands; stages and tasks across days; team load; events and private reminders; warnings that do not block; publish-date moves as requests and direct delivery and stage moves for leaders, by drag with mouse or finger); «المشاريع» and the project page (timeline, who works on what, works, tasks; a new project with a works plan created in one step); «الطلبات» (extensions with what moves first, folder access, date moves, work requests to assign, held mail and ask-first confirmations as links); Home on real counts; help for all sixteen pages. The review of the rules across Steps 1 to 5 found and closed gaps, the main one that any signed-in account could read a restricted work's text through `work_parts`. Rule run 113 of 113, Step 1 and Step 4 runs re-run 135 of 135 and 71 of 71, `npm test` 141 of 141, browser check 1010 of 1010, typecheck and build clean. Delegation while away waits for the approval-rights work (owner decision). Not yet seen signed in: the owner walkthrough of the whole cycle is in `progress.md`.
- **Next action:** owner asks for the push; then the signed-in walkthrough of the whole cycle (create, hand over, approve, schedule, publish simulation, undo, help) and the findings recorded.

## Permissions, urgency and WhatsApp (from 2026-10-13)

The plan is `Permissions_Plan.md` (accepted, D-1 to D-13). Local commits, not pushed.

- **P1, the permission engine: done.** Role templates, standing, temporary and one-time grants and an append-only log in the database; existing checks moved onto it with nobody's behaviour changed. Rule run 122 of 122 plus 5 of 5.
- **P2, «الحسابات»: done.** Four tabs, the person's card with every permission's source, the grant dialog, presets, the role matrix; the director and assistant open it. Rule run 137 of 137, browser check 271 of 271.
- **P3, asking and the connections: done.** Requests from a locked control, messaging, mail and «الطلبات»; Home, notices, the activity log, timed folder access. Request run 49 of 49; the six earlier runs unchanged; browser checks 414 of 414 and 1010 of 1010; `npm test` 153 of 153.
- **P4, urgency 0 to 3: done 2026-10-14.** A four-step picker in the composer («للانتباه» for anyone, «مهم» by permission and offered as a request when locked, «عاجل» fixed to the leaders), a mark per level, acknowledgement at level 3 only, task cards of priority «عاجلة» shown as level 3; the old `urgent` column removed after checking nothing read it. Urgency run 41 of 41, chat run 22 of 22, browser check 483 of 483.
- **P5a, WhatsApp without the real sender: done 2026-10-14.** Members link a number with a six-digit code from the system number (the code is made on the server and never stored or shown); urgent messages are routed inside `chat_send` from room membership and verified links; the outbox holds ids only and cannot name a recipient outside the message's room; the push is off until granted, with a daily cap and the recipient's mute; one key-gated dispatch route for the bridge; signed links to the exact message. Screens: «واتساب» on «الحساب», «واتساب النظام» in «الإعدادات», the person's card (number for administrators only), the push and delivery line in «المراسلة». WhatsApp run 98 of 98 including the four-room routing case, route check 25 of 25, browser check 625 of 625, `npm test` 168 of 168.
- **P5b, the pull bridge: built 2026-10-14, not yet linked.** `bridge/whatsapp/` (adapted from the Hedayah bridge): polls the site with the key, sends only to the claimed number of each claimed row, reads and answers nothing, QR in its own terminal, `run-bridge.bat`. Offline tests 14 of 14. **Not performed:** the first QR link of the system number and a real message, which need the owner's phone. Until the owner stores the key's fingerprint and switches the system number on, nothing is sent.
- **Not seen signed in:** no agent has seen the signed-in screens of P2 to P5a against the real database (no sign-in bypass exists); they were checked rendered with fixture data. Owner walkthroughs are in `progress.md`.
- **Next action:** the owner links WhatsApp with the 14-step walkthrough in `bridge/whatsapp/README.md` (also in the P5b entry of `progress.md`), runs the signed-in walkthroughs of P2 to P5a, and asks for the push when satisfied (all permission steps are local commits).

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
| D-04 | Confirm or overrule the eight design-note recommendations (`validation/design-notes/README.md`), including whether to show an urgent mark and the editor's name in the prototype. Partly settled 2026-10-12: urgent mark, close with reason, several campaigns, stage deadlines, stage templates, editor shown on a version and per-part approval are accepted for the real work pages (see `progress.md`) |
| D-05 | Done 2026-10-12: version 5 of «النموذج المرجعي للمركز» and its rules accepted with no notes. Urgent work is approved by the director and the assistant; giving the right to approve to others comes later. No sample data in the database. See `progress.md` |

## Verified capability

- **Messaging tab and profiles (2026-10-12).** «المراسلة» beside «البريد» at `/mail/chat`: direct chats, groups tied to a campaign or work item, announcement channels, replies, forwarding, reactions, stars, pins, edits, deletes, pictures, files and recorded voice notes, polls, tasks, approval cards, urgent messages with acknowledgement, slash commands, moving a conversation to formal mail, live through Realtime. The account page gains «مظهرك في البريد والمراسلة» (picture, name, headline, colour, presence, signature). `npm test` 87/87, database rule run 22/22. Not yet seen signed in by an agent.
- **Mail is live (2026-10-12).** Pushed and deployed to `comms-hub-three.vercel.app` with the Gmail variables set; the public date page and the sign-in guard answer in production.

- **Mail page (2026-10-11).** Real internal mail, the shared Gmail mailbox (IMAP and SMTP with an app password), approval of outside mail, and approval, date, task and progress cards that act through the media rules. Rules in Postgres; `npm test` 74/74, database rule run 25/25, `qa/mail-public.cjs` 15/15. Not yet seen signed in, and Gmail is not connected yet: owner steps in `progress.md`.
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
- Accounts are real since 2026-10-11 (owner directive, recorded in `progress.md`): email and password sign-in, approved accounts, access requests, roles and page permissions in the Supabase project `comms-hub`; the role switch is administrators only. Uploads go to Google Drive (a personal Gmail account for now). The media section is real since 2026-10-11: folders with four permission levels and locks, pipeline stages, asset pages, tasks, review links and an append-only activity log, enforced in the database. The work cycle is real since 2026-10-12 (works, approvals, projects, calendar, requests, notifications; built through Step 5 of `Reference_Build_Plan.md`). No real publishing, AI, NAS or workers. Permissions are real since 2026-10-13. WhatsApp delivery of urgent and pushed messages is built (2026-10-14) and waits for the owner to link the system number to the bridge on their computer.
- No delegation of review authority and no urgent or crisis path exist. Both are recorded as unsupported assumptions, not oversights.
- This is not formal accessibility certification, production readiness or department sign-off. **Human validation rests on one participant, the Director, by owner directive; the exit gate's six-participant and five-role-group criteria are waived, not met.**
- Extra ideas outside the Roadmap (video and photo editing, agent suggestions, Severity 4 preferences) are parked in `Ideas_Backlog.md`. None is planned work.
- Phase 0.2.1 corrected only defects that contradict `MVP_draft.md` on their face. It deliberately did not resolve any of the seven open questions, add delegation or an urgent path, change any Arabic term, or restructure the composer. Those belong to Phase 0.2.3, after real findings exist.

Evidence, reproduction instructions and precise accepted scope for Checkpoint 0.1: [qa/ACCEPTANCE.md](qa/ACCEPTANCE.md). Phase 0.2.1 correction evidence: [qa/checkpoint-02-corrections.json](qa/checkpoint-02-corrections.json).

## Next action

Permissions, urgency and WhatsApp (P1 to P5b) are built as local commits: the owner links the system number with `bridge/whatsapp/README.md` and walks the signed-in screens (section above). Owner: ask for the push of the build steps (Steps 1 to 5 and P1 to P5b are local commits only; the live site still runs the mock work pages), then sign in and walk the whole work cycle with the walkthrough list of the 2026-10-13 entry in `progress.md`. The mail and messaging walkthrough of 2026-10-12 is still open too. Then the earlier items below.

1. Director: run the re-check `validation/recheck-R01.md` on the current build. It covers the three failed tasks, each Round 1 correction, the open design questions, T6, D-01 (which design is the default, on the live logo toggle) and the command palette.
2. Owner: decide the eight design-note recommendations (D-04) and confirm D-02.
3. Agent, after the re-check: record the addendum, close or reopen each finding, and start Round 2 if any correction is rejected. If D-01 approves the new identity as default, rewrite `DESIGN.md` and flip the default.

Phase 0.2.2 is closed on the Director's response by owner directive; tasks 0.2.2.2 to 0.2.2.8 are skipped, not pending. Version 1 remains gated on the Checkpoint 0.2 exit gate, with criteria 1 and 2 waived by that directive.

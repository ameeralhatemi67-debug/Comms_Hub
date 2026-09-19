---
type: status
project: "[[Comms Hub|Communication Department Hub]]"
tags:
  - comms-hub
  - document/status
  - status/active
created: 2026-08-18
updated: 2026-09-19
status: active
parent: "[[Comms Hub]]"
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

[[Comms Hub|Comms Hub Overview]] | [[Roadmap|Product Roadmap]] | [[progress|Progress Log]] | [[MVP_draft|MVP Draft UI Shell]] | [[discussions_list|Master Discussions Index]]

---

# Communication Department Hub — Current Status

Updated 2026-09-19. **CHECKPOINT 0.2 IN PROGRESS.** Checkpoint 0.1 is complete and accepted. Phase 0.2.1 (Workflow Mapping) is complete, including the pre-validation defect corrections in task 0.2.1.5. Phase 0.2.2 (Guided Department Validation) has not started and cannot start without real department participants.

Design: Direction A throughout; B only for larger media previews. See DESIGN.md.

## Verified capability

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
- No real authentication/RBAC, database, OAuth, publishing, mail, AI, Drive/NAS, workers, external notification delivery or production secrets/services.
- No delegation of review authority and no urgent or crisis path exist. Both are recorded as unsupported assumptions, not oversights.
- This is not formal accessibility certification, production readiness or department sign-off. **Actual human validation has still not occurred.**
- Phase 0.2.1 corrected only defects that contradict `MVP_draft.md` on their face. It deliberately did not resolve any of the seven open questions, add delegation or an urgent path, change any Arabic term, or restructure the composer. Those belong to Phase 0.2.3, after real findings exist.

Evidence, reproduction instructions and precise accepted scope for Checkpoint 0.1: [qa/ACCEPTANCE.md](qa/ACCEPTANCE.md). Phase 0.2.1 correction evidence: [qa/checkpoint-02-corrections.json](qa/checkpoint-02-corrections.json).

## Next action

Arrange real department participants and run Phase 0.2.2 using `validation/validation-scripts.md`. The Checkpoint 0.2 exit gate in `Roadmap.md` requires at least six distinct participants, two of them leadership, covering five role groups, with a completed rubric sheet per session. Nothing in Phase 0.2.2 can be executed, simulated or substituted by an agent. Version 1 remains gated on that validation.

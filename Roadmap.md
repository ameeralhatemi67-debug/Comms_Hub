---
type: roadmap
project: "[[Comms Hub|Communication Department Hub]]"
tags:
  - comms-hub
  - document/roadmap
  - status/active
  - planning/foundation
created: 2026-08-18
updated: 2026-09-18
status: active
active_version: "Version 0 UI Prototype"
planning_horizon: "1–12 months"
parent: "[[Comms Hub]]"
aliases:
  - Communication Hub Roadmap
  - خريطة طريق مركز الاتصال المؤسسي
related:
  - "[[Status|Current Status]]"
  - "[[progress|Progress Log]]"
  - "[[MVP_draft|MVP Draft UI Shell]]"
  - "[[discussions_list|Master Discussions Index]]"
---

[[Comms Hub|Comms Hub Overview]] | [[Status|Current Status]] | [[progress|Progress Log]] | [[MVP_draft|MVP Draft UI Shell]] | [[discussions_list|Master Discussions Index]]

---

# Communication Department Hub — Product Roadmap

> [!note] Update as you work
> This roadmap is a living operational document. It establishes the planning rules, delivery horizons, and workflow boundaries for the Communication Department Hub. Update timelines, progress markers, and horizon items as real development proceeds.

---

## Product Purpose

The **Communication Department Hub** is a specialized, institutional management and operations platform engineered for corporate communications teams. It provides a unified workspace that bridges campaign planning, collaborative content creation, multi-tier approval governance, secure multi-channel publishing, and long-term digital asset preservation.

The hub serves eight confirmed organizational and administrative roles:
1. **مدير الاتصال المؤسسي** (Director of Corporate Communication) — Strategic authority and executive release governance.
2. **مساعد مدير الاتصال المؤسسي** (Assistant Director) — Operational oversight, task allocation, and delegated review.
3. **كاتب المحتوى** (Content Writer) — Editorial drafting, messaging alignment, and revision iteration.
4. **المصمم** (Designer) — Visual assets, brand identity consistency, and multi-format exports.
5. **المنتج الإعلامي** (Media Producer) — High-resolution video, motion graphics, and media pipeline processing.
6. **مسؤول النشر وإدارة الحسابات** (Publishing & Account Officer) — Channel scheduling, token verification, and release execution.
7. **عضو** (Department Member) — Collaborative contribution, campaign participation, and internal review.
8. **Admin** (System Administrator) — Infrastructure configuration, integration secrets, security policies, and user management.

---

## Core Operational Journey

The primary workflow routes work items smoothly from initial campaign assignment to verified external distribution:

```mermaid
flowchart LR
    Plan[Campaign & Work Inception] --> Create[Collaborative Content & Media Creation]
    Create --> Review[Internal Review & Specialist Sign-Off]
    Review --> PolicyApproval[Multi-Stage Governance Approval]
    PolicyApproval --> ReleaseGate[Release Operator Preflight Check]
    ReleaseGate --> Dispatch[Automated Multi-Channel Dispatch]
    Dispatch --> Monitor[Attention, Analytics & Archival]
```

---

## Delivery Horizons

The active scope is the UI Prototype MVP 0.1 in [[MVP_draft]]. Validate the prototype with department users before platform implementation. Future production work remains planned below; dates will be set after validation.

```mermaid
flowchart LR
    Spec[Specification foundation] --> UI[UI Prototype MVP 0.1]
    UI --> Validate[Department workflow validation]
    Validate --> Platform[Platform and database foundations]
    Platform --> Core[Work and approval engine]
    Core --> Integrations[Publishing and storage integrations]
    Integrations --> Hardening[Security, recovery and production pilot]
```

> [!important] Scope and Planning Boundaries
> Detailed implementation tracking begins once development commences. Specific development cycles, milestones, and work packages must be defined collaboratively as each horizon approaches, ensuring that real learning from early stages directly informs subsequent engineering work.

---

## Planning & Operating Rules

### Document Responsibilities

The vault maintains a strict separation of document concerns across four core operational files:

| Document | Primary Responsibility | Update Frequency |
|---|---|---|
| `Roadmap.md` | Planned directions, dependency order, delivery horizons, and exit gates. | At milestone boundaries and major scope alignments. |
| `Status.md` | Present condition, active focus, capability health matrix, and next actions. | At the conclusion of every active work session. |
| `progress.md` | Dated outcomes, verified evidence, benchmark results, and limitations. | Whenever a meaningful change is completed and verified. |
| `MVP_draft.md` | Authoritative UI shell layout, page specifications, and user flows. | When interface requirements or user interactions change. |

### Work Hierarchy & Breakdown Standards

Implementation work across the Communication Department Hub follows a four-tier breakdown structure modeled on proven project governance standards:

```
Version (X.0)
└── Checkpoint (X.Y)
    └── Phase (X.Y.Z)
        └── Task (X.Y.Z.W)
```

1. **Version (`X.0`) — Major Release Generation:**
   - Represents an overarching strategic milestone or product release lifecycle.
   - Contains high-level strategic objectives, core architectural boundaries, and the group of sequential checkpoints required for release.
2. **Checkpoint (`X.Y`) — Functional Capability Gate:**
   - Represents a major sequential milestone delivering an end-to-end usable capability.
   - Contains a concrete **Outcome Statement** (what capability is unlocked), prerequisite dependencies, and an **Exit Gate** (the strict verification criteria that must pass before advancing).
   - Exactly **one** checkpoint is actively in progress at any given time.
3. **Phase (`X.Y.Z`) — Thematic Subsystem Work Package:**
   - Represents a cohesive grouping of tightly coupled tasks focusing on a single subsystem (such as database schema, auth policies, queue worker, or UI shell).
   - Contains the specific set of atomic tasks needed to implement and verify that subsystem.
4. **Task (`X.Y.Z.W`) — Atomic Executable Unit:**
   - Represents an individual, bounded engineering task designed for completion within a single focused session.
   - Contains a standardized status marker (`[ ]`, `[/]`, `[x]`, `[-]`), an unambiguous definition of done, and an evidence requirement (unit test, terminal output, or artifact log) required for completion.

### Task State Conventions

When work items are scheduled in future planning iterations, use these standardized status markers:
- `[x]` = Completed and verified with concrete evidence (passing tests, recorded commands, or logs).
- `[/]` = Actively in progress in the current work session.
- `[ ]` = Planned and specified, but implementation has not started.
- `[-]` = Deliberately cancelled or superseded, accompanied by an explicit recorded reason.

### Engineering Truth & Safety Principles

1. **Evidence Over Assertion:** A feature is never marked completed simply because code was written or a mock interface was rendered. A capability is verified only when its real execution path runs successfully against real or realistic test fixtures.
2. **Recoverable Baselines:** Every significant file mutation must be preceded by a clean, recoverable baseline (Git commit or verified backup snapshot). Uncommitted work must never be silently overwritten, merged, or discarded.
3. **Prototype Boundary:** Version 0 uses local mock state only. For future production versions, long-running or external platform interactions belong in durable background jobs. This rule does not authorize workers or integrations in MVP 0.1.
4. **Zero Data Loss:** All modifications to documentation and code must preserve existing institutional context, Arabic terminology, and domain requirements.

---

## How to Proceed from This Scaffolding

When starting active implementation on the Communication Department Hub, follow this sequence:

1. **Review Current Status:** Consult `Status.md` to confirm the baseline state and identify the current active focus.
2. **Consult Architectural Specifications:** Reference the 11 detailed companion documents in `disscussios/` for deep architectural guidance:
   - [[disscussios/organizational_role_discussion|Organizational Roles & Permissions]]
   - [[disscussios/approval_policy_design|Approval Policies & Version Binding]]
   - [[disscussios/storage_lifecycle_disaster_recovery|Storage Lifecycle & 3-2-1 Disaster Recovery]]
   - [[disscussios/failure_handling_background_jobs|Background Jobs & Reliability Architecture]]
   - [[disscussios/connected_account_secrets_management|Connected Accounts & Secrets Management]]
   - [[disscussios/notification_model|Three-Tier Attention & Notification Model]]
   - [[disscussios/search_and_metadata|Search, Metadata & Arabic Taxonomy]]
   - [[disscussios/security_discussion|Security, Zero-Trust & Audit Logging]]
   - [[disscussios/emergency_workflows|Emergency Workflows & Kill-Switch Controls]]
3. **Structure Initial Work Packages:** When ready to commence coding, define the initial milestone block with clear acceptance criteria and exit gates.
4. **Maintain Cadence:** Work on one bounded problem at a time, verify the result, log evidence in `progress.md`, update `Status.md`, and advance `Roadmap.md`.

---

## Version 0: UI prototype

### Checkpoint 0.1: UI Prototype MVP 0.1

**State:** Active. **Authority:** [[MVP_draft]].
**Outcome:** A runnable Arabic RTL product prototype for eight roles, using one connected Saudi National Day 2026 scenario.
**Exit gate:** Selected design; six high-fidelity Level A pages; lighter B/C pages; role simulation; verified end-to-end mock workflow and responsive layouts. No real backend, authentication, integrations, or publishing.

#### Phase 0.1.1: Scope and visual decision

- [x] 0.1.1.1 Inspect specifications and reconcile UI-first scope. Evidence: repository review and this reordered roadmap, baseline commit `7e45e2b`.
- [x] 0.1.1.2 Produce three distinct visual directions, each with Home, Work, Work detail, Create, Approvals/Publishing, and Media at desktop and mobile. Evidence: `design-review/index.html`, 36 screenshots, three desktop boards, and `design-review/verification.json` with 72 viewport checks passing. Visual boards inspected.
- [x] 0.1.1.3 Record the user's selected or combined direction. User selected A on 2026-09-19; B contributes only larger media previews. Exact boundary recorded in `DESIGN.md`.

#### Phase 0.1.2: Selected foundation

- [x] 0.1.2.1 Scaffold Next.js, TypeScript and Tailwind; establish selected RTL tokens, shell and responsive navigation. Evidence: start/build checks and browser navigation.
- [/] 0.1.2.2 Add coherent mock entities and eight-role View As simulation. Evidence: linked campaign data and visible role-specific priorities.

#### Phase 0.1.3: Core workflow

- [/] 0.1.3.1 Implement Home, Work, Work detail and Create with forms, tabs, search, comments and mock review submission. Evidence: browser interaction walkthrough.
- [/] 0.1.3.2 Implement Approvals/Publishing, Calendar and Media Library with revision review, scheduling, previews and per-channel results. Evidence: approve/schedule/publish/partial-failure walkthrough.

#### Phase 0.1.4: Supporting experiences

- [/] 0.1.4.1 Add believable Mail, Ideas, Analytics and Monitoring, plus Admin, Settings and Account shells. Evidence: page and central-action checks.
- [/] 0.1.4.2 Connect notifications, activity, empty/loading/error states and mock outcomes. Evidence: cross-page state checks; notification read state separate from approval state.

#### Phase 0.1.5: Acceptance and handoff

- [/] 0.1.5.1 Verify 1440/1280 desktop, 768–1024 tablet and approximately 390 mobile; test central dialogs, roles and keyboard navigation. Evidence: screenshots and focused QA log.
- [/] 0.1.5.2 Demonstrate the full mock workflow, run build checks, verify no production services/secrets, and synchronize tracking. Evidence: acceptance record and runnable instructions.

Budget control: use the stricter 60% five-hour ceiling from the request. Initial account usage was 2%; treat 60% total account usage as a conservative stop threshold. Account usage is shared, so the delta is approximate. No subagents planned for the design gate. Preserve implementation effort for one selected direction.

### Checkpoint 0.2: Department validation

Planned after 0.1. Compare the provisional workflow with actual department work, record corrections, then authorize the production plan. This is a separate validation gate, not backend work in this run.

## Version 1 MVP (future, after prototype validation)

**Goal:** Establish the foundational production release of the Communication Department Hub, delivering a reliable, secure workspace for departmental campaign planning, collaborative creation, multi-tier approval governance, and automated multi-channel publishing.

**Status:** Planned, blocked on prototype validation. Preserve database, permissions, durable jobs, real publishing, storage, security and recovery as future work.

> [!note] Checkpoints, Phases, and Tasks Definition
> Detailed checkpoints, phases, and atomic tasks for Version 1 MVP will be defined sequentially as active development commences, adhering to the Work Hierarchy & Breakdown Standards and informed by real engineering feedback.

---

^comms-hub-roadmap-boundary

## 2026-09-19 implementation evidence

Design gate complete. Scaffold build/typecheck pass. Core acceptance journey passes in browser, including revision, approval, schedule, calendar, partial publish and retry. 60 route/viewport checks pass. Remaining task checkboxes stay partial because all eight role experiences, every supporting action, complete keyboard/accessibility review and visual QA are not fully verified. See qa/verification.json and Status.md. Earlier 60% budget wording applies to the design session only; implementation used the subsequent user limits.


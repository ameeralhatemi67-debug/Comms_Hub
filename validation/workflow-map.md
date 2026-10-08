---
type: validation
project: "[[projects/ideas/Comms_Hub/Comms Hub|Communication Department Hub]]"
tags:
  - comms-hub
  - document/validation
  - checkpoint/0.2
created: 2026-09-19
updated: 2026-09-19
status: active
phase: 0.2.1 Workflow Mapping
parent: "[[Roadmap|Product Roadmap]]"
aliases:
  - Department Workflow Map
  - خريطة سير العمل في قسم الاتصال
related:
  - "[[Roadmap|Product Roadmap]]"
  - "[[MVP_draft|MVP Draft UI Shell]]"
  - "[[validation-scripts|Guided Validation Scripts]]"
  - "[[feedback-rubric|Validation Feedback Rubric]]"
---

[[Roadmap|Product Roadmap]] | [[Status|Current Status]] | [[MVP_draft|MVP Draft UI Shell]] | [[validation-scripts|Validation Scripts]] | [[feedback-rubric|Feedback Rubric]]

---

# Checkpoint 0.2, Phase 0.2.1 — Department Workflow Map

Written for the facilitator and the reviewers who will run Phase 0.2.2, and for
whoever applies the corrections in Phase 0.2.3.

## 1. What this document is, and what it is not

This is the prototype's **stated model** of how the Communication Department
works, written down explicitly so that real department staff can contradict it.
It was produced by an agent from the specification record, not from observing
the department. Every workflow below is therefore a **hypothesis**, and every
claim in section 4 is a claim the prototype makes, not a fact about the
department.

Nothing here is validated. Phase 0.2.2 exists precisely because an agent cannot
know whether these workflows match reality. Where this document guesses, it says
so and routes the guess to a numbered question for the human sessions.

**Sources.** `MVP_draft.md` (authoritative for the interface), the eleven
architecture documents in `disscussios/` (cited by name, never edited), and the
prototype source in `src/`.

## 2. Role inventory

The eight confirmed roles, with the authority each actually holds in the
prototype today. Authority is enforced in `src/lib/domain.ts`.

| Role | Arabic | Create | Review | Publish | System |
|---|---|---|---|---|---|
| Director | مدير الاتصال المؤسسي | yes | yes | no | no |
| Assistant Director | مساعد مدير الاتصال المؤسسي | yes | yes | no | no |
| Content Writer | كاتب المحتوى | yes | no | no | no |
| Designer | المصمم | yes | no | no | no |
| Media Producer | المنتج الإعلامي | yes | no | no | no |
| Publishing Officer | مسؤول النشر وإدارة الحسابات | no | no | yes | no |
| Department Member | عضو | yes | no | no | no |
| Admin | Admin | no | no | no | yes |

Two separations of duty are deliberate and should be tested hard in 0.2.2:
the Publishing Officer cannot approve what they dispatch, and Admin holds no
content authority at all. Both come from
`disscussios/organizational_role_discussion.md`.

## 3. Representative workflows

Nine workflows, written as ordered steps. Each step names the acting role, what
triggers it, and where it hands off. **[PROTOTYPE]** marks a step the prototype
implements; **[GAP]** marks a step the prototype does not implement.

### W1 — Campaign inception

1. Director, triggered by the annual communication plan or a leadership request,
   decides a campaign exists and names it. **[PROTOTYPE]** Create page, campaign
   step.
2. Director or Assistant Director sets the campaign date and a one-line brief.
   **[PROTOTYPE]**
3. Assistant Director decides which content pieces the campaign needs and
   creates a work item for each. **[PROTOTYPE]** Create page.
4. Assistant Director assigns each work item to a specialist. **[GAP]** The
   prototype assigns to a *role*, not to a named person; see A25.
5. Handoff to W2, W3 or W4 depending on the content type.

*Decision point at step 3:* whether a piece is one work item with channel
variants, or several work items. The prototype assumes the former.

### W2 — Content authoring (Content Writer)

1. Writer opens the work item assigned to them. **[PROTOTYPE]** Home, then Work.
2. Writer drafts the master Arabic copy. **[PROTOTYPE]** Composer, master tab.
3. Writer adapts the copy per channel where the channel demands it.
   **[PROTOTYPE]** Composer, channel tabs.
4. Writer selects the approved asset version to accompany the copy.
   **[PROTOTYPE]**
5. Writer works the production checklist. **[PROTOTYPE]** Fixed four steps; see
   B7.
6. Writer submits for review, which freezes the exact copy, asset version and
   channels into a release package. **[PROTOTYPE]**
7. Handoff to W5.

### W3 — Design production (Designer)

1. Designer receives the design work item. **[PROTOTYPE]**
2. Designer produces the artwork outside the hub, in the design tool.
   **[GAP, deliberate]** Creation tooling is out of scope.
3. Designer uploads the artwork as a new asset version. **[GAP]** Upload is
   deferred; the prototype shows fixed illustrative assets with version
   histories. See A17.
4. Designer binds the chosen asset version to the work item. **[PROTOTYPE]**
5. Designer submits for review. **[PROTOTYPE]**
6. Handoff to W5.

### W4 — Media production (Media Producer)

1. Producer receives the video or coverage work item. **[PROTOTYPE]**
2. Producer shoots and edits outside the hub. **[GAP, deliberate]**
3. Producer registers the cut as an asset version and marks the item in
   production. **[PROTOTYPE]** status `IN_PRODUCTION`.
4. Producer submits the cut for review. **[PROTOTYPE]**
5. On a change request, producer re-edits and submits a new revision, which
   supersedes the previous release package. **[PROTOTYPE]**
6. Handoff to W5.

### W5 — Review and approval

1. Reviewer, triggered by an action notice, opens the submitted release.
   **[PROTOTYPE]** Approvals page, review tab.
2. Reviewer reads the exact copy, the exact asset version and the exact channel
   list that will ship. **[PROTOTYPE]**
3. Reviewer decides: approve, request changes with a written reason, or reject
   with a written reason. **[PROTOTYPE]** A reason is mandatory for the latter
   two.
4. On approve, the release is bound to that revision and becomes visible to the
   Publishing Officer. **[PROTOTYPE]**
5. If the author edits afterwards, the approval is invalidated and a new
   revision must be re-reviewed. **[PROTOTYPE]**
   `disscussios/approval_policy_design.md` section 3.
6. Handoff to W6.

*Decision point at step 3:* who may approve what. The prototype allows either
the Director or the Assistant Director to approve anything. Whether the
department requires the Director personally for certain content is **Q1**.

### W6 — Release and publication (Publishing Officer)

1. Officer sees approved releases awaiting a date. **[PROTOTYPE]** Home tile and
   Approvals publishing tab.
2. Officer checks the connected account health for the target channels.
   **[PROTOTYPE]** Publisher home panel, added in 0.2.1.5.
3. Officer schedules the release in Riyadh time, or dispatches immediately.
   **[PROTOTYPE]**
4. The calendar shows the scheduled publication. **[PROTOTYPE]**
5. Dispatch returns a per-channel result. Partial failure is isolated.
   **[PROTOTYPE]** Simulated.
6. Officer retries only the failed channels; a successful channel is never
   republished. **[PROTOTYPE]**
7. Handoff to monitoring and archival.

### W7 — Department member contribution

1. Member is asked to contribute to a campaign, usually coverage or a local
   story. **[PROTOTYPE]**
2. Member drafts their contribution and submits it. **[PROTOTYPE]**
3. Member follows comments on their own item. **[PROTOTYPE]**
4. Member does not review, schedule or publish. **[PROTOTYPE]** Enforced.

### W8 — Inbound intake

1. A request arrives from outside the department, typically from the Events
   team or leadership, by email or messaging. **[PROTOTYPE, thin]** Mail page
   shows one canned message.
2. Assistant Director decides whether it becomes a work item, and under which
   campaign. **[PROTOTYPE]** One-click conversion.
3. The new item enters W2, W3 or W4.

*The prototype assumes intake is rare and manual. Whether inbound requests are
in fact the department's dominant intake path is* **Q7**.

### W9 — System administration

1. Admin manages user accounts and role assignment. **[PROTOTYPE]** Shell only.
2. Admin connects and reconnects channel and storage integrations.
   **[PROTOTYPE]** Shell only.
3. Admin watches system health, storage consumption and security events.
   **[PROTOTYPE]** Shell only.
4. Admin never approves or publishes content. **[PROTOTYPE]** Enforced.

## 4. Assumption comparison

Every assumption the prototype currently makes, and how well it is supported.
25 assumptions: 15 supported, 6 partially supported, 4 unsupported.

| # | Assumption the prototype makes | Support | Where, or why not |
|---|---|---|---|
| A1 | One active campaign frames the department's current work | Supported | `campaigns` in state; one seeded campaign |
| A2 | Campaign creation precedes work item creation | Partial | Create page campaign step exists, but new campaigns get no board, filter or calendar of their own |
| A3 | Each work item has exactly one accountable owner | Supported | `Work.owner` |
| A4 | One composer serves every content type | Partial | Type is a dropdown; the form itself does not change for video, design or press release |
| A5 | Copy, asset version and channels ship as one bound package | Supported | `Release` in `domain.ts` |
| A6 | Approval binds to an exact revision | Supported | `ready()` compares release revision to current revision |
| A7 | Editing after approval invalidates that approval | Supported | `edit` case; `approval_policy_design.md` section 3 |
| A8 | Editing after publication preserves what was actually published | Supported | `PublicationRecord`, added in 0.2.1.5 |
| A9 | A single review stage is enough before release | Partial | One approve action. The specification allows multi-stage governance |
| A10 | A change request or rejection requires a written reason | Supported | Enforced in the reducer |
| A11 | A rejected item stays rejected until resubmitted | Supported | Status `REJECTED`, resubmission allowed |
| A12 | Only the Publishing Officer schedules and dispatches | Supported | `actor.publish` guard |
| A13 | The approver and the publisher are different people | Supported | Publishing Officer has no review authority |
| A14 | Partial channel failure is isolated, retry never republishes a success | Supported | `result` and `retry` cases; covered by test |
| A15 | Channel variants are authored per channel | Supported | Composer channel tabs |
| A16 | Assets are versioned and approval binds an exact version | Supported | `assetVersion` on `Content` |
| A17 | Real upload and playback are not needed to validate the workflow | Unsupported | Deliberately deferred; illustrative assets only. Designers and producers may disagree |
| A18 | Notifications are role-scoped and three-tier | Supported | `Notice.for` and `noticesFor()`, added in 0.2.1.5 |
| A19 | Review authority never needs delegating | Unsupported | No delegation exists. Leave and travel are ordinary; see E2 |
| A20 | Every release follows the same review path | Unsupported | No urgent or crisis path; see E3 and `disscussios/emergency_workflows.md` |
| A21 | One deadline per work item is enough | Partial | Only a final `due` date; no per-stage dates, so slippage surfaces late |
| A22 | Month and agenda calendar views are enough | Partial | Specification section 27 also asks for week, day and date-level creation |
| A23 | Admin holds no content authority | Supported | Enforced and covered by test |
| A24 | Inbound intake is occasional and manually converted | Partial | One canned message; no real mailbox, no triage, no sender history |
| A25 | Assigning work to a role is equivalent to assigning it to a person | Unsupported | `owner` is a role key. A department with two designers cannot say which one |

## 5. Exceptions register

Real situations the department will hit that the current model does not handle
cleanly. Each is routed to a question for Phase 0.2.2.

| # | Exception | Why it matters | Routed to |
|---|---|---|---|
| E1 | Content is published, then must be corrected or taken down | The hub records publication but offers no correction or retraction path | Q2 |
| E2 | The approver is on leave while a dated release is pending | A single unavailable person blocks every release | Q3 |
| E3 | A crisis requires publication within the hour | The normal review path may be too slow, and bypassing it silently is worse | Q4 |
| E4 | A channel authorization expires between approval and dispatch | Discovered at dispatch time today; the officer needs it earlier | Q5 |
| E5 | A date-bound item misses its date | Nothing marks the item as now worthless; it lingers in the queue | Q6 |
| E6 | The asset is replaced but the copy is unchanged | Full re-approval may be disproportionate, or may be exactly right | Q1 |
| E7 | Another department requests work directly, outside any campaign | The model requires a campaign; ad hoc work has no home | Q7 |
| E8 | One piece of content serves two campaigns | `campaignId` is single-valued | Q7 |
| E9 | The Director edits the copy personally instead of requesting changes | Allowed today, and it silently makes the Director the author | Q1 |
| E10 | The officer also posts manually on the platform | The hub's record and the platform diverge with no reconciliation | Q5 |
| E11 | A rejected item should be archived, not reworked | No archive or cancel state exists; `[-]` exists for tasks but not for work items | Q6 |

## 6. Bottlenecks

Where the modelled workflow will slow the department down. These are design
concerns, not defects; each needs a department verdict before it is acted on.

| # | Bottleneck | Observation |
|---|---|---|
| B1 | Approval concentration | Every release funnels through two people, with no delegation and no per-content-type routing |
| B2 | One composer for every content type | A video producer fills in a form shaped for a social post; fields that matter to them are absent |
| B3 | Revision rounds without comparison | A reviewer re-reads the whole release to find what changed between revision 4 and 5 |
| B4 | Late-surfacing slippage | With only a final due date, a piece that is three days behind looks identical to one on track until the last day |
| B5 | Manual channel variants | Each channel's copy is retyped; nothing carries the master text forward or flags a variant left stale after a master edit |
| B6 | Late account health discovery | Connected account state is now visible on the publisher's home, but nothing blocks scheduling onto a channel that needs reconnection |
| B7 | Fixed production checklist | The same four steps apply to a press release and a drone shoot |

## 7. Terminology corrections to verify

The prototype's Arabic strings, each with the question to put to the department.
**No string is changed on an agent's judgement.** These are carried into the
sessions and only corrected in Phase 0.2.3 on a recorded department verdict.

| # | Current string | Used for | Question for the department |
|---|---|---|---|
| T1 | عضو | Department Member role | Is this what the department calls this person, or منسوب، موظف القسم، مشارك؟ |
| T2 | مسؤول النشر وإدارة الحسابات | Publishing Officer | Is the full title used in daily speech, or is there a shorter working term? |
| T3 | بحاجة إلى تعديل | `CHANGES_REQUESTED` | Does معاد للتعديل or مُعاد للكاتب read more naturally on a queue? |
| T4 | جاهز للنشر | `APPROVED` | Should the label say معتمد, since approval and readiness to publish are not the same thing? |
| T5 | نشر جزئي | `PARTIAL` | Is نشر ناقص or نشر غير مكتمل clearer to the officer? |
| T6 | العمل | Work item, and the section name | Is المهام or الأعمال the department's word for these? |
| T7 | الإصدار | Revision of a work item | Does الإصدار collide with the asset version in conversation? Would النسخة distinguish them? |
| T8 | الموافقات والنشر | Approvals and publishing page | Are these one place in the department's mind, or two? |
| T9 | مركز الاتصال المؤسسي | Product and department name | Is this the department's own name, or a name we invented for it? |

## 8. Open questions for Phase 0.2.2

These are the seven questions the guided sessions must answer. They are the
reason Phase 0.2.2 cannot be simulated.

- **Q1 — Approval authority.** Who must personally approve what? Is the
  Assistant Director's approval sufficient for all content, or only some? Does
  a media-only change need the same approval as a copy change (E6)? Is it
  acceptable for a reviewer to edit content directly (E9)?
- **Q2 — Life after publication.** What does the department do when published
  content is wrong? Correct, retract, or replace, and who decides (E1)?
- **Q3 — Delegation.** How is review authority handled during leave or travel
  today, and should the hub model that explicitly (E2, A19, B1)?
- **Q4 — Urgency.** Is there a real crisis or same-day path, and what governs
  it (E3, A20)?
- **Q5 — Channel account reality.** Who holds the channel credentials today,
  who notices when one expires, and does anyone post manually outside the
  process (E4, E10, B6)?
- **Q6 — Work that dies.** What happens to an item that misses its date or is
  abandoned (E5, E11)?
- **Q7 — Intake and campaign shape.** Where does work actually come from, how
  much of it sits outside any campaign, and can one piece serve two campaigns
  (E7, E8, A24)?

## 9. What this phase deliberately did not decide

Phase 0.2.1 corrected only defects that contradict `MVP_draft.md` on their face,
recorded in Roadmap task 0.2.1.5. It did **not** resolve any question in
section 8, add delegation, add an urgent path, change a single Arabic term, or
restructure the composer. Those depend on findings that only real participants
can produce, and belong to Phase 0.2.3.

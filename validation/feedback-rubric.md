---
type: validation
project: "[[Comms Hub|Communication Department Hub]]"
tags:
  - comms-hub
  - document/validation
  - checkpoint/0.2
created: 2026-09-19
updated: 2026-09-19
status: active
phase: "0.2.1 Workflow Mapping"
parent: "[[Roadmap|Product Roadmap]]"
aliases:
  - Validation Feedback Rubric
  - معيار تقييم جلسات التحقق
related:
  - "[[workflow-map|Department Workflow Map]]"
  - "[[validation-scripts|Guided Validation Scripts]]"
  - "[[Roadmap|Product Roadmap]]"
---

[[Roadmap|Product Roadmap]] | [[workflow-map|Workflow Map]] | [[validation-scripts|Validation Scripts]]

---

# Checkpoint 0.2 — Feedback Rubric and Capture Sheets

Written for the facilitator, and for whoever ranks the findings in Phase 0.2.3.
One capture sheet per session. Copy the blank sheet in section 4 and fill it in
during the session, not afterwards.

## 1. Severity levels

Every finding gets exactly one severity. Severity decides what happens to it,
so it is assigned by the facilitator in the session and confirmed in the
consolidation step, never negotiated later.

**Severity 1 — Structural.** The participant could not complete the task, or
the prototype contradicts how the department actually works. The model is
wrong, not the wording. *Blocks the Checkpoint 0.2 exit gate until corrected
and re-checked with the participant who raised it, or formally deferred with a
dated written reason.*

Examples: a reviewer expects an approval to survive an edit; the department has
no such role as the one being simulated; there is no way to do something the
department does every week.

**Severity 2 — Friction.** The participant completed the task but only after
searching, backtracking or asking. The model is right; the path is wrong.
*Corrected in Phase 0.2.3 when two or more participants hit the same friction,
or when one participant hit it on a daily task.*

**Severity 3 — Terminology or clarity.** A label, status name or piece of copy
is wrong, ambiguous or not what the department says. *Corrected in Phase 0.2.3
on a clear department verdict, applied consistently across the interface and
`MVP_draft.md`.*

**Severity 4 — Preference.** The participant would like something different but
completed the task without difficulty. *Recorded, not acted on in Checkpoint
0.2. Carried to the Version 1 backlog.*

**Not a finding.** Deliberate prototype limits already recorded in `Status.md`:
no upload or playback, no persistence across refresh, simulated publishing, no
real authentication. Note if a participant trips on one, but do not score it.

## 2. What to score per task

For each task in the script, record three things and nothing else.

| Field | Values | Note |
|---|---|---|
| Outcome | Unaided / Aided / Failed | Aided means one or two facilitator interventions. Failed means three or more, or abandoned |
| Time | Seconds | Approximate is fine. Only matters when it is long |
| Expectation match | Matched / Diverged | Did what happened match what the participant said would happen before acting |

A task is a **scenario pass** when the outcome is Unaided or Aided **and** no
Severity 1 finding arose in it. The exit gate threshold of 80 percent is
computed over scenario passes across all sessions.

## 3. Dimensions scored once per session

At the end of each session, score these five dimensions 1 to 5, where 1 is
"contradicts how we work" and 5 is "matches how we work". Write one sentence of
evidence for any score of 3 or below. A score with no evidence sentence is
discarded during consolidation.

| # | Dimension | The question behind it |
|---|---|---|
| D1 | Workflow fidelity | Does the order of steps match what this person actually does |
| D2 | Authority fidelity | Are the permissions and separations correct for this person |
| D3 | Findability | Could they reach what they needed without being told where it is |
| D4 | Terminology | Are the Arabic words the department's own words |
| D5 | Trust in the record | Do they believe what the hub tells them about approval and publication state |

## 4. Session capture sheet

Copy this block per session.

```markdown
## Session <number> — <role> — <date>

- Participant role: 
- Years in the department: 
- Facilitator: 
- Device and browser: 
- Desktop or phone: 
- Script used: S<n>
- Seed state reset before start: yes / no

### Task outcomes

| Task | Outcome | Time (s) | Expectation | Notes |
|---|---|---|---|---|
| 1 |  |  |  |  |
| 2 |  |  |  |  |
| 3 |  |  |  |  |
| 4 |  |  |  |  |
| 5 |  |  |  |  |
| 6 |  |  |  |  |
| 7 |  |  |  |  |

Scenario passes: __ of __

### Dimension scores

| D1 fidelity | D2 authority | D3 findability | D4 terminology | D5 trust |
|---|---|---|---|---|
|  |  |  |  |  |

Evidence for any score of 3 or below:

### Findings raised

| ID | Severity | What happened | What the participant expected | Related item |
|---|---|---|---|---|
| F-<session>-1 |  |  |  | A__ / E__ / B__ / T__ / Q__ |

### Answers to the open questions

- Q1 approval authority: 
- Q2 life after publication: 
- Q3 delegation: 
- Q4 urgency: 
- Q5 channel account reality: 
- Q6 work that dies: 
- Q7 intake and campaign shape: 

(Record only the questions this script asked. Leave the others blank.)

### Terminology verdicts

| Item | Current string | Department's word | Verdict |
|---|---|---|---|
| T_ |  |  | keep / change / undecided |

### Verbatim quotes worth keeping

> 

### Facilitator note

What surprised you in this session:
```

## 5. Consolidated findings register

Filled in during Phase 0.2.3 task 0.2.3.1. Every finding from every session
appears once. Duplicates are merged, and the merge keeps the highest severity
and lists every session that raised it.

| ID | Severity | Finding | Sessions | Related | Decision | Status |
|---|---|---|---|---|---|---|
| | | | | | correct / defer / no change | open / done |

**Rules for this table.**

1. A finding is not entered unless a session raised it. Nothing is added from
   an agent's own judgement, in either direction.
2. A Severity 1 finding may only be closed as `defer` with a dated written
   reason in `progress.md`, and the deferral is reported at the exit gate.
3. Each correction applied in Phase 0.2.3 cites its finding identifier in the
   commit message.
4. A correction is `done` only after typecheck, tests, build and a browser
   check pass, and the result is recorded in `progress.md`.

## 6. Exit gate roll-up

Complete this at the end of Phase 0.2.2, before Phase 0.2.3 begins. It maps
one-to-one onto the six exit gate criteria in `Roadmap.md`.

| Criterion | Required | Actual | Met |
|---|---|---|---|
| 1. Role coverage | Director, Assistant Director, content specialist, Media Producer, Publishing Officer |  |  |
| 2. Participants | 6 distinct, at least 2 leadership |  |  |
| 3. Scenario completion | Unaided per session, max two interventions |  |  |
| 4. Pass threshold | 80 percent of scenarios pass |  |  |
| 5. Severity 1 | Zero unresolved |  |  |
| 6. Evidence | Rubric sheet per session, dated entries in `progress.md` |  |  |

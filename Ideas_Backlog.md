---
type: backlog
project: "[[projects/ideas/Comms_Hub/Comms Hub|Communication Department Hub]]"
tags:
  - comms-hub
  - document/backlog
  - status/active
created: 2026-10-10
updated: 2026-10-10
status: active
parent: "[[projects/ideas/Comms_Hub/Comms Hub]]"
aliases:
  - Ideas Backlog
  - خارج خريطة الطريق
  - أفكار مستقبلية لمركز الاتصال المؤسسي
related:
  - "[[Roadmap|Product Roadmap]]"
  - "[[Status|Current Status]]"
  - "[[validation/owner-input|Owner Input Log]]"
  - "[[validation/responses/R01-2026-10-10-director|Response R01]]"
---

[[projects/ideas/Comms_Hub/Comms Hub|Comms Hub Overview]] | [[Roadmap|Product Roadmap]] | [[Status|Current Status]] | [[progress|Progress Log]]

---

# Ideas Backlog — Extra Work Outside the Roadmap

## 1. What this file is

A parking place for ideas that are worth keeping but are **not** planned work. Nothing
here is scheduled, specified or promised, and nothing here is built directly.

| Belongs here | Does not belong here |
|---|---|
| Extra features the owner wants to keep for later | Corrections that validation findings justify (those go to Roadmap Phase 0.2.3) |
| Agent suggestions, labelled as such | Owner decisions and workflow facts (those go to `validation/owner-input.md`) |
| Severity 4 preferences from validation sessions, which the rubric carries to the Version 1 backlog | Anything already in a Roadmap checkpoint |

**How an idea leaves this file.** It is promoted when the owner decides to do it, or
when validation evidence shows the department needs it. Promotion means a scoped
Roadmap checkpoint or phase with an exit gate, and, where the interface changes, an
`MVP_draft.md` section. Set the idea's status to Promoted and link to where it went.
Ideas are never deleted; a rejected idea keeps its row with a dated reason.

**Statuses.** Parked, Needs owner decision, Candidate (has validation evidence),
Promoted, Rejected.

**Sizes.** S is about one focused session in the prototype, M is a few sessions, L
needs production infrastructure (storage, workers, integrations) from Version 2 or 3.

## 2. Summary

| ID | Idea | Source | Size | Earliest fit | Status |
|---|---|---|---|---|---|
| I-001 | Video editing | Owner, 2026-10-10 | M prototype, L production | Prototype tool now; production after Checkpoints 2.2, 2.6, 3.2 | Parked |
| I-002 | Photo editing | Owner, 2026-10-10 | M prototype, L production | Prototype tool now; production after Checkpoint 2.2 | Parked |
| I-003 | Brand kit and approved template library | Agent | M | With identity Checkpoint 0.3 or Version 2 | Parked |
| I-004 | Request form for other departments | Agent, backed by R01 | M | Version 2, beside Checkpoint 3.5 | Candidate |
| I-005 | Occasions calendar, Hijri and Gregorian, with lead-time reminders | Agent | S prototype | Version 0 or 2 | Parked |
| I-006 | Consent and media rights register | Agent | M | Version 2, with Checkpoint 2.2 | Parked |
| I-007 | Privacy tools for photos: face blurring and metadata removal | Agent | M | With I-002 | Parked |
| I-008 | Accessibility gate: alt text and captions before publishing | Agent | S | Version 2, Checkpoint 2.3 | Parked |
| I-009 | Management report generator | Agent, backed by R01 | M | Version 3, after Checkpoint 3.7 | Candidate |
| I-010 | Planned versus unplanned work measurement | R01 S2-Q1 | S | Version 2, Checkpoint 2.1 | Candidate |
| I-011 | Crisis holding-statement library | Agent | S | Version 2, with `emergency_workflows.md` | Parked |
| I-012 | Media and press contacts directory | Agent | M | Version 3, beside Checkpoint 3.5 | Parked |
| I-013 | More channels: Snapchat, TikTok, YouTube, WhatsApp Channels | Agent | L | Version 3, Checkpoint 3.3, after owner clarification C8 | Needs owner decision |
| I-014 | Campaign link builder: tracked links and QR codes | Agent | S | Version 3, with Checkpoint 3.7 | Parked |
| I-015 | Field capture from the phone straight to storage | Agent, backed by O-010 and R01 | L | Version 3, Checkpoint 3.2 | Candidate |
| I-016 | Evergreen content library and reuse | Agent | S | Version 2 | Parked |
| I-017 | Arabic style guide and spelling checks | Agent | M | Version 4 | Parked |
| I-018 | Undo a mistaken approval before publishing | R01 F-R01-14, Severity 4 | S | Version 1 backlog | Parked |
| I-019 | Notify the owner when changes are requested | R01 F-R01-15, Severity 4 | S | Checkpoint 2.4 | Parked |
| I-020 | Member status page: next step, deadlines and notes in one place | R01 F-R01-16, Severity 4 | S | After O-005 settles the Member role | Parked |
| I-021 | Command palette, Ctrl K, with Arabic-normalised search | Identity proposal | S | Checkpoint 0.3.3 if approved, else here | Parked |
| I-022 | Dark mode | Identity proposal | S | Checkpoint 0.3.4 if approved, else here | Parked |
| I-023 | Open Motion Studio from a work item with suggested templates | Identity proposal | S | Checkpoint 0.3.4 if approved, else here | Parked |

## 3. Owner ideas

### I-001 — Video editing

**Owner input (2026-10-10).** Add video editing features.

**Why it matters.** The Media Producer's job, as the owner described it in O-010, is
capture, storage, then editing, then approval. Today the edit happens outside the
hub, so review sees only the result. R01 also failed on video upload (S5.5) and on
timestamped notes (S5.4).

**Candidate scope, smallest first.**

1. Trim and cut: in and out points, split, remove a segment.
2. Reframe for each channel: 9:16, 1:1, 4:5 and 16:9 crops from one master, with the
   Reels safe zones Motion Studio already draws.
3. Arabic captions: import or type subtitles, burn them in or export them as a file,
   correct right-to-left line breaking.
4. Brand overlays: logo bug, watermark, lower thirds and end cards taken directly from
   the Motion Studio templates.
5. Cover frame and thumbnail picker per channel.
6. Audio: level normalisation, mute, background music from a licensed library with
   the licence recorded.
7. Review proxy: a light copy for reviewers, with the full original kept, which
   answers the S5 structural question about compressed review copies.

**Constraints and design points.**

- An edit makes a new asset version. Under `approval_policy_design.md` that
  invalidates an approval bound to the old version, so editing must not happen on an
  approved release without the department seeing that consequence.
- Edits should be non-destructive: an edit list over the original, so the raw
  material from the field is never lost (Zero Data Loss).
- A prototype version can run in the browser, as Motion Studio does (WebCodecs, local
  files, nothing stored). Production editing of large files needs real storage
  (Checkpoints 2.2 and 3.2) and background rendering (Checkpoint 2.6).
- This is not a replacement for Premiere or Resolve. The useful target is the quick,
  frequent edit (trim, reframe, captions, logo) that today needs a round trip to the
  producer.

**Open questions.** Which editing tool the producer uses today; typical file sizes
(S5-Q1, not yet answered); whether the Director wants to make small cuts himself, as
he does with text (S1-Q3).

### I-002 — Photo editing

**Owner input (2026-10-10).** Add photo editing features.

**Candidate scope, smallest first.**

1. Crop to channel presets with a safe-area overlay, and export every size a release
   needs in one step.
2. Basic adjustments: exposure, contrast, white balance, straighten.
3. Brand frames and text overlays using the approved fonts and colours, with correct
   Arabic shaping.
4. Batch actions: watermark or logo on a set of coverage photos, resize, rename.
5. Background removal for cut-out images.
6. Before and after comparison for the reviewer.

**Constraints and design points.**

- Same version rule as I-001: an edited image is a new asset version.
- Keep the original and record the edit steps.
- A charity photographs beneficiaries. Pair this with I-006 (consent) and I-007
  (blurring and metadata removal) rather than shipping editing alone.
- Prototype as a local browser tool beside Motion Studio; production needs Checkpoint
  2.2 for versions and Checkpoint 3.2 for storage.

**Open questions.** Who edits photos today (Designer or Media Producer); whether the
designer's own tools stay the source of truth for posters, with the hub editing only
coverage photos.

## 4. Agent suggestions

Labelled suggestions from the agent, 2026-10-10. Unverified: none of these has been
asked of the department.

- **I-003 Brand kit and approved template library.** One place for approved logos,
  colours, fonts, Motion Studio templates and poster templates per occasion, so a
  writer or producer starts from an approved base and the Designer is not asked for
  the same frame twice. Natural companion to the identity proposal in Roadmap
  Checkpoint 0.3.
- **I-004 Request form for other departments.** R01 named "late arrival of
  information and content from other departments" as the biggest blocker, and work
  arriving from departments as a main source. A structured request form, with the
  required facts, files and a requested date, would turn that intake into a draft work
  item in the Assistant Director's queue. Overlaps Roadmap Checkpoint 3.5 (mail intake)
  and O-005 (Members send mail and ideas); decide whether it is one feature or two.
- **I-005 Occasions calendar.** National, religious and international days that matter
  to the charity, in Hijri and Gregorian dates, with a reminder a set number of weeks
  ahead so planning starts in time. The demo scenario is already an occasion (Saudi
  National Day).
- **I-006 Consent and media rights register.** For each photo or video of a person:
  whether consent exists, its scope and expiry; for stock, music and fonts: the
  licence. Publishing could warn when an asset lacks consent or its licence has
  expired.
- **I-007 Privacy tools for photos.** Face blurring for beneficiaries who did not
  consent, and removal of location and device metadata before publishing.
- **I-008 Accessibility gate.** Require alt text for images and captions for video
  before a release is ready for publishing, with Arabic guidance.
- **I-009 Management report generator.** Weekly or monthly report for senior
  management: what was published, per campaign and channel, on-time rate, overdue
  work and team load. R01 asked for overdue and load views; a report is the outward
  form of the same data. Needs real metrics, so after Checkpoint 3.7.
- **I-010 Planned versus unplanned work.** R01 S2-Q1: a large share of work is outside
  planned campaigns and the department "needs to measure" it. A source field on each
  work item (plan, department request, management directive, occasion, coverage,
  urgent) makes this a count. Small, and evidence-backed, so a strong promotion
  candidate for Checkpoint 2.1.
- **I-011 Crisis holding-statement library.** Pre-approved holding statements for
  likely situations, so the urgent path R01 described (F-R01-12) starts from approved
  wording. Belongs with `disscussios/emergency_workflows.md`.
- **I-012 Media and press contacts directory.** Journalists and outlets, with the
  press releases sent to each.
- **I-013 More channels.** The prototype knows Instagram, X and LinkedIn. Saudi
  audiences use Snapchat, TikTok, YouTube and WhatsApp Channels heavily. Which ones the
  charity uses is owner clarification C8, still open.
- **I-014 Campaign link builder.** Tracked links and QR codes per campaign and
  channel, so analytics can attribute visits.
- **I-015 Field capture from the phone.** The producer uploads from the phone straight
  to storage at the event, tagged with the work item. O-010 puts storage first in the
  producer's job, and R01 failed both upload tasks.
- **I-016 Evergreen content library.** Mark published content as reusable, with an
  occasion or theme, so it can be republished next year from the approved version.
- **I-017 Arabic style guide checks.** The department's own spelling and style rules
  checked in the composer. Version 4 already lists AI drafting and tone checks; a rule
  list is the non-AI first step.

## 5. From validation, Severity 4

The rubric records Severity 4 preferences and carries them to the Version 1 backlog.
They live here until Version 1 planning picks them up.

- **I-018 Undo a mistaken approval** while the work is unpublished. R01 S1.2.
- **I-019 Notify the owner when changes are requested.** R01 S1.4. Check against the
  three-tier model in `disscussios/notification_model.md`; it may already be covered
  by an Action Item.
- **I-020 Member status page.** Next step, request status, deadlines and notes in one
  place. R01 S7.5; depends on how O-005 narrows the Member role.

## 6. From the identity proposal

The proposal «الهوية الجديدة لمركز الاتصال»
(<https://claude.ai/artifact/51Rsuxkv8LeDK1JJEpq6nr>) includes interface ideas that no
validation finding has asked for yet. They are planned inside Roadmap Checkpoint 0.3
if the identity is approved. If it is not, they stay here.

- **I-021 Command palette.** Search, commands and navigation in one box, ignoring
  diacritics and normalising hamza and ya.
- **I-022 Dark mode,** for review after working hours.
- **I-023 Motion from the work item.** One button on a video or poster card opens
  Motion Studio with suggested templates.

Proposal ideas that **do** match a finding are not here: highlighted version
difference (F-R01-06), decisions on the home screen and team load (F-R01-01,
F-R01-02) and the phone approval sheet (Roadmap task 0.2.2.5) are already Roadmap
work.

## 7. Already routed elsewhere

Not repeated here; see the owner input log.

- O-003 audience comment inbox and replies: discussion first, Version 3 candidate.
- O-001 per-user permission editor: Phase 0.2.3 shell, Checkpoint 1.2.4.
- O-008 unified publishing in مساحة الإنشاء: Phase 0.2.3 if approved.

## 8. Log

| Date | Change |
|---|---|
| 2026-10-10 | File created. I-001 and I-002 from the owner; I-003 to I-017 agent suggestions; I-018 to I-020 from response R01; I-021 to I-023 from the identity proposal |

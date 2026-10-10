# Design notes from department validation

Roadmap task 0.2.3.12, written 2026-10-11. One note per structural finding of
response R01 (`validation/responses/R01-2026-10-10-director.md`): what the
department said, where it conflicts with the current model and specification,
the options, and a recommendation. These notes are the follow-up record that
exit gate criterion 5 and task 0.2.4.2 ask for. The documents under
`disscussios/` and `discussions_list.md` are cited, never edited.

Each recommendation is the agent's. The owner confirms or overrules it; until
then the decision column of `progress.md` reads "recommended".

| Note | Finding | Severity | Recommendation |
|---|---|---|---|
| [Approval scoped to what changed](component-scoped-approval.md) | F-R01-04 | 1 | Defer to Checkpoint 2.3 |
| [Close and archive with a reason](close-and-archive.md) | F-R01-09 | 2 | Defer to Checkpoint 2.1 |
| [Stages per content type](configurable-stages.md) | F-R01-10 | 2 | Defer to Checkpoint 2.1 |
| [Delegation that expires](delegation.md) | F-R01-11 | 1 | Defer to Checkpoints 1.2 and 2.3 |
| [Urgent path](urgent-path.md) | F-R01-12 | 1 | Defer to Checkpoints 2.3 and 2.4; optional urgent mark in the prototype |
| [One work, several campaigns](several-campaigns.md) | F-R01-13 | 1 | Defer to Checkpoint 2.1 |
| [Stage deadlines](stage-deadlines.md) | F-R01-18 | 2 | Defer to Checkpoint 2.1 |
| [Who edited](edit-attribution.md) | F-R01-19 | 2 | Defer to Checkpoints 1.4 and 2.3 |

Why defer rather than build in the prototype: each of these changes the data
model or the approval rules, not a screen. A prototype version would be a
second, throwaway engine, and the Director's answers are already specific
enough to design from. A Severity 1 finding deferred this way still counts
against exit gate criterion 5 until the deferral is recorded with its reason,
which `progress.md` does.

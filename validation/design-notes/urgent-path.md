# Urgent path (F-R01-12, Severity 1)

**The department's answer.** Publication within the hour happens. Urgent
requests are marked urgent, fast-tracked and prioritised, and final approval
still stays with the Director before publishing (R01, Q4).

**Conflict.** None with the specification. `disscussios/emergency_workflows.md`
section 1 separates urgent ("same controls, higher priority, faster reminders
and escalation") from emergency (scoped bypasses, strong audit), and says
marking something urgent must not bypass approval. The Director's answer is
exactly the urgent case. The prototype has no priority at all (E3).

**Options.**
1. An urgent mark on the work: it sorts first in every queue, shows on the
   review and publishing screens, and shortens reminder and escalation times.
   Approval is unchanged.
2. A separate urgent workflow with fewer steps. Rejected by the Director's
   own answer and by the specification.

**Recommendation.** Option 1. Reminders and escalation belong to Checkpoint
2.4 (Actions, Attention and Notifications); the mark and the queue order to
Checkpoint 2.3. A visual urgent mark that only sorts queues could be shown in
the prototype at low cost if the owner wants the Director to see it at the
re-check; the agent does not add it without that decision, because the Arabic
label («عاجل») and what it sorts need confirming first.

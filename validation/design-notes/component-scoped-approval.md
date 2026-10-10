# Approval scoped to what changed (F-R01-04, Severity 1)

**The department's answer.** When only the design changes, the Director
approves the new design version, not the unchanged text again (R01, S1 task 6
and structural question Q1). He was surprised that editing approved content
sends the whole work back to draft.

**Conflict.** The prototype invalidates the whole approval on any public-facing
change. That is the deliberate first-version rule of
`disscussios/approval_policy_design.md` section 5 ("Any modification to
approved public-facing content or approved media invalidates approval"). Section
4 already separates what an approval covers (text, media versions,
destinations, variants, date and time) from what it does not, and section 6
anticipates policies instead of hard-coded logic. So the Director's answer
does not contradict the specification's direction; it asks for the "more
nuanced behaviour" section 5 postpones.

**Options.**
1. Keep the conservative rule. Simple and auditable; the Director keeps
   re-approving unchanged text.
2. Approval per component: text, each media version and the channel set are
   approved separately; a change re-opens only the component that changed.
   The release is approved when every component is.
3. A policy decides the scope per content type: some types re-approve the
   whole package, others only the changed component.

**Recommendation.** Option 2 as the default inside the policy model of
option 3, built in Checkpoint 2.3 (Approval and Release Engine). The approval
record binds to component versions, which the current version-binding already
does for the whole package. Not built in the prototype: it changes the
approval engine, and a prototype copy would be thrown away.

**Ask the Director at the re-check (0.2.3.11).** Does a change to a channel
version (for example only the X text) also re-open only that channel?

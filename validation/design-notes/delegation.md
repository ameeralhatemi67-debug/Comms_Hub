# Delegation that expires (F-R01-11, Severity 1)

**The department's answer.** During leave the Director delegates approval to a
named person for the leave period; it ends by itself at the end of the period
(R01, Q3).

**Conflict.** None with the specification, which already describes this:
`disscussios/organizational_role_discussion.md` section 5 gives an acting
assignment with a principal, a delegate, a defined start and end, and a scoped
authority (routine approvals, campaign decisions, publishing approval; not
security or user administration). The prototype simply has no delegation, as
the workflow map recorded (A19, E2).

**Options.**
1. Delegation as its own record (principal, delegate, start, end, scope),
   checked whenever authority is checked, and shown on every decision taken
   under it ("اعتمدته ريم نيابةً عن محمد").
2. Temporarily give the delegate the Director's role. Rejected: it cannot
   expire by itself or be audited.

**Recommendation.** Option 1. The authority check belongs to Checkpoint 1.2
(task 1.2.6, delegation foundations); the approval screens that show "on
behalf of" belong to Checkpoint 2.3. Not built in the prototype, which has no
authentication or real authority checks.

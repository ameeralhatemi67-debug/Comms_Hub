# One work, several campaigns (F-R01-13, Severity 1)

**The department's answer.** One piece of content sometimes serves several
campaigns, and results are followed in each. A large share of work is outside
planned campaigns: daily requests, coverage, requests from other departments
(R01, Q7 and S2 structural question 2).

**Conflict.** Each work in the prototype belongs to exactly one campaign
(`campaignId`), and nothing records where a work came from. The workflow map
recorded both as E7 and E8.

**Options.**
1. Many-to-many: a work links to zero or more campaigns; results are reported
   per campaign. Work with no campaign is valid.
2. Keep one owning campaign and add "also used in" links. Simpler, but results
   per campaign become ambiguous.

**Recommendation.** Option 1 in Checkpoint 2.1, together with a source field
on every work (plan, another department, management directive, occasion,
coverage, urgent request) so planned and unplanned work can be measured, as
the Director asked (Ideas Backlog I-010). Not built in the prototype: it
changes the core data model.

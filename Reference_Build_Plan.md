# Building «النموذج المرجعي للمركز» into the site

Plan of 2026-10-12. The reference is version 5 of the artifact
(https://claude.ai/artifact/1tREdJRSuLpY9yignsf8q9) and its decision lists. Each step
below is one working session, ends with a local commit and a dated `progress.md` entry,
and leaves the site working. Do them in order: each step builds on the one before.

## Where the site stands

- **Real already:** accounts and page permissions, the media library (folders, grants,
  versions, tasks, notes, activity log, share links), mail, messaging, profiles. All in
  Postgres (`supabase/migrations/`), every write a database function, visibility by row
  level security.
- **Still mock:** everything the reference calls the work cycle. Work items, stages,
  approvals, publishing, calendar and notices live in `src/lib/domain.ts` and
  `src/components/work.tsx` / `operations.tsx` as browser state.
- **Known debt the build fixes:** mail «تحويل إلى عمل» numbers works in the browser
  (`src/components/mail/mail-page.tsx:586`); the reference moves numbering to the server.

## Before Step 1: one owner decision

`AGENTS.md` says work data is local mock state. Building this means the work cycle
becomes real, as the library and mail did. Needed: a dated owner directive that **work items, stages, approvals,
projects, tasks, requests, notices and platform accounts move to Postgres; publishing
stays a simulation**. Record it in `progress.md`, then update the prototype boundary in
`AGENTS.md`.

---

## Step 1. The work cycle in the database

**Goal:** the data and the rules behind every work page, with no visible change yet.

- **Tables:** `works` (number issued by the server, type, status, priority,
  restricted, due, closed with reason), `work_stages` (person, role, start, due,
  waits-for list, duration, note, approval point and who approved it),
  `work_texts` and `work_variants` (versions with author), `work_parts` approvals
  bound to the exact version, `work_cycles`, `work_comments`, `work_log` (append
  only), `projects` and `work_projects`, `events`, `reminders` (private), `requests`,
  `delegations`, `notifications` (three tiers), `platform_accounts` (YouTube
  included, publishers, auto or ask, authorised until), `plan_templates`.
- **One task list:** extend `media_tasks` (start date, waits-for, day group, project,
  work) instead of a second table, so library, mail, messaging and the calendar keep
  sharing it.
- **Database functions for every write:** create a work, start or finish a stage
  (hand-over notices, approval points hold what follows), approve a part or the
  package, request changes, reject, request a date move, schedule, simulated publish
  and retry, request and decide an extension (moves what follows), delegate, manage
  accounts (no delete while scheduled work uses it; renaming a handle reopens
  «المنصات والحسابات»).
- **Rules in row level security and the functions:** restricted works, no
  self-approval, urgent approved by the Director or a delegate, approval never
  publishes, retry only failed channels, YouTube video only.
- **Rules library:** `src/lib/work/rules.ts`, mirroring the database for the interface,
  with `tests/work.test.mjs`.
- **Seed:** the reference's sample world (CH-233 to CH-253, four projects, accounts).

**Done when:** `npm run typecheck`, `npm run build`, `npm test` pass; a database rule
run (as earlier for mail: one SQL script per rule, run as each role) passes and is saved
under `qa/`; Supabase security advisors show no new findings.

**Model:** Opus 5.5. This step sets the rules everything else trusts.

---

## Step 2. The shared interaction kit, proven on pages that already exist

**Goal:** hold to confirm, undo, and the three-level help system as site-wide parts,
used first on the library, mail and messaging.

- **`HoldButton`:** press about 900 ms, fill while pressed, a quick click explains why,
  Enter or Space held from the keyboard. The sixteen actions from the reference.
- **Undo:** the artifact restores a whole snapshot. The site cannot, because other
  people change the same data. Instead, each undoable database function returns an
  undo token, and `undo_action(token)` reverses it within a time window only if nothing
  touched that record since; the activity log records the undo too. The browser keeps
  the last 15 tokens for the top-bar button and Ctrl+Z. Publishing and outside mail are
  never undoable.
- **Help system:** a help registry (`src/lib/help/<page>.ts`: tip, purpose,
  first-visit steps, parts, roles, rules, links, questions), a guide layer with the
  placement that avoids open dialogs, the help button in the top bar (hover, guide
  mode, double click for the page guide), first-visit guides and section tips. Progress
  per person goes in a new `profiles.guide_seen` column the person may edit, so it
  follows the account, not the browser.
- **Write the help content** for the library, mail and messaging pages now; later
  steps add their own pages' content.

**Done when:** checks as in Step 1, plus a public-page browser check of the help layer
and hold button saved under `qa/`. Signed-in screens cannot be driven by the agent, so
the step ends with a short walkthrough list for the owner.

**Model:** Opus 5.5 for the kit and the undo design; Sonnet 5.5 can write the help
content.

---

## Step 3. «العمل», the work page and «إنشاء»

**Goal:** replace the mock work pages with the reference's, on real data.

- «العمل»: attention counts, tabs (team, all, mine, requests, closed), list and status
  board, filters.
- The work page: stages panel with people and dates, approval points, text and
  platform copies with versions, media from the library, links to mail and messaging,
  comments, log, role-aware actions.
- «إنشاء»: types and a project card, prefilled from mail, automatic assignment to the
  least busy person in the role, dates worked back from the due date.
- **Plan editor:** the simple editor with drag and arrows, and the free editor
  (library of stages, insert and copy, role, duration, note, approval point, chain or
  parallel, forward or back dates, templates, live timeline with warnings). Use pointer
  events for drag so it also works on touch.
- Mail «تحويل إلى عمل» calls the server's create function (fixes the numbering debt).
- Help content for these three pages.

**Done when:** standard checks; `tests/work.test.mjs` covers ordering and wait rules;
the owner walkthrough list.

**Model:** Opus 5.5 for the plan editor and stage hand-over; Sonnet 5.5 for the list
and board pages.

---

## Step 4. «الموافقات والنشر», the review screen and «الحسابات المرتبطة»

**Goal:** the decision and publishing half of the cycle.

- Approvals tab (waiting for me, sent by me, decision log) and the review screen
  (part by part, word diff, media preview with timed notes, approve the pending
  parts with a long press, request changes, reject).
- Publishing tab: authorisation per account, at-risk dates, ready, scheduled,
  partial or failed with retry, published, ask-first confirmation. Still a simulation,
  and the page says so.
- «الحسابات المرتبطة» with YouTube; library, mail and messaging cards approve through
  the same function.
- Notifications drawer with the three tiers, from the `notifications` table.
- Help content for these pages.

**Done when:** standard checks plus the approval rules from the pass 2 decisions, each
as a test or a database rule run.

**Model:** Sonnet 5.5, with an Opus 5.5 review of the approval rules before the commit.

---

## Step 5. «التقويم», «المشاريع», «الطلبات», then acceptance

**Goal:** the planning pages, and the build closed out.

- «التقويم»: day, week, month and list; a line per account; project bands; multi-day
  stages and tasks; team load; date moves as requests; deliveries moved directly by
  leaders; add from a day; private reminders.
- «المشاريع» and the project page: timeline, who works on what, works, tasks, a new
  project with a works plan.
- «الطلبات»: every request type, extension with what moves after it, folder access,
  delegation while away.
- Help content for these pages, so all sixteen pages have it.
- Acceptance: `MVP_draft.md` sections for the new pages; `Roadmap.md`, `Status.md`
  and `progress.md` updated; a push to deploy **only on the owner's request**.

**Done when:** standard checks, the public browser checks, and the owner's signed-in
walkthrough of the whole cycle (create, hand over, approve, schedule, publish
simulation, undo, help) with findings recorded.

**Model:** Sonnet 5.5 for the pages; Opus 5.5 for the final review of rules and
row level security.

---

## Opening instruction for the next session

> Read `Reference_Build_Plan.md`, `AGENTS.md` and the artifact's decision lists. I give
> the directive that the work cycle moves to Postgres and publishing stays a
> simulation. Start Step 1.

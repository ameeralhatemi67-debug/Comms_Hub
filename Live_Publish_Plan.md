# Real posts from the work cycle: findings and plan (advisory)

Written 2026-11-26 after the health check of the platform connections. **This is advice, not a decision.** The owner has not chosen to build any
of it. The advice came from a read-only pass by Fable 5.2 over the repository (it built and changed nothing), and its claims were checked against the
code where they matter; the assumptions it could not check are marked.

## 1. Where things stand (checked against the code)

- **Nothing is posted for real from the work cycle.** `work_publish` and `work_schedule` and `work_due_run` are plain SQL
  (`supabase/migrations/20261012120000_work_cycle.sql`, `20261105230000_work_youtube_choices.sql`, `20261125120000_work_cycle_x_link_route.sql`):
  `work_run_publish` only checks `active`, `authorized_until` and `work_copy_errors`, writes `results[account]` and sets the status. The database has no
  outbound HTTP, and the registry's `adapter` column allows only `'simulated'`.
- **The platform adapters** (`youtube.ts`, `instagram.ts`, `facebook.ts`, `tiktok.ts`, `snapchat.ts`) are used only by «تجربة النشر» and by the
  scheduled-Instagram run (`direct-due.ts`). «نشر مباشر» (Home; the Admin and the director only) is real for YouTube, Instagram and TikTok.
- **The one non-simulated outcome in the cycle** is X's link route: the account waits (`pending`), the work is «جارٍ النشر», a person posts on X by hand
  and pastes the post's link, and `work_link_confirm` accepts only a post of that account's own handle, once.
- **Proven against a real platform, signed in:** TikTok on its sandbox (a draft reached the inbox, a private post went out, a public post was refused
  because the app is unaudited), 2026-11-15. No real upload to YouTube, Instagram or Facebook is recorded. Instagram and Facebook are blocked by Meta's
  «App not active» (the owner's developer account needs confirmation). Snapchat's API is allowlist only. LinkedIn and X's API route were never
  connected for real.

## 2. Found and fixed on 2026-11-26

- A scheduled Instagram post that Meta published but whose result could not be recorded was later filed as a generic failure, with a notice saying it
  could not be published (`direct-due.ts`). Fixed: the result is tried a few times, and a post that still cannot be recorded is closed as
  `PUBLISHED_UNRECORDED` («نُشر … لكن تعذّر تسجيله هنا … ولا تُعد النشر»), and is never sent again
  (`supabase/migrations/20261126200000_direct_published_unrecorded.sql`, not applied to comms-hub).
- Documentation and words that disagreed with the code (the one-page guides list, Snapchat's guide and platform card, direct publish's platforms).
- The YouTube connect guide now says what a connection that ends after a week means (the Google app is still in «Testing»).
- A read-only script for the live database: `qa/sql/check-platform-health.sql`.

## 3. Left on purpose: what a real post must add (do not copy the simulation)

These are not defects while publishing is a simulation. They are required the day a real post is made from the work cycle.

1. **Re-check approvals when the post is claimed.** `work_run_publish` trusts the status (changes after approval go through
   `work_reopen_after_change`). A real post must re-verify, in the database and at claim time, that `work_pending` is empty and that the frozen payload's
   versions still equal `work_approvals`; otherwise fail with a named reason and send nothing. Do not simply raise an error inside `work_run_publish`:
   a work already failed or partial cannot be sent back for approval, and an exception would stop `work_due_run` for every other work.
2. **Truthful log labels.** `work_run_publish` writes «(محاكاة)» and `'simulated', true`; a real post must not carry them.
3. **The real firing must not run as whichever signed-in person opened a page.** `work_due_run` runs under any approved user's page load. Use the server
   key and a lease, as `direct_fire_claim` does.
4. **Never lose the platform's id.** Keep the handle (upload address, container, publish id) before the publishing call, reconcile before any re-send, and
   treat «published on the platform but unrecorded» as a state of its own (as 2 above now does for Instagram).

## 4. The advice: the smallest honest design

- A per-account switch (default: simulation), settable only by whoever manages accounts, only on a connected account, and only after a passing test row.
- `work_run_publish` gets a third branch beside the link branch: a live account's result is `pending`, and a row in a new `work_posts` table freezes the
  payload (text, files with their approved versions, the YouTube privacy, the approval versions) in the same transaction.
- One server route, a sibling of `/api/platforms/due`, claims jobs with the server key and a lease, re-verifies approvals (3.1), reads the files itself,
  calls the adapter, and writes the result back through a database function that checks the platform's owner id.
- Two triggers, no new infrastructure: the publisher's own click (needed for YouTube, whose bytes are relayed in pieces) and the bridge's polling loop.
- Prefer a platform's own scheduling (YouTube's `publishAt`, Facebook's scheduled post) so a closed page does not matter; unscheduling or reopening must
  then delete the scheduled item or refuse. Instagram and TikTok have none: the post can go late, and says so; default those to «بتأكيد».
- A «حذف من المنصة» action where an adapter can delete; TikTok posts and Snap Stories say plainly that they cannot be deleted.

## 5. Which platform first (the advice) and why

1. **YouTube**: a channel («Hedayh») is connected, a private upload embarrasses no one, delete exists, scheduling is the platform's own, and the work cycle
   already carries its visibility choices. Risk: an unaudited Google app may be forced to private (Google's own pages disagree).
2. **Facebook Page**, 3. **Instagram**: complete in code, blocked by Meta; Instagram also needs the due run.
4. **TikTok** as an inbox-draft hand-off while the app is unaudited. 5. **Snapchat** needs Snap's allowlist; a Story cannot be deleted.
6. **LinkedIn and X's API route**: leave; X's link route already covers X by hand.

## 6. Cheap things to settle first (all the owner's, all possible with the existing panels)

- Run one private YouTube test on «Hedayh» signed in, then delete it (the channel needs one reconnect for delete). Then an unlisted and a scheduled test:
  does an unaudited app keep them?
- Look at the Google consent screen's status: «Testing» ends the connection after 7 days (assumption: not checked for the owner's app).
- How many hours a day the bridge computer is on, and whether `MAIL_SERVER_KEY` is set in production (assumptions).
- The Meta developer account's confirmation, and TikTok's audit.
- Run `qa/sql/check-platform-health.sql` on comms-hub: it says which migrations are applied and which accounts are connected, which the repo cannot know.

## 7. A suggested order of work (if the owner decides to build)

1. The owner's checks above. 2. A clean baseline: documentation drift fixed, the Snapchat test committed, migrations applied. 3. The migration and its SQL
rules, with no network (the switch, `work_posts`, the pending branch, claim/done/failed/release, honest labels). 4. The route with the YouTube adapter,
driven by the publisher's click, private only. 5. Delete from the result, and a rehearsal that kills the tab mid-upload to prove no double post.
6. «جدولة» through YouTube's `publishAt` with unschedule and reopen. 7. Unlisted and public on one account, by the owner's decision.
8. Bridge-triggered claims and Instagram once Meta unblocks, then Facebook. 9. TikTok as an inbox-draft hand-off.

**Biggest risks:** wrong or unapproved content on a public account; double posts; a silent miss when the page and the bridge are both off or a token has
ended (make every pending real post visible to publishers); the claim path widening who can read a token; a platform's own schedule drifting from the work.

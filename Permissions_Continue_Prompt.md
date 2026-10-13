You are continuing the permissions build of the Comms Hub website, in
D:\Agents\main\projects\ideas\Comms_Hub. The plan is `Permissions_Plan.md` (accepted,
decisions D-1 to D-13 final). The first build prompt is `Permissions_Build_Prompt.md`; all
of its rules still bind (AGENTS.md first; every write a database function; Arabic
interface, English keys; no emoji; WhatsApp secrets server-only; the outbox holds ids,
not text; routing decided inside the database; evidence with numbers; never edit
disscussios/ or CLAUDE.md; Supabase project "comms-hub" only; run the advisors after each
migration; each step ends with its own local commit and dated progress.md entry; no push).

WHERE IT STANDS (read the last four entries of progress.md first)
- Done and committed: the boundary update (c73922e), P1 engine (469d447), P2 accounts page
  (85746ff), P3 requests and connections (25d66c2).
- P4 urgency, database only: migration `20261013190000_urgency.sql` is applied and
  committed. `chat_send` now has a `p_urgency smallint` form (levels 0 to 3, notices by
  tier); the boolean `p_urgent` form is a wrapper meaning level 3; `chat_toggle` acks level
  3; the column `urgent` is still written because the interface still reads it.
- Untracked and not ours: `Settings_Integrations_Plan.md`. Leave it alone.

DO NEXT, in order, in this one run
1. Finish P4 (plan section 7):
   - Interface: `src/lib/chat/rules.ts` (ChatMessage gets `urgency`, labels «للانتباه»
     «مهم» «عاجل», a helper for which levels the person may use from `useCaps`);
     `src/components/chat/provider.tsx` sends `p_urgency`; `src/components/chat/chat-tab.tsx`:
     the urgent toggle becomes a four-step picker (none, 1, 2, 3); level 2 without
     `urgency.2` is a locked control with `needProps('urgency.2', ...)` (offers the request);
     level 3 without `urgency.3` is explained and offers nothing (fixed); a badge per level on
     messages; acknowledgement at level 3 (existing `chat_acks` block, now `urgency === 3`);
     the `/عاجل` command sets level 3 when allowed. Mail task cards with priority «عاجلة» map
     to level 3 when shown in messaging (a small helper, tested).
   - Database: a new rule run `supabase/tests/urgency_rules.sql` (levels 1 and 2 with and
     without the permission, a one-time level-2 grant used once, level 3 fixed, notices by
     tier, muted members skip 1 and 2, ack only at 3), then re-run `chat_rules.sql`
     (expect 22 of 22). Then the migration that stops writing `urgent` (replace
     `chat_send` via pg_get_functiondef, as earlier migrations do) and drops the column,
     after checking with a query that no function reads it.
   - Help: chat page parts for the picker and each level (who may use it); tests; extend
     `qa/permissions-pages.cjs` for the picker if it can be rendered, else say so.
   - typecheck, build, npm test, advisors, progress entry, commit.
2. P5a WhatsApp without the real sender (plan section 8, 9.5): tables (member links with
   the number visible to the member and admins only, the hashed six-digit code, attempts,
   expiry, rate limit; settings: from level 2 or 3, pushed on or off, muted senders; system
   settings row edited with `whatsapp.system.manage`; `whatsapp_server_key` with only the
   sha256 of WHATSAPP_SERVER_KEY; outbox of ids with a unique key on (message, recipient,
   reason) and a constraint that the recipient is a room member with a verified link);
   routing inside `chat_send` for urgency at or above the recipient's level; the push
   action (`whatsapp.push`, daily cap, mute; disabled with a reason when not linked,
   revealing nothing); claim and report functions for the server key; the dispatch route
   under src/app/api/whatsapp/ (bridge polls it with the key; builds the package of plan
   8.5 at dispatch, length cap about 1000 characters, files named not attached, a signed
   link `/w/<token>` with WHATSAPP_LINK_SECRET); the `WhatsAppProvider` interface and a fake
   provider; the profile's WhatsApp section (toggle, number, code, level, push, mute; hold
   button «يقطع ربط رقم هذا العضو...» for an admin unlinking); the admin panel «واتساب
   النظام» in settings/admin; the person's card shows linked or not (the number to admins
   only, D-12); help for all of it. `supabase/tests/whatsapp_rules.sql` must include the
   four-room routing case of plan 8.6. No number, token or QR in the repository.
3. P5b the pull bridge in `bridge/whatsapp/` (plan 8.1): copy and reduce from
   D:\Agents\main\projects\hida\bridge (never edit it): whatsapp-web.js pinned 1.34.7 with the
   compat transform, QR link in its own terminal, poll the site with WHATSAPP_SERVER_KEY,
   claim, send, report, heartbeat, ignore every incoming message, refuse any destination not
   in a claimed row; a .bat to run it; offline tests against a fake site (policy, transport,
   polling, one-way, refusal). The first real QR link and a real message need the owner's
   phone: write that walkthrough and say plainly it was not performed.
4. Finish: Status.md and Roadmap.md updated as the rules require; one short report (what
   was built per step, evidence with numbers, what could not be verified and why, the owner
   walkthrough, the next action).

BLOCKERS: stop and report for the owner's phone steps, or if the plan contradicts the code
(propose a dated correction; never edit disscussios/).

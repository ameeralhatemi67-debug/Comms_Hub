You are building a large feature of the Comms Hub website, in
D:\Agents\main\projects\ideas\Comms_Hub, in ONE run, start to finish. The owner has
accepted the plan and answered every open question. The earlier work cycle (Steps 1
to 5 of Reference_Build_Plan.md) was bigger than this and was built the same way, so
do not stop to ask for permission between steps; stop only for the blockers listed at
the end.

THE FEATURE
Permissions and assigning (roles, role templates, standing, temporary and one-time
grants, requests), urgency levels 0 to 3 on messages, and one-way WhatsApp delivery of
urgent or pushed messages through a pull bridge. The specification is
Permissions_Plan.md. It is the authority: read all of it before writing anything.

THIS IS NOT AN ISOLATED PAGE
It reaches into everything that already exists, and it must be built as part of the
same product, not beside it. Section 9 of the plan lists every connection. In
particular, you will touch, and must leave working:
- the accounts page and the profile editor (src/components/accounts.tsx,
  src/components/profile-editor.tsx) and src/lib/access.ts (canOpen, adminOnlyPages);
- messaging and mail (chat_send, chat_acks, the mail action cards, mail priority);
- the media library's folder grants (media_grants stays the one mechanism for folders;
  timed folder access writes to it);
- the requests page and the work_requests flow, notifications (three tiers) and
  noticeHref, Home, the activity log, the shell, the review and approval rules;
- the shared interaction kit: hold buttons (src/lib/kit/hold-reasons.ts), undo, and the
  three-level help system (src/lib/help/, src/lib/kit/guide.ts, guide_progress).
Every existing check that this feature replaces must keep its current behaviour for
every current person until a grant changes it, and every existing rule run and test
must still pass.

READ FIRST, in this order
1. AGENTS.md (binding project rules). It warns that this is not the Next.js you know:
   read the relevant guide in node_modules/next/dist/docs/ before writing Next.js code.
2. Permissions_Plan.md (the plan), then Status.md, the last entries of progress.md, and
   Reference_Build_Plan.md (how earlier steps were built and recorded).
3. src/lib/access.ts, src/lib/domain.ts, src/lib/work/rules.ts, src/lib/help/,
   src/lib/kit/, the accounts, profile, chat and mail components.
4. supabase/migrations/ in full order, and the rule runs in supabase/tests/.
5. disscussios/notification_model.md (sections 7, 13, 32, 33). Read only; never edit
   disscussios/ or discussions_list.md.
6. For the WhatsApp bridge: D:\Agents\main\projects\hida\bridge (bridge.cjs, policy.cjs,
   transport.cjs, render.cjs, compat.cjs, and its tests) and the WhatsApp section of
   D:\Agents\main\projects\hida\README.md. This is the owner's earlier zero-cost
   method. Copy and reduce what you need into this repository; never edit the Hedayah
   project, its Windows tasks, or D:\Agents\main\tools\whatsapp-bridge.

DECISIONS (final, do not reopen) are D-1 to D-13 in the plan. In short: role defaults
are editable; the assistant is the co-director; approval and publishing stay locked and
no grant can unlock them; urgency 1 anyone, 2 by permission, 3 only admin, director
and assistant (names «للانتباه» «مهم» «عاجل»); assistant assigns rank-1 roles only when
granted; only an admin sees a member's number; whatsapp.push is off until granted;
WhatsApp is one way with full content; no cron or edge function in the site (idea I-024
only); the sender sits behind an interface.

HOW TO BUILD IT: the six steps of section 11, in order, in this single run
Before anything: commit a clean baseline (local commit; the working tree currently has
the plan, Ideas_Backlog.md and a Compass map change; commit what is intended and leave
nothing silently overwritten). Do the "Before Step P1" boundary update in AGENTS.md and
progress.md. Then:
  P1 permission engine (database, TypeScript mirror, move existing checks onto it)
  P2 the accounts page (tabs, person's card, grants, role templates, presets)
  P3 asking and the connections (requests, locked-control helper, notices, Home,
     activity log)
  P4 urgency 0 to 3
  P5a WhatsApp without the real sender (link and handshake, outbox, routing inside
     chat_send, push action, admin panel, interface and fake provider)
  P5b the pull bridge in bridge/whatsapp/ (polls the site with WHATSAPP_SERVER_KEY,
     claims queued rows, sends, reports, heartbeat, ignores every incoming message)
Each step ends with its own local commit and its own dated progress.md entry with
numbers, and leaves the site working. Do not batch all the work into one commit.
Write the help content (all three levels, first-visit guide, first-click tips, new hold
reasons, pageKeyOf and PAGE_HREF entries) in the same step as each page, not at the end.

NON-NEGOTIABLE RULES (AGENTS.md, easy to break)
- Every write is a database function; visibility is row level security. The interface
  explains, never decides. Installation changes nobody's behaviour.
- Never add a sign-in bypass, stub session or hard-coded credential. A service_role key
  never goes in the repository. WhatsApp secrets are server-only environment variables;
  the database stores only a sha256 of WHATSAPP_SERVER_KEY (pattern of MAIL_SERVER_KEY).
  No token, QR payload or phone number goes into the repository, fixtures or logs.
- The WhatsApp outbox stores ids, not message text; the text is read at dispatch.
  Private messages are not copied into a table an administrator can browse. Numbers:
  the member sees their own, an admin sees all, nobody else sees any.
- Routing is decided inside the database, in the same transaction that stores the
  message, from room membership. The bridge never receives a destination from a
  browser, a model or message text.
- Arabic interface, English keys in code. Preserve existing Arabic terms exactly. Never
  show a raw role, status or capability key. No emoji anywhere. Do not edit CLAUDE.md.
- Write markdown with the Write tool or a single-quoted heredoc, never a
  double-quoted PowerShell string.
- Reuse what exists (hold buttons, help registry, notifications table, requests page,
  chat_acks, Realtime). Do not build parallel versions. Remove the old `urgent` column
  only after nothing reads it.
- Apply migrations only to the Supabase project "comms-hub", after reading its current
  schema. Run the security and performance advisors afterwards and report them.

EVIDENCE (section "Evidence over assertion" of AGENTS.md)
- npm run typecheck, npm run build and npm test pass at the end of every step.
- New database rules are proven by SQL rule runs under supabase/tests/ with counted
  results: permissions_rules.sql (hierarchy, no escalation, no self-edit, expiry at use,
  one-time consumed once under concurrent calls, deny beats allow, fixed rules cannot
  be granted, installation changes nothing), the request rules, and whatsapp_rules.sql
  including the four-room routing case of plan section 8.6.
- The bridge has its own offline tests against a fake site (policy, transport, polling,
  one-way, refusal of any destination not in a claimed row).
- Anything that changes rendered output is checked in a real browser, saved under qa/
  as a re-runnable script plus its JSON result. The agent cannot sign in: for signed-in
  screens, write the owner a numbered walkthrough and say plainly in progress.md and
  Status.md that those screens were not seen.
- Record what was actually run, with numbers; say what failed or was skipped. Update
  Status.md and Roadmap.md as the rules require. Do not describe intended behaviour as
  verified behaviour.

BLOCKERS (stop and report, do not guess)
- The first real QR link of the system number and a real message to a phone need the
  owner's phone. Build and test everything else; leave a walkthrough for these.
- If the plan contradicts the code, say so and propose a dated correction; do not
  silently choose, and never edit disscussios/.

FINISH WITH one short report: what was built per step, the evidence with numbers, what
could not be verified and why, the exact owner walkthrough, and the next action.

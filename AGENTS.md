<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# Comms Hub — project working rules

These rules are binding for every agent and contributor working in this
repository. They previously lived only in `Roadmap.md`; this section is the
agent-facing copy. `CLAUDE.md` is auto-generated as `@AGENTS.md`, so do not
edit it: put project rules here.

## Documents and their owners

| File | Holds | Update when |
|---|---|---|
| `Roadmap.md` | Planned direction, work hierarchy, exit gates. | At milestone boundaries and scope changes. |
| `Status.md` | Present condition, active focus, next action. | At the end of every work session. |
| `progress.md` | Dated, verified outcomes and evidence. | Whenever a meaningful change is completed and verified. |
| `MVP_draft.md` | Authoritative UI shell, page specs, user flows. | When interface requirements change. |

`MVP_draft.md` is the authority for the prototype. When code and
`MVP_draft.md` disagree, the specification wins unless a dated entry in
`progress.md` records an explicit, reasoned deviation.

## Do not edit `disscussios/`

The eleven architecture documents under `disscussios/` are the institutional
specification record. Read them freely and cite them; never edit, reformat,
rename or delete them. This follows the Zero Data Loss principle in
`Roadmap.md`. The same applies to `discussions_list.md`, their index.

Cite them by name when a decision rests on one, for example
`disscussios/approval_policy_design.md` for version-bound approval, or
`disscussios/notification_model.md` for the three-tier attention model.

## Arabic terminology

The product interface is Arabic, right to left. Preserve the established
terms exactly; do not re-translate or "improve" them.

- Roles: مدير الاتصال المؤسسي، مساعد مدير الاتصال المؤسسي، كاتب المحتوى،
  المصمم، المنتج الإعلامي، مسؤول النشر وإدارة الحسابات، عضو، Admin.
- Statuses: مسودة، قيد الإنتاج، قيد المراجعة، بحاجة إلى تعديل، مرفوض،
  جاهز للنشر، مجدول، جارٍ النشر، منشور، نشر جزئي، فشل النشر.
- The internal status vocabulary stays English in code (`IN_REVIEW`,
  `CHANGES_REQUESTED`, …) and Arabic in the interface, per `MVP_draft.md`
  section 49. Never expose a raw status or role key to the user.

New user-facing strings are written in Arabic. Existing Arabic strings are
preserved verbatim when refactoring.

## Zero emoji

No emoji anywhere: source, interface copy, documentation, commit messages.
This is a standing directive for enterprise readability. Use words, or the
existing `lucide-react` icon set in the interface.

## Evidence over assertion

A change is not done because it was written. Before claiming a task complete:

- `npm run typecheck` and `npm run build` pass.
- `npm test` passes.
- Anything that changes rendered output is checked in a real browser, and the
  check is saved under `qa/` as a re-runnable script plus its JSON result.

Record what was actually run, with numbers, in `progress.md`. If something was
skipped or failed, say so there. Do not describe intended behaviour as
verified behaviour.

## Recoverable baselines

Commit a clean baseline before any significant file mutation. Never silently
overwrite or discard uncommitted work. Local commits only unless a push is
explicitly requested.

## Prototype boundary (Version 0)

Publishing to platforms is a simulation, and there is no AI or background
worker. Work data was local mock state, held in each browser; by owner
directive of 2026-10-12 it is moving to Postgres (see the work cycle below).
Files are the second exception, by owner directive of 2026-10-11: uploads go
to Google Drive (the connected Gmail account, `drive.file` scope, folder
«Comms Hub») and are listed in the `media_files` table; the Drive client
secret and refresh token are server-only environment variables.

The media section (folders, permissions, pipeline stages, tasks, activity log,
review links) is real too, with its rules in Postgres
(`supabase/migrations/*media*`): who may see, edit, create, manage, approve or
publish is decided by row level security and triggers, not by the interface.
Administrators act as any role there (testing phase). Publishing itself stays a
simulation. Where a page would need one of these, render the shell and
say plainly in the interface that it is a simulation.

Mail is the third exception, by owner directive of 2026-10-11: the mail page is
real. Internal mail, its action cards and the shared outside mailbox live in
Postgres (`supabase/migrations/*mail*`), every write goes through a database
function, and who sees what is row level security. Outside mail goes through
one Gmail account over IMAP and SMTP with an app password; `GMAIL_ADDRESS`,
`GMAIL_APP_PASSWORD` and `MAIL_SERVER_KEY` are server-only environment
variables, and the database stores only the sha256 of the server key. There is
still no background worker: the mailbox syncs when someone has the mail page
open. Internal mail stays private from administrators; they act as any role
only for the shared mailbox and approvals.

Messaging (the «المراسلة» tab of the mail page, `/mail/chat`) and personal
profiles are real too, by owner directive of 2026-10-12: rooms, messages,
reactions, votes and acknowledgements live in Postgres
(`supabase/migrations/*chat*`), every write is a database function, a room is
visible to its members only (administrators included), and changes arrive live
through Supabase Realtime. Pictures, voice notes and files sent in messaging go
to Google Drive like mail attachments. A profile picture is a small square
image resized in the browser and stored in the `profiles` table; a person may
change their own display name, picture, headline, name colour, presence and
mail signature, and nothing else about their account.

The work cycle is real too, by owner directive of 2026-10-12: works, stages
with approval points, versioned text and platform copies, approvals bound to
the exact version of each part, review cycles, comments, the work log,
projects, calendar events, private reminders, requests (extension, folder
access), notifications in three tiers, connected platform accounts (YouTube
included) and plan templates live in Postgres
(`supabase/migrations/*work_cycle*`), every write is a database function, and
who sees what is row level security. The reference for every rule is
«النموذج المرجعي للمركز», version 5, kept in `reference/comms-hub-reference-v5.html`;
the build follows `Reference_Build_Plan.md`. Publishing stays a simulation: an
account succeeds only if its simulated authorisation covers the moment, and the
page says so. Approval is the director's and the assistant's (urgent work
included) and never publishes; nobody approves what they sent or uploaded.
There is no sample data in the database: the reference's sample works stay in
the artifact. «العمل», the work page, «إنشاء» (Step 3), «الموافقات والنشر», the
review screen, «الحسابات المرتبطة» at `/channels` and the notifications drawer (Step 4)
read and write the database (`src/components/work/`, `src/components/notices.tsx`);
every write is a database function called through `useWork().call`. Step 5 put «التقويم»
(`/calendar`), «المشاريع» and the project page (`/projects`), «الطلبات» (`/requests`) and Home on
the database too (`src/components/work/calendar.tsx`, `projects.tsx`, `requests.tsx`,
`day-dialogs.tsx`, `src/components/home.tsx`; rules in `src/lib/work/planning.ts`). The pages
read a work's parts through `work_view_parts` and `work_view_pending`; `work_parts`,
`work_pending` and `work_stage_state` are internal and not callable from outside. Delegation
while away is not built (owner decision of 2026-10-12).

The shared interaction kit (Step 2) is real as well: undo steps of library edits and
each person's help progress live in Postgres
(`supabase/migrations/*interaction_kit*`). A button asks for a long press by carrying a
`data-hold` reason (`src/lib/kit/hold-reasons.ts`); a page gets its guide from
`src/lib/help/pages.ts`, whose selectors must exist in the page's components (tested).
New user-facing help text is Arabic, like every other string.

One deliberate exception, by owner directive of 2026-10-11 (recorded in
`progress.md`): **accounts are real.** Sign-in with email and password,
approved accounts, access requests, roles and page permissions live in the
Supabase project `comms-hub` (`supabase/migrations/`), enforced by row level
security. The role switch («عرض بصفة») belongs to administrators only. Rules for
who may open what are in `src/lib/access.ts` and are tested. Never add a
sign-in bypass, stub session or hard-coded credential, not even for tests. A
service_role key never goes in this repository.

The entry flow is part of the same accounts: «دعوة» sends one email from the site's Gmail
mailbox (`/api/entry/invite`, rules in `supabase/migrations/*entry_flow*`: the database allows
it only to a person who may manage the invitee and spaces invitations a minute apart); the
administrator sees how far each person got (`entry_states`); an access request tells the
leaders in the site and by email and tells a refused applicant by email; the sign-in screen
gives the same answer whether or not an address has an account. Supabase Auth's own sender is
pointed at the same Gmail account from the dashboard (`Entry_Flow_Setup.md`); no service_role
key is involved anywhere.

Permissions are real too, by owner directive of 2026-10-13 (`Permissions_Plan.md`,
recorded in `progress.md`): role templates, standing, temporary and one-time grants,
permission requests and their log live in Postgres (`supabase/migrations/*permissions*`),
every write is a database function, and who may give what to whom is decided there
(`has_capability`, `use_capability`), never by the interface. The catalog is
`src/lib/permissions.ts`, tested against the seeded `capabilities` table. Approval and
publishing stay fixed by the reference: no grant can make a person approve or publish.
Time is checked at the moment of use; there is no sweep job.

WhatsApp is a real outside channel, by the same directive: one way (the system sends,
nothing is read back), only to numbers a member proved on the site, and only for urgent
or pushed messages. Routing is decided inside the database from room membership; the
outbox holds ids, never message text. The sender is a pull bridge in `bridge/whatsapp/`
on a computer the owner keeps on: it polls the site, so the site still has no cron, edge
function or background worker (idea I-024 holds timed retries). `WHATSAPP_SERVER_KEY`
is a server-only environment variable whose sha256 alone is in the database, as with
`MAIL_SERVER_KEY`; `WHATSAPP_LINK_SECRET` signs the links in the messages. No phone
number, token or QR payload goes into this repository, its fixtures or its logs. Only
an administrator sees a member's number.

The platform list is a registry in Postgres (`supabase/migrations/*platform_registry*`), not a
constraint: labels, the order of copies and the video-only rule are read from it, a new platform
is a row added from «الإعدادات» «المنصات» by someone holding `platforms.manage`, and the shared
words and rules take it from `src/lib/work/rules.ts` (`setPlatformRegistry`). Publishing is
still a simulation for every platform until an adapter exists; the tracker of readiness is
information, not a connection.

Platform accounts of Facebook, Instagram and TikTok can be connected for real, by owner
directive of 2026-10-15 (`Platform_Connections_Setup.md`, recorded in `progress.md`): the
platform's own sign-in, the token in Vault, the authorisation equal to the token's real expiry,
a health check recorded in the account's row. Publishing is still a simulation. A platform
copy is checked against its platform's limits (data in `platforms.accepts`, with a stated source
and date) by `src/lib/platforms/limits.ts`; the interface stops the send step on a broken limit,
and since 2026-10-15 (C4) the database refuses it too (`work_copy_issues`, called by `work_schedule`,
`work_publish` and the due run; the rule exists once in `src/lib/platforms/limits.ts` and once in SQL,
held equal by `tests/limits-parity.test.mjs` and `supabase/tests/limits_rules.sql`). Never put a token, an app secret or a
platform's response body in a log, a URL, an event or a notification.

Integrations, storage providers and backups are real, by owner directive of 2026-10-14
(`Settings_Integrations_Plan.md`, decisions E-1 to E-7, recorded in `progress.md`). Every
connection (storage provider, platform app, messaging) is a row of one integrations core
(`supabase/migrations/*integrations*`) with its state and an append-only event log.
Secrets of anything connected through the interface live in **Supabase Vault**: entered
once, never read back by any endpoint, never logged; only security-definer functions read
them, and only when the site's server proves itself with `MAIL_SERVER_KEY` (one server, one
key). The Google Drive refresh token moves there; `GOOGLE_DRIVE_REFRESH_TOKEN` stays only as
a fallback until the owner confirms. Where each stored file lives is recorded in
`file_locations` (`*storage*`); a move copies, verifies, switches and keeps the source until
an administrator retires it, by owner directive of 2026-10-15 (Step S3, `*storage_move*`): a
second provider (S3-compatible, key pair in Vault as one secret) and the move engine are real,
state in `storage_moves` and `storage_move_items`, driven by the settings page while it is
open, every record needing the right «نقل الملفات بين مزودي التخزين» and the server key; an
approved version moves only by checksum; the library, mail and messaging routes serve through
the file's own reference with `storage_serving` (`src/lib/storage/index.ts`, `openStored`).
Retiring a source sends it to its provider's recoverable trash and is a separate long press.
Backups are real too (Step S4, `*backups*`, owner directive of 2026-10-15): files are copied to a
backup provider by the same engine in `backup` mode (incremental, the primary never changes),
the records and the settings are exported from an allow-list that excludes everything private
to a person (internal mail, messaging, private reminders, numbers) and every secret, and a
backup is called verified only after its copies were re-read from the provider. Everything
is run by a person: nothing is scheduled. A database restore is not offered from the site. Capabilities `settings.view`, `settings.manage`,
`storage.manage`, `storage.migrate`, `backups.run`, `backups.restore`, `platforms.manage`
and `integrations.secrets` are the administrator's by default. Nothing is scheduled in the
site: what needs a timer waits for the owner's agent computer (E-1), and the NAS likewise.

The studio is real too, by owner directive of 2026-10-19 (`Studio_Build_Plan.md`, `MVP_draft.md`
section 62, recorded in `progress.md`). It is the «الاستوديو» tab of «استوديو الحركة»
(`/motion/studio`); the template tab at `/motion` stays as it was for every role, and its 26
templates and the brand marks are usable inside the studio. Who may open it is the fixed capability
`motion.studio`: the Admin and the director only, together with the page of «استوديو الحركة».
No grant, template, preset or request can give it (`CAP_FIXED`), and the server checks the whole
address (`canOpenRoute`). Projects, numbered revisions, the autosave slot, the editing lease, the
sources and the exports live in Postgres (`supabase/migrations/*studio*`), and every write is a
database function. Editing, preview and export run in the browser on one Canvas 2D compositor
with Mediabunny (pinned, MPL-2.0, `THIRD_PARTY_NOTICES.md`). A library file is copied to the
device's private storage (OPFS) once per version, and a file from the device stays on that
device. There is no shared temporary storage and no remote render (they wait for the agent
computer, E-1). The studio never approves or publishes: what it saves to the library is a new
file or version that goes through review like any other, and nobody approves what they uploaded.
Ctrl+Z inside the studio is the studio's own and never reaches the library's undo. Its rules are
held by `supabase/tests/studio_*_rules.sql`, `tests/studio-*.test.mjs` and the fixture checks
`qa/studio-*.cjs`.

## Writing markdown from a shell

Write markdown with a file-write tool, a heredoc, or a single-quoted
PowerShell here-string. Never a double-quoted PowerShell string: backtick
sequences such as `` `n `` are consumed as escapes and silently corrupt the
file. Three lines of `progress.md` were damaged this way and had to be
repaired.

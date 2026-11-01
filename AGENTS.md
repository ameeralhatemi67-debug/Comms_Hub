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
Time is checked at the moment of use; there is no sweep job. On «الحسابات» a person's permission
is one switch: `switchStep` in `src/lib/permissions.ts` turns on or off into the database call, and
`MVP_draft.md` section 65 holds the page. `qa/accounts-flow.cjs` clicks through it on a fixture.

«سجل النشاط» reads three logs as one list (`src/lib/activity/feed.ts`), by owner directive of 2026-11-01 (`MVP_draft.md`
section 66, recorded in `progress.md`). The whole log is the capability `activity.full`: the Admin's and the director's by
default, grantable to anyone, and row level security decides it; the assistant holds it only if given it.
«تقرير الشهر» is `activity.report`, for the Admin and the director by default and grantable from rank 2. The database gives
counts through `activity_report`; points, the ranking and the words of the method exist once, in
`src/lib/activity/report.ts`, so the page, the Excel file and both PDFs always agree. Files are made in the browser, and
nothing about people passes through a server: the Excel writer is `report-xlsx.ts` (no library), the PDFs `report-pdf.ts`
(pdf-lib, loaded only on demand, fonts in `public/report/`). pdf-lib joins Arabic with IBM Plex but drops Reem Kufi's dot
positions, so headings are drawn as outlines; mixed text goes through `bidi.ts`. The Android application refuses a file made
in a page (`Downloads.java`), so there the buttons say where to get it. Its rules run on a private container
(`qa/activity-rules-local.cjs`, `supabase/tests/activity_report_rules.sql`); the files are rendered and opened in Excel by
`qa/activity-exports.mjs`, and the page is clicked through by `qa/activity-flow.cjs`.

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
Ctrl+Z inside the studio is the studio's own and never reaches the library's undo. On a computer each
part of an editor is a window that can be merged, split, floated and closed (by owner request of
2026-10-20, `MVP_draft.md` 62.1 to 62.5); the arrangement, the chrome and the preview resolution are
remembered on the device only, never as project data. The studio's added fonts (twelve Arabic, ten
English, SIL Open Font License) are served by the site from `@fontsource`, never from a font service.
Its rules are held by `supabase/tests/studio_*_rules.sql`, `tests/studio-*.test.mjs` and the fixture checks
`qa/studio-*.cjs`.

The desktop application is real too, by owner directive of 2026-10-20 (`Desktop_App_Plan.md`, accepted
with the answers of its section 11.1; `MVP_draft.md` section 63; recorded in `progress.md`). It is an
Electron application in `desktop/`, with its own `package.json` and lockfile like `bridge/whatsapp/`,
outside the site's typecheck and build, and for now built for Windows x64 only. It opens the live site,
`https://comms-hub-three.vercel.app`, from an address list compiled in (a development build adds
`http://127.0.0.1:3000`); a release build has no setting, switch or variable that widens it. It holds no
secret: signing in is the site's own form, and the session is the site's cookie in the application's own
profile. Its native layer is `window.commsHubNative`, which the preload exposes only when the top-level
page is on the compiled list, never in frames. Every main-process handler checks its sender's frame
address through `desktop/src/sender.ts`. There is no sign-in bypass, stub session or stored password in
it or in its checks. It decides nothing about people: every page, rule and check stays the website's.
Nothing is scheduled in the site because of it. Its rules are plain functions in `desktop/src/`, held by
`desktop/tests` and by `qa/desktop-shell.cjs`, which drives the packaged application. Bridge version 1
(D2, `MVP_draft.md` 63.1) has `info`, `power`, `life` and `notify`: every handler is registered in
`desktop/src/native.ts` through `guard()`, and every argument is checked by `desktop/src/bridge.ts` (a
fixed list of reasons, short plain text, links only to paths on the page's own address); no method takes
a file path or a command. The site reaches a shell only through `src/lib/native/` (shared with the phone
applications, `Mobile_Apps_Plan.md` 5.2), and detects each feature before use, so a browser and an older
application keep working. Only «يحتاج قرارك» items become native notices. What a minimised window really
does is measured with nothing attached (`qa/desktop-helpers.cjs`, `launchPlain`), because Playwright keeps
every page visible. Updates (D3, `MVP_draft.md` 63.2) come from the public bucket `desktop-releases` of the
`comms-hub` project (`supabase/migrations/20261021090000_desktop_releases.sql`, written and not applied
until the owner publishes the first release). Its address is compiled in (`desktop/src/update.ts`, held
equal to `src/lib/native/releases.ts`), no build may carry another except the update check's own package,
and nothing is ever uploaded through the site or by an agent: the owner publishes a release from the
dashboard (`desktop/README.md`). The updater checks every installer's SHA-512 against `latest.yml`, and
the publisher's signature too once releases are signed. The update check (`qa/desktop-update.cjs`)
installs, updates and removes its own package, `sa.commshub.desktop.qa`, never a real installation.
Files and the cache folder (D4, `MVP_draft.md` 63.3): bridge version 3 adds `files`, `cache` and `data`.
A file from «هذا الجهاز» becomes a token (32 random bytes) in `desktop/src/file-store.ts`; the page reads it
at `commshub-file://local/<token>`, and a library copy in the application's folder at
`commshub-file://cache/<name>` (`desktop/src/protocol.ts`): read-only, in byte ranges, an address naming a
token or a cache name and never a path, answered on the site's own profile only, and refused to any other
origin. The page never sends a path: the preload alone reads the path Chromium attached to a File the
person chose (webUtils), and the main process accepts only a regular file of a kind the studio takes. A
library copy is fetched by the main process from the site's own file route with the window's session, so
the site still decides who may read it. Every page carries a Content-Security-Policy (`src/proxy.ts`,
`src/lib/csp.ts`): scripts need the request's nonce, the theme script is allowed by its hash, and nothing
inline or from elsewhere runs; keep it that way when adding a script. «مسح بيانات هذا الجهاز» (D-11) removes
the session, the folder's copies and every token.
Media tools (D5, `MVP_draft.md` 63.4, decision D-9): bridge version 4 adds `media`. FFmpeg is the LGPL v3
shared build pinned by hash in `desktop/ffmpeg.lock.json`, fetched and checked by
`desktop/scripts/fetch-ffmpeg.mjs` into `desktop/vendor/ffmpeg` (never committed), and packaged in
`resources/ffmpeg`. Never ship a GPL or nonfree build. It runs only in the utility process
(`desktop/src/media-worker.ts`), and only with the fixed jobs of `desktop/src/media-jobs.ts`:
- `probe`;
- `proxy`, a 720p or 1080p light copy for the preview;
- `convert`, an editable H.264 copy of what the browser cannot decode.

The jobs name only Windows' own encoders (`h264_mf`, `aac_mf`). The page names a source by its token or
its library version, never by a path, program or argument. Copies are written as `.part` files, are never
served until complete, and are named by source, recipe and FFmpeg version. Change `RECIPE` when an
argument changes. A copy keeps the original's timestamps (`-copyts`) whenever the browser can read the
original's container (`keepsTimes`), so cuts stay on their frames; keep that when changing a recipe. In the studio (`src/lib/studio/media.ts`), the preview reads a light copy while the
export and stills read the original or the converted copy. `qa/desktop-media.cjs` proves the same frame at
every cut with gray-coded fixtures. FFmpeg's output never leaves the main process; the page gets one word
for a failure. The licences of everything the package carries are in `THIRD_PARTY_NOTICES.md` and the
generated `THIRD_PARTY_LICENSES.txt`.
The preview on a second screen (D6, `MVP_draft.md` 63.5): bridge version 5 adds `windows`.
- The bridge only lists the screens and opens or places a panel's window. It opens one address only,
  `/motion/studio/<project>/preview`, built in `desktop/src/windows.ts` on the asking page's own origin.
- The two pages keep in step over a `BroadcastChannel` (`src/lib/studio/preview-link.ts`), so nothing of a
  project passes through the application. The editor sends what it shows, and its clock on the shared
  `performance.timeOrigin`.
- The preview window only shows: no lease, no saving, no sound. The site's frame (`Shell`) stays out of it
  (`isPanelWindow`), so notices are never raised from it.
- `qa/desktop-windows.cjs` holds the playhead within one frame.

The Android application is being built, by owner directive of 2026-10-26 (`Android_Build_Plan.md`,
`MVP_draft.md` section 64, recorded in `progress.md`). It is a Capacitor 8 application in `mobile/`, with its
own `package.json` and lockfile like `desktop/`, outside the site's typecheck and build, id `sa.commshub.app`.
- **What it opens.** The live site from a compiled address list, as the desktop does (`mobile/capacitor.config.json`,
  `android/app/build.gradle`). A development or check build adds `http://127.0.0.1:3000`, the desktop's development
  address, which the phone reaches through `adb reverse`; only those builds allow cleartext, and only to it.
  It needs Android 10 (API 29) or newer.
- **Distribution.** Until the Google Play account is verified, a signed APK from the public bucket
  `android-releases` is the only channel.
- **The release key.** The owner holds it outside the repository and builds the release. No agent creates,
  reads or uses it. Play takes the same key later.
- **The native layer** is `window.commsHubNative` with `platform: 'android'`.
  - A document-start script defines it in the top frame of a compiled address only.
  - Every native method checks the main frame's address again and checks its arguments by the desktop's
    rules.
  - The site reaches it only through `src/lib/native/`.
- **File bytes never cross the bridge.** Native code fetches the site's own file routes with the WebView's
  cookies (`Downloads.java`), in the application's own process, never through the system's download service,
  and follows a redirect away from the list without the cookie.
- **The shell's rules** (A2, held by `mobile/tests` and the JVM tests in `mobile/android/app/src/test`):
  - Where an address goes is `Navigation.java`, the desktop's rules ported and held equal. Pages for outside
    people (`/r/`, `/m/`) also open in the browser.
  - Capacitor's routes to files on the phone (`/_capacitor_file_`, `/_capacitor_content_`) are refused.
  - The web view grants the microphone alone, and only to a compiled address (`ShellChromeClient.java`).
  - Android's backups copy nothing of the application.
  - The window pads itself by the system bars and the keyboard, so the site's styles carry no safe areas
    for it.
- **Updates (A3, `MVP_draft.md` 64.1).** The APK channel updates itself from the public bucket
  `android-releases` (`supabase/migrations/20261026120000_android_releases.sql`, written and not applied until the
  owner publishes the first release). Its feed address is compiled in, held equal to `src/lib/native/releases.ts`.
  - The page only names a release from `latest.json`; the application builds the address itself.
  - Before Android asks the person to install, the application checks the APK's size and SHA-256, its id, a
    newer version, and its own signing key (`AppUpdate.java`). Nothing installs silently.
  - Google Play's copy (`play`) has no `REQUEST_INSTALL_PACKAGES` and no update of its own.
  - `qa/android-update.cjs` builds its own versions of the check package and signs one with a throwaway key
    made and deleted in the run.
- **Files (A4, `MVP_draft.md` 64.2).** Bridge version 3 adds `download` (`save`, `open`) and `share` (`file`).
  - A page names a file only by its path, one of the site's file routes in `src/lib/native/files.ts`, held equal
    to `SiteFiles.java` by `tests/native.test.mjs`. The application builds the address on the page's own origin
    and answers `{ ok }` only.
  - Photos and videos are saved to the gallery, everything else to Downloads. What is opened or shared goes
    through the FileProvider's `cache/shared/` folder only, and is kept a day.
  - Capacitor's `CapacitorCookiesAndroidInterface` and `CapacitorHttpAndroidInterface` reach every frame of every
    address, and its cookie handler adds the web view's cookies to every Java connection by host. `Shell.narrow`
    takes all three off once Capacitor has loaded its plugins. Keep it when upgrading Capacitor (a mobile test
    reads Capacitor's sources).
- **Push, the application's half (A5, `MVP_draft.md` 64.3).** Bridge version 4 adds `push` (`state`, `request`,
  `token`, `onOpen`, `onReceive`).
  - The site says why before Android asks for notices; no token is made before they are allowed
    (`firebase_messaging_auto_init_enabled` off).
  - Firebase's four public identifiers come at build time from the owner's `google-services.json`, named by
    `COMMSHUB_GOOGLE_SERVICES`, for the build's own id only. No Google services plugin and no Firebase file in the
    repository; without them a build has no push.
  - The server sends data messages only. `PushService` shows them in «يحتاج قرارك», «للانتباه» or «الرسائل», and
    shows nothing while the application is in front.
  - A tapped push opens a page of the site only (`Push.goPath`, held equal to `src/lib/native/push.ts`), and only
    when the intent carries the application's private key, since any application can start its window.
  - The page registers the phone at each opening (`src/lib/native/device-push.ts`), signs out a phone removed
    from «أجهزتي», and clears its token before any sign-out.
  - `QaPush` exists in the check package alone.
- **Links and the lock (A6, `MVP_draft.md` 64.4).** Bridge version 5 adds `links` (`verified`) and `lock`
  (`state`, `set`).
  - The manifest claims the site's pages (`menuEntries` without the root) as `path` and `path/` prefix, plus `/w/`
    and `/app/return`; never `/`, `/r/`, `/m/` or `/api/`. `Links.java` opens exactly those, on the address the
    build opens, refusing dot segments. Both are held equal to `src/lib/access.ts` by `mobile/tests`.
  - `public/.well-known/assetlinks.json` names the release certificate. Until the owner gives it, it holds the stand-in
    `OWNER_RELEASE_KEY_SHA256`, and `scripts/build.mjs` refuses a signed release whose certificate it does not name.
  - The lock (`AppLock.java`) is off by default and asks Android (fingerprint or screen lock) to turn it on or off,
    at opening, and after `LOCK_AFTER_MS` away: five minutes, five seconds in the check package only.
- **The camera, sharing in, uploads (A7, `MVP_draft.md` 64.5).** Bridge version 6 adds `capture`, `incoming` and
  `upload`.
  - A held file (`Held.java`) is a token. The page reads it at `/__app/file/<token>`, answered by the application
    (byte ranges, GET, the site's own address only) and never by the site; no route of the site may use `/__app/`
    (tested).
  - A file shared in is read only from another application's `content://` provider (`Held.acceptable`): never
    `file://` and never the application's own FileProvider.
  - A background upload (`Uploads.java`, `UploadWorker.java`, WorkManager 2.11.2, a data-sync foreground task) goes
    only to `UPLOAD_PREFIXES`: Google Drive's upload address, plus the check's stand-in in the check package. The
    session is opened by the site (`/api/media/upload-session`), and the page registers what arrived
    (`src/components/native/phone-uploads.tsx`). The session's address is never shown back to the page.
  - `«استلام ملفات»` (`/share`) is open to every member; each destination keeps its own rule.
  - The check package alone has `QaFiles` (files to share in) beside `QaPush`.
- **Google Play (A8, `MVP_draft.md` 64.6).** Bridge version 7 adds `playUpdate` (`status`, `start`, `complete`) in
  Google Play's copy (the `play` flavour) alone, which has no `appUpdate` and no `REQUEST_INSTALL_PACKAGES`.
  - Play's in-app updates library is a `playImplementation` dependency: `src/play/PlayUpdate.java` asks Play, and
    `src/direct/PlayUpdate.java` answers nothing. Play's own window always asks the person, and a restart into an
    update waits while a file is being sent.
  - The release is an App Bundle (`npm run pack:play`), signed with the same key and refused unless `assetlinks.json`
    names its certificate. Play App Signing takes the owner's key; no agent uploads or signs in to the Play Console.
  - Google Play's copy of the check package asks Play's `FakeAppUpdateManager` (`PLAY_STAND_IN`, check package only),
    driven by `src/playQa/QaPlay.java`.
- **Checks** use the emulator started read-only and the check package `sa.commshub.app.qa`, never a real
  installation, and signed-out pages only (`qa/android-*.cjs`, `qa/android-helpers.cjs`).
- **What stays the same as everywhere:** no sign-in bypass, stub session or stored password; nothing about
  people is decided in it; nothing is scheduled in the site because of it.
- **The studio and «استوديو الحركة»** are not part of this application yet.

Account deletion on request is real too, with A8 (`MVP_draft.md` 64.6), as Google Play requires of an application
from which people can ask for an account. A person asks on «الحساب» («طلب حذف حسابي»); the holders of «إزالة عضو» who
may remove that person are told in «يحتاج قرارك», and the existing «إزالة» carries it out. Requests live in Postgres
(`supabase/migrations/*account_deletion*`, held by `supabase/tests/account_deletion_rules.sql`; applied to comms-hub
on 2026-10-28 with the owner's approval), every write is a database function, and removing an account with an open request also
removes what only that person could read. A founder's account is not deleted this way. What is deleted and what stays
is one list (`src/lib/account-deletion.ts`), held equal to the public page `public/account-deletion.html` by
`tests/account-deletion.test.mjs`. `public/privacy.html` says what the Hub handles; change it when that changes, and
keep both pages free of scripts.

Push notices are real too, by owner directive of 2026-10-26 (`Android_Build_Plan.md` A5, `Mobile_Apps_Plan.md` 5.3 to
5.5, `MVP_draft.md` 64.3, recorded in `progress.md`); this is the server half, and real delivery waits for the owner's
Firebase project and the application's half. Devices and the push outbox live in Postgres
(`supabase/migrations/*push*`), every write is a database function, and a person sees only their own devices (M-13).
- **The token is never readable by a page:** `devices` grants every column but `fcm_token`, pages read the view
  `my_devices`, and only `push_claim`, with `MAIL_SERVER_KEY`, hands a token to the site's server.
- **The outbox holds ids only** (a device, a kind, a notice or message id), one row per device per reference. It is
  filled by a trigger on `notifications` («يحتاج قرارك» always, «يحتاج انتباهك» if the device keeps it, «للعلم» never,
  never the actor), by `push_route_chat` inside `chat_send` and by `push_route_mail` inside `mail_send`. Notices about
  messaging are pushed by the chat route, because they quote the message.
- **The words are built at claim time and checked again** by `src/lib/push/payload.ts`: a notice's own text unless the
  device hides it, «رسالة جديدة من …» for messaging and mail and never their text, a destination `/n/<kind>/<id>` with no
  query string (`src/app/n/`), data-only FCM messages. Never put a token, the service account, a provider's answer or a
  message's text in a log, an event, a URL or a notice.
- **Nothing is scheduled:** `/api/push/flush` runs when a page that just wrote calls `kickPush()` (S-1) or when the
  WhatsApp bridge asks on its loop (S-2, `bridge/whatsapp/`); `push_flush_begin` is the lock and the gate. No
  database-started call (M-3).
- **The Firebase service account** is the integration `fcm_service_account` in Vault, entered in «الإعدادات»
  «الاتصالات» by a holder of `integrations.secrets` and checked by getting an access token before it is kept. The site
  signs its RS256 assertion with `node:crypto` (`src/lib/push/fcm.ts`) and keeps the access token 55 minutes; Google's
  addresses are fixed in the code, never taken from the file. Its rules are held by `supabase/tests/push_rules.sql`,
  `tests/push.test.mjs` and `qa/push-flush.cjs`.

## Writing markdown from a shell

Write markdown with a file-write tool, a heredoc, or a single-quoted
PowerShell here-string. Never a double-quoted PowerShell string: backtick
sequences such as `` `n `` are consumed as escapes and silently corrupt the
file. Three lines of `progress.md` were damaged this way and had to be
repaired.

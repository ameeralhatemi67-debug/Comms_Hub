# Settings: storage, backups, platforms and admin tools: build plan

Plan of 2026-10-13, from the owner's discussion of the same day. Status: **proposed**,
owner answers recorded (section 2). Nothing here is built. It builds on top of
`Permissions_Plan.md` (the permission engine and the pull-agent idea) and must start
only after that build has landed and its tests pass.

Companion documents: `AGENTS.md` (rules), `Roadmap.md`, `Status.md`,
`disscussios/storage_lifecycle_disaster_recovery.md`,
`disscussios/connected_account_secrets_management.md`,
`disscussios/failure_handling_background_jobs.md`.

---

## 1. What the owner asked for

1. A **storage tab** in the settings page where every storage option is connected:
   Google Drive, OneDrive, a NAS, Supabase (already connected), and others.
2. **Backups** managed from there, and **moving** from one storage option to another,
   for the whole system or for one folder or type.
3. **More settings** that help the admin run the website.
4. **Platforms** easy to add, edit and delete, with Snapchat, Facebook, TikTok and
   WhatsApp (Channel and Status) joining the existing ones, publishing for real, and an
   **info tab** that explains everything.

## 2. Decisions recorded

| # | Decision | Source |
|---|---|---|
| E-1 | The local agent (one always-on computer) is acceptable, but it is **not here yet**, and neither is the NAS. Everything that needs them is designed now and gated. | Owner, 2026-10-13 |
| E-2 | Secrets move from environment variables to **Supabase Vault** for anything connected through the interface. Security must be checked, not assumed. | Owner |
| E-3 | Moving storage is supported both ways: **full move** and **partial** (per folder or per type). | Owner |
| E-4 | Backup tolerance is not set. The schedule must be a setting that **grows over time**. | Owner |
| E-5 | Platform publishing is **real**, with an info tab. | Owner |
| E-6 | WhatsApp as a platform means **Channel and Status**. Status may be a manual task if automation is hard, automation preferred. | Owner |
| E-7 | Whether the organisation has a verified Meta Business account is unknown. The plan treats it as the first thing to find out. | Owner |

## 3. Principles

- **One integrations core.** Storage providers, platform accounts, the system WhatsApp
  number and later integrations share the state model, health checks, secrets handling
  and audit log. They are specialisations, not separate systems.
- **Secrets are write-only from the interface.** Entered once, stored in the vault,
  used only by server functions, never read back, never logged, never in a repository.
- **The database and server decide.** Same rule as the rest of the product.
- **Nothing is deleted by moving.** A move copies, verifies, switches, then keeps the
  source until the admin retires it. Backups are replicas, not a second truth.
- **Honest states.** A platform or provider that is not ready says so, and says what is
  missing. No simulated success where real is promised.
- **No site-side timer.** Anything scheduled runs on the agent when it arrives; until
  then the site shows age and asks the admin to run it. This keeps the "no background
  worker" boundary of `AGENTS.md`.
- Arabic interface, English keys, no emoji, every destructive control a hold button.

---

## 4. The integrations core

### 4.1 Data

- `integrations` (id, kind `storage|platform|messaging`, type, label, state, config
  jsonb non-secret, secret_ref, last_check_at, last_ok_at, last_error, created_by,
  created_at, disabled_at).
- `integration_events` (append-only): connected, reconnected, health result, secret
  rotated, disabled, deleted, who, when.
- States, from the secrets discussion section 16: `pending`, `connected`,
  `needs_reconnect`, `error`, `disabled`. Disable and delete are different; deleting
  keeps history (sections 26 to 28 of that discussion).

### 4.2 Secrets in the vault, and how it is secured

Supabase Vault stores secrets encrypted at rest, with the key held outside the database
contents. To keep that true:

- **No client access.** The vault views and functions are revoked from `anon` and
  `authenticated`. Only security-definer functions owned by a restricted role may read,
  and they are callable only with the server key (the sha256-of-key pattern already used
  for mail and WhatsApp).
- **Write-only interface.** The admin form sends a secret to one function that stores it
  and returns only a reference and a masked tail. No endpoint ever returns a secret.
- **Short plaintext life.** A function decrypts, uses and discards inside one server
  request. No secret in a log line, an error message, a notification, or an audit row.
- **Rotation and replacement are atomic**, with the old value kept until the new one
  passes a health check.
- **OAuth done properly:** a state value, PKCE where the provider supports it, exact
  redirect URIs, least scopes, and the granted scopes shown to the admin.
- **Every use is an event:** which integration, which purpose, which request. Never the
  value.
- **A security review step** is part of the build: attempt to read a secret as an
  ordinary member, as an admin through the interface, through the API, and through
  logs, and record that each fails.

What stays in environment variables: the server key itself and the vault access
configuration. Nothing else new.

### 4.3 Permissions

New capabilities in the engine of `Permissions_Plan.md`, off for everyone except admin:
`settings.view`, `storage.manage`, `storage.migrate`, `backups.run`, `backups.restore`,
`platforms.manage`, `integrations.secrets` (enter or rotate a secret). A leader may be
given the view or run rights for a time, never the secrets one by default.

---

## 5. The settings page

Tabs, the existing page kept as the first, each with its own help at three levels
(section 10):

1. **عام (general):** health overview (integrations by state, server configuration
   present or missing as yes or no only, storage use, backup age), maintenance banner,
   upload limits and allowed types, trash and retention policy.
2. **التخزين (storage):** providers, roles, locations, migration (section 6).
3. **النسخ الاحتياطي (backups):** (section 7).
4. **المنصات (platforms):** the registry, the apps, readiness and the info tab (section 8).
5. **السجل (audit):** every settings and integration event, filterable.

The platform accounts themselves stay in «الحسابات المرتبطة» (`/channels`), where
publishers already work; the settings tab is for the platform's app and its readiness.

---

## 6. Storage

### 6.1 Providers and roles

A **provider** is a connection; a **role** is what it is used for.

| Provider type | Reachable from the site | Notes |
|---|---|---|
| Google Drive | yes | exists; today's refresh token moves into the vault |
| OneDrive | yes | Microsoft OAuth, same shape as Drive |
| Supabase Storage | yes | already connected |
| S3-compatible (B2, R2, MinIO) | yes | a cheap offsite backup target |
| NAS | no | only through the agent, or a tunnel the owner sets up (E-1) |

Roles: `library` (media files), `mail` (attachments), `chat` (messaging media),
`backup`. Each role has a primary provider, and the library role may be overridden
per folder (this is what makes a partial move possible).

Small things stay where they are: profile pictures are in the `profiles` table and are
not a storage role.

### 6.2 The replica model

Today `media_files.drive_file_id` hard-wires Drive. New:

- `storage_providers` is the `integrations` rows of kind `storage`.
- `file_locations` (file id, provider id, provider reference, role `primary|replica|backup`,
  state `ok|pending|failed|missing|retired`, size, checksum, verified_at).
- `media_files.drive_file_id` stays during the transition and is read as the primary
  location of the Drive provider; a later migration retires it once nothing reads it.
- A **provider interface** (`StorageProvider`): create upload session, complete, get
  download access, stream, move, trash, checksum, health, quota. Drive is the first
  implementation; its present behaviour must not change.

This follows `storage_lifecycle_disaster_recovery.md`: the application owns asset
movement (section 26), authoritative copies are explicit (section 5), and two-way sync
is avoided (section 25).

### 6.3 Moving storage

Two scopes, one engine: **full** (every file of a role) and **partial** (a folder, a type,
a selection). Each move is a **plan** the admin reviews, then a **run**:

1. **Plan:** counts, total size, estimated time, destination quota check, files that
   cannot move (too large for the target, unsupported name), and a dry run report.
2. **Copy:** per file, resumable, throttled, with its own state.
3. **Verify:** checksum or size and listing, per file. A mismatch stops that file only.
4. **Switch:** the destination becomes primary, per file, only after verification.
5. **Hold:** the source stays as `replica` for a retention period the admin sets; only a
   separate, hold-confirmed action retires it.
6. **Report:** moved, skipped, failed, with reasons, saved in the audit log.

Runner: until the agent exists, the **admin-driven batch loop** runs in the open page
(next batch, pause, resume, safe to close; state is in the database, not the tab). With
the agent, the same plan is claimed and run unattended. The engine is written once; only
the runner differs. Large and NAS moves are marked "needs the agent" in the interface
and not offered until it reports in.

Rules: nothing moves while a file is locked by an approved version without keeping the
version reference; an approved file's checksum must match before and after; links and
review links must keep working (they resolve through the file id, not the location);
a move can be cancelled, and cancelling leaves every file where it was or in both places.

---

## 7. Backups

Four kinds, separately configured, separately reported:

| Kind | What | How, now | How, with the agent |
|---|---|---|---|
| Database | works, accounts, mail, chat, settings | the provider's own backups (plan dependent, to be checked) and an **admin export** of the key tables as a downloadable file, built by an admin-only function | scheduled logical dump through a read-only database role, encrypted with a passphrase the admin holds |
| Files | library, mail, chat media | a **replica** on the backup provider, by the same move engine in copy-only mode | scheduled, incremental |
| Configuration | roles, templates, permissions, registry, settings | exported as a file, no secrets | scheduled |
| Secrets | provider and platform credentials | **not exported**; recovery is re-entry, documented | same |

Policy (E-4) is data, not code: a backup job has a kind, a target, a frequency
(`manual`, then `daily`, `weekly` when scheduling exists), a retention count, and an
age threshold. It starts with "manual, warn after 7 days" and the admin tightens it over
time. The page always shows **last good backup, its age, size, verified or not**, and a
banner when it is stale.

**Verification counts.** A backup is "verified" only after a sample restore check
(checksums for files, row counts and a readable header for the database). An unverified
backup is shown as such.

**Restore is a supervised procedure, not a button.** The page holds a runbook per kind
(section 35 of the disaster-recovery discussion explains why a database restore can
conflict with outside state), and a restore into a staging target is the supported
first step. A hold-confirmed "restore" for files into a folder is allowed; a database
restore is not offered from the site.

---

## 8. Platforms

### 8.1 Registry instead of constraints

Today the platform list is repeated in check constraints (`platform_accounts`, work
copies, `work_youtube_ok`, the status order). Replace with `platforms`:

- `platforms` (key, label_ar, adapter, publish_modes, accepts jsonb (video only, image,
  text, carousel, duration limits, caption length, hashtags), scheduling support,
  token_life, requires_review, enabled).
- `platform_accounts.platform` references it. The existing rules become data
  (`accepts.video_only` replaces `work_youtube_ok`).
- Existing platforms (Instagram, X, LinkedIn, YouTube, the shared mailbox) are migrated
  as rows, with no change in behaviour or in any existing approval rule run.

### 8.2 The adapter

One interface per platform: start OAuth, handle callback, list pages or channels to
choose from, refresh, health check, validate a work copy, publish (returns a result per
account, as the work cycle already expects), revoke. Adding a platform is an adapter
and a registry row.

### 8.3 Three publish modes

Real publishing is the goal (E-5), but not every platform allows it and some need
approval first. Each account has a mode, shown honestly:

- **Auto:** the site publishes through the platform's API.
- **Assisted:** the site prepares the post (text, file, a download pack, an open-link),
  and the publisher confirms it is done, which records the result.
- **Manual task:** a task for the publisher with the same pack; completion is recorded
  by hand. This is the fallback for Snapchat and WhatsApp Status if no safe automation
  exists (E-6).

The existing approval rules do not change: approval binds to the version and to the
account's handle, and publishing never happens without approval. The publisher's
«الموافقات والنشر» page shows the mode on every account.

### 8.4 Easy add, edit, delete (in «الحسابات المرتبطة»)

- **Add:** choose a platform tile, an OAuth popup (or the assisted setup), choose the
  page, channel or profile, give a label and purpose, choose publishers and ask-first
  mode. Done in one dialog.
- **Edit:** label, purpose, publishers, mode, defaults. Rename of a handle keeps the
  current rule that works go back for review.
- **Reconnect:** same logical account, new token.
- **Disable:** stops publishing, keeps everything.
- **Delete:** shows the impact first (works scheduled, approvals bound), then removes the
  account from use and keeps its history. A hold button.

### 8.5 The info tab

A page in the platforms tab, one card per platform, written in Arabic and kept current:

- what it can publish here (types, limits, scheduling) and what it cannot;
- what the platform requires: developer app, business verification, review, account
  type, and how long that usually takes;
- **readiness tracker** the admin updates: not started, preparing, submitted, approved,
  live, with notes and dates (this is how the unknown Meta status, E-7, gets answered
  and followed);
- how connection works, how long authorisation lasts, and what happens when it expires;
- the current mode (auto, assisted, manual) and why;
- links to the platform's own documentation.

It is the same content the three-level help system shows, so there is one source.

### 8.6 The platforms

Facts below change often and **must be re-checked from each platform's official
documentation at build time**; the info tab is only as good as that check.

| Platform | Likely path | Main obstacle |
|---|---|---|
| Facebook Pages, Instagram professional | one Meta app, Graph API | Meta Business verification and App Review for publishing permissions; Instagram needs a professional account linked to a Page |
| TikTok | Content Posting API | app audit; before it, posts are limited |
| YouTube | exists in the product; Google OAuth, Data API | consent-screen verification and upload quota |
| X | API v2 | posting depends on a paid tier |
| LinkedIn | Community Management API | partner approval for organisation pages |
| Snapchat | to research | no general public posting path known; assume manual task until verified |
| WhatsApp Channel and Status | official API does not cover them, as far as known; the bridge of `Permissions_Plan.md` may be able to post, unofficially | unofficial, can be blocked; start Status as a manual task (E-6) |

WhatsApp as a platform uses the **same system number and bridge** as the notification
feature, but a different purpose and a different integration row, so a ban or a
disconnect of one is visible and separable.

---

## 9. Connection to other pages

| Page | What changes |
|---|---|
| **Settings** | The tabs above. |
| **Library** (`/media`) | Shows the storage state of each file (where it lives, replicas, verified); folder storage override; moving a folder from its page; upload goes to the folder's provider. |
| **Mail**, **Messaging** | Attachments go to the `mail` and `chat` roles' providers. |
| **Work**, **Create** | Account choice shows each account's mode and readiness; copy validation reads the registry. |
| **Approvals and publishing** | Real results per account; assisted and manual modes appear as tasks with a pack. |
| **Linked accounts** (`/channels`) | The add, edit, delete flow of 8.4. |
| **Tasks** | Manual and assisted publishing tasks. |
| **Notifications** | Authorisation expiring, health failed, backup stale, move finished or failed. |
| **Home** | For admins: integration health, backup age, moves in progress. |
| **Activity log** | Integration and storage events as a type. |
| **Accounts** | The new capabilities in the person's card and the role matrix. |
| **Help** | Section 10. |

---

## 10. The three-level help system

New help pages: `settings` (and its tabs), with `channels` updated. As in the existing
system (`src/lib/help/`, `src/lib/kit/guide.ts`, `guide_progress`, selectors tested in
`tests/kit.test.mjs`).

- **Level 1, hover:** one line per tab. For example, storage: «أين تُحفظ ملفات المركز،
  وكيف تُنقل بين مزودي التخزين دون فقدان.»
- **Level 2, guide mode:** every provider card, state, role selector, move plan step,
  backup row and platform card explains what it is, who may use it, and what it
  connects to. A disabled control says which prerequisite is missing (for example "needs
  the agent").
- **Level 3, page guide:** purpose, what each role sees, rules (nothing is deleted by a
  move, secrets cannot be read back, restore is supervised), links to the library,
  channels and approvals pages, and questions ("هل تضيع ملفاتي عند النقل؟").
- First-visit steps and first-click tips for the storage and platforms tabs.
- New hold buttons: retire a source after a move, delete an integration, delete a
  platform account, rotate a secret, restore files into a folder.

---

## 11. Steps

Each ends with a local commit, a dated `progress.md` entry with numbers, and a working
site. Steps marked **(gated)** are built and tested but switched off until the named
thing exists.

- **S0, before:** an owner directive recorded in `AGENTS.md` and `progress.md`: secrets
  for UI-connected integrations live in Vault; backups and storage providers are real.
  Clean baseline commit.
- **S1, integrations core and vault:** tables, functions, vault access, the secrets
  security review, audit events, capabilities, settings shell and general tab.
  Move Drive's refresh token into the vault, keeping the environment variables as a
  fallback until the owner confirms.
- **S2, storage providers and replica model:** `file_locations`, the provider
  interface, Drive as the first implementation, library file state display. No
  behaviour change; the existing media rule runs must be identical.
- **S3, second provider and the move engine:** Supabase Storage or an S3-compatible
  provider, plan, copy, verify, switch, hold, report, the admin-driven runner, the
  storage tab.
- **S4, backups:** policy, the admin export, file replicas to the backup provider,
  verification, age and stale banner, runbooks.
- **S5, platform registry:** `platforms`, migrate existing platforms, adapters
  interface, publish modes, info tab and readiness tracker, the add, edit, delete flow.
  Existing approval and publishing rule runs unchanged.
- **S6, first new platforms in assisted or manual mode:** Facebook, Instagram, TikTok,
  Snapchat, WhatsApp Channel and Status as manual or assisted, with real OAuth where the
  app is approved. **(gated)** per platform on readiness.
- **S7, NAS and scheduled backups, unattended moves (gated on the agent):** a NAS
  provider through the agent, scheduled backup jobs, claim and run of move plans, the
  database dump.
- **S8, OneDrive:** the provider, in the same shape as Drive.
- **S9, auto publishing per platform (gated on each approval):** the real adapter per
  platform as its review passes, replacing assisted mode account by account.

---

## 12. What the owner has to do, and what an agent cannot

- Find out whether a **verified Meta Business account** exists, and create the Meta
  app, TikTok developer app, Google consent screen and others. App review is a
  paperwork process on the owner's side, taking weeks.
- Provide the **NAS** and the **agent computer** when they arrive, and keep the
  computer on.
- Decide the backup target (a second provider) and its budget.
- Enter secrets in the interface himself or herself; no agent will be given them.

## 13. Risks

- **App reviews are the long pole.** The product can be fully built long before
  Facebook, TikTok or LinkedIn allow auto-publishing. Assisted and manual modes carry
  the gap, and say so.
- **Unofficial WhatsApp methods can be blocked**, which would stop Channel or Status
  posting and the notification number alike. Separate integration rows limit confusion,
  not the risk.
- **A bad move is the worst failure.** The copy-verify-switch-hold design and the
  "source stays until retired" rule exist for this; the dry run and a small first move
  are the owner's check.
- **Vault is a single point of trust.** Hence the security review step, no read-back, and
  documented re-entry as the recovery path.
- **Backups that are never restored are a belief, not a backup.** The plan counts a
  backup only once verified and expects a drill after S4.

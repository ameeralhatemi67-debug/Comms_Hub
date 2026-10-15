# Action plan after the health check of 2026-10-15

Status: **accepted by the owner on 2026-10-15**. This is the document to follow when a
session ends and another begins. It supersedes the "Recommended order" of
`Readiness_Audit.md` section 6 for what is left, and keeps that list as history (section 1).

Companion documents: `AGENTS.md` (rules), `Status.md` (where things stand now),
`progress.md` (dated evidence), `MVP_draft.md` (authoritative shell), `Readiness_Audit.md`,
`Settings_Integrations_Plan.md`, `Permissions_Plan.md`.

---

## 0. Why this plan exists

The health check found that the menu had grown to twenty entries and that several were
duplicates or empty shells:

- «الإدارة» was a shell of eight tabs; its real content (users, Drive) already exists in
  «الحسابات» and «الإعدادات», the rest was static sample text.
- «المراقبة» and «التحليلات» ran on browser sample data, not the database, and «المراقبة»
  imitated what «سجل النشاط» already does for real.
- «الحساب» (one's own profile) sat in the menu as if it were a work page.
- «الحسابات المرتبطة» (platform accounts) and «الحسابات» (people) had names that are
  easy to confuse.
- «الإعدادات» mixed personal preferences with system settings and its title said
  "this browser" while half of it is system-wide.

The rule of the plan: **no new pages until the existing ones each have one job.** Every
step below ends with evidence in `progress.md`, per `AGENTS.md`.

## 1. The nine steps of the audit order, as they stand

| # | Step | State on 2026-10-15 | What is left |
|---|---|---|---|
| 1 | Entry flow (SMTP, «دعوة», admin resend and reset, request notices, expired-link state) | Built, pushed | Owner: the one-time Supabase Auth SMTP setting (`Entry_Flow_Setup.md`), signed-in walkthrough |
| 2 | Honest labels on the mock pages, «الأفكار» fixed | Built, pushed | Superseded in part by Part B below (the mock pages are consolidated, not only labelled) |
| 3 | Real storage tab, file locations, provider interface (S2) | Built, pushed | Signed-in walkthrough |
| 4 | Platform registry with add, edit, delete, info tab, readiness tracker (S5) | Built, pushed | Signed-in walkthrough; outside paperwork per platform |
| 5 | Per-platform post preview with limits through the send step | Built, pushed | Known gap: the database does not enforce limits, only the interface |
| 6 | Real OAuth and health checks: Facebook, Instagram, TikTok; Snapchat manual | Built, pushed | Tested against a fake platform only; owner creates the Meta and TikTok apps (`Platform_Connections_Setup.md`) |
| 7 | Move engine with a second provider (S3), then OneDrive (S8) | **S3 built and pushed; S4 backups built and committed locally; OneDrive (S8) not built** | S8; a first real move to a real second provider (`Storage_Provider_Setup.md`) |
| 8 | Help upgrade: role-aware tours, empty-state tours, touch, missing pages | **Built and pushed** (`d20edb1`); the owner's list said "not done", `Status.md` and `progress.md` say done | Owes a refresh for every page Part B changes (step B7) |
| 9 | NAS and scheduled backups when the agent computer arrives | Not started, gated on hardware (E-1) | Everything; see Part D |

Nothing built since 2026-10-12 has been walked signed in by a person (no agent can sign in,
by rule). "Built" means built and tested against fixtures and database rule runs.

## 2. Part B: page consolidation (do first)

Goal: each page does one job, each person sees only the pages that are theirs, and the
menu is shorter and truthful. Owner proposals of 2026-10-15, with the corrections agreed.

Target menu, in order:

| Group | Entries |
|---|---|
| Work | الرئيسية، العمل، إنشاء، الموافقات والنشر، التقويم، المشاريع، الطلبات، مكتبة الوسائط، المهام، البريد، استوديو الحركة، الأفكار |
| Oversight | سجل النشاط (absorbs «المراقبة»); «التحليلات» only once it reads real data |
| System | الحسابات (people and permissions), «حسابات المنصات» (was «الحسابات المرتبطة»), الإعدادات (system) |
| Personal | «الحساب», reached from the name badge at the foot of the sidebar, not from the list |

### Step B1: menu and routes (first, small, no data change) - BUILT 2026-10-15

Built and recorded in `progress.md` (entry of 2026-10-15). Leftovers carried to B6: the sample
constants in `src/lib/domain.ts` and `DriveIntegration` in `src/components/drive-files.tsx` are
unused now and are removed there.

1. «الإدارة» leaves the menu; `/admin` redirects to `/accounts`. Its sample tabs are
   deleted from `src/components/supporting.tsx`; nothing real is lost (users: «الحسابات»;
   Drive, health, storage: «الإعدادات»; roles table: «الحسابات» tab «الأدوار»).
2. «الحساب» leaves the list; the name badge at the foot of the sidebar becomes its link
   (with the active state), in the full, collapsed, tablet and phone menus. Sign-out stays
   a separate button.
3. «الحسابات المرتبطة» becomes «حسابات المنصات» in the menu, the page, the guides and
   every user-facing string. The route `/channels` stays. Owner directive, recorded in
   `progress.md`; `MVP_draft.md` navigation updated in the same change.
4. «التحليلات» is hidden from the menu until step B5. The route and the grant stay, and the
   page keeps its honest banner.
5. The help registry, its tests and the access tests follow (`/admin` guide removed,
   names updated).

Exit: typecheck, build and `npm test` pass; signed-out gate check still passes; a fixture
browser check shows the new menu in four widths; the per-role menu list is recorded.

### Step B2: one activity log - BUILT 2026-10-15

Built (`progress.md`, second entry of 2026-10-15). The `monitoring` grant is kept as an alias that
opens «سجل النشاط»; folding it into `activity` by migration (the validation lists in the
permissions functions name it) moves to B6.

«المراقبة» is merged into «سجل النشاط»: the real log stays the base; a "team" panel adds
what «المراقبة» promised and only that: each member, role, last activity, open works, from
the database. `/monitoring` redirects to `/activity`. The `monitoring` page grant is kept in
the database as an alias that opens «سجل النشاط» (a migration that folds it in is optional
and decided in the step). Decide there whether the permission events of «الحسابات» and the
integration events of «الإعدادات» become filters here or stay where they are (default:
stay, they have different readers).

### Step B3: settings split - BUILT 2026-10-15

Built (`progress.md`, third entry of 2026-10-15). The display-only tabs were removed, not built:
none had a stored value or a behaviour behind it. If an organisation name or a publish-time
default is wanted later, it returns as a real setting with its own step.

Personal tabs (المظهر, اللغة, الإشعارات) move to «الحساب». «الإعدادات» becomes the system
page: general and health, storage, backups, platforms, WhatsApp, audit. The display-only
tabs (المؤسسة, افتراضات النشر, افتراضات الاعتماد, الذكاء والأتمتة) are either built as real
settings in the same step or removed; none stays as decoration. Page title and subtitle
corrected to say what it is.

### Step B4: who sees what, written down and tested - BUILT 2026-10-15

Built (`progress.md`, fourth entry of 2026-10-15). The menu list and its rule are one place
(`menuEntries` and `menuFor` in `src/lib/access.ts`); the table is in `MVP_draft.md` "Access by role".
It surfaced two owner decisions, carried as **B4b** below.

A table of menu and page access per role is generated from `src/lib/access.ts` and the
capability catalog, saved under `qa/` as a re-runnable script and its JSON result, and
recorded in `MVP_draft.md`. A test fails when a page is reachable by a role the table says
should not reach it. This is the "each member sees a somewhat different view" document.

### Step B4b: default pages per role - BUILT 2026-10-15

Owner decided: «الإعدادات» by default for the administrator only (others with the page grant, or
`settings.view` or `settings.manage`); the member keeps creating and `page.create` says so
(migration `20261015160000_member_creates.sql`). Recorded in `progress.md`. The original proposal:

The default page list gives every role «الإعدادات», so a writer or a member sees a page whose every
tab refuses. Proposed: «الإعدادات» only for the administrator and whoever holds `settings.view` or
`settings.manage`; existing accounts keep what they have. It touches `defaultPages` (access.ts), the
seeded page list in the permissions functions (a migration) and `tests/access-matrix.test.mjs`.
Second item: align `page.create` for the member with the domain role (the member creates), or hide
«إنشاء» from the member; the owner chooses which is true. Not changed in B4.

### Step B5: «التحليلات» made real - BUILT 2026-10-15

The owner asked to "work on" it without choosing numbers, so the metrics were chosen from what the
database holds and each names its source on the page: the flow of work (by status, late, due soon,
made and published per week), review (waiting, changes, rounds, first-round share) and the platforms
(accounts and health, what was addressed, simulated results). Team workload stays in «سجل النشاط».
Change the list by editing `src/lib/work/analytics.ts` and `analytics.tsx`. Built in `progress.md`
(entry of 2026-10-15, B5 and B8).

It reads the database: works by status, platform account health and expiry, results of the
publishing simulation, with each number saying where it comes from. Real publishing numbers
need real publishing; until then the page says so or stays hidden. Owner decides at this
step which metrics matter (the reference artifact lists candidates).

### Step B6: rename sweep and documents - BUILT 2026-10-15

Built (`progress.md`, last entry of 2026-10-15). Not done on purpose: the sample constants
`systemHealth`, `storageUsage` and `securityEvents` in `src/lib/domain.ts` stay, because the legacy
mock store's `homeTiles` (covered by `tests/domain.test.mjs`) and one sample notice still read them;
retiring the whole mock store is its own step (B8 below).

`Roadmap.md`, `Status.md`, `MVP_draft.md` (sections of the shell, navigation, page specs),
`Readiness_Audit.md` cross-references and the in-site help text use the new names.

### Step B7: help refresh for the changed pages - BUILT 2026-10-15

Built in the same entry.

### Step B8: retire the legacy mock store - BUILT 2026-10-15

Done: `domain.ts` went from 1,600 lines of sample state to 196 (the role table, the status words and
the fixed channel list the library dialogs still offer); the reducer became `ui-state.ts` (role, lock,
message); messaging links and the global search read real works; the page header says the real day;
the component gallery and the sample reset button are gone. Left on purpose: the fixed channel list
in `domain.ts` (library publishing dialogs, not the platform registry). The original note:

`src/lib/domain.ts` still carries the prototype's sample state (works, notices, directory, the
admin tiles) behind `useHub`, read now only by «التحليلات», the reset button on «الحساب», the
global search and tests. When B5 decides what «التحليلات» reads, delete the store and the tests
that cover it in one step.

Guides and what-is-new notes (`v` and `news` per page) for «سجل النشاط», «الحساب»,
«الحسابات», «الإعدادات» and «حسابات المنصات». This is what remains of step 8 of the audit.

## 3. Part C: the audit order that remains

> 2026-10-15: every item below needs the owner's accounts or a signed-in browser. They are written
> out step by step, with the walkthrough, in `Owner_Handoff.md`. OneDrive (C1) is not built before
> an account exists, for the reasons stated there.

| Step | What | Gate |
|---|---|---|
| C1 | OneDrive as a storage provider (S8) on the move engine | A real Microsoft app registration by the owner |
| C2 | A first real move and a first real backup to a real second provider | Owner creates the bucket and key pair (`Storage_Provider_Setup.md`) |
| C3 | First real connection of a Meta and a TikTok account, then the signed-in walkthrough of steps 1 to 8 | Owner creates the apps, enters ids in «المنصات» |
| C4 | Database enforcement of platform limits at the send step (known gap of step 5) | None; small |

## 4. Part D: when the agent computer and the NAS arrive (step 9)

Scheduled backups, timed retries (idea I-024), the NAS provider (S7), email notifications
that need a worker. Designed in `Settings_Integrations_Plan.md`; nothing here starts before
the hardware exists (E-1).

## 5. Carried over from `Readiness_Audit.md` section 3, not scheduled

Delegation while away (owner decision: waits for approval-rights work); email notifications
to members; error monitoring and a tester feedback channel; data handling when a person
leaves; the mobile walk-through by a person; leaked-password protection switch in the
Supabase dashboard; adoption of the Drive refresh token into Vault.

## 6. Order and why

B1, then B2 and B3 (independent of each other), then B4, B6, B7; B5 when the owner decides
its metrics. Part C items are gated on the owner and can interleave. Part B is first because
every later step (the help refresh, the signed-in walkthrough, onboarding testers) is cheaper
and truer on a page set that has settled.

## 7. Working rules for whoever continues

- Read `AGENTS.md` first. Commit a clean baseline before a significant change; local
  commits only unless a push is asked for.
- One step at a time. At the end of each: `npm run typecheck`, `npm run build`, `npm test`,
  a browser check saved under `qa/`, then a dated entry in `progress.md` and the present
  condition in `Status.md`.
- Never edit `disscussios/`. No emoji. New strings in Arabic. Preserve established terms.
- Never add a sign-in bypass to test; signed-in screens are verified over fixtures and by
  the owner.
- Next.js here is not the one you know: read `node_modules/next/dist/docs/` before using
  a framework API.

---

## 8. Step B9 (added 2026-10-15, owner decision): the Director connects everything from the site

Built the same day (`progress.md`, entry of B9). The Director holds `platforms.manage`,
`integrations.secrets`, `settings.view`, `settings.manage`, `storage.manage` and
`whatsapp.system.manage` by default (the assistant none; the administrator everything). From
«الإعدادات»: «الاتصالات» (mailbox, the Google app shared by YouTube and Drive, Drive), «المنصات»
(Meta, TikTok, LinkedIn, X apps), «واتساب النظام» (the bridge key). Accounts connect from «حسابات
المنصات». YouTube, LinkedIn and X connect on the Meta and TikTok model. Not done and not doable
from a form: publishing itself (each platform's adapter and approval), Snapchat and the WhatsApp
channel (manual), Supabase's own address, key and SMTP (the vault needs something to open it).
Next in this line: the adapters, one platform at a time, each after its app is approved
(`Settings_Integrations_Plan.md` S9), and OneDrive (S8) when an account exists.

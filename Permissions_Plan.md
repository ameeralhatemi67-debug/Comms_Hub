# Permissions, assigning, urgency and WhatsApp: build plan

Plan of 2026-10-13, from the owner's discussion of the same day. Status: **accepted,
owner answers recorded 2026-10-13 (D-10 to D-13)**, ready to build in one session. Nothing here is built. Each step below is one working
session, ends with a local commit and a dated `progress.md` entry, and leaves the site
working. Do them in order.

Companion documents: `Roadmap.md` (direction), `Status.md` (present condition),
`Reference_Build_Plan.md` (the plan this one follows in form), `AGENTS.md` (rules).
This plan changes the prototype boundary in `AGENTS.md`; see "Before Step P1".

---

## 1. What the owner asked for

1. **Permissions and assigning**, as new actions on the accounts page (the page for
   inviting and adding members): a role, plus standing permissions that can be added or
   switched off, plus temporary permissions, plus one-time permissions, all at once on
   one person. Easy to add, edit and remove.
2. **Who may give and take:** admin and director; the co-director (the assistant role)
   too, but not over the admin or the director.
3. **Asking:** a member can ask for a permission from mail, messaging, or while chatting.
4. **Urgency of a message:** none, 1, 2, 3 (default none).
5. **WhatsApp:** a member links their number, and the messaging tab sends them a message
   on WhatsApp in two cases only: the message is urgent, or the sender pushed it. The
   system has its own number, which the admin manages.
6. **Routing that never crosses conversations**, however many conversations are open.
7. **The three-level help system** and **connection to the other pages.**

## 2. Decisions recorded

| # | Decision | Source |
|---|---|---|
| D-1 | Role defaults are editable: each role's list of permissions can be opened and each one switched on or off. | Owner, 2026-10-13 |
| D-2 | "Co-director" is the assistant role. | Owner |
| D-3 | The assistant may assign roles only if the admin or director grants that permission. | Owner |
| D-4 | Urgency: 1 for anyone, 2 by permission, 3 only admin, director and assistant. | Owner (the agent's model) |
| D-5 | WhatsApp carries the full message content. | Owner |
| D-6 | WhatsApp is one way: the system sends, nothing comes back in. | Owner |
| D-7 | No cron or edge function for retries now. Saved as idea I-024 in `Ideas_Backlog.md`. The "no background worker" boundary stays. | Owner |
| D-8 | The WhatsApp method is zero cost, as the owner has built before: the WhatsApp Web bridge of the Hedayah project (`D:/Agents/main/projects/hida/bridge`, Node, QR linking, no official API). The sender stays behind an interface. See 8.1. | Owner |
| D-10 | Urgency level names accepted: «للانتباه», «مهم», «عاجل». | Owner, 2026-10-13 |
| D-11 | Whether an assistant may assign the assistant role is left to the builder. Decision: **no**. An assistant assigns only roles of rank 1. | Owner delegated; agent |
| D-12 | Only an admin can see a member's WhatsApp number. Everyone else sees "linked" or "not linked". The member sees their own. | Owner |
| D-13 | `whatsapp.push` is **off until granted**, for every role including leaders. A leader's role template may switch it on. | Owner |
| D-9 | Whether the rules fixed by the reference stay locked: **the agent's call, below.** | Owner delegated |

### D-9, the agent's call: approval and publishing stay locked

A grant must not be able to make a person approve or publish. Reasons:

- The owner already decided (2026-10-12) that approval is the director's and the
  assistant's, and that the right to approve for other people, "delegation while away",
  comes later. A grantable "approve" capability is delegation by another name.
- The rule "nobody approves what they sent or uploaded" and "approval never publishes"
  are separation-of-duties rules. A one-time grant that breaks them defeats their point.
  The database functions that enforce them (the approval rule run, 71 of 71) must stay
  the single authority.

So the catalog has two kinds of entries: **grantable** and **fixed by the reference**.
Fixed ones are listed on the person's card, shown locked with the reason, and cannot be
switched, granted or requested. When delegation is built later, it is a new, separately
specified capability with its own safeguards, not an unlock of these.

## 3. Principles

- **The database decides.** As with the media section, who may do what is a database
  function and row level security. The interface hides and explains; it never decides.
- **No change in behaviour on day one.** The engine is installed with role defaults
  seeded equal to today's rules, then each existing check is moved onto it one at a
  time, each with a test. Nobody gains or loses anything by installation.
- **Time is checked at the moment of use.** A temporary grant is valid while
  `expires_at > now()` when the action runs. There is no sweep job, which keeps the
  "no background worker" boundary.
- **A one-time grant is used up inside the action's own transaction**, with a row lock,
  so two simultaneous clicks cannot both succeed.
- **Nothing is invisible.** Every grant, removal, use, expiry-denial and request is an
  event in an append-only log, and the person concerned is notified.
- **No escalation.** Nobody grants what they do not hold, nobody changes their own
  permissions, nobody reaches above their rank.
- **Arabic interface, English keys.** Raw keys are never shown, as in `MVP_draft.md`
  section 49. No emoji.

---

## 4. The permission model

### 4.1 Layers and how they combine

A person's effective permissions are resolved in this order, later wins:

1. **Role template:** the role's default on/off per capability (editable, D-1).
2. **Standing person override:** added (`allow`) or removed (`deny`) for this person, no
   end date.
3. **Temporary grant:** `allow` until a date and time.
4. **One-time grant:** `allow` for N uses (default 1), optionally bound to one target
   (one folder, one work, one room) and with its own expiry.
5. **Fixed rules:** always applied last. A fixed rule can only take away.

A `deny` at layer 2 beats an `allow` from the role. The person's card always shows
**where each permission comes from**, so nobody has to work it out.

The existing `accounts.pages` list stays as the standing page layer (no migration of
current accounts). Temporary page grants are added on top of it. One-time grants apply
to **actions** only: "open a page once" has no meaning, so the interface does not offer it.

### 4.2 Ranks and who may do what

| Rank | Roles |
|---|---|
| 4 | admin (protected founders) |
| 3 | director |
| 2 | assistant |
| 1 | writer, designer, producer, publisher, member |

| Action | Admin | Director | Assistant | Others |
|---|---|---|---|---|
| Give or take permissions (standing, temporary, one-time) | yes | yes | yes, over rank 1 only | no |
| Edit role templates (D-1) | yes | yes | no, grantable | no |
| Assign a role | yes (never `admin`) | yes | only if granted (D-3), and only roles of rank 1 | no |
| Invite, add, remove a member | yes | yes | add and remove rank 1, if granted | no |
| Edit the director or admin | yes (not protected accounts) | no | no | no |
| Edit the assistant | yes | yes | no | no |

Hard rules, tested: nobody edits themselves; nobody grants a capability they do not
hold (an assistant without "give urgency 2" cannot give it); `admin` is never
assignable; protected accounts cannot be removed or demoted; a role cannot be assigned
that outranks the assigner.

### 4.3 The capability catalog

The catalog lives in `src/lib/permissions.ts` (one source, tested against the seeded
`capabilities` table so the two cannot drift). Initial entries, each mapped to the check
that exists today:

**Pages** (`page.<id>`, from `grantablePages`): work, create, approvals, calendar, media,
tasks, activity, motion, mail, ideas, analytics, monitoring, settings. Standing or
temporary. `create` stays limited by the role's `create` ability, as in `access.ts`.

**Library:** folder levels (view, edit, create, manage) stay in `media_grants` and are
**not duplicated**. A folder level can be given for a time through the same request
and grant UI, written to `media_grants` with an end date (new `expires_at` column) so
there is one mechanism for folders. The person's card lists their folder grants and links
to the library.

**Messaging and mail:** `urgency.2` (grantable), `urgency.3` (fixed, rank 2 and up),
`whatsapp.push` (grantable, default off, D-13), `mail.outside.send` (the held outside mail
rule, grantable), `room.create`.

**Accounts:** `accounts.view`, `permissions.grant`, `roles.assign`,
`members.invite`, `members.remove`, `roles.templates.edit`, `whatsapp.system.manage`.

**Fixed by the reference (locked, shown, not grantable):** approve or reject a work
part, publish or schedule, approve a file version for someone else, approve what you
sent or uploaded, admin role switching, remove a protected account.

The list is deliberately short at first. Adding a capability later is one catalog entry,
one seeded row and one check moved onto the engine.

### 4.4 Database (migration `*_permissions.sql`)

Tables:

- `capabilities` (key, group, label_ar, grantable, scope_kind, min_rank): the catalog.
- `role_capabilities` (role, capability, allowed): the editable defaults.
- `member_capabilities` (id, email, capability, effect `allow|deny`, mode
  `standing|timed|once`, expires_at, uses_left, scope jsonb, reason, granted_by,
  created_at, revoked_at, revoked_by): a person's overrides and grants.
- `permission_requests` (id, requester, capability, wanted `once|timed|standing`,
  duration, scope jsonb, reason, source `button|mail|chat|page`, source_ref, status
  `pending|approved|declined|withdrawn`, decided_by, decided_at, decision_note):
  one pending request per person per capability and target.
- `permission_events`: append-only log of every grant, removal, use, denial, request
  and decision.

Functions (every write a function, as in the rest of the product):

- `has_capability(cap, scope)`: stable, security definer, read-only, resolves the layers.
- `use_capability(cap, scope)`: as `has_capability`, and consumes one use of a matching
  one-time grant under `for update`. Called inside the function that performs the action.
- `my_capabilities()`: the caller's effective set with source and expiry, for the shell.
- `grant_capability`, `revoke_capability`, `set_role_default`, `set_member_override`,
  `assign_role`: all enforce 4.2.
- `request_capability`, `decide_request`, `withdraw_request`.

Row level security: a person reads their own grants and requests; a granter reads those
of people they may manage; the event log is read by the granters for their scope and by
the person concerned. Administrators read all of it, **except** that internal mail and
private room content are never exposed by any of these tables.

Tests: `supabase/tests/permissions_rules.sql`, the way `kit_rules.sql` and the approval
rule run are done: hierarchy, no escalation, no self-edit, expiry at use, one-time
consumed exactly once under concurrent calls, deny beats allow, fixed rules cannot be
granted, installation changes nobody's behaviour. Plus `tests/permissions.test.mjs` for
the TypeScript mirror.

---

## 5. The accounts page

Today `/accounts` is admin only (`adminOnlyPages`, and `accounts` RLS is admin based;
this is an open Compass finding this plan closes). It becomes open to anyone holding
`accounts.view`, which is admin, director and assistant by default. What each sees and
may do is decided by section 4.2, in the database.

### 5.1 Layout

Four tabs, the existing page kept as the first:

1. **الأعضاء (members):** the current list, invitations, and add. Each row shows role,
   pages, and small markers for temporary or one-time grants and a pending request. One
   click opens the person's card in a side panel; the list stays visible.
2. **الأدوار (roles):** the role templates (D-1). A matrix of capabilities by role with
   on/off switches, fixed rules shown locked with their reason. A change shows how many
   people it affects before it is saved.
3. **الطلبات (requests):** permission requests waiting, with approve and decline.
4. **السجل (log):** the permission events, filterable by person and by capability.

### 5.2 The person's card

Top: name, email, role (change inline), last seen, WhatsApp status (linked or not;
the number itself only for an admin, D-12).

Below it, **one list of permissions**, grouped, each row labelled with its source:

- «من الدور» (from the role), with a switch to turn it off for this person.
- «أُضيفت» (added), standing, with remove.
- «مؤقتة حتى …» (temporary until), with extend and end now.
- «مرة واحدة» (one time), with uses left and its target, with end now.
- «مسحوبة» (removed for this person), with restore.
- «مقفلة» (fixed by the reference), with the reason, no control.

Actions kept few and fast: **«منح»** opens one small dialog: choose the capability (a
search box over the catalog), choose **دائمة / مؤقتة / مرة واحدة**, a duration shortcut
row (ساعة، يوم، أسبوع، تاريخ محدد), an optional target and a reason. Defaults: temporary
for a day, one-time for one use. Before saving, a line says in words what the person will
be able to do and until when.

Making it easy, as the owner asked:

- **Presets** («حزم»): a saved bundle of capabilities with a duration, for the usual
  cases (for example "cover for the publisher for a week"). Leaders save them, as plan
  templates already work.
- **Several people at once:** tick rows in the members tab, then grant, change role or
  remove for all of them.
- **Everything explains why** a control is missing or locked, in words, not by hiding.
- **Hold to confirm** only where the effect is large (see 8.3).

### 5.3 Add, edit, remove a member

The existing flow (email, name, role, pages) stays. Changes: choosing a role pre-fills
the pages and shows the role's template; the card's grant dialog is available straight
after adding; removing a member is a hold button that states what happens to their work
and mail (kept, reassigned, or archived, as the current rules say, not changed here).

---

## 6. Asking for a permission

One request object, four doors in. All create the same `permission_requests` row.

1. **A locked control.** Wherever a control is disabled for lack of a capability, the
   quick click explains why, in the same words the hold button uses today, and offers
   **«اطلب هذه الصلاحية»**. It needs `data-need="<capability>"` on the control, which a
   shared helper turns into the explanation and the request. This is the main path.
2. **Messaging.** A «اطلب صلاحية» entry in the composer menu; it posts a request card
   into the conversation with the director, assistant or a chosen granter, not a free
   text message.
3. **Mail.** A new action card type next to the existing ones, carrying the same fields.
4. **The requests page** (`/requests`), a new tab beside extension and folder access,
   for a request made without context.

A request carries what is wanted, for how long, for which target, and why. The granter
sees it in their notification drawer (tier «قرارك»), in the requests tab, and as a
count on Home. **Approve** is one click with the requested mode as default, editable
before confirming (a person can ask for "permanent" and be given "one week"). Decline
asks for a short reason. Rules: one pending request per person per capability and
target; the asker can withdraw; a granter never sees requests for people above their
rank; the person is notified of the outcome; the granted permission appears at once
(Supabase Realtime pings the shell to re-read `my_capabilities()`).

Existing «الطلبات» kinds (extension, folder access) are not changed. A permission
request is a separate table because its rules differ (no stage or task); the requests
page shows both.

---

## 7. Urgency 0 to 3

Today: `chat_messages.urgent boolean`, settable by director and assistant only. New:
`urgency smallint 0..3`, default 0. Existing `urgent = true` rows become 3, which is
exactly who could set them.

| Level | Proposed Arabic | Who may set it |
|---|---|---|
| 0 | (none, no mark) | anyone |
| 1 | «للانتباه» | anyone (D-4) |
| 2 | «مهم» | `urgency.2`: by permission (D-4) |
| 3 | «عاجل» | admin, director, assistant only (D-4); fixed, not grantable |

The word «عاجل» is kept for the top level because it is the established term. The names
of levels 1 and 2 are a proposal for the owner to confirm.

Behaviour:

- **Composer:** the urgent toggle becomes a four-step picker; steps the person may not
  use are shown with why, and offer the request (section 6, door 1).
- **Message:** a badge by level. Level 3 requires acknowledgement from each recipient,
  using the existing `chat_acks`, in line with the notification model's rule that
  critical warnings are acknowledged (section 13) and "critical should remain rare".
- **Notification tier:** 0 stays `info`; 1 and 2 are `attention`, 2 highlighted; 3 is
  `decide`, with the acknowledgement as its action.
- **Mail cards** keep their existing `priority`, and map `urgent` to level 3 when they
  appear in messaging, so the two vocabularies do not drift.
- **WhatsApp threshold** is the recipient's choice (section 9.5).

The work item's own priority «عاجل» is a different thing (a property of a work, with
its own approval rule) and is left alone.

---

## 8. WhatsApp

### 8.1 What is and is not built

Built: linking a number with a handshake, the member's settings, the outbox and routing
rules, the system number's admin panel, the message package, the push action. **Not
built (D-6):** any inbound path, so replies are not read. The message says to reply on
the site. **Not built (D-7):** retries by a timer. A failed send is shown to the sender
and retried by a button, and a queued send is picked up when a page that dispatches is
open, the same pattern as the mail sync.

The sending method is behind one interface (`WhatsAppProvider`: send code, send
message, status), with a fake provider for tests and the bridge provider for real use.

**The method (D-8), found in the owner's Hedayah project.** `projects/hida/bridge` is a
Node bridge on a WhatsApp Web library (`whatsapp-web.js` family, pinned 1.34.7, with a
reviewed compatibility transform in `compat.cjs`), linked to a number by QR code, with
`policy.cjs` (destination rules), `transport.cjs` and `render.cjs`. It is not the
official API, it costs nothing, and it needs a computer that stays on. Its README states
the same, and that the number's session survives restarts.

**How the Comms Hub uses it: a pull bridge.** The site runs on Vercel, so it cannot
call a bridge on the owner's computer, and the computer should not be exposed to the
internet. So the bridge **polls the site**:

1. A small Node program in this repository (`bridge/whatsapp/`), adapted from the
   Hedayah bridge's transport and policy modules (copied and reduced, never edited in
   place; the Hedayah project is not touched), linked to the **new system number** by QR
   in its own terminal.
2. Every few seconds it calls the site's dispatch route with `WHATSAPP_SERVER_KEY`,
   claims queued outbox rows (a database function marks them `sending`), sends each, and
   reports `sent` or `failed` with a short reason. It also reports a heartbeat.
3. The site shows the heartbeat: «متصل» or «غير متصل منذ ...». While the bridge is
   offline, nothing is lost: rows stay `queued`, the sender sees «لم تُسلَّم بعد»,
   and the member is told it will arrive when the system is back.

Why this respects the owner's decisions: the polling timer is **outside the site**, so
D-7 (no cron or edge function in the site) and the "no background worker" boundary
stay. It is one-way (D-6): the bridge ignores every incoming message and replies to
none, which is the Hedayah bridge's own "unknown numbers get no response" behaviour
taken to its limit. The only destinations are numbers the database has verified; the
bridge never receives a free destination from the model or from a browser.

**Facts the owner must keep in mind** (also in the risks): this method can be blocked by
the platform at any time, so the number should be a dedicated one, volume low, and only
verified opted-in members messaged; the bridge's computer must be on for delivery; the
first QR link is a manual step on the owner's phone that no agent can do.

### 8.2 The system number

`system_whatsapp`, one row, edited by `whatsapp.system.manage` (admin by default):
display name, about text, picture (as far as the method allows), on/off, daily cap per
sender, and the content rules in 8.5. A test-send to the admin's own number, a status
line, and the last failures. **Secrets are server-only environment variables**
(`WHATSAPP_*`, and `WHATSAPP_SERVER_KEY` whose sha256 alone is stored in the database,
the same pattern as `MAIL_SERVER_KEY`). No token is ever shown or stored in the table.
A service_role key never enters the repository.

### 8.3 The member's side (handshake)

In the account profile (`profile-editor.tsx`, alongside signature and presence):

1. Toggle «استلام رسائل واتساب».
2. Enter the number (normalised to international form, one account per number).
3. The system sends a six-digit code **from its own number to that number** and nothing
   else. The member types it back on the site. The code is stored hashed, expires in ten
   minutes, allows five attempts, and is rate limited.
4. On success the number is **verified** and bound to the account. Changing it repeats
   the handshake. Turning the toggle off deletes the number.

This is the handshake the owner described: the system speaks only to a number its owner
proved on the site, and the browser can never supply a destination at send time, only a
recipient account. The system never sends to any other contact.

Settings beside it: **send me from level** (2 or 3, default 3), **pushed messages**
on or off, **mute a sender**.

### 8.4 When a message goes out: two cases only

1. **Urgent:** the message urgency reaches the recipient's threshold. Decided **inside
   `chat_send`**, in the same transaction that stores the message, from room membership
   and the recipient's verified link. It writes the outbox rows there, so routing is
   decided by the database, once.
2. **Pushed:** the sender, on a message they sent, chooses «إرسال إلى واتساب» for a
   recipient in that room (`whatsapp.push`, off until granted, D-13, then limited by the
   daily cap and the recipient's mute). Disabled with a reason if the
   person has not linked WhatsApp, without revealing anything about the number.

### 8.5 The package

```
<sender display name>
<urgency label, when above 0>
<content of the message>
<link>
```

Per D-5 the content is the full message text. Recorded limits, the agent's, to keep the
channel sound: a length cap (about 1,000 characters, then "…" and the link), a file or
voice note is named, not attached («مرفق: اسم الملف»), and the link opens the exact room
and message. A **room-level "no outside delivery" switch** is noted as an option; it is
not planned unless the owner wants it.

One consequence the owner should know: full content means private messages leave the
site through WhatsApp's infrastructure. The notification model (sections 32 and 33)
advises opaque notifications for sensitive material. This is accepted by D-5; the plan
only makes sure the **outbox does not keep a second copy of the body** (see 8.6).

### 8.6 Routing that cannot cross conversations

- The outbox row holds **ids, not text**: message id, room id, recipient account,
  sender account, reason (`urgent|push`), the phone-link version, state. The text is read
  from the message at dispatch. So a private message is not duplicated into a table an
  administrator could browse, and the project rule "internal messaging is private from
  administrators" holds.
- A unique key on (message, recipient, reason) makes a double send impossible.
- Recipients come from **room membership at insert time**, never from the interface or
  the current screen. A recipient not in the room is not insertable (a constraint, not
  only a check in code).
- The link is a signed token of (outbox id, recipient, message, expiry). It opens the
  site, which still applies row level security: following it cannot show a room the
  person is not in.
- Dispatch claims rows with the server key through a database function, marks them
  `sending`, then `sent` or `failed` with a short reason. A failed row is retried by a
  button on the sender's message only.
- **Tests (the owner's worry, made explicit):** in `supabase/tests/whatsapp_rules.sql`,
  create four rooms with overlapping members, send urgent messages and pushes
  interleaved, and assert for every outbox row that its room equals its message's room,
  its recipient is a member of that room with a verified link, its reason matches, and no
  row exists for a message that did not meet a case. A fake-provider run asserts that
  what the provider receives equals what the rule produced, nothing more.

---

## 9. Connection to other pages

| Page | What changes |
|---|---|
| **Accounts** (`/accounts`) | The four tabs and the person's card (section 5). Opens for `accounts.view`. |
| **Account profile** | WhatsApp link and settings (8.3). A read-only list of "my permissions": where each comes from and when it ends. |
| **Messaging** (`/mail/chat`) | Urgency picker, level-3 acknowledgement, «إرسال إلى واتساب» on a sent message, «اطلب صلاحية» in the composer, request cards in a conversation, a system line when a permission is granted to the room's person if they asked there. |
| **Mail** (`/mail`) | A permission-request action card; urgency shown on cards; the outside-mail permission explained when it blocks. |
| **Requests** (`/requests`) | A permission tab beside extension and folder access, one queue for the granter. |
| **Notifications** | New notices (granted, ended soon, declined, request waiting, urgent received). `noticeHref` must cover each `go` the database writes, with its test. |
| **Home** | For a granter: pending permission requests. For anyone: temporary permissions ending within 24 hours, and one-time permissions unused. |
| **Library** (`/media`) | Folder access is still the library's. Timed folder grants use the same dialog; a locked control offers the request. The person's card links to a person's folder levels. |
| **Work** (`/work`, `/create`) | Locked controls explain and offer the request; fixed rules (approve what you sent) explain themselves and offer nothing. |
| **Approvals** (`/approvals`) | No grants. Fixed rules stay, explained in the help. |
| **Activity log** (`/activity`) | Permission events as a filterable type. |
| **Admin / settings** | «واتساب النظام» panel (8.2). |
| **Shell** | Reads `my_capabilities()` once, refreshes on a Realtime ping and at the next expiry. `canOpen` also consults the temporary page grants. |

---

## 10. The three-level help system

The system is built (`src/lib/help/`, `src/lib/kit/guide.ts`): a registry of pages, a
guide layer, progress per person in `guide_progress`, selectors tested against the
page's markup. This feature adds content and a new kind of explanation, at every
level.

### Level 1, hover on the help button: what the page is for

One `tip` per page. New or changed: `accounts`, `account`, `chat`, `mail`, `requests`,
and Home.

> accounts: «من يفعل ماذا في المركز: الأدوار والصلاحيات الدائمة والمؤقتة ولمرة واحدة، والطلبات والسجل.»

### Level 2, guide mode (one click, click anything)

Each part and action carries `t`, `b`, `w` (who may use it) and `g` (pages it connects
to). New parts and actions:

- Accounts: the person's card, the source label on each permission, «منح»,
  the three modes, presets, the roles matrix, a locked row (and why), the request queue.
- Messaging: the urgency picker with each level and who may use it, «إرسال إلى واتساب»,
  «اطلب صلاحية».
- Account profile: the WhatsApp toggle, the code step, the threshold.

A **locked control** gets a fourth kind of answer in guide mode: not "what it does" but
"why you cannot, and what to do": whose permission it is, and the request button.

### Level 3, double click: the page guide in place of the page

Per new page: `purpose`; `roles` for each role group (lead, maker, publisher, member),
with the reader's role marked, and a separate line for the assistant because `lead`
groups three roles that differ here; `rules` (the hierarchy, no self-edit, time and
one-time rules, the fixed rules and why); `links` to the connected pages in section 9;
`faq` ("ما الفرق بين المؤقتة ولمرة واحدة؟", "لماذا لا أستطيع منح هذه الصلاحية؟",
"متى يصلني واتساب؟", "هل يرى الآخرون رقمي؟").

### Also

- **First-visit guide** of three or four steps for `accounts` and the profile's WhatsApp
  section, once per person (existing `guide_progress`).
- **First-click tips** (`first: true`) on the person's card and the grant dialog.
- **Routing:** add `/accounts` and `/account` to `pageKeyOf` and `PAGE_HREF` in
  `src/lib/help/registry.ts`.
- **Tested, as now:** `tests/kit.test.mjs` checks every selector named in the help
  exists in the components, so the help cannot silently rot. New hold reasons go in
  `src/lib/kit/hold-reasons.ts`.
- **Wording:** Arabic, written for what the page is in the site, same register as the
  existing entries.

### New hold buttons (long press, with the reason on a quick click)

| Button | Reason shown |
|---|---|
| Remove a member | «إزالة العضو تفصله عن المركز وتبقي أعماله لدى من يُسند إليه.» |
| End all of a person's grants | «تنتهي كل الصلاحيات المضافة لهذا الشخص الآن.» |
| Turn off a role default for the whole role | «التغيير يمسّ كل من يحمل هذا الدور.» |
| Change a role to a lower one | «ينقص هذا التغيير ما يستطيع الشخص فعله فوراً.» |
| Unlink a person's WhatsApp (admin) | «يقطع ربط رقم هذا العضو ولا يُعاد إلا بتحقق جديد.» |

---

## 11. Steps

### Before Step P1: record the boundary change

`AGENTS.md` says prototype data lives in Postgres with named exceptions. Add, by owner
directive of 2026-10-13: **permissions are real** (database, row level security), and
**WhatsApp is a real outside channel** (server-only secrets, one-way, sender behind an
interface). Record both in `progress.md`, and add the WhatsApp environment variables
to the server-only list. Commit a clean baseline first, as the rules require.

### Step P1: the permission engine

Migration `*_permissions.sql`, catalog, `permissions.ts`, tests. Seed role defaults equal
to current behaviour. Move one check at a time onto `has_capability`: first `urgency`
(preparing section 7), then `accounts` management (closing the Compass finding that
accounts RLS is admin based), then the page layer. No interface change.
**Done when:** `supabase/tests/permissions_rules.sql` passes (counted in
`progress.md`), `npm run typecheck`, `npm run build` and `npm test` pass, and a before
and after run of the existing rule runs shows no difference.

### Step P2: the accounts page

Tabs, the person's card, grant dialog, presets, role templates, hold buttons, widened
access, realtime refresh of the shell, help content for `accounts` at all three levels.
**Done when:** the browser check of the public parts is saved under `qa/` as a script
with its JSON result, the help-selector test passes, and the owner has a short
signed-in walkthrough (the agent cannot sign in): add a member; give a day; give once
and use it; remove a role default; see the assistant refused on the director.

### Step P3: asking, and the connections

`permission_requests`, the locked-control helper, requests tab, messaging and mail
doors, notices, Home counts, activity log type. Help for `requests`, `chat`, `mail`
updated. **Done when:** the request rule run passes (one pending, rank filtering,
withdraw, decide), `noticeHref` test covers each new notice, and a walkthrough covers
each door.

### Step P4: urgency 0 to 3

Migration, composer picker, badge, acknowledgement at 3, notification tiers, mail card
mapping, `urgent` column removed in the next migration once nothing reads it.
**Done when:** existing messaging rule runs are unchanged for level 3, new runs cover
levels 1 and 2 with and without the permission, and the browser check passes.

### Step P5a: WhatsApp, everything but the real sender

Tables, member handshake and settings, outbox and routing inside `chat_send`, push
action, admin panel, the `WhatsAppProvider` interface and a fake provider, the routing
rule run of 8.6, help content. **Done when:** `whatsapp_rules.sql` passes including the
four-room case, the handshake flow is run against the fake provider, and nothing in the
repository holds a number or token.

### Step P5b: the real sender (the pull bridge)

`bridge/whatsapp/` as in 8.1: adapted transport and policy, QR link, polling loop,
heartbeat, one-way, dedicated number, run by a `.bat` like the other tools. Its own
tests (the policy and transport tests, as the Hedayah bridge has) run offline against
the fake site. The first real link and a first real message need the owner's phone;
write that as a walkthrough and say plainly that it was not performed.

---

## 12. Questions: answered 2026-10-13

1. **The zero-cost method:** the Hedayah project's WhatsApp Web bridge (8.1, D-8).
2. **Level names:** accepted (D-10).
3. **Assistant and role assignment:** rank-1 roles only (D-11).
4. **Who sees a number:** admin only (D-12).
5. **Push default:** off until granted (D-13).
6. **Level 3 in an emergency:** stays fixed for rank 2 and up. Revisit with
   delegation, which is a later feature.

Still the owner's, and not for an agent to do: link the system number by QR on the
phone, keep the bridge's computer on, and choose the number.

---

## 13. Risks

- **Full content over WhatsApp** (D-5) takes private messages outside the site. Accepted;
  mitigated only by the cap, mute, opt-in and the no-copy outbox.
- **The WhatsApp Web method is unofficial and can be blocked** by the platform at any time.
  The interface and the fake provider mean the site keeps working and the failure is
  visible; the owner should expect to re-link occasionally.
- **No timer means no automatic retry** (D-7). A failed urgent message is visible to its
  sender and a button away, but it does not fix itself.
- **Flexibility can make the page hard to read.** The source label on every row, the
  presets and the plain-language preview are the countermeasures; the owner's
  walkthrough in P2 is where to judge it.

# Prompts for continuing the Android application

Two prompts for two sessions that run side by side (`Android_Handoff.md` section 3 explains why two and not
more).

**How to start them.**
- Paste prompt 1 into a new session in `D:\Agents\main\projects\ideas\Comms_Hub`.
- Prompt 2 needs its own worktree and branch. Either paste it into a second new session started with a
  worktree (branch `android-push-server`), or ask the session of prompt 1 to start it as a separate session in
  its own worktree with prompt 2 as its brief.
- Lane 1 must not edit lane 2's files while lane 2 runs.

---

## Prompt 1: lane 1, the application (A4, A6, then A5 app, A7, A8)

You are continuing the Android application of the Comms Hub, in D:\Agents\main\projects\ideas\Comms_Hub, on
`main`.

**Read first:** `AGENTS.md` (its Android paragraph binds), `Android_Handoff.md` (state, gotchas, the two lanes),
`Android_Build_Plan.md` (phases A4 to A8), `MVP_draft.md` sections 64 and 64.1, and the four progress.md entries
"the Android application, A0" to "A3".

**The rules still bind:**
- Arabic interface and established terms; no emoji anywhere.
- No sign-in bypass, stub session or stored password; agents never sign in. Checks use signed-out pages, the
  emulator started read-only, and the check package `sa.commshub.app.qa` only.
- No secret in the repository. The release key is the owner's; no agent creates, reads or uses it.
- File bytes never cross the bridge.
- Evidence with numbers: typecheck, build, `npm test`, `mobile` `npm test`, the JVM tests, and the phase's
  `qa/android-*.cjs` with its JSON.
- One local commit and one dated progress.md entry per phase. No push unless the owner asks.
- Never stage main's pre-existing uncommitted files (listed in `Android_Handoff.md` section 1).

**Lane 2 runs at the same time** in its own worktree (branch `android-push-server`). It owns the files listed in
`Android_Handoff.md` section 3: `supabase/migrations/*push*`, `src/lib/push/**`, `src/app/api/push/**`,
`src/components/supporting.tsx`, the settings integrations component, `bridge/whatsapp/**`, the flush starters
in `useWork().call` and chat and mail sending, `tests/push.test.mjs`, the root `package.json` test script. Do not
edit those while it runs.

**Do, in order:**

1. **A4, files** (`Android_Build_Plan.md` A4; spec as a new `MVP_draft.md` 64.2).
   - Native `download` (`download.save`, `download.open`) and `share` (`share.file`). Same-site paths only,
     fetched in the application's process with the web view's cookies, as `Downloads.java` does.
   - «فتح الملف» on a document opens the system viewer through the FileProvider `shared/` cache folder (the
     web view has no PDF viewer).
   - Saving puts photos and videos in the gallery through MediaStore, everything else in Downloads. «مشاركة»
     is the share sheet.
   - Show the buttons only with `has('download')` and `has('share')`: on the library's asset page
     (`src/components/media/asset-page.tsx`), mail attachments (`src/components/mail/thread.tsx`) and chat files
     (`src/components/chat/chat-tab.tsx`).
   - Bridge version 3.
   - A check `qa/android-files.cjs` on signed-out-safe fixtures (checksums).
2. **A6, links and the lock.**
   - `public/.well-known/assetlinks.json`. If the owner has not yet given the release key's fingerprint, ask
     once; otherwise build with a placeholder that a test refuses for release.
   - Verified intent filters from the page list (`src/lib/access.ts`) plus `/w/` and `/app/return`; excluded
     `/`, `/r/`, `/m/`, `/api/`. A test holds the manifest equal to the list.
   - `links.verified()` through Android's domain verification, so the sign-in screen sends mailed links
     through `/app/return` (A1 already reads it).
   - The fingerprint lock (`BiometricPrompt`, device credential fallback), off by default, offered once after
     the first sign-in. Its toggle lives in a new component of its own, not in `supporting.tsx`; mount it after
     lane 2 is merged.
   - Bridge version 4. A check `qa/android-links.cjs` (`adb am start` with addresses; `pm set-app-links` for
     the check package).
3. **When lane 2 reports done, merge its branch** into main yourself, only if the owner agrees: name it by its
   full ref (`refs/heads/android-push-server`); conflicts are expected only in `progress.md` and `Status.md`,
   both sides kept in date order. Then **A5 app**:
   - the `push` feature with `@capacitor/push-notifications` (pinned, at least 14 days old) or a small plugin;
   - an Arabic explanation, then Android 13's permission;
   - channels «يحتاج قرارك» (sound, high) and «للانتباه» (silent);
   - the token registered through lane 2's `device_register`;
   - a tap opens `go` (a same-origin path only); a push received in front refreshes the notices;
   - `device_seen` signs a removed device out;
   - `google-services.json` from outside the repository, as `mobile/README.md` will say.

   Check what the emulator can without the owner's Firebase project, and say plainly what waits for it.
4. **A7, camera, share-in, background upload** (`Android_Build_Plan.md` A7), then **A8** (the `play` flavour
   with Play's in-app updates, «طلب حذف حسابي», the listing drafts).

Stop at a safe point (a commit) whenever the usage limit is near, and leave `Status.md` saying what is next.

---

## Prompt 2: lane 2, the push core on the server (A5 server)

You are building the server half of push notices for the Comms Hub's Android application, in your own
worktree on branch `android-push-server`, cut from `main` at `bf802d0` or later. Another session works on the
application at the same time (lane 1). Do not edit its files: `mobile/**`, `src/lib/native/**`,
`src/components/native/phone-app.tsx`, `src/components/auth-gate.tsx`, `src/components/shell.tsx`,
`tests/native.test.mjs`, `qa/android-*.cjs`.

**Read first:**
- `AGENTS.md`, all of it.
- `Android_Handoff.md`.
- `Android_Build_Plan.md` A5, which carries the design, with what exists and is reused.
- `Mobile_Apps_Plan.md` sections 5.3 to 5.5.
- `disscussios/notification_model.md` (read only, never edit).
- The migrations `*work_cycle*` (`notifications`, `work_notify`), `*whatsapp*` (`whatsapp_outbox`, `wa_route`,
  `wa_claim`, `wa_report`, `wa_key_ok`), `*integrations*` (Vault), `*mail*` (`mail_key_ok`, `mail_sync_begin`).
- `src/lib/integrations/vault.ts`, `src/app/api/whatsapp/dispatch/route.ts`, `bridge/whatsapp/`.

**The rules bind as in `AGENTS.md`:**
- Every write is a database function; who sees what is row level security; the outbox holds ids, never text.
- Secrets are in Vault, read only by security-definer functions with `MAIL_SERVER_KEY`, never logged, never in
  a URL or payload.
- Nothing scheduled in the site: starters S-1 (the writer's page) and S-2 (the WhatsApp bridge computer) only,
  no database-started call.
- No service_role key. Arabic interface, no emoji.
- Evidence with numbers; one local commit per step with a dated progress.md entry, on your branch. No push.

**Build:**
1. **Migration `*push*`.**
   - `devices`: the person, platform, version, name, an FCM token never selectable by a page, tiers wanted,
     «إخفاء نص التنبيهات», last seen, removed. Functions `device_register`, `device_seen` (answers whether the
     device was removed), `device_rename`, `device_remove`, `device_prefs`; a view without the token.
   - `push_outbox`: ids only, unique per device, kind and reference.
   - A trigger on `notifications` for `decide` (always) and `attention` (if wanted), never `info`, never to
     the actor.
   - `push_route_chat` spliced into `chat_send` like `wa_route`: direct messages and @mentions, skipping the
     sender and muted members. A hook in internal mail sending for action cards addressed to the person.
   - `push_claim` and `push_report` with the server key's sha256: skip locked, 5-minute stale release,
     5 attempts. The payload is built at claim time:
     - the notice id, the `go` path, the tier;
     - a work notice's text unless hidden;
     - for chat and mail only «رسالة جديدة من …», never message text.
     An invalid token clears that device's token.
   - `push_flush_begin`, a lock and a gate modelled on `mail_sync_begin`.
   - Applying it: the earlier builds applied their migrations to the comms-hub project through the Supabase
     tool and then ran the advisors. Ask the owner once before applying this one, then do the same.
2. **`supabase/tests/push_rules.sql`**, run in a transaction that rolls back, in the style of
   `supabase/tests/whatsapp_rules.sql`. Results in `qa/push-rules.json`.
3. **The sender.**
   - `src/lib/push/` holds the payload rules (pure, tested: no message text, no query strings, hidden text
     honoured) and an RS256 service-account JWT with `node:crypto`, its access token cached 55 minutes.
   - FCM HTTP v1 with the Android channels: `decide` (sound, high) and `attention` (silent).
   - The credential is a new integrations type `fcm_service_account` (kind messaging), entered in «الإعدادات»
     by someone holding `integrations.secrets`, verified by getting a token before `storeChecked` commits it.
4. **`/api/push/flush`.** It accepts the signed-in page (S-1, through the gate) or the bridge's key (S-2), uses
   `MAIL_SERVER_KEY` for claim and report, and returns at once when nothing is queued.
   - S-1: a debounced `kickPush()` after successful writes in `useWork().call`, chat send, mail send and the
     other notice writers.
   - S-2: `bridge/whatsapp/` calls the flush on its loop, through a second client beside `siteClient`.
5. **On «الحساب»** (`src/components/supporting.tsx`, plus a new `src/components/native/devices.tsx`):
   - «أجهزتي»: rename, and «إزالة الجهاز» behind a long press (`data-hold`, a reason in
     `src/lib/kit/hold-reasons.ts`);
   - «الخروج من الأجهزة الأخرى» (`signOut({ scope: 'others' })`) beside the existing global sign-out;
   - «إعدادات التنبيهات»: «انتباه» on or off, and «إخفاء نص التنبيهات».
   - Add the page guide's parts if new selectors are added (`src/lib/help/pages.ts`, tested).
6. **Tests.** `tests/push.test.mjs`, added to the root `package.json` test script. A check `qa/push-flush.cjs`
   in which a local FCM stub receives exactly the expected messages. The specification as `MVP_draft.md` 64.3,
   and a paragraph in `AGENTS.md`.

**When done:** typecheck, build, `npm test`, the rule run and the advisors all pass. Leave the branch committed
and unmerged, and report to lane 1 (or the owner) with:
- the branch's full ref;
- what lane 1's application must call: `device_register`'s arguments, the push payload's fields, and the
  channel ids.

Real delivery to a phone waits for the owner's Firebase project and lane 1's A5 app; say so plainly.

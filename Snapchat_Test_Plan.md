# Snapchat «تجربة النشر»: plan and contract

Started 2026-11-26 at the owner's request, after the connection (`MVP_draft.md` 84, `Snapchat_Plan.md`). The owner asked that a person who has connected a
Snapchat account can test from its sheet, on the pattern of the other platforms: post, read what can be read, and delete after, so nothing is left behind.
This file is the contract the three parts of the build share (database, server, panel). Everything about Snap's API was read from
`developers.snap.com/marketing-api/Public-Profile-API/` on 2026-11-26 (pages undated). **None of it has met a real Snap answer**: the whole API is
allowlist only (`GetStarted`: "currently allowlist only"), so no test can run for real until Snap has allowed the client id.

## 1. What Snap's API offers (read 2026-11-26)

| | Endpoint (base `https://businessapi.snapchat.com`) | Notes |
|---|---|---|
| Create media | `POST /v1/public_profiles/{profile}/media` {type VIDEO or IMAGE, name, key, iv} | key 32 bytes and iv 16 bytes, base64. Answer: `media_id`, `add_path`, `finalize_path`. A media object lives 24 hours. |
| Upload | `POST /{add_path}` multipart form {action=ADD, file, part_number 1 to 35}, then `POST /{finalize_path}` {action=FINALIZE} | The file is AES-256-CBC encrypted first (`openssl enc -aes-256-cbc -nosalt -K key -iv iv`, PKCS7 padding). A part is at most 32 MB; up to 1 GB in all. |
| Story | `POST /v1/public_profiles/{profile}/stories` {media_id, customized_ttl, link, captions...} | Video .mp4, 5 to 300 s. Default 24 hours; `customized_ttl.ttl` ONE_DAY, TWO_DAYS, THREE_DAYS, ONE_WEEK. **The answer carries no story id. There is no delete endpoint for a Story: it expires.** |
| Spotlight | `POST /v1/public_profiles/{profile}/spotlights` {media_id, locale, description (160), go_live_timestamp (RFC 3339, future, within 30 days), link, captions} | Answer: `spotlight_id` (a 58-character base64url string). Status SUBMITTED, LIVE or REJECTED. |
| Read a Spotlight | `GET /v1/public_profiles/{profile}/spotlights/{id}` and `GET .../spotlights?limit=` | `spotlights[].spotlight.{id,status,created_at,title,duration,...}` |
| Delete a Spotlight | `DELETE /v1/public_profiles/{profile}/spotlights/{id}` | Permanent. |
| Stories read | `GET /v1/public_profiles/{profile}/stories?limit=` | `stories` list. |
| Stats | `GET /v1/public_profiles/{profile}/stats` (profile, lifetime), `.../spotlights/{id}/stats`, `.../stories/{id}/stats` | `timeseries[].fields[].{field.field_name, stats[].value}`. Names include VIEWS, VIEWERS, SHARES, SCREENSHOTS, SUBSCRIBERS, SPOTLIGHT_VIEWS, STORY_VIEWS. **"Usually synchronize after 24 hours"** (FAQ), 90 days back. No reach or completion-rate metric. |

Not built: Saved Stories, picture Stories, links and captions on posts, group messages (separate allowlist), partnership roles, earnings, files over one part.

## 2. The kinds

`platform_tests.kind` grows by three, plus one that has no row.

| Kind | What it does | Cleanup | Long press |
|---|---|---|---|
| `snap_check` | **No row, no file.** Reads the account: the Public Profile (name, handle, subscriber count), its last Spotlights and Stories (counts, statuses), and the profile's lifetime stats. | nothing to clean | no |
| `snap_silent` | The default post. A Spotlight scheduled 14 days ahead (`go_live_timestamp`), read back (status, id), deleted at once, in one request. Recorded `published`, then `deleted`. If the delete is refused it stays `published` and the list offers the delete. **That a Snap scheduled Spotlight is shown to nobody before its time is read from one line of the docs ("published at that time") and is NOT proven**: the panel's words must say it plainly. | deleted at once | no |
| `snap_spotlight` | A Spotlight posted now, public on the profile and in Spotlight. Read back (status). | «حذف» deletes it (permanent) | yes |
| `snap_story` | A Story posted now with the default 24 hours, visible to followers. | **cannot be deleted**: it ends by itself after 24 hours; the panel says so before and after | yes |

One file per test: a video `video/mp4`, at most `SN_VIDEO_MAX` (30 MiB: one part, with room for the encryption's padding), from the library or the device.
The server reads it, encrypts it with a key and iv it derives from the server key and the test id (nothing kept), creates the media, adds the one part,
finalizes, then posts. The page never holds a token, an upload address or the key.

## 3. Rules that exist once in `src/lib/platforms/test-rules.ts` and once in SQL (held equal by `tests/snapchat-test.test.mjs`)

- `SN_VIDEO_MAX = 30 * 1024 * 1024`, mime `video/mp4` only (Snap asks for .mp4).
- `SN_DESCRIPTION_MAX = 100` (the test's `title`; Snap allows 160, the table's title is 100).
- `SN_SILENT_DAYS = 14`. The database accepts `scheduled_for` for `snap_silent` between 1 hour and 29 days ahead, and refuses it for every other Snap kind.
- `snap_story` and `snap_spotlight` have `scheduled_for` null. `privacy` is null for all Snap kinds. `purpose` is `test` only (no direct publish).
- Daily cap: the existing one (10 tests per account per day).
- `video_id` of a published Spotlight test is the `spotlight_id` (`^[A-Za-z0-9_-]{6,60}$`); a published `snap_story` has none (Snap gives no id), as a TikTok post may have none.
- `container_id` holds the `media_id` (a UUID).

## 4. Database contract (migration `*_platform_tests_snapchat.sql`)

- `platform_test_may` accepts a `snapchat` account (`conn_kind = 'oauth'`), same who-rule as the others.
- `platform_test_start(p_account, p)` takes `p.kind` of `snap_silent|snap_spotlight|snap_story`, `title`, `source`, `asset`, `version`, `size`, `mime`, and for `snap_silent` `scheduled_for`; refuses with `TEST_INVALID` / `SCHEDULE_INVALID` as the others do. Other platforms' behaviour is unchanged.
- Constraints widened: kind, mime (video/mp4 for Snap kinds), size (30 MiB for Snap kinds), source (library allowed), published-needs-an-id (a `snap_story` may have none), privacy-by-kind (null for Snap kinds).
- `platform_test_done` accepts a null `p_video` for `snap_story` only and a 6 to 60 character id for the Spotlight kinds; `p_channel` must equal the account's `external_id` (the Public Profile id).
- `platform_test_container`, `platform_test_deleted`, `platform_test_failed`, `platform_test_get` work for the Snap kinds with no change in meaning.
- Nothing else of the engine changes. No new table, no new secret, no key stored.

## 5. Route contract (server half: `src/lib/platforms/snapchat.ts`, `test-snapchat.ts`; routes `src/app/api/platforms/test/route.ts` and `[id]/route.ts`)

All answers are `Response.json`. A refusal is `{ error: <Arabic words>, code: <code>, retry?: true, detail?: <short code> }` with a status; `error` is shown as is.

`POST /api/platforms/test`, body `{ account, kind, ... }` for a Snapchat account:

- `kind: 'snap_check'` -> `200 { check: Check }` where
  `Check = { profile: { name: string; username: string | null; subscribers: number | null }; spotlights: { count: number; live: number; submitted: number; rejected: number } | null; stories: { count: number } | null; stats: { subscribers: number | null; views: number | null; viewers: number | null; shares: number | null; screenshots: number | null } | null; note: string }`.
  A part Snap would not give is `null`; the profile read refused (for an app Snap has not allowed) is a refusal with `code: 'ACCESS_NOT_GRANTED'`.
- `kind: 'snap_silent' | 'snap_spotlight' | 'snap_story'`, `source: 'library' | 'device'`, `asset` (library), `size` and `mime` (device), `description` (Spotlight kinds, at most 100 characters) ->
  - library: the whole post in this request, then the final answer below;
  - device: `200 { test: <id>, phase: 'upload', upload: <Drive resumable address> }`; the page sends the file to that address, then `POST /api/platforms/test/{id}` `{ step: 'uploaded', ref }`, which gives the final answer.
- Final answers: `snap_silent` -> `{ done: true, silent: true, deleted: boolean, post: <spotlight id>, status: 'SUBMITTED'|'LIVE'|'REJECTED'|null, at: <iso go-live>, kind, error?: 'SN_SILENT_NOT_DELETED' }`;
  `snap_spotlight` -> `{ done: true, post: <spotlight id>, status, kind }`; `snap_story` -> `{ done: true, kind, endsAt: <iso, 24 hours after> }`.

`POST /api/platforms/test/{id}`: `{ step: 'uploaded', ref }` (above); `{ step: 'stats' }` for a published Spotlight test -> `200 { stats: { views, viewers, shares, screenshots: number | null each; at: iso; late: true } }` or a refusal (`SN_STATS_UNAVAILABLE` when Snap has none yet).

`DELETE /api/platforms/test/{id}`: a test still uploading is cancelled (`{ cancelled: true }`); a published `snap_spotlight` or left-scheduled `snap_silent` is deleted at Snap (`{ deleted: true, gone?: boolean }`); a `snap_story` refuses with `code: 'SN_NO_DELETE'`.

New codes (words in `TEST_ERROR_AR`, owned by the server half): `SN_NO_DELETE`, `SN_MEDIA_REFUSED`, `SN_MEDIA_EXPIRED`, `SN_UPLOAD_FAILED`, `SN_POST_REFUSED`, `SN_SILENT_MISMATCH`, `SN_SILENT_NOT_DELETED`, `SN_STATS_UNAVAILABLE`, `SN_TOO_BIG`; the connection's own `ACCESS_NOT_GRANTED`, `TOKEN_REFUSED`, `NOT_CONNECTED`, `RATE_LIMIT`.

## 6. Panel contract (`src/components/work/snapchat-test.tsx`, mounted in the Snapchat account's sheet as the other platforms' panels are)

- Title «تجربة النشر على Snapchat». First a plain note: Snap's API is open only to apps Snap has allowed, so until it has, the check may say Snap refused.
- A choice of four, the first the default: «فحص الحساب بلا نشر» (`snap_check`), «فحص صامت» (`snap_silent`: a Spotlight scheduled 14 days ahead and deleted at once; says that whether Snap hides it until then is not proven), «سبوتلايت» (`snap_spotlight`, long press, says it is public and can be deleted after), «قصة» (`snap_story`, long press, says it is visible to followers for 24 hours and **cannot be deleted**, it ends by itself).
- A file from the library or the device (video mp4, at most 30 MiB), a description for the Spotlight kinds, the send button. A button that needs a long press carries a `data-hold` reason (`src/lib/kit/hold-reasons.ts`).
- The result in words: what was done, the post's status, and for the silent check whether it was deleted. After a check: the numbers, with the sentence that Snap's numbers arrive about a day late and reach back 90 days.
- A list of this account's recent Snap tests (read from `platform_tests` as the other panels read theirs) with «حذف» on a Spotlight test and «قراءة الأرقام» (`step: 'stats'`) on a published Spotlight test; a Story row says it ends by itself.
- Nothing about a token, an address or a key; no emoji; Arabic words; English only inside `<bdi>` per `src/lib/guide-text.ts` where the page uses it.

## 7. Checks that exist when it is done

`supabase/tests/platform_tests_snapchat_rules.sql` (Docker, with the other platform-test rule files still passing), `tests/snapchat-test.test.mjs` (the API client against a fake Snap, the encryption, the rules and their parity with SQL), `qa/snapchat-test-flow.cjs` (the panel on a fixture), and the older suites unchanged.

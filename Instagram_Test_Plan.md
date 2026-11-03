# «تجربة النشر» on an Instagram account: plan

Written 2026-11-03 from the owner's request, after the YouTube test went live (`MVP_draft.md` section 71, `267e88f`). Read first: the
YouTube test's code, the Meta connection code, the live comms-hub database, and Meta's own documentation as of 2026-11-03 (content
publishing, `IG User /media`, `IG Media`, `content_publishing_limit`, Graph API v26.0). Built the same day with the six
recommended answers: `MVP_draft.md` section 72 is what was built, and `progress.md` records where it differs from this plan.

## What makes Instagram different from YouTube

These five facts change the design. Everything else follows the YouTube test.

1. **Instagram has no private post.** A professional account's posts are public. The quiet choice is a **Story**, which disappears by
   itself after 24 hours. The panel offers that in place of YouTube's «خاص», and says plainly that nothing on Instagram is private.
2. **Meta fetches the file; the site cannot upload it.** A container is created with `image_url` or `video_url`, and Meta downloads
   the file from that address, which must be public. Pictures can only go this way. Video can also go by Meta's resumable upload
   (`rupload.facebook.com`), but its documentation shows one POST of the whole file, with no pieces. That cannot pass through the
   host's 4.5 MB request limit. So **both kinds need a short-lived public address on the site** that serves the file to Meta.
3. **Publishing is two steps with a wait.** First a container is created. Then its `status_code` moves from `IN_PROGRESS` to
   `FINISHED`, or to `ERROR` or `EXPIRED` (containers expire after 24 hours). Only then does `media_publish` make the post. Meta
   suggests checking once a minute for up to five minutes. There is no background worker, so the open page drives each step.
4. **Delete exists, but is not proven for this connection.** `DELETE /{ig-media-id}` removes a post, a Reel or a Story (and a whole
   carousel, never one item of it). Meta documents it for "Instagram API with Facebook Login" only, with `instagram_basic` and
   `instagram_manage_contents`. The site connects through Unified login and does not ask for `instagram_manage_contents` today.
5. **The limits** (Meta's documentation):

   | Kind | Limits |
   |---|---|
   | Pictures | JPEG only (no PNG, MPO or JPS). 8 MB at most. Aspect ratio 4:5 to 1.91:1 for a post; 9:16 recommended for a Story. Width 320 to 1440, scaled. |
   | Story video | MP4 or MOV, H.264 or HEVC, AAC. 3 to 60 seconds. 100 MB at most. |
   | Reel | Same formats. 3 seconds to 15 minutes. 300 MB at most. 23 to 60 frames a second. |
   | Words | Caption up to 2,200 characters, 30 hashtags and 20 mentions. Alt text up to 1,000 characters, picture posts only. A Story takes no caption. |
   | Quota | `content_publishing_limit` says **50** published posts per 24 hours. The overview page says 100, so the panel reads the live figure and never hard-codes it. Also 400 containers per 24 hours. |

## Where things stand (comms-hub, read 2026-11-03)

- **No Instagram or Facebook account is connected**, and the Meta app is not entered (no `meta_app` row). Instagram's setup in
  «المنصات» stopped at the step «keys», with two steps confirmed. Another session is rewriting the Meta guide right now.
- **The connection already asks for `instagram_content_publish`** (in the Unified-login configuration and in `META_SCOPES`). An
  Instagram account is stored as type `meta_instagram`, its token is in Vault, and the host is `graph.facebook.com` v26.0
  (`GRAPH_VERSION` in `src/lib/platforms/oauth.ts`).
- So the first steps are the owner's (Part A). Building can start before them, but nothing can be tried for real until an account
  is connected.

## Decisions to take

The first option is the recommendation.

| # | Question | Recommendation |
|---|---|---|
| 1 | Which kinds in the first version? | **Story** (picture or video, the default), **picture post**, and **Reel**. Carousels and trial Reels come later. |
| 2 | What replaces «خاص / عام»? | «قصة تختفي بعد 24 ساعة» against «منشور دائم», with a plain line that Instagram has no private post. |
| 3 | Deleting | Ask for `instagram_manage_contents`. The owner adds it to the Unified-login configuration in Meta's dashboard, then reconnects once. «حذف» tries the delete; if Meta refuses it for this kind of token, the panel says so and shows «احذفه من التطبيق» with the post's link. A Story needs no delete. |
| 4 | A file from this device | It first goes to a temporary Drive folder, «Comms Hub/تجارب النشر», through the browser's existing direct-to-Drive upload. It never appears in the library. It is moved to Drive's trash (recoverable for 30 days) once Meta has the file. |
| 5 | Size caps for a test | Picture 8 MB and Story video 100 MB (Meta's own). Reel **100 MB** for now, below Meta's 300 MB, because the site's function must hand the whole file to Meta within its time limit. Raise it after measuring. |
| 6 | Comments on a test post | Leave them as Instagram sets them. Turning them off needs one more permission (`instagram_manage_comments`). |

## Part A: prerequisites (the owner)

- **A1.** Finish the Meta app in «الإعدادات» «المنصات» (the guide the other session is writing): app id, secret and the
  configuration id.
- **A2.** Connect the department's Instagram account in «حسابات المنصات».
  - It must be a professional account.
  - If its Facebook Page requires Page Publishing Authorization, Meta blocks publishing until that is done.
  - While the Meta app is in development mode, the person who connects must have a role on the app. That is enough for the
    department's own account.
- **A3.** If decision 3 is yes: add `instagram_manage_contents` to the configuration's permissions, then reconnect the account
  once. The connection stores the granted scopes, so the panel knows whether «حذف» can work, as it does for YouTube.

## Part B: the database

One migration, `*platform_tests_instagram*`. It extends `platform_tests` rather than adding a second table, so «آخر التجارب», the
daily limit and the rights stay one model.

- **Who:** `platform_test_may` accepts `instagram` beside `youtube`, connected for real. The rule is unchanged: those who manage
  accounts, and the account's own publishers.
- **New columns:**
  - `kind`: `video` for YouTube; `story_image`, `story_video`, `image` and `reel` for Instagram.
  - `container_id`, `post_url` (the permalink) and `share_to_feed`.
  - `temp_ref`: the Drive id of a device file's temporary copy.
  - `link_hash` and `link_until`: the sha256 of the temporary address's token, and when it stops working.
- **Changed columns:**
  - `privacy` becomes required for YouTube and empty for Instagram.
  - `video_id` keeps the post's id on the platform. Its check already accepts Instagram's numeric ids, and the deployed code reads
    it, so it is not renamed.
- **`platform_test_start`** checks by platform:
  - **Instagram:** the kind; the type for that kind (`image/jpeg` for pictures, `video/mp4` or `video/quicktime` for video); the size
    for that kind; and the caption against 2,200 characters, 30 hashtags and 20 mentions. The caption is not stored. Its first line,
    up to 100 characters, becomes the list's `title`.
  - **YouTube:** the same checks as today.
- **New server-key functions:**
  - `platform_test_link` keeps a token's hash and its end.
  - `platform_test_fetch` returns the file's reference, type and size for a token. It answers only while the link is valid and the
    test is still waiting for Meta.
    - It is the one function that runs with the server key and **no session**, because Meta has none.
    - It follows the pattern of review links (`media_share_resolve`, `src/app/r/[token]/route.ts`).
  - `platform_test_container` records Meta's container.
- **Changed server-key function:** `platform_test_done` also checks that the post's owner is the account's Instagram id.
- **Limits:** ten tests per account a day stays. Meta's quota is read live.

## Part C: the server

- **`src/lib/platforms/instagram.ts`**, with every call taking its `fetch`, as `youtube.ts` does:
  - `createContainer`: `image_url` or `video_url`; `media_type` `STORIES` or `REELS`; `caption`; `alt_text`; `share_to_feed`.
  - `containerStatus`, `publish` (`media_publish`), `mediaInfo` (`permalink`, `media_product_type`, owner) and `deleteMedia`.
  - `publishingLimit`.
  - Meta's error code and subcode become short codes beside the existing `metaErrorCode`, then words: the file could not be
    fetched, the file was refused, quota reached, not a professional account, Page Publishing Authorization needed, and permission
    missing.
- **The temporary public address**, `GET` and `HEAD /api/platforms/test/file/[token]`:
  - The token is 32 random bytes. Only its hash is kept.
  - It works for 30 minutes, or until the container leaves `IN_PROGRESS`.
  - It serves byte ranges with the exact `Content-Type` and `Content-Length`, and sends `Cache-Control: no-store` and
    `X-Robots-Tag: noindex`.
  - A wrong token and an expired one get the same 404. The token is never logged.
  - It sits under `/api/` so the phone and desktop applications never claim it as a page of theirs.
- **The routes:**
  - `POST /api/platforms/test` branches on the account's platform.
    - For a device file, it opens a Drive upload session in the temporary folder (as `/api/media/upload-session` does). A second
      call registers the file, with its size checked against Drive.
    - Then the server checks the account (`metaAccountHealth`: the account answers and the token is valid), sets the link and
      creates the container.
  - `GET /api/platforms/test/[id]` moves the test one step each time the page asks.
    - It reads the container's status.
    - At `FINISHED` it publishes, reads the permalink, ends the link and trashes the temporary copy.
    - At `ERROR` or `EXPIRED` it fails the test with Meta's reason.
  - `DELETE` behaves as it does for YouTube: it cancels a waiting test, or deletes a published one from Instagram.
- **Pictures that are not JPEG** are redrawn to JPEG in the browser, as the writing sheet already redraws pictures. That includes
  library pictures, fetched through the existing content route. The server converts nothing.

## Part D: the panel

- **Shared parts.** The pieces that both platforms need move out of `youtube-test.tsx` into a small shared kit: the file chooser
  (library or device), the progress, «آخر التجارب» and the links. `instagram-test.tsx` sits beside the YouTube panel, which looks
  the same as before.
- **Links:** «الحساب على إنستغرام» (`instagram.com/<username>/`), and each post's own link.
- **Form:**
  - **النوع:** «قصة» (the default, which says it disappears after 24 hours), «منشور صورة» or «ريلز». A Reel adds «يظهر في الشبكة
    أيضاً», off by default. Meta warns that neither value guarantees where a Reel appears, so the words say «قد».
  - **The file:** from the library or this device. A picture for a Story or a picture post; a video for a Story or a Reel.
  - **Caption:** with counters for characters, hashtags and mentions. There is none for a Story, since the API takes none.
  - **Alt text:** for a picture post, optional.
  - **«نشر التجربة»:** always a long press, because every Instagram test is public. For a post: «يراه كل من يزور الحساب فور نشره».
    For a Story: «يراه المتابعون 24 ساعة».
- **Progress in words:**
  - «يُرفع الملف» (for a device file).
  - «إنستغرام يجلب الملف ويجهّزه», with the time elapsed and a line that a video can take minutes and the page must stay open.
  - «يُنشر», then the result with «فتح على إنستغرام».
- **Quota:** one line from `content_publishing_limit`: how many of Meta's daily posts are used.
- **«آخر التجارب»:** kind, state, time and who, with «فتح» and «حذف» (long press). Without the permission, «احذفه من التطبيق»
  replaces «حذف». A Story says when it disappears.

## Part E: words and documents

- **`public/privacy.html`, in both languages:**
  - the temporary address that serves a test file to Meta for a few minutes;
  - `instagram_manage_contents`, if it is asked for;
  - what a test publishes and deletes.
- **The simulation line and help card Z01.** They name the YouTube test today, so both must include Instagram, with
  `Help_Content_Matrix.md` kept equal.
- **The Meta guide's notes,** agreed with the session that owns that file.
- **`MVP_draft.md`** section 72, an `AGENTS.md` paragraph, and `progress.md` and `Status.md`.

## Unknowns, and how each is settled

| Unknown | Settled by | If it fails |
|---|---|---|
| Whether Meta fetches a large video from the site within the function's time limit (60 seconds here) | The first real Reel, timed | Lower the cap, or raise `maxDuration` |
| Whether the Unified-login token may delete | The first real delete | The panel's built-in fallback to deleting in the app |
| Whether a Story's permalink opens for others | Read `permalink` | Show the link only when Meta gives one |
| Meta's real quota (50 or 100) | Read live | Never hard-coded |

## Order of work

1. **Owner:** Part A.
2. `instagram.ts` and its tests against a fake Graph API.
3. The migration, and its rules on a private container.
4. The routes, the temporary address and their tests.
5. The shared kit, the Instagram panel, and the fixture check.
6. Words and documents.
7. Checks, then the owner approves the migration and the deployment (a worktree off `origin/main`, as for YouTube).
8. **Owner:** a first real test, in order: a Story picture, then a short Reel, then a delete.

## Checks

- **`tests/instagram-test.test.mjs`:**
  - the container's parameters for each kind;
  - the status steps, the publish, the permalink, and the delete codes;
  - the limits equal to the SQL;
  - no token or address in the page;
  - the file route answers only a valid token;
  - nothing is logged.
- **`supabase/tests/platform_tests_instagram_rules.sql`:**
  - the rights;
  - the kinds and sizes;
  - the link works only while waiting, only by its hash, only with the server key, and without a session;
  - a post on another account is not recorded;
  - YouTube's rows are unchanged.
- **`qa/instagram-test-flow.cjs`** on a fixture with a slow fake Meta:
  - each kind, with the Story as the default;
  - the long press and the counters;
  - the progress steps and the errors in words;
  - delete and its fallback;
  - phone and evening.
  - `qa/youtube-test-flow.cjs` still passes **49 of 49**.
- **Live, after deploying:**
  - the file route gives 404 for any token;
  - the routes and the table refuse signed-out callers;
  - no runtime errors.

## What this does not do

- No carousel, no trial Reel, and no control of comments.
- No Facebook Page test. It could reuse the same machinery and the same temporary address later.
- No scheduling. Publishing works stays a simulation.

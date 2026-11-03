# «تجربة النشر» on a Facebook Page: plan

Written 2026-11-03 from the owner's request, after the YouTube and Instagram tests went live (`MVP_draft.md` sections 71 and 72).
Read first: those two tests, the Meta connection code, the live comms-hub database, and Meta's own documentation as of 2026-11-03
(Pages API posts, Page photos, Reels publishing, video publishing, the Page Stories API, Graph API v26.0). Built the same day
with the six recommended answers: `MVP_draft.md` section 73 is what was built, and `progress.md` records where it differs.

## What makes Facebook different

These facts change the design. Everything else follows the YouTube and Instagram tests.

1. **A Page post can be tested without anyone seeing it.** A post may be scheduled between 10 minutes and 30 days ahead
   (`published=false` with `scheduled_publish_time`). It stays invisible until then, and `DELETE /{post-id}` removes it.
   - So the quiet test, Facebook's answer to YouTube's «خاص», is a **silent check**: schedule a text post four weeks ahead, read
     it back from the Page, then delete it at once.
   - It proves that the token can create, read and delete posts on that Page, and nothing is ever public.
2. **Delete is documented and needs nothing new.** It needs the Page token and `pages_manage_posts`, which the connection
   already asks for. Instagram's delete, by contrast, needs a permission the template may lack.
3. **Text is allowed.** Unlike Instagram, a Page post can be words alone (`message`), with or without a `link`.
4. **A photo can be sent, not fetched.** `POST /{page-id}/photos` takes a multipart file of at most **4 MB**. A picture redrawn to
   JPEG in the browser (at most 1440 pixels wide) is far below that, and below the host's 4.5 MB request limit. So photos go
   through the site's server, with no public address at all.
5. **A Reel is fetched, like Instagram's.**
   - `video_reels` has three steps: `start`, an upload to `rupload.facebook.com`, then `finish` with `video_state` set to
     `PUBLISHED`, `DRAFT` or `SCHEDULED`.
   - The upload accepts a `file_url` header for a hosted file. So the Instagram test's temporary address serves it, unchanged.
   - Meta's crawler (`facebookexternalhit/1.1`) must not be blocked by the site's `robots.txt`. The site has none today:
     `/robots.txt` answers with the sign-in page, which crawlers read as no rules.
   - A Reel lasts **3 to 90 seconds**, 9:16 recommended, MP4 with H.264 or H.265.
6. **The limits:**
   - Reels: **30** published through the API per Page in a moving 24 hours (stated on the Reels page).
   - Feed posts: no number is stated.
   - Scheduling: 10 minutes to 30 days for posts, and 29 days for a scheduled Reel.
7. **What waits:**
   - **A long, non-Reel video** needs the Resumable Upload API (`/{app-id}/uploads`). Its documentation shows one POST of the
     whole file, which cannot pass the host's limit. Reels cover the video test.
   - **Stories** (`photo_stories`, `video_stories`) need `business_management` when a system user's token is used.
   - Both are left for later.

## Where things stand (comms-hub, read 2026-11-03)

- **Facebook is in the platform list but switched off** (`enabled = false`, readiness «not started», publish mode «assisted»).
- **The Meta app is not entered** (no `meta_app`). Facebook's setup in «المنصات» has no step confirmed. No Facebook or Instagram
  account is connected.
- **A Page connects as `meta_page`**, with the Page's own access token in Vault. The link step already requires
  `pages_manage_posts` (`NEEDED` in `src/app/api/platforms/link/route.ts`).
- **The Facebook guide** adds the use case «Manage everything on your Page» to the same Meta app, with `pages_manage_posts`,
  `pages_read_engagement` and `publish_video`. Its configuration must include Pages, and the person who connects needs the
  `CREATE_CONTENT` task on the Page.
- **A real risk.** The guide's first step says the Page use case may refuse to sit beside Instagram's on one app. The site holds
  **one** Meta app today (one `meta_app` row). If Meta refuses, Facebook needs a second app, which the site cannot store yet.
  That would be a separate change, decided only if it happens.

## Decisions to take

The first option is the recommendation.

| # | Question | Recommendation |
|---|---|---|
| 1 | Which kinds in the first version? | **Silent check** (the default), **text post** (with an optional link), **photo post**, **Reel**. A long video and Stories come later. |
| 2 | What replaces «خاص / عام»? | «فحص صامت» against «منشور عام». The silent check says it is never shown and is deleted at once. Everything else is public. |
| 3 | How a photo travels | Through the site's server as a file (at most 4 MB after the JPEG redraw), so no public address is involved. |
| 4 | How a Reel travels | Through the Instagram test's temporary address (`file_url`), with the same 100 MB cap for a test, and Facebook's 3 to 90 seconds. |
| 5 | Switching Facebook on | An owner step in «الإعدادات» «المنصات», once the Meta app holds the Page use case. |
| 6 | If Meta refuses one app for both | Stop and decide then. The likely answer is a second app type for Pages, a change to the integrations core. |

## Part A: prerequisites (the owner)

- **A1.** Finish the Meta app, then add the Page use case to it, following the Facebook guide in «المنصات». If the use case is
  greyed out, stop: that is decision 6.
- **A2.** Make sure the configuration includes Pages and `pages_manage_posts`, `pages_read_engagement` and `publish_video`.
- **A3.** Switch Facebook on in «الإعدادات» «المنصات».
- **A4.** Connect the department's Page in «حسابات المنصات», as someone with the `CREATE_CONTENT` task on it.
  - While the Meta app is in development mode, that person must have a role on the app.
  - If the Page requires Page Publishing Authorization, publishing waits until it is done.

## Part B: the database

One migration, `*platform_tests_facebook*`. It extends `platform_tests` again, so the list, the daily limit and the rights stay
one model.

- **Who:** `platform_test_may` accepts `facebook`, connected for real. The rule is unchanged: those who manage accounts, and the
  account's own publishers.
- **New kinds:** `fb_silent` (the silent check), `fb_text`, `fb_photo` and `fb_reel`.
  - A Facebook Reel has its own kind, because its seconds and its steps differ from Instagram's.
  - `size` and `mime` become empty for the two text kinds, which carry no file.
- **New columns:**
  - `link` (an optional address for a text post, `https` only).
  - `scheduled_for` (the silent check's date).
- **Changed column:** `post_url` also accepts `https://www.facebook.com/`.
- **`platform_test_start`** checks by platform:
  - **Facebook:** the kind; JPEG and 4 MB for a photo; MP4 or MOV and 100 MB for a Reel; the message's length.
  - **YouTube and Instagram:** unchanged.
- **Server-key steps:**
  - `platform_test_done` also records a silent check as checked and deleted in one step, so «آخر التجارب» says «فحص صامت · لم
    يظهر» and never offers a delete.
  - The temporary address (`platform_test_link`, `platform_test_fetch`) serves a Facebook Reel as it serves Instagram's.
- **Limits:** ten tests per account a day stays. For Reels, Meta's 30 a day is the platform's own, and its refusal is worded.

## Part C: the server

- **`src/lib/platforms/facebook.ts`**, each call taking its `fetch` and the token only in a header:
  - `fbFeedPost`: `message`, `link`, and `published` with `scheduled_publish_time` for the silent check.
  - `fbPostInfo`: the post's id, `is_published`, `scheduled_publish_time`, `permalink_url`, and the Page it is on.
  - `fbPhoto`: a multipart upload with `caption` and `alt_text_custom`.
  - `fbReelStart`, `fbReelUpload` (`file_url`), `fbReelStatus` and `fbReelFinish`.
  - `fbDelete`.
  - Meta's error codes become the site's short codes, sharing Instagram's words where they mean the same.
- **`src/lib/platforms/test-facebook.ts`**, with the steps the open page drives:
  - **Silent check:** in one request, schedule the post four weeks ahead, read it back (it must be unpublished, scheduled, and on
    this Page), delete it, and record it. If the delete fails, the post is recorded as published but not yet shown: the list
    offers «حذف» and says when it would appear.
  - **Text post:** one request; the link is read back from Meta.
  - **Photo post:** the browser sends the JPEG to `POST /api/platforms/test/[id]` with the step `photo`. The server reads at most
    4 MB (`readCapped`) and passes it to Meta as a file. Nothing is kept in Drive.
  - **Reel:**
    - `start`, then the temporary address and the upload with `file_url`, then the page asks (`advance`) until the video is ready.
    - Then `finish` with `PUBLISHED`, the link read back, and the address ended.
    - A device file goes first to «تجارب النشر», as Instagram's does.
  - **Delete:** `DELETE /{post-id}` for a post or a photo; the video's id for a Reel.
- **`robots.txt`:** the site has none, so nothing blocks Meta. If one is ever added, it must let `facebookexternalhit` reach
  `/api/platforms/test/file/`, and a test holds that.

## Part D: the panel

- **Shared parts.** With three panels, the parts all of them use move into the shared kit: the file chooser (library or device),
  the progress, «آخر التجارب» and the links. `facebook-test.tsx` sits beside the other two. YouTube's and Instagram's panels look
  the same after; their browser checks prove it.
- **Links:** «الصفحة على فيسبوك», and each post's own link.
- **Form:**
  - **النوع:** «فحص صامت» (the default), «منشور نصي», «منشور صورة» or «ريلز».
  - **«فحص صامت»** has no file and no choice. It says: «ينشئ منشوراً مجدولاً لا يظهر لأحد، ويقرؤه، ثم يحذفه فوراً». Its button
    needs no long press, because nothing becomes public.
  - **The text** for every kind except the silent check, and **الرابط** for a text post, optional.
  - **The file:** a picture for a photo post, redrawn to JPEG here; a video for a Reel, from the library or the device. Checked
    before sending: the size, and a Reel's 3 to 90 seconds.
  - **«نشر التجربة للعموم»:** a long press for every public kind: «يراه كل من يزور الصفحة فور نشره ويبقى حتى يُحذف».
- **Result:**
  - **A silent check:** «تم الفحص: أُنشئ المنشور وقُرئ وحُذف، ولم يظهر لأحد».
  - **A public test:** the post's link.
- **«آخر التجارب»:** kind, state, time and who, with «فتح» and «حذف» (long press) for what is public. A silent check shows its
  result, and offers «حذف» only if its delete failed.

## Part E: words and documents

- **`public/privacy.html`, in both languages:** the Facebook paragraph (what a test publishes and deletes, the silent check, the
  temporary address for a Reel).
- **The simulation line, help card Z01 and `Help_Content_Matrix.md`, and the page help:** they name YouTube and Instagram
  today, and must add Facebook.
- **The Facebook guide's notes:** what the test needs.
- **`MVP_draft.md`** section 73, an `AGENTS.md` paragraph, and `progress.md` and `Status.md`.

## Unknowns, and how each is settled

| Unknown | Settled by | If it fails |
|---|---|---|
| Whether the Page use case sits on the same Meta app as Instagram's | The owner, at A1 | Decision 6 |
| Whether a scheduled post can be read back and deleted at once with the Page token | The first silent check | Its result says which step failed, and leaves the post scheduled with a delete offered |
| Whether Meta fetches a Reel from the site within the function's 60 seconds | The first real Reel | As for Instagram: lower the cap, or raise `maxDuration` |
| Whether a Page's posts need Page Publishing Authorization | The first test | Meta's refusal is worded, and the guide's note says where to do it |

## Order of work

1. **Owner:** Part A, at least A1 to A4 for real use.
2. `facebook.ts` and its tests against a fake Graph API.
3. The migration, and its rules on a private container, with YouTube's and Instagram's rules run again.
4. The routes and their tests.
5. The shared kit, the Facebook panel, and its fixture check. YouTube's and Instagram's checks run again.
6. Words and documents.
7. Checks, then the owner approves the migration and the deployment (from a worktree on `origin/main`, as before).
8. **Owner:** a silent check first, then a text post, a photo, a Reel, and a delete.

## Checks

- **`tests/facebook-test.test.mjs`:**
  - the parameters of each call;
  - the silent check's three steps, and each one failing;
  - the photo sent as a file and at most 4 MB;
  - the Reel's steps;
  - the delete codes;
  - the limits equal to the SQL;
  - no token in an address or in the page; nothing logged.
- **`supabase/tests/platform_tests_facebook_rules.sql`:**
  - the rights and the kinds;
  - a text kind with no file;
  - a silent check recorded as checked and deleted;
  - a post on another Page not recorded;
  - YouTube's and Instagram's rows unchanged.
- **`qa/facebook-test-flow.cjs`** on a fixture with a fake Meta:
  - the silent check as the default, needing no long press, and its result;
  - a text post with a link, a photo sent as a file, a Reel waited on;
  - a delete;
  - a silent check whose delete fails;
  - who sees the panel; phone and evening.
  - `qa/youtube-test-flow.cjs` and `qa/instagram-test-flow.cjs` still pass.
- **Live, after deploying:**
  - the routes refuse signed-out callers;
  - nothing at `/robots.txt` blocks Meta's crawler from the file address;
  - no runtime errors.

## What this does not do

- No long video, no Stories, no carousel of photos.
- No posting as a person: a Page only.
- No scheduling of real posts: the silent check schedules only to delete.
- No second Meta app unless decision 6 needs it.
- Publishing works stays a simulation.

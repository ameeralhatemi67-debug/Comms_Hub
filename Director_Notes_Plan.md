# Director's notes: plan for approval (2026-11-05)

Status: approved by the owner on 2026-11-05, with the recommended answer to every question in section 5 (Q1 to Q5). Steps 1 to
3 of section 6 are built and on main, with their migrations applied to comms-hub. Step 4 is built on local main with its migration
not applied, except a scheduled Instagram post (Q3) and direct posts on the calendar. Step 5 is next. Nothing is pushed.

The director asked for four things:

1. **N-1. Calendar colours.** The director can change the calendar's colours, to follow progress more easily.
2. **N-2. Quick actions on «الرئيسية».** A new button opens a menu of quick actions. One of them is publishing: the director
   picks YouTube or Instagram (the other platforms show as coming soon), fills in the details, and publishes now or at a set time.
3. **N-3. YouTube's four choices.** Public («عام»), private («خاص»), unlisted («غير مدرج») and scheduled («مجدول») wherever YouTube
   publishing is offered: «تجربة النشر», the quick publish, and the publisher's step after approval.
4. **N-4. Thumbnails.** A file is never shown as text alone.

Section 5 lists the decisions the owner must make before building. Sections 1 to 4 describe each feature with the recommended answer
assumed.

---

## 1. N-1: Calendar colours

### What exists today

- Calendar entries come in eleven kinds: «مجدول»، «معتمد · لم يُجدول»، «مقترح · لم يُعتمد بعد»، «موعد مطلوب»، «معلّق حتى القرار»، «نُشر»،
  «تسليم»، «مرحلة»، «مهمة»، «حدث»، «تذكير». Each has one fixed colour class (`CAL_KIND` in `src/lib/work/planning.ts:115`,
  styles in `src/app/work.css:607-618`).
- A project's band takes one of four colours, worked out from its id (`toneOf`, `planning.ts:297`). Nobody chooses it.
- Warnings are drawn on top of the colour: late is a red outline, at risk an amber ring, near an amber underline, urgent a red edge.

### What the director gets

- A «الألوان» button on the calendar's bar opens a sheet, «ألوان التقويم».
- **«لوّن حسب»**: one choice of five.
  - «نوع الموعد». This is the default and gives today's colours.
  - «حالة العمل», so «قيد الإنتاج»، «قيد المراجعة»، «بحاجة إلى تعديل»، «جاهز للنشر»… each get a colour. This one is for following
    progress.
  - «المشروع».
  - «المنصة», by account.
  - «المسؤول», by person.
- Under the choice, each value has a row of **twelve colours**. Each colour is drawn for both light and dark mode with readable text.
  There is no free colour picker, because a free pick breaks contrast in one of the two modes. This follows the director's own rule
  for management screens: one kind of control, with defaults first.
- «إرجاع الافتراضي» works for one value or for all of them.
- The key under the calendar follows the chosen mode and its colours.
- **Warnings are never coloured over.** Late, at risk and urgent keep their marks on top of any chosen colour.
- **Where the colours apply:**
  - the calendar's month, week, day and agenda views;
  - the project bands;
  - the project page's calendar;
  - the "next days" list on Home, which uses the same `CAL_KIND` today.

### Where it lives

- **Rules** in `src/lib/work/calendar-colors.ts`: the palette, and which colour an entry takes. This is pure and tested.
- **Styles:** the twelve colours are classes (`pal-0` to `pal-11`) with light and dark values in `work.css`.
- **Data:** a person's choice is a small row in Postgres (`calendar_prefs`: mode, plus up to 200 value-to-colour pairs). Each person
  reads and writes only their own row, through `calendar_prefs_save`. It follows the person to the site, the desktop application and
  the phone, which a browser-only setting would not.
- **Checks:**
  - `tests/calendar-colors.test.mjs`: contrast of every pair in both modes, and that warnings win;
  - `supabase/tests/calendar_prefs_rules.sql`: only one's own row;
  - `qa/calendar-colors.cjs`: clicks through the sheet on a fixture.
- **Spec:** `MVP_draft.md` section 75 (74 is the mail and messaging window).

---

## 2. N-2: Quick actions and direct publishing

### The button

- «إجراءات سريعة» sits in Home's header beside «إنشاء عمل» and opens a short menu.
- An item shows only if the person may do it, and each item asks the same permission its own page asks.
- **First set:**
  - «نشر مباشر», new and described below;
  - «تذكير خاص», opening the existing reminder dialog;
  - «حدث في التقويم»;
  - «رفع ملف إلى المكتبة»;
  - «رسالة جديدة».
- More candidates are in section 7.

### «نشر مباشر»: what the director sees

1. **«أين؟»**
   - YouTube and Instagram are offered.
   - Every other platform in the registry (Facebook, TikTok, X, LinkedIn) shows «قريباً» and cannot be pressed.
   - Then the account: the connected accounts of that platform, preselected when there is only one. An account that needs
     reconnecting says so and links to «حسابات المنصات».
2. **The form, for YouTube:**
   - the file, from the library or from this device;
   - **العنوان**, up to 100 characters;
   - **الوصف**, up to 5000 bytes;
   - **«الظهور»**: «عام»، «غير مدرج»، «خاص»، «مجدول». «مجدول» opens a date and time in Riyadh time (section 3);
   - **«إشعار المشتركين»**, on by default for public and scheduled. YouTube does the same.
   - Category, tags and the audience setting are folded under «خيارات أخرى», with the channel's defaults.
3. **The form, for Instagram:**
   - the kind: «قصة»، «منشور صورة»، «ريلز»;
   - the file, the caption, and the alt text for a picture post;
   - **«الموعد»**: «الآن» or «مجدول» (see decision Q3: Instagram cannot schedule by itself).
4. **Confirmation.** One sentence says what will happen, for example «سيُنشر على قناة X للعموم الآن». Anything that becomes public
   asks for a long press: public, scheduled, and every Instagram post, since Instagram has no private post.
5. **Result.**
   - The link.
   - The visibility the platform actually applied, read back from the platform. If YouTube kept a public upload private, the result
     says so.
   - «حذف», with a long press.

### Rules

- **It is a real publish.** It is built on the engine of «تجربة النشر», which already works for real. It is a new exception to
  "publishing is a simulation", and it needs the owner's directive (this approval), recorded in `AGENTS.md`, `progress.md` and
  `MVP_draft.md` section 76. Publishing works stays a simulation.
- **It sits outside the work cycle**, so it has no stages and no approval. That is why it belongs to the top of the chain only:
  - a fixed capability, `publish.direct`, for the Admin and the director, like `motion.studio`;
  - no grant, template or request can give it (decision Q2).
- **Nothing is hidden:**
  - every direct post is in «سجل النشاط» (who, when, where, visibility);
  - it is in the account's list of posts;
  - it is on the calendar as its own kind, «نُشر مباشرة» / «مجدول مباشرة»;
  - the account's publishers and the assistant get a «للعلم» notice, so the team knows something went out on their channel.
- **The same rules as the tests:**
  - the page never holds a token or an upload address;
  - the server relays the file;
  - the database decides who may.
- **Limits are separate from the tests.** Tests keep their 10 a day and never notify subscribers. Direct posts have their own limit,
  under YouTube's quota of 100 uploads a day for each Google project.

### Where it lives

- `src/components/home-actions.tsx`, the menu.
- `src/components/work/direct-publish.tsx`, the sheet. It reuses the panels' pieces in `test-kit.ts`.
- The test engine is widened so that one table holds real platform posts, with a `purpose` of `test` or `direct`.
- A migration `*direct_publish*` adds:
  - the capability;
  - the purpose and the visibility values;
  - the scheduled time;
  - the notice;
  - the calendar entry.
- **Checks:** `supabase/tests/direct_publish_rules.sql` (only the director and the Admin; the capability cannot be granted),
  `tests/direct-publish.test.mjs` and `qa/direct-publish-flow.cjs` on fake platforms.

---

## 3. N-3: YouTube's four choices

### How YouTube defines them

From Google's YouTube Data API reference, read 2026-11-05:

- `privacyStatus` is `public`, `unlisted` or `private`.
- «مجدول» is not a fourth privacy value. It is `private` plus `publishAt`, and YouTube itself makes the video **public** at that time,
  even if nobody has the site open.
- `publishAt` can be set only on a video that was never published. A time in the past publishes at once.
- A scheduled video therefore always becomes public. YouTube has no "becomes unlisted at a time".
- So the four choices are one control of four, exactly as YouTube Studio shows them.
- The file is uploaded at the moment of scheduling, not at the scheduled time.

### Every place the four choices go

The director named the first three. Items 4 to 11 are the places he may have forgotten.

1. **«تجربة النشر» on a YouTube channel.**
   - Today it offers «خاص» and «عام» only. `MVP_draft.md` 71.2 says «غير مدرج» is not offered, and SQL test 09 enforces that.
   - Add «غير مدرج» and «مجدول». The spec changes by this directive, with a dated entry in `progress.md`.
   - The SQL check, `platform_test_start`, the route, `TestPrivacy` and the request body all widen. The test is flipped, not deleted.
   - Tests still never notify subscribers.
   - Public and scheduled ask for a long press. Unlisted says «يراه من معه الرابط فقط».
   - The list shows «مجدول · يصبح عاماً الخميس 9:00», and a scheduled test can be deleted before its time.
2. **«نشر مباشر»** (section 2).
3. **The publisher's step after approval** (works, simulated).
   - Today a work has accounts, one time and «تلقائي / بتأكيد», and no per-platform option at all.
   - «نشر الآن» gets, for each YouTube account of the work, «عام» (default), «غير مدرج» or «خاص».
   - «جدولة» is the fourth choice. Its YouTube row says «يصبح عاماً في الموعد», faithful to YouTube.
   - Stored as `works.pub_options` (by account) and in each account's result, so the record says how it went out.
   - `work_publish` and `work_schedule` take the options. The database checks them.
   - **Approval does not change.** Approval clears the content for the public, and a narrower choice (unlisted, private) is always
     allowed. Choosing one never sends the work back for approval. (If the owner wants the director to decide visibility before
     approval, it can instead be part of «الوجهة» in the review. Section 5, Q5.)
4. **The account's default.** In the channel's sheet on «حسابات المنصات», «الظهور الافتراضي»: «عام» unless changed. A channel used for
   internal review can default to «غير مدرج».
5. **The calendar.** A YouTube entry that is not public carries a small word: «غير مدرج» or «خاص».
6. **«الموافقات والنشر»**, publish tab. The same word on the row, beside the «تلقائي / بتأكيد» chip.
7. **The work page.** The publish panel's result says how it went out, and the link.
8. **Notices and push.** «نُشر على يوتيوب (غير مدرج)».
9. **«حزمة النشر»**, for accounts published by hand. It tells the publisher which choice to make in YouTube Studio.
10. **«التحليلات».** Counts split by visibility, since unlisted and private videos do not reach the public.
11. **Help guides** (`src/lib/help/pages.ts`) and the hold reasons (`src/lib/kit/hold-reasons.ts`) for the new controls.

### Not included

- **Instagram** has no private or unlisted post. It gets «الآن» and «مجدول» only.
- **Facebook**, when it comes, can schedule by itself (10 minutes to 30 days ahead, already used by the silent check), so «مجدول»
  will fit it without a timer.
- **The media library's older schedule dialog** (`src/components/media/dialogs.tsx` `Schedule`) uses a fixed mock list of channels
  with no YouTube. It is a known leftover. Recommendation: do not extend it, and retire it later in favour of the work's own publishing.

---

## 4. N-4: Thumbnails for every file

### What exists today

- The library's tile (`Thumb`, `src/components/media/parts.tsx:98`):
  - loads the **whole original** image;
  - shows a video with no poster;
  - gives audio and documents an icon on a gradient.
- The file route sends `no-store`, so every tile downloads the full original again on every visit. This is heavy on phones.
- About thirty other places show only an icon and the name. Among them:
  - the library picker used by «إنشاء», the work page, the tests, mail, messaging, writing and the studio;
  - the review screen's parts;
  - mail attachments;
  - messaging files;
  - the studio's library;
  - the tests' chosen file and «آخر التجارب».
- The tile inside a messaging or mail card asks the media route, which requires the media page. **A person without «مكتبة الوسائط»
  sees a broken tile there today.**
- Nothing asks Drive for its own thumbnails yet.

### The design

- **One small picture per file version:** WebP, 320 px on its long side, at most 40 KB (most are 12 to 20 KB).
- **Made in the browser at upload**, where the file is already opened to read its size and length (`probeMedia`,
  `src/lib/media/upload.ts`):
  - a picture is drawn smaller;
  - a video gives a frame at a tenth of its length, at most 3 seconds in;
  - the same applies to a new version, to a phone upload, and to pictures and videos in mail and messaging.
- **Documents and older files:** the first time a thumbnail is asked for and none exists, the server asks Drive for Drive's own
  thumbnail (Drive makes them for PDF, Word, PowerPoint, pictures and video) and keeps a copy. Nothing is scheduled: the first look
  makes it.
- **What has no picture** (audio, unknown kinds, a file on the second provider that Drive cannot see) gets a designed tile: the kind's
  icon and the file's extension, not an empty gradient.
- **Where it is kept:** in Postgres (`file_thumbs`: what it is for, version, bytes, size), like profile pictures (decision Q4).
  - A thumbnail can be made again, so it is not copied by backups. This follows the principle in
    `disscussios/storage_lifecycle_disaster_recovery.md` that derivatives are regenerated, not protected.
  - It goes with its file.
- **Who sees it:** exactly who may see the file. The database decides, so a thumbnail of a private mail or a room's file is as
  private as the file. Internal mail stays private from administrators.
- **Served** at `/api/thumb/<kind>/<id>?v=<version>`, cached for a year by the browser. The version is in the address, so a thumbnail
  never goes stale.
- **Videos get a poster** in the review player and on the asset page, so the frame shows at once.

### Where thumbnails appear

- The library's grid, list and board, and the versions list.
- The library picker everywhere.
- «إنشاء»'s chosen media.
- The work page's media panel.
- The review screen's parts, with documents shown as a picture, not a name.
- **The post preview**, which shows the real pictures in the platform mock-up instead of «2 فيديو».
- «حزمة النشر».
- Mail attachments, library cards and the composer's picker. Mail already has a 72×48 slot waiting.
- Messaging:
  - file messages;
  - the room's gallery, where library pictures are a film icon today;
  - pictures in the timeline, which show the thumbnail first and the full picture when opened.
- The studio's library and its project list. The database already returns a `thumb` for the project list that the page never uses.
- The tests' chosen file and «آخر التجارب».
- The upload tray, while uploading.

### Checks

- `tests/thumbs.test.mjs`: sizes, frame time, limits.
- `supabase/tests/thumbs_rules.sql`: who sees which thumbnail, including mail and messaging privacy.
- `qa/thumbs-flow.cjs`: tiles show pictures, and the library grid requests no full file.
- **Spec:** `MVP_draft.md` section 77.

---

## 5. Decisions for the owner

| # | Question | Recommended | Alternative |
|---|---|---|---|
| Q1 | Are calendar colours personal, or does the director set them for everyone? | Personal, kept in the database so they follow him on every device. A later «اجعلها ألوان الفريق» can share his set. | One set for the whole team, changed by the director. |
| Q2 | Who may «نشر مباشر», which skips the work cycle? | The director and the Admin only, fixed like «الاستوديو». | Also the assistant («مساعد مدير الاتصال المؤسسي»). |
| Q3 | Instagram cannot schedule by itself (Meta's API publishes at the moment it is called). What fires a scheduled Instagram post? | The loop of the WhatsApp bridge on the owner's always-on computer asks the site every few minutes, as it already does for push. If that computer is off, the post goes out at the next opening of the site, and the page says it was late. | Leave «مجدول» out for Instagram in the first version («الآن» only). YouTube's «مجدول» needs no timer either way. |
| Q4 | Where are thumbnails kept? | In the database: small, private by the same rules, about 75 MB for 5000 files. | As small files in Drive beside the originals. Each picture then costs a Drive request the first time. |
| Q5 | Does the YouTube choice need approval? | No. Approval clears content for the public, and unlisted or private is always allowed. | The person sending for review proposes it in «الوجهة», and the director approves it with the rest. |

---

## 6. Order of building

Each step ends with:

- `npm run typecheck`, `npm run build` and `npm test` passing;
- the SQL rules run on the private container;
- a QA script on a fixture, saved under `qa/`;
- an entry in `progress.md` with the numbers.

Each migration is written locally and applied to comms-hub only when the owner says "apply the migration". Nothing is pushed without
being asked.

1. **N-3 in «تجربة النشر».** This is the smallest step, and it proves «غير مدرج» and «مجدول» against YouTube for real.
2. **N-4 thumbnails.** Independent, and it benefits every page.
3. **N-1 calendar colours.** Independent.
4. **N-2 quick actions and «نشر مباشر».** Builds on step 1's engine.
5. **N-3 in the work cycle.** Changes `work_publish` and `work_schedule`, so it comes after the others are settled.

Step 3 shares no files with steps 1 and 2, so it can be built at the same time in its own session if the owner wants speed. The
other steps share files (the test panels, the work page, Home) and go one after another.

---

## 7. More ideas

1. **«إيقاف النشر المجدول».** An emergency quick action: one long press pauses every scheduled publish on every account, works and
   direct posts alike. A YouTube scheduled video is set back to private with no time. This is for sensitive moments such as mourning
   or a crisis, when nothing planned may go out. «استئناف» brings them back.
2. **One video to several platforms.** In «نشر مباشر», choose YouTube and an Instagram Reel together, from one file, with one copy
   per platform.
3. **YouTube extras under «خيارات أخرى»:**
   - a custom thumbnail (YouTube allows it for verified channels);
   - a playlist;
   - the category, which is fixed at «أشخاص ومدونات» today;
   - tags;
   - «موجّه للأطفال».
4. **Choosing the cover frame.** On a video in the library, pick the frame used as its thumbnail. This is item 5 of
   `Ideas_Backlog.md`.
5. **Calendar for following progress:**
   - «يحتاج قراري», a filter that shows only what waits for the director this week;
   - a small bar on each delivery showing stages done out of the total;
   - a strip above the month showing how loaded each day is.
6. **Sharing an unlisted video.** After an unlisted upload, «نسخ الرابط» and «إرسال في المراسلة». This is a quick way to show a video
   to someone before it goes public.
7. **First real numbers.** A day after a direct post, read its views and likes back from the platform into «التحليلات». These would be
   the first real figures there, since works are simulated.
8. **A short «تراجع».** After the final press of a real publish, wait 10 seconds with a cancel button before anything is sent, because
   a published post cannot be called back.
9. **Moving previews in the library.** Hovering over a video tile runs through eight small frames made at upload.

---

## 8. Facts checked, and sources

**YouTube**

Google's YouTube Data API reference, read through Context7 on 2026-11-05:

- `privacyStatus` is `public`, `unlisted` or `private`.
- `publishAt` works only on a private video that was never published, and a past time publishes at once.
- `notifySubscribers` defaults to true.
- `videos.insert` has its own quota of 100 calls a day for each project.

There is one conflict, about uploads from projects Google has not audited:

- The 2020 revision note says such uploads are locked to private.
- Today's reference says they are not.

The panel already reads back what YouTube applied, so the first public or unlisted test will settle it.

**Instagram**

Meta's content publishing documentation, read 2026-11-05:

- It has no scheduling parameter. It asks applications that offer scheduling to enforce the limit themselves.
- An account may publish at most 100 posts through applications in 24 hours.

Vendor pages disagree on whether scheduling exists. Meta's own pages show none.

**Google Drive**

Drive API, read 2026-11-05: `thumbnailLink` is short-lived (hours) and needs the token for a private file. The site's server must
fetch it and keep a copy, not hand the link to the page.

**Found while mapping**

These are not part of the request, but worth fixing in passing:

- The library grid downloads full originals on every visit (`no-store`).
- Library tiles inside mail and messaging fail for anyone without the media page.
- `src/components/drive-files.tsx` is unused, and its upload call no longer matches the route.
- The review screen shows the picture icon for every file, whatever its kind.
- `platforms.scheduling` exists in the registry but nothing reads it. It could decide which platforms offer «مجدول».

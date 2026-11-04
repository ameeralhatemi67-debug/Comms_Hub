---
type: status
project: "[[projects/ideas/Comms_Hub/Comms Hub|Communication Department Hub]]"
tags:
  - comms-hub
  - document/status
  - status/active
created: 2026-08-18
updated: 2026-11-03
status: active
parent: "[[projects/ideas/Comms_Hub/Comms Hub]]"
aliases:
  - Communication Hub Current Status
  - حالة مركز الاتصال المؤسسي
related:
  - "[[Roadmap|Product Roadmap]]"
  - "[[progress|Progress Log]]"
  - "[[MVP_draft|MVP Draft UI Shell]]"
  - "[[discussions_list|Master Discussions Index]]"
  - "[[validation/workflow-map|Department Workflow Map]]"
---

[[projects/ideas/Comms_Hub/Comms Hub|Comms Hub Overview]] | [[Roadmap|Product Roadmap]] | [[progress|Progress Log]] | [[MVP_draft|MVP Draft UI Shell]] | [[discussions_list|Master Discussions Index]]

---

# Communication Department Hub — Current Status

## Desktop Power, merge 3: the desktop application's D12 (0.8.0, bridge 9), 2026-11-04

- **Done.** Fork 3 (`power-desktop`), merged as `411007d`. The desktop application only; a browser keeps today's behaviour.
  - P-30 and P-08: light copies made in idle time. A copy pauses for a click, an export, playback, sound, battery or Windows' own speed limit, and a copy whose source FFmpeg has already read whole is stopped and made again.
  - P-29: library copies fetched two parts at a time.
  - P-26: taskbar progress and a jump list.
  - P-22: dragging a file out of the application.
  - P-20: «استيراد من بطاقة الكاميرا».
  - `cache.usage` gives the folder's label, never its path.
- **Evidence, re-run by the manager** at `afbde46` with `2903ecc`'s check (later commits change only `qa/` and `progress.md`):
  - desktop typecheck clean and 158 of 158; site 795 of 795;
  - packaged checks: `qa/desktop-native.cjs` 37 of 37, `desktop-taskbar` 13 of 13, `desktop-files` 16 of 16, `desktop-card-import` 11 of 11, `desktop-idle` 24 of 24;
  - on the merged tree: site typecheck clean, 802 of 802; desktop 158 of 158.
  - The fork's quiet-window run, not repeated: the stage's 95th-percentile frame time is 50.1 ms with copies held, against 49.9 ms with nothing to make.
- **Decided.** Copies pause while Windows lowers its own speed limit, so they never push the laptop into it. The limit fell 136 to 157 times in a few minutes whenever copies loaded every core. Copies at once stay 1, because widths 1, 2 and 3 took the same time.
- **Not verified.** The release package's install was not run (a real installation is on this laptop). A camera card was a fixture of the same shape, not a real card.
- **Next.**
  - Forks 1 and 2 connect their pages to the new helpers (taskbar progress, drag out, the idle copies).
  - Fork 2's D10 rerun, about 80 minutes. Its first run passed every row but two: the no-chip opening jump, and «تلقائية» on the RTX at 2.8% against 2%.
  - Fork 4's speed work: exports are still 6% slower on the AMD chip, and less than half speed with no chip.
  - Then Fork 1's D11 gate. Nothing pushed.

## Desktop Power, merge 2: the export with no graphics chip, and loudness ahead, 2026-11-04

- **Done.** Fork 1 (`power-export`) items 1 to 3 and P-15 (`786f30b`, merged as `dcb2d80`), every client:
  - **Rate:** an export whose encoder runs on the processor now aims at the chips' rate, 10.1 Mbit/s and 41.2 dB from source, where before it was 6 Mbit/s and 39.3 dB. Chip-encoded files are the same packets as before.
  - **Speed:** the BT.709 conversion now runs in workers, in WebAssembly lanes with a plain-code fallback, giving the same bytes as `yuv.ts`.
  - **Colour label:** every engine names the file `bt709`.
  - **P-15:** «توحيد مستوى الصوت» uses a loudness figure worked out ahead.
- **Evidence, re-run by the manager.**
  - Typecheck clean; `npm test` 790 of 790; build passes.
  - `qa/studio-export-yuv.cjs` 32 of 32. This covers Edge and the application, the site's real Content-Security-Policy, and that policy without `'wasm-unsafe-eval'` falling back to the same bytes.
  - `qa/studio-loudness-ahead.cjs` 8 of 8.
  - `qa/studio-crossdevice.cjs` 37 of 43 (35 before). All six failures are no-chip composed frames, up to 53 levels on scaled pictures, unchanged and for Fork 4. Its JSON from this run was not kept; the next run records it.
  - Timed by the fork in two quiet windows: 1.19 times the canvas path in the application, 1.14 in Edge, at 5 to 22% load (target 1.2). The first figure is close.
- **Decided.** P-07 (drawing in workers) stays off. In workers, frames differ by 1 level on the AMD chip and in blur and filters with no chip, so turning workers on would change frames on one machine. A floor that always draws in a worker, changing today's frames once, is left to the owner.
- **Next.** Fork 3's bridge 7 and 8 (light copies in idle time, parallel ranges, taskbar progress, drag out, the cache label), then Fork 2's D10 gate in a 65-minute quiet window. Nothing pushed.

## Desktop Power, merge 1: the desktop application on Electron 45, 2026-11-04

The owner's stage after D9: use a stronger computer's power without the video depending on it, run as four parallel forks
from `998ef0c` (export, preview, desktop, effects), verified and merged locally by a manager session. On 2026-11-03 the owner
accepted the recommended answers to Q1 to Q7 of `Desktop_Power_Ideas.md` section 10.

- **Done.** Fork 3 (`power-desktop`) item 1: Electron 44.5.1 to 45.0.0 (Chromium 156, Node 24), desktop 0.7.1, bridge
  unchanged at 6 (`e3cab67`, merged as `60335d7`).
- **Evidence, re-run by the manager** in a clean worktree at `e3cab67`: desktop typecheck clean and `npm test` 135 of 135;
  site `npm test` 783 of 783 (no site source changed); `qa/desktop-native.cjs` 37 of 37 and `qa/desktop-studio-parity.cjs
  --parity-only` 12 of 12 on a freshly built development package. The fork's own runs: `qa/desktop-shell.cjs` 68 of 68,
  desktop-csp 13 of 13, desktop-files 16 of 16, desktop-media 52 of 52, desktop-windows 13 of 13, the chip switches still
  AMD and RTX.
- **Not verified.** `qa/desktop-shell.cjs` skipped its install, run and uninstall: this laptop has a real installation,
  which the check never touches. The profile's key now carries Chromium 156, so «تلقائي» waits for a new measurement.
  Electron 45.0.0 was thirteen days and some hours old by UTC when installed.
- **Next.** Forks 1, 2 and 4 bring their branches up to date; Fork 1's BT.709 worker is at 1.58 times the canvas path
  (target 1.2). Nothing pushed.

## An export's colour is BT.709 on every computer, 2026-11-03

From the owner's "Yes, fix the colour" (`MVP_draft.md` 62.10, `progress.md`).

- **Done.** Where the encoder runs on the processor, the studio converts each frame to BT.709 itself (`yuv.ts`) and the file
  says BT.709; a graphics chip's encoder that reports another matrix makes the export start again that way.
- **Evidence.** `npm test` 783 of 783, typecheck and build clean; `qa/studio-export.cjs` 18 of 18 in Edge and 18 of 18 in the
  application with no graphics chip; `qa/studio-crossdevice.cjs` 35 of 43, the colour description now the same on every chip
  and with none.
- **Cost.** Processor-encoded exports only: about 46 ms a 1080p frame against 26 before. Chip-encoded exports are unchanged.
- **Still open.** The processor encoder's low bitrate (39.3 dB, under the check's 40); Edge's sRGB transfer label.
- **Next.** The owner's choice. Nothing pushed.

## «إخفاء بالمربعات» the same on every computer, 2026-11-03

From the owner's "Yes, fix the squares" (`MVP_draft.md` 62.8, `progress.md`).

- **Done.** Each square is the average colour of what it covers, worked out with whole numbers on the graphics chip (WebGL2,
  `squares-gl.ts`) or in plain code where there is no chip; both give the same bytes. D9's reference documents, which pushed
  some items off the timeline, were corrected.
- **Evidence.** `npm test` 778 of 778, typecheck and build clean, `qa/studio-engine.cjs` 41 of 41; `qa/studio-crossdevice.cjs`
  34 of 43: chip and plain code identical byte for byte, the RTX now within tolerance on all eight documents. Exports with
  squares run as fast as before (109 to 128 frames a second on this laptop).
- **Still open (found by D9, separate).** With no graphics chip an export is BT.601 and drawing differs a little; Edge and the
  application describe colour differently.
- **Next.** Done the same day: the no-chip colour (above). Nothing pushed.

## The desktop application, D9: measuring the device and choosing the graphics chip, built 2026-11-03

From the owner's "Build D9 first" after `Desktop_Power_Ideas.md` (`MVP_draft.md` 63.6, `progress.md`).

- **Done.** Version 0.7.0, bridge version 6: «بطاقة الرسوميات للاستوديو» (Chromium's switch, chosen before it starts),
  «قياس قدرة الجهاز» with the studio's own modules, the device profile kept by the application with its own key, the plan
  of `scale.ts` with today's behaviour as its floor, and the cross-device proof `qa/studio-crossdevice.cjs`. Nothing is
  drawn or exported differently.
- **Evidence.** Site `npm test` 774 of 774, desktop 135 of 135, typecheck and build clean; `qa/desktop-device-panel.cjs`
  10 of 10; `qa/desktop-native.cjs` 37 of 37; `qa/desktop-profile.cjs` 12 of 14 (the spread gate failed on a laptop at
  94-100% load from other work); `qa/studio-crossdevice.cjs` 29 of 39 (its failures are the findings below). The reference
  export ran at 39.8 frames a second on the AMD chip and 76.7 on the RTX.
- **Found by the proof (the studio as it was).** «إخفاء بالمربعات» depends on the graphics chip; with no graphics chip an export
  is written as BT.601 and loses quality; Edge and the application describe colour differently.
- **Not verified.** Nothing signed in; the laptop was busy with other work during the speed runs; no real weak laptop.
- **Next.** Done the same day: «إخفاء بالمربعات» made the same on every chip (above). Nothing pushed.

## «تجربة النشر» on a Facebook Page, built 2026-11-03, not live

From the owner's request after the Instagram test went live (`MVP_draft.md` section 73, `Facebook_Test_Plan.md`, `progress.md`).

- **Done.** A silent check (the default: scheduled, read back, deleted, never shown), a text post with a link, a photo sent as a
  file, and a Reel fetched by Meta, with the last five tests and delete. The three test panels share one kit.
- **Evidence.** `npm test` 755 of 755, typecheck and build clean, rules 48 of 48 (Instagram's 62, YouTube's 75) on a private
  container, `qa/facebook-test-flow.cjs` 37 of 37, Instagram's 43, YouTube's 49, `qa/platforms-flow.cjs` 136.
- **Not verified.** Anything against Meta: Facebook is off in the platform list and no Page is connected.
- **Next.** The owner approves applying `20261103200000_platform_tests_facebook.sql` and a deployment; then the Meta app with
  the Page use case, Facebook switched on, a Page connected, and a first silent check.

## «تجربة النشر» on Instagram, live 2026-11-03 (bf7388a)

From the owner's request after the Instagram guide went live (`MVP_draft.md` section 72, `Instagram_Test_Plan.md`, `progress.md`).
Live on production as `bf7388a`; migration `platform_tests_instagram` applied to comms-hub with the owner's approval.

- **Done.** A Story (the default), a picture post or a Reel, from the library or the device, with progress, cancel, the result
  and its link, Meta's daily quota, the last five tests and delete. Meta fetches the file from a short-lived address on the site.
- **Evidence.** In the deployed tree: `npm test` 741 of 741, build clean, rules 62 of 62 (YouTube's 75 of 75),
  `qa/instagram-test-flow.cjs` 43 of 43. Live: the temporary address and the routes refuse what they should, no runtime errors.
- **Not verified.** Anything against Meta: no Instagram account is connected yet.
- **Next.** The owner finishes the Meta app, adds `instagram_manage_contents` to its configuration, connects the department's
  Instagram account, then publishes one test Story.

## «تجربة النشر» on a YouTube account, live 2026-11-03

From the owner's request for a quick test in a connected YouTube channel's sheet (`MVP_draft.md` section 71, `progress.md`). Live on
production as `267e88f`; migration `platform_tests` applied to comms-hub with the owner's approval.

- **Done.** A real test video from the library or the device, private or public, with title and description; progress, cancel and
  resume; the result with its link; the last five tests with «مشاهدة» and «حذف»; links to the channel and Studio. A community post
  is copied and opened on YouTube, because YouTube's API cannot create one.
- **Evidence.** In the deployed tree: `npm test` 728 of 728, build clean, `qa/youtube-test-flow.cjs` 49 of 49. Live: the routes and
  the table refuse signed-out callers, the privacy page is the new one, no runtime errors.
- **Not verified.** A real upload to YouTube; signed in on the real site.
- **Next.** The owner runs one private test on Hedayh, reconnects the channel once so «حذف» works, and deletes the test.

## The look of a setup step, built 2026-11-03, not live

From the owner's note after the YouTube steps were called right (`MVP_draft.md` section 67.6, `progress.md`). Local only: not committed, not pushed.

- **Done.** The names in the «Clients» picture are blurred. The setup sheet has a strip of one segment per step with «أُنجز … وبقي …», one card per step with its button kept in view, a copy button on every value to type, pictures numbered and their rings explained, and the steps still to do dimmed.
- **Evidence.** `npm test` 723 of 723, typecheck clean. `qa/platforms-flow.cjs` 131 of 131 (was 121), `qa/guide-modal.cjs` 10 of 10. Build clean.
- **Not verified.** Signed in on the real site, and on a real phone.
- **Instagram guide, steps 1 to 4 and the start of 5.** Nine steps and twenty-two pictures from the owner's screenshots, from the portfolio to the three keys (`MVP_draft.md` section 67.7). `npm test` 735 of 735, `qa/guide-modal.cjs` 16 of 16.
- **Next.** Try the Instagram connection through the site with the real keys (nobody has yet), then rewrite Facebook's steps, which share the same Meta app. The owner has finished the walk through Meta's pages.

## The YouTube setup guide rewritten, live 2026-11-02

From the director's note that the steps were still hard to follow (`MVP_draft.md` section 67.5, `progress.md`). Live on production since 2026-11-02 as `8133276`; no migration, nothing in the database changed.

- **Done.** The Google guide of «المنصات» is 13 steps, one action to a step, in the order of Google's own wizard, with a numbered list of actions and nine pictures of Google's console: private text blurred, numbered rings, rounded corners, enlarged on a click. English inside Arabic is isolated in every guide, in the setup sheet and the circled "!". The saved progress and the connection are unchanged: on the stored data of comms-hub the platform still computes «متصلة».
- **Evidence.** `npm test` 717 of 717, typecheck and build clean. `qa/platforms-flow.cjs` 121 of 121 (was 74), `qa/guide-modal.cjs` 10 of 10. On production: READY, no runtime errors, the nine pictures byte-identical to the files.
- **Not verified.** Anything signed in on the real site, and the steps followed from nothing on a fresh Google project. The pictures are of another project's console (the names in them are examples).
- **Next.** The next person to set up a Google project follows the guide and says where they stopped.
- **Note.** Local `main` still holds the «إنشاء» commits whose migrations are not applied; this change was pushed from a clean worktree on `origin/main` so none of them went out.

## «إنشاء» as a permission and «إلغاء العمل», built 2026-11-02, not live

From the owner's request (`Create_Access_Plan.md`, `MVP_draft.md` section 70, `progress.md`). Committed locally, not pushed, and the two migrations are not applied to comms-hub.

- **Done.** The designer and the member start without «إنشاء», and the Admin or the Director gives it to a role or a person. The database refuses creating without it. A creator can cancel a work within the hour if nobody else touched it. The return button no longer gets stuck on a refused action.
- **Evidence.** `npm test` 716 of 716, typecheck and build clean. `qa/work-pages.cjs` 1077 of 1077, `qa/accounts-flow.cjs` 68 of 68. On a private container, `create_access_rules` 61 of 61 and `work_cancel_rules` 40 of 40.
- **Not verified.** Anything signed in on the real site, and the migrations on comms-hub.
- **Next.** With the owner's word: rehearse and apply both migrations, then push.

## A tester's note and its marks, live 2026-11-02

From the owner's request ahead of the test week (`MVP_draft.md` section 69, `progress.md`). Live on production since 2026-11-02 as `ed657c0`, with the migration applied to comms-hub as version `20261102080038`.

- **Done.** A click sets a pointer and a drag draws a box, up to three, above any open window. The note is reachable from inside a window and by Alt+Shift+N, and carries its severity and context. The inbox shows an outline of the screen with no words, filters, merging and a brief for whoever fixes it. «عولج» tells the author, and «ملاحظاتي» is on «الحساب». No picture, no file and nothing in Drive.
- **Evidence.** `npm test` 711 of 711, typecheck and build clean. `qa/feedback-flow.cjs` 83 of 83 on the real components and in every kind of window. On comms-hub, `feedback_marks_rules` 72 of 72 in a rolled-back transaction and `feedback_errors_rules` 32 of 32 after applying. On the live site, `qa/feedback-live.cjs` 8 of 8, `qa/site-live.cjs` 9 of 9, `qa/site-icon.cjs` 13 of 13, `qa/platform-gate.cjs` 11 of 11, `qa/writing-live.cjs` 16 of 16, no runtime errors.
- **Not verified.** Anything signed in on the real site. The first real note is the first real test of a mark on a real page and of the button inside the real mail, messaging and writing windows.
- **Next.** Send one real note from a real window at the start of the test week, and read it in «ملاحظات وأخطاء».

## «ورقة الكتابة» and the writing documents, live 2026-11-02

From the owner's approval of the artifact «كاتب المحتوى في المركز» and the storage idea (`Writing_Build_Plan.md`, `MVP_draft.md` section 68, `progress.md`). Live on production since 2026-11-02 as `08d0bf1`, with the migration applied to comms-hub as version `20261102020350`.

- **Done.** The sheet with its ribbon, keys and application shortcuts. Tables where a row, a column or a range is selected and only those cells take a fill, a line colour or a transparency. Documents in Drive, one master per version, with Word, PDF and text in «الحالي» and a version limit in «الإعدادات». A stage writer can write and is told. «الكتابة» and «المستندات» in «العمل», Home's tiles and «تابع الكتابة», comparison and notes in every review round, real «الأفكار», and Ctrl+/ search.
- **Not built, by decision.** Editing a Word file inside the site (W-10): a Word file opens in the sheet and loses fonts, sizes, colours and table borders, and the page says so.
- **Not verified.** Anything signed in on the real site, so the first real save, the first Drive folder and the first PDF happen with the first person who writes. Drive's PDF conversion of an Arabic file is unproven.

## «المنصات» and «حسابات المنصات» rebuilt, live 2026-11-02

From the owner's directive (`MVP_draft.md` section 67). Live on production since 2026-11-02, on `next` 16.4.3, with the migration applied to comms-hub as version `20261101211812`.

- **Done.** «المنصات» shows one chip per platform and «إضافة منصة» opens one menu. The steps sheet has its links, a bar and saved progress, and its sides follow the language. «حسابات المنصات» is rebuilt around one sign-in and a choice. The guides and the connection code follow the official pages as read on 2026-11-01, Meta's Unified Login included.
- **Evidence.** `npm test` 645 of 645, typecheck and build clean. `qa/platforms-flow.cjs` 74 of 74. `qa/permissions-pages.cjs` 1275, `qa/work-pages.cjs` 1021 and `qa/post-preview.cjs` 202, all passing. On comms-hub, `supabase/tests/platform_setup_rules.sql` 35 of 35 before and after applying. On the live site, `qa/site-live.cjs` 9 of 9, `qa/site-icon.cjs` 13 of 13, `qa/platform-gate.cjs` 11 of 11, `qa/platform-setup-live.cjs` 10 of 10, no runtime errors.
- **Not verified.** Anything signed in on the real site. The Meta Unified Login code has only met a stand-in, never a real application.
- **Owner to decide.** `npm audit` still lists three moderate findings in the mail libraries (`nodemailer`, `mailparser`, `ip-address`). `validation/recheck-R01.md` still holds another project's Firebase identifiers, uncommitted.
- **Next.** Walk both pages signed in, then enter the first real platform application, following the sheet. comms-hub has no Facebook yet: add it from «إضافة منصة» before linking Pages.

## The site's icon, «سجل النشاط» and «تقرير الشهر», 2026-11-01

From the owner's request (`MVP_draft.md` section 66). **Live on production** since 2026-11-01 as `91e2c9a`, for the Director to test. The migration is **applied** to comms-hub since 2026-11-01, as version `20261101184751`, with the owner's approval.

- **Done.** The logo in the browser's tab. «سجل النشاط» reads the work cycle too, with «الكل» and «نشاطي» behind the new permission «عرض سجل النشاط كاملاً». «تقرير الشهر» shows what each person did and who came first, and downloads as Excel or as PDF in two templates.
- **Evidence.** `npm test` 628 of 628, typecheck and build clean; database rules 38 of 38 on a private container, and on comms-hub both before and after applying; `qa/activity-exports.mjs` 21 of 21, with Excel itself opening the file; `qa/activity-flow.cjs` 39 of 39; `qa/site-icon.cjs` 6 of 6; `qa/accounts-flow.cjs` 63 of 63; `qa/permissions-pages.cjs` 1243 of 1243. The run on comms-hub is `qa/activity-report-rules-comms-hub.json`.
- **What the Director sees now.** After reloading the page, «تقرير الشهر» is the third tab of «سجل النشاط». It opens on the month before, and until the last days of a month that is October here, which is truly empty: real work was first logged on 2026-11-01. Choose November («حتى اليوم») to see a report with something in it.
- **Behaviour changed.** The assistant no longer sees the whole log unless given it. There is no assistant account today, so nobody lost anything yet.
- **Owner to confirm.** How productivity is counted (`MVP_draft.md` 66.3), and that the Admin and the director are left out of the ranking.
- **Not verified.** The page signed in on the real site, and the three downloads from real data. The report function itself ran on the real months as a throwaway director, sizes only.
- **Security.** `next` 16.3.8 has critical advisories, fixed in 16.4.3: proposed as a task of its own, and worth doing before the next push.

## «الحسابات» redesigned, 2026-11-01

From the Director's notes (`MVP_draft.md` section 65). Live on production since 2026-11-01; no migration. The earlier studio and calendar edits wait on the branch `claude/accounts-redesign` (`8bdb7b1`), not merged, at the owner's choice.

- **Done.** A role changes on the person's row and says what it gives and takes; every permission is one switch; «الأدوار» shows one role with a column per person, so two people of one role can differ; «إضافة عضو» starts from defaults, with «خيارات متقدمة» folded.
- **Evidence.** On `main`, without the studio edits: `npm test` 604 of 604, typecheck and build clean. `qa/permissions-pages.cjs` 1243 of 1243 (repaired: it had not run since A5) and `qa/accounts-flow.cjs` 63 of 63 (new, clicks through the real components on a fixture) ran with those edits in the tree, and neither reaches them.
- **Not verified.** The signed-in page on the real site, and the long press itself.
- **Owner to decide.** `validation/recheck-R01.md` holds another project's Firebase identifiers, pasted in and left uncommitted: remove them or move them out of this repository.
- **Next.** The Director walks the page signed in.

## The Android application, A8, 2026-10-28

The last phase of `Android_Build_Plan.md`, at the owner's request of 2026-10-28. Local commit on `main`; nothing pushed, applied or uploaded.

- **Done.**
  - Google Play's copy (`play`): an App Bundle (`npm run pack:play`), no permission to install, and updates through Play in the same update window (bridge 7). Evidence: `qa/android-play.cjs` 19 of 19, the bundle's manifest read with bundletool.
  - «طلب حذف حسابي» on «الحساب», «طلبات حذف الحساب» in «الحسابات», and the public page `/account-deletion.html`. Rules 42 of 42 in a rolled-back run (`qa/account-deletion-rules.json`); browser check 17 of 17.
  - `/privacy.html` rewritten for what the Hub handles today; `Play_Console_Drafts.md` for every Console form; the listing's icon and feature graphic (`mobile/play/`).
  - Found and fixed an A7 defect: files shared in or taken with «تصوير» were kept in the cache folder, which Android empties when a phone runs low on space, so a large video could vanish mid-upload. They now live in the application's own files.
  - Totals: `npm test` 601 of 601, `mobile` 22 of 22, JVM 39 of 39 on each channel, typecheck and build clean; every earlier emulator check passes again (shell 28, update 12, links 19, push 20, files 23, upload 11).
- **Applied, with the owner's approval:** the account deletion migration, to comms-hub as `20261028122912`; rules 42 of 42 again after applying, and the advisors show only the three functions meant for signed-in people.
- **Owner steps waiting**, in the order of `Play_Console_Drafts.md` section 1: push; the reviewer's account; the release key, its fingerprint in `assetlinks.json`, and the Firebase file; `npm run pack:play`; Play App Signing with the same key at the first upload; internal testing, then the closed test (12 testers, 14 days); the screenshots and the foreground-service video, signed in.
- **Not verified.** Play's real update (the check used Play's own stand-in); anything signed in; a real phone.
- **Next.** The owner's steps above. The Android build plan has no further phase.

## The Android application, A6 and A7, 2026-10-28

Built through A7 at the owner's request of 2026-10-27; local commits on `main`, nothing pushed.

- **Done.**
  - A6: links of the site open in the application (verified through `assetlinks.json`), and the application lock (off by default, fingerprint or screen lock, after five minutes away). Evidence: `qa/android-links.cjs` 19 of 19.
  - A7: «تصوير» in the library, sharing files in («استلام ملفات», `/share`) to a library folder, a work or a conversation, and library uploads that go on in the background. Evidence: `qa/android-upload.cjs` 11 of 11.
  - All earlier emulator checks pass on the A7 build. Totals: `npm test` 589 of 589, `mobile` 20 of 20, JVM 35 of 35, typecheck and build clean.
- **Owner steps waiting.**
  - Make the release key.
  - Put its certificate's SHA-256 in `public/.well-known/assetlinks.json`; a signed release refuses until then.
  - Add `/app/return` to Supabase's redirect addresses.
  - The Firebase project, as before.
  - Push to deploy the site parts.
- **Not verified.** Nothing signed in, no real phone, no real Drive upload or share from another application, no 2 GB file (the emulator has about 600 MB free).
- **Next.** A8: the `play` build (an AAB with Play's own updates), «طلب حذف حسابي», the privacy policy, and Play's declarations (the data-sync foreground task, notices). Then the closed test.

## The Android application, A4 and A5, 2026-10-27

The owner's Google Play developer account is verified (2026-10-27). The owner asked to build through A5 now, and approved applying the push migration once its rules passed.

- **Done.**
  - A4: «فتح الملف», «حفظ في الهاتف» and «مشاركة» for library files, mail attachments and files in «المراسلة» (`MVP_draft.md` 64.2). Evidence: `qa/android-files.cjs` 23 of 23.
  - Found and fixed in A4: Capacitor's cookie and HTTP interfaces reached every frame of every address, and its cookie handler added the web view's cookies to the application's own connections (`Shell.narrow`).
  - A5 server: «أجهزتي», «إعدادات التنبيهات», the push outbox and the Firebase sender. The migration is applied to comms-hub (`20261027184903 push`). Evidence: `push_rules.sql` 128 of 128 after applying, `qa/push-flush.cjs` 35 of 35 against a local Firebase stand-in.
  - A5 app: the notices permission after the site says why, three channels, data messages shown by the application, taps opening only the site's pages from the application's own notices. Evidence: `qa/android-push.cjs` 20 of 20.
  - Integration: every «تسجيل الخروج» signs out this device only; signing out of other devices also removes the other phones from «أجهزتي».
  - Totals: `npm test` 583 of 583, `mobile` 15 of 15, JVM 25 of 25, typecheck and build clean; `qa/android-shell.cjs` 28 of 28, `qa/android-update.cjs` 12 of 12.
- **Not done.**
  - Nothing is pushed: the live site is still the build of 2026-10-22. The `android-releases` bucket is not applied, and there is no release key.
  - No real phone or signed-in walkthrough, and no real push delivery: there is no Firebase project yet.
- **Owner steps waiting.**
  - Make the release keystore (`mobile/README.md`, "The release key").
  - Create the Firebase project with `sa.commshub.app`, keep `google-services.json` outside the repository, and name it with `COMMSHUB_GOOGLE_SERVICES` when building. Paste the service account in «الإعدادات» «الاتصالات» «تنبيهات الهاتف (Firebase)».
  - Push to deploy the site parts.
- **Next.** The Play minimum of A8 (the `play` AAB, «طلب حذف حسابي», the privacy policy) so the 14-day closed test can start; then A6 (links and the lock) and A7.

## The Android application, 2026-10-26

The owner chose a sideloaded APK as the pre-launch Android download while the Google Play account is verified, and approved `Android_Build_Plan.md` (id `sa.commshub.app`, without the studio; `MVP_draft.md` section 64).

- **Done.**
  - A0: decisions recorded, plan and specification written.
  - A1: the native contract for Android, platform-aware panels, and the sign-in links inside an application (which also fixes the desktop's). Evidence: `npm test` 546 of 546, `qa/android-site.cjs` 12 of 12.
  - A2: the Capacitor shell in `mobile/`, its gate passed on the emulator. Evidence: `qa/android-shell.cjs` 28 of 28, JVM tests 15 of 15, `mobile` tests 11 of 11.
  - A3: «تطبيق الهاتف» on «الحساب», the update window, and the application's own checked updates. Evidence: `qa/android-update.cjs` 12 of 12, `npm test` 550 of 550.
- **Found.** Google Play Protect proposes to scan the application on the first installation and on every update until Google knows it (developer verification or Play). The texts say to choose the scan.
- **Next.** A4 to A8, as `Android_Handoff.md` sets out: A4 (files) and A5's server half can run side by side.
- **Owner steps waiting.**
  - Make the release keystore, using the command in `mobile/README.md` (written in A2).
  - Create a Firebase project for A5.
  - Push to deploy the site parts when a release is due.

## The desktop application merged into main, 2026-10-26

The owner asked for the merge before the Android application is planned. `desktop-app` (D0 to D6, version 0.6.0) is now part of `main` as a local merge commit.

- **Evidence.** Typecheck and build clean; `npm test` 537 of 537; desktop tests 120 of 120; `qa/sim03-quick-fixes.cjs` 17 of 17; `qa/desktop-csp.cjs` 13 of 13.
- **Not done.**
  - Not pushed. A push deploys the desktop's site part, including a Content-Security-Policy on every page.
  - The `desktop-releases` migration was applied on 2026-11-02 (bucket exists, public, 300 MB). No release is uploaded yet, and the application is unsigned. The account card now says "Windows only for now"; that and `npm run release:check` are written but not committed or pushed.
  - The owner's signed-in walkthrough is still to do.
- **Left as it was.** Main's uncommitted studio, calendar and simulation files are untouched and still uncommitted.
- **Next.** The Android application plan (no studio features), at the owner's request.

## HyperFrames research for the studio, 2026-10-25

At the owner's request, HeyGen HyperFrames (an open-source HTML-to-video framework) was researched for what «الاستوديو» can learn from it, across the web, desktop and phone releases. The result is `HyperFrames_Studio_Learnings.md`: 23 learnings (H-01 to H-23), a table by client, what not to take, a suggested order and seven owner decisions (O-H1 to O-H7).

- **Nothing is built.** `MVP_draft.md` section 62 is unchanged until the owner picks items.
- **Next action.** The owner's answers to O-H1 to O-H7; the proposal is rounds 1 and 2 of its section 8, starting with written determinism rules and parity tests (H-04) and «فحص المشروع» (H-01).
- **Committed locally** as a documents-only commit; the earlier uncommitted studio, calendar and simulation files were left as they were.

## Fixes from the role simulation, 2026-10-22

The archive of role simulation sim-20261015-03 (`D:/Agents/testingh/sim-20261015-03`) was reviewed against the current code. The quick fixes are in; details and numbers in `progress.md`, 2026-10-22.

- **Fixed.** Linked mail on the work page (a query that always failed), the project kept when creating from a project, the help window kept off the guide bar, the Admin top bar and the platform headings on phones, the create bar above the phone's bottom bar, the video length off the stage chip, Arabic counts, the no-accounts wording, and no decision offered on a library version you uploaded.
- **Evidence.** `npm test` 505 of 505; typecheck and build clean; `qa/sim03-quick-fixes.cjs` 17 of 17.
- **Open.** APPROVAL-001: library approval is not bound to the version shown (a stale dialog, or a board drag to «جاهز للنشر», approves whatever is current). REQ-001: work lists refresh only on opening or on returning to the tab. Neither is fixed. Nothing was seen signed in.
- **Not committed.** The changes are in the working tree beside the earlier uncommitted studio and calendar files.

## The desktop application, D0 to D6, 2026-10-21

The Windows x64 application «مركز الاتصال المؤسسي» of `Desktop_App_Plan.md` is built on branch `desktop-app` (local commits, not merged, not pushed). D1 is the shell that opens the live site; D2, asked for by the owner on 2026-10-20 while the studio's third round is still open, adds the studio at full strength (exports minimised, the laptop kept awake), the tray, native notices with the taskbar count, and «معلومات الجهاز»; D3 adds updates from a public bucket and «تطبيق سطح المكتب» on «الحساب»; D4 uses files from «هذا الجهاز» where they are, keeps the studio's cache in a folder with a limit, adds «مسح بيانات هذا الجهاز», and gives every page of the site a Content-Security-Policy; D5 adds FFmpeg (LGPL v3, pinned by hash) for light copies that the preview reads and editable copies of what the browser cannot decode; D6 opens the studio's preview in a window of its own, full screen on another screen, kept in step with the editor (`MVP_draft.md` 63 to 63.5). The bucket's migration is written and not applied, and no release is published: both wait for the owner (`desktop/README.md`). Signing waits for a certificate. Evidence is in `progress.md` and `qa/desktop-*.json`. Next: the owner's signed-in walkthrough on the two pilot laptops; the merge after the studio's third round.

## The studio, second round, 2026-10-20

The owner's notes on the first version are built (`Studio_Build_Plan.md` section 9, `MVP_draft.md` 62.1 to 62.5).

- **Windows.** Every part of an editor is a window: merged into tabs, split beside another, floated, resized and closed. A closed window is reopened from «النوافذ». There are ready-made workspaces (five for video, three for photo), the arrangement is remembered on the device, and the editor can fill the browser window.
- **Menus and keys.** A menu bar («ملف», «تحرير», «المقطع», «عرض», «النوافذ», «مساعدة»), tools V, C, H and T, shortcuts matched by key position (so they work with an Arabic layout) and a shortcuts sheet.
- **Look.** A dark editor chrome by default, light on request.
- **Effects.** Sixteen transitions and seventeen entry and exit movements, with moving thumbnails, drawn alike in the preview and the export.
- **Preview.** Separate playing and paused resolution, from full down to 1/32.
- **Fonts.** Twelve Arabic and ten English fonts, served by the site.
- **Handling.** Handles to scale and turn, drag and drop from every window, a clip menu, copy and paste, the razor, wheel zoom, a snap line and a history window.
- **Evidence.** `npm test` 435 of 435; fixtures: interface 70 of 70, engine 34 of 34, export 11 of 11, help tours 32 of 32; typecheck and build clean.
- **Deployed.** Pushed on the owner's request (`294b8cc`) and serving in production (deployment `dpl_7vPfQGLbnHSTAVDJm5XWZ492bbu6`).
- **Not verified.** Nothing was seen signed in, and the walkthrough of `Studio_Build_Plan.md` section 8 is still the owner's to do.

## The studio, 2026-10-19

«الاستوديو» is built as a new tab of «استوديو الحركة» (`/motion/studio`), by owner directive of 2026-10-19. The build followed `Studio_Build_Plan.md` (the audit of `Studio_Feasibility_and_App_Path.md`, in nine phases) and is specified in `MVP_draft.md` section 62, restored the same day with sections 12 to 61. The template tab at `/motion` is unchanged for every role, and its 26 motion templates and the brand marks are usable inside the studio.

- **Access.** The studio opens only through the fixed capability `motion.studio`, held by the Admin and the director together with the page of «استوديو الحركة». No grant can give it. The server checks it for the whole address, and so does the database (rules 21 of 21).
- **Projects.** Stored in Postgres and shared between the two holders. Each project has an autosave plus numbered revisions, one editor at a time under a lease, and a draft on the device (rules 51 of 51).
- **Editors.**
  - Video on a timeline (3 video, 2 graphics, 2 text and 3 audio tracks) and photo with layers.
  - One Canvas compositor draws both preview and export, with Mediabunny 1.61.2 for decoding and encoding.
  - Exports are MP4 (or WebM) and stills, to the device or to the library as a new file or version.
  - A project can join a work and shows the timed review notes on its exported file (rules 13 of 13).
- **Phones.** Below 760 px wide the editor shows one panel at a time. Tools kept for the computer are named in place, and nothing is removed from a project.
- **Help.** Two guide pages (`studio`, `studio-edit`) have cards for each exact role. Their blocks in `Help_Content_Matrix.md` (sections 24 and 25) are drafts for the owner's review.
- **Evidence.** Fixture checks: interface 45 of 45, engine 25 of 25, export 11 of 11. Per-phase numbers, and the final `npm test` total, are in `progress.md`. Pushed to `main` on the owner's request (`fe38143..8258a13`) and deployed to production by Vercel (deployment `dpl_9q76oSSue99XXc5SCeUD6MZX9PNC`).
- **Not verified.** Nothing was seen signed in. Real phones, Safari and a long Drive video were not tried.
- **Next action for the studio.** The owner's signed-in walkthrough in `Studio_Build_Plan.md` section 8, on the live site, and the review of the two drafted help blocks.

## Transparent motion video, 2026-10-18

The «فيديو شفاف» download of the Motion Studio is now ProRes 4444 with real alpha (it was PNG frames in a MOV, which Windows players and most editors could not open). Decoded and checked with ffmpeg for the reported `rp-editorial` export (1080p, 30 fps, 246 frames, 54 MB); not yet opened in an editor. It works in CapCut (owner-tested); normal players and phone galleries do not open it, and the studio says so next to the format. Details in `progress.md`.

## Local simulation retained after cleanup, 2026-10-16

By the owner's instruction, run `sim-20261015-03` has been shut down and its duplicate package, relocated worktree, ten Docker containers, two exclusive volumes and one network removed. The local inspection site at port 3386 is no longer running. The complete evidence viewer remains at `D:/Agents/testingh/sim-20261015-03/archive/index.html`; its screenshots, films and reports remain available without the site. The run ended with 100 PASS, five FAIL and one NOT_APPLICABLE; the high media approval race is still unresolved.

The test branch `codex/role-simulation-sim-20261015-03` remains at `fea9f61`. A standalone Git bundle, committed-source ZIP, uncommitted patches, six untracked files and nineteen final receipts are saved in `D:/Agents/testingh/sim-20261015-03/recovery`. Database dumps, private local configuration and files, recovery keys and mail data are retained separately from the evidence archive. A fresh dump's catalog was read successfully; a database restore has not been tested. Other Docker projects, earlier simulation runs and application source in main were preserved. The next action for the simulation is to review the archived findings and choose fixes for main; none was merged or pushed during cleanup. Exact verification and disk measurements are in `recovery/cleanup-result.json`.

## Page health check and consolidation, step B1, 2026-10-15

The seven supporting pages were audited (what each does, who sees it) and `Action_Plan.md` now carries what is left: Part B consolidates the pages, Part C the owner-gated audit steps, Part D the agent computer and NAS. Step B1 is built: «الإدارة» is dissolved (`/admin` opens «الحسابات»), «الحساب» is opened from the name badge at the foot of the sidebar, «الحسابات المرتبطة» is «حسابات المنصات», «التحليلات» is out of the menu until it is real. The menu is 17 entries, was 20. `npm test` 275 of 275, typecheck and build clean, fixture check of the sidebar 18 of 18. Not seen signed in.

- **Step B2, built the same day:** «المراقبة» is merged into «سجل النشاط»: a team panel (each member, role, last action, the week's actions, open and late tasks) for those who see the whole log; `/monitoring` opens the log and the old grant still opens it; the menu is 16 entries. `npm test` 279 of 279, panel fixture check 16 of 16, build clean. Not seen signed in.
- **Step B3, built the same day:** «الإعدادات» is the system page with its six real tabs only; the appearance choices (design, mode) moved to «الحساب»; the six display-only tabs (organisation, language, notifications, publishing and approval defaults, AI) were removed because they saved nothing. B1 and B2 were pushed to `main` (`cb02b71`) before B3; B3 is a local commit. `npm test` 281 of 281, fixture check 10 of 10, build clean. Not seen signed in.
- **Step B4, built the same day:** the menu list and its rule are one place (`menuEntries`, `menuFor`); the per-role table is generated (`qa/access-matrix.mjs`, `qa/access-matrix.json`), written in `MVP_draft.md` "Access by role" and held by 8 tests. `npm test` 289 of 289, build clean. B3 was pushed (`ca3a0b5`); B4 is a local commit.
- **B4b, decided and built:** «الإعدادات» is the administrator's by default (others by the page grant or `settings.view` or `settings.manage`; existing accounts unchanged); the member holds `page.create` as the interface already offered it (migration `member_creates`, applied to `comms-hub`, 7 of 7 database checks). `npm test` 291 of 291. B4 and B4b pushed to `main`.
- **Steps B6 and B7, built later the same day:** the page grant «المراقبة» is folded away (migration `fold_monitoring`, applied to `comms-hub`; accounts, grants and requests converted, none existed); the unused sample constants and `DriveIntegration` are deleted; documents carry the new names where they describe the present (history is left as written); the help of «الإعدادات» (role lines rewritten), «الحسابات» and «حسابات المنصات» says what changed once. `npm test` 291 of 291, build clean, `qa/help-tours.cjs` 25 of 25 (it had gone stale at the S3 and B3 version bumps and now reads the version from the registry).
- **B5 and B8, built next:** «التحليلات» reads the database (flow of work, review, platforms) and is back in the menu; the legacy sample model is retired (`domain.ts` 1,600 to 196 lines; messaging links and the global search read real works; the page header shows the real day). `npm test` 287 of 287, build clean.
- **Step B9, built the same day (owner decision): the Director connects everything from the site.** Director holds the platform, secrets, settings, storage and WhatsApp-system rights by default; YouTube, LinkedIn and X connect on the Meta and TikTok model; the shared mailbox and the Google app (Drive and YouTube) are entered in «الإعدادات» ثم «الاتصالات», the WhatsApp bridge key is made in «واتساب النظام»; eleven guides with links. `npm test` 306 of 306, database runs 40 of 40 and 15 of 15, fixture check 39 of 39, build clean. Nothing met a real platform; publishing is still a simulation. Also corrected: the B4 access table (the director and the assistant do open «الحسابات»).
- **Next action:** `Owner_Handoff.md`, written 2026-10-15 (section 1.0 is the Director's list): the signed-in walkthrough first (a table of what to do and what should happen, per page changed in B1 to B8), then the outside items in the order that costs least (Supabase SMTP, a second storage provider and a first move, the Meta and TikTok apps, entering the Microsoft app and connecting OneDrive from the site (built, section 1.4), the agent computer and NAS). Each says what the agent does with the answer.
- **Step B10, built the same day: OneDrive (S8) as a storage provider.** The Director enters the Microsoft app in «الاتصالات» (with a «!» guide and links), connects an account through Microsoft's own sign-in, the refresh token lives in the vault and is replaced when Microsoft rotates it; the move engine proves a copy by quickXorHash. Tried only against a fake Graph: the first real move is the real test.
- **Section 5 of `Action_Plan.md`, worked on the same day (owner: "work on these"):** C4 (the database refuses a copy over its platform's limits at schedule, publish and the due run), a reminder before an app secret expires (the Director states the date; a notification once a week from 30 days before), the Drive token adopt button on the Drive card, and a feedback channel with error monitoring (note button in the top bar, errors caught by the page, inbox «ملاحظات وأخطاء»). Not built: platform adapters (each needs an approved app and a real account), and three that need the owner's decision: delegation while away, email notifications, and data handling when a person leaves.
- **Correction to earlier lists:** step 8 of the audit order (help upgrade), S4 (backups) and S8 (OneDrive, untried) are built; open is step 9 (hardware).

## Film deliverable completed 2026-10-14

The owner requested a Comms Hub version of the supplied Arabic motion-video reference. The standalone package is in `videos/comms-hub-launch/`: a 38.4-second portrait film, a separately composed landscape film, and a 15-second portrait teaser, all at 60 fps, with original synthesized music, Arabic captions, poster frames, editable artwork, a local preview, and render scripts. It uses the existing forest-green and gold brand and preserves the established Arabic terms. Illustrative scenes explain work, version-bound approval, the media library, mail and messaging, planning, and permissions; no live publishing or AI capability is claimed.

Verification: typecheck and production build passed; all 153 existing tests passed. Film browser and media verification passed 128 checks, including deterministic seeking, both layouts, transitions, play/pause, fonts, audio, mobile overflow, reduced-motion initial state, and full decode of all three exports. Video is Rec.709 limited-range H.264 with 48 kHz stereo AAC. Two encoded-frame color comparisons passed. Re-run `node qa/comms-hub-film.cjs`; full evidence is beside the film under `qa/`. The application interface and the paused Permissions P4 work were not changed. Next action for this deliverable: review the film and copy; the application next actions below still apply.


## Backups, 2026-10-15 (Step S4)

«الإعدادات» has a tab «النسخ الاحتياطي»: a provider that holds backups (never the library's own), files copied there incrementally by the move engine's backup mode and verified by checksum, the records and the settings exported as one file kept at the provider and read back, policy (manual, a warning age, how many exports to keep), the age and state of the last good backup of each kind with a stale warning, a sample re-read to call a backup verified, a long-press restore of a file whose original is gone, and runbooks. Database rule run 61 of 61, engine regression 15 of 15, `npm test` 271 of 271, fixture check 1183 of 1183, signed-out gate 27 of 27.

- **Waiting on the owner:** a second storage provider (`Storage_Provider_Setup.md`), then in the tab: choose it, «انسخ الملفات الجديدة», «صدّر ونزّل» for each kind and «تحقق من النسخة». Nothing has met a real provider.
- **Known limits:** manual only; no database restore from the site; an export is built in memory (refused above 300,000 rows).
- **Next action:** OneDrive (S8), or role-aware tours for the remaining pages, or the agent-computer items (S7) when it arrives.

## Help upgrade, 2026-10-15 (step 8 of the audit order)

The guide now says what a page means for the person's role and adds the role's own steps, closes an empty or partly drawn page with a card instead of going silent, shows only what was added to a page the person already knows (once), speaks of touching on a phone and has the page guide as a button, and every route has a guide (six were missing). `npm test` 263 of 263, the engine driven in a browser 25 of 25, fixture check 1102 of 1102.

- **Waiting on the owner:** the signed-in walkthroughs, which now also include the tours.
- **Next action:** S4 (backups on the move engine in copy mode) or OneDrive (S8); a role-aware tour for the remaining pages.

## Setup guides in the site, 2026-10-15

Where a platform or a storage provider needs outside steps, a circled "!" beside it opens them in order, written in the site: Meta app, TikTok app, how a publisher connects an account, the manual path (Snapchat, WhatsApp channel and status), each storage kind, and a first move. Steps 1 to 7 of the audit order are built and pushed; 6 and 7 are verified only against fakes.

## Second storage provider and the move engine, 2026-10-15 (Step S3, step 7 of the audit order)

An S3-compatible store (Supabase Storage's S3 endpoint, Backblaze B2, Cloudflare R2, MinIO, Amazon) can be added from «الإعدادات» «التخزين», its key pair checked by a real write, read and delete and kept in the vault, and files can be moved to it and back: a dry-run plan, a copy in resumable parts driven by the open page, verification by checksum (an approved version only by checksum), the switch, the source held as a replica for the period the plan states, a report, and a separate long-press action that sends the held sources to their provider's trash. The library, mail, messaging and review-link routes keep serving through the file's own reference from wherever the live copy is. Database rule run 95 of 95, `npm test` 252 of 252, fixture browser check 1023 of 1023, signed-out check 21 of 21, typecheck and build clean.

- **Not tried against a real second provider:** no S3 key pair exists yet. The client is tested against a fake service that checks every request's signature (and the signing against AWS's published example); nothing has met Supabase Storage, B2 or R2. The signed-in screens were drawn from fixtures. Steps for the owner and the first small move are in `Storage_Provider_Setup.md`.
- **Known limits, stated in the interface:** new uploads still go to Google Drive and are moved by a new plan; a run executes only while the page is open (no worker); a file over about 80 GB is skipped for an S3 target; the store's "trash" is a copy under `_trash/` then a delete of the original.
- **Next action:** the owner creates the bucket and key pair and walks a first small move (`Storage_Provider_Setup.md`). Agent: S4 (backups on the same engine in copy mode), then OneDrive (S8), then the help upgrade.

## Post preview and real platform connections, 2026-10-15 (steps 5 and 6 of the audit order)

Every platform copy is now drawn the way its platform lays it out and counted against that platform's limits (data in the registry, each with its source and the day it was read), on the work page, in the review screen, while writing, and at the send step, where an over-limit copy stops the scheduling and publish-now dialogs; platforms that are published by hand show the exact text and files as a pack. Facebook, Instagram (one Meta app) and TikTok accounts can now be connected through the platform's own sign-in: the token goes to Vault, the authorisation becomes its real expiry, a health check records state and renews TikTok's token, a broken connection fails publishing honestly and tells the publishers once, and disconnect and delete destroy the token. Snapchat and the WhatsApp channel and status are manual tasks. Publishing itself is still a simulation. Database rule runs 28 of 28 and 65 of 65, `npm test` 234 of 234, browser checks 160 of 160 and 1012 of 1012, typecheck and build clean.

- **Waiting on the owner:** `Platform_Connections_Setup.md`: whether a verified Meta Business account exists (E-7), the Meta and TikTok apps with the two redirect addresses, entering their ids and secrets in «المنصات», then the first real connection and the signed-in walkthrough. Nothing has been tried against a real platform.
- **Known gap:** an over-limit copy is stopped by the interface at the send step, not by the database (see `progress.md`); the adapter's validate step will carry it.
- **Next action:** step 7 of the audit order, the move engine with a second provider (S3), then OneDrive (S8); then the help upgrade, which now also owes the new screens.

## Entry flow and honest labels, 2026-10-14

Steps 1 and 2 of the order in `Readiness_Audit.md` are built and verified except for the signed-in screens. An administrator can now send a real invitation, see how far each person got, resend the confirmation, send a reset link; access requests notify the leaders (in the site and by email) and tell a refused applicant; the sign-in screen has an expired-link state and stops revealing which addresses have accounts; «الأفكار» hands the text to the real «إنشاء»; the mock pages say «لم يُبنَ بعد». Database rule run 30 of 30, `npm test` 185 of 185, signed-out browser check 14 of 14.

- **Waiting on the owner:** the one-time Supabase Auth SMTP change and address settings in `Entry_Flow_Setup.md`, then the signed-in walkthrough in the same file.
- **Next action:** step 5 of the audit order, the per-platform post preview with the platforms' limits, shown through to the send step (the registry now holds what a platform accepts).

## Platform registry, 2026-10-14 (Step S5)

The list of platforms is one table the whole work cycle reads: the labels, the order of copies and the video-only rule are data, a new platform is a row (added from «الإعدادات» «المنصات», switched off until switched on), and each platform carries the owner's readiness tracker for what it asks outside the site, with a note and a log. Publishing is still a simulation for every platform and the pages say so. The existing work, approval and planning rule runs are unchanged (135, 71, 113). Database rule run 54 of 54, `npm test` 206 of 206, fixture browser checks 885 and 1010, signed-out check 11 of 11.

- **Waiting on the owner:** the signed-in walkthrough (the tab, adding facebook, switching it on, an account on it), and the outside paperwork the tracker follows: a verified Meta Business account decides whether Facebook and Instagram can publish for real (E-7).
- **Next action:** step 5 of the audit order, the per-platform post preview with limits.

## Storage locations, 2026-10-14 (Step S2)

Where each stored file lives is now recorded (`file_locations`, backfilled and kept true by trigger), every route that serves or changes a file asks a role for its provider through one interface (Google Drive behind it), «الإعدادات» «التخزين» shows providers, roles and the state of their copies with «تحقق من عينة», and a library file's page says where each version is kept and when it was last checked. Files behave exactly as before. Database rule run 31 of 31, `npm test` 196 of 196, fixture browser check 830 of 830, signed-out check 10 of 10.

- **Waiting on the owner:** the signed-in walkthrough, including the first «تحقق من عينة», which also shows whether the five library files are still in Drive.
- **Next action:** step 4 above. The move engine and a second provider (S3) follow the registry in the audit order.

Updated 2026-10-10. **CHECKPOINT 0.2 IN PROGRESS.** Checkpoint 0.1 is complete and accepted. Phase 0.2.1 (Workflow Mapping) is complete. **Phase 0.2.2 (Guided Department Validation) is closed on the Director's response alone:** R01 arrived on 2026-10-10, and the same day the owner directed that the Director's input is enough, so the remaining participants and the frozen build are skipped (`[-]` in `Roadmap.md`; exit gate criteria 1 and 2 waived by that directive). Phase 0.2.3 Round 1 corrections start on 2026-10-11. The day-by-day plan is in `Roadmap.md` under "Work plan from 2026-10-11".

Design: «الهوية الجديدة لمركز الاتصال» is **the only design** (2026-10-19): the Director approved it, so the old design («التصميم الحالي») and its switch (double-click on the logo, the design choice in «الحساب» «المظهر») were removed. Only the light/evening mode remains a personal choice. The old design's CSS rules still sit under the unused default selectors and can be cleaned later. See `MVP_draft.md` section 58.

Help: the first-visit guide and the page guide are written for each of the eight exact roles on all 23 pages (2026-10-19, `Help_Content_Matrix.md`, `src/lib/help/roles.ts`). Section tips, role-specific empty texts, settings tab tips and the shared entry cards from the matrix are not built yet.

## Building the reference into the site (from 2026-10-12)

The plan is `Reference_Build_Plan.md`, five steps; the reference is kept in `reference/comms-hub-reference-v5.html`.

- **Step 1, the work cycle in the database: done 2026-10-12.** Works, stages with approval points, versioned text and copies, approval per part bound to versions, projects, events, reminders, requests, notifications, connected accounts with YouTube and plan templates are in the Supabase project `comms-hub`, every rule in the database. Database rule run 135 of 135, `npm test` 104 of 104, typecheck and build clean. Nothing visible yet: the work pages still show the browser mock.
- **Step 2, the shared interaction kit: done 2026-10-12.** Hold to confirm on the library, mail and messaging; undo of library edits, decided in the database and followed by Google Drive; the help system (first-visit guides, section tips, the help button with guide mode, the page guide) with progress per person in the database, written for the library pages, mail and messaging. `npm test` 112 of 112, kit rule run 56 of 56, browser check of the kit 40 of 40. Not yet seen signed in: the owner walkthrough is in `progress.md`.
- **Step 3, «العمل», the work page and «إنشاء»: done 2026-10-12.** The work pages read and write the database: attention counts, tabs, list, status board and team view; the work page with stages, approval points, text and platform copies with versions, library media, mail and messaging links, comments, log and role-aware actions; «إنشاء» with automatic assignment and dates worked back from the due date; both plan editors with drag (mouse and touch) and arrows; mail «تحويل إلى عمل» now opens «إنشاء» and the database issues the number. `npm test` 123 of 123, browser check of the pages 264 of 264, typecheck and build clean. Not yet seen signed in: the owner walkthrough is in `progress.md`. The review decision and publishing come in Step 4; until then a work sent for review waits there.
- **Step 4, «الموافقات والنشر», the review screen, «الحسابات المرتبطة» and notifications: done 2026-10-12.** Approvals (waiting for me, sent by me, the decision log) and publishing (account authorisation, at-risk dates, ready, scheduled, partial or failed with retry, published; a simulation); the review screen part by part with a word difference, file preview and timed notes, and approve, request changes or reject; the linked accounts at `/channels` with YouTube; the notifications drawer in three tiers from the database. The approval rules were reviewed first: one gap found and fixed (an uploader could approve their own file version from a work's review). Approval rule run 71 of 71, `npm test` 129 of 129, browser check of the pages 495 of 495, typecheck and build clean. Not yet seen signed in: the owner walkthrough is in `progress.md`.
- **Step 5, «التقويم», «المشاريع» and «الطلبات», then acceptance: built 2026-10-13, local commit, not pushed.** The calendar on the database (day, week, month, list; a lane per account; project bands; stages and tasks across days; team load; events and private reminders; warnings that do not block; publish-date moves as requests and direct delivery and stage moves for leaders, by drag with mouse or finger); «المشاريع» and the project page (timeline, who works on what, works, tasks; a new project with a works plan created in one step); «الطلبات» (extensions with what moves first, folder access, date moves, work requests to assign, held mail and ask-first confirmations as links); Home on real counts; help for all sixteen pages. The review of the rules across Steps 1 to 5 found and closed gaps, the main one that any signed-in account could read a restricted work's text through `work_parts`. Rule run 113 of 113, Step 1 and Step 4 runs re-run 135 of 135 and 71 of 71, `npm test` 141 of 141, browser check 1010 of 1010, typecheck and build clean. Delegation while away waits for the approval-rights work (owner decision). Not yet seen signed in: the owner walkthrough of the whole cycle is in `progress.md`.
- **Next action:** owner asks for the push; then the signed-in walkthrough of the whole cycle (create, hand over, approve, schedule, publish simulation, undo, help) and the findings recorded.

## Permissions, urgency and WhatsApp (from 2026-10-13)

The plan is `Permissions_Plan.md` (accepted, D-1 to D-13). Local commits, not pushed.

- **P1, the permission engine: done.** Role templates, standing, temporary and one-time grants and an append-only log in the database; existing checks moved onto it with nobody's behaviour changed. Rule run 122 of 122 plus 5 of 5.
- **P2, «الحسابات»: done.** Four tabs, the person's card with every permission's source, the grant dialog, presets, the role matrix; the director and assistant open it. Rule run 137 of 137, browser check 271 of 271.
- **P3, asking and the connections: done.** Requests from a locked control, messaging, mail and «الطلبات»; Home, notices, the activity log, timed folder access. Request run 49 of 49; the six earlier runs unchanged; browser checks 414 of 414 and 1010 of 1010; `npm test` 153 of 153.
- **P4, urgency 0 to 3: done 2026-10-14.** A four-step picker in the composer («للانتباه» for anyone, «مهم» by permission and offered as a request when locked, «عاجل» fixed to the leaders), a mark per level, acknowledgement at level 3 only, task cards of priority «عاجلة» shown as level 3; the old `urgent` column removed after checking nothing read it. Urgency run 41 of 41, chat run 22 of 22, browser check 483 of 483.
- **P5a, WhatsApp without the real sender: done 2026-10-14.** Members link a number with a six-digit code from the system number (the code is made on the server and never stored or shown); urgent messages are routed inside `chat_send` from room membership and verified links; the outbox holds ids only and cannot name a recipient outside the message's room; the push is off until granted, with a daily cap and the recipient's mute; one key-gated dispatch route for the bridge; signed links to the exact message. Screens: «واتساب» on «الحساب», «واتساب النظام» in «الإعدادات», the person's card (number for administrators only), the push and delivery line in «المراسلة». WhatsApp run 98 of 98 including the four-room routing case, route check 25 of 25, browser check 625 of 625, `npm test` 168 of 168.
- **P5b, the pull bridge: built 2026-10-14, not yet linked.** `bridge/whatsapp/` (adapted from the Hedayah bridge): polls the site with the key, sends only to the claimed number of each claimed row, reads and answers nothing, QR in its own terminal, `run-bridge.bat`. Offline tests 14 of 14. **Not performed:** the first QR link of the system number and a real message, which need the owner's phone. Until the owner stores the key's fingerprint and switches the system number on, nothing is sent.
- **Not seen signed in:** no agent has seen the signed-in screens of P2 to P5a against the real database (no sign-in bypass exists); they were checked rendered with fixture data. Owner walkthroughs are in `progress.md`.
- **Next action:** the owner links WhatsApp with the 14-step walkthrough in `bridge/whatsapp/README.md` (also in the P5b entry of `progress.md`), runs the signed-in walkthroughs of P2 to P5a, and asks for the push when satisfied (all permission steps are local commits).

## Validation so far (2026-10-10)

- **Response R01, Director, desktop, self-administered Google Form.** Transcribed in `validation/responses/R01-2026-10-10-director.md`. The shared response sheet and the attached CSV hold the same single response.
- **Scores:** workflow fidelity 3, authority 4, findability 3, terminology 3, trust in the record 3, out of 5.
- **Own-role tasks (S1 and S2):** 10 of 13 passed. Failed: the purpose of «العمل» and the team's work (S1.3, S1.6), and counting overdue work (S2.4).
- **Whole submission:** answers appear in all seven role sections although the form sends each role to one section. 39 of 45 tasks passed. Who completed sections S3 to S7 is unconfirmed (task 0.2.2.7), so those answers are findings, not role coverage.
- **Findings:** 19 recorded, 8 provisionally Severity 1: team workload and stage view, overdue count, timestamped video notes, component-scoped approval, delegation, urgent path, work linked to several campaigns, assignment to a named person. Severities await owner confirmation (D-03).
- **Prototype defect exposed:** the prototype has no scenario "today", and every seed due date is 22 or 23 September, so a tester in October sees all work as late. Corrected in task 0.2.3.5.
- **Exit gate:** one of five role groups, one of six participants, one of two leadership. Whether self-administered form responses count as sessions is owner decision D-02.

## Round 1 corrections (2026-10-11)

All six Round 1 corrections from the Director's findings are built and verified: overdue and due-soon against a fixed scenario date (21 September 2026), named assignees with a team view and load per person, stale channel version flags, highlighted version difference, early reconnect warning, and timestamped video notes. `npm test` 15/15, `qa/round1.cjs` 52/52, regressions pass. See `MVP_draft.md` section 59. Eight design notes for the structural findings are in `validation/design-notes/`, each recommending a Version 1 or 2 checkpoint. The re-check script for the Director is `validation/recheck-R01.md`.

## Decisions waiting on the owner

| ID | Decision |
|---|---|
| D-01 | With the Director, on the live toggle: make the new identity the default, keep it as an option, adjust it, or remove it |
| D-02 | Count self-administered form responses as sessions, with "facilitator: none" recorded. Effectively settled by the 2026-10-10 directive that the Director's response alone is enough; to be confirmed |
| D-03 | Done 2026-10-11: severities confirmed as transcribed |
| D-04 | Confirm or overrule the eight design-note recommendations (`validation/design-notes/README.md`), including whether to show an urgent mark and the editor's name in the prototype. Partly settled 2026-10-12: urgent mark, close with reason, several campaigns, stage deadlines, stage templates, editor shown on a version and per-part approval are accepted for the real work pages (see `progress.md`) |
| D-05 | Done 2026-10-12: version 5 of «النموذج المرجعي للمركز» and its rules accepted with no notes. Urgent work is approved by the director and the assistant; giving the right to approve to others comes later. No sample data in the database. See `progress.md` |

## Verified capability

- **Messaging tab and profiles (2026-10-12).** «المراسلة» beside «البريد» at `/mail/chat`: direct chats, groups tied to a campaign or work item, announcement channels, replies, forwarding, reactions, stars, pins, edits, deletes, pictures, files and recorded voice notes, polls, tasks, approval cards, urgent messages with acknowledgement, slash commands, moving a conversation to formal mail, live through Realtime. The account page gains «مظهرك في البريد والمراسلة» (picture, name, headline, colour, presence, signature). `npm test` 87/87, database rule run 22/22. Not yet seen signed in by an agent.
- **Mail is live (2026-10-12).** Pushed and deployed to `comms-hub-three.vercel.app` with the Gmail variables set; the public date page and the sign-in guard answer in production.

- **Mail page (2026-10-11).** Real internal mail, the shared Gmail mailbox (IMAP and SMTP with an app password), approval of outside mail, and approval, date, task and progress cards that act through the media rules. Rules in Postgres; `npm test` 74/74, database rule run 25/25, `qa/mail-public.cjs` 15/15. Not yet seen signed in, and Gmail is not connected yet: owner steps in `progress.md`.
- **Second design screens (2026-10-11).** Behind the same logo toggle (also in the phone top bar): evening mode, decisions and campaign pulse on Home, approval stamp, phone approval sheet, notification tiers, calendar week with drag-to-request, motion from the work item, and the `/components` page. `qa/identity-screens.cjs` 48/48; contrast 51 pairs per mode, lowest 4.73. See `MVP_draft.md` section 60.
- **Design toggle (2026-10-10).** Double-click on the sidebar logo switches between Direction A and the new identity; restored before first paint; fonts served by the app. Direction A is pixel-identical to before on 63 captures (`qa/colour-tokens.json`). `qa/identity-toggle.cjs` 134 of 134, including 48 contrast pairs and no request leaving the machine. Regressions 34/34, journey PASS, motion studio 205/205, domain tests 9/9, typecheck and build clean. Evening mode and the component QA page are not built.
- **Colour tokens (task 0.3.1.1).** Every interface colour in `globals.css` is one of 73 named tokens.
- `/motion`, the local Arabic motion studio, revised after first review (2026-10-08): 26 templates (8 numbers, 8 Repine, 10 video frames), template rail with live thumbnails, stage with transport and phase strip, tabbed settings with every timing and motion slider restored, frame ratios with true shapes and stated output sizes, window preview (sample, own clip, key green, transparent) and Reels safe zones, and downloads (MP4, transparent MOV, PNG sequence ZIP, single PNG) up to 4K and 60 fps with progress, cancel and a persistent save link. See `MVP_draft.md` section 57. Edits reset on refresh; access restrictions and asset attachment are deferred.
- Motion studio evidence, 2026-10-08 (second round): `node qa/motion-studio.cjs` passed all checks, including real downloads decoded with ffprobe and ffmpeg; existing regression 34/34; domain tests 8/8; typecheck and production build pass. Details in `progress.md` and `qa/motion-studio.json`.

- Runnable Next.js/TypeScript/Tailwind local UI with a coherent Saudi National Day 2026 campaign, eight role experiences, and distinct approval/publishing/Admin authority.
- Full browser journey passes: create, submit, request changes, edit, resubmit, approve exact revision, schedule, calendar, partial publication, retry and success.
- All eight personas and central B/C actions checked. 60 route/viewport checks at 1440/1280/900/390 pass without overflow or captured page errors.
- Fourteen Level A desktop/mobile screenshots inspected, plus mobile menu, historical release and calendar dialog. Focused keyboard, labels, focus return, Escape, contrast, validation and RTL review completed.
- Production build and typecheck pass; eight domain tests pass.
- Historical submitted/reviewed content and asset-version snapshots survive later edits within the session. Editing invalidates current approval. Notification reading cannot approve; retries preserve successful channels.

### Added and verified in Phase 0.2.1 (2026-09-19)

- **Role-specific home experiences are now genuinely distinct.** Each of the eight roles presents its own tile set per `MVP_draft.md` section 6, and no two roles share a set. Notices carry an explicit role audience, so the notification centre, monitoring page and home panels show only what the active role is addressed by.
- **Admin is a real shell.** Users, Roles and Permissions, Integrations, System Health, Storage, Security, Automation and Notification Policy, per sections 35 to 37. Connected account health also appears on the Publishing Officer's home.
- **Calendar grid is correct.** Weekday headers plus leading pad cells, so each month starts on its real weekday; verified across two months. Month and year are selected in Arabic rather than through the browser's own locale label.
- **Post-publication editing no longer erases the publication.** Editing still invalidates the bound approval, as `disscussios/approval_policy_design.md` section 3 requires, but a dispatch that already reached the channels is preserved in a publication record and shown on the work item.
- **Settings has eight sections** (section 38); Account shows the Arabic role name, email, language, permissions and mock sessions (section 39).
- **Seed data matches the demo scenario:** the 23 Sep 18:00 publication is pre-scheduled (section 47), campaign figures from section 4 appear on home, activity lines vary per item, and the hard-coded home schedule entry is gone. A campaign creation step matches the section 51 provisional flow.
- Every `src` file and the test suite were reformatted from single-line source to normal line breaks, with no behaviour change.
- Evidence: `npm test` 8 of 8; clean `npm run typecheck` and `npm run build`; `qa/checkpoint-02-corrections.cjs` 34 of 34 browser checks passing with zero page or console errors and no horizontal overflow at 1440 or 390.

### Phase 0.2.1 deliverables

- `validation/workflow-map.md` — nine representative workflows, 25 prototype assumptions classified, 11 exceptions, 7 bottlenecks, 9 terminology items, and the seven open questions that only real participants can answer.
- `validation/validation-scripts.md` — seven guided session scripts with fixed setup, unaided-success criteria, and participant-facing Arabic wording.
- `validation/feedback-rubric.md` — four-level severity rubric, per-session capture sheet, consolidated findings register, and the exit gate roll-up.

## Limits and decisions

- Media upload/playback deferred: fixed illustrative assets and version previews support workflow validation. Designers and producers may reject this in 0.2.2; the question is in the scripts.
- State/history reset on refresh. Content types share one composer. Calendar supports month/agenda only, without week/day or date-level creation. Settings and Admin are visual shells with no enforcement.
- Accounts are real since 2026-10-11 (owner directive, recorded in `progress.md`): email and password sign-in, approved accounts, access requests, roles and page permissions in the Supabase project `comms-hub`; the role switch is administrators only. Uploads go to Google Drive (a personal Gmail account for now). The media section is real since 2026-10-11: folders with four permission levels and locks, pipeline stages, asset pages, tasks, review links and an append-only activity log, enforced in the database. The work cycle is real since 2026-10-12 (works, approvals, projects, calendar, requests, notifications; built through Step 5 of `Reference_Build_Plan.md`). No real publishing, AI, NAS or workers. Permissions are real since 2026-10-13. WhatsApp delivery of urgent and pushed messages is built (2026-10-14) and waits for the owner to link the system number to the bridge on their computer.
- No delegation of review authority and no urgent or crisis path exist. Both are recorded as unsupported assumptions, not oversights.
- This is not formal accessibility certification, production readiness or department sign-off. **Human validation rests on one participant, the Director, by owner directive; the exit gate's six-participant and five-role-group criteria are waived, not met.**
- Extra ideas outside the Roadmap (video and photo editing, agent suggestions, Severity 4 preferences) are parked in `Ideas_Backlog.md`. None is planned work.
- Phase 0.2.1 corrected only defects that contradict `MVP_draft.md` on their face. It deliberately did not resolve any of the seven open questions, add delegation or an urgent path, change any Arabic term, or restructure the composer. Those belong to Phase 0.2.3, after real findings exist.

Evidence, reproduction instructions and precise accepted scope for Checkpoint 0.1: [qa/ACCEPTANCE.md](qa/ACCEPTANCE.md). Phase 0.2.1 correction evidence: [qa/checkpoint-02-corrections.json](qa/checkpoint-02-corrections.json).

## Next action

Permissions, urgency and WhatsApp (P1 to P5b) are built as local commits: the owner links the system number with `bridge/whatsapp/README.md` and walks the signed-in screens (section above). Owner: ask for the push of the build steps (Steps 1 to 5 and P1 to P5b are local commits only; the live site still runs the mock work pages), then sign in and walk the whole work cycle with the walkthrough list of the 2026-10-13 entry in `progress.md`. The mail and messaging walkthrough of 2026-10-12 is still open too. Then the earlier items below.

1. Director: run the re-check `validation/recheck-R01.md` on the current build. It covers the three failed tasks, each Round 1 correction, the open design questions, T6, D-01 (which design is the default, on the live logo toggle) and the command palette.
2. Owner: decide the eight design-note recommendations (D-04) and confirm D-02.
3. Agent, after the re-check: record the addendum, close or reopen each finding, and start Round 2 if any correction is rejected. If D-01 approves the new identity as default, rewrite `DESIGN.md` and flip the default.

Phase 0.2.2 is closed on the Director's response by owner directive; tasks 0.2.2.2 to 0.2.2.8 are skipped, not pending. Version 1 remains gated on the Checkpoint 0.2 exit gate, with criteria 1 and 2 waived by that directive.

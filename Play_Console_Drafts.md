# Google Play: drafts for the owner

Written 2026-10-28 for A8 of `Android_Build_Plan.md` (specification: `MVP_draft.md` 64.6). Everything here is a draft
for the owner to read, correct and paste into the Play Console. No agent signs in to the Play Console, uploads a
bundle or holds the release key. Where an answer is a judgement, it says so. Check each form's wording on the day: the
Console changes.

The owner's Google Play developer account is a verified personal account (2026-10-27). Its first production release
needs a closed test first: at least 12 testers opted in for 14 days in a row.

## 1. The order of the owner's steps

1. **Publish the site parts first.** Push, which deploys. The site must serve `/.well-known/assetlinks.json` (with the
   release certificate, see `mobile/README.md`), `/privacy.html` and `/account-deletion.html` before Google reads them.
2. **Apply the account deletion migration** (`supabase/migrations/20261028120000_account_deletion.sql`) to the
   `comms-hub` project. Its rules passed 42 of 42 in a rolled-back run (`qa/account-deletion-rules.json`); applying is
   the owner's go-ahead. Without it «طلب حذف حسابي» says it cannot read requests, and the public page's email route is
   the only one.
3. **Make the reviewer's account.** Invite an address you control (for example a new Gmail address) as «عضو» from
   «الحسابات», sign in once to set its password, and keep the password in your password manager. It goes only into the
   Play Console's "App access" form (section 6), never into this repository or a chat.
4. **Build the bundle** with your key (`mobile/README.md`, "Google Play"):

   ```powershell
   $env:COMMSHUB_KEYSTORE_PROPERTIES = "D:/keys/commshub-release.properties"
   $env:COMMSHUB_GOOGLE_SERVICES = "D:/keys/google-services.json"
   npm run pack:play
   ```

   It prints the `.aab` path, its size and SHA-256, and refuses to finish if the site's `assetlinks.json` does not name
   the key's certificate.
5. **Create the app** in the Play Console: name «مركز الاتصال المؤسسي», default language Arabic (`ar`), App, Free.
6. **Signing, at the first upload.** In "Test and release", "App integrity", choose to use your own app signing key
   ("Provide a copy of your app signing key"), not the one Google offers. Download Google's PEPK tool and encryption
   key from that page, run the command it shows with `D:/keys/commshub-release.jks` and the alias `commshub`, and upload
   the encrypted file it makes. Then the phones that installed the APK from «تطبيق الهاتف» update from Play without
   removing it.
   - Google recommends a separate upload key. The decision of 2026-10-26 is one key for both, and `npm run pack:play`
     checks the bundle's certificate against `assetlinks.json` on that basis. A separate upload key needs that check
     changed first.
   - The choice of app signing key can be changed only before a release reaches open testing or production; make it
     here.
7. **Internal testing first** (a few addresses, no review wait): upload the `.aab`, install from the opt-in link on a
   real phone, and walk through it signed in (section 8).
8. **Fill the "App content" forms** (section 6) and the **store listing** (sections 3 and 4).
9. **Closed testing:** a track with at least 12 testers (a Google Group or a list of addresses), each opting in from
   the link the Console gives and keeping the app installed for 14 days in a row. Testers need a Hub account too:
   invite each from «الحسابات». Releases A4 to A8 can go to this track during the 14 days.
10. **Apply for production** when the Console allows it, answering its questions about the closed test.

Android's developer verification: Google registers apps distributed through Play itself, and the Play Console can
register the same package for the APK channel. It is enforced first in Brazil, Indonesia, Singapore and Thailand from
30 September 2026, and elsewhere from 2027. Check "Android developer verification" in the Console once the app exists,
and register `sa.commshub.app` with the release certificate if it is not listed.

## 2. What the bundle contains (for the forms)

Read from the built bundle with bundletool on 2026-10-28 (`qa/android-play.json`): package `sa.commshub.app`, minimum
Android 10 (API 29), target Android 16 (API 36).

| Permission | Why |
|---|---|
| `INTERNET`, `ACCESS_NETWORK_STATE` | The site. |
| `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` | Voice notes in «المراسلة», only while recording. |
| `POST_NOTIFICATIONS`, `WAKE_LOCK`, `c2dm.permission.RECEIVE` | Phone notices through Firebase (A5). |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC`, `RECEIVE_BOOT_COMPLETED` | Library uploads in the background (A7, WorkManager). |
| `USE_BIOMETRIC`, `USE_FINGERPRINT` | The optional application lock (A6). |

Not in Google Play's copy: `REQUEST_INSTALL_PACKAGES` (the APK channel's alone), any camera, location, contacts,
media-reading or advertising-ID permission.

## 3. Store listing (Arabic, the default language)

**App name** (30 at most): مركز الاتصال المؤسسي

**Short description** (80 at most):

> مساحة عمل فريق الاتصال المؤسسي: الأعمال والاعتماد والمكتبة والبريد والمراسلة.

**Full description** (4000 at most):

> «مركز الاتصال المؤسسي» مساحة العمل الداخلية لفريق الاتصال في المؤسسة. الدخول بدعوة من مسؤول النظام فقط، ولمن هو خارج الفريق أن يطلب الوصول.
>
> ما تجده في التطبيق:
> • العمل: كل عمل بمراحله ونصوصه ونسخه لكل منصة، ومن يعمل عليه، وموعده.
> • الاعتماد: يراجع مدير الاتصال ومساعده كل جزء بإصداره المحدد، ويعتمدانه أو يطلبان تعديله، ولا يعتمد أحد ما أرسله بنفسه.
> • المكتبة: صور الفريق وفيديوهاته وملفاته في مجلدات بصلاحيات، مع التصوير من الهاتف ورفع الملفات الكبيرة في الخلفية.
> • البريد والمراسلة: البريد الداخلي وصندوق القسم، والمحادثات والمجموعات والرسائل الصوتية والمهام وطلبات الصلاحيات.
> • التقويم والمشاريع والطلبات: ما يُنشر ومتى، وحمل كل عضو، وطلبات التمديد والوصول.
> • التنبيهات: ما يحتاج قرارك يصلك على الهاتف ولو كان مقفلاً، وتختار ما يصلك وإخفاء نصه عن شاشة القفل.
> • الملفات: افتح الملف واحفظه في الهاتف وشاركه، وشارك الملفات من تطبيقاتك الأخرى إلى المركز.
> • قفل اختياري للتطبيق ببصمة الإصبع أو قفل الشاشة.
>
> النشر إلى المنصات في هذا الإصدار محاكاة: يتتبّع المركز ما جُدول وما نُشر، ولا ينشر على المنصات بعد.
>
> الخصوصية: لا إعلانات ولا أدوات تحليل، ولا يقرأ التطبيق جهات الاتصال ولا الموقع ولا معرض الصور. تستطيع طلب حذف حسابك من صفحة «الحساب».

**Category:** Business. **Contact email:** commshubhadayah@gmail.com. **Website:** https://comms-hub-three.vercel.app.
**Privacy policy:** https://comms-hub-three.vercel.app/privacy.html.

An English translation of the listing is optional; reviewers read the Arabic one.

## 4. Pictures

| Picture | File | State |
|---|---|---|
| App icon, 512 by 512 | `mobile/play/icon-512.png` | Made from the brand logo as a full square (Play rounds the corners). `qa/play-graphics.cjs` 7 of 7. |
| Feature graphic, 1024 by 500 | `mobile/play/feature-graphic-1024x500.png` | Made from the logo and the site's fonts. |
| Phone screenshots, 2 to 8 | the owner's | Agents never sign in, so these are the owner's to take on a real phone, portrait, signed in with the reviewer's or a test account, with no real person's data on screen. |

Suggested screenshots, in order: «العمل» with the attention counts; a work's page with its stages; the review screen
of a part; the library with «تصوير»; «المراسلة» with a voice note; the notices on a locked phone; «الحساب» with «أجهزتي».

## 5. Data safety

Answers from the privacy policy of 2026-10-28 and the code. "Collected" means it leaves the phone; Google's form calls
a transfer to a provider working on our behalf (Supabase, Vercel, Google, WhatsApp) not "shared".

- Does the app collect or share any of the required user data types? **Yes.**
- Is all of the user data collected by the app encrypted in transit? **Yes** (HTTPS only).
- Which methods of account creation does the app support? **Username and password** (email and password; an
  administrator approves every account).
- Delete account URL: **https://comms-hub-three.vercel.app/account-deletion.html**
- Can users ask for some of their data to be deleted without deleting the account? **Yes** (remove a phone, unlink the
  WhatsApp number, delete their own messages).

| Data type | Collected | Shared | Optional | Purposes |
|---|---|---|---|---|
| Personal info: Name | yes | no | required | App functionality, Account management |
| Personal info: Email address | yes | no | required | App functionality, Account management |
| Personal info: User IDs | yes | no | required | App functionality, Account management |
| Personal info: Phone number | yes | no | optional (WhatsApp) | App functionality |
| Messages: Emails | yes | no | optional | App functionality |
| Messages: Other in-app messages | yes | no | optional | App functionality |
| Photos and videos: Photos | yes | no | optional | App functionality |
| Photos and videos: Videos | yes | no | optional | App functionality |
| Audio: Voice or sound recordings | yes | no | optional | App functionality |
| Files and docs | yes | no | optional | App functionality |
| App activity: App interactions | yes | no | required | App functionality; Fraud prevention, security and compliance (the activity log) |
| App activity: Other user-generated content | yes | no | optional | App functionality (works, comments, tasks, calendar entries, reminders) |
| App info and performance: Diagnostics | yes | no | required | Analytics (errors the page catches, to fix them) |
| Device or other IDs | yes | no | required | App functionality, Account management («أجهزتي» and the notice token) |

Not collected: location, financial info, health, contacts, calendar of the phone, web browsing, search history, crash
logs of the phone, installed apps. Nothing is processed only ephemerally.

Judgement calls, the owner's to confirm: the Hub's calendar is listed as user-generated content, not "Calendar
events" (Google's term means the phone's calendar); error reports as Diagnostics for Analytics.

## 6. App content

| Form | Answer |
|---|---|
| Privacy policy | https://comms-hub-three.vercel.app/privacy.html |
| App access | All or some functionality is restricted. Instructions: «افتح التطبيق، وسجّل الدخول بالبريد وكلمة المرور أدناه. الحساب بدور «عضو».» plus the reviewer's address and password (section 1, step 3). No other step: the lock is off and nothing else is asked. |
| Ads | No ads. |
| Content rating | All other app types. Violence, sexuality, language, controlled substances, gambling: none. Users interact or exchange content: **yes** (mail, messaging and files among invited members). Shares the user's location: no. Digital purchases: no. Unrestricted web access: no (the app opens its own site only). |
| Target audience | 18 and over. Not for children. |
| News app | No. |
| Government app | **The owner's answer**: yes only if the organisation is a government body or the app is made on its behalf. |
| Financial features | None. |
| Health | None. |
| Advertising ID | No (the bundle has no `AD_ID` permission). |
| Foreground service permissions | `FOREGROUND_SERVICE_DATA_SYNC`: Network transfer, upload or download. Description: «يرفع العضو صوراً وفيديوهات كبيرة إلى مكتبة الفريق. بعد أن يضغط «رفع» يستمر الرفع إن خرج من التطبيق أو قفل الشاشة، في إشعار «جارٍ رفع الملفات» يُظهر التقدّم، ويتوقف حين تصل الملفات أو يلغيه العضو. لا يبدأ إلا بفعل العضو.» Video: the owner records it signed in (choose a video in the library, «رفع», lock the phone, the notice, the file arriving). |
| Photo and video permissions | Not used: files come from the system's picker or from sharing. |
| Account deletion | Covered by the Data safety URL above and «طلب حذف حسابي» on «الحساب». |

## 7. What changed in the site and the app for Play (A8)

- Google Play's copy updates through Play: the same update window, with Play's own window asking the person
  (`MVP_draft.md` 64.6). It has no `REQUEST_INSTALL_PACKAGES` and no self-update.
- «طلب حذف حسابي» on «الحساب», «طلبات حذف الحساب» in «الحسابات», and the public page `/account-deletion.html`.
- `/privacy.html` rewritten for mail, messaging, WhatsApp, the two applications and phone notices.

## 8. What only the owner can check

- Play's real update: publish 0.1.1 to internal testing over an installed 0.1.0 from Play, open the app, «تحديث الآن»,
  Play's window, the restart.
- The APK installed from «تطبيق الهاتف» updating from Play once Play App Signing uses the same key.
- «طلب حذف حسابي» signed in, the notice on the director's phone, and «إزالة الحساب» closing it.
- The pre-launch report Play makes from the bundle (it signs in with nothing, so it sees the sign-in screen only).

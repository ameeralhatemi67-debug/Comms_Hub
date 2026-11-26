# Snapchat connection: plan and screenshot list

Started 2026-11-26 at the owner's request: connect Snapchat the way Instagram, YouTube and TikTok were
connected (a setup guide in «المنصات» with pictures, then a real connection), walking it first on the
owner's personal account to get the screenshots. Read from Snap's official pages on 2026-11-26. Snap's
pages show no dates, so every fact below must be re-read before an adapter is built.

## 1. What Snapchat offers: two different routes

| | Route A: Public Profile API | Route B: Snap Kit (Login Kit, Creative Kit) |
|---|---|---|
| Can a server publish? | Yes: Story, Saved Story, Spotlight | No |
| What it is | Marketing API route for partners, posting on behalf of a Public Profile | Login with Snapchat (name, Bitmoji, an app-specific id); Creative Kit shares media into the Snapchat camera, and the person finishes the Story in the app |
| Where the app is made | Ads Manager (ads.snapchat.com), then Business Dashboard, «Business Details», OAuth App. Snap warns: not the Developer Portal, its Client ID does not work for this API | Snap Kit Developer Portal (kit.snapchat.com/manage), a project with a Staging and a Production Client ID |
| Access | **Allowlist only.** The owner emails the Snap point of contact the OAuth client id (never the secret) and a description of the use. No review time is stated anywhere | Staging works at once for up to 30 «Demo Users» (members of the organisation). Public use needs Snap's review, "typically 10-15 business days", with an integration video and a privacy policy |
| Sign-in | `accounts.snapchat.com/login/oauth2/authorize`, scope `snapchat-profile-api`, token 1 hour, refresh token | `accounts.snapchat.com/accounts/oauth2/auth`, PKCE, token 1 hour, refresh token; legacy SDKs being deprecated |
| Media | Encrypted upload (AES-256-CBC key and iv sent to Snap), up to 1 GB in parts of 32 MB, video mp4 5 to 300 seconds, a media object lives 24 hours | Up to 300 MB, caption 250 characters |
| Delete | Saved Story and Spotlight yes; Story no (from the part of the page read as a summary: re-check) | not applicable |

Route A is the only one that is publishing. It is also the one the codebase already names
(`src/lib/platforms/info.ts`, `MVP_draft.md` 67.4: "allowlist only, so the manual path stays").
Route B alone gives sign-in and nothing to publish with, so it is not worth a connection by itself. Its
Creative Kit is the Snapchat counterpart of X's link route (`MVP_draft.md` 81): the site prepares the
media and a person finishes the post in the app. That is a possible free fallback, not built.

What is not stated and must be settled by the first real try: whether a self-owned brand account (not a
partner or agency) is accepted for the allowlist; how long it takes; whether the authorize screen works
for a client id that is not yet allowlisted; the refresh token's lifetime; which of the two token
addresses (`.../login/oauth2/access_token` or `.../login/oauth2/token`) is the right one.

## 2. What can be done today with no approval (the screenshot walk)

Everything up to and including the OAuth app needs nobody's approval. Send each picture as the original
(they hold your email and names: they are blurred before use and never kept, as for the other guides).

1. **S1. Sign in.** accounts.snapchat.com with the personal account. Needs a verified email. One picture
   of the screen after signing in.
2. **S2. Create the business account (organisation).** ads.snapchat.com. Every screen of the first-time
   form (name, country, currency, time zone, whatever it asks), and the screen after it is created.
3. **S3. Open the Business Dashboard.** The page and its left menu, with «Business Details» visible.
4. **S4. Create the OAuth app.** «Business Details», the OAuth Apps section, the button that adds one, the
   form (name, redirect URL), and the screen that shows the Client ID and the Client Secret. The secret
   is shown once: cover it yourself before sending, and keep it out of the chat.
   - Redirect URL to enter: `https://comms-hub-three.vercel.app/api/platforms/callback/snapchat`
     (the site's return path for every platform is `/api/platforms/callback/<name>`).
5. **S5. Public Profile.** Where the organisation's Public Profile is made or chosen (Business Dashboard,
   «Public Profiles» or what it is called). A personal account is not a Public Profile: show what you are
   offered, even if it is a message that you cannot.
6. **S6. The request for access.** Nothing to screenshot: the email to your Snap point of contact (the
   client id, a sentence on the use, never the secret). If you have no contact, say so: the way to get
   one is the open question.
7. **S7. After approval only.** The consent screen Snapchat shows when the app is authorised, and the
   redirect back. We cannot do this one before the allowlist.

If any screen differs from the list (a different name, an extra step, a refusal), send it anyway: that
is the point of the walk.

## 3. What gets built from the pictures

- A `snapchat` guide in `src/lib/setup-guides.ts` in the form of the others (short `b`, a `todo` list,
  `shots`, `implied` steps, a keys step for Client ID and Secret), and the registration in
  `GUIDE_OF` (`src/lib/platforms/setup.ts`). Today Snapchat is a manual platform: the tests that say so
  (`tests/platform-setup.test.mjs`, `tests/platforms.test.mjs`, `tests/connections*.test.mjs`) change with it.
- The manual path stays the working one until the allowlist is given: a guide that ends at «بانتظار موافقة المنصة»
  (the platform's own review is the existing `review` step kind) and never holds anything back.
- An adapter (sign-in, the health check, then a test upload) only after the allowlist, and only with the
  token, the secret and the encrypted-upload keys kept as for the other platforms: server only, never in a log.
- Publishing stays a simulation for works until an adapter exists.

## 4. Sources (Snap, read 2026-11-26)

- Public Profile API: `developers.snap.com/api/marketing-api/Public-Profile-API/` Introduction, GetStarted,
  FAQ, ProfileAssetManagement, Profiles, Announcements.
- Snap Kit: `developers.snap.com/snap-kit/` login-kit/overview, login-kit/Tutorials/web,
  creative-kit/overview, developer-portal/developing-your-app, app-review/overview,
  app-review/submission-and-review, changelog.

## 5. Walk log (the owner's pictures; no name, email or number is kept here)

The originals are in the session scratchpad (`snapchat-originals/`), never in the repository; they hold a real email, name, phone number and photo and are blurred by
`scripts/guide-shots.mjs` before any guide uses them.

- **2026-11-26, S1 and S2 received.**
  - **S1**, accounts.snapchat.com: the sign-in asks the email, then «Enter password».
  - **S2**, ads.snapchat.com, first visit, three screens:
    1. «Welcome to Ads Manager! What is your business name?»: «Business name», «Business email address», «Your name», button «Next», and a link «Skip ad creation».
    2. «Where do you do business?»: «Country», «Currency» (SAR for Saudi Arabia), «Business phone number», «Business website (optional)», «VAT/Tax ID (optional)», two boxes already
       ticked (be contacted by phone or WhatsApp with offers; be told by email of other Snap products), a line saying the person is authorised to act for the business and agrees to the
       «Terms of Service» and «Business Services Terms», buttons «Back» and «Next». The guide should say the two ticked boxes are marketing and may be cleared.
    3. «Complete your Public Profile»: it shows the person's own Snapchat profile and asks «Do you want to make this your business's Public Profile?» with the button
       «Create Public Profile» (accepting the «Commercial Content Terms»). So a personal profile can be made the organisation's Public Profile. That makes it public: a choice for the owner, not a
       step to click for the picture.
  - After it, Ads Manager opens on its campaign builder («Create Ads», «Choose objective»), the header showing the organisation and the role «Organisation admin». That is not where the
    OAuth app is; leave it with «Back to Manage view» or «Cancel».
- **2026-11-26, S3 and S4 (page only) received.** This settles where the OAuth app is: Snap's Public Profile API page was right.
  - **S3**, the Business Dashboard (business.snapchat.com, reached from Ads Manager's top menu): a top bar with «Business», a «To do» counter and the organisation with the role
    «Organisation admin»; a left menu «Business Settings» with «Business Dashboard», «Business details», «Members», «Ad accounts», «Pixels», «Apps», «Shared», «User Settings», «Catalogues», and
    «Billing and payments» with «Payment methods», «Transactions», «Invoices». The page says «Review your campaign progress, check in on your Public Profiles and see what's new on Snap.»
  - **S4**, «Business details»: «Organisation info» (the name, the address, the «Organisation ID», «VAT/Tax ID (optional)»), «Billing Address Book» with «New address», **«OAuth apps» with the
    button «+ OAuth app»** and the line «You have added zero OAuth apps.», «Conversions API tokens» with «Generate token» (not needed), and «Contact details and preferences» with the business
    phone and two switches, «Phone call» and «WhatsApp», both on by default (marketing: the guide should say they may be turned off). «Save changes» is at the top and is not needed for the app.
  - **Next: the form behind «+ OAuth app»** (the name, the redirect address, and the screen that shows the Client ID and the Client Secret once).
- **2026-11-26, S5 to S7 received: the OAuth app was created** (values kept out of this file: the client ID is in the owner's Snap page, and the secret was shown once; see the note below).
  - **«+ OAuth app»** first opens a dialog **«API Terms and Conditions»**: one box, «On behalf of <name>, I agree to the Snap Developer Terms and the Snap Business Tools Terms, which govern the
    use of the Snap API», and the buttons «Cancel» and «Save» (off until the box is ticked). The guide should say these are Snap's terms and that the person who ticks them binds the organisation.
  - **The form «Create OAuth app»** (a page, «Business details > Create OAuth app»): «App logo» (a round picture, optional), «App name», **«Snap redirect URIs»** («Enter one redirect URI per line. You can
    have up to 10 redirect URIs.»), buttons «Cancel» and «Create OAuth app» (off until the fields are filled). The redirect address entered was the site's own
    `/api/platforms/callback/snapchat`, and Snap kept it exactly.
  - **After creating**: a page with «App name», «Snap redirect URIs», **«Snap Client ID»**, and an orange warning «Please make sure you save your Snap client secret key below. It will not be available
    again.» with «Copy key» and «Snap client secret key: …», and the buttons «Marketing API documentation» and «Done».
  - **The secret was visible in the picture sent to the session.** It is in the chat and in the originals' folder of the session (outside the repository). Treat this OAuth app as the walk's own: before the
    department's real setup, make a new one (or remove this one in «Business details» and make it again), and never send a secret in a picture. The guide must say «غطِّ السر قبل أي لقطة».
  - **Next: the authorize page** (what Snap shows for this client ID before the allowlist, S8), then the request for access (S9).
- **Read from Snap on 2026-11-26 and worth keeping:** a client secret is shown once, at the creation of the app; creating an app needs the role «Organization Admin» and agreeing to the
  Snap Developer Terms and the Snap Business Tools Terms; the redirect address must match the app's exactly and is sent URL-encoded; no public address for the allowlist request is given
  on either page («contact your Snap point of contact», or «support»).

- **2026-11-26, S8 received and the build done.** The authorize page showed «Continue to Comms Hub?» and «This app will be able to access your: Public Profile APIs», then «Authorisation successful», before
  any allowlist. The connection, its guide and its pictures were built from the walk (`MVP_draft.md` 84, `progress.md`). Open: what Snap answers an app it has not allowed when the profile is asked, and
  the contact for the allowlist request.

## 6. What the API can post, read and delete, and the test built on it (2026-11-26)

Read again on 2026-11-26 from `developers.snap.com/marketing-api/Public-Profile-API/` (ProfileAssetManagement, Metrics, Profiles, GetStarted, FAQ). The owner asked for a «تجربة النشر» like the other platforms'; the contract
and the table of what Snap offers are in `Snapchat_Test_Plan.md`, the built section is `MVP_draft.md` 85. In short: Stories, Saved Stories and Spotlights can be posted; Saved Stories and Spotlights can be deleted and a Story cannot;
Stories, Saved Stories, Spotlights and the profile can be read, with views, viewers, shares, screenshots and subscribers (about a day late, 90 days back); all of it needs the client id allowlisted, so the test has met no real
answer. Not built: Saved Stories, picture Stories, links and captions on a post, group messages, partnership roles, earnings, files over one 32 MB part.

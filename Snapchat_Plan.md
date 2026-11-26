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

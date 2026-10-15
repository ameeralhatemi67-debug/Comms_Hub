# Platform connections: what the owner sets once

Written 2026-10-15 with step 6 of `Readiness_Audit.md` (section 6). The code and the database
are done and tested against a fake platform; the items below are the paperwork and the
dashboard settings that live at Meta and TikTok, which no agent can do. Until they are done,
connecting an account says «تطبيق المطوّر غير مضبوط» and the accounts stay simulated, exactly as
before. Nothing here makes publishing real: publishing is still a simulation, and every
screen says so.

The same steps are in the site, beside each platform app and each account section, as a circled "!" (`src/lib/setup-guides.ts`), so the people who need them follow them from the screen.

Facts below were read from each platform's own developer documentation on 2026-10-15 and
change often. `src/lib/platforms/oauth.ts` holds the Graph API version (`v26.0`) and the
scopes in one place each; check them against the documentation when you register the app.

## 0. The one question that decides the lead time (decision E-7)

Is there a **verified Meta Business account** for the department? Without it Meta will not
approve the publishing permissions for the app (App Review), and Facebook and Instagram stay
in the «نشر مساعد» path (the site prepares the post and the publisher posts it by hand). Write
the answer in «الإعدادات» ثم «المنصات», in the readiness note of Facebook and Instagram.

## 1. Meta app (Facebook Pages and Instagram, one app)

1. Meta for Developers, create an app of the business type, in the business portfolio of the
   department.
2. Add the product **Facebook Login** (the web flow).
3. Facebook Login settings, **Valid OAuth Redirect URIs**: add exactly
   `https://comms-hub-three.vercel.app/api/platforms/callback/meta`
   (and `http://127.0.0.1:3000/api/platforms/callback/meta` for local work). The address the site
   will use is shown in «الإعدادات» ثم «المنصات», under the app's card.
4. The sign-in asks for these permissions: `pages_show_list`, `pages_read_engagement`,
   `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`. While the app is in
   development mode they work only for people with a role on the app (administrator,
   developer, tester): add the people who will connect accounts. For everyone else, and for
   real publishing later, the app needs **App Review** and, for business assets, **business
   verification**. The weeks this takes are the long pole of the whole plan.
5. Facebook Pages: the person who connects must be able to manage the Page. Instagram: the
   account must be a professional account **linked to the Facebook Page**; otherwise it does
   not appear in the list.
6. App settings, basic: copy the **App ID** and the **App Secret**. Do not paste them anywhere
   but the form in step 4 below.

## 2. TikTok app

1. TikTok for Developers, create an app, add the products **Login Kit** and **Content Posting
   API** (Direct Post).
2. Login Kit, **Redirect URI**: add exactly
   `https://comms-hub-three.vercel.app/api/platforms/callback/tiktok`.
3. Scopes: `user.info.basic` (needed by the health check), `video.publish`, `video.upload`.
   The site asks for the scopes you list in its form; a scope the app has not been granted
   makes TikTok refuse the sign-in.
4. Until the app passes TikTok's **audit**, everything posted through it is restricted to
   private viewing and to accounts that are private: this is TikTok's rule, not the site's, and
   the card says it. Videos up to 10 minutes and 4 GB through the API; the creator's own limit
   can be lower.
5. Copy the **Client key** and the **Client secret**.

## 3. Snapchat and the WhatsApp channel and status

No official posting path is known for the department's use, so they are **manual tasks**:
the registry marks them «مهمة يدوية»; no sign-in button is offered; the send step shows the
exact text to paste and the files to upload (the publishing pack), and the publisher confirms
that it was posted. This is not a stopgap in the code: it is the finished path for these
platforms until an official one exists.

## 4. Entering the app in the site (once per app)

«الإعدادات» ثم «المنصات»: on the card of Facebook, Instagram or TikTok, the block
«تطبيق Meta» or «تطبيق TikTok». Enter the id and the secret and press «فحص وحفظ». The site first
asks the platform whether the pair is valid (a pair that does not match is refused and nothing
is stored), then stores the secret in Supabase Vault. It is never shown again; to change it,
enter a new pair. Needs the rights «إدارة المنصات وتطبيقاتها» and «إدخال أسرار التكاملات
وتجديدها» (the administrator's by default).

Then switch the platform on (Facebook and TikTok are added from «إضافة منصة» and start off).

## 5. Connecting an account

«الحسابات المرتبطة»: on the platform's section, «ربط عبر Meta» or «ربط عبر TikTok». The person
signs in at the platform itself, returns to the site, and chooses which pages or accounts to
connect and who publishes on them. What happens:

- the account's token goes straight into the vault; no page, URL or log ever holds it;
- the account's authorisation becomes the token's **real** expiry, so the existing rule
  "authorisation covers the moment" is true instead of simulated;
- an existing simulated account with the same handle is upgraded in place, so its works and
  approvals keep pointing at it;
- the account shows «ربط حقيقي», its state, and when the platform was last asked. The page
  asks the platforms about accounts not checked in the last half hour whenever someone opens
  it (the site still has no timer), and «فحص الاتصال» asks at once;
- when the platform says the token is no longer valid, the authorisation ends at once, the
  publishers are told once, and publishing to it fails honestly until it is connected again;
- «فصل» (hold to confirm) destroys the token and ends the authorisation. Removing the app from
  the person's own settings at the platform is separate.

## 6. What stays outside the code, and what to expect

- Facebook and Instagram long-lived tokens are about 60 days; the page tokens derived from them
  do not expire but the data access the app has does (about 90 days). The check shows the
  nearer of the two as the authorisation date and the account turns amber six days before it.
- TikTok access tokens last 24 hours and are renewed with the refresh token (valid about a
  year) by the same health check; nothing runs while no one has the channels page open.
- Rate limits: TikTok allows 6 requests a minute per user token on the posting endpoint; the
  health check makes one or two requests per account.
- No tester can connect an account for real until they hold a role on the Meta app (step 1.4).

# Readiness audit before adding testers

Audit of 2026-10-14, read from the code, the migrations, `progress.md` and the live
Supabase advisors. Nothing here was seen signed in: no agent can sign in (no bypass exists,
by rule), so "works" below means "built and tested", not "walked by a person".

## 1. The owner's list, checked

| # | Item | State today | What is missing |
|---|---|---|---|
| 1 | Storage: OneDrive and the NAS, in settings | Plan exists (`Settings_Integrations_Plan.md`), S0 and S1 built. The «التخزين» tab in settings is still a **static placeholder** ("no real storage"). Drive is the only provider; `media_files.drive_file_id` is hard-wired in 10 files. No `file_locations`, no provider interface, no move engine, no Supabase Storage or OneDrive code. | S2 (locations and provider interface), S3 (second provider and move engine), S8 (OneDrive), S7 (NAS, gated on the agent computer). |
| 2 | Add Snapchat, Facebook, TikTok | Platform list is fixed in the database: `check (platform in ('instagram','x','linkedin','youtube','mail'))` in five places, plus `work_variants`, `account_save`, `work_platform_ar`, and `Platform` in `src/lib/work/rules.ts`. | S5 platform registry first, then S6 platforms. Facebook, TikTok and Snapchat each need decisions the owner must make (section 3). |
| 3 | Auto-connect when details are entered | **Not built.** Linking an account is a simulation: "add account" stores a handle and sets `authorized_until = now + 60 days`. No OAuth, no token, no health check. The only real OAuth in the product is Google Drive. | Registry plus adapters (S5), per platform OAuth, tokens in Vault, a health check, honest states. |
| 4 | Preview of each post per platform, until sending | **Not built.** A platform copy exists as versioned text only. There is no rendered preview, no length or format check against a platform's limits, and no per-platform media validation. | A platform "accepts" definition (limits), a preview component per platform, shown on the work page, review screen and publish step. |
| 5a | Password recovery | Works through Supabase email. One screen, one message, no admin help. | See section 2. |
| 5b | Request to join | Works. Admin sees the request on «الحسابات». | See section 2. |
| 5c | Invite to the website | **Not an invite.** Adding an account only inserts a row; nothing is sent. The person must find the site, choose «أول دخول» and know to use that exact address. | See section 2. |
| 6 | First-visit helper and the other two levels | Built for 20 pages. Three steps per page, the same for every role. Six routes have **no help at all**. | See section 4. |

## 2. Account entry: what is weak

- **Email delivery is the main risk.** Sign-up confirmation and password reset go through
  Supabase's own mail sender, which has a very small hourly limit on the built-in service.
  Adding ten testers in one afternoon will hit it, and the screen says only "exceeded the
  limit". The site already owns a Gmail sender (`GMAIL_ADDRESS`, `GMAIL_APP_PASSWORD`).
  Pointing Supabase Auth at that SMTP account is a setting in the Supabase dashboard, owner
  action, and removes the limit for the testing phase.
- **No invitation.** Needed: an admin action «دعوة» that creates the account row and sends one
  email with the site address and the three steps. Resend from the member's card.
- **Admin cannot help a member.** No "send reset link", no "resend confirmation", no
  "this person has not signed in yet" marker on the members list.
- **`email_status` is open to anyone** (it is how «أول دخول» knows an address is approved), so
  an anonymous visitor can test which emails have accounts. Acceptable for a small team, but
  it contradicts the careful "same answer either way" on the reset screen. Fix by making the
  first-time screen send the confirmation without revealing status.
- **Leaked-password protection is off** (Supabase advisor, WARN). Dashboard switch.
- **Requests**: the admin is not notified when one arrives, the person is not told when it is
  approved or rejected, and a rejected person can submit again at once.
- **Recovery link**: the reset email lands on `/` and works only if the page is open in the
  same browser state; an expired link shows the generic error. A clear "link expired, send a
  new one" state is missing.

## 3. What was missed from the list

1. **Four settings tabs are still mock**: organisation, appearance defaults, publishing
   defaults, approval defaults, AI. They are labelled "visual", but testers will click them.
2. **«الأفكار», «التحليلات», «المراقبة» and «الإدارة» are still mock** (browser store, sample
   campaign). «الأفكار» creates a *mock* work and then sends the person to «العمل», which
   reads the database, so the idea never appears. This is a broken path, not just a stub.
3. **Delegation while away** is not built (owner decision of 2026-10-12). A director on
   leave blocks approval for testers.
4. **No email notifications** to members. Notices exist in the site and on WhatsApp for
   urgent messages; a tester who is not on the site hears nothing.
5. **No error monitoring or tester feedback channel.** When a tester hits a failure there is
   no report path and no server error log anyone reads.
6. **Backups are not configured.** The plan (S4) is not built, and the project's own
   database backup coverage is not confirmed. With real members and real work, this must be
   known before onboarding.
7. **No account removal data handling** for a person who leaves (their works, comments).
8. **Mobile walk-through** of the signed-in screens was never done by a person.
9. **The signed-in walkthroughs of Steps 3 to 5, P2 to P5a and S1 are all still open** in
   `progress.md`. Nothing built since 2026-10-12 has been seen by a human on the real site.
10. **Leftover decisions**: D-01 (default design), D-04, the Drive refresh token still lives
    in the environment, not in Vault (the vault holds 0 secrets today).

## 4. Help system, level by level

Levels in the code: the first-visit guide, tips on first click in a part, guide mode (first
click explains, second acts), and the page guide.

- Every page has the same 3-step tour regardless of role; a publisher and a writer see the
  same steps over different content.
- Tour steps skip silently when an element is absent (empty states), so a first visit to an
  empty page can show one step or none.
- No "what changed" re-tour after a page changes; progress is keyed by page only.
- Six routes have no entry: `/ideas`, `/analytics`, `/monitoring`, `/admin`, `/motion`,
  `/components`. The settings tabs added by Step S1 have help; the new storage and platform
  tabs will need it with each step.
- Guide mode and tips are hover and click based; they are not specified for touch, and the
  phone layout has not been walked.

## 5. Advisor snapshot (2026-10-14)

- Security: leaked-password protection disabled; 11 functions callable by `anon` (all by
  design: sign-in helpers, share links, WhatsApp bridge and server-key functions); 175
  security-definer functions callable by signed-in users (the product's API by design);
  5 tables with RLS and no policy (internal tables, no access, as intended).
- Performance: 5 foreign keys without a covering index (low), 17 unused indexes (no data yet),
  2 tables with two permissive read policies. None blocks testing.

## 6. Recommended order

0. Finish S1 evidence (done 2026-10-14: 57 of 57) and the Drive token adoption into Vault.
1. Entry flow (small, unblocks every tester): SMTP, invitation, admin help, request
   notices, clear expired-link state.
2. Honest «لم يُبنَ بعد» for the mock pages, and fix «الأفكار» to create a real work or hide it.
3. Settings storage tab made real, with S2 (locations, provider interface). No behaviour
   change for files.
4. Platform registry (S5): add, edit, delete; info tab; readiness tracker.
5. Post preview per platform with the limits, shown through to the send step.
6. Real OAuth connection and health, starting with Facebook and Instagram (one Meta app),
   then TikTok; Snapchat as a manual task.
7. S3 move engine with a second provider; then OneDrive (S8).
8. Help upgrade: role-aware tours, empty-state tours, touch behaviour, the missing pages.
9. NAS and the agent computer (S7) when they arrive.

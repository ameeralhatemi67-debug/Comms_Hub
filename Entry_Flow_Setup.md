# Entry flow: what the owner sets once

Written 2026-10-14 with step 1 of `Readiness_Audit.md` (section 6). The code and the
database are done; the items below are settings that live in the Supabase and Vercel
dashboards, which no agent can change. Do them before adding the first tester.

## 1. Send the sign-in emails from the site's own Gmail (the main one)

The confirmation link and the password-reset link are sent by Supabase Auth. Its built-in
sender allows only a handful of emails an hour, so ten testers in one afternoon will fail
with "exceeded the limit". Point it at the Gmail account the site already uses.

In the Supabase dashboard, project `comms-hub`: Authentication, then the Emails area, then
SMTP settings. Names move a little between dashboard versions; the fields are these:

| Field | Value |
|---|---|
| Enable custom SMTP | on |
| Sender email | the value of `GMAIL_ADDRESS` |
| Sender name | `مركز الاتصال` |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | the value of `GMAIL_ADDRESS` |
| Password | the value of `GMAIL_APP_PASSWORD` (the Google app password, not the account password) |

Then raise the hourly limit on the same page (the rate limit for emails sent), for example
to 60; it is only adjustable once custom SMTP is on. Gmail itself caps a normal account near
500 recipients a day, which is enough for the testing phase.

## 2. Site address and redirect addresses

Authentication, URL configuration:

- **Site URL:** `https://comms-hub-three.vercel.app`
- **Redirect URLs:** the same address, and `http://localhost:3000` for local work.

A link that returns to an address not on this list is refused, and the person lands on the
site with an error in the address. The site now shows that as «انتهت صلاحية الرابط» with a
way to ask for a new one, but the list should still be right.

## 3. Arabic email templates (optional, recommended)

Authentication, Emails, Templates. Paste these.

**Confirm sign up**, subject `تأكيد بريدك في مركز الاتصال`:

```html
<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.9">
  <p>مرحباً،</p>
  <p>افتح الرابط التالي لتأكيد بريدك وإتمام فتح حسابك في مركز الاتصال:</p>
  <p><a href="{{ .ConfirmationURL }}">تأكيد البريد</a></p>
  <p>الرابط يعمل مرة واحدة، ويُبطله كل رابط أحدث منه. إن لم تطلبه فتجاهل الرسالة.</p>
</div>
```

**Reset password**, subject `تعيين كلمة مرور جديدة لمركز الاتصال`:

```html
<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.9">
  <p>مرحباً،</p>
  <p>افتح الرابط التالي لاختيار كلمة مرور جديدة:</p>
  <p><a href="{{ .ConfirmationURL }}">كلمة مرور جديدة</a></p>
  <p>الرابط يعمل مرة واحدة، ويُبطله كل رابط أحدث منه. إن لم تطلبه فتجاهل الرسالة.</p>
</div>
```

## 4. Leaked-password protection

Authentication, the password security section: turn on the check against known leaked
passwords (the security advisor warns while it is off). It can require a paid plan; if the
switch is not available, the advisor warning stays and the ten-character minimum is the
only guard.

## 5. The address in invitations

The invitation email the site sends (the «دعوة» button) names the site address from the
server variable `MAIL_SITE_URL`, and falls back to the address the request came from. Make
sure `MAIL_SITE_URL` is set in Vercel to `https://comms-hub-three.vercel.app`; it is the same
variable the mail page uses for review links.

## 6. Walk it once, signed in as an administrator

1. «الحسابات»: «إضافة عضو» with a real second address of yours. Leave «أرسل دعوة إلى بريده
   الآن» ticked. The member's row now reads «لم يعيّن كلمة مرور بعد».
2. Check the second mailbox: one email from «مركز الاتصال» with the steps.
3. Follow it: «أول دخول», choose a password. The row reads «بانتظار فتح رابط التأكيد».
4. Open the confirmation link, sign in. The row's marker disappears.
5. Open an older confirmation link: the site says «انتهت صلاحية الرابط» and offers a new one.
6. On the member's card use «إرسال رابط كلمة مرور جديدة». «السجل» shows the invitation and the
   reset as lines.
7. From a signed-out window: «طلب وصول» with a third address. You get a notice in the bell
   and an email; refuse it, and that address gets a short refusal email.

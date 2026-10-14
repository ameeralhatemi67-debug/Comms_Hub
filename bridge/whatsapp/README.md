# Comms Hub WhatsApp bridge

The sender of `Permissions_Plan.md` section 8: a small Node program on a computer the owner
keeps on. It links the department's **system number** to WhatsApp Web by QR, then every five
seconds asks the site what is queued, sends each message to the number the database routed it
to, and reports back. It is the zero-cost method of the owner's Hedayah project (D-8), copied
and reduced from `D:\Agents\main\projects\hida\bridge` (that project is not touched).

## What it does and does not do

- **Pulls, never listens.** It calls one door of the site, `POST /api/whatsapp/dispatch`, with
  `WHATSAPP_SERVER_KEY`. The site never calls it, and this computer is never exposed to the
  internet. The timer is here, not in the site (D-7).
- **One way (D-6).** It registers no handler for incoming messages, calls or receipts, marks
  nothing as seen, and answers nothing. Replies on WhatsApp are not read; each message says so
  and links back to the conversation on the site.
- **Only claimed destinations.** It sends a row only to the number the site returned for that
  row in the same claim, once. Any other destination is refused (`policy.cjs`,
  `guardedSender`). Numbers are only those members proved on the site with a code.
- **Nothing is lost while it is off.** Rows wait on the site, the sender sees «لم تُسلَّم بعد»,
  and they go out when the bridge is back. A row claimed and never reported waits again five
  minutes later.
- **No secrets here.** `.env` (the site address and the key), the linked session (`.session`)
  and `node_modules` stay on this computer and are ignored by git. Logs carry row ids and
  reasons, never a number or a text.

The method is unofficial: WhatsApp may block it at any time. Use a dedicated number, keep the
volume low, and expect to link again occasionally (plan section 13).

## Files

| File | Holds |
|---|---|
| `bridge.cjs` | Start-up, QR in the terminal, the link's life, the five-second loop. |
| `loop.cjs` | One tick: report, heartbeat, claim, send through the guarded sender, report. |
| `policy.cjs` | Which rows may be sent, and the sender bound to one claimed batch. |
| `transport.cjs` | The one door of the site, safe error descriptions, Arabic reasons. |
| `provider.cjs` | `sendCode`, `sendMessage`, `status` over WhatsApp Web (the real `WhatsAppProvider`). |
| `compat.cjs` | The Hedayah bridge's reviewed transform for whatsapp-web.js 1.34.7 message keys. |
| `run-bridge.bat` | Installs the pinned packages once (without downloading a browser) and runs the bridge. |
| `*.test.cjs` | Offline tests against a fake site: `npm test` in this folder. |

## Owner walkthrough (needs the phone of the system number; not performed by the agent)

1. **Choose the number.** A dedicated WhatsApp number for the department, on a phone you keep.
2. **Make two secrets** in PowerShell on this computer (run the line twice; each prints 64
   hexadecimal characters):
   `$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | % { $_.ToString('x2') })`
   The first is `WHATSAPP_SERVER_KEY`, the second `WHATSAPP_LINK_SECRET`. Then print the first
   one's fingerprint (put the key between the quotes):
   `-join ([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes('PASTE-THE-KEY')) | % { $_.ToString('x2') })`
3. **Vercel:** add both secrets as environment variables of the `comms-hub` project
   (Production), and `MAIL_SITE_URL` if it is not set. Redeploy.
4. **Database:** in the Supabase SQL editor of `comms-hub`, store only the fingerprint, never
   the key (put the 64 characters from step 2 between the quotes):
   `insert into public.whatsapp_server_key (id, key_hash) values (1, 'PASTE-THE-FINGERPRINT') on conflict (id) do update set key_hash = excluded.key_hash;`
5. **This computer:** copy `bridge\whatsapp\.env.example` to `.env`; set `COMMS_SITE_URL` to the
   site address and `WHATSAPP_SERVER_KEY` to the first secret.
6. **Run** `bridge\whatsapp\run-bridge.bat`. The first run installs the pinned packages. A QR
   code appears in the window.
7. **Link:** on the system number's phone, WhatsApp, Linked devices, Link a device; scan the
   code. The window says «Linked».
8. **Switch it on:** as an administrator, «الإعدادات», «واتساب النظام», tick «تشغيل واتساب
   النظام». The status line turns «متصل» within a minute.
9. **Link your own number:** «الحساب», «واتساب», tick «استلام رسائل واتساب», enter your number,
   «إرسال الرمز». The code arrives on your phone from the system number within seconds; type
   it; the section shows your verified number.
10. **Test send:** «الإعدادات», «واتساب النظام», «رسالة تجربة إلى رقمي». It arrives.
11. **An urgent message:** have a second member link their number with «مهم» و«عاجل». In a group
    with them, send a message at «عاجل». It arrives on their WhatsApp with your name, the group,
    «عاجل», the text and a link; the link opens that conversation at that message after
    sign-in. Under your message: «واتساب: أُرسلت إلى 1».
12. **A push:** give yourself «إرسال رسالة إلى واتساب زميل» for a day from «الحسابات». On a
    message of yours, «إرسال إلى واتساب», pick the member. It arrives.
13. **One way:** reply to the system number from your phone. Nothing happens on the site, and
    nothing answers.
14. **Off:** close the bridge window and send another «عاجل». The sender sees «لم تُسلَّم بعد»;
    open the bridge again and it arrives.

Keep the computer on for delivery. To unlink, remove the device from the phone's Linked
devices, or delete `bridge\whatsapp\.session`.

# Owner handoff: what only you can do, in order, and what happens after each

Written 2026-10-15, after steps B1 to B8 of `Action_Plan.md`; updated the same day for B9 (the
Director connects everything from the site). Everything an agent could build or
check without your accounts, your hardware or a signed-in browser is built and recorded in
`progress.md`. What is left needs one of those three, so each item below says what you do, what
the agent does with the answer, and what evidence closes it.

No agent can sign in (there is no bypass and there must not be one), and none is given a secret:
you type secrets into the site's own screens.

---

## 0. The order that costs least

| # | Item | Why now | Time on your side |
|---|---|---|---|
| 1 | Signed-in walkthrough (section 2) | Nothing built since 2026-10-12 has been seen by a person; this is the cheapest way to find what is wrong | 30 to 45 minutes |
| 2 | Supabase Auth SMTP (section 1.1) | Without it a tester's confirmation and reset emails hit a small hourly limit | 10 minutes |
| 2b | In the site, as the Director, «الإعدادات» ثم «الاتصالات» (section 1.0) | Mail, the Google app (YouTube and Drive), Drive, then «المنصات» for LinkedIn, X, Meta, TikTok, then «واتساب النظام» | each has a circled "!" with the steps and the links |
| 3 | Second storage provider and a first small move (1.3) | The backup system and the move engine have never met a real provider | 30 minutes |
| 4 | Meta and TikTok apps (1.2) | The long pole: App Review takes weeks, so start early even if publishing is far | an afternoon, then waiting |
| 5 | OneDrive: enter the Microsoft app, connect the account (1.4) | Only if you want OneDrive | 15 minutes |
| 6 | Agent computer and NAS (section 3) | When the hardware exists | n/a |

---

## 1. Outside the site

### 1.0 What the Director enters in the site (nothing is typed into a server setting)

The Director holds the rights by default (the assistant does not; the administrator holds everything).
Each value is checked with its own service, kept in the vault, and never shown again. The circled "!"
beside each block opens the steps with the links to the platform's own pages.

| Where | What | Needs from the platform's side |
|---|---|---|
| «الإعدادات» ثم «الاتصالات» | Shared mailbox: address and app password | 2-step verification and an app password on the Gmail account |
| «الإعدادات» ثم «الاتصالات» | Google app: client ID and secret (serves YouTube and Drive) | A project in Google Cloud with the two APIs on |
| «الإعدادات» ثم «الاتصالات» | Connect Google Drive (the button) | The Google app above |
| «الإعدادات» ثم «المنصات»، بطاقة كل منصة | Meta, TikTok, LinkedIn, X: app id and secret | An app in each developer console |
| «حسابات المنصات» | Connect each account: «ربط عبر ...», sign in on the platform's page, choose | The app above, and the platform's approval before publishing is real |
| «الإعدادات» ثم «واتساب النظام» | Make the bridge key, shown once | A computer that stays on, with the phone of the number |

What no form can do: create the developer app in the platform's console (a person with the
platform's account must), pass a platform's app review (weeks, on their side), or scan the WhatsApp
code on the phone. Publishing stays a simulation until each platform's adapter exists.

### 1.1 Send sign-in emails from the site's Gmail

Steps: `Entry_Flow_Setup.md` sections 1 to 5, in the Supabase dashboard (SMTP settings, the site
address and the redirect addresses, the Arabic templates, leaked-password protection).
**Closes when:** you invite a second address from «الحسابات» and the person receives one email
with the site address, and «نسيت كلمة المرور» sends a link that opens the reset screen.
**Agent then:** records the result in `progress.md`; nothing to build.

### 1.2 Meta and TikTok apps

Steps: `Platform_Connections_Setup.md`. The question that decides the lead time is in its section 0:
**does a verified Meta Business account exist?** Without it Facebook and Instagram cannot publish
for real, and App Review does not start.
**Closes when:** the ids and secrets are in «الإعدادات» ثم «المنصات» (entered by you), and a
publisher presses «ربط» on «حسابات المنصات» and returns from the platform's own sign-in with a
connected account and a real expiry date.
**Agent then:** reads the account's health record (not the token), fixes what the first real
response shows (everything so far was tested against a fake platform), and records it.

### 1.3 A second storage provider and a first small move

Steps: `Storage_Provider_Setup.md` (create the bucket and key pair, connect it in
«الإعدادات» ثم «التخزين», press «احسب الخطة», move one small folder, verify).
**Closes when:** the report of the move shows every file «تحقق» by checksum, and a backup run
(«النسخ الاحتياطي» ثم «ابدأ») ends «محقَّق».
**Agent then:** records the numbers; fixes what a real S3-compatible service does differently
from the fake the engine was tested against.

### 1.4 OneDrive

**Built on 2026-10-15 (Action_Plan.md B10), and not yet tried against a real Microsoft account.**
The engine hashes what it sends with quickXorHash (the only hash Microsoft guarantees for both
personal and work accounts), compares it with the one OneDrive reports, and calls a file proven
only when they match. Upload sessions use ranges of 320 KiB multiples; the refresh token is
replaced in the vault each time Microsoft rotates it. It was driven against a fake that answers as
Microsoft's documentation says; the first real move is the real test.

**What you do (the Director, from the site):**
1. «الإعدادات» ثم «الاتصالات»: open the «!» next to «تطبيق Microsoft». It walks the Entra app
   registration (account types, the return address to copy
   `{site}/api/onedrive/callback`, the delegated permissions `Files.ReadWrite`, `offline_access`
   and `User.Read`, a client secret). Enter the application (client) id and the secret value.
2. In the OneDrive block press «ربط OneDrive» and sign in with the department's Microsoft
   account; allow the permissions. The files go in a folder «Comms Hub» that the site makes.
3. Press «فحص الاتصال». Then, in «التخزين», plan a small move to it (a few files first).
**Closes when:** the check shows the account and the quota, and the move report shows the files
«تحقق» at the checksum level.
**Agent then:** records the numbers, and fixes what a real OneDrive does differently from the fake.
Limits to know: the secret you create expires (up to 24 months; the site shows the tail only and
the connection fails with a plain message when it does); the folder is kept by behaviour, since
`Files.ReadWrite` is not folder-scoped; library and mail uploads still go to Google Drive: OneDrive
is a second home for moves and backups.

---

## 2. The signed-in walkthrough (as the administrator)

You have three accounts, all administrators. Use «عرض بصفة» in the top bar to see each role.
Report anything that differs from the "should" column, with the page and what you saw.

### 2.1 Shell and menu (B1, B4, B4b)

| Do | Should |
|---|---|
| Look at the sidebar | 16 entries as administrator: الرئيسية، العمل، الموافقات والنشر، التقويم، المشاريع، الطلبات، مكتبة الوسائط، المهام، سجل النشاط، التحليلات، استوديو الحركة، البريد، حسابات المنصات، الأفكار، الحسابات، الإعدادات. No «الإدارة», no «المراقبة», no «الحساب» in the list |
| Click your name at the foot of the sidebar | Opens «الحساب»; the sign-out arrow beside it signs out |
| Collapse the sidebar (the panel icon) | The round name badge stays and still opens «الحساب» |
| Type `/admin` in the address bar | Lands on «الحسابات» |
| Type `/monitoring` | Lands on «سجل النشاط» |
| «عرض بصفة» then each role | The number of entries: مدير الاتصال 17, المساعد 17, الكاتب 16, المصمم 16, المنتج 16, مسؤول النشر 15 (no «إنشاء»), عضو 16 |
| In every page | The header's small line says today's real date (not 21 سبتمبر) |

### 2.2 «سجل النشاط» (B2)

| Do | Should |
|---|---|
| Open it as administrator | A «الفريق» panel above the filters: each member, role, last action, week's actions, open and late tasks |
| Press a member's name | The log shows only that person's actions; press again to clear |
| «عرض بصفة» as كاتب المحتوى | No team panel; the log shows only that person's actions |

### 2.3 «الإعدادات» and «الحساب» (B3, B4b)

| Do | Should |
|---|---|
| Open «الإعدادات» | Six tabs only: عام وصحة النظام، التخزين، النسخ الاحتياطي، المنصات، واتساب النظام، السجل |
| Open «الحساب» | A «المظهر» panel with the design and the mode (light and dark); the choices persist after a reload |
| «الحسابات» then add or edit a member of a writer role | The default page list does not include «الإعدادات» |

### 2.4 «التحليلات», search and messaging (B5, B8)

| Do | Should |
|---|---|
| Open «التحليلات» with no works | «لا أعمال بعد» |
| Create two works in «إنشاء», send one to review | The tiles and the status bars follow; «بانتظار المراجعة» = 1; the platforms table lists the department's accounts |
| Press the search box, type part of a work's title, then its number (CH-...) | Both find it; clicking opens that work |
| «البريد» ثم «المراسلة»: create a group and open «ربطها بـ» | The list is the works that exist, not CH-241 and the sample ones |
| Open an existing room that was linked to a campaign | A plain «حملة» strip without a date |

### 2.5 Help (B7)

| Do | Should |
|---|---|
| Open «الإعدادات», «الحسابات», «حسابات المنصات», «سجل النشاط», «الحساب» and «التحليلات» for the first time after the change | Each shows one short «جديد في» card (if you saw its guide before) or the normal tour |

---

## 3. Part D: the agent computer and the NAS

Nothing can start before the hardware exists. When it does:

1. **You:** provide the computer, keep it on, and (for the NAS) its address and a share with a
   user that may write. The agent will give you the install steps for the bridge (the pattern is
   the WhatsApp bridge in `bridge/whatsapp/`: a program that polls the site; the site gets no
   inbound connection and no new secret beyond one server key whose hash alone is stored).
2. **Agent builds:** the NAS provider behind the same storage interface, scheduled backups (a job
   the bridge claims and runs), unattended move plans, timed retries (idea I-024), the database
   dump runbook. Design: `Settings_Integrations_Plan.md` sections 6 to 9 and `disscussios/storage_lifecycle_disaster_recovery.md`.
3. **Closes when:** a scheduled backup ran with the page closed, and its verification line says so.

---

## 4. What to send back

For each walkthrough row that did not behave as written: the page, what you did, what you saw (a
screenshot helps), and your role. For each outside item: only that it is done, never a secret. The
agent turns each report into a fix or a recorded decision in `progress.md`.

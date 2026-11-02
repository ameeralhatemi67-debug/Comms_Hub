# «إنشاء» access and reversing a work: plan

Written 2026-11-02 from the owner's request, after reading the code and the live database. Nothing here is built yet.

## Decisions taken

| # | Decision |
|---|---|
| 1 | «المصمم» and «عضو» start without «إنشاء». |
| 2 | The Admin or the Director can give it to a whole role or to one person. A person's own switch overrides the role's. |
| 3 | A member without the page has no way to ask for a work inside the site. Accepted: they message someone, or are given access. This replaces the decision of 2026-10-15 (B4b, «The member creates»). |
| 4 | The creator can cancel a work within the hour if nobody else has touched it. It closes with a stated reason and is not deleted. |
| 5 | The return button skips an action it cannot undo, so it no longer gets stuck. |

## Traps found while reading

- **`roles[...].create` must not change.** It also decides who may upload files (`canUpload`, `src/lib/drive/media.ts:82`, with a matching list in SQL). Setting it to false for the designer would stop designers uploading. It stays as "this role may ever create", and a new default sits beside it.
- **The page is a positive list per person.** `accounts.pages` has no way to say "the role has it but this person does not", so a whole-role switch with a personal override cannot sit on it.
- **The database does not check the page.** `work_create` refuses only the publisher, so hiding the page alone is not a lock.
- **The assistant can give it.** They hold `permissions.grant`, and `perm_may_decide` lets them approve a request for it.
- **Ten places offer creating,** most gated on `roles[role].create` or `canCreateWork`, not on the page. See A4.

## Part A: who holds «إنشاء»

### A1. The model

Move `page.create` from the page list to the ordinary capability model, which already has everything needed: a role template, a person's override, a temporary grant, a log, and the switches in «الأدوار».

- `capabilities`: `page.create` changes from `scope_kind = 'page'` to `'none'`. Its key stays, so the session still turns it into the page (`session.ts` reads `page.*` from `my_capabilities`).
- `role_capabilities`: allowed for admin, director, assistant, writer and producer. Off for designer and member. The publisher stays refused by the existing fixed rule.
- `accounts.pages`: `create` is removed from every account, and from what `assign_role`, adding a member and `perm_pages_ok` accept. A leftover entry would defeat a personal "off".
- `perm_eval` needs no change: the template path, the override and the fixed rule already apply.
- Keep refusing a one-time grant for it: `grant_capability` and `request_capability` guard that by `scope_kind = 'page'` today, so they need the key named.
- `src/lib/permissions.ts`: the catalog entry, `TEMPLATE_HOLDS`, and removing the special case in `roleChange`.
- `src/lib/access.ts`: `defaultPages` and `grantablePages` lose `create`. `canOpen` asks the capability, still refusing a role that can never create.

Live data on 2026-11-02: 3 admins, 1 director, 1 producer, no designer and no member. Nobody loses or gains anything. The director and the producer keep the page through the template.

### A2. Who may give it

Only the Admin and the Director.

- A new check for `page.create` in `grant_capability`, `set_member_override`, `revoke_capability` and `set_role_default`, refusing any other role.
- `perm_may_decide` and `perm_granters`: a request for it goes to the Admin and the Director only.
- `switchWhy` and `editWhy` say the same in the interface.

A designer or member can still ask through «اطلب صلاحية» on «الحساب».

### A3. The database as the lock

`work_create` starts with `has_capability('page.create')`, refusing with `CREATE_DENIED`, in Arabic in `src/lib/work/rules.ts`. `project_create` goes through it, so a leader whose page was removed cannot plan works either.

### A4. The interface

- One rule for every place below: `useCanCreate()`, reading the capability. It replaces `roles[role].create` and `canCreateWork` for this purpose.
- Places: `shell.tsx` (bottom bar), `home.tsx` (two), `work/list.tsx` (two), `work/create.tsx` (the gate), `mail/mail-page.tsx` («إنشاء عمل» from a message), `work/requests.tsx`, `work/day-dialogs.tsx` (two), `work/projects.tsx`, `ideas.tsx` («تحويل إلى عمل»).
- `/create` opened directly by someone without it: a clear page with «اطلب هذه الصلاحية», as other locked places have.
- «الأدوار»: the row becomes a real switch, with the existing long press and warning for a whole role. The note above the pages group changes to match.
- `accounts/members.tsx`: the «إنشاء» tick goes from «إضافة عضو», because the role decides it now.
- An administrator using «عرض بصفة»: «إنشاء» follows the role's switch as read live. If the role table is not readable there, it falls back to the installed default, and that limit is recorded.

### A5. Words and documents

`MVP_draft.md` line 723 and the bullet at line 743 change, and a new section 70 records the decisions. `src/lib/access-matrix.ts` regenerates the access table. Help text in `src/lib/help/pages.ts` for «الأدوار», `create` and the member's pages. `AGENTS.md` gets a short paragraph.

## Part B: «إلغاء العمل»

### B1. What it does

A new function `work_cancel(p_work)`:

- **Who:** only `created_by`, whatever their role.
- **When:** within 60 minutes of creation, the same window as the return button.
- **State:** open, and still «مسودة» or «قيد الإنتاج», so never sent for review.
- **Untouched:** no one else in `work_log`, `work_comments`, `work_texts`, `work_variants` or the writing documents. Comments are not in the log, so they are checked directly. Automatic entries by `system` do not count.
- **Effect:** the work closes with the reason «أُلغي بعد إنشائه», logged as `cancel`. It stays in «المغلقة», its number is not reused, and a leader can reopen it with the existing `work_reopen`.
- **Who is told:** the assignee and the stage holders, for a work; the leaders, for a request. All through «للعلم».
- **What it frees:** an idea that became this work (`ideas.work_id`) is cleared, so the idea can be used again.
- **What stays:** a mail thread's link and a project's link stay as history, pointing at a closed work.

### B2. The interface

- A new action in `actionsFor` (`src/lib/work/rules.ts`), shown to the creator while the conditions hold, with a long press and a reason in `hold-reasons.ts`.
- `src/components/work/item.tsx` handles it. The database decides, so a late click gets a plain answer in Arabic.
- It is not added to the top-bar return button. That button stays the library's, and its tooltip keeps saying so.

### B3. To settle while building

The leaders' «يحتاج قرارك» notice about a request has no work id in its `go`. I will check how it clears when a request is assigned, and clear it the same way on cancelling, so nobody is asked to decide on a cancelled request.

## Part C: the return button

- A pure function `undoTarget(items)` in `src/lib/kit/undo.ts` picks the newest action marked `ok`.
- `undo()` in `src/components/kit.tsx` refreshes the list before choosing, because the list only refreshes after a library change. This also clears an action older than the hour.
- The count and the tooltip show only what can really be undone. If nothing can, the button says why.
- This needs no migration.

## Order of work

1. Commit this plan as the baseline.
2. Part C, because it stands alone and has no database change.
3. Part A: migration, rules, then the interface.
4. Part B: migration, rules, then the interface.
5. Documents, then the checks below.
6. Stop and ask before anything touches comms-hub or is pushed.

Deployment order is the same as last time: migrations first, then the push. The live site keeps working on the migrations, because `my_capabilities` still gives it the page.

## Checks

- `npm run typecheck`, `npm run build`, `npm test`.
- `tests/access-matrix.test.mjs`, `tests/access.test.mjs` and `tests/permissions.test.mjs` change, because they state that the member and the designer create. New tests hold the TypeScript and SQL lists equal.
- New `supabase/tests/create_access_rules.sql`: defaults per role, the whole role, one person, off for one person while the role is on, the assistant refused, `work_create` refused, the publisher still refused, uploads unchanged.
- New `supabase/tests/work_cancel_rules.sql`: the creator, someone else, after the hour, after sending, after someone else acted, the notices, the idea freed, a leader reopening.
- Existing `work_rules`, `permissions_rules`, `permission_requests_rules`, `planning_rules` and `approval_rules`, because they create works as these roles. Any that assumed the old default change with it.
- On a private container first, using only `@t.test` rows, then a rolled-back run on comms-hub.
- New `qa/create-access-flow.cjs` on a fixture: every place in A4 with and without the permission, and the «الأدوار» switch. `qa/permissions-pages.cjs` and `qa/work-pages.cjs` rerun.
- After deployment, the live signed-out checks, and a signed-in walk by the owner.

## What this does not do

- It does not make the return button undo work actions in general. «إلغاء العمل» is the one way out of «إنشاء», and only in its first hour.
- It does not let a member ask for a work without the page.
- It does not delete a work.

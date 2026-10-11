<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# Comms Hub — project working rules

These rules are binding for every agent and contributor working in this
repository. They previously lived only in `Roadmap.md`; this section is the
agent-facing copy. `CLAUDE.md` is auto-generated as `@AGENTS.md`, so do not
edit it: put project rules here.

## Documents and their owners

| File | Holds | Update when |
|---|---|---|
| `Roadmap.md` | Planned direction, work hierarchy, exit gates. | At milestone boundaries and scope changes. |
| `Status.md` | Present condition, active focus, next action. | At the end of every work session. |
| `progress.md` | Dated, verified outcomes and evidence. | Whenever a meaningful change is completed and verified. |
| `MVP_draft.md` | Authoritative UI shell, page specs, user flows. | When interface requirements change. |

`MVP_draft.md` is the authority for the prototype. When code and
`MVP_draft.md` disagree, the specification wins unless a dated entry in
`progress.md` records an explicit, reasoned deviation.

## Do not edit `disscussios/`

The eleven architecture documents under `disscussios/` are the institutional
specification record. Read them freely and cite them; never edit, reformat,
rename or delete them. This follows the Zero Data Loss principle in
`Roadmap.md`. The same applies to `discussions_list.md`, their index.

Cite them by name when a decision rests on one, for example
`disscussios/approval_policy_design.md` for version-bound approval, or
`disscussios/notification_model.md` for the three-tier attention model.

## Arabic terminology

The product interface is Arabic, right to left. Preserve the established
terms exactly; do not re-translate or "improve" them.

- Roles: مدير الاتصال المؤسسي، مساعد مدير الاتصال المؤسسي، كاتب المحتوى،
  المصمم، المنتج الإعلامي، مسؤول النشر وإدارة الحسابات، عضو، Admin.
- Statuses: مسودة، قيد الإنتاج، قيد المراجعة، بحاجة إلى تعديل، مرفوض،
  جاهز للنشر، مجدول، جارٍ النشر، منشور، نشر جزئي، فشل النشر.
- The internal status vocabulary stays English in code (`IN_REVIEW`,
  `CHANGES_REQUESTED`, …) and Arabic in the interface, per `MVP_draft.md`
  section 49. Never expose a raw status or role key to the user.

New user-facing strings are written in Arabic. Existing Arabic strings are
preserved verbatim when refactoring.

## Zero emoji

No emoji anywhere: source, interface copy, documentation, commit messages.
This is a standing directive for enterprise readability. Use words, or the
existing `lucide-react` icon set in the interface.

## Evidence over assertion

A change is not done because it was written. Before claiming a task complete:

- `npm run typecheck` and `npm run build` pass.
- `npm test` passes.
- Anything that changes rendered output is checked in a real browser, and the
  check is saved under `qa/` as a re-runnable script plus its JSON result.

Record what was actually run, with numbers, in `progress.md`. If something was
skipped or failed, say so there. Do not describe intended behaviour as
verified behaviour.

## Recoverable baselines

Commit a clean baseline before any significant file mutation. Never silently
overwrite or discard uncommitted work. Local commits only unless a push is
explicitly requested.

## Prototype boundary (Version 0)

Work data (items, approvals, publications, notices) is local mock state, held
in each browser. No real publishing, mail delivery, AI or background workers.
Files are the second exception, by owner directive of 2026-10-11: uploads go
to Google Drive (the connected Gmail account, `drive.file` scope, folder
«Comms Hub») and are listed in the `media_files` table; the Drive client
secret and refresh token are server-only environment variables. Where a page would need one of these, render the shell and
say plainly in the interface that it is a simulation.

One deliberate exception, by owner directive of 2026-10-11 (recorded in
`progress.md`): **accounts are real.** Sign-in with email and password,
approved accounts, access requests, roles and page permissions live in the
Supabase project `comms-hub` (`supabase/migrations/`), enforced by row level
security. The role switch («عرض بصفة») belongs to administrators only. Rules for
who may open what are in `src/lib/access.ts` and are tested. Never add a
sign-in bypass, stub session or hard-coded credential, not even for tests. A
service_role key never goes in this repository.

## Writing markdown from a shell

Write markdown with a file-write tool, a heredoc, or a single-quoted
PowerShell here-string. Never a double-quoted PowerShell string: backtick
sequences such as `` `n `` are consumed as escapes and silently corrupt the
file. Three lines of `progress.md` were damaged this way and had to be
repaired.

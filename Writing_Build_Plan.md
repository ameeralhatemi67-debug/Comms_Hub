# «ورقة الكتابة» and the writing documents: build plan

Owner directive of 2026-11-02: build the approved artifact «كاتب المحتوى في المركز» and the document storage, "with your
edits and suggestions", then commit, push and deploy. This file is the contract between the pieces. `MVP_draft.md` section
68 holds the behaviour once built, and `progress.md` the evidence.

## Decisions taken

| # | Decision | Why |
|---|---|---|
| W-1 | The master of a written text is the site's own format, a checked JSON document, one file per saved version in Drive. | Word cannot hold everything the sheet does, and JSON can be checked on the server and rendered without injecting HTML. |
| W-2 | The database keeps the version record: number, author, note, Drive reference, checksum, and a plain-text copy. | Approval, comparison, search and the review screen must work without reading Drive, and keep working when Drive is down. |
| W-3 | Platform copies stay in the database, as plain text. | The database checks their limits before scheduling and publishing, and platforms take no formatting. |
| W-4 | Documents are not `media_files` rows. They sit beside the library in Drive and join the same machinery through `file_locations` (`subject_kind = 'work_doc'`), so moves, serving, checks and backups cover them. | A library file has its own stages, approval and folder grants; the approved rule is "the same rule as seeing the work". The library shows a fixed entry that opens them. |
| W-5 | Who may read: whoever may see the work (`work_can_see`). Who may write: `work_text_writer`. | See below. |
| W-6 | Keep the last N versions (default 10, 3 to 50, in «الإعدادات»), plus every version sent for review or approved. Pruning happens at save, moves the file to Drive's trash, and keeps the record and its plain-text copy. | Approval must never point at nothing, and the site has no scheduled jobs. |
| W-7 | Drafts are private. The browser keeps them every few seconds; a private Drive file holds them about once a minute and on closing. | A draft is not a version, and Drive must not be written on every keystroke. |
| W-8 | «الحالي» always holds the latest Word, PDF and text files. Earlier versions are regenerated from their master on request. | No third copy of everything. |
| W-9 | PDF comes from Drive's own conversion of the Word file (`files.export`, 10 MB limit). | pdf-lib has no layout engine for free documents. |
| W-10 | Word: download and re-upload (level 1), and import into the sheet (level 2, loses fonts, sizes, colours and table borders). Editing a Word file inside the site (level 3) is not built. | Level 3 failed the checks in the owner's review: a paid licence, and partial Arabic joining. |
| W-11 | The editor is Tiptap 3 (ProseMirror, MIT). | Real undo, a schema that cleans whatever is pasted, and true row and column selection in tables. |

## Who may write (the deviation from the reference)

`work_text_writer(work, person)` is true for: a leader; the work's «المسؤول»; and a person holding a stage whose role is
`writer` on that work. The third kind may save the main text and copies only while the status is `DRAFT`, `IN_PRODUCTION`,
`CHANGES_REQUESTED` or `REJECTED`. After approval, editing stays with «المسؤول» and the leaders. Sending for review stays with
«المسؤول» and the leaders; a stage writer «يسلّم» (`work_stage_done`). Approval and publishing do not change. This departs from
the reference and needs its dated entry in `progress.md`.

## Database: `supabase/migrations/20261102120000_writing_documents.sql`

Written and tested on the private container (`qa/activity-rules-local.cjs`), rules in `supabase/tests/writing_rules.sql`.
Every write is a function. Security definer functions set `search_path = ''`, revoke from `public, anon`, one grant per
statement (a test greps them).

- `work_texts`: body limit up to 200000; new `id uuid`, `master_ref`, `master_size`, `checksum`, `keep boolean`, `pruned_at`.
- `works.research` (up to 8000) and `work_research_save(p_work, p_text)`.
- `work_cycles.text_n`, set by a trigger; a trigger marks `work_texts.keep` when a version is sent or approved.
- `work_docs(work_id pk, folder_ref, current_ref, versions_ref, drafts_ref, images_ref, word_ref, word_n, pdf_ref, pdf_n, text_ref)`.
- `work_drafts(work_id, email, ref, updated_at)`, own rows only.
- `work_notes(id, work_id, cycle, part, quote, body, author, created_at, resolved_at, resolved_by)`; `work_note_add`,
  `work_note_resolve`. Deciders add, writers resolve.
- `work_images(id, work_id, ref, name, size_bytes, mime_type, added_by)`: pictures from the device; `file_locations` too.
- `ideas(id, body, tag, author, work_id, created_at)` with `idea_add`, `idea_remove`, `idea_to_work`. Own and leaders'.
- `writing_phrases(id, title, doc jsonb, created_by)`, with `phrase_add`, `phrase_remove` for leaders.
- `site_settings.writing_keep int default 10 check 3..50`, `writing_keep_set(p_n)` needs `settings.manage`.
- `file_locations` and `storage_move_items`: `subject_kind` gains `'work_doc'`; triggers as for `media_versions`.
- `work_text_writer`, `work_writers(work)`; `work_text_save` patched to the rule above and kept for copies.
- `work_doc_commit(p_key, p_work, p_body, p_note, p_master_ref, p_size, p_checksum)`: proves the server with `mail_key_ok`,
  applies the rule, `NO_CHANGE` on an equal checksum, inserts the version, logs, reopens after approval, prunes, and returns
  `{n, reopened, prune: [refs]}`.
- `work_doc_folders`, `work_doc_export` (server key): record folder and export references.
- `work_withdraw(p_work)`: the sender or a leader, while in review and before any decision in this cycle.
- `work_set_channels(p_work, p_channels)`: «المسؤول» or a leader, before sending.
- `work_ask_opinion(p_work, p_to, p_body)`: a comment plus a notice at «يحتاج انتباهك».
- `work_decide`, `work_finish_if_done` and the publishing notice patched by text, so a writer-stage holder is told too.
- `work_text_search(p_q)`: latest text and copies of works the person may see, with a short snippet.

## Server routes (`src/app/api/writing/`), all through `guard(request, { page: 'work', mutating })`

| Route | Does |
|---|---|
| `POST [id]/save` | `{ doc, note }`: validate, upload the master to `الإصدارات`, write the text file to `الحالي`, commit, trash pruned files. |
| `GET [id]/doc?n=` | The master of a version, for anyone who may see the work (RLS on `work_texts`). |
| `GET, PUT [id]/draft` | The person's own draft file. |
| `POST [id]/export` | Word bytes from the browser into `الحالي`. |
| `POST [id]/pdf` | Converts the Word file through Drive into `الحالي`. |
| `GET [id]/file?kind=docx,pdf,txt` | Streams a current file, `Content-Disposition: attachment`. |
| `POST [id]/image`, `GET [id]/image/[imageId]` | Pictures from the device, 5 MB, image types only, never SVG. |

The Drive folders are `Comms Hub/مستندات الكتابة/<CH-10 العنوان>/{الحالي,الإصدارات,مسودات,صور}`. The site tracks ids, never
names. New provider calls (`createFolder`, `putSmall`, `update`, `convertToPdf`) go on the storage provider, and the routes
ask for the `library` role. Nothing about people or text goes in a log.

## Pure modules (`src/lib/writing/`, all tested with `node --test`)

`doc.ts` the document, its check, plain text and table designs. `style.ts` fixed style rules. `docx.ts` Word export.
`shortcuts.ts` the key table. `flow.ts` what waits for a writer and what a review compares. `rules` additions in
`src/lib/work/rules.ts`. Word import is mammoth, called from the sheet.

## Interface (`src/components/writing/`)

`sheet.tsx` is «ورقة الكتابة» on the shared `Sheet`, loaded only when it opens. `extensions.ts` Tiptap and this document's nodes.
`ribbon.tsx` the tools: tabs «ملف», «الرئيسية», «إدراج», «عرض», and «الجدول» and «الصورة» that appear by themselves, at a fixed
height so the text never jumps. `table-handles.tsx` the row and column handles, `table-ops.ts` fills, lines and transparency that
apply to the selected cells. `side.tsx` «الموجز», «الملاحظات», «الإصدارات», «العبارات», «الفحص». `cards.tsx` the small dialogs.
`text-search.tsx` Ctrl+/ on any page. `doc-view.tsx` read-only rendering with no injected HTML. Styles in `src/app/writing.css`.

Pages: `home.tsx` tiles and the resume card; `list.tsx` the «الكتابة» and «المستندات» tabs; `item.tsx` opens the sheet in place of
`TextDialog`; `review.tsx` comparison in every round, a note per part and on a sentence; `ideas.tsx` real ideas; `settings`
the version limit; library a fixed «مستندات الكتابة» entry.

## Limits stated plainly

Publishing stays a simulation. No AI, no scheduled job. Word editing inside the site is not built. Signed-in screens can only be
checked on fixtures here, and Drive's PDF conversion needs a real Arabic file to prove it.

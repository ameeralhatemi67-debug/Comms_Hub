# Second storage provider and the first move: owner steps

For Settings Step S3 (`Settings_Integrations_Plan.md` 6.3). The site can write to an S3-compatible
store, and move files to it and back, but nothing has met a real store yet. Do this once, with a
small folder first.

The same steps are in the site: the circled "!" in the provider form and in the move panel (`src/lib/setup-guides.ts`).

## 1. Create the store (outside the site)

Pick one. The site needs: the S3 address, a bucket (empty, private), the region, and a key pair
that may list, read, write and delete in that bucket only.

- **Supabase Storage** (the existing `comms-hub` project works): Storage, create a private bucket;
  Storage settings, S3 connection: copy the endpoint (`https://<project-ref>.storage.supabase.co/storage/v1/s3`)
  and the region, and create an access key. These keys bypass row level security: use a bucket the
  Hub alone writes to. The project plan sets the largest file it accepts.
- **Backblaze B2**: a bucket, and an application key restricted to it. Address `https://s3.<region>.backblazeb2.com`.
- **Cloudflare R2**: a bucket and an API token for it. Address `https://<account-id>.r2.cloudflarestorage.com`, region `auto`.

The address of each is taken from the provider's documentation as of 2026-10-15; the form checks
it (https only, no IP address or internal name).

## 2. Connect it (as the administrator)

«الإعدادات» then «التخزين», «إضافة مزود تخزين»: choose the kind, a name, the address, the bucket,
the region, a prefix if the bucket is shared, and the key pair. Saving writes a small test file,
reads it back and deletes it; only if that works is the key stored in the vault. It is never shown
again, only its last four characters. «فحص الاتصال» repeats the test whenever you want.

## 3. First move (small)

«نقل الملفات بين المزودين»: from Google Drive to the new provider, one folder with a few files,
«نقل», hold 14 days. «احسب الخطة» copies nothing: read the report (files, size, room, what cannot
move). «ابدأ النقل» runs from the open page; keep it open. When it completes, open one of those
files in the library and play it: it is served from the new provider with the same link. «تحقق من
عينة» checks copies at both providers. Then try the way back: a plan from the new provider to Drive
for the same folder finds the held Drive copies and switches without copying.

## 4. Retiring the old copies

Only after the hold: «أحل نسخ المصدر إلى التقاعد» (a long press) sends the held Drive copies to the
Drive trash, where Drive keeps them for 30 days. Nothing is deleted for good by the site.

## What to tell the agent

Whether the move of a folder worked, any file that failed and its reason from the report, and
anything the store refused.

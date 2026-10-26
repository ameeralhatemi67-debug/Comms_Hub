-- The Android application's releases (Android_Build_Plan.md A3; MVP_draft.md 64.1; the owner's decision of
-- 2026-10-26: the download on «الحساب» for every signed-in person, from a public bucket of the comms-hub project).
-- The application reads `android/latest.json` from here and fetches the APK beside it to update itself; it checks
-- the APK's size, SHA-256 and signing key before Android asks the person to install it. «تطبيق الهاتف» on
-- «الحساب» links to the APK. The files hold no secret, only the site's address, so the bucket is public for
-- reading. Nobody writes to it through the site: no policy grants insert, update or delete on its objects to a
-- visitor or a signed-in person. The owner uploads a release from the Supabase dashboard (mobile/README.md,
-- "Publishing a release"). Written on 2026-10-26 and not applied: the owner applies it with the first release.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'android-releases',
  'android-releases',
  true,
  -- an APK is about 8 MB today; room for growth without allowing anything large
  157286400,
  array['application/vnd.android.package-archive', 'application/octet-stream', 'application/json', 'text/plain']
)
on conflict (id) do nothing;

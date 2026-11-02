-- The desktop application's releases (Desktop_App_Plan.md 7.4, phase D3; decision D-6 of 2026-10-20: a
-- public bucket in the comms-hub project). The application reads `windows-x64/latest.yml` and the
-- installer beside it from here to update itself, and «تطبيق سطح المكتب» on the account page links to
-- the installer. The binaries hold no secret, only the site's address, so the bucket is public for
-- reading. Nobody writes to it through the site: no policy grants insert, update or delete on its
-- objects to a visitor or a signed-in person. The owner uploads a release from the Supabase dashboard
-- (desktop/README.md, "Publishing a release"). Written on 2026-10-20; applied to comms-hub on 2026-11-02
-- at the owner's request (as version 'desktop_releases' in the migration list).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'desktop-releases',
  'desktop-releases',
  true,
  -- an installer is about 110 MB; room for growth (FFmpeg, D5) without allowing anything large
  314572800,
  array['application/octet-stream', 'application/x-msdownload', 'application/vnd.microsoft.portable-executable', 'text/yaml', 'application/x-yaml', 'text/plain']
)
on conflict (id) do nothing;

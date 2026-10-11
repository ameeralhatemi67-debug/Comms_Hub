-- Names and sizes of the files on messages the caller can see, for the attachment
-- chips. The bytes still go only through /api/mail/file/[id] and public.mail_file().
create function public.mail_visible_files() returns table (id uuid, name text, mime_type text, size_bytes bigint)
language sql stable security definer set search_path = ''
as $$
  select distinct f.id, f.name, f.mime_type, f.size_bytes
  from public.mail_files f
  join public.mail_messages x on f.id = any (x.files)
  where public.mail_can_see(x.thread_id)
    and (x.author = public.current_email() or x.state not in ('held','returned') or public.mail_approver())
    and (x.send_at is null or x.send_at <= now() or x.author = public.current_email())
$$;
revoke all on function public.mail_visible_files() from public, anon;
grant execute on function public.mail_visible_files() to authenticated;

-- Downloads and review links are not table changes, so they are recorded here.
-- Only these two types, only for an asset the caller can see.
create function public.media_record(p_type text, p_asset uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare a public.media_files;
begin
  if p_type not in ('download', 'link') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select * into a from public.media_files where id = p_asset;
  if not found or public.media_my_level(a.folder_id) < 1 then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_type = 'link' and not public.media_acts(array['director', 'assistant', 'publisher']) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  perform public.media_log(p_type, a.id, a.folder_id, null, jsonb_build_object('name', a.name));
end
$$;
revoke all on function public.media_record(text, uuid) from public, anon;
grant execute on function public.media_record(text, uuid) to authenticated;

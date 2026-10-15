-- Action_Plan.md section 5 (carried over): a reminder before an app's secret expires.
--
-- Microsoft's client secrets expire (up to 24 months) and nothing told anyone. The Director now
-- states the date when entering a secret (`config.secret_expires_on`, a plain date: only he knows
-- the lifetime he chose in Microsoft Entra; the site cannot read it). There is no background
-- worker, so the check runs when a person opens a work page (the same place work_due_run is
-- called) and tells every holder of «إدخال أسرار التكاملات وتجديدها», once a week per secret,
-- from 30 days before until the secret is replaced. Entering the secret again clears the date
-- (the new secret has its own), so the reminder stops by itself.

create function public.integration_expiry_notes() returns int
language plpgsql security definer set search_path = ''
as $$
declare
  i record; h record; n int := 0; days int; body text;
  today date := (now() at time zone 'Asia/Riyadh')::date;
begin
  if not public.is_approved() then return 0; end if;
  for i in
    select x.id, x.label, (x.config ->> 'secret_expires_on')::date as on_date
      from public.integrations x
     where x.deleted_at is null and x.state <> 'disabled' and x.secret_id is not null
       and x.config ->> 'secret_expires_on' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       and (x.config ->> 'secret_expires_on')::date <= today + 30
  loop
    days := i.on_date - today;
    body := case
      when days < 0 then 'انتهى سر «' || i.label || '» بتاريخ ' || i.on_date::text || '. أنشئ سراً جديداً وأدخله في «الإعدادات» ثم «الاتصالات».'
      when days = 0 then 'ينتهي اليوم سر «' || i.label || '». أنشئ سراً جديداً وأدخله في «الإعدادات» ثم «الاتصالات».'
      else 'ينتهي سر «' || i.label || '» بعد ' || days || ' يوماً (' || i.on_date::text || '). أنشئ سراً جديداً وأدخله في «الإعدادات» ثم «الاتصالات» قبل ذلك.'
    end;
    for h in
      select a.email from public.accounts a
       where coalesce((public.perm_eval(a.email, 'integrations.secrets', null) ->> 'ok')::boolean, false)
    loop
      if not exists (select 1 from public.notifications x
                      where x.recipient = h.email and x.go ->> 'ref' = i.id::text and x.created_at > now() - interval '7 days') then
        insert into public.notifications (recipient, tier, body, go)
        values (h.email, 'attention', body, jsonb_build_object('page', 'settings', 'tab', 'connections', 'ref', i.id::text));
        n := n + 1;
      end if;
    end loop;
  end loop;
  return n;
end
$$;
revoke all on function public.integration_expiry_notes() from public, anon;
grant execute on function public.integration_expiry_notes() to authenticated;

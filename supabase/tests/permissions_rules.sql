-- Permission engine rules (Permissions_Plan.md, Step P1), checked inside one transaction
-- that is rolled back at the end. Run with the Supabase SQL editor or the MCP execute_sql
-- tool. Throwaway accounts (@t.test) of every role act through row level security.
-- Each check records what happened (v) beside what the rule says (expect); the last
-- query lists only the checks that differ, and the total.
-- One-time use under two simultaneous calls cannot be shown in one transaction; it is
-- run separately, see the end of this file. Result: qa/permissions-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to authenticated; grant usage on sequence r_n_seq to authenticated;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('adm@t.test','Adm','admin','{}',true),('adm2@t.test','Adm2','admin','{}',true),
 ('dir@t.test','Dir','director','{work,mail,calendar}',false),('dir2@t.test','Dir2','director','{work}',false),
 ('asst@t.test','Asst','assistant','{work,mail}',false),('asst2@t.test','Asst2','assistant','{work}',false),
 ('wri@t.test','Wri','writer','{work,mail}',false),('des@t.test','Des','designer','{work}',false),
 ('pro@t.test','Pro','producer','{work}',false),('pub@t.test','Pub','publisher','{work,create,approvals}',false),
 ('mem@t.test','Mem','member','{work}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000a1','adm@t.test',now()),('00000000-0000-0000-0000-0000000000a2','adm2@t.test',now()),
 ('00000000-0000-0000-0000-0000000000d1','dir@t.test',now()),('00000000-0000-0000-0000-0000000000d2','dir2@t.test',now()),
 ('00000000-0000-0000-0000-0000000000b1','asst@t.test',now()),('00000000-0000-0000-0000-0000000000b2','asst2@t.test',now()),
 ('00000000-0000-0000-0000-0000000000c1','wri@t.test',now()),('00000000-0000-0000-0000-0000000000c2','des@t.test',now()),
 ('00000000-0000-0000-0000-0000000000c3','pro@t.test',now()),('00000000-0000-0000-0000-0000000000c4','pub@t.test',now()),
 ('00000000-0000-0000-0000-0000000000c5','mem@t.test',now());

create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
grant execute on function pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text) to authenticated;
-- The rules before the engine, as they were written on 2026-10-13, for the comparison.
create function pg_temp.before(cap text) returns boolean language sql as $$
  select case
    when cap = 'urgency.3' then public.media_acts(array['director','assistant'])
    when cap = 'mail.outside.send' then public.mail_approver()
    when cap = 'room.create' then public.media_acts(array['director','assistant'])
    when cap in ('accounts.view','permissions.grant','roles.assign','members.invite','members.remove','roles.templates.edit','whatsapp.system.manage') then public.is_admin()
    when cap like 'page.%' then public.is_admin() or (substr(cap, 6) in (select unnest(pages) from public.accounts where email = public.current_email())
         and (cap <> 'page.create' or public.media_my_role() in ('director','assistant','writer','designer','producer')))
    when cap = 'whatsapp.push' then false
  end $$;
grant execute on function pg_temp.before(text) to authenticated;

set local role authenticated;

-- Installation changes nobody's behaviour ---------------------------------------
-- For every role, every capability that replaces an existing check answers as before.
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.c('01 admin: every moved check answers as before', (select count(*) from public.capabilities c where pg_temp.before(c.key) is not null and public.has_capability(c.key) <> pg_temp.before(c.key))::text, '0');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.c('02 director: as before', (select count(*) from public.capabilities c where pg_temp.before(c.key) is not null and public.has_capability(c.key) <> pg_temp.before(c.key))::text, '0');
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.c('03 assistant: as before', (select count(*) from public.capabilities c where pg_temp.before(c.key) is not null and public.has_capability(c.key) <> pg_temp.before(c.key))::text, '0');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.c('04 writer: as before', (select count(*) from public.capabilities c where pg_temp.before(c.key) is not null and public.has_capability(c.key) <> pg_temp.before(c.key))::text, '0');
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.c('05 designer: as before', (select count(*) from public.capabilities c where pg_temp.before(c.key) is not null and public.has_capability(c.key) <> pg_temp.before(c.key))::text, '0');
select pg_temp.who('00000000-0000-0000-0000-0000000000c3');
select pg_temp.c('06 producer: as before', (select count(*) from public.capabilities c where pg_temp.before(c.key) is not null and public.has_capability(c.key) <> pg_temp.before(c.key))::text, '0');
select pg_temp.who('00000000-0000-0000-0000-0000000000c4');
select pg_temp.c('07 publisher: as before, and «إنشاء» stays closed though listed', (select count(*) from public.capabilities c where pg_temp.before(c.key) is not null and public.has_capability(c.key) <> pg_temp.before(c.key))::text || ' ' || public.has_capability('page.create'), '0 false');
select pg_temp.who('00000000-0000-0000-0000-0000000000c5');
select pg_temp.c('08 member: as before', (select count(*) from public.capabilities c where pg_temp.before(c.key) is not null and public.has_capability(c.key) <> pg_temp.before(c.key))::text, '0');
select pg_temp.c('09 the comparison covers every grantable capability but the new level 2', (select count(*) from public.capabilities c where c.grantable and pg_temp.before(c.key) is null)::text, '1');
select pg_temp.c('10 «مهم» is the leaders'' by default, nobody else''s', (select string_agg(role, ',' order by role) from public.role_capabilities where capability = 'urgency.2' and allowed), 'admin,assistant,director');
select pg_temp.c('11 the WhatsApp push is nobody''s until granted (D-13)', (select count(*) from public.role_capabilities where capability = 'whatsapp.push' and allowed)::text, '0');
select pg_temp.c('12 my_capabilities lists every capability', (select jsonb_array_length(public.my_capabilities()->'caps'))::text, (select count(*) from public.capabilities)::text);

-- Accounts are read with «فتح صفحة الحسابات» and written through functions only ----
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.c('13 a writer reads only their own account', (select count(*) from public.accounts where email like '%@t.test')::text, '1');
select pg_temp.t('14 a writer cannot change an account directly', $q$ update public.accounts set role = 'director' where email = 'wri@t.test' $q$, 'ok');
select pg_temp.c('14b nothing changed', (select role from public.accounts where email = 'wri@t.test'), 'writer');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.c('15 a director does not read the list yet (installed for admins only)', (select count(*) from public.accounts where email like '%@t.test')::text, '1');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.c('16 an administrator reads them all', (select count(*) from public.accounts where email like '%@t.test')::text, '11');
select pg_temp.t('17 nor does an administrator write the table directly', $q$ update public.accounts set display_name = 'x' where email = 'wri@t.test' $q$, 'ok');
select pg_temp.c('17b nothing changed', (select display_name from public.accounts where email = 'wri@t.test'), 'Wri');

-- Hierarchy -------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('18 a director without «منح الصلاحيات» cannot grant', $q$ select public.grant_capability('wri@t.test','urgency.2','timed',now()+interval '1 day',null,null,'تغطية') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('19 the administrator gives the director «منح الصلاحيات»', $q$ select public.grant_capability('dir@t.test','permissions.grant','standing',null,null,null,'إدارة الفريق') $q$, 'ok');
select pg_temp.t('20 and the assistant too', $q$ select public.grant_capability('asst@t.test','permissions.grant','standing',null,null,null,null) $q$, 'ok');
select pg_temp.t('21 the administrator cannot edit their own permissions', $q$ select public.grant_capability('adm@t.test','whatsapp.push','standing',null,null,null,null) $q$, 'ERR SELF_EDIT');
select pg_temp.t('22 an administrator may manage another administrator', $q$ select public.grant_capability('adm2@t.test','whatsapp.push','timed',now()+interval '2 hours',null,null,null) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('23 director gives a writer «مهم» for a day', $q$ insert into v values ('g1', public.grant_capability('wri@t.test','urgency.2','timed',now()+interval '1 day',null,null,'تغطية')::text) $q$, 'ok');
select pg_temp.t('24 director gives the assistant a standing addition', $q$ select public.set_member_override('asst@t.test','urgency.2','deny','اختبار') $q$, 'ok');
select pg_temp.t('25 director cannot manage another director', $q$ select public.grant_capability('dir2@t.test','urgency.2','timed',now()+interval '1 day',null,null,null) $q$, 'ERR NOT_MANAGEABLE');
select pg_temp.t('26 nor an administrator', $q$ select public.grant_capability('adm@t.test','urgency.2','timed',now()+interval '1 day',null,null,null) $q$, 'ERR NOT_MANAGEABLE');
select pg_temp.t('27 nor themselves', $q$ select public.grant_capability('dir@t.test','urgency.2','timed',now()+interval '1 day',null,null,null) $q$, 'ERR SELF_EDIT');
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.t('28 the assistant cannot reach the director', $q$ select public.grant_capability('dir@t.test','mail.outside.send','timed',now()+interval '1 day',null,null,null) $q$, 'ERR NOT_MANAGEABLE');
select pg_temp.t('29 nor another assistant', $q$ select public.grant_capability('asst2@t.test','mail.outside.send','timed',now()+interval '1 day',null,null,null) $q$, 'ERR NOT_MANAGEABLE');
select pg_temp.t('30 the assistant manages rank 1', $q$ select public.grant_capability('des@t.test','mail.outside.send','timed',now()+interval '1 day',null,null,null) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('31 a writer grants nothing', $q$ select public.grant_capability('mem@t.test','urgency.2','timed',now()+interval '1 day',null,null,null) $q$, 'ERR FORBIDDEN');
select pg_temp.c('32 the writer now holds «مهم», temporary', (select (e->>'ok') || ' ' || (e->>'src') from (select public.my_capabilities()->'caps' cs) x, jsonb_array_elements(x.cs) e where e->>'k' = 'urgency.2'), 'true timed');
select pg_temp.c('32b and was told', (select count(*) from public.notifications where recipient = 'wri@t.test' and body like 'منحك Dir صلاحية «رسائل «مهم» (المستوى 2)» حتى %')::text, '1');

-- No escalation ---------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('33 the director cannot give the WhatsApp push he does not hold', $q$ select public.grant_capability('wri@t.test','whatsapp.push','timed',now()+interval '1 day',null,null,null) $q$, 'ERR NOT_HELD');
select pg_temp.t('34 nor a page he does not hold', $q$ select public.grant_capability('wri@t.test','page.analytics','timed',now()+interval '1 day',null,null,null) $q$, 'ERR NOT_HELD');
select pg_temp.t('35 nor «منح الصلاحيات» to rank 1, where it has no meaning', $q$ select public.grant_capability('wri@t.test','permissions.grant','standing',null,null,null,null) $q$, 'ERR CAP_RANK');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('36 the administrator gives the director the push for a week', $q$ select public.grant_capability('dir@t.test','whatsapp.push','timed',now()+interval '7 days',null,null,null) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('37 now the director may pass it on', $q$ select public.grant_capability('wri@t.test','whatsapp.push','timed',now()+interval '1 day',null,null,null) $q$, 'ok');
select pg_temp.t('38 «إنشاء» never goes to a role that does not create', $q$ select public.grant_capability('pub@t.test','page.create','timed',now()+interval '1 day',null,null,null) $q$, 'ERR PAGE_NEEDS_CREATE');
select pg_temp.t('39 a page is not given once', $q$ select public.grant_capability('wri@t.test','page.calendar','once',null,1,null,null) $q$, 'ERR ONCE_NOT_FOR_PAGES');
select pg_temp.t('40 a temporary grant ends in the future', $q$ select public.grant_capability('wri@t.test','page.calendar','timed',now()-interval '1 hour',null,null,null) $q$, 'ERR BAD_UNTIL');
select pg_temp.t('41 a temporary page', $q$ select public.grant_capability('wri@t.test','page.calendar','timed',now()+interval '1 day',null,null,null) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.c('41b opens the calendar for the writer now, from a grant', (select (e->>'ok') || ' ' || (e->>'src') from (select public.my_capabilities()->'caps' cs) x, jsonb_array_elements(x.cs) e where e->>'k' = 'page.calendar'), 'true timed');
select pg_temp.c('41c the account''s own page list is unchanged', (select array_to_string(pages, ',') from public.accounts where email = 'wri@t.test'), 'work,mail');

-- Fixed rules cannot be granted ------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('42 «عاجل» is fixed', $q$ select public.grant_capability('wri@t.test','urgency.3','timed',now()+interval '1 day',null,null,null) $q$, 'ERR CAP_FIXED');
select pg_temp.t('43 approving a work part is fixed', $q$ select public.grant_capability('wri@t.test','work.approve','once',null,1,null,null) $q$, 'ERR CAP_FIXED');
select pg_temp.t('44 publishing is fixed', $q$ select public.set_member_override('wri@t.test','work.publish','allow') $q$, 'ERR CAP_FIXED');
select pg_temp.t('45 nor switched on for a role', $q$ select public.set_role_default('writer','work.approve',true) $q$, 'ERR CAP_FIXED');
select pg_temp.c('46 a fixed rule is answered from the role only', public.has_capability('work.approve')::text || ' ' || public.has_capability('approve.own')::text || ' ' || public.has_capability('urgency.3')::text, 'true false true');

-- Expiry is checked at the moment of use -------------------------------------
reset role;
update public.member_capabilities set expires_at = now() - interval '5 minutes' where id = pg_temp.g('g1')::uuid;
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.c('47 an ended temporary grant no longer allows', public.has_capability('urgency.2')::text, 'false');
select pg_temp.t('47b the writer loads a page', $q$ select public.my_capabilities() $q$, 'ok');
select pg_temp.c('47c the ending is in the log, dated when it ended', (select count(*) from public.permission_events where subject = 'wri@t.test' and kind = 'expired' and at < now() - interval '4 minutes')::text, '1');
select pg_temp.t('47d another page', $q$ select public.my_capabilities() $q$, 'ok');
select pg_temp.c('47e written once', (select count(*) from public.permission_events where subject = 'wri@t.test' and kind = 'expired')::text, '1');

-- One-time grants are used once --------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('48 the writer gets one announcement channel', $q$ select public.grant_capability('wri@t.test','room.create','once',null,1,null,'قناة الحملة') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.c('48b the writer may, once', (select (e->>'ok') || ' ' || (e->>'src') || ' ' || (e->>'uses') from (select public.my_capabilities()->'caps' cs) x, jsonb_array_elements(x.cs) e where e->>'k' = 'room.create'), 'true once 1');
select pg_temp.t('49 creates it', $q$ select public.chat_create_room('channel','قناة الحملة',null,array['dir@t.test'],null) $q$, 'ok');
select pg_temp.t('50 a second is refused', $q$ select public.chat_create_room('channel','قناة ثانية',null,array['dir@t.test'],null) $q$, 'ERR CHANNEL_ROLE');
select pg_temp.t('51 a group does not use a channel grant', $q$ select public.chat_create_room('group','مجموعة',null,array['dir@t.test'],null) $q$, 'ok');
select pg_temp.c('51b the use is in the log, none left', (select count(*) || ' ' || max(data->>'left') from public.permission_events where subject = 'wri@t.test' and kind = 'use' and capability = 'room.create'), '1 0');
select pg_temp.t('52 the writer cannot use a capability directly', $q$ select public.use_capability('room.create') $q$, 'ERR permission denied for function use_capability');
-- A one-time grant bound to one room fits that room only.
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('53 the push once, for one room', $q$ select public.grant_capability('mem@t.test','whatsapp.push','once',null,1,'{"room":"11111111-1111-1111-1111-111111111111"}',null) $q$, 'ok');
select pg_temp.t('53b a target of the wrong kind is refused', $q$ select public.grant_capability('mem@t.test','whatsapp.push','once',null,1,'{"work":"CH-1"}',null) $q$, 'ERR BAD_SCOPE');
select pg_temp.who('00000000-0000-0000-0000-0000000000c5');
select pg_temp.c('54 fits that room, not another, not none', public.has_capability('whatsapp.push','{"room":"11111111-1111-1111-1111-111111111111"}')::text || ' '
  || public.has_capability('whatsapp.push','{"room":"22222222-2222-2222-2222-222222222222"}')::text || ' ' || public.has_capability('whatsapp.push')::text, 'true false false');
-- Outside mail: held unless the sender holds the capability; a one-time grant lets one through.
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.c('55 a writer''s outside mail is held, as before', (public.mail_send(null,'موضوع',array['e:x@example.com'],null,null,'نص',null,null,null,null,null,false)->>'state'), 'held');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('56 one outside mail without waiting', $q$ select public.grant_capability('wri@t.test','mail.outside.send','once',null,1,null,null) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.c('56b an internal message does not use it', (public.mail_send(null,'داخلي',array['p:dir@t.test'],null,null,'نص',null,null,null,null,null,false)->>'state')
  || ' ' || public.has_capability('mail.outside.send')::text, 'sent true');
select pg_temp.c('56c the outside one goes', (public.mail_send(null,'موضوع',array['e:x@example.com'],null,null,'نص',null,null,null,null,null,false)->>'state') in ('outbox','queued'), 'true');
select pg_temp.c('56d the next is held again', public.mail_send(null,'موضوع',array['e:x@example.com'],null,null,'نص',null,null,null,null,null,false)->>'state', 'held');

-- Deny beats the role; a later layer beats the deny ---------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.c('57 the assistant''s «مهم» removed for her: denied, labelled', (select (e->>'ok') || ' ' || (e->>'src') from (select public.my_capabilities()->'caps' cs) x, jsonb_array_elements(x.cs) e where e->>'k' = 'urgency.2'), 'false removed');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('58 then given for an hour', $q$ insert into v values ('g2', public.grant_capability('asst@t.test','urgency.2','timed',now()+interval '1 hour',null,null,null)::text) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.c('58b the temporary grant, a later layer, allows', public.has_capability('urgency.2')::text, 'true');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('59 ended now', $q$ select public.revoke_capability(pg_temp.g('g2')::uuid) $q$, 'ok');
select pg_temp.t('59b not twice', $q$ select public.revoke_capability(pg_temp.g('g2')::uuid) $q$, 'ERR GRANT_NOT_ACTIVE');
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.c('59c denied again', public.has_capability('urgency.2')::text, 'false');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('60 the override cleared', $q$ select public.set_member_override('asst@t.test','urgency.2',null) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.c('60b back to the role', (select (e->>'ok') || ' ' || (e->>'src') from (select public.my_capabilities()->'caps' cs) x, jsonb_array_elements(x.cs) e where e->>'k' = 'urgency.2'), 'true role');

-- Role templates (D-1) -----------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('61 without «تعديل صلاحيات الأدوار» a director cannot', $q$ select public.set_role_default('writer','urgency.2',true) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('62 given it', $q$ select public.grant_capability('dir@t.test','roles.templates.edit','standing',null,null,null,null) $q$, 'ok');
select pg_temp.t('62b the administrator''s own template is locked', $q$ select public.set_role_default('admin','urgency.2',false) $q$, 'ERR ROLE_LOCKED');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.c('63 writers get «مهم»; the answer is how many hold the role', public.set_role_default('writer','urgency.2',true)::text, '1');
select pg_temp.t('64 not the director''s own role', $q$ select public.set_role_default('director','urgency.2',false) $q$, 'ERR ROLE_ABOVE');
select pg_temp.t('65 nor what he does not hold', $q$ select public.set_role_default('writer','accounts.view',true) $q$, 'ERR NOT_HELD');
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.c('66 a designer did not get it, a writer did', public.has_capability('urgency.2')::text, 'false');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.c('66b from the role', (select (e->>'ok') || ' ' || (e->>'src') from (select public.my_capabilities()->'caps' cs) x, jsonb_array_elements(x.cs) e where e->>'k' = 'urgency.2'), 'true role');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.c('66c logged with the number of people', (select count(*) || ' ' || max(data->>'people') from public.permission_events where role = 'writer' and kind = 'role_default'), '1 1');

-- Roles (D-3, D-11) ----------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('67 the director may change roles', $q$ select public.grant_capability('dir@t.test','roles.assign','standing',null,null,null,null) $q$, 'ok');
select pg_temp.t('68 and so may the assistant (D-3)', $q$ select public.grant_capability('asst@t.test','roles.assign','standing',null,null,null,null) $q$, 'ok');
select pg_temp.t('69 a founder''s role does not change', $q$ select public.assign_role('adm2@t.test','director') $q$, 'ERR PROTECTED_ACCOUNT');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('70 the director makes the designer a producer', $q$ select public.assign_role('des@t.test','producer') $q$, 'ok');
select pg_temp.t('71 not a director', $q$ select public.assign_role('des@t.test','director') $q$, 'ERR ROLE_ABOVE');
select pg_temp.t('72 never Admin', $q$ select public.assign_role('des@t.test','admin') $q$, 'ERR ADMIN_NOT_ASSIGNABLE');
select pg_temp.t('73 an assistant, yes', $q$ select public.assign_role('mem@t.test','assistant') $q$, 'ok');
select pg_temp.t('73b and back', $q$ select public.assign_role('mem@t.test','member') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.t('74 the assistant makes no assistant (D-11)', $q$ select public.assign_role('mem@t.test','assistant') $q$, 'ERR ROLE_ABOVE');
select pg_temp.t('75 a role of rank 1, yes', $q$ select public.assign_role('mem@t.test','writer') $q$, 'ok');
select pg_temp.t('76 not over the director', $q$ select public.assign_role('dir2@t.test','writer') $q$, 'ERR NOT_MANAGEABLE');
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.c('77 the person was told, in Arabic, without a raw key', (select count(*) from public.notifications where recipient = 'des@t.test' and body = 'غيّر Dir دورك إلى «المنتج الإعلامي».')::text, '1');

-- Members: add and remove ----------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('78 adding needs «إضافة الأعضاء»', $q$ select public.add_account('new@t.test','جديد','writer',array['work']) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('79 given', $q$ select public.grant_capability('dir@t.test','members.invite','standing',null,null,null,null) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('80 only pages the director holds', $q$ select public.add_account('new@t.test','جديد','writer',array['work','analytics']) $q$, 'ERR NOT_HELD');
select pg_temp.t('81 added', $q$ select public.add_account('new@t.test','جديد','writer',array['work','mail']) $q$, 'ok');
select pg_temp.t('82 not as a director', $q$ select public.add_account('new2@t.test','جديد','director',array['work']) $q$, 'ERR ROLE_ABOVE');
select pg_temp.t('83 removing needs «إزالة عضو»', $q$ select public.account_remove('new@t.test') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('84 given', $q$ select public.grant_capability('dir@t.test','members.remove','standing',null,null,null,null) $q$, 'ok');
select pg_temp.t('85 a founder is never removed', $q$ select public.account_remove('adm2@t.test') $q$, 'ERR PROTECTED_ACCOUNT');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('86 removed', $q$ select public.account_remove('new@t.test') $q$, 'ok');
select pg_temp.t('86b pages only the director holds', $q$ select public.account_update('wri@t.test',null,array['work','mail','analytics']) $q$, 'ERR NOT_HELD');
select pg_temp.t('86c removing a page needs no holding', $q$ select public.account_update('pub@t.test',null,array['work']) $q$, 'ok');

-- Who reads what ------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.c('87 a member of rank 1 reads only their own grants', (select count(distinct email) from public.member_capabilities where email like '%@t.test')::text, '1');
select pg_temp.c('87b and only their own log', (select count(distinct coalesce(subject, '-')) from public.permission_events where coalesce(subject, '') like '%@t.test' or subject is null)::text, '1');
select pg_temp.t('87c and cannot open someone else''s card', $q$ select public.perm_card('wri@t.test') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.c('88 the assistant reads rank 1 grants, not the director''s', (select count(*) from public.member_capabilities where email = 'wri@t.test')::text <> '0'
  and (select count(*) from public.member_capabilities where email = 'dir@t.test') = 0, 'true');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.c('89 the director''s card of the writer shows sources', (select string_agg(e->>'k' || '=' || (e->>'src'), ',') from jsonb_array_elements(public.perm_card('wri@t.test')->'caps') e
  where e->>'k' in ('urgency.2','urgency.3','page.calendar','page.work','whatsapp.push')), 'page.work=page,page.calendar=timed,urgency.2=role,urgency.3=fixed,whatsapp.push=timed');
select pg_temp.t('90 the log is append-only for everyone', $q$ delete from public.permission_events $q$, 'ok');
reset role;
select pg_temp.c('90b nothing was removed', (select (count(*) > 20)::text from public.permission_events where subject like '%@t.test' or role is not null), 'true');
select pg_temp.t('90c not even by the owner for real accounts', $q$ update public.permission_events set kind = 'grant' where id = (select max(id) from public.permission_events) $q$, 'ERR APPEND_ONLY');
select pg_temp.c('91 every grant and change of today is in the log', (select count(*) from public.permission_events where actor like '%@t.test' and kind in ('grant','override','revoke','role_default','role_assign','member_add','member_remove','account_edit'))::text, '28');

-- Messaging checks moved onto the engine answer as before -------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('92 the director sends «عاجل»', $q$ insert into v values ('room', public.chat_create_room('group','فريق',null,array['wri@t.test'],null)::text); select public.chat_send(pg_temp.g('room')::uuid,'text','اجتماع',null,null,true,false) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('93 the writer cannot, even with «مهم» from the role', $q$ select public.chat_send(pg_temp.g('room')::uuid,'text','x',null,null,true,false) $q$, 'ERR URGENT_ROLE');
reset role;

select * from (
  select n, k, v, expect from r where v is distinct from expect
  union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r) z order by n;
rollback;

-- Part 2. One-time use when two calls overlap.
-- The database tool used for these runs sends calls one after another, so two truly
-- simultaneous sessions could not be staged (tried on 2026-10-13: the second call began
-- 1.7 seconds after the first had committed, and was refused; see qa/permissions-rules.json).
-- What decides a use is the conditional update in use_capability:
--   update ... set uses_left = uses_left - 1 where id = <grant> and uses_left > 0
-- Under READ COMMITTED a second session that read the grant before the first committed
-- waits for the first's row lock and then re-checks uses_left > 0 on the committed row,
-- so it updates nothing and is refused. This part shows the same thing in one session:
-- a reading taken before the use (stale), applied after it, changes nothing.
begin;
create temp table r(n serial, k text, v text, expect text);
grant all on r to authenticated; grant usage on sequence r_n_seq to authenticated;
insert into public.accounts (email, display_name, role, pages) values ('cc@t.test','CC','member','{}'),('cd@t.test','CD','member','{}');
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-0000000ccc01','cc@t.test',now()),('00000000-0000-0000-0000-0000000ccc02','cd@t.test',now());
insert into public.member_capabilities (email, capability, mode, uses_left, uses_total, granted_by) values ('cc@t.test','room.create','once',1,1,'rule run');
create temp table stale as select public.perm_eval('cc@t.test','room.create',null) e;
insert into r(k,v,expect) select '94 the stale reading says one use is left', (e->>'src') || ' ' || (e->>'uses'), 'once 1' from stale;
create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000ccc01');
insert into r(k,v,expect) select '95 the first call uses it', (public.chat_create_room('channel','قناة',null,array['cd@t.test'],null) is not null)::text, 'true';
reset role;
with u as (update public.member_capabilities set uses_left = uses_left - 1
           where id = (select (e->>'id')::uuid from stale) and uses_left > 0 and revoked_at is null returning 1)
insert into r(k,v,expect) select '96 the second call''s update, from the stale reading, finds no use left', count(*)::text, '0' from u;
insert into r(k,v,expect) select '97 the grant is used once, not below zero', uses_left::text, '0' from public.member_capabilities where email = 'cc@t.test';
insert into r(k,v,expect) select '98 one use in the log', count(*)::text, '1' from public.permission_events where subject = 'cc@t.test' and kind = 'use';
select * from (
  select n, k, v, expect from r where v is distinct from expect
  union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r) z order by n;
rollback;

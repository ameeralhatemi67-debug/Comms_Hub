-- Permission request rules (Permissions_Plan.md, Step P3), checked inside one transaction
-- that is rolled back at the end. Run with the Supabase SQL editor or the MCP execute_sql
-- tool. Throwaway accounts (@t.test) act through row level security; the real administrators
-- are told of requests too, so the checks of who was told look at the throwaway accounts. The last query lists
-- only the checks that differ from what the rule says, and the total.
-- Result: qa/permission-requests-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to authenticated; grant usage on sequence r_n_seq to authenticated;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('adm@t.test','Adm','admin','{}',true),('dir@t.test','Dir','director','{work,mail,media}',false),
 ('asst@t.test','Asst','assistant','{work,mail,media}',false),('asst2@t.test','Asst2','assistant','{work}',false),
 ('wri@t.test','Wri','writer','{work,mail,media}',false),('des@t.test','Des','designer','{work}',false),('mem@t.test','Mem','member','{work}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000a1','adm@t.test',now()),('00000000-0000-0000-0000-0000000000d1','dir@t.test',now()),
 ('00000000-0000-0000-0000-0000000000b1','asst@t.test',now()),('00000000-0000-0000-0000-0000000000b2','asst2@t.test',now()),
 ('00000000-0000-0000-0000-0000000000c1','wri@t.test',now()),('00000000-0000-0000-0000-0000000000c2','des@t.test',now()),
 ('00000000-0000-0000-0000-0000000000c5','mem@t.test',now());
insert into public.media_folders (id, parent_id, name, restricted, created_by)
values ('00000000-0000-0000-0000-0000000000f9', null, 'مجلد مقيّد للطلبات', true, 'seed');
create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
grant execute on function pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text) to authenticated;
set local role authenticated;

-- Asking ------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('01 a writer asks for «مهم» for a week', $q$ insert into v values ('q1', public.request_capability('urgency.2','timed',168,null,null,'تغطية حملة الأسبوع','page')::text) $q$, 'ok');
select pg_temp.t('02 one pending request per capability', $q$ select public.request_capability('urgency.2','once',null,1,null,'مرة','button') $q$, 'ERR ALREADY_PENDING');
select pg_temp.t('03 a fixed rule cannot be asked for', $q$ select public.request_capability('urgency.3','timed',24,null,null,'عاجل','page') $q$, 'ERR CAP_FIXED');
select pg_temp.t('04 nor approval', $q$ select public.request_capability('work.approve','once',null,1,null,'اعتماد','page') $q$, 'ERR CAP_FIXED');
select pg_temp.t('05 nor what does not fit the role', $q$ select public.request_capability('permissions.grant','timed',24,null,null,'منح','page') $q$, 'ERR CAP_RANK');
select pg_temp.t('06 a request says why', $q$ select public.request_capability('room.create','once',null,1,null,'  ','page') $q$, 'ERR REASON_REQUIRED');
select pg_temp.t('06b a page is not asked for once', $q$ select public.request_capability('page.calendar','once',null,1,null,'التقويم','page') $q$, 'ERR ONCE_NOT_FOR_PAGES');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('07 nobody asks for what they hold by role', $q$ select public.request_capability('urgency.2','timed',24,null,null,'x','page') $q$, 'ERR ALREADY_HELD');
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.t('08 the assistant asks to change roles (D-3)', $q$ insert into v values ('q2', public.request_capability('roles.assign','standing',null,null,null,'أوزع الأدوار في غياب المدير','button')::text) $q$, 'ok');
reset role;
select pg_temp.c('09 the people who may decide the writer''s request were told: the administrator, the director, both assistants', (select string_agg(recipient, ',' order by recipient) from public.notifications
  where tier = 'decide' and go->>'tab' = 'perm' and recipient like '%@t.test' and body like 'طلب Wri صلاحية «رسائل «مهم» (المستوى 2)» لمدة 1 أسبوع%'), 'adm@t.test,asst@t.test,asst2@t.test,dir@t.test');
select pg_temp.c('10 the assistant''s request goes to the director and the admin, not another assistant', (select string_agg(recipient, ',' order by recipient) from public.notifications
  where tier = 'decide' and recipient like '%@t.test' and body like 'طلب Asst صلاحية%'), 'adm@t.test,dir@t.test');
set local role authenticated;

-- Who sees and who decides --------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.c('11 a designer sees no one else''s requests', (select count(*) from public.perm_requests())::text || ' ' || (select count(*) from public.permission_requests)::text, '0 0');
select pg_temp.who('00000000-0000-0000-0000-0000000000b2');
select pg_temp.c('12 another assistant sees the writer''s, not the assistant''s', (select string_agg(requester || ':' || can_decide, ',' order by requester) from public.perm_requests()), 'wri@t.test:true');
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.c('13 the assistant sees her own (not to decide) and the writer''s (to decide)', (select string_agg(requester || ':' || can_decide, ',' order by requester) from public.perm_requests()), 'asst@t.test:false,wri@t.test:true');
select pg_temp.t('14 she cannot decide her own', $q$ select public.decide_permission_request(pg_temp.g('q2')::uuid, true, null, null, null, null, null) $q$, 'ERR SELF_EDIT');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.c('15 the director decides both', (select string_agg(requester || ':' || can_decide, ',' order by requester) from public.perm_requests()), 'asst@t.test:true,wri@t.test:true');

-- Withdraw, decline, approve ---------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('16 the writer withdraws', $q$ select public.withdraw_permission_request(pg_temp.g('q1')::uuid) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('17 a withdrawn request is not decided', $q$ select public.decide_permission_request(pg_temp.g('q1')::uuid, true, null, null, null, null, null) $q$, 'ERR REQUEST_NOT_PENDING');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('18 asks again, permanently', $q$ insert into v values ('q3', public.request_capability('urgency.2','standing',null,null,null,'أحتاجها دائماً','page')::text) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.t('19 a decline needs its reason', $q$ select public.decide_permission_request(pg_temp.g('q3')::uuid, false, null, null, null, null, '') $q$, 'ERR NOTE_REQUIRED');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('20 asked for good, given for a week', $q$ select public.decide_permission_request(pg_temp.g('q3')::uuid, true, 'timed', now() + interval '7 days', null, null, 'أسبوع الحملة') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.c('21 the writer now holds it, until a date', (select (e->>'ok') || ' ' || (e->>'src') from (select public.my_capabilities()->'caps' cs) x, jsonb_array_elements(x.cs) e where e->>'k' = 'urgency.2'), 'true timed');
select pg_temp.c('22 the request is approved with its grant, and the writer was told', (select status || ' ' || (grant_id is not null)::text from public.permission_requests where id = pg_temp.g('q3')::uuid)
  || ' ' || (select count(*) from public.notifications where recipient = 'wri@t.test' and body like 'منحك Dir صلاحية «رسائل «مهم» (المستوى 2)» حتى%'), 'approved true 1');
select pg_temp.t('23 asks for the WhatsApp push for a day', $q$ insert into v values ('q4', public.request_capability('whatsapp.push','timed',24,null,null,'أوصل الطارئ للفريق','button')::text) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.c('24 the assistant does not hold the push, so does not decide it', (select can_decide::text from public.perm_requests() where id = pg_temp.g('q4')::uuid), 'false');
select pg_temp.t('25 and is refused if she tries', $q$ select public.decide_permission_request(pg_temp.g('q4')::uuid, true, null, null, null, null, null) $q$, 'ERR NOT_HELD');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('26 the administrator gives it once instead', $q$ select public.decide_permission_request(pg_temp.g('q4')::uuid, true, 'once', null, 1, null, null) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.c('27 once', (select (e->>'src') || ' ' || (e->>'uses') from (select public.my_capabilities()->'caps' cs) x, jsonb_array_elements(x.cs) e where e->>'k' = 'whatsapp.push'), 'once 1');
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.t('28 nor decline her own', $q$ select public.decide_permission_request(pg_temp.g('q2')::uuid, false, null, null, null, null, 'ليس الآن') $q$, 'ERR SELF_EDIT');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('28b the director declines the assistant''s, with a reason', $q$ select public.decide_permission_request(pg_temp.g('q2')::uuid, false, null, null, null, null, 'نناقشها في الاجتماع') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.c('29 she is told why', (select count(*) from public.notifications where recipient = 'asst@t.test' and body = 'Dir لم يمنح طلبك «تغيير دور عضو»: «نناقشها في الاجتماع».')::text, '1');

-- Door 2: messaging --------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('30 a card only to someone who may decide', $q$ select public.chat_request_permission('des@t.test','room.create','once',null,1,null,'قناة الحملة') $q$, 'ERR NOT_A_GRANTER');
select pg_temp.t('31 asks the director in their conversation', $q$ insert into v values ('m1', public.chat_request_permission('dir@t.test','room.create','once',null,1,null,'قناة الحملة')::text) $q$, 'ok');
select pg_temp.c('32 the card sits in the conversation with the director, pending', (select kind || ' ' || (data->>'state') || ' ' || (select count(*) from public.chat_members cm where cm.room_id = m.room_id and cm.email in ('wri@t.test','dir@t.test'))
  from public.chat_messages m where id = pg_temp.g('m1')::uuid), 'permission pending 2');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('33 the director approves from the card', $q$ select public.decide_permission_request((select (data->>'request_id')::uuid from public.chat_messages where id = pg_temp.g('m1')::uuid), true, null, null, null, null, null) $q$, 'ok');
select pg_temp.c('34 the card follows, and a line in the conversation says so', (select data->>'state' from public.chat_messages where id = pg_temp.g('m1')::uuid) || ' '
  || (select count(*) from public.chat_messages s where s.room_id = (select room_id from public.chat_messages where id = pg_temp.g('m1')::uuid) and s.kind = 'sys' and s.data->>'e' = 'perm' and (s.data->>'approve')::boolean), 'approved 1');
select pg_temp.who('00000000-0000-0000-0000-0000000000c5');
select pg_temp.t('35 a member cannot post a request card with chat_send', $q$ select public.chat_send((select room_id from public.chat_messages where id = pg_temp.g('m1')::uuid),'permission','',null,null,false,false) $q$, 'ERR FORBIDDEN');

-- Door 3: mail ---------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('36 a request card in internal mail', $q$ insert into v values ('mail1', public.mail_send(null,'طلب صلاحية',array['p:dir@t.test'],null,null,'أحتاج إرسال بريد للشريك',null,null,'{"type":"permission","k":"mail.outside.send","mode":"timed","hours":24,"reason":"رد على الشريك"}',null,null,false)->>'message') $q$, 'ok');
select pg_temp.c('37 the request knows its message, the card its request', (select (source = 'mail' and source_ref = pg_temp.g('mail1'))::text from public.permission_requests where requester = 'wri@t.test' and capability = 'mail.outside.send')
  || ' ' || (select (card->>'request_id' is not null and card->>'state' = 'pending')::text from public.mail_messages where id = pg_temp.g('mail1')::uuid), 'true true');
select pg_temp.t('38 not in outside mail', $q$ select public.mail_send(null,'x',array['e:x@example.com'],null,null,'x',null,null,'{"type":"permission","k":"room.create","mode":"once","uses":1,"reason":"x"}',null,null,false) $q$, 'ERR CARD_INTERNAL_ONLY');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('39 the director declines from the card', $q$ select public.decide_permission_request((select (card->>'request_id')::uuid from public.mail_messages where id = pg_temp.g('mail1')::uuid), false, null, null, null, null, 'اطلب من المساعد مراجعة الرد') $q$, 'ok');
select pg_temp.c('40 the mail card follows', (select card->>'state' from public.mail_messages where id = pg_temp.g('mail1')::uuid), 'declined');

-- The log --------------------------------------------------------------------------------
select pg_temp.c('41 requests, decisions and the withdrawal are in the log', (select string_agg(kind || '=' || n, ',' order by kind) from (select kind, count(*) n from public.permission_events
  where kind in ('request','decide','withdraw') and (subject like '%@t.test') group by kind) x), 'decide=5,request=6,withdraw=1');

-- Folder access for a time (media_grants with an end) ------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('42 the writer asks for the restricted folder', $q$ insert into v values ('fa', public.request_folder_access('00000000-0000-0000-0000-0000000000f9','عقد الشريك')::text) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('43 an end in the past is refused', $q$ select public.request_decide_folder(pg_temp.g('fa')::uuid, true, null, now() - interval '1 hour') $q$, 'ERR BAD_UNTIL');
select pg_temp.t('44 given for a day', $q$ select public.request_decide_folder(pg_temp.g('fa')::uuid, true, null, now() + interval '1 day') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.c('45 the writer sees the folder', public.media_my_level('00000000-0000-0000-0000-0000000000f9')::text, '1');
reset role;
update public.media_grants set expires_at = now() - interval '1 minute' where folder_id = '00000000-0000-0000-0000-0000000000f9' and subject = 'wri@t.test';
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.c('46 after its end, no more', public.media_my_level('00000000-0000-0000-0000-0000000000f9')::text, '0');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.c('47 the writer''s card lists no ended folder', (select jsonb_array_length(public.perm_card('wri@t.test')->'folders'))::text, '0');
reset role;

select * from (
  select n, k, v, expect from r where v is distinct from expect
  union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r) z order by n;
rollback;

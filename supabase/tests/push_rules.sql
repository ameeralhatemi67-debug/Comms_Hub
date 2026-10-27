-- Push notice rules (Android_Build_Plan.md A5, MVP_draft.md 64.3), checked inside one transaction
-- that is rolled back at the end. Run with the Supabase SQL editor or the MCP execute_sql tool.
-- Throwaway accounts (@t.test) act through row level security; the flush route's calls are made as
-- `anon`, as the route makes them. The server key is a throwaway too: its hash is written inside
-- this transaction and rolled back with it. Tokens are made-up strings in the shape of an FCM
-- token; no real device or Firebase project is involved. Every message and mail body below
-- carries the word «سرّي», so a leak into a payload can be searched for.
-- Covered: the two hooks spliced once each; devices are private and the token is never readable
-- (not by its owner, not through the view); registering, the same device again by id or by token,
-- a token moving to another person, a removed device refused and seen as removed, rename, prefs
-- and their inheritance, the device limit, removal, an account removed; the notice trigger (decide
-- always, attention if wanted, info never, never the actor, never a notice about messaging, never
-- a removed device, never one already read); the chat route (direct messages, mentions, levels,
-- muted conversations, never the author); the mail route (task cards to the assignee, never plain
-- mail, never a muted thread); the outbox's own constraints; the flush turn, claim and report with
-- the key only; what a claimed payload holds and never holds; read, deleted and stale rows; an
-- invalid token; the Firebase slot in Vault.
-- The last query lists only the checks that differ from the rule, and the total.
-- Result: qa/push-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to public; grant usage on sequence r_n_seq to public;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('adm@t.test','Adm','admin','{}',true),('dir@t.test','Dir','director','{mail}',false),('asst@t.test','Asst','assistant','{mail}',false),
 ('wri@t.test','Wri','writer','{mail}',false),('des@t.test','Des','designer','{mail}',false),('pro@t.test','Pro','producer','{mail}',false),
 ('mem@t.test','Mem','member','{mail}',false),('ex@t.test','Ex','member','{mail}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000a1','adm@t.test',now()),('00000000-0000-0000-0000-0000000000d1','dir@t.test',now()),
 ('00000000-0000-0000-0000-0000000000b1','asst@t.test',now()),('00000000-0000-0000-0000-0000000000c1','wri@t.test',now()),
 ('00000000-0000-0000-0000-0000000000c2','des@t.test',now()),('00000000-0000-0000-0000-0000000000c3','pro@t.test',now()),
 ('00000000-0000-0000-0000-0000000000c5','mem@t.test',now()),('00000000-0000-0000-0000-0000000000c9','ex@t.test',now());
insert into public.mail_server_key (id, key_hash) values (1, encode(sha256(convert_to('k-rule-run-only', 'UTF8')), 'hex'))
  on conflict (id) do update set key_hash = excluded.key_hash;
update public.push_state set flush_lock = null, flush_at = null where id = 1;
create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.nobody() returns void language sql as $$ select set_config('request.jwt.claims', '', true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
declare cn text;
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then
    get stacked diagnostics cn = constraint_name;
    insert into r(k,v,expect) values (k,'ERR '||coalesce(nullif(cn,''), sqlerrm),e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,coalesce(val,'NULL'),e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
create function pg_temp.tok(w text) returns text language sql as $$ select 'tok_' || w || '_' || repeat('x', 24) $$;
-- The outbox rows of one kind as label>person, labels from v (a notice, a message or a mail).
create function pg_temp.rows(p_kind text) returns text language sql as $$
  select coalesce(string_agg(x.k || '>' || split_part(d.email,'@',1), ',' order by x.k, d.email), 'none')
  from public.push_outbox o join public.devices d on d.id = o.device_id join v x on x.val = o.ref::text where o.kind = p_kind $$;
-- A claim's items as label>person, in order.
create function pg_temp.items(p_claim text) returns text language sql as $$
  select coalesce(string_agg(x.k || '>' || split_part(d.email,'@',1), ',' order by x.k, d.email), 'none')
  from jsonb_array_elements(p_claim::jsonb) i join public.push_outbox o on o.id = (i->>'id')::uuid
  join public.devices d on d.id = o.device_id join v x on x.val = o.ref::text $$;
-- The outbox row of a label for one person's device token.
create function pg_temp.row_of(p_label text, p_tok text) returns uuid language sql as $$
  select o.id from public.push_outbox o join public.devices d on d.id = o.device_id
  where o.ref::text = pg_temp.g(p_label) and o.device_id = pg_temp.g(p_tok)::uuid $$;
grant execute on function pg_temp.who(text), pg_temp.nobody(), pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text),
  pg_temp.tok(text), pg_temp.rows(text), pg_temp.items(text), pg_temp.row_of(text,text) to public;

-- The two hooks -------------------------------------------------------------------------------
select pg_temp.c('01 chat_send calls the chat route once, after the WhatsApp route',
  (select ((length(d) - length(replace(d, 'perform public.push_route_chat(mid);', ''))) / length('perform public.push_route_chat(mid);'))::text
     || ' ' || (position('perform public.wa_route(mid);' in d) < position('perform public.push_route_chat(mid);' in d))::text
   from (select pg_get_functiondef('public.chat_send(uuid,text,text,uuid,jsonb,smallint,boolean)'::regprocedure) d) x), '1 true');
select pg_temp.c('02 mail_send calls the mail route once, just before it answers',
  (select ((length(d) - length(replace(d, 'perform public.push_route_mail(mid);', ''))) / length('perform public.push_route_mail(mid);'))::text
     || ' ' || (position(E'perform public.push_route_mail(mid);\n  return jsonb_build_object(''thread''' in d) > 0)::text
   from (select pg_get_functiondef('public.mail_send(uuid,text,text[],text[],text[],text,uuid[],uuid[],jsonb,timestamptz,jsonb,boolean)'::regprocedure) d) x), '1 true');

-- Devices -------------------------------------------------------------------------------------
set local role anon;
select pg_temp.t('03 a signed-out caller cannot register a device', $q$ select public.device_register(null,'android','1.0.0','x',pg_temp.tok('anon')) $q$, 'ERR permission denied for function device_register');
select pg_temp.t('03b nor read the view', $q$ select count(*) from public.my_devices $q$, 'ERR permission denied for view my_devices');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('04 the writer registers a phone', $q$ insert into v values ('W1', public.device_register(null,'android','1.0.0','هاتفي',pg_temp.tok('w1'))->>'id') $q$, 'ok');
select pg_temp.t('05 another platform is refused', $q$ select public.device_register(null,'ios','1.0.0','x',pg_temp.tok('w9')) $q$, 'ERR DEVICE_PLATFORM');
select pg_temp.t('05b a version not x.y.z is refused', $q$ select public.device_register(null,'android','1.0','x',pg_temp.tok('w9')) $q$, 'ERR DEVICE_VERSION');
select pg_temp.t('05c a token with a space, or too short, is refused', $q$ select public.device_register(null,'android','1.0.0','x','short token') $q$, 'ERR DEVICE_TOKEN');
select pg_temp.c('06 the writer sees the phone in «أجهزتي»: name, ready, attention on, text shown',
  (select string_agg(name || ' ' || push_ready || ' ' || attention || ' ' || hide_text, ',') from public.my_devices), 'هاتفي true true false');
select pg_temp.t('07 the token is not selectable, even by its owner', $q$ select fcm_token from public.devices $q$, 'ERR permission denied for table devices');
select pg_temp.t('07b nor with a star', $q$ select * from public.devices $q$, 'ERR permission denied for table devices');
select pg_temp.c('07c the view has no token column', (select count(*)::text from information_schema.columns where table_schema = 'public' and table_name = 'my_devices' and column_name like '%token%'), '0');
select pg_temp.t('07d nobody writes the table directly', $q$ update public.devices set name = 'x' $q$, 'ERR permission denied for table devices');
select pg_temp.c('08 the same device again by its id, with a new token', (select (public.device_register(pg_temp.g('W1')::uuid,'android','1.0.1','اسم آخر',pg_temp.tok('w2'))->>'id') = pg_temp.g('W1'))::text, 'true');
select pg_temp.c('09 the same device again by its token alone (its stored id was lost)', (select (public.device_register(null,'android','1.0.1',null,pg_temp.tok('w2'))->>'id') = pg_temp.g('W1'))::text, 'true');
select pg_temp.c('09b still one device, its name kept, its version updated', (select count(*) || ' ' || min(name) || ' ' || min(version) from public.my_devices), '1 هاتفي 1.0.1');
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.c('10 the designer sees none of the writer''s devices', (select count(*)::text from public.my_devices) || ' ' || (select count(*)::text from (select id from public.devices) d), '0 0');
select pg_temp.t('11 the designer signs in on the writer''s phone: the token moves', $q$ insert into v values ('D1', public.device_register(pg_temp.g('W1')::uuid,'android','1.0.1','هاتف',pg_temp.tok('w2'))->>'id') $q$, 'ok');
select pg_temp.c('11b a new device of the designer''s, not the writer''s row', (pg_temp.g('D1') <> pg_temp.g('W1'))::text, 'true');
reset role;
select pg_temp.c('12 the writer''s row is removed and holds no token', (select (removed_at is not null) || ' ' || coalesce(fcm_token, 'none') from public.devices where id = pg_temp.g('W1')::uuid), 'true none');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('13 a removed device is refused, so the application signs out', $q$ select public.device_register(pg_temp.g('W1')::uuid,'android','1.0.1',null,pg_temp.tok('w3')) $q$, 'ERR DEVICE_REMOVED');
select pg_temp.c('14 device_seen says removed', (select public.device_seen(pg_temp.g('W1')::uuid, '1.0.1')), 'removed');
select pg_temp.t('15 the writer registers the phone again, a new device', $q$ insert into v values ('W2', public.device_register(null,'android','1.0.1','هاتف العمل',pg_temp.tok('w3'))->>'id') $q$, 'ok');
select pg_temp.c('16 device_seen: live for its owner', (select public.device_seen(pg_temp.g('W2')::uuid, '1.0.2')), 'live');
select pg_temp.c('16b and the version it reported is kept', (select version from public.my_devices), '1.0.2');
select pg_temp.t('17 rename', $q$ select public.device_rename(pg_temp.g('W2')::uuid, 'هاتف المكتب') $q$, 'ok');
select pg_temp.t('17b an empty name is refused', $q$ select public.device_rename(pg_temp.g('W2')::uuid, '  ') $q$, 'ERR DEVICE_NAME');
select pg_temp.c('18 the writer turns «يحتاج انتباهك» off on all devices', (select public.device_prefs(null, false, null)::text), '1');
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.c('19 device_seen: unknown for someone else''s device', (select public.device_seen(pg_temp.g('W2')::uuid, null)), 'unknown');
select pg_temp.t('19b nor can they rename it', $q$ select public.device_rename(pg_temp.g('W2')::uuid, 'x') $q$, 'ERR DEVICE_NOT_FOUND');
select pg_temp.t('19c nor change its settings', $q$ select public.device_prefs(pg_temp.g('W2')::uuid, true, true) $q$, 'ERR DEVICE_NOT_FOUND');
select pg_temp.t('19d nor remove it', $q$ select public.device_remove(pg_temp.g('W2')::uuid) $q$, 'ERR DEVICE_NOT_FOUND');
-- The others' phones.
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('20 phones for the director, the assistant, the producer and the member (two)', $q$ insert into v values ('DD', public.device_register(null,'android','1.0.0',null,pg_temp.tok('dd'))->>'id') $q$, 'ok');
select pg_temp.c('20b the default name', (select name from public.my_devices), 'هاتف Android');
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.t('20c', $q$ insert into v values ('DA', public.device_register(null,'android','1.0.0',null,pg_temp.tok('da'))->>'id') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c3');
select pg_temp.t('20d', $q$ insert into v values ('DP', public.device_register(null,'android','1.0.0',null,pg_temp.tok('dp'))->>'id') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c5');
select pg_temp.t('20e', $q$ insert into v values ('M1', public.device_register(null,'android','1.0.0','هاتف',pg_temp.tok('m1'))->>'id') $q$, 'ok');
select pg_temp.t('20f', $q$ insert into v values ('M2', public.device_register(null,'android','1.0.0','لوحي',pg_temp.tok('m2'))->>'id') $q$, 'ok');
select pg_temp.c('21 the member hides the text on the second device only', (select public.device_prefs(pg_temp.g('M2')::uuid, null, true)::text), '1');
select pg_temp.c('21b', (select string_agg(name || ':' || hide_text, ',' order by name collate "C") from public.my_devices), 'لوحي:true,هاتف:false');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('22 a second writer device', $q$ insert into v values ('W3', public.device_register(null,'android','1.0.2','لوحي',pg_temp.tok('w4'))->>'id') $q$, 'ok');
select pg_temp.c('22b it inherits «يحتاج انتباهك» off from the writer''s latest device', (select attention::text from public.my_devices where id = pg_temp.g('W3')::uuid), 'false');
select pg_temp.t('22c the writer removes it', $q$ select public.device_remove(pg_temp.g('W3')::uuid) $q$, 'ok');
select pg_temp.t('22d not twice', $q$ select public.device_remove(pg_temp.g('W3')::uuid) $q$, 'ERR DEVICE_NOT_FOUND');
select pg_temp.c('22e it left «أجهزتي»', (select count(*)::text from public.my_devices), '1');
select pg_temp.who('00000000-0000-0000-0000-0000000000c9');
select pg_temp.t('23 twenty live devices a person', $q$ select count(public.device_register(null,'android','1.0.0',null,pg_temp.tok('ex' || g))) from generate_series(1, 20) g $q$, 'ok');
select pg_temp.t('23b not twenty-one', $q$ select public.device_register(null,'android','1.0.0',null,pg_temp.tok('ex21')) $q$, 'ERR DEVICE_LIMIT');
reset role;
delete from public.accounts where email = 'ex@t.test';
select pg_temp.c('23c an account removed takes its devices with it', (select count(*)::text from public.devices where email = 'ex@t.test'), '0');

-- Notices -------------------------------------------------------------------------------------
select pg_temp.nobody();
with n as (insert into public.notifications (recipient, tier, body, go) values ('mem@t.test','decide','اعتمد المنشور «حملة الخريف».','{"page":"review","id":"CH-1"}') returning id) insert into v select 'n1', id::text from n;
with n as (insert into public.notifications (recipient, tier, body, go) values ('mem@t.test','attention','موعد التسليم غداً.','{"page":"item","id":"CH-1"}') returning id) insert into v select 'n2', id::text from n;
with n as (insert into public.notifications (recipient, tier, body, go) values ('wri@t.test','attention','موعد التسليم غداً.','{"page":"item","id":"CH-2"}') returning id) insert into v select 'n3', id::text from n;
with n as (insert into public.notifications (recipient, tier, body, go) values ('dir@t.test','info','نُشر العمل.','{"page":"item","id":"CH-3"}') returning id) insert into v select 'n4', id::text from n;
with n as (insert into public.notifications (recipient, tier, body, go) values ('dir@t.test','decide','«عاجل» من Asst: سرّي.','{"page":"chat","id":"00000000-0000-4000-8000-000000000001"}') returning id) insert into v select 'n6', id::text from n;
with n as (insert into public.notifications (recipient, tier, body, go) values ('des@t.test','decide','راجع التصميم.','{"page":"review","id":"CH-4"}') returning id) insert into v select 'n7', id::text from n;
with n as (insert into public.notifications (recipient, tier, body, go) values ('wri@t.test','decide','عدّل النص المطلوب.','{"page":"item","id":"CH-2"}') returning id) insert into v select 'n8', id::text from n;
with n as (insert into public.notifications (recipient, tier, body, go) values ('adm@t.test','decide','طلب انضمام جديد.','{"page":"members"}') returning id) insert into v select 'n9', id::text from n;
with n as (insert into public.notifications (recipient, tier, body, go, read_at) values ('pro@t.test','decide','قُرئ في مكان آخر.','{"page":"item","id":"CH-5"}', now()) returning id) insert into v select 'n10', id::text from n;
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
with n as (insert into public.notifications (recipient, tier, body, go) values ('dir@t.test','decide','عن عمل المدير نفسه.','{"page":"item","id":"CH-6"}') returning id) insert into v select 'n5', id::text from n;
select pg_temp.c('24 notice rows: decide to every live device, attention only where wanted; not info, not the actor, not messaging, not a person without a device, not one already read',
  pg_temp.rows('notice'), 'n1>mem,n1>mem,n2>mem,n2>mem,n7>des,n8>wri');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.t('25 the designer removes the phone', $q$ select public.device_remove(pg_temp.g('D1')::uuid) $q$, 'ok');
select pg_temp.c('25b it left «أجهزتي» and device_seen says removed', (select count(*)::text from public.my_devices) || ' ' || public.device_seen(pg_temp.g('D1')::uuid, null), '0 removed');
reset role;
select pg_temp.nobody();
with n as (insert into public.notifications (recipient, tier, body, go) values ('des@t.test','decide','راجع التصميم ثانية.','{"page":"review","id":"CH-4"}') returning id) insert into v select 'n11', id::text from n;
select pg_temp.c('26 a removed device gets nothing more, and what waited for it is gone', pg_temp.rows('notice'), 'n1>mem,n1>mem,n2>mem,n2>mem,n8>wri');
select pg_temp.c('26b its token is deleted', (select coalesce(fcm_token, 'none') from public.devices where id = pg_temp.g('D1')::uuid), 'none');

-- Messaging -----------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('27 a group with the writer, the producer and the member, and a direct chat with the assistant',
  $q$ insert into v values ('G1', public.chat_create_room('group','غرفة',null,array['wri@t.test','pro@t.test','mem@t.test'],null)::text), ('DM', public.chat_open_dm('asst@t.test')::text) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c3');
select pg_temp.t('27b the producer mutes the group', $q$ select public.chat_state(pg_temp.g('G1')::uuid, '{"muted":true}') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('28 c1 plain text in the group', $q$ insert into v values ('c1', public.chat_send(pg_temp.g('G1')::uuid,'text','سرّي c1',null,null,0::smallint,false)::text) $q$, 'ok');
select pg_temp.t('28b c2 mentions the member', $q$ insert into v values ('c2', public.chat_send(pg_temp.g('G1')::uuid,'text','سرّي c2 @Mem',null,null,0::smallint,false)::text) $q$, 'ok');
select pg_temp.t('28c c3 mentions the producer, who muted the group', $q$ insert into v values ('c3', public.chat_send(pg_temp.g('G1')::uuid,'text','سرّي c3 @Pro',null,null,0::smallint,false)::text) $q$, 'ok');
select pg_temp.t('28d c4 level 3', $q$ insert into v values ('c4', public.chat_send(pg_temp.g('G1')::uuid,'text','سرّي c4',null,null,3::smallint,false)::text) $q$, 'ok');
select pg_temp.t('28e c5 level 1', $q$ insert into v values ('c5', public.chat_send(pg_temp.g('G1')::uuid,'text','سرّي c5',null,null,1::smallint,false)::text) $q$, 'ok');
select pg_temp.t('28f c8 mentions the writer, who turned «يحتاج انتباهك» off', $q$ insert into v values ('c8', public.chat_send(pg_temp.g('G1')::uuid,'text','سرّي c8 @Wri',null,null,0::smallint,false)::text) $q$, 'ok');
select pg_temp.t('28g c6 in the direct chat', $q$ insert into v values ('c6', public.chat_send(pg_temp.g('DM')::uuid,'text','سرّي c6',null,null,0::smallint,false)::text) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.t('28h c7 the assistant answers', $q$ insert into v values ('c7', public.chat_send(pg_temp.g('DM')::uuid,'text','سرّي c7',null,null,0::smallint,false)::text) $q$, 'ok');
reset role;
select pg_temp.c('29 chat rows: direct messages, mentions and levels; a muted group passes level 3 only; never the author',
  pg_temp.rows('chat'), 'c2>mem,c2>mem,c4>mem,c4>mem,c4>pro,c4>wri,c5>mem,c5>mem,c6>asst,c7>dir');
select pg_temp.c('29b level 3 is a decision, the rest ask for attention', (select string_agg(distinct x.k || ':' || o.tier, ',') from public.push_outbox o join v x on x.val = o.ref::text where o.kind = 'chat'),
  'c2:attention,c4:decide,c5:attention,c6:attention,c7:attention');
select pg_temp.c('29c the notices chat_send wrote for the levels exist, and none is pushed as a notice (they quote the message)',
  (select count(*)::text from public.notifications where go->>'page' = 'chat' and recipient like '%@t.test' and body like '%سرّي c%')
  || ' ' || (select count(*)::text from public.push_outbox o join public.notifications n on n.id = o.notice_id where n.go->>'page' = 'chat'), '5 0');
select pg_temp.c('29d nothing for the author of a message', (select count(*)::text from public.push_outbox o join public.devices d on d.id = o.device_id join public.chat_messages m on m.id = o.message_id where m.author = d.email), '0');

-- Mail ----------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('30 m1 a task card to the writer', $q$ insert into v select 'm1', j->>'message' from (select public.mail_send(null,'مهمة',array['p:wri@t.test'],null,null,'سرّي m1',null,null,'{"type":"task","what":"كتابة العنوان","assignee":"wri@t.test","due":"2026-12-01T10:00:00Z"}',null,null,false) j) x $q$, 'ok');
select pg_temp.t('30b m2 plain mail to the member', $q$ insert into v select 'm2', j->>'message' from (select public.mail_send(null,'تحية',array['p:mem@t.test'],null,null,'سرّي m2',null,null,null,null,null,false) j) x $q$, 'ok');
select pg_temp.t('30c m3 a task card to the member, in a thread of its own', $q$ insert into v select k, val from (select public.mail_send(null,'مهمة ثانية',array['p:mem@t.test'],null,null,'سرّي m3',null,null,'{"type":"task","what":"تصوير","assignee":"mem@t.test","due":"2026-12-01T10:00:00Z"}',null,null,false) j) x,
  lateral (values ('m3', j->>'message'), ('T3', j->>'thread')) y(k, val) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c5');
select pg_temp.t('30d the member mutes that thread', $q$ select public.mail_state(array[pg_temp.g('T3')::uuid], '{"muted":true}') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('30e m4 another task card to the member in the muted thread', $q$ insert into v select 'm4', j->>'message' from (select public.mail_send(pg_temp.g('T3')::uuid,null,array['p:mem@t.test'],null,null,'سرّي m4',null,null,'{"type":"task","what":"مونتاج","assignee":"mem@t.test","due":"2026-12-01T10:00:00Z"}',null,null,false) j) x $q$, 'ok');
reset role;
insert into v select 'tn1', id::text from public.notifications where recipient = 'wri@t.test' and go->>'page' = 'tasks';
insert into v select 'tn3', id::text from public.notifications where recipient = 'mem@t.test' and body like '%«تصوير»%';
insert into v select 'tn4', id::text from public.notifications where recipient = 'mem@t.test' and body like '%«مونتاج»%';
select pg_temp.c('31 mail rows: a task card to its assignee, «يحتاج قرارك» even with attention off; never plain mail, never a muted thread',
  pg_temp.rows('mail') || ' ' || (select string_agg(distinct tier, ',') from public.push_outbox where kind = 'mail'), 'm1>wri,m3>mem,m3>mem decide');
select pg_temp.c('31b a task card also writes its task notice («يحتاج انتباهك»), which follows the notice rules: none for the writer, who turned it off',
  (select count(*)::text from v where k in ('tn1','tn3','tn4')) || ' ' || pg_temp.rows('notice'), '3 n1>mem,n1>mem,n2>mem,n2>mem,n8>wri,tn3>mem,tn3>mem,tn4>mem,tn4>mem');

-- The outbox's own constraints ----------------------------------------------------------------
select pg_temp.c('32 the outbox keeps no text and no token', (select count(*)::text from information_schema.columns where table_schema = 'public' and table_name = 'push_outbox'
  and column_name in ('body','text','title','token','fcm_token','content','go')), '0');
select pg_temp.t('33 one row per device and reference', $q$ insert into public.push_outbox (device_id, kind, notice_id, tier) values (pg_temp.g('M1')::uuid, 'notice', pg_temp.g('n1')::uuid, 'decide') $q$, 'ERR push_outbox_once');
select pg_temp.t('33b a kind names its own reference', $q$ insert into public.push_outbox (device_id, kind, notice_id, tier) values (pg_temp.g('M1')::uuid, 'chat', pg_temp.g('n4')::uuid, 'decide') $q$, 'ERR push_outbox_ref');
select pg_temp.t('33c never «للعلم»', $q$ insert into public.push_outbox (device_id, kind, notice_id, tier) values (pg_temp.g('M1')::uuid, 'notice', pg_temp.g('n4')::uuid, 'info') $q$, 'ERR push_outbox_tier_check');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c5');
select pg_temp.t('34 nobody writes the outbox directly', $q$ insert into public.push_outbox (device_id, kind, notice_id, tier) values (pg_temp.g('M1')::uuid, 'notice', pg_temp.g('n4')::uuid, 'decide') $q$, 'ERR new row violates row-level security policy for table "push_outbox"');
select pg_temp.t('34b nor calls a route', $q$ select public.push_route_chat(pg_temp.g('c1')::uuid) $q$, 'ERR permission denied for function push_route_chat');
select pg_temp.t('34c nor claims without the key', $q$ select public.push_claim('wrong', 5) $q$, 'ERR FORBIDDEN');
select pg_temp.c('35 the member sees the rows of their own devices only', (select count(*)::text from public.push_outbox o where o.device_id not in (pg_temp.g('M1')::uuid, pg_temp.g('M2')::uuid))
  || ' ' || (select (count(*) > 0)::text from public.push_outbox), '0 true');
select pg_temp.c('35b nor the flush turn', (select count(*)::text from public.push_state), '0');

-- Read and deleted before the flush -----------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('36 the director deletes c6', $q$ select public.chat_delete(pg_temp.g('c6')::uuid) $q$, 'ok');
reset role;
update public.chat_members set last_read_at = now() + interval '1 second' where room_id = pg_temp.g('G1')::uuid and email = 'pro@t.test';
update public.notifications set read_at = now() where id = pg_temp.g('n2')::uuid;

-- The flush, as anon with the server key ------------------------------------------------------
set local role anon;
select pg_temp.t('37 the flush turn needs the key', $q$ select public.push_flush_begin('wrong') $q$, 'ERR FORBIDDEN');
select pg_temp.t('37b anon cannot reach a person''s functions', $q$ select public.device_prefs(null, true, false) $q$, 'ERR permission denied for function device_prefs');
select pg_temp.c('38 the turn is taken', (select public.push_flush_begin('k-rule-run-only')::text), '{"go": true}');
select pg_temp.c('38b one flush at a time', (select public.push_flush_begin('k-rule-run-only')::text), '{"go": false, "why": "busy"}');
select pg_temp.t('39 the sender claims', $q$ insert into v values ('claim', public.push_claim('k-rule-run-only', 100)::text) $q$, 'ok');
reset role;
select pg_temp.c('40 claimed: every row still due, by device', pg_temp.items(pg_temp.g('claim')),
  'c2>mem,c2>mem,c4>mem,c4>mem,c4>wri,c5>mem,c5>mem,c7>dir,m1>wri,m3>mem,m3>mem,n1>mem,n1>mem,n8>wri,tn3>mem,tn3>mem,tn4>mem,tn4>mem');
select pg_temp.c('41 closed instead: read elsewhere (skipped) and deleted (failed)',
  (select string_agg(x.k || '>' || split_part(d.email,'@',1) || ':' || o.state || ':' || o.error, ',' order by x.k, d.email, o.id)
   from public.push_outbox o join public.devices d on d.id = o.device_id join v x on x.val = o.ref::text where o.state in ('skipped', 'failed')),
  'c4>pro:skipped:READ,c6>asst:failed:DELETED,n2>mem:skipped:READ,n2>mem:skipped:READ');
select pg_temp.c('42 each item goes to its own device''s token', (select count(*)::text from jsonb_array_elements(pg_temp.g('claim')::jsonb) i
  join public.push_outbox o on o.id = (i->>'id')::uuid join public.devices d on d.id = o.device_id where (i->>'token') is distinct from d.fcm_token), '0');
select pg_temp.c('43 no item carries a message''s or a mail''s text', (select count(*)::text from jsonb_array_elements(pg_temp.g('claim')::jsonb) i where i::text like '%سرّي%'), '0');
select pg_temp.c('44 messaging and mail say only «رسالة جديدة من …», or «رسالة جديدة» where text is hidden',
  (select string_agg(x, ',' order by x collate "C") from (select distinct (i->>'title') || '|' || (i->>'body') x from jsonb_array_elements(pg_temp.g('claim')::jsonb) i where i->>'kind' in ('chat','mail')) y),
  'البريد|رسالة جديدة,البريد|رسالة جديدة من Dir,المراسلة|رسالة جديدة,المراسلة|رسالة جديدة من Asst,المراسلة|رسالة جديدة من Dir');
select pg_temp.c('45 a notice shows its text, unless the device hides it',
  (select string_agg(i->>'title' || '|' || (i->>'body'), ',' order by i->>'token') from jsonb_array_elements(pg_temp.g('claim')::jsonb) i where i->>'notice' = pg_temp.g('n1')),
  'يحتاج قرارك|اعتمد المنشور «حملة الخريف».,يحتاج قرارك|لديك إشعار جديد في المركز.');
select pg_temp.c('46 every destination is a path inside the site, with no query string', (select count(*)::text from jsonb_array_elements(pg_temp.g('claim')::jsonb) i
  where i->>'go' !~ '^/n/(notice|chat|mail)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'), '0');
select pg_temp.c('46b a notice opens itself, a message its conversation, a mail its thread',
  (select bool_and(case i->>'kind' when 'notice' then i->>'go' = '/n/notice/' || (i->>'notice')
                                    when 'chat' then i->>'go' = '/n/chat/' || (select m.room_id::text from public.chat_messages m join public.push_outbox o on o.message_id = m.id where o.id = (i->>'id')::uuid)
                                    else i->>'go' = '/n/mail/' || (select m.thread_id::text from public.mail_messages m join public.push_outbox o on o.mail_id = m.id where o.id = (i->>'id')::uuid) end)::text
   from jsonb_array_elements(pg_temp.g('claim')::jsonb) i), 'true');
select pg_temp.c('46c only a notice item names a notice', (select count(*)::text from jsonb_array_elements(pg_temp.g('claim')::jsonb) i where (i->>'kind' = 'notice') <> (i->>'notice' is not null)), '0');
select pg_temp.c('46d a tag replaces per conversation and tier: the level-3 message', (select distinct i->>'tag' from jsonb_array_elements(pg_temp.g('claim')::jsonb) i join public.push_outbox o on o.id = (i->>'id')::uuid where o.ref::text = pg_temp.g('c4')),
  'chat:' || pg_temp.g('G1') || ':decide');
select pg_temp.c('46e an item holds exactly these keys', (select string_agg(distinct k, ',' order by k) from jsonb_array_elements(pg_temp.g('claim')::jsonb) i, jsonb_object_keys(i) k), 'body,go,id,kind,notice,tag,tier,title,token');
select pg_temp.c('47 the claimed rows are sending, once each', (select count(*)::text from public.push_outbox where state = 'sending' and attempts = 1), '18');
insert into v values ('r_n1', pg_temp.row_of('n1', 'M1')::text), ('r_c2', pg_temp.row_of('c2', 'M1')::text), ('r_m1', pg_temp.row_of('m1', 'W2')::text), ('r_c7', pg_temp.row_of('c7', 'DD')::text);
set local role anon;
select pg_temp.c('47b a second claim finds nothing', (select public.push_claim('k-rule-run-only', 100)::text), '[]');
select pg_temp.t('48 a report needs the key', $q$ select public.push_report('wrong', '[]') $q$, 'ERR FORBIDDEN');
select pg_temp.c('49 the sender reports: sent, an invalid token, try again, and words that are not a code',
  (select public.push_report('k-rule-run-only', jsonb_build_array(
     jsonb_build_object('id', pg_temp.g('r_n1'), 'ok', true),
     jsonb_build_object('id', pg_temp.g('r_c2'), 'ok', false, 'error', 'TOKEN_GONE'),
     jsonb_build_object('id', pg_temp.g('r_m1'), 'ok', false, 'error', 'RETRY'),
     jsonb_build_object('id', pg_temp.g('r_c7'), 'ok', false, 'error', 'the provider said something')))::text), '4');
select pg_temp.c('49b a finished row is not changed by a second report', (select public.push_report('k-rule-run-only', jsonb_build_array(jsonb_build_object('id', pg_temp.g('r_n1'), 'ok', false, 'error', 'TOKEN_GONE')))::text), '0');
reset role;
select pg_temp.c('50 states after the reports', (select string_agg(x.k || ':' || o.state || ':' || coalesce(o.error, '-'), ',' order by x.k)
  from public.push_outbox o join v x on x.val = o.ref::text
  where o.id in (pg_temp.g('r_n1')::uuid, pg_temp.g('r_c2')::uuid, pg_temp.g('r_m1')::uuid, pg_temp.g('r_c7')::uuid)),
  'c2:failed:TOKEN_GONE,c7:failed:FAILED,m1:queued:RETRY,n1:sent:-');
select pg_temp.c('50b the invalid token is deleted from its device, which says so in «أجهزتي»', (select coalesce(fcm_token, 'none') from public.devices where id = pg_temp.g('M1')::uuid)
  || ' ' || (select push_ready::text from public.devices where id = pg_temp.g('M1')::uuid), 'none false');
select pg_temp.nobody();
with n as (insert into public.notifications (recipient, tier, body, go) values ('mem@t.test','decide','موعد جديد.','{"page":"calendar"}') returning id) insert into v select 'n12', id::text from n;
select pg_temp.c('50c a new notice then reaches only the member''s other device', (select string_agg(d.name, ',') from public.push_outbox o join public.devices d on d.id = o.device_id where o.notice_id = pg_temp.g('n12')::uuid), 'لوحي');

-- Stale rows and the second flush -------------------------------------------------------------
update public.push_outbox set claimed_at = now() - interval '6 minutes' where id = pg_temp.row_of('c5', 'M2');
update public.push_outbox set claimed_at = now() - interval '6 minutes', attempts = 5 where id = pg_temp.row_of('c4', 'M2');
set local role anon;
select pg_temp.t('51 the first flush ends', $q$ select public.push_flush_end('k-rule-run-only') $q$, 'ok');
select pg_temp.c('51b not again within two seconds', (select public.push_flush_begin('k-rule-run-only')->>'why'), 'busy');
reset role;
update public.push_state set flush_at = now() - interval '3 seconds' where id = 1;
set local role anon;
select pg_temp.c('52 then the turn is taken again', (select public.push_flush_begin('k-rule-run-only')->>'go'), 'true');
select pg_temp.t('52b and the sender claims', $q$ insert into v values ('claim2', public.push_claim('k-rule-run-only', 100)::text) $q$, 'ok');
reset role;
select pg_temp.c('53 a row to try again, a row claimed and never reported, and the new notice', pg_temp.items(pg_temp.g('claim2')), 'c5>mem,m1>wri,n12>mem');
select pg_temp.c('53b five attempts and no more', (select o.state || ':' || o.error || ' ' || (select attempts from public.push_outbox where id = pg_temp.row_of('m1', 'W2'))
  from public.push_outbox o where o.id = pg_temp.row_of('c4', 'M2')), 'failed:STALE 2');
set local role anon;
select pg_temp.t('53c the second flush ends', $q$ select public.push_flush_end('k-rule-run-only') $q$, 'ok');
reset role;
select pg_temp.c('53d the lock is free', (select (flush_lock is null)::text from public.push_state where id = 1), 'true');
set local role anon;
select pg_temp.c('54 nothing waits now: the turn answers at once', (select public.push_flush_begin('k-rule-run-only')::text), '{"go": false, "why": "empty"}');

-- Turning attention off closes what waits ------------------------------------------------------
reset role;
select pg_temp.nobody();
with n as (insert into public.notifications (recipient, tier, body, go) values ('mem@t.test','attention','تعليق جديد.','{"page":"item","id":"CH-9"}') returning id) insert into v select 'n13', id::text from n;
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c5');
select pg_temp.c('55 the member turns «يحتاج انتباهك» off', (select public.device_prefs(null, false, null)::text), '2');
reset role;
select pg_temp.c('55b the waiting attention row is closed', (select string_agg(state || ':' || error, ',') from public.push_outbox where notice_id = pg_temp.g('n13')::uuid), 'skipped:TIER_OFF');

-- The Firebase service account ----------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('56 a writer cannot make the Firebase slot', $q$ select public.push_fcm_slot() $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('57 the administrator (integrations.secrets) makes it', $q$ insert into v values ('fcm', public.push_fcm_slot()::text) $q$, 'ok');
select pg_temp.c('57b once', (select (public.push_fcm_slot()::text = pg_temp.g('fcm'))::text), 'true');
select pg_temp.c('57c it is a messaging integration, pending, with no secret', (select (x->>'kind') || ':' || (x->>'state') || ':' || (x->>'has_secret') from jsonb_array_elements(public.int_list()) x where x->>'type' = 'fcm_service_account'), 'messaging:pending:false');
select pg_temp.t('58 the credential goes in pending', $q$ insert into v values ('tail', public.int_secret_set(pg_temp.g('fcm')::uuid, '{"type":"service_account","private_key":"FCMSECRETMARK-0001"}')) $q$, 'ok');
set local role anon;
select pg_temp.c('58b the server reads it back pending, with its key, to check it', (select public.int_secret_use('k-rule-run-only', 'fcm_service_account', 'check before commit', true)), '{"type":"service_account","private_key":"FCMSECRETMARK-0001"}');
set local role authenticated;
select pg_temp.t('59 then commits it', $q$ select public.int_secret_commit('k-rule-run-only', pg_temp.g('fcm')::uuid, pg_temp.g('tail'), '{"project_id":"demo-project"}') $q$, 'ok');
select pg_temp.c('59b connected, the secret shown as a tail only', (select (x->>'state') || ':' || (x->>'has_secret') || ':' || (x->>'secret_tail') || ':' || (x::text like '%FCMSECRETMARK%')::text
  from jsonb_array_elements(public.int_list()) x where x->>'type' = 'fcm_service_account'), 'connected:true:••••01"}:false');
reset role;
select pg_temp.c('59c the secret is in no event and no row', (select count(*)::text from public.integration_events where data::text like '%FCMSECRETMARK%')
  || ' ' || (select count(*)::text from public.integrations where row_to_json(integrations)::text like '%FCMSECRETMARK%'), '0 0');
reset role;

-- The TOTAL row also carries the md5 of the text this run executed (without the lines a client
-- may append after it), so a recorded result can be matched to the file.
select * from (
  select n, k, v, expect from r where v is distinct from expect
  union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed; run md5 '
    || md5(case when strpos(current_query(), E'\n\n-- source: ') > 0 then left(current_query(), strpos(current_query(), E'\n\n-- source: ') - 1) else current_query() end) from r) z order by n;
rollback;

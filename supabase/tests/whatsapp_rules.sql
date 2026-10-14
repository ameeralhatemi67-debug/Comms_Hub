-- WhatsApp rules (Permissions_Plan.md 8, Step P5a), checked inside one transaction that is
-- rolled back at the end. Run with the Supabase SQL editor or the MCP execute_sql tool.
-- Throwaway accounts (@t.test) act through row level security; the bridge's calls are made
-- as `anon`, as the dispatch route makes them. The server key is a throwaway too: its hash is
-- written inside this transaction and rolled back with it.
-- Numbers: the country code +999 is not assigned to any country (ITU), so no real number is
-- used here or anywhere in the repository.
-- Covered: the system switch and who manages it; the handshake (bad number, code hashed and
-- unreadable, wrong code counted, right code, expiry, five tries, three codes an hour, one
-- account per number); who sees a number (D-12); the four-room routing case of plan 8.6
-- with urgent messages and pushes interleaved; the push rules (author only, room members
-- only, linked and not muted, once per recipient, daily cap, off until granted, a one-time
-- grant bound to a room); the outbox's own constraints; claim and report with the server
-- key; a changed number and a deleted message never go out; retry by the sender only; the
-- system switched off keeps rows queued; an administrator unlinks; turning off deletes.
-- The last query lists only the checks that differ from the rule, and the total.
-- Result: qa/whatsapp-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to public; grant usage on sequence r_n_seq to public;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('adm@t.test','Adm','admin','{}',true),('dir@t.test','Dir','director','{mail}',false),('asst@t.test','Asst','assistant','{mail}',false),
 ('wri@t.test','Wri','writer','{mail}',false),('des@t.test','Des','designer','{mail}',false),('pro@t.test','Pro','producer','{mail}',false),
 ('pub@t.test','Pub','publisher','{mail}',false),('mem@t.test','Mem','member','{mail}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000a1','adm@t.test',now()),('00000000-0000-0000-0000-0000000000d1','dir@t.test',now()),
 ('00000000-0000-0000-0000-0000000000b1','asst@t.test',now()),('00000000-0000-0000-0000-0000000000c1','wri@t.test',now()),
 ('00000000-0000-0000-0000-0000000000c2','des@t.test',now()),('00000000-0000-0000-0000-0000000000c3','pro@t.test',now()),
 ('00000000-0000-0000-0000-0000000000c4','pub@t.test',now()),('00000000-0000-0000-0000-0000000000c5','mem@t.test',now());
insert into public.whatsapp_server_key (id, key_hash) values (1, encode(sha256(convert_to('k-rule-run-only', 'UTF8')), 'hex'))
  on conflict (id) do update set key_hash = excluded.key_hash;
create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
declare cn text;
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then
    get stacked diagnostics cn = constraint_name;
    insert into r(k,v,expect) values (k,'ERR '||coalesce(nullif(cn,''), sqlerrm),e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
-- Turn WhatsApp on, take a code for the number and type it back (the code is 111111).
create function pg_temp.link(uid text, phone text, lvl int) returns void language plpgsql as $$
declare n text := md5(phone);
begin
  perform pg_temp.who(uid);
  perform public.wa_set(jsonb_build_object('on', true, 'from_level', lvl));
  perform public.wa_code_issue('k-rule-run-only', phone, n, encode(sha256(convert_to('111111:' || n, 'UTF8')), 'hex'));
  if not (public.wa_code_verify('111111')->>'ok')::boolean then raise exception 'LINK_FAILED'; end if;
end $$;
-- The urgent or pushed rows as label>recipient, labels from v.
create function pg_temp.rows(p_kind text) returns text language sql as $$
  select coalesce(string_agg(x.k || '>' || split_part(o.recipient,'@',1), ',' order by x.k, o.recipient), 'none')
  from public.whatsapp_outbox o join v x on x.val = o.message_id::text where o.kind = p_kind $$;
grant execute on function pg_temp.who(text), pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text), pg_temp.link(text,text,int), pg_temp.rows(text) to public;
set local role authenticated;

-- The system switch ------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('01 a writer turns WhatsApp on', $q$ select public.wa_set('{"on":true}') $q$, 'ok');
select pg_temp.t('02 a code needs the server key', $q$ select public.wa_code_issue('wrong', '+99900000001', md5('a'), md5('a') || md5('b')) $q$, 'ERR FORBIDDEN');
select pg_temp.t('03 nothing is sent while the system number is off', $q$ select public.wa_code_issue('k-rule-run-only', '+99900000001', md5('a'), md5('a') || md5('b')) $q$, 'ERR WA_SYSTEM_OFF');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('04 the director does not manage the system number (admin by default)', $q$ select public.wa_system_update('{"enabled":true}') $q$, 'ERR FORBIDDEN');
select pg_temp.t('04b nor sees its panel', $q$ select public.wa_system_view() $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('05 the administrator switches it on, two pushes a day per sender', $q$ select public.wa_system_update('{"enabled":true,"daily_cap":2}') $q$, 'ok');
select pg_temp.t('05b a test send needs the manager''s own verified number', $q$ select public.wa_test_send() $q$, 'ERR WA_NOT_LINKED');

-- The handshake -------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('06 a number not in international form is refused', $q$ select public.wa_code_issue('k-rule-run-only', '0500000001', md5('n1'), encode(sha256(convert_to('123456:' || md5('n1'), 'UTF8')), 'hex')) $q$, 'ERR WA_PHONE_BAD');
select pg_temp.t('07 the writer asks for a code', $q$ select public.wa_code_issue('k-rule-run-only', '+99900000001', md5('n1'), encode(sha256(convert_to('123456:' || md5('n1'), 'UTF8')), 'hex')) $q$, 'ok');
select pg_temp.c('08 the pending code is not readable, even by its owner', (select count(*)::text from public.whatsapp_codes), '0');
select pg_temp.c('09 one code row is queued for the writer, with no number and no text in the outbox', (select count(*)::text from public.whatsapp_outbox where recipient = 'wri@t.test' and kind = 'code' and state = 'queued'), '1');
select pg_temp.c('09b the pending step shows the number to its owner', (select public.wa_me()->'pending'->>'phone'), '+99900000001');
select pg_temp.c('10 a wrong code is counted', (select public.wa_code_verify('000000')::text), '{"ok": false, "left": 4}');
select pg_temp.c('11 the right code links the number', (select public.wa_code_verify('123456')::text), '{"ok": true}');
select pg_temp.c('12 the writer sees the verified number, version 1', (select phone || ' ' || link_version from public.whatsapp_links where email = 'wri@t.test'), '+99900000001 1');
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.c('13 a designer sees no one''s link row, and «linked» without the number', (select count(*)::text from public.whatsapp_links where email = 'wri@t.test')
  || ' ' || (select linked || ' ' || coalesce(phone, 'none') from public.wa_people() where email = 'wri@t.test'), '0 true none');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.c('14 the administrator sees the number (D-12)', (select phone from public.wa_people() where email = 'wri@t.test'), '+99900000001');
select pg_temp.t('15 the designer cannot take the writer''s number', $q$ select pg_temp.link('00000000-0000-0000-0000-0000000000c2', '+99900000001', 2) $q$, 'ERR WA_PHONE_TAKEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('16 a second code within the hour', $q$ select public.wa_code_issue('k-rule-run-only', '+99900000001', md5('n2'), encode(sha256(convert_to('222222:' || md5('n2'), 'UTF8')), 'hex')) $q$, 'ok');
select pg_temp.t('16b a third', $q$ select public.wa_code_issue('k-rule-run-only', '+99900000001', md5('n3'), encode(sha256(convert_to('333333:' || md5('n3'), 'UTF8')), 'hex')) $q$, 'ok');
select pg_temp.t('16c not a fourth', $q$ select public.wa_code_issue('k-rule-run-only', '+99900000001', md5('n4'), encode(sha256(convert_to('444444:' || md5('n4'), 'UTF8')), 'hex')) $q$, 'ERR WA_RATE');
select pg_temp.c('16d an older code still waiting is not sent', (select count(*)::text from public.whatsapp_outbox where recipient = 'wri@t.test' and kind = 'code' and state = 'queued'), '1');
select pg_temp.who('00000000-0000-0000-0000-0000000000c4');
select pg_temp.t('17 the publisher asks for a code', $q$ select public.wa_set('{"on":true}'), public.wa_code_issue('k-rule-run-only', '+99900000004', md5('x4'), encode(sha256(convert_to('555555:' || md5('x4'), 'UTF8')), 'hex')) $q$, 'ok');
reset role;
update public.whatsapp_codes set expires_at = now() - interval '1 second' where email = 'pub@t.test';
set local role authenticated;
select pg_temp.t('17b after ten minutes it is refused', $q$ select public.wa_code_verify('555555') $q$, 'ERR WA_CODE_EXPIRED');
select pg_temp.who('00000000-0000-0000-0000-0000000000c5');
select pg_temp.t('18 the member asks for a code and types five wrong ones', $q$ select public.wa_set('{"on":true}'), public.wa_code_issue('k-rule-run-only', '+99900000009', md5('x9'), encode(sha256(convert_to('666666:' || md5('x9'), 'UTF8')), 'hex')),
  public.wa_code_verify('1'), public.wa_code_verify('2'), public.wa_code_verify('3'), public.wa_code_verify('4'), public.wa_code_verify('5') $q$, 'ok');
select pg_temp.t('18b then even the right one is refused', $q$ select public.wa_code_verify('666666') $q$, 'ERR WA_CODE_LOCKED');

-- Links for the routing case: level 3 for the writer and the publisher, 2 for the others.
select pg_temp.t('19 links', $q$ select pg_temp.link('00000000-0000-0000-0000-0000000000c2', '+99900000002', 2), pg_temp.link('00000000-0000-0000-0000-0000000000c3', '+99900000003', 2),
  pg_temp.link('00000000-0000-0000-0000-0000000000c4', '+99900000004', 3), pg_temp.link('00000000-0000-0000-0000-0000000000b1', '+99900000005', 2) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c4');
select pg_temp.t('20 the publisher mutes the director on WhatsApp', $q$ select public.wa_mute('dir@t.test', true) $q$, 'ok');

-- Four rooms with overlapping members (plan 8.6) --------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('21 four rooms', $q$ insert into v values
  ('R1', public.chat_create_room('group','غرفة 1',null,array['wri@t.test','des@t.test','mem@t.test'],null)::text),
  ('R2', public.chat_create_room('group','غرفة 2',null,array['des@t.test','pro@t.test','pub@t.test'],null)::text),
  ('R4', public.chat_create_room('group','غرفة 4',null,array['asst@t.test','pub@t.test','wri@t.test'],null)::text) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.t('21b the assistant opens the third', $q$ insert into v values ('R3', public.chat_create_room('group','غرفة 3',null,array['wri@t.test','pro@t.test'],null)::text) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c3');
select pg_temp.t('21c the producer mutes room 2', $q$ select public.chat_state(pg_temp.g('R2')::uuid, '{"muted":true}') $q$, 'ok');

-- Urgent messages and pushes, interleaved.
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('22 a1: the director, room 1, level 3', $q$ insert into v values ('a1', public.chat_send(pg_temp.g('R1')::uuid,'text','نص a1',null,null,3::smallint,false)::text) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('23 the administrator gives the director the push once, for room 1', $q$ select public.grant_capability('dir@t.test','whatsapp.push','once',null,1,jsonb_build_object('room', pg_temp.g('R1')),'تجربة') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.t('24 a2: the assistant, room 3, level 2', $q$ insert into v values ('a2', public.chat_send(pg_temp.g('R3')::uuid,'text','نص a2',null,null,2::smallint,false)::text) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('25 a3: the director, room 2, level 2', $q$ insert into v values ('a3', public.chat_send(pg_temp.g('R2')::uuid,'text','نص a3',null,null,2::smallint,false)::text) $q$, 'ok');
select pg_temp.t('26 a8: the director, room 1, no level', $q$ insert into v values ('a8', public.chat_send(pg_temp.g('R1')::uuid,'text','نص a8',null,null,0::smallint,false)::text) $q$, 'ok');
select pg_temp.t('27 p1: the director pushes a8 to the writer', $q$ select public.wa_push(pg_temp.g('a8')::uuid, 'wri@t.test') $q$, 'ok');
select pg_temp.t('28 not to a member without a link', $q$ select public.wa_push(pg_temp.g('a8')::uuid, 'mem@t.test') $q$, 'ERR WA_UNAVAILABLE');
select pg_temp.t('29 not to someone outside the room', $q$ select public.wa_push(pg_temp.g('a8')::uuid, 'pro@t.test') $q$, 'ERR WA_NOT_MEMBER');
select pg_temp.t('30 the one-time push is used up', $q$ select public.wa_push(pg_temp.g('a1')::uuid, 'des@t.test') $q$, 'ERR WA_PUSH');
select pg_temp.t('31 a4: the director, room 4, level 3', $q$ insert into v values ('a4', public.chat_send(pg_temp.g('R4')::uuid,'text','نص a4',null,null,3::smallint,false)::text) $q$, 'ok');
select pg_temp.t('32 not to someone who muted the sender', $q$ select public.wa_push(pg_temp.g('a3')::uuid, 'pub@t.test') $q$, 'ERR WA_UNAVAILABLE');
select pg_temp.t('33 a5: the director, room 2, level 3', $q$ insert into v values ('a5', public.chat_send(pg_temp.g('R2')::uuid,'text','نص a5',null,null,3::smallint,false)::text) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('34 a6: the writer, room 1, level 1', $q$ insert into v values ('a6', public.chat_send(pg_temp.g('R1')::uuid,'text','نص a6',null,null,1::smallint,false)::text) $q$, 'ok');
select pg_temp.t('35 the writer cannot push (off until granted, D-13)', $q$ select public.wa_push(pg_temp.g('a6')::uuid, 'des@t.test') $q$, 'ERR WA_PUSH');
select pg_temp.t('36 nor push someone else''s message', $q$ select public.wa_push(pg_temp.g('a1')::uuid, 'des@t.test') $q$, 'ERR WA_NOT_AUTHOR');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('37 the administrator gives the assistant the push for good', $q$ select public.grant_capability('asst@t.test','whatsapp.push','standing',null,null,null,'تجربة') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.t('38 a7: the assistant, room 4, level 2', $q$ insert into v values ('a7', public.chat_send(pg_temp.g('R4')::uuid,'text','نص a7',null,null,2::smallint,false)::text) $q$, 'ok');
select pg_temp.t('39 p2: the assistant pushes a2 to the producer', $q$ select public.wa_push(pg_temp.g('a2')::uuid, 'pro@t.test') $q$, 'ok');
select pg_temp.t('40 once per message and recipient', $q$ select public.wa_push(pg_temp.g('a2')::uuid, 'pro@t.test') $q$, 'ERR WA_ALREADY');
select pg_temp.t('41 p3: the assistant pushes a7 to the writer', $q$ select public.wa_push(pg_temp.g('a7')::uuid, 'wri@t.test') $q$, 'ok');
select pg_temp.t('42 the daily cap (two) holds', $q$ select public.wa_push(pg_temp.g('a7')::uuid, 'pub@t.test') $q$, 'ERR WA_DAILY_CAP');
reset role;

select pg_temp.c('43 urgent rows: exactly who asked for that level in that room, not muted', pg_temp.rows('urgent'),
  'a1>des,a1>wri,a2>pro,a3>des,a4>asst,a4>wri,a5>des,a5>pro');
select pg_temp.c('44 pushed rows: exactly the three accepted pushes', pg_temp.rows('push'), 'a2>pro,a7>wri,a8>wri');
select pg_temp.c('45 every row''s room is its message''s room', (select count(*)::text from public.whatsapp_outbox o join public.chat_messages m on m.id = o.message_id where o.room_id <> m.room_id), '0');
select pg_temp.c('46 every recipient is a member of that room', (select count(*)::text from public.whatsapp_outbox o where o.message_id is not null
  and not exists (select 1 from public.chat_members cm where cm.room_id = o.room_id and cm.email = o.recipient)), '0');
select pg_temp.c('47 every recipient has a verified link of that version', (select count(*)::text from public.whatsapp_outbox o join public.whatsapp_links l on l.email = o.recipient
  where o.message_id is not null and (l.verified_at is null or l.link_version <> o.link_version)), '0');
select pg_temp.c('48 every urgent row met its case: level, muted room, muted sender', (select count(*)::text from public.whatsapp_outbox o
  join public.chat_messages m on m.id = o.message_id join public.whatsapp_links l on l.email = o.recipient
  join public.chat_members cm on cm.room_id = o.room_id and cm.email = o.recipient
  where o.kind = 'urgent' and (m.urgency < l.from_level or (m.urgency < 3 and cm.muted)
    or exists (select 1 from public.whatsapp_mutes x where x.email = o.recipient and x.sender = m.author))), '0');
select pg_temp.c('49 no urgent row for a message that met no case (a6, a7, a8)', (select count(*)::text from public.whatsapp_outbox o join v x on x.val = o.message_id::text
  where o.kind = 'urgent' and x.k in ('a6','a7','a8')), '0');
select pg_temp.c('50 the outbox keeps no text and no number', (select count(*)::text from information_schema.columns where table_schema = 'public' and table_name = 'whatsapp_outbox'
  and column_name in ('body','text','content','phone','to_number')), '0');

-- The outbox's own constraints ----------------------------------------------------------------
select pg_temp.t('51 a recipient outside the room cannot be inserted', $q$ insert into public.whatsapp_outbox (kind, message_id, room_id, recipient, sender, link_version)
  values ('push', pg_temp.g('a2')::uuid, pg_temp.g('R3')::uuid, 'des@t.test', 'asst@t.test', 1) $q$, 'ERR whatsapp_outbox_member');
select pg_temp.t('52 nor a message paired with another room', $q$ insert into public.whatsapp_outbox (kind, message_id, room_id, recipient, sender, link_version)
  values ('push', pg_temp.g('a1')::uuid, pg_temp.g('R2')::uuid, 'des@t.test', 'dir@t.test', 1) $q$, 'ERR whatsapp_outbox_message_room');
select pg_temp.t('53 nor a recipient without a link (the check runs before the key)', $q$ insert into public.whatsapp_outbox (kind, message_id, room_id, recipient, sender, link_version)
  values ('push', pg_temp.g('a8')::uuid, pg_temp.g('R1')::uuid, 'dir@t.test', 'wri@t.test', 1) $q$, 'ERR WA_NOT_LINKED');
select pg_temp.t('54 nor a member whose number is not verified', $q$ insert into public.whatsapp_outbox (kind, message_id, room_id, recipient, sender, link_version)
  values ('push', pg_temp.g('a8')::uuid, pg_temp.g('R1')::uuid, 'mem@t.test', 'dir@t.test', 0) $q$, 'ERR WA_NOT_LINKED');
select pg_temp.t('55 nor the same message, recipient and reason twice', $q$ insert into public.whatsapp_outbox (kind, message_id, room_id, recipient, sender, link_version)
  values ('urgent', pg_temp.g('a1')::uuid, pg_temp.g('R1')::uuid, 'wri@t.test', 'dir@t.test', 1) $q$, 'ERR whatsapp_outbox_once');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('56 nobody writes the outbox directly', $q$ insert into public.whatsapp_outbox (kind, recipient, link_version) values ('test', 'wri@t.test', 1) $q$, 'ERR new row violates row-level security policy for table "whatsapp_outbox"');
select pg_temp.t('57 nor calls the routing', $q$ select public.wa_route(pg_temp.g('a1')::uuid) $q$, 'ERR permission denied for function wa_route');
select pg_temp.c('58 the writer sees only rows sent to or by them', (select count(*)::text from public.whatsapp_outbox where recipient <> 'wri@t.test' and sender is distinct from 'wri@t.test'), '0');

-- A changed number and a deleted message never go out -----------------------------------------
select pg_temp.t('59 the designer links a new number (version 2)', $q$ select pg_temp.link('00000000-0000-0000-0000-0000000000c2', '+99900000022', 2) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('60 the director deletes a4', $q$ select public.chat_delete(pg_temp.g('a4')::uuid) $q$, 'ok');

-- The bridge, as anon, with the server key ------------------------------------------------------
set local role anon;
select pg_temp.t('61 a claim needs the key', $q$ select public.wa_claim('wrong', 5) $q$, 'ERR FORBIDDEN');
select pg_temp.t('61b so does a heartbeat', $q$ select public.wa_heartbeat('wrong', null) $q$, 'ERR FORBIDDEN');
select pg_temp.t('61c anon cannot reach a member''s functions', $q$ select public.wa_me() $q$, 'ERR permission denied for function wa_me');
select pg_temp.t('62 the bridge claims', $q$ insert into v values ('claim', public.wa_claim('k-rule-run-only', 20)::text) $q$, 'ok');
reset role;
select pg_temp.c('63 the stale rows failed instead: the designer''s old number and the deleted message',
  (select string_agg(x.k || '>' || split_part(o.recipient,'@',1) || ':' || o.error, ',' order by x.k, o.recipient) from public.whatsapp_outbox o join v x on x.val = o.message_id::text where o.state = 'failed'),
  'a1>des:تغيّر الرقم أو أُلغي الربط.,a3>des:تغيّر الرقم أو أُلغي الربط.,a4>asst:حُذفت الرسالة.,a4>wri:حُذفت الرسالة.,a5>des:تغيّر الرقم أو أُلغي الربط.');
select pg_temp.c('64 claimed: the six message rows still valid, and the codes still waiting',
  (select string_agg(coalesce(x.k, i->>'kind') || '>' || split_part(i->>'recipient','@',1), ',' order by coalesce(x.k, i->>'kind'), i->>'recipient')
     from jsonb_array_elements(pg_temp.g('claim')::jsonb) i left join v x on x.val = i->>'message_id' and x.k like 'a%'),
  'a1>wri,a2>pro,a2>pro,a5>pro,a7>wri,a8>wri,code>mem,code>wri');
select pg_temp.c('65 each claimed message goes to the recipient''s verified number, and nowhere else',
  (select count(*)::text from jsonb_array_elements(pg_temp.g('claim')::jsonb) i join public.whatsapp_links l on l.email = i->>'recipient'
   where i->>'kind' in ('urgent','push') and (i->>'to') is distinct from l.phone), '0');
select pg_temp.c('66 the code goes to the number being proved, with its nonce, never the code',
  (select (i->>'to') || ' ' || (i->>'nonce' = md5('n3')) || ' ' || (i::text like '%333333%') from jsonb_array_elements(pg_temp.g('claim')::jsonb) i where i->>'kind' = 'code' and i->>'recipient' = 'wri@t.test'), '+99900000001 true false');
select pg_temp.c('67 the text is read at dispatch: sender, level, body, room', (select (i->>'sender_name') || '|' || (i->>'urgency') || '|' || (i->>'body') || '|' || (i->>'room_name')
  from jsonb_array_elements(pg_temp.g('claim')::jsonb) i where i->>'message_id' = pg_temp.g('a5') and i->>'kind' = 'urgent'), 'Dir|3|نص a5|غرفة 2');
select pg_temp.c('68 the claimed rows are sending (six messages, two codes)', (select count(*)::text from public.whatsapp_outbox where state = 'sending'), '8');
set local role anon;
select pg_temp.c('68b a second claim finds nothing new', (select jsonb_array_length(public.wa_claim('k-rule-run-only', 20))::text), '0');
select pg_temp.t('69 the bridge reports one sent', $q$ select public.wa_report('k-rule-run-only', (select (i->>'id')::uuid from jsonb_array_elements(pg_temp.g('claim')::jsonb) i where i->>'message_id' = pg_temp.g('a8')), true, null) $q$, 'ok');
select pg_temp.t('70 and the push of a2 failed', $q$ select public.wa_report('k-rule-run-only', (select (i->>'id')::uuid from jsonb_array_elements(pg_temp.g('claim')::jsonb) i where i->>'message_id' = pg_temp.g('a2') and i->>'kind' = 'push'), false, 'تجربة فشل') $q$, 'ok');
select pg_temp.t('70b a report cannot change a finished row', $q$ select public.wa_report('k-rule-run-only', (select (i->>'id')::uuid from jsonb_array_elements(pg_temp.g('claim')::jsonb) i where i->>'message_id' = pg_temp.g('a8')), false, 'x') $q$, 'ok');
reset role;
select pg_temp.c('71 states after the reports', (select string_agg(x.k || ':' || o.kind || ':' || o.state, ',' order by x.k, o.kind) from public.whatsapp_outbox o join v x on x.val = o.message_id::text where x.k in ('a2','a8')),
  'a2:push:failed,a2:urgent:sending,a8:push:sent');
select pg_temp.c('72 the sender is told the push did not arrive', (select count(*)::text from public.notifications where recipient = 'asst@t.test' and body like 'لم تصل رسالتك إلى واتساب Pro%'), '1');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('73 only the sender retries', $q$ select public.wa_retry((select (i->>'id')::uuid from jsonb_array_elements(pg_temp.g('claim')::jsonb) i where i->>'message_id' = pg_temp.g('a2') and i->>'kind' = 'push')) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.t('74 the assistant retries', $q$ select public.wa_retry((select (i->>'id')::uuid from jsonb_array_elements(pg_temp.g('claim')::jsonb) i where i->>'message_id' = pg_temp.g('a2') and i->>'kind' = 'push')) $q$, 'ok');

-- Switched off, nothing is lost --------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('75 the administrator switches the system number off', $q$ select public.wa_system_update('{"enabled":false}') $q$, 'ok');
reset role;
update public.system_whatsapp set heartbeat_at = null where id = 1;
set local role anon;
select pg_temp.c('76 a claim then returns nothing', (select public.wa_claim('k-rule-run-only', 20)::text), '[]');
reset role;
select pg_temp.c('77 the retried row stays queued, and the claim still counts as a heartbeat', (select count(*)::text from public.whatsapp_outbox where state = 'queued')
  || ' ' || (select (heartbeat_at is not null)::text from public.system_whatsapp where id = 1), '1 true');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('78 a level-3 message while off', $q$ insert into v values ('a9', public.chat_send(pg_temp.g('R1')::uuid,'text','نص a9',null,null,3::smallint,false)::text) $q$, 'ok');
select pg_temp.c('78b makes no outbox row', (pg_temp.rows('urgent') like '%a9%')::text, 'false');

-- An administrator unlinks; a member turns it off ----------------------------------------------------
select pg_temp.t('79 the director cannot unlink anyone', $q$ select public.wa_admin_unlink('wri@t.test') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('80 the administrator unlinks the writer', $q$ select public.wa_admin_unlink('wri@t.test') $q$, 'ok');
reset role;
select pg_temp.c('81 the writer''s link and rows are gone, and the writer was told', (select count(*)::text from public.whatsapp_links where email = 'wri@t.test')
  || ' ' || (select count(*)::text from public.whatsapp_outbox where recipient = 'wri@t.test')
  || ' ' || (select count(*)::text from public.notifications where recipient = 'wri@t.test' and body like 'قطع مسؤول النظام ربط رقم واتساب%'), '0 0 1');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c3');
select pg_temp.t('82 the producer turns WhatsApp off', $q$ select public.wa_set('{"on":false}') $q$, 'ok');
reset role;
select pg_temp.c('83 the number is deleted with it', (select count(*)::text from public.whatsapp_links where email = 'pro@t.test' or phone = '+99900000003'), '0');
reset role;

select * from (
  select n, k, v, expect from r where v is distinct from expect
  union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r) z order by n;
rollback;

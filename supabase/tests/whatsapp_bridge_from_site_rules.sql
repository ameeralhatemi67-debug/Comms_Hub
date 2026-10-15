-- Action_Plan.md B9 (migration 20261015200000_whatsapp_bridge_from_site.sql): the Director makes the
-- WhatsApp bridge's key from the site. Who may, that the fingerprint is what the database checks,
-- that the pair is read only by the server and replaced as one row, and that no key or secret is in
-- anything a person can read. One transaction, rolled back at the end (the real fingerprint is
-- untouched); the site's server key is replaced by a throwaway inside it only.
-- Result: qa/whatsapp-bridge-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to public; grant usage on sequence r_n_seq to public;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('dir@t.test','Dir','director','{}',false),('asst@t.test','Asst','assistant','{}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000d1','dir@t.test',now()),('00000000-0000-0000-0000-0000000000b1','asst@t.test',now());
insert into public.mail_server_key (id, key_hash) values (1, encode(sha256(convert_to('k-rule-run-only', 'UTF8')), 'hex'))
  on conflict (id) do update set key_hash = excluded.key_hash;
create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
grant execute on function pg_temp.who(text), pg_temp.t(text,text,text), pg_temp.c(text,text,text) to public;
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.c('01 the director holds the system number right', public.has_capability('whatsapp.system.manage', null)::text, 'true');
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.c('02 the assistant does not', public.has_capability('whatsapp.system.manage', null)::text, 'false');
select pg_temp.t('03 the assistant cannot issue a key', $q$ select public.wa_bridge_issue('k-rule-run-only', repeat('a', 64), '{"key":"KEYMARK","secret":"SECRETMARK-link"}') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('04 a wrong server key is refused', $q$ select public.wa_bridge_issue('wrong', repeat('a', 64), '{"key":"KEYMARK","secret":"SECRETMARK-link"}') $q$, 'ERR FORBIDDEN');
select pg_temp.t('05 a malformed fingerprint is refused', $q$ select public.wa_bridge_issue('k-rule-run-only', 'not-hex', '{"key":"KEYMARK","secret":"SECRETMARK-link"}') $q$, 'ERR KEY_INVALID');
select pg_temp.t('06 the director issues the key', $q$ select public.wa_bridge_issue('k-rule-run-only', encode(sha256(convert_to('KEYMARK-bridge-key', 'UTF8')), 'hex'), '{"key":"KEYMARK-bridge-key","secret":"SECRETMARK-link"}') $q$, 'ok');
select pg_temp.c('09 the server reads the pair', (select (public.integration_creds('k-rule-run-only', 'whatsapp_bridge', 'اختبار')->>'secret')), '{"key":"KEYMARK-bridge-key","secret":"SECRETMARK-link"}');
select pg_temp.c('10 the settings list shows it connected without the pair', (select count(*)::text from jsonb_array_elements(public.int_list()) x where x->>'type' = 'whatsapp_bridge' and x->>'state' = 'connected' and x::text not like '%KEYMARK%' and x::text not like '%SECRETMARK%'), '1');
reset role;
select pg_temp.c('07 the fingerprint is what the database checks', public.wa_key_ok('KEYMARK-bridge-key')::text, 'true');
select pg_temp.c('08 a different key is not the bridge', public.wa_key_ok('other')::text, 'false');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('11 issuing again replaces the key', $q$ select public.wa_bridge_issue('k-rule-run-only', encode(sha256(convert_to('KEYMARK-second', 'UTF8')), 'hex'), '{"key":"KEYMARK-second","secret":"SECRETMARK-link2"}') $q$, 'ok');
select pg_temp.c('13 one integration row', (select count(*)::text from jsonb_array_elements(public.int_list()) x where x->>'type' = 'whatsapp_bridge'), '1');
reset role;
select pg_temp.c('12 the old key no longer opens the bridge', public.wa_key_ok('KEYMARK-bridge-key')::text, 'false');
select pg_temp.c('12b the new one does', public.wa_key_ok('KEYMARK-second')::text, 'true');
select pg_temp.c('14 no key or secret in events, integrations or the key table', (
  (select count(*) from public.integration_events where data::text like '%KEYMARK%' or data::text like '%SECRETMARK%')
  + (select count(*) from public.integrations where row_to_json(integrations)::text like '%KEYMARK%' or row_to_json(integrations)::text like '%SECRETMARK%')
  + (select count(*) from public.whatsapp_server_key where key_hash like '%KEYMARK%'))::text, '0');
select n, k, v, expect from r where v is distinct from expect
union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r
order by n;
rollback;

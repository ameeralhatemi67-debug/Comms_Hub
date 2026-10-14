-- Permissions Step P4, second part: the boolean `urgent` column is removed now that nothing
-- reads it (Permissions_Plan.md 7 and 11, "removed in the next migration once nothing reads
-- it"). Checked before writing this, on 2026-10-14: no view, policy, index or trigger depends
-- on the column; the Realtime publication carries the whole table (no column list); the only
-- function that names it is chat_send, which wrote it for the interface; the interface now
-- reads `urgency` (src/lib/chat/rules.ts, src/components/chat/). Level 3 is what `urgent`
-- meant, so nothing is lost.
--
-- chat_send is replaced through pg_get_functiondef, as earlier migrations do, so the rest of
-- the function stays exactly as applied; the migration stops if the text it expects is gone.

do $$
declare src text;
begin
  src := pg_get_functiondef('public.chat_send(uuid,text,text,uuid,jsonb,smallint,boolean)'::regprocedure);
  if position('reply_to, forwarded, urgent, urgency, data)' in src) = 0
     or position('coalesce(p_forward,false), v_u = 3, v_u, d)' in src) = 0 then
    raise exception 'chat_send changed: review the urgency migration';
  end if;
  src := replace(src, 'reply_to, forwarded, urgent, urgency, data)', 'reply_to, forwarded, urgency, data)');
  src := replace(src, 'coalesce(p_forward,false), v_u = 3, v_u, d)', 'coalesce(p_forward,false), v_u, d)');
  execute src;
end $$;

alter table public.chat_messages drop column urgent;

'use strict';
// What the bridge may send, and to whom (Permissions_Plan.md 8.1, 8.6). Reduced from the
// Hedayah bridge's policy: that bridge answered incoming messages; this one never reads or
// answers anything (D-6). The only destinations are the ones in rows the site has just
// claimed for it, which the database routed from room membership and verified links. A
// destination from anywhere else (a message, a log, a typo in code) is refused.
const KINDS=new Set(['urgent','push','code','test']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_TEXT=4096;

/** A number in international form, as the database stores it. */
function validNumber(to){ return typeof to==='string' && /^\+[1-9][0-9]{7,14}$/.test(to); }
/** The WhatsApp chat id of a number. */
function jidOf(to){ if(!validNumber(to))throw Object.assign(Error('Bad number'),{code:'bad_number'}); return to.slice(1)+'@c.us'; }

/** Splits a claimed batch into what may be sent and what is refused, with the reason. */
function acceptBatch(items){
  const ok=[],refused=[],seen=new Set();
  for(const it of Array.isArray(items)?items:[]){
    const id=typeof it?.id==='string'?it.id:'';
    let reason='';
    if(!UUID.test(id))reason='bad_id';
    else if(seen.has(id))reason='duplicate_id';
    else if(!KINDS.has(it.kind))reason='bad_kind';
    else if(!validNumber(it.to))reason='bad_number';
    else if(typeof it.text!=='string'||!it.text.trim())reason='empty_text';
    else if(it.text.length>MAX_TEXT)reason='text_too_long';
    if(UUID.test(id))seen.add(id);
    if(reason){ if(UUID.test(id))refused.push({id,reason}); continue; }
    ok.push({id,kind:it.kind,to:it.to,text:it.text});
  }
  return {ok,refused};
}

/**
 * The only way the bridge sends: a sender bound to one claimed batch. Asking it to send to a
 * number that is not the claimed number of that row throws, and nothing is sent.
 */
function guardedSender(provider,batch){
  const claimed=new Map(batch.map(it=>[it.id,it.to]));
  return async function send(id,to,text,kind){
    if(!claimed.has(id)||claimed.get(id)!==to)throw Object.assign(Error('Destination not in a claimed row'),{code:'destination_not_claimed'});
    claimed.delete(id); // once per row
    return kind==='code'?provider.sendCode(to,text):provider.sendMessage(to,text);
  };
}

module.exports={validNumber,jidOf,acceptBatch,guardedSender,MAX_TEXT};

'use strict';
// The real WhatsAppProvider (src/lib/whatsapp/provider.ts has the interface and the fake):
// sendCode, sendMessage, status, over a WhatsApp Web client (whatsapp-web.js, pinned). It
// sends to a number only after asking WhatsApp whether that number is registered, never
// marks anything seen, and has no way to read a message.
const {jidOf}=require('./policy.cjs');

function createProvider(client){
  let ready=false,note='starting';
  const set=(r,n)=>{ready=r;note=n;};
  async function send(to,text){
    if(!ready)return {ok:false,code:'not_ready'};
    const id=await client.getNumberId(jidOf(to).split('@')[0]);
    if(!id||!id._serialized)return {ok:false,code:'not_on_whatsapp'};
    await client.sendMessage(id._serialized,text,{sendSeen:false,linkPreview:false});
    return {ok:true};
  }
  return {
    set,
    sendCode:(to,text)=>send(to,text),
    sendMessage:(to,text)=>send(to,text),
    status:async()=>({ready,note}),
  };
}

module.exports={createProvider};

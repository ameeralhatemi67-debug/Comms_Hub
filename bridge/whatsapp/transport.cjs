'use strict';
// Talking to the site (Permissions_Plan.md 8.1): one door, POST /api/whatsapp/dispatch, with
// WHATSAPP_SERVER_KEY as a bearer token. The bridge reports what it sent, says it is alive,
// and claims what is queued. The site never calls the bridge, and this computer is never
// exposed. Adapted from the Hedayah bridge's gateway(); no message text, number or key is
// ever put in an error or a log.
function siteClient(fetcher,base,key,timeoutMs=30000){
  const url=String(base||'').replace(/\/+$/,'')+'/api/whatsapp/dispatch';
  if(!/^https?:\/\//.test(url))throw Object.assign(Error('Set COMMS_SITE_URL to the site address'),{code:'no_site'});
  if(!key)throw Object.assign(Error('Set WHATSAPP_SERVER_KEY'),{code:'no_key'});
  return async function dispatch(body){
    const response=await fetcher(url,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
      body:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs)});
    if(!response.ok)throw Object.assign(Error('Site refused the request'),{code:'site_rejected',http_status:response.status});
    const data=await response.json();
    return {items:Array.isArray(data?.items)?data.items:[]};
  };
}

/** A safe description of an error: a code and a stage, never content. */
function errorInfo(error,stage){
  let code=error&&error.code;
  if(!['site_rejected','destination_not_claimed','bad_number','no_site','no_key','not_on_whatsapp','not_ready'].includes(code)){
    const m=String(error&&error.message||'');
    code=/Execution context was destroyed|Target closed|Session closed|Protocol error/.test(m)?'browser_session_lost':
      error&&(error.name==='TimeoutError'||error.name==='AbortError')?'request_timeout':stage==='send'?'send_failed':'transport_error';
  }
  return {reason:code,stage,http_status:Number(error&&error.http_status)||0};
}

/** Words for the site's failure list, in the interface's language. */
const REASON_AR={
  not_on_whatsapp:'الرقم غير مسجّل في واتساب.',
  not_ready:'جسر واتساب غير مرتبط الآن.',
  browser_session_lost:'انقطعت جلسة واتساب في الجسر.',
  request_timeout:'انتهت المهلة قبل الإرسال.',
  send_failed:'رفض واتساب الإرسال.',
  destination_not_claimed:'رفض الجسر وجهة ليست في الطابور.',
  bad_number:'رقم غير صالح.',
  bad_kind:'نوع غير معروف.',
  empty_text:'لا نص للإرسال.',
  text_too_long:'النص أطول من المسموح.',
  duplicate_id:'صف مكرر.',
};
const reasonAr=(code)=>REASON_AR[code]||'تعذّر الإرسال.';

module.exports={siteClient,errorInfo,reasonAr};

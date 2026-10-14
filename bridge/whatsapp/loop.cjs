'use strict';
// The polling loop (Permissions_Plan.md 8.1, 2): every few seconds, report what was sent last
// time, say it is alive, claim queued rows, send each to its own claimed number through the
// guarded sender, and report. The timer is here, on the owner's computer, not in the site (D-7).
// While the provider is not linked, it still says it is alive but claims nothing, so rows
// wait in the queue and nothing is lost.
const {acceptBatch,guardedSender}=require('./policy.cjs');
const {errorInfo,reasonAr}=require('./transport.cjs');

function createLoop({dispatch,provider,batch=5,log=()=>{}}){
  let pending=[]; // reports not yet accepted by the site
  let failures=0;

  async function tick(){
    const status=await provider.status().catch(()=>({ready:false,note:'status unavailable'}));
    let items=[];
    try{
      const res=await dispatch({reports:pending,note:status.note,claim:status.ready?batch:0});
      pending=[];
      items=res.items;
      failures=0;
    }catch(error){
      failures++;
      log('site',errorInfo(error,'dispatch'));
      return {sent:0,refused:0,failed:0,backoff:true};
    }
    if(!items.length)return {sent:0,refused:0,failed:0};
    const {ok,refused}=acceptBatch(items);
    const reports=refused.map(r=>({id:r.id,ok:false,error:reasonAr(r.reason)}));
    const send=guardedSender(provider,ok);
    let sent=0,failed=0;
    for(const it of ok){
      try{
        const r=await send(it.id,it.to,it.text,it.kind);
        if(r&&r.ok){sent++;reports.push({id:it.id,ok:true});}
        else{failed++;reports.push({id:it.id,ok:false,error:reasonAr(r&&r.code||'send_failed')});}
      }catch(error){
        failed++;
        const info=errorInfo(error,'send');
        log('send',{id:it.id,...info});
        reports.push({id:it.id,ok:false,error:reasonAr(info.reason)});
      }
    }
    // Report at once, so the sender sees the result without waiting for the next tick.
    try{await dispatch({reports,claim:0});}catch(error){pending=reports;log('site',errorInfo(error,'report'));}
    return {sent,refused:refused.length,failed};
  }

  /** Wait before the next tick: the interval, longer after site errors (up to a minute). */
  const delay=(intervalMs)=>failures?Math.min(60000,intervalMs*2**Math.min(failures,4)):intervalMs;

  return {tick,delay,get pending(){return pending;}};
}

module.exports={createLoop};

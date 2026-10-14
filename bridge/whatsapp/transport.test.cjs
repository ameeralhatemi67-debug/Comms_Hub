const test=require('node:test');const assert=require('node:assert/strict');
const {siteClient,errorInfo,reasonAr}=require('./transport.cjs');

test('one door: POST /api/whatsapp/dispatch with the key as a bearer token',async()=>{
  const calls=[];
  const fetcher=async(url,init)=>(calls.push({url,init}),{ok:true,json:async()=>({items:[{id:'x'}]})});
  const dispatch=siteClient(fetcher,'https://hub.example/','k-test',1000);
  assert.deepEqual(await dispatch({claim:5}),{items:[{id:'x'}]});
  assert.equal(calls[0].url,'https://hub.example/api/whatsapp/dispatch');
  assert.equal(calls[0].init.method,'POST');
  assert.equal(calls[0].init.headers.Authorization,'Bearer k-test');
  assert.deepEqual(JSON.parse(calls[0].init.body),{claim:5});
  const odd=siteClient(async()=>({ok:true,json:async()=>({items:'nope'})}),'https://hub.example','k');
  assert.deepEqual(await odd({}),{items:[]});
});

test('a refusal carries a status, never the key, a number or a text',async()=>{
  const dispatch=siteClient(async()=>({ok:false,status:401,json:async()=>({error:'forbidden'})}),'https://hub.example','secret-key-value');
  try{await dispatch({reports:[{id:'a',ok:false,error:'+99900000001 نص'}]});assert.fail();}
  catch(e){const info=errorInfo(e,'dispatch');assert.deepEqual(info,{reason:'site_rejected',stage:'dispatch',http_status:401});assert.ok(!JSON.stringify(info).includes('secret'));}
  assert.throws(()=>siteClient(fetch,'','k'),{code:'no_site'});
  assert.throws(()=>siteClient(fetch,'https://hub.example',''),{code:'no_key'});
});

test('errors are named by kind, and worded in Arabic for the site',()=>{
  assert.equal(errorInfo(new Error('Protocol error (Runtime.callFunctionOn): Target closed'),'send').reason,'browser_session_lost');
  assert.equal(errorInfo(Object.assign(new Error('x'),{name:'TimeoutError'}),'dispatch').reason,'request_timeout');
  assert.equal(errorInfo(new Error('anything'),'send').reason,'send_failed');
  assert.equal(reasonAr('not_on_whatsapp'),'الرقم غير مسجّل في واتساب.');
  assert.equal(reasonAr('unknown'),'تعذّر الإرسال.');
});

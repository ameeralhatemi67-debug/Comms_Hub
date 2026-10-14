// The bridge against a fake site: a real HTTP server on 127.0.0.1 that behaves like
// /api/whatsapp/dispatch (key check, a queue, claim marks rows sending, reports finish them).
// Offline: no WhatsApp, no internet. +999 numbers belong to no country.
const test=require('node:test');const assert=require('node:assert/strict');const http=require('node:http');
const {EventEmitter}=require('node:events');
const {siteClient}=require('./transport.cjs');
const {createLoop}=require('./loop.cjs');
const {createBridge,EVENTS}=require('./bridge.cjs');

const KEY='k-fake-site-only';
const U=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

function fakeSite(){
  const s={queue:[],sending:new Map(),reports:[],notes:[],calls:0,failNext:0};
  s.server=http.createServer((req,res)=>{
    let body='';req.on('data',d=>body+=d);req.on('end',()=>{
      s.calls++;
      const send=(code,obj)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(obj));};
      if(req.method!=='POST'||req.url!=='/api/whatsapp/dispatch')return send(404,{});
      if(req.headers.authorization!=='Bearer '+KEY)return send(401,{error:'forbidden'});
      if(s.failNext>0){s.failNext--;return send(502,{error:'claim failed'});}
      const b=JSON.parse(body||'{}');
      for(const r of b.reports||[]){if(s.sending.has(r.id)){s.reports.push(r);s.sending.delete(r.id);}}
      if(typeof b.note==='string')s.notes.push(b.note);
      const n=Math.min(20,Math.max(0,b.claim|0));
      const items=s.queue.splice(0,n);
      for(const it of items)s.sending.set(it.id,it);
      send(200,{items});
    });
  });
  return new Promise(r=>s.server.listen(0,'127.0.0.1',()=>{s.base=`http://127.0.0.1:${s.server.address().port}`;r(s);}));
}

function fakeProvider(){
  const p={ready:true,sent:[],notOn:new Set(),throwFor:new Set(),note:'fake'};
  const send=kind=>async(to,text)=>{
    if(!p.ready)return {ok:false,code:'not_ready'};
    if(p.throwFor.has(to))throw new Error('Protocol error: Target closed');
    if(p.notOn.has(to))return {ok:false,code:'not_on_whatsapp'};
    p.sent.push({kind,to,text});return {ok:true};
  };
  p.sendCode=send('code');p.sendMessage=send('msg');p.status=async()=>({ready:p.ready,note:p.ready?'linked':'not linked'});
  return p;
}

const row=(n,to,kind='urgent',text=`رسالة ${n}`)=>({id:U(n),kind,to,text});

test('polling: claims, sends each row to its own claimed number, reports, and the queue empties',async t=>{
  const site=await fakeSite();t.after(()=>site.server.close());
  site.queue.push(row(1,'+99900000001'),row(2,'+99900000002','push'),row(3,'+99900000003','code','رمز التحقق: 123456'));
  const provider=fakeProvider();
  const loop=createLoop({dispatch:siteClient(fetch,site.base,KEY),provider,batch:5});
  assert.deepEqual(await loop.tick(),{sent:3,refused:0,failed:0});
  assert.deepEqual(provider.sent,[{kind:'msg',to:'+99900000001',text:'رسالة 1'},{kind:'msg',to:'+99900000002',text:'رسالة 2'},{kind:'code',to:'+99900000003',text:'رمز التحقق: 123456'}]);
  assert.deepEqual(site.reports.map(r=>[r.id,r.ok]),[[U(1),true],[U(2),true],[U(3),true]]);
  assert.equal(site.queue.length,0);assert.equal(site.sending.size,0);
  assert.deepEqual(site.notes,['linked'],'the heartbeat carries the provider\'s state');
  assert.deepEqual(await loop.tick(),{sent:0,refused:0,failed:0});
});

test('not linked: it says so, claims nothing, and the queue waits untouched',async t=>{
  const site=await fakeSite();t.after(()=>site.server.close());
  site.queue.push(row(1,'+99900000001'));
  const provider=fakeProvider();provider.ready=false;
  const loop=createLoop({dispatch:siteClient(fetch,site.base,KEY),provider});
  await loop.tick();
  assert.equal(site.queue.length,1);assert.equal(provider.sent.length,0);assert.deepEqual(site.notes,['not linked']);
});

test('refusal: a row with a bad destination, kind or duplicate id is not sent, and is reported failed with its reason',async t=>{
  const site=await fakeSite();t.after(()=>site.server.close());
  site.queue.push(row(1,'+99900000001'),row(2,'120363000000000000@g.us'),row(3,'status@broadcast'),{...row(4,'+99900000004'),kind:'reply'},row(5,'+99900000005'));
  const provider=fakeProvider();provider.notOn.add('+99900000005');
  const loop=createLoop({dispatch:siteClient(fetch,site.base,KEY),provider});
  assert.deepEqual(await loop.tick(),{sent:1,refused:3,failed:1});
  assert.deepEqual(provider.sent.map(s=>s.to),['+99900000001'],'only the valid claimed destination');
  const by=Object.fromEntries(site.reports.map(r=>[r.id,r]));
  assert.equal(by[U(2)].error,'رقم غير صالح.');assert.equal(by[U(3)].error,'رقم غير صالح.');assert.equal(by[U(4)].error,'نوع غير معروف.');
  assert.equal(by[U(5)].error,'الرقم غير مسجّل في واتساب.');assert.equal(by[U(1)].ok,true);
});

test('a lost session fails the row, keeps going, and reports without content',async t=>{
  const site=await fakeSite();t.after(()=>site.server.close());
  site.queue.push(row(1,'+99900000001'),row(2,'+99900000002'));
  const provider=fakeProvider();provider.throwFor.add('+99900000001');
  const logs=[];
  const loop=createLoop({dispatch:siteClient(fetch,site.base,KEY),provider,log:(...a)=>logs.push(JSON.stringify(a))});
  assert.deepEqual(await loop.tick(),{sent:1,refused:0,failed:1});
  assert.equal(site.reports.find(r=>r.id===U(1)).error,'انقطعت جلسة واتساب في الجسر.');
  assert.ok(logs.length&&logs.every(l=>!l.includes('+999')&&!l.includes('رسالة')),'logs carry ids and reasons only');
});

test('the site down: reports are kept and sent next time; the wait grows; a wrong key claims nothing',async t=>{
  const site=await fakeSite();t.after(()=>site.server.close());
  site.queue.push(row(1,'+99900000001'));
  const provider=fakeProvider();
  const loop=createLoop({dispatch:siteClient(fetch,site.base,KEY),provider});
  // The claim succeeds, then the report call fails once.
  const dispatch=siteClient(fetch,site.base,KEY);
  let n=0;
  const flaky=createLoop({dispatch:async b=>{n++;if(n===2)throw Object.assign(new Error('down'),{code:'site_rejected',http_status:502});return dispatch(b);},provider});
  await flaky.tick();
  assert.equal(flaky.pending.length,1,'the report waits');
  assert.equal(site.reports.length,0);
  await flaky.tick();
  assert.deepEqual(site.reports.map(r=>r.id),[U(1)],'and reaches the site on the next tick');
  site.failNext=1;
  assert.equal((await loop.tick()).backoff,true);
  assert.equal(loop.delay(5000),10000);
  const stranger=createLoop({dispatch:siteClient(fetch,site.base,'wrong-key'),provider});
  site.queue.push(row(9,'+99900000009'));
  assert.equal((await stranger.tick()).backoff,true);
  assert.equal(site.queue.length,1,'nothing claimed without the key');
});

test('one way: the bridge listens to no incoming message, call or receipt, and answers nothing',async t=>{
  const site=await fakeSite();t.after(()=>site.server.close());
  const registered=[];let sendCalls=0;let initialised=0;
  class FakeClient extends EventEmitter{
    constructor(opts){super();this.opts=opts;}
    on(ev,fn){registered.push(ev);return super.on(ev,fn);}
    async initialize(){initialised++;}
    async destroy(){}
    async getNumberId(n){return {_serialized:n+'@c.us'};}
    async sendMessage(){sendCalls++;}
  }
  class FakeAuth{constructor(o){this.o=o;}}
  const printed=[];
  const out={log:(...a)=>printed.push(a.join(' ')),error:()=>{}};
  const QRCode={toString:async(qr,o)=>`[terminal QR of ${qr.length} chars, ${o.type}]`};
  const b=createBridge({Client:FakeClient,LocalAuth:FakeAuth,QRCode,env:{COMMS_SITE_URL:site.base,WHATSAPP_SERVER_KEY:KEY,COMMS_WA_DATA:require('node:os').tmpdir()},out,intervalMs:60000,chrome:'x'});
  assert.deepEqual([...new Set(registered)].sort(),[...EVENTS].sort());
  for(const ev of ['message','message_create','message_ack','message_revoke_everyone','call','group_join','change_state'])assert.ok(!registered.includes(ev),ev);
  assert.equal(b.client.opts.puppeteer.headless,true);
  // QR in this terminal.
  b.client.emit('qr','2@abc,def');
  await new Promise(r=>setImmediate(r));
  assert.ok(printed.some(l=>l.includes('terminal QR')),'the QR is drawn in the terminal');
  assert.deepEqual(await b.provider.status(),{ready:false,note:'waiting for the QR link'});
  // An incoming message changes nothing and sends nothing.
  b.client.emit('message',{from:'99900000001@c.us',body:'رد',fromMe:false});
  b.client.emit('message_create',{from:'99900000001@c.us',body:'رد',fromMe:false});
  b.client.emit('ready');
  assert.deepEqual(await b.provider.status(),{ready:true,note:'linked'});
  // Only a claimed row sends.
  site.queue.push(row(1,'+99900000001'));
  assert.deepEqual(await b.loop.tick(),{sent:1,refused:0,failed:0});
  assert.equal(sendCalls,1);
  b.client.emit('disconnected');
  assert.equal((await b.provider.status()).ready,false);
  await b.stop();
  assert.equal(initialised,0,'the test never started a real session');
});

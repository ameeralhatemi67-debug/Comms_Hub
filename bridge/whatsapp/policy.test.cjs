const test=require('node:test');const assert=require('node:assert/strict');
const {validNumber,jidOf,acceptBatch,guardedSender,MAX_TEXT}=require('./policy.cjs');
// +999 is a country code assigned to no country: no real number is used in these tests.
const U=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const item=(n,over={})=>({id:U(n),kind:'urgent',to:'+99900000001',text:'نص',...over});

test('numbers in international form only',()=>{
  assert.equal(validNumber('+99900000001'),true);
  for(const bad of ['99900000001','+0999000001','+999 000 001','+99900000001@c.us','123@g.us','',null,undefined,'+9990000000000000'])assert.equal(validNumber(bad),false,String(bad));
  assert.equal(jidOf('+99900000001'),'99900000001@c.us');
  assert.throws(()=>jidOf('status@broadcast'));
});

test('a claimed batch: what may go, and what is refused with its reason',()=>{
  const {ok,refused}=acceptBatch([item(1),item(2,{to:'123@g.us'}),item(3,{kind:'reply'}),item(4,{text:'  '}),item(5,{text:'x'.repeat(MAX_TEXT+1)}),item(1,{to:'+99900000002'}),{id:'nope',kind:'urgent',to:'+99900000001',text:'x'},item(6,{kind:'code'})]);
  assert.deepEqual(ok.map(i=>i.id),[U(1),U(6)]);
  assert.deepEqual(refused,[{id:U(2),reason:'bad_number'},{id:U(3),reason:'bad_kind'},{id:U(4),reason:'empty_text'},{id:U(5),reason:'text_too_long'},{id:U(1),reason:'duplicate_id'}]);
  assert.deepEqual(acceptBatch(null),{ok:[],refused:[]});
});

test('the guarded sender refuses any destination not in a claimed row, and sends each row once',async()=>{
  const sent=[];
  const provider={sendCode:async(to,t)=>(sent.push(['code',to,t]),{ok:true}),sendMessage:async(to,t)=>(sent.push(['msg',to,t]),{ok:true})};
  const send=guardedSender(provider,[item(1),item(2,{kind:'code',to:'+99900000002'})]);
  await assert.rejects(send(U(1),'+99900000009','x','urgent'),{code:'destination_not_claimed'});
  await assert.rejects(send(U(9),'+99900000001','x','urgent'),{code:'destination_not_claimed'});
  assert.deepEqual(await send(U(1),'+99900000001','نص','urgent'),{ok:true});
  await assert.rejects(send(U(1),'+99900000001','again','urgent'),{code:'destination_not_claimed'},'once per row');
  await send(U(2),'+99900000002','رمز','code');
  assert.deepEqual(sent,[['msg','+99900000001','نص'],['code','+99900000002','رمز']]);
});

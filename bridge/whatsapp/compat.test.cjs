// The reviewed compatibility transform (copied from the Hedayah bridge with its test). It needs
// the pinned library: from this folder's node_modules after `npm ci`, or from a folder given in
// COMMS_WA_LIB (a node_modules directory holding whatsapp-web.js 1.34.7, read only). Without
// either it is skipped and says so.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const {patchLoadUtils}=require('./compat.cjs');
function library(){
  for(const base of [__dirname,process.env.COMMS_WA_LIB&&path.dirname(process.env.COMMS_WA_LIB)].filter(Boolean)){
    try{
      const pkg=require(require.resolve('whatsapp-web.js/package.json',{paths:[base]}));
      const utils=require(require.resolve('whatsapp-web.js/src/util/Injected/Utils',{paths:[base]}));
      return {version:pkg.version,utils};
    }catch{}
  }
  return null;
}
const lib=library();
test('the transform refuses code it does not recognise',()=>assert.throws(()=>patchLoadUtils('unrecognized future code')));
test('compatibility normalizes message keys on the pinned library',{skip:lib?false:'whatsapp-web.js 1.34.7 is not installed here; run npm ci, or set COMMS_WA_LIB'},async()=>{
  assert.equal(lib.version,'1.34.7');
  const original=lib.utils.LoadUtils.toString();
  const seen=[];
  const msg={serialize:()=>({id:{$1:'new-message'},body:'hello'})};
  const modules={WALinkify:{findLinks:()=>[]},WAWebCollections:{Msg:{get:key=>{seen.push(key);if(!key)throw Error('Missing key');return msg}}}};
  const context={window:{require:name=>modules[name]}};
  vm.runInNewContext('('+patchLoadUtils(original)+')()',context);
  assert.equal(context.window.WWebJS.getMessageModel(msg).id._serialized,'new-message');
  const chat={serialize:()=>({msgs:[{}]}),lastReceivedKey:{$1:'new-message'}};
  const result=await context.window.WWebJS.getChatModel(chat);
  assert.equal(result.lastMessage.id._serialized,'new-message');assert.deepEqual(seen,['new-message']);
});

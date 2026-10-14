'use strict';
// Copied from the Hedayah bridge (D:/Agents/main/projects/hida/bridge/compat.cjs), unchanged
// but for the marker name. whatsapp-web.js 1.34.7 still expects _serialized on MsgKey; new WA
// Web builds use $1. Scope: message keys only. Never infer a recipient.
// Background: https://github.com/wwebjs/whatsapp-web.js/pull/201850
function patchLoadUtils(source){
  const replacements=[
    ['newMsgKey._serialized','(newMsgKey._serialized ?? newMsgKey.$1)',1],
    ['msg.id._serialized','(msg.id._serialized ?? msg.id.$1)',1],
    ['chat.lastReceivedKey._serialized','(chat.lastReceivedKey._serialized ?? chat.lastReceivedKey.$1)',2],
    ['const msg = message.serialize();','const msg = message.serialize();\n        msg.id = {...msg.id, _serialized: msg.id._serialized ?? msg.id.$1};',1],
  ];
  // Validate the installed source before transforming any of it.
  for(const [old,,count] of replacements)if(source.split(old).length-1!==count)throw Error('WhatsApp compatibility patch no longer matches the installed version');
  for(const [old,replacement] of replacements)source=source.split(old).join(replacement);
  return source;
}
function install(){
  const version=require('whatsapp-web.js/package.json').version;
  if(version!=='1.34.7')throw Error('Review WhatsApp compatibility before changing the pinned bridge version');
  const utils=require('whatsapp-web.js/src/util/Injected/Utils');
  if(utils.LoadUtils.commsHubPatched)return;
  // Transform the locally installed, pinned function before Client captures it. No remote code is loaded.
  utils.LoadUtils=Function('return ('+patchLoadUtils(utils.LoadUtils.toString())+')')();
  utils.LoadUtils.commsHubPatched=true;
}
module.exports={install,patchLoadUtils};

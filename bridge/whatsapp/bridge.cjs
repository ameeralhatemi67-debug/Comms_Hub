'use strict';
// The Comms Hub's WhatsApp pull bridge (Permissions_Plan.md 8.1, D-6 to D-8). Run on the
// owner's computer with run-bridge.bat. It links the system number by QR in this terminal,
// then every few seconds asks the site what is queued, sends each message to the number the
// database routed it to, and reports. One way: it listens to no incoming message, call or
// receipt, and answers nothing. Secrets come from bridge/whatsapp/.env (never committed).
const fs=require('node:fs');
const path=require('node:path');
const {siteClient,errorInfo}=require('./transport.cjs');
const {createLoop}=require('./loop.cjs');
const {createProvider}=require('./provider.cjs');

/** The only client events the bridge listens to: the link's life, never messages. */
const EVENTS=['qr','authenticated','ready','auth_failure','disconnected'];

function readEnv(file){
  const env={};
  if(!fs.existsSync(file))return env;
  for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){
    const m=line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if(m&&!line.trim().startsWith('#'))env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');
  }
  return env;
}

function findChrome(env){
  return [env.COMMS_CHROME_PATH,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p=>p&&fs.existsSync(p));
}

/**
 * Builds the bridge from its parts, so tests can run it with a fake client and a fake site.
 * Returns {client, provider, loop, start, stop}.
 */
function createBridge({Client,LocalAuth,QRCode,env,fetcher=fetch,out=console,intervalMs=5000,chrome}){
  const dispatch=siteClient(fetcher,env.COMMS_SITE_URL,env.WHATSAPP_SERVER_KEY);
  const dataPath=path.resolve(env.COMMS_WA_DATA||path.join(__dirname,'.session'));
  const client=new Client({authStrategy:new LocalAuth({clientId:'comms-hub',dataPath}),
    puppeteer:{headless:true,executablePath:chrome},takeoverOnConflict:false});
  const provider=createProvider(client);
  const log=(stage,info)=>out.error(new Date().toISOString(),stage,JSON.stringify(info));
  const loop=createLoop({dispatch,provider,log});
  let timer=null,stopped=false;

  client.on('qr',async qr=>{
    provider.set(false,'waiting for the QR link');
    out.log('\nامسح هذا الرمز من هاتف رقم النظام: واتساب، الأجهزة المرتبطة، ربط جهاز.\nScan with the system number: WhatsApp, Linked devices, Link a device.\n');
    try{out.log(await QRCode.toString(qr,{type:'terminal',small:true}));}catch{out.log('Could not draw the QR code in this terminal.');}
  });
  client.on('authenticated',()=>provider.set(false,'authenticated, syncing'));
  client.on('ready',()=>{provider.set(true,'linked');out.log('Linked. Sending what the site has queued.');});
  client.on('auth_failure',()=>{provider.set(false,'link refused, scan again');out.log('The link was refused. Restart and scan again.');});
  client.on('disconnected',()=>{provider.set(false,'disconnected');out.log('WhatsApp disconnected this device. Restart and scan again.');});

  async function run(){
    if(stopped)return;
    try{const r=await loop.tick();if(r.sent||r.failed||r.refused)out.log(new Date().toISOString(),`sent ${r.sent}, failed ${r.failed}, refused ${r.refused}`);}
    catch(error){log('tick',errorInfo(error,'tick'));}
    if(!stopped)timer=setTimeout(run,loop.delay(intervalMs));
  }
  return {
    client,provider,loop,
    start(){run();return client.initialize();},
    async stop(){stopped=true;clearTimeout(timer);try{await client.destroy();}catch{}},
  };
}

if(require.main===module){
  require('./compat.cjs').install();
  const {Client,LocalAuth}=require('whatsapp-web.js');
  const QRCode=require('qrcode');
  const env={...readEnv(path.join(__dirname,'.env')),...process.env};
  const chrome=findChrome(env);
  if(!chrome){console.error('Set COMMS_CHROME_PATH in bridge/whatsapp/.env to an installed Edge or Chrome.');process.exit(1);}
  let bridge;
  try{bridge=createBridge({Client,LocalAuth,QRCode,env,chrome});}
  catch(e){console.error(e.message);process.exit(1);}
  const stop=async()=>{await bridge.stop();process.exit(0);};
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
  bridge.start().catch(e=>{console.error('WhatsApp initialisation failed:',errorInfo(e,'start').reason);process.exit(1);});
}

module.exports={createBridge,readEnv,EVENTS};

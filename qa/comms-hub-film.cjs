const path=require('node:path');
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../videos/comms-hub-launch');
execFileSync(process.execPath,[path.join(root,'qa/verify.cjs')],{stdio:'inherit',windowsHide:true});
fs.copyFileSync(path.join(root,'qa/verification.json'),path.join(__dirname,'comms-hub-film.json'));
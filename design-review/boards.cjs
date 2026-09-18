const path=require('node:path');
const root=process.env.CODEX_NODE_MODULES||'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const sharp=require(path.join(root,'sharp'));const out=path.join(__dirname,'screenshots');
(async()=>{
 const pages=['home','work','detail','create','approvals','media'];
 for(const d of ['A','B','C']){
  const tiles=[];
  for(let i=0;i<pages.length;i++){
   const tile=await sharp(path.join(out,`${d}-${pages[i]}-1440.png`)).resize({width:720,height:650,fit:'contain',background:'#e8ede8'}).png().toBuffer();
   tiles.push({input:tile,left:(i%2)*744+16,top:Math.floor(i/2)*674+16});
  }
  await sharp({create:{width:1504,height:2038,channels:3,background:'#e8ede8'}}).composite(tiles).png().toFile(path.join(out,`${d}-all-desktop.png`));
 }
 const mobile=[];
 for(let i=0;i<3;i++)mobile.push({input:await sharp(path.join(out,`${'ABC'[i]}-work-390.png`)).extract({left:0,top:0,width:390,height:844}).png().toBuffer(),left:16+i*406,top:16});
 await sharp({create:{width:1234,height:876,channels:3,background:'#e8ede8'}}).composite(mobile).png().toFile(path.join(out,'mobile-comparison.png'));
 console.log('Three six-screen desktop boards and one mobile comparison created.');
})();

// Local gallery verification. Uses the desktop's bundled Playwright; no app dependencies.
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.CODEX_NODE_MODULES || 'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { chromium } = require(path.join(root, 'playwright'));
(async () => {
 const browser = await chromium.launch({channel:'msedge',headless:true});
 const page = await browser.newPage(); const errors=[]; const checks=[];
 page.on('pageerror',e=>errors.push(e.message));
 const out=path.join(__dirname,'screenshots');fs.mkdirSync(out,{recursive:true});
 for(const width of [1440,1280,900,390]) {
  await page.setViewportSize({width,height:width===390?844:1000});
  for(const direction of ['A','B','C']) for(const screen of ['home','work','detail','create','approvals','media']) {
   await page.goto(`http://127.0.0.1:4173/?direction=${direction}&page=${screen}`);
   await page.locator('main h1').waitFor();
   const result=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,rtl:document.documentElement.dir==='rtl',heading:document.querySelector('h1').textContent}));
   checks.push({width,direction,screen,...result});
   if(width===1440||width===390) await page.screenshot({path:path.join(out,`${direction}-${screen}-${width}.png`),fullPage:true});
  }
 }
 await page.setViewportSize({width:1440,height:1000});
 await page.goto('http://127.0.0.1:4173');
 await page.locator('[data-direction="B"]').click();
 if(!await page.locator('body').evaluate(el=>el.classList.contains('direction-B')))errors.push('Direction switch failed');
 await page.locator('#screen').selectOption('work');
 await page.locator('.board-card').first().click();
 if(!page.url().includes('page=detail'))errors.push('Work detail navigation failed');
 await page.locator('#mobile-toggle').click();
 if(!await page.locator('body').evaluate(el=>el.classList.contains('phone-preview')))errors.push('Phone preview failed');
 await page.locator('.bell').click();
 if(!await page.locator('dialog').evaluate(el=>el.open))errors.push('Preview notice failed');
 await page.keyboard.press('Escape');
 if(await page.locator('dialog').evaluate(el=>el.open))errors.push('Dialog escape failed');
 await page.setViewportSize({width:390,height:844});
 await page.goto('http://127.0.0.1:4173/?direction=C&page=home');
 await page.locator('[data-more]').click();
 if(!await page.locator('.sidebar').evaluate(el=>el.classList.contains('mobile-open')))errors.push('Mobile more menu failed');
 const failed=checks.filter(c=>c.overflow||!c.rtl);
 fs.writeFileSync(path.join(__dirname,'verification.json'),JSON.stringify({checkedAt:new Date().toISOString(),checks,errors,failed,interactionChecks:['direction switch','screen selector','work detail navigation','phone preview','notice dialog','Escape closes dialog','mobile more menu']},null,2));
 console.log(JSON.stringify({views:checks.length,screenshots:36,errors,failed},null,2));
 await browser.close(); if(errors.length||failed.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1)});


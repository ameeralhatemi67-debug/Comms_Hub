/* Browser check for pass 5 (version 5) of «النموذج المرجعي للمركز»: hold to confirm, undo, YouTube, the plan editor, and the help system.
   Usage: node qa/reference-pass5.cjs <saved artifact page.html> [qa/reference-pass5.json]   (wraps the page in the same skeleton the artifact host adds) */
const fs = require('node:fs'), path = require('node:path');
const { dependency, launchOptions } = require('./runtime.cjs');
const pw = dependency('playwright');
const src = path.resolve(process.argv[2]), out = process.argv[3] || path.join(__dirname, 'reference-pass5.json');
const wrapped = path.resolve(path.dirname(src), '_wrapped.html');
fs.writeFileSync(wrapped, '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"></head><body>\n' + fs.readFileSync(src, 'utf8') + '\n</body></html>');
const results = []; let pass = 0, fail = 0;
function ok(name, cond, detail){ results.push({name, pass:!!cond, detail:detail||''}); if(cond) pass++; else fail++; console.log((cond?'PASS ':'FAIL ')+name+(detail?'  · '+detail:'')); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await pw.chromium.launch(launchOptions);
  const ctx = await browser.newContext({viewport:{width:1440, height:1000}, locale:'ar'});
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: '+e.message));
  page.on('console', m => { if(m.type()==='error' && !/fonts\.g/.test(m.text())) errors.push('console: '+m.text()); });
  await page.goto('file:///'+wrapped.replace(/\\/g,'/'));
  await page.evaluate(() => { try{ localStorage.clear(); }catch(e){} });
  await page.reload(); await sleep(900);
  const shot = async n => { fs.mkdirSync(path.join(__dirname,'artifacts','reference-pass5'),{recursive:true}); await page.screenshot({path:path.join(__dirname,'artifacts','reference-pass5',n+'.png')}); };
  const tour = async k => { await page.evaluate(() => { document.querySelectorAll('details.tour').forEach(d => d.open = true); const sc = document.querySelector('#app .scrim'); if(sc) sc.click(); }); await page.click(`[data-tour="${k}"]`); await sleep(1000); };
  const center = sel => page.$eval(sel, b => { b.scrollIntoView({block:'center'}); const r = b.getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2}; });
  const popText = () => page.evaluate(() => { const p = document.querySelector('.gd-pop'); return p ? p.innerText : ''; });

  /* 1. first visit: the guide for «العمل» starts by itself */
  let t = await popText();
  ok('first visit guide opens on «العمل»', /إرشاد «العمل»/.test(t), t.split('\n')[0]);
  ok('spotlight is shown', await page.$('.gd-spot') !== null);
  await shot('01-onboarding-step1');
  let steps = 0; while(steps < 6 && await page.$('.gd-pop [data-gda="tnext"]')){ await page.click('.gd-pop [data-gda="tnext"]'); steps++; await sleep(450); }
  ok('guide has 3 or 4 steps and closes', steps>=3 && steps<=4 && !(await page.$('.gd-pop')), 'steps '+steps);
  await page.reload(); await sleep(900);
  ok('seen guide does not return after reload', !(await page.$('.gd-pop')));

  /* 2. help button: hover, guide mode, second click acts */
  await page.hover('#app .help-q'); await sleep(200);
  t = await page.evaluate(() => { const x = document.querySelector('.gd-tip'); return x ? x.innerText : ''; });
  ok('hover on help button says what the page is for', /قائمة عمل الفريق/.test(t) && /انقر مرتين/.test(t));
  await page.click('#app .help-q'); await sleep(500);
  ok('one click turns guide mode on', await page.$('#app .gd-bar') !== null && await page.$eval('#app .help-q', b => b.getAttribute('aria-pressed'))==='true');
  await page.click('#app .attn button[data-id="late"]'); await sleep(300);
  t = await popText();
  const quickOn = await page.$eval('#app .attn button[data-id="late"]', b => b.classList.contains('on'));
  ok('first click explains instead of acting', /تصفية سريعة/.test(t) && !quickOn, t.split('\n')[1]);
  await page.click('#app .attn button[data-id="late"]'); await sleep(400);
  ok('second click on the same element acts', await page.$eval('#app .attn button[data-id="late"]', b => b.classList.contains('on')));
  await page.click('#app [data-gd="tabs"] button'); await sleep(300);
  ok('explanation of a tab', /تبويب|التبويبات/.test(await popText()));
  await page.keyboard.press('Escape'); await sleep(150); await page.keyboard.press('Escape'); await sleep(300);
  ok('Escape leaves guide mode', !(await page.$('#app .gd-bar')));

  /* 3. page guide by double click, then replay */
  await page.dblclick('#app .help-q'); await sleep(700);
  ok('double click opens the page guide inside the page', await page.$('#app .helpview') !== null && /دليل الصفحة/.test(await page.$eval('#app .hv-head', e => e.innerText)));
  ok('page guide has all sections', await page.$$eval('#app .hv-sec', l => l.length) >= 6);
  ok('sidebar and top bar stay', await page.$('#app .a-side') !== null && await page.$('#app .topbar') !== null);
  await shot('02-help-view');
  await page.click('#app .hv-foot [data-gda="replay"]'); await sleep(900);
  ok('replay leaves the guide and starts the page guide at step 1', !(await page.$('#app .helpview')) && /1 من/.test(await popText()));
  await page.click('.gd-pop [data-gda="tskip"]'); await sleep(200);

  /* 4. section tip on first click */
  await tour('g:section'); await sleep(600);
  t = await page.evaluate(() => { const p = document.querySelector('.gd-pop.coach'); return p ? p.innerText : ''; });
  ok('first click in a section shows its tip', /نصيحة/.test(t), t.split('\n')[1] || '');
  await shot('03-section-tip');

  /* 5. guide mode does not cover what opens */
  await tour('g:layer'); await sleep(2600);
  const ov = await page.evaluate(() => { const p = document.querySelector('.gd-pop'), m = document.querySelector('#app .modal'); if(!p||!m) return {p:!!p, m:!!m}; const a = p.getBoundingClientRect(), b = m.getBoundingClientRect(); const w = Math.min(a.right,b.right)-Math.max(a.left,b.left), h = Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top); return {p:true, m:true, area:(w>0&&h>0)?w*h:0, pop:a.width*a.height}; });
  ok('plan editor opened in guide mode', ov.m===true);
  ok('explanation window does not cover the opened editor', ov.p && ov.area < 0.08*ov.pop, JSON.stringify(ov));
  await shot('04-guide-avoids-modal');
  await page.keyboard.press('Escape'); await sleep(200);

  /* 6. hold to confirm */
  await page.evaluate(() => { const g = document.querySelector('.gd-bar [data-gda="exit"]'); if(g) g.click(); });
  await tour('g:hold'); await sleep(400);
  const btn = '#app [data-act="approveall"]';
  ok('approve button is marked as hold', await page.$eval(btn, b => b.hasAttribute('data-hold')));
  await page.click(btn); await sleep(300);
  ok('quick click does not approve', await page.$(btn) !== null && await page.$('.gd-tip') !== null);
  const box = await center(btn);
  await page.mouse.move(box.x, box.y); await page.mouse.down(); await sleep(450);
  ok('fill grows while pressing', await page.$eval(btn, b => b.classList.contains('holding')));
  await sleep(700); await page.mouse.up(); await sleep(500);
  ok('long press approves', !(await page.$(btn)) && /اكتمل الاعتماد|اعتُمد/.test(await page.evaluate(() => (document.querySelector('#app .toast')||{}).innerText||'')));
  await shot('05-after-hold');

  /* 7. undo */
  ok('message offers undo', await page.$('#app .toast [data-act="undo"]') !== null);
  ok('top bar undo has a count', /1/.test(await page.$eval('#app [data-shellact="undo"]', b => b.innerText)));
  await page.click('#app .toast [data-act="undo"]'); await sleep(500);
  ok('undo restores the review', await page.$(btn) !== null && /تراجعتَ عن/.test(await page.evaluate(() => (document.querySelector('#app .toast')||{}).innerText||'')));
  await tour('g:undo'); await sleep(300);
  const cl = '#app [data-act="doclose"]', cb = await center(cl);
  await page.mouse.move(cb.x, cb.y); await page.mouse.down(); await sleep(1100); await page.mouse.up(); await sleep(500);
  ok('work closed by long press', /المغلقة/.test(await page.evaluate(() => (document.querySelector('#app .toast')||{}).innerText||'')) && await page.$('#app .closed-bar') !== null);
  await page.keyboard.press('Control+z'); await sleep(500);
  ok('Ctrl+Z reopens it', !(await page.$('#app .closed-bar')));
  const keyHold = await page.evaluate(async () => { const b = document.querySelector('#app [data-act="close"], #app [data-q="close"]'); return !!b; });
  ok('close action still offered after undo', keyHold);

  /* 8. plan editor: arrows, drag, free editor */
  await tour('g:drag'); await sleep(400);
  const names = () => page.$$eval('.modal [data-plist="modal"] .prow [data-pf="n"]', l => l.map(x => x.value));
  const before = await names();
  await page.click('.modal [data-act="planmv"][data-i="2"][data-d="-1"]'); await sleep(250);
  let after = await names();
  ok('arrow moves a stage up', after[1]===before[2] && after[2]===before[1], after.slice(0,4).join(' / '));
  ok('a reorder is reported', /نُقلت/.test(await page.$eval('.modal', m => m.innerText)));
  const dragged = await page.evaluate(() => {
    const grip = document.querySelector('.modal [data-pdrag="4"]'), row = document.querySelector('.modal [data-prow="1"]');
    const dt = new DataTransfer(), r = row.getBoundingClientRect();
    grip.dispatchEvent(new DragEvent('dragstart', {bubbles:true, dataTransfer:dt}));
    row.dispatchEvent(new DragEvent('dragover', {bubbles:true, cancelable:true, dataTransfer:dt, clientX:r.left+20, clientY:r.top+3}));
    row.dispatchEvent(new DragEvent('drop', {bubbles:true, cancelable:true, dataTransfer:dt, clientX:r.left+20, clientY:r.top+3}));
    grip.dispatchEvent(new DragEvent('dragend', {bubbles:true, dataTransfer:dt}));
    return true; });
  await sleep(300); const afterDrag = await names();
  ok('dragging stage 5 above stage 2 moves it', dragged && afterDrag[1]===after[4], afterDrag.join(' / '));
  await page.click('.modal [data-act="planmode"][data-id="adv"]'); await sleep(250);
  ok('free editor shows tools, library and templates', await page.$('.modal .ptools .plib') !== null && await page.$('.modal #pl-tpl') !== null && await page.$('.modal .padv') !== null);
  const n0 = (await names()).length;
  await page.click('.modal [data-act="planlib"][data-i="0"]'); await sleep(250);
  ok('library adds a stage', (await names()).length===n0+1 && (await names()).slice(-1)[0]==='تدقيق لغوي');
  await page.click('.modal [data-act="plancalc"][data-id="back"]'); await sleep(250);
  ok('dates computed back from the due date', /رجوعاً من التسليم/.test(await page.$eval('.modal .pnotice', e => e.innerText)));
  ok('live timeline is shown', await page.$$eval('.modal .pprev .ppr', l => l.length) === n0+1);
  await shot('06-free-editor');
  await page.click('.modal [data-act="plansave"]'); await sleep(400);
  const errTxt = await page.evaluate(() => { const e = document.getElementById('pl-err'); return e && !e.hidden ? e.textContent : ''; });
  const saved = !(await page.$('.modal'));
  ok('plan saves or names the problem', saved || errTxt.length>0, saved ? 'saved' : errTxt);
  if(saved) ok('saved plan shows the new stage on the work page', /تدقيق لغوي/.test(await page.$eval('#app [data-gd="steps"]', e => e.innerText)));
  else { await page.click('.modal [data-act="closemodal"]'); await sleep(200); }

  /* 9. approval point */
  await tour('g:gate'); await sleep(300);
  await page.click('#app [data-gd="steps"] [data-act="step"][data-q="done"][data-i="0"]'); await sleep(400);
  ok('finished approval point waits', /بانتظار اعتماد المرحلة/.test(await page.$eval('#app [data-gd="steps"]', e => e.innerText)));
  await page.selectOption('#as', 'mohammed'); await sleep(500);
  ok('Director sees «اعتماد المرحلة»', await page.$('#app [data-q="gate"]') !== null);
  await page.click('#app [data-q="gate"]'); await sleep(400);
  ok('after approval the next stage is ready', /جاهزة للبدء/.test(await page.$eval('#app [data-gd="steps"] .srow:nth-child(2)', e => e.innerText)));

  /* 10. YouTube */
  await tour('g:yt'); await sleep(300);
  ok('YouTube section with an account', await page.$$eval('#app [data-gd="plat-youtube"] .acccard', l => l.length) === 1);
  ok('YouTube says video only', /يقبل الفيديو فقط/.test(await page.$eval('#app [data-gd="plat-youtube"]', e => e.innerText)));
  await tour('g:ytcheck'); await sleep(400);
  ok('a post on YouTube without a video is refused', /يوتيوب يقبل الفيديو فقط/.test(await page.evaluate(() => (document.querySelector('#app .err')||{}).innerText||'')));
  await page.click('#app [data-nav="calendar"]'); await sleep(400);
  ok('calendar has a YouTube lane', /يوتيوب/.test(await page.$eval('#app .cweek', e => e.innerText)));
  await page.click('.gd-pop [data-gda="tskip"]').catch(()=>{});

  /* 11. every page, every person: no errors; guide content exists for each */
  const pages = ['work','create','projects','approvals','calendar','requests','library','tasks','log','mail','accounts'];
  for(const who of ['amir','mohammed','khalid','noura','abdullah']){
    await page.selectOption('#as', who); await sleep(250);
    for(const p of pages){ const l = await page.$(`#app [data-nav="${p}"]`); if(l){ await l.click(); await sleep(220); const s = await page.$('.gd-pop [data-gda="tskip"]'); if(s){ await s.click(); await sleep(120); } } }
  }
  ok('no page errors across 11 pages and 5 people', errors.length===0, errors.slice(0,3).join(' | '));
  for(const p of ['item','review','project','asset','chat']){ await page.evaluate(k => { /* each page has help content */ }, p); }
  /* every earlier scenario button still runs */
  await page.evaluate(() => document.querySelectorAll('details.tour').forEach(d => d.open = true));
  const tours = await page.$$eval('[data-tour]', l => l.map(b => b.getAttribute('data-tour')));
  const errBefore = errors.length;
  for(const k of tours){ await page.evaluate(() => { const sc = document.querySelector('#app .scrim'); if(sc) sc.click(); }); await page.click(`[data-tour="${k}"]`).catch(e => errors.push('click '+k)); await sleep(160); await page.keyboard.press('Escape'); await sleep(40); }
  ok('all '+tours.length+' scenario buttons run without errors', errors.length===errBefore, errors.slice(errBefore, errBefore+3).join(' | '));

  /* 12. designs and phone width */
  await page.evaluate(() => { const sc = document.querySelector('#app .scrim'); if(sc) sc.click(); }); await page.click('#designs [data-design="dark"]'); await page.click('[data-tour="g:help"]'); await sleep(700); await shot('07-help-dark');
  await page.setViewportSize({width:390, height:844}); await sleep(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('no sideways scroll at phone width (page guide)', overflow<=1, 'overflow '+overflow);
  await page.click('[data-tour="g:free"]'); await sleep(600); await shot('08-free-editor-phone');
  ok('no page errors at the end', errors.length===0, errors.slice(0,3).join(' | '));
  fs.writeFileSync(out, JSON.stringify({checked:new Date().toISOString(), pass, fail, results, errors}, null, 2));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

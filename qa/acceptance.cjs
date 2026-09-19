const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {dependency,baseURL,launchOptions}=require('./runtime.cjs');
const out=path.join(__dirname,'artifacts');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await dependency('playwright').chromium.launch(launchOptions);
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[],checks=[],personas=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 const setRole=async role=>{await page.getByLabel('عرض بصفة',{exact:true}).selectOption(role);await page.waitForFunction(r=>document.querySelector('.role-select select').value===r,role)};
 const go=async (route,title)=>{await page.locator(`.sidebar a[href="${route}"]`).click();await page.waitForURL(baseURL+route);if(title)await page.getByRole('heading',{level:1,name:title,exact:true}).waitFor()};
 const check=async(name,fn)=>{await fn();checks.push(name)};
 try {
 for(const [role,user,priority,own] of [['director','محمد','قراراتك اليوم ومتابعة الحملة',''],['assistant','ريم','تنسيق العمل ومراجعة التسليمات',''],['writer','خالد','المحتوى المطلوب وملاحظات المراجعة','CH-243'],['designer','سارة','التصاميم وإصدارات الوسائط','CH-244'],['producer','أحمد','الإنتاج والتسليم والمراجعة','CH-241'],['publisher','نورة','الإصدارات المعتمدة ومواعيد النشر',''],['member','عبدالله','أعمالك ومشاركات الفريق','CH-245'],['admin','مسؤول النظام','حالة النظام وإعدادات المستخدمين','']]) {
   await page.goto(baseURL);await setRole(role);await page.getByRole('heading',{name:`صباح الخير، ${user}`,exact:true}).waitFor();assert(await page.getByText(priority,{exact:true}).isVisible());
   assert.equal(await page.locator('.sidebar a[href="/create"]').count(),['publisher','admin'].includes(role)?0:1);
   assert.equal(await page.locator('.sidebar a[href="/admin"]').count(),role==='admin'?1:0);
   if(own){assert(await page.locator(`main a[href="/work/${own}"]`).first().isVisible());await page.locator(`main a[href="/work/${own}"]`).first().click();await page.getByRole('link',{name:'تحرير',exact:true}).waitFor();await page.getByRole('button',{name:'التعليقات',exact:true}).click();await page.getByLabel('تعليق',{exact:true}).fill(`ملاحظة ${user} للتحقق`);await page.getByRole('button',{name:'إضافة تعليق',exact:true}).click();await page.getByText(`ملاحظة ${user} للتحقق`,{exact:true}).first().waitFor();}
   await go('/approvals','الموافقات والنشر');
   if(['director','assistant'].includes(role))assert.equal(await page.getByRole('button',{name:/اعتماد الإصدار/}).count(),1);else assert.equal(await page.getByRole('button',{name:/اعتماد الإصدار/}).count(),0);
   await page.getByRole('button',{name:'النشر',exact:true}).click();assert.equal(await page.getByRole('button',{name:'محاكاة النشر',exact:true}).count(),role==='publisher'?1:0);
   if(role==='admin'){await go('/admin','الإدارة');assert(await page.getByText('المراجعة: غير متاح',{exact:false}).isVisible())}
   personas.push({role,priority,ownWorkComment:!!own,review:['director','assistant'].includes(role),publish:role==='publisher',result:'PASS'});
 }
 fs.writeFileSync(path.join(__dirname,'personas.json'),JSON.stringify({personas,errors},null,2));
 // Supporting pages exercise real state changes through client navigation.
 await page.goto(baseURL);await setRole('writer');
 await check('Mail read and create submitted work',async()=>{await go('/mail','البريد');await page.getByRole('button',{name:'تمييز كمقروء'}).click();assert(await page.getByRole('button',{name:'تمت القراءة',exact:true}).isDisabled());await page.getByRole('button',{name:'إنشاء عمل وإرساله للمراجعة'}).click();await page.getByRole('link').filter({hasText:'إعلان برنامج اليوم الوطني'}).first().waitFor()});
 await check('Idea converts to campaign work',async()=>{await go('/ideas','الأفكار');await page.getByLabel('اكتب الفكرة').fill('حكاية المتطوعين في يوم الوطن');await page.getByRole('button',{name:'تحويل الفكرة إلى عمل'}).click();await page.getByRole('link').filter({hasText:'حكاية المتطوعين في يوم الوطن'}).first().waitFor()});
 await check('Analytics and Monitoring reflect seven work items',async()=>{await go('/analytics','التحليلات');assert.match(await page.locator('.stat').first().innerText(),/7/);await go('/monitoring','المراقبة');await page.getByRole('heading',{name:'حالة الفريق'}).waitFor();await page.getByRole('link').filter({hasText:'حكاية المتطوعين في يوم الوطن'}).first().click();await page.getByRole('heading',{level:1,name:'حكاية المتطوعين في يوم الوطن'}).waitFor()});
 await check('Settings preview responds to both toggles',async()=>{await go('/settings','الإعدادات');await page.getByRole('checkbox').nth(0).uncheck();await page.getByRole('checkbox').nth(1).uncheck();await page.getByText('المعاينة الكاملة تعرض العناوين والتفاصيل.',{exact:true}).waitFor();await page.getByText('لن يظهر شريط تنبيه في هذه المعاينة.',{exact:true}).waitFor()});
 await check('Account reset cancel, Escape and confirmation',async()=>{await go('/account','الحساب');const trigger=page.getByRole('button',{name:'إعادة النموذج إلى حالته الأولى'});await trigger.click();assert(await page.evaluate(()=>!!document.activeElement.closest('dialog')));for(let i=0;i<8;i++)await page.keyboard.press('Tab');assert(await page.evaluate(()=>!!document.activeElement.closest('dialog')));await page.keyboard.press('Escape');assert.equal(await page.locator('dialog[open]').count(),0);await page.waitForFunction(()=>document.activeElement?.textContent?.includes("إعادة النموذج إلى حالته الأولى"));await trigger.click();await page.getByRole('button',{name:'إلغاء',exact:true}).click();await trigger.click();await page.getByRole('button',{name:'تأكيد الإعادة'}).click();await go('/work','العمل');assert.equal(await page.locator('.work-row').count(),5)});
 await check('Native and channel validation, tabs never submit form',async()=>{await go('/create','مساحة الإنشاء');await page.getByRole('button',{name:'حفظ مسودة',exact:true}).click();assert(await page.locator('main input:invalid').count()>0);await page.getByLabel('عنوان العمل',{exact:true}).fill('اختبار التحقق');await page.getByLabel('المحتوى الأساسي',{exact:true}).fill('نص تجريبي');await page.getByRole('button',{name:'X',exact:true}).click();assert.equal(new URL(page.url()).pathname,'/create');await page.getByRole('button',{name:'النص الأساسي',exact:true}).click();for(const checkbox of await page.locator('fieldset input').all())await checkbox.uncheck();await page.getByRole('button',{name:'حفظ مسودة',exact:true}).click();await page.locator('main').getByRole('alert').waitFor()});
 // Capture each Level A screen at both sizes, fully rendered and hydrated.
 for(const width of [1440,390]){await page.setViewportSize({width,height:950});for(const [route,title,name] of [['/','صباح الخير، محمد','home'],['/work','العمل','work'],['/work/CH-241','إعداد الفيديو الرئيسي','detail'],['/create','مساحة الإنشاء','create'],['/approvals','الموافقات والنشر','approvals'],['/calendar','التقويم','calendar'],['/media','مكتبة الوسائط','media']]){await page.goto(baseURL+route);await page.getByRole('heading',{level:1,name:title,exact:true}).waitFor();await page.screenshot({path:path.join(out,`acceptance-${name}-${width}.png`),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}}
 fs.writeFileSync(path.join(__dirname,'acceptance.json'),JSON.stringify({personas,checks,errors,screenshots:14,result:errors.length?'FAIL':'PASS'},null,2));
 console.log(JSON.stringify({personas:personas.length,checks,errors,screenshots:14}));
 }catch(error){console.error(error);await page.screenshot({path:path.join(out,'acceptance-failure.png'),fullPage:true});fs.writeFileSync(path.join(__dirname,'acceptance-failure.txt'),`${error}\n${await page.locator('main').innerText()}`);process.exitCode=1}finally{await browser.close()}
})();





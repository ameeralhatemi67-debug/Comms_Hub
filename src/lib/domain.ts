export const campaign = {id:'national-2026',title:'اليوم الوطني السعودي 2026',date:'2026-09-23',description:'نحتفي بمنجزاتنا، ونروي قصص الانتماء والعطاء.'};
export const roles = {
 director:{name:'مدير الاتصال المؤسسي',user:'محمد',create:true,review:true,publish:false,admin:false,priority:'قراراتك اليوم ومتابعة الحملة'},
 assistant:{name:'مساعد مدير الاتصال المؤسسي',user:'ريم',create:true,review:true,publish:false,admin:false,priority:'تنسيق العمل ومراجعة التسليمات'},
 writer:{name:'كاتب المحتوى',user:'خالد',create:true,review:false,publish:false,admin:false,priority:'المحتوى المطلوب وملاحظات المراجعة'},
 designer:{name:'المصمم',user:'سارة',create:true,review:false,publish:false,admin:false,priority:'التصاميم وإصدارات الوسائط'},
 producer:{name:'المنتج الإعلامي',user:'أحمد',create:true,review:false,publish:false,admin:false,priority:'الإنتاج والتسليم والمراجعة'},
 publisher:{name:'مسؤول النشر وإدارة الحسابات',user:'نورة',create:false,review:false,publish:true,admin:false,priority:'الإصدارات المعتمدة ومواعيد النشر'},
 member:{name:'عضو',user:'عبدالله',create:true,review:false,publish:false,admin:false,priority:'أعمالك ومشاركات الفريق'},
 admin:{name:'Admin',user:'مسؤول النظام',create:false,review:false,publish:false,admin:true,priority:'حالة النظام وإعدادات المستخدمين'}
} as const;
export type Role = keyof typeof roles;
export const statusLabels = {DRAFT:'مسودة',IN_PRODUCTION:'قيد الإنتاج',IN_REVIEW:'قيد المراجعة',CHANGES_REQUESTED:'بحاجة إلى تعديل',REJECTED:'مرفوض',APPROVED:'جاهز للنشر',SCHEDULED:'مجدول',PUBLISHING:'جارٍ النشر',PUBLISHED:'منشور',PARTIAL:'نشر جزئي',FAILED:'فشل النشر'};
export type Status=keyof typeof statusLabels;
export const channels=['Instagram','X','LinkedIn'] as const;
export type Channel=typeof channels[number];
export type Asset={id:string;title:string;kind:'poster'|'video'|'raw';versions:number[];approved:number|null;filename:string;creator:string};
export const assets:Asset[]=[{id:'poster',title:'الملصق النهائي',kind:'poster',versions:[3,4,5],approved:5,filename:'poster-final.jpg',creator:'سارة'},{id:'reel',title:'الفيديو الرئيسي',kind:'video',versions:[3,4],approved:null,filename:'main-reel.mp4',creator:'أحمد'},{id:'footage',title:'لقطات التغطية',kind:'raw',versions:[1],approved:null,filename:'drone-shot.mov',creator:'أحمد'}];
export type Content={title:string;body:string;type:string;owner:Role;due:string;channels:Channel[];assetId:string;assetVersion:number;variants:Record<Channel,string>};
export type Release=Content & {revision:number;submittedBy:Role;approvedBy?:Role};
export type Work=Content & {id:string;revision:number;status:Status;release?:Release;scheduled?:string;results:Partial<Record<Channel,'SUCCESS'|'FAILED'>>;comments:{by:string;text:string}[];activity:string[];checklist:boolean[]};
export type Notice={id:string;kind:'action'|'attention'|'info'|'mention';title:string;workId:string;read:boolean};
export type State={role:Role;work:Work[];notices:Notice[];message:string};
export type Action={type:'role';role:Role}|{type:'create';content:Content;submit:boolean}|{type:'edit';id:string;content:Content}|{type:'submit'|'approve'|'publish'|'retry';id:string}|{type:'changes'|'reject'|'comment';id:string;text:string}|{type:'schedule';id:string;date:string}|{type:'result';id:string;mode:'success'|'partial'|'failure'}|{type:'check';id:string;index:number}|{type:'read';id:string}|{type:'clear'}|{type:'reset'};
const blankVariants={Instagram:'',X:'',LinkedIn:''};
const baseCopy='في يومنا الوطني، نحتفي بوطن يجمعنا على الطموح والعطاء. نفخر بمنجزاتنا، ونواصل العمل معاً لمستقبل يستحقه وطننا. #اليوم_الوطني_السعودي';
export function initialState():State {
 const rows:[string,Role,Status,string][]=[['إعداد الفيديو الرئيسي','producer','IN_REVIEW','reel'],['تصميم الملصق','designer','APPROVED','poster'],['كتابة محتوى X','writer','CHANGES_REQUESTED','poster'],['إعداد منشور Instagram','designer','IN_PRODUCTION','poster'],['تغطية الحدث','member','DRAFT','footage']];
 return {role:'director',message:'',work:rows.map((r,i)=>{const w:Work={id:`CH-${241+i}`,title:r[0],owner:r[1],status:r[2],type:i===0?'فيديو':i===1?'تصميم':'منشور اجتماعي',body:baseCopy,due:`2026-09-${i===4?'23':'22'}`,channels:[...channels],assetId:r[3],assetVersion:r[3]==='reel'?4:r[3]==='poster'?5:1,variants:{...blankVariants},revision:i===0?4:1,results:{},comments:i===2?[{by:'محمد',text:'يرجى اختصار النص وإبراز مشاركة الفريق.'}]:[],activity:['أُنشئ العمل ضمن حملة اليوم الوطني'],checklist:[true,true,false,false]};if(['IN_REVIEW','APPROVED'].includes(w.status))w.release={...pickContent(w),revision:w.revision,submittedBy:w.owner,...(w.status==='APPROVED'?{approvedBy:'director' as Role}:{})};return w}),notices:[{id:'n1',kind:'action',title:'الفيديو الرئيسي يحتاج مراجعتك',workId:'CH-241',read:false},{id:'n2',kind:'mention',title:'محمد طلب تعديل محتوى X',workId:'CH-243',read:false}]};
}
export function pickContent(w:Content):Content{return {title:w.title,body:w.body,type:w.type,owner:w.owner,due:w.due,channels:[...w.channels],assetId:w.assetId,assetVersion:w.assetVersion,variants:{...w.variants}}}
export function canEdit(role:Role,w:Work){return roles[role].create&&(roles[role].review||role===w.owner)}
export function ready(w:Work){return !!w.release?.approvedBy&&w.release.revision===w.revision}
export function reducer(state:State,a:Action):State {
 if(a.type==='role')return {...state,role:a.role,message:''};
 if(a.type==='reset')return initialState();
 if(a.type==='clear')return {...state,message:''};
 if(a.type==='read')return {...state,notices:state.notices.map(n=>n.id===a.id?{...n,read:true}:n)};
 const actor=roles[state.role]; const fail=(message:string)=>({...state,message});
 if(a.type==='create'){
  if(!actor.create)return fail('هذا الدور لا ينشئ المحتوى.');
  if(!a.content.title.trim()||!a.content.body.trim()||!a.content.channels.length)return fail('أكمل العنوان والمحتوى وقنوات النشر.');
  const id=`CH-${Math.max(...state.work.map(w=>Number(w.id.slice(3))))+1}`;
  const w:Work={...a.content,id,revision:1,status:a.submit?'IN_REVIEW':'DRAFT',results:{},comments:[],activity:[`أنشأ ${actor.user} العمل`],checklist:[false,false,false,false]};
  if(a.submit)w.release={...pickContent(w),revision:1,submittedBy:state.role};
  return {...state,work:[w,...state.work],message:`تم إنشاء ${id}`,notices:a.submit?[{id:`${id}-1`,kind:'action',title:`طلب مراجعة: ${w.title}`,workId:id,read:false},...state.notices]:state.notices};
 }
 const original=state.work.find(w=>w.id===a.id);if(!original)return fail('العمل غير موجود.');
 let w:Work={...original,activity:[...original.activity],comments:[...original.comments],results:{...original.results}};let message='';let kind:Notice['kind']='info';
 switch(a.type){
 case 'edit': if(!canEdit(state.role,w)||w.status==='PUBLISHING')return fail('لا يمكن تعديل هذا العمل بهذا الدور أو أثناء النشر.');
  if(!a.content.title.trim()||!a.content.body.trim()||!a.content.channels.length)return fail('أكمل بيانات المحتوى.');
  w={...w,...a.content,revision:w.revision+1,status:'DRAFT',release:undefined,scheduled:undefined,results:{}};message='حُفظ إصدار جديد. يلزم إرساله للمراجعة.';break;
 case 'submit':if(!canEdit(state.role,w)||!['DRAFT','IN_PRODUCTION','CHANGES_REQUESTED','REJECTED'].includes(w.status))return fail('هذا العمل غير متاح للإرسال الآن.');w.release={...pickContent(w),revision:w.revision,submittedBy:state.role};w.status='IN_REVIEW';message=`أُرسل الإصدار ${w.revision} للمراجعة`;kind='action';break;
 case 'approve':if(!actor.review||w.status!=='IN_REVIEW'||w.release?.revision!==w.revision)return fail('لا يوجد إصدار مطابق متاح لاعتمادك.');w.release={...w.release,approvedBy:state.role};w.status='APPROVED';message=`اعتمد ${actor.user} الإصدار ${w.revision}`;kind='action';break;
 case 'changes':case 'reject':if(!actor.review||w.status!=='IN_REVIEW'||!a.text.trim())return fail('المراجعة تتطلب صلاحية وسبباً واضحاً.');w.status=a.type==='changes'?'CHANGES_REQUESTED':'REJECTED';w.comments.push({by:actor.user,text:a.text});message=a.type==='changes'?'طُلب تعديل المحتوى':'رُفض الإصدار';kind='action';break;
 case 'comment':if(!a.text.trim())return state;w.comments.push({by:actor.user,text:a.text});message='أُضيف تعليق للفريق';kind='mention';break;
 case 'check':if(!canEdit(state.role,w))return fail('قائمة الإنتاج تخص فريق العمل.');w.checklist=w.checklist.map((v,i)=>i===a.index?!v:v);message='حُدّثت قائمة الإنتاج';break;
 case 'schedule':if(!actor.publish||!ready(w)||!['APPROVED','SCHEDULED'].includes(w.status))return fail('الجدولة تتطلب إصداراً معتمداً ودور مسؤول النشر.');if(!a.date||!Number.isFinite(Date.parse(`${a.date}+03:00`)))return fail('حدد موعداً صالحاً.');w.scheduled=a.date;w.status='SCHEDULED';message='تمت الجدولة بتوقيت الرياض';break;
 case 'publish':if(!actor.publish||!ready(w)||!['APPROVED','SCHEDULED'].includes(w.status))return fail('النشر يتطلب إصداراً معتمداً ودور مسؤول النشر.');w.status='PUBLISHING';message='بدأت محاكاة النشر';break;
 case 'retry':if(!actor.publish||!ready(w)||!['PARTIAL','FAILED'].includes(w.status))return fail('لا توجد قنوات فاشلة قابلة لإعادة المحاولة.');w.status='PUBLISHING';message='إعادة محاولة القنوات الفاشلة فقط';break;
 case 'result':if(w.status!=='PUBLISHING')return state;w.channels.forEach((c,i)=>{if(w.results[c]!=='SUCCESS')w.results[c]=a.mode==='failure'||(a.mode==='partial'&&i===w.channels.length-1)?'FAILED':'SUCCESS'});{const count=w.channels.filter(c=>w.results[c]==='SUCCESS').length;w.status=count===w.channels.length?'PUBLISHED':count===0?'FAILED':'PARTIAL'}message=w.status==='PUBLISHED'?'اكتمل النشر التجريبي':w.status==='PARTIAL'?'نُشرت بعض القنوات. راجع القنوات الفاشلة.':'تعذر النشر التجريبي. أعد المحاولة.';kind=w.status==='PUBLISHED'?'info':'attention';break;
 }
 w.activity=[`${actor.user}: ${message}`, ...w.activity];
 return {...state,work:state.work.map(x=>x.id===w.id?w:x),message,notices:a.type==='check'?state.notices:[{id:`n-${Date.now()}-${state.notices.length}`,kind,title:`${w.title}: ${message}`,workId:w.id,read:false},...state.notices]};
}

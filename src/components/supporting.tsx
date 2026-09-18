'use client';

import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useState} from 'react';
import {BarChart3, Bell, Check, ShieldAlert, SlidersHorizontal, UserRound} from 'lucide-react';
import {campaign, roles, statusLabels, type Role} from '@/lib/domain';
import {useHub} from '@/lib/store';
import {Empty, Modal, Panel, Title} from './ui';

const pageNames:Record<string,string> = {
  mail:'البريد', ideas:'الأفكار', analytics:'التحليلات', monitoring:'المراقبة',
  admin:'الإدارة', settings:'الإعدادات', account:'الحساب'
};

function pageTitle(page:string) {
  return pageNames[page] || 'مركز الاتصال';
}

export function Supporting({page}:{page:string}) {
  const {state,dispatch} = useHub();
  const router = useRouter();
  const actor = roles[state.role];
  const [idea,setIdea] = useState('');
  const [mailRead,setMailRead] = useState(false);
  const [compact,setCompact] = useState(true);
  const [alerts,setAlerts] = useState(true);
  const [confirmReset,setConfirmReset] = useState(false);

  const createWork = (title:string, body:string, submit=false) => {
    dispatch({type:'create', submit, content:{
      title, body, type:'منشور اجتماعي', owner:state.role, due:campaign.date,
      channels:['Instagram','X','LinkedIn'], assetId:'poster', assetVersion:5,
      variants:{Instagram:body,X:body,LinkedIn:body}
    }});
    router.push('/work');
  };

  if (page === 'mail') return <div dir="rtl"><Title title="البريد" sub="رسائل العمل المختارة من صندوق الحملة"><span className="chip">{mailRead?'تمت القراءة':'رسالة واحدة تحتاج متابعة'}</span></Title><div className="columns"><Panel title="طلب اليوم الوطني"><div className={`notice ${mailRead?'read':''}`}><b>من: فريق الفعاليات</b><p>نحتاج منشوراً يعلن برنامج اليوم الوطني في مقر الشركة قبل نهاية اليوم.</p><small className="muted">اليوم · إلى الاتصال المؤسسي · أولوية عالية</small></div><div className="actions"><button className="primary" disabled={!actor.create} title={!actor.create?'هذا الدور لا ينشئ الأعمال':''} onClick={()=>createWork('إعلان برنامج اليوم الوطني','إعلان برنامج اليوم الوطني في مقر الشركة، مع توضيح الوقت والموقع ودعوة الزملاء للمشاركة.',true)}>إنشاء عمل وإرساله للمراجعة</button><button className="secondary" onClick={()=>setMailRead(true)} disabled={mailRead}>{mailRead?'تمت القراءة':'تمييز كمقروء'}</button></div>{!actor.create&&<p className="muted">هذا الدور لا يملك صلاحية إنشاء الأعمال.</p>}</Panel><Panel title="سياق الحملة"><p>{campaign.description}</p><div className="field"><b>{state.work.length}</b><span> أعمال قائمة</span></div><div className="field"><b>{campaign.date}</b><span> موعد الحملة</span></div></Panel></div></div>;

  if (page === 'ideas') return <div dir="rtl"><Title title="الأفكار" sub="حوّل الملاحظات السريعة إلى أعمال قابلة للتنفيذ"><span className="chip">مسودة محلية</span></Title><Panel title="فكرة جديدة"><label className="field">اكتب الفكرة<textarea value={idea} onChange={e=>setIdea(e.target.value)} placeholder="مثال: سلسلة قصيرة عن قصص الزملاء في خدمة الوطن" rows={5}/></label><div className="actions"><button className="primary" disabled={!idea.trim()||!actor.create} title={!actor.create?'هذا الدور لا ينشئ الأعمال':''} onClick={()=>{createWork(idea.trim().slice(0,70),idea.trim());setIdea('')}}>تحويل الفكرة إلى عمل</button><button className="secondary" onClick={()=>setIdea('')}>مسح</button></div>{!actor.create&&<p className="muted">هذا الدور لا يملك صلاحية إنشاء الأعمال.</p>}</Panel><Panel title="أفكار مرتبطة بالحملة"><div className="stack">{['قصة زميل ساهم في خدمة المجتمع','خريطة إنجازات الفريق خلال العام','رسالة شكر للمتطوعين'].map(item=><button className="notice" key={item} onClick={()=>setIdea(item)}><b>{item}</b><small>اضغط لاستخدامها كمسودة</small></button>)}</div></Panel></div>;

  if (page === 'analytics') {
    const done = state.work.filter(w=>['APPROVED','SCHEDULED','PUBLISHED'].includes(w.status)).length;
    const review = state.work.filter(w=>w.status==='IN_REVIEW').length;
    const published = state.work.reduce((sum,w)=>sum+Object.values(w.results).filter(x=>x==='SUCCESS').length,0);
    const failed = state.work.reduce((sum,w)=>sum+Object.values(w.results).filter(x=>x==='FAILED').length,0);
    const workload = Object.entries(roles).map(([id,r])=>({id:id as Role,name:r.user,count:state.work.filter(w=>w.owner===id).length})).filter(x=>x.count);
    return <div dir="rtl"><Title title="التحليلات" sub="قراءة سريعة لحالة العمل في الحملة"><span className="chip">بيانات محلية محاكاة</span></Title><div className="stats"><div className="stat"><BarChart3/><b>{state.work.length}</b><span>إجمالي الأعمال</span></div><div className="stat"><Check/><b>{done}</b><span>جاهزة أو منشورة</span></div><div className="stat"><Bell/><b>{review}</b><span>بانتظار المراجعة</span></div><div className="stat"><b>{published}</b><span>قنوات منشورة</span></div><div className="stat"><b>{failed}</b><span>قنوات فاشلة</span></div></div><Panel title="توزيع الحمل"><div className="table">{workload.map(x=><div className="between" key={x.id}><span>{x.name}</span><b>{x.count} أعمال</b></div>)}</div><p className="muted">المؤشر يعتمد على الأعمال الموجودة في هذا النموذج المحلي.</p></Panel></div>;
  }

  if (page === 'monitoring') { const workload = Object.entries(roles).map(([id,r])=>({id,name:r.user,count:state.work.filter(w=>w.owner===id).length})).filter(x=>x.count); return <div dir="rtl"><Title title="المراقبة" sub="آخر التغييرات والتنبيهات التي تحتاج انتباهاً"><span className="chip">تحديث مباشر محلي</span></Title><div className="columns"><Panel title="التنبيهات"><div className="stack">{state.notices.filter(n=>!n.read).map(n=><Link className="notice" href={`/work/${n.workId}`} key={n.id}><b>{n.title}</b><small>{n.kind === 'action' ? 'إجراء مطلوب' : 'تنبيه للفريق'}</small></Link>)}{!state.notices.some(n=>!n.read)&&<Empty>لا توجد تنبيهات غير مقروءة.</Empty>}</div></Panel><Panel title="حالة الفريق"><div className="stack">{workload.map(x=><div className="between" key={x.id}><span>{x.name}</span><b>{x.count} أعمال</b></div>)}</div><p className="muted">يعرض هذا التوزيع عدد الأعمال الحالية لكل عضو.</p></Panel><Panel title="نشاط الأعمال"><div className="stack">{state.work.slice(0,5).map(w=><Link className="notice" href={`/work/${w.id}`} key={w.id}><span className="between"><b>{w.title}</b><span className="chip">{statusLabels[w.status]}</span></span><small>{w.activity[0]}</small></Link>)}</div></Panel></div></div>; }

  if (page === 'admin') return <div dir="rtl"><Title title="الإدارة" sub="إدارة حالة النظام والمستخدمين"><span className="chip">صلاحيات النظام</span></Title>{!actor.admin ? <Panel><Empty>هذه الصفحة متاحة لمسؤول النظام فقط.</Empty></Panel> : <div className="columns"><Panel title="حالة النظام"><div className="notice"><ShieldAlert/><b>النموذج المحلي يعمل</b><p className="muted">لا توجد اتصالات خارجية أو مهام خلفية.</p></div></Panel><Panel title="المستخدم الحالي"><p><b>{actor.user}</b></p><p className="muted">الدور: {actor.name}</p><p className="muted">الإنشاء: {actor.create ? 'متاح' : 'غير متاح'} · المراجعة: {actor.review ? 'متاح' : 'غير متاح'}</p></Panel></div>}</div>;

  if (page === 'settings') return <div dir="rtl"><Title title="الإعدادات" sub="تفضيلات العرض لهذا المتصفح"><SlidersHorizontal/></Title><Panel title="تفضيلات الواجهة"><label className="between notice"><span><b>عرض مختصر</b><small>تقليل التفاصيل في القوائم</small></span><input type="checkbox" checked={compact} onChange={e=>setCompact(e.target.checked)}/></label><label className="between notice"><span><b>تنبيهات العمل</b><small>إظهار تنبيه عند وجود إجراء جديد</small></span><input type="checkbox" checked={alerts} onChange={e=>setAlerts(e.target.checked)}/></label><div className="notice"><b>معاينة الإعدادات</b><p>{compact?'المعاينة المختصرة تعرض العناوين والحالة فقط.':'المعاينة الكاملة تعرض العناوين والتفاصيل.'}</p><p>{alerts?'ستظهر تنبيهات الإجراء في هذه الصفحة.':'لن يظهر شريط تنبيه في هذه المعاينة.'}</p></div><p className="muted">التفضيلات محفوظة في حالة الصفحة الحالية فقط.</p></Panel></div>;

  if (page === 'account') return <div dir="rtl"><Title title="الحساب" sub="بيانات المستخدم والدور الحالي"><UserRound/></Title><Panel title="الملف الشخصي"><div className="notice"><b>{actor.user}</b><p>{actor.name}</p><small>الدور الحالي: {state.role}</small></div><div className="actions"><button className="secondary" onClick={()=>setConfirmReset(true)}>إعادة النموذج إلى حالته الأولى</button></div></Panel>{confirmReset&&<Modal title="إعادة النموذج" onClose={()=>setConfirmReset(false)}><p>سيُعاد العمل والتنبيهات إلى البيانات التجريبية الأولى.</p><div className="actions"><button className="primary" onClick={()=>{dispatch({type:'reset'});setConfirmReset(false)}}>تأكيد الإعادة</button><button className="secondary" onClick={()=>setConfirmReset(false)}>إلغاء</button></div></Modal>}</div>;

  return <div dir="rtl"><Title title={pageTitle(page)} sub="صفحة غير معروفة"/><Panel><Empty>لا توجد صفحة بهذا الاسم.</Empty></Panel></div>;
}

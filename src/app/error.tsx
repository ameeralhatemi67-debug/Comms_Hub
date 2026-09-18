'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <div className="panel"><h1>تعذر عرض الصفحة</h1><p>أعد المحاولة. تحديث المتصفح يعيد بيانات النموذج إلى البداية.</p><button className="primary" onClick={reset}>إعادة المحاولة</button></div>}

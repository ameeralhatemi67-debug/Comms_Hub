import {roles,type Work} from '@/lib/domain';
import {MediaPreview} from './ui';
const decisions={SUBMITTED:'أُرسل للمراجعة',APPROVED:'معتمد',CHANGES_REQUESTED:'طُلب تعديل',REJECTED:'مرفوض'};
export function ReleaseHistory({work}:{work:Work}) {
 return <section className="release-history" aria-label="سجل الإصدارات"><h3>سجل الإصدارات</h3><p className="muted">لقطات محفوظة داخل الجلسة. التعديل اللاحق لا يغيّر محتوى هذه النسخ.</p>{work.history.length?work.history.map((record,i)=><details key={i}><summary>الإصدار {record.release.revision} · {decisions[record.decision]} · {roles[record.by].user}</summary><div className="history-content"><h3>{record.release.title}</h3><p className="body-copy">{record.release.body}</p><MediaPreview assetId={record.release.assetId} version={record.release.assetVersion}/><p>الوسيط: {record.release.assetId} · v{record.release.assetVersion}</p>{record.release.channels.map(c=><div className="variant-copy" key={c}><b>{c}</b><p>{record.release.variants[c]||record.release.body}</p></div>)}{record.note&&<p className="warning">ملاحظة المراجع: {record.note}</p>}</div></details>):<p className="muted">لم يُرسل إصدار للمراجعة بعد.</p>}</section>
}

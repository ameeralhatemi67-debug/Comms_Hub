'use client';
// «طلبات حذف الحساب» in the requests tab of «الحسابات» (MVP_draft.md 64.6; Android_Build_Plan.md A8): the open requests
// the signed-in person may carry out, each with the person's note. «إزالة الحساب» opens the same «إزالة» as the
// person's card, and removing the account closes the request in the database (account_deletion_done).
import { Trash2 } from 'lucide-react';
import { useAccounts } from './data';
import { manageWhy, when } from './members';

export function DeletionRequests({ onRemove }: { onRemove: (email: string) => void }) {
  const a = useAccounts();
  if (!a.deletions.length) return <p className="muted">لا طلبات حذف معلقة.</p>;
  return (
    <div className="stack pm-deletions">
      {a.deletions.map((d) => {
        const m = a.members.find((x) => x.email === d.email);
        const why = m ? manageWhy(a.me, a.can, m, 'members.remove') : 'هذا الحساب لم يعد موجوداً.';
        return (
          <div className="acct-request pm-deletion" key={d.id}>
            <span className="work-name">
              <b>{d.name}</b>
              <small>
                <bdi dir="ltr">{d.email}</bdi> · <bdi dir="ltr">{when(d.created_at)}</bdi>
              </small>
              {d.note && <p>{d.note}</p>}
              {why && <small>{why}</small>}
            </span>
            <span className="actions">
              <button type="button" className="secondary danger" disabled={!!why} onClick={() => onRemove(d.email)}>
                <Trash2 />
                إزالة الحساب
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

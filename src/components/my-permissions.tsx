'use client';
// «صلاحياتي» on the account page (Permissions_Plan.md 9, «Account profile»): what the
// signed-in person may do now, where each permission comes from and when it ends. Read only:
// permissions are given in «الحسابات» by the people who manage them.
import { Lock } from 'lucide-react';
import { CAPABILITIES, GROUP_AR, sourceLine, type CapGroup } from '@/lib/permissions';
import { useCaps } from './caps';

const GROUPS: CapGroup[] = ['pages', 'messaging', 'accounts', 'fixed'];

export function MyPermissions() {
  const caps = useCaps();
  if (!caps.ready) return <p className="muted">جارٍ تحميل صلاحياتك…</p>;
  const held = caps.evals.filter((e) => e.ok);
  const timed = held.filter((e) => e.src === 'timed' || e.src === 'once');
  return (
    <div className="pm-mine">
      {timed.length > 0 && (
        <p className="pm-soon">
          {timed.length === 1 ? 'لديك صلاحية مؤقتة أو لمرة واحدة' : `لديك ${timed.length} صلاحيات مؤقتة أو لمرة واحدة`}: تنتهي وحدها في موعدها أو بعد استخدامها.
        </p>
      )}
      {GROUPS.map((grp) => {
        const rows = held.filter((e) => CAPABILITIES.find((c) => c.key === e.k)?.grp === grp);
        if (!rows.length) return null;
        return (
          <section className="pm-group" key={grp}>
            <h3>{GROUP_AR[grp]}</h3>
            {rows.map((e) => {
              const c = CAPABILITIES.find((x) => x.key === e.k)!;
              return (
                <div className="pm-perm on" key={e.k}>
                  <span>{c.label}</span>
                  <span className={`pm-src ${e.src}`}>
                    {c.grantable ? sourceLine(e) : (
                      <>
                        <Lock /> بقواعد المركز
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </section>
        );
      })}
      <p className="muted">
        «من الدور» يأتي مع دورك، و«أُضيفت» أُعطيت لك وحدك، و«مؤقتة» تنتهي في موعدها، و«مرة واحدة» تنتهي بعد استخدامها. يمنح الصلاحيات ويسحبها من يدير
        رتبتك في «الحسابات»، ويصلك إشعار بكل تغيير.
      </p>
    </div>
  );
}

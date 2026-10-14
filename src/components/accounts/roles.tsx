'use client';
// «الأدوار»: each role's default permissions (D-1), switch by switch, with the rules fixed by
// the reference shown locked with their reason. A change says how many people it affects
// before it is saved; switching one off for a whole role needs a long press.
import { useState } from 'react';
import { Lock } from 'lucide-react';
import type { Role } from '@/lib/domain';
import { CAPABILITIES, GROUP_AR, rankOf, roleAr } from '@/lib/permissions';
import { HOLD } from '@/lib/kit/hold-reasons';
import { Modal } from '../ui';
import { useAccounts } from './data';

const ORDER: Role[] = ['director', 'assistant', 'writer', 'designer', 'producer', 'publisher', 'member', 'admin'];

export function RolesTab() {
  const a = useAccounts();
  const [pending, setPending] = useState<{ role: Role; cap: string; to: boolean } | null>(null);
  const rows = CAPABILITIES.filter((c) => c.grantable && c.scope !== 'page');
  const fixed = CAPABILITIES.filter((c) => !c.grantable);
  const isOn = (role: Role, cap: string) => !!a.defaults.find((d) => d.role === role && d.capability === cap)?.allowed;
  const editWhy = (role: Role, cap: string): string => {
    if (role === 'admin') return 'صلاحيات Admin ثابتة.';
    if (!a.can('roles.templates.edit')) return 'تعديل الأدوار لمن يملك «تعديل صلاحيات الأدوار».';
    if (a.me.role !== 'admin' && rankOf(role) >= rankOf(a.me.role)) return 'لا تعدّل دوراً في رتبتك أو فوقها.';
    const c = CAPABILITIES.find((x) => x.key === cap)!;
    if (!isOn(role, cap) && rankOf(role) < c.minRank) return `لا تناسب دور «${roleAr(role)}».`;
    if (!isOn(role, cap) && a.me.role !== 'admin' && !a.can(cap)) return 'لا تفعّل ما لا تملكه أنت.';
    return '';
  };
  const people = (role: Role) => a.members.filter((m) => m.role === role).length;

  const save = async () => {
    if (!pending) return;
    const r = await a.call<number>('set_role_default', { p_role: pending.role, p_cap: pending.cap, p_allowed: pending.to });
    if (!r.ok) return a.say(r.error);
    a.say(`${pending.to ? 'فُعّلت' : 'أُوقفت'} لكل ${roleAr(pending.role)} (${r.data}).`);
    setPending(null);
    await a.reload();
  };

  return (
    <div className="pm-roles">
      <p className="muted">
        ما يملكه كل دور قبل أي إضافة لشخص بعينه. التغيير يسري على كل من يحمل الدور فوراً، وتبقى الإضافات والسحوبات الخاصة بكل شخص كما هي. الصفحات
        ليست هنا: هي قائمة كل حساب.
      </p>
      <div className="pm-matrix-wrap">
        <table className="pm-matrix">
          <thead>
            <tr>
              <th scope="col">الصلاحية</th>
              {ORDER.map((r) => (
                <th scope="col" key={r}>
                  {roleAr(r)}
                  <small>{people(r)}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(['messaging', 'accounts', 'settings'] as const).map((grp) => [
              <tr key={grp} className="pm-grp">
                <th colSpan={ORDER.length + 1}>{GROUP_AR[grp]}</th>
              </tr>,
              ...rows
                .filter((c) => c.grp === grp)
                .map((c) => (
                  <tr key={c.key}>
                    <th scope="row">{c.label}</th>
                    {ORDER.map((r) => {
                      const on = isOn(r, c.key);
                      const why = editWhy(r, c.key);
                      return (
                        <td key={r}>
                          <button
                            type="button"
                            className={`pm-switch ${on ? 'on' : ''}`}
                            aria-pressed={on}
                            aria-label={`${c.label}، ${roleAr(r)}: ${on ? 'مفعّلة' : 'موقوفة'}`}
                            disabled={!!why}
                            title={why}
                            onClick={() => setPending({ role: r, cap: c.key, to: !on })}
                          >
                            <i />
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                )),
            ])}
            <tr className="pm-grp">
              <th colSpan={ORDER.length + 1}>{GROUP_AR.fixed}</th>
            </tr>
            {fixed.map((c) => (
              <tr key={c.key} className="pm-locked">
                <th scope="row">
                  {c.label}
                  <small>
                    <Lock /> {c.why}
                  </small>
                </th>
                {ORDER.map((r) => (
                  <td key={r}>{c.fixedRoles.includes(r) ? <span className="pm-fixed on">يملكها</span> : <span className="pm-fixed">—</span>}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pending && (
        <Modal title={`${pending.to ? 'تفعيل' : 'إيقاف'} «${CAPABILITIES.find((c) => c.key === pending.cap)?.label}»`} onClose={() => setPending(null)}>
          <p>
            لكل من يحمل دور «{roleAr(pending.role)}»: {people(pending.role)} {people(pending.role) === 1 ? 'شخص' : 'أشخاص'} الآن، ومن يُعطى هذا الدور لاحقاً. من أُضيفت له أو سُحبت منه
            وحده يبقى كما هو.
          </p>
          <div className="actions">
            {pending.to ? (
              <button type="button" className="primary" onClick={() => void save()}>
                تفعيل للدور
              </button>
            ) : (
              <button type="button" className="primary danger" data-hold={HOLD.roleDefaultOff} onClick={() => void save()}>
                إيقاف للدور
              </button>
            )}
            <button type="button" className="secondary" onClick={() => setPending(null)}>
              إلغاء
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

'use client';
// «الأدوار»: one role at a time (Permissions_Plan.md 5.1, as changed on 2026-11-01). The first
// column is the role, for everyone who holds it (D-1); beside it each person who holds the role and
// whom the signed-in person manages has a column of their own, so two people of one role can differ
// and the difference can be read across. A role's switch says how many people it affects before it is
// saved, and switching one off for a whole role needs a long press; a person's switch acts at once, as
// on their card. Each person's state is the mirror of perm_eval (resolve), which the tests hold equal.
import { useEffect, useRef, useState } from 'react';
import { Check, Lock, Minus, Package, Plus } from 'lucide-react';
import type { Role } from '@/lib/domain';
import { defaultPages, sanitizePages } from '@/lib/access';
import { CAPABILITIES, GROUP_AR, ROLE_HINT, capability, createsContent, peopleAr, rankOf, resolve, roleAr, roleHolds, sourceLine, type Capability } from '@/lib/permissions';
import { HOLD } from '@/lib/kit/hold-reasons';
import { Modal } from '../ui';
import { useAccounts, type Member } from './data';
import { PersonSwitch, pageName } from './card';
import { manageWhy } from './members';

const ORDER: Role[] = ['director', 'assistant', 'writer', 'designer', 'producer', 'publisher', 'member', 'admin'];
const GROUPS = ['pages', 'messaging', 'accounts', 'settings'] as const;

export function RolesTab({ first, onOpen, onNewPreset }: { first?: string | null; onOpen: (email: string) => void; onNewPreset: () => void }) {
  const a = useAccounts();
  const count = (r: Role) => a.members.filter((m) => m.role === r).length;
  // It opens on the role with the most people the signed-in person manages: that is where people differ.
  const below = ORDER.filter((r) => r !== 'admin' && (a.me.role === 'admin' || rankOf(r) < rankOf(a.me.role)));
  const fullest = [...below].sort((x, y) => count(y) - count(x))[0] ?? ORDER[0];
  const [role, setRole] = useState<Role>(ORDER.find((r) => r === first) ?? fullest);
  const [only, setOnly] = useState(false);
  const [pending, setPending] = useState<{ role: Role; cap: string; to: boolean } | null>(null);
  // On a phone the roles are a row that scrolls sideways: the chosen one has to be in sight.
  const chosen = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    chosen.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [role]);
  const isOn = (r: Role, cap: string) => roleHolds(a.defaults, r, cap);
  const editWhy = (r: Role, cap: string): string => {
    if (r === 'admin') return 'صلاحيات Admin ثابتة.';
    if (!a.can('roles.templates.edit')) return 'تعديل الأدوار لمن يملك «تعديل صلاحيات الأدوار».';
    if (a.me.role !== 'admin' && rankOf(r) >= rankOf(a.me.role)) return 'لا تعدّل دوراً في رتبتك أو فوقها.';
    if (!isOn(r, cap) && a.me.role !== 'admin' && !a.can(cap)) return 'لا تفعّل ما لا تملكه أنت.';
    return '';
  };
  const people = a.members.filter((m) => m.role === role);
  const managed = people.filter((m) => !manageWhy(a.me, a.can, m));
  const fits = (c: Capability) => c.grantable && rankOf(role) >= c.minRank && (c.key !== 'page.create' || createsContent(role));
  const rows = CAPABILITIES.filter(fits);
  const unfit = CAPABILITIES.filter((c) => c.grantable && !fits(c)).length;
  const fixed = CAPABILITIES.filter((c) => !c.grantable);
  const firstPages: readonly string[] = defaultPages(role);
  const base = (c: Capability) => (c.scope === 'page' ? firstPages.includes(c.key.slice(5)) : isOn(role, c.key));
  const now = Date.now();
  const evalOf = (m: Member, key: string) =>
    resolve({ role: m.role, pages: sanitizePages(m.pages), templates: isOn, grants: a.grants.filter((g) => g.email === m.email) }, key, now);
  // A role has no page list of its own, only where a new account starts, so a page sets a person apart
  // only when the people of the role really differ on it; a permission is measured against the role.
  const varies = (c: Capability) => new Set(managed.map((m) => evalOf(m, c.key).ok)).size > 1;
  const apart = (m: Member, c: Capability) => evalOf(m, c.key).ok !== base(c) && (c.scope !== 'page' || varies(c));
  const differs = rows.filter((c) => managed.some((m) => apart(m, c)));
  const shown = only ? differs : rows;

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
      <nav className="pm-rail" aria-label="الأدوار">
        {ORDER.map((r) => (
          <button
            type="button"
            key={r}
            ref={r === role ? chosen : undefined}
            className={r === role ? 'on' : ''}
            aria-current={r === role ? 'true' : undefined}
            onClick={() => {
              setRole(r);
              setOnly(false);
            }}
          >
            <b>{roleAr(r)}</b>
            <small>{peopleAr(count(r))}</small>
          </button>
        ))}
      </nav>

      <div className="pm-roledetail">
        <header className="pm-rolehead">
          <div>
            <h2>{roleAr(role)}</h2>
            <p>{ROLE_HINT[role]}</p>
          </div>
          {managed.length > 0 && (
            <div className="seg" role="group" aria-label="ما يظهر">
              <button type="button" aria-pressed={!only} onClick={() => setOnly(false)}>
                الكل
              </button>
              <button type="button" aria-pressed={only} onClick={() => setOnly(true)}>
                ما يختلف ({differs.length})
              </button>
            </div>
          )}
        </header>
        <p className="pm-howto">
          {managed.length > 0
            ? 'العمود الأول للدور كله، ويسري على كل من يحمله. عمود الشخص له وحده، فيختلف عن زملائه في الدور نفسه ولا يتأثر أحد غيره. الخانة الملوّنة تعني أنه يختلف عن دوره.'
            : people.length
              ? `ما يملكه هذا الدور. ${people.length === 1 ? 'من يحمله' : 'من يحملونه'} في رتبتك أو فوقها، فلا تظهر أعمدتهم هنا.`
              : 'ما يملكه هذا الدور. لا أحد يحمله الآن؛ أضف عضواً أو غيّر دور أحدهم من «الأعضاء»، فيظهر عموده هنا.'}
        </p>

        <div className="pm-matrix-wrap">
          <table className="pm-matrix">
            <thead>
              <tr>
                <th scope="col">الصلاحية</th>
                <th scope="col" className="pm-rolecol">
                  الدور كله
                  <small>{peopleAr(people.length)}</small>
                </th>
                {managed.map((m) => {
                  const n = rows.filter((c) => apart(m, c)).length;
                  return (
                    <th scope="col" key={m.email}>
                      <button type="button" className="pm-colhead" title={`افتح صلاحيات ${m.display_name}`} onClick={() => onOpen(m.email)}>
                        {m.display_name}
                        <small className={n ? 'apart' : ''}>{n ? `يختلف في ${n}` : 'مثل الدور'}</small>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {GROUPS.map((grp) => {
                const list = shown.filter((c) => c.grp === grp);
                if (!list.length) return null;
                return [
                  <tr key={grp} className="pm-grp">
                    <th colSpan={managed.length + 2}>
                      {GROUP_AR[grp]}
                      {grp === 'pages' && <small>الدور يحدد ما يبدأ به الحساب الجديد، وصفحات كل شخص تخصه.</small>}
                    </th>
                  </tr>,
                  ...list.map((c) => {
                    const on = base(c);
                    const why = editWhy(role, c.key);
                    return (
                      <tr key={c.key}>
                        <th scope="row">{c.scope === 'page' ? pageName(c.key) : c.label}</th>
                        <td className="pm-rolecol">
                          {c.scope === 'page' ? (
                            <span className="pm-start" title={on ? 'يبدأ بها حساب جديد بهذا الدور' : 'لا يبدأ بها حساب جديد بهذا الدور'}>
                              {on ? <Check aria-label="يبدأ بها" /> : <Minus aria-label="لا يبدأ بها" />}
                            </span>
                          ) : (
                            <button
                              type="button"
                              role="switch"
                              data-col="role"
                              className={`pm-switch ${on ? 'on' : ''}`}
                              aria-checked={on}
                              aria-label={`${c.label}، ${roleAr(role)}: ${on ? 'مفعّلة' : 'موقوفة'}`}
                              disabled={!!why}
                              title={why}
                              onClick={() => setPending({ role, cap: c.key, to: !on })}
                            >
                              <i />
                            </button>
                          )}
                        </td>
                        {managed.map((m) => {
                          const e = evalOf(m, c.key);
                          const own = apart(m, c);
                          return (
                            <td key={m.email} className={own ? 'apart' : ''}>
                              <PersonSwitch person={{ email: m.email, name: m.display_name, role: m.role }} k={c.key} e={e} label={c.label} />
                              {(own || e.src === 'timed' || e.src === 'once') && (
                                <small title={e.src === 'page' || e.src === 'none' ? undefined : sourceLine(e)}>{e.src === 'timed' ? 'مؤقتة' : e.src === 'once' ? 'مرة واحدة' : 'له وحده'}</small>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  }),
                ];
              })}
              {!shown.length && (
                <tr>
                  <td className="pm-nodiff" colSpan={managed.length + 2}>
                    لا فرق: كل من في هذا الدور يعمل بصلاحياته كما هي.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {unfit > 0 && <p className="muted pm-unfit">{unfit} صلاحية لا تناسب هذا الدور، فلا تظهر هنا.</p>}

        <details className="pm-fold pm-fixedbox">
          <summary>
            <span>{GROUP_AR.fixed}</span>
            <small>{fixed.length}</small>
          </summary>
          {fixed.map((c) => (
            <div className="pm-perm" key={c.key}>
              <span className="pm-permname">
                {c.label}
                <span className="pm-locked">
                  <Lock /> {c.why}
                </span>
              </span>
              <small className={`pm-fixed ${c.fixedRoles.includes(role) ? 'on' : ''}`}>{c.fixedRoles.includes(role) ? 'يملكها' : 'لا يملكها'}</small>
            </div>
          ))}
        </details>

        {a.can('permissions.grant') && (
          <section className="pm-presetbox" aria-label="الحزم">
            <div className="pm-presethead">
              <span>
                <b>الحزم الجاهزة</b>
                <small>صلاحيات بمدتها تُطبَّق معاً على شخص من بطاقته، مثل تغطية زميل في إجازة.</small>
              </span>
              <button type="button" className="secondary pm-newpreset" onClick={onNewPreset}>
                <Plus />
                حزمة جديدة
              </button>
            </div>
            {a.presets.length > 0 && (
              <ul>
                {a.presets.map((p) => (
                  <li key={p.id}>
                    <Package aria-hidden="true" />
                    <b>{p.name}</b>
                    <small>{p.items.map((i) => capability(i.k)?.label).filter(Boolean).join('، ')}</small>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {pending && (
        <Modal title={`${pending.to ? 'تفعيل' : 'إيقاف'} «${CAPABILITIES.find((c) => c.key === pending.cap)?.label}»`} onClose={() => setPending(null)}>
          <p>
            لكل من يحمل دور «{roleAr(pending.role)}»: {peopleAr(count(pending.role))} الآن، ومن يُعطى هذا الدور لاحقاً. من أُضيفت له أو سُحبت منه وحده يبقى كما هو.
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

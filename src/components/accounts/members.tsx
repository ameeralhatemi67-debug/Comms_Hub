'use client';
// «الأعضاء»: the people of the hub. A person's role is changed where it is read, on their row,
// and says what the change gives and takes before it is saved. A row shows where the person stands
// apart from their role; «الصلاحيات» opens their card beside the list; ticking rows grants, changes
// the role of, or removes several people at once. Adding a member asks for a name, an address and a
// role, and folds the rest away. Who may do what is the database's decision (perm_require); the
// list only explains it.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Clock, KeyRound, Lock, Plus, SlidersHorizontal, Trash2, UserCog, X } from 'lucide-react';
import { roles, type Role } from '@/lib/domain';
import { defaultPages, grantablePages, sanitizePages } from '@/lib/access';
import { CAPABILITIES, ROLE_HINT, assignableBy, capLabel, createsContent, givesCreate, manageBlock, markers, pagesAr, rankOf, roleAr, roleChange, roleHolds } from '@/lib/permissions';
import { HOLD } from '@/lib/kit/hold-reasons';
import { ENTRY_STATE_AR, sendInvite } from '@/lib/entry';
import { Modal } from '../ui';
import { useAccounts, type AccessRequest, type Member } from './data';

const roleIds = Object.keys(roles) as Role[];

export function when(iso: string | null) {
  if (!iso) return 'لم يسجل الدخول بعد';
  return new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Riyadh' }).slice(0, 16);
}

/** Why the signed-in person cannot manage this member, in words; null when they can. */
export function manageWhy(me: { email: string; role: Role }, can: (c: string) => boolean, m: Pick<Member, 'email' | 'role'>, cap = 'permissions.grant'): string | null {
  const b = manageBlock({ email: me.email, role: me.role, caps: can(cap) ? [cap] : [] }, m, cap);
  if (b === 'SELF_EDIT') return 'لا يعدّل أحد صلاحياته بنفسه.';
  if (b === 'FORBIDDEN') return cap === 'members.remove' ? 'الإزالة لمن يملك «إزالة عضو».' : cap === 'roles.assign' ? 'تغيير الدور لمن يملك «تغيير دور عضو».' : 'المنح لمن يملك «منح الصلاحيات وسحبها».';
  if (b === 'NOT_MANAGEABLE') return `${roleAr(m.role)} في رتبتك أو فوقها، فلا تدير صلاحياته.`;
  return null;
}

/** The small chips that say where a person stands apart from their role. */
export function ApartMarks({ grants }: { grants: { mode: 'standing' | 'timed' | 'once'; effect: 'allow' | 'deny' }[] }) {
  const mk = markers(grants);
  return (
    <>
      {mk.added > 0 && <span className="pm-mark added">{mk.added} مضافة</span>}
      {mk.timed > 0 && (
        <span className="pm-mark timed" title="صلاحيات مؤقتة">
          <Clock />
          {mk.timed} مؤقتة
        </span>
      )}
      {mk.once > 0 && <span className="pm-mark once">{mk.once} لمرة واحدة</span>}
      {mk.removed > 0 && <span className="pm-mark removed">{mk.removed} مسحوبة</span>}
    </>
  );
}

/** A person's role, changed where it is read; or, when it cannot be, the role with the reason. */
export function RolePick({ member, onPick }: { member: Member; onPick: (to: Role) => void }) {
  const a = useAccounts();
  const why = member.protected ? 'حساب مؤسس: لا يتغير دوره من التطبيق.' : manageWhy(a.me, a.can, member, 'roles.assign');
  if (why)
    return (
      <span className="chip pm-rolefixed" title={why}>
        {roleAr(member.role)}
      </span>
    );
  return (
    <select className="pm-rolepick" aria-label={`دور ${member.display_name}`} value={member.role} onChange={(e) => onPick(e.target.value as Role)}>
      {[...new Set([member.role, ...assignableBy(a.me.role, roleIds)])].map((r) => (
        <option key={r} value={r}>
          {roleAr(r)}
        </option>
      ))}
    </select>
  );
}

/** Changing one person's role: what it gives and takes, in words, before it is saved. */
export function RoleChangeDialog({ member, to, onClose }: { member: Member; to: Role; onClose: () => void }) {
  const a = useAccounts();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { gains, losses } = roleChange(member.role, to, (r, k) => roleHolds(a.defaults, r, k));
  const lower = losses.length > 0 || rankOf(to) < rankOf(member.role);
  const go = async () => {
    setBusy(true);
    const r = await a.call('assign_role', { p_email: member.email, p_role: to, p_pages: null });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    a.say(`صار دور ${member.display_name} «${roleAr(to)}». يسري عند أول تحميل جديد لصفحته.`);
    await a.reload();
    onClose();
  };
  return (
    <Modal title={`تغيير دور ${member.display_name}`} onClose={onClose}>
      <div className="pm-rolefromto">
        <span className="chip">{roleAr(member.role)}</span>
        <ArrowLeft aria-hidden="true" />
        <span className="chip success">{roleAr(to)}</span>
      </div>
      <p className="pm-rolehint">{ROLE_HINT[to]}</p>
      {gains.length > 0 && (
        <div className="pm-change gains">
          <b>سيستطيع</b>
          <ul>
            {gains.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}
      {losses.length > 0 && (
        <div className="pm-change losses">
          <b>لن يستطيع</b>
          <ul>
            {losses.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}
      {!gains.length && !losses.length && <p>لا فرق في الصلاحيات بين الدورين.</p>}
      <p className="muted">صفحاته، وما أُضيف له أو سُحب منه وحده، يبقى كما هو.</p>
      {error && (
        <p className="warning" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        {lower ? (
          <button type="button" className="primary" disabled={busy} data-hold={HOLD.roleDown} onClick={() => void go()}>
            {busy ? 'جارٍ الحفظ…' : `تغيير إلى «${roleAr(to)}»`}
          </button>
        ) : (
          <button type="button" className="primary" disabled={busy} onClick={() => void go()}>
            {busy ? 'جارٍ الحفظ…' : `تغيير إلى «${roleAr(to)}»`}
          </button>
        )}
        <button type="button" className="secondary" onClick={onClose}>
          إلغاء
        </button>
      </div>
    </Modal>
  );
}

export function MembersTab({ selected, onOpen, onGrant }: { selected: string | null; onOpen: (email: string) => void; onGrant: (emails: string[]) => void }) {
  const a = useAccounts();
  const [q, setQ] = useState('');
  const [ticked, setTicked] = useState<string[]>([]);
  const [roleFor, setRoleFor] = useState<string[] | null>(null);
  const [roleTo, setRoleTo] = useState<{ member: Member; to: Role } | null>(null);
  const [removing, setRemoving] = useState<string[] | null>(null);
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return a.members.filter((m) => !n || m.display_name.toLowerCase().includes(n) || m.email.includes(n) || roleAr(m.role).includes(q.trim()));
  }, [a.members, q]);
  const manageable = (m: Member) => !manageWhy(a.me, a.can, m);
  const tick = (email: string) => setTicked((t) => (t.includes(email) ? t.filter((x) => x !== email) : [...t, email]));
  const picked = a.members.filter((m) => ticked.includes(m.email));

  return (
    <div className="pm-members">
      <div className="pm-toolbar">
        <label className="pm-search">
          <span className="sr">ابحث عن عضو</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم أو البريد أو الدور" />
        </label>
      </div>
      {picked.length > 0 && (
        <div className="pm-bulk" role="toolbar" aria-label="ما حددته">
          <b>{picked.length} محدد</b>
          <button type="button" className="primary" onClick={() => onGrant(ticked)}>
            <KeyRound />
            منح للمحددين
          </button>
          <button type="button" className="secondary" disabled={!a.can('roles.assign')} title={a.can('roles.assign') ? '' : 'تغيير الدور لمن يملك «تغيير دور عضو».'} onClick={() => setRoleFor(ticked)}>
            <UserCog />
            تغيير الدور
          </button>
          <button type="button" className="secondary danger" disabled={!a.can('members.remove')} title={a.can('members.remove') ? '' : 'الإزالة لمن يملك «إزالة عضو».'} onClick={() => setRemoving(ticked)}>
            <Trash2 />
            إزالة
          </button>
          <button type="button" className="secondary" onClick={() => setTicked([])}>
            إلغاء التحديد
          </button>
        </div>
      )}
      <div className="pm-list" role="list">
        <div className="pm-rowhead" aria-hidden="true">
          <span />
          <span>العضو</span>
          <span>الدور</span>
          <span>الوصول</span>
          <span>آخر دخول</span>
          <span />
        </div>
        {a.status === 'loading' && <p className="muted pm-listnote">جارٍ التحميل…</p>}
        {list.map((m) => {
          const g = a.grants.filter((x) => x.email === m.email);
          const why = manageWhy(a.me, a.can, m);
          return (
            <div role="listitem" key={m.email} className={`pm-row ${selected === m.email ? 'on' : ''}`}>
              <input
                type="checkbox"
                aria-label={`تحديد ${m.display_name}`}
                checked={ticked.includes(m.email)}
                disabled={!!why}
                title={why ?? ''}
                onChange={() => tick(m.email)}
              />
              <button type="button" className="pm-who" onClick={() => onOpen(m.email)}>
                <span className="face sm" aria-hidden="true">
                  {m.display_name.trim().charAt(0)}
                </span>
                <span className="pm-whotext">
                  <b>{m.display_name}</b>
                  <small>
                    <bdi dir="ltr">{m.email}</bdi>
                  </small>
                </span>
              </button>
              <span className="pm-rolechip">
                <RolePick member={m} onPick={(to) => setRoleTo({ member: m, to })} />
                {m.protected && <small className="acct-founder">مؤسس</small>}
                {a.entry[m.email] && a.entry[m.email] !== 'active' && (
                  <small className="pm-entrymark" data-state={a.entry[m.email]}>
                    {ENTRY_STATE_AR[a.entry[m.email]]}
                  </small>
                )}
              </span>
              <span className="pm-marks">
                <small className="pm-pagecount">{m.role === 'admin' ? 'كل الصفحات' : pagesAr(sanitizePages(m.pages).length)}</small>
                <ApartMarks grants={g} />
              </span>
              <small className="muted pm-seen">
                <bdi dir="ltr">{when(m.last_seen_at)}</bdi>
              </small>
              <button type="button" className="secondary pm-open" onClick={() => onOpen(m.email)} aria-label={`صلاحيات ${m.display_name}`}>
                الصلاحيات
              </button>
            </div>
          );
        })}
        {a.status === 'ready' && !list.length && <p className="muted pm-listnote">لا أحد بهذا البحث.</p>}
      </div>
      <p className="muted pm-listhelp">
        غيّر الدور من القائمة في صف الشخص. «الصلاحيات» تفتح ما يملكه بمفاتيح تشغيل وإيقاف. المربع يحدد عدة أشخاص معاً؛ ويُعطَّل لمن لا تديره، ويقول السبب.
        {!a.members.some((m) => manageable(m)) && ' لا تدير صلاحيات أحد هنا.'}
      </p>
      {roleTo && <RoleChangeDialog member={roleTo.member} to={roleTo.to} onClose={() => setRoleTo(null)} />}
      {roleFor && <BulkRoleDialog emails={roleFor} onClose={() => setRoleFor(null)} onDone={() => (setRoleFor(null), setTicked([]))} />}
      {removing && <RemoveDialog emails={removing} onClose={() => setRemoving(null)} onDone={() => (setRemoving(null), setTicked([]))} />}
    </div>
  );
}

/**
 * Add a member, or accept an access request. The name, the address and the role are all it asks:
 * pages and the invitation start from their defaults, and «خيارات متقدمة» opens them only when needed.
 */
export function MemberDialog({
  mode,
  request,
  onClose,
  onAdded,
}: {
  mode: 'add' | 'approve';
  request?: AccessRequest;
  onClose: () => void;
  onAdded?: (email: string) => void;
}) {
  const a = useAccounts();
  const myRoles = assignableBy(a.me.role, roleIds);
  const holds = (p: string) => a.me.role === 'admin' || a.me.pages.includes(p);
  // Only pages the adder holds: the database refuses the rest (perm_pages_ok), and here the list is folded away.
  const startPages = (r: Role): string[] => defaultPages(r).filter(holds);
  const firstRole: Role = myRoles.includes('member') ? 'member' : myRoles[0] ?? 'member';
  const [name, setName] = useState(request?.full_name ?? '');
  const [email, setEmail] = useState(request?.email ?? '');
  const [role, setRole] = useState<Role>(firstRole);
  const [pages, setPages] = useState<string[]>(() => startPages(firstRole));
  const [extra, setExtra] = useState<string[]>([]);
  const [invite, setInvite] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const extras = a.can('permissions.grant')
    ? CAPABILITIES.filter((c) => c.grantable && c.scope !== 'page' && (c.key !== 'page.create' || (createsContent(role) && givesCreate(a.me.role))) && rankOf(role) >= c.minRank && !roleHolds(a.defaults, role, c.key) && (a.me.role === 'admin' || a.can(c.key)))
    : [];
  const chosen = extra.filter((k) => extras.some((c) => c.key === k));
  // «إنشاء» follows the role, or a permission chosen below: it is not in the account's page list.
  const open = sanitizePages(pages).filter((p) => p !== 'create');
  const nameField = useRef<HTMLInputElement>(null);
  // The dialog gives focus to its first control as it opens, which is its close button: the name is what comes next.
  useEffect(() => {
    if (mode !== 'add') return;
    const t = requestAnimationFrame(() => nameField.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [mode]);

  const save = async () => {
    setBusy(true);
    setError('');
    const to = email.trim().toLowerCase();
    const r = mode === 'add' ? await a.call('add_account', { p_email: email, p_name: name, p_role: role, p_pages: open }) : await a.call('approve_request', { p_id: request!.id, p_role: role, p_pages: open });
    if (!r.ok) {
      setBusy(false);
      return setError(r.error);
    }
    const refused: string[] = [];
    for (const k of chosen) {
      const g = await a.call('grant_capability', { p_email: to, p_cap: k, p_mode: 'standing', p_until: null, p_uses: null, p_scope: null, p_reason: null });
      if (!g.ok) refused.push(capLabel(k));
    }
    // A new person gets the invitation at once, unless the leader unticks it; the card can send it later.
    let said = 'أُضيف الحساب. يعيّن صاحبه كلمة مروره من تبويب «أول دخول».';
    if (invite) {
      const err = await sendInvite(to);
      said = err ? `أُضيف الحساب، لكن تعذّر إرسال الدعوة: ${err} أرسلها من بطاقته.` : 'أُضيف الحساب وأُرسلت الدعوة إلى بريده.';
    }
    setBusy(false);
    a.say(refused.length ? `${said} لم تُمنح: ${refused.join('، ')}.` : said);
    await a.reload();
    onAdded?.(to);
  };

  return (
    <Modal title={mode === 'add' ? 'إضافة عضو' : 'قبول طلب وصول'} onClose={onClose}>
      <form
        className="acct-form pm-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label>
          الاسم
          <input ref={nameField} required maxLength={80} value={name} autoComplete="off" onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          البريد الإلكتروني
          <input type="email" required dir="ltr" autoComplete="off" value={email} readOnly={mode !== 'add'} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          الدور
          <select
            value={role}
            onChange={(e) => {
              const r = e.target.value as Role;
              setRole(r);
              // A new role brings the pages that role can use; adjust them after.
              setPages(startPages(r));
            }}
          >
            {myRoles.map((r) => (
              <option key={r} value={r}>
                {roleAr(r)}
              </option>
            ))}
          </select>
          <small className="pm-rolehint">{ROLE_HINT[role]}</small>
        </label>
        {a.me.role === 'assistant' && <p className="muted">المساعد يمنح أدوار الفريق فقط.</p>}

        <p className="pm-defaults">
          <Check aria-hidden="true" />
          <span>
            يبدأ بـ{pagesAr(open.length)} وصلاحيات دوره{chosen.length ? ` و${chosen.length} إضافية` : ''}. {invite ? 'وتصله دعوة بالبريد الآن.' : 'ولن تُرسل دعوة الآن.'}
          </span>
        </p>

        <details className="pm-fold pm-advanced">
          <summary>
            <SlidersHorizontal aria-hidden="true" />
            <span>خيارات متقدمة</span>
            <ChevronDown className="pm-foldmark" aria-hidden="true" />
          </summary>
          <div className="pm-advbody">
            <fieldset>
              <legend>الصفحات المفتوحة</legend>
              <div className="page-grid">
                {grantablePages.filter((p) => p.id !== 'create').map((p) => {
                  const notMine = !holds(p.id) && !pages.includes(p.id);
                  return (
                    <label className="check-row" key={p.id} title={notMine ? 'لا تفتح صفحة لا تملكها أنت' : ''}>
                      <input
                        type="checkbox"
                        disabled={notMine}
                        checked={pages.includes(p.id)}
                        onChange={() => setPages((x) => (x.includes(p.id) ? x.filter((y) => y !== p.id) : [...x, p.id]))}
                      />
                      {p.label}
                    </label>
                  );
                })}
              </div>
              <small>الرئيسية والحساب مفتوحتان دائماً.</small>
            </fieldset>
            {extras.length > 0 && (
              <fieldset>
                <legend>صلاحيات إضافية من البداية</legend>
                <div className="pm-extras">
                  {extras.map((c) => (
                    <label className="check-row" key={c.key}>
                      <input type="checkbox" checked={extra.includes(c.key)} onChange={() => setExtra((x) => (x.includes(c.key) ? x.filter((y) => y !== c.key) : [...x, c.key]))} />
                      {c.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <label className="check-row">
              <input type="checkbox" checked={invite} onChange={(e) => setInvite(e.target.checked)} />
              أرسل دعوة إلى بريده الآن
            </label>
            <small>لا تمنح دوراً في رتبتك أو فوقها، ولا صفحة أو صلاحية لا تملكها أنت.</small>
          </div>
        </details>

        {error && (
          <p className="warning" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button className="primary" disabled={busy}>
            {busy ? 'جارٍ الحفظ…' : mode === 'add' ? 'إضافة العضو' : 'قبول وإضافة'}
          </button>
          <button type="button" className="secondary" onClick={onClose}>
            إلغاء
          </button>
        </div>
      </form>
    </Modal>
  );
}

function BulkRoleDialog({ emails, onClose, onDone }: { emails: string[]; onClose: () => void; onDone: () => void }) {
  const a = useAccounts();
  const myRoles = assignableBy(a.me.role, roleIds);
  const [role, setRole] = useState<Role>(myRoles[myRoles.length - 1] ?? 'member');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string[]>([]);
  const people = a.members.filter((m) => emails.includes(m.email));
  const lowers = people.some((m) => rankOf(role) < rankOf(m.role));
  const go = async () => {
    setBusy(true);
    const out: string[] = [];
    let ok = 0;
    for (const m of people) {
      const r = await a.call('assign_role', { p_email: m.email, p_role: role, p_pages: null });
      if (r.ok) ok++;
      else out.push(`${m.display_name}: ${r.error}`);
    }
    setBusy(false);
    await a.reload();
    a.say(`تغيّر دور ${ok} من ${people.length}.`);
    if (out.length) setReport(out);
    else onDone();
  };
  return (
    <Modal title={`تغيير دور ${people.length} أشخاص`} onClose={onClose}>
      <label>
        الدور الجديد
        <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {myRoles.map((r) => (
            <option key={r} value={r}>
              {roleAr(r)}
            </option>
          ))}
        </select>
      </label>
      <p className="muted">{people.map((m) => m.display_name).join('، ')}. تبقى صفحات كل واحد كما هي.</p>
      {report.length > 0 && (
        <div className="warning" role="alert">
          {report.map((x) => (
            <div key={x}>{x}</div>
          ))}
        </div>
      )}
      <div className="actions">
        <button type="button" className="primary" disabled={busy} data-hold={lowers ? HOLD.roleDown : undefined} onClick={() => void go()}>
          <Check />
          تغيير الدور
        </button>
        <button type="button" className="secondary" onClick={onClose}>
          <X />
          إلغاء
        </button>
      </div>
    </Modal>
  );
}

/** Removing states what happens to the person's work and mail: kept, as the current rules say. */
export function RemoveDialog({ emails, onClose, onDone }: { emails: string[]; onClose: () => void; onDone: () => void }) {
  const a = useAccounts();
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string[]>([]);
  const people = a.members.filter((m) => emails.includes(m.email));
  const asked = people.filter((m) => a.deletions.some((d) => d.email === m.email));
  const go = async () => {
    setBusy(true);
    const out: string[] = [];
    let ok = 0;
    for (const m of people) {
      const r = await a.call('account_remove', { p_email: m.email });
      if (r.ok) ok++;
      else out.push(`${m.display_name}: ${r.error}`);
    }
    setBusy(false);
    await a.reload();
    a.say(`أُزيل ${ok} من ${people.length}، وأُلغيت جلساتهم.`);
    if (out.length) setReport(out);
    else onDone();
  };
  return (
    <Modal title={people.length === 1 ? `إزالة ${people[0]?.display_name ?? ''}` : `إزالة ${people.length} أشخاص`} onClose={onClose}>
      <p>
        يُلغى دخول {people.map((m) => m.display_name).join('، ')} وجلساتهم فوراً، وتنتهي صلاحياتهم المضافة. أعمالهم ومهامهم وبريدهم تبقى كما هي في
        المركز، ويعيد القادة إسنادها من «العمل» و«المهام». إن أراد أحدهم العودة فيُضاف من جديد.
      </p>
      {asked.length > 0 && (
        <p className="pm-removeasked">
          طلب {asked.map((m) => m.display_name).join('، ')} حذف {asked.length === 1 ? 'حسابه' : 'حساباتهم'}: الإزالة تنفّذ الطلب، وتُحذف معها أيضاً التنبيهات والتذكيرات
          الخاصة والتقدّم في الأدلة والنجوم في المراسلة.
        </p>
      )}
      <p className="muted">
        <Lock /> حسابات المؤسسين لا تُزال.
      </p>
      {report.length > 0 && (
        <div className="warning" role="alert">
          {report.map((x) => (
            <div key={x}>{x}</div>
          ))}
        </div>
      )}
      <div className="actions">
        <button type="button" className="primary danger" disabled={busy} data-hold={HOLD.removeMember} onClick={() => void go()}>
          <Trash2 />
          إزالة
        </button>
        <button type="button" className="secondary" onClick={onClose}>
          إلغاء
        </button>
      </div>
    </Modal>
  );
}

export function AccessRequests({ onApprove }: { onApprove: (r: AccessRequest) => void }) {
  const a = useAccounts();
  if (!a.can('members.invite')) return <p className="muted">طلبات الوصول لمن يملك «إضافة الأعضاء وقبول طلبات الوصول».</p>;
  if (!a.requests.length) return <p className="muted">لا طلبات وصول معلقة.</p>;
  return (
    <div className="stack pm-access">
      {a.requests.map((req) => (
        <div className="acct-request" key={req.id}>
          <span className="work-name">
            <b>{req.full_name}</b>
            <small>
              <bdi dir="ltr">{req.email}</bdi> · <bdi dir="ltr">{when(req.created_at)}</bdi>
            </small>
            {req.note && <p>{req.note}</p>}
          </span>
          <span className="actions">
            <button type="button" className="primary" onClick={() => onApprove(req)}>
              <Plus />
              قبول
            </button>
            <button
              type="button"
              className="secondary"
              onClick={async () => {
                const r = await a.call('reject_request', { p_id: req.id });
                if (!r.ok) return a.say(r.error);
                // Tell the applicant by email; the database allows this once, just after the refusal.
                const told = await fetch('/api/entry/invite', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email: req.email, kind: 'rejected' }),
                }).then((x) => x.ok && x.json().then((j: { sent?: boolean }) => !!j.sent)).catch(() => false);
                a.say(told ? 'رُفض الطلب وأُبلغ صاحبه بالبريد.' : 'رُفض الطلب. تعذّر إبلاغ صاحبه بالبريد.');
                await a.reload();
              }}
            >
              <X />
              رفض
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

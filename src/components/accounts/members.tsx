'use client';
// «الأعضاء»: the people of the hub, with their role, pages and small markers for temporary,
// one-time and removed permissions. One click opens a person's card beside the list; ticking
// rows grants, changes the role of, or removes several people at once. Who may do what is
// the database's decision (perm_require); the list only explains it.
import { useMemo, useState } from 'react';
import { Check, Clock, KeyRound, Lock, Plus, Trash2, UserCog, X } from 'lucide-react';
import { roles, type Role } from '@/lib/domain';
import { defaultPages, grantablePages, sanitizePages } from '@/lib/access';
import { assignableBy, manageBlock, markers, rankOf, roleAr } from '@/lib/permissions';
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

export function MembersTab({ selected, onOpen, onGrant }: { selected: string | null; onOpen: (email: string) => void; onGrant: (emails: string[]) => void }) {
  const a = useAccounts();
  const [q, setQ] = useState('');
  const [ticked, setTicked] = useState<string[]>([]);
  const [roleFor, setRoleFor] = useState<string[] | null>(null);
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
        <small className="muted">{a.members.length} عضواً</small>
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
        {a.status === 'loading' && <p className="muted">جارٍ التحميل…</p>}
        {list.map((m) => {
          const g = a.grants.filter((x) => x.email === m.email);
          const mk = markers(g);
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
                <b>{m.display_name}</b>
                <small>
                  <bdi dir="ltr">{m.email}</bdi>
                </small>
              </button>
              <span className="pm-rolechip">
                <span className="chip">{roleAr(m.role)}</span>
                {m.protected && <small className="acct-founder"> مؤسس</small>}
                {a.entry[m.email] && a.entry[m.email] !== 'active' && (
                  <small className="pm-entrymark" data-state={a.entry[m.email]}>
                    {ENTRY_STATE_AR[a.entry[m.email]]}
                  </small>
                )}
              </span>
              <span className="pm-marks">
                {mk.timed > 0 && (
                  <span className="pm-mark timed" title="صلاحيات مؤقتة">
                    <Clock />
                    {mk.timed} مؤقتة
                  </span>
                )}
                {mk.once > 0 && <span className="pm-mark once">{mk.once} لمرة واحدة</span>}
                {mk.removed > 0 && <span className="pm-mark removed">{mk.removed} مسحوبة</span>}
                {m.role !== 'admin' && <span className="muted">{sanitizePages(m.pages).length} صفحة</span>}
              </span>
              <small className="muted pm-seen">
                <bdi dir="ltr">{when(m.last_seen_at)}</bdi>
              </small>
              <button type="button" className="secondary pm-open" onClick={() => onOpen(m.email)} aria-label={`بطاقة ${m.display_name}`}>
                البطاقة
              </button>
            </div>
          );
        })}
        {a.status === 'ready' && !list.length && <p className="muted">لا أحد بهذا البحث.</p>}
      </div>
      <p className="muted">
        انقر اسماً لتفتح بطاقته بجانب القائمة. المربع يحدد عدة أشخاص لتمنحهم أو تغيّر دورهم أو تزيلهم معاً؛ يُعطَّل لمن لا تديره، ويقول السبب.
        {!a.members.some((m) => manageable(m)) && ' لا تدير صلاحيات أحد هنا.'}
      </p>
      {roleFor && <BulkRoleDialog emails={roleFor} onClose={() => setRoleFor(null)} onDone={() => (setRoleFor(null), setTicked([]))} />}
      {removing && <RemoveDialog emails={removing} onClose={() => setRemoving(null)} onDone={() => (setRemoving(null), setTicked([]))} />}
    </div>
  );
}

/** Add a member, accept an access request, or edit a member's name and pages. */
export function MemberDialog({
  mode,
  member,
  request,
  onClose,
  onAdded,
}: {
  mode: 'add' | 'edit' | 'approve';
  member?: Member;
  request?: AccessRequest;
  onClose: () => void;
  onAdded?: (email: string) => void;
}) {
  const a = useAccounts();
  const firstRole: Role = member?.role ?? 'member';
  const [name, setName] = useState(member?.display_name ?? request?.full_name ?? '');
  const [email, setEmail] = useState(member?.email ?? request?.email ?? '');
  const [role, setRole] = useState<Role>(firstRole);
  const [pages, setPages] = useState<string[]>(member ? sanitizePages(member.pages) : defaultPages('member'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [invite, setInvite] = useState(true);
  const myRoles = assignableBy(a.me.role, roleIds);
  const holds = (p: string) => a.me.role === 'admin' || a.me.pages.includes(p);
  const canRole = mode !== 'edit' || (a.can('roles.assign') && !member?.protected && !manageWhy(a.me, a.can, member!, 'roles.assign'));
  const lower = mode === 'edit' && member && rankOf(role) < rankOf(member.role);

  const save = async () => {
    setBusy(true);
    setError('');
    const p = sanitizePages(pages);
    let r;
    if (mode === 'add') r = await a.call('add_account', { p_email: email, p_name: name, p_role: role, p_pages: p });
    else if (mode === 'approve') r = await a.call('approve_request', { p_id: request!.id, p_role: role, p_pages: p });
    else if (member && role !== member.role) {
      r = await a.call('assign_role', { p_email: member.email, p_role: role, p_pages: p });
      if (r.ok) r = await a.call('account_update', { p_email: member.email, p_name: name.trim(), p_pages: null });
    } else r = await a.call('account_update', { p_email: member!.email, p_name: name.trim(), p_pages: member!.protected ? null : p });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    // A new person gets the invitation at once, unless the leader unticks it; the card can send it later.
    let said = mode === 'edit' ? 'حُفظ الحساب. يسري عند أول تحميل جديد لصفحته.' : 'أُضيف الحساب. يعيّن صاحبه كلمة مروره من تبويب «أول دخول».';
    if (mode !== 'edit' && invite) {
      const err = await sendInvite(email.trim().toLowerCase());
      said = err ? `أُضيف الحساب، لكن تعذّر إرسال الدعوة: ${err} أرسلها من بطاقته.` : 'أُضيف الحساب وأُرسلت الدعوة إلى بريده.';
    }
    a.say(said);
    await a.reload();
    if (mode !== 'edit') onAdded?.(email.trim().toLowerCase());
    else onClose();
  };

  return (
    <Modal title={mode === 'add' ? 'إضافة عضو' : mode === 'approve' ? 'قبول طلب وصول' : 'تعديل الحساب'} onClose={onClose}>
      <form
        className="acct-form pm-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label>
          الاسم
          <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          البريد الإلكتروني
          <input type="email" required dir="ltr" value={email} readOnly={mode !== 'add'} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {member?.protected ? (
          <p className="muted">حساب مؤسس بدور Admin: يفتح كل الصفحات، ولا يتغير دوره ولا يُحذف من التطبيق.</p>
        ) : (
          <>
            <label>
              الدور
              <select value={role} disabled={!canRole} onChange={(e) => {
                const r = e.target.value as Role;
                setRole(r);
                // A new role brings the pages that role can use; adjust them after.
                if (mode !== 'edit') setPages(defaultPages(r).filter(holds));
              }}>
                {[...new Set([firstRole, ...myRoles])].filter((r) => r !== 'admin' || firstRole === 'admin').map((r) => (
                  <option key={r} value={r} disabled={r !== firstRole && !myRoles.includes(r)}>
                    {roleAr(r)}
                  </option>
                ))}
              </select>
            </label>
            {!canRole && <p className="muted">تغيير الدور لمن يملك «تغيير دور عضو» ورتبته فوق هذا الشخص.</p>}
            <p className="muted">
              لا تمنح دوراً في رتبتك أو فوقها{a.me.role === 'assistant' ? '، والمساعد يمنح أدوار الفريق فقط' : ''}. صلاحيات الدور تظهر في تبويب «الأدوار».
            </p>
            <fieldset>
              <legend>الصفحات المفتوحة</legend>
              <div className="page-grid">
                {grantablePages.map((p) => {
                  const noCreate = p.id === 'create' && !roles[role].create;
                  const notMine = !holds(p.id) && !pages.includes(p.id);
                  return (
                    <label className="check-row" key={p.id} title={noCreate ? 'هذا الدور لا ينشئ المحتوى' : notMine ? 'لا تفتح صفحة لا تملكها أنت' : ''}>
                      <input
                        type="checkbox"
                        disabled={noCreate || notMine}
                        checked={!noCreate && pages.includes(p.id)}
                        onChange={() => setPages((x) => (x.includes(p.id) ? x.filter((y) => y !== p.id) : [...x, p.id]))}
                      />
                      {p.label}
                    </label>
                  );
                })}
              </div>
              <p className="muted">الرئيسية والحساب مفتوحتان دائماً. صفحة لمدة محددة تُمنح من بطاقة العضو.</p>
            </fieldset>
          </>
        )}
        {mode !== 'edit' && (
          <label className="check-row">
            <input type="checkbox" checked={invite} onChange={(e) => setInvite(e.target.checked)} />
            أرسل دعوة إلى بريده الآن
          </label>
        )}
        {error && (
          <p className="warning" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          {lower ? (
            <button type="button" className="primary" disabled={busy} data-hold={HOLD.roleDown} onClick={() => void save()}>
              {busy ? 'جارٍ الحفظ…' : `حفظ: «${roleAr(role)}»`}
            </button>
          ) : (
            <button className="primary" disabled={busy}>
              {busy ? 'جارٍ الحفظ…' : 'حفظ'}
            </button>
          )}
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

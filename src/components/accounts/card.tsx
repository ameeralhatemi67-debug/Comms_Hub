'use client';
// The person's card (Permissions_Plan.md 5.2, as changed on 2026-11-01): who they are, their role,
// where they stand apart from it, then every permission with one control, a switch. On or off is
// all a leader decides; which database call that takes follows from where the permission comes
// from (switchStep), and the small line under a name says where that is. What cannot be switched
// is folded away with its reason. The grant dialog (5.2, «منح») gives a permission for good, for a
// time, or once, and says in words what the person will be able to do and until when.
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronDown, Clock, KeyRound, Lock, Package, Pencil, Scale, Trash2, Undo2, X } from 'lucide-react';
import type { Role } from '@/lib/domain';
import { grantablePages } from '@/lib/access';
import {
  CAPABILITIES,
  DURATIONS,
  GROUP_AR,
  MODE_AR,
  ROLE_HINT,
  capLabel,
  capability,
  createsContent,
  grantPreview,
  howAr,
  rankOf,
  roleAr,
  roleHolds,
  sourceLine,
  stamp,
  switchStep,
  switchWhy,
  type CapEval,
  type CapGroup,
  type Grant,
  type Mode,
  givesCreate,
  notOnce,
} from '@/lib/permissions';
import { HOLD } from '@/lib/kit/hold-reasons';
import { Modal } from '../ui';
import { useAccounts, usePersonCard, useRooms, type Member, type PersonCardData } from './data';
import { ApartMarks, RemoveDialog, RoleChangeDialog, RolePick, manageWhy, when } from './members';
import { EntryHelp } from './entry-help';

type Card = PersonCardData;

const LEVEL_AR = ['لا وصول', 'عرض', 'تحرير', 'إنشاء', 'إدارة'];
const GROUPS: CapGroup[] = ['pages', 'messaging', 'accounts', 'settings'];
/** A page by its own name, where the heading already says these are pages. */
export const pageName = (k: string) => grantablePages.find((p) => `page.${p.id}` === k)?.label ?? capLabel(k);

/** A folded section: a title, a count, and what opens under it. */
function Fold({ title, count, open, className = '', children }: { title: string; count?: string; open?: boolean; className?: string; children: ReactNode }) {
  return (
    <details className={`pm-fold ${className}`} open={open}>
      <summary>
        <span>{title}</span>
        {count && <small>{count}</small>}
        <ChevronDown className="pm-foldmark" aria-hidden="true" />
      </summary>
      {children}
    </details>
  );
}

/**
 * One permission of one person, on or off, whatever put it there. The card and the role table
 * share it. It shows the new state at once and goes back if the database refuses.
 */
export function PersonSwitch({ person, k, e, label, blocked }: {
  person: { email: string; name: string; role: Role };
  k: string;
  e: Pick<CapEval, 'ok' | 'src' | 'id'>;
  label: string;
  /** Why the signed-in person cannot manage this person at all, when so. */
  blocked?: string | null;
}) {
  const a = useAccounts();
  const [want, setWant] = useState<boolean | null>(null);
  useEffect(() => setWant(null), [e.ok, e.src, e.id]);
  const has = roleHolds(a.defaults, person.role, k);
  const why = blocked || switchWhy(k, e, person.role, has, a.can(k) || a.me.role === 'admin', a.me.role);
  const on = want ?? e.ok;
  const flip = async () => {
    const step = switchStep(e, has);
    if (!step) return;
    setWant(!e.ok);
    const r = step.fn === 'revoke_capability' ? await a.call('revoke_capability', { p_id: step.id }) : await a.call('set_member_override', { p_email: person.email, p_cap: k, p_effect: step.effect, p_reason: null });
    if (!r.ok) {
      setWant(null);
      return a.say(r.error);
    }
    a.say(e.ok ? `أُوقفت «${label}» لـ${person.name}.` : `شُغّلت «${label}» لـ${person.name}.`);
    await a.reload();
    setTimeout(() => setWant(null), 2000);
  };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${label}، ${person.name}`}
      className={`pm-switch ${on ? 'on' : ''}`}
      disabled={!!why || want !== null}
      title={why}
      onClick={() => void flip()}
    >
      <i />
    </button>
  );
}

export function PersonCard({ email, onClose, onGrant, onCompare }: { email: string; onClose: () => void; onGrant: (emails: string[], cap?: string) => void; onCompare: (role: Role) => void }) {
  const a = useAccounts();
  const member = a.members.find((m) => m.email === email);
  const { card, error: refused } = usePersonCard(email);
  const [q, setQ] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [roleTo, setRoleTo] = useState<Role | null>(null);
  const [extend, setExtend] = useState<Grant | null>(null);
  const [preset, setPreset] = useState('');
  const why = member ? manageWhy(a.me, a.can, member) : null;
  const wa = useWhatsAppOf(email);

  if (!member) return null;
  const act = async (fn: string, args: Record<string, unknown>, ok: string) => {
    const r = await a.call(fn, args);
    if (!r.ok) return a.say(r.error);
    a.say(ok);
    await a.reload();
  };
  const canRemove = a.can('members.remove') && !member.protected && !manageWhy(a.me, a.can, member, 'members.remove');
  const movable = (e: CapEval) => !!capability(e.k)?.grantable;
  const fits = (e: CapEval) => rankOf(member.role) >= (capability(e.k)?.minRank ?? 0) && (e.k !== 'page.create' || createsContent(member.role));
  const n = q.trim();
  const named = (e: CapEval) => !n || capLabel(e.k).includes(n);
  const row = (e: CapEval, short = false) => (
    <PermRow key={e.k} e={e} card={card!} short={short} blocked={why} onGrant={() => onGrant([email], e.k)} onExtend={setExtend} />
  );
  const unfit = card ? card.caps.filter((e) => movable(e) && !fits(e)) : [];
  const fixed = card ? card.caps.filter((e) => capability(e.k) && !movable(e)) : [];
  const anyMatch = !!card && card.caps.some((e) => movable(e) && fits(e) && named(e));

  return (
    <aside className="pm-card" aria-label={`صلاحيات ${member.display_name}`}>
      <header className="pm-head">
        <span className="face">{member.display_name.trim().charAt(0)}</span>
        <span className="work-name">
          <b>{member.display_name}</b>
          <small>
            <bdi dir="ltr">{member.email}</bdi>
          </small>
          <small>
            {member.protected ? 'مؤسس · ' : ''}آخر دخول <bdi dir="ltr">{when(member.last_seen_at)}</bdi>
          </small>
          {wa.row && (
            <small className="pm-wa">
              واتساب: {wa.row.linked ? 'مرتبط' : 'غير مرتبط'}
              {wa.row.phone && (
                <>
                  {' · '}
                  <bdi dir="ltr">{wa.row.phone}</bdi>
                </>
              )}
              {wa.row.linked && a.me.role === 'admin' && a.me.email !== email && (
                <button
                  type="button"
                  className="secondary danger pm-wa-unlink"
                  data-hold={HOLD.waUnlink}
                  onClick={() => void a.call('wa_admin_unlink', { p_email: email }).then((r) => (r.ok ? (a.say('قُطع ربط الرقم، وأُبلغ العضو.'), wa.reload()) : a.say(r.error)))}
                >
                  قطع ربط الرقم
                </button>
              )}
            </small>
          )}
        </span>
        <button type="button" className="pm-x" aria-label="إغلاق" onClick={onClose}>
          <X />
        </button>
      </header>

      {why && (
        <p className="pm-why">
          <Lock /> {why}
        </p>
      )}
      {!why && <EntryHelp member={member} />}

      <section className="pm-rolebox" aria-label="الدور">
        <div className="pm-roleline">
          <b>الدور</b>
          <RolePick member={member} onPick={setRoleTo} />
        </div>
        <small className="pm-rolehint">{ROLE_HINT[member.role]}</small>
        {card && (
          <div className="pm-apart">
            {card.grants.length ? (
              <>
                <span className="pm-marks">
                  <ApartMarks grants={card.grants} />
                </span>
                {!why && (
                  <button
                    type="button"
                    className="secondary sm"
                    data-hold={HOLD.endAllGrants}
                    onClick={() => void act('revoke_all_capabilities', { p_email: email }, 'انتهت كل الصلاحيات المضافة لهذا الشخص.')}
                  >
                    <Undo2 />
                    إعادته إلى دوره
                  </button>
                )}
              </>
            ) : (
              <small>يعمل بصلاحيات دوره كما هي.</small>
            )}
          </div>
        )}
        {a.members.some((m) => m.role === member.role && m.email !== email) && (
          <button type="button" className="pm-textbtn" onClick={() => onCompare(member.role)}>
            <Scale />
            قارنه بزملائه في الدور
          </button>
        )}
      </section>

      {!why && (
        <div className="pm-actions">
          <button type="button" className="secondary pm-grant" onClick={() => onGrant([email])}>
            <KeyRound />
            منح مؤقت
          </button>
          {a.presets.length > 0 && (
            <span className="pm-presets">
              <select aria-label="حزمة صلاحيات" value={preset} onChange={(e) => setPreset(e.target.value)}>
                <option value="">حزمة جاهزة…</option>
                {a.presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="secondary"
                disabled={!preset}
                onClick={() => void act('preset_apply', { p_email: email, p_id: preset, p_reason: null }, 'طُبّقت الحزمة.')}
              >
                <Package />
                تطبيق
              </button>
            </span>
          )}
        </div>
      )}

      {!card && !refused && !why && <p className="muted">جارٍ تحميل الصلاحيات…</p>}
      {!card && refused && !why && (
        <p className="warning" role="alert">
          {refused}
        </p>
      )}
      {card && (
        <div className="pm-perms">
          {(card.requests ?? []).length > 0 && (
            <section className="pm-group pm-pending">
              <h3>طلبات ينتظر قرارها</h3>
              {card.requests!.map((q) => (
                <div className="pm-perm" key={q.id}>
                  <span className="pm-permname">
                    {capLabel(q.k)}
                    {howAr(q.mode, q.hours, q.uses)}
                    <small className="pm-src once">«{q.reason}»</small>
                  </span>
                </div>
              ))}
              <small className="muted">تُقرّر من تبويب «الطلبات».</small>
            </section>
          )}

          <label className="pm-permsearch">
            <span className="sr">ابحث في صلاحياته</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث في صلاحياته" />
          </label>
          {n && !anyMatch && <p className="muted">لا صلاحية بهذا الاسم.</p>}

          {GROUPS.map((grp) => {
            const rows = card.caps.filter((e) => capability(e.k)?.grp === grp && movable(e) && fits(e) && named(e));
            if (!rows.length) return null;
            const held = rows.filter((e) => e.ok).length;
            // A short group stays open, so the way to give something is in sight. Only a long one the person
            // holds nothing of folds away (an assistant's settings), and it opens for a search.
            return (
              <Fold key={grp} title={GROUP_AR[grp]} count={`${held} من ${rows.length}`} open={!!n || held > 0 || rows.length <= 6} className="pm-group">
                <div className={grp === 'pages' ? 'pm-pagegrid' : undefined}>{rows.map((e) => row(e, grp === 'pages'))}</div>
              </Fold>
            );
          })}

          {unfit.length > 0 && !n && (
            <Fold title={`لا تناسب دور ${roleAr(member.role)}`} count={String(unfit.length)}>
              {unfit.map((e) => row(e))}
            </Fold>
          )}
          {fixed.length > 0 && !n && (
            <Fold title={GROUP_AR.fixed} count={String(fixed.length)}>
              {fixed.map((e) => {
                const c = capability(e.k)!;
                return (
                  <div className={`pm-perm ${e.ok ? 'on' : 'off'}`} key={e.k}>
                    <span className="pm-permname">
                      {c.label}
                      <span className="pm-locked" title={c.why}>
                        <Lock /> {c.why}
                      </span>
                    </span>
                    <small className={`pm-fixed ${e.ok ? 'on' : ''}`}>{e.ok ? 'يملكها' : 'لا يملكها'}</small>
                  </div>
                );
              })}
            </Fold>
          )}
          {!n && (
            <Fold title="مجلدات المكتبة" count={card.folders.length ? String(card.folders.length) : undefined} className="pm-folders">
              {card.folders.length ? (
                card.folders.map((f) => (
                  <div className="pm-perm" key={`${f.folder}`}>
                    <span className="pm-permname">{f.name ?? 'أعلى المكتبة'}</span>
                    <span className="pm-src page">
                      {LEVEL_AR[f.level] ?? ''}
                      {f.until ? ` · حتى ${stamp(f.until)}` : ''}
                    </span>
                  </div>
                ))
              ) : (
                <p className="muted">لا مستويات خاصة به؛ يتبع دوره في كل مجلد.</p>
              )}
              <Link className="text-link" href="/media">
                مستويات المجلدات تُدار من المكتبة
              </Link>
            </Fold>
          )}
        </div>
      )}

      {!why && (
        <footer className="pm-cardfoot">
          <button type="button" className="pm-textbtn" onClick={() => setRenaming(true)}>
            <Pencil />
            تعديل الاسم
          </button>
          {canRemove && (
            <button type="button" className="pm-textbtn danger" onClick={() => setRemoving(true)}>
              <Trash2 />
              إزالة العضو
            </button>
          )}
        </footer>
      )}

      {roleTo && <RoleChangeDialog member={member} to={roleTo} onClose={() => setRoleTo(null)} />}
      {renaming && <RenameDialog member={member} onClose={() => setRenaming(false)} />}
      {removing && <RemoveDialog emails={[email]} onClose={() => setRemoving(false)} onDone={() => (setRemoving(false), onClose())} />}
      {extend && <ExtendDialog g={extend} name={member.display_name} onClose={() => setExtend(null)} />}
    </aside>
  );
}

function PermRow({ e, card, short, blocked, onGrant, onExtend }: { e: CapEval; card: Card; short: boolean; blocked: string | null; onGrant: () => void; onExtend: (g: Grant) => void }) {
  const a = useAccounts();
  const g = e.id ? card.grants.find((x) => x.id === e.id) : undefined;
  const label = short ? pageName(e.k) : capLabel(e.k);
  // «من صفحات الحساب» on every page says nothing: what is plainly so stays unsaid, what stands out is named.
  const note = e.src === 'none' || e.src === 'page' ? '' : `${sourceLine(e)}${g?.scope?.room ? ' · لمحادثة واحدة' : ''}`;
  const free = !blocked && !switchWhy(e.k, e, card.role, roleHolds(a.defaults, card.role, e.k), a.can(e.k) || a.me.role === 'admin', a.me.role);
  return (
    <div className={`pm-perm ${e.ok ? 'on' : 'off'}`}>
      <span className="pm-permname">
        {label}
        {note && <small className={`pm-src ${e.src}`}>{note}</small>}
      </span>
      <span className="pm-permctl">
        {e.src === 'timed' && g && !blocked && (
          <button type="button" className="secondary sm" onClick={() => onExtend(g)}>
            تمديد
          </button>
        )}
        {!e.ok && free && (
          <button type="button" className="pm-iconbtn" aria-label={`منح «${label}» لمدة محددة`} title="لمدة محددة أو لمرة واحدة" onClick={onGrant}>
            <Clock />
          </button>
        )}
        <PersonSwitch person={{ email: card.email, name: card.name, role: card.role }} k={e.k} e={e} label={label} blocked={blocked} />
      </span>
    </div>
  );
}

function RenameDialog({ member, onClose }: { member: Member; onClose: () => void }) {
  const a = useAccounts();
  const [name, setName] = useState(member.display_name);
  const [error, setError] = useState('');
  const save = async () => {
    const r = await a.call('account_update', { p_email: member.email, p_name: name.trim(), p_pages: null });
    if (!r.ok) return setError(r.error);
    a.say('حُفظ الاسم.');
    await a.reload();
    onClose();
  };
  return (
    <Modal title="تعديل الاسم" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label>
          الاسم
          <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {error && (
          <p className="warning" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button className="primary">حفظ</button>
          <button type="button" className="secondary" onClick={onClose}>
            إلغاء
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ExtendDialog({ g, name, onClose }: { g: Grant; name: string; onClose: () => void }) {
  const a = useAccounts();
  const [dur, setDur] = useState('day');
  const [date, setDate] = useState('');
  const until = dur === 'date' ? (date ? new Date(date).toISOString() : null) : new Date(Date.parse(g.until ?? new Date().toISOString()) + (DURATIONS.find((d) => d.id === dur)?.ms ?? 0)).toISOString();
  const save = async () => {
    if (!until) return;
    const r = await a.call('extend_capability', { p_id: g.id, p_until: until });
    if (!r.ok) return a.say(r.error);
    a.say('تغيّرت النهاية.');
    await a.reload();
    onClose();
  };
  return (
    <Modal title={`تمديد «${capLabel(g.k)}»`} onClose={onClose}>
      <p className="muted">تنتهي الآن في {g.until ? stamp(g.until) : ''}. اختر كم تُمدّ، أو نهاية محددة.</p>
      <div className="pm-durs" role="group" aria-label="المدة">
        {DURATIONS.map((d) => (
          <button type="button" key={d.id} aria-pressed={dur === d.id} className={dur === d.id ? 'on' : ''} onClick={() => setDur(d.id)}>
            {d.id === 'date' ? d.label : `+ ${d.label}`}
          </button>
        ))}
      </div>
      {dur === 'date' && (
        <label>
          النهاية
          <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      )}
      <p className="pm-preview">{until ? `سيملك ${name} «${capLabel(g.k)}» حتى ${stamp(until)}.` : 'اختر النهاية.'}</p>
      <div className="actions">
        <button type="button" className="primary" disabled={!until} onClick={() => void save()}>
          حفظ
        </button>
        <button type="button" className="secondary" onClick={onClose}>
          إلغاء
        </button>
      </div>
    </Modal>
  );
}

/** «منح»: one small dialog; defaults are temporary for a day, one-time for one use. */
export function GrantDialog({ emails, initial, requestId, defaults, onClose, onDone }: {
  emails: string[];
  initial?: string;
  /** Approving a permission request: its id, and what was asked (the granter may change it). */
  requestId?: string;
  defaults?: { mode?: Mode; until?: string | null; uses?: number; scope?: Record<string, string> | null; reason?: string };
  onClose: () => void;
  onDone?: () => void;
}) {
  const a = useAccounts();
  const people = a.members.filter((m) => emails.includes(m.email));
  const [q, setQ] = useState('');
  const [cap, setCap] = useState(initial ?? '');
  const [mode, setMode] = useState<Mode>(defaults?.mode ?? 'timed');
  const [dur, setDur] = useState(defaults?.until ? 'date' : defaults?.mode === 'once' ? 'none' : 'day');
  const [date, setDate] = useState(defaults?.until ? defaults.until.slice(0, 16) : '');
  const [uses, setUses] = useState(defaults?.uses ?? 1);
  const [room, setRoom] = useState(defaults?.scope?.room ?? '');
  const [reason, setReason] = useState(defaults?.reason ?? '');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string[]>([]);
  const c = capability(cap);
  const rooms = useRooms(c?.scope === 'room');
  const minRank = Math.min(...people.map((p) => rankOf(p.role)));

  const options = useMemo(() => {
    const n = q.trim();
    return CAPABILITIES.filter((x) => x.grantable && (!n || x.label.includes(n))).map((x) => {
      let why = '';
      if (x.key === 'page.create' && !givesCreate(a.me.role)) why = 'يمنحها مدير الاتصال ومسؤول النظام';
      else if (!a.can(x.key) && a.me.role !== 'admin') why = 'لا تملكها أنت';
      else if (minRank < x.minRank) why = 'لا تناسب دور من اخترت';
      else if (x.key === 'page.create' && people.some((p) => !['director', 'assistant', 'writer', 'designer', 'producer', 'member'].includes(p.role))) why = 'لمن يملك دوره الإنشاء';
      return { x, why };
    });
  }, [q, a, minRank, people]);

  const msFor = DURATIONS.find((d) => d.id === dur)?.ms ?? 864e5;
  const picked = dur === 'date' ? (date ? new Date(date).toISOString() : null) : new Date(Date.now() + msFor).toISOString();
  const effUntil = mode === 'standing' || (mode === 'once' && dur === 'none') ? null : picked;
  const roomName = rooms.find((r) => r.id === room)?.name ?? null;
  const names = people.map((p) => p.display_name).join(' و');
  const ready = !!c && (mode !== 'timed' || !!effUntil) && !(mode === 'once' && notOnce(c));

  const save = async () => {
    if (!c) return;
    setBusy(true);
    const out: string[] = [];
    let ok = 0;
    for (const p of people) {
      const r = requestId
        ? await a.call('decide_permission_request', {
            p_id: requestId, p_approve: true, p_mode: mode, p_until: effUntil, p_uses: mode === 'once' ? uses : null,
            p_scope: mode === 'once' && room ? { room } : null, p_note: reason || null,
          })
        : await a.call('grant_capability', {
            p_email: p.email, p_cap: c.key, p_mode: mode, p_until: effUntil, p_uses: mode === 'once' ? uses : null,
            p_scope: mode === 'once' && room ? { room } : null, p_reason: reason || null,
          });
      if (r.ok) ok++;
      else out.push(`${p.display_name}: ${r.error}`);
    }
    setBusy(false);
    await a.reload();
    a.say(people.length > 1 ? `مُنحت لـ${ok} من ${people.length}.` : ok ? 'مُنحت الصلاحية، ووصله إشعار بها.' : '');
    if (out.length) setReport(out);
    else {
      onDone?.();
      onClose();
    }
  };

  return (
    <Modal title={requestId ? 'الموافقة على الطلب' : people.length > 1 ? `منح ${people.length} أشخاص` : `منح ${people[0]?.display_name ?? ''}`} onClose={onClose}>
      <div className="pm-dialog">
        {!initial && (
          <label className="pm-capsearch">
            الصلاحية
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث في الصلاحيات" />
          </label>
        )}
        <div className="pm-caplist" role="listbox" aria-label="الصلاحيات">
          {GROUPS.map((grp) => {
            const list = options.filter(({ x }) => x.grp === grp && (!initial || x.key === initial));
            if (!list.length) return null;
            return (
              <Fragment key={grp}>
                {!initial && (
                  <small className="pm-capgroup" role="presentation">
                    {GROUP_AR[grp]}
                  </small>
                )}
                {list.map(({ x, why }) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={cap === x.key}
                    key={x.key}
                    className={cap === x.key ? 'on' : ''}
                    disabled={!!why}
                    title={why}
                    onClick={() => setCap(x.key)}
                  >
                    <span>{x.label}</span>
                    {why && <small>{why}</small>}
                  </button>
                ))}
              </Fragment>
            );
          })}
        </div>
        <p className="muted">ما لا يُمنح أبداً (الاعتماد والنشر وما يشبههما) مقفل بقواعد المركز ولا يظهر هنا.</p>

        <div className="pm-modes" role="group" aria-label="النوع">
          {(['standing', 'timed', 'once'] as Mode[]).map((m) => (
            <button
              type="button"
              key={m}
              aria-pressed={mode === m}
              className={mode === m ? 'on' : ''}
              disabled={m === 'once' && !!c && notOnce(c)}
              title={m === 'once' && c && notOnce(c) ? 'الصفحة تُفتح دائماً أو مؤقتاً، لا مرة واحدة.' : ''}
              onClick={() => {
                setMode(m);
                if (m === 'once') setDur('none');
                else if (dur === 'none') setDur('day');
              }}
            >
              {MODE_AR[m]}
            </button>
          ))}
        </div>

        {mode !== 'standing' && (
          <div className="pm-durs" role="group" aria-label="المدة">
            {mode === 'once' && (
              <button type="button" aria-pressed={dur === 'none'} className={dur === 'none' ? 'on' : ''} onClick={() => setDur('none')}>
                بلا نهاية
              </button>
            )}
            {DURATIONS.map((d) => (
              <button type="button" key={d.id} aria-pressed={dur === d.id} className={dur === d.id ? 'on' : ''} onClick={() => setDur(d.id)}>
                {d.label}
              </button>
            ))}
          </div>
        )}
        {mode !== 'standing' && dur === 'date' && (
          <label>
            حتى
            <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        )}
        {mode === 'once' && (
          <label>
            عدد المرات
            <input type="number" min={1} max={20} value={uses} onChange={(e) => setUses(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} />
          </label>
        )}
        {mode === 'once' && c?.scope === 'room' && (
          <label>
            لمحادثة واحدة (اختياري)
            <select value={room} onChange={(e) => setRoom(e.target.value)}>
              <option value="">أي محادثة</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name ?? 'محادثة'}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          السبب (اختياري)
          <input maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: تغطية النشر أثناء الإجازة" />
        </label>
        <p className="pm-preview" aria-live="polite">
          {c ? grantPreview(names, c.key, mode, effUntil, uses, mode === 'once' && room ? roomName : null) : 'اختر صلاحية.'}
        </p>
        {report.length > 0 && (
          <div className="warning" role="alert">
            {report.map((x) => (
              <div key={x}>{x}</div>
            ))}
          </div>
        )}
        <div className="actions">
          <button type="button" className="primary" disabled={!ready || busy} onClick={() => void save()}>
            <KeyRound />
            {busy ? 'جارٍ المنح…' : requestId ? 'موافقة ومنح' : 'منح'}
          </button>
          <button type="button" className="secondary" onClick={onClose}>
            إلغاء
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Saving a preset from the grant choices: leaders keep bundles for the usual cases. */
export function PresetDialog({ onClose }: { onClose: () => void }) {
  const a = useAccounts();
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState<{ k: string; mode: Mode; hours: number; uses: number }[]>([{ k: '', mode: 'timed', hours: 168, uses: 1 }]);
  const options = CAPABILITIES.filter((x) => x.grantable && (a.can(x.key) || a.me.role === 'admin'));
  const save = async () => {
    const r = await a.call('preset_save', {
      p_id: null, p_name: name, p_note: note || null,
      p_items: items.filter((i) => i.k).map((i) => (i.mode === 'timed' ? { k: i.k, mode: i.mode, hours: i.hours } : i.mode === 'once' ? { k: i.k, mode: i.mode, uses: i.uses } : { k: i.k, mode: i.mode })),
    });
    if (!r.ok) return a.say(r.error);
    a.say('حُفظت الحزمة.');
    await a.reload();
    onClose();
  };
  return (
    <Modal title="حزمة جديدة" onClose={onClose}>
      <label>
        الاسم
        <input maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: تغطية مسؤول النشر أسبوعاً" />
      </label>
      {items.map((it, i) => (
        <div className="pm-item" key={i}>
          <select aria-label="الصلاحية" value={it.k} onChange={(e) => setItems((x) => x.map((y, j) => (j === i ? { ...y, k: e.target.value } : y)))}>
            <option value="">اختر صلاحية</option>
            {options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          <select aria-label="النوع" value={it.mode} onChange={(e) => setItems((x) => x.map((y, j) => (j === i ? { ...y, mode: e.target.value as Mode } : y)))}>
            {(['timed', 'once', 'standing'] as Mode[]).map((m) => (
              <option key={m} value={m}>
                {MODE_AR[m]}
              </option>
            ))}
          </select>
          {it.mode === 'timed' && (
            <select aria-label="المدة" value={it.hours} onChange={(e) => setItems((x) => x.map((y, j) => (j === i ? { ...y, hours: Number(e.target.value) } : y)))}>
              <option value={1}>ساعة</option>
              <option value={24}>يوم</option>
              <option value={168}>أسبوع</option>
              <option value={720}>شهر</option>
            </select>
          )}
          <button type="button" className="secondary sm" aria-label="حذف البند" onClick={() => setItems((x) => x.filter((_, j) => j !== i))}>
            <X />
          </button>
        </div>
      ))}
      <button type="button" className="secondary" disabled={items.length >= 12} onClick={() => setItems((x) => [...x, { k: '', mode: 'timed', hours: 168, uses: 1 }])}>
        بند آخر
      </button>
      <label>
        ملاحظة (اختياري)
        <input maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="actions">
        <button type="button" className="primary" disabled={!name.trim() || !items.some((i) => i.k)} onClick={() => void save()}>
          حفظ الحزمة
        </button>
        <button type="button" className="secondary" onClick={onClose}>
          إلغاء
        </button>
      </div>
    </Modal>
  );
}

export const memberLabel = (m: Member) => `${m.display_name} · ${roleAr(m.role)}`;

/** Linked or not for everyone; the number only when the reader is an administrator (D-12). */
function useWhatsAppOf(email: string) {
  const a = useAccounts();
  const [row, setRow] = useState<{ email: string; linked: boolean; phone: string | null } | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    void a.call<{ email: string; linked: boolean; phone: string | null }[]>('wa_people', {}).then((r) => {
      if (live && r.ok) setRow((r.data ?? []).find((x) => x.email === email) ?? null);
    });
    return () => {
      live = false;
    };
  }, [email, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return { row, reload: () => setTick((t) => t + 1) };
}

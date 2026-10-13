'use client';
// The person's card (Permissions_Plan.md 5.2): who they are, then one list of permissions,
// grouped, each labelled with where it comes from, with the one control that fits it. The
// grant dialog (5.2, «منح») gives a permission for good, for a time, or once, and says in
// words what the person will be able to do and until when before it is saved.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, KeyRound, Lock, Package, RotateCcw, Trash2, Undo2, X } from 'lucide-react';
import type { Role } from '@/lib/domain';
import {
  CAPABILITIES,
  DURATIONS,
  GROUP_AR,
  MODE_AR,
  capLabel,
  capability,
  grantPreview,
  howAr,
  rankOf,
  roleAr,
  sourceLine,
  stamp,
  type CapEval,
  type CapGroup,
  type Grant,
  type Mode,
} from '@/lib/permissions';
import { HOLD } from '@/lib/kit/hold-reasons';
import { Modal } from '../ui';
import { useAccounts, usePersonCard, useRooms, type Member, type PersonCardData } from './data';
import { MemberDialog, RemoveDialog, manageWhy, when } from './members';

type Card = PersonCardData;

const LEVEL_AR = ['لا وصول', 'عرض', 'تحرير', 'إنشاء', 'إدارة'];
const GROUPS: CapGroup[] = ['pages', 'messaging', 'accounts', 'fixed'];

export function PersonCard({ email, onClose, onGrant }: { email: string; onClose: () => void; onGrant: (emails: string[], cap?: string) => void }) {
  const a = useAccounts();
  const member = a.members.find((m) => m.email === email);
  const { card, error: refused } = usePersonCard(email);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [extend, setExtend] = useState<Grant | null>(null);
  const [preset, setPreset] = useState('');
  const why = member ? manageWhy(a.me, a.can, member) : null;

  if (!member) return null;
  const act = async (fn: string, args: Record<string, unknown>, ok: string) => {
    const r = await a.call(fn, args);
    if (!r.ok) return a.say(r.error);
    a.say(ok);
    await a.reload();
  };
  const canRemove = a.can('members.remove') && !member.protected && !manageWhy(a.me, a.can, member, 'members.remove');

  return (
    <aside className="pm-card" aria-label={`بطاقة ${member.display_name}`}>
      <header className="pm-head">
        <span className="face lg">{member.display_name.trim().charAt(0)}</span>
        <span className="work-name">
          <b>{member.display_name}</b>
          <small>
            <bdi dir="ltr">{member.email}</bdi>
          </small>
          <small>
            {roleAr(member.role)}
            {member.protected ? ' · مؤسس' : ''} · آخر دخول <bdi dir="ltr">{when(member.last_seen_at)}</bdi>
          </small>
        </span>
        <button type="button" className="pm-x" aria-label="إغلاق البطاقة" onClick={onClose}>
          <X />
        </button>
      </header>

      {why && (
        <p className="pm-why">
          <Lock /> {why}
        </p>
      )}

      {!why && (
        <div className="pm-actions">
          <button type="button" className="primary pm-grant" onClick={() => onGrant([email])}>
            <KeyRound />
            منح
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
          <button type="button" className="secondary" onClick={() => setEditing(true)}>
            الاسم والصفحات والدور
          </button>
          {card && card.grants.length > 0 && (
            <button
              type="button"
              className="secondary danger"
              data-hold={HOLD.endAllGrants}
              onClick={() => void act('revoke_all_capabilities', { p_email: email }, 'انتهت كل الصلاحيات المضافة لهذا الشخص.')}
            >
              <Undo2 />
              إنهاء كل الإضافات
            </button>
          )}
          {canRemove && (
            <button type="button" className="secondary danger" onClick={() => setRemoving(true)}>
              <Trash2 />
              إزالة العضو
            </button>
          )}
        </div>
      )}

      {!card && !refused && !why && <p className="muted">جارٍ تحميل الصلاحيات…</p>}
      {card && (
        <div className="pm-perms">
          {GROUPS.map((grp) => {
            const rows = card.caps.filter((c) => capability(c.k)?.grp === grp);
            if (!rows.length) return null;
            // What the person holds, or had removed, comes first; what they do not hold folds
            // away, so the card reads at a glance (Permissions_Plan.md 13, the readability risk).
            const main = rows.filter((e) => grp === 'fixed' || e.ok || e.src === 'removed');
            const rest = rows.filter((e) => !main.includes(e));
            return (
              <section key={grp} className="pm-group">
                <h3>{GROUP_AR[grp]}</h3>
                {main.map((e) => (
                  <PermRow key={e.k} e={e} card={card} onGrant={() => onGrant([email], e.k)} onExtend={setExtend} act={act} />
                ))}
                {!main.length && <p className="muted">لا شيء منها.</p>}
                {rest.length > 0 && (
                  <details className="pm-more">
                    <summary>لا يملكها ({rest.length})</summary>
                    {rest.map((e) => (
                      <PermRow key={e.k} e={e} card={card} onGrant={() => onGrant([email], e.k)} onExtend={setExtend} act={act} />
                    ))}
                  </details>
                )}
              </section>
            );
          })}
          {(card.requests ?? []).length > 0 && (
            <section className="pm-group pm-pending">
              <h3>طلبات ينتظر قرارها</h3>
              {card.requests!.map((q) => (
                <div className="pm-perm" key={q.id}>
                  <span>
                    {capLabel(q.k)}
                    {howAr(q.mode, q.hours, q.uses)}
                  </span>
                  <span className="pm-src once">«{q.reason}»</span>
                </div>
              ))}
              <small className="muted">تُقرّر من تبويب «الطلبات».</small>
            </section>
          )}
          <section className="pm-group pm-folders">
            <h3>مجلدات المكتبة</h3>
            {card.folders.length ? (
              card.folders.map((f) => (
                <div className="pm-perm" key={`${f.folder}`}>
                  <span>{f.name ?? 'أعلى المكتبة'}</span>
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
          </section>
        </div>
      )}

      {editing && <MemberDialog mode="edit" member={member} onClose={() => setEditing(false)} />}
      {removing && <RemoveDialog emails={[email]} onClose={() => setRemoving(false)} onDone={() => (setRemoving(false), onClose())} />}
      {extend && <ExtendDialog g={extend} name={member.display_name} onClose={() => setExtend(null)} />}
    </aside>
  );
}

function PermRow({
  e,
  card,
  onGrant,
  onExtend,
  act,
}: {
  e: CapEval;
  card: Card;
  onGrant: () => void;
  onExtend: (g: Grant) => void;
  act: (fn: string, args: Record<string, unknown>, ok: string) => Promise<void>;
}) {
  const a = useAccounts();
  const c = capability(e.k)!;
  const g = e.id ? card.grants.find((x) => x.id === e.id) : undefined;
  const who = { p_email: card.email, p_cap: e.k };
  const mineToGive = a.can(e.k) || a.me.role === 'admin';
  let control = null;
  if (!c.grantable)
    control = (
      <span className="pm-locked" title={c.why}>
        <Lock /> {c.why}
      </span>
    );
  else if (e.src === 'rank') control = <small className="muted">لا تناسب دور {roleAr(card.role)}</small>;
  else if (e.src === 'role')
    control = (
      <button type="button" className="secondary sm" onClick={() => void act('set_member_override', { ...who, p_effect: 'deny', p_reason: null }, 'سُحبت منه وحده.')}>
        إيقاف له
      </button>
    );
  else if (e.src === 'page')
    control = card.role === 'admin' ? null : (
      <button type="button" className="secondary sm" onClick={() => void act('set_member_override', { ...who, p_effect: 'deny', p_reason: null }, 'أُغلقت الصفحة له.')}>
        إغلاق الصفحة
      </button>
    );
  else if (e.src === 'added')
    control = (
      <button type="button" className="secondary sm" onClick={() => void act('set_member_override', { ...who, p_effect: null, p_reason: null }, 'سُحبت الإضافة؛ يعود إلى دوره.')}>
        سحب
      </button>
    );
  else if (e.src === 'removed')
    control = (
      <button type="button" className="secondary sm" onClick={() => void act('set_member_override', { ...who, p_effect: null, p_reason: null }, 'أُعيدت إلى ما يقرره دوره.')}>
        <RotateCcw />
        إعادة
      </button>
    );
  else if (e.src === 'timed' && g)
    control = (
      <span className="actions">
        <button type="button" className="secondary sm" onClick={() => onExtend(g)}>
          <CalendarClock />
          تمديد
        </button>
        <button type="button" className="secondary sm" onClick={() => void act('revoke_capability', { p_id: g.id }, 'انتهت الآن.')}>
          إنهاء الآن
        </button>
      </span>
    );
  else if (e.src === 'once' && g)
    control = (
      <button type="button" className="secondary sm" onClick={() => void act('revoke_capability', { p_id: g.id }, 'انتهت الآن.')}>
        إنهاء الآن
      </button>
    );
  else if (e.src === 'none' && rankOf(card.role) < c.minRank) control = <small className="muted">لا تناسب دور {roleAr(card.role)}</small>;
  else if (e.src === 'none')
    control = (
      <button type="button" className="secondary sm" disabled={!mineToGive} title={mineToGive ? '' : 'لا تمنح ما لا تملكه أنت.'} onClick={onGrant}>
        منح
      </button>
    );
  return (
    <div className={`pm-perm ${e.ok ? 'on' : 'off'}`}>
      <span>{c.label}</span>
      <span className={`pm-src ${e.src}`}>
        {c.grantable ? sourceLine(e) : e.ok ? 'يملكها بدوره' : 'مقفلة'}
        {g?.scope?.room ? ' · لمحادثة واحدة' : ''}
      </span>
      {control}
    </div>
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
      if (!a.can(x.key) && a.me.role !== 'admin') why = 'لا تملكها أنت';
      else if (minRank < x.minRank) why = 'لا تناسب دور من اخترت';
      else if (x.key === 'page.create' && people.some((p) => !['director', 'assistant', 'writer', 'designer', 'producer'].includes(p.role))) why = 'لمن يملك دوره الإنشاء';
      return { x, why };
    });
  }, [q, a, minRank, people]);

  const msFor = DURATIONS.find((d) => d.id === dur)?.ms ?? 864e5;
  const picked = dur === 'date' ? (date ? new Date(date).toISOString() : null) : new Date(Date.now() + msFor).toISOString();
  const effUntil = mode === 'standing' || (mode === 'once' && dur === 'none') ? null : picked;
  const roomName = rooms.find((r) => r.id === room)?.name ?? null;
  const names = people.map((p) => p.display_name).join(' و');
  const ready = !!c && (mode !== 'timed' || !!effUntil) && !(mode === 'once' && c.scope === 'page');

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
          {options
            .filter(({ x }) => !initial || x.key === initial)
            .map(({ x, why }) => (
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
        </div>
        <p className="muted">ما لا يُمنح أبداً (الاعتماد والنشر وما يشبههما) مقفل بقواعد المركز ولا يظهر هنا.</p>

        <div className="pm-modes" role="group" aria-label="النوع">
          {(['standing', 'timed', 'once'] as Mode[]).map((m) => (
            <button
              type="button"
              key={m}
              aria-pressed={mode === m}
              className={mode === m ? 'on' : ''}
              disabled={m === 'once' && c?.scope === 'page'}
              title={m === 'once' && c?.scope === 'page' ? 'الصفحة تُفتح دائماً أو مؤقتاً، لا مرة واحدة.' : ''}
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

'use client';
// الحسابات: who may sign in, with which role, and which pages. Administrators only.
// Reads and writes go straight to Supabase as the signed-in administrator; row level
// security and the database functions (supabase/migrations) are what enforce it.
import { useCallback, useEffect, useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { roles, type Role } from '@/lib/domain';
import { assignableRoles, defaultPages, grantablePages, sanitizePages, isAdmin } from '@/lib/access';
import { useAccount } from '@/lib/account-context';
import { useHub } from '@/lib/store';
import { supabase } from '@/lib/supabase/client';
import { Empty, Modal, Panel, Title } from './ui';

type Row = {
  email: string;
  display_name: string;
  role: Role;
  pages: string[];
  protected: boolean;
  added_by: string | null;
  created_at: string;
  last_seen_at: string | null;
};

type Request = {
  id: string;
  email: string;
  full_name: string;
  note: string | null;
  created_at: string;
};

/** Add or edit one account; also used to approve a request (email and name come from it). */
type Draft = {
  mode: 'add' | 'edit' | 'approve';
  email: string;
  name: string;
  role: Role;
  pages: string[];
  requestId?: string;
  protectedAccount?: boolean;
};

const roleName = (r: Role) => roles[r].name;

function abilities(role: Role) {
  const r = roles[role];
  if (r.admin) return ['سلطة النظام وتبديل الدور'];
  return [r.create && 'ينشئ المحتوى', r.review && 'يراجع ويعتمد', r.publish && 'يجدول وينشر'].filter(
    Boolean,
  ) as string[];
}

function when(iso: string | null) {
  if (!iso) return 'لم يسجل الدخول بعد';
  return new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Riyadh' }).slice(0, 16);
}

function problem(error: { message: string; code?: string }) {
  const m = error.message;
  if (m.includes('PROTECTED_ACCOUNT')) return 'حساب مؤسس: لا يُحذف ولا يتغير دوره من التطبيق.';
  if (m.includes('ADMIN_NOT_ASSIGNABLE')) return 'دور Admin لا يُمنح من التطبيق.';
  if (m.includes('FORBIDDEN')) return 'هذا الإجراء لمسؤول النظام فقط.';
  if (m.includes('REQUEST_NOT_PENDING')) return 'سبق البتّ في هذا الطلب.';
  if (error.code === '23505' || m.includes('duplicate key')) return 'هذا البريد مُضاف بالفعل.';
  if (m.includes('violates check constraint')) return 'تحقق من البريد والاسم، ثم أعد المحاولة.';
  return 'تعذّر تنفيذ الإجراء. حاول مجدداً.';
}

export function AccountsPage() {
  const me = useAccount();
  const { dispatch } = useHub();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  const say = (text: string) => dispatch({ type: 'notify', text });

  const load = useCallback(async () => {
    const [a, r] = await Promise.all([
      supabase().from('accounts').select('*').order('created_at', { ascending: true }),
      supabase()
        .from('access_requests')
        .select('id, email, full_name, note, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),
    ]);
    if (a.error || r.error) return setLoadError(true);
    setLoadError(false);
    setRows(a.data as Row[]);
    setRequests(r.data as Request[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isAdmin(me))
    return (
      <Panel>
        <Empty>هذه الصفحة متاحة لمسؤول النظام فقط.</Empty>
      </Panel>
    );

  const openAdd = () =>
    setDraft({ mode: 'add', email: '', name: '', role: 'member', pages: defaultPages('member') });
  const openEdit = (row: Row) =>
    setDraft({
      mode: 'edit',
      email: row.email,
      name: row.display_name,
      role: row.role,
      pages: sanitizePages(row.pages),
      protectedAccount: row.protected,
    });
  const openApprove = (req: Request) =>
    setDraft({
      mode: 'approve',
      email: req.email,
      name: req.full_name,
      role: 'member',
      pages: defaultPages('member'),
      requestId: req.id,
    });

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    const pages = sanitizePages(draft.pages);
    let error: { message: string; code?: string } | null = null;
    if (draft.mode === 'add') {
      ({ error } = await supabase().rpc('add_account', {
        p_email: draft.email,
        p_name: draft.name,
        p_role: draft.role,
        p_pages: pages,
      }));
    } else if (draft.mode === 'approve') {
      ({ error } = await supabase().rpc('approve_request', {
        p_id: draft.requestId,
        p_role: draft.role,
        p_pages: pages,
      }));
    } else {
      ({ error } = await supabase()
        .from('accounts')
        .update(
          draft.protectedAccount
            ? { display_name: draft.name.trim() }
            : { display_name: draft.name.trim(), role: draft.role, pages },
        )
        .eq('email', draft.email));
    }
    setBusy(false);
    if (error) return say(problem(error));
    say(
      draft.mode === 'edit'
        ? 'حُفظت صلاحيات الحساب. تسري عند أول تحميل جديد لصفحته.'
        : 'أُضيف الحساب. يعيّن صاحبه كلمة مروره من تبويب «أول دخول».',
    );
    setDraft(null);
    await load();
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    const { error } = await supabase().from('accounts').delete().eq('email', removing.email);
    setBusy(false);
    if (error) return say(problem(error));
    say('أُزيل الحساب وأُلغيت جلساته.');
    setRemoving(null);
    await load();
  };

  const reject = async (req: Request) => {
    const { error } = await supabase().rpc('reject_request', { p_id: req.id });
    if (error) return say(problem(error));
    say('رُفض الطلب.');
    await load();
  };

  const togglePage = (id: string) =>
    setDraft((d) =>
      d && { ...d, pages: d.pages.includes(id) ? d.pages.filter((p) => p !== id) : [...d.pages, id] },
    );

  return (
    <div dir="rtl">
      <Title title="الحسابات" sub="من يدخل النظام، بأي دور، وأي صفحات يفتح">
        <button className="primary" onClick={openAdd}>
          <Plus />
          إضافة حساب
        </button>
      </Title>

      {loadError && (
        <p className="warning" role="alert">
          تعذّر تحميل الحسابات. أعد تحميل الصفحة.
        </p>
      )}

      <Panel title={`طلبات الوصول${requests.length ? ` (${requests.length})` : ''}`}>
        {requests.length === 0 ? (
          <Empty>لا توجد طلبات معلقة.</Empty>
        ) : (
          <div className="stack">
            {requests.map((req) => (
              <div className="acct-request" key={req.id}>
                <span className="work-name">
                  <b>{req.full_name}</b>
                  <small>
                    <bdi dir="ltr">{req.email}</bdi> · <bdi dir="ltr">{when(req.created_at)}</bdi>
                  </small>
                  {req.note && <p>{req.note}</p>}
                </span>
                <span className="actions">
                  <button className="primary" onClick={() => openApprove(req)}>
                    <Check />
                    قبول
                  </button>
                  <button className="secondary" onClick={() => void reject(req)}>
                    <X />
                    رفض
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title={`الحسابات المعتمدة${rows ? ` (${rows.length})` : ''}`}>
        {!rows ? (
          <p className="muted">جارٍ التحميل…</p>
        ) : (
          rows.map((row) => (
            <div className="acct-row" key={row.email}>
              <span className="work-name">
                <b>{row.display_name}</b>
                <small>
                  <bdi dir="ltr">{row.email}</bdi>
                </small>
              </span>
              <span>
                <span className="chip">{roleName(row.role)}</span>
                {row.protected && <small className="acct-founder"> مؤسس</small>}
              </span>
              <span className="muted">
                {row.role === 'admin'
                  ? 'جميع الصفحات'
                  : `${sanitizePages(row.pages).length} من ${grantablePages.length} صفحة`}
              </span>
              <small className="muted">
                <bdi dir="ltr">{when(row.last_seen_at)}</bdi>
              </small>
              <span className="actions">
                <button className="secondary" onClick={() => openEdit(row)} aria-label={`تعديل ${row.display_name}`}>
                  <Pencil />
                  تعديل
                </button>
                <button
                  className="secondary danger"
                  onClick={() => setRemoving(row)}
                  disabled={row.protected}
                  title={row.protected ? 'حساب مؤسس لا يُحذف' : ''}
                  aria-label={`حذف ${row.display_name}`}
                >
                  <Trash2 />
                  حذف
                </button>
              </span>
            </div>
          ))
        )}
        <p className="muted">
          الإضافة أو القبول يسمح للبريد بتعيين كلمة مرور. الحذف يلغي الدخول والجلسات فوراً. دور الأعضاء من
          يملك الإنشاء والمراجعة والنشر، والصفحات تحدد ما يفتحه الحساب.
        </p>
      </Panel>

      {draft && (
        <Modal
          title={draft.mode === 'add' ? 'إضافة حساب' : draft.mode === 'approve' ? 'قبول طلب وصول' : 'تعديل الحساب'}
          onClose={() => setDraft(null)}
        >
          <form
            className="acct-form"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label>
              الاسم
              <input
                required
                maxLength={80}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label>
              البريد الإلكتروني
              <input
                type="email"
                required
                dir="ltr"
                value={draft.email}
                readOnly={draft.mode !== 'add'}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </label>

            {draft.protectedAccount ? (
              <p className="muted">
                حساب مؤسس بدور Admin: يفتح كل الصفحات ويبدّل الدور، ولا يتغير دوره ولا يُحذف من التطبيق.
              </p>
            ) : (
              <>
                <label>
                  الدور
                  <select
                    value={draft.role}
                    onChange={(e) => {
                      const role = e.target.value as Role;
                      // A new role brings the pages that role can use; adjust them after.
                      setDraft({ ...draft, role, pages: defaultPages(role) });
                    }}
                  >
                    {assignableRoles.map((r) => (
                      <option key={r} value={r}>
                        {roleName(r)}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="muted">الدور يمنح: {abilities(draft.role).join('، ') || 'عرض وتعليق فقط'}.</p>

                <fieldset>
                  <legend>الصفحات المفتوحة</legend>
                  <div className="page-grid">
                    {grantablePages.map((p) => {
                      const blocked = p.id === 'create' && !roles[draft.role].create;
                      return (
                        <label className="check-row" key={p.id} title={blocked ? 'هذا الدور لا ينشئ المحتوى' : ''}>
                          <input
                            type="checkbox"
                            disabled={blocked}
                            checked={!blocked && draft.pages.includes(p.id)}
                            onChange={() => togglePage(p.id)}
                          />
                          {p.label}
                        </label>
                      );
                    })}
                  </div>
                  <p className="muted">الرئيسية والحساب مفتوحتان دائماً.</p>
                </fieldset>
              </>
            )}

            <div className="actions">
              <button className="primary" disabled={busy}>
                {busy ? 'جارٍ الحفظ…' : 'حفظ'}
              </button>
              <button type="button" className="secondary" onClick={() => setDraft(null)}>
                إلغاء
              </button>
            </div>
          </form>
        </Modal>
      )}

      {removing && (
        <Modal title="حذف حساب" onClose={() => setRemoving(null)}>
          <p>
            سيُحذف حساب <b>{removing.display_name}</b> (<bdi dir="ltr">{removing.email}</bdi>) وتُلغى كلمة مروره
            وجلساته. إن أراد العودة فعليه أن يُضاف من جديد.
          </p>
          <div className="actions">
            <button className="primary danger" onClick={() => void remove()} disabled={busy}>
              تأكيد الحذف
            </button>
            <button className="secondary" onClick={() => setRemoving(null)}>
              إلغاء
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

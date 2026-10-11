'use client';
// The only thing an unsigned visitor is shown. Rendered by the root layout in place
// of the whole product, so no page content is sent to someone who is not signed in.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn, KeyRound, UserPlus, LogOut, MailCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { LogoLoader } from './ui';

type View = 'signin' | 'first' | 'request' | 'forgot' | 'recovery';
type Note = { kind: 'error' | 'ok'; text: string } | null;

const MIN_PASSWORD = 10;

/** Supabase error text to Arabic. Unknown messages are shown generically, never raw. */
function arabicError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'البريد أو كلمة المرور غير صحيحة.';
  if (m.includes('email not confirmed')) return 'لم يُؤكَّد البريد بعد. افتح رابط التأكيد المرسل إلى بريدك.';
  if (m.includes('already registered') || m.includes('already been registered'))
    return 'لهذا البريد كلمة مرور بالفعل. سجّل الدخول، أو استخدم «نسيت كلمة المرور».';
  if (m.includes('rate limit') || m.includes('too many') || m.includes('seconds'))
    return 'تجاوزت الحد المسموح للمحاولات أو الرسائل. انتظر قليلاً ثم حاول مجدداً.';
  if (m.includes('weak') || m.includes('password should'))
    return `كلمة المرور ضعيفة. استخدم ${MIN_PASSWORD} أحرف على الأقل.`;
  if (m.includes('same password')) return 'اختر كلمة مرور مختلفة عن الحالية.';
  if (m.includes('network') || m.includes('fetch')) return 'تعذّر الاتصال بالخادم. تحقق من الشبكة وحاول مجدداً.';
  return 'تعذّر إتمام الطلب. حاول مجدداً بعد قليل.';
}

export function AuthGate({
  mode,
  email: knownEmail = '',
}: {
  mode: 'anonymous' | 'no-account' | 'unconfigured';
  email?: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>(mode === 'no-account' ? 'request' : 'signin');
  const [email, setEmail] = useState(knownEmail);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  // The password-reset link signs the person in for a moment with a recovery
  // session; this is the screen that lets them choose the new password.
  useEffect(() => {
    if (mode === 'unconfigured') return;
    const { data } = supabase().auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setView('recovery');
        setNote(null);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [mode]);

  if (mode === 'unconfigured')
    return (
      <Screen>
        <div className="auth-card">
          <h1>الاتصال بالحسابات غير مضبوط</h1>
          <p className="muted">
            لم تُضبط متغيرات Supabase لهذا التشغيل، ولذلك لا يُعرض شيء من النظام. انسخ <code>.env.example</code> إلى{' '}
            <code>.env.local</code> وأكمل القيمتين، ثم أعد التشغيل.
          </p>
        </div>
      </Screen>
    );

  const go = (next: View) => {
    setView(next);
    setNote(null);
    setNeedsConfirm(false);
    setPassword('');
    setConfirm('');
  };

  const fail = (text: string) => setNote({ kind: 'error', text });
  const ok = (text: string) => setNote({ kind: 'ok', text });

  const run = async (job: () => Promise<void>) => {
    setBusy(true);
    setNote(null);
    try {
      await job();
    } catch (e) {
      fail(arabicError(e instanceof Error ? e.message : ''));
    } finally {
      setBusy(false);
    }
  };

  const signIn = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { error } = await supabase().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) {
        setNeedsConfirm(error.message.toLowerCase().includes('not confirmed'));
        return fail(arabicError(error.message));
      }
      await supabase().rpc('touch_account');
      router.refresh();
    });
  };

  const firstTime = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const address = email.trim().toLowerCase();
      if (password.length < MIN_PASSWORD) return fail(`كلمة المرور ${MIN_PASSWORD} أحرف على الأقل.`);
      if (password !== confirm) return fail('كلمتا المرور غير متطابقتين.');
      const status = await supabase().rpc('email_status', { p_email: address });
      if (status.error) throw status.error;
      if (status.data !== 'approved') {
        setView('request');
        return fail('هذا البريد غير مُدرج ضمن الحسابات المعتمدة. يمكنك طلب الوصول من هنا.');
      }
      const { data, error } = await supabase().auth.signUp({
        email: address,
        password,
        options: { emailRedirectTo: `${window.location.origin}/` },
      });
      if (error) return fail(arabicError(error.message));
      // The address already has a sign-in: Supabase answers with an empty identity list.
      if (data.user && data.user.identities?.length === 0)
        return fail('لهذا البريد كلمة مرور بالفعل. سجّل الدخول، أو استخدم «نسيت كلمة المرور».');
      if (data.session) {
        // Email confirmation is switched off on the project: signed in at once.
        await supabase().rpc('touch_account');
        return router.refresh();
      }
      setNeedsConfirm(true);
      ok('أُرسل رابط التأكيد إلى بريدك. افتح أحدث رسالة فقط، فكل رسالة جديدة تُبطل التي قبلها. ثم عد إلى هذه الصفحة وسجّل الدخول بكلمة المرور التي اخترتها.');
    });
  };

  const resend = () =>
    void run(async () => {
      const { error } = await supabase().auth.resend({
        type: 'signup',
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: `${window.location.origin}/` },
      });
      if (error) return fail(arabicError(error.message));
      ok('أُعيد إرسال رابط التأكيد. افتح هذه الرسالة الأحدث فقط، فالرابط في الرسائل السابقة لم يعد يعمل.');
    });

  const requestAccess = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { data, error } = await supabase().rpc('request_access', {
        p_email: email.trim().toLowerCase(),
        p_name: name,
        p_note: reason,
      });
      if (error) {
        if (error.message.includes('INVALID_EMAIL')) return fail('اكتب بريداً إلكترونياً صحيحاً.');
        if (error.message.includes('INVALID_NAME')) return fail('اكتب اسمك.');
        throw error;
      }
      if (data === 'has_account') {
        setView('first');
        return ok('هذا البريد معتمد بالفعل. عيّن كلمة مرورك من هنا، أو سجّل الدخول إن سبق أن عيّنتها.');
      }
      if (data === 'already_pending') return ok('طلبك قيد المراجعة بالفعل. سيراه مسؤول النظام في صفحة الحسابات.');
      ok('وصل طلبك إلى مسؤولي النظام. عند الموافقة عيّن كلمة مرورك من تبويب «أول دخول».');
      setName('');
      setReason('');
    });
  };

  const forgot = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { error } = await supabase().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/`,
      });
      if (error) return fail(arabicError(error.message));
      // Same answer whether or not the address has an account.
      ok('إن كان لهذا البريد حساب فسيصله رابط لتعيين كلمة مرور جديدة.');
    });
  };

  const recover = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (password.length < MIN_PASSWORD) return fail(`كلمة المرور ${MIN_PASSWORD} أحرف على الأقل.`);
      if (password !== confirm) return fail('كلمتا المرور غير متطابقتين.');
      const { error } = await supabase().auth.updateUser({ password });
      if (error) return fail(arabicError(error.message));
      await supabase().rpc('touch_account');
      router.refresh();
    });
  };

  const signOut = () =>
    void run(async () => {
      await supabase().auth.signOut();
      router.refresh();
    });

  const tabs: [View, string, ReactNode][] = [
    ['signin', 'تسجيل الدخول', <LogIn key="i" />],
    ['first', 'أول دخول', <KeyRound key="k" />],
    ['request', 'طلب وصول', <UserPlus key="u" />],
  ];

  return (
    <Screen>
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-mark">
            <LogoLoader size={28} mode="static" color="currentColor" ariaLabel="شعار مركز الاتصال" />
          </span>
          <span>
            <b>مركز الاتصال</b>
            <small>COMMUNICATION HUB</small>
          </span>
        </div>

        {mode === 'no-account' && view !== 'recovery' && (
          <div className="auth-note error" role="alert">
            <span>
              البريد <bdi dir="ltr">{knownEmail}</bdi> مسجّل الدخول لكنه غير مُدرج ضمن الحسابات المعتمدة. قد يكون
              الحساب أُزيل. اطلب الوصول من مسؤول النظام أو سجّل الخروج.
            </span>
          </div>
        )}

        {view !== 'recovery' && view !== 'forgot' && (
          <div className="seg auth-tabs" role="group" aria-label="نوع الدخول">
            {tabs.map(([id, label, icon]) => (
              <button type="button" key={id} aria-pressed={view === id} onClick={() => go(id)}>
                {icon}
                {label}
              </button>
            ))}
          </div>
        )}

        {note && (
          <div className={`auth-note ${note.kind}`} role={note.kind === 'error' ? 'alert' : 'status'}>
            {note.kind === 'ok' && <MailCheck />}
            <span>{note.text}</span>
          </div>
        )}

        {view === 'signin' && (
          <form onSubmit={signIn} className="auth-form">
            <h1>تسجيل الدخول</h1>
            <label>
              البريد الإلكتروني
              <input type="email" required autoComplete="username" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>
              كلمة المرور
              <input type="password" required autoComplete="current-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? 'جارٍ الدخول…' : 'دخول'}
            </button>
            {needsConfirm && (
              <button type="button" className="secondary" onClick={resend} disabled={busy || !email}>
                إعادة إرسال رابط التأكيد
              </button>
            )}
            <button type="button" className="auth-link" onClick={() => go('forgot')}>
              نسيت كلمة المرور
            </button>
          </form>
        )}

        {view === 'first' && (
          <form onSubmit={firstTime} className="auth-form">
            <h1>أول دخول</h1>
            <p className="muted">
              إن أضافك مسؤول النظام، اكتب بريدك المعتمد واختر كلمة مرورك. سيصلك رابط تأكيد على البريد، ولا يُفتح
              الحساب قبل فتحه.
            </p>
            <label>
              البريد الإلكتروني
              <input type="email" required autoComplete="username" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>
              كلمة المرور الجديدة
              <input type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} />
              <small>{MIN_PASSWORD} أحرف على الأقل</small>
            </label>
            <label>
              تأكيد كلمة المرور
              <input type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" dir="ltr" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? 'جارٍ الإرسال…' : 'تعيين كلمة المرور وإرسال رابط التأكيد'}
            </button>
            {needsConfirm && (
              <button type="button" className="secondary" onClick={resend} disabled={busy}>
                إعادة إرسال رابط التأكيد
              </button>
            )}
          </form>
        )}

        {view === 'request' && (
          <form onSubmit={requestAccess} className="auth-form">
            <h1>طلب وصول</h1>
            <p className="muted">
              إن لم يضفك مسؤول النظام بعد، أرسل طلباً. يظهر الطلب في صفحة الحسابات لدى المسؤولين، ويحدد المسؤول
              دورك وما تفتحه من صفحات.
            </p>
            <label>
              الاسم
              <input required maxLength={80} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              البريد الإلكتروني
              <input type="email" required autoComplete="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>
              سبب الطلب <small>اختياري</small>
              <textarea rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? 'جارٍ الإرسال…' : 'إرسال الطلب'}
            </button>
          </form>
        )}

        {view === 'forgot' && (
          <form onSubmit={forgot} className="auth-form">
            <h1>نسيت كلمة المرور</h1>
            <p className="muted">اكتب بريدك المعتمد ليصلك رابط لتعيين كلمة مرور جديدة.</p>
            <label>
              البريد الإلكتروني
              <input type="email" required autoComplete="username" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? 'جارٍ الإرسال…' : 'إرسال الرابط'}
            </button>
            <button type="button" className="auth-link" onClick={() => go('signin')}>
              العودة إلى تسجيل الدخول
            </button>
          </form>
        )}

        {view === 'recovery' && (
          <form onSubmit={recover} className="auth-form">
            <h1>كلمة مرور جديدة</h1>
            <label>
              كلمة المرور الجديدة
              <input type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} />
              <small>{MIN_PASSWORD} أحرف على الأقل</small>
            </label>
            <label>
              تأكيد كلمة المرور
              <input type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" dir="ltr" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? 'جارٍ الحفظ…' : 'حفظ كلمة المرور'}
            </button>
          </form>
        )}

        {mode === 'no-account' && (
          <button type="button" className="secondary auth-out" onClick={signOut} disabled={busy}>
            <LogOut />
            تسجيل الخروج
          </button>
        )}

        <p className="auth-foot">
          الحسابات والصلاحيات حقيقية. بيانات العمل نفسها ما تزال نموذجاً محلياً بلا نشر فعلي.
        </p>
      </div>
    </Screen>
  );
}

function Screen({ children }: { children: ReactNode }) {
  return <main className="auth-screen">{children}</main>;
}

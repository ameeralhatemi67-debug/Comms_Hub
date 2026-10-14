'use client';
// What an administrator or director can do for a person who has not got in: send the
// invitation (or send it again), send a link to choose a password, or send the
// confirmation link again. The invitation goes out from the site's own mailbox; the reset
// and confirmation links come from the sign-in service. Each action is logged by the
// database (invite_mark, entry_help_log) and the log line shows in «السجل».
import { useState } from 'react';
import { Mail, MailCheck, RotateCw } from 'lucide-react';
import { ENTRY_NEXT_AR, ENTRY_STATE_AR, sendInvite } from '@/lib/entry';
import { supabase } from '@/lib/supabase/client';
import { useAccounts, type Member } from './data';
import { when } from './members';

export function EntryHelp({ member }: { member: Member }) {
  const a = useAccounts();
  const [busy, setBusy] = useState('');
  const state = a.entry[member.email];
  // Not read (the list is empty for people the viewer may not see) or already in: nothing to help with.
  if (!state) return null;

  const run = async (what: string, job: () => Promise<string | null>, done: string) => {
    setBusy(what);
    const err = await job();
    setBusy('');
    a.say(err ?? done);
    if (!err) await a.reload();
  };

  const logged = async (what: 'reset' | 'confirmation') => {
    const r = await a.call('entry_help_log', { p_email: member.email, p_what: what });
    return r.ok ? null : r.error;
  };

  const reset = () =>
    run(
      'reset',
      async () => {
        const { error } = await supabase().auth.resetPasswordForEmail(member.email, { redirectTo: `${window.location.origin}/` });
        if (error) return 'تعذّر إرسال الرابط. إن تكرر ذلك فقد بلغت الرسائل حدّها في الساعة.';
        return logged('reset');
      },
      'أُرسل إلى صاحب الحساب رابط لتعيين كلمة مرور جديدة.',
    );

  const confirm = () =>
    run(
      'confirm',
      async () => {
        const { error } = await supabase().auth.resend({ type: 'signup', email: member.email, options: { emailRedirectTo: `${window.location.origin}/` } });
        if (error) return 'تعذّر إعادة الإرسال. إن تكرر ذلك فقد بلغت الرسائل حدّها في الساعة.';
        return logged('confirmation');
      },
      'أُعيد إرسال رابط التأكيد. الرابط في الرسائل السابقة لم يعد يعمل.',
    );

  const invited = member.invited_at;
  return (
    <section className="pm-entry" aria-label="دخول هذا الشخص">
      <p>
        <b>{ENTRY_STATE_AR[state]}</b>
        {invited && (
          <small className="muted">
            {' · '}الدعوة أُرسلت <bdi dir="ltr">{when(invited)}</bdi>
            {member.invite_count > 1 ? ` (${member.invite_count} مرات)` : ''}
          </small>
        )}
      </p>
      {ENTRY_NEXT_AR[state] && <p className="muted">{ENTRY_NEXT_AR[state]}</p>}
      <div className="actions">
        {state !== 'active' && (
          <button type="button" className="primary" disabled={!!busy} onClick={() => void run('invite', () => sendInvite(member.email), 'أُرسلت الدعوة إلى بريده.')}>
            <Mail />
            {invited ? 'إعادة إرسال الدعوة' : 'إرسال دعوة'}
          </button>
        )}
        {state === 'unconfirmed' && (
          <button type="button" className="secondary" disabled={!!busy} onClick={() => void confirm()}>
            <MailCheck />
            إعادة إرسال رابط التأكيد
          </button>
        )}
        {state !== 'not_started' && (
          <button type="button" className="secondary" disabled={!!busy} onClick={() => void reset()}>
            <RotateCw />
            إرسال رابط كلمة مرور جديدة
          </button>
        )}
      </div>
    </section>
  );
}

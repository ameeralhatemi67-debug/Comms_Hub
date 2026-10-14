'use client';
// WhatsApp in messaging (Permissions_Plan.md 8.4, 8.6): «إرسال إلى واتساب» on a message the
// person sent, to one member of that conversation, and the delivery line under that message.
// The browser names only a recipient account; the database checks the room, the link, the
// mute, the cap and the permission (wa_push), and routes urgent messages itself (wa_route).
// Nothing here shows or knows a number.
import { useState } from 'react';
import { needProps } from '@/lib/kit/need';
import { supabase } from '@/lib/supabase/client';
import { deliverySummary, pushBlock, waError, STATE_AR, KIND_AR } from '@/lib/whatsapp/rules';
import type { ChatMessage, RoomRow } from '@/lib/chat/rules';
import { useCaps } from '../caps';
import { usePeople } from '../people';
import { useChat } from './provider';

/** Holds the push now: for good, for a time, or once, possibly bound to this conversation. */
export function usePushCap(room: string): boolean {
  const caps = useCaps();
  if (caps.has('whatsapp.push')) return true;
  const now = Date.now();
  return caps.grants.some(
    (g) =>
      g.k === 'whatsapp.push' && g.effect === 'allow' && g.mode === 'once' && (g.uses ?? 0) > 0 &&
      (!g.until || Date.parse(g.until) > now) && (!g.scope || !g.scope.room || g.scope.room === room),
  );
}

export function WaPushList({ room, msg, onDone }: { room: RoomRow; msg: ChatMessage; onDone: () => void }) {
  const c = useChat();
  const people = usePeople();
  const hasCap = usePushCap(room.id);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const sent = c.waOf(msg.id);
  const others = c.membersOf(room.id).filter((m) => m.email !== c.me);
  const push = async (email: string) => {
    setBusy(email);
    setError('');
    // Called directly so the refusal keeps its code, which waError words.
    const { error: e } = await supabase().rpc('wa_push', { p_msg: msg.id, p_recipient: email });
    setBusy('');
    if (e) return setError(waError(e.message));
    await c.reload();
    c.say(`وُضعت في الطابور إلى ${people.nameOf(email)}. تصل حين يسأل جسر واتساب.`);
    onDone();
  };
  const noCap = pushBlock({ hasCap, systemOn: c.waOn, author: msg.author === c.me, target: { push: true } });
  return (
    <div className="cx-wapush">
      <p className="ml-mtext">
        تصل الرسالة كاملة إلى واتساب الزميل، مع رابط يفتح هذه المحادثة. لا تُقرأ الردود هناك. لا يظهر رقم أحد هنا.
      </p>
      {noCap && (
        <p className="ml-mtext cx-wapush-why">
          {noCap}{' '}
          {msg.author === c.me && c.waOn && !hasCap && (
            <button type="button" className="ml-btn sm quiet" {...needProps('whatsapp.push', 'الإرسال إلى واتساب زميل مقفل حتى يمنحه من يدير رتبتك، دائماً أو لمدة أو لمرة واحدة.')}>
              اطلب هذه الصلاحية
            </button>
          )}
        </p>
      )}
      <ul className="cx-wapush-list">
        {others.map((m) => {
          const t = c.waPeople.find((p) => p.email === m.email);
          const already = sent.find((r) => r.recipient === m.email && r.kind === 'push');
          const why = already ? `${STATE_AR[already.state]} من قبل.` : pushBlock({ hasCap, systemOn: c.waOn, author: msg.author === c.me, target: t });
          return (
            <li key={m.email} className="between">
              <span>
                {people.nameOf(m.email)}
                <small>{t?.linked ? 'واتساب مرتبط' : 'واتساب غير مرتبط'}</small>
              </span>
              {why ? (
                <small className="muted">{why}</small>
              ) : (
                <button type="button" className="ml-btn sm primary" disabled={!!busy} onClick={() => void push(m.email)}>
                  إرسال
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="ml-err">{error}</p>}
    </div>
  );
}

/** Under a message its author sent: how its WhatsApp copies went, and a retry for what failed. */
export function WaDelivery({ m }: { m: ChatMessage }) {
  const c = useChat();
  const people = usePeople();
  const rows = c.waOf(m.id);
  if (!rows.length || m.author !== c.me) return null;
  const s = deliverySummary(rows);
  const failed = rows.filter((r) => r.state === 'failed');
  const detail = rows.map((r) => `${people.nameOf(r.recipient)}: ${STATE_AR[r.state]} (${KIND_AR[r.kind]})${r.error ? ` ${r.error}` : ''}`).join('\n');
  return (
    <div className="cx-wa" title={detail}>
      <span>{s.text}</span>
      {s.waiting > 0 && !c.waOn && <small> · واتساب النظام متوقف، وتصل حين يعود</small>}
      {failed.length > 0 && (
        <button
          type="button"
          className="ml-btn sm quiet"
          onClick={async () => {
            for (const r of failed) {
              const { error: e } = await supabase().rpc('wa_retry', { p_id: r.id });
              if (e) return c.say(waError(e.message));
            }
            await c.reload();
            c.say('أُعيدت إلى الطابور.');
          }}
        >
          إعادة المحاولة
        </button>
      )}
    </div>
  );
}

'use client';
// The window's frame: the header (size buttons at the top right, the mail and messaging toggle,
// the experiment's mark), the body for the current size, and the edge that resizes it.
import { useState } from 'react';
import { Columns2, ExternalLink, FlaskConical, Maximize2, Minus, PanelLeft } from 'lucide-react';
import { unreadCount } from '@/lib/chat/rules';
import { inFolder, isUnread } from '@/lib/mail/rules';
import { ADDS_AR, SIZE_AR, buttonWidth, keyWidth, sizeButtons, snapWidth, type SizeButton } from '@/lib/chat-window/rules';
import { useChat } from '../chat/provider';
import { useMail } from '../mail/provider';
import { useWin } from './state';
import { ChatPane } from './chat-pane';
import { MailPane } from './mail-pane';

const BUTTON: Record<SizeButton, { label: string; Icon: typeof PanelLeft }> = {
  side: { label: 'نافذة جانبية', Icon: PanelLeft },
  middle: { label: 'نافذة وسطى', Icon: Columns2 },
  full: { label: 'نافذة كاملة', Icon: Maximize2 },
};

export function Frame() {
  const w = useWin();
  const c = useChat();
  const m = useMail();
  const [drag, setDrag] = useState(false);
  const [peek, setPeek] = useState(false);
  const chatUnread = c.rooms.filter((r) => unreadCount(c.messagesOf(r.id), c.myMember(r.id), c.me) > 0).length;
  const ctx = { me: m.me, role: m.role, now: m.now };
  const mailUnread = m.views.filter((v) => inFolder(v, 'inbox', ctx) && isUnread(v, m.me, m.now)).length;
  const phone = w.geo.phone;

  const style = phone
    ? { top: 0, bottom: w.geo.bottom, width: '100%' }
    : { top: w.geo.top, width: w.width };

  return (
    <section
      className={`cw-win ${drag ? 'drag' : ''} ${phone ? 'phone' : ''}`}
      style={style}
      aria-label="نافذة البريد والمراسلة"
      data-size={w.size}
      data-tier={w.tier}
    >
      <header className="cw-head">
        <div className="cw-ctl">
          <button type="button" className="cw-ib" aria-label="تصغير إلى الزر" title="تصغير إلى الزر (Esc)" onClick={w.minimize}>
            <Minus aria-hidden />
          </button>
          {!phone &&
            sizeButtons(w.size, w.max).map((b) => {
              const { label, Icon } = BUTTON[b];
              return (
                <button key={b} type="button" className="cw-ib" aria-label={label} title={label} onClick={() => w.setSize(buttonWidth(b, w.max))}>
                  <Icon aria-hidden />
                </button>
              );
            })}
          <button type="button" className="cw-ib" aria-label="فتح صفحة البريد" title="فتح صفحة البريد" onClick={w.toMailPage}>
            <ExternalLink aria-hidden />
          </button>
        </div>
        <div className="cw-seg" role="group" aria-label="البريد والمراسلة">
          <button type="button" aria-pressed={w.mode === 'mail'} onClick={() => w.setMode('mail')}>
            البريد{mailUnread > 0 && <span className="ct">{mailUnread}</span>}
          </button>
          <button type="button" aria-pressed={w.mode === 'chat'} onClick={() => w.setMode('chat')}>
            المراسلة{chatUnread > 0 && <span className="ct">{chatUnread}</span>}
          </button>
        </div>
        <span className="cw-lab" title="ميزة تجريبية، تطفئها من «الحساب»">
          <FlaskConical aria-hidden />
          {w.width > 440 && 'تجريبي'}
        </span>
      </header>

      <div className="cw-body">{w.mode === 'chat' ? <ChatPane /> : <MailPane />}</div>

      {m.pending && (
        <div className="cw-undo" role="status">
          <span>
            {m.pending.label} خلال {m.pending.left} ث
          </span>
          <button type="button" onClick={m.undo}>
            تراجع
          </button>
        </div>
      )}

      {!phone && (
        <button
          type="button"
          className="cw-grip"
          role="separator"
          aria-orientation="vertical"
          aria-label="عرض النافذة"
          aria-valuemin={340}
          aria-valuemax={w.max}
          aria-valuenow={w.width}
          title="اسحب لتغيير العرض. نقرتان: جانبية أو كاملة"
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            setDrag(true);
          }}
          onPointerMove={(e) => {
            // The window is anchored to the left edge, so its width is the pointer's distance from it.
            if (drag) w.setSize(snapWidth(e.clientX, w.max));
          }}
          onPointerUp={() => setDrag(false)}
          onPointerCancel={() => setDrag(false)}
          onDoubleClick={() => w.setSize(buttonWidth(w.size === 'full' ? 'side' : 'full', w.max))}
          onKeyDown={(e) => {
            const next = keyWidth(e.key, w.width, w.max);
            if (!next) return;
            e.preventDefault();
            w.setSize(next);
          }}
          onFocus={() => setPeek(true)}
          onBlur={() => setPeek(false)}
        />
      )}
      {(drag || peek) && !phone && (
        <div className="cw-read" aria-hidden>
          <b>
            {SIZE_AR[w.size]} · {w.width} بكسل
          </b>
          <span>يظهر هنا: {ADDS_AR[w.tier === 'page' ? 'full' : w.tier]}</span>
          <span>أقصى عرض حتى القائمة: {w.max} بكسل</span>
        </div>
      )}
    </section>
  );
}

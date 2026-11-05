'use client';
// «إجراءات سريعة» on Home (MVP_draft.md section 76, Director_Notes_Plan.md N-2): one button, a short menu. Each item shows only to
// whoever may do it, and asks the same permission its own page asks; the database decides in the end.
//   «نشر مباشر»          the fixed capability publish.direct (the Admin and the director): opens direct-publish.tsx.
//   «تذكير خاص»          everyone: the calendar's own reminder dialog, for today.
//   «حدث في التقويم»     whoever opens the calendar: its own event dialog, for today.
//   «رفع ملف إلى المكتبة» and «رسالة جديدة»: the library and the mail page.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { BellPlus, CalendarPlus, ChevronDown, Mail, Send, Upload, Zap } from 'lucide-react';
import { useCaps } from './caps';
import { useWork } from './work/data';
import { Ic } from './work/parts';
import { EventDialog, ReminderDialog } from './work/day-dialogs';
import { DirectPublishSheet } from './work/direct-publish';

type Open = null | 'direct' | 'reminder' | 'event';

export function QuickActions() {
  const w = useWork();
  const caps = useCaps();
  const [menu, setMenu] = useState(false);
  const [open, setOpen] = useState<Open>(null);
  const root = useRef<HTMLDivElement>(null);

  // The menu closes on a click elsewhere and on Escape, as any menu does.
  useEffect(() => {
    if (!menu) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setMenu(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
    };
  }, [menu]);

  const act = async (fn: string, args: Record<string, unknown>, ok: string) => {
    const r = await w.call(fn, args);
    if (!r.ok) {
      w.say(r.error);
      return false;
    }
    w.say(ok);
    await w.reloadBase();
    return true;
  };
  const pick = (o: Open) => {
    setMenu(false);
    setOpen(o);
  };

  const direct = caps.has('publish.direct');
  const calendar = caps.has('page.calendar');
  const media = caps.has('page.media');
  const mail = caps.has('page.mail');

  return (
    <div className="qa" ref={root}>
      <button type="button" className="wk-btn" aria-haspopup="menu" aria-expanded={menu} data-qa="open" onClick={() => setMenu((m) => !m)}>
        <Ic i={Zap} />
        إجراءات سريعة
        <Ic i={ChevronDown} />
      </button>
      {menu && (
        <div className="qa-menu" role="menu" aria-label="إجراءات سريعة" data-qa="menu">
          {direct && (
            <button type="button" role="menuitem" data-qa="direct" onClick={() => pick('direct')}>
              <Ic i={Send} />
              <span>
                <b>نشر مباشر</b>
                <small>على يوتيوب أو إنستغرام، الآن أو في موعد، خارج دورة العمل</small>
              </span>
            </button>
          )}
          <button type="button" role="menuitem" data-qa="reminder" onClick={() => pick('reminder')}>
            <Ic i={BellPlus} />
            <span>
              <b>تذكير خاص</b>
              <small>لك وحدك، في التقويم</small>
            </span>
          </button>
          {calendar && (
            <button type="button" role="menuitem" data-qa="event" onClick={() => pick('event')}>
              <Ic i={CalendarPlus} />
              <span>
                <b>حدث في التقويم</b>
                <small>مؤتمر أو فعالية تحتاج تغطية</small>
              </span>
            </button>
          )}
          {media && (
            <Link href="/media" role="menuitem" data-qa="upload" onClick={() => setMenu(false)}>
              <Ic i={Upload} />
              <span>
                <b>رفع ملف إلى المكتبة</b>
                <small>في مكتبة الوسائط</small>
              </span>
            </Link>
          )}
          {mail && (
            <Link href="/mail" role="menuitem" data-qa="mail" onClick={() => setMenu(false)}>
              <Ic i={Mail} />
              <span>
                <b>رسالة جديدة</b>
                <small>في البريد</small>
              </span>
            </Link>
          )}
        </div>
      )}
      {open === 'direct' && <DirectPublishSheet onClose={() => setOpen(null)} />}
      {open === 'reminder' && <ReminderDialog date={w.today} onClose={() => setOpen(null)} act={act} />}
      {open === 'event' && <EventDialog date={w.today} onClose={() => setOpen(null)} act={act} />}
    </div>
  );
}

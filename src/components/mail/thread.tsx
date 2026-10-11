'use client';
// One conversation: its messages, notes and timeline, the action cards inside them,
// the handling bar of an outside thread, a quick reply, and the context beside it.
import Link from 'next/link';
import { useState } from 'react';
import { roles } from '@/lib/domain';
import {
  cardWaits,
  extStatusLabels,
  extStatusTone,
  fullWhen,
  hoursMinutes,
  isApprover,
  isLead,
  needsApproval,
  replyMinutes,
  shortWhen,
  stageAr,
  sysText,
  type Card,
  type ExtStatus,
  type MessageRow,
  type SysData,
  type View,
} from '@/lib/mail/rules';
import { pipeline, stagePosition } from '@/lib/media/rules';
import { cardTitle, type Draft } from './composer';
import { Av, Bdi, CHANNEL_AR, I, fileSize, localInput, tokenName } from './parts';
import { useMail } from './provider';

const STAGE_TONE: Record<string, string> = {
  draft: '', production: 'info', review: 'review', changes: 'warn', rejected: 'danger', ready: 'success', scheduled: 'schedule', published: 'done',
};

export function ThreadView({
  view,
  onCompose,
  onToWork,
  onBack,
}: {
  view: View;
  onCompose: (d: Partial<Draft>) => void;
  onToWork: () => void;
  onBack: () => void;
}) {
  const m = useMail();
  const t = view.thread;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const mails = view.messages.filter((x) => x.kind === 'mail');
  const lastId = mails[mails.length - 1]?.id;
  const canHandle = t.kind === 'external' && (isLead(m.role) || t.assignee === m.me);

  const fromName = (x: MessageRow) =>
    x.author ? m.nameOf(x.author) : x.from_name || x.from_email || t.contact_name || t.contact_email || 'جهة خارجية';

  return (
    <div className="ml-tgrid">
      <div className="ml-thread">
        <div className="ml-subj">
          <h3>{t.subject}</h3>
          <div className="ml-chips">
            <span className={`ml-kind ${t.kind === 'external' ? 'ext' : 'int'}`}>{t.kind === 'external' ? 'خارجي · صندوق القسم' : 'داخلي'}</span>
            {t.labels.map((l) => (
              <span key={l} className="mx-tag">
                {l}
                <button type="button" aria-label={`إزالة الوسم ${l}`} onClick={() => void m.call('mail_set_labels', { p_thread: t.id, p_labels: t.labels.filter((x) => x !== l) })}>
                  ×
                </button>
              </span>
            ))}
            {view.member?.muted && <span className="mx-chip plain">مكتومة: لا تعود إلى الوارد</span>}
            {view.member?.snooze_until && Date.parse(view.member.snooze_until) > m.now && (
              <span className="mx-chip schedule">مؤجلة حتى {fullWhen(view.member.snooze_until)}</span>
            )}
          </div>
        </div>

        {t.kind === 'external' && mails.some((x) => x.state !== 'held' && x.state !== 'returned') && (
          <Handle view={view} canHandle={canHandle} onToWork={onToWork} />
        )}

        {view.messages.map((x) => {
          if (x.kind === 'sys') {
            const text = sysText(x.card as SysData, m.nameOf);
            if (!text) return null;
            return (
              <div key={x.id} className="ml-sys">
                <span>
                  {text}
                  {x.author && x.author !== 'system' ? ` · ${m.nameOf(x.author)}` : ''} · <Bdi>{shortWhen(x.created_at, m.now)}</Bdi>
                </span>
              </div>
            );
          }
          if (x.kind === 'note')
            return (
              <div key={x.id} className="ml-note">
                <small>
                  <I n="note" />
                  ملاحظة داخلية من {m.nameOf(x.author ?? '')} · <Bdi>{fullWhen(x.created_at)}</Bdi> · لا يراها المرسل الخارجي
                </small>
                <Body text={x.body} />
              </div>
            );
          const waits = cardWaits(x.card, m.me, m.role) || (x.state === 'held' && isApprover(m.role) && x.author !== m.me);
          const def = x.id !== lastId && !waits && x.state !== 'held' && x.state !== 'returned';
          const collapsed = open[x.id] === undefined ? def : !open[x.id];
          return (
            <article key={x.id} className={`ml-msg ${collapsed ? 'collapsed' : ''} ${['outbox', 'queued', 'failed'].includes(x.state) ? 'pending' : ''}`}>
              <button type="button" className="ml-msg-h" aria-expanded={!collapsed} onClick={() => setOpen({ ...open, [x.id]: collapsed })}>
                <Av label={fromName(x)} tone={x.author ? '' : 'ext'} email={x.author} />
                <span className="who">
                  <b>{fromName(x)}</b>
                  {!x.author && x.from_email && (
                    <bdi dir="ltr" className="addr">
                      &lt;{x.from_email}&gt;
                    </bdi>
                  )}
                  <small className="to">{toLine(x, m.nameOf)}</small>
                  <small className="snip">{x.body.replace(/\s+/g, ' ')}</small>
                </span>
                <span className="mt">
                  {(x.files.length > 0 || x.refs.length > 0 || x.inbound_files.length > 0) && <I n="clip" />}
                  <Bdi>{fullWhen(x.created_at)}</Bdi>
                </span>
              </button>
              {!collapsed && (
                <>
                  <Body text={x.body} />
                  <div className="ml-extra">
                    <Flags x={x} />
                    {(x.state === 'held' || x.state === 'returned') && <Hold x={x} onEdit={onCompose} />}
                    <Attachments x={x} />
                    {x.refs.map((id) => (
                      <RefCard key={id} id={id} outgoing={Boolean(x.author) && t.kind === 'external'} />
                    ))}
                    {x.card && 'type' in x.card && <CardView x={x} card={x.card as Card} contact={t.contact_name || t.contact_email || ''} />}
                    {x.state !== 'held' && x.state !== 'returned' && (
                      <div className="ml-msg-acts">
                        <button type="button" className="ml-btn sm quiet" onClick={() => onCompose({ mode: 'reply', thread: t.id, replyTo: x.id } as Partial<Draft>)}>
                          <I n="reply" />
                          رد
                        </button>
                        <button type="button" className="ml-btn sm quiet" onClick={() => onCompose({ mode: 'forward', thread: t.id, replyTo: x.id } as Partial<Draft>)}>
                          <I n="forward" />
                          إعادة توجيه
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </article>
          );
        })}

        <QuickReply view={view} onCompose={onCompose} />
      </div>
      <Context view={view} onBack={onBack} />
    </div>
  );
}

function Body({ text }: { text: string }) {
  // @mentions and #CH-n work links stand out; everything else is plain text.
  const parts = text.split(/(@[؀-ۿA-Za-z]+|#CH-\d+)/g);
  return (
    <div className="ml-mbody">
      {parts.map((p, i) =>
        p.startsWith('@') ? (
          <span key={i} className="men">
            {p}
          </span>
        ) : p.startsWith('#CH-') ? (
          <Link key={i} className="wl" href={`/work/${p.slice(1)}`}>
            {p}
          </Link>
        ) : (
          p
        ),
      )}
    </div>
  );
}

function toLine(x: MessageRow, nameOf: (e: string) => string) {
  const parts: string[] = [];
  const to = x.author ? x.to_list : x.to_list.filter(Boolean);
  if (to.length) parts.push(`إلى: ${to.map((t) => tokenName(t, nameOf)).join('، ')}`);
  if (x.cc_list.length) parts.push(`نسخة: ${x.cc_list.map((t) => tokenName(t, nameOf)).join('، ')}`);
  if (x.bcc_list.length) parts.push(`مخفية: ${x.bcc_list.map((t) => tokenName(t, nameOf)).join('، ')}`);
  return parts.join(' · ');
}

function Flags({ x }: { x: MessageRow }) {
  const m = useMail();
  if (x.state === 'outbox')
    return (
      <p className="ml-flag">
        <I n="clock" />
        {x.send_at && Date.parse(x.send_at) > m.now ? `مجدولة للخروج ${fullWhen(x.send_at)}` : 'في الصادر، تخرج من صندوق القسم مع المزامنة التالية.'}
      </p>
    );
  if (x.state === 'queued')
    return (
      <p className="ml-flag bad">
        <I n="pause" />
        في الطابور: البريد الصادر متوقف، وتخرج الرسالة عند الاستئناف.
      </p>
    );
  if (x.state === 'failed')
    return (
      <p className="ml-flag bad">
        <I n="alert" />
        تعذّر الإرسال من Gmail{x.error === 'DRIVE_NOT_CONFIGURED' ? ' لأن Google Drive غير مربوط' : x.error === 'ATTACHMENTS_TOO_LARGE' ? ' لأن المرفقات أكبر من 25 MB' : ''}.
        <button type="button" className="ml-btn sm" onClick={() => void m.call('mail_retry', { p_message: x.id }, 'أُعيدت إلى الصادر.').then(() => m.sync(true))}>
          إعادة المحاولة
        </button>
      </p>
    );
  if (x.ext_sent_at)
    return (
      <p className="ml-flag">
        <I n="send" />
        خرجت من صندوق القسم عبر Gmail · <Bdi>{shortWhen(x.ext_sent_at, m.now)}</Bdi>
      </p>
    );
  if (x.send_at && Date.parse(x.send_at) > m.now && x.author === m.me)
    return (
      <p className="ml-flag">
        <I n="cal" />
        مجدولة: يراها المستلمون {fullWhen(x.send_at)}.
        <button type="button" className="ml-btn sm" onClick={() => void m.call('mail_send_now', { p_message: x.id }, 'أُرسلت الآن.')}>
          أرسل الآن
        </button>
      </p>
    );
  return null;
}

function Hold({ x, onEdit }: { x: MessageRow; onEdit: (d: Partial<Draft>) => void }) {
  const m = useMail();
  const [note, setNote] = useState<string | null>(null);
  const author = x.author ?? '';
  const edit = async () => {
    const { supabase } = await import('@/lib/supabase/client');
    const { data, error } = await supabase().rpc('mail_cancel', { p_message: x.id });
    if (error) return m.say('تعذّر سحب الرسالة.');
    const row = data as MessageRow;
    await m.reload();
    const firstOfThread = !m.viewOf(x.thread_id);
    onEdit({
      mode: firstOfThread ? 'new' : 'reply',
      thread: firstOfThread ? null : x.thread_id,
      to: row.to_list,
      cc: row.cc_list,
      bcc: row.bcc_list,
      body: row.body,
      refs: row.refs,
      sig: false,
      subject: m.viewOf(x.thread_id)?.thread.subject ?? '',
    });
  };
  if (x.state === 'returned')
    return (
      <div className="ml-box danger">
        <p>
          أُعيدت الرسالة {x.hold_by ? `من ${m.nameOf(x.hold_by)}` : ''} مع ملاحظة: «{x.hold_note}»
        </p>
        {author === m.me && (
          <div className="row">
            <button type="button" className="ml-btn sm primary" onClick={() => void edit()}>
              تعديل وإعادة الإرسال
            </button>
          </div>
        )}
      </div>
    );
  const canDecide = isApprover(m.role) && author !== m.me;
  return (
    <div className="ml-box">
      <p>
        <I n="shield" /> بريد خارجي بانتظار الاعتماد. الرسائل الخارجية التي تبدأ محادثة جديدة، أو يرسلها غير المسؤول عنها، تحتاج اعتماد مدير
        الاتصال أو مساعده قبل أن تخرج.
      </p>
      {canDecide && note === null && (
        <div className="row">
          <button type="button" className="ml-btn sm primary" onClick={() => void m.call('mail_hold_act', { p_message: x.id, p_op: 'approve', p_note: null }, 'اعتُمدت الرسالة.').then(() => m.sync(true))}>
            <I n="check" />
            اعتماد وإرسال
          </button>
          <button type="button" className="ml-btn sm" onClick={() => setNote('')}>
            إعادة مع ملاحظة
          </button>
        </div>
      )}
      {canDecide && note !== null && (
        <>
          <textarea aria-label="ملاحظة للكاتب" placeholder="ما الذي يحتاج تعديلاً؟" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="row">
            <button
              type="button"
              className="ml-btn sm primary"
              disabled={!note.trim()}
              onClick={() => void m.call('mail_hold_act', { p_message: x.id, p_op: 'return', p_note: note }, `أُعيدت إلى ${m.nameOf(author)} مع ملاحظتك.`)}
            >
              إعادة إلى {m.nameOf(author)}
            </button>
            <button type="button" className="ml-btn sm quiet" onClick={() => setNote(null)}>
              إلغاء
            </button>
          </div>
        </>
      )}
      {author === m.me && (
        <div className="row">
          <span>أُبلغ مدير الاتصال ومساعده.</span>
          <button type="button" className="ml-btn sm" onClick={() => void edit()}>
            سحب وتعديل
          </button>
        </div>
      )}
    </div>
  );
}

function Attachments({ x }: { x: MessageRow }) {
  const m = useMail();
  if (!x.files.length && !x.inbound_files.length) return null;
  return (
    <div className="ml-atts">
      {x.files.map((id) => {
        const f = m.files.find((y) => y.id === id);
        return (
          <a key={id} className="ml-att" href={`/api/mail/file/${id}`}>
            <I n="file" />
            <span>{f?.name ?? 'مرفق'}</span>
            <small>{f ? `${fileSize(f.size_bytes)} · Drive` : 'Drive'}</small>
          </a>
        );
      })}
      {x.inbound_files.map((f, i) => (
        <a key={i} className="ml-att" href={`/api/mail/inbound/${x.id}/${i}`}>
          <I n="file" />
          <span>{f.name}</span>
          <small>{fileSize(f.size)} · Gmail</small>
        </a>
      ))}
    </div>
  );
}

function RefCard({ id, outgoing }: { id: string; outgoing: boolean }) {
  const m = useMail();
  const a = m.assets.find((y) => y.id === id);
  if (!a)
    return (
      <div className="ml-ref locked">
        <span className="th">
          <I n="lock" />
        </span>
        <span>
          <b>مرجع من مكتبة الوسائط</b>
          <small>لا تملك وصولاً إلى المجلد الذي فيه هذا الأصل، فالبطاقة مقفلة ولا يظهر محتواها. اطلب الوصول ممن يدير المجلد.</small>
        </span>
      </div>
    );
  return (
    <div className="ml-refwrap">
      <div className="ml-ref">
        <span className="th">
          <I n={a.kind === 'video' ? 'film' : a.kind === 'image' ? 'image' : 'file'} />
        </span>
        <span>
          <b>{a.name}</b>
          <small>
            الإصدار {outgoing && a.approved_version ? a.approved_version : a.current_version} · {fileSize(a.size_bytes)}
          </small>
        </span>
        <span className="rr">
          <span className={`mx-chip ${STAGE_TONE[a.stage] ?? ''}`}>{stageAr(a.stage)}</span>
          <Link className="ml-btn sm" href={`/media/${a.id}`}>
            فتح
          </Link>
        </span>
      </div>
      {outgoing && a.approved_version && (
        <p className={`ml-refnote ${a.size_bytes > 25 * 1024 * 1024 ? '' : 'ok'}`}>
          <I n={a.size_bytes > 25 * 1024 * 1024 ? 'link' : 'clip'} />
          {a.size_bytes > 25 * 1024 * 1024
            ? `الإصدار المعتمد ${a.approved_version} أكبر من حد Gmail (25 MB)، فخرج للجهة رابط مراجعة ينتهي بعد 7 أيام.`
            : `خرج الإصدار المعتمد ${a.approved_version} مرفقاً بالرسالة.`}
        </p>
      )}
    </div>
  );
}

function CardView({ x, card, contact }: { x: MessageRow; card: Card; contact: string }) {
  const m = useMail();
  const [form, setForm] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const waits = cardWaits(card, m.me, m.role);
  const act = (op: string, v: string | null, ok: string) => m.call('mail_card_act', { p_message: x.id, p_op: op, p_value: v }, ok).then((r) => {
    if (!r.ok) m.say(r.error);
    setForm(null);
  });
  const Head = ({ icon, st, tone }: { icon: Parameters<typeof I>[0]['n']; st: string; tone: string }) => (
    <div className="ml-act-h">
      <span className="ai">
        <I n={icon} />
      </span>
      {cardTitle(card)}
      <span className={`mx-chip ${tone}`}>{st}</span>
    </div>
  );

  if (card.type === 'approval') {
    const a = m.assets.find((y) => y.id === card.asset_id);
    const st = { pending: ['بانتظار القرار', 'review'], approved: ['معتمد', 'success'], changes: ['بحاجة إلى تعديل', 'warn'], rejected: ['مرفوض', 'danger'], superseded: ['تجاوزه إصدار أحدث', ''] }[card.state];
    return (
      <div className={`ml-act ${waits ? 'wait' : ''}`}>
        <Head icon="check" st={st[0]} tone={st[1]} />
        <div className="ml-act-b">
          <div className="ml-ref">
            <span className="th">
              <I n={a?.kind === 'video' ? 'film' : a?.kind === 'image' ? 'image' : 'file'} />
            </span>
            <span>
              <b>{card.name}</b>
              <small>
                الإصدار {card.version} · طلبه {m.nameOf(card.by)}
              </small>
            </span>
            {a && (
              <span className="rr">
                <Link className="ml-btn sm" href={`/media/${a.id}`}>
                  معاينة
                </Link>
              </span>
            )}
          </div>
          {card.state === 'pending' &&
            (isApprover(m.role) ? (
              form === 'changes' ? (
                <>
                  <textarea aria-label="المطلوب تعديله" placeholder="ما المطلوب تعديله؟ تُحفظ الملاحظة على الأصل أيضاً." value={value} onChange={(e) => setValue(e.target.value)} />
                  <div className="ml-act-f">
                    <button type="button" className="ml-btn sm primary" disabled={!value.trim()} onClick={() => void act('changes', value, 'أُرسل طلب التعديل.')}>
                      إرسال طلب التعديل
                    </button>
                    <button type="button" className="ml-btn sm quiet" onClick={() => setForm(null)}>
                      إلغاء
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="ml-act-f">
                    <button type="button" className="ml-btn sm primary" onClick={() => void act('approve', null, `اعتُمد الإصدار ${card.version}.`)}>
                      <I n="check" />
                      اعتماد الإصدار {card.version}
                    </button>
                    <button type="button" className="ml-btn sm" onClick={() => (setValue(''), setForm('changes'))}>
                      طلب تعديل
                    </button>
                    {(m.role === 'director' || m.role === 'admin') && (
                      <button type="button" className="ml-btn sm danger" onClick={() => void act('reject', null, 'رُفض الإصدار.')}>
                        رفض
                      </button>
                    )}
                  </div>
                  <p className="ml-who">القرار يخص الإصدار {card.version} بعينه. أي إصدار لاحق يعيد الأصل إلى المراجعة.</p>
                </>
              )
            ) : (
              <p className="ml-who">ينتظر قرار مدير الاتصال أو مساعده.</p>
            ))}
          {card.state === 'superseded' && (
            <div className="ml-res">
              رُفع إصدار أحدث{card.now ? ` (${card.now})` : ''} بعد هذا الطلب، أو تغيّرت مرحلة الأصل، فلم يعد هذا القرار ممكناً. أرسل طلباً جديداً بالإصدار الحالي.
            </div>
          )}
          {['approved', 'changes', 'rejected'].includes(card.state) && (
            <div className="ml-res">
              {card.state === 'approved' ? 'اعتماد' : card.state === 'changes' ? 'طلب تعديل' : 'رفض'} · {m.nameOf(card.dby ?? '')} · <Bdi>{card.dat ? fullWhen(card.dat) : ''}</Bdi>
              {card.note ? <><br />«{card.note}»</> : null}
              {card.state === 'approved' && <><br />الإصدار {card.version} مجمّد الآن، والأصل «جاهز للنشر». سُجّل القرار في سجل النشاط.</>}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (card.type === 'date') {
    const st = { pending: ['بانتظار التأكيد', 'review'], confirmed: ['مؤكد', 'success'], counter: ['اقتُرح موعد آخر', 'warn'] }[card.state];
    const shown = card.state === 'confirmed' && card.final ? card.final : card.proposed;
    return (
      <div className={`ml-act ${waits ? 'wait' : ''}`}>
        <Head icon="cal" st={st[0]} tone={st[1]} />
        <div className="ml-act-b">
          <div>
            <small className="ml-who">{card.name}</small>
            <div className="ml-big">{fullWhen(shown)}</div>
            {card.was && <small className="ml-who">بدلاً من {fullWhen(card.was)}</small>}
          </div>
          <div className="ml-meta">
            {card.channels.map((c) => (
              <span key={c} className="mx-chip plain">
                {CHANNEL_AR[c] ?? c}
              </span>
            ))}
          </div>
          {card.askee === 'ext' && card.state === 'pending' && (
            <div className="ml-extprev">
              <span>وصل إلى {contact} زران في الرسالة، كل منهما رابط موقّع صالح 72 ساعة:</span>
              <div className="fake">
                <span>تأكيد الموعد</span>
                <span>اقتراح موعد آخر</span>
              </div>
            </div>
          )}
          {card.askee !== 'ext' && card.state === 'pending' && card.askee === m.me && form !== 'counter' && (
            <div className="ml-act-f">
              <button type="button" className="ml-btn sm primary" onClick={() => void act('confirm', null, 'تأكد الموعد وسُجّل في سجل النشاط.')}>
                <I n="check" />
                تأكيد الموعد
              </button>
              <button type="button" className="ml-btn sm" onClick={() => (setValue(localInput(48, 19)), setForm('counter'))}>
                اقتراح موعد آخر
              </button>
            </div>
          )}
          {form === 'counter' && (
            <>
              <label className="ml-l" htmlFor={`ctr-${x.id}`}>
                الموعد المقترح
                <input id={`ctr-${x.id}`} type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} />
              </label>
              <div className="ml-act-f">
                <button type="button" className="ml-btn sm primary" disabled={!value} onClick={() => void act('counter', new Date(value).toISOString(), 'أُرسل اقتراحك.')}>
                  إرسال الاقتراح
                </button>
                <button type="button" className="ml-btn sm quiet" onClick={() => setForm(null)}>
                  إلغاء
                </button>
              </div>
            </>
          )}
          {card.askee !== 'ext' && card.state === 'pending' && card.askee !== m.me && <p className="ml-who">بانتظار تأكيد {m.nameOf(card.askee)}.</p>}
          {card.state === 'counter' && (
            <>
              <div className="ml-res">
                {card.cby === 'ext' ? `اقتراح ${contact} عبر الرابط` : `اقتراح ${m.nameOf(card.cby ?? '')}`}: <b>{card.counter ? fullWhen(card.counter) : ''}</b>
              </div>
              {(card.by === m.me || isLead(m.role)) && (
                <div className="ml-act-f">
                  <button type="button" className="ml-btn sm primary" onClick={() => void act('accept', null, 'قُبل الموعد المقترح.')}>
                    قبول الموعد المقترح
                  </button>
                </div>
              )}
            </>
          )}
          {card.state === 'confirmed' && (
            <div className="ml-res">
              تأكيد {card.dby === 'ext' ? `${contact} عبر الرابط الموقّع` : m.nameOf(card.dby ?? '')} · <Bdi>{card.dat ? fullWhen(card.dat) : ''}</Bdi>. سُجّل في سجل النشاط، وجدولة النشر نفسها تبقى خطوة مسؤول النشر في مكتبة الوسائط.
            </div>
          )}
        </div>
      </div>
    );
  }

  if (card.type === 'task') {
    const late = card.state === 'open' && Date.parse(card.due) < m.now;
    return (
      <div className={`ml-act ${waits ? 'wait' : ''}`}>
        <Head icon="tasks" st={card.state === 'done' ? 'منجزة' : late ? 'متأخرة' : 'مفتوحة'} tone={card.state === 'done' ? 'done' : late ? 'danger' : 'info'} />
        <div className="ml-act-b">
          <b className="ml-what">{card.what}</b>
          <div className="ml-meta">
            <span>
              <Av label={m.nameOf(card.assignee)} small email={card.assignee} /> {m.nameOf(card.assignee)}
            </span>
            <span className={late ? 'late' : ''}>
              <I n="clock" /> التسليم {fullWhen(card.due)}
            </span>
            {card.priority === 'urgent' && <span className="mx-chip warn">عاجلة</span>}
            <span>أسندها {m.nameOf(card.by)}</span>
          </div>
          <div className="ml-prog" role="progressbar" aria-valuenow={card.progress} aria-valuemin={0} aria-valuemax={100} aria-label="تقدّم المهمة">
            <i style={{ width: `${card.progress}%` }} />
          </div>
          <small className="ml-who">التقدّم {card.progress}٪ · تظهر المهمة أيضاً في صفحة المهام</small>
          {card.state === 'open' && card.assignee === m.me && (
            <div className="ml-act-f">
              <select className="ml-sel" aria-label="التقدّم" value={value || String(Math.max(25, Math.min(75, card.progress + 25)))} onChange={(e) => setValue(e.target.value)}>
                {[25, 50, 75].map((v) => (
                  <option key={v} value={v}>
                    {v}٪
                  </option>
                ))}
              </select>
              <button type="button" className="ml-btn sm" onClick={() => void act('progress', value || String(Math.max(25, Math.min(75, card.progress + 25))), 'حُدّث التقدّم.')}>
                تحديث التقدّم
              </button>
              <button type="button" className="ml-btn sm primary" onClick={() => void act('done', null, 'أُنجزت المهمة.')}>
                <I n="check" />
                تم الإنجاز
              </button>
            </div>
          )}
          {card.state === 'open' && card.assignee !== m.me && (card.by === m.me || isApprover(m.role)) && (
            <div className="ml-act-f">
              <button type="button" className="ml-btn sm" onClick={() => void act('remind', null, `أُرسل تذكير إلى ${m.nameOf(card.assignee)}.`)}>
                تذكير {m.nameOf(card.assignee)}
              </button>
            </div>
          )}
          {card.state === 'done' && card.dat && (
            <div className="ml-res">
              إنجاز {m.nameOf(card.assignee)} · <Bdi>{fullWhen(card.dat)}</Bdi>
            </div>
          )}
        </div>
      </div>
    );
  }

  const to = stagePosition(card.to as never);
  return (
    <div className="ml-act">
      <Head icon="chart" st={stageAr(card.to)} tone={STAGE_TONE[card.to] ?? ''} />
      <div className="ml-act-b">
        <span>
          نقل «{card.name}» من «{stageAr(card.from)}» إلى «{stageAr(card.to)}» · الإصدار {card.version} · {m.nameOf(card.by)}
        </span>
        <div className="ml-steps" aria-hidden="true">
          {pipeline.map((s, i) => (
            <i key={s} className={i < to ? 'd' : i === to ? 'c' : ''} />
          ))}
        </div>
        <div className="ml-steps-l">
          {pipeline.map((s, i) => (
            <span key={s} className={i === to ? 'c' : ''}>
              {stageAr(s)}
            </span>
          ))}
        </div>
        <div className="ml-act-f">
          <Link className="ml-btn sm" href={`/media/${card.asset_id}`}>
            افتح الأصل
          </Link>
        </div>
      </div>
    </div>
  );
}

function Handle({ view, canHandle, onToWork }: { view: View; canHandle: boolean; onToWork: () => void }) {
  const m = useMail();
  const t = view.thread;
  const mins = replyMinutes(t, m.now);
  const lead = isLead(m.role);
  return (
    <div className="ml-handle">
      <label htmlFor="ml-h-status">
        الحالة
        <select
          id="ml-h-status"
          disabled={!canHandle}
          value={t.ext_status ?? 'new'}
          onChange={(e) => void m.call('mail_handle', { p_thread: t.id, p_status: e.target.value, p_assignee: null }).then((r) => !r.ok && m.say(r.error))}
        >
          {(Object.keys(extStatusLabels) as ExtStatus[]).map((s) => (
            <option key={s} value={s}>
              {extStatusLabels[s]}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor="ml-h-assign">
        المسؤول
        <select
          id="ml-h-assign"
          disabled={!lead}
          value={t.assignee ?? ''}
          onChange={(e) =>
            void m
              .call('mail_handle', { p_thread: t.id, p_status: null, p_assignee: e.target.value || '-' }, e.target.value ? `أُسندت إلى ${m.nameOf(e.target.value)} وأُبلغ.` : 'أُلغي الإسناد.')
              .then((r) => !r.ok && m.say(r.error))
          }
        >
          <option value="">غير مُسند</option>
          {m.people
            .filter((p) => p.role !== 'admin')
            .map((p) => (
              <option key={p.email} value={p.email}>
                {p.display_name} · {roles[p.role]?.name}
              </option>
            ))}
        </select>
      </label>
      {mins !== null &&
        (mins < 0 ? (
          <span className="mx-chip danger">تجاوز وقت الرد بـ {hoursMinutes(mins)}</span>
        ) : (
          <span className={`mx-chip ${mins < 180 ? 'warn' : ''}`}>يُرد خلال {hoursMinutes(mins)}</span>
        ))}
      {t.ext_status === 'waiting' && <span className="mx-chip schedule">ننتظر ردّهم، لا يُحسب وقت الرد</span>}
      <span className="grow" />
      {t.req_no && <span className="req">طلب خارجي #{t.req_no}</span>}
      {canHandle && (
        <button type="button" className="ml-btn sm" onClick={onToWork}>
          <I n="work" />
          تحويل إلى عمل
        </button>
      )}
      {!canHandle && <span className="ml-who">للقيادة والمسؤول فقط</span>}
    </div>
  );
}

function QuickReply({ view, onCompose }: { view: View; onCompose: (d: Partial<Draft>) => void }) {
  const m = useMail();
  const t = view.thread;
  const [mode, setMode] = useState<'reply' | 'replyall' | 'forward' | 'note'>('reply');
  const [text, setText] = useState('');
  const external = t.kind === 'external';
  const note = mode === 'note';
  const gated = external && !note && mode !== 'forward' && needsApproval({ role: m.role, me: m.me, external, newThread: false, assignee: t.assignee });
  const onlyHeld = view.messages.filter((x) => x.kind === 'mail').every((x) => x.state === 'held' || x.state === 'returned');
  if (onlyHeld) return null;

  const send = async () => {
    if (!text.trim()) return m.say('اكتب نص الرد أولاً.');
    if (note) {
      const r = await m.call('mail_note', { p_thread: t.id, p_body: text }, 'أُضيفت الملاحظة الداخلية.');
      if (r.ok) setText('');
      else m.say(r.error);
      return;
    }
    onCompose({ mode, thread: t.id, body: text, quick: true } as Partial<Draft>);
    setText('');
  };
  const tabs: [typeof mode, Parameters<typeof I>[0]['n'], string][] = [
    ['reply', 'reply', 'رد'],
    ['replyall', 'replyall', 'رد على الكل'],
    ['forward', 'forward', 'إعادة توجيه'],
  ];
  if (external) tabs.push(['note', 'note', 'ملاحظة داخلية']);
  return (
    <div className={`ml-qr ${note ? 'note' : ''}`}>
      <div className="ml-qr-tabs" role="group" aria-label="نوع الرد">
        {tabs.map(([id, icon, label]) => (
          <button type="button" key={id} aria-pressed={mode === id} onClick={() => setMode(id)}>
            <I n={icon} />
            {label}
          </button>
        ))}
      </div>
      <textarea
        id="ml-qr"
        aria-label="نص الرد"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={note ? 'ملاحظة للفريق فقط، لا تصل إلى الجهة الخارجية.' : 'اكتب ردك هنا.'}
      />
      <div className="ml-qr-f">
        <small>
          {note
            ? 'تظهر لأعضاء القسم في هذه المحادثة فقط.'
            : mode === 'forward'
              ? 'تُفتح نافذة الكتابة لاختيار المستلمين.'
              : gated
                ? 'هذا الرد يحتاج اعتماد مدير الاتصال أو مساعده لأن المحادثة ليست مُسندة إليك.'
                : external
                  ? `يخرج من صندوق القسم${m.settings.paused ? '، والبريد الصادر متوقف فيدخل الطابور' : ''}.`
                  : 'يصل إلى المشاركين في المحادثة داخل المركز.'}
        </small>
        <span>
          {!note && (
            <button type="button" className="ml-btn sm" onClick={() => (onCompose({ mode, thread: t.id, body: text }), setText(''))}>
              <I n="clip" />
              مرفقات وبطاقات
            </button>
          )}
          <button type="button" className="ml-btn sm primary" onClick={() => void send()}>
            <I n="send" />
            {note ? 'إضافة الملاحظة' : mode === 'forward' ? 'متابعة' : gated ? 'إرسال للاعتماد' : 'إرسال'}
          </button>
        </span>
      </div>
    </div>
  );
}

function Context({ view, onBack }: { view: View; onBack: () => void }) {
  const m = useMail();
  const t = view.thread;
  const people = new Set<string>();
  for (const x of view.messages) {
    if (x.author && x.author !== 'system') people.add(x.author);
    for (const tok of [...x.to_list, ...x.cc_list]) if (tok.startsWith('p:')) people.add(tok.slice(2));
  }
  if (t.assignee) people.add(t.assignee);
  const groups = new Set(view.messages.flatMap((x) => [...x.to_list, ...x.cc_list]).filter((tok) => tok.startsWith('g:')));
  const events = view.messages.filter((x) => x.kind === 'sys').slice(-5);
  return (
    <aside className="ml-ctx" aria-label="سياق المحادثة">
      <button type="button" className="ml-btn sm quiet ml-back-bottom" onClick={onBack}>
        <I n="back" />
        العودة إلى القائمة
      </button>
      {t.links.length > 0 && (
        <section>
          <h5>المرتبط بهذه المحادثة</h5>
          {t.links.map((l) => {
            if (l.type === 'work')
              return (
                <Link key={l.id} className="ml-lnk" href={`/work/${l.id}`}>
                  <span className="top">
                    <small>
                      عمل <Bdi>{l.id}</Bdi>
                    </small>
                  </span>
                  <b>{l.title || l.id}</b>
                  <small>الأعمال محلية في كل متصفح في هذه المرحلة.</small>
                </Link>
              );
            const a = m.assets.find((y) => y.id === l.id);
            if (!a) return null;
            const pos = stagePosition(a.stage as never);
            return (
              <Link key={l.id} className="ml-lnk" href={`/media/${a.id}`}>
                <span className="top">
                  <small>
                    أصل · الإصدار {a.current_version}
                    {a.approved_version ? ` · المعتمد ${a.approved_version}` : ''}
                  </small>
                  <span className={`mx-chip ${STAGE_TONE[a.stage] ?? ''}`}>{stageAr(a.stage)}</span>
                </span>
                <b>{a.name}</b>
                <span className="ml-steps">
                  {pipeline.map((s, i) => (
                    <i key={s} className={i < pos ? 'd' : i === pos ? 'c' : ''} />
                  ))}
                </span>
              </Link>
            );
          })}
        </section>
      )}
      {t.kind === 'external' && (
        <section>
          <h5>المرسل</h5>
          <div className="ml-ppl">
            <div>
              <Av label={t.contact_name || t.contact_email || '·'} tone="ext" />
              <span>
                <b>{t.contact_name || t.contact_email}</b>
                <small>جهة خارجية</small>
              </span>
            </div>
          </div>
          <dl className="ml-kv">
            <dt>البريد</dt>
            <dd>
              <Bdi>{t.contact_email}</Bdi>
            </dd>
            <dt>محادثات</dt>
            <dd>{m.views.filter((v) => v.thread.contact_email && v.thread.contact_email === t.contact_email).length}</dd>
            <dt>رقم الطلب</dt>
            <dd>{t.req_no ? `#${t.req_no}` : 'لم يُسند بعد'}</dd>
          </dl>
        </section>
      )}
      <section>
        <h5>المشاركون من القسم</h5>
        <div className="ml-ppl">
          {[...people].map((p) => (
            <div key={p}>
              <Av label={m.nameOf(p)} small email={p} />
              <span>
                {m.nameOf(p)}
                <small>{roles[m.personOf(p)?.role ?? 'member']?.name}</small>
              </span>
            </div>
          ))}
          {[...groups].map((g) => (
            <div key={g}>
              <Av label={tokenName(g, m.nameOf)} tone="grp" small />
              <span>
                {tokenName(g, m.nameOf)}
                <small>مجموعة حسب الدور</small>
              </span>
            </div>
          ))}
          {t.kind === 'external' && (
            <p className="ml-who">ومدير الاتصال ومساعده ومسؤول النشر يرون صندوق القسم كاملاً.</p>
          )}
        </div>
      </section>
      {events.length > 0 && (
        <section>
          <h5>سجل المحادثة</h5>
          <ul className="ml-tl">
            {events.map((e) => (
              <li key={e.id}>
                <time>{shortWhen(e.created_at, m.now)}</time>
                <span>{sysText(e.card as SysData, m.nameOf)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="ml-later">لاحقاً، بعد النسخة 0: تلخيص المحادثة واستخراج الطلبات والمواعيد واقتراح رد. لا ذكاء اصطناعي في هذه المرحلة.</p>
    </aside>
  );
}

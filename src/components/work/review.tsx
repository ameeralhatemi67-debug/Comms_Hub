'use client';
// The review screen, «أنت تراجع», after «النموذج المرجعي للمركز» version 5: one row per part
// waiting for a decision (the text with a word difference against the approved version,
// each platform copy, each file with its preview and timed notes, the accounts, the
// proposed time), then approve a part or all of them, request changes on chosen parts, or
// reject. The database decides every rule again (work_decide): no approving what you sent
// or a file version you uploaded, the whole package for press releases, mail and
// announcements, and approval never publishes.
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  Clock,
  Eye,
  FileText,
  Image as ImageIcon,
  Lock,
  Plus,
  Send,
  Shield,
  TriangleAlert,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { HOLD } from '@/lib/kit/hold-reasons';
import { supabase } from '@/lib/supabase/client';
import {
  accountName,
  authOk,
  diffWords,
  isLead,
  isWhole,
  partLine,
  priorityLabels,
  riyadhStamp,
  statusLabels,
  typeLabels,
} from '@/lib/work/rules';
import { addFileNote, fileNotes, useWork, useWorkDetail, type FileNote, type PartRow, type WorkDetail } from './data';
import { Av, Empty, Hint, Ic, Modal } from './parts';

const KIND_ICON: Record<string, LucideIcon> = { text: FileText, copy: Send, asset: ImageIcon, dest: Users, date: Clock };
const tcSeconds = (tc: string) => {
  const [m, s] = tc.split(':').map(Number);
  return m * 60 + s;
};
const secondsTc = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export function ReviewPage({ id }: { id: string }) {
  const w = useWork();
  const { detail: d, status, reload } = useWorkDetail(id);
  const [notes, setNotes] = useState<FileNote[]>([]);
  const [mineUploads, setMineUploads] = useState<string[]>([]);
  const [dlg, setDlg] = useState<{ t: 'changes'; part?: string } | { t: 'reject' } | null>(null);
  const [busy, setBusy] = useState(false);
  const assetIds = useMemo(() => (d?.parts ?? []).filter((p) => p.kind === 'asset').map((p) => p.key.slice(2)), [d]);
  const loadNotes = async () => setNotes(await fileNotes(assetIds));
  useEffect(() => {
    void loadNotes();
    // Who uploaded the current version of each file: nobody approves their own.
    if (!assetIds.length || !d) return;
    void supabase()
      .from('media_versions')
      .select('asset_id,version,uploaded_by')
      .in('asset_id', assetIds)
      .then(({ data }) => {
        const cur = (k: string) => Number(d.parts.find((p) => p.key === `a:${k}`)?.ver.slice(1));
        setMineUploads(((data ?? []) as { asset_id: string; version: number; uploaded_by: string }[]).filter((v) => v.uploaded_by === w.me && v.version === cur(v.asset_id)).map((v) => v.asset_id));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetIds.join(','), w.me]);

  const act = async (fn: string, args: Record<string, unknown>, ok: string) => {
    setBusy(true);
    const r = await w.call<{ finished?: boolean; status?: string }>(fn, args);
    setBusy(false);
    if (!r.ok) {
      w.say(r.error);
      return false;
    }
    const st = r.data?.status;
    w.say(r.data?.finished ? `${ok} اكتمل الاعتماد وصار العمل «${statusLabels[(st ?? 'APPROVED') as keyof typeof statusLabels]}»، ويظهر لمسؤول النشر. لا يُنشر تلقائياً.` : ok);
    await Promise.all([reload(), w.reloadBase()]);
    return true;
  };

  if (status === 'loading' || w.status === 'loading')
    return (
      <div className="wk">
        <div className="wk-loading" role="status">
          جارٍ تحميل المراجعة…
        </div>
      </div>
    );
  if (status !== 'ready' || !d)
    return (
      <div className="wk">
        <Empty i={Eye} title={status === 'missing' ? 'العمل غير موجود' : 'تعذّر التحميل'}>
          <Link className="wk-lk" href="/approvals">
            العودة إلى الموافقات
          </Link>
        </Empty>
      </div>
    );

  const x = d.w;
  const lead = isLead(w.role);
  const blk = d.decideBlock;
  const inReview = x.status === 'IN_REVIEW';
  const can = lead && !blk && inReview;
  const cyc = d.cycles.find((c) => c.n === x.review_cycle) ?? d.cycles[d.cycles.length - 1];
  const pendKeys = new Set(d.pending.map((p) => p.key));
  const pend = isWhole(x.type) ? d.parts : d.parts.filter((p) => pendKeys.has(p.key));
  const okp = isWhole(x.type) ? [] : d.parts.filter((p) => !pendKeys.has(p.key));
  const uploadBlock = pend.some((p) => p.kind === 'asset' && mineUploads.includes(p.key.slice(2)));

  return (
    <div className="wk">
      <div className="wk-back">
        <Link className="wk-btn sm" href="/approvals">
          <Ic i={ArrowRight} />
          العودة إلى الموافقات
        </Link>
        <div className="wk-crumb">
          <Link href="/approvals">الموافقات</Link>
          <span aria-hidden="true">‹</span>
          <span className="cur">{x.id}</span>
        </div>
      </div>
      <section className="wk-rhead">
        <p className="eyebrow">
          {can ? 'أنت تراجع' : 'عرض للمراجعة'} · الدورة {cyc?.n ?? 1}
        </p>
        <h2>{x.title}</h2>
        <div className="wk-facts">
          <span>
            <Ic i={Users} />
            أرسلها {w.nameOf(cyc?.sent_by ?? x.assignee)}
            {cyc ? ` · ${riyadhStamp(cyc.sent_at)}` : ''}
          </span>
          <span>{typeLabels[x.type]}</span>
          <span>{d.projects.map((p) => w.projects.find((j) => j.id === p)?.name).join('، ') || 'بلا مشروع'}</span>
          {x.priority !== 'normal' && <span>الأولوية: {priorityLabels[x.priority]}</span>}
        </div>
        {cyc?.note && (
          <div className="wk-facts">
            <span>
              <Ic i={Send} />«{cyc.note}»
            </span>
          </div>
        )}
        <span className="pol">
          <Ic i={Shield} />
          {isWhole(x.type)
            ? `السياسة: ${typeLabels[x.type]} يُعتمد حزمة كاملة، وأي تعديل يعيده كله إلى المراجعة.`
            : 'السياسة: اعتماد لكل جزء. ما اعتُمد ولم يتغيّر لا يُراجع مرة أخرى.'}
        </span>
      </section>
      {blk && inReview && (
        <Hint i={Lock} warn>
          {blk}
        </Hint>
      )}
      {!lead && <Hint i={Eye}>القرار لمدير الاتصال ومساعده. تشاهد المراجعة فقط.</Hint>}
      {!inReview && <Hint i={Check}>القرار في هذا العمل اتُّخذ: {statusLabels[x.status]}.</Hint>}
      {can && uploadBlock && <Hint warn>رفعتَ إصدار ملف من هذه الأجزاء بنفسك، فلا تعتمده ولا تطلب تعديله. يقرر فيه {w.role === 'director' ? 'مساعد المدير' : 'مدير الاتصال'}.</Hint>}

      {inReview && (
        <section className="wk-psec" data-gd="pending">
          <h3>
            <Ic i={Eye} />
            {isWhole(x.type) ? 'الحزمة كاملة' : 'يحتاج قرارك'} <span className="n">{pend.length}</span>
          </h3>
          <div className="wk-rlist">
            {pend.map((p) => (
              <PartRowView
                key={p.key}
                d={d}
                p={p}
                can={can && !isWhole(x.type)}
                mine={p.kind === 'asset' && mineUploads.includes(p.key.slice(2))}
                notes={notes.filter((n) => p.kind === 'asset' && n.asset_id === p.key.slice(2))}
                onNote={loadNotes}
                busy={busy}
                onApprove={() => void act('work_decide', { p_work: x.id, p_op: 'approve', p_parts: [p.key], p_note: null, p_close: false }, `اعتُمد «${p.label}».`)}
                onChanges={() => setDlg({ t: 'changes', part: p.key })}
                canNote={can}
              />
            ))}
          </div>
        </section>
      )}
      {okp.length > 0 && (
        <section className="wk-psec" data-gd="okparts">
          <h3>
            <Ic i={Check} />
            معتمد ولم يتغيّر <span className="n">{okp.length}</span>
          </h3>
          <div className="wk-chanlist">
            {okp.map((p) => (
              <div className="wk-chanrow" key={p.key}>
                <span>
                  <b>{p.label}</b>
                  <small>{partLine(p, d.approvals, d.flags, w.nameOf)}</small>
                </span>
                <span className="wk-part ok">
                  <Ic i={Check} />
                  معتمد
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="wk-grid">
        <div className="wk-col">
          <section className="wk-pn">
            <h3>
              النقاش<small>{d.comments.length}</small>
            </h3>
            <div className="wk-cmts">
              {d.comments.slice(-4).map((c) => (
                <div className="wk-cmt" key={c.id}>
                  <Av name={w.nameOf(c.author)} size="sm" />
                  <div className="bub">
                    <small>
                      <b>{w.nameOf(c.author)}</b> · <span className="ltr">{riyadhStamp(c.created_at)}</span>
                    </small>
                    {c.body}
                  </div>
                </div>
              ))}
              {!d.comments.length && <p className="wk-col-hint">لا تعليقات.</p>}
            </div>
            <Link className="wk-lk" href={`/work/${x.id}`}>
              فتح صفحة العمل
            </Link>
          </section>
        </div>
        <div className="wk-col">
          <section className="wk-pn">
            <h3>
              دورات المراجعة<small>{d.cycles.length}</small>
            </h3>
            <ul className="wk-cyc">
              {[...d.cycles].reverse().map((c) => {
                const ev = d.decisions.filter((e) => e.cycle === c.n);
                const T: Record<string, string> = { approve: 'اعتماد', changes: 'طلب تعديل', reject: 'رفض', withdraw: 'سحب الطلب' };
                return (
                  <li key={c.n}>
                    <span className="n">{c.n}</span>
                    <span>
                      أرسلها {w.nameOf(c.sent_by)} <span className="ltr">{riyadhStamp(c.sent_at)}</span>
                      {c.note ? ` · ${c.note}` : ''}
                      {ev.length ? (
                        ev.map((e) => (
                          <small key={e.id}>
                            <b>{T[e.op] ?? e.op}</b> · {w.nameOf(e.decided_by)} · {e.labels.join('، ')}
                            {e.note ? ` · «${e.note}»` : ''}
                          </small>
                        ))
                      ) : (
                        <small>بانتظار القرار</small>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>

      {can && (
        <div className="wk-dbar">
          <span className="l">بعد الاعتماد يصبح العمل «جاهز للنشر» ويظهر لمسؤول النشر. لا يُنشر تلقائياً{x.proposed_at ? '، ويُلتزم بالموعد المعتمد' : ''}.</span>
          <button type="button" className="wk-btn danger" disabled={busy} onClick={() => setDlg({ t: 'reject' })}>
            <Ic i={X} />
            رفض العمل
          </button>
          <button type="button" className="wk-btn" disabled={busy || uploadBlock} onClick={() => setDlg({ t: 'changes' })}>
            <Ic i={TriangleAlert} />
            طلب تعديل
          </button>
          <button
            type="button"
            className="wk-btn gold"
            disabled={busy || uploadBlock}
            data-hold={HOLD.approveAll}
            onClick={() =>
              void act(
                'work_decide',
                { p_work: x.id, p_op: 'approve', p_parts: pend.map((p) => p.key), p_note: null, p_close: false },
                isWhole(x.type) ? 'اعتُمدت الحزمة كاملة.' : `اعتُمدت ${pend.length === 1 ? 'الجزء المعلّق' : `الأجزاء المعلّقة (${pend.length})`}.`,
              )
            }
          >
            <Ic i={Check} />
            {isWhole(x.type) ? 'اعتماد الحزمة كاملة' : `اعتماد ${pend.length === 1 ? 'الجزء المعلّق' : `الأجزاء المعلّقة (${pend.length})`}`}
          </button>
        </div>
      )}
      {dlg?.t === 'changes' && (
        <ChangesDialog d={d} pend={isWhole(x.type) ? [] : pend.filter((p) => !(p.kind === 'asset' && mineUploads.includes(p.key.slice(2))))} first={dlg.part} notes={notes} onClose={() => setDlg(null)} act={act} />
      )}
      {dlg?.t === 'reject' && <RejectDialog d={d} onClose={() => setDlg(null)} act={act} />}
    </div>
  );
}

function PartRowView({
  d,
  p,
  can,
  mine,
  notes,
  onNote,
  busy,
  onApprove,
  onChanges,
  canNote,
}: {
  d: WorkDetail;
  p: PartRow;
  can: boolean;
  mine: boolean;
  notes: FileNote[];
  onNote: () => Promise<void>;
  busy: boolean;
  onApprove: () => void;
  onChanges: () => void;
  canNote: boolean;
}) {
  const w = useWork();
  const a = d.approvals.find((x) => x.part === p.key);
  const f = d.flags.find((x) => x.part === p.key);
  const tag =
    f && f.ver !== p.ver ? (
      <span className="wk-chip info">عُدّل بعد طلب التعديل</span>
    ) : a && a.ver !== p.ver ? (
      <span className="wk-chip warn">تغيّر بعد اعتماده</span>
    ) : a ? (
      <span className="wk-chip approved">معتمد</span>
    ) : (
      <span className="wk-chip review">جديد</span>
    );
  const vlabel = p.kind === 'text' ? `الإصدار ${p.ver.slice(1)}` : p.kind === 'copy' ? `الصياغة ${p.ver.slice(1)}` : p.kind === 'asset' ? p.ver : p.kind === 'date' ? riyadhStamp(`${p.ver.slice(2)}:00Z`) : 'الحسابات بعينها';
  return (
    <article className="wk-rrow">
      <div className="rh">
        <span className="ri">
          <Ic i={KIND_ICON[p.kind] ?? FileText} />
        </span>
        <span>
          <b>{p.label}</b>
          <small>{vlabel}</small>
        </span>
        {tag}
      </div>
      {f?.note && <Hint warn>طلب التعديل السابق: «{f.note}»</Hint>}
      {(p.kind === 'text' || p.kind === 'copy') && (
        <>
          {a?.snap && p.snap && a.snap !== p.snap ? (
            <>
              <span className="wk-why">ما تغيّر منذ الإصدار المعتمد:</span>
              <div className="wk-textbox wk-diff">
                {diffWords(a.snap, p.snap).map(([t, word], i) => (
                  <span key={i}>
                    {t === 's' ? word : t === 'a' ? <ins>{word}</ins> : <del>{word}</del>}{' '}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="wk-textbox">{p.snap}</div>
          )}
          {p.kind === 'copy' && (
            <div className="wk-vmeta">
              <span>
                {(p.snap ?? '').length} حرفاً
                {p.key === 'v:x' && (p.snap ?? '').length > 240 && <b className="late"> · أطول من 240</b>}
              </span>
            </div>
          )}
          {p.kind === 'copy' && (() => {
            const v = d.variants.filter((y) => `v:${y.platform}` === p.key).sort((m, n) => n.n - m.n)[0];
            const t = d.texts[d.texts.length - 1];
            return v && t && v.base < t.n ? (
              <div className="wk-stale">
                <Ic i={TriangleAlert} />
                <span>كُتبت قبل آخر تعديل للنص الأساسي.</span>
              </div>
            ) : null;
          })()}
        </>
      )}
      {p.kind === 'asset' && <AssetReview d={d} p={p} prev={f?.ver ?? a?.ver ?? null} notes={notes} onNote={onNote} canNote={canNote} />}
      {p.kind === 'dest' && (
        <>
          <div className="wk-chanlist">
            {d.w.channels.map((c) => {
              const acc = w.accounts.find((y) => y.id === c);
              const ok = !d.w.proposed_at || (acc && authOk(acc, d.w.proposed_at));
              return (
                <div className="wk-chanrow" key={c}>
                  <span>
                    <b>{accountName(acc)}</b>
                    {acc?.handle && <small className="ltr">{acc.handle}</small>}
                  </span>
                  <span className={`wk-cr ${ok ? 'ok' : 'risk'}`}>{ok ? 'التفويض يغطي الموعد' : 'التفويض لا يغطي الموعد'}</span>
                </div>
              );
            })}
          </div>
          {a && a.ver !== p.ver && (
            <span className="wk-why">
              كانت المعتمدة:{' '}
              {a.ver
                .slice(2)
                .split(',')
                .map((s) => {
                  const [cid, ...h] = s.split('@');
                  return `${accountName(w.accounts.find((y) => y.id === cid))} (${h.join('@')})`;
                })
                .join('، ')}
            </span>
          )}
        </>
      )}
      {p.kind === 'date' && (
        <>
          <div className="wk-textbox">
            {riyadhStamp(`${p.ver.slice(2)}:00Z`)} <small>بتوقيت الرياض</small>
          </div>
          {a && a.ver !== p.ver && <span className="wk-why">كان المعتمد: {riyadhStamp(`${a.ver.slice(2)}:00Z`)}</span>}
        </>
      )}
      {can && (
        <div className="ra">
          {mine ? (
            <span className="wk-chip gatec">رفعتَ هذا الإصدار بنفسك، فلا تقرر فيه</span>
          ) : (
            <>
              <button type="button" className="wk-btn sm primary" disabled={busy} onClick={onApprove}>
                <Ic i={Check} />
                اعتماد هذا الجزء
              </button>
              <button type="button" className="wk-btn sm" disabled={busy} onClick={onChanges}>
                طلب تعديل عليه
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}

function AssetReview({ d, p, prev, notes, onNote, canNote }: { d: WorkDetail; p: PartRow; prev: string | null; notes: FileNote[]; onNote: () => Promise<void>; canNote: boolean }) {
  const w = useWork();
  const id = p.key.slice(2);
  const file = d.assets.find((x) => x.asset_id === id)?.file;
  const video = useRef<HTMLVideoElement>(null);
  const [tc, setTc] = useState('');
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const av = file && (file.kind === 'video' || file.kind === 'audio');
  const seek = (t: string) => {
    if (video.current) {
      video.current.currentTime = tcSeconds(t);
      void video.current.play().catch(() => {});
    }
  };
  return (
    <>
      <div className="wk-rprev">
        <div className="wk-rplayer">
          {!file ? (
            <span>ملف في مجلد لا تصل إليه</span>
          ) : file.kind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/media/${id}/content?v=${file.current_version}`} alt={file.name} />
          ) : av ? (
            <video ref={video} controls preload="metadata" src={`/api/media/${id}/content?v=${file.current_version}`} />
          ) : (
            <span>{file.name}</span>
          )}
        </div>
        <div className="wk-rmeta">
          <b>{p.label}</b>
          <small>{prev && prev !== p.ver ? `${prev} ← ${p.ver}` : `الإصدار ${p.ver.slice(1)}`}</small>
          {file && (
            <Link className="wk-btn sm quiet" href={`/media/${id}`}>
              <Ic i={Eye} />
              صفحة الملف في المكتبة
            </Link>
          )}
        </div>
      </div>
      {(av || notes.length > 0) && (
        <div className="wk-lab">
          {file?.kind === 'video' ? 'ملاحظات زمنية' : 'ملاحظات المراجعة'}
          {!notes.length && <small>لا ملاحظات بعد</small>}
          <div className="wk-vnl">
            {notes.map((n) => (
              <div className="wk-vn" key={n.id}>
                {n.timecode ? (
                  <button type="button" className="wk-tcb" onClick={() => seek(n.timecode!)} aria-label={`انتقل إلى ${n.timecode}`}>
                    {n.timecode}
                  </button>
                ) : (
                  <span className="wk-chip plain">عام</span>
                )}
                <span>
                  <b>{w.nameOf(n.author)}</b> · {n.body}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {canNote && av && (
        <>
          <div className="wk-vnadd">
            <input className="wk-inp ltr" style={{ width: 90 }} value={tc} placeholder="00:32" aria-label="الوقت دقيقة:ثانية" onChange={(e) => setTc(e.target.value)} />
            <button type="button" className="wk-btn sm quiet" onClick={() => setTc(secondsTc(video.current?.currentTime ?? 0))}>
              <Ic i={Clock} />
              الوقت الحالي
            </button>
            <input className="wk-inp" style={{ flex: '1 1 200px' }} value={text} maxLength={500} placeholder="ملاحظة عند هذا الوقت" aria-label="الملاحظة" onChange={(e) => setText(e.target.value)} />
            <button
              type="button"
              className="wk-btn sm"
              onClick={async () => {
                if (!text.trim()) return setErr('اكتب الملاحظة.');
                const e = await addFileNote(id, w.me, text.trim(), tc.trim());
                if (e) return setErr(e);
                setErr('');
                setText('');
                await onNote();
              }}
            >
              <Ic i={Plus} />
              إضافة
            </button>
          </div>
          {err && <p className="wk-err">{err}</p>}
          <small className="wk-why">اضغط وقت ملاحظة لتنتقل إليه. الملاحظات تُحفظ مع الملف في المكتبة.</small>
        </>
      )}
    </>
  );
}

type Act = (fn: string, args: Record<string, unknown>, ok: string) => Promise<boolean>;
export function ChangesDialog({ d, pend, first, notes, onClose, act }: { d: WorkDetail; pend: PartRow[]; first?: string; notes: FileNote[]; onClose: () => void; act: Act }) {
  const w = useWork();
  const [parts, setParts] = useState<string[]>(first ? [first] : pend.map((p) => p.key));
  const [note, setNote] = useState('');
  const timed = notes.filter((n) => n.timecode);
  const [pick, setPick] = useState<string[]>(timed.map((n) => n.id));
  const [err, setErr] = useState('');
  const whole = isWhole(d.w.type);
  const send = () => {
    if (!whole && !parts.length) return setErr('اختر جزءاً واحداً على الأقل.');
    if (!note.trim()) return setErr('اكتب ما يجب تعديله.');
    const attached = timed.filter((n) => pick.includes(n.id)).map((n) => `${n.timecode} ${n.body}`);
    const full = attached.length ? `${note.trim()}\nملاحظات زمنية: ${attached.join('؛ ')}` : note.trim();
    void act('work_decide', { p_work: d.w.id, p_op: 'changes', p_parts: whole ? null : parts, p_note: full.slice(0, 1000), p_close: false }, `أُرسل طلب التعديل إلى ${w.nameOf(d.w.assignee)}.`).then((ok) => ok && onClose());
  };
  return (
    <Modal title="طلب تعديل" onClose={onClose}>
      <Hint warn>العمل صالح ويحتاج تعديلاً. {whole ? 'يعود كله إلى صاحبه.' : 'يعود ما تختاره، وما اعتمدته في هذه الدورة يبقى معتمداً.'}</Hint>
      {!whole && pend.length > 0 && (
        <div className="l">
          على أي جزء؟
          <div className="wk-pick">
            {pend.map((p) => (
              <label key={p.key}>
                <input type="checkbox" checked={parts.includes(p.key)} onChange={(e) => setParts(e.target.checked ? [...parts, p.key] : parts.filter((k) => k !== p.key))} />
                {p.label}
              </label>
            ))}
          </div>
        </div>
      )}
      <label className="l">
        ما الذي يجب تعديله؟ <small>مطلوب، يصل إلى {w.nameOf(d.w.assignee)} ويُحفظ في سجل الدورة</small>
        <textarea className="wk-inp" value={note} maxLength={900} placeholder="مثلاً: استبدل الصورة الثالثة وصحّح التاريخ" onChange={(e) => setNote(e.target.value)} />
      </label>
      {timed.length > 0 && (
        <div className="l">
          ملاحظات زمنية تُرفق بالطلب
          <div className="wk-radios">
            {timed.map((n) => (
              <label key={n.id}>
                <input type="checkbox" checked={pick.includes(n.id)} onChange={(e) => setPick(e.target.checked ? [...pick, n.id] : pick.filter((k) => k !== n.id))} />
                <span>
                  <b className="ltr">{n.timecode}</b> {n.body}
                  <small>{w.nameOf(n.author)}</small>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
      {err && <p className="wk-err">{err}</p>}
      <div className="wk-row-acts">
        <button type="button" className="wk-btn quiet" onClick={onClose}>
          تراجع
        </button>
        <button type="button" className="wk-btn primary" onClick={send}>
          إرسال طلب التعديل
        </button>
      </div>
    </Modal>
  );
}

export function RejectDialog({ d, onClose, act }: { d: WorkDetail; onClose: () => void; act: Act }) {
  const [reason, setReason] = useState('');
  const [close, setClose] = useState(true);
  const [err, setErr] = useState('');
  return (
    <Modal title="رفض العمل" onClose={onClose}>
      <Hint warn>الرفض يعني أن العمل لن يمضي لغرضه، لا أنه يحتاج تعديلاً. لطلب تعديل استخدم «طلب تعديل».</Hint>
      <label className="l">
        السبب <small>مطلوب</small>
        <textarea className="wk-inp" value={reason} maxLength={900} placeholder="مثلاً: أُلغي الإعلان" onChange={(e) => setReason(e.target.value)} />
      </label>
      <label className="wk-sw">
        <input type="checkbox" checked={close} onChange={(e) => setClose(e.target.checked)} />
        أغلق العمل أيضاً بالسبب نفسه
      </label>
      {err && <p className="wk-err">{err}</p>}
      <div className="wk-row-acts">
        <button type="button" className="wk-btn quiet" onClick={onClose}>
          تراجع
        </button>
        <button
          type="button"
          className="wk-btn danger"
          data-hold={HOLD.rejectWork}
          onClick={() => {
            if (!reason.trim()) return setErr('اكتب سبب الرفض.');
            void act('work_decide', { p_work: d.w.id, p_op: 'reject', p_parts: null, p_note: reason, p_close: close }, close ? 'رُفض العمل وأُغلق.' : 'رُفض العمل.').then((ok) => ok && onClose());
          }}
        >
          <Ic i={X} />
          تأكيد الرفض
        </button>
      </div>
    </Modal>
  );
}

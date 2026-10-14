'use client';
// «إنشاء» on real data, after «النموذج المرجعي للمركز» version 5: the type sets the fields
// and the stages; each stage goes to the least busy person in its role, dated backwards
// from the due date; everything can be changed before saving. A member sends a request
// without an owner. The work number is issued by the database (work_create), so two
// people never get the same one. Opened from mail as /create?mail=<thread>, it links
// the work to that conversation; /create?type=<type> opens on that type.
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowRight, ChartGantt, FileText, Film, Flag, Image as ImageIcon, Lock, Mail, Play, Plus, Send, Users, WandSparkles, X } from 'lucide-react';
import { roles } from '@/lib/domain';
import { supabase } from '@/lib/supabase/client';
import {
  PUBLISHABLE_TYPES,
  TYPE_PLANS,
  autoPick,
  backSchedule,
  isLead,
  planIssues,
  planPayload,
  platformLabels,
  priorityLabels,
  projectTypeLabels,
  riyadhInstant,
  sourceLabels,
  textLabels,
  typeLabels,
  youtubeOk,
  type Priority,
  type WorkType,
} from '@/lib/work/rules';
import { useWork, type LibraryFile } from './data';
import { Av, Empty, Hint, Ic, LibraryPicker, Modal, TYPE_HINT, TYPE_ICON } from './parts';
import { PlanEditor, PlanRows, keyed, staffOf, type EditRow } from './plan';
import { ProjectDialog } from './projects';

type FromMail = { id: string; subject: string; from: string; body: string; req: number | null; external: boolean; assignee: string | null };
type Draft = {
  type: WorkType | null;
  title: string;
  brief: string;
  main: string;
  source: string;
  requester: string;
  assignee: string;
  people: string[];
  priority: Priority;
  due: string;
  projects: string[];
  channels: string[];
  assets: LibraryFile[];
  restricted: boolean;
  extra1: string;
  extra2: string;
  plan: { type: WorkType; due: string; edited: boolean; rows: EditRow[] } | null;
};

export function CreatePage() {
  const w = useWork();
  const router = useRouter();
  const member = w.role === 'member';
  const lead = isLead(w.role);
  const maker = ['writer', 'designer', 'producer'].includes(w.role);
  const blank = (): Draft => ({
    type: null, title: '', brief: '', main: '', source: member ? 'member' : 'plan', requester: '', assignee: !lead && maker ? w.me : '',
    people: [], priority: 'normal', due: '', projects: [], channels: [], assets: [], restricted: false, extra1: '', extra2: '', plan: null,
  });
  const fresh = (type: WorkType, due: string) => {
    const P = TYPE_PLANS[type];
    const dates = due ? backSchedule(P, due, w.today) : P.map(() => ({ start: '', due: '' }));
    return {
      type,
      due,
      edited: false,
      rows: keyed(
        P.map(([n, role, days, after], i) => {
          const a = autoPick(role, w.load);
          return { n, role, who: a.who, auto: !!a.who, why: a.why, start: dates[i].start, due: dates[i].due, after: [...after], days, gate: false, note: '' };
        }),
      ),
    };
  };
  const params = useSearchParams();
  const preType = params.get('type');
  // From the calendar (?due=) and the project page (?project=): the due date and the project.
  const dueParam = params.get('due') ?? '';
  const preDue = /^\d{4}-\d{2}-\d{2}$/.test(dueParam) && dueParam >= w.today ? dueParam : '';
  const preProject = params.get('project') ?? '';
  const [d, setD] = useState<Draft>(() => {
    const type = preType && preType in TYPE_PLANS ? (preType as WorkType) : null;
    return {
      ...blank(),
      type,
      due: preDue,
      projects: preProject && w.projects.some((p) => p.id === preProject) ? [preProject] : [],
      extra1: type === 'event' && preDue ? `${preDue}T09:00` : '',
      plan: type && !member ? fresh(type, preDue) : null,
    };
  });
  const [mail, setMail] = useState<FromMail | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  // Outside mail is turned into a work by its assignee or the leaders (mail_link_work); say so before saving.
  const mailBlocked = !!mail && mail.external && !['director', 'assistant', 'publisher', 'admin'].includes(w.role) && mail.assignee !== w.me;
  const [dlg, setDlg] = useState<'' | 'lib' | 'plan' | 'project'>('');
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  // From «الأفكار»: the text written there arrives through the session, not the address.
  useEffect(() => {
    if (params.get('idea') !== '1') return;
    try {
      const raw = window.sessionStorage.getItem('comms-hub:idea');
      window.sessionStorage.removeItem('comms-hub:idea');
      const idea = raw ? (JSON.parse(raw) as { title?: string; brief?: string }) : null;
      if (idea) setD((x) => ({ ...x, title: x.title || String(idea.title ?? '').slice(0, 140), brief: x.brief || String(idea.brief ?? '').slice(0, 4000) }));
    } catch {
      // Storage unavailable: the page opens blank, which is still correct.
    }
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // From mail: the conversation's subject, sender and first lines.
  useEffect(() => {
    const id = params.get('mail');
    if (!id) return;
    void (async () => {
      const db = supabase();
      const [t, m] = await Promise.all([
        db.from('mail_threads').select('id,subject,kind,req_no,assignee').eq('id', id).maybeSingle(),
        db.from('mail_messages').select('from_name,from_email,author,body').eq('thread_id', id).eq('kind', 'mail').order('created_at').limit(1),
      ]);
      if (!t.data) return;
      const first = (m.data ?? [])[0] as { from_name: string | null; from_email: string | null; author: string | null; body: string } | undefined;
      const from = first?.from_name || first?.from_email || (first?.author ? w.nameOf(first.author) : '');
      const body = (first?.body ?? '').split('\n').filter(Boolean).slice(0, 6).join('\n');
      setMail({ id, subject: t.data.subject, from, body, req: t.data.req_no, external: t.data.kind === 'external', assignee: t.data.assignee });
      setD((x) => ({
        ...x,
        title: x.title || t.data!.subject.replace(/^طلب /, ''),
        brief: x.brief || body,
        requester: x.requester || from,
        source: member ? 'member' : t.data!.kind === 'external' ? 'external' : 'dept',
      }));
    })();
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The plan follows the type and the due date until it is edited by hand.
  useEffect(() => {
    if (!d.type || member) return;
    if (d.plan && d.plan.type === d.type && (d.plan.edited || d.plan.due === d.due)) return;
    setD((x) => (x.type ? { ...x, plan: fresh(x.type, x.due) } : x));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.type, d.due, w.load, member]);

  if (!roles[w.role].create)
    return (
      <div className="wk">
        <Empty i={Lock} title="إنشاء العمل غير متاح لدورك">
          مسؤول النشر يستلم الأعمال المعتمدة للجدولة، ولا ينشئ عملاً جديداً.
        </Empty>
      </div>
    );

  const head = (
    <div className="wk-head">
      <div>
        <h1>{member ? 'طلب جديد' : 'إنشاء عمل'}</h1>
        <p>{member ? 'اكتب ما تحتاجه من القسم. يصل طلبك إلى مدير الاتصال ومساعده ليُسنداه.' : 'ماذا ننشئ؟ النوع يحدد الحقول ومراحل العمل.'}</p>
      </div>
      {d.type && (
        <div className="wk-acts">
          <button type="button" className="wk-btn" onClick={() => set({ type: null, plan: null })}>
            <Ic i={ArrowRight} />
            تغيير النوع
          </button>
        </div>
      )}
    </div>
  );

  if (!d.type)
    return (
      <div className="wk">
        {head}
        <div className="wk-tchoose">
          {(Object.keys(TYPE_PLANS) as WorkType[]).map((k) => (
            <button type="button" className="wk-tcard" key={k} onClick={() => set({ type: k })}>
              <span className="ci">
                <Ic i={TYPE_ICON[k]} />
              </span>
              <b>{typeLabels[k]}</b>
              <span>{TYPE_HINT[k]}</span>
              <small>المراحل: {TYPE_PLANS[k].map((s) => s[0]).join('، ')}</small>
            </button>
          ))}
          {lead && (
            <button type="button" className="wk-tcard proj" onClick={() => setDlg('project')}>
              <span className="ci">
                <Ic i={Flag} />
              </span>
              <b>مشروع</b>
              <span>حملة أو فعالية أو مبادرة تمتد أسابيع، تُربط بها الأعمال.</span>
              <small>الحملة نوع من المشاريع. مع خطة أعمال اختيارية تُسند وتُحسب مواعيدها.</small>
            </button>
          )}
        </div>
        {mail ? (
          <div className="wk-fromref">
            <span className="li">
              <Ic i={Mail} />
            </span>
            <div>
              <b>من البريد: {mail.subject}</b>
              <span>اختر النوع، فتُملأ الصفحة من الرسالة ويُربط العمل بها.</span>
            </div>
          </div>
        ) : (
          <Hint i={Mail}>طلب وصل بالبريد؟ افتح الرسالة واضغط «تحويل إلى عمل»، فتُفتح هذه الصفحة بالبيانات والرابط إلى الرسالة.</Hint>
        )}
        {dlg === 'project' && (
          <ProjectDialog
            onClose={() => setDlg('')}
            onSaved={async (id, n) => {
              setDlg('');
              router.push(`/projects/${id}${n ? '?tab=people' : ''}`);
            }}
          />
        )}
      </div>
    );

  const type = d.type;
  const pub = PUBLISHABLE_TYPES.includes(type);
  const mailBlockText = `هذه رسالة خارجية ${mail?.assignee ? `مسندة إلى ${w.nameOf(mail.assignee)}` : 'لم تُسند بعد'}: تحويلها إلى عمل مربوط بها لمسؤولها أو لمدير الاتصال ومساعده. احفظ العمل بلا ربط بالرسالة، أو اطلب الإسناد من البريد.`;
  const isReq = member || !d.assignee;
  const usable = w.accounts.filter((a) => a.active && a.platform !== 'mail');
  const staff = staffOf(w.people);

  const submit = async (mode: 'draft' | 'start' | 'request') => {
    const errs: string[] = [];
    if (!d.title.trim()) errs.push('اكتب عنواناً للعمل.');
    if (!d.due) errs.push(member ? 'اختر متى تحتاجه.' : 'اختر موعد التسليم النهائي.');
    else if (d.due < w.today) errs.push('موعد التسليم قبل اليوم. اختر تاريخاً من اليوم فصاعداً.');
    if (type === 'post' && !member && !d.channels.length) errs.push('اختر حساباً واحداً على الأقل.');
    if (pub && !member && !youtubeOk(type, usable.filter((a) => d.channels.includes(a.id)).map((a) => a.platform), d.assets.map((a) => a.kind)))
      errs.push('يوتيوب يقبل الفيديو فقط: أضف فيديو من المكتبة أو أزل حساب يوتيوب.');
    if (type === 'event' && d.extra1 && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(d.extra1)) errs.push('اختر يوم الحدث ووقته.');
    if (mailBlocked) errs.push(mailBlockText);
    const plan = !member && d.plan ? d.plan.rows : null;
    if (plan && !isReq) planIssues(plan, d.due || undefined).errs.forEach((e) => errs.push(e.text));
    setErrors(errs);
    if (errs.length) return window.scrollTo({ top: 0, behavior: 'smooth' });
    const extras =
      type === 'video' && (d.extra1 || d.extra2)
        ? `المدة التقريبية: ${d.extra1 || '—'} · المقاس: ${d.extra2 || 'أفقي 16:9'}`
        : type === 'design' && d.extra1
          ? `المقاسات المطلوبة: ${d.extra1}`
          : type === 'email' && d.extra1
            ? `المستلمون: ${d.extra1}`
            : '';
    const rows = plan ?? TYPE_PLANS[type].map(([n, role, days, after]) => ({ n, role, who: '', start: '', due: '', after: [...after], days, gate: false, note: '' }));
    setBusy(true);
    const r = await w.call<string>('work_create', {
      p: {
        type,
        title: d.title.trim(),
        brief: [d.brief.trim(), extras].filter(Boolean).join('\n'),
        priority: d.priority,
        restricted: lead && d.restricted,
        source: d.source,
        requester: d.requester.trim(),
        due: d.due,
        assignee: member ? null : d.assignee || null,
        people: member ? [] : d.people.filter((p) => p !== d.assignee),
        projects: d.projects,
        channels: pub && !member ? d.channels : [],
        assets: d.assets.map((a) => a.id),
        main: d.main,
        stages: planPayload(rows),
        event_at: type === 'event' && d.extra1 ? riyadhInstant(d.extra1) : null,
        place: type === 'event' ? d.extra2 : null,
        mail_thread: mail?.id ?? null,
        start: mode === 'start',
      },
    });
    setBusy(false);
    if (!r.ok) return setErrors([r.error]);
    w.say(isReq ? `أُرسل الطلب ${r.data}. يصل إلى مدير الاتصال ومساعده.` : `أُنشئ العمل ${r.data}${d.assignee && d.assignee !== w.me ? ` وأُبلغ ${w.nameOf(d.assignee)}` : ''}.`);
    await w.reloadBase();
    router.push(`/work/${r.data}`);
  };

  const accountPick = (label: string) => (
    <div className="wk-lab">
      {label}
      <small>الحساب بعينه، وقد يكون للمنصة أكثر من حساب. يُثبَّت عند الإرسال للمراجعة</small>
      {usable.length ? (
        <div className="wk-pick">
          {usable.map((a) => (
            <label key={a.id}>
              <input type="checkbox" checked={d.channels.includes(a.id)} onChange={(e) => set({ channels: e.target.checked ? [...d.channels, a.id] : d.channels.filter((c) => c !== a.id) })} />
              {platformLabels[a.platform]} · {a.label}
              {a.platform === 'youtube' && <small> فيديو فقط</small>}
            </label>
          ))}
        </div>
      ) : (
        <Hint warn>لا توجد حسابات مرتبطة بعد. تُضاف من «الحسابات المرتبطة» حين تُبنى؛ وحتى ذلك يُحفظ العمل بلا حسابات{type === 'post' ? '، والمنشور الاجتماعي يحتاج حساباً واحداً على الأقل' : ''}.</Hint>
      )}
    </div>
  );

  return (
    <div className="wk">
      {head}
      <div className="wk-cgrid">
        <form
          className="wk-cform"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          {errors.length > 0 && (
            <div className="wk-err" role="alert">
              <b>لا يمكن الحفظ بعد:</b>
              <ul>
                {errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {mail && (
            <div className="wk-fromref">
              <span className="li">
                <Ic i={Mail} />
              </span>
              <div>
                <b>من البريد: {mail.subject}</b>
                <span>
                  {mail.from}
                  {mail.req ? ` · طلب خارجي #${mail.req}` : ''}
                </span>
                {mail.body && <p>{mail.body}</p>}
              </div>
            </div>
          )}
          {mailBlocked && (
            <Hint warn>
              {mailBlockText}{' '}
              <button type="button" className="wk-lk" onClick={() => setMail(null)}>
                إنشاء بلا ربط بالرسالة
              </button>
            </Hint>
          )}

          <section className="wk-fs" data-gd="basics">
            <h3>
              <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                <Ic i={TYPE_ICON[type]} />
                {typeLabels[type]}
              </span>
              <small>{TYPE_HINT[type]}</small>
            </h3>
            <label className="wk-lab">
              <span>
                العنوان <span className="req">*</span>
              </span>
              <input className="wk-inp" value={d.title} maxLength={140} placeholder="اسم قصير يعرفه الفريق" onChange={(e) => set({ title: e.target.value })} />
            </label>
            <label className="wk-lab">
              {member ? 'ماذا تحتاج؟' : 'الوصف'}
              <textarea
                className="wk-inp"
                rows={3}
                value={d.brief}
                maxLength={4000}
                placeholder={member ? 'الحدث أو المحتوى، ولمن، ومتى تحتاجه' : 'ما المطلوب وما يجب أن يعرفه الفريق'}
                onChange={(e) => set({ brief: e.target.value })}
              />
            </label>
            {type === 'video' && (
              <div className="wk-two">
                <label className="wk-lab">
                  المدة التقريبية
                  <input className="wk-inp" value={d.extra1} placeholder="مثلاً 90 ثانية" onChange={(e) => set({ extra1: e.target.value })} />
                </label>
                <label className="wk-lab">
                  المقاس
                  <select className="wk-inp" value={d.extra2 || 'أفقي 16:9'} onChange={(e) => set({ extra2: e.target.value })}>
                    {['أفقي 16:9', 'عمودي 9:16', 'مربع 1:1'].map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {type === 'design' && (
              <label className="wk-lab">
                المقاسات المطلوبة
                <input className="wk-inp" value={d.extra1} placeholder="مثلاً 1080 × 1350 لإنستغرام، 1200 × 627 للينكدإن" onChange={(e) => set({ extra1: e.target.value })} />
              </label>
            )}
            {type === 'event' && (
              <div className="wk-two">
                <label className="wk-lab">
                  يوم الحدث ووقته
                  <input className="wk-inp" type="datetime-local" value={d.extra1} onChange={(e) => set({ extra1: e.target.value })} />
                </label>
                <label className="wk-lab">
                  المكان
                  <input className="wk-inp" value={d.extra2} maxLength={120} placeholder="مثلاً قاعة المؤتمرات الرئيسية" onChange={(e) => set({ extra2: e.target.value })} />
                </label>
              </div>
            )}
            {type === 'email' && (
              <label className="wk-lab">
                المستلمون
                <input className="wk-inp" value={d.extra1} placeholder="مجموعة أو عناوين، تُرسل من صفحة البريد" onChange={(e) => set({ extra1: e.target.value })} />
              </label>
            )}
            {(type === 'post' || type === 'press' || type === 'email' || type === 'announce') && (
              <label className="wk-lab">
                {textLabels[type]}
                <small>{type === 'post' ? 'تُكتب نسخ المنصات بعد الإنشاء، وتُنبَّه إذا تغيّر النص الأساسي بعدها' : 'اختياري الآن، ويمكن كتابته من صفحة العمل'}</small>
                <textarea className="wk-inp" rows={4} value={d.main} maxLength={8000} onChange={(e) => set({ main: e.target.value })} />
              </label>
            )}
            {pub && !member && accountPick(type === 'post' ? 'الحسابات' : 'أين يُنشر؟')}
            {(type === 'press' || type === 'email') && <Hint i={Mail}>يُرسل بعد اعتماده من صندوق القسم المشترك، ويُعتمد حزمة كاملة.</Hint>}
          </section>

          <section className="wk-fs" data-gd="whowhy">
            <h3>لمن ولماذا</h3>
            <div className="wk-lab">
              المشاريع
              <small>يمكن ربط العمل بأكثر من مشروع، أو تركه بلا مشروع. الحملة نوع من المشاريع</small>
              {w.projects.length ? (
                <div className="wk-pick">
                  {w.projects.map((p) => (
                    <label key={p.id}>
                      <input type="checkbox" checked={d.projects.includes(p.id)} onChange={(e) => set({ projects: e.target.checked ? [...d.projects, p.id] : d.projects.filter((x) => x !== p.id) })} />
                      {p.name}
                    </label>
                  ))}
                </div>
              ) : (
                <small>لا مشاريع بعد{lead ? '. أنشئ مشروعاً من بطاقة «مشروع» في أول هذه الصفحة' : ''}.</small>
              )}
            </div>
            <div className="wk-two">
              <label className="wk-lab">
                مصدر الطلب
                <select className="wk-inp" value={d.source} onChange={(e) => set({ source: e.target.value })}>
                  {Object.keys(sourceLabels)
                    .filter((k) => (member ? k === 'member' || k === 'dept' : k !== 'member'))
                    .map((k) => (
                      <option key={k} value={k}>
                        {sourceLabels[k]}
                      </option>
                    ))}
                </select>
              </label>
              <label className="wk-lab">
                الجهة الطالبة <small>اختياري</small>
                <input className="wk-inp" value={d.requester} maxLength={120} placeholder="مثلاً إدارة الفعاليات" onChange={(e) => set({ requester: e.target.value })} />
              </label>
            </div>
          </section>

          <section className="wk-fs" data-gd="when">
            <h3>من ومتى</h3>
            {member ? (
              <Hint i={Users}>يحدد مدير الاتصال أو مساعده المسؤول عن طلبك، ويصلك إشعار عند الإسناد وعند كل تغيير في حالته.</Hint>
            ) : lead ? (
              <label className="wk-lab">
                المسؤول <small>الحمل الحالي بجانب كل اسم</small>
                <select className="wk-inp" value={d.assignee} onChange={(e) => set({ assignee: e.target.value })}>
                  <option value="">بلا مسؤول الآن (يبقى طلباً)</option>
                  {staff.map((p) => {
                    const l = w.load.find((r) => r.email === p.email);
                    return (
                      <option key={p.email} value={p.email}>
                        {p.display_name} · {roles[p.role].name} · {l?.active_works ?? 0} نشطة{l?.late_works ? ` · ${l.late_works} متأخر` : ''}
                      </option>
                    );
                  })}
                </select>
              </label>
            ) : (
              <div className="wk-radios" role="radiogroup" aria-label="المسؤول">
                <label>
                  <input type="radio" name="c-asg" checked={d.assignee === w.me} onChange={() => set({ assignee: w.me })} />
                  <span>
                    أنا المسؤول<small>يبدأ العمل باسمك، ويراه القادة في حملك.</small>
                  </span>
                </label>
                <label>
                  <input type="radio" name="c-asg" checked={!d.assignee} onChange={() => set({ assignee: '' })} />
                  <span>
                    اتركه للقادة<small>يصبح طلباً يسنده مدير الاتصال أو مساعده.</small>
                  </span>
                </label>
              </div>
            )}
            {!member && (
              <div className="wk-lab">
                المشاركون <small>يضيفون الوسائط ويُنهون مراحلهم ويعلّقون</small>
                <div className="wk-pick">
                  {staff
                    .filter((p) => p.email !== w.me)
                    .map((p) => (
                      <label key={p.email}>
                        <input type="checkbox" checked={d.people.includes(p.email)} onChange={(e) => set({ people: e.target.checked ? [...d.people, p.email] : d.people.filter((x) => x !== p.email) })} />
                        {p.display_name}
                      </label>
                    ))}
                </div>
              </div>
            )}
            <div className="wk-two">
              <label className="wk-lab">
                <span>
                  {member ? 'متى تحتاجه؟' : 'موعد التسليم النهائي'} <span className="req">*</span>
                </span>
                <input className="wk-inp" type="date" min={w.today} value={d.due} onChange={(e) => set({ due: e.target.value })} />
              </label>
              <div className="wk-lab">
                الأولوية
                <div className="wk-pick" role="radiogroup" aria-label="الأولوية">
                  {(Object.keys(priorityLabels) as Priority[]).map((k) => (
                    <label key={k}>
                      <input type="radio" name="c-prio" checked={d.priority === k} onChange={() => set({ priority: k })} />
                      {priorityLabels[k]}
                    </label>
                  ))}
                </div>
                <small>العاجل يتقدم في القوائم ويُنبَّه المسؤول، والاعتماد يبقى لمدير الاتصال ومساعده.</small>
              </div>
            </div>
            {!member && d.plan && (
              <div className="wk-lab" data-gd="plan">
                خطة المراحل
                <small>
                  {d.plan.edited
                    ? 'عدّلتها بنفسك، فلا تُحسب من جديد إذا غيّرت التسليم. «إعادة التوزيع والحساب» يعيدها إلى قالب النوع.'
                    : d.due
                      ? 'مُسندة تلقائياً للأقل حملاً في كل دور، ومحسوبة رجوعاً من التسليم. غيّر ما تشاء، واسحب المقبض لتغيير الترتيب.'
                      : 'اختر موعد التسليم النهائي فتُحسب المواعيد رجوعاً منه.'}
                  {isReq ? ' العمل بلا مسؤول طلب: تبقى أسماء المراحل وترتيبها، ويُسند القادة الأشخاص والمواعيد.' : ''}
                </small>
                <PlanRows
                  compact
                  rows={d.plan.rows}
                  onChange={(rows, notice) => {
                    setD((x) => (x.plan ? { ...x, plan: { ...x.plan, rows: keyed(rows), edited: true } } : x));
                    if (notice) w.say(notice);
                  }}
                />
                <div className="wk-row-acts start">
                  <button type="button" className="wk-btn sm" onClick={() => setDlg('plan')}>
                    <Ic i={ChartGantt} />
                    فتح محرر الخطة (المحرر الحر)
                  </button>
                  <button
                    type="button"
                    className="wk-btn sm"
                    onClick={() => {
                      set({ plan: fresh(type, d.due) });
                      w.say('أُعيد توزيع المراحل على الأقل حملاً، وحُسبت المواعيد من التسليم.');
                    }}
                  >
                    <Ic i={WandSparkles} />
                    إعادة التوزيع والحساب
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="wk-fs" data-gd="cmedia">
            <h3>
              الوسائط<small>من مكتبة الوسائط، والرفع الجديد يذهب إلى Google Drive عبر المكتبة</small>
            </h3>
            {d.assets.length > 0 && (
              <div className="wk-alist">
                {d.assets.map((a) => (
                  <div className="wk-arow" key={a.id}>
                    <span className="th">
                      <Ic i={a.kind === 'video' ? Film : a.kind === 'image' ? ImageIcon : FileText} />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <b>{a.name}</b>
                      <small>الإصدار {a.current_version}</small>
                    </span>
                    <span />
                    <button type="button" className="wk-btn sm quiet" aria-label={`إزالة «${a.name}»`} onClick={() => set({ assets: d.assets.filter((x) => x.id !== a.id) })}>
                      <Ic i={X} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div>
              <button type="button" className="wk-btn sm" onClick={() => setDlg('lib')}>
                <Ic i={Plus} />
                اختر من المكتبة
              </button>
            </div>
          </section>

          {lead && (
            <section className="wk-fs" data-gd="vis">
              <h3>الرؤية</h3>
              <label className="wk-sw">
                <input type="checkbox" checked={d.restricted} onChange={(e) => set({ restricted: e.target.checked })} />
                عمل مقيّد: لا يراه إلا المسؤول والمشاركون ومدير الاتصال ومساعده ومن طلبه
              </label>
            </section>
          )}

          <div className="wk-cbar">
            <span className="l">{isReq ? 'يُرسل طلباً بلا مسؤول.' : 'يُحفظ باسمك، ويصل إشعار إلى المسؤول وأصحاب المراحل.'}</span>
            <button type="button" className="wk-btn quiet" onClick={() => router.push('/work')}>
              إلغاء
            </button>
            {isReq ? (
              <button type="button" className="wk-btn gold" disabled={busy} onClick={() => void submit('request')}>
                <Ic i={Send} />
                إرسال الطلب
              </button>
            ) : (
              <>
                <button type="button" className="wk-btn" disabled={busy} onClick={() => void submit('draft')}>
                  حفظ مسودة
                </button>
                <button type="button" className="wk-btn gold" disabled={busy} onClick={() => void submit('start')}>
                  <Ic i={Play} />
                  إنشاء وبدء الإنتاج
                </button>
              </>
            )}
          </div>
        </form>

        <aside className="wk-csum">
          <section className="wk-pn">
            <h3>بعد الحفظ</h3>
            <ul>
              <li>يصدر المركز رقم العمل، فلا يتكرر رقم بين شخصين.</li>
              {isReq ? (
                <>
                  <li>يظهر في «الطلبات» لدى مدير الاتصال ومساعده، ويصلهما إشعار.</li>
                  <li>تجده في «{member ? 'طلباتي' : 'مهامي'}» وتتابع حالته.</li>
                </>
              ) : (
                <>
                  <li>يظهر في حمل المسؤول في «الفريق» وفي «مهامي» لديه.</li>
                  <li>المراحل تبدأ من «{d.plan?.rows[0]?.n ?? TYPE_PLANS[type][0][0]}».</li>
                </>
              )}
              {mail && <li>يُربط برسالة البريد، ويظهر رقمه في المحادثة لكل من يراها.</li>}
              <li>{d.restricted ? 'مقيّد: يراه المعنيون والقادة فقط.' : 'يراه كل القسم في صفحة العمل.'}</li>
            </ul>
          </section>
          {lead && (
            <section className="wk-pn">
              <h3>حمل الفريق الآن</h3>
              <div className="wk-team">
                {w.load
                  .filter((l) => l.role !== 'member' && l.role !== 'director')
                  .sort((a, b) => a.active_works - b.active_works)
                  .slice(0, 5)
                  .map((l) => (
                    <div className="wk-mem" key={l.email}>
                      <Av name={l.display_name} />
                      <span>
                        <b>{l.display_name}</b>
                        <small>{roles[l.role].name}</small>
                      </span>
                      <span className="cnt">
                        {l.active_works} نشطة{l.late_works ? <span className="late"> · {l.late_works} متأخر</span> : null}
                      </span>
                    </div>
                  ))}
              </div>
              <p className="wk-col-hint">الأقل حملاً أولاً.</p>
            </section>
          )}
        </aside>
      </div>

      {dlg === 'lib' && (
        <LibraryPicker
          have={d.assets.map((a) => a.id)}
          onClose={() => setDlg('')}
          onPick={(f) => {
            set({ assets: [...d.assets, f] });
            setDlg('');
          }}
        />
      )}
      {dlg === 'plan' && d.plan && (
        <PlanEditor
          title={d.title || typeLabels[type]}
          type={type}
          due={d.due}
          initial={d.plan.rows}
          onClose={() => setDlg('')}
          onSave={async (rows) => {
            setD((x) => (x.plan ? { ...x, plan: { ...x.plan, rows: keyed(rows), edited: true } } : x));
            setDlg('');
            w.say('حُفظت خطة المراحل في العمل الجديد. تُنشأ مع العمل عند الحفظ.');
            return null;
          }}
        />
      )}
    </div>
  );
}

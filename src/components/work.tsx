'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  campaign,
  dueNote,
  isOverdue,
  matchesDue,
  roles,
  assets,
  channels,
  statusLabels,
  canEdit,
  pickContent,
  type Content,
  type Role,
  type Channel,
  type Work,
} from '@/lib/domain';
import { useHub } from '@/lib/store';
import { ReleaseHistory } from './release-history';
import { Title, Panel, StatusChip, Empty, MediaPreview, Tabs } from './ui';

export function WorkRow({ work: w }: { work: Work }) {
  const { state } = useHub();
  const owning = state.campaigns.find((c) => c.id === w.campaignId) || campaign;
  return (
    <Link href={`/work/${w.id}`} className="work-row">
      <span className="work-name">
        <b>{w.title}</b>
        <small>
          {w.id} · {owning.title}
          {dueNote(w) && (
            <>
              {' · '}
              <span className={isOverdue(w) ? 'due-note late' : 'due-note soon'}>{dueNote(w)}</span>
            </>
          )}
        </small>
      </span>
      <span className="owner">{roles[w.owner].user}</span>
      <StatusChip status={w.status} />
      <time>{w.due}</time>
    </Link>
  );
}

export function WorkList() {
  const { state } = useHub();
  const params = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  // Home's overdue and due-soon counts open this page with ?due= (task 0.2.3.5).
  const [due, setDue] = useState(params.get('due') || '');
  const dueParam = params.get('due') || '';
  useEffect(() => setDue(dueParam), [dueParam]);
  const [owner, setOwner] = useState('');
  const [mine, setMine] = useState(false);
  const [board, setBoard] = useState(false);

  const filtered = state.work.filter(
    (w) =>
      (!mine || w.owner === state.role) &&
      (!status || w.status === status) &&
      (!owner || w.owner === owner) &&
      matchesDue(w, due) &&
      w.title.includes(search),
  );

  return (
    <>
      <Title title="العمل" sub="كل ما نصنعه لليوم الوطني، في مكان واحد.">
        {roles[state.role].create && (
          <Link className="button primary" href="/create">
            مهمة جديدة +
          </Link>
        )}
      </Title>
      <div className="tabs">
        <button className={!mine ? 'active' : ''} onClick={() => setMine(false)}>
          الكل
        </button>
        <button className={mine ? 'active' : ''} onClick={() => setMine(true)}>
          مهامي
        </button>
      </div>
      <div className="filters">
        <input
          aria-label="ابحث في العمل"
          placeholder="ابحث في العمل…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select aria-label="حالة العمل" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">كل الحالات</option>
          {Object.entries(statusLabels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select aria-label="موعد التسليم" value={due} onChange={(e) => setDue(e.target.value)}>
          <option value="">كل المواعيد</option>
          <option value="overdue">متأخر</option>
          <option value="soon">قريب الموعد</option>
        </select>
        <select aria-label="المسؤول" value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">كل المسؤولين</option>
          {Object.entries(roles).map(([k, v]) => (
            <option key={k} value={k}>
              {v.user}
            </option>
          ))}
        </select>
        <button onClick={() => setBoard(!board)}>{board ? 'عرض القائمة' : 'عرض اللوحة'}</button>
      </div>
      {!filtered.length ? (
        <Panel>
          <Empty>غيّر البحث أو المرشحات، أو أنشئ عملاً جديداً.</Empty>
        </Panel>
      ) : board ? (
        <div className="board">
          {Object.entries(statusLabels)
            .filter(([s]) => filtered.some((w) => w.status === s))
            .map(([s, label]) => (
              <Panel title={label} key={s}>
                {filtered
                  .filter((w) => w.status === s)
                  .map((w) => (
                    <WorkRow key={w.id} work={w} />
                  ))}
              </Panel>
            ))}
        </div>
      ) : (
        <Panel>
          <div className="table-head">
            <span>العمل / الحملة</span>
            <span>المسؤول</span>
            <span>الحالة</span>
            <span>التسليم</span>
          </div>
          {filtered.map((w) => (
            <WorkRow key={w.id} work={w} />
          ))}
        </Panel>
      )}
    </>
  );
}

/**
 * Campaign inception step (MVP_draft.md section 51). The provisional department
 * flow starts with leadership creating the campaign, before any work item
 * exists, so the Create page exposes that step to reviewing roles only.
 */
function CampaignStep() {
  const { state, dispatch } = useHub();
  const actor = roles[state.role];
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(campaign.date);
  const [description, setDescription] = useState('');

  if (!actor.review || !actor.create) return null;

  return (
    <Panel title="الخطوة الأولى · الحملة">
      <p className="muted">
        يبدأ سير العمل بإنشاء الحملة، ثم إنشاء الأعمال وإسنادها إلى المختصين. الحملات المتاحة:{' '}
        {state.campaigns.map((c) => c.title).join('، ')}.
      </p>
      {open ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            dispatch({ type: 'campaign', title, date, description });
            setTitle('');
            setDescription('');
            setOpen(false);
          }}
        >
          <label>
            اسم الحملة
            <input required value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div className="field-pair">
            <label>
              تاريخ الحملة
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label>
              وصف مختصر
              <input value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
          </div>
          <div className="actions">
            <button className="primary" type="submit">
              إنشاء الحملة
            </button>
            <button type="button" className="secondary" onClick={() => setOpen(false)}>
              إلغاء
            </button>
          </div>
        </form>
      ) : (
        <div className="actions">
          <button type="button" onClick={() => setOpen(true)}>
            إنشاء حملة جديدة +
          </button>
        </div>
      )}
    </Panel>
  );
}

export function Composer({ work }: { work?: Work }) {
  const { state, dispatch } = useHub();
  const router = useRouter();
  const actor = roles[state.role];
  const [data, setData] = useState<Content>(
    work
      ? pickContent(work)
      : {
          title: '',
          body: '',
          type: 'منشور اجتماعي',
          owner: actor.create ? state.role : 'writer',
          due: '2026-09-22',
          channels: ['Instagram', 'X'],
          assetId: 'poster',
          assetVersion: 5,
          variants: { Instagram: '', X: '', LinkedIn: '' },
          campaignId: campaign.id,
        },
  );
  const [variant, setVariant] = useState('master');
  const [error, setError] = useState('');
  const asset = assets.find((a) => a.id === data.assetId)!;

  const change = <K extends keyof Content>(key: K, value: Content[K]) => setData({ ...data, [key]: value });

  const save = (submit: boolean) => {
    if (!data.title.trim() || !data.body.trim() || !data.channels.length) {
      setError('أكمل العنوان والمحتوى واختر قناة واحدة على الأقل.');
      return;
    }
    if (work) {
      dispatch({ type: 'edit', id: work.id, content: data });
      router.push(`/work/${work.id}`);
    } else {
      dispatch({ type: 'create', content: data, submit });
      router.push('/work');
    }
  };

  if (!actor.create || (work && !canEdit(state.role, work)))
    return (
      <Panel>
        <Empty>هذا الدور لا يحرر هذا العمل. استخدم عرض بصفة لمحاكاة المسؤول.</Empty>
      </Panel>
    );

  return (
    <>
      <Title
        title={work ? 'تحرير العمل' : 'مساحة الإنشاء'}
        sub={
          work
            ? 'حفظ محتوى جديد ينشئ إصداراً جديداً ويستلزم إعادة المراجعة.'
            : 'محتوى مرتبط بالحملة، جاهز للمراجعة.'
        }
      />
      {!work && <CampaignStep />}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(false);
        }}
      >
        <div className="compose">
          <Panel title="تفاصيل المحتوى">
            <label>
              نوع المحتوى
              <select value={data.type} onChange={(e) => change('type', e.target.value)}>
                {['منشور اجتماعي', 'فيديو', 'تصميم', 'إعلان', 'بريد', 'بيان صحفي', 'تغطية حدث'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              عنوان العمل
              <input required value={data.title} onChange={(e) => change('title', e.target.value)} />
            </label>
            <label>
              الحملة
              <select value={data.campaignId} onChange={(e) => change('campaignId', e.target.value)}>
                {state.campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="field-pair">
              <label>
                المسؤول
                <select value={data.owner} onChange={(e) => change('owner', e.target.value as Role)}>
                  {Object.entries(roles)
                    .filter(([, v]) => v.create)
                    .map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.user} · {v.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                التسليم
                <input type="date" required value={data.due} onChange={(e) => change('due', e.target.value)} />
              </label>
            </div>
            <Tabs
              value={variant}
              onChange={setVariant}
              items={[{ id: 'master', label: 'النص الأساسي' }, ...channels.map((c) => ({ id: c, label: c }))]}
            />
            <label>
              {variant === 'master' ? 'المحتوى الأساسي' : `صياغة ${variant}`}
              <textarea
                aria-label={variant === 'master' ? 'المحتوى الأساسي' : `صياغة ${variant}`}
                rows={6}
                required={variant === 'master'}
                value={variant === 'master' ? data.body : data.variants[variant as Channel]}
                onChange={(e) =>
                  variant === 'master'
                    ? change('body', e.target.value)
                    : change('variants', { ...data.variants, [variant]: e.target.value })
                }
                placeholder={variant === 'master' ? 'اكتب رسالة الحملة…' : 'اتركه فارغاً لاستخدام النص الأساسي'}
              />
            </label>
            <fieldset>
              <legend>قنوات النشر</legend>
              <div className="channels">
                {channels.map((c) => (
                  <label key={c}>
                    <input
                      type="checkbox"
                      checked={data.channels.includes(c)}
                      onChange={(e) =>
                        change(
                          'channels',
                          e.target.checked ? [...data.channels, c] : data.channels.filter((x) => x !== c),
                        )
                      }
                    />
                    {c}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="field-pair">
              <label>
                الوسيط
                <select
                  value={data.assetId}
                  onChange={(e) => {
                    const a = assets.find((x) => x.id === e.target.value)!;
                    setData({ ...data, assetId: a.id, assetVersion: a.versions.at(-1)! });
                  }}
                >
                  {assets.map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                إصدار الوسيط
                <select
                  value={data.assetVersion}
                  onChange={(e) => change('assetVersion', Number(e.target.value))}
                >
                  {asset.versions.map((v) => (
                    <option key={v} value={v}>
                      v{v}
                      {asset.approved === v ? ' · معتمد' : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {error && (
              <p role="alert" className="warning">
                {error}
              </p>
            )}
            <div className="actions">
              <button type="submit" className="primary">
                {work ? 'حفظ إصدار جديد' : 'حفظ مسودة'}
              </button>
              {!work && (
                <button type="button" onClick={() => save(true)}>
                  إرسال للمراجعة
                </button>
              )}
            </div>
          </Panel>
          <aside>
            <Panel title={`معاينة ${variant === 'master' ? data.channels[0] || 'المحتوى' : variant}`}>
              <MediaPreview assetId={data.assetId} version={data.assetVersion} large />
              <div className="preview-copy">
                <h2>{data.title || 'عنوان المحتوى'}</h2>
                <p>{variant === 'master' ? data.body : data.variants[variant as Channel] || data.body}</p>
              </div>
              <small>معاينة تقريبية. يُرسل النص والوسيط المحدد بإصداره مع طلب المراجعة.</small>
            </Panel>
          </aside>
        </div>
      </form>
    </>
  );
}

const checklistSteps = ['كتابة النص', 'التصوير / التصميم', 'الإعداد النهائي', 'التحقق قبل المراجعة'];

export function WorkDetail({ id }: { id: string }) {
  const { state, dispatch } = useHub();
  const [tab, setTab] = useState('overview');
  const [comment, setComment] = useState('');
  const w = state.work.find((x) => x.id === id);

  if (!w)
    return (
      <Panel>
        <Empty>
          لم نعثر على هذا العمل. <Link href="/work">العودة للعمل</Link>
        </Empty>
      </Panel>
    );

  const asset = assets.find((a) => a.id === w.assetId)!;
  const owning = state.campaigns.find((c) => c.id === w.campaignId) || campaign;

  return (
    <>
      <Title title={w.title} sub={`${w.id} · ${owning.title}`}>
        <StatusChip status={w.status} />
        {canEdit(state.role, w) && w.status !== 'PUBLISHING' && (
          <Link className="button" href={`/work/${w.id}/edit`}>
            تحرير
          </Link>
        )}
      </Title>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          ['overview', 'نظرة عامة'],
          ['files', 'الملفات'],
          ['comments', 'التعليقات'],
          ['activity', 'النشاط'],
          ['approval', 'الموافقة'],
        ].map(([id, label]) => ({ id, label }))}
      />
      <div className="columns wide-first">
        <div>
          {tab === 'overview' && (
            <Panel title={`معاينة العمل · الإصدار ${w.revision}`}>
              <MediaPreview assetId={w.assetId} version={w.assetVersion} large />
              <p className="body-copy">{w.body}</p>
              {w.channels.map((c) => (
                <div className="variant-copy" key={c}>
                  <b>{c}</b>
                  <p>{w.variants[c] || w.body}</p>
                </div>
              ))}
            </Panel>
          )}
          {tab === 'files' && (
            <Panel title="الوسائط المرتبطة">
              <MediaPreview assetId={w.assetId} version={w.assetVersion} large />
              <div className="between">
                <b>
                  {asset.title} · v{w.assetVersion}
                </b>
                <Link href={`/media/${asset.id}`} className="button">
                  الإصدارات والاستخدام
                </Link>
              </div>
              <small>{asset.filename} · نسخة تجريبية مرئية، لا يوجد رفع سحابي</small>
            </Panel>
          )}
          {tab === 'comments' && (
            <Panel title="حوار الفريق">
              {w.comments.length ? (
                w.comments.map((c, i) => (
                  <div className="comment" key={i}>
                    <b>{c.by}</b>
                    <p>{c.text}</p>
                  </div>
                ))
              ) : (
                <p className="muted">ابدأ نقاشاً حول هذا العمل.</p>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  dispatch({ type: 'comment', id: w.id, text: comment });
                  setComment('');
                }}
              >
                <label>
                  تعليق
                  <textarea required value={comment} onChange={(e) => setComment(e.target.value)} />
                </label>
                <button className="primary">إضافة تعليق</button>
              </form>
            </Panel>
          )}
          {tab === 'activity' && (
            <Panel title="سجل العمل">
              {w.activity.map((a, i) => (
                <div className="notice" key={i}>
                  {a}
                </div>
              ))}
            </Panel>
          )}
          {tab === 'approval' && (
            <Panel title="الإصدار والمراجعة">
              <p>
                {w.release
                  ? `الإصدار المرسل: ${w.release.revision} · أرسله ${roles[w.release.submittedBy].user}`
                  : 'لا يوجد إصدار مرسل حالياً.'}
              </p>
              {w.release?.approvedBy && (
                <p>
                  اعتمده {roles[w.release.approvedBy].user} · الإصدار {w.release.revision}
                </p>
              )}
              <p className="muted">
                تغيير المحتوى العام أو الوسيط ينشئ إصداراً جديداً ويلغي اعتماد الإصدار السابق. النشر الذي تم فعلاً
                يبقى مسجلاً ولا يُمحى بالتعديل.
              </p>
              {w.publications.length > 0 && (
                <section className="release-history" aria-label="سجل النشر">
                  <h3>سجل النشر</h3>
                  {w.publications.map((p, i) => (
                    <div className="notice" key={i}>
                      <b>
                        الإصدار {p.revision} · {statusLabels[p.outcome]}
                      </b>
                      <small>
                        {p.channels
                          .map((c) => `${c}: ${p.results[c] === 'SUCCESS' ? 'نُشر' : 'فشل'}`)
                          .join(' · ')}
                        {p.scheduled ? ` · ${p.scheduled.replace('T', ' · ')}` : ''}
                      </small>
                    </div>
                  ))}
                </section>
              )}
              <ReleaseHistory work={w} />
              <Link href={`/approvals?work=${w.id}`} className="button">
                الموافقة والنشر
              </Link>
            </Panel>
          )}
        </div>
        <aside>
          <Panel title="تفاصيل العمل">
            <dl>
              <dt>المسؤول</dt>
              <dd>
                {roles[w.owner].user} · {roles[w.owner].name}
              </dd>
              <dt>الحملة</dt>
              <dd>{owning.title}</dd>
              <dt>التسليم</dt>
              <dd>{w.due}</dd>
              <dt>الوسيط المحدد</dt>
              <dd>
                {asset.title} · v{w.assetVersion}
              </dd>
              <dt>الإصدار الحالي</dt>
              <dd>{w.revision}</dd>
            </dl>
          </Panel>
          <Panel title="مراحل الإنتاج">
            {checklistSteps.map((s, i) => (
              <label className="check-row" key={s}>
                <input
                  type="checkbox"
                  checked={w.checklist[i]}
                  disabled={!canEdit(state.role, w)}
                  onChange={() => dispatch({ type: 'check', id: w.id, index: i })}
                />
                {s}
              </label>
            ))}
          </Panel>
          {canEdit(state.role, w) &&
            ['DRAFT', 'IN_PRODUCTION', 'CHANGES_REQUESTED', 'REJECTED'].includes(w.status) && (
              <button className="primary full" onClick={() => dispatch({ type: 'submit', id: w.id })}>
                إرسال الإصدار {w.revision} للمراجعة
              </button>
            )}
          {w.comments.length > 0 && (
            <Panel title="آخر ملاحظة">
              <p>{w.comments.at(-1)?.text}</p>
            </Panel>
          )}
        </aside>
      </div>
    </>
  );
}

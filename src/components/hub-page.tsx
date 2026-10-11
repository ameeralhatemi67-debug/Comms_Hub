'use client';
import Link from 'next/link';
import { useState } from 'react';
import {
  assets,
  atRiskSchedules,
  campaignPulse,
  personById,
  pulseStations,
  riskText,
  campaign,
  channelAccounts,
  homeTiles,
  integrationStatusLabels,
  integrations,
  isMine,
  needsAttention,
  noticesFor,
  ready,
  roles,
  securityEvents,
  storageUsage,
  systemHealth,
  teamLoad,
} from '@/lib/domain';
import { useHub } from '@/lib/store';
import { useIdentity } from '@/lib/use-identity';
import { Title, Panel, Empty, MediaPreview, StatusChip } from './ui';
import { WorkList, WorkDetail, Composer, WorkRow } from './work';
import { Approvals, Calendar } from './operations';
import { Supporting } from './supporting';
import { ComponentGallery } from './gallery';
import { AccountsPage } from './accounts';
import dynamic from 'next/dynamic';

const MotionStudio = dynamic(() => import('./motion-studio'), {
  ssr: false,
  loading: () => <div className="panel" role="status">جارٍ تحميل استوديو الحركة…</div>,
});

function Home() {
  const { state, dispatch } = useHub();
  const second = useIdentity();
  const actor = roles[state.role];
  const tiles = homeTiles(state);

  // What this role is asked to act on, per MVP_draft.md section 6.
  const focus = state.work.filter((w) =>
    actor.review ? w.status === 'IN_REVIEW' : actor.publish ? ready(w) : isMine(state.role, w),
  );
  const focusTitle = actor.review
    ? 'بانتظار موافقتك'
    : actor.publish
      ? 'جاهزيتك للنشر'
      : actor.admin
        ? 'سلطة النظام'
        : 'أولويات العمل';

  // Reviewers see the department's blockers, the publishing officer sees only
  // release failures, and specialists see only blockers on their own work.
  const attention = state.work.filter((w) =>
    actor.publish
      ? ['FAILED', 'PARTIAL'].includes(w.status)
      : needsAttention(w) && (actor.review || actor.admin || isMine(state.role, w)),
  );
  const scheduled = state.work.filter((w) => w.scheduled);
  const myNotices = noticesFor(state.role, state.notices).filter((n) => !n.read);

  const activity = state.work
    .flatMap((w) => w.activity.slice(0, 2).map((text, i) => ({ key: `${w.id}-${i}`, id: w.id, title: w.title, text })))
    .slice(0, 6);

  return (
    <>
      <Title title="صباح الخير، " accent={actor.user} sub={actor.priority}>
        {actor.create && (
          <Link href="/create" className="button primary">
            إنشاء عمل +
          </Link>
        )}
      </Title>

      <div className="stats">
        {tiles.map((tile) => (
          tile.href ? (
            <Link className="stat stat-link" href={tile.href} key={tile.key} data-tile={tile.key}>
              <span>{tile.label}</span>
              <strong>{tile.value}</strong>
              <small>{tile.hint}</small>
            </Link>
          ) : (
            <div className="stat" key={tile.key} data-tile={tile.key}>
              <span>{tile.label}</span>
              <strong>{tile.value}</strong>
              <small>{tile.hint}</small>
            </div>
          )
        ))}
      </div>

      {actor.admin ? (
        <div className="columns wide-first">
          <div>
            <Panel title="حالة النظام">
              <div className="table">
                {systemHealth.map((item) => (
                  <div className="between" key={item.id}>
                    <span>{item.label}</span>
                    <b className={item.ok ? 'success' : 'danger'}>{item.value}</b>
                  </div>
                ))}
              </div>
              <p className="muted">
                التكاملات محاكاة فقط. الحسابات والصلاحيات حقيقية. لا يملك Admin صلاحية اعتماد المحتوى أو نشره، لكنه
                يبدّل الدور من أعلى الصفحة ليختبر كل دور.
              </p>
              <Link href="/admin" className="button primary">
                فتح الإدارة
              </Link>
            </Panel>
            <Panel title="صحة التكاملات">
              <div className="table">
                {integrations.map((item) => (
                  <div className="between" key={item.id}>
                    <span>{item.name}</span>
                    <b className={item.status === 'CONNECTED' ? 'success' : 'danger'}>
                      {integrationStatusLabels[item.status]}
                    </b>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
          <aside>
            <Panel title="الحسابات">
              <p>إضافة الحسابات وحذفها، ومنح الأدوار والصفحات، والبتّ في طلبات الوصول.</p>
              <Link className="button primary" href="/accounts">
                فتح الحسابات
              </Link>
            </Panel>
            <Panel title="التخزين">
              <p>
                <b>{storageUsage.percent}%</b> مستخدم · {storageUsage.usedGb} من {storageUsage.totalGb} غيغابايت
              </p>
              <div className="table">
                {storageUsage.buckets.map((bucket) => (
                  <div className="between" key={bucket.id}>
                    <span>{bucket.label}</span>
                    <b>{bucket.gb} غيغابايت</b>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="أحداث الأمن">
              {securityEvents.map((event) => (
                <div className="notice" key={event.id}>
                  <b>{event.text}</b>
                  <small>
                    {event.at} · {event.actor}
                  </small>
                </div>
              ))}
            </Panel>
          </aside>
        </div>
      ) : (
        <div className="columns wide-first">
          <div>
            {/* Second design: what needs this person's attention, before anything else. */}
            {second && (actor.publish || actor.review) && atRiskSchedules(state.work).length > 0 && (
              <Link className="alert-strip" href="/approvals" role="status">
                <b>تحتاج انتباهك:</b> {riskText(atRiskSchedules(state.work)[0].risks[0])}
              </Link>
            )}
            <section className="campaign">
              <span className="eyebrow">الحملة النشطة · سبتمبر 2026</span>
              <h2>{campaign.title}</h2>
              <p>{campaign.description}</p>
              <div className="campaign-stats">
                <span>
                  <b>{campaign.progress}%</b>نسبة الإنجاز
                </span>
                <span>
                  <b>{campaign.members}</b>أعضاء الفريق
                </span>
                <span>
                  <b>{campaign.pieces}</b>عناصر المحتوى
                </span>
                <span>
                  <b>{campaign.pendingApprovals}</b>بانتظار الاعتماد
                </span>
              </div>
              {second && <CampaignPulse />}
              <div className="actions">
                <span>{state.work.length} أعمال في النموذج</span>
                <span>{campaign.date}</span>
                <Link href="/work" className="button light">
                  استعراض أعمال الحملة ←
                </Link>
              </div>
            </section>

            {second ? (
              <section className="panel decisions" aria-label="قراراتك الآن">
                <h2>
                  قراراتك الآن <span className="count-badge">{focus.length}</span>
                </h2>
                {focus.map((w) => (
                  <div className="decision-row" key={w.id}>
                    <span>
                      <b>{w.title}</b>
                      <small>
                        الإصدار {w.revision} · {personById(w.assignee).name} · <StatusChip status={w.status} />
                      </small>
                    </span>
                    <span className="actions">
                      {actor.review && w.status === 'IN_REVIEW' ? (
                        <>
                          <button className="primary" onClick={() => dispatch({ type: 'approve', id: w.id })}>
                            اعتماد الإصدار {w.revision}
                          </button>
                          <Link className="button" href={`/approvals?work=${w.id}`}>
                            مراجعة
                          </Link>
                        </>
                      ) : actor.publish ? (
                        <Link className="button primary" href={`/approvals?work=${w.id}`}>
                          جدولة
                        </Link>
                      ) : (
                        <Link className="button" href={`/work/${w.id}`}>
                          فتح
                        </Link>
                      )}
                    </span>
                  </div>
                ))}
                {!focus.length && <Empty>لا يوجد قرار ينتظرك الآن.</Empty>}
              </section>
            ) : (
              <Panel title={focusTitle}>
                {focus.length ? (
                  focus.map((w) => <WorkRow work={w} key={w.id} />)
                ) : (
                  <Empty>لا يوجد عمل يتطلب هذا الدور حالياً.</Empty>
                )}
              </Panel>
            )}
          </div>

          <aside>
            {actor.review && <TeamLoadPanel />}

            {actor.publish && (
              <Panel title="مواعيد معرضة للخطر">
                {atRiskSchedules(state.work).length ? (
                  atRiskSchedules(state.work).map(({ work: w, risks }) => (
                    <Link className="notice at-risk" href={`/approvals?work=${w.id}`} key={w.id}>
                      <b>{w.title}</b>
                      <small>{w.scheduled?.replace('T', ' · ')} الرياض</small>
                      {risks.map((r) => (
                        <p key={r.channel} className="danger">
                          {riskText(r)}
                        </p>
                      ))}
                    </Link>
                  ))
                ) : (
                  <p className="muted">كل المواعيد المجدولة مغطاة بتفويض صالح.</p>
                )}
              </Panel>
            )}

            {actor.publish && (
              <Panel title="صحة الحسابات المتصلة">
                {channelAccounts.map((account) => (
                  <div className="notice" key={account.id}>
                    <span className="between">
                      <b>{account.name}</b>
                      <span className={account.status === 'CONNECTED' ? 'chip success' : 'chip danger'}>
                        {integrationStatusLabels[account.status]}
                      </span>
                    </span>
                    <small>{account.detail}</small>
                  </div>
                ))}
                <p className="muted">حالة تجريبية. لا توجد تفويضات حقيقية أو أسرار في هذا النموذج.</p>
              </Panel>
            )}

            <Panel title="جدول الحملة">
              {scheduled.length ? (
                scheduled.map((w) => (
                  <Link key={w.id} className="notice" href="/calendar">
                    <b>{w.title}</b>
                    <small>{w.scheduled?.replace('T', ' · ')} الرياض</small>
                  </Link>
                ))
              ) : (
                <p className="muted">لا توجد مواعيد نشر مجدولة بعد.</p>
              )}
            </Panel>

            <Panel title="يحتاج متابعة">
              {attention.map((w) => (
                <Link href={`/work/${w.id}`} className="notice" key={w.id}>
                  <b>{w.title}</b>
                  <StatusChip status={w.status} />
                </Link>
              ))}
              {!attention.length && <p className="muted">لا توجد عوائق في العمل الحالي.</p>}
            </Panel>

            <Panel title="إشعاراتك غير المقروءة">
              {myNotices.length ? (
                myNotices.slice(0, 4).map((n) => (
                  <Link href={`/work/${n.workId}`} className="notice" key={n.id}>
                    <p>{n.title}</p>
                  </Link>
                ))
              ) : (
                <p className="muted">لا توجد إشعارات موجهة لهذا الدور.</p>
              )}
            </Panel>
          </aside>
        </div>
      )}

      <Panel title="نشاط الفريق">
        {activity.map((item) => (
          <Link key={item.key} href={`/work/${item.id}`} className="notice">
            <b>{item.title}</b>
            <p>{item.text}</p>
          </Link>
        ))}
      </Panel>
    </>
  );
}

/** The campaign's stations on one bar (second design, task 0.3.3.1). */
function CampaignPulse() {
  const { state } = useHub();
  const { counts, current, progress } = campaignPulse(state.work);
  return (
    <div className="pulse" aria-label={`نبضة الحملة: المحطة الحالية ${pulseStations[current]}`}>
      <ol className="stations" style={{ ['--p' as string]: progress }}>
        {pulseStations.map((name, i) => (
          <li key={name} className={i < current ? 'done' : i === current ? 'now' : ''}>
            <i aria-hidden="true">{counts[i]}</i>
            {name}
          </li>
        ))}
      </ol>
      <small>
        المحطة الحالية: {pulseStations[current]} · {counts[current]} أعمال فيها · الإنجاز {Math.round(progress * 100)}%
      </small>
    </div>
  );
}

/** Load per person for leadership (task 0.2.3.6, F-R01-01). */
function TeamLoadPanel() {
  const { state } = useHub();
  const load = teamLoad(state.work);
  const most = Math.max(1, ...load.map((x) => x.active));
  return (
    <Panel title="حمل الفريق">
      <div className="team-load">
        {load.map(({ person, active, overdue, awaitingReview }) => (
          <div className="team-load-row" key={person.id}>
            <span className="between">
              <b>
                {person.name} <small>{roles[person.role].name}</small>
              </b>
              <span>
                {active} نشطة
                {overdue > 0 && <span className="due-note late"> · {overdue} متأخر</span>}
                {awaitingReview > 0 && <span> · {awaitingReview} للمراجعة</span>}
              </span>
            </span>
            <span className="load-bar" aria-hidden="true">
              <i style={{ width: `${(active / most) * 100}%` }} className={overdue ? 'late' : ''} />
            </span>
          </div>
        ))}
      </div>
      <Link className="text-link" href="/work">
        عرض الفريق في صفحة العمل ←
      </Link>
    </Panel>
  );
}

function Media({ id }: { id?: string }) {
  const { state } = useHub();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('all');
  const [list, setList] = useState(false);
  const [version, setVersion] = useState<number | null>(null);
  const asset = assets.find((a) => a.id === id);

  if (id && !asset) return <Empty>الوسيط غير موجود.</Empty>;

  if (asset)
    return (
      <>
        <Title title={asset.title} sub={campaign.title}>
          <Link href="/media" className="button">
            العودة للمكتبة
          </Link>
        </Title>
        <div className="columns wide-first">
          <Panel>
            <MediaPreview assetId={asset.id} version={version || asset.versions.at(-1)} large />
            <label>
              استعراض الإصدارات
              <select value={version || asset.versions.at(-1)} onChange={(e) => setVersion(Number(e.target.value))}>
                {asset.versions.map((v) => (
                  <option value={v} key={v}>
                    v{v}
                    {asset.approved === v ? ' · معتمد' : ''}
                  </option>
                ))}
              </select>
            </label>
            <p>
              {asset.filename} · أُنشئ بواسطة {asset.creator}
            </p>
            <small>نسخة مرئية تجريبية. الملفات الثنائية والتخزين غير متصلين.</small>
          </Panel>
          <Panel title="مستخدم في">
            {state.work
              .filter((w) => w.assetId === asset.id)
              .map((w) => (
                <Link href={`/work/${w.id}`} className="notice" key={w.id}>
                  <b>{w.title}</b>
                  <small>
                    الوسيط v{w.assetVersion} · العمل r{w.revision}
                  </small>
                </Link>
              ))}
          </Panel>
        </div>
      </>
    );

  const filtered = assets.filter(
    (a) => (kind === 'all' || a.kind === kind) && (a.title + ' ' + a.filename).includes(search),
  );

  return (
    <>
      <Title title="مكتبة الوسائط" sub="أصول الحملة وإصداراتها، مرتبطة بالعمل والمراجعة." />
      <div className="filters">
        <input
          aria-label="البحث في الوسائط"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث عن وسيط…"
        />
        <select aria-label="نوع الوسائط" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="all">كل الوسائط</option>
          <option value="poster">تصاميم</option>
          <option value="video">فيديو</option>
          <option value="raw">مواد أصلية</option>
        </select>
        <button onClick={() => setList(!list)}>{list ? 'عرض الشبكة' : 'عرض القائمة'}</button>
      </div>
      <div className={list ? 'asset-list' : 'media-grid'}>
        {filtered.map((a) => (
          <Link className="media-card" href={`/media/${a.id}`} key={a.id}>
            <MediaPreview assetId={a.id} version={a.versions.at(-1)} />
            <div>
              <h2>{a.title}</h2>
              <p>{campaign.title}</p>
              <small>
                {a.filename} · v{a.versions.at(-1)}
              </small>
              <span className="chip">{a.approved ? 'معتمد v' + a.approved : 'غير معتمد'}</span>
            </div>
          </Link>
        ))}
      </div>
      {!filtered.length && <Empty>لا توجد وسائط مطابقة.</Empty>}
    </>
  );
}

export function HubPage({ route }: { route: string[] }) {
  const { state } = useHub();
  const [page, id, action] = route;

  if (!page) return <Home />;
  if (page === 'work') {
    if (!id) return <WorkList />;
    if (action === 'edit') {
      const w = state.work.find((x) => x.id === id);
      return w ? <Composer key={w.id} work={w} /> : <Empty>العمل غير موجود.</Empty>;
    }
    return <WorkDetail key={id} id={id} />;
  }
  if (page === 'create') return <Composer key={'new-' + state.role} />;
  if (page === 'approvals') return <Approvals key={state.role} />;
  if (page === 'calendar') return <Calendar />;
  if (page === 'media') return <Media key={id || 'all'} id={id} />;
  if (page === 'motion') return <MotionStudio />;
  if (page === 'components') return <ComponentGallery />;
  if (page === 'accounts') return <AccountsPage />;
  if (['mail', 'ideas', 'analytics', 'monitoring', 'admin', 'settings', 'account'].includes(page))
    return <Supporting page={page} />;

  return (
    <Empty>
      هذه الصفحة غير موجودة. <Link href="/">العودة للرئيسية</Link>
    </Empty>
  );
}

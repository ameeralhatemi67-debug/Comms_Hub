'use client';
import Link from 'next/link';
import { useState } from 'react';
import {
  assets,
  campaign,
  channelAccounts,
  directory,
  homeTiles,
  integrationStatusLabels,
  integrations,
  needsAttention,
  noticesFor,
  ready,
  roles,
  securityEvents,
  storageUsage,
  systemHealth,
} from '@/lib/domain';
import { useHub } from '@/lib/store';
import { Title, Panel, Empty, MediaPreview, StatusChip } from './ui';
import { WorkList, WorkDetail, Composer, WorkRow } from './work';
import { Approvals, Calendar } from './operations';
import { Supporting } from './supporting';
import dynamic from 'next/dynamic';

const MotionStudio = dynamic(() => import('./motion-studio'), {
  ssr: false,
  loading: () => <div className="panel" role="status">جارٍ تحميل استوديو الحركة…</div>,
});

function Home() {
  const { state } = useHub();
  const actor = roles[state.role];
  const tiles = homeTiles(state);

  // What this role is asked to act on, per MVP_draft.md section 6.
  const focus = state.work.filter((w) =>
    actor.review ? w.status === 'IN_REVIEW' : actor.publish ? ready(w) : w.owner === state.role,
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
      : needsAttention(w) && (actor.review || actor.admin || w.owner === state.role),
  );
  const scheduled = state.work.filter((w) => w.scheduled);
  const myNotices = noticesFor(state.role, state.notices).filter((n) => !n.read);

  const activity = state.work
    .flatMap((w) => w.activity.slice(0, 2).map((text, i) => ({ key: `${w.id}-${i}`, id: w.id, title: w.title, text })))
    .slice(0, 6);

  return (
    <>
      <Title title={`صباح الخير، ${actor.user}`} sub={actor.priority}>
        {actor.create && (
          <Link href="/create" className="button primary">
            إنشاء عمل +
          </Link>
        )}
      </Title>

      <div className="stats">
        {tiles.map((tile) => (
          <div className="stat" key={tile.key}>
            <span>{tile.label}</span>
            <strong>{tile.value}</strong>
            <small>{tile.hint}</small>
          </div>
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
                إعدادات المستخدمين والتكاملات محاكاة فقط. لا يملك Admin صلاحية اعتماد المحتوى أو نشره.
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
            <Panel title="المستخدمون">
              <div className="table">
                {directory.slice(0, 5).map((entry) => (
                  <div className="between" key={entry.role}>
                    <span>{entry.user}</span>
                    <b>{entry.roleName}</b>
                  </div>
                ))}
              </div>
              <Link className="text-link" href="/admin">
                كل المستخدمين ←
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
              <div className="actions">
                <span>{state.work.length} أعمال في النموذج</span>
                <span>{campaign.date}</span>
                <Link href="/work" className="button light">
                  استعراض أعمال الحملة ←
                </Link>
              </div>
            </section>

            <Panel title={focusTitle}>
              {focus.length ? (
                focus.map((w) => <WorkRow work={w} key={w.id} />)
              ) : (
                <Empty>لا يوجد عمل يتطلب هذا الدور حالياً.</Empty>
              )}
            </Panel>
          </div>

          <aside>
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
  if (['mail', 'ideas', 'analytics', 'monitoring', 'admin', 'settings', 'account'].includes(page))
    return <Supporting page={page} />;

  return (
    <Empty>
      هذه الصفحة غير موجودة. <Link href="/">العودة للرئيسية</Link>
    </Empty>
  );
}

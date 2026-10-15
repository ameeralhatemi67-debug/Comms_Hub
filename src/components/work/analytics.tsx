'use client';
// «التحليلات» on the database (Action_Plan.md B5): the flow of work, review, and the platforms,
// counted from the works and the department's platform accounts this person may see. The rules
// are in src/lib/work/analytics.ts. Publishing is still a simulation and the page says so.
import { useMemo } from 'react';
import { ChartNoAxesCombined } from 'lucide-react';
import { statusLabels } from '@/lib/work/rules';
import { STATUS_ORDER, analyse, percent } from '@/lib/work/analytics';
import { useWork, useWorkList } from './data';
import { Empty, Hint } from './parts';

const num = (n: number) => String(n);

function Bar({ value, max, tone = '' }: { value: number; max: number; tone?: string }) {
  return (
    <span className="an-bar" aria-hidden="true">
      <i className={tone} style={{ width: `${max > 0 ? Math.max(value > 0 ? 3 : 0, Math.round((value / max) * 100)) : 0}%` }} />
    </span>
  );
}

export function AnalyticsPage() {
  const w = useWork();
  const list = useWorkList();
  const a = useMemo(
    () => analyse(list.items.map((i) => i.w), w.accounts, w.platforms, w.today),
    [list.items, w.accounts, w.platforms, w.today],
  );
  const loading = w.status === 'loading' || list.status === 'loading';
  const failed = w.status === 'error' || list.status === 'error';

  return (
    <div className="wk an" dir="rtl">
      <div className="wk-head">
        <div>
          <h1>التحليلات</h1>
          <p>قراءة لسير العمل والمراجعة والمنصات، من الأعمال والحسابات التي تراها أنت.</p>
        </div>
      </div>
      <Hint>
        النشر محاكاة في هذا الإصدار، فأرقام النشر هنا هي نتائج المحاكاة وليست نتائج على المنصات. وكل رقم يخص ما يظهر لك من أعمال، لا القسم كله.
      </Hint>
      {loading ? (
        <div className="wk-loading" role="status">
          جارٍ تحميل التحليلات…
        </div>
      ) : failed ? (
        <Empty i={ChartNoAxesCombined} title="تعذّر تحميل التحليلات">
          أعد تحميل الصفحة.
        </Empty>
      ) : a.total === 0 ? (
        <Empty i={ChartNoAxesCombined} title="لا أعمال بعد">
          تظهر الأرقام حين يوجد عمل تراه. ابدأ من «إنشاء».
        </Empty>
      ) : (
        <>
          <div className="an-tiles" data-gd="tiles">
            <div className="an-tile">
              <b>{num(a.total)}</b>
              <span>أعمال</span>
            </div>
            <div className="an-tile">
              <b>{num(a.open)}</b>
              <span>مفتوحة</span>
            </div>
            <div className={`an-tile ${a.late ? 'bad' : ''}`}>
              <b>{num(a.late)}</b>
              <span>متأخرة عن موعدها</span>
            </div>
            <div className="an-tile">
              <b>{num(a.dueSoon)}</b>
              <span>تستحق خلال 7 أيام</span>
            </div>
            <div className="an-tile">
              <b>{num(a.review.waiting)}</b>
              <span>بانتظار المراجعة</span>
            </div>
            <div className={`an-tile ${a.published.failed ? 'bad' : ''}`}>
              <b>
                {num(a.published.ok)}
                <small> / {num(a.published.failed)}</small>
              </b>
              <span>نشر ناجح / فاشل (محاكاة)</span>
            </div>
          </div>

          <section className="wk-pn an-sec" data-gd="status">
            <h3>الأعمال حسب الحالة</h3>
            <div className="an-rows">
              {STATUS_ORDER.map((s) => (
                <div className="an-row" key={s}>
                  <span>{statusLabels[s]}</span>
                  <Bar value={a.byStatus[s]} max={Math.max(...Object.values(a.byStatus))} tone={s === 'FAILED' || s === 'REJECTED' ? 'bad' : ''} />
                  <b>{num(a.byStatus[s])}</b>
                </div>
              ))}
            </div>
            <p className="wk-col-hint">المصدر: حالة كل عمل تراه. «متأخرة» أعمال مفتوحة تجاوزت موعد التسليم.</p>
          </section>

          <section className="wk-pn an-sec" data-gd="weeks">
            <h3>آخر {a.weeks.length} أسابيع</h3>
            <div className="an-weeks">
              <div className="an-wrow head">
                <span>الأسبوع من</span>
                <span>أُنشئت</span>
                <span>نُشرت</span>
              </div>
              {a.weeks.map((x) => (
                <div className="an-wrow" key={x.from}>
                  <bdi dir="ltr">{x.from}</bdi>
                  <span>
                    <Bar value={x.made} max={Math.max(1, ...a.weeks.map((y) => Math.max(y.made, y.published)))} />
                    <b>{num(x.made)}</b>
                  </span>
                  <span>
                    <Bar value={x.published} max={Math.max(1, ...a.weeks.map((y) => Math.max(y.made, y.published)))} tone="ok" />
                    <b>{num(x.published)}</b>
                  </span>
                </div>
              ))}
            </div>
            <p className="wk-col-hint">المصدر: تاريخ إنشاء العمل، وتاريخ نشره في المحاكاة. الأسبوع سبعة أيام تنتهي اليوم في آخر سطر.</p>
          </section>

          <section className="wk-pn an-sec" data-gd="review">
            <h3>المراجعة</h3>
            <dl className="an-facts">
              <div>
                <dt>بانتظار المراجعة</dt>
                <dd>{num(a.review.waiting)}</dd>
              </div>
              <div>
                <dt>عادت بطلب تعديل</dt>
                <dd>{num(a.review.changes)}</dd>
              </div>
              <div>
                <dt>مرّت بالمراجعة</dt>
                <dd>{num(a.review.reviewed)}</dd>
              </div>
              <div>
                <dt>متوسط الجولات للعمل</dt>
                <dd>{a.review.meanRounds === null ? '-' : a.review.meanRounds.toFixed(1)}</dd>
              </div>
              <div>
                <dt>اعتُمدت من الجولة الأولى</dt>
                <dd>{a.review.firstRound === null ? '-' : `${Math.round(a.review.firstRound * 100)}%`}</dd>
              </div>
            </dl>
            <p className="wk-col-hint">المصدر: رقم دورة المراجعة في كل عمل. «من الجولة الأولى» بين الأعمال المعتمدة فما بعدها.</p>
          </section>

          <section className="wk-pn an-sec" data-gd="platforms">
            <h3>المنصات</h3>
            <div className="an-table" role="table">
              <div className="an-trow head" role="row">
                <span>المنصة</span>
                <span>حسابات (فعّالة / كلها)</span>
                <span>مربوطة فعلاً</span>
                <span>تحتاج انتباهاً</span>
                <span>ينتهي تفويضها قريباً</span>
                <span>أعمال موجهة إليها</span>
                <span>نجح / فشل (محاكاة)</span>
              </div>
              {a.platforms.map((p) => {
                const rate = percent(p.ok, p.ok + p.failed);
                return (
                  <div className="an-trow" role="row" key={p.key}>
                    <span>
                      <b>{p.label}</b>
                    </span>
                    <span>
                      {num(p.active)} / {num(p.accounts)}
                    </span>
                    <span>{num(p.connected)}</span>
                    <span className={p.attention ? 'bad' : ''}>{num(p.attention)}</span>
                    <span className={p.expiring ? 'warn' : ''}>{num(p.expiring)}</span>
                    <span>{num(p.addressed)}</span>
                    <span>
                      {num(p.ok)} / {num(p.failed)}
                      {rate !== null && <small> · {rate}%</small>}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="wk-col-hint">
              المصدر: حسابات القسم وحالة ربطها، وأعمال وجّهت نسخاً إلى حسابات المنصة، ونتائج المحاكاة لكل حساب. «مربوطة فعلاً» عبر
              تسجيل دخول المنصة نفسها لا الربط التجريبي.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

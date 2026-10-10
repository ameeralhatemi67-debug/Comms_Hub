'use client';
import { useState } from 'react';
import { statusLabels, type Status } from '@/lib/domain';
import { useIdentity } from '@/lib/use-identity';
import { Empty, LogoLoader, Panel, StatusChip, Tabs, Title } from './ui';

/**
 * Component QA page (Roadmap task 0.3.2.3). Every shared component in each of its
 * states, in whichever design is on, so both can be checked side by side by
 * switching designs. Hover and focus are shown with classes that reproduce those
 * states, because a screenshot cannot hold a pointer or keyboard focus.
 * Reached at /components; it is not in the navigation.
 */
export function ComponentGallery() {
  const second = useIdentity();
  const [tab, setTab] = useState('one');
  const [seg, setSeg] = useState('week');
  const [on, setOn] = useState(true);
  const states: [string, string][] = [
    ['عادي', ''],
    ['عند التمرير', 'is-hover'],
    ['عند التركيز', 'is-focus'],
  ];

  return (
    <>
      <Title
        title="مكونات الواجهة"
        sub={`صفحة فحص لكل مكوّن بحالاته. التصميم المعروض الآن: ${second ? 'الهوية الجديدة لمركز الاتصال' : 'التصميم الحالي'}. ليست ضمن التنقل.`}
      />

      <Panel title="الأزرار" className="gallery">
        {[
          ['أساسي', 'primary'],
          ['عادي', ''],
          ['فاتح', 'light'],
          ['خطر', 'danger'],
        ].map(([label, kind]) => (
          <div className="gallery-row" key={label} data-component={`button-${kind || 'default'}`}>
            <b>{label}</b>
            {states.map(([state, cls]) => (
              <button type="button" className={`${kind} ${cls}`.trim()} key={state} tabIndex={-1}>
                {state}
              </button>
            ))}
            <button type="button" className={kind} disabled>
              معطل
            </button>
            <button type="button" className={`${kind} is-loading`.trim()} aria-busy="true" disabled>
              <LogoLoader size={16} color="currentColor" ariaLabel="جارٍ الحفظ" />
              جارٍ الحفظ…
            </button>
          </div>
        ))}
      </Panel>

      <Panel title="الحالات" className="gallery">
        <div className="gallery-row" data-component="chips">
          {(Object.keys(statusLabels) as Status[]).map((s) => (
            <StatusChip status={s} key={s} />
          ))}
          <span className="chip success">متصل</span>
          <span className="chip danger">يحتاج إعادة ربط</span>
          <span className="due-note late">متأخر يومين</span>
          <span className="due-note soon">يستحق غداً</span>
        </div>
      </Panel>

      <Panel title="الحقول" className="gallery">
        <div className="gallery-fields" data-component="fields">
          <label>
            عادي
            <input defaultValue="منشور اليوم الوطني" />
          </label>
          <label>
            عند التركيز
            <input className="is-focus" defaultValue="منشور اليوم الوطني" tabIndex={-1} />
          </label>
          <label>
            معطل
            <input disabled defaultValue="لا يمكن تعديله" />
          </label>
          <label>
            خطأ
            <input aria-invalid="true" className="is-error" defaultValue="" placeholder="مطلوب" />
            <small className="field-error">أكمل العنوان قبل الحفظ.</small>
          </label>
          <label>
            قائمة
            <select defaultValue="x">
              <option value="x">X</option>
              <option value="instagram">Instagram</option>
            </select>
          </label>
          <label>
            نص طويل
            <textarea rows={2} defaultValue="في يومنا الوطني نحتفي بوطن يجمعنا." />
          </label>
          <label className="check-row">
            <input type="checkbox" defaultChecked /> مربع اختيار
          </label>
        </div>
      </Panel>

      <Panel title="التبويبات والتحكم المجزأ والمفتاح" className="gallery">
        <div data-component="tabs">
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { id: 'one', label: 'الفريق' },
              { id: 'two', label: 'الكل' },
              { id: 'three', label: 'مهامي' },
            ]}
          />
        </div>
        <div className="gallery-row">
          <div className="seg" role="group" aria-label="عرض التقويم" data-component="segmented">
            {[
              ['week', 'أسبوع'],
              ['month', 'شهر'],
              ['agenda', 'أجندة'],
            ].map(([id, label]) => (
              <button type="button" key={id} aria-pressed={seg === id} onClick={() => setSeg(id)}>
                {label}
              </button>
            ))}
          </div>
          <label className="switch" data-component="switch">
            <input type="checkbox" role="switch" checked={on} onChange={(e) => setOn(e.target.checked)} />
            <i aria-hidden="true" />
            تنبيهات التأخير
          </label>
          <label className="switch">
            <input type="checkbox" role="switch" disabled />
            <i aria-hidden="true" />
            معطل
          </label>
        </div>
      </Panel>

      <Panel title="الحوار والرسالة" className="gallery">
        <div className="gallery-row" data-component="overlays">
          <div className="dialog-sample" role="group" aria-label="نموذج حوار">
            <div className="between">
              <h2>تأكيد الجدولة</h2>
              <button type="button" aria-label="إغلاق" tabIndex={-1}>
                ×
              </button>
            </div>
            <p>سيُجدول الإصدار 2 في 23 سبتمبر الساعة 18:00 بتوقيت الرياض.</p>
            <button type="button" className="primary" tabIndex={-1}>
              تأكيد
            </button>
          </div>
          <div className="toast toast-sample" role="group" aria-label="نموذج رسالة">
            <span>تمت الجدولة بتوقيت الرياض</span>
            <button type="button" aria-label="إغلاق الرسالة" tabIndex={-1}>
              ×
            </button>
          </div>
        </div>
      </Panel>

      <Panel title="الحالات الفارغة والتحميل" className="gallery">
        <div className="columns" data-component="empty-loading">
          <Empty>لا يوجد عمل مطابق لهذه المرشحات.</Empty>
          <div>
            <div className="skeleton" />
            <div className="skeleton" />
            <p className="muted" role="status">
              <LogoLoader size={20} ariaLabel="جارٍ التحميل" /> جارٍ التحميل…
            </p>
          </div>
        </div>
      </Panel>
    </>
  );
}

// The real note, marking layer, inbox and «ملاحظاتي» on a page of ordinary controls (qa/feedback-flow.cjs). `?view=` picks
// what is drawn; everything from src/components is the real thing, with the database stood in by fake-feedback.ts.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FeedbackButton, FeedbackTab, MyNotes, reportError } from '../../src/components/feedback';
import { Modal } from '../../src/components/ui';

function Page() {
  const [win, setWin] = useState(false);
  const [sheet, setSheet] = useState(false);
  return (
    <div className="app-shell" style={{ display: 'block' }}>
      <header className="topbar">
        <div className="top-actions">
          <FeedbackButton />
        </div>
      </header>
      <main id="main" style={{ padding: 24, display: 'grid', gap: 16 }}>
        <section className="panel" style={{ padding: 16 }}>
          <h2>لوحة الاختبار</h2>
          <p>فقرة تصف ما في هذه اللوحة.</p>
          <button type="button" className="primary target-a" onClick={() => setWin(true)}>
            افتح نافذة
          </button>{' '}
          <button type="button" className="secondary target-b" aria-label="زر له اسم" onClick={() => setSheet(true)}>
            ورقة خاصة
          </button>
          <label className="l" style={{ marginTop: 12 }}>
            اسم الحقل
            <input className="target-c" defaultValue="نص سري كتبه الشخص" />
          </label>
        </section>
        {win && (
          <Modal title="نافذة الاختبار" onClose={() => setWin(false)}>
            <p>في داخل النافذة.</p>
            <button type="button" className="primary inside">
              زر داخل النافذة
            </button>
          </Modal>
        )}
        {sheet && (
          <Modal title="ورقة الكتابة" onClose={() => setSheet(false)}>
            <div data-fb-private>
              <button type="button" className="primary secret">
                عنوان مسودة خاصة
              </button>
            </div>
          </Modal>
        )}
      </main>
    </div>
  );
}

function Inbox() {
  const rows = (window as unknown as { __rows: never[] }).__rows;
  return <FeedbackTab initial={rows.length ? rows : undefined} />;
}

const view = new URLSearchParams(location.search).get('view');
(window as unknown as { __report: typeof reportError }).__report = reportError;
createRoot(document.getElementById('root') as HTMLElement).render(view === 'inbox' ? <Inbox /> : view === 'mine' ? <MyNotes /> : <Page />);

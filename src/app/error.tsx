'use client';
import { useEffect } from 'react';
import { reportError } from '@/components/feedback';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // The site's own record of a failed render (Action_Plan.md section 5), silent and scrubbed.
  useEffect(() => {
    reportError(error);
  }, [error]);
  return (
    <div className="panel">
      <h1>تعذر عرض الصفحة</h1>
      <p>أعد المحاولة. تحديث المتصفح يعيد بيانات النموذج إلى البداية.</p>
      <button className="primary" onClick={reset}>
        إعادة المحاولة
      </button>
    </div>
  );
}

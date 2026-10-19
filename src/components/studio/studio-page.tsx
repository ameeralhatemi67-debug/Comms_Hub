'use client';

import { useEffect, useState } from 'react';
import { CircleCheck, CircleAlert } from 'lucide-react';
import { Title } from '../ui';
import { MotionTabs } from './motion-tabs';
import { probeSupport, supportLines, type StudioSupport } from '@/lib/studio/support';
import './studio.css';

/**
 * «الاستوديو» (MVP_draft.md 62), the studio tab of «استوديو الحركة». The server has already checked
 * canOpenRoute; the database checks studio_can() on every studio record.
 */
export default function StudioPage({ projectId }: { projectId?: string }) {
  const [support, setSupport] = useState<StudioSupport | null>(null);
  useEffect(() => {
    let live = true;
    probeSupport().then((s) => live && setSupport(s), () => live && setSupport(null));
    return () => {
      live = false;
    };
  }, []);
  return (
    <div className="st" data-project={projectId ?? ''}>
      <Title title="الاستوديو" sub="مشاريع فيديو وصور تُحرَّر هنا وتُحفظ في قاعدة البيانات، وتستعمل قوالب الحركة وعلامات الهوية وملفات المكتبة.">
        <MotionTabs active="studio" />
      </Title>
      <section className="panel st-support" aria-label="ما يقدر عليه هذا المتصفح">
        <h2>ما يقدر عليه هذا المتصفح</h2>
        {!support ? (
          <p role="status">جارٍ الفحص…</p>
        ) : (
          <ul>
            {supportLines(support).map((l) => (
              <li key={l.text} className={l.ok ? 'ok' : 'no'}>
                {l.ok ? <CircleCheck aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
                {l.text}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

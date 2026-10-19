'use client';

import { useEffect, useState } from 'react';
import { CircleCheck, CircleAlert } from 'lucide-react';
import { Title } from '../ui';
import { MotionTabs } from './motion-tabs';
import { ProjectList } from './project-list';
import { ProjectShell } from './project-shell';
import { VideoEditor } from './editor';
import { probeSupport, supportLines, type StudioSupport } from '@/lib/studio/support';
import './studio.css';

/**
 * «الاستوديو» (MVP_draft.md 62), the studio tab of «استوديو الحركة». The server has already checked
 * canOpenRoute; the database checks studio_can() on every studio record and function.
 */
export default function StudioPage({ projectId }: { projectId?: string }) {
  if (projectId)
    return (
      <div className="st st-open">
        <ProjectShell id={projectId} editor={(p) => (p.doc.kind === 'video' ? <VideoEditor {...p} /> : <section className="panel">محرر الصور يأتي في المرحلة الخامسة.</section>)} />
      </div>
    );
  return (
    <div className="st">
      <Title title="الاستوديو" sub="مشاريع فيديو وصور تُحرَّر هنا وتُحفظ في قاعدة البيانات، وتستعمل قوالب الحركة وعلامات الهوية وملفات المكتبة.">
        <MotionTabs active="studio" />
      </Title>
      <ProjectList />
      <SupportPanel />
    </div>
  );
}

function SupportPanel() {
  const [support, setSupport] = useState<StudioSupport | null>(null);
  useEffect(() => {
    let live = true;
    probeSupport().then((s) => live && setSupport(s), () => live && setSupport(null));
    return () => {
      live = false;
    };
  }, []);
  return (
    <details className="panel st-support">
      <summary>ما يقدر عليه هذا المتصفح</summary>
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
    </details>
  );
}

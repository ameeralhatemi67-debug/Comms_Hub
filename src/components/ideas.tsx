'use client';
// «الأفكار»: a quick place to write an idea down and carry it into «إنشاء», where it becomes
// a real work in the database. Nothing is kept on this page: it used to build a sample work
// in the browser and then send the person to «العمل», which reads the database, so the idea
// never appeared. Now the text travels to the real create form and is saved there.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { canOpen } from '@/lib/access';
import { useAccount } from '@/lib/account-context';
import { Panel, Title } from './ui';

export function IdeasPage() {
  const router = useRouter();
  const account = useAccount();
  const [idea, setIdea] = useState('');
  const canCreate = canOpen(account, 'create');
  const text = idea.trim();

  const carry = () => {
    const [first, ...rest] = text.split('\n');
    try {
      window.sessionStorage.setItem(
        'comms-hub:idea',
        JSON.stringify({ title: first.slice(0, 140), brief: rest.length ? text : '' }),
      );
    } catch {
      // Storage unavailable: «إنشاء» opens blank and the text is still here.
      return;
    }
    router.push('/create?idea=1');
  };

  return (
    <div dir="rtl">
      <Title title="الأفكار" sub="اكتب الفكرة هنا ثم افتحها في «إنشاء» لتصير عملاً حقيقياً" />
      <Panel title="فكرة جديدة">
        <label className="field">
          اكتب الفكرة
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="السطر الأول يصير عنوان العمل، وما بعده يدخل في وصفه"
            rows={6}
            maxLength={4000}
          />
        </label>
        <div className="actions">
          <button className="primary" disabled={!text || !canCreate} onClick={carry}>
            <ArrowLeft />
            فتحها في «إنشاء»
          </button>
          <button className="secondary" disabled={!idea} onClick={() => setIdea('')}>
            مسح
          </button>
        </div>
        {!canCreate && <p className="muted">«إنشاء» غير مفتوحة لحسابك. اطلب فتحها من مدير الاتصال أو مسؤول النظام.</p>}
        <p className="muted">
          هذه الصفحة لا تحفظ الأفكار. الفكرة تُحفظ عملاً حين تضغط حفظ في «إنشاء»، وقبل ذلك تبقى في هذه الصفحة فقط.
        </p>
      </Panel>
    </div>
  );
}

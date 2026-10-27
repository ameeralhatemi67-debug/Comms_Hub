'use client';
// «تنبيهات الهاتف (Firebase)» in «الإعدادات» «الاتصالات» (MVP_draft.md 64.3): the Firebase service
// account the site sends push notices with. Pasted once by a holder of «إدخال أسرار التكاملات
// وتجديدها», checked with Google before it is kept, kept in the vault, never shown again.
import { useState } from 'react';
import { STATE_AR, STATE_TONE, type Integration } from '@/lib/integrations/rules';
import type { needProps } from '@/lib/kit/need';

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }) : '');

export function PushBlock({ row, canEdit, onSaved, lock }: { row: Integration | undefined; canEdit: boolean; onSaved: () => Promise<void>; lock: (why: string) => ReturnType<typeof needProps> }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const have = row?.has_secret === true;
  const project = typeof row?.config?.project_id === 'string' ? row.config.project_id : '';

  const save = async () => {
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch('/api/push/credential', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ json: text }) });
      const b = (await r.json().catch(() => ({}))) as { error?: string; project?: string };
      if (!r.ok) return setNote({ ok: false, text: b.error ?? 'تعذّر الحفظ.' });
      setText('');
      setNote({ ok: true, text: `قبلت Google المفتاح وحُفظ في الخزنة للمشروع ${b.project ?? ''}. لا يُعرض بعد الآن.` });
      await onSaved();
    } catch {
      setNote({ ok: false, text: 'تعذّر الوصول إلى الخادم.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="st-app st-push" aria-label="تنبيهات الهاتف" data-app="push">
      <div className="between">
        <b>تنبيهات الهاتف (Firebase)</b>
        <span className={`mx-chip ${have ? STATE_TONE[row!.state] : ''}`}>{have ? STATE_AR[row!.state] : 'لم يُدخل بعد'}</span>
      </div>
      <small className="muted">
        {have
          ? `مشروع Firebase ‏${project}، والمفتاح محفوظ في الخزنة.${row!.last_ok_at ? ` آخر إرسال ناجح ${when(row!.last_ok_at)}.` : ''}`
          : 'بدونه لا تصل تنبيهات «يحتاج قرارك» و«يحتاج انتباهك» إلى تطبيق الهاتف، وتبقى في المركز كما هي.'}
      </small>
      <small className="muted">
        من Firebase: إعدادات المشروع، ثم «حسابات الخدمة»، ثم «إنشاء مفتاح خاص جديد». الصق محتوى الملف كله هنا، ثم احذف الملف من جهازك.
      </small>
      <label className="l">
        ملف حساب الخدمة (JSON)
        <textarea
          className="wk-inp ltr st-push-json"
          rows={4}
          value={text}
          autoComplete="off"
          spellCheck={false}
          placeholder='{"type": "service_account", ...}'
          disabled={!canEdit || busy}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <div className="actions">
        <button
          type="button"
          className="secondary st-push-save"
          disabled={busy || (canEdit && !text.trim())}
          {...(canEdit ? { onClick: () => void save() } : lock('إدخال مفتاح Firebase لمن يملك «إدخال أسرار التكاملات وتجديدها».'))}
        >
          {busy ? 'جارٍ الفحص…' : have ? 'استبدال بعد الفحص' : 'فحص وحفظ'}
        </button>
      </div>
      {note && (
        <p className={note.ok ? 'ml-hint' : 'ml-err'} role="status">
          {note.text}
        </p>
      )}
    </section>
  );
}

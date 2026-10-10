'use client';
import { useState } from 'react';
import { isMine, notesFor, roles, type Work } from '@/lib/domain';
import { useHub } from '@/lib/store';

/**
 * Review notes bound to a time in a video version (task 0.2.3.10, F-R01-03).
 * Playback is deferred in the prototype, so the time is typed, and the page says so.
 */
export function VideoNotes({ work, version }: { work: Work; version: number }) {
  const { state, dispatch } = useHub();
  const [at, setAt] = useState('');
  const [text, setText] = useState('');
  const notes = notesFor(work, version);
  const canAdd = roles[state.role].review || isMine(state.role, work);
  return (
    <section className="video-notes" aria-label="ملاحظات زمنية على الفيديو">
      <h3>ملاحظات زمنية على الفيديو · v{version}</h3>
      <small>تشغيل الفيديو غير متاح في هذا النموذج، لذلك يُكتب الوقت يدوياً بصيغة دقيقة:ثانية.</small>
      {notes.length ? (
        <ol className="note-list">
          {notes.map((n) => (
            <li key={n.id}>
              <time dir="ltr">{n.at}</time>
              <span>
                {n.text}
                <small> · {n.by}</small>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">لا توجد ملاحظات على هذا الإصدار بعد.</p>
      )}
      {canAdd && (
        <form
          className="note-form"
          onSubmit={(e) => {
            e.preventDefault();
            dispatch({ type: 'video-note', id: work.id, at, text });
            if (/^\d{1,2}:[0-5]\d$/.test(at.trim()) && text.trim()) {
              setAt('');
              setText('');
            }
          }}
        >
          <label>
            الوقت
            <input
              dir="ltr"
              inputMode="numeric"
              placeholder="01:30"
              aria-label="وقت الملاحظة بصيغة دقيقة:ثانية"
              value={at}
              onChange={(e) => setAt(e.target.value)}
              required
            />
          </label>
          <label>
            الملاحظة
            <input value={text} onChange={(e) => setText(e.target.value)} required />
          </label>
          <button type="submit">إضافة ملاحظة</button>
        </form>
      )}
    </section>
  );
}

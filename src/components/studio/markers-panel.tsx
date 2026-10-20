'use client';

// «العلامات» (MVP_draft.md 62.8): the markers of a video project in order of time, renamed, recoloured,
// removed, and a click on a time moves the playhead there. «نسخ الفصول» copies them as YouTube chapter
// lines after checking YouTube's own rules (markers.ts), which are listed in words when broken.
import { Bookmark, ClipboardCopy, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { MARKER_COLORS, MARKER_LABEL_MAX, chapterIssues, chapters, markerHex, markersOf, youtubeTime } from '@/lib/studio/markers';
import { durationOf, type Micros, type ProjectDoc } from '@/lib/studio/schema';
import { withKeys } from '@/lib/studio/shortcuts';

export function MarkersPanel({ doc, readOnly, onAdd, onUpdate, onRemove, onSeek, extra }: {
  doc: ProjectDoc;
  readOnly: boolean;
  onAdd: () => void;
  onUpdate: (id: string, patch: { label?: string; color?: string }) => void;
  onRemove: (id: string) => void;
  onSeek: (t: Micros) => void;
  /** More actions under the chapters (the work's YouTube copy, Phase 8). */
  extra?: React.ReactNode;
}) {
  const list = markersOf(doc);
  const [copied, setCopied] = useState<string | null>(null);
  const issues = chapterIssues(doc, durationOf(doc));
  const text = chapters(doc);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied('نُسخت الفصول. ألصقها في وصف الفيديو على يوتيوب.');
    } catch {
      setCopied('تعذّر النسخ من هذا المتصفح: حدد النص أدناه وانسخه.');
    }
  };
  return (
    <section className="st-pane st-markers" aria-label="العلامات">
      <div className="st-versions-head">
        <b>العلامات</b>
        <button type="button" className="st-mini" disabled={readOnly} onClick={onAdd} title={withKeys('علامة عند رأس التشغيل', 'marker')}>
          <Bookmark aria-hidden="true" />
          علامة عند رأس التشغيل
        </button>
      </div>
      {!list.length ? (
        <p className="st-hint">لا علامات بعد. M يضع علامة عند رأس التشغيل، وتظهر على مسطرة الوقت.</p>
      ) : (
        <ol className="st-marker-list">
          {list.map((m) => (
            <li key={m.id} data-marker={m.id}>
              <i className="st-marker-dot" style={{ background: markerHex(m.color) }} aria-hidden="true" />
              <button type="button" className="st-tc" dir="ltr" onClick={() => onSeek(m.t)} title="إلى هذا الوقت">
                {youtubeTime(m.t)}
              </button>
              <input aria-label="اسم العلامة" value={m.label} maxLength={MARKER_LABEL_MAX} dir="auto" disabled={readOnly} onChange={(e) => onUpdate(m.id, { label: e.target.value })} />
              <select aria-label="لون العلامة" value={m.color} disabled={readOnly} onChange={(e) => onUpdate(m.id, { color: e.target.value })}>
                {MARKER_COLORS.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
              <button type="button" className="st-icon-btn" aria-label="حذف العلامة" title="حذف العلامة" disabled={readOnly} onClick={() => onRemove(m.id)}>
                <Trash2 aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
      )}
      <b className="st-sub">فصول يوتيوب</b>
      {issues.length > 0 ? (
        <ul className="st-chapter-issues">
          {issues.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      ) : (
        <p className="st-hint">العلامات صالحة فصولاً على يوتيوب.</p>
      )}
      {list.length > 0 && <textarea className="st-chapters" readOnly value={text} rows={Math.min(8, list.length + 1)} dir="auto" aria-label="سطور الفصول" />}
      <button type="button" className="st-mini" disabled={!list.length || issues.length > 0} onClick={() => void copy()}>
        <ClipboardCopy aria-hidden="true" />
        نسخ الفصول
      </button>
      {copied && <p className="st-hint" role="status">{copied}</p>}
      {extra}
    </section>
  );
}

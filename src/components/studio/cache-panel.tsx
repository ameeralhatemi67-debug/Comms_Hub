'use client';

// The device cache in the inspector (MVP_draft.md 62): what is kept in this browser, «حذف ملفات
// المعاينة المؤقتة» for the library copies (long press; no original or project is touched), and the
// files kept from «هذا الجهاز», each removable by long press.
import { useState } from 'react';
import { HardDrive, Trash2 } from 'lucide-react';
import { HOLD } from '@/lib/kit/hold-reasons';
import type { DeviceCache } from '@/lib/studio/cache';
import { formatBytes } from '@/lib/studio/support';

export function CachePanel({ cache, inUse, onChanged }: { cache: DeviceCache | null; inUse: Set<string>; onChanged: () => void }) {
  const [, setTick] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  if (!cache)
    return (
      <details className="st-sec">
        <summary>التخزين على هذا الجهاز</summary>
        <div className="st-sec-body">
          <p className="st-hint">هذا المتصفح لا يحفظ ملفات للاستوديو (نافذة خاصة أو متصفح لا يدعم ذلك): تُقرأ ملفات المكتبة من الخادم في كل مرة.</p>
        </div>
      </details>
    );
  const u = cache.usage();
  const locals = cache.entries.filter((e) => e.kind === 'local');
  return (
    <details className="st-sec">
      <summary>التخزين على هذا الجهاز</summary>
      <div className="st-sec-body st-cache">
        <p className="st-hint">
          <HardDrive aria-hidden="true" />
          نسخ من المكتبة: {formatBytes(u.library)} · ملفات هذا الجهاز: {formatBytes(u.local)}
        </p>
        <p className="st-hint">تُحذف نسخ المكتبة تلقائياً بعد عشرة أيام من آخر استعمال، عند فتح الاستوديو.</p>
        <button
          type="button"
          data-hold={HOLD.studioClearCache}
          disabled={!u.library}
          onClick={async () => {
            const r = await cache.clearLibrary(inUse);
            setNote(`حُذف ${r.removed} ملفاً (${formatBytes(r.bytes)}). ما يستعمله هذا المشروع بقي.`);
            setTick((x) => x + 1);
            onChanged();
          }}
        >
          <Trash2 aria-hidden="true" />
          حذف ملفات المعاينة المؤقتة
        </button>
        {note && <p className="st-hint" role="status">{note}</p>}
        {locals.length > 0 && (
          <>
            <b className="st-sub">ملفات على هذا الجهاز فقط</b>
            <ul className="st-locals">
              {locals.map((e) => (
                <li key={e.name}>
                  <span dir="auto">{e.label ?? e.name}</span>
                  <small>{formatBytes(e.bytes)}</small>
                  <button
                    type="button"
                    data-hold={HOLD.studioRemoveLocal}
                    aria-label={`حذف ${e.label ?? ''} من هذا الجهاز`}
                    onClick={async () => {
                      await cache.removeLocal(e.name.replace(/^local-/, ''));
                      setTick((x) => x + 1);
                      onChanged();
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </details>
  );
}

'use client';

// The device cache in the inspector (MVP_draft.md 62): what is kept in this browser, «حذف ملفات
// المعاينة المؤقتة» for the library copies (long press; no original or project is touched), and the
// files kept from «هذا الجهاز», each removable by long press. In the desktop application (63.3) it also
// shows the cache folder, its free space and its size limit, and a file used where it is is only let go
// of: the file itself stays where it is.
import { useState } from 'react';
import { FolderOpen, HardDrive, Trash2 } from 'lucide-react';
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
  const folder = cache.folder;
  const changed = () => {
    setTick((x) => x + 1);
    onChanged();
  };
  return (
    <details className="st-sec">
      <summary>التخزين على هذا الجهاز</summary>
      <div className="st-sec-body st-cache">
        <p className="st-hint">
          <HardDrive aria-hidden="true" />
          نسخ من المكتبة: {formatBytes(u.library)} · ملفات هذا الجهاز: {formatBytes(u.local)}
          {u.inPlace > 0 && <> · مستعملة من مكانها: {formatBytes(u.inPlace)}</>}
        </p>
        <p className="st-hint">تُحذف نسخ المكتبة تلقائياً بعد عشرة أيام من آخر استعمال، عند فتح الاستوديو.</p>
        {folder && (
          <div className="st-cache-folder">
            <p className="st-hint">
              <FolderOpen aria-hidden="true" />
              مجلد التخزين المؤقت: <bdi dir="ltr">{folder.folder}</bdi>
              {folder.free !== null && <> · المساحة الحرة: {formatBytes(folder.free)}</>}
            </p>
            <div className="actions">
              <button type="button" className="st-mini" onClick={async () => (await cache.chooseFolder(), changed())}>
                اختيار مجلد آخر
              </button>
              {!folder.isDefault && (
                <button type="button" className="st-mini" onClick={async () => (await cache.defaultFolder(), changed())}>
                  العودة إلى المجلد الافتراضي
                </button>
              )}
            </div>
            <label>
              الحد الأعلى للتخزين
              <select value={folder.limit} onChange={async (e) => (await cache.setLimit(Number(e.target.value), inUse), changed())}>
                {folder.limits.map((b) => (
                  <option key={b} value={b}>
                    {b ? formatBytes(b) : 'بلا حد'}
                  </option>
                ))}
              </select>
            </label>
            <p className="st-hint">عند تغيير المجلد تُحذف النسخ من المجلد السابق وتُنسخ في الجديد عند الحاجة، ولا يُمس غيرها. وإذا تجاوزت النسخ الحد حُذف أقدمها استعمالاً.</p>
          </div>
        )}
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
                  <small>
                    {formatBytes(e.bytes)}
                    {e.token ? ' · من مكانه' : ''}
                  </small>
                  {e.token ? (
                    <button type="button" data-hold={HOLD.studioForgetInPlace} aria-label={`إزالة ${e.label ?? ''} من الاستوديو على هذا الجهاز، ويبقى الملف في مكانه`} onClick={async () => (await cache.removeLocal(e.name.replace(/^local-/, '')), changed())}>
                      <Trash2 aria-hidden="true" />
                    </button>
                  ) : (
                    <button type="button" data-hold={HOLD.studioRemoveLocal} aria-label={`حذف ${e.label ?? ''} من هذا الجهاز`} onClick={async () => (await cache.removeLocal(e.name.replace(/^local-/, '')), changed())}>
                      <Trash2 aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </details>
  );
}

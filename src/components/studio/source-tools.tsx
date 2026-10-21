'use client';

// What the desktop application can do for the selected clip's video (MVP_draft.md 63.4, Desktop_App_Plan.md
// D5): «إنشاء نسخة خفيفة للمعاينة», offered first for a heavy source, after which the preview reads the
// light copy and the export still reads the original; and, for a file the browser cannot decode (or whose
// sound it cannot), «تحويل إلى نسخة قابلة للتحرير», after which everything reads the converted copy. Both
// copies live in the studio's cache folder on this device; the original is never changed. Nothing here
// shows in a browser.
import { Feather, RefreshCw, X } from 'lucide-react';
import type { CopyState, MediaPool } from '@/lib/studio/media';

/** The application's word for why a copy failed, said in Arabic. */
export function copyFailure(why: string): string {
  switch (why) {
    case 'space':
      return 'لا تتسع مساحة القرص لهذه النسخة.';
    case 'decode':
      return 'تعذّر على التطبيق قراءة هذا الملف.';
    case 'encode':
      return 'تعذّر الترميز بمرمّز النظام على هذا الجهاز.';
    case 'missing':
      return 'لم يعد الملف في مكانه على هذا الجهاز.';
    case 'cancelled':
      return 'أُلغي.';
    default:
      return 'تعذّر إكمال النسخة.';
  }
}

const percent = (s: Extract<CopyState, { kind: 'making' }>) => (s.total > 0 ? Math.min(99, Math.round((s.done / s.total) * 100)) : 0);

// A copy changes nothing in the project, so it is offered in a project open for reading too.
export function SourceTools({ pool, sourceId }: { pool: MediaPool | null; sourceId: string | null | undefined }) {
  const t = pool && sourceId ? pool.tools(sourceId) : null;
  if (!pool || !sourceId || !t) return null;
  const id = sourceId;
  if (t.convert.kind === 'making')
    return (
      <div className="st-src-tools" data-copy="converting">
        <p className="st-hint" role="status">
          <RefreshCw aria-hidden="true" />
          جارٍ التحويل إلى نسخة قابلة للتحرير ({percent(t.convert)}٪)…
        </p>
        <button type="button" onClick={() => void pool.cancelCopy(id, 'convert')}><X aria-hidden="true" />إلغاء</button>
      </div>
    );
  if (t.convertible)
    return (
      <div className="st-src-tools" data-copy="convertible">
        <p className="st-hint">
          {t.audioUnsupported ? 'لا يفك هذا المتصفح ترميز صوت هذا الملف، فلا يُسمع ولا يُصدَّر. ' : ''}
          يحوّله التطبيق إلى نسخة قابلة للتحرير على هذا الجهاز، ويبقى الأصل كما هو.
        </p>
        {t.convert.kind === 'failed' && <p className="st-hint st-warn">{copyFailure(t.convert.why)}</p>}
        <button type="button" onClick={() => void pool.convert(id)}><RefreshCw aria-hidden="true" />تحويل إلى نسخة قابلة للتحرير</button>
      </div>
    );
  return (
    <div className="st-src-tools" data-copy={t.proxy.kind}>
      {t.converted && <p className="st-hint">يُعرض ويُصدَّر من نسخة محوّلة على هذا الجهاز (H.264)، والأصل كما هو.</p>}
      {t.proxy.kind === 'ready' ? (
        <p className="st-hint">
          <Feather aria-hidden="true" />
          المعاينة من نسخة خفيفة ({t.proxy.height ?? 720}p)، والتصدير من الأصل.
        </p>
      ) : t.proxy.kind === 'making' ? (
        <>
          <p className="st-hint" role="status">
            <Feather aria-hidden="true" />
            جارٍ إنشاء النسخة الخفيفة ({percent(t.proxy)}٪)…
          </p>
          <button type="button" onClick={() => void pool.cancelCopy(id, 'proxy')}><X aria-hidden="true" />إلغاء</button>
        </>
      ) : (
        <>
          {t.heavy && <p className="st-hint">ملف ثقيل على المعاينة: النسخة الخفيفة تجعلها أسلس، والتصدير يبقى من الأصل.</p>}
          {t.proxy.kind === 'failed' && t.proxy.why !== 'cancelled' && <p className="st-hint st-warn">{copyFailure(t.proxy.why)}</p>}
          <button type="button" data-heavy={t.heavy ? 'yes' : 'no'} onClick={() => void pool.makeProxy(id)}><Feather aria-hidden="true" />إنشاء نسخة خفيفة للمعاينة</button>
        </>
      )}
    </div>
  );
}

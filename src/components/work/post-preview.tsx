'use client';
// The post preview per platform, shown from the work page through review to the send step
// (Readiness_Audit.md, order step 5). It draws the copy the way the platform lays it out,
// counts it against the platform's limits (src/lib/platforms/limits.ts, data in the registry),
// and says what would be refused. It is an approximation of the platform's screen: the length,
// the limits and the order of the elements are exact, the look is not, and the card says so.
// The files are placeholders (the library hands out files through its own pages), counted by kind.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, ClipboardCopy, Film, Image as ImageIcon, Info, Lock, TriangleAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { checkFor, copyFor, type Copy, type CopySource } from '@/lib/platforms/copies';
import { foldOf, headline, layoutOf, splitTitle, LEVEL_AR, type Check as CheckResult, type Limits } from '@/lib/platforms/limits';
import { MODE_AR, MODE_HELP_AR } from '@/lib/platforms/info';
import { accountName, platformInfo, platformLabels, type AccountRow } from '@/lib/work/rules';
import { Ic } from './parts';

const NOTE = 'معاينة تقريبية: الطول والحدود وترتيب العناصر دقيقة، أما الشكل فتقريبي. الملفات مواضع محجوزة.';

/** The counters and the issues of one check: what the preview and the send step both show. */
export function CheckList({ check, limits }: { check: CheckResult; limits?: Limits }) {
  return (
    <div className="wk-pv-checks">
      {check.counters.length > 0 && (
        <ul className="wk-pv-counters">
          {check.counters.map((c) => (
            <li key={c.key} className={c.level}>
              <span>{c.label}</span>
              <b className="ltr">
                {c.used}
                {c.max != null ? ` / ${c.max}` : ''}
              </b>
              <small>{c.unit}</small>
            </li>
          ))}
        </ul>
      )}
      {check.ok && !check.issues.some((i) => i.level === 'warn') && (
        <p className="wk-pv-ok">
          <Ic i={Check} />
          ضمن حدود المنصة.
        </p>
      )}
      {check.issues.length > 0 && (
        <ul className="wk-pv-issues">
          {check.issues.map((i) => (
            <li key={i.code} className={i.level}>
              <Ic i={i.level === 'info' ? Info : TriangleAlert} />
              <span>
                <b>{LEVEL_AR[i.level]}</b> {i.text}
              </span>
            </li>
          ))}
        </ul>
      )}
      {limits?.note && <small className="wk-pv-src">مصدر الحدود: {limits.note}</small>}
    </div>
  );
}

function MediaBlock({ c }: { c: Copy }) {
  const n = c.images + c.videos;
  if (n === 0 && c.hidden === 0) return <div className="wk-pv-media none">بلا ملف</div>;
  return (
    <div className="wk-pv-media">
      {c.videos > 0 && (
        <span>
          <Ic i={Film} />
          {c.videos === 1 ? 'فيديو' : `${c.videos} فيديو`}
        </span>
      )}
      {c.images > 0 && (
        <span>
          <Ic i={ImageIcon} />
          {c.images === 1 ? 'صورة' : `${c.images} صور`}
        </span>
      )}
      {c.hidden > 0 && (
        <span>
          <Ic i={Lock} />
          {c.hidden} في مجلد لا تصل إليه
        </span>
      )}
    </div>
  );
}

/** The post as the platform lays it out, with the checks under it. */
export function PostPreview({ platform, copy, account, check, limits }: { platform: string; copy: Copy; account?: AccountRow; check: CheckResult; limits: Limits }) {
  const layout = layoutOf(platform);
  const name = account ? accountName(account) : platformLabels[platform];
  const handle = account?.handle ?? '';
  const initial = (account?.label || name || '؟').trim()[0] ?? '؟';
  const fold = foldOf(copy.text, layout === 'square' ? limits.fold_chars : undefined);
  const yt = limits.title_max || limits.description_max_bytes ? splitTitle(copy.text) : null;
  return (
    <figure className={`wk-pv ${layout}`} data-platform={platform} aria-label={`معاينة ${platformLabels[platform]}`}>
      <header>
        <span className="av" aria-hidden="true">
          {initial}
        </span>
        <span>
          <b>{name}</b>
          {handle && <small className="ltr">{handle}</small>}
        </span>
        <span className="wk-chip plain">{platformLabels[platform]}</span>
      </header>
      {layout !== 'text' && layout !== 'video' && <MediaBlock c={copy} />}
      {layout === 'video' && <MediaBlock c={copy} />}
      <div className="body">
        {yt ? (
          <>
            <p className="title">{yt.title || '(بلا عنوان)'}</p>
            {yt.description && <p className="desc">{yt.description}</p>}
          </>
        ) : copy.text.trim() ? (
          <p>
            {fold.shown}
            {fold.hidden && <span className="more"> … المزيد</span>}
            {fold.hidden && <span className="sr"> {fold.hidden}</span>}
          </p>
        ) : (
          <p className="quiet">لا نص.</p>
        )}
      </div>
      <figcaption>
        {copy.own ? `النسخة الخاصة بـ ${platformLabels[platform]}` : 'النص الأساسي كما هو، فلا نسخة خاصة بهذه المنصة'}
        <small>{NOTE}</small>
      </figcaption>
      <CheckList check={check} limits={limits} />
    </figure>
  );
}

/** What a platform would receive from a work, for the pages that already hold the work in full. */
export function PreviewOfWork({ platform, src, account }: { platform: string; src: CopySource; account?: AccountRow }) {
  const info = platformInfo(platform);
  const copy = copyFor(src, platform);
  const r = checkFor(info?.accepts, copy);
  return <PostPreview platform={platform} copy={copy} account={account} check={r} limits={r.limits} />;
}

/** A work's texts and files, loaded for a dialog that is handed only the work's row. */
export function useCopySource(workId: string, type: string): CopySource | null {
  const [src, setSrc] = useState<CopySource | null>(null);
  useEffect(() => {
    let live = true;
    const db = supabase();
    void Promise.all([
      db.from('work_texts').select('n,body').eq('work_id', workId).order('n'),
      db.from('work_variants').select('platform,n,body').eq('work_id', workId).order('n'),
      db.from('work_assets').select('file:media_files(id,kind,name)').eq('work_id', workId),
    ]).then(([t, v, a]) => {
      if (!live) return;
      setSrc({
        type,
        texts: (t.data ?? []) as CopySource['texts'],
        variants: (v.data ?? []) as CopySource['variants'],
        assets: ((a.data ?? []) as unknown as { file: CopySource['assets'][number]['file'] }[]).map((r) => ({ file: r.file })),
      });
    });
    return () => {
      live = false;
    };
  }, [workId, type]);
  return src;
}

/** The accounts of a work with what each would receive and whether it fits, for the send step. */
export function useSendChecks(src: CopySource | null, accounts: AccountRow[]) {
  return useMemo(() => {
    if (!src) return null;
    return accounts
      .filter((a) => a.platform !== 'mail')
      .map((a) => {
        const copy = copyFor(src, a.platform);
        const r = checkFor(platformInfo(a.platform)?.accepts, copy);
        return { account: a, copy, check: r, limits: r.limits };
      });
  }, [src, accounts]);
}

export type SendCheck = NonNullable<ReturnType<typeof useSendChecks>>[number];

/** The list in the scheduling and publishing dialogs: one row per account, the preview behind it. */
export function SendChecks({ rows }: { rows: SendCheck[] | null }) {
  if (!rows) return <p className="wk-col-hint">جارٍ فحص النسخ…</p>;
  if (!rows.length) return null;
  return (
    <div className="wk-pv-send" data-gd="send-checks">
      {rows.map((r) => {
        const e = r.check.issues.some((i) => i.level === 'error');
        const w = r.check.issues.some((i) => i.level === 'warn');
        const line = headline(r.check);
        return (
          <details key={r.account.id} open={e}>
            <summary>
              <b>{accountName(r.account)}</b>
              <span className={`wk-chip plain ${e ? 'danger' : w ? 'warn' : 'approved'}`}>{e ? 'يمنع النشر' : w ? 'تنبيه' : 'ضمن الحدود'}</span>
              {line && <small>{line}</small>}
            </summary>
            <PostPreview platform={r.account.platform} copy={r.copy} account={r.account} check={r.check} limits={r.limits} />
            <PublishPack platform={r.account.platform} copy={r.copy} />
          </details>
        );
      })}
    </div>
  );
}

/**
 * The pack for a platform where the person publishes by hand (the registry's planned path is
 * «نشر مساعد» or «مهمة يدوية»): the exact text to paste and the files to upload, then confirm
 * in the platform's own app. Nothing is sent from here.
 */
export function PublishPack({ platform, copy }: { platform: string; copy: Copy }) {
  const info = platformInfo(platform);
  const [done, setDone] = useState(false);
  if (!info || info.kind !== 'social' || info.publish_mode === 'auto') return null;
  const take = async () => {
    try {
      await navigator.clipboard.writeText(copy.text);
      setDone(true);
    } catch {
      setDone(false);
    }
  };
  return (
    <div className="wk-pack" data-pack={platform}>
      <b>
        حزمة النشر · {MODE_AR[info.publish_mode]}
      </b>
      <small>{MODE_HELP_AR[info.publish_mode]}</small>
      {copy.text.trim() ? <pre>{copy.text}</pre> : <small>لا نص في هذه النسخة.</small>}
      <button type="button" className="wk-btn sm" onClick={() => void take()} disabled={!copy.text.trim()}>
        <Ic i={ClipboardCopy} />
        {done ? 'نُسخ النص' : 'نسخ النص'}
      </button>
      {copy.files.length > 0 && (
        <ul>
          {copy.files.map((f, i) => (
            <li key={f.id ?? i}>
              {f.id ? <Link href={`/media/${f.id}`}>{f.name ?? 'ملف'}</Link> : (f.name ?? 'ملف')} <small>({f.kind === 'video' ? 'فيديو' : f.kind === 'image' ? 'صورة' : 'ملف'})</small>
            </li>
          ))}
        </ul>
      )}
      {copy.hidden > 0 && <small>{copy.hidden} ملفاً في مجلد لا تصل إليه: يرفعه من يملك الوصول.</small>}
    </div>
  );
}

/** True when any account's copy breaks a limit: the send step stops. */
export const blocked = (rows: SendCheck[] | null) => !!rows?.some((r) => !r.check.ok);

/** One line per platform of a work: does the copy it would receive fit. Clicking opens that copy. */
export function CopyStrip({ src, platforms, onOpen }: { src: CopySource; platforms: string[]; onOpen?: (platform: string) => void }) {
  const rows = platforms.map((p) => {
    const copy = copyFor(src, p);
    const r = checkFor(platformInfo(p)?.accepts, copy);
    return { p, copy, r };
  });
  if (!rows.length) return null;
  return (
    <ul className="wk-pv-strip" aria-label="هل تناسب النسخ حدود المنصات">
      {rows.map(({ p, copy, r }) => {
        const e = r.issues.some((i) => i.level === 'error');
        const w = r.issues.some((i) => i.level === 'warn');
        const body = (
          <>
            <b>{platformLabels[p]}</b>
            <span className={`wk-chip plain ${e ? 'danger' : w ? 'warn' : 'approved'}`}>{e ? 'يتجاوز الحد' : w ? 'تنبيه' : 'ضمن الحدود'}</span>
            <small>{copy.own ? 'نسخة خاصة' : 'النص الأساسي'}</small>
            {headline(r) && <small>{headline(r)}</small>}
          </>
        );
        return (
          <li key={p}>
            {onOpen ? (
              <button type="button" onClick={() => onOpen(p)}>
                {body}
              </button>
            ) : (
              <div>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

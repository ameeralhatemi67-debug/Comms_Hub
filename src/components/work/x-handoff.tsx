'use client';
// X's link route (MVP_draft.md section 81): the hand-off of a post to X. The site prepares what the person needs (the text to copy, the
// files to take, a link that opens X's composer with the text filled in) and the person posts it on X from their own account, then
// gives the post's link and the work is recorded. Nothing is sent to X from here. Whether the link is a post of this account's own
// handle is checked here for the person's sake (src/lib/work/x-link.ts) and again by the database (work_link_confirm), which decides.
// The note under the box says what X's own lookup found, as advice: it never stops the confirmation.
import { useState } from 'react';
import { Check, ClipboardCopy, Download, ExternalLink, X as XIcon } from 'lucide-react';
import { fileAt } from '@/lib/native/files';
import { checkFor, copyFor, publishedVersion } from '@/lib/platforms/copies';
import { accountName, platformInfo, type AccountRow, type WorkRow } from '@/lib/work/rules';
import { X_LIMIT, checkNote, composerLink, handleOf, parsePostLink, postLinkProblem, xLength, type PostCheck, type PostNote } from '@/lib/work/x-link';
import { FileThumb } from '../file-thumb';
import { PhoneFileButtons } from '../native/phone-file';
import { Hint, Ic } from './parts';
import { useCopySource } from './post-preview';

type Act = (fn: string, args: Record<string, unknown>, ok: string) => Promise<boolean>;
type Note = PostNote;

export function XHandoff({ w, account, act, onDone }: { w: WorkRow; account: AccountRow; act: Act; onDone?: () => void }) {
  const src = useCopySource(w.id, w.type);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const [asked, setAsked] = useState(false);
  const copy = src ? copyFor(src, account.platform) : null;
  const text = copy?.text ?? '';
  const files = (copy?.files ?? []).filter((f) => f.id && publishedVersion(f));
  const length = xLength(text);
  const problem = asked ? postLinkProblem(url, account.handle) : null;
  const take = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };
  const confirm = async () => {
    setAsked(true);
    if (postLinkProblem(url, account.handle)) return;
    setBusy(true);
    // X's own lookup, as advice. A refusal here would not stop the confirmation: the database decides by the link's handle.
    let found: PostCheck = { found: null, author: null };
    try {
      const r = await fetch('/api/platforms/x-post', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      if (r.ok) found = (await r.json()) as PostCheck;
    } catch {
      // not known
    }
    const n = checkNote(found, account.handle);
    setNote(n);
    if (n?.level === 'bad') return setBusy(false);
    const ok = await act('work_link_confirm', { p_work: w.id, p_account: account.id, p_url: url.trim(), p_ok: true }, `سُجّل النشر على ${accountName(account)}.`);
    setBusy(false);
    if (ok) onDone?.();
  };
  const notPosted = async () => {
    setBusy(true);
    const ok = await act('work_link_confirm', { p_work: w.id, p_account: account.id, p_url: null, p_ok: false }, `سُجّل أنه لم يُنشر على ${accountName(account)}.`);
    setBusy(false);
    if (ok) onDone?.();
  };
  const issues = copy ? checkFor(platformInfo(account.platform)?.accepts, copy).issues.filter((i) => i.level === 'error') : [];
  return (
    <div className="wk-xh" data-xh={account.id}>
      <p className="wk-xh-lead">
        لا يُرسل الموقع شيئاً إلى X. تنشر أنت من حسابك <b className="ltr">@{handleOf(account.handle)}</b> ثم تلصق رابط المنشور ليُسجَّل.
      </p>
      <ol className="wk-xh-steps">
        <li data-xh-step="text">
          <b>انسخ النص</b>
          {text.trim() ? <pre>{text}</pre> : <small>لا نص في هذه النسخة: المنشور ملفات فقط.</small>}
          <div className="wk-xh-row">
            <button type="button" className="wk-btn sm" disabled={!text.trim()} onClick={() => void take()}>
              <Ic i={copied ? Check : ClipboardCopy} />
              {copied ? 'نُسخ النص' : 'نسخ النص'}
            </button>
            <small className={length > X_LIMIT ? 'wk-xh-over' : undefined}>
              <span className="ltr">
                {length} / {X_LIMIT}
              </span>{' '}
              حرفاً بحساب X{length > X_LIMIT ? ': أطول من الحد، يلزمك اختصاره في X' : ''}
            </small>
          </div>
        </li>
        {files.length > 0 && (
          <li data-xh-step="files">
            <b>خذ الملفات</b>
            <ul className="wk-xh-files">
              {files.map((f) => {
                const v = publishedVersion(f)!;
                const path = fileAt.media(f.id!, v);
                const down = fileAt.media(f.id!, v, true);
                return (
                  <li key={f.id}>
                    <span className="wk-pk-th">
                      <FileThumb of={{ asset: f.id!, version: v }} kind={f.kind} name={f.name} />
                    </span>
                    <span>{f.name ?? 'ملف'}</span>
                    <PhoneFileButtons
                      small
                      inPage={false}
                      file={{ name: f.name ?? 'ملف', path, downloadPath: down }}
                      fallback={
                        <a className="wk-btn sm" href={down} download>
                          <Ic i={Download} />
                          تنزيل
                        </a>
                      }
                    />
                  </li>
                );
              })}
            </ul>
            {copy && copy.hidden > 0 && <small>{copy.hidden} ملفاً في مجلد لا تصل إليه: يأخذه من يملك الوصول.</small>}
            <small>في تطبيق الهاتف يفتح «مشاركة» قائمة التطبيقات: اختر X فيصل إليه الملف مع النص.</small>
          </li>
        )}
        <li data-xh-step="open">
          <b>افتح X</b>
          <div className="wk-xh-row">
            <a className="wk-btn primary" href={composerLink(text)} target="_blank" rel="noopener noreferrer" data-xh-open>
              <Ic i={ExternalLink} />
              افتح X ومعك النص
            </a>
          </div>
          <small>تفتح صفحة النشر في X والنص فيها جاهزاً، فتأكد أنك داخل بحساب @{handleOf(account.handle)}. أضف الملفات من زر الصور فيها ثم اضغط «Post». لا يقبل X ملفات من رابط.</small>
        </li>
        <li data-xh-step="link">
          <b>الصق رابط المنشور</b>
          <small>من المنشور بعد نشره: زر المشاركة ثم «نسخ الرابط»، أو من شريط العنوان.</small>
          <input
            className="wk-inp ltr"
            dir="ltr"
            value={url}
            placeholder={`x.com/${handleOf(account.handle)}/status/…`}
            aria-label="رابط المنشور على X"
            aria-invalid={Boolean(problem)}
            onChange={(e) => {
              setUrl(e.target.value);
              setNote(null);
              if (asked) setAsked(false);
            }}
          />
          {problem && (
            <p className="wk-err" role="alert">
              {problem}
            </p>
          )}
          {note && (
            <p className={`wk-xh-note ${note.level}`} role="status">
              {note.text}
            </p>
          )}
          {parsePostLink(url) && !problem && !note && <small className="ltr">{parsePostLink(url)!.url}</small>}
          <div className="wk-xh-row">
            <button type="button" className="wk-btn primary" disabled={busy || !url.trim()} onClick={() => void confirm()} data-xh-confirm>
              <Ic i={Check} />
              نشرته، سجّل
            </button>
            <button type="button" className="wk-btn quiet" disabled={busy} onClick={() => void notPosted()} data-xh-skip>
              <Ic i={XIcon} />
              لم يُنشر
            </button>
          </div>
        </li>
      </ol>
      {issues.length > 0 && <Hint warn>{issues[0].text}</Hint>}
    </div>
  );
}

'use client';
// The small dialogs of «ورقة الكتابة» (MVP_draft.md 68.5): a request for an opinion, mail and a message from the sheet, a link, the
// comparison of versions, the accounts, and the library. Each opens over the sheet and comes back to it.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { Check, File as FileIcon, Film, ImageIcon, Link2, Search, Upload } from 'lucide-react';
import { diffWords, platformLabels, type AccountRow } from '@/lib/work/rules';
import { docText, type Doc } from '@/lib/writing/doc';
import { uploadImage } from './api';
import { libraryFiles, useWork, type LibraryFile, type TextVersion, type WorkDetail } from '../work/data';
import { Hint, Ic, Modal } from '../work/parts';
import { staffOf } from '../work/plan';

export function AskCard({ d, quote, onClose }: { d: WorkDetail; quote: string; onClose: () => void }) {
  const w = useWork();
  const staff = staffOf(w.people).filter((p) => p.email !== w.me);
  const [to, setTo] = useState(staff[0]?.email ?? '');
  const [body, setBody] = useState(quote ? `«${quote.slice(0, 200)}»\n` : '');
  const send = async () => {
    const r = await w.call('work_ask_opinion', { p_work: d.w.id, p_to: to, p_body: body });
    w.say(r.ok ? `وصل طلب الرأي إلى ${w.nameOf(to)}.` : r.error);
    if (r.ok) onClose();
  };
  return (
    <Modal title="طلب رأي" onClose={onClose}>
      <Hint>يظهر في نقاش العمل ويصل إلى من تختاره. لا يغيّر حالة العمل، وليس اعتماداً.</Hint>
      <label className="l">
        من
        <select className="wk-inp" value={to} onChange={(e) => setTo(e.target.value)}>
          {staff.map((p) => (
            <option key={p.email} value={p.email}>
              {p.display_name}
            </option>
          ))}
        </select>
      </label>
      <label className="l">
        ما رأيك في؟
        <textarea className="wk-inp" rows={4} maxLength={1500} value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      <div className="wk-row-acts">
        <button type="button" className="wk-btn quiet" onClick={onClose}>
          تراجع
        </button>
        <button type="button" className="wk-btn primary" disabled={!to || !body.trim()} onClick={() => void send()}>
          إرسال
        </button>
      </div>
    </Modal>
  );
}

const whatWords = { link: 'رابط العمل فقط', quote: 'النص المحدد', all: 'النص كاملاً' } as const;

export function MailCard({ d, quote, text, onClose }: { d: WorkDetail; quote: string; text: string; onClose: () => void }) {
  const w = useWork();
  const staff = staffOf(w.people).filter((p) => p.email !== w.me);
  const x = d.w;
  const [to, setTo] = useState(staff[0]?.email ?? '');
  const [subject, setSubject] = useState(`${x.id} · ${x.title}`);
  const [what, setWhat] = useState<keyof typeof whatWords>(quote ? 'quote' : 'link');
  const [note, setNote] = useState('');
  const send = async () => {
    const body = [note.trim(), what === 'quote' ? quote : what === 'all' ? text : ''].filter(Boolean).join('\n\n') || `العمل ${x.id}: ${x.title}`;
    const r = await w.call('mail_send', {
      p_thread: null,
      p_subject: subject,
      p_to: [to],
      p_cc: [],
      p_bcc: [],
      p_body: body,
      p_refs: [],
      p_files: [],
      p_card: null,
      p_send_at: null,
      p_links: [{ type: 'work', id: x.id, title: x.title }],
      p_forward: false,
    });
    w.say(r.ok ? `أُرسل البريد إلى ${w.nameOf(to)}.` : r.error);
    if (r.ok) onClose();
  };
  return (
    <Modal title="إرسال كبريد" onClose={onClose}>
      <Hint warn>بريد داخلي. النص غير المعتمد لا يخرج إلى خارج المؤسسة، والبريد الخارجي يبقى بقواعده.</Hint>
      <label className="l">
        إلى
        <select className="wk-inp" value={to} onChange={(e) => setTo(e.target.value)}>
          {staff.map((p) => (
            <option key={p.email} value={p.email}>
              {p.display_name}
            </option>
          ))}
        </select>
      </label>
      <label className="l">
        الموضوع
        <input className="wk-inp" maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </label>
      <label className="l">
        ما يُرسل
        <select className="wk-inp" value={what} onChange={(e) => setWhat(e.target.value as keyof typeof whatWords)}>
          {quote && <option value="quote">{whatWords.quote}</option>}
          <option value="link">{whatWords.link}</option>
          <option value="all">{whatWords.all}</option>
        </select>
      </label>
      <label className="l">
        رسالة قصيرة <small>اختيارية</small>
        <textarea className="wk-inp" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="wk-row-acts">
        <button type="button" className="wk-btn quiet" onClick={onClose}>
          تراجع
        </button>
        <button type="button" className="wk-btn primary" disabled={!to} onClick={() => void send()}>
          إرسال
        </button>
      </div>
    </Modal>
  );
}

export function MessageCard({ d, quote, onClose }: { d: WorkDetail; quote: string; onClose: () => void }) {
  const w = useWork();
  const x = d.w;
  const staff = staffOf(w.people).filter((p) => p.email !== w.me);
  const room = d.chats[0]?.id ?? '';
  const [to, setTo] = useState(room ? `room:${room}` : (staff[0]?.email ?? ''));
  const [body, setBody] = useState('');
  const send = async () => {
    let id = to.startsWith('room:') ? to.slice(5) : '';
    if (!id) {
      const r = await w.call<string>('chat_open_dm', { p_email: to });
      if (!r.ok) return w.say(r.error);
      id = r.data;
    }
    const text = [quote ? `«${quote.slice(0, 300)}»` : '', body.trim(), `(${x.id} · ${x.title})`].filter(Boolean).join('\n');
    const r = await w.call('chat_send', { p_room: id, p_kind: 'text', p_body: text, p_reply: null, p_data: {}, p_urgency: 0, p_forward: false });
    w.say(r.ok ? 'أُرسلت الرسالة.' : r.error);
    if (r.ok) onClose();
  };
  return (
    <Modal title="إرسال كرسالة" onClose={onClose}>
      <label className="l">
        إلى
        <select className="wk-inp" value={to} onChange={(e) => setTo(e.target.value)}>
          {room && <option value={`room:${room}`}>مجموعة العمل {x.id}</option>}
          {staff.map((p) => (
            <option key={p.email} value={p.email}>
              {p.display_name}
            </option>
          ))}
        </select>
      </label>
      {quote && <Hint>يُقتبس النص المحدد: «{quote.slice(0, 90)}»</Hint>}
      <label className="l">
        الرسالة
        <textarea className="wk-inp" rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      <div className="wk-row-acts">
        <button type="button" className="wk-btn quiet" onClick={onClose}>
          تراجع
        </button>
        <button type="button" className="wk-btn primary" disabled={!to || (!body.trim() && !quote)} onClick={() => void send()}>
          إرسال
        </button>
      </div>
    </Modal>
  );
}

export function LinkCard({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [url, setUrl] = useState((editor.getAttributes('link').href as string) ?? '');
  const ok = /^(https?:\/\/|mailto:)/i.test(url.trim());
  return (
    <Modal title="رابط" onClose={onClose}>
      <label className="l">
        العنوان
        <input className="wk-inp ltr" dir="ltr" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
      </label>
      <div className="wk-row-acts">
        {editor.isActive('link') && (
          <button
            type="button"
            className="wk-btn quiet"
            onClick={() => {
              editor.chain().focus().unsetLink().run();
              onClose();
            }}
          >
            إزالة الرابط
          </button>
        )}
        <button type="button" className="wk-btn quiet" onClick={onClose}>
          تراجع
        </button>
        <button
          type="button"
          className="wk-btn primary"
          disabled={!ok}
          onClick={() => {
            editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
            onClose();
          }}
        >
          إدراج
        </button>
      </div>
    </Modal>
  );
}

/** Two versions side by side in one text, or a version against the draft. */
export function CompareCard({ texts, draft, onClose, label }: { texts: TextVersion[]; draft?: Doc | null; onClose: () => void; label: string }) {
  const last = texts[texts.length - 1];
  const [from, setFrom] = useState(Math.max(1, (last?.n ?? 1) - (draft ? 0 : 1)));
  const [to, setTo] = useState<number>(draft ? 0 : (last?.n ?? 1));
  const textOf = (n: number) => (n === 0 && draft ? docText(draft) : (texts.find((t) => t.n === n)?.body ?? ''));
  const parts = useMemo(() => {
    const line = (s: string) => s.replace(/\n+/g, ' ¶ ');
    return diffWords(line(textOf(from)), line(textOf(to)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, texts, draft]);
  const changed = parts.some(([k]) => k !== 's');
  return (
    <Modal title={`مقارنة إصدارات ${label}`} wide onClose={onClose}>
      <div className="wr-cmp">
        <label>
          من
          <select className="wk-inp" value={from} onChange={(e) => setFrom(Number(e.target.value))}>
            {texts.map((t) => (
              <option key={t.n} value={t.n}>
                الإصدار {t.n}
              </option>
            ))}
          </select>
        </label>
        <label>
          إلى
          <select className="wk-inp" value={to} onChange={(e) => setTo(Number(e.target.value))}>
            {texts.map((t) => (
              <option key={t.n} value={t.n}>
                الإصدار {t.n}
              </option>
            ))}
            {draft && <option value={0}>مسودتك الحالية</option>}
          </select>
        </label>
        <span className="wk-chip ok">مضاف</span>
        <span className="wk-chip late">محذوف</span>
      </div>
      <div className="wr-diff">
        {changed
          ? parts.map(([k, word], i) =>
              word === '¶' ? (
                <br key={i} />
              ) : k === 's' ? (
                <span key={i}>{word} </span>
              ) : k === 'a' ? (
                <ins key={i}>{word} </ins>
              ) : (
                <del key={i}>{word} </del>
              ),
            )
          : 'لا فرق بين الإصدارين.'}
      </div>
      <div className="wk-row-acts">
        <button type="button" className="wk-btn" onClick={onClose}>
          إغلاق
        </button>
      </div>
    </Modal>
  );
}

const fileIcon = (k: string) => (k === 'video' ? Film : k === 'image' ? ImageIcon : FileIcon);

/** Pictures and links from «مكتبة الوسائط», or a picture from this device. */
export function MediaCard({ editor, work, onClose }: { editor: Editor; work: string; onClose: () => void }) {
  const w = useWork();
  const [tab, setTab] = useState<'lib' | 'dev'>('lib');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | 'image' | 'video' | 'document'>('all');
  const [files, setFiles] = useState<LibraryFile[] | null>(null);
  const [sel, setSel] = useState<LibraryFile | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => void libraryFiles(q).then((f) => live && setFiles(f)), q ? 250 : 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);
  useEffect(() => {
    if (!file) return setPreview('');
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  const shown = files?.filter((f) => kind === 'all' || f.kind === kind) ?? null;
  const place = () => {
    if (!sel) return;
    editor.chain().focus().insertContent({ type: 'image', attrs: { asset: sel.id, v: sel.current_version, alt: sel.name, width: 75 } }).run();
    onClose();
  };
  const link = () => {
    if (!sel) return;
    editor
      .chain()
      .focus()
      .insertContent([{ type: 'mediaLink', attrs: { asset: sel.id, v: sel.current_version, name: sel.name, kind: sel.kind } }, { type: 'text', text: ' ' }])
      .run();
    onClose();
  };
  const upload = async () => {
    if (!file) return;
    setBusy(true);
    const r = await uploadImage(work, file);
    setBusy(false);
    if (!r.ok) return w.say(r.error);
    editor.chain().focus().insertContent({ type: 'image', attrs: { imageId: r.id, alt: file.name.replace(/\.[^.]+$/, ''), width: 75 } }).run();
    onClose();
  };
  return (
    <Modal title="إدراج صورة أو ملف" wide onClose={onClose}>
      <div className="wk-seg" role="group" aria-label="المصدر">
        <button type="button" aria-pressed={tab === 'lib'} onClick={() => setTab('lib')}>
          مكتبة الوسائط
        </button>
        <button type="button" aria-pressed={tab === 'dev'} onClick={() => setTab('dev')}>
          من الجهاز
        </button>
      </div>
      {tab === 'lib' ? (
        <>
          <div className="wr-mtools">
            <label className="wk-field">
              <Ic i={Search} />
              <input id="wrMediaQ" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم الملف…" aria-label="ابحث باسم الملف" />
            </label>
            <div className="wk-vtabs" role="group" aria-label="النوع">
              {(
                [
                  ['all', 'الكل'],
                  ['image', 'الصور'],
                  ['video', 'الفيديو'],
                  ['document', 'الملفات'],
                ] as const
              ).map(([k, l]) => (
                <button type="button" key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="wr-mgrid">
            {shown === null && <p className="wk-col-hint">جارٍ التحميل…</p>}
            {shown?.length === 0 && <p className="wk-col-hint">لا ملفات تطابق البحث في المجلدات التي تصل إليها.</p>}
            {shown?.map((f) => (
              <button type="button" key={f.id} className="wr-mitem" data-file={f.id} aria-pressed={sel?.id === f.id} onClick={() => setSel(f)}>
                <span className="wr-mthumb">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {f.kind === 'image' ? <img src={`/api/media/${f.id}/content`} alt="" loading="lazy" /> : <Ic i={fileIcon(f.kind)} />}
                </span>
                <b>{f.name}</b>
                <small>الإصدار {f.current_version}</small>
              </button>
            ))}
          </div>
          <Hint>يبقى الملف في مجلده بصلاحياته: يظهر لمن يملك الوصول، ويرى غيره أن الملف في مجلد لا يصل إليه.</Hint>
          <div className="wk-row-acts">
            <button type="button" className="wk-btn quiet" onClick={onClose}>
              تراجع
            </button>
            <button type="button" className="wk-btn" disabled={!sel} onClick={link}>
              <Ic i={Link2} />
              رابط إلى الملف
            </button>
            <button type="button" className="wk-btn primary" disabled={sel?.kind !== 'image'} title={sel && sel.kind !== 'image' ? 'الفيديو والملفات تُدرج رابطاً' : undefined} onClick={place}>
              <Ic i={ImageIcon} />
              إدراج في النص
            </button>
          </div>
        </>
      ) : (
        <>
          <Hint>تُحفظ الصورة مع مستندات العمل في Drive. الصورة الكبيرة تُصغَّر قبل رفعها، ولا يُقبل SVG.</Hint>
          <input ref={input} type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif" aria-label="اختر صورة" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button type="button" className="wk-btn" onClick={() => input.current?.click()}>
            <Ic i={Upload} />
            اختر صورة
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview && <img className="wr-mprev" src={preview} alt="" />}
          <div className="wk-row-acts">
            <button type="button" className="wk-btn quiet" onClick={onClose}>
              تراجع
            </button>
            <button type="button" className="wk-btn primary" disabled={!file || busy} onClick={() => void upload()}>
              {busy ? 'جارٍ الرفع…' : 'إدراج في النص'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

/** The accounts of a work, chosen before sending, so a copy can be written (MVP_draft.md 68.5). */
export function AccountsCard({ d, onClose, reload }: { d: WorkDetail; onClose: () => void; reload: () => Promise<void> }) {
  const w = useWork();
  const [picked, setPicked] = useState<string[]>(d.w.channels);
  const shown = w.accounts.filter((a: AccountRow) => a.active && a.platform !== 'mail');
  const save = async () => {
    const r = await w.call('work_set_channels', { p_work: d.w.id, p_channels: picked });
    if (!r.ok) return w.say(r.error);
    await reload();
    onClose();
  };
  return (
    <Modal title="الحسابات" onClose={onClose}>
      <Hint>تظهر نسخة لكل منصة تختار حسابها. المراجعة تعتمد الحسابات مع النص.</Hint>
      <div className="wk-chanlist">
        {shown.map((a) => (
          <label className="wk-chanrow" key={a.id}>
            <input type="checkbox" checked={picked.includes(a.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, a.id] : picked.filter((p) => p !== a.id))} />
            <span>
              <b>
                {platformLabels[a.platform]} · {a.label}
              </b>
              <small>{a.handle}</small>
            </span>
            {picked.includes(a.id) && <Ic i={Check} />}
          </label>
        ))}
        {!shown.length && <p className="wk-col-hint">لا حسابات مفعّلة.</p>}
      </div>
      <div className="wk-row-acts">
        <button type="button" className="wk-btn quiet" onClick={onClose}>
          تراجع
        </button>
        <button type="button" className="wk-btn primary" onClick={() => void save()}>
          حفظ
        </button>
      </div>
    </Modal>
  );
}

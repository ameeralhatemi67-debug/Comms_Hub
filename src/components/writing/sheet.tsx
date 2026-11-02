'use client';
// «ورقة الكتابة» (MVP_draft.md section 68): one place to write a work's main text and its platform copies, with the brief, the
// reviewers' notes and the versions beside the page. The main text is a document kept in Drive, a version at a time; a draft
// is private and never a version; copies are plain text, because platforms take no formatting. Rules live in the database:
// this page only offers what `canWriteText` says the database will accept.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Check, Clock, FileText, Keyboard, Mail, MessageCircle, Plus, Send, Users, X } from 'lucide-react';
import { native } from '@/lib/native';
import { checkCopy, limitsOf } from '@/lib/platforms/limits';
import { mediaCounts } from '@/lib/platforms/copies';
import { PLATFORM_ORDER, canSendWork, canWriteText, isLead, platformInfo, platformLabels, textEditable, textLabels, workErrorText, type Platform, type StageRow } from '@/lib/work/rules';
import { docIsEmpty, docStats, docText, emptyDoc, imageSrc, textToDoc, type Doc } from '@/lib/writing/doc';
import { shortcutOf, SHORTCUTS } from '@/lib/writing/shortcuts';
import { fileUrl, loadVersion, makePdf, readLocalDraft, readRemoteDraft, saveVersion, uploadWord, writeLocalDraft, writeRemoteDraft, type Draft } from './api';
import { AccountsCard, AskCard, CompareCard, LinkCard, MailCard, MediaCard, MessageCard } from './cards';
import { overlayHits, overlayKey, setOverlay, writingExtensions } from './extensions';
import { Ribbon, type RibbonCtx, type RibbonTab } from './ribbon';
import { SidePanel, type SideTab } from './side';
import { TableHandles } from './table-handles';
import { tableInfo } from './table-ops';
import { Sheet } from '../sheet';
import { useWork, type TextVersion, type WorkDetail, type WorkNote } from '../work/data';
import { CheckList } from '../work/post-preview';
import { Hint, Ic, Modal, StatusChip } from '../work/parts';

type Target = 'main' | Platform;
type Card = 'ask' | 'mail' | 'msg' | 'link' | 'media' | 'accounts' | 'compare' | 'palette' | 'finish' | null;

export type WritingSheetProps = {
  d: WorkDetail;
  target?: Target;
  reload: () => Promise<void>;
  onClose: () => void;
  onSend: () => void;
  onExt: (s: StageRow) => void;
  onFinish: (s: StageRow) => Promise<boolean>;
};

const WORD_WARNING = 'فُتح الملف في الورقة. تبقى العناوين والقوائم والجداول والغامق، ولا تُنقل الخطوط والأحجام والألوان وحدود الجداول.';

function saveBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

/** A picture's bytes and size for the Word file. Types Word does not take are redrawn as PNG. */
async function wordImage(url: string) {
  const res = await fetch(url);
  if (!res.ok) return null;
  const blob = await res.blob();
  const bmp = await createImageBitmap(blob);
  const size = { width: bmp.width, height: bmp.height };
  const type = blob.type.includes('png') ? 'png' : blob.type.includes('jpeg') ? 'jpg' : blob.type.includes('gif') ? 'gif' : null;
  if (type) return { data: await blob.arrayBuffer(), type: type as 'png' | 'jpg' | 'gif', ...size };
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  canvas.getContext('2d')?.drawImage(bmp, 0, 0);
  return { data: await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer(), type: 'png' as const, ...size };
}

export function WritingSheet({ d, target = 'main', reload, onClose, onSend, onExt, onFinish }: WritingSheetProps) {
  const w = useWork();
  const x = d.w;
  const label = textLabels[x.type];
  const last = d.texts[d.texts.length - 1] as TextVersion | undefined;
  const plats = useMemo(() => PLATFORM_ORDER.filter((p) => x.channels.some((c) => w.accounts.find((a) => a.id === c)?.platform === p) || d.variants.some((v) => v.platform === p)), [x.channels, w.accounts, d.variants]);
  const latest = useCallback((p: string) => d.variants.filter((v) => v.platform === p).sort((a, b) => b.n - a.n)[0], [d.variants]);
  const writable = canWriteText(w.role, w.me, x, d.stages) && textEditable(x);
  const canSend = canSendWork(w.role, w.me, x);
  const myStage = d.stages.find((s) => s.who === w.me && !s.done_at) ?? null;

  const [tab, setTab] = useState<Target>(target);
  const [copies, setCopies] = useState<Record<string, string>>({});
  const [side, setSide] = useState<SideTab>(x.status === 'CHANGES_REQUESTED' ? 'notes' : 'brief');
  const [ribbon, setRibbon] = useState<RibbonTab>('home');
  const [card, setCard] = useState<Card>(null);
  const [page, setPage] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [focus, setFocus] = useState(false);
  const [find, setFind] = useState<{ q: string; r: string; replace: boolean } | null>(null);
  const [tick, setTick] = useState(0);
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState('');
  const [state, setState] = useState('');
  const [fallback, setFallback] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState('');
  const [wrap, setWrap] = useState<HTMLDivElement | null>(null);
  const baseText = useRef('');
  const changed = useRef(false);
  const sent = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wordInput = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const copyRefs = useRef(copies);
  copyRefs.current = copies;

  const editor = useEditor({
    extensions: useMemo(() => writingExtensions(x.id, `اكتب ${label} هنا…`), [x.id, label]),
    content: emptyDoc(),
    editable: writable,
    immediatelyRender: false,
    editorProps: { attributes: { dir: 'rtl', class: 'wr-paper-in', spellcheck: 'false', 'aria-label': label } },
    onUpdate: () => touched(),
    onTransaction: () => setTick((t) => t + 1),
  });

  const draftNow = useCallback((): Draft => {
    const tabs: Draft['tabs'] = {};
    if (editor) tabs.main = editor.getJSON() as Doc;
    for (const [k, v] of Object.entries(copyRefs.current)) if (v !== (latest(k)?.body ?? '')) tabs[k] = v;
    return { at: new Date().toISOString(), base: last?.n ?? 0, tabs };
  }, [editor, latest, last?.n]);

  /** The browser keeps the draft a moment after typing stops. */
  function touched() {
    if (!ready) return;
    changed.current = true;
    setState('جارٍ الحفظ…');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      writeLocalDraft(x.id, w.me, draftNow());
      setState('حُفظت المسودة، ولا يراها غيرك');
    }, 1200);
  }

  // Once a minute, and on closing, the draft also goes to its private file in Drive.
  const pushDraft = useCallback(async () => {
    if (!changed.current || sent.current === tick || !editor) return;
    sent.current = tick;
    await writeRemoteDraft(x.id, editor.getJSON() as Doc);
  }, [editor, tick, x.id]);
  const push = useRef(pushDraft);
  push.current = pushDraft;
  useEffect(() => {
    const t = setInterval(() => void push.current(), 60000);
    return () => clearInterval(t);
  }, []);

  // What the sheet opens on: the latest version, under the newest draft that is younger than it.
  useEffect(() => {
    if (!editor) return;
    let live = true;
    void (async () => {
      let base: Doc = last ? textToDoc(last.body) : emptyDoc();
      if (last?.master_ref && !last.pruned_at) {
        const master = await loadVersion(x.id, last.n);
        if (master) base = master;
        else setFallback(true);
      }
      // A draft counts unless a version was saved after it: this browser's own says which version it was written on, and the Drive
      // file's time comes from the database, so a wrong clock here cannot hide what was typed.
      const fresh = (v: Draft) => (v.base === undefined ? !last || v.at > last.created_at : v.base >= (last?.n ?? 0));
      const draft = [readLocalDraft(x.id, w.me), await readRemoteDraft(x.id)].filter((v): v is Draft => !!v && fresh(v)).sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
      if (!live) return;
      baseText.current = docText(base);
      const start = (draft?.tabs.main as Doc | undefined) ?? base;
      editor.chain().setMeta('addToHistory', false).setContent(start, { emitUpdate: false }).run();
      const c: Record<string, string> = {};
      for (const p of plats) c[p] = (draft?.tabs[p] as string | undefined) ?? latest(p)?.body ?? '';
      setCopies(c);
      setState(draft ? 'مسودتك محفوظة، ولا يراها غيرك' : '');
      if (draft) changed.current = true;
      setReady(true);
      // Straight to the text on a computer. On a phone the keyboard waits until the person taps the page.
      if (writable && x.status !== 'IN_REVIEW' && target === 'main' && window.matchMedia('(pointer:fine)').matches) editor.commands.focus('end');
    })();
    return () => {
      live = false;
    };
    // Only on opening: a save reloads the work and must not replace what is on the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  useEffect(() => {
    editor?.setEditable(writable && !['IN_REVIEW'].includes(x.status));
  }, [editor, writable, x.status]);

  // The studio's fonts travel with their own stylesheet, loaded only here.
  useEffect(() => {
    void import('../studio/studio-fonts');
  }, []);

  // Notes sit on their sentences as marks that are never stored.
  const openNotes = useMemo(() => d.notes.filter((n) => !n.resolved_at && n.part === 'text' && n.quote), [d.notes]);
  const [noteOn, setNoteOn] = useState('');
  useEffect(() => {
    if (editor && ready) setOverlay(editor, { notes: openNotes.map((n) => ({ id: n.id, quote: n.quote as string, active: n.id === noteOn })) });
  }, [editor, ready, openNotes, noteOn]);

  // «الجدول» and «الصورة» come forward by themselves, and the ribbon goes back when they leave.
  const place = useRef<{ was: RibbonTab; in: '' | 'table' | 'image' }>({ was: 'home', in: '' });
  useEffect(() => {
    if (!editor) return;
    const now = editor.isActive('image') ? 'image' : tableInfo(editor) ? 'table' : '';
    const p = place.current;
    if (now === p.in) return;
    if (now) {
      if (!p.in) p.was = ribbon === 'table' || ribbon === 'image' ? 'home' : ribbon;
      setRibbon(now);
    } else if (ribbon === 'table' || ribbon === 'image') setRibbon(p.was);
    p.in = now;
  }, [editor, tick, ribbon]);

  const plain = editor && ready ? docText(editor.getJSON() as Doc) : '';
  const stats = docStats(tab === 'main' ? plain : (copies[tab] ?? ''));
  const locked = !writable || x.status === 'IN_REVIEW';
  const stale = (p: string) => {
    const v = latest(p);
    return !!(last && v?.body.trim() && v.base < last.n);
  };
  const flagged = (p: string) => d.notes.some((n) => !n.resolved_at && n.part === `v:${p}`) || d.flags.some((f) => f.part === `v:${p}`);

  const saveMain = async (): Promise<number | null> => {
    if (!editor) return null;
    const doc = editor.getJSON() as Doc;
    if (docIsEmpty(doc)) {
      w.say('لا يوجد نص لحفظه.');
      return null;
    }
    if (last && docText(doc) === last.body && !changed.current) {
      w.say('لا تغيير عن آخر إصدار.');
      return last.n;
    }
    setBusy(true);
    const r = await saveVersion(x.id, doc, note);
    setBusy(false);
    if (!r.ok) {
      w.say(workErrorText(r.error));
      return null;
    }
    changed.current = false;
    if (timer.current) clearTimeout(timer.current);
    writeLocalDraft(x.id, w.me, null);
    setNote('');
    setState('لا تغيير عن آخر إصدار');
    w.say(r.reopened ? `حُفظ الإصدار ${r.n}، وعاد إلى المراجعة.` : `حُفظ الإصدار ${r.n}.`);
    await reload();
    void refreshFiles(r.n, doc);
    return r.n;
  };

  const saveCopy = async (p: Platform) => {
    const r = await w.call('work_text_save', { p_work: x.id, p_target: p, p_body: copies[p] ?? '', p_note: '' });
    if (!r.ok) return w.say(r.error);
    w.say(`حُفظت نسخة ${platformLabels[p]}.`);
    await reload();
  };

  const save = () => (tab === 'main' ? saveMain() : saveCopy(tab));

  const wordBlob = async (doc: Doc, n: number) => {
    const { docToDocx } = await import('@/lib/writing/docx');
    const approved = d.approvals.some((a) => a.part === 'text' && a.ver === `t${n}`);
    return docToDocx(doc, {
      title: x.title,
      headerText: `${x.id} · ${x.title} · الإصدار ${n}${approved ? '' : ' · مسودة'}`,
      origin: location.origin,
      image: (a) => wordImage(imageSrc(x.id, a)),
    });
  };

  /** «الحالي» follows every saved version: the Word file from here, then the PDF through Drive. */
  const refreshFiles = async (n: number, doc: Doc) => {
    const up = await uploadWord(x.id, n, await wordBlob(doc, n));
    if (up.ok) await makePdf(x.id, n);
  };

  const exportAs = async (kind: 'docx' | 'pdf' | 'txt') => {
    if (!editor || !last) return w.say('احفظ إصداراً أولاً.');
    setExporting(kind);
    const n = changed.current ? await saveMain() : last.n;
    if (n) {
      if (kind !== 'txt') {
        const doc = editor.getJSON() as Doc;
        const blob = await wordBlob(doc, n);
        const up = await uploadWord(x.id, n, blob);
        const pdf = up.ok && kind === 'pdf' ? await makePdf(x.id, n) : up;
        if (!pdf.ok) {
          setExporting('');
          // The Word file was made here, so it can still be saved from here. The Android application accepts files from the site only.
          if (kind === 'docx' && native().platform === 'web') saveBlob(blob, `${x.id} ${x.title}.docx`);
          return w.say(workErrorText(pdf.error));
        }
      }
      const a = document.createElement('a');
      a.href = fileUrl(x.id, kind);
      a.download = '';
      a.click();
      w.say(kind === 'docx' ? 'نُزّل ملف Word، وهو في مجلد «الحالي» أيضاً.' : kind === 'pdf' ? 'نُزّل ملف PDF، وهو في مجلد «الحالي» أيضاً.' : 'نُزّل النص.');
    }
    setExporting('');
  };

  const importWord = async (file: File | undefined) => {
    if (!file || !editor) return;
    if (!/\.docx$/i.test(file.name)) return w.say('اختر ملف Word بصيغة docx.');
    try {
      const mammoth = await import('mammoth');
      const r = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() }, { styleMap: ['u => u'] });
      editor.chain().focus().insertContent(r.value).run();
      w.say(WORD_WARNING);
    } catch {
      w.say('تعذّر فتح الملف. تأكد أنه ملف Word سليم.');
    }
  };

  const restore = async (t: TextVersion) => {
    if (!editor) return;
    const doc = (t.master_ref && !t.pruned_at && (await loadVersion(x.id, t.n))) || textToDoc(t.body);
    editor.chain().focus().setContent(doc).run();
    changed.current = true;
    touched();
    w.say(`عاد نص الإصدار ${t.n} مسودةً. احفظه ليصبح إصداراً جديداً.`);
  };

  const fromMain = () => {
    if (!editor || tab === 'main') return;
    const text = docText(editor.getJSON() as Doc, { images: false });
    setCopies((c) => ({ ...c, [tab]: text }));
    touched();
    w.say('نُقل النص الأساسي دون تنسيق. عدّله لهذه المنصة.');
  };

  const goNote = (n: WorkNote) => {
    setNoteOn(n.id);
    const t: Target = n.part === 'text' ? 'main' : (n.part.replace('v:', '') as Platform);
    setTab(t);
    if (t === 'main' && editor && n.quote) {
      const at = document.querySelector(`[data-note="${n.id}"]`);
      at?.scrollIntoView({ block: 'center' });
    }
  };

  const resolve = async (n: WorkNote) => {
    const r = await w.call('work_note_resolve', { p_id: n.id });
    if (!r.ok) return w.say(r.error);
    await reload();
  };

  const finish = async (save0: boolean) => {
    setCard(null);
    if (save0 && !(await saveMain())) return;
    if (myStage) await onFinish(myStage);
  };
  const askFinish = () => {
    if (!myStage) return;
    if (changed.current || (!d.texts.length && myStage.role === 'writer')) return setCard('finish');
    void finish(false);
  };

  const send = async () => {
    if (tab === 'main' && changed.current && !(await saveMain())) return;
    if (canSend) onSend();
    else askFinish();
  };

  const close = () => {
    // A card sits inside this dialog, so its Escape reaches here too: only the card closes.
    if (card) return setCard(null);
    if (document.querySelector('.wr-pop')) return void document.dispatchEvent(new Event('wr-close-pop'));
    if (find) return closeFind();
    if (timer.current) {
      clearTimeout(timer.current);
      writeLocalDraft(x.id, w.me, draftNow());
    }
    void pushDraft();
    onClose();
  };

  const closeFind = () => {
    setFind(null);
    if (editor) setOverlay(editor, { find: '', at: 0 });
  };
  const openFind = (replace: boolean) => {
    if (tab === 'main') {
      const sel = editor ? editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to) : '';
      setFind({ q: sel.slice(0, 40), r: '', replace });
      if (editor && sel) setOverlay(editor, { find: sel.slice(0, 40), at: 0 });
    }
  };
  const findNext = () => {
    if (!editor) return;
    const hits = overlayHits(editor);
    if (!hits.length) return;
    const i = ((overlayKey.getState(editor.state)?.at ?? 0) + 1) % hits.length;
    setOverlay(editor, { at: i });
    editor.chain().setTextSelection(hits[i]).scrollIntoView().run();
  };
  const replaceAll = () => {
    if (!editor || !find?.q) return;
    const hits = overlayHits(editor);
    const tr = editor.state.tr;
    for (const h of [...hits].reverse()) tr.insertText(find.r, h.from, h.to);
    editor.view.dispatch(tr);
    w.say(`استُبدلت ${hits.length} نتيجة.`);
  };

  const selected = () => (editor && !editor.state.selection.empty ? editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, '\n') : '');

  const command = (id: string) => {
    const c = () => editor?.chain().focus();
    switch (id) {
      case 'bold':
        return c()?.toggleBold().run();
      case 'italic':
        return c()?.toggleItalic().run();
      case 'underline':
        return c()?.toggleUnderline().run();
      case 'strike':
        return c()?.toggleStrike().run();
      case 'font':
        return setRibbon('home'), setTimeout(() => document.getElementById('wrFont')?.focus());
      case 'p':
        return c()?.setParagraph().run();
      case 'h1':
      case 'h2':
      case 'h3':
        return c()?.setHeading({ level: (Number(id[1]) + 1) as 2 | 3 | 4 }).run();
      case 'bigger':
      case 'smaller': {
        const cur = parseInt((editor?.getAttributes('textStyle').fontSize as string) ?? '16', 10);
        const next = id === 'bigger' ? cur + 2 : Math.max(10, cur - 2);
        return c()?.setFontSize(`${next}px`).run();
      }
      case 'right':
      case 'center':
      case 'left':
      case 'justify':
        return c()?.setTextAlign(id).run();
      case 'ul':
        return c()?.toggleBulletList().run();
      case 'ol':
        return c()?.toggleOrderedList().run();
      case 'image':
        return setCard('media');
      case 'link':
        return setCard('link');
      case 'find':
        return openFind(false);
      case 'replace':
        return openFind(true);
      case 'save':
        return void save();
      case 'send':
        return void send();
      case 'ext':
        return myStage ? onExt(myStage) : w.say('لا مرحلة لك في هذا العمل.');
      case 'ask':
        return setCard('ask');
      case 'mail':
        return setCard('mail');
      case 'msg':
        return setCard('msg');
      case 'done':
        return askFinish();
      case 'brief':
      case 'notes':
      case 'vers':
        return setFocus(false), setSide(id);
      case 'compare':
        return setCard('compare');
      case 'focus':
        return setFocus((v) => !v);
      case 'palette':
        return setCard('palette');
    }
  };

  // On the document, because a button that disappears takes the focus out of the sheet, and the keys must keep working.
  const onKey = (e: KeyboardEvent) => {
    if (card || [...document.querySelectorAll('dialog[open]')].pop() !== root.current?.closest('dialog')) return;
    // The editor keeps Escape from the dialog, so the sheet answers it: a panel or the search first, then the sheet.
    if (e.key === 'Escape') {
      e.preventDefault();
      return close();
    }
    if (e.altKey && !e.ctrlKey && !e.metaKey && /^Digit[1-9]$/.test(e.code)) {
      const all: Target[] = ['main', ...plats];
      const t = all[Number(e.code.slice(5)) - 1];
      if (t) {
        e.preventDefault();
        setTab(t);
      }
      return;
    }
    const s = shortcutOf(e);
    if (!s) return;
    e.preventDefault();
    e.stopPropagation();
    if (s.rich && (tab !== 'main' || locked)) return w.say(locked ? 'النص مقفل الآن.' : 'التنسيق في النص الأساسي فقط: نسخ المنصات نص عادي.');
    command(s.id);
  };
  const keys = useRef(onKey);
  keys.current = onKey;
  useEffect(() => {
    const on = (e: KeyboardEvent) => keys.current(e);
    document.addEventListener('keydown', on, true);
    return () => document.removeEventListener('keydown', on, true);
  }, []);

  const ctx: RibbonCtx = {
    locked,
    page,
    setPage,
    zoom,
    setZoom,
    focus,
    setFocus,
    find: () => openFind(true),
    media: () => setCard('media'),
    link: () => setCard('link'),
    phrases: () => {
      setFocus(false);
      setSide('phr');
    },
    exportAs: (k) => void exportAs(k),
    importWord: () => wordInput.current?.click(),
    exporting,
  };

  const notesOpen = d.notes.filter((n) => !n.resolved_at).length;
  const showRibbon = tab === 'main' && editor;

  return (
    <Sheet label={`ورقة الكتابة: ${x.title}`} onClose={close}>
      <div ref={root} className={`wr-sheet ${focus ? 'focus' : ''}`} data-gd="writing-sheet" data-fb-private>
        <header className="wr-head">
          <div className="wr-title">
            <h2>{x.title}</h2>
            <small>
              ورقة الكتابة · {x.id}
              {myStage ? ` · مرحلتك: ${myStage.name}` : ''}
              {x.assignee ? ` · المسؤول ${w.nameOf(x.assignee)}` : ''}
            </small>
          </div>
          <StatusChip status={x.status} />
          {state && (
            <span className="wr-state" role="status">
              <Ic i={Check} />
              {state}
            </span>
          )}
          <button type="button" className="pf-btn" onClick={close}>
            إغلاق
          </button>
        </header>

        {x.status === 'CHANGES_REQUESTED' && (
          <div className="wr-banner warn">
            عاد من المراجعة{notesOpen ? `: ${notesOpen} ملاحظات لم تُعالج` : ''}.
            <button type="button" className="wk-lk" onClick={() => setSide('notes')}>
              عرض الملاحظات
            </button>
          </div>
        )}
        {x.status === 'IN_REVIEW' && (
          <div className="wr-banner">
            قيد المراجعة: النص مقفل حتى يصدر القرار.
            {(isLead(w.role) || d.cycles.find((c) => c.n === x.review_cycle)?.sent_by === w.me) && !x.move_from && !d.decisions.some((c) => c.cycle === x.review_cycle) && (
              <button
                type="button"
                className="wk-btn sm"
                onClick={async () => {
                  const r = await w.call('work_withdraw', { p_work: x.id });
                  if (!r.ok) return w.say(r.error);
                  w.say('سُحب الإرسال، وعاد النص إليك.');
                  await reload();
                }}
              >
                سحب الإرسال
              </button>
            )}
          </div>
        )}
        {['APPROVED', 'SCHEDULED'].includes(x.status) && writable && <div className="wr-banner warn">هذا العمل معتمد. حفظ إصدار جديد يعيد الجزء إلى المراجعة{x.status === 'SCHEDULED' ? ' ويعلّق الجدولة' : ''}.</div>}
        {!writable && x.status !== 'IN_REVIEW' && <div className="wr-banner">هذه الورقة للقراءة. الكتابة لـ«المسؤول» وصاحب مرحلة الكتابة والقيادة.</div>}
        {fallback && <div className="wr-banner warn">تعذّرت قراءة النسخة المنسقة من Drive، فعُرض نصها العادي. لا تحفظ قبل أن يعود الاتصال.</div>}

        <div className="wr-targets" role="group" aria-label="النص والنسخ">
          <button type="button" aria-pressed={tab === 'main'} title="Alt+1" onClick={() => setTab('main')}>
            {label}
          </button>
          {plats.map((p, i) => (
            <button type="button" key={p} aria-pressed={tab === p} title={`Alt+${i + 2}`} data-target={p} onClick={() => setTab(p)}>
              {platformLabels[p]}
              {(stale(p) || flagged(p)) && <i className="flag" aria-label="تحتاج مراجعة" />}
            </button>
          ))}
          {canSend && !locked && (
            <button type="button" className="add" onClick={() => setCard('accounts')}>
              <Ic i={Plus} />
              حساب
            </button>
          )}
        </div>

        {showRibbon && <Ribbon editor={editor} ctx={ctx} tab={ribbon} setTab={setRibbon} />}

        <div className="wr-body">
          <div className="wr-main">
            {find && tab === 'main' && (
              <div className="wr-find">
                <input
                  aria-label="بحث"
                  placeholder="بحث"
                  autoFocus
                  value={find.q}
                  onChange={(e) => {
                    setFind({ ...find, q: e.target.value });
                    if (editor) setOverlay(editor, { find: e.target.value, at: 0 });
                  }}
                />
                {find.replace && <input aria-label="استبدال" placeholder="استبدال بـ" value={find.r} onChange={(e) => setFind({ ...find, r: e.target.value })} />}
                <button type="button" className="wk-btn sm" onClick={findNext}>
                  التالي
                </button>
                {find.replace && (
                  <button type="button" className="wk-btn sm" disabled={!find.q || locked} onClick={replaceAll}>
                    استبدال الكل
                  </button>
                )}
                <small>{editor ? `${overlayHits(editor).length} نتيجة` : ''}</small>
                <button type="button" className="wk-btn icon quiet" aria-label="إغلاق البحث" onClick={closeFind}>
                  <Ic i={X} />
                </button>
              </div>
            )}
            <div className="wr-desk" hidden={tab !== 'main'}>
              <div className="wr-pagewrap" ref={setWrap}>
                <div className={`wr-paper ${page ? '' : 'wide'}`} style={{ zoom }}>
                  <EditorContent editor={editor} />
                </div>
                {editor && tab === 'main' && !locked && <TableHandles editor={editor} wrap={wrap} tick={tick} />}
              </div>
            </div>
            {tab !== 'main' && (
              <div className="wr-copy">
                <Hint>المنصات لا تقبل التنسيق، فالنسخة نص عادي.</Hint>
                {!locked && (
                  <div className="wr-copybar">
                    <button type="button" className="wk-btn sm" id="wrFromMain" onClick={fromMain}>
                      <Ic i={FileText} />
                      ابدأ من {label}
                    </button>
                    {stale(tab) && (
                      <>
                        <button
                          type="button"
                          className="wk-btn sm"
                          onClick={async () => {
                            const r = await w.call('work_variant_confirm', { p_work: x.id, p_platform: tab });
                            if (!r.ok) return w.say(r.error);
                            w.say('أُكدت الصياغة.');
                            await reload();
                          }}
                        >
                          <Ic i={Check} />
                          تأكيد الصياغة
                        </button>
                        <span className="wk-chip warn">تحتاج مراجعة</span>
                      </>
                    )}
                  </div>
                )}
                <textarea
                  className="wr-copytext"
                  aria-label={`نسخة ${platformLabels[tab]}`}
                  value={copies[tab] ?? ''}
                  readOnly={locked}
                  placeholder={`نسخة ${platformLabels[tab]}…`}
                  onChange={(e) => {
                    setCopies((c) => ({ ...c, [tab]: e.target.value }));
                    touched();
                  }}
                />
                <CheckList check={checkCopy(limitsOf(platformInfo(tab)?.accepts), { text: copies[tab] ?? '', ...mediaCounts(d.assets), typeVideo: x.type === 'video' })} limits={limitsOf(platformInfo(tab)?.accepts)} />
              </div>
            )}
            <div className="wr-status">
              <span>{stats.words} كلمة</span>
              <span>{stats.chars} حرفاً</span>
              {tab === 'main' && <span>{stats.minutes < 1 ? 'أقل من دقيقة' : `نحو ${Math.round(stats.minutes)} دقيقة`} قراءة</span>}
              <span>{last ? `الإصدار ${last.n}` : 'لا إصدار بعد'}</span>
            </div>
          </div>
          {!focus && (
            <SidePanel
              d={d}
              tab={side}
              setTab={setSide}
              editor={editor}
              plain={tab === 'main' ? plain : (copies[tab] ?? '')}
              rich={tab === 'main'}
              notes={d.notes}
              canResolve={writable}
              onGoNote={goNote}
              onResolve={(n) => void resolve(n)}
              onCompare={() => setCard('compare')}
              onRestore={(t) => void restore(t)}
              mainDoc={() => (editor && ready ? (editor.getJSON() as Doc) : null)}
            />
          )}
        </div>

        <footer className="wr-foot">
          <input aria-label="ما الذي تغيّر؟" placeholder="ما الذي تغيّر؟ اختياري" maxLength={200} value={note} disabled={locked} onChange={(e) => setNote(e.target.value)} />
          <button type="button" className="wk-btn" id="wrSave" disabled={locked || busy} title="Ctrl+S" onClick={() => void save()}>
            <Ic i={Check} />
            {busy ? 'جارٍ الحفظ…' : 'حفظ إصدار'}
          </button>
          {(canSend || myStage) && (
            <button type="button" className="wk-btn primary" id="wrSend" disabled={locked} title="Ctrl+Enter" onClick={() => void send()}>
              <Ic i={Send} />
              {canSend ? (d.cycles.length ? 'إعادة الإرسال للمراجعة' : 'إرسال للمراجعة') : `تسليم إلى ${w.nameOf(x.assignee) || 'المسؤول'}`}
            </button>
          )}
          <div className="wr-quick" aria-label="اختصارات التطبيق">
            {myStage && (
              <button type="button" title="Ctrl+Alt+T" onClick={() => onExt(myStage)}>
                <Ic i={Clock} />
                طلب تمديد
              </button>
            )}
            <button type="button" title="Ctrl+Alt+O" onClick={() => setCard('ask')}>
              <Ic i={Users} />
              طلب رأي
            </button>
            <button type="button" title="Ctrl+Alt+M" onClick={() => setCard('mail')}>
              <Ic i={Mail} />
              بريد
            </button>
            <button type="button" title="Ctrl+Alt+G" onClick={() => setCard('msg')}>
              <Ic i={MessageCircle} />
              رسالة
            </button>
            {myStage && (
              <button type="button" title="Ctrl+Alt+D" onClick={askFinish}>
                <Ic i={Check} />
                تمّت
              </button>
            )}
            <button type="button" title="Ctrl+/" onClick={() => setCard('palette')}>
              <Ic i={Keyboard} />
              كل الأوامر
            </button>
          </div>
        </footer>
        <input ref={wordInput} type="file" hidden accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" aria-label="اختر ملف Word" onChange={(e) => void importWord(e.target.files?.[0])} />
      </div>

      {card === 'ask' && <AskCard d={d} quote={selected()} onClose={() => setCard(null)} />}
      {card === 'mail' && <MailCard d={d} quote={selected()} text={plain} onClose={() => setCard(null)} />}
      {card === 'msg' && <MessageCard d={d} quote={selected()} onClose={() => setCard(null)} />}
      {card === 'link' && editor && <LinkCard editor={editor} onClose={() => setCard(null)} />}
      {card === 'media' && editor && <MediaCard editor={editor} work={x.id} onClose={() => setCard(null)} />}
      {card === 'accounts' && <AccountsCard d={d} reload={reload} onClose={() => setCard(null)} />}
      {card === 'compare' && <CompareCard texts={d.texts} label={label} draft={changed.current && editor ? (editor.getJSON() as Doc) : null} onClose={() => setCard(null)} />}
      {card === 'palette' && <Palette onClose={() => setCard(null)} run={command} work={x.id} locked={locked} />}
      {card === 'finish' && (
        <Modal title={`إنهاء «${myStage?.name ?? ''}»`} onClose={() => setCard(null)}>
          <Hint warn>{changed.current ? 'لديك مسودة لم تُحفظ إصداراً. المسودة خاصة بك ولن يراها من بعدك.' : 'لا يوجد نص محفوظ في هذا العمل.'}</Hint>
          <div className="wk-row-acts">
            <button type="button" className="wk-btn quiet" onClick={() => setCard(null)}>
              تراجع
            </button>
            <button type="button" className="wk-btn" onClick={() => void finish(false)}>
              إنهاء دون حفظ
            </button>
            <button type="button" className="wk-btn primary" disabled={locked} onClick={() => void finish(true)}>
              حفظ إصدار ثم إنهاء
            </button>
          </div>
        </Modal>
      )}
    </Sheet>
  );
}

type Hit = { work_id: string; title: string; part: 'text' | 'copy'; platform: Platform | null; n: number; snippet: string };

/** Ctrl+/: every command with its key, and a search inside the texts of works this person may see. */
function Palette({ onClose, run, work, locked }: { onClose: () => void; run: (id: string) => void; work: string; locked: boolean }) {
  const w = useWork();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [at, setAt] = useState(0);
  const shown = SHORTCUTS.filter((s) => s.id !== 'palette' && (!locked || !s.rich) && (!q || s.label.includes(q)));
  useEffect(() => {
    if (q.trim().length < 2) return setHits([]);
    let live = true;
    const t = setTimeout(async () => {
      const r = await w.call<Hit[]>('work_text_search', { p_q: q.trim() });
      if (live && r.ok) setHits(r.data ?? []);
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, w]);
  const go = (i: number) => {
    const s = shown[i];
    if (!s) return;
    onClose();
    setTimeout(() => run(s.id));
  };
  return (
    <Modal title="قائمة الأوامر" onClose={onClose}>
      <input
        className="wk-inp"
        id="wrPalette"
        autoFocus
        aria-label="ابحث عن أمر أو عن كلمة داخل النصوص"
        placeholder="ابحث عن أمر، أو عن كلمة داخل النصوص…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setAt(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setAt((v) => (v + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % Math.max(1, shown.length));
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            go(at);
          }
        }}
      />
      <div className="wr-pal">
        {hits.map((h) => (
          <a key={`${h.work_id}${h.part}${h.platform}`} className="wr-palrow" href={h.work_id === work ? undefined : `/work/${h.work_id}`} onClick={h.work_id === work ? onClose : undefined}>
            <span>
              <b>
                {h.work_id} · {h.title}
                {h.platform ? ` · نسخة ${platformLabels[h.platform]}` : ''}
              </b>
              <small>{h.snippet}</small>
            </span>
          </a>
        ))}
        {shown.map((s, i) => (
          <button type="button" key={s.id} className="wr-palrow" aria-selected={i === at} onClick={() => go(i)}>
            <span>{s.label}</span>
            <kbd>{s.keys}</kbd>
          </button>
        ))}
        {!shown.length && !hits.length && <p className="wk-col-hint">لا نتائج.</p>}
      </div>
    </Modal>
  );
}

'use client';
// «استلام ملفات» (/share; MVP_draft.md 64.5; Android_Build_Plan.md A7): files shared into the Android application
// from another one («مشاركة» then «مركز الاتصال المؤسسي»). The application holds them and opens this page; the person
// sends them on:
// - to a folder of «مكتبة الوسائط», where they may add files (the site checks the folder's «إنشاء» right), sent by the
//   application in the background;
// - to a work they take part in: into a library folder, then linked to the work (work_asset_link checks the work);
// - to a conversation of «المراسلة», as attachments of up to 25 MB, through the page's own upload.
// The page shows only what the person's pages allow. In a browser it says where it works.
import { useEffect, useMemo, useState } from 'react';
import { FolderUp, MessageSquare, Briefcase } from 'lucide-react';
import type { NativeHeldFile } from '@/lib/native';
import { heldFile, heldUrl, readHeld, takeIncoming } from '@/lib/native/held';
import { canOpen } from '@/lib/access';
import { useAccount } from '@/lib/account-context';
import { MAIL_ATTACH_BYTES } from '@/lib/mail/rules';
import { supabase } from '@/lib/supabase/client';
import { formatBytes } from '@/lib/studio/support';
import { ChatProvider, useChat } from '../chat/provider';
import { MediaProvider, useMedia, type FolderRow } from '../media/provider';
import { usePeople } from '../people';
import { Empty, Panel, Title } from '../ui';
import { startLibraryUpload } from './phone-uploads';
import { useNativeFeature } from './use-native';

const KEPT = 'commshub.share';
const kept = (): NativeHeldFile[] => {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEPT) ?? '[]') as unknown[];
    return Array.isArray(v) ? v.map(readHeld).filter((h): h is NativeHeldFile => !!h) : [];
  } catch {
    return [];
  }
};
const keep = (list: NativeHeldFile[]) => {
  try {
    sessionStorage.setItem(KEPT, JSON.stringify(list));
  } catch {
    // a reload of this page then shows only what the application still has
  }
};

/** The works a file may be linked to: open ones, in a status that still takes files (work_asset_link). */
const OPEN_STATUSES = ['DRAFT', 'IN_PRODUCTION', 'CHANGES_REQUESTED', 'REJECTED'];

type Where = 'library' | 'work' | 'chat';
const WHERE: Record<Where, string> = { library: 'مكتبة الوسائط', work: 'عمل', chat: 'المراسلة' };

export function SharePage() {
  const can = useNativeFeature('incoming');
  const account = useAccount();
  if (!can) {
    return (
      <Empty>
        «استلام ملفات» يعمل في تطبيق الهاتف: افتح ملفاً في تطبيق آخر، واختر «مشاركة» ثم «مركز الاتصال المؤسسي».
      </Empty>
    );
  }
  const library = canOpen(account, 'media');
  const work = library && canOpen(account, 'work');
  const chat = canOpen(account, 'mail');
  const body = <Receive allowed={(['library', 'work', 'chat'] as Where[]).filter((w) => ({ library, work, chat })[w])} />;
  return <MediaProvider>{chat ? <ChatProvider>{body}</ChatProvider> : body}</MediaProvider>;
}

function Receive({ allowed }: { allowed: Where[] }) {
  const [files, setFiles] = useState<NativeHeldFile[]>([]);
  const [where, setWhere] = useState<Where | null>(allowed[0] ?? null);
  const [note, setNote] = useState('');
  useEffect(() => {
    void takeIncoming().then((fresh) => {
      const all = [...kept()];
      for (const f of fresh) if (!all.some((x) => x.token === f.token)) all.push(f);
      keep(all);
      setFiles(all);
    });
  }, []);
  const sent = (tokens: string[], text: string) => {
    const rest = files.filter((f) => !tokens.includes(f.token));
    keep(rest);
    setFiles(rest);
    setNote(text);
  };

  return (
    <div className="share-page" dir="rtl">
      <Title title="استلام ملفات" sub="ملفات وصلت من تطبيق آخر على هذا الهاتف. اختر أين ترسلها." />
      {note && (
        <p className="share-note" role="status">
          {note}
        </p>
      )}
      {!files.length ? (
        <Empty>لا ملفات تنتظر. افتح ملفاً في تطبيق آخر، واختر «مشاركة» ثم «مركز الاتصال المؤسسي».</Empty>
      ) : (
        <>
          <Panel title={`الملفات (${files.length})`}>
            <ul className="share-files">
              {files.map((f) => (
                <li key={f.token} data-token={f.token}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {f.type.startsWith('image/') ? <img src={heldUrl(f)} alt="" /> : <span className="share-kind">{f.name.split('.').pop()?.toUpperCase().slice(0, 4) || 'ملف'}</span>}
                  <span>
                    <b>
                      <bdi>{f.name}</bdi>
                    </b>
                    <small>{formatBytes(f.size)}</small>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
          {!allowed.length ? (
            <Empty>لا توجد وجهة تتيحها صفحاتك لهذه الملفات.</Empty>
          ) : (
            <Panel title="أين ترسلها؟">
              <div className="actions share-where" role="radiogroup" aria-label="الوجهة">
                {allowed.map((w) => (
                  <button key={w} type="button" role="radio" aria-checked={where === w} className={where === w ? 'primary' : ''} data-where={w} onClick={() => setWhere(w)}>
                    {w === 'library' ? <FolderUp /> : w === 'work' ? <Briefcase /> : <MessageSquare />}
                    {WHERE[w]}
                  </button>
                ))}
              </div>
              {where === 'library' && <ToLibrary files={files} onSent={sent} />}
              {where === 'work' && <ToWork files={files} onSent={sent} />}
              {where === 'chat' && <ToChat files={files} onSent={sent} />}
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

/** The folders where this person may add files, by their full place in the library. */
function useUploadFolders(): { id: string; label: string }[] {
  const m = useMedia();
  return useMemo(() => {
    const label = (f: FolderRow) => {
      const chain: string[] = [];
      for (let c: FolderRow | undefined = f; c; c = m.folderOf(c.parent_id)) chain.unshift(c.name);
      return chain.join(' ‹ ');
    };
    return m.folders
      .filter((f) => !f.ghost && m.canCreate(f.id))
      .map((f) => ({ id: f.id, label: label(f) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ar'));
  }, [m]);
}

function FolderPick({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const m = useMedia();
  const folders = useUploadFolders();
  if (m.status === 'loading') return <p className="muted">جارٍ تحميل المجلدات…</p>;
  if (!folders.length) return <p className="muted">لا يوجد مجلد في المكتبة تستطيع الإضافة إليه.</p>;
  return (
    <label>
      المجلد
      <select value={value} onChange={(e) => onChange(e.target.value)} data-pick="folder">
        <option value="">اختر مجلداً</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </select>
    </label>
  );
}

async function toLibrary(files: NativeHeldFile[], folder: string, work: string | null): Promise<{ started: string[]; error: string | null }> {
  const started: string[] = [];
  for (const f of files) {
    try {
      await startLibraryUpload(f, folder, work);
      started.push(f.token);
    } catch (e) {
      return { started, error: e instanceof Error ? e.message : 'تعذّر بدء الرفع.' };
    }
  }
  return { started, error: null };
}

function ToLibrary({ files, onSent }: { files: NativeHeldFile[]; onSent: (tokens: string[], text: string) => void }) {
  const [folder, setFolder] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="share-to">
      <FolderPick value={folder} onChange={setFolder} />
      {error && <p className="danger">{error}</p>}
      <button
        type="button"
        className="primary"
        data-send="library"
        disabled={!folder || busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          const r = await toLibrary(files, folder, null);
          setBusy(false);
          if (r.started.length) onSent(r.started, `بدأ رفع ${r.started.length === 1 ? 'الملف' : `${r.started.length} ملفات`} إلى المكتبة في الخلفية، ويكتمل ولو تركت التطبيق.`);
          if (r.error) setError(r.error);
        }}
      >
        رفع إلى المكتبة
      </button>
    </div>
  );
}

type WorkLite = { id: string; title: string };

function ToWork({ files, onSent }: { files: NativeHeldFile[]; onSent: (tokens: string[], text: string) => void }) {
  const [works, setWorks] = useState<WorkLite[] | null>(null);
  const [work, setWork] = useState('');
  const [folder, setFolder] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    void supabase()
      .from('works')
      .select('id,title')
      .is('closed_at', null)
      .in('status', OPEN_STATUSES)
      .order('updated_at', { ascending: false })
      .limit(80)
      .then(({ data }) => setWorks((data ?? []) as WorkLite[]));
  }, []);
  return (
    <div className="share-to">
      {works === null ? (
        <p className="muted">جارٍ تحميل الأعمال…</p>
      ) : !works.length ? (
        <p className="muted">لا يوجد عمل مفتوح تشارك فيه.</p>
      ) : (
        <label>
          العمل
          <select value={work} onChange={(e) => setWork(e.target.value)} data-pick="work">
            <option value="">اختر عملاً</option>
            {works.map((w) => (
              <option key={w.id} value={w.id}>
                {w.id} · {w.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <FolderPick value={folder} onChange={setFolder} />
      <p className="muted">يُرفع الملف إلى المجلد ثم يُربط بالعمل، ويمر بالمراجعة كأي ملف.</p>
      {error && <p className="danger">{error}</p>}
      <button
        type="button"
        className="primary"
        data-send="work"
        disabled={!work || !folder || busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          const r = await toLibrary(files, folder, work);
          setBusy(false);
          if (r.started.length) onSent(r.started, `بدأ رفع ${r.started.length === 1 ? 'الملف' : `${r.started.length} ملفات`} في الخلفية، ويُربط بالعمل ${work} حين يكتمل.`);
          if (r.error) setError(r.error);
        }}
      >
        رفع وربط بالعمل
      </button>
    </div>
  );
}

function ToChat({ files, onSent }: { files: NativeHeldFile[]; onSent: (tokens: string[], text: string) => void }) {
  const c = useChat();
  const people = usePeople();
  const [room, setRoom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const rooms = c.rooms
    .filter((r) => c.myMember(r.id))
    .map((r) => {
      const other = r.type === 'dm' ? (c.membersOf(r.id).find((x) => x.email !== c.me)?.email ?? '') : '';
      return { id: r.id, name: r.type === 'dm' ? people.nameOf(other) : (r.name ?? '') };
    });
  const big = files.filter((f) => f.size > MAIL_ATTACH_BYTES);
  return (
    <div className="share-to">
      {c.status === 'loading' ? (
        <p className="muted">جارٍ تحميل المحادثات…</p>
      ) : !rooms.length ? (
        <p className="muted">لا توجد محادثة أنت عضو فيها.</p>
      ) : (
        <label>
          المحادثة
          <select value={room} onChange={(e) => setRoom(e.target.value)} data-pick="room">
            <option value="">اختر محادثة</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {big.length > 0 && <p className="muted">المرفقات حتى 25 MB. أرسل الأكبر إلى المكتبة ثم شاركه منها: {big.map((f) => f.name).join('، ')}.</p>}
      {error && <p className="danger">{error}</p>}
      <button
        type="button"
        className="primary"
        data-send="chat"
        disabled={!room || busy || big.length === files.length}
        onClick={async () => {
          setBusy(true);
          setError('');
          const done: string[] = [];
          for (const f of files.filter((x) => x.size <= MAIL_ATTACH_BYTES)) {
            try {
              const up = await c.upload(await heldFile(f), () => undefined);
              const r = await c.send(room, /^image\/(png|jpeg|webp|gif)$/.test(f.type) ? 'image' : 'file', '', { file: up.id });
              if (!r.ok) throw new Error(r.error);
              done.push(f.token);
            } catch (e) {
              setError(e instanceof Error ? e.message : 'تعذّر الإرسال.');
              break;
            }
          }
          setBusy(false);
          if (done.length) onSent(done, `أُرسل ${done.length === 1 ? 'الملف' : `${done.length} ملفات`} إلى المحادثة.`);
        }}
      >
        إرسال إلى المحادثة
      </button>
    </div>
  );
}

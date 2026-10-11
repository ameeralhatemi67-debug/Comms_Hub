'use client';
// «مظهرك في البريد والمراسلة»: how a person appears to colleagues. The picture is cut
// to a square and made small in the browser (256 px, about 20 to 60 KB) before it is
// saved, so nothing large leaves the device.
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { roles } from '@/lib/domain';
import { useAccount } from '@/lib/account-context';
import { NAME_COLORS, PRESENCE_AR, type Presence } from '@/lib/chat/rules';
import { PeopleProvider, usePeople } from './people';

export function ProfileEditor() {
  return (
    <PeopleProvider>
      <Editor />
    </PeopleProvider>
  );
}

const MAX_DATA_URL = 190_000;

/** A centred square crop of an image file, as a small WebP (or JPEG) data URL. */
async function squareAvatar(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('تعذّر قراءة الصورة.'));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    for (const size of [256, 192, 128]) {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('تعذّر تجهيز الصورة.');
      ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
      for (const q of [0.86, 0.72, 0.6]) {
        let data = canvas.toDataURL('image/webp', q);
        if (!data.startsWith('data:image/webp')) data = canvas.toDataURL('image/jpeg', q);
        if (data.length <= MAX_DATA_URL) return data;
      }
    }
    throw new Error('الصورة كبيرة جداً بعد التصغير. جرّب صورة أبسط.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function Editor() {
  const people = usePeople();
  const account = useAccount();
  const router = useRouter();
  const me = people.me;
  const [name, setName] = useState('');
  const [headline, setHeadline] = useState('');
  const [color, setColor] = useState<string>('n2');
  const [presence, setPresence] = useState<Presence>('online');
  const [note, setNote] = useState('');
  const [signature, setSignature] = useState('');
  const [enterSends, setEnterSends] = useState(true);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const loaded = useRef(false);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!me || loaded.current) return;
    loaded.current = true;
    setName(me.display_name);
    setHeadline(me.profile?.headline ?? '');
    setColor(me.profile?.color ?? 'n2');
    setPresence(me.profile?.presence ?? 'online');
    setNote(me.profile?.presence_note ?? '');
    setSignature(me.profile?.signature ?? '');
    setEnterSends(me.profile?.enter_sends ?? true);
    setAvatar(me.profile?.avatar ?? null);
  }, [me]);

  if (!me) return <p className="muted">جارٍ تحميل ملفك…</p>;

  const roleName = roles[account.role]?.name ?? '';
  const defaultSignature = `${name || me.display_name}\n${roleName}، إدارة الاتصال المؤسسي`;

  const save = async () => {
    setBusy(true);
    setMessage(null);
    const r = await people.update({
      display_name: name,
      headline,
      color,
      presence,
      presence_note: note,
      signature,
      enter_sends: enterSends,
      avatar: avatar ?? '',
    });
    setBusy(false);
    if (r.ok) {
      setMessage({ ok: true, text: 'حُفظ ملفك. يراه زملاؤك في البريد والمراسلة.' });
      router.refresh();
    } else setMessage({ ok: false, text: r.error });
  };

  return (
    <div className="pf ml">
      <div className="pf-grid">
        <div className="pf">
          <div className="pf-pic">
            {avatar ? (
              <span className="face lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={avatar} alt="صورتك" />
              </span>
            ) : (
              <span className="face lg">{(name || me.display_name).trim().charAt(0)}</span>
            )}
            <div className="acts">
              <button type="button" className="ml-btn" onClick={() => file.current?.click()}>
                {avatar ? 'تغيير الصورة' : 'إضافة صورة'}
              </button>
              {avatar && (
                <button type="button" className="ml-btn quiet danger" onClick={() => setAvatar(null)}>
                  إزالة الصورة
                </button>
              )}
              <input
                ref={file}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  try {
                    setAvatar(await squareAvatar(f));
                    setMessage(null);
                  } catch (err) {
                    setMessage({ ok: false, text: err instanceof Error ? err.message : 'تعذّر تجهيز الصورة.' });
                  }
                }}
              />
            </div>
          </div>
          <label htmlFor="pf-name">
            الاسم كما يظهر لزملائك
            <input id="pf-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label htmlFor="pf-headline">
            سطر تحت اسمك <small>يظهر بدل اسم الدور، مثل «منسقة التصوير والفعاليات»</small>
            <input id="pf-headline" maxLength={60} value={headline} placeholder={roleName} onChange={(e) => setHeadline(e.target.value)} />
          </label>
          <div className="pf" style={{ gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>لون اسمك في المجموعات</span>
            <div className="pf-colors" role="radiogroup" aria-label="لون الاسم">
              {NAME_COLORS.map((c) => (
                <button type="button" key={c} role="radio" className={c} aria-checked={color === c} aria-pressed={color === c} aria-label={`اللون ${c.slice(1)}`} onClick={() => setColor(c)} />
              ))}
            </div>
          </div>
          <div className="ml-two">
            <label htmlFor="pf-presence">
              حالتك
              <select id="pf-presence" value={presence} onChange={(e) => setPresence(e.target.value as Presence)}>
                {(Object.keys(PRESENCE_AR) as Presence[]).map((p) => (
                  <option key={p} value={p}>
                    {PRESENCE_AR[p]}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="pf-note">
              وصف الحالة <small>اختياري</small>
              <input id="pf-note" maxLength={60} value={note} placeholder="مثل: في تصوير بالمقر حتى 2:00" onChange={(e) => setNote(e.target.value)} />
            </label>
          </div>
          <label htmlFor="pf-sig">
            توقيع البريد <small>يُضاف إلى رسائلك في البريد. اتركه فارغاً لاستخدام التوقيع الافتراضي.</small>
            <textarea id="pf-sig" rows={3} maxLength={400} value={signature} placeholder={defaultSignature} onChange={(e) => setSignature(e.target.value)} />
          </label>
          <label className="pf-check">
            <input type="checkbox" checked={enterSends} onChange={(e) => setEnterSends(e.target.checked)} />
            مفتاح Enter يرسل الرسالة في المراسلة (Shift+Enter لسطر جديد)
          </label>
        </div>

        <div className="pf-prev" aria-label="المعاينة">
          <h4>كما يراك زملاؤك</h4>
          <div className="row">
            <span className="face">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="" />
              ) : (
                (name || me.display_name).trim().charAt(0)
              )}
              <i className={`pdot ${presence}`} />
            </span>
            <span>
              <b>{name || me.display_name}</b>
              <small>
                {headline || roleName} · {note || PRESENCE_AR[presence]}
              </small>
            </span>
          </div>
          <h4>في المجموعات</h4>
          <div className="bubble">
            <span className={`au ${color}`}>
              {name || me.display_name}
              <small>{headline || roleName}</small>
            </span>
            صباح الخير، المواد جاهزة للمراجعة.
          </div>
          <h4>في البريد</h4>
          <pre>{signature || defaultSignature}</pre>
        </div>
      </div>
      {message && (
        <p className={message.ok ? 'ml-hint' : 'ml-err'} role="status">
          {message.text}
        </p>
      )}
      <div className="pf-foot">
        <button type="button" className="ml-btn primary" disabled={busy || !name.trim()} onClick={() => void save()}>
          {busy ? 'جارٍ الحفظ…' : 'حفظ ملفي'}
        </button>
      </div>
    </div>
  );
}

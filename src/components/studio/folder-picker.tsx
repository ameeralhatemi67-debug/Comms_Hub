'use client';

// Choosing the library folder a file goes into (MVP_draft.md 62): only folders this person may create
// in are offered; the database checks it again at upload.
import { useEffect, useState } from 'react';
import { uploadFolders, type UploadFolder } from './library';

export function FolderSelect({ value, onChange, disabled }: { value: string; onChange: (id: string) => void; disabled?: boolean }) {
  const [folders, setFolders] = useState<UploadFolder[] | null>(null);
  useEffect(() => {
    let live = true;
    void uploadFolders().then((f) => {
      if (!live) return;
      setFolders(f);
      if (!value && f[0]) onChange(f[0].id);
    });
    return () => {
      live = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!folders) return <p className="st-hint" role="status">جارٍ تحميل المجلدات…</p>;
  if (!folders.length) return <p className="st-hint">لا مجلد في المكتبة تستطيع الرفع إليه. اطلب صلاحية الرفع على مجلد من «مكتبة الوسائط».</p>;
  return (
    <label>
      المجلد في المكتبة
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.path}
          </option>
        ))}
      </select>
    </label>
  );
}

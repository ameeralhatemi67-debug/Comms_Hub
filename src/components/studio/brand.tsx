'use client';

// «هوية الاستوديو» (MVP_draft.md 62.11): reading the shared brand row (studio_brand, readable by those who
// may open the studio), the panel on the studio home that edits it (studio_brand_save), and a project's
// template flag (studio_projects.template, studio_project_set_template).
import { useCallback, useEffect, useState } from 'react';
import { Palette, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { BRAND_MAX, NO_BRAND, brandIssue, readBrand, type Brand } from '@/lib/studio/brand';
import type { StudioApi } from '@/lib/studio/persist';
import { FontPicker } from './font-picker';

/** The shared brand, read once per page and again on `reload`. */
export function useStudioBrand() {
  const [brand, setBrand] = useState<Brand>(NO_BRAND);
  const reload = useCallback(async () => {
    const { data } = await supabase().from('studio_brand').select('colors,title_font,body_font').maybeSingle();
    setBrand(readBrand(data));
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { brand, reload };
}

/** Whether a project is a template, and switching it. */
export function useTemplateFlag(projectId: string, api: StudioApi) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    void supabase()
      .from('studio_projects')
      .select('template')
      .eq('id', projectId)
      .maybeSingle()
      .then(({ data }) => live && setOn(!!(data as { template?: boolean } | null)?.template));
    return () => {
      live = false;
    };
  }, [projectId]);
  const set = async (next: boolean) => {
    const r = await api.setTemplate(projectId, next);
    if (r.ok) setOn(next);
    return r.ok ? null : r.error;
  };
  return { on, set };
}

export function BrandPanel({ api }: { api: StudioApi }) {
  const { brand, reload } = useStudioBrand();
  const [draft, setDraft] = useState<Brand>(brand);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(brand), [brand]);
  const issue = brandIssue(draft);
  const save = async () => {
    setBusy(true);
    setNote(null);
    const r = await api.brandSave(draft.colors.map((c) => ({ name: c.name.trim(), hex: c.hex })), draft.title_font, draft.body_font);
    setBusy(false);
    if (!r.ok) return setNote(r.error);
    setNote('حُفظت هوية الاستوديو. تظهر ألوانها أولاً في كل اختيار لون، ويأخذ النص الجديد خطيها.');
    await reload();
  };
  return (
    <details className="panel st-brand">
      <summary>
        <Palette aria-hidden="true" />
        هوية الاستوديو
      </summary>
      <p className="st-hint">ألوان مسماة (حتى {BRAND_MAX}) وخط للعناوين وآخر للنص، مشتركة بين كل من يفتح الاستوديو.</p>
      <ol className="st-brand-colors">
        {draft.colors.map((c, i) => (
          <li key={i}>
            <input type="color" aria-label={`قيمة اللون ${i + 1}`} value={c.hex} onChange={(e) => setDraft((d) => ({ ...d, colors: d.colors.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)) }))} />
            <input aria-label={`اسم اللون ${i + 1}`} value={c.name} maxLength={40} dir="auto" placeholder="اسم اللون" onChange={(e) => setDraft((d) => ({ ...d, colors: d.colors.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) }))} />
            <button type="button" className="st-icon-btn" aria-label="حذف اللون" title="حذف اللون" onClick={() => setDraft((d) => ({ ...d, colors: d.colors.filter((_, j) => j !== i) }))}>
              <Trash2 aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
      <button type="button" className="st-mini" disabled={draft.colors.length >= BRAND_MAX} onClick={() => setDraft((d) => ({ ...d, colors: [...d.colors, { name: '', hex: '#17634b' }] }))}>
        <Plus aria-hidden="true" />
        لون
      </button>
      <div className="st-brand-fonts">
        <div>
          <b className="st-sub">خط العناوين</b>
          <FontPicker value={draft.title_font ?? 'IBM Plex Sans Arabic'} onChange={(f) => setDraft((d) => ({ ...d, title_font: f }))} disabled={busy} />
        </div>
        <div>
          <b className="st-sub">خط النص</b>
          <FontPicker value={draft.body_font ?? 'IBM Plex Sans Arabic'} onChange={(f) => setDraft((d) => ({ ...d, body_font: f }))} disabled={busy} />
        </div>
      </div>
      {issue && <p className="st-hint st-warn">{issue}</p>}
      <button type="button" className="primary" disabled={busy || !!issue} onClick={() => void save()}>
        {busy ? 'جارٍ الحفظ…' : 'حفظ الهوية'}
      </button>
      {note && <p className="st-hint" role="status">{note}</p>}
    </details>
  );
}

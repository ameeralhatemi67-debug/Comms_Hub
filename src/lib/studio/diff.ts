// «مقارنة بالحالية» in «النسخ» (MVP_draft.md 62.6): what differs between two states of a project, in
// Arabic sentences, older first. Clips and layers are matched by their ids, which never change once
// made; files by their library file and version, or their key on the device. Pure.
import { RATIOS, dims, type Clip, type Layer, type ProjectDoc, type Source } from './schema.ts';
import { shortTime } from './time.ts';

export type DiffLabel = (doc: ProjectDoc, item: Clip | Layer) => string;

/** A plain name for a clip or layer when the interface gives none. */
export const plainLabel: DiffLabel = (doc, item) => {
  if (item.text) return item.text.content.split('\n')[0] || 'نص';
  if (item.motion) return 'قالب حركة';
  if (item.sticker) return 'علامة الهوية';
  if (item.shape) return 'شكل';
  if (item.cover) return item.cover.mode === 'blocks' ? 'إخفاء بالمربعات' : 'تمويه منطقة';
  return doc.sources.find((s) => s.id === item.source)?.name ?? 'ملف';
};

const sourceKey = (s: Source) => (s.kind === 'library' ? `lib:${s.asset}` : `dev:${s.key}`);
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The settings of a clip or layer other than its place in time, its track and its id. */
function settingsOf(item: Clip | Layer): Record<string, unknown> {
  const { id: _id, start: _s, length: _l, in: _in, ...rest } = item as Clip;
  void _id;
  void _s;
  void _l;
  void _in;
  return rest;
}

export type DocDiff = { lines: string[]; same: boolean };

/**
 * What changed from `from` (an older version) to `to` (the current state). `label` names a clip or
 * layer as the timeline does.
 */
export function diffDocs(from: ProjectDoc, to: ProjectDoc, label: DiffLabel = plainLabel): DocDiff {
  const lines: string[] = [];
  if (from.kind !== to.kind) return { lines: ['نوع المشروع مختلف.'], same: false };

  // files
  const before = new Map(from.sources.map((s) => [sourceKey(s), s]));
  const after = new Map(to.sources.map((s) => [sourceKey(s), s]));
  for (const [k, s] of after) {
    const old = before.get(k);
    if (!old) lines.push(`أُضيف الملف «${s.name}».`);
    else if (s.kind === 'library' && old.kind === 'library' && s.version !== old.version) lines.push(`صار الملف «${s.name}» بالإصدار ${s.version} بدل ${old.version}.`);
  }
  for (const [k, s] of before) if (!after.has(k)) lines.push(`لم يعد الملف «${s.name}» مستعملاً.`);

  if (to.kind === 'video' && from.video && to.video) {
    const a = from.video;
    const b = to.video;
    if (a.ratio !== b.ratio) lines.push(`تغير شكل الإطار من ${RATIOS[a.ratio]?.label ?? a.ratio} إلى ${RATIOS[b.ratio]?.label ?? b.ratio}.`);
    if (a.fps !== b.fps) lines.push(`تغيرت الإطارات في الثانية من ${a.fps} إلى ${b.fps}.`);
    if (a.background !== b.background) lines.push('تغير لون الخلفية.');
    const old = new Map<string, { clip: Clip; track: string }>();
    for (const t of a.tracks) for (const c of t.clips) old.set(c.id, { clip: c, track: t.id });
    const now = new Map<string, { clip: Clip; track: string }>();
    for (const t of b.tracks) for (const c of t.clips) now.set(c.id, { clip: c, track: t.id });
    for (const [id, { clip, track }] of now) {
      const o = old.get(id);
      const name = label(to, clip);
      if (!o) {
        lines.push(`أُضيف «${name}» عند ${shortTime(clip.start)}.`);
        continue;
      }
      if (o.clip.start !== clip.start || o.track !== track) lines.push(`نُقل «${name}» من ${shortTime(o.clip.start)} إلى ${shortTime(clip.start)}.`);
      if (o.clip.length !== clip.length || (o.clip.in ?? 0) !== (clip.in ?? 0)) lines.push(`تغير طول «${name}» من ${shortTime(o.clip.length)} إلى ${shortTime(clip.length)}.`);
      if (!same(settingsOf(o.clip), settingsOf(clip))) lines.push(`تغيرت إعدادات «${name}».`);
    }
    for (const [id, { clip }] of old) if (!now.has(id)) lines.push(`حُذف «${label(from, clip)}» الذي كان عند ${shortTime(clip.start)}.`);
    if (!same(a.markers, b.markers)) lines.push('تغيرت العلامات على الخط الزمني.');
  }

  if (to.kind === 'photo' && from.photo && to.photo) {
    const a = from.photo;
    const b = to.photo;
    if (a.w !== b.w || a.h !== b.h) lines.push(`تغير مقاس الصورة من ${dims(a.w, a.h)} إلى ${dims(b.w, b.h)}.`);
    if (a.background !== b.background) lines.push('تغيرت الخلفية.');
    const old = new Map(a.layers.map((l, i) => [l.id, { layer: l, i }]));
    const now = new Map(b.layers.map((l, i) => [l.id, { layer: l, i }]));
    for (const [id, { layer, i }] of now) {
      const o = old.get(id);
      const name = label(to, layer);
      if (!o) lines.push(`أُضيفت الطبقة «${name}».`);
      else {
        if (o.i !== i) lines.push(`تغير ترتيب الطبقة «${name}».`);
        if (!same(settingsOf(o.layer), settingsOf(layer))) lines.push(`تغيرت إعدادات الطبقة «${name}».`);
      }
    }
    for (const [id, { layer }] of old) if (!now.has(id)) lines.push(`حُذفت الطبقة «${label(from, layer)}».`);
  }

  return { lines, same: lines.length === 0 };
}

/** JSON with object keys sorted: the database gives a document back with its keys in its own order. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

/** Two states of a project are the same document. */
export const sameDoc = (a: ProjectDoc, b: ProjectDoc) => canonical(a) === canonical(b);

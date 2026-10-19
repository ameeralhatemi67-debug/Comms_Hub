// The windows of the studio's editors and their ready-made arrangements (MVP_draft.md 62.1). Pure: the
// editors attach the content; the workspace (workspace.ts) arranges them. Each window has a fixed id, an
// Arabic title, a shortcut (Shift and a digit, as desktop editors do) and the windows it returns beside
// when it is opened again after being closed.
import { col, group, layoutOf, row, type Edge, type Layout } from './workspace.ts';

export type EditorKind = 'video' | 'photo';
export type PanelMeta = { id: string; title: string; /** lucide icon name, drawn by the interface */ icon: string; digit?: number; kinds: EditorKind[]; hint: string };

export const PANELS: PanelMeta[] = [
  { id: 'media', title: 'الوسائط', icon: 'folder', digit: 1, kinds: ['video', 'photo'], hint: 'ملفات المكتبة وملفات هذا الجهاز.' },
  { id: 'templates', title: 'قوالب الحركة', icon: 'sparkles', digit: 2, kinds: ['video', 'photo'], hint: 'القوالب الستة والعشرون من «قوالب الحركة».' },
  { id: 'timeline', title: 'الخط الزمني', icon: 'timeline', digit: 3, kinds: ['video'], hint: 'المسارات والمقاطع والأدوات.' },
  { id: 'layers', title: 'الطبقات', icon: 'layers', digit: 3, kinds: ['photo'], hint: 'ترتيب طبقات الصورة.' },
  { id: 'program', title: 'المعاينة', icon: 'monitor', digit: 4, kinds: ['video', 'photo'], hint: 'ما يُصدَّر، ودقة المعاينة.' },
  { id: 'inspector', title: 'الإعدادات', icon: 'sliders', digit: 5, kinds: ['video', 'photo'], hint: 'إعدادات المحدد: الموضع والنص والحركة والانتقال.' },
  { id: 'graphics', title: 'النصوص والعلامات', icon: 'type', digit: 6, kinds: ['video', 'photo'], hint: 'العناوين والتعليقات وعلامات الهوية والأشكال.' },
  { id: 'effects', title: 'الانتقالات والحركات', icon: 'wand', digit: 7, kinds: ['video'], hint: 'انتقالات بين المقاطع وحركات دخول وخروج.' },
  { id: 'export', title: 'التصدير', icon: 'export', digit: 8, kinds: ['video', 'photo'], hint: 'إلى الجهاز أو إلى المكتبة.' },
  { id: 'history', title: 'السجل', icon: 'history', digit: 9, kinds: ['video', 'photo'], hint: 'خطوات التعديل، والعودة إلى أي منها.' },
  { id: 'project', title: 'المشروع', icon: 'settings', kinds: ['video', 'photo'], hint: 'شكل المشروع وخلفيته والتخزين على الجهاز.' },
  { id: 'review', title: 'المراجعة', icon: 'review', kinds: ['video', 'photo'], hint: 'العمل المرتبط وملاحظات المراجعة.' },
];

export const panelIds = (kind: EditorKind) => PANELS.filter((p) => p.kinds.includes(kind)).map((p) => p.id);
export const panelMeta = (id: string) => PANELS.find((p) => p.id === id);

/** Where a closed window goes back to: beside the first of these that is open, else along the edge. */
export const PANEL_HOMES: Record<string, { near: string[]; edge: Edge }> = {
  media: { near: ['templates', 'graphics', 'effects'], edge: 'right' },
  templates: { near: ['media', 'graphics', 'effects'], edge: 'right' },
  graphics: { near: ['templates', 'media', 'effects'], edge: 'right' },
  effects: { near: ['templates', 'graphics', 'media'], edge: 'right' },
  timeline: { near: [], edge: 'bottom' },
  layers: { near: ['history', 'media'], edge: 'right' },
  program: { near: [], edge: 'top' },
  inspector: { near: ['project', 'export', 'review'], edge: 'left' },
  export: { near: ['inspector', 'project', 'review'], edge: 'left' },
  project: { near: ['inspector', 'export', 'review'], edge: 'left' },
  review: { near: ['inspector', 'project', 'export'], edge: 'left' },
  history: { near: ['layers', 'inspector', 'project'], edge: 'left' },
};

export type Preset = { id: string; label: string; hint: string; build: () => Layout };

// The workspace runs left to right; the editors are Arabic, so the windows a person starts from (what to
// add) sit on the right and the settings of what is selected on the left, with the timeline along the bottom.
export const PRESETS: Record<EditorKind, Preset[]> = {
  video: [
    {
      id: 'edit',
      label: 'التحرير',
      hint: 'المعاينة في الوسط، والإضافة يميناً، والإعدادات يساراً، والخط الزمني في الأسفل.',
      build: () =>
        layoutOf(
          col(
            [0.6, row([0.26, group(['inspector', 'project', 'export', 'review'])], [0.46, group(['program'])], [0.28, group(['media', 'templates', 'graphics', 'effects'])])],
            [0.4, row([0.82, group(['timeline'])], [0.18, group(['history'])])],
          ),
        ),
    },
    {
      id: 'assembly',
      label: 'التجميع',
      hint: 'لوحة وسائط كبيرة لاختيار المقاطع وترتيبها.',
      build: () =>
        layoutOf(
          col(
            [0.58, row([0.4, group(['program'])], [0.6, group(['media', 'templates', 'graphics'])])],
            [0.42, row([0.78, group(['timeline'])], [0.22, group(['inspector', 'effects', 'project', 'export', 'review', 'history'])])],
          ),
        ),
    },
    {
      id: 'effects',
      label: 'المؤثرات',
      hint: 'الانتقالات والحركات بجانب إعداداتها.',
      build: () =>
        layoutOf(
          col(
            [0.62, row([0.3, group(['inspector', 'project'])], [0.42, group(['program'])], [0.28, group(['effects', 'templates', 'graphics', 'media'])])],
            [0.38, row([0.8, group(['timeline'])], [0.2, group(['history', 'export', 'review'])])],
          ),
        ),
    },
    {
      id: 'graphics',
      label: 'الرسوميات',
      hint: 'النصوص والقوالب مع إعدادات أوسع.',
      build: () =>
        layoutOf(
          col(
            [0.66, row([0.34, group(['inspector', 'project'])], [0.4, group(['program'])], [0.26, group(['graphics', 'templates', 'media', 'effects'])])],
            [0.34, row([0.82, group(['timeline'])], [0.18, group(['history', 'export', 'review'])])],
          ),
        ),
    },
    {
      id: 'export',
      label: 'التصدير',
      hint: 'المعاينة كبيرة وإعدادات التصدير بجانبها.',
      build: () =>
        layoutOf(
          col(
            [0.66, row([0.34, group(['export', 'review', 'project'])], [0.66, group(['program'])])],
            [0.34, row([0.76, group(['timeline'])], [0.24, group(['inspector', 'history', 'media', 'templates', 'graphics', 'effects'])])],
          ),
        ),
    },
  ],
  photo: [
    {
      id: 'edit',
      label: 'التحرير',
      hint: 'الصورة في الوسط، والإضافة والطبقات يميناً، والإعدادات يساراً.',
      build: () =>
        layoutOf(
          row(
            [0.27, group(['inspector', 'project', 'export', 'review'])],
            [0.45, group(['program'])],
            [0.28, col([0.58, group(['media', 'templates', 'graphics'])], [0.42, group(['layers', 'history'])])],
          ),
        ),
    },
    {
      id: 'graphics',
      label: 'الرسوميات',
      hint: 'النصوص والأشكال والقوالب مع الطبقات أمامك.',
      build: () =>
        layoutOf(
          row(
            [0.3, col([0.62, group(['inspector'])], [0.38, group(['layers', 'history'])])],
            [0.44, group(['program'])],
            [0.26, group(['graphics', 'templates', 'media', 'project', 'export', 'review'])],
          ),
        ),
    },
    {
      id: 'export',
      label: 'التصدير',
      hint: 'الصورة كبيرة وإعدادات التصدير بجانبها.',
      build: () =>
        layoutOf(
          row(
            [0.32, group(['export', 'review', 'project'])],
            [0.48, group(['program'])],
            [0.2, group(['layers', 'inspector', 'history', 'media', 'templates', 'graphics'])],
          ),
        ),
    },
  ],
};

export const defaultPreset = (kind: EditorKind) => PRESETS[kind][0];

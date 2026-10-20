'use client';

// The frame both studio editors share on a computer (MVP_draft.md 62.1, 62.2): the menu bar, the windows,
// filling the browser window, the editor's dark or light chrome and the shortcuts sheet. The menus of
// «ملف», «تحرير», «المقطع» and «عرض» are the editor's own; «النوافذ» and «مساعدة» are built here from the
// window list (panels.ts) and the shortcuts (shortcuts.ts).
import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  FolderOpen, Sparkles, Rows3, MonitorPlay, SlidersHorizontal, Type, WandSparkles, FileOutput, History, Settings2, MessageSquareText, Layers, Keyboard, BookOpen, RotateCcw, Maximize2, LayoutDashboard, Files,
} from 'lucide-react';
import { PANELS, panelIds, type EditorKind } from '@/lib/studio/panels';
import { isOpen, toggleMax, whereIs } from '@/lib/studio/workspace';
import { comboLabel, keysOf, type Scope } from '@/lib/studio/shortcuts';
import { MenuBar, ShortcutsSheet, type Menu, type MenuItem } from './menubar';
import { Workspace, useWorkspaceLayout, type PanelSpec } from './workspace';
import { useFillHeight } from './prefs';

export const PANEL_ICON: Record<string, ReactNode> = {
  folder: <FolderOpen aria-hidden="true" />,
  sparkles: <Sparkles aria-hidden="true" />,
  timeline: <Rows3 aria-hidden="true" />,
  monitor: <MonitorPlay aria-hidden="true" />,
  sliders: <SlidersHorizontal aria-hidden="true" />,
  type: <Type aria-hidden="true" />,
  wand: <WandSparkles aria-hidden="true" />,
  export: <FileOutput aria-hidden="true" />,
  history: <History aria-hidden="true" />,
  settings: <Settings2 aria-hidden="true" />,
  review: <MessageSquareText aria-hidden="true" />,
  layers: <Layers aria-hidden="true" />,
  versions: <Files aria-hidden="true" />,
};

/** The windows of an editor, with their titles, icons and shortcuts, around the content given for each. */
export function panelSpecs(kind: EditorKind, content: Record<string, ReactNode>): PanelSpec[] {
  return PANELS.filter((p) => p.kinds.includes(kind) && content[p.id] !== undefined).map((p) => ({
    id: p.id,
    title: p.title,
    icon: PANEL_ICON[p.icon],
    element: content[p.id],
    shortcut: p.digit ? comboLabel(`Shift+Digit${p.digit}`) : undefined,
  }));
}

export type Frame = ReturnType<typeof useEditorFrame>;

/** The frame's state: the layout of the windows, the window in use, the sheets. */
export function useEditorFrame(kind: EditorKind) {
  const ws = useWorkspaceLayout(kind, panelIds(kind));
  const [focused, setFocused] = useState<string | null>(kind === 'video' ? 'timeline' : 'program');
  const [keys, setKeys] = useState(false);
  /** Opens a window by its digit (Shift and a digit). */
  const byDigit = (d: number) => {
    const p = PANELS.find((x) => x.digit === d && x.kinds.includes(kind));
    if (!p) return;
    ws.open(p.id);
    setFocused(p.id);
  };
  const maximize = () => {
    const at = focused ? whereIs(ws.layout, focused) : null;
    ws.setLayout((l) => toggleMax(l, l.max ?? at?.group.id ?? null));
  };
  return { kind, ws, focused, setFocused, keys, setKeys, byDigit, maximize };
}

export function EditorFrame({
  frame, menus, panels, full, onFull, chrome, onChrome, toolbar, children,
}: {
  frame: Frame;
  menus: Menu[];
  panels: PanelSpec[];
  full: boolean;
  onFull: () => void;
  chrome: 'dark' | 'light';
  onChrome: () => void;
  toolbar?: ReactNode;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const height = useFillHeight(ref, !full);
  const { ws, kind } = frame;
  const scope: Scope = kind;
  const windowNames = useMemo(() => Object.fromEntries(PANELS.filter((p) => p.digit && p.kinds.includes(kind)).map((p) => [p.digit!, p.title])), [kind]);

  const windows: MenuItem[] = [
    ...PANELS.filter((p) => p.kinds.includes(kind)).map((p) => ({
      label: p.title,
      icon: PANEL_ICON[p.icon],
      checked: isOpen(ws.layout, p.id),
      keys: p.digit ? comboLabel(`Shift+Digit${p.digit}`) : undefined,
      hint: p.hint,
      onSelect: () => (isOpen(ws.layout, p.id) && frame.focused !== p.id ? (ws.open(p.id), frame.setFocused(p.id)) : ws.toggle(p.id)),
    })),
    { kind: 'sep' },
    {
      label: 'مساحات العمل',
      icon: <LayoutDashboard aria-hidden="true" />,
      items: ws.presets.map((p) => ({ label: p.label, checked: p.id === ws.preset, hint: p.hint, onSelect: () => ws.applyPreset(p.id) })),
    },
    { label: 'إعادة ضبط مساحة العمل', icon: <RotateCcw aria-hidden="true" />, onSelect: ws.reset, hint: 'يعيد النوافذ إلى ترتيب مساحة العمل المختارة.' },
    { label: 'تكبير النافذة النشطة', icon: <Maximize2 aria-hidden="true" />, keys: keysOf('maximize'), checked: !!ws.layout.max, onSelect: frame.maximize },
  ];
  const help: MenuItem[] = [
    { label: 'اختصارات لوحة المفاتيح', icon: <Keyboard aria-hidden="true" />, keys: '?', onSelect: () => frame.setKeys(true) },
    { label: 'دليل هذه الصفحة', icon: <BookOpen aria-hidden="true" />, onSelect: () => document.querySelector<HTMLButtonElement>('.help-q')?.click() },
  ];
  const all: Menu[] = [...menus, { id: 'windows', label: 'النوافذ', items: windows }, { id: 'help', label: 'مساعدة', items: help }];

  return (
    <div className="st-frame" ref={ref} style={height ? { height } : undefined}>
      <MenuBar
        menus={all}
        presets={ws.presets}
        preset={ws.preset}
        onPreset={ws.applyPreset}
        full={full}
        onFull={onFull}
        chrome={chrome}
        onChrome={onChrome}
        onShortcuts={() => frame.setKeys(true)}
        extra={toolbar}
      />
      <Workspace panels={panels} layout={ws.layout} onLayout={ws.setLayout} focused={frame.focused} onFocus={frame.setFocused} chromeLabel={kind === 'video' ? 'نوافذ محرر الفيديو' : 'نوافذ محرر الصورة'} />
      {children}
      {frame.keys && <ShortcutsSheet scope={scope} onClose={() => frame.setKeys(false)} windowNames={windowNames} />}
    </div>
  );
}

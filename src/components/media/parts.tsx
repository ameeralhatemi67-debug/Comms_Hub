'use client';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  Cloud,
  Download,
  Eye,
  FileText,
  Film,
  Flag,
  Folder,
  History,
  Image as ImageIcon,
  LayoutGrid,
  Link2,
  List,
  ListChecks,
  Lock,
  MoveLeft,
  MoveRight,
  Music,
  PanelsTopLeft,
  Pencil,
  Play,
  Plus,
  Search,
  Send,
  Shield,
  StickyNote,
  Tag,
  Trash2,
  Upload,
  Users,
  X,
  MoreHorizontal,
  Pause,
} from 'lucide-react';
import { pipeline, stageLabels, stagePosition, stageTone, isSideStage, type Stage } from '@/lib/media/rules';
import type { AssetRow } from './provider';

const icons = {
  alert: AlertTriangle,
  cal: CalendarDays,
  check: Check,
  cloud: Cloud,
  download: Download,
  eye: Eye,
  file: FileText,
  film: Film,
  flag: Flag,
  folder: Folder,
  history: History,
  image: ImageIcon,
  grid: LayoutGrid,
  link: Link2,
  list: List,
  tasks: ListChecks,
  lock: Lock,
  back: MoveRight,
  move: MoveLeft,
  music: Music,
  board: PanelsTopLeft,
  pencil: Pencil,
  play: Play,
  pause: Pause,
  plus: Plus,
  search: Search,
  send: Send,
  shield: Shield,
  note: StickyNote,
  tag: Tag,
  trash: Trash2,
  upload: Upload,
  users: Users,
  x: X,
  more: MoreHorizontal,
} as const;
export type IconName = keyof typeof icons;

export function Icon({ name, className }: { name: IconName | string; className?: string }) {
  const C = icons[name as IconName] ?? FileText;
  return <C className={`i ${className ?? ''}`} aria-hidden="true" />;
}

const PALETTES = [
  ['#12604a', '#06241b'],
  ['#1c2b57', '#0f5a4a'],
  ['#7d5a14', '#2f2106'],
  ['#17445a', '#0b2a38'],
  ['#5a2a3a', '#25101a'],
  ['#2f4a2a', '#112012'],
];
const hueOf = (id: string) => [...id].reduce((n, c) => n + c.charCodeAt(0), 0) % PALETTES.length;

/** Preview of an asset: the real file for images and video, an icon tile otherwise. */
export function Thumb({ asset, large = false }: { asset: Pick<AssetRow, 'id' | 'kind' | 'name' | 'current_version'>; large?: boolean }) {
  const src = `/api/media/${asset.id}/content?v=${asset.current_version}`;
  if (asset.kind === 'image')
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={asset.name} loading={large ? 'eager' : 'lazy'} />;
  if (asset.kind === 'video')
    return large ? <video src={src} controls preload="metadata" /> : <video src={src} muted playsInline preload="metadata" />;
  const [a, b] = PALETTES[hueOf(asset.id)];
  return (
    <div className="fb" style={{ background: `linear-gradient(135deg,${a},${b})` }}>
      <Icon name={asset.kind === 'audio' ? 'music' : 'file'} />
    </div>
  );
}

export function StageChip({ stage }: { stage: Stage }) {
  return <span className={`mx-chip ${stageTone[stage]}`}>{stageLabels[stage]}</span>;
}

/** The six-step strip on a card: filled up to the current stage. */
export function PipeDots({ stage }: { stage: Stage }) {
  const pos = stagePosition(stage);
  const side = isSideStage(stage);
  return (
    <span className="mx-pipe" aria-hidden="true">
      {pipeline.map((s, i) => (
        <i key={s} className={i < pos ? 'd' : i === pos ? (side ? 'w' : 'c') : ''} />
      ))}
    </span>
  );
}

export function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  return <span className={`mx-av ${large ? 'lg' : ''}`}>{name.trim().charAt(0)}</span>;
}

export function AvatarStack({ names, max = 4 }: { names: string[]; max?: number }) {
  const shown = names.slice(0, max);
  const more = names.length - shown.length;
  return (
    <span className="mx-avs">
      {shown.map((n, i) => (
        <span key={i} className="mx-av" title={n}>
          {n.trim().charAt(0)}
        </span>
      ))}
      {more > 0 && <span className="mx-av">+{more}</span>}
    </span>
  );
}

export function Ts({ children }: { children: ReactNode }) {
  return <bdi dir="ltr">{children}</bdi>;
}

export const KIND_AR: Record<string, string> = { image: 'صورة', video: 'فيديو', audio: 'صوت', document: 'مستند', other: 'ملف' };

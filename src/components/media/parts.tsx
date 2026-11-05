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
import { FileThumb } from '../file-thumb';
import { thumbUrl } from '@/lib/media/thumbs';

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

/**
 * Preview of an asset. On a card, its thumbnail (MVP_draft.md section 77): a small picture, never the whole file, so a page
 * of cards stays light. Large, on the asset's own page, the real picture or the video with its thumbnail as the poster. With
 * no thumbnail, the coloured tile with the kind's icon.
 */
export function Thumb({ asset, large = false }: { asset: Pick<AssetRow, 'id' | 'kind' | 'name' | 'current_version'>; large?: boolean }) {
  const src = `/api/media/${asset.id}/content?v=${asset.current_version}`;
  const of = { asset: asset.id, version: asset.current_version };
  if (large && asset.kind === 'image')
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={asset.name} loading="eager" />;
  if (large && asset.kind === 'video') return <video src={src} controls preload="metadata" poster={thumbUrl(of)} />;
  const [a, b] = PALETTES[hueOf(asset.id)];
  const tile = (
    <div className="fb" style={{ background: `linear-gradient(135deg,${a},${b})` }}>
      <Icon name={asset.kind === 'audio' ? 'music' : asset.kind === 'video' ? 'film' : asset.kind === 'image' ? 'image' : 'file'} />
    </div>
  );
  return <FileThumb of={of} kind={asset.kind} name={asset.name} alt={asset.name} fallback={tile} />;
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

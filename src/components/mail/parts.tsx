'use client';
// Small pieces the mail page shares: icons, avatars, recipient names.
import {
  AlarmClock,
  AlertTriangle,
  Archive,
  ArrowRight,
  AtSign,
  BarChart3,
  BellOff,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Cloud,
  Eye,
  FileText,
  Film,
  Flag,
  Forward,
  History,
  Image as ImageIcon,
  Inbox,
  Keyboard,
  Link2,
  ListChecks,
  Lock,
  Mail,
  MailOpen,
  Pause,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Reply,
  ReplyAll,
  Search,
  Send,
  Settings,
  Shield,
  Star,
  StickyNote,
  Tag,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';
import { GROUPS, type GroupId } from '@/lib/mail/rules';

const icons = {
  alarm: AlarmClock,
  alert: AlertTriangle,
  archive: Archive,
  back: ArrowRight,
  at: AtSign,
  chart: BarChart3,
  mute: BellOff,
  work: BriefcaseBusiness,
  cal: CalendarDays,
  check: Check,
  down: ChevronDown,
  up: ChevronUp,
  clock: Clock,
  cloud: Cloud,
  eye: Eye,
  file: FileText,
  film: Film,
  flag: Flag,
  forward: Forward,
  history: History,
  image: ImageIcon,
  inbox: Inbox,
  keys: Keyboard,
  link: Link2,
  tasks: ListChecks,
  lock: Lock,
  mail: Mail,
  unread: MailOpen,
  pause: Pause,
  clip: Paperclip,
  pencil: Pencil,
  plus: Plus,
  sync: RefreshCw,
  reply: Reply,
  replyall: ReplyAll,
  search: Search,
  send: Send,
  settings: Settings,
  shield: Shield,
  star: Star,
  note: StickyNote,
  tag: Tag,
  trash: Trash2,
  user: User,
  users: Users,
  x: X,
} as const;
export type IconName = keyof typeof icons;

/** Reply, forward and send point the reading direction, so they are mirrored in Arabic. */
const mirrored = new Set<IconName>(['reply', 'replyall', 'forward', 'send']);

export function I({ n, className }: { n: IconName; className?: string }) {
  const C = icons[n];
  return <C className={`i ${mirrored.has(n) ? 'flip' : ''} ${className ?? ''}`} aria-hidden="true" />;
}

export function Av({ label, tone = '', small = false }: { label: string; tone?: '' | 'ext' | 'grp'; small?: boolean }) {
  return <span className={`ml-av ${tone} ${small ? 'sm' : ''}`}>{label.trim().charAt(0) || '·'}</span>;
}

export function Bdi({ children }: { children: React.ReactNode }) {
  return <bdi dir="ltr">{children}</bdi>;
}

/** The display name of a recipient token: p:<email>, g:<group>, e:<address>. */
export function tokenName(tok: string, nameOf: (email: string) => string) {
  const v = tok.slice(2);
  if (tok.startsWith('p:')) return nameOf(v);
  if (tok.startsWith('g:')) return GROUPS[v as GroupId]?.name ?? v;
  return v;
}
export const tokenTone = (tok: string): '' | 'ext' | 'grp' => (tok.startsWith('e:') ? 'ext' : tok.startsWith('g:') ? 'grp' : '');

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export const CHANNEL_AR: Record<string, string> = { Instagram: 'إنستغرام', X: 'X', LinkedIn: 'لينكدإن' };

/** Local datetime-local value for a moment some hours ahead, on the hour. */
export function localInput(hoursAhead: number, hour?: number) {
  const d = new Date(Date.now() + hoursAhead * 3600000);
  if (hour !== undefined) d.setHours(hour, 0, 0, 0);
  else d.setMinutes(0, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

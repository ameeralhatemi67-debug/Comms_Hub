// Turns an activity_log row (type + structured data) into one Arabic line, so the log
// and every asset's journey read the same. The database stores facts, not sentences.
import { roles, type Role } from '../domain.ts';
import { levelLabels, LEVEL_NAMES, stageLabels, type Level, type Stage } from './rules.ts';

export type LogRow = {
  id: number;
  at: string;
  actor_email: string;
  type: string;
  asset_id: string | null;
  folder_id: string | null;
  task_id: string | null;
  data: Record<string, unknown>;
};

export type Described = { text: string; before?: string; after?: string; stage?: Stage };

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(str) : []);
const stageName = (v: unknown) => stageLabels[str(v) as Stage] ?? str(v);
const levelName = (v: unknown) => (typeof v === 'number' ? levelLabels[LEVEL_NAMES[v] as Level] ?? String(v) : '—');

function schedulePart(v: unknown): { at: string; platforms: string[] } {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return { at: str(o.at), platforms: list(o.platforms) };
}

export function describe(e: LogRow, nameOf: (email: string) => string): Described {
  const who = nameOf(e.actor_email);
  const d = e.data ?? {};
  const name = str(d.name);
  switch (e.type) {
    case 'upload':
      return { text: `رفع ${who} «${name}»` };
    case 'version':
      return { text: `رفع ${who} الإصدار v${str(d.version)}${d.note ? `: ${str(d.note)}` : ''}` };
    case 'stage':
      return { text: `نقل ${who} «${name}» إلى «${stageName(d.to)}»`, before: stageName(d.from), after: stageName(d.to), stage: str(d.to) as Stage };
    case 'approve':
      return { text: `اعتمد ${who} الإصدار v${str(d.version)} وصار مقفلاً`, before: stageName(d.from), after: stageName(d.to), stage: 'ready' };
    case 'changes':
      return { text: `طلب ${who} تعديلاً على «${name}»`, before: stageName(d.from), after: stageName(d.to), stage: 'changes' };
    case 'reject':
      return { text: `رفض ${who} «${name}»`, before: stageName(d.from), after: stageName(d.to), stage: 'rejected' };
    case 'schedule': {
      const s = schedulePart(d.schedule);
      const to = str(d.to) as Stage;
      return {
        text: `جدول ${who} النشر${s.at ? ` يوم ${s.at}` : ''}${s.platforms.length ? ` على ${s.platforms.join(' و')}` : ''}`,
        stage: to === 'scheduled' ? 'scheduled' : undefined,
      };
    }
    case 'publish': {
      const to = str(d.to) as Stage;
      const verb = to === 'published' ? 'نشر' : to === 'partial' ? 'نشر جزئياً' : 'فشل نشر';
      return { text: `${verb} ${who} «${name}» (محاكاة)`, before: stageName(d.from), after: stageName(d.to), stage: to };
    }
    case 'assign':
      return { text: `أسند ${who} إلى ${nameOf(str(d.assignee))}: ${str(d.what)}`, after: d.due ? `قبل ${str(d.due).slice(0, 16).replace('T', ' ')}` : undefined };
    case 'done':
      return { text: `أتمّ ${nameOf(str(d.assignee) || e.actor_email)} المهمة: ${str(d.what)}` };
    case 'copy': {
      const n = list(d.platforms).length;
      return { text: `كتب ${who} العنوان والوصف لـ ${n} ${n === 1 ? 'منصة' : 'منصات'}` };
    }
    case 'rename':
      return { text: `غيّر ${who} اسم ${d.folder ? 'مجلد' : 'أصل'}`, before: str(d.before), after: str(d.after) };
    case 'move':
      return { text: `نقل ${who} «${name}»`, before: str(d.from), after: str(d.to) };
    case 'remove':
      return { text: `نقل ${who} «${name}» إلى سلة Google Drive` };
    case 'tag':
      return { text: `عدّل ${who} وسوم «${name}»`, before: list(d.before).join('، ') || '—', after: list(d.after).join('، ') || '—' };
    case 'access': {
      if (d.subject) {
        const subject =
          d.subject_type === 'role' ? roles[str(d.subject) as Role]?.name ?? str(d.subject) : nameOf(str(d.subject));
        return { text: `غيّر ${who} وصول ${subject} إلى «${name}»`, before: d.before == null ? 'موروث' : levelName(d.before), after: d.after == null ? 'موروث' : levelName(d.after) };
      }
      return { text: `${d.restricted ? 'قيّد' : 'أعاد وراثة الوصول في'} ${who} «${name}»`, before: d.restricted ? 'يرث الوصول' : 'مقيّد', after: d.restricted ? 'مقيّد' : 'يرث الوصول' };
    }
    case 'lock':
      return { text: `${d.locked ? 'قفل' : 'فتح قفل'} ${who} «${name}»`, before: d.locked ? 'مفتوح' : 'مقفل', after: d.locked ? `مقفل${d.reason ? `: ${str(d.reason)}` : ''}` : 'مفتوح' };
    case 'folder':
      return { text: `أنشأ ${who} مجلد «${name}»${d.parent ? ` داخل «${str(d.parent)}»` : ''}` };
    case 'note':
      return { text: `أضاف ${who} ملاحظة${d.timecode ? ` عند ${str(d.timecode)}` : ''}: ${str(d.text)}` };
    case 'download':
      return { text: `نزّل ${who} «${name}»` };
    case 'link':
      return { text: `أنشأ ${who} رابط مراجعة لـ «${name}»` };
    case 'undo':
      return { text: `تراجع ${who} عن: ${str(d.label)}` };
    default:
      return { text: `${who}: ${e.type}` };
  }
}

/** Filter labels for the log page. */
export const logTypeLabels: Record<string, string> = {
  upload: 'رفع',
  version: 'إصدار جديد',
  stage: 'تغيير مرحلة',
  approve: 'اعتماد',
  changes: 'طلب تعديل',
  reject: 'رفض',
  schedule: 'جدولة',
  publish: 'نشر',
  assign: 'إسناد مهمة',
  done: 'إتمام مهمة',
  copy: 'عنوان ووصف',
  rename: 'إعادة تسمية',
  move: 'نقل',
  remove: 'حذف',
  tag: 'وسوم',
  access: 'تغيير الوصول',
  lock: 'قفل',
  folder: 'مجلد',
  note: 'ملاحظة',
  download: 'تنزيل',
  link: 'رابط مراجعة',
  undo: 'تراجع',
  permission: 'الصلاحيات',
};

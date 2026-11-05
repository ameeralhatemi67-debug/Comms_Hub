// Empty stand-ins for what the calendar, the project pages and Home import but the colours check never opens: the
// day's dialogs, the work page's dialogs, the publishing dialogs, the works table, the plan editor's staff list, the
// «إنشاء» permission, the writing drafts and Home's permissions card (qa/calendar-colors.cjs).
const none = () => null;
export const AddDayDialog = none;
export const DueDialog = none;
export const EventDialog = none;
export const MoveDialog = none;
export const ReminderDialog = none;
export const TaskDialog = none;
export const TaskExtensionDialog = none;
export const ExtensionDialog = none;
export const ScheduleDialog = none;
export const WorkTable = none;
export const HomePermissions = none;
export const staffOf = () => [];
export const useCanCreate = () => true;
export const readLocalDraft = () => null;
export type DayPick = 'task' | 'event' | 'rem' | { ready: unknown };

// YouTube's four choices in the work cycle (MVP_draft.md section 78, Director_Notes_Plan.md N-3 step 5). Publishing works stays a
// simulation: this says what YouTube would be asked. The database holds the same rules (supabase/migrations/*work_youtube_choices*):
//   «نشر الآن»  each YouTube account of the work goes out «عام», «غير مدرج» or «خاص»: the publisher's choice, else the account's
//               default («الظهور الافتراضي»), else «عام».
//   «جدولة»     the fourth choice, «مجدول»: YouTube keeps the video private until its time and makes it public then, by itself, so a
//               scheduled work's YouTube accounts go out «عام» at the time. YouTube has no unlisted or private at a time.
// Approval does not change (answer Q5): a narrower choice than public is always allowed.
import { YT_CHOICE_AR, YT_CHOICE_SUB, type TestPrivacy, type YtChoice } from '../platforms/test-rules.ts';
import type { AccountRow, WorkRow } from './rules.ts';

/** A choice for «نشر الآن». */
export type NowChoice = TestPrivacy;
/** In the order the dialog offers them: «عام» first, as it is the default. */
export const NOW_CHOICES: readonly NowChoice[] = ['public', 'unlisted', 'private'];
export const isNowChoice = (v: unknown): v is NowChoice => v === 'public' || v === 'unlisted' || v === 'private';

/** A YouTube account's default at «نشر الآن»: its own, else «عام». The database keeps «عام» as no default. */
export const defaultChoice = (a: Pick<AccountRow, 'default_privacy'>): NowChoice => (isNowChoice(a.default_privacy) ? a.default_privacy : 'public');

/** The work's YouTube accounts, in the work's order. */
export const youtubeOf = (w: Pick<WorkRow, 'channels'>, accounts: readonly AccountRow[]) =>
  w.channels.map((c) => accounts.find((a) => a.id === c)).filter((a): a is AccountRow => !!a && a.platform === 'youtube');

/** What «نشر الآن» sends: every YouTube account of the work with its choice, picked or default. Nothing for any other account. */
export function nowOptions(w: Pick<WorkRow, 'channels'>, accounts: readonly AccountRow[], picked: Readonly<Record<string, NowChoice>>): Record<string, NowChoice> {
  const out: Record<string, NowChoice> = {};
  for (const a of youtubeOf(w, accounts)) out[a.id] = picked[a.id] ?? defaultChoice(a);
  return out;
}

/** How an account went out, in words, when YouTube did not show it to everyone; else null. */
export function narrowWord(r: { privacy?: string | null } | null | undefined): string | null {
  return r?.privacy === 'unlisted' || r?.privacy === 'private' ? YT_CHOICE_AR[r.privacy] : null;
}

/** The words of each choice and what it means, shared with «تجربة النشر». */
export const choiceWord = (c: YtChoice) => YT_CHOICE_AR[c];
export const choiceSub = (c: YtChoice) => YT_CHOICE_SUB[c];

/** A YouTube account in «جدولة»: the fourth choice, as YouTube does it. */
export const SCHEDULED_LINE = 'مجدول: يبقى خاصاً حتى الموعد، ثم يجعله يوتيوب عاماً. لنشره غير مدرج أو خاصاً اختر «نشر الآن».';

/** What the publisher chooses in YouTube Studio when publishing there by hand («حزمة النشر»). */
export function studioStep(c: YtChoice): string {
  if (c === 'scheduled') return 'في YouTube Studio اختر «جدولة» بالموعد نفسه، فيجعله يوتيوب عاماً في موعده.';
  return `في YouTube Studio اختر في «الظهور»: «${YT_CHOICE_AR[c]}».`;
}

// Checks before an export, for the platforms it is meant for (MVP_draft.md 62.10). They use only what the
// site holds about each platform: whether it takes video only (`accepts.video_only`, which the database
// itself enforces: the one stop), a video length limit when the registry states one (`max_video_seconds`,
// information), and the shape the library suggests for it (`platformSpecs`, a note). Pure.
import { RATIOS, type Ratio } from './schema.ts';

export type PlatformFacts = { key: string; label: string; videoOnly: boolean; maxSeconds?: number; suggested?: { ratio: number; size: string } };
export type Check = { level: 'stop' | 'warn' | 'note'; text: string };

/** What an export would be: a video or a picture, the width / height of each file, and its length in seconds. */
export type Planned = { kind: 'video' | 'still'; ratios: number[]; seconds: number };

const ratioLabel = (r: number) => {
  const known = (Object.keys(RATIOS) as Ratio[]).find((k) => Math.abs(RATIOS[k].w / RATIOS[k].h - r) / r < 0.02);
  return known ?? r.toFixed(2);
};

export function exportChecks(planned: Planned, platforms: PlatformFacts[]): Check[] {
  const out: Check[] = [];
  for (const p of platforms) {
    if (planned.kind === 'still' && p.videoOnly) out.push({ level: 'stop', text: `${p.label} يقبل الفيديو وحده، والتصدير صورة.` });
    if (planned.kind === 'video' && p.maxSeconds && planned.seconds > p.maxSeconds) out.push({ level: 'warn', text: `${p.label}: مدة المقطع ${Math.round(planned.seconds)} ثانية، والحد المسجل في «المنصات» ${p.maxSeconds} ثانية.` });
    if (p.suggested) {
      const fit = planned.ratios.some((r) => Math.abs(r - p.suggested!.ratio) / p.suggested!.ratio < 0.06);
      if (!fit) out.push({ level: 'note', text: `${p.label}: الشكل الذي تقترحه المكتبة ${ratioLabel(p.suggested.ratio)} (${p.suggested.size})، وليس بين أشكال هذا التصدير.` });
    }
  }
  return out;
}

export const hasStop = (checks: Check[]) => checks.some((c) => c.level === 'stop');

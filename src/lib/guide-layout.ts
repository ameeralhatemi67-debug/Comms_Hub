// A setup guide shown as one page (MVP_draft.md section 67.10): every step in order under a list of its parts, and inside a
// step each picture right under the actions it shows, each value to copy and each field of the keys under the action that
// asks for it. Pure: drawn by src/components/settings/guide-doc.tsx and held by tests/guide-layout.test.mjs. The words, the
// pictures and the ids stay in src/lib/setup-guides.ts; nothing here changes what a step is or how its progress is saved.
import type { Guide, GuideShot, GuideStep } from './setup-guides.ts';

/** The guides drawn as one page. The others keep the step sheet until they are moved. */
export const WHOLE_GUIDES: readonly string[] = ['google', 'meta', 'tiktok', 'snapchat'];
export const isWholeGuide = (key: string | null | undefined) => !!key && WHOLE_GUIDES.includes(key);

/** A picture is drawn at most this wide on the page, and opens at its own size on a click (the director's note of 2026-11-16). */
export const SHOT_MAX = 400;

export type CopyValue = { label: string; value: string };
export type KeyField = 'id' | 'secret' | 'config' | 'more';
export type LaidAction = { n: number; t: string; ringed: boolean; copies: CopyValue[]; fields: KeyField[] };
export type LaidShot = GuideShot & { i: number };
/** Actions in order, and the pictures that show them drawn after the last of them. */
export type Part = { acts: LaidAction[]; shots: LaidShot[] };
export type LaidStep = { parts: Part[]; copies: CopyValue[]; fields: KeyField[] };

/** The action numbers a picture's rings point at ('x' marks what not to do and points at none). */
export const ringNumbers = (s: GuideShot) => (s.rings ?? []).filter((r) => r !== 'x').map(Number);

/**
 * Where a step's parts go. A picture belongs to the last action its rings point at, or to `at`, or else to the action of the
 * picture before it; the actions are cut into parts at those places, so every action a picture rings is drawn above it.
 * A value to copy goes under its `at`, or the first action that says «أدناه», or after the actions. A keys field goes
 * under its place in `fieldsAt`, or after the actions.
 */
export function layoutStep(step: GuideStep, opts: { keys?: KeyField[] } = {}): LaidStep {
  const todo = step.todo ?? [];
  const last = todo.length;
  const ringed = new Set((step.shots ?? []).flatMap(ringNumbers));
  const acts: LaidAction[] = todo.map((t, i) => ({ n: i + 1, t, ringed: ringed.has(i + 1), copies: [], fields: [] }));
  const valid = (n: number | undefined) => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= last;

  let prev = last > 0 ? 1 : 0;
  const shots = (step.shots ?? []).map((s, i) => {
    const nums = ringNumbers(s).filter((n) => valid(n));
    const anchor = valid(s.at) ? (s.at as number) : nums.length ? Math.max(...nums) : prev;
    prev = anchor;
    return { shot: { ...s, i }, anchor };
  });

  const parts: Part[] = [];
  let from = 1;
  for (const a of [...new Set(shots.map((x) => x.anchor))].sort((p, q) => p - q)) {
    parts.push({ acts: acts.filter((x) => x.n >= from && x.n <= a), shots: shots.filter((x) => x.anchor === a).map((x) => x.shot) });
    from = Math.max(from, a + 1);
  }
  if (from <= last) parts.push({ acts: acts.filter((x) => x.n >= from), shots: [] });

  const copies: CopyValue[] = [];
  const below = todo.findIndex((t) => t.includes('أدناه')) + 1;
  const place = (c: CopyValue, at: number | undefined) => {
    const n = valid(at) ? (at as number) : below > 0 ? below : 0;
    if (n > 0) acts[n - 1].copies.push(c);
    else copies.push(c);
  };
  if (step.copy) place({ label: step.copyLabel ?? 'العنوان', value: step.copy }, step.copyAt);
  for (const m of step.more ?? []) place({ label: m.label, value: m.copy }, m.at);

  const fields: KeyField[] = [];
  for (const f of opts.keys ?? []) {
    const at = step.fieldsAt?.[f];
    if (valid(at)) acts[(at as number) - 1].fields.push(f);
    else fields.push(f);
  }
  return { parts, copies, fields };
}

/** A guide's parts with their steps, in order; a guide without parts is one part with no name. */
export function phasesOf(g: Guide): { t: string | null; steps: GuideStep[] }[] {
  if (!g.phases?.length) return [{ t: null, steps: g.steps }];
  return g.phases.map((p) => ({ t: p.t, steps: p.ids.map((id) => g.steps.find((s) => s.id === id)).filter((s): s is GuideStep => !!s) }));
}

/** The name of the part a step belongs to. */
export const phaseOf = (g: Guide, id: string) => g.phases?.find((p) => p.ids.includes(id))?.t ?? null;

/** How many pictures a guide carries. */
export const shotCount = (g: Guide) => g.steps.reduce((n, s) => n + (s.shots?.length ?? 0), 0);

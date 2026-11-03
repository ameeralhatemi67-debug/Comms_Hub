// «توحيد مستوى الصوت» without its extra pass (Desktop_Power_Ideas.md P-15; MVP_draft.md 62.9). While the export panel
// is open and nothing is asked of it, the loudness of the project's mix is measured the way the export measures it
// (export.ts measureLoudness, in the browser's idle time between windows) and kept under a key of everything the mix
// depends on: the project's length, and on every track that can sound its kind, muting, role and lowering, and every
// clip's fields except those that move only the picture, with each clip's source named by what it is (a library file
// at a version, or a device file's key). Anything not known to be picture-only is in the key, so a new field can only
// make the stored figure miss, never mislead. A figure is stored only when every source heard was ready. The sources'
// waveforms are asked for at the same time (media.ts keeps them). Kept in this page only. Browser only.
import { durationOf, type ProjectDoc } from './schema.ts';
import { audibleIn } from './audio.ts';
import { measureLoudness } from './export.ts';
import type { LoudnessResult } from './loudness.ts';
import type { MediaPool } from './media.ts';

/** Clip fields that change the picture alone. */
const PICTURE_ONLY = new Set(['id', 'transform', 'fit', 'crop', 'adjust', 'animIn', 'animOut', 'pinned', 'fromWork', 'text', 'motion', 'cover', 'sticker', 'shape']);

/** The key of a project's sound. */
export function soundKey(doc: ProjectDoc): string {
  const named = new Map(doc.sources.map((s) => [s.id, s.kind === 'library' ? `l:${s.asset}:${s.version}:${s.media}` : `d:${s.key}:${s.media}`]));
  const tracks = (doc.video?.tracks ?? [])
    .filter((t) => t.kind === 'audio' || t.kind === 'video')
    .map((t) => ({
      kind: t.kind,
      muted: !!t.muted,
      role: t.role ?? null,
      duck: t.duck ?? 0,
      clips: t.clips.map((c) => {
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(c).sort()) {
          if (PICTURE_ONLY.has(k)) continue;
          if (k === 'source') out.source = named.get(c.source as string) ?? `?${String(c.source)}`;
          // of the keyframes only the speed's change the sound (a retimed clip is silent)
          else if (k === 'keys') out.keys = (c.keys as { speed?: unknown } | undefined)?.speed ?? null;
          else out[k] = c[k];
        }
        return out;
      }),
    }));
  return JSON.stringify({ duration: durationOf(doc), tracks });
}

const KEEP = 8;
const stored = new Map<string, LoudnessResult>();

/** The stored figure for the project as it is now, if any. */
export function storedLoudness(doc: ProjectDoc): LoudnessResult | null {
  return stored.get(soundKey(doc)) ?? null;
}

function store(key: string, r: LoudnessResult) {
  stored.delete(key);
  stored.set(key, r);
  while (stored.size > KEEP) stored.delete(stored.keys().next().value as string);
}

/** Whether every source heard in the project is ready to be read (otherwise a measurement would hear silence). */
export function soundReady(doc: ProjectDoc, pool: MediaPool): boolean {
  const ids = new Set(audibleIn(doc, 0, durationOf(doc)).map(({ clip }) => clip.source as string));
  return [...ids].every((id) => pool.state(id)?.kind === 'ready');
}

/**
 * The loudness of the project's sound: the stored figure when the sound has not changed since, otherwise measured
 * now (and stored). `cached` says which.
 */
export async function loudnessOf(doc: ProjectDoc, pool: MediaPool, opts: { onProgress?: (f: number) => void; signal?: AbortSignal } = {}): Promise<LoudnessResult & { cached: boolean }> {
  const key = soundKey(doc);
  const got = stored.get(key);
  if (got) return { ...got, cached: true };
  const ready = soundReady(doc, pool);
  const r = await measureLoudness(doc, pool, opts);
  if (ready) store(key, r);
  return { ...r, cached: false };
}

const idle = () =>
  new Promise<void>((resolve) => {
    const ric = (globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) ric(() => resolve(), { timeout: 1000 });
    else setTimeout(resolve, 50);
  });

/**
 * Works out ahead what an export with «توحيد مستوى الصوت» needs: the waveforms of the sources heard, then the loudness,
 * one window at a time in idle time. Ends quietly when aborted or when a source is not ready; returns the figure, or
 * null when nothing was stored.
 */
export async function workAhead(doc: ProjectDoc, pool: MediaPool, signal: AbortSignal): Promise<LoudnessResult | null> {
  const heard = audibleIn(doc, 0, durationOf(doc));
  if (!heard.length || !soundReady(doc, pool)) return null;
  for (const id of new Set(heard.map(({ clip }) => clip.source as string))) pool.peaks(id);
  const key = soundKey(doc);
  const got = stored.get(key);
  if (got) return got;
  try {
    const r = await measureLoudness(doc, pool, { signal, between: idle });
    if (signal.aborted || !soundReady(doc, pool)) return null;
    store(key, r);
    return r;
  } catch {
    return null;
  }
}

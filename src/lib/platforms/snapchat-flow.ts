// The flow of one Snapchat test once its file is ready (MVP_draft.md section 85, Snapchat_Test_Plan.md): encrypt, create the media, send the one
// part, post, read back, and record or delete. It is free of Drive, the vault and the session: everything it touches arrives in `FlowDeps`
// (the fetch, the server key, the token, the file, the database's functions), so tests/snapchat-test.test.mjs runs it against a fake Snap and a fake
// database, as tests/direct-schedule.test.mjs runs the due engine. ./test-snapchat.ts wires the real ones and turns the answer into a response.
import type { Fetch } from './oauth.ts';
import { snCreateMedia, snEncrypt, snFinalize, snKeys, snPostSpotlight, snPostStory, snSpotlight, snSpotlightDelete, snUploadPart } from './snapchat.ts';
import { SN_STORY_HOURS, type SnKind } from './test-rules.ts';

export type FlowTest = { id: string; kind: SnKind; profile: string; title: string; scheduledFor: string | null };
export type FlowDb = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
export type FlowDeps = {
  f: Fetch;
  /** The server key: it proves each step to the database and derives the media key. */
  key: string;
  token: string;
  /** The test's whole file, or null when it cannot be read. */
  read: () => Promise<Uint8Array | null>;
  rpc: FlowDb;
  now?: () => number;
};
/** What the flow ends with: the answer the page gets, a failure to record against the test (`fail`), or a refusal of the database's (`refuse`). */
export type FlowResult =
  | { done: true; kind: SnKind; silent?: boolean; deleted?: boolean; post?: string; status?: string | null; at?: string; endsAt?: string; error?: string }
  | { fail: string; detail?: string }
  | { refuse: string };

const codeOf = (m: string | null | undefined) => /\b([A-Z][A-Z_]{3,39})\b/.exec(m ?? '')?.[1] ?? 'PLATFORM_ERROR';
/** Snap's RFC 3339 time, to the second. */
export const rfc3339 = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

export async function snapSend(d: FlowDeps, t: FlowTest): Promise<FlowResult> {
  const now = d.now ?? Date.now;
  const plain = await d.read();
  if (!plain) return { fail: 'FILE_UNREADABLE' };
  const k = snKeys(d.key, t.id);
  const media = await snCreateMedia(d.f, { token: d.token, profile: t.profile, type: 'VIDEO', name: 'comms-hub-test', key: k.key, iv: k.iv });
  if ('error' in media) return { fail: media.error, detail: media.detail };
  const kept = await d.rpc('platform_test_container', { p_key: d.key, p_test: t.id, p_container: media.media });
  if (kept.error) return { fail: 'PLATFORM_ERROR' };
  const up = await snUploadPart(d.f, { token: d.token, path: media.add, part: 1, bytes: snEncrypt(plain, k.key, k.iv) });
  if ('error' in up) return { fail: up.error, detail: up.detail };
  const fin = await snFinalize(d.f, { token: d.token, path: media.finalize });
  if ('error' in fin) return { fail: fin.error, detail: fin.detail };

  /** Records the post as published on the account's Public Profile; a refusal when the database says no (another profile, or the test closed). */
  const record = async (post: string | null): Promise<FlowResult | null> => {
    const { data, error } = await d.rpc('platform_test_done', { p_key: d.key, p_test: t.id, p_video: post, p_channel: t.profile, p_privacy: null, p_url: null });
    if (error) return { refuse: codeOf(error.message) };
    return data === 'published' ? null : { refuse: 'CHANNEL_MISMATCH' };
  };

  if (t.kind === 'snap_story') {
    const p = await snPostStory(d.f, { token: d.token, profile: t.profile, media: media.media });
    if ('error' in p) return { fail: p.error, detail: p.detail };
    // Snap gives no story id: the test is recorded without one, and the Story ends by itself.
    return (await record(null)) ?? { done: true, kind: t.kind, endsAt: new Date(now() + SN_STORY_HOURS * 36e5).toISOString() };
  }

  const silent = t.kind === 'snap_silent';
  const at = silent && t.scheduledFor ? rfc3339(Date.parse(t.scheduledFor)) : undefined;
  if (silent && (!at || at.startsWith('Invalid'))) return { fail: 'TEST_INVALID' };
  const p = await snPostSpotlight(d.f, { token: d.token, profile: t.profile, media: media.media, description: t.title, goLive: at });
  if ('error' in p) return { fail: p.error, detail: p.detail };
  const read = await snSpotlight(d.f, { token: d.token, profile: t.profile, id: p.spotlight });
  const status = 'error' in read || 'gone' in read ? null : read.status;
  if (!silent) return (await record(p.spotlight)) ?? { done: true, kind: t.kind, post: p.spotlight, status };

  // The silent check: what was made must be what is read back; then it is deleted at once. Nothing is ever shown (if Snap hides a scheduled
  // Spotlight until its time, which its documentation says in one line and nothing here has proved).
  if ('error' in read || 'gone' in read || read.id !== p.spotlight) {
    await snSpotlightDelete(d.f, { token: d.token, profile: t.profile, id: p.spotlight });
    return { fail: 'error' in read ? read.error : 'SN_SILENT_MISMATCH', detail: 'error' in read ? read.detail : undefined };
  }
  const refused = await record(p.spotlight);
  if (refused) return refused;
  const del = await snSpotlightDelete(d.f, { token: d.token, profile: t.profile, id: p.spotlight });
  if ('error' in del) return { done: true, kind: t.kind, silent: true, deleted: false, error: 'SN_SILENT_NOT_DELETED', post: p.spotlight, status, at };
  const { error } = await d.rpc('platform_test_deleted', { p_key: d.key, p_test: t.id });
  if (error) return { refuse: codeOf(error.message) };
  return { done: true, kind: t.kind, silent: true, deleted: true, post: p.spotlight, status, at };
}

// The server half of «تجربة النشر» on Instagram (MVP_draft.md section 72), which the routes in src/app/api/platforms/test/
// call. Server only: it reads the account's token from the vault for one request, never returns it, and never logs a
// response body. The person's session decides who may (the platform_test_* functions); the server key proves each step
// comes from this site.
//
// The steps, driven by the open page because nothing runs in the background:
//   1. start: the database records the test; the server checks the account with Meta. A file from the device gets a Drive
//      upload session in the site's folder «تجارب النشر», under a name the server chose; a library video goes on at once.
//   2. uploaded: the server checks that Drive holds exactly that file (name, folder, uploader, size), then sends.
//   3. send: a temporary public address (32 random bytes, only the hash kept, 30 minutes) is set, and Meta is asked to
//      make a container from it.
//   4. advance, each time the page asks: Meta's status; once ready the address ends, the post is published, its link
//      read, the result recorded and the temporary copy moved to Drive's trash.
import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { json } from './route.ts';
import { serverKeyOrNull } from '../integrations/vault.ts';
import { loadApp, loadSecret } from './connect.ts';
import { metaAccountHealth, type Fetch } from './oauth.ts';
import { igContainerStatus, igCreateContainer, igDelete, igMedia, igPublish, igPublishingLimit, type IgPost } from './instagram.ts';
import { IG_LINK_MINUTES, IG_VIDEO_TYPES, igProblem, igTitle, isPictureKind, type TestKind } from './test-rules.ts';
import { dbCode, giveUp, refuse, testInfo, type TestInfo } from './test-server.ts';
import { openStored, storageConfigured, storageFor } from '../storage/index.ts';

const TEMP_MARKER = 'commsHubPublishTests';
const TEMP_FOLDER = 'تجارب النشر';
const IG_KINDS: readonly TestKind[] = ['story_image', 'story_video', 'image', 'reel'];
const quiet = <T>(p: Promise<T>) => p.then(() => undefined, () => undefined);
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

/** The name the server gives a device file in «تجارب النشر»: it alone proves which upload is this test's. */
export const tempName = (id: string, mime: string) => `تجربة-${id}.${mime === 'image/jpeg' ? 'jpg' : mime === 'video/quicktime' ? 'mov' : 'mp4'}`;
/** The temporary address's token and the hash the database keeps. */
export function newLink(): { token: string; hash: string } {
  const token = randomBytes(32).toString('hex');
  return { token, hash: hashOf(token) };
}
export const hashOf = (token: string) => createHash('sha256').update(token).digest('hex');

/** The account's token, checked with Meta first when `check` (the account answers and the token is valid), as a check records it. */
export async function instagramToken(db: SupabaseClient, f: Fetch, t: Pick<TestInfo, 'account' | 'integration' | 'external_id'>, purpose: string, check: boolean): Promise<{ token: string } | { error: string }> {
  const key = serverKeyOrNull();
  if (!key) return { error: 'APP_NOT_CONFIGURED' };
  const app = await loadApp(db, 'meta', purpose);
  if (!app) return { error: 'APP_NOT_CONFIGURED' };
  const token = t.integration ? await loadSecret(db, t.integration, purpose) : null;
  if (!token) return { error: 'NOT_CONNECTED' };
  if (!check) return { token };
  try {
    const h = await metaAccountHealth(f, { appId: app.appId, secret: app.secret, objectId: t.external_id ?? '', token, instagram: true });
    await quiet(Promise.resolve(db.rpc('platform_conn_health', { p_key: key, p_account: t.account, p_ok: h.ok, p_error: h.error, p_expires: h.expiresAt, p_new_secret: null })));
    return h.ok ? { token } : { error: h.error ?? 'TOKEN_REFUSED' };
  } catch {
    return { error: 'UNREACHABLE' };
  }
}

async function trashTemp(t: Pick<TestInfo, 'temp_ref'>) {
  if (t.temp_ref) await quiet(storageFor('library').trash(t.temp_ref));
}
/** Stops a test that cannot go on: the record, the address and the temporary copy. */
async function stop(db: SupabaseClient, t: TestInfo, code: string) {
  await trashTemp(t);
  return giveUp(db, t.id, code);
}

/** Step 1. `b` is the page's request: account, kind, source, asset (a library video), size and mime (a device file), caption, alt, share_to_feed. */
export async function igStart(request: Request, db: SupabaseClient, b: Record<string, unknown>, me: string) {
  const kind = b.kind as TestKind;
  if (!IG_KINDS.includes(kind) || (b.source !== 'device' && b.source !== 'library')) return refuse('TEST_INVALID');
  // A Story takes no caption.
  const caption = kind === 'story_image' || kind === 'story_video' ? '' : str(b.caption, 2400);
  const alt = kind === 'image' ? str(b.alt, 1100) : '';
  let size: number;
  let mime: string;
  let asset: string | null = null;
  let version: number | null = null;
  if (b.source === 'library') {
    // A library picture is redrawn to JPEG in the browser and comes as a device file; only a video is read where it is.
    if (isPictureKind(kind) || typeof b.asset !== 'string') return refuse('TEST_INVALID');
    const { data: f } = await db.from('media_files').select('id, mime_type, size_bytes, current_version').eq('id', b.asset).maybeSingle();
    if (!f) return Response.json({ error: 'الملف غير موجود، أو لا تصل إلى مجلده.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    size = Number(f.size_bytes);
    mime = String(f.mime_type).toLowerCase();
    asset = f.id as string;
    version = Number(f.current_version);
  } else {
    size = Number(b.size);
    mime = typeof b.mime === 'string' ? b.mime.toLowerCase() : '';
  }
  const problem = igProblem({ kind, size, mime, caption, alt });
  if (problem) return Response.json({ error: problem }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  if (b.source === 'device' && !(await storageConfigured('library'))) return refuse('DRIVE_NOT_CONNECTED');

  const { data: id, error } = await db.rpc('platform_test_start', {
    p_account: b.account,
    p: { kind, title: igTitle(kind, caption), source: b.source, asset, version, size, mime, share_to_feed: kind === 'reel' ? b.share_to_feed === true : null },
  });
  if (error || typeof id !== 'string') return refuse(dbCode(error?.message));
  const t = await testInfo(db, id);
  if (!t) return giveUp(db, id, 'FORBIDDEN');

  const tok = await instagramToken(db, fetch, t, 'تجربة نشر على إنستغرام', true);
  if ('error' in tok) return giveUp(db, id, tok.error);
  const quota = await igPublishingLimit(fetch, { token: tok.token, user: t.external_id ?? '' });
  if (quota && quota.used >= quota.total) return giveUp(db, id, 'QUOTA_REACHED');

  if (t.source === 'library') return igSend(request, db, t, tok.token, { caption, alt }, quota);
  try {
    const storage = storageFor('library');
    const folder = await storage.markedFolder(TEMP_MARKER, TEMP_FOLDER);
    const upload = await storage.startUpload({ name: tempName(id, mime), mimeType: mime, size, origin: new URL(request.url).origin, uploadedBy: me, parentId: folder });
    return json({ test: id, phase: 'upload', upload, quota });
  } catch {
    return giveUp(db, id, 'TEMP_UPLOAD_FAILED');
  }
}

/** Step 2: the device file arrived in Drive. Only the file this test's session made is accepted. */
export async function igUploaded(request: Request, db: SupabaseClient, t: TestInfo, b: Record<string, unknown>, me: string) {
  if (!t.mine || t.state !== 'uploading' || t.source !== 'device' || t.temp_ref || t.container) return refuse('TEST_INVALID');
  const ref = typeof b.ref === 'string' && /^[A-Za-z0-9_-]{10,200}$/.test(b.ref) ? b.ref : null;
  if (!ref) return refuse('TEST_INVALID');
  try {
    const storage = storageFor('library');
    const [folder, info] = await Promise.all([storage.markedFolder(TEMP_MARKER, TEMP_FOLDER), storage.info(ref)]);
    const same =
      info.name === tempName(t.id, t.mime) && (info.parents ?? []).includes(folder) && !info.trashed && Number(info.size) === t.size && info.appProperties?.uploadedBy === me;
    if (!same) return giveUp(db, t.id, 'TEMP_MISMATCH');
  } catch {
    return giveUp(db, t.id, 'TEMP_UPLOAD_FAILED');
  }
  const { error } = await db.rpc('platform_test_temp', { p_key: serverKeyOrNull(), p_test: t.id, p_ref: ref });
  if (error) return refuse(dbCode(error.message));
  const tok = await instagramToken(db, fetch, t, 'تجربة نشر على إنستغرام', false);
  if ('error' in tok) return stop(db, { ...t, temp_ref: ref }, tok.error);
  return igSend(request, db, { ...t, temp_ref: ref }, tok.token, { caption: str(b.caption, 2400), alt: str(b.alt, 1100) }, null);
}

/** Step 3: the temporary address, and Meta's container made from it. */
async function igSend(request: Request, db: SupabaseClient, t: TestInfo, token: string, words: { caption: string; alt: string }, quota: { used: number; total: number } | null) {
  const key = serverKeyOrNull();
  const kind = t.kind as IgPost['kind'];
  const caption = kind === 'story_image' || kind === 'story_video' ? '' : words.caption;
  const alt = kind === 'image' ? words.alt : '';
  const problem = igProblem({ kind, size: t.size, mime: t.mime, caption, alt });
  if (problem) return stop(db, t, 'TEST_INVALID');
  const link = newLink();
  const until = new Date(Date.now() + IG_LINK_MINUTES * 60_000).toISOString();
  const { error } = await db.rpc('platform_test_link', { p_key: key, p_test: t.id, p_hash: link.hash, p_until: until });
  if (error) return stop(db, t, dbCode(error.message));
  const url = `${new URL(request.url).origin}/api/platforms/test/file/${link.token}`;
  const c = await igCreateContainer(fetch, { token, user: t.external_id ?? '', post: { kind, url, caption, alt, shareToFeed: t.share_to_feed === true } });
  if ('error' in c) return stop(db, t, c.error);
  const { error: kept } = await db.rpc('platform_test_container', { p_key: key, p_test: t.id, p_container: c.id });
  if (kept) return stop(db, t, 'PLATFORM_ERROR');
  return json({ test: t.id, phase: 'wait', quota });
}

/** Step 4, each time the page asks: still preparing, or published, or stopped with Meta's reason. */
export async function igAdvance(db: SupabaseClient, t: TestInfo) {
  if (!t.mine || t.state !== 'uploading' || !t.container) return refuse('TEST_INVALID');
  const tok = await instagramToken(db, fetch, t, 'تجربة نشر على إنستغرام', false);
  if ('error' in tok) return tok.error === 'UNREACHABLE' ? refuse(tok.error, true) : stop(db, t, tok.error);
  const s = await igContainerStatus(fetch, { token: tok.token, id: t.container });
  if ('error' in s) return s.error === 'UNREACHABLE' || s.error === 'PLATFORM_DOWN' || s.error === 'RATE_LIMIT' ? refuse(s.error, true) : stop(db, t, s.error);
  if (s.state === 'wait') return json({ phase: 'wait' });
  if (s.state === 'published') return stop(db, t, 'PLATFORM_ERROR');
  // Meta has the file: the address ends before anything else.
  await quiet(Promise.resolve(db.rpc('platform_test_link', { p_key: serverKeyOrNull(), p_test: t.id, p_hash: null, p_until: null })));
  const p = await igPublish(fetch, { token: tok.token, user: t.external_id ?? '', container: t.container });
  if ('error' in p) return stop(db, t, p.error);
  const m = await igMedia(fetch, { token: tok.token, id: p.id });
  const link = 'error' in m ? null : m.permalink;
  // The post was made through this account's own publishing address; its owner is checked when Meta names it.
  const owner = 'error' in m ? t.external_id : (m.owner ?? t.external_id);
  const { data: state, error } = await db.rpc('platform_test_done', { p_key: serverKeyOrNull(), p_test: t.id, p_video: p.id, p_channel: owner, p_privacy: null, p_url: link });
  await trashTemp(t);
  if (error) return refuse(dbCode(error.message));
  if (state !== 'published') return refuse('CHANNEL_MISMATCH');
  return json({ done: true, post: p.id, url: link, kind: t.kind });
}

/** DELETE: a waiting test is cancelled by whoever started it; a published one is deleted on Instagram. */
export async function igRemove(db: SupabaseClient, t: TestInfo) {
  if (t.state === 'uploading') {
    if (!t.mine) return refuse('FORBIDDEN');
    await trashTemp(t);
    const { error } = await db.rpc('platform_test_failed', { p_key: serverKeyOrNull(), p_test: t.id, p_error: 'CANCELLED' });
    return error ? refuse(dbCode(error.message)) : json({ cancelled: true });
  }
  if (t.state !== 'published' || !t.video) return refuse('TEST_INVALID');
  const tok = await instagramToken(db, fetch, t, 'حذف منشور تجربة من إنستغرام', true);
  if ('error' in tok) return refuse(tok.error);
  const r = await igDelete(fetch, { token: tok.token, id: t.video });
  if ('error' in r) return refuse(r.error);
  const { error } = await db.rpc('platform_test_deleted', { p_key: serverKeyOrNull(), p_test: t.id });
  if (error) return refuse(dbCode(error.message));
  return json({ deleted: true, gone: r.gone });
}

/** The temporary address, for Meta: the file while the link lasts, byte ranges included; 404 for anything else. */
export async function igServe(request: Request, db: SupabaseClient, token: string, head: boolean): Promise<Response> {
  const none = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
  const key = serverKeyOrNull();
  if (!key || !/^[0-9a-f]{64}$/.test(token)) return none();
  const { data, error } = await db.rpc('platform_test_fetch', { p_key: key, p_hash: hashOf(token) });
  if (error || !data) return none();
  const file = data as { ref: string; mime: string; size: number };
  const isVideo = (IG_VIDEO_TYPES as readonly string[]).includes(file.mime);
  if (file.mime !== 'image/jpeg' && !isVideo) return none();
  const headers = new Headers({
    'Content-Type': file.mime,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  });
  if (head) {
    headers.set('Content-Length', String(file.size));
    return new Response(null, { status: 200, headers });
  }
  try {
    const upstream = await openStored('library', file.ref, request.headers.get('range'));
    if (!upstream.ok && upstream.status !== 206) return none();
    for (const name of ['Content-Length', 'Content-Range']) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return none();
  }
}

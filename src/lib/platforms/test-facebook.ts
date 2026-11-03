// The server half of «تجربة النشر» on a Facebook Page (MVP_draft.md section 73), which the routes in
// src/app/api/platforms/test/ call. Server only: it reads the Page's token from the vault for one request, never returns it,
// and never logs a response body. The person's session decides who may (the platform_test_* functions); the server key
// proves each step comes from this site. What it shares with Instagram (the token check, the temporary Drive copy, the
// temporary address Meta fetches from) is in ./test-instagram.ts.
//
// The kinds:
//   fb_silent  one request: a post scheduled four weeks ahead, read back from the Page (unpublished, on this Page), deleted at
//              once. Recorded as published, then deleted. If the delete is refused, it stays published (scheduled) and the
//              list offers the delete, with the date it would appear.
//   fb_text    one request: the post, then its link read back.
//   fb_photo   the page sends the JPEG to PUT /api/platforms/test/[id] as a form (at most 4 MB); the server passes it to Meta
//              as a file. Nothing is kept in Drive.
//   fb_reel    started, fetched by Meta from the temporary address, then finished while the page asks (`advance`).
import type { SupabaseClient } from '@supabase/supabase-js';
import { json } from './route.ts';
import { serverKeyOrNull } from '../integrations/vault.ts';
import { fbDelete, fbFeedPost, fbPhoto, fbPostInfo, fbReelFinish, fbReelStart, fbReelStatus, fbReelUpload, fbVideoInfo } from './facebook.ts';
import { FB_MESSAGE_MAX, FB_PHOTO_BODY_MAX, FB_SILENT_DAYS, FB_SILENT_MESSAGE, fbProblem, fbTitle, isFbKind, type TestKind } from './test-rules.ts';
import { dbCode, giveUp, refuse, testInfo, type TestInfo } from './test-server.ts';
import { acceptTemp, endLink, metaToken, openTempUpload, setLink, stop, str, trashTemp } from './test-instagram.ts';
import { storageConfigured } from '../storage/index.ts';
import { sniffImage } from '../storage/writing.ts';

const PURPOSE = 'تجربة نشر على فيسبوك';
const pageToken = (db: SupabaseClient, t: Pick<TestInfo, 'account' | 'integration' | 'external_id'>, check: boolean, purpose = PURPOSE) => metaToken(db, fetch, t, purpose, check, false);
const bad = (error: string, status = 400) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

/** Records the post as published on the account's Page; `null` when the database refused it (another Page, or the test closed). */
async function record(db: SupabaseClient, t: TestInfo, post: string, page: string | null, link: string | null): Promise<Response | null> {
  const { data: state, error } = await db.rpc('platform_test_done', { p_key: serverKeyOrNull(), p_test: t.id, p_video: post, p_channel: page, p_privacy: null, p_url: link });
  if (error) return refuse(dbCode(error.message));
  return state === 'published' ? null : refuse('CHANNEL_MISMATCH');
}

/** Step 1. `b` is the page's request: account, kind, message, link (a text post), source, asset (a library video), size and mime. */
export async function fbStart(request: Request, db: SupabaseClient, b: Record<string, unknown>, me: string) {
  const kind = b.kind as TestKind;
  if (typeof kind !== 'string' || !isFbKind(kind)) return refuse('TEST_INVALID');
  const message = kind === 'fb_silent' ? FB_SILENT_MESSAGE : str(b.message, FB_MESSAGE_MAX + 200);
  const link = kind === 'fb_text' ? str(b.link, 2100).trim() : '';
  let size: number | null = null;
  let mime: string | null = null;
  let asset: string | null = null;
  let version: number | null = null;
  let source: 'device' | 'library' | null = null;
  if (kind === 'fb_photo' || kind === 'fb_reel') {
    if (b.source !== 'device' && b.source !== 'library') return refuse('TEST_INVALID');
    source = b.source;
    if (source === 'library') {
      // A library picture is redrawn to JPEG in the browser and comes as a device file; only a Reel is read where it is.
      if (kind === 'fb_photo' || typeof b.asset !== 'string') return refuse('TEST_INVALID');
      const { data: f } = await db.from('media_files').select('id, mime_type, size_bytes, current_version').eq('id', b.asset).maybeSingle();
      if (!f) return bad('الملف غير موجود، أو لا تصل إلى مجلده.', 404);
      size = Number(f.size_bytes);
      mime = String(f.mime_type).toLowerCase();
      asset = f.id as string;
      version = Number(f.current_version);
    } else {
      size = Number(b.size);
      mime = typeof b.mime === 'string' ? b.mime.toLowerCase() : '';
    }
  }
  const problem = fbProblem({ kind, message, link, size, mime });
  if (problem) return bad(problem);
  if (kind === 'fb_reel' && source === 'device' && !(await storageConfigured('library'))) return refuse('DRIVE_NOT_CONNECTED');

  // The silent check's date: four weeks ahead, to the minute.
  const when = kind === 'fb_silent' ? Math.floor((Date.now() + FB_SILENT_DAYS * 864e5) / 60_000) * 60 : null;
  const { data: id, error } = await db.rpc('platform_test_start', {
    p_account: b.account,
    p: { kind, title: fbTitle(kind, message), link: link || null, scheduled_for: when ? new Date(when * 1000).toISOString() : null, source, asset, version, size, mime },
  });
  if (error || typeof id !== 'string') return refuse(dbCode(error?.message));
  const t = await testInfo(db, id);
  if (!t) return giveUp(db, id, 'FORBIDDEN');
  const tok = await pageToken(db, t, true);
  if ('error' in tok) return giveUp(db, id, tok.error);
  const page = t.external_id ?? '';

  if (kind === 'fb_silent') return silentCheck(db, t, tok.token, page, when!);
  if (kind === 'fb_text') {
    const p = await fbFeedPost(fetch, { token: tok.token, page, message, link: link || undefined });
    if ('error' in p) return giveUp(db, id, p.error);
    const info = await fbPostInfo(fetch, { token: tok.token, id: p.id });
    // The post was made on this Page's own feed; its Page is checked when Meta names it.
    const refused = await record(db, t, p.id, 'error' in info ? page : (info.page ?? page), 'error' in info ? null : info.link);
    return refused ?? json({ done: true, post: p.id, url: 'error' in info ? null : info.link, kind });
  }
  if (kind === 'fb_photo') return json({ test: id, phase: 'photo' });
  if (source === 'library') return reelSend(request, db, t, tok.token);
  const upload = await openTempUpload(request, { id, mime: mime!, size: size! }, me);
  return upload ? json({ test: id, phase: 'upload', upload }) : giveUp(db, id, 'TEMP_UPLOAD_FAILED');
}

/** The silent check: schedule, read back, delete. Nothing is ever shown. */
async function silentCheck(db: SupabaseClient, t: TestInfo, token: string, page: string, when: number) {
  const p = await fbFeedPost(fetch, { token, page, message: FB_SILENT_MESSAGE, scheduledAt: when });
  if ('error' in p) return giveUp(db, t.id, p.error);
  const info = await fbPostInfo(fetch, { token, id: p.id });
  const matches = !('error' in info) && info.page === page && info.published === false;
  if (!matches) {
    // Not what was made, or not readable: it is taken away if Meta allows, and the check does not count.
    await fbDelete(fetch, { token, id: p.id });
    return giveUp(db, t.id, 'error' in info ? info.error : 'SILENT_MISMATCH');
  }
  const refused = await record(db, t, p.id, info.page, info.link);
  if (refused) return refused;
  const del = await fbDelete(fetch, { token, id: p.id });
  if ('error' in del) return json({ done: true, silent: true, deleted: false, error: 'SILENT_NOT_DELETED', post: p.id });
  const { error } = await db.rpc('platform_test_deleted', { p_key: serverKeyOrNull(), p_test: t.id });
  if (error) return refuse(dbCode(error.message));
  return json({ done: true, silent: true, deleted: true, post: p.id });
}

/** A photo, sent by the page as a form with the file and its words, passed to Meta as a file. */
export async function fbPhotoStep(request: Request, db: SupabaseClient, t: TestInfo) {
  if (!t.mine || t.state !== 'uploading' || t.kind !== 'fb_photo') return refuse('TEST_INVALID');
  if (Number(request.headers.get('content-length') ?? FB_PHOTO_BODY_MAX + 1) > FB_PHOTO_BODY_MAX) return giveUp(db, t.id, 'TEST_INVALID');
  let jpeg: Uint8Array;
  let caption = '';
  let alt = '';
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof Blob)) return giveUp(db, t.id, 'TEST_INVALID');
    jpeg = new Uint8Array(await file.arrayBuffer());
    caption = str(form.get('caption'), FB_MESSAGE_MAX);
    alt = str(form.get('alt'), 1000);
  } catch {
    return giveUp(db, t.id, 'TEST_INVALID');
  }
  // Exactly the file the test was started with, and a JPEG by its own bytes.
  if (jpeg.byteLength !== t.size || sniffImage(jpeg) !== 'image/jpeg') return giveUp(db, t.id, 'TEST_INVALID');
  const tok = await pageToken(db, t, false);
  if ('error' in tok) return giveUp(db, t.id, tok.error);
  const page = t.external_id ?? '';
  const p = await fbPhoto(fetch, { token: tok.token, page, jpeg, caption, alt });
  if ('error' in p) return giveUp(db, t.id, p.error);
  const info = await fbPostInfo(fetch, { token: tok.token, id: p.post });
  const refused = await record(db, t, p.post, 'error' in info ? page : (info.page ?? page), 'error' in info ? null : info.link);
  return refused ?? json({ done: true, post: p.post, url: 'error' in info ? null : info.link, kind: t.kind });
}

/** A device Reel arrived in Drive: only the file this test's session made is accepted, then it is sent. */
export async function fbUploaded(request: Request, db: SupabaseClient, t: TestInfo, b: Record<string, unknown>, me: string) {
  if (t.kind !== 'fb_reel') return refuse('TEST_INVALID');
  const got = await acceptTemp(db, t, b, me);
  if (got instanceof Response) return got;
  const tok = await pageToken(db, t, false);
  if ('error' in tok) return stop(db, { ...t, temp_ref: got.ref }, tok.error);
  return reelSend(request, db, { ...t, temp_ref: got.ref }, tok.token);
}

/** A Reel: started at Meta, then fetched by Meta from the temporary address. */
async function reelSend(request: Request, db: SupabaseClient, t: TestInfo, token: string) {
  const page = t.external_id ?? '';
  const start = await fbReelStart(fetch, { token, page });
  if ('error' in start) return stop(db, t, start.error);
  const { error: kept } = await db.rpc('platform_test_container', { p_key: serverKeyOrNull(), p_test: t.id, p_container: start.video });
  if (kept) return stop(db, t, 'PLATFORM_ERROR');
  const link = await setLink(request, db, t);
  if (link instanceof Response) return link;
  const up = await fbReelUpload(fetch, { token, upload: start.upload, fileUrl: link.url });
  if ('error' in up) return stop(db, t, up.error);
  return json({ test: t.id, phase: 'wait' });
}

/** Each time the page asks: Meta still fetching, then the Reel finished with its words, then published. */
export async function fbAdvance(db: SupabaseClient, t: TestInfo, b: Record<string, unknown>) {
  if (!t.mine || t.state !== 'uploading' || t.kind !== 'fb_reel' || !t.container) return refuse('TEST_INVALID');
  const tok = await pageToken(db, t, false);
  if ('error' in tok) return tok.error === 'UNREACHABLE' ? refuse(tok.error, true) : stop(db, t, tok.error);
  const s = await fbReelStatus(fetch, { token: tok.token, video: t.container });
  if ('error' in s) return s.error === 'UNREACHABLE' || s.error === 'PLATFORM_DOWN' || s.error === 'RATE_LIMIT' ? refuse(s.error, true) : stop(db, t, s.error);
  if (s.state === 'uploading' || s.state === 'publishing') return json({ phase: 'wait' });
  if (s.state === 'uploaded') {
    // Meta has the file: the address ends, and the Reel is published with its words.
    await endLink(db, t);
    const fin = await fbReelFinish(fetch, { token: tok.token, page: t.external_id ?? '', video: t.container, description: str(b.message, FB_MESSAGE_MAX) });
    return 'error' in fin ? stop(db, t, fin.error) : json({ phase: 'wait' });
  }
  const info = await fbVideoInfo(fetch, { token: tok.token, video: t.container });
  const page = t.external_id ?? '';
  const refused = await record(db, t, t.container, 'error' in info ? page : (info.page ?? page), 'error' in info ? null : info.link);
  await trashTemp(t);
  return refused ?? json({ done: true, post: t.container, url: 'error' in info ? null : info.link, kind: t.kind });
}

/** DELETE: a waiting test is cancelled by whoever started it; a published one (a silent check left scheduled too) is deleted on the Page. */
export async function fbRemove(db: SupabaseClient, t: TestInfo) {
  if (t.state === 'uploading') {
    if (!t.mine) return refuse('FORBIDDEN');
    await trashTemp(t);
    const { error } = await db.rpc('platform_test_failed', { p_key: serverKeyOrNull(), p_test: t.id, p_error: 'CANCELLED' });
    return error ? refuse(dbCode(error.message)) : json({ cancelled: true });
  }
  if (t.state !== 'published' || !t.video) return refuse('TEST_INVALID');
  const tok = await pageToken(db, t, true, 'حذف منشور تجربة من فيسبوك');
  if ('error' in tok) return refuse(tok.error);
  const r = await fbDelete(fetch, { token: tok.token, id: t.video });
  if ('error' in r) return refuse(r.error);
  const { error } = await db.rpc('platform_test_deleted', { p_key: serverKeyOrNull(), p_test: t.id });
  if (error) return refuse(dbCode(error.message));
  return json({ deleted: true, gone: r.gone });
}

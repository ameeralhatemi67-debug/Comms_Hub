// The server half of «تجربة النشر» and «نشر مباشر» on a TikTok account (MVP_draft.md section 79), which the routes in
// src/app/api/platforms/test/ call. Server only: it reads the account's tokens from the vault for one request, never returns
// them, and never logs a response body. The person's session decides who may (the platform_test_* functions); the server key
// proves each step comes from this site. What it shares with Instagram and Facebook (the temporary Drive copy and the temporary
// address the platform fetches from) is in ./test-instagram.ts.
//
// The kinds:
//   tt_draft  the video goes to the account's TikTok inbox; nothing shows until its owner posts it from the TikTok app.
//   tt_post   the video is posted with the privacy the person chose from those TikTok offered, read again before sending.
// TikTok fetches the file from the temporary address (PULL_FROM_URL), and the open page asks how it is getting on (`advance`).
// TikTok's API cannot delete a post: a test or direct post is removed in the TikTok app, and the page says so.
import type { SupabaseClient } from '@supabase/supabase-js';
import { json } from './route.ts';
import { serverKeyOrNull } from '../integrations/vault.ts';
import { loadApp, loadSecret } from './connect.ts';
import { packTikTok, tiktokRefresh, tiktokUserInfo, unpackTikTok, type Fetch } from './oauth.ts';
import { ttCreator, ttDraft, ttPost, ttStatus, type TtPostOptions } from './tiktok.ts';
import { TT_CAPTION_MAX, isTtKind, ttProblem, ttTitle, type TestKind, type TtPrivacy } from './test-rules.ts';
import { dbCode, giveUp, refuse, testInfo, type TestInfo } from './test-server.ts';
import { acceptTemp, endLink, openTempUpload, setLink, stop, str, trashTemp } from './test-instagram.ts';
import { storageConfigured } from '../storage/index.ts';

const PURPOSE = 'تجربة نشر على TikTok';
const DIRECT = 'نشر مباشر على TikTok';
const quiet = <T>(p: PromiseLike<T>) => Promise.resolve(p).then(() => undefined, () => undefined);
const bad = (error: string, status = 400) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
const PRIVACY: readonly TtPrivacy[] = ['public', 'friends', 'followers', 'private'];

type Who = { account: string; integration: string | null; external_id: string | null };

/**
 * A working access token of the account. A renewed pair is kept, and a refused one recorded, as a check records them. With
 * `check`, TikTok is first asked who the token belongs to, and it must be this account.
 */
export async function tiktokToken(db: SupabaseClient, f: Fetch, t: Who, purpose: string, check: boolean): Promise<{ token: string } | { error: string }> {
  const key = serverKeyOrNull();
  if (!key) return { error: 'APP_NOT_CONFIGURED' };
  const record = (ok: boolean, error: string | null, expires: string | null, newSecret: string | null) =>
    quiet(db.rpc('platform_conn_health', { p_key: key, p_account: t.account, p_ok: ok, p_error: error, p_expires: expires, p_new_secret: newSecret }));
  const app = await loadApp(db, 'tiktok', purpose);
  if (!app) return { error: 'APP_NOT_CONFIGURED' };
  const secret = t.integration ? await loadSecret(db, t.integration, purpose) : null;
  const pair = secret ? unpackTikTok(secret) : null;
  if (!pair) return { error: 'NOT_CONNECTED' };
  try {
    let access = pair.access;
    let expires = pair.refreshExpiresAt || null;
    let renewed: string | null = null;
    if (!pair.accessExpiresAt || Date.parse(pair.accessExpiresAt) - 60_000 <= Date.now()) {
      const r = await tiktokRefresh(f, { clientKey: app.appId, secret: app.secret, refresh: pair.refresh });
      if ('error' in r) {
        const error = r.error === 'TOKEN_REFUSED' ? 'TOKEN_EXPIRED' : r.error;
        if (error === 'TOKEN_EXPIRED') await record(false, error, null, null);
        return { error };
      }
      access = r.access;
      expires = r.refreshExpiresAt || expires;
      renewed = packTikTok({ ...r, openId: pair.openId || r.openId });
    }
    if (check) {
      const me = await tiktokUserInfo(f, access);
      const error = 'error' in me ? me.error : me.openId === t.external_id ? null : 'PERMISSION_REVOKED';
      if (error) {
        if (error !== 'PLATFORM_DOWN' && error !== 'PLATFORM_ERROR') await record(false, error, null, null);
        return { error };
      }
      await record(true, null, expires, renewed);
    } else if (renewed) await record(true, null, expires, renewed);
    return { token: access };
  } catch {
    return { error: 'UNREACHABLE' };
  }
}

/** The creator's settings, for the form: who may test the account is the database's answer. */
export async function ttCreatorFor(db: SupabaseClient, account: string, direct: boolean) {
  const { data: may } = await db.rpc('platform_test_may', { p_account: account });
  if (may !== true) return refuse('FORBIDDEN');
  const { data: a } = await db.from('platform_accounts').select('platform, integration_id, external_id, conn_state, active').eq('id', account).maybeSingle();
  if (!a || a.platform !== 'tiktok') return refuse('TEST_INVALID');
  if (!a.active) return refuse('ACCOUNT_OFF');
  if (a.conn_state !== 'connected') return refuse('NOT_CONNECTED');
  const tok = await tiktokToken(db, fetch, { account, integration: a.integration_id, external_id: a.external_id }, direct ? DIRECT : PURPOSE, true);
  if ('error' in tok) return refuse(tok.error);
  const c = await ttCreator(fetch, { token: tok.token });
  if ('error' in c) return refuse(c.error, c.error === 'RATE_LIMIT' || c.error === 'PLATFORM_DOWN' || c.error === 'UNREACHABLE', c.detail);
  return json({ creator: c });
}

/** A post's choices, as the page sent them, checked: the privacy is the one the test was started with. */
function postOptions(b: Record<string, unknown>, privacy: TtPrivacy): TtPostOptions {
  return {
    title: str(b.caption, TT_CAPTION_MAX),
    privacy,
    comments: b.comments === true,
    duet: b.duet === true,
    stitch: b.stitch === true,
    ownBrand: b.commercial === true && b.own_brand === true,
    branded: b.commercial === true && b.branded === true,
  };
}

/** Step 1. `b`: account, kind, caption, privacy and the post's switches, source, asset (a library video), size, mime, purpose. */
export async function ttStart(request: Request, db: SupabaseClient, b: Record<string, unknown>, me: string) {
  const kind = b.kind as TestKind;
  if (typeof kind !== 'string' || !isTtKind(kind)) return refuse('TEST_INVALID');
  if (b.source !== 'device' && b.source !== 'library') return refuse('TEST_INVALID');
  if (b.purpose != null && b.purpose !== 'test' && b.purpose !== 'direct') return refuse('TEST_INVALID');
  const direct = b.purpose === 'direct';
  const privacy = kind === 'tt_post' ? (PRIVACY.find((p) => p === b.privacy) ?? null) : null;
  const caption = str(b.caption, TT_CAPTION_MAX + 200);
  let size: number;
  let mime: string;
  let asset: string | null = null;
  let version: number | null = null;
  if (b.source === 'library') {
    if (typeof b.asset !== 'string') return refuse('TEST_INVALID');
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
  const options = privacy ? postOptions(b, privacy) : null;
  const problem = ttProblem({ kind, size, mime, caption, privacy, commercial: b.commercial === true, ownBrand: options?.ownBrand, branded: options?.branded });
  if (problem) return bad(problem);
  if (b.source === 'device' && !(await storageConfigured('library'))) return refuse('DRIVE_NOT_CONNECTED');

  const { data: id, error } = await db.rpc('platform_test_start', {
    p_account: b.account,
    p: { kind, privacy, title: ttTitle(kind, caption), source: b.source, asset, version, size, mime, ...(direct ? { purpose: 'direct' } : {}) },
  });
  if (error || typeof id !== 'string') {
    const code = dbCode(error?.message);
    return refuse(direct && code === 'TEST_LIMIT' ? 'DIRECT_LIMIT' : code);
  }
  const t = await testInfo(db, id);
  if (!t) return giveUp(db, id, 'FORBIDDEN');
  const tok = await tiktokToken(db, fetch, t, direct ? DIRECT : PURPOSE, true);
  if ('error' in tok) return giveUp(db, id, tok.error);
  // A post's privacy is checked against the creator's settings as they are now; TikTok refuses any other.
  if (options) {
    const c = await ttCreator(fetch, { token: tok.token });
    if ('error' in c) return giveUp(db, id, c.error, c.detail);
    if (!c.privacy.includes(options.privacy)) return giveUp(db, id, 'TT_PRIVACY_MISMATCH');
  }
  if (b.source === 'library') return send(request, db, t, tok.token, options);
  const upload = await openTempUpload(request, { id, mime, size }, me);
  return 'url' in upload ? json({ test: id, phase: 'upload', upload: upload.url }) : giveUp(db, id, 'TEMP_UPLOAD_FAILED', upload.error);
}

/** A device file arrived in Drive: only the file this test's session made is accepted, then it is sent. */
export async function ttUploaded(request: Request, db: SupabaseClient, t: TestInfo, b: Record<string, unknown>, me: string) {
  if (!isTtKind(t.kind)) return refuse('TEST_INVALID');
  const got = await acceptTemp(db, t, b, me);
  if (got instanceof Response) return got;
  const held = { ...t, temp_ref: got.ref };
  const tok = await tiktokToken(db, fetch, t, t.purpose === 'direct' ? DIRECT : PURPOSE, false);
  if ('error' in tok) return stop(db, held, tok.error);
  const privacy = PRIVACY.find((p) => p === t.privacy) ?? null;
  if (t.kind === 'tt_post' && !privacy) return stop(db, held, 'TEST_INVALID');
  return send(request, db, held, tok.token, privacy ? postOptions(b, privacy) : null);
}

/** Gives TikTok the temporary address and keeps its name for the upload. */
async function send(request: Request, db: SupabaseClient, t: TestInfo, token: string, options: TtPostOptions | null) {
  const link = await setLink(request, db, t);
  if (link instanceof Response) return link;
  const r = options ? await ttPost(fetch, { token, videoUrl: link.url, options }) : await ttDraft(fetch, { token, videoUrl: link.url });
  if ('error' in r) return stop(db, t, r.error, r.detail);
  const { error } = await db.rpc('platform_test_container', { p_key: serverKeyOrNull(), p_test: t.id, p_container: r.publish });
  if (error) return stop(db, t, 'PLATFORM_ERROR');
  return json({ test: t.id, phase: 'wait' });
}

/** Records the arrival: a draft in the inbox, or a post, with its id when TikTok gave one. */
async function record(db: SupabaseClient, t: TestInfo, post: string | null): Promise<Response | null> {
  const { data: state, error } = await db.rpc('platform_test_done', { p_key: serverKeyOrNull(), p_test: t.id, p_video: post, p_channel: t.external_id, p_privacy: null, p_url: null });
  if (error) return refuse(dbCode(error.message));
  return state === 'published' ? null : refuse('CHANNEL_MISMATCH');
}

/** Each time the page asks: TikTok still fetching, then the draft in the inbox or the post made. */
export async function ttAdvance(db: SupabaseClient, t: TestInfo) {
  if (!t.mine || t.state !== 'uploading' || !isTtKind(t.kind) || !t.container) return refuse('TEST_INVALID');
  const tok = await tiktokToken(db, fetch, t, t.purpose === 'direct' ? DIRECT : PURPOSE, false);
  if ('error' in tok) return tok.error === 'UNREACHABLE' ? refuse(tok.error, true) : stop(db, t, tok.error);
  const s = await ttStatus(fetch, { token: tok.token, publish: t.container });
  if ('error' in s) return s.error === 'UNREACHABLE' || s.error === 'PLATFORM_DOWN' || s.error === 'RATE_LIMIT' ? refuse(s.error, true, s.detail) : stop(db, t, s.error, s.detail);
  if (s.state === 'processing') return json({ phase: 'wait' });
  if (s.state === 'failed') {
    await endLink(db, t);
    return stop(db, t, s.reason, s.detail);
  }
  // TikTok has the file: the address ends and the copy goes to Drive's trash.
  await endLink(db, t);
  const post = s.state === 'published' ? s.post : null;
  const refused = await record(db, t, post);
  await trashTemp(t);
  return refused ?? json({ done: true, inbox: s.state === 'inbox', post, kind: t.kind });
}

/** DELETE: a test still waiting is cancelled by whoever started it; TikTok's API cannot delete a post that arrived. */
export async function ttRemove(db: SupabaseClient, t: TestInfo) {
  if (t.state === 'uploading') {
    if (!t.mine) return refuse('FORBIDDEN');
    await endLink(db, t);
    await trashTemp(t);
    const { error } = await db.rpc('platform_test_failed', { p_key: serverKeyOrNull(), p_test: t.id, p_error: 'CANCELLED' });
    return error ? refuse(dbCode(error.message)) : json({ cancelled: true });
  }
  return refuse('TT_NO_DELETE');
}

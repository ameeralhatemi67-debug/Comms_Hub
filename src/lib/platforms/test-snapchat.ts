// The server half of «تجربة النشر» on a Snapchat Public Profile (MVP_draft.md section 85, Snapchat_Test_Plan.md), which the routes in
// src/app/api/platforms/test/ call. Server only: it reads the account's tokens from the vault for one request, never returns them, and never
// logs a response body. The person's session decides who may (the platform_test_* functions); the server key proves each step comes from this
// site, and it also derives each test's media key (./snapchat.ts), so nothing of the key is stored or shown. What it shares with Instagram,
// Facebook and TikTok (the temporary Drive copy of a device file, the failure record) is in ./test-instagram.ts and ./test-server.ts.
//
// The kinds:
//   snap_check      no row, no file: the Public Profile, its latest Spotlights and Stories, and the profile's lifetime numbers.
//   snap_silent     one request: a Spotlight scheduled ahead, read back, deleted at once. Recorded published, then deleted. If the delete is
//                   refused it stays published and the list offers the delete. That Snap shows a scheduled Spotlight to nobody before its time
//                   is read from one line of its documentation and is not proven.
//   snap_spotlight  one request: a Spotlight now, its status read back. It can be deleted afterwards.
//   snap_story      one request: a Story now (24 hours). Snap has no delete for a Story: it ends by itself, and the page says so.
// The file (a video of at most 30 MiB) is read by the server from the library or from the device's temporary Drive copy, encrypted with a key
// derived from the server key, and sent to Snap as one part. Snap's API is allowlist only, so none of this has met a real Snap answer.
import type { SupabaseClient } from '@supabase/supabase-js';
import { json } from './route.ts';
import { serverKeyOrNull } from '../integrations/vault.ts';
import { loadApp, loadSecret } from './connect.ts';
import type { Fetch } from './oauth.ts';
import { ROLLING_DAYS, packTokens, snapchatProfile, snapchatRefresh, unpackTokens } from './oauth2.ts';
import { snProfile, snSpotlightDelete, snSpotlights, snStats, snStories } from './snapchat.ts';
import { snapSend } from './snapchat-flow.ts';
import { LIBRARY_PIECE, SN_DESCRIPTION_MAX, SN_SILENT_DAYS, SN_STATS_NOTE, isSnKind, snProblem, snTitle, type SnKind } from './test-rules.ts';
import { dbCode, giveUp, libraryPiece, refuse, testInfo, type TestInfo } from './test-server.ts';
import { acceptTemp, openTempUpload, stop, str, trashTemp } from './test-instagram.ts';
import { openStored, storageConfigured } from '../storage/index.ts';

const PURPOSE = 'تجربة نشر على Snapchat';
const quiet = <T>(p: PromiseLike<T>) => Promise.resolve(p).then(() => undefined, () => undefined);
const bad = (error: string, status = 400) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
const rolling = () => new Date(Date.now() + ROLLING_DAYS * 864e5).toISOString();
/** Snap's RFC 3339 time, to the second. */
const rfc3339 = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
/** A refusal that is worth asking again after a moment. */
const again = (code: string) => code === 'UNREACHABLE' || code === 'PLATFORM_DOWN' || code === 'RATE_LIMIT';

type Who = { account: string; integration: string | null; external_id: string | null };

/**
 * A working access token of the account (an hour's). A renewed pair is kept, and a refused one recorded, as a check records them. With `check`,
 * Snap is first asked whose Public Profile the token belongs to, and it must be this account's.
 */
export async function snapchatToken(db: SupabaseClient, f: Fetch, t: Who, purpose: string, check: boolean): Promise<{ token: string } | { error: string }> {
  const key = serverKeyOrNull();
  if (!key) return { error: 'APP_NOT_CONFIGURED' };
  const record = (ok: boolean, error: string | null, expires: string | null, newSecret: string | null) =>
    quiet(db.rpc('platform_conn_health', { p_key: key, p_account: t.account, p_ok: ok, p_error: error, p_expires: expires, p_new_secret: newSecret }));
  const app = await loadApp(db, 'snapchat', purpose);
  if (!app) return { error: 'APP_NOT_CONFIGURED' };
  const secret = t.integration ? await loadSecret(db, t.integration, purpose) : null;
  const pair = secret ? unpackTokens(secret) : null;
  if (!pair || !pair.refresh) return { error: 'NOT_CONNECTED' };
  try {
    let access = pair.access;
    let renewed: string | null = null;
    if (!pair.accessExpiresAt || Date.parse(pair.accessExpiresAt) - 60_000 <= Date.now()) {
      const r = await snapchatRefresh(f, { clientId: app.appId, secret: app.secret, refresh: pair.refresh });
      if ('error' in r) {
        const error = r.error === 'TOKEN_REFUSED' ? 'TOKEN_EXPIRED' : r.error;
        if (error === 'TOKEN_EXPIRED') await record(false, error, null, null);
        return { error };
      }
      access = r.access;
      renewed = packTokens({ ...pair, access: r.access, refresh: r.refresh || pair.refresh, accessExpiresAt: r.accessExpiresAt, refreshExpiresAt: rolling() });
    }
    if (check) {
      const me = await snapchatProfile(f, access);
      const error = 'error' in me ? me.error : me.id === t.external_id ? null : 'PERMISSION_REVOKED';
      if (error) {
        if (!again(error) && error !== 'PLATFORM_ERROR') await record(false, error, null, null);
        return { error };
      }
      await record(true, null, rolling(), renewed);
    } else if (renewed) await record(true, null, rolling(), renewed);
    return { token: access };
  } catch {
    return { error: 'UNREACHABLE' };
  }
}

/** The read-only check: no row, no file. Who may test the account is the database's answer. */
async function snCheck(db: SupabaseClient, b: Record<string, unknown>) {
  const account = typeof b.account === 'string' ? b.account : '';
  const { data: may } = await db.rpc('platform_test_may', { p_account: account });
  if (may !== true) return refuse('FORBIDDEN');
  const { data: a } = await db.from('platform_accounts').select('platform, integration_id, external_id, conn_state, active').eq('id', account).maybeSingle();
  if (!a || a.platform !== 'snapchat') return refuse('TEST_INVALID');
  if (!a.active) return refuse('ACCOUNT_OFF');
  if (a.conn_state !== 'connected' || !a.external_id) return refuse('NOT_CONNECTED');
  const tok = await snapchatToken(db, fetch, { account, integration: a.integration_id, external_id: a.external_id }, PURPOSE, true);
  if ('error' in tok) return refuse(tok.error, again(tok.error));
  const profile = a.external_id as string;
  const me = await snProfile(fetch, { token: tok.token });
  if ('error' in me) return refuse(me.error, again(me.error), me.detail);
  // The rest is read together; a part Snap will not give is left out, and the check still answers.
  const [sp, st, stats] = await Promise.all([
    snSpotlights(fetch, { token: tok.token, profile }),
    snStories(fetch, { token: tok.token, profile }),
    snStats(fetch, { token: tok.token, profile }),
  ]);
  const count = (s: string) => (Array.isArray(sp) ? sp.filter((x) => x.status === s).length : 0);
  return json({
    check: {
      profile: { name: me.name, username: me.username, subscribers: me.subscribers },
      spotlights: Array.isArray(sp) ? { count: sp.length, live: count('LIVE'), submitted: count('SUBMITTED'), rejected: count('REJECTED') } : null,
      stories: 'count' in st ? { count: st.count } : null,
      stats: 'error' in stats ? null : stats,
      note: SN_STATS_NOTE,
    },
  });
}

/**
 * Step 1. `b`: account, kind, source, asset (a library video), size and mime (a device file), description (a Spotlight's). A library file is
 * sent in this request; a device file gets a Drive upload address and is sent in step 2.
 */
export async function snStart(request: Request, db: SupabaseClient, b: Record<string, unknown>, me: string) {
  if (b.kind === 'snap_check') return snCheck(db, b);
  const kind = b.kind;
  if (typeof kind !== 'string' || !isSnKind(kind)) return refuse('TEST_INVALID');
  if (b.source !== 'device' && b.source !== 'library') return refuse('TEST_INVALID');
  if (b.purpose != null && b.purpose !== 'test') return refuse('TEST_INVALID');
  const description = kind === 'snap_spotlight' ? str(b.description, SN_DESCRIPTION_MAX + 200) : '';
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
  const problem = snProblem({ kind, size, mime, description });
  if (problem) return bad(problem);
  if (b.source === 'device' && !(await storageConfigured('library'))) return refuse('DRIVE_NOT_CONNECTED');

  // The silent check's date: ahead by the agreed days, to the minute.
  const when = kind === 'snap_silent' ? Math.floor((Date.now() + SN_SILENT_DAYS * 864e5) / 60_000) * 60_000 : null;
  const { data: id, error } = await db.rpc('platform_test_start', {
    p_account: b.account,
    p: { kind, title: snTitle(kind, description), source: b.source, asset, version, size, mime, ...(when ? { scheduled_for: new Date(when).toISOString() } : {}) },
  });
  if (error || typeof id !== 'string') return refuse(dbCode(error?.message));
  const t = await testInfo(db, id);
  if (!t) return giveUp(db, id, 'FORBIDDEN');
  const tok = await snapchatToken(db, fetch, t, PURPOSE, true);
  if ('error' in tok) return giveUp(db, id, tok.error);
  if (b.source === 'library') return send(db, t, tok.token);
  const upload = await openTempUpload(request, { id, mime, size }, me);
  return 'url' in upload ? json({ test: id, phase: 'upload', upload: upload.url }) : giveUp(db, id, 'TEMP_UPLOAD_FAILED', upload.error);
}

/** A device file arrived in Drive: only the file this test's session made is accepted, then it is sent. */
export async function snUploaded(db: SupabaseClient, t: TestInfo, b: Record<string, unknown>, me: string) {
  if (!isSnKind(t.kind)) return refuse('TEST_INVALID');
  const got = await acceptTemp(db, t, b, me);
  if (got instanceof Response) return got;
  const held = { ...t, temp_ref: got.ref };
  const tok = await snapchatToken(db, fetch, t, PURPOSE, false);
  if ('error' in tok) return stop(db, held, tok.error);
  return send(db, held, tok.token);
}

/** The test's whole file, from the library at the version it started with or from the device's temporary Drive copy; null when it cannot be read whole. */
async function readWhole(db: SupabaseClient, t: TestInfo): Promise<Uint8Array | null> {
  if (!t.size || t.size < 1) return null;
  if (t.source === 'library') {
    const out = new Uint8Array(t.size);
    for (let from = 0; from < t.size; from += LIBRARY_PIECE) {
      const len = Math.min(LIBRARY_PIECE, t.size - from);
      const piece = await libraryPiece(db, t, from, len);
      if (!piece) return null;
      out.set(piece, from);
    }
    return out;
  }
  if (!t.temp_ref) return null;
  try {
    const res = await openStored('library', t.temp_ref, `bytes=0-${t.size - 1}`);
    if (res.status !== 206 && !(res.status === 200 && t.size > 0)) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.byteLength === t.size ? buf : null;
  } catch {
    return null;
  }
}

/** The file, encrypted and sent to Snap as one part, then the post of the test's kind: the flow is ./snapchat-flow.ts, which this wires to the real parts. */
async function send(db: SupabaseClient, t: TestInfo, token: string): Promise<Response> {
  const key = serverKeyOrNull();
  if (!key) return stop(db, t, 'APP_NOT_CONFIGURED');
  const r = await snapSend(
    { f: fetch, key, token, read: () => readWhole(db, t), rpc: (name, args) => db.rpc(name, args) },
    { id: t.id, kind: t.kind as SnKind, profile: t.external_id ?? '', title: t.title ?? '', scheduledFor: t.scheduled_for ?? null },
  );
  if ('fail' in r) return stop(db, t, r.fail, r.detail);
  await trashTemp(t);
  return 'refuse' in r ? refuse(r.refuse) : json(r);
}

/** `step: 'stats'`: the numbers Snap has for a Spotlight this test posted. They arrive about a day late, so a fresh post may have none. */
export async function snStatsStep(db: SupabaseClient, t: TestInfo) {
  if (!isSnKind(t.kind) || t.kind === 'snap_story' || t.state !== 'published' || !t.video) return refuse('TEST_INVALID');
  const tok = await snapchatToken(db, fetch, t, PURPOSE, false);
  if ('error' in tok) return refuse(tok.error, again(tok.error));
  const s = await snStats(fetch, { token: tok.token, profile: t.external_id ?? '', spotlight: t.video });
  if ('error' in s) return refuse(s.error, again(s.error), s.detail);
  return json({ stats: { views: s.views, viewers: s.viewers, shares: s.shares, screenshots: s.screenshots, at: new Date().toISOString(), late: true } });
}

/**
 * DELETE: a test still uploading is cancelled by whoever started it; a published Spotlight (a silent check left scheduled too) is deleted at
 * Snap, by anyone who may test the account; a Story cannot be deleted by any app.
 */
export async function snRemove(db: SupabaseClient, t: TestInfo) {
  if (t.state === 'uploading') {
    if (!t.mine) return refuse('FORBIDDEN');
    await trashTemp(t);
    const { error } = await db.rpc('platform_test_failed', { p_key: serverKeyOrNull(), p_test: t.id, p_error: 'CANCELLED' });
    return error ? refuse(dbCode(error.message)) : json({ cancelled: true });
  }
  if (t.kind === 'snap_story') return refuse('SN_NO_DELETE');
  if (t.state !== 'published' || !t.video || !isSnKind(t.kind)) return refuse('TEST_INVALID');
  const tok = await snapchatToken(db, fetch, t, 'حذف منشور تجربة من Snapchat', true);
  if ('error' in tok) return refuse(tok.error, again(tok.error));
  const r = await snSpotlightDelete(fetch, { token: tok.token, profile: t.external_id ?? '', id: t.video });
  if ('error' in r) return refuse(r.error, false, r.detail);
  const { error } = await db.rpc('platform_test_deleted', { p_key: serverKeyOrNull(), p_test: t.id });
  if (error) return refuse(dbCode(error.message));
  return json({ deleted: true, gone: r.gone });
}

// The server half of «تجربة النشر» that its routes share (MVP_draft.md section 71). Server only: it reads the account's
// token from the vault for one request and the upload's address from the database, never returns either, and never
// logs a response body. The person's session decides who may (row level security and the platform_test_* functions);
// the server key proves each step comes from this site.
import type { SupabaseClient } from '@supabase/supabase-js';
import { connErrorAr } from './info.ts';
import { serverKeyOrNull } from '../integrations/vault.ts';
import { loadApp, loadSecret } from './connect.ts';
import { googleAccess, googleChannels, googleRolling } from './oauth2.ts';
import type { Fetch } from './oauth.ts';
import { TEST_ERROR_AR } from './test-rules.ts';
import { openStored } from '../storage/index.ts';

export type TestInfo = {
  id: string;
  account: string;
  /** The account's platform: 'youtube' or 'instagram'. */
  platform: string;
  integration: string | null;
  external_id: string | null;
  state: 'uploading' | 'published' | 'failed' | 'deleted';
  mine: boolean;
  kind: string;
  size: number;
  mime: string;
  source: 'device' | 'library';
  asset: string | null;
  version: number | null;
  /** The post's id on the platform: a YouTube video or an Instagram media. */
  video: string | null;
  /** YouTube's upload address, for its starter only. */
  url: string | null;
  /** Instagram: Meta's container, the reel's feed choice, and the device file's temporary copy. */
  container: string | null;
  share_to_feed: boolean | null;
  temp_ref: string | null;
};

/** The short code a database refusal carries («FORBIDDEN», «TEST_LIMIT», ...). */
export const dbCode = (message: string | null | undefined) => /\b([A-Z][A-Z_]{3,39})\b/.exec(message ?? '')?.[1] ?? 'PLATFORM_ERROR';

const STATUS: Record<string, number> = { FORBIDDEN: 403, TEST_INVALID: 400, TEST_LIMIT: 429, UPLOAD_LIMIT: 429, NOT_CONNECTED: 409, ACCOUNT_OFF: 409, UPLOAD_EXPIRED: 410, SCOPE_MISSING: 403 };
/** A refusal as the page reads it: the words, and the code for what the page offers next. */
export const refuse = (code: string, retry = false) =>
  Response.json({ error: TEST_ERROR_AR[code] ?? connErrorAr(code), code, ...(retry ? { retry: true } : {}) }, { status: STATUS[code] ?? 502, headers: { 'Cache-Control': 'no-store' } });

/** Closes an upload that cannot go on, then refuses. */
export async function giveUp(db: SupabaseClient, id: string, code: string) {
  await db.rpc('platform_test_failed', { p_key: serverKeyOrNull(), p_test: id, p_error: code }).then(
    () => undefined,
    () => undefined,
  );
  return refuse(code);
}

export async function testInfo(db: SupabaseClient, id: string): Promise<TestInfo | null> {
  const key = serverKeyOrNull();
  if (!key) return null;
  const { data, error } = await db.rpc('platform_test_get', { p_key: key, p_test: id });
  return error || !data ? null : (data as TestInfo);
}

const RECONNECT = ['TOKEN_REFUSED', 'TOKEN_EXPIRED', 'PERMISSION_REVOKED', 'NOT_CONNECTED'];

/**
 * A working token of the test's account. A renewed token is kept, and a refused one recorded, as a check records them.
 * With `check`, YouTube is first asked that the token still owns the account's channel.
 */
export async function youtubeToken(db: SupabaseClient, f: Fetch, t: Pick<TestInfo, 'account' | 'integration' | 'external_id'>, purpose: string, check: boolean): Promise<{ access: string } | { error: string }> {
  const key = serverKeyOrNull();
  const record = (ok: boolean, error: string | null, newSecret: string | null) =>
    db
      .rpc('platform_conn_health', { p_key: key, p_account: t.account, p_ok: ok, p_error: error, p_expires: ok ? googleRolling() : null, p_new_secret: newSecret })
      .then(
        () => undefined,
        () => undefined,
      );
  if (!key) return { error: 'APP_NOT_CONFIGURED' };
  const app = await loadApp(db, 'google', purpose);
  if (!app) return { error: 'APP_NOT_CONFIGURED' };
  const secret = t.integration ? await loadSecret(db, t.integration, purpose) : null;
  if (!secret) return { error: 'NOT_CONNECTED' };
  try {
    const got = await googleAccess(f, { clientId: app.appId, secret: app.secret, packed: secret });
    if ('error' in got) {
      if (RECONNECT.includes(got.error)) await record(false, got.error, null);
      return got;
    }
    if (check) {
      const ch = await googleChannels(f, got.access);
      const error = 'error' in ch ? ch.error : ch.some((c) => c.id === t.external_id) ? null : 'PERMISSION_REVOKED';
      if (error) {
        await record(false, error, null);
        return { error };
      }
      await record(true, null, got.newSecret);
    } else if (got.newSecret) await record(true, null, got.newSecret);
    return { access: got.access };
  } catch {
    return { error: 'UNREACHABLE' };
  }
}

/**
 * One piece of a library file, read from wherever it is kept, at the version the test started with. The person's own
 * row level security decides again that they may read it. Null when it cannot be read whole.
 */
export async function libraryPiece(db: SupabaseClient, t: TestInfo, from: number, len: number): Promise<Uint8Array | null> {
  if (!t.asset || !t.version) return null;
  const { data: f } = await db.from('media_files').select('drive_file_id, current_version').eq('id', t.asset).maybeSingle();
  if (!f) return null;
  let ref: string | null = f.current_version === t.version ? (f.drive_file_id as string) : null;
  if (!ref) {
    const { data: v } = await db.from('media_versions').select('drive_file_id').eq('asset_id', t.asset).eq('version', t.version).maybeSingle();
    ref = (v?.drive_file_id as string | undefined) ?? null;
  }
  if (!ref) return null;
  try {
    const res = await openStored('library', ref, `bytes=${from}-${from + len - 1}`);
    if (res.status !== 206 && !(res.status === 200 && from === 0 && len === t.size)) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.byteLength === len ? buf : null;
  } catch {
    return null;
  }
}

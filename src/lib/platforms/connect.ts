// What the platform routes share (Readiness audit step 6): the app credentials and account tokens
// come out of the vault for one request, a check is made, the answer is recorded. Server only.
// The signed-in person's session decides who may (the database functions), the server key proves
// the call comes from this site, and no value is ever returned, logged or put in an error.
import type { SupabaseClient } from '@supabase/supabase-js';
import { serverKeyOrNull } from '../integrations/vault.ts';
import {
  APP_TYPE,
  metaAccountHealth,
  tiktokAccountHealth,
  type Fetch,
  type Health,
  type Provider,
} from './oauth.ts';

export type AppCreds = { id: string; appId: string; secret: string; scopes: string[] | null };

/** The registered app of a provider, with its secret, for one purpose. Null when none is entered. */
export async function loadApp(db: SupabaseClient, provider: Provider, purpose: string): Promise<AppCreds | null> {
  const key = serverKeyOrNull();
  if (!key) return null;
  const { data, error } = await db.rpc('platform_conn_app_get', { p_key: key, p_type: APP_TYPE[provider], p_purpose: purpose });
  if (error || !data) return null;
  const d = data as { id: string; config: Record<string, unknown>; secret: string };
  const appId = typeof d.config?.app_id === 'string' ? d.config.app_id : '';
  if (!appId || typeof d.secret !== 'string') return null;
  const scopes = Array.isArray(d.config?.scopes) ? (d.config.scopes as unknown[]).filter((x): x is string => typeof x === 'string') : null;
  return { id: d.id, appId, secret: d.secret, scopes };
}

/** The stored token of one platform integration (a user offer or an account). */
export async function loadSecret(db: SupabaseClient, integration: string, purpose: string): Promise<string | null> {
  const key = serverKeyOrNull();
  if (!key) return null;
  const { data, error } = await db.rpc('platform_conn_secret', { p_key: key, p_id: integration, p_purpose: purpose });
  return error || typeof data !== 'string' || !data ? null : data;
}

export type DueAccount = { id: string; platform: string; type: string; integration: string; external_id: string | null };
export type CheckResult = { id: string; state: string | null; error: string | null };

/** One account's check, made and recorded. Never throws: a failure to check is an `error` state. */
export async function checkAccount(db: SupabaseClient, f: Fetch, apps: Partial<Record<Provider, AppCreds | null>>, a: DueAccount): Promise<CheckResult> {
  const key = serverKeyOrNull();
  const provider: Provider = a.type === 'tiktok_user' ? 'tiktok' : 'meta';
  const app = apps[provider];
  const record = async (h: Health) => {
    const { data, error } = await db.rpc('platform_conn_health', {
      p_key: key,
      p_account: a.id,
      p_ok: h.ok,
      p_error: h.error,
      p_expires: h.expiresAt,
      p_new_secret: h.newSecret,
    });
    return { id: a.id, state: error ? null : (data as string | null), error: h.error };
  };
  if (!key) return { id: a.id, state: null, error: 'APP_NOT_CONFIGURED' };
  if (!app) return record({ ok: false, error: 'APP_NOT_CONFIGURED', expiresAt: null, scopes: [], newSecret: null });
  const secret = await loadSecret(db, a.integration, 'فحص اتصال حساب');
  if (!secret) return record({ ok: false, error: 'NOT_CONNECTED', expiresAt: null, scopes: [], newSecret: null });
  try {
    const h =
      provider === 'tiktok'
        ? await tiktokAccountHealth(f, { clientKey: app.appId, secret: app.secret, packed: secret })
        : await metaAccountHealth(f, { appId: app.appId, secret: app.secret, objectId: a.external_id ?? '', token: secret, instagram: a.type === 'meta_instagram' });
    return record(h);
  } catch {
    return record({ ok: false, error: 'UNREACHABLE', expiresAt: null, scopes: [], newSecret: null });
  }
}

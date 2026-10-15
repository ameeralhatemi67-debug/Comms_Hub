import { fail } from '@/lib/drive/guard';
import { capGuard } from '@/lib/integrations/guard';
import { moveError } from '@/lib/integrations/rules';
import { recordHealthById, storeChecked, vaultReachable, vaultSecretById } from '@/lib/integrations/vault';
import { forgetProvider, providerFor } from '@/lib/storage';
import { onedriveProbe } from '@/lib/storage/onedrive';
import { joinCredentials, parseCredentials, s3ConfigFrom, s3Probe } from '@/lib/storage/s3';

// An S3-compatible provider (Settings_Integrations_Plan.md 6.1): its settings, its key pair,
// its connection check and its removal. The key pair is write-only: it is checked against the
// store first (a write, a read-back and a delete of a small probe object), stored in the vault
// only if that works, and never returned. The database decides who may do each part
// (storage.manage for the settings, integrations.secrets for the key pair) and what an address
// may look like.
type Body = {
  action?: unknown;
  id?: unknown;
  label?: unknown;
  config?: Record<string, unknown>;
  accessKeyId?: unknown;
  secretAccessKey?: unknown;
};

const noStore = { 'Cache-Control': 'no-store' };
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export async function POST(request: Request) {
  const g = await capGuard(request, 'storage.manage', true);
  if (!g.ok) return g.response;
  if (!vaultReachable()) return fail(503, 'خزنة الأسرار غير متاحة: مفتاح الخادم غير مضبوط.');

  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || typeof body.action !== 'string') return fail(400, 'طلب غير صالح.');

  /** The saved, non-secret settings of one provider, from the database. */
  const settingsOf = async (id: string) => {
    const { data } = await g.db.rpc('storage_overview');
    const row = ((data as { providers?: { id: string; type: string; config: Record<string, unknown> }[] } | null)?.providers ?? []).find(
      (p) => p.id === id && p.type === 's3_compatible',
    );
    return row ? s3ConfigFrom(row.config) : null;
  };

  if (body.action === 'save') {
    const cfg = body.config ?? {};
    const { data, error } = await g.db.rpc('storage_provider_save', {
      p_id: isUuid(body.id) ? body.id : null,
      p_label: text(body.label, 60),
      p_config: {
        endpoint: text(cfg.endpoint, 300),
        bucket: text(cfg.bucket, 80),
        region: text(cfg.region, 40),
        prefix: text(cfg.prefix, 120),
        path_style: cfg.path_style !== false,
        flavor: text(cfg.flavor, 20),
      },
    });
    if (error) return fail(error.message.includes('FORBIDDEN') ? 403 : 400, moveError(error.message));
    const id = String(data);
    forgetProvider(id);

    const key = text(body.accessKeyId, 200);
    const secret = typeof body.secretAccessKey === 'string' ? body.secretAccessKey.trim() : '';
    if (!key && !secret) return Response.json({ id, stored: false }, { headers: noStore });
    if (!/^[A-Za-z0-9_.-]{3,128}$/.test(key)) return fail(400, 'معرّف المفتاح حروف وأرقام ونقاط وشرطات، من 3 إلى 128 خانة.', );
    if (!/^[^\s]{8,200}$/.test(secret)) return fail(400, 'المفتاح السري من 8 إلى 200 خانة بلا مسافات.');

    const settings = await settingsOf(id);
    if (!settings) return fail(500, 'تعذّر قراءة إعدادات المزود.');
    const stored = await storeChecked(g.db, id, { id }, joinCredentials({ accessKeyId: key, secretAccessKey: secret }), async (value) => {
      const creds = parseCredentials(value);
      if (!creds) return { ok: false, error: 'VAULT_MISMATCH' };
      const probe = await s3Probe(settings, creds);
      return probe.ok ? { ok: true, config: { account: probe.account } } : { ok: false, error: probe.error };
    });
    forgetProvider(id);
    if (!stored.ok) {
      const forbidden = stored.error === 'FORBIDDEN';
      return Response.json(
        { id, stored: false, error: forbidden ? 'لا تملك صلاحية إدخال أسرار التكاملات.' : moveError(stored.error) },
        { status: forbidden ? 403 : 200, headers: noStore },
      );
    }
    return Response.json({ id, stored: true, tail: stored.tail }, { headers: noStore });
  }

  if (body.action === 'check') {
    if (!isUuid(body.id)) return fail(400, 'طلب غير صالح.');
    // A OneDrive account is asked who it is and how much room it has (its refresh token and the
    // Microsoft app are read from the vault by the provider).
    const overview = await g.db.rpc('storage_overview');
    const row = ((overview.data as { providers?: { id: string; type: string; config: Record<string, unknown> }[] } | null)?.providers ?? []).find((p) => p.id === body.id);
    if (row?.type === 'onedrive') {
      forgetProvider(row.id);
      const probe = await onedriveProbe(await providerFor(row));
      await recordHealthById(row.id, probe.ok, probe.ok ? null : probe.error, probe.ok && probe.account ? { account: probe.account } : undefined);
      return Response.json(probe.ok ? { ok: true } : { ok: false, error: moveError(probe.error) }, { headers: noStore });
    }
    const settings = await settingsOf(body.id);
    if (!settings) return fail(404, 'المزود غير موجود.');
    const creds = parseCredentials(await vaultSecretById(body.id, 'connection check'));
    if (!creds) {
      await recordHealthById(body.id, false, 'NO_SECRET');
      return Response.json({ ok: false, error: moveError('NO_SECRET') }, { headers: noStore });
    }
    const probe = await s3Probe(settings, creds);
    await recordHealthById(body.id, probe.ok, probe.ok ? null : probe.error, probe.ok ? { account: probe.account } : undefined);
    return Response.json(probe.ok ? { ok: true } : { ok: false, error: moveError(probe.error) }, { headers: noStore });
  }

  if (body.action === 'remove') {
    if (!isUuid(body.id)) return fail(400, 'طلب غير صالح.');
    const { error } = await g.db.rpc('storage_provider_remove', { p_id: body.id });
    if (error) return fail(error.message.includes('FORBIDDEN') ? 403 : 409, moveError(error.message));
    forgetProvider(body.id);
    return Response.json({ ok: true }, { headers: noStore });
  }

  return fail(400, 'إجراء غير معروف.');
}

import { fail } from '@/lib/drive/guard';
import { capGuard } from '@/lib/integrations/guard';
import { markVerified } from '@/lib/integrations/vault';
import { StorageError, providerFor, type CopyCheck } from '@/lib/storage';

// «تحقق من عينة» in Settings, storage tab: asks the provider about the next copies that were
// checked longest ago (or never), and records what it said. The database decides who may start
// a batch (storage.manage, through storage_verify_batch) and what a batch holds; the server
// then asks the provider and records with its key, so a signed-in person cannot mark a copy by
// hand. Nothing is moved, changed or deleted: this only reads.
const BATCH = 20;
const PARALLEL = 5;

type Row = { id: string; ref: string; type: string; size_bytes: number | null; integration_id: string; config: Record<string, unknown> };

export async function POST(request: Request) {
  const g = await capGuard(request, 'storage.manage', true);
  if (!g.ok) return g.response;

  const batch = await g.db.rpc('storage_verify_batch', { p_limit: BATCH });
  if (batch.error) return fail(403, 'لا تملك صلاحية هذا الإجراء.');
  const rows = (batch.data ?? []) as Row[];
  if (!rows.length) return Response.json({ checked: 0, ok: 0, missing: 0, failed: 0 }, { headers: { 'Cache-Control': 'no-store' } });

  const out: { id: string; state: CopyCheck['state'] }[] = [];
  try {
    for (let i = 0; i < rows.length; i += PARALLEL) {
      const part = rows.slice(i, i + PARALLEL);
      const done = await Promise.all(
        part.map(async (r) => {
          // Each copy is asked of its own provider. A type this build has no provider for is not ours to judge.
          if (r.type !== 'google_drive' && r.type !== 's3_compatible') return null;
          const c = await (await providerFor({ id: r.integration_id, type: r.type, config: r.config })).check(r.ref, r.size_bytes);
          return { id: r.id, state: c.state };
        }),
      );
      for (const d of done) if (d) out.push(d);
    }
  } catch (e) {
    // The provider is not connected (or refuses the token): that says nothing about the files.
    const status = e instanceof StorageError ? e.status : 502;
    return fail(status === 503 ? 503 : 502, 'تعذّر الوصول إلى مزود التخزين، فلم يُسجَّل شيء. افحص الاتصال من «عام وصحة النظام».');
  }

  const marked = await markVerified(g.account.email, out);
  if (marked === null) return fail(503, 'تعذّر تسجيل النتيجة في قاعدة البيانات.');
  const count = (s: string) => out.filter((x) => x.state === s).length;
  return Response.json(
    { checked: out.length, ok: count('ok'), missing: count('missing'), failed: count('failed') },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

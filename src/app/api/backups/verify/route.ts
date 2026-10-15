import { createHash } from 'node:crypto';
import { fail } from '@/lib/drive/guard';
import { capGuard } from '@/lib/integrations/guard';
import { serverKeyOrNull, vaultReachable } from '@/lib/integrations/vault';
import { Md5 } from '@/lib/storage/md5';
import { providerFor, StorageError } from '@/lib/storage';
import type { ProviderInfo } from '@/lib/storage/move';

// «تحقق من النسخة» (Settings_Integrations_Plan.md 7, "Verification counts"): a backup is verified
// only after its copies are read back from the backup provider and found as recorded. An export is
// read in full and its sha256 compared; for files a few of the least recently checked backup copies
// are read in full and their md5 compared with the one recorded when they were written. A copy that
// does not read back as recorded is marked failed, and the run says so.
export const maxDuration = 60;

const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const SAMPLE = 3;

export async function POST(request: Request) {
  const g = await capGuard(request, 'backups.run', true);
  if (!g.ok) return g.response;
  const key = serverKeyOrNull();
  if (!vaultReachable() || !key) return fail(503, 'خزنة الأسرار غير متاحة: مفتاح الخادم غير مضبوط.');
  const body = (await request.json().catch(() => null)) as { run?: unknown } | null;
  const run = isUuid(body?.run) ? body!.run : null;
  const db = g.db;

  try {
    // A kept export is read back whole.
    if (run) {
      const ref = await db.rpc('backup_run_ref', { p_key: key, p_run: run });
      if (ref.error) return fail(404, 'النسخة غير موجودة.');
      const r = ref.data as { kind: string; state: string; ref: string | null; checksum: string | null; integration: ProviderInfo | null };
      if (r.kind !== 'files') {
        if (!r.ref || !r.integration || !r.checksum) return fail(409, 'هذه النسخة نُزّلت ولم تُحفظ عند مزود، فلا شيء يُقرأ.');
        const res = await (await providerFor(r.integration)).open(r.ref);
        if (!res.ok) {
          await db.rpc('backup_run_verify', { p_key: key, p_run: run, p_ok: false, p_note: 'تعذّرت قراءة الملف من المزود' });
          return Response.json({ ok: false, note: 'تعذّرت قراءة الملف من المزود.' }, { headers: { 'Cache-Control': 'no-store' } });
        }
        const sha = createHash('sha256').update(new Uint8Array(await res.arrayBuffer())).digest('hex');
        const ok = sha === r.checksum;
        await db.rpc('backup_run_verify', {
          p_key: key,
          p_run: run,
          p_ok: ok,
          p_note: ok ? 'أُعيدت قراءتها من المزود وتطابقت بصمتها' : 'لم تتطابق بصمتها بعد القراءة من المزود',
        });
        return Response.json({ ok, note: ok ? 'تطابقت البصمة.' : 'لم تتطابق البصمة.' }, { headers: { 'Cache-Control': 'no-store' } });
      }
    }

    // Files: a sample of backup copies.
    const claim = await db.rpc('backup_sample_claim', { p_key: key, p_limit: SAMPLE });
    if (claim.error) return fail(403, 'لا تملك صلاحية هذا الإجراء.');
    const rows = (claim.data as { id: string; ref: string; size: number | null; checksum: string; integration: ProviderInfo }[]) ?? [];
    if (!rows.length) return Response.json({ ok: false, checked: 0, note: 'لا نسخ ملفات لفحصها بعد.' }, { headers: { 'Cache-Control': 'no-store' } });
    const results: { id: string; ok: boolean }[] = [];
    for (const row of rows) {
      let ok = false;
      try {
        const provider = await providerFor(row.integration);
        const res = await provider.open(row.ref);
        if (res.ok && res.body) {
          const md5 = new Md5();
          let n = 0;
          const reader = res.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            md5.update(value);
            n += value.length;
          }
          ok = md5.digest() === row.checksum && (row.size === null || n === Number(row.size));
        }
      } catch (e) {
        // The provider cannot be reached: that says nothing about the copies, so none is marked.
        if (e instanceof StorageError && (e.status === 503 || e.message === 'S3_UNREACHABLE' || e.message === 'NO_SECRET')) {
          return fail(503, 'تعذّر الوصول إلى مزود النسخ الاحتياطي، فلم يُعلَّم شيء.');
        }
      }
      results.push({ id: row.id, ok });
    }
    const marked = await db.rpc('backup_sample_mark', { p_key: key, p_run: run, p_results: results });
    if (marked.error) return fail(409, 'تعذّر تسجيل النتيجة.');
    const m = marked.data as { ok: number; failed: number };
    return Response.json(
      { ok: m.failed === 0, checked: m.ok + m.failed, good: m.ok, failed: m.failed },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return fail(502, 'تعذّر الفحص. لم يتغير شيء.');
  }
}

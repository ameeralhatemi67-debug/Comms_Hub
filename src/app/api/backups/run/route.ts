import { fail } from '@/lib/drive/guard';
import { capGuard } from '@/lib/integrations/guard';
import { serverKeyOrNull, vaultReachable } from '@/lib/integrations/vault';
import { providerFor } from '@/lib/storage';
import type { ProviderInfo } from '@/lib/storage/move';

// «نسخ الملفات» (Settings_Integrations_Plan.md 7): starts a files backup. The database makes one
// plan per provider that holds files with no verified copy at the backup provider (the engine's
// backup mode: incremental, the primary never changes); here the destination is asked who it is
// and how much room it has, and each plan is started. The copying itself is the move engine's run
// loop, driven by the open page through /api/storage/move, and the run is closed with
// backup_run_close when its plans have ended.
export async function POST(request: Request) {
  const g = await capGuard(request, 'backups.run', true);
  if (!g.ok) return g.response;
  const key = serverKeyOrNull();
  if (!vaultReachable() || !key) return fail(503, 'خزنة الأسرار غير متاحة: مفتاح الخادم غير مضبوط.');
  const db = g.db;

  const begun = await db.rpc('backup_run_begin', { p_kind: 'files' });
  if (begun.error) {
    const m = begun.error.message;
    const text = m.includes('BACKUP_NO_TARGET')
      ? 'لم يُحدَّد مزود للنسخ الاحتياطي بعد.'
      : m.includes('BACKUP_TARGET_NOT_READY')
        ? 'مزود النسخ الاحتياطي غير متصل: افحص اتصاله.'
        : m.includes('BACKUP_RUNNING')
          ? 'نسخة ملفات تعمل الآن. أكملها أو انتظر انتهاءها.'
          : m.includes('MOVE_PROVIDER_NOT_READY')
            ? 'أحد المزودين غير متصل: افحص اتصال التخزين أولاً.'
            : m.includes('FORBIDDEN')
              ? 'نسخ الملفات يحتاج «تشغيل النسخ الاحتياطي» و«نقل الملفات بين مزودي التخزين».'
              : 'تعذّر بدء النسخ.';
    return fail(m.includes('FORBIDDEN') ? 403 : 409, text);
  }
  const { run, moves } = begun.data as { run: string; moves: string[] };

  // The destination is asked once; every plan of the run goes there.
  const overview = await db.rpc('backup_overview');
  const target = (overview.data as { target?: { id: string } | null } | null)?.target;
  const list = await db.rpc('storage_overview');
  const info = ((list.data as { providers?: ProviderInfo[] } | null)?.providers ?? []).find((p) => p.id === target?.id);
  let account: string | null = null;
  let free: number | null = null;
  let warning: string | null = null;
  if (moves.length && info) {
    try {
      const provider = await providerFor(info);
      if (!provider.sink) throw new Error('DEST_NOT_WRITABLE');
      account = await provider.account();
      const quota = await provider.quota().catch(() => null);
      free = quota && quota.total !== null ? Math.max(0, quota.total - quota.used) : null;
      if (free === null) warning = 'لا يذكر مزود النسخ مساحته الحرة: لا يمكن التأكد من كفايتها.';
    } catch {
      warning = 'تعذّر فحص مزود النسخ الآن.';
    }
  }
  const started: string[] = [];
  for (const id of moves) {
    const noted = await db.rpc('storage_move_note', { p_key: key, p_id: id, p_free: free, p_account: account });
    if (noted.error) continue;
    const s = await db.rpc('storage_move_start', { p_id: id });
    if (!s.error) started.push(id);
  }
  return Response.json({ run, moves: started, planned: moves.length, warning }, { headers: { 'Cache-Control': 'no-store' } });
}

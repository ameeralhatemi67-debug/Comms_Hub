import { createHash } from 'node:crypto';
import { fail } from '@/lib/drive/guard';
import { capGuard } from '@/lib/integrations/guard';
import { serverKeyOrNull, vaultReachable } from '@/lib/integrations/vault';
import { buildExport, exportFileName, ExportTooLarge, type TablePlan } from '@/lib/backups/export';
import { providerFor } from '@/lib/storage';
import type { ProviderInfo } from '@/lib/storage/move';

// «تصدير» in Settings, backups tab (Settings_Integrations_Plan.md 7): the records or the settings
// of the Hub as one file. The database decides the list of tables and who may (backups.run);
// the file is kept at the backup provider when one is set, read back and compared by its sha256,
// and handed to the person. Nothing private is in it (src/lib/backups/export.ts). Only the last
// few exports are kept (the policy's retention count); older ones go to the provider's trash.
export const maxDuration = 60;

const PART = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const g = await capGuard(request, 'backups.run', true);
  if (!g.ok) return g.response;
  const key = serverKeyOrNull();
  if (!vaultReachable() || !key) return fail(503, 'خزنة الأسرار غير متاحة: مفتاح الخادم غير مضبوط.');
  const body = (await request.json().catch(() => null)) as { kind?: unknown } | null;
  const kind = body?.kind === 'config' ? 'config' : body?.kind === 'database' ? 'database' : null;
  if (!kind) return fail(400, 'اختر ما يُصدَّر.');
  const db = g.db;

  const begun = await db.rpc('backup_run_begin', { p_kind: kind });
  if (begun.error) return fail(begun.error.message.includes('FORBIDDEN') ? 403 : 409, errorText(begun.error.message));
  const run = (begun.data as { run: string }).run;
  const finish = (ok: boolean, o: { items?: number; size?: number; sha?: string | null; integration?: string | null; ref?: string | null; tables?: unknown; note?: string | null }) =>
    db.rpc('backup_run_finish', {
      p_key: key,
      p_run: run,
      p_ok: ok,
      p_items: o.items ?? 0,
      p_size: o.size ?? 0,
      p_checksum: o.sha ?? null,
      p_integration: o.integration ?? null,
      p_ref: o.ref ?? null,
      p_tables: o.tables ?? null,
      p_note: o.note ?? null,
    });

  try {
    const plan = await db.rpc('backup_export_plan', { p_kind: kind });
    if (plan.error) throw new Error(plan.error.message);
    const built = await buildExport(
      { kind, takenAt: new Date().toISOString(), takenBy: g.account.email, run },
      {
        plan: plan.data as TablePlan[],
        page: async (table, offset, limit) => {
          const r = await db.rpc('backup_export_page', { p_kind: kind, p_table: table, p_offset: offset, p_limit: limit });
          if (r.error) throw new Error(r.error.message);
          return (r.data as unknown[]) ?? [];
        },
      },
    );

    // Kept at the backup provider, if there is one: written, read back, and compared.
    let kept: { integration: string; ref: string } | null = null;
    let verified: boolean | null = null;
    const overview = await db.rpc('backup_overview');
    const target = (overview.data as { target?: { id: string; state: string } | null } | null)?.target;
    if (target && target.state === 'connected') {
      const list = await db.rpc('storage_overview');
      const info = ((list.data as { providers?: ProviderInfo[] } | null)?.providers ?? []).find((p) => p.id === target.id);
      if (info) {
        try {
          const provider = await providerFor(info);
          const sink = provider.sink?.();
          if (sink) {
            let state = await sink.begin({ key: `backups/${kind}/${run}.json.gz`, name: `${kind}-${run}.json.gz`, mimeType: 'application/gzip', size: built.bytes.length });
            for (let at = 0; at < built.bytes.length; at += sink.partSize) {
              state = await sink.put(state, at, built.bytes.subarray(at, at + sink.partSize), at + sink.partSize >= built.bytes.length);
            }
            const fin = await sink.finish(state);
            kept = { integration: target.id, ref: fin.ref };
            const res = await provider.open(fin.ref);
            const back = createHash('sha256').update(new Uint8Array(await res.arrayBuffer())).digest('hex');
            verified = res.ok && back === built.sha256;
          }
        } catch {
          kept = null; // the file is still handed over below; the run says it was not kept
        }
      }
    }
    const done = await finish(true, {
      items: built.items,
      size: built.bytes.length,
      sha: built.sha256,
      integration: kept?.integration ?? null,
      ref: kept?.ref ?? null,
      tables: built.tables,
      note: kept ? null : 'لم تُحفظ عند مزود: نُزّلت فقط',
    });
    if (done.error) throw new Error(done.error.message);
    if (kept) {
      await db.rpc('backup_run_verify', {
        p_key: key,
        p_run: run,
        p_ok: verified === true,
        p_note: verified === true ? 'أُعيدت قراءتها من المزود وتطابقت بصمتها' : 'لم تتطابق بصمتها بعد القراءة من المزود',
      });
    }

    // Retention: the exports beyond the policy's count go to their provider's trash.
    const old = await db.rpc('backup_prune_claim', { p_key: key });
    const gone: string[] = [];
    for (const o of ((old.data as { id: string; ref: string; integration: ProviderInfo }[] | null) ?? []).slice(0, 20)) {
      try {
        await (await providerFor(o.integration)).trash(o.ref);
        gone.push(o.id);
      } catch {
        // stays listed; the next export tries again
      }
    }
    if (gone.length) await db.rpc('backup_prune_mark', { p_key: key, p_ids: gone });

    const takenAt = new Date().toISOString();
    return new Response(built.bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="${exportFileName(kind, takenAt)}"`,
        'Cache-Control': 'no-store',
        'X-Backup-Run': run,
        'X-Backup-Kept': kept ? '1' : '0',
        'X-Backup-Verified': verified === null ? '' : verified ? '1' : '0',
        'X-Backup-Sha256': built.sha256,
        'X-Backup-Items': String(built.items),
      },
    });
  } catch (e) {
    const code = e instanceof ExportTooLarge ? 'BACKUP_TOO_LARGE' : 'BACKUP_FAILED';
    await finish(false, { note: code });
    return fail(e instanceof ExportTooLarge ? 413 : 502, errorText(code));
  }
}

function errorText(m: string) {
  if (m.includes('BACKUP_RUNNING')) return 'نسخة من هذا النوع تعمل الآن. انتظر انتهاءها.';
  if (m.includes('BACKUP_DISABLED')) return 'هذا النوع من النسخ موقوف في السياسة.';
  if (m.includes('BACKUP_TOO_LARGE')) return 'التصدير أكبر مما يبنيه الخادم في الذاكرة. استعمل نسخ مزود قاعدة البيانات الاحتياطية.';
  if (m.includes('FORBIDDEN')) return 'لا تملك صلاحية تشغيل النسخ الاحتياطي.';
  return 'تعذّر التصدير. لم يتغير شيء.';
}

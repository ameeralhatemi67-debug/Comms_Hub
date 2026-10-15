import { fail } from '@/lib/drive/guard';
import { capGuard } from '@/lib/integrations/guard';
import { moveError } from '@/lib/integrations/rules';
import { recordHealthById, serverKeyOrNull, vaultReachable } from '@/lib/integrations/vault';
import { providerFor } from '@/lib/storage';
import { runBatch, type ProviderInfo } from '@/lib/storage/move';

// The move engine's door (Settings_Integrations_Plan.md 6.3). Everything here needs
// «نقل الملفات بين مزودي التخزين» (storage.migrate), and the database decides again on every
// call: plan (the dry run), start, pause, cancel, retry, run one batch, retire the held
// sources. A run is driven by the open page, one batch per request; the state is in the
// database, so closing the page only pauses it.
export const maxDuration = 60;

type Body = {
  action?: unknown;
  id?: unknown;
  source?: unknown;
  dest?: unknown;
  scope?: { kind?: unknown; folderId?: unknown; assetIds?: unknown };
  mode?: unknown;
  label?: unknown;
  holdDays?: unknown;
};

const noStore = { 'Cache-Control': 'no-store' };
const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const RETIRE_BUDGET_MS = 30_000;

export async function POST(request: Request) {
  const g = await capGuard(request, 'storage.migrate', true);
  if (!g.ok) return g.response;
  const key = serverKeyOrNull();
  if (!vaultReachable() || !key) return fail(503, 'خزنة الأسرار غير متاحة: مفتاح الخادم غير مضبوط.');

  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || typeof body.action !== 'string') return fail(400, 'طلب غير صالح.');
  const db = g.db;
  const dbFail = (message: string) => fail(message.includes('FORBIDDEN') ? 403 : 409, moveError(message));
  const id = isUuid(body.id) ? body.id : null;

  if (body.action === 'plan') {
    if (!isUuid(body.source) || !isUuid(body.dest)) return fail(400, 'اختر المصدر والهدف.');
    const kind = body.scope?.kind === 'mail' ? 'mail' : body.scope?.kind === 'library' ? 'library' : null;
    if (!kind) return fail(400, 'اختر ما يُنقل.');
    const assetIds = Array.isArray(body.scope?.assetIds) ? (body.scope!.assetIds as unknown[]).filter(isUuid) : [];
    const scope: Record<string, unknown> = { kind };
    if (isUuid(body.scope?.folderId)) scope.folder_id = body.scope!.folderId;
    if (assetIds.length) scope.asset_ids = assetIds.slice(0, 500);
    const hold = Number(body.holdDays);
    const made = await db.rpc('storage_move_plan', {
      p_source: body.source,
      p_dest: body.dest,
      p_scope: scope,
      p_mode: body.mode === 'copy' ? 'copy' : 'move',
      p_label: typeof body.label === 'string' ? body.label : null,
      p_hold_days: Number.isFinite(hold) ? Math.trunc(hold) : 14,
    });
    if (made.error) return dbFail(made.error.message);
    const planId = String(made.data);

    // The dry run's last part: ask the destination who it is and how much room it has.
    const overview = await db.rpc('storage_overview');
    const dest = ((overview.data as { providers?: ProviderInfo[] } | null)?.providers ?? []).find((p) => p.id === body.dest);
    let checked = false;
    let warning: string | null = null;
    try {
      if (!dest) throw new Error('INT_NOT_FOUND');
      const provider = await providerFor(dest);
      if (!provider.sink) throw new Error('DEST_NOT_WRITABLE');
      const [account, quota] = await Promise.all([provider.account(), provider.quota().catch(() => null)]);
      const free = quota && quota.total !== null ? Math.max(0, quota.total - quota.used) : null;
      const noted = await db.rpc('storage_move_note', { p_key: key, p_id: planId, p_free: free, p_account: account });
      checked = !noted.error;
      if (free === null) warning = 'لا يذكر المزود الهدف مساحته الحرة: لا يمكن التأكد من كفايتها قبل البدء.';
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      warning = m === 'DEST_NOT_WRITABLE' ? 'المزود الهدف لا يقبل الكتابة من الخادم.' : 'تعذّر فحص المزود الهدف الآن: أعد حساب الخطة بعد فحص الاتصال.';
      if (dest) await recordHealthById(dest.id, false, 'PLAN_CHECK').catch(() => undefined);
    }
    return Response.json({ id: planId, checked, warning }, { headers: noStore });
  }

  if (!id) return fail(400, 'طلب غير صالح.');

  if (body.action === 'start' || body.action === 'resume') {
    const { error } = await db.rpc('storage_move_start', { p_id: id });
    return error ? dbFail(error.message) : Response.json({ ok: true }, { headers: noStore });
  }
  if (body.action === 'pause') {
    const { error } = await db.rpc('storage_move_pause', { p_id: id });
    return error ? dbFail(error.message) : Response.json({ ok: true }, { headers: noStore });
  }
  if (body.action === 'retry') {
    const { data, error } = await db.rpc('storage_move_retry', { p_id: id });
    return error ? dbFail(error.message) : Response.json({ ok: true, retried: Number(data ?? 0) }, { headers: noStore });
  }

  if (body.action === 'cancel') {
    const { data, error } = await db.rpc('storage_move_cancel', { p_id: id });
    if (error) return dbFail(error.message);
    // Partial uploads at the destination are discarded; what was already moved stays moved.
    const out = data as { dest?: ProviderInfo; sinks?: Record<string, unknown>[] } | null;
    let aborted = 0;
    if (out?.dest && out.sinks?.length) {
      try {
        const sink = (await providerFor(out.dest)).sink?.();
        for (const s of out.sinks) {
          await sink?.abort(s).catch(() => undefined);
          aborted++;
        }
      } catch {
        // The destination is unreachable: its stale uploads are the store's to expire.
      }
    }
    return Response.json({ ok: true, aborted }, { headers: noStore });
  }

  if (body.action === 'run') {
    try {
      const result = await runBatch({ db, key, provider: providerFor }, id);
      return Response.json(result, { headers: noStore });
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      if (m.includes('FORBIDDEN') || m.includes('MOVE_')) return dbFail(m);
      return fail(502, 'تعذّر تنفيذ الدفعة. لم يُفقد شيء: أعد المحاولة.');
    }
  }

  if (body.action === 'retire') {
    // Separate from the move and hold-confirmed in the page: trashes the held source copies
    // at the source provider (recoverable there), then marks them retired. The database
    // refuses while the plan's hold is not over and for any copy that is not a replica of a
    // verified primary.
    const started = Date.now();
    let retired = 0;
    let remaining = 0;
    while (Date.now() - started < RETIRE_BUDGET_MS) {
      const claim = await db.rpc('storage_retire_claim', { p_key: key, p_id: id, p_limit: 10 });
      if (claim.error) return dbFail(claim.error.message);
      const c = claim.data as { source: ProviderInfo; items: { id: string; ref: string }[] };
      if (!c.items.length) break;
      let provider;
      try {
        provider = await providerFor(c.source);
      } catch {
        return fail(503, 'تعذّر الوصول إلى مزود المصدر، فلم تُحَل نسخة إلى التقاعد.');
      }
      const done: string[] = [];
      for (const item of c.items) {
        try {
          await provider.trash(item.ref);
          done.push(item.id);
        } catch {
          // One copy that will not go to the trash is left as a replica; the rest continue.
        }
      }
      if (!done.length) {
        remaining = c.items.length;
        break;
      }
      const marked = await db.rpc('storage_retire_mark', { p_key: key, p_id: id, p_ids: done });
      if (marked.error) return dbFail(marked.error.message);
      retired += Number(marked.data ?? 0);
    }
    return Response.json({ retired, remaining }, { headers: noStore });
  }

  return fail(400, 'إجراء غير معروف.');
}
